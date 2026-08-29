/**
 * LE QUADRILLAGE — le papier sur lequel cette application dessine.
 *
 * Relevé du patron : « l'accueil doit être moderne, avec un design épuré mais
 * bien pensé qui rappelle le but de l'app (architecture, plan, etc.). Par
 * exemple pour les boutons, ils seraient dans un quadrillage avec les côtés
 * fondus. »
 *
 * C'EST LE SEUL MOTIF QUI DIT LE MÉTIER SANS UN MOT. Une application qui relève
 * des logements n'a pas besoin d'un pictogramme de maison pour se présenter :
 * elle a besoin du papier sur lequel on trace. Un quadrillage au centimètre,
 * c'est le calque de l'architecte, la feuille du métreur, le fond du plan qu'on
 * va produire — et c'est déjà la trame du sol de la vue 3D, ce qui fait de
 * l'accueil la première page du même dessin.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES CÔTÉS SE FONDENT, ET C'EST UN DÉGRADÉ, PAS UN MASQUE.
 *
 * Un quadrillage qui s'arrête net a un BORD, et un bord fait de lui un
 * rectangle posé sur l'écran — un objet de plus. Fondu, il devient le papier :
 * on ne sait plus où il commence, donc on ne le regarde plus, et c'est
 * exactement ce qu'on demande à un fond.
 *
 * DEUX FAÇONS DE FONDRE, ET UNE SEULE EST JUSTE ICI. Faire varier l'opacité
 * LIGNE PAR LIGNE — les lignes du haut plus pâles que celles du milieu — fond
 * le quadrillage vers le haut et le bas, mais chaque ligne garde ses deux bouts
 * francs : on voit une grille aux bords coupés dont la densité change. Le trait
 * doit se fondre SUR SA PROPRE LONGUEUR, et cela demande un dégradé porté par
 * le TRAIT lui-même.
 *
 * D'où deux dégradés seulement — un par direction —, partagés par toutes les
 * lignes : ce n'est pas une économie, c'est la seule façon d'avoir le même
 * fondu partout.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Stop } from 'react-native-svg';
import type { Palette } from '../theme';

/**
 * LE PAS DU QUADRILLAGE, en points.
 *
 * Vingt-six : assez serré pour lire « papier millimétré » d'un coup d'œil,
 * assez large pour qu'un écran de téléphone n'en montre pas cent cinquante —
 * au-delà, ce n'est plus une trame, c'est un tissu, et le texte posé dessus
 * devient pénible à lire.
 */
export const PAS_QUADRILLAGE = 26;

/** Une ligne sur CINQ est plus marquée : c'est ce qui fait le papier à carreaux. */
const TOUS_LES = 5;

export function Quadrillage({
  width,
  height,
  palette,
  /**
   * L'INTENSITÉ GÉNÉRALE — de zéro à un.
   *
   * L'accueil la veut basse : le quadrillage y est un fond, et un fond qui se
   * remarque a déjà échoué. Une illustration, elle, peut la monter.
   */
  force = 1,
  style,
  cle = 'q',
}: {
  width: number;
  height: number;
  palette: Palette;
  force?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * DE QUOI NOMMER SES DÉGRADÉS À LUI.
   *
   * Deux quadrillages dans le même écran — le fond, et celui d'une carte —
   * poseraient deux fois le même `id`, et c'est le dernier qui gagnerait pour
   * les deux. Le piège est le même que celui du plan rappelé dans la feuille
   * du dossier, et il se règle pareil : chacun ses noms.
   */
  cle?: string;
}) {
  if (width <= 0 || height <= 0) return null;
  const colonnes = Math.ceil(width / PAS_QUADRILLAGE);
  const lignes = Math.ceil(height / PAS_QUADRILLAGE);
  const teinte = palette.ink;
  /*
    L'ENCRE DU THÈME, TRÈS DILUÉE. On ne prend pas une couleur à part : le
    quadrillage est du papier, et le papier n'a pas de couleur propre — il a
    celle de ce qu'on écrit dessus, en beaucoup plus pâle.
  */
  const faible = 0.05 * force;
  const fort = 0.1 * force;

  const trait = (k: number) => (k % TOUS_LES === 0 ? fort : faible);

  return (
    <View style={[styles.zone, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {/*
            LE FONDU EST PORTÉ PAR LE TRAIT. Transparent aux deux bouts, plein
            au milieu : c'est ce qui fait qu'une ligne n'a pas de fin visible.
          */}
          <LinearGradient id={`qh${cle}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={teinte} stopOpacity={0} />
            <Stop offset="0.22" stopColor={teinte} stopOpacity={1} />
            <Stop offset="0.78" stopColor={teinte} stopOpacity={1} />
            <Stop offset="1" stopColor={teinte} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`qv${cle}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={teinte} stopOpacity={0} />
            <Stop offset="0.22" stopColor={teinte} stopOpacity={1} />
            <Stop offset="0.78" stopColor={teinte} stopOpacity={1} />
            <Stop offset="1" stopColor={teinte} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {Array.from({ length: lignes + 1 }, (_, k) => (
          <Line
            key={`h${k}`}
            testID="trait-quadrillage"
            x1={0}
            y1={k * PAS_QUADRILLAGE}
            x2={width}
            y2={k * PAS_QUADRILLAGE}
            stroke={`url(#qh${cle})`}
            strokeWidth={1}
            opacity={trait(k)}
          />
        ))}
        {Array.from({ length: colonnes + 1 }, (_, k) => (
          <Line
            key={`v${k}`}
            testID="trait-quadrillage"
            x1={k * PAS_QUADRILLAGE}
            y1={0}
            x2={k * PAS_QUADRILLAGE}
            y2={height}
            stroke={`url(#qv${cle})`}
            strokeWidth={1}
            opacity={trait(k)}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Un fond ne pousse rien et ne reçoit jamais le doigt. */
  zone: { position: 'absolute', top: 0, left: 0 },
});
