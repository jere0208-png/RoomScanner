/**
 * L'APPARTEMENT D'EXEMPLE — ce qu'on ouvre depuis l'accueil avant d'avoir
 * relevé quoi que ce soit.
 *
 * Relevé du patron : « une vraie identité, plus qu'un logo et trois
 * boutons ; les projets directement visibles sur la page ». Pour qui vient
 * d'installer l'application, il n'y a pas encore de projet : l'accueil le
 * plus soigné du monde lui montre alors une liste vide. Un plan d'exemple
 * comble ce vide par la chose même que l'application fabrique — on le
 * tourne en 3D, on s'y promène, on regarde ce qu'il faut acheter, et l'on
 * comprend en trente secondes ce qu'un scan donnera chez soi.
 *
 * Un T2 de 48 m² comme il y en a partout : séjour avec cuisine ouverte,
 * chambre, salle d'eau, entrée et un petit bureau. Meublé avec le catalogue
 * de l'application, chaque meuble posé contre la FACE de son mur — l'axe
 * moins une demi-épaisseur —, comme le ferait le doigt.
 */
import type { ObjectData } from 'react-native-room-scan';
import { CATALOGUE, catalogTransform, type CatalogItem } from '../geometry/catalogue';
import { pointInPolygon } from '../geometry/appearance';
import {
  WALL_T,
  detectRooms,
  mergeColinear,
  roomParts,
  splitAtJunctions,
  weldCorners,
  type WallSeg,
} from '../geometry/floorplan';
import type { RoomKind } from '../geometry/furniture';

/** Le nom que porte le plan d'exemple — et qui le distingue d'un vrai. */
export const NOM_EXEMPLE = 'Appartement exemple';

const H = 2.5;
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: H,
  yCenter: H / 2,
});

/*
  L'ENVELOPPE ET SES REFENDS, comme RoomPlan les livre : de longs murs
  continus, coupés aux jonctions ensuite (`splitAtJunctions`).

    x →  0          2,6         5            8
   z 0   ┌──────────────────────┬────────────┐
         │   Séjour – cuisine   │  Chambre   │
   3,6   │                      ├────────────┤
   4,2   ├──────────┬───────────┤ Salle d'eau│
         │  Bureau  │  Entrée   │            │
   6     └──────────┴───────────┴────────────┘
*/
const BRUTS: WallSeg[] = [
  mur('nord', 0, 0, 8, 0),
  mur('est', 8, 0, 8, 6),
  mur('sud', 8, 6, 0, 6),
  mur('ouest', 0, 6, 0, 0),
  mur('refend', 5, 0, 5, 6),
  mur('sejour-sud', 0, 4.2, 5, 4.2),
  mur('bureau-est', 2.6, 4.2, 2.6, 6),
  mur('chambre-sud', 5, 3.6, 8, 3.6),
];

const WALLS = mergeColinear(splitAtJunctions(weldCorners(BRUTS)));

/** Une menuiserie posée sur le trait d'un mur. */
const baie = (
  id: string,
  type: 'door' | 'window' | 'opening',
  ax: number,
  az: number,
  bx: number,
  bz: number,
  hauteur: number,
  allege = 0,
  open?: boolean,
): WallSeg => ({
  id,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: hauteur,
  yCenter: allege + hauteur / 2,
  ...(open ? { open } : {}),
});

const OPENINGS: WallSeg[] = [
  // La porte palière, dans l'entrée.
  baie('porte-entree', 'door', 3.3, 6, 4.23, 6, 2.04),
  // L'entrée s'ouvre sur le séjour par un passage sans porte.
  baie('passage', 'opening', 3.2, 4.2, 4.6, 4.2, 2.1, 0, true),
  baie('porte-bureau', 'door', 2.6, 4.7, 2.6, 5.53, 2.04),
  baie('porte-chambre', 'door', 5, 2.5, 5, 3.33, 2.04),
  baie('porte-sde', 'door', 5, 4.6, 5, 5.33, 2.04),
  // La lumière : deux fenêtres au séjour, une à la chambre, une au bureau,
  // et le petit châssis haut de la salle d'eau.
  baie('fenetre-sejour', 'window', 0.8, 0, 2.2, 0, 1.35, 0.95),
  baie('porte-fenetre', 'window', 3.1, 0, 4.5, 0, 2.15, 0),
  baie('fenetre-chambre', 'window', 6, 0, 7.2, 0, 1.15, 0.95),
  baie('fenetre-bureau', 'window', 0, 4.6, 0, 5.6, 1.15, 0.95),
  baie('fenetre-sde', 'window', 8, 4.5, 8, 5.1, 0.6, 1.5),
];

/** Le nom et la nature de chaque pièce, retrouvée par un point qui y est. */
const PIECES: { nom: string; kind?: RoomKind; ici: { x: number; z: number } }[] = [
  { nom: 'Séjour', kind: 'living', ici: { x: 2.5, z: 2 } },
  { nom: 'Chambre', kind: 'bedroom', ici: { x: 6.5, z: 1.8 } },
  { nom: 'Salle d’eau', kind: 'bathroom', ici: { x: 6.5, z: 4.8 } },
  { nom: 'Bureau', ici: { x: 1.3, z: 5.1 } },
  { nom: 'Entrée', ici: { x: 3.8, z: 5.1 } },
];

const ITEMS = new Map<string, CatalogItem>(
  CATALOGUE.flatMap((f) => f.items).map((i) => [i.key, i]),
);

