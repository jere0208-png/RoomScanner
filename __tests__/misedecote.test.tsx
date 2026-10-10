/**
 * LE TRAVAIL NON ENREGISTRÉ SE RANGE EN PARTANT.
 *
 * Relevé du patron : « lorsqu'on quitte un plan pas enregistré, on ne doit
 * plus voir le message pop-up qui embête, on doit juste afficher dans la
 * liste des plans ce plan non enregistré, avec un "autosuppression dans", et
 * il s'autosupprime dans les 12 h, si c'est un plan qui n'a jamais été créé
 * avant ; et si c'est une modification apportée à un plan existant, trouve un
 * moyen peu gênant de faire comprendre qu'il faut sauvegarder son plan pour
 * ne pas risquer de le perdre. »
 *
 * Ce banc tient :
 *   — le PLAN NEUF rangé pour douze heures, sans rien coûter tant qu'on ne
 *     l'enregistre pas, et parti seul à l'échéance ;
 *   — la RETOUCHE gardée à côté du plan enregistré, qui ne bouge pas ;
 *     reprise en rouvrant, enregistrée d'un appui, jetée si on le veut ;
 *   — le compte en ligne, qui ne voit que ce qui a été enregistré ;
 *   — ce que la liste et la pastille en disent.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/net/coffrePlans', () => ({
  ...jest.requireActual('../src/net/coffrePlans'),
  deposerPlan: jest.fn(async () => true),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { deposerPlan } from '../src/net/coffrePlans';
import {
  GARDE_NON_ENREGISTRE_MS,
  useScanStore,
  type SavedScan,
} from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useAstuce } from '../src/ui/astuce';
import { delaiRestant, etatDAttente, rangerLeTravail } from '../src/ui/miseDeCote';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { SNAPSHOT_WALLS } from '../src/export/snapshotFixture';

const H = 3600 * 1000;

const enregistre = (id: string, at = Date.now()): SavedScan => ({
  id,
  name: 'Maison Dupont',
  createdAt: at,
  updatedAt: at,
  modelPath: null,
  rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
  walls: SNAPSHOT_WALLS,
  openings: [],
  objects: [],
  fixtures: [],
  photos: [],
  ceiling: [],
});

/** Un plan tracé à la main, jamais enregistré, à l'écran. */
function planNeuf() {
  useScanStore.getState().reset();
  useScanStore.setState({
    screen: 'result',
    scanName: 'Plan du 10/10/2026',
    walls: SNAPSHOT_WALLS,
    rooms: [{ id: 'r1', name: 'Séjour', floor: null } as never],
    dirty: true,
  });
}

beforeEach(() => {
  useScanStore.getState().reset();
  useScanStore.setState({ saves: [] });
  useAccountStore.setState({ plansUtilises: 0 });
  useAstuce.setState({ courante: null, file: [] });
  (deposerPlan as jest.Mock).mockClear();
});

