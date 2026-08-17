import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { RoomScan } from 'react-native-room-scan';
import {
  glow,
  radius,
  shadowCard,
  shadowLift,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { WallElevation } from '../components/WallElevation';
import { SidePill } from '../components/SidePill';
import { CeilingIcon } from '../components/CeilingIcon';
import { CeilingBar } from '../components/CeilingBar';
import { ObjectBar } from '../components/ObjectBar';
import { RoomBar } from '../components/RoomBar';
import { StripBar } from '../components/StripBar';
import {
  ANCHOR_TOP,
  PILL_CELL_H,
  PILL_GAP,
  PillSlot,
  ToolPill,
} from '../components/ToolPill';
import { Compass, PlayCircle } from 'lucide-react-native';
import { ClientTour } from '../components/ClientTour';
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
  frCategory,
  furnKind,
  furnitureStrokes,
  ROOM_NAME_CHOICES,
} from '../geometry/furniture';
import { CATALOGUE, type CatalogItem } from '../geometry/catalogue';
import { buildObj, objFilename } from '../export/model3d';
import { checkPlan } from '../geometry/diagnostics';
import {
  checkElectrical,
  planCircuits,
  roomUse,
  worktopsOnWall,
  type Worktop,
  fixturePlacement,
  materialList,
  roomInputsOf,
  roomsInAlert,
  wallToRooms,
} from '../geometry/nfc15100';
import { buildMaterialPdf, materialFilename, toBase64 } from '../export/pdf';
import {
  FIXTURES,
  FIXTURE_FAMILIES,
  faceX,
  facePoint,
  interiorSide,
  wallFace,
  type Fixture,
  type FixtureKind,
} from '../geometry/electrical';
import { useScanStore } from '../store/scanStore';
import { DiagnosticSheet, type Constat } from '../components/DiagnosticSheet';
import { ExportArt, type ExportArtKind } from '../components/ExportArt';
import { EnAttente } from '../components/PendingPill';
import {
  CEILINGS,
  CEILING_KINDS,
  spreadPoints,
  type CeilingKind,
  type SpotAxis,
} from '../geometry/ceiling';
import { haptic } from '../ui/haptic';
import {
  ActionSheet,
  PromptSheet,
  SheetShell,
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

const fr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

/** Recherche sans accent ni casse : « evier » doit trouver « Évier ». */
const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function matchItem(item: CatalogItem, quete: string): boolean {
  const q = sansAccent(quete.trim());
  if (!q) return true;
  return sansAccent(`${item.label} ${item.category}`).includes(q);
}

export function ResultScreen() {
  const walls = useScanStore((s) => s.walls);
  const objects = useScanStore((s) => s.objects);
  const modelPath = useScanStore((s) => s.modelPath);
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
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const setShowSurfaces = useScanStore((s) => s.setShowSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const solidWalls = useScanStore((s) => s.solidWalls);
  const toggleSolidWalls = useScanStore((s) => s.toggleSolidWalls);
  const setShowTextures = useScanStore((s) => s.setShowTextures);
  const rooms = useScanStore((s) => s.rooms);
  const removeRoom = useScanStore((s) => s.removeRoom);
  const addOpening = useScanStore((s) => s.addOpening);
  const resultOrigin = useScanStore((s) => s.resultOrigin);
  const removeObject = useScanStore((s) => s.removeObject);
  const resizeObject = useScanStore((s) => s.resizeObject);
  const setRoomName = useScanStore((s) => s.setRoomName);
  const setRoomHeight = useScanStore((s) => s.setRoomHeight);
  const mergeRooms = useScanStore((s) => s.mergeRooms);
  const splitRoom = useScanStore((s) => s.splitRoom);
  const straightenPlan = useScanStore((s) => s.straightenPlan);
  const removeWall = useScanStore((s) => s.removeWall);
  const undo = useScanStore((s) => s.undo);
  const canUndo = useScanStore((s) => s.canUndo);
  const openings = useScanStore((s) => s.openings);
  const fixtures = useScanStore((s) => s.fixtures);
  const addFixture = useScanStore((s) => s.addFixture);
  const ceiling = useScanStore((s) => s.ceiling);
  const addCeiling = useScanStore((s) => s.addCeiling);
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

  const [tab, setTab] = useState<Tab>('2d');
  /** Calque des cheminements de gaines (métré à l'appui). */
  const [showRoutes, setShowRoutes] = useState(false);
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
  // Vue 3D : bascule « vue de dessus », comme un plan.
  const [view3d, setView3d] = useState<View3DParams>(DEFAULT_VIEW3D);
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
  const [pendingLink, setPendingLink] = useState<string | null>(null);
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
  /** La visite guidée, plein écran : ce qu'on montre au client. */
  const [visite, setVisite] = useState(false);
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
  const parts = roomParts(walls, rooms);
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
  const roomInputs = roomInputsOf(rooms, parts);
  const wallRooms = wallToRooms(roomInputs);
  const placement = fixturePlacement(fixtures, walls, roomInputs);
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
      ),
    [
      roomInputs,
      fixtures,
      wallRooms,
      placement,
      volumes,
      wallWorktops,
      ceiling,
    ],
  );
  const alertRooms = useMemo(() => roomsInAlert(elecIssues), [elecIssues]);
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
  const promptRoomFor = (roomId: string) => {
    setSelectedRoomId(roomId);
    setNaming(true);
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

  /** Réunit la pièce sélectionnée avec une voisine, au choix. */
  const promptMerge = () => {
    if (!targetRoom) return;
    setMenu({
      title: 'Fusionner avec…',
      subtitle:
        'Les deux pièces n’en feront plus qu’une ; la cloison reste dessinée.',
      actions: rooms
        .filter((r) => r.id !== targetRoom.id)
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

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() =>
            setScreen(resultOrigin === 'library' ? 'library' : 'home')
          }>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.titleWrap}
          onPress={() => {
            setNameInput(scanName);
            setRenaming(true);
          }}>
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
          <View style={styles.editBadge}>
            <Text style={styles.editBadgeIcon}>✎</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Le bandeau tient TOUJOURS dans l'écran.
          Les cellules étaient dimensionnées par leur contenu, le cadre
          calé à gauche : à six mesures — pièces, murs, surface, périmètre,
          meubles, appareillage — il sortait par la droite du téléphone, et
          les derniers chiffres n'existaient plus pour personne. Elles se
          partagent désormais la largeur à parts égales, et le chiffre se
          réduit plutôt que de déborder. */}
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

      <Segment tab={tab} onChange={setTab} />

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
        {vue === '2d' ? (
          <FloorplanEditor
            cableRoutes={showRoutes ? cheminements?.traces : undefined}
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
            alertRooms={alertRooms}
            selectedOpeningId={selectedOpeningId}
            onSelectOpening={(id) => {
              if (id) seuleSelection('ouverture');
              setSelectedOpeningId(id);
            }}
            selectedRoomId={selectedRoomId}
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
                            setPendingLink(id);
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
                  toggleCeilingCommand(pendingLink, id);
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
          <View style={styles.planTools}>
            {/* Deux barres, jamais mélangées.
                En lecture, on ne fait que REGARDER : la barre ne porte que
                ce qui s'affiche ou non. En édition, on TRAVAILLE : les
                calques cèdent la place aux outils, et les cotes ou les
                meubles restent tels qu'on les avait laissés.
                Les pastilles rentrent dans le bouton d'édition et en
                ressortent : c'est lui qui commande le changement, autant
                qu'on le voie. */}
            {(barMode
              ? [
                  <ToolPill
                    key="plus"
                    icon="plus"
                    label="Appareil"
                    active={!!pendingKind}
                    onPress={startFixture}
                  />,
                  <ToolPill
                    key="square"
                    icon="square"
                    label="Redresser"
                    active={false}
                    onPress={straightenPlan}
                  />,
                  // En édition, la pastille des meubles OUVRE LE CATALOGUE.
                  //
                  // Elle portait un « + » à côté d'elle, et restait par
                  // ailleurs un interrupteur d'affichage : deux boutons pour
                  // un meme sujet, dont l'un modifiait le plan et l'autre
                  // non. Or on n’entre pas en édition pour cacher les
                  // meubles — on y entre pour en poser. Afficher ou cacher
                  // redevient ce que c’est, un calque, et se règle hors
                  // édition.
                  <ToolPill
                    key="furniture"
                    icon="furniture"
                    label="Ajouter"
                    active={false}
                    onPress={() => {
                      seulGeste();
                      setShowFurniture(true);
                      setCatalogue(true);
                    }}
                  />,
                  // Le plafond s'équipe comme les murs : on choisit
                  // l'appareil, puis on touche la pièce qui le reçoit.
                  <ToolPill
                    key="plafond"
                    icon="plafond"
                    label="Plafond"
                    active={!!pendingCeiling}
                    onPress={() => {
                      seulGeste('plafond');
                      setShowCeiling(true);
                      setMenu({
                        title: 'Équiper le plafond',
                        subtitle:
                          'Choisissez l’appareil, puis touchez la pièce qui ' +
                          'le reçoit. Il se pose en son centre.',
                        actions: [
                          /**
                           * LA LIGNE DE SPOTS, en un geste.
                           *
                           * Quatre spots dans un séjour, c'était quatre
                           * poses suivies de quatre réglages : un quart
                           * d'heure pour ce que personne ne fait à la main
                           * sur un chantier. Ils se répartissent par
                           * zones, à intervalles égaux, et la ligne se
                           * retourne ensuite d'un appui.
                           */
                          ...(rooms.length > 0
                            ? [
                                {
                                  label: 'Ligne de spots',
                                  node: <CeilingIcon kind="spots" />,
                                  onPress: () =>
                                    setMenu({
                                      title: 'Combien de spots ?',
                                      subtitle:
                                        'Ils se répartissent par zones — le ' +
                                        'retour d’une pièce en L reçoit les ' +
                                        'siens — avec un demi-écart aux ' +
                                        'extrémités. Longueur ou largeur se ' +
                                        'choisit ensuite, sur le plan.',
                                      actions: [2, 3, 4, 5, 6, 8].map((n) => ({
                                        label: `${n} spots`,
                                        hint:
                                          n <= 3
                                            ? 'Petite pièce, ou une simple ' +
                                              'ligne d’appoint.'
                                            : n >= 6
                                            ? 'Grande pièce, ou éclairage ' +
                                              'général sans plafonnier.'
                                            : undefined,
                                        onPress: () => {
                                          seulGeste('plafond');
                                          setPendingSpots(n);
                                        },
                                      })),
                                    }),
                                },
                              ]
                            : []),
                          /*
                            LE CATALOGUE SE LIT D'UN COUP D'ŒIL.

                            Chaque appareil portait sa règle en trois lignes
                            grises : la liste faisait deux écrans, et il
                            fallait dérouler pour trouver un spot. Un
                            électricien sait ce qu'est un détecteur de
                            fumée ; ce qu'il veut, c'est le toucher. Les
                            règles n'ont pas disparu pour autant — elles
                            restent là où elles servent : le contrôle de
                            conformité et le dossier imprimé.
                          */
                          ...CEILING_KINDS.map((k) => ({
                            label: CEILINGS[k].label,
                            node: <CeilingIcon kind={k} />,
                            onPress: () => setPendingCeiling(k),
                          })),
                        ],
                      });
                    }}
                  />,
                ]
              : [
                  <ToolPill
                    key="ruler"
                    icon="ruler"
                    label="Cotes"
                    active={showMeasures}
                    onPress={() => setShowMeasures((v) => !v)}
                  />,
                  // Le calque des gaines ne s'offre que s'il a quelque chose
                  // à montrer : sans tableau posé, on ne sait pas d'où part
                  // le câble, et une pastille qui n'allume rien est un piège.
                  ...(cheminements
                    ? [
                        <ToolPill
                          key="gaines"
                          icon="gaines"
                          label="Gaines"
                          active={showRoutes}
                          onPress={() => setShowRoutes((v) => !v)}
                        />,
                      ]
                    : []),
                  // HORS ÉDITION, une pastille ne fait qu'AFFICHER ou
                  // CACHER. Le « + » du catalogue vivait ici : on pouvait
                  // donc modifier le plan sans être en édition, et la barre
                  // mélangeait deux natures de gestes. Il est passé dans la
                  // barre d'édition, avec les autres outils.
                  <ToolPill
                    key="furniture"
                    icon="furniture"
                    label="Meubles"
                    active={showFurniture}
                    onPress={() => {
                        // Éteindre le calque éteint tout ce qui l'accompagne :
                        // les poignées d'un meuble invisible restaient à
                        // l'écran, orphelines.
                      if (showFurniture) {
                        setSelectedObjectId(null);
                        setObjDims(false);
                      }
                      setShowFurniture(!showFurniture);
                    }}
                  />,
                  <ToolPill
                    key="surface"
                    icon="surface"
                    label="Surfaces"
                    active={showSurfaces}
                    onPress={() => setShowSurfaces(!showSurfaces)}
                  />,
                  <ToolPill
                    key="nord"
                    icon="square"
                    label="Nord"
                    node={
                      <Compass
                        size={22}
                        color={showNorth ? '#FFFFFF' : teinte.ink}
                        strokeWidth={2}
                      />
                    }
                    active={showNorth}
                    onPress={() => setShowNorth((v) => !v)}
                  />,
                  // Le plafond se cache pour revoir le sol : superposés,
                  // les deux calques deviennent illisibles.
                  ...(ceiling.length > 0
                    ? [
                        <ToolPill
                          key="plafond"
                          icon="plafond"
                          label="Plafond"
                          active={showCeiling}
                          onPress={() => setShowCeiling((v) => !v)}
                        />,
                      ]
                    : []),
                ]
            )
              .filter((el): el is React.ReactElement => !!el)
              .map((el, i) => (
                <PillSlot key={el.key} index={i} anim={swap}>
                  {el}
                </PillSlot>
              ))}
          </View>
        ) : (
          /*
            EN 3D, LA COLONNE COMMENCE EN HAUT.

            Elle partageait le décalage du plan 2D, où elle passe SOUS la
            rangée du bouton d'édition. Mais la 3D n'a pas de bouton
            d'édition : la colonne descendait donc d'une cellule pour
            laisser la place à une rangée qui n'existe pas, et la
            dernière pastille se retrouvait à mi-hauteur du modèle.
          */
          <View style={[styles.planTools, styles.planToolsHaut]}>
            <ToolPill
              icon="ruler"
              label="Cotes"
              active={show3DMeasures}
              onPress={() => setShow3DMeasures((v) => !v)}
            />
            <ToolPill
              icon="furniture"
              label="Meubles"
              active={showFurniture}
              onPress={() => setShowFurniture(!showFurniture)}
            />
            <ToolPill
              icon="surface"
              label="Surfaces"
              active={showSurfaces}
              onPress={() => setShowSurfaces(!showSurfaces)}
            />
            <ToolPill
              icon="square"
              label="Nord"
              node={
                <Compass
                  size={22}
                  color={showNorth ? '#FFFFFF' : teinte.ink}
                  strokeWidth={2}
                />
              }
              active={showNorth}
              onPress={() => setShowNorth((v) => !v)}
            />
            {/* Le plafond existe aussi en 3D : même calque, même bouton. */}
            {ceiling.length > 0 && (
              <ToolPill
                icon="plafond"
                label="Plafond"
                active={showCeiling}
                onPress={() => setShowCeiling((v) => !v)}
              />
            )}
            {/* Murs pleins ou écorché : l'écorché montre la pièce, les murs
                pleins montrent le bâti. Ni l'un ni l'autre n'a toujours
                raison — c'est un réglage, pas une trouvaille. */}
            <ToolPill
              icon="murs"
              label="Murs"
              active={solidWalls}
              onPress={toggleSolidWalls}
            />
            {/* Les repères électriques : indispensables pour poser,
                encombrants pour montrer. Une pièce équipée en porte une
                dizaine, et ils couvrent alors la moitié de la scène. */}
            {fixtures.length > 0 && (
              <ToolPill
                icon="plus"
                label="Repères"
                active={showElecTags}
                onPress={() => setShowElecTags((v) => !v)}
              />
            )}
            {colorsAvailable && (
              <ToolPill
                icon="colors"
                label="Couleurs"
                active={showTextures}
                onPress={() => setShowTextures(!showTextures)}
              />
            )}
            {rooms.length > 1 && (
              <ToolPill
                icon="rooms"
                label="Pièces"
                active={focusIdx >= 0}
                onPress={() =>
                  setFocusIdx((i) => (i + 2 > rooms.length ? -1 : i + 1))
                }
              />
            )}
          </View>
        )}

        {/* Le bouton d'édition ne défile pas avec les autres : c'est le
            seul qu'on cherche toujours, et il commande le contenu de la
            barre. Il reste donc à demeure, en haut à droite, aligné sur la
            rangée — les outils défilent DERRIÈRE lui, jamais dessous. */}
        {vue === '2d' && !capturing && (
          <View style={styles.editAnchor}>
            {/* Revenir en arrière ne descend pas avec les outils : c'est le
                geste qu'on cherche dans l'urgence, et il se tient à côté du
                bouton qui commande l'édition, sur sa ligne. */}
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
            styles={styles}
            palette={teinte}
            onPrompt={setPrompt}
            onResize={(w, d) => {
              resizeObject(selectedObject.id, w, d);
              setDraftObject(null);
            }}
            onRotate={() => rotateObject(selectedObject.id)}
            onCancel={cancelObject}
            onDone={applyObjectDims}
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
              styles={styles}
              palette={teinte}
              onMove={(at) => moveCeiling(cl.id, at)}
              onPrompt={setPrompt}
              onLink={
                CEILINGS[cl.kind].commandable
                  ? () => {
                      seulGeste('lien');
                      setPendingLink(cl.id);
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
              styles={styles}
              strong={`${ligne.length} spots`}
              note={
                `${rooms.find((r) => r.id === ligne[0].roomId)?.name ?? 'Pièce'} · ` +
                (axe === 'longueur' ? 'sur la longueur' : 'sur la largeur')
              }
              actions={[
                {
                  label: 'Longueur',
                  ghost: axe !== 'longueur',
                  onPress: () => tendre('longueur'),
                },
                {
                  label: 'Largeur',
                  ghost: axe !== 'largeur',
                  onPress: () => tendre('largeur'),
                },
                {
                  label: 'Retirer',
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
              voisines={rooms.filter((r) => r.id !== selectedRoomId).length}
              styles={styles}
              onName={() => setNaming(true)}
              onHeight={promptRoomHeight}
              onMerge={promptMerge}
              onSplit={() => {
                splitRoom(selectedRoomId);
                setSelectedRoomId(null);
              }}
              onRemove={() =>
                setMenu({
                  title: 'Retirer cette pièce ?',
                  subtitle:
                    'Ses murs, ses meubles et son appareillage quittent le ' +
                    'plan. Le scan d’origine, lui, ne bouge pas.',
                  actions: [
                    {
                      label: 'Retirer la pièce',
                      icon: 'supprimer',
                      danger: true,
                      onPress: () => {
                        removeRoom(selectedRoomId);
                        setSelectedRoomId(null);
                      },
                    },
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
                  ? ceiling.find((x) => x.id === pendingLink)?.kind ?? null
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
            styles={styles}
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
            styles={styles}
            strong={`${fr(segLength(selectedWall), 2)} m`}
            note={`${fr(selectedWall.height, 2)} m sous plafond`}
            actions={[
              { label: 'Coter', onPress: () => promptLength(selectedWall.id) },
            ]}
          />
        )}

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


      {objects.length > 0 && showFurniture && vue === '2d' && !editMode && (
        <ScrollView
          style={styles.objectList}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {objects.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={[
                styles.objectChip,
                o.id === selectedObjectId && styles.objectChipSelected,
              ]}
              onPress={() => {
                const next = o.id === selectedObjectId ? null : o.id;
                setSelectedObjectId(next);
                setSelectedWallId(null);
              }}>
              <Text style={styles.objectName}>{frCategory(o.category)}</Text>
              <Text style={styles.objectDims}>
                {fr(o.width, 2)} × {fr(o.depth, 2)} × {fr(o.height, 2)} m
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {Platform.OS === 'ios' && (
        <TouchableOpacity
          style={styles.exportButton}
          onPress={() => setExporting(true)}>
          <Text style={styles.primaryText}>Exporter</Text>
        </TouchableOpacity>
      )}
      {/*
        LA PRÉSENTATION SE LANCE D'ICI, pas du fond de l'écran d'export.

        Je l'avais posée à côté du bouton du PDF, par symétrie : deux
        sorties, deux publics. Mais on n'entre pas dans l'écran d'export
        pour montrer un plan à quelqu'un — on y entre pour régler un
        document. Montrer, ça se fait depuis le plan, la tablette déjà
        tournée vers le client.
      */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setVisite(true)}>
          <PlayCircle size={16} color={teinte.blue} strokeWidth={2.2} />
          <Text
            style={[styles.secondaryText, styles.secondaryTextBlue]}
            numberOfLines={1}>
            Présentation
          </Text>
        </TouchableOpacity>
        {Platform.OS === 'ios' && modelPath && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              RoomScan.viewModel(modelPath).catch(() =>
                Alert.alert(
                  'Modèle 3D indisponible',
                  'Le fichier de ce scan a été supprimé (désinstallation de ' +
                    "l'app). Le plan et la vue 3D restent disponibles.",
                ),
              )
            }>
            <Text style={styles.secondaryText} numberOfLines={1}>
              Modèle AR
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
          <Text style={styles.secondaryText} numberOfLines={1}>
            Nouveau scan
          </Text>
        </TouchableOpacity>
      </View>
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
      <Modal
        visible={exporting}
        transparent
        animationType="fade"
        onDismiss={lancerPartage}
        onRequestClose={() => setExporting(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setExporting(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Exporter</Text>
            <Text style={styles.modalSubtitle}>
              Trois formats, selon ce que vous voulez en faire.
            </Text>
            {(
              [
                [
                  'pdf',
                  'Plan PDF',
                  'Plan coté, métré par pièce, vues 3D. À imprimer ou à envoyer.',
                  () => {
                    setExporting(false);
                    goExport();
                  },
                ],
                [
                  'obj',
                  'Modèle 3D',
                  'Fichier OBJ du plan retouché, pour Blender ou SketchUp.',
                  () => {
                    setExporting(false);
                    apresFermeture(shareObj);
                  },
                ],
                [
                  'materiel',
                  'Liste du matériel',
                  'Appareillage par pièce, circuits et disjoncteurs, ' +
                    'conformité. Le document à chiffrer.',
                  () => {
                    setExporting(false);
                    apresFermeture(shareMaterial);
                  },
                ],
                [
                  'image',
                  'Image',
                  'Capture de la vue affichée, avec le filigrane EchoPlan.',
                  () => {
                    setExporting(false);
                    apresFermeture(shareImage);
                  },
                ],
              ] as [ExportArtKind, string, string, () => void][]
            ).map(([art, titre, detail, action]) => (
              <TouchableOpacity
                key={titre}
                style={styles.exportChoice}
                activeOpacity={0.8}
                onPress={action}>
                {/* La vignette dit CE QU'ON OBTIENT : une feuille cotée, un
                    volume, un bordereau, une capture. On la reconnaît sans
                    lire — quatre lignes de texte, non. */}
                <ExportArt kind={art} c={teinte} />
                <View style={styles.exportChoiceTexts}>
                  <Text style={styles.exportChoiceTitle}>{titre}</Text>
                  <Text style={styles.exportChoiceDetail}>{detail}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---------- Diagnostic du plan ---------- */}
      <DiagnosticSheet
        visible={checking}
        onClose={() => setChecking(false)}
        issues={issues}
        rooms={rooms}
        onGoToIssue={goToIssue}
      />

      {/* ---------- Nom de la pièce : liste plutôt que clavier ---------- */}
      <Modal
        visible={naming}
        transparent
        animationType="fade"
        onRequestClose={() => setNaming(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNaming(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Nom de la pièce</Text>
            <Text style={styles.modalSubtitle}>
              Il s'affiche sur le plan 2D, au même endroit sur la vue 3D, et
              dans le métré du PDF.
            </Text>
            <ScrollView style={styles.nameScroll}>
              <View style={styles.nameGrid}>
                {ROOM_NAME_CHOICES.map((choice) => {
                  const on =
                    targetRoom?.name === choice ||
                    (targetRoom?.name ?? '').startsWith(`${choice} `);
                  return (
                    <TouchableOpacity
                      key={choice}
                      style={[styles.nameChip, on && styles.nameChipOn]}
                      onPress={() => applyRoomName(choice)}>
                      <Text
                        style={[
                          styles.nameChipText,
                          on && styles.nameChipTextOn,
                        ]}>
                        {choice}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalGhost}
                onPress={() => setNaming(false)}>
                <Text style={styles.modalGhostText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimary}
                onPress={() => {
                  setNaming(false);
                  setPrompt({
                    title: 'Autre nom',
                    subtitle: 'Laissez vide pour retirer le nom.',
                    value: targetRoom?.name ?? '',
                    onSubmit: (t) => applyRoomName(t),
                  });
                }}>
                <Text style={styles.modalPrimaryText}>Autre…</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ActionSheet data={menu} onClose={() => setMenu(null)} />
      <PromptSheet data={prompt} onClose={() => setPrompt(null)} />

      {/* ---------- Photo de repérage, en grand ---------- */}
      <Modal
        visible={!!photoVue}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoVue(null)}>
        <Pressable style={styles.photoFond} onPress={() => setPhotoVue(null)}>
          {(() => {
            const ph = photos.find((p) => p.id === photoVue);
            if (!ph) return null;
            const mur = walls.find((w) => w.id === ph.wallId);
            return (
              <>
                <Image
                  source={{ uri: `file://${ph.path}` }}
                  style={styles.photoPleine}
                  resizeMode="contain"
                />
                <View style={styles.photoBarre}>
                  <Text style={styles.photoLegende} numberOfLines={1}>
                    {mur
                      ? `Mur de ${fr(segLength(mur), 2)} m`
                      : 'Mur supprimé'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      removePhoto(ph.id);
                      setPhotoVue(null);
                    }}>
                    <Text style={styles.photoSuppr}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </>
            );
          })()}
        </Pressable>
      </Modal>

      {/* ---------- Catalogue de mobilier ---------- */}
      <Modal
        visible={catalogue}
        transparent
        animationType="fade"
        onRequestClose={() => setCatalogue(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCatalogue(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Ajouter un meuble</Text>
            {/* Une recherche plutôt qu'un mode d'emploi : à trente entrées,
                on sait ce qu'on cherche, et le faire défiler prend plus de
                temps que de le taper. */}
            <TextInput
              style={styles.catSearch}
              value={quete}
              onChangeText={setQuete}
              placeholder="Rechercher un meuble…"
              placeholderTextColor={teinte.inkFaint}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <ScrollView style={styles.catScroll} keyboardShouldPersistTaps="handled">
              {CATALOGUE.map((famille) => {
                const trouves = famille.items.filter((i) => matchItem(i, quete));
                if (trouves.length === 0) return null;
                return (
                <View key={famille.name}>
                  <Text style={styles.elecFamily}>{famille.name}</Text>
                  <View style={styles.catGrid}>
                    {trouves.map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={styles.catCard}
                        activeOpacity={0.8}
                        onPress={() => placeObject(item)}>
                        <FurnitureThumb item={item} />
                        <Text style={styles.catName} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={styles.catDims}>
                          {`${fr(item.w, 2)} × ${fr(item.d, 2)} m`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---------- Électricité : catalogue, puis le mur vu de face ---------- */}
      <Modal
        visible={elecOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setElecOpen(false)}>
        <Pressable
          style={[
            styles.modalBackdrop,
            // L'établi électrique prend l'écran : on y place des appareils
            // au doigt, à cinq centimètres près. Le catalogue, lui, reste
            // une fenêtre — on y choisit, on n'y travaille pas.
            elecView === 'mur' && styles.modalBackdropPlein,
          ]}
          onPress={() => setElecOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.elecWrap,
              elecView === 'mur' && styles.elecWrapPlein,
            ]}>
            <Pressable
              onPress={() => {}}
              style={elecView === 'mur' ? styles.elecPlein : undefined}>
              {elecView === 'mur' && elecWallId ? (
                <WallElevation
                  wallId={elecWallId}
                  focusX={cibleDuRetour(elecWallId)}
                  selectedId={elecSel}
                  onSelect={setElecSel}
                  onAddRequest={() => setElecView('catalogue')}
                  onClose={() => setElecOpen(false)}
                />
              ) : (
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Ajouter un appareil</Text>
                  <Text style={styles.modalSubtitle}>
                    Il se pose à 20 cm du coin bas gauche du mur, puis se
                    déplace au doigt ou à la cote, face au mur.
                  </Text>
                  <ScrollView style={styles.elecScroll}>
                    {FIXTURE_FAMILIES.map((family) => (
                      <View key={family.name}>
                        <Text style={styles.elecFamily}>{family.name}</Text>
                        <View style={styles.elecGrid}>
                          {family.kinds.map((kind) => {
                            const spec = FIXTURES[kind];
                            return (
                              <TouchableOpacity
                                key={kind}
                                style={styles.elecChip}
                                onPress={() => chooseKind(kind)}>
                                <View
                                  style={[
                                    styles.elecDot,
                                    { backgroundColor: spec.color },
                                  ]}>
                                  <Text style={styles.elecDotText}>
                                    {spec.short}
                                  </Text>
                                </View>
                                <Text style={styles.elecChipText}>
                                  {spec.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ---------- Renommage ----------
          EN FEUILLE DU BAS, pas en boîte centrée.
          Une boîte au milieu de l'écran avec un champ de saisie finit
          toujours par se faire manger la moitié : le clavier iOS occupe le
          bas de l'écran, et recouvrait ici le champ lui-même, « Annuler »,
          « Renommer » et la copie. La feuille, elle, monte avec lui. */}
      <SheetShell visible={renaming} onClose={() => setRenaming(false)}>
          <View>
            <Text style={styles.modalTitle}>Nom du scan</Text>
            <Text style={styles.modalSubtitle}>
              Les modifications du plan s'enregistrent avec le bouton en bas à
              droite du plan.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={() => {
                renameCurrent(nameInput);
                setRenaming(false);
              }}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalGhost}
                onPress={() => setRenaming(false)}>
                <Text style={styles.modalGhostText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimary}
                onPress={() => {
                  renameCurrent(nameInput);
                  setRenaming(false);
                }}>
                <Text style={styles.modalPrimaryText}>Renommer</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalCopy}
              onPress={() => {
                saveAsCopy(nameInput);
                setRenaming(false);
              }}>
              <Text style={styles.modalCopyText}>
                Enregistrer comme nouvelle copie
              </Text>
            </TouchableOpacity>
          </View>
      </SheetShell>
    </View>
  );
}

function Segment({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const styles = getStyles(useTheme());
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(tab === '2d' ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(x, {
      toValue: tab === '2d' ? 0 : 1,
      damping: 17,
      stiffness: 230,
      mass: 0.75,
      useNativeDriver: true,
    }).start();
  }, [tab, x]);
  const half = Math.max(0, (w - 8) / 2);
  return (
    <View
      style={styles.segment}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Animated.View
          style={[
            styles.segmentThumb,
            {
              width: half,
              transform: [
                {
                  translateX: x.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, half],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      {(
        [
          ['2d', 'Plan 2D'],
          ['3d', 'Vue 3D'],
        ] as [Tab, string][]
      ).map(([key, label]) => (
        <TouchableOpacity
          key={key}
          activeOpacity={0.7}
          style={styles.segmentItem}
          onPress={() => onChange(key)}>
          <Text
            style={[styles.segmentText, tab === key && styles.segmentTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
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
function FurnitureThumb({ item }: { item: CatalogItem }) {
  const c = useTheme();
  const W = 74;
  const H = 52;
  // Emprise mise à l'échelle de la vignette, marges comprises.
  const k = Math.min((W - 14) / item.w, (H - 14) / item.d);
  const w = item.w * k;
  const d = item.d * k;
  return (
    <Svg width={W} height={H}>
      <SvgRect
        x={(W - w) / 2}
        y={(H - d) / 2}
        width={w}
        height={d}
        rx={3}
        fill={c.blueSoft}
        stroke={c.blue}
        strokeWidth={1.2}
      />
      {furnitureStrokes(furnKind(item.category), w, d).map((ligne, li) => (
        <React.Fragment key={li}>
          {ligne.slice(1).map((pt, pi) => (
            <SvgLine
              key={pi}
              x1={W / 2 + ligne[pi].x}
              y1={H / 2 + ligne[pi].y}
              x2={W / 2 + pt.x}
              y2={H / 2 + pt.y}
              stroke={c.blue}
              strokeWidth={1.1}
              strokeLinecap="round"
            />
          ))}
        </React.Fragment>
      ))}
    </Svg>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 58,
    paddingHorizontal: 18,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: c.ink, fontSize: 22, fontWeight: '800' },
  emptyText: {
    color: c.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 26,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.07,
    shadowRadius: 8,
    marginRight: 12,
  },
  backChevron: { color: c.ink, fontSize: 24, fontWeight: '600', marginTop: -3 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: {
    color: c.ink,
    fontSize: 24,
    fontWeight: '800',
    // Un titre serré se lit comme un titre ; espacé, comme une étiquette.
    letterSpacing: -0.6,
    flexShrink: 1,
  },
  titleCol: { flex: 1, minWidth: 0 },
  titleSub: {
    color: c.inkFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  editBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  editBadgeIcon: { color: c.blue, fontSize: 17, fontWeight: '700' },
  // Plus de liseré ni de séparateurs : c'est l'ombre qui pose la barre, et
  // l'écart entre le chiffre et son intitulé qui sépare les colonnes.
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    // Pleine largeur : c'est ce qui borne le cadre. Les cellules se
    // répartissent l'espace au lieu de le réclamer.
    alignSelf: 'stretch',
    marginTop: 10,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    ...shadowCard,
  },
  metric: {
    flex: 1,
    // Sans cela, une cellule refuse de rétrécir sous la largeur de son
    // texte, et la rangée repart en débordement.
    minWidth: 0,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  metricBorder: { borderLeftWidth: 1, borderLeftColor: c.line },
  metricValue: {
    color: c.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metricLabel: {
    color: c.inkFaint,
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 10,
  },
  segmentThumb: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadowLift,
    shadowOpacity: 0.1,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentText: {
    color: c.inkSoft,
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  segmentTextActive: { color: c.blue },
  canvas: { flex: 1, ...shadowCard, borderRadius: radius.lg },
  // Jusqu'à neuf pastilles : la barre défile plutôt que de se replier sur
  // deux rangs et de manger le plan.
  // Les outils descendent DANS L'AXE du bouton d'édition, contre le bord
  // droit : la main qui vient de le toucher n'a plus qu'à glisser vers le
  // bas. Une rangée horizontale, elle, finissait par défiler — donc par
  // cacher la moitié des outils.
  planTools: {
    position: 'absolute',
    // Juste sous la rangée d'ancrage, du même écart qu'entre deux pastilles.
    top: ANCHOR_TOP + PILL_CELL_H + PILL_GAP,
    // La cellule fait 58 de large pour son mot, la pastille 38 : on recule
    // de la moitié de la différence pour que les pastilles restent sur
    // l'axe qu'elles occupaient.
    right: -1,
    alignItems: 'flex-end',
    gap: PILL_GAP,
  },
  /** Sans rangée au-dessus, la colonne prend sa place. */
  planToolsHaut: { top: ANCHOR_TOP },
  editAnchor: {
    position: 'absolute',
    top: ANCHOR_TOP,
    right: -1,
    zIndex: 4,
    flexDirection: 'row',
    // En haut, pas au centre : les cellules de la rangée doivent partager
    // la ligne des pastilles, même quand l'une porte un mot plus long.
    alignItems: 'flex-start',
    gap: 6,
  },
  /**
   * La cellule d'un outil : la pastille, et son mot dessous.
   *
   * Elle est plus large que la pastille pour loger le mot, mais reste
   * CENTRÉE sur elle : les colonnes du plan 2D et de la 3D, et la rangée du
   * bouton d'édition, gardent ainsi le même axe qu'avant.
   */
  transition: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  transitionRing: {
    position: 'absolute',
    bottom: 60,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4.5,
    borderColor: c.blue,
  },
  transitionFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.bg,
  },
  watermark: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 6,
  },
  photoFond: {
    flex: 1,
    backgroundColor: 'rgba(8,10,14,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPleine: { width: '100%', height: '78%' },
  photoBarre: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoLegende: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', flex: 1 },
  photoSuppr: { color: '#FF6B6B', fontSize: 13, fontWeight: '800' },
  watermarkLogo: { width: 116, height: 26, tintColor: c.ink, opacity: 0.85 },
  watermarkText: { color: '#0B0D12', fontSize: 13, fontWeight: '800' },
  watermarkAccent: { color: c.blue },
  /**
   * La pastille d'attente : EN BAS À GAUCHE.
   *
   * En haut, elle passait derrière les pastilles d'outils — son texte
   * disparaissait sous le bouton « Contrôle ». En bas à gauche, elle est
   * seule, sous le pouce, et loin du bandeau de cotes qui occupe la droite.
   */
  // Bandeau d'attente (pose d'un appareil) : en haut, il ne gêne rien.
  wallLengthBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...shadowCard,
  },
  wallLengthLabel: { color: c.inkFaint, fontSize: 12, fontWeight: '600', flex: 1 },
  // Le mur sélectionné : une seule ligne, au pied du plan, à côté du bouton
  // d'enregistrement. Elle dit l'essentiel et ne mange pas le dessin.
  wallStrip: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    // La colonne d'outils descend du HAUT du plan : sous elle, la largeur
    // est libre. On lui laissait pourtant soixante-dix points de marge —
    // un cinquième de l'écran perdu, pendant que la cote était tronquée.
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    // Les boutons à droite, la cote à gauche : entre les deux, du vide
    // plutôt qu'un texte écrasé contre eux.
    justifyContent: 'space-between',
    ...shadowCard,
    shadowOpacity: 0.12,
  },
  // La précision en gris cède la place la première ; la cote, jamais.
  wallStripText: { color: c.inkSoft, fontSize: 13, flexShrink: 1 },
  wallStripStrong: {
    color: c.ink,
    fontWeight: '800',
    fontSize: 14,
    flexShrink: 0,
  },
  wallStripAction: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginLeft: 6,
  },
  wallStripActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  wallStripGhost: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 6,
  },
  wallStripGhostText: { color: c.inkSoft, fontSize: 13, fontWeight: '800' },
  // Une seule ligne, au pied du plan, et LOIN du bouton d'enregistrement :
  // le bandeau faisait deux étages et son bouton de validation finissait
  // derrière la pastille bleue.
  editBar: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    // Toute la largeur : les 84 points réservés au bouton de sauvegarde
    // n'ont plus lieu d'être, et c'était eux qui poussaient la validation
    // HORS du bandeau blanc — un bouton bleu flottant à côté de sa barre,
    // sans rien pour dire qu'il lui appartenait.
    right: 12,
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    ...shadowCard,
    shadowOpacity: 0.12,
  },
  editLabel: { color: c.inkSoft, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  input: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 17,
    fontWeight: '700',
    minWidth: 70,
    borderWidth: 1,
    borderColor: c.lineStrong,
  },
  unit: { color: c.inkSoft, fontSize: 15, marginHorizontal: 8 },
  // Champs resserrés : la fiche tient sur une ligne, boutons compris, sans
  // passer sous le bouton d'enregistrement.
  /**
   * Une distance au mur, dans le bandeau du plafond.
   *
   * C'est une pastille qu'on TOUCHE, pas un champ qu'on remplit sur place :
   * le bandeau est en bas de l'écran, et le clavier le recouvre en entier.
   * L'appui ouvre la feuille de saisie, qui monte avec le clavier.
   */
  clChamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
  },
  clValeur: { color: c.ink, fontSize: 16, fontWeight: '800', minWidth: 30 },
  inputSmall: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 14.5,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: c.lineStrong,
  },
  // `flexShrink: 0` : les trois boutons gardent leur taille, ce sont les
  // champs qui cèdent si la place manque — jamais l'inverse.
  editIcons: { flexDirection: 'row', gap: 6, marginLeft: 'auto', flexShrink: 0 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOk: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: c.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openingButton: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginLeft: 'auto',
    marginRight: 8,
  },
  openingText: { color: c.inkSoft, fontWeight: '700', fontSize: 13 },
  applyButton: {
    backgroundColor: c.blue,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  applyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  roomAction: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginLeft: 8,
  },
  roomActionText: { color: c.inkSoft, fontWeight: '700', fontSize: 13.5 },
  exportChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginTop: 8,
  },
  exportChoiceTexts: { flex: 1 },
  exportChoiceOn: { backgroundColor: c.blueSoft },
  exportChoiceTitle: { color: c.ink, fontSize: 15.5, fontWeight: '700' },
  exportChoiceTitleOn: { color: c.blue },
  exportChoiceDetail: {
    color: c.inkFaint,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  issueScroll: { maxHeight: 320, marginTop: 4 },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 11,
    backgroundColor: c.inkFaint,
  },
  issueDotAlert: { backgroundColor: c.danger },
  issueTexts: { flex: 1 },
  issueMessage: { color: c.ink, fontSize: 14.5, fontWeight: '600' },
  issueHint: { color: c.inkFaint, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  nameScroll: { maxHeight: 260 },
  nameGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  nameChip: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  nameChipOn: { backgroundColor: c.blueSoft, borderColor: c.blue },
  nameChipText: { color: c.ink, fontSize: 14, fontWeight: '600' },
  nameChipTextOn: { color: c.blue, fontWeight: '800' },
  removeRoomButton: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginLeft: 10,
  },
  removeRoomText: { color: c.danger, fontWeight: '700', fontSize: 14 },
  objectList: { maxHeight: 58, marginTop: 10, marginBottom: 6, flexGrow: 0 },
  objectChipSelected: { borderColor: c.blue, borderWidth: 1.5 },
  objectChip: {
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginRight: 8,
  },
  objectName: { color: c.ink, fontSize: 13, fontWeight: '700' },
  objectDims: { color: c.inkFaint, fontSize: 11.5 },
  exportButton: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
    ...glow(c.blue),
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 4,
  },
  switchLabel: { color: c.ink, fontSize: 14.5, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, paddingBottom: 34, paddingTop: 8 },
  primaryButton: {
    flex: 1,
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    ...glow(c.blue),
  },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingVertical: 15,
    // Trois boutons sur la ligne : l'icône et le mot se serrent la main
    // plutôt que de s'empiler.
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.05,
  },
  secondaryText: { color: c.ink, fontSize: 14, fontWeight: '600' },
  secondaryTextBlue: { color: c.blue, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,13,18,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: 20,
    width: '100%',
    ...shadowCard,
  },
  modalTitle: { color: c.ink, fontSize: 17, fontWeight: '800' },
  elecWrap: { width: '100%' },
  elecWrapPlein: { flex: 1 },
  elecPlein: { flex: 1 },
  // Plein écran, aux marges près : le pouce a besoin de la place.
  modalBackdropPlein: { padding: 12, paddingTop: 56, justifyContent: 'flex-end' },
  // Diagnostic : un état d'abord — combien, et est-ce grave —, puis la
  // liste. L'ancienne fenêtre commençait par une consigne d'usage.
  // Le volet d'une pièce : son nom, le nombre de constats, un chevron qui
  // pivote. Rien de plus — c'est un séparateur qu'on peut viser du pouce.
  // Carte d'explication du mur rouge : posée sous la barre de cote, elle
  // répond à l'appui sans couvrir le mur qu'on vient de toucher.
  elecCard: {
    position: 'absolute',
    top: 62,
    left: 10,
    right: 58,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: c.danger,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadowCard,
  },
  elecCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  elecDotAlert: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.danger,
  },
  elecCardTitle: { color: c.ink, fontSize: 13.5, fontWeight: '800', flex: 1 },
  elecCardRule: {
    color: c.inkSoft,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 5,
  },
  elecCardMore: {
    color: c.blue,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 9,
  },
  // La rose des vents occupe le coin haut-gauche : les bandeaux se
  // décalent pour ne pas la couvrir.
  barShift: { left: 62 },
  // Deux pastilles ancrées au lieu d'une : le bandeau recule d'autant.
  barShiftRight: { right: 102 },
  elecCardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  elecFix: {
    backgroundColor: c.blue,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  elecFixText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  elecSee: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  elecSeeText: { color: c.inkSoft, fontSize: 12.5, fontWeight: '700' },
  elecScroll: { maxHeight: 340 },
  elecFamily: {
    color: c.inkFaint,
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  elecGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catSearch: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.lineStrong,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  catScroll: { maxHeight: 380 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: {
    width: 92,
    alignItems: 'center',
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  catName: {
    color: c.ink,
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  catDims: { color: c.inkFaint, fontSize: 9.5, fontWeight: '600', marginTop: 1 },
  elecChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
  },
  elecDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  elecDotText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
  elecChipText: { color: c.ink, fontSize: 13.5, fontWeight: '700' },
  modalSubtitle: {
    color: c.inkFaint,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 12,
  },
  modalCopy: { alignItems: 'center', paddingTop: 14 },
  modalCopyText: { color: c.blue, fontSize: 14, fontWeight: '700' },
  modalInput: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.lineStrong,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '600',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: c.surfaceSunken,
  },
  modalGhostText: { color: c.inkSoft, fontWeight: '600', fontSize: 14.5 },
  modalPrimary: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: c.blue,
  },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14.5 },
}));
