/**
 * LA VIGNETTE D'UN APPAREIL — la photo du produit qu'on achète, et pour un
 * poste combiné ses deux visages, unis d'un « + ».
 *
 * Relevé du patron, sur le catalogue : « refais les choix en images
 * réalistes, pas icônes. Comme le devis », puis « "TV + prise" affiche que
 * la TV : on doit voir les deux images avec un + au centre ». Le catalogue
 * et le dock de l'établi montrent la même chose : elle vit ici, une fois.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VignetteProduit } from './VignetteProduit';
import { FIXTURES, type FixtureKind } from '../geometry/electrical';
import { useTheme } from '../theme';

/** Les postes combinés : deux mécanismes sous une plaque. */
export const DUOS: Partial<Record<string, [string, string]>> = {
  tvPrise: ['meca-tv', 'meca-prise'],
  rjPrise: ['meca-rj45', 'meca-prise'],
  rjPrise2: ['meca-rj45', 'meca-prise'],
};

export function VignetteAppareil({ kind, taille = 52 }: { kind: FixtureKind; taille?: number }) {
  const c = useTheme();
  const spec = FIXTURES[kind];
  const duo = DUOS[kind];
  if (duo) {
    const demi = Math.round(taille * 0.58);
    return (
      <View style={styles.duo}>
        <VignetteProduit code={duo[0]} libelle={spec.label} taille={demi} />
        <Text style={[styles.plus, { color: c.inkFaint }]}>+</Text>
        <VignetteProduit code={duo[1]} libelle={spec.label} taille={demi} />
      </View>
    );
  }
  return <VignetteProduit code={`meca-${kind}`} libelle={spec.label} taille={taille} />;
}

const styles = StyleSheet.create({
  duo: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  plus: { fontSize: 13, fontWeight: '700' },
});
