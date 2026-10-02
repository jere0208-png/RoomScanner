/**
 * L'EXPLORATION — se promener DANS le logement relevé, comme dans un jeu.
 *
 * Relevé du patron : « ajoute un vrai mode où l'on rentre dans la pièce créée,
 * sous forme de point qui se balade avec nos déplacements comme un jeu vidéo
 * mobile, avec collisions sur murs et meubles etc. »
 *
 * Ce fichier ne dessine rien : il dit ce qui ARRÊTE et ce qui LAISSE PASSER,
 * et où l'on se trouve après un pas. Le dessin est celui de la 3D, à hauteur
 * d'œil — elle sait désormais montrer un sol et un plafond de l'intérieur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « UN VRAI MODE » — PARCE QU'IL Y EN A EU UN FAUX.
 *
 * Une visite intérieure a existé (commit 8bce4e5) et a été retirée deux
 * heures plus tard : « à l'usage, elle butait trop souvent ». Relue, elle
 * avait trois défauts, et ce fichier est écrit contre chacun d'eux :
 *
 * 1. LA PORTE SE JUGEAIT SUR L'AXE DU MUR. Le passage était accordé quand le
 *    point tombait « dans le trou » ; à côté, le mur repoussait
 *    perpendiculairement à lui-même — y compris contre le CHANT du montant.
 *    On restait collé au chambranle, poussé de travers. Ici, un mur percé
 *    devient DEUX PANS PLEINS dont les bouts sont arrondis : on glisse sur le
 *    montant comme sur une rampe, et il nous verse dans l'embrasure.
 *
 * 2. LES MEUBLES NE COMPTAIENT PAS. On traversait le canapé. Ils comptent,
 *    dessinés exactement là où la 3D les dessine — recalés contre les murs
 *    par le même `clampFootprint`, sans quoi on buterait dans le vide à dix
 *    centimètres d'un meuble.
 *
 * 3. DEUX PASSES DE RÉSOLUTION. Dans un angle où deux murs et un meuble se
 *    rencontrent, elles ne suffisaient pas : le point restait dedans, et le
 *    pas suivant le faisait trembler. On résout jusqu'à ce que plus rien ne
 *    bouge, dans la limite de huit passes.
 */
import type { ObjectData } from 'react-native-room-scan';
import {
  WALL_T,
  clampFootprint,
  roomOf,
  roomParts,
  segLength,
  toFootprint,
  type Pt,
  type RoomShape,
  type WallSeg,
} from './floorplan';

/**
 * L'ŒIL D'UN ADULTE DEBOUT — 1,60 m.
 *
 * Plus haut, on survole les meubles ; plus bas, on se sent enfant dans son
 * propre salon. C'est la hauteur que prennent les visites des agences.
 */
export const HAUTEUR_OEIL = 1.6;

/**
 * LE RAYON DU VISITEUR — une demi-carrure, 18 cm.
 *
 * C'est lui qui décide si une porte « passe ». Trop large, et l'on se cogne
 * aux montants d'une porte de 73 cm ; trop étroit, et l'on rase les murs au
 * point de voir à travers à la moindre approximation du dessin.
 */
export const RAYON_VISITEUR = 0.18;

/** Ce qui arrête : un pan de mur épais, ou l'emprise d'un meuble. */
export type Obstacle =
  | {
      kind: 'mur';
      a: Pt;
      b: Pt;
      /** Demi-épaisseur (m) : le trait du plan est l'AXE du mur. */
      demi: number;
    }
  | {
      kind: 'meuble';
      id: string;
      /** Les quatre coins de son emprise, dans l'ordre. */
      coins: Pt[];
    };

/**
 * CE QU'UNE EMBRASURE GAGNE DE CHAQUE CÔTÉ — 4 cm.
 *
 * Le relevé place une porte à deux ou trois centimètres près ; une embrasure
 * dessinée trop juste deviendrait un goulet. Pas davantage : une porte qui
 * déborde sur le mur laisserait passer de biais à travers le montant.
 */
const MARGE_EMBRASURE = 0.04;

/** Au-dessous, un objet se marche dessus : un tapis, une plinthe. */
const HAUTEUR_FRANCHISSABLE = 0.08;
/** Au-dessus du genou, on passe dessous : élément haut, miroir, télé murale. */
const SUSPENDU_AU_DELA = 0.9;

const fini = (n: number) => Number.isFinite(n);

