/**
 * L'ENTRÉE EN VISITE NE GÈLE PLUS — et elle choisit le même point de vue.
 *
 * Relevé des testeurs (« entrée en visite et pont natif lourds ») : « à
 * l'ouverture de la visite et à chaque pastille « Aller dans », le choix du
 * point de vue lance jusqu'à 9 600 tests d'obstacles (…) 0,27 à 0,79 s sous
 * Node, soit sans doute 1 s ou plus sur iPhone. »
 *
 * Le lancer de rayons de `pointDeDepart` ne consulte plus que les obstacles
 * proches, et chacun sur le seul tronçon du rayon qu'il peut barrer. CE BANC
 * GARDE L'ANCIEN CALCUL, RECOPIÉ TEL QUEL, et exige le même résultat — au
 * bit près, pas à un centimètre près — sur l'appartement d'exemple, sur un
 * plan de douze pièces très meublées, et sur des centaines de plans tirés au
 * sort (meubles de biais, écrasés, murs obliques, rayons frôlant un coin).
 *
 * Puis il mesure : l'ancien calcul et le nouveau, sur le même plan lourd.
 *
 * LE RECUL D'ENTRÉE A CHANGÉ, VOLONTAIREMENT (revue « 3D / visite » : « on
 * entre le nez contre un fauteuil ») : il ne va plus toujours au plus loin,
 * il retient le recul qui éloigne le plus du meuble visible le plus proche
 * (voir `reculDEntree`, éprouvé dans `gain-visite.test.ts`). L'ancien calcul
 * recopié ici finit donc par le MÊME recul — ce banc juge le lancer de
 * rayons et le tri des obstacles, pas le recul.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ObjectData } from 'react-native-room-scan';
import {
  RAYON_VISITEUR,
  courseLibre,
  obstaclesDeLaVisite,
  pointDeDepart,
  reculDEntree,
  type Obstacle,
} from '../src/geometry/exploration';
import { roomParts, type Pt, type RoomShape, type WallSeg } from '../src/geometry/floorplan';
import { appartementExemple } from '../src/data/exemple';

// ------------------------------------------------- l'ancien calcul, tel quel

function plusProcheSurSegment(p: Pt, a: Pt, b: Pt): Pt {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  if (l2 < 1e-12) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
  return { x: a.x + t * vx, z: a.z + t * vz };
}

function dedans(p: Pt, poly: Pt[]): boolean {
  let oui = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      oui = !oui;
    }
  }
  return oui;
}

function plusProcheSurBord(p: Pt, poly: Pt[]): Pt {
  let mieux = poly[0];
  let d2 = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const c = plusProcheSurSegment(p, poly[i], poly[(i + 1) % poly.length]);
    const e = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
    if (e < d2) {
      d2 = e;
      mieux = c;
    }
  }
  return mieux;
}

let testsDObstacles = 0;
function ancienEstLibre(p: Pt, obstacles: Obstacle[], rayon = RAYON_VISITEUR): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
  for (const o of obstacles) {
    testsDObstacles++;
    if (o.kind === 'mur') {
      const c = plusProcheSurSegment(p, o.a, o.b);
      if (Math.hypot(p.x - c.x, p.z - c.z) < o.demi + rayon - 1e-4) return false;
    } else {
      if (dedans(p, o.coins)) return false;
      const c = plusProcheSurBord(p, o.coins);
      if (Math.hypot(p.x - c.x, p.z - c.z) < rayon - 1e-4) return false;
    }
  }
  return true;
}

function ancienneCourse(at: Pt, t: number, obstacles: Obstacle[], rayon = RAYON_VISITEUR): number {
  let course = 0;
  while (course < 15) {
    const q = { x: at.x + Math.cos(t) * (course + 0.05), z: at.z + Math.sin(t) * (course + 0.05) };
    if (!ancienEstLibre(q, obstacles, rayon)) break;
    course += 0.05;
  }
  return course;
}

/** `pointDeDepart` d'avant (commit e155484), recopié sans y toucher — sauf le recul, voir l'en-tête. */
function ancienPointDeDepart(
  walls: WallSeg[],
  rooms: RoomShape[],
  obstacles: Obstacle[],
  rayon = RAYON_VISITEUR,
  pieceVoulue?: string | null,
): { at: Pt; yaw: number } | null {
  if (walls.length === 0) return null;
  const parts = roomParts(walls, rooms).filter((p) => p.surface);
  const grande =
    (pieceVoulue ? parts.find((p) => p.roomId === pieceVoulue) : undefined) ??
    [...parts].sort((a, b) => (b.surface?.area ?? 0) - (a.surface?.area ?? 0))[0];
  const centre: Pt = grande
    ? grande.labelAt
    : {
        x: walls.reduce((t, w) => t + (w.a.x + w.b.x) / 2, 0) / walls.length,
        z: walls.reduce((t, w) => t + (w.a.z + w.b.z) / 2, 0) / walls.length,
      };
  const contour = grande?.surface?.pts;
  const recevable = (p: Pt, marge: number) =>
    ancienEstLibre(p, obstacles, marge) && (!contour || dedans(p, contour));

  let at: Pt | null = null;
  for (const marge of [rayon * 2, rayon]) {
    if (recevable(centre, marge)) {
      at = centre;
      break;
    }
    for (let r = 0.1; r <= 4 && !at; r += 0.1) {
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * Math.PI * 2;
        const q = { x: centre.x + Math.cos(t) * r, z: centre.z + Math.sin(t) * r };
        if (recevable(q, marge)) {
          at = q;
          break;
        }
      }
    }
    if (at) break;
  }
  if (!at) return null;

  let yaw = 0;
  let mieux = -1;
  for (let k = 0; k < 32; k++) {
    const t = (k / 32) * Math.PI * 2;
    let course = 0;
    while (course < 15) {
      const q = { x: at.x + Math.cos(t) * (course + 0.05), z: at.z + Math.sin(t) * (course + 0.05) };
      if (!ancienEstLibre(q, obstacles, rayon)) break;
      course += 0.05;
    }
    if (course > mieux + 1e-6) {
      mieux = course;
      yaw = t;
    }
  }

  // Le recul : le nouveau, sur l'ancien test de recevabilité (voir l'en-tête).
  const ici = reculDEntree(at, yaw, (q) => recevable(q, rayon * 2), obstacles, contour);
  return { at: ici, yaw };
}

