/**
 * DES COTES QU'UN ÉLECTRICIEN PEUT SIGNER — relevé du patron : « des cotes
 * fiables et un scan parfaitement optimisé » ; « 6 murs mal vus », et les
 * murs de 1,85 / 1,89 d'une chambre avec dressing mal relevés.
 *
 * Quatre logements types passent par la vraie fin de scan (`finalize`), sous
 * le bruit que RoomPlan fait réellement : bouts à ±2,5 cm, plan du mur à
 * ±1,5 cm, ±1°, murs rendus en morceaux, faces revues deux fois, éclats,
 * murs « low » deux fois plus bruités. Chaque cote imprimée
 * (`longueurCotee`) et chaque surface sont comparées à celles du même relevé
 * SANS bruit (lui-même vérifié aux cotes exactes).
 *
 * Le plancher de ce bruit (±1,5 cm sur chaque plan, deux plans par cote) est
 * un P95 de ≈ 2,3 cm : les seuils « nominal » le serrent ; le seuil de
 * 1,5 cm vaut pour un relevé propre (plan à ±0,8 cm).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import { act } from 'react-test-renderer';
import type { SurfaceData } from 'react-native-room-scan';
import { longueurCotee, roomParts, segLength, type Pt, type RoomPart, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const SOL = -1.3;
type Seg = [number, number, number, number];

function graine(n: number) {
  let s = n >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let compteur = 0;
function surf(type: string, [ax, az, bx, bz]: number[], h: number, conf = 'high', bas = 0): SurfaceData {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-${++compteur}`,
    type,
    length: L,
    height: h,
    confidence: conf,
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, SOL + bas + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}

interface Logement {
  nom: string;
  murs: Seg[];
  deuxFaces?: Record<number, number>;
  portes: Seg[];
  fenetres?: Seg[];
  /** Les cotes du relevé SANS bruit, triées : la chaîne doit les rendre exactes. */
  cotesExactes: number[];
}

const LOGEMENTS: Logement[] = [
  {
    nom: 'Chambre + dressing',
    murs: [
      [0, 0, 4.2, 0], [4.2, 0, 4.2, 3.8], [4.2, 3.8, 0, 3.8], [0, 3.8, 0, 0],
      [1.85, 0, 1.85, 1.89], [1.85, 1.89, 0, 1.89],
      [4.2, 2.6, 3.6, 2.6],
    ],
    portes: [[1.85, 1.0, 1.85, 1.7], [0, 2.6, 0, 3.4]],
    fenetres: [[2.5, 0, 3.7, 0]],
    cotesExactes: [0.6, 1.2, 1.85, 1.85, 1.89, 1.89, 1.91, 2.35, 2.6, 4.2],
  },
  {
    nom: 'T2',
    murs: [[0, 0, 5, 0], [5, 0, 8, 0], [8, 0, 8, 6], [8, 6, 0, 6], [0, 6, 0, 0], [5, 0, 5, 6], [5, 3.5, 8, 3.5]],
    portes: [[5, 1, 5, 1.83], [5, 4.2, 5, 4.9], [0, 4.5, 0, 5.4]],
    fenetres: [[1, 0, 2.5, 0], [6, 0, 7.2, 0]],
    cotesExactes: [2.5, 2.5, 3, 3, 3, 3.5, 3.5, 5, 5, 6],
  },
  {
    nom: 'Studio en L et niche',
    murs: [
      [0, 0, 2, 0], [2, 0, 2, -0.65], [2, -0.65, 2.62, -0.65], [2.62, -0.65, 2.62, 0], [2.62, 0, 6, 0],
      [6, 0, 6, 3], [6, 3, 3.5, 3], [3.5, 3, 3.5, 5], [3.5, 5, 0, 5], [0, 5, 0, 0],
    ],
    portes: [[0, 3.8, 0, 4.7]],
    fenetres: [[3.5, 0, 5, 0]],
    cotesExactes: [0.62, 0.65, 0.65, 2, 2, 2.5, 3, 3.38, 3.5, 5],
  },
  {
    nom: 'T3 et couloir',
    murs: [
      [0, 0, 9, 0], [9, 0, 9, 7], [9, 7, 0, 7], [0, 7, 0, 0],
      [0, 3, 9, 3], [0, 4.2, 9, 4.2], [5, 0, 5, 3], [3.5, 4.2, 3.5, 7], [5.5, 4.2, 5.5, 7],
      [9, 5.6, 8.4, 5.6],
    ],
    // La cloison séjour / cuisine, relevée sur ses deux faces (7 cm).
    deuxFaces: { 6: 0.07 },
    portes: [
      [1, 3, 1.83, 3], [6, 3, 6.83, 3], [1.5, 4.2, 2.23, 4.2], [4, 4.2, 4.7, 4.2], [6.5, 4.2, 7.23, 4.2],
      [0, 3.2, 0, 4.0], [5, 1, 5, 1.83],
    ],
    fenetres: [[1, 0, 2.5, 0], [6, 0, 7.5, 0]],
    cotesExactes: [
      0.6, 1.2, 1.2, 1.4, 1.4, 2, 2, 2.8, 2.8, 2.8, 3, 3, 3, 3.5, 3.5, 3.5, 3.5, 3.965, 3.965, 4.965, 4.965,
    ],
  },
];

