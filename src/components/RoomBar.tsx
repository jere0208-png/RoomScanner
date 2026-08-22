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
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';

/** Le crayon : le même signe que partout, « ça s'édite ». */
function Crayon({ teinte }: { teinte: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d={SOLAIRES.crayon} fill={teinte} fillRule="evenodd" />
    </Svg>
  );
}

const fr = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function RoomBar({
  room,
  surface,
  extent,
  hauteur,
  styles,
  onName,
  onCotes,
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
  /** Repose la pièce à ses cotes. Absent sur un contour non rectangulaire. */
  onCotes?: () => void;
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
        {/*
          LES COTES S'ÉDITENT — quand la pièce est un rectangle.

          Elles s'affichaient à côté d'une hauteur, elle, éditable d'un
          appui : on posait un « Séjour 5,00 × 4,00 » depuis le catalogue,
          le mètre donnait 5,18, et il fallait déplacer QUATRE murs à la
          main pour dix-huit centimètres. Le crayon dit que ça se touche,
          comme partout ailleurs.

          Sur un contour libre, rien ne se touche : « largeur × profondeur »
          n'y a pas de réponse unique, et un bouton qui ne fait rien est
          pire qu'un bouton absent.
        */}
        <TouchableOpacity
          disabled={!onCotes}
          accessibilityLabel={onCotes ? 'Cotes de la pièce' : undefined}
          onPress={onCotes}
          style={stylesLocaux.ligne}>
          <Text style={styles.roomCotes} numberOfLines={1}>
            {surface
              ? `${surface.exact ? '' : '≈ '}${fr(surface.area)} m²  ·  ${fr(
                  extent.width,
                  2,
                )} × ${fr(extent.depth, 2)} m`
              : `${fr(extent.width, 2)} × ${fr(extent.depth, 2)} m`}
          </Text>
          {!!onCotes && <Crayon teinte={teinteDuCrayon(styles)} />}
        </TouchableOpacity>
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

/** La teinte du crayon : celle du texte qu'il accompagne. */
function teinteDuCrayon(styles: Record<string, object>): string {
  const st = StyleSheet.flatten(styles.roomCotes) as { color?: string };
  return st?.color ?? '#5A6472';
}

const stylesLocaux = StyleSheet.create({
  /* Les cotes et leur crayon sur une ligne : le signe est À CÔTÉ du mot
     qu'il qualifie, pas perdu au bout de la barre. */
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
