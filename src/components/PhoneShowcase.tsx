/**
 * LA VITRINE DE L'ACCUEIL — un téléphone, et le plan qui se lève dedans.
 *
 * L'accueil expliquait l'application en trois lignes : « Scannez, ajustez,
 * explorez ». Trois pictogrammes et neuf mots pour dire ce qu'une seule image
 * montre mieux — le résultat. On ne vend pas un scanner de pièces avec un
 * mode d'emploi ; on le vend avec le plan qui en sort.
 *
 * TOUT EST CUIT D'AVANCE. Les images sont rendues au build
 * (`npm run showcase`, voir `src/export/showcaseFrames.ts`) et embarquées : le
 * téléphone ne fait que les feuilleter. Rien à recalculer, donc rien qui
 * puisse ramer, chauffer, ni diverger d'un appareil à l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE JOUE EN DIRECT, ET POURQUOI.
 *
 * Relevé du patron : « l'animation de l'iPhone et de son écran ne me convainc
 * pas, on dirait un truc bas de gamme. Je veux quelque chose de dynamique,
 * rapide, fluide, JS style. Un vrai art style. »
 *
 * Le dedans de l'écran a été refait ailleurs (voir `showcaseFrames`). Le
 * BOÎTIER, lui, était un rectangle sombre avec un liseré, une diagonale
 * claire fixe en guise de reflet, et une rotation lente. Un objet plat, en
 * somme. Quatre couches vivantes le remettent debout :
 *
 *   1. LA LUEUR DERRIÈRE. Une nappe bleue posée sous le boîtier, qui respire.
 *      C'est elle qui empêche le téléphone d'être un autocollant sur
 *      l'accueil : un objet sombre sur un fond clair a besoin qu'on voie ce
 *      qu'il ÉCLAIRE autour de lui.
 *
 *   2. LA LUEUR ET LE VIGNETTAGE DANS L'ÉCRAN. Ils étaient cuits dans les
 *      images, et ils y coûtaient 480 ko : un dégradé lisse est le pire
 *      ennemi d'une palette réduite. En vectoriel, ils sont plus lisses,
 *      gratuits, et surtout ils peuvent BOUGER.
 *
 *   3. LE REFLET QUI GLISSE. Une bande claire qui traverse la dalle — et qui
 *      traverse PARCE QUE le téléphone tourne : c'est la même valeur animée
 *      qui pilote la rotation et la position du reflet. Un reflet fixe sur un
 *      objet qui tourne est le détail qui trahit le faux.
 *
 *   4. LE FLOTTEMENT. Trois points de haut en bas, sur une horloge plus lente
 *      que la rotation. Deux mouvements de PÉRIODES DIFFÉRENTES ne se
 *      resynchronisent jamais à l'œil : c'est ce qui fait qu'on ne voit pas
 *      la boucle.
 *
 * ET LE BOÎTIER S'INCLINE, ce qui n'a pas toujours été le cas. Il a d'abord
 * bougé, puis on l'a figé — « c'est le contenu qui raconte » —, puis relevé
 * du patron, photo à l'appui : « fais l'iPhone un peu incliné comme sur la
 * photo et donne-lui une légère rotation horizontale, un faible angle, qui
 * loop ». SIX DEGRÉS D'AMPLITUDE, PAS DAVANTAGE : assez pour que la lumière
 * glisse sur la tranche, trop peu pour qu'un mot du dessin change de place.
 * L'ancien argument reste vrai — c'est l'amplitude qui l'avait rendu juste,
 * pas le principe.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
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

/**
 * VINGT-QUATRE IMAGES PAR SECONDE — quarante-deux millisecondes par image.
 *
 * C'était quinze, et c'est le nombre qui décidait de « fluide ». On peut
 * lisser une trajectoire autant qu'on veut : à quinze images par seconde,
 * l'œil sépare encore les poses d'un mouvement rapide, et c'est ce hachage-là
 * qui se lit comme du bas de gamme.
 *
 * IL DOIT RESTER D'ACCORD AVEC LA CUISSON : les images sont calculées pour
 * cette cadence-là (`IPS`, dans `showcaseFrames`), et un flipbook joué à une
 * autre vitesse que celle pour laquelle il a été calculé ne dure plus les
 * cinq secondes annoncées. Un banc tient les deux nombres ensemble.
 */
export const PERIODE = 42;

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
/**
 * LE FLOTTEMENT A SA PROPRE HORLOGE, et elle est volontairement bancale.
 *
 * 2 600 contre 2 000 : les deux mouvements ne retombent en phase qu'au bout
 * de vingt-six secondes. C'est ce décalage qui empêche l'œil de saisir la
 * boucle — deux mouvements synchrones se lisent comme UN mouvement, et un
 * mouvement qui se répète toutes les quatre secondes se remarque.
 */
export const FLOTTEMENT = 2600;

