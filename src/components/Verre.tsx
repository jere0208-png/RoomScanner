/**
 * LE VERRE DE L'APPLICATION — une seule matière, une seule règle.
 *
 * Relevés du patron : « le menu doit s'ouvrir telle une bulle Apple, en
 * verre », puis « pour une cohérence dans toute l'app, mets ce léger effet
 * transparent glass là où tu le juges nécessaire, comme sur les quatre cartes
 * de l'accueil — agis comme un professionnel investi dans la cohérence de
 * l'app, pour ne pas perturber l'utilisateur dans son expérience ».
 *
 * LE VERRE A DÉJÀ ÉTÉ RETIRÉ DEUX FOIS, et pour de bonnes raisons — « les
 * boutons grisés », « le contour de faible qualité qui présente des pixels »,
 * « le bouton plus petit que le texte ». Ce composant les règle à la source :
 *
 *   — JAMAIS GRIS. Le matériau seul prend la couleur de ce qu'il couvre : sur
 *     la page gris clair, un bouton devenait gris clair, la couleur d'un
 *     bouton éteint. Le voile est dense (blanc à 70 % par défaut) : le verre
 *     reste un blanc net, qui laisse passer un soupçon de ce qu'il couvre.
 *   — AUCUN FILET DESSINÉ PAR REACT NATIVE. Le liseré est celui de la couche
 *     native, vectoriel.
 *   — LA FORME EST CELLE DE L'ÉLÉMENT. Le verre remplit l'élément qui le
 *     porte, quelle que soit sa taille : c'est l'élément qui décide, son mot
 *     ne peut plus en sortir. Et il garde SON ombre (`ombre`), calculée sur la
 *     forme : la même que quand il était plein.
 *
 * LA RÈGLE : LE VERRE EST POUR CE QUI FLOTTE. Ce qui se pose PAR-DESSUS un
 * contenu qu'on continue de regarder — le plan, la caméra du scan, la visite —
 * est en verre : on garde sous les yeux, flouté, ce qu'il recouvre. Les quatre
 * tuiles de l'accueil aussi, en verre TEINTÉ de leur couleur, posé sur une
 * lumière à flouter. Ce qui se LIT longtemps — une feuille, une liste de
 * plans, le devis — reste plein ; et les pastilles dont l'anneau porte un
 * sens (le prix, le contrôle) aussi : la couleur y est le message.
 *
 * Sans le natif (Android, banc d'essai), rien ne change : chaque élément
 * garde son fond plein et son ombre.
 */
import React, { useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { RoomScanVerre } from 'react-native-room-scan';
import { dark, useTheme } from '../theme';

/** Le verre est-il là ? (le natif iOS) — sinon, les fonds pleins restent. */
export const VERRE = !!RoomScanVerre;

/** Le voile par défaut : un blanc net, jamais le gris d'un bouton éteint. */
export const VOILE = 0.7;

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
 * parent sans prendre le doigt.
 */
export function FondDeVerre({
  rayon,
  ombre,
  voile = VOILE,
  teinte,
  force = 0.62,
  reflet = true,
  sombre,
}: {
  /** Le rayon de l'élément ; une pilule peut donner 999, il est borné. */
  rayon: number;
  /**
   * Le style de l'élément (ou son jeton d'ombre) : le verre en reprend
   * l'ombre, que `SUR_VERRE` lui a retirée. Rien : pas d'ombre.
   */
  ombre?: unknown;
  /** La densité du voile, de 0 (verre nu) à 1 (plein). */
  voile?: number;
  /** Une couleur `#RRGGBB` qui teinte le verre (une tuile de l'accueil). */
  teinte?: string;
  /** L'opacité de la teinte, de 0 à 1. */
  force?: number;
  reflet?: boolean;
  /**
   * Le verre fumé, quel que soit le thème : ce qui flotte sur la caméra du
   * scan, dont les commandes sont sombres dans les deux thèmes.
   */
  sombre?: boolean;
}) {
  const c = useTheme();
  const [taille, setTaille] = useState<{ w: number; h: number } | null>(null);
  if (!RoomScanVerre) return null;
  const Natif = RoomScanVerre;
  const fume = sombre ?? c === dark;
  /* Une pilule (rayon 999) se borne à sa demi-hauteur : le reflet se dessine
     sur ce rayon, et un reflet plus rond que sa forme se verrait. */
  const r = taille ? Math.min(rayon, taille.w / 2, taille.h / 2) : rayon;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!taille || Math.abs(taille.w - width) > 1 || Math.abs(taille.h - height) > 1) {
          setTaille({ w: width, h: height });
        }
      }}>
      <Natif
        style={StyleSheet.absoluteFill}
        rayon={r}
        sombre={fume}
        voile={voile}
        ombre={ombre ? ombreDe(ombre) : [0, 0, 0]}
        pointerEvents="none"
      />
      {teinte ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: teinte, opacity: force }]}
        />
      ) : null}
      {reflet && taille ? (
        <Svg style={StyleSheet.absoluteFill} width={taille.w} height={taille.h} pointerEvents="none">
          <Defs>
            <LinearGradient id="reflet-du-verre" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={fume ? 0.12 : 0.4} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={taille.w} height={taille.h} rx={r} fill="url(#reflet-du-verre)" />
        </Svg>
      ) : null}
    </View>
  );
}
