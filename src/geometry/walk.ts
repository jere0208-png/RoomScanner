/**
 * LA VISITE — se tenir DANS le logement, pas devant sa maquette.
 *
 * Le bouton « Modèle AR » ouvrait le .usdz du scan dans la visionneuse
 * d'Apple : le modèle s'y pose sur une table, en réalité augmentée, au
 * milieu du salon où l'on se trouve. C'est joli et parfaitement inutile
 * pour préparer un chantier — on voit le fond de la pièce par la caméra,
 * la maquette flotte, et on ne peut pas se placer là où l'on percera.
 *
 * Ici, on entre dedans. Une caméra à hauteur d'œil, un pas qui bute contre
 * les murs et franchit les portes, et RIEN d'autre à l'écran que le modèle
 * — pas d'image de caméra, pas de décor inventé. Ce qu'on voit est ce
 * qu'on a relevé : les cloisons, leurs épaisseurs, les appareils à leur
 * hauteur, les gaines dans la chape.
 *
 * Ce fichier ne dessine rien : il calcule. La projection (ce que l'œil
 * voit), la découpe au plan proche (sans quoi ce qui passe derrière la
 * tête revient à l'envers devant), et la marche avec ses collisions.
 */
import type { Face3D, P3 } from './scene3d';
import { segLength, type Pt, type WallSeg } from './floorplan';

/** Où se tient le visiteur, et où il regarde. */
export interface WalkCam {
  /** Position au sol (m). */
  x: number;
  z: number;
  /** Hauteur d'œil (m) : 1,62 m, l'œil d'un adulte debout. */
  y: number;
  /** Cap, en radians : 0 = vers les z négatifs, comme le nord du plan. */
  yaw: number;
  /** Élévation du regard, en radians : positif = vers le haut. */
  pitch: number;
}

/** Hauteur d'œil par défaut — celle d'un homme debout, chaussé. */
export const HAUTEUR_OEIL = 1.62;
/** Rayon du visiteur : une épaule, ce qui empêche de raser les angles. */
export const RAYON_VISITEUR = 0.22;
/** Plan proche : au-delà, un point passe derrière l'œil. */
const PROCHE = 0.08;

/** Le point `p` vu depuis la caméra : (droite, haut, avant). */
export function toCamera(cam: WalkCam, p: P3): P3 {
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dz = p.z - cam.z;
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // Avant : le regard à plat. Droite : sa perpendiculaire.
  const avant = -dz * cy + dx * sy;
  const droite = dx * cy + dz * sy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  return {
    x: droite,
    y: dy * cp - avant * sp,
    z: avant * cp + dy * sp,
  };
}

/**
 * Découpe un polygone au plan proche (Sutherland–Hodgman).
 *
 * Sans elle, un mur qui passe derrière l'oreille revient devant, retourné,
 * et barre l'écran d'un aplat blanc. C'est LE défaut qui distingue une vue
 * intérieure d'une maquette vue de loin : de dehors, rien n'est jamais
 * derrière la caméra.
 */
export function clipNear(pts: P3[]): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = a.z - PROCHE;
    const db = b.z - PROCHE;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: PROCHE,
      });
    }
  }
  return out;
}

export interface WalkFace {
  pts: { sx: number; sy: number }[];
  fill: string | null;
  stroke: string | null;
  dashed?: boolean;
  /** Distance à l'œil : le tri du peintre s'en sert, du plus loin au plus près. */
  depth: number;
}

/**
 * Ce que l'œil voit, prêt à peindre.
 *
 * Trois opérations, dans cet ordre : passer dans le repère de l'œil,
 * découper au plan proche, projeter. Puis le tri du peintre, du plus loin
 * au plus près — dans une pièce fermée, il n'y a pas de meilleur juge que
 * la distance, et un mur qu'on traverse du regard n'existe pas.
 */
