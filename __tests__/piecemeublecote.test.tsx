/**
 * LA PIÈCE ET LE MEUBLE, AUX COTES DU MÈTRE — comme le mur neuf.
 *
 * Relevé du patron, après le mur : « fais pareil pour la sélection d'une
 * pièce et des meubles ».
 *
 *   — COUPER UNE PIÈCE (« Scinder » devenu « Couper ») : la cloison tombait
 *     au milieu, sans rien demander. On donne le sens, la cote au nu et
 *     l'épaisseur.
 *   — PLACER UN MEUBLE : « le lit à quarante centimètres du mur » se tapait
 *     en quarante appuis sur une flèche d'un centimètre. On tape la cote.
 *   — DUPLIQUER UN MEUBLE : quatre chaises, deux chevets — un geste, une
 *     annulation.
 *   — L'ÉPAISSEUR DE CHAQUE MUR compte aussi pour les meubles : contre une
 *     cloison de sept, le meuble vient au nu de la cloison, pas à sept
 *     centimètres de lui.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  WALL_T,
  castToWall,
  centrePourEcart,
  coupeDePiece,
  coupeParDefaut,
  dimensionsDeCoupe,
  ecartsAuxMurs,
  pushOutOfWalls,
  roomParts,
  type WallSeg,
} from '../src/geometry/floorplan';
import { CoupeSheet } from '../src/components/MurNeufSheet';
import { ObjectBar } from '../src/components/ObjectBar';
import { useScanStore } from '../src/store/scanStore';
import { light } from '../src/theme';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
  ...extra,
});
const proche = (x: number, y: number, tol = 1e-6) => expect(Math.abs(x - y)).toBeLessThan(tol);

/** Une chambre de 5 × 4 m d'axe en axe, murs de 14 cm. */
const CHAMBRE = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];
const piece = () => roomParts(CHAMBRE, [{ id: 'r1', wallIds: CHAMBRE.map((w) => w.id) } as never])[0];

describe('couper une pièce à la cote', () => {
  it('donne ses deux dimensions au nu', () => {
    const d = dimensionsDeCoupe(piece())!;
    proche(d.longueur, 5 - WALL_T);
    proche(d.largeur, 4 - WALL_T);
  });

  it('« dans la longueur, à 1,20 m du mur » : du nu du mur au nu de la cloison', () => {
    const seg = coupeDePiece(piece(), { sens: 'longueur', depuis: 1.2, epaisseur: 0.07 })!;
    // La cloison court d'un grand mur à l'autre, perpendiculaire à la longueur.
    proche(seg.a.x, seg.b.x);
    proche(Math.abs(seg.a.z - seg.b.z), 4);
    // Son axe : nu du mur (7 cm) + 1,20 m + demi-cloison (3,5 cm).
    const x = seg.a.x;
    const depuisO = Math.abs(x - 0) - WALL_T / 2 - 0.035;
    const depuisE = Math.abs(5 - x) - WALL_T / 2 - 0.035;
    expect(Math.min(Math.abs(depuisO - 1.2), Math.abs(depuisE - 1.2))).toBeLessThan(1e-6);
  });

  it('depuis le mur d’en face, la même cote se compte de l’autre bout', () => {
    const p = piece();
    const a = coupeDePiece(p, { sens: 'longueur', depuis: 1.2, epaisseur: 0.07 })!;
    const b = coupeDePiece(p, { sens: 'longueur', depuis: 1.2, epaisseur: 0.07, depuisAutre: true })!;
    // Symétriques autour du milieu de la pièce.
    proche(a.a.x + b.a.x, 5);
  });

  it('dans la largeur, la cloison court le long de la pièce', () => {
    const seg = coupeDePiece(piece(), { sens: 'largeur', depuis: 1, epaisseur: 0.1 })!;
    proche(seg.a.z, seg.b.z);
    proche(Math.abs(seg.a.x - seg.b.x), 5);
  });

  it('une cote trop grande ne sort pas la cloison de la pièce', () => {
    const seg = coupeDePiece(piece(), { sens: 'longueur', depuis: 40, epaisseur: 0.07 })!;
    expect(seg.a.x).toBeGreaterThan(0);
    expect(seg.a.x).toBeLessThan(5);
  });

  it('propose d’abord le milieu, au nu', () => {
    // Arrondie au centimètre.
    proche(coupeParDefaut(piece(), 'longueur', 0.07), (5 - WALL_T) / 2 - 0.035, 0.006);
  });

  it('le magasin pose la cloison à son épaisseur, et la pièce devient deux', () => {
    useScanStore.setState({
      walls: CHAMBRE.map((w) => ({ ...w, roomId: undefined })),
      rooms: [],
      dirty: false,
    } as never);
    // La pièce telle que la détection la trouve, comme après un relevé.
    useScanStore.getState().redetectRooms();
    expect(useScanStore.getState().rooms).toHaveLength(1);
    const id = useScanStore.getState().rooms[0].id;
    const ok = useScanStore.getState().couperPiece(id, { sens: 'longueur', depuis: 1.2, epaisseur: 0.07 });
    expect(ok).toBe(true);
    const st = useScanStore.getState();
    const cloison = st.walls.find((w) => w.id.startsWith('cl-'))!;
    expect(cloison.epaisseur).toBe(0.07);
    expect(st.rooms.length).toBeGreaterThanOrEqual(2);
  });
});

