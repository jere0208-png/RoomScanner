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
import { buildScene, type Face3D, type ScenePalette } from './../geometry/scene3d';

/** Palette neutre : l'OBJ ne porte pas les couleurs, seule la forme compte. */
const SHAPE_ONLY: ScenePalette = {
  floor: '#FFFFFF',
  floorStroke: '#FFFFFF',
  wall: '#FFFFFF',
  wallStroke: '#FFFFFF',
  wallTop: '#FFFFFF',
  wallTopStroke: '#FFFFFF',
  opening: '#FFFFFF',
  door: '#FFFFFF',
  window: '#FFFFFF',
  passage: '#FFFFFF',
  object: '#FFFFFF',
  objectTop: '#FFFFFF',
  objectStroke: '#FFFFFF',
};

export interface ModelForExport {
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  rooms?: RoomShape[];
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
  const scene = buildScene(model.walls, model.openings, model.objects, {
    palette: SHAPE_ONLY,
    showSurfaces: true,
    rooms: model.rooms,
  });
  const lines: string[] = [
    `# ${name} — exporté par EchoPlan`,
    '# Unités : mètres. Y vers le haut.',
  ];
  const verts: string[] = [];
  const byGroup = new Map<string, string[]>();
  let base = 1;

  for (const face of scene.faces) {
    // Un contour n'est pas une surface ; une arête isolée non plus.
    if (face.fill === null || face.pts.length < 3) continue;
    for (const p of face.pts) {
      verts.push(`v ${n3(p.x)} ${n3(p.y)} ${n3(-p.z)}`);
    }
    const idx = face.pts.map((_, i) => base + i).join(' ');
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
    .replace(/[^\w\- ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${clean || 'echoplan'}.obj`;
}
