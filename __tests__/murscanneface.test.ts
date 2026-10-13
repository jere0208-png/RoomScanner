/**
 * LE TRAIT D'UN MUR SCANNÉ EST SA FACE — son épaisseur part dehors.
 *
 * RoomPlan relève la face qu'il voit. Les cotes et les surfaces d'un plan
 * scanné le savaient déjà (`longueurCotee`) ; le dessin, lui, centrait
 * l'épaisseur sur ce trait. La moitié du mur mordait dans la pièce, et tout
 * ce qui se mesure depuis le nu se trompait de sept centimètres :
 *
 *   — les élévations du PDF, trop courtes d'une épaisseur ;
 *   — le meuble calé contre le mur, arrêté à 7 cm de la vraie face ;
 *   — la baignoire de 1,70 relevée entre deux murs, recalée trop large ;
 *   — « Ajouter une pièce » contre un mur relevé : 4,04 m² pour 3,50 ;
 *   — la façade qui s'épaississait vers l'intérieur.
 *
 * Le côté du dehors est celui où n'est pas la pièce qui a relevé le mur
 * (voir `facesDesMurs`).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData } from 'react-native-room-scan';
import { wallFace } from '../src/geometry/electrical';
import {
  clampFootprint,
  coupeDePiece,
  dimensionsDeCoupe,
  facesDesMurs,
  murNeufCote,
  roomParts,
  toFootprint,
  wallQuads,
  WALL_T,
  type WallSeg,
} from '../src/geometry/floorplan';
import { calerDansLaNiche } from '../src/geometry/niche';
import { pocheDesMurs } from '../src/geometry/poche';
import { useScanStore } from '../src/store/scanStore';

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

/** Un séjour scanné de 5 × 4 : chaque trait est une face relevée. */
const SEJOUR = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];

/** Une salle de bains scannée de 1,70 × 2,40. */
const SDB = [mur('n', 0, 0, 1.7, 0), mur('e', 1.7, 0, 1.7, 2.4), mur('s', 1.7, 2.4, 0, 2.4), mur('o', 0, 2.4, 0, 0)];

const objet = (category: string, cx: number, cz: number, width: number, depth: number, height = 0.6): ObjectData =>
  ({
    id: category,
    category,
    width,
    depth,
    height,
    roomId: 'r1',
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, height / 2, cz, 1],
  }) as ObjectData;

describe('l’épaisseur part du côté où la pièce n’est pas', () => {
  it('chaque mur d’une pièce scannée a sa face sur le trait, côté pièce', () => {
    const faces = facesDesMurs(SEJOUR);
    for (const w of SEJOUR) {
      const f = faces.get(w.id)!;
      // Un côté à zéro (la pièce), l'autre à toute l'épaisseur (le dehors).
      expect(Math.min(f.plus, f.moins)).toBe(0);
      expect(Math.max(f.plus, f.moins)).toBeCloseTo(WALL_T, 9);
    }
  });

  it('un mur dessiné, ou vu de ses deux faces, reste sur son axe', () => {
    for (const extra of [{ auNu: true }, { deuxFaces: true }]) {
      const murs = SEJOUR.map((w) => ({ ...w, ...extra }));
      for (const f of facesDesMurs(murs).values()) {
        expect(f.plus).toBeCloseTo(WALL_T / 2, 9);
        expect(f.moins).toBeCloseTo(WALL_T / 2, 9);
      }
    }
  });

  it('une cloison libre au milieu de la pièce reste centrée', () => {
    const murs = [...SEJOUR, mur('c', 2.5, 0, 2.5, 2)];
    const f = facesDesMurs(murs).get('c')!;
    expect(f.plus).toBeCloseTo(WALL_T / 2, 9);
    expect(f.moins).toBeCloseTo(WALL_T / 2, 9);
  });

  it('une pièce accolée ensuite de l’autre côté n’y change rien', () => {
    // Le trait reste la face du séjour : le mur ne revient pas mordre dedans.
    const murs = [...SEJOUR, mur('b1', 5, 0, 7, 0, { roomId: 'r2' }), mur('b2', 7, 0, 7, 4, { roomId: 'r2' }), mur('b3', 7, 4, 5, 4, { roomId: 'r2' })];
    const f = facesDesMurs(murs).get('e')!;
    // Le séjour est du côté −x du mur est : n = perp(0, 1) = (−1, 0).
    expect(f.plus).toBe(0);
    expect(f.moins).toBeCloseTo(WALL_T, 9);
  });
});

describe('la façade s’épaissit vers le dehors, jamais dans la pièce', () => {
  it('le poché ne mord pas dans le séjour', () => {
    const { contours } = pocheDesMurs(SEJOUR);
    const dans = (p: { x: number; z: number }) =>
      contours.reduce((d, c) => {
        let k = d;
        for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
          if (c[i].z > p.z !== c[j].z > p.z && p.x < ((c[j].x - c[i].x) * (p.z - c[i].z)) / (c[j].z - c[i].z) + c[i].x) k = !k;
        }
        return k;
      }, false);
    for (const p of [{ x: 2.5, z: 0.01 }, { x: 4.99, z: 2 }, { x: 2.5, z: 3.99 }, { x: 0.01, z: 2 }]) {
      expect(dans(p)).toBe(false);
    }
    for (const p of [{ x: 2.5, z: -0.01 }, { x: 5.01, z: 2 }, { x: 2.5, z: 4.01 }, { x: -0.01, z: 2 }]) {
      expect(dans(p)).toBe(true);
    }
  });
});