// ------------------------------------------------------------ les plans

/** Un tirage reproductible (mulberry32). */
function hasard(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

const meuble = (
  id: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  lacet: number,
  roomId?: string,
): ObjectData => {
  const c = Math.cos(lacet);
  const s = Math.sin(lacet);
  return {
    id,
    category: 'storage',
    width: w,
    depth: d,
    height: h,
    roomId,
    transform: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, cx, h / 2, cz, 1],
  };
};

/**
 * UNE GRILLE DE PIÈCES — `nx` × `nz` pièces de `l` × `p` m, une porte de
 * 80 cm au milieu de chaque cloison, `n` meubles par pièce posés au hasard
 * (de biais, parfois minuscules, parfois écrasés).
 */
function grille(nx: number, nz: number, l: number, p: number, n: number, graine: number) {
  const rnd = hasard(graine);
  const walls: WallSeg[] = [];
  const openings: WallSeg[] = [];
  const rooms: RoomShape[] = [];
  const objects: ObjectData[] = [];
  const id = (i: number, j: number, cote: string) => `m-${i}-${j}-${cote}`;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = i * l;
      const z0 = j * p;
      walls.push(mur(id(i, j, 'n'), x0, z0, x0 + l, z0));
      walls.push(mur(id(i, j, 'o'), x0, z0, x0, z0 + p));
      if (j === nz - 1) walls.push(mur(id(i, j, 's'), x0, z0 + p, x0 + l, z0 + p));
      if (i === nx - 1) walls.push(mur(id(i, j, 'e'), x0 + l, z0, x0 + l, z0 + p));
      if (i > 0) openings.push({ ...mur(`po-${i}-${j}`, x0, z0 + p / 2 - 0.4, x0, z0 + p / 2 + 0.4), type: 'door' });
      if (j > 0) openings.push({ ...mur(`pn-${i}-${j}`, x0 + l / 2 - 0.4, z0, x0 + l / 2 + 0.4, z0), type: 'door' });
      const roomId = `piece-${i}-${j}`;
      rooms.push({
        id: roomId,
        wallIds: [
          id(i, j, 'n'),
          j === nz - 1 ? id(i, j, 's') : id(i, j + 1, 'n'),
          id(i, j, 'o'),
          i === nx - 1 ? id(i, j, 'e') : id(i + 1, j, 'o'),
        ],
      });
      for (let k = 0; k < n; k++) {
        const w = rnd() < 0.1 ? rnd() * 0.05 : 0.2 + rnd() * 1.6;
        const d = rnd() < 0.1 ? rnd() * 0.05 : 0.2 + rnd() * 0.9;
        objects.push(
          meuble(
            `${roomId}-${k}`,
            x0 + 0.2 + rnd() * (l - 0.4),
            z0 + 0.2 + rnd() * (p - 0.4),
            w,
            d,
            0.3 + rnd() * 1.6,
            rnd() < 0.5 ? 0 : rnd() * Math.PI * 2,
            roomId,
          ),
        );
      }
    }
  }
  return { walls, openings, rooms, objects };
}

