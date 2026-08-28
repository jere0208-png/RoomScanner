/**
 * LA VÉRIFICATION DES PRIX — ce qu'on regarde pendant qu'on va voir.
 *
 * Relevé du patron : « pour les prix, j'aimerais une actualisation automatique
 * via l'application, au clic sur le devis, un chargement des prix avec une
 * animation moderne pour voir si les prix sont à jour. »
 *
 * POURQUOI UNE ATTENTE SE MONTRE ICI, ALORS QUE L'ÉCRAN D'ACCUEIL N'EN MONTRE
 * PAS. L'écran d'attente du lancement dure quelques dizaines de millisecondes —
 * une animation qui n'a pas le temps de se jouer est un clignotement. Celle-ci
 * dure le temps d'un aller-retour au serveur depuis un chantier : une à six
 * secondes, parfois davantage, et parfois pour rien. Un écran figé pendant six
 * secondes se lit comme un plantage, et l'électricien repart sans son prix.
 *
 * TROIS FANTÔMES DE LIGNES QUI RESPIRENT EN CASCADE. C'est le ticket qui
 * s'annonce : mêmes gabarits, même gouttière, même rythme du haut vers le bas.
 * L'œil sait déjà ce qui va s'écrire là, et l'attente devient un chargement au
 * lieu d'être un trou. Le décalage entre les trois — un cinquième de cycle —
 * fait la vague ; en phase, trois barres qui clignotent ensemble donnent un
 * gyrophare.
 *
 * L'ANNEAU TOURNE, IL NE PROGRESSE PAS. Une barre de progression promet une
 * fin qu'on ne connaît pas : le serveur répond en trois cents millisecondes ou
 * jamais. Un anneau qui tourne dit « ça travaille » sans rien promettre. C'est
 * la seule honnêteté possible sur une attente qu'on ne mesure pas.
 *
 * ET TOUT EST BLEU, comme le reste du devis — relevé du patron : « change le
 * vert du bouton en bleu pour le devis, et même les couleurs dans les pages ».
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/**
 * LE DIAMÈTRE DE L'ANNEAU, en points.
 *
 * Un seul nombre pour le cadre, le tracé et son centre : trois « 64 »
 * recopiés ne restent jamais d'accord. C'est aussi ce que demande le banc des
 * ronds — un rond à taille écrite en clair déclare son centrage.
 */
const D = 64;
/** L'épaisseur du trait de l'anneau. */
const TRAIT = 4;

/** Une seconde et quart par tour : assez lent pour ne pas vibrer. */
const TOUR = 1250;
/** Le cycle d'une ligne fantôme, et le retard de la suivante. */
const RESPIRE = 1100;
const CASCADE = 220;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * UNE LIGNE FANTÔME — le gabarit d'un article du ticket, sans son contenu.
 *
 * Trois blocs : la vignette carrée, le libellé, le prix à droite. Ce sont les
 * proportions du ticket, pas des barres décoratives — c'est ce qui fait qu'on
 * reconnaît ce qui arrive.
 */
function LigneFantome({ retard }: { retard: number }) {
  const c = useTheme();
  const styles = getStyles(c);
  const souffle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.delay(retard),
        Animated.timing(souffle, {
          toValue: 1,
          duration: RESPIRE / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(souffle, {
          toValue: 0,
          duration: RESPIRE / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
    // Le retard ne change jamais pour une ligne donnée : la boucle se monte
    // une fois. La relancer à chaque rendu ferait sauter la cascade.
  }, [retard, souffle]);

  /*
    ENTRE UN TIERS ET UN, JAMAIS ZÉRO. Une ligne qui disparaît tout à fait
    laisse un trou, et trois trous qui s'ouvrent à tour de rôle font clignoter
    la page. Ce qu'on veut montrer, c'est une matière qui respire.
  */
  const opacite = souffle.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });

  return (
    <Animated.View style={[styles.fantome, { opacity: opacite }]}>
      <View style={styles.fantomeVignette} />
      <View style={styles.fantomeTexte}>
        <View style={styles.fantomeTitre} />
        <View style={styles.fantomeSous} />
      </View>
      <View style={styles.fantomePrix} />
    </Animated.View>
  );
}

