/**
 * LE RECALAGE D'UN ÉTAGE, AU CENTIMÈTRE ET AU DEMI-DEGRÉ.
 *
 * Relevé du patron, à la suite du mur, de la pièce, du meuble et des
 * ouvertures : « fais pareil pour tout le reste ». Le recalage ne se faisait
 * qu'au doigt — on glissait tout l'étage sur le filigrane du dessous, et
 * l'escalier tombait à trois centimètres de sa trémie sans moyen de finir.
 * Surtout, il ne TOURNAIT pas : deux relevés faits à deux moments ne partent
 * pas du même cap, et un étage arrivé de deux degrés de travers le restait.
 *
 * Le doigt garde le gros du geste ; les flèches finissent au centimètre, la
 * rotation au demi-degré, et toutes se répètent tant qu'on les tient.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRepetition } from './ObjectBar';
import { SOLAIRES } from '../ui/solaires';
import { DEBORD_DOIGT } from '../ui/bandeau';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/** Un pas de rotation : un demi-degré, en radians. */
export const PAS_ROTATION = (0.5 * Math.PI) / 180;

function Bouton({
  nom,
  d,
  couleur,
  miroir,
  style,
  onPas,
}: {
  nom: string;
  d: string;
  couleur: string;
  miroir?: boolean;
  style: object;
  onPas: () => void;
}) {
  const { demarrer, arreter } = useRepetition(onPas);
  return (
    <TouchableOpacity
      style={style}
      hitSlop={DEBORD_DOIGT}
      accessibilityLabel={nom}
      onPressIn={demarrer}
      onPressOut={arreter}>
      <Svg
        width={17}
        height={17}
        viewBox="0 0 24 24"
        style={miroir ? MIROIR : undefined}>
        <Path d={d} fill={couleur} fillRule="evenodd" />
      </Svg>
    </TouchableOpacity>
  );
}

const MIROIR = { transform: [{ scaleX: -1 }] };

export function RecalageBar({
  texte,
  onPas,
  onTourner,
  onTerminer,
}: {
  texte: string;
  /** Un centimètre dans l'axe de l'écran : (−1|0|1, −1|0|1). */
  onPas: (dx: number, dy: number) => void;
  /** Un demi-degré : 1 dans le sens des aiguilles d'une montre. */
  onTourner: (sens: 1 | -1) => void;
  onTerminer: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const b = (nom: string, d: string, f: () => void, miroir?: boolean) => (
    <Bouton key={nom} nom={nom} d={d} couleur={c.ink} miroir={miroir} style={s.btn} onPas={f} />
  );
  return (
    <View style={s.barre}>
      <View style={s.entete}>
        <Text style={s.texte} numberOfLines={2}>
          {texte}
        </Text>
        <TouchableOpacity
          accessibilityLabel="Terminer le recalage"
          hitSlop={DEBORD_DOIGT}
          onPress={onTerminer}>
          <Text style={s.fini}>Terminé</Text>
        </TouchableOpacity>
      </View>
      <View style={s.rangee}>
        {b('Déplacer l’étage vers le haut', SOLAIRES.flecheHaut, () => onPas(0, -1))}
        {b('Déplacer l’étage vers la gauche', SOLAIRES.flecheGauche, () => onPas(-1, 0))}
        {b('Déplacer l’étage vers la droite', SOLAIRES.flecheDroite, () => onPas(1, 0))}
        {b('Déplacer l’étage vers le bas', SOLAIRES.flecheBas, () => onPas(0, 1))}
        <View style={s.separation} />
        {b('Tourner l’étage à gauche', SOLAIRES.pivoter, () => onTourner(-1), true)}
        {b('Tourner l’étage à droite', SOLAIRES.pivoter, () => onTourner(1))}
      </View>
      <Text style={s.note}>1 cm · ½° · maintenir</Text>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    barre: {
      position: 'absolute',
      top: 10,
      left: 10,
      right: 58,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      ...shadowCard,
    },
    entete: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    texte: { flex: 1, color: c.inkSoft, fontSize: 12.5, fontWeight: '600' },
    fini: { color: c.blue, fontSize: 14, fontWeight: '600' },
    rangee: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    btn: {
      width: 38,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceSunken,
    },
    separation: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: c.lineStrong, marginHorizontal: 4 },
    note: { color: c.inkFaint, fontSize: 11.5 },
  }),
);
