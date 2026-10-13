/**
 * TOURNÉE N°5 — LES ÉTAGES, ROUVERTS ET RECALÉS.
 *
 * - « Nadia » : rouvrir sa maison R+1 abîmait le plan sans un mot — les
 *   meubles des deux étages, superposés, se poussaient l'un l'autre, et la
 *   fenêtre de l'étage se recalait sur l'angle du WC du dessous. Un étage
 *   interrompu, recalé et tourné, puis complété, posait sa pièce de plus à
 *   l'ancienne place. Et l'escalier était repoussé hors de ses murs, puis
 *   déduit en entier de l'entrée.
 * - « Malik » : la mezzanine de son loft flottait à 5,20 m dans l'OBJ, et
 *   perdait le relevé de son plafond.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  altitudesDesNiveaux,
  baiesHorsDesAngles,
  clampFootprint,
  niveauDe,
  roomParts,
  toFootprint,
  type WallSeg,
} from '../src/geometry/floorplan';
import { surfacesHabitables } from '../src/geometry/habitable';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  ...extra,
});
const meuble = (id: string, roomId: string, cat: string, x: number, z: number, w: number, d: number) => ({
  id,
  category: cat,
  roomId,
  width: w,
  depth: d,
  height: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});
/** Une pièce de 4 × 3 à un niveau donné. */
const piece = (p: string, n: number) => [
  mur(`${p}n`, 0, 0, 4, 0, { niveau: n }),
  mur(`${p}e`, 4, 0, 4, 3, { niveau: n }),
  mur(`${p}s`, 4, 3, 0, 3, { niveau: n }),
  mur(`${p}o`, 0, 3, 0, 0, { niveau: n }),
];

/** Une surface telle qu'iOS la livre. */
const surface = (id: string, cx: number, cz: number, length: number, alongZ = false) => ({
  id,
  type: 'wall' as const,
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});
const releve = (d = 0, l = 4, p = 3) => ({
  modelPath: '',
  surfaces: [
    surface(`n${d}`, d + l / 2, d, l),
    surface(`s${d}`, d + l / 2, d + p, l),
    surface(`w${d}`, d, d + p / 2, p, true),
    surface(`e${d}`, d + l, d + p / 2, p, true),
  ],
  objects: [],
});

beforeEach(() => {
  useScanStore.setState({
    walls: [],
    rooms: [],
    openings: [],
    objects: [],
    fixtures: [],
    ceiling: [],
    photos: [],
    saves: [],
    niveauCourant: 0,
    etageEnCours: null,
    passagesNatifs: null,
    cleDuReleve: null,
  } as never);
});

describe('rouvrir une maison à étages', () => {
  it('les meubles d’un étage ne poussent pas ceux de l’autre', () => {
    const objets = [meuble('wc', 'bas', 'toilet', 1, 1, 0.4, 0.7), meuble('lit', 'haut', 'bed', 1.2, 1.1, 1.6, 2)];
    useScanStore.setState({
      saves: [
        {
          id: 'maison',
          name: 'Maison',
          createdAt: 0,
          updatedAt: 0,
          modelPath: null,
          rooms: [
            { id: 'bas', name: 'WC', wallIds: piece('b', 0).map((w) => w.id) },
            { id: 'haut', name: 'Chambre', niveau: 1, wallIds: piece('h', 1).map((w) => w.id) },
          ],
          walls: [...piece('b', 0), ...piece('h', 1)],
          openings: [],
          objects: objets,
        },
      ] as never,
    });
    st().openSave('maison');
    for (const o of objets) {
      const rouvert = st().objects.find((x) => x.id === o.id)!;
      expect(rouvert.transform[12]).toBeCloseTo(o.transform[12], 6);
      expect(rouvert.transform[14]).toBeCloseTo(o.transform[14], 6);
    }
  });

  it('une fenêtre de l’étage ne se recale pas sur l’angle du mur du dessous', () => {
    // À l'étage, un mur long ; au rez, un mur d'angle juste sous la fenêtre.
    const murs = [
      mur('haut', 0, 0, 6, 0, { niveau: 1 }),
      mur('basLong', 0, 0, 6, 0),
      mur('basAngle', 2, 0, 2, 3),
    ];
    const fenetre = { ...mur('f', 1.9, 0, 3.1, 0, { niveau: 1 }), type: 'window' as const };
    expect(baiesHorsDesAngles([fenetre], murs)[0]).toBe(fenetre);
  });
});

