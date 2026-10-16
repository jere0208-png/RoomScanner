import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { texteDeMesure, type Mesure } from '../geometry/regle';
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
  ClipPath,
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
import { hexDePeinture } from '../ui/peintures';
import { solSurLePlan } from '../ui/habillage';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import {
  bounds,
  castToWall,
  clampFootprint,
  ECHELLE_MAX_PLAN,
  makeMapping,
  quadPoints,
  roomOf,
  angleAimante,
  anglesRemarquables,
  deplier,
  massifsTechniques,
  placeDuDetecteur,
  pivotsDesBattants,
  roomParts,
  segLength,
  filtrerAuNiveau,
  toFootprint,
  trousDuRelevé,
  northScreenAngle,
  planFrameAngle,
  wallQuads,
  wallRuns,
  WALL_T,
  type ObjectFootprint,
  type PoseDeMur,
  type Pt,
  type RoomPart,
  type TrouDeReleve,
  type WallQuad,
  type WallRun,
  type WallSeg,
  pointOnSeg,
  epaisseurDe,
  facesDesMurs,
  type DemiFaces,
  etendueDeLaPiece,
  longueurCotee,
  nomAbrege,
  wallQuadsOf,
  jonctionsDetaillees,
} from '../geometry/floorplan';
import { dessinDesNatures, renduNature } from '../geometry/natureMurs';
import type { ObjectData } from 'react-native-room-scan';
import {
  faceX,
  facePoint,
  interiorSide,
  wallFace,
} from '../geometry/electrical';
import { frCategory, furnKind, furnitureStrokes, meridienneDe } from '../geometry/furniture';
import { markColor } from '../geometry/schema';
import { bleuFenetre, encreElectrique } from '../ui/encreElec';
import { cheminDuPoche, pocheDesMurs, SUREPAISSEUR_FACADE } from '../geometry/poche';
import { cibleDeFacade, cotesExterieurs } from '../geometry/cibleMur';
import { CeilingLayer, LARGEUR_CIBLE_RUBAN, rayonDuPointLumineux } from './CeilingLayer';
import { CeilingIcon } from './CeilingIcon';
import { FixtureLayer, poseDeLUnite, rayonDAppareil, unitesDesAppareils } from './FixtureLayer';
import { VignetteAppareil } from './VignetteAppareil';
import { OndeePose, useNaissances } from './Vivant';
import { NotesLayer } from './NotesLayer';
import { aimanterCoin, poserLibre } from '../geometry/poser';
import {
  POIDS_ECART,
  etiquettesDesEcarts,
} from '../ui/etiquettesPlafond';
import type { Boite } from '../ui/ecarter';
import { pointInPolygon as insidePoly } from '../geometry/appearance';
import { FIXTURES, type Fixture } from '../geometry/electrical';
import { C_LED, CEILINGS, type CeilingFixture } from '../geometry/ceiling';
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
/** Le même tableau vide à chaque rendu : voir `objects`. */
const VIDE_MEUBLES: ObjectData[] = [];

/**
 * L'encombrement du menu du mur — partagé avec le banc, qui prouve mur par
 * mur que la poignée de rotation ne le chevauche jamais.
 */

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
 * LES NOMS DES PIÈCES SUIVENT LE DÉZOOM — relevé du patron : « au dézoom du
 * plan 2D, les lumières restent bien en place, mais le ×2 et les noms de
 * pièces non ». Le cartouche gardait ses dix points et demi quel que soit le
 * zoom : sur la vue d'ensemble, le nom d'une petite pièce débordait sur ses
 * murs. Au cadrage d'ouverture et en zoomant, il garde sa taille, celle
 * qu'on lit ; en dézoomant, il rapetisse avec le plan, jusqu'à 45 %.
 */
export function echelleDesNoms(zoom: number): number {
  return Math.min(1, Math.max(0.45, zoom));
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

interface EffMapping {
  scale: number;
  toPx: (p: { x: number; z: number }) => { x: number; y: number };
  deltaToMeters: (dx: number, dy: number) => { x: number; z: number };
  toMeters: (px: { x: number; y: number }) => { x: number; z: number };
}
import { RoomScan } from 'react-native-room-scan';
import { meubleAuDoigt, meubleEtire, meubleTourne, useScanStore } from '../store/scanStore';
import { finirLeGeste, mettreEnVol, signalerRefus, useEnVol } from '../store/geste';
import type { PlanNote } from '../store/scanStore';
import {
  boiteDePoints,
  encombrement,
  milieuVisible,
  PETITE_COTE,
  petiteCoteLisible,
  placerEtiquettes,
  plaqueDeCote,
  type EtiquetteMobile,
  type Place,
} from '../geometry/cotes';
import { haptic, releaseHaptic } from '../ui/haptic';
import { creerSeuil, estUnGlissement, estUnTap } from '../ui/geste';
import { dansLeCadre, type CadreEcran } from '../geometry/lacher';
import { DEBORD_DOIGT } from '../ui/bandeau';
import { SOLAIRES } from '../ui/solaires';
import { useModeElec } from '../store/usage';


/**
 * Empreinte d'un meuble, recalée contre les murs de SA pièce seulement :
 * la cloison de la pièce voisine ne doit pas le repousser.
 */
/** Les emprises déjà calculées : voir `footprintOf`. */
const EMPRISES = new WeakMap<
  ObjectData,
  { partOf: Map<string, RoomPart>; faces: Map<string, DemiFaces>; f: ObjectFootprint }
>();

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
  /** Les faces des murs du plan entier : voir `clampFootprint`. */
  faces: Map<string, DemiFaces>,
): ObjectFootprint {
  /*
    UNE EMPRISE PAR MEUBLE ET PAR PLAN, PAS QUATRE PAR RENDU. Le dessin, les
    cibles, les cartouches et les cotes la redemandaient chacun — et le
    recadrage contre les murs (`clampFootprint`) n'est pas gratuit. Le
    magasin rend un objet NEUF à chaque changement : la même référence, avec
    les mêmes pièces et les mêmes faces, a forcément la même emprise.
  */
  const deja = EMPRISES.get(o);
  if (deja && deja.partOf === partOf && deja.faces === faces) return deja.f;
  const part = partOf.get(roomOf(o));
  const f = part
    ? clampFootprint(toFootprint(o), part.walls, part.labelAt, undefined, undefined, faces)
    : toFootprint(o);
  EMPRISES.set(o, { partOf, faces, f });
  return f;
}

/** Le cadrage du plan : rotation (rad), zoom, et déplacement en pixels. */
export interface VuePlan {
  zoom: number;
  ox: number;
  oy: number;
  rot: number;
}

/**
 * DE QUOI VISER LE PLAN DEPUIS L'EXTÉRIEUR — le glisser-poser du catalogue.
 *
 * Le plan est le seul à savoir où il est à l'écran et quelle échelle il
 * porte : un meuble tiré depuis une fenêtre POSÉE PAR-DESSUS ne peut pas
 * atterrir sans le lui demander. Il remonte donc ces deux services, et rien
 * d'autre — l'écran n'a pas à connaître le zoom, la rotation, ni le cadrage.
 *
 * LA MESURE SE FAIT AU DÉBUT DU GESTE, pas au lâcher : `measureInWindow`
 * rend sa réponse plus tard, et un meuble qui se pose une image après le
 * doigt se pose à côté.
 */
export interface ViseurPlan {
  /** Le cadre du plan en coordonnées de page. `null` s'il n'est pas monté. */
  mesurer: (rendu: (cadre: CadreEcran | null) => void) => void;
  /** Un point de page vers le plan, en mètres. `null` s'il tombe dehors. */
  viser: (
    page: { x: number; y: number },
    cadre: CadreEcran,
  ) => { x: number; z: number } | null;
}

/**
 * SOUS LA RANGÉE DES PASTILLES (2D/3D, Explorer, contrôle…), qui tient le haut
 * du plan : 10 de marge, 34 de pastille, 10 d'air. Ce qui se pose en haut à
 * gauche du plan commence là — sans quoi il se colle à elles.
 */
const HAUT_SOUS_LES_PASTILLES = 54;

interface Props {
  /** Cotes visibles le long des murs. */
  showMeasures: boolean;
  /** Cadrage de départ — celui que la 3D avait, quand on en revient. */
  vueInitiale?: VuePlan;
  /**
   * CE QUE LES BARRES POSÉES SUR LE PLAN EN CACHENT, en haut et en bas (pt).
   * Vu sur les captures du simulateur : le plan se centrait sur tout le
   * canevas, et les pastilles du haut comme les outils du bas en mangeaient
   * les bords — un grand vide au-dessus, le bas sous les boutons. Le
   * cadrage de départ se centre sur ce qui reste visible.
   */
  marges?: { haut: number; bas: number };
  /** Cadrage courant, remonté à chaque geste : la 3D le reprend tel quel. */
  onView?: (v: VuePlan) => void;
  /**
   * Remonte de quoi VISER le plan depuis l'écran — le glisser-poser du
   * catalogue. Appelé une fois au montage, et avec `null` au démontage.
   */
  onViseur?: (v: ViseurPlan | null) => void;
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
   * L'IMAGE PARTAGÉE, PLEIN CADRE — revue « Léon » : l'image d'une chambre
   * de 3 m sortait au plafond d'échelle de l'écran (55 pt/m), le plan sur la
   * moitié de la largeur et le sol sur un dixième de l'image. Le temps de la
   * capture, un plan qu'on n'a ni zoomé ni déplacé s'agrandit jusqu'au
   * cadre. Un plan cadré à la main part tel qu'on le voit.
   */
  pleinCadre?: boolean;
  /**
   * LES POSES OFFERTES À UN MUR NEUF — les fantômes bleus qu'on touche.
   *
   * Relevé du patron : « "Ajouter un mur" doit afficher les multiples
   * possibilités d'attachement à un autre mur dans des angles de 90° et 180°
   * pour droit, à chaque fin de mur ; ces choix de pose doivent être en bleu
   * à faible opacité ».
   *
   * Elles se calculent dans la géométrie (`posesDeMur`) et se dessinent ici :
   * le plan sait où sont les bouts, il ne sait pas ce qu'on veut y faire.
   */
  poses?: PoseDeMur[];
  onPose?: (id: string) => void;
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
  photos?: { id: string; wallId: string; along: number; auto?: boolean }[];
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
  /** `aimant` : faux pendant le glisser, vrai au lâcher (voir `moveRoom`). */
  onMoveRoom?: (dx: number, dz: number, aimant?: boolean) => void;
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
  /** Les meubles qui en chevauchent un autre : leur trait reste rouge. */
  meublesEnConflit?: Set<string>;
  /**
   * Appui sur un recoin poché en noir : `at` est un point dedans. Il sert à
   * le déclarer (« C'est un placard »).
   */
  onRecoin?: (at: Pt) => void;
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
  onSelectNote?: (id: string | null) => void;
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
  /**
   * UN JETON QUI EFFACE LE RETOUR CHOISI — l'écran le fait tourner quand
   * une autre sélection prend la main, ou quand on referme le menu : le
   * retour vit ici, et deux sélections ne coexistent pas.
   */
  retourEfface?: number;
  /**
   * LES PORTES QU'UN MEUBLE EMPÊCHE DE S'OUVRIR — relevé du patron, point 6
   * de la réflexion « grand public ». Leur battant se dessine en rouge, sa
   * surface teintée : on voit d'un coup d'œil quelle porte coince.
   */
  portesBloquees?: Set<string>;
  /**
   * Les mêmes, pour le meuble que le doigt tient en vol : la porte rougit
   * dès qu'il entre dans son battant, sans attendre le lâcher (voir
   * `useEnVol`).
   */
  bloqueesEnVol?: (meuble: ObjectData) => Set<string>;
  /**
   * LA RÈGLE LIBRE — relevé du patron, point 7 de la réflexion « grand
   * public » : mesurer entre deux points du plan. Sortie (`regle` non nul),
   * chaque appui pose un bout ; ses bouts se glissent. L'écran accroche les
   * points (coins, nu des murs, meubles) : le plan ne fait que viser.
   */
  regle?: { a: Pt | null; b: Pt | null } | null;
  /** Un appui sur le plan, règle sortie : le point visé, et la largeur d'un doigt (m). */
  onRegleTap?: (p: Pt, tolerance: number) => void;
  /** Un bout de règle glissé. */
  onRegleBout?: (bout: 'a' | 'b', p: Pt, tolerance: number) => void;
  /** Les cotes gardées, à l'étage affiché. */
  mesures?: Mesure[];
  selectedMesureId?: string | null;
  onSelectMesure?: (id: string | null) => void;
}

/**
 * Plan 2D vu de dessus, dérivé du store (source de vérité paramétrique).
 * En lecture : plan épuré, cotes discrètes. En édition : murs sélectionnables
 * et coins déplaçables (les murs soudés au même coin suivent).
 */
/**
 * LA TOILE DU PLAN, ET SA MARGE — un état À ELLE.
 *
 * Relevé du patron : « le plan 2D sur l'exemple saccade en le bougeant ».
 * Le geste lui-même ne coûtait rien (une transformation native), mais la
 * PRISE du doigt, si : pour ouvrir la toile (voir « LA TOILE S'OUVRE LE
 * TEMPS DU GESTE »), l'éditeur passait un état à vrai — et se rendait tout
 * entier, six cent quatre-vingt-dix balises sur l'exemple, au moment même où
 * le doigt commençait à glisser. Le plan restait figé un instant, puis
 * sautait sous le doigt.
 *
 * La marge vit donc ici. L'ouvrir ne rend que la toile : ses enfants sont
 * les MÊMES éléments qu'au rendu d'avant, et React ne les reprend pas.
 */
function ToileDuPlan({
  largeur,
  hauteur,
  ouvrir,
  children,
}: {
  largeur: number;
  hauteur: number;
  /** Où l'éditeur trouve de quoi ouvrir (ou refermer) la toile, en points. */
  ouvrir: React.MutableRefObject<((marge: number) => void) | null>;
  children: React.ReactNode;
}) {
  const [marge, setMarge] = useState(0);
  useLayoutEffect(() => {
    ouvrir.current = setMarge;
    return () => {
      ouvrir.current = null;
    };
  }, [ouvrir]);
  return (
    <Svg
      width={largeur + 2 * marge}
      height={hauteur + 2 * marge}
      viewBox={`${-marge} ${-marge} ${largeur + 2 * marge} ${hauteur + 2 * marge}`}
      style={marge ? { marginLeft: -marge, marginTop: -marge } : undefined}>
      {children}
    </Svg>
  );
}

/**
 * CE QUI SUIT LE MEUBLE TENU — et rien d'autre ne se rend.
 *
 * Relevé du patron : « optimise la fluidité des déplacements de meubles ».
 * Pendant un glisser, le meuble vit « en vol » (`store/geste`) et le magasin
 * n'est écrit qu'au lâcher : l'éditeur et l'écran qui le porte ne se rendent
 * plus à chaque image. Seuls les morceaux qui DESSINENT le meuble tenu — son
 * empreinte, ses dégagements, ses poignées, ses puces — passent par ici :
 * ils lisent le meuble en vol à la place de celui du magasin, et se rendent
 * seuls.
 *
 * `render` est le dessin d'avant, tel quel : il reçoit le meuble à dessiner.
 */
export function SuitLeDoigt({
  objet,
  render,
}: {
  objet: ObjectData;
  render: (o: ObjectData, refuse: boolean) => React.ReactNode;
}) {
  const enVol = useEnVol((s) => (s.objet?.id === objet.id ? s.objet : null));
  const refuse = useEnVol((s) => s.refuse);
  return <>{render(enVol ?? objet, refuse)}</>;
}

/**
 * Le meuble tenu, quel qu'il soit — pour ce qui en dépend sans le dessiner
 * (les battants qu'il bloque). `null` hors geste.
 */
export function SuitLeVol({ render }: { render: (o: ObjectData | null) => React.ReactNode }) {
  const enVol = useEnVol((s) => s.objet);
  return <>{render(enVol)}</>;
}

/** Une chose qui se choisit sur le plan, telle que la carte du choix la nomme. */
interface CibleDuPlan {
  cle: string;
  libelle: string;
  /** Où elle est : au plafond, au mur, un meuble, une menuiserie. */
  genre: string;
  icone: React.ReactNode;
  choisir: () => void;
}

/**
 * LA CARTE DU CHOIX — posée au-dessus du doigt (en dessous s'il n'y a pas la
 * place), tenue dans le cadre. Toucher ailleurs la referme sans rien choisir.
 */