export function walkFaces(
  faces: Face3D[],
  cam: WalkCam,
  largeur: number,
  hauteur: number,
  /** Ouverture horizontale, en degrés : 75° — un regard, pas un fish-eye. */
  fov = 75,
): WalkFace[] {
  const f = largeur / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
  const cx = largeur / 2;
  const cy = hauteur / 2;
  const out: WalkFace[] = [];
  for (const face of faces) {
    const cam3 = face.pts.map((p) => toCamera(cam, p));
    // Une arête (deux points) se découpe comme un polygone dégénéré.
    const clip = face.pts.length >= 3 ? clipNear(cam3) : clipSegment(cam3);
    if (clip.length < 2) continue;
    // Dos tourné : la face regarde ailleurs, on ne la peint pas.
    if (face.normal && face.pts.length >= 3) {
      const c = centre(face.pts);
      const vers =
        face.normal.x * (cam.x - c.x) +
        face.normal.y * (cam.y - c.y) +
        face.normal.z * (cam.z - c.z);
      if (vers <= 0) continue;
    }
    /**
     * ON TRIE SUR LE POINT LE PLUS LOINTAIN, pas sur la moyenne.
     *
     * Le sol d'une pièce est UNE face, immense : sa distance moyenne la
     * place au milieu de la pièce, donc APRÈS la gaine qui court dessus à
     * cinq centimètres. Le sol repeignait le conduit, et le modèle ne
     * montrait plus que la remontée, sortie de nulle part.
     *
     * Le point le plus lointain, lui, dit « jusqu'où va cette face » : le
     * sol atteint le mur du fond, il passe donc en premier, et tout ce qui
     * repose dessus se peint par-dessus.
     */
    let loin = 0;
    const pts = clip.map((p) => {
      loin = Math.max(loin, Math.hypot(p.x, p.y, p.z));
      return { sx: cx + (p.x / p.z) * f, sy: cy - (p.y / p.z) * f };
    });
    if (pts.some((p) => !Number.isFinite(p.sx) || !Number.isFinite(p.sy))) {
      continue;
    }
    out.push({
      pts,
      fill: face.fill,
      stroke: face.stroke,
      dashed: face.dashed,
      depth: loin,
    });
  }
  return out.sort((a, b) => b.depth - a.depth);
}

/** Le centre d'une face, dans le monde. */
function centre(pts: P3[]): P3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  return { x: x / pts.length, y: y / pts.length, z: z / pts.length };
}

/** Découpe d'un simple segment : pas de fermeture, sinon il double. */
function clipSegment(pts: P3[]): P3[] {
  if (pts.length < 2) return [];
  const [a, b] = pts;
  const da = a.z - PROCHE;
  const db = b.z - PROCHE;
  if (da >= 0 && db >= 0) return [a, b];
  if (da < 0 && db < 0) return [];
  const t = da / (da - db);
  const m = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: PROCHE,
  };
  return da >= 0 ? [a, m] : [m, b];
}

/** Un obstacle : un segment de mur, avec son épaisseur et ses trous. */
export interface Obstacle {
  a: Pt;
  b: Pt;
  /** Demi-épaisseur du mur (m). */
  demi: number;
  /**
   * Les passages libres, en abscisse le long du mur (m).
   *
   * Une porte n'arrête personne — sinon la visite s'arrête à la première
   * cloison et le mode ne sert à rien. Une fenêtre, si : on ne l'enjambe
   * pas.
   */
  trous: { de: number; a: number }[];
}

/**
 * Les obstacles du logement : les murs, percés de leurs portes.
 *
 * Le seuil est élargi de dix centimètres de chaque côté : on passe une
 * porte de 83 cm sans se frotter aux montants, ce qui, avec un pas au
 * doigt, est la différence entre « ça passe » et « ça coince ».
 */
export function obstaclesOf(
  walls: WallSeg[],
  openings: WallSeg[],
  wallT = 0.14,
): Obstacle[] {
  return walls.map((w) => {
    const len = segLength(w) || 1;
    const ux = (w.b.x - w.a.x) / len;
    const uz = (w.b.z - w.a.z) / len;
    const trous: { de: number; a: number }[] = [];
    for (const o of openings) {
      // Une menuiserie n'ouvre le passage que si l'on peut la traverser :
      // porte ou baie libre. Une fenêtre reste un mur pour les jambes.
      if (o.type === 'window') continue;
      const centreO = {
        x: (o.a.x + o.b.x) / 2,
        z: (o.a.z + o.b.z) / 2,
      };
      const t = (centreO.x - w.a.x) * ux + (centreO.z - w.a.z) * uz;
      const dist = Math.abs(
        (centreO.x - w.a.x) * -uz + (centreO.z - w.a.z) * ux,
      );
      if (dist > 0.35 || t < -0.2 || t > len + 0.2) continue;
      const demiO = segLength(o) / 2 + 0.1;
      trous.push({ de: t - demiO, a: t + demiO });
    }
    return { a: w.a, b: w.b, demi: wallT / 2, trous };
  });
}

/**
 * LE PAS, ET CE QUI L'ARRÊTE.
 *
 * On avance, puis on repousse : pour chaque mur, si le nouveau point est
 * plus près que l'épaule ne le permet, on le rejette perpendiculairement.
 * Deux passes, comme pour les meubles — dans un angle, deux murs poussent
 * en même temps, et une seule passe laisse traverser le coin.
 *
 * Le GLISSEMENT vient de là, gratuitement : marcher en biais contre un mur
 * repousse seulement la composante perpendiculaire, et l'on file le long
 * de la cloison au lieu de s'y coller. C'est ce qui fait la différence
 * entre une visite et un labyrinthe.
 */
