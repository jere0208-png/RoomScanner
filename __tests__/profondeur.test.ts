/**
 * L'ORDRE DE PEINTURE — ce qui décide qu'un meuble est DERRIÈRE un mur.
 *
 * La vue 3D n'a pas de tampon de profondeur : elle peint les faces de la
 * plus lointaine à la plus proche, et la dernière posée gagne. Tout tient
 * donc au nombre qui classe chaque face — et ce nombre était la profondeur
 * MOYENNE de ses points.
 *
 * C'est là que ça casse. Dans une vue inclinée, la profondeur mêle
 * l'éloignement ET l'altitude : plus un point est haut, plus il est près de
 * l'œil. Un mur percé d'une fenêtre est découpé en panneaux — dont celui
 * sous l'allège, haut de un mètre, dont le centre est donc très bas, donc
 * très loin. Une armoire de deux mètres posée derrière lui a, elle, son
 * centre à un mètre : elle passait APRÈS le panneau, et se peignait
 * par-dessus le mur. C'est le meuble fantôme qu'on voyait à travers la
 * cloison.
 *
 * On vérifie ici l'invariant, pas le remède : tout ce qui appartient au mur
 * se classe devant ce qui se tient derrière lui.
 */
import {
  buildScene,
  faceDepth,
  type CameraTrig,
  type Face3D,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';

import type { ObjectData } from 'react-native-room-scan';
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

/** Une pièce de 4 × 3, mur nord en z = 0. */
const W: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

/** Une fenêtre au milieu du mur nord : elle le découpe en panneaux. */
const FENETRE: WallSeg = {
  id: 'f1',
  type: 'window',
  a: { x: 1.2, z: 0 },
  b: { x: 2.8, z: 0 },
  height: 1.2,
  yCenter: 1.6,
  roomId: 'r1',
};

/**
 * Une armoire de deux mètres, DANS la pièce, tout contre le mur nord.
 *
 * C'est le cas qui piège : haute, donc « proche » au sens de la
 * profondeur, et pourtant derrière le mur pour qui regarde du nord.
 */
const ARMOIRE: ObjectData = {
  id: 'o1',
  category: 'storage',
  width: 1,
  depth: 0.6,
  height: 2,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1, 0.45, 1],
};

/** Caméra au NORD de la pièce, inclinée : le mur nord est devant l'armoire. */
const rad = (d: number) => (d * Math.PI) / 180;
const CAM: CameraTrig = {
  ct: Math.cos(rad(180)),
  st: Math.sin(rad(180)),
  cp: Math.cos(rad(58)),
  sp: Math.sin(rad(58)),
};
const project = (p: P3) => {
  const rz = p.x * CAM.st + p.z * CAM.ct;
  return { depth: rz * CAM.sp + p.y * CAM.cp };
};

const scene = () =>
  buildScene(W, [FENETRE], [ARMOIRE], { palette: PAL, colorOpenings: true });

/** Les faces d'un mur : celles qui n'appartiennent ni au sol ni à un meuble. */
const estMur = (f: Face3D) => !f.isFloor && !f.ownerId && f.fill !== null;

/**
 * LES FACES DU MUR NORD, reconnues à leur CÔTÉ PIÈCE.
 *
 * Les repérer à « tous leurs points en z ≈ 0 » attrapait aussi les onglets
 * des murs est et ouest, qui touchent le coin. Ces murs-là sont vus par la
 * tranche depuis le nord : leur côté est indécidable, ils tombaient dans
 * l'autre couche, et l'épreuve mesurait un mur qu'elle croyait être le bon.
 * La normale vers la pièce, elle, ne trompe pas : le mur nord est le seul
 * qui regarde vers les z croissants.
 */
const duMurNord = (f: Face3D) =>
  estMur(f) &&
  !!f.roomSide &&
  f.roomSide.z > 0.9 &&
  f.pts.every((p) => Math.abs(p.z) < 0.2);

