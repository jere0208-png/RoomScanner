/**
 * LA TOUCHE QUI S'ENFONCE — le même retour au doigt pour tous les petits
 * boutons répétés (pastilles du plan, ronds d'en-tête).
 *
 * Le `Bouton` de la maison répondait déjà au doigt : un léger enfoncement,
 * puis il revient. Les pastilles, elles, ne faisaient que pâlir — le
 * `TouchableOpacity` d'origine — et l'on avait deux allures pour un même
 * geste. Revue UX iOS : « chaque appui doit répondre de la même façon ».
 *
 * POURQUOI PAS UN RESSORT ANIMÉ COMME `Bouton` : la revue de performance
 * a mesuré qu'un `TouchableOpacity` (une `Animated.View`) coûte quatre à
 * cinq fois plus cher qu'un `Pressable` à chaque rendu du parent — et
 * l'écran du plan en rend une trentaine, à chaque sélection. Une valeur
 * animée par touche ramènerait exactement ce coût. L'enfoncement est donc
 * un STYLE d'appui, posé par `Pressable` lui-même : rien ne tourne au repos,
 * rien ne se recalcule quand le parent se redessine.
 *
 * L'enfoncement (0,94) et le léger voile (0,85) se lisent sans masquer
 * l'icône — un doigt ganté sent mal l'appui, il doit le VOIR.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Échelle de la touche sous le doigt. */
export const PRESSE_ECHELLE = 0.94;
/** Opacité de la touche sous le doigt. */
export const PRESSE_OPACITE = 0.85;

export type PresseProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /**
   * L'enfoncement. Une LIGNE pleine largeur (devis, magasin) ne rétrécit
   * pas — elle pâlit, comme une cellule d'iOS : `echelle={1}`.
   */
  echelle?: number;
  /** Le voile sous le doigt. */
  opacite?: number;
};

/** Le style d'une touche, selon qu'elle est enfoncée ou non. */
export function stylePresse(
  style: StyleProp<ViewStyle>,
  enfoncee: boolean,
  echelle = PRESSE_ECHELLE,
  opacite = PRESSE_OPACITE,
): StyleProp<ViewStyle> {
  if (!enfoncee) return style;
  // Le voile S'AJOUTE à l'opacité propre de la touche : une pastille grisée
  // (0,6) ne doit pas s'éclaircir sous le doigt. Lu à l'appui seulement.
  const propre = (StyleSheet.flatten(style) as { opacity?: number } | undefined)?.opacity ?? 1;
  const opacity = propre * opacite;
  return [style, echelle === 1 ? { opacity } : { opacity, transform: [{ scale: echelle }] }];
}

export function Presse({ style, children, echelle, opacite, ...reste }: PresseProps) {
  return (
    <Pressable {...reste} style={({ pressed }) => stylePresse(style, pressed, echelle, opacite)}>
      {children}
    </Pressable>
  );
}
