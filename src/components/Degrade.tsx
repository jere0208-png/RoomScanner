/**
 * UN DÉGRADÉ QUI REMPLIT SON BLOC, EN FOND.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Un dégradé qui remplit son bloc, en fond.
 *
 * MESURÉ, PAS EN POURCENTAGE — relevé du patron, capture à l'appui : le
 * fond du score et des deux boutons s'arrêtait avant leur bord droit, le
 * texte « Réalité augmentée » débordait sur du blanc. Un `Svg` à « 100 % »
 * prend la taille qu'il a lue au premier passage — pendant l'entrée animée
 * de la carte — et ne la reprend pas. On mesure le bloc, on dessine à sa
 * taille en points, et sa couleur d'arrivée le remplit en attendant.
 */
export function Degrade({ id, de, a }: { id: string; de: string; a: string }) {
  const [taille, setTaille] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: a }]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!taille || Math.abs(taille.w - width) > 0.5 || Math.abs(taille.h - height) > 0.5) setTaille({ w: width, h: height });
      }}>
      {taille && (
        <Svg width={taille.w} height={taille.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={de} />
              <Stop offset="1" stopColor={a} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={taille.w} height={taille.h} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}
