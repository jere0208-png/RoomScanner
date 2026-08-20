/**
 * LE RETOUR AU GLISSEMENT — le geste de Safari, partout où vit la flèche.
 *
 * Relevé du patron : « un glissement de gauche vers la droite doit faire
 * revenir en arrière, comme sur les apps modernes ». Une bande invisible
 * de vingt points longe le bord GAUCHE de l'écran : un doigt qui y pose et
 * tire franchement vers la droite déclenche le même retour que la flèche.
 *
 * La bande est étroite à dessein : elle ne vole le toucher qu'au ras du
 * bord — là où aucun bouton ne vit — et le reste de l'écran ne change pas.
 * Le seuil est FRANC (soixante points, plus horizontal que vertical) : un
 * doigt qui hésite ou qui défile ne déclenche rien.
 */
import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

/** Le glissement vaut-il retour ? Franc, et plus horizontal que vertical. */
export function estUnRetour(dx: number, dy: number): boolean {
  return dx > 60 && Math.abs(dy) < Math.abs(dx);
}

export function RetourGlisse({ onRetour }: { onRetour: () => void }) {
  // La référence vive : le responder est créé une fois, le geste du jour
  // appelle toujours le retour du jour.
  const vif = useRef(onRetour);
  vif.current = onRetour;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) =>
          g.dx > 8 && Math.abs(g.dy) < Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          if (estUnRetour(g.dx, g.dy)) vif.current();
        },
      }),
    [],
  );
  return <View {...pan.panHandlers} style={styles.bord} />;
}

const styles = StyleSheet.create({
  bord: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
    zIndex: 40,
  },
});
