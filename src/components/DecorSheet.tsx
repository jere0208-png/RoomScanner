/**
 * DÉCORER — les murs, le sol et les meubles d'une pièce, au même endroit.
 *
 * Relevé du patron : « je ne vois pas la possibilité de changer la couleur
 * des meubles ou du sol ». Elle existait, mais en trois endroits cachés du
 * mode édition, sur le PLAN : la barre d'une pièce (« Peindre »), celle d'un
 * mur, celle d'un meuble. Or c'est en 3D qu'on voit ce qu'on change. La
 * maquette porte donc un bouton « Décorer », et cette feuille tient tout :
 * la pièce, puis ses murs, son sol, et chacun de ses meubles. Un appui
 * s'applique aussitôt — la maquette, au-dessus, se repeint sous les yeux.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ObjectData } from 'react-native-room-scan';
import { SheetShell } from './Sheet';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';
import { PEINTURES, PEINTURE_DEFAUT, type Peinture } from '../ui/peintures';
import { SOLS, SOL_DEFAUT, TEINTES_MEUBLES, TEINTE_ORIGINE, cleDeTeinte, hexDeTeinte } from '../ui/habillage';
import { catalogItem } from '../geometry/catalogue';
import { frCategory } from '../geometry/furniture';
import { useScanStore } from '../store/scanStore';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/** Une teinte foncée : la coche s'y pose en blanc. */
const sombre = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  if (!isFinite(v)) return false;
  return 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255) < 140;
};

/** Le nom d'un meuble : celui du catalogue, sinon sa catégorie. */
export function nomDuMeuble(o: ObjectData): string {
  return (o.modele && catalogItem(o.modele)?.label) || frCategory(o.category ?? '');
}

