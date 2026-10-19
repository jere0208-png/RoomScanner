/**
 * GLISSER VERS LA GAUCHE POUR SUPPRIMER — le geste de Mail, et des
 * notifications de l'application.
 *
 * Relevé du patron : « on doit pouvoir supprimer un plan en slidant comme
 * les notifications, sur la gauche ». Le geste existait pour les messages
 * (`NotificationsScreen`), écrit pour eux seuls ; il vit maintenant ici, une
 * fois, pour tout ce qui se jette d'un glissé.
 *
 * Deux issues :
 *   — un glissé court se referme ;
 *   — un glissé franc laisse la corbeille ouverte, collée au bord droit : un
 *     appui dessus jette.
 *
 * LE GLISSÉ NE JETTE JAMAIS À LUI SEUL — relevé du patron : « le glisser pour
 * voir Supprimer est trop capricieux et rapide ; qu'on ne puisse pas juste
 * glisser pour supprimer directement, mais qu'on propose le Supprimer ».
 * Le glissé long (ou vif) qui jetait d'un coup a disparu : au-delà de la
 * corbeille, la carte résiste comme un élastique, et seule la corbeille
 * touchée jette. Le geste démarre plus tard (un vrai glissé horizontal, pas
 * un défilement un peu de travers), la carte suit le doigt un peu moins vite
 * que lui, et se pose en douceur, sans rebond.
 *
 * Ce qui est DEVANT reste ce qu'il était — une carte, une ligne — et garde son
 * appui : `children` reçoit `refermer`, qui referme une ligne entrouverte et
 * dit qu'il l'était. On ne s'ouvre pas un plan par accident en voulant
 * ranger la corbeille.
 *
 * ET AU REPOS, ON NE LE VOIT PAS. Relevé du patron : « tu as rajouté
 * inutilement un trait sous le listing des plans ; je veux rendre le cadre
 * avec l'effet, pas changer de style ». Le fond rouge de la corbeille était
 * toujours là, sous la carte : il dépassait en bande sous elle (la carte
 * gardait sa marge DANS le cadre) et en liseré rouge au bord de ses coins ;
 * et le cadre, qui rognait ce qui dépassait, rognait aussi l'ombre de la
 * carte. La corbeille n'apparaît donc qu'au premier millimètre de glissé, et
 * c'est elle seule qui se rogne à ses coins : la carte garde son ombre.
 */
import React, { useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';
import { themedStyles, useTheme, type Palette } from '../theme';

/** La corbeille ouverte : sa largeur. */
export const OUVERT = -92;
/** Le doigt doit avoir glissé d'autant, à l'horizontale, pour que la carte le suive. */
export const DEPART_DU_GLISSE = 18;
/** La carte suit le doigt à ce train : un geste vif ne l'emporte pas. */
const SUIVI = 0.8;
/** Au-delà de la corbeille ouverte, l'élastique : la carte ne va plus qu'au quart. */
const ELASTIQUE = 0.25;
/** La place que la carte prend au doigt, élastique compris (`dx` : glissé du doigt). */
export function placeAuDoigt(base: number, dx: number): number {
  const brut = Math.min(0, base + dx * SUIVI);
  return brut < OUVERT ? OUVERT + (brut - OUVERT) * ELASTIQUE : brut;
}
/** Où se pose la carte au lâcher : ouverte (corbeille offerte) ou refermée. */
export function poseAuLacher(fin: number, vx: number): number {
  // Ouverte aux deux tiers de la corbeille, ou d'un glissé franc et vif.
  return fin < OUVERT * 0.66 || (vx < -0.6 && fin < -28) ? OUVERT : 0;
}

export function GlisserPourSupprimer({
  libelle,
  onSupprimer,
  rayon = 0,
  style,
  children,
}: {
  /** Ce qu'on jette, pour la synthèse vocale : « Supprimer Salon Dupont ». */
  libelle: string;
  onSupprimer: () => void;
  /** Les coins d'une carte : la corbeille les épouse. */
  rayon?: number;
  style?: ViewStyle;
  children: (refermer: () => boolean) => React.ReactNode;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const x = useRef(new Animated.Value(0)).current;
  const base = useRef(0);
  const auSeuil = useRef(false);
  const vers = (v: number) =>
    Animated.spring(x, { toValue: v, useNativeDriver: true, speed: 12, bounciness: 0 }).start();
  const partir = () =>
    Animated.timing(x, { toValue: -700, duration: 200, useNativeDriver: true }).start(() => onSupprimer());
  /** Une ligne entrouverte se referme d'abord — et le dit. */
  const refermer = () => {
    let ouverte = false;
    x.stopAnimation((v) => {
      ouverte = v < -4;
    });
    if (ouverte) vers(0);
    return ouverte;
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > DEPART_DU_GLISSE && Math.abs(g.dx) > Math.abs(g.dy) * 2.2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        auSeuil.current = false;
        x.stopAnimation((v) => {
          base.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const v = placeAuDoigt(base.current, g.dx);
        x.setValue(v);
        // Une vibration légère quand la corbeille est entièrement offerte.
        const passe = v <= OUVERT;
        if (passe !== auSeuil.current) {
          auSeuil.current = passe;
          if (passe) haptic('leger');
        }
      },
      onPanResponderRelease: (_e, g) => {
        vers(poseAuLacher(placeAuDoigt(base.current, g.dx), g.vx));
      },
      onPanResponderTerminate: () => vers(0),
    }),
  ).current;

  return (
    <View style={[s.cadre, style]}>
      {/* Derrière : la corbeille, collée au bord droit, qui suit le doigt —
          invisible tant que la carte n'a pas bougé. */}
      <Animated.View
        style={[
          s.derriere,
          {
            borderRadius: rayon,
            opacity: x.interpolate({ inputRange: [-6, -1, 0], outputRange: [1, 0, 0], extrapolate: 'clamp' }),
          },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Supprimer ${libelle}`}
          style={s.corbeille}
          onPress={partir}>
          <Animated.View
            style={[
              s.corbeilleDedans,
              {
                transform: [
                  {
                    translateX: x.interpolate({
                      inputRange: [-700, OUVERT, 0],
                      outputRange: [-(700 + OUVERT), 0, -OUVERT / 2],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}>
            <Animated.View
              style={{ opacity: x.interpolate({ inputRange: [-34, -14], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d={SOLAIRES.supprimer} fill="#FFFFFF" fillRule="evenodd" />
              </Svg>
            </Animated.View>
            <Animated.Text
              style={[
                s.corbeilleMot,
                { opacity: x.interpolate({ inputRange: [-80, -62], outputRange: [1, 0], extrapolate: 'clamp' }) },
              ]}>
              Supprimer
            </Animated.Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children(refermer)}
      </Animated.View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    cadre: { position: 'relative' },
    derriere: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      backgroundColor: c.danger,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    corbeille: { width: -OUVERT, alignItems: 'center', justifyContent: 'center' },
    corbeilleDedans: { alignItems: 'center', justifyContent: 'center', gap: 3 },
    corbeilleMot: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  }),
);
