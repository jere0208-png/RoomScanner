/**
 * GLISSER VERS LA GAUCHE POUR SUPPRIMER — le geste de Mail, et des
 * notifications de l'application.
 *
 * Relevé du patron : « on doit pouvoir supprimer un plan en slidant comme
 * les notifications, sur la gauche ». Le geste existait pour les messages
 * (`NotificationsScreen`), écrit pour eux seuls ; il vit maintenant ici, une
 * fois, pour tout ce qui se jette d'un glissé.
 *
 * Trois issues, comme dans Mail :
 *   — un glissé court se referme ;
 *   — un glissé à mi-course laisse la corbeille ouverte, collée au bord
 *     droit : un appui dessus jette ;
 *   — un glissé long (ou vif) jette d'un coup, et la vibration dit au
 *     passage du seuil que lâcher jettera.
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

/** Au-delà, lâcher jette. */
export const SEUIL_SUPPRIMER = 150;
/** La corbeille ouverte : sa largeur. */
export const OUVERT = -92;

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
    Animated.spring(x, { toValue: v, useNativeDriver: true, speed: 22, bounciness: 2 }).start();
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
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        auSeuil.current = false;
        x.stopAnimation((v) => {
          base.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const v = Math.min(0, base.current + g.dx);
        x.setValue(v);
        const passe = v < -SEUIL_SUPPRIMER;
        if (passe !== auSeuil.current) {
          auSeuil.current = passe;
          if (passe) haptic('leger');
        }
      },
      onPanResponderRelease: (_e, g) => {
        const fin = base.current + g.dx;
        if (fin < -SEUIL_SUPPRIMER || g.vx < -1.2) partir();
        else if (fin < OUVERT / 2) vers(OUVERT);
        else vers(0);
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
