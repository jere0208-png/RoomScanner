/**
 * LE PLAN 2D S'ADAPTE À TOUTE SITUATION — demande du patron : « on doit
 * peaufiner au mieux le plan 2D, il doit être intelligent et s'adapter à
 * toute situation ». Une batterie de situations difficiles, chacune avec ce
 * qu'un plan juste doit en dire : la surface et le périmètre, le nom de la
 * pièce posé au large (dedans, loin des murs, jamais sur une cloison), des
 * faces et des coins sans NaN, `exact` honnête — et les mêmes chiffres une
 * fois le plan tourné ou retourné.
 *
 * Trois défauts trouvés ici, corrigés :
 *   — une pièce dont le scan a perdu DEUX murs qui ne se touchent pas : la
 *     plus longue chaîne seule donnait 6 m² pour un L de 14, rien du tout pour
 *     un rectangle réduit à deux côtés opposés ;
 *   — le nom de la pièce s'écrivait en travers d'un retour de cloison ;
 *   — un poteau rendu en quatre murs fermés retirait 0,17 m² au lieu de 0,09.
 */
import {
  bornesAuNu,
  detectRooms,
  epaisseursAccordees,
  facesDesMurs,
  fusionnerMursDoubles,
  joindreLesCoins,
  mergeColinear,
  perimetreDesPieces,
  preEquerrage,
  roomParts,
  sansEclats,
  splitAtJunctions,
  wallQuads,
  weldCorners,
  type Pt,
  type WallSeg,
} from '../src/geometry/floorplan';
import { releveLogique } from '../src/geometry/logique';

type P = [number, number];
const mur = (id: string, a: P, b: P, room = 'r1', o: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: a[0], z: a[1] },
  b: { x: b[0], z: b[1] },
  height: 2.5,
  yCenter: 1.25,
  roomId: room,
  ...o,
});
const contour = (pts: P[], o: Partial<WallSeg> = {}, room = 'r1', prefixe = 'w'): WallSeg[] =>
  pts.map((p, i) => mur(`${prefixe}${i}`, p, pts[(i + 1) % pts.length], room, o));
const aireDe = (pts: P[]) =>
  Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2;
const perimetreDe = (pts: P[]) =>
  pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0);
const dedans = (p: Pt, pts: Pt[]) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
const auSegment = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
};
const auBord = (p: Pt, pts: Pt[]) => Math.min(...pts.map((a, i) => auSegment(p, a, pts[(i + 1) % pts.length])));
const tourner = (walls: WallSeg[], deg: number, miroir = false): WallSeg[] => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  const f = (p: Pt) => {
    const x = miroir ? -p.x : p.x;
    return { x: x * c - p.z * s, z: x * s + p.z * c };
  };
  return walls.map((w) => ({ ...w, a: f(w.a), b: f(w.b) }));
};
const piece = (walls: WallSeg[]) => roomParts(walls, [{ id: 'r1', wallIds: walls.map((w) => w.id) }])[0];
/** La chaîne de fin de scan (voir `finalize`), avant la logique de construction. */
const chaineDuScan = (walls: WallSeg[]) =>
  releveLogique(
    sansEclats(mergeColinear(splitAtJunctions(joindreLesCoins(epaisseursAccordees(weldCorners(fusionnerMursDoubles(preEquerrage(walls))))))), [])
      .walls,
    [],
  ).walls;

const FORMES: Record<string, P[]> = {
  rectangle: [[0, 0], [4, 0], [4, 3], [0, 3]],
  'en L': [[0, 0], [5, 0], [5, 2], [2, 2], [2, 4], [0, 4]],
  'en U': [[0, 0], [6, 0], [6, 4], [4, 4], [4, 1.5], [2, 1.5], [2, 4], [0, 4]],
  'en T': [[0, 0], [6, 0], [6, 2], [4, 2], [4, 5], [2, 5], [2, 2], [0, 2]],
  'mur à 30°': [[0, 0], [5, 0], [5 + 3 * Math.tan(Math.PI / 6), 3], [0, 3]],
  'mur à 45°': [[0, 0], [4, 0], [7, 3], [0, 3]],
  'mur à 60°': [[0, 0], [4, 0], [4 + 2 * Math.tan(Math.PI / 3), 2], [0, 2]],
  'pan coupé': [[0, 0], [4, 0], [5, 1], [5, 3], [0, 3]],
  'grande pièce 12 × 8': [[0, 0], [12, 0], [12, 8], [0, 8]],
  'couloir 8 × 0,9': [[0, 0], [8, 0], [8, 0.9], [0, 0.9]],
  'placard 0,6 × 0,8': [[0, 0], [0.6, 0], [0.6, 0.8], [0, 0.8]],
  'WC 0,9 × 1,4': [[0, 0], [0.9, 0], [0.9, 1.4], [0, 1.4]],
};