interface Bruit {
  bout: number;
  plan: number;
  angle: number;
  morceaux: number;
  doublon: number;
  low: number;
  medium: number;
  eclats: number;
}
const NOMINAL: Bruit = { bout: 0.025, plan: 0.015, angle: 1, morceaux: 0.3, doublon: 0.15, low: 0.15, medium: 0.25, eclats: 2 };
const PROPRE: Bruit = { ...NOMINAL, bout: 0.015, plan: 0.008, angle: 0.5 };

function releve(l: Logement, g: number | null, b: Bruit): SurfaceData[] {
  const h = g === null ? null : graine(g * 7919 + l.nom.length * 31);
  const u = () => (h ? (h() - 0.5) * 2 : 0);
  const out: SurfaceData[] = [];
  const bruite = (s: number[], k: number): number[] => {
    if (!h) return s;
    const [ax, az, bx, bz] = s;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    const d = u() * b.plan * k;
    const ea = u() * b.bout * k;
    const eb = u() * b.bout * k;
    const A = [ax + ux * ea - uz * d, az + uz * ea + ux * d];
    const B = [bx + ux * eb - uz * d, bz + uz * eb + ux * d];
    const a = (u() * b.angle * k * Math.PI) / 180;
    const mx = (A[0] + B[0]) / 2;
    const mz = (A[1] + B[1]) / 2;
    const rot = (x: number, z: number) => [
      mx + (x - mx) * Math.cos(a) - (z - mz) * Math.sin(a),
      mz + (x - mx) * Math.sin(a) + (z - mz) * Math.cos(a),
    ];
    return [...rot(A[0], A[1]), ...rot(B[0], B[1])];
  };
  const confiance = () => {
    if (!h) return { conf: 'high', k: 1 };
    const r = h();
    if (r < b.low) return { conf: 'low', k: 2 };
    if (r < b.low + b.medium) return { conf: 'medium', k: 1.3 };
    return { conf: 'high', k: 1 };
  };
  l.murs.forEach((m, i) => {
    const e = l.deuxFaces?.[i];
    const [ax, az, bx, bz] = m;
    const L0 = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L0;
    const nz = (bx - ax) / L0;
    const faces = e
      ? [
          [ax + (nx * e) / 2, az + (nz * e) / 2, bx + (nx * e) / 2, bz + (nz * e) / 2],
          [bx - (nx * e) / 2, bz - (nz * e) / 2, ax - (nx * e) / 2, az - (nz * e) / 2],
        ]
      : [m as number[]];
    for (const f of faces) {
      const L = Math.hypot(f[2] - f[0], f[3] - f[1]);
      const morceaux: number[][] = [];
      if (h && L > 2 && h() < b.morceaux) {
        const t = 0.3 + 0.4 * h();
        const P = [f[0] + (f[2] - f[0]) * t, f[1] + (f[3] - f[1]) * t];
        morceaux.push([f[0], f[1], P[0], P[1]], [P[0], P[1], f[2], f[3]]);
      } else morceaux.push(f);
      for (const p of morceaux) {
        const c = confiance();
        out.push(surf('wall', bruite(p, c.k), 2.5, c.conf));
      }
      if (h && h() < b.doublon) {
        const t0 = 0.2 * h();
        const t1 = 1 - 0.2 * h();
        const q = [f[0] + (f[2] - f[0]) * t0, f[1] + (f[3] - f[1]) * t0, f[0] + (f[2] - f[0]) * t1, f[1] + (f[3] - f[1]) * t1];
        const c = confiance();
        out.push(surf('wall', bruite(q, c.k), 2.5, c.conf));
      }
    }
  });
  if (h) {
    for (let k = 0; k < b.eclats; k++) {
      const m = l.murs[Math.floor(h() * l.murs.length)];
      const L = Math.hypot(m[2] - m[0], m[3] - m[1]);
      const ux = (m[2] - m[0]) / L;
      const uz = (m[3] - m[1]) / L;
      const len = 0.05 + 0.07 * h();
      const o = 0.01 + 0.03 * h();
      out.push(surf('wall', [m[0] + ux * o, m[1] + uz * o + 0.01, m[0] + ux * (o + len), m[1] + uz * (o + len) + 0.01], 2.5, 'low'));
    }
  }
  for (const p of l.portes) out.push(surf('door', p, 2.04));
  for (const f of l.fenetres ?? []) out.push(surf('window', f, 1.35, 'high', 0.9));
  return out;
}

