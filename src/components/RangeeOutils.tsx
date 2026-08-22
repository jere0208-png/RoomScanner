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
import { Animated, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { PILL_GAP, PillSlot, repartirOutils } from './ToolPill';

/** Hauteur des descentes du peigne, et sa place au-dessus de la rangée. */
const PEIGNE_H = 14;
const PEIGNE_BAS = 74;
/** Le trait du peigne : une annotation, pas un cadre — donc discret. */
const TRAIT_PEIGNE = '#B6BECB';

export function RangeeOutils({
  elements,
  largeur,
  reserve,
  bas,
  dessus,
  anim,
  styles,
  edition = false,
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
  /** En édition, chaque bouton fait autre chose : pas de titre commun. */
  edition?: boolean;
}) {
  // Tant que la carte n'est pas mesurée, on suppose qu'ils tiennent tous :
  // une rangée complète qui se replie à la première image se verrait.
  const tiennent = largeur > 0 ? repartirOutils(elements.length, largeur, reserve) : elements.length;
  const rangee = elements.slice(0, tiennent);
  const colonne = elements.slice(tiennent);
  /*
    LE PEIGNE « AFFICHER » — croquis Paint du patron.

    Rien ne disait ce que ces boutons font. « Meubles », « Appareils »,
    « Surfaces », « Nord » : quatre mots qui NOMMENT une chose sans dire ce
    qu'on en fait — on peut aussi bien croire qu'on va en ajouter un. Ce
    sont des interrupteurs de calque, et le seul geste possible est de les
    allumer ou de les éteindre.

    Le peigne le dit d'un dessin : un mot, une barre, une descente par
    bouton. C'est ainsi qu'on annote un plan, et c'est ce que
    l'électricien lit tous les jours sur ses schémas.

    Il se dessine à partir des PARTS ÉGALES de la rangée — les mêmes que
    les pastilles —, donc chaque descente tombe pile au milieu de la sienne,
    quel que soit leur nombre.
  */
  const largeurUtile = Math.max(0, largeur - (reserve || 4) - 4);
  const part = rangee.length > 0 ? largeurUtile / rangee.length : 0;
  const peigne = !edition && rangee.length > 1 && part > 0;
  return (
    <>
      {peigne && (
        <View
          style={[styles.peigne, { bottom: bas + PEIGNE_BAS, right: reserve || 4 }]}
          pointerEvents="none">
          <Text style={styles.peigneMot}>Afficher</Text>
          <Svg width={largeurUtile} height={PEIGNE_H}>
            {/* La barre ne court que d'une descente à l'autre : débordante,
                elle ferait un cadre, et l'on annoterait la carte entière. */}
            <Line
              x1={part / 2}
              y1={1}
              x2={largeurUtile - part / 2}
              y2={1}
              stroke={TRAIT_PEIGNE}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            {rangee.map((el, i) => (
              <Line
                key={el.key}
                x1={part * (i + 0.5)}
                y1={1}
                x2={part * (i + 0.5)}
                y2={PEIGNE_H - 1}
                stroke={TRAIT_PEIGNE}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ))}
          </Svg>
        </View>
      )}
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
