/**
 * LE COMPTE, LE QUOTA, LE VERROU — la logique qui garde le palier gratuit.
 *
 * Trois règles, chacune vérifiée ici parce qu'elle se contourne autrement :
 * un seul compte par appareil (le marqueur du trousseau refuse le second),
 * un seul plan gratuit (le compteur ne se remet pas à zéro), et le code
 * d'offre, qui passent désormais par l'App Store.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

// Le trousseau simulé : un marqueur en mémoire, comme l'appareil le ferait.
let mockMarqueur: { compte: string; plans: number; pro?: string } | null = null;
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => mockMarqueur),
  ecrireMarqueur: jest.fn(async (m: { compte: string; plans: number }) => {
    mockMarqueur = m;
  }),
  connexionApple: jest.fn(async () => ({ id: 'A1', prenom: 'Jé' })),
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => mockEcheance),
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
}));
/* Ce que l'App Store répond sur l'abonnement, réglé par chaque épreuve. */
let mockEcheance: unknown = null;

import { useAccountStore } from '../src/store/accountStore';
import { SERVEUR } from '../src/config/serveur';

/** La fusion du marqueur lit puis écrit : deux microtâches à laisser passer. */
const tick = () => new Promise((r) => setImmediate(r));

const MARTIN = {
  id: 'email:martin@exemple.fr',
  email: 'martin@exemple.fr',
  methode: 'email' as const,
};

beforeEach(() => {
  mockMarqueur = null;
  mockEcheance = null;
  useAccountStore.setState({
    charge: true,
    compte: null,
    pro: false,
    proVia: null,
    plansUtilises: 0,
    paywallVisible: false,
    essaiEpuiseVisible: false,
    jeton: null,
  });
});

/**
 * L'ESSAI GRATUIT APPARTIENT AU TÉLÉPHONE, PAS AU COMPTE.
 *
 * L'ancienne règle refusait un second compte sur le même appareil — et
 * bloquait le patron lui-même en voulant tester Google après l'e-mail. On
 * accueille désormais TOUS les comptes ; ce qui se détecte, c'est l'essai :
 * le trousseau se souvient des plans consommés par le téléphone, et un
 * nouveau compte sur un téléphone à sec voit le popup « essai déjà
 * utilisé » puis la page Pro — jamais un refus.
 */
describe('l’essai gratuit appartient au téléphone', () => {
  it('accepte un compte, puis UN AUTRE, sans jamais refuser', async () => {
    const r1 = await useAccountStore.getState().connecter(MARTIN);
    expect(r1.ok).toBe(true);
    useAccountStore.getState().deconnecter();
    const r2 = await useAccountStore
      .getState()
      .connecter({ id: 'google:autre', methode: 'google' });
    expect(r2.ok).toBe(true);
    expect(useAccountStore.getState().compte?.id).toBe('google:autre');
  });

  it('le nouveau compte hérite du compteur du téléphone — sans popup : scanner est libre', async () => {
    mockMarqueur = { compte: MARTIN.id, plans: 1 };
    const r = await useAccountStore
      .getState()
      .connecter({ id: 'google:autre', methode: 'google' });
    expect(r.ok).toBe(true);
    const s = useAccountStore.getState();
    expect(s.plansUtilises).toBe(1);
    // Le modèle « exporter et partager » : le compteur ne ferme plus rien,
    // il n'y a donc rien à annoncer.
    expect(s.peutCreerPlan()).toBe(true);
    expect(s.essaiEpuiseVisible).toBe(false);
  });

  it('ne montre AUCUN popup quand l’essai est encore là', async () => {
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(true);
    expect(useAccountStore.getState().essaiEpuiseVisible).toBe(false);
  });

  /**
   * LE PRO APPARTIENT AU COMPTE — relevé du chantier : « je me suis
   * inscrit et je suis pro directement alors que c'est un autre compte ».
   * Le trousseau retient le Pro DU compte qui l'a acquis (marqueur.compte) ;
   * un compte neuf sur le même téléphone entre gratuit, et voit le popup
   * si l'essai de l'appareil est consommé.
   */
  it('un compte NEUF n’hérite jamais du Pro d’un autre', async () => {
    mockMarqueur = { compte: MARTIN.id, plans: 1, pro: 'code' };
    const r = await useAccountStore
      .getState()
      .connecter({ id: 'google:autre', methode: 'google' });
    expect(r.ok).toBe(true);
    const s = useAccountStore.getState();
    expect(s.pro).toBe(false);
    expect(s.essaiEpuiseVisible).toBe(false);
    // Le trousseau ne porte plus le Pro de l'ancien compte : il ne doit
    // pas se réappliquer au suivant par accident.
    expect(mockMarqueur?.pro).toBeUndefined();
  });

  it('le MÊME compte retrouve son Pro en se reconnectant', async () => {
    mockMarqueur = { compte: MARTIN.id, plans: 1, pro: 'code' };
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(true);
    const s = useAccountStore.getState();
    expect(s.pro).toBe(true);
    expect(s.proVia).toBe('code');
    expect(s.essaiEpuiseVisible).toBe(false);
  });
});

