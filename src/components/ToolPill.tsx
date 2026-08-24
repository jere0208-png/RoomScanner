/**
 * LA PASTILLE D'OUTIL, et le créneau qui la fait entrer en scène.
 *
 * Elles vivaient dans l'écran des résultats — trois mille sept cents
 * lignes, l'écran le plus modifié de l'app. Quatre cents de plus pour un
 * bouton rond et son jeu d'icônes : chaque correction s'y faisait à
 * l'aveugle, et chaque ajout augmentait le risque de déplacer autre chose.
 *
 * Ici, elles ne dépendent de rien : un nom d'icône, un mot, un état, un
 * geste. Les constantes de gabarit sont exportées, parce que les colonnes
 * de l'écran s'alignent dessus — c'est la seule chose qu'il ait encore à
 * savoir de leur dessin.
 */
import React from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import {
  glow,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';

export type ToolIcon =
  | 'plafond'
  | 'note'
  | 'save'
  | 'edit'
  | 'ruler'
  | 'surface'
  | 'elec'
  | 'furniture'
  | 'colors'
  | 'room'
  | 'image'
  | 'model'
  | 'rooms'
  | 'undo'
  /* « Refaire » : la même flèche que l'annulation, retournée. */
  | 'redo'
  | 'square'
  | 'check'
  | 'gaines'
  | 'murs'
  | 'appareil'
  | 'reperes'
  | 'plus';

/*
  LES TRACES VIENNENT DU JEU « SOLAR BOLD » — refonte du patron.

  Le jeu maison au trait (2,4 d'épaisseur) a été remplacé par les
  silhouettes Solar Bold (collection SVGRepo, © Solar Icons, CC BY 4.0),
  vendues en dur par tools/gen-solaires.mjs dans src/ui/solaires.ts :
  une seule main pour tous les menus, et une silhouette porte plus loin
  qu'un contour — c'était déjà la règle du jeu précédent, le nouveau
  l'applique jusqu'au bout.
*/

/** Hauteur du mot : imposée, pour que le calcul ne dépende pas des réglages
 *  de police du téléphone. */
export const PILL_SIZE = 38;
const PILL_LABEL_H = 12;
const PILL_LABEL_GAP = 3;
export const PILL_GAP = 12;
export const PILL_CELL_H = PILL_SIZE + PILL_LABEL_GAP + PILL_LABEL_H;
/** Pas d'une pastille : sa cellule, et l'écart qui la suit. */
export const PILL_PITCH = PILL_CELL_H + PILL_GAP;

/**
 * D'OÙ PART UNE PASTILLE QUAND LA RANGÉE S'OUVRE.
 *
 * Du BAS, et de plus en plus bas à mesure qu'on descend dans les rangs :
 * elles montent du bouton d'édition, qui vit au pied du plan, et se
 * déplient.
 *
 * Elles tombaient du haut — un décalage négatif. C'était juste du temps où
 * le bouton d'édition était en haut de l'écran ; il est descendu, et
 * l'animation est restée. Les calques arrivaient donc du côté opposé au
 * doigt qui venait de les appeler.
 */
export const PILL_DEPART = (index: number) => (index + 1) * PILL_PITCH;
/** Où la rangée d'ancrage se pose, et donc où la colonne commence. */
export const ANCHOR_TOP = 10;

/**
 * Créneau d'une pastille dans la colonne.
 *
 * La pastille remonte vers le bouton d'édition — d'autant plus haut qu'elle
 * en est éloignée — en rapetissant jusqu'à disparaître dedans. Le décalage
 * par rang fait le reste : les pastilles s'y engouffrent l'une après
 * l'autre, et en ressortent dans l'ordre inverse.
 */
export function PillSlot({
  index,
  anim,
  children,
}: {
  index: number;
  anim: Animated.Value;
  children: React.ReactNode;
}) {
  // Le rang n'entre en scène qu'après les précédents, sans jamais dépasser
  // la moitié de la course : à huit pastilles, la dernière partirait sinon
  // quand l'animation est déjà finie.
  const t = anim.interpolate({
    inputRange: [Math.min(0.45, index * 0.08), 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={{
        opacity: t,
        transform: [
          {
            translateY: t.interpolate({
              inputRange: [0, 1],
              outputRange: [PILL_DEPART(index), 0],
            }),
          },
          {
            scale: t.interpolate({
              inputRange: [0, 1],
              outputRange: [0.2, 1],
            }),
          },
        ],
      }}>
      {children}
    </Animated.View>
  );
}

export function ToolPill({
  icon,
  label,
  active,
  onPress,
  node,
  halo,
}: {
  icon: ToolIcon;
  /**
   * Le mot sous la pastille.
   *
   * Une colonne de pictogrammes se devine, elle ne se lit pas : « murs
   * pleins » et « surfaces » ne se distinguent qu'en les essayant, et on ne
   * retient pas l'essai d'une fois sur l'autre. Le mot est discret — dix
   * pixels, gris — mais il enlève toute hésitation.
   */
  label?: string;
  active: boolean;
  onPress: () => void;
  /** Une icône toute faite, quand le jeu maison n'en a pas. */
  node?: React.ReactNode;
  /**
   * Actif = un contour bleu, pastille laissée blanche.
   *
   * Réservé au bouton d'édition. Rempli de bleu comme les autres, il
   * disait « calque affiché » alors qu'il dit « vous êtes en train de
   * modifier » — un état, pas un réglage. Le contour distingue les deux
   * sans emprunter la couleur des calques.
   */
  halo?: boolean;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const plein = active && !halo;
  // Icône noire sur fond blanc ; blanche sur bleu quand l'outil est actif.
  const stroke = plein ? '#FFFFFF' : active ? c.blue : c.ink;
  /**
   * Actif = un contour, POSÉ. Il ne respire plus.
   *
   * Il est passé par un arc tournant, puis par un liséré en fondu. Les deux
   * attiraient l'œil en permanence : quelque chose qui bouge dans un coin
   * de l'écran se lit comme une attente, et il n'y a rien à attendre — le
   * bouton dit seulement « vous êtes en train de modifier ». Un contour
   * franc le dit une fois, et se tait.
   */
  return (
    <View style={styles.toolCell}>
      <TouchableOpacity
        style={[styles.toolPill, plein && styles.toolPillActive]}
        accessibilityLabel={label}
        /**
         * 38 POINTS DESSINÉS, 44 SOUS LE DOIGT.
         *
         * Les pastilles se touchent en colonne, à douze points d'écart :
         * viser la bonne demande de la précision, et un doigt n'en a pas.
         * Le débord ne change rien au dessin — il ne fait qu'élargir la
         * cible, comme le fait iOS partout.
         */
        hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
        onPress={onPress}>
        {halo && active && (
          <View pointerEvents="none" style={styles.toolHalo}>
            {/* Le contour épouse exactement la pastille : un anneau posé
                dessus, ni plus grand ni décalé. */}
            <Svg width={40} height={40} viewBox="0 0 40 40">
              <Rect
                x={2}
                y={2}
                width={36}
                height={36}
                rx={12}
                stroke={c.blue}
                strokeWidth={2.4}
                fill="none"
              />
            </Svg>
          </View>
        )}
        {/* La pastille garde ses 36 px : seul le tracé grossit, pour se
            lire d'un coup d'œil sans élargir la barre d'outils. */}
        {/* Une icône de bibliothèque l'emporte sur le jeu maison : celui-ci
            couvre les gestes de l'app, pas tout le vocabulaire du métier. */}
        {node ?? (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          {/* La silhouette Solar : UN chemin plein — le Bold est un jeu de
              pleins, un rendu au trait le rendrait méconnaissable. */}
          <Path d={SOLAIRES[icon]} fill={stroke} fillRule="evenodd" />
        </Svg>
        )}
      </TouchableOpacity>
      {label ? (
        <Text
          style={[styles.toolLabel, active && styles.toolLabelActive]}
          numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
  toolCell: { width: 58, alignItems: 'center', height: PILL_CELL_H },
  toolLabel: {
    color: c.inkFaint,
    fontSize: 9.5,
    lineHeight: PILL_LABEL_H,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginTop: PILL_LABEL_GAP,
    textAlign: 'center',
  },
  toolLabelActive: { color: c.blue },
  toolPill: {
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: 14,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  // Le liseré épouse la pastille, à deux pixels près.
  // Le liséré fait 40 sur une pastille de 38 : il déborde d'UN point de
  // chaque côté. À −2 il était décalé d'un pixel en haut à gauche — peu de
  // chose, sauf que l'œil compare un contour à la forme qu'il entoure.
  toolHalo: {
    position: 'absolute',
    width: 40,
    height: 40,
    left: -1,
    top: -1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolPillActive: { backgroundColor: c.blue, ...glow(c.blue) },
  }),
);


/**
 * LA RANGÉE DU BAS NE DÉFILE PAS.
 *
 * Relevé du chantier : « évite la possibilité d'un slide, répartis proprement
 * les boutons, et s'il y en a trop pour la ligne, fais-les monter en colonne
 * en bas à droite ». Un rail qui défile cache ce qu'il contient : on ne
 * DEVINE pas qu'il reste deux calques à droite, on croit les avoir tous vus.
 * En 3D il y en a jusqu'à neuf, et les derniers n'existaient pour ainsi dire
 * pas.
 *
 * On compte donc ce que la largeur permet, on répartit ceux-là sur toute la
 * ligne — chacun sa part égale —, et le reste s'empile à droite, au-dessus
 * des actions. Tout est visible d'un coup d'œil, sans un seul geste.
 */
/**
 * LA MARGE DE LA RANGÉE, aux deux bouts de la ligne.
 *
 * C'est le `paddingHorizontal` de `planTools`, et c'est ce qui décale la
 * grille des pastilles. Le peigne « Afficher » compte dessus lui aussi :
 * écrite deux fois, elle a déjà divergé une fois — huit points d'écart sur
 * la dernière descente, un trait à côté de son bouton.
 */
export const MARGE_RANGEE = 10;

export function repartirOutils(
  nombre: number,
  largeur: number,
  /** Place tenue à droite par la colonne d'actions (0 s'il n'y en a pas). */
  reserve: number,
): number {
  const MARGE = MARGE_RANGEE;
  const dispo = Math.max(0, largeur - reserve - 2 * MARGE);
  // Largeur d'accueil : la cellule, et l'écart qui la suit.
  const tiennent = Math.floor((dispo + PILL_GAP) / (PILL_CELL_W + PILL_GAP));
  return Math.max(1, Math.min(nombre, tiennent));
}

/** Largeur d'une cellule d'outil, mot compris. */
export const PILL_CELL_W = 58;
