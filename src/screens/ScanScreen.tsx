import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RoomScanView } from 'react-native-room-scan';
import { themedStyles, useTheme, type Palette } from '../theme';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';

/**
 * Écran de scan. RoomPlan dessine lui-même ses guides ET la miniature 3D
 * temps réel en bas au centre — le HUD laisse cette zone libre : stats en
 * haut, commandes dans les coins inférieurs.
 */
export function ScanScreen() {
  const instruction = useScanStore((s) => s.instruction);
  const wallCount = useScanStore((s) => s.wallCount);
  const objectCount = useScanStore((s) => s.objectCount);
  const doorCount = useScanStore((s) => s.doorCount);
  const windowCount = useScanStore((s) => s.windowCount);
  const paused = useScanStore((s) => s.paused);
  const processing = useScanStore((s) => s.processing);
  const { pause, resume, stop, cancel } = useRoomScan();
  const styles = getStyles(useTheme());

  const stats: [string, number][] = [
    ['Murs', wallCount],
    ['Portes', doorCount],
    ['Fenêtres', windowCount],
    ['Objets', objectCount],
  ];

  return (
    <View style={styles.container}>
      {/* La vue AR native se rend elle-même à 60 FPS ; l'UI RN flotte au-dessus. */}
      <RoomScanView style={StyleSheet.absoluteFill} />

      <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
        <Text style={styles.cancelIcon}>✕</Text>
      </TouchableOpacity>

      <View style={styles.topHud} pointerEvents="none">
        <View style={styles.statsPill}>
          {stats.map(([label, n], i) => (
            <View key={label} style={[styles.stat, i > 0 && styles.statBorder]}>
              <Text style={styles.statValue}>{n}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {instruction !== '' && !paused && (
          <View style={styles.instructionPill}>
            <View style={styles.instructionDot} />
            <Text style={styles.instructionText}>{instruction}</Text>
          </View>
        )}
        {paused && (
          <View style={[styles.instructionPill, styles.pausedPill]}>
            <Text style={styles.instructionText}>Scan en pause</Text>
          </View>
        )}
      </View>

      {/* Coins inférieurs uniquement : le centre-bas appartient à la
          miniature 3D live de RoomPlan. */}
      <View style={styles.bottomHud} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.pauseButton}
          onPress={paused ? resume : pause}>
          <Text style={styles.pauseIcon}>{paused ? '▶' : '❙❙'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopButton} onPress={stop}>
          <Text style={styles.stopText}>Terminer</Text>
        </TouchableOpacity>
      </View>

      {processing && (
        <View style={styles.processing}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.processingTitle}>Assemblage du modèle 3D…</Text>
          <Text style={styles.processingText}>
            Murs, ouvertures et mesures sont en cours de calcul.
          </Text>
        </View>
      )}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  cancelButton: {
    position: 'absolute',
    top: 58,
    left: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.scanPillSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelIcon: { color: c.scanInk, fontSize: 16, fontWeight: '700' },
  topHud: {
    position: 'absolute',
    top: 58,
    left: 56,
    right: 56,
    alignItems: 'center',
  },
  statsPill: {
    flexDirection: 'row',
    backgroundColor: c.scanPill,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  stat: { alignItems: 'center', paddingHorizontal: 16 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)' },
  statValue: { color: c.scanInk, fontSize: 17, fontWeight: '800' },
  statLabel: {
    color: 'rgba(244,246,250,0.62)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  instructionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.scanPillSoft,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 10,
  },
  pausedPill: { backgroundColor: 'rgba(232,161,59,0.85)' },
  instructionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.blue,
    marginRight: 8,
  },
  instructionText: { color: c.scanInk, fontSize: 14, fontWeight: '600' },
  bottomHud: {
    position: 'absolute',
    bottom: 46,
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pauseButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: c.scanPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: { color: c.scanInk, fontSize: 16, fontWeight: '700' },
  stopButton: {
    backgroundColor: c.blue,
    borderRadius: 27,
    paddingHorizontal: 26,
    paddingVertical: 16,
    shadowColor: c.blue,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  stopText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  processing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,14,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  processingTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
  },
  processingText: {
    color: 'rgba(244,246,250,0.65)',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
}));
