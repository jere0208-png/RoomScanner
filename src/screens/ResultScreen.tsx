import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
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
import Svg, { Line as SvgLine, Path, Rect as SvgRect } from 'react-native-svg';
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
import { LogoMark } from '../components/LogoMark';
import {
  DEFAULT_VIEW3D,
  Iso3DView,
  type View3DParams,
} from '../components/Iso3DView';
import {
  roomExtent,
  roomHeight,
  roomParts,
  segLength,
  totalArea,
} from '../geometry/floorplan';
import { hasCapturedColors } from '../geometry/appearance';
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
  type FixtureKind,
} from '../geometry/electrical';
import { useScanStore } from '../store/scanStore';

type Tab = '2d' | '3d';

/** Un constat du diagnostic, d'où qu'il vienne — géométrie ou électricité. */
interface Constat {
  key: string;
  message: string;
  hint: string;
  severity: string;
  wallId?: string;
  roomId?: string;
}
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
  const north = useScanStore((s) => s.north);
  const addFixture = useScanStore((s) => s.addFixture);
  const moveFixture = useScanStore((s) => s.moveFixture);
  const resizeOpening = useScanStore((s) => s.resizeOpening);
  const addObject = useScanStore((s) => s.addObject);
  const rotateObject = useScanStore((s) => s.rotateObject);

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [wInput, setWInput] = useState('');
  const [dInput, setDInput] = useState('');
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

  const applyObjectDims = () => {
    const wv = parseFloat(wInput.replace(',', '.'));
    const dv = parseFloat(dInput.replace(',', '.'));
    if (selectedObjectId && wv > 0 && dv > 0) {
      resizeObject(selectedObjectId, wv, dv);
    }
    // Valider, c'est adopter le meuble : il cesse d'être provisoire.
    setDraftObject(null);
    Keyboard.dismiss();
  };
  const setScreen = useScanStore((s) => s.setScreen);
  const reset = useScanStore((s) => s.reset);
  const teinte = useTheme();
  const styles = getStyles(teinte);

  const [tab, setTab] = useState<Tab>('2d');
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
  // Catalogue de mobilier : ouvert par le « + » posé à côté du calque meubles.
  const [catalogue, setCatalogue] = useState(false);
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
    setTimeout(action, 420);
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
      const list = materialList(roomInputs, fixtures, wallRooms, placement);
      const bytes = buildMaterialPdf(scanName, list);
      await RoomScan.sharePDF(toBase64(bytes), materialFilename(scanName));
    } catch (e: any) {
      Alert.alert('Export impossible', e?.message ?? 'Erreur inconnue');
    }
  };

  /**
   * Pose un meuble du catalogue au centre de la plus grande pièce — c'est
   * là qu'il a le plus de chances d'être visible — puis le sélectionne :
   * un meuble qu'on vient de poser, on va le déplacer.
   */
  const placeObject = (item: CatalogItem) => {
    const cible = parts
      .filter((p) => p.surface)
      .sort((a, b) => (b.surface?.area ?? 0) - (a.surface?.area ?? 0))[0];
    const at = cible?.labelAt ?? { x: 0, z: 0 };
    const id = addObject(item, at.x, at.z);
    setDraftObject(id);
    setQuete('');
    setCatalogue(false);
    setShowFurniture(true);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedObjectId(id);
    setWInput(item.w.toFixed(2).replace('.', ','));
    setDInput(item.d.toFixed(2).replace('.', ','));
  };

  const selectedOpening =
    openings.find((o) => o.id === selectedOpeningId) ?? null;

  /** Retaille une menuiserie : sa largeur autour de son axe, sa hauteur
   *  depuis son allège. */
  const promptOpening = (id: string, quoi: 'largeur' | 'hauteur') => {
    const o = openings.find((x) => x.id === id);
    if (!o) return;
    const actuel = quoi === 'largeur' ? segLength(o) : o.height;
    Alert.prompt(
      quoi === 'largeur' ? 'Largeur de la menuiserie' : 'Hauteur de la menuiserie',
      quoi === 'largeur'
        ? 'En mètres. Elle se retaille autour de son axe.'
        : 'En mètres. L’allège ne bouge pas : c’est le linteau qui suit.',
      (t) => {
        const v = parseFloat((t ?? '').replace(',', '.'));
        if (!(v > 0)) return;
        if (quoi === 'largeur') resizeOpening(id, v, undefined);
        else resizeOpening(id, undefined, v);
      },
      'plain-text',
      actuel.toFixed(2).replace('.', ','),
    );
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
  const elecIssues = checkElectrical(roomInputs, fixtures, wallRooms, placement);
  const alertRooms = roomsInAlert(elecIssues);
  const issues: Constat[] = [
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
  ];
  const alertes = issues.filter((i) => i.severity === 'alerte').length;

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
    Alert.prompt(
      'Hauteur sous plafond',
      'En mètres. Elle sert au volume, aux vues 3D et au métré.',
      (t) => {
        const v = parseFloat((t ?? '').replace(',', '.'));
        if (v > 0) setRoomHeight(targetRoom.id, v);
      },
      'plain-text',
      roomHeight(targetPart.walls).toFixed(2).replace('.', ','),
    );
  };

  /** Réunit la pièce sélectionnée avec une voisine, au choix. */
  const promptMerge = () => {
    if (!targetRoom) return;
    const others = rooms.filter((r) => r.id !== targetRoom.id);
    Alert.alert(
      'Fusionner avec…',
      'Les deux pièces n’en feront plus qu’une ; la cloison reste dessinée.',
      [
        ...others.slice(0, 5).map((r) => ({
          text: r.name || r.id,
          onPress: () => {
            mergeRooms(targetRoom.id, r.id);
            setSelectedRoomId(targetRoom.id);
          },
        })),
        { text: 'Annuler', style: 'cancel' as const },
      ],
    );
  };

  /** Pose l'appareil sur ce mur et ouvre aussitot le mur vu de face. */
  const placeFixture = (kind: FixtureKind, wallId: string, height?: number) => {
    const id = addFixture(kind, wallId);
    setPendingKind(null);
    if (!id) return;
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
  const startFixture = () => {
    setElecWallId(tab === '2d' ? selectedWallId : null);
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
    Alert.prompt(
      'Longueur du mur',
      'En mètres. L’extrémité opposée se déplace, les murs soudés suivent.',
      (t) => {
        const v = parseFloat((t ?? '').replace(',', '.'));
        if (v > 0) setWallLength(wallId, v);
      },
      'plain-text',
      segLength(w).toFixed(2).replace('.', ','),
    );
  };

  const toggleEdit = () => {
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
            label: 'm² au sol',
          },
        ]
      : []),
    { value: fr(perimeter), label: 'm de périmètre' },
    ...(objects.length > 0 ? [{ value: `${objects.length}`, label: 'objets' }] : []),
    ...(fixtures.length > 0
      ? [{ value: `${fixtures.length}`, label: 'élec.' }]
      : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
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
          <Text style={styles.title} numberOfLines={1}>
            {scanName}
          </Text>
          <View style={styles.editBadge}>
            <Text style={styles.editBadgeIcon}>✎</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsRow}>
        {metrics.map((m, i) => (
          <View key={m.label} style={[styles.metric, i > 0 && styles.metricBorder]}>
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <Segment tab={tab} onChange={setTab} />

      <View style={styles.canvas} ref={canvasRef} collapsable={false}>
        {tab === '2d' ? (
          <FloorplanEditor
            showMeasures={showMeasures}
            editable={editMode}
            selectedObjectId={selectedObjectId}
            onDeleteObject={(id) => {
              removeObject(id);
              setDraftObject(null);
              setSelectedObjectId(null);
            }}
            onSelectObject={(id) => setSelectedObjectId(id)}
            selectedWallId={selectedWallId}
            onSelectWall={(id) => {
              setSelectedObjectId(null);
              setSelectedRoomId(null);
              setSelectedWallId(id);
              // Un appareil attendait son mur : le voici.
              if (id && pendingKind) {
                placeFixture(pendingKind, id);
                return;
              }
              // Un mur en défaut s'ouvre DE FACE, prêt à être corrigé : le
              // constat sans l'établi obligeait à un détour pour agir.
              if (
                id &&
                elecIssues.some(
                  (i) =>
                    i.severity === 'alerte' &&
                    i.roomId &&
                    (wallRooms.get(id) ?? []).includes(i.roomId),
                )
              ) {
                openWallElevation(id);
              }
            }}
            alertRooms={alertRooms}
            selectedOpeningId={selectedOpeningId}
            onSelectOpening={(id) => {
              setSelectedOpeningId(id);
              if (id) {
                setSelectedWallId(null);
                setSelectedObjectId(null);
                setSelectedRoomId(null);
              }
            }}
            selectedRoomId={selectedRoomId}
            onSelectRoom={(id) => {
              setSelectedObjectId(null);
              setSelectedWallId(null);
              setSelectedRoomId(id);
            }}
            onEditRoomName={promptRoomFor}
            onSelectFixture={(id, wallId) => {
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
            value={view3d}
            onChange={setView3d}
            focusRoomId={rooms[focusIdx]?.id ?? null}
          />
        )}

        {tab === '2d' ? (
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
                    active={!!pendingKind}
                    onPress={startFixture}
                  />,
                  issues.length > 0 && (
                    <ToolPill
                      key="check"
                      icon="check"
                      active={alertes > 0}
                      onPress={() => setChecking(true)}
                    />
                  ),
                  <ToolPill
                    key="square"
                    icon="square"
                    active={false}
                    onPress={straightenPlan}
                  />,
                ]
              : [
                  <ToolPill
                    key="ruler"
                    icon="ruler"
                    active={showMeasures}
                    onPress={() => setShowMeasures((v) => !v)}
                  />,
                  // Le catalogue s'ouvre depuis le calque qu'il alimente,
                  // et le « + » se pose À GAUCHE de lui, sur sa ligne : une
                  // onde bleue en sort tant qu'on ne l'a pas touché, pour
                  // dire que c'est par là qu'on ajoute un meuble.
                  <View key="furniture" style={styles.pillRow}>
                    {showFurniture && (
                      <PulsePlus onPress={() => setCatalogue(true)} />
                    )}
                    <ToolPill
                      icon="furniture"
                      active={showFurniture}
                      onPress={() => setShowFurniture(!showFurniture)}
                    />
                  </View>,
                  <ToolPill
                    key="surface"
                    icon="surface"
                    active={showSurfaces}
                    onPress={() => setShowSurfaces(!showSurfaces)}
                  />,
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
          <View style={styles.planTools}>
            <ToolPill
              icon="ruler"
              active={show3DMeasures}
              onPress={() => setShow3DMeasures((v) => !v)}
            />
            <ToolPill
              icon="furniture"
              active={showFurniture}
              onPress={() => setShowFurniture(!showFurniture)}
            />
            <ToolPill
              icon="surface"
              active={showSurfaces}
              onPress={() => setShowSurfaces(!showSurfaces)}
            />
            {colorsAvailable && (
              <ToolPill
                icon="colors"
                active={showTextures}
                onPress={() => setShowTextures(!showTextures)}
              />
            )}
            {rooms.length > 1 && (
              <ToolPill
                icon="rooms"
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
        {tab === '2d' && (
          <View style={styles.editAnchor}>
            {/* Revenir en arrière ne descend pas avec les outils : c'est le
                geste qu'on cherche dans l'urgence, et il se tient à côté du
                bouton qui commande l'édition, sur sa ligne. */}
            {editMode && canUndo && (
              <ToolPill icon="undo" active={false} onPress={undo} />
            )}
            <ToolPill icon="edit" active={editMode} onPress={toggleEdit} />
          </View>
        )}

        {/* Côtes du meuble sélectionné, en surimpression */}
        {tab === '2d' && selectedObject && (
          <View style={styles.editBar}>
            <Text style={styles.editLabel} numberOfLines={1}>
              {frCategory(selectedObject.category)} · glissez-le, il se colle
            </Text>
            <View style={styles.editRow}>
              <TextInput
                style={styles.inputSmall}
                value={wInput}
                onChangeText={setWInput}
                keyboardType="decimal-pad"
              />
              <Text style={styles.unit}>×</Text>
              <TextInput
                style={styles.inputSmall}
                value={dInput}
                onChangeText={setDInput}
                keyboardType="decimal-pad"
              />
              <Text style={styles.unit}>m</Text>
              <View style={styles.editIcons}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => rotateObject(selectedObject.id)}>
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Path
                      d="M19.5 12 a7.5 7.5 0 1 1 -2.2 -5.3"
                      stroke={teinte.ink}
                      strokeWidth={2}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <Path
                      d="M19.8 3.8 v4.4 h-4.4"
                      stroke={teinte.ink}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </Svg>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={cancelObject}>
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Path
                      d="M6.5 6.5 L17.5 17.5"
                      stroke={teinte.danger}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <Path
                      d="M17.5 6.5 L6.5 17.5"
                      stroke={teinte.danger}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtnOk} onPress={applyObjectDims}>
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Path
                      d="M5 12.5 L10 17.5 L19 6.5"
                      stroke="#FFFFFF"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </Svg>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Pièce sélectionnée : la nommer, ou la retirer du scan */}
        {tab === '2d' && editMode && !selectedObject && !selectedWall &&
          selectedRoomId && targetRoom && (
            <View style={styles.editBar}>
              <Text style={styles.editLabel}>
                {targetRoom.name || 'Pièce sans nom'}
                {targetPart?.surface
                  ? ` · ${targetPart.surface.exact ? '' : '≈ '}${fr(
                      targetPart.surface.area,
                    )} m² · ${fr(targetExtent.width, 2)} × ${fr(
                      targetExtent.depth,
                      2,
                    )} m`
                  : ''}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled">
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={() => setNaming(true)}>
                  <Text style={styles.applyText}>Nommer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.roomAction}
                  onPress={promptRoomHeight}>
                  <Text style={styles.roomActionText}>
                    Hauteur {fr(roomHeight(targetPart?.walls ?? []), 2)} m
                  </Text>
                </TouchableOpacity>
                {rooms.length > 1 && (
                  <TouchableOpacity
                    style={styles.roomAction}
                    onPress={promptMerge}>
                    <Text style={styles.roomActionText}>Fusionner</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.roomAction}
                  onPress={() => {
                    splitRoom(selectedRoomId);
                    setSelectedRoomId(null);
                  }}>
                  <Text style={styles.roomActionText}>Scinder</Text>
                </TouchableOpacity>
                {rooms.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeRoomButton}
                    onPress={() =>
                      Alert.alert(
                        'Retirer cette pièce ?',
                        'Ses murs, ouvertures et meubles quittent le plan. ' +
                          'Rien n’est enregistré tant que vous ne validez pas.',
                        [
                          { text: 'Annuler', style: 'cancel' },
                          {
                            text: 'Retirer',
                            style: 'destructive',
                            onPress: () => {
                              removeRoom(selectedRoomId);
                              setSelectedRoomId(null);
                            },
                          },
                        ],
                      )
                    }>
                    <Text style={styles.removeRoomText}>Retirer</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          )}

        {tab === '2d' && pendingKind && (
          <View style={[styles.wallLengthBar, north !== null && styles.barShift,
              editMode && canUndo && styles.barShiftRight,
            ]}>
            <Text style={styles.wallLengthLabel}>
              {FIXTURES[pendingKind].label} · touchez le mur qui le reçoit
            </Text>
            <TouchableOpacity
              style={styles.roomAction}
              onPress={() => setPendingKind(null)}>
              <Text style={styles.roomActionText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* La menuiserie sélectionnée : largeur, hauteur, et de quoi les
            changer. Même bandeau que pour un mur — un seul endroit où
            regarder quand on a touché quelque chose. */}
        {tab === '2d' && editMode && selectedOpening && (
          <View style={styles.wallStrip}>
            <Text style={styles.wallStripText} numberOfLines={1}>
              <Text style={styles.wallStripStrong}>
                {`${fr(segLength(selectedOpening), 2)} × ${fr(
                  selectedOpening.height,
                  2,
                )} m`}
              </Text>
              {`  ·  ${
                selectedOpening.type === 'window'
                  ? 'fenêtre'
                  : selectedOpening.type === 'door'
                  ? 'porte'
                  : 'baie'
              }`}
            </Text>
            <TouchableOpacity
              style={styles.wallStripGhost}
              onPress={() => promptOpening(selectedOpening.id, 'largeur')}>
              <Text style={styles.wallStripGhostText}>Largeur</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.wallStripAction}
              onPress={() => promptOpening(selectedOpening.id, 'hauteur')}>
              <Text style={styles.wallStripActionText}>Hauteur</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Le mur sélectionné, en une ligne au pied du plan : sa longueur,
            sa hauteur sous plafond, et de quoi les changer. En haut, le
            bandeau mangeait le dessin qu'on est en train de regarder. */}
        {tab === '2d' && !selectedObject && !selectedOpening && editMode && selectedWall && (
          <View style={styles.wallStrip}>
            <Text style={styles.wallStripText} numberOfLines={1}>
              <Text style={styles.wallStripStrong}>
                {fr(segLength(selectedWall), 2)} m
              </Text>
              {`  ·  ${fr(selectedWall.height, 2)} m sous plafond`}
            </Text>
            <TouchableOpacity
              style={styles.wallStripAction}
              onPress={() => promptLength(selectedWall.id)}>
              <Text style={styles.wallStripActionText}>Coter</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Watermark EchoPlan, visible uniquement sur les images générées */}
        {capturing && (
          <View style={styles.watermark} pointerEvents="none">
            <LogoMark size={22} />
            <Text style={styles.watermarkText}>
              Echo<Text style={styles.watermarkAccent}>Plan</Text>
            </Text>
          </View>
        )}

        {/* Modifications non enregistrées : bouton de sauvegarde flottant */}
        {dirty && (
          <TouchableOpacity style={styles.saveFab} onPress={commitCurrent}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="M12 3 v11 M7 9.5 l5 5 5 -5 M5 20 h14"
                stroke="#FFFFFF"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </TouchableOpacity>
        )}
      </View>


      {objects.length > 0 && showFurniture && tab === '2d' && !editMode && (
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
                setWInput(o.width.toFixed(2).replace('.', ','));
                setDInput(o.depth.toFixed(2).replace('.', ','));
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
      <View style={styles.actions}>
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
            <Text style={styles.secondaryText}>Modèle AR</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
          <Text style={styles.secondaryText}>Nouveau scan</Text>
        </TouchableOpacity>
      </View>


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
                  'Plan PDF',
                  'Plan coté, métré par pièce, vues 3D. À imprimer ou à envoyer.',
                  () => {
                    setExporting(false);
                    goExport();
                  },
                ],
                [
                  'Modèle 3D',
                  'Fichier OBJ du plan retouché, pour Blender ou SketchUp.',
                  () => {
                    setExporting(false);
                    apresFermeture(shareObj);
                  },
                ],
                [
                  'Liste du matériel',
                  'Appareillage par pièce, circuits et disjoncteurs, ' +
                    'conformité. Le document à chiffrer.',
                  () => {
                    setExporting(false);
                    apresFermeture(shareMaterial);
                  },
                ],
                [
                  'Image',
                  'Capture de la vue affichée, avec le filigrane EchoPlan.',
                  () => {
                    setExporting(false);
                    apresFermeture(shareImage);
                  },
                ],
              ] as [string, string, () => void][]
            ).map(([titre, detail, action]) => (
              <TouchableOpacity
                key={titre}
                style={styles.exportChoice}
                onPress={action}>
                <Text style={styles.exportChoiceTitle}>{titre}</Text>
                <Text style={styles.exportChoiceDetail}>{detail}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---------- Diagnostic du plan ---------- */}
      <Modal
        visible={checking}
        transparent
        animationType="fade"
        onRequestClose={() => setChecking(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setChecking(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {alertes > 0
                ? `${alertes} point${alertes > 1 ? 's' : ''} à corriger`
                : 'Rien de bloquant'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Touchez une ligne pour aller voir l'élément concerné sur le plan.
            </Text>
            <ScrollView style={styles.issueScroll}>
              {issues.map((issue) => (
                <TouchableOpacity
                  key={issue.key}
                  style={styles.issueRow}
                  onPress={() => goToIssue(issue)}>
                  <View
                    style={[
                      styles.issueDot,
                      issue.severity === 'alerte' && styles.issueDotAlert,
                    ]}
                  />
                  <View style={styles.issueTexts}>
                    <Text style={styles.issueMessage}>{issue.message}</Text>
                    <Text style={styles.issueHint}>{issue.hint}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
                  Alert.prompt(
                    'Autre nom',
                    'Laissez vide pour retirer le nom.',
                    (t) => applyRoomName(t ?? ''),
                    'plain-text',
                    targetRoom?.name ?? '',
                  );
                }}>
                <Text style={styles.modalPrimaryText}>Autre…</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
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
          style={styles.modalBackdrop}
          onPress={() => setElecOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.elecWrap}>
            <Pressable onPress={() => {}}>
              {elecView === 'mur' && elecWallId ? (
                <WallElevation
                  wallId={elecWallId}
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

      {/* ---------- Renommage ---------- */}
      <Modal
        visible={renaming}
        transparent
        animationType="fade"
        onRequestClose={() => setRenaming(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRenaming(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
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
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

type ToolIcon =
  | 'edit'
  | 'ruler'
  | 'surface'
  | 'furniture'
  | 'colors'
  | 'room'
  | 'image'
  | 'model'
  | 'rooms'
  | 'undo'
  | 'square'
  | 'check'
  | 'plus';

/** Tracés 24×24 des icônes d'outils (trait simple, lisible en 18 px). */
const TOOL_PATHS: Record<ToolIcon, { d: string; fill?: boolean }[]> = {
  ruler: [
    { d: 'M3.5 9 h17 a1.5 1.5 0 0 1 1.5 1.5 v3 a1.5 1.5 0 0 1 -1.5 1.5 h-17 a1.5 1.5 0 0 1 -1.5 -1.5 v-3 a1.5 1.5 0 0 1 1.5 -1.5 z' },
    { d: 'M7.5 9 v3' },
    { d: 'M11.5 9 v3' },
    { d: 'M15.5 9 v3' },
  ],
  surface: [
    { d: 'M5 5 h14 a1.5 1.5 0 0 1 1.5 1.5 v11 a1.5 1.5 0 0 1 -1.5 1.5 h-14 a1.5 1.5 0 0 1 -1.5 -1.5 v-11 A1.5 1.5 0 0 1 5 5 z' },
    { d: 'M9 10 h0.01' },
    { d: 'M15 10 h0.01' },
    { d: 'M12 14 h0.01' },
  ],
  furniture: [
    { d: 'M6.5 10 V8 a2.5 2.5 0 0 1 2.5 -2.5 h6 A2.5 2.5 0 0 1 17.5 8 v2' },
    { d: 'M4.5 10.5 h15 v5 h-15 z' },
    { d: 'M6.5 15.5 v2.5' },
    { d: 'M17.5 15.5 v2.5' },
  ],
  colors: [
    { d: 'M12 3.5 C15 7.5 17.5 10 17.5 13 a5.5 5.5 0 1 1 -11 0 C6.5 10 9 7.5 12 3.5 z' },
  ],
  room: [
    { d: 'M4.5 5 h8.5 a2 2 0 0 1 1.4 0.6 l5.4 5.4 a1.4 1.4 0 0 1 0 2 l-5.4 5.4 a2 2 0 0 1 -1.4 0.6 h-8.5 z' },
    { d: 'M8.5 9.5 h0.01' },
  ],
  image: [
    { d: 'M4.5 5.5 h15 a1.5 1.5 0 0 1 1.5 1.5 v10 a1.5 1.5 0 0 1 -1.5 1.5 h-15 A1.5 1.5 0 0 1 3 17 V7 a1.5 1.5 0 0 1 1.5 -1.5 z' },
    { d: 'M9 10 h0.01' },
    { d: 'M5.5 16.5 l4.5 -4.5 3 3 3 -3 3 3' },
  ],
  model: [
    { d: 'M12 3.2 l7.8 4.4 v8.8 L12 20.8 l-7.8 -4.4 V7.6 z' },
    { d: 'M12 12 l7.8 -4.4 M12 12 L4.2 7.6 M12 12 v8.8' },
  ],
  // Le « + » de l'appareillage electrique.
  plus: [{ d: 'M12 5 v14' }, { d: 'M5 12 h14' }],
  // Loupe : ce que le plan a d'incertain.
  check: [
    { d: 'M11 3.5 a7.5 7.5 0 1 0 0 15 a7.5 7.5 0 1 0 0 -15 z' },
    { d: 'M16.5 16.5 L21 21' },
    { d: 'M11 7.5 v4' },
    { d: 'M11 14.5 h0.01' },
  ],
  // Équerre de dessinateur : le geste de remettre le plan d'aplomb.
  square: [
    { d: 'M4 4.5 v15 h15' },
    { d: 'M4 19.5 L19 4.5' },
    { d: 'M8.5 15 h3 v3' },
  ],
  undo: [
    { d: 'M4.5 12 a7.5 7.5 0 1 0 2.2 -5.3' },
    { d: 'M4.2 3.8 v4.4 h4.4' },
  ],
  rooms: [
    { d: 'M3.5 5.5 h7 v6 h-7 z' },
    { d: 'M13.5 5.5 h7 v13 h-7 z' },
    { d: 'M3.5 13.5 h7 v5 h-7 z' },
  ],
  edit: [
    { d: 'M11 4 H6 a2 2 0 0 0 -2 2 v12 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 v-5' },
    { d: 'M18.3 2.7 l3 3 L11.2 15.8 l-4.1 1.1 1.1 -4.1 z' },
  ],
};

/**
 * Interrupteur de vue, à pouce glissant.
 *
 * Le pavé actif sautait d'un onglet à l'autre : rien ne reliait les deux
 * états, et c'est exactement ce qui date une interface. Il glisse désormais,
 * sur un ressort — le mouvement dit d'où l'on vient.
 */
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

/**
 * Le « + » du mobilier, avec son onde.
 *
 * Une pastille de plus dans une colonne de pastilles ne se remarque pas.
 * Deux anneaux bleus en sortent donc en boucle, contenus par le bord arrondi
 * du bouton — l'œil est attiré par ce qui bouge, et c'est le seul endroit de
 * l'écran qui bouge tout seul. Rien d'autre ne signale qu'on peut ajouter un
 * meuble.
 */
function PulsePlus({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const onde = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.timing(onde, {
        toValue: 1,
        duration: 1900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [onde]);
  return (
    <TouchableOpacity
      style={[styles.toolPill, styles.pulsePill]}
      activeOpacity={0.8}
      onPress={onPress}>
      {[0, 0.35].map((retard, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              opacity: onde.interpolate({
                inputRange: [retard, Math.min(retard + 0.45, 1), 1],
                outputRange: [0.45, 0.12, 0],
                extrapolate: 'clamp',
              }),
              transform: [
                {
                  scale: onde.interpolate({
                    inputRange: [retard, 1],
                    outputRange: [0.35, 1],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        />
      ))}
      <Svg width={22} height={22} viewBox="0 0 24 24">
        {['M12 5 v14', 'M5 12 h14'].map((d) => (
          <Path
            key={d}
            d={d}
            stroke={c.blue}
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </Svg>
    </TouchableOpacity>
  );
}

/** Pas d'une pastille : sa largeur plus l'écart qui la suit. */
const PILL_PITCH = 44;

/**
 * Créneau d'une pastille dans la colonne.
 *
 * La pastille remonte vers le bouton d'édition — d'autant plus haut qu'elle
 * en est éloignée — en rapetissant jusqu'à disparaître dedans. Le décalage
 * par rang fait le reste : les pastilles s'y engouffrent l'une après
 * l'autre, et en ressortent dans l'ordre inverse.
 */
function PillSlot({
  index,
  anim,
  children,
}: {
  index: number;
  anim: Animated.Value;
  children: React.ReactNode;
}) {
  // Le rang n'entre en scène qu'après les précédents, sans jamais dépasser
  // la moitié de la course : à huit pastilles, la dernière partirait sinon
  // quand l'animation est déjà finie.
  const t = anim.interpolate({
    inputRange: [Math.min(0.45, index * 0.08), 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={{
        opacity: t,
        transform: [
          {
            translateY: t.interpolate({
              inputRange: [0, 1],
              outputRange: [-(index + 1) * PILL_PITCH, 0],
            }),
          },
          {
            scale: t.interpolate({
              inputRange: [0, 1],
              outputRange: [0.2, 1],
            }),
          },
        ],
      }}>
      {children}
    </Animated.View>
  );
}

function ToolPill({
  icon,
  active,
  onPress,
}: {
  icon: ToolIcon;
  active: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Icône noire sur fond blanc ; blanche sur bleu quand l'outil est actif.
  const stroke = active ? '#FFFFFF' : c.ink;
  return (
    <TouchableOpacity
      style={[styles.toolPill, active && styles.toolPillActive]}
      onPress={onPress}>
      {/* La pastille garde ses 36 px : seul le tracé grossit, pour se lire
          d'un coup d'œil sans élargir la barre d'outils. */}
      <Svg width={22} height={22} viewBox="0 0 24 24">
        {TOOL_PATHS[icon].map((seg, i) => (
          <Path
            key={i}
            d={seg.d}
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </TouchableOpacity>
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
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 10,
    paddingVertical: 10,
    ...shadowCard,
  },
  metric: { paddingHorizontal: 16, alignItems: 'center' },
  metricBorder: {},
  metricValue: {
    color: c.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metricLabel: {
    color: c.inkFaint,
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
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
    top: 58,
    right: 10,
    alignItems: 'flex-end',
    gap: 6,
  },
  editAnchor: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolPill: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  toolPillActive: { backgroundColor: c.blue, ...glow(c.blue) },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // L'onde reste DANS le bouton : elle attire l'œil sans déborder sur le
  // plan, qui doit rester lisible.
  pulsePill: { overflow: 'hidden' },
  pulseRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 6,
    borderColor: c.blue,
  },
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
  watermarkText: { color: '#0B0D12', fontSize: 13, fontWeight: '800' },
  watermarkAccent: { color: c.blue },
  saveFab: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: c.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow(c.blue),
    shadowOpacity: 0.42,
  },
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
    right: 70,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    ...shadowCard,
    shadowOpacity: 0.12,
  },
  wallStripText: { color: c.inkSoft, fontSize: 13, flex: 1 },
  wallStripStrong: { color: c.ink, fontWeight: '800', fontSize: 14 },
  wallStripAction: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  wallStripActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  wallStripGhost: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 6,
  },
  wallStripGhostText: { color: c.inkSoft, fontSize: 13, fontWeight: '800' },
  editBar: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 68,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.line,
    padding: 13,
    ...shadowCard,
  },
  editLabel: { color: c.inkSoft, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center' },
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
  inputSmall: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15.5,
    fontWeight: '700',
    minWidth: 58,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: c.lineStrong,
  },
  editIcons: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOk: {
    width: 38,
    height: 38,
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
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginTop: 8,
  },
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
    alignItems: 'center',
    ...shadowCard,
    shadowOpacity: 0.05,
  },
  secondaryText: { color: c.ink, fontSize: 15.5, fontWeight: '600' },
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
