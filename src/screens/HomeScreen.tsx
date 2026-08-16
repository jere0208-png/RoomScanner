import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import Svg, { Path, Rect } from 'react-native-svg';
import {
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { LogoMark } from '../components/LogoMark';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';

/**
 * Les trois étapes, et leur dessin.
 *
 * Elles portaient un numéro dans une pastille — 1, 2, 3 — ce qui dit
 * l'ordre mais rien du geste. Un téléphone qui balaye une pièce, un plan
 * qu'on retouche, un volume qu'on tourne : on comprend l'app avant d'avoir
 * lu la première ligne, et le numéro reste, en petit, pour l'ordre.
 */
const STEPS: {
  n: string;
  title: string;
  text: string;
  art: (c: Palette) => React.ReactNode;
}[] = [
  {
    n: '1',
    title: 'Scannez',
    text: 'Filmez la pièce, les murs se détectent seuls',
    // Un téléphone, et les ondes qui en sortent.
    art: (c) => (
      <>
        <Rect
          x={7}
          y={4}
          width={11}
          height={18}
          rx={2.2}
          fill="none"
          stroke={c.blue}
          strokeWidth={1.7}
        />
        <Path
          d="M21 8.5 a6 6 0 0 1 0 9 M24.5 5 a10 10 0 0 1 0 16"
          fill="none"
          stroke={c.blue}
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.75}
        />
      </>
    ),
  },
  {
    n: '2',
    title: 'Ajustez',
    text: 'Corrigez le plan 2D, vérifiez les mesures',
    // Un plan et sa cote : ce qu'on retouche.
    art: (c) => (
      <>
        <Path
          d="M5 6 h18 v11 H5 z M15 6 v6"
          fill="none"
          stroke={c.blue}
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
        <Path
          d="M5 21 h18 M5 19.5 v3 M23 19.5 v3"
          fill="none"
          stroke={c.blue}
          strokeWidth={1.3}
          opacity={0.7}
        />
      </>
    ),
  },
  {
    n: '3',
    title: 'Explorez',
    text: 'Vue 3D interactive et modèle AR',
    // Un volume en isométrie : le modèle qu'on tourne.
    art: (c) => (
      <>
        <Path
          d="M14 3 L24 8.5 v11 L14 25 L4 19.5 v-11 z"
          fill="none"
          stroke={c.blue}
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
        <Path
          d="M4 8.5 L14 14 L24 8.5 M14 14 v11"
          fill="none"
          stroke={c.blue}
          strokeWidth={1.4}
          strokeLinejoin="round"
          opacity={0.65}
        />
      </>
    ),
  },
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
          {/* La typo de la marque, détourée, plutôt que deux `Text` empilés :
              le « O » d'ECHO porte les ondes du logo, ce qu'aucune police
              système ne sait faire. Teintée par le thème pour rester
              lisible en sombre. */}
          <Image
            source={require('../assets/echoplan.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="EchoPlan"
          />
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
              <Svg width={28} height={28} viewBox="0 0 28 28">
                {s.art(c)}
              </Svg>
            </View>
            <View style={styles.stepTexts}>
              <Text style={styles.stepTitle}>
                <Text style={styles.stepNum}>{s.n}. </Text>
                {s.title}
              </Text>
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
    ...shadowCard,
    shadowOpacity: 0.08,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  themeIcon: { color: c.inkSoft, fontSize: 21 },
  wordmark: {
    width: 244,
    height: 54,
    marginTop: 18,
    tintColor: c.ink,
  },
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
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: c.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stepNum: { color: c.inkFaint, fontWeight: '700' },
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
    borderRadius: radius.pill,
    paddingVertical: 18,
    alignItems: 'center',
    ...glow(c.blue),
    shadowOpacity: 0.36,
  },
  ctaDisabled: { backgroundColor: c.lineStrong, shadowOpacity: 0 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  libraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingVertical: 15,
    marginTop: 10,
    ...shadowCard,
    shadowOpacity: 0.05,
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
