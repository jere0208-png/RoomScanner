import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RoomScanView } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';

export function ScanScreen() {
  const instruction = useScanStore((s) => s.instruction);
  const wallCount = useScanStore((s) => s.wallCount);
  const objectCount = useScanStore((s) => s.objectCount);
  const doorCount = useScanStore((s) => s.doorCount);
  const paused = useScanStore((s) => s.paused);
  const processing = useScanStore((s) => s.processing);
  const { pause, resume, stop } = useRoomScan();

  return (
    <View style={styles.container}>
      {/* La vue AR native se rend elle-même à 60 FPS ; l'UI RN flotte au-dessus. */}
      <RoomScanView style={StyleSheet.absoluteFill} />

      <View style={styles.topHud} pointerEvents="none">
        {instruction !== '' && (
          <View style={styles.instructionPill}>
            <Text style={styles.instructionText}>{instruction}</Text>
          </View>
        )}
        <View style={styles.counters}>
          <Text style={styles.counterText}>Murs : {wallCount}</Text>
          <Text style={styles.counterText}>Portes : {doorCount}</Text>
          <Text style={styles.counterText}>Objets : {objectCount}</Text>
        </View>
      </View>

      <View style={styles.bottomHud}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={paused ? resume : pause}>
          <Text style={styles.secondaryText}>
            {paused ? 'Reprendre' : 'Pause'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopButton} onPress={stop}>
          <Text style={styles.stopText}>Terminer</Text>
        </TouchableOpacity>
      </View>

      {processing && (
        <View style={styles.processing}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>
            Traitement du scan et export du modèle 3D…
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topHud: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionPill: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 10,
  },
  instructionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  counters: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  counterText: { color: '#cfd8e3', fontSize: 13 },
  bottomHud: {
    position: 'absolute',
    bottom: 50,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stopButton: {
    backgroundColor: '#e5484d',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  stopText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  processing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});
