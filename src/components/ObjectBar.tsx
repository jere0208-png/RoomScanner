/**
 * LE BANDEAU D'UN MEUBLE — sa largeur, sa profondeur, et trois gestes.
 *
 * Les deux cotes se tapaient dans des champs posés au bas de l'écran, exactement
 * là où le clavier vient se mettre : on tapait à l'aveugle, sans voir ni le
 * champ, ni le meuble, ni la validation. Ce sont maintenant deux pastilles
 * qu'on touche — la feuille de saisie, elle, monte AVEC le clavier.
 *
 * C'est le même remède qu'au plafond, pour la même raison ; il n'y a aucune
 * raison qu'un meuble se règle autrement qu'un point lumineux.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { frCategory } from '../geometry/furniture';
import type { PromptData } from './Sheet';
import type { Palette } from '../theme';

import type { ObjectData } from 'react-native-room-scan';

const fr2 = (v: number) => v.toFixed(2).replace('.', ',');

export function ObjectBar({
  object,
  styles,
  palette,
  onPrompt,
  onResize,
  onRotate,
  onCancel,
  onDone,
  onNudge,
}: {
  object: ObjectData;
  /** Les styles de l'écran : le bandeau partage ceux des autres barres. */
  styles: Record<string, object>;
  palette: Palette;
  onPrompt: (p: PromptData) => void;
  onResize: (width: number, depth: number) => void;
  onRotate: () => void;
  onCancel: () => void;
  onDone: () => void;
  /**
   * LE DÉPLACEMENT AU CENTIMÈTRE, À LA FLÈCHE.
   *
   * Le doigt déplace un meuble de trois centimètres quand on en voulait un :
   * il cache ce qu'il pousse, et un écran de téléphone ne rend pas le
   * millimètre. Quatre flèches font ce que le doigt ne sait pas faire — et
   * elles poussent DANS L'AXE DE L'ÉCRAN, pas dans celui du plan : c'est la
   * direction qu'on voit, pas celle du repère du scan.
   */
  onNudge?: (dx: number, dz: number) => void;
}) {
  /** Une cote qu'on touche : elle ouvre la feuille, qui suit le clavier. */
  const champ = (
    titre: string,
    valeur: number,
    poser: (v: number) => void,
  ) => (
    <TouchableOpacity
      style={styles.clChamp}
      accessibilityLabel={titre}
      onPress={() =>
        onPrompt({
          title: titre,
          subtitle: `${frCategory(object.category)} — la cote se prend au sol.`,
          value: fr2(valeur),
          unit: 'm',
          numeric: true,
          okLabel: 'Appliquer',
          onSubmit: (t) => {
            const v = parseFloat(t.replace(',', '.'));
            if (v > 0.05 && v < 12) poser(v);
          },
        })
      }>
      <Text style={styles.clValeur}>{fr2(valeur)}</Text>
    </TouchableOpacity>
  );

  /** Une flèche : un centimètre, dans l'axe de l'écran. */
  const fleche = (nom: string, dx: number, dy: number, d: string) => (
    <TouchableOpacity
      style={styles.nudgeBtn}
      accessibilityLabel={nom}
      onPress={() => onNudge?.(dx, dy)}>
      <Svg width={17} height={17} viewBox="0 0 24 24">
        <Path
          d={d}
          stroke={palette.ink}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </TouchableOpacity>
  );

  return (
    <View style={styles.editBar}>
      {onNudge && (
        <View style={styles.nudgeRow}>
          {fleche('Déplacer vers le haut', 0, -1, 'M12 19 V6 M6 12 L12 6 L18 12')}
          {fleche('Déplacer vers la gauche', -1, 0, 'M19 12 H6 M12 6 L6 12 L12 18')}
          {fleche('Déplacer vers la droite', 1, 0, 'M5 12 H18 M12 6 L18 12 L12 18')}
          {fleche('Déplacer vers le bas', 0, 1, 'M12 5 V18 M6 12 L12 18 L18 12')}
          <Text style={styles.nudgeNote}>1 cm</Text>
        </View>
      )}
      <View style={styles.editRow}>
        {champ('Largeur', object.width, (v) => onResize(v, object.depth))}
        <Text style={styles.unit}>×</Text>
        {champ('Profondeur', object.depth, (v) => onResize(object.width, v))}
        <Text style={styles.unit}>m</Text>
        <View style={styles.editIcons}>
          <TouchableOpacity
            style={styles.iconBtn}
            accessibilityLabel="Pivoter"
            onPress={onRotate}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path
                d="M19.5 12 a7.5 7.5 0 1 1 -2.2 -5.3"
                stroke={palette.ink}
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
              <Path
                d="M19.8 3.8 v4.4 h-4.4"
                stroke={palette.ink}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            accessibilityLabel="Annuler"
            onPress={onCancel}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              {['M6.5 6.5 L17.5 17.5', 'M17.5 6.5 L6.5 17.5'].map((d) => (
                <Path
                  key={d}
                  d={d}
                  stroke={palette.danger}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtnOk}
            accessibilityLabel="Valider"
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
