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
 *   — LE PERCEMENT : le pourtour du vide, en pointillé sur les deux faces du
 *     mur, exactement comme une baie libre. C'est le trou dans la maçonnerie ;
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

/** Le pourtour du percement : un trait tirete, a la hauteur de la baie. */
const pointilles = (
  faces: { dashed?: boolean; stroke: string | null; pts: { y: number }[] }[],
) =>
  faces.filter((f) => f.dashed && Math.max(...f.pts.map((p) => p.y)) > 1.5);

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
    expect(pointilles(scene(menuiserie('door')).faces).length).toBeGreaterThan(0);
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
    LE POURTOUR DIT LA NATURE, SANS REGLAGE A COCHER.

    Le seuil ne fait que deux centimetres : de loin, une porte et une baie
    libre se ressemblaient trait pour trait. La teinte des portes a d'abord
    ete reservee au reglage « Couleur des portes/fenetres » — decoche par
    defaut, donc invisible pour qui ne l'a jamais trouve. Question posee au
    patron, reponse : « oui pour le pourtour ». Les teintes de menuiserie ne
    decorent pas, elles DESIGNENT (voir `MAQUETTE`) : le pourtour d'une porte
    est ambre en toutes circonstances, celui d'une baie reste le bleu des
    passages.
  */
  it('se distingue d’une baie au premier coup d’œil, sans rien cocher', () => {
    const teinteDe = (o: WallSeg) =>
      new Set(pointilles(scene(o).faces).map((f) => f.stroke));
    expect([...teinteDe(menuiserie('door'))]).toEqual([MAQUETTE.door]);
    expect([...teinteDe(menuiserie('opening'))]).toEqual([MAQUETTE.passage]);
  });

  /*
    LES CONTROLES EN SENS INVERSE. Sans eux, un rendu qui poserait un seuil
    sous toute menuiserie — ou aucun — passerait pour juste.
  */
  it('une baie libre se traverse, et ne porte pas de seuil', () => {
    const f = scene(menuiserie('opening')).faces;
    expect(pointilles(f).length).toBeGreaterThan(0);
    expect(seuils(f)).toHaveLength(0);
  });

  it('une fenetre garde son vitrage : ni percement ouvert, ni seuil', () => {
    const f = scene(menuiserie('window')).faces;
    expect(seuils(f)).toHaveLength(0);
    expect(pointilles(f)).toHaveLength(0);
  });
});