function ChoixSousLeDoigt({
  choix,
  largeur,
  hauteur,
  onFermer,
}: {
  choix: { x: number; y: number; cibles: CibleDuPlan[] };
  largeur: number;
  hauteur: number;
  onFermer: () => void;
}) {
  const styles = getStyles(useTheme());
  const LARGEUR = 232;
  const haut = 40 + choix.cibles.length * 52;
  const left = Math.max(8, Math.min(largeur - LARGEUR - 8, choix.x - LARGEUR / 2));
  const dessus = choix.y - haut - 22;
  const top = dessus >= 8 ? dessus : Math.min(hauteur - haut - 8, choix.y + 22);
  return (
    <>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onFermer}
        accessibilityLabel="Fermer le choix"
      />
      <View pointerEvents="none" style={[styles.choixDoigt, { left: choix.x - 9, top: choix.y - 9 }]} />
      <View style={[styles.choixCarte, { left, top: Math.max(8, top), width: LARGEUR }]} accessibilityRole="menu">
        <Text style={styles.choixTitre}>{`${choix.cibles.length} éléments ici`}</Text>
        {choix.cibles.map((cb) => (
          <TouchableOpacity
            key={cb.cle}
            style={styles.choixLigne}
            activeOpacity={0.6}
            accessibilityRole="menuitem"
            accessibilityLabel={`Choisir ${cb.libelle}`}
            onPress={() => {
              onFermer();
              cb.choisir();
            }}>
            <View style={styles.choixIcone}>{cb.icone}</View>
            <View style={styles.choixTextes}>
              <Text style={styles.choixNom} numberOfLines={1}>
                {cb.libelle}
              </Text>
              <Text style={styles.choixGenre} numberOfLines={1}>
                {cb.genre}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

export function FloorplanEditor({
  showMeasures,
  vueInitiale,
  marges,
  onView,
  onViseur,
  editable,
  selectedWallId,
  onSelectWall,
  cableRoutes: cableRoutesDemandees,
  circuitMarks: circuitMarksDemandes,
  filigrane,
  pleinCadre,
  poses,
  onPose,
  recalage,
  photos,
  onSelectPhoto,
  selectedObjectId,
  onDeleteObject,
  selectedRoomId,
  onSelectRoom,
  onMoveRoom,
  onEditRoomName,
  retourEfface,
  portesBloquees,
  bloqueesEnVol,
  regle,
  onRegleTap,
  onRegleBout,
  mesures,
  selectedMesureId,
  onSelectMesure,
  onSelectFixture,
  ceiling,
  showCeiling: showCeilingDemande,
  showNorth = true,
  showFixtures: showFixturesDemande = true,
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
  meublesEnConflit,
  onRecoin,
  showObjectDims,
  onToggleObjectDims,
}: Props) {
  /*
    LE MODE ÉLECTRICITÉ, LU ICI ET NULLE PART AILLEURS POUR LE PLAN.

    Relevé du patron : « c'est trop axé électricité et pas très intuitif pour
    ceux qui n'y comprennent rien ». Sans le mode, le plan ne dessine ni
    appareils, ni plafond équipé, ni gaines, ni repères de circuit — même si
    le relevé en porte. Il les MASQUE : les données restent, et rallumer le
    mode les rend telles quelles (voir `store/usage`).

    C'EST LE PLAN QUI LIT LA PRÉFÉRENCE, et non l'écran qui la lui passe : il
    est monté par l'écran du relevé, par l'export, par l'exploration — un
    seul oubli parmi eux, et un particulier verrait réapparaître une prise.
    Une décision prise à la source ne s'oublie pas en route.
  */
  const modeElec = useModeElec();
  const showFixtures = modeElec && showFixturesDemande;
  const showCeiling = modeElec ? showCeilingDemande : false;
  const cableRoutes = modeElec ? cableRoutesDemandees : undefined;
  const circuitMarks = modeElec ? circuitMarksDemandes : undefined;
  const tousLesMurs = useScanStore((s) => s.walls);
  const niveauCourant = useScanStore((s) => s.niveauCourant);
  const toutesLesOuvertures = useScanStore((s) => s.openings);
  const tousLesMeubles = useScanStore((s) => s.objects);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const toutesLesPieces = useScanStore((s) => s.rooms);
  const toutLAppareillage = useScanStore((s) => s.fixtures);
  /*
    UN SEUL ÉTAGE À LA FOIS — relevé du patron, capture à l'appui :
    « ajouter un étage ne fonctionne pas bien, une construction mal faite
    apparaît sur un autre plan ».

    L'écran des résultats filtrait par niveau : ses chiffres, son métré, son
    dossier ne parlaient que de l'étage choisi. Le DESSIN, lui, ne filtrait
    rien — il lisait les murs, les pièces, les meubles et l'appareillage
    directement dans le magasin, tous niveaux confondus. On voyait donc deux
    logements l'un sur l'autre, chacun avec son cartouche de pièce.

    Et ce n'était pas seulement laid : les jonctions d'onglet se calculent
    sur le GRAPHE des murs. Deux étages mêlés, et un mur du haut s'assemble
    avec un mur du bas qu'il croise — c'est la « construction mal faite ».

    Le niveau du dessous reste visible, mais à sa place : en filigrane, un
    trait d'axe, posé par l'écran (`filigrane`).
  */
  const { walls, openings, rooms, fixtures, objects: meublesDuNiveau } = useMemo(
    () =>
      filtrerAuNiveau(
        {
          walls: tousLesMurs,
          openings: toutesLesOuvertures,
          rooms: toutesLesPieces,
          fixtures: toutLAppareillage,
          photos: [],
          objects: tousLesMeubles,
          ceiling: [],
        },
        niveauCourant,
      ),
    [
      tousLesMurs,
      toutesLesOuvertures,
      toutesLesPieces,
      toutLAppareillage,
      tousLesMeubles,
      niveauCourant,
    ],
  );
  // Un appareil de plafond en réglage : le sol s'efface pour qu'on voie
  // où il tombe par rapport aux murs.
  /*
    STABLE D'UN RENDU À L'AUTRE — sinon les mémos qui en dépendent se
    refont à chaque image. Un tableau littéral `[]` est un objet NEUF à
    chaque rendu : le mémo des cartouches, qui compte les meubles à esquiver,
    se recalculerait cinquante fois par seconde pendant un glissement.
  */
  const objects = useMemo(
    () =>
      showFurniture && !selectedCeilingId && !selectedCeilingRow
        ? meublesDuNiveau
        : VIDE_MEUBLES,
    [showFurniture, selectedCeilingId, selectedCeilingRow, meublesDuNiveau],
  );
  const north = useScanStore((s) => s.north);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const showGrille = useScanStore((s) => s.showGrille);
  const c = useTheme();
  const styles = getStyles(c);
  /* Le conteneur du plan : c'est LUI qu'on mesure pour viser depuis
     l'ecran, pas son parent, qui porte des marges. */
  const hote = useRef<View>(null);
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const setNorth = useScanStore((s) => s.setNorth);
  /** La consigne d'orientation est affichée : le prochain appui valide. */
  const [invite, setInvite] = useState(false);
  // Un plan qu'on quitte en pleine invitation n'oublie pas la boussole allumée.
  const boussoleAllumee = useRef(false);
  useEffect(() => () => {
    if (boussoleAllumee.current) RoomScan.stopHeading().catch(() => {});
  }, []);

  // Navigation du plan : zoom (pincer), déplacement (glisser), rotation (torsion).
  const [view, setView] = useState(
    vueInitiale ?? { zoom: 1, ox: 0, oy: 0, rot: 0 },
  );
  /** Le dernier doigt posé, dans le cadre du plan (px). Voir `toucher`. */
  const dernierToucher = useRef<{ x: number; y: number } | null>(null);
  /** Plusieurs choses sous le doigt : la carte qui demande laquelle. */
  const [choixSousLeDoigt, setChoixSousLeDoigt] = useState<{
    x: number;
    y: number;
    cibles: CibleDuPlan[];
  } | null>(null);
  // Le plan bouge : la carte, posée près d'un point, n'a plus de sens.
  useEffect(() => setChoixSousLeDoigt(null), [view]);
  /*
    LE PLAN DIT OÙ IL EN EST — et la 3D reprend exactement là.

    Passer en volume donnait un logement orienté autrement : on avait tourné
    le plan pour l'avoir dans le bon sens, et la 3D repartait de son angle à
    elle. Le relevé du chantier est net : « le plan doit se placer exactement
    comme l'autre ». On remonte donc la rotation, le zoom et le déplacement à
    l'écran qui les tient, et c'est lui qui les repasse à la vue d'à côté.
  */
  /** De quoi ouvrir la toile le temps du geste (voir `ToileDuPlan`). */
  const ouvrirLaToile = useRef<((marge: number) => void) | null>(null);
  /*
    LE MEUBLE QU'ON NE PEUT PAS POSER LÀ.

    Relevé du patron : « impossible à placer sur un mur (meuble rouge au
    placement si impossible) ». Le refus se voit AVANT le lâcher : c'est ce
    qui distingue une aide d'une sanction — on sait qu'il ne faut pas lâcher
    ici, on n'a pas à le découvrir après coup.

    Il vit avec le meuble en vol (`signalerRefus`) : un état de l'éditeur le
    rendait tout entier à chaque bascule du rouge, en plein glisser.
  */
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
    volume, c'est-à-dire une fois le geste fini. Elle ne change d'ailleurs
    qu'à ce moment-là : le geste vit dans `vueVive`, et l'état n'est posé
    qu'au lâcher. L'effet part donc avec la vue finale, et elle seule.
  */
  useEffect(() => {
    onView?.(view);
  }, [view, onView]);
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
        !!onMoveRoom && estUnGlissement(g.dx, g.dy) && pieceSousLeDoigt(e),
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
        // Pendant le geste, sans aimant : il ramenait la pièce à chaque pas.
        onMoveRoom?.(d.x, d.z, false);
      },
      // Au lâcher : l'aimant et la soudure des murs qui se recouvrent.
      onPanResponderRelease: () => onMoveRoom?.(0, 0, true),
      onPanResponderTerminate: () => onMoveRoom?.(0, 0, true),
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
        if (!estUnGlissement(g.dx, g.dy)) return false;
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
        /*
          LA TOILE NE S'OUVRE QUE SI LE DESSIN DÉBORDE. Un plan qui tient
          tout entier à l'écran est déjà peint en entier : le glisser, le
          pincer ou le tourner ne fait entrer aucun vide. Rien à rendre à la
          prise — c'est le cas de l'exemple, cadré à l'ouverture.
        */
        if (debordeRef.current) {
          const l = layoutRef.current;
          ouvrirLaToile.current?.(Math.round(Math.max(l.w, l.h) * 0.8));
        }
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
        ouvrirLaToile.current?.(0);
        setView(vueVive.current);
      },
      onPanResponderTerminate: () => {
        ouvrirLaToile.current?.(0);
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
          /* Deux dixièmes, pas quatre : sur un plan déjà cadré serré — un
             étage minuscule — s'arrêter à quatre dixièmes ne rendait rien.
             « Impossible de le rendre plus petit que ça », relevé du
             patron. */
          const zoom = Math.min(6, Math.max(0.2, base.v.zoom * (d / base.d0)));
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

  /*
    CADRAGE FIGÉ sur le scan chargé — et sur l'ÉTAGE regardé.

    Figé sur les éditions, sinon le plan « respire » pendant qu'on déplace un
    coin. Mais il se refait quand on change de niveau : depuis que chaque
    étage se dessine seul, garder le cadrage de l'autre revient à regarder à
    côté.

    IL COMPTE LE NIVEAU DU DESSOUS. C'est ce qu'on a sous les yeux — le
    filigrane — et c'est le repère sur lequel on aligne l'étage. Un relevé
    d'étage raté fait un mètre trente : cadré sur lui seul, il remplissait
    l'écran et le repère fuyait hors du cadre, c'est-à-dire que l'on perdait
    la seule chose qui aide. L'échelle est plafonnée par ailleurs
    (`ECHELLE_MAX_PLAN`) : deux murs ne se grossissent pas jusqu'au bord.

    ET IL SE REFAIT QUAND UNE PIÈCE ARRIVE (ou s'en va) — revue « Théo » :
    la chambre ajoutée à côté du séjour sortait de l'écran (507 points de
    plan pour 390 d'écran), et rien ne ramenait le plan entier sous les
    yeux. Le nombre de pièces ne bouge pas pendant qu'on tire un coin : le
    plan ne respire toujours pas sous le doigt.
  */
  const nbPieces = rooms.length;
  const auRepos =
    Math.abs(view.zoom - 1) < 1e-3 && Math.abs(view.ox) < 0.5 && Math.abs(view.oy) < 0.5 && Math.abs(view.rot) < 1e-3;
  const plafondDEchelle = pleinCadre && auRepos ? Infinity : ECHELLE_MAX_PLAN;
  const baseMapping = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    const haut = marges?.haut ?? 0;
    const utile = layout.h - haut - (marges?.bas ?? 0);
    if (utile < layout.h * 0.5) {
      return makeMapping(bounds([...walls, ...(filigrane ?? [])]), layout.w, layout.h, 40, plafondDEchelle);
    }
    const m = makeMapping(bounds([...walls, ...(filigrane ?? [])]), layout.w, utile, 40, plafondDEchelle);
    return {
      ...m,
      toPx: (p: { x: number; z: number }) => {
        const q = m.toPx(p);
        return { x: q.x, y: q.y + haut };
      },
      toMeters: (px: { x: number; y: number }) => m.toMeters({ x: px.x, y: px.y - haut }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSaveId, niveauCourant, layout.w, layout.h, nbPieces, plafondDEchelle, marges?.haut, marges?.bas]);

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
  const grille = useMemo(() => {
    if (!showGrille || !mapping || walls.length === 0) return null;
    const b = bounds(walls);
    const x0 = Math.floor(b.minX * 2) / 2 - 1;
    const x1 = Math.ceil(b.maxX * 2) / 2 + 1;
    const z0 = Math.floor(b.minZ * 2) / 2 - 1;
    const z1 = Math.ceil(b.maxZ * 2) / 2 + 1;
    const traits: React.ReactElement[] = [];
    const trait = (cle: string, a: { x: number; z: number }, d: { x: number; z: number }, metre: boolean) => {
      const p = mapping.toPx(a);
      const q = mapping.toPx(d);
      traits.push(
        <Line
          key={cle}
          x1={p.x}
          y1={p.y}
          x2={q.x}
          y2={q.y}
          stroke={metre ? c.lineStrong : c.line}
          strokeWidth={metre ? 1 : 0.6}
        />,
      );
    };
    for (let x = x0; x <= x1 + 1e-6; x += 0.5) {
      trait(`gx${x.toFixed(1)}`, { x, z: z0 }, { x, z: z1 }, Math.abs(x - Math.round(x)) < 1e-6);
    }
    for (let z = z0; z <= z1 + 1e-6; z += 0.5) {
      trait(`gz${z.toFixed(1)}`, { x: x0, z }, { x: x1, z }, Math.abs(z - Math.round(z)) < 1e-6);
    }
    return <G pointerEvents="none">{traits}</G>;
  }, [showGrille, mapping, walls, c.line, c.lineStrong]);
  /*
    LA MARGE DE LA TOILE : nulle au repos, large pendant le geste — et
    seulement si le dessin déborde de l'écran (voir la prise du doigt).

    Huit dixièmes de la plus grande dimension : un doigt ne traverse pas
    l'écran et demi d'un seul trait, donc son bord n'est jamais atteint. Un
    nombre ROND, arrondi au point, sinon le `viewBox` change à chaque
    fraction de pixel de mise en page.

    LE DESSIN DÉBORDE-T-IL ? Un bout de mur à moins de trente-six points du
    bord — la place d'une cote — suffit : ce qui l'entoure a pu ne pas être
    peint. Le cadrage d'ouverture en laisse quarante (`makeMapping`) : un
    plan qu'on n'a pas encore déplacé ne déborde jamais.
  */
  const deborde = useMemo(() => {
    if (!mapping) return false;
    const BORD = 36;
    for (const w of [...walls, ...(filigrane ?? [])]) {
      for (const pt of [w.a, w.b]) {
        const q = mapping.toPx(pt);
        if (q.x < BORD || q.y < BORD || q.x > layout.w - BORD || q.y > layout.h - BORD) return true;
      }
    }
    return false;
  }, [mapping, walls, filigrane, layout.w, layout.h]);
  const debordeRef = useRef(deborde);
  debordeRef.current = deborde;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

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
  // L'écran efface le retour quand une autre sélection prend la main.
  const premierJeton = useRef(true);
  useEffect(() => {
    if (premierJeton.current) {
      premierJeton.current = false;
      return;
    }
    setPier(null);
  }, [retourEfface]);

  // Corps des murs : onglets calculés une fois pour tout le rendu. Ils ne se
  // dessinent plus (voir le poché) : ils donnent les faces, et le toucher.
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
  /** Le côté du dehors de chaque façade : sa surépaisseur se touche aussi. */
  const dehorsDesMurs = useMemo(() => cotesExterieurs(walls, parts), [walls, parts]);
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
    // Les pièces déclarées passent aussi : une pièce qu'on vient de tracer
    // n'a pas encore de porte, et elle n'est pas pour autant du plein.
    () => massifsTechniques(walls, openings, rooms),
    [walls, openings, rooms],
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

  /*
    LE POCHÉ — relevé du patron, plans d'architecte à l'appui : « pas de
    triangle de jonction, tout est clean ; un mur en continu avec celui qu'il
    rencontre ; les murs extérieurs plus épais ». La maçonnerie se dessine
    d'UN seul tenant (voir `pocheDesMurs`) : les murs se fondent à leurs
    jonctions, les façades prennent leur épaisseur vers le dehors, les baies
    sont de vrais vides. Les murs d'une pièce qu'on vient de poser n'y
    entrent pas : leur trait reste ouvert, en tirets, jusqu'au lâcher.
  */
  const mursPoses = useMemo(
    () => walls.filter((w) => !roomById.get(roomOf(w) ?? '')?.neuve),
    [walls, roomById],
  );
  /*
    Le poché se refait quand un mur bouge — à chaque image d'un glissé. Il se
    calcule donc sur une valeur DIFFÉRÉE : le doigt n'attend pas l'union, le
    mur tenu se dessine en bleu en temps réel, et la maçonnerie se recale dès
    que le geste lui en laisse le temps.
  */
  const mursDifferes = useDeferredValue(mursPoses);
  const baiesDifferees = useDeferredValue(openings);
  const poche = useMemo(
    () => pocheDesMurs(mursDifferes, baiesDifferees, rooms),
    [mursDifferes, baiesDifferees, rooms],
  );
  const baieDuPoche = useMemo(() => new Map(poche.baies.map((b) => [b.id, b])), [poche]);
  /*
    LA NATURE DES MURS, PAR-DESSUS LE POCHÉ — relevé du patron, plan
    d'architecte à l'appui : la cloison en plaque de plâtre en gris cerné, le
    doublage en boucles, le mur à démolir en jaune, celui à créer en rouge
    (voir `natureMurs`). Le poché noir reste le fond : chaque corps de mur
    marqué s'y peint, découpé au poché pour que les baies restent des vides,
    et le cœur d'un nœud prend la nature de ses murs quand ils la partagent.
  */
  const corpsDeNature = useMemo(
    () => dessinDesNatures(mursDifferes, wallQuadsOf(mursDifferes), jonctionsDetaillees(mursDifferes)),
    [mursDifferes],
  );
  // Le sol garde sa teinte neutre. Les couleurs relevées au scan ne servent
  // qu'à la vue 3D : sur un plan vu de dessus, sous le poché des murs et le
  // semis des points, elles ne se lisaient pas.
  /*
    LE PLAN ÉLECTRIQUE, COMME CELUI DE L'ARCHITECTE — relevé du patron :
    « fais pareil pour le plan électrique, comme le plan d'architecte ».
    Dès que l'électricité est affichée, elle parle d'une seule encre rouge
    (voir `ui/encreElec`), et l'architecture se met en retrait : sols blancs,
    mobilier en gris clair. On lit l'électricité d'un coup d'œil.
  */
  const planElec = showFixtures || showCeiling;
  const encre = planElec ? encreElectrique(c) : undefined;
  /*
    LE SOL CHOISI DANS « DÉCORER » SE VOIT — correctif de l'audit : le décor
    était invisible sur le plan 2D. Pas sur le plan de l'électricien, qui
    met l'architecture en retrait pour lire ses circuits.
  */
  const fillOf = useMemo(
    () => (roomId: string) => {
      const fond = planElec ? c.surface : c.surfaceSunken;
      if (planElec) return fond;
      return solSurLePlan((roomById.get(roomId) as { sol?: string } | undefined)?.sol, fond) ?? fond;
    },
    [c, planElec, roomById],
  );
  const partOf = useMemo(
    () => new Map(parts.map((p) => [p.roomId, p])),
    [parts],
  );
  const facesPlan = useMemo(() => facesDesMurs(walls), [walls]);
  /*
    LA PEINTURE DES MURS, EN BANDE LE LONG DE LEUR NU — correctif de
    l'audit : peindre un mur depuis la 2D ne changeait rien à l'écran. Une
    bande de la teinte de la pièce court sous les murs, tenue DANS la pièce
    (le voisin a la sienne) ; un mur d'accent porte la sienne par-dessus. Le
    mur, dessiné ensuite, en couvre la moitié : il en reste quatre points.
  */
  const decorDesMurs = (part: RoomPart, poly: string, echelle: number) => {
    const piece = roomById.get(part.roomId) as
      | { peinture?: string; accents?: Record<string, string> }
      | undefined;
    const teinte = hexDePeinture(piece?.peinture);
    const accents = Object.entries(piece?.accents ?? {})
      .map(([wallId, cle]) => ({ w: part.walls.find((x) => x.id === wallId), hex: hexDePeinture(cle) }))
      .filter((x): x is { w: WallSeg; hex: string } => !!x.w && !!x.hex);
    if (!teinte && accents.length === 0) return null;
    const clip = `decor-${part.roomId}`;
    const epais = Math.max(...part.walls.map((w) => epaisseurDe(w))) * echelle + 8;
    return (
      <G pointerEvents="none">
        <Defs>
          <ClipPath id={clip}>
            <Polygon points={poly} />
          </ClipPath>
        </Defs>
        {teinte ? (
          <Polygon points={poly} fill="none" stroke={teinte} strokeWidth={epais} clipPath={`url(#${clip})`} />
        ) : null}
        {accents.map(({ w, hex }) => {
          const a = mapping!.toPx(w.a);
          const b = mapping!.toPx(w.b);
          return (
            <Line
              key={w.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={hex}
              strokeWidth={epaisseurDe(w) * echelle + 8}
              clipPath={`url(#${clip})`}
            />
          );
        })}
      </G>
    );
  };
  /**
   * OÙ SE POSE LE CARTOUCHE DE CHAQUE PIÈCE — CALCULÉ AVANT LES COTES.
   *
   * L'ORDRE EST LE SUJET. Le cartouche esquivait les cotes ; les cotes
   * ignoraient le cartouche. Chacun cherchait donc sa place contre un
   * adversaire qui avait déjà choisi la sienne, et dans une pièce serrée le
   * dernier arrivé n'avait plus rien : il se posait DESSUS.
   *
   * Le dossier imprimé avait tranché il y a longtemps, et dans l'autre
   * sens : « le cartouche évite les sigles, la cote évite les deux ». C'est
   * la bonne règle. Un nom de pièce se lit n'importe où DANS sa pièce — il
   * n'a qu'une contrainte, y rester. Une cote, elle, est attachée à ce
   * qu'elle mesure : elle glisse le long de son mur, mais elle ne peut pas
   * aller ailleurs.
   *
   * On pose donc les cartouches EN PREMIER, contre les meubles et les
   * appareils de plafond ; les cotes se rangent ensuite autour d'eux.
   *
   * CE MÉMO NE CALCULE QUE LA GÉOMÉTRIE — les textes, leur taille, la place
   * retenue. Les couleurs et les gestes restent au rendu : c'est la seule
   * façon d'avoir UNE source pour la boîte qu'on réserve et celle qu'on
   * dessine. Deux calculs de la même boîte finissent par diverger, et
   * l'arbitre protège alors une place que le dessin n'occupe pas.
   */
  const cartouches = useMemo(() => {
    const out = new Map<
      string,
      {
        pos: Pt;
        textes: { t: string; role: 'nom' | 'aire' | 'hors' | 'invite' }[];
        wpx: number;
        hpx: number;
        gene: boolean;
        /** Posé HORS de sa pièce : le point de la pièce où mène son trait de rappel. */
        rappel?: Pt;
      }
    >();
    if (!mapping || !showSurfaces || layout.w === 0) return out;
    const foots = objects.map((o) => footprintOf(o, partOf, facesPlan));
    const obstacles = [
      /*
        UN MEUBLE TOURNÉ ÉCHANGE SA LARGEUR ET SA PROFONDEUR — le canapé dos
        au refend de l'exemple est tourné d'un quart de tour : réservé à plat,
        il laissait le cartouche se poser sur son assise.
      */
      ...foots.map((f) => {
        const co = Math.abs(Math.cos(f.yaw));
        const si = Math.abs(Math.sin(f.yaw));
        return {
          x: f.cx,
          z: f.cz,
          rx: (f.width / 2) * co + (f.depth / 2) * si,
          rz: (f.width / 2) * si + (f.depth / 2) * co,
        };
      }),
      ...(showCeiling ? ceiling ?? [] : []).map((sp) => ({
        x: sp.at.x,
        z: sp.at.z,
        rx: 0.3,
        rz: 0.3,
      })),
    ];
    /* Les noms suivent le dézoom : voir `echelleDesNoms`. */
    const k = echelleDesNoms(view.zoom);
    const PAD = 4 * k;
    const LH = 12.5 * k;
    const TAILLES: Record<string, number> = {
      nom: 10.5 * k,
      aire: 9.5 * k,
      hors: 8.5 * k,
      invite: 10.5 * k,
    };
    const emprise = (ls: { t: string; role: string }[]) => ({
      w: Math.max(
        44 * k,
        Math.max(...ls.map((l) => l.t.length * (TAILLES[l.role] * 0.62))) + 14 * k,
      ),
      h: PAD * 2 + ls.length * LH,
    });
    /*
      DES ANNEAUX DE PLUS EN PLUS LARGES, SEIZE DIRECTIONS CHACUN.

      Huit directions laissaient des trous : entre deux rayons à
      quarante-cinq degrés, la place libre d'une pièce étroite passe
      inaperçue. Et l'on va jusqu'à trois mètres — au-delà on sortirait de
      la plupart des pièces, et le contour refuse de toute façon.
    */
    const anneaux: [number, number][] = [[0, 0]];
    for (const r of [0.3, 0.6, 0.9, 1.2, 1.6, 2, 2.5, 3]) {
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8;
        anneaux.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
    /** Les cartouches déjà posés, à l'écran : un cartouche sorti ne s'y pose pas. */
    const placesHors: Boite[] = [];
    const contoursPx = parts
      .map((p) => (p.surface?.pts ?? []).map((q) => {
        const e = mapping.toPx(q);
        return { x: e.x, z: e.y };
      }))
      .filter((cp) => cp.length >= 3);
    /**
     * UNE PLACE HORS DES PIÈCES, et le point de la pièce où mène le rappel.
     *
     * Hors de TOUTES les pièces — un cartouche posé dans la pièce voisine se
     * lirait comme le sien —, à distance de la façade et de la bande où
     * s'écrivent ses cotes, dans le cadre, et sans toucher un autre cartouche.
     */
    const horsDesPieces = (part: RoomPart, w: number, h: number, deja: Boite[]) => {
      const contour = part.surface?.pts;
      if (!contour || contour.length < 3) return null;
      const marge = 0.2 * mapping.scale + 22;
      for (const r of [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]) {
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8;
          const cand = { x: part.labelAt.x + Math.cos(a) * r, z: part.labelAt.z + Math.sin(a) * r };
          const q = mapping.toPx(cand);
          const b = { x: q.x - w / 2, y: q.y - h / 2, w, h };
          if (b.x < 4 || b.y < 4 || b.x + b.w > layout.w - 4 || b.y + b.h > layout.h - 4) continue;
          const x0 = b.x - marge;
          const y0 = b.y - marge;
          const lx = b.w + 2 * marge;
          const ly = b.h + 2 * marge;
          const echantillons: Pt[] = [];
          for (let i = 0; i <= 4; i++) {
            for (let j = 0; j <= 4; j++) echantillons.push({ x: x0 + (lx * i) / 4, z: y0 + (ly * j) / 4 });
          }
          if (echantillons.some((e) => contoursPx.some((cp) => insidePoly(e, cp)))) continue;
          if (contoursPx.some((cp) => cp.some((e) => e.x > x0 && e.x < x0 + lx && e.z > y0 && e.z < y0 + ly))) continue;
          if (deja.some((o) => !(b.x > o.x + o.w + 3 || o.x > b.x + b.w + 3 || b.y > o.y + o.h + 3 || o.y > b.y + b.h + 3))) continue;
          // Le rappel mène juste en deçà du mur, du côté du cartouche.
          let dedans = part.labelAt;
          for (let t = 0; t <= 1; t += 0.02) {
            const e = { x: part.labelAt.x + (cand.x - part.labelAt.x) * t, z: part.labelAt.z + (cand.z - part.labelAt.z) * t };
            if (!insidePoly(e, contour)) break;
            dedans = e;
          }
          const ux = cand.x - part.labelAt.x;
          const uz = cand.z - part.labelAt.z;
          const l = Math.hypot(ux, uz) || 1;
          const recul = Math.min(0.25, Math.hypot(dedans.x - part.labelAt.x, dedans.z - part.labelAt.z));
          return { pos: cand, rappel: { x: dedans.x - (ux / l) * recul, z: dedans.z - (uz / l) * recul } };
        }
      }
      return null;
    };
    for (const part of parts) {
      const roomName = roomById.get(part.roomId)?.name ?? '';
      const areaText = part.surface
        ? `${part.surface.exact ? '' : '≈ '}${part.surface.area
            .toFixed(1)
            .replace('.', ',')} m²`
        : null;
      if (roomName === '' && !areaText && !editable) continue;
      const extText =
        showMeasures && part.surface
          ? (() => {
              const e = etendueDeLaPiece(part.surface);
              return `${e.width.toFixed(2).replace('.', ',')} × ${e.depth
                .toFixed(2)
                .replace('.', ',')} m`;
            })()
          : null;
      const textes: { t: string; role: 'nom' | 'aire' | 'hors' | 'invite' }[] =
        [];
      if (roomName !== '') textes.push({ t: roomName, role: 'nom' });
      if (areaText) textes.push({ t: areaText, role: 'aire' });
      if (extText) textes.push({ t: extText, role: 'hors' });
      if (textes.length === 0 && roomName === '' && !areaText) {
        textes.push({ t: 'Nommer', role: 'invite' });
      }
      if (textes.length === 0) continue;
      /*
        ET S'IL NE TROUVE AUCUNE PLACE, IL EN DIT MOINS.

        Chercher plus loin ne suffit pas, et c'est la mesure qui l'a montré :
        sur un téléphone étroit, un logement de sept mètres se dessine à
        quarante pixels le mètre. Le cartouche à trois lignes fait alors
        soixante pixels de haut dans une chambre qui en fait cent — il n'y a
        PAS de place libre, et mieux la chercher ne la crée pas.

        Il cède donc ligne par ligne, de la moins utile à la plus utile :
        d'abord les hors-tout, puis la surface, et il ne reste que le NOM. Un
        nom seul fait vingt pixels de haut et trouve presque toujours où se
        mettre. C'est la règle du dossier imprimé, appliquée à l'écran :
        quand rien n'est libre, la valeur cède la place.
      */
      /*
        UNE SURFACE NE DISPARAÎT JAMAIS — revue des six testeurs (captures
        clair-11 et clair-23) : « Salle d'eau » sans ses m² à l'écran,
        « Entrée » sans les siens dans l'aperçu du PDF.

        Le cartouche cédait ligne par ligne jusqu'au NOM SEUL, et ce nom
        seul, vingt pixels de haut, trouvait sa place entre deux meubles
        AVANT que le repli « surface par-dessus un meuble » ne soit essayé :
        la surface partait alors qu'elle aurait tenu. La règle s'inverse — la
        surface passe avant le nom. Dans l'ordre, et la première qui tient
        gagne :
          1. le cartouche entier, puis sans hors-tout, puis au nom abrégé
             (« SdE », « Ch. 2 » : `nomAbrege`, la règle du dossier —
             plus de « Séjour-c… ») — sur le blanc de la pièce ;
          2. les mêmes, posés par-dessus un meuble (voir `gene`) ;
          3. le cartouche abrégé HORS de la pièce, relié à elle par un trait
             de rappel, comme sur un plan d'architecte ;
          4. faute de mieux, au milieu de la pièce, même s'il en déborde.
        Le nom seul ne reste que pour une pièce sans surface connue.
      */
      const variantes = [textes];
      if (textes.length > 2) variantes.push(textes.slice(0, 2));
      const nomCourt = nomAbrege(roomName);
      const avecAire = textes.some((l) => l.role === 'aire');
      if (roomName !== '' && avecAire && nomCourt !== roomName) {
        variantes.push([{ t: nomCourt, role: 'nom' }, textes[1]]);
      }
      // Sans nom, la surface seule ; sans surface, le nom seul.
      if ((!avecAire || roomName === '') && textes.length > 1) variantes.push(textes.slice(0, 1));
      if (!avecAire && roomName !== '' && nomCourt !== roomName) {
        variantes.push([{ t: nomCourt, role: 'nom' }]);
      }
      const dernier = variantes[variantes.length - 1];
      let retenues = dernier;
      let boite = emprise(dernier);
      let pos = part.labelAt;
      let gene = true;
      let rappel: Pt | undefined;
      const contour = part.surface?.pts;
      const chercher = (essai: typeof textes, garde: (cand: Pt, lw: number, lh: number) => boolean) => {
        const box = emprise(essai);
        const lw = box.w / mapping.scale;
        const lh = box.h / mapping.scale;
        for (const [ox, oz] of anneaux) {
          const cand = { x: part.labelAt.x + ox, z: part.labelAt.z + oz };
          if (contour && contour.length >= 3 && !insidePoly(cand, contour)) {
            continue;
          }
          /*
            LE CARTOUCHE TIENT DANS SA PIÈCE, À L'ÉCART DES MURS — sans quoi,
            dans une petite pièce, il débordait sur le mur et lui volait le
            doigt (le mur de la salle d'eau ne se prenait plus). Ses quatre
            coins restent dedans, à une demi-épaisseur de mur au moins.
          */
          if (contour && contour.length >= 3) {
            const coins = [
              { x: cand.x - lw / 2, z: cand.z - lh / 2 },
              { x: cand.x + lw / 2, z: cand.z - lh / 2 },
              { x: cand.x + lw / 2, z: cand.z + lh / 2 },
              { x: cand.x - lw / 2, z: cand.z + lh / 2 },
            ];
            const deborde = coins.some(
              (k) =>
                !insidePoly(k, contour) ||
                part.walls.some((w) => w.type === 'wall' && pointOnSeg(k, w.a, w.b).dist < epaisseurDe(w) / 2),
            );
            if (deborde) continue;
          }
          if (!garde(cand, lw, lh)) continue;
          return { cand, box };
        }
        return null;
      };
      for (const essai of variantes) {
        const trouve = chercher(essai, (cand, lw, lh) => !cartoucheHeurte(cand, lw / 2, lh / 2, obstacles));
        if (!trouve) continue;
        pos = trouve.cand;
        retenues = essai;
        boite = trouve.box;
        gene = false;
        break;
      }
      /*
        LA SURFACE NE PART PAS POUR UN LIT — revue « Léa » : sur 390 pt, la
        chambre perdait ses m² parce que le lit occupait toute la place
        libre ; l'image du plan, gratuite, partait sans elle. Quand rien
        n'est libre, le cartouche à surface se pose PAR-DESSUS un meuble
        (fond presque plein, voir `gene`) plutôt que de la retirer.
      */
      let place = !gene;
      if (!place) {
        for (const essai of variantes) {
          if (avecAire && !essai.some((l) => l.role === 'aire')) continue;
          const trouve = chercher(essai, () => true);
          if (!trouve) continue;
          pos = trouve.cand;
          retenues = essai;
          boite = trouve.box;
          place = true;
          break;
        }
      }
      /*
        ET SI LA PIÈCE EST TROP PETITE POUR LUI, IL SORT — avec un trait de
        rappel. Un WC d'un mètre, dessiné à quarante pixels le mètre, n'a pas
        la place d'un cartouche de deux lignes : on l'écrit à côté, sur le
        blanc du dehors, et un trait fin le relie à sa pièce.
      */
      if (!place && avecAire) {
        const compact = variantes[variantes.length - 1];
        const box = emprise(compact);
        const dehors = horsDesPieces(part, box.w, box.h, placesHors);
        if (dehors) {
          pos = dehors.pos;
          rappel = dehors.rappel;
          retenues = compact;
          boite = box;
          gene = false;
          place = true;
        }
      }
      if (!place && avecAire) {
        // Le dernier recours : au milieu, débordant s'il le faut — mais avec
        // sa surface.
        retenues = variantes[variantes.length - 1];
        boite = emprise(retenues);
      }
      const q = mapping.toPx(pos);
      placesHors.push({ x: q.x - boite.w / 2, y: q.y - boite.h / 2, w: boite.w, h: boite.h });
      out.set(part.roomId, {
        pos,
        textes: retenues,
        wpx: boite.w,
        hpx: boite.h,
        gene,
        ...(rappel ? { rappel } : {}),
      });
    }
    return out;
  }, [
    view.zoom,
    parts,
    partOf,
    facesPlan,
    roomById,
    objects,
    ceiling,
    showCeiling,
    showSurfaces,
    showMeasures,
    editable,
    mapping,
    layout,
  ]);

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
      items: [] as EtiquetteMobile[],
    };
    if (!showMeasures || !mapping || layout.w === 0) return vide;
    const items: EtiquetteMobile[] = [];
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
      const leLong = { x: dx / norm, y: dy / norm };
      /*
        DE QUEL CÔTÉ, ET À QUELLE DISTANCE — revue des six testeurs (capture
        clair-11) : « 2,93 m » écrit sur les WC, « 4,93 m » sur le trait des
        fenêtres.

        Le côté préféré était « le haut de l'écran », quel que soit le mur :
        la cote d'une façade sud tombait DANS la pièce, sur ses meubles. Une
        façade se cote maintenant du côté du DEHORS (`cotesExterieurs`), où
        rien ne l'encombre ; un refend garde le haut de l'écran.

        Et la distance se compte depuis la FACE réelle du mur, surépaisseur
        de façade comprise (`facesDesMurs`, `SUREPAISSEUR_FACADE`) — plus
        depuis une demi-épaisseur théorique : le chiffre se posait sur la
        maçonnerie et sur les dormants des fenêtres qu'elle loge.
      */
      const L = segLength(w) || 1;
      const perpW = { x: -(w.b.z - w.a.z) / L, z: (w.b.x - w.a.x) / L };
      const milW = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      const p0 = mapping.toPx(milW);
      const p1 = mapping.toPx({ x: milW.x + perpW.x, z: milW.z + perpW.z });
      const lp = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
      const perpS = { x: (p1.x - p0.x) / lp, y: (p1.y - p0.y) / lp };
      const ext = dehorsDesMurs.get(w.id);
      const premier = ext ? { x: perpS.x * ext, y: perpS.y * ext } : n;
      const cotes = [premier, { x: -premier.x, y: -premier.y }];
      const demi = facesPlan.get(w.id) ?? { plus: epaisseurDe(w) / 2, moins: epaisseurDe(w) / 2 };
      /** Du trait à la face du côté `sens` (écran), en pixels. */
      const face = (sens: { x: number; y: number }) => {
        const s = sens.x * perpS.x + sens.y * perpS.y >= 0 ? 1 : -1;
        return ((s > 0 ? demi.plus : demi.moins) + (ext === s ? SUREPAISSEUR_FACADE : 0)) * mapping.scale;
      };
      /*
        LES PLACES, DE LA MEILLEURE À LA MOINS BONNE : contre le mur et
        glissées le long de lui, puis DÉCALÉES d'un ou deux crans avec un
        trait d'attache. Une façade se décale au-dehors et jamais dans la
        pièce ; un refend essaie ses deux côtés avant de se décaler.
      */
      const placesDe = (
        mil: { x: number; y: number },
        ecart: number,
        glisses: number[],
        longueurPx: number,
        decales: number,
      ): Place[] => {
        const pres = (sens: { x: number; y: number }) =>
          glisses.map((d) => ({
            x: mil.x + sens.x * (face(sens) + ecart) + leLong.x * d * longueurPx,
            y: mil.y + sens.y * (face(sens) + ecart) + leLong.y * d * longueurPx,
          }));
        const loin = (sens: { x: number; y: number }) =>
          Array.from({ length: decales }, (_, k) => ({
            x: mil.x + sens.x * (face(sens) + ecart + 13 * (k + 1)),
            y: mil.y + sens.y * (face(sens) + ecart + 13 * (k + 1)),
            attache: { x: mil.x + sens.x * face(sens), y: mil.y + sens.y * face(sens) },
          }));
        return ext
          ? [...pres(cotes[0]), ...loin(cotes[0]), ...pres(cotes[1])]
          : [...pres(cotes[0]), ...pres(cotes[1]), ...loin(cotes[0]), ...loin(cotes[1])];
      };
      if (1 - detail > 0.02) {
        const mil = milieuVisible(a, b, layout);
        const longueur = longueurCotee(walls, w, parts);
        const texte = `${longueur.toFixed(2)} m`.replace('.', ',');
        const lePx = texte.length * 10 * 0.55;
        if (mil && petiteCoteLisible(longueur, norm, lePx)) {
          /*
            ELLE PEUT GLISSER LE LONG DE SON MUR — relevé du patron : « le
            placement intelligent des cotes SUR TOUTE LONGUEUR ».

            Elle se posait au milieu, un point et pas deux : quand ce point
            était pris, elle n'avait qu'un recours, disparaître. Or une cote
            glisse le long de ce qu'elle mesure sans rien perdre — elle reste
            sur le même mur, elle dit la même chose. C'est ce que fait un
            dessinateur, et c'est ce que fait déjà le dossier imprimé.

            Une PETITE cote, elle, ne glisse ni ne se décale : loin de son
            bout de mur, on ne saurait plus ce qu'elle mesure.
          */
          const petite = longueur < PETITE_COTE;
          const places = placesDe(mil, 9, petite ? [0] : [0, 0.18, -0.18, 0.34, -0.34], norm, petite ? 0 : 2);
          murs.set(w.id, places[0]);
          items.push({
            id: `w:${w.id}`,
            places,
            taille: encombrement(texte, 10, angle),
            // La longueur du mur départage : c'est la grande cote qu'on lit.
            poids: 1000 + longueur,
          });
        }
      }
      if (detail > 0.02) {
        wallRuns(w, openings).forEach((run, ri) => {
          if ((run.t1 - run.t0) * norm < 26) return;
          const t = (run.t0 + run.t1) / 2;
          const brut = { x: a.x + dx * t, y: a.y + dy * t };
          // Le tronçon a ses propres bouts : c'est SA portion visible qui
          // compte, pas celle du mur entier.
          const q0 = { x: a.x + dx * run.t0, y: a.y + dy * run.t0 };
          const q1 = { x: a.x + dx * run.t1, y: a.y + dy * run.t1 };
          const mil = milieuVisible(q0, q1, layout) ?? brut;
          const cle = `${w.id}#${ri}`;
          const texte = run.length.toFixed(2).replace('.', ',');
          const longueurPx = (run.t1 - run.t0) * norm;
          if (!petiteCoteLisible(run.length, longueurPx, texte.length * 9.5 * 0.55)) return;
          /*
            UN TRONÇON GLISSE MOINS LOIN QU'UN MUR : il est plus court, et
            une cote poussée à son bout ne dit plus de quel morceau elle
            parle. Un peu plus d'un quart de sa longueur de chaque côté, pas
            davantage — et l'autre côté du mur en dernier recours, comme pour
            les murs entiers.

            Mesuré : à trois places seulement, un « 0,90 » de menuiserie ne
            trouvait plus où aller sur le plan de référence et renonçait. Un
            chiffre absent vaut mieux qu'un chiffre illisible, mais un chiffre
            LISIBLE vaut mieux que les deux.
          */
          const petite = run.length < PETITE_COTE;
          const places = placesDe(
            mil,
            bodyPx / 2 + 9,
            petite ? [0] : [0, 0.14, -0.14, 0.28, -0.28],
            longueurPx,
            petite ? 0 : 1,
          );
          runs.set(cle, places[0]);
          items.push({
            id: `r:${cle}`,
            places,
            taille: encombrement(texte, 9.5, angle),
            poids: run.length,
          });
        });
      }
    }
    /*
      L'ARBITRAGE NE SE FAIT PLUS ICI — il se fait plus bas, sur TOUT.

      Ce mémo ne connaît que les murs. Il rendait donc son verdict entre
      cotes de mur, et les écarts d'une ligne de spots s'écrivaient de leur
      côté sans regarder personne : deux arbitres qui ne se parlaient pas.
      Mesuré sur le plan de référence à seize cadrages, 28 chevauchements sur
      478 étiquettes.

      Il rend maintenant ses CANDIDATS. Voir `cotesArbitrees`.
    */
    return { murs, runs, items };
  }, [walls, openings, mapping, layout, showMeasures, detail, dehorsDesMurs, facesPlan, parts]);

  /**
   * TOUTES LES ÉTIQUETTES DU PLAN, ARBITRÉES ENSEMBLE.
   *
   * Relevé du patron : « fais un tour pour le placement intelligent des cotes
   * sur toute longueur. Il faut absolument pas que 2 cotes se touchent ou
   * qu'un élément vienne entraver la lecture d'une cote. »
   *
   * LE PLAN AVAIT DEUX ARBITRES QUI NE SE PARLAIENT PAS. `placementCotes` ne
   * connaît que les murs — il tranchait donc entre cotes de mur, et rien
   * d'autre. Les écarts d'une ligne de spots vivaient dans le calque du
   * plafond et s'écrivaient sans regarder personne. Le cartouche d'une pièce,
   * lui, esquivait les meubles et les spots, mais pas les cotes.
   *
   * Mesuré avant correction, sur le plan de référence à seize cadrages :
   * **28 chevauchements sur 478 étiquettes**. Trois familles, et toujours
   * entre deux systèmes différents : cote de mur contre cartouche (18 fois),
   * cote de mur contre écart de plafond (12), écart contre cartouche (4).
   *
   * UN SEUL ARBITRE, DONC, ET IL PASSE APRÈS LES PIÈCES : c'est ici qu'on
   * connaît enfin le plafond (`ceiling`), la trame (`frame`) et le découpage
   * en pièces (`partOf`). Les écarts entrent dans la même balance que les
   * cotes de mur, avec le poids que leur donne le métier — voir
   * `POIDS_ECART`.
   *
   * ET L'ON GARDE LES BOÎTES, pas seulement les gagnantes : le cartouche de
   * la pièce s'en sert plus bas pour se ranger ailleurs. Une mesure ne bouge
   * pas, un nom de pièce si — c'est déjà la règle du dossier imprimé.
   */
  const cotesArbitrees = useMemo(() => {
    const vide = {
      poses: new Map<string, Place>(),
      gardees: new Set<string>(),
      ecarts: new Map<string, { x: number; y: number }>(),
      boites: [] as Boite[],
    };
    if (!showMeasures || !mapping || layout.w === 0) return vide;
    const ecarts =
      showCeiling && ceiling
        ? etiquettesDesEcarts(ceiling, partOf, walls, frame, mapping.toPx)
        : [];
    const items: EtiquetteMobile[] = [
      ...placementCotes.items,
      ...ecarts.map((e) => ({
        id: e.id,
        /*
          UN ÉCART DE PLAFOND GLISSE PERPENDICULAIREMENT, pas le long de son
          trait : le long, il quitterait le segment qu'il mesure et l'on ne
          saurait plus de quel intervalle il parle. À côté, il reste en face.
        */
        places: [0, 11, -11, 22, -22].map((k) => {
          const ux = e.b.x - e.a.x;
          const uy = e.b.y - e.a.y;
          const l = Math.hypot(ux, uy) || 1;
          return { x: e.at.x - (uy / l) * k, y: e.at.y + (ux / l) * k };
        }),
        taille: e.taille,
        poids: POIDS_ECART + e.valeur,
      })),
    ];
    /*
      LES CARTOUCHES SONT DÉJÀ POSÉS : ils ne bougeront plus, et les cotes se
      rangent autour. C'est la règle du dossier imprimé — « le cartouche évite
      les sigles, la cote évite les deux ».
    */
    const prises: Boite[] = [];
    for (const car of cartouches.values()) {
      const q = mapping.toPx(car.pos);
      prises.push({
        x: q.x - car.wpx / 2,
        y: q.y - car.hpx / 2,
        w: car.wpx,
        h: car.hpx,
      });
    }
    /*
      LES MEUBLES ET LES MENUISERIES RÉSERVENT LEUR PLACE — revue des six
      testeurs (capture clair-11) : « 3,60 m » en travers du canapé,
      « 2,93 m » sur les WC et le lavabo, « 4,93 m » et « 3,00 m » sur le
      trait des fenêtres. L'arbitre ne connaissait que les étiquettes ; une
      cote se posait sur tout le reste. Un tapis, lui, est sous les meubles :
      on écrit dessus comme sur le sol.
    */
    const encombrants: Boite[] = [];
    for (const o of objects) {
      if (o.category === 'tapis') continue;
      const f = footprintOf(o, partOf, facesPlan);
      const u = { x: (Math.cos(f.yaw) * f.width) / 2, z: (Math.sin(f.yaw) * f.width) / 2 };
      const v = { x: (-Math.sin(f.yaw) * f.depth) / 2, z: (Math.cos(f.yaw) * f.depth) / 2 };
      encombrants.push(
        boiteDePoints(
          [
            [1, 1],
            [1, -1],
            [-1, -1],
            [-1, 1],
          ].map(([i, j]) => mapping.toPx({ x: f.cx + u.x * i + v.x * j, z: f.cz + u.z * i + v.z * j })),
        ),
      );
    }
    for (const o of openings) {
      const baie = baieDuPoche.get(o.id);
      // La baie dans toute l'épaisseur de son mur, façade comprise.
      const coins = baie
        ? [baie.a, baie.b].flatMap((p) => [
            { x: p.x + baie.n.x * baie.plus, z: p.z + baie.n.z * baie.plus },
            { x: p.x - baie.n.x * baie.moins, z: p.z - baie.n.z * baie.moins },
          ])
        : [o.a, o.b];
      encombrants.push(boiteDePoints(coins.map((p) => mapping.toPx(p))));
      // Et le quart de cercle du battant, du côté où il s'ouvre.
      if (o.type !== 'door' || o.garage || o.placard) continue;
      const ancre = partOf.get(roomOf(o))?.labelAt;
      if (!ancre) continue;
      const lx = o.b.x - o.a.x;
      const lz = o.b.z - o.a.z;
      const l = Math.hypot(lx, lz);
      if (l < 0.05) continue;
      let nx = -lz / l;
      let nz = lx / l;
      const mx = (o.a.x + o.b.x) / 2;
      const mz = (o.a.z + o.b.z) / 2;
      if ((ancre.x - mx) * nx + (ancre.z - mz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      if (o.versExterieur) {
        nx = -nx;
        nz = -nz;
      }
      const r = o.vantaux === 2 ? l / 2 : l;
      encombrants.push(
        boiteDePoints(
          [o.a, o.b, { x: o.a.x + nx * r, z: o.a.z + nz * r }, { x: o.b.x + nx * r, z: o.b.z + nz * r }].map((p) =>
            mapping.toPx(p),
          ),
        ),
      );
    }
    // Trois points de jeu : deux plaques ne se touchent pas (captures du simulateur).
    const poses = placerEtiquettes(items, prises, 3, encombrants);
    const boites = [...poses.entries()].map(([id, p]) => {
      const e = items.find((x) => x.id === id)!;
      return {
        x: p.x - e.taille.w / 2,
        y: p.y - e.taille.h / 2,
        w: e.taille.w,
        h: e.taille.h,
      };
    });
    return {
      poses,
      gardees: new Set(poses.keys()),
      ecarts: new Map(
        ecarts.filter((e) => poses.has(e.id)).map((e) => [e.id, poses.get(e.id)!]),
      ),
      boites,
    };
  }, [
    placementCotes,
    cartouches,
    objects,
    openings,
    baieDuPoche,
    facesPlan,
    ceiling,
    showCeiling,
    partOf,
    walls,
    frame,
    mapping,
    layout,
    showMeasures,
  ]);

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


  /*
    LES POSES SE VOIENT NAÎTRE — voir `Vivant`. Une pièce ajoutée, un
    meuble posé, une menuiserie percée : chacun salue d'une ondée, à sa
    taille. Rouvrir un dossier ne fait naître personne.
  */
  const piecesNees = useNaissances(rooms.map((r) => r.id));
  const meublesNes = useNaissances(objects.map((o) => o.id));
  const menuiseriesNees = useNaissances(openings.map((o) => o.id));

  /*
    LE VISEUR — de quoi lâcher un meuble du catalogue à l'endroit du doigt.

    Il se publie UNE SEULE FOIS et lit le cadrage courant dans une
    référence. Le republier à chaque changement de cadrage voudrait dire un
    rappel par image pendant qu'on promène le plan, pour une valeur dont
    personne ne se sert entre deux gestes.
  */
  const cadrageVif = useRef(mapping);
  cadrageVif.current = mapping;
  const viseur = useMemo<ViseurPlan>(
    () => ({
      mesurer: (rendu) => {
        const vue = hote.current;
        if (!vue || typeof vue.measureInWindow !== 'function') {
          rendu(null);
          return;
        }
        vue.measureInWindow((x, y, w, h) => rendu({ x, y, w, h }));
      },
      viser: (page, cadre) => {
        const m = cadrageVif.current;
        if (!m) return null;
        const local = dansLeCadre(page, cadre);
        return local ? m.toMeters(local) : null;
      },
    }),
    [],
  );
  useEffect(() => {
    onViseur?.(viseur);
    return () => onViseur?.(null);
  }, [onViseur, viseur]);

  /*
    PLUSIEURS CHOSES SOUS LE DOIGT : ON DEMANDE — relevé du patron : « si
    plusieurs éléments sur le même emplacement au clic, on demande la
    sélection ». Le dessin donnait la main à ce qui était peint par-dessus :
    le point lumineux au-dessus de la table, le ruban le long du mur où
    sont les prises. Au toucher, on cherche tout ce qui se choisit à cet
    endroit — chaque chose avec la cible qu'elle a au dessin —, et s'il y en
    a plus d'une, une carte les nomme près du doigt. Une seule : rien ne
    change, elle est prise.
  */
  const ciblesAuPoint = (p: { x: number; y: number }): CibleDuPlan[] => {
    if (!mapping) return [];
    const out: CibleDuPlan[] = [];
    const auSegment = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    };
    if (showCeiling && onSelectCeiling) {
      const r = rayonDuPointLumineux(mapping.scale);
      for (const cl of ceiling ?? []) {
        let dessous: boolean;
        if (cl.trace && cl.trace.length >= 2) {
          const e = cl.trace.map((pt) => mapping.toPx(pt));
          const tour = cl.ferme ? [...e, e[0]] : e;
          dessous = tour.slice(1).some((g, i) => auSegment(tour[i], g) <= LARGEUR_CIBLE_RUBAN / 2);
        } else {
          const q = mapping.toPx(cl.at);
          dessous = Math.hypot(q.x - p.x, q.y - p.y) <= Math.max(r + 6, 14);
        }
        if (dessous) out.push(cibleDuPlafond(cl.id));
      }
    }
    if (showFixtures && onSelectFixture) {
      const portee = Math.max(18, rayonDAppareil(mapping.scale) + 8);
      for (const u of unitesDesAppareils(fixtures ?? [], walls, quads)) {
        const q = poseDeLUnite(u, mapping, walls, dehorsDesMurs, elecLod).p;
        if (Math.hypot(q.x - p.x, q.y - p.y) <= portee) out.push(cibleDeLAppareil(u.f.id));
      }
    }
    if (onSelectObject && editable) {
      const m = mapping.toMeters(p);
      for (const o of objects) {
        const f = footprintOf(o, partOf, facesPlan);
        const dx = m.x - f.cx;
        const dz = m.z - f.cz;
        const u = dx * Math.cos(f.yaw) + dz * Math.sin(f.yaw);
        const v = -dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
        if (Math.abs(u) <= f.width / 2 && Math.abs(v) <= f.depth / 2) out.push(cibleDuMeuble(o.id));
      }
    }
    if (editable && onSelectOpening) {
      for (const o of openings) {
        if (auSegment(mapping.toPx(o.a), mapping.toPx(o.b)) <= 13) out.push(cibleDeLaBaie(o.id));
      }
    }
    return out.filter((x): x is CibleDuPlan => !!x);
  };
  const cibleDuPlafond = (id: string): CibleDuPlan => {
    const cl = (ceiling ?? []).find((x) => x.id === id);
    const spec = cl ? CEILINGS[cl.kind] : null;
    return {
      cle: `plafond:${id}`,
      libelle: spec?.label ?? 'Appareil de plafond',
      genre: 'Au plafond',
      icone: cl ? <CeilingIcon kind={cl.kind} size={22} /> : null,
      choisir: () => onSelectCeiling?.(id),
    };
  };
  const cibleDeLAppareil = (id: string): CibleDuPlan => {
    const f = (fixtures ?? []).find((x) => x.id === id);
    return {
      cle: `appareil:${id}`,
      libelle: f ? FIXTURES[f.kind].label : 'Appareil',
      genre: 'Au mur',
      icone: f ? <VignetteAppareil kind={f.kind} taille={28} /> : null,
      choisir: () => f && onSelectFixture?.(f.id, f.wallId),
    };
  };
  const cibleDuMeuble = (id: string): CibleDuPlan => {
    const o = objects.find((x) => x.id === id);
    return {
      cle: `meuble:${id}`,
      libelle: o ? frCategory(o.category) : 'Meuble',
      genre: 'Meuble',
      icone: (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d={SOLAIRES.meubles} fill={c.inkSoft} />
        </Svg>
      ),
      choisir: () => onSelectObject?.(id),
    };
  };
  const cibleDeLaBaie = (id: string): CibleDuPlan => {
    const o = openings.find((x) => x.id === id);
    return {
      cle: `baie:${id}`,
      libelle: !o ? 'Menuiserie' : o.type === 'window' ? 'Fenêtre' : o.type === 'door' ? (o.garage ? 'Porte de garage' : o.placard ? 'Façade de placard' : 'Porte') : 'Passage',
      genre: 'Menuiserie',
      icone: (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d={SOLAIRES.ouvertures} fill={c.inkSoft} />
        </Svg>
      ),
      choisir: () => onSelectOpening?.(id),
    };
  };
  /** Le geste d'un élément touché : seul sous le doigt, il agit ; sinon, on demande. */
  const toucher = (defaut: CibleDuPlan, agir: () => void) => {
    const p = dernierToucher.current;
    const ici = p ? ciblesAuPoint(p) : [];
    /*
      LE DESSIN NE DÉCIDE PAS SEUL DE CE QU'ON A TOUCHÉ — relevé du patron :
      « la LED est sélectionnée en cliquant au milieu ». Le moteur du dessin
      peut attribuer le doigt à un tracé qui fait le tour de la pièce alors
      qu'on touche son centre. La géométrie tranche : un élément que le
      doigt ne couvre pas cède la place à ce qui est vraiment dessous, et
      s'il n'y a rien, rien ne se passe.
    */
    if (p && !ici.some((x) => x.cle === defaut.cle)) {
      if (ici.length === 1) ici[0].choisir();
      else if (ici.length > 1) {
        haptic('leger');
        setChoixSousLeDoigt({ x: p.x, y: p.y, cibles: ici });
      }
      return;
    }
    const autres = ici.filter((x) => x.cle !== defaut.cle);
    if (!p || autres.length === 0) {
      agir();
      return;
    }
    haptic('leger');
    setChoixSousLeDoigt({ x: p.x, y: p.y, cibles: [defaut, ...autres] });
  };

  /**
   * L'EMPREINTE D'UN MEUBLE AU PLAN — une fonction, parce que le meuble tenu
   * se dessine aussi depuis `SuitLeDoigt`, avec sa position en vol.
   */
  const dessinerMeuble = (o: ObjectData, poseRefusee = false) => {
    if (!mapping) return null;
    const f = footprintOf(o, partOf, facesPlan);
    const ctr = mapping.toPx({ x: f.cx, z: f.cz });
    const w = f.width * mapping.scale;
    const d = f.depth * mapping.scale;
    return (
      <G
        key={f.id}
        testID={`meuble-${f.id}`}
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
          /*
            LA TEINTE CHOISIE SE VOIT AUSSI EN 2D — revue « Yasmine » :
            le canapé vert sauge de « Décorer » restait bleu pâle sur
            le plan. Hors plan électrique, le meuble prend sa teinte,
            adoucie pour que son symbole se lise encore.
          */
          fill={
            poseRefusee && o.id === selectedObjectId
              ? c.danger
              : planElec
                ? c.surface
                : o.teinte ?? c.blueSoft
          }
          fillOpacity={
            poseRefusee && o.id === selectedObjectId ? 0.35 : !planElec && o.teinte ? 0.55 : 1
          }
          // Et ce qui en chevauche un autre GARDE son trait rouge
          // une fois lâché (revue « Théo ») : le contrôle le dit
          // aussi, mais c'est sur le plan qu'on le corrige.
          stroke={
            poseRefusee && o.id === selectedObjectId
              ? c.danger
              : o.id === selectedObjectId
              ? c.blue
              : meublesEnConflit?.has(o.id)
                ? c.danger
                : planElec
                  ? c.line
                  : c.lineStrong
          }
          strokeWidth={o.id === selectedObjectId ? 2.5 : meublesEnConflit?.has(o.id) ? 1.6 : 1}
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
          furnitureStrokes(furnKind(f.category), w, d, meridienneDe(o)).map((line, li) => (
            <Path
              key={`s${li}`}
              d={line
                .map(
                  (p, pi) =>
                    `${pi === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
                )
                .join(' ')}
              stroke={planElec ? c.inkFaint : c.inkSoft}
              strokeWidth={planElec ? 1 : 1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        {/*
          PLUS DE NOM DE MEUBLE SUR LE PLAN — relevé du patron :
          « enlève le nom des meubles ». La silhouette dit déjà ce
          qu'est un lit ou une table ; le nom ajoutait un mot de
          plus là où le plan se lit déjà mal. Le meuble tenu, lui,
          garde son nom dans sa barre (`ObjectBar`).
        */}
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
          accessibilityLabel={`Autour du meuble ${frCategory(
            f.category,
          )}`}
          x={-w / 2 - PRISE_MARGE}
          y={-d / 2 - PRISE_MARGE}
          width={w + PRISE_MARGE * 2}
          height={d + PRISE_MARGE * 2}
          fill="transparent"
          onPress={
            onSelectObject && editable
              ? () =>
                  onSelectObject(
                    o.id === selectedObjectId ? null : o.id,
                  )
              : undefined
          }
        />
      </G>
    );
  };

  return (
    <View
      ref={hote}
      collapsable={false}
      style={styles.container}
      onLayout={(e) =>
        setLayout({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      onTouchStart={(e) => {
        // Où le doigt s'est posé, dans le cadre du plan : voir `toucher`.
        // `locationX` d'abord ; puis, mieux, par la page et la place du
        // cadre — `locationX` se lit par rapport à la vue touchée, qui n'est
        // pas toujours le cadre. La mesure revient bien avant le lâcher.
        const { pageX, pageY, locationX, locationY } = e.nativeEvent;
        dernierToucher.current = { x: locationX, y: locationY };
        const vue = hote.current;
        if (vue && typeof vue.measureInWindow === 'function') {
          vue.measureInWindow((x, y) => {
            if (Number.isFinite(x) && Number.isFinite(y)) dernierToucher.current = { x: pageX - x, y: pageY - y };
          });
        }
      }}
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
          y={HAUT_SOUS_LES_PASTILLES}
          invite={invite}
          onPress={async () => {
            /*
              LA BOUSSOLE S'ALLUME À L'INVITATION. Elle n'était jamais
              démarrée : `heading` répondait toujours « rien », et le nord ne
              se posait jamais. Le premier appui l'allume — le temps de se
              tourner face au haut du plan, elle s'est calée —, la lecture
              l'éteint.
            */
            if (!invite) {
              setInvite(true);
              boussoleAllumee.current = true;
              RoomScan.startHeading().catch(() => {});
              return;
            }
            setInvite(false);
            const cap = await RoomScan.heading();
            boussoleAllumee.current = false;
            RoomScan.stopHeading().catch(() => {});
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
          <ToileDuPlan largeur={layout.w} hauteur={layout.h} ouvrir={ouvrirLaToile}>
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
            {(editable ||
              selectedObjectId ||
              selectedCeilingId ||
              selectedNoteId) && (
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
                  /* La note aussi — relevé du patron : « une note doit
                     quitter son bloc d'édition si on clique ailleurs ».
                     Elle était la dernière à ne pas suivre la règle, et le
                     fond ne se montait même pas pour elle : hors édition,
                     avec une note en main, il n'y avait rien à toucher. */
                  onSelectNote?.(null);
                }}
              />
            )}

            {/*
              LA GRILLE — un trait tous les cinquante centimètres, un plus
              marqué tous les mètres, dans le repère du logement : elle tourne
              et s'agrandit avec lui. On estime une distance d'un coup d'œil,
              sans poser une cote.
            */}
            {grille}

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
                    <Circle cx={1.1} cy={1.1} r={0.9} fill={c.inkFaint} opacity={0.55} />
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
                              /*
                                ET TOUCHER LE SOL QUAND UN MUR EST CHOISI,
                                C'EST LE LÂCHER — relevé du patron :
                                « lorsqu'un mur est sélectionné, le clic
                                n'importe où sur la surface doit quitter la
                                sélection ».

                                La règle existait déjà pour le meuble ; le
                                mur, lui, restait pris, et l'appui ouvrait
                                le bandeau de la pièce PAR-DESSUS son menu.
                                Un geste, un effet : le premier appui
                                lâche, le suivant prend la pièce.
                              */
                              if (selectedWallId) {
                                onSelectWall(null);
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
                      {/*
                        LE SEMIS N'EST QU'UN OUTIL D'ÉDITION — revue de Léa,
                        Sophie et Chloé : la grille de points sur les sols
                        « fait brouillon / debug ». Elle sert à s'aligner en
                        posant ; en lecture, à l'aperçu du dossier, le sol
                        est un aplat net, comme sur le PDF. Et même en
                        édition elle se fait plus discrète.
                      */}
                      {editable ? <Polygon points={poly} fill="url(#floorDots)" stroke="none" /> : null}
                      {!planElec && mapping && decorDesMurs(part, poly, mapping.scale)}
                    </G>
                  );
                })}
              </G>
            )}

            {/*
              LE HALO DES MURS — la tolérance, et rien qu'elle.

              Elle est posée ICI, sous les meubles, et non avec les murs :
              voir `couche` dans `WallBody`. Un appui sur un meuble d'une
              petite pièce revenait au mur d'à côté, parce que le mur se
              peint après et que sa tolérance déborde de trois points.
              Ce qu'on touche prime sur ce qui est à côté.
            */}
            {walls.map((w) => (
              <WallBody
                key={`halo-${w.id}`}
                wall={w}
                quad={quads.get(w.id)}
                mapping={mapping}
                couche="halo"
                neuve={!!roomById.get(roomOf(w) ?? '')?.neuve}
                showMeasure={false}
                selected={false}
                onPress={
                  editable
                    ? () => onSelectWall(w.id === selectedWallId ? null : w.id)
                    : undefined
                }
              />
            ))}

            {/*
              Objets (empreintes au sol). LES TAPIS D'ABORD — revue
              « Yasmine » : dessinés dans l'ordre d'ajout, le tapis posé
              après la table la recouvrait, sur l'image même qu'on envoie au
              client. Un tapis est sous les meubles ; il se dessine dessous.
            */}
            {[...objects]
              .sort((a, b) => (a.category === 'tapis' ? 0 : 1) - (b.category === 'tapis' ? 0 : 1))
              .map((meuble) => {
              /*
                LE MEUBLE TENU SE DESSINE EN VOL — voir `SuitLeDoigt`. À sa
                place dans l'ordre du dessin : il ne passe ni devant ni
                derrière les autres parce qu'on le glisse.
              */
              if (meuble.id === selectedObjectId) {
                return <SuitLeDoigt key={meuble.id} objet={meuble} render={dessinerMeuble} />;
              }
              return dessinerMeuble(meuble);
            })}

            {/*
              CE QU'ON VOIT SOUS LE DOIGT PASSE AVANT CE QUI EST À CÔTÉ.

              Relevé du patron : « quand un meuble est sur un autre,
              impossible de sélectionner celui qu'on souhaite facilement…
              pourtant on clique sur celui qu'on souhaite visuellement ».

              Chaque meuble porte une cible plus large que son dessin — huit
              points de débord, sans quoi une chaise dézoomée est invisable.
              Cette tolérance MORD sur le voisin : une chaise glissée sous une
              table voyait son dessin recouvert par le débord de la table, et
              c'est la table qui répondait. Pire, l'ordre des cibles était
              celui de la LISTE DES MEUBLES — donc l'ordre du scan, qui ne
              veut rien dire à l'écran.

              On sépare donc, comme pour le halo d'un mur : le débord reste
              avec le dessin, et la cible STRICTE — le dessin, exactement —
              passe par-dessus tous les meubles. Toucher un meuble prend ce
              meuble ; toucher à côté ne prend le voisin que si la place est
              libre.

              ET LE PLUS PETIT PASSE DEVANT. Une chaise posée sur un tapis est
              entièrement contenue dans lui : si le tapis gagnait, la chaise
              serait injoignable, alors que le tapis reste attrapable partout
              ailleurs. On range donc du plus grand au plus petit, et c'est le
              plus petit qui se pose en dernier.

              Cette couche reste SOUS les murs, les appareils et les
              menuiseries : eux sont dessinés par-dessus les meubles, et leur
              tour de priorité est déjà réglé.
            */}
            {/*
              UN MEUBLE NE SE PREND QU'EN ÉDITION — relevé du patron : « le
              clic sur les meubles ne doit pas être possible sans mode
              édition ». Hors édition, on LIT le plan : un appui sur un lit
              ouvrait sa barre et ses poignées, et le moindre effleurement
              en passant d'une pièce à l'autre sortait un menu. Les cibles
              ne se posent donc plus du tout : l'appui passe au plan.
            */}
            {onSelectObject &&
              editable &&
              objects
                .map((o) => ({ o, f: footprintOf(o, partOf, facesPlan) }))
                .sort((a, b) => b.f.width * b.f.depth - a.f.width * a.f.depth)
                .map(({ o, f }) => {
                  const ctr = mapping.toPx({ x: f.cx, z: f.cz });
                  const w = f.width * mapping.scale;
                  const d = f.depth * mapping.scale;
                  return (
                    <Rect
                      key={`prise-${f.id}`}
                      accessibilityLabel={`Meuble ${frCategory(f.category)}`}
                      x={-w / 2}
                      y={-d / 2}
                      width={w}
                      height={d}
                      fill="transparent"
                      transform={`translate(${ctr.x}, ${ctr.y}) rotate(${
                        ((f.yaw + view.rot) * 180) / Math.PI
                      })`}
                      onPress={() =>
                        toucher(cibleDuMeuble(o.id), () =>
                          onSelectObject(o.id === selectedObjectId ? null : o.id),
                        )
                      }
                    />
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
                // Un placard fermé sans porte se poche aussi : un appui le déclare.
                onPress={
                  editable && onRecoin
                    ? () =>
                        onRecoin({
                          x: contour.reduce((t, p) => t + p.x, 0) / contour.length,
                          z: contour.reduce((t, p) => t + p.z, 0) / contour.length,
                        })
                    : undefined
                }
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

            {/*
              LES POSES D'UN MUR NEUF — en bleu, à faible opacité.

              Un fantôme par choix : droit dans la continuité, ou à l'équerre
              d'un côté ou de l'autre. Il a l'ÉPAISSEUR d'un mur, parce que
              c'est un mur qu'on va poser — un trait fin se lirait comme une
              cote ou un tracé de gaine.

              La cible du doigt est un second trait, transparent et large :
              une maçonnerie de quatorze centimètres fait cinq pixels au zoom
              d'ensemble, et personne ne vise cinq pixels.
            */}
            {(poses ?? []).map((pose) => {
              const a2 = mapping.toPx(pose.a);
              const b2 = mapping.toPx(pose.b);
              return (
                <G key={`pose-${pose.id}`}>
                  <Line
                    x1={a2.x}
                    y1={a2.y}
                    x2={b2.x}
                    y2={b2.y}
                    stroke={c.blue}
                    strokeOpacity={0.28}
                    strokeWidth={Math.max(5, mapping.scale * WALL_T)}
                    strokeLinecap="butt"
                  />
                  <Line
                    x1={a2.x}
                    y1={a2.y}
                    x2={b2.x}
                    y2={b2.y}
                    stroke="transparent"
                    strokeWidth={26}
                    strokeLinecap="round"
                    onPress={() => onPose?.(pose.id)}
                  />
                </G>
              );
            })}

            {/* La maçonnerie, d'un seul tenant : voir `pocheDesMurs`. */}
            <Path
              testID="poche-des-murs"
              d={cheminDuPoche(poche.contours, mapping.toPx)}
              fill={c.ink}
              fillRule="evenodd"
            />
            {corpsDeNature ? (
              <G testID="nature-des-murs" pointerEvents="none">
                <Defs>
                  <ClipPath id="clip-poche-nature">
                    <Path d={cheminDuPoche(poche.contours, mapping.toPx)} clipRule="evenodd" />
                  </ClipPath>
                </Defs>
                <G clipPath="url(#clip-poche-nature)">
                  {corpsDeNature.coeurs.map((j, i) => (
                    <Polygon
                      key={`coeur-${i}`}
                      points={j.poly.map((p) => mapping.toPx(p)).map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={renduNature(j.nature, c.ink, c.surface).fond}
                    />
                  ))}
                  {corpsDeNature.corps.map((m) => {
                    const r = renduNature(m.nature, c.ink, c.surface);
                    // Le trait est coupé de moitié par le poché : on le
                    // double pour garder le filet fin du plan d'architecte.
                    const trait = Math.min(2.4, Math.max(1.2, mapping.scale * 0.02));
                    return (
                      <G key={`nature-${m.id}`}>
                        <Polygon
                          testID={`nature-${m.nature}`}
                          points={m.contour.map((p) => mapping.toPx(p)).map((p) => `${p.x},${p.y}`).join(' ')}
                          fill={r.fond}
                        />
                        {m.filets.map((f, k) => (
                          <Polyline
                            key={k}
                            points={f.map((p) => mapping.toPx(p)).map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke={r.contour}
                            strokeWidth={trait}
                            strokeDasharray={r.tirets ? [5, 3] : undefined}
                          />
                        ))}
                        {m.boucles ? (
                          <Polyline
                            points={m.boucles.map((p) => mapping.toPx(p)).map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke={r.contour}
                            strokeWidth={Math.max(0.6, trait * 0.45)}
                          />
                        ) : null}
                      </G>
                    );
                  })}
                  {/* La maçonnerie reprend la main aux butées : voir `dessinDesNatures`. */}
                  {corpsDeNature.maconnerie.map((poly, i) => (
                    <Polygon
                      key={`macon-${i}`}
                      points={poly.map((p) => mapping.toPx(p)).map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={c.ink}
                    />
                  ))}
                </G>
              </G>
            ) : null}

            {/* Murs : leur corps ne se dessine plus (le poché le fait) ; il
                garde le toucher, la cote, et le bleu de la sélection. Leur
                tolérance de toucher, elle, est passée plus bas, sous les
                meubles. */}
            {walls.map((w) => (
              <WallBody
                key={w.id}
                wall={w}
                quad={quads.get(w.id)}
                mapping={mapping}
                sansCorps
                exterieur={dehorsDesMurs.get(w.id)}
                /* Une piece qu'on vient de poser et qu'on n'a pas encore
                   lachee : son trait reste ouvert. Voir `WallBody`. */
                neuve={!!roomById.get(roomOf(w) ?? '')?.neuve}
                showMeasure={
                  placementCotes.murs.has(w.id) &&
                  cotesArbitrees.gardees.has(`w:${w.id}`)
                }
                measureAt={cotesArbitrees.poses.get(`w:${w.id}`)}
                measureOpacity={1 - detail}
                longueur={longueurCotee(walls, w, parts)}
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
                // Un coin raté se dessine par son coin : les deux bouts y vont.
                const pts = t.coin ? [p0, mapping.toPx(t.coin), p1] : [p0, p1];
                return (
                  <Polyline
                    key={`trou-${i}`}
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
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
            {/* Les photos prises et redressées par le scan n'ont pas de
                punaise : chaque mur en a une, elles ne désignent rien. */}
            {photos?.filter((ph) => !ph.auto).map((ph) => {
              const w = wallById.get(ph.wallId);
              if (!w) return null;
              const face = wallFace(w, quads.get(w.id), interiorSide(w, walls));
              const p = facePoint(face, faceX(face, ph.along), 0.14);
              const q = mapping.toPx(p);
              return (
                /*
                  LE REPÈRE D'UNE PHOTO — l'appareil du jeu commun.

                  Relevé du patron, lien à l'appui :
                  `svgrepo.com/svg/525723/camera`, « utilise cette icône là
                  où il y a la photo en icône pour la photo de mur ». C'est
                  `solar:camera-bold`, celle que porte déjà la sortie
                  « Image » : le même objet, le même dessin.

                  Il était dessiné à la main — un rectangle et un rond au
                  trait — et c'était le seul pictogramme de l'app à ne pas
                  venir du jeu : posé à côté des silhouettes pleines, il se
                  lisait comme un cadre vide.

                  La pastille claire dessous reste : la silhouette est
                  pleine, et sur un mur poché en noir elle disparaîtrait.
                */
                <G key={`photo-${ph.id}`} onPress={() => onSelectPhoto?.(ph.id)}>
                  <Circle cx={q.x} cy={q.y} r={12} fill="transparent" />
                  <Circle
                    cx={q.x}
                    cy={q.y}
                    r={10}
                    fill={c.surface}
                    stroke={c.line}
                    strokeWidth={1}
                  />
                  <G
                    transform={`translate(${q.x - 6.5} ${q.y - 6.5}) scale(${13 / 24})`}>
                    <Path d={SOLAIRES.image} fill={c.ink} fillRule="evenodd" />
                  </G>
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
                const tenu = meublesDuNiveau.find((x) => x.id === selectedObjectId);
                if (!tenu) return null;
                return (
                  <SuitLeDoigt
                    objet={tenu}
                    render={(o) => {
                      const f = footprintOf(o, partOf, facesPlan);
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
                            const gap = castToWall(from, d, murs, facesPlan);
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
                            // Revue « Marc » : « 100 » pour 0,99999 m, et aucune unité —
                            // 100 quoi ? Le centimètre se dit, le mètre aussi.
                            const texte =
                              Math.round(gap * 100) < 100
                                ? `${Math.round(gap * 100)} cm`
                                : `${gap.toFixed(2).replace('.', ',')} m`;
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
                    }}
                  />
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
                  const cle = `${w.id}#${ri}`;
                  const pose = cotesArbitrees.poses.get(`r:${cle}`);
                  if (!pose) return null;
                  const px = pose.x;
                  const py = pose.y;
                  const texte = run.length.toFixed(2).replace('.', ',');
                  const p = plaqueDeCote(texte, 9.5);
                  return (
                    <G key={`run-${w.id}-${ri}`} opacity={detail}>
                      {pose.attache ? (
                        <Line
                          testID="attache-cote"
                          x1={pose.attache.x}
                          y1={pose.attache.y}
                          x2={px}
                          y2={py}
                          stroke={c.inkFaint}
                          strokeWidth={0.8}
                        />
                      ) : null}
                      <Rect
                        x={px - p.w / 2}
                        y={py - p.h / 2}
                        width={p.w}
                        height={p.h}
                        rx={3}
                        fill={c.surface}
                        opacity={0.92}
                        transform={`rotate(${angle}, ${px}, ${py})`}
                      />
                      <SvgText
                        x={px}
                        y={py + 3.4}
                        fill={run.kind === 'mur' ? c.inkSoft : c.blue}
                        fontSize={9.5}
                        fontWeight="700"
                        textAnchor="middle"
                        transform={`rotate(${angle}, ${px}, ${py})`}>
                        {texte}
                      </SvgText>
                    </G>
                  );
                }),
              )}

            {/* Portes / fenêtres : trouée dans le mur, puis trait de repérage */}
            {openings.map((o) => {
              /*
                LA BAIE EST UN VIDE DANS LE POCHÉ — plus un aplat posé sur le
                noir pour l'effacer (voir `pocheDesMurs`). La menuiserie se
                dessine DANS l'épaisseur réelle du mur, façade comprise : ses
                deux faces, en traits fins, comme sur un plan d'architecte.
              */
              const baie = baieDuPoche.get(o.id);
              const face = (cote: 1 | -1) =>
                baie
                  ? [baie.a, baie.b].map((p) =>
                      mapping.toPx({
                        x: p.x + baie.n.x * cote * (cote > 0 ? baie.plus : baie.moins),
                        z: p.z + baie.n.z * cote * (cote > 0 ? baie.plus : baie.moins),
                      }),
                    )
                  : null;
              const vitre = (decalage: number) =>
                baie
                  ? [baie.a, baie.b].map((p) =>
                      mapping.toPx({ x: p.x + baie.n.x * decalage, z: p.z + baie.n.z * decalage }),
                    )
                  : null;
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
                // La porte de garage ne bat pas (voir `porteDeGarage`), la
                // façade de placard coulisse (voir `facadesDePlacard`).
                if (o.type !== 'door' || o.garage || o.placard) return null;
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
                const vantail = (pivot: { x: number; y: number }, opp: { x: number; y: number }) => {
                  const rv = Math.hypot(opp.x - pivot.x, opp.y - pivot.y);
                  const bout = { x: pivot.x + n.x * rv, y: pivot.y + n.y * rv };
                  // Sens de l'arc : celui qui ramène le battant sur le dormant.
                  const croix = n.x * (opp.y - pivot.y) - n.y * (opp.x - pivot.x);
                  return { pivot, bout, autre: opp, r: rv, sens: croix > 0 ? 1 : 0 };
                };
                // La porte à deux vantaux : chacun de son tableau jusqu'au milieu.
                if (o.vantaux === 2) return [vantail(a, { x: mx, y: my }), vantail(b, { x: mx, y: my })];
                const cote = pivots.get(o.id) === 'b' ? b : a;
                return [vantail(cote, cote === a ? b : a)];
              })();
              return (
                <G
                  key={o.id}
                  testID={`baie-${o.id}`}
                  onPress={
                    editable && onSelectOpening
                      ? () => toucher(cibleDeLaBaie(o.id), () => onSelectOpening(choisie ? null : o.id))
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
                  {/* Les deux faces du tableau : le dormant, en traits fins, dans
                      le bleu doux des fenêtres (voir `ui/encreElec`). */}
                  {o.type === 'window' &&
                    [face(1), face(-1)].map((f, i) =>
                      f ? (
                        <Line
                          key={`f${i}`}
                          x1={f[0].x}
                          y1={f[0].y}
                          x2={f[1].x}
                          y2={f[1].y}
                          stroke={choisie ? c.blue : bleuFenetre(c)}
                          strokeWidth={1.2}
                        />
                      ) : null,
                    )}
                  {/* Le vitrage : deux traits serrés au cœur du mur. */}
                  {o.type === 'window' &&
                    [0.015, -0.015].map((d, i) => {
                      const v = vitre((baie?.coeur ?? 0) + d) ?? [a, b];
                      return (
                        <Line
                          key={`v${i}`}
                          x1={v[0].x}
                          y1={v[0].y}
                          x2={v[1].x}
                          y2={v[1].y}
                          stroke={choisie ? c.blue : bleuFenetre(c)}
                          strokeWidth={choisie ? 2 : 1.1}
                        />
                      );
                    })}
                  {/* Un passage sans porte : son linteau, en tireté. */}
                  {((o.type !== 'window' && o.type !== 'door') || o.garage) &&
                    [face(1), face(-1)].map((f, i) =>
                      f ? (
                        <Line
                          key={`p${i}`}
                          x1={f[0].x}
                          y1={f[0].y}
                          x2={f[1].x}
                          y2={f[1].y}
                          stroke={c.inkFaint}
                          strokeWidth={1}
                          strokeDasharray="4,3"
                        />
                      ) : null,
                    )}
                  {/* La porte de garage : son tablier fermé, dans la trouée. */}
                  {o.type === 'door' && o.garage && (
                    <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={choisie ? c.blue : color} strokeWidth={1.4} />
                  )}
                  {/* La façade de placard : ses vantaux coulissants, deux traits décalés. */}
                  {o.type === 'door' && o.placard && (() => {
                    const ex = b.x - a.x;
                    const ey = b.y - a.y;
                    const l = Math.hypot(ex, ey) || 1;
                    const nx = (-ey / l) * 2.5;
                    const ny = (ex / l) * 2.5;
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    const trait = choisie ? c.blue : color;
                    return (
                      <>
                        <Line x1={a.x + nx} y1={a.y + ny} x2={mx + ex * 0.06 + nx} y2={my + ey * 0.06 + ny} stroke={trait} strokeWidth={1.3} />
                        <Line x1={mx - ex * 0.06 - nx} y1={my - ey * 0.06 - ny} x2={b.x - nx} y2={b.y - ny} stroke={trait} strokeWidth={1.3} />
                      </>
                    );
                  })()}
                  {/* La baie choisie : soulignée, quel que soit son genre. */}
                  {choisie && o.type !== 'window' && (
                    <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.blue} strokeWidth={4} strokeLinecap="butt" />
                  )}
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
                    <SuitLeVol
                      render={(enVol) => {
                        const bloquee = enVol && bloqueesEnVol ? bloqueesEnVol(enVol).has(o.id) : !!portesBloquees?.has(o.id);
                        const arcs = battant.map(
                          (f) => `M ${f.pivot.x} ${f.pivot.y} L ${f.bout.x} ${f.bout.y} A ${f.r} ${f.r} 0 0 ${f.sens} ${f.autre.x} ${f.autre.y}`,
                        );
                        const arc = arcs.join(' ');
                        return (
                          <>
                            {/* Un meuble dans le battant : la surface balayée
                                se teinte, la porte ne s'ouvre plus en grand. */}
                            {bloquee && (
                              <Path d={arcs.map((x) => `${x} Z`).join(' ')} fill={c.danger} fillOpacity={0.12} stroke="none" pointerEvents="none" />
                            )}
                            <Path
                              d={arc}
                              fill="none"
                              stroke={choisie ? c.blue : bloquee ? c.danger : color}
                              strokeWidth={bloquee ? 1.8 : 1.2}
                              strokeLinecap="round"
                              opacity={0.9}
                            />
                          </>
                        );
                      }}
                    />
                  )}
                </G>
              );
            })}

            {/*
              LE DÉTECTEUR D'OUVERTURE : « DO » en bleu, dans la baie, côté
              pièce — comme le plan d'architecte l'écrit.
            */}
            {showFixtures &&
              openings
                .filter((o) => o.detecteur)
                .map((o) => {
                  const g = mapping.toPx(placeDuDetecteur(o, partOf.get(roomOf(o))?.labelAt));
                  const t = Math.max(6, Math.min(10, mapping.scale * 0.1));
                  return (
                    <G key={`do-${o.id}`} pointerEvents="none">
                      <Rect
                        x={g.x - t * 1.2}
                        y={g.y - t * 0.65}
                        width={t * 2.4}
                        height={t * 1.3}
                        rx={t * 0.3}
                        fill={c.surface}
                        stroke={C_LED}
                        strokeWidth={0.9}
                      />
                      <SvgText x={g.x} y={g.y + t * 0.36} fontSize={t} fontWeight="800" fill={C_LED} textAnchor="middle">
                        DO
                      </SvgText>
                    </G>
                  );
                })}

            {/*
              LES GAINES : un filet tireté qui longe les murs, du tableau à
              chaque appareil. Son tracé est celui du métré porté au devis,
              pas une illustration.

              ELLES PASSENT SOUS LE PLAFOND, ET PLUS SEULEMENT SOUS LES
              APPAREILS — relevé du patron : « les chiffres sont cachés par
              le passage de la gaine, les pointillés gênent la lecture de la
              cote entre spots ».

              Elles étaient dessinées ENTRE le calque du plafond et celui des
              appareils : les tiretés se peignaient donc par-dessus les cotes
              de spots, qu'aucune plaque opaque ne pouvait protéger — une
              plaque ne protège rien de ce qui vient après elle. Elles
              remontent d'un cran. La règle ne change pas, elle s'applique
              simplement à un calque de plus : un CHEMINEMENT passe sous ce
              qui l'annote.
            */}
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
            <CeilingLayer
              ecartsGardes={cotesArbitrees.ecarts}
              ceiling={ceiling}
              showCeiling={showCeiling}
              selectedCeilingId={selectedCeilingId}
              selectedCeilingRow={selectedCeilingRow}
              /* Le bouton « Cotes » vaut aussi pour le plafond : les écarts
                 d'une ligne de spots s'y lisent comme ceux d'un mur. */
              showMeasures={showMeasures}
              onSelectCeiling={
                onSelectCeiling ? (id) => toucher(cibleDuPlafond(id), () => onSelectCeiling(id)) : undefined
              }
              fixtures={showFixtures ? fixtures : VIDE}
              walls={walls}
              quads={quads}
              partOf={partOf}
              mapping={mapping}
              frame={frame}
              encre={encre}
              c={c}
            />

            <FixtureLayer
              fixtures={showFixtures ? fixtures : VIDE}
              circuitMarks={circuitMarks}
              walls={walls}
              quads={quads}
              mapping={mapping}
              viewRot={view.rot}
              elecLod={elecLod}
              navigating={false}
              onSelectFixture={
                onSelectFixture
                  ? (id, wallId) => toucher(cibleDeLAppareil(id), () => onSelectFixture(id, wallId))
                  : undefined
              }
              encre={encre}
              dehors={dehorsDesMurs}
              c={c}
            />

            {/* Les ondées des poses : pièces, meubles, menuiseries. */}
            {parts
              .filter((p) => piecesNees.has(p.roomId))
              .map((p) => {
                const g = mapping.toPx(p.labelAt);
                return (
                  <OndeePose
                    key={`nee-${p.roomId}`}
                    id={p.roomId}
                    cx={g.x}
                    cy={g.y}
                    color={c.blue}
                    rayon={44}
                  />
                );
              })}
            {objects
              .filter((o) => meublesNes.has(o.id))
              .map((o, i) => {
                const g = mapping.toPx({
                  x: o.transform[12],
                  z: o.transform[14],
                });
                return (
                  <OndeePose
                    key={`nee-${o.id}`}
                    id={o.id}
                    cx={g.x}
                    cy={g.y}
                    color={c.inkSoft}
                    rayon={30}
                    retard={i * 70}
                  />
                );
              })}
            {openings
              .filter((o) => menuiseriesNees.has(o.id))
              .map((o) => {
                const g = mapping.toPx({
                  x: (o.a.x + o.b.x) / 2,
                  z: (o.a.z + o.b.z) / 2,
                });
                return (
                  <OndeePose
                    key={`nee-${o.id}`}
                    id={o.id}
                    cx={g.x}
                    cy={g.y}
                    color={c.amber}
                    rayon={26}
                  />
                );
              })}

            {/* Cartouche par pièce : nom encadré et surface au sol.
                Chacun esquive les meubles de sa pièce pour rester lisible.
                Il s'efface pendant qu'on règle un appareil de plafond : le
                cartouche tombe au CENTRE de la pièce, c'est-à-dire là où se
                pose un point lumineux. */}
            {(selectedCeilingId ? [] : parts).map((part) => {
              /*
                LE CARTOUCHE NE SE CALCULE PLUS ICI — il se DESSINE.

                Sa géométrie (les textes retenus, leur taille, la place
                trouvée) vit dans le mémo `cartouches`, et pour une raison de
                fond : il doit être posé AVANT les cotes, qui se rangent
                ensuite autour de lui. Le calculer au rendu, c'était le
                calculer après elles — et dans une pièce serrée, le dernier
                arrivé n'avait plus de place et se posait dessus.

                Une SEULE source pour la boîte qu'on réserve et celle qu'on
                dessine : deux calculs de la même boîte finissent par
                diverger, et l'arbitre protège alors une place que le dessin
                n'occupe pas.

                Ce qui reste ici est ce qui ne regarde que le dessin : les
                couleurs, l'état de sélection, le geste de renommage.
              */
              const car = cartouches.get(part.roomId);
              if (!car) return null;
              const roomName = roomById.get(part.roomId)?.name ?? '';
              const { pos, wpx, hpx, gene } = car;
              const k = echelleDesNoms(view.zoom);
              const PAD = 4 * k;
              const LH = 12.5 * k;
              const TAILLES = {
                nom: 10.5 * k,
                aire: (roomName !== '' ? 9.5 : 10.5) * k,
                hors: 8.5 * k,
                invite: 10.5 * k,
              } as const;
              const retenues = car.textes.map((t) => ({
                t: t.t,
                size: TAILLES[t.role],
                fill:
                  t.role === 'nom'
                    ? selectedRoomId === part.roomId && editable
                      ? c.blue
                      : c.ink
                    : t.role === 'aire'
                      ? roomName !== ''
                        ? c.inkSoft
                        : c.ink
                      : c.inkFaint,
                bold: t.role === 'nom' || t.role === 'invite' || roomName === '',
              }));
              const p = mapping.toPx(pos);
              const selected = editable && part.roomId === selectedRoomId;
              return (
                <G
                  key={`label-${part.roomId}`}
                  // Posé faute de mieux SUR un meuble : il se dessine, il ne
                  // prend plus le doigt. Voir `gene` ci-dessus.
                  pointerEvents={gene ? 'none' : 'auto'}
                  // En édition, le cartouche EST le bouton de renommage :
                  // on touche le nom là où il s'affiche.
                  onPress={
                    !gene
                      ? () => {
                          if (editable) {
                            // Toucher le sol, c'est quitter le meuble.
                            onSelectObject?.(null);
                            onSelectRoom?.(part.roomId);
                          }
                          /*
                            HORS ÉDITION AUSSI : toucher le nom d'une pièce
                            ouvre ce qu'on peut en faire — sa fiche d'abord
                            (correctif de l'audit : elle n'était accessible
                            qu'en mode édition).
                          */
                          onEditRoomName?.(part.roomId);
                        }
                      : undefined
                  }>
                  {/*
                    LE TRAIT DE RAPPEL d'un cartouche sorti de sa pièce trop
                    petite : du bord de la boîte à un point dans la pièce.
                  */}
                  {car.rappel
                    ? (() => {
                        const r = mapping.toPx(car.rappel);
                        const bx = Math.max(p.x - wpx / 2, Math.min(p.x + wpx / 2, r.x));
                        const by = Math.max(p.y - hpx / 2, Math.min(p.y + hpx / 2, r.y));
                        return (
                          <G testID={`rappel-${part.roomId}`}>
                            <Line x1={bx} y1={by} x2={r.x} y2={r.y} stroke={c.inkSoft} strokeWidth={0.8} />
                            <Circle cx={r.x} cy={r.y} r={1.8} fill={c.inkSoft} />
                          </G>
                        );
                      })()
                    : null}
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
                    /* Et son fond laisse voir davantage : sept dixièmes,
                       pas huit et demi. Ce qui passe dessous — un meuble,
                       une gaine — se devine sans qu'on ait à le déplacer. */
                    fillOpacity={gene ? 0.92 : planElec ? 0 : 0.7}
                    /*
                      SUR LE PLAN ÉLECTRIQUE, LE NOM EST UN TEXTE NU — comme
                      sur le plan de l'architecte. L'encadré, même à demi
                      transparent, grisait la cloison qu'il chevauchait et
                      pâlissait l'interrupteur posé dessous. Il garde le
                      toucher (fond transparent) et le bleu de la sélection.
                    */
                    stroke={selected ? c.blue : planElec ? 'none' : c.lineStrong}
                    strokeWidth={selected ? 2 : 1}
                  />
                  {/* Le point ambre de conformité a vécu ici — relevé du
                      patron : rien sur le nom de la pièce. Les constats se
                      lisent dans le dossier, où ils se chiffrent. */}
                  {retenues.map((l, li) => (
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
                  {/*
                    PLUS D'ANNEAU À CÔTÉ DU NOM — relevé du patron : « enlève
                    les points verts qui sélectionnent la pièce, le nom
                    cliqué suffit ». L'anneau de progression (socles posés
                    sur exigés, vert une fois la pièce conforme) se lisait
                    comme un bouton collé au nom. Le nom, lui, reste le
                    geste : on le touche, la pièce est prise.
                  */}
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
            {/*
              LES COTES DE LA RÈGLE — gardées, puis celle qu'on tire. Une
              cote d'architecte : un trait, deux talons, la longueur dans
              une pastille au milieu.
            */}
            {[
              ...(mesures ?? []).map((m) => ({ m, cle: m.id, vive: false })),
              ...(regle?.a && regle.b ? [{ m: { a: regle.a, b: regle.b }, cle: 'regle', vive: true }] : []),
            ].map(({ m, cle, vive }) => {
              const p1 = mapping.toPx(m.a);
              const p2 = mapping.toPx(m.b);
              const L = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
              const tx = (-(p2.y - p1.y) / L) * 6;
              const ty = ((p2.x - p1.x) / L) * 6;
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              const texte = texteDeMesure(m);
              const w = texte.length * 6.8 + 12;
              const choisie = cle === selectedMesureId;
              const encre = vive || choisie ? c.blue : c.ink;
              return (
                <G
                  key={cle}
                  onPress={
                    !vive && !regle && editable && onSelectMesure
                      ? () => onSelectMesure(choisie ? null : cle)
                      : undefined
                  }>
                  {!vive && editable ? (
                    <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={22} />
                  ) : null}
                  <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={encre} strokeWidth={vive ? 2 : 1.4} />
                  {[p1, p2].map((q, i) => (
                    <Line key={i} x1={q.x - tx} y1={q.y - ty} x2={q.x + tx} y2={q.y + ty} stroke={encre} strokeWidth={vive ? 2 : 1.4} />
                  ))}
                  <Rect x={mx - w / 2} y={my - 10} width={w} height={20} rx={10} fill={c.surface} stroke={encre} strokeWidth={1} />
                  <SvgText x={mx} y={my + 4} fill={encre} fontSize={12} fontWeight="700" textAnchor="middle">
                    {texte}
                  </SvgText>
                </G>
              );
            })}
            {regle?.a && !regle.b && (
              <Circle cx={mapping.toPx(regle.a).x} cy={mapping.toPx(regle.a).y} r={5} fill={c.blue} pointerEvents="none" />
            )}
            {regle && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill="transparent"
                onPress={(e) => {
                  const { locationX, locationY } = e.nativeEvent;
                  onRegleTap?.(mapping.toMeters({ x: locationX, y: locationY }), 18 / mapping.scale);
                }}
              />
            )}
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
          </ToileDuPlan>

          {/* La poignée de l'appareil de plafond choisi : hors du SVG, comme
              celle d'un meuble — un PanResponder ne vit pas dans un tracé. */}
          {editable &&
            selectedCeilingId &&
            (() => {
              const cl = (ceiling ?? []).find((x) => x.id === selectedCeilingId);
              if (!cl) return null;
              const q = mapping.toPx(cl.at);
              return (
                <CeilingDragHandle
                  id={cl.id}
                  center={q}
                  rayon={Math.max(8, rayonDuPointLumineux(mapping.scale))}
                  mapping={mapping}
                  at={cl.at}
                  onTap={() => onSelectCeiling?.(cl.id)}
                />
              );
            })()}

          {/* Une ligne de spots choisie entière : chacun de ses spots la tire d'un bloc. */}
          {editable &&
            !selectedCeilingId &&
            selectedCeilingRow &&
            (ceiling ?? [])
              .filter((cl) => cl.row === selectedCeilingRow)
              .map((cl) => (
                <CeilingDragHandle
                  key={`ligne-${cl.id}`}
                  id={cl.id}
                  ligne={selectedCeilingRow}
                  center={mapping.toPx(cl.at)}
                  rayon={Math.max(8, rayonDuPointLumineux(mapping.scale))}
                  mapping={mapping}
                  at={cl.at}
                  onTap={() => onSelectCeiling?.(cl.id)}
                />
              ))}

          {/* Les bouts de la règle se glissent : un doigt n'y vise pas au centimètre. */}
          {regle &&
            (['a', 'b'] as const).map((bout) => {
              const at = regle[bout];
              if (!at) return null;
              return (
                <RegleHandle
                  key={bout}
                  center={mapping.toPx(at)}
                  at={at}
                  mapping={mapping}
                  onMove={(q, tol) => onRegleBout?.(bout, q, tol)}
                />
              );
            })}

          {/* Meuble sélectionné : poignée de déplacement + bouton supprimer */}
          {/* Le meuble sélectionné : toute son emprise se glisse, sa croix
              et sa poignée de rotation flottent HORS de lui.

              Une poignée de 44 px au centre ne suffisait pas : dès qu'on
              posait le doigt à côté du centre — c'est-à-dire presque
              partout sur un lit —, c'était le plan qui se déplaçait. */}
          {selectedObjectId &&
            showFurniture &&
            (() => {
              const tenu = meublesDuNiveau.find((x) => x.id === selectedObjectId);
              if (!tenu) return null;
              return (
                <SuitLeDoigt
                  objet={tenu}
                  render={(o) => {
                    const f = footprintOf(o, partOf, facesPlan);
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
                          onRefus={signalerRefus}
                          onTap={onSelectObject ? () => onSelectObject(null) : undefined}
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
                  }}
                />
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
              const pc = t.coin ? mapping.toPx(t.coin) : null;
              const mx = pc ? pc.x : (p0.x + p1.x) / 2;
              const my = pc ? pc.y : (p0.y + p1.y) / 2;
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
                  accessibilityLabel={
                    t.coin
                      ? `Fermer le coin ouvert de ${Math.round(t.ecart * 100)} cm`
                      : `Combler le trou de ${Math.round(t.ecart * 100)} cm`
                  }
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
            PLUS DE MENU NI D'ASTUCE POSÉS SUR LE PLAN — relevé du patron,
            captures à l'appui : « le problème concerne le placement des
            menus de mur sur le plan 2D ; fais un menu fixe qui ne gênera pas
            la visibilité du plan ». La barre d'actions flottait à côté du mur
            choisi, et l'astuce du retour se posait sous les pastilles du
            haut : deux blocs de plus en travers du dessin, ajoutés à la carte
            du bas. Tout passe dans le menu fixe de l'écran (voir
            `carteOuverte`, `ResultScreen`) — gestes, mesures et consigne.
          */}
          {/*
            LES COINS QU'ON TIRE : CEUX DU MUR CHOISI, ET EUX SEULS.

            Chaque coin du plan portait une poignée INVISIBLE de quarante-
            quatre points, en permanence en mode édition. Elle prenait le
            doigt dès qu'il se posait : viser une prise près d'un angle,
            c'était tirer l'angle — le mur « se déformait tout seul ». Les
            poignées ne viennent plus qu'avec le mur qu'on a choisi, elles se
            VOIENT, et un simple appui dessus relâche le mur comme le ferait
            un appui sur lui.
          */}
          {editable &&
            selectedWallId &&
            (() => {
              const w = walls.find((x) => x.id === selectedWallId);
              if (!w) return null;
              return (['a', 'b'] as const).map((end) => (
                <CornerHandle
                  key={`${w.id}:${end}`}
                  corner={{ x: w[end].x, z: w[end].z, wallId: w.id, end }}
                  mapping={mapping}
                  onTap={() => onSelectWall(null)}
                />
              ));
            })()}

          {/*
            LE MUR CHOISI SE TOURNE — IL NE SE POUSSE PLUS AU DOIGT.

            Relevé du patron : « la sélection d'éléments sur le plan 2D est
            capricieuse, et le mur se déforme parfois sans faire exprès en
            essayant de cliquer sur un élément d'une pièce proche du mur ».
            La bande de prise du mur choisi — trente-quatre points, posée
            PAR-DESSUS le dessin — avalait l'appui destiné à la prise ou à
            l'interrupteur collé contre lui, et dix points de tremblement
            poussaient la cloison. Le décalage se dit maintenant au chiffre,
            dans la barre du mur (« Décaler ») ; la rotation garde sa
            poignée, posée à l'écart du mur.
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
              /*
                ILS ONT ÉCHANGÉ LEURS FLANCS.

                Le menu prenait le côté de la pièce — « c'est là qu'on lit » —
                et la poignée l'autre. Relevé du patron : « affiche-la en
                dehors de la pièce si possible ». Le menu est sorti ; la
                poignée prend donc la place laissée, dedans. Ce qui compte
                n'a pas changé d'un pouce : ils sont sur des flancs OPPOSÉS,
                par construction, et le banc le prouve mur par mur.
              */
              const sens: 1 | -1 = versPiece;
              return (
                <React.Fragment key={`mur-${w.id}`}>
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
      {/* Plusieurs choses sous le doigt : laquelle ? (voir `toucher`) */}
      {choixSousLeDoigt && (
        <ChoixSousLeDoigt
          choix={choixSousLeDoigt}
          largeur={layout.w}
          hauteur={layout.h}
          onFermer={() => setChoixSousLeDoigt(null)}
        />
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
  longueur,
  selected,
  neuve,
  sansCorps,
  couche = 'trait',
  exterieur,
  onPress,
}: {
  wall: WallSeg;
  quad?: WallQuad;
  /**
   * LE CÔTÉ DU DEHORS, pour un mur de façade : la surépaisseur que le poché
   * y dessine se touche aussi (voir `cibleDeFacade`).
   */
  exterieur?: 1 | -1;
  mapping: EffMapping;
  showMeasure: boolean;
  /**
   * Où poser la valeur, décidée en amont.
   *
   * Le mur ne choisit plus tout seul : il faut voir TOUTES les cotes pour
   * savoir laquelle recouvre laquelle, et une cote se recale dans la portion
   * visible de son mur — deux choses qu'un mur, seul, ne peut pas savoir.
   */
  measureAt?: Place;
  /** Les cotes globales s'effacent quand les cotes de détail arrivent. */
  measureOpacity?: number;
  /** La cote à écrire : au nu pour un mur dessiné (voir `longueurCotee`). */
  longueur?: number;
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
  /**
   * Le corps ne se peint pas : le POCHÉ dessine la maçonnerie d'un seul
   * tenant (voir `pocheDesMurs`). Il reste pour le toucher — et se peint en
   * bleu quand le mur est choisi.
   */
  sansCorps?: boolean;
  /**
   * LES DEUX ZONES D'UN MUR N'ONT PAS LE MÊME DROIT.
   *
   * Relevé du patron : « fais en sorte que le mur ne soit pas sélectionné si
   * on clique sur le centre d'une petite pièce — par exemple je clique sur
   * un meuble dans une petite pièce, c'est le mur qui est sélectionné car
   * proche ».
   *
   * Ce n'était pas une affaire de taille de cible, mais d'ORDRE DE DESSIN.
   * Les murs se peignent APRÈS les meubles, donc au-dessus : les trois
   * points de tolérance qui débordent de chaque côté du poché volaient
   * l'appui à ce qui était dessous. Dans une salle d'eau de 3,8 m², une
   * baignoire est plaquée contre le mur — son nu et le nu du poché ne font
   * qu'un — et le halo mordait sur elle toute sa longueur.
   *
   * On sépare donc ce qui SE VOIT de ce qui ne se voit pas. Le `trait` — le
   * poché, ce qu'on vise — reste au-dessus de tout. Le `halo` — la
   * tolérance, invisible — descend SOUS les meubles, où il ne sert plus que
   * là où rien d'autre n'est dessiné. Toucher un mur prend le mur ; toucher
   * à côté d'un mur ne le prend que si la place est libre.
   */
  couche?: 'halo' | 'trait';
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
  const label = `${(longueur ?? segLength(wall)).toFixed(2).replace('.', ',')} m`;
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

  if (couche === 'halo') {
    return (
      <G onPress={onPress}>
        {/*
          LA CIBLE SUIT LE MUR DESSINÉ — relevé du patron : « la sélection
          d'un mur est capricieuse, et un clic au centre de la pièce
          sélectionne un mur proche… il faut que ce soit le mur qui soit
          strictement cliquable ».

          Elle faisait TRENTE points de large, en dur : quinze débordant dans
          la pièce, quinze au-dehors. Quinze points ne veulent rien dire tant
          qu'on ne sait pas à quelle échelle on regarde — à l'ouverture d'un
          logement ils valent trente-sept centimètres, et sur un plan dézoomé
          près d'un mètre. Le placard d'un mètre dix était alors entièrement
          couvert par les halos de ses quatre murs : plus un seul point où
          toucher le sol.

          Elle vaut donc l'ÉPAISSEUR DU POCHÉ plus trois points de chaque
          côté — ce qu'il faut pour le tremblement du doigt, et rien de plus.
          Elle grandit avec le zoom, comme le mur. Le plancher de douze points
          garde visable un mur dessiné fin ; en dessous, on zoome, comme pour
          tout le reste du plan.

          Le même défaut avait déjà été corrigé sur les retours de mur percés
          (« 18 px de halo débordaient de neuf pixels dans la pièce ») ; le mur
          entier, lui, était resté à trente.

          ET ELLE SE DESSINE SOUS LES MEUBLES — voir `couche` : une tolérance
          invisible n'a pas à voler l'appui d'un dessin qu'on voit.
        */}
        <Line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="transparent"
          strokeWidth={Math.max(12, bodyPx + 6)}
        />
      </G>
    );
  }

  /*
    TOUT LE TRAIT NOIR SE TOUCHE — relevé du patron : « on doit cliquer sur la
    partie intérieure de la largeur du mur ». La façade est dessinée plus
    épaisse vers le dehors ; cette part-là répond maintenant aussi.
  */
  const facade =
    exterieur && onPress && !neuve
      ? cibleDeFacade(wall, exterieur, undefined, quad ? distanceAuTrait(wall, exterieur > 0 ? quad.a1 : quad.a2) : undefined)
          .map((p) => mapping.toPx(p))
          .map((p) => `${p.x},${p.y}`)
          .join(' ')
      : null;

  return (
    <G onPress={onPress}>
      {facade ? <Polygon points={facade} fill="transparent" stroke="none" /> : null}
      {/*
        ICI, PLUS DE HALO : la cible de cette couche, c'est le poché
        lui-même — ce qu'on voit et ce qu'on vise. La tolérance est passée
        dessous, avec les meubles (voir `couche`).

        Un mur dessiné fin — plan dézoomé, poché plus mince qu'un trait —
        n'est donc plus visable QUE par son halo. C'est voulu : qui vise un
        mur fin zoome, comme pour tout le reste du plan.
      */}
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
        <Polygon points={body} fill={sansCorps && !selected ? 'transparent' : teinte} stroke="none" />
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
        <G opacity={measureOpacity}>
          {/* Décalée faute de place : un trait l'attache au nu de son mur. */}
          {measureAt?.attache ? (
            <Line
              testID="attache-cote"
              x1={measureAt.attache.x}
              y1={measureAt.attache.y}
              x2={mid.x}
              y2={mid.y}
              stroke={c.inkFaint}
              strokeWidth={0.8}
            />
          ) : null}
          {/*
            LA PLAQUE SOUS LE CHIFFRE — vu sur les captures du simulateur :
            le semis du sol et les meubles passaient à travers les cotes
            (« 3,00 m » sur le lave-linge). Taillée sur le texte, deux points
            de débord (`plaqueDeCote`).
          */}
          {(() => {
            const p = plaqueDeCote(label, 10);
            return (
              <Rect
                x={mid.x - p.w / 2}
                y={mid.y - p.h / 2}
                width={p.w}
                height={p.h}
                rx={3}
                fill={c.surface}
                opacity={0.92}
                transform={`rotate(${angle}, ${mid.x}, ${mid.y})`}
              />
            );
          })()}
          <SvgText
            x={mid.x}
            y={mid.y + 3.5}
            fill={selected ? c.blue : c.inkSoft}
            fontSize={10}
            fontWeight="600"
            textAnchor="middle"
            transform={`rotate(${angle}, ${mid.x}, ${mid.y})`}>
            {label}
          </SvgText>
        </G>
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
  ligne,
}: {
  id: string;
  /** La ligne de spots choisie en entier : le glissé la déplace d'un bloc. */
  ligne?: string;
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
  /** Ce que la ligne a déjà avancé depuis le début du geste. */
  const avance = useRef({ x: 0, z: 0 });
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  /* Le verrou du slop : un tap sur la poignée ne déplace plus rien. */
  const seuil = useRef(creerSeuil()).current;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          seuil.reprendre();
          startRef.current = live.current.at;
          avance.current = { x: 0, z: 0 };
          haptic('accroche');
        },
        onPanResponderMove: (_e, g) => {
          if (!seuil.franchi(g.dx, g.dy)) return;
          const d = live.current.mapping.deltaToMeters(g.dx, g.dy);
          if (ligne) {
            const st = useScanStore.getState();
            const avant = st.ceiling.find((c) => c.id === id)?.at;
            st.moveCeilingRow(ligne, d.x - avance.current.x, d.z - avance.current.z);
            const apres = useScanStore.getState().ceiling.find((c) => c.id === id)?.at;
            if (avant && apres) {
              avance.current = {
                x: avance.current.x + (apres.x - avant.x),
                z: avance.current.z + (apres.z - avant.z),
              };
            }
            return;
          }
          useScanStore.getState().moveCeiling(id, {
            x: startRef.current.x + d.x,
            z: startRef.current.z + d.z,
          });
        },
        onPanResponderRelease: (_e, g) => {
          releaseHaptic('accroche');
          // Le doigt n'a pas glissé : il a touché. Le seuil est celui de
          // toute l'app (`GLISSEMENT_MIN`), et c'est le MÊME des deux côtés
          // — sinon il resterait entre les deux une zone où le geste n'est
          // ni un tap ni un glissement, et où lever le doigt ne fait rien.
          if (estUnTap(g.dx, g.dy)) tapRef.current?.();
        },
        onPanResponderTerminate: () => releaseHaptic('accroche'),
      }),
    [id, seuil, ligne],
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

/** Un bout de la règle : un point bleu qu'on glisse, accroché par l'écran. */
function RegleHandle({
  center,
  at,
  mapping,
  onMove,
}: {
  center: { x: number; y: number };
  at: Pt;
  mapping: EffMapping;
  onMove: (p: Pt, tolerance: number) => void;
}) {
  const c = useTheme();
  const depart = useRef(at);
  const vif = useRef({ mapping, at, onMove });
  vif.current = { mapping, at, onMove };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          depart.current = vif.current.at;
          haptic('accroche');
        },
        onPanResponderMove: (_e, g) => {
          const d = vif.current.mapping.deltaToMeters(g.dx, g.dy);
          vif.current.onMove(
            { x: depart.current.x + d.x, z: depart.current.z + d.z },
            18 / vif.current.mapping.scale,
          );
        },
        onPanResponderRelease: () => releaseHaptic('accroche'),
        onPanResponderTerminate: () => releaseHaptic('accroche'),
      }),
    [],
  );
  return (
    <View
      accessibilityLabel="Bout de la règle"
      style={{
        position: 'absolute',
        left: center.x - 22,
        top: center.y - 22,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      {...pan.panHandlers}>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: c.blue,
          borderWidth: 3,
          borderColor: '#FFFFFF',
        }}
      />
    </View>
  );
}

export function ObjectDragHandle({
  objectId,
  center,
  half,
  mapping,
  raw,
  onRefus,
  onTap,
}: {
  /**
   * Un appui sans glisser. Il tombait dans le vide : la poignée prend le
   * doigt au poser, et rien sous elle ne le recevait — ni la prise posée
   * derrière le meuble, ni le meuble lui-même pour le relâcher.
   */
  onTap?: () => void;
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
  /**
   * LE DERNIER POINT VISÉ — celui qu'on range, pas celui qui tenait.
   *
   * Il a gardé « la dernière position qui tenait », et le lâcher dans un mur
   * y REVENAIT : on poussait une commode contre un mur, on dépassait de
   * trois centimètres, et le meuble sautait jusqu'au dernier point valable
   * du glissement — parfois quarante centimètres en arrière. Le refus était
   * juste, la sanction aveugle.
   *
   * Le magasin RANGE désormais le point visé (`rangerMeuble`) : le mur
   * arrête au lieu de renvoyer. On garde donc le point du DOIGT, y compris
   * quand il est dans la maçonnerie — c'est justement là que la collision
   * sert.
   */
  const dernierVise = useRef<{ x: number; z: number } | null>(null);
  /** Le meuble était-il refusé à l'image précédente ? (pour ne vibrer qu'une fois) */
  const refuseAvant = useRef(false);
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
  const live = useRef({ mapping, raw, onRefus, onTap });
  /*
    LE RAPPORT DE REFUS PASSE PAR LA RÉFÉRENCE, comme tout ce qui change à
    chaque image : mis dans les dépendances du geste, il refabriquerait le
    `PanResponder` à chaque rendu du parent — et le déplacement en cours
    perdrait son point de départ.
  */
  live.current = { mapping, raw, onRefus, onTap };
  /* Le verrou du slop : un tap sur la poignée ne déplace plus rien. */
  const seuil = useRef(creerSeuil()).current;
  /** Les murs du geste et leurs faces, lus une fois à l'appui. */
  const prepare = useRef<{ murs: WallSeg[]; faces?: ReturnType<typeof facesDesMurs> }>({ murs: [] });
  const pan = useMemo(
    () => {
      /*
        LE MAGASIN APPREND LE GESTE AU LÂCHER — et l'apprend comme avant.

        Il recevait chaque image (`setObjectCenter` au doigt), puis le
        rangement. On rejoue la dernière image, PUIS le rangement : le
        rangement part ainsi du même « d'où il vient » qu'avant (voir
        `rangerMeuble`), sous la même clé d'historique — un seul point
        d'annulation pour tout le geste. Le meuble en vol ne s'éteint
        qu'après : il n'y a pas d'image où l'on reverrait l'ancienne place.
      */
      const poserAuLacher = (vise: { x: number; z: number }) => {
        const st = useScanStore.getState();
        st.setObjectCenter(objectId, vise.x, vise.z, true);
        st.rangerMeuble(objectId, vise.x, vise.z);
        dernierVise.current = null;
        mettreEnVol(null);
        /*
          ET LE GESTE EST FINI POUR DE BON. Les écritures du lâcher ouvrent
          un « geste en cours » (`pasDeGeste`) : l'écran figeait ses analyses
          et se rendait une SECONDE fois, plan compris, un cinquième de
          seconde plus tard. Il n'y a plus d'image à venir : un seul rendu,
          analyses à jour.
        */
        finirLeGeste();
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Le geste ne se rend PAS au plan : `PanResponder` accepte par
        // défaut de céder la main, et le plan la redemande à chaque
        // mouvement — les premiers pixels déplaçaient le meuble, puis le
        // plan reprenait tout.
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          seuil.reprendre();
          const t = live.current.raw.transform;
          startRef.current = { x: t[12], z: t[14] };
          /*
            LE POINT VISÉ NE SURVIT PAS AU GESTE QUI L'A PRODUIT.

            Il vivait dans une référence que rien ne remettait à zéro, et le
            geste suivant en héritait. Entre deux glissements cela ne se
            voyait pas — chaque mouvement le réécrit avant le lâcher. Mais
            un APPUI simple ne bouge pas : le seuil n'est pas franchi,
            aucun mouvement n'est enregistré, et le lâcher rangeait le point
            du glissement PRÉCÉDENT. Toucher un meuble pour le sélectionner
            le renvoyait donc où le doigt l'avait laissé la dernière fois —
            en effaçant au passage tout ce que les flèches avaient réglé
            entre-temps. Quatre-vingts centimètres, sur le banc qui l'a
            attrapé.
          */
          dernierVise.current = null;
          refuseAvant.current = false;
          /*
            LES MURS DU GESTE SE PRÉPARENT UNE FOIS. Ils ne bougent pas
            pendant qu'on glisse un meuble : leurs faces se calculaient
            pourtant deux fois par image — une pour le refus, une pour la
            pose.
          */
          const murs = useScanStore.getState().walls;
          prepare.current = { murs, faces: facesDesMurs(murs) };
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
          if (!seuil.franchi(g.dx, g.dy)) return;
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
            prepare.current.murs,
            prepare.current.faces,
          );
          /*
            LE MEUBLE SUIT LE DOIGT SANS ÉCRIRE LE MAGASIN — voir `useEnVol`.
            C'est la même pose que l'action écrira au lâcher (`meubleAuDoigt`)
            ; seules les vues qui le dessinent se rendent.
          */
          const tenu = useScanStore.getState().objects.find((x) => x.id === objectId);
          const pose = tenu && meubleAuDoigt(tenu, vise.x, vise.z, prepare.current.murs, prepare.current.faces);
          if (pose) mettreEnVol(pose);
          dire?.(!essai.valide);
          // On range CE point-là au lâcher, valable ou non : c'est le mur qui
          // arrêtera, pas un retour en arrière.
          dernierVise.current = vise;
          if (essai.valide) {
            releaseHaptic('butee');
          } else {
            haptic('butee', true);
          }
          refuseAvant.current = !essai.valide;
        },
        /*
          AU LÂCHER, LE MEUBLE SE RANGE — il ne revient pas en arrière.

          Le mur l'arrête au contact, le contour de la pièce le recadre s'il
          en dépasse, les autres meubles ne se laissent pas traverser. Rien
          ne l'attire : lâché au large, il ne bouge pas d'un millimètre.
          Voir `rangerMeuble` dans le magasin.

          Si le doigt n'a jamais franchi le seuil de glissement, il n'y a pas
          de point visé — c'était un appui, pas un déplacement, et on ne
          range rien : un simple tap ne doit pas déplacer un meuble que le
          relevé a posé de travers exprès.
        */
        onPanResponderRelease: () => {
          releaseHaptic('butee');
          live.current.onRefus?.(false);
          const vise = dernierVise.current;
          if (vise) {
            poserAuLacher(vise);
            if (refuseAvant.current) haptic('accroche');
          } else {
            // Rien de visé : c'était un appui. Il relâche le meuble, comme
            // un appui sur un meuble déjà choisi — et ce qu'il cachait
            // redevient touchable.
            live.current.onTap?.();
          }
        },
        /*
          UN GESTE COUPÉ NE LAISSE PAS LE MEUBLE DANS UN MUR.

          Un appel entrant, une notification tirée du haut, et le système
          reprend le toucher au milieu du mouvement : `Terminate` remplace
          alors `Release`. Il éteignait bien le halo rouge — mais il laissait
          le meuble là où le doigt l'avait mené, c'est-à-dire, une fois sur
          deux, DANS la maçonnerie, à une place que l'app elle-même refuse au
          lâcher. On repose donc à la dernière position qui tenait, comme
          au lâcher : c'est le même geste, il finit simplement autrement.
          Depuis que le lâcher RANGE au lieu de revenir en arrière, celui-ci
          range aussi — un appel entrant ne doit pas laisser le meuble dans
          un mur, mais il ne doit pas non plus le renvoyer d'où il vient.
        */
        onPanResponderTerminate: () => {
          releaseHaptic('butee');
          live.current.onRefus?.(false);
          const vise = dernierVise.current;
          if (vise) poserAuLacher(vise);
          else mettreEnVol(null);
        },
      });
    },
    [objectId, seuil],
  );
  /*
    UNE POIGNÉE QUI S'EN VA EN PLEIN GESTE NE LAISSE PAS UN MEUBLE EN VOL.
    Le magasin garde alors la dernière image, comme quand il l'apprenait à
    chaque mouvement — et le meuble en vol s'éteint, sinon il resterait
    dessiné à cet endroit la prochaine fois qu'on le choisirait.
  */
  useEffect(
    () => () => {
      const vise = dernierVise.current;
      // Seulement si c'est ELLE qui tenait le meuble (et non sa voisine
      // qui le fait pivoter).
      if (!vise || useEnVol.getState().objet?.id !== objectId) return;
      useScanStore.getState().setObjectCenter(objectId, vise.x, vise.z, true);
      mettreEnVol(null);
    },
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
  /** Le cap montré en vol, que le magasin n'a pas encore reçu. */
  const dernierCap = useRef<number | null>(null);
  const poserLeCap = useMemo(
    () => () => {
      const yaw = dernierCap.current;
      dernierCap.current = null;
      if (yaw !== null) useScanStore.getState().setObjectYaw(objectId, yaw);
    },
    [objectId],
  );
  // Même règle que pour le déplacement : la poignée suit le meuble, donc
  // `at`, `center` et `raw` changent à chaque frame. Les mettre dans les
  // dépendances recréait le responder en plein geste et la rotation
  // repartait de zéro.
  const live = useRef({ at, center, raw, viewRot, frame });
  live.current = { at, center, raw, viewRot, frame };
  /* Le verrou du slop : un tap sur la poignée ne déplace plus rien. */
  const seuil = useRef(creerSeuil()).current;
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
          seuil.reprendre();
          dernierCap.current = null;
          const L = live.current;
          base.current = {
            yaw: Math.atan2(L.raw.transform[2], L.raw.transform[0]),
            // Angle écran du point de départ de la poignée, autour du centre.
            touche: Math.atan2(L.at.y - L.center.y, L.at.x - L.center.x),
          };
          setAngle(Math.round(((base.current.yaw * 180) / Math.PI) % 360));
        },
        onPanResponderMove: (_e, g) => {
          if (!seuil.franchi(g.dx, g.dy)) return;
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
          // Le meuble tourne en vol ; le magasin l'apprend au lâcher (voir
          // `useEnVol`), par la même formule (`meubleTourne`).
          const tenu = useScanStore.getState().objects.find((x) => x.id === objectId);
          const tourne = tenu && meubleTourne(tenu, yaw);
          if (tourne) {
            dernierCap.current = yaw;
            mettreEnVol(tourne);
          }
          const deg = Math.round(((yaw - vr) * 180) / Math.PI);
          setAngle(((deg % 360) + 360) % 360);
        },
        /*
          UN TOUCHER TOURNE D'UN QUART — revue « Chloé » : toucher la flèche
          ne faisait rien, il fallait la tirer, et l'on croyait la rotation
          en panne. Le glisser garde l'angle libre ; le toucher, lui, fait le
          geste qu'on attend d'une flèche qui tourne.
        */
        onPanResponderRelease: (_e, g) => {
          if (!seuil.franchi(g.dx, g.dy)) {
            useScanStore.getState().rotateObject(objectId, 1);
            haptic('accroche');
          } else {
            // Le dernier cap d'abord : c'est ce que le magasin recevait à
            // chaque image, et c'est de lui que part le rangement.
            poserLeCap();
            // Tourné au doigt, il se range lui aussi (voir `rotateObject`).
            const o = useScanStore.getState().objects.find((x) => x.id === objectId);
            if (o) {
              useScanStore
                .getState()
                .rangerMeuble(objectId, o.transform[12], o.transform[14], `yaw:${objectId}`);
            }
          }
          mettreEnVol(null);
          // Un seul rendu au lâcher, analyses à jour (voir la poignée de
          // déplacement).
          finirLeGeste();
          setAngle(null);
        },
        onPanResponderTerminate: () => {
          // Coupé par le système : le meuble garde le cap atteint, comme
          // quand le magasin l'apprenait image par image.
          poserLeCap();
          mettreEnVol(null);
          setAngle(null);
        },
      }),
    [objectId, seuil, poserLeCap],
  );
  // Démontée en plein geste : le cap atteint est gardé, et le meuble en vol
  // s'éteint — mais seulement si c'est ELLE qui le tenait.
  useEffect(
    () => () => {
      if (dernierCap.current === null || useEnVol.getState().objet?.id !== objectId) return;
      poserLeCap();
      mettreEnVol(null);
    },
    [objectId, poserLeCap],
  );
  return (
    <>
      <View
        {...pan.panHandlers}
        accessibilityLabel="Pivoter le meuble"
        // Trente-quatre dessinés, quarante-six sous le doigt : la règle de
        // l'app, que ses deux voisines appliquaient déjà.
        hitSlop={DEBORD_DOIGT}
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
  /* Le verrou du slop : un tap sur la poignée ne déplace plus rien. */
  const seuil = useRef(creerSeuil()).current;
  /** La course montrée en vol, que le magasin n'a pas encore reçue. */
  const dernierEtirement = useRef<number | null>(null);
  /*
    LE MAGASIN APPREND L'ÉTIREMENT AU LÂCHER : la dernière course, depuis
    le même état de départ — exactement ce qu'il recevait à la dernière
    image, sous la même clé d'historique.
  */
  const poserLEtirement = useMemo(
    () => () => {
      const total = dernierEtirement.current;
      const base = depart.current;
      dernierEtirement.current = null;
      // Rien de montré en vol : ce n'est pas elle qui tient le meuble.
      if (!objectId || total === null) return;
      if (base) useScanStore.getState().resizeObjectSide(objectId, cote, total, base);
      if (useEnVol.getState().objet?.id === objectId) mettreEnVol(null);
    },
    [objectId, cote],
  );
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          seuil.reprendre();
          dernierEtirement.current = null;
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
          if (!seuil.franchi(g.dx, g.dy)) return;
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
          // Le meuble s'étire en vol ; le magasin l'apprend au lâcher (voir
          // `useEnVol`), par la même formule (`meubleEtire`).
          const st = useScanStore.getState();
          const tenu = st.objects.find((x) => x.id === objectId);
          if (!tenu) return;
          const r = meubleEtire(st, tenu, cote, total, base);
          dernierEtirement.current = total;
          mettreEnVol(r.objet);
          if (r.accroche) haptic('accroche', true);
          else releaseHaptic('accroche');
        },
        onPanResponderRelease: () => {
          poserLEtirement();
          // Un seul rendu au lâcher, analyses à jour (voir la poignée de
          // déplacement). Une pièce qu'on étire écrit déjà à chaque image :
          // son geste se ferme comme avant, au silence.
          if (objectId) finirLeGeste();
          depart.current = null;
          departPiece.current = null;
          releaseHaptic('accroche');
        },
        onPanResponderTerminate: () => {
          poserLEtirement();
          depart.current = null;
          departPiece.current = null;
          releaseHaptic('accroche');
        },
      }),
    [objectId, roomId, cote, seuil, poserLEtirement],
  );
  useEffect(() => () => poserLEtirement(), [poserLEtirement]);
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
  /* Le verrou du slop : un tap sur la poignée ne déplace plus rien. */
  const seuil = useRef(creerSeuil()).current;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          seuil.reprendre();
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
          if (!seuil.franchi(g.dx, g.dy)) return;
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
    [seuil],
  );
  const at = poigneeAt(wall, mapping, sens, borne);
  return (
    <>
      <View
        {...pan.panHandlers}
        accessibilityLabel="Tourner le mur"
        hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
        style={[styles.wallRotate, { left: at.x - 15, top: at.y - 15 }]}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
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
/** La distance d'un coin du corps de mur à son trait : où est sa face. */
function distanceAuTrait(w: WallSeg, p: Pt): number {
  const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
  return Math.abs(((p.x - w.a.x) * -(w.b.z - w.a.z) + (p.z - w.a.z) * (w.b.x - w.a.x)) / L);
}

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
  onTap,
}: {
  corner: { x: number; z: number; wallId: string; end: 'a' | 'b' };
  mapping: EffMapping;
  /** Un appui sans glisser : le mur se relâche. */
  onTap?: () => void;
}) {
  const styles = getStyles(useTheme());
  const startRef = useRef({ x: corner.x, z: corner.z });
  /* Le verrou du slop : un tap sur la poignée ne déplace plus rien. */
  const seuil = useRef(creerSeuil()).current;
  /*
    LE GESTE EST CRÉÉ UNE FOIS. Il lit le coin et la projection courants par
    une référence : recréé à chaque image (le coin bouge sous le doigt), il
    coûtait un `PanResponder` neuf par image pendant tout le glisser.
  */
  const live = useRef({ corner, mapping, onTap });
  live.current = { corner, mapping, onTap };
  const cible = useRef({ wallId: corner.wallId, end: corner.end });
  const tire = useRef(false);
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
          seuil.reprendre();
          tire.current = false;
          const c = live.current.corner;
          startRef.current = { x: c.x, z: c.z };
          cible.current = { wallId: c.wallId, end: c.end };
        },
        // Un appui n'a rien tiré : c'est un appui sur le mur, il le relâche.
        onPanResponderRelease: () => {
          if (!tire.current) live.current.onTap?.();
        },
        onPanResponderMove: (_e, g) => {
          if (!seuil.franchi(g.dx, g.dy)) return;
          tire.current = true;
          const d = live.current.mapping.deltaToMeters(g.dx, g.dy);
          useScanStore.getState().moveWallPoint(cible.current.wallId, cible.current.end, {
            x: startRef.current.x + d.x,
            z: startRef.current.z + d.z,
          });
        },
      }),
    [seuil],
  );

  const px = mapping.toPx(corner);
  /*
    UN POINT QU'ON VOIT : ce qu'on peut tirer se montre. Invisible, la
    poignée prenait le doigt sans prévenir.

    TRENTE-DEUX POINTS DESSINÉS, QUARANTE-QUATRE SOUS LE DOIGT. La règle est
    celle de toute l'app, et cette poignée-ci l'avait ratée : elle offrait
    trente-deux points nus, à viser sur un chantier, avec des gants. Le
    débord ne coûte rien au dessin — elle est invisible.
  */
  return (
    <View
      {...pan.panHandlers}
      accessibilityLabel="Tirer le coin du mur"
      hitSlop={DEBORD_DOIGT}
      style={[styles.handle, { left: px.x - 16, top: px.y - 16 }]}>
      <View pointerEvents="none" style={styles.coinPoint} />
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
  /** La carte du choix sous le doigt (voir `ChoixSousLeDoigt`). */
  choixCarte: {
    position: 'absolute',
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
  },
  choixTitre: {
    color: c.inkSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 10,
    paddingBottom: 6,
    textTransform: 'uppercase',
  },
  choixLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    height: 52,
    borderRadius: 12,
  },
  choixIcone: {
    minWidth: 36,
    paddingHorizontal: 3,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choixTextes: { flex: 1 },
  choixNom: { color: c.ink, fontSize: 15, fontWeight: '600' },
  choixGenre: { color: c.inkSoft, fontSize: 12, marginTop: 1 },
  /** Le point touché, cerclé : on voit de quoi on parle. */
  choixDoigt: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: c.blue,
    backgroundColor: c.blueSoft,
  },
  /** La poignée de rotation d'un mur : un rond bleu clair, comme au meuble. */
  wallRotate: {
    position: 'absolute',
    /* Relevé du patron : « réduis légèrement le bouton de rotation aussi ».
       Trente points dessinés, et le débord le ramène à quarante-quatre sous
       le doigt : c'est la règle de toute l'app. */
    width: 30,
    height: 30,
    borderRadius: 15,
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
  wallAngleText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '600' },
  handle: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objDrag: { position: 'absolute' },
  /** Le coin tirable du mur choisi : un point blanc cerclé de bleu. */
  coinPoint: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.blue,
  },
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
  pierNoteTitle: { color: c.blue, fontSize: 12, fontWeight: '600' },
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
  rotBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  // Commandes du mur sélectionné : posées à côté de lui, jamais dessus.
  /*
    UNE PILULE, PAS UNE DALLE — relevé du patron : « trop imposant et
    vieillot ». Trois retouches qui se comptent : les colonnes perdent sept
    points (la barre, un quart de sa largeur), le rayon passe à la pilule,
    et un filet d'un cheveu la pose sur le plan — le contour des cartes de
    l'app, à la place d'une ombre qui portait seule tout le relief.
  */
  /*
    IL PASSE DEVANT LES POIGNÉES DU MUR.

    Relevé du patron : « le menu qui apparaît à côté du mur est pas
    cliquable ou pas facilement ». Rien ne portait de rang dans ce plan :
    c'est l'ORDRE DU RENDU qui tranchait, et le menu est dessiné avant les
    poignées de coin et de rotation. Une poignée qui tombe dessus prend le
    doigt à sa place, sans rien montrer — d'où le « pas facilement » : ça
    marchait, ou pas, selon l'endroit du mur.
  */
  wallActions: {
    position: 'absolute',
    zIndex: 6,
    flexDirection: 'row',
    /* Elle se pose SUR le plan, elle ne doit pas le trouer — relevé du
       patron : « cette barre devrait avoir une opacité sur son fond
       blanc ». Le mur qu'on règle passe dessous et se devine. */
    backgroundColor: c.surfaceVoile,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    paddingHorizontal: 5,
    paddingVertical: 4,
    ...shadowCard,
    shadowOpacity: 0.09,
    /* APRÈS l'ombre : elle porte sa propre élévation, et c'est la dernière
       écrite qui gagne. Android empile sur l'élévation, pas sur le zIndex. */
    elevation: 6,
  },
  /*
    QUATRE COLONNES DE MÊME LARGEUR — la barre ne s'étire pas au gré de la
    longueur des mots — ET DE LA HAUTEUR D'UN DOIGT.

    Elles faisaient trente-quatre points de haut, sans débord : sous la
    barre des quarante-quatre, c'est-à-dire qu'on visait juste ou qu'on
    ratait. Quarante dessinés, huit de débord : quarante-huit sous le
    doigt, et la barre ne grossit que de six points.
  */
  wallAction: {
    /* Resserrée d'un cran — relevé du patron : « réduis légèrement cette
       barre, proportionnellement en taille ». Le dessin descend de 48 × 40
       à 44 × 36 ; le débord rend au doigt les quatre points rendus à la
       carte, et la cible reste à quarante-quatre. */
    width: 44,
    minHeight: 36,
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
