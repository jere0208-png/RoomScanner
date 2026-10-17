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
  demiFacesDe,
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
 *
 * La mini-carte de la visite s'en sert aussi, pour couper son trait aux
 * portes (voir `traitsDeLaCarte`) : la même règle, sans la marge des
 * collisions — le trou dessiné a la largeur de la porte.
 */
export function trousDuMur(
  w: WallSeg,
  openings: WallSeg[],
  marge = MARGE_EMBRASURE,
): { de: number; a: number }[] {
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
    const de = Math.max(0, Math.min(ta, tb) - marge);
    const a = Math.min(len, Math.max(ta, tb) + marge);
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
    // Le cœur du mur : sur le trait pour un mur à l'axe, décalé d'une
    // demi-épaisseur vers le dehors pour un mur relevé d'un côté — on bute
    // sur sa face, pas sept centimètres avant (voir `facesDesMurs`).
    const f = demiFacesDe(walls, w);
    const coeur = (f.plus - f.moins) / 2;
    const demi = (f.plus + f.moins) / 2;
    const point = (t: number): Pt => ({ x: w.a.x + ux * t - uz * coeur, z: w.a.z + uz * t + ux * coeur });
    let curseur = 0;
    for (const trou of trousDuMur(w, openings)) {
      if (trou.de > curseur + 1e-3) {
        out.push({ kind: 'mur', a: point(curseur), b: point(trou.de), demi });
      }
      curseur = Math.max(curseur, trou.a);
    }
    if (curseur < len - 1e-3) {
      out.push({ kind: 'mur', a: point(curseur), b: point(len), demi });
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
    if (bloque(p, o, rayon)) return false;
  }
  return true;
}

/**
 * CET OBSTACLE-LÀ ARRÊTE-T-IL LE POINT ? — le test d'`estLibre`, pour un seul
 * obstacle, au calcul près : le lancer de rayons de `pointDeDepart` le rejoue
 * obstacle par obstacle et doit trancher EXACTEMENT comme lui.
 */
