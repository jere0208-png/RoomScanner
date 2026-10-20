import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { texteDeMesure, type Mesure } from '../geometry/regle';
import {
  Animated,
  PanResponder,
  type GestureResponderEvent,
  type GestureResponderHandlers,
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
  wallRunsAuNu,
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
  normaleVersLaPiece,
} from '../geometry/floorplan';
import type { TraceGaine } from '../geometry/routing';
import { dessinDesNatures, renduNature } from '../geometry/natureMurs';
import { carnetDesMenuiseries } from '../geometry/menuiseries';
import type { ObjectData } from 'react-native-room-scan';
import {
  faceX,
  facePoint,
  interiorSide,
  wallFace,
} from '../geometry/electrical';
import { frCategory, furnKind, furnitureStrokes, meridienneDe } from '../geometry/furniture';
import { estUnCaisson } from '../geometry/caisson';
import type { Visee } from '../geometry/traceMurs';
import { CalqueTrace } from './CalqueTrace';
import { estVerrouille } from '../geometry/alignement';

/** L'ordre du dessin des meubles : le tapis au sol, le caisson au plafond. */
const rangDuDessin = (o: { category?: string }) => (o.category === 'tapis' ? 0 : estUnCaisson(o) ? 2 : 1);
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

/**
 * LE QUART DE CERCLE DE CHAQUE BATTANT, du côté où la porte s'ouvre : ses
 * quatre coins, en mètres (les deux bouts de la baie, puis les mêmes
 * avancés du rayon du vantail dans la pièce).
 *
 * UNE SEULE SOURCE pour les deux qui doivent le laisser libre : les cotes
 * (`encombrants`) et les cartouches des pièces (`obstacles`). Le sens
 * d'ouverture est une information de base d'un plan — un nom posé dessus
 * le cachait (capture clair-11 : « Bureau » et « Entrée » sur leurs
 * portes).
 */
export function battantsDuPlan(openings: WallSeg[], partOf: Map<string, RoomPart>): Pt[][] {
  const out: Pt[][] = [];
  for (const o of openings) {
    if (o.type !== 'door' || o.garage || o.placard) continue;
    const l = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
    if (l < 0.05) continue;
    // Vers la pièce de la porte : voir `normaleVersLaPiece`.
    const versPiece = normaleVersLaPiece(o, [...partOf.values()]);
    if (!versPiece) continue;
    let nx = versPiece.x;
    let nz = versPiece.z;
    if (o.versExterieur) {
      nx = -nx;
      nz = -nz;
    }
    const r = o.vantaux === 2 ? l / 2 : l;
    out.push([o.a, o.b, { x: o.a.x + nx * r, z: o.a.z + nz * r }, { x: o.b.x + nx * r, z: o.b.z + nz * r }]);
  }
  return out;
}

/** Au-delà, les tronçons de mur se cotent (px par mètre). */
export const SEUIL_TRONCONS = 80;
/** En deçà, on revient aux cotes globales (px par mètre). */
export const SEUIL_GLOBALES = 70;

/**
 * QUELLE FAMILLE DE COTES S'ÉCRIT : 0, les cotes globales des murs ; 1,
 * celles de leurs tronçons.
 *
 * Entre 55 et 95 px/m, les deux familles s'échangeaient en fondu : les
 * globales s'effaçaient pendant que les tronçons paraissaient. Mais le plan
 * ne se redessine qu'au lâcher, et l'on s'arrête souvent dans cette plage
 * (l'exemple s'ouvre vers 30 px/m : un zoom ×2,5 tombe à 75) — les deux
 * jeux s'affichaient alors à moitié, en gris doux : des chiffres fantômes,
 * illisibles au soleil sur un chantier.
 *
 * C'est donc une BASCULE NETTE, avec une marge (hystérésis) : les tronçons
 * au-dessus de `SEUIL_TRONCONS`, les globales sous `SEUIL_GLOBALES`, et
 * entre les deux, la famille d'avant reste — un zoom qui hésite autour du
 * seuil ne fait pas clignoter les cotes. Les tronçons qui n'ont pas la
 * place à ce seuil sont écartés par l'arbitre (`placerEtiquettes`) : ils
 * ne se chevauchent jamais, la valeur reste au métré.
 */
