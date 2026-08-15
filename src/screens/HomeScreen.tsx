import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import {
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { LogoMark } from '../components/LogoMark';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';

const STEPS = [
  { n: '1', title: 'Scannez', text: 'Filmez la pièce, les murs se détectent seuls' },
  { n: '2', title: 'Ajustez', text: 'Corrigez le plan 2D, vérifiez les mesures' },
  { n: '3', title: 'Explorez', text: 'Vue 3D interactive et modèle AR' },
];

export function HomeScreen() {
  const supported = useScanStore((s) => s.supported);
  const setSupported = useScanStore((s) => s.setSupported);
  const error = useScanStore((s) => s.error);
  const saves = useScanStore((s) => s.saves);
  const setScreen = useScanStore((s) => s.setScreen);
  const themePref = useScanStore((s) => s.themePref);
  const setThemePref = useScanStore((s) => s.setThemePref);
  const { start } = useRoomScan();
  const c = useTheme();
  const styles = getStyles(c);

  useEffect(() => {
    RoomScan.isSupported().then(setSupported);
  }, [setSupported]);

  // Arrivée : le logo projette des ondes qui traversent TOUTE la page.
  const { width: winW, height: winH } = useWindowDimensions();
  const waveScale = (Math.max(winW, winH) * 2.4) / 76;
  const wave = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(wave, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(reveal, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [wave, reveal]);

  // Fondu en cascade : chaque bloc apparaît juste après le précédent.
  const fadeIn = (i: number) => {
    const range = [i * 0.1, Math.min(i * 0.1 + 0.45, 1)];
    return {
      opacity: reveal.interpolate({
        inputRange: range,
        outputRange: [0, 1],
        extrapolate: 'clamp' as const,
      }),
      transform: [
        {
          translateY: reveal.interpolate({
            inputRange: range,
            outputRange: [10, 0],
            extrapolate: 'clamp' as const,
          }),
        },
      ],
    };
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.themeButton}
        onPress={() => setThemePref(themePref === 'dark' ? 'light' : 'dark')}>
        <Text style={styles.themeIcon}>{themePref === 'dark' ? '☀' : '☾'}</Text>
      </TouchableOpacity>

      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          {[0, 0.15].map((delay, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.waveRing,
                {
                  opacity: wave.interpolate({
                    inputRange: [delay, Math.min(delay + 0.2, 1), 1],
                    outputRange: [0, 0.5, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: wave.interpolate({
                        inputRange: [delay, 1],
                        outputRange: [0.6, waveScale],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
          <LogoMark />
        </View>
        <Animated.View style={fadeIn(0)}>
          <Text style={styles.title}>
            Echo<Text style={styles.titleAccent}>Plan</Text>
          </Text>
        </Animated.View>
        <Animated.View style={fadeIn(1)}>
          <Text style={styles.subtitle}>
            Votre appartement en 3D et en plan coté,{'\n'}en quelques minutes.
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.stepsCard, fadeIn(2)]}>
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
      </Animated.View>

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

      <Animated.View style={[styles.ctaWrap, fadeIn(3)]}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.cta, supported !== true && styles.ctaDisabled]}
          disabled={supported !== true}
          onPress={start}>
          <Text style={styles.ctaText}>
            {supported === null ? 'Vérification…' : 'Commencer le scan'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {saves.length > 0 && (
        <Animated.View style={fadeIn(4)}>
          <TouchableOpacity
            style={styles.libraryButton}
            onPress={() => setScreen('library')}>
            <Text style={styles.libraryText}>Mes scans</Text>
            <View style={styles.libraryBadge}>
              <Text style={styles.libraryBadgeText}>{saves.length}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.Text style={[styles.hint, fadeIn(5)]}>
        Allumez les lumières et dégagez le centre de la pièce pour un meilleur
        résultat.
      </Animated.Text>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingHorizontal: 24,
    paddingTop: 84,
    paddingBottom: 40,
  },
  // zIndex/elevation : l'onde d'arrivée pulse AU-DESSUS des cartes suivantes.
  hero: { alignItems: 'center', zIndex: 20, elevation: 20 },
  themeButton: {
    position: 'absolute',
    top: 54,
    right: 22,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  themeIcon: { color: c.inkSoft, fontSize: 21 },
  title: {
    color: c.ink,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 18,
  },
  titleAccent: { color: c.blue },
  subtitle: {
    color: c.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  waveRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: c.blue,
  },
  stepsCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    marginTop: 32,
    paddingHorizontal: 18,
    ...shadowCard,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  stepRowBorder: { borderTopWidth: 1, borderTopColor: c.line },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stepBadgeText: { color: c.blue, fontSize: 14, fontWeight: '800' },
  stepTexts: { flex: 1 },
  stepTitle: { color: c.ink, fontSize: 15, fontWeight: '700' },
  stepText: { color: c.inkFaint, fontSize: 13, marginTop: 1 },
  warning: {
    backgroundColor: '#FCEEEE',
    borderRadius: radius.md,
    padding: 14,
    marginTop: 20,
  },
  warningText: { color: '#A33A3E', fontSize: 13, lineHeight: 18 },
  ctaWrap: { marginTop: 'auto' },
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
  ctaDisabled: { backgroundColor: c.lineStrong, shadowOpacity: 0 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  libraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: radius.md + 2,
    paddingVertical: 14,
    marginTop: 10,
  },
  libraryText: { color: c.ink, fontSize: 15.5, fontWeight: '600' },
  libraryBadge: {
    backgroundColor: c.blueSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    marginLeft: 9,
  },
  libraryBadgeText: { color: c.blue, fontSize: 13, fontWeight: '800' },
  hint: {
    color: c.inkFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 17,
  },
}));
