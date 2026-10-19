/**
 * Export du modèle 3D — depuis NOTRE scène, pas depuis le `.usdz` de RoomPlan.
 *
 * Le `.usdz` livré par RoomPlan ignore tout ce qu'on a fait ensuite : murs
 * déplacés, pièces fusionnées, cloisons ajoutées, meubles recalés. Ce qu'on
 * montre à l'écran et ce qu'on exporte doivent être la même chose — c'est
 * donc `buildScene()` qui alimente l'export, exactement comme la vue 3D et
 * le PDF.
 *
 * Format OBJ : un seul fichier, lisible par Blender, SketchUp, Rhino et à peu
 * près tout le reste. Les COULEURS VOYAGENT, une par sommet (« v x y z r g
 * b »), sans `.mtl` à côté : Blender et MeshLab les lisent (voir
 * `facesDuModele`) ; un logiciel qui les ignore garde la géométrie. Et les
 * éléments sont regroupés par nature, ce qui permet de les sélectionner et
 * de les remettre en matière d'un clic dans le logiciel de destination.
 */
import type { ObjectData } from 'react-native-room-scan';
import { abregerNiveau, roomParts, type RoomShape, type WallSeg } from '../geometry/floorplan';
import { pointInPolygon } from '../geometry/appearance';
import type { Fixture } from '../geometry/electrical';
import type { CeilingFixture } from '../geometry/ceiling';
import { buildScene, type Face3D } from './../geometry/scene3d';
import { MAQUETTE, matieresDesSols } from '../ui/maquette';
import { accentsDesPieces, peinturesDesPieces, solsDesPieces } from '../ui/habillage';
import { nomDeFichier } from './nomDeFichier';

/** Palette neutre : l'OBJ ne porte pas les couleurs, seule la forme compte. */
/**
 * LA COULEUR D'UNE FACE, EN TROIS NOMBRES DE 0 À 1 — « #RRGGBB », « #RGB »
 * ou « rgb(a)(…) ». Une teinte illisible rend du blanc : mieux vaut un mur
 * blanc qu'un fichier qui ne s'ouvre pas.
 */
function rgbDe(c: string | null | undefined): [number, number, number] {
  if (!c) return [1, 1, 1];
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255) as [number, number, number];
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16) / 255) as [number, number, number];
  const r = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
  if (r) return [Number(r[1]) / 255, Number(r[2]) / 255, Number(r[3]) / 255];
  return [1, 1, 1];
}

export interface ModelForExport {
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  rooms?: RoomShape[];
  fixtures?: Fixture[];
  /**
   * LE PLAFOND AUSSI — agent testeur PLAN 3D : le modèle exporté portait les
   * prises et les inters, pas les points lumineux, les détecteurs ni la VMC
   * que la vue 3D montrait. Ouvert dans un logiciel de 3D, le plafond était nu.
   */
  ceiling?: CeilingFixture[];
}

/**
 * À quel groupe OBJ appartient une face — revue « Claire » : deux groupes,
 * « Sols » et « Volumes », pour tout le logement ; on ne pouvait pas masquer
 * les meubles pour ne garder que l'architecture. Un groupe par nature.
 */
function groupOf(face: Face3D & { piece?: string }): string {
  // Le sol d'une pièce dans son groupe à elle — manque proposé par l'agent
  // testeur PLAN 3D : dans Blender, « Sols — Séjour » se masque seul.
  if (face.isFloor) return face.piece ? `Sols — ${face.piece}` : 'Sols';
  if (face.menuiserie) return 'Menuiseries';
  if (face.meuble || face.ownerId) return 'Meubles';
  if (face.appareil) return 'Appareillage';
  return 'Murs';
}

const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();

/**
 * Écrit la scène en OBJ. Les faces sans remplissage (contours, passages en
 * pointillé) ne sont pas exportées : ce sont des artifices de dessin, pas de
 * la matière.
 */
export function buildObj(model: ModelForExport, name = 'EchoPlan'): string {
  return ecrireObj([{ prefixe: '', faces: facesDuModele(model), dy: 0 }], name);
}

/**
 * LA MAISON ENTIÈRE, NIVEAUX EMPILÉS — revue « Léa » : chaque niveau sortait
 * dans son fichier, de y = 0 à sa hauteur, et deux fichiers importés se
 * superposaient. Un seul fichier : chaque niveau posé à son altitude
 * (`altitudesDesNiveaux`), dans ses groupes à lui (« R+1 Sols », « R+1
 * Volumes ») pour pouvoir masquer un étage dans le logiciel.
 */
export function buildObjMaison(
  niveaux: { niveau: number; model: ModelForExport }[],
  altitudes: Map<number, number>,
  name = 'EchoPlan',
): string {
  return ecrireObj(
    // La scène pose déjà le sol de chaque niveau à zéro (ARKit le met où il
    // l'a trouvé, souvent 1,30 m plus bas) : il ne reste qu'à le monter.
    niveaux.map(({ niveau, model }) => ({
      prefixe: `${abregerNiveau(niveau)} `,
      faces: facesDuModele(model),
      dy: altitudes.get(niveau) ?? 0,
    })),
    name,
  );
}

