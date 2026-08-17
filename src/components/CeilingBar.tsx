/**
 * LE BANDEAU D'UN APPAREIL DE PLAFOND — où il se tient, au centimètre.
 *
 * Il donne les deux distances qui le placent : au mur de gauche, au mur du
 * haut, d'équerre avec la trame du logement. Ce sont EXACTEMENT les cotes
 * que le plan dessine en pointillés bleus — il a déjà menti une fois, en
 * comptant depuis le coin de l'emprise de la pièce, et deux quantités
 * différentes s'affichaient côte à côte.
 *
 * On touche une pastille, la feuille de saisie monte avec le clavier : le
 * bandeau est en bas de l'écran, et le clavier le recouvre en entier.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { castToWall, type Pt, type WallSeg } from '../geometry/floorplan';
import type { CeilingFixture } from '../geometry/ceiling';
import { haptic } from '../ui/haptic';
import type { PromptData } from './Sheet';
import type { Palette } from '../theme';

export function CeilingBar({
  fixture,
  walls,
  trame,
  styles,
  palette,
  onMove,
  onPrompt,
  onLink,
  onRemove,
  onDone,
}: {
  fixture: CeilingFixture;
  /** Les murs de SA pièce : on se cote sur eux, pas sur ceux d'à côté. */
  walls: WallSeg[];
  /** L'orientation du logement : les cotes partent d'équerre avec elle. */
  trame: number;
  /** Les styles de l'écran : le bandeau partage ceux des autres barres. */
  styles: Record<string, object>;
  palette: Palette;
  onMove: (at: Pt) => void;
  onPrompt: (p: PromptData) => void;
  /** Absent quand l'appareil ne se commande pas — un détecteur de fumée. */
  onLink?: () => void;
  onRemove: () => void;
  onDone: () => void;
}) {
          const cos = Math.cos(trame);
          const sin = Math.sin(trame);
          /** Les quatre directions d'équerre, comme sur le plan. */
          const AXES = {
            gauche: { x: -cos, z: -sin },
            droite: { x: cos, z: sin },
            haut: { x: sin, z: -cos },
            bas: { x: -sin, z: cos },
          } as const;
          const ecart = (k: keyof typeof AXES) =>
            castToWall(fixture.at, AXES[k], walls);
          const cm = (v: number | null) =>
            v === null ? '—' : String(Math.round(v * 100));

          /** Déplace l'appareil pour obtenir CETTE distance à CE mur. */
          const poser = (k: keyof typeof AXES, valeurCm: string) => {
            const v = parseFloat(valeurCm.replace(',', '.'));
            const actuel = ecart(k);
            if (!isFinite(v) || v < 0 || actuel === null) return;
            const d = v / 100 - actuel;
            onMove({
              x: fixture.at.x + AXES[k].x * d,
              z: fixture.at.z + AXES[k].z * d,
            });
            haptic('succes');
          };

          const champ = (
            k: keyof typeof AXES,
            titre: string,
            fleche: 'gauche' | 'haut',
          ) => (
            <TouchableOpacity
              style={styles.clChamp}
              onPress={() => {
                const actuel = ecart(k);
                if (actuel === null) return;
                onPrompt({
                  title: titre,
                  subtitle:
                    'Distance entre l’appareil et le nu du mur, en ' +
                    'centimètres. C’est la cote que porte le plan.',
                  value: String(Math.round(actuel * 100)),
                  unit: 'cm',
                  numeric: true,
                  okLabel: 'Placer',
                  onSubmit: (t) => poser(k, t),
                });
              }}>
              <Svg width={15} height={15} viewBox="0 0 24 24">
                {(fleche === 'gauche'
                  ? ['M3 12 h18', 'M8 7 L3 12 l5 5', 'M16 7 l5 5 -5 5']
                  : ['M12 3 v18', 'M7 8 L12 3 l5 5', 'M7 16 l5 5 5 -5']
                ).map((d2) => (
                  <Path
                    key={d2}
                    d={d2}
                    stroke={palette.inkSoft}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </Svg>
              <Text style={styles.clValeur}>{cm(ecart(k))}</Text>
            </TouchableOpacity>
          );

          return (
            <View style={styles.editBar}>
              <View style={styles.editRow}>
                {champ('gauche', 'Distance au mur de gauche', 'gauche')}
                {champ('haut', 'Distance au mur du haut', 'haut')}
                <Text style={styles.unit}>cm</Text>
                <View style={styles.editIcons}>
                  {/* RELIER, à portée de pouce.
                      La liaison vivait au fond d'un menu qu'il fallait
                      ouvrir en touchant l'appareil une seconde fois — et
                      cette seconde fois n'arrivait jamais jusqu'au dessin,
                      la poignée de glissement l'avalant. Trois appuis pour
                      un geste qu'on répète à chaque point lumineux. */}
                  {onLink && (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      accessibilityLabel="Relier à une commande"
                      onPress={onLink}>
                      <Svg width={19} height={19} viewBox="0 0 24 24">
                        <Path
                          d="M9.5 14.5 L14.5 9.5 M8 12 L5.5 14.5 a3.5 3.5 0 0 0 5 5 L13 17 M16 12 l2.5 -2.5 a3.5 3.5 0 0 0 -5 -5 L11 7"
                          stroke={palette.blue}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </Svg>
                    </TouchableOpacity>
                  )}
                  {/* Deux boutons en pictogramme, et rien pour les nommer :
                      VoiceOver annonçait « bouton », deux fois, à côté de
                      la corbeille et de la validation. Toutes les autres
                      barres de l'app portent leur étiquette ; celles-ci
                      l'avaient perdue en chemin. */}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    accessibilityLabel="Retirer"
                    onPress={onRemove}>
                    <Svg width={19} height={19} viewBox="0 0 24 24">
                      <Path
                        d="M5 7 h14 M9.5 7 V4.5 h5 V7 M6.5 7 l1 13 h9 l1 -13"
                        stroke={palette.danger}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </Svg>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtnOk}
                    accessibilityLabel="Terminer"
                    onPress={onDone}>
                    <Svg width={19} height={19} viewBox="0 0 24 24">
                      <Path
                        d="M5 12.5 L10 17.5 L19 6.5"
                        stroke="#FFFFFF"
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </Svg>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
}