/**
 * LES TROUS D'UN MUR — les portes et les passages qu'il porte.
 *
 * Une fenêtre n'en fait pas : on ne l'enjambe pas. Une menuiserie n'est
 * comptée que si elle est VRAIMENT sur ce mur — à moins de 35 cm de son axe,
 * et dans sa longueur — : un relevé place parfois une porte sur un retour
 * voisin, et elle percerait sinon le mauvais pan.
 */
function trousDuMur(w: WallSeg, openings: WallSeg[]): { de: number; a: number }[] {
  const len = segLength(w);
  if (len < 1e-6) return [];
  const ux = (w.b.x - w.a.x) / len;
  const uz = (w.b.z - w.a.z) / len;
  const out: { de: number; a: number }[] = [];
  for (const o of openings) {
    if (o.type !== 'door' && o.type !== 'opening') continue;
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    const ecart = Math.abs((m.x - w.a.x) * -uz + (m.z - w.a.z) * ux);
    if (ecart > 0.35) continue;
    const ta = (o.a.x - w.a.x) * ux + (o.a.z - w.a.z) * uz;
    const tb = (o.b.x - w.a.x) * ux + (o.b.z - w.a.z) * uz;
    const de = Math.max(0, Math.min(ta, tb) - MARGE_EMBRASURE);
    const a = Math.min(len, Math.max(ta, tb) + MARGE_EMBRASURE);
    if (a - de > 0.05) out.push({ de, a });
  }
  return out.sort((x, y) => x.de - y.de);
}

/**
 * CE QUI ARRÊTE, DANS TOUT LE LOGEMENT.
 *
 * Les murs, percés de leurs portes ; les meubles qui se dressent entre le
 * sol et le genou. Le reste se traverse : un tapis se marche dessus, on
 * passe sous un élément de cuisine accroché à 1,40 m. Les faire buter, ce
 * serait buter dans le vide — la chose même qui a fait retirer la première
 * visite.
 */
export function obstaclesDeLaVisite(
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  rooms?: RoomShape[],
): Obstacle[] {
  const out: Obstacle[] = [];

  // ------------------------------------------------------------ les murs
  for (const w of walls) {
    const len = segLength(w);
    if (len < 1e-6) continue;
    const ux = (w.b.x - w.a.x) / len;
    const uz = (w.b.z - w.a.z) / len;
    const point = (t: number): Pt => ({ x: w.a.x + ux * t, z: w.a.z + uz * t });
    let curseur = 0;
    for (const trou of trousDuMur(w, openings)) {
      if (trou.de > curseur + 1e-3) {
        out.push({ kind: 'mur', a: point(curseur), b: point(trou.de), demi: WALL_T / 2 });
      }
      curseur = Math.max(curseur, trou.a);
    }
    if (curseur < len - 1e-3) {
      out.push({ kind: 'mur', a: point(curseur), b: point(len), demi: WALL_T / 2 });
    }
  }

  // ---------------------------------------------------------- les meubles
  /*
    Recalés exactement comme la 3D les dessine (voir `buildScene`) : contre
    les murs, vers l'intérieur de LEUR pièce. Sans le même recalage, la
    collision et le dessin diffèreraient de quelques centimètres — et l'on
    buterait dans l'air à côté d'un meuble, ou l'on y entrerait d'une main.
  */
  const sol =
    walls.length > 0
      ? Math.min(...walls.map((w) => w.yCenter - w.height / 2))
      : 0;
  const parts = roomParts(walls, rooms);
  const interieurDe = new Map(parts.map((p) => [p.roomId, p.labelAt]));
  const repli =
    walls.length > 0
      ? {
          x: walls.reduce((t, w) => t + (w.a.x + w.b.x) / 2, 0) / walls.length,
          z: walls.reduce((t, w) => t + (w.a.z + w.b.z) / 2, 0) / walls.length,
        }
      : { x: 0, z: 0 };
  for (const o of objects) {
    if (!o.transform || o.transform.length < 15) continue;
    const f = clampFootprint(
      toFootprint(o),
      walls,
      interieurDe.get(roomOf(o)) ?? repli,
    );
    if (!fini(f.cx) || !fini(f.cz) || !fini(f.width) || !fini(f.depth)) continue;
    if (f.height < HAUTEUR_FRANCHISSABLE) continue;
    const bas = f.yCenter - f.height / 2 - sol;
    if (bas > SUSPENDU_AU_DELA) continue;
    const cos = Math.cos(f.yaw);
    const sin = Math.sin(f.yaw);
    const coin = (lx: number, lz: number): Pt => ({
      x: f.cx + lx * cos - lz * sin,
      z: f.cz + lx * sin + lz * cos,
    });
    const w2 = f.width / 2;
    const d2 = f.depth / 2;
    out.push({
      kind: 'meuble',
      id: o.id,
      coins: [coin(-w2, -d2), coin(w2, -d2), coin(w2, d2), coin(-w2, d2)],
    });
  }
  return out;
}