describe('le compteur de plans', () => {
  it('compte, mais ne ferme plus rien : scanner est libre, exporter est Pro', () => {
    const s = useAccountStore.getState();
    expect(s.peutCreerPlan()).toBe(true);
    s.noterPlanCree();
    s.noterPlanCree();
    expect(useAccountStore.getState().plansUtilises).toBe(2);
    expect(useAccountStore.getState().peutCreerPlan()).toBe(true);
  });

  it('retient le compteur dans le trousseau : la réinstallation ne rend rien', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().noterPlanCree();
    await tick();
    expect(mockMarqueur?.plans).toBe(1);
    // « Réinstallation » : le stockage local repart de zéro, pas le
    // trousseau. Le chargement reprend le compteur du marqueur.
    useAccountStore.setState({ plansUtilises: 0 });
    await useAccountStore.getState().charger();
    expect(useAccountStore.getState().plansUtilises).toBe(1);
  });

  it('ne borne plus rien en Pro', () => {
    useAccountStore.setState({ pro: true });
    const s = useAccountStore.getState();
    s.noterPlanCree();
    s.noterPlanCree();
    expect(useAccountStore.getState().peutCreerPlan()).toBe(true);
  });
});

describe('ce que la réinstallation ne défait pas', () => {
  it('le Pro d’un abonnement survit à la réinstallation — pour SON compte', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    await useAccountStore.getState().acheterPro();
    await tick();
    expect(mockMarqueur?.pro).toBe('abonnement');
    // « Réinstallation » : stockage local vidé, trousseau intact. Le Pro
    // ne revient qu'à la RECONNEXION du compte qui l'a acquis — un
    // chargement anonyme ne donne rien à personne.
    useAccountStore.setState({ pro: false, proVia: null, compte: null });
    await useAccountStore.getState().charger();
    expect(useAccountStore.getState().pro).toBe(false);
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(true);
    expect(useAccountStore.getState().pro).toBe(true);
  });

  it('noter un plan ne fait pas tomber le Pro du trousseau', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    await useAccountStore.getState().acheterPro();
    await tick();
    useAccountStore.getState().noterPlanCree();
    await tick();
    expect(mockMarqueur?.pro).toBe('abonnement');
    expect(mockMarqueur?.plans).toBe(1);
  });
});

describe('la suppression du compte', () => {
  it('efface l’identité mais GARDE le quota consommé', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().noterPlanCree();
    await tick();
    await useAccountStore.getState().supprimerCompte();
    expect(useAccountStore.getState().compte).toBeNull();
    // Le marqueur ne porte plus d'identité…
    expect(mockMarqueur?.compte).toBe('');
    // …mais le compteur reste : supprimer-recréer ne rend pas de plan.
    expect(mockMarqueur?.plans).toBe(1);
  });

  it('autorise un NOUVEAU compte après suppression, compteur conservé', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().noterPlanCree();
    await tick();
    await useAccountStore.getState().supprimerCompte();
    const r = await useAccountStore
      .getState()
      .connecter({ id: 'email:autre@exemple.fr', methode: 'email' });
    expect(r.ok).toBe(true);
    await useAccountStore.getState().charger();
    expect(useAccountStore.getState().plansUtilises).toBe(1);
  });
});

