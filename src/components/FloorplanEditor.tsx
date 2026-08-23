import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  PanResponder,
  type GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Pattern,
  Polygon,
  Polyline,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import {
  bounds,
  castToWall,
  clampFootprint,
  makeMapping,
  quadPoints,
  roomExtent,
  roomOf,
  angleAimante,
  anglesRemarquables,
  deplier,
  massifsTechniques,
  pivotsDesBattants,
  roomParts,
  segLength,
  toFootprint,
  trousDuRelevé,
  northScreenAngle,
  planFrameAngle,
  wallQuads,
  wallRuns,
  WALL_T,
  type ObjectFootprint,
  type Pt,
  type RoomPart,
  type TrouDeReleve,
  type WallQuad,
  type WallRun,
  type WallSeg,
} from '../geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';
import {
  faceX,
  facePoint,
  interiorSide,
  wallFace,
} from '../geometry/electrical';
import { frCategory, furnKind, furnitureStrokes } from '../geometry/furniture';
import { markColor } from '../geometry/schema';
import { CeilingLayer } from './CeilingLayer';
import { FixtureLayer } from './FixtureLayer';
import { NotesLayer } from './NotesLayer';
import { aimanterCoin, poserLibre } from '../geometry/poser';
import type { Fixture } from '../geometry/electrical';
import type { CeilingFixture } from '../geometry/ceiling';
import { CloseCross } from './CloseCross';
import { CardinalRing, NorthBadge } from './CardinalRing';

/**
 * Les commandes du mur, en icônes.
 *
 * Quatre mots posés côte à côte, c'était quatre longueurs différentes et une
 * barre qui s'étirait. Une icône a toujours la même largeur ; le mot passe
 * dessous, en tout petit et en faible opacité — il est là pour la première
 * fois qu'on hésite, pas pour les cent suivantes.
 */
/**
 * La liste vide des appareils, partagée.
 *
 * Écrire `[]` à la volée en produirait une NEUVE à chaque rendu, ce qui
 * réveillerait les mémoïsations de la couche qu'on cherche justement à
 * alléger en la cachant.
 */
const VIDE: Fixture[] = [];

/**
 * L'encombrement du menu du mur — partagé avec le banc, qui prouve mur par
 * mur que la poignée de rotation ne le chevauche jamais.
 */
export const WALL_MENU = { w: 204, h: 46 };

/**
 * LE NOM D'UN MEUBLE : petit DEDANS, grandi par le zoom, absent s'il ne
 * tient pas — un mot ne raye jamais son meuble (relevé du patron :
 * « Rangement » débordait de l'armoire, barré par ses traits). Le texte
 * reste horizontal à l'écran : la place disponible est l'emprise du
 * meuble PROJETÉE à l'écran, rotation comprise. C'est en zoomant qu'on
 * lève le doute — la règle de toute l'app.
 */
export function nomDeMeuble(
  texte: string,
  wPx: number,
  dPx: number,
  angleEcran: number,
  scale: number,
): { taille: number } | null {
  const taille = Math.max(7, Math.min(12, 0.13 * scale));
  const cos = Math.abs(Math.cos(angleEcran));
  const sin = Math.abs(Math.sin(angleEcran));
  const dispoW = wPx * cos + dPx * sin - 8;
  const dispoH = wPx * sin + dPx * cos - 6;
  if (texte.length * taille * 0.62 > dispoW) return null;
  if (taille + 2 > dispoH) return null;
  return { taille };
}

/**
 * LE CARTOUCHE GÊNE-T-IL EN CE POINT ? Obstacles : les meubles de la
 * pièce, et les appareils du plafond — relevé du patron, capture à
 * l'appui : après l'ajout d'une ligne de spots, le nom de la pièce se
 * posait SUR un spot. Chaque obstacle porte sa demi-emprise.
 */
export function cartoucheHeurte(
  pt: { x: number; z: number },
  demiW: number,
  demiH: number,
  obstacles: { x: number; z: number; rx: number; rz: number }[],
): boolean {
  return obstacles.some(
    (o) =>
      Math.abs(pt.x - o.x) < o.rx + demiW && Math.abs(pt.z - o.z) < o.rz + demiH,
  );
}

/** Un cadrage du plan : ce que le geste fait varier. */
export interface CadragePlan {
  zoom: number;
  ox: number;
  oy: number;
  rot: number;
}

/**
 * CE QUE LA COUCHE DOIT PORTER POUR MENER D'UN CADRAGE À L'AUTRE.
 *
 * Pendant un geste, le dessin reste peint au cadrage de la PRISE et c'est
 * une transformation native qui le déplace — d'où la fluidité. Encore
 * faut-il que cette transformation mène AU PIXEL PRÈS au cadrage visé,
 * sinon le lâcher, qui recalcule tout, fait sauter le plan.
 *
 * Relevé du patron : « si je zoome avec un pincement en le déplaçant, au
 * lâcher il se recale et on voit une apparition du plan quelques pixels à
 * côté ». Le premier jet posait simplement la course des doigts en
 * translation. Il oubliait que le décalage DÉJÀ ACQUIS (`ox`, `oy` de la
 * prise) est peint dans le dessin, et qu'il subit donc lui aussi
 * l'agrandissement et la rotation de la couche. L'écart valait
 * `(1 − échelle) × décalage de départ` : nul tant qu'on n'avait rien
 * déplacé avant de zoomer — c'est pourquoi le glissement simple se calait
 * parfaitement — et de quelques pixels dès qu'on zoomait un plan déjà
 * déplacé.
 *
 * La formule tient en une ligne : la couche agrandit et tourne autour du
 * centre de la vue, puis translate ; il faut donc DÉFAIRE ce que
 * l'agrandissement a fait subir à l'ancien décalage, et poser le nouveau.
 */
export function transformeDuGeste(
  prise: CadragePlan,
  vise: CadragePlan,
): { tx: number; ty: number; ech: number; rot: number } {
  const ech = vise.zoom / prise.zoom;
  const rot = vise.rot - prise.rot;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    tx: vise.ox - ech * (prise.ox * cos - prise.oy * sin),
    ty: vise.oy - ech * (prise.ox * sin + prise.oy * cos),
    ech,
    rot,
  };
}

/**
 * LA TAILLE DE LA PASTILLE QUI REFERME UN TROU, À L'ÉCHELLE DU PLAN.
 *
 * Elle faisait trente-quatre points, quel que soit le zoom : sur la vue
 * d'ensemble d'un logement — celle qu'on regarde le plus — elle couvrait
 * une pièce entière. Relevé du patron, capture à l'appui : « le + d'une
 * ouverture sans porte est trop gros en dézoom ; il doit grandir au zoom
 * avec les proportions ».
 *
 * Elle est donc une taille DU MONDE : vingt-cinq centimètres de plan, la
 * largeur d'un bloc de maçonnerie. Deux bornes la tiennent aux extrêmes —
 * en dessous de quatorze points on ne la vise plus du doigt, au-dessus de
 * trente-quatre c'est elle qu'on regarde au lieu du mur qu'elle referme.
 */
export /**
 * LA MARGE DE PRISE D'UN MEUBLE, en pixels d'écran.
 *
 * Huit points de chaque côté : la cible d'une chaise dézoomée passe ainsi de
 * neuf à vingt-cinq millimètres, ce qui la rend attrapable sans viser. Plus
 * large, elle mordrait sur le meuble d'à côté — un salon meublé en compte
 * une dizaine à quelques centimètres les uns des autres.
 */
const PRISE_MARGE = 8;

const PASTILLE_TROU_M = 0.25;
export function taillePastilleTrou(echelle: number): number {
  return Math.round(Math.min(34, Math.max(14, echelle * PASTILLE_TROU_M)));
}

/**
 * UN SEGMENT PASSE-T-IL DANS UN CADRE ? — la question du menu de mur.
 *
 * Le menu d'un mur ne doit pas se poser sur le mur qu'on vient de choisir :
 * c'est le seul trait qu'on regarde à ce moment-là. Savoir s'il le recouvre
 * revient à demander si le segment traverse le rectangle de la barre.
 *
 * On échantillonne le segment plutôt que de croiser quatre droites : à
 * quarante pas, aucun mur d'un logement ne se faufile entre deux points
 * sans être vu, et la formule tient en trois lignes qu'on relit sans
 * crayon — un test de Liang-Barsky, non.
 */
export function segmentDansCadre(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cadre: { x: number; y: number; rx: number; ry: number },
): boolean {
  for (let k = 0; k <= 40; k++) {
    const x = a.x + ((b.x - a.x) * k) / 40;
    const y = a.y + ((b.y - a.y) * k) / 40;
    if (Math.abs(x - cadre.x) < cadre.rx && Math.abs(y - cadre.y) < cadre.ry) {
      return true;
    }
  }
  return false;
}

/*
  LES ICÔNES DU MENU VIENNENT DU JEU « SOLAR BOLD » (refonte du patron) —
  les mêmes silhouettes que la rangée d'outils, généré dans
  src/ui/solaires.ts. Le rendu est un plein, jamais un trait.
*/
const WALL_ACTIONS: {
  action: 'longueur' | 'ouverture' | 'electricite' | 'supprimer';
  label: string | null;
  d: string;
}[] = [
  { action: 'longueur', label: 'Mesures', d: SOLAIRES.ruler },
  { action: 'ouverture', label: 'Ouvrir', d: SOLAIRES.ouvertures },
  { action: 'electricite', label: 'Élec', d: SOLAIRES.elec },
  // Une croix se lit dans toutes les langues, mais pas dans une rangée où
  // ses trois voisines portent un mot : la corbeille se nomme aussi.
  { action: 'supprimer', label: 'Supprimer', d: SOLAIRES.supprimer },
];

interface EffMapping {
  scale: number;
  toPx: (p: { x: number; z: number }) => { x: number; y: number };
  deltaToMeters: (dx: number, dy: number) => { x: number; z: number };
  toMeters: (px: { x: number; y: number }) => { x: number; z: number };
}
import { RoomScan } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';
import type { PlanNote } from '../store/scanStore';
import {
  cotesLisibles,
  encombrement,
  milieuVisible,
  type Etiquette,
} from '../geometry/cotes';
import { haptic, releaseHaptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';


/**
 * Empreinte d'un meuble, recalée contre les murs de SA pièce seulement :
 * la cloison de la pièce voisine ne doit pas le repousser.
 */
/**
 * TRADUIT UN BORD DU DESSIN VERS LE MAGASIN.
 *
 * Le dessin retourne certains meubles d'un demi-tour (`faceIntoRoom` : les
 * tiroirs ne s'ouvrent pas dans le plâtre) ; le magasin, lui, raisonne sur
 * le transform BRUT. La poignée posée sur le bord « + » du dessin désignait
 * alors le bord « − » du magasin — relevé du patron : « en glissant le côté
 * droit, c'est son côté gauche qui change ». Quand les deux lacets se
 * tournent le dos, le signe s'échange ; sinon rien à traduire.
 */
export function coteVersLeMagasin(
  cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
  yawDessin: number,
  yawBrut: number,
): 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-' {
  if (Math.cos(yawDessin - yawBrut) >= 0) return cote;
  return (
    cote.endsWith('+') ? cote.slice(0, -1) + '-' : cote.slice(0, -1) + '+'
  ) as typeof cote;
}

function footprintOf(
  o: ObjectData,
  partOf: Map<string, RoomPart>,
): ObjectFootprint {
  const part = partOf.get(roomOf(o));
  if (!part) return toFootprint(o);
  return clampFootprint(toFootprint(o), part.walls, part.labelAt);
}

/** Le cadrage du plan : rotation (rad), zoom, et déplacement en pixels. */
export interface VuePlan {
  zoom: number;
  ox: number;
  oy: number;
  rot: number;
}

interface Props {
  /** Cotes visibles le long des murs. */
  showMeasures: boolean;
  /** Cadrage de départ — celui que la 3D avait, quand on en revient. */
  vueInitiale?: VuePlan;
  /** Cadrage courant, remonté à chaque geste : la 3D le reprend tel quel. */
  onView?: (v: VuePlan) => void;
  /** Mode édition : sélection des murs + poignées de coin. */
  editable: boolean;
  selectedWallId: string | null;
  onSelectWall: (id: string | null) => void;
  /**
   * Cheminement des gaines, du tableau à chaque appareil. Calque optionnel :
   * sans tableau posé, l'écran n'en fournit pas, et rien ne se dessine.
   */
  cableRoutes?: { id: string; path: Pt[] }[];
  /**
   * Repère de circuit par appareil (C1, C2…) : ce qu'on donne à celui qui
   * tire les gaines. Absent = pas de repérage, le plan reste nu.
   */
  circuitMarks?: Map<string, string>;
  /**
   * LE PLAN DU NIVEAU DU DESSOUS, en filigrane.
   *
   * On ne recale pas un étage sur du vide : sans le plan du bas en
   * transparence, rien ne dit où tombe la cage d'escalier. C'est le seul
   * repère commun entre deux relevés qu'ARKit a démarrés à deux endroits
   * différents.
   *
   * Purement décoratif : rien ne s'y sélectionne et rien ne s'y aimante,
   * sinon on éditerait l'étage qu'on ne regarde pas.
   */
  filigrane?: WallSeg[];
  /**
   * MODE RECALAGE : le glissement déplace L'ÉTAGE, pas la vue.
   *
   * Le filigrane du niveau du dessous ne sert à rien si l'on ne peut pas
   * poser l'étage dessus — c'était le cas : le repère s'affichait, et
   * aucun geste ne permettait de bouger le plan du dessus. On détourne
   * donc le geste le plus naturel, celui qu'on ferait spontanément :
   * prendre le plan et le glisser jusqu'à ce que la cage d'escalier tombe
   * en face de la cage d'escalier.
   *
   * Le déplacement arrive en MÈTRES : l'appelant n'a pas à connaître le
   * zoom ni la rotation de la vue.
   */
  recalage?: (dx: number, dz: number) => void;
  /** Photos de repérage punaisées sur les murs. */
  photos?: { id: string; wallId: string; along: number }[];
  onSelectPhoto?: (id: string) => void;
  /** Meuble sélectionné : surligné, déplaçable, supprimable. */
  selectedObjectId?: string | null;
  onDeleteObject?: (id: string) => void;
  /** Pièce sélectionnée : son cartouche est mis en avant. */
  selectedRoomId?: string | null;
  /** Appui sur le sol d'une pièce (mode édition) : la sélectionne. */
  onSelectRoom?: (id: string | null) => void;
  /**
   * DÉPLACER LA PIÈCE CHOISIE, au doigt.
   *
   * Une pièce ajoutée tombe à côté du plan ; il faut la pousser contre
   * celle qui la jouxte. Le doigt posé DANS son contour la prend et la
   * fait glisser — le même geste que pour un meuble, et le même aimant
   * à l'arrivée. Les déplacements arrivent en mètres, dans le repère du
   * monde : la vue peut être tournée, le plan ne s'en occupe pas.
   */
  onMoveRoom?: (dx: number, dz: number) => void;
  /** Appui sur le cartouche d'une pièce (mode édition) : la renomme. */
  onEditRoomName?: (id: string) => void;
  /**
   * Pièces en défaut de conformité électrique : leurs murs passent en rouge
   * foncé. C'est le seul signal visible sans ouvrir un menu.
   */
  /** Cotes du meuble sélectionné : réclamées par sa pastille de mesure. */
  showObjectDims?: boolean;
  onToggleObjectDims?: () => void;
  /** Appui sur le vide : `null` retire aussi la sélection d'un meuble. */
  onSelectObject?: (id: string | null) => void;
  /**
   * COMBLER UN TROU DU RELEVÉ : le mur manquant, et la porte avec.
   *
   * Sans ce geste, deux bouts de mur que le scan a laissés séparés ne se
   * rejoignaient par aucun moyen simple — il fallait deviner où poser un
   * mur à la main, au pixel près.
   */
  onComblerTrou?: (trou: TrouDeReleve) => void;
  /** Ouverture sélectionnée : elle se retaille en largeur et en hauteur. */
  selectedOpeningId?: string | null;
  onSelectOpening?: (id: string | null) => void;
  /** Appui sur un symbole d'appareillage : ouvre son mur vu de face. */
  onSelectFixture?: (id: string, wallId: string) => void;
  /**
   * Le PLAFOND : points lumineux, détecteurs, caméras, bouches de VMC.
   *
   * C'est le calque qui manquait pour faire un vrai plan d'électricien. Il
   * s'affiche ou se cache : superposé au sol et à son mobilier, il devient
   * vite illisible, et on ne le regarde pas en même temps que le reste.
   */
  ceiling?: CeilingFixture[];
  showCeiling?: boolean;
  /**
   * Les points cardinaux autour du plan.
   *
   * On les cache comme un calque : sur un plan serré, quatre pastilles au
   * bord prennent la place des cotes qu'on est venu lire.
   */
  showNorth?: boolean;
  /**
   * L'appareillage électrique, affiché ou non.
   *
   * C'est le sujet de l'application, donc il est là par défaut. Mais sur un
   * logement équipé, ses symboles couvrent la maçonnerie qu'on est venu
   * regarder : il faut pouvoir voir le plan nu sans rien supprimer.
   */
  showFixtures?: boolean;
  /** `null` = plus rien de sélectionné au plafond (appui dans le vide). */
  onSelectCeiling?: (id: string | null) => void;
  /**
   * Pose en cours : le prochain appui donne un POINT, et rien d'autre.
   *
   * Sans cette étape, l'appui était intercepté par ce qui se trouvait
   * dessous — un cartouche de pièce demandait à renommer, un mur se
   * sélectionnait, et le plafond ne recevait rien. Un calque de capture,
   * posé par-dessus tout le dessin, rend le geste indépendant de ce qui
   * traîne en dessous. Et l'appareil se pose là où le doigt s'est posé,
   * pas au centre de la pièce : quatre spots ne se posent pas au même
   * endroit.
   */
  placing?: boolean;
  /**
   * ON TIRE UNE PIECE : poser, glisser, lacher.
   *
   * Releve du patron : « a la selection d'une piece a ajouter, elle se place
   * automatiquement et impossible de creer des murs pour faire la piece
   * facilement ». Le geste rend les deux coins ; le magasin en fait quatre
   * murs, et reprend ceux qui existent deja.
   */
  tracantPiece?: boolean;
  onTracerPiece?: (a: Pt, b: Pt) => void;
  onPlaceAt?: (at: Pt) => void;
  /**
   * L'appareil de plafond en cours de réglage.
   *
   * Tant qu'on le déplace, le plan se DÉGAGE : meubles et cartouches de
   * pièce s'effacent. Un point lumineux se pose par rapport aux murs, et
   * c'est justement ce qu'un canapé dessiné par-dessus empêche de voir.
   */
  selectedCeilingId?: string | null;
  /**
   * LES MOTS ÉCRITS SUR LE PLAN — voir {@link NotesLayer}.
   *
   * Ils se peignent au-dessus de tout le reste : une remarque à moitié
   * cachée sous un canapé n'est pas une remarque.
   */
  notes?: PlanNote[];
  selectedNoteId?: string | null;
  onSelectNote?: (id: string) => void;
  /** La ligne de spots tenue en main : elle se surligne d'un bout à l'autre. */
  selectedCeilingRow?: string | null;
  /**
   * Le retour de mur choisi, ou `null`.
   *
   * L'écran en a besoin pour y poser un appareil : choisir un retour puis
   * demander une prise doit la mettre LÀ, pas au milieu du mur. Sans cette
   * remontée, la sélection restait un simple surlignage.
   */
  onPierChange?: (
    pier: { wallId: string; t0: number; t1: number } | null,
  ) => void;
  /** Commande lancée depuis les boutons flottants du mur sélectionné. */
  onWallAction?: (
    action: 'longueur' | 'ouverture' | 'electricite' | 'supprimer',
    wallId: string,
  ) => void;
}

