/**
 * LE BOUTON — plein, teinté ou discret, et qui se presse sous le doigt.
 *
 * Relevé du patron : « un style plus "Apple like", pur, avec des mouvements
 * fluides (...) rien ne doit faire vieillot ». Le bouton d'accueil émettait
 * des ondes et portait un halo : c'est ce qui vieillit le plus vite dans
 * une interface. Les grandes applications n'animent pas leurs boutons au
 * repos ; elles les font RÉPONDRE au doigt — un léger enfoncement, un
 * ressort au relâcher — et c'est tout.
 *
 * Trois variantes, pas davantage, et toujours la même pilule de 56 points :
 *
 *   primaire   : plein, bleu de la maison, texte blanc — le geste attendu ;
 *   secondaire : teinté (bleu pâle, texte bleu) — l'autre chemin ;
 *   discret    : surface et liseré — ce qu'on ouvre sans y penser.
 */
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

export type VarianteDeBouton = 'primaire' | 'secondaire' | 'discret';

export function Bouton({
  label,
  onPress,
  variante = 'primaire',
  disabled = false,
  droite,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variante?: VarianteDeBouton;
  disabled?: boolean;
  /** Ce qui se pose à droite du mot : un compte, un chevron. */
  droite?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const appui = useRef(new Animated.Value(0)).current;
  const presser = (vers: number) =>
    Animated.spring(appui, {
      toValue: vers,
      damping: 16,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  const scale = appui.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => presser(1)}
      onPressOut={() => presser(0)}
      onPress={onPress}>
      <Animated.View
        style={[
          s.corps,
          variante === 'primaire' && s.primaire,
          variante === 'secondaire' && s.secondaire,
          variante === 'discret' && s.discret,
          disabled && s.eteint,
          { transform: [{ scale }] },
          style,
        ]}>
        <Text
          style={[
            s.mot,
            variante === 'primaire' && s.motPrimaire,
            variante === 'secondaire' && s.motSecondaire,
            variante === 'discret' && s.motDiscret,
            disabled && s.motEteint,
          ]}
          numberOfLines={1}>
          {label}
        </Text>
        {droite ? <View style={s.droite}>{droite}</View> : null}
      </Animated.View>
    </Pressable>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    corps: {
      minHeight: 56,
      borderRadius: radius.pill,
      paddingHorizontal: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaire: { backgroundColor: c.blue },
    secondaire: { backgroundColor: c.blueSoft },
    discret: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    eteint: { backgroundColor: c.surfaceSunken, borderWidth: 0 },
    mot: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
    motPrimaire: { color: '#FFFFFF' },
    motSecondaire: { color: c.blue },
    motDiscret: { color: c.ink },
    motEteint: { color: c.inkFaint },
    droite: { marginLeft: 10 },
  }),
);
