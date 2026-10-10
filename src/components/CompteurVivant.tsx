/**
 * UN COMPTEUR DU SCAN QUI RÉAGIT — le mur, la porte, la fenêtre qu'on vient
 * de trouver, dits à l'œil ET à la main.
 *
 * Relevé du patron : « repense la chose en modernité et ludique ». Les
 * chiffres du haut de l'écran changeaient en silence ; on balaie une pièce
 * les yeux sur le mur, pas sur un compteur. Chaque NOUVELLE trouvaille fait
 * maintenant sauter son chiffre, monter un « +1 » qui s'efface, et vibrer
 * le téléphone d'une touche : légère pour un mur, plus franche pour une
 * ouverture. On sent la pièce se construire sans la regarder se construire.
 *
 * SEULEMENT CE QUI EST NEUF. RoomPlan recompte deux fois par seconde, et un
 * compte peut redescendre (deux murs réunis) puis remonter : on ne fête que
 * ce qui dépasse le plus haut déjà vu. Et les vibrations s'espacent d'un
 * tiers de seconde au moins — un salon qui se découvre ne doit pas bourdonner.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { haptic } from '../ui/haptic';

/** La dernière vibration, toutes catégories confondues. */
const derniere = { t: 0 };
const ECART_MIN = 350;

/** Faut-il fêter cette valeur ? Rend aussi le nouveau record. */
export function trouvaille(
  valeur: number,
  record: number,
): { fete: number; record: number } {
  if (valeur > record) return { fete: valeur - record, record: valeur };
  return { fete: 0, record };
}

export function CompteurVivant({
  valeur,
  libelle,
  ouverture,
  actif,
  style,
  styleValeur,
  styleLibelle,
  teinte,
}: {
  valeur: number;
  libelle: string;
  /** Une porte, une fenêtre : la vibration est plus franche. */
  ouverture?: boolean;
  /** Pas de fête en pause, ni pendant l'assemblage. */
  actif: boolean;
  style?: StyleProp<ViewStyle>;
  styleValeur?: StyleProp<TextStyle>;
  styleLibelle?: StyleProp<TextStyle>;
  teinte: string;
}) {
  const record = useRef(valeur);
  const saut = useRef(new Animated.Value(1)).current;
  const bulle = useRef(new Animated.Value(0)).current;
  const gain = useRef(0);
  useEffect(() => {
    const r = trouvaille(valeur, record.current);
    record.current = r.record;
    if (!actif || r.fete === 0) return;
    gain.current = r.fete;
    saut.setValue(1);
    bulle.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(saut, {
          toValue: 1.4,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(saut, {
          toValue: 1,
          friction: 4,
          tension: 160,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(bulle, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    const maintenant = Date.now();
    if (maintenant - derniere.t >= ECART_MIN) {
      derniere.t = maintenant;
      haptic(ouverture ? 'accroche' : 'leger');
    }
  }, [valeur, actif, ouverture, saut, bulle]);
  return (
    <View style={style} accessibilityLabel={`${valeur} ${libelle}`}>
      <Animated.Text style={[styleValeur, { transform: [{ scale: saut }] }]}>
        {valeur}
      </Animated.Text>
      <Text style={styleLibelle}>{libelle}</Text>
      <Animated.Text
        pointerEvents="none"
        style={[
          styles.bulle,
          {
            color: teinte,
            opacity: bulle.interpolate({
              inputRange: [0, 0.1, 0.7, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateY: bulle.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -22],
                }),
              },
            ],
          },
        ]}
      >
        {`+${gain.current || 1}`}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Le « +1 » qui monte au-dessus du chiffre, puis s'efface.
  bulle: {
    position: 'absolute',
    top: -4,
    alignSelf: 'center',
    fontSize: 13,
    fontWeight: '900',
  },
});