function bloque(p: Pt, o: Obstacle, rayon: number): boolean {
  if (o.kind === 'mur') {
    const c = plusProcheSurSegment(p, o.a, o.b);
    return Math.hypot(p.x - c.x, p.z - c.z) < o.demi + rayon - 1e-4;
  }
  if (dedans(p, o.coins)) return true;
  const c = plusProcheSurBord(p, o.coins);
  return Math.hypot(p.x - c.x, p.z - c.z) < rayon - 1e-4;
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
function resoudre(p0: Pt, precedent: Pt, obstacles: Obstacle[], rayon: number, garde: Garde | null = null): Pt {
  let p = p0;
  if (horsDeLaGarde(garde, p)) return p;
  for (let passe = 0; passe < 8; passe++) {
    let bouge = false;
    for (const o of obstacles) {
      // Repoussé hors de la zone triée : le calcul repartira sur tout le niveau.
      if (bouge && horsDeLaGarde(garde, p)) return p;
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
    if (horsDeLaGarde(garde, p)) return p;
  }
  return p;
}

/**
 * LA ZONE OÙ LES OBSTACLES ONT ÉTÉ TRIÉS — voir `deplacer`. Un point qui en
 * sort la fait lever : le pas est alors refait sur tous les obstacles.
 */
interface Garde {
  c: Pt;
  portee: number;
  sorti: boolean;
}

/** Ce point sort-il de la zone triée ? (Un nombre non fini en sort toujours.) */
function horsDeLaGarde(garde: Garde | null, p: Pt): boolean {
  if (!garde) return false;
  if (Math.hypot(p.x - garde.c.x, p.z - garde.c.z) <= garde.portee) return false;
  garde.sorti = true;
  return true;
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
  /*
    SEULS LES OBSTACLES PROCHES DU PAS — revue « 3D / visite » : chaque image
    de marche éprouvait TOUS les obstacles du niveau, jusqu'à huit passes,
    puis deux `estLibre` ; sur un grand logement meublé (408 obstacles),
    4 ms par image sous Node, le double sous Hermes.

    LE RÉSULTAT RESTE LE MÊME, AU BIT PRÈS. On ne garde que les obstacles
    dont la boîte est à moins de la longueur du pas, plus deux épaules, plus
    leur épaisseur, du point de départ (`obstaclesAPortee`) : tant que tous
    les points éprouvés restent dans cette portée, un obstacle écarté n'en
    arrête aucun — il ne repousse rien, ne bloque rien, et l'ordre des autres
    est gardé. Si un point en sort (un visiteur repoussé de loin, hors d'un
    meuble glissé sous ses pieds), la garde le voit et le pas est refait sur
    tout le niveau, comme avant.
  */
  const portee = Math.hypot(vers.x - depuis.x, vers.z - depuis.z) + 2 * Math.abs(rayon);
  if (fini(portee) && fini(rayon)) {
    const proches = obstaclesAPortee(obstacles, depuis, portee, rayon);
    if (proches.length < obstacles.length) {
      const garde: Garde = { c: depuis, portee, sorti: false };
      const p = deplacerParmi(depuis, vers, proches, rayon, garde);
      if (!garde.sorti) return p;
    }
  }
  return deplacerParmi(depuis, vers, obstacles, rayon, null);
}

/**
 * LE PAS SUR TOUS LES OBSTACLES, sans tri — la référence de `deplacer`, que
 * le banc compare au bit près.
 */
export function deplacerParTous(depuis: Pt, vers: Pt, obstacles: Obstacle[], rayon = RAYON_VISITEUR): Pt {
  if (!fini(depuis.x) || !fini(depuis.z)) return depuis;
  if (!fini(vers.x) || !fini(vers.z)) return { x: depuis.x, z: depuis.z };
  return deplacerParmi(depuis, vers, obstacles, rayon, null);
}

/** Le pas lui-même, en tronçons — sous la garde éventuelle d'une zone triée. */
function deplacerParmi(depuis: Pt, vers: Pt, obstacles: Obstacle[], rayon: number, garde: Garde | null): Pt {
  let p = resoudre({ x: depuis.x, z: depuis.z }, depuis, obstacles, rayon, garde);
  if (garde?.sorti) return p;
  const dx = vers.x - depuis.x;
  const dz = vers.z - depuis.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (rayon / 2)));
  for (let i = 0; i < n; i++) {
    const precedent = p;
    p = resoudre({ x: p.x + dx / n, z: p.z + dz / n }, precedent, obstacles, rayon, garde);
    if (garde?.sorti) return p;
    /*
      UN PASSAGE PLUS ÉTROIT QUE SOI NE S'OUVRE PAS — entre le dos d'un
      canapé et le mur, 35 cm pour une carrure de 36 : chaque appui repousse
      le visiteur dans l'autre, et huit passes ne les départagent pas. Le
      tronçon qui finit enfoncé est refusé : on reste où l'on était, libre.
    */
    if (!estLibre(p, obstacles, rayon) && estLibre(precedent, obstacles, rayon)) {
      p = precedent;
      break;
    }
  }
  return p;
}

// ------------------------------------------------------- le choix du regard

