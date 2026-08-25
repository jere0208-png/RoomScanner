/**
 * LE BANDEAU DU BAS — ce qu'on a touché, et ce qu'on peut en faire.
 *
 * Un mur, une menuiserie, une note, une ligne de spots : tous se règlent
 * pareil, et ils partagent donc cette coquille. Elle vit au pied du plan —
 * en haut, elle mangeait le dessin qu'on est justement en train de regarder.
 *
 * DEUX PARTIES, JAMAIS UNE LIGNE. Relevé du patron, capture à l'appui :
 * « 3 spots · Pièce 1 · … » et quatre pastilles rognées par le bord.
 * « Toujours les boutons sont coupés et le texte aussi. Fais en 2 parties,
 * avec le texte au-dessus et les boutons en dessous. »
 *
 * Le défaut venait de la forme même. Une seule ligne devait porter la cote,
 * la précision et jusqu'à quatre boutons, sur trois cent trente points
 * d'écran utile : tout y était en `flexShrink`, chacun cédait un peu, donc
 * tout était coupé un peu — et le premier sacrifié était le chiffre qu'on
 * venait lire.
 *
 * En haut ce qu'on lit, en bas ce qu'on touche. Le texte ne cède plus, les
 * boutons ont la taille d'un doigt, et la rangée passe à la ligne plutôt que
 * de serrer.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { DEBORD_DOIGT } from '../ui/bandeau';

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
  /**
   * Une silhouette Solar à la place (ou à côté) du mot. Avec `sansMot`,
   * l'icône parle seule et le mot vit dans l'étiquette d'accessibilité.
   */
  icone?: string;
  sansMot?: boolean;
}

/**
 * Le crayon, la silhouette « Solar Bold » du jeu commun (solaires.ts).
 * Un caractère « ✏️ » serait un emoji couleur qui ignore la teinte du
 * bouton : la leçon du soleil du thème.
 */
function Crayon({ teinte }: { teinte: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d={SOLAIRES.crayon} fill={teinte} fillRule="evenodd" />
    </Svg>
  );
}

/**
 * LA SILHOUETTE DE CE QU'ON A TOUCHÉ, devant la cote du bandeau.
 *
 * Relevé du patron : le bandeau est « trop simple » — « fais le filet et
 * icône ». Le titre est une cote, et rien ne disait à quoi elle appartient
 * sinon le mot en gris dessous, qu'il faut lire.
 *
 * Partagée par les quatre coquilles du bas — mur et menuiserie (`StripBar`),
 * pièce (`RoomBar`), meuble (`ObjectBar`), appareil de plafond
 * (`CeilingBar`) : une seule d'entre elles restée sans silhouette se serait
 * lue comme un bandeau d'un autre écran.
 *
 * Elle prend l'encre douce du sous-titre : elle accompagne la cote, elle ne
 * lui dispute pas le regard. Et rien ne se dessine sans tracé donné — une
 * silhouette par défaut mentirait sur ce qui est sélectionné.
 */
export function IconeBandeau({
  icone,
  styles,
}: {
  icone?: string;
  styles: Record<string, object>;
}) {
  if (!icone) return null;
  const teinte =
    (StyleSheet.flatten(styles.bandeauSous as never) as { color?: string })
      ?.color ?? '#5A6472';
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d={icone} fill={teinte} fillRule="evenodd" />
    </Svg>
  );
}

export function StripBar({
  strong,
  note,
  actions,
  icone,
  styles,
}: {
  /** La cote, en gras : c'est elle qu'on vient lire. */
  strong: string;
  /** Ce que c'est, en gris — « porte », « m sous plafond ». */
  note: string;
  actions: StripAction[];
  /**
   * LA SILHOUETTE DE CE QU'ON A TOUCHÉ, devant la cote.
   *
   * Relevé du patron : le bandeau est « trop simple » — « fais le filet et
   * icône ». Le titre est une cote, et rien ne disait à quoi elle
   * appartient sinon le mot en gris dessous, qu'il faut lire. Un tracé du
   * jeu commun (`solaires.ts`), comme dans la rangée d'outils.
   *
   * Facultative : un bandeau qui n'en donne pas n'en dessine pas. Une
   * silhouette par défaut mentirait sur ce qui est sélectionné.
   */
  icone?: string;
  styles: Record<string, object>;
}) {

  return (
    <View style={styles.bandeau}>
      {/*
        PARTIE HAUTE : CE QU'ON A TOUCHÉ.

        Deux textes, deux lignes. Ils vivaient dans la MÊME ligne que les
        boutons, et c'est la ligne entière qui était rognée : « 1,38 × 2,04 m
        · porte » n'entrant pas, on lisait « 1,38 × 2,… ». Le seul chiffre
        qu'on venait chercher était le premier sacrifié.

        La valeur tient sa ligne, la précision la sienne — et celle-ci a
        droit à deux lignes, parce qu'« un retour · 2,49 m sous plafond » ne
        doit pas se couper au milieu d'un mot.
      */}
      <View style={styles.bandeauEntete}>
        <IconeBandeau icone={icone} styles={styles} />
        <View style={styles.bandeauTexte}>
          <Text style={styles.bandeauTitre} numberOfLines={1}>
            {strong}
          </Text>
          <Text style={styles.bandeauSous} numberOfLines={2}>
            {note}
          </Text>
        </View>
      </View>

      {/* PARTIE BASSE : CE QU'ON PEUT EN FAIRE. */}
      <View style={styles.bandeauActions}>
        {actions.map((a) => {
          const texte = a.ghost
            ? styles.bandeauBtnGhostTexte
            : styles.bandeauBtnTexte;
          // Le crayon prend la couleur du mot qu'il précède : un seul style
          // à changer si le bouton change de peau.
          const teinte =
            (StyleSheet.flatten(texte) as { color?: string })?.color ??
            '#FFFFFF';
          const bouton = (
            <TouchableOpacity
              key={a.label}
              style={[
                a.ghost ? styles.bandeauBtnGhost : styles.bandeauBtn,
                // Une icône seule tient dans un carré : le mot n'est pas là
                // pour lui donner sa largeur — il se lit dessous.
                a.sansMot && styles.bandeauBtnIcone,
              ]}
              accessibilityLabel={a.label}
              /* Quarante points dessinés, quarante-huit sous le doigt. */
              hitSlop={DEBORD_DOIGT}
              onPress={a.onPress}>
              {a.crayon && <Crayon teinte={teinte} />}
              {a.icone && (
                <Svg width={17} height={17} viewBox="0 0 24 24">
                  <Path d={a.icone} fill={teinte} fillRule="evenodd" />
                </Svg>
              )}
              {!a.sansMot && (
                <Text style={texte} numberOfLines={1}>
                  {a.label}
                </Text>
              )}
            </TouchableOpacity>
          );
          /*
            LE MOT SOUS LA PASTILLE — relevé du patron : « on doit comprendre
            ce que chaque bouton fait ». Une icône seule ne se comprend qu'en
            l'essayant ; le mot se lit en retrait, comme le peigne
            « Afficher ».
          */
          if (!a.sansMot) return bouton;
          return (
            <View key={a.label} style={styles.bandeauCellule}>
              {bouton}
              <Text style={styles.bandeauMot} numberOfLines={1}>
                {a.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
