/**
 * LA POSE, ESTIMÉE — sous le total du matériel, la moitié qui manquait.
 *
 * Voir `geometry/mainDOeuvre` pour le calcul. Ici, ce qu'on lit et ce qu'on
 * règle : la nature du chantier (qui fixe la TVA de la main-d'œuvre et le
 * temps par point), le taux horaire, les heures par famille, puis le total
 * des travaux — matériel et pose.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';
import { fr } from '../screens/result/format';
import {
  PAS_DU_TAUX,
  TAUX_MAX,
  TAUX_MIN,
  enHeures,
  type NatureDeChantier,
  type Pose,
} from '../geometry/mainDOeuvre';
import { TotalQuiMonte } from './TotalQuiMonte';

const euros = (v: number) => `${fr(v, 2)} €`;
const pc = (x: number) => `${Math.round(x * 100)} %`;

export function PoseEstimee({
  pose,
  materiel,
  chantier,
  onChantier,
  onTaux,
}: {
  pose: Pose;
  /** Le total du matériel, TTC : il s'ajoute à la pose. */
  materiel: number;
  chantier: NatureDeChantier;
  onChantier: (c: NatureDeChantier) => void;
  onTaux: (taux: number) => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const pas = (sens: 1 | -1) => {
    const t = pose.taux + sens * PAS_DU_TAUX;
    if (t < TAUX_MIN || t > TAUX_MAX) return;
    haptic('leger');
    onTaux(t);
  };
  return (
    <View style={s.bloc}>
      <Text style={s.titre}>La pose, estimée</Text>
      <Text style={s.chapo}>
        Le temps de pose de chaque point, boîte, saignée, tirage et raccordement compris — à votre taux.
      </Text>

      {/* La nature du chantier : elle fixe la TVA et le temps par point. */}
      <View style={s.segments} accessibilityRole="radiogroup">
        {(
          [
            ['renovation', 'Rénovation', 'TVA 10 %'],
            ['neuf', 'Neuf', 'TVA 20 %'],
          ] as const
        ).map(([cle, mot, sous]) => {
          const actif = chantier === cle;
          return (
            <Pressable
              key={cle}
              accessibilityRole="radio"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={`Chantier ${mot.toLowerCase()}, ${sous}`}
              style={[s.segment, actif && s.segmentActif]}
              onPress={() => {
                if (actif) return;
                haptic('leger');
                onChantier(cle);
              }}>
              <Text style={[s.segmentMot, actif && s.segmentMotActif]}>{mot}</Text>
              <Text style={[s.segmentSous, actif && s.segmentSousActif]}>{sous}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Le taux horaire, au pas de cinq euros. */}
      <View style={s.taux}>
        <Text style={s.tauxNom}>Taux horaire</Text>
        <View style={s.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Baisser le taux horaire"
            hitSlop={8}
            style={[s.pas, pose.taux <= TAUX_MIN && s.pasEteint]}
            onPress={() => pas(-1)}>
            <Text style={s.pasMot}>−</Text>
          </Pressable>
          <Text style={s.tauxValeur}>{`${pose.taux} € HT/h`}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Monter le taux horaire"
            hitSlop={8}
            style={[s.pas, pose.taux >= TAUX_MAX && s.pasEteint]}
            onPress={() => pas(1)}>
            <Text style={s.pasMot}>+</Text>
          </Pressable>
        </View>
      </View>

      {pose.lignes.map((l) => (
        <View key={l.famille} style={s.ligne}>
          <Text style={s.ligneNom} numberOfLines={1}>
            {l.famille === 'Tableau' ? 'Tableau et câblage' : `${l.famille} · ${l.quantite}`}
          </Text>
          <Text style={s.ligneHeures}>{enHeures(l.heures)}</Text>
        </View>
      ))}

      <View style={s.sous}>
        <Text style={s.sousNom}>{`Pose · ${enHeures(pose.heures)}`}</Text>
        <Text style={s.sousValeur}>{`${euros(pose.ht)} HT`}</Text>
      </View>
      <View style={s.sous}>
        <Text style={s.sousNom}>{`TVA ${pc(pose.tauxTva)}`}</Text>
        <Text style={s.sousValeur}>{euros(pose.tva)}</Text>
      </View>
      <View style={s.sous}>
        <Text style={[s.sousNom, s.fort]}>Pose TTC</Text>
        <Text style={[s.sousValeur, s.fort]}>{euros(pose.ttc)}</Text>
      </View>

      <View style={s.total}>
        <Text style={s.totalNom}>MATÉRIEL + POSE</Text>
        <TotalQuiMonte valeur={materiel + pose.ttc} format={euros} style={s.totalValeur} />
      </View>
      <Text style={s.mention}>
        Estimation à partir des points du plan : à ajuster au métré réel. Le matériel est compté au prix public TTC.
      </Text>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    bloc: {
      marginTop: 8,
      marginBottom: 18,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: c.surfaceSunken,
    },
    titre: { color: c.ink, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
    chapo: { color: c.inkSoft, fontSize: 12.5, lineHeight: 17, marginTop: 4 },
    segments: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 12,
      padding: 3,
      borderRadius: radius.md,
      backgroundColor: c.surface,
    },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.md - 3 },
    segmentActif: { backgroundColor: c.blue },
    segmentMot: { color: c.ink, fontSize: 13.5, fontWeight: '700' },
    segmentMotActif: { color: '#FFFFFF' },
    segmentSous: { color: c.inkSoft, fontSize: 11, marginTop: 1 },
    segmentSousActif: { color: 'rgba(255,255,255,0.85)' },
    taux: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      marginBottom: 6,
    },
    tauxNom: { color: c.ink, fontSize: 14, fontWeight: '600' },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pas: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pasEteint: { opacity: 0.4 },
    pasMot: { color: c.blue, fontSize: 18, fontWeight: '700', marginTop: -1 },
    tauxValeur: { color: c.ink, fontSize: 14, fontWeight: '700', minWidth: 88, textAlign: 'center' },
    ligne: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 5,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
    },
    ligneNom: { color: c.inkSoft, fontSize: 13, flexShrink: 1 },
    ligneHeures: { color: c.ink, fontSize: 13, fontWeight: '600' },
    sous: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    sousNom: { color: c.inkSoft, fontSize: 13 },
    sousValeur: { color: c.ink, fontSize: 13, fontWeight: '600' },
    fort: { color: c.ink, fontWeight: '700' },
    total: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      borderTopWidth: 2,
      borderTopColor: c.ink,
      marginTop: 12,
      paddingTop: 10,
    },
    totalNom: { color: c.ink, fontSize: 13, fontWeight: '600', letterSpacing: 1.1 },
    totalValeur: { color: c.blue, fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
    mention: { color: c.inkFaint, fontSize: 11, lineHeight: 15.5, marginTop: 6 },
  }),
);