/**
 * Plan 2D vu de dessus, dérivé du store (source de vérité paramétrique).
 * En lecture : plan épuré, cotes discrètes. En édition : murs sélectionnables
 * et coins déplaçables (les murs soudés au même coin suivent).
 */
export function FloorplanEditor({
  showMeasures,
  vueInitiale,
  onView,
  editable,
  selectedWallId,
  onSelectWall,
  cableRoutes,
  circuitMarks,
  filigrane,
  recalage,
  photos,
  onSelectPhoto,
  selectedObjectId,
  onDeleteObject,
  selectedRoomId,
  onSelectRoom,
  onMoveRoom,
  onEditRoomName,
  onWallAction,
  onSelectFixture,
  ceiling,
  showCeiling,
  showNorth = true,
  showFixtures = true,
  onSelectCeiling,
  placing,
  tracantPiece,
  onTracerPiece,
  onPlaceAt,
  notes,
  selectedNoteId,
  onSelectNote,
  selectedCeilingId,
  selectedCeilingRow,
  onPierChange,
  selectedOpeningId,
  onSelectOpening,
  onSelectObject,
  onComblerTrou,
  showObjectDims,
  onToggleObjectDims,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const niveauCourant = useScanStore((s) => s.niveauCourant);
  const openings = useScanStore((s) => s.openings);
  const allObjects = useScanStore((s) => s.objects);
  const showFurniture = useScanStore((s) => s.showFurniture);
  // Un appareil de plafond en réglage : le sol s'efface pour qu'on voie
  // où il tombe par rapport aux murs.
  const objects =
    showFurniture && !selectedCeilingId && !selectedCeilingRow ? allObjects : [];
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const north = useScanStore((s) => s.north);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const c = useTheme();
  const styles = getStyles(c);
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const setNorth = useScanStore((s) => s.setNorth);
  /** La consigne d'orientation est affichée : le prochain appui valide. */
  const [invite, setInvite] = useState(false);

  // Navigation du plan : zoom (pincer), déplacement (glisser), rotation (torsion).
  const [view, setView] = useState(
    vueInitiale ?? { zoom: 1, ox: 0, oy: 0, rot: 0 },
  );
  /*
    LE PLAN DIT OÙ IL EN EST — et la 3D reprend exactement là.

    Passer en volume donnait un logement orienté autrement : on avait tourné
    le plan pour l'avoir dans le bon sens, et la 3D repartait de son angle à
    elle. Le relevé du chantier est net : « le plan doit se placer exactement
    comme l'autre ». On remonte donc la rotation, le zoom et le déplacement à
    l'écran qui les tient, et c'est lui qui les repasse à la vue d'à côté.
  */
  /**
   * Le plan est EN TRAIN d'être déplacé.
   *
   * Déclaré ici, au-dessus de l'effet qui l'attend : c'est lui qui décide
   * quand la position remonte à l'écran.
   */
  const [navigating, setNavigating] = useState(false);
  /*
    LE MEUBLE QU'ON NE PEUT PAS POSER LÀ.

    Relevé du patron : « impossible à placer sur un mur (meuble rouge au
    placement si impossible) ». Le refus se voit AVANT le lâcher : c'est ce
    qui distingue une aide d'une sanction — on sait qu'il ne faut pas lâcher
    ici, on n'a pas à le découvrir après coup.
  */
  const [poseRefusee, setPoseRefusee] = useState(false);
  /** Les deux coins du rectangle qu'on est en train de tirer, en metres. */
  const [tirage, setTirage] = useState<{ a: Pt; b: Pt } | null>(null);

  /*
    ET IL NE LE DIT QU'UNE FOIS LE DOIGT LEVÉ.

    Relevé du chantier : « au mouvement, le modèle 3D bug moins que le 2D ».
    La cause n'était pas le dessin — mesuré, le plan en mouvement dessine
    quatre fois moins de nœuds que la vue 3D. Elle était ICI : l'annonce
    partait à chaque image du geste, donc l'écran qui porte le plan se
    rendait tout entier soixante fois par seconde, bandeaux, rangée d'outils
    et sept feuilles comprises. Le plan, lui, n'y était pour rien.

    Or le parent n'a besoin de cette position qu'AU MOMENT DE BASCULER en
    volume, c'est-à-dire une fois le geste fini. On attend donc la fin :
    quand `navigating` retombe, l'effet part avec la vue finale.
  */
  useEffect(() => {
    if (navigating) return;
    onView?.(view);
  }, [view, navigating, onView]);
  const viewRef = useRef(view);
  viewRef.current = view;

  /*
    LE GESTE VIT SUR LE FIL NATIF, PAS DANS L'ÉTAT.

    Relevé du patron : « plus les plans sont chargés en cotes et en meubles,
    plus au déplacement il est lent ». La mesure lui donne raison et dit où :
    le calcul n'est plus en cause — trier et projeter un logement meublé
    coûte trois dixièmes de milliseconde. Ce qui coûte, c'est le NOMBRE DE
    NŒUDS : trois cent quarante vues repeintes soixante fois par seconde,
    parce que chaque image du geste recalculait le cadrage et rendait tout
    le dessin.

    Or déplacer, tourner et agrandir un dessin DÉJÀ PEINT, c'est exactement
    ce qu'une transformation native sait faire — la leçon du ruban, du badge
    et de l'onde du bouton, appliquée au plan entier. Le dessin est calculé
    une fois, à la prise ; le geste ne touche plus que ces quatre valeurs,
    qui descendent au pilote natif sans réveiller React ; le vrai cadrage
    n'est posé qu'au lâcher, en UN rendu.

    Elles portent le DELTA depuis la prise, jamais la position absolue : le
    dessin sous elles est déjà à la position de départ.
  */
  const glisse = useRef({
    tx: new Animated.Value(0),
    ty: new Animated.Value(0),
    ech: new Animated.Value(1),
    rot: new Animated.Value(0),
  }).current;
  /** Le dernier cadrage calculé par le geste, posé pour de bon au lâcher. */
  const vueVive = useRef(view);

  /*
    LA COUCHE REVIENT À PLAT QUAND LE DESSIN EST POSÉ — jamais avant.

    Relevé du patron : « au relâcher sur une autre position, on voit son
    ancienne position rapidement avant celle qu'on lâche ». La remise à plat
    était faite dans le gestionnaire du lâcher, à côté du `setView` : or une
    valeur animée se pose SUR-LE-CHAMP, hors du cycle de React, tandis que
    le dessin attend le rendu suivant pour se recalculer. Entre les deux, il
    restait une image du plan à son ancienne place, la couche déjà remise à
    zéro — exactement le clignotement décrit.

    L'effet de MISE EN PAGE la remet donc à plat après le commit du nouveau
    cadrage et avant que l'écran ne soit peint : les deux ne peuvent plus se
    désynchroniser, quel que soit le retard du rendu.
  */
  useLayoutEffect(() => {
    glisse.tx.setValue(0);
    glisse.ty.setValue(0);
    glisse.ech.setValue(1);
    glisse.rot.setValue(0);
  }, [view, glisse]);
  const navBase = useRef({
    v: { zoom: 1, ox: 0, oy: 0, rot: 0 },
    mode: 'pan' as 'pan' | 'pinch',
    dx0: 0,
    dy0: 0,
    d0: 1,
    mx0: 0,
    my0: 0,
    a0: 0,
  });
  /*
    LE RECALAGE, VU DU GESTE.

    Le responder de navigation n'est créé qu'UNE fois — le recréer en plein
    geste perdrait le suivi. Il ne peut donc pas lire une prop qui change :
    on lui laisse des références vives, relues à chaque image.
  */
  const recalageVif = useRef(recalage);
  recalageVif.current = recalage;
  /** La course déjà envoyée : le recalage avance par petits pas. */
  const dernierPas = useRef({ x: 0, y: 0 });
  const touchAngle = (t: { pageX: number; pageY: number }[]) =>
    Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX);
  /*
    LE REPÈRE SE REPREND SUR CE QU'ON VOIT, PAS SUR CE QUI EST RANGÉ.

    Il repartait de `viewRef.current` — la vue POSÉE DANS L'ÉTAT, qui ne se
    met à jour qu'au lâcher. Or ce repère se reprend aussi EN COURS DE
    GESTE, chaque fois que le nombre de doigts change : deux doigts ne se
    lèvent jamais à la même image, et il y a toujours un instant où il n'en
    reste qu'un. À cet instant, tout le zoom accumulé sous les doigts était
    remplacé par la vue d'avant le geste.

    `vueVive` est la vérité pendant le geste ; l'état ne la rattrape qu'à la
    fin, et c'est justement pour ça qu'on ne peut pas s'appuyer dessus
    entre-temps. À la prise, les deux sont égales — la ligne du `Grant` les
    aligne juste avant d'appeler ici.
  */
  const snapshot = (e: any, g: any) => {
    const t = e.nativeEvent.touches;
    navBase.current = {
      v: vueVive.current,
      mode: t.length >= 2 ? 'pinch' : 'pan',
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
  };
  // Pendant un déplacement du plan, les cotes sont masquées : leur recalcul
  // et leur rotation à chaque image faisaient saccader le geste.
  /** Emprise à l'écran du meuble sélectionné : zone interdite au plan. */
  const objBox = useRef<{ x: number; y: number; hw: number; hh: number } | null>(
    null,
  );
  /**
   * Le doigt est-il dans le contour de la pièce choisie ?
   *
   * On travaille en pixels d'écran : le contour est déjà projeté, et c'est
   * la seule mesure que le geste connaît.
   */
  const contourChoisi = useRef<{ x: number; y: number }[] | null>(null);
  const pieceSousLeDoigt = (e: GestureResponderEvent) => {
    const poly = contourChoisi.current;
    if (!poly || poly.length < 3) return false;
    const { locationX: x, locationY: y } = e.nativeEvent;
    let dedans = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (
        poly[i].y > y !== poly[j].y > y &&
        x <
          ((poly[j].x - poly[i].x) * (y - poly[i].y)) /
            (poly[j].y - poly[i].y) +
            poly[i].x
      ) {
        dedans = !dedans;
      }
    }
    return dedans;
  };

  /** Le glissement de la pièce : en mètres, dans le repère du monde. */
  const piece = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, g) =>
        !!onMoveRoom &&
        Math.abs(g.dx) + Math.abs(g.dy) > 4 &&
        pieceSousLeDoigt(e),
      onPanResponderGrant: () => {
        pieceDep.current = { x: 0, y: 0 };
      },
      onPanResponderMove: (_e, g) => {
        const m = mappingRef.current;
        if (!m) return;
        const dx = g.dx - pieceDep.current.x;
        const dy = g.dy - pieceDep.current.y;
        pieceDep.current = { x: g.dx, y: g.dy };
        // Écran → monde : la conversion est déjà écrite, rotation et zoom
        // compris. La réécrire ici, c'est se tromper d'un signe un jour.
        const d = m.deltaToMeters(dx, dy);
        onMoveRoom?.(d.x, d.z);
      },
    }),
  ).current;
  const pieceDep = useRef({ x: 0, y: 0 });
  /*
    LE MODE TRACE PASSE PAR UNE REFERENCE, comme tout ce que le geste lit.

    Le `PanResponder` du plan est cree UNE FOIS (`useRef`) : une valeur lue
    dans sa fermeture y reste figee a ce qu'elle valait au premier rendu.
    `tracantPiece` y serait donc eternellement `false`, et le plan
    continuerait de voler le geste — le defaut aurait ete invisible a la
    lecture et evident au doigt.
  */
  const tracantRef = useRef(tracantPiece);
  tracantRef.current = tracantPiece;

  const nav = useRef(
    PanResponder.create({
      // Ne prend la main QUE sur un mouvement : les taps (sélection de mur)
      // et les poignées de coin gardent la priorité.
      onStartShouldSetPanResponder: () => false,
      // Un geste qui COMMENCE sur le meuble sélectionné appartient au
      // meuble, jamais au plan. Sans cette exception, le plan se déplaçait
      // sous le doigt et le meuble ne bougeait pas d'un pouce.
      onMoveShouldSetPanResponder: (e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) <= 6) return false;
        /*
          PENDANT QU'ON TIRE UNE PIECE, LE PLAN NE BOUGE PAS.

          Le trace exige un GLISSEMENT — poser, glisser, lacher — et le plan
          prend la main des six pixels de mouvement. Sans cette exception, on
          promenerait le plan en croyant tirer un rectangle, et le geste
          neuf ne marcherait tout simplement pas.

          Trouve avant l'essai, en relisant qui reclame le doigt : le calque
          de POSE (un appareil de plafond) se contente d'un tap, il ne
          rencontrait donc jamais ce conflit.
        */
        if (tracantRef.current) return false;
        // Un geste qui commence DANS la pièce choisie lui appartient : il
        // la déplace au lieu de promener le plan.
        if (pieceSousLeDoigt(e)) return false;
        const b = objBox.current;
        if (b) {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (
            Math.abs(x - b.x) < b.hw + 14 &&
            Math.abs(y - b.y) < b.hh + 14
          ) {
            return false;
          }
        }
        return true;
      },
      onPanResponderGrant: (e, g) => {
        setNavigating(true);
        vueVive.current = viewRef.current;
        // Le recalage repart de zero a chaque prise : le decalage se compte
        // en petits pas, et un geste qui commence herite du precedent.
        dernierPas.current = { x: g.dx, y: g.dy };
        snapshot(e, g);
      },
      /*
        AU LÂCHER, LA VÉRITÉ — et la couche revient à zéro dans le MÊME
        rendu. Les deux se posent ensemble : si la couche se remettait à
        plat avant que le dessin ne soit recalculé, le plan sauterait à sa
        position d'avant le temps d'une image.
      */
      onPanResponderRelease: () => {
        setNavigating(false);
        setView(vueVive.current);
      },
      onPanResponderTerminate: () => {
        setNavigating(false);
        setView(vueVive.current);
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        const mode = t.length >= 2 ? 'pinch' : 'pan';
        if (mode !== navBase.current.mode) snapshot(e, g);
        const base = navBase.current;
        if (mode === 'pinch' && t.length >= 2) {
          const d = Math.max(
            8,
            Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY),
          );
          const mx = (t[0].pageX + t[1].pageX) / 2;
          const my = (t[0].pageY + t[1].pageY) / 2;
          let twist = touchAngle(t) - base.a0;
          if (twist > Math.PI) twist -= 2 * Math.PI;
          if (twist < -Math.PI) twist += 2 * Math.PI;
          /*
            LE PINCEMENT EST UNE ÉCHELLE, PAS UN RECALCUL.

            Le zoom du modèle est pris sur le CENTRE de la vue, et la
            transformation native l'est aussi : les deux coïncident, et le
            dessin déjà peint peut être agrandi tel quel. Ce que l'on pousse
            ici est le RAPPORT depuis la prise, pas le zoom absolu.
          */
          const zoom = Math.min(6, Math.max(0.4, base.v.zoom * (d / base.d0)));
          vueVive.current = {
            zoom,
            ox: base.v.ox + (mx - base.mx0),
            oy: base.v.oy + (my - base.my0),
            rot: base.v.rot + twist,
          };
          const pose = transformeDuGeste(base.v, vueVive.current);
          glisse.ech.setValue(pose.ech);
          glisse.rot.setValue(pose.rot);
          glisse.tx.setValue(pose.tx);
          glisse.ty.setValue(pose.ty);
        } else if (recalageVif.current) {
          /*
            EN RECALAGE, LE DOIGT DÉPLACE L'ÉTAGE, PAS LA VUE.

            On envoie le déplacement DEPUIS LA DERNIÈRE IMAGE, jamais
            depuis le début du geste : l'appelant applique un décalage
            cumulatif au plan, et lui renvoyer chaque fois la course totale
            ferait filer l'étage à une vitesse carrée.
          */
          const m = mappingRef.current;
          if (m) {
            const pas = m.deltaToMeters(
              g.dx - dernierPas.current.x,
              g.dy - dernierPas.current.y,
            );
            recalageVif.current(pas.x, pas.z);
          }
          dernierPas.current = { x: g.dx, y: g.dy };
        } else {
          // Le glissement : deux nombres au pilote natif, et rien d'autre.
          vueVive.current = {
            ...base.v,
            ox: base.v.ox + (g.dx - base.dx0),
            oy: base.v.oy + (g.dy - base.dy0),
          };
          const pose = transformeDuGeste(base.v, vueVive.current);
          glisse.tx.setValue(pose.tx);
          glisse.ty.setValue(pose.ty);
        }
      },
    }),
  ).current;

  // Cadrage figé sur le scan chargé (pas sur les éditions),
  // sinon le plan "respire" pendant qu'on déplace un coin.
  const baseMapping = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    return makeMapping(bounds(walls), layout.w, layout.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSaveId, layout.w, layout.h]);

  // Cadrage composite : ajustement au canevas + navigation utilisateur.
  const mapping = useMemo(() => {
    if (!baseMapping) return null;
    const cx = layout.w / 2;
    const cy = layout.h / 2;
    const cos = Math.cos(view.rot);
    const sin = Math.sin(view.rot);
    const scale = baseMapping.scale * view.zoom;
    return {
      scale,
      toPx: (p: { x: number; z: number }) => {
        const b = baseMapping.toPx(p);
        const dx = (b.x - cx) * view.zoom;
        const dy = (b.y - cy) * view.zoom;
        return {
          x: cx + dx * cos - dy * sin + view.ox,
          y: cy + dx * sin + dy * cos + view.oy,
        };
      },
      /** Déplacement écran → déplacement monde (m), rotation/zoom déduits. */
      deltaToMeters: (dx: number, dy: number) => ({
        x: (dx * cos + dy * sin) / scale,
        z: (-dx * sin + dy * cos) / scale,
      }),
      /** Point de l'écran → point du monde : sert au tracé d'un mur. */
      toMeters: (px: { x: number; y: number }) => {
        const dx = px.x - cx - view.ox;
        const dy = px.y - cy - view.oy;
        const ux = (dx * cos + dy * sin) / view.zoom + cx;
        const uy = (-dx * sin + dy * cos) / view.zoom + cy;
        return baseMapping.toMeters({ x: ux, y: uy });
      },
    };
  }, [baseMapping, view, layout]);
  /*
    LA MARGE DE LA TOILE : nulle au repos, large pendant le geste.

    Huit dixièmes de la plus grande dimension : un doigt ne traverse pas
    l'écran et demi d'un seul trait, donc son bord n'est jamais atteint. Un
    nombre ROND, arrondi au point, sinon le `viewBox` change à chaque
    fraction de pixel de mise en page.
  */
  const marge = navigating
    ? Math.round(Math.max(layout.w, layout.h) * 0.8)
    : 0;

  /** Le geste lit le cadrage courant sans se reconstruire à chaque image. */
  const mappingRef = useRef(mapping);
  mappingRef.current = mapping;


  /**
   * Niveau de détail des cotes, de 0 à 1, piloté par le zoom.
   *
   * Coter chaque retour de mur en même temps que la longueur totale
   * surchargerait le plan. On les échange donc : en dessous de 55 px/m, seule
   * la cote globale du mur s'affiche ; au-delà de 95 px/m, seuls les
   * tronçons. Entre les deux, les unes s'effacent pendant que les autres
   * apparaissent.
   */
  const detail = mapping
    ? Math.min(1, Math.max(0, (mapping.scale - 55) / 40))
    : 0;

  /**
   * Niveau de détail de l'appareillage, de 0 à 1.
   *
   * Un symbole de plan fait 22 px, quel que soit le zoom : de loin, trois
   * prises sur le même pan se chevauchent en une bouillie. En dessous de
   * 60 px/m, il ne reste donc qu'un POINT de la couleur de l'appareil — on
   * voit qu'il y a quelque chose, et combien —, et le symbole ne revient
   * qu'au-delà de 100 px/m, quand il a la place de se lire. Entre les deux,
   * l'un s'efface pendant que l'autre paraît.
   */
  const elecLod = mapping
    ? Math.min(1, Math.max(0, (mapping.scale - 60) / 40))
    : 0;

  /**
   * OÙ S'ÉCRIT CHAQUE COTE, ET LAQUELLE ON SACRIFIE.
   *
   * Deux défauts relevés sur le chantier, une seule cause : personne ne
   * regardait où tombaient les chiffres.
   *
   * 1. **Elles se superposaient.** Sur un mur en dents de scie — des retours
   *    de vingt centimètres —, trois valeurs s'écrivaient au même endroit et
   *    formaient une tache grise. Un chiffre illisible est pire qu'un
   *    chiffre absent : absent, on va le chercher ; empilé, on croit
   *    l'avoir lu. Les grandes cotes passent donc d'abord, et ce qui
   *    viendrait les recouvrir renonce — la valeur reste au métré.
   *
   * 2. **Elles s'en allaient au zoom.** Une cote se pose au milieu de son
   *    mur ; zoomé sur un angle, ce milieu est à deux écrans de là. On
   *    croyait l'app incapable de coter de près, alors que c'est justement
   *    de près qu'on lit les cotes. Chaque valeur se recale donc au milieu
   *    de la PORTION VISIBLE de son mur.
   *
   * Les deux familles — la cote globale d'un mur et celles de ses tronçons —
   * s'arbitrent ENSEMBLE, mais seulement quand elles sont réellement à
   * l'écran : pendant la bascule du zoom, l'une s'efface tandis que l'autre
   * paraît, et une cote invisible ne doit pas voler la place d'une autre.
   */
  const placementCotes = useMemo(() => {
    const vide = {
      murs: new Map<string, { x: number; y: number }>(),
      runs: new Map<string, { x: number; y: number }>(),
    };
    if (!showMeasures || !mapping || layout.w === 0) return vide;
    const items: Etiquette[] = [];
    const murs = new Map<string, { x: number; y: number }>();
    const runs = new Map<string, { x: number; y: number }>();
    const bodyPx = WALL_T * mapping.scale;
    for (const w of walls) {
      const a = mapping.toPx(w.a);
      const b = mapping.toPx(w.b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const norm = Math.hypot(dx, dy) || 1;
      let n = { x: -dy / norm, y: dx / norm };
      if (n.y > 0) n = { x: -n.x, y: -n.y };
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      if (1 - detail > 0.02) {
        const mil = milieuVisible(a, b, layout);
        if (mil) {
          const at = {
            x: mil.x + n.x * (bodyPx / 2 + 9),
            y: mil.y + n.y * (bodyPx / 2 + 9),
          };
          murs.set(w.id, at);
          items.push({
            id: `w:${w.id}`,
            at,
            taille: encombrement(
              `${segLength(w).toFixed(2)} m`.replace('.', ','),
              10,
              angle,
            ),
            // La longueur du mur départage : c'est la grande cote qu'on lit.
            poids: 1000 + segLength(w),
          });
        }
      }
      if (detail > 0.02) {
        const off = bodyPx + 9;
        wallRuns(w, openings).forEach((run, ri) => {
          if ((run.t1 - run.t0) * norm < 26) return;
          const t = (run.t0 + run.t1) / 2;
          const brut = { x: a.x + dx * t, y: a.y + dy * t };
          // Le tronçon a ses propres bouts : c'est SA portion visible qui
          // compte, pas celle du mur entier.
          const p0 = { x: a.x + dx * run.t0, y: a.y + dy * run.t0 };
          const p1 = { x: a.x + dx * run.t1, y: a.y + dy * run.t1 };
          const mil = milieuVisible(p0, p1, layout) ?? brut;
          const at = { x: mil.x + n.x * off, y: mil.y + n.y * off };
          const cle = `${w.id}#${ri}`;
          runs.set(cle, at);
          items.push({
            id: `r:${cle}`,
            at,
            taille: encombrement(
              run.length.toFixed(2).replace('.', ','),
              9.5,
              angle,
            ),
            poids: run.length,
          });
        });
      }
    }
    const gardees = cotesLisibles(items);
    for (const cle of [...murs.keys()]) {
      if (!gardees.has(`w:${cle}`)) murs.delete(cle);
    }
    for (const cle of [...runs.keys()]) {
      if (!gardees.has(`r:${cle}`)) runs.delete(cle);
    }
    return { murs, runs };
  }, [walls, openings, mapping, layout, showMeasures, detail]);

  /**
   * Retour de mur sélectionné : `{ mur, index du tronçon }`.
   *
   * Un mur percé d'une baie n'est pas un objet unique sur le chantier : il
   * est fait de retours — les bouts de maçonnerie entre l'angle et la
   * menuiserie — et c'est SUR EUX qu'on prend une cote ou qu'on décide de
   * poser une prise. Un appui bref choisit donc le retour touché, et lui
   * seul ; l'appui long garde l'ancien geste et prend le mur entier,
   * ouvertures comprises.
   */
  const [pier, setPier] = useState<{ wallId: string; i: number } | null>(null);
  useEffect(() => {
    // Le mur entier l'emporte : les deux sélections ne coexistent pas.
    if (selectedWallId || !editable) setPier(null);
  }, [selectedWallId, editable]);

  // Corps des murs : onglets calculés une fois pour tout le rendu.
  const quads = useMemo(() => wallQuads(walls), [walls]);

  /**
   * Les retours de chaque mur percé. Un mur plein n'en a pas : le toucher
   * doit continuer à prendre le mur, sans quoi on aurait rendu l'ouverture
   * du panneau plus difficile sans rien apporter.
   */
  const retours = useMemo(() => {
    const m = new Map<string, WallRun[]>();
    for (const w of walls) {
      const runs = wallRuns(w, openings);
      if (!runs.some((r) => r.kind !== 'mur')) continue;
      m.set(
        w.id,
        runs.filter((r) => r.kind === 'mur'),
      );
    }
    return m;
  }, [walls, openings]);

  /** Le quadrilatère d'un tronçon de mur, découpé dans l'onglet du mur. */
  const runQuad = (w: WallSeg, run: WallRun): Pt[] => {
    const q = quads.get(w.id);
    const lp = (a: Pt, b: Pt, t: number) => ({
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
    });
    if (q) {
      return [
        lp(q.a1, q.b1, run.t0),
        lp(q.a1, q.b1, run.t1),
        lp(q.a2, q.b2, run.t1),
        lp(q.a2, q.b2, run.t0),
      ];
    }
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * (WALL_T / 2);
    const nz = (dx / l) * (WALL_T / 2);
    const at = (t: number) => ({ x: w.a.x + dx * t, z: w.a.z + dz * t });
    const p0 = at(run.t0);
    const p1 = at(run.t1);
    return [
      { x: p0.x + nx, z: p0.z + nz },
      { x: p1.x + nx, z: p1.z + nz },
      { x: p1.x - nx, z: p1.z - nz },
      { x: p0.x - nx, z: p0.z - nz },
    ];
  };

  const pierRun =
    pier != null ? (retours.get(pier.wallId) ?? [])[pier.i] ?? null : null;
  // Le retour choisi remonte à l'écran, pour qu'on puisse y poser.
  const signalePier = useRef(onPierChange);
  signalePier.current = onPierChange;
  useEffect(() => {
    signalePier.current?.(
      pier && pierRun
        ? { wallId: pier.wallId, t0: pierRun.t0, t1: pierRun.t1 }
        : null,
    );
  }, [pier, pierRun]);
  // La trame du logement : c'est SUR ELLE que les angles s'aimantent, et
  // jamais sur les axes de l'écran — un scan commencé de biais donnerait
  // sinon des meubles de biais avec des murs droits.
  const frame = useMemo(() => planFrameAngle(walls), [walls]);
  const wallById = useMemo(
    () => new Map(walls.map((w) => [w.id, w])),
    [walls],
  );
  // Pièces du plan : chacune a son contour, son centre et sa teinte de sol.
  const parts = useMemo(() => roomParts(walls, rooms), [walls, rooms]);
  /*
    Les trous du relevé : deux bouts de mur qui se font face sans se
    toucher. On les cherche à chaque changement de murs — c'est une
    poignée de comparaisons, et le résultat décide de ce qu'on dessine.
  */
  const trous = useMemo(() => trousDuRelevé(walls), [walls]);
  /*
    Les recoins techniques : les faces closes que rien n'ouvre. Ce sont
    elles qu'on poche en noir, pour qu'aucun vide blanc ne se fasse passer
    pour une pièce.
  */
  const massifs = useMemo(
    () => massifsTechniques(walls, openings),
    [walls, openings],
  );
  /*
    De quel bout chaque porte pivote : le choix se fait sur TOUTES les
    portes à la fois, pour qu'aucune paire de battants ne se croise.
  */
  const pivots = useMemo(
    () =>
      pivotsDesBattants(
        openings.filter((o) => o.type === 'door').map((o) => ({
          id: o.id,
          a: o.a,
          b: o.b,
          // Le bord choisi à la main passe avant la mise en place
          // automatique : sinon la correction ne survit pas au rendu.
          pivot: o.pivot,
        })),
      ),
    [openings],
  );

  /**
   * Le contour à l'écran de la pièce choisie, retenu pour le geste.
   *
   * Le glissement doit savoir, au moment où le doigt se pose, s'il tombe
   * dans la pièce : il lit donc le polygone déjà projeté, sans refaire le
   * cadrage ni parcourir la scène.
   */
  contourChoisi.current = useMemo(() => {
    if (!editable || !selectedRoomId || !mapping) return null;
    const part = parts.find((p) => p.roomId === selectedRoomId);
    const pts = part?.surface?.pts;
    if (!pts || pts.length < 3) return null;
    return pts.map((p) => mapping.toPx(p));
  }, [editable, selectedRoomId, mapping, parts]);

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  // Le sol garde sa teinte neutre. Les couleurs relevées au scan ne servent
  // qu'à la vue 3D : sur un plan vu de dessus, sous le poché des murs et le
  // semis des points, elles ne se lisaient pas.
  const fillOf = useMemo(() => (_roomId: string) => c.surfaceSunken, [c]);
  const partOf = useMemo(
    () => new Map(parts.map((p) => [p.roomId, p])),
    [parts],
  );
  /**
   * Semis du sol : motif répété, calé sur l'origine du monde. Un vrai nuage
   * de points suivrait mieux la rotation, mais coûterait un millier de
   * cercles à redessiner à chaque image de déplacement — ici le pas et le
   * calage suffisent à faire lire l'échelle, pour un coût nul.
   */
  const dots = useMemo(() => {
    if (!mapping) return null;
    // Design d'ÉCRAN : le semis est fixe, il ne bouge ni au zoom ni au pan.
    return { size: 16, x: 0, y: 0 };
  }, [mapping]);

  // Coins uniques (les extrémités soudées partagent les mêmes coordonnées).
  // La clé porte la pièce : deux pièces qui se touchent gardent chacune sa
  // poignée, sinon déplacer un coin en emporterait deux.
  const corners = useMemo(() => {
    const seen = new Map<string, { x: number; z: number; wallId: string; end: 'a' | 'b' }>();
    for (const w of walls) {
      for (const end of ['a', 'b'] as const) {
        const p = w[end];
        const key = `${roomOf(w)}|${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
        if (!seen.has(key)) seen.set(key, { x: p.x, z: p.z, wallId: w.id, end });
      }
    }
    return [...seen.entries()].map(([key, v]) => ({ key, ...v }));
  }, [walls]);

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setLayout({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      {...nav.panHandlers}>
      {/*
        SANS CAP, ON PROPOSE DE L'ORIENTER — sans refaire le scan.

        Les relevés d'avant la boussole, et ceux où le magnétomètre s'est
        tu, n'ont pas d'orientation : on ne peut ni dessiner la couronne, ni
        l'inventer. Plutôt qu'un vide inexplicable, deux appuis suffisent :
        on se place face au HAUT du plan — la direction du haut de l'écran,
        que le dessin montre sans ambiguïté — et le cap du téléphone donne
        le reste. Le nord de l'écran est à la rotation du plan près : c'est
        toute la formule.
      */}
      {showNorth && north === null && layout.w > 0 && (
        <NorthBadge
          x={10}
          y={10}
          invite={invite}
          onPress={async () => {
            if (!invite) {
              setInvite(true);
              return;
            }
            setInvite(false);
            const cap = await RoomScan.heading();
            if (cap === null) {
              haptic('alerte');
              return;
            }
            const rot = (viewRef.current.rot * 180) / Math.PI;
            setNorth(((cap - rot) % 360 + 360) % 360);
            haptic('succes');
          }}
        />
      )}
      {/*
        LA ZONE QUI PREND LE GLISSEMENT DE LA PIÈCE.

        Posée SOUS le dessin (aucun pixel peint), elle ne répond qu'au
        mouvement, et seulement dans le contour de la pièce choisie : le
        reste — taper un mur, promener le plan, saisir un meuble — continue
        de fonctionner exactement pareil.
      */}
      {editable && selectedRoomId && onMoveRoom && (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
          {...piece.panHandlers}
        />
      )}
      {/*
          LA COUCHE QUI PORTE LE GESTE.

          Tout le dessin vit dessous — le SVG et les cartouches posés
          par-dessus lui. Pendant qu'on déplace le plan, c'est ELLE qui
          bouge : quatre valeurs poussées au pilote natif, aucun rendu, et
          les trois cent quarante vues du dessin restent exactement où
          elles sont. Le cadrage vrai n'est recalculé qu'au lâcher.

          `collapsable={false}` : sans lui, Android fond cette vue dans son
          parent à l'optimisation et la transformation n'a plus de support.
        */}
      {mapping && (
        <Animated.View
          collapsable={false}
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                { translateX: glisse.tx },
                { translateY: glisse.ty },
                { rotate: glisse.rot.interpolate({
                    inputRange: [-Math.PI, Math.PI],
                    outputRange: ['-180deg', '180deg'],
                  }) },
                { scale: glisse.ech },
              ],
            },
          ]}
          pointerEvents="box-none">
          {/*
            LA TOILE S'OUVRE LE TEMPS DU GESTE.

            Relevé du patron : « si le plan sort du cadre et qu'on le ramène
            au centre, il est coupé — sa partie cachée reste cachée ». C'est
            le prix de la fluidité : le dessin est calculé UNE fois, à la
            prise, et ce qui débordait alors n'a pas été peint. Le geste ne
            fait que déplacer cette toile ; la ramener fait entrer du vide.

            Elle prend donc une marge tout autour — huit dixièmes de sa plus
            grande dimension, plus qu'un doigt ne peut parcourir d'un trait —
            et son cadrage (`viewBox`) est décalé d'autant, pour que les
            coordonnées du dessin ne bougent pas d'un pixel : c'est sa
            FENÊTRE qui s'ouvre, pas le plan qui se déplace.

            Et seulement PENDANT le geste : rastériser en permanence trois
            fois la surface de l'écran pour une seconde de glissement serait
            le contraire d'une optimisation. Le rendu qui l'agrandit tombe à
            la prise du doigt, avant le premier mouvement — là où personne
            ne le voit.
          */}
          <Svg
            width={layout.w + 2 * marge}
            height={layout.h + 2 * marge}
            viewBox={`${-marge} ${-marge} ${layout.w + 2 * marge} ${
              layout.h + 2 * marge
            }`}
            style={marge ? { marginLeft: -marge, marginTop: -marge } : undefined}>
            {/* Toucher le vide désélectionne. Posé tout au fond du dessin :
                murs, meubles et cartouches gardent la priorité, et seul ce
                qui n'appartient à rien tombe ici. `transparent` et non
                `none` — une surface sans couleur n'est pas touchable. */}
            {/*
              Le fond répond MÊME HORS ÉDITION.
              Un meuble se sélectionne aussi en lecture — par sa vignette,
              ou en le touchant — et il fallait alors retoucher le meuble
              lui-même pour le lâcher : n'importe où ailleurs, rien ne se
              passait. Or « appuyer à côté », c'est le geste universel pour
              désélectionner ; il ne dépend pas d'un mode.
            */}
{/*
              ET IL RÉPOND POUR TOUT CE QUI SE SÉLECTIONNE.
              Il ne se montait que pour un meuble ; un appareil de plafond
              en réglage, lui, ne se lâchait qu'en le retouchant. Deux
              gestes contraires pour la même intention — c'est le genre
              d'incohérence qu'on n'explique pas à un compagnon.
            */}
            {(editable || selectedObjectId || selectedCeilingId) && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill="transparent"
                onPress={() => {
                  setPier(null);
                  onSelectWall(null);
                  onSelectRoom?.(null);
                  onSelectOpening?.(null);
                  onSelectObject?.(null);
                  onSelectCeiling?.(null);
                }}
              />
            )}

            {/* Surface au sol : aplat + semis de points, pour la distinguer
                d'un coup d'œil des murs pochés en noir. */}
            {showSurfaces && dots && (
              <G>
                <Defs>
                  <Pattern
                    id="floorDots"
                    x={dots.x}
                    y={dots.y}
                    width={dots.size}
                    height={dots.size}
                    patternUnits="userSpaceOnUse">
                    <Circle cx={1.1} cy={1.1} r={1.1} fill={c.inkFaint} />
                  </Pattern>
                </Defs>
                {parts.map((part) => {
                  if (!part.surface) return null;
                  const poly = part.surface.pts
                    .map((p) => {
                      const q = mapping.toPx(p);
                      return `${q.x},${q.y}`;
                    })
                    .join(' ');
                  return (
                    <G
                      key={part.roomId}
                      onPress={
                        editable && onSelectRoom
                          ? () => {
                              /*
                                TOUCHER LE SOL QUAND UN MEUBLE EST TENU,
                                C'EST LE LÂCHER — pas choisir la pièce.
                                Relevé du patron : la surface captait
                                l'appui et ouvrait le bandeau de la pièce
                                par-dessus le meuble encore tenu. Un
                                geste, un effet : le premier appui lâche,
                                le suivant prend la pièce.
                              */
                              if (selectedObjectId) {
                                onSelectObject?.(null);
                                return;
                              }
                              onSelectRoom(
                                part.roomId === selectedRoomId ? null : part.roomId,
                              );
                            }
                          : undefined
                      }>
                      <Polygon
                        points={poly}
                        fill={fillOf(part.roomId)}
                        stroke="none"
                      />
                      <Polygon points={poly} fill="url(#floorDots)" stroke="none" />
                    </G>
                  );
                })}
              </G>
            )}

            {/* Objets (empreintes au sol) */}
            {objects.map((o) => {
              const f = footprintOf(o, partOf);
              const ctr = mapping.toPx({ x: f.cx, z: f.cz });
              const w = f.width * mapping.scale;
              const d = f.depth * mapping.scale;
              return (
                <G
                  key={f.id}
                  transform={`translate(${ctr.x}, ${ctr.y}) rotate(${((f.yaw + view.rot) * 180) / Math.PI})`}>
                  {/*
                    ROUGE QUAND ON NE PEUT PAS POSER LÀ — relevé du patron.
                    Seul le meuble TENU se colore : les autres n'ont rien à
                    dire, et un plan qui rougit en entier ne désigne plus
                    rien.
                  */}
                  <Rect
                    x={-w / 2}
                    y={-d / 2}
                    width={w}
                    height={d}
                    fill={
                      poseRefusee && o.id === selectedObjectId
                        ? c.danger
                        : c.blueSoft
                    }
                    fillOpacity={
                      poseRefusee && o.id === selectedObjectId ? 0.35 : 1
                    }
                    stroke={
                      poseRefusee && o.id === selectedObjectId
                        ? c.danger
                        : o.id === selectedObjectId
                        ? c.blue
                        : c.lineStrong
                    }
                    strokeWidth={o.id === selectedObjectId ? 2.5 : 1}
                    rx={3}
                  />
                  {/*
                    UN TRAIT PAR POLYLIGNE, pas un nœud par segment.

                    Le symbole d'un lit ou d'un canapé, c'est trois ou quatre
                    lignes brisées. Elles étaient dessinées segment par
                    segment, chacun dans sa balise, groupés dans une balise
                    de plus : une quinzaine de nœuds par meuble, quand un
                    seul tracé par ligne suffit. Sur un logement meublé, ça
                    se compte en centaines — et chaque nœud se repaie à
                    chaque image quand le plan glisse sous le doigt.

                    Pendant le geste, le symbole s'efface même tout à fait :
                    on déplace un plan pour VOIR OÙ L'ON VA, la silhouette du
                    meuble suffit, et le détail revient au relâcher.
                  */}
                  {
                    furnitureStrokes(furnKind(f.category), w, d).map((line, li) => (
                      <Path
                        key={`s${li}`}
                        d={line
                          .map(
                            (p, pi) =>
                              `${pi === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
                          )
                          .join(' ')}
                        stroke={c.inkSoft}
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    ))}
                  {/* Nom du meuble : petit dedans, grandi par le zoom,
                      absent s'il ne tient pas (`nomDeMeuble`). */}
                  {
                    (() => {
                      const pose = nomDeMeuble(
                        frCategory(f.category),
                        w,
                        d,
                        f.yaw + view.rot,
                        mapping.scale,
                      );
                      if (!pose) return null;
                      return (
                        <SvgText
                          transform={`rotate(${(-(f.yaw + view.rot) * 180) / Math.PI})`}
                          x={0}
                          y={pose.taille * 0.35}
                          fill={c.inkSoft}
                          fontSize={pose.taille}
                          fontWeight="600"
                          textAnchor="middle">
                          {frCategory(f.category)}
                        </SvgText>
                      );
                    })()}
                  {/*
                    LA CIBLE DU DOIGT EST PLUS LARGE QUE LE DESSIN.

                    Relevé du patron : « le clic sur un meuble est
                    capricieux, il faut parfois cliquer plusieurs fois et
                    viser des endroits précis ». La cible était le DESSIN
                    lui-même — l'aplat et les traits du symbole. Un aplat de
                    quarante-cinq centimètres au cinquantième fait neuf
                    millimètres à l'écran, moins que la pulpe d'un doigt, et
                    les traits du symbole ne répondent que sur le trait.

                    Elle est POSÉE EN DERNIER, donc au-dessus de tout ce que
                    le meuble dessine : plus rien ne peut lui voler l'appui.
                    Invisible, elle ne change pas le plan d'un pixel.
                  */}
                  <Rect
                    accessibilityLabel={`Meuble ${frCategory(f.category)}`}
                    x={-w / 2 - PRISE_MARGE}
                    y={-d / 2 - PRISE_MARGE}
                    width={w + PRISE_MARGE * 2}
                    height={d + PRISE_MARGE * 2}
                    fill="transparent"
                    onPress={
                      onSelectObject
                        ? () =>
                            onSelectObject(
                              o.id === selectedObjectId ? null : o.id,
                            )
                        : undefined
                    }
                  />
                </G>
              );
            })}

            {/* Voile d'estompage : quand un mur est sélectionné, tout le
                reste passe en retrait pour qu'on ne lise plus que lui. */}
            {selectedWallId && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill={c.surface}
                opacity={0.72}
                pointerEvents="none"
              />
            )}

            {/*
              LES RECOINS TECHNIQUES, POCHÉS COMME DE LA MAÇONNERIE.

              Relevé du patron : « quand il y a 4 murs qui encerclent un
              recoin vide, il doit être rempli de noir pour ne pas confondre
              avec une pièce ». Un vide blanc au milieu d'un plan se lit
              comme une pièce qu'on aurait oublié de nommer — alors que
              c'est du plein : une gaine, un coffre, l'épaisseur entre deux
              cloisons. On ne s'y pose rien et on n'y perce pas.

              Ils passent SOUS les murs : leur poché rejoint celui de la
              maçonnerie sans jamais mordre sur ses arêtes.
            */}
            {massifs.map((contour, i) => (
              <Polygon
                key={`massif-${i}`}
                points={contour
                  .map((p) => mapping.toPx(p))
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')}
                fill={c.ink}
              />
            ))}

            {/*
              LE NIVEAU DU DESSOUS, EN TRANSPARENCE.

              Il passe sous tout le reste — c'est un repère, pas un plan :
              on s'en sert pour poser l'étage d'aplomb au-dessus, la cage
              d'escalier en face de la cage d'escalier. Un simple trait
              d'axe suffit ; le poché du bas donnerait deux plans mêlés au
              lieu d'un plan et de son ombre.
            */}
            {(filigrane ?? []).map((w) => {
              const a = mapping.toPx(w.a);
              const b = mapping.toPx(w.b);
              return (
                <Line
                  key={`sous-${w.id}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={c.ink}
                  strokeOpacity={0.16}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Murs : corps poché aux jonctions d'onglet */}
            {walls.map((w) => (
              <WallBody
                key={w.id}
                wall={w}
                quad={quads.get(w.id)}
                mapping={mapping}
                /* Une piece qu'on vient de poser et qu'on n'a pas encore
                   lachee : son trait reste ouvert. Voir `WallBody`. */
                neuve={!!roomById.get(roomOf(w) ?? '')?.neuve}
                showMeasure={placementCotes.murs.has(w.id)}
                measureAt={placementCotes.murs.get(w.id)}
                measureOpacity={1 - detail}
                selected={editable && w.id === selectedWallId}
                onPress={
                  editable
                    ? () => onSelectWall(w.id === selectedWallId ? null : w.id)
                    : undefined
                }
              />
            ))}

            {/* Les retours d'un mur percé, chacun touchable pour lui-même.
                Une zone invisible par tronçon : c'est le dessin qui répond
                « lequel », plutôt qu'un calcul de coordonnées sur un plan
                qu'on peut avoir tourné et zoomé. */}
            {/*
              LE TROU QUE LE SCAN A LAISSÉ — montré, et comblé d'un appui.

              Relevé du chantier : « le scan n'a pas su capter une porte, je
              me suis retrouvé avec deux murs séparés, et impossible de les
              joindre ». Le manque était invisible : deux bouts de mur qui
              ne se touchent pas se lisent comme un couloir, pas comme un
              défaut. Un tireté rouge le désigne, et la pastille le comble.
            */}
            {editable &&
              trous.map((t, i) => {
                const p0 = mapping.toPx(t.a);
                const p1 = mapping.toPx(t.b);
                return (
                  <Line
                    key={`trou-${i}`}
                    x1={p0.x}
                    y1={p0.y}
                    x2={p1.x}
                    y2={p1.y}
                    stroke={c.danger}
                    strokeWidth={2.4}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                );
              })}

            {editable &&
              walls.map((w) =>
                (retours.get(w.id) ?? []).map((run, ri) => {
                  const pts = runQuad(w, run)
                    .map((p) => mapping.toPx(p))
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ');
                  return (
                    <Polygon
                      key={`pier-hit-${w.id}-${ri}`}
                      points={pts}
                      fill="transparent"
                      stroke="transparent"
                      // 18 px de halo débordaient de NEUF pixels dans la
                      // pièce : un meuble plaqué contre le mur tombait
                      // dedans, et c'est le mur qui se sélectionnait. Le
                      // retour se vise sur sa maçonnerie, pas au large.
                      strokeWidth={6}
                      onPress={() => {
                        onSelectWall(null);
                        onSelectOpening?.(null);
                        onSelectObject?.(null);
                        setPier({ wallId: w.id, i: ri });
                      }}
                      /*
                        NEUF CENTS MILLISECONDES, C'EST TROP LONG.

                        Le doigt bouge toujours un peu sur un écran, et le
                        moindre glissement annule l'appui : à ce régime, on
                        réussit une fois sur trois. Un tiers de seconde suffit
                        à distinguer un appui d'un tap, et c'est ce que font
                        les applications de plan.
                      */
                      delayLongPress={320}
                      onLongPress={() => {
                        setPier(null);
                        onSelectWall(w.id);
                      }}
                    />
                  );
                }),
              )}

            {/* Le retour choisi : lui seul se colore, pour qu'on voie bien
                que la sélection s'arrête au bout de la maçonnerie. */}
            {pierRun &&
              (() => {
                const w = walls.find((x) => x.id === pier?.wallId);
                if (!w) return null;
                const pxs = runQuad(w, pierRun).map((p) => mapping.toPx(p));
                const A = mapping.toPx(w.a);
                const B = mapping.toPx(w.b);
                const dx = B.x - A.x;
                const dy = B.y - A.y;
                const norm = Math.hypot(dx, dy) || 1;
                let n = { x: -dy / norm, y: dx / norm };
                if (n.y > 0) n = { x: -n.x, y: -n.y };
                const t = (pierRun.t0 + pierRun.t1) / 2;
                const off = WALL_T * mapping.scale + 10;
                const lx = A.x + dx * t + n.x * off;
                const ly = A.y + dy * t + n.y * off;
                let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                if (angle > 90) angle -= 180;
                if (angle < -90) angle += 180;
                return (
                  <G>
                    <Polygon
                      points={pxs.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={c.blue}
                      stroke="none"
                    />
                    <SvgText
                      x={lx}
                      y={ly + 3}
                      fill={c.blue}
                      fontSize={10}
                      fontWeight="800"
                      textAnchor="middle"
                      transform={`rotate(${angle}, ${lx}, ${ly})`}>
                      {`${pierRun.length.toFixed(2).replace('.', ',')} m`}
                    </SvgText>
                  </G>
                );
              })()}

            {/* Le mur sélectionné repasse au-dessus du voile, bien lisible. */}
            {selectedWallId &&
              (() => {
                const w = walls.find((x) => x.id === selectedWallId);
                if (!w) return null;
                return (
                  <WallBody
                    wall={w}
                    quad={quads.get(w.id)}
                    mapping={mapping}
                    showMeasure
                    selected
                    onPress={editable ? () => onSelectWall(null) : undefined}
                  />
                );
              })()}


            {/* Les punaises de photo : posées sur le mur, tournées vers la
                pièce. Une vignette serait illisible à cette échelle et
                cacherait le plan ; le repère dit qu'il y a une photo, le
                toucher l'ouvre. */}
            {photos?.map((ph) => {
              const w = wallById.get(ph.wallId);
              if (!w) return null;
              const face = wallFace(w, quads.get(w.id), interiorSide(w, walls));
              const p = facePoint(face, faceX(face, ph.along), 0.14);
              const q = mapping.toPx(p);
              return (
                <G key={`photo-${ph.id}`} onPress={() => onSelectPhoto?.(ph.id)}>
                  <Circle cx={q.x} cy={q.y} r={11} fill="transparent" />
                  <Rect
                    x={q.x - 8}
                    y={q.y - 7}
                    width={16}
                    height={14}
                    rx={3}
                    fill={c.surface}
                    stroke={c.ink}
                    strokeWidth={1.3}
                  />
                  <Circle
                    cx={q.x}
                    cy={q.y}
                    r={3.2}
                    fill="none"
                    stroke={c.ink}
                    strokeWidth={1.3}
                  />
                </G>
              );
            })}

            {/*
              LES POINTS CARDINAUX, tout autour du plan.

              Le mur qui touche le N est le mur nord : c'est le nom que
              porteront aussi l'établi et le dossier imprimé. Le calcul de
              l'angle appartient à la vue — ici la rotation du plan —, le
              dessin est commun avec la 3D.
            */}
            {showNorth && north !== null && (
              <CardinalRing
                w={layout.w}
                h={layout.h}
                angleOf={(deg) =>
                  northScreenAngle(north, view.rot) + (deg * Math.PI) / 180
                }
              />
            )}

            {/* Dégagements du meuble sélectionné : ce qui le sépare des
                murs, sur ses quatre côtés. Les cotes LONGENT le meuble —
                elles partent du milieu de chaque côté, perpendiculairement,
                et tournent avec lui puisqu'elles sont calculées dans le
                monde, pas à l'écran. */}
            {selectedObjectId &&
              showFurniture &&
              showObjectDims &&
              (() => {
                const o = allObjects.find((x) => x.id === selectedObjectId);
                if (!o) return null;
                const f = footprintOf(o, partOf);
                const murs = partOf.get(roomOf(o))?.walls ?? walls;
                const cos = Math.cos(f.yaw);
                const sin = Math.sin(f.yaw);
                // Les quatre normales sortantes, dans le repère du meuble.
                const cotes = [
                  { d: { x: cos, z: sin }, demi: f.width / 2 },
                  { d: { x: -cos, z: -sin }, demi: f.width / 2 },
                  { d: { x: -sin, z: cos }, demi: f.depth / 2 },
                  { d: { x: sin, z: -cos }, demi: f.depth / 2 },
                ];
                return (
                  <G>
                    {cotes.map(({ d, demi }, ci) => {
                      const from = {
                        x: f.cx + d.x * demi,
                        z: f.cz + d.z * demi,
                      };
                      const gap = castToWall(from, d, murs);
                      // Ni collé, ni à l'autre bout du logement : au-delà de
                      // 4 m, ce n'est plus un dégagement, c'est du vide.
                      if (gap === null || gap < 0.02 || gap > 4) return null;
                      const to = {
                        x: from.x + d.x * gap,
                        z: from.z + d.z * gap,
                      };
                      const A = mapping.toPx(from);
                      const B = mapping.toPx(to);
                      const len = Math.hypot(B.x - A.x, B.y - A.y);
                      if (len < 18) return null;
                      let angle =
                        (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
                      if (angle > 90) angle -= 180;
                      if (angle < -90) angle += 180;
                      const mx = (A.x + B.x) / 2;
                      const my = (A.y + B.y) / 2;
                      const texte =
                        gap < 1
                          ? `${Math.round(gap * 100)}`
                          : gap.toFixed(2).replace('.', ',');
                      return (
                        <G key={ci}>
                          <Line
                            x1={A.x}
                            y1={A.y}
                            x2={B.x}
                            y2={B.y}
                            stroke={c.blue}
                            strokeWidth={1}
                            strokeDasharray="3 3"
                          />
                          <Circle cx={A.x} cy={A.y} r={2} fill={c.blue} />
                          <Circle cx={B.x} cy={B.y} r={2} fill={c.blue} />
                          <Rect
                            x={mx - (texte.length * 3.6 + 7)}
                            y={my - 8}
                            width={texte.length * 7.2 + 14}
                            height={16}
                            rx={5}
                            fill={c.surface}
                            opacity={0.94}
                            transform={`rotate(${angle}, ${mx}, ${my})`}
                          />
                          <SvgText
                            x={mx}
                            y={my + 3.5}
                            fill={c.blue}
                            fontSize={10}
                            fontWeight="800"
                            textAnchor="middle"
                            transform={`rotate(${angle}, ${mx}, ${my})`}>
                            {texte}
                          </SvgText>
                        </G>
                      );
                    })}
                  </G>
                );
              })()}

            {/* Cotes de détail : retour de mur, baie, retour de mur. Elles
                n'apparaissent qu'une fois le plan assez zoomé pour les lire. */}
            {showMeasures && detail > 0.02 &&
              walls.map((w) =>
                wallRuns(w, openings).map((run, ri) => {
                  const A = mapping.toPx(w.a);
                  const B = mapping.toPx(w.b);
                  const dx = B.x - A.x;
                  const dy = B.y - A.y;
                  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                  if (angle > 90) angle -= 180;
                  if (angle < -90) angle += 180;
                  // Où elle s'écrit — et si elle s'écrit : le placement a
                  // déjà tranché, valeur par valeur.
                  const pose = placementCotes.runs.get(`${w.id}#${ri}`);
                  if (!pose) return null;
                  const px = pose.x;
                  const py = pose.y;
                  return (
                    <SvgText
                      key={`run-${w.id}-${ri}`}
                      x={px}
                      y={py + 3}
                      fill={run.kind === 'mur' ? c.inkSoft : c.blue}
                      fontSize={9.5}
                      fontWeight="700"
                      opacity={detail}
                      textAnchor="middle"
                      transform={`rotate(${angle}, ${px}, ${py})`}>
                      {run.length.toFixed(2).replace('.', ',')}
                    </SvgText>
                  );
                }),
              )}

            {/* Portes / fenêtres : trouée dans le mur, puis trait de repérage */}
            {openings.map((o) => {
              const dx = o.b.x - o.a.x;
              const dz = o.b.z - o.a.z;
              const len = Math.hypot(dx, dz) || 1;
              /*
                LA TROUÉE FAIT L'ÉPAISSEUR DU MUR, À UN CHEVEU PRÈS.

                Elle en faisait trois centimètres de plus DE CHAQUE CÔTÉ —
                seize pour un mur de dix. Ce débord, rempli d'une couleur
                pleine pour effacer le poché, formait un liseré clair tout
                autour de chaque porte et de chaque fenêtre : sur le plan, ça
                se lit comme un fond blanc collé à la menuiserie.

                Le cheveu, lui, reste nécessaire : sans lui, l'anticrénelage
                laisse un trait de poché résiduel en travers de la baie.
              */
              const nx = (-dz / len) * (WALL_T / 2 + 0.004);
              const nz = (dx / len) * (WALL_T / 2 + 0.004);
              const slot = [
                { x: o.a.x + nx, z: o.a.z + nz },
                { x: o.b.x + nx, z: o.b.z + nz },
                { x: o.b.x - nx, z: o.b.z - nz },
                { x: o.a.x - nx, z: o.a.z - nz },
              ].map((p) => mapping.toPx(p));
              const a = mapping.toPx(o.a);
              const b = mapping.toPx(o.b);
              const color = colorOpenings
                ? o.type === 'door'
                  ? c.amber
                  : c.sky
                : c.inkFaint;
              const choisie = o.id === selectedOpeningId;
              /*
                OÙ S'OUVRE LE VANTAIL : vers la pièce, jamais vers le mur.

                Le pivot se met du côté du dormant le plus proche d'un angle
                — c'est ainsi qu'on pose une porte, pour que le battant se
                range contre le mur. Faute de mieux, le premier bout fait
                l'affaire : ce qui compte, c'est le SENS d'ouverture.
              */
              const battant = (() => {
                if (o.type !== 'door') return null;
                const ancre = partOf.get(roomOf(o))?.labelAt;
                if (!ancre) return null;
                const dedans = mapping.toPx(ancre);
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const ex = b.x - a.x;
                const ey = b.y - a.y;
                const r = Math.hypot(ex, ey);
                if (r < 6) return null;
                // La normale écran tournée vers l'intérieur de la pièce.
                let n = { x: -ey / r, y: ex / r };
                if ((dedans.x - mx) * n.x + (dedans.y - my) * n.y < 0) {
                  n = { x: -n.x, y: -n.y };
                }
                // Une porte qui ouvre vers l'AUTRE pièce : le vantail
                // bascule de l'autre côté du dormant. Fréquent sur un
                // placard, un cellier, une porte palière.
                if (o.versExterieur) n = { x: -n.x, y: -n.y };
                /*
                  LE PIVOT N'EST PLUS LE PREMIER BOUT VENU.

                  Il l'était : celui que le scan avait livré en premier. Deux
                  portes voisines tombant du même côté, leurs quarts de
                  cercle se croisaient — le plan racontait un contact qui
                  n'existe pas. `pivotsDesBattants` les range dos à dos.
                */
                const cote = pivots.get(o.id) === 'b' ? b : a;
                const opp = cote === a ? b : a;
                const pivot = cote;
                const bout = { x: pivot.x + n.x * r, y: pivot.y + n.y * r };
                // Sens de l'arc : celui qui ramène le battant sur le dormant.
                const ax = opp.x - pivot.x;
                const ay = opp.y - pivot.y;
                const croix = n.x * ay - n.y * ax;
                return { pivot, bout, autre: opp, r, sens: croix > 0 ? 1 : 0 };
              })();
              return (
                <G
                  key={o.id}
                  onPress={
                    editable && onSelectOpening
                      ? () => onSelectOpening(choisie ? null : o.id)
                      : undefined
                  }>
                  {/* Cible tactile : une menuiserie fait 3 px d'épaisseur. */}
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={26}
                  />
                  <Polygon
                    points={slot.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill={showSurfaces ? fillOf(roomOf(o)) : c.surface}
                    stroke="none"
                  />
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={choisie ? c.blue : color}
                    strokeWidth={choisie ? 5 : 3}
                    strokeLinecap="butt"
                  />
                  {/*
                    LE VANTAIL ET SON ARC.

                    Une porte, sur un plan, ce n'est pas un trait dans un
                    mur : c'est un battant et le quart de cercle qu'il
                    balaie. C'est ce qui dit de quel côté elle s'ouvre — donc
                    où l'on peut poser un interrupteur, et où rien ne doit
                    traîner. Tous les plans du métier le dessinent ; le nôtre
                    ne le faisait pas.
                  */}
                  {o.type === 'door' && battant && (
                    <Path
                      d={`M ${battant.pivot.x} ${battant.pivot.y} L ${battant.bout.x} ${battant.bout.y} A ${battant.r} ${battant.r} 0 0 ${battant.sens} ${battant.autre.x} ${battant.autre.y}`}
                      fill="none"
                      stroke={choisie ? c.blue : color}
                      strokeWidth={1.2}
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  )}
                </G>
              );
            })}

            <CeilingLayer
              ceiling={ceiling}
              showCeiling={showCeiling}
              selectedCeilingId={selectedCeilingId}
              selectedCeilingRow={selectedCeilingRow}
              /* Le bouton « Cotes » vaut aussi pour le plafond : les écarts
                 d'une ligne de spots s'y lisent comme ceux d'un mur. */
              showMeasures={showMeasures}
              onSelectCeiling={onSelectCeiling}
              fixtures={showFixtures ? fixtures : VIDE}
              walls={walls}
              quads={quads}
              partOf={partOf}
              mapping={mapping}
              frame={frame}
              c={c}
            />

            {/* Les gaines : un filet tireté qui longe les murs, du tableau
                à chaque appareil. Il passe SOUS les symboles — c'est un
                cheminement, pas une annotation — et son tracé est celui du
                métré porté au devis, pas une illustration. */}
            {cableRoutes?.map((r) => (
              <Polyline
                key={`gaine-${r.id}`}
                points={r.path
                  .map((p) => {
                    const q = mapping.toPx(p);
                    return `${q.x},${q.y}`;
                  })
                  .join(' ')}
                fill="none"
                // La teinte du circuit, celle-là même que porte le schéma du
                // PDF : on suit un tracé à l'œil avant de lire son repère.
                stroke={
                  circuitMarks?.get(r.id)
                    ? markColor(circuitMarks.get(r.id)!)
                    : c.blue
                }
                strokeWidth={1.6}
                strokeDasharray="7 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.75}
              />
            ))}
            <FixtureLayer
              fixtures={showFixtures ? fixtures : VIDE}
              circuitMarks={circuitMarks}
              walls={walls}
              quads={quads}
              mapping={mapping}
              viewRot={view.rot}
              elecLod={elecLod}
              navigating={false}
              onSelectFixture={onSelectFixture}
              c={c}
            />

            {/* Cartouche par pièce : nom encadré et surface au sol.
                Chacun esquive les meubles de sa pièce pour rester lisible.
                Il s'efface pendant qu'on règle un appareil de plafond : le
                cartouche tombe au CENTRE de la pièce, c'est-à-dire là où se
                pose un point lumineux. */}
            {(selectedCeilingId ? [] : parts).map((part) => {
              const roomName = roomById.get(part.roomId)?.name ?? '';
              /*
                « SURFACES » COMMANDE LE CARTOUCHE ENTIER — nom compris.

                La surface en a été DÉTACHÉE un temps, et pour une bonne
                raison d'alors : le calque allume aussi le semis coloré des
                sols. On voulait donc la surface, et l'on obtenait un plan
                barbouillé ; ou un plan propre, et pas de surface.

                Relevé du patron : « fais en sorte que Surfaces affiche et
                cache le nom des pièces aussi ». Le calque redevient donc ce
                que son nom dit — tout ce qui parle de la surface d'une
                pièce, son NOM compris, puisque les deux vivent dans le même
                cartouche et qu'on ne coupe pas un cartouche en deux. Qui
                veut un plan nu l'a d'un geste ; qui veut les pièces nommées
                les rallume du même.
              */
              const areaText = part.surface
                ? `${part.surface.exact ? '' : '≈ '}${part.surface.area
                    .toFixed(1)
                    .replace('.', ',')} m²`
                : null;
              /*
                EN ÉDITION, LE CARTOUCHE RESTE QUOI QU'IL ARRIVE.

                C'est par lui qu'on nomme une pièce — même quand elle n'a
                encore ni nom ni surface, et même calque éteint : un réglage
                d'AFFICHAGE ne doit jamais retirer un outil de travail.
              */
              if (!editable && !showSurfaces) return null;
              if (roomName === '' && !areaText && !editable) return null;
              const foots = objects
                .filter((o) => roomOf(o) === part.roomId)
                .map((o) => footprintOf(o, partOf));
              const placeholder = roomName === '' && !areaText ? 'Nommer' : '';
              // Cotes hors-tout : ce que cherche un artisan avant tout.
              const extText =
                showMeasures && part.surface
                  ? (() => {
                      const e = roomExtent(part.surface.pts);
                      return `${e.width.toFixed(2).replace('.', ',')} × ${e.depth
                        .toFixed(2)
                        .replace('.', ',')} m`;
                    })()
                  : null;
              // Le cartouche se compose LIGNE PAR LIGNE, et sa hauteur se
              // déduit d'elles : à hauteur fixe, la dernière ligne finissait
              // collée au bord pendant que le titre gardait son air. Une
              // boîte qui n'a pas la même marge en haut et en bas se voit,
              // même quand on ne saurait pas dire pourquoi.
              const lignes: {
                t: string;
                size: number;
                fill: string;
                bold: boolean;
              }[] = [];
              // Un constat de conformité sur cette pièce : un point ambre
              // devant son nom. Discret, mais là où l'on regarde.
              if (roomName !== '') {
                lignes.push({
                  t: roomName,
                  size: 11,
                  fill:
                    selectedRoomId === part.roomId && editable ? c.blue : c.ink,
                  bold: true,
                });
              }
              if (areaText) {
                lignes.push({
                  t: areaText,
                  size: roomName !== '' ? 10 : 11,
                  fill: roomName !== '' ? c.inkSoft : c.ink,
                  bold: roomName === '',
                });
              }
              if (extText) {
                lignes.push({ t: extText, size: 9, fill: c.inkFaint, bold: false });
              }
              if (placeholder !== '' && lignes.length === 0) {
                lignes.push({ t: placeholder, size: 11, fill: c.inkFaint, bold: true });
              }
              // Le cartouche SERRE son texte, et son fond est OPAQUE, comme
              // sur le PDF : translucide, il se faisait traverser par les
              // meubles. Le sol qu'il annote reste accessible autrement — il
              // s'efface pendant le réglage d'un appareil de plafond, et il
              // esquive les meubles de sa pièce.
              const PAD = 5;
              const LH = 14;
              const hpx = PAD * 2 + lignes.length * LH;
              const wpx = Math.max(
                50,
                Math.max(...lignes.map((l) => l.t.length * (l.size * 0.62))) + 14,
              );
              const labelW = wpx / mapping.scale;
              const labelH = hpx / mapping.scale;
              /*
                LES OBSTACLES DU CARTOUCHE : les meubles, ET les appareils
                du plafond — relevé du patron : après l'ajout d'une ligne
                de spots, le nom se posait SUR un spot.
              */
              const obstacles = [
                ...foots.map((f) => ({
                  x: f.cx,
                  z: f.cz,
                  rx: f.width / 2,
                  rz: f.depth / 2,
                })),
                ...(showCeiling ? ceiling ?? [] : []).map((sp) => ({
                  x: sp.at.x,
                  z: sp.at.z,
                  rx: 0.3,
                  rz: 0.3,
                })),
              ];
              const collides = (pt: Pt) =>
                cartoucheHeurte(pt, labelW / 2, labelH / 2, obstacles);
              // Point le plus au large de la pièce : jamais dans un mur ni
              // collé à un. On s'en écarte juste assez pour éviter un meuble.
              const ctr = part.labelAt;
              let pos = ctr;
              for (const [ox, oz] of [
                [0, 0],
                [0, 0.4],
                [0, -0.4],
                [0.5, 0],
                [-0.5, 0],
                [0, 0.8],
                [0, -0.8],
              ]) {
                const cand = { x: ctr.x + ox, z: ctr.z + oz };
                if (!collides(cand)) {
                  pos = cand;
                  break;
                }
              }
              const p = mapping.toPx(pos);
              const selected = editable && part.roomId === selectedRoomId;
              return (
                <G
                  key={`label-${part.roomId}`}
                  // En édition, le cartouche EST le bouton de renommage :
                  // on touche le nom là où il s'affiche.
                  onPress={
                    editable
                      ? () => {
                          // Toucher le sol, c'est quitter le meuble.
                          onSelectObject?.(null);
                          onSelectRoom?.(part.roomId);
                          onEditRoomName?.(part.roomId);
                        }
                      : undefined
                  }>
                  <Rect
                    x={p.x - wpx / 2}
                    y={p.y - hpx / 2}
                    width={wpx}
                    height={hpx}
                    rx={5}
                    fill={c.surface}
                    /*
                      LE FOND LAISSE VOIR — relevé du patron. Il a été
                      opaque (les meubles le traversaient) ; maintenant que
                      le cartouche ESQUIVE meubles et spots, la
                      transparence ne coûte plus la lisibilité, et ce qui
                      passe dessous reste deviné.
                    */
                    fillOpacity={0.85}
                    stroke={selected ? c.blue : c.lineStrong}
                    strokeWidth={selected ? 2 : 1}
                  />
                  {/* Le point ambre de conformité a vécu ici — relevé du
                      patron : rien sur le nom de la pièce. Les constats se
                      lisent dans le dossier, où ils se chiffrent. */}
                  {lignes.map((l, li) => (
                    <SvgText
                      key={li}
                      x={p.x}
                      y={p.y - hpx / 2 + PAD + li * LH + LH / 2 + l.size * 0.35}
                      fill={l.fill}
                      fontSize={l.size}
                      fontWeight={l.bold ? '700' : '600'}
                      textAnchor="middle">
                      {l.t}
                    </SvgText>
                  ))}
                </G>
              );
            })}
            {/* LES MOTS ÉCRITS SUR LE PLAN, par-dessus le reste : une
                remarque à moitié cachée sous un canapé n'est pas une
                remarque. */}
            {!!notes?.length && (
              <NotesLayer
                notes={notes}
                mapping={mapping}
                niveau={niveauCourant}
                selectedId={selectedNoteId ?? null}
                onSelect={onSelectNote}
                c={c}
              />
            )}
            {/* Le calque de capture : au-dessus de TOUT, et seulement
                pendant une pose. */}
            {/*
              LE CALQUE QUI TIRE UNE PIECE.

              Il vit au-dessus de tout, comme celui de la pose : on tire un
              rectangle sur le plan sans risquer d'attraper un mur ou un
              meuble en chemin. Il ne s'allume que quand on l'a demande.
            */}
            {tracantPiece && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill="transparent"
                accessibilityLabel="Tirer une piece"
                onPressIn={(e) => {
                  const { locationX, locationY } = e.nativeEvent;
                  /*
                    LES DEUX COINS SE COLLENT AUX MURS QUI SONT LA.

                    Sans aide, tomber sur un mur existant releve de la
                    chance : la reprise se joue a douze centimetres, deux
                    pixels sur un plan dezoome. L'aimant a la MEME portee que
                    la reprise — sinon il collerait la ou le magasin ne
                    reconnait plus rien, et l'on doublerait le mur.
                  */
                  const p = aimanterCoin(
                    mapping.toMeters({ x: locationX, y: locationY }),
                    walls,
                  );
                  setTirage({ a: p, b: p });
                }}
                onResponderMove={(e) => {
                  const { locationX, locationY } = e.nativeEvent;
                  const p = aimanterCoin(
                    mapping.toMeters({ x: locationX, y: locationY }),
                    walls,
                  );
                  setTirage((t) => (t ? { a: t.a, b: p } : t));
                }}
                onPressOut={() => {
                  const t = tirage;
                  setTirage(null);
                  if (t) onTracerPiece?.(t.a, t.b);
                }}
              />
            )}
            {/*
              CE QU'ON EST EN TRAIN DE TIRER — et ses cotes, en direct.

              Sans elles, on tire a l'aveugle et l'on corrige apres coup :
              c'est precisement ce que le geste doit eviter.
            */}
            {tirage &&
              (() => {
                const p1 = mapping.toPx(tirage.a);
                const p2 = mapping.toPx(tirage.b);
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w2 = Math.abs(p2.x - p1.x);
                const h2 = Math.abs(p2.y - p1.y);
                const lm = Math.abs(tirage.b.x - tirage.a.x);
                const pm = Math.abs(tirage.b.z - tirage.a.z);
                const cote = (v: number) =>
                  `${v.toFixed(2).replace('.', ',')} m`;
                return (
                  <G pointerEvents="none">
                    <Rect
                      x={x}
                      y={y}
                      width={w2}
                      height={h2}
                      fill={c.blue}
                      fillOpacity={0.12}
                      stroke={c.blue}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                    <SvgText
                      x={x + w2 / 2}
                      y={y - 6}
                      fill={c.blue}
                      fontSize={12}
                      fontWeight="700"
                      textAnchor="middle">
                      {cote(lm)}
                    </SvgText>
                    <SvgText
                      x={x - 8}
                      y={y + h2 / 2}
                      fill={c.blue}
                      fontSize={12}
                      fontWeight="700"
                      textAnchor="end">
                      {cote(pm)}
                    </SvgText>
                  </G>
                );
              })()}
            {placing && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill="transparent"
                onPress={(e) => {
                  const { locationX, locationY } = e.nativeEvent;
                  onPlaceAt?.(
                    mapping.toMeters({ x: locationX, y: locationY }),
                  );
                }}
              />
            )}
          </Svg>

          {/* La poignée de l'appareil de plafond choisi : hors du SVG, comme
              celle d'un meuble — un PanResponder ne vit pas dans un tracé. */}
          {selectedCeilingId &&
            (() => {
              const cl = (ceiling ?? []).find((x) => x.id === selectedCeilingId);
              if (!cl) return null;
              const q = mapping.toPx(cl.at);
              return (
                <CeilingDragHandle
                  id={cl.id}
                  center={q}
                  rayon={Math.max(9, Math.min(15, mapping.scale * 0.14))}
                  mapping={mapping}
                  at={cl.at}
                  onTap={() => onSelectCeiling?.(cl.id)}
                />
              );
            })()}

          {/* Meuble sélectionné : poignée de déplacement + bouton supprimer */}
          {/* Le meuble sélectionné : toute son emprise se glisse, sa croix
              et sa poignée de rotation flottent HORS de lui.

              Une poignée de 44 px au centre ne suffisait pas : dès qu'on
              posait le doigt à côté du centre — c'est-à-dire presque
              partout sur un lit —, c'était le plan qui se déplaçait. */}
          {selectedObjectId &&
            showFurniture &&
            (() => {
              const o = allObjects.find((x) => x.id === selectedObjectId);
              if (!o) return null;
              const f = footprintOf(o, partOf);
              const p = mapping.toPx({ x: f.cx, z: f.cz });
              // Boîte écran du rectangle tourné : c'est elle qu'on empoigne.
              const ang = f.yaw + view.rot;
              const cw = Math.abs(Math.cos(ang));
              const sw = Math.abs(Math.sin(ang));
              const w = f.width * mapping.scale;
              const d = f.depth * mapping.scale;
              // Marge de 10 px autour de l'emprise : le doigt tombe rarement
              // pile dessus, et rater la poignée déplaçait le plan.
              const hw = Math.max(28, (w * cw + d * sw) / 2 + 10);
              const hh = Math.max(28, (w * sw + d * cw) / 2 + 10);
              objBox.current = { x: p.x, y: p.y, hw, hh };
              /*
                LES COMMANDES SUIVENT LE MEUBLE, ET RIEN D'AUTRE.

                Elles étaient bornées au cadre du plan : dès que le meuble
                approchait d'un bord, elles s'en détachaient et restaient
                plantées au milieu de l'écran — la croix rouge se retrouvait
                sur un AUTRE meuble, et l'on supprimait celui qu'on ne
                regardait pas. Elles se posent maintenant à huit points de
                son contour, et elles s'en vont avec lui.

                Trois pastilles en rangée, centrées sur le meuble : pivoter,
                coter, retirer. La suppression est la dernière — c'est le
                geste qu'on ne rattrape pas, il ne doit pas tomber sous le
                pouce par hasard.
              */
              const ECART = 42;
              const rangeeW = ECART * 2;
              // Au-dessus du contour ; en dessous s'il n'y a pas la place —
              // le meuble reste visible, ses commandes doivent l'être aussi.
              /*
                Et elle laisse la place aux poignées quand elles sont là :
                posée à vingt-six points, la rangée mordait sur la poignée du
                bord haut — deux cibles superposées, dont on ne sait laquelle
                répondra.
              */
              const RECUL = showObjectDims ? 44 : 26;
              const dessus = p.y - hh - RECUL > 4;
              const by = dessus ? p.y - hh - RECUL : p.y + hh + RECUL;
              const bx = p.x - rangeeW / 2;
              /*
                ET ELLES DISPARAISSENT AVEC LUI.

                Un meuble poussé hors du cadre laissait ses boutons collés au
                bord, sans rien à commander de visible. On juge sur la boîte
                du meuble : si elle ne mord plus sur le plan, il n'y a plus
                rien à afficher — les poignées restent calées sur le meuble,
                simplement personne ne les voit.
              */
              const dansLeChamp =
                p.x + hw > 0 &&
                p.x - hw < layout.w &&
                p.y + hh > 0 &&
                p.y - hh < layout.h;
              if (!dansLeChamp) return null;
              /*
                LES QUATRE BORDS SE TIRENT — quand les cotes sont demandées.

                Hors cotes, on déplace ; en cotes, on dimensionne. Les
                afficher en permanence poserait quatre cibles de plus autour
                d'un meuble qu'on veut seulement pousser.
              */
              const cotesTirables: {
                cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-';
                n: { x: number; z: number };
                demi: number;
              }[] = [
                { cote: 'largeur+', n: { x: Math.cos(f.yaw), z: Math.sin(f.yaw) }, demi: f.width / 2 },
                { cote: 'largeur-', n: { x: -Math.cos(f.yaw), z: -Math.sin(f.yaw) }, demi: f.width / 2 },
                { cote: 'profondeur+', n: { x: -Math.sin(f.yaw), z: Math.cos(f.yaw) }, demi: f.depth / 2 },
                { cote: 'profondeur-', n: { x: Math.sin(f.yaw), z: -Math.cos(f.yaw) }, demi: f.depth / 2 },
              ];
              return (
                <>
                  <ObjectDragHandle
                    objectId={o.id}
                    center={p}
                    half={{ x: hw, y: hh }}
                    mapping={mapping}
                    raw={o}
                    onRefus={setPoseRefusee}
                  />
                  {showObjectDims &&
                    cotesTirables.map((b) => {
                      // Milieu du bord, et un point voisin LE LONG du bord :
                      // deux projections suffisent à connaître son angle à
                      // l'écran, quelle que soit la rotation du plan.
                      const mil = mapping.toPx({
                        x: f.cx + b.n.x * b.demi,
                        z: f.cz + b.n.z * b.demi,
                      });
                      const cote2 = mapping.toPx({
                        x: f.cx + b.n.x * b.demi - b.n.z * 0.2,
                        z: f.cz + b.n.z * b.demi + b.n.x * 0.2,
                      });
                      const inclinaison =
                        (Math.atan2(cote2.y - mil.y, cote2.x - mil.x) * 180) /
                        Math.PI;
                      /*
                        LA POIGNÉE SE POSE JUSTE DEHORS, pas sur le meuble.

                        Sa zone touchable fait quarante points ; posées sur
                        les quatre bords d'un meuble de soixante centimètres,
                        elles se rejoignaient au milieu et couvraient toute
                        sa surface — il devenait impossible de le DÉPLACER,
                        chaque appui tombant sur une poignée. Douze points
                        vers l'extérieur, et l'intérieur du meuble redevient
                        ce qu'il doit être : la prise pour le pousser.
                      */
                      const vers = Math.hypot(mil.x - p.x, mil.y - p.y) || 1;
                      const at = {
                        x: mil.x + ((mil.x - p.x) / vers) * 12,
                        y: mil.y + ((mil.y - p.y) / vers) * 12,
                      };
                      return (
                        <SideHandle
                          key={b.cote}
                          objectId={o.id}
                          // Le magasin raisonne sur le transform brut : si le
                          // dessin a retourné le meuble, le bord se traduit.
                          cote={coteVersLeMagasin(
                            b.cote,
                            f.yaw,
                            Math.atan2(o.transform[2], o.transform[0]),
                          )}
                          at={at}
                          angle={inclinaison}
                          normale={b.n}
                          mapping={mapping}
                        />
                      );
                    })}
                  <RotateHandle
                    objectId={o.id}
                    center={p}
                    at={{ x: bx, y: by }}
                    raw={o}
                    viewRot={view.rot}
                    frame={frame}
                  />
                  <TouchableOpacity
                    style={[
                      styles.objDelete,
                      { left: bx + ECART * 2 - 17, top: by - 17 },
                    ]}
                    accessibilityLabel="Retirer le meuble"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    onPress={() => onDeleteObject?.(o.id)}>
                    <CloseCross size={17} color="#FFFFFF" weight={3.4} />
                  </TouchableOpacity>
                  {/* Les cotes à la demande : le bandeau du bas et les
                      dégagements ne s'affichent que si on les réclame. Ils
                      couvraient le plan en permanence pour un réglage qu'on
                      ne fait qu'une fois. */}
                  <TouchableOpacity
                    style={[
                      styles.objMeasure,
                      showObjectDims && styles.objMeasureOn,
                      { left: bx + ECART - 17, top: by - 17 },
                    ]}
                    accessibilityLabel="Cotes du meuble"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    onPress={onToggleObjectDims}>
                    <Svg width={17} height={17} viewBox="0 0 24 24">
                      {[
                        'M3.5 9 h17 a1.5 1.5 0 0 1 1.5 1.5 v3 a1.5 1.5 0 0 1 -1.5 1.5 h-17 a1.5 1.5 0 0 1 -1.5 -1.5 v-3 a1.5 1.5 0 0 1 1.5 -1.5 z',
                        'M7.5 9 v3',
                        'M11.5 9 v3',
                        'M15.5 9 v3',
                      ].map((dd) => (
                        <Path
                          key={dd}
                          d={dd}
                          stroke={showObjectDims ? '#FFFFFF' : c.ink}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      ))}
                    </Svg>
                  </TouchableOpacity>
                </>
              );
            })()}

          {/*
            LA PIÈCE QU'ON VIENT DE POSER SE TIRE PAR SES BORDS.

            Relevé du patron : « le "ajouter une pièce" ne montre pas qu'il
            faut créer la pièce, et de plus au glissement, ça s'annule tout
            seul avec le déplacement du plan. On doit faire une pièce basique
            modifiable comme un meuble sur ses côtés, en pointillés, et on
            doit pouvoir le placer en le glissant avec le doigt dans sa
            surface ».

            Les quatre poignées ne paraissent que tant que la pièce est
            NEUVE : une fois lâchée, elle se règle comme les autres, et
            quatre cibles de plus autour de chaque pièce choisie gêneraient
            le geste qu'on fait vraiment — la pousser.
          */}
          {editable &&
            selectedRoomId &&
            roomById.get(selectedRoomId)?.neuve &&
            (() => {
              const pts = partOf.get(selectedRoomId)?.surface?.pts;
              if (!pts || pts.length < 3) return null;
              const xs = pts.map((q) => q.x);
              const zs = pts.map((q) => q.z);
              const x0 = Math.min(...xs);
              const x1 = Math.max(...xs);
              const z0 = Math.min(...zs);
              const z1 = Math.max(...zs);
              const cx = (x0 + x1) / 2;
              const cz = (z0 + z1) / 2;
              const centre = mapping.toPx({ x: cx, z: cz });
              const bords = [
                { cote: 'largeur+' as const, n: { x: 1, z: 0 }, mid: { x: x1, z: cz } },
                { cote: 'largeur-' as const, n: { x: -1, z: 0 }, mid: { x: x0, z: cz } },
                { cote: 'profondeur+' as const, n: { x: 0, z: 1 }, mid: { x: cx, z: z1 } },
                { cote: 'profondeur-' as const, n: { x: 0, z: -1 }, mid: { x: cx, z: z0 } },
              ];
              return (
                <>
                  {bords.map((b) => {
                    // Le milieu du bord et un point voisin LE LONG du bord :
                    // deux projections donnent son angle à l'écran, quelle
                    // que soit la rotation du plan.
                    const m = mapping.toPx(b.mid);
                    const long = mapping.toPx({
                      x: b.mid.x - b.n.z * 0.2,
                      z: b.mid.z + b.n.x * 0.2,
                    });
                    const inclinaison =
                      (Math.atan2(long.y - m.y, long.x - m.x) * 180) / Math.PI;
                    // Juste DEHORS, comme pour un meuble : posées sur le
                    // bord, les quatre zones de quarante points se
                    // rejoignaient au milieu d'une petite pièce et
                    // l'empêchaient de se pousser.
                    const vers = Math.hypot(m.x - centre.x, m.y - centre.y) || 1;
                    const at = {
                      x: m.x + ((m.x - centre.x) / vers) * 12,
                      y: m.y + ((m.y - centre.y) / vers) * 12,
                    };
                    return (
                      <SideHandle
                        key={b.cote}
                        roomId={selectedRoomId}
                        cote={b.cote}
                        at={at}
                        angle={inclinaison}
                        normale={b.n}
                        mapping={mapping}
                      />
                    );
                  })}
                </>
              );
            })()}

          {/*
            LA PASTILLE QUI REFERME LE PLAN.

            Elle se pose au milieu du manque, et dit sa largeur : on sait ce
            qu'on va poser avant d'appuyer. Un appui tend le mur — avec la
            porte, si l'écart en a la taille.
          */}
          {editable &&
            onComblerTrou &&
            trous.map((t, i) => {
              const dPastille = taillePastilleTrou(mapping.scale);
              const p0 = mapping.toPx(t.a);
              const p1 = mapping.toPx(t.b);
              const mx = (p0.x + p1.x) / 2;
              const my = (p0.y + p1.y) / 2;
              return (
                <TouchableOpacity
                  key={`combler-${i}`}
                  style={[
                    styles.trouPastille,
                    {
                      width: dPastille,
                      height: dPastille,
                      borderRadius: dPastille / 2,
                      left: mx - dPastille / 2,
                      top: my - dPastille / 2,
                    },
                  ]}
                  accessibilityLabel={`Combler le trou de ${Math.round(
                    t.ecart * 100,
                  )} cm`}
                  /*
                    CE QU'ON VISE EST PETIT, CE QU'ON TOUCHE RESTE LARGE.

                    La pastille rétrécit avec le plan ; le doigt, lui, ne
                    rétrécit pas. Le débord reprend donc exactement ce
                    qu'elle a rendu — la cible garde les trente-quatre
                    points d'avant, plus les huit de marge.
                  */
                  hitSlop={(() => {
                    const d = Math.max(8, (34 - dPastille) / 2 + 8);
                    return { top: d, bottom: d, left: d, right: d };
                  })()}
                  onPress={() => onComblerTrou(t)}>
                  <Svg
                    width={dPastille * 0.53}
                    height={dPastille * 0.53}
                    viewBox="0 0 24 24">
                    {['M12 5 v14', 'M5 12 h14'].map((dd) => (
                      <Path
                        key={dd}
                        d={dd}
                        stroke="#FFFFFF"
                        strokeWidth={2.6}
                        strokeLinecap="round"
                        fill="none"
                      />
                    ))}
                  </Svg>
                </TouchableOpacity>
              );
            })}

          {/*
            Mur ou RETOUR sélectionné : les commandes viennent se poser À
            CÔTÉ de lui, jamais dessus.

            Un retour n'ouvrait aucun menu : il se surlignait, affichait sa
            note, et c'était tout. On ne pouvait donc rien y poser — alors
            que le retour est justement l'endroit où l'on met l'interrupteur
            d'entrée. Il reçoit maintenant le même menu que le mur entier,
            centré sur SA portion de maçonnerie.
          */}
          {(selectedWallId || pierRun) &&
            (() => {
              const w = walls.find(
                (x) => x.id === (selectedWallId ?? pier?.wallId),
              );
              if (!w || !onWallAction) return null;
              // Sur un retour, le menu se centre sur le tronçon, pas sur le
              // mur : c'est le bout de maçonnerie qu'on vise.
              const bornes =
                !selectedWallId && pierRun
                  ? {
                      a: {
                        x: w.a.x + (w.b.x - w.a.x) * pierRun.t0,
                        z: w.a.z + (w.b.z - w.a.z) * pierRun.t0,
                      },
                      b: {
                        x: w.a.x + (w.b.x - w.a.x) * pierRun.t1,
                        z: w.a.z + (w.b.z - w.a.z) * pierRun.t1,
                      },
                    }
                  : { a: w.a, b: w.b };
              const a2 = mapping.toPx(bornes.a);
              const b2 = mapping.toPx(bornes.b);
              const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
              // Décalage perpendiculaire, du côté où il y a de la place.
              const dx = b2.x - a2.x;
              const dy = b2.y - a2.y;
              const len = Math.hypot(dx, dy) || 1;
              let nx = -dy / len;
              let ny = dx / len;
              const ctr = partOf.get(roomOf(w))?.labelAt;
              const c2 = ctr ? mapping.toPx(ctr) : { x: layout.w / 2, y: layout.h / 2 };
              // Vers l'intérieur de la pièce : c'est là qu'on a de la place.
              let flip: 1 | -1 = 1;
              if (nx * (c2.x - mid.x) + ny * (c2.y - mid.y) < 0) {
                nx = -nx;
                ny = -ny;
                flip = -1;
              }
              /*
                LE MENU S'ÉCARTE ASSEZ POUR NE JAMAIS TOUCHER LA POIGNÉE.

                La barre est LARGE : le long d'un mur vertical, son centre
                décalé de cinquante-quatre points laisse encore une
                demi-barre de l'AUTRE côté du mur — précisément là où la
                poignée de rotation se pose, à la même hauteur. L'écart se
                calcule donc sur l'encombrement RÉEL de la barre projeté
                sur la direction du décalage (demi-largeur pour un mur
                vertical, demi-hauteur pour un horizontal), et contre la
                position VRAIMENT occupée par la poignée — celle que la
                borne du cadre a pu rappeler vers le mur —, rayon dix-sept,
                marge six.
              */
              const demiBarre =
                Math.abs(nx) * (WALL_MENU.w / 2) +
                Math.abs(ny) * (WALL_MENU.h / 2);
              /*
                L'ÉCART PART DU BORD DE LA BARRE, PAS DE SON CENTRE.

                Il valait cinquante-quatre points, mesurés du milieu du mur
                au CENTRE de la barre : pour un mur horizontal, la barre
                fait quarante-six de haut, son bord arrivait donc à cinq
                points du trait — relevé du patron, capture à l'appui :
                « le bloc du menu ne doit pas toucher le mur ». On compte
                désormais la demi-barre PLUS la marge, et le mur qu'on
                vient de désigner reste entièrement visible.
              */
              const ECART_MUR = 22;
              let gap = demiBarre + ECART_MUR;
              if (selectedWallId) {
                const p = poigneeAt(w, mapping, flip === 1 ? -1 : 1, {
                  w: layout.w,
                  h: layout.h,
                });
                const dPoignee = (p.x - mid.x) * nx + (p.y - mid.y) * ny;
                gap = Math.max(gap, dPoignee + demiBarre + 17 + 6);
              }
              const demiW = WALL_MENU.w / 2 + 4;
              const demiH = WALL_MENU.h / 2 + 4;
              /*
                LE RAPPEL DANS LE CADRE NE DOIT PAS RAMENER LA BARRE SUR LE
                MUR — c'était la seconde cause, et la plus vicieuse : près
                d'un bord, le menu poussé vers l'intérieur revenait
                exactement en travers du trait.

                On essaie donc les deux côtés du mur, et l'on garde celui
                qui, UNE FOIS BORNÉ, laisse le mur libre. Si aucun ne
                convient (un mur en plein bord d'écran), on glisse la barre
                le long du mur jusqu'à le dégager : sortir du cadre n'est
                jamais une option, cacher le mur ne l'est plus.
              */
              const borner = (px: number, py: number) => ({
                x: Math.min(layout.w - demiW, Math.max(demiW, px)),
                y: Math.min(layout.h - demiH, Math.max(demiH, py)),
              });
              const libre = (p: { x: number; y: number }) =>
                !segmentDansCadre(a2, b2, {
                  x: p.x,
                  y: p.y,
                  rx: WALL_MENU.w / 2 + ECART_MUR / 2,
                  ry: WALL_MENU.h / 2 + ECART_MUR / 2,
                });
              let pos = borner(mid.x + nx * gap, mid.y + ny * gap);
              if (!libre(pos)) {
                const autre = borner(mid.x - nx * gap, mid.y - ny * gap);
                if (libre(autre)) {
                  pos = autre;
                } else {
                  // Le long du mur : on s'éloigne du milieu, par pas d'un
                  // quart de barre, du côté où il reste de la place.
                  const ux = (b2.x - a2.x) / len;
                  const uy = (b2.y - a2.y) / len;
                  for (let k = 1; k <= 12 && !libre(pos); k++) {
                    const d = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 26;
                    pos = borner(
                      mid.x + nx * gap + ux * d,
                      mid.y + ny * gap + uy * d,
                    );
                  }
                }
              }
              const bx = pos.x;
              const by = pos.y;
              return (
                <View
                  style={[
                    styles.wallActions,
                    { left: bx - WALL_MENU.w / 2, top: by - WALL_MENU.h / 2 },
                  ]}
                  pointerEvents="box-none">
                  {WALL_ACTIONS.map(({ action, label, d }) => {
                    const teinte = action === 'supprimer' ? c.danger : c.ink;
                    return (
                      <TouchableOpacity
                        key={action}
                        style={styles.wallAction}
                        accessibilityLabel={label ?? action}
                        onPress={() => onWallAction(action, w.id)}>
                        <Svg width={19} height={19} viewBox="0 0 24 24">
                          <Path d={d} fill={teinte} fillRule="evenodd" />
                        </Svg>
                        {label && (
                          <Text style={styles.wallActionText}>{label}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })()}

          {/* La marche à suivre, seulement quand un retour est pris : une
              ligne au coin du plan, qui dit ce qu'on tient et comment
              prendre le mur entier. Rien de sélectionné, rien d'affiché. */}
          {pierRun && (
            <View style={styles.pierNote} pointerEvents="none">
              <Text style={styles.pierNoteTitle}>
                {`Retour de mur · ${(pierRun.length * 100).toFixed(0)} cm`}
              </Text>
              <Text style={styles.pierNoteHint}>
                Appui long : tout le mur, ouvertures comprises
              </Text>
            </View>
          )}

          {/* Poignées de coin, uniquement en mode édition */}
          {editable &&
            corners.map((pt) => (
              <CornerHandle key={pt.key} corner={pt} mapping={mapping} />
            ))}

          {/*
            LE MUR CHOISI SE POUSSE ET SE TOURNE.

            Les deux gestes du métier : on POUSSE une cloison — elle reste
            parallèle à elle-même, ses voisins s'étirent — et on la PIVOTE,
            elle garde sa longueur. Ils n'apparaissent que sur le mur
            sélectionné : partout ailleurs, le doigt appartient au plan.
          */}
          {editable &&
            selectedWallId &&
            (() => {
              const w = walls.find((x) => x.id === selectedWallId);
              if (!w) return null;
              /*
                LA POIGNÉE PREND LE CÔTÉ OPPOSÉ AU MENU.

                Les deux se posent perpendiculairement au milieu du mur — le
                menu du côté de la pièce, et la poignée, avant, d'un côté
                FIXE : dès que ces deux côtés coïncidaient, quatorze points
                les séparaient et le rond bleu se posait SUR la barre
                (capture du chantier). Le côté de la pièce appartient au
                menu — c'est là qu'on lit ; la poignée, qui est un geste,
                prend l'autre flanc. Ils ne peuvent plus se toucher, par
                construction, et le banc le prouve mur par mur.
              */
              const a2 = mapping.toPx(w.a);
              const b2 = mapping.toPx(w.b);
              const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
              const ctr = partOf.get(roomOf(w))?.labelAt;
              const cc = ctr
                ? mapping.toPx(ctr)
                : { x: layout.w / 2, y: layout.h / 2 };
              const versPiece =
                -(b2.y - a2.y) * (cc.x - mid.x) +
                  (b2.x - a2.x) * (cc.y - mid.y) >=
                0
                  ? 1
                  : -1;
              const sens: 1 | -1 = versPiece === 1 ? -1 : 1;
              return (
                <React.Fragment key={`mur-${w.id}`}>
                  <WallMoveHandle wall={w} mapping={mapping} />
                  <WallRotateHandle
                    wall={w}
                    mapping={mapping}
                    sens={sens}
                    borne={{ w: layout.w, h: layout.h }}
                  />
                </React.Fragment>
              );
            })()}
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Un mur au plan : corps poché dont les quatre coins viennent des onglets
 * partagés (`wallQuads`) — deux murs qui se rejoignent forment donc un angle
 * franc, sans recouvrement ni fente.
 */
function WallBody({
  wall,
  quad,
  mapping,
  showMeasure,
  measureAt,
  measureOpacity = 1,
  selected,
  neuve,
  onPress,
}: {
  wall: WallSeg;
  quad?: WallQuad;
  mapping: EffMapping;
  showMeasure: boolean;
  /**
   * Où poser la valeur, décidée en amont.
   *
   * Le mur ne choisit plus tout seul : il faut voir TOUTES les cotes pour
   * savoir laquelle recouvre laquelle, et une cote se recale dans la portion
   * visible de son mur — deux choses qu'un mur, seul, ne peut pas savoir.
   */
  measureAt?: { x: number; y: number };
  /** Les cotes globales s'effacent quand les cotes de détail arrivent. */
  measureOpacity?: number;
  selected: boolean;
  /**
   * LE MUR D'UNE PIECE PAS ENCORE ARRETEE — il se dessine en pointillés.
   *
   * Relevé du patron sur la pièce qu'on ajoute : « on doit faire une pièce
   * basique modifiable comme un meuble sur ses côtés, en pointillés ». Le
   * poché noir dit la maçonnerie RELEVÉE ; celle qu'on est en train de
   * poser n'en est pas encore une, et le trait ouvert le dit sans un mot.
   * Il se referme au lâcher (`arreterPiece`).
   */
  neuve?: boolean;
  /** Le mur borde une pièce en défaut de conformité électrique. */
  onPress?: () => void;
}) {
  const c = useTheme();
  const a = mapping.toPx(wall.a);
  const b = mapping.toPx(wall.b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const norm = Math.hypot(dx, dy) || 1;
  // Sous une certaine échelle le poché est plus fin qu'un trait : on garde
  // alors un trait plein, sinon le mur disparaît quand on dézoome.
  const bodyPx = WALL_T * mapping.scale;
  const body =
    quad && bodyPx >= 2.5
      ? quadPoints(quad)
          .map((p) => mapping.toPx(p))
          .map((p) => `${p.x},${p.y}`)
          .join(' ')
      : null;

  // Cote : petit texte posé le long du mur, sans cadre, jamais à l'envers.
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  let n = { x: -dy / norm, y: dx / norm };
  if (n.y > 0) n = { x: -n.x, y: -n.y }; // toujours du côté "haut" écran
  const mid = measureAt ?? {
    x: (a.x + b.x) / 2 + n.x * (bodyPx / 2 + 9),
    y: (a.y + b.y) / 2 + n.y * (bodyPx / 2 + 9),
  };
  const label = `${segLength(wall).toFixed(2).replace('.', ',')} m`;
  /*
    LA COUPE DU MUR EST NOIRE. TOUJOURS.

    Elle virait au rouge foncé dès qu'un constat de conformité touchait la
    pièce — et comme un salon en porte presque toujours un, TOUS les murs
    sortaient bordeaux. Le relevé du chantier, en comparant à un plan
    concurrent : « l'épaisseur vue du dessus est noire ». C'est la convention
    du dessin d'architecte, et c'est ce qui rend un plan lisible d'un coup
    d'œil : le poché dit la maçonnerie, rien d'autre.

    L'alerte n'est pas perdue pour autant : elle se dit sur le CARTOUCHE de
    la pièce, d'un point ambre à côté du nom. Un défaut se signale là où
    on lit la pièce, pas en repeignant ses quatre murs.
  */
  const teinte = selected ? c.blue : c.ink;

  return (
    <G onPress={onPress}>
      {/* Zone de toucher élargie, invisible */}
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={30} />
      {neuve ? (
        // Le contour seul, en tirets : rien n'est poché tant que la pièce
        // n'est pas arrêtée.
        <Line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={teinte}
          strokeWidth={2.5}
          strokeLinecap="butt"
          strokeDasharray="7,5"
        />
      ) : body ? (
        <Polygon points={body} fill={teinte} stroke="none" />
      ) : (
        <Line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={teinte}
          strokeWidth={2.5}
          strokeLinecap="butt"
        />
      )}
      {showMeasure && measureOpacity > 0.02 && (
        <SvgText
          opacity={measureOpacity}
          x={mid.x}
          y={mid.y + 3}
          fill={selected ? c.blue : c.inkSoft}
          fontSize={10}
          fontWeight="600"
          textAnchor="middle"
          transform={`rotate(${angle}, ${mid.x}, ${mid.y})`}>
          {label}
        </SvgText>
      )}
    </G>
  );
}

// Exportées pour les tests : c'est la STABILITÉ de leur responder qu'on
// vérifie, et elle ne se voit que de l'extérieur.
/**
 * La poignée d'un appareil de PLAFOND.
 *
 * Même principe que celle d'un meuble, et même piège évité : le geste vit
 * dans une référence, jamais dans les dépendances d'un `useMemo`, sinon le
 * `PanResponder` se refabrique à chaque image et perd le déplacement cumulé
 * depuis l'appui.
 *
 * Différence avec un meuble : un point lumineux n'a pas d'emprise au sol
 * qui buterait sur les murs. Il se pose où l'on veut dans la pièce, y
 * compris contre une cloison — une applique, justement, s'y colle.
 */
export function CeilingDragHandle({
  id,
  center,
  rayon,
  mapping,
  at,
  onTap,
}: {
  id: string;
  center: { x: number; y: number };
  rayon: number;
  mapping: EffMapping;
  at: Pt;
  /**
   * Un APPUI, par opposition à un glissement.
   *
   * La poignée couvre l'appareil : une fois celui-ci choisi, plus aucun
   * appui ne redescendait jusqu'au dessin, et le menu — celui qui porte
   * « Relier à une commande » — devenait inatteignable. On distinguait un
   * geste de l'autre nulle part : tout était traité comme un déplacement,
   * même de zéro pixel.
   */
  onTap?: () => void;
}) {
  const styles = getStyles(useTheme());
  const startRef = useRef(at);
  const live = useRef({ mapping, at });
  live.current = { mapping, at };
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = live.current.at;
          haptic('accroche');
        },
        onPanResponderMove: (_e, g) => {
          const d = live.current.mapping.deltaToMeters(g.dx, g.dy);
          useScanStore.getState().moveCeiling(id, {
            x: startRef.current.x + d.x,
            z: startRef.current.z + d.z,
          });
        },
        onPanResponderRelease: (_e, g) => {
          releaseHaptic('accroche');
          // Moins de six pixels parcourus : le doigt n'a pas glissé, il a
          // touché. Six, c'est le tremblement d'une main qui vise.
          if (Math.hypot(g.dx, g.dy) < 6) tapRef.current?.();
        },
        onPanResponderTerminate: () => releaseHaptic('accroche'),
      }),
    [id],
  );
  return (
    <View
      style={{
        ...styles.dragZone,
        left: center.x - rayon - 10,
        top: center.y - rayon - 10,
        width: (rayon + 10) * 2,
        height: (rayon + 10) * 2,
      }}
      {...pan.panHandlers}
    />
  );
}

export function ObjectDragHandle({
  objectId,
  center,
  half,
  mapping,
  raw,
  onRefus,
}: {
  objectId: string;
  center: { x: number; y: number };
  /** Demi-largeur et demi-hauteur de l'emprise à l'écran. */
  half: { x: number; y: number };
  mapping: EffMapping;
  raw: {
    transform: number[];
    width: number;
    depth?: number;
    baseWidth?: number;
    baseDepth?: number;
  };
  /** Le meuble ne peut pas se poser là : l'écran le montre en ROUGE. */
  onRefus?: (refuse: boolean) => void;
}) {
  const styles = getStyles(useTheme());
  const startRef = useRef({ x: raw.transform[12], z: raw.transform[14] });
  /** La dernière position qui tenait : on y revient si le doigt lâche dans un mur. */
  const derniereBonne = useRef<{ x: number; z: number } | null>(null);
  /** L'aimant a-t-il joué à l'image précédente ? (pour ne vibrer qu'une fois) */
  const aimanteAvant = useRef(false);
  /**
   * Ce qui change à chaque frame passe par une RÉFÉRENCE, jamais par les
   * dépendances du geste.
   *
   * C'est la panne du glissement, et elle est vicieuse : `raw` est un objet
   * neuf à chaque déplacement (le store recrée le meuble), donc le `useMemo`
   * refabriquait un `PanResponder` À CHAQUE MOUVEMENT. Or l'état d'un
   * responder — le `dx` cumulé depuis l'appui — vit DANS l'instance : la
   * nouvelle n'a jamais reçu l'appui, son `dx` repart de zéro, et le meuble
   * retourne à sa position de départ. D'où « impossible de le bouger » et
   * « il revient tout seul ». Le responder est maintenant créé une fois pour
   * la vie de la poignée.
   */
  const live = useRef({ mapping, raw, onRefus });
  /*
    LE RAPPORT DE REFUS PASSE PAR LA RÉFÉRENCE, comme tout ce qui change à
    chaque image : mis dans les dépendances du geste, il refabriquerait le
    `PanResponder` à chaque rendu du parent — et le déplacement en cours
    perdrait son point de départ.
  */
  live.current = { mapping, raw, onRefus };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Le geste ne se rend PAS au plan : `PanResponder` accepte par
        // défaut de céder la main, et le plan la redemande à chaque
        // mouvement — les premiers pixels déplaçaient le meuble, puis le
        // plan reprenait tout.
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          const t = live.current.raw.transform;
          startRef.current = { x: t[12], z: t[14] };
        },
        /*
          LE DOIGT COMMANDE — relevé du patron : « on doit pouvoir les placer
          n'importe où, même traverser les murs, mais impossible à placer SUR
          un mur (meuble rouge au placement si impossible) ».

          Le meuble suit donc exactement, murs compris. Ce qui est refusé,
          c'est de LÂCHER dans la maçonnerie : tant que le doigt y est, le
          meuble se signale en rouge ; au lâcher, il revient à la dernière
          position qui tenait.
        */
        onPanResponderMove: (_e, g) => {
          const d = live.current.mapping.deltaToMeters(g.dx, g.dy);
          const vise = {
            x: startRef.current.x + d.x,
            z: startRef.current.z + d.z,
          };
          const m = live.current.raw;
          // Le rapport de refus se lit dans la référence : il ne peut pas
          // entrer dans les dépendances du geste sans le refabriquer à
          // chaque image, et un geste refabriqué perd son point de départ.
          const dire = live.current.onRefus;
          const essai = poserLibre(
            vise,
            {
              width: m.baseWidth ?? m.width,
              // La profondeur du catalogue, à défaut celle du meuble : une
              // emprise sans profondeur n'existe pas, et le carré du dessin
              // est la plus sûre des valeurs par défaut.
              depth: m.baseDepth ?? m.depth ?? m.width,
              yaw: Math.atan2(m.transform[2], m.transform[0]),
            },
            useScanStore.getState().walls,
          );
          useScanStore
            .getState()
            .setObjectCenter(objectId, vise.x, vise.z, true, true);
          dire?.(!essai.valide);
          if (essai.valide) {
            // La dernière position qui tient : c'est là qu'on reviendra si
            // le doigt se lève dans un mur.
            derniereBonne.current = essai.centre;
            releaseHaptic('butee');
            // L'aimant vient de coller le meuble au mur : la main doit le
            // sentir, parce que l'œil est caché par le doigt.
            if (essai.aimante && !aimanteAvant.current) haptic('accroche');
          } else {
            haptic('butee', true);
          }
          aimanteAvant.current = essai.aimante;
        },
        /*
          AU LÂCHER, ON NE LAISSE PAS UN MEUBLE DANS UN MUR.

          Il revient à la dernière position qui tenait — celle qu'il avait
          juste avant d'entrer dans la maçonnerie. Sans ce retour, le refus
          ne serait qu'une couleur : on lâcherait quand même dans le mur.
        */
        onPanResponderRelease: () => {
          releaseHaptic('butee');
          live.current.onRefus?.(false);
          const bonne = derniereBonne.current;
          if (bonne) {
            useScanStore
              .getState()
              .setObjectCenter(objectId, bonne.x, bonne.z, true, true);
          }
        },
        onPanResponderTerminate: () => {
          releaseHaptic('butee');
          live.current.onRefus?.(false);
        },
      }),
    [objectId],
  );
  return (
    <View
      {...pan.panHandlers}
      style={[
        styles.objDrag,
        {
          left: center.x - half.x,
          top: center.y - half.y,
          width: half.x * 2,
          height: half.y * 2,
        },
      ]}
    />
  );
}

/**
 * La poignée de rotation : un demi-cercle fléché posé à un coin du meuble.
 *
 * On la tire, le meuble suit l'angle du doigt autour de son centre, et la
 * valeur s'affiche le temps du geste — sans elle, on tourne à l'aveugle et
 * on ne retrouve jamais l'aplomb. Elle s'arrête d'elle-même tous les 15°,
 * à 4° près : c'est ce qui permet de revenir à l'équerre du premier coup.
 */
export function RotateHandle({
  objectId,
  center,
  at,
  raw,
  viewRot,
  frame,
}: {
  objectId: string;
  center: { x: number; y: number };
  at: { x: number; y: number };
  raw: { transform: number[] };
  viewRot: number;
  /** Trame du logement : l'aimant s'y réfère. */
  frame: number;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [angle, setAngle] = useState<number | null>(null);
  const base = useRef({ yaw: 0, touche: 0 });
  // Même règle que pour le déplacement : la poignée suit le meuble, donc
  // `at`, `center` et `raw` changent à chaque frame. Les mettre dans les
  // dépendances recréait le responder en plein geste et la rotation
  // repartait de zéro.
  const live = useRef({ at, center, raw, viewRot, frame });
  live.current = { at, center, raw, viewRot, frame };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Le geste ne se rend PAS au plan : `PanResponder` accepte par
        // défaut de céder la main, et le plan la redemande à chaque
        // mouvement — les premiers pixels déplaçaient le meuble, puis le
        // plan reprenait tout.
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          const L = live.current;
          base.current = {
            yaw: Math.atan2(L.raw.transform[2], L.raw.transform[0]),
            // Angle écran du point de départ de la poignée, autour du centre.
            touche: Math.atan2(L.at.y - L.center.y, L.at.x - L.center.x),
          };
          setAngle(Math.round(((base.current.yaw * 180) / Math.PI) % 360));
        },
        onPanResponderMove: (_e, g) => {
          const L = live.current;
          const { at: at0, center: c0, viewRot: vr, frame: fr } = L;
          const a = Math.atan2(
            at0.y + g.dy - c0.y,
            at0.x + g.dx - c0.x,
          );
          let yaw = base.current.yaw + (a - base.current.touche);
          // Aimant à deux forces, référé à la TRAME du logement :
          // les quarts de tour tirent de loin (8°) parce que c'est là que
          // tombent 99 % des meubles ; les seizièmes, de tout près (3°),
          // pour un meuble volontairement de biais.
          const rel = yaw - fr;
          const quart = Math.round(rel / (Math.PI / 2)) * (Math.PI / 2);
          const seizieme = Math.round(rel / (Math.PI / 12)) * (Math.PI / 12);
          if (Math.abs(rel - quart) < (8 * Math.PI) / 180) {
            yaw = fr + quart;
            // Pile sur l'équerre : un petit cran sous le doigt le dit mieux
            // qu'un chiffre qu'on ne regarde pas.
            haptic('accroche', true);
          } else if (Math.abs(rel - seizieme) < (3 * Math.PI) / 180) {
            yaw = fr + seizieme;
            haptic('accroche', true);
          } else {
            releaseHaptic('accroche');
          }
          useScanStore.getState().setObjectYaw(objectId, yaw);
          const deg = Math.round(((yaw - vr) * 180) / Math.PI);
          setAngle(((deg % 360) + 360) % 360);
        },
        onPanResponderRelease: () => setAngle(null),
        onPanResponderTerminate: () => setAngle(null),
      }),
    [objectId],
  );
  return (
    <>
      <View
        {...pan.panHandlers}
        accessibilityLabel="Pivoter le meuble"
        style={[styles.rotHandle, { left: at.x - 17, top: at.y - 17 }]}>
        <Svg width={19} height={19} viewBox="0 0 24 24">
          <Path
            d="M4.5 12 a7.5 7.5 0 1 1 3 6"
            stroke={c.blue}
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M3.2 8.2 l1.6 4.2 4.2 -1.6"
            stroke={c.blue}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
      {angle !== null && (
        <View style={[styles.rotBadge, { left: at.x - 24, top: at.y - 46 }]}>
          <Text style={styles.rotBadgeText}>{`${angle}°`}</Text>
        </View>
      )}
    </>
  );
}

