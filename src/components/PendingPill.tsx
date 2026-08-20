/**
 * La pastille d'attente : « on attend que vous désigniez où ça va ».
 *
 * Elle vivait au milieu de `ResultScreen`, entre deux mille autres lignes,
 * avec ses styles éparpillés dans une feuille commune. Elle n'a pourtant
 * besoin de rien de cet écran : un appareil à montrer, une cible à nommer,
 * un moyen d'abandonner.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import {
  FIXTURES,
  assemblySymbol,
  type FixtureKind,
} from '../geometry/electrical';
import { CEILINGS, CEILING_SYMBOL, type CeilingKind } from '../geometry/ceiling';
import { CloseCross } from './CloseCross';

/**
 * « On attend que vous désigniez un mur. »
 *
 * C'était un bandeau pleine largeur, avec la phrase entière et un bouton
 * « Annuler » — qui passait sous les pastilles d'outils, illisible. Or ce
 * moment ne dure que le temps d'un geste : il n'a pas besoin d'une phrase,
 * il a besoin de MONTRER ce qu'on tient et de dire qu'on attend.
 *
 * Une pastille en bas à gauche, donc : le symbole de l'appareil pris, son
 * nom, une croix pour reposer. Elle respire lentement — c'est l'attente
 * elle-même qui se voit, sans un mot de plus.
 */
export function EnAttente({
  kind,
  plafond,
  cible,
  onCancel,
}: {
  kind: FixtureKind | null;
  /** Appareil de plafond en attente : on touche la pièce, pas le mur. */
  plafond?: CeilingKind | null;
  /** Précision quand une cible est déjà désignée (un retour de mur). */
  cible: string | null;
  onCancel: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Mur ou plafond : deux catalogues, un seul bandeau d'attente.
  const spec = plafond ? CEILINGS[plafond] : FIXTURES[kind!];
  const trace = plafond ? CEILING_SYMBOL[plafond] : assemblySymbol(kind!);
  const souffle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(souffle, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [souffle]);
  return (
    <View style={styles.attente} pointerEvents="box-none">
      {/* L'auréole qui bat : elle dit « en attente » sans écrire le mot. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.attenteOnde,
          {
            backgroundColor: spec.color,
            opacity: souffle.interpolate({
              inputRange: [0, 1],
              outputRange: [0.28, 0],
            }),
            transform: [
              {
                scale: souffle.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.5],
                }),
              },
            ],
          },
        ]}
      />
      <View style={[styles.attenteIcone, { borderColor: spec.color }]}>
        <Svg width={20} height={20} viewBox="-12 -12 24 24">
          {trace.map((seg, i) => (
            <Path
              key={i}
              d={seg.d}
              stroke={spec.color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={seg.fill ? spec.color : 'none'}
            />
          ))}
        </Svg>
      </View>
      <View style={styles.attenteTextes}>
        <Text style={styles.attenteNom} numberOfLines={1}>
          {spec.label}
        </Text>
        <Text style={styles.attenteHint} numberOfLines={1}>
          {cible ? `Touchez ${cible}` : 'Touchez un mur'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.attenteClose}
        onPress={onCancel}
        accessibilityLabel="Annuler la pose">
        <CloseCross size={17} color={c.inkSoft} weight={3} />
      </TouchableOpacity>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    attente: {
    position: 'absolute',
    left: 10,
    bottom: 12,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadowCard,
    shadowOpacity: 0.16,
  },
    attenteOnde: {
    position: 'absolute',
    left: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
  
    // Un anneau vide n'a rien a centrer, mais la regle du banc de
    // centrage vaut pour tous les ronds : uniforme, donc simple.
    alignItems: 'center',
    justifyContent: 'center',
  },
    attenteIcone: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
    attenteTextes: { maxWidth: 138 },
    attenteNom: { color: c.ink, fontSize: 13.5, fontWeight: '800' },
    attenteHint: { color: c.inkFaint, fontSize: 11, marginTop: 1 },
    attenteClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceSunken,
  },
  }),
);
