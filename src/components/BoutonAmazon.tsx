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
 * LE LOGO EST CELUI DE LA MARQUE, PAS UN DESSIN — et c'est la deuxième
 * version de ce bouton.
 *
 * LA PREMIÈRE REDESSINAIT LA FLÈCHE SOURIRE au trait, en se disant qu'un arc
 * orange suffirait à faire reconnaître Amazon. Relevé du patron, sans appel :
 * « tu es sérieux avec ta flèche pour Amazon ? tiens l'image du logo ». Il
 * avait raison, et la leçon dépasse ce bouton : **une marque ne s'approxime
 * pas**. Un logo à peu près ressemblant ne se lit pas comme la marque, il se
 * lit comme une imitation — ce qui est pire que pas de logo du tout, sur un
 * bouton dont tout l'intérêt est qu'on le reconnaisse sans lire.
 *
 * C'EST DONC LE LOGOTYPE FOURNI, posé tel quel, aux trois densités
 * (`src/assets/amazon*.png`). On ne le retouche pas, on ne le recolore pas,
 * on ne l'étire pas : `resizeMode="contain"` garde ses proportions.
 *
 * ATTENTION, ET C'EST DIT AU PATRON : le logotype d'Amazon est une marque
 * déposée. L'usage nominatif — « voir ce produit sur Amazon » — est l'usage
 * ordinaire d'un lien marchand, mais Amazon encadre l'emploi de ses logos et
 * demande normalement de passer par son programme partenaire. C'est prévu :
 * la balise partenaire a sa place réservée dans `magasin.ts`.
 */
import React from 'react';
import {
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { lienAmazon, type Offre } from '../geometry/magasin';
import { fr } from '../screens/result/format';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/** L'orange d'Amazon. */
const ORANGE = '#FF9900';

/**
 * LA TAILLE DU LOGOTYPE SUR LE BOUTON.
 *
 * Quarante-huit points de large : assez pour que le mot « amazon » se lise —
 * il occupe les trois quarts de la vignette —, assez peu pour rester une
 * signature à gauche du texte et non l'objet principal du bouton.
 */
const LOGO = { w: 48, h: 30 };

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
    CE QUE LE BANDEAU ANNONCE — relevé du patron : « indique avec un texte
    discret "Un meilleur prix a été trouvé sur Amazon", et logo et prix ».

    DEUX PHRASES, PARCE QUE DEUX SITUATIONS. Le bouton s'affiche aussi quand
    les prix sont ÉGAUX — c'est la règle du patron, « équivalent ou
    inférieur » —, et écrire « un meilleur prix » sur un article qui coûte
    exactement pareil serait faux. Un chiffre faux, même petit, fait douter de
    tous les autres : à égalité, on dit simplement qu'on le trouve aussi
    là-bas.
  */
  const meilleur = gain >= 0.01;
  const phrase = meilleur
    ? 'Un meilleur prix a été trouvé sur Amazon'
    : 'Cet article est au même prix sur Amazon';

  const ouvrir = () => {
    if (!offre.asin) return;
    // Un lien qui ne s'ouvre pas ne casse rien : on reste sur le magasin.
    Linking.openURL(lienAmazon(offre.asin)).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={styles.bouton}
      accessibilityRole="link"
      accessibilityLabel={`${phrase}, ${fr(offre.prix, 2)} euros${
        meilleur ? `, ${fr(gain, 2)} euros de moins` : ''
      }`}
      activeOpacity={0.75}
      onPress={ouvrir}>
      {/*
        LA PHRASE D'ABORD, ET DISCRÈTE. C'est une information, pas une
        réclame : l'action principale de cet écran reste d'ajouter l'article
        au devis. Elle se lit en petit, au-dessus du logo et du prix, comme
        une mention en rayon.
      */}
      <Text style={styles.phrase}>{phrase}</Text>
      <View style={styles.rangee}>
        <Image
          source={require('../assets/amazon.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Amazon"
        />
        <Text style={styles.prix}>{`${fr(offre.prix, 2)} €`}</Text>
        {meilleur && (
          <Text style={styles.gain}>{`− ${fr(gain, 2)} €`}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    bouton: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      /*
        LE CADRE EST GRIS, PAS ORANGE — et c'est la deuxième version.

        Un liseré orange faisait de ce lien le bouton le plus fort de la
        fiche, alors que le geste principal reste d'ajouter l'article au
        devis. « Discret », dit le relevé : c'est le logo qui porte la
        couleur de la marque, le cadre n'a pas à la répéter.
      */
      backgroundColor: c.surface,
    },
    phrase: { fontSize: 11, color: c.inkSoft, marginBottom: 6 },
    rangee: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: LOGO.w, height: LOGO.h },
    prix: { fontSize: 14, fontWeight: '800', color: c.ink },
    gain: { fontSize: 12, fontWeight: '700', color: ORANGE },
  }),
);