/** Ce qu'un plan juste dit d'une pièce fermée. */
function verifierLaPiece(walls: WallSeg[], aire: number, perimetre: number) {
  const p = piece(walls);
  expect(p.surface).not.toBeNull();
  expect(p.surface!.exact).toBe(true);
  expect(p.surface!.area).toBeCloseTo(aire, 6);
  expect(perimetreDesPieces([p])).toBeCloseTo(perimetre, 6);
  // Le nom au large : dedans, et au moins à 20 cm de tout mur (30 % de la plus petite pièce).
  const pts = p.surface!.nu ?? p.surface!.pts;
  expect(dedans(p.labelAt, pts)).toBe(true);
  expect(auBord(p.labelAt, pts)).toBeGreaterThanOrEqual(Math.min(0.2, 0.3 * Math.sqrt(aire)));
  // Ni faces, ni coins, ni bornes de cote qui partent à l'infini.
  const faces = facesDesMurs(walls);
  for (const w of walls) {
    const f = faces.get(w.id)!;
    expect(Number.isFinite(f.plus) && Number.isFinite(f.moins)).toBe(true);
    const b = bornesAuNu(walls, w, [p]);
    expect(Number.isFinite(b.s0) && Number.isFinite(b.s1) && b.s1 >= b.s0).toBe(true);
  }
  for (const q of wallQuads(walls).values()) {
    for (const k of [q.a1, q.a2, q.b1, q.b2]) expect(Number.isFinite(k.x) && Number.isFinite(k.z)).toBe(true);
  }
  return p;
}

describe('chaque forme de pièce, telle quelle, tournée et retournée', () => {
  for (const [nom, pts] of Object.entries(FORMES)) {
    it(nom, () => {
      const aire = aireDe(pts);
      const per = perimetreDe(pts);
      const droit = verifierLaPiece(contour(pts), aire, per);
      // Tourné de 37° : même surface, même périmètre, le nom au même endroit de la pièce.
      const tourne = verifierLaPiece(tourner(contour(pts), 37), aire, per);
      const ptsD = droit.surface!.pts;
      const ptsT = tourne.surface!.pts;
      expect(auBord(tourne.labelAt, ptsT)).toBeCloseTo(auBord(droit.labelAt, ptsD), 1);
      // Le U a deux bras jumeaux : l'un ou l'autre, à égalité. Les autres formes, au même endroit.
      if (nom !== 'en U') {
        const attendu = tourner([mur('l', [droit.labelAt.x, droit.labelAt.z], [0, 0])], 37)[0].a;
        expect(Math.hypot(tourne.labelAt.x - attendu.x, tourne.labelAt.z - attendu.z)).toBeLessThan(0.08);
      }
      // Retourné (miroir) : pareil.
      verifierLaPiece(tourner(contour(pts), 90, true), aire, per);
    });
  }
});

describe('une pièce que le scan n’a pas refermée', () => {
  for (const [nom, pts] of Object.entries(FORMES)) {
    it(`${nom} : il manque un mur, n’importe lequel`, () => {
      for (let i = 0; i < pts.length; i++) {
        const sans = contour(pts).filter((_, k) => k !== i);
        const p = piece(sans);
        expect(p.surface!.exact).toBe(false);
        expect(Math.abs(p.surface!.area - aireDe(pts))).toBeLessThan(0.02 * aireDe(pts));
        expect(dedans(p.labelAt, p.surface!.pts)).toBe(true);
      }
    });
  }

  it('deux murs qui ne se touchent pas manquent : la pièce se referme sur les deux', () => {
    const cas: [string, number[]][] = [
      ['rectangle', [0, 2]],
      ['rectangle', [1, 3]],
      ['en L', [0, 3]],
      ['en L', [2, 4]],
      ['en L', [1, 4]],
      ['en T', [0, 3]],
      ['mur à 45°', [0, 2]],
      ['pan coupé', [0, 3]],
      ['grande pièce 12 × 8', [1, 3]],
    ];
    for (const [nom, manquants] of cas) {
      const pts = FORMES[nom];
      const reste = contour(pts).filter((_, k) => !manquants.includes(k));
      const p = piece(reste);
      expect(p.surface).not.toBeNull();
      expect(p.surface!.exact).toBe(false);
      expect(p.surface!.area).toBeCloseTo(aireDe(pts), 6);
    }
  });

  it('une cloison libre dans la pièce n’est pas prise pour un bord', () => {
    // Il manque le mur sud ; une cloison libre de 1,5 m flotte au milieu.
    const w = [...contour(FORMES.rectangle).filter((_, k) => k !== 2), mur('libre', [1.5, 1.5], [3, 1.5])];
    const p = piece(w);
    expect(p.surface!.area).toBeCloseTo(12, 6);
  });
});

