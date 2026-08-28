/**
 * LE CHOIX DE GAMME — une page à lui, ouverte depuis l'estimation.
 *
 * Relevé du patron : « fais en sorte que la gamme soit sauvegardée et
 * changeable que depuis la page estimation (icône changement — nom de la
 * gamme actuelle) ».
 *
 * OÙ IL ÉTAIT, ET POURQUOI ÇA NE MARCHAIT PAS. C'était la première marche du
 * tunnel du devis : on choisissait sa marque d'appareillage AVANT d'avoir vu
 * le moindre prix — c'est-à-dire avant d'avoir la seule information qui
 * permette de choisir. Et comme le magasin démonte l'écran du devis, tout
 * aller-retour ramenait ici, deux pages avant l'article qu'on venait
 * d'ajouter.
 *
 * OÙ IL EST MAINTENANT : derrière le total. On lit le prix, on se dit « en
 * Odace, ça donnerait quoi ? », on change, on revoit le prix. C'est le seul
 * geste qui donne un sens au choix.
 *
 * LA PHRASE BLEUE DIT DE QUOI ON PARLE. Devant cinq marques, la question est
 * « une gamme pour quoi ? ». Elle compte l'appareillage du relevé — avec les
 * nombres du ticket, pas les siens — et dit ce que la gamme ne change pas.
 */
import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { chiffrerLePlan } from '../geometry/devisplan';
import { ceQueLaGammeChange } from '../geometry/devis';
import { GAMMES } from '../geometry/prix';
import { enumerer } from '../ui/mots';
import { haptic } from '../ui/haptic';
import { useScanStore } from '../store/scanStore';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

