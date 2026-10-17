/**
 * LA NATURE DEVINÉE, LES REPÈRES DES MENUISERIES, L'AVANT ET L'APRÈS —
 * demandes du patron (points 1, 2 et 3 tirés du dossier d'architecte) :
 *   1. les repères P1, F1… sur le plan, qui renvoient au carnet ;
 *   2. la nature d'un mur devinée depuis son épaisseur, corrigeable ;
 *   3. les plans « état existant » et « projet » tirés des murs à démolir et
 *      à créer.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import { devinerLesNatures, devinerNature, mursDeLaPhase } from '../src/geometry/natureMurs';
import { porteurDe } from '../src/geometry/poche';
import { appartementExemple } from '../src/data/exemple';
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1', ...extra,
});
// Une boîte de 4 × 3 coupée par une cloison en x = 2.
const BOITE: WallSeg[] = [
  mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0),
  mur('c', 2, 0, 2, 3),
];

describe('2. la nature devinée', () => {
  it('l’épaisseur parle : 7 cm une cloison, 20 cm de la maçonnerie, 14 rien', () => {
    expect(devinerNature({ ...BOITE[4], epaisseur: 0.07 }, BOITE)).toBe('cloison');
    expect(devinerNature({ ...BOITE[4], epaisseur: 0.2 }, BOITE)).toBe('porteur');
    expect(devinerNature({ ...BOITE[4], epaisseur: 0.14 }, BOITE)).toBeNull();
  });

  it('une façade est de la maçonnerie ; un refend d’épaisseur inconnue, on ne sait pas', () => {
    expect(devinerNature(BOITE[0], BOITE)).toBe('porteur');
    expect(devinerNature(BOITE[4], BOITE)).toBeNull();
  });

  it('marque ce qu’elle devine, et ne touche jamais une nature choisie', () => {
    const murs = devinerLesNatures([...BOITE.slice(0, 4), { ...BOITE[4], epaisseur: 0.07 }]);
    expect(murs[4]).toMatchObject({ nature: 'cloison', natureDevinee: true });
    expect(murs[0]).toMatchObject({ nature: 'porteur', natureDevinee: true });
    const choisie = devinerLesNatures([{ ...BOITE[0], nature: 'doublage' }, ...BOITE.slice(1)]);
    expect(choisie[0].nature).toBe('doublage');
    expect(choisie[0].natureDevinee).toBeUndefined();
  });

  it('l’épaisseur dite reprend la nature devinée ; le choix efface la marque', () => {
    useScanStore.getState().reset();
    useScanStore.setState({ walls: BOITE, openings: [], rooms: [] } as never);
    useScanStore.getState().setEpaisseurMur('c', 0.07);
    let c = useScanStore.getState().walls.find((w) => w.id === 'c')!;
    expect(c).toMatchObject({ nature: 'cloison', natureDevinee: true });
    useScanStore.getState().setEpaisseurMur('c', 0.14);
    c = useScanStore.getState().walls.find((w) => w.id === 'c')!;
    expect(c.nature).toBeUndefined();
    useScanStore.getState().setEpaisseurMur('c', 0.07);
    useScanStore.getState().setNatureMur('c', 'cloison');
    c = useScanStore.getState().walls.find((w) => w.id === 'c')!;
    expect(c.nature).toBe('cloison');
    expect(c.natureDevinee).toBeUndefined();
  });

  it('« Deviner pour tout le plan » compte ses murs et s’annule', () => {
    useScanStore.getState().reset();
    useScanStore.setState({ walls: BOITE, openings: [], rooms: [] } as never);
    // Les quatre façades.
    expect(useScanStore.getState().devinerLesNaturesDuPlan()).toBe(4);
    expect(useScanStore.getState().devinerLesNaturesDuPlan()).toBe(0);
    useScanStore.getState().undo();
    expect(useScanStore.getState().walls.every((w) => !w.nature)).toBe(true);
  });
});

describe('3. l’état existant et le projet', () => {
  const MURS: WallSeg[] = [
    ...BOITE.slice(0, 4),
    mur('c', 2, 0, 2, 3, { nature: 'demolir' }),
    mur('neuf', 0, 1.5, 2, 1.5, { nature: 'creer' }),
  ];
  const porte = { id: 'p', type: 'door', a: { x: 2, z: 1 }, b: { x: 2, z: 1.8 }, height: 2.04, yCenter: 1.02 } as WallSeg;

  it('avant : le mur à créer n’est pas là ; la porte du mur à démolir, si', () => {
    const m = mursDeLaPhase(MURS, [porte], 'existant', porteurDe);
    expect(m.walls.find((w) => w.id === 'neuf')!.nature).toBe('absent');
    expect(m.walls.find((w) => w.id === 'c')!.nature).toBe('demolir');
    expect(m.openings).toHaveLength(1);
  });

  it('après : le mur démoli ne laisse que ses tirets, et sa porte part avec lui', () => {
    const m = mursDeLaPhase(MURS, [porte], 'projet', porteurDe);
    expect(m.walls.find((w) => w.id === 'c')!.nature).toBe('fantome');
    expect(m.walls.find((w) => w.id === 'neuf')!.nature).toBe('creer');
    expect(m.openings).toHaveLength(0);
  });
});

describe('1 et 3 dans le dossier PDF', () => {
  const latin1 = (b: Uint8Array) => {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  };
  const ex = appartementExemple();
  const dossier = (walls: WallSeg[], metre: boolean) =>
    latin1(
      buildScanPdf(
        { name: 'Exemple', walls, openings: ex.openings, objects: [], rooms: ex.rooms, roomNames: {}, fixtures: [] } as never,
        false,
        { metre, surfaces: true } as never,
      ),
    );

  it('le plan coté porte les repères du carnet — seulement avec le carnet', () => {
    const avec = dossier(ex.walls as WallSeg[], true).split('(FEUILLE)')[0];
    for (const r of ['(P1)', '(F1)', '(B1)']) expect(avec).toContain(r);
    const sans = dossier(ex.walls as WallSeg[], false).split('(FEUILLE)')[0];
    expect(sans).not.toContain('(F1)');
  });

  it('un mur à démolir ou à créer ajoute l’état existant et le projet', () => {
    const travaux = (ex.walls as WallSeg[]).map((w) =>
      w.id.startsWith('bureau-est') ? { ...w, nature: 'demolir' as const } : w,
    );
    const pdf = dossier(travaux, false);
    expect(pdf).toMatch(/\(.tat existant\)/);
    expect(pdf).toContain('(Projet)');
    expect(pdf).toContain('(Mur démoli)'.replace('é', String.fromCharCode(0xe9)));
    expect(dossier(ex.walls as WallSeg[], false)).not.toContain('(Projet)');
  });
});

describe('1. les repères à l’écran', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const TestRenderer = require('react-test-renderer');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { FloorplanEditor } = require('../src/components/FloorplanEditor');
  const { act } = TestRenderer;

  const reperes = (allume: boolean) => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().ouvrirExemple();
      useScanStore.getState().setShowReperesBaies(allume);
    });
    let t: { root: { findAll: (f: (n: { props: Record<string, unknown> }) => boolean) => unknown[]; findAllByType: (x: unknown) => { props: Record<string, (...a: unknown[]) => void> }[] }; unmount: () => void };
    act(() => {
      t = TestRenderer.create(React.createElement(FloorplanEditor, { editable: false, showMeasures: true, selectedWallId: null, onSelectWall: () => {} }));
    });
    act(() => {
      const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
    });
    const n = t!.root.findAll((x) => typeof x.props.testID === 'string' && String(x.props.testID).startsWith('repere-')).length;
    act(() => t.unmount());
    return n;
  };

  it('le calque « Repères des menuiseries » les pose, éteint par défaut', () => {
    expect(reperes(false)).toBe(0);
    expect(reperes(true)).toBeGreaterThanOrEqual(appartementExemple().openings.length);
  });
});
