/**
 * LA MAQUETTE SUR LA CARTE GRAPHIQUE — ce que la vue 3D confie à SceneKit.
 *
 * Relevé du patron : « le modèle 3D d'un plan contenant des meubles, comme
 * le plan de test, est très lent. Les autres apps de ce style sont fluides,
 * peu importe le nombre de meubles ».
 *
 * La maquette était PEINTE en JavaScript : à chaque image du doigt, deux
 * mille six cents faces projetées, triées de la plus lointaine à la plus
 * proche, départagées deux à deux là où elles se recouvrent, colorées, puis
 * redessinées. Sur iPhone, le JavaScript est interprété — sans compilation
 * à la volée —, et ce travail-là ne tient pas soixante images par seconde.
 * Les autres applications ne font rien de tout cela : la carte graphique
 * reçoit les triangles une fois, et juge la profondeur au pixel.
 *
 * C'est ce que fait la visite à hauteur d'œil depuis qu'elle est passée à
 * SceneKit (`visite3d`). La maquette prend le même chemin :
 *
 *   — les FACES voyagent une fois, quand la scène change, en trois groupes :
 *     celles qui n'ont pas de sens (le mobilier tel qu'on le décrit), les
 *     faces orientées (on ne voit pas leur dos — c'est ce qui ouvre la
 *     maison de poupée), et les faces extérieures des murs, que la carte
 *     graphique voile selon l'angle (l'écorché) ;
 *   — la CAMÉRA voyage à chaque image : dix nombres, calculés pour tomber
 *     EXACTEMENT sur la projection que la vue en JavaScript utilise encore
 *     pour poser ses cotes et ses repères par-dessus.
 */
import type { Face3D, P3 } from './scene3d';
import {
  MATIERE,
  composantes,
  normaleDuContour,
  sensDesLames,
  triangulerContour,
} from './visite3d';

export interface MaillageDeMaquette {
  /** Faces sans orientation connue : dessinées des deux côtés. */
  maillage: number[];
  /** Faces orientées : leur dos n'est jamais dessiné. */
  orientes: number[];
  /** Faces extérieures des murs : orientées, et voilées selon l'angle. */
  ecorche: number[];
  /** Les sols, avec leur matière (voir `visite3d`). */
  sols: number[];
}

/** Les triangles d'une face, tournés vers sa normale quand elle en a une. */
function triangles(face: Face3D): { tris: [number, number, number][]; oriente: boolean } {
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
  return { tris, oriente: !!voulue };
}

/**
 * Les faces de la maquette, rangées pour la carte graphique. Les arêtes
 * (faces sans aplat) et les ombres posées au sol n'y vont pas : la lumière
 * et l'occlusion de SceneKit font ce qu'elles simulaient.
 */
export function maillageDeLaMaquette(
  faces: Face3D[],
  o: { sansMeubles?: boolean } = {},
): MaillageDeMaquette {
  const out: MaillageDeMaquette = { maillage: [], orientes: [], ecorche: [], sols: [] };
  for (const face of faces) {
    if (face.pts.length < 3 || !face.fill || face.ombre || face.isCeiling) continue;
    // Les meubles et l'appareillage en caisses restent au canevas : la carte
    // graphique a les vrais.
    if (o.sansMeubles && (face.meuble || face.appareil)) continue;
    const { tris, oriente } = triangles(face);
    if (tris.length === 0) continue;
    const [r, g, b] = composantes(face.fill);
    if (face.isFloor) {
      out.sols.push(
        face.matiere === 'parquet' ? MATIERE.parquet : face.matiere === 'carrelage' ? MATIERE.carrelage : MATIERE.aucune,
        sensDesLames(face.pts, face.sensLattes),
        r,
        g,
        b,
        tris.length,
      );
      for (const t of tris) for (const i of t) out.sols.push(face.pts[i].x, face.pts[i].y, face.pts[i].z);
      continue;
    }
    const cible = face.cutaway && face.normal ? out.ecorche : oriente ? out.orientes : out.maillage;
    for (const t of tris) {
      for (const i of t) cible.push(face.pts[i].x, face.pts[i].y, face.pts[i].z);
      cible.push(r, g, b);
    }
  }
  return out;
}

export interface VueOrbite {
  theta: number;
  tilt: number;
  zoom: number;
  ox: number;
  oy: number;
}

/** L'échelle de la vue, en pixels par mètre — la même que la projection en JavaScript. */
export function echelleDeLaVue(view: VueOrbite, rayon: number, layout: { w: number; h: number }): number {
  return ((Math.min(layout.w, layout.h) * 0.44) / rayon) * view.zoom;
}

/**
 * LA CAMÉRA ORTHOGRAPHIQUE QUI REFAIT LA PROJECTION DE LA MAQUETTE.
 *
 * La vue en JavaScript projette un point p ainsi (voir `Iso3DView`) :
 *   sx = w/2 + ox + (p − c)·droite × échelle
 *   sy = h/2 + oy − (p − c)·haut × échelle
 * avec droite = (cos θ, 0, −sin θ), haut = (−sin θ cos φ, sin φ, −cos θ cos φ),
 * et la face qui nous regarde a sa normale le long de
 * vers = (sin θ sin φ, cos φ, cos θ sin φ) — l'œil est de ce côté.
 *
 * La caméra se pose donc sur cet axe, regarde en sens inverse, garde
 * « haut » comme haut, et vise le point du monde qui tombe au centre de
 * l'écran. Sa demi-hauteur visible est la moitié de l'écran, en mètres.
 *
 * Rend dix nombres : la cible (3), l'axe vers l'œil (3), le haut (3), et la
 * demi-hauteur visible en mètres.
 */
export function cameraOrbite(
  view: VueOrbite,
  centre: P3,
  rayon: number,
  layout: { w: number; h: number },
): number[] {
  const t = (view.theta * Math.PI) / 180;
  const f = (view.tilt * Math.PI) / 180;
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const cp = Math.cos(f);
  const sp = Math.sin(f);
  const s = echelleDeLaVue(view, rayon, layout);
  const droite = { x: ct, y: 0, z: -st };
  const haut = { x: -st * cp, y: sp, z: -ct * cp };
  const vers = { x: st * sp, y: cp, z: ct * sp };
  const cible = {
    x: centre.x - (droite.x * view.ox) / s + (haut.x * view.oy) / s,
    y: centre.y - (droite.y * view.ox) / s + (haut.y * view.oy) / s,
    z: centre.z - (droite.z * view.ox) / s + (haut.z * view.oy) / s,
  };
  return [cible.x, cible.y, cible.z, vers.x, vers.y, vers.z, haut.x, haut.y, haut.z, layout.h / (2 * s)];
}

/**
 * Projette un point avec la caméra ci-dessus, comme le ferait la carte
 * graphique. Sert au banc : la maquette native et les cotes posées par-dessus
 * doivent tomber au même pixel.
 */
export function projeterParLaCamera(cam: number[], p: P3, layout: { w: number; h: number }) {
  const [tx, ty, tz, vx, vy, vz, hx, hy, hz, demi] = cam;
  // droite = haut × vers (repère direct : droite, haut, vers l'œil).
  const dx = hy * vz - hz * vy;
  const dy = hz * vx - hx * vz;
  const dz = hx * vy - hy * vx;
  const k = layout.h / (2 * demi);
  const qx = p.x - tx;
  const qy = p.y - ty;
  const qz = p.z - tz;
  return {
    sx: layout.w / 2 + (qx * dx + qy * dy + qz * dz) * k,
    sy: layout.h / 2 - (qx * hx + qy * hy + qz * hz) * k,
  };
}
