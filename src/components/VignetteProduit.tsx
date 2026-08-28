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
import Svg, { Circle, Path } from 'react-native-svg';
import { photoDe } from '../ui/produits';
import { WIRE_COLORS, roleDuFil } from '../geometry/schema';
import { themedStyles, useTheme, type Palette } from '../theme';

/**
 * UNE COURONNE DE FIL, DANS LA COULEUR DE SON CONDUCTEUR.
 *
 * Relevé du patron : « la couleur des fils en image doit changer sur le devis,
 * on a que du bleu partout là ».
 *
 * POURQUOI TOUT ÉTAIT BLEU. Le bordereau distingue les conducteurs par leur
 * RÔLE — `fil-1.5-phase`, `fil-1.5-terre` —, mais la vignette retombait sur la
 * SECTION (`fil-1.5`) et servait la même photo à tous : une bobine bleue, pour
 * la phase comme pour la terre. Le ticket alignait quatre lignes qui ne
 * différaient que par leur libellé, là où la couleur est justement ce qu'on
 * regarde en rayon.
 *
 * ON NE VA PAS CHERCHER QUATRE PHOTOS PAR SECTION. Les couleurs de conducteur
 * sont NORMÉES et l'application les connaît déjà : `WIRE_COLORS`, la table que
 * lisent le schéma unifilaire et le tracé des fils. La couronne se DESSINE dans
 * cette teinte-là. Une cinquième table de couleurs de fil, ce serait un plan
 * qui dit rouge devant un ticket qui montre bleu.
 *
 * ET C'EST UNE COURONNE, PAS UNE BOBINE : un anneau épais, deux spires plus
 * claires par-dessus. C'est ce qu'on prend en rayon et ce que le devis compte —
 * l'unité de la ligne dit « cour. 100 m ».
 */
function CouronneDeFil({ role, taille }: { role: keyof typeof WIRE_COLORS; taille: number }) {
  const teinte = WIRE_COLORS[role].color;
  const r = taille * 0.34;
  const c = taille / 2;
  return (
    <Svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}>
      <Circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={teinte}
        strokeWidth={taille * 0.19}
      />
      {/* Deux spires, en clair : c'est ce qui fait lire un enroulement plutôt
          qu'un simple anneau de couleur. */}
      <Path
        d={`M${c - r} ${c} A${r} ${r} 0 0 1 ${c} ${c - r}`}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.55}
        strokeWidth={taille * 0.05}
        strokeLinecap="round"
      />
      <Path
        d={`M${c + r} ${c} A${r} ${r} 0 0 1 ${c} ${c + r}`}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.4}
        strokeWidth={taille * 0.05}
        strokeLinecap="round"
      />
    </Svg>
  );
}

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
  /*
    LE CONDUCTEUR PASSE AVANT LA PHOTO — c'est le seul article dont l'image
    dépend d'autre chose que de son code de produit. Sans ce détour, le repli
    sur la section reprendrait la main et rendrait la bobine bleue.
  */
  const role = roleDuFil(code);
  const cadre = { width: taille, height: taille };
  if (role) {
    return (
      <View testID={`vignette-${code}`} style={cadre}>
        <CouronneDeFil role={role} taille={taille} />
      </View>
    );
  }
  const photo = photoDe(code);
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