/**
 * EN COULEURS — correctif de l'audit : le fichier partait tout blanc, sans
 * le décor. La maquette de l'app, peintures, sols et murs d'accent
 * compris ; une couleur par sommet (« v x y z r g b »), que lisent
 * Blender, MeshLab et la plupart des visionneuses. Un seul fichier : pas
 * de .mtl à égarer en chemin.
 */
function facesDuModele(model: ModelForExport): (Face3D & { piece?: string })[] {
  const pieces = (model.rooms ?? []) as (RoomShape & { peinture?: string; sol?: string; solTeinte?: string; accents?: Record<string, string> })[];
  const scene = buildScene(model.walls, model.openings, model.objects, {
    palette: MAQUETTE,
    showSurfaces: true,
    rooms: model.rooms,
    fixtures: model.fixtures,
    ceiling: model.ceiling,
    matieres: matieresDesSols(pieces),
    peintures: peinturesDesPieces(pieces),
    sols: solsDesPieces(pieces),
    accents: accentsDesPieces(pieces),
  });
  // Le sol de chaque pièce porte son nom : la pièce dont le contour contient son centre.
  const noms = new Map((model.rooms ?? []).map((r) => [r.id, (r as { name?: string }).name ?? '']));
  const contours = roomParts(model.walls, model.rooms ?? [])
    .filter((p) => (p.surface?.pts.length ?? 0) >= 3 && noms.get(p.roomId))
    .map((p) => ({ nom: noms.get(p.roomId)!, pts: p.surface!.pts }));
  if (contours.length === 0) return scene.faces;
  return scene.faces.map((f) => {
    if (!f.isFloor || f.pts.length < 3) return f;
    const c = {
      x: f.pts.reduce((t, p) => t + p.x, 0) / f.pts.length,
      z: f.pts.reduce((t, p) => t + p.z, 0) / f.pts.length,
    };
    // Le sol EST le contour de sa pièce (même sommets) ; à défaut, son centre
    // — qui peut tomber hors d'une pièce en L, d'où la première règle.
    const meme = contours.find(
      (k) => k.pts.length === f.pts.length && Math.hypot(k.pts[0].x - f.pts[0].x, k.pts[0].z - f.pts[0].z) < 1e-6,
    );
    const piece = (meme ?? contours.find((k) => pointInPolygon(c, k.pts)))?.nom;
    return piece ? { ...f, piece } : f;
  });
}

function ecrireObj(
  parties: { prefixe: string; faces: (Face3D & { piece?: string })[]; dy: number }[],
  name: string,
): string {
  const lines: string[] = [
    `# ${name} — exporté par EchoPlan`,
    '# Unités : mètres. Y vers le haut. Couleur par sommet : v x y z r g b.',
  ];
  const verts: string[] = [];
  const byGroup = new Map<string, string[]>();
  let base = 1;

  for (const face of parties.flatMap((x) => x.faces.map((f) => ({ ...f, prefixe: x.prefixe, dy: x.dy })))) {
    const { prefixe, dy } = face;
    // Un contour n'est pas une surface ; une arête isolée non plus.
    if (face.fill === null || face.pts.length < 3) continue;
    const [rouge, vert, bleu] = rgbDe(face.fill);
    /*
      LE Z DU PLAN EST LE Z DU FICHIER — revue « Inès » : il s'écrivait
      retourné, un seul axe, et la maison s'ouvrait dans Blender en miroir
      de son plan (le DXF, lui, était juste). Le repère de l'iPhone est déjà
      celui de l'OBJ — y vers le haut, main droite. Les faces se lisent dans
      l'autre sens pour garder leur endroit tourné du même côté qu'avant.
    */
    for (const p of face.pts) {
      verts.push(`v ${n3(p.x)} ${n3(p.y + dy)} ${n3(p.z)} ${n3(rouge)} ${n3(vert)} ${n3(bleu)}`);
    }
    const idx = face.pts.map((_, i) => base + i).reverse().join(' ');
    const g = `${prefixe}${groupOf(face)}`;
    const list = byGroup.get(g) ?? [];
    list.push(`f ${idx}`);
    byGroup.set(g, list);
    base += face.pts.length;
  }

  lines.push(...verts);
  for (const [group, faces] of byGroup) {
    lines.push(`g ${group}`, ...faces);
  }
  return `${lines.join('\n')}\n`;
}

/** « Dupont - Modèle 3D.obj » : la règle commune (voir `nomDeFichier`). */
export function objFilename(name: string): string {
  return nomDeFichier(name, 'obj', { genre: 'Modèle 3D' });
}
