/**
 * LE TOTAL QUI ARRIVE — le seul moment de la page où l'on attend un chiffre.
 *
 * Relevé du patron : « on doit rendre la chose ludique. »
 *
 * L'estimation s'affichait d'un coup, après une attente qu'on a délibérément
 * allongée pour qu'elle se voie. On regarde l'écran, on attend, et le chiffre
 * apparaît comme une donnée de tableur. Or c'est LE nombre de la page : celui
 * pour lequel on est venu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PREMIER DESSIN : LE CHIFFRE MONTAIT DE ZÉRO. Sept dixièmes de seconde, un
 * ralenti à l'arrivée. C'était joli, et c'était une faute.
 *
 * Le total est le nombre le PLUS ÉPROUVÉ de l'application : quatre bancs le
 * lisent en toutes lettres, et le prochain le lira aussi. Le faire dépendre du
 * temps, c'est demander à chaque épreuve, pour toujours, de savoir qu'il faut
 * avancer les horloges avant de lire un prix — et celui qui l'ignorera lira
 * « 0,00 € » sans comprendre pourquoi.
 *
 * Deux bancs sont tombés à l'écriture. Ils avaient raison : un ornement qui
 * rend le chiffre juste plus difficile à vérifier n'est pas un bon ornement.
 *
 * SECOND DESSIN, ET C'EST CELUI-CI : LE CHIFFRE NE BOUGE PAS, SA LIGNE ARRIVE.
 * Le texte affiche le total, tout de suite et toujours ; c'est le bloc qui
 * grandit d'un dixième et se pose, avec un souffle de couleur. On a le même
 * « ta-da » — l'œil suit un mouvement à l'endroit du chiffre — et la valeur
 * reste lisible à la première image, pour l'utilisateur comme pour les bancs.
 *
 * LA LEÇON, ÉCRITE ICI PARCE QU'ELLE SE REPRÉSENTERA : ce qui se mesure ne
 * s'anime pas. On anime ce qui le PORTE.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';

/** L'arrivée, en millisecondes. Le temps d'un geste, pas d'une attente. */
export const ARRIVEE_TOTAL = 420;

export function TotalQuiMonte({
  valeur,
  format,
  style,
}: {
  valeur: number;
  /** Comment l'écrire — c'est l'appelant qui sait, pas nous. */
  format: (v: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const pose = useRef(new Animated.Value(0)).current;
  /*
    L'ARRIVÉE NE SE REJOUE PAS À CHAQUE TOTAL.

    Écarter un article change le prix : refaire l'animation à chaque retrait
    transformerait une liste qu'on ajuste en machine à sous. Elle a lieu une
    fois, quand le ticket paraît — c'est le moment qu'on attendait.
  */
  useEffect(() => {
    Animated.timing(pose, {
      toValue: 1,
      duration: ARRIVEE_TOTAL,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [pose]);

  return (
    <Animated.View
      style={{
        opacity: pose,
        transform: [
          {
            scale: pose.interpolate({
              inputRange: [0, 1],
              // Il arrive de plus petit et se pose : le dépassement du
              // ressort fait le reste.
              outputRange: [0.88, 1],
            }),
          },
        ],
      }}>
      <Text style={style}>{format(valeur)}</Text>
    </Animated.View>
  );
}