export function GammeScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  /*
    LA MARGE HAUTE VIENT DE L'APPAREIL, pas d'un nombre écrit à la main.

    Relevé du patron, capture à l'appui : « la page pour modifier la gamme est
    trop haute ». Le titre chevauchait l'heure et la jauge de batterie — la
    page commençait au pixel zéro, sous l'encoche.

    C'ÉTAIT UNE FAUTE DE NAISSANCE DE CETTE PAGE : ses deux voisines, le devis
    et le magasin, réservent le haut de l'écran ; celle-ci, écrite dans la
    foulée, ne l'avait pas repris. Elles le font avec un nombre en dur —
    cinquante-huit et soixante points —, ce qui tombe juste sur un iPhone à
    encoche et réserve du vide sur tout le reste. On demande la marge à celui
    qui la connaît.
  */
  const marges = useSafeAreaInsets();
  const setScreen = useScanStore((s) => s.setScreen);
  const walls = useScanStore((s) => s.walls);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const ceiling = useScanStore((s) => s.ceiling);
  const openings = useScanStore((s) => s.openings);
  const gamme = useScanStore((s) => s.gammeDevis);
  const setGamme = useScanStore((s) => s.setGammeDevis);

  /*
    ON RECHIFFRE POUR COMPTER, ET C'EST VOULU.

    La légende sort du même `chiffrerLePlan` que le ticket : les nombres
    annoncés ici sont donc, à la ligne près, ceux que le devis chiffre. Une
    page qui compterait les appareils de son côté finirait par annoncer « 4
    prises » devant un ticket qui en chiffre cinq — et cet écart-là ne se
    retrouve jamais.
  */
  const comptes = useMemo(
    () =>
      ceQueLaGammeChange(
        chiffrerLePlan(walls, rooms, fixtures, ceiling, gamme, undefined, openings)
          .legende,
      ),
    [walls, rooms, fixtures, ceiling, gamme, openings],
  );

  const phrase =
    comptes.length === 0
      ? 'Aucun appareil au relevé pour l’instant. La gamme se choisit quand même : elle s’appliquera à tout ce que vous poserez.'
      : `Votre relevé compte ${enumerer(
          comptes.map((x) => `${x.quantite} ${x.mot}`),
        )}. C’est le prix de ceux-là que la gamme fait bouger — d’une marque à l’autre, du simple au double.`;

  const choisir = (id: (typeof GAMMES)[number]['id']) => {
    haptic('leger');
    setGamme(id);
    /*
      ON REPART AUSSITÔT VERS LE PRIX. Choisir une gamme n'est pas une fin en
      soi : on veut voir ce que ça change. Rester ici obligerait à un second
      geste pour la seule chose qui nous intéresse.
    */
    setScreen('devis');
  };

  return (
    <RetourGlisse
      onRetour={() => setScreen('devis')}
      /* Un plancher, pour les appareils qui ne déclarent aucune marge : le
         titre ne colle pas au bord non plus quand il n'y a pas d'encoche. */
      style={[styles.container, { paddingTop: Math.max(marges.top, 14) }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.roundButton}
          accessibilityLabel="Retour"
          accessibilityRole="button"
          onPress={() => setScreen('devis')}>
          <BackChevron color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.titrePage}>Quel appareillage ?</Text>
      </View>

      {/*
        LA PHRASE BLEUE — elle compte AVANT de proposer.

        Un écran qui aligne cinq marques sans dire sur quoi elles portent
        demande un choix à l'aveugle. Celui qui lit « votre relevé compte 9
        prises, 5 commandes et 1 prise de communication » sait exactement ce
        qu'il est en train de tarifer.
      */}
      <View style={styles.encart}>
        <Text style={styles.encartTexte}>{phrase}</Text>
        <Text style={styles.encartFin}>
          Le reste — gaines, fils, boîtes, tableau — ne change pas.
        </Text>
      </View>

      <ScrollView
        style={styles.rouleau}
        contentContainerStyle={styles.rouleauFond}
        showsVerticalScrollIndicator={false}>
        {GAMMES.map((g) => {
          const choisi = g.id === gamme;
          return (
            <TouchableOpacity
              key={g.id}
              accessibilityLabel={`${g.marque} ${g.nom}${choisi ? ', choisi' : ''}`}
              accessibilityRole="button"
              activeOpacity={0.75}
              style={[styles.carte, choisi && styles.carteChoisie]}
              onPress={() => choisir(g.id)}>
              <View style={styles.texts}>
                <Text style={styles.carteNom}>{`${g.marque} ${g.nom}`}</Text>
                <Text style={styles.carteNote}>{g.note}</Text>
              </View>
              <View style={[styles.coche, choisi && styles.cocheOn]}>
                {choisi && <Text style={styles.cocheTexte}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </RetourGlisse>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 },
    /*
      L'EN-TÊTE NE REMONTE PAS LA MARGE. Il portait huit points de plus en
      haut : le titre serait tombé neuf points plus bas que celui du devis,
      et l'on voit ce saut en passant d'une page à l'autre.
    */
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingBottom: 6,
    },
    roundButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    titrePage: { color: c.ink, fontSize: 22, fontWeight: '900' },
    /*
      L'ENCART EST BLEU, et c'est le bleu de l'information de cette
      application — celui du bouton du magasin, celui des pastilles de calque.
      Le vert dit un total, le rouge dit un danger ; le bleu explique.
    */
    encart: {
      backgroundColor: c.blueSoft,
      borderRadius: radius.lg,
      padding: 14,
      gap: 6,
      marginTop: 6,
      marginBottom: 12,
    },
    encartTexte: { color: c.blue, fontSize: 14, fontWeight: '800', lineHeight: 20 },
    encartFin: { color: c.blue, fontSize: 12, fontWeight: '700', opacity: 0.85 },
    rouleau: { flex: 1 },
    rouleauFond: { paddingBottom: 28, gap: 10 },
    carte: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: 'transparent',
      padding: 14,
    },
    carteChoisie: { borderColor: c.blue },
    texts: { flex: 1, gap: 3 },
    carteNom: { color: c.ink, fontSize: 16, fontWeight: '900' },
    carteNote: { color: c.inkSoft, fontSize: 12, fontWeight: '600' },
    coche: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cocheOn: { backgroundColor: c.blue, borderColor: c.blue },
    cocheTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  }),
);