export function PhoneShowcase() {
  const c = useTheme();
  const styles = getStyles(c);
  const [image, setImage] = useState(0);

  useEffect(() => {
    const h = setInterval(
      () => setImage((i) => (i + 1) % SHOWCASE_IMAGES.length),
      PERIODE,
    );
    return () => clearInterval(h);
  }, []);

  /*
    TOUT CE QUI BOUCLE TOURNE SUR LE FIL NATIF.

    Une rotation pilotée depuis JavaScript rendrait la main à l'accueil
    soixante fois par seconde, pendant que le flipbook change d'image toutes
    les quarante-deux millisecondes. `useNativeDriver` la confie au système :
    elle ne coûte plus rien à la boucle qui feuillette.
  */
  const balance = useRef(new Animated.Value(0)).current;
  const flotte = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const va = (v: Animated.Value, vers: number, duree: number) =>
      Animated.timing(v, {
        toValue: vers,
        duration: duree,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      });
    const boucles = [
      Animated.loop(
        Animated.sequence([
          va(balance, 1, RESPIRATION),
          va(balance, 0, RESPIRATION),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          va(flotte, 1, FLOTTEMENT),
          va(flotte, 0, FLOTTEMENT),
        ]),
      ),
    ];
    for (const b of boucles) b.start();
    return () => {
      for (const b of boucles) b.stop();
    };
  }, [balance, flotte]);

  const rotation = balance.interpolate({
    inputRange: [0, 1],
    outputRange: [
      `${AU_REPOS - BALANCEMENT / 2}deg`,
      `${AU_REPOS + BALANCEMENT / 2}deg`,
    ],
  });
  const montee = flotte.interpolate({ inputRange: [0, 1], outputRange: [3, -3] });
  /*
    LE REFLET SUIT LA ROTATION, il n'a pas d'horloge à lui.

    C'est tout le point : sur un objet qui tourne, ce qui trahit le faux n'est
    pas l'absence de reflet, c'est un reflet qui ne réagit pas. La bande
    traverse la dalle d'un bord à l'autre pendant que le boîtier fait son
    aller-retour — donc elle repart avec lui, sans qu'on ait rien à
    synchroniser.
  */
  const reflet = balance.interpolate({
    inputRange: [0, 1],
    outputRange: [-ECRAN.w * 0.75, ECRAN.w * 0.85],
  });
  // La nappe du dessous respire à contretemps du flottement : elle est plus
  // dense quand le boîtier descend, comme une ombre qui se resserre.
  const halo = flotte.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0.5] });

  return (
    <View style={styles.scene}>
      {/*
        LA NAPPE, SOUS LE BOÎTIER ET PLUS LARGE QUE LUI.

        Elle ne reçoit jamais le doigt et ne pousse rien : posée en absolu,
        elle déborde de part et d'autre. C'est ce débordement qui fait la
        lumière — une lueur qui s'arrête au bord de l'objet est un contour,
        pas une lueur.
      */}
      <Animated.View
        pointerEvents="none"
        style={[styles.nappe, { opacity: halo }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="nappe" cx="50%" cy="52%" r="50%">
              <Stop offset="0%" stopColor={c.blue} stopOpacity={0.42} />
              <Stop offset="55%" stopColor={c.blue} stopOpacity={0.14} />
              <Stop offset="100%" stopColor={c.blue} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#nappe)" />
        </Svg>
      </Animated.View>

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
              { translateY: montee },
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

          {/*
            L'ÉTALONNAGE DE LA DALLE — lueur au centre, nuit sur les bords.

            Ces deux dégradés étaient CUITS dans chacune des cent vingt
            images, où ils pesaient 480 ko et se trament en palette réduite.
            Posés ici une fois pour toutes, ils sont vectoriels — donc lisses
            — et ne coûtent rien. C'est la même image, mieux rendue.
          */}
          <Svg
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            width="100%"
            height="100%">
            <Defs>
              <RadialGradient id="bloom" cx="50%" cy="41%" r="72%">
                <Stop offset="0%" stopColor="#3D7BFF" stopOpacity={0.34} />
                <Stop offset="52%" stopColor="#2B5AC8" stopOpacity={0.12} />
                <Stop offset="100%" stopColor="#2B5AC8" stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="vignette" cx="50%" cy="41%" r="76%">
                <Stop offset="42%" stopColor="#05070C" stopOpacity={0} />
                <Stop offset="100%" stopColor="#05070C" stopOpacity={0.78} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#bloom)" />
            <Rect width="100%" height="100%" fill="url(#vignette)" />
          </Svg>

          {/*
            LE REFLET DE LA DALLE — une bande claire, en biais, qui TRAVERSE.

            L'ancien était une diagonale FIXE : sur un boîtier qui tourne, un
            reflet immobile est exactement ce qui dit « ceci est un dessin ».
            Celui-ci glisse avec la rotation, et il est dégradé de part et
            d'autre — un reflet à bords francs est un morceau de papier collé
            sur du verre.
          */}
          <Animated.View
            pointerEvents="none"
            style={[styles.reflet, { transform: [{ translateX: reflet }] }]}>
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="lustre" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.14} />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#lustre)" />
            </Svg>
          </Animated.View>
        </View>
        {/* L'îlot dynamique : deux points suffisent à dire « iPhone ». */}
        <View style={styles.ilot} pointerEvents="none" />
        {/*
          LE FILET DE TRANCHE, sur le bord qui vient vers nous. C'est le seul
          endroit où le métal attrape la lumière quand l'appareil est de trois
          quarts — et c'est ce qui donne son épaisseur au boîtier.
        */}
        <View style={styles.tranche} pointerEvents="none" />
      </Animated.View>
    </View>
  );
}

const getStyles = (() => {
  const cache = new Map<Palette, ReturnType<typeof creer>>();
  const creer = (c: Palette) =>
    StyleSheet.create({
      scene: { alignItems: 'center', justifyContent: 'center' },
      nappe: {
        position: 'absolute',
        width: BOITIER.w * 2.4,
        height: BOITIER.h * 1.35,
        alignSelf: 'center',
      },
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
        shadowOpacity: 0.34,
        shadowRadius: 24,
        shadowOffset: { width: 10, height: 16 },
        elevation: 12,
      },
      ecran: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#080B12',
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
        top: -ECRAN.h * 0.25,
        left: 0,
        width: ECRAN.w * 0.62,
        height: ECRAN.h * 1.5,
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
      tranche: {
        position: 'absolute',
        left: 0,
        top: 26,
        bottom: 26,
        width: 1.5,
        borderRadius: 1,
        backgroundColor: '#FFFFFF',
        opacity: 0.22,
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
