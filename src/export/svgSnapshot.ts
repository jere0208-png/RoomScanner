/**
 * Rendu SVG de la scène 3D, hors de React.
 *
 * Sert de GARDE-FOU VISUEL : la CI en produit une planche à chaque
 * modification et la compare à celle versionnée dans le dépôt. Un changement
 * de rendu apparaît donc comme un diff d'image dans la pull request, avant
 * même d'installer l'IPA. C'est ce qui manquait le jour où le pointillé des
 * passages a contaminé tout le modèle sans qu'aucun des 95 tests ne bronche.
 *
 * Le tracé suit exactement le même chemin que la vue de l'app : `buildScene`,
 * `sceneFraming`, masquage des faces arrière, tri du peintre, `shadeFill`.
 */
import type { ObjectData } from 'react-native-room-scan';
import type { RoomShape, WallSeg } from '../geometry/floorplan';
import type { Fixture } from '../geometry/electrical';
import {
  faceDepth,
  buildScene,
  isHiddenFace,
  sceneFraming,
  shadeFill,
  type ScenePalette,
} from '../geometry/scene3d';
import { MAQUETTE } from '../ui/maquette';

/*
  LA PLANCHE MONTRE CE QUE L'APP MONTRE.

  Elle avait sa propre palette, recopiée de celle de l'écran : deux listes
  de treize teintes à tenir d'accord, et elles avaient déjà divergé. La
  planche sert de garde-fou visuel — elle ne garde rien si elle ne montre
  pas la même chose. Elle prend donc la palette de la maquette, celle de
  l'écran (`src/ui/maquette.ts`).
*/
export const SNAPSHOT_PALETTE: ScenePalette = MAQUETTE;

export interface SnapshotView {
  theta: number;
  tilt: number;
}

export interface SnapshotInput {
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  rooms?: RoomShape[];
  fixtures?: Fixture[];
  showSurfaces?: boolean;
}

const rad = (d: number) => (d * Math.PI) / 180;
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** Une vue de la scène, en SVG autonome. */
export function renderSceneSvg(
  input: SnapshotInput,
  view: SnapshotView,
  width = 420,
  height = 340,
): string {
  const scene = buildScene(input.walls, input.openings, input.objects, {
    palette: SNAPSHOT_PALETTE,
    showSurfaces: input.showSurfaces ?? true,
    rooms: input.rooms,
    fixtures: input.fixtures,
  });
  const { center, radius3d } = sceneFraming(scene.faces);
  const ct = Math.cos(rad(view.theta));
  const st = Math.sin(rad(view.theta));
  const cp = Math.cos(rad(view.tilt));
  const sp = Math.sin(rad(view.tilt));
  const scale = (Math.min(width, height) * 0.44) / radius3d;

  const project = (p: { x: number; y: number; z: number }) => {
    const x = p.x - center.x;
    const y = p.y - center.y;
    const z = p.z - center.z;
    const rx = x * ct - z * st;
    const rz = x * st + z * ct;
    return {
      sx: width / 2 + rx * scale,
      sy: height / 2 + (rz * cp - y * sp) * scale,
      depth: rz * sp + y * cp,
    };
  };

  const cam = { ct, st, cp, sp };
  const polys = scene.faces
    .filter((f) => !isHiddenFace(f, cam))
    .map((f) => {
      const proj = f.pts.map(project);
      // Même règle de profondeur que la vue 3D et le PDF, au même endroit.
      const depth = faceDepth(f, project, cam);
      const fill = shadeFill(f, ct, st) ?? 'none';
      return {
        depth,
        fill,
        stroke: f.stroke ?? fill,
        dashed: !!f.dashed,
        count: proj.length,
        points: proj.map((p) => `${n2(p.sx)},${n2(p.sy)}`).join(' '),
      };
    })
    .sort((a, b) => a.depth - b.depth);

  const body = polys
    .map((p) => {
      const common =
        ` stroke="${p.stroke}" stroke-width="${p.dashed ? 1.8 : 1}"` +
        ` stroke-dasharray="${p.dashed ? '6 4' : '0'}"`;
      // Deux points = une arête : un polygone dégénéré ne se dessine pas.
      return p.count === 2
        ? `<polyline points="${p.points}" fill="none"${common} stroke-linecap="round"/>`
        : `<polygon points="${p.points}" fill="${p.fill}"${common} stroke-linejoin="round"/>`;
    })
    .join('\n');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">\n` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>\n` +
    `${body}\n</svg>\n`
  );
}

/** Les quatre angles de la planche de référence. */
export const SNAPSHOT_VIEWS: { name: string; view: SnapshotView }[] = [
  { name: 'trois-quarts', view: { theta: -32, tilt: 58 } },
  { name: 'arriere', view: { theta: 148, tilt: 42 } },
  { name: 'dessus', view: { theta: 0, tilt: 15 } },
  { name: 'rasante', view: { theta: 70, tilt: 78 } },
];