/*
  L'INVITÉ N'EST JAMAIS PRO — relevé du patron : « le mode invité est en Pro,
  et donc pas d'intérêt de faire un compte ». L'App Store répondait pour
  l'identifiant Apple du téléphone, et la réponse passait l'application en
  Pro sans regarder qui était connecté ; la déconnexion laissait le Pro en
  place. Le Pro appartient au compte.
*/
describe('sans compte, pas de Pro', () => {
  const ABONNE = { produit: 'echoplan.pro.mensuel', expiration: Date.now() + 86400000 * 30, reconduit: true };

  it('un abonnement sur l’identifiant Apple ne fait pas de l’invité un abonné', async () => {
    mockEcheance = ABONNE;
    useAccountStore.setState({ compte: null, invite: true });
    await useAccountStore.getState().rafraichirEcheance();
    expect(useAccountStore.getState().pro).toBe(false);
    expect(useAccountStore.getState().proEcheance).toBeNull();
  });

  it('l’invité qu’une ancienne version avait écrit « Pro » ne l’est plus au démarrage', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockImplementationOnce(async () =>
      JSON.stringify({ compte: null, invite: true, pro: true, proVia: 'abonnement' }),
    );
    mockEcheance = ABONNE;
    await useAccountStore.getState().charger();
    expect(useAccountStore.getState().invite).toBe(true);
    expect(useAccountStore.getState().pro).toBe(false);
    expect(useAccountStore.getState().proVia).toBeNull();
  });

  it('se déconnecter emporte le Pro avec le compte', () => {
    useAccountStore.setState({ compte: MARTIN, pro: true, proVia: 'abonnement' });
    useAccountStore.getState().deconnecter();
    expect(useAccountStore.getState().pro).toBe(false);
    expect(useAccountStore.getState().proVia).toBeNull();
  });

  it('et se reconnecter le lui rend, si l’App Store le connaît', async () => {
    mockEcheance = ABONNE;
    await useAccountStore.getState().connecter(MARTIN);
    await tick();
    expect(useAccountStore.getState().pro).toBe(true);
  });

  it('l’invité qui veut le Pro est mené au compte, pas à la caisse', async () => {
    const native = jest.requireMock('../src/native/account');
    native.acheterAbonnement.mockClear();
    useAccountStore.setState({ compte: null, invite: true });
    useAccountStore.getState().ouvrirPaywall();
    expect(useAccountStore.getState().paywallVisible).toBe(false);
    useAccountStore.getState().ouvrirSurprise();
    expect(useAccountStore.getState().surpriseVisible).toBeFalsy();
    expect(useAccountStore.getState().paywallVisible).toBe(false);
    await useAccountStore.getState().acheterPro();
    expect(native.acheterAbonnement).not.toHaveBeenCalled();
    expect(useAccountStore.getState().pro).toBe(false);
  });
});