describe('placer un meuble au centimètre', () => {
  const box = { width: 1.6, depth: 2, yaw: 0 };
  const centre = { x: 2, z: 2 };

  it('mesure ses quatre bords au nu des murs d’en face', () => {
    const e = ecartsAuxMurs(centre, box, CHAMBRE);
    const parDir = (dx: number, dz: number) =>
      e.find((x) => Math.abs(x.dir.x - dx) < 1e-9 && Math.abs(x.dir.z - dz) < 1e-9)!.ecart!;
    // Vers l'est : 5 − 2 − 0,80 − 0,07 de demi-mur.
    proche(parDir(1, 0), 5 - 2 - 0.8 - WALL_T / 2);
    proche(parDir(-1, 0), 2 - 0.8 - WALL_T / 2);
    proche(parDir(0, 1), 4 - 2 - 1 - WALL_T / 2);
  });

  it('« à 40 cm du mur » : le meuble glisse le long de cet axe, et de lui seul', () => {
    const e = ecartsAuxMurs(centre, box, CHAMBRE).find((x) => x.dir.x === -1)!;
    const p = centrePourEcart(centre, e, 0.4)!;
    proche(p.z, centre.z);
    const relu = ecartsAuxMurs(p, box, CHAMBRE).find((x) => x.dir.x === -1)!;
    proche(relu.ecart!, 0.4);
    // Zéro : contre le mur.
    proche(ecartsAuxMurs(centrePourEcart(centre, e, 0)!, box, CHAMBRE).find((x) => x.dir.x === -1)!.ecart!, 0);
  });
});

describe('l’épaisseur de chaque mur compte aussi pour les meubles', () => {
  it('la cote au mur se prend au nu de CE mur', () => {
    const cloison = [mur('c', 0, -2, 0, 2, { epaisseur: 0.07 })];
    proche(castToWall({ x: 1, z: 0 }, { x: -1, z: 0 }, cloison)!, 1 - 0.035);
  });

  it('contre une cloison de sept, le meuble vient au nu de la cloison', () => {
    const cloison = [mur('c', 0, -2, 0, 2, { epaisseur: 0.07 })];
    const p = pushOutOfWalls(
      { x: 0.3, z: 0 },
      { width: 0.8, depth: 0.5, yaw: 0 },
      cloison,
      { x: 2, z: 0 },
      undefined,
      { x: 2, z: 0 },
    );
    // Demi-largeur 0,40 + demi-cloison 0,035 — et non 0,07 d'un mur moyen.
    proche(p.x, 0.435);
  });
});

