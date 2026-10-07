/**
 * LA SCÈNE — l'entrée d'un écran, à la façon d'iOS.
 *
 * Relevé du patron : « un style plus "Apple like", pur avec des mouvements
 * fluides de motion design ». Les écrans se remplaçaient d'une coupe sèche :
 * on touchait « Profil », et la page était là, sans que rien ne l'ait
 * amenée. C'est ce qui fait « fébrile » plus que tout le reste — une
 * application dont les pages apparaissent n'a pas de profondeur.
 *
 * Deux entrées, et aucune sortie à attendre :
 *
 *   poussée : la page vient de la droite (36 points) en s'allumant — c'est
 *             la pile de navigation d'iOS, celle qu'un pouce connaît, et le
 *             bord gauche la ramène (voir `RetourGlisse`) ;
 *   fondu   : la page s'allume en grandissant d'un rien (0,98 → 1) — pour
 *             l'accueil et le plan, qui ne sont pas « sous » une autre page.
 *
 * Un ressort, pas une minuterie, et le pilote natif : soixante images par
 * seconde sans toucher au fil JavaScript. La caméra et le scan ne passent
 * pas par ici : on les veut à l'image même.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

export type EntreeDeScene = 'poussee' | 'fondu';

/** D'où vient une page poussée, en points. */
export const RECUL_POUSSEE = 36;

export function Scene({
  entree,
  children,
}: {
  entree: EntreeDeScene;
  children: React.ReactNode;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(t, {
      toValue: 1,
      damping: 20,
      stiffness: 190,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [t]);
  const style =
    entree === 'poussee'
      ? {
          opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [RECUL_POUSSEE, 0] }) }],
        }
      : {
          opacity: t,
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
        };
  return (
    <Animated.View style={[styles.scene, style]} testID={`scene-${entree}`}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1 },
});
