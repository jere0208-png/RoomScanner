/**
 * LE TOTAL DU DEVIS, POSÉ SUR LE PLAN.
 *
 * DEUX VERSIONS, ET LA PREMIÈRE DEMANDAIT UNE QUESTION AU LIEU D'Y RÉPONDRE.
 *
 *   PREMIÈRE VERSION — relevé du patron : « un bouton animé comme l'icône
 *   normes, mais en vert, avec € et ? qui alternent — pour faire comprendre
 *   combien j'en aurais pour mon installation actuelle ». Elle posait donc
 *   la question à l'écran, en fondu, toutes les deux secondes.
 *
 *   RETIRÉE, sur relevé du même patron une fois le devis en main : « modifie
 *   le en un bouton pas dynamique, discret, où on affiche le € total mis à
 *   jour à chaque modification ». Il a raison, et c'est une leçon qui vaut
 *   au-delà de ce bouton : **une fois qu'on sait répondre, on ne demande
 *   plus**. « € ? » clignotant invitait à ouvrir une page pour connaître un
 *   chiffre qu'on pouvait écrire là, tout de suite. Et un bouton qui bat en
 *   permanence sur un plan qu'on lit finit par se faire couvrir de la main.
 *
 * IL EST DONC DISCRET, ET IL DIT LE PRIX. Pas d'onde, pas de fondu, pas de
 * couleur pleine : un contour vert, le total, et rien d'autre. Il se remet à
 * jour tout seul — poser une prise le fait monter — ce qui en fait un
 * compteur qu'on surveille du coin de l'œil pendant qu'on pose.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/**
 * LE PRIX, ÉCRIT COURT.
 *
 * Sur un bouton posé au-dessus d'un plan, « 1 284,50 € » prend la largeur
 * de deux pièces. On arrondit donc à l'euro, et au-delà de mille on passe au
 * millier avec une décimale : « 1,3 k€ ». Personne ne décide rien sur le
 * centime d'une estimation — et celui qui veut le centime ouvre la page,
 * c'est à cela qu'elle sert.
 */
export function prixCourt(total: number): string {
  if (total >= 1000) {
    return `${(Math.round(total / 100) / 10).toFixed(1).replace('.', ',')} k€`;
  }
  return `${Math.round(total)} €`;
}

export function DevisPastille({
  /**
   * Le total du devis, TTC. `null` quand il n'y a rien à chiffrer.
   *
   * Un logement sans un seul appareil posé n'a pas de prix — il a un plan.
   * Le bouton reste alors gris et muet, comme celui des normes devant une
   * installation qui n'a pas commencé : afficher « 0 € » est une réponse,
   * mais pas la bonne.
   */
  total,
  onPress,
}: {
  total: number | null;
  onPress: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const actif = total !== null && total > 0;
  const teinte = actif ? c.green : c.inkFaint;

  return (
    <TouchableOpacity
      accessibilityLabel={
        actif
          ? `Devis — environ ${Math.round(total)} euros de fourniture`
          : 'Devis — rien de posé à chiffrer'
      }
      accessibilityRole="button"
      activeOpacity={0.8}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={[styles.bouton, { borderColor: teinte }]}
      onPress={onPress}>
      <Text style={[styles.prix, { color: teinte }]} numberOfLines={1}>
        {actif ? prixCourt(total) : '—'}
      </Text>
    </TouchableOpacity>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    /*
      LA MÊME HAUTEUR QUE LA PASTILLE DES NORMES, mais une largeur libre :
      elles sont côte à côte, et deux boutons voisins de hauteurs
      différentes se lisent comme deux rangées. Le mot, lui, décide de la
      largeur — « 12 € » ne doit pas occuper la place de « 1,3 k€ ».
    */
    bouton: {
      height: 30,
      minWidth: 30,
      paddingHorizontal: 10,
      borderRadius: 15,
      borderWidth: 2,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.1,
    },
    prix: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  }),
);
