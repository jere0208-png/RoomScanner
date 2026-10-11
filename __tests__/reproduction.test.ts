/**
 * LA 3D DU RELEVÉ — les meubles à leurs vraies cotes.
 *
 * Ce banc tenait toute la « reproduction à l'identique » : les orthophotos
 * des murs et du sol fabriquées par le natif, rattachées au plan, collées
 * sur la 3D, et le dessus des meubles à sa couleur relevée. Relevé du
 * patron, plus tard : « enlève la récupération exacte des couleurs (et donc
 * décors des pièces) car c'est jamais qualitatif ; récupère simplement la
 * couleur majoritaire d'un mur pour la reconstituer ». Tout cela est parti
 * (voir `couleurmajoritaire`). Reste ce qui ne dépendait pas des images :
 * un meuble relevé garde ses vraies mesures dans la 3D.
 */
import type { ObjectData } from 'react-native-room-scan';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

describe('les meubles du relevé', () => {
  it('un meuble coincé entre deux murs garde ses vraies cotes dans la 3D', () => {
    const lit: ObjectData = {
      id: 'lit',
      category: 'bed',
      // Plus large que la pièce de dix centimètres : le garde-fou le rabote.
      width: 3.1,
      height: 0.5,
      depth: 2,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.25, 1.5, 1],
    };
    const s = buildScene(
      [mur('n', 0, 0, 3, 0), mur('e', 3, 0, 3, 3), mur('s', 3, 3, 0, 3), mur('o', 0, 3, 0, 0)],
      [],
      [lit],
      { palette: PAL, showSurfaces: true, rooms: [{ id: 'r1' }] },
    );
    const pose = s.meubles?.find((m) => m.id === 'lit');
    expect(pose?.width).toBeCloseTo(3.1, 3);
  });
});
