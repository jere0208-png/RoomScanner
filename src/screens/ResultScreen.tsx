import React, { useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import { colors, radius, shadowCard } from '../theme';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { Iso3DView } from '../components/Iso3DView';
import { closedLoop, loopAreaM2, segLength } from '../geometry/floorplan';
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
  const setScreen = useScanStore((s) => s.setScreen);
  const reset = useScanStore((s) => s.reset);

  const [tab, setTab] = useState<Tab>('2d');
  const [showMeasures, setShowMeasures] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [lengthInput, setLengthInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const selectedWall = walls.find((w) => w.id === selectedWallId) ?? null;
  const perimeter = walls.reduce((s, w) => s + segLength(w), 0);
  const loop = closedLoop(walls);
  const area = loop ? loopAreaM2(loop) : null;

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
    { value: `${walls.length}`, label: 'murs' },
    ...(area !== null ? [{ value: fr(area), label: 'm²' }] : []),
    { value: fr(perimeter), label: 'm de périmètre' },
    ...(objects.length > 0 ? [{ value: `${objects.length}`, label: 'objets' }] : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
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
          <Text style={styles.titleEditIcon}>✎</Text>
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

      <View style={styles.canvas}>
        {tab === '2d' ? (
          <FloorplanEditor
            showMeasures={showMeasures}
            editable={editMode}
            selectedWallId={selectedWallId}
            onSelectWall={(id) => {
              setSelectedWallId(id);
              const wall = walls.find((w) => w.id === id);
              setLengthInput(wall ? segLength(wall).toFixed(2).replace('.', ',') : '');
            }}
          />
        ) : (
          <Iso3DView />
        )}

        {tab === '2d' && (
          <View style={styles.planTools}>
            <ToolPill
              label="Cotes"
              active={showMeasures}
              onPress={() => setShowMeasures((v) => !v)}
            />
            <ToolPill label="Modifier" active={editMode} onPress={toggleEdit} />
          </View>
        )}
      </View>

      {tab === '2d' && editMode && selectedWall ? (
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
            <TouchableOpacity style={styles.applyButton} onPress={applyLength}>
              <Text style={styles.applyText}>Appliquer</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.hint}>
          {tab === '3d'
            ? 'Un doigt pour tourner et incliner — la 3D suit vos modifications du plan.'
            : editMode
            ? 'Touchez un mur pour saisir sa longueur, tirez un coin bleu pour déformer le plan.'
            : 'Activez « Modifier » pour ajuster les murs, ou ouvrez la vue 3D.'}
        </Text>
      )}

      {objects.length > 0 && tab === '2d' && !editMode && (
        <ScrollView
          style={styles.objectList}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {objects.map((o) => (
            <View key={o.id} style={styles.objectChip}>
              <Text style={styles.objectName}>{o.category}</Text>
              <Text style={styles.objectDims}>
                {fr(o.width, 2)} × {fr(o.depth, 2)} × {fr(o.height, 2)} m
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.actions}>
        {Platform.OS === 'ios' && modelPath && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => RoomScan.viewModel(modelPath)}>
            <Text style={styles.primaryText}>Modèle AR</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
          <Text style={styles.secondaryText}>Nouveau scan</Text>
        </TouchableOpacity>
      </View>

      {/* ---------- Renommage ---------- */}
      <Modal visible={renaming} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nom du scan</Text>
            <Text style={styles.modalSubtitle}>
              Vos modifications s'enregistrent automatiquement dans ce scan.
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

function ToolPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.toolPill, active && styles.toolPillActive]}
      onPress={onPress}>
      <Text style={[styles.toolPillText, active && styles.toolPillTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 58,
    paddingHorizontal: 18,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  emptyText: {
    color: colors.inkSoft,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backChevron: { color: colors.ink, fontSize: 24, fontWeight: '600', marginTop: -3 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  titleEditIcon: { color: colors.inkFaint, fontSize: 15, marginLeft: 8 },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: 'flex-start',
    marginTop: 12,
    marginBottom: 12,
    paddingVertical: 8,
  },
  metric: { paddingHorizontal: 15, alignItems: 'center' },
  metricBorder: { borderLeftWidth: 1, borderLeftColor: colors.line },
  metricValue: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  metricLabel: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 12,
  },
  segmentItem: {
    flex: 1,
    borderRadius: radius.md - 3,
    paddingVertical: 9,
    alignItems: 'center',
  },
  segmentItemActive: { backgroundColor: colors.surface, ...shadowCard },
  segmentText: { color: colors.inkSoft, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: colors.blue, fontWeight: '700' },
  canvas: { flex: 1, ...shadowCard, borderRadius: radius.lg },
  planTools: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 6,
  },
  toolPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  toolPillActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  toolPillText: { color: colors.inkSoft, fontSize: 12.5, fontWeight: '700' },
  toolPillTextActive: { color: '#FFFFFF' },
  hint: {
    color: colors.inkFaint,
    fontSize: 12.5,
    textAlign: 'center',
    marginVertical: 12,
    lineHeight: 17,
  },
  editBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginVertical: 10,
  },
  editLabel: { color: colors.inkSoft, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: colors.bg,
    color: colors.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 17,
    fontWeight: '700',
    minWidth: 90,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  unit: { color: colors.inkSoft, fontSize: 15, marginHorizontal: 10 },
  applyButton: {
    backgroundColor: colors.blue,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginLeft: 'auto',
  },
  applyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  objectList: { maxHeight: 58, marginBottom: 6, flexGrow: 0 },
  objectChip: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginRight: 8,
  },
  objectName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  objectDims: { color: colors.inkFaint, fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: 10, paddingBottom: 28, paddingTop: 4 },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { color: colors.ink, fontSize: 15.5, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,13,18,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    width: '100%',
    ...shadowCard,
  },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  modalSubtitle: {
    color: colors.inkFaint,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 12,
  },
  modalCopy: { alignItems: 'center', paddingTop: 14 },
  modalCopyText: { color: colors.blue, fontSize: 14, fontWeight: '700' },
  modalInput: {
    backgroundColor: colors.bg,
    color: colors.ink,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
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
    backgroundColor: colors.surfaceSunken,
  },
  modalGhostText: { color: colors.inkSoft, fontWeight: '600', fontSize: 14.5 },
  modalPrimary: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.blue,
  },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14.5 },
});
