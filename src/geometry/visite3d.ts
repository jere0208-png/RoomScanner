/**
 * LA VISITE EN NATIF — ce que la scène envoie à SceneKit.
 *
 * Relevé du patron : « l'exploration n'est pas du tout fluide lorsqu'on se
 * déplace s'il y a un minimum d'éléments (...) le sol en parquet apparaît
 * mal aussi, selon la vue, il disparaît ». Les deux ont la même cause : la
 * vue à la première personne était PEINTE en JavaScript — six cents faces
 * projetées, triées comme un peintre, puis envoyées au canevas, trente fois
 * par seconde. Sur le téléphone, Hermes ne compile pas à la volée : une
 * image coûtait bien plus que sa part de seconde, et le tri du peintre, qui
 * ne range les faces que sur UN nombre, laissait tomber les joints du sol
 * derrière lui dès qu'on les regardait de biais.
 *
 * On ne peint plus en JavaScript. La scène est BÂTIE UNE FOIS — la même que
 * celle de la maquette (`buildScene`) : murs percés de leurs baies, meubles,
 * sols et plafonds, teintes relevées au scan — puis remise à SceneKit, le
 * moteur 3D d'iOS, qui la tient sur la carte graphique. Ensuite, seule la
 * caméra bouge : six nombres par image. La profondeur est jugée au pixel par
 * le matériel, pas par un tri : rien ne passe plus devant ce qui est devant.
 *
 * Et le parquet n'est plus des traits posés un souffle au-dessus du sol :
 * c'est une TEXTURE, les lames et leurs abouts dessinés dans l'image du sol,
 * répétée à l'échelle réelle (une lame de 22 cm sur 1,35 m). Elle ne peut
 * pas disparaître.
 *
 * CE QUI TRAVERSE LE PONT, et sous quelle forme — la leçon du canevas : des
 * NOMBRES À PLAT, qui se convertissent d'un bloc.
 *
 *   `maillage` : les triangles de tout le bâti et du mobilier ;
 *                [x, y, z] × 3 puis [r, g, b] (0–1), douze nombres par triangle.
 *   `sols`     : un bloc par sol — [matière, sens, r, g, b, n] puis n triangles
 *                de neuf coordonnées. La matière dit l'image à répéter, le
 *                sens celui des lames.
 *   `camera`   : [x, y, z, lacet, tangage, ouverture verticale en degrés].
 */
import type { Face3D, P3, PovCamera } from './scene3d';

/** La matière d'un sol, telle que le natif la lit. */
export const MATIERE = { aucune: 0, parquet: 1, carrelage: 2 } as const;
/** Le sens des lames : le long de x, ou le long de z. */
export const SENS = { x: 0, z: 1 } as const;
/** Nombres par triangle dans `maillage`. */
export const PAR_TRIANGLE = 12;
/** Nombres d'en-tête d'un sol dans `sols`. */
export const ENTETE_SOL = 6;

export interface MaillageDeVisite {
  maillage: number[];
  sols: number[];
}

/** « #RRGGBB » → trois composantes 0–1. L'illisible rend un gris moyen. */
export function composantes(hex: string | null | undefined): [number, number, number] {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return [0.5, 0.5, 0.5];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/**
 * LA NORMALE D'UN CONTOUR, par la méthode de Newell — la seule qui tienne
 * pour un polygone gauche ou concave : on somme les projections des arêtes.
 */
export function normaleDuContour(pts: P3[]): P3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    nx += (p.y - q.y) * (p.z + q.z);
    ny += (p.z - q.z) * (p.x + q.x);
    nz += (p.x - q.x) * (p.y + q.y);
  }
  return { x: nx, y: ny, z: nz };
}

/**
 * DÉCOUPE UN CONTOUR EN TRIANGLES — par les oreilles.
 *
 * Un sol en L, un plafond qui suit la pièce : ni l'un ni l'autre n'est
 * convexe, et un éventail depuis le premier sommet planterait des triangles
 * hors de la pièce. On coupe donc une « oreille » à la fois — un sommet
 * convexe dont le triangle ne contient aucun autre sommet —, jusqu'à ce
 * qu'il n'en reste que trois. Les indices rendus suivent l'ORIENTATION DU
 * CONTOUR D'ORIGINE : c'est l'appelant qui décide de quel côté regarde la
 * face.
 */