interface Plan {
  walls: WallSeg[];
  parts: RoomPart[];
  pieces: number;
}

function scanner(surfaces: SurfaceData[]): Plan {
  act(() => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    useScanStore.getState().finalize({ modelPath: '', surfaces, objects: [], trajet: [] } as never);
  });
  const s = useScanStore.getState();
  const walls = s.walls.filter((w) => w.type === 'wall');
  return { walls, parts: roomParts(s.walls, s.rooms as never), pieces: s.rooms.length };
}

const cote = (p: Plan, w: WallSeg) => longueurCotee(p.walls, w, p.parts);

function dansPoly(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}

/** Le mur bruité qui porte la cote d'un mur de référence : parallèle, sur sa ligne, qui le recouvre le plus. */
function homologue(r: WallSeg, plan: Plan): WallSeg | null {
  const L = segLength(r);
  const u = { x: (r.b.x - r.a.x) / L, z: (r.b.z - r.a.z) / L };
  let best: { w: WallSeg; rec: number } | null = null;
  for (const w of plan.walls) {
    const lw = segLength(w);
    if (lw < 0.05) continue;
    const uw = { x: (w.b.x - w.a.x) / lw, z: (w.b.z - w.a.z) / lw };
    if (Math.abs(u.x * uw.x + u.z * uw.z) < 0.97) continue;
    const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    if (Math.abs((m.x - r.a.x) * -u.z + (m.z - r.a.z) * u.x) > 0.2) continue;
    const t = (p: Pt) => (p.x - r.a.x) * u.x + (p.z - r.a.z) * u.z;
    const rec = Math.min(Math.max(t(w.a), t(w.b)), L) - Math.max(Math.min(t(w.a), t(w.b)), 0);
    if (rec < 0.5 * Math.min(L, lw)) continue;
    if (!best || rec > best.rec) best = { w, rec };
  }
  return best?.w ?? null;
}

interface Bilan {
  longs: number[];
  courts: number[];
  aires: number[];
  perdus: number;
  piecesFausses: number;
}

function campagne(b: Bruit, graines: number): Bilan {
  const bilan: Bilan = { longs: [], courts: [], aires: [], perdus: 0, piecesFausses: 0 };
  for (const l of LOGEMENTS) {
    const ref = scanner(releve(l, null, b));
    for (let g = 1; g <= graines; g++) {
      const plan = scanner(releve(l, g, b));
      if (plan.pieces !== ref.pieces) bilan.piecesFausses++;
      for (const r of ref.walls) {
        if (segLength(r) < 0.3) continue;
        const w = homologue(r, plan);
        if (!w) {
          bilan.perdus++;
          continue;
        }
        const exact = cote(ref, r);
        const err = Math.abs(cote(plan, w) - exact) * 100;
        if (exact > 1) bilan.longs.push(err);
        // Les murs courts : retours de placard, cloisons de dressing (0,55 à 1,95 m).
        if (exact >= 0.55 && exact <= 1.95) bilan.courts.push(err);
      }
      for (const p of ref.parts) {
        if (!p.surface) continue;
        const q = plan.parts.find((x) => x.surface && dansPoly(p.labelAt, x.surface.pts));
        bilan.aires.push(q ? (Math.abs(q.surface!.area - p.surface.area) / p.surface.area) * 100 : Infinity);
      }
    }
  }
  return bilan;
}

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(0.95 * (xs.length - 1))];
const max = (xs: number[]) => Math.max(...xs);
const part = (xs: number[], seuil: number) => xs.filter((x) => x > seuil).length / xs.length;

