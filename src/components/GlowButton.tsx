/**
 * LE BOUTON DE L'ACCUEIL.
 *
 * Un aplat bleu à coins arrondis, c'est le bouton de 2015 : il dit « ceci se
 * touche » et rien d'autre. Ce qu'on veut ici, c'est qu'il ATTIRE — l'accueil
 * n'a qu'un geste à proposer, autant qu'il se voie.
 *
 * Trois choses le distinguent d'un rectangle peint :
 *
 * - **le blanc cerné de bleu** : l'aplat pesait sur la page et écrasait ce
 *   qui l'entoure. Le contour dit la même chose — « c'est ici qu'on appuie »
 *   — en laissant la page respirer, et il va avec le logotype ;
 * - **le reflet qui passe** : une bande claire traverse le bouton toutes les
 *   trois secondes. Un mouvement lent, qui se remarque sans agiter ;
 * - **l'enfoncement** : à l'appui, le bouton recule légèrement. Un bouton qui
 *   ne bouge pas sous le doigt laisse douter qu'il a pris.
 *
 * LE REFLET EST UNE TRANSLATION, et c'est tout son intérêt. Le contour
 * tournant d'avant reposait sur un décalage de pointillés, propriété sans
 * équivalent natif : l'animation vivait sur le fil JS — soixante réveils de
 * JavaScript par seconde, sur l'écran le plus longtemps affiché de
 * l'application. On l'avait bornée à trois tours pour épargner la batterie,
 * après quoi le bouton restait figé, ce qui se voit tout de suite. Une
 * translation part sur le fil natif : elle tourne sans fin, sans rien coûter.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radius, useTheme, type Palette } from '../theme';

/**
 * LA HAUTEUR DU REFLET, au-dela du bouton.
 *
 * Penche a dix-huit degres, un bandeau de la hauteur exacte du bouton
 * laisserait deux coins non couverts : on le fait deborder.
 */
const H_REFLET = 40;

