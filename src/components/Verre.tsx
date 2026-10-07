import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { RoomScanVerre } from 'react-native-room-scan';
import { useTheme } from '../theme';

/**
 * LE VERRE — ce qui se pose sur une image sans la cacher.
 *
 * Relevé du patron : « un effet "glass" transparent pour juste montrer que
 * l'on peut avancer et tourner, sans gêner la vision ». Sur l'iPhone, c'est
 * la matière translucide d'iOS (`RoomScanVerre`, un `UIVisualEffectView`) :
 * floutée, teintée par le mode clair ou sombre, celle des commandes de
 * Plans et de l'appareil photo. Sans le natif (banc d'essai), un voile
 * clair tient lieu — le dessin ne change pas, seule la matière.
 *
 *   `epais` : plus couvrant, pour un texte qui doit rester lisible sur un
 *             fond chargé ; sinon le plus fin.
 */
export function Verre({
  style,
  epais = false,
  children,
  ...reste
}: ViewProps & { style?: StyleProp<ViewStyle>; epais?: boolean; children?: React.ReactNode }) {
  const c = useTheme();
  if (RoomScanVerre) {
    return (
      <RoomScanVerre style={style} epais={epais} {...reste}>
        {children}
      </RoomScanVerre>
    );
  }
  return (
    <View style={[style, { backgroundColor: c.surfaceVoile }]} {...reste}>
      {children}
    </View>
  );
}