/*
  LE CHOIX DU POINT DE VUE GELAIT L'ENTRÉE EN VISITE.

  Relevé des testeurs (« entrée en visite et pont natif lourds ») : trente-
  deux directions, des pas de 5 cm jusqu'à 15 m, et à chaque pas un
  `estLibre` sur TOUS les obstacles du niveau — jusqu'à 9 600 tests, de
  0,27 à 0,79 s sous Node, une seconde ou plus sur l'iPhone, à l'ouverture
  comme à chaque pastille « Aller dans ».

  LE CHOIX RESTE LE MÊME, AU BIT PRÈS. On ne change ni les directions, ni
  les jalons, ni le test qui tranche : on cesse seulement de le poser là où
  il ne peut rien arrêter. Chaque obstacle proche ne peut gêner le rayon que
  sur un tronçon que l'on calcule d'un coup (intersection rayon/boîte) ;
  hors de ce tronçon, aucun jalon n'est consulté. Dedans, le jalon passe le
  test d'origine, obstacle par obstacle (`bloque`). Le tronçon est pris un
  peu LARGE — une boîte plutôt qu'une capsule, un micron de marge — : il
  peut faire tester un jalon pour rien, jamais en oublier un.

  Mesuré (banc `maj-visite`, sous Node) : l'appartement d'exemple passe de
  22 à 1 ms ; un plan de douze pièces très meublé (408 obstacles), de 250 à
  8 ms — de 520 à 13 ms sans compilateur à la volée, plus près de Hermes.
*/

/** La portée du regard (m) : au-delà, une pièce n'est plus « plus profonde ». */
const PORTEE_REGARD = 15;
/** Le pas entre deux jalons du regard (m). */
const PAS_REGARD = 0.05;
/**
 * LES JALONS DU REGARD — les distances éprouvées, CUMULÉES comme le faisait
 * la boucle d'origine (`course += 0.05` tant que `course < 15`) : à
 * l'arrondi près, les mêmes nombres, donc les mêmes points, donc le même
 * choix.
 */
const JALONS: number[] = (() => {
  const c = [0];
  while (c[c.length - 1] < PORTEE_REGARD) c.push(c[c.length - 1] + PAS_REGARD);
  return c;
})();
/**
 * Le rayon (m) autour du centre de la pièce où tombent tous les points que
 * `pointDeDepart` éprouve : la spirale (4 m) puis le recul (1,5 m), et un
 * peu de jeu pour les arrondis de leurs pas cumulés.
 */
const PORTEE_DU_CHOIX = 5.6;
/** La marge d'un tronçon de rayon (m) : bien plus large que tout arrondi. */
const JEU = 1e-6;

/** Tous ses nombres sont-ils finis ? Sinon on ne le juge que par le test d'origine. */
function finitude(o: Obstacle): boolean {
  if (o.kind === 'mur') {
    return fini(o.a.x) && fini(o.a.z) && fini(o.b.x) && fini(o.b.z) && fini(o.demi);
  }
  if (o.coins.length === 0) return false;
  for (let i = 0; i < o.coins.length; i++) {
    if (!fini(o.coins[i].x) || !fini(o.coins[i].z)) return false;
  }
  return true;
}

/** La boîte (alignée sur les axes) d'un obstacle, sans son épaisseur. */
function boiteDe(o: Obstacle): { x0: number; x1: number; z0: number; z1: number } {
  const pts = o.kind === 'mur' ? [o.a, o.b] : o.coins;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    x0 = Math.min(x0, pts[i].x);
    x1 = Math.max(x1, pts[i].x);
    z0 = Math.min(z0, pts[i].z);
    z1 = Math.max(z1, pts[i].z);
  }
  return { x0, x1, z0, z1 };
}

/**
 * La distance de `c` à la boîte d'un obstacle — 0 pour un obstacle aux
 * nombres non finis : on le garde, et le test d'origine tranche.
 */
function distanceABoite(o: Obstacle, c: Pt): number {
  if (!finitude(o)) return 0;
  const b = boiteDe(o);
  return Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.z0 - c.z, 0, c.z - b.z1));
}

/**
 * LES OBSTACLES QUI PEUVENT ARRÊTER UN POINT À MOINS DE `portee` DE `c`.
 *
 * Un point à `portee` de `c` est au moins à (distance de `c` à la boîte de
 * l'obstacle) − `portee` de l'obstacle : au-delà de son épaisseur plus la
 * marge, il ne l'arrête pas. On n'écarte que ce qui est SÛREMENT trop loin ;
 * l'ordre est gardé.
 */
