/**
 * L'APPAREILLAGE EN VRAI — une prise est une prise, plus une pastille.
 *
 * Relevé du patron : « trouve un moyen, comme les meubles, d'avoir des
 * modèles réalistes des prises, luminaires, tableau élec, etc. Tout
 * appareillage élec. On ne doit plus voir un bloc noté mais une vraie prise
 * ajoutée, comme le rendu qu'on aura à la fin. »
 *
 * Ce banc tient ce que « une vraie prise » veut dire :
 *   — chaque appareil du catalogue, mural ou de plafond, a SON modèle, posé
 *     à sa place dans la scène ;
 *   — une double prise est UNE plaque à deux fenêtres, et deux appareils
 *     réunis à la main aussi ;
 *   — ce qui fait l'objet est là : les alvéoles et la broche de terre d'une
 *     prise, la porte fumée et les manettes d'un tableau, la lumière d'une
 *     applique ;
 *   — plus aucune teinte de FAMILLE dans le rendu : l'ambre des prises, le
 *     bleu des commandes restent au plan, qui fait foi ;
 *   — tout tient contre son mur (ou sous son plafond), aucune face n'est
 *     retournée, et la carte graphique ne reçoit plus les caisses.
 */
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { maillageDeLaVisite } from '../src/geometry/visite3d';
import {
  fabriquerAppareil,
  groupesDesAppareils,
  type PoseDAppareil,
} from '../src/geometry/appareils3d';
import { PAR_SOMMET, RENDU, maillageDesMeubles } from '../src/geometry/modeles3d';
import { FIXTURES, wallFace, type Fixture, type FixtureKind } from '../src/geometry/electrical';
import { CEILING_KINDS, type CeilingFixture } from '../src/geometry/ceiling';
import { detectRooms, mergeColinear, splitAtJunctions, weldCorners, type WallSeg } from '../src/geometry/floorplan';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
const MURS = mergeColinear(
  splitAtJunctions(weldCorners([mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)])),
).map((w) => ({ ...w, roomId: 'room-1' }));
const ROOMS = detectRooms(MURS).map((r, i) => ({ id: `room-${i + 1}`, wallIds: r.wallIds }));
const NORD = MURS.find((w) => Math.abs(w.a.z) < 1e-6 && Math.abs(w.b.z) < 1e-6)!;
/** La face du mur nord tournée vers la pièce (les z positifs). */
const COTE: 1 | -1 = wallFace(NORD, undefined, 1).nz > 0 ? 1 : -1;

const poser = (kind: FixtureKind, o: Partial<Fixture> = {}): Fixture => ({
  id: `f-${kind}`,
  kind,
  wallId: NORD.id,
  along: 2,
  height: FIXTURES[kind].std,
  side: COTE,
  ...o,
});

const scene = (fixtures: Fixture[], ceiling: CeilingFixture[] = []) =>
  buildScene(MURS, [], [], { palette: PAL, rooms: ROOMS as never, showSurfaces: true, fixtures, ceiling });

/** Les sommets posés d'un ensemble de groupes, avec leur matière. */
function sommets(groupes: { mat: string; v: number[] }[]) {
  const out: { x: number; y: number; z: number; mat: string }[] = [];
  for (const g of groupes) {
    for (let k = 0; k < g.v.length; k += PAR_SOMMET) out.push({ x: g.v[k], y: g.v[k + 1], z: g.v[k + 2], mat: g.mat });
  }
  return out;
}

const TOUS: FixtureKind[] = Object.keys(FIXTURES) as FixtureKind[];

