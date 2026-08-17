/**
 * QUI RECOUVRE QUI — l'épreuve au pixel, la seule qui ne mente pas.
 *
 * Deux invariants précédents disaient « un meuble derrière un mur reste
 * derrière » et son inverse. Tous deux comparaient les EXTRÊMES de deux
 * faces : une face n'était jugée « devant » que si TOUS ses points l'étaient.
 * Un meuble adossé à un mur ne remplit jamais cette condition — son dos
 * touche la maçonnerie — et la paire était donc écartée sans être jugée.
 *
 * C'est exactement le cas que le chantier a filmé : en tournant le modèle,
 * le rangement disparaît, avalé par le mur contre lequel il s'appuie.
 *
 * Ici, on juge comme l'œil : on prend un POINT de l'écran couvert par les
 * deux faces, on calcule la profondeur de chacune EN CE POINT, et celle qui
 * est devant doit être peinte en dernier. Aucune tolérance, aucune
 * moyenne — c'est la définition même de « recouvrir ».
 */
import {
  buildScene,
  faceDepth,
  isHiddenFace,
  roomRanks,
  sceneFraming,
  type CameraTrig,
  type Face3D,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';
import type { Fixture } from '../src/geometry/electrical';

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

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  roomId = 'r1',
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

const boite = (
  id: string,
  categorie: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
): ObjectData => ({
  id,
  category: categorie,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, h / 2, cz, 1],
});

/** La chambre de la vidéo : un rangement en deux caissons, un lit. */
const CHAMBRE = {
  nom: 'chambre',
  walls: [
    mur('n', 0, 0, 3.4, 0),
    mur('e', 3.4, 0, 3.4, 2.5),
    mur('s', 3.4, 2.5, 0, 2.5),
    mur('o', 0, 2.5, 0, 0),
  ],
  rooms: [{ id: 'r1' }],
  objects: [
    boite('bas', 'storage', 1.2, 0.32, 1, 0.55, 0.9),
    boite('haut', 'storage', 1.2, 0.27, 1, 0.45, 0.8),
    boite('lit', 'bed', 2.4, 1.4, 1.4, 2, 0.5),
  ],
  fixtures: [
    { id: 'f1', kind: 'prise', wallId: 'n', along: 2.4, height: 0.25, side: 1 },
    { id: 'f2', kind: 'inter', wallId: 'o', along: 0.6, height: 1.1, side: 1 },
  ] as Fixture[],
};

/**
 * Deux pièces mitoyennes, partageant leur cloison.
 *
 * C'est le cas que le rang des pièces doit résoudre : depuis la pièce de
 * droite, le mobilier de gauche est DERRIÈRE la cloison mitoyenne — il ne
 * doit pas se voir au travers.
 */
const DEUX_PIECES = {
  nom: 'deux pièces',
  walls: [
    mur('n1', 0, 0, 3, 0),
    mur('mitoyen', 3, 0, 3, 3),
    mur('s1', 3, 3, 0, 3),
    mur('o1', 0, 3, 0, 0),
    mur('n2', 3, 0, 6, 0, 'r2'),
    mur('e2', 6, 0, 6, 3, 'r2'),
    mur('s2', 6, 3, 3, 3, 'r2'),
  ],
  rooms: [
    { id: 'r1', wallIds: ['n1', 'mitoyen', 's1', 'o1'] },
    { id: 'r2', wallIds: ['n2', 'e2', 's2', 'mitoyen'] },
  ],
  objects: [
    boite('o1', 'storage', 1.5, 0.35, 1, 0.5, 1.8),
    boite('o2', 'storage', 4.5, 2.6, 1, 0.5, 1.8),
  ],
  fixtures: [] as Fixture[],
};

/**
 * LA MÊME CHAMBRE, COULEURS RELEVÉES.
 *
 * Le calque « Couleurs » découpe chaque mur en cases teintées : autant de
 * faces supplémentaires, chacune à sa hauteur. Le chantier l'a dit : « la
 * couleur ne doit pas cacher les éléments élec ». C'est le même ordre de
 * peinture qui répond — mais il faut l'éprouver avec ces faces-là.
 */
const grille = (teinte: string) => ({
  cols: 6,
  rows: 4,
  texels: Array.from({ length: 24 }, () => teinte),
});
const CHAMBRE_COULEURS = {
  nom: 'chambre en couleurs',
  walls: CHAMBRE.walls.map((w, i) => ({
    ...w,
    color: ['#9AA88A', '#C8BFA8', '#AFB9C4', '#D6CFC2'][i % 4],
    texture: grille(['#9AA88A', '#C8BFA8', '#AFB9C4', '#D6CFC2'][i % 4]),
  })),
  rooms: CHAMBRE.rooms,
  objects: CHAMBRE.objects,
  fixtures: CHAMBRE.fixtures,
  textures: true,
};

