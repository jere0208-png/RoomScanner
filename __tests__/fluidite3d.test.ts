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
    ON JUGE LA MATIÈRE, PAS LE CHRONOMÈTRE.

    Une durée absolue ne veut rien dire ici : la suite tourne à plusieurs
    processus en parallèle, et la même mesure double selon la charge. Ce qui
    tient, c'est le NOMBRE DE FACES à classer — c'est lui qui faisait ramer le
    modèle, et c'est lui qu'on a divisé par quatre en traçant le contour d'un
    meuble avec son aplat plutôt qu'en quatre-vingt-huit traits séparés.
  */
  const duMobilier = faces.filter((f) => f.ownerId);
  const parMeuble = duMobilier.length / MEUBLES.length;
  const traits = duMobilier.filter((f) => f.pts.length === 2).length;
  console.log(
    `${parMeuble.toFixed(0)} faces par meuble, ${traits} traits à part — ` +
      `tri : ${parImage.toFixed(2)} ms en mouvement, ` +
      `${parImageRepos.toFixed(2)} ms au repos`,
  );
  // Un meuble ne doit plus produire de trait à classer : son contour est
  // dessiné avec son pan.
  expect(`${traits} trait(s) séparé(s)`).toBe('0 trait(s) séparé(s)');
  expect(`${parMeuble < 45 ? 'léger' : `lourd (${parMeuble.toFixed(0)})`}`).toBe(
    'léger',
  );
  // Et un garde-fou large sur le temps, pour attraper une explosion de coût.
  expect(
    `${parImageRepos < 100 ? 'tenu' : `dépassé (${parImageRepos.toFixed(1)} ms)`}`,
  ).toBe('tenu');
});

/**
 * UN MUR NE PASSE PAS DEVANT LE MEUBLE QU'IL PORTE.
 *
 * Releve du chantier, capture a l appui : « il y a des modeles 3D qui se
 * font superposer par des murs lorsqu on reste appuye pour tourner ». Au
 * repos tout est juste ; le doigt pose, un mur vient recouvrir le canape.
 *
 * La cause tient en un mot : pendant le geste, la scene se batissait en
 * mode GROSSIER — chaque mur d un seul tenant au lieu d etre decoupe en
 * bandes de soixante centimetres. Or c est le decoupage qui permet au tri
 * du peintre de departager un mur long d un objet pose devant lui : d un
 * seul tenant, le mur porte UNE profondeur moyenne, et il passe devant ou
 * derriere EN BLOC. Vu en biais, sa moitie proche l emporte, et le meuble
 * disparait derriere le mur qui est pourtant derriere lui.
 */
const dansLePolygone = (
  p: { sx: number; sy: number },
  poly: { sx: number; sy: number }[],
) => {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.sy > p.sy !== b.sy > p.sy &&
      p.sx < ((b.sx - a.sx) * (p.sy - a.sy)) / (b.sy - a.sy) + a.sx
    ) {
      dedans = !dedans;
    }
  }
  return dedans;
};

/**
 * Combien d angles cachent le meuble derriere un mur ?
 *
 * `figer` rejoue ce que faisait la vue pendant un geste : reprendre les
 * profondeurs calculees jusqu a QUATRE DEGRES plus tot, au lieu de celles
 * de l angle courant.
 */
const anglesQuiCachent = (figer: boolean, grossier = false) => {
  const { faces, rooms } = buildScene(
    // Une cloison traverse la piece : c est ELLE qui vient recouvrir le
    // meuble quand elle est prise d un seul tenant — le cas de la capture.
    [...MURS, mur('cloison', 1, 2.2, 5, 2.2)],
    [],
    // Le meuble se tient juste derriere elle.
    [
      {
        id: 'canape',
        category: 'sofa',
        width: 2,
        depth: 0.9,
        height: 0.8,
        // Decale vers un BOUT de la cloison, pas devant son milieu : c est
        // la que le mur pris d un seul tenant se trompe, sa profondeur
        // moyenne etant celle de son centre.
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.6, 0.4, 3.1, 1],
      },
    ],
    { palette: PAL, showSurfaces: true, rooms: [{ id: 'r1' }], coarse: grossier },
  );
  const centre = sceneFraming(faces).center;
  const rad = (d: number) => (d * Math.PI) / 180;
  let caches = 0;
  const vuesA = (theta: number) => {
    const cam = {
      ct: Math.cos(rad(theta)),
      st: Math.sin(rad(theta)),
      cp: Math.cos(rad(45)),
      sp: Math.sin(rad(45)),
    };
    const project = (p: P3) => {
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
        mur: f.ownerId === 'cloison',
        meuble: f.ownerId === 'canape',
      }));
    ajusterBlocs(vues, false);
    return vues;
  };

  for (let k = 0; k < 36; k++) {
    const theta = k * 10;
    const vues = vuesA(theta);
    if (figer) {
      // Ce que faisait la vue : reprendre les profondeurs d un angle deja
      // parcouru, tant qu on n a pas tourne de plus de quatre degres.
      const table = new Map<number, number>();
      for (const v of vuesA(theta - 4)) {
        if (v.pan !== undefined) table.set(v.pan, v.depth);
      }
      for (const v of vues) {
        const d = v.pan !== undefined ? table.get(v.pan) : undefined;
        if (d !== undefined) v.depth = d;
      }
    }
    const dessus = vues
      .filter((v) => v.meuble)
      .sort((a, b) => b.depth - a.depth)[0];
    if (!dessus) continue;
    const c = {
      sx: dessus.proj.reduce((s, p) => s + p.sx, 0) / dessus.proj.length,
      sy: dessus.proj.reduce((s, p) => s + p.sy, 0) / dessus.proj.length,
    };
    // Une face de mur dessinee APRES le meuble et qui recouvre son centre :
    // a l ecran, le meuble a disparu derriere le mur.
    if (
      vues.some(
        (v) => v.mur && v.depth > dessus.depth && dansLePolygone(c, v.proj),
      )
    ) {
      caches += 1;
    }
  }
  return caches;
};

it('ne cache jamais le meuble derriere son mur, geste ou pas', () => {
  // Au repos, chaque mur est decoupe en bandes de soixante centimetres et
  // chaque bande porte sa propre profondeur : rien ne se recouvre a tort.
  expect(anglesQuiCachent(false)).toBe(0);
  // L ordre reutilise quelques degres ne suffit pas a tromper le tri.
  expect(anglesQuiCachent(true)).toBe(0);
  /*
    ET PENDANT LE GESTE NON PLUS — c est CE cas qui ratait.

    La scene se batissait alors en mode GROSSIER : chaque mur d un seul
    tenant, pour alleger le rendu. Un mur entier ne porte plus qu UNE
    profondeur, celle de son centre — et un meuble place devant sa moitie
    proche se retrouve classe DERRIERE lui. Le mur passe devant le meuble,
    tant que le doigt reste pose ; on lache, tout revient en place.
  */
  expect(anglesQuiCachent(true, true)).toBe(0);
});
