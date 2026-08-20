/**
 * LE BADGE PRO — blanc, cerné et lettré d'un or qui respire.
 *
 * L'ancien badge était un bloc noir à texte jaune : un aplat, posé sur la
 * seule carte qu'on vend. Celui-ci est BLANC, et une bande d'ors glisse
 * derrière lui, visible à deux endroits seulement : le CONTOUR du badge et
 * les LETTRES « PRO ».
 *
 * UNE SEULE BANDE POUR LES DEUX. Le badge est un sandwich : la bande
 * dégradée glisse au fond, et un couvercle blanc se pose dessus — en retrait
 * du bord (ce qui laisse le contour) et TROUÉ au masque en forme de « PRO »
 * (ce qui laisse les lettres). Contour et lettres ne peuvent pas diverger :
 * ils regardent la même bande, par construction.
 *
 * LE DÉGRADÉ EST LONG, DONC DISCRET. La bande fait quatre badges de large
 * pour une seule vague de teintes : à tout instant, ce qu'on en voit est
 * presque uni — on sent le mouvement, on ne compte pas les couleurs. Les
 * teintes sont une seule famille d'ors, du doré clair au bronze, et la
 * dernière rejoint la première : la boucle n'a pas de couture.
 *
 * C'EST LA VUE QUI GLISSE — la leçon du ruban. Le pilote natif ignore les
 * attributs d'un dessin vectoriel : la bande est dessinée UNE FOIS, sur deux
 * périodes, et une transformation native la translate d'une période avant
 * de reboucler. Rien à recalculer, rien sur le fil JS.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Mask,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
// La famille d'ors, l'épaisseur du trait et le rythme vivent dans
// `ContourOr` : la carte Pro et le bouton d'abonnement portent le même
// contour, et une seule source les empêche de diverger.
import { DUREE_VAGUE, ORS, TRAIT } from './ContourOr';

/** Les cotes du badge, fixes : le mot ne change pas. */
const LARGEUR = 46;
const HAUTEUR = 21;
const RAYON = 9;
/** Une vague = quatre badges de large : longue, donc presque unie. */
const PERIODE = LARGEUR * 4;

export function BadgePro({ style }: { style?: ViewStyle }) {
  const glisse = useRef(new Animated.Value(0)).current;

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

  return (
    <View style={[styles.badge, style]} accessible={false}>
      {/* La bande d'ors, dessinée une fois sur deux périodes ; la vue qui la
          porte glisse d'une période, et le motif se rejoint exactement. */}
      <Animated.View
        style={{
          width: PERIODE * 2,
          transform: [
            {
              translateX: glisse.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -PERIODE],
              }),
            },
          ],
        }}>
        <Svg width={PERIODE * 2} height={HAUTEUR}>
          <Defs>
            <LinearGradient id="badge-ors" x1="0" y1="0" x2="1" y2="0">
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
          <Rect x={0} width={PERIODE} height={HAUTEUR} fill="url(#badge-ors)" />
          <Rect
            x={PERIODE}
            width={PERIODE}
            height={HAUTEUR}
            fill="url(#badge-ors)"
          />
        </Svg>
      </Animated.View>
      {/* Le couvercle blanc : en retrait du bord — le contour — et troué au
          masque en forme de « PRO » — les lettres. Blanc du masque : ce qui
          reste ; noir : la trouée. */}
      <Svg
        width={LARGEUR}
        height={HAUTEUR}
        style={StyleSheet.absoluteFill}
        pointerEvents="none">
        <Defs>
          <Mask id="badge-troue">
            <Rect
              x={TRAIT}
              y={TRAIT}
              width={LARGEUR - TRAIT * 2}
              height={HAUTEUR - TRAIT * 2}
              rx={RAYON - TRAIT}
              fill="#FFFFFF"
            />
            <SvgText
              x={LARGEUR / 2}
              y={HAUTEUR / 2 + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight="800"
              fill="#000000">
              PRO
            </SvgText>
          </Mask>
        </Defs>
        <Rect
          x={TRAIT}
          y={TRAIT}
          width={LARGEUR - TRAIT * 2}
          height={HAUTEUR - TRAIT * 2}
          rx={RAYON - TRAIT}
          fill="#FFFFFF"
          mask="url(#badge-troue)"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: LARGEUR,
    height: HAUTEUR,
    borderRadius: RAYON,
    // Le rognage fait la forme : la bande dépasse largement, le pilule la
    // coupe — bord compris, c'est lui le contour.
    overflow: 'hidden',
  },
});