/** Des obstacles bruts, sans plan : murs obliques et emprises de biais, partout. */
function obstaclesEnVrac(n: number, graine: number, autour: Pt): Obstacle[] {
  const rnd = hasard(graine);
  const out: Obstacle[] = [];
  for (let i = 0; i < n; i++) {
    const cx = autour.x + (rnd() - 0.5) * 30;
    const cz = autour.z + (rnd() - 0.5) * 30;
    if (rnd() < 0.5) {
      const t = rnd() * Math.PI * 2;
      const l = rnd() < 0.1 ? 0 : rnd() * 4;
      out.push({
        kind: 'mur',
        a: { x: cx, z: cz },
        b: { x: cx + Math.cos(t) * l, z: cz + Math.sin(t) * l },
        demi: rnd() * 0.15,
      });
    } else {
      const t = rnd() * Math.PI * 2;
      const w2 = (rnd() < 0.1 ? 0 : rnd()) * (rnd() < 0.5 ? 1 : -1);
      const d2 = rnd() * 0.6;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const coin = (lx: number, lz: number): Pt => ({ x: cx + lx * c - lz * s, z: cz + lx * s + lz * c });
      out.push({ kind: 'meuble', id: `v${i}`, coins: [coin(-w2, -d2), coin(w2, -d2), coin(w2, d2), coin(-w2, d2)] });
    }
  }
  return out;
}

const EX = appartementExemple();
const OBST_EX = obstaclesDeLaVisite(EX.walls, EX.openings, EX.objects, EX.rooms);
/** Le plan lourd des testeurs : douze pièces, trente meubles chacune. */
const LOURD = grille(4, 3, 4.5, 4, 30, 12);
const OBST_LOURD = obstaclesDeLaVisite(LOURD.walls, LOURD.openings, LOURD.objects, LOURD.rooms);

// ------------------------------------------------------------- les bancs

