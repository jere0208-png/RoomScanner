/**
 * LE BANDEAU D'UNE PIÈCE — la nommer, la mesurer, la corriger.
 *
 * Un scan ne découpe pas toujours juste : il réunit une entrée et un séjour
 * qu'aucune porte ne sépare, ou coupe en deux une pièce en L. Ces deux
 * gestes-là — fusionner, scinder — ne se devinent pas dans un menu ; ils se
 * tiennent avec le nom et la hauteur sous plafond, c'est-à-dire avec tout ce
 * qui ne regarde QUE la pièce sélectionnée.
 *
 * Les cinq tiennent sur une ligne qui défile : à cinq boutons sur un
 * téléphone étroit, le dernier tomberait sinon hors de l'écran.
 */
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const fr = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function RoomBar({
  room,
  surface,
  extent,
  hauteur,
  voisines,
  styles,
  onName,
  onHeight,
  onMerge,
  onSplit,
  onRemove,
}: {
  room: { id: string; name: string };
  /** Surface au sol, quand le contour se referme. */
  surface: { area: number; exact: boolean } | null;
  /** Encombrement hors tout de la pièce. */
  extent: { width: number; depth: number };
  hauteur: number;
  /** Combien d'autres pièces : sans voisine, on ne fusionne ni ne retire. */
  voisines: number;
  styles: Record<string, object>;
  onName: () => void;
  onHeight: () => void;
  onMerge: () => void;
  onSplit: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.editBar}>
      <Text style={styles.editLabel}>
        {room.name || 'Pièce sans nom'}
        {surface
          ? ` · ${surface.exact ? '' : '≈ '}${fr(surface.area)} m² · ${fr(
              extent.width,
              2,
            )} × ${fr(extent.depth, 2)} m`
          : ''}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={styles.applyButton}
          accessibilityLabel="Nommer la pièce"
          onPress={onName}>
          <Text style={styles.applyText}>Nommer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.roomAction}
          accessibilityLabel="Hauteur sous plafond"
          onPress={onHeight}>
          <Text style={styles.roomActionText}>Hauteur {fr(hauteur, 2)} m</Text>
        </TouchableOpacity>
        {voisines > 0 && (
          <TouchableOpacity
            style={styles.roomAction}
            accessibilityLabel="Fusionner avec une autre pièce"
            onPress={onMerge}>
            <Text style={styles.roomActionText}>Fusionner</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.roomAction}
          accessibilityLabel="Scinder la pièce"
          onPress={onSplit}>
          <Text style={styles.roomActionText}>Scinder</Text>
        </TouchableOpacity>
        {voisines > 0 && (
          <TouchableOpacity
            style={styles.removeRoomButton}
            accessibilityLabel="Retirer la pièce"
            onPress={onRemove}>
            <Text style={styles.removeRoomText}>Retirer</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
