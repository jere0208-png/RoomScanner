/**
 * UNE PORTE, EN VOLUME, SE LIT COMME UNE PORTE.
 *
 * Relevé de chantier, capture à l'appui : « en choisissant la porte, elle
 * est opaque, pas d'ouverture reelle ».
 *
 * La maquette bâtissait bien le mur AUTOUR de la baie — trumeaux, linteau,
 * allège — puis rebouchait le trou d'un panneau plein de la couleur des
 * portes. Résultat : un rectangle beige plaqué sur un mur beige. Rien ne
 * disait qu'on pouvait passer là, ni de quel côté la porte s'ouvrait, et le
 * plan 2D racontait pourtant l'inverse à deux centimètres de là — lui
 * dessine le battant et son quart de cercle depuis toujours.
 *
 * DEUX CHOSES FONT UNE PORTE, et la maquette les montre maintenant toutes
 * les deux :
 *
 *   — LE PERCEMENT : le vide, exactement comme une baie libre — le mur
 *     s'arrête et on voit au travers. C'est le trou dans la maçonnerie. Il
 *     était cerné d'un pointillé sur les deux faces du mur ; relevé du
 *     patron, « enlève les pointillés des ouvertures sur le plan 3D » : le
 *     trou se lit sans trait, et plus rien n'est tireté dans la maquette ;
 *
 *   — LE SEUIL : une barre plate au sol, dans l'epaisseur du tableau. C'est
 *     lui qui dit qu'ici on FERME, alors qu'une baie libre se traverse.
 *
 * LE VANTAIL EN VOLUME A ETE ESSAYE, ET ECARTE. Le plan 2D dessine le
 * battant ouvert a l'equerre et son quart de cercle ; le porter en trois
 * dimensions paraissait aller de soi, et ce banc l'a d'abord exige. La
 * mesure a dit non : sur la chambre meublee du banc d'audit — porte de 90
 * sur le mur ouest, lit a quarante-cinq centimetres — le vantail ouvert
 * TRAVERSE le lit. Deux volumes qui s'interpenetrent n'ont pas d'ordre de
 * peinture : l'audit comptait cent dix recouvrements, sur du mobilier situe
 * a l'autre bout de la piece, parce qu'un seul cycle derange tout le
 * classement. Connaitre le debattement reel demanderait de savoir ce qui
 * l'encombre, meuble par meuble, a chaque image : c'est le prix qu'on a
 * refuse. Le sens d'ouverture reste dit par le plan, le PDF et l'export CAO.
 */
import { buildScene } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import {
  detectRooms,
  mergeColinear,
  splitAtJunctions,
  weldCorners,
  type WallSeg,
} from '../src/geometry/floorplan';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Une piece de 4 x 3, mur nord en z = 0, interieur du cote des z positifs. */
const MURS = mergeColinear(
  splitAtJunctions(
    weldCorners([
      mur('n', 0, 0, 4, 0),
      mur('e', 4, 0, 4, 3),
      mur('s', 4, 3, 0, 3),
      mur('w', 0, 3, 0, 0),
    ]),
  ),
).map((w) => ({ ...w, roomId: 'room-1' }));

const ROOMS = detectRooms(MURS).map((r, i) => ({
  id: `room-${i + 1}`,
  wallIds: r.wallIds,
}));

const menuiserie = (type: 'door' | 'window' | 'opening'): WallSeg => ({
  id: 'o1',
  type,
  roomId: 'room-1',
  a: { x: 1.6, z: 0 },
  b: { x: 2.43, z: 0 },
  height: 2.04,
  yCenter: 1.02,
});

const scene = (o: WallSeg) =>
  buildScene(MURS, [o], [], {
    palette: MAQUETTE,
    showSurfaces: true,
    rooms: ROOMS,
  });

/** Tout trait tirete de la maquette : il n'y en a plus aucun. */
const pointilles = (faces: { dashed?: boolean }[]) => faces.filter((f) => f.dashed);

/**
 * Ce qui BOUCHE la baie : une surface pleine, dans sa travee (x de 1,6 a
 * 2,43), entre le seuil et le linteau, dans l'epaisseur du mur. Les tableaux
 * — les flancs du trou, qui tournent dans l'epaisseur — sont perpendiculaires
 * au mur : on ne compte que ce qui lui est parallele.
 */
const bouchons = (
  faces: {
    fill: string | null;
    isFloor?: boolean;
    pts: { x: number; y: number; z: number }[];
  }[],
) =>
  faces.filter((f) => {
    if (f.isFloor || !f.fill) return false;
    const x = f.pts.map((p) => p.x);
    const y = f.pts.map((p) => p.y);
    const z = f.pts.map((p) => p.z);
    const parallele = Math.max(...z) - Math.min(...z) < 0.01;
    return (
      parallele &&
      Math.min(...x) < 2.3 &&
      Math.max(...x) > 1.7 &&
      Math.max(...y) > 0.5 &&
      Math.min(...y) < 1.8 &&
      Math.max(...z.map(Math.abs)) < 0.25
    );
  });

