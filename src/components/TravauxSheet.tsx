/**
 * LA FEUILLE DES TRAVAUX — « ce qu'il faut acheter », en quatre chiffres.
 *
 * Relevé du patron : plaire « à tout le monde qui souhaite scanner son
 * appartement sans y connaître en élec ». Quatre cartes, les quatre achats
 * qu'on fait en refaisant une pièce : la peinture des murs, celle des
 * plafonds, le revêtement de sol, les plinthes — chacune avec ce qu'on
 * met dans le chariot (des pots, des paquets, des barres) en gros, et la
 * mesure qui le justifie en dessous.
 *
 * ON CHOISIT SES PIÈCES. On repeint rarement tout un logement : une coche
 * par pièce, toutes cochées au départ, et les totaux suivent — jusqu'au
 * dossier PDF et au tableur, qui lisent la même coche (`horsTravaux`). Les
 * hypothèses sont écrites sous les chiffres — un nombre sans sa règle de
 * calcul ne se vérifie pas en magasin.
 *
 * ET ELLES SE RÈGLENT — relevé du patron, point 3 de la réflexion « grand
 * public » : le rendement est écrit sur le pot qu'on achète, la surface sur
 * le paquet de parquet. « Régler le calcul » ouvre leurs crans ; « Estimer
 * le prix » ajoute, à des prix d'unité qu'on corrige, un ordre d'idée par
 * achat et pour le tout. Les réglages restent sur l'appareil
 * (`store/reglagesTravaux`) et partent tels quels dans le dossier PDF.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { haptic } from '../ui/haptic';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import {
  achats,
  cleHorsTravaux,
  coutDesAchats,
  euros,
  nombre,
  piecesRetenues,
  type HypothesesTravaux,
  type PieceTravaux,
  type PrixTravaux,
} from '../geometry/travaux';
import { useReglagesTravaux } from '../store/reglagesTravaux';
import { useScanStore } from '../store/scanStore';
import { PEINTURE_DEFAUT, hexDePeinture, nomDeTeinte } from '../ui/peintures';

const COCHE = 'M6 12.5 l4 4 l8 -9';

/** Un cran de réglage : la valeur suivante, ou précédente, dans une liste. */
const cran = (liste: number[], v: number, sens: 1 | -1): number => {
  const i = liste.findIndex((x) => Math.abs(x - v) < 1e-9);
  if (i < 0) {
    // Une valeur hors liste (lue sur le disque) reprend au plus proche.
    const j = liste.findIndex((x) => x > v);
    const apres = j < 0 ? liste.length : j;
    return sens > 0 ? liste[Math.min(liste.length - 1, apres)] : liste[Math.max(0, apres - 1)];
  }
  return liste[Math.min(liste.length - 1, Math.max(0, i + sens))];
};
const plage = (de: number, a: number, pas: number) =>
  Array.from({ length: Math.round((a - de) / pas) + 1 }, (_, i) => Math.round((de + i * pas) * 100) / 100);

/** Les crans des hypothèses — ceux qu'on trouve en rayon. */
const CRANS: { cle: keyof HypothesesTravaux; libelle: string; valeurs: number[]; dire: (v: number) => string }[] = [
  { cle: 'couches', libelle: 'Couches', valeurs: [1, 2, 3, 4], dire: (v) => `${v} couche${v > 1 ? 's' : ''}` },
  { cle: 'rendement', libelle: '1 litre couvre', valeurs: plage(6, 16, 1), dire: (v) => `${nombre(v)} m²/L` },
  { cle: 'pot', libelle: 'Pot de peinture', valeurs: [0.5, 1, 2, 2.5, 3, 5, 10, 15], dire: (v) => `${nombre(v)} L` },
  { cle: 'chute', libelle: 'Marge pour les coupes', valeurs: [0, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2], dire: (v) => `${Math.round(v * 100)} %` },
  { cle: 'paquet', libelle: 'Paquet de sol', valeurs: plage(0.5, 4, 0.1), dire: (v) => `${nombre(v)} m²` },
  { cle: 'barre', libelle: 'Barre de plinthe', valeurs: [1, 2, 2.2, 2.4, 2.5, 3], dire: (v) => `${nombre(v)} m` },
];
const CRANS_PRIX: { cle: keyof PrixTravaux; libelle: string }[] = [
  { cle: 'potMurs', libelle: 'Pot pour les murs' },
  { cle: 'potPlafond', libelle: 'Pot pour les plafonds' },
  { cle: 'paquetSol', libelle: 'Paquet de sol' },
  { cle: 'barrePlinthe', libelle: 'Barre de plinthe' },
];
const VALEURS_PRIX = [...plage(0, 20, 1), ...plage(22, 60, 2), ...plage(65, 150, 5), ...plage(160, 400, 10)];

