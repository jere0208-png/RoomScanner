/**
 * L'AVATAR — un rond, une initiale, et c'est une porte vers le compte.
 *
 * Relevé du patron : « l'icône profil et le nom en bleu clair, ça fait
 * cheap ». Le nom n'a rien à faire sur l'accueil : on sait qui l'on est.
 * Les grandes applications posent un rond en haut à droite — l'initiale sur
 * un gris doux, ou la photo — et rien d'autre ; c'est ce rond qu'on
 * reconnaît d'une application à l'autre. Sans compte, une silhouette.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AvatarGlyph } from './AvatarGlyph';
import { themedStyles, useTheme, type Palette } from '../theme';

/** La lettre qu'on affiche : le prénom, sinon l'adresse, sinon rien. */
export function initialeDe(compte: { prenom?: string; email?: string } | null | undefined): string {
  const source = compte?.prenom?.trim() || compte?.email?.trim() || '';
  const lettre = source.charAt(0);
  return lettre ? lettre.toLocaleUpperCase('fr') : '';
}

export function Avatar({
  compte,
  taille = 38,
}: {
  compte: { prenom?: string; email?: string } | null | undefined;
  taille?: number;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const initiale = initialeDe(compte);
  return (
    <View
      style={[s.rond, { width: taille, height: taille, borderRadius: taille / 2 }]}
      pointerEvents="none">
      {initiale ? (
        <Text style={[s.lettre, { fontSize: taille * 0.42 }]}>{initiale}</Text>
      ) : (
        <AvatarGlyph size={taille * 0.62} teinte={c.inkSoft} />
      )}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    rond: {
      backgroundColor: c.surfaceSunken,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lettre: { color: c.ink, fontWeight: '600' },
  }),
);