/** Trente-six azimuts, trois inclinaisons : la caméra fait le tour. */
const ANGLES: CameraTrig[] = [];
for (let theta = 0; theta < 360; theta += 10) {
  for (const tilt of [30, 45, 58, 72]) {
    const rad = (d: number) => (d * Math.PI) / 180;
    ANGLES.push({
      ct: Math.cos(rad(theta)),
      st: Math.sin(rad(theta)),
      cp: Math.cos(rad(tilt)),
      sp: Math.sin(rad(tilt)),
    });
  }
}

const projecteur = (cam: CameraTrig, centre: P3, echelle: number) => (p: P3) => {
  const x = p.x - centre.x;
  const y = p.y - centre.y;
  const z = p.z - centre.z;
  const rx = x * cam.ct - z * cam.st;
  const rz = x * cam.st + z * cam.ct;
  return {
    sx: 200 + rx * echelle,
    sy: 260 + (rz * cam.cp - y * cam.sp) * echelle,
    depth: rz * cam.sp + y * cam.cp,
  };
};

/** Le point est-il dans ce polygone d'écran ? */
function dansLePolygone(
  pt: { sx: number; sy: number },
  poly: { sx: number; sy: number }[],
): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (
      poly[i].sy > pt.sy !== poly[j].sy > pt.sy &&
      pt.sx <
        ((poly[j].sx - poly[i].sx) * (pt.sy - poly[i].sy)) /
          (poly[j].sy - poly[i].sy) +
          poly[i].sx
    ) {
      dedans = !dedans;
    }
  }
  return dedans;
}

/**
 * La profondeur du PLAN de cette face, au point d'écran donné.
 *
 * La projection est orthographique : la profondeur varie linéairement sur
 * l'écran. Trois sommets suffisent donc à l'interpoler, en coordonnées
 * barycentriques — c'est ce que ferait un tampon de profondeur.
 */
function profondeurAu(
  f: Face3D,
  pt: { sx: number; sy: number },
  project: (p: P3) => { sx: number; sy: number; depth: number },
): number | null {
  const P = f.pts.map(project);
  for (let i = 1; i + 1 < P.length; i++) {
    const [a, b, c] = [P[0], P[i], P[i + 1]];
    const det = (b.sy - c.sy) * (a.sx - c.sx) + (c.sx - b.sx) * (a.sy - c.sy);
    if (Math.abs(det) < 1e-9) continue;
    const l1 =
      ((b.sy - c.sy) * (pt.sx - c.sx) + (c.sx - b.sx) * (pt.sy - c.sy)) / det;
    const l2 =
      ((c.sy - a.sy) * (pt.sx - c.sx) + (a.sx - c.sx) * (pt.sy - c.sy)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
    return a.depth * l1 + b.depth * l2 + c.depth * l3;
  }
  return null;
}

describe('l’ordre de peinture, jugé au pixel', () => {
  for (const cas of [CHAMBRE, DEUX_PIECES, CHAMBRE_COULEURS]) {
    it(`ne laisse rien recouvrir ce qui est devant — ${cas.nom}`, () => {
      const { faces, rooms } = buildScene(cas.walls, [], cas.objects, {
        palette: PAL,
        showSurfaces: true,
        showTextures: 'textures' in cas,
        rooms: cas.rooms,
        fixtures: cas.fixtures,
      });
      const centre = sceneFraming(faces).center;
      const fautes: string[] = [];
      for (const cam of ANGLES) {
        const project = projecteur(cam, centre, 60);
        const rangs = roomRanks(rooms, cam);
        const vues = faces.filter(
          (f) => !isHiddenFace(f, cam) && f.fill !== null && f.pts.length >= 3,
        );
        // Le contenu d'une pièce : le mobilier (`ownerId`) ET l'appareillage
        // (reconnu à la face de mur qu'il regarde). Le bâti, c'est le reste.
        const contenu = vues.filter((f) => (f.ownerId || f.facing) && !f.isFloor);
        const bati = vues.filter((f) => !f.ownerId && !f.facing && !f.isFloor);
        for (const m of contenu) {
          const pm = m.pts.map(project);
          const pt = {
            sx: pm.reduce((s, p) => s + p.sx, 0) / pm.length,
            sy: pm.reduce((s, p) => s + p.sy, 0) / pm.length,
          };
          const dm = profondeurAu(m, pt, project);
          if (dm === null) continue;
          const km = faceDepth(m, project, cam, rangs);
          for (const w of bati) {
            if (!dansLePolygone(pt, w.pts.map(project))) continue;
            const dw = profondeurAu(w, pt, project);
            if (dw === null) continue;
            // Le contenu est DEVANT en ce point : le bâti ne doit pas se
            // peindre après lui.
            if (dm > dw + 0.02 && faceDepth(w, project, cam, rangs) > km) {
              fautes.push(`${m.ownerId ?? 'appareil'} sous un mur`);
            }
          }
        }
      }
      expect(`${fautes.length} recouvrement(s)`).toBe('0 recouvrement(s)');
    });
  }
});