function obstaclesProches(obstacles: Obstacle[], c: Pt, portee: number, marge: number): Obstacle[] {
  return obstacles.filter((o) => {
    const loin = portee + (o.kind === 'mur' ? Math.abs(o.demi) : 0) + Math.abs(marge) + JEU;
    return !(distanceABoite(o, c) >= loin);
  });
}

/**
 * LES BOÎTES DES OBSTACLES, CALCULÉES UNE FOIS PAR LISTE — cinq nombres
 * chacune (x0, x1, z0, z1, épaisseur), NaN pour un obstacle aux nombres non
 * finis. La marche les relit à chaque image : les recalculer, ce serait
 * recréer des centaines de petits objets soixante fois par seconde.
 */
const boitesEnCache = new WeakMap<Obstacle[], Float64Array>();
function boitesDesObstacles(obstacles: Obstacle[]): Float64Array {
  const deja = boitesEnCache.get(obstacles);
  if (deja && deja.length === obstacles.length * 5) return deja;
  const out = new Float64Array(obstacles.length * 5);
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!finitude(o)) {
      out.fill(NaN, i * 5, i * 5 + 5);
      continue;
    }
    const b = boiteDe(o);
    out[i * 5] = b.x0;
    out[i * 5 + 1] = b.x1;
    out[i * 5 + 2] = b.z0;
    out[i * 5 + 3] = b.z1;
    out[i * 5 + 4] = o.kind === 'mur' ? Math.abs(o.demi) : 0;
  }
  boitesEnCache.set(obstacles, out);
  return out;
}

/**
 * `obstaclesProches`, sur les boîtes gardées en cache — le même tri, au
 * nombre près (même distance, même seuil), pour la marche.
 */
function obstaclesAPortee(obstacles: Obstacle[], c: Pt, portee: number, marge: number): Obstacle[] {
  const b = boitesDesObstacles(obstacles);
  const out: Obstacle[] = [];
  for (let i = 0; i < obstacles.length; i++) {
    const x0 = b[i * 5];
    if (Number.isNaN(x0)) {
      out.push(obstacles[i]);
      continue;
    }
    const loin = portee + b[i * 5 + 4] + Math.abs(marge) + JEU;
    const d = Math.hypot(Math.max(x0 - c.x, 0, c.x - b[i * 5 + 1]), Math.max(b[i * 5 + 2] - c.z, 0, c.z - b[i * 5 + 3]));
    if (!(d >= loin)) out.push(obstacles[i]);
  }
  return out;
}

/** Le côté d'une case de `casesDesObstacles` (m). */
const CASE = 0.5;
/** Au-delà de ce numéro de case (25 km), ou de ce nombre de cases, on ne range plus. */
const CASE_MAX = 50000;
const CASES_PAR_OBSTACLE = 10000;

/**
 * LES OBSTACLES RANGÉS PAR CASES DE 50 CM — pour un point, ceux qui peuvent
 * l'arrêter avec une marge d'au plus `margeMax`, sans consulter les autres.
 *
 * Chaque obstacle est inscrit dans toutes les cases que touche sa boîte
 * gonflée de son épaisseur et de `margeMax` : un point qu'il arrête tombe
 * forcément dans l'une d'elles, et la seule case du point suffit. Un
 * obstacle aux nombres non finis, ou démesuré, est rendu pour tout point.
 */
