/**
 * Le créneau d'une pastille dans la RANGÉE du bouton d'édition.
 *
 * Il vivait dans l'écran des résultats, qui compte trois mille cinq cents
 * lignes et importe la capture d'écran, la boussole et le générateur de
 * PDF : impossible d'en éprouver dix lignes d'animation sans charger tout
 * le reste. Un composant qui ne dépend de rien se vérifie seul.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/** Pas d'une cellule dans la RANGÉE : sa largeur, et l'écart qui la suit. */
const ROW_PITCH = 58 + 6;

/**
 * Créneau d'une pastille dans la rangée du bouton d'édition.
 *
 * La colonne du dessous s'ouvre et se referme depuis le bouton d'édition :
 * les pastilles en sortent l'une après l'autre et s'y engouffrent en
 * repartant. À sa gauche, sur la même ligne, « Enregistrer »,
 * « Annuler » et « Contrôle » apparaissaient et disparaissaient d'un
 * coup, sans prévenir : on cherchait ce qui venait de changer, et il
 * arrivait qu'on appuie sur un bouton qui n'était déjà plus là.
 *
 * Elles ont donc le même mouvement, couché : elles glissent de derrière
 * le bouton d'édition en grandissant, d'autant plus loin qu'elles en sont
 * éloignées, et y retournent en repartant. Chacune s'anime pour SON compte
 * — la sauvegarde paraît quand le plan change, l'annulation quand on entre
 * en édition, le contrôle quand un constat tombe : trois horloges
 * différentes, là où la colonne n'en a qu'une.
 */
export function SidePill({
  visible,
  index,
  children,
}: {
  visible: boolean;
  /** Rang depuis le bouton d'édition : 0 = juste à côté. */
  index: number;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  // Le démontage attend la fin de la sortie : sans ça, la pastille
  // disparaîtrait à la première image et il n'y aurait rien à animer.
  const [monte, setMonte] = useState(visible);
  useEffect(() => {
    if (visible) setMonte(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 150,
      delay: visible ? index * 45 : 0,
      easing: visible ? Easing.out(Easing.back(1.6)) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMonte(false);
    });
  }, [visible, index, anim]);
  if (!monte) return null;
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateX: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [(index + 1) * ROW_PITCH, 0],
            }),
          },
          {
            scale: anim.interpolate({
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