describe('recaler un étage, puis le compléter', () => {
  it('les passages de l’iPhone suivent le recalage et la rotation de leur étage', () => {
    st().finalize(releve(0, 6, 5) as never);
    st().scannerUnEtage(1);
    st().finalizeEtage(releve(0, 4, 3) as never, 1);
    const avant = st().passagesNatifs!;
    expect(avant.niveau).toBe(1);
    st().recalerNiveau(1, 0.5, -0.25);
    st().tournerNiveau(1, (7 * Math.PI) / 180);
    const p = st().passagesNatifs!;
    expect(p.angle).toBeCloseTo((7 * Math.PI) / 180, 9);
    // Un passage de plus (le même relevé brut) retombe exactement sur l'étage.
    const avantMurs = st()
      .walls.filter((w) => niveauDe(w) === 1)
      .map((w) => [w.a, w.b])
      .flat();
    st().finalizeMerge(releve(0, 4, 3) as never);
    const apres = st().walls.filter((w) => niveauDe(w) === 1);
    for (const w of apres) {
      for (const q of [w.a, w.b]) {
        const proche = Math.min(...avantMurs.map((r) => Math.hypot(r.x - q.x, r.z - q.z)));
        expect(proche).toBeLessThan(0.02);
      }
    }
  });

  it('l’étage relevé a sa fenêtre de fin de scan ; décocher ses meubles ne vide pas le rez', () => {
    st().finalize({
      ...releve(0, 6, 5),
      objects: [{ id: 'canape', category: 'sofa', width: 2, depth: 0.9, height: 0.8, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0.4, 2.5, 1] }],
    } as never);
    useScanStore.setState({ arrivage: null });
    st().scannerUnEtage(1);
    st().finalizeEtage(
      {
        ...releve(0, 4, 3),
        objects: [{ id: 'lit', category: 'bed', width: 1.6, depth: 2, height: 0.5, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.25, 1.5, 1] }],
      } as never,
      1,
    );
    expect(st().arrivage).not.toBeNull();
    st().retirerMeubles();
    expect(st().objects.map((o) => o.category)).toEqual(['sofa']);
  });
});

describe('l’altitude d’un étage', () => {
  it('une mezzanine se pose sur la chambre qu’elle couvre, pas sur l’atelier en double hauteur', () => {
    const murs = [
      // L'atelier de 5 m, et la chambre de 2,40 m dans un coin.
      mur('a1', 0, 0, 10, 0, { height: 5 }),
      mur('a2', 10, 0, 10, 6, { height: 5 }),
      mur('a3', 10, 6, 0, 6, { height: 5 }),
      mur('a4', 0, 6, 0, 0, { height: 5 }),
      mur('c1', 6, 0, 6, 3, { height: 2.4 }),
      mur('c2', 6, 3, 10, 3, { height: 2.4 }),
      // La mezzanine, au-dessus de la chambre.
      mur('m1', 6.1, 0.1, 9.9, 0.1, { niveau: 1, height: 2.4 }),
      mur('m2', 9.9, 0.1, 9.9, 2.9, { niveau: 1, height: 2.4 }),
      mur('m3', 9.9, 2.9, 6.1, 2.9, { niveau: 1, height: 1.05 }),
      mur('m4', 6.1, 2.9, 6.1, 0.1, { niveau: 1, height: 1.05 }),
    ];
    expect(altitudesDesNiveaux(murs).get(1)).toBeCloseTo(2.6, 6);
  });
});

describe('l’escalier', () => {
  const esc = meuble('esc', 'entree', 'stairs', 2, 1.5, 0.9, 3.4);

  it('n’est pas repoussé hors de ses murs : il enjambe le cellier', () => {
    const f = clampFootprint(toFootprint(esc as never), piece('e', 0).slice(0, 2), { x: 1, z: 1 });
    expect(f.cx).toBe(2);
    expect(f.cz).toBe(1.5);
  });

  it('ne se déduit que pour la part qui est dans la pièce', () => {
    // L'entrée fait 4 × 3 ; l'escalier de 0,90 × 3,40 en dépasse de 0,40.
    const murs = piece('e', 0);
    const parts = roomParts(murs, [{ id: 'entree', wallIds: murs.map((w) => w.id) }]);
    const h = surfacesHabitables([{ id: 'entree', name: 'Entrée' }] as never, parts, [esc] as never);
    expect(h.pieces[0].habitable).toBeCloseTo(12 - 0.9 * 3, 2);
  });
});

describe('l’en-tête du plan', () => {
  it('dit « ≈ » quand l’habitable est à vérifier', () => {
    const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    expect(ecran).toContain("(surface && !surface.exact) || habitable.aVerifier > 0 ? '≈ ' : ''");
  });
});