function casesDesObstacles(obstacles: Obstacle[], margeMax: number): (p: Pt) => Obstacle[] {
  const cases = new Map<number, Obstacle[]>();
  const partout: Obstacle[] = [];
  const cle = (i: number, j: number) => (i + CASE_MAX) * (2 * CASE_MAX + 1) + (j + CASE_MAX);
  for (const o of obstacles) {
    const g = (o.kind === 'mur' ? Math.abs(o.demi) : 0) + Math.abs(margeMax) + JEU;
    const b = boiteDe(o);
    const i0 = Math.floor((b.x0 - g) / CASE);
    const i1 = Math.floor((b.x1 + g) / CASE);
    const j0 = Math.floor((b.z0 - g) / CASE);
    const j1 = Math.floor((b.z1 + g) / CASE);
    const range =
      finitude(o) &&
      fini(g) &&
      Math.max(-i0, i1, -j0, j1) < CASE_MAX &&
      (i1 - i0 + 1) * (j1 - j0 + 1) <= CASES_PAR_OBSTACLE;
    if (!range) {
      partout.push(o);
      continue;
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = cle(i, j);
        const liste = cases.get(k);
        if (liste) liste.push(o);
        else cases.set(k, [o]);
      }
    }
  }
  return (p: Pt) => {
    const i = Math.floor(p.x / CASE);
    const j = Math.floor(p.z / CASE);
    const ici = Math.max(-i, i, -j, j) < CASE_MAX ? cases.get(cle(i, j)) : undefined;
    if (partout.length === 0) return ici ?? [];
    return ici ? partout.concat(ici) : partout;
  };
}

/** Un obstacle apprêté pour les rayons partis d'un même point. */
interface Appret {
  o: Obstacle;
  /** En deçà de cette distance le long d'un rayon, il n'arrête rien. */
  proche: number;
  /**
   * Ses tranches, cinq nombres chacune — f0, nx, nz, bas, haut : le point du
   * rayon à la distance s y est quand bas ≤ f0 + s·(u·n) ≤ haut. Null : des
   * nombres non finis, et tout le rayon est éprouvé.
   */
  tranches: number[] | null;
}

/**
 * APPRÊTER UN OBSTACLE POUR LES RAYONS PARTIS DE `at` — une fois, pas une
 * fois par direction : ce qui ne dépend pas de la direction est calculé ici.
 *
 * Un mur arrête dans une capsule (son axe gonflé de demi-épaisseur + rayon) :
 * on garde la boîte qui l'enveloppe, alignée sur le mur. Un meuble arrête
 * dans son emprise gonflée d'un rayon (coins arrondis) : on garde l'emprise
 * dont chaque côté recule d'un rayon (coins vifs). Plus large, jamais plus
 * étroit.
 */
function apprete(o: Obstacle, at: Pt, rayon: number): Appret {
  if (!finitude(o) || !fini(rayon)) return { o, proche: 0, tranches: null };
  const tranches: number[] = [];
  const tranche = (q: Pt, nx: number, nz: number, bas: number, haut: number) => {
    tranches.push((at.x - q.x) * nx + (at.z - q.z) * nz, nx, nz, bas, haut);
  };
  const boite = (gonfle: number) => {
    const b = boiteDe(o);
    tranches.push(at.x, 1, 0, b.x0 - gonfle, b.x1 + gonfle);
    tranches.push(at.z, 0, 1, b.z0 - gonfle, b.z1 + gonfle);
  };
  let gonfle: number;
  if (o.kind === 'mur') {
    gonfle = Math.max(o.demi + rayon, 0) + JEU;
    const lx = o.b.x - o.a.x;
    const lz = o.b.z - o.a.z;
    const l = Math.hypot(lx, lz);
    if (l < 1e-9) {
      boite(gonfle);
    } else {
      const vx = lx / l;
      const vz = lz / l;
      tranche(o.a, vx, vz, -gonfle, l + gonfle);
      tranche(o.a, -vz, vx, -gonfle, gonfle);
    }
  } else {
    // Même un rayon nul arrête DANS l'emprise : on ne la rogne jamais.
    gonfle = Math.max(rayon, 0) + JEU;
    const c = o.coins;
    let aire = 0;
    for (let i = 0; i < c.length; i++) {
      const p = c[i];
      const q = c[(i + 1) % c.length];
      aire += p.x * q.z - q.x * p.z;
    }
    const sens = aire > 0 ? 1 : -1;
    // Convexe ? Chaque coin tourne du même côté (une emprise l'est toujours).
    let convexe = c.length === 4 && Math.abs(aire) >= 1e-9;
    for (let i = 0; i < c.length && convexe; i++) {
      const p = c[i];
      const q = c[(i + 1) % c.length];
      const n = c[(i + 2) % c.length];
      const virage = (q.x - p.x) * (n.z - q.z) - (q.z - p.z) * (n.x - q.x);
      if (virage * sens < -1e-12) convexe = false;
    }
    if (!convexe) {
      // Écrasée, ou pas une emprise convexe de quatre coins : sa boîte suffit.
      boite(gonfle);
    } else {
      // Normales sortantes : à droite d'un tour direct, à gauche sinon.
      for (let i = 0; i < 4; i++) {
        const p = c[i];
        const q = c[(i + 1) % 4];
        const ex = q.x - p.x;
        const ez = q.z - p.z;
        const le = Math.hypot(ex, ez);
        if (le < 1e-9) continue;
        tranche(p, (sens * ez) / le, (-sens * ex) / le, -Infinity, gonfle);
      }
    }
  }
  return { o, proche: Math.max(0, distanceABoite(o, at) - gonfle), tranches };
}