/**
 * LA POIGNÉE D'UN CÔTÉ — on prend le bord et on tire.
 *
 * Régler un meuble à la cote, c'était taper une largeur : il fallait faire le
 * calcul dans sa tête pour qu'il aille JUSQU'AU MUR. Sur un chantier on ne
 * calcule pas, on tire le mètre jusqu'à la maçonnerie. Le bord opposé reste
 * en place — c'est ce qui distingue un étirement d'un déplacement.
 *
 * Le doigt travaille dans le repère de l'ÉCRAN, la cote dans celui du
 * logement : on projette donc son déplacement sur la normale du bord, en
 * mètres. Un geste de travers ne compte que pour sa part utile, et le meuble
 * ne part jamais en biais.
 *
 * L'aimant du store finit le geste (`snapSideToWalls`) ; la main le sent
 * (`haptic`), parce que l'œil, lui, est caché par le doigt.
 */
export function SideHandle({
  objectId,
  roomId,
  cote,
  at,
  /** Angle du bord à l'écran, en degrés : la barre s'y couche. */
  angle,
  /** Normale sortante du bord, dans le repère du logement. */
  normale,
  mapping,
}: {
  objectId?: string;
  /**
   * UNE PIÈCE PLUTÔT QU'UN MEUBLE — même barre, même geste.
   *
   * Relevé du patron : « une pièce basique modifiable comme un meuble sur
   * ses côtés ». Comme un meuble : donc la même poignée, pas une cousine
   * qui se prendrait autrement. Seule change la cible du geste.
   */
  roomId?: string;
  cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-';
  at: { x: number; y: number };
  angle: number;
  normale: { x: number; z: number };
  mapping: EffMapping;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Même précaution que la poignée de déplacement : le responder est créé
  // UNE FOIS, et tout ce qui change en cours de geste passe par la référence.
  const live = useRef({ mapping, normale });
  live.current = { mapping, normale };
  /**
   * LE MEUBLE TEL QU'IL ÉTAIT À L'APPUI — le point fixe du geste.
   *
   * On envoyait des pas relatifs : « agrandis de trois millimètres de
   * plus ». Chaque image repartait donc d'une taille déjà corrigée par
   * l'aimant ou par la butée des murs, et la correction se rajoutait à la
   * suivante. Le chantier l'a filmé : un meuble contre un mur passait de
   * 0,44 m à 1,53 puis 1,93, en traversant la maçonnerie.
   *
   * On retient donc l'état de départ, et l'on envoie la distance TOTALE
   * parcourue depuis. Rien ne se cumule.
   */
  const depart = useRef<
    { width: number; depth: number; cx: number; cz: number } | null
  >(null);
  /** L'emprise de la pièce à l'appui — même rôle, autre géométrie. */
  const departPiece = useRef<{
    x0: number;
    z0: number;
    largeur: number;
    profondeur: number;
  } | null>(null);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          if (roomId) {
            const murs = useScanStore
              .getState()
              .walls.filter((w) => w.roomId === roomId);
            const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
            const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
            departPiece.current =
              murs.length === 4
                ? {
                    x0: Math.min(...xs),
                    z0: Math.min(...zs),
                    largeur: Math.max(...xs) - Math.min(...xs),
                    profondeur: Math.max(...zs) - Math.min(...zs),
                  }
                : null;
            return;
          }
          const o = useScanStore
            .getState()
            .objects.find((x) => x.id === objectId);
          depart.current = o
            ? {
                width: o.width,
                depth: o.depth,
                cx: o.transform[12],
                cz: o.transform[14],
              }
            : null;
        },
        onPanResponderMove: (_e, g) => {
          const d = live.current.mapping.deltaToMeters(g.dx, g.dy);
          const n = live.current.normale;
          const total = d.x * n.x + d.z * n.z;
          if (roomId) {
            const dep = departPiece.current;
            if (!dep) return;
            // Pas d'aimant sur une pièce : rien à faire sentir, donc rien
            // à faire vibrer.
            useScanStore.getState().resizeRoomSide(roomId, cote, total, dep);
            return;
          }
          const base = depart.current;
          if (!base || !objectId) return;
          const r = useScanStore
            .getState()
            .resizeObjectSide(objectId, cote, total, base);
          if (r.accroche) haptic('accroche', true);
          else releaseHaptic('accroche');
        },
        onPanResponderRelease: () => {
          depart.current = null;
          departPiece.current = null;
          releaseHaptic('accroche');
        },
        onPanResponderTerminate: () => {
          depart.current = null;
          departPiece.current = null;
          releaseHaptic('accroche');
        },
      }),
    [objectId, roomId, cote],
  );
  return (
    <View
      {...pan.panHandlers}
      accessibilityLabel={
        roomId ? `Étirer le côté ${cote} de la pièce` : `Étirer le côté ${cote}`
      }
      // La zone touchable déborde largement la barre : un doigt couvre
      // quinze points, la barre en fait huit.
      style={[styles.sideTouch, { left: at.x - 20, top: at.y - 20 }]}>
      <View
        style={[
          styles.sideBar,
          { transform: [{ rotate: `${angle}deg` }] },
        ]}
      />
    </View>
  );
}

