/**
 * Face au mur — l'établi de l'électricien.
 *
 * Un plan vu de dessus ne dit rien d'une hauteur, et une vue 3D en
 * perspective ne se cote pas : pour poser une prise, il faut se mettre
 * DEVANT le mur, bien à plat. C'est tout ce que fait cet écran — un seul
 * mur, vu de face, à l'échelle, avec ses portes et ses fenêtres, et les
 * trois cotes qui comptent : depuis la gauche, depuis la droite, depuis le
 * sol.
 *
 * On déplace l'appareil au doigt et les cotes suivent ; on tape une valeur
 * et l'appareil suit. Le doigt est imprécis, donc le geste s'arrête sur les
 * repères qui comptent — hauteur usuelle du type d'appareil, alignement avec
 * un appareil déjà posé, milieu du mur — et le repère s'affiche pendant
 * qu'on y est accroché.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Polygon,
  Stop,
  LinearGradient,
  Defs,
  Text as SvgText,
} from 'react-native-svg';
import {
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { OndeePose, useNaissances } from './Vivant';
import {
  estTraversante,
  roomOf,
  roomParts,
  segLength,
  wallQuadsOf,
  wallRuns,
} from '../geometry/floorplan';
import {
  BOITE_D,
  ENTRAXE,
  PLAQUE,
  PLATE_SIDES,
  overlaps,
  plateSlot,
  socketsOf,
  type PlateSide,
  FIXTURES as SPECS,
  boxOffsets,
  masonryAxes,
  masonryRuns,
  placeRepetee,
  postsOf,
  COMMANDES_MURALES,
  FIXTURE_FAMILIES,
  seCommande,
  type FixtureKind,
} from '../geometry/electrical';
import {
  avancementDesPieces,
  checkElectrical,
  fixturePlacement,
  heightRuleAt,
  wallFurniture,
  worktopsOnWall,
  requirementFor,
  roomInputsOf,
  usageConnu,
  roomUse,
  wallToRooms,
} from '../geometry/nfc15100';
import { assignOpenings } from '../geometry/scene3d';
import { empriseDuCoffre } from '../geometry/floorplan';
import {
  FIXTURES,
  faceX,
  faceXofT,
  fromFaceX,
  interiorSide,
  wallFace,
  type Fixture,
} from '../geometry/electrical';
import { RoomScan } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';
import { useModeElec } from '../store/usage';
import { haptic } from '../ui/haptic';
import { CalquePhotoFond, CalquePhotoPoignee } from './CalquePhoto';
import { SOLAIRES } from '../ui/solaires';
import { CloseCross } from './CloseCross';
import { AppareilDeFace, DefsAppareils, empriseDeFace } from './AppareilDeFace';
import { posesDUnLot, postesDuLot, type PoseDAppareil } from '../geometry/appareils3d';
import { VignetteAppareil } from './VignetteAppareil';
import { wallLabel } from '../geometry/naming';
import { frCategory } from '../geometry/furniture';
import { Sofa } from 'lucide-react-native';

const PAD_X = 30;
/**
 * La marge du haut doit contenir la COTE ET SON NOMBRE.
 *
 * Relevé du chantier : « la longueur du mur, sa cote est cachée en haut du
 * bloc ». La ligne de cote se pose à `COTE_H` au-dessus du plafond et la
 * marge en valait autant : le nombre écrit dessus débordait du cadre, et
 * « 2,72 m » sortait coupé dans le sens de la hauteur. Une marge doit
 * contenir ce qu'elle marge — le texte compte, pas seulement le trait.
 */
export const PAD_TOP = 42;
/** Fuite du relief : l'épaisseur du mur, en pixels d'écran. */
const FUITE = 9;
/** Hauteur de la ligne de cote au-dessus du plafond. */
export const COTE_H = 26;

/**
 * Les hauteurs de référence d'une installation, en mètres.
 *
 * Ce ne sont pas des décorations : ce sont les quatre lignes sur lesquelles
 * tout se pose. Les voir en filigrane fait repérer d'un coup l'appareil qui
 * n'est aligné avec rien.
 */
const HAUTEURS_REF = [
  { y: 0.25, nom: 'plinthe 25', court: 'pli 25', chiffre: '25' },
  { y: 1.1, nom: 'commande 110', court: 'com 110', chiffre: '110' },
  { y: 1.35, nom: 'tableau 135', court: 'tab 135', chiffre: '135' },
  { y: 2.1, nom: 'applique 210', court: 'app 210', chiffre: '210' },
];

/**
 * LE LIBELLÉ D'UNE HAUTEUR SE MET DANS LA MARGE, PAS SUR LE MUR.
 *
 * Défaut relevé et laissé ouvert longtemps : « les libellés de hauteur se
 * serrent contre le bord droit du mur ». Ils étaient écrits DANS le champ,
 * calés sur le bord droit — « commande 110 » fait une cinquantaine de points
 * à huit de corps, soit près d'un mètre de mur recouvert, à quatre hauteurs,
 * et toutes du même côté : celui où la place manque toujours.
 *
 * Ils passent donc dehors, dans la marge que le cadre garde déjà. Elle vaut
 * trente points au plus serré, et le mot entier en demande cinquante : on
 * l'abrège plutôt que de le laisser mordre. Trois lettres suffisent à un
 * électricien pour distinguer une plinthe d'une commande — et si même cela
 * ne tient pas, il reste le CHIFFRE, qui est ce qu'on vient lire.
 */
export function libelleDeHauteur(
  r: { nom: string; court: string; chiffre: string },
  place: number,
  corps: number,
): string {
  // Une lettre de ce corps-là mesure un peu plus de la moitié de sa hauteur.
  const large = (mot: string) => mot.length * corps * 0.55;
  if (large(r.nom) + 6 <= place) return r.nom;
  if (large(r.court) + 6 <= place) return r.court;
  return r.chiffre;
}
const PAD_BOTTOM = 34;
/** Tolérance d'accrochage, en mètres. */
const SNAP = 0.03;

const cm = (m: number) => Math.round(m * 100);

import type { ActionData } from './Sheet';
import { alerte } from '../ui/alerte';

interface Props {
  wallId: string;
  /**
   * L'abscisse du RETOUR choisi sur le plan, sur la face, en mètres.
   *
   * On choisit un tableau de porte sur le plan, on demande « Élec », et
   * le mur entier s'ouvre : plus rien ne dit lequel des trois morceaux de
   * maçonnerie on visait. Le retour qui contient ce point se dessine
   * donc en bleu, cote comprise.
   */
  focusX?: number | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Rend l'appareil tenu au parent pour nouer son lien SUR LE PLAN : on
   * ferme l'établi, puis on touche l'interrupteur qui le commande — le
   * même geste que pour une ligne de spots.
   */
  onLinkRequest?: (fixtureId: string) => void;
  onClose: () => void;
  /**
   * COMMENT POSER UNE QUESTION — l'écran qui nous porte sait le faire.
   *
   * L'établi n'a pas de feuille à lui : il vit DANS l'écran des résultats,
   * qui en a une (voir `ActionSheet`). Il lui passe donc sa façon d'ouvrir
   * une question, plutôt que de tomber sur l'alerte du système.
   */
  onDemander?: (data: ActionData) => void;
}