/**
 * LES OBSTACLES À PORTÉE DU REGARD DEPUIS `at`, apprêtés et rangés du plus
 * proche au plus lointain — c'est le filtrage spatial : ce qui commence
 * au-delà du dernier jalon n'est pas même gardé.
 */
function appretsDuRegard(obstacles: Obstacle[], at: Pt, rayon: number): Appret[] {
  const loin = JALONS[JALONS.length - 1] + JEU;
  const out: Appret[] = [];
  for (let i = 0; i < obstacles.length; i++) {
    const a = apprete(obstacles[i], at, rayon);
    if (!(a.proche > loin)) out.push(a);
  }
  return out.sort((x, y) => x.proche - y.proche);
}

/**
 * LA COURSE LIBRE LE LONG DU RAYON (ux, uz) — la distance du dernier jalon
 * franchi avant le premier qui bute, comme la boucle d'origine :
 *
 *   course = 0 ; tant que course < 15 : si le jalon course + 0,05 bute,
 *   on s'arrête ; sinon course += 0,05.
 *
 * Le premier jalon qui bute est cherché obstacle par obstacle, dans le seul
 * tronçon que l'obstacle peut barrer, jamais au-delà du premier déjà trouvé.
 * Rangés du plus proche au plus lointain, les obstacles s'arrêtent d'être
 * consultés dès qu'ils commencent après lui.
 */
function courseLeLong(at: Pt, ux: number, uz: number, apprets: Appret[], rayon: number): number {
  const dernier = JALONS.length - 1;
  const loin = JALONS[dernier] + JEU;
  let premier = dernier + 1;
  for (let j = 0; j < apprets.length; j++) {
    const ap = apprets[j];
    if (ap.proche > JALONS[premier - 1] + JEU) break;
    let de = 0;
    let a = loin;
    const tr = ap.tranches;
    if (tr) {
      let vide = false;
      for (let k = 0; k < tr.length && !vide; k += 5) {
        const f0 = tr[k];
        const f1 = ux * tr[k + 1] + uz * tr[k + 2];
        if (Math.abs(f1) < 1e-12) {
          // Parallèle à la tranche : dedans tout du long, ou jamais.
          vide = !(f0 >= tr[k + 3] && f0 <= tr[k + 4]);
        } else {
          const s1 = (tr[k + 3] - f0) / f1;
          const s2 = (tr[k + 4] - f0) / f1;
          de = Math.max(de, Math.min(s1, s2));
          a = Math.min(a, Math.max(s1, s2));
          vide = de > a;
        }
      }
      if (Number.isNaN(de) || Number.isNaN(a)) {
        // Un calcul qui déraille : tout le rayon, et le test d'origine tranche.
        de = 0;
        a = loin;
      } else if (vide) {
        continue;
      }
    }
    // Un jalon de part et d'autre : l'arrondi des pas cumulés est loin d'en valoir un.
    const i0 = Math.max(1, Math.floor(de / PAS_REGARD) - 1);
    const i1 = Math.min(premier - 1, Math.ceil(a / PAS_REGARD) + 1);
    for (let i = i0; i <= i1; i++) {
      const q = { x: at.x + ux * JALONS[i], z: at.z + uz * JALONS[i] };
      if (bloque(q, ap.o, rayon)) {
        premier = i;
        break;
      }
    }
  }
  return JALONS[premier - 1];
}