describe('ce qui est dans la pièce sans être du sol libre', () => {
  it('le nom de la pièce ne s’écrit pas sur un retour de cloison', () => {
    for (const bout of [1.8, 0.8]) {
      const w = [...contour(FORMES.rectangle), mur('retour', [2, 3], [2, bout])];
      const p = piece(w);
      expect(p.surface!.area).toBeCloseTo(12, 6);
      expect(auSegment(p.labelAt, { x: 2, z: 3 }, { x: 2, z: bout })).toBeGreaterThan(0.5);
      expect(dedans(p.labelAt, p.surface!.pts)).toBe(true);
    }
  });

  it('sans obstacle, le nom reste au milieu de la pièce', () => {
    expect(piece(contour(FORMES.rectangle)).labelAt).toEqual({ x: 2, z: 1.5 });
  });

  it('un poteau rendu en quatre murs fermés retire ce qu’il entoure, et le nom l’évite', () => {
    const salle = contour(FORMES['grande pièce 12 × 8']);
    const poteau = contour([[5.85, 3.85], [6.15, 3.85], [6.15, 4.15], [5.85, 4.15]], {}, 'aucune', 'pot');
    const p = roomParts([...salle, ...poteau], [{ id: 'r1', wallIds: salle.map((w) => w.id) }])[0];
    expect(p.surface!.area).toBeCloseTo(96 - 0.09, 6);
    // Le milieu de la salle est sous le poteau : le nom se pose à côté.
    expect(Math.hypot(p.labelAt.x - 6, p.labelAt.z - 4)).toBeGreaterThan(0.6);
  });
});

describe('le bruit du scan', () => {
  it('doublons parallèles, mur coupé en deux, coins non soudés, trois degrés de travers : une pièce exacte', () => {
    const base: WallSeg[] = [
      mur('n', [0.08, 0], [5.1, 0]),
      mur('e', [5, -0.1], [5, 4.02]),
      // Le mur nord relevé en deux morceaux, à 2 cm l'un de l'autre.
      mur('s1', [5, 4], [2.52, 4.03]),
      mur('s2', [2.5, 4.02], [-0.1, 4]),
      mur('o', [0, 4.05], [0, 0.07]),
      // Deux doublons, à 4 et 3 cm de leur mur.
      mur('d1', [1, 0.04], [3.5, 0.05]),
      mur('d2', [5.03, 1], [5.02, 3]),
    ];
    for (const deg of [0, 3, 37]) {
      const n = chaineDuScan(tourner(base, deg));
      expect(n.filter((w) => w.type === 'wall')).toHaveLength(4);
      const p = piece(n);
      expect(p.surface!.exact).toBe(true);
      expect(Math.abs(p.surface!.area - 20)).toBeLessThan(0.2);
    }
  });

  it('un vrai biais, un mur courbe, restent ce qu’ils sont', () => {
    // 2,5° sur 10 m : 44 cm en bout, ce n'est pas du bruit.
    const d = 10 * Math.tan((2.5 * Math.PI) / 180);
    const biais: P[] = [[0, 0], [10, 0], [10, 4 + d], [0, 4]];
    expect(piece(chaineDuScan(contour(biais))).surface!.area).toBeCloseTo(aireDe(biais), 3);
    // Un quart de cercle en dix segments.
    const arc: P[] = [[0, 0]];
    for (let k = 0; k <= 10; k++) arc.push([3 * Math.cos((k * Math.PI) / 20), 3 * Math.sin((k * Math.PI) / 20)]);
    const p = piece(chaineDuScan(contour(arc)));
    expect(p.surface!.exact).toBe(true);
    expect(p.surface!.area).toBeCloseTo(aireDe(arc), 3);
  });

  it('un appartement bruité et tourné : les mêmes trois pièces', () => {
    const segs: [P, P][] = [
      [[0, 0], [5, 0]], [[5, 0], [8, 0]], [[8, 0], [8, 3]], [[8, 3], [8, 4]], [[8, 4], [5, 4]], [[5, 4], [0, 4]], [[0, 4], [0, 0]],
      [[5, 0], [5, 3]], [[5, 3], [5, 4]], [[5, 3], [8, 3]],
    ];
    for (const deg of [0, 37, 90]) {
      let k = 0;
      // Un bruit fixe de ±2 cm sur chaque extrémité.
      const bruit = () => ((Math.sin(++k * 12.9898) * 43758.5453) % 1) * 0.02;
      const w = segs.map(([a, b], i) => mur(`s${i}`, [a[0] + bruit(), a[1] + bruit()], [b[0] + bruit(), b[1] + bruit()], 'x'));
      const aires = detectRooms(chaineDuScan(tourner(w, deg)), 0.5).map((r) => r.area);
      expect(aires).toHaveLength(3);
      expect(Math.abs(aires[0] - 20)).toBeLessThan(0.25);
      expect(Math.abs(aires[1] - 9)).toBeLessThan(0.15);
      expect(Math.abs(aires[2] - 3)).toBeLessThan(0.1);
    }
  });

  it('un mur de longueur quasi nulle ne casse rien', () => {
    const w = [...contour(FORMES.rectangle), mur('eclat', [4, 3], [4.001, 3])];
    verifierLaPiece(w, 12, 14);
  });
});

