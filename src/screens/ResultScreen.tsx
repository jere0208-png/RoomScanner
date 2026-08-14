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
import { FloorplanEditor } from '../components/FloorplanEditor';
import { segLength } from '../geometry/floorplan';
import { useScanStore } from '../store/scanStore';

export function ResultScreen() {
  const walls = useScanStore((s) => s.walls);
  const objects = useScanStore((s) => s.objects);
  const modelPath = useScanStore((s) => s.modelPath);
  const setWallLength = useScanStore((s) => s.setWallLength);
  const reset = useScanStore((s) => s.reset);

  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [lengthInput, setLengthInput] = useState('');

  const selectedWall = walls.find((w) => w.id === selectedWallId) ?? null;
  const perimeter = walls.reduce((s, w) => s + segLength(w), 0);

  const applyLength = () => {
    const v = parseFloat(lengthInput.replace(',', '.'));
    if (selectedWallId && v > 0) {
      setWallLength(selectedWallId, v);
    }
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Votre plan</Text>
      <Text style={styles.subtitle}>
        {walls.length} murs · périmètre {perimeter.toFixed(1)} m
        {objects.length > 0 ? ` · ${objects.length} objets` : ''}
      </Text>

      <View style={styles.planContainer}>
        <FloorplanEditor
          selectedWallId={selectedWallId}
          onSelectWall={(id) => {
            setSelectedWallId(id);
            const wall = walls.find((w) => w.id === id);
            setLengthInput(wall ? segLength(wall).toFixed(2) : '');
          }}
        />
      </View>

      {selectedWall ? (
        <View style={styles.editBar}>
          <Text style={styles.editLabel}>
            Longueur du mur ({selectedWall.height.toFixed(2)} m de haut)
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
          Touchez un mur pour modifier sa longueur, tirez un coin bleu pour
          déformer le plan.
        </Text>
      )}

      {objects.length > 0 && (
        <ScrollView style={styles.objectList} horizontal>
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
            <Text style={styles.primaryText}>Voir le modèle 3D</Text>
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
  container: { flex: 1, backgroundColor: '#0e1116', paddingTop: 60, paddingHorizontal: 16 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#9aa4b2', fontSize: 14, marginTop: 4, marginBottom: 14 },
  planContainer: { flex: 1 },
  hint: {
    color: '#5b6674',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 12,
  },
  editBar: {
    backgroundColor: '#151a21',
    borderRadius: 14,
    padding: 14,
    marginVertical: 10,
  },
  editLabel: { color: '#9aa4b2', fontSize: 13, marginBottom: 8 },
  editRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: '#0e1116',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    minWidth: 90,
    borderWidth: 1,
    borderColor: '#2a3444',
  },
  unit: { color: '#9aa4b2', fontSize: 16, marginHorizontal: 10 },
  applyButton: {
    backgroundColor: '#2f6df6',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginLeft: 'auto',
  },
  applyText: { color: '#fff', fontWeight: '600' },
  objectList: { maxHeight: 64, marginBottom: 8, flexGrow: 0 },
  objectChip: {
    backgroundColor: '#151a21',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  objectName: { color: '#e6edf5', fontSize: 14, fontWeight: '600' },
  objectDims: { color: '#5b6674', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, paddingBottom: 30, paddingTop: 6 },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2f6df6',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#1c232d',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { color: '#cfd8e3', fontSize: 16, fontWeight: '600' },
});
