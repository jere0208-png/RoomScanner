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
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export interface StripAction {
  label: string;
  onPress: () => void;
  /** Second rôle : contour discret plutôt qu'aplat plein. */
  ghost?: boolean;
  /**
   * Le crayon devant le mot : il dit « ça s'édite » là où le mot seul ne
   * suffit pas — « Mesures » sans lui se lirait comme une simple lecture.
   */
  crayon?: boolean;
}

/**
 * Le crayon, TRACÉ dans la main du jeu d'icônes — bouts ronds, 2,4
 * d'épaisseur. Un caractère « ✏️ » serait un emoji couleur qui ignore la
 * teinte du bouton : la leçon du soleil du thème.
 */
function Crayon({ teinte }: { teinte: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path
        d="M16.6 3.9a2.15 2.15 0 0 1 3.5 2.4 2.15 2.15 0 0 1-.5.7L7.9 18.7 3.4 20l1.3-4.5L16.4 3.8"
        stroke={teinte}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
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
      {/*
        LA COTE NE SE TRONQUE JAMAIS.

        Les deux textes vivaient dans une seule ligne, et c'est la LIGNE
        entière qui était rognée : « 1,38 × 2,04 m · porte » n'entrant pas,
        on lisait « 1,38 × 2,... ». Le seul chiffre qu'on venait chercher
        était le premier sacrifié — un bandeau de cotes qui cache la cote.

        Ils sont donc séparés : la valeur garde toute sa place
        (`flexShrink: 0`), et c'est la précision en gris, dont on se passe,
        qui s'efface en premier quand la largeur manque.
      */}
      <Text style={styles.wallStripStrong} numberOfLines={1}>
        {strong}
      </Text>
      <Text style={styles.wallStripText} numberOfLines={1}>
        {`  ·  ${note}`}
      </Text>
      {actions.map((a) => {
        const texte = a.ghost
          ? styles.wallStripGhostText
          : styles.wallStripActionText;
        // Le crayon prend la couleur du mot qu'il précède : un seul style
        // à changer si le bouton change de peau.
        const teinte =
          (StyleSheet.flatten(texte) as { color?: string })?.color ??
          '#FFFFFF';
        return (
          <TouchableOpacity
            key={a.label}
            style={[
              a.ghost ? styles.wallStripGhost : styles.wallStripAction,
              a.crayon && stylesLocaux.avecCrayon,
            ]}
            accessibilityLabel={a.label}
            onPress={a.onPress}>
            {a.crayon && <Crayon teinte={teinte} />}
            <Text style={texte}>{a.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const stylesLocaux = StyleSheet.create({
  avecCrayon: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
