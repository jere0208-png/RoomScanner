/**
 * L'HÔTE DE LA BULLE — voir `src/ui/bulle.ts`.
 *
 * Une bulle sombre, posée juste au-dessus du bouton touché, sa pointe sur
 * lui ; elle reste dans l'écran même pour un bouton du bord, apparaît d'un
 * souffle et s'efface seule. Elle ne prend aucun appui : le plan reste à
 * portée de doigt pendant qu'on la lit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { DUREE_BULLE, useBulle } from '../ui/bulle';
import { themedStyles, useTheme, type Palette } from '../theme';

const LARGEUR = 232;
const MARGE = 12;

export function BulleHote() {
  const c = useTheme();
  const s = getStyles(c);
  const bulle = useBulle((st) => st.bulle);
  const cacher = useBulle((st) => st.cacher);
  const { width: W } = useWindowDimensions();
  const apparition = useRef(new Animated.Value(0)).current;
  const [hauteur, setHauteur] = useState(0);
  useEffect(() => {
    if (!bulle) return;
    apparition.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(apparition, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(DUREE_BULLE),
      Animated.timing(apparition, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) cacher();
    });
    return () => anim.stop();
  }, [bulle, apparition, cacher]);
  if (!bulle) return null;
  // Dans l'écran, même pour un bouton du bord ; la pointe reste sur lui.
  const gauche = Math.max(MARGE, Math.min(W - MARGE - LARGEUR, bulle.x - LARGEUR / 2));
  const pointe = Math.max(16, Math.min(LARGEUR - 16, bulle.x - gauche));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        accessibilityLiveRegion="polite"
        onLayout={(e) => setHauteur(e.nativeEvent.layout.height)}
        style={[
          s.bulle,
          {
            left: gauche,
            top: bulle.y - 10 - hauteur,
            width: LARGEUR,
            opacity: apparition,
            transform: [{ translateY: apparition.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
          },
        ]}>
        <Text style={s.texte}>{bulle.texte}</Text>
        <View style={[s.pointe, { left: pointe - 6 }]} />
      </Animated.View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    bulle: {
      position: 'absolute',
      backgroundColor: c.ink,
      borderRadius: 13,
      paddingVertical: 9,
      paddingHorizontal: 12,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    texte: { color: c.bg, fontSize: 13, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
    pointe: {
      position: 'absolute',
      bottom: -5,
      width: 12,
      height: 12,
      backgroundColor: c.ink,
      transform: [{ rotate: '45deg' }],
    },
  }),
);
