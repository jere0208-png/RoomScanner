/**
 * « VOS PRIX PRO » — la porte du tarif du distributeur, dans le devis.
 *
 * Relevé du patron : « trouve un moyen d'avoir aussi les prix pro Rexel,
 * Balitrand, Yesss, etc. ». Les prix pro ne sont publiés nulle part : ce sont
 * ceux du COMPTE de l'électricien (voir `geometry/tarifPro`). La carte dit
 * donc ce qu'il faut faire en une phrase — exporter son tarif depuis l'espace
 * client et l'ouvrir ici — puis, une fois fait, ce qui a été reconnu.
 *
 * Elle vit sous le bandeau des prix publics, pas à sa place : le devis montré
 * au client reste au prix public ; le prix d'achat est pour l'électricien, et
 * il s'écrit en plus, ligne par ligne.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { dateDuReleve } from '../geometry/prix';
import type { TarifPro } from '../geometry/tarifPro';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

export function CartePrixPro({
  tarif,
  reconnus,
  enCours,
  message,
  possible,
  onImporter,
  onRetirer,
}: {
  tarif: TarifPro | null;
  /** Les lignes de CE devis qui ont un prix pro. */
  reconnus: number;
  enCours: boolean;
  /** Ce que le dernier import a donné, quand il n'a rien donné. */
  message: string | null;
  /** La fenêtre Fichiers existe-t-elle (iOS) ? */
  possible: boolean;
  onImporter: () => void;
  onRetirer: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  return (
    <View style={s.carte} testID="carte-prix-pro">
      <View style={s.tete}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9"
            stroke={c.ink}
            strokeWidth={1.8}
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
        <Text style={s.titre}>Vos prix d’achat pro</Text>
      </View>
      {tarif ? (
        <Text style={s.texte}>
          {`Tarif ${tarif.distributeur} du ${dateDuReleve(tarif.importe)} · ${reconnus} article${
            reconnus > 1 ? 's' : ''
          } de ce devis reconnu${reconnus > 1 ? 's' : ''}, prix HT sous chaque ligne.`}
        </Text>
      ) : (
        <Text style={s.texte}>
          Rexel, Sonepar, Yesss, Balitrand, CGED… : exportez votre tarif depuis votre
          espace client (Excel ou CSV), puis ouvrez-le ici. Vos prix nets s’affichent
          sous chaque article ; rien ne quitte le téléphone.
        </Text>
      )}
      {!!message && <Text style={s.message}>{message}</Text>}
      {possible && (
        <View style={s.gestes}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={tarif ? 'Remplacer le tarif pro' : 'Importer un tarif pro'}
            disabled={enCours}
            style={s.bouton}
            onPress={onImporter}>
            {enCours ? (
              <ActivityIndicator color={c.blue} />
            ) : (
              <Text style={s.boutonMot}>{tarif ? 'Remplacer' : 'Importer un tarif'}</Text>
            )}
          </TouchableOpacity>
          {tarif && !enCours && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retirer le tarif pro"
              style={s.retirer}
              onPress={onRetirer}>
              <Text style={s.retirerMot}>Retirer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

/** Ce qu'un import manqué veut dire, en une phrase. */
export function motDeLImport(raison: 'annule' | 'illisible' | 'colonnes' | 'aucun'): string | null {
  switch (raison) {
    case 'annule':
      return null;
    case 'illisible':
      return 'Ce fichier ne s’ouvre pas. Exportez-le en Excel (.xlsx) ou en CSV.';
    case 'colonnes':
      return 'Colonnes introuvables : il faut au moins un code EAN ou une référence fabricant, et un prix.';
    case 'aucun':
      return 'Aucun article du catalogue reconnu dans ce tarif (ni EAN, ni référence fabricant en commun).';
  }
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    carte: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.lineStrong,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 12,
      gap: 6,
    },
    tete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    titre: { color: c.ink, fontSize: 14.5, fontWeight: '700' },
    texte: { color: c.inkSoft, fontSize: 12.5, lineHeight: 17 },
    message: { color: c.amber, fontSize: 12, lineHeight: 16, fontWeight: '600' },
    gestes: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
    bouton: {
      height: 36,
      minWidth: 132,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boutonMot: { color: c.blue, fontSize: 14, fontWeight: '600' },
    retirer: { height: 36, justifyContent: 'center' },
    retirerMot: { color: c.inkFaint, fontSize: 13.5, fontWeight: '600' },
  }),
);