describe('dupliquer un meuble', () => {
  beforeEach(() => {
    useScanStore.setState({
      walls: CHAMBRE,
      rooms: [{ id: 'r1', name: 'Chambre', wallIds: CHAMBRE.map((w) => w.id) }],
      objects: [
        {
          id: 'chaise',
          category: 'chair',
          width: 0.45,
          depth: 0.5,
          height: 0.9,
          roomId: 'r1',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.45, 2, 1],
        },
      ],
      dirty: false,
    } as never);
  });

  it('pose une copie à côté — mêmes cotes, pas par-dessus', () => {
    const id = useScanStore.getState().dupliquerMeuble('chaise')!;
    const st = useScanStore.getState();
    expect(st.objects).toHaveLength(2);
    const copie = st.objects.find((o) => o.id === id)!;
    expect(copie.width).toBe(0.45);
    expect(copie.category).toBe('chair');
    const dx = Math.abs(copie.transform[12] - 2);
    const dz = Math.abs(copie.transform[14] - 2);
    // Assez loin pour ne pas chevaucher l'original.
    expect(Math.max(dx, dz)).toBeGreaterThanOrEqual(0.45);
  });

  it('et « Annuler » la défait d’un seul appui', () => {
    useScanStore.getState().dupliquerMeuble('chaise');
    expect(useScanStore.getState().objects).toHaveLength(2);
    useScanStore.getState().undo();
    expect(useScanStore.getState().objects).toHaveLength(1);
  });
});

describe('les écrans', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('le bandeau du meuble porte « Placer » et « Dupliquer »', () => {
    const vus: string[] = [];
    const appels: string[] = [];
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ObjectBar
          object={{ id: 'o', category: 'bed', width: 1.6, depth: 2, height: 0.5, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.25, 0, 1] } as never}
          styles={{}}
          palette={light}
          onPrompt={() => {}}
          onResize={() => {}}
          onRotate={() => {}}
          onCancel={() => {}}
          onPlacer={() => appels.push('placer')}
          onDupliquer={() => appels.push('dupliquer')}
        />,
      );
    });
    for (const n of t.root.findAll((x) => typeof x.props?.accessibilityLabel === 'string' && typeof x.props?.onPress === 'function')) {
      vus.push(n.props.accessibilityLabel);
    }
    expect(vus).toContain('Placer au centimètre');
    expect(vus).toContain('Dupliquer le meuble');
    act(() => t.root.findAll((x) => x.props?.accessibilityLabel === 'Placer au centimètre' && typeof x.props?.onPress === 'function')[0].props.onPress());
    expect(appels).toEqual(['placer']);
    act(() => t.unmount());
  });

  it('la feuille « Couper la pièce » rend le sens, la cote et l’épaisseur', () => {
    const recu: unknown[] = [];
    const Cadre = () => {
      const [p, setP] = React.useState(piece() as ReturnType<typeof piece> | null);
      return <CoupeSheet part={p} onClose={() => setP(null)} onCouper={(s) => recu.push(s)} />;
    };
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Cadre />);
    });
    const parLabel = (l: string) =>
      t.root.findAll((n) => n.props?.accessibilityLabel === l && typeof n.props?.onPress === 'function')[0];
    act(() => parLabel('Couper la largeur').props.onPress());
    const champ = t.root.findAll((n) => n.props?.testID === 'champ-coupe' && typeof n.props?.onChangeText === 'function')[0];
    act(() => champ.props.onChangeText('90'));
    act(() => parLabel('Épaisseur Doublage').props.onPress());
    act(() => parLabel('Couper').props.onPress());
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(recu).toEqual([{ sens: 'largeur', depuis: 0.9, epaisseur: 0.1, depuisAutre: false }]);
    act(() => t.unmount());
  });
});