/**
 * LE MUR CHOISI SE POUSSE AU DOIGT.
 *
 * On ne pouvait le retoucher que par ses COINS, un par un : décaler une
 * cloison de dix centimètres demandait de viser deux fois le même
 * déplacement, ce qui ne donne jamais deux fois le même — le mur arrivait
 * de travers, et on recommençait.
 *
 * La zone de prise est le mur lui-même, élargie à trente points : c'est ce
 * qu'on voit, donc ce qu'on attrape. Le geste ne se rend pas au plan, sans
 * quoi les premiers pixels pousseraient le mur et le plan reprendrait tout.
 */
function WallMoveHandle({
  wall,
  mapping,
}: {
  wall: WallSeg;
  mapping: EffMapping;
}) {
  const styles = getStyles(useTheme());
  const depart = useRef({ x: 0, z: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Six points de course avant de prendre la main : sans ce seuil, un
        // simple appui pour désélectionner déplacerait le mur d'un cheveu.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          depart.current = { x: 0, z: 0 };
        },
        onPanResponderMove: (_e, g) => {
          // Le magasin reçoit des PAS, pas une position : on lui envoie donc
          // ce qui s'est ajouté depuis la dernière image. Sans quoi l'aimant,
          // qui corrige le pas, se rajouterait à lui-même à chaque frame.
          const d = mapping.deltaToMeters(g.dx, g.dy);
          const dx = d.x - depart.current.x;
          const dz = d.z - depart.current.z;
          depart.current = d;
          useScanStore.getState().moveWall(wall.id, dx, dz);
        },
      }),
    [wall.id, mapping],
  );
  const a = mapping.toPx(wall.a);
  const b = mapping.toPx(wall.b);
  return (
    <View
      {...pan.panHandlers}
      // Rien à dessiner : le mur est déjà là, sous le doigt. Seule la boîte
      // se calcule, et elle change à chaque image du geste.
      style={[
        styles.wallGrab,
        {
          left: Math.min(a.x, b.x) - 15,
          top: Math.min(a.y, b.y) - 15,
          width: Math.abs(b.x - a.x) + 30,
          height: Math.abs(b.y - a.y) + 30,
        },
      ]}
    />
  );
}

