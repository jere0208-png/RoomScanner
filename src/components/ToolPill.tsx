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
import {
  glow,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';

export type ToolIcon =
  | 'plafond'
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
  | 'square'
  | 'check'
  | 'gaines'
  | 'murs'
  | 'plus';

/** Tracés 24×24 des icônes d'outils (trait simple, lisible en 18 px). */
const TOOL_PATHS: Record<ToolIcon, { d: string; fill?: boolean }[]> = {
  // Murs pleins : un pan hachuré, comme un mur poché sur un plan.
  murs: [
    { d: 'M4 6 h16 v12 H4 z' },
    { d: 'M4 12 h16' },
    { d: 'M12 6 v6' },
    { d: 'M8 12 v6' },
    { d: 'M16 12 v6' },
  ],
  // Cheminement : un câble qui longe deux murs et remonte.
  gaines: [
    { d: 'M4 20 h9 a3 3 0 0 0 3 -3 V7' },
    { d: 'M13 4 h6 v3 h-6 z' },
    { d: 'M4 17.5 v5' },
  ],
  ruler: [
    { d: 'M3.5 9 h17 a1.5 1.5 0 0 1 1.5 1.5 v3 a1.5 1.5 0 0 1 -1.5 1.5 h-17 a1.5 1.5 0 0 1 -1.5 -1.5 v-3 a1.5 1.5 0 0 1 1.5 -1.5 z' },
    { d: 'M7.5 9 v3' },
    { d: 'M11.5 9 v3' },
    { d: 'M15.5 9 v3' },
  ],
  surface: [
    { d: 'M5 5 h14 a1.5 1.5 0 0 1 1.5 1.5 v11 a1.5 1.5 0 0 1 -1.5 1.5 h-14 a1.5 1.5 0 0 1 -1.5 -1.5 v-11 A1.5 1.5 0 0 1 5 5 z' },
    { d: 'M9 10 h0.01' },
    { d: 'M15 10 h0.01' },
    { d: 'M12 14 h0.01' },
  ],
  furniture: [
    { d: 'M6.5 10 V8 a2.5 2.5 0 0 1 2.5 -2.5 h6 A2.5 2.5 0 0 1 17.5 8 v2' },
    { d: 'M4.5 10.5 h15 v5 h-15 z' },
    { d: 'M6.5 15.5 v2.5' },
    { d: 'M17.5 15.5 v2.5' },
  ],
  colors: [
    { d: 'M12 3.5 C15 7.5 17.5 10 17.5 13 a5.5 5.5 0 1 1 -11 0 C6.5 10 9 7.5 12 3.5 z' },
  ],
  room: [
    { d: 'M4.5 5 h8.5 a2 2 0 0 1 1.4 0.6 l5.4 5.4 a1.4 1.4 0 0 1 0 2 l-5.4 5.4 a2 2 0 0 1 -1.4 0.6 h-8.5 z' },
    { d: 'M8.5 9.5 h0.01' },
  ],
  image: [
    { d: 'M4.5 5.5 h15 a1.5 1.5 0 0 1 1.5 1.5 v10 a1.5 1.5 0 0 1 -1.5 1.5 h-15 A1.5 1.5 0 0 1 3 17 V7 a1.5 1.5 0 0 1 1.5 -1.5 z' },
    { d: 'M9 10 h0.01' },
    { d: 'M5.5 16.5 l4.5 -4.5 3 3 3 -3 3 3' },
  ],
  model: [
    { d: 'M12 3.2 l7.8 4.4 v8.8 L12 20.8 l-7.8 -4.4 V7.6 z' },
    { d: 'M12 12 l7.8 -4.4 M12 12 L4.2 7.6 M12 12 v8.8' },
  ],
  // L'éclair : le seul symbole que personne n'a besoin qu'on lui explique.
  elec: [{ d: 'M13.5 2.5 L5.5 13.5 h5 l-1 8 8 -11 h-5 z', fill: true }],
  // Le « + » de l'appareillage electrique.
  plus: [{ d: 'M12 5 v14' }, { d: 'M5 12 h14' }],
  // Loupe : ce que le plan a d'incertain.
  check: [
    { d: 'M11 3.5 a7.5 7.5 0 1 0 0 15 a7.5 7.5 0 1 0 0 -15 z' },
    { d: 'M16.5 16.5 L21 21' },
    { d: 'M11 7.5 v4' },
    { d: 'M11 14.5 h0.01' },
  ],
  // Équerre de dessinateur : le geste de remettre le plan d'aplomb.
  square: [
    { d: 'M4 4.5 v15 h15' },
    { d: 'M4 19.5 L19 4.5' },
    { d: 'M8.5 15 h3 v3' },
  ],
  undo: [
    { d: 'M4.5 12 a7.5 7.5 0 1 0 2.2 -5.3' },
    { d: 'M4.2 3.8 v4.4 h4.4' },
  ],
  rooms: [
    { d: 'M3.5 5.5 h7 v6 h-7 z' },
    { d: 'M13.5 5.5 h7 v13 h-7 z' },
    { d: 'M3.5 13.5 h7 v5 h-7 z' },
  ],
  /**
   * Le crayon, recentré dans son cadre.
   *
   * Son tracé occupait x 4→21,3 et y 2,7→20 : le centre de l'encre
   * tombait à (12,65 ; 11,35) quand celui de la boîte est à (12 ; 12). La
   * pointe du crayon dépassant en haut à droite, l'icône paraissait
   * poussée dans ce coin — d'autant plus visible que la pastille porte un
   * contour, qui donne l'œil un repère. Décalée de (−0,65 ; +0,65).
   */
  // Un plafond vu en coupe : la dalle, et le point lumineux dessous.
  plafond: [
    { d: 'M3.5 6 h17' },
    { d: 'M12 6 v3.5' },
    { d: 'M7.5 15 a4.5 4.5 0 0 1 9 0 z' },
    { d: 'M6 18.5 h12' },
  ],
  save: [
    { d: 'M12 3.5 v10.5' },
    { d: 'M7.4 9.6 L12 14.2 l4.6 -4.6' },
    { d: 'M5 19.5 h14' },
  ],
  edit: [
    { d: 'M10.35 4.65 H5.35 a2 2 0 0 0 -2 2 v12 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 v-5' },
    { d: 'M17.65 3.35 l3 3 L10.55 16.45 l-4.1 1.1 1.1 -4.1 z' },
  ],
};

/**
 * Interrupteur de vue, à pouce glissant.
 *
 * Le pavé actif sautait d'un onglet à l'autre : rien ne reliait les deux
 * états, et c'est exactement ce qui date une interface. Il glisse désormais,
 * sur un ressort — le mouvement dit d'où l'on vient.
 */

/** Hauteur du mot : imposée, pour que le calcul ne dépende pas des réglages
 *  de police du téléphone. */
export const PILL_SIZE = 38;
const PILL_LABEL_H = 12;
const PILL_LABEL_GAP = 3;
/** Le même écart partout : entre deux pastilles, et sous l'ancrage. */
export const PILL_GAP = 12;
export const PILL_CELL_H = PILL_SIZE + PILL_LABEL_GAP + PILL_LABEL_H;
/** Pas d'une pastille : sa cellule, et l'écart qui la suit. */
export const PILL_PITCH = PILL_CELL_H + PILL_GAP;
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
              outputRange: [-(index + 1) * PILL_PITCH, 0],
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
                strokeWidth={2.2}
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
          {TOOL_PATHS[icon].map((seg, i) => (
            <Path
              key={i}
              d={seg.d}
              stroke={stroke}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
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
export function repartirOutils(
  nombre: number,
  largeur: number,
  /** Place tenue à droite par la colonne d'actions (0 s'il n'y en a pas). */
  reserve: number,
): number {
  const MARGE = 10;
  const dispo = Math.max(0, largeur - reserve - 2 * MARGE);
  // Largeur d'accueil : la cellule, et l'écart qui la suit.
  const tiennent = Math.floor((dispo + PILL_GAP) / (PILL_CELL_W + PILL_GAP));
  return Math.max(1, Math.min(nombre, tiennent));
}

/** Largeur d'une cellule d'outil, mot compris. */
export const PILL_CELL_W = 58;