describe('la chaîne rend exactes les cotes d’un relevé sans bruit', () => {
  for (const l of LOGEMENTS) {
    it(l.nom, () => {
      const p = scanner(releve(l, null, NOMINAL));
      const cotes = p.walls.filter((w) => segLength(w) >= 0.3).map((w) => Math.round(cote(p, w) * 1000) / 1000).sort((a, b) => a - b);
      expect(cotes).toEqual(l.cotesExactes);
    });
  }
});

describe('bruit RoomPlan nominal, 4 logements × 100 graines', () => {
  let b: Bilan;
  beforeAll(() => {
    b = campagne(NOMINAL, 100);
  }, 120000);

  it('aucune pièce perdue ni inventée, aucun mur perdu', () => {
    expect(b.piecesFausses).toBe(0);
    expect(b.perdus).toBe(0);
  });
  it('murs de plus d’un mètre : P95 ≤ 3,3 cm, aucune cote fausse de plus de 15 cm', () => {
    expect(p95(b.longs)).toBeLessThanOrEqual(3.3);
    expect(max(b.longs)).toBeLessThanOrEqual(15);
    expect(part(b.longs, 5)).toBeLessThanOrEqual(0.005);
  });
  it('retours de placard et murs courts (0,55 à 1,95 m) : P95 ≤ 3,8 cm, max ≤ 8 cm', () => {
    expect(p95(b.courts)).toBeLessThanOrEqual(3.8);
    expect(max(b.courts)).toBeLessThanOrEqual(8);
  });
  it('surfaces : P95 ≤ 1,6 %, max ≤ 4 %', () => {
    expect(p95(b.aires)).toBeLessThanOrEqual(1.6);
    expect(max(b.aires)).toBeLessThanOrEqual(4);
  });
});

describe('relevé propre (plan ±0,8 cm, ±0,5°), 4 logements × 100 graines', () => {
  it('murs de plus d’un mètre : P95 < 1,6 cm, max ≤ 4 cm ; surfaces P95 ≤ 1 %', () => {
    const b = campagne(PROPRE, 100);
    expect(b.piecesFausses).toBe(0);
    expect(p95(b.longs)).toBeLessThan(1.6);
    expect(max(b.longs)).toBeLessThanOrEqual(4);
    expect(p95(b.aires)).toBeLessThanOrEqual(1);
  }, 120000);
});