/**
 * LA POIGNÉE DE ROTATION D'UN MUR.
 *
 * PREMIÈRE VERSION, ET SON DÉFAUT — relevé sur vidéo : « ça part dans tous
 * les sens ». Elle lisait `locationX`/`locationY` de l'événement pour situer
 * le doigt. Or ces coordonnées sont relatives À LA VUE TOUCHÉE — la poignée
 * elle-même, trente-quatre points de côté — et non au plan : l'angle calculé
 * autour du milieu du mur n'avait donc aucun sens, et sautait à chaque image.
 * Le mur balayait le plan, la pièce passait de 0,8 à 6,7 m² en trois
 * dixièmes de seconde.
 *
 * CE QUI EST FIABLE, C'EST LE DÉPLACEMENT. `PanResponder` fournit `dx`/`dy`,
 * la course du doigt depuis l'appui, dans les mêmes unités que le plan. On
 * connaît la position de départ de la poignée : le doigt est donc à
 * « départ + course », et l'angle se calcule proprement autour du milieu.
 *
 * SECONDE VERSION, ET SON DÉFAUT — relevé du chantier : « la rotation ne
 * suit pas bien le mouvement ». Elle envoyait au plan des PAS : un demi-degré,
 * parfois moins, à chaque image. Or le magasin recollait chacun de ces pas
 * aux crans de quinze degrés, et le pas suivant repartait du cran atteint.
 * Le mur restait donc scotché à l'équerre pendant que le doigt s'en
 * éloignait, puis rattrapait d'un coup — et cent arrondis le faisaient
 * dériver au passage.
 *
 * ON NE COMPTE PLUS LE CHEMIN, ON LIT L'ARRIVÉE. À la prise, on retient
 * l'angle du mur et celui du doigt. Ensuite, à chaque image : le mur vaut
 * son angle de départ plus ce que le doigt a parcouru — un ANGLE ABSOLU,
 * posé tel quel. Rien ne s'accumule, donc rien ne dérive, et une image
 * perdue ne laisse aucune trace.
 *
 * L'accroche se décide ICI, une seule fois, sur cet angle voulu : à trois
 * degrés d'un cran on colle (avec le petit choc au doigt qui le dit), à
 * quatre on est libre. On s'en décolle aussi facilement qu'on s'y colle.
 *
 * DEUX GARDE-FOUS, parce qu'un pouce sur un écran de six pouces n'est pas
 * une souris :
 *
 *  - la poignée se pose PERPENDICULAIREMENT au milieu du mur, à quarante
 *    points : dans le prolongement du bout, sur un mur qui traverse l'écran,
 *    elle finissait dans un coin, parfois hors du cadre ;
 *  - l'angle du doigt est DÉPLIÉ (`deplier`) : franchir le demi-tour ne fait
 *    plus repartir le mur d'un tour complet en sens inverse.
 *
 * Le plafond de quatre-vingt-dix degrés par geste est tombé avec les pas :
 * il servait à borner une dérive qui n'existe plus, et il arrêtait net un
 * mur que le doigt continuait de tourner.
 */
