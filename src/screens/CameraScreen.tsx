import React, { useEffect, useState } from 'react';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // Le haut suit la marge de l'iPhone, comme l'écran du scan (58 points en dur
  // mordaient sur l'heure des iPhone Pro récents).
  const marges = useSafeAreaInsets();
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
    <RetourGlisse onRetour={() => setScreen('home')} style={[styles.container, { paddingTop: marges.top + 4 }]}>
      <TouchableOpacity
        style={styles.backButton}
        // Le chevron est un tracé : il ne dit rien à un lecteur d'écran,
        // le nom s'écrit — comme sur les trois autres écrans.
        accessibilityLabel="Retour"
        onPress={() => setScreen('home')}>
        <BackChevron color={c.ink} />
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
        {/*
          LE BON GESTE, DIT UNE FOIS, sur la seule page vue avant le premier
          scan — pas de tutoriel : une phrase. Un seul passage de pièce en
          pièce donne le plan le mieux aligné.
        */}
        <Text style={styles.geste}>
          Passez de pièce en pièce sans terminer : tout sera assemblé ensemble.
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
    </RetourGlisse>
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
  title: { color: c.ink, fontSize: 25, fontWeight: '700', letterSpacing: -0.4 },
  text: {
    color: c.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  geste: {
    color: c.ink,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
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
