/**
 * LA VITRINE DE L'ACCUEIL — un téléphone, et le plan qui se lève dedans.
 *
 * L'accueil expliquait l'application en trois lignes : « Scannez, ajustez,
 * explorez ». Trois pictogrammes et neuf mots pour dire ce qu'une seule image
 * montre mieux — le résultat. On ne vend pas un scanner de pièces avec un
 * mode d'emploi ; on le vend avec le plan qui en sort.
 *
 * L'animation joue le geste de l'app : un plan 2D coté, avec ses appareils
 * électriques, qui se RELÈVE pour devenir un logement meublé en volume. Les
 * cotes s'effacent en montant — on ne cote pas une perspective —, les
 * appareils restent, parce que c'est ce qu'on vient chercher ici.
 *
 * TOUT EST CUIT D'AVANCE.
 *
 * La première version calculait la scène sur l'appareil, vingt-cinq fois par
 * seconde : cent cinquante polygones reprojetés à chaque image, sur un écran
 * qui n'a rien à calculer. Les images sont désormais rendues au build
 * (`npm run showcase`, voir `src/export/showcaseFrames.ts`) et embarquées :
 * le téléphone ne fait plus que les feuilleter. Rien à recalculer, donc rien
 * qui puisse ramer, chauffer, ni diverger d'un appareil à l'autre.
 *
 * ET LE BOÎTIER S'INCLINE, ce qui n'a pas toujours été le cas.
 *
 * Il a d'abord bougé, puis on l'a figé : « c'est le contenu qui raconte, et un
 * téléphone qui se balance en même temps ne fait que brouiller la lecture ».
 * L'argument valait pour un balancement AMPLE, qui déplace le dessin qu'on est
 * en train de lire.
 *
 * Relevé du patron, photo à l'appui : « fais l'iPhone un peu incliné comme sur
 * la photo et donne-lui une légère animation de l'iPhone lui-même, avec une
 * légère rotation horizontale (seulement un faible angle et qui loop) ». La
 * photo montre un appareil vu de trois quarts, posé de biais — pas une
 * façade. C'est ce qui le fait exister comme objet, au lieu d'un cadre plat
 * autour d'une image.
 *
 * SIX DEGRÉS D'AMPLITUDE, PAS DAVANTAGE. Le boîtier tourne entre −22° et −10°
 * autour de sa verticale, en quatre secondes aller-retour : assez pour que la
 * lumière glisse sur la tranche, trop peu pour qu'un mot du dessin change de
 * place. L'ancien argument reste vrai — c'est l'amplitude qui l'avait rendu
 * juste, pas le principe.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { SHOWCASE_IMAGES } from '../assets/showcase';
import { useTheme, type Palette } from '../theme';

/** L'écran du téléphone, en points. Les images font le double, en pixels. */
/*
  La maquette a MAIGRI quand l'accueil a gagné la rangée du compte : à
  132 × 268, le boîtier montait recouvrir le sous-titre. L'écran reste au
  même ratio, les images cuites se réduisent proprement.
*/
const ECRAN = { w: 118, h: 240 };
const BOITIER = { w: ECRAN.w + 14, h: ECRAN.h + 14 };
/** Quinze images par seconde : le cycle complet dure trois secondes et demie. */
const PERIODE = 68;

/**
 * L'INCLINAISON DU BOÎTIER — en degrés autour de sa verticale.
 *
 * `AU_REPOS` est l'assiette de la photo : l'appareil de trois quarts, sa
 * tranche gauche vers nous. Le balancement se compte de part et d'autre.
 */
export const AU_REPOS = -16;
export const BALANCEMENT = 6;
/** Un aller ou un retour, en millisecondes : quatre secondes le cycle. */
export const RESPIRATION = 2000;