/**
 * LA COURSE LIBRE DANS LA DIRECTION `t` (radians, angle du plan) depuis
 * `at` — celle que `pointDeDepart` compare d'une direction à l'autre.
 */
export function courseLibre(at: Pt, t: number, obstacles: Obstacle[], rayon = RAYON_VISITEUR): number {
  return courseLeLong(at, Math.cos(t), Math.sin(t), appretsDuRegard(obstacles, at, rayon), rayon);
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
  /**
   * La pièce où entrer — correctif de l'audit : on ne choisissait pas la
   * pièce de départ. Sans elle, ou introuvable : la plus grande.
   */
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
  /*
    SEULS COMPTENT LES OBSTACLES PROCHES DU CENTRE. Tout ce que l'on éprouve
    ici — la spirale (quatre mètres au plus), puis le recul (un mètre et
    demi de plus) — tient dans 5,5 m autour du centre : un meuble de l'autre
    bout d'un grand logement n'y arrêtera jamais rien, inutile de le
    reconsulter mille fois. Voir `obstaclesProches`.

    Et dans un salon très meublé, où le centre tombe dans la table et la
    spirale éprouve des centaines de points, chacun ne consulte que la case
    de 50 cm où il tombe (voir `casesDesObstacles`).
  */
  const autourDuCentre = obstaclesProches(obstacles, centre, PORTEE_DU_CHOIX, rayon * 2);
  const aCote = casesDesObstacles(autourDuCentre, rayon * 2);
  const recevable = (p: Pt, marge: number) =>
    estLibre(p, aCote(p), marge) && (!contour || dedans(p, contour));

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
  const apprets = appretsDuRegard(obstacles, at, rayon);
  let yaw = 0;
  let mieux = -1;
  for (let k = 0; k < 32; k++) {
    const t = (k / 32) * Math.PI * 2;
    const course = courseLeLong(at, Math.cos(t), Math.sin(t), apprets, rayon);
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
    et demi : la profondeur devant soi grandit d'autant — sans finir le nez
    contre un fauteuil (voir `reculDEntree`).
  */
  return { at: reculDEntree(at, yaw, (q) => recevable(q, rayon * 2), obstacles, contour), yaw };
}

/**
 * AU-DELÀ DE 1,80 M, UN MEUBLE DEVANT SOI NE BOUCHE PLUS LA VUE : il est
 * dans la pièce, pas dans l'objectif. Tous les reculs qui en sont là se
 * valent, et le plus profond l'emporte.
 */
export const DEGAGEMENT_SUFFISANT = 1.8;
/**
 * LE CHAMP OÙ UN MEUBLE SE VOIT — ±50° autour du regard. L'écran en montre
 * ±34° à l'horizon (68° de large), davantage au bas de l'image, où un
 * accoudoir proche s'étire sous le grand angle.
 */
const DEMI_CHAMP_VU = (50 * Math.PI) / 180;
/** Le pas auquel on parcourt le bord d'un meuble pour savoir s'il se voit (m). */
const PAS_DU_BORD = 0.1;
/**
 * CE QUE VAUT UN MÈTRE DE RECUL, en mètres de dégagement : 20 cm. Reculer
 * d'un mètre et demi vaut qu'un meuble soit 30 cm plus près — pas qu'il
 * remplisse la moitié de l'image.
 */
const POIDS_DU_RECUL = 0.2;

/**
 * LE MEUBLE VISIBLE LE PLUS PROCHE — sa distance (m) depuis `at`, en
 * regardant vers `yaw` (angle du plan), plafonnée à `DEGAGEMENT_SUFFISANT`.
 *
 * Seuls comptent les meubles (un mur ne « bouche » pas une pièce : il la
 * borde), ceux de la pièce quand on la connaît (un meuble de la chambre
 * voisine est derrière la cloison), et les points de leur bord qui tombent
 * dans le champ.
 */
export function degagementDevant(at: Pt, yaw: number, obstacles: Obstacle[], contour?: Pt[]): number {
  const ux = Math.cos(yaw);
  const uz = Math.sin(yaw);
  const champ = Math.cos(DEMI_CHAMP_VU);
  let mieux = DEGAGEMENT_SUFFISANT;
  if (!fini(at.x) || !fini(at.z) || !fini(ux) || !fini(uz)) return mieux;
  for (const o of obstacles) {
    if (o.kind !== 'meuble' || !finitude(o)) continue;
    if (!(distanceABoite(o, at) < mieux)) continue;
    const c = o.coins;
    if (contour) {
      let cx = 0;
      let cz = 0;
      for (const q of c) {
        cx += q.x / c.length;
        cz += q.z / c.length;
      }
      if (!dedans({ x: cx, z: cz }, contour)) continue;
    }
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      const n = Math.min(400, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / PAS_DU_BORD)));
      for (let k = 0; k < n; k++) {
        const px = a.x + ((b.x - a.x) * k) / n - at.x;
        const pz = a.z + ((b.z - a.z) * k) / n - at.z;
        const d = Math.hypot(px, pz);
        if (!(d < mieux)) continue;
        if (d < 1e-9 || (px * ux + pz * uz) / d >= champ) mieux = d;
      }
    }
  }
  return mieux;
}