function WallRotateHandle({
  wall,
  mapping,
  /** Le côté du mur où se poser : toujours l'OPPOSÉ du menu. */
  sens = 1,
  /** Le cadre du plan : une poignée hors écran est un geste introuvable. */
  borne,
}: {
  wall: WallSeg;
  mapping: EffMapping;
  sens?: 1 | -1;
  borne?: { w: number; h: number };
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [angle, setAngle] = useState<number | null>(null);
  const vif = useRef({ wall, mapping, sens, borne });
  vif.current = { wall, mapping, sens, borne };
  /**
   * L'état du geste : d'où part le doigt, l'angle qu'il faisait alors, celui
   * du mur au même instant, et les crans sur lesquels s'arrêter.
   */
  const geste = useRef({
    x: 0,
    y: 0,
    mx: 0,
    my: 0,
    doigt0: 0,
    doigt: 0,
    mur0: 0,
    crans: [] as number[],
    collait: false,
  });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          const { wall: w, mapping: m } = vif.current;
          const mid = m.toPx({
            x: (w.a.x + w.b.x) / 2,
            z: (w.a.z + w.b.z) / 2,
          });
          const p = poigneeAt(w, m, vif.current.sens, vif.current.borne);
          const d0 = (Math.atan2(p.y - mid.y, p.x - mid.x) * 180) / Math.PI;
          geste.current = {
            x: p.x,
            y: p.y,
            mx: mid.x,
            my: mid.y,
            doigt0: d0,
            doigt: d0,
            // L'angle vrai du mur, pas l'entier affiché : partir de l'arrondi
            // ferait sauter le mur d'un demi-degré à la prise.
            mur0: (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI,
            // Les crans se figent à la prise : recalculés à chaque image, le
            // mur qu'on tourne s'offrirait ses propres angles successifs.
            crans: anglesRemarquables(useScanStore.getState().walls, w.id),
            collait: false,
          };
          setAngle(angleDe(w));
        },
        onPanResponderMove: (_e, g) => {
          const { wall: w } = vif.current;
          const b = geste.current;
          // Le doigt est à « départ + course » : c'est la seule position
          // fiable, et elle est dans les unités de l'écran.
          const brut =
            (Math.atan2(b.y + g.dy - b.my, b.x + g.dx - b.mx) * 180) /
            Math.PI;
          // Déplié depuis l'image précédente : le demi-tour ne casse rien.
          const doigt = deplier(b.doigt, brut);
          b.doigt = doigt;
          const vise = b.mur0 + (doigt - b.doigt0);
          const final = angleAimante(vise, b.crans, 3);
          // Le petit choc au doigt À L'INSTANT où l'on prend le cran : sans
          // lui, l'accroche ne se voit qu'en relisant le nombre.
          const colle = final !== vise;
          if (colle && !b.collait) haptic('accroche');
          b.collait = colle;
          useScanStore.getState().setWallAngle(w.id, final);
          const apres = useScanStore
            .getState()
            .walls.find((x) => x.id === w.id);
          if (apres) setAngle(angleDe(apres));
        },
        onPanResponderRelease: () => setAngle(null),
        onPanResponderTerminate: () => setAngle(null),
      }),
    [],
  );
  const at = poigneeAt(wall, mapping, sens, borne);
  return (
    <>
      <View
        {...pan.panHandlers}
        accessibilityLabel="Tourner le mur"
        style={[styles.wallRotate, { left: at.x - 17, top: at.y - 17 }]}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M19.5 12 a7.5 7.5 0 1 1 -2.2 -5.3"
            stroke={c.blue}
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M19.8 3.8 v4.4 h-4.4"
            stroke={c.blue}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
      {angle !== null && (
        <View style={[styles.wallAngle, { left: at.x - 26, top: at.y - 46 }]}>
          <Text style={styles.wallAngleText}>{`${angle}°`}</Text>
        </View>
      )}
    </>
  );
}

