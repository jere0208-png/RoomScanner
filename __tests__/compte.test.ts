/**
 * LE COMPTE, LE QUOTA, LE VERROU — la logique qui garde le palier gratuit.
 *
 * Trois règles, chacune vérifiée ici parce qu'elle se contourne autrement :
 * un seul compte par appareil (le marqueur du trousseau refuse le second),
 * un seul plan gratuit (le compteur ne se remet pas à zéro), et le code
 * promo du patron (CARIDI12) qui déverrouille tout.
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
}));

import { PLANS_GRATUITS, useAccountStore } from '../src/store/accountStore';
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
  useAccountStore.setState({
    charge: true,
    compte: null,
    pro: false,
    proVia: null,
    plansUtilises: 0,
    paywallVisible: false,
  });
});

describe('un seul compte par appareil', () => {
  it('accepte le premier compte et pose le marqueur', async () => {
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(true);
    expect(mockMarqueur?.compte).toBe(MARTIN.id);
  });

  it('refuse un AUTRE compte sur le même téléphone, et dit pourquoi', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().deconnecter();
    const r = await useAccountStore
      .getState()
      .connecter({ id: 'email:autre@exemple.fr', methode: 'email' });
    expect(r.ok).toBe(false);
    expect(r.raison).toContain('déjà été créé');
  });

  it('laisse toujours rentrer le compte D’ORIGINE', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().deconnecter();
    const r = await useAccountStore.getState().connecter(MARTIN);
    expect(r.ok).toBe(true);
  });
});

describe('le palier gratuit', () => {
  it('offre exactement un plan', () => {
    const s = useAccountStore.getState();
    expect(PLANS_GRATUITS).toBe(1);
    expect(s.peutCreerPlan()).toBe(true);
    s.noterPlanCree();
    expect(useAccountStore.getState().peutCreerPlan()).toBe(false);
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
    expect(useAccountStore.getState().peutCreerPlan()).toBe(false);
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
  it('le Pro au code survit : il est écrit dans le trousseau', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().utiliserCode('CARIDI12');
    await tick();
    expect(mockMarqueur?.pro).toBe('code');
    // « Réinstallation » : stockage local vidé, trousseau intact.
    useAccountStore.setState({ pro: false, proVia: null });
    await useAccountStore.getState().charger();
    expect(useAccountStore.getState().pro).toBe(true);
  });

  it('noter un plan ne fait pas tomber le Pro du trousseau', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().utiliserCode('CARIDI12');
    await tick();
    useAccountStore.getState().noterPlanCree();
    await tick();
    expect(mockMarqueur?.pro).toBe('code');
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

  it('autorise un NOUVEAU compte après suppression, quota conservé', async () => {
    await useAccountStore.getState().connecter(MARTIN);
    useAccountStore.getState().noterPlanCree();
    await tick();
    await useAccountStore.getState().supprimerCompte();
    const r = await useAccountStore
      .getState()
      .connecter({ id: 'email:autre@exemple.fr', methode: 'email' });
    expect(r.ok).toBe(true);
    await useAccountStore.getState().charger();
    expect(useAccountStore.getState().peutCreerPlan()).toBe(false);
  });
});

describe('le code promo et l’achat', () => {
  it('CARIDI12 déverrouille le Pro, quelle que soit la casse', () => {
    const s = useAccountStore.getState();
    expect(s.utiliserCode('  caridi12 ')).toBe(true);
    expect(useAccountStore.getState().pro).toBe(true);
    expect(useAccountStore.getState().proVia).toBe('code');
  });

  it('un code inconnu ne déverrouille rien', () => {
    expect(useAccountStore.getState().utiliserCode('GRATUIT')).toBe(false);
    expect(useAccountStore.getState().pro).toBe(false);
  });

  it('l’achat StoreKit passe le compte en Pro et ferme la page', async () => {
    useAccountStore.setState({ paywallVisible: true });
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
    await Promise.resolve();
    const appels = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(appels.some((a) => a.action === 'plan')).toBe(true);
  });
});