describe('un plan neuf, quitté sans être enregistré', () => {
  it('entre dans la liste pour douze heures, sans rien demander', () => {
    planNeuf();
    const avant = Date.now();
    expect(useScanStore.getState().mettreDeCote()).toBe('nouveau');
    const st = useScanStore.getState();
    expect(st.saves).toHaveLength(1);
    const [plan] = st.saves;
    expect(plan.name).toBe('Plan du 10/10/2026');
    expect(plan.walls).toBe(SNAPSHOT_WALLS);
    expect(GARDE_NON_ENREGISTRE_MS).toBe(12 * H);
    expect(plan.supprimeLe! - avant).toBeGreaterThanOrEqual(12 * H - 50);
    expect(plan.supprimeLe! - avant).toBeLessThanOrEqual(12 * H + 50);
    // Rangé : rien ne reste « à enregistrer » derrière soi.
    expect(st.dirty).toBe(false);
    expect(st.currentSaveId).toBe(plan.id);
  });

  it('ne coûte rien tant qu’on ne l’enregistre pas', () => {
    planNeuf();
    useScanStore.getState().mettreDeCote();
    expect(useAccountStore.getState().plansUtilises).toBe(0);
  });

  it('un plan vide, ou rien de modifié : rien à ranger', () => {
    useScanStore.setState({ screen: 'result', walls: [], dirty: true });
    expect(useScanStore.getState().mettreDeCote()).toBe('rien');
    planNeuf();
    useScanStore.setState({ dirty: false });
    expect(useScanStore.getState().mettreDeCote()).toBe('rien');
    expect(useScanStore.getState().saves).toHaveLength(0);
  });

  it('rouvert, il reste à enregistrer ; enregistré, il est gardé pour de bon — et compte', () => {
    planNeuf();
    useScanStore.getState().mettreDeCote();
    const id = useScanStore.getState().saves[0].id;
    useScanStore.getState().setScreen('library');
    useScanStore.getState().openSave(id);
    expect(useScanStore.getState().dirty).toBe(true);
    useScanStore.getState().commitCurrent();
    const plan = useScanStore.getState().saves.find((s) => s.id === id)!;
    expect(plan.supprimeLe).toBeUndefined();
    expect(useAccountStore.getState().plansUtilises).toBe(1);
  });

  it('rouvert puis laissé, son délai repart', () => {
    planNeuf();
    useScanStore.getState().mettreDeCote();
    const id = useScanStore.getState().saves[0].id;
    useScanStore.setState({
      saves: useScanStore
        .getState()
        .saves.map((s) => ({ ...s, supprimeLe: Date.now() + H })),
    });
    useScanStore.getState().openSave(id);
    useScanStore.getState().mettreDeCote();
    const plan = useScanStore.getState().saves.find((s) => s.id === id)!;
    expect(plan.supprimeLe! - Date.now()).toBeGreaterThan(11 * H);
    expect(useScanStore.getState().saves).toHaveLength(1);
  });

  it('« Enregistrer le plan » depuis la liste le garde sans l’ouvrir', () => {
    planNeuf();
    useScanStore.getState().mettreDeCote();
    const id = useScanStore.getState().saves[0].id;
    useScanStore.getState().garderLePlan(id);
    expect(useScanStore.getState().saves[0].supprimeLe).toBeUndefined();
    expect(useAccountStore.getState().plansUtilises).toBe(1);
  });

  it('s’en va seul à l’échéance — pas avant, et jamais sous les yeux', () => {
    planNeuf();
    useScanStore.getState().mettreDeCote();
    useScanStore.getState().setScreen('library');
    const { purgerLesEchus } = useScanStore.getState();
    expect(purgerLesEchus(Date.now() + 11 * H)).toBe(0);
    expect(useScanStore.getState().saves).toHaveLength(1);
    // Rouvert à l'écran au moment de l'échéance : il ne part pas.
    useScanStore.getState().openSave(useScanStore.getState().saves[0].id);
    expect(purgerLesEchus(Date.now() + 13 * H)).toBe(0);
    useScanStore.getState().setScreen('library');
    expect(purgerLesEchus(Date.now() + 13 * H)).toBe(1);
    expect(useScanStore.getState().saves).toHaveLength(0);
  });

  it('ne monte pas au compte en ligne', async () => {
    planNeuf();
    useScanStore.getState().mettreDeCote();
    const id = useScanStore.getState().saves[0].id;
    await useScanStore.getState().deposerAuCompte(id, { compte: 'c', jeton: 'j' } as never);
    expect(deposerPlan).not.toHaveBeenCalled();
  });
});