export function DecorSheet({
  visible,
  onClose,
  pieceInitiale,
}: {
  visible: boolean;
  onClose: () => void;
  /** La pièce à décorer d'abord : celle qu'on regarde, ou la première. */
  pieceInitiale?: string | null;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const rooms = useScanStore((st) => st.rooms);
  const objects = useScanStore((st) => st.objects);
  const nommees = rooms;
  const [pieceId, setPieceId] = useState<string | null>(null);
  useEffect(() => {
    if (visible) setPieceId(pieceInitiale ?? nommees[0]?.id ?? null);
  }, [visible, pieceInitiale, nommees]);
  const piece = nommees.find((r) => r.id === pieceId) ?? nommees[0] ?? null;
  const meubles = useMemo(
    () => (piece ? objects.filter((o) => o.roomId === piece.id && !/tapis/i.test(o.category ?? '')) : []),
    [objects, piece],
  );
  // « Chaise 1 », « Chaise 2 » : deux meubles du même nom se distinguent.
  const nomsDesMeubles = useMemo(() => {
    const total = new Map<string, number>();
    for (const o of meubles) total.set(nomDuMeuble(o), (total.get(nomDuMeuble(o)) ?? 0) + 1);
    const vu = new Map<string, number>();
    return new Map(
      meubles.map((o) => {
        const nom = nomDuMeuble(o);
        if ((total.get(nom) ?? 0) < 2) return [o.id, nom];
        const k = (vu.get(nom) ?? 0) + 1;
        vu.set(nom, k);
        return [o.id, `${nom} ${k}`];
      }),
    );
  }, [meubles]);

  /** Une rangée de pastilles : la coche sur celle qui est prise. */
  const nuancier = (
    liste: (Peinture & { motif?: 'parquet' | 'carrelage' | null })[],
    prise: string,
    dire: (p: Peinture) => string,
    choisir: (cle: string) => void,
    taille = 40,
  ) => (
    <View style={s.nuancier}>
      {liste.map((p) => {
        const on = p.cle === prise;
        return (
          <Pressable
            key={p.cle}
            accessibilityRole="button"
            accessibilityLabel={dire(p)}
            accessibilityState={{ selected: on }}
            hitSlop={4}
            onPress={() => {
              haptic('leger');
              choisir(p.cle);
            }}
            style={[
              s.pastille,
              { width: taille, height: taille, borderRadius: taille / 2, backgroundColor: p.hex },
              on && { borderColor: c.blue, borderWidth: 3 },
            ]}>
            {p.motif ? (
              <Svg width={taille} height={taille} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
                {p.motif === 'parquet'
                  ? [6, 12, 18].map((y) => <Path key={y} d={`M0 ${y} H24`} stroke="#00000026" strokeWidth={0.8} />)
                  : [8, 16].flatMap((k) => [
                      <Path key={`h${k}`} d={`M0 ${k} H24`} stroke="#FFFFFF99" strokeWidth={0.9} />,
                      <Path key={`v${k}`} d={`M${k} 0 V24`} stroke="#FFFFFF99" strokeWidth={0.9} />,
                    ])}
              </Svg>
            ) : null}
            {on && (
              <Svg width={taille * 0.5} height={taille * 0.5} viewBox="0 0 24 24">
                <Path
                  d={SOLAIRES.check}
                  fill="none"
                  stroke={sombre(p.hex) ? '#FFFFFF' : c.ink}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const st = useScanStore.getState;
  return (
    <SheetShell visible={visible} onClose={onClose} defile={false}>
      <View style={s.tete}>
        <Text style={s.titre}>Décorer</Text>
        <Text style={s.sous}>Murs, sol et meubles : la maquette change sous vos yeux. Le relevé, lui, ne bouge pas.</Text>
      </View>
      <ScrollView style={s.corps} contentContainerStyle={s.corpsFond} showsVerticalScrollIndicator={false}>
        {nommees.length === 0 ? (
          <Text style={s.vide}>Aucune pièce sur ce plan : tracez ou redétectez les pièces pour les décorer.</Text>
        ) : (
          <>
            {nommees.length > 1 && (
              <View style={s.puces}>
                {nommees.map((r, i) => {
                  const prise = r.id === piece?.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      accessibilityLabel={r.name || `Pièce ${i + 1}`}
                      accessibilityState={{ selected: prise }}
                      style={[s.puce, prise && { backgroundColor: c.blue, borderColor: c.blue }]}
                      onPress={() => {
                        haptic('leger');
                        setPieceId(r.id);
                      }}>
                      <Text style={[s.puceTexte, prise && { color: '#FFFFFF' }]} numberOfLines={1}>
                        {r.name || `Pièce ${i + 1}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {piece && (
              <>
                <Text style={s.section}>Les murs</Text>
                {nuancier(
                  PEINTURES,
                  piece.peinture ?? PEINTURE_DEFAUT,
                  (p) => `Murs : ${p.nom}`,
                  (cle) => st().setRoomPeinture(piece.id, cle === PEINTURE_DEFAUT ? null : cle),
                )}
                <Text style={s.section}>Le sol</Text>
                {nuancier(
                  SOLS,
                  piece.sol ?? SOL_DEFAUT,
                  (p) => `Sol : ${p.nom}`,
                  (cle) => st().setRoomSol(piece.id, cle === SOL_DEFAUT ? null : cle),
                )}
                <Text style={s.section}>Les meubles</Text>
                {meubles.length === 0 ? (
                  <Text style={s.vide}>Aucun meuble dans cette pièce.</Text>
                ) : (
                  meubles.map((o) => {
                    const nom = nomsDesMeubles.get(o.id) ?? nomDuMeuble(o);
                    return (
                      <View key={o.id} style={s.meuble}>
                        <Text style={s.meubleNom} numberOfLines={1}>
                          {nom}
                        </Text>
                        {nuancier(
                          TEINTES_MEUBLES,
                          o.teinte ? cleDeTeinte(o.teinte) : TEINTE_ORIGINE,
                          (p) => `${nom} : ${p.nom}`,
                          (cle) => st().setObjectTeinte(o.id, hexDeTeinte(cle)),
                          30,
                        )}
                      </View>
                    );
                  })
                )}
                <Text style={s.aide}>
                  Un mur seul se peint depuis sa barre, en mode édition sur le plan : « Peindre ».
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    tete: { paddingRight: 44, paddingLeft: 2 },
    titre: { color: c.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
    sous: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 3 },
    corps: { maxHeight: 520, marginTop: 10 },
    corpsFond: { paddingBottom: 14 },
    puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    puce: {
      paddingHorizontal: 14,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      justifyContent: 'center',
    },
    puceTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
    section: {
      color: c.inkSoft,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 8,
    },
    nuancier: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    pastille: {
      borderWidth: 1,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    meuble: {
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      padding: 10,
      marginBottom: 8,
      gap: 8,
    },
    meubleNom: { color: c.ink, fontSize: 14, fontWeight: '700' },
    vide: { color: c.inkSoft, fontSize: 13.5, lineHeight: 19 },
    aide: { color: c.inkFaint, fontSize: 12, lineHeight: 16, marginTop: 14 },
  }),
);
