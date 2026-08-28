import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
  Polygon,
} from 'react-native-svg';

/*
  UN CERCLE ANIMABLE : le halo d'une lampe respire, et une valeur animée ne
  se pose pas sur une balise SVG ordinaire.
*/
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { RoomScanCanvas } from 'react-native-room-scan';
import { grouperTraces } from '../ui/traces';
import { mettreAPlat } from '../ui/canevas';
import { estUnGlissement, estUnTap } from '../ui/geste';
import { themedStyles, useTheme, type Palette } from '../theme';
import {
  filtrerAuNiveau,
  pointOnSeg,
  roomOf,
  segLength,
  wallQuads,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';

/** Milieu d'une ouverture, au sol. */
const midOf = (o: WallSeg): Pt => ({
  x: (o.a.x + o.b.x) / 2,
  z: (o.a.z + o.b.z) / 2,
});
import { dotStep, inkOn, mixHex, pointsDuSol } from '../geometry/appearance';
import {
  faceDepth,
  buildScene,
  ajusterBlocs,
  masquesDeScene,
  coupeDevant,
  cutawayOpacity,
  dosTourne,
  povProjector,
  visibleAvecLeMur,
  type PovCamera,
  isHiddenFace,
  sceneFraming,
  shadeFill,
  roomRanks,
  type P3,
  type Scene,
  type ScenePalette,
} from '../geometry/scene3d';
import { hiddenByBox } from '../geometry/furniture';
import {
  VOLUME2_DEBORD,
  volumeAt,
  volumeVerdict,
  wetZones,
  type WetZone,
} from '../geometry/volumes';
import { MAQUETTE } from '../ui/maquette';
import { parImage } from '../ui/parImage';
import { haptic } from '../ui/haptic';
import { floorsOf, useScanStore } from '../store/scanStore';
import { CardinalRing } from './CardinalRing';
import {
  FIXTURES,
  assemblyTag,
  faceX,
  facePoint,
  postsOf,
  wallFace,
  type FixtureKind,
} from '../geometry/electrical';
import type { Circuit } from '../geometry/nfc15100';
import { circuitColor } from '../geometry/schema';

/** Paramètres de caméra de la vue 3D (contrôlables de l'extérieur). */
export interface View3DParams {
  theta: number;
  tilt: number;
  zoom: number;
  ox: number;
  oy: number;
}

export const DEFAULT_VIEW3D: View3DParams = {
  theta: -32,
  tilt: 58,
  zoom: 1,
  ox: 0,
  oy: 0,
};

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * DE COMBIEN DE DEGRÉS ON PEUT SE PASSER D'UN NOUVEAU CLASSEMENT.
 *
 * Le classement exact — chaque face départagée au pixel, là où elle en
 * recouvre une autre — coûte quelques millisecondes sur un logement meublé,
 * et rien du tout sur une pièce nue. Le seuil était FIXE, à quatre degrés,
 * réglé pour le pire cas : une pièce vide payait donc le prix d'un T5
 * meublé, et laissait passer des percées qu'elle aurait pu s'épargner.
 *
 * Mesure au banc `percemur`, sur deux pièces meublées, en comptant les
 * angles où un meuble traverse un mur pendant la rotation :
 *
 *     ordre frais 0 · 1° 0 · 2° 3 · 3° 3 · 4° 6 · 6° 9 · 8° 13
 *
 * À un degré, il n'y a plus rien à voir. Le seuil suit donc ce que le
 * classement a COÛTÉ la dernière fois : un degré tant qu'il reste sous deux
 * millisecondes et demie, quatre au-delà. Personne ne paie pour la scène du
 * voisin.
 */
export function seuilDeReclassement(coutMs: number): number {
  return Math.max(1, Math.min(4, Math.round(coutMs / 2.5)));
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * LA TAILLE DU SIGLE (PC, INT…) SUIT LE ZOOM.
 *
 * Relevé du patron : « même en dézoomé ils sont trop gros — il faut une
 * intelligence de zoom qui augmente la taille des noms avec ». Écrit en 10
 * fixe, « PC » couvrait la moitié d'une chambre vue de loin. La taille est
 * donc une fonction du zoom (pixels par mètre), bornée aux deux bouts :
 * discret de loin sans devenir illisible, et jamais plus gros qu'avant de
 * près — au-delà, c'est la désignation longue qui prend le relais.
 */
/**
 * LA TOLÉRANCE DE LA CIBLE D'UN INTERRUPTEUR, en pixels d'écran.
 *
 * Relevé du patron : « élargis un tout petit peu la zone autour de
 * l'interrupteur pour que le clic soit plus facile ». Vingt-deux points : le
 * doigt d'un adulte en couvre quarante-quatre — c'est le chiffre que la maison
 * emploie déjà pour la CIBLE des appareils sur le plan —, mais un interrupteur
 * a des voisins, et une cible trop large volerait l'appui du mécanisme d'à
 * côté. La moitié du doigt, donc : assez pour rattraper la visée, assez peu
 * pour que deux commandes voisines restent distinctes.
 */
export const RAYON_CIBLE = 22;

/**
 * LA PORTÉE D'UNE LAMPE, EN MÈTRES — et non en pixels.
 *
 * Relevé du patron, capture à l'appui : « un plan 3D dézoomé avec la lumière
 * allumée fait que la lumière devient trop grosse pour le plan ».
 *
 * Les trois cercles du halo avaient des rayons écrits EN PIXELS D'ÉCRAN — 54,
 * 26 et 9 — posés à l'œil sur une maquette vue de près. Dézoomé, un logement
 * entier tient dans cent cinquante pixels : un halo de cinquante-quatre le
 * noie, et l'on ne voit plus qu'une tache jaune. C'est la faute que cette
 * maison connaît sous un autre nom — un réglage nommé par son chiffre, qui ne
 * vaut que pour le cadrage où on l'a posé.
 *
 * ET CE N'EST PAS UNE PORTÉE — c'est une MARQUE. Relevé du patron, après
 * l'avoir vu tourner : « fais moins gros les lumières allumées au clic d'un
 * interrupteur, divise par 2 l'étendue. On veut juste voir que ça allume. »
 *
 * La première version valait un mètre dix : la portée utile d'un point lumineux
 * de plafond sur le sol, ce qu'on voit s'éclairer sous une suspension. Le
 * raisonnement était juste et le résultat trop gros — mesuré sur le rendu réel,
 * soixante-trois points de rayon à zoom 1, et un diamètre qui couvrait 32 % de
 * la largeur du logement dessiné, à TOUS les cadrages puisqu'il suit l'échelle.
 * Une pièce sur trois passait en jaune pour dire qu'une ampoule est allumée.
 *
 * CINQUANTE-CINQ CENTIMÈTRES : ce qu'il faut pour voir qu'une lampe est
 * allumée sans éclairer la pièce. Le halo ne simule rien, il signale — et le
 * nom suit le sens, parce qu'un nom qui dit « portée » sur une marque est un
 * commentaire qui ment. Il reste EN MÈTRES, et se projette avec l'échelle de la
 * maquette : c'est la leçon qui, elle, n'a pas changé.
 */
const HALO_LAMPE = 0.55;
/**
 * ET ELLE EST BORNÉE AUX DEUX BOUTS — dont un qui n'est PAS un nombre de
 * pixels.
 *
 * EN BAS, un plancher absolu : une lampe doit rester visible quand on regarde
 * un logement de très loin, sinon elle s'éteint sans qu'on l'ait éteinte.
 *
 * EN HAUT, une FRACTION DU LOGEMENT PROJETÉ, et c'est là qu'était la vraie
 * faute. Un plafond en pixels ne veut rien dire : soixante-quatre points sont
 * une lampe sur une maquette qui remplit l'écran, et un brouillard sur celle
 * de la capture, où le logement entier tient dans cent cinquante. Ce qui
 * compte n'est pas la taille du halo, c'est SA PART DU DESSIN — une lampe
 * n'éclaire jamais la moitié d'un appartement.
 */
/*
  LES DEUX BORNES SUIVENT LA MÊME DIVISION : borner à trente centièmes du
  logement une marque qui n'en vaut plus que quinze laisserait le halo repasser
  à sa taille d'avant sur les petites pièces, là même où il gênait le plus. Et
  un plancher qui ne bouge pas ferait, de loin, une lampe plus grosse que le
  dessin qui l'entoure.
*/
const HALO_MIN = 4.5;
const HALO_PART = 0.15;

/**
 * LA BAGUE D'UN DÉPART, EN MÈTRES — et pour la même raison que le halo.
 *
 * Elle marque un APPAREIL : sa taille est celle de l'appareil, pas celle d'un
 * écran. Seize centimètres de rayon, soit une plaque simple (8 cm) débordée de
 * ce qu'il faut pour qu'on voie la bague sans qu'elle cache le symbole. Écrite
 * en pixels, elle aurait fait le coup du halo de 54 : juste sur la maquette où
 * on l'a posée, absurde à tout autre cadrage.
 *
 * ET IL N'Y A PAS DE BORNE HAUTE, à la différence du halo. Une portée de
 * lumière peut couvrir une petite pièce entière — d'où sa fraction du
 * logement ; une bague de seize centimètres ne peut couvrir qu'une plaque, à
 * n'importe quel zoom. Seul le plancher est utile : de très loin, on doit
 * encore voir QUELS appareils sont sur le départ.
 */
const BAGUE_DEPART = 0.16;
const BAGUE_MIN = 4;

/** Le centre d'un contour — il sert à faire déborder une zone humide. */
function centreDe(pts: { x: number; z: number }[]) {
  const n = Math.max(1, pts.length);
  return {
    x: pts.reduce((t, p) => t + p.x, 0) / n,
    z: pts.reduce((t, p) => t + p.z, 0) / n,
  };
}

/*
  ET C'EST UN RAYON, PLUS UN POLYGONE.

  Le tap visait autrefois les MURS, et un mur est un quadrilatère : il fallait
  savoir si le doigt tombait dedans (`pointInPoly`, parti avec le recadrage).
  Un interrupteur, lui, n'a pas de forme à l'écran — c'est un point, et l'on
  vise autour. Une distance suffit, et elle a l'avantage de départager
  proprement deux commandes voisines : la plus proche gagne, ce qu'un test
  d'appartenance ne sait pas faire quand deux zones se chevauchent.
*/

export function tailleDuSigle(scale: number): number {
  return Math.max(5.5, Math.min(10, scale * 0.085));
}

interface Props {
  /**
   * LE GABARIT DES VOLUMES DE SALLE D'EAU, posé sur la maquette.
   *
   * La géométrie existait depuis longtemps (`volumes.ts`) et ne servait qu'au
   * contrôle ÉCRIT — une ligne dans la feuille des diagnostics. Personne ne
   * relit une ligne de texte pour une pièce qu'il croit connaître, et un socle
   * en volume 1 se voit au Consuel : il se dépose, se rebouche, se repeint.
   *
   * On le montre donc LÀ OÙ L'ON POSE. Éteint par défaut : un gabarit
   * permanent finirait par masquer la maquette qu'il sert à vérifier.
   */
  showVolumes?: boolean;
  /**
   * L'ŒIL DANS LE LOGEMENT, au lieu de la maquette vue de loin.
   *
   * Quand cette caméra est fournie, la vue passe en PERSPECTIVE : on se tient
   * dans la pièce, à hauteur d'homme, et l'on tourne sur soi-même. Les murs
   * s'écartent, le plafond passe au-dessus. C'est la « visite » du chantier,
   * et ça ne sert qu'à montrer — on ne mesure pas sur une fuyante.
   */
  pov?: PovCamera | null;
  /** Mode contrôlé (aperçu d'export) : état de caméra fourni par le parent. */
  value?: View3DParams;
  onChange?: (v: View3DParams) => void;
  /** Cotes sur les arêtes (arêtes en noir). */
  showMeasures?: boolean;
  /**
   * Les repères électriques : la désignation posée sur chaque appareil, sa
   * hauteur et sa cote au bord.
   *
   * Ils sont indispensables pour poser, et encombrants pour montrer. Une
   * pièce équipée en porte une dizaine ; dès qu'on veut regarder le volume,
   * le lever de plan ou une couleur de mur, ils couvrent la moitié de la
   * scène. Comme tous les autres calques, ils s'éteignent.
   */
  showElecTags?: boolean;
  /** N'afficher qu'une pièce : ses murs, son sol, ses meubles. */
  focusRoomId?: string | null;
  /**
   * N'AFFICHER QU'UN MUR — celui qu'on est en train de présenter.
   *
   * La visite guidée se place face à un mur et annonce ce qui s'y trouve.
   * Les trois autres restaient dans le champ : celui de gauche et celui de
   * droite fuyaient vers l'œil et mangeaient la moitié de l'image, et le
   * client ne savait plus lequel on lui montrait — on lui disait « ce
   * mur-là » devant quatre murs.
   *
   * À la différence de `focusRoomId`, qui écarte les murs AVANT de bâtir la
   * scène, celui-ci filtre à la peinture : un mur soudé à ses voisins tire
   * sa forme de tout le graphe — le retirer des entrées changerait les
   * onglets des coins du mur qu'on garde, et la maçonnerie présentée ne
   * serait plus celle du logement.
   */
  focusWallId?: string | null;
  /** Les points cardinaux autour de la vue, comme sur le plan. */
  showNorth?: boolean;
  /** Le calque du plafond, comme sur le plan 2D. */
  showCeiling?: boolean;
  /**
   * LES GAINES, en volume : le même calque que sur le plan.
   *
   * Sur le plan, un tireté suffit — on lit un tracé. Dans le modèle, on
   * prépare une pose : il faut voir le tube arriver au pied du mur et
   * remonter dans la cloison jusqu'à la boîte.
   */
  cableRoutes?: { id: string; path: Pt[] }[];
  /** Hauteur de l'appareil desservi, pour dessiner la remontée. */
  routeHeights?: Record<string, number>;
  /**
   * Force l'écorché, quel que soit le réglage de l'utilisateur.
   *
   * Pendant la présentation, on ne demande pas au client d'aller cocher
   * « murs pleins » : montrer un mur équipé en gardant opaque la cloison
   * qui se trouve devant, c'est ne rien montrer du tout.
   */
  cutaway?: boolean;
  /**
   * LES COTES DE LA PRÉSENTATION, EN FONDU — de 0 à 1.
   *
   * `null` = le comportement ordinaire (elles suivent le bouton « Cotes »
   * et le zoom). Un nombre = la présentation les pilote : toutes les cotes
   * du mur paraissent ENSEMBLE, en fondu, tiennent le temps qu'on les lise,
   * puis s'effacent.
   *
   * Elles se déroulaient auparavant comme un mètre qu'on tire, chaque filet
   * s'étirant de l'appareil vers le mur. Le geste était joli et il coûtait
   * cher : pendant qu'un filet s'allonge, son nombre n'est pas encore là, et
   * l'œil du client suit le mouvement au lieu de lire la valeur. Un mur
   * équipé porte huit cotes ; huit petits mouvements successifs, c'est du
   * bruit. Un fondu simultané pose le tout d'un coup, et l'on regarde.
   */
  elecCotes?: number | null;
  /**
   * RENDU ALLÉGÉ EN CONTINU — pour ce qui bouge tout seul.
   *
   * Le mode existait déjà, mais seulement pendant un geste : dès que le
   * doigt se lève, le modèle repasse en pans découpés. Une présentation,
   * elle, bouge sans qu'aucun doigt ne la touche : elle se rendait donc
   * toujours en qualité pleine, et un logement meublé — mille faces — ne
   * suivait plus. Vu de loin, en mouvement, la découpe en bandes ne se
   * voit pas ; les saccades, si.
   */
  light?: boolean;
  /**
   * LES PIÈCES À BÂTIR D'AVANCE.
   *
   * La présentation change de pièce à chaque étape, et chaque changement
   * refait le modèle : murs extrudés, mobilier, appareillage. Cent
   * millisecondes de calcul, pile au moment où la caméra part — un à-coup
   * par étape, toujours au même endroit, celui qu'on remarque.
   *
   * Avec cette liste, les modèles sont bâtis pendant le rideau de
   * préparation et rangés : les étapes n'ont plus qu'à les reprendre.
   */
  prebuildRooms?: (string | null)[];
  /**
   * LES DÉPARTS DU TABLEAU — pour que la prise puisse montrer son circuit.
   *
   * Ils viennent de l'écran, ils ne se recalculent PAS ici. `planCircuits`
   * découpe les circuits d'après la pièce de chaque appareil, et cette pièce
   * se déduit du contour au sol : refaire le calcul dans la maquette avec des
   * entrées légèrement différentes donnerait un plan qui dit « C3 » et un
   * modèle qui dit « C2 » pour la même prise. Un seul calcul, celui du
   * dossier, passé de main en main.
   *
   * Absents — la visite guidée, l'aperçu d'export —, l'appareillage ne
   * répond plus au doigt sauf pour allumer : une cible qui ne mène nulle part
   * donne à l'écran l'air d'être en panne.
   */
  circuits?: Circuit[];
}

/**
 * Vue 3D axonométrique du scan, dérivée des mêmes données paramétriques
 * que le plan 2D : murs épais extrudés, portes/fenêtres, meubles.
 * Un doigt : tourner/incliner. Deux doigts : pincer pour zoomer, déplacer.
 */
export function Iso3DView({
  pov,
  value,
  onChange,
  showMeasures,
  showElecTags = true,
  focusRoomId,
  focusWallId,
  showNorth = true,
  showCeiling = true,
  showVolumes = false,
  cableRoutes,
  routeHeights,
  cutaway,
  elecCotes = null,
  light = false,
  prebuildRooms,
  circuits,
}: Props) {
  const tousLesMurs = useScanStore((s) => s.walls);
  const toutesLesOuvertures = useScanStore((s) => s.openings);
  const tousLesMeubles = useScanStore((s) => s.objects);
  const niveauCourant = useScanStore((s) => s.niveauCourant);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const north = useScanStore((s) => s.north);
  const toutLePlafond = useScanStore((s) => s.ceiling);
  const toutesLesPieces = useScanStore((s) => s.rooms);
  const toutLAppareillage = useScanStore((s) => s.fixtures);
  /*
    UN SEUL ÉTAGE À LA FOIS — et en volume, l'enjeu est plus grave qu'en
    plan.

    Les deux niveaux n'ont pas d'altitude propre : un étage se distingue par
    son numéro, pas par une hauteur dans la scène. Rendus ensemble, ils sont
    posés au MÊME niveau du sol — le haut est DANS le bas, murs au travers
    des murs, meubles au travers des meubles. C'est la « construction mal
    faite » du relevé du patron, vue en volume.

    Le filtre est le même que celui du plan et de l'écran des résultats :
    une seule règle, écrite une fois (`filtrerAuNiveau`).
  */
  const {
    walls: tousLesMursDuNiveau,
    openings: toutesLesOuverturesDuNiveau,
    rooms: piecesDuNiveau,
    fixtures: appareillageDuNiveau,
    objects: meublesDuNiveau,
    ceiling,
  } = useMemo(
    () =>
      filtrerAuNiveau(
        {
          walls: tousLesMurs,
          openings: toutesLesOuvertures,
          rooms: toutesLesPieces,
          fixtures: toutLAppareillage,
          photos: [],
          objects: tousLesMeubles,
          ceiling: toutLePlafond,
        },
        niveauCourant,
      ),
    [
      tousLesMurs,
      toutesLesOuvertures,
      toutesLesPieces,
      toutLAppareillage,
      tousLesMeubles,
      toutLePlafond,
      niveauCourant,
    ],
  );
  const walls = tousLesMursDuNiveau;
  const openings = toutesLesOuverturesDuNiveau;
  const objects = useMemo(
    () => (showFurniture ? meublesDuNiveau : []),
    [showFurniture, meublesDuNiveau],
  );
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const solidWallsReglage = useScanStore((s) => s.solidWalls);
  // La présentation impose l'écorché ; ailleurs, c'est le réglage qui décide.
  const solidWalls = cutaway === undefined ? solidWallsReglage : !cutaway;
  const allRooms = piecesDuNiveau;
  // Coupe : on ne garde que la pièce visée, murs et meubles compris.
  const rooms = useMemo(
    () => (focusRoomId ? allRooms.filter((r) => r.id === focusRoomId) : allRooms),
    [allRooms, focusRoomId],
  );
  const keptWalls = useMemo(() => {
    if (!focusRoomId) return walls;
    const ids = new Set(rooms[0]?.wallIds ?? []);
    return walls.filter((w) => ids.has(w.id));
  }, [walls, rooms, focusRoomId]);
  const keptOpenings = useMemo(() => {
    if (!focusRoomId) return openings;
    return openings.filter((o) =>
      keptWalls.some((w) => pointOnSeg(midOf(o), w.a, w.b).dist < 0.6),
    );
  }, [openings, keptWalls, focusRoomId]);
  const keptObjects = useMemo(
    () =>
      focusRoomId ? objects.filter((o) => roomOf(o) === focusRoomId) : objects,
    [objects, focusRoomId],
  );
  // L'appareillage suit son mur : en coupe sur une pièce, les prises des
  // autres pièces s'en vont avec les murs qui les portaient.
  const allFixtures = appareillageDuNiveau;
  const fixtures = useMemo(() => {
    if (!focusRoomId) return allFixtures;
    const ids = new Set(keptWalls.map((w) => w.id));
    return allFixtures.filter((f) => ids.has(f.wallId));
  }, [allFixtures, keptWalls, focusRoomId]);
  const floors = useMemo(() => floorsOf(rooms), [rooms]);
  const roomNames = useMemo(
    () => new Map(rooms.map((r) => [r.id, r.name])),
    [rooms],
  );
  const c = useTheme();
  const styles = getStyles(c);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [inner, setInner] = useState<View3DParams>(DEFAULT_VIEW3D);
  const view = value ?? inner;
  const viewRef = useRef(view);
  const changeRef = useRef<Props['onChange']>(undefined);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  /*
    UN SEUL RENDU PAR IMAGE.

    Le tactile d'un iPhone récent remonte jusqu'à cent vingt fois par
    seconde. Chaque mouvement du doigt reconstruisait la scène entière —
    plusieurs centaines de tracés — alors qu'entre deux images affichées,
    tous les rendus intermédiaires sauf le dernier finissent à la poubelle :
    on calculait deux fois pour montrer une fois. C'est de la chaleur pure,
    et une image de retard.

    `viewRef` reste mis à jour SUR-LE-CHAMP — le geste s'appuie dessus pour
    calculer la suite, il ne peut pas attendre l'écran — et seul l'affichage
    est reporté au battement suivant.
  */
  const rendu = useRef(
    parImage<View3DParams>((v) => {
      if (changeRef.current) changeRef.current(v);
      else setInner(v);
    }),
  ).current;
  useEffect(() => rendu.annuler, [rendu]);

  const update = (v: View3DParams) => {
    viewRef.current = v;
    rendu(v);
  };

  const baseRef = useRef({
    v: DEFAULT_VIEW3D,
    mode: 'rotate' as 'rotate' | 'pinch',
    dx0: 0,
    dy0: 0,
    d0: 1,
    mx0: 0,
    my0: 0,
    a0: 0,
  });

  const touchAngle = (t: { pageX: number; pageY: number }[]) =>
    Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX);
  const tapRef = useRef({ x: 0, y: 0, multi: false, t0: 0 });
  // Pendant un geste, les cotes sont masquées : c'est leur recalcul à
  // chaque frame qui faisait ramer les mouvements.
  const [interacting, setInteracting] = useState(false);
  /**
   * Le classement du dernier calcul : l'angle où il a été fait, la scène à
   * laquelle il appartient, et la profondeur de chaque pan.
   */
  const ordreMemo = useRef<{
    theta: number;
    tilt: number;
    faces: typeof faces;
    d: Map<number, number>;
  } | null>(null);

  // Créé UNE seule fois : un responder recréé en plein geste perd le suivi.
  /**
   * LES LUMIÈRES ALLUMÉES — un état de VISITE, pas du plan.
   *
   * On allume pour essayer l'installation, comme on le ferait sur un chantier
   * fini ; ça ne modifie pas le relevé et ça n'a rien à faire dans le magasin.
   * Fermer la maquette éteint tout, et c'est très bien : un plan ne se souvient
   * pas de quelle lampe on a essayée.
   */
  const [allumees, setAllumees] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  /**
   * LE DÉPART D'UN APPAREIL — index dressé une fois pour toutes.
   *
   * Le rang compte autant que le circuit : c'est lui qui donne le repère du
   * tableau (`C3`) et la teinte de la roue. Les points de PLAFOND sont dans le
   * même index — un circuit d'éclairage porte des appliques au mur et des
   * spots au plafond, et l'on ne va pas montrer la moitié d'un départ.
   */
  const departDe = useMemo(() => {
    const m = new Map<string, { circuit: Circuit; rang: number }>();
    (circuits ?? []).forEach((circuit, rang) => {
      for (const id of circuit.fixtureIds) m.set(id, { circuit, rang });
      for (const id of circuit.ceilingIds ?? []) m.set(id, { circuit, rang });
    });
    return m;
  }, [circuits]);
  /**
   * LE DÉPART QU'ON REGARDE — un état de VISITE, comme les lumières.
   *
   * On en montre UN à la fois, et c'est tout l'intérêt : dix départs entourés
   * de dix couleurs, c'est le plan des gaines, qui existe déjà et qui répond à
   * une autre question. Ici on demande « celle-là, elle est sur quoi ? ».
   *
   * L'ANCRE est l'appareil qu'on a touché. Elle sert à deux choses : poser
   * l'étiquette du départ près du doigt, et savoir quel second appui éteint —
   * retoucher LA MÊME prise referme, toucher une autre prise passe à son
   * départ. Éteindre au toucher d'une sœur serait cohérent et déroutant : on
   * vient de dire à l'écran « celles-là m'intéressent ».
   */
  const [departMontre, setDepartMontre] = useState<{
    circuit: string;
    ancre: string;
  } | null>(null);
  /**
   * LE SCINTILLEMENT — une seule boucle pour toutes les lampes.
   *
   * Relevé du patron : « on doit voir les lumières scintiller ». Une animation
   * par lampe ferait tourner autant de boucles qu'il y a de points lumineux, et
   * cette vue se bat déjà pour ses images. Une seule valeur, partagée : les
   * lampes d'un logement battent ensemble, ce qui est d'ailleurs plus juste —
   * elles sont sur le même réseau.
   *
   * ET C'EST UN SOUFFLE, PAS UN CLIGNOTEMENT. Entre soixante-dix et cent
   * centièmes d'opacité : une lampe qui s'éteint à moitié se lit comme une
   * panne. Deux secondes et demie l'aller-retour — le rythme d'une respiration,
   * celui du halo de la pastille de contrôle.
   */
  const battement = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (allumees.size === 0) return;
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(battement, {
          toValue: 1,
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(battement, {
          toValue: 0,
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [allumees.size, battement]);
  const scintille = battement.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.5],
  });
  const halo2 = battement.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.8],
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => estUnGlissement(g.dx, g.dy),
      onPanResponderGrant: (e, g) => {
        const t = e.nativeEvent.touches;
        setInteracting(true);
        tapRef.current = {
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
          multi: t.length >= 2,
          t0: Date.now(),
        };
        baseRef.current = {
          v: viewRef.current,
          mode: t.length >= 2 ? 'pinch' : 'rotate',
          dx0: g.dx,
          dy0: g.dy,
          d0:
            t.length >= 2
              ? Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY))
              : 1,
          mx0: t.length >= 2 ? (t[0].pageX + t[1].pageX) / 2 : 0,
          my0: t.length >= 2 ? (t[0].pageY + t[1].pageY) / 2 : 0,
          a0: t.length >= 2 ? touchAngle(t) : 0,
        };
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        const mode = t.length >= 2 ? 'pinch' : 'rotate';
        // Un second doigt, meme une fraction de seconde, ote au geste tout
        // droit a etre lu comme un tap au relachement.
        if (t.length >= 2) tapRef.current.multi = true;
        if (mode !== baseRef.current.mode) {
          // Le nombre de doigts a changé en plein geste : on repart d'ici.
          baseRef.current = {
            v: viewRef.current,
            mode,
            dx0: g.dx,
            dy0: g.dy,
            d0:
              t.length >= 2
                ? Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY))
                : 1,
            mx0: t.length >= 2 ? (t[0].pageX + t[1].pageX) / 2 : 0,
            my0: t.length >= 2 ? (t[0].pageY + t[1].pageY) / 2 : 0,
            a0: t.length >= 2 ? touchAngle(t) : 0,
          };
        }
        const base = baseRef.current;
        if (mode === 'pinch' && t.length >= 2) {
          const d = Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY));
          const mx = (t[0].pageX + t[1].pageX) / 2;
          const my = (t[0].pageY + t[1].pageY) / 2;
          // Torsion des deux doigts : le modèle pivote en suivant les doigts.
          let twist = ((touchAngle(t) - base.a0) * 180) / Math.PI;
          twist = ((twist + 540) % 360) - 180;
          update({
            theta: base.v.theta + twist,
            tilt: base.v.tilt,
            zoom: clamp(base.v.zoom * (d / base.d0), 0.4, 4),
            ox: base.v.ox + (mx - base.mx0),
            oy: base.v.oy + (my - base.my0),
          });
        } else {
          const ddx = g.dx - base.dx0;
          const ddy = g.dy - base.dy0;
          update({
            ...base.v,
            // Glisser à droite « pousse » la face avant vers la droite.
            theta: base.v.theta - ddx * 0.45,
            tilt: clamp(base.v.tilt - ddy * 0.3, 15, 80),
          });
        }
      },
      onPanResponderRelease: (_e, g) => {
        setInteracting(false);
        // Tap simple (sans glisser) : cadrer la vue sur le mur touché.
        //
        // « Sans glisser » ne suffisait pas : un pincement court laisse un
        // `dx` de centroïde minuscule, donc la vue se recadrait toute seule
        // au relâchement, comme si on avait tapé un mur. Un geste à deux
        // doigts n'est JAMAIS un tap — on s'en souvient pour toute la durée
        // du geste —, et un tap ne dure pas une seconde.
        const geste = tapRef.current;
        if (
          !geste.multi &&
          baseRef.current.mode === 'rotate' &&
          estUnTap(g.dx, g.dy) &&
          Date.now() - geste.t0 < 500
        ) {
          basculerRef.current?.(geste.x, geste.y);
        }
      },
      onPanResponderTerminate: () => setInteracting(false),
    }),
  ).current;

  /*
    LA PALETTE DE LA MAQUETTE — relevé du patron, image de référence à
    l'appui : « j'aimerais que le rendu d'un plan 3D soit tel quel, fais en
    sorte d'avoir le même réalisme en optimisant la fluidité ».

    Elle vient des neutres du thème : bleu-gris, traits foncés — la palette
    d'un écran technique. L'image montre une maquette de présentation :
    crème, sable, blanc cassé, une touche d'ambre sur ce qui se pose. Tout
    le gain est là, et il ne coûte pas un nœud de plus (voir
    `src/ui/maquette.ts`).

    Les menuiseries gardent les teintes du THÈME : elles ne décorent pas,
    elles désignent, et elles doivent rester les mêmes que sur le plan 2D.
  */
  const palette: ScenePalette = useMemo(
    () => ({
      ...MAQUETTE,
      door: c.amber,
      window: c.sky,
      passage: c.blue,
    }),
    [c],
  );

  /**
   * LE MODÈLE DÉJÀ BÂTI SE RETROUVE, il ne se refait pas.
   *
   * Une pièce revue — la présentation qui repasse, un aller-retour entre
   * deux étapes — coûtait un modèle entier à chaque fois. On les range
   * par pièce, et on les jette dès que le plan bouge : le magasin est
   * remis à zéro par la même dépendance qui rebattrait les cartes.
   */
  const magasin = useRef(new Map<string, Scene>());
  /**
   * Le vidage saute le PREMIER passage.
   *
   * Un effet se joue après le rendu : au montage, il jetait le modèle que
   * ce rendu venait de bâtir, et le préchargement le refaisait derrière.
   * Trois constructions là où deux suffisent — c'est l'épreuve qui les a
   * comptées.
   */
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    magasin.current.clear();
  }, [
    walls,
    openings,
    objects,
    allFixtures,
    ceiling,
    palette,
    showSurfaces,
    showTextures,
    colorOpenings,
    showCeiling,
    cableRoutes,
    routeHeights,
    light,
  ]);

  /** Les entrées d'une pièce : le même filtrage que pour la pièce montrée. */
  const entreesDe = useCallback(
    (focus: string | null) => {
      const rs = focus ? allRooms.filter((r) => r.id === focus) : allRooms;
      const ids = new Set(rs[0]?.wallIds ?? []);
      const ws = focus ? walls.filter((w) => ids.has(w.id)) : walls;
      const os = focus
        ? openings.filter((o) =>
            ws.some((w) => pointOnSeg(midOf(o), w.a, w.b).dist < 0.6),
          )
        : openings;
      const murs = new Set(ws.map((w) => w.id));
      return {
        rooms: rs,
        walls: ws,
        openings: os,
        objects: focus ? objects.filter((o) => roomOf(o) === focus) : objects,
        fixtures: focus
          ? allFixtures.filter((f) => murs.has(f.wallId))
          : allFixtures,
      };
    },
    [allRooms, walls, openings, objects, allFixtures],
  );

  /** Bâtir la scène d'une pièce, ou la reprendre au magasin. */
  const batir = useCallback(
    (focus: string | null): Scene => {
      const cle = focus ?? '—';
      const deja = magasin.current.get(cle);
      if (deja) return deja;
      const e = entreesDe(focus);
      const faite = buildScene(e.walls, e.openings, e.objects, {
        palette,
        colorOpenings,
        showSurfaces,
        showTextures,
        floors: floorsOf(e.rooms),
        rooms: e.rooms,
        fixtures: e.fixtures,
        ceiling: showCeiling ? ceiling : [],
        routes: cableRoutes,
        routeHeights,
        coarse: true,
      });
      magasin.current.set(cle, faite);
      return faite;
    },
    [
      entreesDe,
      palette,
      colorOpenings,
      showSurfaces,
      showTextures,
      ceiling,
      showCeiling,
      cableRoutes,
      routeHeights,
    ],
  );

  /**
   * On bâtit d'avance, une fois, ce que la présentation va montrer.
   *
   * Le calcul est lourd et volontairement SYNCHRONE : il tombe derrière le
   * rideau de préparation, là où il ne se voit pas. Le geler ailleurs
   * serait impardonnable ; ici, c'est exactement le moment prévu pour ça.
   */
  useEffect(() => {
    if (!prebuildRooms || prebuildRooms.length === 0) return;
    for (const id of prebuildRooms) batir(id);
  }, [prebuildRooms, batir]);

  // Scène partagée avec le PDF : mêmes onglets, mêmes bandes, mêmes couleurs.
  const scene = useMemo(
    () =>
      light
        ? batir(focusRoomId ?? null)
        : buildScene(keptWalls, keptOpenings, keptObjects, {
            palette,
            colorOpenings,
            showSurfaces,
            showTextures,
            floors,
            rooms,
            fixtures,
            // Le plafond suit son propre calque, comme sur le plan :
            // superposé au mobilier, il ne se lit plus.
            ceiling: showCeiling ? ceiling : [],
            routes: cableRoutes,
            routeHeights,
            /*
              LES MURS GARDENT LEURS BANDES, MÊME EN PLEIN GESTE.

              Relevé du chantier, capture à l'appui : « il y a des modèles 3D
              qui se font superposer par des murs lorsqu'on reste appuyé pour
              tourner ». Le meuble disparaît derrière un mur qui est pourtant
              derrière lui, et il revient dès qu'on lâche le doigt.

              La scène se bâtissait alors en mode GROSSIER — chaque mur d'un
              seul tenant au lieu d'être découpé en bandes de soixante
              centimètres — pour alléger le rendu. Or c'est le découpage qui
              permet au tri du peintre de départager un mur long d'un objet
              posé devant lui : d'un seul tenant, le mur ne porte plus qu'UNE
              profondeur, celle de son centre, et il passe devant ou derrière
              EN BLOC. Un meuble placé devant sa moitié proche se retrouve
              classé derrière tout le mur.

              Le mode grossier disparaît donc, et avec lui deux dépenses
              qu'on ne voyait pas : la scène entière était RECONSTRUITE au
              premier contact du doigt, puis une seconde fois au lâcher —
              deux fois le calcul le plus lourd de la vue, à chaque geste.
              Ce qu'on croyait économiser en pans, on le payait en
              reconstructions. Le geste reste allégé là où c'est sans
              conséquence : cotes, étiquettes et surfaces se taisent tant que
              le doigt est posé.
            */
          }),
    [
      keptWalls,
      keptOpenings,
      keptObjects,
      light,
      cableRoutes,
      routeHeights,
      palette,
      colorOpenings,
      showSurfaces,
      showTextures,
      floors,
      rooms,
      ceiling,
      showCeiling,
      fixtures,
      batir,
      focusRoomId,
    ],
  );
  const faces = scene.faces;

  // Centre pris sur la BOÎTE ENGLOBANTE, jamais sur la moyenne des points :
  // la moyenne dépend de la finesse du découpage. La scène ne change plus de
  // finesse en cours de geste, mais la règle reste la bonne — un centre qui
  // dépend du nombre de points est un centre qui bouge pour rien.
  const { center, radius3d } = useMemo(() => sceneFraming(faces), [faces]);

  /**
   * Quel pan masque quel meuble : la part qui ne dépend pas de l'angle.
   * Recalculée seulement quand la scène change, jamais quand on tourne.
   */
  const masquesScene = useMemo(() => masquesDeScene(faces), [faces]);

  /**
   * Ce qu'a coûté le dernier classement exact, en millisecondes. Il décide
   * de la fréquence du suivant : voir `seuilDeReclassement`.
   */
  const coutTri = useRef(10);

  /*
    LE RENDU COURANT, LU PAR LE GESTE.

    Une valeur lue dans un `PanResponder` est FIGÉE au premier rendu — la
    leçon que cette maison a payée plusieurs fois. Le geste passe donc par une
    référence, remise à jour à chaque rendu.
  */
  const renduRef = useRef<{
    ciblesInter: {
      id: string;
      cx: number;
      cy: number;
      lampes: string[];
      departs: string[];
    }[];
  } | null>(null);

  const rendered = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    const ct = Math.cos(rad(view.theta));
    const st = Math.sin(rad(view.theta));
    const cp = Math.cos(rad(view.tilt));
    const sp = Math.sin(rad(view.tilt));
    const scale = ((Math.min(layout.w, layout.h) * 0.44) / radius3d) * view.zoom;

    /*
      DEUX PROJECTIONS, UN SEUL RESTE.

      En perspective, l'œil est DANS la pièce : les fuyantes convergent, et
      c'est la position de l'œil — non plus une direction unique — qui dit
      quelles faces nous montrent leur dos. Tout le reste du rendu ne
      s'aperçoit de rien : mêmes faces, même tri du plus lointain au plus
      proche, mêmes couleurs.
    */
    const perspective = pov ? povProjector(pov, layout) : null;
    const project = perspective
      ? (p: P3) => perspective(p)
      : (p: P3) => {
      const x = p.x - center.x;
      const y = p.y - center.y;
      const z = p.z - center.z;
      const rx = x * ct - z * st;
      const rz = x * st + z * ct;
      return {
        sx: layout.w / 2 + view.ox + rx * scale,
        sy: layout.h / 2 + view.oy + (rz * cp - y * sp) * scale,
        depth: rz * sp + y * cp,
      };
    };

    // Faces de volume qui tournent le dos à la caméra : jetées avant même
    // d'être projetées. Un mur ne peut donc plus montrer ses deux faces à la
    // fois, et aucun tri en profondeur n'a à les départager.
    const cam = { ct, st, cp, sp };
    // Le rang des pièces pour CETTE caméra : de la plus lointaine à la plus
    // proche. C'est lui qui empêche le mobilier de la pièce voisine de se
    // voir au travers de la cloison mitoyenne.
    const rangs = roomRanks(scene.rooms, cam);
    /**
     * LES MEUBLES QU'UN PAN MASQUE, POUR CETTE CAMÉRA.
     *
     * La liste, elle, ne dépend pas de l'angle (`masquesDeScene`) : reste à
     * savoir si le plan nous fait face. C'est le même produit scalaire que
     * l'écorché — la direction de l'œil, en projection orthographique, est
     * (st·sp, cp, ct·sp).
     *
     * En vue subjective, l'œil est DANS la pièce et cette direction unique
     * n'existe plus : la règle ne s'applique pas, et le pixel reprend la
     * main comme avant.
     */
    const masqueDe = (panId?: number) => {
      if (pov || panId === undefined) return undefined;
      const m = masquesScene.get(panId);
      if (!m) return undefined;
      const vers = m.n.x * st * sp + m.n.y * cp + m.n.z * ct * sp;
      return vers > 0 ? m.cache : undefined;
    };
    const polys = faces
      .filter((face) =>
        pov ? !dosTourne(face, pov.at) && !face.isFloor : !isHiddenFace(face, cam),
      )
      /*
        UN MUR PRÉSENTÉ, C'EST LUI SEUL.

        On ne retire QUE ce qui appartient à un autre mur : sa maçonnerie,
        ses menuiseries, l'appareillage qui y est plaqué. Le sol, le
        mobilier et le plafond restent — ils situent la pièce, et une pièce
        vide autour d'un pan de mur ne se comprend plus.

        Le filtre est posé APRÈS le cadrage : la vue garde le centre et
        l'échelle du logement entier, sinon le modèle sauterait à chaque
        mur présenté.
      */
      .filter((face) => visibleAvecLeMur(face, focusWallId))
      .map((face) => {
      // De l'intérieur, une face peut être à cheval sur le plan de l'œil :
      // on la taille avant de la projeter, sinon elle se retourne et barre
      // l'écran.
      // La coupe vaut pour les arêtes autant que pour les pans : un trait
      // qui traverse le plan de l'œil barre l'écran en diagonale.
      const pts = pov ? coupeDevant(face.pts, pov) : face.pts;
      const proj = pts.map(project);
      // Une arête se trie avec le pan qu'elle borde (`depthAt`), pas sur sa
      // propre position : sinon l'arête basse d'un mur passe avant lui et le
      // pan la repeint — c'est ce qui effaçait le silhouettage.
      // Le rang de la pièce entre dans le tri : deux pièces ne se
      // traversent pas, et leurs contenus se peignent l'un après l'autre.
      const depth = pov
        ? // En perspective, la profondeur est la distance à l'œil : ni rang
          // de pièce ni couche — on est dedans, il n'y a plus de « dehors ».
          proj.reduce((t, q) => t + q.depth, 0) / Math.max(1, proj.length)
        : faceDepth(face, project, cam, rangs);

      // Lumière liée à la caméra : les pans face à nous sont clairs, ceux de
      // profil s'assombrissent — le volume se lit immédiatement.
      /*
        LA LUMIÈRE SUIT LE REGARD, même quand l'œil est dans la pièce.

        L'ombrage se calcule par rapport à l'axe de la vue. En perspective,
        cet axe n'est plus celui de la maquette mais celui de la tête : sans
        ça, tous les murs reçoivent la même teinte et l'on se retrouve devant
        un aplat blanc, sans un angle pour dire où s'arrête la pièce.
      */
      const fill =
        (pov
          ? shadeFill(face, Math.cos(pov.yaw), Math.sin(pov.yaw))
          : shadeFill(face, ct, st)) ?? 'none';
      // Écorché : un mur qui nous fait face s'efface pour laisser voir la
      // pièce. Il garde son arête, donc sa présence.
      const voile =
        !solidWalls && face.cutaway && face.normal
          ? // Et ce qu'il masque décide de son voile : un mur vu de champ
            // qui coupe un meuble ne reste pas plein (voir `cutawayOpacity`).
            cutawayOpacity(face.normal, cam, masquesScene.get(face.panId ?? -1)?.cache)
          : 1;

      // Mode cotes : toutes les arêtes en noir.
      // Un pan sans contour propre est bordé de SA PROPRE couleur : sans ça,
      // l'anticrénelage laisse une couture blanche entre deux bandes voisines
      // et le mur paraît fait de morceaux.
      // Mode cotes : arêtes en noir — SAUF les passages, dont le bleu
      // pointillé est justement ce qui les distingue d'un panneau.
      const stroke =
        showMeasures && !face.isFloor && !face.dashed && face.stroke
          ? '#0B0D12'
          : face.stroke ?? fill;
      return {
        proj,
        depth,
        fill,
        stroke,
        voile,
        dashed: !!face.dashed,
        owner: face.ownerId,
        room: face.roomId,
        // Le pan, et l'arête qui le borde : elles voyagent ensemble dans
        // l'ordre de peinture (voir `ajusterBlocs`).
        pan: face.panId,
        bord: face.bordDe,
        /*
          ET LE PAN DIT LES MEUBLES QU'IL MASQUE.

          Voir `ajusterBlocs`. La liste ne dépend pas de l'angle (elle est
          calculée une fois par scène) ; ce qui en dépend est la seule
          question posée ici : ce plan nous fait-il face ? Si oui, tout ce
          qu'il masque est derrière lui, et le classement n'a plus à en
          juger.

          La règle vaut dans les deux réglages : murs pleins, le pan cache ;
          en écorché, il se voile — et un voile se peint par-dessus ce qu'il
          voile, sinon il ne voile rien.
        */
        cache: masqueDe(face.panId),
      };
      });
    // Ce que la coupe a entièrement retranché — une face derrière l'œil —
    // n'a plus rien à dessiner.
    const dessinables = pov ? polys.filter((p) => p.proj.length >= 2) : polys;
    /*
      PENDANT UN GESTE, ON GARDE LE CLASSEMENT DU DERNIER REPOS.

      Le classement exact — chaque face départagée à l'écran, là où elle en
      recouvre une autre — coûte une dizaine de millisecondes sur un logement
      meublé : trop pour le refaire trente fois par seconde. On repliait donc
      la scène sur la règle des couches le temps du geste, et cette règle lâche
      justement dans les angles rasants. Le chantier l'a vu deux fois : un mur
      qui passe devant toute la pièce en pleine rotation, et un coussin de
      canapé qui paraît plus bas que son voisin selon l'angle — « tout n'est
      pas comme un vrai modèle 3D, fixe dans toutes les positions ».

      Or une scène qui tourne ne change pas de FORME, seulement d'angle : un
      ordre juste à un angle le reste quelques degrés plus loin. On le
      recalcule donc tous les quatre degrés, et l'on réutilise le précédent
      entre-temps — chaque pan retrouve sa profondeur par son numéro, chaque
      arête suit le sien. Le coût moyen retombe au quart, et le modèle garde
      le classement EXACT dans toutes les positions.
    */
    const memoire = ordreMemo.current;
    /*
      ET DÈS QUE LA VUE SE POSE, L'ORDRE EXACT REVIENT.

      Relevé du patron, capture à l'appui : « les meubles dépassent encore
      parfois des murs selon un angle, comme le meuble intérieur qui dépasse
      sur la photo ». L'économie ci-dessus valait AUSSI AU REPOS : le doigt
      se levait à trois degrés du dernier calcul, et le modèle restait là,
      immobile, avec un ordre de peinture qui n'était pas le sien. Ce que la
      capture montre est une image FIXE — et une image fixe, on la regarde.

      Mesuré au banc (`percemur`), sur deux pièces meublées : l'ordre de
      l'angle courant laisse sept angles fautifs sur cent quatre-vingts,
      celui d'il y a quatre degrés en laisse quatre-vingt-neuf. Treize fois
      plus, pour une économie qui ne sert qu'en mouvement.

      La mémoire ne sert donc plus que là où elle a un sens : sous le doigt,
      et pendant une présentation qui tourne toute seule (`light`). Là,
      l'image suivante arrive dans trente millisecondes et un trait de dos
      qui paraît le temps d'un clignement ne se voit pas.
    */
    const enMouvement = interacting || light;
    const seuil = seuilDeReclassement(coutTri.current);
    const perime =
      !memoire ||
      !enMouvement ||
      Math.abs(view.theta - memoire.theta) > seuil ||
      Math.abs(view.tilt - memoire.tilt) > seuil ||
      memoire.faces !== faces;
    if (perime) {
      const t0 = Date.now();
      ajusterBlocs(dessinables, false);
      // Ce que ce classement vient de coûter décide du prochain seuil.
      coutTri.current = Date.now() - t0;
      const table = new Map<number, number>();
      for (const p of dessinables) {
        if (p.pan !== undefined) table.set(p.pan, p.depth);
      }
      ordreMemo.current = {
        theta: view.theta,
        tilt: view.tilt,
        faces,
        d: table,
      };
    } else {
      for (const p of dessinables) {
        const d = p.pan !== undefined ? memoire!.d.get(p.pan) : undefined;
        if (d !== undefined) p.depth = d;
        else if (p.bord !== undefined) {
          const dp = memoire!.d.get(p.bord);
          if (dp !== undefined) p.depth = dp + 1e-6;
        }
      }
    }

    // Cotes insérées DANS le tri de profondeur : un mur proche recouvre
    // les cotes des éléments situés derrière lui (fini les fuites).
    type Item =
      | {
          kind: 'poly';
          /** Le meuble dont ce pan fait partie, s'il en vient d'un. */
          owner?: string;
          depth: number;
          proj: typeof polys[0]['proj'];
          fill: string;
          stroke: string;
          /** Écorché : 1 = plein, 0,15 = mur effacé pour voir la pièce. */
          voile: number;
          dashed: boolean;
        }
      | { kind: 'dot'; depth: number; x: number; y: number; color: string }
      | {
          kind: 'elec';
          /** Bout de la ligne de cote vers le bord du mur. */
          /** Avancement du tracé des cotes, de 0 à 1. */
          fondu?: number;
          bx?: number;
          by?: number;
          /** Bout de la ligne de cote vers le sol. */
          sx?: number;
          sy?: number;
          /** Désignation courte, posée au-dessus de l'appareil. */
          nom?: string;
          /** Sa taille : elle grandit avec le zoom. */
          nomTaille?: number;
          depth: number;
          x: number;
          y: number;
          color: string;
          sigle?: string;
          /** Sa taille : elle suit le zoom, comme la désignation longue. */
          sigleTaille?: number;
          /** Opacité du point de repère : 1 de loin, 0 dès qu'on voit la plaque. */
          pastille: number;
          /** Cotes lues sur la face, affichées une fois zoomé dessus. */
          haut?: string;
          bord?: string;
          /**
           * Un meuble le cache.
           *
           * De loin, on n'en montre qu'un point de sa couleur : il ne s'agit
           * pas de lire l'appareil, mais de savoir qu'il y en a un. De près,
           * le meuble s'efface et le repère revient en entier.
           */
          derriere?: boolean;
        }
      | {
          kind: 'label';
          depth: number;
          x: number;
          y: number;
          angle: number;
          text: string;
          /** Les cotes de détail apparaissent en fondu, avec le zoom. */
          opacity: number;
        }
      | {
          kind: 'area';
          depth: number;
          x: number;
          y: number;
          /** Nom de la pièce, tel qu'il est posé sur le plan 2D. */
          name: string;
          area: string;
        };
    const items: Item[] = dessinables.map((p) => ({ kind: 'poly' as const, ...p }));
    /*
      OÙ APPUYER POUR ALLUMER, ET OÙ LA LUMIÈRE SE POSE.

      Relevé du patron : « un clic sur un interrupteur qui est lié à une
      lumière allume celle-ci ». Les deux listes se remplissent PENDANT la
      projection, avec les mêmes nombres que le dessin : une cible calculée à
      part finirait par viser à côté de ce qu'on voit.
    */
    const ciblesInter: {
      id: string;
      cx: number;
      cy: number;
      lampes: string[];
      departs: string[];
    }[] = [];
    /**
     * OÙ SE POSE LA BAGUE D'UN DÉPART.
     *
     * La même liste que les cibles, à ceci près qu'elle garde AUSSI ce qui
     * n'est touchable par personne : le tableau, qui n'appartient à aucun
     * circuit et qu'on entoure pourtant à chaque fois — c'est de lui que part
     * tout ce qu'on montre.
     */
    const posAppareils: {
      id: string;
      cx: number;
      cy: number;
      departs: string[];
      tableau: boolean;
    }[] = [];
    const posLampes: { id: string; cx: number; cy: number; r: number }[] = [];
    // Semis du sol : même code que le plan 2D, projeté sur le plan y = 0.
    // C'est ce fond pointillé qui distingue la surface au sol des murs.
    /**
     * UN PAN DE MUR PLEIN SE DRESSE-T-IL ENTRE L'ŒIL ET CE POINT ?
     *
     * Même raisonnement que le masquage strict des meubles : un pan est un
     * morceau de plan ; si sa normale va vers l'œil et que le point est de
     * l'autre côté, le rayon qui va du point à l'œil traverse ce plan. Reste
     * à savoir si le morceau, à l'écran, couvre le point — sinon on regarde
     * à côté du mur.
     */
    const masqueParUnMur = (
      monde: { x: number; z: number },
      ecran: { sx: number; sy: number },
    ) => {
      const vers = { x: st * sp, y: cp, z: ct * sp };
      for (const f of faces) {
        if (f.ownerId || !f.normal || f.pts.length < 3 || f.isFloor) continue;
        const n = f.normal;
        if (n.x * vers.x + n.y * vers.y + n.z * vers.z <= 0) continue;
        const p0 = f.pts[0];
        // Le point du sol, à hauteur d'homme : c'est la pièce qu'on cherche
        // à voir, pas le millimètre de plancher sous le nu du mur.
        const q3 = { x: monde.x, y: 1.2, z: monde.z };
        const d =
          n.x * (q3.x - p0.x) + n.y * (q3.y - p0.y) + n.z * (q3.z - p0.z);
        if (d > -0.01) continue;
        const poly = f.pts.map((pt) => project(pt));
        let dedans = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          if (
            poly[i].sy > ecran.sy !== poly[j].sy > ecran.sy &&
            ecran.sx <
              ((poly[j].sx - poly[i].sx) * (ecran.sy - poly[i].sy)) /
                (poly[j].sy - poly[i].sy) +
                poly[i].sx
          ) {
            dedans = !dedans;
          }
        }
        if (dedans) return true;
      }
      return false;
    };

    if (showSurfaces && !interacting) {
      // Une pièce = un semis et une étiquette. Le budget de points est
      // partagé : dix pièces ne doivent pas coûter dix fois plus cher.
      const budget = Math.max(80, Math.round(350 / Math.max(1, scene.rooms.length)));
      for (const room of scene.rooms) {
        if (!room.surface) continue;
        const base = room.floorFill;
        const dotColor = mixHex(base, inkOn(base), 0.42);
        /*
          ARRETE AU NU DES MURS — releve du patron : « la surface ne doit
          pas se voir a travers les murs du modele 3D ». Le contour d'une
          piece suit l'AXE de ses murs : sans ce retrait, le semis s'etend
          sous la moitie de leur epaisseur, et l'ecorche le laisse voir.
        */
        /*
          LE SEMIS DESCEND DANS LA GÉOMÉTRIE.

          Relevé du patron, deuxième fois sur le même sujet : « la surface du
          plan 3D d'un scan doit pas se voir à travers les murs ». La
          première réponse avait arrêté le semis au nu des murs — juste, et
          insuffisant : ce n'était pas une question de PROFONDEUR (il se
          classait déjà sous tout, à moins l'infini) mais de COUCHE.

          Le modèle se dessine en deux : la géométrie, qui part au canevas
          natif, et par-dessus une couche de balises pour ce qui porte du
          texte. Le semis vivait dans la seconde — donc au-dessus des murs,
          quoi qu'en dise son rang. Chaque point devient un minuscule carré
          de géométrie : il repasse sous la maçonnerie, et le regroupement
          des tracés n'en fait qu'un seul chemin, comme pour le reste.
        */
        for (const p of pointsDuSol(
          room.surface.pts,
          walls,
          dotStep(scale, 22),
          budget,
        )) {
          const q = project({ x: p.x, y: 0, z: p.z });
          const r = 1.1;
          items.push({
            kind: 'poly',
            depth: -Infinity,
            proj: [
              { sx: q.sx - r, sy: q.sy - r, depth: q.depth },
              { sx: q.sx + r, sy: q.sy - r, depth: q.depth },
              { sx: q.sx + r, sy: q.sy + r, depth: q.depth },
              { sx: q.sx - r, sy: q.sy + r, depth: q.depth },
            ],
            fill: dotColor,
            stroke: dotColor,
            voile: 1,
            dashed: false,
          } as never);
        }
        // Même cartouche qu'en 2D, au même endroit : le nom donné sur le
        // plan se retrouve au centre de la pièce sur le modèle.
        const q = project({ x: room.labelAt.x, y: 0, z: room.labelAt.z });
        /*
          ET L'ÉTIQUETTE NE S'ÉCRIT PAS SUR UNE FAÇADE AVEUGLE.

          Elle restait une balise — c'est du texte, il doit rester net — donc
          au-dessus de toute la géométrie. Le code l'assumait : « posé
          par-dessus tout le reste : un mur ne doit pas la trancher ». C'est
          vrai d'un PLAN, où l'on regarde à travers ; c'est faux d'un MODÈLE,
          qu'on regarde de l'extérieur : on lisait « 9,0 m² » sur un pan
          plein, sans savoir de quelle pièce il s'agissait.

          Elle ne se dessine donc plus quand un pan de mur PLEIN se dresse
          entre l'œil et son point. En écorché, elle reste : le mur y est
          justement effacé pour qu'on voie la pièce.
        */
        if (!solidWalls || !masqueParUnMur(room.labelAt, q)) {
          items.push({
            kind: 'area',
            depth: Infinity,
            x: q.sx,
            y: q.sy,
            name: roomNames.get(room.roomId) ?? '',
            area: `${room.surface.exact ? '' : '≈ '}${room.surface.area
              .toFixed(1)
              .replace('.', ',')} m²`,
          });
        }
      }
    }

    // ------------------------------------------- appareillage électrique
    // Le volume posé sur le mur fait 8 cm : à l'échelle d'un logement
    // entier, c'est deux pixels. On pose donc au-dessus un repère de taille
    // FIXE pour qu'un appareil se voie quel que soit le zoom.
    /*
      LES COTES D'APPAREIL APPARTIENNENT AU BOUTON « COTES ».

      Relevé du patron : « sur le plan 3D, afficher les cotes des éléments
      élec en même temps que les murs à l'activation du bouton de cotes ».
      Elles vivaient dans le calque « Repères », qui porte la DÉSIGNATION et
      qui part éteint : le bouton « Cotes » ne pouvait donc rien montrer
      tant qu'on n'avait pas allumé un autre calque, dont le nom ne parle
      pas de cotes.

      La couche se monte donc pour l'un OU l'autre, et chacun n'y prend que
      ce qui est à lui : « Repères » la désignation, « Cotes » les nombres.
    */
    /*
      OÙ APPUYER POUR ALLUMER — indépendamment de tout calque.

      La collecte vivait d'abord DANS la couche des étiquettes, qui ne se monte
      que si « Repères » ou « Cotes » est allumé. La cible d'un interrupteur en
      dépendait donc : maquette nue, un appui ne faisait rien, et l'on aurait
      cherché longtemps pourquoi — le geste marchait « parfois ». Essayer
      l'installation n'a rien à voir avec l'affichage des repères.

      ELLE NE DÉPEND PAS NON PLUS DES COTES NI DU ZOOM : la cible existe dès
      qu'un appareil commande une lumière et que sa face regarde la caméra.
    */
    {
      const quadsC = wallQuads(keptWalls);
      const murParId = new Map(keptWalls.map((w) => [w.id, w]));
      const lotsC = new Map<string, typeof fixtures>();
      for (const f of fixtures) {
        const cle = f.group ? `g:${f.group}:${f.wallId}:${f.side}` : `s:${f.id}`;
        const l = lotsC.get(cle);
        if (l) l.push(f);
        else lotsC.set(cle, [f]);
      }
      for (const lot of lotsC.values()) {
        /*
          CE LOT COMMANDE-T-IL UNE LUMIÈRE ? Un appareil et un plafonnier sont
          liés par `commands`, dans un sens comme dans l'autre : c'est le lien
          qu'on noue à l'établi, et celui que le plan dessine en tireté.
        */
        const mes = lot.map((f) => f.id);
        const lampes = (showCeiling ? (ceiling ?? []) : [])
          .filter(
            (cl) =>
              (cl.commands ?? []).some((id) => mes.includes(id)) ||
              lot.some((f) => (f.commands ?? []).includes(cl.id)),
          )
          .map((cl) => cl.id);
        /*
          ET SUR QUEL DÉPART EST-IL ?

          Un lot est ce qu'on voit sous une même plaque, et rien n'oblige ses
          socles à partager un circuit : le neuvième socle d'un départ plein
          bascule sur le suivant, plaque ou pas. On garde donc TOUS les départs
          du lot — la bague se pose dès que l'un d'eux est celui qu'on montre,
          et c'est le premier qui répond à l'appui.
        */
        const departs: string[] = [];
        for (const id of mes) {
          const d = departDe.get(id);
          if (d && !departs.includes(d.circuit.id)) departs.push(d.circuit.id);
        }
        const w = murParId.get(lot[0].wallId);
        if (!w) continue;
        const face = wallFace(w, quadsC.get(w.id), lot[0].side);
        // Face qui tourne le dos à la caméra : l'appareil est derrière le mur.
        if (face.nx * st * sp + face.nz * ct * sp <= 0) continue;
        const cx =
          lot.reduce((t, f) => t + faceX(face, f.along), 0) / lot.length;
        const hauteur = lot.reduce((t, f) => t + f.height, 0) / lot.length;
        const pc = facePoint(face, cx, 0.06);
        const qc = project({ x: pc.x, y: hauteur, z: pc.z });
        posAppareils.push({
          id: lot[0].id,
          cx: qc.sx,
          cy: qc.sy,
          departs,
          tableau: lot.some((f) => f.kind === 'tableau'),
        });
        /*
          UN APPAREIL QUI NE RÉPOND À RIEN N'OFFRE AUCUNE CIBLE : un appui qui
          ne fait rien donne à l'écran l'air d'être en panne. Restent le
          tableau — qui n'est sur aucun départ — et, quand l'écran ne passe
          pas ses circuits, tout ce qui n'allume pas.
        */
        if (lampes.length === 0 && departs.length === 0) continue;
        ciblesInter.push({
          id: lot[0].id,
          cx: qc.sx,
          cy: qc.sy,
          lampes,
          departs,
        });
      }
    }

    if (!interacting && (showElecTags || showMeasures)) {
      const quads = wallQuads(keptWalls);
      const byId = new Map(keptWalls.map((w) => [w.id, w]));

      // Un ensemble se désigne UNE fois : deux prises sous une même plaque
      // ne portent pas deux étiquettes, ni deux jeux de cotes.
      const lots = new Map<string, typeof fixtures>();
      for (const f of fixtures) {
        const cle = f.group ? `g:${f.group}:${f.wallId}:${f.side}` : `s:${f.id}`;
        const l = lots.get(cle);
        if (l) l.push(f);
        else lots.set(cle, [f]);
      }

      /**
       * Les boîtes des meubles, dans le repère du monde.
       *
       * Un appareil posé derrière un rangement disparaît purement et
       * simplement du modèle : rien ne dit qu'il existe, et l'électricien
       * qui fait le tour compte une prise de moins. On regarde donc, image
       * par image, ce que chaque meuble intercepte.
       */
      const solY = Math.min(
        ...keptWalls.map((w2) => w2.yCenter - w2.height / 2),
      );
      const boites = keptObjects.map((o) => {
        const bas = o.transform[13] - o.height / 2 - solY;
        return {
          id: o.id,
          cx: o.transform[12],
          cz: o.transform[14],
          y0: bas,
          y1: bas + o.height,
          width: o.width,
          depth: o.depth,
          yaw: Math.atan2(o.transform[8], o.transform[10]),
        };
      });
      const versOeil = { x: st * sp, y: cp, z: ct * sp };

      for (const lot of lots.values()) {
        const w = byId.get(lot[0].wallId);
        if (!w) continue;
        const face = wallFace(w, quads.get(w.id), lot[0].side);
        // Face qui tourne le dos à la caméra : l'appareil est derrière le
        // mur, on ne le montre pas (même test que `isHiddenFace`).
        if (face.nx * st * sp + face.nz * ct * sp <= 0) continue;

        // L'emprise de la plaque commune, et les postes qu'elle porte.
        const postes: FixtureKind[] = [];
        let x0 = Infinity;
        let x1 = -Infinity;
        let saillie = 0;
        for (const f of lot) {
          const sp2 = FIXTURES[f.kind];
          const cx = faceX(face, f.along);
          x0 = Math.min(x0, cx - sp2.w / 2);
          x1 = Math.max(x1, cx + sp2.w / 2);
          saillie = Math.max(saillie, sp2.depth);
          postes.push(...postsOf(f.kind));
        }
        const x = (x0 + x1) / 2;
        const hauteur =
          lot.reduce((t, f) => t + f.height, 0) / lot.length;
        const p = facePoint(face, x, saillie + 0.01);
        const q = project({ x: p.x, y: hauteur, z: p.z });
        const cachePar = boites.filter((b) =>
          hiddenByBox({ x: p.x, y: hauteur, z: p.z }, versOeil, b),
        );
        /**
         * LE MEUBLE NE S'EFFACE QUE SI LES MURS S'EFFACENT AUSSI.
         *
         * Le fondu répondait à un vrai besoin — voir la prise derrière le
         * rangement — mais il s'appliquait dans les DEUX modes. Murs
         * pleins, on se retrouvait avec un lit fantôme flottant dans une
         * pièce fermée : le modèle disait à la fois « ce mur est opaque »
         * et « ce meuble est transparent », deux affirmations qui ne
         * tiennent pas ensemble. En mode plein, on ne fond plus rien.
         */
        // Tant que la plaque est trop petite pour se voir, un point de sa
        // couleur en tient lieu ; il s'efface à mesure qu'elle grandit.
        const taille = (x1 - x0) * scale;
        const pastille = Math.max(0, Math.min(1, (16 - taille) / 8));

        // Les deux cotes se lisent comme sur un plan : un filet pointillé
        // jusqu'au bord du mur, un autre jusqu'au sol, et le nombre posé
        // dessus.
        const versBord = x <= face.len / 2 ? 0 : face.len;
        const pb = facePoint(face, versBord, saillie + 0.01);
        const qb = project({ x: pb.x, y: hauteur, z: pb.z });
        const qs = project({ x: p.x, y: 0, z: p.z });
        items.push({
          kind: 'elec',
          pastille,
          // AU-DESSUS de la géométrie, comme les cartouches de pièce.
          //
          // Trié à sa profondeur, un repère bas — une prise à 20 cm —
          // passait AVANT le pan de mur qui le porte, et le mur le
          // repeignait aussitôt : on ne voyait plus que sa cote, qui
          // dépassait sous le mur. Un repère est une annotation, pas un
          // volume ; il se lit par-dessus, et c'est le masquage des faces
          // arrière qui l'empêche de traverser une cloison.
          depth: 1e6,
          x: q.sx,
          y: q.sy,
          color: FIXTURES[lot[0].kind].color,
          // Le sigle de la famille : c'est lui qu'on écrit de loin, à la
          // place du point de couleur.
          // Le sigle appartient à « Repères » : avec les seules cotes
          // allumées, l'appareil se marque d'un point et se cote, mais ne
          // se nomme pas.
          sigle: showElecTags ? assemblyTag(postes) : undefined,
          sigleTaille: tailleDuSigle(scale),
          /**
           * LES COTES D'UN APPAREIL SONT DES COTES.
           *
           * Elles s'affichaient en zoomant, quel que soit l'état du bouton
           * « Cotes » : on l'éteignait pour regarder le volume, les cotes
           * des murs disparaîbssaient, et celles des prises restaient —
           * avec leurs filets pointillés jusqu'au sol. Un calque qui
           * n'éteint que la moitié de ce qu'il nomme n'est pas un calque.
           */
          /*
            LA PRÉSENTATION DÉCIDE SEULE quand les cotes paraissent ; sinon
            c'est le bouton « Cotes », et lui seul.

            Il y avait un second verrou : quatre-vingt-dix pixels par mètre.
            Le seuil se défendait — une dizaine de cotes sur une vue
            d'ensemble font une bouillie — mais il rendait le bouton
            menteur : on l'allume, les murs se cotent, les prises non, et
            rien ne dit qu'il faut s'approcher. Relevé du patron : « en même
            temps que les murs ». Qui allume les cotes les veut toutes.
          */
          haut:
            (elecCotes === null ? showMeasures : elecCotes > 0.02)
              ? `${Math.round(hauteur * 100)}`
              : undefined,
          bord:
            (elecCotes === null ? showMeasures : elecCotes > 0.02)
              ? `${Math.round(Math.abs(x - versBord) * 100)}`
              : undefined,
          fondu: elecCotes === null ? 1 : Math.max(0, Math.min(1, elecCotes)),
          /*
            LA DÉSIGNATION VIENT AU ZOOM, ET SE POSE À CÔTÉ.

            Elle s'écrivait SUR l'appareil, à taille fixe, dès qu'on
            distinguait le logement : sur une vue d'ensemble, « DOUBLE PC »
            barrait le meuble qu'il désigne et couvrait ses voisins. C'est
            l'inverse de ce qu'on attend d'un plan — c'est petit d'abord, et
            plus on agrandit, plus on lit.

            Elle n'apparaît donc qu'au-delà de cent dix pixels par mètre,
            grandit avec le zoom, et se pose AU-DESSUS du repère : ce qu'on
            nomme reste visible.
          */
          nom: scale > 110 ? assemblyTag(postes) : undefined,
          nomTaille: Math.max(7, Math.min(11, 7 + (scale - 110) * 0.02)),
          /*
            CACHÉ PAR UN MEUBLE : le repère le dit, à tous les zooms.

            Ce drapeau ne valait qu'en dessous du zoom où le meuble
            s'effaçait — au-delà, l'appareil n'était plus « derrière »
            puisqu'on avait rendu le meuble fantôme. Le meuble reste
            maintenant plein : l'appareil est derrière lui, point.
          */
          derriere: cachePar.length > 0,
          bx: qb.sx,
          by: qb.sy,
          sx: qs.sx,
          sy: qs.sy,
        });
      }
    }

    if (showMeasures && !interacting) {
      /**
       * Niveau de détail, de 0 à 1, piloté par le zoom — la même idée qu'au
       * plan 2D. De loin, on ne garde que les grandes cotes : une vue
       * criblée de nombres ne se lit pas. En s'approchant, les petites
       * arêtes et les hauteurs sous plafond de CHAQUE mur apparaissent en
       * fondu, sans jamais sauter à l'écran.
       */
      const detail = Math.max(0, Math.min(1, (scale - 55) / 45));
      const edgeLabel = (
        p0: { sx: number; sy: number; depth: number },
        p1: { sx: number; sy: number; depth: number },
        text: string,
        /** Cote de détail : elle n'existe qu'une fois assez zoomé. */
        fine = false,
      ) => {
        const dx = p1.sx - p0.sx;
        const dy = p1.sy - p0.sy;
        const norm = Math.hypot(dx, dy) || 1;
        // Sous 22 px, le texte serait plus long que l'arête qu'il cote :
        // aucun zoom ne le rendrait lisible.
        if (norm < 22) return;
        const courte = norm < 46;
        const opacity = fine || courte ? detail : 1;
        if (opacity < 0.03) return;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        let n = { x: -dy / norm, y: dx / norm };
        if (n.y > 0) n = { x: -n.x, y: -n.y };
        items.push({
          kind: 'label',
          depth: (p0.depth + p1.depth) / 2 + 0.03,
          x: (p0.sx + p1.sx) / 2 + n.x * 9,
          y: (p0.sy + p1.sy) / 2 + n.y * 9,
          angle,
          text,
          opacity,
        });
      };
      // Les menuiseries : largeur sur le linteau, hauteur sur le tableau.
      // Ce sont des cotes de détail — elles n'apparaissent qu'en approchant,
      // sinon elles s'empilent sur celles du mur qui les porte.
      const solY = keptWalls.length
        ? Math.min(...keptWalls.map((x) => x.yCenter - x.height / 2))
        : 0;
      for (const o of keptOpenings) {
        const y0 = Math.max(0, o.yCenter - o.height / 2 - solY);
        const y1 = y0 + o.height;
        const pa = project({ x: o.a.x, y: y1, z: o.a.z });
        const pb = project({ x: o.b.x, y: y1, z: o.b.z });
        edgeLabel(pa, pb, `${segLength(o).toFixed(2).replace('.', ',')} m`, true);
        const bas = project({ x: o.a.x, y: y0, z: o.a.z });
        edgeLabel(bas, pa, `${o.height.toFixed(2).replace('.', ',')} m`, true);
      }

      const seenHeights = new Set<string>();
      for (const w of walls) {
        const pA = project({ x: w.a.x, y: w.height, z: w.a.z });
        const pB = project({ x: w.b.x, y: w.height, z: w.b.z });
        edgeLabel(pA, pB, `${segLength(w).toFixed(2).replace('.', ',')} m`);
        // La hauteur sous plafond : une seule de loin — elle est la même
        // partout —, puis celle de chaque mur quand on s'approche, sur son
        // arête verticale.
        const hKey = w.height.toFixed(2);
        const premiere = !seenHeights.has(hKey);
        seenHeights.add(hKey);
        const p0 = project({ x: w.a.x, y: 0, z: w.a.z });
        edgeLabel(p0, pA, `${hKey.replace('.', ',')} m`, !premiere);
      }
    }

    /*
      LE FONDU DES MEUBLES A ÉTÉ RETIRÉ — il effaçait pour rien.

      Un meuble qui cachait un appareil passait à 22 % d'opacité une fois
      zoomé : c'est ce qui faisait « disparaître » le haut d'un rangement
      ou une tête de lit, d'un angle à l'autre, sans qu'on comprenne
      pourquoi. Deux meubles voisins détectés séparément par le scanner —
      le cas courant — et c'est la moitié d'une armoire qui s'évapore.

      Or le repère d'appareil est déjà peint PAR-DESSUS toute la géométrie
      (`depth: 1e6`, quelques lignes plus haut) : la prise derrière le
      rangement se voit de toute façon. On effaçait donc le meuble pour
      découvrir ce qui était déjà visible.
    */

    items.sort((p, q) => p.depth - q.depth);
    /*
      LE DESSIN SE SÉPARE EN DEUX : la géométrie, recollée en tracés (voir
      `grouperTraces`), et le reste — repères, semis, étiquettes —, qui ne
      se fusionne pas et garde ses propres nœuds.

      Les deux listes suivent l'ordre de peinture : les tracés d'abord, ce
      qui est posé PAR-DESSUS ensuite. C'est déjà ce que faisait le tri —
      un repère d'appareil se classe à `1e6`, tout au-devant.
    */
    /*
      LA LUMIÈRE SE POSE SOUS LE PLAFONNIER, pas dessus : c'est de là qu'elle
      tombe. On la projette au ras du plafond de sa pièce, comme la pastille
      que `buildScene` y dessine.
    */
    for (const cl of showCeiling ? (ceiling ?? []) : []) {
      const mursDeLaPiece = walls.filter((w) => roomOf(w) === cl.roomId);
      const haut = (mursDeLaPiece.length > 0 ? mursDeLaPiece : walls).reduce(
        (m, w) => Math.max(m, w.height),
        0,
      );
      if (!(haut > 0.5)) continue;
      const q = project({ x: cl.at.x, y: haut - 0.08, z: cl.at.z });
      // Le rayon se calcule ICI, avec l'échelle du dessin : le rendu n'a plus
      // qu'à le poser, et il ne peut plus le deviner de travers.
      posLampes.push({
        id: cl.id,
        cx: q.sx,
        cy: q.sy,
        r: Math.max(
          HALO_MIN,
          Math.min(HALO_PART * radius3d * scale, HALO_LAMPE * scale),
        ),
      });
    }
    /*
      LES VOLUMES DE SALLE D'EAU — dessinés au sol, comme un gabarit tracé à la
      craie avant de percer.

      DEUX NAPPES ET PAS TROIS : le volume 0 est l'intérieur de la baignoire
      elle-même, déjà dessinée par le meuble ; le redoubler d'une nappe
      n'apprendrait rien. On montre le 1 — au droit de la zone humide — et le 2
      — soixante centimètres autour —, qui sont ceux où l'on hésite.

      AU SOL, ET NON À HAUTEUR DE POSE. Un volume monte à 2,25 m, mais une
      nappe verticale masquerait le mur qu'on regarde. Le sol suffit à situer :
      c'est l'aplomb qui compte pour savoir si une boîte tombe dedans.
    */
    const volumes: { id: string; niveau: 1 | 2; pts: { sx: number; sy: number }[] }[] = [];
    const interdits: { id: string; cx: number; cy: number }[] = [];
    if (showVolumes) {
      const zones: WetZone[] = wetZones(keptObjects as never);
      for (const [i, z] of zones.entries()) {
        // Le contour de la zone, et son débord : deux anneaux concentriques.
        for (const [niveau, marge] of [
          [2, VOLUME2_DEBORD],
          [1, 0],
        ] as [1 | 2, number][]) {
          const c = centreDe(z.pts);
          const pts = z.pts.map((q: { x: number; z: number }) => {
            const dx = q.x - c.x;
            const dz = q.z - c.z;
            const d = Math.hypot(dx, dz) || 1;
            const p3 = { x: q.x + (dx / d) * marge, y: 0.01, z: q.z + (dz / d) * marge };
            const pr = project(p3);
            return { sx: pr.sx, sy: pr.sy };
          });
          volumes.push({ id: `${i}`, niveau, pts });
        }
      }
      /*
        ET L'APPAREIL QUI TOMBE DEDANS SE SIGNALE SUR PLACE. On ne demande pas
        à l'électricien d'aller lire une feuille pour savoir que la prise qu'il
        regarde est interdite.
      */
      if (zones.length > 0) {
        const quadsV = wallQuads(keptWalls);
        const murV = new Map(keptWalls.map((w) => [w.id, w]));
        for (const f of fixtures) {
          const w = murV.get(f.wallId);
          if (!w) continue;
          const face = wallFace(w, quadsV.get(w.id), f.side);
          if (face.nx * st * sp + face.nz * ct * sp <= 0) continue;
          const pf = facePoint(face, faceX(face, f.along), 0.02);
          const v = volumeAt({ x: pf.x, z: pf.z }, f.height, zones);
          if (v === null) continue;
          // La norme ne dit pas la même chose de tout : un socle est interdit
          // en volume 2, une commande y est admise. C'est `volumeVerdict` qui
          // tranche — une seule source pour la règle, ici comme au contrôle.
          if (volumeVerdict(f.kind, v).allowed) continue;
          const q = project({ x: pf.x, y: f.height, z: pf.z });
          interdits.push({ id: f.id, cx: q.sx, cy: q.sy });
        }
      }
    }
    const geometrie = items.filter((it) => it.kind === 'poly');
    const groupes = grouperTraces(geometrie as never);
    const autres = items.filter((it) => it.kind !== 'poly');
    /*
      ET LE MÊME DESSIN, MIS À PLAT POUR LE CANEVAS NATIF.

      Les deux chemins partent des MÊMES faces, dans le même ordre : le
      canevas quand le natif est là, les balises sinon (Android, banc
      d'essai). Deux transcriptions d'une seule vérité — jamais deux
      calculs.
    */
    const canevas = mettreAPlat(geometrie as never);
    return {
      groupes,
      autres,
      canevas,
      ciblesInter,
      posAppareils,
      posLampes,
      volumes,
      interdits,
      // Le rayon de la bague se calcule ICI, avec l'échelle du dessin, comme
      // celui du halo : le rendu ne fait que le poser.
      rBague: Math.max(BAGUE_MIN, BAGUE_DEPART * scale),
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [
    scene,
    faces,
    fixtures,
    elecCotes,
    keptWalls,
    keptOpenings,
    roomNames,
    layout,
    view,
    center,
    radius3d,
    showMeasures,
    showElecTags,
    keptObjects,
    showSurfaces,
    solidWalls,
    walls,
    masquesScene,
    interacting,
    // Le rendu allege pilote aussi la fraicheur du classement : sans lui
    // dans cette liste, une presentation qui demarre garderait l'ordre
    // calcule avant elle.
    light,
    pov,
    focusWallId,
    showVolumes,
    departDe,
  ]);

  /**
   * TAPER SUR UN INTERRUPTEUR ALLUME CE QU'IL COMMANDE.
   *
   * Relevé du patron : « enlève le clic sur un mur qui donne la caméra face à
   * ce mur ; ajoute un système qui fait qu'un clic sur un interrupteur qui est
   * lié à une lumière allume celle-ci ».
   *
   * CE QUE LE TAP FAISAIT, ET POURQUOI ÇA GÊNAIT. Il cadrait la caméra face au
   * mur touché — bonne idée pour lire une élévation, mauvaise pour tout le
   * reste : la maquette bougeait dès qu'on la touchait sans vouloir la tourner,
   * et il ne restait AUCUN appui disponible pour agir sur ce qu'on voit. Un
   * geste qui recadre bloque tous les autres.
   *
   * LA CIBLE EST PLUS LARGE QUE LE SYMBOLE, et c'est le relevé qui le demande :
   * « élargis un tout petit peu la zone autour de l'interrupteur ». Un mécanisme
   * fait sept centimètres sur un mur de cinq mètres — quelques pixels à
   * l'écran — et l'on vise avec un doigt. C'est la règle du plan 2D : la cible
   * est plus tolérante que le dessin, et elle ne se confond jamais avec lui.
   *
   * ET TOUT LE RESTE MONTRE SON DÉPART. Une commande a déjà son travail ; une
   * prise, une sortie de câble, une prise de communication n'avaient rien à
   * répondre. Elles répondent à la question qu'on pose vraiment devant un
   * logement qu'on n'a pas câblé soi-même — « celle-là, elle est sur quoi ? » —
   * en entourant leurs sœurs du même circuit, et le tableau avec elles.
   *
   * UN APPAREIL NE FAIT JAMAIS LES DEUX. Faire allumer ET entourer une
   * commande poserait des bagues à demeure dès qu'une lampe est allumée, et
   * l'on ne désignerait plus rien. Le partage se lit sans notice : ce qui
   * commande allume, ce qui consomme montre d'où il vient.
   */
  const basculerRef = useRef<((tx: number, ty: number) => void) | null>(null);
  basculerRef.current = (tx, ty) => {
    const cibles = renduRef.current?.ciblesInter ?? [];
    let touchee: (typeof cibles)[number] | null = null;
    let plusProche = Infinity;
    for (const c of cibles) {
      const d = Math.hypot(tx - c.cx, ty - c.cy);
      // La plus proche DANS la cible : deux interrupteurs voisins sur une
      // même plaque ne doivent pas se disputer l'appui.
      if (d <= RAYON_CIBLE && d < plusProche) {
        plusProche = d;
        touchee = c;
      }
    }
    if (!touchee) return;
    const cible = touchee;
    haptic('leger');
    if (cible.lampes.length === 0) {
      // Ce qui ne commande rien montre son départ.
      const depart = cible.departs[0];
      if (!depart) return;
      setDepartMontre((avant) =>
        avant && avant.ancre === cible.id ? null : { circuit: depart, ancre: cible.id },
      );
      return;
    }
    setAllumees((avant) => {
      const apres = new Set(avant);
      /*
        UN INTERRUPTEUR BASCULE TOUT SON GROUPE ENSEMBLE. S'il commande deux
        points lumineux et qu'un seul est allumé, l'appui allume le second —
        on ne laisse pas un va-et-vient dans un état que la vraie installation
        ne peut pas prendre.
      */
      const toutAllume = cible.lampes.every((id: string) => apres.has(id));
      for (const id of cible.lampes) {
        if (toutAllume) apres.delete(id);
        else apres.add(id);
      }
      return apres;
    });
  };

  // La référence suit le rendu : le geste lit toujours l'état affiché.
  renduRef.current = rendered ? { ciblesInter: rendered.ciblesInter } : null;

  /**
   * LE DÉPART MONTRÉ, MIS EN FORME — repère, teinte, libellé.
   *
   * Le repère et la teinte se déduisent du RANG dans le tableau, exactement
   * comme le plan, le PDF et le schéma unifilaire les déduisent : `C3` est le
   * troisième départ, et sa couleur est la troisième de la roue. Une teinte
   * choisie ici dirait « C2 » en vert sur le dossier et en bleu sur le modèle.
   *
   * LE DÉPART S'ANNONCE, SINON LA COULEUR NE DIT RIEN. Trois prises entourées
   * de violet, c'est joli et muet : ce qu'on veut savoir, c'est quel
   * disjoncteur couper et sous quelle section. Le libellé porte donc le
   * repère, le nom du départ et sa protection — le calibre d'abord, c'est lui
   * qu'on cherche.
   */
  const departVu = (() => {
    if (!departMontre) return null;
    const rang = (circuits ?? []).findIndex((x) => x.id === departMontre.circuit);
    if (rang < 0) return null;
    const circuit = (circuits ?? [])[rang];
    // La virgule décimale du métier : « 2,5 mm² », jamais « 2.5 ».
    const section =
      circuit.section === null ? null : String(circuit.section).replace('.', ',');
    const protection =
      circuit.breaker === null
        ? 'sans disjoncteur'
        : `${circuit.breaker} A${section ? ` · ${section} mm²` : ''}`;
    return {
      id: circuit.id,
      /** Les points de PLAFOND du départ : eux aussi portent la bague. */
      plafond: new Set(circuit.ceilingIds ?? []),
      teinte: circuitColor(rang),
      /*
        DEUX LIGNES, ET C'EST UNE MESURE, PAS UN GOÛT.

        Sur une seule ligne, « C2 · Prises 1 — 20 A · 2,5 mm² » réserve 228
        pixels. Vu à l'œil sur le rendu réel dézoomé à 0,35, le logement entier
        tenait dans 145 : l'étiquette recouvrait le plan qu'elle commente. Le
        halo l'avait déjà fait à sa façon, et la leçon est la même — ce qui
        s'écrit en pixels ne rétrécit pas avec le dessin, il faut donc qu'il
        soit COURT.

        Coupée en deux — l'identité au-dessus, les caractéristiques en
        dessous —, elle tombe à 116 pixels. C'est la forme du cartouche de
        pièce, dix lignes plus bas dans ce même fichier : même estimation de
        largeur, même hauteur, même partage. Deux cartouches sur une maquette
        ne s'inventent pas chacun leur mise en page.
      */
      titre: `C${rang + 1} · ${circuit.label}`,
      protection,
    };
  })();

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setLayout({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      {...pan.panHandlers}>
      {/* pointerEvents="none" : le SVG ne doit pas voler les gestes. */}
      {rendered && (
        <View pointerEvents="none">
          {/*
            LE CANEVAS PORTE LA GÉOMÉTRIE, le SVG ce qui se pose dessus.

            Les repères d'appareillage, les semis de sol et les étiquettes
            restent des balises : ils sont peu nombreux, ils portent du
            TEXTE, et rien ne gagnerait à les décrire en nombres. La
            géométrie, elle — trois cents formes recalculées à chaque image
            —, passe au canevas natif : une seule vue, un seul dessin.
          */}
          {!!RoomScanCanvas && (
            <RoomScanCanvas
              style={{ width: layout.w, height: layout.h }}
              formes={rendered.canevas.formes}
              styles={rendered.canevas.styles}
            />
          )}
          <Svg
            width={layout.w}
            height={layout.h}
            style={RoomScanCanvas ? StyleSheet.absoluteFill : undefined}>
            {/*
              LES FACES VOISINES DE MÊME PEAU EN UN SEUL TRACÉ.

              Chaque face était une vue native, réconciliée et repeinte à
              chaque image : cinq cent cinquante d'entre elles sur un
              logement meublé, et c'est le mur — relevé du patron, MagicScan
              à l'appui. Le calcul, lui, ne coûte que trois dixièmes de
              milliseconde : il n'a jamais été en cause.

              `grouperTraces` recolle les faces QUE le tri a laissées côte à
              côte, sans en réordonner aucune : le dessin est le même, au
              pixel près, pour moitié moins de vues.
            */}
            {!RoomScanCanvas &&
              rendered.groupes.map((g, i) =>
              g.trait ? (
                <Path
                  key={`t${i}`}
                  d={g.d}
                  fill="none"
                  stroke={g.stroke}
                  strokeWidth={g.dashed ? 1.8 : 1}
                  strokeDasharray={g.dashed ? '6 4' : '0'}
                  strokeLinecap="round"
                  opacity={g.voile}
                />
              ) : (
                <Path
                  key={`p${i}`}
                  d={g.d}
                  fill={g.fill}
                  stroke={g.stroke}
                  strokeWidth={g.dashed ? 1.8 : 1}
                  strokeDasharray={g.dashed ? '6 4' : '0'}
                  strokeLinejoin="round"
                  // L'aplat s'efface, l'arête reste : un mur estompé doit
                  // continuer à dire où il passe.
                  fillOpacity={g.voile}
                  strokeOpacity={0.25 + 0.75 * g.voile}
                />
                ),
              )}
            {/*
              LE GABARIT DES VOLUMES, AU RAS DU SOL.

              Il se dessine AVANT tout le reste : c'est un fond de repérage, il
              passe sous les appareils qu'il sert à juger. Le volume 2 d'abord,
              le volume 1 par-dessus — du plus large au plus serré, sinon le
              grand recouvrirait le petit.

              LES TEINTES SONT CELLES DU CONTRÔLE : l'ambre pour « regarde »,
              le rouge pour « interdit ». Elles ne veulent rien dire d'autre
              ailleurs dans l'application.
            */}
            {rendered.volumes.map((v) => (
              <Polygon
                key={`volume-${v.niveau}-${v.id}`}
                testID={`volume-${v.niveau}-${v.id}`}
                points={v.pts.map((q) => `${q.sx},${q.sy}`).join(' ')}
                fill={v.niveau === 1 ? c.danger : c.amber}
                opacity={v.niveau === 1 ? 0.22 : 0.13}
                stroke={v.niveau === 1 ? c.danger : c.amber}
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            ))}
            {/*
              ET L'APPAREIL INTERDIT ROUGIT SUR PLACE — une bague, pas un
              disque : elle cercle le repère sans le cacher, et c'est le repère
              qu'on est venu regarder.
            */}
            {rendered.interdits.map((f) => (
              <Circle
                key={`interdit-${f.id}`}
                testID={`interdit-${f.id}`}
                cx={f.cx}
                cy={f.cy}
                r={13}
                fill="none"
                stroke={c.danger}
                strokeWidth={2.5}
              />
            ))}
            {/*
              LES LUMIÈRES ALLUMÉES, PAR-DESSUS LA MAQUETTE.

              Relevé du patron : « on doit voir les lumières scintiller et plus
              brillantes ». Le halo se pose EN SVG, et non dans la scène : la
              scène est mise en cache par pièce, et la repeindre à chaque appui
              coûterait tout ce qu'on a gagné à passer au canevas natif. Un
              cercle par lampe allumée, c'est tout.

              TROIS CERCLES CONCENTRIQUES plutôt qu'un dégradé : le plus large
              et le plus pâle donne la portée, le plus serré donne la source.
              C'est ce qui fait qu'on lit une lumière et non une pastille de
              couleur.
            */}
            {rendered.posLampes
              .filter((l) => allumees.has(l.id))
              .map((l) => (
                <React.Fragment key={`lum-${l.id}`}>
                  {/*
                    TROIS CERCLES TIRÉS D'UN SEUL RAYON — la portée, la nappe,
                    la source. Trois nombres indépendants finiraient par se
                    contredire au premier changement d'échelle : ce sont des
                    FRACTIONS du même halo.
                  */}
                  <AnimatedCircle
                    testID={`halo-${l.id}`}
                    cx={l.cx}
                    cy={l.cy}
                    r={l.r}
                    fill="#FFE9A8"
                    opacity={scintille}
                  />
                  <AnimatedCircle
                    cx={l.cx}
                    cy={l.cy}
                    r={l.r * 0.48}
                    fill="#FFF3CE"
                    opacity={halo2}
                  />
                  {/*
                    LE PLANCHER DE LA SOURCE SUIT AUSSI. À un point et demi
                    près, il valait trois : sur un halo divisé par deux, le
                    cœur devenait plus large que la nappe qui l'entoure —
                    trois contre trois virgule zéro cinq, à zoom 0,2. Trois
                    cercles qui se croisent ne se lisent plus comme une
                    lumière.
                  */}
                  <Circle
                    cx={l.cx}
                    cy={l.cy}
                    r={Math.max(1.5, l.r * 0.17)}
                    fill="#FFFDF4"
                    opacity={0.95}
                  />
                </React.Fragment>
              ))}
            {/*
              LE DÉPART QU'ON MONTRE : ses appareils, et le tableau.

              UNE BAGUE, PAS UN DISQUE — la même règle que l'appareil interdit :
              elle cercle le repère sans le cacher, et c'est le repère qu'on est
              venu regarder. Le tableau la porte à chaque fois : savoir que deux
              prises sont sœurs sans savoir d'où elles viennent ne dit pas où
              couper, et couper est la raison pour laquelle on pose la question.

              ELLES SE POSENT AVANT LES CIBLES et après les halos : ce qu'on
              touche prime sur ce qui est à côté.
            */}
            {departVu && (
              <>
                {rendered.posAppareils
                  .filter((a) => a.tableau || a.departs.includes(departVu.id))
                  .map((a) => (
                    <Circle
                      key={`bague-${a.id}`}
                      testID={`bague-${a.id}`}
                      cx={a.cx}
                      cy={a.cy}
                      r={rendered.rBague}
                      fill="none"
                      stroke={departVu.teinte}
                      strokeWidth={2.5}
                    />
                  ))}
                {/* Un circuit d'éclairage porte des appliques au mur ET des
                    points au plafond : montrer la moitié d'un départ vaudrait
                    mieux ne rien montrer. */}
                {rendered.posLampes
                  .filter((l) => departVu.plafond.has(l.id))
                  .map((l) => (
                    <Circle
                      key={`bague-${l.id}`}
                      testID={`bague-${l.id}`}
                      cx={l.cx}
                      cy={l.cy}
                      r={rendered.rBague}
                      fill="none"
                      stroke={departVu.teinte}
                      strokeWidth={2.5}
                    />
                  ))}
                {(() => {
                  /*
                    L'ÉTIQUETTE SE POSE PRÈS DU DOIGT — sur l'appareil qu'on
                    vient de toucher. Ancrée au tableau, elle aurait obligé à
                    chercher des yeux à l'autre bout du logement ce qu'on vient
                    de demander ; ancrée en haut de l'écran, elle aurait dépendu
                    de ce que le parent met par-dessus la vue.

                    L'ANCRE PEUT AVOIR TOURNÉ HORS DU CHAMP : on retombe alors
                    sur le premier appareil visible du départ, et s'il n'y en a
                    aucun, l'étiquette se tait — le départ reste montré, il n'y
                    a simplement plus rien à désigner de ce côté-ci.
                  */
                  const ancre =
                    rendered.posAppareils.find(
                      (a) => a.id === departMontre?.ancre,
                    ) ??
                    rendered.posAppareils.find((a) =>
                      a.departs.includes(departVu.id),
                    );
                  if (!ancre) return null;
                  // La même estimation de largeur que le cartouche de pièce,
                  // quelques lignes plus bas : deux mesures divergentes
                  // finissent toujours par tronquer un libellé.
                  const wpx = Math.max(
                    46,
                    Math.max(departVu.titre.length, departVu.protection.length) *
                      7 +
                      18,
                  );
                  const hpx = 38;
                  const x = clamp(ancre.cx, wpx / 2 + 6, layout.w - wpx / 2 - 6);
                  const y = Math.max(
                    hpx / 2 + 6,
                    ancre.cy - rendered.rBague - 24,
                  );
                  return (
                    <>
                      <Rect
                        x={x - wpx / 2}
                        y={y - hpx / 2}
                        width={wpx}
                        height={hpx}
                        rx={6}
                        fill={c.surface}
                        stroke={departVu.teinte}
                        strokeWidth={1.5}
                      />
                      <SvgText
                        testID="etiquette-depart"
                        x={x}
                        y={y - 3}
                        fontSize={11}
                        fontWeight="700"
                        fill={c.ink}
                        textAnchor="middle">
                        {departVu.titre}
                      </SvgText>
                      <SvgText
                        testID="etiquette-protection"
                        x={x}
                        y={y + 12}
                        fontSize={10}
                        fontWeight="700"
                        fill={c.inkSoft}
                        textAnchor="middle">
                        {departVu.protection}
                      </SvgText>
                    </>
                  );
                })()}
              </>
            )}
            {/*
              LA CIBLE D'UN INTERRUPTEUR — invisible, et plus large que lui.

              Elle est dessinée APRÈS les halos : ce qu'on touche prime sur ce
              qui est à côté, et c'est la règle de la maison. Elle ne porte
              aucune couleur : un halo de visée sur une maquette se lirait
              comme une lampe de plus.
            */}
            {rendered.ciblesInter.map((c) => (
              <Circle
                key={`cible-${c.id}`}
                testID={`cible-${c.id}`}
                cx={c.cx}
                cy={c.cy}
                r={RAYON_CIBLE}
                fill="#000000"
                opacity={0}
              />
            ))}
            {rendered.autres.map((item, i) =>
              item.kind === 'dot' ? (
                <Circle key={i} cx={item.x} cy={item.y} r={1.1} fill={item.color} />
              ) : item.kind === 'elec' ? (
                <G key={i}>
                  {/* DERRIÈRE UN MEUBLE : un point de sa couleur, cerné de
                      blanc, et rien d'autre. On ne cherche pas à lire
                      l'appareil — le meuble est devant — mais à savoir
                      qu'il y en a un, sans quoi on en compte un de moins en
                      faisant le tour du modèle. En zoomant, le meuble
                      s'efface et le repère revient en entier. */}
                  {item.derriere && (
                    <>
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={5.2}
                        fill={c.surface}
                        opacity={0.92}
                      />
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={3.4}
                        fill={item.color}
                        opacity={0.55}
                      />
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={5.2}
                        stroke={item.color}
                        strokeWidth={1}
                        strokeDasharray="2.2 2"
                        fill="none"
                        opacity={0.75}
                      />
                    </>
                  )}
                  {/*
                    LE SIGLE, ÉCRIT — et non un point de couleur.

                    Vu de loin, l'appareil se réduisait à une pastille : on
                    savait qu'il y avait quelque chose, jamais quoi. Le sigle
                    tient dans la même place et dit la nature ; son liseré
                    clair le détache d'un mur sombre comme d'un meuble.
                  */}
                  {!item.derriere && item.pastille > 0.02 && (
                    <>
                      <SvgText
                        x={item.x}
                        y={item.y + 3.4}
                        fill="none"
                        stroke={c.surface}
                        strokeWidth={2.8}
                        fontSize={item.sigleTaille ?? 10}
                        fontWeight="800"
                        textAnchor="middle"
                        opacity={item.pastille}>
                        {item.sigle}
                      </SvgText>
                      <SvgText
                        x={item.x}
                        y={item.y + 3.4}
                        fill={item.color}
                        fontSize={item.sigleTaille ?? 10}
                        fontWeight="800"
                        textAnchor="middle"
                        opacity={item.pastille}>
                        {item.sigle}
                      </SvgText>
                    </>
                  )}
                  {item.haut && (
                    <>
                      {/* Cote du bord : filet pointillé jusqu'au retour de
                          mur, nombre posé dessus. */}
                      {/* Le filet est ENTIER dès qu'il paraît : c'est son
                          opacité qui monte, pas sa longueur. Un trait qui
                          s'allonge attire l'œil sur le mouvement ; ce qu'on
                          veut faire lire, c'est le nombre au bout. */}
                      <Line
                        x1={item.x}
                        y1={item.y}
                        x2={item.bx ?? item.x}
                        y2={item.by ?? item.y}
                        stroke={c.ink}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        opacity={0.5 * (item.fondu ?? 1)}
                      />
                      {(item.fondu ?? 1) > 0.02 && (
                        <SvgText
                          x={((item.bx ?? item.x) + item.x) / 2}
                          y={((item.by ?? item.y) + item.y) / 2 - 4}
                          fill={c.ink}
                          fontSize={9.5}
                          fontWeight="800"
                          opacity={item.fondu ?? 1}
                          textAnchor="middle">
                          {item.bord}
                        </SvgText>
                      )}
                      {/* Cote du sol : même filet, à l'aplomb. */}
                      <Line
                        x1={item.x}
                        y1={item.y}
                        x2={item.sx ?? item.x}
                        y2={item.sy ?? item.y}
                        stroke={c.ink}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        opacity={0.5 * (item.fondu ?? 1)}
                      />
                      {(item.fondu ?? 1) > 0.02 && (
                        <SvgText
                          x={((item.sx ?? item.x) + item.x) / 2 + 7}
                          y={((item.sy ?? item.y) + item.y) / 2 + 3}
                          fill={c.ink}
                          fontSize={9.5}
                          fontWeight="800"
                          opacity={item.fondu ?? 1}>
                          {item.haut}
                        </SvgText>
                      )}
                      {/* La désignation, AU CENTRE de l'appareil. Deux
                          passes : un liseré clair dessous, le texte
                          par-dessus — sans quoi « PC » disparaît sur un
                          mécanisme ambre. */}
                      {item.nom && (
                        <>
                          <SvgText
                            x={item.x}
                            y={item.y - 13}
                            fill="none"
                            stroke={c.surface}
                            strokeWidth={2.6}
                            strokeLinejoin="round"
                            fontSize={item.nomTaille ?? 9}
                            fontWeight="800"
                            textAnchor="middle">
                            {item.nom}
                          </SvgText>
                          <SvgText
                            x={item.x}
                            y={item.y - 13}
                            fill={c.ink}
                            fontSize={item.nomTaille ?? 9}
                            fontWeight="800"
                            textAnchor="middle">
                            {item.nom}
                          </SvgText>
                        </>
                      )}
                    </>
                  )}
                </G>
              ) : item.kind === 'area' ? (
                (() => {
                  // Cartouche identique à celui du plan 2D : cadre, nom
                  // au-dessus, surface en dessous.
                  const label = item.name || item.area;
                  const wpx = Math.max(46, label.length * 7 + 18);
                  const hpx = item.name ? 38 : 24;
                  return (
                    <React.Fragment key={i}>
                      <Rect
                        x={item.x - wpx / 2}
                        y={item.y - hpx / 2}
                        width={wpx}
                        height={hpx}
                        rx={6}
                        fill={c.surface}
                        stroke={c.lineStrong}
                        strokeWidth={1}
                      />
                      {item.name !== '' && (
                        <SvgText
                          x={item.x}
                          y={item.y - 3}
                          fontSize={11}
                          fontWeight="700"
                          fill={c.ink}
                          textAnchor="middle">
                          {item.name}
                        </SvgText>
                      )}
                      <SvgText
                        x={item.x}
                        y={item.y + (item.name !== '' ? 12 : 4)}
                        fontSize={item.name !== '' ? 10 : 11}
                        fontWeight="700"
                        fill={c.inkSoft}
                        textAnchor="middle">
                        {item.area}
                      </SvgText>
                    </React.Fragment>
                  );
                })()
              ) : (
                <G key={i} opacity={item.opacity}>
                  <SvgText
                    x={item.x}
                    y={item.y}
                    fontSize={10}
                    fontWeight="700"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    textAnchor="middle"
                    transform={`rotate(${item.angle}, ${item.x}, ${item.y})`}>
                    {item.text}
                  </SvgText>
                  <SvgText
                    x={item.x}
                    y={item.y}
                    fontSize={10}
                    fontWeight="700"
                    fill="#0B0D12"
                    textAnchor="middle"
                    transform={`rotate(${item.angle}, ${item.x}, ${item.y})`}>
                    {item.text}
                  </SvgText>
                </G>
              ),
            )}
            {/*
              LES POINTS CARDINAUX, ici aussi.

              Le plan les portait, pas la 3D — et c'est pourtant là qu'on
              tourne autour du logement jusqu'à ne plus savoir quel mur on
              regarde. L'angle se calcule autrement : la caméra tourne et
              s'incline, donc une direction du monde s'aplatit à l'écran.
              Le dessin, lui, est le même que sur le plan.
            */}
            {showNorth && north !== null && (
              <CardinalRing
                w={layout.w}
                h={layout.h}
                angleOf={(bearing) => {
                  // La direction du monde pour ce cap, dans le repère du
                  // scan : le nord y est à −`north` degrés de l'axe −Z.
                  const b = ((bearing - north) * Math.PI) / 180;
                  const dx = Math.sin(b);
                  const dz = -Math.cos(b);
                  const ct = Math.cos(rad(view.theta));
                  const st = Math.sin(rad(view.theta));
                  const cp = Math.cos(rad(view.tilt));
                  return Math.atan2((dx * st + dz * ct) * cp, dx * ct - dz * st);
                }}
              />
            )}
          </Svg>
        </View>
      )}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
}));