describe('chaque appareil du catalogue a son vrai modèle, à sa place', () => {
  it.each(TOUS.map((k) => [k]))('%s', (kind) => {
    const s = scene([poser(kind)]);
    const poses = s.appareils ?? [];
    expect(poses.length).toBe(1);
    const p = poses[0];
    expect(p.wallId).toBe(NORD.id);
    const pts = sommets(groupesDesAppareils(poses));
    expect(pts.length).toBeGreaterThan(40);
    // Contre SON mur, côté pièce : rien ne traverse la maçonnerie (z ≥ 0 ici,
    // le nu est à quelques centimètres), rien ne flotte à plus de 12 cm.
    const nu = Math.min(...pts.map((q) => q.z));
    expect(Math.max(...pts.map((q) => q.z)) - nu).toBeLessThan(0.12);
    // À sa hauteur, et à son abscisse.
    const cy = (Math.min(...pts.map((q) => q.y)) + Math.max(...pts.map((q) => q.y))) / 2;
    const cx = (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2;
    if (kind !== 'sortieCable') expect(Math.abs(cy - FIXTURES[kind].std)).toBeLessThan(0.01);
    expect(Math.abs(cx - 2)).toBeLessThan(0.02);
  });
});

describe('une plaque, des fenêtres', () => {
  it('une double prise est UNE plaque à deux postes', () => {
    const [p] = scene([poser('prise2')]).appareils ?? [];
    expect(p.genre).toBe('plaque');
    expect(p.postes?.map((q) => q.kind)).toEqual(['prise', 'prise']);
    expect(p.largeur!).toBeCloseTo(0.071 + 0.082, 3);
  });

  it('deux prises réunies à la main aussi — pas deux plaques collées', () => {
    const a = poser('prise', { id: 'a', along: 2, group: 'g' });
    const b = poser('prise', { id: 'b', along: 2.071, group: 'g' });
    const poses = scene([a, b]).appareils ?? [];
    expect(poses).toHaveLength(1);
    expect(poses[0].postes).toHaveLength(2);
  });

  it('un « RJ45 + prise » garde l’ordre de ses postes', () => {
    const [p] = scene([poser('rjPrise')]).appareils ?? [];
    expect(p.postes?.map((q) => q.kind)).toEqual(['rj45', 'prise']);
    expect(p.postes![0].dx).toBeLessThan(p.postes![1].dx);
  });
});

describe('ce qui fait l’objet est là', () => {
  const matieres = (p: PoseDAppareil) => new Set(fabriquerAppareil(p).groupes.map((g) => `${g.mat}`));
  const pose = (kind: FixtureKind) => (scene([poser(kind)]).appareils ?? [])[0];

  it('une prise : ses alvéoles noires et sa broche de terre chromée', () => {
    const m = matieres(pose('prise'));
    expect(m.has('noir')).toBe(true);
    expect(m.has('chrome')).toBe(true);
  });

  it('un interrupteur n’a ni alvéole ni broche', () => {
    const m = matieres(pose('inter'));
    expect(m.has('noir')).toBe(false);
    expect(m.has('chrome')).toBe(false);
  });

  it('un tableau : sa porte fumée, et ses manettes', () => {
    const modele = fabriquerAppareil(pose('tableau'));
    expect(modele.groupes.some((g) => g.mat === 'verre')).toBe(true);
    const manettes = modele.groupes.find((g) => g.mat === 'noir')!;
    // Une trentaine de manettes : des boîtes de douze triangles.
    expect(manettes.i.length / 3).toBeGreaterThan(30 * 12);
  });

  it('une applique éclaire, en haut et en bas', () => {
    const lum = fabriquerAppareil(pose('applique')).groupes.find((g) => g.mat === 'lumiere')!;
    expect(lum).toBeDefined();
    // En centimètres, dans le repère de l'appareil : une ouverture au-dessus
    // de son axe, une au-dessous.
    const ys = sommets([lum]).map((q) => q.y);
    expect(Math.min(...ys)).toBeLessThan(-1.5);
    expect(Math.max(...ys)).toBeGreaterThan(1.5);
  });

  it('plus aucune teinte de famille dans le rendu : elles restent au plan', () => {
    const familles = new Set(TOUS.map((k) => FIXTURES[k].color.toUpperCase()));
    const poses = scene(TOUS.map((k, i) => poser(k, { id: `f${i}`, along: 0.3 + (i % 8) * 0.45, height: 0.3 + Math.floor(i / 8) * 0.8 }))).appareils ?? [];
    for (const g of groupesDesAppareils(poses)) expect(familles.has(g.couleur.toUpperCase())).toBe(false);
  });
});

describe('au plafond', () => {
  const HAUT = 2.5;
  it.each(CEILING_KINDS.map((k) => [k]))('%s pend sous le plafond, à sa place', (kind) => {
    const cl: CeilingFixture = { id: `c-${kind}`, kind, roomId: 'room-1', at: { x: 2, z: 1.5 } };
    const poses = (scene([], [cl]).appareils ?? []).filter((p) => p.genre === 'plafond');
    expect(poses).toHaveLength(1);
    const pts = sommets(groupesDesAppareils(poses));
    expect(pts.length).toBeGreaterThan(40);
    expect(Math.max(...pts.map((q) => q.y))).toBeLessThanOrEqual(HAUT + 1e-6);
    // Le centre du corps (les pales d'un ventilateur, à trois, ne sont pas
    // symétriques dans une boîte englobante).
    const corps = pts.filter((q) => q.mat === 'laque');
    const cx = (Math.min(...corps.map((q) => q.x)) + Math.max(...corps.map((q) => q.x))) / 2;
    expect(Math.abs(cx - 2)).toBeLessThan(0.01);
  });

  it('un ventilateur se voit à son envergure : 1,10 m de pales', () => {
    const cl: CeilingFixture = { id: 'v', kind: 'ventilateur', roomId: 'room-1', at: { x: 2, z: 1.5 } };
    const pts = sommets(groupesDesAppareils(scene([], [cl]).appareils ?? []));
    const bois = pts.filter((q) => q.mat === 'bois');
    const r = Math.max(...bois.map((q) => Math.hypot(q.x - 2, q.z - 1.5)));
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.6);
  });

  it('un spot, une DCL, un plafonnier éclairent', () => {
    for (const kind of ['spot', 'dcl', 'applique'] as const) {
      const cl: CeilingFixture = { id: kind, kind, roomId: 'room-1', at: { x: 2, z: 1.5 } };
      const g = groupesDesAppareils(scene([], [cl]).appareils ?? []);
      expect(g.some((x) => x.mat === 'lumiere')).toBe(true);
    }
  });
});