export function GlowButton({
  label,
  onPress,
  disabled,
  /** Le bouton principal porte la couleur ; le second reste sobre. */
  variant = 'primary',
  right,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  /** Ce qui se pose à droite du libellé — un compteur, par exemple. */
  right?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [taille, setTaille] = React.useState({ w: 0, h: 0 });
  const appui = useRef(new Animated.Value(0)).current;

  /*
    LE CONTOUR NE COURT QUE SUR LE BOUTON PRINCIPAL.

    Deux boutons qui s'animent en même temps, c'est deux choses qui bougent
    pour un seul geste à faire : l'œil ne sait plus lequel est l'important.
    « Mes scans » garde son liseré, sobre, et laisse le mouvement à celui
    qu'on vient toucher.
  */
  const anime = variant === 'primary';
  /*
    LE REFLET TOURNE SANS RÉVEILLER PERSONNE.

    Le bouton portait un liseré qui courait le long de son bord — un
    décalage de pointillés, propriété que le fil natif ne sait pas animer.
    L'animation vivait donc sur le FIL JS : soixante réveils de JavaScript
    par seconde, sur l'écran que l'application montre le plus longtemps.
    C'est ce qui faisait chauffer le téléphone, et on l'avait bornée à trois
    tours pour cette raison — après quoi le bouton restait figé, ce qui se
    voit tout de suite : « l'animation n'est plus animée ».

    Un REFLET qui balaie le bouton s'anime, lui, par une TRANSLATION : le
    fil natif la porte de bout en bout, et le JavaScript n'est réveillé ni
    pour la lancer ni pour la suivre. Elle peut donc tourner indéfiniment
    sans rien coûter, avec une pause entre deux passages pour rester
    discrète. Le liseré, lui, reste — mais immobile : c'est le bord du
    bouton, pas son animation.
  */
  const balai = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (disabled || !anime) return;
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(balai, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // Le temps de respirer : un reflet qui repasse sans cesse devient
        // un clignotant, et l'on finit par ne plus le voir.
        Animated.delay(2200),
        Animated.timing(balai, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [balai, disabled, anime]);

  const H = taille.h || 56;
  const W = taille.w || 240;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() =>
        Animated.timing(appui, {
          toValue: 1,
          duration: 90,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.timing(appui, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }).start()
      }
      onPress={onPress}
      onLayout={(e) =>
        setTaille({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }>
      <Animated.View
        style={[
          styles.corps,
          variant === 'primary' ? styles.primaire : styles.fantome,
          disabled && styles.eteint,
          {
            transform: [
              {
                scale: appui.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.972],
                }),
              },
            ],
          },
        ]}>
        {/*
          LE MOT SE CENTRE SEUL, CE QUI L'ACCOMPAGNE SE POSE À CÔTÉ.

          Le libellé et sa pastille vivaient côte à côte : c'est donc le
          COUPLE qui se centrait dans le bouton, et le mot se retrouvait
          poussé à gauche du milieu — d'autant plus loin que le nombre est
          long. Un bouton dont le texte se déplace selon le nombre de scans
          qu'on possède ne se lit plus comme un bouton.

          L'accompagnement est donc posé DANS le cadre du mot, en absolu à
          son bord droit : il déborde sans prendre de place.
        */}
        <View>
          <Text
            style={[
              styles.texte,
              variant === 'primary' ? styles.texteClair : styles.texteSombre,
            ]}>
            {label}
          </Text>
          {/*
            LE CADRE OCCUPE TOUTE LA HAUTEUR DU MOT, ET CENTRE CE QU'IL PORTE.

            Premier jet : la pastille était posée à « 50 % de haut, moins la
            moitié de sa hauteur ». Deux approximations qui s'ajoutent — le
            pourcentage se prend sur la boîte du texte, dont la hauteur
            dépend de l'interligne de la police du téléphone, et la
            demi-hauteur était écrite en dur. Elle tombait sous la ligne.

            Un cadre haut comme le mot, qui centre son contenu, ne dépend
            d'aucun chiffre : c'est la seule façon que ça tienne d'un
            appareil à l'autre.
          */}
          {right ? <View style={styles.suite}>{right}</View> : null}
        </View>
        {/*
          LE REFLET QUI PASSE — porté par le fil natif.

          Une bande claire, penchée, qui traverse le bouton de gauche à
          droite puis attend. C'est une simple TRANSLATION : elle s'anime
          nativement, donc elle peut tourner sans fin sans réveiller le
          JavaScript — contrairement au liseré qui courait ici, et qu'il
          avait fallu borner à trois tours pour épargner la batterie.

          Transparente au doigt : elle ne doit pas voler l'appui qu'elle
          invite à donner.
        */}
        {taille.w > 0 && !disabled && anime && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.reflet,
              {
                width: H * 1.5,
                transform: [
                  { rotate: '18deg' },
                  {
                    translateX: balai.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-H * 2, W + H * 2],
                    }),
                  },
                ],
              },
            ]}>
            <Svg width={H * 1.5} height={H * 2.2}>
              <Defs>
                <LinearGradient id="reflet" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={c.blue} stopOpacity="0" />
                  <Stop offset="0.5" stopColor={c.blue} stopOpacity="0.16" />
                  <Stop offset="1" stopColor={c.blue} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={H * 1.5}
                height={H * 2.2}
                fill="url(#reflet)"
              />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const getStyles = (() => {
  const cache = new Map<Palette, ReturnType<typeof creer>>();
  const creer = (c: Palette) =>
    StyleSheet.create({
    /** Ce qui accompagne le mot : accroché à son bord droit, centré sur lui. */
    suite: {
      position: 'absolute',
      left: '100%',
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
      /*
        UN CRAN PLUS PETIT — relevé du chantier.

        Cinquante-six points de haut sur un écran de six pouces, c'était un
        bouton de page d'accueil de site web. L'application en montre deux à
        trois d'affilée : ils prenaient le tiers de la page pour trois mots.
      */
      corps: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minHeight: 50,
        paddingHorizontal: 22,
        borderRadius: radius.lg,
        overflow: 'hidden',
      },
      /** Le reflet qui balaie : plus haut que le bouton, pour couvrir ses coins. */
      reflet: { position: 'absolute', top: -H_REFLET, bottom: -H_REFLET },
      /**
       * BLANC À TEXTE BLEU — relevé du chantier.
       *
       * L'aplat bleu était le geste par défaut d'une application de 2015 :
       * il pèse sur la page et écrase tout ce qui l'entoure. Le blanc cerné
       * de bleu dit la même chose — « c'est ici qu'on appuie » — en laissant
       * la page respirer, et il va avec le logotype.
       *
       * L'ombre reste TEINTÉE de bleu : elle soulève le bouton du fond sans
       * le cerner d'un trait de plus.
       */
      primaire: {
        backgroundColor: c.surface,
        borderWidth: 1.5,
        borderColor: c.blue,
        shadowColor: c.blue,
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      },
      fantome: {
        backgroundColor: c.surface,
        opacity: 0.92,
        // Le liseré vient du STYLE et non du tracé animé : sans contour qui
        // court, il ne restait plus rien pour dessiner le bord.
        borderWidth: 1,
        borderColor: c.lineStrong,
      },
      eteint: { opacity: 0.45 },
      texte: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
      /* Le mot du bouton principal : bleu sur blanc, comme son contour. */
      texteClair: { color: c.blue },
      texteSombre: { color: c.ink },
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