describe('le point de vue de la visite : le même qu’avant, au bit près', () => {
  it('dans l’appartement d’exemple, pour chaque pièce et sans pièce voulue', () => {
    expect(OBST_EX.length).toBeGreaterThan(20);
    for (const piece of [undefined, ...EX.rooms.map((r) => r.id)]) {
      const avant = ancienPointDeDepart(EX.walls, EX.rooms, OBST_EX, RAYON_VISITEUR, piece);
      const apres = pointDeDepart(EX.walls, EX.rooms, OBST_EX, RAYON_VISITEUR, piece);
      expect(avant).not.toBeNull();
      expect(apres).toStrictEqual(avant);
    }
  });

  it('dans un plan de douze pièces très meublé', () => {
    expect(OBST_LOURD.length).toBeGreaterThan(300);
    for (const piece of [undefined, ...LOURD.rooms.map((r) => r.id)]) {
      const avant = ancienPointDeDepart(LOURD.walls, LOURD.rooms, OBST_LOURD, RAYON_VISITEUR, piece);
      expect(pointDeDepart(LOURD.walls, LOURD.rooms, OBST_LOURD, RAYON_VISITEUR, piece)).toStrictEqual(avant);
    }
  });

  it('sur des plans tirés au sort, et sans pièce du tout', () => {
    let trouves = 0;
    for (let g = 0; g < 40; g++) {
      const rnd = hasard(1000 + g);
      const plan = grille(1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 3), 2 + rnd() * 5, 2 + rnd() * 4, Math.floor(rnd() * 25), g);
      const obst = obstaclesDeLaVisite(plan.walls, plan.openings, plan.objects, plan.rooms);
      const rayon = [RAYON_VISITEUR, 0.1, 0.3][g % 3];
      const piece = rnd() < 0.5 ? undefined : plan.rooms[Math.floor(rnd() * plan.rooms.length)].id;
      for (const rooms of [plan.rooms, []]) {
        const avant = ancienPointDeDepart(plan.walls, rooms, obst, rayon, piece);
        if (avant) trouves++;
        expect(pointDeDepart(plan.walls, rooms, obst, rayon, piece)).toStrictEqual(avant);
      }
    }
    // Le banc éprouve bien des entrées, pas seulement des refus.
    expect(trouves).toBeGreaterThan(50);
  });

  it('course par course, dans les trente-deux directions, au milieu d’obstacles en vrac', () => {
    /*
      Le point de vue ne dit que la direction GAGNANTE ; ici, chaque course
      est comparée — un jalon de travers dans une direction perdante se
      verrait aussi. Des obstacles partout, des murs de longueur nulle, des
      emprises retournées ou écrasées, et des origines tirées au sort.
    */
    let comparees = 0;
    for (let g = 0; g < 30; g++) {
      const rnd = hasard(5000 + g);
      const at = { x: (rnd() - 0.5) * 10, z: (rnd() - 0.5) * 10 };
      const obst = obstaclesEnVrac(40 + Math.floor(rnd() * 150), g, at);
      const rayon = [RAYON_VISITEUR, 0.05, 0.4][g % 3];
      for (let k = 0; k < 32; k++) {
        const t = (k / 32) * Math.PI * 2;
        expect(courseLibre(at, t, obst, rayon)).toBe(ancienneCourse(at, t, obst, rayon));
        comparees++;
      }
    }
    expect(comparees).toBe(30 * 32);
  });

  it('des nombres non finis, un rayon nul : toujours le même choix', () => {
    /*
      Un obstacle illisible n'arrête rien dans l'ancien calcul (ses
      comparaisons sont fausses) : le nouveau ne doit ni planter ni en
      décider autrement. Un rayon nul : seul l'intérieur d'un meuble arrête.
    */
    const plan = grille(2, 2, 4, 3.5, 8, 77);
    const illisibles: Obstacle[] = [
      { kind: 'mur', a: { x: NaN, z: 1 }, b: { x: 3, z: 1 }, demi: 0.05 },
      { kind: 'mur', a: { x: 1, z: 1 }, b: { x: Infinity, z: 2 }, demi: 0.05 },
      { kind: 'mur', a: { x: 1, z: 1 }, b: { x: 3, z: 2 }, demi: NaN },
      { kind: 'meuble', id: 'nan', coins: [{ x: 1, z: 1 }, { x: NaN, z: 1 }, { x: 2, z: 2 }, { x: 1, z: 2 }] },
      { kind: 'meuble', id: 'tri', coins: [{ x: 6, z: 1 }, { x: 7, z: 1 }, { x: 6.5, z: 2 }] },
    ];
    const obst = [...obstaclesDeLaVisite(plan.walls, plan.openings, plan.objects, plan.rooms), ...illisibles];
    for (const rayon of [RAYON_VISITEUR, 0, 0.001]) {
      for (const piece of [undefined, ...plan.rooms.map((r) => r.id)]) {
        const avant = ancienPointDeDepart(plan.walls, plan.rooms, obst, rayon, piece);
        expect(pointDeDepart(plan.walls, plan.rooms, obst, rayon, piece)).toStrictEqual(avant);
      }
      for (let k = 0; k < 32; k++) {
        const t = (k / 32) * Math.PI * 2;
        expect(courseLibre({ x: 2, z: 1.7 }, t, obst, rayon)).toBe(ancienneCourse({ x: 2, z: 1.7 }, t, obst, rayon));
      }
    }
  });

  it('un rayon qui frôle un coin ou un bout de mur : jalon pour jalon', () => {
    /*
      Le cas qui trahirait un tronçon trop juste : l'obstacle n'est touché
      que par un jalon ou deux, au ras de sa marge. On place le bout d'un mur
      et le coin d'un meuble à (demi-épaisseur + rayon) du rayon, à un
      dixième de millimètre près, de part et d'autre.
    */
    const at = { x: 0, z: 0 };
    for (const ecart of [-2e-4, -1.01e-4, -1e-4, -0.99e-4, 0, 1e-4, 2e-4]) {
      for (const k of [0, 3, 8, 13]) {
        const t = (k / 32) * Math.PI * 2;
        const ux = Math.cos(t);
        const uz = Math.sin(t);
        const nx = -uz;
        const nz = ux;
        // Pile sur un jalon : la corde barrée, d'un centimètre à peine, l'entoure.
        const loin = 3;
        const bord = 0.05 + RAYON_VISITEUR + ecart;
        const obst: Obstacle[] = [
          {
            kind: 'mur',
            a: { x: ux * loin + nx * bord, z: uz * loin + nz * bord },
            b: { x: ux * loin + nx * (bord + 1), z: uz * loin + nz * (bord + 1) },
            demi: 0.05,
          },
          {
            kind: 'meuble',
            id: 'coin',
            coins: [
              { x: ux * 6 - nx * (RAYON_VISITEUR + ecart), z: uz * 6 - nz * (RAYON_VISITEUR + ecart) },
              { x: ux * 6.48 - nx * (RAYON_VISITEUR + ecart + 0.5), z: uz * 6.48 - nz * (RAYON_VISITEUR + ecart + 0.5) },
              { x: ux * 5.98 - nx * (RAYON_VISITEUR + ecart + 1), z: uz * 5.98 - nz * (RAYON_VISITEUR + ecart + 1) },
              { x: ux * 5.48 - nx * (RAYON_VISITEUR + ecart + 0.5), z: uz * 5.48 - nz * (RAYON_VISITEUR + ecart + 0.5) },
            ],
          },
        ];
        const c = ancienneCourse(at, t, obst);
        expect(courseLibre(at, t, obst, RAYON_VISITEUR)).toBe(c);
        // Le banc frôle vraiment : à 2/10 de mm dedans, le bout du mur arrête au jalon de 3 m ;
        // dehors, seul le coin du meuble peut encore arrêter.
        if (ecart === -2e-4) expect(c).toBeCloseTo(2.95, 6);
        if (ecart === 0) expect(c).toBeCloseTo(15, 6);
        // Le meuble seul : son coin arrête au jalon de 6 m quand on le frôle par dedans.
        if (ecart === -2e-4) expect(ancienneCourse(at, t, [obst[1]])).toBeCloseTo(5.95, 6);
        if (ecart === -2e-4) expect(courseLibre(at, t, [obst[1]], RAYON_VISITEUR)).toBe(ancienneCourse(at, t, [obst[1]]));
        // Un meuble droit, son long côté PARALLÈLE au rayon : la bande barrée est exactement
        // celle de la tranche de ce côté, sans la marge d'un coin vif.
        const l0 = RAYON_VISITEUR + ecart;
        const pt = (le: number, tr: number): Pt => ({ x: ux * le - nx * tr, z: uz * le - nz * tr });
        const longe: Obstacle = { kind: 'meuble', id: 'longe', coins: [pt(6, l0), pt(7, l0), pt(7, l0 + 0.6), pt(6, l0 + 0.6)] };
        const cl = ancienneCourse(at, t, [longe]);
        expect(courseLibre(at, t, [longe], RAYON_VISITEUR)).toBe(cl);
        if (ecart === -2e-4) expect(cl).toBeCloseTo(5.95, 6);
      }
    }
  });
});

