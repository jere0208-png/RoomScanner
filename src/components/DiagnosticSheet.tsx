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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { nomDuNiveau } from '../geometry/floorplan';
import { SOLAIRES } from '../ui/solaires';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';
import type { ElecFix } from '../geometry/nfc15100';

/** Un constat du diagnostic, d'où qu'il vienne — géométrie ou électricité. */
export interface Constat {
  key: string;
  message: string;
  hint: string;
  severity: string;
  wallId?: string;
  roomId?: string;
  /** Le meuble visé, quand le constat parle d'un meuble. */
  objectId?: string;
  /** L'appareil visé, quand le constat parle d'un appareil. */
  fixtureId?: string;
  /** De quoi on parle, sans lire la phrase : choisit l'icône de la ligne. */
  code?: string;
  /** Le geste qui règle le constat, quand il existe : un bouton le porte. */
  fix?: ElecFix;
}

/**
 * L'icône d'un constat : la silhouette Solar de son sujet.
 *
 * La liste était du texte nu — trente lignes grises qu'on relisait du début
 * pour retrouver « le tableau ». L'œil trie par DESSIN avant de lire : une
 * prise, une règle, un plafond, et l'on saute directement à ce qu'on
 * cherche.
 */
const ICONE_DU_CODE: Record<string, string> = {
  socles: SOLAIRES.elec,
  surPlan: SOLAIRES.elec,
  specialises: SOLAIRES.elec,
  chute: SOLAIRES.elec,
  circuits: SOLAIRES.elec,
  cuisson: SOLAIRES.elec,
  rj45: SOLAIRES.appareil,
  hauteur: SOLAIRES.ruler,
  alignement: SOLAIRES.ruler,
  tableau: SOLAIRES.schema,
  eclairage: SOLAIRES.plafond,
  daaf: SOLAIRES.plafond,
  volumes: SOLAIRES.surface,
  pose: SOLAIRES.crayon,
  porte: SOLAIRES.ouvertures,
  meuble: SOLAIRES.meubles,
};

export interface DiagnosticSheetProps {
  visible: boolean;
  onClose: () => void;
  /*
    SUR QUOI CE CONTRÔLE PORTE-T-IL ?

    Il ne regarde que le NIVEAU AFFICHÉ — et c'est le bon choix : un constat
    qu'on ne peut pas voir est un constat qu'on ne peut pas corriger. Mais
    rien ne le disait, et l'électricien au rez-de-chaussée lisait « Rien de
    bloquant » avant de livrer un dossier dont l'étage comptait cinq
    manques. Un verdict partiel qui se présente comme un verdict complet est
    pire que pas de verdict : il donne une confiance qu'il ne peut pas
    tenir.
  */
  niveau?: number;
  /** Vrai dès que le dossier a plus d'un niveau : sinon, la précision
   *  serait du bruit. */
  plusieursNiveaux?: boolean;
  issues: Constat[];
  /** Pour nommer les volets : l'identifiant seul ne dit rien à personne. */
  rooms: { id: string; name?: string }[];
  onGoToIssue: (issue: Constat) => void;
  /** Applique le geste que le constat porte : pose, remise à hauteur. */
  onFix?: (issue: Constat) => void;
}

/*
  LES POINTS À CORRIGER, VERSION LUDIQUE — relevé du patron : « revois de
  façon plus ludique et moderne l'affichage des points à corriger ».

  La liste disait ce qui manquait ; elle ne disait pas qu'on AVANÇAIT. Elle
  le dit maintenant :
    — une JAUGE en tête, qui se remplit à chaque point réglé pendant que la
      feuille est ouverte (« 2 corrigés »), et un bravo quand tout est fait ;
    — des FILTRES : tout, à corriger, à vérifier, chacun son compte ;
    — des CARTES : la pièce et la gravité en étiquette, le sujet en dessin,
      la phrase, et le geste qui règle le constat en bouton bleu.
  Ce qui ne change pas : un appui sur la carte emmène voir l'élément sur le
  plan ; le bouton qui corrige ne navigue pas.
*/
type Filtre = 'tout' | 'alerte' | 'info';

