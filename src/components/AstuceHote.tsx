/**
 * L'ASTUCE QUI PASSE — montée une fois pour toute l'application.
 *
 * Une pastille en bas de l'écran, qui monte, se lit, et s'en va. Elle ne
 * demande rien : ni appui, ni décision. C'est la troisième façon de parler que
 * l'application n'avait pas — l'alerte arrête tout, la feuille demande un
 * choix, celle-ci se contente de dire.
 *
 * ELLE NE PREND JAMAIS LE DOIGT. Une pastille qui avale un appui pendant les
 * quatre secondes où elle passe, c'est un bouton manqué et un utilisateur qui
 * ne comprend pas pourquoi. Elle est traversante d'un bout à l'autre — sauf
 * sa croix, qui est le seul endroit où l'on peut vouloir la toucher.
 *
 * ELLE VIT EN BAS DE `App`, comme l'alerte et pour la même raison : elle naît
 * là où le geste se produit, et l'écran qui l'a levée peut très bien
 * disparaître entre-temps — c'est même le cas de la plus importante d'entre
 * elles, celle du plan qu'on vient d'enregistrer avant de sortir.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { SOLAIRES } from '../ui/solaires';
import { useAstuce } from '../ui/astuce';
import { useReduceMotion } from '../ui/useReduceMotion';

/**
 * COMBIEN DE TEMPS ELLE RESTE.
 *
 * Trois secondes : le temps de lire une phrase courte et de revenir à ce
 * qu'on faisait. Elle en restait quatre — relevé du patron : « elles
 * s'affichent légèrement trop longtemps et gâchent la vue des boutons ».
 */
export const DUREE_ASTUCE = 3000;
/**
 * Celle qui porte un geste reste plus longtemps : on lit, PUIS on décide
 * d'appuyer — deux temps, pas un.
 */
export const DUREE_ASTUCE_ACTION = 5000;
/** L'entrée et la sortie : assez pour qu'on la voie venir, pas plus. */
export const GLISSE_ASTUCE = 220;
/**
 * L'ÉCHO DE L'ENTRÉE — relevé du patron : « une animation rapide “écho” pour
 * l'apparition du message ». Deux ondes partent du contour de la pastille et
 * s'effacent en s'élargissant, comme le signal du scan : la marque de la
 * maison, en un demi-temps.
 */
export const ECHO_ASTUCE = 560;