// --------------------------------------------------------------- géométrie

/** Le point d'un segment le plus proche de `p`. */
function plusProcheSurSegment(p: Pt, a: Pt, b: Pt): Pt {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  if (l2 < 1e-12) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
  return { x: a.x + t * vx, z: a.z + t * vz };
}

/** Point dans un polygone (lancer de rayon). */
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

/** Le point du bord d'un polygone le plus proche de `p`. */
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

/**
 * Le point est-il LIBRE — à une épaule de tout mur et de tout meuble ?
 *
 * Une tolérance d'un dixième de millimètre : la résolution pose le point
 * EXACTEMENT au contact, et un arrondi de la dernière décimale ne doit pas
 * faire passer un point juste posé pour un point enfoncé.
 */
export function estLibre(p: Pt, obstacles: Obstacle[], rayon = RAYON_VISITEUR): boolean {
  if (!fini(p.x) || !fini(p.z)) return false;
  for (const o of obstacles) {
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

/**
 * REPOUSSE UN POINT HORS DE TOUT CE QU'IL PÉNÈTRE.
 *
 * Contre un mur : on retire la seule composante qui le traverse — c'est ce
 * qui fait GLISSER le long d'une cloison au lieu de s'y coller. Le bout d'un
 * pan est un demi-cercle (le point le plus proche se cale sur l'extrémité) :
 * c'est ce qui arrondit les montants et verse le visiteur dans une porte.
 *
 * Contre un meuble : du dehors, pareil ; du DEDANS — un plan modifié sous les
 * pieds, un meuble glissé depuis l'écran du plan —, on sort par le bord le
 * plus proche. Repoussé « depuis ses bords » comme un point du dehors, un
 * point du dedans serait renvoyé vers l'intérieur, et enfermé.
 */
function resoudre(p0: Pt, precedent: Pt, obstacles: Obstacle[], rayon: number): Pt {
  let p = p0;
  for (let passe = 0; passe < 8; passe++) {
    let bouge = false;
    for (const o of obstacles) {
      if (o.kind === 'mur') {
        const c = plusProcheSurSegment(p, o.a, o.b);
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const mini = o.demi + rayon;
        if (d >= mini - 1e-9) continue;
        let nx: number;
        let nz: number;
        if (d > 1e-9) {
          nx = dx / d;
          nz = dz / d;
        } else {
          // Pile sur l'axe : on repart du côté d'où l'on vient.
          const lx = o.b.x - o.a.x;
          const lz = o.b.z - o.a.z;
          const ll = Math.hypot(lx, lz) || 1;
          nx = -lz / ll;
          nz = lx / ll;
          if ((precedent.x - c.x) * nx + (precedent.z - c.z) * nz < 0) {
            nx = -nx;
            nz = -nz;
          }
        }
        p = { x: c.x + nx * mini, z: c.z + nz * mini };
        bouge = true;
      } else {
        const c = plusProcheSurBord(p, o.coins);
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        const d = Math.hypot(dx, dz);
        if (dedans(p, o.coins)) {
          // On sort par le bord le plus proche, et d'une épaule au-delà.
          const ux = d > 1e-9 ? dx / d : 1;
          const uz = d > 1e-9 ? dz / d : 0;
          p = { x: c.x + ux * rayon, z: c.z + uz * rayon };
          bouge = true;
        } else if (d < rayon - 1e-9) {
          const ux = d > 1e-9 ? -dx / d : 1;
          const uz = d > 1e-9 ? -dz / d : 0;
          p = { x: c.x + ux * rayon, z: c.z + uz * rayon };
          bouge = true;
        }
      }
    }
    if (!bouge) break;
  }
  return p;
}

/**
 * UN PAS — et ce qui l'arrête.
 *
 * ON AVANCE PAR PETITS BOUTS, sinon on TRAVERSE. Une cloison fait sept
 * centimètres ; un pas d'un mètre — une image perdue, un pouce qui balaie
 * vite — saute par-dessus sans jamais s'en approcher. Le pas se découpe donc
 * en tronçons d'une demi-épaule, et chacun part de LÀ OÙ L'ON EST, pas de la
 * position théorique : visés dans l'absolu, les tronçons suivants
 * continueraient de traverser le mur que le premier a heurté.
 *
 * Un pas qui n'est pas un nombre ne bouge rien. Et un visiteur qui se trouve
 * DÉJÀ dans un meuble — le plan a changé sous ses pieds — en est sorti avant
 * de faire quoi que ce soit d'autre.
 */
export function deplacer(
  depuis: Pt,
  vers: Pt,
  obstacles: Obstacle[],
  rayon = RAYON_VISITEUR,
): Pt {
  if (!fini(depuis.x) || !fini(depuis.z)) return depuis;
  if (!fini(vers.x) || !fini(vers.z)) return { x: depuis.x, z: depuis.z };
  let p = resoudre({ x: depuis.x, z: depuis.z }, depuis, obstacles, rayon);
  const dx = vers.x - depuis.x;
  const dz = vers.z - depuis.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (rayon / 2)));
  for (let i = 0; i < n; i++) {
    const precedent = p;
    p = resoudre({ x: p.x + dx / n, z: p.z + dz / n }, precedent, obstacles, rayon);
  }
  return p;
}