/**
 * LE RECUL D'ENTRÉE — revue « 3D / visite » : « premier regard, on entre le
 * nez contre un fauteuil ». Le recul allait toujours au plus loin (1,5 m)
 * tant que le point restait recevable ; il s'arrêtait souvent juste à côté
 * d'un fauteuil, qui prenait le quart bas de la première image, déformé par
 * le grand angle. Beaucoup de meuble, peu de pièce.
 *
 * On ne se contente pas d'un seuil : parmi tous les reculs recevables (les
 * mêmes qu'avant, de 5 cm en 5 cm), on retient celui qui ÉLOIGNE LE PLUS du
 * meuble visible le plus proche, en gardant de la profondeur — chaque mètre
 * reculé compte pour `POIDS_DU_RECUL` de dégagement, et à égalité le plus
 * profond l'emporte. Sans meuble à moins de 1,80 m dans le champ, c'est le
 * recul d'avant, au plus loin.
 */
export function reculDEntree(
  at: Pt,
  yaw: number,
  recevable: (p: Pt) => boolean,
  obstacles: Obstacle[],
  contour?: Pt[],
): Pt {
  const reculs: Pt[] = [at];
  let ici: Pt = at;
  for (let recul = 0.05; recul <= 1.5 + 1e-9; recul += 0.05) {
    const q: Pt = { x: ici.x - Math.cos(yaw) * 0.05, z: ici.z - Math.sin(yaw) * 0.05 };
    if (!recevable(q)) break;
    ici = q;
    reculs.push(q);
  }
  if (reculs.length === 1) return at;
  // Les meubles qui peuvent tomber à moins de 1,80 m d'un des reculs.
  const proches = obstaclesProches(obstacles, at, 1.5 + DEGAGEMENT_SUFFISANT, 0);
  let choisi = ici;
  let meilleur = -Infinity;
  for (let i = reculs.length - 1; i >= 0; i--) {
    const note = degagementDevant(reculs[i], yaw, proches, contour) + POIDS_DU_RECUL * 0.05 * i;
    if (note > meilleur + 1e-9) {
      meilleur = note;
      choisi = reculs[i];
    }
  }
  return choisi;
}