describe('les modifications d’un plan enregistré', () => {
  function retouche() {
    useScanStore.setState({ saves: [enregistre('P1')] });
    useScanStore.getState().openSave('P1');
    const autres = SNAPSHOT_WALLS.slice(0, 3);
    useScanStore.setState({ walls: autres, dirty: true });
    return autres;
  }

  it('sont gardées À CÔTÉ du plan, qui ne bouge pas', () => {
    const autres = retouche();
    expect(useScanStore.getState().mettreDeCote()).toBe('retouche');
    const plan = useScanStore.getState().saves[0];
    expect(plan.walls).toBe(SNAPSHOT_WALLS);
    expect(plan.retouche!.plan.walls).toBe(autres);
    expect(plan.retouche!.jusqua - Date.now()).toBeGreaterThan(12 * H - 1000);
    expect(useScanStore.getState().saves).toHaveLength(1);
  });

  it('reviennent en rouvrant le plan, qui se rouvre « à enregistrer »', () => {
    const autres = retouche();
    useScanStore.getState().mettreDeCote();
    useScanStore.getState().setScreen('library');
    useScanStore.getState().openSave('P1');
    const st = useScanStore.getState();
    expect(st.walls).toEqual(autres);
    expect(st.dirty).toBe(true);
    st.commitCurrent();
    const plan = useScanStore.getState().saves[0];
    expect(plan.walls).toEqual(autres);
    expect(plan.retouche).toBeUndefined();
  });

  it('« Abandonner les modifications » ramène au plan enregistré, et les oublie', () => {
    retouche();
    useScanStore.getState().mettreDeCote();
    useScanStore.getState().openSave('P1');
    useScanStore.getState().revertCurrent();
    expect(useScanStore.getState().walls).toEqual(SNAPSHOT_WALLS);
    expect(useScanStore.getState().saves[0].retouche).toBeUndefined();
  });

  it('s’enregistrent d’un appui, ou se jettent, sans ouvrir le plan', () => {
    const autres = retouche();
    useScanStore.getState().mettreDeCote();
    useScanStore.getState().enregistrerRetouche('P1');
    expect(useScanStore.getState().saves[0].walls).toEqual(autres);
    expect(useScanStore.getState().saves[0].retouche).toBeUndefined();

    retouche();
    useScanStore.getState().mettreDeCote();
    useScanStore.getState().jeterRetouche('P1');
    expect(useScanStore.getState().saves[0].walls).toEqual(SNAPSHOT_WALLS);
    expect(useScanStore.getState().saves[0].retouche).toBeUndefined();
  });

  it('passées douze heures, elles s’en vont — le plan reste', () => {
    retouche();
    useScanStore.getState().mettreDeCote();
    useScanStore.getState().setScreen('library');
    useScanStore.getState().purgerLesEchus(Date.now() + 13 * H);
    const st = useScanStore.getState();
    expect(st.saves).toHaveLength(1);
    expect(st.saves[0].retouche).toBeUndefined();
    expect(st.saves[0].walls).toBe(SNAPSHOT_WALLS);
  });

  it('le compte en ligne ne reçoit que le plan enregistré', async () => {
    retouche();
    useScanStore.getState().mettreDeCote();
    await useScanStore.getState().deposerAuCompte('P1', { compte: 'c', jeton: 'j' } as never);
    const envoi = (deposerPlan as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(envoi.contenu).retouche).toBeUndefined();
  });

  it('la pastille le dit en passant, avec de quoi enregistrer', () => {
    const autres = retouche();
    rangerLeTravail();
    const a = useAstuce.getState().courante!;
    expect(a.texte).toMatch(/enregistrez-les pour ne pas les perdre/);
    expect(a.action?.label).toBe('Enregistrer');
    a.action!.faire();
    expect(useScanStore.getState().saves[0].walls).toEqual(autres);
  });

  it('un plan neuf, lui, ne lève aucune pastille : la liste suffit', () => {
    planNeuf();
    rangerLeTravail();
    expect(useAstuce.getState().courante).toBeNull();
    expect(useScanStore.getState().saves).toHaveLength(1);
  });
});

describe('ce que la liste en dit', () => {
  it('le délai restant, en clair', () => {
    const t = 1_000_000;
    expect(delaiRestant(t + 12 * H, t)).toBe('12 h 00');
    expect(delaiRestant(t + 11 * H + 52 * 60000 + 30000, t)).toBe('11 h 52');
    expect(delaiRestant(t + 38 * 60000 + 10, t)).toBe('38 min');
    expect(delaiRestant(t + 20000, t)).toBe('moins d’une minute');
  });

  it('« autosuppression dans » pour un plan neuf, « perdues dans » pour des modifications', () => {
    const t = Date.now();
    expect(etatDAttente({ ...enregistre('a'), supprimeLe: t + 3 * H }, t)!.texte).toBe(
      'Non enregistré · autosuppression dans 3 h 00',
    );
    const r = etatDAttente(
      { ...enregistre('b'), retouche: { at: t, jusqua: t + 5 * 60000, plan: enregistre('b') } },
      t,
    )!;
    expect(r.sorte).toBe('retouche');
    expect(r.texte).toBe('Modifications non enregistrées · perdues dans 5 min');
    expect(etatDAttente(enregistre('c'), t)).toBeNull();
  });

  it('la ligne de « Mes plans » porte l’autosuppression', () => {
    jest.useFakeTimers();
    useScanStore.setState({
      screen: 'library',
      saves: [{ ...enregistre('N1'), supprimeLe: Date.now() + 2 * H + 30 * 60000 + 5000 }],
    });
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<LibraryScreen />);
    });
    const mots = tree.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(mots).toContain('Non enregistré · autosuppression dans 2 h 30');
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});
