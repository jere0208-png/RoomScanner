/**
 * LE VERRE DE L'APPLICATION — le Liquid Glass d'Apple, une seule matière.
 *
 * Relevés du patron : « le menu doit s'ouvrir telle une bulle Apple, en
 * verre », « mets ce léger effet transparent glass là où tu le juges
 * nécessaire, comme sur les quatre cartes de l'accueil », puis, l'IPA en
 * main : « l'effet de verre est raté : la forme des cards a été modifiée, pas
 * de transparence + flou type Apple glass ; il ne se voit pas. Tu dois
 * répliquer le liquid glass. […] Je veux rendre le cadre avec l'effet, pas
 * changer de style. »
 *
 * CE QUI ÉTAIT RATÉ, ET CE QUI CHANGE :
 *   — le verre était OPAQUE (voile blanc à 70 %) : il est maintenant celui
 *     d'iOS 26, `UIGlassEffect` — transparent, flou, reflets et lentille — et,
 *     sur un iPhone plus ancien, une réplique native au voile léger, au liseré
 *     lumineux et au reflet (voir `RoomScanVerre.swift`) ;
 *   — React Native peignait PAR-DESSUS le verre une teinte et un reflet, à
 *     d'autres coins que les siens : la carte changeait de forme. Plus rien
 *     n'est peint ici — la teinte d'une tuile passe AU verre, qui la porte ;
 *   — la lumière de couleur posée sous les tuiles de l'accueil est retirée :
 *     elle débordait autour d'elles et brouillait leur dessin.
 *
 * LA RÈGLE : le verre remplace le FOND d'un cadre, rien d'autre. Le cadre
 * garde sa forme, son rayon, sa marge, son contenu ; `SUR_VERRE` lui retire son
 * fond plein et son ombre (une ombre sur un fond transparent ombrerait chaque
 * lettre), et le verre les remplace. Sans le natif (Android, banc d'essai),
 * rien ne change : chaque élément garde son fond plein et son ombre.
 */
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { RoomScanVerre } from 'react-native-room-scan';
import { dark, useTheme } from '../theme';

/** Le verre est-il là ? (le natif iOS) — sinon, les fonds pleins restent. */
export const VERRE = !!RoomScanVerre;

/**
 * Le voile de la réplique (avant iOS 26) : LÉGER. Le verre doit laisser voir
 * à travers lui — c'est ce qui le distingue d'une carte blanche.
 */
export const VOILE = 0.22;

/**
 * Ce qu'un élément en verre retire de son propre style : son fond plein et
 * son ombre — c'est le verre qui les porte. Sans verre, rien.
 */
export const SUR_VERRE: ViewStyle | null = VERRE
  ? { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 }
  : null;

/** L'ombre d'un style, telle que le natif la dessine : [opacité, rayon, décalage]. */
export function ombreDe(style: unknown): number[] {
  const st = (StyleSheet.flatten(style as never) ?? {}) as ViewStyle;
  const o = typeof st.shadowOpacity === 'number' ? st.shadowOpacity : 0;
  const r = typeof st.shadowRadius === 'number' ? st.shadowRadius : 0;
  const dy = typeof st.shadowOffset?.height === 'number' ? st.shadowOffset.height : 0;
  return [o, r, dy];
}

/**
 * LE FOND DE VERRE d'un élément : à poser en PREMIER enfant, il remplit son
 * parent sans prendre le doigt, à son rayon.
 */
export function FondDeVerre({
  rayon,
  ombre,
  voile = VOILE,
  teinte,
  force = 0.5,
  sombre,
}: {
  /** Le rayon de l'élément ; une pilule peut donner 999, le natif le borne. */
  rayon: number;
  /** Le style de l'élément (ou son jeton d'ombre) : la réplique en reprend l'ombre. */
  ombre?: unknown;
  /** Le voile de la réplique, de 0 (verre nu) à 1. */
  voile?: number;
  /** Une couleur `#RRGGBB` qui teinte le verre (une tuile de l'accueil). */
  teinte?: string;
  /** La force de la teinte, de 0 à 1. */
  force?: number;
  /**
   * Le verre fumé, quel que soit le thème : ce qui flotte sur la caméra du
   * scan, dont les commandes sont sombres dans les deux thèmes.
   */
  sombre?: boolean;
}) {
  const c = useTheme();
  if (!RoomScanVerre) return null;
  const Natif = RoomScanVerre;
  return (
    <Natif
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: rayon }]}
      rayon={rayon}
      sombre={sombre ?? c === dark}
      voile={voile}
      ombre={ombre ? ombreDe(ombre) : [0, 0, 0]}
      teinte={teinte ?? ''}
      force={force}
    />
  );
}
