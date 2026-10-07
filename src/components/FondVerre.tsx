import React from 'react';
import { StyleSheet } from 'react-native';
import { Verre } from './Verre';
import { useTheme } from '../theme';

/**
 * LE FOND DE VERRE — glissé sous le contenu d'un bouton qui flotte.
 *
 * Relevé du patron : « même verre sur ce qui flotte au-dessus du plan ». Les
 * boutons ronds des barres et les pastilles posées sur le plan étaient des
 * disques blancs à ombre portée : la matière d'il y a dix ans. iOS les fait
 * en verre — celui des barres de Plans, de Musique, de l'appareil photo.
 *
 * Le bouton garde sa forme, son contour, son contenu ; on lui retire son
 * fond blanc et son ombre, et ce fond-ci se glisse dessous, au même rayon,
 * sans prendre le doigt. Un bouton actif qui se peint en bleu plein le
 * recouvre simplement : le verre ne se voit que là où il doit.
 *
 * UN FILET AU BORD. Sur le fond clair et uni des barres, un verre
 * ultra-fin n'a rien à flouter : sans bord, le disque disparaîtrait dans la
 * page. iOS borde ses contrôles de verre d'un filet d'un demi-point ; on
 * fait pareil, à la couleur des lignes du thème.
 */
export function FondVerre({ rayon, epais = false }: { rayon: number; epais?: boolean }) {
  const c = useTheme();
  return (
    <Verre
      pointerEvents="none"
      epais={epais}
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: rayon,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.lineStrong,
        },
      ]}
    />
  );
}
