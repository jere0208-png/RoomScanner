/**
 * LE CHOIX DE FIN DE SCAN — relevé du patron : « à la fin du scan il doit
 * demander si on veut intégrer les éléments électriques détectés, et les
 * meubles. On coche nos choix et on valide. Pop-up dans l'esprit de l'app,
 * moderne. »
 *
 * Les MOTS sont pesés, parce que la vérité technique l'exige : RoomPlan
 * DÉTECTE les meubles — une prise fait trois centimètres, son modèle LiDAR
 * ne la voit pas. L'électricité est donc PROPOSÉE : l'implantation
 * NF C 15-100 complète (socles, RJ45, commandes, points lumineux), posée
 * hors meubles et hors menuiseries par le même moteur que « Normes auto ».
 * Écrire « détectée » serait mentir, et un plan qui ment est pire qu'un
 * plan incomplet.
 *
 * Tout est coché d'office : intégrer est le cas nominal, décocher est le
 * geste rare — et le popup ne revient jamais : un choix de fin de scan se
 * fait une fois.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { SOLAIRES } from '../ui/solaires';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';

export interface ChoixDuScan {
  meubles: boolean;
  elec: boolean;
}

function Coche({ pleine, teinte }: { pleine: boolean; teinte: Palette }) {
  const habit = pleine
    ? { borderColor: teinte.blue, backgroundColor: teinte.blue }
    : { borderColor: teinte.lineStrong, backgroundColor: 'transparent' };
  return (
    <View style={[stylesCoche.rond, habit]}>
      {pleine && (
        <Svg width={13} height={13} viewBox="0 0 24 24">
          <Path
            d="M4.5 12.5 l5 5 L19.5 7"
            stroke="#FFFFFF"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      )}
    </View>
  );
}

const stylesCoche = StyleSheet.create({
  rond: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function ChoixScan({
  visible,
  meubles,
  onValider,
  onClose,
}: {
  visible: boolean;
  /** Meubles reconnus pendant le scan : 0 = la ligne ne paraît pas. */
  meubles: number;
  onValider: (choix: ChoixDuScan) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [choix, setChoix] = useState<ChoixDuScan>({ meubles: true, elec: true });

  const bascule = (cle: keyof ChoixDuScan) => {
    haptic('leger');
    setChoix((v) => ({ ...v, [cle]: !v[cle] }));
  };

  const lignes: {
    cle: keyof ChoixDuScan;
    icone: string;
    label: string;
    titre: string;
    detail: string;
  }[] = [
    ...(meubles > 0
      ? [
          {
            cle: 'meubles' as const,
            icone: SOLAIRES.furniture,
            label: 'Meubles détectés',
            titre: `${meubles} meuble${meubles > 1 ? 's' : ''} détecté${
              meubles > 1 ? 's' : ''
            }`,
            detail:
              'Reconnus pendant le scan, à leur place et à leurs cotes.',
          },
        ]
      : []),
    {
      cle: 'elec' as const,
      icone: SOLAIRES.elec,
      label: 'Électricité aux normes',
      titre: 'Électricité proposée aux normes',
      detail:
        'Socles, RJ45, commandes et points lumineux selon la NF C 15-100, ' +
        'posés hors meubles. Tout reste déplaçable.',
    },
  ];

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.titre}>Relevé terminé</Text>
      <Text style={styles.sous}>
        Cochez ce que le plan intègre — le reste ne se pose pas.
      </Text>
      {lignes.map((l) => (
        <TouchableOpacity
          key={l.cle}
          accessibilityLabel={l.label}
          style={[styles.ligne, choix[l.cle] && styles.ligneCochee]}
          activeOpacity={0.8}
          onPress={() => bascule(l.cle)}>
          <View style={styles.puce}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path
                d={l.icone}
                fill={choix[l.cle] ? c.blue : c.inkFaint}
                fillRule="evenodd"
              />
            </Svg>
          </View>
          <View style={styles.textes}>
            <Text style={styles.ligneTitre}>{l.titre}</Text>
            <Text style={styles.ligneDetail}>{l.detail}</Text>
          </View>
          <Coche pleine={choix[l.cle]} teinte={c} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        accessibilityLabel="Intégrer"
        style={styles.valider}
        activeOpacity={0.85}
        onPress={() => {
          haptic('succes');
          onValider(choix);
        }}>
        <Text style={styles.validerTexte}>Intégrer</Text>
      </TouchableOpacity>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    titre: {
      color: c.ink,
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sous: { color: c.inkFaint, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginTop: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    /* La ligne cochée se teinte : on voit son choix sans lire les ronds. */
    ligneCochee: { borderColor: c.blue, backgroundColor: c.blueSoft },
    puce: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textes: { flex: 1 },
    ligneTitre: { color: c.ink, fontSize: 14.5, fontWeight: '800' },
    ligneDetail: {
      color: c.inkFaint,
      fontSize: 11.5,
      lineHeight: 15,
      marginTop: 2,
    },
    valider: {
      marginTop: 14,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    validerTexte: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
  }),
);
