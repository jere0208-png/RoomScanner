/**
 * LES POINTS CARDINAUX AUTOUR D'UN PLAN — 2D comme 3D.
 *
 * « Le mur de gauche » ne veut plus rien dire dès qu'on a tourné le plan, et
 * un identifiant de mur n'a jamais rien voulu dire à personne. Le nord, lui,
 * se vérifie sur place avec n'importe quel téléphone : les quatre lettres se
 * posent au BORD du cadre, chacune du côté où se trouve réellement son point
 * cardinal, et le mur qui touche le N est le mur nord — le nom que porteront
 * aussi l'établi et le dossier imprimé.
 *
 * Un repère « où je regarde » a existé ici, suivant le magnétomètre en
 * direct. Il répondait à une question qu'on ne se pose pas devant un plan :
 * ce qu'on cherche, c'est de quel mur il s'agit, pas où pointe le téléphone.
 * Un point qui bouge sans arrêt sur un dessin fixe attire l'œil pour rien.
 *
 * La vue 2D et la vue 3D ne calculent pas les angles de la même façon — l'une
 * a une rotation de plan, l'autre une caméra qui tourne et s'incline. Chacune
 * fournit donc sa propre fonction : `angleOf(bearing)` rend l'angle À L'ÉCRAN
 * d'une direction du monde, et tout le reste est commun.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';

export function CardinalRing({
  w,
  h,
  angleOf,
}: {
  w: number;
  h: number;
  /** Angle à l'écran (radians, 0 = vers la droite) d'un cap donné. */
  angleOf: (bearing: number) => number;
}) {
  const c = useTheme();
  if (w <= 0 || h <= 0) return null;
  const cx = w / 2;
  const cy = h / 2;
  /** Le point du BORD du cadre, dans cette direction. */
  const bord = (a: number, marge: number) => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = Math.min(
      Math.abs((cx - marge) / (dx || 1e-6)),
      Math.abs((cy - marge) / (dy || 1e-6)),
    );
    return { x: cx + dx * t, y: cy + dy * t };
  };
  return (
    <G>
      {(
        [
          ['N', 0],
          ['E', 90],
          ['S', 180],
          ['O', 270],
        ] as [string, number][]
      ).map(([lettre, deg]) => {
        const p = bord(angleOf(deg), 15);
        const nord = lettre === 'N';
        return (
          <G key={lettre}>
            <Circle
              cx={p.x}
              cy={p.y}
              r={11}
              fill={c.surface}
              fillOpacity={0.88}
              stroke={nord ? c.danger : c.line}
              strokeWidth={nord ? 1.4 : 1}
            />
            <SvgText
              x={p.x}
              y={p.y + 4}
              fill={nord ? c.danger : c.inkSoft}
              fontSize={nord ? 12 : 11}
              fontWeight="900"
              textAnchor="middle">
              {lettre}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

/**
 * LE BADGE « NORD ? » — quand le relevé n'a pas de cap.
 *
 * Les scans faits avant la boussole, et ceux où le magnétomètre s'est tu,
 * n'ont pas d'orientation : on ne peut alors NI dessiner la couronne, NI
 * l'inventer — quatre lettres au hasard, on les croirait, et on percerait le
 * mauvais mur. Plutôt que de laisser un vide inexplicable, on propose de
 * l'orienter à la main, en une phrase et deux appuis, sans refaire le scan.
 */
export function NorthBadge({
  x,
  y,
  invite,
  onPress,
}: {
  x: number;
  y: number;
  /** true = la consigne est affichée, le prochain appui valide. */
  invite: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Svg
      width={invite ? 250 : 54}
      height={44}
      style={[styles.badge, { left: x, top: y }]}
      onPress={onPress}>
      <Circle
        cx={22}
        cy={22}
        r={17}
        fill={c.surface}
        stroke={invite ? c.blue : c.line}
        strokeWidth={invite ? 1.8 : 1}
      />
      <SvgText
        x={22}
        y={26}
        fill={invite ? c.blue : c.inkFaint}
        fontSize={13}
        fontWeight="900"
        textAnchor="middle">
        N?
      </SvgText>
      {invite && (
        <SvgText x={46} y={26} fill={c.ink} fontSize={11} fontWeight="700">
          Face au haut du plan, touchez ici
        </SvgText>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({ badge: { position: 'absolute' } });