/** Le nu d'un mur : son axe, moins une demi-épaisseur. Les meubles posés
 *  contre lui gardent un centimètre de jeu, comme au rangement du doigt. */
const NU = WALL_T / 2;

/**
 * Un meuble du catalogue, posé en (x, z), tourné de `quarts` quarts de tour.
 * Tourné, il échange largeur et profondeur à l'écran — on le pose donc en
 * pensant à son emprise réelle.
 */
const meuble = (key: string, x: number, z: number, quarts = 0): ObjectData => {
  const item = ITEMS.get(key);
  if (!item) throw new Error(`Meuble inconnu du catalogue : ${key}`);
  const t = catalogTransform(item, x, z, 0);
  const yaw = (Math.PI / 2) * quarts;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  t[0] = cos;
  t[2] = sin;
  t[8] = -sin;
  t[10] = cos;
  return {
    id: `exemple-${key}-${Math.round(x * 100)}-${Math.round(z * 100)}`,
    category: item.category,
    width: item.w,
    depth: item.d,
    height: item.h,
    transform: t,
    modele: item.key,
    matiere: item.matiere,
  };
};

/*
  CHAQUE MEUBLE FAIT FACE À LA PIÈCE — relevé du patron : « le placement des
  meubles n'est pas cohérent : le canapé et la table devant une porte, un
  siège pas face au bureau mais tourné sur le côté ».

  L'avant d'un meuble est son côté −z (voir `furniture3d`, `modeles3d`) ; un
  quart de tour le tourne vers l'est, deux vers le sud, trois vers l'ouest.
  Les fronts de cuisine, le canapé, la tête de lit, les chevets, la
  bibliothèque, la vasque et la moitié des chaises regardaient LE MUR : les
  caisses ne le montraient pas, les vrais modèles si. Et le coin salon bouchait
  la porte de la chambre, le fauteuil le passage vers l'entrée.
*/
const OBJECTS: ObjectData[] = [
  // Séjour — la cuisine ouverte le long du mur nord, façades vers la pièce.
  // Deux millimètres de jeu au mur : retourné d'un demi-tour, un meuble posé
  // pile au nu le « mordrait » d'une erreur d'arrondi.
  meuble('frigo', 0.07 + NU + 0.3, NU + 0.332, 2),
  meuble('meubleBas120', 1.38, NU + 0.302, 2),
  meuble('plaque', 2.28, NU + 0.262, 2),
  // La table, ses quatre chaises tournées vers elle.
  meuble('tableRepas', 1.3, 2.1),
  meuble('chaise', 0.85, 1.4, 2),
  meuble('chaise', 1.75, 1.4, 2),
  meuble('chaise', 0.85, 2.8),
  meuble('chaise', 1.75, 2.8),
  // Le coin salon, dos au refend — ENTRE la porte-fenêtre et la porte de la
  // chambre, sans boucher ni l'une ni l'autre.
  meuble('tapis', 3.75, 1.5, 1),
  meuble('canape2', 5 - NU - 0.44, 1.5, 3),
  meuble('tableBasse', 3.45, 1.5, 1),
  // Le fauteuil face au canapé, de l'autre côté de la table basse ; le
  // passage vers l'entrée reste libre derrière lui.
  meuble('fauteuil', 3.75, 2.95),
  meuble('plante', 2.95, NU + 0.3),
  // Chambre — le lit, tête au mur est, entre ses deux chevets.
  meuble('lit140', 8 - NU - 0.995, 1.8, 3),
  meuble('chevet', 8 - NU - 0.175, 0.82, 3),
  meuble('chevet', 8 - NU - 0.175, 2.78, 3),
  meuble('armoire2p', 5 + NU + 0.29, 0.75, 1),
  // Salle d'eau — la douche dans l'angle, ouverte vers la pièce.
  meuble('douche', 8 - NU - 0.46, 3.6 + NU + 0.46, 3),
  meuble('meubleVasque', 6.15, 3.6 + NU + 0.26, 2),
  meuble('wc', 7.45, 6 - NU - 0.35),
  meuble('ll', 6.3, 6 - NU - 0.3),
  // Bureau, sous la fenêtre ouest — et le fauteuil face à lui.
  meuble('bureau', NU + 0.31, 5.1, 1),
  meuble('fauteuilBureau', 0.95, 5.1, 3),
  meuble('biblio', 1.75, 4.2 + NU + 0.14, 2),
  // Entrée.
  meuble('plante', 4.62, 5.55),
];

/** Tout ce qu'il faut pour ouvrir l'exemple comme on ouvre un relevé. */
export function appartementExemple() {
  const detectees = detectRooms(WALLS);
  const parts = roomParts(
    WALLS,
    detectees.map((r, i) => ({ id: `exemple-piece-${i + 1}`, wallIds: r.wallIds })),
  );
  const rooms = parts.map((p, i) => {
    const pts = p.surface?.pts ?? [];
    const qui = PIECES.find((x) => pointInPolygon(x.ici, pts));
    return {
      id: p.roomId,
      name: qui?.nom ?? `Pièce ${i + 1}`,
      wallIds: detectees[i].wallIds,
      ...(qui?.kind ? { kind: qui.kind } : {}),
    };
  });
  // Chaque meuble retient sa pièce, comme à la pose au doigt.
  const objects = OBJECTS.map((o) => {
    const ici = { x: o.transform[12], z: o.transform[14] };
    const part = parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? []));
    return { ...o, roomId: part?.roomId };
  });
  return { walls: WALLS, openings: OPENINGS, rooms, objects };
}