describe('les élévations ont la longueur relevée', () => {
  it('la face intérieure d’un mur de 5,00 m mesure 5,00 m, d’angle à angle', () => {
    const quads = wallQuads(SEJOUR);
    const n = SEJOUR[0];
    const lens = [wallFace(n, quads.get('n'), 1).len, wallFace(n, quads.get('n'), -1).len];
    expect(Math.min(...lens)).toBeCloseTo(5, 6);
    expect(Math.max(...lens)).toBeCloseTo(5 + 2 * WALL_T, 6);
  });
});

describe('un meuble se cale contre la vraie face', () => {
  it('le frigo relevé entre deux murs remplit l’intervalle de trait à trait', () => {
    // Un renfoncement de 62 cm : deux joues relevées depuis la cuisine.
    const murs = [
      mur('n', 0, 0, 3, 0),
      mur('j1', 3, 0, 3, -0.6),
      mur('f', 3, -0.6, 3.62, -0.6),
      mur('j2', 3.62, -0.6, 3.62, 0),
      mur('n2', 3.62, 0, 5, 0),
      mur('e', 5, 0, 5, 3),
      mur('s', 5, 3, 0, 3),
      mur('o', 0, 3, 0, 0),
    ];
    const frigo = objet('refrigerator', 3.31, -0.3, 0.46, 0.5, 1.8);
    const cale = calerDansLaNiche(frigo, murs)!;
    expect(cale).not.toBeNull();
    // Il fallait 62 cm ; on en donnait 48, arrêté à 7 cm de chaque joue.
    expect(cale.width).toBeCloseTo(0.62, 2);
    expect(cale.transform[12]).toBeCloseTo(3.31, 2);
  });

  it('la baignoire de 1,70 entre deux murs garde ses 1,70', () => {
    const bain = objet('bathtub', 0.85, 0.36, 1.7, 0.72, 0.55);
    const f = clampFootprint(toFootprint(bain), SDB, { x: 0.85, z: 1.2 });
    // À deux millimètres de souffle près de chaque côté (voir
    // `clampFootprint`) — et non rabotée des 14 cm de deux demi-murs.
    expect(f.width).toBeGreaterThan(1.7 - 0.005);
    expect(f.cx - f.width / 2).toBeGreaterThanOrEqual(-1e-6);
    expect(f.cx + f.width / 2).toBeLessThanOrEqual(1.7 + 1e-6);
    // Et rien ne la recale dans une niche plus large qu'elle.
    const cale = calerDansLaNiche(bain, SDB);
    expect(cale === null || Math.abs(cale.width - 1.7) < 0.005).toBe(true);
  });
});

describe('« Ajouter une pièce » contre un mur relevé', () => {
  it('donne la pièce tapée, au nu : 1,75 × 2,00 = 3,50 m²', () => {
    useScanStore.setState({
      walls: SEJOUR,
      openings: [],
      objects: [],
      fixtures: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null, wallIds: SEJOUR.map((w) => w.id) }] as never,
    });
    const id = useScanStore.getState().addRoomBox(1.75, 2, 'Bureau', 'e', { auNu: true });
    const st = useScanStore.getState();
    const parts = roomParts(st.walls, st.rooms as never);
    const bureau = parts.find((p) => p.roomId === id)!;
    expect(bureau.surface!.area).toBeCloseTo(3.5, 3);
    // Son nu commence au dos du mur du séjour, à 14 cm de son trait.
    const xs = bureau.surface!.nu!.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(5 + WALL_T, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 6);
    // Et le séjour garde ses 20 m² relevés.
    expect(parts.find((p) => p.roomId === 'r1')!.surface!.area).toBeCloseTo(20, 6);
  });
});

describe('ce qu’on tape au mètre se compte depuis le trait', () => {
  it('« couper la pièce à 1,20 m » : du trait à la face de la cloison', () => {
    const [sejour] = roomParts(SEJOUR, [{ id: 'r1', wallIds: SEJOUR.map((w) => w.id) }]);
    const seg = coupeDePiece(sejour, { sens: 'longueur', depuis: 1.2, epaisseur: 0.07 }, SEJOUR)!;
    // L'axe de la cloison : 1,20 m depuis le mur ouest, plus sa demi-épaisseur.
    expect(seg.a.x).toBeCloseTo(1.2 + 0.035, 6);
    // Et les dimensions proposées sont celles du relevé.
    expect(dimensionsDeCoupe(sejour, SEJOUR)).toEqual({ longueur: 5, largeur: 4 });
  });

  it('une cloison en T de 1,00 m part du trait, et s’y cote à 1,50 m du coin', () => {
    const pose = { id: 'n:t', wallId: 'n', bout: 'a' as const, angle: 90 as const, a: { x: 2, z: 0 }, b: { x: 2, z: 1 }, genre: 't' as const };
    const seg = murNeufCote(SEJOUR, pose, { longueur: 1, epaisseur: 0.07, depuis: 1.5 })!;
    // Du coin (le trait du mur ouest) au nu de la cloison : 1,50 m.
    expect(seg.a.x).toBeCloseTo(1.5 + 0.035, 6);
    // Du trait du mur nord — sa face — au bout de la cloison : 1,00 m.
    expect(Math.abs(seg.b.z - seg.a.z)).toBeCloseTo(1, 6);
    expect(seg.a.z).toBeCloseTo(0, 6);
  });
});
