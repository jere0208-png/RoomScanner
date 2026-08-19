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
  | 'appareil'
  | 'reperes'
  | 'plus';

/**
 * LES TRACÉS DES ICÔNES, EN 24 × 24.
 *
 * Trois règles, tenues pour tout le jeu.
 *
 * 1. **Un symbole dit sa fonction.** « Repères » était un `+`, « Appareil »
 *    aussi : deux boutons différents, le même dessin, et aucun des deux ne
 *    disait ce qu'il faisait. Une icône qu'il faut légender deux fois n'est
 *    pas une icône, c'est une puce.
 * 2. **Gras.** Les traits filaires disparaissent sur une pastille de 18 px
 *    vue à bout de bras, sur un chantier, avec les mains sales. On dessine
 *    à 2,4 d'épaisseur et l'on remplit ce qui peut l'être : la silhouette
 *    porte plus loin que le contour.
 * 3. **Même famille.** Bouts ronds, angles ronds, même marge d'un point et
 *    demi au bord de la boîte. Un jeu d'icônes se reconnaît à sa main, pas
 *    à ses sujets.
 */
const TOOL_PATHS: Record<ToolIcon, { d: string; fill?: boolean }[]> = {
  // Un pan de mur poché, vu en plan : la coupe pleine du dessin d'archi.
  murs: [
    { d: 'M3 8.5 h18 v3.2 h-18 z', fill: true },
    { d: 'M3 15 h7.5 v6 h-7.5 z', fill: true },
    { d: 'M15.5 15 h5.5 v6 h-5.5 z', fill: true },
  ],
  // Le cheminement : une gaine qui sort du tableau et longe le mur.
  gaines: [
    { d: 'M14.5 3.5 h6 v4.5 h-6 z', fill: true },
    { d: 'M17.5 8 v5.5 a3.5 3.5 0 0 1 -3.5 3.5 H6.5' },
    { d: 'M3.5 17 h3' },
    { d: 'M9.5 17 h3' },
  ],
  // Le double-décimètre, avec ses graduations.
  ruler: [
    { d: 'M2.5 9 h19 a1.6 1.6 0 0 1 1.6 1.6 v2.8 a1.6 1.6 0 0 1 -1.6 1.6 h-19 a1.6 1.6 0 0 1 -1.6 -1.6 v-2.8 a1.6 1.6 0 0 1 1.6 -1.6 z' },
    { d: 'M7 9 v3.4' },
    { d: 'M12 9 v4.4' },
    { d: 'M17 9 v3.4' },
  ],
  // La surface au sol : un carré semé de points, comme le fond du plan.
  surface: [
    { d: 'M3.5 3.5 h17 v17 h-17 z' },
    { d: 'M8 8.5 h0.01' },
    { d: 'M16 8.5 h0.01' },
    { d: 'M8 15.5 h0.01' },
    { d: 'M16 15.5 h0.01' },
    { d: 'M12 12 h0.01' },
  ],
  // Un fauteuil vu de face : le mobilier, et pas un carton.
  furniture: [
    { d: 'M5 11 V8.5 A2.5 2.5 0 0 1 7.5 6 h9 A2.5 2.5 0 0 1 19 8.5 V11' },
    { d: 'M3.5 11 h17 v6 h-17 z', fill: true },
    { d: 'M5.5 17 v3' },
    { d: 'M18.5 17 v3' },
  ],
  // L'éclair : le seul symbole que personne n'a besoin qu'on lui explique.
  elec: [{ d: 'M13.8 2 L5 13.8 h5.2 l-1 8.2 L18 10.2 h-5.2 z', fill: true }],
  /*
    UN APPAREIL, C'EST UNE PRISE — pas un « + ».

    Le bouton qui pose un appareil portait le même « + » que celui des
    repères 3D. Deux gestes sans rapport, un seul dessin : on lisait
    l'étiquette à chaque fois, donc l'icône ne servait à rien. Une prise 2P+T
    française se reconnaît à ses deux alvéoles et sa broche de terre.
  */
  appareil: [
    { d: 'M12 2.6 a9.4 9.4 0 1 0 0 18.8 a9.4 9.4 0 1 0 0 -18.8 z' },
    { d: 'M8.6 11 h0.01' },
    { d: 'M15.4 11 h0.01' },
    { d: 'M12 15.6 h0.01' },
  ],
  /*
    UN REPÈRE, C'EST UNE MIRE — pas un « + » non plus.

    Relevé du chantier : « afficher les repères dans le modèle 3D est un
    simple + ». C'est le symbole du point de calage, celui qu'on peint sur
    un mur avant de mesurer : un cercle et sa croix qui déborde.
  */
  reperes: [
    { d: 'M12 5.6 a6.4 6.4 0 1 0 0 12.8 a6.4 6.4 0 1 0 0 -12.8 z' },
    { d: 'M12 1.8 v5' },
    { d: 'M12 17.2 v5' },
    { d: 'M1.8 12 h5' },
    { d: 'M17.2 12 h5' },
    { d: 'M12 12 h0.01' },
  ],
  // Le plafond : une pièce vue en coupe, et sa suspension.
  plafond: [
    { d: 'M2.5 4 h19', },
    { d: 'M12 4 v5' },
    { d: 'M6.5 17 a5.5 5.5 0 0 1 11 0 z', fill: true },
    { d: 'M12 9 a2 2 0 0 1 0 0' },
  ],
  // La disquette : ce qui s'écrit et se retrouve.
  save: [
    { d: 'M4.5 3.5 h11.5 L20.5 8 v12.5 h-16 z' },
    { d: 'M8 3.5 h7 v5 h-7 z', fill: true },
    { d: 'M7.5 13 h9 v7.5 h-9 z' },
  ],
  // Le crayon, centré dans sa boîte.
  edit: [
    { d: 'M4 20 l1.4 -4.6 L16.4 4.4 a2 2 0 0 1 2.8 0 l1.4 1.4 a2 2 0 0 1 0 2.8 L9.6 19.6 z' },
    { d: 'M14.5 6.3 l3.2 3.2' },
  ],
  // Le nuancier : trois pots de couleur relevée.
  colors: [
    { d: 'M12 2.8 C15.4 7.4 18.2 10.2 18.2 13.4 a6.2 6.2 0 1 1 -12.4 0 C5.8 10.2 8.6 7.4 12 2.8 z', fill: true },
  ],
  /*
    UNE PIÈCE, C'EST UN CONTOUR ET SA PORTE.

    Un carré avec deux encoches ne disait rien — on y voyait un cadre cassé.
    Ce qui fait lire « pièce » sur un plan, c'est le vide de la baie et
    l'arc du battant : tout le métier dessine ça.
  */
  room: [
    { d: 'M3.5 3.5 h17 v17 H14' },
    { d: 'M3.5 20.5 H8' },
    { d: 'M8 20.5 a6 6 0 0 0 6 -6' },
    { d: 'M8 20.5 v-5' },
  ],
  // La photo de repérage.
  image: [
    { d: 'M3 5.5 h18 v13 h-18 z' },
    { d: 'M8.5 10 h0.01' },
    { d: 'M3 16 l5.5 -5 4 3.6 3.5 -2.8 5 4.2' },
  ],
  // Le volume : un cube en perspective, arêtes visibles.
  model: [
    { d: 'M12 2.4 l8.6 4.8 v9.6 L12 21.6 l-8.6 -4.8 V7.2 z' },
    { d: 'M12 12 l8.6 -4.8' },
    { d: 'M12 12 L3.4 7.2' },
    { d: 'M12 12 v9.6' },
  ],
  // Plusieurs pièces : le découpage d'un logement.
  rooms: [
    { d: 'M3 4 h8 v7 h-8 z', fill: true },
    { d: 'M13 4 h8 v16 h-8 z' },
    { d: 'M3 13 h8 v7 h-8 z' },
  ],
  // Revenir en arrière.
  undo: [
    { d: 'M4.2 12 a7.8 7.8 0 1 0 2.3 -5.5' },
    { d: 'M3.6 3 v5 h5' },
  ],
  // L'équerre du dessinateur : remettre le plan d'aplomb.
  square: [
    { d: 'M3.5 3.5 v17 h17' },
    { d: 'M3.5 20.5 L20.5 3.5' },
    { d: 'M8 15 h4 v4' },
  ],
  // La loupe : ce que le plan a d'incertain.
  check: [
    { d: 'M10.5 2.6 a7.9 7.9 0 1 0 0 15.8 a7.9 7.9 0 1 0 0 -15.8 z' },
    { d: 'M16.3 16.3 L21.5 21.5' },
    { d: 'M10.5 6.6 v4.4' },
    { d: 'M10.5 14 h0.01' },
  ],
  // Ajouter : le seul bouton qui mérite encore un « + ».
  plus: [{ d: 'M12 4 v16' }, { d: 'M4 12 h16' }],
};

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
          {TOOL_PATHS[icon].map((seg, i) => (
            <Path
              key={i}
              d={seg.d}
              stroke={stroke}
              strokeWidth={2.4}
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
