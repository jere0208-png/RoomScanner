import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { garderLeTravail } from '../ui/gardeTravail';
import { AlerteSortie } from '../components/AlerteSortie';
import { ChoixOuverture } from '../components/ChoixOuverture';
import {
  ALLEGES_COURANTES,
  HAUTEURS_SOUS_PLAFOND,
  hauteursCourantes,
  largeursCourantes,
  pastilles,
} from '../ui/cotesCourantes';
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
import { ExistantSheet } from './result/ExistantSheet';
import { LaserSheet } from './result/LaserSheet';
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
import { corrigerConstat, poserAuxNormes } from '../geometry/auto';
import { ControlePastille } from '../components/ControlePastille';
import { ChoixScan } from '../components/ChoixScan';
import { RoomBar } from '../components/RoomBar';
import { StripBar } from '../components/StripBar';
import {
  PILL_CELL_H,
  PILL_GAP,
  ToolPill,
} from '../components/ToolPill';
import { PEIGNE_TOTAL } from '../components/RangeeOutils';
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
  posesDeMur,
  type PoseDeMur,
  planFrameAngle,
  filtrerAuNiveau,
  nomDuNiveau,
  abregerNiveau,
  niveauDe,
  niveauxPresents,
  murPorteurDe,
  roomOf,
  wallQuadsOf,
  roomExtent,
  roomHeight,
  roomParts,
  pointOnSeg,
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
import { buildDxf, dxfFilename } from '../export/dxf';
import {
  FIXTURES,
  COMMANDES_MURALES,
  faceX,
  facePoint,
  interiorSide,
  wallFace,
  type Fixture,
  type FixtureKind,
} from '../geometry/electrical';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScanStore } from '../store/scanStore';
import { demarrerComplement, demarrerEtage } from '../native/useRoomScan';
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
 * Ce qui peut COMMANDER vit désormais dans `electrical.ts`
 * (`COMMANDES_MURALES`) : le magasin garde le même savoir pour refuser un
 * lien impossible, et deux listes finiraient par diverger.
 */

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
  /** Ce que la colonne d'actions occupe VRAIMENT en largeur. */
  const [wActions, setWActions] = useState(0);
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
  /*
    LE BANDEAU SE POSE AU-DESSUS DU PEIGNE, PAS DESSUS.

    Relevé du patron, capture à l'appui : « le bloc en bas cache le
    "Afficher" ». Il montait d'une cellule au-dessus de la rangée — la
    hauteur des pastilles — sans compter le peigne, qui vit là lui aussi :
    sa barre, ses descentes et son mot. C'est le peigne qui dit ce qu'il
    prend (`PEIGNE_TOTAL`) ; l'écran ne le devine plus.
  */
  const ligneBandeau =
    ligneOutils + Math.max(PILL_CELL_H + PILL_GAP, PEIGNE_TOTAL + 8);
  /**
   * LA HAUTEUR QU'UN BANDEAU PEUT PRENDRE, au pire.
   *
   * Deux parties — le texte sur deux lignes, une rangée de boutons de
   * quarante-quatre points qui peut se replier — plus les marges de la
   * carte. On la majore une fois ici plutôt que de la mesurer : le plan s'en
   * sert pour ne PAS y ranger le menu d'un mur, et une mesure qui arrive
   * après le premier rendu ferait sauter la barre sous les doigts.
   */
  const HAUTEUR_BANDEAU = 132;
  const tousLesMurs = useScanStore((s) => s.walls);
  const tousLesMeubles = useScanStore((s) => s.objects);
  const scanName = useScanStore((s) => s.scanName);
  const saves = useScanStore((s) => s.saves);
  const toutesLesPhotos = useScanStore((s) => s.photos);
  const removePhoto = useScanStore((s) => s.removePhoto);
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const setWallLength = useScanStore((s) => s.setWallLength);
  const renameCurrent = useScanStore((s) => s.renameCurrent);
  const saveAsCopy = useScanStore((s) => s.saveAsCopy);
  const dirty = useScanStore((s) => s.dirty);
  const commitCurrent = useScanStore((s) => s.commitCurrent);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  const toutesLesPieces = useScanStore((s) => s.rooms);
  const removeRoom = useScanStore((s) => s.removeRoom);
  const duplicateRoom = useScanStore((s) => s.duplicateRoom);
  const resizeRoom = useScanStore((s) => s.resizeRoom);
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
  const canRedo = useScanStore((s) => s.canRedo);
  const redo = useScanStore((s) => s.redo);
  const toutesLesOuvertures = useScanStore((s) => s.openings);
  const toutLAppareillage = useScanStore((s) => s.fixtures);
  const addFixture = useScanStore((s) => s.addFixture);
  const toutLePlafond = useScanStore((s) => s.ceiling);
  /*
    L'ÉCRAN NE MONTRE QU'UN ÉTAGE.

    Superposés, deux niveaux donnent un plan illisible : les murs du haut
    traversent les pièces du bas, le métré compte double, et le contrôle des
    normes cherche l'interrupteur d'entrée d'une chambre parmi les murs du
    rez-de-chaussée. Tout ce que l'écran manipule est donc filtré ICI, à la
    source — une seule fois, plutôt qu'à chacun des cinquante endroits qui
    lisent ces listes, où l'oubli serait certain.

    La sauvegarde et l'export, eux, gardent le bâtiment entier : ils partent
    du magasin, pas de cet écran.
  */
  const niveauCourant = useScanStore((s) => s.niveauCourant);
  const { walls, openings, rooms, fixtures, photos, objects, ceiling } =
    useMemo(
      () =>
        filtrerAuNiveau(
          {
            walls: tousLesMurs,
            openings: toutesLesOuvertures,
            rooms: toutesLesPieces,
            fixtures: toutLAppareillage,
            photos: toutesLesPhotos,
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
        toutesLesPhotos,
        tousLesMeubles,
        toutLePlafond,
        niveauCourant,
      ],
    );
  /** Les étages du dossier, du haut vers le bas — le sélecteur les montre. */
  const niveaux = useMemo(
    () => niveauxPresents(tousLesMurs, toutesLesPieces),
    [tousLesMurs, toutesLesPieces],
  );
  /*
    LE FILIGRANE DU NIVEAU DU DESSOUS.

    On ne recale pas un étage sur du vide : sans le plan du dessous en
    transparence, rien ne dit où tombe la cage d'escalier. C'est le seul
    repère commun entre deux relevés qu'ARKit a démarrés à deux endroits
    différents.
  */
  const filigrane = useMemo(
    () => tousLesMurs.filter((w) => niveauDe(w) === niveauCourant - 1),
    [tousLesMurs, niveauCourant],
  );
  const addCeiling = useScanStore((s) => s.addCeiling);
  const notes = useScanStore((s) => s.notes);
  const addNote = useScanStore((s) => s.addNote);
  const moveNote = useScanStore((s) => s.moveNote);
  const editNote = useScanStore((s) => s.editNote);
  const removeNote = useScanStore((s) => s.removeNote);
  const addRoomBox = useScanStore((s) => s.addRoomBox);
  const addRoomLibre = useScanStore((s) => s.addRoomLibre);
  const arreterPiece = useScanStore((s) => s.arreterPiece);
  const moveRoom = useScanStore((s) => s.moveRoom);
  const removeCeiling = useScanStore((s) => s.removeCeiling);
  const moveCeiling = useScanStore((s) => s.moveCeiling);
  const setCeilingRow = useScanStore((s) => s.setCeilingRow);
  const removeCeilingRow = useScanStore((s) => s.removeCeilingRow);
  const toggleCeilingCommand = useScanStore((s) => s.toggleCeilingCommand);
  const toggleFixtureCommand = useScanStore((s) => s.toggleFixtureCommand);
  // L'arrivage du scan : lu ICI, avec les autres liaisons — un hook après
  // un retour anticipé casse l'ordre des hooks.
  const arrivage = useScanStore((s) => s.arrivage);
  const moveFixture = useScanStore((s) => s.moveFixture);
  const resizeOpening = useScanStore((s) => s.resizeOpening);
  const removeOpening = useScanStore((s) => s.removeOpening);
  const moveOpening = useScanStore((s) => s.moveOpening);
  const setAllege = useScanStore((s) => s.setAllege);
  const setOpeningType = useScanStore((s) => s.setOpeningType);
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
  const setScreen = useScanStore((s) => s.setScreen);
  const reset = useScanStore((s) => s.reset);
  const teinte = useTheme();
  const styles = getStyles(teinte);
  /*
    LA ZONE RÉSERVÉE DE LA COLONNE D'ACTIONS.

    Relevé du patron, trait rouge tracé sur la capture : le bandeau du mur
    passait SOUS « Enregistrer / Annuler / Édition », et son dernier bouton
    se lisait tranché par une pastille bleue. La réserve valait
    soixante-deux points écrits en dur — un pari sur la largeur d'une
    colonne qui grandit avec ses mots : « Enregistrer » est plus long
    qu'« Édition ».

    On MESURE donc ce qu'elle occupe (le même `onLayout` qui donne déjà sa
    hauteur), et tout ce qui vit à sa gauche s'arrête là, plus un vrai
    blanc : deux blocs qui se frôlent se lisent comme un seul.
  */
  const garde = Math.max(62, wActions + 10);
  // Les bandeaux contextuels se posent au-dessus de la rangée de calques.
  const stylesBarres = useMemo(
    () => ({
      ...styles,
      wallStrip: [styles.wallStrip, { bottom: ligneBandeau, marginRight: garde }],
      /*
        LA CARTE REÇOIT SES MESURES ICI — c'est le seul endroit qui les
        connaisse : le pied réel de l'écran (au-dessus de la rangée
        d'outils) et la largeur VRAIE de la colonne d'actions.

        `maxWidth` remplace le `right` : la carte épouse son contenu (relevé
        du patron, « trop de marge blanche sur son bloc ») mais ne peut pas
        déborder sous la colonne.
      */
      bandeau: [
        styles.bandeau,
        { bottom: ligneBandeau, maxWidth: Math.max(200, winLargeur - 12 - garde) },
      ],
      editBar: [
        styles.editBar,
        { bottom: ligneBandeau, maxWidth: Math.max(200, winLargeur - 12 - garde) },
      ],
    }),
    [styles, ligneBandeau, garde, winLargeur],
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
  /*
    LA CIBLE DU TÉLÉMÈTRE : ce qu'on cote, sa valeur relevée, et ce qu'on
    en fait. Le tout dans un seul état — la feuille ne connaît ni les murs
    ni le magasin, elle rend un nombre à qui l'a ouverte.
  */
  const [laser, setLaser] = useState<{
    nom: string;
    actuelle: number | null;
    appliquer: (metres: number) => void;
  } | null>(null);
  /*
    LE RECALAGE D UN ETAGE.

    Le filigrane du niveau du dessous ne servait a rien : il s affichait,
    et aucun geste ne permettait de bouger le plan du dessus. Dans ce mode,
    le glissement deplace L ETAGE au lieu de la vue — le geste qu on ferait
    spontanement pour poser un calque sur un autre.
  */
  const planVierge = useScanStore((s) => s.planVierge);
  const [recalage, setRecalage] = useState(false);
  /** La feuille du tableau existant — rénovation. */
  const [existantOuvert, setExistantOuvert] = useState(false);
  const existant = useScanStore((s) => s.existant);
  const [checking, setChecking] = useState(false);
  // Choix du format d'export : plan PDF, modèle 3D, ou image de la vue.
  const [exporting, setExporting] = useState(false);
  /** La feuille « Ajouter une pièce » : nom, largeur, profondeur. */
  const [ajoutPiece, setAjoutPiece] = useState(false);
  /*
    LE RECTANGLE QU'ON TIRAIT DANS LE VIDE — geste retire de l'ecran.

    Premier releve du patron : « a la selection d'une piece a ajouter, elle
    se place automatiquement et impossible de creer des murs pour faire la
    piece facilement ». On avait repondu par un geste : poser un doigt,
    glisser, lacher.

    Deuxieme releve, apres essai : « le "ajouter une piece" ne montre pas
    qu'il faut creer la piece, et de plus au glissement, ca s'annule tout
    seul avec le deplacement du plan ». Tirer un rectangle dans le vide ne
    montre RIEN — on touche, le plan bouge, et l'on conclut que le bouton ne
    marche pas. La piece se POSE donc, et se regle sur elle-meme.

    `addRoomRect` reste au magasin, avec son banc : c'est la meme geometrie
    qui sert a la piece posee, et le jour ou un geste de trace revient, il
    n'y aura pas a la reecrire.
  */
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
  /*
    LE MENU DES ÉTAGES.

    Il liste les niveaux du haut vers le bas — comme un ascenseur — et
    propose, sous eux, d'en scanner un de plus. Le nom complet s'écrit ici
    (« 1er étage ») alors que la pastille abrège (« R+1 ») : dans une liste
    on a la place, et « R+1 » ne se lit bien que quand on sait déjà.
  */
  const menuDesEtages = (): ActionData => ({
    title: 'Étage',
    subtitle:
      'Le plan, le métré et le contrôle ne montrent que le niveau choisi.',
    actions: [
      ...niveaux.map((n) => ({
        label: nomDuNiveau(n),
        hint:
          n === niveauCourant
            ? 'Niveau affiché'
            : `${
                toutesLesPieces.filter((r) => niveauDe(r) === n).length
              } pièce(s)`,
        icon: 'piece' as const,
        onPress: () => {
          useScanStore.getState().allerAuNiveau(n);
          haptic('leger');
        },
      })),
      ...(niveauCourant !== Math.min(...niveaux)
        ? [
            {
              /*
                RECALER — seulement s il y a un niveau EN DESSOUS.

                Recaler le rez-de-chaussee sur rien n aurait pas de sens :
                c est lui la reference, et le filigrane qu on suit est
                toujours celui du dessous.
              */
              label: 'Recaler cet étage',
              hint: 'Glissez le plan sur le filigrane du niveau du dessous.',
              icon: 'regle' as const,
              onPress: () => {
                setRecalage(true);
                haptic('leger');
              },
            },
          ]
        : []),
      /*
        RETIRER L'ÉTAGE AFFICHÉ — relevé du patron : « rien ne peut se
        séparer ».

        Le menu savait en ajouter et les recaler, jamais en retirer. Or
        c'est le relevé qu'on rate le plus souvent : on monte un escalier,
        on scanne trois murs de travers, et le dossier entier était bon à
        refaire. Il ne paraît que s'il reste un autre niveau derrière — un
        dossier sans un seul mur n'est pas un dossier.
      */
      ...(niveaux.length > 1
        ? [
            {
              label: `Retirer ${nomDuNiveau(niveauCourant).toLowerCase()}`,
              hint: 'Ses murs, ses pièces, ses meubles et son appareillage.',
              icon: 'supprimer' as const,
              danger: true,
              onPress: () => {
                const pieces = toutesLesPieces.filter(
                  (r) => niveauDe(r) === niveauCourant,
                ).length;
                setMenu({
                  title: `Retirer ${nomDuNiveau(niveauCourant).toLowerCase()} ?`,
                  subtitle:
                    `${pieces} pièce${pieces > 1 ? 's' : ''} et tout ce qui ` +
                    'y est posé quittent le dossier. Le reste ne bouge pas, ' +
                    'et « Annuler » sait revenir en arrière.',
                  actions: [
                    {
                      label: 'Retirer cet étage',
                      icon: 'supprimer' as const,
                      danger: true,
                      onPress: () => {
                        useScanStore.getState().retirerNiveau(niveauCourant);
                        haptic('succes');
                      },
                    },
                  ],
                });
              },
            },
          ]
        : []),
      {
        label: 'Scanner un étage de plus',
        hint: 'Montez, relevez : il s’ajoute à ce dossier, au-dessus.',
        icon: 'regle' as const,
        onPress: () => {
          // Au-dessus du plus haut : on monte, on ne creuse pas. Le
          // sous-sol se demande depuis le menu du plan, où l'on a la place
          // de le dire en toutes lettres.
          demarrerEtage(Math.max(...niveaux) + 1).catch(() => {});
        },
      },
    ],
  });

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
  // Éteintes d'office, comme les autres calques du modèle : voir
  // `showSurfaces` dans le magasin — on ouvre sur le bâti et ses meubles.
  const [show3DMeasures, setShow3DMeasures] = useState(false);
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
  /*
    LE PLAFOND RESTE ALLUMÉ, lui, et c'est délibéré.

    Les autres calques s'éteignent d'office (voir `showSurfaces`) : ils
    montrent ce que le scan a relevé. Le plafond, non — il montre ce que
    L'ON A POSÉ. Un point lumineux qu'on vient de placer et qui disparaît
    parce qu'un calque est éteint, c'est un geste qu'on croit raté.

    Et il ne coûte rien à l'ouverture d'un scan : sans appareil de plafond,
    son bouton ne paraît même pas.
  */
  const [showCeiling, setShowCeiling] = useState(true);
  /** Appareil de plafond en attente de pose : on touche la pièce qui le reçoit. */
  const [pendingCeiling, setPendingCeiling] = useState<CeilingKind | null>(null);
  /** On attend le point où poser un mot sur le plan. */
  const [pendingNote, setPendingNote] = useState(false);
  /**
   * La note qu'on REPOSE : on attend son nouveau point.
   *
   * Écrire au bon endroit du premier coup demanderait de viser avant de
   * savoir ce qu'on va dire. On pose, on lit, et on rectifie — c'est déjà
   * ce que font le meuble et l'appareil de plafond.
   */
  const [noteADeplacer, setNoteADeplacer] = useState<string | null>(null);
  /**
   * LES POSES OFFERTES À UN MUR NEUF — relevé du patron : « "Ajouter un mur"
   * doit afficher les multiples possibilités d'attachement à un autre mur
   * dans des angles de 90° et 180° pour droit, à chaque fin de mur ».
   *
   * Le mur naissait tout seul au dernier bout libre, droit devant :
   * l'application choisissait à la place de l'électricien. Elle montre, et
   * il choisit.
   */
  const [posesMur, setPosesMur] = useState<PoseDeMur[] | null>(null);
  /** La note tenue en main : son bandeau propose de la reprendre. */
  const [selNote, setSelNote] = useState<string | null>(null);
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
   * L'appareil MURAL dont on noue le lien — prise commandée, applique.
   * On le tient depuis l'établi (« Lier »), puis on touche l'interrupteur
   * sur le plan : le même geste que pour une ligne de spots.
   */
  const [pendingLienMur, setPendingLienMur] = useState<string | null>(null);
  /*
    LE MUR QU'ON S'APPRÊTE À PERCER.

    La feuille de choix se referme AVANT de poser la menuiserie (iOS ne
    présente qu'une fenêtre modale à la fois, voir `SheetShell`) : l'état
    qui la rend visible est déjà retombé à `null` quand le choix arrive. Le
    mur voyage donc dans une référence, qui, elle, ne se vide pas en route.
  */
  const murAPercer = useRef<string | null>(null);
  const [choixOuverture, setChoixOuverture] = useState(false);
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
    (garde?: 'mur' | 'plafond' | 'lien' | 'reglage' | 'note' | 'pose') => {
      if (garde !== 'mur') setPendingKind(null);
      // Un seul geste en attente à la fois : deux pastilles allumées, et
      // le prochain appui sur le plan est une loterie.
      if (garde !== 'note') {
        setPendingNote(false);
        setNoteADeplacer(null);
      }
      if (garde !== 'plafond') {
        setPendingCeiling(null);
        setPendingSpots(null);
      }
      if (garde !== 'lien') {
        setPendingLink(null);
        setPendingLienMur(null);
      }
      if (garde !== 'reglage') setSelCeiling(null);
      /* Les fantômes d'un mur neuf s'en vont avec le reste : deux gestes
         armés à la fois, et le prochain appui sur le plan est une loterie. */
      if (garde !== 'pose') setPosesMur(null);
    },
    [],
  );
  /** Repères électriques en 3D : un calque comme les autres. */
  // Les repères d'appareil : indispensables pour poser, encombrants pour
  // regarder. Une pièce équipée en porte une dizaine.
  const [showElecTags, setShowElecTags] = useState(false);
  /** Hauteur de la pile des calques en trop, mesurée par la rangée. */
  const [hSuite, setHSuite] = useState(0);
  /*
    CE QUI SE TIENT ENTRE LA LIGNE ET LA PILE DE CALQUES.

    En plan, la colonne des commandes — Édition, et l'annulation quand il y
    a de quoi : le trop-plein de calques se pose au-dessus d'elle, et
    « Enregistrer » au-dessus de tout. En 3D, RIEN : on ne modifie pas une
    maquette, la colonne n'est pas rendue.

    Relevé du patron, capture à l'appui : « le bouton Enregistrer se place
    haut sans raison, il y a de la place plus bas ». Il réservait la hauteur
    de cette colonne même en 3D — et pas n'importe laquelle : celle qu'on
    avait MESURÉE au dernier passage en plan, trois pastilles quand on
    venait d'annuler. Le bouton flottait à mi-modèle. Les deux piles
    comptent désormais le même étage : ce qui n'est pas rendu ne réserve
    rien.
  */
  /*
    L'ORDRE DE LA COLONNE, DU PIED VERS LE HAUT.

    Relevé du patron : « descends le "Note" d'un bouton, et remonte celui du
    retour en arrière ou refaire. Le Note doit être au-dessus de l'édition. »

    Le trop-plein de la rangée se posait au-dessus de TOUTE la colonne des
    commandes. En édition, ce trop-plein n'est pas un calque de plus : c'est
    un OUTIL DE POSE — « Note » sur la capture — et sa place est contre le
    bouton qui l'a fait paraître. Le retour en arrière, lui, monte : on le
    cherche moins souvent qu'on ne pose.

    Quatre étages, chacun posé sur la hauteur MESURÉE du précédent :
    « Édition » au pied, ce qui déborde de la rangée, les commandes, puis
    l'enregistrement. Ce qui n'est pas rendu ne réserve rien — la 3D n'a ni
    édition ni commandes, et tout redescend d'autant.
  */
  const dessusOutils = vue === '2d' ? PILL_CELL_H + PILL_GAP : 0;
  /** L'étage des commandes : au-dessus du trop-plein de la rangée. */
  const etageCommandes =
    ligneOutils + dessusOutils + hSuite + (hSuite > 0 ? PILL_GAP : 0);
  /** Et l'enregistrement au-dessus de tout, commandes comprises. */
  const hCommandes = vue === '2d' ? hActions : 0;
  const etageSauvegarde =
    etageCommandes + (hCommandes > 0 ? hCommandes + PILL_GAP : 0);
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
  /**
   * PAS DE BOUTON « VALIDER » — la pièce qu'on lâche se ferme.
   *
   * C'est déjà la règle des meubles, et le relevé du patron la reprend pour
   * la pièce qu'on vient de poser : on la pousse, on l'étire, et dès qu'on
   * touche autre chose son trait pointillé se referme. Un bouton de plus
   * serait un geste de plus pour ne rien dire de neuf.
   */
  const fermerPiecesNeuves = useCallback((sauf?: string | null) => {
    for (const r of useScanStore.getState().rooms) {
      if (r.neuve && r.id !== sauf) arreterPiece(r.id);
    }
  }, [arreterPiece]);
  const seuleSelection = useCallback(
    (garde?: 'mur' | 'meuble' | 'piece' | 'ouverture' | 'plafond') => {
      if (garde !== 'mur') setSelectedWallId(null);
      if (garde !== 'meuble') setSelectedObjectId(null);
      if (garde !== 'piece') {
        setSelectedRoomId(null);
        fermerPiecesNeuves();
      }
      if (garde !== 'ouverture') setSelectedOpeningId(null);
      if (garde !== 'plafond') {
        setSelCeiling(null);
        setSelRow(null);
      }
    },
    [fermerPiecesNeuves],
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
  /**
   * L'ALERTE DE SORTIE — la seule fenêtre de l'app posée au MILIEU.
   *
   * Elle porte la même donnée qu'une feuille (`garderLeTravail` décide du
   * titre, de la phrase et de l'ordre des deux issues) ; c'est son écrin
   * qui diffère, parce que ce qui se décide là ne se balaie pas d'un revers
   * de pouce.
   */
  const [alerteSortie, setAlerteSortie] = useState<ActionData | null>(null);
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
        // L'appareillage donne le NOMBRE DE CONDUCTEURS, et c'est lui qui
        // decide du diametre — releve du patron : « les diametres
        // recommandes pour chaque tirage selon nombre de fils aux normes ».
        fixtures,
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

  /*
    LE PLAN EN DXF — le dessin qu'on reprend.

    Le PDF se remet à un client ; le DXF s'ouvre chez un architecte, un
    économiste, un cuisiniste — qui le posent sous LEUR projet et
    l'annotent. Il part par le même chemin que le métré : un fichier texte,
    et la feuille de partage du système.

    Il porte le NIVEAU AFFICHÉ, comme le PDF : un fichier qui empilerait
    deux étages donnerait un dessin où les murs du haut traversent les
    pièces du bas, et personne ne saurait les démêler.
  */
  const shareDxf = async () => {
    try {
      await RoomScan.shareText(
        buildDxf({ walls, openings, rooms, fixtures, objects }),
        dxfFilename(
          niveaux.length > 1
            ? `${scanName} ${abregerNiveau(niveauCourant)}`
            : scanName,
        ),
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
      /* Les cotes du commerce, à toucher plutôt qu'à taper — et celles de
         SA nature : on ne propose pas 63 pour une baie libre. */
      choix: pastilles(
        quoi === 'largeur'
          ? largeursCourantes(o.type as 'door' | 'window' | 'opening')
          : hauteursCourantes(o.type as 'door' | 'window' | 'opening'),
        'cm',
      ),
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (!(v > 0)) return;
        if (quoi === 'largeur') resizeOpening(id, v, undefined);
        else resizeOpening(id, undefined, v);
      },
    });
  };

  /**
   * REPLACER UNE MENUISERIE SUR SON MUR.
   *
   * « La porte à quatre-vingt-dix du mur » est la cote qu'un poseur mesure
   * sur place, et la seule que le plan ne savait pas recevoir : le bandeau
   * donnait largeur, hauteur, coffre et fermeture, jamais la position. Une
   * porte à trente centimètres du bon endroit ne pouvait que se supprimer
   * et se reposer, en reperdant sa hauteur, son type et son coffre.
   *
   * ON DEMANDE LA COTE DU TABLEAU, pas de l'axe : personne ne mesure
   * jusqu'au milieu d'une porte, on pose le mètre contre le refend et on
   * lit jusqu'au bord de la menuiserie.
   */
  const promptOpeningPos = (id: string) => {
    const o = openings.find((x) => x.id === id);
    if (!o) return;
    // Le mur porteur : le plus proche du milieu de l'ouverture, comme le
    // magasin le retrouve pour appliquer la cote.
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    let mur: (typeof walls)[number] | null = null;
    let best = Infinity;
    for (const w of walls) {
      const d = pointOnSeg(mid, w.a, w.b).dist;
      if (d < best) {
        best = d;
        mur = w;
      }
    }
    if (!mur || best > 0.6) return;
    // La cote actuelle, pour que le champ parte de la vérité du plan.
    const L = segLength(mur);
    const l = segLength(o);
    const proj =
      L > 0
        ? ((mid.x - mur.a.x) * (mur.b.x - mur.a.x) +
            (mid.z - mur.a.z) * (mur.b.z - mur.a.z)) /
          L
        : 0;
    setPrompt({
      title: 'Position sur le mur',
      subtitle:
        'Du coin du mur au BORD de la menuiserie — la cote qu’on mesure ' +
        'sur place, mètre posé contre le refend.',
      value: Math.max(0, proj - l / 2)
        .toFixed(2)
        .replace('.', ','),
      unit: 'm',
      numeric: true,
      /*
        ICI, LES PROPOSITIONS NE SONT PAS DES COTES, CE SONT DES POSES.

        « 1,35 » ne dit rien à personne : cette cote-là dépend de la
        longueur du mur et de la largeur de la menuiserie. Ce qu'un poseur
        demande, c'est « au milieu » ou « au ras du refend » — les deux
        seules positions qui ne se mesurent pas. Elles sont calculées ici,
        pour CE mur, et le champ reste pour les 90 relevés au mètre.

        Rien à proposer si la menuiserie remplit le mur : trois pastilles
        qui donneraient toutes la même cote se lisent comme un geste raté.
      */
      choix:
        L - l > 0.25
          ? [
              { label: 'Centrée', value: ((L - l) / 2).toFixed(2).replace('.', ',') },
              { label: '10 à gauche', value: '0,10' },
              {
                label: '10 à droite',
                value: (L - l - 0.1).toFixed(2).replace('.', ','),
              },
            ]
          : undefined,
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (isFinite(v)) moveOpening(id, v);
      },
    });
  };

  /**
   * L'ALLÈGE : du sol au repos de la baie.
   *
   * C'est la cote qui décide d'une prise sous fenêtre ou d'un convecteur,
   * et elle se lit déjà partout — élévation, dossier imprimé. Elle se règle
   * ici. La menuiserie MONTE, elle ne se rogne pas : une fenêtre remontée
   * de dix centimètres reste une fenêtre de la même taille.
   */
  const promptAllege = (id: string) => {
    const o = openings.find((x) => x.id === id);
    if (!o) return;
    setPrompt({
      title: 'Allège',
      subtitle: 'Du sol au repos de la baie — la cote d’une prise dessous.',
      /* Depuis le SOL DU MUR, pas depuis le zéro du repère : ARKit place
         son origine à hauteur de main, et la cote lue au bandeau ne
         correspondait alors à rien de ce qu'on mesure sur place. */
      value: Math.max(0, o.yCenter - o.height / 2 - murPorteurDe(o, walls).sol)
        .toFixed(2)
        .replace('.', ','),
      unit: 'm',
      numeric: true,
      /* Zéro pour une porte-fenêtre, 110 au-dessus d'un plan de travail :
         quatre appuis qui couvrent presque tout un logement. */
      choix: pastilles(ALLEGES_COURANTES, 'cm'),
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (isFinite(v)) setAllege(id, v);
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
      ...checkPlan(walls, rooms, openings).map((i, n) => ({
        key: `p${n}`,
        message: i.message,
        hint: i.hint,
        severity: i.severity as string,
        wallId: i.wallId,
        roomId: i.roomId,
        code: i.kind,
        // Le linteau raboté sait se corriger : un appui le remonte au
        // niveau des autres baies.
        fix:
          i.kind === 'linteau' && i.openingId && i.linteau
            ? ({
                type: 'linteau',
                openingId: i.openingId,
                haut: i.linteau,
                label: 'Remonter le linteau',
              } as const)
            : undefined,
      })),
      ...elecIssues.map((i, n) => ({
        key: `e${n}`,
        message: i.message,
        hint: i.regle,
        severity: i.severity as string,
        roomId: i.roomId,
        // Le sujet et le geste voyagent avec le constat : l'icône de la
        // ligne et son bouton « corriger » en vivent.
        code: i.code,
        fix: i.fix,
      })),
    ],
    [walls, rooms, openings, elecIssues],
  );
  const alertes = useMemo(
    () => issues.filter((i) => i.severity === 'alerte').length,
    [issues],
  );
  /*
    LES CONSTATS QUI NE DÉPENDENT PAS DE LA POSE.

    Relevé du patron, capture à l'appui : la pastille restait GRISE alors
    que le panneau annonçait « 9 points à corriger » — dont sept sur le
    plan, des baies cadrées sous leur tablier de volet, avec le geste tout
    prêt : « Remonter le linteau ».

    Le verdict attendait le premier appareil, et c'est une bonne règle pour
    ce qui SE COMPTE en appareils : on ne reproche pas cinq socles
    manquants à quelqu'un qui vient d'ouvrir l'application. Mais un défaut
    de relevé n'est pas un reproche prématuré — il est vrai avant la pose,
    et il se corrige d'un appui.

    Les constats du plan portent une clé « p… », ceux de l'électricité une
    clé « e… » : c'est le seul endroit où les deux familles se distinguent,
    et ce n'est pas un hasard — le reste de l'écran les traite ensemble,
    « celui qui regarde son plan se moque de savoir si le défaut est
    géométrique ou électrique ».
  */
  const alertesDePlan = useMemo(
    () =>
      issues.filter(
        (i) => i.severity === 'alerte' && !i.key.startsWith('e'),
      ).length,
    [issues],
  );

  /*
    ON NE QUITTE PAS UN PLAN MODIFIÉ SANS LE SAVOIR.

    Trouvé en simulant un utilisateur : on ouvre un plan enregistré, on
    ajoute une chambre, on touche la flèche de retour — et tout est perdu,
    sans un mot. L'en-tête affiche bien « Modifications non enregistrées »,
    mais personne ne relit l'en-tête au moment de sortir : on regarde le
    bouton qu'on touche.

    Le brouillon des trente secondes ne rattrape pas ce cas : il ne se relit
    qu'au REDÉMARRAGE de l'application, et l'on vient seulement de revenir à
    la bibliothèque.

    La sortie propose donc d'abord ce que l'utilisateur veut neuf fois sur
    dix — enregistrer — et garde « Quitter sans enregistrer », parce qu'on
    peut vouloir jeter un essai. Quand il n'y a rien à perdre, elle ne
    demande rien : une confirmation inutile est une confirmation qu'on
    apprend à balayer sans lire.
  */
  const sortirDuPlan = () =>
    garderLeTravail({
      /*
        LA QUESTION SE POSE AU MILIEU, dans sa propre page.

        Elle vivait dans la feuille commune, qui monte du bas : c'est ce
        qu'on veut d'un menu, qu'on ouvre par curiosité et qu'on referme
        sans conséquence. Ici, l'appui suivant décide du sort du travail —
        relevé du patron : « le pop-up doit être centré et doit afficher une
        belle page ». Elle garde le MÊME contenu (`garderLeTravail` décide
        de tout), seul son écrin change.
      */
      demander: setAlerteSortie,
      dirty,
      message:
        'Ce que vous venez de faire sur ce plan sera perdu si vous partez.',
      jeter: 'Quitter sans enregistrer',
      enregistrer: commitCurrent,
      partir: () => setScreen(resultOrigin === 'library' ? 'library' : 'home'),
    });

  /*
    REPARTIR DE ZÉRO EST LE PLUS DESTRUCTEUR DES TROIS CHEMINS.

    Après la flèche de retour et l'ouverture d'un plan depuis la
    bibliothèque, voici le troisième geste qui mène dehors — et le pire :
    « Nouveau scan » efface AUSSI le brouillon des trente secondes, qui
    rattrape d'ordinaire une application tuée. Sans garde ici, le travail
    ne se retrouve nulle part.

    Même question, mêmes issues, même ordre : trois gestes mènent dehors,
    trois gardes les couvrent.
  */
  const repartirDeZero = () =>
    garderLeTravail({
      /*
        LA QUESTION SE POSE AU MILIEU, dans sa propre page.

        Elle vivait dans la feuille commune, qui monte du bas : c'est ce
        qu'on veut d'un menu, qu'on ouvre par curiosité et qu'on referme
        sans conséquence. Ici, l'appui suivant décide du sort du travail —
        relevé du patron : « le pop-up doit être centré et doit afficher une
        belle page ». Elle garde le MÊME contenu (`garderLeTravail` décide
        de tout), seul son écrin change.
      */
      demander: setAlerteSortie,
      dirty,
      message:
        'Repartir de zéro efface le plan à l’écran, et ce qui n’a pas été ' +
        'enregistré ne se retrouvera nulle part.',
      jeter: 'Repartir sans enregistrer',
      enregistrer: commitCurrent,
      partir: reset,
    });

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
        /*
          LA HAUTEUR AU LASER — l'autre cote qu'on prend vraiment.

          Debout au milieu de la pièce, le télémètre posé au sol et visant
          le plafond : c'est le geste le plus simple du métier, et celui
          dont dépendent les élévations, le volume et le métré mural.
          RoomPlan la déduit du nuage de points, et se trompe d'autant plus
          que le plafond est encombré.
        */
        {
          label: 'Hauteur au laser',
          icon: 'regle' as const,
          onPress: () => {
            const p = roomParts(walls, rooms).find((x) => x.roomId === roomId);
            if (!p) return;
            setLaser({
              nom: 'la hauteur sous plafond',
              actuelle: roomHeight(p.walls),
              appliquer: (m: number) => setRoomHeight(roomId, m),
            });
          },
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
      choix: pastilles(HAUTEURS_SOUS_PLAFOND, 'm'),
      onSubmit: (t) => {
        const v = parseFloat(t.replace(',', '.'));
        if (!(v > 0)) return;
        setRoomHeight(targetRoom.id, v);
        /*
          ET LE RESTE DU LOGEMENT ?

          Un plancher est coulé d'un seul tenant : la hauteur est la même
          partout, sauf accident — et l'accident (retombée, sous-pente,
          muret) a son réglage à lui, mur par mur. La régler pièce par
          pièce, c'est huit fois le même geste sur un T4.

          La question ne se pose QUE s'il reste des murs à une autre cote :
          poser une question dont on connaît déjà la réponse, c'est un
          geste de plus pour rien.
        */
        const reste = useScanStore
          .getState()
          .walls.filter((w) => Math.abs(w.height - v) > 0.01);
        if (reste.length === 0) return;
        const cote = v.toFixed(2).replace('.', ',');
        setMenu({
          title: 'Et le reste du logement ?',
          subtitle:
            'Une retombée de poutre ou une sous-pente se règle ensuite, ' +
            'mur par mur.',
          actions: [
            {
              label: `Tout le logement à ${cote} m`,
              icon: 'hauteur' as const,
              onPress: () => {
                useScanStore.getState().setAllRoomHeights(v);
                haptic('succes');
              },
            },
            {
              label: 'Cette pièce seulement',
              onPress: () => {},
            },
          ],
        });
      },
    });
  };

  /**
   * LA PIÈCE EST-ELLE UN RECTANGLE D'APLOMB ?
   *
   * C'est la seule forme dont « largeur × profondeur » décrit entièrement le
   * contour. Sur un L, les deux mêmes nombres admettent une infinité de
   * dessins : on n'en choisit pas un à la place de l'électricien, et le
   * geste ne s'offre simplement pas.
   */
  const estRectangle = (
    murs: { a: { x: number; z: number }; b: { x: number; z: number } }[],
  ) =>
    murs.length === 4 &&
    murs.every(
      (w) => Math.abs(w.a.x - w.b.x) < 1e-3 || Math.abs(w.a.z - w.b.z) < 1e-3,
    );

  /**
   * REPOSER LA PIÈCE À SES COTES, en deux saisies.
   *
   * On pose un « Séjour 5,00 × 4,00 » depuis le catalogue, le mètre donne
   * 5,18 × 4,05, et il fallait jusqu'ici déplacer QUATRE murs à la main pour
   * dix-huit centimètres. Deux nombres suffisent.
   *
   * DEUX FEUILLES PLUTÔT QU'UNE À DEUX CHAMPS : la carrosserie de saisie de
   * l'app tient un champ, et un champ qu'on remplit au clavier d'une main,
   * sur un chantier, se valide au retour-chariot. Le plan ne bouge qu'à la
   * fin, d'un seul geste — donc « Annuler » le rend d'un seul appui.
   */
  const promptRoomCotes = () => {
    if (!targetRoom || !targetExtent) return;
    const roomId = targetRoom.id;
    const nb = (t: string) => parseFloat(t.replace(',', '.'));
    setPrompt({
      title: 'Largeur de la pièce',
      subtitle: 'Le coin haut-gauche ne bouge pas : la pièce s’étend vers la droite et vers le bas.',
      value: targetExtent.width.toFixed(2).replace('.', ','),
      unit: 'm',
      numeric: true,
      okLabel: 'Suivant',
      onSubmit: (t) => {
        const L = nb(t);
        if (!(L > 0)) return;
        setPrompt({
          title: 'Profondeur de la pièce',
          subtitle: `Largeur retenue : ${L.toFixed(2).replace('.', ',')} m.`,
          value: targetExtent.depth.toFixed(2).replace('.', ','),
          unit: 'm',
          numeric: true,
          onSubmit: (t2) => {
            const P = nb(t2);
            if (P > 0) resizeRoom(roomId, L, P);
          },
        });
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
      choix: pastilles(HAUTEURS_SOUS_PLAFOND, 'm'),
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

  /*
    ---------- PLAN VIDE : DEUX SITUATIONS, DEUX RÉPONSES ----------

    L'écran ne disait qu'une chose — « Aucun mur détecté, balayez plus
    lentement » — et n'offrait qu'une sortie : réessayer. C'était le
    message d'un scan raté, servi aussi à qui venait de choisir « Dessiner
    un plan » et n'avait alors AUCUN moyen d'ajouter quoi que ce soit.

    Dans les deux cas, la même issue manque : POSER UNE PIÈCE. Elle vaut
    même après un scan raté — le relevé d'une cuisine se trace en dix
    secondes quand la caméra s'obstine — et c'est le geste attendu quand on
    a choisi le clavier. Le conseil de balayage, lui, ne s'affiche que s'il
    y a eu un balayage.
  */
  if (walls.length === 0) {
    return (
      <View style={styles.container}>
        {/* Une bande de bord suffit ici : cet écran n'a rien à toucher, et
            elle court sur toute la hauteur puisque son parent est l'écran. */}
        <RetourGlisse onRetour={sortirDuPlan} />
        {/*
          UN ÉCRAN SANS RETOUR EST UN PIÈGE.

          Cet état n'avait ni barre ni flèche : on y entrait par « Dessiner
          un plan » et l'on n'en sortait plus qu'en tuant l'application. La
          barre du haut est celle de l'écran ordinaire, au mot près — on ne
          change pas de repères parce que le plan est vide.
        */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Retour"
            onPress={sortirDuPlan}>
            <BackChevron color={teinte.ink} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>
          {planVierge ? 'Plan vierge' : 'Aucun mur détecté'}
        </Text>
        <Text style={styles.emptyText}>
          {planVierge
            ? 'Posez une première pièce à ses cotes : les murs, les ' +
              'surfaces et le métré en découlent, exactement comme après un ' +
              'scan.'
            : 'Balayez plus lentement, du sol au plafond, avec davantage de ' +
              'lumière. Les grandes surfaces vitrées et les miroirs peuvent ' +
              'gêner la détection — ou tracez la pièce à ses cotes.'}
        </Text>
        {/*
          LE BOUTON A SA TAILLE, PAS CELLE DE LA PAGE.

          Il portait `primaryButton`, qui vit normalement dans une RANGÉE
          horizontale : son `flex: 1` y prend la largeur restante. Dans une
          colonne, le même style prend toute la HAUTEUR — le bouton a
          rempli l'écran et poussé le texte contre le bord haut, où il s'est
          fait couper. Un style de rangée ne se réutilise pas dans une pile.
        */}
        <TouchableOpacity
          style={styles.emptyPrimary}
          accessibilityLabel="Ajouter une pièce"
          onPress={() => setAjoutPiece(true)}>
          <Text style={styles.primaryText}>Ajouter une pièce</Text>
        </TouchableOpacity>
        {!planVierge && (
          <TouchableOpacity
            style={styles.emptyGhost}
            accessibilityLabel="Refaire un scan"
            onPress={reset}>
            <Text style={styles.emptyGhostText}>Refaire un scan</Text>
          </TouchableOpacity>
        )}
        {/* La feuille d'ajout vit aussi ici : sans elle, le bouton
            n'ouvrirait rien tant qu'il n'y a pas un seul mur. */}
        <AddRoomSheet
          visible={ajoutPiece}
          accolee={false}
          onClose={() => setAjoutPiece(false)}
          onChoose={(largeur, profondeur, nom) => {
            // Rien au plan : elle se pose à l'origine, et elle est CHOISIE
            // — sans quoi ni ses poignées ni son glissement n'existeraient.
            setSelectedRoomId(addRoomLibre(largeur, profondeur, nom));
            setAjoutPiece(false);
            setEditMode(true);
            haptic('succes');
          }}
          onCustom={() => {
            setAjoutPiece(false);
            setPrompt({
              title: 'Cotes de la pièce',
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
                setSelectedRoomId(addRoomLibre(l, p, ''));
                setEditMode(true);
                haptic('succes');
              },
            });
          }}
        />
        <PromptSheet data={prompt} onClose={() => setPrompt(null)} />
        </View>
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
  /**
   * LE CHOIX DE FIN DE SCAN — « on coche nos choix et on valide ».
   *
   * Les meubles sont déjà dans le plan (RoomPlan les a DÉTECTÉS) : les
   * décocher les retire. L'électricité, elle, est PROPOSÉE : cocher pose
   * l'implantation NF C 15-100, avec le rapport qui dit ce qui vient
   * d'arriver — le même que « Normes auto ».
   */
  const validerArrivage = (choix: { meubles: boolean; elec: boolean }) => {
    useScanStore.getState().oublierArrivage();
    if (!choix.meubles) useScanStore.getState().retirerMeubles();
    if (choix.elec) poserNormes();
  };

  const poserNormes = () => {
    /*
      LE MAGASIN, PAS LA FERMETURE. Appelé juste après « retirer les
      meubles » (popup de fin de scan), ce geste lisait les listes du
      RENDU : il posait les socles en évitant des meubles qui venaient
      d'être supprimés.
    */
    const frais = useScanStore.getState();
    const pose = poserAuxNormes({
      rooms: roomInputs.map((r) => {
        const part = parts.find((p) => p.roomId === r.id);
        return { ...r, interieur: part?.labelAt ?? { x: 0, z: 0 } };
      }),
      walls,
      openings,
      objects: frais.objects,
      fixtures: frais.fixtures,
      ceiling: frais.ceiling,
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
    const total = pose.fixtures.length + pose.ceiling.length;
    Alert.alert(
      `${total} pose${total > 1 ? 's' : ''} ajoutée${total > 1 ? 's' : ''}`,
      pose.rapport.join(SAUT) +
        SAUT +
        SAUT +
        'Tout est placé hors meubles et hors menuiseries. À vous de ' +
        'déplacer ce qui ne vous convient pas.',
    );
  };

  /**
   * CORRIGER UN CONSTAT — celui que le doigt vient de désigner.
   *
   * « Normes auto » refait le logement d'un trait ; ici on guide : la
   * fenêtre de contrôle liste ce qui manque, et chaque ligne porte son
   * bouton. La remise à hauteur bouge l'appareil fautif ; la pose trouve
   * une place libre — hors meubles, hors menuiseries — dans la pièce du
   * constat. La ligne s'efface alors d'elle-même : les constats se
   * recalculent à chaque pose, et le décompte dit le travail accompli.
   */
  const corriger = (issue: Constat) => {
    const fix = issue.fix;
    if (!fix) return;
    if (fix.type === 'hauteur') {
      const f = fixtures.find((x) => x.id === fix.fixtureId);
      if (f) moveFixture(f.id, f.along, fix.height);
      return;
    }
    if (fix.type === 'linteau') {
      /*
        L'ALLÈGE NE BOUGE PAS, c'est le linteau qui remonte : une baie
        rabotée par un volet a gardé son appui, seul son haut est faux.
        `resizeOpening` applique exactement cette règle.
      */
      const o = openings.find((x) => x.id === fix.openingId);
      if (o) {
        const allege = o.yCenter - o.height / 2;
        resizeOpening(o.id, undefined, Math.max(0.2, fix.haut - allege));
      }
      return;
    }
    const res = corrigerConstat(fix, issue.roomId, {
      rooms: roomInputs.map((r) => {
        const part = parts.find((p) => p.roomId === r.id);
        return { ...r, interieur: part?.labelAt ?? { x: 0, z: 0 } };
      }),
      walls,
      openings,
      objects,
      fixtures,
      id: (prefixe) =>
        `${prefixe}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
    });
    if (!res) {
      Alert.alert(
        'Aucune place libre',
        'Tous les murs de la pièce sont pris — meubles, menuiseries ou ' +
          'appareils déjà posés. Déplacez un meuble, ou posez l’appareil ' +
          'à la main où vous avez la place.',
      );
      return;
    }
    useScanStore.getState().poserDAuto(res.fixtures, res.ceiling);
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
                     * « Nouveau scan » — qui efface tout.
                     *
                     * ELLE SE POSE, ON NE LA TIRE PAS. Le geste précédent
                     * demandait de tirer un rectangle dans le vide : relevé
                     * du patron, « le "ajouter une pièce" ne montre pas
                     * qu'il faut créer la pièce, et de plus au glissement,
                     * ça s'annule tout seul avec le déplacement du plan ».
                     * Un écran qui attend un geste qu'il n'annonce pas est
                     * un écran où il ne se passe rien. On pose donc la
                     * pièce aux cotes qu'on donne, en pointillés, et tout
                     * ce qui reste à faire se lit sur elle.
                     */
                    label: 'Ajouter une pièce',
                    icon: 'piece' as const,
                    hint: 'Elle se pose devant vous : poussez-la, étirez ses côtés.',
                    onPress: () => {
                      seulGeste();
                      setAjoutPiece(true);
                    },
                  },
                  {
                    /**
                     * SCANNER UNE PIÈCE DE PLUS — la vraie version.
                     *
                     * « Ajouter une pièce » pose un rectangle aux cotes
                     * qu'on donne : c'est du dépannage. Ici on RELÈVE la
                     * pièce, et `StructureBuilder` (iOS 17) l'aligne sur ce
                     * qui existe déjà. L'appareillage posé survit, reprojeté
                     * sur les murs neufs — sans quoi ajouter une chambre
                     * coûterait vingt prises.
                     */
                    label: 'Scanner une pièce',
                    icon: 'scanner' as const,
                    hint: 'Un relevé de plus, réuni au plan. iOS 17, LiDAR.',
                    onPress: () => {
                      demarrerComplement().catch((e: any) =>
                        Alert.alert(
                          'Relevé impossible',
                          e?.message ??
                            'La réunion de plusieurs relevés demande iOS 17.',
                        ),
                      );
                    },
                  },
                  /*
                    JETER LES MODIFICATIONS — l'issue qui manquait.

                    L'écran annonce « Modifications non enregistrées » et
                    offre de les ENREGISTRER. L'autre moitié du choix
                    n'existait nulle part : le magasin savait revenir à la
                    version rangée dans la bibliothèque, un banc le
                    vérifiait, et aucun bouton n'y menait. Une demi-heure de
                    retouches malheureuses ne se rattrapait qu'en annulant
                    quarante fois.

                    Offerte SEULEMENT s'il y a quelque chose à jeter et une
                    version où revenir : sur un scan jamais enregistré, ce
                    serait tout perdre.
                  */
                  ...(dirty && currentSaveId
                    ? [
                        {
                          label: 'Revenir à la version enregistrée',
                          icon: 'supprimer' as const,
                          hint: 'Jette tout depuis le dernier enregistrement.',
                          onPress: () => {
                            Alert.alert(
                              'Jeter les modifications ?',
                              'Le plan revient à son dernier enregistrement. ' +
                                'Ce qui a été fait depuis sera perdu.',
                              [
                                { text: 'Annuler', style: 'cancel' },
                                {
                                  text: 'Jeter',
                                  style: 'destructive',
                                  onPress: () => {
                                    useScanStore.getState().revertCurrent();
                                    haptic('succes');
                                  },
                                },
                              ],
                            );
                          },
                        },
                      ]
                    : []),
                  {
                    /**
                     * AJOUTER UN MUR — le geste qui manquait à l'appel.
                     *
                     * Relevé du chantier : « impossible de les joindre ou
                     * d'en créer un facilement ». Et pour cause : le
                     * magasin savait poser un mur entre deux points depuis
                     * des mois, mais aucun bouton n'y menait — du code mort
                     * d'un côté, un manque criant de l'autre.
                     *
                     * Le mur neuf se pose au MILIEU DU PLAN, d'un mètre :
                     * assez grand pour se saisir, assez petit pour ne rien
                     * masquer. On le tire ensuite par ses coins, et l'aimant
                     * le soude à ses voisins comme n'importe quel mur.
                     */
                    /**
                     * REDÉTECTER LES PIÈCES — sur un plan déjà relevé.
                     *
                     * Sans ce geste, un correctif de détection ne profite
                     * qu'aux scans À VENIR : les dossiers déjà faits gardent
                     * leurs pièces manquantes pour toujours. La fonction
                     * existait, mais aucun bouton n'y menait — elle ne se
                     * déclenchait qu'en passant par « Redresser », qui bouge
                     * la géométrie des murs par-dessus le marché.
                     */
                    label: 'Redétecter les pièces',
                    icon: 'redetecter' as const,
                    // Une ligne, pas un mode d'emploi : ce que la fonction
                    // garde (les noms donnés à la main) se voit en la
                    // lançant, et le README le raconte en entier.
                    hint: 'Retrouve les espaces clos, les nomme et les cote.',
                    onPress: () => {
                      useScanStore.getState().redetectRooms();
                      haptic('succes');
                    },
                  },
                  {
                    /*
                      SCANNER UN NIVEAU DE PLUS.

                      Une maison, c'est un rez-de-chaussée ET un étage —
                      parfois un sous-sol. Le relevé du haut s'ajoute à CE
                      dossier : un seul plan, un seul métré, un seul devis.

                      L'étage arrive pré-calé au-dessus de celui du dessous,
                      qui reste visible en filigrane : c'est là-dessus qu'on
                      le pose d'aplomb, cage d'escalier contre cage
                      d'escalier.
                    */
                    label: 'Scanner un étage',
                    icon: 'etage' as const,
                    hint:
                      niveaux.length > 1
                        ? `Le dossier en compte ${niveaux.length}.`
                        : 'Il s’ajoute au-dessus de ce plan.',
                    onPress: () => {
                      demarrerEtage(Math.max(...niveaux) + 1).catch(() => {});
                    },
                  },
                  {
                    /*
                      LE TABLEAU QU'ON TROUVE EN ARRIVANT.

                      La moitié des chantiers est de la rénovation, et elle
                      commence toujours pareil : on ouvre le tableau, on note
                      ce qu'il y a, on dit au client ce qu'il faut reprendre.
                      Les applications de plan dessinent du neuf ; celle-ci
                      sait aussi lire ce qui est déjà là.
                    */
                    label: 'Relever le tableau existant',
                    icon: 'tableau' as const,
                    hint: existant?.departs.length
                      ? `${existant.departs.length} module(s) relevé(s).`
                      : 'Rénovation : notez les départs, l’app diagnostique.',
                    onPress: () => setExistantOuvert(true),
                  },
                  {
                    label: 'Scanner un sous-sol',
                    icon: 'soussol' as const,
                    hint: 'Cave, garage : il se range sous le plan.',
                    onPress: () => {
                      demarrerEtage(Math.min(...niveaux) - 1).catch(() => {});
                    },
                  },
                  {
                    label: 'Ajouter un mur',
                    icon: 'regle' as const,
                    hint: 'Un mètre accroché au bout libre, à tirer.',
                    onPress: () => {
                      /*
                        IL NAÎT ACCROCHÉ, PAS AU MILIEU DU SÉJOUR.

                        Relevé du chantier : « une facilité pour le joindre à
                        une extrémité de mur ». Posé au centre du plan, le mur
                        neuf flottait loin de tout et il fallait recoller ses
                        DEUX coins au doigt. Il part maintenant du dernier
                        bout libre du tracé, droit dans sa continuité : un
                        coin est déjà soudé, il ne reste qu'à tirer l'autre —
                        et le suivant repartira du bout de celui-ci, jusqu'à
                        refermer la pièce.

                        Le centre reste le recours quand il n'y a aucun bout
                        libre : plan vide, ou contour déjà fermé.
                      */
                      /*
                        ON MONTRE LES POSES, ON N'EN CHOISIT PLUS UNE.

                        Relevé du patron : « doit afficher les multiples
                        possibilités d'attachement… dans des angles de 90° et
                        180° pour droit, à chaque fin de mur ». Trois
                        fantômes bleus par bout libre ; le doigt tranche.

                        Sans aucun bout libre — plan vide, ou contour déjà
                        fermé — il n'y a rien à proposer : le mur se pose au
                        centre, comme avant, et il n'y a qu'à le tirer.
                      */
                      const choix = posesDeMur(walls, 1);
                      setEditMode(true);
                      if (choix.length > 0) {
                        seulGeste('pose');
                        setPosesMur(choix);
                        haptic('leger');
                        return;
                      }
                      const xs = walls.flatMap((w) => [w.a.x, w.b.x]);
                      const zs = walls.flatMap((w) => [w.a.z, w.b.z]);
                      const cx = xs.length
                        ? (Math.min(...xs) + Math.max(...xs)) / 2
                        : 0;
                      const cz = zs.length
                        ? (Math.min(...zs) + Math.max(...zs)) / 2
                        : 0;
                      useScanStore
                        .getState()
                        .addWallBetween(
                          { x: cx - 0.5, z: cz },
                          { x: cx + 0.5, z: cz },
                        );
                      haptic('succes');
                    },
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
                    // Le bouclier de la pastille de contrôle — relevé du
                    // patron : c'est le même sujet, c'est le même dessin.
                    node: (
                      <Svg width={20} height={20} viewBox="0 0 24 24">
                        <Trace
                          d={SOLAIRES.bouclier}
                          fill={teinte.ink}
                          fillRule="evenodd"
                        />
                      </Svg>
                    ),
                    // Une ligne : le détail de ce qui se pose est le sujet
                    // de l'écran de contrôle, pas du menu qui y mène.
                    hint: 'Pose ce qui manque pour la NF C 15-100.',
                    onPress: poserNormes,
                  },
                  {
                    label: 'Nouveau scan',
                    icon: 'sortir' as const,
                    onPress: repartirDeZero,
                  },
                ],
              });

  return (
    /*
      LE RETOUR AU GLISSEMENT ENVELOPPE L'ÉCRAN, il ne se pose plus dans la
      barre du titre.

      Une bande `top: 0, bottom: 0` se mesure dans son PARENT : posée dans le
      bandeau du haut, elle ne faisait cinquante points de haut sur un écran
      qui en fait sept cents, et le geste ne répondait donc que là-haut. En
      enveloppe, il répond sur toute la hauteur — et sans manger un seul
      point du plan, puisqu'il ne prend le geste qu'en cours de route.
    */
    <RetourGlisse onRetour={sortirDuPlan} style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Retour"
          onPress={sortirDuPlan}>
          <BackChevron color={teinte.ink} />
        </TouchableOpacity>
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
            filigrane={filigrane}
            /* Les fantômes bleus d'un mur neuf, et le doigt qui tranche. */
            poses={posesMur ?? undefined}
            onPose={(id) => {
              const pose = posesMur?.find((x) => x.id === id);
              if (!pose) return;
              useScanStore.getState().addWallBetween(pose.a, pose.b);
              setPosesMur(null);
              haptic('succes');
            }}
            recalage={
              recalage
                ? (dx, dz) =>
                    useScanStore.getState().recalerNiveau(niveauCourant, dx, dz)
                : undefined
            }
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
            /*
              LE TROU DU RELEVÉ SE COMBLE D'UN APPUI — relevé du chantier :
              « le scan n'a pas su capter une porte, je me suis retrouvé
              avec deux murs séparés, et impossible de les joindre ».
            */
            onComblerTrou={(trou) => {
              useScanStore.getState().comblerTrou(trou);
              haptic('succes');
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
            /*
              CE QUE L'ÉCRAN POSE EN BAS — pour que le menu d'un mur ne se
              range jamais dessous. La rangée d'outils, le bandeau
              contextuel, et un doigt de marge.
            */
            reserveBas={ligneBandeau + HAUTEUR_BANDEAU}
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
            notes={notes}
            selectedNoteId={selNote}
            onSelectNote={setSelNote}
            placing={
              !!pendingCeiling || !!pendingSpots || pendingNote || !!noteADeplacer
            }
            onPlaceAt={(at) => {
              /*
                LE MOT SE POSE PARTOUT, LUI.

                Un appareil de plafond hors de tout contour n'aurait ni
                circuit ni métré, et le geste se refuse. Une note, au
                contraire, désigne souvent ce qui n'a pas encore de pièce :
                une arrivée dans un couloir, un percement dans une cloison
                qu'on n'a pas fini de tracer. Elle ne demande donc aucun
                contour, et c'est précisément sa raison d'être.
              */
              if (noteADeplacer) {
                moveNote(noteADeplacer, at);
                setNoteADeplacer(null);
                haptic('succes');
                return;
              }
              if (pendingNote) {
                setPendingNote(false);
                setPrompt({
                  title: 'Note sur le plan',
                  subtitle:
                    'Ce qu’on écrivait au crayon dans la marge : « colonne ' +
                    'montante », « attente TV à confirmer ».',
                  value: '',
                  okLabel: 'Écrire',
                  onSubmit: (t) => {
                    addNote(t, at);
                    haptic('succes');
                  },
                });
                return;
              }
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
              fermerPiecesNeuves(id);
              setSelectedRoomId(id);
            }}
            onEditRoomName={promptRoomFor}
            onPierChange={setPier}
            onSelectFixture={(id, wallId) => {
              // Un appareil MURAL attend sa commande : ce toucher la donne.
              if (pendingLienMur) {
                const f = fixtures.find((x) => x.id === id);
                if (f && COMMANDES_MURALES.includes(f.kind)) {
                  toggleFixtureCommand(pendingLienMur, f.id);
                  haptic('succes');
                  setPendingLienMur(null);
                } else {
                  haptic('alerte');
                  setMenu({
                    title: 'Ce n’est pas une commande',
                    subtitle:
                      'Une prise commandée ou une applique s’allume par un ' +
                      'interrupteur, un va-et-vient, un poussoir ou un ' +
                      'variateur. Touchez l’un de ceux-là.',
                    actions: [
                      { label: 'Continuer', onPress: () => {} },
                      {
                        label: 'Abandonner la liaison',
                        danger: true,
                        onPress: () => setPendingLienMur(null),
                      },
                    ],
                  });
                }
                return;
              }
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
              if (action === 'ouverture') {
                // On demande CE QU'ON PERCE avant de percer : voir
                // `ChoixOuverture`.
                murAPercer.current = wallId;
                setChoixOuverture(true);
              }
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
        {/*
          « ENREGISTRER » EN TÊTE DE COLONNE — relevé du patron : « le bouton
          Enregistrer doit être au-dessus du bouton Nord et de tout autre
          bouton de la colonne, lorsqu'il est affiché ».

          Il vivait AVEC les commandes, en bas : le trop-plein de calques
          s'empilait au-dessus de lui, et le geste le plus important de
          l'écran se retrouvait le plus bas. Il a maintenant son propre
          ancrage, posé au-dessus des deux piles — celle des commandes et
          celle des calques —, dont on mesure les hauteurs.
        */}
        {!capturing && dirty && (
          <View
            style={[
              styles.editAnchor,
              { bottom: etageSauvegarde },
            ]}
            pointerEvents="box-none">
            <SidePill visible index={0}>
              <ToolPill
                icon="save"
                label="Enregistrer"
                active
                onPress={commitCurrent}
              />
            </SidePill>
          </View>
        )}

        {capturing ? null : vue === '2d' ? (
          <Toolbar2D
            onSuite={setHSuite}
            anim={swap}
            largeur={carteW}
            bas={ligneOutils}
            dessus={dessusOutils}
            edition={barMode}
            pendingKind={pendingKind}
            pendingCeiling={pendingCeiling}
            pendingNote={pendingNote}
            onNote={() => {
              seulGeste('note');
              setNoteADeplacer(null);
              setPendingNote((v) => !v);
            }}
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
            onSuite={setHSuite}
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
          <View style={styles.vueRangee}>
            {/*
              LE CONTRÔLE VIT ICI, contre le sélecteur de vue — relevé du
              patron. C'est un verdict, pas un outil : il se consulte d'un
              coup d'œil, rouge qui pulse ou vert plein, en 2D comme en 3D,
              et toujours au même endroit.
            */}
            <ControlePastille
              alertes={alertes}
              /* Un plan sans le moindre appareil n'est pas une installation
                 non conforme : c'est une installation qui n'a pas commencé,
                 et le verdict attend le premier socle.

                 MAIS un défaut de RELEVÉ, lui, est vrai avant la pose —
                 relevé du patron : la pastille restait grise devant sept
                 baies cadrées sous leur tablier. Il allume la pastille tout
                 seul. */
              commence={
                fixtures.length > 0 || ceiling.length > 0 || alertesDePlan > 0
              }
              onPress={() => setChecking(true)}
            />
            {/*
              L'ÉTAGE, contre le contrôle et le 2D/3D.

              La pastille n'apparaît QUE s'il y a plusieurs niveaux : un
              appartement de plain-pied n'a pas à porter un sélecteur qui
              n'aurait jamais qu'un choix. Le geste d'AJOUT, lui, vit dans
              le menu « … » avec les autres actions du plan — on ne part pas
              scanner un étage par mégarde en visant le sélecteur.
            */}
            {niveaux.length > 1 && (
              <TouchableOpacity
                style={styles.vuePastille}
                accessibilityLabel="Changer d’étage"
                onPress={() => setMenu(menuDesEtages())}>
                <Text style={styles.vuePastilleTexte}>
                  {abregerNiveau(niveauCourant)}
                </Text>
                <ChevronsUpDown
                  size={15}
                  color={teinte.inkFaint}
                  strokeWidth={2.4}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.vuePastille}
              accessibilityLabel={vue === '2d' ? 'Passer en 3D' : 'Passer en 2D'}
              onPress={basculerVue}>
              <Text style={styles.vuePastilleTexte}>
                {vue === '2d' ? '2D' : '3D'}
              </Text>
              <ChevronsUpDown size={15} color={teinte.inkFaint} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
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
            onLayout={(e) => {
              setHActions(e.nativeEvent.layout.height);
              setWActions(e.nativeEvent.layout.width);
            }}
            /* Elles ne touchent plus le pied : le trop-plein de la rangée
               s'intercale entre elles et « Édition ». */
            style={[styles.editAnchor, { bottom: etageCommandes }]}>
            {/* Revenir en arrière ne défile pas avec les calques : c'est le
                geste qu'on cherche dans l'urgence, et il se tient dans la
                colonne, juste au-dessus de l'édition. */}
            {/* Modifications non enregistrées : la sauvegarde se tient AVEC
                les autres commandes, à gauche de l'édition. Elle flottait
                seule en bas à droite du plan, loin du seul endroit qu'on
                regarde quand on modifie — et elle forçait la barre de cotes
                à se raccourcir pour lui laisser la place. */}
            {/* Le contrôle de conformité a quitté cette colonne pour la
                rangée du sélecteur de vue : un verdict se consulte d'un
                coup d'œil, il ne fait pas la queue avec les outils. */}
            <SidePill visible={editMode && canUndo} index={0}>
              <ToolPill icon="undo" label="Annuler" active={false} onPress={undo} />
            </SidePill>
            {/*
              « REFAIRE » NE PARAÎT QU'APRÈS UNE ANNULATION.

              L'application savait revenir en arrière, jamais repartir en
              avant : on annulait d'un geste de trop et le travail était
              perdu pour de bon. Le bouton dont le rôle est de rattraper les
              erreurs en créait une qu'il ne savait pas rattraper.

              Il reste caché tant qu'il n'y a rien à refaire — une colonne
              de trois boutons dont un ne sert jamais, c'est un bouton qu'on
              apprend à ignorer, et les deux autres avec lui.
            */}
            <SidePill visible={editMode && canRedo} index={2}>
              <ToolPill
                icon="redo"
                label="Refaire"
                active={false}
                onPress={redo}
              />
            </SidePill>
          </View>
        )}

        {/* « Édition » commande le contenu de la rangée : il ferme la pile,
            là où le pouce tombe, et ne bouge jamais. Il a QUITTÉ la colonne
            des commandes pour son propre ancrage : celles-ci montent
            au-dessus du trop-plein de la rangée, lui reste au pied. */}
        {vue === '2d' && !capturing && (
          <View style={[styles.editAnchor, { bottom: ligneOutils }]}>
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
              /* Le point où le plan écrit le nom de la pièce : le pôle
                 intérieur de son contour. Le bouton « Centrer » y pose
                 l'appareil — même milieu pour le mot et pour la lampe. */
              centre={part?.labelAt ?? null}
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
          LE BANDEAU DE LA NOTE TENUE EN MAIN.

          La pastille du plan n'en montre que le début — une phrase entière
          étalée sur le dessin masque la maçonnerie qu'on est venu voir. Le
          bandeau, lui, a la place : il DIT LA NOTE EN ENTIER, et c'est là
          qu'on la corrige ou qu'on la retire. Sans lui, une faute de frappe
          serait définitive.
        */}
        {vue === '2d' && selNote && !capturing && (() => {
          const note = notes.find((n) => n.id === selNote);
          if (!note) return null;
          return (
            <StripBar
              styles={stylesBarres}
              icone={SOLAIRES.note}
              strong="Note"
              /*
                LA LIGNE DU HAUT PORTE L'INSTRUCTION.

                Le mot sous une pastille ne peut pas dire une phrase : à
                quarante-quatre points, « Touchez le plan » se coupe. C'est
                donc ici que le bandeau dit ce qu'il attend — là où il y a
                la place, et là où l'œil va déjà lire la note.
              */
              note={
                noteADeplacer === note.id
                  ? 'Touchez le plan pour la reposer.'
                  : note.text
              }
              /*
                TROIS GESTES, TROIS PASTILLES RONDES — relevé du patron :
                « le bloc qui s'affiche pour le clic sur une note est trop
                imposant et mal fait (bouton supprimer surélevé) ».

                Deux boutons-phrases et une icône nue : deux hauteurs dans
                la même rangée, et un bandeau large de deux phrases qui
                passait sous la colonne de droite. Les trois prennent la
                forme de ceux du plafond — une pastille, le mot dessous.
              */
              actions={[
                {
                  label: 'Corriger',
                  icone: SOLAIRES.crayon,
                  sansMot: true,
                  onPress: () =>
                    setPrompt({
                      title: 'Note sur le plan',
                      value: note.text,
                      okLabel: 'Écrire',
                      // Vider le champ retire la note : c'est la règle du
                      // magasin, et elle évite un second bouton qui dirait
                      // la même chose.
                      onSubmit: (t) => {
                        editNote(note.id, t);
                        if (!t.trim()) setSelNote(null);
                      },
                    }),
                },
                {
                  // « Déplacer » et non un glisser : la pastille est
                  // petite, et un doigt posé dessus sur un plan chargé
                  // attrape aussi bien le mur qui passe dessous. On
                  // redésigne le point, comme à la pose.
                  label: 'Déplacer',
                  icone: SOLAIRES.points,
                  sansMot: true,
                  ghost: noteADeplacer === note.id,
                  onPress: () => {
                    seulGeste('note');
                    // Les deux gestes de note s'excluent : écrire un mot
                    // neuf et reposer celui qu'on tient visent le même
                    // appui sur le plan.
                    setPendingNote(false);
                    setNoteADeplacer((v) => (v === note.id ? null : note.id));
                  },
                },
                {
                  label: 'Retirer',
                  icone: SOLAIRES.retirer,
                  sansMot: true,
                  onPress: () => {
                    removeNote(note.id);
                    setSelNote(null);
                  },
                },
              ]}
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
              icone={SOLAIRES.plafond}
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
              onCotes={
                estRectangle(targetPart?.walls ?? []) ? promptRoomCotes : undefined
              }
              onMore={() =>
                setMenu({
                  title: targetRoom.name || 'Pièce sans nom',
                  subtitle:
                    'Ce qui change la structure du plan : la copier telle ' +
                    'quelle, réunir deux pièces que le scan a séparées, en ' +
                    'couper une qu’il a réunie, ou la retirer.',
                  actions: [
                    {
                      /*
                        TROIS CHAMBRES QUI SE RESSEMBLENT.

                        On les équipait une par une, aux mêmes cotes : cinq
                        socles, un interrupteur, un point lumineux. La copie
                        emporte tout — c'est l'appareillage qui prend le
                        temps, pas les quatre murs.
                      */
                      label: 'Dupliquer la pièce',
                      icon: 'piece' as const,
                      onPress: () => {
                        const neuf = duplicateRoom(selectedRoomId);
                        if (neuf) setSelectedRoomId(neuf);
                      },
                    },
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
          (pendingKind ||
            pendingCeiling ||
            pendingSpots ||
            pendingLink ||
            pendingLienMur ||
            /* Un mur qu'on va poser s'arme comme le reste, et le dit comme
               le reste — c'est aussi par là qu'on se décommande. */
            !!posesMur ||
            // La note s'arme comme le reste : elle doit le dire comme le
            // reste. Voir `EnAttente`.
            pendingNote ||
            !!noteADeplacer) &&
          !capturing && (
            <EnAttente
              kind={
                pendingKind ??
                (pendingLienMur
                  ? fixtures.find((x) => x.id === pendingLienMur)?.kind ?? null
                  : null)
              }
              note={pendingNote || !!noteADeplacer}
              mur={!!posesMur}
              plafond={
                (pendingSpots ? 'spot' : null) ??
                pendingCeiling ??
                (pendingLink
                  ? ceiling.find((x) => x.id === pendingLink[0])?.kind ?? null
                  : null)
              }
              cible={
                posesMur
                  ? 'le départ du nouveau mur'
                  : noteADeplacer
                  ? 'le nouveau point de la note'
                  : pendingSpots
                  ? `une pièce — ${pendingSpots} spots`
                  : pendingLink
                  ? 'l’interrupteur qui l’allume'
                  : pendingLienMur
                  ? 'l’interrupteur qui le commande'
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
                setPendingLienMur(null);
                setPendingNote(false);
                setNoteADeplacer(null);
                setPosesMur(null);
              }}
            />
          )}

        {/* La menuiserie sélectionnée : largeur, hauteur, et de quoi les
            changer. Même bandeau que pour un mur — un seul endroit où
            regarder quand on a touché quelque chose. */}
        {vue === '2d' && editMode && selectedOpening && !capturing && (
          <StripBar
            styles={stylesBarres}
            icone={SOLAIRES.ouvertures}
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
              /*
                LES TROIS COTES DE LA MENUISERIE, EN DIRECT.

                Ce sont celles que le bandeau AFFICHE — « 1,20 × 1,10 m » —
                et l'allège complète le triplet : c'est elle qui décide
                d'une prise dessous ou d'un convecteur. Le reste tient à la
                POSE, pas à la menuiserie, et vit dans le menu.

                Relevé du patron sur le bandeau du mur : « peu de place pour
                les informations, un bouton sort du bloc ». Huit boutons en
                rangée reproduiraient exactement ce défaut ; quatre tiennent,
                et le menu porte le reste sans rien tronquer.
              */
              {
                label: 'Largeur',
                ghost: true,
                onPress: () => promptOpening(selectedOpening.id, 'largeur'),
              },
              {
                label: 'Hauteur',
                ghost: true,
                onPress: () => promptOpening(selectedOpening.id, 'hauteur'),
              },
              ...(selectedOpening.type !== 'door'
                ? [
                    {
                      // Une porte a le sol pour allège, par définition : un
                      // réglage qui ne peut valoir que zéro se lit comme un
                      // geste raté.
                      label: 'Allège',
                      ghost: true,
                      onPress: () => promptAllege(selectedOpening.id),
                    },
                  ]
                : []),
              {
                // Pas « Plus » tout court : l'écran en porte déjà un, sur
                // le bandeau de la pièce. Deux boutons du même mot pour
                // deux menus différents, c'est une étiquette qui ne dit
                // plus rien à qui navigue à la voix.
                label: 'Réglages de la menuiserie',
                icone: SOLAIRES.points,
                sansMot: true,
                onPress: () =>
                  setMenu({
                    title:
                      selectedOpening.type === 'window'
                        ? 'Fenêtre'
                        : selectedOpening.type === 'door'
                        ? 'Porte'
                        : 'Baie',
                    subtitle:
                      'Ce qui tient à la pose, pas à la menuiserie : où elle ' +
                      'tombe sur le mur, de quel côté elle s’ouvre, et ce ' +
                      'qui la coiffe.',
                    actions: [
                      /*
                        CE QU'ELLE EST — la première question, avant toute cote.

                        Une ouverture posée à la main sortait toujours en
                        BAIE, et rien ne permettait de dire autre chose : un
                        plan tracé sans scanner ne comportait ni porte ni
                        fenêtre, rien que des trous. Or la nature commande
                        le dessin (le battant d'une porte, qui dit de quel
                        côté se pose l'interrupteur) et les cotes (l'allège
                        d'une fenêtre, qui décide d'une prise dessous).

                        On ne propose que les DEUX AUTRES natures : un
                        bouton qui redit ce qu'on est déjà ne fait rien, et
                        un bouton qui ne fait rien se lit comme un geste
                        raté.
                      */
                      ...(
                        [
                          ['door', 'C’est une porte'],
                          ['window', 'C’est une fenêtre'],
                          ['opening', 'C’est une baie libre'],
                        ] as const
                      )
                        .filter(([t]) => t !== selectedOpening.type)
                        .map(([t, mot]) => ({
                          label: mot,
                          icon: 'menuiserie' as const,
                          onPress: () => {
                            setOpeningType(selectedOpening.id, t);
                            haptic('succes');
                          },
                        })),
                      {
                        /*
                          « LA PORTE À QUATRE-VINGT-DIX DU MUR » : la cote
                          qu'un poseur mesure sur place, et la seule que le
                          plan ne savait pas recevoir. On demande le bord,
                          pas l'axe — personne ne mesure jusqu'au milieu
                          d'une porte.
                        */
                        label: 'Position sur le mur',
                        icon: 'regle' as const,
                        onPress: () => promptOpeningPos(selectedOpening.id),
                      },
                      /*
                        LE SENS D'OUVERTURE — deux gestes, deux questions.

                        Le plan devine le battant et se trompe une fois sur
                        deux. Pour qui pose l'appareillage ce n'est pas un
                        détail de trait : l'interrupteur va du côté de la
                        POIGNÉE, jamais du côté des paumelles, et une porte
                        dessinée à l'envers envoie percer derrière le
                        battant.

                        Rien pour une fenêtre : elle ne dessine pas de
                        vantail, et un réglage invisible est un réglage
                        qu'on croit raté.
                      */
                      ...(selectedOpening.type === 'door'
                        ? [
                            {
                              label: 'Changer de charnière',
                              icon: 'charniere' as const,
                              onPress: () => {
                                useScanStore
                                  .getState()
                                  .flipBattant(selectedOpening.id, 'pivot');
                                haptic('succes');
                              },
                            },
                            {
                              // La flèche qui franchit la porte : elle dit
                              // le SENS, qui est exactement le sujet.
                              label: 'Ouvrir de l’autre côté',
                              icon: 'sortir' as const,
                              onPress: () => {
                                useScanStore
                                  .getState()
                                  .flipBattant(selectedOpening.id, 'sens');
                                haptic('succes');
                              },
                            },
                          ]
                        : []),
                      {
                        /*
                          LE COFFRE DE VOLET, DÉCLARÉ EN UN GESTE.

                          Relevé du chantier : « le scan ne détecte pas les
                          rebords de coffrage de volet ». Il ne le fera
                          jamais — ce n'est ni un mur, ni une menuiserie, ni
                          un meuble. Or pour qui perce, c'est une contrainte
                          de premier ordre : coulisse, tablier enroulé,
                          tube, et le moteur à alimenter.
                        */
                        label: selectedOpening.coffre
                          ? 'Retirer le coffre'
                          : 'Coffre de volet',
                        icon: 'coffre' as const,
                        onPress: () => {
                          useScanStore
                            .getState()
                            .toggleCoffre(selectedOpening.id);
                          haptic('succes');
                        },
                      },
                      {
                        /*
                          FERMER : le trou disparaît, le mur redevient
                          continu.

                          Relevé du patron : « fermer une ouverture et la
                          remettre en mur, en continuité de ses murs
                          adjacents ». Les ouvertures sont des trous
                          découpés dans des murs pleins (assignOpenings) :
                          il n'y a aucune maçonnerie à inventer, retirer le
                          trou suffit — et le retour en arrière existe si la
                          porte devait rouvrir.
                        */
                        label: 'Fermer l’ouverture',
                        icon: 'murer' as const,
                        danger: true,
                        onPress: () => {
                          removeOpening(selectedOpening.id);
                          setSelectedOpeningId(null);
                          haptic('succes');
                        },
                      },
                    ],
                  }),
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
            icone={SOLAIRES.murs}
            /*
              LES DEUX COTES DU MUR DANS LA LIGNE FORTE.

              Releve du patron, capture a l'appui : « la barre en bas mal
              faite pour selection de mur » — « 3,98 m . 2,49 m s... » et un
              bouton « Me. ». Le bandeau porte maintenant ce qu'il affiche,
              comme celui d'une menuiserie : longueur x hauteur ensemble, et
              la note dit ce que c'est. La hauteur, qui se faisait couper, se
              lit en entier.
            */
            strong={`${fr(segLength(selectedWall), 2)} × ${fr(
              selectedWall.height,
              2,
            )} m`}
            note="mur"
            actions={[
              /*
                UN SEUL GESTE : « MESURES », AVEC SON CRAYON.

                « Coter » était du jargon de dessinateur — relevé du patron :
                « tout le monde ne comprend pas facilement » — et « Hauteur »
                un second bouton pour une retouche rare. La hauteur d'un mur
                reste réglable par la pièce (barre du sol) et par le retour
                d'un mur percé.
              */
              /*
                LES MOTS DES ACTIONS SECONDAIRES CÈDENT LEUR PLACE.

                Relevé du patron, capture à l'appui : « les noms des boutons
                sont coupés, rien de lisible ». Sur un iPhone, la cote, la
                hauteur sous plafond et trois mots pleins ne tiennent pas
                dans la rangée une fois la colonne d'ancrage déduite : les
                libellés se tronquaient à UNE LETTRE — « M », « D. ».

                Un mot réduit à sa première lettre ne dit rien ; une icône,
                si. C'est exactement le remède déjà retenu pour le bandeau
                des spots — relevé du patron, déjà : « des icônes, pas des
                mots ». Le geste PRINCIPAL garde le sien, parce qu'un crayon
                seul ne dit pas ce qu'il édite ; les deux autres passent en
                silhouettes, leur mot vivant dans l'étiquette
                d'accessibilité.
              */
              {
                /*
                  LE CRAYON SEUL — le mot ne tenait pas, et un mot tronque
                  ne dit rien. « Me. » ne se lit pas ; un crayon, si. Le mot
                  vit dans l'etiquette d'accessibilite, ou il sert vraiment.
                */
                label: 'Mesures',
                crayon: true,
                sansMot: true,
                onPress: () => promptLength(selectedWall.id),
              },
              /*
                LE LASER, À CÔTÉ DU CLAVIER.

                RoomPlan se trompe de deux à trois centimètres : sans
                conséquence pour un plan d'ambiance, trop pour percer. Le
                télémètre donne le millimètre — et il le donne DEVANT LE
                CLIENT, ce qui compte autant. On vise, on appuie sur le
                bouton de l'outil, la cote entre : rien à retenir, rien à
                retaper.
              */
              {
                label: 'Laser',
                icone: SOLAIRES.metre,
                sansMot: true,
                onPress: () =>
                  setLaser({
                    nom: 'ce mur',
                    actuelle: segLength(selectedWall),
                    appliquer: (m: number) =>
                      setWallLength(selectedWall.id, m),
                  }),
              },
              /*
                DÉTACHER — pour allonger un retour sans emmener son voisin.

                Relevé du chantier : « un retour de mur perpendiculaire à un
                long mur, si j'essaye de prolonger ce retour, c'est le long
                mur qui est impacté ». Les deux comportements sont justes,
                mais pas au même moment : le coin d'une pièce DOIT entraîner
                ses murs — sinon le contour s'ouvre et la surface disparaît —
                tandis qu'un retour qu'on allonge ne doit toucher que lui.

                On ne devine pas l'intention : on la dit. Et l'aimant
                raccroche dès qu'on ramène le bout près d'un autre.
              */
              ...(selectedWall.libre
                ? []
                : [
                    {
                      label: 'Détacher',
                      icone: SOLAIRES.longueur,
                      sansMot: true,
                      onPress: () => {
                        useScanStore.getState().detacherMur(selectedWall.id);
                        haptic('succes');
                      },
                    },
                  ]),
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
                icone={SOLAIRES.murs}
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
        onDxf={() => {
          setExporting(false);
          apresFermeture(shareDxf);
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
          const id = selectedWallId
            ? addRoomBox(largeur, profondeur, nom, selectedWallId)
            : addRoomLibre(largeur, profondeur, nom);
          setAjoutPiece(false);
          seuleSelection('piece');
          // Une SEULE pièce en pointillés à la fois : celle qu'on vient de
          // poser. Sans ça, deux « Ajouter une pièce » de suite laissaient
          // la première ouverte, dessinée en pointillés pour toujours.
          fermerPiecesNeuves(id);
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
                const id = selectedWallId
                  ? addRoomBox(l, p, '', selectedWallId)
                  : addRoomLibre(l, p, '');
                seuleSelection('piece');
                fermerPiecesNeuves(id);
                setSelectedRoomId(id);
                setEditMode(true);
                haptic('succes');
              },
            }),
          );
        }}
      />

      {/* ---------- Le choix de fin de scan ---------- */}
      <ChoixScan
        visible={!!arrivage && !capturing}
        meubles={arrivage?.meubles ?? 0}
        posesViseur={arrivage?.posesViseur ?? 0}
        onValider={validerArrivage}
        // Fermer sans valider : les meubles restent (ils sont déjà là),
        // rien ne se pose — et la question ne reviendra pas.
        onClose={() => useScanStore.getState().oublierArrivage()}
      />

      {/*
        LE BANDEAU DU RECALAGE.

        Un mode qui change ce que fait le doigt doit se DIRE, et offrir sa
        sortie au même endroit : sans lui, on glisserait le plan en croyant
        déplacer la vue, et l'étage partirait sans qu'on comprenne pourquoi.
      */}
      {recalage && (
        <View style={styles.wallLengthBar}>
          <Text style={styles.wallLengthLabel}>
            {`Glissez ${abregerNiveau(
              niveauCourant,
            )} pour le poser sur le filigrane du dessous`}
          </Text>
          <TouchableOpacity
            accessibilityLabel="Terminer le recalage"
            onPress={() => {
              setRecalage(false);
              haptic('succes');
            }}>
            <Text style={styles.wallLengthDone}>Terminé</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ---------- Le télémètre laser ---------- */}
      <LaserSheet
        visible={!!laser}
        cible={laser}
        onClose={() => setLaser(null)}
        onAppliquer={(m) => laser?.appliquer(m)}
      />

      {/* ---------- Le tableau trouvé sur place (rénovation) ---------- */}
      <ExistantSheet
        visible={existantOuvert}
        existant={existant}
        onClose={() => setExistantOuvert(false)}
        onAjouter={(d) => useScanStore.getState().ajouterDepart(d)}
        onModifier={(id, champs) =>
          useScanStore.getState().modifierDepart(id, champs)
        }
        onRetirer={(id) => useScanStore.getState().retirerDepart(id)}
        onDecrire={(t) => useScanStore.getState().decrireTableau(t)}
      />

      {/* ---------- Diagnostic du plan ---------- */}
      <DiagnosticSheet
        visible={checking}
        onClose={() => setChecking(false)}
        issues={issues}
        rooms={rooms}
        // Le contrôle porte sur le niveau AFFICHÉ : il le dit, sans quoi
        // un « rien de bloquant » au rez-de-chaussée ferait livrer un
        // dossier dont l'étage compte cinq manques.
        niveau={niveauCourant}
        plusieursNiveaux={niveaux.length > 1}
        onGoToIssue={goToIssue}
        onFix={corriger}
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

      <ChoixOuverture
        visible={choixOuverture}
        onClose={() => setChoixOuverture(false)}
        onChoisir={(nature) => {
          const mur = murAPercer.current;
          murAPercer.current = null;
          if (!mur) return;
          addOpening(mur, nature);
          haptic('succes');
        }}
      />
      <ActionSheet data={menu} onClose={() => setMenu(null)} />
      <AlerteSortie
        data={alerteSortie}
        onClose={() => setAlerteSortie(null)}
      />
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
        // « Lier » depuis l'établi : on ferme, et le plan attend
        // l'interrupteur — le geste des lignes de spots.
        onLinkRequest={(id) => {
          setElecOpen(false);
          seulGeste('lien');
          setPendingLink(null);
          setPendingLienMur(id);
        }}
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
    </RetourGlisse>
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
