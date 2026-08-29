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

/**
 * COMBIEN DE TEMPS ELLE RESTE.
 *
 * Quatre secondes : le temps de lire une phrase courte et de revenir à ce
 * qu'on faisait. En dessous, on l'aperçoit sans la lire ; au-dessus, elle
 * devient un élément d'interface qu'on attend de pouvoir refermer.
 */
export const DUREE_ASTUCE = 4000;
/** L'entrée et la sortie : assez pour qu'on la voie venir, pas plus. */
export const GLISSE_ASTUCE = 260;

export function AstuceHote() {
  const courante = useAstuce((s) => s.courante);
  const fermer = useAstuce((s) => s.fermer);
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  const vie = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!courante) return;
    let vivant = true;
    vie.setValue(0);
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
    const suite = Animated.sequence([entrer, Animated.delay(DUREE_ASTUCE), sortir]);
    suite.start(({ finished }) => {
      if (finished && vivant) fermer();
    });
    return () => {
      vivant = false;
      suite.stop();
    };
  }, [courante, vie, fermer]);

  if (!courante) return null;
  const fete = !!courante.fete;
  const dessin = courante.icone ?? (fete ? 'etoile' : 'baguette');
  return (
    <Animated.View
      // Traversante : voir l'en-tête. La croix, elle, prend son appui.
      pointerEvents="box-none"
      style={[
        styles.zone,
        { bottom: Math.max(marges.bottom, 12) + 12 },
        {
          opacity: vie,
          transform: [
            {
              translateY: vie.interpolate({
                inputRange: [0, 1],
                outputRange: [26, 0],
              }),
            },
          ],
        },
      ]}>
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
        {/* Le seul endroit qui prend le doigt : pour qui a déjà lu. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer l’astuce"
          hitSlop={10}
          onPress={fermer}>
          <Text style={[styles.croix, fete && styles.texteFete]}>×</Text>
        </Pressable>
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
  }),
);