export function AstuceHote() {
  const courante = useAstuce((s) => s.courante);
  const fermer = useAstuce((s) => s.fermer);
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  const ancreHaute = useAstuce((s) => s.ancreHaute);
  const immobile = useReduceMotion();
  const vie = useRef(new Animated.Value(0)).current;
  const echo = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!courante) return;
    let vivant = true;
    vie.setValue(0);
    echo.setValue(immobile ? 1 : 0);
    const onde = Animated.timing(echo, {
      toValue: 1,
      duration: ECHO_ASTUCE,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    if (!immobile) onde.start();
    const entrer = Animated.timing(vie, {
      toValue: 1,
      duration: GLISSE_ASTUCE,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const sortir = Animated.timing(vie, {
      toValue: 0,
      duration: GLISSE_ASTUCE,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    /*
      L'ATTENTE EST UNE ANIMATION, PAS UN MINUTEUR.

      `Animated.delay` vit dans la même séquence que l'entrée et la sortie :
      si le composant se démonte au milieu, tout s'arrête ensemble. Un
      `setTimeout` à côté survivrait à l'arrêt de la séquence et fermerait une
      astuce déjà remplacée.
    */
    const suite = Animated.sequence([
      entrer,
      Animated.delay(courante.action ? DUREE_ASTUCE_ACTION : DUREE_ASTUCE),
      sortir,
    ]);
    suite.start(({ finished }) => {
      if (finished && vivant) fermer();
    });
    return () => {
      vivant = false;
      suite.stop();
      onde.stop();
    };
  }, [courante, vie, echo, fermer, immobile]);

  if (!courante) return null;
  const fete = !!courante.fete;
  const dessin = courante.icone ?? (fete ? 'etoile' : 'baguette');
  /*
    EN HAUT QUAND L'ÉCRAN LE DEMANDE — le plan déclare le bas de sa rangée
    « Explorer · 2D » (voir `ancrer`) : l'astuce se pose juste dessous,
    centrée, et descend de quelques points au lieu de monter du bas.
  */
  const enHaut = ancreHaute !== null;
  /** Une onde : elle part du contour, s'élargit et s'éteint. */
  const onde = (debut: number, ampleur: number, opacite: number) => ({
    opacity: echo.interpolate({ inputRange: [debut, debut + 0.05, 1], outputRange: [0, opacite, 0], extrapolate: 'clamp' }),
    transform: [
      { scaleX: echo.interpolate({ inputRange: [debut, 1], outputRange: [1, 1 + ampleur * 0.45], extrapolate: 'clamp' }) },
      { scaleY: echo.interpolate({ inputRange: [debut, 1], outputRange: [1, 1 + ampleur], extrapolate: 'clamp' }) },
    ],
  });
  return (
    <Animated.View
      // Traversante : voir l'en-tête. La croix, elle, prend son appui.
      pointerEvents="box-none"
      style={[
        styles.zone,
        enHaut ? { top: ancreHaute + 8 } : { bottom: Math.max(marges.bottom, 12) + 12 },
        {
          opacity: vie,
          transform: [
            {
              translateY: vie.interpolate({
                inputRange: [0, 1],
                outputRange: [enHaut ? -14 : 26, 0],
              }),
            },
            // Le petit rebond de l'entrée, qui accompagne l'écho.
            {
              scale: echo.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.9, 1.03, 1] }),
            },
          ],
        },
      ]}>
      <View pointerEvents="box-none" style={styles.porteEcho}>
      {!immobile && (
        <>
          <Animated.View pointerEvents="none" style={[styles.onde, onde(0, 0.9, 0.55)]} />
          <Animated.View pointerEvents="none" style={[styles.onde, onde(0.22, 0.65, 0.4)]} />
        </>
      )}
      <View style={[styles.pilule, fete && styles.pilulefete]}>
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path
            d={SOLAIRES[dessin] ?? SOLAIRES.etoile}
            fill={fete ? '#FFFFFF' : c.blue}
            fillRule="evenodd"
          />
        </Svg>
        <Text
          style={[styles.texte, fete && styles.texteFete]}
          numberOfLines={2}>
          {courante.texte}
        </Text>
        {courante.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={courante.action.label}
            hitSlop={10}
            style={({ pressed }) => [
              styles.action,
              fete && styles.actionFete,
              pressed && styles.actionPressee,
            ]}
            onPress={() => {
              courante.action?.faire();
              fermer();
            }}>
            <Text style={[styles.actionTexte, fete && styles.actionTexteFete]}>
              {courante.action.label}
            </Text>
          </Pressable>
        ) : null}
        {/* Le seul endroit qui prend le doigt : pour qui a déjà lu. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer l’astuce"
          hitSlop={10}
          onPress={fermer}>
          <Text style={[styles.croix, fete && styles.texteFete]}>×</Text>
        </Pressable>
      </View>
      </View>
    </Animated.View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    zone: {
      position: 'absolute',
      left: 14,
      right: 14,
      alignItems: 'center',
    },
    porteEcho: { maxWidth: 460 },
    // L'onde de l'écho : le contour de la pastille, qui s'élargit et s'efface.
    onde: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: c.blue,
    },
    pilule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      maxWidth: 460,
      paddingVertical: 11,
      paddingHorizontal: 15,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      ...shadowCard,
    },
    /* La fête prend la couleur de la maison : on ne félicite pas en gris. */
    pilulefete: { backgroundColor: c.blue, borderColor: c.blue },
    texte: { flex: 1, color: c.ink, fontSize: 13.5, lineHeight: 18 },
    texteFete: { color: '#FFFFFF' },
    croix: { color: c.inkFaint, fontSize: 19, lineHeight: 19, fontWeight: '700' },
    action: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
    },
    actionFete: { backgroundColor: '#FFFFFF' },
    actionPressee: { opacity: 0.7 },
    actionTexte: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    actionTexteFete: { color: c.blue },
  }),
);