describe('les cas qui ont trompé le chantier', () => {
  it('la façade coupée au pied de la cloison du dressing : 1,85 et 2,35, la cloison droite', () => {
    const p = scanner([
      surf('wall', [0.024, 0.007, 2.02, -0.006], 2.5),
      surf('wall', [1.976, 0, 4.198, -0.03], 2.5),
      surf('wall', [4.188, 0.006, 4.202, 3.782], 2.5),
      surf('wall', [4.222, 3.77, -0.003, 3.827], 2.5),
      surf('wall', [0.01, 3.808, -0.037, 0.01], 2.5),
      surf('wall', [1.842, -0.002, 1.842, 1.901], 2.5),
      surf('wall', [1.825, 1.912, -0.005, 1.886], 2.5),
      surf('door', [1.85, 1.0, 1.85, 1.7], 2.04),
      surf('door', [0, 2.6, 0, 3.4], 2.04),
    ]);
    const cloison = p.walls.find((w) => Math.abs(w.a.z - w.b.z) > 1.5 && Math.min(w.a.x, w.b.x) > 1 && Math.max(w.a.x, w.b.x) < 3)!;
    const facade = p.walls.filter((w) => Math.abs(w.a.z) < 0.05 && Math.abs(w.b.z) < 0.05);
    // La cloison reste d'équerre sur la façade (elle partait de 3° : 10 cm sur 1,90 m)…
    const dir = (w: WallSeg) => {
      const l = segLength(w);
      return { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    };
    const [u, v] = [dir(cloison), dir(facade[0])];
    expect(Math.abs(u.x * v.x + u.z * v.z)).toBeLessThan(0.005);
    // … et les deux tronçons de façade gardent leurs cotes (12 cm d'erreur aujourd'hui).
    const cotes = facade.map((w) => cote(p, w)).sort((a, b) => a - b);
    expect(Math.abs(cotes[0] - 1.85)).toBeLessThan(0.02);
    expect(Math.abs(cotes[1] - 2.35)).toBeLessThan(0.02);
  });

  it('un retour de 14 cm qui prolonge un mur n’est pas un éclat', () => {
    const p = scanner([
      surf('wall', [0, 0, 4, 0], 2.5), surf('wall', [4, 0, 4, 3], 2.5), surf('wall', [4, 3, 0, 3], 2.5), surf('wall', [0, 3, 0, 0], 2.5),
      surf('wall', [4, 3, 4, 3.14], 2.5), surf('wall', [4, 3.14, 7, 3.14], 2.5), surf('wall', [7, 3.14, 7, 0], 2.5), surf('wall', [7, 0, 4, 0], 2.5),
      surf('door', [4, 1, 4, 1.8], 2.04),
    ]);
    const aires = p.parts.map((x) => x.surface!.area).sort((a, b) => a - b);
    expect(aires[0]).toBeCloseTo(9.42, 2);
    expect(aires[1]).toBeCloseTo(12, 2);
    expect(p.walls.some((w) => Math.abs(segLength(w) - 0.14) < 0.005)).toBe(true);
  });

  it('un éclat de 10 cm ne fait pas d’un couloir de 9 m un mur à deux faces', () => {
    const p = scanner([
      surf('wall', [0, 0, 9, 0], 2.5), surf('wall', [9, 0, 9, 4.2], 2.5), surf('wall', [9, 4.2, 0, 4.2], 2.5), surf('wall', [0, 4.2, 0, 0], 2.5),
      surf('wall', [0, 3, 9, 3], 2.5),
      surf('wall', [0.03, 3.066, 0.13, 3.066], 2.5, 'low'),
      surf('door', [1, 3, 1.83, 3], 2.04), surf('door', [9, 0.5, 9, 1.3], 2.04),
    ]);
    expect(p.walls.some((w) => w.deuxFaces)).toBe(false);
    const couloir = p.walls.filter((w) => Math.abs(w.a.x - w.b.x) < 0.01 && Math.min(w.a.z, w.b.z) > 2.9).map((w) => cote(p, w));
    for (const c of couloir) expect(c).toBeCloseTo(1.2, 2);
  });

  it('une cloison à deux faces rendue en deux morceaux garde UNE cote', () => {
    const p = scanner([
      surf('wall', [0, 0, 9, 0], 2.5), surf('wall', [9, 0, 9, 3], 2.5), surf('wall', [9, 3, 0, 3], 2.5), surf('wall', [0, 3, 0, 0], 2.5),
      surf('wall', [4.952, -0.006, 4.95, 1.613], 2.5), surf('wall', [4.964, 1.599, 4.953, 3.002], 2.5),
      surf('wall', [5.05, 2.986, 5.05, 1.607], 2.5), surf('wall', [5.028, 1.618, 5.055, 0.019], 2.5),
      surf('door', [5, 2, 5, 2.83], 2.04), surf('door', [0, 1, 0, 1.8], 2.04),
    ]);
    const cloison = p.walls.filter((w) => w.deuxFaces);
    expect(cloison).toHaveLength(1);
    expect(cote(p, cloison[0])).toBeCloseTo(3, 1.7);
  });

  it('une façade « low » de travers de 2° ne laisse pas la chambre ouverte', () => {
    const p = scanner([
      surf('wall', [0, 0, 9, 0], 2.5),
      surf('wall', [8.969, 0, 9.041, 6.978], 2.5),
      surf('wall', [9.008, 7.175, 0.009, 6.884], 2.5, 'low'),
      surf('wall', [-0.01, 6.99, 0.01, 0], 2.5),
      surf('wall', [0, 3, 9, 3], 2.5),
      surf('door', [1, 3, 1.83, 3], 2.04), surf('door', [0, 1, 0, 1.8], 2.04),
    ]);
    expect(p.pieces).toBe(2);
    expect(p.parts.every((x) => x.surface?.exact)).toBe(true);
  });
});
