/**
 * LE RUBAN DE LUMIÈRE — les ondes qui passent derrière la maquette.
 *
 * L'original est un shader GLSL : PLUSIEURS ondes néon — bleue, verte,
 * rouge, et le trait blanc — qui se croisent et se séparent, chacune
 * vivant sa vie, toutes lumineuses. Il n'y a pas de WebGL ici, et il n'en
 * faut pas : ce que l'œil retient de cette image, ce sont des courbes,
 * leurs lueurs, et leurs CROISEMENTS.
 *
 * LE PREMIER PORTAGE N'AVAIT RETENU QU'UNE ONDE. Une courbe et sa frange
 * collée (deux décalages de trois points et demi), glissant d'un seul
 * bloc : des lignes parallèles, qui ne se croisent jamais — relevé du
 * patron, référence à l'appui : « chaque ligne bouge et sont lumineuses ».
 * Chaque ligne a donc SA courbe — sa phase, son amplitude —, SA vitesse
 * et SA lueur : c'est la différence de phase qui fait les croisements, et
 * la différence de vitesse qui les fait vivre.
 *
 * COMMENT ÇA BOUGE, ET POURQUOI AINSI. Chaque courbe est dessinée UNE
 * FOIS, sur deux longueurs d'onde, et c'est SA vue qui glisse : une
 * transformation par ligne, confiée au pilote natif. Quatre
 * transformations natives ne coûtent pas plus cher qu'une — ce qui coûte,
 * c'est de recalculer un chemin à l'image, et personne ne le fait.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Palette } from '../theme';

/** Hauteur de la bande : les ondes ondulent dedans, et rien ne dépasse. */
export const RIBBON_H = 96;

/**
 * LES LIGNES DE LA RÉFÉRENCE — chacune sa phase, son amplitude, sa vitesse.
 *
 * Les phases sont toutes distinctes : c'est ce qui fait qu'elles se
 * croisent au lieu de se suivre en formation. Les vitesses aussi : à
 * vitesse égale, le dessin serait figé dans son mouvement, les croisements
 * toujours aux mêmes endroits. Le cœur (`teinte: null` — il prend celle du
 * thème) est DERNIER : peint par-dessus, c'est lui qu'on suit des yeux.
 */
/*
  LES PHASES SONT RESSERRÉES — relevé du patron : « plus proches entre
  eux ». Un éventail trop ouvert (jusqu'à 3,9 rad) éparpillait chaque
  ligne dans son coin de la bande ; sous 1,4 rad d'écart total, elles
  voyagent en FAISCEAU, se frôlent et se croisent près les unes des
  autres — c'est le dessin de la référence. Les vitesses différentes
  continuent de déplacer les croisements.
*/
export const LIGNES = [
  { role: 'bleu', teinte: '#3A63FF', phase: 1.35, amplitude: 0.26, duree: 21500, epaisseur: 1.6 },
  { role: 'vert', teinte: '#32D74B', phase: 0.9, amplitude: 0.3, duree: 17500, epaisseur: 1.6 },
  { role: 'rouge', teinte: '#FF3B30', phase: 0.45, amplitude: 0.24, duree: 11500, epaisseur: 1.6 },
  { role: 'coeur', teinte: null, phase: 0, amplitude: 0.28, duree: 14000, epaisseur: 1.8 },
] as const;

/**
 * Une courbe, en deux longueurs d'onde exactement.
 *
 * Deux, et pas une : la copie qui suit doit entrer par la droite pendant
 * que la première sort par la gauche, sinon la bande se vide à chaque tour.
 * Les tangentes suivent la pente — la pente d'un sinus est son cosinus —
 * sans quoi la Bézier bossèle entre ses points (vu sur le rendu avant de
 * le voir dans le code).
 */
function onde(
  largeur: number,
  hauteur: number,
  phase: number,
  ampFrac: number,
): string {
  const N = 24;
  const pas = largeur / N;
  const milieu = hauteur / 2;
  const amplitude = hauteur * ampFrac;
  const y = (i: number) =>
    milieu - Math.sin((i / 12) * Math.PI * 2 + phase) * amplitude;
  const pente = (i: number) =>
    ((-amplitude * Math.cos((i / 12) * Math.PI * 2 + phase) * Math.PI * 2) /
      12) /
    pas;
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

/**
 * Une ligne : sa courbe dessinée une fois, sa vue qui glisse à sa vitesse,
 * et ses trois passes — la lueur large et pâle, la lueur serrée, le cœur.
 * C'est la pile des passes qui fait « néon » : une lumière s'éteint en
 * s'éloignant de sa source, donc la plus large est la plus pâle.
 */
function Ligne({
  periode,
  height,
  teinte,
  phase,
  amplitude,
  duree,
  epaisseur,
  opacite,
}: {
  periode: number;
  height: number;
  teinte: string;
  phase: number;
  amplitude: number;
  duree: number;
  epaisseur: number;
  opacite: number;
}) {
  const glisse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const boucle = Animated.loop(
      Animated.timing(glisse, {
        toValue: 1,
        duration: duree,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [glisse, duree]);

  const d = useMemo(
    () => onde(periode * 2, height, phase, amplitude),
    [periode, height, phase, amplitude],
  );

  return (
    <Animated.View
      style={[
        styles.calque,
        {
          width: periode * 2,
          transform: [
            {
              translateX: glisse.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -periode],
              }),
            },
          ],
        },
      ]}>
      <Svg width={periode * 2} height={height}>
        <Path
          d={d}
          stroke={teinte}
          strokeWidth={epaisseur * 5}
          fill="none"
          opacity={opacite * 0.14}
        />
        <Path
          d={d}
          stroke={teinte}
          strokeWidth={epaisseur * 2.6}
          fill="none"
          opacity={opacite * 0.3}
        />
        <Path
          d={d}
          stroke={teinte}
          strokeWidth={epaisseur}
          fill="none"
          opacity={Math.min(1, opacite * 1.7)}
        />
      </Svg>
    </Animated.View>
  );
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
  // Une seule longueur d'onde de course : au bout, le motif est identique à
  // lui-même et la boucle repart sans saut.
  const periode = Math.max(240, width);

  /*
    LE CŒUR CHANGE AVEC LE THÈME, PAS LES NÉONS.

    Un trait blanc sur fond blanc n'existe pas : en clair, le cœur prend le
    bleu de la marque. Le rouge, le vert et le bleu sont la lumière
    décomposée — ils se lisent sur les deux fonds.
  */
  const coeur = sombre ? '#FFFFFF' : palette.blue;
  const opacite = sombre ? 0.5 : 0.28;

  return (
    <View style={[styles.bande, { height, width }]} pointerEvents="none">
      {LIGNES.map((l) => (
        <Ligne
          key={l.role}
          periode={periode}
          height={height}
          teinte={l.teinte ?? coeur}
          phase={l.phase}
          amplitude={l.amplitude}
          duree={l.duree}
          epaisseur={l.epaisseur}
          // Les néons, un cran sous le cœur : ils accompagnent, il mène.
          opacite={l.teinte ? opacite * 0.85 : opacite}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Les ondes débordent de leur bande : sans ce rognage, leur seconde
     longueur d'onde s'afficherait par-dessus le reste de l'écran. */
  bande: { overflow: 'hidden' },
  calque: { position: 'absolute', top: 0, left: 0 },
});
