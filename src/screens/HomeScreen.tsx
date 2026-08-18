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
import {
  dark,
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { GlowButton } from '../components/GlowButton';
import { LogoMark } from '../components/LogoMark';
import { PhoneShowcase } from '../components/PhoneShowcase';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';


/**
 * « il y a un quart d'heure » plutôt qu'une date.
 *
 * Ce qu'on veut savoir d'un relevé interrompu, ce n'est pas le jour : c'est
 * s'il s'agit de celui qu'on vient de perdre, ou d'un vieux fond de tiroir.
 */
function quand(at: number): string {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

export function HomeScreen() {
  const supported = useScanStore((s) => s.supported);
  const setSupported = useScanStore((s) => s.setSupported);
  const error = useScanStore((s) => s.error);
  const saves = useScanStore((s) => s.saves);
  const brouillon = useScanStore((s) => s.brouillon);
  const reprendreBrouillon = useScanStore((s) => s.reprendreBrouillon);
  const oublierBrouillon = useScanStore((s) => s.oublierBrouillon);
  const setScreen = useScanStore((s) => s.setScreen);
  const themePref = useScanStore((s) => s.themePref);
  const setThemePref = useScanStore((s) => s.setThemePref);
  const { start } = useRoomScan();
  const c = useTheme();
  /** Le fond est-il sombre ? C'est lui qui choisit le logotype. */
  const sombre = c === dark;
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
            /*
              DEUX FICHIERS, ET PAS UNE TEINTE.

              Le logotype portait un `tintColor` : l'image était noire, le
              thème la repeignait. Le nouveau dessin a des ONDES en dégradé —
              c'est son identité — et une teinte les écrase toutes en un
              aplat. On embarque donc les deux versions, et l'on prend celle
              qui va avec le fond.
            */
            source={
              sombre
                ? require('../assets/echoplan-dark.png')
                : require('../assets/echoplan.png')
            }
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

      {/*
        LA VITRINE, À LA PLACE DU MODE D'EMPLOI.

        « Scannez, ajustez, explorez » : trois pictogrammes et neuf mots pour
        dire ce qu'une seule image montre mieux — le résultat. On ne vend pas
        un scanner de pièces avec une notice, on le vend avec le plan qui en
        sort. Et ce plan-là n'est pas une illustration : il passe par le même
        chemin que la vue 3D de l'application.
      */}
      <Animated.View style={[styles.vitrine, fadeIn(2)]}>
        <PhoneShowcase />
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

      {/*
        LE RELEVÉ INTERROMPU — proposé, jamais imposé.

        L'app tuée en plein scan — un appel, une photo, un téléphone à court
        de mémoire — emportait la visite entière. Le relevé s'écrit désormais
        tout seul, toutes les trente secondes ; il attend ici.

        On ne le rouvre PAS d'office : l'utilisateur a pu quitter
        volontairement un essai raté, et se le voir réimposer au démarrage
        serait pire que de l'avoir perdu. D'où deux gestes, et le second —
        jeter — sans confirmation : ce qu'on jette est un brouillon, l'original
        est dans la bibliothèque s'il a été enregistré.
      */}
      {brouillon && (
        <Animated.View style={[styles.draftCard, fadeIn(3)]}>
          <View style={styles.draftTexts}>
            <Text style={styles.draftTitle}>Relevé interrompu</Text>
            <Text style={styles.draftText}>
              {`${brouillon.walls.length} mur${
                brouillon.walls.length > 1 ? 's' : ''
              } relevés${
                brouillon.name ? ` · ${brouillon.name}` : ''
              }, ${quand(brouillon.at)}.`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.draftPrimary}
            accessibilityLabel="Reprendre le relevé"
            onPress={reprendreBrouillon}>
            <Text style={styles.draftPrimaryText}>Reprendre</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.draftGhost}
            accessibilityLabel="Jeter le relevé interrompu"
            onPress={oublierBrouillon}>
            <Text style={styles.draftGhostText}>Jeter</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.View style={[styles.ctaWrap, fadeIn(3)]}>
        <GlowButton
          label={supported === null ? 'Vérification…' : 'Commencer le scan'}
          accessibilityLabel="Commencer le scan"
          disabled={supported !== true}
          onPress={start}
        />
      </Animated.View>

      {saves.length > 0 && (
        <Animated.View style={[styles.secondWrap, fadeIn(4)]}>
          <GlowButton
            label="Mes scans"
            variant="ghost"
            onPress={() => setScreen('library')}
            right={
              <View style={styles.libraryBadge}>
                <Text style={styles.libraryBadgeText}>{saves.length}</Text>
              </View>
            }
          />
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
  /**
   * La carte du relevé interrompu : ambre, pas rouge.
   *
   * Rien n'est cassé — il y a quelque chose à reprendre. Le rouge dirait
   * qu'on a fait une faute, et ferait chercher laquelle.
   */
  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.amber,
  },
  draftTexts: { flex: 1 },
  draftTitle: { color: c.ink, fontSize: 14.5, fontWeight: '800' },
  draftText: { color: c.inkSoft, fontSize: 12, marginTop: 2, lineHeight: 16 },
  draftPrimary: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  draftPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  draftGhost: { paddingHorizontal: 4, paddingVertical: 9 },
  draftGhostText: { color: c.inkFaint, fontWeight: '700', fontSize: 13 },
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
  /**
   * Le logotype tient sur DEUX lignes — « echo » au-dessus de « plan » —,
   * d'où ces proportions : 160 × 102 et non plus une bande.
   */
  wordmark: {
    width: 160,
    height: 102,
    marginTop: 14,
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
  /**
   * La vitrine prend la place laissée par les étapes : elle respire, et
   * c'est elle qu'on regarde en attendant de toucher le bouton.
   */
  vitrine: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  /** Appareil incompatible, ou erreur du scan : un bandeau, pas une alerte. */
  warning: {
    backgroundColor: '#FDECEC',
    borderRadius: radius.md,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  warningText: { color: '#A33A3E', fontSize: 13, lineHeight: 18 },
  ctaWrap: { marginTop: 'auto', paddingHorizontal: 22 },
  secondWrap: { paddingHorizontal: 22, marginTop: 10 },
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