export function familleDesCotes(echelle: number, precedente: 0 | 1): 0 | 1 {
  if (echelle >= SEUIL_TRONCONS) return 1;
  if (echelle <= SEUIL_GLOBALES) return 0;
  return precedente;
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
import { atterrir, usePlanEnVol, volerLAction } from '../store/planEnVol';
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
import { frM2 } from '../ui/mots';


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
    ? clampFootprint(toFootprint(o), part.walls, part.labelAt, undefined, undefined, faces, part.surface?.pts)
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
 * LE PLAN DROIT ET ENTIER : zoom 1, centré, et tourné juste ce qu'il faut
 * pour que ses murs soient droits à l'écran (`planFrameAngle`). C'est le
 * cadrage d'ouverture de l'écran du plan, et celui que rend « Recadrer ».
 */
export function vueDroiteDuPlan(walls: WallSeg[]): VuePlan {
  const t = planFrameAngle(walls);
  const rot = t <= Math.PI / 4 ? -t : Math.PI / 2 - t;
  return { zoom: 1, ox: 0, oy: 0, rot: Math.abs(rot) < 1e-3 ? 0 : rot };
}

/** Le cadrage `v` est-il déjà le plan droit et entier `droite` ? */
export function estRecadre(v: VuePlan, droite: VuePlan): boolean {
  const d = Math.atan2(Math.sin(v.rot - droite.rot), Math.cos(v.rot - droite.rot));
  return (
    Math.abs(v.zoom - droite.zoom) < 1e-3 &&
    Math.abs(v.ox - droite.ox) < 0.5 &&
    Math.abs(v.oy - droite.oy) < 0.5 &&
    Math.abs(d) < 1e-3
  );
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
  /**
   * « RECADRER » : remonte de quoi remettre le plan droit et entier — une
   * fonction quand le plan a été déplacé, tourné ou zoomé, `null` quand il
   * l'est déjà (et au démontage). Voir `vueDroiteDuPlan`.
   */
  onRecadreur?: (recadrer: (() => void) | null) => void;
  /** Mode édition : sélection des murs + poignées de coin. */
  editable: boolean;
  selectedWallId: string | null;
  onSelectWall: (id: string | null) => void;
  /**
   * Cheminement des gaines, du tableau à chaque appareil. Calque optionnel :
   * sans tableau posé, l'écran n'en fournit pas, et rien ne se dessine.
   * La pose de chaque tracé dit où il retombe le long d'un mur.
   */
  cableRoutes?: TraceGaine[];
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
  /**
   * PLUSIEURS MEUBLES CHOISIS — manque proposé par l'agent testeur MEUBLES.
   * Ils se dessinent comme le meuble tenu ; l'ensemble se glisse d'un doigt
   * (`GroupeDragHandle`), et toucher un meuble l'ajoute ou le retire (c'est
   * l'écran qui en décide, par `onSelectObject`).
   */
  meublesChoisis?: string[];
  /**
   * LES DEUX PASTILLES DE PLUS du meuble tenu — « Plusieurs » (entrer dans
   * la sélection multiple) et le cadenas (verrouiller / libérer). Manques
   * proposés par l'agent testeur MEUBLES ; sans elles, la rangée reste à
   * trois pastilles.
   */
  onSelectionMultiple?: (id: string) => void;
  onVerrouObject?: (id: string, verrou: boolean) => void;
  onDeleteObject?: (id: string) => void;
  /** La croix du mur choisi, à côté de sa poignée de rotation. */
  onDeleteWall?: (id: string) => void;
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
  /**
   * ON TRACE DES MURS, COIN APRÈS COIN — relevé du patron : « ajouter un mur
   * exactement là où on le souhaite ». Le calque `CalqueTrace` capte le
   * doigt ; un doigt pose un coin, deux doigts déplacent et zooment le plan.
   */
  traceMurs?: { coins: Pt[]; aimant: boolean } | null;
  onTraceCoin?: (v: Visee) => void;
  onTraceVisee?: (v: Visee | null) => void;
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
 * LES MARGES DE LA TOILE — ce qu'on peint au-delà de l'écran, tout autour.
 *
 * Relevés du patron, deux diagnostics à l'appui, vidéos image par image :
 *   1. « encore des bugs au zoom, pincer, relâcher » : sur un plan zoomé,
 *      l'écran se figeait au début du geste — la toile s'agrandissait à la
 *      prise du doigt, et tout le plan se repeignait sur sept écrans ;
 *   2. « pire qu'avant, il se déplace tout seul au relâcher » : les marges,
 *      recalculées à chaque lâcher, faisaient changer la taille de la toile
 *      ET son cadrage (`viewBox`) dans le même rendu. Le dessin natif restait
 *      calé sur l'ancien cadrage : le plan partait hors de l'écran au lâcher,
 *      et n'était remis en place qu'au geste suivant.
 *
 * Une seule règle tient les deux : LA TOILE NE CHANGE JAMAIS DE TAILLE. Sa
 * marge est fixe, la même de chaque côté, tirée des seules dimensions de la
 * zone du plan — elle ne bouge qu'avec elles (une rotation de l'écran). Un
 * geste n'a rien à repeindre en commençant, un lâcher ne change que le
 * dessin, et le plan ramené au centre n'est jamais coupé.
 */
export interface MargesDeToile {
  g: number;
  h: number;
  d: number;
  b: number;
}
const SANS_MARGE: MargesDeToile = { g: 0, h: 0, d: 0, b: 0 };
const MargeDeLaToile = React.createContext<MargesDeToile>(SANS_MARGE);

/** La marge fixe de la toile pour une zone de plan : quatre dixièmes de sa plus grande dimension. */
export function margeFixeDeToile(largeur: number, hauteur: number): MargesDeToile {
  if (largeur <= 0 || hauteur <= 0) return SANS_MARGE;
  const m = Math.round(0.4 * Math.max(largeur, hauteur));
  return { g: m, h: m, d: m, b: m };
}

/**
 * LA COUCHE DU GESTE, QUI PORTE LA TOILE.
 *
 * Ses marges viennent du rendu de l'éditeur, avec le cadrage : elles ne
 * changent jamais pendant un geste, et la couche n'est jamais reprise par
 * un commit qui ne la rend pas (voir la revue experte : sous Fabric, un tel
 * commit recopierait la transformation du dernier rendu React).
 */
function CoucheDuPlan({
  style,
  marges,
  gestes,
  children,
}: {
  style: React.ComponentProps<typeof Animated.View>['style'];
  marges: MargesDeToile;
  /** Le glissement de la pièce choisie : voir `piece` dans l'éditeur. */
  gestes?: GestureResponderHandlers;
  children: React.ReactNode;
}) {
  return (
    <MargeDeLaToile.Provider value={marges}>
      <Animated.View
        collapsable={false}
        style={style}
        pointerEvents="box-none"
        {...gestes}>
        {children}
      </Animated.View>
    </MargeDeLaToile.Provider>
  );
}

function ToileDuPlan({
  largeur,
  hauteur,
  children,
}: {
  largeur: number;
  hauteur: number;
  children: React.ReactNode;
}) {
  const { g, h, d, b } = React.useContext(MargeDeLaToile);
  const l = largeur + g + d;
  const t = hauteur + h + b;
  return (
    <Svg
      width={l}
      height={t}
      viewBox={`${-g} ${-h} ${l} ${t}`}
      style={g || h ? { marginLeft: -g, marginTop: -h } : undefined}>
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
  // Le rouge ne regarde que le meuble tenu : les autres ne se rendent pas
  // quand il bascule.
  const refuse = useEnVol((s) => s.objet?.id === objet.id && s.refuse);
  // La pièce qu'on glisse emporte ses meubles (voir `store/planEnVol`).
  const avecLaPiece = usePlanEnVol((s) => s.plan?.meubles.get(objet.id) ?? null);
  return <>{render(enVol ?? avecLaPiece ?? objet, refuse)}</>;
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

/**
 * L'ÉDITEUR, TEL QUE LES ÉCRANS LE MONTENT — une enveloppe qui ne dessine rien.
 *
 * Relevé des testeurs (fluidité du plan 2D) : « une simple sélection coûte de
 * 75 à 170 ms ». L'écran du plan a soixante-dix-huit états et passe au plan
 * une trentaine de rappels écrits en ligne : neufs à chaque rendu de l'écran
 * — un bandeau qui s'ouvre, un enregistrement, une feuille —, ils faisaient
 * redessiner le plan entier à chaque fois, quand rien de ce qu'il montre
 * n'avait changé.
 *
 * L'enveloppe donne au dessin (`EditeurDuPlan`, mémoïsé) des rappels
 * STABLES : un relais par nom, créé une fois, qui appelle la fonction du
 * DERNIER rendu de l'écran. C'est ce qu'un `useCallback` ferait côté écran,
 * pour chacun des trois écrans qui montent le plan, sans en oublier aucun —
 * et sans le piège qui vient d'être corrigé sur le glisser d'une pièce : un
 * rappel figé au premier rendu (`onMoveRoomRef`). Le relais lit toujours le
 * rappel à jour ; seule sa présence compte pour le dessin (un rappel absent
 * reste absent).
 */
export function FloorplanEditor(props: Props) {
  const vif = useRef(props);
  vif.current = props;
  const relais = useRef(new Map<string, (...args: unknown[]) => unknown>()).current;
  const stables: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(props)) {
    if (typeof v !== 'function') {
      stables[cle] = v;
      continue;
    }
    let f = relais.get(cle);
    if (!f) {
      f = (...args: unknown[]) => {
        const actuel = (vif.current as unknown as Record<string, unknown>)[cle];
        return typeof actuel === 'function' ? actuel(...args) : undefined;
      };
      relais.set(cle, f);
    }
    stables[cle] = f;
  }
  return <EditeurDuPlan {...(stables as unknown as Props)} />;
}

/**
 * LE DESSIN NE SE REFAIT QUE SI CE QU'IL MONTRE CHANGE — les rappels sont
 * stables (voir l'enveloppe), et le cadrage de départ n'est lu qu'au
 * montage : l'écran le remet à jour après chaque geste, ce n'est pas une
 * raison de tout redessiner.
 */
function memesProps(avant: Props, apres: Props): boolean {
  const cles = new Set([...Object.keys(avant), ...Object.keys(apres)]);
  for (const cle of cles) {
    if (cle === 'vueInitiale') continue;
    if (!Object.is((avant as unknown as Record<string, unknown>)[cle], (apres as unknown as Record<string, unknown>)[cle])) {
      return false;
    }
  }
  return true;
}

// Le dessin garde le nom de l'éditeur : c'est lui que les bancs comptent dans
// les piles d'appels (voir `meublefluide`, `maj-plan2d`).
// eslint-disable-next-line @typescript-eslint/no-shadow
const EditeurDuPlan = React.memo(function FloorplanEditor({
  showMeasures,
  vueInitiale,
  marges,
  onView,
  onViseur,
  onRecadreur,
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
  meublesChoisis,
  onSelectionMultiple,
  onVerrouObject,
  onDeleteObject,
  onDeleteWall,
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
  traceMurs,
  onTraceCoin,
  onTraceVisee,
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
  const showReperesBaies = useScanStore((s) => s.showReperesBaies);
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
  /** Le coin du cadre du plan dans la fenêtre (px) : voir le pincement. */
  const origineDuCadre = useRef({ x: 0, y: 0 });
  /** Plusieurs choses sous le doigt : la carte qui demande laquelle. */
  const [choixSousLeDoigt, setChoixSousLeDoigt] = useState<{
    x: number;
    y: number;
    cibles: CibleDuPlan[];
  } | null>(null);
  // Le plan bouge : la carte, posée près d'un point, n'a plus de sens. Elle
  // se ferme au lâcher du geste, dans le même rendu (voir `poserLeGeste`).
  /*
    LE PLAN DIT OÙ IL EN EST — et la 3D reprend exactement là.

    Passer en volume donnait un logement orienté autrement : on avait tourné
    le plan pour l'avoir dans le bon sens, et la 3D repartait de son angle à
    elle. Le relevé du chantier est net : « le plan doit se placer exactement
    comme l'autre ». On remonte donc la rotation, le zoom et le déplacement à
    l'écran qui les tient, et c'est lui qui les repasse à la vue d'à côté.
  */
  /** De quoi ouvrir la toile le temps du geste (voir `ToileDuPlan`). */
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
  /*
    LA COUCHE EST NEUVE À CHAQUE LÂCHER — et elle arrive AVEC le dessin.

    Relevés du patron : « au relâcher, on voit son ancienne position
    rapidement avant celle qu'on lâche », puis, vidéo à l'appui, « le plan
    au pincer-relâcher ne se pose pas toujours d'une traite : des
    millisecondes où il se décale pour revenir à sa position ». Mesuré image
    par image : six images (100 ms) du plan à sa position d'AVANT le geste,
    couche déjà à plat, avant que le nouveau dessin n'apparaisse.

    La cause principale était ailleurs — la couche calculée depuis le repère
    repris au changement du nombre de doigts (voir le pincement). Mais la
    remise à plat par `setValue`, même dans un effet de mise en page, passe
    par un autre chemin que le rendu (`setNativeProps`, revue experte sous
    Fabric) : elle ne tombe dans la même image que le nouveau dessin que
    parce que l'ordonnanceur les groupe aujourd'hui. On ne s'y fie plus.

    Au lâcher, l'éditeur prend une couche NEUVE, à plat dès sa naissance, et
    la pose dans le MÊME rendu que le nouveau cadrage : l'ancien dessin reste
    à l'écran, à sa place sous l'ancienne couche, jusqu'à ce que le nouveau
    le remplace — d'un coup, par construction.
  */
  /*
    ET CHAQUE COUCHE NEUVE PORTE SA MARQUE — un millième de point, en
    alternance. Diagnostic du patron sur la version 735, vidéo image par
    image : au lâcher d'un glissé rapide, le plan partait plus loin, de toute
    la longueur du geste, et n'en revenait qu'au premier mouvement du geste
    suivant. Le dessin était juste ; c'est la COUCHE qui gardait la pose du
    geste. Ses valeurs partent à l'écran sans passer par React : pour lui,
    elle était à plat avant le lâcher et l'est encore après — rien à
    envoyer, et l'écran gardait le déplacement en double.

    La marque fait différer la transformation que React rend d'un lâcher à
    l'autre : React l'envoie donc tout entière, à plat, DANS la mise à jour
    qui monte le nouveau dessin. Un millième de point ne se voit pas.
  */
  const nouvelleCouche = (marque = 0) => ({
    tx: new Animated.Value(0),
    ty: new Animated.Value(0),
    ech: new Animated.Value(1),
    rot: new Animated.Value(0),
    marque,
  });
  const [glisse, setGlisse] = useState(nouvelleCouche);
  /** La couche que le geste pousse : celle du dernier rendu, relue à chaque image. */
  const glisseRef = useRef(glisse);
  /*
    LA MARQUE SE CHOISIT CONTRE LA COUCHE MONTÉE, PAS CONTRE LA DERNIÈRE NÉE.

    Relevé au banc de l'écran fidèle (`ecranfidele.test.tsx`), qui rejoue
    ce que l'écran natif affiche : deux lâchers dans la MÊME tâche — un
    téléphone occupé à monter le dessin reçoit d'un seul paquet le lâcher
    d'un coup de doigt et tout le coup suivant. La marque alternait d'une
    couche NÉE à l'autre : la seconde couche du paquet reprenait la marque
    de celle que React avait montée en dernier, il rendait « à plat » après
    « à plat », n'envoyait rien — et le diagnostic 735 revenait tel quel :
    le plan restait décalé de tout le premier geste (deux cent vingt-cinq
    points au banc) jusqu'au premier mouvement du geste suivant.

    La marque neuve diffère donc de celle du dernier COMMIT, relevée après
    lui : React l'envoie toujours, quel que soit le nombre de lâchers
    qu'un même rendu rattrape.
  */
  const marqueMontee = useRef(glisse.marque);
  useLayoutEffect(() => {
    marqueMontee.current = glisse.marque;
  }, [glisse]);
  /** Le dernier cadrage calculé par le geste, posé pour de bon au lâcher. */
  const vueVive = useRef(view);
  /**
   * LE LÂCHER : le cadrage du geste, et sa couche neuve, dans le même rendu.
   * La toile se referme dans ce même rendu (son état est groupé avec eux).
   */
  const poserLeGeste = () => {
    const vueAvant = viewRef.current;
    const couche = nouvelleCouche(marqueMontee.current ? 0 : 0.001);
    glisseRef.current = couche;
    setGlisse(couche);
    /*
      LA VUE QUI VA AVEC LA COUCHE NEUVE, DÈS LE LÂCHER — pas au rendu.

      Relevé au banc du pincer-relâcher (`pincerrelacher.test.tsx`) : deux
      gestes enchaînés, le second commencé AVANT que le rendu du premier
      lâcher n'ait eu lieu — un téléphone occupé à monter le nouveau dessin
      reçoit ses évènements tactiles par paquets. La prise du second geste
      repartait de `viewRef.current`, encore à la vue d'AVANT le premier :
      tout le premier geste était perdu, et le plan sautait au second lâcher
      de toute sa longueur (cinquante points au banc) — l'apparition « à sa
      position d'avant le geste » de la vidéo du patron, par un autre chemin.

      La couche neuve sera montée AVEC `vueVive` : c'est donc elle, dès
      maintenant, la vue dessinée sous la couche que le geste pousse. Le
      rendu qui suit réécrit la même valeur.
    */
    viewRef.current = vueVive.current;
    /*
      LA CARTE « QU'Y A-T-IL SOUS LE DOIGT ? » SE FERME DANS LE MÊME RENDU.

      Elle se fermait par un effet sur la vue : un `setState` APRÈS le
      commit du lâcher, donc un second rendu de tout l'éditeur dans la
      foulée — compté au banc, deux commits au lieu d'un, pendant que le
      pilote natif monte le nouveau dessin. Fermée ici, elle part avec lui.
    */
    if (vueVive.current !== vueAvant) setChoixSousLeDoigt(null);
    setView(vueVive.current);
  };
  /*
    UNE POSE PART À L'ÉCRAN EN UNE FOIS — quatre valeurs, UN envoi.

    Relevé au banc de l'écran fidèle (`ecranfidele.test.tsx`) : chaque
    `setValue` d'une valeur pilotée en JS part à l'écran par SON
    `setNativeProps`, et chacun est une révision à lui de l'arbre natif
    (`UIManager::setNativeProps_DEPRECATED` : un commit par appel). Quatre
    `setValue` à la file, c'étaient quatre révisions : l'échelle neuve sous
    l'ancienne translation, puis X neuf avec Y ancien. Le fil principal
    monte la dernière révision quand il est prêt, pas quand le geste a fini
    d'écrire : une image pouvait montrer une pose qui n'a jamais existé —
    au banc, jusqu'à soixante-dix points d'écart sur un glissé rapide en
    diagonale, un demi-point sur un pincement lent. Un tremblement d'une
    image, au hasard des vsyncs.

    Les trois premières valeurs se posent donc SANS RIEN ENVOYER : un
    `setOffset` ne pousse rien (`AnimatedValue.js` : seul `setValue` fait
    partir la valeur), et chaque couche naît à sa valeur de repos, sans
    décalage — le décalage EST la pose. La dernière part par `setValue` :
    un seul `setNativeProps`, qui relit les quatre — la pose entière, en
    une révision.
  */
  const poserLaCouche = (pose: { tx: number; ty: number; ech: number; rot: number }) => {
    const c = glisseRef.current;
    c.ech.setOffset(pose.ech - 1);
    c.rot.setOffset(pose.rot);
    c.tx.setOffset(pose.tx);
    c.ty.setValue(pose.ty);
  };
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
    LES DOIGTS, TOUJOURS DANS LE MÊME ORDRE. Sous Fabric, la liste `touches`
    d'un évènement sort d'un ensemble non ordonné : rien ne garantit que le
    premier doigt d'une image soit le premier de la suivante. Deux doigts
    qui s'échangent ne changent ni leur écart ni leur milieu — mais leur
    ANGLE tourne d'un demi-tour, et le plan avec lui. Rangés par
    identifiant, ils ne s'échangent jamais.
  */
  const doigtsDe = (e: GestureResponderEvent) =>
    [...e.nativeEvent.touches].sort((a, b) => Number(a.identifier) - Number(b.identifier));
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
  const snapshot = (e: GestureResponderEvent, g: { dx: number; dy: number }) => {
    const t = doigtsDe(e);
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
    /*
      Le recalage aussi repart d'ici : sa course se compte en petits pas
      depuis le dernier évènement traité, et un pincement — qui ne les
      compte pas — ne doit pas se retrouver d'un coup dans le premier pas
      du glissement qui le suit.
    */
    dernierPas.current = { x: g.dx, y: g.dy };
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
  /*
    LE DOIGT SE SITUE PAR LA PAGE ET LA PLACE DU CADRE, PAS PAR
    `locationX` — comme `dernierToucher`. `locationX` se lit par rapport à
    la vue TOUCHÉE : ici le SVG du dessin, dont la toile déborde du cadre
    de sa marge fixe (voir `margeFixeDeToile`). Le cadrage (`mapping`), lui,
    est en pixels du cadre : lu tel quel, le doigt tombait à côté — de la
    pièce choisie, du meuble tenu, et des points de la règle, des spots et
    des notes, posés à toute la marge du doigt.
    `origineDuCadre` est mesuré à la pose du doigt (`onTouchStart`).

    UNE SEULE FONCTION pour tous les calques qui situent un appui : un
    calque oublié retombait dans l'ancien décalage.
  */
  const pointDuCadre = (e: GestureResponderEvent) => {
    const org = origineDuCadre.current;
    return { x: e.nativeEvent.pageX - org.x, y: e.nativeEvent.pageY - org.y };
  };
  const pieceSousLeDoigt = (e: GestureResponderEvent) => {
    const poly = contourChoisi.current;
    if (!poly || poly.length < 3) return false;
    const { x, y } = pointDuCadre(e);
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

  /*
    LE DÉPLACEMENT DE LA PIÈCE PASSE PAR UNE RÉFÉRENCE, comme `tracantRef`.

    Relevé des testeurs : « glisser une pièce dans le plan 2D ne la déplace
    pas ». Le `PanResponder` ci-dessous est créé UNE FOIS : il appelait le
    `onMoveRoom` du tout premier rendu — celui de l'écran du plan, quand
    aucune pièce n'était encore choisie, et qui ne déplaçait donc rien. On
    lit la fonction À JOUR au moment du geste.
  */
  const onMoveRoomRef = useRef(onMoveRoom);
  onMoveRoomRef.current = onMoveRoom;
  /** La pièce choisie, relue au geste — même raison que `onMoveRoomRef`. */
  const pieceChoisieRef = useRef(selectedRoomId ?? null);
  pieceChoisieRef.current = selectedRoomId ?? null;
  /** La course de la pièce depuis la prise du doigt, en mètres. */
  const pieceCourse = useRef({ x: 0, z: 0 });

  /*
    LA PIÈCE GLISSE EN VOL — le magasin ne l'apprend qu'au lâcher.

    Relevé des testeurs : « chaque image d'une pièce tirée redessine deux
    fois tout l'écran et tout l'éditeur » — cent soixante-dix millisecondes
    par image sur l'exemple, plus d'une demi-seconde sur trente pièces.
    Chaque pas écrivait le magasin (`onMoveRoom` sans aimant), et tout ce qui
    le lit se rendait.

    Pendant le geste, la pièce vit dans `store/planEnVol` : ses murs, ses
    menuiseries, ses meubles et son sol se dessinent à leur place en vol, par
    la même action exécutée à blanc (`moveRoom`, sans aimant), et le reste du
    plan ne se rend plus. Au lâcher, `onMoveRoom` reçoit la course ENTIÈRE,
    avec l'aimant et la soudure : une écriture, un seul « Annuler ».

    La course se lit depuis la prise, pas à pas : le cadrage ne change pas
    pendant le geste (le plan ne se rend plus), et une course totale ne
    cumule aucun arrondi.
  */
  const pieceEnCours = useRef(false);
  const poserLaPiece = () => {
    const d = pieceCourse.current;
    pieceCourse.current = { x: 0, z: 0 };
    pieceEnCours.current = false;
    // Au lâcher : l'aimant et la soudure des murs qui se recouvrent.
    atterrir(() => onMoveRoomRef.current?.(d.x, d.z, true));
  };
  // Un plan qui s'en va en plein geste pose la pièce, et ne laisse rien en vol.
  useEffect(
    () => () => {
      if (pieceEnCours.current) poserLaPiece();
      atterrir();
    },
    // Au démontage seulement : `poserLaPiece` ne lit que des références.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  /** Le glissement de la pièce : en mètres, dans le repère du monde. */
  const piece = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, g) =>
        !!onMoveRoomRef.current &&
        estUnGlissement(g.dx, g.dy) &&
        pieceSousLeDoigt(e),
      onPanResponderGrant: () => {
        pieceCourse.current = { x: 0, z: 0 };
        pieceEnCours.current = true;
      },
      onPanResponderMove: (_e, g) => {
        const m = mappingRef.current;
        const id = pieceChoisieRef.current;
        if (!m || !id) return;
        // Écran → monde : la conversion est déjà écrite, rotation et zoom
        // compris. La réécrire ici, c'est se tromper d'un signe un jour.
        const d = m.deltaToMeters(g.dx, g.dy);
        pieceCourse.current = { x: d.x, z: d.z };
        // Pendant le geste, sans aimant : il ramenait la pièce à chaque pas.
        volerLAction((st) => st.moveRoom(id, d.x, d.z, false), { id, dx: d.x, dz: d.z });
      },
      onPanResponderRelease: () => poserLaPiece(),
      onPanResponderTerminate: () => poserLaPiece(),
    }),
  ).current;
  /*
    LE MODE TRACE PASSE PAR UNE REFERENCE, comme tout ce que le geste lit.

    Le `PanResponder` du plan est cree UNE FOIS (`useRef`) : une valeur lue
    dans sa fermeture y reste figee a ce qu'elle valait au premier rendu.
    `tracantPiece` y serait donc eternellement `false`, et le plan
    continuerait de voler le geste — le defaut aurait ete invisible a la
    lecture et evident au doigt.
  */
  const tracantRef = useRef(tracantPiece);
  tracantRef.current = tracantPiece || !!traceMurs;
  // Un doigt trace ; deux doigts déplacent et zooment, même pendant le tracé.
  const traceRef = useRef(!!traceMurs);
  traceRef.current = !!traceMurs;

  const nav = useRef(
    PanResponder.create({
      // Ne prend la main QUE sur un mouvement : les taps (sélection de mur)
      // et les poignées de coin gardent la priorité.
      onStartShouldSetPanResponder: () => false,
      // Pendant le tracé des murs, le plan reprend la main à DEUX doigts :
      // on zoome pour viser un coin, sans quitter le tracé.
      onMoveShouldSetPanResponderCapture: (e) => traceRef.current && doigtsDe(e).length >= 2,
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
          // L'emprise est en pixels du cadre : le doigt aussi.
          const { x, y } = pointDuCadre(e);
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
        // Rien à peindre à la prise : la toile a sa taille fixe (voir
        // `margeFixeDeToile`).
        vueVive.current = viewRef.current;
        // Le recalage repart de zero a chaque prise (dans `snapshot`) : le
        // decalage se compte en petits pas, et un geste qui commence
        // n'herite pas du precedent.
        snapshot(e, g);
      },
      /*
        UN DOIGT QUI SE POSE OU SE LÈVE : LE REPÈRE SE REPREND TOUT DE SUITE.

        Il ne se reprenait qu'au mouvement SUIVANT, quand on s'apercevait
        que le nombre de doigts avait changé : la course de ce mouvement-là
        était perdue, et de trois doigts à deux, la paire suivie pouvait
        changer sans reprise du tout. Repris à l'évènement même, le premier
        mouvement compte en entier. Le contrôle au mouvement reste, en
        filet : un doigt dont on n'aurait pas reçu la levée.
      */
      onPanResponderStart: (e, g) => snapshot(e, g),
      onPanResponderEnd: (e, g) => {
        if (e.nativeEvent.touches.length > 0) snapshot(e, g);
      },
      /*
        AU LÂCHER, LA VÉRITÉ — et la couche revient à zéro dans le MÊME
        rendu. Les deux se posent ensemble : si la couche se remettait à
        plat avant que le dessin ne soit recalculé, le plan sauterait à sa
        position d'avant le temps d'une image.
      */
      onPanResponderRelease: () => poserLeGeste(),
      onPanResponderTerminate: () => poserLeGeste(),
      onPanResponderMove: (e, g) => {
        const t = doigtsDe(e);
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
          /*
            LE PINCEMENT SE FAIT AUTOUR DES DOIGTS, PAS DU CENTRE DE L'ÉCRAN.

            Relevé au banc du pincer-relâcher (`pincerrelacher.test.tsx`) :
            le point du plan pris entre les deux doigts doit RESTER entre
            les deux doigts — c'est tout ce que la main attend d'un
            pincement. Le cadrage, lui, agrandit et tourne autour du centre
            de la vue décalé (`C + o`) ; on n'y ajoutait que la course du
            milieu des doigts. Le point sous les doigts fuyait donc de
            `(échelle − 1) × sa distance à ce centre` : trois à cinq points
            au banc pour un petit geste, cent cinquante pour un zoom ×2
            commencé au bord — le plan glissait sous la main, et l'œil le
            voyait « se décaler ».

            Le décalage se recompose pour que le milieu des doigts de la
            reprise (`M0`) aille au milieu des doigts d'aujourd'hui (`M`) :
            o = (M − C) + k·R(torsion)·(C + o0 − M0), en coordonnées DU
            CADRE — les doigts arrivent en coordonnées de page, d'où
            `origineDuCadre` (mesuré à la pose du doigt). `k` est le rapport
            de zoom EFFECTIF, butées comprises : en butée, le plan cesse de
            grandir mais le point sous les doigts reste sous les doigts.
          */
          const k = zoom / base.v.zoom;
          const org = origineDuCadre.current;
          const cx = layoutRef.current.w / 2;
          const cy = layoutRef.current.h / 2;
          const ux = cx + base.v.ox - (base.mx0 - org.x);
          const uy = cy + base.v.oy - (base.my0 - org.y);
          const ct = Math.cos(twist);
          const st = Math.sin(twist);
          vueVive.current = {
            zoom,
            ox: mx - org.x - cx + k * (ux * ct - uy * st),
            oy: my - org.y - cy + k * (ux * st + uy * ct),
            rot: base.v.rot + twist,
          };
          /*
            LA COUCHE SE CALCULE DEPUIS LE DESSIN, PAS DEPUIS LA REPRISE.

            Le repère du geste se reprend à chaque changement du nombre de
            doigts (`snapshot`) ; le DESSIN, lui, est resté à la vue de la
            prise. Calculée depuis la reprise, la couche perdait tout ce
            qu'on avait déjà pincé : le plan sautait au moment où un second
            doigt se posait ou se levait, et revenait au lâcher — la vidéo
            du patron, images 311 à 318.
          */
          poserLaCouche(transformeDuGeste(viewRef.current, vueVive.current));
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
          // Depuis le dessin, comme le pincement : voir plus haut.
          poserLaCouche(transformeDuGeste(viewRef.current, vueVive.current));
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
  /*
    RECADRER — UN APPUI, ET LE PLAN REVIENT DROIT ET ENTIER.

    Le pincement fait aussi tourner librement le plan, et un quart de degré
    s'introduit vite en zoomant : cotes et cartouches s'écrivent alors de
    travers. Rien ne ramenait le plan droit et entier à l'écran, il fallait
    le redresser à deux doigts sans repère. L'écran porte donc une pastille
    « Recadrer » tant que le cadrage n'est pas celui d'ouverture.

    LE RECADRAGE PREND LE CHEMIN DU LÂCHER (`poserLeGeste`) : la vue visée
    devient `vueVive`, et le lâcher pose couche neuve et cadrage dans le
    même rendu, exactement comme au bout d'un pincement. Le pincer-relâcher
    lui-même n'en est pas touché.
  */
  const vueDroite = useMemo(() => vueDroiteDuPlan(walls), [walls]);
  const recadre = estRecadre(view, vueDroite);
  const recadrerMaintenant = useRef(() => {});
  recadrerMaintenant.current = () => {
    vueVive.current = vueDroite;
    poserLeGeste();
  };
  const recadrer = useCallback(() => recadrerMaintenant.current(), []);
  useEffect(() => {
    if (!onRecadreur) return;
    onRecadreur(recadre ? null : recadrer);
    return () => onRecadreur(null);
  }, [onRecadreur, recadre, recadrer]);
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
  // La toile ne change jamais de taille : voir `margeFixeDeToile`.
  const margesToile = useMemo(() => margeFixeDeToile(layout.w, layout.h), [layout.w, layout.h]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  /** Le geste lit le cadrage courant sans se reconstruire à chaque image. */
  const mappingRef = useRef(mapping);
  mappingRef.current = mapping;


  /**
   * Niveau de détail des cotes, 0 ou 1, piloté par le zoom.
   *
   * Coter chaque retour de mur en même temps que la longueur totale
   * surchargerait le plan. On les échange donc : la cote globale de chaque
   * mur de loin, ses tronçons de près — UNE SEULE FAMILLE À LA FOIS, à
   * 100 % d'opacité. Voir `familleDesCotes`.
   */
  const detailPrecedent = useRef<0 | 1>(0);
  const detail = mapping ? familleDesCotes(mapping.scale, detailPrecedent.current) : detailPrecedent.current;
  detailPrecedent.current = detail;

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
  const runQuad = useCallback((w: WallSeg, run: WallRun): Pt[] => {
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
  }, [quads]);

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
    LE POCHÉ NE SE DIFFÈRE PLUS — relevé des testeurs : « le poché est
    calculé sur `useDeferredValue` dans le même composant monolithique : la
    passe différée re-rend donc tout l'éditeur une seconde fois pour
    économiser `pocheDesMurs`, soit environ 5 % du temps ». Deux rendus
    complets par image pour gagner un vingtième de l'un d'eux.

    Et il n'a plus à se presser : pendant un geste, le magasin n'est plus
    écrit (voir `store/planEnVol`) — le poché ne se refait qu'au lâcher, une
    fois, avec le reste du plan.
  */
  const poche = useMemo(
    () => pocheDesMurs(mursPoses, openings, rooms),
    [mursPoses, openings, rooms],
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
  /*
    LES REPÈRES DES MENUISERIES, À L'ÉCRAN — le calque « Repères des
    menuiseries » du menu « Autres » : les mêmes P1, F1, B1 que le carnet et
    le plan du PDF, posés côté pièce au milieu de chaque baie.
  */
  const reperesBaies = useMemo(() => {
    if (!showReperesBaies || walls.length === 0) return [];
    const noms = Object.fromEntries(rooms.map((r) => [r.id, r.name ?? '']));
    const b = bounds(walls);
    const centre = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    return carnetDesMenuiseries(walls, openings, rooms, noms).flatMap((l) => {
      const o = openings.find((x) => x.id === l.id);
      if (!o) return [];
      const L = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
      if (L < 1e-3) return [];
      let n = { x: -(o.b.z - o.a.z) / L, z: (o.b.x - o.a.x) / L };
      const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      // Vers le centre du logement : côté pièce.
      if ((centre.x - m.x) * n.x + (centre.z - m.z) * n.z < 0) n = { x: -n.x, z: -n.z };
      return [{ id: l.id, texte: l.repere, m, n }];
    });
  }, [showReperesBaies, walls, openings, rooms]);
  const corpsDeNature = useMemo(
    () => dessinDesNatures(mursPoses, wallQuadsOf(mursPoses), jonctionsDetaillees(mursPoses)),
    [mursPoses],
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
  // Stable : les calques du plafond et de l'appareillage sont mémoïsés.
  const encre = useMemo(() => (planElec ? encreElectrique(c) : undefined), [planElec, c]);
  /*
    LE SOL CHOISI DANS « DÉCORER » SE VOIT — correctif de l'audit : le décor
    était invisible sur le plan 2D. Pas sur le plan de l'électricien, qui
    met l'architecture en retrait pour lire ses circuits.
  */
  const fillOf = useMemo(
    () => (roomId: string) => {
      const fond = planElec ? c.surface : c.surfaceSunken;
      if (planElec) return fond;
      const piece = roomById.get(roomId) as { sol?: string; solTeinte?: string } | undefined;
      return solSurLePlan(piece?.sol, fond, 0.5, piece?.solTeinte) ?? fond;
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
  const decorDesMurs = useCallback((part: RoomPart, poly: string, echelle: number) => {
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
  }, [roomById, mapping]);
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
  /*
    LES NOTES ET LES COTES À LA RÈGLE PRENNENT LEUR PLACE — demande « plan
    intelligent ». Le nom d'une pièce et les cotes des murs les ignoraient :
    une note posée au milieu d'une chambre disparaissait sous le cartouche,
    une cote à la règle sous « 3,53 m ». Leurs pastilles (mêmes mesures que
    leur dessin, `NotesLayer` et la règle plus bas) se réservent, à l'écran.
  */
  const pastillesPosees = useMemo(() => {
    const out: Boite[] = [];
    if (!mapping) return out;
    for (const n of notes ?? []) {
      if ((n.niveau ?? 0) !== niveauCourant) continue;
      const p = mapping.toPx(n.at);
      const court = n.text.length > 22 ? n.text.slice(0, 21) + '…' : n.text;
      const larg = Math.max(34, court.length * 11 * 0.56 + 22);
      out.push({ x: p.x, y: p.y - 11, w: larg + 6, h: 19 });
    }
    for (const m of mesures ?? []) {
      const p1 = mapping.toPx(m.a);
      const p2 = mapping.toPx(m.b);
      const w = texteDeMesure(m).length * 6.8 + 12;
      out.push({ x: (p1.x + p2.x) / 2 - w / 2, y: (p1.y + p2.y) / 2 - 10, w, h: 20 });
    }
    return out;
  }, [notes, mesures, niveauCourant, mapping]);

  const cartouches = useMemo(() => {
    const out = new Map<
      string,
      {
        pos: Pt;
        textes: { t: string; role: 'nom' | 'aire' | 'hors' | 'invite' | 'ligne' }[];
        wpx: number;
        hpx: number;
        gene: boolean;
        /** Posé HORS de sa pièce : le point de la pièce où mène son trait de rappel. */
        rappel?: Pt;
        /** Resserré pour tenir dans sa pièce (1 = taille normale) : voir `RESSERRES`. */
        echelle: number;
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
      /*
        LES SYMBOLES ÉLECTRIQUES AUSSI — en mode Électricité, une prise ou un
        interrupteur sous un nom de pièce ne se lit plus. Le symbole se pose
        à l'écran (sa sortie du mur dépend de l'échelle) : on le ramène en
        mètres, avec son rayon dessiné et trois points d'air.
      */
      ...(showFixtures
        ? unitesDesAppareils(fixtures ?? [], walls, quads).map((u) => {
            const q = mapping.toMeters(poseDeLUnite(u, mapping, walls, dehorsDesMurs, elecLod).p);
            const r = (rayonDAppareil(mapping.scale) + 3) / mapping.scale;
            return { x: q.x, z: q.z, rx: r, rz: r };
          })
        : []),
      // Les notes et les cotes à la règle : un disque qui couvre leur pastille.
      ...pastillesPosees.map((b) => {
        const q = mapping.toMeters({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
        const r = (Math.hypot(b.w, b.h) / 2 + 3) / mapping.scale;
        return { x: q.x, z: q.z, rx: r, rz: r };
      }),
    ];
    /*
      LES BATTANTS PASSENT AVANT TOUT — avis de l'architecte : « battant et
      baie, puis cotes, puis nom, puis surface ». On voit dans quel sens
      ouvrent les portes de l'entrée, du bureau, de la salle d'eau. Même le
      repli « par-dessus un meuble » ne se pose pas sur une porte : dans un
      WC ou un placard trop petits, le cartouche abrégé sort avec son trait
      de rappel plutôt que de masquer la porte. (La baie elle-même est déjà
      gardée : le cartouche reste à une demi-épaisseur des murs.)
    */
    const portes = battantsDuPlan(openings, partOf).map((coins) => {
      const xs = coins.map((q) => q.x);
      const zs = coins.map((q) => q.z);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
    });
    obstacles.push(...portes);
    /* Les noms suivent le dézoom : voir `echelleDesNoms`. */
    const k = echelleDesNoms(view.zoom);
    const PAD = 4 * k;
    const LH = 12.5 * k;
    const TAILLES: Record<string, number> = {
      nom: 10.5 * k,
      aire: 9.5 * k,
      hors: 8.5 * k,
      invite: 10.5 * k,
      ligne: 10 * k,
    };
    const emprise = (ls: { t: string; role: string }[], f = 1) => ({
      w: Math.max(
        44 * k * f,
        Math.max(...ls.map((l) => l.t.length * (TAILLES[l.role] * f * 0.62))) + 14 * k * f,
      ),
      h: (PAD * 2 + ls.length * LH) * f,
    });
    /*
      UN NOM SE RESSERRE AVANT DE PERDRE SES MOTS — demande du patron : « un
      plan intelligent, qui s'adapte à toute situation ». Sur un téléphone,
      trente pièces de 4 × 3,20 m se dessinent à seize pixels le mètre : le
      cartouche « Pièce 12 / 12,80 m² » faisait 66 pixels dans une pièce de
      64, il sortait par le mur, posé de force au milieu. Il essaie d'abord
      un corps un peu plus petit (85 %, puis 72 %), jamais sous six points
      pour le nom — avant d'abréger, de sortir ou de déborder.
    */
    const RESSERRES = [1, 0.85, 0.72].filter((f) => f === 1 || k * f >= 0.6);
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
      // Au centième, comme la fiche, le métré et l'image partagée (revue « immobilier »).
      const areaText = part.surface
        ? `${part.surface.exact ? '' : '≈ '}${frM2(part.surface.area)} m²`
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
      const textes: { t: string; role: 'nom' | 'aire' | 'hors' | 'invite' | 'ligne' }[] =
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
      /*
        UNE PIÈCE ÉTROITE PREND SON NOM SUR UNE LIGNE — « Couloir · 15,40 m² ».
        Un couloir de quatorze mètres sur un mètre dix n'a jamais la hauteur
        de deux lignes : il sortait avec un trait de rappel alors que toute
        sa longueur était libre. Essayé après le cartouche à deux lignes,
        avant l'abréviation ; le repli hors de la pièce reste le cartouche
        abrégé.
      */
      // Le repli hors de la pièce garde le cartouche compact à deux lignes.
      const dernier = variantes[variantes.length - 1];
      if (roomName !== '' && avecAire && areaText) {
        const enLigne: (typeof textes)[] = [[{ t: `${roomName} · ${areaText}`, role: 'ligne' }]];
        if (nomCourt !== roomName) enLigne.push([{ t: `${nomCourt} · ${areaText}`, role: 'ligne' }]);
        // Juste après le cartouche à deux lignes en toutes lettres.
        variantes.splice(textes.length > 2 ? 2 : 1, 0, ...enLigne);
      }
      let retenues = dernier;
      let boite = emprise(dernier);
      let echelle = 1;
      let pos = part.labelAt;
      let gene = true;
      let rappel: Pt | undefined;
      const contour = part.surface?.pts;
      /*
        L'EMPRISE DE LA PIÈCE, une fois : un cartouche plus large ou plus haut
        qu'elle n'y tiendra nulle part, inutile d'essayer ses cent vingt-neuf
        places (c'était la moitié du temps d'un lâcher sur trente pièces).
      */
      const bornes =
        contour && contour.length >= 3
          ? {
              w: Math.max(...contour.map((q) => q.x)) - Math.min(...contour.map((q) => q.x)),
              h: Math.max(...contour.map((q) => q.z)) - Math.min(...contour.map((q) => q.z)),
            }
          : null;
      const chercher = (essai: typeof textes, garde: (cand: Pt, lw: number, lh: number) => boolean, f = 1) => {
        const box = emprise(essai, f);
        const lw = box.w / mapping.scale;
        const lh = box.h / mapping.scale;
        if (bornes && (lw >= bornes.w || lh >= bornes.h)) return null;
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
      /*
        Dans l'ordre : chaque variante en taille normale puis à 85 % (garder
        ses mots vaut mieux que garder son corps), puis toutes à 72 %.
      */
      /*
        Le nom en toutes lettres passe avant le nom abrégé, à toutes les
        tailles : « Salle d'eau / 6,83 m² » resserré vaut mieux que « SdE ».
      */
      const abrege = (essai: typeof textes) =>
        nomCourt !== roomName && essai.some((l) => l.t === nomCourt || l.t.startsWith(`${nomCourt} · `));
      const essais: [typeof textes, number][] = [];
      for (const court of [false, true]) {
        const lot = variantes.filter((v) => abrege(v) === court);
        for (const essai of lot) for (const f of RESSERRES.filter((x) => x > 0.8)) essais.push([essai, f]);
        for (const essai of lot) for (const f of RESSERRES.filter((x) => x <= 0.8)) essais.push([essai, f]);
      }
      for (const [essai, f] of essais) {
        const trouve = chercher(essai, (cand, lw, lh) => !cartoucheHeurte(cand, lw / 2, lh / 2, obstacles), f);
        if (!trouve) continue;
        pos = trouve.cand;
        retenues = essai;
        boite = trouve.box;
        echelle = f;
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
        for (const [essai, f] of essais) {
          if (avecAire && !essai.some((l) => l.role === 'aire' || l.role === 'ligne')) continue;
          const trouve = chercher(essai, (cand, lw, lh) => !cartoucheHeurte(cand, lw / 2, lh / 2, portes), f);
          if (!trouve) continue;
          pos = trouve.cand;
          retenues = essai;
          boite = trouve.box;
          echelle = f;
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
        const compact = dernier;
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
        retenues = dernier;
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
        echelle,
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
    openings,
    ceiling,
    showCeiling,
    showFixtures,
    fixtures,
    walls,
    quads,
    dehorsDesMurs,
    elecLod,
    showSurfaces,
    showMeasures,
    editable,
    mapping,
    layout,
      pastillesPosees,
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
  /*
    LES TRONÇONS SE COMPTENT DE NU À NU — enquête des chiffres : le premier
    et le dernier plein partaient de l'axe du mur d'angle (« 1,50 » à
    l'écran, « 1,43 » au PDF et au mètre). Mêmes bornes que la cote du mur.
  */
  const runsAuNu = useMemo(
    () => new Map(walls.map((w) => [w.id, wallRunsAuNu(walls, w, openings, parts)])),
    [walls, openings, parts],
  );
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
        (runsAuNu.get(w.id) ?? []).forEach((run, ri) => {
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
  }, [walls, mapping, layout, showMeasures, detail, dehorsDesMurs, facesPlan, parts, runsAuNu]);

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
    }
    // Et le quart de cercle de chaque battant, du côté où il s'ouvre.
    for (const coins of battantsDuPlan(openings, partOf)) {
      encombrants.push(boiteDePoints(coins.map((p) => mapping.toPx(p))));
    }
    encombrants.push(...pastillesPosees);
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
    pastillesPosees,
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
  // Des listes stables : la mémoire des naissances ne se recompare qu'à un changement.
  const idsDesPieces = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const idsDesMeubles = useMemo(() => objects.map((o) => o.id), [objects]);
  const idsDesBaies = useMemo(() => openings.map((o) => o.id), [openings]);
  const piecesNees = useNaissances(idsDesPieces);
  const meublesNes = useNaissances(idsDesMeubles);
  const menuiseriesNees = useNaissances(idsDesBaies);

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
  /*
    LE VIDE D'UNE BAIE APPARTIENT À LA BAIE — relevé du patron : « lors du clic
    sur un ouvrant de porte sur le plan 2D (partie sans mur entre deux murs),
    ça sélectionne le mur et pas la porte ». La tolérance du mur déborde sur
    le vide de la baie, et le mur se peint par-dessus elle : avant de choisir
    le mur, on regarde si le doigt est tombé dans une baie.
  */
  const baieSousLeDoigt = (): string | null => {
    const p = dernierToucher.current;
    if (!p || !mapping || !editable || !onSelectOpening) return null;
    for (const o of openings) {
      const a = mapping.toPx(o.a);
      const b = mapping.toPx(o.b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1) continue;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
      if (t < 0.02 || t > 0.98) continue;
      if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) <= 13) return o.id;
    }
    return null;
  };
  const appuiSurLeMur = (id: string) => {
    const baie = baieSousLeDoigt();
    if (baie) {
      onSelectOpening?.(baie === selectedOpeningId ? null : baie);
      return;
    }
    onSelectWall(id === selectedWallId ? null : id);
  };
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
  const dessinerMeuble = useCallback((o: ObjectData, poseRefusee = false) => {
    if (!mapping) return null;
    const f = footprintOf(o, partOf, facesPlan);
    const ctr = mapping.toPx({ x: f.cx, z: f.cz });
    const w = f.width * mapping.scale;
    const d = f.depth * mapping.scale;
    // Tenu seul, ou l'un des meubles choisis à plusieurs : même trait bleu.
    const choisi = o.id === selectedObjectId || !!meublesChoisis?.includes(o.id);
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
            poseRefusee && o.id === selectedObjectId ? 0.35 : estUnCaisson(o) ? 0.25 : !planElec && o.teinte ? 0.55 : 1
          }
          // Et ce qui en chevauche un autre GARDE son trait rouge
          // une fois lâché (revue « Théo ») : le contrôle le dit
          // aussi, mais c'est sur le plan qu'on le corrige.
          stroke={
            poseRefusee && o.id === selectedObjectId
              ? c.danger
              : choisi
              ? c.blue
              : meublesEnConflit?.has(o.id)
                ? c.danger
                : planElec
                  ? c.line
                  : c.lineStrong
          }
          strokeWidth={choisi ? 2.5 : meublesEnConflit?.has(o.id) ? 1.6 : 1}
          rx={estUnCaisson(o) ? 0 : 3}
          /*
            LE CAISSON SOUS PLAFOND EST AU-DESSUS : en pointillés, comme
            tout ce qu'un plan dessine au-dessus de la coupe, et presque
            transparent — on voit le meuble qui est dessous.
          */
          {...(estUnCaisson(o) && !(poseRefusee && o.id === selectedObjectId)
            ? { strokeDasharray: '6 4' }
            : {})}
        />
        {estUnCaisson(o) && (
          // Et ses deux diagonales : le signe du volume en hauteur.
          <Path
            d={`M${(-w / 2).toFixed(1)} ${(-d / 2).toFixed(1)} L${(w / 2).toFixed(1)} ${(d / 2).toFixed(1)} M${(w / 2).toFixed(1)} ${(-d / 2).toFixed(1)} L${(-w / 2).toFixed(1)} ${(d / 2).toFixed(1)}`}
            stroke={planElec ? c.inkFaint : c.inkSoft}
            strokeWidth={0.8}
            strokeDasharray="4 3"
            fill="none"
          />
        )}
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
        {estVerrouille(o) && (
          /* LE CADENAS SUR LE PLAN — on voit d'un coup d'œil ce qui ne
             bougera pas (manque proposé par l'agent testeur MEUBLES). */
          <G
            testID={`cadenas-${f.id}`}
            transform={`rotate(${(-(f.yaw + view.rot) * 180) / Math.PI}) translate(-6, -6) scale(0.5)`}>
            <Path d={SOLAIRES.cadenas} fill={c.amber} fillRule="evenodd" />
          </G>
        )}
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
  }, [
    mapping, partOf, facesPlan, view.rot, selectedObjectId, planElec, c, meublesEnConflit,
    onSelectObject, editable, meublesChoisis,
  ]);

  /*
    LES GESTES DES COUCHES MÉMOÏSÉES PASSENT PAR UNE RÉFÉRENCE : voir plus
    bas. Une couche gardée d'un rendu à l'autre ne peut pas capturer les
    fonctions de CE rendu — elle lirait une sélection périmée.
  */
  const actes = useRef({
    appuiSurLeMur,
    toucher,
    cibleDuMeuble,
    cibleDeLaBaie,
    cibleDuPlafond,
    cibleDeLAppareil,
    selectedObjectId,
    selectedWallId,
    selectedRoomId,
  });
  actes.current = {
    appuiSurLeMur,
    toucher,
    cibleDuMeuble,
    cibleDeLaBaie,
    cibleDuPlafond,
    cibleDeLAppareil,
    selectedObjectId,
    selectedWallId,
    selectedRoomId,
  };
  /** L'appui de chaque mur : un relais par mur, créé une fois (voir `WallBody`). */
  const appuisDesMurs = useRef(new Map<string, () => void>()).current;
  const appuiDuMur = useCallback(
    (id: string) => {
      let f = appuisDesMurs.get(id);
      if (!f) {
        f = () => actes.current.appuiSurLeMur(id);
        appuisDesMurs.set(id, f);
      }
      return f;
    },
    [appuisDesMurs],
  );
  const choisirAuPlafond = useCallback(
    (id: string) =>
      actes.current.toucher(actes.current.cibleDuPlafond(id), () => onSelectCeiling?.(id)),
    [onSelectCeiling],
  );
  const choisirLAppareil = useCallback(
    (id: string, wallId: string) =>
      actes.current.toucher(actes.current.cibleDeLAppareil(id), () => onSelectFixture?.(id, wallId)),
    [onSelectFixture],
  );
  /** La cote de chaque mur, au nu : une fois par plan, pas une fois par sélection. */
  const longueurs = useMemo(
    () => new Map(walls.map((w) => [w.id, longueurCotee(walls, w, parts)])),
    [walls, parts],
  );
  /*
    UN REFEND SE COTE DANS LA PIÈCE OÙ S'ÉCRIT SA COTE — enquête des
    chiffres : entre une chambre (face de 2,93) et un bureau aux murs plus
    épais (face de 2,70), l'écran écrivait toujours la plus longue, même
    posée dans le bureau ; le PDF, lui, écrit la face de la pièce où il
    écrit. La pièce du côté de la cote donne sa face.
  */
  const longueurDuCote = useCallback(
    (w: WallSeg, pose: { x: number; y: number } | undefined) => {
      const tout = longueurs.get(w.id);
      if (!pose || !mapping) return tout;
      const siennes = parts.filter((pp) => pp.surface?.nu && pp.walls.some((x) => x.id === w.id));
      if (siennes.length < 2) return tout;
      const L = segLength(w);
      if (L < 1e-6) return tout;
      const a = mapping.toPx(w.a);
      const b = mapping.toPx(w.b);
      const cote = (q: { x: number; y: number }) => Math.sign((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x));
      const sens = cote(pose);
      const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      const n = { x: -(w.b.z - w.a.z) / L, z: (w.b.x - w.a.x) / L };
      const sonde = (s: number) => mapping.toPx({ x: m.x + n.x * s * 0.3, z: m.z + n.z * s * 0.3 });
      const sondeDuSens = cote(sonde(1)) === sens ? 1 : -1;
      const pt = { x: m.x + n.x * sondeDuSens * 0.3, z: m.z + n.z * sondeDuSens * 0.3 };
      const laSienne = siennes.find((pp) => insidePoly(pt, pp.surface!.nu!));
      return laSienne ? longueurCotee(walls, w, [laSienne]) : tout;
    },
    [longueurs, mapping, parts, walls],
  );

  /*
    LES COUCHES QUI NE BOUGENT PAS SE GARDENT D'UN RENDU À L'AUTRE.

    Relevé des testeurs : « une simple sélection coûte de 75 à 170 ms » —
    choisir un mur, une pièce, un meuble redessinait tout le plan : le poché,
    les sols, les vingt-six meubles, l'appareillage, les cotes. Chaque couche
    est maintenant un élément mémoïsé : React reprend l'arbre de la veille
    tant que ce qu'elle dessine n'a pas changé, et une sélection ne refait
    que ce qu'elle colore. Leurs appuis lisent la sélection du moment par
    `actes` (une couche gardée ne doit pas répondre avec celle de la veille).
  */
  const coucheDesSols = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
                <CacheEnVol key={part.roomId} piece={part.roomId}>
                  <G
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
                            if (actes.current.selectedObjectId) {
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
                            if (actes.current.selectedWallId) {
                              onSelectWall(null);
                              return;
                            }
                            onSelectRoom(
                              part.roomId === actes.current.selectedRoomId ? null : part.roomId,
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
                </CacheEnVol>
              );
            })}
          </G>
        )}
      </>
    );
  }, [
    showSurfaces, dots, mapping, parts, editable, onSelectRoom, onSelectObject, onSelectWall,
    fillOf, planElec, decorDesMurs, c,
  ]);

  const coucheDesHalos = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
            onPress={editable ? appuiDuMur(w.id) : undefined}
          />
        ))}
      </>
    );
  }, [walls, quads, mapping, roomById, editable, appuiDuMur]);

  const coucheDesMeubles = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
        {[...objects]
          // Les tapis d'abord, les caissons sous plafond en dernier : ils sont au-dessus de tout.
          .sort((a, b) => rangDuDessin(a) - rangDuDessin(b))
          /*
            LE MEUBLE TENU SE DESSINE EN VOL — voir `SuitLeDoigt`. À sa
            place dans l'ordre du dessin : il ne passe ni devant ni
            derrière les autres parce qu'on le glisse. TOUS passent par
            lui désormais : la pièce qu'on glisse emporte les siens
            (voir `store/planEnVol`), et chacun ne se rend que s'il bouge.
          */
          .map((meuble) => (
            <SuitLeDoigt key={meuble.id} objet={meuble} render={dessinerMeuble} />
          ))}
      </>
    );
  }, [objects, mapping, dessinerMeuble]);

  const coucheDesPrises = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
                    actes.current.toucher(actes.current.cibleDuMeuble(o.id), () =>
                      onSelectObject(o.id === actes.current.selectedObjectId ? null : o.id),
                    )
                  }
                />
              );
            })}
      </>
    );
  }, [onSelectObject, editable, objects, partOf, facesPlan, mapping, view.rot]);

  const coucheDesMassifs = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
      </>
    );
  }, [massifs, mapping, c, editable, onRecoin]);

  const coucheDuFiligrane = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
      </>
    );
  }, [filigrane, mapping, c]);

  // La maçonnerie, d'un seul tenant : voir `pocheDesMurs` — et pendant un geste, `CoucheDuPoche`.
  const coucheDuPoche = useMemo(
    () =>
      mapping ? (
        <CoucheDuPoche
          murs={mursPoses}
          baies={openings}
          rooms={rooms}
          poche={poche}
          natures={corpsDeNature}
          mapping={mapping}
          c={c}
        />
      ) : null,
    [mursPoses, openings, rooms, poche, corpsDeNature, mapping, c],
  );

  const coucheDesMurs = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
        {walls.map((w) => (
          <SuitLeMur
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
            longueur={longueurDuCote(w, cotesArbitrees.poses.get(`w:${w.id}`))}
            selected={editable && w.id === selectedWallId}
            onPress={editable ? appuiDuMur(w.id) : undefined}
          />
        ))}
      </>
    );
  }, [
    walls, quads, mapping, dehorsDesMurs, roomById, placementCotes, cotesArbitrees, detail,
    longueurDuCote, editable, selectedWallId, appuiDuMur,
  ]);

  const coucheDesReperes = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
        {reperesBaies.map((r) => {
          const decale = WALL_T / 2 + 12 / mapping.scale;
          const p = mapping.toPx({ x: r.m.x + r.n.x * decale, z: r.m.z + r.n.z * decale });
          const larg = 8 + r.texte.length * 6.4;
          return (
            <G key={`repere-${r.id}`} pointerEvents="none" testID={`repere-${r.texte}`}>
              <Rect x={p.x - larg / 2} y={p.y - 7.5} width={larg} height={15} rx={4} fill={c.surface} stroke={c.blue} strokeWidth={1} />
              <SvgText x={p.x} y={p.y + 3.6} fontSize={10} fontWeight="700" fill={c.blue} textAnchor="middle">
                {r.texte}
              </SvgText>
            </G>
          );
        })}
      </>
    );
  }, [reperesBaies, mapping, c]);

  const coucheDesRetours = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
      </>
    );
  }, [editable, walls, retours, runQuad, mapping, onSelectWall, onSelectOpening, onSelectObject]);

  const coucheDesPhotos = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
      </>
    );
  }, [photos, wallById, quads, walls, mapping, c, onSelectPhoto]);

  const coucheDesCotes = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
        {showMeasures && detail > 0.02 &&
          walls.map((w) => (
            // Les cotes d'un mur tiré reviennent au lâcher, à leur place.
            <CacheEnVol key={`runs-${w.id}`} mur={w.id}>
              {(runsAuNu.get(w.id) ?? []).map((run, ri) => {
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
              })}
            </CacheEnVol>
          ))}
      </>
    );
  }, [showMeasures, detail, walls, runsAuNu, mapping, cotesArbitrees, c]);

  const coucheDesBaies = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
            // Vers la pièce de la porte, sondée des deux côtés de la baie
            // (voir `normaleVersLaPiece`).
            const versPiece = normaleVersLaPiece(o, [...partOf.values()]);
            if (!versPiece) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const ex = b.x - a.x;
            const ey = b.y - a.y;
            const r = Math.hypot(ex, ey);
            if (r < 6) return null;
            // La normale écran tournée vers l'intérieur de la pièce : la
            // normale du plan, portée à l'écran.
            const o0 = mapping.toPx(o.a);
            const o1 = mapping.toPx({ x: o.a.x + versPiece.x, z: o.a.z + versPiece.z });
            const ln = Math.hypot(o1.x - o0.x, o1.y - o0.y) || 1;
            let n = { x: (o1.x - o0.x) / ln, y: (o1.y - o0.y) / ln };
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
            <CacheEnVol key={o.id} baie={o.id}>
              <G
                testID={`baie-${o.id}`}
                onPress={
                  editable && onSelectOpening
                    ? () => actes.current.toucher(actes.current.cibleDeLaBaie(o.id), () => onSelectOpening(choisie ? null : o.id))
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
            </CacheEnVol>
          );
        })}
      </>
    );
  }, [
    openings, baieDuPoche, mapping, colorOpenings, c, selectedOpeningId, partOf, pivots,
    portesBloquees, bloqueesEnVol, editable, onSelectOpening,
  ]);

  const coucheElectrique = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
          LES GAINES : un filet tireté, du tableau à chaque appareil, en
          droite ligne au plafond. Son tracé est celui du métré porté au
          devis, pas une illustration.

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
        {/*
          LES RETOMBÉES, AU PIED DU TRACÉ — relevé du patron : « très
          souvent on passe par le plafond, et pas les murs, sauf pour les
          retombées vers les points d'élec ». Le tireté est la traversée
          au plafond ; le petit triangle plein, pointe en bas, dit qu'ici
          la gaine DESCEND le long du mur, jusqu'à la boîte. Même symbole
          que le PDF — et pas le cercle barré, qui est le point lumineux.
        */}
        {cableRoutes?.map((r) => {
          if (r.pose?.kind !== 'plafond' || r.pose.jusqua === undefined) return null;
          const fin = r.path[r.path.length - 1];
          if (!fin) return null;
          const q = mapping.toPx(fin);
          const teinte = circuitMarks?.get(r.id)
            ? markColor(circuitMarks.get(r.id)!)
            : c.blue;
          // L'axe vertical de l'écran descend : la pointe est en y + k.
          const k = 4;
          return (
            <Polygon
              key={`retombee-${r.id}`}
              points={`${q.x - k},${q.y - k * 0.75} ${q.x + k},${q.y - k * 0.75} ${q.x},${q.y + k}`}
              fill={teinte}
              stroke={c.surface}
              strokeWidth={0.8}
              opacity={0.9}
            />
          );
        })}
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
            onSelectCeiling ? choisirAuPlafond : undefined
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
            onSelectFixture ? choisirLAppareil : undefined
          }
          encre={encre}
          dehors={dehorsDesMurs}
          c={c}
        />
      </>
    );
  }, [
    showFixtures, openings, partOf, mapping, c, cableRoutes, circuitMarks, cotesArbitrees.ecarts,
    ceiling, showCeiling, selectedCeilingId, selectedCeilingRow, showMeasures, onSelectCeiling,
    choisirAuPlafond, fixtures, walls, quads, frame, encre, view.rot, elecLod, onSelectFixture,
    choisirLAppareil, dehorsDesMurs,
  ]);

  const coucheDesCartouches = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
          // Le corps du cartouche, resserré s'il a fallu pour tenir dans sa pièce.
          const k = echelleDesNoms(view.zoom) * car.echelle;
          const PAD = 4 * k;
          const LH = 12.5 * k;
          const TAILLES = {
            nom: 10.5 * k,
            aire: (roomName !== '' ? 9.5 : 10.5) * k,
            hors: 8.5 * k,
            invite: 10.5 * k,
            ligne: 10 * k,
          } as const;
          const retenues = car.textes.map((t) => ({
            t: t.t,
            size: TAILLES[t.role],
            fill:
              t.role === 'nom' || t.role === 'ligne'
                ? selectedRoomId === part.roomId && editable
                  ? c.blue
                  : c.ink
                : t.role === 'aire'
                  ? roomName !== ''
                    ? c.inkSoft
                    : c.ink
                  : c.inkFaint,
            bold: t.role === 'nom' || t.role === 'ligne' || t.role === 'invite' || roomName === '',
          }));
          const p = mapping.toPx(pos);
          const selected = editable && part.roomId === selectedRoomId;
          return (
            <CacheEnVol key={`label-${part.roomId}`} piece={part.roomId}>
              <G
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
            </CacheEnVol>
          );
        })}
      </>
    );
  }, [
    selectedCeilingId, parts, cartouches, roomById, view.zoom, selectedRoomId, editable, mapping,
    c, planElec, onSelectObject, onSelectRoom, onEditRoomName,
  ]);

  const coucheDesNotes = useMemo(() => {
    if (!mapping) return null;
    return (
      <>
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
      </>
    );
  }, [notes, mapping, niveauCourant, selectedNoteId, onSelectNote, c]);

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
            if (Number.isFinite(x) && Number.isFinite(y)) {
              dernierToucher.current = { x: pageX - x, y: pageY - y };
              origineDuCadre.current = { x, y };
            }
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
        <CoucheDuPlan
          marges={margesToile}
          /*
            LE GLISSEMENT DE LA PIÈCE SE PREND SUR LA COUCHE, PAS À CÔTÉ.

            Il vivait dans une zone soeur posée SOUS le dessin. Or le toucher
            ne remonte qu'aux ANCÊTRES de ce qu'on touche, et en édition le
            SVG plein cadre — son fond qui désélectionne, la surface des
            pièces — prend tout appui : la zone n'était jamais consultée, et
            le plan, lui, s'écartait exprès devant la pièce. Le doigt ne
            faisait rien du tout. La couche est l'ancêtre de tout le dessin :
            elle est demandée avant le plan, ne répond qu'au mouvement, et
            seulement dans le contour de la pièce choisie — taper un mur,
            promener le plan, saisir un meuble restent inchangés.
          */
          gestes={
            editable && selectedRoomId && onMoveRoom
              ? piece.panHandlers
              : undefined
          }
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
                // La marque de la couche : voir `nouvelleCouche`.
                { translateX: glisse.marque },
              ],
            },
          ]}>
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
            le contraire d'une optimisation. L'agrandir est demandé à la
            prise du doigt ; React le rend une tâche plus tard, quand la
            couche a déjà bougé — d'où la marge tenue par la couche elle-même
            (voir `CoucheDuPlan`).
          */}
          <ToileDuPlan largeur={layout.w} hauteur={layout.h}>
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

            {coucheDesSols}
            {/* La pièce qu'on glisse : son sol suit le doigt (voir `SolEnVol`). */}
            <SolEnVol mapping={mapping} parts={parts} />

            {/*
              LE HALO DES MURS — la tolérance, et rien qu'elle.

              Elle est posée ICI, sous les meubles, et non avec les murs :
              voir `couche` dans `WallBody`. Un appui sur un meuble d'une
              petite pièce revenait au mur d'à côté, parce que le mur se
              peint après et que sa tolérance déborde de trois points.
              Ce qu'on touche prime sur ce qui est à côté.
            */}
            {coucheDesHalos}

            {/*
              Objets (empreintes au sol). LES TAPIS D'ABORD — revue
              « Yasmine » : dessinés dans l'ordre d'ajout, le tapis posé
              après la table la recouvrait, sur l'image même qu'on envoie au
              client. Un tapis est sous les meubles ; il se dessine dessous.
            */}
            {coucheDesMeubles}

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
            {coucheDesPrises}

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
            {coucheDesMassifs}

            {/*
              LE NIVEAU DU DESSOUS, EN TRANSPARENCE.

              Il passe sous tout le reste — c'est un repère, pas un plan :
              on s'en sert pour poser l'étage d'aplomb au-dessus, la cage
              d'escalier en face de la cage d'escalier. Un simple trait
              d'axe suffit ; le poché du bas donnerait deux plans mêlés au
              lieu d'un plan et de son ombre.
            */}
            {coucheDuFiligrane}

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

            {coucheDuPoche}

            {/* Murs : leur corps ne se dessine plus (le poché le fait) ; il
                garde le toucher, la cote, et le bleu de la sélection. Leur
                tolérance de toucher, elle, est passée plus bas, sous les
                meubles. */}
            {coucheDesMurs}
            {/* Les murs nés pendant un geste (voir `MursNesEnVol`). */}
            <MursNesEnVol mapping={mapping} roomById={roomById} />

            {coucheDesReperes}

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

            {coucheDesRetours}

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
                // Il suit le doigt quand on tire son coin ou qu'on le tourne.
                return (
                  <SuitLeMur
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
            {coucheDesPhotos}

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
            {coucheDesCotes}

            {/* Portes / fenêtres : trouée dans le mur, puis trait de repérage */}
            {coucheDesBaies}
            {/* Les menuiseries qui suivent un mur en vol (voir `BaiesEnVol`). */}
            <BaiesEnVol mapping={mapping} />

            {coucheElectrique}

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

            {coucheDesCartouches}
            {/* LES MOTS ÉCRITS SUR LE PLAN, par-dessus le reste : une
                remarque à moitié cachée sous un canapé n'est pas une
                remarque. */}
            {coucheDesNotes}
            {/* Le calque de capture : au-dessus de TOUT, et seulement
                pendant une pose. */}
            {/*
              LE CALQUE QUI TIRE UNE PIECE.

              Il vit au-dessus de tout, comme celui de la pose : on tire un
              rectangle sur le plan sans risquer d'attraper un mur ou un
              meuble en chemin. Il ne s'allume que quand on l'a demande.
            */}
            {traceMurs && mapping && (
              <CalqueTrace
                largeur={layout.w}
                hauteur={layout.h}
                mapping={mapping}
                walls={walls}
                coins={traceMurs.coins}
                aimant={traceMurs.aimant}
                cadre={planFrameAngle(walls)}
                versCadre={pointDuCadre}
                onCoin={(v) => onTraceCoin?.(v)}
                onVisee={onTraceVisee}
                couleurs={{ trait: c.blue, accroche: c.blueDark, texte: c.ink, fond: c.surface }}
              />
            )}
            {tracantPiece && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill="transparent"
                accessibilityLabel="Tirer une piece"
                onPressIn={(e) => {
                  /*
                    LES DEUX COINS SE COLLENT AUX MURS QUI SONT LA.

                    Sans aide, tomber sur un mur existant releve de la
                    chance : la reprise se joue a douze centimetres, deux
                    pixels sur un plan dezoome. L'aimant a la MEME portee que
                    la reprise — sinon il collerait la ou le magasin ne
                    reconnait plus rien, et l'on doublerait le mur.
                  */
                  const p = aimanterCoin(mapping.toMeters(pointDuCadre(e)), walls);
                  setTirage({ a: p, b: p });
                }}
                onResponderMove={(e) => {
                  const p = aimanterCoin(mapping.toMeters(pointDuCadre(e)), walls);
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
                  // Le point tombe sous le doigt : voir `pointDuCadre`.
                  onRegleTap?.(mapping.toMeters(pointDuCadre(e)), 18 / mapping.scale);
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
                  // Le spot, le point lumineux ou la note tombe sous le
                  // doigt : voir `pointDuCadre`.
                  onPlaceAt?.(mapping.toMeters(pointDuCadre(e)));
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

          {/* PLUSIEURS MEUBLES CHOISIS : l'ensemble se glisse d'un doigt. */}
          {meublesChoisis && meublesChoisis.length >= 2 && showFurniture && editable &&
            (() => {
              const choisis = meublesDuNiveau.filter((x) => meublesChoisis.includes(x.id));
              if (choisis.length < 2) return null;
              // La boîte écran de l'ensemble : c'est elle qu'on empoigne.
              let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
              for (const o of choisis) {
                const f = footprintOf(o, partOf, facesPlan);
                const ang = f.yaw;
                for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                  const q = mapping.toPx({
                    x: f.cx + Math.cos(ang) * (f.width / 2) * sx - Math.sin(ang) * (f.depth / 2) * sz,
                    z: f.cz + Math.sin(ang) * (f.width / 2) * sx + Math.cos(ang) * (f.depth / 2) * sz,
                  });
                  x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
                  x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
                }
              }
              return (
                <GroupeDragHandle
                  ids={choisis.map((o) => o.id)}
                  box={{ x: x0 - 8, y: y0 - 8, w: x1 - x0 + 16, h: y1 - y0 + 16 }}
                  mapping={mapping}
                  onTap={(q) => {
                    // Un appui sans glisser : le meuble dessous s'ajoute ou se retire.
                    const m = mapping.toMeters(q);
                    const dessous = meublesDuNiveau.find((o) => {
                      const f = footprintOf(o, partOf, facesPlan);
                      const dx = m.x - f.cx;
                      const dz = m.z - f.cz;
                      const u = dx * Math.cos(f.yaw) + dz * Math.sin(f.yaw);
                      const v = -dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
                      return Math.abs(u) <= f.width / 2 && Math.abs(v) <= f.depth / 2;
                    });
                    if (dessous) onSelectObject?.(dessous.id);
                  }}
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
                    // Pivoter, coter, [plusieurs], [verrou], retirer : la croix reste la dernière.
                    const enPlus = (onSelectionMultiple ? 1 : 0) + (onVerrouObject ? 1 : 0);
                    const rangeeW = ECART * (2 + enPlus);
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
                    // Verrouillé : ni glisser, ni tourner, ni étirer — la croix et
                    // les cotes restent (manque proposé par l'agent testeur MEUBLES).
                    const fige = estVerrouille(o);
                    return (
                      <>
                        {!fige && (
                        <ObjectDragHandle
                          objectId={o.id}
                          center={p}
                          half={{ x: hw, y: hh }}
                          mapping={mapping}
                          raw={o}
                          onRefus={signalerRefus}
                          onTap={onSelectObject ? () => onSelectObject(null) : undefined}
                        />
                        )}
                        {showObjectDims && !fige &&
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
                        {!fige && (
                        <RotateHandle
                          objectId={o.id}
                          center={p}
                          at={{ x: bx, y: by }}
                          raw={o}
                          viewRot={view.rot}
                          frame={frame}
                        />
                        )}
                        <TouchableOpacity
                          style={[
                            styles.objDelete,
                            { left: bx + ECART * (2 + enPlus) - 17, top: by - 17 },
                          ]}
                          accessibilityLabel="Retirer le meuble"
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          onPress={() => onDeleteObject?.(o.id)}>
                          <CloseCross size={17} color="#FFFFFF" weight={3.4} />
                        </TouchableOpacity>
                        {onSelectionMultiple && (
                          <TouchableOpacity
                            style={[styles.objMeasure, { left: bx + ECART * 2 - 17, top: by - 17 }]}
                            accessibilityLabel="Sélectionner plusieurs meubles"
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            onPress={() => onSelectionMultiple(o.id)}>
                            <Svg width={17} height={17} viewBox="0 0 24 24">
                              <Path d={SOLAIRES.selection} fill={c.ink} fillRule="evenodd" />
                            </Svg>
                          </TouchableOpacity>
                        )}
                        {onVerrouObject && (
                          <TouchableOpacity
                            style={[
                              styles.objMeasure,
                              { left: bx + ECART * (2 + (onSelectionMultiple ? 1 : 0)) - 17, top: by - 17 },
                            ]}
                            accessibilityLabel={fige ? 'Déverrouiller le meuble' : 'Verrouiller le meuble'}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            onPress={() => onVerrouObject(o.id, !fige)}>
                            <Svg width={17} height={17} viewBox="0 0 24 24">
                              <Path d={fige ? SOLAIRES.cadenas : SOLAIRES.cadenasOuvert} fill={fige ? c.amber : c.ink} fillRule="evenodd" />
                            </Svg>
                          </TouchableOpacity>
                        )}
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
              const piece = roomById.get(selectedRoomId);
              const ids = new Set(piece?.wallIds ?? []);
              // Les murs de la pièce, comme les compte `resizeRoomSide`.
              const sesMurs = walls.filter((w) =>
                ids.size > 0 ? ids.has(w.id) : roomOf(w) === selectedRoomId,
              );
              return (
                <PoigneesDeLaPiece
                  roomId={selectedRoomId}
                  contour={pts}
                  murs={sesMurs}
                  mapping={mapping}
                />
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
                  {onDeleteWall
                    ? (() => {
                        /*
                          LA CROIX À CÔTÉ DE LA ROTATION — relevé du patron :
                          « une croix de suppression à côté du bouton de
                          rotation, directement à côté du mur, pour gagner du
                          temps ». Même flanc que la poignée, un cran plus loin
                          le long du mur : jamais sur la barre du mur, qui est
                          de l'autre côté.
                        */
                        const at = croixDuMurAt(w, mapping, sens, { w: layout.w, h: layout.h });
                        return (
                          <TouchableOpacity
                            style={[styles.wallDelete, { left: at.x - 15, top: at.y - 15 }]}
                            accessibilityLabel="Retirer le mur"
                            hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
                            onPress={() => onDeleteWall(w.id)}>
                            <CloseCross size={14} color="#FFFFFF" weight={3.2} />
                          </TouchableOpacity>
                        );
                      })()
                    : null}
                </React.Fragment>
              );
            })()}
        </CoucheDuPlan>
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
}, memesProps);

/**
 * Un mur au plan : corps poché dont les quatre coins viennent des onglets
 * partagés (`wallQuads`) — deux murs qui se rejoignent forment donc un angle
 * franc, sans recouvrement ni fente.
 */
/*
  MÉMOÏSÉ : DEUX TRACÉS PAR MUR, ET UN SEUL CHANGE QUAND ON EN CHOISIT UN.
  Relevé des testeurs : « WallBody non plus (2 instances par mur, avec des
  onPress en ligne) ». L'appui de chaque mur est désormais un relais stable
  (`appuiDuMur`), et le choix d'un mur ne redessine que lui.
*/
// Le même nom dedans : les bancs comptent ses rendus dans les piles d'appels.
// eslint-disable-next-line @typescript-eslint/no-shadow
const WallBody = React.memo(function WallBody({
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
  enVol,
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
  /**
   * LE MUR SUIT LE DOIGT — voir `store/planEnVol`. Le poché ne le dessine
   * plus le temps du geste (voir `CoucheDuPoche`) : son corps se peint ici,
   * plein, avec ses onglets en vol.
   */
  enVol?: boolean;
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
        <Polygon points={body} fill={sansCorps && !selected && !enVol ? 'transparent' : teinte} stroke="none" />
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
});

/**
 * LE MUR QUI SUIT LE DOIGT — et lui seul se redessine.
 *
 * Le pendant de `SuitLeDoigt` pour les murs (voir `store/planEnVol`) : tant
 * que son mur n'est pas en vol, il rend le mur du magasin, tel quel. Tiré,
 * tourné, emporté avec sa pièce, il le rend à sa place en vol — son corps
 * plein avec son onglet en vol (le poché ne le dessine plus le temps du
 * geste), le bleu du mur choisi, le tireté d'une pièce neuve, et sa cote à
 * jour posée au milieu (la place arbitrée était celle d'avant le geste). Les
 * autres murs ne se rendent pas.
 */
const SuitLeMur = React.memo(function MurQuiSuitLeDoigt(props: React.ComponentProps<typeof WallBody>) {
  const vol = usePlanEnVol((st) => st.plan?.murs.get(props.wall.id) ?? null);
  const quad = usePlanEnVol((st) => st.plan?.quads.get(props.wall.id));
  if (!vol) return <WallBody {...props} />;
  return (
    <WallBody
      {...props}
      wall={vol}
      quad={quad}
      measureAt={undefined}
      // La cote affichée (au nu, voir `longueurCotee`) bouge de ce que bouge le mur.
      longueur={props.longueur !== undefined ? props.longueur + segLength(vol) - segLength(props.wall) : undefined}
      enVol
    />
  );
});

/**
 * CE QUI EST RESTÉ À L'ANCIENNE PLACE S'EFFACE LE TEMPS DU GESTE — le
 * symbole d'une menuiserie qui suit son mur, les cotes de détail d'un mur
 * tiré, le sol et le cartouche de la pièce qu'on glisse. Ils reviennent au
 * lâcher, recalculés à la nouvelle place. Une seule question au vol, par
 * élément : seuls ceux dont la réponse change se rendent.
 */
function CacheEnVol({
  mur,
  baie,
  piece,
  children,
}: {
  mur?: string;
  baie?: string;
  piece?: string;
  children: React.ReactNode;
}) {
  const cache = usePlanEnVol((st) => {
    const p = st.plan;
    if (!p) return false;
    return (
      (mur !== undefined && p.murs.has(mur)) ||
      (baie !== undefined && p.baies.has(baie)) ||
      (piece !== undefined && p.piece?.id === piece)
    );
  });
  return cache ? null : <>{children}</>;
}

/**
 * LE POCHÉ PENDANT UN GESTE — la maçonnerie d'un seul tenant (`pocheDesMurs`),
 * SANS les murs qui bougent.
 *
 * Le refaire à chaque image pour le faire suivre le doigt coûtait onze
 * millisecondes sur l'exemple (mesuré, voir `maj-plan2d`) : l'union de tous
 * les murs, pour en déplacer deux. Il se refait donc UNE fois, à la première
 * image du geste, sans les murs que le geste emporte — ils se peignent seuls,
 * pleins, à leur place en vol (`SuitLeMur`, `MursNesEnVol`) — et ne bouge
 * plus jusqu'au lâcher, où le plan entier se recalcule. Les murs emportés
 * changent rarement en cours de geste ; s'ils changent, il se refait.
 * La nature des murs (plaque, doublage, à démolir…) suit la même règle.
 */
const CoucheDuPoche = React.memo(function CoucheDuPoche({
  murs,
  baies,
  rooms,
  poche,
  natures,
  mapping,
  c,
}: {
  /** Les murs posés (hors pièce neuve) : ceux que le poché dessine. */
  murs: WallSeg[];
  baies: WallSeg[];
  rooms: Parameters<typeof pocheDesMurs>[2];
  poche: ReturnType<typeof pocheDesMurs>;
  natures: ReturnType<typeof dessinDesNatures>;
  mapping: EffMapping;
  c: Palette;
}) {
  // Ce que le geste emporte, en une clé : elle ne change pas d'une image à l'autre.
  const emportes = usePlanEnVol((st) =>
    st.plan ? JSON.stringify([[...st.plan.murs.keys()].sort(), [...st.plan.baies.keys()].sort()]) : null,
  );
  const vol = useMemo(() => {
    if (emportes === null) return null;
    const [m, b] = JSON.parse(emportes) as [string[], string[]];
    const ids = new Set([...m, ...b]);
    const restent = murs.filter((w) => !ids.has(w.id));
    return {
      poche: pocheDesMurs(restent, baies.filter((o) => !ids.has(o.id)), rooms),
      natures: natures ? dessinDesNatures(restent, wallQuadsOf(restent), jonctionsDetaillees(restent)) : null,
    };
  }, [emportes, murs, baies, rooms, natures]);
  const p = vol?.poche ?? poche;
  const corpsDeNature = vol ? vol.natures : natures;
  return (
    <>
      <Path
        testID="poche-des-murs"
        d={cheminDuPoche(p.contours, mapping.toPx)}
        fill={c.ink}
        fillRule="evenodd"
      />
      {corpsDeNature ? (
        <G testID="nature-des-murs" pointerEvents="none">
          <Defs>
            <ClipPath id="clip-poche-nature">
              <Path d={cheminDuPoche(p.contours, mapping.toPx)} clipRule="evenodd" />
            </ClipPath>
          </Defs>
          <G clipPath="url(#clip-poche-nature)">
            {corpsDeNature.coeurs.map((j, i) => (
              <Polygon
                key={`coeur-${i}`}
                points={j.poly.map((q) => mapping.toPx(q)).map((q) => `${q.x},${q.y}`).join(' ')}
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
                    points={m.contour.map((q) => mapping.toPx(q)).map((q) => `${q.x},${q.y}`).join(' ')}
                    fill={r.fond}
                  />
                  {m.filets.map((f, k) => (
                    <Polyline
                      key={k}
                      points={f.map((q) => mapping.toPx(q)).map((q) => `${q.x},${q.y}`).join(' ')}
                      fill="none"
                      stroke={r.contour}
                      strokeWidth={trait}
                      strokeDasharray={r.tirets ? [5, 3] : undefined}
                    />
                  ))}
                  {m.boucles ? (
                    <Polyline
                      points={m.boucles.map((q) => mapping.toPx(q)).map((q) => `${q.x},${q.y}`).join(' ')}
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
                points={poly.map((q) => mapping.toPx(q)).map((q) => `${q.x},${q.y}`).join(' ')}
                fill={c.ink}
              />
            ))}
          </G>
        </G>
      ) : null}
    </>
  );
});

/**
 * LES MURS QUI NAISSENT EN VOL — la copie d'une cloison mitoyenne qu'une
 * pièce emporte, le morceau d'un mur partagé qu'on coupe. Ils n'ont pas de
 * tracé au plan : ce calque les peint, pleins (en tirets pour une pièce
 * neuve), le temps du geste.
 */
function MursNesEnVol({
  mapping,
  roomById,
}: {
  mapping: EffMapping;
  roomById: Map<string, { neuve?: boolean }>;
}) {
  const nes = usePlanEnVol((st) => st.plan?.nes);
  const quads = usePlanEnVol((st) => st.plan?.quads);
  if (!nes?.length) return null;
  return (
    <G pointerEvents="none">
      {nes.map((w) => (
        <WallBody
          key={`ne-${w.id}`}
          wall={w}
          quad={quads?.get(w.id)}
          mapping={mapping}
          showMeasure={false}
          selected={false}
          neuve={!!roomById.get(roomOf(w) ?? '')?.neuve}
          enVol
        />
      ))}
    </G>
  );
}

/**
 * LES MENUISERIES EN VOL — elles suivent leur mur, au doigt. Une trouée
 * claire dans le corps du mur en vol, et le trait de la baie, en bleu : le
 * détail (battant, vitrage, dormant) revient au lâcher, avec le poché qui
 * les loge.
 */
function BaiesEnVol({ mapping }: { mapping: EffMapping }) {
  const c = useTheme();
  const baies = usePlanEnVol((st) => st.plan?.baies);
  if (!baies?.size) return null;
  const trouee = Math.max(3, WALL_T * mapping.scale + 1);
  return (
    <G pointerEvents="none" testID="baies-en-vol">
      {[...baies.values()].map((o) => {
        const a = mapping.toPx(o.a);
        const b = mapping.toPx(o.b);
        return (
          <G key={`vol-${o.id}`}>
            <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.surface} strokeWidth={trouee} />
            <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.blue} strokeWidth={1.6} />
          </G>
        );
      })}
    </G>
  );
}

/**
 * LE SOL DE LA PIÈCE QU'ON GLISSE — son contour, décalé de la course du
 * doigt, en bleu léger : on voit où elle va se poser. Elle se recale sur
 * ses voisines au lâcher (l'aimant), et son vrai sol revient avec le plan.
 */
function SolEnVol({ mapping, parts }: { mapping: EffMapping; parts: RoomPart[] }) {
  const c = useTheme();
  const piece = usePlanEnVol((st) => st.plan?.piece ?? null);
  if (!piece) return null;
  const pts = parts.find((p) => p.roomId === piece.id)?.surface?.pts;
  if (!pts || pts.length < 3) return null;
  const poly = pts
    .map((p) => mapping.toPx({ x: p.x + piece.dx, z: p.z + piece.dz }))
    .map((q) => `${q.x},${q.y}`)
    .join(' ');
  return (
    <Polygon
      testID="sol-en-vol"
      points={poly}
      fill={c.blue}
      fillOpacity={0.1}
      stroke={c.blue}
      strokeWidth={1.5}
      strokeDasharray="6 4"
      pointerEvents="none"
    />
  );
}

/**
 * LES QUATRE POIGNÉES D'UNE PIÈCE NEUVE — elles suivent leurs bords en vol.
 *
 * L'étirement se montre en vol (voir `SideHandle`) : le plan ne se rend
 * plus, et des poignées calculées par lui resteraient où le geste a
 * commencé pendant que le bord s'en va sous le doigt. Elles lisent donc le
 * vol : le contour de la pièce se décale de ce dont ses murs ont bougé, bord
 * par bord.
 */
function PoigneesDeLaPiece({
  roomId,
  contour,
  murs,
  mapping,
}: {
  roomId: string;
  contour: Pt[];
  murs: WallSeg[];
  mapping: EffMapping;
}) {
  const vol = usePlanEnVol((st) => st.plan?.murs ?? null);
  const boite = (pts: Pt[]) => {
    const xs = pts.map((q) => q.x);
    const zs = pts.map((q) => q.z);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  };
  const ici = boite(contour);
  let { x0, x1, z0, z1 } = ici;
  if (vol && murs.length > 0) {
    const coins = (ws: WallSeg[]) => ws.flatMap((w) => [w.a, w.b]);
    const avant = boite(coins(murs));
    const apres = boite(coins(murs.map((w) => vol.get(w.id) ?? w)));
    x0 += apres.x0 - avant.x0;
    x1 += apres.x1 - avant.x1;
    z0 += apres.z0 - avant.z0;
    z1 += apres.z1 - avant.z1;
  }
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
        const inclinaison = (Math.atan2(long.y - m.y, long.x - m.x) * 180) / Math.PI;
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
            roomId={roomId}
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
 * GLISSER PLUSIEURS MEUBLES ENSEMBLE — manque proposé par l'agent testeur
 * MEUBLES. Une poignée sur la boîte de l'ensemble : le doigt donne un
 * déplacement depuis l'appui, chaque meuble part de SA position de départ,
 * et au lâcher chacun se range (hors des murs, hors des voisins). Tout le
 * geste est un seul « Annuler » (clé continue, voir `deplacerMeubles`). Un
 * appui sans glisser rend la main à l'écran (`onTap`) : il ajoute ou retire
 * le meuble touché.
 */
export function GroupeDragHandle({
  ids,
  box,
  mapping,
  onTap,
}: {
  ids: string[];
  box: { x: number; y: number; w: number; h: number };
  mapping: EffMapping;
  onTap?: (p: { x: number; y: number }) => void;
}) {
  const live = useRef({ ids, mapping, onTap, box });
  live.current = { ids, mapping, onTap, box };
  const seuil = useRef(creerSeuil()).current;
  const depart = useRef<Record<string, { x: number; z: number }>>({});
  const dernier = useRef<{ dx: number; dz: number } | null>(null);
  const appui = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          seuil.reprendre();
          dernier.current = null;
          const b = live.current.box;
          appui.current = { x: b.x + e.nativeEvent.locationX, y: b.y + e.nativeEvent.locationY };
          const objets = useScanStore.getState().objects;
          depart.current = Object.fromEntries(
            objets
              .filter((o) => live.current.ids.includes(o.id))
              .map((o) => [o.id, { x: o.transform[12], z: o.transform[14] }]),
          );
        },
        onPanResponderMove: (_e, g) => {
          if (!seuil.franchi(g.dx, g.dy)) return;
          const d = live.current.mapping.deltaToMeters(g.dx, g.dy);
          dernier.current = { dx: d.x, dz: d.z };
          useScanStore.getState().deplacerMeubles(live.current.ids, d.x, d.z, { depuis: depart.current });
        },
        onPanResponderRelease: () => {
          const d = dernier.current;
          if (d) {
            useScanStore.getState().deplacerMeubles(live.current.ids, d.dx, d.dz, { depuis: depart.current, ranger: true });
            finirLeGeste();
          } else {
            live.current.onTap?.(appui.current);
          }
          dernier.current = null;
        },
        onPanResponderTerminate: () => {
          const d = dernier.current;
          if (d) useScanStore.getState().deplacerMeubles(live.current.ids, d.dx, d.dz, { depuis: depart.current, ranger: true });
          dernier.current = null;
        },
      }),
    [seuil],
  );
  return (
    <View
      {...pan.panHandlers}
      testID="glisser-les-meubles"
      accessibilityLabel="Glisser les meubles choisis"
      style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h }}
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

    LA PIÈCE AUSSI, désormais — relevé des testeurs : « chaque image d'un
    côté tiré redessine deux fois tout l'écran et tout l'éditeur ». Son
    étirement est montré en vol (`volerLAction`, voir `store/planEnVol`) et
    `resizeRoomSide` n'est écrit qu'au lâcher, depuis la même emprise de
    départ.
  */
  const poserLEtirement = useMemo(
    () => () => {
      const total = dernierEtirement.current;
      dernierEtirement.current = null;
      if (roomId) {
        const dep = departPiece.current;
        // Rien de montré en vol : ce n'est pas elle qui tient la pièce.
        if (total === null) return;
        atterrir(dep ? (st) => st.resizeRoomSide(roomId, cote, total, dep) : undefined);
        return;
      }
      const base = depart.current;
      // Rien de montré en vol : ce n'est pas elle qui tient le meuble.
      if (!objectId || total === null) return;
      if (base) useScanStore.getState().resizeObjectSide(objectId, cote, total, base);
      if (useEnVol.getState().objet?.id === objectId) mettreEnVol(null);
    },
    [objectId, roomId, cote],
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
            // à faire vibrer. Montrée en vol, écrite au lâcher.
            if (volerLAction((st) => st.resizeRoomSide(roomId, cote, total, dep))) {
              dernierEtirement.current = total;
            }
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
          // La pièce est posée ET son geste fermé par `atterrir`.
          poserLEtirement();
          // Un seul rendu au lâcher, analyses à jour (voir la poignée de
          // déplacement).
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
  /*
    LE MUR TOURNE EN VOL — comme le coin tiré : `setWallAngle` est montré à
    chaque image (`volerLAction`) et n'est écrit qu'au lâcher, avec le
    dernier angle montré. La poignée suit son mur en vol ; le plan, lui, ne
    se rend plus.
  */
  const enVol = usePlanEnVol((st) => st.plan?.murs.get(wall.id) ?? null);
  const dernierAngle = useRef<{ id: string; deg: number } | null>(null);
  const poserLAngle = useMemo(
    () => () => {
      const d = dernierAngle.current;
      if (!d) return;
      dernierAngle.current = null;
      atterrir((st) => st.setWallAngle(d.id, d.deg));
    },
    [],
  );
  useEffect(() => () => poserLAngle(), [poserLAngle]);
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
          dernierAngle.current = null;
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
          if (volerLAction((st) => st.setWallAngle(w.id, final))) {
            dernierAngle.current = { id: w.id, deg: final };
            const apres = usePlanEnVol.getState().plan?.murs.get(w.id);
            if (apres) setAngle(angleDe(apres));
          } else {
            // Revenu à son angle de départ : rien à poser, rien en vol.
            if (dernierAngle.current) atterrir();
            dernierAngle.current = null;
            setAngle(angleDe(w));
          }
        },
        onPanResponderRelease: () => {
          poserLAngle();
          setAngle(null);
        },
        onPanResponderTerminate: () => {
          poserLAngle();
          setAngle(null);
        },
      }),
    [seuil, poserLAngle],
  );
  const at = poigneeAt(enVol ?? wall, mapping, sens, borne);
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

