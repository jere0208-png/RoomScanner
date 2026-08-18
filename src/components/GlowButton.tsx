/**
 * LE BOUTON À CONTOUR TOURNANT.
 *
 * Un aplat bleu à coins arrondis, c'est le bouton de 2015 : il dit « ceci se
 * touche » et rien d'autre. Ce qu'on veut ici, c'est qu'il ATTIRE — l'accueil
 * n'a qu'un geste à proposer, autant qu'il se voie.
 *
 * Trois choses le distinguent d'un rectangle peint :
 *
 * - **la translucidité** : le fond laisse voir ce qui passe dessous, si bien
 *   que le bouton appartient à l'écran au lieu d'être collé dessus ;
 * - **le contour qui court** : un segment lumineux fait le tour du bord, sans
 *   fin. C'est un mouvement lent — deux secondes et demie par tour — qui se
 *   remarque sans agiter ;
 * - **l'enfoncement** : à l'appui, le bouton recule légèrement. Un bouton qui
 *   ne bouge pas sous le doigt laisse douter qu'il a pris.
 *
 * Le segment est un tracé SVG dont le tireté se décale (`strokeDashoffset`).
 * Cette propriété n'a pas d'équivalent natif : elle s'anime donc sur le fil
 * JS, ce qui est acceptable ici — un seul contour, sur un écran qui ne fait
 * rien d'autre. Dès qu'un plan se dessine à côté, on ne s'offre pas ça.
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radius, useTheme, type Palette } from '../theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function GlowButton({
  label,
  onPress,
  disabled,
  /** Le bouton principal porte la couleur ; le second reste sobre. */
  variant = 'primary',
  right,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  /** Ce qui se pose à droite du libellé — un compteur, par exemple. */
  right?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [taille, setTaille] = React.useState({ w: 0, h: 0 });
  const course = useRef(new Animated.Value(0)).current;
  const appui = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) return;
    const boucle = Animated.loop(
      Animated.timing(course, {
        toValue: 1,
        duration: variant === 'primary' ? 2500 : 3800,
        easing: Easing.linear,
        // `strokeDashoffset` n'existe pas côté natif : l'animation vit sur
        // le fil JS, et la boucle s'arrête avec le composant.
        useNativeDriver: false,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [course, disabled, variant]);

  const H = taille.h || 56;
  const W = taille.w || 240;
  const R = Math.min(H / 2, radius.lg);
  // Le tour du rectangle arrondi : deux longueurs, deux largeurs, moins ce
  // que les quatre quarts de cercle raccourcissent, plus leur arc.
  const tour = 2 * (W - 2 * R) + 2 * (H - 2 * R) + 2 * Math.PI * R;
  // Le segment lumineux couvre le quart du tour : assez long pour se voir
  // passer, assez court pour qu'on sache où il va.
  const segment = tour * 0.26;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() =>
        Animated.timing(appui, {
          toValue: 1,
          duration: 90,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.timing(appui, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }).start()
      }
      onPress={onPress}
      onLayout={(e) =>
        setTaille({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }>
      <Animated.View
        style={[
          styles.corps,
          variant === 'primary' ? styles.primaire : styles.fantome,
          disabled && styles.eteint,
          {
            transform: [
              {
                scale: appui.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.972],
                }),
              },
            ],
          },
        ]}>
        <Text
          style={[
            styles.texte,
            variant === 'primary' ? styles.texteClair : styles.texteSombre,
          ]}>
          {label}
        </Text>
        {right}
        {/* Le contour : posé PAR-DESSUS le fond, mais transparent au doigt —
            il ne doit pas voler l'appui qu'il invite à donner. */}
        {taille.w > 0 && !disabled && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={W} height={H}>
              <Defs>
                <LinearGradient id="fil" x1="0" y1="0" x2="1" y2="1">
                  <Stop
                    offset="0"
                    stopColor={variant === 'primary' ? '#FFFFFF' : c.blue}
                    stopOpacity="0"
                  />
                  <Stop
                    offset="0.5"
                    stopColor={variant === 'primary' ? '#FFFFFF' : c.blue}
                    stopOpacity="0.95"
                  />
                  <Stop
                    offset="1"
                    stopColor={variant === 'primary' ? '#FFFFFF' : c.blue}
                    stopOpacity="0"
                  />
                </LinearGradient>
              </Defs>
              {/* Le liseré permanent : discret, il tient le bord quand le
                  segment est de l'autre côté. */}
              <Rect
                x={1}
                y={1}
                width={W - 2}
                height={H - 2}
                rx={R}
                fill="none"
                stroke={variant === 'primary' ? '#FFFFFF' : c.lineStrong}
                strokeOpacity={variant === 'primary' ? 0.35 : 1}
                strokeWidth={1.2}
              />
              <AnimatedRect
                x={1}
                y={1}
                width={W - 2}
                height={H - 2}
                rx={R}
                fill="none"
                stroke="url(#fil)"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeDasharray={`${segment} ${tour - segment}`}
                strokeDashoffset={course.interpolate({
                  inputRange: [0, 1],
                  // Le tour complet, dans le sens de lecture.
                  outputRange: [tour, 0],
                })}
              />
            </Svg>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const getStyles = (() => {
  const cache = new Map<Palette, ReturnType<typeof creer>>();
  const creer = (c: Palette) =>
    StyleSheet.create({
      corps: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minHeight: 56,
        paddingHorizontal: 26,
        borderRadius: radius.lg,
        overflow: 'hidden',
      },
      /**
       * TRANSLUCIDE, PAS OPAQUE.
       *
       * Le bleu laisse passer le fond : le bouton se pose sur l'écran au
       * lieu d'y être collé. C'est ce que fait le système partout depuis que
       * les matériaux ont remplacé les aplats.
       */
      primaire: {
        backgroundColor: c.blue,
        // Une ombre teintée de la couleur du bouton : elle le soulève sans
        // le cerner d'un trait.
        shadowColor: c.blue,
        shadowOpacity: 0.4,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
      fantome: {
        backgroundColor: c.surface,
        opacity: 0.92,
      },
      eteint: { opacity: 0.45 },
      texte: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2 },
      texteClair: { color: '#FFFFFF' },
      texteSombre: { color: c.ink },
    });
  return (c: Palette) => {
    let s = cache.get(c);
    if (!s) {
      s = creer(c);
      cache.set(c, s);
    }
    return s;
  };
})();
