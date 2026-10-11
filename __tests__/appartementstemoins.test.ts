/**
 * LES APPARTEMENTS TÉMOINS — des relevés fabriqués comme RoomPlan les rend,
 * avec ses défauts, passés par toute la chaîne.
 *
 * Relevé du patron : « génère des appartements témoins sous plusieurs formes
 * et étages, et vérifie si tu rencontres des problèmes ; analyse le
 * diagnostic et fais des correctifs adaptés ».
 *
 * Chaque témoin est une liste de surfaces (murs, portes, fenêtres) et
 * d'objets, dans le repère de la session de RoomPlan (le sol à −1,30 m),
 * avec ce que le scan réel y met : des coins qui ne se rejoignent pas tout à
 * fait, des éclats de quelques centimètres, des murs de travers d'un degré,
 * un mur rendu en deux morceaux, une cloison vue des deux côtés, une baie
 * vitrée prise pour une porte, un canapé d'angle coupé en deux. Puis on
 * vérifie ce qu'un utilisateur constaterait : les pièces trouvées et
 * fermées, la surface, le diagnostic, la 3D, le dossier PDF, le DXF, l'OBJ.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { act } from 'react-test-renderer';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { diagnostiquerPlan } from '../src/geometry/diagnosticPlan';
import { epaisseurDe, roomParts, segLength, solDesMurs } from '../src/geometry/floorplan';
import type { ProfilDessus } from '../src/geometry/coffreLidar';
import { buildScene } from '../src/geometry/scene3d';
import { buildScanPdf } from '../src/export/pdf';
import { buildDxf } from '../src/export/dxf';
import { buildObj } from '../src/export/model3d';
import { MAQUETTE } from '../src/ui/maquette';
import { useScanStore } from '../src/store/scanStore';

const SOL = -1.3;

/** Un générateur pseudo-aléatoire à graine : les témoins sont reproductibles. */
function graine(n: number) {
  let s = n >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Seg = [number, number, number, number];

interface Temoin {
  nom: string;
  murs: Seg[];
  portes?: Seg[];
  fenetres?: Seg[];
  passages?: Seg[];
  objets?: { cat: string; x: number; z: number; w: number; d: number; h: number; yaw?: number; attrs?: string[] }[];
  /** Le défaut du scan : jeu aux coins (m), écart d'angle (°), éclats. */
  bruit?: { jeu?: number; angle?: number; eclats?: number };
  attendu: { pieces: number; surface: number };
  /** Les portes (par rang) au-dessus desquelles le LiDAR a vu un coffre. */
  coffres?: number[];
}

let compteur = 0;
function surface(type: string, s: Seg, h: number, bas = 0, hasard?: () => number, bruit?: Temoin['bruit']): SurfaceData {
  let [ax, az, bx, bz] = s;
  if (hasard && bruit && type === 'wall') {
    const j = bruit.jeu ?? 0;
    ax += (hasard() - 0.5) * 2 * j;
    az += (hasard() - 0.5) * 2 * j;
    bx += (hasard() - 0.5) * 2 * j;
    bz += (hasard() - 0.5) * 2 * j;
    const a = ((bruit.angle ?? 0) * Math.PI) / 180 * (hasard() - 0.5) * 2;
    if (a) {
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const rot = (x: number, z: number) => [
        mx + (x - mx) * Math.cos(a) - (z - mz) * Math.sin(a),
        mz + (x - mx) * Math.sin(a) + (z - mz) * Math.cos(a),
      ];
      [ax, az] = rot(ax, az);
      [bx, bz] = rot(bx, bz);
    }
  }
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-${++compteur}`,
    type,
    length: L,
    height: h,
    confidence: 'high',
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, SOL + bas + h / 2, (az + bz) / 2, 1],
    color: '#D8CDB8',
  } as unknown as SurfaceData;
}

function objet(o: NonNullable<Temoin['objets']>[number]): ObjectData {
  const c = Math.cos(o.yaw ?? 0);
  const s = Math.sin(o.yaw ?? 0);
  return {
    id: `obj-${++compteur}`,
    category: o.cat,
    width: o.w,
    depth: o.d,
    height: o.h,
    transform: [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, o.x, SOL + o.h / 2, o.z, 1],
    ...(o.attrs ? { attributes: o.attrs } : {}),
  } as ObjectData;
}

/**
 * Ce que le natif mesure au-dessus d'une baie coiffée d'un coffre courant :
 * 25 cm de haut, 18 cm de saillie, la baie en retrait dessous (voir
 * `coffrelidar`).
 */
function profilDeCoffre(): ProfilDessus {
  const pas = 0.02;
  const depuis = -0.1;
  const ecarts: number[] = [];
  const nombres: number[] = [];
  for (let i = 0; i < 50; i++) {
    const v = depuis + (i + 0.5) * pas;
    ecarts.push(v < 0 ? -12 : v < 0.25 ? 18 : 0);
    nombres.push(30);
  }
  return { pas, depuis, ecarts, nombres, temoin: ecarts.map(() => 0), nombresTemoin: ecarts.map(() => 20), oriente: true };
}

/** Le relevé d'un témoin, tel que le natif le livrerait. */
function releve(t: Temoin, n = 1) {
  const hasard = graine(n * 97 + t.nom.length);
  const surfaces: SurfaceData[] = [];
  for (const m of t.murs) surfaces.push(surface('wall', m, 2.5, 0, hasard, t.bruit));
  // Les éclats : de petits morceaux de mur près d'un coin.
  for (let k = 0; k < (t.bruit?.eclats ?? 0); k++) {
    const [ax, az] = t.murs[k % t.murs.length];
    surfaces.push(surface('wall', [ax + 0.01, az + 0.01, ax + 0.09, az + 0.02], 2.5));
  }
  const dessus: Record<string, ProfilDessus> = {};
  (t.portes ?? []).forEach((p, i) => {
    const s = surface('door', p, 2.05);
    surfaces.push(s);
    if (t.coffres?.includes(i)) dessus[(s as unknown as { id: string }).id] = profilDeCoffre();
  });
  for (const f of t.fenetres ?? []) surfaces.push(surface('window', f, 1.35, 0.9));
  for (const p of t.passages ?? []) surfaces.push(surface('opening', p, 2.1));
  const objects = (t.objets ?? []).map(objet);
  const trajet: number[] = [];
  return { modelPath: '', surfaces, objects, trajet, ...(t.coffres ? { dessus } : {}) };
}

// ------------------------------------------------------------- les témoins

const T2: Temoin = {
  nom: 'T2 classique',
  murs: [
    [0, 0, 5, 0], [5, 0, 8, 0], [8, 0, 8, 6], [8, 6, 0, 6], [0, 6, 0, 0],
    [5, 0, 5, 6], [5, 3.5, 8, 3.5],
  ],
  portes: [[5, 1, 5, 1.83], [5, 4.2, 5, 4.9], [0, 4.5, 0, 5.4], [1.5, 6, 3.9, 6]],
  fenetres: [[1, 0, 2.5, 0], [6, 0, 7.2, 0]],
  objets: [
    { cat: 'sofa', x: 2.5, z: 3.6, w: 2.2, d: 0.9, h: 0.85, yaw: Math.PI },
    { cat: 'table', x: 2.5, z: 1.8, w: 1.4, d: 0.8, h: 0.75 },
    { cat: 'bed', x: 6.6, z: 1.8, w: 1.6, d: 2.0, h: 0.5, yaw: Math.PI / 2 },
    { cat: 'toilet', x: 7.6, z: 5.6, w: 0.4, d: 0.7, h: 0.8, yaw: Math.PI },
    { cat: 'sink', x: 6.2, z: 5.7, w: 0.6, d: 0.45, h: 0.85, yaw: Math.PI },
  ],
  attendu: { pieces: 3, surface: 48 },
};

const STUDIO_L: Temoin = {
  nom: 'Studio en L',
  murs: [[0, 0, 6, 0], [6, 0, 6, 3], [6, 3, 3.5, 3], [3.5, 3, 3.5, 5], [3.5, 5, 0, 5], [0, 5, 0, 0]],
  portes: [[0, 3.8, 0, 4.7]],
  fenetres: [[2, 0, 3.5, 0]],
  objets: [
    { cat: 'bed', x: 4.6, z: 1.5, w: 1.4, d: 2.0, h: 0.5, yaw: Math.PI / 2 },
    { cat: 'storage', x: 1.8, z: 4.7, w: 2.4, d: 0.6, h: 0.9, yaw: Math.PI },
  ],
  attendu: { pieces: 1, surface: 25 },
};

const PAN_COUPE: Temoin = {
  nom: 'Pan coupé et baie',
  murs: [[0, 0, 5, 0], [5, 0, 5, 3], [5, 3, 4, 4], [4, 4, 0, 4], [0, 4, 0, 0]],
  // La baie coulissante (2,40 m) que RoomPlan prend pour une porte, sous son coffre.
  portes: [[0, 1.2, 0, 2.1], [1, 4, 3.4, 4]],
  fenetres: [[1.5, 0, 3, 0]],
  coffres: [1],
  attendu: { pieces: 1, surface: 19.5 },
};

const ENFILADE: Temoin = {
  nom: 'Enfilade',
  murs: [
    [0, 0, 10, 0], [10, 0, 10, 4.2], [10, 4.2, 0, 4.2], [0, 4.2, 0, 0],
    [0, 1.2, 10, 1.2],
    [2.5, 1.2, 2.5, 4.2], [5, 1.2, 5, 4.2], [7.5, 1.2, 7.5, 4.2],
  ],
  portes: [[0.8, 1.2, 1.63, 1.2], [3.3, 1.2, 4.13, 1.2], [5.8, 1.2, 6.63, 1.2], [8.3, 1.2, 9.13, 1.2], [0, 0.2, 0, 1.0]],
  fenetres: [[0.6, 4.2, 1.8, 4.2], [3.1, 4.2, 4.3, 4.2], [5.6, 4.2, 6.8, 4.2], [8.1, 4.2, 9.3, 4.2]],
  attendu: { pieces: 5, surface: 42 },
};

const BRUITE: Temoin = {
  nom: 'Relevé bruité',
  murs: [[0, 0, 2.2, 0], [2.22, 0.02, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]],
  portes: [[0, 1, 0, 1.83]],
  fenetres: [[2.5, 3, 3.6, 3]],
  bruit: { jeu: 0.045, angle: 1.2, eclats: 1 },
  attendu: { pieces: 1, surface: 12 },
};

const DOUBLES: Temoin = {
  nom: 'Cloison vue des deux côtés',
  murs: [
    [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0],
    [4.1, 0, 8, 0], [8, 0, 8, 3], [8, 3, 4.1, 3], [4.1, 3, 4.1, 0],
  ],
  portes: [[4.05, 1, 4.05, 1.83], [0, 0.3, 0, 1.1]],
  attendu: { pieces: 2, surface: 23.7 },
};

const NICHE: Temoin = {
  nom: 'Niche et canapé d’angle',
  murs: [[0, 0, 2, 0], [2, 0, 2, -0.65], [2, -0.65, 2.62, -0.65], [2.62, -0.65, 2.62, 0], [2.62, 0, 5, 0], [5, 0, 5, 4], [5, 4, 0, 4], [0, 4, 0, 0]],
  portes: [[0, 2.8, 0, 3.7]],
  objets: [
    { cat: 'refrigerator', x: 2.31, z: -0.38, w: 0.46, d: 0.42, h: 1.85, yaw: Math.PI },
    { cat: 'sofa', x: 3, z: 3.5, w: 2.4, d: 0.95, h: 0.85, yaw: Math.PI, attrs: ['SofaType:lShaped'] },
    { cat: 'sofa', x: 3.75, z: 2.58, w: 0.9, d: 0.93, h: 0.85, yaw: Math.PI, attrs: ['SofaType:lShapedExtension'] },
  ],
  attendu: { pieces: 1, surface: 20 + 0.62 * 0.65 },
};

const ETAGE: Temoin = {
  nom: 'Étage',
  murs: [
    [0, 0, 8, 0], [8, 0, 8, 6], [8, 6, 0, 6], [0, 6, 0, 0],
    [4, 0, 4, 6], [4, 4, 8, 4],
  ],
  portes: [[4, 1, 4, 1.83], [4, 4.6, 4, 5.4], [5, 4, 5.83, 4]],
  fenetres: [[1, 0, 2.2, 0], [5.5, 0, 6.7, 0]],
  objets: [
    { cat: 'bed', x: 2, z: 2.5, w: 1.6, d: 2, h: 0.5 },
    { cat: 'bed', x: 6, z: 2, w: 1.4, d: 2, h: 0.5 },
    { cat: 'bathtub', x: 6.5, z: 5.6, w: 1.7, d: 0.7, h: 0.6, yaw: Math.PI },
  ],
  attendu: { pieces: 3, surface: 48 },
};

const SOUS_SOL: Temoin = {
  nom: 'Sous-sol',
  murs: [[0, 0, 9, 0], [9, 0, 9, 6], [9, 6, 0, 6], [0, 6, 0, 0], [4, 0, 4, 6]],
  portes: [[4, 2, 4, 2.9]],
  attendu: { pieces: 2, surface: 54 },
};

// ------------------------------------------------------------- l'examen

const st = () => useScanStore.getState();

function nonFini(...v: number[]) {
  return v.some((x) => !Number.isFinite(x));
}

/** Ce qu'un utilisateur constaterait sur un niveau du plan ouvert. */
function examiner(t: Temoin, niveau = 0): string[] {
  const pb: string[] = [];
  const s = st();
  const auNiveau = <X extends { niveau?: number }>(xs: X[]) => xs.filter((x) => (x.niveau ?? 0) === niveau);
  const walls = auNiveau(s.walls);
  const openings = auNiveau(s.openings);
  const rooms = auNiveau(s.rooms as { id: string; name?: string; niveau?: number; wallIds?: string[] }[]);
  const roomIds = new Set(rooms.map((r) => r.id));
  const objects = s.objects.filter((o) => roomIds.has(o.roomId ?? ''));
  if (walls.length === 0) return ['aucun mur'];
  for (const w of [...walls, ...openings]) {
    if (nonFini(w.a.x, w.a.z, w.b.x, w.b.z, w.height, w.yCenter)) pb.push(`valeur non finie sur ${w.type} ${w.id}`);
  }
  const eclats = walls.filter((w) => segLength(w) < 0.005).length;
  if (eclats) pb.push(`${eclats} éclat(s) de mur`);
  const parts = roomParts(walls, rooms);
  const fermees = parts.filter((p) => p.surface?.exact);
  if (rooms.length !== t.attendu.pieces) pb.push(`${rooms.length} pièce(s) au lieu de ${t.attendu.pieces}`);
  if (fermees.length !== rooms.length) pb.push(`${rooms.length - fermees.length} pièce(s) non fermée(s)`);
  const aire = parts.reduce((a, p) => a + (p.surface?.area ?? 0), 0);
  if (Math.abs(aire - t.attendu.surface) > t.attendu.surface * 0.03) {
    pb.push(`surface ${aire.toFixed(2)} m² au lieu de ${t.attendu.surface.toFixed(2)}`);
  }
  const diag = diagnostiquerPlan({ walls, openings, rooms, objects });
  for (const p of diag.problemes) if (p.gravite === 'alerte') pb.push(`diagnostic : ${p.titre} — ${p.detail}`);
  for (const o of s.objects) {
    if (!o.roomId || !s.rooms.some((r) => r.id === o.roomId)) pb.push(`meuble ${o.category} sans pièce`);
    if (nonFini(...o.transform, o.width, o.depth, o.height)) pb.push(`meuble ${o.category} : valeur non finie`);
  }
  try {
    const sc = buildScene(walls, openings, objects, { palette: MAQUETTE, showSurfaces: true, rooms });
    if (sc.faces.length === 0) pb.push('3D vide');
    if (sc.faces.some((f) => f.pts.some((p) => nonFini(p.x, p.y, p.z)))) pb.push('3D : point non fini');
  } catch (e) {
    pb.push(`3D : ${(e as Error).message}`);
  }
  try {
    const pdf = buildScanPdf(
      { name: t.nom, walls, openings, objects, rooms, roomNames: Object.fromEntries(rooms.map((r) => [r.id, r.name ?? ''])) },
      false,
      { metre: true },
    );
    if (pdf.length < 1000) pb.push('PDF vide');
  } catch (e) {
    pb.push(`PDF : ${(e as Error).message}`);
  }
  try {
    buildDxf({ walls, openings, rooms: rooms.map((r) => ({ id: r.id, name: r.name ?? '', wallIds: r.wallIds })), fixtures: [], objects });
    buildObj({ walls, openings, objects, rooms });
  } catch (e) {
    pb.push(`export : ${(e as Error).message}`);
  }
  return pb;
}

function scanner(t: Temoin, n = 1) {
  act(() => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    st().finalize(releve(t, n) as never);
  });
}

describe('les appartements témoins, un niveau', () => {
  for (const t of [T2, STUDIO_L, PAN_COUPE, ENFILADE, BRUITE, DOUBLES, NICHE]) {
    it(t.nom, () => {
      scanner(t);
      const pb = examiner(t);
      if (pb.length) console.log(`${t.nom} :\n  - ${pb.join('\n  - ')}`);
      expect(pb).toEqual([]);
    });
  }

  it('le relevé bruité, sous dix graines différentes', () => {
    const tous: string[] = [];
    for (let g = 1; g <= 10; g++) {
      scanner(BRUITE, g);
      for (const p of examiner(BRUITE)) tous.push(`graine ${g} : ${p}`);
    }
    if (tous.length) console.log(`Relevé bruité :\n  - ${tous.join('\n  - ')}`);
    expect(tous).toEqual([]);
  });
});

/*
  CE QUE LES DÉFAUTS DU SCAN NE DOIVENT PAS DEVENIR — chacun a été relevé par
  le patron sur un vrai plan ; les témoins les rejouent.
*/
describe('les défauts du scan, réparés en fin de scan', () => {
  it('la baie coulissante prise pour une porte redevient une baie, coffre compris', () => {
    scanner(PAN_COUPE);
    const baie = st().openings.find((o) => segLength(o) > 2)!;
    expect(baie.type).toBe('window');
    // Le coffre lu dans le maillage (à la tranche de 2 cm près), en volume.
    expect(baie.coffre).toBeCloseTo(0.25, 1);
    expect(baie.coffreSaillie).toBeCloseTo(0.18, 2);
    // Elle descend toujours au sol.
    expect(baie.yCenter - baie.height / 2 - solDesMurs(st().walls)).toBeLessThan(0.05);
    // La porte d'entrée, elle, reste une porte.
    expect(st().openings.filter((o) => o.type === 'door')).toHaveLength(1);
  });

  it('le frigo se cale dans sa niche, entre ses trois murs', () => {
    scanner(NICHE);
    const frigo = st().objects.find((o) => o.category === 'refrigerator')!;
    // Les deux joues de la niche, à 62 cm d'axe en axe.
    const joues = st()
      .walls.filter((w) => Math.abs(w.a.x - w.b.x) < 0.02 && Math.min(w.a.z, w.b.z) < -0.3)
      .sort((p, q) => p.a.x - q.a.x);
    expect(joues).toHaveLength(2);
    const gauche = joues[0].a.x + epaisseurDe(joues[0]) / 2;
    const droite = joues[1].a.x - epaisseurDe(joues[1]) / 2;
    // Le frigo de 46 cm, mal mesuré, remplit l'intervalle d'un nu à l'autre…
    expect(frigo.width).toBeCloseTo(droite - gauche, 2);
    // … et s'y centre.
    expect(frigo.transform[12]).toBeCloseTo((gauche + droite) / 2, 2);
    expect(frigo.transform[14]).toBeLessThan(0);
  });

  it('le canapé d’angle rendu en deux morceaux ressort en un seul', () => {
    scanner(NICHE);
    expect(st().objects.filter((o) => o.category === 'sofa')).toHaveLength(1);
  });

  it('la cloison vue des deux côtés ne laisse qu’un mur, et sa porte', () => {
    scanner(DOUBLES);
    const cloison = st().walls.filter(
      (w) => Math.abs(w.a.x - w.b.x) < 0.02 && w.a.x > 3.9 && w.a.x < 4.2,
    );
    expect(cloison).toHaveLength(1);
    expect(st().openings.filter((o) => o.type === 'door')).toHaveLength(2);
  });
});

describe('un duplex avec sous-sol', () => {
  it('trois niveaux, chacun fermé et juste', () => {
    scanner(T2);
    act(() => st().finalizeEtage(releve(ETAGE) as never, 1));
    act(() => st().finalizeEtage(releve(SOUS_SOL) as never, -1));
    const niveaux = [...new Set(st().walls.map((w) => w.niveau ?? 0))].sort();
    const pb: string[] = [];
    if (JSON.stringify(niveaux) !== JSON.stringify([-1, 0, 1])) pb.push(`niveaux ${JSON.stringify(niveaux)}`);
    for (const [t, n] of [[T2, 0], [ETAGE, 1], [SOUS_SOL, -1]] as const) {
      for (const p of examiner(t, n)) pb.push(`${t.nom} (niveau ${n}) : ${p}`);
    }
    if (pb.length) console.log(`Duplex :\n  - ${pb.join('\n  - ')}`);
    expect(pb).toEqual([]);
  });
});
