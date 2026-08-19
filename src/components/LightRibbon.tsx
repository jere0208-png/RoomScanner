/**
 * LE RUBAN DE LUMIÈRE — l'onde qui passe derrière la maquette.
 *
 * L'original est un shader GLSL : un trait blanc qui ondule sur fond noir,
 * bordé d'une frange chromatique — du bleu d'un côté, de l'ambre de l'autre,
 * comme la dispersion d'un prisme. Il n'y a pas de WebGL ici, et il n'en faut
 * pas : ce que l'œil retient de cette image, c'est UNE COURBE, SA LUEUR et SA
 * FRANGE. Trois choses qui se dessinent au trait.
 *
 * COMMENT ELLE BOUGE, ET POURQUOI AINSI. Recalculer la courbe à chaque image
 * — soixante fois par seconde, sur un chemin de plusieurs centaines de
 * points — coûterait à l'écran d'accueil ce que l'animation du plan a
 * justement gagné en étant cuite au build. Le ruban est donc dessiné UNE
 * FOIS, sur deux longueurs d'onde, et c'est le GROUPE qui glisse : une seule
 * transformation, confiée au pilote natif. Le motif se répète exactement
 * d'une période à l'autre, donc la boucle ne se voit pas.
 *
 * LA FRANGE S'ÉCARTE COMME DANS LE SHADER D'ORIGINE. Elle avait été serrée
 * à un point et demi ; le relevé du chantier a tranché dans l'autre sens —
 * sur l'original, la dispersion s'étale sur plusieurs pixels et c'est elle
 * qui fait le prisme. Trois points et demi de part et d'autre : les couleurs
 * se lisent, sans que le ruban se détache en trois fils.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import type { Palette } from '../theme';

/** Hauteur de la bande : le ruban ondule dedans, et rien ne dépasse. */
export const RIBBON_H = 96;

/**
 * La courbe, en deux longueurs d'onde exactement.
 *
 * Deux, et pas une : la copie qui suit doit entrer par la droite pendant que
 * la première sort par la gauche, sinon la bande se vide à chaque tour.
 */
function onde(largeur: number, hauteur: number): string {
  const N = 24;
  const pas = largeur / N;
  const milieu = hauteur / 2;
  const amplitude = hauteur * 0.28;
  const y = (i: number) => milieu - Math.sin((i / 12) * Math.PI * 2) * amplitude;
  /*
    LES TANGENTES SUIVENT LA PENTE, sinon la courbe bossèle.

    Premier jet : les points de contrôle étaient posés à l'horizontale, à un
    tiers de pas de chaque point. Une Bézier ainsi bridée arrive à plat sur
    chaque sommet ET sur chaque flanc — la sinusoïde se met à onduler entre
    ses propres points, et le ruban prend une allure de chenille. On a vu
    les bosses sur le rendu avant de les voir dans le code.

    La pente d'un sinus est son cosinus : chaque contrôle s'écarte donc du
    point le long de SA tangente.
  */
  const pente = (i: number) =>
    ((-amplitude * Math.cos((i / 12) * Math.PI * 2) * Math.PI * 2) / 12) / pas;
  let d = `M0 ${y(0)}`;
  for (let i = 1; i <= N; i++) {
    const x = pas * i;
    const xp = pas * (i - 1);
    const t = pas / 3;
    d +=
      ` C${xp + t} ${y(i - 1) + pente(i - 1) * t},` +
      ` ${x - t} ${y(i) - pente(i) * t},` +
      ` ${x} ${y(i)}`;
  }
  return d;
}

export function LightRibbon({
  /** Largeur de l'écran : le ruban la couvre en entier. */
  width,
  palette,
  sombre,
  /** Hauteur de la bande — l'accueil garde la sienne, un bouton en veut
   *  une plus basse pour que l'onde le frôle au lieu de le déborder. */
  height = RIBBON_H,
}: {
  width: number;
  palette: Palette;
  sombre: boolean;
  height?: number;
}) {
  const glisse = useRef(new Animated.Value(0)).current;
  // Une seule longueur d'onde de course : au bout, le motif est identique à
  // lui-même et la boucle repart sans saut.
  const periode = Math.max(240, width);

  useEffect(() => {
    const boucle = Animated.loop(
      Animated.timing(glisse, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [glisse]);

  const d = useMemo(() => onde(periode * 2, height), [periode, height]);

  /*
    LE CŒUR CHANGE AVEC LE THÈME, PAS LA FRANGE.

    Un trait blanc sur fond blanc n'existe pas : en clair, le cœur prend le
    bleu de la marque. La frange, elle, garde ses deux teintes — c'est elle
    qui dit « lumière », et elle se lit sur les deux fonds.
  */
  const coeur = sombre ? '#FFFFFF' : palette.blue;
  const opacite = sombre ? 0.5 : 0.28;

  return (
    <View style={[styles.bande, { height, width }]} pointerEvents="none">
      {/*
        C'EST LA VUE QUI GLISSE, PAS L'ATTRIBUT.

        Premier jet : la course était posée sur le `x` d'un groupe SVG. Le
        ruban n'a pas bougé d'un pixel — et c'est logique, le pilote natif ne
        connaît que les propriétés d'une VUE (position, opacité) ; il ignore
        les attributs d'un dessin vectoriel. L'animation partait, personne ne
        l'écoutait.

        Le dessin fait donc deux longueurs d'onde, et c'est la vue qui le
        porte qui se translate : une transformation, native, que le fil
        principal n'a plus à réveiller soixante fois par seconde.
      */}
      <Animated.View
        style={{
          width: periode * 2,
          transform: [
            {
              translateX: glisse.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -periode],
              }),
            },
          ],
        }}>
        <Svg width={periode * 2} height={height}>
        <G>
          {/* La lueur : deux passes larges et très pâles. Sans elles, le
              ruban est un fil ; avec, c'est une lumière. */}
          <Path d={d} stroke={coeur} strokeWidth={9} fill="none" opacity={opacite * 0.16} />
          <Path d={d} stroke={coeur} strokeWidth={5} fill="none" opacity={opacite * 0.3} />
          {/* La frange : trois points et demi de part et d'autre — l'étalement
              du shader d'origine, celui qui fait le prisme. */}
          <Path
            d={d}
            stroke={palette.sky}
            strokeWidth={2}
            fill="none"
            opacity={opacite * 0.6}
            translateY={-3.5}
          />
          <Path
            d={d}
            stroke="#E8A13B"
            strokeWidth={2}
            fill="none"
            opacity={opacite * 0.6}
            translateY={3.5}
          />
          {/* Le cœur, par-dessus : c'est lui qu'on suit des yeux. */}
          <Path d={d} stroke={coeur} strokeWidth={1.8} fill="none" opacity={Math.min(1, opacite * 1.7)} />
        </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Le ruban déborde de sa bande : sans ce rognage, sa seconde longueur
     d'onde s'afficherait par-dessus le reste de l'écran. */
  bande: { overflow: 'hidden' },
});
