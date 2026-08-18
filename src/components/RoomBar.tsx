/**
 * LE BANDEAU D'UNE PIÈCE — la nommer, la mesurer, la corriger.
 *
 * Un scan ne découpe pas toujours juste : il réunit une entrée et un séjour
 * qu'aucune porte ne sépare, ou coupe en deux une pièce en L. Ces gestes-là
 * — fusionner, scinder, retirer — se tiennent avec le nom et la hauteur
 * sous plafond : tout ce qui ne regarde QUE la pièce sélectionnée.
 *
 * PREMIÈRE VERSION : cinq boutons sur une ligne qui défile. Sur un
 * téléphone, le troisième était coupé en plein mot au bord de l'écran —
 * « Fusionner » tranché après le second n — et rien ne disait qu'il y en
 * avait d'autres derrière. Un bandeau qui défile sans le montrer, c'est un
 * bandeau qui cache.
 *
 * DÉSORMAIS : deux gestes tenus à la main, et les trois qui touchent à la
 * STRUCTURE du plan derrière un « … ». Rien ne dépasse, rien ne défile, et
 * la ligne de mesures se lit d'un coup.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

const fr = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function RoomBar({
  room,
  surface,
  extent,
  hauteur,
  styles,
  onName,
  onHeight,
  onMore,
}: {
  room: { id: string; name: string };
  /** Surface au sol, quand le contour se referme. */
  surface: { area: number; exact: boolean } | null;
  /** Encombrement hors tout de la pièce. */
  extent: { width: number; depth: number };
  hauteur: number;
  styles: Record<string, object>;
  onName: () => void;
  onHeight: () => void;
  /** Fusionner, scinder, retirer : les gestes qui changent le plan. */
  onMore: () => void;
}) {
  return (
    <View style={styles.editBar}>
      <View style={styles.roomHead}>
        <Text style={styles.roomNom} numberOfLines={1}>
          {room.name || 'Pièce sans nom'}
        </Text>
        <Text style={styles.roomCotes} numberOfLines={1}>
          {surface
            ? `${surface.exact ? '' : '≈ '}${fr(surface.area)} m²  ·  ${fr(
                extent.width,
                2,
              )} × ${fr(extent.depth, 2)} m`
            : `${fr(extent.width, 2)} × ${fr(extent.depth, 2)} m`}
        </Text>
      </View>
      <View style={styles.roomActions}>
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
          <Text style={styles.roomActionText}>{`H ${fr(hauteur, 2)} m`}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.roomAction}
          accessibilityLabel="Autres gestes sur la pièce"
          onPress={onMore}>
          <Text style={styles.roomActionText}>…</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
