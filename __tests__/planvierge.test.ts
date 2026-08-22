/**
 * UN PLAN DESSINÉ À LA MAIN S'ENREGISTRE VRAIMENT.
 *
 * Trouvé en parcourant l'application comme un utilisateur qui la découvre :
 * on choisit « Dessiner un plan », on pose un séjour de vingt mètres carrés,
 * on touche « Enregistrer »… et RIEN n'est enregistré. La bibliothèque reste
 * vide, et le bouton disparaît quand même — l'application affirme donc que
 * le travail est sauvé alors qu'il n'existe nulle part. On quitte l'écran,
 * on a tout perdu.
 *
 * La cause tient en une ligne : « Enregistrer » recopie le plan courant DANS
 * SON ENTRÉE de bibliothèque, et un plan dessiné n'en a jamais eu. La
 * fonction sortait donc sans rien faire, puis effaçait le drapeau des
 * modifications. Seul un scan terminé créait une entrée — c'est lui qui
 * s'auto-enregistre à la fin du relevé.
 *
 * C'est le défaut le plus cher de cette application : « le seul qui coûte un
 * déplacement ». Et il emportait avec lui le palier gratuit, qui se consomme
 * précisément là où une entrée se crée : un plan dessiné ne comptait pour
 * rien, on pouvait en faire cent.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: false, bonusEssais: 0 });
  useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
});

/** Le geste complet : on dessine une pièce, on enregistre. */
const dessinerEtEnregistrer = (nom = 'Séjour') => {
  useScanStore.getState().commencerAuClavier();
  useScanStore.getState().addRoomBox(5, 4, nom);
  useScanStore.getState().commitCurrent();
  return useScanStore.getState();
};

describe('« Enregistrer » sur un plan dessiné', () => {
  it('range vraiment le plan dans la bibliothèque', () => {
    const st = dessinerEtEnregistrer();
    expect(`${st.saves.length} plan(s) rangé(s)`).toBe('1 plan(s) rangé(s)');
    // Et le plan RETENU porte le travail : quatre murs, pas une coquille.
    expect(st.saves[0].walls).toHaveLength(4);
    expect(st.saves[0].rooms).toHaveLength(1);
  });

  it('et le plan courant DEVIENT cette entrée', () => {
    const st = dessinerEtEnregistrer();
    // Sans ça, le prochain « Enregistrer » en créerait un deuxième, et la
    // bibliothèque se remplirait de copies du même plan.
    expect(st.currentSaveId).toBe(st.saves[0].id);
    expect(st.dirty).toBe(false);
    useScanStore.getState().commitCurrent();
    expect(useScanStore.getState().saves).toHaveLength(1);
  });

  it('consomme le palier gratuit, comme un scan', () => {
    dessinerEtEnregistrer();
    // « Générer un plan, c'est en garder un » : la règle ne dépend pas du
    // chemin. Un plan tracé à la main est un plan.
    expect(useAccountStore.getState().plansUtilises).toBe(1);
    expect(useAccountStore.getState().peutCreerPlan()).toBe(false);
  });

  it('mais ne le consomme qu’UNE fois, même si l’on ré-enregistre', () => {
    dessinerEtEnregistrer();
    useScanStore.getState().commitCurrent();
    useScanStore.getState().commitCurrent();
    expect(useAccountStore.getState().plansUtilises).toBe(1);
  });

  it('ne compte rien tant qu’il n’y a rien à garder', () => {
    // Un plan vide n'est pas un plan : on ne débite pas l'essai de
    // quelqu'un qui a seulement ouvert l'écran.
    useScanStore.getState().commencerAuClavier();
    useScanStore.getState().commitCurrent();
    expect(useScanStore.getState().saves).toHaveLength(0);
    expect(useAccountStore.getState().plansUtilises).toBe(0);
  });
});