export function PhoneShowcase() {
  const styles = getStyles(useTheme());
  const [image, setImage] = useState(0);

  useEffect(() => {
    const h = setInterval(
      () => setImage((i) => (i + 1) % SHOWCASE_IMAGES.length),
      PERIODE,
    );
    return () => clearInterval(h);
  }, []);

  /*
    LE BALANCEMENT TOURNE SUR LE FIL NATIF.

    Une rotation pilotée depuis JavaScript rendrait la main à l'accueil
    soixante fois par seconde, pendant que le flipbook change d'image toutes
    les soixante-huit millisecondes. `useNativeDriver` la confie au système :
    elle ne coûte plus rien à la boucle qui feuillette.
  */
  const balance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const aller = (vers: number) =>
      Animated.timing(balance, {
        toValue: vers,
        duration: RESPIRATION,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      });
    const boucle = Animated.loop(
      Animated.sequence([aller(1), aller(0)]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [balance]);
  const rotation = balance.interpolate({
    inputRange: [0, 1],
    outputRange: [
      `${AU_REPOS - BALANCEMENT / 2}deg`,
      `${AU_REPOS + BALANCEMENT / 2}deg`,
    ],
  });

  return (
    <View style={styles.scene}>
      {/*
        LA PERSPECTIVE VIENT AVANT LA ROTATION, et l'ordre compte : posée
        après, elle ne s'applique plus à rien et le boîtier tourne à plat,
        comme une carte à jouer. C'est elle qui donne la tranche.
      */}
      <Animated.View
        style={[
          styles.boitier,
          {
            transform: [
              { perspective: 900 },
              { rotateY: rotation },
              { rotateX: '3deg' },
              { rotateZ: '-1.5deg' },
            ],
          },
        ]}>
        <View style={styles.ecran}>
          {/*
            TOUTES LES IMAGES SONT MONTÉES, une seule est visible.

            Les faire défiler dans un unique `Image` rechargerait la source à
            chaque changement : sur un appareil chargé, la première boucle
            saute une image sur deux avant de se calmer — le genre de défaut
            qu'on met sur le compte du téléphone. Montées ensemble, elles
            sont décodées une fois pour toutes.
          */}
          {SHOWCASE_IMAGES.map((src, i) => (
            <Image
              key={i}
              source={src}
              // L'opacité se pose EN CLAIR, et non par une feuille de styles :
              // celles-ci se réduisent à des identifiants numériques, que ni
              // un banc ni un lecteur ne peuvent relire.
              style={[styles.image, { opacity: i === image ? 1 : 0 }]}
              resizeMode="cover"
              fadeDuration={0}
            />
          ))}
          {/* Le reflet de la dalle : une diagonale claire, très faible. Sans
              lui, l'écran est un trou dans le boîtier. */}
          <View style={styles.reflet} pointerEvents="none" />
        </View>
        {/* L'îlot dynamique : deux points suffisent à dire « iPhone ». */}
        <View style={styles.ilot} pointerEvents="none" />
      </Animated.View>
    </View>
  );
}

const getStyles = (() => {
  const cache = new Map<Palette, ReturnType<typeof creer>>();
  const creer = (c: Palette) =>
    StyleSheet.create({
      scene: { alignItems: 'center', justifyContent: 'center' },
      boitier: {
        width: BOITIER.w,
        height: BOITIER.h,
        borderRadius: 30,
        padding: 7,
        backgroundColor: c.ink,
        // Le bord de l'appareil attrape la lumière : un liseré plus clair
        // que le boîtier, comme le métal d'une tranche.
        borderWidth: 1.5,
        borderColor: c.inkSoft,
        /*
          L'OMBRE TOMBE DE BIAIS, comme sur la photo du relevé : un appareil
          incliné dont l'ombre descend droit se lit comme un autocollant.
        */
        shadowColor: c.ink,
        shadowOpacity: 0.3,
        shadowRadius: 22,
        shadowOffset: { width: 10, height: 14 },
        elevation: 10,
      },
      ecran: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      },
      image: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
      },
      reflet: {
        position: 'absolute',
        top: -ECRAN.h * 0.3,
        left: -ECRAN.w * 0.2,
        width: ECRAN.w * 0.7,
        height: ECRAN.h * 1.4,
        backgroundColor: '#FFFFFF',
        opacity: 0.05,
        transform: [{ rotate: '18deg' }],
      },
      ilot: {
        position: 'absolute',
        top: 13,
        alignSelf: 'center',
        width: 42,
        height: 11,
        borderRadius: 6,
        backgroundColor: '#000000',
      },
    });
  return (c: Palette) => {
    let s = cache.get(c);
    if (!s) {
      s = creer(c);
      cache.set(c, s);
    }
    return s;
  };
})();