describe('l’ordre de peinture entre un meuble et le mur qui le cache', () => {
  it('reconnaît la scène de piège', () => {
    const faces = scene().faces;
    expect(faces.some((f) => f.ownerId === 'o1')).toBe(true);
    expect(faces.filter(estMur).length).toBeGreaterThan(4);
  });

  /**
   * L'INVARIANT.
   *
   * Vu du nord, tout ce qui appartient au mur nord se tient entre l'œil et
   * l'armoire : aucune face de l'armoire ne doit donc se peindre APRÈS une
   * face de ce mur — sans quoi elle la recouvre, et le meuble traverse la
   * cloison.
   */
  it('l’armoire se peint AVANT le mur qui la masque', () => {
    const faces = scene().faces.filter((f) => !f.isFloor);
    const meuble = faces.filter((f) => f.ownerId === 'o1');
    const murNord = faces.filter(duMurNord);
    expect(meuble.length).toBeGreaterThan(0);
    expect(murNord.length).toBeGreaterThan(0);

    const dMeuble = Math.max(...meuble.map((f) => faceDepth(f, project, CAM)));
    const dMur = Math.min(...murNord.map((f) => faceDepth(f, project, CAM)));
    // La profondeur croît vers l'œil, et on peint du plus loin au plus
    // proche : le meuble doit rester SOUS le plus lointain des panneaux.
    expect(dMeuble).toBeLessThan(dMur);
  });

  /**
   * ET LE MUR RESTE UN : ses morceaux ne se doublent pas entre eux.
   *
   * Un panneau bas et un panneau haut du même mur se classaient à un mètre
   * de profondeur l'un de l'autre. Ils appartiennent pourtant au même plan :
   * rien ne peut passer entre les deux.
   */
  it('et les panneaux d’un même mur se classent ensemble', () => {
    // Les pans VERTICAUX du mur nord : l'arasement, lui, est au sommet et
    // se peint légitimement en dernier — c'est ce qu'on voit par-dessus.
    const murNord = scene()
      .faces.filter(
        (f) =>
          duMurNord(f) &&
          Math.max(...f.pts.map((p) => p.y)) -
            Math.min(...f.pts.map((p) => p.y)) >
            0.1,
      )
      .map((f) => faceDepth(f, project, CAM));
    expect(murNord.length).toBeGreaterThan(3);
    const etendue = Math.max(...murNord) - Math.min(...murNord);
    // Une épaisseur de mur, pas une hauteur d'étage : le panneau sous
    // l'allège et celui du linteau se classent désormais ensemble.
    expect(etendue).toBeLessThan(0.35);
  });

  /**
   * LE CAS QUI CASSAIT : une armoire haute, collée au mur.
   *
   * Deux mètres quarante de haut, le dos contre la cloison. Son centre est
   * à 1,20 m ; celui du panneau sous l'allège à 0,50 m. Classés chacun
   * pour soi, l'armoire passait APRÈS le panneau et se peignait par-dessus :
   * on la voyait à travers le mur.
   */
  it('même une armoire haute et collée reste derrière', () => {
    const armoire: ObjectData = {
      id: 'o2',
      category: 'storage',
      width: 1.2,
      depth: 0.4,
      height: 2.4,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1.2, 0.28, 1],
    };
    const faces = buildScene(W, [FENETRE], [armoire], {
      palette: PAL,
      colorOpenings: true,
    }).faces.filter((f) => !f.isFloor);
    const meuble = faces.filter((f) => f.ownerId === 'o2');
    const murNord = faces.filter(
      (f) =>
        duMurNord(f) &&
        Math.max(...f.pts.map((p) => p.y)) -
          Math.min(...f.pts.map((p) => p.y)) >
          0.1,
    );
    expect(meuble.length).toBeGreaterThan(0);
    expect(murNord.length).toBeGreaterThan(0);
    const dMeuble = Math.max(...meuble.map((f) => faceDepth(f, project, CAM)));
    const dMur = Math.min(...murNord.map((f) => faceDepth(f, project, CAM)));
    expect(dMeuble).toBeLessThan(dMur);
  });
});