export function triangulerContour(pts: P3[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  // Le plan de travail : on écarte l'axe que la normale domine.
  const no = normaleDuContour(pts);
  const ax = Math.abs(no.x);
  const ay = Math.abs(no.y);
  const az = Math.abs(no.z);
  const uv: (p: P3) => [number, number] =
    ax >= ay && ax >= az
      ? (p) => [p.y, p.z]
      : ay >= az
      ? (p) => [p.z, p.x]
      : (p) => [p.x, p.y];
  const plan = pts.map(uv);
  const aire2 = plan.reduce((s, p, i) => {
    const q = plan[(i + 1) % n];
    return s + (p[0] * q[1] - q[0] * p[1]);
  }, 0);
  // On travaille dans le sens direct ; on remettra l'ordre d'origine après.
  const inverse = aire2 < 0;
  const reste: number[] = Array.from({ length: n }, (_, i) => (inverse ? n - 1 - i : i));
  const croix = (a: number, b: number, c: number) => {
    const [ax1, ay1] = plan[a];
    const [bx, by] = plan[b];
    const [cx, cy] = plan[c];
    return (bx - ax1) * (cy - ay1) - (by - ay1) * (cx - ax1);
  };
  const dedans = (p: number, a: number, b: number, c: number) =>
    croix(a, b, p) >= -1e-12 && croix(b, c, p) >= -1e-12 && croix(c, a, p) >= -1e-12;
  const out: [number, number, number][] = [];
  let garde = 0;
  while (reste.length > 3 && garde < 4 * n * n) {
    garde++;
    let coupee = false;
    for (let i = 0; i < reste.length; i++) {
      const a = reste[(i + reste.length - 1) % reste.length];
      const b = reste[i];
      const c = reste[(i + 1) % reste.length];
      if (croix(a, b, c) <= 1e-12) continue; // rentrant ou plat : pas une oreille
      let libre = true;
      for (const p of reste) {
        if (p === a || p === b || p === c) continue;
        if (dedans(p, a, b, c)) {
          libre = false;
          break;
        }
      }
      if (!libre) continue;
      out.push([a, b, c]);
      reste.splice(i, 1);
      coupee = true;
      break;
    }
    // Un contour dégénéré (sommets alignés, arêtes qui se croisent) ne
    // livre plus d'oreille : on finit en éventail plutôt qu'en boucle.
    if (!coupee) break;
  }
  if (reste.length >= 3) {
    for (let i = 1; i + 1 < reste.length; i++) out.push([reste[0], reste[i], reste[i + 1]]);
  }
  return inverse ? out.map(([a, b, c]) => [c, b, a]) : out;
}

/**
 * LE SENS DES LAMES D'UN SOL : celui du relevé, sinon le grand côté — la
 * même règle que les joints de la maquette (`jointsDuSol`).
 */
export function sensDesLames(pts: P3[], sens?: 'x' | 'z'): 0 | 1 {
  if (sens) return sens === 'x' ? SENS.x : SENS.z;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return maxX - minX >= maxZ - minZ ? SENS.x : SENS.z;
}

/**
 * LES FACES DE LA SCÈNE, EN TRIANGLES POUR LE NATIF.
 *
 * Chaque face pleine devient des triangles orientés du côté de sa normale :
 * le sol regarde en haut, le plafond en bas, un mur vers sa pièce — c'est
 * ce qui permet à la lumière d'éclairer le bon côté. Les ARÊTES (deux
 * points) ne voyagent pas : la lumière et l'occlusion dessinent les angles
 * mieux qu'un trait, et un trait posé sur une face se bat avec elle au
 * pixel. Les OMBRES PORTÉES de la maquette non plus : la lumière et
 * l'occlusion font le contact d'un meuble avec le sol, et une nappe posée
 * sur le sol se battrait avec lui.
 */
export function maillageDeLaVisite(faces: Face3D[], o: { sansMeubles?: boolean } = {}): MaillageDeVisite {
  const maillage: number[] = [];
  const sols: number[] = [];
  const pousser = (cible: number[], pts: P3[], tri: [number, number, number]) => {
    for (const i of tri) {
      const p = pts[i];
      cible.push(p.x, p.y, p.z);
    }
  };
  for (const face of faces) {
    if (face.pts.length < 3 || !face.fill || face.ombre) continue;
    // Les meubles en caisses : la visite a les vrais modèles (`modeles3d`).
    if (o.sansMeubles && face.meuble) continue;
    const voulue: P3 | null = face.isFloor
      ? { x: 0, y: 1, z: 0 }
      : face.isCeiling
      ? { x: 0, y: -1, z: 0 }
      : face.normal ?? null;
    let tris = triangulerContour(face.pts);
    if (voulue) {
      const n = normaleDuContour(face.pts);
      if (n.x * voulue.x + n.y * voulue.y + n.z * voulue.z < 0) {
        tris = tris.map(([a, b, c]) => [c, b, a]);
      }
    }
    if (tris.length === 0) continue;
    const [r, g, b] = composantes(face.fill);
    if (face.isFloor) {
      sols.push(
        face.matiere === 'parquet'
          ? MATIERE.parquet
          : face.matiere === 'carrelage'
          ? MATIERE.carrelage
          : MATIERE.aucune,
        sensDesLames(face.pts, face.sensLattes),
        r,
        g,
        b,
        tris.length,
      );
      for (const t of tris) pousser(sols, face.pts, t);
    } else {
      for (const t of tris) {
        pousser(maillage, face.pts, t);
        maillage.push(r, g, b);
      }
    }
  }
  return { maillage, sols };
}

/** La caméra, à plat : position, lacet, tangage, ouverture verticale (°). */
export function cameraNative(cam: PovCamera): number[] {
  return [cam.at.x, cam.at.y, cam.at.z, cam.yaw, cam.pitch, cam.fov];
}