/** L'angle d'un mur, en degrés entiers — ce qu'on lit sur le plan. */
function angleDe(w: WallSeg): number {
  return Math.round((Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI);
}

/**
 * Où se pose la poignée : à quarante points du milieu, PERPENDICULAIREMENT,
 * du côté que `sens` désigne — l'appelant lui donne l'OPPOSÉ du menu.
 *
 * Dans le prolongement du bout, sur un mur qui traverse l'écran, elle
 * finissait dans un coin — parfois hors du cadre, et le geste devenait
 * introuvable. Au milieu, elle est toujours à côté de ce qu'elle fait
 * tourner. Et `borne` la retient au cadre : côté extérieur d'un mur de
 * façade, elle pourrait sinon sortir de l'écran.
 */
function poigneeAt(
  w: WallSeg,
  m: EffMapping,
  sens: 1 | -1 = 1,
  borne?: { w: number; h: number },
): { x: number; y: number } {
  const a = m.toPx(w.a);
  const b = m.toPx(w.b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const p = {
    x: mid.x + (-(b.y - a.y) / l) * 40 * sens,
    y: mid.y + ((b.x - a.x) / l) * 40 * sens,
  };
  if (borne) {
    p.x = Math.min(borne.w - 21, Math.max(21, p.x));
    p.y = Math.min(borne.h - 21, Math.max(21, p.y));
  }
  return p;
}

function CornerHandle({
  corner,
  mapping,
}: {
  corner: { x: number; z: number; wallId: string; end: 'a' | 'b' };
  mapping: EffMapping;
}) {
  const styles = getStyles(useTheme());
  const startRef = useRef({ x: corner.x, z: corner.z });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Le geste ne se rend PAS au plan : `PanResponder` accepte par
        // défaut de céder la main, et le plan la redemande à chaque
        // mouvement — les premiers pixels déplaçaient le meuble, puis le
        // plan reprenait tout.
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = { x: corner.x, z: corner.z };
        },
        onPanResponderMove: (_e, g) => {
          const d = mapping.deltaToMeters(g.dx, g.dy);
          useScanStore.getState().moveWallPoint(corner.wallId, corner.end, {
            x: startRef.current.x + d.x,
            z: startRef.current.z + d.z,
          });
        },
      }),
    [corner.wallId, corner.end, corner.x, corner.z, mapping],
  );

  const px = mapping.toPx(corner);
  // Zone de saisie invisible : le coin se déplace au doigt, sans marqueur.
  return (
    <View
      {...pan.panHandlers}
      style={[styles.handle, { left: px.x - 16, top: px.y - 16 }]}
    />
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  /** La prise du mur : invisible, elle ne fait qu'attraper le doigt. */
  wallGrab: { position: 'absolute', backgroundColor: 'transparent' },
  /** La poignée de rotation d'un mur : un rond bleu clair, comme au meuble. */
  wallRotate: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.1,
  },
  wallAngle: {
    position: 'absolute',
    minWidth: 52,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: c.blue,
    alignItems: 'center',
  },
  wallAngleText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  handle: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objDrag: { position: 'absolute' },
  /**
   * LES VOIES DU PLAN — où chaque bloc flottant a le droit de se poser.
   *
   * Tout ce qui flotte au-dessus du dessin était placé à vue, chacun dans
   * son coin, sans que personne ne tienne la liste. Il a suffi que la
   * rangée d'outils reçoive ses titres pour qu'elle s'élargisse et vienne
   * couvrir la note du retour de mur, illisible dessous.
   *
   * Quatre voies, et une seule chose par voie :
   *
   * - EN HAUT À DROITE : la rangée d'ancrage (contrôle, édition, annuler,
   *   enregistrer). Elle grandit avec le nombre de boutons — rien d'autre
   *   ne doit compter sur cette bande.
   * - À DROITE : la colonne des calques.
   * - EN BAS À GAUCHE : ce qui explique l'état courant (attente de pose,
   *   note du retour de mur). Un seul à la fois.
   * - EN BAS, PLEINE LARGEUR : les barres de cotes.
   */
  pierNote: {
    position: 'absolute',
    /*
      EN HAUT À GAUCHE, là où il reste de la place.

      Elle était en bas à gauche — c'est-à-dire, depuis la refonte, DERRIÈRE la
      rangée de calques et le bandeau du mur : on lisait « Retour de mur » et
      la ligne qui explique le geste passait sous les boutons. Le haut du plan
      est libre : seule la pastille 2D/3D y tient, et elle est à droite.
    */
    top: 10,
    left: 10,
    maxWidth: 230,
    backgroundColor: c.blueSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pierNoteTitle: { color: c.blue, fontSize: 12, fontWeight: '800' },
  pierNoteHint: {
    color: c.inkSoft,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  /**
   * LA POIGNÉE D'UN BORD : une barre posée SUR le contour.
   *
   * Assez large pour se voir sans masquer le meuble, et sa zone touchable
   * déborde de tous les côtés — c'est elle qu'on vise du pouce, pas le trait.
   */
  sideTouch: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBar: {
    width: 30,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.blue,
  },
  rotHandle: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.16,
  },
  rotBadge: {
    position: 'absolute',
    minWidth: 48,
    borderRadius: radius.pill,
    backgroundColor: c.blue,
    paddingVertical: 4,
    alignItems: 'center',
  },
  rotBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  // Commandes du mur sélectionné : posées à côté de lui, jamais dessus.
  /*
    UNE PILULE, PAS UNE DALLE — relevé du patron : « trop imposant et
    vieillot ». Trois retouches qui se comptent : les colonnes perdent sept
    points (la barre, un quart de sa largeur), le rayon passe à la pilule,
    et un filet d'un cheveu la pose sur le plan — le contour des cartes de
    l'app, à la place d'une ombre qui portait seule tout le relief.
  */
  wallActions: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    paddingHorizontal: 6,
    paddingVertical: 5,
    ...shadowCard,
    shadowOpacity: 0.09,
  },
  // Quatre colonnes de même largeur : la barre ne s'étire plus au gré de la
  // longueur des mots.
  wallAction: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  wallActionText: {
    color: c.ink,
    fontSize: 8.5,
    fontWeight: '600',
    marginTop: 2,
    opacity: 0.5,
  },
  // Hors de l'emprise et en retrait : une croix rouge posée SUR le meuble
  // se lit comme une partie de lui, et se touche par accident.
  /** Zone de saisie d'une poignée : posée sur le dessin, sans décor. */
  dragZone: { position: 'absolute' as const },
  /* La pastille qui referme un trou du relevé : rouge comme le manque. */
  /* Taille et rayon viennent de l'échelle du plan : voir
     `taillePastilleTrou`. Ici, ce qui ne dépend pas du zoom. */
  trouPastille: {
    position: 'absolute',
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B0D12',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  objDelete: {
    position: 'absolute',
    opacity: 0.92,
    // Trente-quatre points, comme la poignée de rotation et la pastille des
    // cotes : trois tailles différentes sur une même rangée se voient.
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B0D12',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  objMeasure: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.16,
  },
  objMeasureOn: { backgroundColor: c.blue },
  handleDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: c.blue,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#0B0D12',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
}));