describe('le code promo et l’achat', () => {
  /*
    PLUS DE CODE MAISON. « CARIDI12 » donnait le Pro sans passer par l'App
    Store : la règle 3.1.1 l'interdit. Les codes d'offre se créent dans App
    Store Connect, et c'est l'App Store qui accorde l'abonnement.
  */
  it('aucun code maison : le compte ne sait plus déverrouiller tout seul', () => {
    expect((useAccountStore.getState() as unknown as Record<string, unknown>).utiliserCode).toBeUndefined();
    expect(useAccountStore.getState().pro).toBe(false);
  });

  it('un code d’offre Apple : la feuille d’Apple, puis l’abonnement relu à l’App Store', async () => {
    mockEcheance = { produit: 'echoplan.pro.mensuel', expiration: Date.now() + 86400000 * 30, reconduit: true };
    useAccountStore.setState({ compte: MARTIN, paywallVisible: true });
    await useAccountStore.getState().codeOffre();
    expect(useAccountStore.getState().pro).toBe(true);
    expect(useAccountStore.getState().proVia).toBe('abonnement');
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });

  /*
    UN ABONNEMENT RÉSILIÉ S'EN VA. L'échéance savait accorder le Pro, pas le
    reprendre : un abonné qui résiliait le gardait à vie. Seul un « aucun »
    explicite de l'App Store le retire — un silence (hors ligne) ne retire
    rien, et le Pro d'un ancien code n'en dépend pas.
  */
  it('l’App Store dit « aucun abonnement » : le Pro d’abonnement s’en va', async () => {
    useAccountStore.setState({ compte: MARTIN, pro: true, proVia: 'abonnement' });
    mockEcheance = { aucun: true };
    await useAccountStore.getState().rafraichirEcheance();
    expect(useAccountStore.getState().pro).toBe(false);
    expect(useAccountStore.getState().proVia).toBeNull();
  });

  it('mais un silence ne retire rien, ni le Pro d’un ancien code', async () => {
    useAccountStore.setState({ pro: true, proVia: 'abonnement' });
    mockEcheance = null;
    await useAccountStore.getState().rafraichirEcheance();
    expect(useAccountStore.getState().pro).toBe(true);
    useAccountStore.setState({ pro: true, proVia: 'code' });
    mockEcheance = { aucun: true };
    await useAccountStore.getState().rafraichirEcheance();
    expect(useAccountStore.getState().pro).toBe(true);
  });

  it('l’achat StoreKit passe le compte en Pro et ferme la page', async () => {
    useAccountStore.setState({ compte: MARTIN, paywallVisible: true });
    await useAccountStore.getState().acheterPro();
    expect(useAccountStore.getState().pro).toBe(true);
    expect(useAccountStore.getState().proVia).toBe('abonnement');
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });

  it('la connexion Apple crée le compte avec l’identifiant Apple', async () => {
    const r = await useAccountStore.getState().connecterApple();
    expect(r.ok).toBe(true);
    expect(useAccountStore.getState().compte?.id).toBe('apple:A1');
  });

  it('« Restaurer l’achat » redonne le Pro quand l’App Store le confirme', async () => {
    await useAccountStore.getState().restaurerPro();
    expect(useAccountStore.getState().pro).toBe(true);
    expect(useAccountStore.getState().proVia).toBe('abonnement');
  });
});

/**
 * LE MODE SERVEUR — la base OVH juge, sans jamais bloquer un chantier.
 *
 * Trois vérités à tenir : le refus du serveur est définitif (verrou en
 * base), son état enrichit le local (Pro accordé ailleurs), et son SILENCE
 * ne bloque rien — offline-first, un scan ne dépend pas du réseau.
 */
describe('le mode serveur (base OVH)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    SERVEUR.url = 'https://exemple.fr/echoplan';
    global.fetch = fetchMock as never;
    fetchMock.mockReset();
  });
  afterEach(() => {
    SERVEUR.url = '';
  });

  const reponse = (corps: unknown) =>
    Promise.resolve({ json: async () => corps } as Response);

  it('adopte le refus du serveur : le verrou vit aussi en base', async () => {
    fetchMock.mockReturnValueOnce(
      reponse({ ok: false, raison: 'Un compte a déjà été créé sur ce téléphone.' }),
    );
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(false);
    expect(r.raison).toContain('déjà été créé');
  });

  it('rapporte le Pro et le quota que la base connaît', async () => {
    fetchMock.mockReturnValueOnce(
      reponse({ ok: true, jeton: 'J1', pro: 'code', plans: 1 }),
    );
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(true);
    const s = useAccountStore.getState();
    expect(s.jeton).toBe('J1');
    expect(s.pro).toBe(true);
    expect(s.plansUtilises).toBe(1);
  });

  it('un serveur muet ne bloque rien : le local tranche', async () => {
    fetchMock.mockRejectedValueOnce(new Error('réseau'));
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(true);
    expect(useAccountStore.getState().jeton).toBeNull();
  });

  it('annonce chaque plan consommé au serveur', async () => {
    fetchMock.mockReturnValue(reponse({ ok: true }));
    useAccountStore.setState({ compte: MARTIN, jeton: 'J1' });
    useAccountStore.getState().noterPlanCree();
    await tick();
    await tick();
    const appels = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(appels.some((a) => a.action === 'plan')).toBe(true);
  });
});
