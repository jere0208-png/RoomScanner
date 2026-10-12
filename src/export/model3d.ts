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
 * près tout le reste. Les couleurs ne survivent pas (elles demanderaient un
 * `.mtl` séparé, or on ne partage qu'un fichier) — mais les éléments sont
 * regroupés par nature, ce qui permet de les sélectionner et de les remettre
 * en matière d'un clic dans le logiciel de destination.
 */
import type { ObjectData } from 'react-native-room-scan';
import type { RoomShape, WallSeg } from '../geometry/floorplan';
import type { Fixture } from '../geometry/electrical';
import { buildScene, type Face3D } from './../geometry/scene3d';
import { MAQUETTE, matieresDesSols } from '../ui/maquette';
import { accentsDesPieces, peinturesDesPieces, solsDesPieces } from '../ui/habillage';

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
}

/** À quel groupe OBJ appartient une face. */
function groupOf(face: Face3D): string {
  if (face.isFloor) return 'Sols';
  return 'Volumes';
}

const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();

/**
 * Écrit la scène en OBJ. Les faces sans remplissage (contours, passages en
 * pointillé) ne sont pas exportées : ce sont des artifices de dessin, pas de
 * la matière.
 */
export function buildObj(model: ModelForExport, name = 'EchoPlan'): string {
  /*
    EN COULEURS — correctif de l'audit : le fichier partait tout blanc, sans
    le décor. La maquette de l'app, peintures, sols et murs d'accent
    compris ; une couleur par sommet (« v x y z r g b »), que lisent
    Blender, MeshLab et la plupart des visionneuses. Un seul fichier : pas
    de .mtl à égarer en chemin.
  */
  const pieces = (model.rooms ?? []) as (RoomShape & { peinture?: string; sol?: string; accents?: Record<string, string> })[];
  const scene = buildScene(model.walls, model.openings, model.objects, {
    palette: MAQUETTE,
    showSurfaces: true,
    rooms: model.rooms,
    fixtures: model.fixtures,
    matieres: matieresDesSols(pieces),
    peintures: peinturesDesPieces(pieces),
    sols: solsDesPieces(pieces),
    accents: accentsDesPieces(pieces),
  });
  const lines: string[] = [
    `# ${name} — exporté par EchoPlan`,
    '# Unités : mètres. Y vers le haut. Couleur par sommet : v x y z r g b.',
  ];
  const verts: string[] = [];
  const byGroup = new Map<string, string[]>();
  let base = 1;

  for (const face of scene.faces) {
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
      verts.push(`v ${n3(p.x)} ${n3(p.y)} ${n3(p.z)} ${n3(rouge)} ${n3(vert)} ${n3(bleu)}`);
    }
    const idx = face.pts.map((_, i) => base + i).reverse().join(' ');
    const g = groupOf(face);
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

/** Nom de fichier propre pour un export de modèle. */
export function objFilename(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // « 12/10/2026 » devient « 12-10-2026 », comme dans le DXF (revue « Léa »).
    .replace(/[\\/:]+/g, ' ')
    .replace(/[^\w\-+ ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${clean || 'echoplan'}.obj`;
}
