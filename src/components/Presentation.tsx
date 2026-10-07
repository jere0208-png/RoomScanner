/**
 * LA PRÉSENTATION — un grand visuel, un grand titre, un geste.
 *
 * Relevé du patron : « pour les étapes tuto (avant un scan, ou au lancement
 * de l'app), j'imaginais des gros titres avec grandes images très
 * visuelles », référence à l'appui : un visuel qui prend la moitié haute
 * dans une carte douce, un titre gras sur deux lignes, une phrase grise
 * courte, des tirets de pagination en haut à gauche, « Passer » en haut à
 * droite, un seul bouton pilule pleine largeur. C'est la grammaire des
 * premiers lancements des grandes applications, et l'œil la connaît.
 *
 * UN SEUL COMPOSANT POUR LES DEUX ENTRÉES — le premier lancement et le guide
 * d'avant-scan. Deux présentations dessinées chacune de leur côté auraient
 * divergé à la première retouche ; ici elles partagent le cadre, le rythme
 * et le geste, et ne diffèrent que par ce qu'elles montrent.
 *
 * LE MOUVEMENT. À chaque page, le visuel entre d'un souffle (échelle 0,96 →
 * 1), le titre et la phrase montent de dix-huit points en s'allumant — un
 * ressort, pas une minuterie : c'est ce qui fait « fluide » plutôt que
 * « animé ». On balaie aussi entre les pages, comme partout.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';

export interface PageDePresentation {
  cle: string;
  titre: string;
  phrase: string;
  /** Le visuel, dessiné à la taille de la carte (donnée après la pose). */
  visuel?: (taille: { w: number; h: number }) => React.ReactNode;
  /** Un corps libre à la place du visuel, du titre et de la phrase. */
  corps?: React.ReactNode;
  /** Pas de bouton sous cette page : elle se conclut d'elle-même. */
  sansBouton?: boolean;
}

/** Le balayage qui tourne la page, en points. */
export const SEUIL_BALAYAGE = 60;

export function Presentation({
  pages,
  rang,
  onRang,
  onPasser,
  onFinir,
  labels,
}: {
  pages: PageDePresentation[];
  rang: number;
  onRang: (rang: number) => void;
  onPasser: () => void;
  onFinir: () => void;
  labels: {
    passer: string;
    suivant: string;
    finir: string;
    /** Ce que le bouton dit, à la fin. */
    finirTexte: string;
  };
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  const page = pages[Math.min(rang, pages.length - 1)];
  const derniere = rang >= pages.length - 1;
  /* La carte se dessine dès la première image, à une taille déduite de
     l'écran ; la pose réelle la précise ensuite. Sans cela, le visuel
     arriverait une image en retard — un clignement à chaque ouverture. */
  const ecran = useWindowDimensions();
  const [taille, setTaille] = useState({ w: ecran.width - 40, h: Math.round(ecran.height * 0.44) });

  /* L'entrée de chaque page : un ressort, rejoué à chaque changement. */
  const entree = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    entree.setValue(0);
    Animated.spring(entree, {
      toValue: 1,
      damping: 18,
      stiffness: 170,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [rang, entree]);
  const montee = {
    opacity: entree,
    transform: [{ translateY: entree.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };
  const souffle = {
    opacity: entree.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
    transform: [{ scale: entree.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  };

  const suivant = () => {
    haptic('leger');
    if (derniere) onFinir();
    else onRang(rang + 1);
  };
  /* Le balayage : vers la gauche, la page suivante ; vers la droite, la
     précédente. Un seuil franc, pour qu'un doigt qui hésite ne tourne rien. */
  const balayage = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -SEUIL_BALAYAGE && !derniere) {
            haptic('leger');
            onRang(rang + 1);
          } else if (g.dx > SEUIL_BALAYAGE && rang > 0) {
            haptic('leger');
            onRang(rang - 1);
          }
        },
      }),
    [rang, derniere, onRang],
  );

  return (
    <View
      style={[
        styles.fond,
        { paddingTop: marges.top + 10, paddingBottom: Math.max(marges.bottom, 14) + 6 },
      ]}
      {...balayage.panHandlers}>
      {/* Les tirets et « Passer » : où l'on en est, et la sortie, toujours. */}
      <View style={styles.barre}>
        <View style={styles.points} accessibilityLabel={`Page ${rang + 1} sur ${pages.length}`}>
          {pages.map((p, i) => (
            <View key={p.cle} testID={`point-${i}`} style={[styles.point, i === rang && styles.pointVif]} />
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={labels.passer} hitSlop={12} onPress={onPasser}>
          <Text style={styles.passer}>Passer</Text>
        </Pressable>
      </View>

      {page.corps ? (
        <Animated.View style={[styles.corps, montee]}>{page.corps}</Animated.View>
      ) : (
        <>
          {/* Le visuel, grand, dans une carte douce. */}
          <Animated.View
            style={[styles.carte, souffle]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (Math.abs(width - taille.w) > 1 || Math.abs(height - taille.h) > 1) {
                setTaille({ w: width, h: height });
              }
            }}>
            {page.visuel ? page.visuel(taille) : null}
          </Animated.View>
          <Animated.View style={[styles.textes, montee]}>
            <Text style={styles.titre} numberOfLines={2} adjustsFontSizeToFit>
              {page.titre}
            </Text>
            <Text style={styles.phrase}>{page.phrase}</Text>
          </Animated.View>
        </>
      )}

      {!page.sansBouton && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={derniere ? labels.finir : labels.suivant}
          style={({ pressed }) => [styles.bouton, pressed && styles.boutonEnfonce]}
          onPress={suivant}>
          <Text style={styles.boutonTexte}>{derniere ? labels.finirTexte : 'Suivant'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 32,
      paddingHorizontal: 4,
    },
    points: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    point: { width: 8, height: 6, borderRadius: 3, backgroundColor: c.lineStrong },
    pointVif: { backgroundColor: c.blue, width: 26 },
    passer: { color: c.inkSoft, fontSize: 16, fontWeight: '600' },
    carte: {
      flex: 1,
      marginTop: 18,
      borderRadius: 28,
      backgroundColor: c.blueSoft,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    corps: { flex: 1, justifyContent: 'center' },
    textes: { alignItems: 'center', paddingTop: 26, paddingBottom: 22, paddingHorizontal: 8 },
    titre: {
      color: c.ink,
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '800',
      letterSpacing: -0.9,
      textAlign: 'center',
    },
    phrase: {
      color: c.inkSoft,
      fontSize: 16,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 10,
      maxWidth: 330,
    },
    bouton: {
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boutonEnfonce: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    boutonTexte: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  }),
);
