/**
 * LA VIGNETTE D'UN ARTICLE — sa photo, ou son nom.
 *
 * Relevé du patron : « donne des images à chaque élément du magasin aussi, et
 * si pas dispo marque sur l'image (par exemple si le Alim LED 24V est pas
 * dispo, on marque son nom proprement) ».
 *
 * TRENTE ARTICLES SUR CENT SEIZE ONT UNE PHOTO. Le catalogue d'images couvre
 * l'appareillage et le tableau ; les consommables, les courants faibles et
 * l'outillage n'en ont pas. Sans repli, quatre-vingt-six lignes montreraient
 * un trou — et un trou, dans une liste, se lit comme une panne.
 *
 * POURQUOI ON NE RENVOIE PAS UNE PHOTO VOISINE. La maison le fait pourtant
 * déjà : « une prise 16, une 20 et une 32 sont le MÊME objet sur le mur », une
 * seule photo pour les trois. Ça marche parce qu'un socle ne porte pas son
 * calibre écrit dessus. Un disjoncteur, si : la photo du 16 A posée sur la
 * ligne du 6 A dirait « 16 » à côté d'un libellé qui dit 6. **Une vignette qui
 * contredit sa ligne est pire qu'une vignette absente** — c'est la règle des
 * prix appliquée aux images : ce qu'on ne peut pas montrer honnêtement, on
 * l'écrit.
 *
 * ET « PROPREMENT » VEUT DIRE QUELQUE CHOSE. Mesuré : dans une pastille de
 * quarante-quatre points, un corps de 8 tient huit à neuf signes par ligne —
 * et « Alimentation » en fait douze. Rendu tel quel, le mot se casse en deux
 * ou déborde ; les deux se lisent comme un défaut d'affichage.
 *
 * ON NE ROGNE PAS LE NOM À LA MAIN — une estimation de largeur se tromperait
 * de police, et la maison a déjà payé deux centièmes d'em pour l'apprendre.
 * On demande au rendu de RÉDUIRE le corps jusqu'à ce que le nom entier tienne
 * (`adjustsFontSizeToFit`), avec un plancher : en dessous de six dixièmes, on
 * ne lit plus, et la coupure à la fin reprend la main. Le nom complet est de
 * toute façon écrit en grand juste à côté — la pastille sert à reconnaître,
 * pas à lire.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { photoDe } from '../ui/produits';
import { themedStyles, useTheme, type Palette } from '../theme';

export function VignetteProduit({
  code,
  libelle,
  taille = 44,
}: {
  code: string;
  libelle: string;
  /** Côté de la vignette, en points. Le ticket et le magasin n'ont pas la
      même place ; la règle, elle, est la même. */
  taille?: number;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const photo = photoDe(code);
  const cadre = { width: taille, height: taille };
  if (photo) {
    return (
      <View testID={`vignette-${code}`} style={cadre}>
        <Image source={photo} style={cadre} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View testID={`vignette-${code}`} style={[styles.pastille, cadre]}>
      <Text
        style={styles.nom}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        ellipsizeMode="tail"
        /* Le nom est déjà lu à côté, en grand : la vignette n'a pas à le
           répéter à la synthèse vocale. */
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {libelle}
      </Text>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    /*
      UNE PASTILLE NEUTRE, et pas une teinte par rayon : huit couleurs
      inventées pour huit rayons donneraient un code visuel de plus à
      apprendre, alors que le rayon est déjà écrit en tête de section.
    */
    pastille: {
      borderRadius: 8,
      backgroundColor: c.surfaceSunken,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    nom: {
      color: c.inkSoft,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '800',
      textAlign: 'center',
    },
  }),
);