// -------------------------------------------------------------- la mesure

describe('la mesure — avant / après, sur le plan lourd', () => {
  it('le nouveau choix est bien plus rapide que l’ancien', () => {
    const chrono = (f: () => void, n: number) => {
      f(); // à chaud
      const t0 = performance.now();
      for (let i = 0; i < n; i++) f();
      return (performance.now() - t0) / n;
    };
    const pieces = [undefined, ...LOURD.rooms.map((r) => r.id)];
    let i = 0;
    const avant = chrono(() => {
      ancienPointDeDepart(LOURD.walls, LOURD.rooms, OBST_LOURD, RAYON_VISITEUR, pieces[i++ % pieces.length]);
    }, 13);
    i = 0;
    const apres = chrono(() => {
      pointDeDepart(LOURD.walls, LOURD.rooms, OBST_LOURD, RAYON_VISITEUR, pieces[i++ % pieces.length]);
    }, 13);
    // Le nombre de tests d'obstacles de l'ancien calcul, pour la pièce la plus grande.
    testsDObstacles = 0;
    ancienPointDeDepart(LOURD.walls, LOURD.rooms, OBST_LOURD);
    const tests = testsDObstacles;
    const exAvant = chrono(() => ancienPointDeDepart(EX.walls, EX.rooms, OBST_EX), 20);
    const exApres = chrono(() => pointDeDepart(EX.walls, EX.rooms, OBST_EX), 20);
    // eslint-disable-next-line no-console
    console.log(
      `pointDeDepart — plan lourd (${OBST_LOURD.length} obstacles, ${tests} tests d'obstacles avant) : ` +
        `${avant.toFixed(1)} ms → ${apres.toFixed(2)} ms (×${(avant / apres).toFixed(0)}) ; ` +
        `exemple (${OBST_EX.length} obstacles) : ${exAvant.toFixed(1)} ms → ${exApres.toFixed(2)} ms`,
    );
    // Large, pour une machine occupée : le gain mesuré est bien au-delà.
    expect(apres * 5).toBeLessThan(avant);
  });
});

