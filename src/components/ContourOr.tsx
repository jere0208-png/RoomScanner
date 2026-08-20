/**
 * LE CONTOUR D'OR — la peau du badge Pro, prêtée à d'autres blocs.
 *
 * Le badge a établi la recette : une bande d'ors monotones qui glisse, et
 * un couvercle posé dessus, en retrait du bord — ce qui dépasse est le
 * contour, et il respire. La carte du comparatif Pro et le bouton
 * d'abonnement portent LE MÊME contour : trois dégradés réglés à la main
 * finiraient par diverger à la première retouche, alors la famille d'ors,
 * l'épaisseur du trait et le rythme vivent ici, et le badge les emprunte.
 *
 * C'EST LA VUE QUI GLISSE — la leçon du ruban, toujours : la bande est
 * dessinée UNE FOIS sur deux périodes, et une transformation native la
 * translate d'une période avant de reboucler. Rien sur le fil JS.
 *
 * La bande ne se dessine qu'une fois la taille du bloc connue (`onLayout`) :
 * contrairement au badge, une carte a la hauteur de son contenu.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * La famille d'ors, en boucle : doré, clair, bronze, et retour au doré —
 * le premier et le dernier arrêt sont LE MÊME, sans quoi la couture se
 * verrait à chaque tour.
 */
export const ORS = ['#C8861F', '#E9B54D', '#A3690F', '#C8861F'] as const;

/** L'épaisseur du contour : celle du badge. */
export const TRAIT = 1.5;

/** Une vague toutes les huit secondes : fluide, jamais pressée. */
export const DUREE_VAGUE = 8000;

export function ContourOr({
  rayon,
  fond,
  style,
  children,
}: {
  /** Le rayon du bloc : le couvercle prend le sien, moins le trait. */
  rayon: number;
  /** La peau du couvercle — le fond du bloc qu'on cerne. */
  fond: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const glisse = useRef(new Animated.Value(0)).current;
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const boucle = Animated.loop(
      Animated.timing(glisse, {
        toValue: 1,
        duration: DUREE_VAGUE,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [glisse]);

  // Le dégradé est LONG — plusieurs blocs de large — donc presque uni à
  // tout instant : on sent le mouvement, on ne compte pas les couleurs.
  const periode = dims ? Math.max(dims.w, dims.h) * 4 : 0;

  return (
    <View
      style={[style, { borderRadius: rayon }, styles.cadre]}
      onLayout={(e) =>
        setDims({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }>
      {dims && (
        <Animated.View
          style={[
            styles.bande,
            {
              width: periode * 2,
              height: dims.h,
              transform: [
                {
                  translateX: glisse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -periode],
                  }),
                },
              ],
            },
          ]}>
          <Svg width={periode * 2} height={dims.h}>
            <Defs>
              <LinearGradient id="contour-ors" x1="0" y1="0" x2="1" y2="0">
                {ORS.map((teinte, i) => (
                  <Stop
                    key={i}
                    offset={`${Math.round((i / (ORS.length - 1)) * 100)}%`}
                    stopColor={teinte}
                  />
                ))}
              </LinearGradient>
            </Defs>
            {/* Deux rectangles, même dégradé : la copie entre par la droite
                pendant que l'originale sort par la gauche. */}
            <Rect x={0} width={periode} height={dims.h} fill="url(#contour-ors)" />
            <Rect
              x={periode}
              width={periode}
              height={dims.h}
              fill="url(#contour-ors)"
            />
          </Svg>
        </Animated.View>
      )}
      {/* Le couvercle : en retrait du trait, il laisse le contour — et
          porte le contenu, pour que rien ne se dessine sur la bande. */}
      <View
        style={[
          styles.couvercle,
          { borderRadius: Math.max(0, rayon - TRAIT), backgroundColor: fond },
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Le rognage fait la forme : la bande dépasse largement, le bloc la
  // coupe — le bord compris, c'est lui le contour.
  cadre: { overflow: 'hidden' },
  bande: { position: 'absolute', top: 0, left: 0 },
  couvercle: { flex: 1, margin: TRAIT, overflow: 'hidden' },
});