export function DiagnosticSheet({
  visible,
  niveau = 0,
  plusieursNiveaux = false,
  onClose,
  issues,
  rooms,
  onGoToIssue,
  onFix,
}: DiagnosticSheetProps) {
  const c = useTheme();
  const styles = getStyles(c);
  const alertes = useMemo(() => issues.filter((i) => i.severity === 'alerte').length, [issues]);
  const infos = issues.length - alertes;

  /*
    CE QU'ON A CORRIGÉ DEPUIS L'OUVERTURE. Le compte de départ se prend à
    chaque ouverture ; il ne fait que monter si un nouveau défaut apparaît.
  */
  const depart = useRef(alertes);
  const etaitVisible = useRef(false);
  if (visible && !etaitVisible.current) depart.current = alertes;
  etaitVisible.current = visible;
  if (alertes > depart.current) depart.current = alertes;
  const corriges = Math.max(0, depart.current - alertes);
  const avance = depart.current > 0 ? corriges / depart.current : 1;
  const bravo = corriges > 0 && alertes === 0;
  useEffect(() => {
    if (bravo) haptic('succes');
  }, [bravo]);

  const [filtre, setFiltre] = useState<Filtre>('tout');
  const visibles = useMemo(
    () => (filtre === 'tout' ? issues : issues.filter((i) => (filtre === 'alerte') === (i.severity === 'alerte'))),
    [issues, filtre],
  );

  const nomDe = useMemo(() => new Map(rooms.map((r) => [r.id, r.name || 'Pièce'])), [rooms]);
  const groupes = useMemo(() => {
    const ordre: string[] = [];
    const par = new Map<string, Constat[]>();
    for (const i of visibles) {
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
  }, [visibles, nomDe]);

  /** Volets refermés à la main : le reste suit la règle par défaut. */
  const [replies, setReplies] = useState<Record<string, boolean>>({});
  const ouvert = (g: { cle: string; alertes: number }) =>
    replies[g.cle] === undefined ? g.alertes > 0 || filtre === 'info' : !replies[g.cle];

  const teinteJauge = alertes > 0 ? c.danger : c.green;
  const R = 26;
  const TOUR = 2 * Math.PI * R;

  const titre =
    issues.length === 0 || bravo
      ? 'Tout est bon !'
      : alertes > 0
        ? `${alertes} à corriger`
        : 'Rien de bloquant';
  const sousTitre =
    issues.length === 0
      ? 'Le plan ne présente aucune anomalie détectable.'
      : bravo
        ? `Bravo : ${corriges} point${corriges > 1 ? 's' : ''} corrigé${corriges > 1 ? 's' : ''}, plus rien ne bloque.`
        : corriges > 0
          ? `${corriges} corrigé${corriges > 1 ? 's' : ''} · encore ${alertes}, vous y êtes presque.`
          : alertes > 0
            ? issues.some((i) => i.fix)
              ? 'La baguette règle un point d’un appui ; une carte vous emmène le voir.'
              : 'Touchez une carte pour aller voir l’élément sur le plan.'
            : `${infos} remarque${infos > 1 ? 's' : ''} à vérifier, rien d’obligatoire.`;

  return (
    <SheetShell defile={false} visible={visible} onClose={onClose}>
      <View style={styles.head}>
        {/* La jauge : ce qui est fait, sur ce qu'il y avait à faire. */}
        <View style={styles.jauge} testID="jauge-controle">
          <Svg width={64} height={64} viewBox="0 0 64 64">
            <Circle cx={32} cy={32} r={R} stroke={c.line} strokeWidth={7} fill="none" />
            <Circle
              cx={32}
              cy={32}
              r={R}
              stroke={teinteJauge}
              strokeWidth={7}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${TOUR} ${TOUR}`}
              strokeDashoffset={TOUR * (1 - (alertes > 0 ? Math.max(0.04, avance) : 1))}
              transform="rotate(-90 32 32)"
            />
          </Svg>
          <View style={styles.jaugeCoeur} pointerEvents="none">
            {alertes > 0 ? (
              <Text style={[styles.jaugeChiffre, { color: c.danger }]}>{alertes}</Text>
            ) : (
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path d={SOLAIRES.coche} fill="none" stroke={c.green} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            )}
          </View>
        </View>
        <View style={styles.titles}>
          <Text style={styles.title}>{titre}</Text>
          <Text style={styles.sub}>{sousTitre}</Text>
          {plusieursNiveaux && (
            <Text style={styles.portee}>
              {`Ce contrôle porte sur le niveau affiché — ${nomDuNiveau(
                niveau,
              )}. Changez de niveau pour vérifier les autres.`}
            </Text>
          )}
        </View>
      </View>

      {/* Les filtres : on regarde d'abord ce qui bloque. */}
      {issues.length > 0 && (
        <View style={styles.filtres}>
          {(
            [
              ['tout', 'Tout', issues.length],
              ['alerte', 'À corriger', alertes],
              ['info', 'À vérifier', infos],
            ] as [Filtre, string, number][]
          ).map(([cle, mot, n]) => {
            const pris = filtre === cle;
            const libelle = `${mot} · ${n}`;
            return (
              <TouchableOpacity
                key={cle}
                accessibilityRole="button"
                accessibilityLabel={libelle}
                accessibilityState={{ selected: pris }}
                activeOpacity={0.8}
                style={[styles.filtre, pris && styles.filtrePris]}
                onPress={() => {
                  haptic('leger');
                  setFiltre(cle);
                }}>
                <Text style={[styles.filtreMot, pris && styles.filtreMotPris]}>{mot}</Text>
                <View
                  style={[
                    styles.filtreCompte,
                    pris && styles.filtreComptePris,
                    !pris && cle === 'alerte' && n > 0 && { backgroundColor: c.danger },
                  ]}>
                  <Text
                    style={[
                      styles.filtreCompteTexte,
                      (pris || (cle === 'alerte' && n > 0)) && { color: pris ? c.blue : '#FFFFFF' },
                    ]}>
                    {n}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {issues.length === 0 || (bravo && infos === 0) ? (
          <View style={styles.fete}>
            <View style={styles.feteRond}>
              <Svg width={44} height={44} viewBox="0 0 24 24">
                <Path d={SOLAIRES.coche} fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            {/* Quelques éclats autour du rond : la fête, sans confettis. */}
            {[
              [-58, -26, c.blue],
              [56, -30, c.amber],
              [-46, 30, c.green],
              [52, 24, c.danger],
            ].map(([x, y, teinte], k) => (
              <View
                key={k}
                pointerEvents="none"
                style={[styles.eclat, { backgroundColor: teinte as string, transform: [{ translateX: x as number }, { translateY: y as number }] }]}
              />
            ))}
            <Text style={styles.feteMot}>Plan au propre</Text>
          </View>
        ) : null}
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
                <View style={[styles.groupePoint, { backgroundColor: g.alertes > 0 ? c.danger : c.amber }]} />
                <Text style={styles.groupeNom}>{g.titre}</Text>
                <View style={[styles.puce, g.alertes > 0 && styles.puceKo]}>
                  <Text style={[styles.puceText, g.alertes > 0 && styles.puceTextKo]}>{g.lignes.length}</Text>
                </View>
                <Text style={[styles.chevronGroupe, deplie && styles.chevronOuvert]}>›</Text>
              </TouchableOpacity>
              {deplie &&
                g.lignes.map((issue) => {
                  const ko = issue.severity === 'alerte';
                  const teinte = ko ? c.danger : c.amber;
                  return (
                    <TouchableOpacity
                      key={issue.key}
                      accessibilityLabel={issue.message}
                      style={styles.carte}
                      activeOpacity={0.8}
                      onPress={() => onGoToIssue(issue)}>
                      <View style={[styles.tuile, { backgroundColor: `${teinte}1F` }]}>
                        <Svg width={18} height={18} viewBox="0 0 24 24">
                          <Path d={ICONE_DU_CODE[issue.code ?? ''] ?? SOLAIRES.murs} fill={teinte} fillRule="evenodd" />
                        </Svg>
                      </View>
                      <View style={styles.texts}>
                        <View style={[styles.etiquette, { backgroundColor: `${teinte}1F` }]}>
                          <Text style={[styles.etiquetteMot, { color: ko ? c.danger : c.ink }]}>
                            {ko ? 'À corriger' : 'À vérifier'}
                          </Text>
                        </View>
                        <Text style={styles.message}>{issue.message}</Text>
                        <Text style={styles.hint} numberOfLines={2}>
                          {issue.hint}
                        </Text>
                        {/*
                          LE GESTE QUI RÈGLE LE CONSTAT, sur la carte même. Un
                          appui, la carte s'en va, et la jauge avance.
                        */}
                        {issue.fix && onFix && (
                          <TouchableOpacity
                            accessibilityLabel={issue.fix.label}
                            style={styles.corriger}
                            activeOpacity={0.8}
                            onPress={() => {
                              haptic('succes');
                              onFix(issue);
                            }}>
                            <Svg width={14} height={14} viewBox="0 0 24 24">
                              <Path d={SOLAIRES.baguette} fill="#FFFFFF" fillRule="evenodd" />
                            </Svg>
                            <Text style={styles.corrigerTexte}>{issue.fix.label}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.voir}>
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </View>
          );
        })}
      </ScrollView>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 36 },
    jauge: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    jaugeCoeur: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    jaugeChiffre: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    titles: { flex: 1 },
    title: { color: c.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
    /* La portée : dite en plus petit que le reste, mais dite. */
    portee: { color: c.blue, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
    sub: { color: c.inkSoft, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
    filtres: { flexDirection: 'row', gap: 8, marginTop: 14 },
    filtre: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 34,
      paddingLeft: 12,
      paddingRight: 6,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
    },
    filtrePris: { backgroundColor: c.blue },
    filtreMot: { color: c.ink, fontSize: 13, fontWeight: '700' },
    filtreMotPris: { color: '#FFFFFF' },
    filtreCompte: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filtreComptePris: { backgroundColor: '#FFFFFF' },
    filtreCompteTexte: { color: c.inkSoft, fontSize: 12, fontWeight: '800' },
    scroll: { maxHeight: 400, marginTop: 6 },
    fete: { alignItems: 'center', justifyContent: 'center', paddingVertical: 26 },
    feteRond: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: c.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eclat: { position: 'absolute', top: 60, width: 9, height: 9, borderRadius: 4.5 },
    feteMot: { color: c.inkSoft, fontSize: 13, fontWeight: '700', marginTop: 12 },
    // Le volet d'une pièce : un point de couleur, son nom, son compte.
    groupe: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 16,
      paddingBottom: 4,
      paddingHorizontal: 2,
    },
    groupePoint: { width: 8, height: 8, borderRadius: 4 },
    groupeNom: { flex: 1, color: c.ink, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
    puce: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
    },
    puceKo: { backgroundColor: c.danger },
    puceText: { color: c.inkSoft, fontSize: 11, fontWeight: '700' },
    puceTextKo: { color: '#FFFFFF' },
    chevronGroupe: { color: c.inkFaint, fontSize: 19, fontWeight: '700', width: 14, textAlign: 'center' },
    chevronOuvert: { transform: [{ rotate: '90deg' }] },
    carte: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      padding: 12,
      marginTop: 8,
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    /* Le sujet du constat, en dessin : l'œil trie avant de lire. */
    tuile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    etiquette: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginBottom: 4 },
    etiquetteMot: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    /* Le bouton qui règle le constat : bleu franc, baguette, sur la carte. */
    corriger: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 10,
      height: 32,
      paddingHorizontal: 13,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
    },
    corrigerTexte: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
    texts: { flex: 1 },
    message: { color: c.ink, fontSize: 14.5, fontWeight: '700', lineHeight: 19 },
    hint: { color: c.inkFaint, fontSize: 12, lineHeight: 16, marginTop: 3 },
    voir: { alignSelf: 'center' },
    chevron: { color: c.inkFaint, fontSize: 22, fontWeight: '600', marginTop: -3 },
  }),
);