describe('aucune face retournée, des normales unitaires', () => {
  const poses: PoseDAppareil[] = [
    ...(scene(TOUS.map((k, i) => poser(k, { id: `f${i}`, along: 0.3 + (i % 8) * 0.45, height: 0.3 + Math.floor(i / 8) * 0.8 }))).appareils ?? []),
    ...(scene([], CEILING_KINDS.map((k, i) => ({ id: `c${i}`, kind: k, roomId: 'room-1', at: { x: 0.5 + i * 0.4, z: 1.5 } }))).appareils ?? []),
  ];
  it.each(poses.map((p) => [`${p.genre} ${p.plafond ?? (p.postes ?? []).map((q) => q.kind).join('+')}`, p] as const))('%s', (_n, p) => {
    let retournees = 0;
    let comptees = 0;
    for (const g of groupesDesAppareils([p])) {
      if (g.mat === 'verre') continue;
      const P = (k: number) => [g.v[k * PAR_SOMMET], g.v[k * PAR_SOMMET + 1], g.v[k * PAR_SOMMET + 2]];
      const N = (k: number) => [g.v[k * PAR_SOMMET + 3], g.v[k * PAR_SOMMET + 4], g.v[k * PAR_SOMMET + 5]];
      for (let t = 0; t < g.i.length; t += 3) {
        const [a, b, c] = [g.i[t], g.i[t + 1], g.i[t + 2]];
        const [pa, pb, pc] = [P(a), P(b), P(c)];
        const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (Math.hypot(n[0], n[1], n[2]) < 1e-12) continue;
        const moy = [0, 1, 2].map((i) => N(a)[i] + N(b)[i] + N(c)[i]);
        comptees++;
        if (n[0] * moy[0] + n[1] * moy[1] + n[2] * moy[2] < 0) retournees++;
      }
      for (let k = 0; k < g.v.length / PAR_SOMMET; k++) expect(Math.hypot(...N(k))).toBeCloseTo(1, 4);
    }
    expect(comptees).toBeGreaterThan(10);
    expect(retournees).toBe(0);
  });
});

describe('la carte graphique reçoit les vrais, plus les caisses', () => {
  const fixtures = [poser('prise2'), poser('tableau', { id: 't', along: 1, height: 1.4 }), poser('applique', { id: 'ap', along: 3.2, height: 1.9 })];
  const ceiling: CeilingFixture[] = [{ id: 'c', kind: 'spot', roomId: 'room-1', at: { x: 2, z: 1.5 } }];
  const s = scene(fixtures, ceiling);

  it('les caisses d’appareils sont marquées, et retirées du maillage natif', () => {
    expect(s.faces.some((f) => f.appareil)).toBe(true);
    const avec = maillageDeLaMaquette(s.faces);
    const sans = maillageDeLaMaquette(s.faces, { sansMeubles: true });
    expect(sans.maillage.length + sans.orientes.length).toBeLessThan(avec.maillage.length + avec.orientes.length);
    const visite = maillageDeLaVisite(s.faces, { sansMeubles: true });
    const visiteAvec = maillageDeLaVisite(s.faces);
    expect(JSON.stringify(visite).length).toBeLessThan(JSON.stringify(visiteAvec).length);
  });

  it('le flux des meubles porte l’appareillage, lumière comprise, et reste bien formé', () => {
    const flux = maillageDesMeubles([], groupesDesAppareils(s.appareils ?? []));
    expect(flux.every((x) => Number.isFinite(x))).toBe(true);
    let k = 0;
    const codes = new Set<number>();
    while (k < flux.length) {
      codes.add(flux[k]);
      const nS = flux[k + 6];
      const nI = flux[k + 7];
      const idx = flux.slice(k + 8 + nS * PAR_SOMMET, k + 8 + nS * PAR_SOMMET + nI);
      expect(idx.every((i) => Number.isInteger(i) && i >= 0 && i < nS)).toBe(true);
      k += 8 + nS * PAR_SOMMET + nI;
    }
    expect(k).toBe(flux.length);
    expect(codes.has(RENDU.lumiere.code)).toBe(true);
    expect(codes.has(RENDU.verre.code)).toBe(true);
  });
});