export function PrixQuiSActualisent({ etape }: { etape: string }) {
  const c = useTheme();
  const styles = getStyles(c);
  const tour = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const boucle = Animated.loop(
      Animated.timing(tour, {
        toValue: 1,
        duration: TOUR,
        // LINÉAIRE, et c'est le seul cas où on le veut : un anneau qui
        // accélère et ralentit à chaque tour donne l'impression que la
        // connexion peine. Il tourne rond.
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [tour]);

  const rotation = tour.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const r = (D - TRAIT) / 2;
  const circonference = 2 * Math.PI * r;

  return (
    <View style={styles.page} accessibilityLabel="Vérification des prix">
      <Animated.View style={{ transform: [{ rotate: rotation }] }}>
        <Svg width={D} height={D}>
          {/* La piste, en clair : sans elle, l'arc paraît sauter d'un bord à
              l'autre au lieu de tourner dans quelque chose. */}
          <Circle
            cx={D / 2}
            cy={D / 2}
            r={r}
            stroke={c.blueSoft}
            strokeWidth={TRAIT}
            fill="none"
          />
          {/* Un quart de tour d'encre : assez pour qu'on voie le sens de la
              rotation, assez peu pour qu'on voie la piste. */}
          <AnimatedCircle
            cx={D / 2}
            cy={D / 2}
            r={r}
            stroke={c.blue}
            strokeWidth={TRAIT}
            strokeLinecap="round"
            strokeDasharray={`${circonference / 4} ${circonference}`}
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Text style={styles.titre}>Vérification des prix</Text>
      {/*
        L'ÉTAPE EN COURS, ET ELLE CHANGE. Un texte immobile pendant six
        secondes fait douter que quelque chose se passe ; deux ou trois mots
        qui se succèdent disent où l'on en est. C'est l'appelant qui les
        donne : lui seul sait ce qu'il est en train de faire.
      */}
      <Text style={styles.etape}>{etape}</Text>

      <View style={styles.fantomes}>
        {[0, 1, 2].map((i) => (
          <LigneFantome key={i} retard={i * CASCADE} />
        ))}
      </View>
    </View>
  );
}

/**
 * LE VERDICT — une ligne qui dit d'où viennent les prix qu'on va lire.
 *
 * Relevé du patron : « fournir une référence pour le prix (ex : Castorama -
 * date) ». Elle se pose en tête du ticket, avant le premier article : on doit
 * savoir de quand datent les chiffres AVANT de les lire, pas après.
 *
 * TROIS ÉTATS, TROIS PHRASES, ET AUCUNE NE MENT. « À jour » quand on est allé
 * voir ; « actualisé » quand quelque chose a bougé ; « hors ligne » quand on
 * n'a pas pu y aller — et dans ce dernier cas on dit AVEC QUOI on chiffre,
 * parce qu'un prix sans provenance ne vaut pas mieux qu'une devinette.
 */
export function BandeauTarifs({
  etat,
  enseigne,
  jour,
  onVerifier,
}: {
  etat: 'actualise' | 'ajour' | 'horsligne';
  /** L'enseigne du catalogue qui chiffre. */
  enseigne: string;
  /** Le jour du relevé, déjà mis en français. */
  jour: string;
  onVerifier?: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const horsLigne = etat === 'horsligne';
  const mot =
    etat === 'actualise'
      ? 'Prix actualisés'
      : etat === 'ajour'
        ? 'Prix à jour'
        : 'Prix non vérifiés';

  return (
    <View
      style={[styles.bandeau, horsLigne && styles.bandeauGris]}
      accessibilityLabel={`${mot}, ${enseigne}, ${jour}`}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {horsLigne ? (
          // Un nuage barré : on n'a pas pu aller voir. Ce n'est pas une
          // erreur — un devis se fait aussi en cave —, c'est un fait.
          <Path
            d="M7 18h9a4 4 0 0 0 .4-8 6 6 0 0 0-11.3 1.6A3.5 3.5 0 0 0 6 18h1M3 3l18 18"
            stroke={c.inkFaint}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          <Path
            d="M20 6 9 17l-5-5"
            stroke={c.blue}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </Svg>
      <View style={styles.bandeauTexte}>
        <Text style={[styles.bandeauMot, horsLigne && styles.bandeauMotGris]}>
          {mot}
        </Text>
        {/*
          L'ENSEIGNE ET LE JOUR, SUR UNE SEULE LIGNE, comme sur une étiquette
          de rayon : « Castorama · 3 septembre 2026 ». C'est la référence que
          le patron a demandée, et c'est ce qu'on cite quand un client
          conteste un chiffre.
        */}
        <Text style={styles.bandeauSource}>{`${enseigne} · ${jour}`}</Text>
      </View>
      {onVerifier && (
        <Text
          style={styles.bandeauAction}
          accessibilityRole="button"
          accessibilityLabel="Vérifier les prix maintenant"
          onPress={onVerifier}>
          Vérifier
        </Text>
      )}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    page: {
      alignItems: 'center',
      paddingVertical: 36,
      paddingHorizontal: 20,
    },
    titre: {
      marginTop: 18,
      fontSize: 19,
      fontWeight: '800',
      color: c.ink,
    },
    etape: {
      marginTop: 6,
      fontSize: 13,
      color: c.inkFaint,
      textAlign: 'center',
    },
    fantomes: { marginTop: 26, alignSelf: 'stretch', gap: 10 },
    fantome: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: c.blueSoft,
    },
    fantomeVignette: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: c.line,
    },
    fantomeTexte: { flex: 1, gap: 6 },
    fantomeTitre: {
      height: 9,
      width: '62%',
      borderRadius: 4,
      backgroundColor: c.line,
    },
    fantomeSous: {
      height: 7,
      width: '38%',
      borderRadius: 4,
      backgroundColor: c.line,
    },
    fantomePrix: {
      width: 48,
      height: 12,
      borderRadius: 4,
      backgroundColor: c.line,
    },
    bandeau: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: c.blueSoft,
    },
    /* Hors ligne, le bandeau perd son bleu : il n'annonce plus une réussite. */
    bandeauGris: { backgroundColor: c.line },
    bandeauTexte: { flex: 1 },
    bandeauMot: { fontSize: 13, fontWeight: '800', color: c.blue },
    bandeauMotGris: { color: c.ink },
    bandeauSource: { fontSize: 11, color: c.inkFaint, marginTop: 1 },
    bandeauAction: {
      fontSize: 12,
      fontWeight: '700',
      color: c.blue,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
  }),
);
