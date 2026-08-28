/**
 * L'ÉCRAN D'ATTENTE — LA MARQUE, LE TEMPS DE LIRE LE COMPTE.
 *
 * Relevé du patron : « au chargement de l'app, mets les 2 logos superposés
 * comme on a fait pour l'accueil, mais centré à l'écran ».
 *
 * IL Y AVAIT UN TROU, ET IL ÉTAIT VIDE. L'application ne montre rien tant
 * qu'elle n'a pas LU le stockage du compte — et c'est une bonne règle :
 * afficher l'accueil une demi-seconde avant la porte d'entrée ferait croire
 * à une déconnexion à chaque lancement. Mais « ne rien montrer » se traduisait
 * par une page de fond nu, entre l'écran de lancement d'iOS (l'icône, en
 * grand, au centre) et l'accueil. Une coupure au milieu d'une ouverture se
 * lit comme un plantage.
 *
 * LA MÊME COMPOSITION QUE L'ACCUEIL, ET CE N'EST PAS UN HASARD : le glyphe
 * en filigrane, le logotype par-dessus. L'écran de lancement d'iOS montre
 * l'icône seule ; l'accueil montre le mot sur son filigrane. Cet écran-ci est
 * le passage de l'un à l'autre, et il porte donc les deux — l'œil suit une
 * marque qui grandit et se nomme, au lieu de traverser un blanc.
 *
 * IL EST CENTRÉ SUR L'ÉCRAN, pas posé en haut comme sur l'accueil : ici il
 * n'y a rien d'autre à placer, et un logotype accroché au bord haut d'une
 * page vide se lit comme une page qui n'a pas fini de charger — ce qui est
 * vrai, mais qu'on n'a pas à montrer.
 *
 * PAS D'ANIMATION, PAS DE TOURNIQUET. Cet écran dure le temps d'une lecture
 * de stockage : quelques dizaines de millisecondes le plus souvent. Une
 * animation qui n'a pas le temps de se jouer est un clignotement, et un
 * indicateur d'attente sur une attente qu'on ne voit pas fait croire à une
 * lenteur qui n'existe pas.
 */
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LogoMark } from './LogoMark';
import { dark, themedStyles, useTheme, type Palette } from '../theme';

/**
 * LA TAILLE DE L'INCRUSTATION, et son retrait — les mêmes qu'à l'accueil.
 *
 * Deux cent quarante points : le glyphe déborde largement le logotype qu'il
 * accompagne, c'est ce qui en fait un FOND et non une image posée à côté.
 * Sept centièmes d'opacité : on le sent, on ne le lit pas. Les deux nombres
 * sont ceux de l'accueil, et ils doivent le rester — un filigrane qui change
 * de force entre deux écrans qui se suivent se remarque.
 */
const FILIGRANE_LOGO = 240;
const FILIGRANE_OPACITE = 0.07;

export function EcranChargement() {
  const c = useTheme();
  const styles = getStyles(c);
  /** Le fond est-il sombre ? C'est lui qui choisit le logotype. */
  const sombre = c === dark;

  return (
    <View style={styles.page}>
      {/* Le filigrane est posé en ABSOLU : il ne pousse pas le logotype, et
          l'incrustation reste centrée sur le mot qu'elle accompagne. Rendu
          avant lui, il passe derrière — l'ordre des frères suffit. */}
      <View style={styles.filigrane} pointerEvents="none">
        <LogoMark size={FILIGRANE_LOGO} opacite={FILIGRANE_OPACITE} />
      </View>
      {/*
        DEUX FICHIERS, ET PAS UNE TEINTE — la leçon de l'accueil.

        Le logotype a porté un `tintColor` : l'image était noire, le thème la
        repeignait. Le dessin a des ONDES en dégradé — c'est son identité — et
        une teinte les écrase toutes en un aplat. On embarque donc les deux
        versions, et l'on prend celle qui va avec le fond.
      */}
      <Image
        source={
          sombre
            ? require('../assets/echoplan-dark.png')
            : require('../assets/echoplan.png')
        }
        style={styles.wordmark}
        resizeMode="contain"
        accessibilityLabel="EchoPlan"
      />
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    /*
      LE FOND EST PEINT ICI, et c'est indispensable : cette vue est la SEULE
      chose à l'écran pendant l'attente. Sans couleur, on verrait le fond du
      système — blanc en thème sombre, ce qui donne un éclair blanc juste
      avant un accueil noir.
    */
    page: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /* Centré sur le logotype, décalé du même retrait qu'à l'accueil. */
    filigrane: { position: 'absolute', alignItems: 'center' },
    /** Le logotype tient sur DEUX lignes — « echo » au-dessus de « plan ». */
    wordmark: { width: 160, height: 102 },
  }),
);
