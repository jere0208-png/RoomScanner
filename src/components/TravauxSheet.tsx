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
 * par pièce, toutes cochées au départ, et les totaux suivent. Les
 * hypothèses sont écrites sous les chiffres — un nombre sans sa règle de
 * calcul ne se vérifie pas en magasin.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { haptic } from '../ui/haptic';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import {
  HYPOTHESES,
  achats,
  nombre,
  type PieceTravaux,
} from '../geometry/travaux';

const COCHE = 'M6 12.5 l4 4 l8 -9';

export function TravauxSheet({
  visible,
  onClose,
  pieces,
}: {
  visible: boolean;
  onClose: () => void;
  pieces: PieceTravaux[];
}) {
  const c = useTheme();
  const s = getStyles(c);
  const [cochees, setCochees] = useState<Set<string>>(() => new Set(pieces.map((p) => p.roomId)));
  // À chaque ouverture, tout le logement : c'est la question la plus courante.
  useEffect(() => {
    if (visible) setCochees(new Set(pieces.map((p) => p.roomId)));
  }, [visible, pieces]);
  const choisies = useMemo(() => pieces.filter((p) => cochees.has(p.roomId)), [pieces, cochees]);
  const a = useMemo(() => achats(choisies), [choisies]);
  const tout = choisies.length === pieces.length;

  const basculer = (id: string) => {
    haptic('leger');
    setCochees((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });
  };

  const cartes: { cle: string; titre: string; gros: string; detail: string; teinte: string }[] = [
    {
      cle: 'murs',
      titre: 'Peinture des murs',
      gros: `${a.murs.pots} pot${a.murs.pots > 1 ? 's' : ''}`,
      detail: `${nombre(a.murs.litres)} L pour ${nombre(a.murs.surface)} m²`,
      teinte: c.blue,
    },
    {
      cle: 'plafonds',
      titre: 'Peinture des plafonds',
      gros: `${a.plafonds.pots} pot${a.plafonds.pots > 1 ? 's' : ''}`,
      detail: `${nombre(a.plafonds.litres)} L pour ${nombre(a.plafonds.surface)} m²`,
      teinte: '#7A5AF0',
    },
    {
      cle: 'sol',
      titre: 'Revêtement de sol',
      gros: `${a.sol.paquets} paquet${a.sol.paquets > 1 ? 's' : ''}`,
      detail: `${nombre(a.sol.avecChute)} m², chute comprise`,
      teinte: '#B8742A',
    },
    {
      cle: 'plinthes',
      titre: 'Plinthes',
      gros: `${a.plinthes.barres} barre${a.plinthes.barres > 1 ? 's' : ''}`,
      detail: `${nombre(a.plinthes.metres)} m, seuils déduits`,
      teinte: '#1E8E4E',
    },
  ];

  return (
    <SheetShell defile={false} visible={visible} onClose={onClose}>
      <Text style={s.titre}>Ce qu’il faut acheter</Text>
      <Text style={s.sous}>
        {tout
          ? 'Pour tout le logement.'
          : `Pour ${choisies.length} pièce${choisies.length > 1 ? 's' : ''} sur ${pieces.length}.`}
      </Text>

      <View style={s.grille}>
        {cartes.map((k) => (
          <View key={k.cle} style={s.carte} accessibilityLabel={`${k.titre} : ${k.gros}, ${k.detail}`}>
            <View style={[s.pastille, { backgroundColor: k.teinte }]} />
            <Text style={s.carteTitre}>{k.titre}</Text>
            <Text style={[s.carteGros, { color: k.teinte }]}>{k.gros}</Text>
            <Text style={s.carteDetail}>{k.detail}</Text>
          </View>
        ))}
      </View>

      <Text style={s.hypotheses}>
        {`${HYPOTHESES.couches} couches à ${HYPOTHESES.rendement} m²/L, pots de ${nombre(HYPOTHESES.pot)} L · ` +
          `${Math.round(HYPOTHESES.chute * 100)} % de chute, paquets de ${nombre(HYPOTHESES.paquet)} m² · ` +
          `plinthes de ${nombre(HYPOTHESES.barre)} m. Portes et fenêtres déduites.`}
      </Text>

      <Text style={s.section}>Pièces</Text>
      <ScrollView style={s.liste} showsVerticalScrollIndicator={false}>
        {pieces.map((p) => {
          const on = cochees.has(p.roomId);
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
                  {`Sol ${nombre(p.sol)} m² · murs ${nombre(p.murs)} m² · h. ${nombre(p.hauteur)} m`}
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
      </ScrollView>
    </SheetShell>
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
    hypotheses: { color: c.inkFaint, fontSize: 11.5, lineHeight: 16, marginTop: 12 },
    section: {
      color: c.inkSoft,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 18,
      marginBottom: 6,
    },
    liste: { maxHeight: 240 },
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