export function WallElevation({
  wallId,
  focusX,
  selectedId,
  onSelect,
  onLinkRequest,
  onClose,
  onDemander,
}: Props) {
  const walls = useScanStore(s => s.walls);
  const openings = useScanStore(s => s.openings);
  const rooms = useScanStore(s => s.rooms);
  const fixtures = useScanStore(s => s.fixtures);
  const moveFixture = useScanStore(s => s.moveFixture);
  const addFixture = useScanStore(s => s.addFixture);
  const flipFixture = useScanStore(s => s.flipFixture);
  const basculerPontage = useScanStore(s => s.basculerPontage);
  const removeFixture = useScanStore(s => s.removeFixture);
  const repeterFixture = useScanStore(s => s.repeterFixture);
  const placeAssembly = useScanStore(s => s.placeAssembly);
  const splitFixture = useScanStore(s => s.splitFixture);
  const pendingJoin = useScanStore(s => s.pendingJoin);
  const objects = useScanStore(s => s.objects);
  const addPhoto = useScanStore(s => s.addPhoto);
  const photos = useScanStore(s => s.photos);
  const setPhotoCalage = useScanStore(s => s.setPhotoCalage);
  const north = useScanStore(s => s.north);
  const clearPendingJoin = useScanStore(s => s.clearPendingJoin);
  const c = useTheme();
  const styles = getStyles(c);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  /*
    LE CALQUE PHOTO — l'avant/après du chantier.

    Le rideau s'ouvre à MOITIÉ quand on allume le calque : ouvert en grand,
    on ne voit plus le dessin qu'on est venu faire ; fermé, on ne voit pas
    qu'il s'est passé quelque chose. À moitié, les deux se comparent d'un
    coup d'œil, ce qui est tout l'objet.
  */
  const [calque, setCalque] = useState(false);
  const [rideau, setRideau] = useState(0.5);
  const [calant, setCalant] = useState(false);
  /** La hauteur de l'écran : c'est elle qui borne le dessin. */
  /*
    LA BARRE D'ACCUEIL EST UNE MESURE, PAS UNE CONSTANTE : trente-quatre
    points sur un iPhone récent, zéro sur un iPhone à bouton, et le téléphone
    est le seul à savoir lequel il est.
  */
  const margesSysteme = useSafeAreaInsets();
  /** L'horloge de l'appui maintenu, et celle qui efface le trait d'aide. */
  const tenir = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effaceGuide = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Un écran qu'on quitte ne doit pas laisser une horloge derrière lui.
  useEffect(
    () => () => {
      if (tenir.current) clearTimeout(tenir.current);
      if (effaceGuide.current) clearTimeout(effaceGuide.current);
    },
    [],
  );
  const restoreFixtures = useScanStore(st => st.restoreFixtures);
  /**
   * L'APPAREILLAGE TEL QU'ON A OUVERT LE MUR.
   *
   * Tout ce qu'on fait ici part dans le plan à l'instant même — c'est ce
   * qui permet de voir la cote bouger en glissant le doigt. La croix
   * n'avait donc rien à fermer : elle laissait tout en place, et rien ne
   * disait comment revenir en arrière après une pose à côté. On garde
   * l'état de départ : la croix le remet, le bouton d'enregistrement le
   * jette.
   */
  const depart = useRef<Fixture[] | null>(null);
  if (depart.current === null) depart.current = fixtures;
  const modifie = fixtures !== depart.current;
  const [guide, setGuide] = useState<{ x?: number; y?: number }>({});
  /**
   * LA POSITION VIVANTE DU GLISSEMENT, en mètres de face — relevé du
   * patron : « il faut viser avec le doigt sans bien voir ce que l'on
   * fait ». Les trois cotes du sélectionné se dessinent autour de lui,
   * c'est-à-dire sous la main qui le déplace. Tant qu'elle est posée, un
   * réticule traverse la face et une loupe flotte au-dessus du doigt avec
   * les cotes en gros. Le doigt levé, le mur redevient calme.
   */
  const [traine, setTraine] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<'g' | 'd' | 'h' | null>(null);
  /** Pas du réglage fin : le centimètre, ou les cinq centimètres. */
  const [pas, setPas] = useState(0.01);
  /** Deux appareils posés au même endroit : on propose de les réunir. */
  const [fusion, setFusion] = useState<{
    moved: string;
    base: string;
    /** Axe du PREMIER appareil au moment où l'ensemble s'est formé. */
    axe: number;
    cote: PlateSide;
    /** true = l'ensemble est centré sur cet axe ; false = le premier y reste. */
    centre: boolean;
  } | null>(null);
  const [draft, setDraft] = useState('');
  /**
   * La règle complète, repliée par défaut.
   *
   * On la lit une fois, quand on conteste le constat ; la relire à chaque
   * pose coûte le tiers de l'écran pour rien.
   */
  const [regleOuverte, setRegleOuverte] = useState(false);
  /** Les meubles du mur, en creux. Montrés d'emblée : c'est une surprise
   *  qu'on veut avoir AVANT de percer, pas après. */
  const [voirMeubles, setVoirMeubles] = useState(true);
  /** La famille ouverte dans le dock des appareils. */
  const [famille, setFamille] = useState(0);

  const wall = walls.find(w => w.id === wallId) ?? null;
  const mine = useMemo(
    () => fixtures.filter(f => f.wallId === wallId),
    [fixtures, wallId],
  );
  /* Les poses se voient naître ici aussi — voir `Vivant`. */
  const nes = useNaissances(mine.map(f => f.id));
  const selected = mine.find(f => f.id === selectedId) ?? null;

  // La face qu'on regarde est celle de l'appareil sélectionné : le retourner
  // fait donc passer la vue de l'autre côté, ce qui est exactement le geste
  // attendu quand on met une prise dos à dos.
  const side = selected?.side ?? (wall ? interiorSide(wall, walls, rooms) : 1);
  const face = useMemo(
    () => (wall ? wallFace(wall, wallQuadsOf(walls).get(wall.id), side) : null),
    [wall, walls, side],
  );

  /**
   * LES RETOURS DE MAÇONNERIE DE CETTE FACE.
   *
   * Un mur percé n'est pas une surface : c'est un retour, un trou, un
   * retour. Et c'est précisément sur ces trente centimètres entre
   * l'angle et l'huisserie qu'on pose l'interrupteur d'entrée — donc
   * là qu'il faut une cote et un axe, comme le mur entier a sa longueur
   * et son milieu. Le store recalait déjà l'appareil sur la maçonnerie
   * (`snapToMasonry`), mais en silence : rien ne montrait ni la largeur
   * du retour, ni son milieu, et on posait à l'œil en croyant viser.
   */
  const retours = useMemo(() => {
    if (!wall || !face) return [];
    const runs = masonryRuns(wallRuns(wall, openings), segLength(wall), face);
    // Un seul plein = le mur entier : il a déjà sa cote et son milieu.
    return runs.length > 1 ? runs : [];
  }, [wall, face, openings]);

  /**
   * La hauteur du cadre suit les proportions du mur.
   *
   * On la calcule à partir de la largeur mesurée, une fois pour toutes :
   * la largeur d'une feuille ne dépend pas de sa hauteur, il n'y a donc
   * pas de boucle à craindre.
   */

  /**
   * ET SI ÇA DÉBORDE QUAND MÊME, ON RABOTE — mesuré, pas deviné.
   *
   * Relevé du patron, capture à l'appui : sur un mur étroit — trente-trois
   * centimètres de large pour deux mètres cinquante de haut — la feuille
   * descendait sous le bas de l'écran et le bouton « Enregistrer » était
   * coupé en deux.
   *
   * La réserve ci-dessus est une ESTIMATION de ce que prennent les
   * commandes, et une estimation se trompe : le bandeau de conformité
   * apparaît ou non, l'ensemble de fusion aussi, et un téléphone étroit
   * fait passer une rangée de boutons sur deux lignes. Plutôt que d'ajuster
   * le chiffre au jugé — il l'a déjà été deux fois —, on regarde ce que la
   * feuille MESURE une fois rendue, et on rend au dessin ce qui dépasse.
   *
   * Le raccourci ne peut que RÉTRÉCIR le cadre : rétrécir réduit la hauteur
   * totale, donc le débord, donc l'ajustement suivant. Il converge en une
   * passe et ne peut pas se mettre à battre.
   */

  /**
   * Y A-T-IL DE QUOI PONTER ? — une prise voisine sur le même pan.
   *
   * Le bouton de pontage ne s'affiche que si la question se pose. On cherche
   * donc une AUTRE prise, sur le même mur, la même face, et le même tronçon
   * plein : une porte entre les deux les sépare, la gaine ne traverse pas
   * une menuiserie. C'est la règle du métré (`planRoutes`), reprise ici pour
   * que l'écran ne propose jamais ce que le calcul refusera.
   */
  const voisinePontable = useMemo(() => {
    if (!selected || selected.kind !== 'prise' || !wall) return null;
    const L = segLength(wall) || 1;
    const pans = wallRuns(wall, openings);
    const panDe = (along: number) =>
      pans.findIndex(
        r =>
          r.kind === 'mur' &&
          along / L >= r.t0 - 1e-6 &&
          along / L <= r.t1 + 1e-6,
      );
    const mien = panDe(selected.along);
    return (
      fixtures.find(
        f =>
          f.id !== selected.id &&
          f.kind === 'prise' &&
          f.wallId === selected.wallId &&
          f.side === selected.side &&
          panDe(f.along) === mien,
      ) ?? null
    );
  }, [selected, wall, openings, fixtures]);

  const holes = useMemo(() => {
    if (!wall || walls.length === 0) return [];
    const floorY = Math.min(...walls.map(w => w.yCenter - w.height / 2));
    return assignOpenings(walls, openings, floorY).get(wall.id) ?? [];
  }, [wall, walls, openings]);

  // ------------------------------------------------- guide de conformité
  // Poser une prise sans savoir combien la pièce en exige, c'est compter
  // dans sa tête. L'app le fait : elle annonce l'objectif, montre où on en
  // est, et rappelle la règle en une ligne.
  /*
    LA NORME NE PARLE QU'À L'ÉLECTRICIEN — relevé du patron : « les normes
    qui concernent l'électricité ne doivent pas être comptées » hors du mode
    Électricité. Le plan les taisait déjà ; la page du mur, elle, comptait
    encore ses socles et ses « points à revoir ».
  */
  const modeElec = useModeElec();
  const objectif = useMemo(() => {
    if (!modeElec) return null;
    const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
    const w2r = wallToRooms(inputs);
    const mien = inputs.find(r => (w2r.get(wallId) ?? []).includes(r.id));
    if (!mien) return null;
    const req = requirementFor(roomUse(mien.name, mien.kind), mien.area);
    if (req.socles === 0) return null;
    const pose = fixturePlacement(fixtures, walls, inputs);
    const socles = (f: (typeof fixtures)[number]) =>
      pose.get(f.id) === mien.id ? socketsOf(f.kind) : 0;
    /*
      LE MÊME COMPTE QUE L'ANNEAU DU PLAN — `avancementDesPieces`. Il se
      lit à deux endroits sur le même écran, à trente centimètres l'un de
      l'autre : deux comptages du même nombre finissent par diverger, et
      c'est l'utilisateur qui arbitre entre deux vérités.
    */
    const poses =
      avancementDesPieces(rooms, walls, fixtures).get(mien.id)?.poses ??
      fixtures.reduce((n, f) => n + socles(f), 0);
    // Cuisine : ce sont les socles du plan de travail qui manquent en
    // premier, et ceux-là se posent à 1,10 m, pas en plinthe.
    const hauts = fixtures.reduce(
      (n, f) => n + (f.height >= 0.9 ? socles(f) : 0),
      0,
    );
    return {
      nom: mien.name || 'Cette pièce',
      poses,
      exiges: req.socles,
      regle: req.regle,
      surPlan: req.surPlan > hauts,
      /*
        ET L'ON DIT QUAND ON NE SAIT PAS.

        `roomUse` rend « autre » faute de mieux, et « autre » n'exige qu'un
        socle : une pièce sans nom affichait donc « 2/1 socle », c'est-à-dire
        CONFORME, alors que la même pièce nommée « Chambre » en exige trois.
        Le relevé passait, le chantier non.
      */
      inconnu: !usageConnu(mien.name, mien.kind),
    };
  }, [modeElec, rooms, walls, fixtures, wallId]);

  /**
   * Les autres constats de la pièce — ceux que le bandeau d'objectif et
   * l'avertissement de hauteur ne disent pas déjà. C'est ici qu'ils doivent
   * paraître : on a ouvert ce mur PARCE QU'il est en défaut, il serait
   * absurde de renvoyer ailleurs pour savoir lequel.
   */
  const constats = useMemo(() => {
    if (!modeElec) return [];
    const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
    const w2r = wallToRooms(inputs);
    const miens = w2r.get(wallId) ?? [];
    return checkElectrical(
      inputs,
      fixtures,
      w2r,
      fixturePlacement(fixtures, walls, inputs),
    ).filter(
      i =>
        i.severity === 'alerte' &&
        i.code !== 'socles' &&
        i.code !== 'hauteur' &&
        !!i.roomId &&
        miens.includes(i.roomId),
    );
  }, [modeElec, rooms, walls, fixtures, wallId]);

  // ------------------------------------------------------------- échelle
  const H = wall?.height ?? 2.5;
  const scale =
    face && layout.w > 0 && layout.h > 0
      ? Math.min(
          (layout.w - 2 * PAD_X) / face.len,
          (layout.h - PAD_TOP - PAD_BOTTOM) / H,
        )
      : 0;
  const originX = face ? (layout.w - face.len * scale) / 2 : 0;
  const originY = layout.h - PAD_BOTTOM;
  const px = (x: number) => originX + x * scale;
  const py = (y: number) => originY - y * scale;

  /*
    LES APPAREILS DE LA FACE, EN VRAI — une pose par plaque (ou par appareil
    hors gabarit), d'après la même fabrique que la maquette 3D.

    JAMAIS SOUS TRENTE POINTS — relevé du patron : « ça paraît petit,
    inadapté ». Une plaque de 8,2 cm à l'échelle d'un mur de cinq mètres fait
    six points ; elle est agrandie autour de son centre, d'UN SEUL facteur :
    une prise reste carrée, une double prise deux fois plus large que haute.
    Un tableau, lui, est assez grand pour garder l'échelle du mur.
  */
  const { dessins, emprises } = useMemo(() => {
    const d: { pose: PoseDAppareil; k: number }[] = [];
    const e: { id: string; x: number; y: number; w: number; h: number }[] = [];
    if (!face || scale <= 0) return { dessins: d, emprises: e };
    const lots = new Map<string, Fixture[]>();
    for (const f of mine) {
      if (f.side !== side) continue;
      const cle = f.group ? `g:${f.group}` : `s:${f.id}`;
      const l = lots.get(cle);
      if (l) l.push(f);
      else lots.set(cle, [f]);
    }
    for (const lot of lots.values()) {
      const poses = posesDUnLot(
        lot.map(f => f.id).join('+'),
        wallId,
        postesDuLot(lot, f => faceX(face, f.along)),
        (x, y) => ({ x, y, z: 0 }),
        { nx: 0, nz: 1 },
      );
      for (const pose of poses) {
        const tour = empriseDeFace(pose);
        // Trente-deux points, pas trente pile : le facteur se calcule en
        // flottants, et une plaque à 29,999 points tomberait sous la règle.
        const k = Math.max(scale, (32 * 100) / Math.min(tour.w, tour.h));
        d.push({ pose, k });
        const ox = originX + pose.x * scale;
        const oy = originY - pose.y * scale;
        if (pose.genre !== 'plaque') {
          e.push({ id: pose.id, x: ox, y: oy, w: (tour.w * k) / 100, h: (tour.h * k) / 100 });
          continue;
        }
        const ids = new Set((pose.postes ?? []).map(q => q.source ?? pose.id));
        for (const id of ids) {
          const siens = (pose.postes ?? []).filter(q => (q.source ?? pose.id) === id);
          const dx = siens.reduce((t, q) => t + q.dx, 0) / siens.length;
          const dy = siens.reduce((t, q) => t + q.dy, 0) / siens.length;
          const xs = siens.map(q => q.dx);
          const larg = Math.max(...xs) - Math.min(...xs) + PLAQUE;
          e.push({ id, x: ox + dx * k, y: oy - dy * k, w: larg * k, h: PLAQUE * k });
        }
      }
    }
    return { dessins: d, emprises: e };
  }, [face, scale, mine, side, wallId, originX, originY]);

  // Le PanResponder se crée une fois : il lit l'état courant dans une boîte
  // mise à jour à chaque rendu, sinon il travaillerait sur des valeurs figées.
  const live = useRef({
    mine,
    face,
    scale,
    H,
    px,
    py,
    selectedId,
    retours,
    move: moveFixture,
    select: onSelect,
  });
  live.current = {
    mine,
    face,
    scale,
    H,
    px,
    py,
    selectedId,
    retours,
    move: moveFixture,
    select: onSelect,
  };
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);

  const snapTo = (v: number, targets: number[]) => {
    let best: number | null = null;
    let bd = SNAP;
    for (const t of targets) {
      const d = Math.abs(v - t);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const L = live.current;
        if (!L.face || L.scale <= 0) return;
        const tx = e.nativeEvent.locationX;
        const ty = e.nativeEvent.locationY;
        // L'appareil le plus proche du doigt, à portée de POUCE : 44 px,
        // la cible minimale d'iOS. À 34 on ratait une prise sur trois, et
        // on désélectionnait au lieu de saisir.
        let best: Fixture | null = null;
        let bd = 44;
        for (const f of L.mine) {
          const d = Math.hypot(
            L.px(faceX(L.face, f.along)) - tx,
            L.py(f.height) - ty,
          );
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
        if (!best) {
          /**
           * L'APPUI À VIDE NE DÉSÉLECTIONNE PLUS.
           *
           * Il lâchait l'appareil tenu : le titre repassait à « Face au
           * mur », le bandeau de cotes disparaissait, et toute la fenêtre
           * se réorganisait sous les doigts. Or on touche le mur pour
           * viser, pas pour abandonner — et on rate la prise une fois sur
           * trois. On garde donc la sélection : elle change en touchant un
           * AUTRE appareil, et se termine en fermant la fenêtre.
           */
          drag.current = null;
          return;
        }
        drag.current = {
          id: best.id,
          x: faceX(L.face, best.along),
          y: best.height,
        };
        if (best.id !== L.selectedId) L.select(best.id);
      },
      onPanResponderMove: (_e, g) => {
        const L = live.current;
        const d = drag.current;
        if (!d || !L.face || L.scale <= 0) return;
        const spec = FIXTURES[L.mine.find(f => f.id === d.id)?.kind ?? 'prise'];
        let x = d.x + g.dx / L.scale;
        let y = d.y - g.dy / L.scale;
        // Repères : hauteur usuelle du type posé, alignement avec les autres
        // appareils du mur, milieu du mur.
        const others = L.mine.filter(f => f.id !== d.id);
        // L'axe de chaque retour assez large pour recevoir la plaque
        // entière : la règle est écrite une seule fois, dans la géométrie.
        const axes = masonryAxes(L.retours, spec.w);
        const sx = snapTo(x, [
          ...others.map(f => faceX(L.face!, f.along)),
          ...axes,
          L.face.len / 2,
        ]);
        const sy = snapTo(y, [spec.std, ...others.map(f => f.height)]);
        if (sx !== null) x = sx;
        if (sy !== null) y = sy;
        x = Math.round(x * 100) / 100;
        y = Math.round(y * 100) / 100;
        setGuide({ x: sx ?? undefined, y: sy ?? undefined });
        setTraine({ x, y });
        L.move(d.id, fromFaceX(L.face, x), y);
      },
      onPanResponderRelease: () => {
        const d = drag.current;
        drag.current = null;
        setGuide({});
        setTraine(null);
        // Posé SUR un autre appareil : c'est le geste qui demande à les
        // réunir sous une même plaque. On ne décide pas à sa place — on
        // demande de quel côté.
        const L = live.current;
        if (!d || !L.face) return;
        const moi = L.mine.find(f => f.id === d.id);
        if (!moi) return;
        const sous = L.mine.find(
          f =>
            f.id !== moi.id &&
            f.side === moi.side &&
            !f.group &&
            overlaps(
              { x: faceX(L.face!, moi.along), y: moi.height, kind: moi.kind },
              { x: faceX(L.face!, f.along), y: f.height, kind: f.kind },
            ),
        );
        if (sous) {
          const xb = faceX(L.face, sous.along);
          setFusion({
            moved: moi.id,
            base: sous.id,
            axe: xb,
            cote: faceX(L.face, moi.along) >= xb ? 'droite' : 'gauche',
            centre: false,
          });
        }
      },
      onPanResponderTerminate: () => {
        drag.current = null;
        setGuide({});
        setTraine(null);
      },
    }),
  ).current;

  /**
   * L'appareil qu'on vient de poser est tombé sur un autre : le store les a
   * rangés côte à côte pour que rien ne se superpose, et nous propose ici de
   * choisir le côté — ou de recentrer l'ensemble sur l'axe du premier.
   */
  useEffect(() => {
    if (!pendingJoin || !face) return;
    const base = fixtures.find(f => f.id === pendingJoin.base);
    const moved = fixtures.find(f => f.id === pendingJoin.moved);
    clearPendingJoin();
    if (!base || !moved || base.wallId !== wall?.id) return;
    const xb = faceX(face, base.along);
    const xm = faceX(face, moved.along);
    setFusion({
      moved: moved.id,
      base: base.id,
      axe: xb,
      cote:
        Math.abs(xm - xb) > 1e-6
          ? xm > xb
            ? 'droite'
            : 'gauche'
          : moved.height > base.height
          ? 'haut'
          : 'bas',
      centre: false,
    });
  }, [pendingJoin, face, fixtures, wall, clearPendingJoin]);

  /**
   * LES MEUBLES QUI SE TIENNENT DEVANT CE MUR.
   *
   * On décide où percer sur un dessin qui montre une belle surface libre,
   * là où se dresse une bibliothèque : la prise se pose, le plan part au
   * chantier, et personne ne la revoit avant d'avoir à déplacer le meuble.
   * Ils s'affichent en creux, derrière l'appareillage — et se cachent,
   * parce qu'à quatre meubles le mur ne se voit plus.
   */
  const meublesDuMur = useMemo(
    () => (face ? wallFurniture(face, objects) : []),
    [face, objects],
  );

  /** Les plans de travail que ce mur longe : ils changent la règle. */
  const plansDeTravail = useMemo(() => {
    if (!face || !wall) return [];
    const piece = rooms.find(r => r.id === roomOf(wall));
    return worktopsOnWall(
      face,
      objects,
      roomUse(piece?.name ?? '', piece?.kind) === 'cuisine',
    );
  }, [face, wall, rooms, objects]);

  if (!wall || !face) {
    return (
      <View style={[styles.page, styles.disparu]}>
        <Text style={styles.titre}>Ce mur n’existe plus</Text>
        <TouchableOpacity style={styles.garder} onPress={onClose}>
          <Text style={styles.garderMot}>Fermer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const spec = selected ? FIXTURES[selected.kind] : null;
  const selX = selected ? faceX(face, selected.along) : 0;
  /*
    Y A-T-IL UNE PLACE POUR UNE COPIE ? La MÊME réponse que celle du geste :
    `placeRepetee` décide pour les deux (voir `electrical.ts`). Deux calculs de
    la même chose finissent par diverger, et l'on afficherait alors un bouton
    qui échoue — ou l'on cacherait un geste possible.

    Pas de `useMemo` ici : on est après un retour anticipé, et un hook posé
    plus bas qu'un autre chemin de rendu est un hook qui saute.
  */
  const peutRepeter =
    selected && spec
      ? placeRepetee({
          x0: selX,
          hauteur: selected.height,
          largeur: spec.w,
          longueur: face.len,
          serie: mine
            .filter(
              o =>
                o.id !== selected.id &&
                o.side === selected.side &&
                o.kind === selected.kind &&
                Math.abs(o.height - selected.height) < 0.02,
            )
            .map(o => faceX(face, o.along)),
          occupe: mine
            .filter(o => o.side === selected.side)
            .map(o => ({ x: faceX(face, o.along), y: o.height })),
          pleins: retours,
        }) !== null
      : false;
  /**
   * Le retour QUI PORTE l'appareil tenu.
   *
   * « Mur de 3,36 m » ne renseigne pas qui pose sur un tableau de porte :
   * la seule longueur qui compte alors, c'est celle du morceau de
   * maçonnerie sous la main.
   */
  const monRetour = selected
    ? retours.find(r => selX >= r.x0 - 1e-6 && selX <= r.x1 + 1e-6) ?? null
    : null;
  /**
   * LE RETOUR QU'ON REGARDE — celui que la photo va montrer.
   *
   * Relevé du patron : « un retour de mur doit aussi pouvoir avoir sa
   * photo, sans prendre tout le mur ». C'est le pan désigné sur le plan
   * (`focusX`), ou à défaut celui qui porte l'appareil tenu : dans les deux
   * cas, c'est le morceau de maçonnerie sous la main. Sans rien de tout
   * cela, la photo montre le mur entier, comme avant.
   */
  const retourVise =
    (focusX != null
      ? retours.find(r => focusX >= r.x0 && focusX <= r.x1)
      : null) ??
    monRetour ??
    null;
  /*
    Les photos déjà punaisées sur ce mur : on peut en prendre plusieurs.
    Un simple filtre, pas un `useMemo` : nous sommes ici après le retour
    anticipé du mur introuvable, et un hook ne se place pas là.
  */
  const mesPhotos = photos.filter(p => p.wallId === wallId);
  /*
    LA PHOTO DU CALQUE : LA DERNIÈRE PRISE SUR CE MUR.

    Un mur peut en porter plusieurs — un plan large, puis le détail d'un
    boîtier. La dernière est celle qu'on vient de prendre, donc celle qu'on
    veut voir ; offrir un sélecteur ferait une commande de plus pour un cas
    rare, sur un établi déjà chargé.
  */
  const photoDuCalque =
    mesPhotos.length > 0
      ? mesPhotos.reduce((a, b) => (b.at >= a.at ? b : a))
      : null;
  /** Le rectangle du mur à l'écran : c'est là, et pas ailleurs, que la
   *  photo se pose — posée n'importe où sur le cadre, elle ne se compare
   *  à rien. */
  const cadreDuMur =
    face && scale > 0
      ? { left: px(0), top: py(H), w: face.len * scale, h: H * scale }
      : null;
  const calqueVisible = calque && !!photoDuCalque && !!cadreDuMur;
  const roomName = rooms.find(r => r.id === roomOf(wall))?.name ?? '';
  /**
   * DE QUEL MUR S'AGIT-IL ? Celui du nord, celui de l'est.
   *
   * « Pièce 1 · mur de 3,36 m » ne distingue pas deux murs de même
   * longueur, et un logement en a toujours deux. L'orientation, elle, se
   * vérifie sur place — c'est aussi ce que porte désormais le dossier
   * imprimé, et les deux doivent dire la même chose.
   */
  const cardinal = (() => {
    const centre = roomParts(walls, rooms).find(
      p => p.roomId === roomOf(wall),
    )?.labelAt;
    return centre ? wallLabel(wall, centre, north) : null;
  })();

  // La règle de hauteur de l'appareil qu'on tient : c'est ici, et nulle
  // part ailleurs, qu'elle sert.
  const hauteurKO = (() => {
    if (!selected || !face) return null;
    const r = heightRuleAt(
      selected.kind,
      faceX(face, selected.along),
      plansDeTravail,
    );
    if (!r) return null;
    if (r.min !== undefined && selected.height < r.min - 1e-6) {
      return { sens: 'trop bas', regle: r.regle };
    }
    if (r.max !== undefined && selected.height > r.max + 1e-6) {
      return { sens: 'trop haut', regle: r.regle };
    }
    return null;
  })();

  /**
   * Poser l'appareil qui manque, sans quitter le mur.
   *
   * Le constat est sous les yeux, la correction doit être à portée du même
   * pouce : renvoyer au catalogue pour choisir une prise dont l'app sait
   * déjà qu'elle manque serait un détour.
   */
  const poser = (kind: FixtureKind, height?: number) => {
    const id = addFixture(kind, wallId);
    if (!id) return;
    if (height !== undefined) {
      const pose = useScanStore.getState().fixtures.find(f => f.id === id);
      if (pose) moveFixture(id, pose.along, height);
    }
    onSelect(id);
  };

  /**
   * Côtés où le second poste tient encore : à l'entraxe du premier, sans
   * sortir du mur ni tomber sur un troisième appareil. Un côté impossible
   * n'est pas proposé — plutôt que proposé puis refusé.
   */
  const cotesPossibles = (): PlateSide[] => {
    if (!fusion || !face || !wall) return [];
    const base = mine.find(f => f.id === fusion.base);
    const moved = mine.find(f => f.id === fusion.moved);
    if (!base || !moved) return [];
    const gabarit = FIXTURES[moved.kind];
    const axe = { x: fusion.axe, y: base.height };
    return PLATE_SIDES.map(s => s.key).filter(cote => {
      const p = plateSlot(axe, cote);
      if (p.x < gabarit.w / 2 || p.x > face.len - gabarit.w / 2) return false;
      if (p.y < gabarit.h / 2 || p.y > wall.height - gabarit.h / 2)
        return false;
      // Ni sur un troisième appareil déjà posé.
      return !mine.some(
        f =>
          f.id !== moved.id &&
          f.id !== base.id &&
          f.side === base.side &&
          !f.group &&
          overlaps(
            { x: p.x, y: p.y, kind: moved.kind },
            { x: faceX(face, f.along), y: f.height, kind: f.kind },
          ),
      );
    });
  };

  /**
   * Pose l'ensemble : côté choisi, et axe de référence.
   *
   * Deux façons de comprendre « à droite de la première » : la première ne
   * bouge pas et la seconde se pose à 71 mm — c'est ce que fait un
   * électricien qui ajoute une prise à une prise existante —, ou l'ensemble
   * se CENTRE sur l'axe de la première, chacune s'écartant de 35,5 mm. La
   * seconde façon garde l'axe du premier percement au milieu de la plaque,
   * ce qu'on veut quand la cote a été relevée sur un plan.
   */
  const appliquer = (cote: PlateSide, centre: boolean) => {
    if (!fusion || !face) return;
    const base = mine.find(f => f.id === fusion.base);
    if (!base) return;
    const horiz = cote === 'gauche' || cote === 'droite';
    const sens = cote === 'gauche' || cote === 'bas' ? -1 : 1;
    const demi = centre ? ENTRAXE / 2 : 0;
    const axeY = base.height;
    const bx = horiz ? fusion.axe - sens * demi : fusion.axe;
    const by = horiz ? axeY : axeY - sens * demi;
    const mx = horiz ? bx + sens * ENTRAXE : bx;
    const my = horiz ? by : by + sens * ENTRAXE;
    placeAssembly(
      fusion.base,
      fusion.moved,
      { along: fromFaceX(face, bx), height: by },
      { along: fromFaceX(face, mx), height: my },
    );
    setFusion({ ...fusion, cote, centre });
  };

  /** Défait l'ensemble : le second s'écarte de 40 cm, seul. */
  const separer = () => {
    if (!fusion || !face) return;
    const x = Math.min(face.len - 0.05, fusion.axe + 0.4);
    splitFixture(fusion.moved, fromFaceX(face, x));
    setFusion(null);
  };

  /**
   * LES TRAITS D'ALIGNEMENT VALENT AUSSI POUR LES FLÈCHES.
   *
   * Ils n'apparaissaient qu'au doigt : le glissement s'accroche aux
   * repères et les montre. Au pavé, on avançait d'un centimètre à la
   * fois à travers ces mêmes repères sans que rien ne le dise — on
   * passait DEVANT l'alignement sans le voir, et on s'arrêtait un
   * centimètre plus loin.
   *
   * Ici, pas d'accrochage : la flèche est faite pour viser au centimètre
   * près, l'aimanter serait lui retirer sa raison d'être. On se contente
   * de DIRE quand la position tombe juste, à cinq millimètres près.
   */
  const montrerAlignement = (id: string, x: number, y: number) => {
    if (!face) return;
    const autres = mine.filter(f => f.id !== id);
    const pres = (v: number, cibles: number[]) =>
      cibles.find(t => Math.abs(v - t) < 0.005);
    setGuide({
      x: pres(x, [...autres.map(f => faceX(face, f.along)), face.len / 2]),
      y: pres(
        y,
        autres.map(f => f.height),
      ),
    });
    // Le trait s'efface tout seul : il dit un instant, il ne s'installe pas.
    if (effaceGuide.current) clearTimeout(effaceGuide.current);
    effaceGuide.current = setTimeout(() => setGuide({}), 1200);
  };

  /**
   * UN PAS DE FLÈCHE, et le repère qui va avec.
   *
   * Un appui = un pas ; un appui MAINTENU = les pas s'enchaînent, de plus
   * en plus vite. Traverser un mur de trois mètres au centimètre demandait
   * trois cents appuis — personne ne le faisait, on repartait au doigt et
   * on perdait la précision qu'on était venu chercher.
   */
  const pasFleche = (dx: number, dy: number) => {
    if (!selected || !face) return;
    /**
     * La position se relit DANS LE MAGASIN, à chaque pas.
     *
     * L'appui maintenu enchaîne des pas depuis une horloge : sa fermeture
     * garde l'appareil tel qu'il était au premier pas. En repartant de
     * cette copie à chaque fois, les cent pas suivants recalculaient tous
     * la MÊME destination — le doigt restait appuyé et rien ne bougeait
     * plus.
     */
    const vif = useScanStore
      .getState()
      .fixtures.find(f => f.id === selected.id);
    if (!vif) return;
    const x = faceX(face, vif.along) + dx * pas;
    const y = vif.height + dy * pas;
    moveFixture(vif.id, fromFaceX(face, x), y);
    montrerAlignement(
      vif.id,
      Math.round(x * 100) / 100,
      Math.round(y * 100) / 100,
    );
  };

  /**
   * L'appui maintenu : le premier pas part tout de suite, puis la cadence
   * s'accélère — 380 ms d'attente pour ne pas déclencher sur un appui
   * bref, et jusqu'à 40 ms pour parcourir un mur en deux secondes.
   */
  const lancerFleche = (dx: number, dy: number) => {
    pasFleche(dx, dy);
    let attente = 380;
    const suivant = () => {
      tenir.current = setTimeout(() => {
        pasFleche(dx, dy);
        attente = Math.max(40, attente * 0.72);
        suivant();
      }, attente);
    };
    suivant();
  };
  const arreterFleche = () => {
    if (tenir.current) clearTimeout(tenir.current);
    tenir.current = null;
  };
  /** Applique une cote tapée au clavier (en cm). */
  const applyDraft = () => {
    const v = parseFloat(draft.replace(',', '.'));
    if (selected && editing && isFinite(v)) {
      const m = v / 100;
      if (editing === 'g')
        moveFixture(selected.id, fromFaceX(face, m), selected.height);
      else if (editing === 'd')
        moveFixture(
          selected.id,
          fromFaceX(face, face.len - m),
          selected.height,
        );
      else moveFixture(selected.id, selected.along, m);
    }
    setEditing(null);
  };

  const field = (key: 'g' | 'd' | 'h', label: string, value: number) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <TextInput
          style={styles.fieldInput}
          value={editing === key ? draft : selected ? String(cm(value)) : '—'}
          editable={!!selected}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          onFocus={() => {
            setEditing(key);
            setDraft(String(cm(value)));
          }}
          onChangeText={setDraft}
          onBlur={applyDraft}
          onSubmitEditing={applyDraft}
        />
        <Text style={styles.fieldUnit}>cm</Text>
      </View>
    </View>
  );

  /**
   * POSER D'UN APPUI — le dock de la page.
   *
   * On passait par un catalogue dans une seconde fenêtre, l'appareil
   * tombait à vingt centimètres du coin, puis il fallait le traîner. Il se
   * pose maintenant là où l'on regarde — au milieu du mur, ou du retour
   * visé — à sa hauteur type, sur la première place libre de part et
   * d'autre ; il arrive choisi, prêt à être glissé ou coté.
   */
  const poserIci = (kind: FixtureKind) => {
    const gabarit = FIXTURES[kind];
    const cible = retourVise
      ? (retourVise.x0 + retourVise.x1) / 2
      : face.len / 2;
    const libre = (x: number) =>
      x - gabarit.w / 2 >= 0 &&
      x + gabarit.w / 2 <= face.len &&
      !mine.some(
        f =>
          f.side === side &&
          overlaps(
            { x, y: gabarit.std, kind },
            { x: faceX(face, f.along), y: f.height, kind: f.kind },
          ),
      );
    let x = cible;
    for (let k = 0; k <= 16; k++) {
      const essais = k === 0 ? [cible] : [cible + k * 0.25, cible - k * 0.25];
      const trouve = essais.find(libre);
      if (trouve !== undefined) {
        x = trouve;
        break;
      }
    }
    const id = addFixture(kind, wallId, x);
    if (!id) return;
    onSelect(id);
    haptic('succes');
  };

  const fermerSansGarder = () => {
    if (!modifie) {
      onClose();
      return;
    }
    /*
              LA QUESTION SE POSE DANS NOTRE FEUILLE.

              Relevé du patron, capture à l'appui : « refonte de ce popup
              aussi dans notre style ». C'était une `Alert.alert` posée au
              milieu de l'établi — police système, deux boutons bleus côte à
              côte, coins de 2019 — sur un écran qui a sa typographie, ses
              rayons et son bleu.

              L'écran qui nous porte sait ouvrir nos feuilles ; il nous
              passe sa façon de le faire. Sans elle (un banc qui monte
              l'établi tout seul), on garde l'alerte : mieux vaut une
              question laide qu'un mur qu'on abandonne sans demander.
            */
    const abandonner = () => {
      if (depart.current) restoreFixtures(depart.current);
      depart.current = null;
      onClose();
    };
    if (onDemander) {
      onDemander({
        title: 'Abandonner les modifications ?',
        subtitle: 'Ce mur reviendra dans l’état où vous l’avez ouvert.',
        actions: [
          {
            label: 'Abandonner',
            hint: 'Les appareils reprennent leur place d’origine.',
            icon: 'supprimer',
            danger: true,
            onPress: abandonner,
          },
        ],
      });
      return;
    }
    alerte(
      'Abandonner les modifications ?',
      'Ce mur reviendra dans l’état où vous l’avez ouvert.',
      [
        { label: 'Continuer' },
        { label: 'Abandonner', danger: true, onPress: abandonner },
      ],
    );
  };

  const garderEtFermer = () => {
    depart.current = null;
    haptic('succes');
    onClose();
  };

  /** « Mur nord » quand le nord est connu ; « Face au mur » sinon. */
  const titreDuMur = cardinal
    ? `${cardinal.charAt(0).toUpperCase()}${cardinal.slice(1)}`
    : 'Face au mur';
  const mesures =
    `${face.len.toFixed(2).replace('.', ',')} × ${H.toFixed(2).replace(
      '.',
      ',',
    )} m` +
    (retourVise ? ` · retour de ${cm(retourVise.x1 - retourVise.x0)} cm` : '');
  const familleVue =
    FIXTURE_FAMILIES[Math.min(famille, FIXTURE_FAMILIES.length - 1)];
  /** Le compte de la conformité : où en est la pièce. */
  const conforme =
    !!objectif &&
    !objectif.inconnu &&
    objectif.poses >= objectif.exiges &&
    constats.length === 0;
  /** Les hauteurs qu'on pose d'un appui : celle du type, puis les repères. */
  const hauteursRapides = spec
    ? [spec.std, ...HAUTEURS_REF.map(r => r.y)]
        .map(v => Math.round(v * 100) / 100)
        .filter((v, i, t) => t.indexOf(v) === i)
    : [];

  return (
    /*
      L'ÉTABLI, PAGE ENTIÈRE — relevé du patron : « revois complètement la
      page de placement d'appareils sur un mur ; une page entière,
      complètement refaite, plus ludique, plus moderne, en cohérence avec
      nos avancées ».

      Trois étages, comme les écrans qu'on aime : en haut, OÙ l'on est (le
      mur, la pièce, et la sortie de chaque côté) et l'état des choses en
      pastilles ; au milieu, le MUR, sur toute la place qui reste ; en bas,
      sous le pouce, CE QU'ON FAIT — poser un appareil d'un appui, ou régler
      celui qu'on tient. Le moteur du mur (glissé, accroches, loupe, cotes,
      retours, calque photo) n'a pas bougé d'une ligne : c'est la page
      autour qui est neuve.
    */
    <View style={[styles.page, { paddingTop: margesSysteme.top + 6 }]}>
      <View style={styles.entete}>
        {/* La sortie qui ABANDONNE, à gauche ; celle qui GARDE, à droite. */}
        <TouchableOpacity
          style={styles.rond}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Fermer sans garder"
          onPress={fermerSansGarder}
        >
          <CloseCross size={17} color={c.ink} weight={3} />
        </TouchableOpacity>
        <View style={styles.enteteTextes}>
          <Text style={styles.titre} numberOfLines={1}>
            {titreDuMur}
          </Text>
          <Text style={styles.sousTitre} numberOfLines={1}>
            {roomName ? `${roomName} · ${mesures}` : mesures}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.garder}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Enregistrer et fermer"
          onPress={garderEtFermer}
        >
          <Text style={styles.garderMot}>Enregistrer</Text>
        </TouchableOpacity>
      </View>

      {/*
        L'ÉTAT DES CHOSES, EN PASTILLES — la norme de la pièce, les meubles
        devant le mur, la photo. Chacune dit ce qui EST et se touche pour
        agir ; aucune n'apparaît si elle n'a rien à dire.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pucesCadre}
        contentContainerStyle={styles.puces}
      >
        {(objectif || constats.length > 0) && (
          <TouchableOpacity
            hitSlop={PUCE_SLOP}
            style={[styles.puce, conforme ? styles.puceOk : styles.puceAVoir]}
            accessibilityLabel={
              regleOuverte ? 'Masquer la règle' : 'Voir la règle'
            }
            onPress={() => setRegleOuverte(v => !v)}
          >
            {objectif && !objectif.inconnu ? (
              <Anneau
                part={objectif.poses / Math.max(1, objectif.exiges)}
                ok={conforme}
                c={c}
              />
            ) : null}
            <Text
              style={[
                styles.puceMot,
                conforme ? styles.puceMotOk : styles.puceMotAVoir,
              ]}
              numberOfLines={1}
            >
              {!objectif
                ? `${constats.length} point${
                    constats.length > 1 ? 's' : ''
                  } à revoir`
                : objectif.inconnu
                ? 'Pièce à nommer'
                : `${objectif.nom} · ${objectif.poses}/${
                    objectif.exiges
                  } socle${objectif.exiges > 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        )}
        {meublesDuMur.length > 0 && (
          <TouchableOpacity
            hitSlop={PUCE_SLOP}
            style={[styles.puce, voirMeubles && styles.puceOn]}
            accessibilityLabel="Meubles devant ce mur"
            onPress={() => setVoirMeubles(v => !v)}
          >
            <Sofa
              size={14}
              color={voirMeubles ? '#FFFFFF' : c.inkSoft}
              strokeWidth={2.2}
            />
            <Text style={[styles.puceMot, voirMeubles && styles.puceMotOn]}>
              {`${meublesDuMur.length} meuble${
                meublesDuMur.length > 1 ? 's' : ''
              }`}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          hitSlop={PUCE_SLOP}
          style={styles.puce}
          accessibilityLabel={
            (retourVise ? 'Photo du retour' : 'Photo') +
            (mesPhotos.length > 0 ? ` (${mesPhotos.length})` : '')
          }
          onPress={async () => {
            const prise = await RoomScan.takePhoto();
            if (prise) {
              const cible = retourVise
                ? (retourVise.x0 + retourVise.x1) / 2
                : face.len / 2;
              // L'identifiant du coffre voyage avec la punaise : c'est lui
              // qui retrouvera l'image après une réinstallation.
              addPhoto(wallId, fromFaceX(face, cible), prise.path, prise.asset);
              haptic('succes');
            }
          }}
        >
          <Svg width={15} height={15} viewBox="0 0 24 24">
            <Path d={SOLAIRES.image} fill={c.inkSoft} fillRule="evenodd" />
          </Svg>
          <Text style={styles.puceMot}>
            {(retourVise ? 'Photo du retour' : 'Photo') +
              (mesPhotos.length > 0 ? ` · ${mesPhotos.length}` : '')}
          </Text>
        </TouchableOpacity>
        {mesPhotos.length > 0 && (
          <TouchableOpacity
            hitSlop={PUCE_SLOP}
            style={[styles.puce, calque && styles.puceOn]}
            accessibilityLabel={calque ? 'Masquer la photo' : 'Photo au fond'}
            onPress={() => {
              setCalant(false);
              setCalque(v => !v);
              // Le rideau repart à moitié : ouvert en grand on ne voit plus
              // le dessin, fermé on ne voit pas qu'il s'est passé quelque chose.
              setRideau(0.5);
              haptic('leger');
            }}
          >
            <Text style={[styles.puceMot, calque && styles.puceMotOn]}>
              Photo au fond
            </Text>
          </TouchableOpacity>
        )}
        {calqueVisible && (
          <TouchableOpacity
            hitSlop={PUCE_SLOP}
            style={[styles.puce, calant && styles.puceOn]}
            accessibilityLabel={
              calant ? 'Terminer le calage' : 'Caler la photo'
            }
            onPress={() => {
              setCalant(v => !v);
              haptic('leger');
            }}
          >
            <Text style={[styles.puceMot, calant && styles.puceMotOn]}>
              {calant ? 'Terminer le calage' : 'Caler la photo'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* La règle, et le geste qui corrige — d'un appui sur la pastille. */}
      {regleOuverte && (objectif || constats.length > 0) && (
        <View style={styles.regle}>
          <Text style={styles.regleTexte}>
            {[
              objectif?.inconnu
                ? 'Ses exigences dépendent de son usage : nommez la pièce sur le plan.'
                : null,
              ...constats.map(i2 => i2.message),
              objectif?.regle,
              ...constats.map(i2 => i2.regle),
            ]
              .filter(Boolean)
              .filter((r, k, t) => t.indexOf(r) === k)
              .join('\n')}
          </Text>
          {(() => {
            const fix = constats.find(i2 => i2.fix?.type === 'poser')?.fix as
              | { kind: FixtureKind; height?: number; label: string }
              | undefined;
            if (fix) {
              return (
                <TouchableOpacity
                  style={styles.regleFix}
                  onPress={() => poser(fix.kind, fix.height)}
                >
                  <Text style={styles.regleFixMot}>{fix.label}</Text>
                </TouchableOpacity>
              );
            }
            if (objectif && objectif.poses < objectif.exiges) {
              return (
                <TouchableOpacity
                  style={styles.regleFix}
                  onPress={() =>
                    poser('prise', objectif.surPlan ? 1.1 : undefined)
                  }
                >
                  <Text style={styles.regleFixMot}>Poser une prise</Text>
                </TouchableOpacity>
              );
            }
            return null;
          })()}
        </View>
      )}

      {/* LE MUR — toute la place qui reste, dans sa carte. */}
      <View style={styles.scene}>
        <View
          style={styles.canvas}
          onLayout={e =>
            setLayout({
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            })
          }
          {...pan.panHandlers}
        >
          {/*
          LE CALQUE PHOTO, SOUS LE DESSIN.

          Il occupe le rectangle EXACT du mur — c'est ce qui lui donne son
          sens : une photo posée n'importe où sur le cadre ne se compare à
          rien. Il ne prend le doigt qu'en mode calage ; le reste du temps,
          l'établi sert à poser des appareils.
        */}
          {calqueVisible && (
            <CalquePhotoFond
              cadre={cadreDuMur!}
              uri={`file://${photoDuCalque!.path}`}
              calage={photoDuCalque!.calage}
              rideau={rideau}
            />
          )}
          {scale > 0 && (
            <Svg width={layout.w} height={layout.h}>
              <Defs>
                {/* Un mur éclairé par le haut : la lumière vient du plafond,
                  comme dans une pièce. Rien de spectaculaire — juste de quoi
                  ne plus lire un rectangle gris. */}
                <LinearGradient id="mur" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={c.surface} />
                  <Stop offset="1" stopColor={c.surfaceSunken} />
                </LinearGradient>
              </Defs>
              <DefsAppareils />

              {/*
              LÉGER RELIEF : l'épaisseur du mur, vue de trois quarts.
              Deux bandeaux en fuite — un au plafond, un sur le côté — et le
              mur cesse d'être un rectangle posé sur du vide : on lit une
              maçonnerie, avec son épaisseur, et les appareils s'y posent
              dessus. La face, elle, reste exactement à l'échelle : c'est sur
              elle qu'on mesure.
            */}
              <Polygon
                points={[
                  `${px(0)},${py(H)}`,
                  `${px(0) + FUITE},${py(H) - FUITE}`,
                  `${px(face.len) + FUITE},${py(H) - FUITE}`,
                  `${px(face.len)},${py(H)}`,
                ].join(' ')}
                fill={c.surfaceSunken}
                stroke={c.line}
                strokeWidth={1}
              />
              <Polygon
                points={[
                  `${px(face.len)},${py(H)}`,
                  `${px(face.len) + FUITE},${py(H) - FUITE}`,
                  `${px(face.len) + FUITE},${py(0) - FUITE}`,
                  `${px(face.len)},${py(0)}`,
                ].join(' ')}
                fill={c.line}
                opacity={0.5}
                stroke={c.line}
                strokeWidth={1}
              />

              {/* Le mur, vu de face : un rectangle à l'échelle. */}
              <Rect
                x={px(0)}
                y={py(H)}
                width={face.len * scale}
                height={H * scale}
                fill="url(#mur)"
                stroke={c.lineStrong}
                strokeWidth={1.5}
                rx={2}
              />

              {/*
              LES HAUTEURS DE RÉFÉRENCE, en filigrane.
              Poser un appareil, c'est viser une de ces quatre lignes : 25 cm
              pour une prise de plinthe, 1,10 m pour une commande ou un plan
              de travail, 1,35 m pour le tableau, 2,10 m pour une applique.
              Les avoir sous les yeux évite de les chercher, et fait voir
              d'un coup ce qui n'est pas aligné avec le reste.
            */}
              {HAUTEURS_REF.filter(r => r.y < H - 0.05).map(r => (
                <G key={`ref${r.y}`}>
                  <Line
                    x1={px(0)}
                    y1={py(r.y)}
                    x2={px(face.len)}
                    y2={py(r.y)}
                    stroke={c.blue}
                    strokeWidth={0.8}
                    strokeDasharray="2 6"
                    opacity={0.35}
                  />
                  <SvgText
                    x={px(face.len) + 5}
                    y={py(r.y) + 3}
                    fill={c.inkFaint}
                    fontSize={7.5}
                    fontWeight="700"
                    textAnchor="start"
                  >
                    {libelleDeHauteur(r, layout.w - px(face.len) - 5, 7.5)}
                  </SvgText>
                </G>
              ))}

              {/* Sol : trait épais et hachures — le zéro des hauteurs. */}
              <Line
                x1={px(0) - 14}
                y1={py(0)}
                x2={px(face.len) + 14}
                y2={py(0)}
                stroke={c.ink}
                strokeWidth={2.5}
              />
              {Array.from({
                length: Math.ceil((face.len * scale) / 12) + 3,
              }).map((_, i) => {
                const x = px(0) - 12 + i * 12;
                return (
                  <Line
                    key={`h${i}`}
                    x1={x}
                    y1={py(0) + 8}
                    x2={x + 7}
                    y2={py(0)}
                    stroke={c.lineStrong}
                    strokeWidth={1}
                  />
                );
              })}
              {/* Plafond */}
              <Line
                x1={px(0)}
                y1={py(H)}
                x2={px(face.len)}
                y2={py(H)}
                stroke={c.inkFaint}
                strokeWidth={1}
                strokeDasharray="5 4"
              />

              {/*
              LES COTES DU MUR, dans l'espace laissé libre au-dessus.
              Le dessin est calé en bas — c'est le sol, il n'y a pas à
              discuter — et le haut de la zone restait vide. Un plan
              d'élévation y met justement ses cotes : la longueur au-dessus,
              la hauteur sous plafond sur le côté. On les lisait jusqu'ici
              dans une phrase, en petit, sous le titre.
            */}
              <G>
                <Line
                  x1={px(0)}
                  y1={py(H) - COTE_H}
                  x2={px(face.len)}
                  y2={py(H) - COTE_H}
                  stroke={c.inkSoft}
                  strokeWidth={1}
                />
                {[0, face.len].map(x => (
                  <Line
                    key={`t${x}`}
                    x1={px(x)}
                    y1={py(H) - COTE_H - 4}
                    x2={px(x)}
                    y2={py(H) - COTE_H + 4}
                    stroke={c.inkSoft}
                    strokeWidth={1.4}
                  />
                ))}
                <Rect
                  x={px(face.len / 2) - 30}
                  y={py(H) - COTE_H - 9}
                  width={60}
                  height={18}
                  rx={9}
                  fill={c.bg}
                />
                <SvgText
                  x={px(face.len / 2)}
                  y={py(H) - COTE_H + 4}
                  fill={c.ink}
                  fontSize={12}
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {`${face.len.toFixed(2).replace('.', ',')} m`}
                </SvgText>
                <SvgText
                  x={px(0) - 8}
                  y={py(H / 2)}
                  fill={c.inkFaint}
                  fontSize={10}
                  fontWeight="700"
                  textAnchor="middle"
                  transform={`rotate(-90, ${px(0) - 8}, ${py(H / 2)})`}
                >
                  {`H ${H.toFixed(2).replace('.', ',')} m`}
                </SvgText>
              </G>

              {/*
              LES MEUBLES, EN CREUX, sous tout le reste.

              Une silhouette hachurée et son nom : de quoi comprendre qu'un
              socle tombera derrière la bibliothèque, sans masquer le mur ni
              se confondre avec une baie. Le trait du haut donne la hauteur
              du meuble, la seule cote qui décide.

              LA SILHOUETTE PART DE SON DESSOUS, pas du sol. Tout était
              dessiné depuis le carrelage : un meuble haut de cuisine
              devenait une colonne pleine, et le plan de travail sur lequel
              on pose justement les prises disparaissait dessous. Ce qui est
              accroché en l'air — meuble haut, hotte, télé, chauffe-eau — se
              voit maintenant comme il est, et la place libre sous lui aussi.
            */}
              {voirMeubles &&
                meublesDuMur.map((m, i) => {
                  const haut = Math.min(m.top, H);
                  const bas = Math.min(m.base, haut);
                  /*
                  CONTRE LE MUR, LE MEUBLE SE VOIT FRANCHEMENT — relevé du
                  patron : les silhouettes en creux (9 % d'opacité, tirets
                  pâles) ne se voyaient pas, et c'est le meuble COLLÉ qui
                  condamne la prise. À douze centimètres ou moins du nu,
                  il prend la convention du plan : bleu, trait plein. Le
                  lointain reste en creux.
                */
                  const contre = m.ecart <= 0.12;
                  return (
                    <G key={`mb${i}`}>
                      <Rect
                        x={px(m.from)}
                        y={py(haut)}
                        width={Math.max(2, (m.to - m.from) * scale)}
                        height={Math.max(1, (haut - bas) * scale)}
                        fill={contre ? c.blue : c.inkFaint}
                        fillOpacity={contre ? 0.1 : 0.09}
                        stroke={contre ? c.blue : c.inkFaint}
                        strokeWidth={contre ? 1.4 : 1}
                        strokeDasharray={contre ? undefined : '5 4'}
                      />
                      {(m.to - m.from) * scale > 46 && (
                        <SvgText
                          x={px((m.from + m.to) / 2)}
                          y={py(haut) + 12}
                          fill={c.inkFaint}
                          fontSize={8.5}
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {`${frCategory(m.category)} ${Math.round(
                            m.top * 100,
                          )}`}
                        </SvgText>
                      )}
                    </G>
                  );
                })}

              {/*
              LA HAUTEUR DE POSE SE COTE, comme celle d'un appareil.

              Un meuble accroché en l'air ne se décrit pas par sa seule
              hauteur hors tout : ce qu'un cuisiniste et un électricien se
              donnent, c'est la cote du DESSOUS — 1,40 m pour un meuble haut
              de cuisine. Elle se dessine dans la même écriture que les trois
              cotes de l'appareillage, sur l'axe du meuble, et seulement pour
              ce qui décolle vraiment du sol : écrire « 0 » sous chaque
              caisson noierait les seules cotes qu'on vient lire.
            */}
              {voirMeubles &&
                meublesDuMur
                  .filter(m => m.base > 0.02 && m.base < H)
                  .map((m, i) => {
                    /*
                    LA COTE SE POSE AU BORD, PAS AU MILIEU.

                    Au centre du meuble, elle traverse tout ce qui est en
                    dessous — sous un meuble haut de cuisine, il y a
                    justement le meuble bas — et son étiquette se pose en
                    plein sur lui. Au bord, elle longe le montant : c'est là
                    qu'on cote une allège sur un plan, et le dessin reste
                    lisible. Bornée au cadre, sinon l'étiquette du meuble le
                    plus à gauche sort du dessin.
                  */
                    const xm = Math.max(px(0) + 22, px(m.from));
                    return (
                      <Dim
                        key={`mbc${i}`}
                        x1={xm}
                        y1={py(0)}
                        x2={xm}
                        y2={py(m.base)}
                        text={`${Math.round(m.base * 100)}`}
                        c={c}
                        vertical
                        push={{ x: 1, y: 0 }}
                      />
                    );
                  })}

              {/* Portes et fenêtres : on ne perce pas un mur à leur place. */}
              {holes.map((hole, i) => {
                const xa = faceXofT(face, hole.t0);
                const xb = faceXofT(face, hole.t1);
                const x0 = Math.min(xa, xb);
                const w = Math.abs(xb - xa);
                return (
                  <G key={`o${i}`}>
                    <Rect
                      x={px(x0)}
                      y={py(hole.y1)}
                      width={w * scale}
                      height={(hole.y1 - hole.y0) * scale}
                      fill={c.blueSoft}
                      stroke={c.blue}
                      strokeWidth={1.4}
                    />
                    {w * scale > 54 && (
                      <SvgText
                        x={px(x0 + w / 2)}
                        y={py(hole.y0) - 8}
                        fill={c.blue}
                        fontSize={10}
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {/* La NATURE nomme, pas un drapeau : une baie posée à
                          la main s'appelait « Porte ». Voir
                          `estTraversante`. */}
                        {hole.seg.type === 'window'
                          ? 'Fenêtre'
                          : estTraversante(hole.seg)
                          ? 'Passage'
                          : 'Porte'}
                      </SvgText>
                    )}
                    {/*
                    LE COFFRE DE VOLET, HACHURÉ — la zone où l'on ne perce
                    pas. Le scan ne le voit pas ; déclaré d'un geste, il se
                    dessine ici, coté, au-dessus de sa baie.
                  */}
                    {(() => {
                      const e = empriseDuCoffre(hole.seg, x0);
                      if (!e) return null;
                      const hh = (e.y1 - e.y0) * scale;
                      return (
                        <G>
                          <Rect
                            x={px(e.x0)}
                            y={py(e.y1)}
                            width={(e.x1 - e.x0) * scale}
                            height={hh}
                            fill={c.amber}
                            fillOpacity={0.14}
                            stroke={c.amber}
                            strokeWidth={1.2}
                            strokeDasharray="4 3"
                          />
                          {w * scale > 70 && hh > 11 && (
                            <SvgText
                              x={px(e.x0 + (e.x1 - e.x0) / 2)}
                              y={py(e.y0) - hh / 2 + 3.5}
                              fill={c.amber}
                              fontSize={9}
                              fontWeight="800"
                              textAnchor="middle"
                            >
                              {`COFFRE ${Math.round(hole.seg.coffre! * 100)}`}
                            </SvgText>
                          )}
                        </G>
                      );
                    })()}
                  </G>
                );
              })}

              {/*
              LES RETOURS : leur cote, et leur axe.

              Le mur porte sa longueur au-dessus et son milieu en
              accroche ; un retour n'avait ni l'une ni l'autre. On les lui
              donne, dans la même écriture : la cote sous le plafond, en
              centimètres puisque c'est ainsi qu'on la relit au mètre, et
              l'axe en filigrane, sur lequel l'appareil s'accroche quand
              on passe dessus. La cote se dessine APRÈS les baies pour
              rester lisible par-dessus le bleu d'une porte-fenêtre.
            */}
              {retours.map((r, i) => {
                const larg = r.x1 - r.x0;
                const milieu = (r.x0 + r.x1) / 2;
                // Celui qu'on a désigné sur le plan, ou à défaut celui qui
                // porte l'appareil tenu : c'est le même besoin — savoir sur
                // quel morceau de mur on travaille.
                const vise =
                  (focusX != null && focusX >= r.x0 && focusX <= r.x1) ||
                  (!!monRetour &&
                    monRetour.x0 === r.x0 &&
                    monRetour.x1 === r.x1);
                const teinte = vise ? c.blue : c.inkFaint;
                const yc = py(H) + 15;
                // Un retour étroit ne peut pas porter son nombre entre ses
                // deux traits : on écrit alors la cote au-dessus, et on
                // garde les traits pour dire où elle s'applique.
                const large = larg * scale > 40;
                return (
                  <G key={`ret${i}`}>
                    {larg >= 0.06 && (
                      <Line
                        x1={px(milieu)}
                        y1={py(H) - 2}
                        x2={px(milieu)}
                        y2={py(0) + 2}
                        stroke={c.blue}
                        strokeWidth={vise ? 1 : 0.8}
                        strokeDasharray="2 6"
                        opacity={vise ? 0.75 : 0.35}
                      />
                    )}
                    <Line
                      x1={px(r.x0) + 1}
                      y1={yc}
                      x2={px(r.x1) - 1}
                      y2={yc}
                      stroke={teinte}
                      strokeWidth={1}
                    />
                    {[r.x0, r.x1].map(x => (
                      <Line
                        key={`t${i}-${x}`}
                        x1={px(x)}
                        y1={yc - 4}
                        x2={px(x)}
                        y2={yc + 4}
                        stroke={teinte}
                        strokeWidth={1.2}
                      />
                    ))}
                    <Rect
                      x={px(milieu) - 17}
                      y={(large ? yc : yc - 13) - 7}
                      width={34}
                      height={14}
                      rx={7}
                      fill={c.surface}
                    />
                    <SvgText
                      x={px(milieu)}
                      y={(large ? yc : yc - 13) + 4}
                      fill={vise ? c.blue : c.inkSoft}
                      fontSize={9}
                      fontWeight={vise ? '800' : '700'}
                      textAnchor="middle"
                    >
                      {`${cm(larg)}`}
                    </SvgText>
                  </G>
                );
              })}

              {/* Repère d'accrochage, le temps du geste. */}
              {guide.x !== undefined && (
                <Line
                  x1={px(guide.x)}
                  y1={py(H) - 6}
                  x2={px(guide.x)}
                  y2={py(0) + 6}
                  stroke={c.green}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                />
              )}
              {guide.y !== undefined && (
                <Line
                  x1={px(0) - 6}
                  y1={py(guide.y)}
                  x2={px(face.len) + 6}
                  y2={py(guide.y)}
                  stroke={c.green}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                />
              )}

              {/*
              LE RÉTICULE DU GLISSEMENT : deux fils fins qui traversent
              TOUTE la face. Le doigt couvre l'appareil et ses cotes — les
              fils, eux, dépassent de la main : on voit où ça se pose sans
              rien lâcher. Bleu plein, pour ne pas se confondre avec le
              vert tireté des aimants.
            */}
              {traine && (
                <>
                  <Line
                    testID="reticule-x"
                    x1={px(traine.x)}
                    y1={py(0)}
                    x2={px(traine.x)}
                    y2={py(H)}
                    stroke={c.blue}
                    strokeWidth={1.4}
                    opacity={0.85}
                  />
                  <Line
                    testID="reticule-y"
                    x1={px(0)}
                    y1={py(traine.y)}
                    x2={px(face.len)}
                    y2={py(traine.y)}
                    stroke={c.blue}
                    strokeWidth={1.4}
                    opacity={0.85}
                  />
                </>
              )}

              {/* Ceux de l'autre face restent visibles, en creux : savoir
                qu'une prise est déjà posée dos à dos évite de percer deux
                fois au même endroit. Un pointillé, rien de plus — ils ne
                sont pas de ce côté-ci. */}
              {mine
                .filter(f => f.side !== side)
                .map(f => {
                  const s2 = FIXTURES[f.kind];
                  const w = Math.max(30, s2.w * scale);
                  const h = Math.max(30, s2.h * scale);
                  return (
                    <Rect
                      key={f.id}
                      x={px(faceX(face, f.along)) - w / 2}
                      y={py(f.height) - h / 2}
                      width={w}
                      height={h}
                      rx={4}
                      fill="none"
                      stroke={c.inkFaint}
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                      opacity={0.45}
                    />
                  );
                })}

              {/*
                LES APPAREILS DE CETTE FACE, TELS QU'ILS SERONT POSÉS —
                relevé du patron : « on ne doit plus voir un bloc noté mais
                une vraie prise ajoutée, comme le rendu qu'on aura à la
                fin ». Un carré ambre écrit « PC » est devenu la prise
                elle-même : sa plaque, son puits, sa broche de terre (voir
                `AppareilDeFace`). Les postes réunis partagent UNE plaque,
                comme au mur.
              */}
              {dessins.map(d => (
                <AppareilDeFace
                  key={d.pose.id}
                  pose={d.pose}
                  cx={px(d.pose.x)}
                  cy={py(d.pose.y)}
                  k={d.k}
                />
              ))}
              {/* L'emprise de chaque appareil, et la bague de celui qu'on
                tient : elle épouse sa plaque, pas un cercle autour. */}
              {emprises.map(e => {
                const on = e.id === selectedId;
                return (
                  <G key={`emprise-${e.id}`}>
                    <Rect
                      testID={`emprise-${e.id}`}
                      x={e.x - e.w / 2}
                      y={e.y - e.h / 2}
                      width={e.w}
                      height={e.h}
                      fill="none"
                    />
                    {on && (
                      <Rect
                        x={e.x - e.w / 2 - 6}
                        y={e.y - e.h / 2 - 6}
                        width={e.w + 12}
                        height={e.h + 12}
                        rx={8}
                        fill="none"
                        stroke={c.blue}
                        strokeWidth={2}
                      />
                    )}
                  </G>
                );
              })}

              {/* Les ondées des poses, par-dessus les appareils. */}
              {mine
                .filter(f => nes.has(f.id) && f.side === side)
                .map((f, i) => (
                  <OndeePose
                    key={`nee-${f.id}`}
                    id={f.id}
                    cx={px(faceX(face, f.along))}
                    cy={py(f.height)}
                    color={FIXTURES[f.kind].color}
                    rayon={30}
                    retard={i * 70}
                  />
                ))}

              {/* Les trois cotes de l'appareil sélectionné. */}
              {selected && (
                <G>
                  <Dim
                    x1={px(0)}
                    y1={py(selected.height)}
                    x2={px(selX)}
                    y2={py(selected.height)}
                    text={`${cm(selX)}`}
                    c={c}
                    push={{ x: -1, y: 0 }}
                  />
                  <Dim
                    x1={px(selX)}
                    y1={py(selected.height)}
                    x2={px(face.len)}
                    y2={py(selected.height)}
                    text={`${cm(face.len - selX)}`}
                    c={c}
                    push={{ x: 1, y: 0 }}
                  />
                  <Dim
                    x1={px(selX)}
                    y1={py(0)}
                    x2={px(selX)}
                    y2={py(selected.height)}
                    text={`${cm(selected.height)}`}
                    c={c}
                    vertical
                    push={{ x: 1, y: 0 }}
                  />
                </G>
              )}
            </Svg>
          )}
          {/*
          CE QUE VAUT LA PHOTO, DIT EN TOUTES LETTRES.

          Posée sur une élévation cotée, elle se prend pour une élévation
          cotée. Elle ne l'est pas : prise à main levée, de biais, elle ne
          mesure rien.
        */}
          {calqueVisible && (
            <Text style={styles.calqueNote} pointerEvents="none">
              {calant
                ? 'Poussez et pincez la photo pour la caler sur le mur'
                : 'Repère visuel — la photo n’est pas à l’échelle'}
            </Text>
          )}
          {/* LA POIGNÉE DU RIDEAU — au-dessus du dessin, sinon on ne
            l'attraperait pas. Voir `CalquePhoto`. */}
          {calqueVisible && (
            <CalquePhotoPoignee
              cadre={cadreDuMur!}
              calage={photoDuCalque!.calage}
              onCalage={cal => setPhotoCalage(photoDuCalque!.id, cal)}
              rideau={rideau}
              onRideau={setRideau}
              calant={calant}
            />
          )}

          {/*
          LA LOUPE DU GLISSEMENT — les cotes vivantes, AU-DESSUS du doigt.
          Gauche, droite, hauteur, en gros : c'est ce que la main cache. On
          la décale pour qu'elle reste dans le cadre, et elle ne prend
          aucun geste — elle montre, c'est tout.
        */}
          {traine && face && scale > 0 && (
            <View
              testID="loupe"
              pointerEvents="none"
              style={[
                styles.loupe,
                {
                  left: Math.max(
                    8,
                    Math.min(
                      px(traine.x) - LOUPE_L / 2,
                      layout.w - LOUPE_L - 8,
                    ),
                  ),
                  top: Math.max(8, py(traine.y) - LOUPE_HAUT),
                },
              ]}
            >
              <Text style={styles.loupeCotes}>
                {`◂ ${cm(traine.x)}   ${cm(face.len - traine.x)} ▸`}
              </Text>
              <Text style={styles.loupeHauteur}>
                {`haut. ${cm(traine.y)} cm`}
              </Text>
            </View>
          )}

          {/* L'alerte de hauteur se pose SUR le dessin, au-dessus de
            l'appareil qu'elle concerne — jamais dans le flux du panneau.
            En bandeau, elle poussait tout le reste vers le bas : le schéma
            changeait de taille selon qu'une prise était trop basse ou non,
            et le regard perdait le mur qu'il suivait. Ici, elle désigne ce
            dont elle parle, et rien ne bouge. */}
          {hauteurKO &&
            selected &&
            face &&
            (() => {
              // Ni cadre, ni fond : rien ne doit masquer l'appareil dont on
              // parle. Le mot suffit, en rouge, avec un liseré clair derrière
              // les lettres pour qu'il tienne sur n'importe quel fond. On le
              // pose AU-DESSUS de l'appareil, et en dessous quand il n'y a
              // plus de place — près du plafond, il sortait du cadre.
              const xc = px(faceX(face, selected.along));
              const yTete = py(selected.height + SPECS[selected.kind].h / 2);
              const dessus = yTete > 34;
              return (
                <TouchableOpacity
                  style={[
                    styles.alerte,
                    {
                      left: Math.max(4, Math.min(layout.w - 204, xc - 100)),
                      top: dessus
                        ? yTete - 30
                        : py(selected.height - SPECS[selected.kind].h / 2) + 8,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() =>
                    moveFixture(
                      selected.id,
                      selected.along,
                      SPECS[selected.kind].std,
                    )
                  }
                >
                  <Text style={styles.alerteTexte} numberOfLines={1}>
                    {`Trop ${hauteurKO.sens === 'trop bas' ? 'bas' : 'haut'}`}
                    <Text style={styles.alerteFixe}>
                      {`  ·  remettre à ${cm(SPECS[selected.kind].std)} cm`}
                    </Text>
                  </Text>
                </TouchableOpacity>
              );
            })()}
          {/* Un mur vide dit par où commencer — sans prendre le doigt. */}
          {mine.length === 0 && !calqueVisible && (
            <View style={styles.vide} pointerEvents="none">
              <Text style={styles.videMot}>
                Touchez un appareil, en bas, pour le poser ici
              </Text>
            </View>
          )}
        </View>
      </View>

      {/*
        SOUS LE POUCE — ce qu'on fait. Rien de tenu : le dock des appareils,
        en images, famille par famille. Un appareil tenu : sa fiche, ses
        trois cotes, ses hauteurs d'un appui, ses flèches, ses gestes. Un
        ensemble qui se forme : ses deux questions.
      */}
      <View style={[styles.dock, { paddingBottom: margesSysteme.bottom + 12 }]}>
        {fusion ? (
          (() => {
            const lot = mine.filter(
              f => f.id === fusion.base || f.id === fusion.moved,
            );
            const n = lot.reduce((t, f) => t + postsOf(f.kind).length, 0);
            const dispo = cotesPossibles();
            return (
              <View style={styles.ens}>
                <View style={styles.ensHead}>
                  <View style={styles.ensPastille}>
                    <Text style={styles.ensPastilleText}>{n}</Text>
                  </View>
                  <View style={styles.ensTitres}>
                    <Text style={styles.ensTitre} numberOfLines={1}>
                      {`Ensemble ${n} postes`}
                    </Text>
                    <Text style={styles.ensSous} numberOfLines={1}>
                      {`entraxe ${Math.round(
                        ENTRAXE * 1000,
                      )} mm · plaque ${Math.round(
                        ((n - 1) * ENTRAXE + PLAQUE) * 1000,
                      )} mm`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.ensOk}
                    onPress={() => setFusion(null)}
                  >
                    <Text style={styles.ensOkText}>OK</Text>
                  </TouchableOpacity>
                </View>

                {/*
                DEUX SÉLECTEURS ET UN BOUTON — à la taille du pouce.

                Tout tenait sur une seule ligne : quatre flèches de 30 × 26
                points, deux étiquettes de dix points et un « Séparer » sans
                fond, tassés bord à bord. Apple demande 44 points de côté
                pour une cible tactile, et ce n'est pas un caprice : en
                dessous, un doigt sur deux tombe à côté — ici, sur la
                flèche voisine, qui déplace la prise du mauvais côté.

                On reprend donc la grammaire d'iOS : un sélecteur segmenté
                par question (de quel côté ? quel axe ?), chacun sur toute
                la largeur, et l'action destructive isolée en bas, en
                rouge, comme partout ailleurs dans le système.
              */}
                <Text style={styles.ensLabel}>CÔTÉ DU SECOND POSTE</Text>
                <View style={styles.ensSeg}>
                  {PLATE_SIDES.filter(sd => dispo.includes(sd.key)).map(sd => {
                    const actif = fusion.cote === sd.key;
                    return (
                      <TouchableOpacity
                        key={sd.key}
                        style={[
                          styles.ensSegItem,
                          actif && styles.ensSegItemOn,
                        ]}
                        accessibilityLabel={sd.label}
                        onPress={() => appliquer(sd.key, fusion.centre)}
                      >
                        <Svg width={18} height={18} viewBox="0 0 24 24">
                          <Path
                            d={sd.arrow}
                            stroke={actif ? '#FFFFFF' : c.ink}
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </Svg>
                        <Text
                          style={[
                            styles.ensSegText,
                            actif && styles.ensSegTextOn,
                          ]}
                        >
                          {sd.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.ensLabel}>AXE DE RÉFÉRENCE</Text>
                <View style={styles.ensSeg}>
                  {[
                    {
                      on: false,
                      label: 'Première fixe',
                      hint: 'la première ne bouge pas',
                    },
                    {
                      on: true,
                      label: 'Centré',
                      hint: 'la plaque se centre sur son axe',
                    },
                  ].map(opt => {
                    const actif = fusion.centre === opt.on;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        style={[
                          styles.ensSegLarge,
                          actif && styles.ensSegItemOn,
                        ]}
                        onPress={() => appliquer(fusion.cote, opt.on)}
                      >
                        <Text
                          style={[
                            styles.ensSegText,
                            actif && styles.ensSegTextOn,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text
                          style={[
                            styles.ensSegHint,
                            actif && styles.ensSegHintOn,
                          ]}
                          numberOfLines={1}
                        >
                          {opt.hint}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity style={styles.ensSplit} onPress={separer}>
                  <Text style={styles.ensSplitText}>Séparer les appareils</Text>
                </TouchableOpacity>
              </View>
            );
          })()
        ) : selected && spec ? (
          <View>
            <View style={styles.ficheTete}>
              <View style={styles.ficheVignette}>
                <VignetteAppareil kind={selected.kind} taille={40} />
              </View>
              <View style={styles.ficheTextes}>
                <Text style={styles.ficheTitre} numberOfLines={1}>
                  {spec.label}
                </Text>
                <Text
                  style={[styles.ficheSous, hauteurKO && styles.ficheSousKO]}
                  numberOfLines={1}
                >
                  {hauteurKO
                    ? `Trop ${
                        hauteurKO.sens === 'trop bas' ? 'bas' : 'haut'
                      } · la règle dit ${cm(spec.std)} cm`
                    : `Hauteur type ${cm(spec.std)} cm`}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.rondPetit}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Reposer l’appareil"
                onPress={() => onSelect(null)}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path
                    d="m6 9 6 6 6-6"
                    stroke={c.inkSoft}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
              </TouchableOpacity>
            </View>

            <View style={styles.fields}>
              {field('g', 'Gauche', selX)}
              {field('d', 'Droite', face.len - selX)}
              {field('h', 'Hauteur', selected.height)}
            </View>

            {/*
              PENDANT LA SAISIE, LA FICHE SE RESSERRE SUR SES TROIS COTES : le
              clavier prend la moitié de l'écran, et le mur doit rester
              visible au-dessus pour voir l'appareil suivre la valeur tapée.
            */}
            {editing === null && (
              <>
                {/* Les hauteurs qu'on pose d'un appui : celle du type d'abord. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hauteurs}
                >
                  {hauteursRapides.map((v, i) => {
                    const actif = Math.abs(selected.height - v) < 0.005;
                    return (
                      <TouchableOpacity
                        key={v}
                        hitSlop={{ top: 6, bottom: 6 }}
                        style={[styles.hauteur, actif && styles.hauteurOn]}
                        accessibilityLabel={`${cm(v)} cm`}
                        onPress={() => {
                          moveFixture(selected.id, selected.along, v);
                          haptic('leger');
                        }}
                      >
                        <Text
                          style={[
                            styles.hauteurMot,
                            actif && styles.hauteurMotOn,
                          ]}
                        >
                          {i === 0 ? `Type · ${cm(v)}` : `${cm(v)}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.pave}>
                  <TouchableOpacity
                    style={styles.pavePas}
                    onPress={() => setPas(pas === 0.01 ? 0.05 : 0.01)}
                  >
                    <Text style={styles.pavePasText}>{`${Math.round(
                      pas * 100,
                    )} cm`}</Text>
                  </TouchableOpacity>
                  {/*
            LES QUATRE FLÈCHES VIENNENT DU JEU COMMUN — relevé du patron,
            liens à l'appui : `square-alt-arrow-left/down/right/up`.

            C'étaient quatre chevrons tracés à la main, au trait, dans une
            app qui ne dessine qu'en silhouette : posés sous une rangée de
            pleins, ils se lisaient comme des traits de construction plutôt
            que comme des boutons. Le carré plein leur donne le poids d'une
            touche — et c'en est une : on l'appuie dix fois de suite pour
            gagner dix centimètres.
          */}
                  {(
                    [
                      ['gauche', -1, 0, SOLAIRES.flecheGauche],
                      ['droite', 1, 0, SOLAIRES.flecheDroite],
                      ['haut', 0, 1, SOLAIRES.flecheHaut],
                      ['bas', 0, -1, SOLAIRES.flecheBas],
                    ] as const
                  ).map(([cle, dx, dy, fleche]) => (
                    <TouchableOpacity
                      key={cle}
                      style={styles.paveBtn}
                      accessibilityLabel={cle}
                      // `onPressIn` et non `onPress` : le pas part au contact, et
                      // l'enchaînement s'arrête quand le doigt se lève — y compris
                      // s'il glisse hors du bouton (`onPressOut` couvre les deux).
                      onPressIn={() => lancerFleche(dx, dy)}
                      onPressOut={arreterFleche}
                    >
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Path d={fleche} fill={c.ink} fillRule="evenodd" />
                      </Svg>
                    </TouchableOpacity>
                  ))}
                </View>
                {selected && postsOf(selected.kind).length > 1 && face && (
                  <View style={styles.percage}>
                    <Text style={styles.percageTitle}>
                      {`${
                        postsOf(selected.kind).length
                      } postes · entraxe ${Math.round(
                        ENTRAXE * 1000,
                      )} mm · boîte Ø ${Math.round(BOITE_D * 1000)}`}
                    </Text>
                    <Text style={styles.percageVals}>
                      {boxOffsets(selected.kind)
                        .map(
                          o =>
                            `${Math.round(
                              (faceX(face, selected.along) -
                                FIXTURES[selected.kind].w / 2 +
                                o) *
                                100,
                            )}`,
                        )
                        .join('  ·  ')}
                      <Text style={styles.percageUnit}>{'  cm du bord'}</Text>
                    </Text>
                  </View>
                )}

                {/* Les gestes de l'appareil : seulement ceux qui peuvent agir. */}
                <View style={styles.gestes}>
                  {[
                    {
                      key: 'rep',
                      label: 'Répéter',
                      on: !!peutRepeter,
                      tint: c.blue,
                      plein: SOLAIRES.dupliquer,
                      paths: [] as string[],
                      press: () => {
                        const neuf = repeterFixture(selected.id);
                        if (neuf) {
                          // La copie devient la sélection : le prochain appui
                          // pose la suivante, au même pas.
                          onSelect(neuf);
                          haptic('leger');
                        }
                      },
                    },
                    {
                      key: 'pont',
                      label: selected.sansPontage ? 'Seule' : 'Pontée',
                      on: !!voisinePontable,
                      tint: selected.sansPontage ? c.inkSoft : c.blue,
                      plein: null,
                      paths: [
                        'M6 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',
                        'M18 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',
                        'M9 12 h6',
                      ],
                      press: () => basculerPontage(selected.id),
                    },
                    {
                      key: 'flip',
                      label: 'Autre face',
                      on: true,
                      tint: c.ink,
                      plein: null,
                      paths: [
                        'M4 9 h16',
                        'M16.5 5.5 L20 9 l-3.5 3.5',
                        'M20 15 H4',
                        'M7.5 11.5 L4 15 l3.5 3.5',
                      ],
                      press: () => flipFixture(selected.id),
                    },
                    {
                      key: 'lien',
                      label: 'Lier',
                      on:
                        (seCommande(selected.kind) ||
                          COMMANDES_MURALES.includes(selected.kind)) &&
                        !!onLinkRequest,
                      tint: c.blue,
                      plein: null,
                      paths: [
                        'M9.5 14.5 l5 -5',
                        'M11.5 7.5 l1.6 -1.6 a3.1 3.1 0 0 1 4.4 4.4 L15.9 11.9',
                        'M12.5 16.5 l-1.6 1.6 a3.1 3.1 0 0 1 -4.4 -4.4 L8.1 12.1',
                      ],
                      press: () => onLinkRequest?.(selected.id),
                    },
                    {
                      key: 'del',
                      label: 'Retirer',
                      on: true,
                      tint: c.danger,
                      plein: SOLAIRES.supprimer,
                      paths: [] as string[],
                      press: () => {
                        removeFixture(selected.id);
                        onSelect(null);
                      },
                    },
                  ]
                    .filter(g => g.on)
                    .map(g => (
                      <TouchableOpacity
                        key={g.key}
                        style={styles.geste}
                        accessibilityLabel={g.label}
                        onPress={g.press}
                      >
                        <View
                          style={[
                            styles.gesteRond,
                            g.key === 'del' && styles.gesteRondDanger,
                          ]}
                        >
                          <Svg width={20} height={20} viewBox="0 0 24 24">
                            {g.plein ? (
                              <Path
                                d={g.plein}
                                fill={g.tint}
                                fillRule="evenodd"
                              />
                            ) : (
                              g.paths.map(d => (
                                <Path
                                  key={d}
                                  d={d}
                                  stroke={g.tint}
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  fill="none"
                                />
                              ))
                            )}
                          </Svg>
                        </View>
                        <Text style={styles.gesteMot} numberOfLines={1}>
                          {g.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </>
            )}
          </View>
        ) : (
          <View>
            <Text style={styles.dockTitre}>Poser un appareil</Text>
            <Text style={styles.dockSous}>
              Un appui le pose à sa hauteur type ; glissez-le ensuite, ou tapez
              ses cotes.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.familles}
            >
              {FIXTURE_FAMILIES.map((f, i) => {
                const actif = i === famille;
                return (
                  <TouchableOpacity
                    key={f.name}
                    hitSlop={{ top: 5, bottom: 5 }}
                    style={[styles.familleBtn, actif && styles.familleOn]}
                    accessibilityLabel={`Famille ${f.name}`}
                    accessibilityState={{ selected: actif }}
                    onPress={() => {
                      setFamille(i);
                      haptic('leger');
                    }}
                  >
                    <Text
                      style={[styles.familleMot, actif && styles.familleMotOn]}
                    >
                      {f.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cartes}
            >
              {familleVue.kinds.map(kind => (
                <TouchableOpacity
                  key={kind}
                  style={styles.carte}
                  accessibilityLabel={`Poser ${FIXTURES[kind].label}`}
                  onPress={() => poserIci(kind)}
                >
                  <View style={styles.carteImage}>
                    <VignetteAppareil kind={kind} taille={46} />
                  </View>
                  <Text style={styles.carteMot} numberOfLines={2}>
                    {FIXTURES[kind].label}
                  </Text>
                  <Text style={styles.carteCote}>{`${cm(
                    FIXTURES[kind].std,
                  )} cm`}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * L'ANNEAU DE LA PIÈCE — où l'on en est des socles exigés, d'un coup d'œil :
 * il se remplit à chaque prise posée, et passe au vert quand c'est fait.
 */
function Anneau({ part, ok, c }: { part: number; ok: boolean; c: Palette }) {
  const r = 7;
  const tour = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, part));
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Circle
        cx={9}
        cy={9}
        r={r}
        stroke={c.line}
        strokeWidth={2.6}
        fill="none"
      />
      <Circle
        cx={9}
        cy={9}
        r={r}
        stroke={ok ? c.green : c.amber}
        strokeWidth={2.6}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${tour * p} ${tour}`}
        transform="rotate(-90 9 9)"
      />
    </Svg>
  );
}

/** Ligne de cote : trait, embouts, valeur sur fond plein. */
function Dim({
  x1,
  y1,
  x2,
  y2,
  text,
  c,
  vertical,
  push,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  c: Palette;
  vertical?: boolean;
  /** Où s'échapper quand la cote est trop courte pour porter son texte. */
  push?: { x: number; y: number };
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const w = text.length * 6.5 + 12;
  // Une cote de 20 cm fait 15 px de long : son texte n'y tient pas. On ne la
  // supprime surtout pas — c'est LA cote que l'électricien vient lire — on
  // sort l'étiquette du côté où il y a de la place.
  const trop = len < w + 6;
  const echap = trop ? w / 2 + 8 : 0;
  const mx = (x1 + x2) / 2 + (push?.x ?? 0) * echap;
  const my = (y1 + y2) / 2 + (push?.y ?? 0) * echap;
  if (len < 3) return null;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.blue} strokeWidth={1} />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) => (
        <Line
          key={i}
          x1={vertical ? x - 4 : x}
          y1={vertical ? y : y - 4}
          x2={vertical ? x + 4 : x}
          y2={vertical ? y : y + 4}
          stroke={c.blue}
          strokeWidth={1}
        />
      ))}
      {trop && (
        <Line
          x1={(x1 + x2) / 2}
          y1={(y1 + y2) / 2}
          x2={mx}
          y2={my}
          stroke={c.blue}
          strokeWidth={0.8}
        />
      )}
      <Rect
        x={mx - w / 2}
        y={my - 8}
        width={w}
        height={16}
        rx={4}
        fill={c.surface}
        stroke={c.blue}
        strokeWidth={0.8}
      />
      <SvgText
        x={mx}
        y={my + 4}
        fill={c.blue}
        fontSize={10.5}
        fontWeight="800"
        textAnchor="middle"
      >
        {text}
      </SvgText>
    </G>
  );
}

/** Les pastilles font 36 points dessinés ; le doigt en touche 44. */
const PUCE_SLOP = { top: 4, bottom: 4, left: 2, right: 2 };

/** La loupe du glissement : sa largeur, et de combien elle survole le doigt. */
const LOUPE_L = 172;
const LOUPE_HAUT = 96;

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    /*
      LA PAGE — trois étages : où l'on est, le mur, ce qu'on fait. Le fond
      est celui de l'app ; le mur et le dock sont des cartes posées dessus,
      comme l'accueil et les notifications.
    */
    page: { flex: 1, backgroundColor: c.bg },
    disparu: { alignItems: 'center', justifyContent: 'center', gap: 16 },
    entete: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    /** Les ronds de l'en-tête : le même gabarit que la cloche de l'accueil. */
    rond: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
    },
    rondPetit: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    enteteTextes: { flex: 1, minWidth: 0, alignItems: 'center' },
    titre: {
      color: c.ink,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    sousTitre: {
      color: c.inkFaint,
      fontSize: 12.5,
      fontWeight: '600',
      marginTop: 1,
    },
    /** Garder : la seule chose bleue de l'en-tête — la sortie qui compte. */
    garder: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    garderMot: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
    /* Les pastilles d'état : une rangée qui défile, sans barre. */
    pucesCadre: { flexGrow: 0 },
    puces: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
    puce: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 36,
      paddingHorizontal: 13,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
    },
    puceOn: { backgroundColor: c.ink, borderColor: c.ink },
    puceOk: { backgroundColor: `${c.green}1F`, borderColor: `${c.green}33` },
    puceAVoir: { backgroundColor: `${c.amber}24`, borderColor: `${c.amber}40` },
    puceMot: { color: c.inkSoft, fontSize: 13, fontWeight: '600' },
    puceMotOn: { color: '#FFFFFF' },
    puceMotOk: { color: c.green },
    puceMotAVoir: { color: c.ink },
    /* La règle dépliée sous les pastilles : ce qu'elle dit, et le geste. */
    regle: {
      marginHorizontal: 16,
      marginTop: 4,
      padding: 12,
      gap: 10,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
    },
    regleTexte: { color: c.inkSoft, fontSize: 12.5, lineHeight: 18 },
    regleFix: {
      alignSelf: 'flex-start',
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: c.blue,
      justifyContent: 'center',
    },
    regleFixMot: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    /* Le mur, dans sa carte : toute la place que les deux autres laissent. */
    scene: {
      flex: 1,
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 10,
      borderRadius: radius.lg,
      backgroundColor: c.surface,
      // Un filet, pas une ombre : `overflow: hidden` — qui arrondit le
      // dessin — effacerait l'ombre sur iOS.
      borderWidth: 1,
      borderColor: c.line,
      overflow: 'hidden',
    },
    canvas: { flex: 1 },
    vide: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 14,
      alignItems: 'center',
    },
    videMot: {
      color: c.inkFaint,
      fontSize: 13,
      fontWeight: '600',
      backgroundColor: c.surfaceSunken,
      overflow: 'hidden',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    /* LE DOCK — la feuille d'en bas, toujours là, sous le pouce. */
    dock: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingTop: 16,
      paddingHorizontal: 16,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -4 },
      elevation: 8,
    },
    dockTitre: {
      color: c.ink,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    dockSous: {
      color: c.inkFaint,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 2,
    },
    familles: { gap: 6, paddingVertical: 12 },
    familleBtn: {
      height: 34,
      paddingHorizontal: 14,
      borderRadius: 17,
      backgroundColor: c.surfaceSunken,
      justifyContent: 'center',
    },
    familleOn: { backgroundColor: c.ink },
    familleMot: { color: c.inkSoft, fontSize: 13, fontWeight: '600' },
    familleMotOn: { color: '#FFFFFF' },
    cartes: { gap: 10, paddingBottom: 2 },
    /** La carte d'un appareil : sa photo, son nom, sa hauteur type. */
    carte: {
      width: 104,
      padding: 10,
      borderRadius: radius.md,
      backgroundColor: c.bg,
      alignItems: 'center',
    },
    carteImage: { height: 54, alignItems: 'center', justifyContent: 'center' },
    carteMot: {
      color: c.ink,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 6,
      minHeight: 30,
    },
    carteCote: {
      color: c.inkFaint,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
    /* LA FICHE de l'appareil tenu. */
    ficheTete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    ficheVignette: {
      width: 52,
      height: 52,
      borderRadius: 14,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ficheTextes: { flex: 1, minWidth: 0 },
    ficheTitre: {
      color: c.ink,
      fontSize: 16.5,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    ficheSous: {
      color: c.inkFaint,
      fontSize: 12.5,
      fontWeight: '600',
      marginTop: 1,
    },
    ficheSousKO: { color: c.danger },
    hauteurs: { gap: 6, paddingTop: 10 },
    hauteur: {
      height: 32,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: c.surfaceSunken,
      justifyContent: 'center',
    },
    hauteurOn: { backgroundColor: c.blue },
    hauteurMot: {
      color: c.inkSoft,
      fontSize: 12.5,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    hauteurMotOn: { color: '#FFFFFF' },
    gestes: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 12,
    },
    geste: { alignItems: 'center', minWidth: 56, gap: 4 },
    gesteRond: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gesteRondDanger: { backgroundColor: `${c.danger}1A` },
    gesteMot: { color: c.inkSoft, fontSize: 11, fontWeight: '600' },
    /* La loupe : une carte franche, lisible sur n'importe quel mur. */
    loupe: {
      position: 'absolute',
      width: LOUPE_L,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.blue,
      paddingVertical: 8,
      ...shadowCard,
    },
    loupeCotes: {
      color: c.ink,
      fontSize: 19,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    loupeHauteur: {
      color: c.inkSoft,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 1,
    },
    /*
      CE QUE VAUT LA PHOTO DU CALQUE, dit en toutes lettres.

      Posee sur une elevation cotee, elle se prend pour une elevation cotee.
      Elle ne l'est pas — prise a main levee, de biais, elle ne mesure rien —
      et le dire est la seule facon honnete de la montrer.
    */
    calqueNote: {
      position: 'absolute',
      left: 10,
      right: 10,
      top: 8,
      textAlign: 'center',
      color: c.inkFaint,
      fontSize: 10.5,
      fontWeight: '700',
    },
    // L'ensemble, en UNE ligne de commandes : le côté, l'axe, et de quoi
    // défaire. L'ancien pavé posait une question à laquelle l'appareil avait
    // déjà répondu — il était rangé avant même qu'on lise le titre.
    ens: {
      marginTop: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    ensHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    ensPastille: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ensPastilleText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },
    ensTitres: { flex: 1, minWidth: 0 },
    ensTitre: { color: c.ink, fontSize: 12.5, fontWeight: '600' },
    ensSous: { color: c.inkFaint, fontSize: 9.5, fontWeight: '700' },
    ensOk: {
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingHorizontal: 18,
      // 44 points de haut : la cible tactile minimale d'iOS, pas un
      // arrondi de mise en page.
      minHeight: 44,
      justifyContent: 'center',
    },
    ensOkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    /** Le titre d'un sélecteur, comme les en-têtes de section d'iOS. */
    ensLabel: {
      color: c.inkFaint,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.6,
      marginTop: 12,
      marginBottom: 5,
    },
    /** Le rail d'un sélecteur segmenté : fond creux, pastilles dedans. */
    ensSeg: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: radius.sm,
      padding: 3,
      gap: 3,
    },
    ensSegItem: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.sm - 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    ensSegLarge: {
      flex: 1,
      minHeight: 46,
      borderRadius: radius.sm - 2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      gap: 1,
    },
    ensSegItemOn: { backgroundColor: c.blue },
    ensSegText: { color: c.ink, fontSize: 11.5, fontWeight: '600' },
    ensSegTextOn: { color: '#FFFFFF' },
    ensSegHint: { color: c.inkFaint, fontSize: 9, fontWeight: '700' },
    ensSegHintOn: { color: '#FFFFFFCC' },
    ensSplit: {
      marginTop: 10,
      minHeight: 44,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ensSplitText: { color: c.danger, fontSize: 13, fontWeight: '600' },
    fusion: {
      marginTop: 10,
      backgroundColor: c.blueSoft,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    fusionHead: { flexDirection: 'row', alignItems: 'center' },
    fusionTitle: { color: c.blue, fontSize: 13, fontWeight: '600', flex: 1 },
    fusionNon: { color: c.inkFaint, fontSize: 12.5, fontWeight: '700' },
    fusionRule: {
      color: c.inkSoft,
      fontSize: 10.5,
      lineHeight: 14,
      marginTop: 2,
    },
    fusionCotes: { flexDirection: 'row', gap: 8, marginTop: 9 },
    fusionCote: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.sm,
      paddingVertical: 8,
    },
    fusionCoteText: {
      color: c.inkSoft,
      fontSize: 9.5,
      fontWeight: '700',
      marginTop: 2,
    },
    // Un texte, pas une bulle : un cadre posé sur le dessin cache
    // justement l'appareil dont il parle. Le liseré clair derrière les
    // lettres suffit à les détacher du fond.
    alerte: {
      position: 'absolute',
      width: 200,
      alignItems: 'center',
    },
    alerteTexte: {
      color: c.danger,
      fontSize: 12.5,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor: c.surface,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 4,
    },
    alerteFixe: {
      color: c.inkSoft,
      fontSize: 11.5,
      fontWeight: '600',
    },
    // Un pavé de flèches larges : 44 px, la cible minimale d'un pouce.
    pave: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
    },
    pavePas: {
      backgroundColor: c.blue,
      borderRadius: 22,
      paddingHorizontal: 14,
      height: 44,
      justifyContent: 'center',
    },
    pavePasText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
    paveBtn: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    percage: {
      marginTop: 8,
      backgroundColor: c.blueSoft,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    percageTitle: {
      color: c.blue,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    percageVals: {
      color: c.ink,
      fontSize: 15,
      fontWeight: '600',
      marginTop: 2,
    },
    percageUnit: { color: c.inkFaint, fontSize: 10.5, fontWeight: '700' },
    fields: { flexDirection: 'row', gap: 8, marginTop: 14 },
    field: { flex: 1 },
    fieldLabel: {
      color: c.inkFaint,
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 4,
    },
    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 12,
    },
    fieldInput: {
      flex: 1,
      color: c.ink,
      fontSize: 16,
      fontWeight: '700',
      paddingVertical: 9,
    },
    fieldUnit: { color: c.inkFaint, fontSize: 12, fontWeight: '600' },
  }),
);
