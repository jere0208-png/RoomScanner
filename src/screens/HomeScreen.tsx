import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { RoomScan } from 'react-native-room-scan';
import { colors, radius, shadowCard } from '../theme';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';

function LogoMark({ size = 76 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 76 76">
      <Rect x={0} y={0} width={76} height={76} rx={20} fill={colors.blue} />
      {/* Plan de pièce stylisé, avec une ouverture de porte */}
      <Path
        d="M22 24 H54 V54 H22 V40"
        stroke="#FFFFFF"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M22 33 V24" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

const STEPS = [
  { n: '1', title: 'Scannez', text: 'Filmez la pièce, les murs se détectent seuls' },
  { n: '2', title: 'Ajustez', text: 'Corrigez le plan 2D, vérifiez les mesures' },
  { n: '3', title: 'Explorez', text: 'Vue 3D interactive et modèle AR' },
];

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
      <View style={styles.hero}>
        <LogoMark />
        <Text style={styles.title}>RoomScanner</Text>
        <Text style={styles.subtitle}>
          Votre appartement en 3D et en plan coté,{'\n'}en quelques minutes.
        </Text>

        {supported === true && (
          <View style={styles.statusChip}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>LiDAR détecté — prêt à scanner</Text>
          </View>
        )}
      </View>

      <View style={styles.stepsCard}>
        {STEPS.map((s, i) => (
          <View key={s.n} style={[styles.stepRow, i > 0 && styles.stepRowBorder]}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{s.n}</Text>
            </View>
            <View style={styles.stepTexts}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepText}>{s.text}</Text>
            </View>
          </View>
        ))}
      </View>

      {supported === false && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Cet appareil n'est pas compatible : le scan nécessite un iPhone Pro
            (capteur LiDAR) sous iOS 16, ou un Android compatible ARCore.
          </Text>
        </View>
      )}
      {error && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.cta, supported !== true && styles.ctaDisabled]}
        disabled={supported !== true}
        onPress={start}>
        <Text style={styles.ctaText}>
          {supported === null ? 'Vérification…' : 'Commencer le scan'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Allumez les lumières et dégagez le centre de la pièce pour un meilleur
        résultat.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    paddingTop: 84,
    paddingBottom: 40,
  },
  hero: { alignItems: 'center' },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 18,
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 18,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
    marginRight: 8,
  },
  statusText: { color: colors.inkSoft, fontSize: 13, fontWeight: '600' },
  stepsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginTop: 32,
    paddingHorizontal: 18,
    ...shadowCard,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  stepRowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stepBadgeText: { color: colors.blue, fontSize: 14, fontWeight: '800' },
  stepTexts: { flex: 1 },
  stepTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  stepText: { color: colors.inkFaint, fontSize: 13, marginTop: 1 },
  warning: {
    backgroundColor: '#FCEEEE',
    borderRadius: radius.md,
    padding: 14,
    marginTop: 20,
  },
  warningText: { color: '#A33A3E', fontSize: 13, lineHeight: 18 },
  cta: {
    marginTop: 'auto',
    backgroundColor: colors.blue,
    borderRadius: radius.md + 2,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: colors.blue,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  ctaDisabled: { backgroundColor: colors.lineStrong, shadowOpacity: 0 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  hint: {
    color: colors.inkFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 17,
  },
});
