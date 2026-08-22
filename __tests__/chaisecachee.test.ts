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
  cutawayOpacity,
  buildScene,
  faceDepth,
  isHiddenFace,
  roomRanks,
  sceneFraming,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';

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

/**
 * AUCUN MUR NE PASSE DEVANT UN MEUBLE.
 *
 * Releve du patron, capture a l'appui : « des murs passent au-dessus d'une
 * chaise, corrige ca et fais que ca n'arrive a aucun meuble ».
 *
 * Le banc qui existait deja prenait un CANAPE derriere une cloison : gros,
 * bas, large. Une chaise, non — elle est HAUTE et ETROITE, et c'est ce qui
 * la perd. Un mur se classe volontairement a MI-HAUTEUR, tout entier,
 * pour qu'aucune armoire ne puisse se glisser entre le bas et le haut d'un
 * meme pan (c'est le remede au « meuble qui traverse la cloison »). Vu de
 * dessus, plus un point est haut, plus il est proche : le mur classe a
 * 1,25 m passe donc devant tout ce qui se classe plus bas — et une chaise
 * posee contre lui se classe a quarante centimetres.
 *
 * ON NE REVIENT PAS SUR LE CLASSEMENT DU MUR : il regle un defaut pire.
 * C'est le MEUBLE qui doit gagner, parce qu'un meuble est TOUJOURS dans la
 * piece, donc toujours devant le mur qui la borde. Un mur ne peut se
 * trouver devant un meuble que si le tri s'est trompe.
 *
 * On balaie tous les angles : un defaut de tri ne se voit que sous certains
 * points de vue, et c'est exactement pour ca qu'il survit aux relectures.
 */
const chaisesCachees = (grossier = false) => {
  const CHAISE = {
    id: 'chaise',
    category: 'chair',
    width: 0.45,
    depth: 0.45,
    // Haute et etroite : dossier a quatre-vingt-dix centimetres.
    height: 0.9,
    // Posee a vingt centimetres du mur nord, comme dans la capture.
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.45, 0.45, 1],
  };
  const { faces, rooms } = buildScene(MURS, [], [CHAISE], {
    palette: PAL,
    showSurfaces: true,
    rooms: [{ id: 'r1' }],
    coarse: grossier,
  });
  const centre = sceneFraming(faces).center;
  const rad = (d: number) => (d * Math.PI) / 180;
  let caches = 0;
  for (let k = 0; k < 36; k++) {
    const theta = k * 10;
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
        // Les mêmes champs que la vue 3D passe : c'est sur eux que le
        // classement s'appuie.
        owner: f.ownerId,
        room: f.roomId,
        pan: f.panId,
        bord: f.bordDe,
        meuble: f.ownerId === 'chaise',
        /*
          UN MUR EN ECORCHE NE CACHE RIEN — il se voile.

          La vue efface les murs qui sont entre l'oeil et la piece : leur
          opacite tombe a quinze pour cent, on voit au travers, et c'est
          precisement pour ca qu'ils sont classes devant. Les compter comme
          des defauts reviendrait a exiger qu'ils disparaissent — or c'est
          par eux qu'on regarde la piece.

          Ce que le patron a photographie n'etait pas un ecorche : c'etait un
          pan OPAQUE, pose sur une chaise.
        */
        mur:
          !f.ownerId &&
          (!f.cutaway || !f.normal || cutawayOpacity(f.normal, cam) > 0.9),
      }));
    ajusterBlocs(vues, false);
    for (const m of vues.filter((v) => v.meuble)) {
      const c = {
        sx: m.proj.reduce((s, p) => s + p.sx, 0) / m.proj.length,
        sy: m.proj.reduce((s, p) => s + p.sy, 0) / m.proj.length,
      };
      if (
        vues.some((v) => v.mur && v.depth > m.depth && dansLePolygone(c, v.proj))
      ) {
        caches += 1;
        break;
      }
    }
  }
  return caches;
};

/*
  CE BANC CONSTATE UN DEFAUT QUI N'EST PAS ENCORE CORRIGE.

  Vingt-deux angles de vue sur trente-six montrent un mur opaque pose sur la
  chaise. Le defaut est REEL, reproduit et mesure — il ne se voyait dans
  aucune epreuve parce que celle qui existait prenait un CANAPE : gros, bas,
  large. Une chaise est haute et etroite, et c'est ce qui la perd.

  DEUX REMEDES ONT ETE ESSAYES, ET LES DEUX CASSENT AILLEURS :

    — faire dependre la couche de tri du seuil de l'ecorche (un mur ne
      passerait devant que s'il s'efface) : le compte tombe a six, et le
      MEUBLE D'ANGLE se dechire sous au moins six angles ;
    — interdire au test au pixel de defaire l'ordre des couches : le compte
      tombe a neuf, et quatre epreuves du tri au pixel tombent avec — celles
      qui garantissent qu'un retour de mur ne recouvre pas ce qui est devant.

  La cause est plus profonde qu'un reglage : la projection N'A PAS DE
  PERSPECTIVE. Sans point de fuite, la profondeur d'un point vaut son
  eloignement PLUS son altitude, et le haut d'un mur du fond est donc « plus
  proche » que le sol devant lui. Les couches corrigent cela de face et
  lachent ailleurs ; le test au pixel corrige ailleurs et lache ici. Sortir
  de la demanderait un vrai tampon de profondeur par tuile — un chantier, pas
  un correctif.

  Le banc reste ROUGE-mais-vert : il fixe l'etat mesure. Il tombera si l'on
  regresse, et il faudra l'abaisser des qu'on fera mieux. Un banc qui
  pretendrait zero mentirait.
*/
it('reste au niveau mesure, sans regresser', () => {
  expect(chaisesCachees(false)).toBeLessThanOrEqual(22);
});

it('et pas davantage pendant un geste', () => {
  expect(chaisesCachees(true)).toBeLessThanOrEqual(22);
});
