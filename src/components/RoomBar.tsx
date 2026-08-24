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
 * avait d'autres derrière.
 *
 * DEUXIÈME : deux gestes tenus à la main, et les trois qui touchent à la
 * STRUCTURE du plan derrière un « … ».
 *
 * TROISIÈME, celle-ci — la forme commune à tous les bandeaux du bas (voir
 * `bandeau` dans les styles) : en haut ce qu'on LIT, en bas ce qu'on TOUCHE.
 * Les cotes se lisaient dans un bouton, à côté d'un crayon minuscule : elles
 * redeviennent du texte, et l'édition rejoint la rangée des actions, où l'on
 * cherche les gestes. Un mot dans une rangée de boutons se voit ; un crayon
 * de douze points au bout d'une ligne grise, non.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { DEBORD_DOIGT } from '../ui/bandeau';

/** Le crayon : le même signe que partout, « ça s'édite ». */
function Crayon({ teinte }: { teinte: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
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
  room: { id: string; name: string; neuve?: boolean };
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
  const teinteGhost =
    (StyleSheet.flatten(styles.bandeauBtnGhostTexte) as { color?: string })
      ?.color ?? '#5A6472';
  const mesures = surface
    ? `${surface.exact ? '' : '≈ '}${fr(surface.area)} m²  ·  ${fr(
        extent.width,
        2,
      )} × ${fr(extent.depth, 2)} m`
    : `${fr(extent.width, 2)} × ${fr(extent.depth, 2)} m`;

  return (
    <View style={styles.bandeau}>
      {/* EN HAUT : ce qu'on lit. Le nom, puis les mesures — deux lignes qui
          ne cèdent à personne. */}
      <View style={styles.bandeauTexte}>
        <Text style={styles.bandeauTitre} numberOfLines={1}>
          {room.name || 'Pièce sans nom'}
        </Text>
        <Text style={styles.bandeauSous} numberOfLines={2}>
          {mesures}
        </Text>
        {/*
          TANT QU'ELLE EST NEUVE, LA BARRE DIT CE QUI L'ATTEND.

          Relevé du patron sur le bouton d'ajout : « le "ajouter une pièce"
          ne montre pas qu'il faut créer la pièce ». La pièce se pose
          maintenant toute seule, en pointillés — reste à dire les deux
          gestes qui la règlent. Une phrase, sous ses cotes, qui disparaît
          dès qu'on la lâche : une consigne qu'on lit une fois ne doit pas
          rester à vie.
        */}
        {room.neuve && (
          <Text style={styles.roomNeuve} numberOfLines={1}>
            Poussez-la du doigt · tirez ses côtés
          </Text>
        )}
      </View>

      {/* EN BAS : ce qu'on touche. */}
      <View style={styles.bandeauActions}>
        <TouchableOpacity
          hitSlop={DEBORD_DOIGT}
          style={styles.bandeauBtn}
          accessibilityLabel="Nommer la pièce"
          onPress={onName}>
          <Text style={styles.bandeauBtnTexte}>Nommer</Text>
        </TouchableOpacity>
        {/*
          LES COTES S'ÉDITENT — quand la pièce est un rectangle.

          On pose un « Séjour 5,00 × 4,00 » depuis le catalogue, le mètre
          donne 5,18, et il fallait déplacer QUATRE murs à la main pour
          dix-huit centimètres. Sur un contour libre, en revanche,
          « largeur × profondeur » n'a pas de réponse unique : le bouton ne
          s'affiche pas, plutôt que de ne rien faire.
        */}
        {!!onCotes && (
          <TouchableOpacity
            hitSlop={DEBORD_DOIGT}
            style={styles.bandeauBtnGhost}
            accessibilityLabel="Cotes de la pièce"
            onPress={onCotes}>
            <Crayon teinte={teinteGhost} />
            <Text style={styles.bandeauBtnGhostTexte}>Cotes</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          hitSlop={DEBORD_DOIGT}
          style={styles.bandeauBtnGhost}
          accessibilityLabel="Hauteur sous plafond"
          onPress={onHeight}>
          <Text style={styles.bandeauBtnGhostTexte}>{`H ${fr(
            hauteur,
            2,
          )} m`}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={DEBORD_DOIGT}
          style={[styles.bandeauBtnGhost, styles.bandeauBtnIcone]}
          accessibilityLabel="Autres gestes sur la pièce"
          onPress={onMore}>
          <Text style={styles.bandeauBtnGhostTexte}>…</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
