/**
 * LA BARRE DU TRACÉ DES MURS — relevé du patron : « ajouter un mur
 * exactement là où on le souhaite ; structurer une pièce à partir de rien ».
 *
 * Elle dit, à chaque instant, le PROCHAIN geste (poser le premier coin, le
 * suivant, refermer), et offre ce qu'il faut sous le pouce :
 *   — « Cote » : taper la longueur du mur suivant, ou corriger celle du
 *     dernier — souvent le plus simple, puisqu'on a le mètre à la main ;
 *   — « Annuler » : le dernier coin seulement ;
 *   — « Fermer » : la pièce, dès trois coins ;
 *   — « Terminer » : pose ce qui est tracé et sort du mode ;
 * et, en dessous, l'aimant (à couper pour un mur de biais quelconque) et
 * l'épaisseur des murs à venir. Même famille de bandeau que les autres
 * barres du plan (`SelectionMeublesBar`).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { CarteDuMenu, IconeBandeau } from './StripBar';
import type { Palette } from '../theme';
import { EPAISSEURS } from '../geometry/floorplan';

/** Ce que la barre dit du prochain geste, selon le tracé. */
export function consigneDuTrace(coins: number): string {
  if (coins === 0) return 'Touchez le plan pour poser le premier coin.';
  if (coins === 1) return 'Posez le coin suivant — glissez pour viser au centimètre.';
  if (coins === 2) return 'Coin suivant, ou « Terminer » pour un mur seul.';
  return 'Touchez le premier coin pour fermer la pièce.';
}

/** « Cloison · 7 cm » : le mot du commerce et sa cote. */
export function motDEpaisseur(m: number): string {
  const e = EPAISSEURS.find((x) => Math.abs(x.m - m) < 1e-6);
  const cm = Math.round(m * 100);
  return e ? `${e.mot} · ${cm} cm` : `${cm} cm`;
}

export function TraceMursBar({
  coins,
  aimant,
  epaisseur,
  styles,
  palette,
  onCote,
  onAnnulerCoin,
  onFermer,
  onTerminer,
  onAimant,
  onEpaisseur,
}: {
  coins: number;
  aimant: boolean;
  epaisseur: number;
  styles: Record<string, object>;
  palette: Palette;
  onCote: () => void;
  onAnnulerCoin: () => void;
  onFermer: () => void;
  onTerminer: () => void;
  onAimant: () => void;
  onEpaisseur: () => void;
}) {
  const geste = (label: string, mot: string, d: string, teinte: string, onPress: () => void, actif = true) => (
    <View style={[styles.bandeauCellule, !actif && local.eteint]}>
      <TouchableOpacity
        style={styles.iconBtn}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !actif }}
        disabled={!actif}
        onPress={onPress}>
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path d={d} fill={teinte} fillRule="evenodd" />
        </Svg>
      </TouchableOpacity>
      <Text style={styles.bandeauMot}>{mot}</Text>
    </View>
  );
  const pastille = (label: string, texte: string, onPress: () => void, allumee: boolean) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={[local.pastille, { borderColor: allumee ? palette.blue : palette.line, backgroundColor: allumee ? palette.blueSoft : 'transparent' }]}
      onPress={onPress}>
      <Text style={[local.pastilleTexte, { color: allumee ? palette.blueDark : palette.ink }]}>{texte}</Text>
    </TouchableOpacity>
  );
  return (
    <CarteDuMenu style={styles.bandeau}>
      <View style={styles.bandeauEntete}>
        <IconeBandeau icone={SOLAIRES.murs} styles={styles} />
        <View style={styles.bandeauTexte}>
          <Text style={styles.bandeauTitre} numberOfLines={1}>
            Tracer des murs
          </Text>
          <Text style={[local.aide, { color: palette.inkSoft }]} numberOfLines={2} accessibilityLiveRegion="polite">
            {consigneDuTrace(coins)}
          </Text>
        </View>
        <View style={styles.bandeauGestes}>
          {geste('Taper une cote', 'Cote', SOLAIRES.longueur, palette.blue, onCote, coins >= 1)}
          {geste('Annuler le dernier coin', 'Annuler', SOLAIRES.undo, palette.ink, onAnnulerCoin, coins >= 1)}
          {geste('Fermer la pièce', 'Fermer', SOLAIRES.rooms, palette.blue, onFermer, coins >= 3)}
          {geste('Terminer le tracé', 'Terminer', SOLAIRES.valider, palette.blue, onTerminer)}
        </View>
      </View>
      <View style={[local.reglages, styles.bandeauFilet]}>
        {pastille(aimant ? 'Aimant activé, toucher pour le couper' : 'Aimant coupé, toucher pour l’activer', aimant ? 'Aimant : oui' : 'Aimant : non', onAimant, aimant)}
        {pastille('Épaisseur des murs', motDEpaisseur(epaisseur), onEpaisseur, false)}
      </View>
    </CarteDuMenu>
  );
}

const local = StyleSheet.create({
  aide: { fontSize: 12 },
  eteint: { opacity: 0.35 },
  reglages: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, flexWrap: 'wrap' },
  pastille: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  pastilleTexte: { fontSize: 13, fontWeight: '600' },
});
