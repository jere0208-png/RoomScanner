/**
 * Le bandeau de conformité — ce que le plan a de travers, rangé par pièce.
 *
 * Il vivait dans `ResultScreen`, au milieu de deux mille autres lignes, et
 * listait tout à plat. Deux défauts, un par dimension :
 *
 * - à plat, une installation complète produit trente lignes qu'on relit du
 *   début à chaque passage pour savoir ce qui reste. Or on ne corrige pas un
 *   plan constat par constat : on prend une pièce, on la fait, on passe à la
 *   suivante. Le bandeau suit maintenant ce geste — un volet par pièce,
 *   ouvert d'office s'il porte une alerte, replié s'il ne porte que des
 *   remarques ;
 * - dans l'écran de résultat, personne ne pouvait le lire sans faire défiler
 *   deux mille lignes. Il a désormais son fichier, et ses styles avec lui.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SheetShell } from './Sheet';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';

/** Un constat du diagnostic, d'où qu'il vienne — géométrie ou électricité. */
export interface Constat {
  key: string;
  message: string;
  hint: string;
  severity: string;
  wallId?: string;
  roomId?: string;
}

export interface DiagnosticSheetProps {
  visible: boolean;
  onClose: () => void;
  issues: Constat[];
  /** Pour nommer les volets : l'identifiant seul ne dit rien à personne. */
  rooms: { id: string; name?: string }[];
  onGoToIssue: (issue: Constat) => void;
}

export function DiagnosticSheet({
  visible,
  onClose,
  issues,
  rooms,
  onGoToIssue,
}: DiagnosticSheetProps) {
  const styles = getStyles(useTheme());
  const alertes = useMemo(
    () => issues.filter((i) => i.severity === 'alerte').length,
    [issues],
  );

  const groupes = useMemo(() => {
    const nomDe = new Map(rooms.map((r) => [r.id, r.name || 'Pièce']));
    const ordre: string[] = [];
    const par = new Map<string, Constat[]>();
    for (const i of issues) {
      const cle = i.roomId ?? '—';
      if (!par.has(cle)) {
        par.set(cle, []);
        ordre.push(cle);
      }
      par.get(cle)!.push(i);
    }
    return ordre.map((cle) => {
      const lignes = par.get(cle)!;
      return {
        cle,
        // Les constats qui ne visent aucune pièce parlent du plan lui-même.
        titre: cle === '—' ? 'Plan' : nomDe.get(cle) ?? 'Pièce',
        lignes,
        alertes: lignes.filter((l) => l.severity === 'alerte').length,
      };
    });
  }, [issues, rooms]);

  /** Volets refermés à la main : le reste suit la règle par défaut. */
  const [replies, setReplies] = useState<Record<string, boolean>>({});
  const ouvert = (g: { cle: string; alertes: number }) =>
    replies[g.cle] === undefined ? g.alertes > 0 : !replies[g.cle];

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <View style={[styles.badge, alertes > 0 ? styles.badgeKo : styles.badgeOk]}>
          <Text style={styles.badgeText}>{alertes || '✓'}</Text>
        </View>
        <View style={styles.titles}>
          <Text style={styles.title}>
            {alertes > 0
              ? `${alertes} point${alertes > 1 ? 's' : ''} à corriger`
              : 'Rien de bloquant'}
          </Text>
          <Text style={styles.sub}>
            {issues.length === 0
              ? 'Le plan ne présente aucune anomalie détectable.'
              : 'Touchez une ligne pour aller voir l’élément sur le plan.'}
          </Text>
        </View>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {groupes.map((g) => {
          const deplie = ouvert(g);
          return (
            <View key={g.cle}>
              <TouchableOpacity
                style={styles.groupe}
                activeOpacity={0.7}
                onPress={() => {
                  haptic('leger');
                  setReplies((r) => ({ ...r, [g.cle]: deplie }));
                }}>
                <Text style={styles.groupeNom}>{g.titre}</Text>
                <View style={[styles.puce, g.alertes > 0 && styles.puceKo]}>
                  <Text
                    style={[styles.puceText, g.alertes > 0 && styles.puceTextKo]}>
                    {g.lignes.length}
                  </Text>
                </View>
                <Text
                  style={[styles.chevronGroupe, deplie && styles.chevronOuvert]}>
                  ›
                </Text>
              </TouchableOpacity>
              {deplie &&
                g.lignes.map((issue) => (
                  <TouchableOpacity
                    key={issue.key}
                    style={[
                      styles.row,
                      issue.severity === 'alerte' && styles.rowKo,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => onGoToIssue(issue)}>
                    <View style={styles.texts}>
                      <Text style={styles.message}>{issue.message}</Text>
                      <Text style={styles.hint} numberOfLines={2}>
                        {issue.hint}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
            </View>
          );
        })}
      </ScrollView>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeKo: { backgroundColor: c.danger },
    badgeOk: { backgroundColor: c.green },
    badgeText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    titles: { flex: 1 },
    title: {
      color: c.ink,
      fontSize: 17.5,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sub: { color: c.inkFaint, fontSize: 12, lineHeight: 16, marginTop: 2 },
    scroll: { maxHeight: 380, marginTop: 12 },
    // Le volet d'une pièce : son nom, le nombre de constats, un chevron qui
    // pivote. Rien de plus — c'est un séparateur qu'on peut viser du pouce.
    groupe: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 14,
      paddingBottom: 6,
      paddingHorizontal: 2,
    },
    groupeNom: {
      flex: 1,
      color: c.ink,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    puce: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
    },
    puceKo: { backgroundColor: c.danger },
    puceText: { color: c.inkSoft, fontSize: 11, fontWeight: '800' },
    puceTextKo: { color: '#FFFFFF' },
    chevronGroupe: {
      color: c.inkFaint,
      fontSize: 19,
      fontWeight: '700',
      width: 14,
      textAlign: 'center',
    },
    chevronOuvert: { transform: [{ rotate: '90deg' }] },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.inkFaint,
      paddingLeft: 13,
      paddingRight: 10,
      paddingVertical: 11,
      marginTop: 8,
    },
    rowKo: { borderLeftColor: c.danger },
    texts: { flex: 1 },
    message: { color: c.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 },
    hint: { color: c.inkFaint, fontSize: 11.5, lineHeight: 15.5, marginTop: 3 },
    chevron: {
      color: c.inkFaint,
      fontSize: 22,
      fontWeight: '600',
      marginTop: -3,
    },
  }),
);
