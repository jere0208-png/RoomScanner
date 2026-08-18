/**
 * LA RANGÉE DE CALQUES, AU PIED DU PLAN — ET SANS DÉFILEMENT.
 *
 * Relevé du chantier : « évite la possibilité d'un slide, répartis proprement
 * les boutons, et s'il y en a trop pour la ligne du bas, fais-les monter en
 * colonne à droite ».
 *
 * Un rail qui défile ment sur son contenu : rien ne dit qu'il reste deux
 * calques hors champ, et on croit les avoir tous vus. En 3D il y en a jusqu'à
 * neuf — les derniers n'existaient pour ainsi dire pas.
 *
 * Ce composant compte donc ce que la largeur permet, donne à chacun de ceux-là
 * une part ÉGALE de la ligne, et empile le reste à droite, au-dessus de la
 * colonne des actions. Tout se voit d'un coup d'œil, sans un seul geste.
 */
import React from 'react';
import { Animated, View } from 'react-native';
import { PILL_GAP, PillSlot, repartirOutils } from './ToolPill';

export function RangeeOutils({
  elements,
  largeur,
  reserve,
  bas,
  dessus,
  anim,
  styles,
}: {
  elements: React.ReactElement[];
  /** Largeur de la carte du plan. */
  largeur: number;
  /** Place tenue à droite par la colonne d'actions (0 s'il n'y en a pas). */
  reserve: number;
  /** Ligne de fond : au-dessus de l'indicateur d'accueil. */
  bas: number;
  /** Hauteur à franchir pour poser le trop-plein au-dessus des actions. */
  dessus: number;
  anim: Animated.Value;
  styles: Record<string, object>;
}) {
  // Tant que la carte n'est pas mesurée, on suppose qu'ils tiennent tous :
  // une rangée complète qui se replie à la première image se verrait.
  const tiennent = largeur > 0 ? repartirOutils(elements.length, largeur, reserve) : elements.length;
  const rangee = elements.slice(0, tiennent);
  const colonne = elements.slice(tiennent);
  return (
    <>
      <View
        style={[styles.planTools, { bottom: bas, right: reserve || 4 }]}
        pointerEvents="box-none">
        {rangee.map((el, i) => (
          // Chacun sa part de la ligne : les pastilles restent à égale
          // distance quel que soit leur nombre, et le mot dessous garde sa
          // place au centre de sa part.
          <View key={el.key} style={styles.toolPart} pointerEvents="box-none">
            <PillSlot index={i} anim={anim}>
              {el}
            </PillSlot>
          </View>
        ))}
      </View>
      {colonne.length > 0 && (
        <View
          style={[styles.planToolsSuite, { bottom: bas + dessus }]}
          pointerEvents="box-none">
          {colonne.map((el, i) => (
            <PillSlot key={el.key} index={rangee.length + i} anim={anim}>
              {el}
            </PillSlot>
          ))}
        </View>
      )}
    </>
  );
}

/** L'écart entre deux pastilles, réexporté pour les écrans qui composent. */
export { PILL_GAP };
