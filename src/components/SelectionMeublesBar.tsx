/**
 * LA BARRE DE PLUSIEURS MEUBLES — manque proposé par l'agent testeur
 * MEUBLES : « aligner ou répartir plusieurs meubles d'un coup (il faut
 * d'abord une sélection multiple) ».
 *
 * On y entre depuis la barre d'un meuble (« Plusieurs ») ; chaque meuble
 * touché sur le plan s'ajoute ou se retire. La barre dit combien sont
 * choisis, et offre ce qui a du sens à plusieurs : aligner, répartir (trois
 * au moins), déplacer ensemble (flèches, ou glisser l'ensemble sur le plan),
 * retirer, et terminer. Elle reprend les styles des autres barres : c'est la
 * même famille de bandeau.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { CarteDuMenu, IconeBandeau } from './StripBar';
import { Fleche } from './ObjectBar';
import type { ActionData } from './Sheet';
import type { Palette } from '../theme';
import type { AxeDeRepartition, ModeDAlignement } from '../geometry/alignement';
import { pluriel } from '../ui/mots';

export function SelectionMeublesBar({
  ids,
  styles,
  palette,
  onAligner,
  onRepartir,
  onNudge,
  onRetirer,
  onTerminer,
  onMenu,
  verrouilles = 0,
}: {
  ids: string[];
  styles: Record<string, object>;
  palette: Palette;
  onAligner: (mode: ModeDAlignement) => void;
  onRepartir: (axe: AxeDeRepartition) => void;
  /** Un centimètre dans l'axe de l'écran, comme les flèches d'un meuble seul. */
  onNudge: (dx: number, dy: number) => void;
  /** Retirer la sélection : l'écran demande confirmation (`alerte`). */
  onRetirer: () => void;
  onTerminer: () => void;
  /** Ouvre un choix (aligner : six façons, répartir : deux axes). */
  onMenu: (menu: ActionData) => void;
  /** Combien de meubles choisis sont verrouillés : ils restent en place. */
  verrouilles?: number;
}) {
  const n = ids.length;
  const geste = (label: string, mot: string, d: string, teinte: string, onPress: () => void) => (
    <View style={styles.bandeauCellule}>
      <TouchableOpacity
        style={styles.iconBtn}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityLabel={label}
        onPress={onPress}>
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path d={d} fill={teinte} fillRule="evenodd" />
        </Svg>
      </TouchableOpacity>
      <Text style={styles.bandeauMot}>{mot}</Text>
    </View>
  );
  const fleche = (nom: string, dx: number, dy: number, d: string) => (
    <Fleche key={nom} nom={nom} d={d} couleur={palette.ink} style={styles.nudgeBtn} onPas={() => onNudge(dx, dy)} />
  );
  const aligner = () =>
    onMenu({
      title: 'Aligner les meubles',
      subtitle:
        verrouilles > 0
          ? 'Les meubles verrouillés restent en place : les autres s’alignent sur eux.'
          : 'Sur le meuble le plus avancé dans ce sens, tel qu’on le voit à l’écran.',
      actions: [
        { label: 'Bords gauches', onPress: () => onAligner('gauche') },
        { label: 'Bords droits', onPress: () => onAligner('droite') },
        { label: 'Bords hauts', onPress: () => onAligner('haut') },
        { label: 'Bords bas', onPress: () => onAligner('bas') },
        { label: 'Centres sur une verticale', onPress: () => onAligner('verticale') },
        { label: 'Centres sur une horizontale', onPress: () => onAligner('horizontale') },
      ],
    });
  const repartir = () =>
    onMenu({
      title: 'Répartir les meubles',
      subtitle: 'Les deux extrêmes restent ; les autres se placent à jours égaux.',
      actions: [
        { label: 'De gauche à droite', onPress: () => onRepartir('horizontal') },
        { label: 'De haut en bas', onPress: () => onRepartir('vertical') },
      ],
    });
  return (
    <CarteDuMenu style={styles.bandeau}>
      <View style={styles.bandeauEntete}>
        <IconeBandeau icone={SOLAIRES.selection} styles={styles} />
        <View style={styles.bandeauTexte}>
          <Text style={styles.bandeauTitre} numberOfLines={1}>
            {`${pluriel(n, 'meuble')} choisi${n > 1 ? 's' : ''}`}
          </Text>
          <Text style={[local.aide, { color: palette.inkSoft }]} numberOfLines={1}>
            Touchez un meuble pour l’ajouter ou le retirer.
          </Text>
        </View>
        <View style={styles.bandeauGestes}>
          {n >= 2 && geste('Aligner les meubles', 'Aligner', SOLAIRES.aligner, palette.blue, aligner)}
          {n >= 3 && geste('Répartir les meubles', 'Répartir', SOLAIRES.repartir, palette.blue, repartir)}
          {geste('Retirer les meubles choisis', 'Retirer', SOLAIRES.supprimer, palette.danger, onRetirer)}
          {geste('Terminer la sélection', 'Terminer', SOLAIRES.valider, palette.blue, onTerminer)}
        </View>
      </View>
      <View style={[styles.nudgeRow, styles.bandeauFilet]}>
        {fleche('Déplacer vers le haut', 0, -1, SOLAIRES.flecheHaut)}
        {fleche('Déplacer vers la gauche', -1, 0, SOLAIRES.flecheGauche)}
        {fleche('Déplacer vers la droite', 1, 0, SOLAIRES.flecheDroite)}
        {fleche('Déplacer vers le bas', 0, 1, SOLAIRES.flecheBas)}
        <Text style={styles.nudgeNote}>Ensemble · ou glisser sur le plan</Text>
      </View>
    </CarteDuMenu>
  );
}

const local = StyleSheet.create({
  aide: { fontSize: 12 },
});
