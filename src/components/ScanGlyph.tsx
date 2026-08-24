/**
 * L'ICÔNE ANIMÉE DU SCAN — quatre équerres, un trait qui passe.
 *
 * Le geste et les mesures vivent dans `src/ui/glypheScan.ts` ; ici il n'y a
 * que la mise en scène. Deux couches, comme dans l'original : le cadre, qui
 * ne bouge jamais, en SVG ; la ligne, qui balaye, en vue animée posée
 * par-dessus.
 *
 * POURQUOI UNE VUE ET PAS UN TRAIT SVG. Animer un attribut de
 * react-native-svg repasse par le fil JS à chaque image. Une vue de 12
 * pixels de haut avec ses bouts arrondis donne exactement le même trait, et
 * son déplacement part au moteur natif : la ligne continue de balayer
 * pendant que le JS mouline la lecture du plan — ce qui est précisément le
 * moment où l'on regarde cette icône.
 *
 * LA BOUCLE EST LINÉAIRE, L'ASSOUPLISSEMENT EST DANS LES VALEURS. Une
 * seule animation native tourne de 0 à 1 sur les deux secondes ; les deux
 * courbes du geste sont ÉCHANTILLONNÉES et données à `interpolate`. On
 * évite ainsi une chaîne de six `timing` enchaînés dont chaque retouche
 * décalerait le reste, et le mouvement reste au millième celui du modèle.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';
import {
  cheminDuCadre,
  DUREE_SCAN,
  MESURES,
  poseDeLaLigne,
} from '../ui/glypheScan';

/**
 * Nombre de points d'échantillonnage du tour.
 *
 * Soixante et un, c'est une image sur deux de l'original : l'écart avec la
 * courbe exacte reste sous le demi-millième de la course — invisible sur un
 * trait, et deux fois moins de nombres à porter dans l'interpolation.
 */
const POINTS = 61;

export function ScanGlyph({
  taille = 96,
  couleur,
  teinte,
  anime = true,
  style,
}: {
  taille?: number;
  /** Encre des équerres. Par défaut celle du texte. */
  couleur?: string;
  /** Teinte de la ligne. Par défaut le bleu de l'app. */
  teinte?: string;
  /** À faux, l'icône se fige sur sa pose de départ. */
  anime?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const tour = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!anime) return;
    const boucle = Animated.loop(
      Animated.timing(tour, {
        toValue: 1,
        duration: DUREE_SCAN,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [anime, tour]);

  const echantillons = useMemo(() => {
    const entree: number[] = [];
    const longueurs: number[] = [];
    const courses: number[] = [];
    for (let i = 0; i < POINTS; i++) {
      const part = i / (POINTS - 1);
      const pose = poseDeLaLigne(part * DUREE_SCAN);
      entree.push(part);
      longueurs.push(pose.longueur);
      courses.push(pose.dy * taille);
    }
    return { entree, longueurs, courses };
  }, [taille]);

  const largeur = MESURES.cote * taille;
  const epaisseur = MESURES.trait * taille;
  const depart = poseDeLaLigne(0);

  const habitLigne = anime
    ? {
        transform: [
          {
            translateY: tour.interpolate({
              inputRange: echantillons.entree,
              outputRange: echantillons.courses,
            }),
          },
          {
            scaleX: tour.interpolate({
              inputRange: echantillons.entree,
              outputRange: echantillons.longueurs,
            }),
          },
        ],
      }
    : {
        transform: [
          { translateY: depart.dy * taille },
          { scaleX: depart.longueur },
        ],
      };

  return (
    <View style={[{ width: taille, height: taille }, style]}>
      <Svg width={taille} height={taille}>
        <Path
          d={cheminDuCadre(taille)}
          stroke={couleur ?? c.ink}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Animated.View
        style={[
          styles.ligne,
          {
            width: largeur,
            height: epaisseur,
            borderRadius: epaisseur / 2,
            left: (taille - largeur) / 2,
            top: (taille - epaisseur) / 2,
            backgroundColor: teinte ?? c.blue,
          },
          habitLigne,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { position: 'absolute' },
});
