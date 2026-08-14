import React, { useEffect, useState } from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { RoomScan } from 'react-native-room-scan';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';

function CameraGlyph({ size = 72, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      <Rect x={8} y={20} width={56} height={38} rx={10} stroke={color} strokeWidth={4} fill="none" />
      <Path d="M26 20 l4 -7 h12 l4 7" stroke={color} strokeWidth={4} strokeLinejoin="round" fill="none" />
      <Circle cx={36} cy={39} r={11} stroke={color} strokeWidth={4} fill="none" />
    </Svg>
  );
}

/**
 * Page dédiée : l'accès caméra est indispensable au scan.
 * Sans autorisation, on ne va pas plus loin.
 */
export function CameraScreen() {
  const setScreen = useScanStore((s) => s.setScreen);
  const { begin } = useRoomScan();
  const c = useTheme();
  const styles = getStyles(c);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    // Si l'utilisateur revient des Réglages avec la caméra accordée, on part.
    RoomScan.cameraStatus().then((s) => {
      if (s === 'granted') begin();
      else if (s === 'denied') setDenied(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async () => {
    const status = await RoomScan.cameraStatus();
    if (status === 'granted') return begin();
    if (status === 'undetermined') {
      const ok = await RoomScan.requestCamera();
      if (ok) return begin();
      setDenied(true);
      return;
    }
    // Refusée précédemment : seul le réglage système peut la rouvrir.
    Linking.openSettings();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
        <Text style={styles.backChevron}>‹</Text>
      </TouchableOpacity>

      <View style={styles.body}>
        <View style={styles.glyphCard}>
          <CameraGlyph color={c.blue} />
        </View>
        <Text style={styles.title}>Accès à la caméra</Text>
        <Text style={styles.text}>
          EchoPlan scanne votre pièce avec la caméra et le LiDAR de l'iPhone.
          Sans cet accès, le scan est impossible. Aucune image n'est envoyée
          nulle part : tout reste sur votre appareil.
        </Text>
        {denied && (
          <Text style={styles.deniedText}>
            L'accès a été refusé : autorisez la caméra dans les Réglages pour
            continuer.
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.cta} onPress={ask}>
        <Text style={styles.ctaText}>
          {denied ? 'Ouvrir les Réglages' : 'Autoriser la caméra'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.hint}>Le scan démarre dès que l'accès est accordé.</Text>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: { color: c.ink, fontSize: 24, fontWeight: '600', marginTop: -3 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyphCard: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    ...shadowCard,
  },
  title: { color: c.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  text: {
    color: c.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  deniedText: {
    color: c.danger,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '600',
  },
  cta: {
    backgroundColor: c.blue,
    borderRadius: radius.md + 2,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: c.blue,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  hint: {
    color: c.inkFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
}));