export function TravauxSheet({
  visible,
  onClose,
  pieces,
  niveau,
}: {
  visible: boolean;
  onClose: () => void;
  pieces: PieceTravaux[];
  /**
   * Le niveau compté, quand le logement en a plusieurs : la feuille ne
   * compte que celui qu'on regarde, et le dit (correctif de l'audit).
   */
  niveau?: string;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const {
    charge,
    charger,
    hypotheses,
    avecPrix,
    prix,
    horsTravaux,
    regler,
    reglerPrix,
    basculerPrix,
    basculerPiece,
    cocherToutes,
    reinitialiser,
  } = useReglagesTravaux();
  /*
    LA COCHE NE SE REMET PLUS À ZÉRO À L'OUVERTURE : le dossier PDF et le
    tableur la lisent, et ce qu'on voit ici doit être ce qui part.
  */
  // La coche est celle du plan ouvert (revue « Fatou »).
  const plan = useScanStore((st) => st.currentSaveId);
  const choisies = useMemo(() => piecesRetenues(pieces, horsTravaux, plan), [pieces, horsTravaux, plan]);
  useEffect(() => {
    if (visible && !charge) charger();
  }, [visible, charge, charger]);
  const [reglages, setReglages] = useState(false);
  const a = useMemo(() => achats(choisies, hypotheses), [choisies, hypotheses]);
  const cout = avecPrix ? coutDesAchats(a, prix) : null;
  const tout = choisies.length === pieces.length;

  const basculer = (id: string) => {
    haptic('leger');
    basculerPiece(id, plan);
  };

  const cartes: { cle: 'murs' | 'plafonds' | 'sol' | 'plinthes' | 'faience'; titre: string; gros: string; detail: string; teinte: string }[] = [
    {
      cle: 'murs',
      titre: 'Peinture des murs',
      // Revue « Bernard » : « 3 pots », mais de combien ? En rayon, il ne
      // savait pas quoi prendre.
      gros: `${a.murs.pots} pot${a.murs.pots > 1 ? 's' : ''} de ${nombre(hypotheses.pot)} L`,
      detail: `${nombre(a.murs.litres)} L pour ${nombre(a.murs.surface)} m²`,
      teinte: c.blue,
    },
    {
      cle: 'plafonds',
      titre: 'Peinture des plafonds',
      gros: `${a.plafonds.pots} pot${a.plafonds.pots > 1 ? 's' : ''} de ${nombre(hypotheses.pot)} L`,
      detail: `${nombre(a.plafonds.litres)} L pour ${nombre(a.plafonds.surface)} m²`,
      teinte: '#7A5AF0',
    },
    {
      cle: 'sol',
      // Revue « Paul » : il cherchait « carrelage » et ne le trouvait pas.
      titre: 'Sol (carrelage, parquet…)',
      gros: `${a.sol.paquets} paquet${a.sol.paquets > 1 ? 's' : ''} de ${nombre(hypotheses.paquet)} m²`,
      detail: `${nombre(a.sol.avecChute)} m², marge des coupes comprise`,
      teinte: '#B8742A',
    },
    {
      cle: 'plinthes',
      titre: 'Plinthes',
      gros: `${a.plinthes.barres} barre${a.plinthes.barres > 1 ? 's' : ''} de ${nombre(hypotheses.barre)} m`,
      detail: `${nombre(a.plinthes.metres)} m, portes déduites`,
      teinte: '#1E8E4E',
    },
    /*
      LA FAÏENCE DE CRÉDENCE — revue « Paul » : ce qu'on pose d'abord dans
      une cuisine n'avait pas de carte. La longueur des plans de travail
      relevés, sur 60 cm de haut ; seulement quand il y en a.
    */
    ...(a.faience.surface > 0
      ? [
          {
            cle: 'faience' as const,
            titre: 'Faïence / crédence',
            gros: `${nombre(a.faience.avecChute)} m²`,
            detail: `${nombre(a.faience.longueur)} m de plan de travail × 60 cm, marge des coupes comprise`,
            teinte: '#2A8CA8',
          },
        ]
      : []),
  ];

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={s.titre}>Ce qu’il faut acheter</Text>
      <Text style={s.sous}>
        {tout
          ? niveau
            ? `Pour tout le niveau « ${niveau} ».`
            : 'Pour tout le logement.'
          : `Pour ${choisies.length} pièce${choisies.length > 1 ? 's' : ''} sur ${pieces.length}.`}
      </Text>

      <View style={s.grille}>
        {cartes.map((k) => (
          <View key={k.cle} style={s.carte} accessibilityLabel={`${k.titre} : ${k.gros}, ${k.detail}`}>
            <View style={[s.pastille, { backgroundColor: k.teinte }]} />
            <Text style={s.carteTitre}>{k.titre}</Text>
            <Text style={[s.carteGros, { color: k.teinte }]}>{k.gros}</Text>
            <Text style={s.carteDetail}>{k.detail}</Text>
            {cout && k.cle !== 'faience' ? <Text style={[s.carteDetail, s.cartePrix]}>{`≈ ${euros(cout[k.cle])}`}</Text> : null}
          </View>
        ))}
      </View>
      {/*
        LA PEINTURE, TEINTE PAR TEINTE — correctif de l'audit : les couleurs
        choisies dans « Décorer » s'achètent chacune à part.
      */}
      {a.murs.parTeinte ? (
        <View style={s.teintes}>
          <Text style={s.teintesTitre}>Peinture des murs, par teinte</Text>
          {a.murs.parTeinte.map((t) => (
            <View
              key={t.cle || 'aucune'}
              style={s.teinte}
              accessibilityLabel={`${nomDeTeinte(t.cle)} : ${t.pots} pot${t.pots > 1 ? 's' : ''}`}>
              <View style={[s.teintePastille, { backgroundColor: hexDePeinture(t.cle || PEINTURE_DEFAUT) ?? c.line }]} />
              <Text style={s.teinteNom} numberOfLines={1}>
                {t.pieces.length > 0 ? `${nomDeTeinte(t.cle)} · ${t.pieces.join(', ')}` : nomDeTeinte(t.cle)}
              </Text>
              <Text style={s.teinteDetail}>
                {`${t.pots} pot${t.pots > 1 ? 's' : ''} de ${nombre(hypotheses.pot)} L · ${nombre(t.litres)} L pour ${nombre(t.surface)} m²`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {cout ? (
        <View style={s.total}>
          <Text style={s.totalMot}>Total estimé</Text>
          <Text style={s.totalChiffre}>{`≈ ${euros(cout.total)}`}</Text>
        </View>
      ) : null}

      <Text style={s.hypotheses}>
        {`Calculé pour ${hypotheses.couches} couche${hypotheses.couches > 1 ? 's' : ''}, 1 litre pour ${nombre(hypotheses.rendement)} m² ` +
          `(regardez l’étiquette du pot), ${Math.round(hypotheses.chute * 100)} % de marge pour les coupes du sol. ` +
          `Portes et fenêtres déduites.` +
          (cout ? ' Prix indicatifs, à ajuster.' : '')}
      </Text>

      {/*
        LA LISTE S'EMPORTE, GRATUITEMENT — revue « Bernard » : la page
        d'achats n'existait que dans le PDF, réservé au Pro. Un texte simple
        part par Messages, Mail ou Notes, et se lit en rayon.
      */}
      {a.murs.pots + a.plafonds.pots + a.sol.paquets + a.plinthes.barres > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer ma liste"
          style={({ pressed }) => [s.envoyer, pressed && s.rangPresse]}
          onPress={() => {
            haptic('leger');
            const texte = [
              tout ? 'Ma liste d’achats' : `Ma liste d’achats (${choisies.length} pièce${choisies.length > 1 ? 's' : ''})`,
              ...cartes
                .filter((k) => !/^0 /.test(k.gros))
                .map((k) => `• ${k.titre} : ${k.gros} (${k.detail})`),
              ...(a.murs.parTeinte ?? []).map(
                (t) => `  – ${nomDeTeinte(t.cle)}${t.pieces.length > 0 ? ` (${t.pieces.join(', ')})` : ''} : ${t.pots} pot${t.pots > 1 ? 's' : ''} de ${nombre(hypotheses.pot)} L`,
              ),
            ].join('\n');
            Share.share({ message: texte }).catch(() => {});
          }}>
          <Text style={s.envoyerTexte}>Envoyer ma liste</Text>
        </Pressable>
      ) : null}

      <View style={s.boutons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Régler le calcul"
          accessibilityState={{ expanded: reglages }}
          style={({ pressed }) => [s.bouton, reglages && s.boutonOn, pressed && s.rangPresse]}
          onPress={() => {
            haptic('leger');
            setReglages((v) => !v);
          }}>
          <Text style={[s.boutonTexte, reglages && s.boutonTexteOn]}>Régler le calcul</Text>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Estimer le prix"
          accessibilityState={{ checked: avecPrix }}
          style={({ pressed }) => [s.bouton, s.boutonPrix, pressed && s.rangPresse]}
          onPress={() => {
            haptic('leger');
            basculerPrix();
          }}>
          <Text style={s.boutonTexte}>Estimer le prix</Text>
          <Switch
            value={avecPrix}
            onValueChange={() => basculerPrix()}
            trackColor={{ true: c.blue, false: c.line }}
            style={s.interrupteur}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </View>

      {reglages ? (
        <View style={s.reglages}>
          {CRANS.map((r) => (
            <Cran
              key={r.cle}
              libelle={r.libelle}
              valeur={r.dire(hypotheses[r.cle])}
              onMoins={() => regler({ [r.cle]: cran(r.valeurs, hypotheses[r.cle], -1) })}
              onPlus={() => regler({ [r.cle]: cran(r.valeurs, hypotheses[r.cle], 1) })}
            />
          ))}
          {avecPrix
            ? CRANS_PRIX.map((r) => (
                <Cran
                  key={r.cle}
                  libelle={r.libelle}
                  valeur={euros(prix[r.cle])}
                  onMoins={() => reglerPrix({ [r.cle]: cran(VALEURS_PRIX, prix[r.cle], -1) })}
                  onPlus={() => reglerPrix({ [r.cle]: cran(VALEURS_PRIX, prix[r.cle], 1) })}
                />
              ))
            : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revenir aux valeurs courantes"
            hitSlop={10}
            onPress={() => {
              haptic('leger');
              reinitialiser();
            }}>
            <Text style={s.remise}>Revenir aux valeurs courantes</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={s.enteteSection}>
        <Text style={s.section}>Pièces</Text>
        {!tout && pieces.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tout cocher"
            hitSlop={10}
            onPress={() => {
              haptic('leger');
              cocherToutes(pieces.map((p) => p.roomId), plan);
            }}>
            <Text style={s.toutCocher}>Tout cocher</Text>
          </Pressable>
        ) : null}
      </View>
      <View>
        {pieces.map((p) => {
          const on = !horsTravaux.includes(cleHorsTravaux(plan, p.roomId));
          return (
            <Pressable
              key={p.roomId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.nom}
              style={({ pressed }) => [s.rang, pressed && s.rangPresse]}
              onPress={() => basculer(p.roomId)}>
              <View style={[s.coche, on && s.cocheOn]}>
                {on && (
                  <Svg width={14} height={14} viewBox="0 0 24 24">
                    <Path d={COCHE} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                )}
              </View>
              <View style={s.rangTextes}>
                <Text style={s.rangNom} numberOfLines={1}>
                  {p.nom}
                </Text>
                <Text style={s.rangDetail} numberOfLines={1}>
                  {`Sol ${nombre(p.sol)} m² · murs ${nombre(p.murs)} m² · hauteur ${p.hauteur.toFixed(2).replace('.', ',')} m`}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {pieces.length === 0 && (
          <Text style={s.vide}>
            Aucune pièce fermée sur ce plan : tracez ou redétectez les pièces pour en faire les comptes.
          </Text>
        )}
      </View>
    </SheetShell>
  );
}

/** Une ligne de réglage : son nom, sa valeur, deux crans. */
function Cran({
  libelle,
  valeur,
  onMoins,
  onPlus,
}: {
  libelle: string;
  valeur: string;
  onMoins: () => void;
  onPlus: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const bouton = (signe: '−' | '+', mot: 'moins' | 'plus', faire: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle} : ${mot}`}
      hitSlop={6}
      style={({ pressed }) => [s.cranBouton, pressed && s.rangPresse]}
      onPress={() => {
        haptic('leger');
        faire();
      }}>
      <Text style={s.cranSigne}>{signe}</Text>
    </Pressable>
  );
  return (
    <View style={s.cran}>
      <Text style={s.cranLibelle} numberOfLines={1}>
        {libelle}
      </Text>
      {bouton('−', 'moins', onMoins)}
      <Text style={s.cranValeur} numberOfLines={1}>
        {valeur}
      </Text>
      {bouton('+', 'plus', onPlus)}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    titre: { color: c.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
    sous: { color: c.inkSoft, fontSize: 14, marginTop: 3, marginBottom: 14 },
    grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    carte: {
      width: '48.5%',
      backgroundColor: c.bg,
      borderRadius: radius.md,
      padding: 14,
    },
    pastille: { width: 8, height: 8, borderRadius: 4, marginBottom: 8 },
    carteTitre: { color: c.inkSoft, fontSize: 13, fontWeight: '600' },
    carteGros: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 },
    carteDetail: { color: c.inkSoft, fontSize: 12.5, marginTop: 2 },
    hypotheses: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 12 },
    envoyer: {
      marginTop: 14,
      minHeight: 48,
      borderRadius: radius.md,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    envoyerTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    cartePrix: { color: c.ink, fontWeight: '700' },
    total: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: c.blueSoft,
    },
    totalMot: { color: c.ink, fontSize: 15, fontWeight: '700' },
    totalChiffre: { color: c.blue, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
    boutons: { flexDirection: 'row', gap: 10, marginTop: 12 },
    bouton: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    boutonOn: { backgroundColor: c.blue, borderColor: c.blue },
    boutonPrix: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingRight: 6 },
    boutonTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
    boutonTexteOn: { color: '#FFFFFF' },
    interrupteur: { transform: [{ scale: 0.8 }] },
    reglages: { marginTop: 12, backgroundColor: c.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
    cran: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    cranLibelle: { flex: 1, color: c.ink, fontSize: 14, fontWeight: '600' },
    cranBouton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cranSigne: { color: c.blue, fontSize: 18, fontWeight: '700', marginTop: -1 },
    cranValeur: { minWidth: 78, textAlign: 'center', color: c.ink, fontSize: 14, fontWeight: '700' },
    remise: { color: c.blue, fontSize: 13.5, fontWeight: '600', paddingVertical: 10, textAlign: 'center' },
    enteteSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    teintes: { marginTop: 12, gap: 6 },
    teintesTitre: { color: c.inkSoft, fontSize: 13, fontWeight: '600' },
    teinte: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    teintePastille: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    teinteNom: { color: c.ink, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    teinteDetail: { color: c.inkSoft, fontSize: 13, marginLeft: 'auto' },
    toutCocher: { color: c.blue, fontSize: 13.5, fontWeight: '600', marginTop: 18, marginBottom: 6 },
    section: {
      color: c.inkSoft,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 18,
      marginBottom: 6,
    },
    rang: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    rangPresse: { opacity: 0.6 },
    coche: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cocheOn: { backgroundColor: c.blue, borderColor: c.blue },
    rangTextes: { flex: 1, minWidth: 0 },
    rangNom: { color: c.ink, fontSize: 16, fontWeight: '600' },
    rangDetail: { color: c.inkSoft, fontSize: 12.5, marginTop: 1 },
    vide: { color: c.inkSoft, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  }),
);
