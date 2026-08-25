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
import { IconeBandeau } from './StripBar';
import { DEBORD_DOIGT } from '../ui/bandeau';

const fr = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

/**
 * UNE PASTILLE DE BANDEAU : la silhouette, et le mot dessous.
 *
 * La même forme que sous une ligne de spots, un spot ou un meuble — le
 * bandeau d'une pièce était le dernier à n'avoir que des mots. Les teintes
 * viennent des styles communs (`bandeauIcone`), pour que les quatre
 * coquilles ne puissent plus diverger.
 */
function Geste({
  nom,
  mot,
  d,
  plein,
  danger,
  styles,
  onPress,
}: {
  nom: string;
  mot: string;
  d: string;
  plein?: boolean;
  danger?: boolean;
  styles: Record<string, object>;
  onPress: () => void;
}) {
  const teinte =
    (StyleSheet.flatten(
      (danger
        ? styles.bandeauIconeDanger
        : plein
        ? styles.bandeauIconePleine
        : styles.bandeauIcone) as never,
    ) as { color?: string })?.color ?? '#1F5BFF';
  return (
    <View style={styles.bandeauCellule}>
      <TouchableOpacity
        hitSlop={DEBORD_DOIGT}
        style={[
          plein ? styles.bandeauBtn : styles.bandeauBtnGhost,
          styles.bandeauBtnIcone,
        ]}
        accessibilityLabel={nom}
        onPress={onPress}>
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path d={d} fill={teinte} fillRule="evenodd" />
        </Svg>
      </TouchableOpacity>
      <Text style={styles.bandeauMot}>{mot}</Text>
    </View>
  );
}

export function RoomBar({
  room,
  surface,
  extent,
  hauteur,
  styles,
  onName,
  onCotes,
  onHeight,
  onDupliquer,
  onFusionner,
  onScinder,
  onRetirer,
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
  /**
   * LES GESTES QUI CHANGENT LE PLAN, chacun le sien.
   *
   * Ils vivaient derrière un « … » — le jumeau exact de celui qu'une
   * menuiserie portait, et qui est parti au relevé précédent : « mal placé,
   * peu compréhensible sans lire le texte ». Ils ont maintenant leur
   * pastille, leur silhouette et leur mot.
   *
   * CE QUI NE PEUT PAS ABOUTIR NE S'AFFICHE PAS : une pièce sans voisine ne
   * se fusionne avec rien, la dernière pièce d'un plan ne se retire pas.
   * L'écran le sait, le bandeau ne le devine pas — d'où deux gestes
   * facultatifs.
   */
  onDupliquer: () => void;
  onFusionner?: () => void;
  onScinder: () => void;
  onRetirer?: () => void;
}) {
  /*
    LA HAUTEUR SE LIT, ELLE NE SE TOUCHE PAS.

    Elle vivait DANS un bouton — « H 2,50 m » —, ce qui mélangeait les deux
    moitiés du bandeau : un bouton qui affiche une valeur se lit comme une
    étiquette, et l'on ne sait plus lequel des quatre fait quelque chose.
    Elle rejoint la surface et les dimensions, en haut, avec ce qu'on lit ;
    son bouton ne dit plus que le geste.
  */
  const mesures = `${
    surface
      ? `${surface.exact ? '' : '≈ '}${fr(surface.area)} m²  ·  ${fr(
          extent.width,
          2,
        )} × ${fr(extent.depth, 2)} m`
      : `${fr(extent.width, 2)} × ${fr(extent.depth, 2)} m`
  }  ·  H ${fr(hauteur, 2)} m`;

  return (
    <View style={styles.bandeau}>
      {/* EN HAUT : ce qu'on lit. Le nom, puis les mesures — deux lignes qui
          ne cèdent à personne. */}
      <View style={styles.bandeauEntete}>
        <IconeBandeau icone={SOLAIRES.room} styles={styles} />
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
      </View>

      {/* EN BAS : ce qu'on touche. Une pastille par geste, sa silhouette
          et son mot dessous — la forme commune à tous les bandeaux du bas. */}
      <View style={styles.bandeauActions}>
        <Geste
          nom="Nommer la pièce"
          mot="Nommer"
          d={SOLAIRES.crayon}
          plein
          styles={styles}
          onPress={onName}
        />
        {/*
          LES COTES S'ÉDITENT — quand la pièce est un rectangle.

          On pose un « Séjour 5,00 × 4,00 » depuis le catalogue, le mètre
          donne 5,18, et il fallait déplacer QUATRE murs à la main pour
          dix-huit centimètres. Sur un contour libre, en revanche,
          « largeur × profondeur » n'a pas de réponse unique : le bouton ne
          s'affiche pas, plutôt que de ne rien faire.
        */}
        {!!onCotes && (
          <Geste
            nom="Cotes de la pièce"
            mot="Cotes"
            d={SOLAIRES.cotes}
            styles={styles}
            onPress={onCotes}
          />
        )}
        <Geste
          nom="Hauteur sous plafond"
          mot="Hauteur"
          d={SOLAIRES.elevations}
          styles={styles}
          onPress={onHeight}
        />
        <Geste
          nom="Dupliquer la pièce"
          mot="Dupliquer"
          d={SOLAIRES.dupliquer}
          styles={styles}
          onPress={onDupliquer}
        />
        {!!onFusionner && (
          <Geste
            nom="Fusionner avec une autre pièce"
            mot="Fusionner"
            d={SOLAIRES.fusionner}
            styles={styles}
            onPress={onFusionner}
          />
        )}
        <Geste
          nom="Scinder la pièce"
          mot="Scinder"
          d={SOLAIRES.scinder}
          styles={styles}
          onPress={onScinder}
        />
        {!!onRetirer && (
          <Geste
            nom="Retirer la pièce"
            mot="Retirer"
            d={SOLAIRES.supprimer}
            danger
            styles={styles}
            onPress={onRetirer}
          />
        )}
      </View>
    </View>
  );
}