/**
 * Le SEUIL, cherche par sa NATURE : une surface PLEINE qui rase le sol, dans
 * la travee de la baie et dans l'epaisseur du mur. On ne le cherche ni par sa
 * couleur ni par une epaisseur en chiffres — cinq bancs sont deja morts d'avoir
 * nomme un reglage par son chiffre.
 */
const seuils = (
  faces: {
    fill: string | null;
    isFloor?: boolean;
    pts: { x: number; y: number; z: number }[];
  }[],
) =>
  faces.filter((f) => {
    if (f.isFloor || !f.fill) return false;
    const x = f.pts.map((p) => p.x);
    const y = f.pts.map((p) => p.y);
    const z = f.pts.map((p) => p.z);
    if (Math.min(...x) < 1 || Math.max(...x) > 3) return false;
    // Dans l'epaisseur du mur (il est en z = 0), et couche au sol.
    return Math.max(...y) < 0.1 && Math.max(...z.map(Math.abs)) < 0.25;
  });

/**
 * RIEN NE TRAVERSE LA PIECE : le controle qui a fait ecarter le vantail.
 * Une surface haute qui s'ecarte franchement du plan de son mur, dans la
 * travee de la baie, n'a pas sa place dans la maquette.
 */
const enTraversDeLaPiece = (
  faces: { pts: { x: number; y: number; z: number }[] }[],
) =>
  faces.filter((f) => {
    const x = f.pts.map((p) => p.x);
    const y = f.pts.map((p) => p.y);
    const z = f.pts.map((p) => p.z);
    if (Math.min(...x) < 1 || Math.max(...x) > 3) return false;
    return Math.max(...y) - Math.min(...y) > 1 && Math.min(...z) > 0.3;
  });

describe('la porte en volume', () => {
  it('perce le mur au lieu de le reboucher', () => {
    expect(bouchons(scene(menuiserie('door')).faces)).toHaveLength(0);
    // Le contre-sens : une fenetre, elle, garde son vitrage dans la baie.
    expect(bouchons(scene(menuiserie('window')).faces).length).toBeGreaterThan(0);
  });

  it('sans aucun pointillé autour du trou', () => {
    for (const t of ['door', 'opening', 'window'] as const) {
      expect(pointilles(scene(menuiserie(t)).faces)).toHaveLength(0);
    }
  });

  it('pose son seuil au sol, dans la travee de la baie', () => {
    const s3 = seuils(scene(menuiserie('door')).faces);
    expect(s3.length).toBeGreaterThan(0);
    // Un volume, pas un plan : le seuil se voit de dessus comme de cote.
    expect(new Set(s3.map((f) => JSON.stringify(f.pts))).size).toBeGreaterThan(1);
  });

  it('ne plante rien en travers de la piece', () => {
    expect(enTraversDeLaPiece(scene(menuiserie('door')).faces)).toHaveLength(0);
    expect(
      enTraversDeLaPiece(
        scene({ ...menuiserie('door'), versExterieur: true }).faces,
      ),
    ).toHaveLength(0);
  });

  /*
    LE SEUIL DIT LA NATURE, SANS REGLAGE A COCHER.

    Le pourtour tirete — ambre pour une porte, bleu pour une baie — a ete
    retire a la demande du patron. Ce qui reste pour les distinguer est ce
    qui les distingue sur le chantier : la porte a un seuil, la baie libre
    n'en a pas.
  */
  it('se distingue d’une baie par son seuil, sans rien cocher', () => {
    expect(seuils(scene(menuiserie('door')).faces).length).toBeGreaterThan(0);
    expect(seuils(scene(menuiserie('opening')).faces)).toHaveLength(0);
  });

  /*
    LES CONTROLES EN SENS INVERSE. Sans eux, un rendu qui poserait un seuil
    sous toute menuiserie — ou aucun — passerait pour juste.
  */
  it('une baie libre se traverse, et ne porte pas de seuil', () => {
    const f = scene(menuiserie('opening')).faces;
    expect(bouchons(f)).toHaveLength(0);
    expect(seuils(f)).toHaveLength(0);
  });

  it('une fenetre garde son vitrage : ni percement ouvert, ni seuil', () => {
    const f = scene(menuiserie('window')).faces;
    expect(seuils(f)).toHaveLength(0);
    expect(pointilles(f)).toHaveLength(0);
  });
});