/**
 * Où se pose la croix du mur choisi : à côté de sa poignée de rotation, à
 * quarante points le long du mur, vers son bout le plus éloigné du bord
 * de l'écran.
 */
export function croixDuMurAt(
  w: WallSeg,
  m: EffMapping,
  sens: 1 | -1 = 1,
  borne?: { w: number; h: number },
): { x: number; y: number } {
  const p = poigneeAt(w, m, sens, borne);
  const a = m.toPx(w.a);
  const b = m.toPx(w.b);
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  const pose = (s: number) => ({ x: p.x + u.x * 40 * s, y: p.y + u.y * 40 * s });
  const dedans = (q: { x: number; y: number }) =>
    !borne || (q.x >= 21 && q.x <= borne.w - 21 && q.y >= 21 && q.y <= borne.h - 21);
  const q = pose(1);
  return dedans(q) ? q : pose(-1);
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
  /*
    LE COIN SE TIRE EN VOL — relevé des testeurs : « chaque image d'un coin
    tiré redessine deux fois tout l'écran et tout l'éditeur ». Il écrivait
    le magasin à chaque image ; il montre maintenant ce qu'écrirait
    `moveWallPoint` (`volerLAction`), et ne l'écrit qu'au lâcher — depuis le
    même coin de départ, donc exactement ce que montrait la dernière image.
    Le coin visé n'est plus repris d'une image sur l'autre : une soudure
    frôlée en chemin ne colle plus le coin au mur d'à côté.
  */
  const vise = useRef<Pt | null>(null);
  const poser = useMemo(
    () => () => {
      const p = vise.current;
      // Rien de montré : ce n'est pas elle qui tient le plan en vol.
      if (!p) return;
      vise.current = null;
      const { wallId, end } = cible.current;
      atterrir((st) => st.moveWallPoint(wallId, end, p));
    },
    [],
  );
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
          vise.current = null;
          const c = live.current.corner;
          startRef.current = { x: c.x, z: c.z };
          cible.current = { wallId: c.wallId, end: c.end };
        },
        // Un appui n'a rien tiré : c'est un appui sur le mur, il le relâche.
        onPanResponderRelease: () => {
          poser();
          if (!tire.current) live.current.onTap?.();
        },
        onPanResponderTerminate: () => poser(),
        onPanResponderMove: (_e, g) => {
          if (!seuil.franchi(g.dx, g.dy)) return;
          tire.current = true;
          const d = live.current.mapping.deltaToMeters(g.dx, g.dy);
          const p = { x: startRef.current.x + d.x, z: startRef.current.z + d.z };
          const { wallId, end } = cible.current;
          if (volerLAction((st) => st.moveWallPoint(wallId, end, p))) vise.current = p;
        },
      }),
    [seuil, poser],
  );
  // Une poignée qui s'en va en plein geste pose ce qu'elle montrait.
  useEffect(() => () => poser(), [poser]);
  // Le coin suit le doigt sans que le plan se rende : il lit son mur en vol.
  const enVol = usePlanEnVol((st) => st.plan?.murs.get(corner.wallId)?.[corner.end] ?? null);

  const px = mapping.toPx(enVol ?? corner);
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
  /** La croix du mur choisi : la pastille rouge du meuble, à la taille de la rotation. */
  wallDelete: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B0D12',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
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
