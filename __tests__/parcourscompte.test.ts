/**
 * DU PREMIER PLAN AU PLAN PAYE, ET RETOUR APRES REINSTALLATION.
 *
 * Septieme parcours complet, sur le domaine ou une erreur coute un client
 * ou de l'argent. Chaque regle a son banc ; celui-ci suit LA VIE D'UN
 * ABONNE, parce que c'est l'enchainement qui decide de ce qu'il voit :
 *
 *   il essaie — un plan gratuit, et le verrou tombe ;
 *   il paie — le verrou se leve, et l'echeance s'affiche ;
 *   son telephone tombe a l'eau — il en rachete un, se reconnecte, et doit
 *   retrouver SES plans et SON abonnement sans repasser a la caisse.
 *
 * LA DERNIERE ETAPE EST CELLE QUI FACHE. Un client qui a paye et qui doit
 * repayer ne revient pas ; un client qui retrouve tout en trente secondes
 * le raconte. Et entre les deux, l'application n'a qu'une chance : le
 * premier lancement apres reinstallation.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

let mockMarqueur: { compte: string; plans: number; pro?: string } | null = null;
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => mockMarqueur),
  ecrireMarqueur: jest.fn(async (m: { compte: string; plans: number }) => {
    mockMarqueur = m;
  }),
  connexionApple: jest.fn(async () => ({ id: 'A1', prenom: 'Jé' })),
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => ({
    expiration: Date.now() + 30 * 86400000,
    reconduit: true,
  })),
}));

import { PLANS_GRATUITS, useAccountStore } from '../src/store/accountStore';

const ac = () => useAccountStore.getState();
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
    proEcheance: null,
    plansUtilises: 0,
    bonusEssais: 0,
    paywallVisible: false,
    essaiEpuiseVisible: false,
    jeton: null,
  });
});

describe('le parcours complet d’un abonne', () => {
  it('essaie, se heurte au verrou, paie, et le verrou se leve', async () => {
    // 1. Il essaie : le palier gratuit est ouvert.
    expect(ac().peutCreerPlan()).toBe(true);
    for (let i = 0; i < PLANS_GRATUITS; i++) ac().noterPlanCree();

    // 2. Le verrou tombe — et il tombe AVANT le travail, pas apres : on ne
    //    laisse pas quelqu'un relever un logement pour lui dire ensuite.
    expect(ac().peutCreerPlan()).toBe(false);

    // 3. Il paie.
    await ac().acheterPro();
    expect(ac().pro).toBe(true);
    expect(ac().peutCreerPlan()).toBe(true);

    // 4. Et il voit jusqu'a quand : une echeance qu'on ne montre pas est un
    //    prelevement qu'on decouvre sur son releve bancaire.
    await ac().rafraichirEcheance();
    expect(ac().proEcheance).toBeGreaterThan(Date.now());
    // Et l'on sait s'il se reconduit : « expire le 12 » et « se renouvelle
    // le 12 » ne veulent pas dire la meme chose au moment de resilier.
    expect(ac().proReconduit).toBe(true);
  });

  it('et sur un telephone neuf, l’echeance seule rend le Pro', async () => {
    /*
      SANS QUE PERSONNE NE TOUCHE A « RESTAURER L'ACHAT ».

      Le bouton existe, et personne ne le cherche : on rouvre l'app, on la
      voit verrouillee, et l'on conclut qu'on a paye pour rien. Or l'App
      Store sait deja que l'abonnement est detenu — il suffit de lui
      demander. C'est le seul moment ou l'application a une chance de ne
      pas perdre un client qui a paye.
    */
    expect(ac().pro).toBe(false);
    await ac().rafraichirEcheance();
    expect(ac().pro).toBe(true);
    expect(ac().proVia).toBe('abonnement');
  });

  it('et son telephone tombe a l’eau : il retrouve tout', async () => {
    // Il avait paye et consomme son essai sur l'ancien appareil.
    ac().connecter(MARTIN);
    await tick();
    ac().noterPlanCree();
    await ac().acheterPro();
    await tick();
    expect(mockMarqueur).toBeTruthy();

    // NOUVEL APPAREIL : rien en memoire, mais le trousseau du compte
    // Apple suit le client, pas le telephone.
    const trousseau = mockMarqueur;
    useAccountStore.setState({
      compte: null,
      pro: false,
      proVia: null,
      plansUtilises: 0,
      jeton: null,
    });
    mockMarqueur = trousseau;

    // Il se reconnecte, et l'abonnement se restaure.
    ac().connecter(MARTIN);
    await tick();
    const rendu = await ac().restaurerPro();
    expect(rendu).toBe(true);
    expect(ac().pro).toBe(true);
    // Il ne repasse pas a la caisse, et son essai reste consomme : le
    // palier gratuit appartient au client, pas a l'appareil.
    expect(ac().peutCreerPlan()).toBe(true);
  });

  it('le code du patron deverrouille, et ne s’use pas', () => {
    ac().noterPlanCree();
    expect(ac().peutCreerPlan()).toBe(false);
    expect(ac().utiliserCode('CARIDI12')).toBe(true);
    expect(ac().pro).toBe(true);
    expect(ac().peutCreerPlan()).toBe(true);
    // Un code faux ne rend rien et ne casse rien.
    expect(ac().utiliserCode('NIMPORTEQUOI')).toBe(false);
    expect(ac().pro).toBe(true);
  });
});
