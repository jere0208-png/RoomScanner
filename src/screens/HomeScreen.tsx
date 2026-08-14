import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';

export function HomeScreen() {
  const supported = useScanStore((s) => s.supported);
  const setSupported = useScanStore((s) => s.setSupported);
  const error = useScanStore((s) => s.error);
  const { start } = useRoomScan();

  useEffect(() => {
    RoomScan.isSupported().then(setSupported);
  }, [setSupported]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RoomScanner</Text>
      <Text style={styles.subtitle}>
        Scannez votre pièce en 3D, obtenez les mesures des murs et un plan 2D
        éditable.
      </Text>

      {supported === false && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Cet appareil n'est pas compatible. Le scan nécessite un iPhone avec
            capteur LiDAR (iPhone 12 Pro ou plus récent, modèles Pro) sous iOS
            16, ou un appareil Android compatible ARCore.
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, supported !== true && styles.buttonDisabled]}
        disabled={supported !== true}
        onPress={start}>
        <Text style={styles.buttonText}>
          {supported === null ? 'Vérification…' : 'Commencer le scan'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Conseils : allumez toutes les lumières, dégagez le centre de la pièce,
        et balayez lentement chaque mur du sol au plafond.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e1116',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', marginBottom: 12 },
  subtitle: {
    color: '#9aa4b2',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  warning: {
    backgroundColor: '#3a2323',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  warningText: { color: '#f3b0b0', fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: '#2f6df6',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
  },
  buttonDisabled: { backgroundColor: '#2a3444' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  hint: {
    color: '#5b6674',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 18,
  },
});
