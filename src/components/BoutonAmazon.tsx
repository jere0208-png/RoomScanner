/**
 * « VOIR SUR AMAZON » — et seulement quand ça vaut le détour.
 *
 * Relevé du patron : « pour les mêmes produits, tu recherches sur Amazon le
 * produit et tu fais un bouton qui affiche le prix et "Voir sur Amazon" avec le
 * logo Amazon présent sur le bouton, à chaque produit où le prix est équivalent
 * ou inférieur à celui qu'on indique en grande surface ».
 *
 * QUAND IL APPARAÎT, ET QUAND IL N'APPARAÎT PAS : ce n'est pas ce composant qui
 * décide, c'est `offreAmazon` (voir `magasin.ts`), et pour une raison de fond —
 * la règle « on n'a pas le droit à l'erreur » se tient dans les DONNÉES, pas
 * dans le dessin. Un bouton qui déciderait lui-même finirait par s'afficher
 * sur un produit qu'on n'a pas vérifié.
 *
 * LE LOGO EST REDESSINÉ, PAS COPIÉ — la flèche sourire qui va du « a » au
 * « z », comme sur la marque : c'est ce qui rend le bouton reconnaissable
 * d'un coup d'œil, et c'est ce que le patron a demandé. Il est dessiné au
 * trait, dans la couleur de la marque, à la taille du texte.
 *
 * ATTENTION, ET C'EST DIT AU PATRON : la flèche d'Amazon est une marque
 * déposée. L'usage nominatif — « voir ce produit sur Amazon » — est l'usage
 * ordinaire d'un lien marchand, mais Amazon encadre l'emploi de ses logos et
 * demande normalement de passer par son programme partenaire. C'est prévu :
 * la balise partenaire a sa place réservée dans `magasin.ts`.
 */
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { lienAmazon, type Offre } from '../geometry/magasin';
import { fr } from '../screens/result/format';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/** L'orange d'Amazon. */
const ORANGE = '#FF9900';

/**
 * LA FLÈCHE SOURIRE, redessinée.
 *
 * Un arc qui part sous le premier signe et remonte vers le dernier, avec sa
 * pointe relevée. C'est le seul élément qui fait reconnaître la marque sans
 * lire, et c'est pour cela qu'il est là plutôt qu'un simple mot.
 */
function FlecheAmazon({ taille }: { taille: number }) {
  return (
    <Svg width={taille} height={taille * 0.42} viewBox="0 0 40 17">
      <Path
        d="M2 11.2C8.5 15.4 16.5 16.6 23.5 15.2c2.6-.5 5.2-1.5 7.4-2.8"
        stroke={ORANGE}
        strokeWidth={2.8}
        strokeLinecap="round"
        fill="none"
      />
      {/*
        LA POINTE SUIT LA TANGENTE DE L'ARC, et il a fallu trois essais pour
        la trouver : regardée en image, la première version pointait vers le
        haut à angle droit — on lisait un chevron posé sur un trait, pas une
        flèche. Elle part maintenant DANS le prolongement du geste.
      */}
      <Path d="M28.6 8.6 L37 9.4 L31.2 15.4 Z" fill={ORANGE} />
    </Svg>
  );
}

export function BoutonAmazon({
  offre,
  /** Le prix de la grande surface, pour dire ce qu'on économise. */
  reference,
}: {
  offre: Offre;
  reference: number;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const gain = reference - offre.prix;
  /*
    « ÉQUIVALENT » N'EST PAS « MOINS CHER », et le bouton ne doit pas le
    laisser croire. Sous un centime d'écart, on dit « même prix » : annoncer
    « économisez 0,00 € » ferait douter de tous les autres chiffres.
  */
  const mot = gain >= 0.01 ? `− ${fr(gain, 2)} €` : 'même prix';

  const ouvrir = () => {
    if (!offre.asin) return;
    // Un lien qui ne s'ouvre pas ne casse rien : on reste sur le magasin.
    Linking.openURL(lienAmazon(offre.asin)).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={styles.bouton}
      accessibilityRole="link"
      accessibilityLabel={`Voir sur Amazon, ${fr(offre.prix, 2)} euros, ${
        gain >= 0.01 ? `${fr(gain, 2)} euros de moins` : 'même prix'
      }`}
      activeOpacity={0.75}
      onPress={ouvrir}>
      <FlecheAmazon taille={26} />
      <View style={styles.texte}>
        <Text style={styles.titre}>Voir sur Amazon</Text>
        {/*
          LE PRIX D'ABORD, L'ÉCART ENSUITE. C'est le prix qu'on compare, et
          c'est lui que le patron a demandé sur le bouton ; l'écart n'est là
          que pour dire s'il vaut la peine de changer de magasin.
        */}
        <Text style={styles.prix}>
          {`${fr(offre.prix, 2)} €`}
          <Text style={styles.gain}>{`  ${mot}`}</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    bouton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: ORANGE,
      /* Le fond reste celui de la page : un aplat orange ferait de ce lien
         le bouton le plus fort de l'écran, alors que l'action principale
         reste d'ajouter au devis. */
      backgroundColor: c.surface,
    },
    texte: { flex: 1 },
    titre: { fontSize: 13, fontWeight: '700', color: c.ink },
    prix: { fontSize: 12, color: c.inkSoft, marginTop: 1 },
    gain: { color: ORANGE, fontWeight: '700' },
  }),
);
