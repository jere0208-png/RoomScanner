import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import {
  Alert,
  Animated,
  Image,
  Easing,
  Platform,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { RoomScan } from 'react-native-room-scan';
import { useTheme } from '../theme';
import { getStyles } from './result/styles';
import { fr } from './result/format';
import { AddRoomSheet } from './result/AddRoomSheet';
import { ElecSheet } from './result/ElecSheet';
import { ExportSheet } from './result/ExportSheet';
import { FurnitureSheet } from './result/FurnitureSheet';
import { PhotoSheet } from './result/PhotoSheet';
import { RenameSheet } from './result/RenameSheet';
import { RoomNameSheet } from './result/RoomNameSheet';
import { Toolbar2D, Toolbar3D } from './result/ResultToolbar';
import {
  FloorplanEditor,
  type VuePlan,
} from '../components/FloorplanEditor';
import { SidePill } from '../components/SidePill';
import { CeilingBar } from '../components/CeilingBar';
import { ObjectBar } from '../components/ObjectBar';
import { poserAuxNormes } from '../geometry/auto';
import { RoomBar } from '../components/RoomBar';
import { StripBar } from '../components/StripBar';
import {
  PILL_CELL_H,
  PILL_GAP,
  ToolPill,
} from '../components/ToolPill';
import { ChevronsUpDown } from 'lucide-react-native';
import Svg, { Path as Trace } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import {
  DEFAULT_VIEW3D,
  Iso3DView,
  type View3DParams,
} from '../components/Iso3DView';
import {
  fitsInRoom,
  planFrameAngle,
  roomOf,
  wallQuadsOf,
  roomExtent,
  roomHeight,
  roomParts,
  segLength,
  totalArea,
  type RoomPart,
} from '../geometry/floorplan';
import { hasCapturedColors, pointInPolygon } from '../geometry/appearance';
import { planRoutes } from '../geometry/elecplan';
import { fixtureMarks } from '../geometry/schema';
import {
  volumeAt,
  volumeVerdict,
  wetZones,
  type VolumeVerdict,
} from '../geometry/volumes';
import { buyingList, pullSchedule } from '../geometry/conduits';
import {
} from '../geometry/furniture';
import { type CatalogItem } from '../geometry/catalogue';
import { buildObj, objFilename } from '../export/model3d';
import { checkPlan } from '../geometry/diagnostics';
import {
  checkElectrical,
  planCircuits,
  roomUse,
  worktopsOnWall,
  type Worktop,
  constatsDePose,
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../geometry/nfc15100';
import { buildMaterialPdf, materialFilename, toBase64 } from '../export/pdf';
import { buildMetreCsv, metreFilename, type RoomMetre } from '../export/csv';
import {
  FIXTURES,
  faceX,
  facePoint,
  interiorSide,
  wallFace,
  type Fixture,
  type FixtureKind,
} from '../geometry/electrical';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScanStore } from '../store/scanStore';
import { DiagnosticSheet, type Constat } from '../components/DiagnosticSheet';
import { ClientTour } from '../components/ClientTour';
import { EnAttente } from '../components/PendingPill';
import {
  CEILINGS,
  spreadPoints,
  type CeilingKind,
  type SpotAxis,
} from '../geometry/ceiling';
import { haptic } from '../ui/haptic';
import {
  ActionSheet,
  PromptSheet,
  type ActionData,
  type PromptData,
} from '../components/Sheet';

type Tab = '2d' | '3d';


/**
 * Ce qui peut COMMANDER un point lumineux.
 *
 * Une prise n'allume rien. Le rappeler ici évite de tracer sur le plan un
 * lien qui n'existe pas dans la réalité — et un plan qui ment est pire
 * qu'un plan incomplet.
 */
const COMMANDES_MURALES: FixtureKind[] = [
  'inter',
  'inter2',
  'inter3',
  'va',
  'poussoir',
  'variateur',
];

/** Le saut de ligne des rapports, ecrit une fois. */
const SAUT = String.fromCharCode(10);

export function ResultScreen() {
  /**
   * CE QUE LE SYSTÈME OCCUPE EN BAS, et qu'on lui laisse.
   *
   * La barre d'outils touchait le bord : sur un iPhone récent, l'indicateur
   * d'accueil traversait les mots « Meubles » et « Surfaces ». Toutes les
   * applications réservent cette bande ; on fait pareil, en la demandant au
   * système plutôt qu'en la codant en dur.
   */
  const marges = useSafeAreaInsets();
  const basSysteme = Math.max(marges.bottom, 10);
  /*
    UNE SAUVEGARDE PERDUE SE DIT TOUT DE SUITE.

    Le stockage d'un téléphone se remplit, et un relevé chargé en photos peut
    ne pas s'écrire. L'échec était avalé en silence : on repartait du chantier
    en croyant son dossier enregistré. C'est le seul défaut de cette
    application qui pouvait coûter une visite entière.
  */
  const panne = useScanStore((st) => st.panne);
  useEffect(() => {
    if (!panne) return;
    Alert.alert('Enregistrement impossible', panne.message, [
      { text: 'Compris', onPress: () => useScanStore.getState().oublierPanne() },
    ]);
  }, [panne]);
  const { width: winLargeur } = useWindowDimensions();
  /*
    COMBIEN DE CALQUES TIENNENT SUR LA LIGNE DU BAS ?

    La carte du plan occupe la largeur de l'écran moins les douze points de
    marge de la page, de chaque côté. On la calcule plutôt que de la mesurer :
    un `onLayout` posé sur cette carte-là — qui est une vue animée, pilotée
    par le fil natif — déclenche un rendu en plein milieu de la bascule
    2D/3D, et l'animation se retrouve à écrire dans un nœud déjà démonté.
    La hauteur de la pile d'actions, elle, se mesure sans risque : c'est une
    vue ordinaire.
  */
  const carteW = Math.max(0, winLargeur - 24);
  const [hActions, setHActions] = useState(0);
  /**
   * TROIS ÉTAGES AU BAS DE LA CARTE, ET RIEN QUI DÉBORDE.
   *
   * Le blanc du plan descend maintenant jusqu'au bord de la carte — c'est
   * lui le fond des commandes. On remonte donc chaque étage à la main :
   * la marge système d'abord (la barre d'accueil de l'iPhone), puis la
   * rangée des calques, puis le bandeau contextuel au-dessus d'elle.
   * Auparavant la carte portait cette marge en PADDING : le blanc s'arrêtait
   * plus haut, et les pastilles tombaient sur le gris de la page.
   */
  const ligneOutils = basSysteme + 8;
  const ligneBandeau = ligneOutils + PILL_CELL_H + PILL_GAP;
  const walls = useScanStore((s) => s.walls);
  const objects = useScanStore((s) => s.objects);
  const scanName = useScanStore((s) => s.scanName);
  const saves = useScanStore((s) => s.saves);
  const photos = useScanStore((s) => s.photos);
  const removePhoto = useScanStore((s) => s.removePhoto);
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const setWallLength = useScanStore((s) => s.setWallLength);
  const renameCurrent = useScanStore((s) => s.renameCurrent);
  const saveAsCopy = useScanStore((s) => s.saveAsCopy);
  const dirty = useScanStore((s) => s.dirty);
  const commitCurrent = useScanStore((s) => s.commitCurrent);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  const rooms = useScanStore((s) => s.rooms);
  const removeRoom = useScanStore((s) => s.removeRoom);
  const addOpening = useScanStore((s) => s.addOpening);
  const resultOrigin = useScanStore((s) => s.resultOrigin);
  const removeObject = useScanStore((s) => s.removeObject);
  const resizeObject = useScanStore((s) => s.resizeObject);
  const setRoomName = useScanStore((s) => s.setRoomName);
  const setRoomHeight = useScanStore((s) => s.setRoomHeight);
  const setWallHeight = useScanStore((s) => s.setWallHeight);
  const setObjectHeight = useScanStore((s) => s.setObjectHeight);
  const mergeRooms = useScanStore((s) => s.mergeRooms);
  const splitRoom = useScanStore((s) => s.splitRoom);
  const removeWall = useScanStore((s) => s.removeWall);
  const undo = useScanStore((s) => s.undo);
  const canUndo = useScanStore((s) => s.canUndo);
  const openings = useScanStore((s) => s.openings);
  const fixtures = useScanStore((s) => s.fixtures);
  const addFixture = useScanStore((s) => s.addFixture);
  const ceiling = useScanStore((s) => s.ceiling);
  const addCeiling = useScanStore((s) => s.addCeiling);
  const addRoomBox = useScanStore((s) => s.addRoomBox);
  const moveRoom = useScanStore((s) => s.moveRoom);
  const removeCeiling = useScanStore((s) => s.removeCeiling);
  const moveCeiling = useScanStore((s) => s.moveCeiling);
  const setCeilingRow = useScanStore((s) => s.setCeilingRow);
  const removeCeilingRow = useScanStore((s) => s.removeCeilingRow);
  const toggleCeilingCommand = useScanStore((s) => s.toggleCeilingCommand);
  const moveFixture = useScanStore((s) => s.moveFixture);
  const resizeOpening = useScanStore((s) => s.resizeOpening);
  const addObject = useScanStore((s) => s.addObject);
  const rotateObject = useScanStore((s) => s.rotateObject);

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? null;
  /**
   * Renonce au meuble qu'on vient de poser.
   *
   * C'est un geste EXPLICITE — la croix de la fiche —, jamais un effet de
   * bord d'un appui sur le plan : supprimer ce qu'on tient parce que le
   * doigt a manqué la poignée de six pixels serait insupportable.
   */
  const cancelObject = () => {
    if (draftObject) removeObject(draftObject);
    setDraftObject(null);
    setSelectedObjectId(null);
  };

  /**
   * Valider, c'est ADOPTER le meuble : il cesse d'être provisoire.
   *
   * Les cotes, elles, sont déjà posées — chacune part vers le magasin
   * quand on la valide dans sa feuille. Il n'y a donc plus rien à lire ici
   * au moment de fermer, et plus de clavier à congédier.
   */
  const applyObjectDims = () => {
    setDraftObject(null);
  };
  const setScreen = useScanStore((s) => s.setScreen);
  const reset = useScanStore((s) => s.reset);
  const teinte = useTheme();
  const styles = getStyles(teinte);
  // Les bandeaux contextuels se posent au-dessus de la rangée de calques.
  const stylesBarres = useMemo(
    () => ({
      ...styles,
      wallStrip: [styles.wallStrip, { bottom: ligneBandeau }],
      editBar: [styles.editBar, { bottom: ligneBandeau }],
    }),
    [styles, ligneBandeau],
  );


  const [tab, setTab] = useState<Tab>('2d');
  /** Calque des cheminements de gaines (métré à l'appui). */
  const [showRoutes, setShowRoutes] = useState(false);
  /*
    L'APPAREILLAGE SE COUPE, mais il revient allumé.

    C'est le sujet de l'application : on ouvre un relevé pour voir ses
    prises. Le calque est donc local à l'écran et repart allumé à chaque
    ouverture — l'éteindre est un geste ponctuel, « pour voir dessous », pas
    un réglage qu'on garde et qu'on oublie.
  */
  const [showFixtures, setShowFixtures] = useState(true);
  /** Photo de repérage ouverte en grand. */
  const [photoVue, setPhotoVue] = useState<string | null>(null);
  /**
   * Le passage du plan à la 3D : un basculement, pas une coupure.
   *
   * Sec, on perd le repère de ce qu'on regardait — le dessin change de
   * nature en une image. La vue sortante s'enfonce et s'efface, la nouvelle
   * revient de l'avant : 260 ms en tout, assez pour lier les deux, trop peu
   * pour attendre.
   */
  const bascule = useRef(new Animated.Value(1)).current;
  const [vue, setVue] = useState<Tab>('2d');
  useEffect(() => {
    if (vue === tab) return;
    let vivant = true;
    Animated.timing(bascule, {
      toValue: 0,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      if (!vivant) return;
      setVue(tab);
      Animated.timing(bascule, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  
  return () => {
      vivant = false;
    };
  }, [tab, vue, bascule]);
  // Pièce visée par l'outil « nom de pièce » et par la suppression.
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  // Diagnostic du plan : ce dont il faut se méfier après un scan.
  const [checking, setChecking] = useState(false);
  // Choix du format d'export : plan PDF, modèle 3D, ou image de la vue.
  const [exporting, setExporting] = useState(false);
  /** La feuille « Ajouter une pièce » : nom, largeur, profondeur. */
  const [ajoutPiece, setAjoutPiece] = useState(false);
  /** La présentation guidée, plein écran : ce qu'on montre au client. */
  const [visite, setVisite] = useState(false);
  // Vue 3D : bascule « vue de dessus », comme un plan.
  const [view3d, setView3d] = useState<View3DParams>(DEFAULT_VIEW3D);
  /*
    LE PLAN SE RELÈVE EN VOLUME, ET SE RABAT EN PLAN.

    Relevé du chantier : « au passage du 2D au 3D et inversement, le plan
    doit se placer exactement comme l'autre ; ajoute une rapide animation,
    comme si le 2D se construisait en 3D ».

    Les deux vues partagent la même projection : la 3D vue à PLAT — aucune
    inclinaison — EST le plan, au repaire près. La bascule n'a donc rien à
    inventer : on entre en 3D à plat, dans l'orientation exacte du plan, et
    l'on relève l'inclinaison en quatre cent cinquante millisecondes. Les
    murs semblent sortir du papier. Au retour, on rabat d'abord, on change
    de vue ensuite : le dessin ne saute jamais.
  */
  const [vuePlan, setVuePlan] = useState<VuePlan>({
    zoom: 1,
    ox: 0,
    oy: 0,
    rot: 0,
  });
  const view3dRef = useRef(view3d);
  view3dRef.current = view3d;
  const releve = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Un relèvement est demandé, dès que la vue 3D paraîtra. */
  const attendReleve = useRef(false);
  useEffect(() => () => {
    if (releve.current) clearInterval(releve.current);
  }, []);
  /** À plat : la 3D est alors exactement le plan. */
  const TILT_PLAN = 1;
  /** Et l'inclinaison où le volume se lit le mieux. */
  const TILT_VOLUME = DEFAULT_VIEW3D.tilt;
  /** Relève (ou rabat) l'inclinaison, puis passe la main. */
  const incliner = (de: number, vers: number, fini?: () => void) => {
    if (releve.current) clearInterval(releve.current);
    const t0 = Date.now();
    const duree = 450;
    releve.current = setInterval(() => {
      const t = Math.min(1, (Date.now() - t0) / duree);
      // Départ franc, arrivée douce : le geste d'un plan qu'on relève.
      const e = 1 - Math.pow(1 - t, 3);
      setView3d((v) => ({ ...v, tilt: de + (vers - de) * e }));
      if (t >= 1) {
        if (releve.current) clearInterval(releve.current);
        releve.current = null;
        fini?.();
      }
    }, 16);
  };
  useEffect(() => {
    if (vue !== '3d' || !attendReleve.current) return;
    attendReleve.current = false;
    incliner(TILT_PLAN, TILT_VOLUME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue]);
  const basculerVue = () => {
    if (releve.current) return;
    if (vue === '2d') {
      // On entre à PLAT, dans l'orientation, le zoom et le cadrage du plan.
      setView3d({
        theta: (vuePlan.rot * 180) / Math.PI,
        tilt: TILT_PLAN,
        zoom: vuePlan.zoom,
        ox: vuePlan.ox,
        oy: vuePlan.oy,
      });
      setTab('3d');
      // Le relèvement attend que la vue 3D soit à l'écran : la bascule
      // commence par un fondu de cent dix millisecondes, et un quart du
      // mouvement s'y perdrait — on verrait le volume déjà levé.
      attendReleve.current = true;
    } else {
      // On rabat d'abord ; le plan reprendra ce cadrage-là.
      incliner(view3dRef.current.tilt, TILT_PLAN, () => {
        const v = view3dRef.current;
        setVuePlan({
          zoom: v.zoom,
          ox: v.ox,
          oy: v.oy,
          rot: (v.theta * Math.PI) / 180,
        });
        setTab('2d');
        setView3d((x) => ({ ...x, tilt: TILT_VOLUME }));
      });
    }
  };
  // Coupe : index de la pièce isolée en 3D (-1 = tout le logement).
  const [focusIdx, setFocusIdx] = useState(-1);
  // Cotes du plan 2D masquées par défaut : la pastille « Cotes » les active.
  const [showMeasures, setShowMeasures] = useState(false);
  const [show3DMeasures, setShow3DMeasures] = useState(true);
  /**
   * Le retour de mur choisi sur le plan.
   *
   * Un mur percé d'une porte est fait de retours — les bouts de maçonnerie
   * entre l'angle et l'huisserie — et c'est SUR EUX qu'on pose
   * l'interrupteur d'entrée. En choisir un puis demander un appareil doit
   * le mettre là, pas au milieu du mur.
   */
  const [pier, setPier] = useState<{
    wallId: string;
    t0: number;
    t1: number;
  } | null>(null);
  /**
   * Le calque PLAFOND : points lumineux, détecteurs, caméras, VMC.
   *
   * Affiché par-dessus le sol et son mobilier, il devient vite illisible —
   * on ne regarde pas les deux en même temps. Il s'éteint donc, comme les
   * autres calques, et c'est le premier réflexe quand on veut revoir le
   * plan de sol.
   */
  const [showCeiling, setShowCeiling] = useState(true);
  /** Appareil de plafond en attente de pose : on touche la pièce qui le reçoit. */
  const [pendingCeiling, setPendingCeiling] = useState<CeilingKind | null>(null);
  /**
   * LA LIGNE de spots tenue en main, s'il y en a une.
   *
   * On touche un spot d'une ligne : c'est LA LIGNE qu'on attrape — c'est
   * elle qu'on veut retourner ou retirer neuf fois sur dix. Un second
   * appui sur le même spot le détache de sa ligne et le rend seul, pour
   * le réglage au centimètre. Deux niveaux, un seul geste à apprendre.
   */
  const [selRow, setSelRow] = useState<string | null>(null);
  /** Nombre de spots à répartir dans la prochaine pièce touchée. */
  const [pendingSpots, setPendingSpots] = useState<number | null>(null);
  /**
   * Point de plafond en attente de COMMANDE : on touche l'interrupteur.
   *
   * C'est le geste qui manquait pour faire un plan d'électricien. Le trait
   * pointillé entre un interrupteur et le point qu'il allume ne se devine
   * pas — aucune règle ne dit que la commande la plus proche est la bonne,
   * et c'est justement la question qu'on se pose sur le chantier. Il faut
   * donc que quelqu'un le désigne, une fois.
   */
  /** La liaison en cours : les points de plafond qui attendent leur
   *  commande — un seul, ou toute une ligne de spots. */
  const [pendingLink, setPendingLink] = useState<string[] | null>(null);
  /**
   * L'origine des cotes d'une pièce, DANS LA TRAME DU LOGEMENT.
   *
   * Un point lumineux ne se cote pas « en x = 3,42 » : ça ne veut rien dire
   * sur un chantier. Il se cote depuis deux murs — et depuis des murs
   * PERPENDICULAIRES, pas depuis les axes du scan.
   *
   * ARKit oriente son repère selon l'endroit où le relevé a commencé : un
   * logement scanné de biais donnait des cotes en écharpe, qui ne
   * correspondaient à aucun mur. On travaille donc dans la trame, la même
   * qui redresse le plan et qui oriente les traits de dégagement.
   */
  const trame = useMemo(() => planFrameAngle(walls), [walls]);
  /** Appareil de plafond en cours de réglage : le plan se dégage pour lui. */
  const [selCeiling, setSelCeiling] = useState<string | null>(null);

  /**
   * UN SEUL GESTE EN ATTENTE À LA FOIS.
   *
   * Chaque mode d'attente — poser un appareil mural, poser au plafond,
   * relier une commande, régler un point — vivait dans son coin. On
   * choisissait un spot, puis on demandait un meuble : le spot restait en
   * attente, invisible, et c'est LUI qui recevait l'appui suivant. Le
   * meuble n'apparaissait jamais, sans qu'on comprenne pourquoi.
   *
   * Commencer un geste annule donc les autres. C'est la règle que l'on
   * attend d'un outil : ce qu'on vient de demander l'emporte sur ce qu'on
   * avait demandé avant et laissé en plan.
   */
  const seulGeste = useCallback(
    (garde?: 'mur' | 'plafond' | 'lien' | 'reglage') => {
      if (garde !== 'mur') setPendingKind(null);
      if (garde !== 'plafond') {
        setPendingCeiling(null);
        setPendingSpots(null);
      }
      if (garde !== 'lien') setPendingLink(null);
      if (garde !== 'reglage') setSelCeiling(null);
    },
    [],
  );
  /** Repères électriques en 3D : un calque comme les autres. */
  const [showElecTags, setShowElecTags] = useState(true);
  /**
   * Les points cardinaux : un calque, lui aussi — ÉTEINT au départ.
   *
   * Ils disent de quel mur on parle, et c'est précieux au moment de
   * désigner un mur dans le dossier. Mais on ouvre un plan pour lire des
   * cotes, pas une boussole : quatre pastilles au bord du cadre prennent
   * la place de ce qu'on est venu voir, à chaque ouverture, alors qu'on ne
   * s'en sert qu'à l'occasion. Le bouton les rallume en un geste, et le
   * dossier imprimé, lui, porte toujours sa rose des vents.
   */
  const [showNorth, setShowNorth] = useState(false);
  const [editMode, setEditMode] = useState(false);
  /**
   * Jeu de pastilles affiché. Il RETARDE sur `editMode` : les anciennes
   * pastilles rentrent d'abord dans le bouton d'édition, les nouvelles en
   * ressortent ensuite. Passer par un état séparé plutôt que par `editMode`
   * lui-même permet au plan de basculer tout de suite — c'est la barre, et
   * elle seule, qui prend le temps de l'animation.
   */
  const [barMode, setBarMode] = useState(false);
  const swap = useRef(new Animated.Value(1)).current;
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  /**
   * UN SEUL OBJET SÉLECTIONNÉ À LA FOIS.
   *
   * Chaque appui posait sa propre sélection et oubliait d'éteindre les
   * autres : on touchait un mur en gardant un meuble pris, et deux
   * bandeaux se disputaient le bas de l'écran — celui du meuble et celui
   * du mur. Le pire cas était silencieux : un appareil de plafond restait
   * en réglage sous un mur sélectionné, et les flèches déplaçaient le
   * point lumineux qu'on ne regardait plus.
   *
   * La règle est celle d'un plan papier : ce qu'on désigne remplace ce
   * qu'on désignait. `seuleSelection('mur')` éteint tout sauf le mur ;
   * sans argument, elle éteint tout — c'est l'appui dans le vide.
   */
  const seuleSelection = useCallback(
    (garde?: 'mur' | 'meuble' | 'piece' | 'ouverture' | 'plafond') => {
      if (garde !== 'mur') setSelectedWallId(null);
      if (garde !== 'meuble') setSelectedObjectId(null);
      if (garde !== 'piece') setSelectedRoomId(null);
      if (garde !== 'ouverture') setSelectedOpeningId(null);
      if (garde !== 'plafond') {
        setSelCeiling(null);
        setSelRow(null);
      }
    },
    [],
  );
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  // Electricite : un seul panneau, qui montre soit le catalogue d'appareils,
  // soit le mur vu de face. Deux fenetres empilees se marchent dessus sur
  // iOS — celle-ci change de contenu plutot que d'en ouvrir une seconde.
  const [elecOpen, setElecOpen] = useState(false);
  const [elecView, setElecView] = useState<'catalogue' | 'mur'>('catalogue');
  const [elecWallId, setElecWallId] = useState<string | null>(null);
  const [elecSel, setElecSel] = useState<string | null>(null);
  // Appareil choisi alors qu'aucun mur n'etait designe : on attend l'appui.
  const [pendingKind, setPendingKind] = useState<FixtureKind | null>(null);
  // Nos fenêtres : une pour les choix, une pour les valeurs à saisir.
  const [menu, setMenu] = useState<ActionData | null>(null);
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  // Catalogue de mobilier : ouvert par le « + » posé à côté du calque meubles.
  const [catalogue, setCatalogue] = useState(false);
  // Cotes du meuble : à la demande. Le bandeau couvrait le plan en
  // permanence pour un réglage qu'on ne fait qu'une fois.
  const [objDims, setObjDims] = useState(false);
  const [quete, setQuete] = useState('');
  /**
   * Meuble tout juste posé, pas encore validé. Quitter sa fiche sans la
   * valider le retire : un meuble qu'on a posé pour voir ne doit pas rester
   * planté au milieu de la pièce.
   */
  const [draftObject, setDraftObject] = useState<string | null>(null);

  // Le diagnostic et la pose d'un appareil passent aussi en édition sans
  // toucher au bouton : l'animation est déclenchée par l'écart entre les
  // deux états, jamais par le geste, sinon la moitié des cas l'oublierait.
  useEffect(() => {
    if (editMode === barMode) return;
    Animated.timing(swap, {
      toValue: 0,
      duration: 130,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setBarMode(editMode);
      Animated.timing(swap, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }).start();
    });
  }, [editMode, barMode, swap]);

  const canvasRef = useRef<View>(null);
  const partageEnAttente = useRef<null | (() => void)>(null);

  // Départ vers l'export : ondes qui traversent toute la page puis fondu.
  const { width: winW, height: winH } = useWindowDimensions();
  const ringScale = (Math.max(winW, winH) * 2.4) / 120;
  const [transiting, setTransiting] = useState(false);
  const waveAnim = useRef(new Animated.Value(0)).current;
  const goExport = () => {
    if (transiting) return;
    setTransiting(true);
    waveAnim.setValue(0);
    Animated.timing(waveAnim, {
      toValue: 1,
      duration: 580,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setScreen('export');
      setTransiting(false);
    });
  };

  /**
   * Lance un partage APRÈS la fermeture de la fenêtre.
   *
   * iOS ne présente pas deux écrans à la fois : demander la feuille de
   * partage pendant que la fenêtre modale se referme, et elle ne s'ouvre
   * jamais — sans la moindre erreur. Rien ne se passait au clic sur
   * « Image » ou « Liste du matériel », alors que le PDF, lui, marchait :
   * il passe par un changement d'écran, qui laisse le temps.
   */
  const apresFermeture = (action: () => void) => {
    partageEnAttente.current = action;
    // Android n'a pas `onDismiss` : on retombe sur un délai.
    if (Platform.OS !== 'ios') setTimeout(() => lancerPartage(), 350);
  };

  /** Exécute le partage mis de côté, une fois la fenêtre vraiment fermée. */
  const lancerPartage = () => {
    const action = partageEnAttente.current;
    partageEnAttente.current = null;
    action?.();
  };

  /** Capture la vue affichée (2D ou 3D) en PNG — avec watermark EchoPlan —
   *  et ouvre le partage. Le watermark n'apparaît que sur l'image. */
  const [capturing, setCapturing] = useState(false);
  const shareImage = async () => {
    try {
      setCapturing(true);
      await new Promise<void>((r) => setTimeout(() => r(), 60)); // rendu du watermark
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      setCapturing(false);
      await RoomScan.shareFile(uri);
    } catch (e: any) {
      setCapturing(false);
      Alert.alert('Capture impossible', e?.message ?? 'Erreur inconnue');
    }
  };

  /**
   * Partage le modèle 3D construit à partir de NOTRE plan — murs déplacés,
   * pièces fusionnées, cloisons ajoutées comprises. Le `.usdz` de RoomPlan,
   * lui, ignore toutes les retouches ; il reste accessible par « Modèle AR ».
   */
  const shareObj = async () => {
    try {
      const obj = buildObj(
        { walls, openings, objects, rooms, fixtures },
        scanName,
      );
      await RoomScan.shareText(obj, objFilename(scanName));
    } catch (e: any) {
      Alert.alert('Export impossible', e?.message ?? 'Erreur inconnue');
    }
  };

  /**
   * La liste du matériel : ce qu'on envoie à un client ou à un fournisseur.
   * Elle sort du même relevé que le plan — pièces, appareils, circuits — et
   * n'a donc rien à ressaisir.
   */
  const shareMaterial = async () => {
    try {
      const list = materialList(
        roomInputs,
        fixtures,
        wallRooms,
        placement,
        cheminements?.parCircuit,
        ceiling,
      );
      // Les constats de pose rejoignent la conformité du document.
      list.issues.push(...constatsDePose(walls, openings, roomInputs, fixtures));
      // Le tirage et la commande : ce qu'un patron lit avant le reste.
      const pull = pullSchedule(
        list.circuits,
        cheminements?.metre,
        cheminements?.approx,
      );
      const tirage = { pull, buy: buyingList(pull, fixtures, ceiling) };
      const bytes = buildMaterialPdf(scanName, list, tirage);
      await RoomScan.sharePDF(toBase64(bytes), materialFilename(scanName));
    } catch (e: any) {
      Alert.alert('Export impossible', e?.message ?? 'Erreur inconnue');
    }
  };

  /**
   * LE MÉTRÉ EN TABLEUR — les mêmes chiffres, dans des colonnes.
   *
   * Le PDF se remet ; le tableur se chiffre. On y ajoute ce que le PDF ne
   * porte pas, faute de place : le périmètre de chaque pièce et sa surface
   * murale, qui commandent les saignées, les plinthes et les gaines.
   */
  const shareCsv = async () => {
    try {
      const list = materialList(
        roomInputs,
        fixtures,
        wallRooms,
        placement,
        cheminements?.parCircuit,
        ceiling,
      );
      // Le CSV chiffre AUSSI les constats : mêmes yeux que le PDF.
      list.issues.push(...constatsDePose(walls, openings, roomInputs, fixtures));
      const metre: RoomMetre[] = parts.map((p) => {
        const nom = rooms.find((r) => r.id === p.roomId)?.name;
        // Le périmètre se prend sur le CONTOUR, pas sur la somme des murs :
        // un refend borde deux pièces, il ne compte qu'une fois de chaque
        // côté, et un mur qui dépasse ne rallonge pas la pièce.
        const pts = p.surface?.pts ?? [];
        let tour = 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          tour += Math.hypot(b.x - a.x, b.z - a.z);
        }
        return {
          name: nom || `Pièce ${parts.indexOf(p) + 1}`,
          area: p.surface?.area ?? null,
          perimeter: pts.length > 0 ? tour : null,
          height: roomHeight(p.walls),
          walls: p.walls.length,
        };
      });
      await RoomScan.shareText(
        buildMetreCsv(scanName, metre, list),
        metreFilename(scanName),
      );
    } catch (e: any) {
      Alert.alert('Export impossible', e?.message ?? 'Erreur inconnue');
    }
  };

  /**
   * Pose un meuble au centre de la pièce demandée, puis le sélectionne : un
   * meuble qu'on vient de poser, on va le déplacer.
   */
  const poserDans = (item: CatalogItem, cible: RoomPart | null) => {
    const at = cible?.labelAt ?? { x: 0, z: 0 };
    const id = addObject(item, at.x, at.z);
    setDraftObject(id);
    setQuete('');
    setCatalogue(false);
    setShowFurniture(true);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedObjectId(id);
    // Les cotes restent CACHÉES : on vient de poser un meuble, on veut le
    // placer, pas le redimensionner. La pastille de mesure les appellera.
    setObjDims(false);
  };

  /**
   * Choisit la pièce avant de poser.
   *
   * Deux garde-fous, parce qu'un meuble posé au petit bonheur est un meuble
   * qu'il faut ensuite rattraper au doigt : on refuse ce qui ne RENTRE pas
   * (un lit de 2 m dans un dégagement de 1,20 ne se place pas, il se
   * coince), et quand le scan compte plusieurs pièces on demande laquelle
   * plutôt que de parier sur la plus grande.
   */
  const placeObject = (item: CatalogItem) => {
    const salles = parts.filter((p) => p.surface);
    const boite = { width: item.w, depth: item.d };
    const possibles = salles.filter((p) => fitsInRoom(boite, p.surface!.pts));

    if (salles.length > 0 && possibles.length === 0) {
      const plus = salles
        .map((p) => roomExtent(p.surface!.pts))
        .sort((a, b) => b.width * b.depth - a.width * a.depth)[0];
      setCatalogue(false);
      setMenu({
        title: `${item.label} : trop grand`,
        subtitle: `Il lui faut ${fr(Math.min(item.w, item.d), 2)} × ${fr(
          Math.max(item.w, item.d),
          2,
        )} m de libre. La plus grande pièce du scan n'offre que ${fr(
          Math.min(plus.width, plus.depth),
          2,
        )} × ${fr(Math.max(plus.width, plus.depth), 2)} m.`,
        actions: [
          {
            label: 'Revenir au catalogue',
            hint: 'Choisir un meuble à la bonne taille',
            icon: 'sortir',
            onPress: () => setCatalogue(true),
          },
        ],
      });
      return;
    }

    if (possibles.length > 1) {
      setCatalogue(false);
      setMenu({
        title: `Où poser ${item.label.toLowerCase()} ?`,
        subtitle: 'Le meuble se pose au centre de la pièce choisie.',
        actions: possibles.map((p) => ({
          label: rooms.find((r) => r.id === p.roomId)?.name ?? 'Pièce',
          hint: `${fr(p.surface?.area ?? 0, 1)} m² au sol`,
          icon: 'piece' as const,
          onPress: () => poserDans(item, p),
        })),
      });
      return;
    }

    poserDans(item, possibles[0] ?? salles[0] ?? null);
  };

  /**
   * « Dernière MAJ » : la date d'enregistrement du scan ouvert.
   *
   * Tant qu'il reste des modifications en attente, on le dit plutôt que
   * d'afficher une date périmée — c'est l'information utile à ce
   * moment-là. Aujourd'hui et hier se nomment, au-delà on date.
   */
  const majTexte = (() => {
    if (dirty) return 'Modifications non enregistrées';
    const save = saves.find((s) => s.id === currentSaveId);
    if (!save) return null;
    const d = new Date(save.updatedAt);
    const heure = `${String(d.getHours()).padStart(2, '0')}h${String(
      d.getMinutes(),
    ).padStart(2, '0')}`;
    const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    const aujourdhui = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const ecart = Math.round((aujourdhui - jour) / 86400000);
    const quand =
      ecart <= 0
        ? `aujourd'hui à ${heure}`
        : ecart === 1
        ? `hier à ${heure}`
        : `le ${String(d.getDate()).padStart(2, '0')}/${String(
            d.getMonth() + 1,
          ).padStart(2, '0')} à ${heure}`;
    return `Dernière MAJ : ${quand}`;
  })();

  const selectedOpening =
    openings.find((o) => o.id === selectedOpeningId) ?? null;

  /** Retaille une menuiserie : sa largeur autour de son axe, sa hauteur
   *  depuis son allège. */
  const promptOpening = (id: string, quoi: 'largeur' | 'hauteur') => {
    const o = openings.find((x) => x.id === id);
    if (!o) return;
    const actuel = quoi === 'largeur' ? segLength(o) : o.height;
    setPrompt({
      title: quoi === 'largeur' ? 'Largeur de la menuiserie' : 'Hauteur de la menuiserie',
      subtitle:
        quoi === 'largeur'
          ? 'Elle se retaille autour de son axe.'
          : 'L’allège ne bouge pas : c’est le linteau qui suit.',
      value: actuel.toFixed(2).replace('.', ','),
      unit: 'm',
      numeric: true,
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (!(v > 0)) return;
        if (quoi === 'largeur') resizeOpening(id, v, undefined);
        else resizeOpening(id, undefined, v);
      },
    });
  };

  const selectedWall = walls.find((w) => w.id === selectedWallId) ?? null;
  const perimeter = walls.reduce((s, w) => s + segLength(w), 0);
  /*
    LE DÉCOUPAGE EN PIÈCES SE MÉMOÏSE — et pas seulement pour lui-même.

    Il était appelé nu, à chaque rendu de l'écran. C'est déjà du travail
    inutile ; le vrai coût était ailleurs : son résultat sert de DÉPENDANCE
    au cheminement des gaines et aux constats de conformité. Une référence
    neuve à chaque image, ce sont des `useMemo` qui ne mémoïsent plus rien —
    on recalculait tous les cheminements de câble du logement pendant qu'un
    doigt déplaçait un meuble.
  */
  const parts = useMemo(() => roomParts(walls, rooms), [walls, rooms]);
  const surface = totalArea(parts);
  // Une seule pièce : l'outil de nommage n'a pas besoin de sélection.
  const targetRoomId =
    selectedRoomId ?? (rooms.length === 1 ? rooms[0].id : null);
  const targetRoom = rooms.find((r) => r.id === targetRoomId) ?? null;
  const targetPart = parts.find((p) => p.roomId === targetRoomId) ?? null;
  const targetExtent = targetPart?.surface
    ? roomExtent(targetPart.surface.pts)
    : { width: 0, depth: 0, angle: 0 };
  // Deux familles de constats, une seule liste : celui qui regarde son plan
  // se moque de savoir si le défaut est géométrique ou électrique.
  /*
    TROIS CALCULS EN CHAÎNE — et c'est la chaîne qui coûtait.

    Chacun sert de dépendance au suivant, et le dernier sert au cheminement
    des gaines. Non mémoïsés, ils rendaient une référence neuve à chaque
    image : les `useMemo` qui en dépendent ne mémoïsaient donc plus rien, et
    l'on recalculait tous les cheminements de câble du logement pendant
    qu'un doigt déplaçait un meuble.

    `fixturePlacement` est le plus lourd des trois : il passe par
    `interiorSide`, qui redécoupe le logement pour CHAQUE appareil.
  */
  const roomInputs = useMemo(() => roomInputsOf(rooms, parts), [rooms, parts]);
  const wallRooms = useMemo(() => wallToRooms(roomInputs), [roomInputs]);
  const placement = useMemo(
    () => fixturePlacement(fixtures, walls, roomInputs),
    [fixtures, walls, roomInputs],
  );
  /**
   * Plans de travail par mur : la règle des 1,30 m dit « hors plan de
   * travail », encore faut-il savoir où il y en a un.
   */
  const wallWorktops = useMemo(() => {
    const quads = wallQuadsOf(walls);
    const m = new Map<string, { x: (f: Fixture) => number; plans: Worktop[] }>();
    for (const w of walls) {
      const piece = rooms.find((r) => r.id === roomOf(w));
      const cuisine = roomUse(piece?.name ?? '', piece?.kind) === 'cuisine';
      for (const side of [1, -1] as const) {
        const face = wallFace(w, quads.get(w.id), side);
        const plans = worktopsOnWall(face, objects, cuisine);
        if (plans.length === 0) continue;
        m.set(w.id, { x: (f: Fixture) => faceX(face, f.along), plans });
        break;
      }
    }
    return m;
  }, [walls, rooms, objects]);

  /**
   * Cheminement des gaines et métré : même source que l'export, pour que le
   * document et l'écran ne racontent jamais deux choses.
   */
  const cheminements = useMemo(
    () => planRoutes(walls, rooms, parts, fixtures, placement, ceiling),
    [walls, rooms, parts, fixtures, placement, ceiling],
  );

  /**
   * À QUELLE HAUTEUR ARRIVE CHAQUE GAINE.
   *
   * Le tracé s'arrête à l'aplomb de l'appareil ; c'est cette table qui dit
   * de combien le tube remonte ensuite — vingt-cinq centimètres pour une
   * prise, un mètre dix pour un interrupteur, la hauteur sous plafond pour
   * un point lumineux. Sans elle, le modèle montrait des gaines qui
   * s'arrêtent au sol, sous des appareils alimentés par magie.
   */
  const hauteursDesservies = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of fixtures) t[f.id] = f.height;
    for (const cl of ceiling) {
      const piece = parts.find((p) => p.roomId === cl.roomId);
      const h = (piece?.walls ?? walls).reduce((m, w) => Math.max(m, w.height), 0);
      t[cl.id] = h || 2.5;
    }
    return t;
  }, [fixtures, ceiling, parts, walls]);

  /**
   * Repère de circuit par appareil (C1, C2…).
   *
   * C'est ce qu'on lit sur le chantier : le plan dit quoi tirer où, et le
   * schéma unifilaire porte les mêmes repères. Ils se calculent sans
   * tableau posé — un circuit existe dès qu'il y a des appareils.
   */
  const marks = useMemo(() => {
    const pieceDe = (f: Fixture) =>
      rooms.find((r) => r.id === placement.get(f.id));
    return fixtureMarks(
      planCircuits(
        fixtures,
        (f) => pieceDe(f)?.name ?? '',
        (f) => roomUse(pieceDe(f)?.name ?? '', pieceDe(f)?.kind) === 'cuisine',
        (f) => pieceDe(f)?.id,
        ceiling,
      ),
    );
  }, [fixtures, rooms, placement, ceiling]);

  /**
   * Volumes de salle d'eau : le seul contrôle où une erreur est dangereuse.
   * Il ne s'active que si une baignoire ou une douche est posée — sans
   * mobilier, l'app ne peut rien affirmer, et le dire vaut mieux que
   * rassurer.
   */
  const volumes = useMemo(() => {
    const zones = wetZones(objects);
    const out = new Map<string, VolumeVerdict>();
    if (zones.length === 0) return out;
    const quads = wallQuadsOf(walls);
    const murs = new Map(walls.map((w) => [w.id, w]));
    for (const f of fixtures) {
      const w = murs.get(f.wallId);
      if (!w) continue;
      const piece = rooms.find((r) => r.id === placement.get(f.id));
      if (roomUse(piece?.name ?? '', piece?.kind) !== 'sdb') continue;
      const face = wallFace(w, quads.get(w.id), f.side);
      const p = facePoint(face, faceX(face, f.along), 0.05);
      const v = volumeAt({ x: p.x, z: p.z }, f.height, zones);
      if (v === null) continue;
      out.set(f.id, volumeVerdict(f.kind, v));
    }
    return out;
  }, [objects, walls, fixtures, rooms, placement]);

  /**
   * Les constats, calculés UNE fois par changement de plan.
   *
   * Ils étaient recalculés à chaque rendu — donc à chaque image d'un geste
   * sur la vue 3D, alors que ni les murs ni l'appareillage ne bougent
   * pendant qu'on tourne autour. `checkElectrical` parcourt tous les
   * appareils croisés à toutes les pièces, `checkPlan` tous les murs : c'est
   * exactement le genre de travail qu'un doigt posé sur l'écran ne doit pas
   * déclencher soixante fois par seconde.
   */
  const elecIssues = useMemo(
    () =>
      checkElectrical(
        roomInputs,
        fixtures,
        wallRooms,
        placement,
        volumes,
        wallWorktops,
        ceiling,
        // La géométrie ouvre les constats de pose : face extérieure d'un
        // mur, appareil dans le vide d'une baie.
        { walls, openings },
      ),
    [
      roomInputs,
      fixtures,
      wallRooms,
      placement,
      volumes,
      wallWorktops,
      ceiling,
      walls,
      openings,
    ],
  );
  const issues: Constat[] = useMemo(
    () => [
      ...checkPlan(walls, rooms).map((i, n) => ({
        key: `p${n}`,
        message: i.message,
        hint: i.hint,
        severity: i.severity as string,
        wallId: i.wallId,
        roomId: i.roomId,
      })),
      ...elecIssues.map((i, n) => ({
        key: `e${n}`,
        message: i.message,
        hint: i.regle,
        severity: i.severity as string,
        roomId: i.roomId,
      })),
    ],
    [walls, rooms, elecIssues],
  );
  const alertes = useMemo(
    () => issues.filter((i) => i.severity === 'alerte').length,
    [issues],
  );

  /** Amène sous les yeux l'élément visé par un constat. */
  const goToIssue = (issue: Constat) => {
    setChecking(false);
    setTab('2d');
    setEditMode(true);
    setSelectedObjectId(null);
    if (issue.wallId) {
      setSelectedRoomId(null);
      setSelectedWallId(issue.wallId);
    } else if (issue.roomId) {
      setSelectedWallId(null);
      setSelectedRoomId(issue.roomId);
    }
  };

  // Le bouton « Couleurs » n'a de sens que si le scan en a relevé.
  const colorsAvailable = hasCapturedColors(
    walls,
    rooms.map((r) => r.floor),
  );

  /** Ouvre le choix du nom pour une pièce (appui sur son cartouche). */
  /**
   * TOUCHER LE NOM D'UNE PIÈCE OUVRE SES OPTIONS, pas le renommage.
   *
   * Le cartouche ouvrait directement la liste des noms. C'est le geste le
   * plus fréquent, mais pas le seul : on touche aussi une pièce pour
   * corriger sa hauteur, la fusionner avec la voisine que le scan a
   * séparée, ou la retirer. Un appui qui n'ouvre QU'UNE des cinq portes en
   * ferme quatre — et l'utilisateur ne sait pas qu'elles existent.
   */
  const promptRoomFor = (roomId: string) => {
    setSelectedRoomId(roomId);
    const piece = rooms.find((r) => r.id === roomId);
    const autres = rooms.filter((r) => r.id !== roomId).length;
    setMenu({
      title: piece?.name || 'Pièce sans nom',
      subtitle: 'Ce qu’on peut faire de cette pièce.',
      actions: [
        {
          label: 'Renommer',
          icon: 'renommer' as const,
          onPress: () => setNaming(true),
        },
        {
          label: 'Hauteur sous plafond',
          icon: 'hauteur' as const,
          onPress: promptRoomHeight,
        },
        // Offerte seulement s'il y a une VOISINE : ailleurs, le geste
        // n'aboutit pas, et un choix qui ne fait rien use la confiance.
        ...(voisinesDe(roomId).length > 0
          ? [
              {
                label: 'Fusionner avec une pièce voisine',
                icon: 'fusionner' as const,
                onPress: promptMerge,
              },
            ]
          : []),
        {
          label: 'Scinder la pièce',
          icon: 'scinder' as const,
          onPress: () => {
            splitRoom(roomId);
            setSelectedRoomId(null);
          },
        },
        ...(autres > 0
          ? [
              {
                label: 'Retirer la pièce',
                icon: 'supprimer' as const,
                danger: true,
                onPress: () => {
                  removeRoom(roomId);
                  setSelectedRoomId(null);
                },
              },
            ]
          : []),
      ],
    });
  };

  /** Applique un nom choisi dans la liste, en numérotant les homonymes. */
  const applyRoomName = (name: string) => {
    if (!targetRoom) return;
    const clean = name.trim();
    if (clean) {
      const same = rooms.filter(
        (r) =>
          r.id !== targetRoom.id &&
          (r.name === clean || r.name.startsWith(`${clean} `)),
      ).length;
      setRoomName(targetRoom.id, same === 0 ? clean : `${clean} ${same + 1}`);
    } else {
      setRoomName(targetRoom.id, '');
    }
    setNaming(false);
  };

  const promptRoomHeight = () => {
    if (!targetRoom || !targetPart) return;
    setPrompt({
      title: 'Hauteur sous plafond',
      subtitle: 'Elle sert au volume, aux vues 3D et au métré.',
      value: roomHeight(targetPart.walls).toFixed(2).replace('.', ','),
      unit: 'm',
      numeric: true,
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (v > 0) setRoomHeight(targetRoom.id, v);
      },
    });
  };

  /**
   * LES VOISINES DE LA PIÈCE CHOISIE — celles qui partagent une cloison.
   *
   * La fusion réunit deux listes de murs en retirant ceux qu'elles ont en
   * commun. Entre deux pièces qui n'en partagent AUCUN, elle produit une
   * pièce faite de deux contours disjoints : plus de surface, plus de métré,
   * et à l'écran rien qu'un nom qui disparaît. Les proposer était donc
   * offrir un geste qui ne pouvait pas aboutir.
   */
  const voisinesDe = (id: string) => {
    const cible = rooms.find((r) => r.id === id);
    if (!cible) return [];
    const siens = new Set(cible.wallIds ?? []);
    return rooms.filter(
      (r) => r.id !== id && (r.wallIds ?? []).some((w) => siens.has(w)),
    );
  };

  /** Réunit la pièce sélectionnée avec une voisine, au choix. */
  const promptMerge = () => {
    if (!targetRoom) return;
    setMenu({
      title: 'Fusionner avec…',
      subtitle:
        'Les deux pièces n’en feront plus qu’une ; la cloison reste dessinée.',
      actions: voisinesDe(targetRoom.id)
        .slice(0, 6)
        .map((r) => ({
          label: r.name || r.id,
          icon: 'fusionner' as const,
          onPress: () => {
            mergeRooms(targetRoom.id, r.id);
            setSelectedRoomId(targetRoom.id);
          },
        })),
    });
  };

  /** Pose l'appareil sur ce mur et ouvre aussitot le mur vu de face. */
  const placeFixture = (kind: FixtureKind, wallId: string, height?: number) => {
    const id = addFixture(kind, wallId, cibleDuRetour(wallId));
    setPendingKind(null);
    if (!id) return;
    // Rangé à côté d'un autre, sous une plaque commune : la main le sent,
    // et l'œil ira lire le bandeau qui propose de changer de côté.
    if (useScanStore.getState().pendingJoin) haptic('accroche');
    // Une prise de plan de travail arrive directement à sa hauteur : la
    // corriger juste après, à la main, serait un geste de trop.
    if (height !== undefined) {
      const pose = useScanStore.getState().fixtures.find((f) => f.id === id);
      if (pose) moveFixture(id, pose.along, height);
    }
    setElecWallId(wallId);
    setElecSel(id);
    setElecView('mur');
    setElecOpen(true);
  };

  /**
   * Le « + » : le catalogue, puis un mur.
   *
   * Le mur visé est celui qu'on a sélectionné SUR LE PLAN 2D, et rien
   * d'autre : en 3D aucune sélection n'est visible, et un mur retenu d'une
   * visite précédente ferait atterrir la prise dans une autre pièce sans
   * qu'on comprenne pourquoi.
   */
  /**
   * L'abscisse visée sur la face, quand un retour est choisi.
   *
   * Les tronçons se comptent en fractions de l'AXE du mur ; la face, elle,
   * est raccourcie de l'épaisseur du mur à chaque about. Appliquer les
   * fractions de l'axe à la longueur de la face décalerait le retour de
   * quelques centimètres — presque une largeur de plaque.
   */
  const cibleDuRetour = (wallId: string): number | undefined => {
    if (!pier || pier.wallId !== wallId) return undefined;
    const w = walls.find((x) => x.id === wallId);
    if (!w) return undefined;
    const L = segLength(w);
    const side = interiorSide(w, walls, rooms);
    const face = wallFace(w, wallQuadsOf(walls).get(w.id), side);
    const marge = (L - face.len) / 2;
    const milieu = ((pier.t0 + pier.t1) / 2) * L - marge;
    return Math.min(Math.max(milieu, 0), face.len);
  };

  const startFixture = () => {
    seulGeste('mur');
    setElecWallId(tab === '2d' ? selectedWallId ?? pier?.wallId ?? null : null);
    setElecSel(null);
    setElecView('catalogue');
    setElecOpen(true);
  };

  /** Un appareil choisi dans le catalogue. */
  const chooseKind = (kind: FixtureKind) => {
    if (elecWallId) {
      placeFixture(kind, elecWallId);
      return;
    }
    // Aucun mur designe : on ferme et on attend un appui sur le plan.
    setElecOpen(false);
    setPendingKind(kind);
    setTab('2d');
    setEditMode(true);
    setSelectedObjectId(null);
    setSelectedRoomId(null);
  };

  /** Ouvre un mur vu de face, sans rien y poser. */
  const openWallElevation = (wallId: string) => {
    setElecWallId(wallId);
    setElecSel(fixtures.find((f) => f.wallId === wallId)?.id ?? null);
    setElecView('mur');
    setElecOpen(true);
  };

  /**
   * Demande la longueur du mur.
   *
   * Un champ posé à demeure sur le plan coûtait une barre entière —
   * étiquette, saisie, unité, bouton — pour un geste qu'on fait rarement.
   * La question se pose maintenant à l'écran, le temps de répondre, et le
   * plan reste dégagé. Au passage, plus de clavier qui remonte par-dessus
   * la barre : c'était le défaut qui l'avait déjà fait déménager une fois.
   */
  const promptLength = (wallId: string) => {
    const w = walls.find((x) => x.id === wallId);
    if (!w) return;
    setPrompt({
      title: 'Longueur du mur',
      subtitle: 'L’extrémité opposée se déplace, les murs soudés suivent.',
      value: segLength(w).toFixed(2).replace('.', ','),
      unit: 'm',
      numeric: true,
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (v > 0) setWallLength(wallId, v);
      },
    });
  };

  /**
   * LA HAUTEUR D'UN MUR — celle-ci, et pas celle de la pièce.
   *
   * Le réglage par pièce existe déjà, dans la barre du sol : il descend
   * tous les murs d'un coup, ce qui est juste quand on corrige un plafond
   * mal vu par RoomPlan. Ici c'est l'inverse — une retombée de poutre, une
   * sous-pente, un muret de cuisine : UN mur qui n'a pas la hauteur des
   * autres. La fenêtre le dit, sinon on croit régler la pièce.
   */
  const promptWallHeight = (wallId: string) => {
    const w = walls.find((x) => x.id === wallId);
    if (!w) return;
    setPrompt({
      title: 'Hauteur du mur',
      subtitle:
        'Ce mur seul — retombée, sous-pente, muret. Le sol ne bouge pas, ce qui est accroché dessus redescend avec lui.',
      value: w.height.toFixed(2).replace('.', ','),
      unit: 'm',
      numeric: true,
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (v > 0) setWallHeight(wallId, v);
      },
    });
  };

  const toggleEdit = () => {
    // Sortir d'un mode, c'est abandonner ce qu'on y avait commencé.
    seulGeste();
    setEditMode((e) => {
      if (e) setSelectedWallId(null);
      return !e;
    });
  };

  // ---------- État vide : rien d'exploitable dans le scan ----------
  if (walls.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Text style={styles.emptyTitle}>Aucun mur détecté</Text>
        <Text style={styles.emptyText}>
          Balayez plus lentement, du sol au plafond, avec davantage de lumière.
          Les grandes surfaces vitrées et les miroirs peuvent gêner la détection.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={reset}>
          <Text style={styles.primaryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const metrics = [
    ...(rooms.length > 1
      ? [{ value: `${rooms.length}`, label: 'pièces' }]
      : []),
    { value: `${walls.length}`, label: 'murs' },
    ...(surface
      ? [
          {
            value: `${surface.exact ? '' : '≈ '}${fr(surface.area)}`,
            label: 'm² sol',
          },
        ]
      : []),
    { value: fr(perimeter), label: 'm périm.' },
    ...(objects.length > 0
      ? [{ value: `${objects.length}`, label: 'meubles' }]
      : []),
    ...(fixtures.length > 0
      ? [{ value: `${fixtures.length}`, label: 'élec.' }]
      : []),
  ];

  /**
   * LE MENU DU PLAN — ouvert par son NOM autant que par les trois points.
   *
   * Le titre ouvrait directement la saisie du nom, et un crayon le
   * répétait à côté. Deux défauts : le renommage se propose déjà dans le
   * menu « … », et surtout un appui sur un nom doit montrer CE QU'ON PEUT
   * FAIRE, pas décider à la place de l'électricien — c'est la règle qu'on
   * a déjà appliquée aux noms de pièces.
   */
  /**
   * POSER CE QUI MANQUE, ET LE DIRE.
   *
   * Le calcul est ailleurs (`poserAuxNormes`) : ici on lui donne le plan tel
   * qu'il est à l'écran — pièces détectées, meubles, appareils déjà posés —
   * et l'on rend compte. Un outil qui modifie un dossier sans dire quoi ne
   * s'utilise pas deux fois.
   */
  const poserNormes = () => {
    const pose = poserAuxNormes({
      rooms: roomInputs.map((r) => {
        const part = parts.find((p) => p.roomId === r.id);
        return { ...r, interieur: part?.labelAt ?? { x: 0, z: 0 } };
      }),
      walls,
      openings,
      objects,
      fixtures,
      ceiling,
      placement,
      id: (prefixe) =>
        `${prefixe}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
    });
    if (pose.conforme) {
      Alert.alert(
        'Tout est aux normes',
        'Chaque pièce a son compte de socles, ses prises RJ45, sa commande ' +
          'd’éclairage et son point lumineux. Rien à ajouter.',
      );
      return;
    }
    useScanStore.getState().poserDAuto(pose.fixtures, pose.ceiling);
    Alert.alert(
      `${pose.fixtures.length + pose.ceiling.length} pose(s) ajoutée(s)`,
      pose.rapport.join(SAUT) +
        SAUT +
        SAUT +
        'Tout est placé hors meubles et hors menuiseries. À vous de ' +
        'déplacer ce qui ne vous convient pas.',
    );
  };

  const menuDuScan = () =>
    setMenu({
                title: scanName,
                subtitle: majTexte ?? undefined,
                actions: [
                  {
                    label: 'Renommer le scan',
                    icon: 'renommer' as const,
                    onPress: () => {
                      setNameInput(scanName);
                      setRenaming(true);
                    },
                  },
                  {
                    /**
                     * AJOUTER UNE PIÈCE, sans tout recommencer.
                     *
                     * Un logement ne se relève pas toujours d'un trait : on
                     * scanne le séjour, on est appelé ailleurs, on revient
                     * pour la chambre. La seule porte de sortie était
                     * « Nouveau scan » — qui efface tout. On pose donc une
                     * pièce aux cotes qu'on donne, accolée au plan, et on
                     * l'ajuste au doigt comme n'importe quel mur.
                     */
                    label: 'Ajouter une pièce',
                    icon: 'piece' as const,
                    hint: 'Un rectangle aux cotes que vous donnez, à côté du plan.',
                    onPress: () => setAjoutPiece(true),
                  },
                  {
                    /*
                      NORMES AUTO — l'installation qui se pose toute seule.

                      Elle COMPLÈTE ce qui existe : on ne touche à rien de ce
                      que l'électricien a placé. Et si tout est déjà conforme,
                      elle le DIT — un outil qui ne répond rien laisse croire
                      qu'il n'a pas compris la demande.
                    */
                    label: 'Normes auto',
                    icon: 'renommer' as const,
                    hint:
                      'Pose ce qui manque pour la NF C 15-100 : socles, RJ45, ' +
                      'interrupteurs et points lumineux, hors meubles.',
                    onPress: poserNormes,
                  },
                  {
                    label: 'Nouveau scan',
                    icon: 'sortir' as const,
                    onPress: reset,
                  },
                ],
              });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Retour"
          onPress={() =>
            setScreen(resultOrigin === 'library' ? 'library' : 'home')
          }>
          <BackChevron color={teinte.ink} />
        </TouchableOpacity>
        {/* Le bord gauche rend le même retour que la flèche — vingt
            points au ras du cadre, le plan garde tout le reste. */}
        <RetourGlisse
          onRetour={() =>
            setScreen(resultOrigin === 'library' ? 'library' : 'home')
          }
        />
        <TouchableOpacity
          style={styles.titleWrap}
          accessibilityLabel="Options du plan"
          onPress={menuDuScan}>
          <View style={styles.titleCol}>
            <Text style={styles.title} numberOfLines={1}>
              {scanName}
            </Text>
            {/* Quand ce plan a-t-il été enregistré pour la dernière fois ?
                La question se pose à chaque ouverture d'un scan repris, et
                la réponse tenait jusqu'ici dans la seule liste des scans. */}
            {majTexte && (
              <Text style={styles.titleSub} numberOfLines={1}>
                {majTexte}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {/*
          L'EXPORT EST UNE ICÔNE, pas un bandeau.

          Un bouton bleu pleine largeur au bas de l'écran, c'est
          soixante-dix points de hauteur pris au plan — pour un geste qu'on
          fait une fois par visite, à la fin. Les applications de plan le
          posent en haut à droite, en pictogramme de partage : on le trouve
          là sans y penser, et le dessin reprend la place.
        */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={styles.headerIcon}
            accessibilityLabel="Exporter"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => setExporting(true)}>
            {/* La silhouette Solar : centrée par construction — le dessin
                lucide flottait au-dessus du centre de sa pastille. */}
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Trace d={SOLAIRES.partage} fill={teinte.blue} fillRule="evenodd" />
            </Svg>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.headerIcon}
          accessibilityLabel="Plus"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={menuDuScan}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Trace d={SOLAIRES.points} fill={teinte.ink} fillRule="evenodd" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Le bandeau tient TOUJOURS dans l'écran.
          Les cellules étaient dimensionnées par leur contenu, le cadre
          calé à gauche : à six mesures — pièces, murs, surface, périmètre,
          meubles, appareillage — il sortait par la droite du téléphone, et
          les derniers chiffres n'existaient plus pour personne. Elles se
          partagent désormais la largeur à parts égales, et le chiffre se
          réduit plutôt que de déborder. */}
      {/*
        LES MESURES SONT LÀ, TOUJOURS.

        Elles se sont repliées le temps d'une version, pour rendre au plan la
        hauteur qu'elles prenaient. C'était une mauvaise économie : on ouvre
        un scan pour voir un plan ET ses chiffres — la surface, le
        périmètre, le nombre d'appareils — et un chiffre qu'il faut déplier
        est un chiffre qu'on ne lit plus. Le cartouche est simplement plus
        serré qu'avant.
      */}
      <View style={styles.metricsRow}>
        {metrics.map((m, i) => (
          <View key={m.label} style={[styles.metric, i > 0 && styles.metricBorder]}>
            <Text
              style={styles.metricValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}>
              {m.value}
            </Text>
            <Text style={styles.metricLabel} numberOfLines={1}>
              {m.label}
            </Text>
          </View>
        ))}
      </View>

      <Animated.View
        style={[
          styles.canvas,
          {
            opacity: bascule,
            transform: [
              {
                scale: bascule.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.965, 1],
                }),
              },
            ],
          },
        ]}
        ref={canvasRef}
        collapsable={false}>
        {/* Tout ce qui est ancré au bas du plan — barre d'outils, bandeaux —
            se pose au-dessus de cette réserve : c'est le padding du cadre qui
            les remonte, en une fois, sans les toucher un par un. */}
        {vue === '2d' ? (
          <FloorplanEditor
            vueInitiale={vuePlan}
            onView={setVuePlan}
            cableRoutes={showRoutes ? cheminements?.traces : undefined}
            showFixtures={showFixtures}
            circuitMarks={showRoutes ? marks : undefined}
            photos={photos}
            onSelectPhoto={setPhotoVue}
            showMeasures={showMeasures}
            editable={editMode}
            selectedObjectId={selectedObjectId}
            onDeleteObject={(id) => {
              removeObject(id);
              setDraftObject(null);
              setSelectedObjectId(null);
            }}
            onSelectObject={(id) => {
              seuleSelection('meuble');
              setSelectedObjectId(id);
            }}
            showObjectDims={objDims}
            onToggleObjectDims={() => setObjDims((v) => !v)}
            selectedWallId={selectedWallId}
            onSelectWall={(id) => {
              seuleSelection('mur');
              setSelectedWallId(id);
              // Un appareil attendait son mur : le voici.
              if (id && pendingKind) {
                placeFixture(pendingKind, id);
                return;
              }
              /**
               * TOUCHER UN MUR NE FAIT QUE LE CHOISIR.
               *
               * Un mur d'une pièce en défaut ouvrait directement l'établi
               * électrique — l'idée était d'épargner un détour à qui vient
               * corriger un constat. À l'usage, c'est l'inverse : on touche
               * un mur pour le coter, pour y percer, pour le supprimer, et
               * on se retrouve dans une fenêtre plein écran qu'on n'a pas
               * demandée. Le menu de choix s'affiche à côté du mur, et
               * l'établi s'ouvre par son bouton — comme les trois autres.
               */
            }}
            selectedOpeningId={selectedOpeningId}
            onSelectOpening={(id) => {
              if (id) seuleSelection('ouverture');
              setSelectedOpeningId(id);
            }}
            selectedRoomId={selectedRoomId}
            /* Glisser dans la pièce choisie la déplace, avec ses meubles et
               son appareillage — et elle s'aimante aux murs voisins. */
            onMoveRoom={(dx, dz) =>
              selectedRoomId && moveRoom(selectedRoomId, dx, dz)
            }
            ceiling={ceiling}
            showCeiling={showCeiling}
            showNorth={showNorth}
            selectedCeilingId={selCeiling}
            selectedCeilingRow={selRow}
            placing={!!pendingCeiling || !!pendingSpots}
            onPlaceAt={(at) => {
              if (!pendingCeiling && !pendingSpots) return;
              // Dans quelle pièce le doigt s'est-il posé ? Hors de tout
              // contour, on ne pose rien : un appareil de plafond sans
              // pièce n'aurait ni circuit ni métré.
              const part = parts.find(
                (p2) =>
                  (p2.surface?.pts.length ?? 0) >= 3 &&
                  pointInPolygon(at, p2.surface!.pts),
              );
              if (!part) {
                haptic('alerte');
                return;
              }
              if (pendingSpots) {
                const pts = spreadPoints(
                  part.surface?.pts ?? [],
                  pendingSpots,
                  trame,
                  'longueur',
                );
                // Les spots posés ensemble forment une LIGNE, et la ligne
                // est aussitôt tenue en main : son bandeau propose de la
                // retourner sur la largeur, ce qui est justement la
                // question qu'on se pose en la voyant apparaître.
                const row = `ln-${Date.now().toString(36)}`;
                for (const p2 of pts) {
                  addCeiling('spot', part.roomId, p2, { row, axe: 'longueur' });
                }
                haptic('succes');
                setPendingSpots(null);
                seuleSelection('plafond');
                setSelCeiling(null);
                setSelRow(row);
                return;
              }
              addCeiling(pendingCeiling!, part.roomId, at);
              haptic('succes');
              setPendingCeiling(null);
            }}
            onSelectCeiling={(id) => {
              // Appui dans le vide : on lâche, comme pour un meuble.
              if (id === null) {
                setSelCeiling(null);
                setSelRow(null);
                setPendingLink(null);
                return;
              }
              // Un appui sur un appareil de plafond propose de le retirer :
              // il n'a ni cote ni hauteur à régler, seulement une place.
              const cl = ceiling.find((x) => x.id === id);
              if (!cl) return;
              // D'abord le réglage : c'est ce qu'on vient faire neuf fois
              // sur dix. Le menu s'ouvre par un appui long.
              // LA LIGNE D'ABORD, LE SPOT ENSUITE.
              //
              // Un spot posé en série appartient à une ligne : le premier
              // appui la prend tout entière. On la retourne, on la retire,
              // on la voit surlignée d'un bout à l'autre. Un second appui
              // sur le même spot l'en sort et le donne seul.
              if (cl.row && selRow !== cl.row && selCeiling !== id) {
                seulGeste('reglage');
                seuleSelection('plafond');
                setSelCeiling(null);
                setSelRow(cl.row);
                return;
              }
              if (cl.row && selRow === cl.row) {
                setSelRow(null);
                setSelCeiling(id);
                return;
              }
              if (selCeiling !== id) {
                seulGeste('reglage');
                seuleSelection('plafond');
                setSelRow(null);
                setSelCeiling(id);
                return;
              }
              const spec = CEILINGS[cl.kind];
              const liees = (cl.commands ?? [])
                .map((fid) => fixtures.find((f) => f.id === fid))
                .filter((f): f is Fixture => !!f);
              setMenu({
                title: spec.label,
                subtitle: spec.note,
                actions: [
                  // Ce qui n'éclaire pas ne se commande pas : un détecteur
                  // de fumée n'a pas d'interrupteur, et proposer d'en
                  // relier un serait une invitation à se tromper.
                  ...(spec.commandable
                    ? [
                        {
                          label:
                            liees.length > 0
                              ? 'Ajouter une commande'
                              : 'Relier à une commande',
                          hint:
                            'Touchez ensuite l’interrupteur qui l’allume. ' +
                            'Deux commandes pour un point, c’est un ' +
                            'va-et-vient.',
                          icon: 'fusionner' as const,
                          onPress: () => {
                            seulGeste('lien');
                            setPendingLink([id]);
                          },
                        },
                      ]
                    : []),
                  ...liees.map((f) => ({
                    label: `Détacher ${FIXTURES[f.kind].label}`,
                    icon: 'scinder' as const,
                    onPress: () => toggleCeilingCommand(id, f.id),
                  })),
                  {
                    label: 'Retirer',
                    icon: 'supprimer' as const,
                    danger: true,
                    onPress: () => removeCeiling(id),
                  },
                ],
              });
            }}
            onSelectRoom={(id) => {
              seuleSelection('piece');
              setSelectedRoomId(id);
            }}
            onEditRoomName={promptRoomFor}
            onPierChange={setPier}
            onSelectFixture={(id, wallId) => {
              // Une liaison est en cours : cet appareil devient la commande.
              if (pendingLink) {
                const f = fixtures.find((x) => x.id === id);
                if (f && COMMANDES_MURALES.includes(f.kind)) {
                  // Toute la ligne d'un coup, ou le point seul : même geste.
                  for (const pid of pendingLink) {
                    toggleCeilingCommand(pid, id);
                  }
                  haptic('succes');
                  setPendingLink(null);
                } else {
                  // Une prise n'allume rien : on le dit, plutôt que de
                  // tracer un lien qui n'existe pas dans la réalité.
                  haptic('alerte');
                  setMenu({
                    title: 'Ce n’est pas une commande',
                    subtitle:
                      'Un point lumineux s’allume par un interrupteur, un ' +
                      'va-et-vient, un poussoir ou un variateur — pas par ' +
                      'une prise. Touchez l’un de ceux-là.',
                    actions: [
                      {
                        label: 'Continuer',
                        onPress: () => {},
                      },
                      {
                        label: 'Abandonner la liaison',
                        danger: true,
                        onPress: () => setPendingLink(null),
                      },
                    ],
                  });
                }
                return;
              }
              setElecWallId(wallId);
              setElecSel(id);
              setElecView('mur');
              setElecOpen(true);
            }}
            onWallAction={(action, wallId) => {
              if (action === 'ouverture') addOpening(wallId);
              else if (action === 'electricite') openWallElevation(wallId);
              else if (action === 'supprimer') {
                removeWall(wallId);
                setSelectedWallId(null);
              } else {
                promptLength(wallId);
              }
            }}
          />
        ) : (
          <Iso3DView
            showMeasures={show3DMeasures}
            showElecTags={showElecTags}
            /* Le même calque que sur le plan, mais en volume : le tube
               court dans la chape et remonte au nu du mur. C'est ce
               dessin-là qu'on emporte sur le chantier. */
            cableRoutes={showRoutes ? cheminements?.traces : undefined}
            routeHeights={showRoutes ? hauteursDesservies : undefined}
            showNorth={showNorth}
            showCeiling={showCeiling}
            value={view3d}
            onChange={setView3d}
            focusRoomId={rooms[focusIdx]?.id ?? null}
          />
        )}

        {/* Toute la quincaillerie s'efface pendant une capture : une image
            qu'on envoie ne doit montrer QUE le plan et le logo. */}
        {capturing ? null : vue === '2d' ? (
          <Toolbar2D
            anim={swap}
            largeur={carteW}
            bas={ligneOutils}
            dessus={Math.max(hActions, PILL_CELL_H) + PILL_GAP}
            edition={barMode}
            pendingKind={pendingKind}
            pendingCeiling={pendingCeiling}
            showMeasures={showMeasures}
            setShowMeasures={setShowMeasures}
            showRoutes={showRoutes}
            showFixtures={showFixtures}
            setShowFixtures={setShowFixtures}
            setShowRoutes={setShowRoutes}
            hasRoutes={!!cheminements}
            showNorth={showNorth}
            setShowNorth={setShowNorth}
            showCeiling={showCeiling}
            setShowCeiling={setShowCeiling}
            onFixture={startFixture}
            onFurniture={() => {
              seulGeste();
              setShowFurniture(true);
              setCatalogue(true);
            }}
            onFurnitureOff={() => {
              setSelectedObjectId(null);
              setObjDims(false);
            }}
            seulGeste={seulGeste}
            setMenu={setMenu}
            setPendingCeiling={setPendingCeiling}
            setPendingSpots={setPendingSpots}
          />
        ) : (
          <Toolbar3D
            anim={swap}
            largeur={carteW}
            bas={ligneOutils}
            showMeasures={show3DMeasures}
            setShowMeasures={setShow3DMeasures}
            showNorth={showNorth}
            setShowNorth={setShowNorth}
            showCeiling={showCeiling}
            setShowCeiling={setShowCeiling}
            showElecTags={showElecTags}
            setShowElecTags={setShowElecTags}
            colorsAvailable={colorsAvailable}
            focusIdx={focusIdx}
            setFocusIdx={setFocusIdx}
          />
        )}

        {/*
          2D / 3D : UNE PASTILLE, POSÉE SUR LE PLAN.

          C'était un bandeau pleine largeur au-dessus du dessin : cinquante
          points de hauteur pour deux mots, dont un seul sert à la fois. Les
          applications de plan mettent ce réglage dans un petit bouton flottant,
          en haut du dessin, avec les deux chevrons qui disent qu'il en existe
          un autre. On fait pareil : on gagne la bande, et le geste reste à
          portée de pouce.
        */}
        {!capturing && (
          <TouchableOpacity
            style={styles.vuePastille}
            accessibilityLabel={vue === '2d' ? 'Passer en 3D' : 'Passer en 2D'}
            onPress={basculerVue}>
            <Text style={styles.vuePastilleTexte}>
              {vue === '2d' ? '2D' : '3D'}
            </Text>
            <ChevronsUpDown size={15} color={teinte.inkFaint} strokeWidth={2.4} />
          </TouchableOpacity>
        )}

        {/* Les ACTIONS tiennent leur propre colonne, contre le bord droit :
            elles ne défilent pas avec les calques et ne se confondent pas
            avec eux. « Édition » occupe le bas de la pile — c'est le bouton
            qu'on cherche le plus souvent, et c'est lui qui commande le
            contenu de la rangée. */}
        {vue === '2d' && !capturing && (
          <View
            /*
              LA PILE RESTE EN BAS, CONTRE « ÉDITION ».

              Elle a été ancrée en haut le temps d'une version, pour que
              « Enregistrer » ne descende plus quand le trop-plein de calques
              s'empile au-dessus. C'était la mauvaise réponse à la bonne
              question : la colonne de droite appartient au pouce, et la
              déraciner du bas éloignait tout le reste avec elle.

              Ce qui compte, c'est l'ORDRE : « Enregistrer » en tête, le
              retour en arrière juste dessous.
            */
            accessibilityLabel="Actions du plan"
            onLayout={(e) => setHActions(e.nativeEvent.layout.height)}
            style={[styles.editAnchor, { bottom: ligneOutils }]}>
            {/* Revenir en arrière ne défile pas avec les calques : c'est le
                geste qu'on cherche dans l'urgence, et il se tient dans la
                colonne, juste au-dessus de l'édition. */}
            {/* Modifications non enregistrées : la sauvegarde se tient AVEC
                les autres commandes, à gauche de l'édition. Elle flottait
                seule en bas à droite du plan, loin du seul endroit qu'on
                regarde quand on modifie — et elle forçait la barre de cotes
                à se raccourcir pour lui laisser la place. */}
            <SidePill visible={dirty} index={2}>
              <ToolPill
                icon="save"
                label="Enregistrer"
                active
                onPress={commitCurrent}
              />
            </SidePill>
            <SidePill visible={editMode && canUndo} index={1}>
              <ToolPill icon="undo" label="Annuler" active={false} onPress={undo} />
            </SidePill>
            {/* Le contrôle de conformité ne défile plus avec les calques :
                c’est un verdict sur le plan, pas un réglage d’affichage, et
                on le cherche en édition comme en lecture. Il se tient donc
                contre le bouton d’édition, à sa gauche. */}
            <SidePill visible={issues.length > 0} index={0}>
              <ToolPill
                icon="check"
                label="Contrôle"
                active={alertes > 0}
                onPress={() => setChecking(true)}
              />
            </SidePill>
            {/* « Édition » commande le contenu de la rangée : il ferme la
                pile, là où le pouce tombe, et ne bouge jamais. */}
            <ToolPill
              icon="edit"
              label="Édition"
              active={editMode}
              halo
              onPress={toggleEdit}
            />
          </View>
        )}

        {/* Côtes du meuble sélectionné, en surimpression */}
        {/*
          LE BANDEAU DU MEUBLE vit dans son propre fichier, lui aussi — et
          il a perdu ses champs de saisie au passage.

          Largeur et profondeur se tapaient dans deux champs posés au bas
          de l'écran, c'est-à-dire là où le clavier vient se mettre : on
          tapait à l'aveugle, sans voir ni le champ ni le meuble. Ce sont
          maintenant deux pastilles qu'on touche, comme au plafond, et la
          feuille de saisie monte AVEC le clavier.
        */}
        {vue === '2d' && selectedObject && showFurniture && objDims && !capturing && (
          <ObjectBar
            object={selectedObject}
            styles={stylesBarres}
            palette={teinte}
            onPrompt={setPrompt}
            onResize={(w, d) => {
              resizeObject(selectedObject.id, w, d);
              setDraftObject(null);
            }}
            onHeight={(h, base) => {
              setObjectHeight(selectedObject.id, h, base);
              setDraftObject(null);
            }}
            onRotate={() => rotateObject(selectedObject.id)}
            onCancel={cancelObject}
            onDone={applyObjectDims}
            onNudge={(dx, dy) => {
              /*
                UN CENTIMÈTRE DANS L'AXE DE L'ÉCRAN.

                Le plan peut avoir été tourné : « vers le haut » ne veut rien
                dire dans le repère du scan. On ramène donc la flèche de
                l'écran vers le monde en défaisant la rotation du plan — sans
                quoi le meuble part de travers, et l'on ne comprend pas
                pourquoi.
              */
              const c = Math.cos(-vuePlan.rot);
              const s = Math.sin(-vuePlan.rot);
              const PAS = 0.01;
              const mx = (dx * c - dy * s) * PAS;
              const mz = (dx * s + dy * c) * PAS;
              const t0 = selectedObject.transform;
              // SANS AIMANT : le plaquage automatique referme tout jour de
              // moins de cinq centimètres, et il reprenait chaque pas à
              // peine posé — contre un mur, la flèche paraissait morte.
              useScanStore
                .getState()
                .setObjectCenter(
                  selectedObject.id,
                  t0[12] + mx,
                  t0[14] + mz,
                  false,
                );
            }}
          />
        )}

        {/*
          LE BANDEAU DU PLAFOND vit dans son propre fichier.

          Cent quarante lignes de réglage — deux distances aux murs, une
          feuille de saisie, quatre boutons — dans un écran qui en comptait
          déjà trois mille quatre cents. Il ne dépend que de ce qu'on lui
          passe, et le banc d'essai des bandeaux le surveille.
        */}
        {vue === '2d' && selCeiling && !capturing && (() => {
          const cl = ceiling.find((x) => x.id === selCeiling);
          if (!cl) return null;
          const part = parts.find((p2) => p2.roomId === cl.roomId);
          return (
            <CeilingBar
              fixture={cl}
              walls={part?.walls ?? walls}
              trame={trame}
              styles={stylesBarres}
              palette={teinte}
              onMove={(at) => moveCeiling(cl.id, at)}
              onPrompt={setPrompt}
              onLink={
                CEILINGS[cl.kind].commandable
                  ? () => {
                      seulGeste('lien');
                      setPendingLink([cl.id]);
                    }
                  : undefined
              }
              onRemove={() => {
                removeCeiling(cl.id);
                setSelCeiling(null);
              }}
              onDone={() => setSelCeiling(null)}
            />
          );
        })()}

        {/*
          LE BANDEAU DE LA LIGNE DE SPOTS.

          Une ligne se règle par ce qu'elle EST — un nombre de spots et un
          sens — pas par la position de chacun. Le sens se choisit ici,
          après la pose, en voyant le résultat : « sur la longueur » pour un
          séjour, « sur la largeur » pour une cuisine éclairée en travers.
          Poser d'abord, régler ensuite — personne ne sait répondre à la
          question avant d'avoir vu la ligne sur le plan.
        */}
        {vue === '2d' && selRow && !capturing && (() => {
          const ligne = ceiling.filter((x) => x.row === selRow);
          if (ligne.length === 0) return null;
          const part = parts.find((p2) => p2.roomId === ligne[0].roomId);
          const axe = ligne[0].axe ?? 'longueur';
          /** Retend la ligne sur l'autre axe, sans changer son nombre. */
          const tendre = (vers: SpotAxis) => {
            const pts = spreadPoints(
              part?.surface?.pts ?? [],
              ligne.length,
              trame,
              vers,
            );
            if (pts.length === 0) return;
            setCeilingRow(selRow, pts, vers);
            haptic('succes');
          };
          return (
            <StripBar
              styles={stylesBarres}
              strong={`${ligne.length} spots`}
              note={
                `${rooms.find((r) => r.id === ligne[0].roomId)?.name ?? 'Pièce'} · ` +
                (axe === 'longueur' ? 'sur la longueur' : 'sur la largeur')
              }
              actions={[
                /*
                  DES ICÔNES, PAS DES MOTS — relevé du patron : trois mots
                  pleins débordaient sous la colonne d'ancrage. Les flèches
                  Solar disent l'axe, le maillon relie, la croix retire.
                */
                {
                  label: 'Longueur',
                  icone: SOLAIRES.longueur,
                  sansMot: true,
                  ghost: axe !== 'longueur',
                  onPress: () => tendre('longueur'),
                },
                {
                  label: 'Largeur',
                  icone: SOLAIRES.largeur,
                  sansMot: true,
                  ghost: axe !== 'largeur',
                  onPress: () => tendre('largeur'),
                },
                /*
                  LA LIGNE SE RELIE D'UN GESTE — relevé du patron : « comme
                  un autre point d'éclairage ». Un point seul avait sa
                  liaison ; la ligne obligeait à relier spot par spot.
                */
                {
                  label: 'Relier',
                  icone: SOLAIRES.lien,
                  sansMot: true,
                  ghost: true,
                  onPress: () => {
                    seulGeste('lien');
                    setPendingLink(ligne.map((s) => s.id));
                  },
                },
                {
                  label: 'Retirer',
                  icone: SOLAIRES.retirer,
                  sansMot: true,
                  ghost: true,
                  onPress: () => {
                    removeCeilingRow(selRow);
                    setSelRow(null);
                    haptic('succes');
                  },
                },
              ]}
            />
          );
        })()}

        {/*
          LE BANDEAU DE LA PIÈCE vit dans son propre fichier.

          Nommer, régler la hauteur sous plafond, fusionner deux pièces que
          le scan a séparées, en scinder une qu'il a réunies, la retirer :
          cinq gestes qui ne regardent que la pièce, et rien du reste de
          l'écran.
        */}
        {vue === '2d' && editMode && !capturing && !selectedObject && !selectedWall &&
          selectedRoomId && targetRoom && (
            <RoomBar
              room={targetRoom}
              surface={targetPart?.surface ?? null}
              extent={targetExtent}
              hauteur={roomHeight(targetPart?.walls ?? [])}
              styles={stylesBarres}
              onName={() => setNaming(true)}
              onHeight={promptRoomHeight}
              onMore={() =>
                setMenu({
                  title: targetRoom.name || 'Pièce sans nom',
                  subtitle:
                    'Ce qui change la structure du plan : réunir deux pièces ' +
                    'que le scan a séparées, en couper une qu’il a réunie, ' +
                    'ou la retirer.',
                  actions: [
                    ...(rooms.filter((r) => r.id !== selectedRoomId).length > 0
                      ? [
                          {
                            label: 'Fusionner avec une autre pièce',
                            icon: 'fusionner' as const,
                            onPress: promptMerge,
                          },
                        ]
                      : []),
                    {
                      label: 'Scinder la pièce',
                      icon: 'scinder' as const,
                      onPress: () => {
                        splitRoom(selectedRoomId);
                        setSelectedRoomId(null);
                      },
                    },
                    ...(rooms.filter((r) => r.id !== selectedRoomId).length > 0
                      ? [
                          {
                            label: 'Retirer la pièce',
                            icon: 'supprimer' as const,
                            danger: true,
                            onPress: () => {
                              removeRoom(selectedRoomId);
                              setSelectedRoomId(null);
                            },
                          },
                        ]
                      : []),
                  ],
                })
              }
            />
          )}

        {vue === '2d' &&
          (pendingKind || pendingCeiling || pendingSpots || pendingLink) &&
          !capturing && (
            <EnAttente
              kind={pendingKind}
              plafond={
                (pendingSpots ? 'spot' : null) ??
                pendingCeiling ??
                (pendingLink
                  ? ceiling.find((x) => x.id === pendingLink[0])?.kind ?? null
                  : null)
              }
              cible={
                pendingSpots
                  ? `une pièce — ${pendingSpots} spots`
                  : pendingLink
                  ? 'l’interrupteur qui l’allume'
                  : pendingCeiling
                  ? 'une pièce'
                  : pier
                  ? 'ce retour'
                  : null
              }
              onCancel={() => {
                setPendingKind(null);
                setPendingCeiling(null);
                setPendingSpots(null);
                setPendingLink(null);
              }}
            />
          )}

        {/* La menuiserie sélectionnée : largeur, hauteur, et de quoi les
            changer. Même bandeau que pour un mur — un seul endroit où
            regarder quand on a touché quelque chose. */}
        {vue === '2d' && editMode && selectedOpening && !capturing && (
          <StripBar
            styles={stylesBarres}
            strong={`${fr(segLength(selectedOpening), 2)} × ${fr(
              selectedOpening.height,
              2,
            )} m`}
            note={
              selectedOpening.type === 'window'
                ? 'fenêtre'
                : selectedOpening.type === 'door'
                ? 'porte'
                : 'baie'
            }
            actions={[
              {
                label: 'Largeur',
                ghost: true,
                onPress: () => promptOpening(selectedOpening.id, 'largeur'),
              },
              {
                label: 'Hauteur',
                onPress: () => promptOpening(selectedOpening.id, 'hauteur'),
              },
            ]}
          />
        )}

        {/* Le mur sélectionné, en une ligne au pied du plan : sa longueur,
            sa hauteur sous plafond, et de quoi les changer. En haut, le
            bandeau mangeait le dessin qu'on est en train de regarder. */}
        {vue === '2d' && !selectedObject && !selectedOpening && editMode && selectedWall && !capturing && (
          <StripBar
            styles={stylesBarres}
            strong={`${fr(segLength(selectedWall), 2)} m`}
            note={`${fr(selectedWall.height, 2)} m sous plafond`}
            actions={[
              /*
                UN SEUL GESTE : « MESURES », AVEC SON CRAYON.

                « Coter » était du jargon de dessinateur — relevé du patron :
                « tout le monde ne comprend pas facilement » — et « Hauteur »
                un second bouton pour une retouche rare. La hauteur d'un mur
                reste réglable par la pièce (barre du sol) et par le retour
                d'un mur percé.
              */
              {
                label: 'Mesures',
                crayon: true,
                onPress: () => promptLength(selectedWall.id),
              },
            ]}
          />
        )}

        {/*
          UN RETOUR CHOISI MONTRE LE MÊME BANDEAU.

          Le retour se cotait sur le plan et s'ouvrait à l'appareillage, mais
          il n'avait pas de bandeau : sa longueur s'affichait au milieu du
          dessin, et la hauteur du pan de mur qui le porte n'était écrite
          nulle part. Or c'est justement sur ces trente centimètres qu'on
          pose l'interrupteur d'entrée, et la place qu'on y a dépend de cette
          hauteur-là. Le bandeau dit donc les deux — la longueur DU RETOUR,
          la hauteur DE SON MUR — et n'offre que ce qui a un sens ici : la
          hauteur. Coter un retour reviendrait à coter le mur entier, ce que
          la commande « Cotes » du menu fait déjà, sans mentir sur sa cible.
        */}
        {vue === '2d' &&
          !selectedObject &&
          !selectedOpening &&
          !selectedWall &&
          editMode &&
          pier &&
          !capturing &&
          (() => {
            const mur = walls.find((w) => w.id === pier.wallId);
            if (!mur) return null;
            const L = segLength(mur);
            return (
              <StripBar
                styles={stylesBarres}
                strong={`${fr((pier.t1 - pier.t0) * L, 2)} m`}
                note={`retour · ${fr(mur.height, 2)} m sous plafond`}
                actions={[
                  {
                    label: 'Hauteur',
                    onPress: () => promptWallHeight(mur.id),
                  },
                ]}
              />
            );
          })()}

        {/* Watermark EchoPlan, visible uniquement sur les images générées */}
        {capturing && (
          <View style={styles.watermark} pointerEvents="none">
            <Image
              source={require('../assets/echoplan.png')}
              style={styles.watermarkLogo}
              resizeMode="contain"
            />
          </View>
        )}

      </Animated.View>


      {/*
        PLUS DE LISTE DE MEUBLES EN PIED D'ÉCRAN.

        Une rangée de cartes « Rangement 1,27 × 0,64 × 0,94 m » défilait sous
        la carte du plan. Relevé du chantier : « je ne trouve pas qu'elle
        soit utile, et en plus mal placée ». Elle l'était deux fois : hors du
        cadre blanc, et redondante — on sélectionne un meuble en le touchant
        SUR le plan, là où on le voit, et son bandeau donne alors les mêmes
        cotes en plus gros.
      */}

      {/*
        PLUS DE PIED DE PAGE.

        « Exporter » et « Nouveau scan » y prenaient cent trente points de
        hauteur — un cinquième de l'écran d'un téléphone — pour deux gestes
        qu'on fait une fois par visite. L'export est passé en icône dans
        l'en-tête, le nouveau scan dans le menu « … », et le plan a récupéré
        tout l'espace.
      */}

      {/* La présentation, lancée depuis le menu « Exporter ». */}
      <ClientTour visible={visite} onClose={() => setVisite(false)} />

      {/* Transition vers l'export : ondes EchoPlan sur toute la page */}
      {transiting && (
        <View style={styles.transition} pointerEvents="auto">
          {[0, 0.12, 0.24].map((delay, i) => (
            <Animated.View
              key={i}
              style={[
                styles.transitionRing,
                {
                  opacity: waveAnim.interpolate({
                    inputRange: [delay, Math.min(delay + 0.3, 1), 1],
                    outputRange: [0.55, 0.3, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: waveAnim.interpolate({
                        inputRange: [delay, 1],
                        outputRange: [0.3, ringScale],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
          <Animated.View
            style={[
              styles.transitionFill,
              {
                opacity: waveAnim.interpolate({
                  inputRange: [0.55, 1],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
        </View>
      )}

      {/* ---------- Choix du format d'export ---------- */}
      <ExportSheet
        visible={exporting}
        onClose={() => setExporting(false)}
        onDismiss={lancerPartage}
        onPdf={() => {
          setExporting(false);
          goExport();
        }}
        onObj={() => {
          setExporting(false);
          apresFermeture(shareObj);
        }}
        onMaterial={() => {
          setExporting(false);
          apresFermeture(shareMaterial);
        }}
        onCsv={() => {
          setExporting(false);
          apresFermeture(shareCsv);
        }}
        onImage={() => {
          setExporting(false);
          apresFermeture(shareImage);
        }}
        onPresentation={() => {
          setExporting(false);
          apresFermeture(() => setVisite(true));
        }}
      />

      {/*
        LA PRÉSENTATION N'EST MONTÉE QU'UNE FOIS.

        Elle l'était deux fois, à deux endroits du même rendu — la seconde
        cachée sous la première, avec ses propres minuteries. Elle se tient
        plus haut, avec la transition d'export.
      */}

      {/* ---------- Ajouter une pièce ---------- */}
      <AddRoomSheet
        visible={ajoutPiece}
        accolee={!!selectedWallId}
        onClose={() => setAjoutPiece(false)}
        onChoose={(largeur, profondeur, nom) => {
          // Accolée au mur choisi, s'il y en a un : c'est ainsi qu'on bâtit
          // un appartement de proche en proche.
          const id = addRoomBox(largeur, profondeur, nom, selectedWallId);
          setAjoutPiece(false);
          seuleSelection('piece');
          setSelectedRoomId(id);
          setEditMode(true);
          haptic('succes');
        }}
        onCustom={() => {
          setAjoutPiece(false);
          apresFermeture(() =>
            setPrompt({
              title: 'Pièce sur mesure',
              subtitle:
                'Largeur et profondeur en mètres, séparées par un × ' +
                '(par exemple 3,60 x 2,80).',
              value: '3,60 x 2,80',
              onSubmit: (t) => {
                const [l, p] = t
                  .replace(',', '.')
                  .replace(',', '.')
                  .split(/[x×*]/i)
                  .map((v) => parseFloat(v.replace(',', '.').trim()));
                if (!isFinite(l) || !isFinite(p) || l <= 0 || p <= 0) {
                  haptic('alerte');
                  return;
                }
                const id = addRoomBox(l, p, '', selectedWallId);
                seuleSelection('piece');
                setSelectedRoomId(id);
                setEditMode(true);
                haptic('succes');
              },
            }),
          );
        }}
      />

      {/* ---------- Diagnostic du plan ---------- */}
      <DiagnosticSheet
        visible={checking}
        onClose={() => setChecking(false)}
        issues={issues}
        rooms={rooms}
        onGoToIssue={goToIssue}
      />

      {/* ---------- Nom de la pièce : liste plutôt que clavier ---------- */}
      <RoomNameSheet
        visible={naming}
        nomActuel={targetRoom?.name ?? null}
        onClose={() => setNaming(false)}
        onChoose={applyRoomName}
        onOther={() => {
          setNaming(false);
          setPrompt({
            title: 'Autre nom',
            subtitle: 'Laissez vide pour retirer le nom.',
            value: targetRoom?.name ?? '',
            onSubmit: (t) => applyRoomName(t),
          });
        }}
      />

      <ActionSheet data={menu} onClose={() => setMenu(null)} />
      <PromptSheet data={prompt} onClose={() => setPrompt(null)} />

      {/* ---------- Photo de repérage, en grand ---------- */}
      <PhotoSheet
        photoId={photoVue}
        photos={photos}
        walls={walls}
        onClose={() => setPhotoVue(null)}
        onDelete={(id) => {
          removePhoto(id);
          setPhotoVue(null);
        }}
      />

      {/* ---------- Catalogue de mobilier ---------- */}
      <FurnitureSheet
        visible={catalogue}
        quete={quete}
        onQuete={setQuete}
        onClose={() => setCatalogue(false)}
        onPick={placeObject}
      />

      {/* ---------- Électricité : catalogue, puis le mur vu de face ---------- */}
      <ElecSheet
        visible={elecOpen}
        vue={elecView}
        wallId={elecWallId}
        focusX={elecWallId ? cibleDuRetour(elecWallId) : undefined}
        selectedId={elecSel}
        onSelect={setElecSel}
        onAddRequest={() => setElecView('catalogue')}
        onChoose={chooseKind}
        onClose={() => setElecOpen(false)}
      />

      {/* ---------- Renommage ---------- */}
      <RenameSheet
        visible={renaming}
        valeur={nameInput}
        onChange={setNameInput}
        onClose={() => setRenaming(false)}
        onRename={() => {
          renameCurrent(nameInput);
          setRenaming(false);
        }}
        onCopy={() => {
          saveAsCopy(nameInput);
          setRenaming(false);
        }}
      />
    </View>
  );
}


/**
 * La vignette d'un meuble du catalogue : son symbole de plan, vu de dessus,
 * à l'échelle de sa propre emprise.
 *
 * C'est le même tracé que sur le plan — on choisit donc en reconnaissant la
 * forme qu'on retrouvera, et non en lisant une liste de mots. Le nom passe
 * dessous, les cotes en plus petit encore.
 */
