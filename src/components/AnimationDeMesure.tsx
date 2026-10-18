/**
 * LA RÈGLE, MONTRÉE AVANT D'ÊTRE ESSAYÉE.
 *
 * Diagnostic du patron : « le bouton de mesure est peu explicite, on ne
 * comprend pas exactement à quoi il sert avant de l'utiliser. Faire une
 * animation dans le pop-up qui indique point, trait qui se construit, point,
 * et mesure qui apparaît ».
 *
 * Tant qu'aucun point n'est posé, le bandeau de la règle joue ce geste en
 * boucle : un point, le trait qui s'étire, le second point, puis la cote.
 * Avec « Réduire les animations », le dessin s'arrête sur sa fin : les deux
 * points, le trait et la cote, immobiles — le même sens, sans mouvement.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { useReduceMotion } from '../ui/useReduceMotion';

/** Les temps du geste (ms) : un point, le trait, l'autre point, la cote, un temps, et l'on recommence. */
const TEMPS = { point: 260, trait: 900, cote: 320, tenue: 1300, efface: 300 };

export function AnimationDeMesure({ cote = '3,20 m' }: { cote?: string }) {
  const c = useTheme();
  const reduit = useReduceMotion();
  const pointA = useRef(new Animated.Value(reduit ? 1 : 0)).current;
  const trait = useRef(new Animated.Value(reduit ? 1 : 0)).current;
  const pointB = useRef(new Animated.Value(reduit ? 1 : 0)).current;
  const texte = useRef(new Animated.Value(reduit ? 1 : 0)).current;
  const tout = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduit) {
      for (const v of [pointA, trait, pointB, texte, tout]) v.setValue(1);
      return undefined;
    }
    const pas = (v: Animated.Value, duree: number, easing = Easing.out(Easing.quad)) =>
      Animated.timing(v, { toValue: 1, duration: duree, easing, useNativeDriver: false });
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(tout, { toValue: 1, duration: 0, useNativeDriver: false }),
          ...[pointA, trait, pointB, texte].map((v) =>
            Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false }),
          ),
        ]),
        pas(pointA, TEMPS.point),
        pas(trait, TEMPS.trait, Easing.inOut(Easing.cubic)),
        pas(pointB, TEMPS.point),
        pas(texte, TEMPS.cote),
        Animated.delay(TEMPS.tenue),
        Animated.timing(tout, { toValue: 0, duration: TEMPS.efface, useNativeDriver: false }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [reduit, pointA, trait, pointB, texte, tout]);

  const largeur = trait.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const grossir = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
  });

  return (
    <Animated.View
      style={[s.cadre, { opacity: tout }]}
      accessible
      accessibilityLabel={`Exemple : touchez un premier point, puis un second ; la règle affiche la distance, ici ${cote}.`}>
      <Animated.Text style={[s.cote, { color: c.blue, opacity: texte }]} maxFontSizeMultiplier={1.3}>
        {cote}
      </Animated.Text>
      <View style={s.piste}>
        <Animated.View style={[s.trait, { backgroundColor: c.blue, width: largeur }]} />
        <Animated.View style={[s.point, s.gauche, { backgroundColor: c.blue, borderColor: c.surface }, grossir(pointA)]} />
        <Animated.View style={[s.point, s.droite, { backgroundColor: c.blue, borderColor: c.surface }, grossir(pointB)]} />
      </View>
    </Animated.View>
  );
}

const POINT = 12;
const s = StyleSheet.create({
  cadre: { paddingHorizontal: POINT, paddingTop: 2, paddingBottom: 8, alignSelf: 'stretch' },
  cote: { alignSelf: 'center', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  piste: { height: POINT, justifyContent: 'center' },
  trait: { height: 3, borderRadius: 1.5 },
  point: {
    position: 'absolute',
    width: POINT,
    height: POINT,
    borderRadius: POINT / 2,
    borderWidth: 2,
    top: 0,
  },
  gauche: { left: -POINT / 2 },
  droite: { right: -POINT / 2 },
});
