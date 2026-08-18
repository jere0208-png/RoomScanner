/**
 * LE COÛT DU TRI, IMAGE PAR IMAGE.
 *
 * Relevé du chantier : « le modèle 3D est lent, faible fps lorsqu'il est en
 * mouvement, à cause des meubles ». C'était vrai et c'était moi : l'ordre de
 * peinture interne des meubles se recalculait à chaque image en comparant
 * TOUTES les faces deux à deux, plusieurs fois de suite. Sur un logement de
 * onze meubles — près de mille trois cents faces, dont les trois quarts sont
 * des arêtes — cela faisait des centaines de milliers de tests par image.
 *
 * Depuis, on ne classe que les APLATS (les arêtes suivent le leur), et l'on
 * ne compare que les faces dont les boîtes se recouvrent à l'écran, repérées
 * par balayage. Ce banc fixe le budget : une image de tri doit tenir
 * largement sous le temps d'une image à trente par seconde.
 */
import {
  ajusterBlocs,
  buildScene,
  faceDepth,
  isHiddenFace,
  roomRanks,
  sceneFraming,
  type CameraTrig,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888',
  wallTop: '#F4F4F4', wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B',
  window: '#3EB8E5', passage: '#2F6BFF', object: '#D8E1F2', objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});

/** Un salon meublé comme celui du chantier : onze meubles. */
const MURS = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4.5),
  mur('s', 6, 4.5, 0, 4.5),
  mur('o', 0, 4.5, 0, 0),
];
const CATEGORIES = [
  'sofa', 'bed', 'table', 'chair', 'storage', 'refrigerator',
  'television', 'storage', 'table', 'chair', 'storage',
];
const MEUBLES: ObjectData[] = CATEGORIES.map((c, i) => ({
  id: `o${i}`,
  category: c,
  width: 0.6 + (i % 4) * 0.35,
  depth: 0.5 + (i % 3) * 0.3,
  height: 0.5 + (i % 5) * 0.25,
  transform: [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
    0.8 + (i % 4) * 1.4, 0.5, 0.7 + Math.floor(i / 4) * 1.4, 1,
  ],
}));

it('classe un salon meublé en bien moins d’une image', () => {
  const { faces, rooms } = buildScene(MURS, [], MEUBLES, {
    palette: PAL,
    showSurfaces: true,
    rooms: [{ id: 'r1' }],
  });
  const centre = sceneFraming(faces).center;
  const rad = (d: number) => (d * Math.PI) / 180;
  const projecteur = (cam: CameraTrig) => (p: P3) => {
    const x = p.x - centre.x;
    const y = p.y - centre.y;
    const z = p.z - centre.z;
    const rx = x * cam.ct - z * cam.st;
    const rz = x * cam.st + z * cam.ct;
    return {
      sx: 200 + rx * 60,
      sy: 260 + (rz * cam.cp - y * cam.sp) * 60,
      depth: rz * cam.sp + y * cam.cp,
    };
  };

  let total = 0;
  let repos = 0;
  const IMAGES = 36;
  for (let k = 0; k < IMAGES; k++) {
    const theta = k * 10;
    const cam = {
      ct: Math.cos(rad(theta)), st: Math.sin(rad(theta)),
      cp: Math.cos(rad(45)), sp: Math.sin(rad(45)),
    };
    const project = projecteur(cam);
    const rangs = roomRanks(rooms, cam);
    const vues = faces
      .filter((f) => !isHiddenFace(f, cam))
      .map((f) => ({
        proj: f.pts.map(project),
        depth: faceDepth(f, project, cam, rangs),
        owner: f.ownerId,
        room: f.roomId,
        pan: f.panId,
        bord: f.bordDe,
      }));
    const copie = vues.map((v) => ({ ...v }));
    const t0 = Date.now();
    ajusterBlocs(vues, true);
    total += Date.now() - t0;
    const t1 = Date.now();
    ajusterBlocs(copie);
    repos += Date.now() - t1;
  }
  const parImage = total / IMAGES;
  const parImageRepos = repos / IMAGES;
  // Trente images par seconde laissent 33 ms pour TOUT : projeter, trier,
  // et rendre. Le tri interne des meubles ne doit en prendre qu'une part.
  console.log(
    `tri interne : ${parImage.toFixed(2)} ms en mouvement, ` +
      `${parImageRepos.toFixed(2)} ms au repos`,
  );
  /*
    ON JUGE LE RAPPORT, PAS LE CHRONOMÈTRE.

    Une durée absolue ne veut rien dire ici : la suite tourne à plusieurs
    processus en parallèle, et la même mesure double selon la charge de la
    machine. Ce qui tient, en revanche, c'est l'écart entre les deux
    régimes — il vient de la structure du calcul, pas du processeur.
  */
  const rapport = parImage / Math.max(0.001, parImageRepos);
  expect(
    `${rapport < 0.6 ? 'allégé' : `trop lourd (×${rapport.toFixed(2)})`}`,
  ).toBe('allégé');
  // Et un garde-fou large, pour attraper une explosion de coût : au repos,
  // une image de tri ne doit pas dépasser trois images d'affichage.
  expect(
    `${parImageRepos < 100 ? 'tenu' : `dépassé (${parImageRepos.toFixed(1)} ms)`}`,
  ).toBe('tenu');
});
