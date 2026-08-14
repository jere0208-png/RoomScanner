import React, { useState } from 'react';
import {
  Keyboard,
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

export function ResultScreen() {
  const walls = useScanStore((s) => s.walls);
  const objects = useScanStore((s) => s.objects);
  const modelPath = useScanStore((s) => s.modelPath);
  const setWallLength = useScanStore((s) => s.setWallLength);
  const reset = useScanStore((s) => s.reset);

  const [tab, setTab] = useState<Tab>('2d');
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [lengthInput, setLengthInput] = useState('');

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

  const metrics = [
    { value: `${walls.length}`, label: 'murs' },
    ...(area !== null ? [{ value: area.toFixed(1), label: 'm²' }] : []),
    { value: perimeter.toFixed(1), label: 'm de périmètre' },
    ...(objects.length > 0 ? [{ value: `${objects.length}`, label: 'objets' }] : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Votre scan</Text>
        <View style={styles.metricsRow}>
          {metrics.map((m, i) => (
            <View key={m.label} style={[styles.metric, i > 0 && styles.metricBorder]}>
              <Text style={styles.metricValue}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
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
            selectedWallId={selectedWallId}
            onSelectWall={(id) => {
              setSelectedWallId(id);
              const wall = walls.find((w) => w.id === id);
              setLengthInput(wall ? segLength(wall).toFixed(2) : '');
            }}
          />
        ) : (
          <Iso3DView />
        )}
      </View>

      {tab === '2d' && selectedWall ? (
        <View style={styles.editBar}>
          <Text style={styles.editLabel}>
            Longueur du mur · {selectedWall.height.toFixed(2)} m sous plafond
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
          {tab === '2d'
            ? 'Touchez un mur pour saisir sa longueur, tirez un coin pour déformer le plan.'
            : 'La vue 3D reflète vos modifications du plan en direct.'}
        </Text>
      )}

      {objects.length > 0 && tab === '2d' && (
        <ScrollView
          style={styles.objectList}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {objects.map((o) => (
            <View key={o.id} style={styles.objectChip}>
              <Text style={styles.objectName}>{o.category}</Text>
              <Text style={styles.objectDims}>
                {o.width.toFixed(2)} × {o.depth.toFixed(2)} × {o.height.toFixed(2)} m
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 62,
    paddingHorizontal: 18,
  },
  header: { marginBottom: 14 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
  },
  metric: { paddingHorizontal: 16, alignItems: 'center' },
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
});
