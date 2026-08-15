import React, { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { RoomScan } from 'react-native-room-scan';
import {
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { LogoMark } from '../components/LogoMark';
import { Iso3DView } from '../components/Iso3DView';
import { roomParts, segLength, totalArea } from '../geometry/floorplan';
import { hasCapturedColors } from '../geometry/appearance';
import { frCategory } from '../geometry/furniture';
import { useScanStore } from '../store/scanStore';

type Tab = '2d' | '3d';
const fr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

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
  const revertCurrent = useScanStore((s) => s.revertCurrent);
  const setRoomName = useScanStore((s) => s.setRoomName);

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [wInput, setWInput] = useState('');
  const [dInput, setDInput] = useState('');
  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? null;
  const applyObjectDims = () => {
    const wv = parseFloat(wInput.replace(',', '.'));
    const dv = parseFloat(dInput.replace(',', '.'));
    if (selectedObjectId && wv > 0 && dv > 0) {
      resizeObject(selectedObjectId, wv, dv);
    }
    Keyboard.dismiss();
  };
  const setScreen = useScanStore((s) => s.setScreen);
  const reset = useScanStore((s) => s.reset);
  const styles = getStyles(useTheme());

  const [tab, setTab] = useState<Tab>('2d');
  // Pièce visée par l'outil « nom de pièce » et par la suppression.
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  // Cotes du plan 2D masquées par défaut : la pastille « Cotes » les active.
  const [showMeasures, setShowMeasures] = useState(false);
  const [show3DMeasures, setShow3DMeasures] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [lengthInput, setLengthInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');

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

  const shareModel = async () => {
    if (!modelPath) return;
    try {
      await RoomScan.shareFile(modelPath);
    } catch (e: any) {
      Alert.alert('Partage impossible', e?.message ?? 'Erreur inconnue');
    }
  };

  const selectedWall = walls.find((w) => w.id === selectedWallId) ?? null;
  const perimeter = walls.reduce((s, w) => s + segLength(w), 0);
  const parts = roomParts(walls);
  const surface = totalArea(parts);
  // Une seule pièce : l'outil de nommage n'a pas besoin de sélection.
  const targetRoomId =
    selectedRoomId ?? (rooms.length === 1 ? rooms[0].id : null);
  const targetRoom = rooms.find((r) => r.id === targetRoomId) ?? null;
  const targetPart = parts.find((p) => p.roomId === targetRoomId) ?? null;
  // Le bouton « Couleurs » n'a de sens que si le scan en a relevé.
  const colorsAvailable = hasCapturedColors(
    walls,
    rooms.map((r) => r.floor),
  );

  const promptRoomName = () => {
    if (!targetRoom) {
      Alert.alert(
        'Quelle pièce ?',
        'Touchez le sol de la pièce à nommer, puis réessayez.',
      );
      return;
    }
    Alert.prompt(
      'Nom de la pièce',
      'Laissez vide pour retirer le nom du cartouche.',
      (t) => setRoomName(targetRoom.id, t ?? ''),
      'plain-text',
      targetRoom.name,
    );
  };

  const applyLength = () => {
    const v = parseFloat(lengthInput.replace(',', '.'));
    if (selectedWallId && v > 0) {
      setWallLength(selectedWallId, v);
    }
    Keyboard.dismiss();
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

      <View style={styles.segment}>
        {(
          [
            ['2d', 'Plan 2D'],
            ['3d', 'Vue 3D'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.segmentItem, tab === key && styles.segmentItemActive]}
            onPress={() => setTab(key)}>
            <Text
              style={[styles.segmentText, tab === key && styles.segmentTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.canvas} ref={canvasRef} collapsable={false}>
        {tab === '2d' ? (
          <FloorplanEditor
            showMeasures={showMeasures}
            editable={editMode}
            selectedObjectId={selectedObjectId}
            onDeleteObject={(id) => {
              removeObject(id);
              setSelectedObjectId(null);
            }}
            selectedWallId={selectedWallId}
            onSelectWall={(id) => {
              setSelectedObjectId(null);
              setSelectedRoomId(null);
              setSelectedWallId(id);
              const wall = walls.find((w) => w.id === id);
              setLengthInput(wall ? segLength(wall).toFixed(2).replace('.', ',') : '');
            }}
            selectedRoomId={selectedRoomId}
            onSelectRoom={(id) => {
              setSelectedObjectId(null);
              setSelectedWallId(null);
              setSelectedRoomId(id);
            }}
          />
        ) : (
          <Iso3DView showMeasures={show3DMeasures} />
        )}

        {tab === '2d' ? (
          <View style={styles.planTools}>
            <ToolPill
              icon="reset"
              active={false}
              onPress={() => {
                revertCurrent();
                setSelectedWallId(null);
                setSelectedObjectId(null);
              }}
            />
            <ToolPill
              icon="ruler"
              active={showMeasures}
              onPress={() => setShowMeasures((v) => !v)}
            />
            <ToolPill
              icon="surface"
              active={showSurfaces}
              onPress={() => setShowSurfaces(!showSurfaces)}
            />
            <ToolPill
              icon="furniture"
              active={showFurniture}
              onPress={() => setShowFurniture(!showFurniture)}
            />
            {colorsAvailable && (
              <ToolPill
                icon="colors"
                active={showTextures}
                onPress={() => setShowTextures(!showTextures)}
              />
            )}
            {editMode && (
              <ToolPill
                icon="room"
                active={(targetRoom?.name ?? '') !== ''}
                onPress={promptRoomName}
              />
            )}
            <ToolPill icon="edit" active={editMode} onPress={toggleEdit} />
          </View>
        ) : (
          <View style={styles.planTools}>
            <ToolPill
              icon="ruler"
              active={show3DMeasures}
              onPress={() => setShow3DMeasures((v) => !v)}
            />
            <ToolPill
              icon="surface"
              active={showSurfaces}
              onPress={() => setShowSurfaces(!showSurfaces)}
            />
            <ToolPill
              icon="furniture"
              active={showFurniture}
              onPress={() => setShowFurniture(!showFurniture)}
            />
            {colorsAvailable && (
              <ToolPill
                icon="colors"
                active={showTextures}
                onPress={() => setShowTextures(!showTextures)}
              />
            )}
            {Platform.OS === 'ios' && (
              <ToolPill icon="image" active={false} onPress={shareImage} />
            )}
            {Platform.OS === 'ios' && modelPath && (
              <ToolPill icon="model" active={false} onPress={shareModel} />
            )}
          </View>
        )}

        {/* Côtes du meuble sélectionné, en surimpression */}
        {tab === '2d' && selectedObject && (
          <View style={styles.editBar}>
            <Text style={styles.editLabel}>
              {frCategory(selectedObject.category)} · glissez-le sur le plan
            </Text>
            <View style={styles.editRow}>
              <TextInput
                style={styles.input}
                value={wInput}
                onChangeText={setWInput}
                keyboardType="decimal-pad"
              />
              <Text style={styles.unit}>×</Text>
              <TextInput
                style={styles.input}
                value={dInput}
                onChangeText={setDInput}
                keyboardType="decimal-pad"
              />
              <Text style={styles.unit}>m</Text>
              <TouchableOpacity style={styles.applyButton} onPress={applyObjectDims}>
                <Text style={styles.applyText}>Appliquer</Text>
              </TouchableOpacity>
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
                    )} m² au sol`
                  : ''}
              </Text>
              <View style={styles.editRow}>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={promptRoomName}>
                  <Text style={styles.applyText}>Renommer</Text>
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
              </View>
            </View>
          )}

        {/* Barre d'édition en surimpression : le plan ne se redimensionne pas */}
        {tab === '2d' && !selectedObject && editMode && selectedWall && (
          <View style={styles.editBar}>
            <Text style={styles.editLabel}>
              Longueur du mur · {fr(selectedWall.height, 2)} m sous plafond
            </Text>
            <View style={styles.editRow}>
              <TextInput
                style={styles.input}
                value={lengthInput}
                onChangeText={setLengthInput}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={applyLength}
              />
              <Text style={styles.unit}>m</Text>
              <TouchableOpacity
                style={styles.openingButton}
                onPress={() => selectedWallId && addOpening(selectedWallId)}>
                <Text style={styles.openingText}>+ Ouverture</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={applyLength}>
                <Text style={styles.applyText}>Appliquer</Text>
              </TouchableOpacity>
            </View>
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
          onPress={goExport}>
          <Text style={styles.primaryText}>Exporter en PDF</Text>
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

      {/* ---------- Renommage ---------- */}
      <Modal visible={renaming} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
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
        </View>
      </Modal>
    </View>
  );
}

type ToolIcon =
  | 'edit'
  | 'reset'
  | 'ruler'
  | 'surface'
  | 'furniture'
  | 'colors'
  | 'room'
  | 'image'
  | 'model';

/** Tracés 24×24 des icônes d'outils (trait simple, lisible en 18 px). */
const TOOL_PATHS: Record<ToolIcon, { d: string; fill?: boolean }[]> = {
  reset: [
    { d: 'M19.5 12 a7.5 7.5 0 1 1 -2.2 -5.3' },
    { d: 'M19.8 3.8 v4.4 h-4.4' },
  ],
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
  edit: [
    { d: 'M11 4 H6 a2 2 0 0 0 -2 2 v12 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 v-5' },
    { d: 'M18.3 2.7 l3 3 L11.2 15.8 l-4.1 1.1 1.1 -4.1 z' },
  ],
};

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
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {TOOL_PATHS[icon].map((seg, i) => (
          <Path
            key={i}
            d={seg.d}
            stroke={stroke}
            strokeWidth={2.1}
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
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backChevron: { color: c.ink, fontSize: 24, fontWeight: '600', marginTop: -3 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: {
    color: c.ink,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
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
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.line,
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 8,
  },
  metric: { paddingHorizontal: 15, alignItems: 'center' },
  metricBorder: { borderLeftWidth: 1, borderLeftColor: c.line },
  metricValue: { color: c.ink, fontSize: 16, fontWeight: '800' },
  metricLabel: { color: c.inkFaint, fontSize: 11, marginTop: 1 },
  segment: {
    flexDirection: 'row',
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 8,
  },
  segmentItem: {
    flex: 1,
    borderRadius: radius.md - 3,
    paddingVertical: 9,
    alignItems: 'center',
  },
  segmentItemActive: { backgroundColor: c.surface, ...shadowCard },
  segmentText: { color: c.inkSoft, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: c.blue, fontWeight: '700' },
  canvas: { flex: 1, ...shadowCard, borderRadius: radius.lg },
  planTools: {
    position: 'absolute',
    top: 10,
    left: 56,
    right: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  toolPill: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolPillActive: { backgroundColor: c.blue, borderColor: c.blue },
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: c.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: c.blue,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
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
  unit: { color: c.inkSoft, fontSize: 15, marginHorizontal: 10 },
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
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: c.blue,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
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