// ------------------------------------------------- le pont natif, côté Swift

/*
  LE LOGEMENT SE BÂTIT SUR UNE FILE DE FOND (RoomScanVisite.swift). Le Swift
  ne se compile pas ici : ce banc relit la source pour garder les règles
  qui comptent — copier avant de partir, ne jamais tenir la vue depuis la
  file, jeter une construction dépassée, n'annoncer la première image
  qu'une fois le bâti accroché — et vérifie que les accolades se ferment.
*/
describe('la visite native se bâtit hors du fil de l’interface', () => {
  const swift = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScanVisite.swift'), 'utf8');
  /** Le corps d'une fonction, de sa signature à l'accolade qui la ferme. */
  const corps = (signature: string) => {
    const debut = swift.indexOf(signature);
    expect(debut).toBeGreaterThan(0);
    let i = swift.indexOf('{', debut + signature.length - 1);
    let n = 0;
    for (; i < swift.length; i++) {
      if (swift[i] === '{') n++;
      if (swift[i] === '}' && --n === 0) break;
    }
    return swift.slice(debut, i + 1);
  };

  it('les accolades, parenthèses et crochets se ferment (hors commentaires et chaînes)', () => {
    let s = swift.replace(/"""[\s\S]*?"""/g, '""');
    // Commentaires de bloc, qui s'imbriquent en Swift.
    let sans = '';
    let prof = 0;
    for (let i = 0; i < s.length; i++) {
      if (s.startsWith('/*', i)) {
        prof++;
        i++;
      } else if (prof > 0 && s.startsWith('*/', i)) {
        prof--;
        i++;
      } else if (prof === 0) {
        sans += s[i];
      }
    }
    expect(prof).toBe(0);
    s = sans.replace(/\/\/[^\n]*/g, '').replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    for (const [o, f] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      let n = 0;
      let jamaisNegatif = true;
      for (const c of s) {
        if (c === o) n++;
        if (c === f) n--;
        if (n < 0) jamaisNegatif = false;
      }
      expect(`${o}${f} ${n} ${jamaisNegatif}`).toBe(`${o}${f} 0 true`);
    }
  });

  it('la reconstruction part sur une file en série, avec des copies et une vue faible', () => {
    expect(swift).toContain('private static let chantier = DispatchQueue(label: "echoplan.visite.chantier", qos: .userInitiated)');
    const rb = corps('private func rebatirMaintenant()');
    // Aucune géométrie fabriquée sur le fil principal.
    expect(rb).not.toMatch(/geometrie\(|noeudsDes|noeudsTextures|addChildNode/);
    expect(rb).toContain('weak var vue = self');
    expect(rb).toContain('let s = sale.union(enChantier)');
    // La partie qui s'exécute sur la file ne nomme jamais la vue.
    const fond = rb.slice(rb.indexOf('RoomScanVisite.chantier.async {'));
    expect(fond).not.toMatch(/\bself\b|\bSelf\b/);
    expect(fond).toContain('guard compteur.estToujours(commande.numero) else { return }');
    expect(fond).toContain('vue?.accrocher(ouvrage, numero: commande.numero)');
  });

  it('la commande ne porte que des valeurs : ni matière partagée, ni vue', () => {
    const c = corps('private struct Commande');
    expect(c).not.toMatch(/SCNMaterial|SCNNode|RoomScanVisite|UIView/);
    expect(c).toMatch(/let maillage: \[Float\]/);
  });

  it('les fabriques sont statiques : elles ne peuvent rien lire de la vue', () => {
    for (const f of ['geometrie', 'noeudDesAretes', 'noeudsDesSols', 'noeudsTextures', 'noeudsDesMeubles', 'noeudDeContour', 'materiauDuMeuble', 'imageDuSol', 'dessinerLeSol']) {
      expect(`${f} : ${swift.includes(`private static func ${f}(`)}`).toBe(`${f} : true`);
      expect(swift).not.toContain(`private func ${f}(`);
    }
    const cons = corps('private static func construire(');
    expect(cons).toContain('SCNTransaction.begin()');
    expect(cons).toContain('defer { SCNTransaction.commit() }');
    expect((cons.match(/guard numero\.estToujours\(c\.numero\) else \{ return nil \}/g) ?? []).length).toBe(3);
  });

  it('l’accrochage, sur le fil principal, jette ce qui est dépassé et annonce la première image', () => {
    const a = corps('private func accrocher(');
    expect(a).toContain('guard let o = ouvrage, numero.estToujours(n) else { return }');
    expect(a).toContain('enChantier = []');
    // La clarté du mode est posée à l'accrochage, et l'écorché revoilé.
    expect(a).toMatch(/forKey: "clarte"\)[\s\S]*forKey: "clarteFlancs"\)/);
    expect(a).toContain('appliquerVoile()');
    expect(a).toContain('[matiereContour]');
    expect(a).toContain('[diffuseurEteint]');
    expect(a.indexOf('if !premiereAnnoncee && !gBati.childNodes.isEmpty { guetteLaPremiere = true }')).toBeGreaterThan(
      a.indexOf('gBati.addChildNode'),
    );
    // Le compteur est protégé : la file le lit pendant que le fil principal l'avance.
    const n = corps('private final class Numero');
    expect((n.match(/verrou\.lock\(\)/g) ?? []).length).toBe(2);
    expect((n.match(/defer \{ verrou\.unlock\(\) \}/g) ?? []).length).toBe(2);
  });
});
