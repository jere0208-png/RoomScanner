/**
 * LE BANDEAU D'UNE LIGNE — ce qu'on a touché, et ce qu'on peut en faire.
 *
 * Un mur et une menuiserie se règlent pareil : une cote lue en gras, une
 * précision en gris, et un ou deux boutons pour changer la valeur. Les deux
 * bandeaux étaient écrits deux fois dans l'écran, à quinze lignes d'écart —
 * même coquille, mêmes styles, mêmes marges à retoucher en double.
 *
 * Il tient sur UNE ligne, au pied du plan : en haut, il mangeait le dessin
 * qu'on est justement en train de regarder.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export interface StripAction {
  label: string;
  onPress: () => void;
  /** Second rôle : contour discret plutôt qu'aplat plein. */
  ghost?: boolean;
}

export function StripBar({
  strong,
  note,
  actions,
  styles,
}: {
  /** La cote, en gras : c'est elle qu'on vient lire. */
  strong: string;
  /** Ce que c'est, en gris — « porte », « m sous plafond ». */
  note: string;
  actions: StripAction[];
  styles: Record<string, object>;
}) {
  return (
    <View style={styles.wallStrip}>
      <Text style={styles.wallStripText} numberOfLines={1}>
        <Text style={styles.wallStripStrong}>{strong}</Text>
        {`  ·  ${note}`}
      </Text>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          style={a.ghost ? styles.wallStripGhost : styles.wallStripAction}
          accessibilityLabel={a.label}
          onPress={a.onPress}>
          <Text
            style={a.ghost ? styles.wallStripGhostText : styles.wallStripActionText}>
            {a.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