describe('plusieurs pièces, plusieurs niveaux', () => {
  it('deux pièces collées : le refend vu d’un côté, des deux, ou d’aucun', () => {
    for (const [o, A, B] of [
      [{ vu: { x: -1, z: 0 } }, 12, 3 * (3 - 0.14)],
      [{ deuxFaces: true }, 3 * (4 - 0.07), 3 * (3 - 0.07)],
      [{}, 12, 9],
    ] as [Partial<WallSeg>, number, number][]) {
      const refend = mur('ref', [4, 0], [4, 3], 'A', o);
      const a = [mur('a1', [0, 0], [4, 0], 'A'), refend, mur('a3', [4, 3], [0, 3], 'A'), mur('a4', [0, 3], [0, 0], 'A')];
      const b = [mur('b1', [4, 0], [7, 0], 'B'), mur('b2', [7, 0], [7, 3], 'B'), mur('b3', [7, 3], [4, 3], 'B')];
      const parts = roomParts([...a, ...b], [
        { id: 'A', wallIds: a.map((w) => w.id) },
        { id: 'B', wallIds: [...b.map((w) => w.id), 'ref'] },
      ]);
      expect(parts[0].surface!.area).toBeCloseTo(A, 6);
      expect(parts[1].surface!.area).toBeCloseTo(B, 6);
      for (const p of parts) expect(dedans(p.labelAt, p.surface!.nu ?? p.surface!.pts)).toBe(true);
    }
  });

  it('deux niveaux superposés : chaque pièce garde sa surface et son nom', () => {
    const rdc = contour(FORMES.rectangle, {}, 'bas', 'r');
    const etage = contour(FORMES['en L'], { niveau: 1, yCenter: 3.95 }, 'haut', 'e');
    const parts = roomParts([...rdc, ...etage], [
      { id: 'bas', wallIds: rdc.map((w) => w.id) },
      { id: 'haut', wallIds: etage.map((w) => w.id) },
    ]);
    expect(parts[0].surface!.area).toBeCloseTo(12, 6);
    expect(parts[1].surface!.area).toBeCloseTo(14, 6);
    expect(dedans(parts[1].labelAt, parts[1].surface!.pts)).toBe(true);
  });

  it('une pièce sans mur ne fait pas tomber le plan', () => {
    const parts = roomParts([], [{ id: 'vide', wallIds: [] }]);
    expect(parts).toHaveLength(1);
    expect(parts[0].surface).toBeNull();
    expect(Number.isFinite(parts[0].labelAt.x) && Number.isFinite(parts[0].labelAt.z)).toBe(true);
  });
});