/**
 * OÙ L'ON ENTRE, ET OÙ L'ON REGARDE.
 *
 * Au cœur de la plus grande pièce — le point le plus éloigné de ses murs, que
 * le plan calcule déjà pour poser son cartouche —, à l'écart de tout meuble :
 * on doit pouvoir tourner sur place dès la première image. Si le canapé est
 * justement là, on cherche alentour, en spirale, le premier point dégagé.
 *
 * Et le regard part dans la direction LA PLUS DÉGAGÉE. Entrer le nez dans un
 * mur, c'est commencer par chercher où l'on est ; la profondeur de la pièce,
 * elle, dit d'un coup où l'on se trouve.
 *
 * `yaw` est un angle DU PLAN : 0 regarde vers les x croissants, π/2 vers les z
 * croissants. La caméra de la 3D compte autrement (0 = z croissants) : c'est
 * à l'écran de convertir, une fois.
 */
export function pointDeDepart(
  walls: WallSeg[],
  rooms: RoomShape[],
  obstacles: Obstacle[],
  rayon = RAYON_VISITEUR,
): { at: Pt; yaw: number } | null {
  if (walls.length === 0) return null;
  const parts = roomParts(walls, rooms).filter((p) => p.surface);
  const grande = [...parts].sort(
    (a, b) => (b.surface?.area ?? 0) - (a.surface?.area ?? 0),
  )[0];
  const centre: Pt = grande
    ? grande.labelAt
    : {
        x: walls.reduce((t, w) => t + (w.a.x + w.b.x) / 2, 0) / walls.length,
        z: walls.reduce((t, w) => t + (w.a.z + w.b.z) / 2, 0) / walls.length,
      };
  const contour = grande?.surface?.pts;
  const recevable = (p: Pt, marge: number) =>
    estLibre(p, obstacles, marge) && (!contour || dedans(p, contour));

  let at: Pt | null = null;
  for (const marge of [rayon * 2, rayon]) {
    if (recevable(centre, marge)) {
      at = centre;
      break;
    }
    // La spirale : des anneaux de dix centimètres, seize directions chacun.
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

  // Le regard : trente-deux directions, la plus longue course libre.
  let yaw = 0;
  let mieux = -1;
  for (let k = 0; k < 32; k++) {
    const t = (k / 32) * Math.PI * 2;
    let course = 0;
    while (course < 15) {
      const q = { x: at.x + Math.cos(t) * (course + 0.05), z: at.z + Math.sin(t) * (course + 0.05) };
      if (!estLibre(q, obstacles, rayon)) break;
      course += 0.05;
    }
    if (course > mieux + 1e-6) {
      mieux = course;
      yaw = t;
    }
  }

  /*
    ET L'ON ENTRE EN RETRAIT, LA PIÈCE DEVANT SOI.

    Au cœur de la pièce, la direction la plus profonde part souvent vers une
    porte d'un mur proche : on se retrouvait le nez à deux mètres d'une
    cloison. Les visites des agences commencent autrement — depuis le seuil,
    la pièce entière dans le champ. On recule donc dans le dos du regard,
    tant qu'on reste dans la pièce et à deux épaules de tout, jusqu'à un mètre
    et demi : la profondeur devant soi grandit d'autant.
  */
  let ici: Pt = at;
  for (let recul = 0.05; recul <= 1.5 + 1e-9; recul += 0.05) {
    const q: Pt = { x: ici.x - Math.cos(yaw) * 0.05, z: ici.z - Math.sin(yaw) * 0.05 };
    if (!recevable(q, rayon * 2)) break;
    ici = q;
  }
  return { at: ici, yaw };
}