export function step(
  obstacles: Obstacle[],
  from: Pt,
  to: Pt,
  rayon = RAYON_VISITEUR,
): Pt {
  /**
   * ON AVANCE PAR PETITS BOUTS — sinon on TRAVERSE.
   *
   * Une cloison fait sept centimètres. Un pas d'un mètre — une image
   * perdue, un doigt qui balaie vite — saute par-dessus sans jamais s'en
   * approcher : le test ne regarde que le point d'arrivée, et le point
   * d'arrivée est de l'autre côté, au large. Le banc d'épreuve a envoyé le
   * visiteur à cent mètres du logement dès le premier essai.
   *
   * Le déplacement se découpe donc en tronçons de douze centimètres, et
   * chacun se heurte aux murs à son tour. La découpe est FAITE ICI, en
   * boucle : une première version se rappelait elle-même, et comme une
   * poussée éloigne le point d'arrivée, elle se redécoupait sans fin.
   */
  const dl = Math.hypot(to.x - from.x, to.z - from.z);
  const morceaux = Math.max(1, Math.ceil(dl / 0.12));
  const dx = (to.x - from.x) / morceaux;
  const dz = (to.z - from.z) / morceaux;
  let p = { ...from };
  for (let i = 0; i < morceaux; i++) {
    // Le tronçon part de LÀ OÙ L'ON EST, pas de la position théorique.
    // Visés dans l'absolu, les tronçons suivants continuaient de traverser
    // le mur : les premiers étaient bien repoussés, et le dernier, déjà
    // au large de l'autre côté, ne touchait plus rien. On sortait du
    // logement par la dernière fraction de pas.
    p = pousser(obstacles, p, { x: p.x + dx, z: p.z + dz }, rayon);
  }
  return p;
}

/** Un tronçon de pas, repoussé par les murs qu'il pénètre. */
function pousser(
  obstacles: Obstacle[],
  from: Pt,
  to: Pt,
  rayon: number,
): Pt {
  let p = { ...to };
  for (let passe = 0; passe < 2; passe++) {
    for (const o of obstacles) {
      const ex = o.b.x - o.a.x;
      const ez = o.b.z - o.a.z;
      const len = Math.hypot(ex, ez);
      if (len < 1e-6) continue;
      const ux = ex / len;
      const uz = ez / len;
      const t = (p.x - o.a.x) * ux + (p.z - o.a.z) * uz;
      const tClamp = Math.max(0, Math.min(len, t));
      const proche = { x: o.a.x + ux * tClamp, z: o.a.z + uz * tClamp };
      const dx = p.x - proche.x;
      const dz = p.z - proche.z;
      const d = Math.hypot(dx, dz);
      const mini = o.demi + rayon;
      if (d >= mini) continue;
      // Dans un passage : on traverse. Le trou ne s'ouvre que sur la
      // longueur du mur — un seuil ne déborde pas ses montants.
      if (o.trous.some((h) => t > h.de && t < h.a)) continue;
      if (d < 1e-6) {
        // Pile sur l'axe : on repousse du côté d'où l'on vient.
        const vx = from.x - proche.x;
        const vz = from.z - proche.z;
        const vl = Math.hypot(vx, vz) || 1;
        p = { x: proche.x + (vx / vl) * mini, z: proche.z + (vz / vl) * mini };
        continue;
      }
      p = { x: proche.x + (dx / d) * mini, z: proche.z + (dz / d) * mini };
    }
  }
  return p;
}

/**
 * Où poser le visiteur en entrant : au centre de la plus grande pièce.
 *
 * Le milieu de l'emprise tombe dans le vide d'un logement en L, et l'on
 * démarrait le nez dans une cloison. On prend donc le point le plus
 * dégagé : celui qui maximise la distance au mur le plus proche.
 */
export function departVisite(
  obstacles: Obstacle[],
  bbox: { x0: number; x1: number; z0: number; z1: number },
): Pt {
  const N = 24;
  let best = { x: (bbox.x0 + bbox.x1) / 2, z: (bbox.z0 + bbox.z1) / 2 };
  let large = -Infinity;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p = {
        x: bbox.x0 + ((i + 0.5) * (bbox.x1 - bbox.x0)) / N,
        z: bbox.z0 + ((j + 0.5) * (bbox.z1 - bbox.z0)) / N,
      };
      let d = Infinity;
      for (const o of obstacles) {
        const ex = o.b.x - o.a.x;
        const ez = o.b.z - o.a.z;
        const len = Math.hypot(ex, ez) || 1;
        const t = Math.max(
          0,
          Math.min(len, ((p.x - o.a.x) * ex + (p.z - o.a.z) * ez) / len),
        );
        const q = { x: o.a.x + (ex / len) * t, z: o.a.z + (ez / len) * t };
        d = Math.min(d, Math.hypot(p.x - q.x, p.z - q.z));
      }
      if (d > large) {
        large = d;
        best = p;
      }
    }
  }
  return best;
}
