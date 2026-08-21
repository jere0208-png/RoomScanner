/**
 * LE TABLEAU QU'ON TROUVE EN ARRIVANT.
 *
 * On l'ouvre, on note ce qu'il y a, l'application dit ce qui cloche. C'est
 * le premier quart d'heure de tout chantier de rénovation, et il se faisait
 * jusqu'ici sur un carnet — puis se ressaisissait le soir.
 *
 * LA SAISIE PASSE AVANT LA BEAUTÉ. On est debout, devant un tableau ouvert,
 * une main sur le téléphone : chaque départ doit se noter en deux appuis, et
 * les valeurs qu'on rencontre vraiment (2, 10, 16, 20, 32 A) sont des
 * boutons, pas un clavier. Le nom de ce que ça commande se prend dans une
 * liste — « Prises cuisine », « Éclairage séjour » — parce qu'un mot tapé au
 * doigt sur un chantier, c'est un mot mal tapé.
 *
 * LE VERDICT VIT EN HAUT, et il se met à jour à chaque départ ajouté : on
 * voit l'installation se juger à mesure qu'on la décrit. Trois degrés, trois
 * couleurs — le rouge est réservé à ce qui expose quelqu'un aujourd'hui.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { radius, shadowCard, useTheme, type Palette } from '../../theme';
import {
  bilanExistant,
  diagnosticExistant,
  type DepartExistant,
  type GraviteConstat,
} from '../../geometry/existant';
import type { TableauExistant } from '../../store/scanStore';
import { haptic } from '../../ui/haptic';

/** Les calibres qu'on rencontre vraiment sur un rail, dans cet ordre. */
const CALIBRES = [2, 10, 16, 20, 32];

/** Ce que commandent les départs, tel qu'on l'écrit sur une étiquette. */
const USAGES = [
  'Éclairage',
  'Prises',
  'Prises cuisine',
  'Plaque de cuisson',
  'Four',
  'Lave-linge',
  'Lave-vaisselle',
  'Chauffe-eau',
  'Chauffage',
  'Volets roulants',
  'Extérieur',
  'Garage',
];

const TEINTE: Record<GraviteConstat, keyof Palette> = {
  danger: 'danger',
  ecart: 'amber',
  vigilance: 'inkFaint',
};

const MOT: Record<GraviteConstat, string> = {
  danger: 'Danger',
  ecart: 'Écart',
  vigilance: 'À vérifier',
};

export function ExistantSheet({
  visible,
  existant,
  onClose,
  onAjouter,
  onModifier,
  onRetirer,
  onDecrire,
}: {
  visible: boolean;
  existant: TableauExistant | null;
  onClose: () => void;
  onAjouter: (d: Omit<DepartExistant, 'id'>) => string;
  onModifier: (id: string, champs: Partial<DepartExistant>) => void;
  onRetirer: (id: string) => void;
  onDecrire: (t: { rangees?: number; parRangee?: number }) => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Le tableau absent donne une liste vide — mais TOUJOURS la même : un
  // `?? []` écrit dans le corps fabriquerait un tableau neuf à chaque
  // rendu, et le diagnostic se recalculerait sans fin.
  const departs = useMemo(() => existant?.departs ?? [], [existant?.departs]);
  /** Le départ ouvert : on ne montre les détails que de celui qu'on touche. */
  const [ouvert, setOuvert] = useState<string | null>(null);

  const constats = useMemo(
    () =>
      diagnosticExistant(
        departs,
        existant?.rangees && existant?.parRangee
          ? { rangees: existant.rangees, parRangee: existant.parRangee }
          : undefined,
      ),
    [departs, existant?.rangees, existant?.parRangee],
  );
  const bilan = bilanExistant(constats);

  /** Le dernier différentiel posé : c'est sous lui que tombent les départs. */
  const dernierDiff = [...departs]
    .reverse()
    .find((d) => d.organe === 'differentiel')?.id;

  const poser = (d: Omit<DepartExistant, 'id'>) => {
    const id = onAjouter(d);
    setOuvert(id);
    haptic('leger');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.fond} onPress={onClose}>
        <Pressable style={styles.carte} onPress={() => {}}>
          <View style={styles.tete}>
            <View style={styles.teteTexte}>
              <Text style={styles.titre}>Tableau existant</Text>
              <Text style={styles.sousTitre}>
                {departs.length === 0
                  ? 'Ouvrez le tableau et notez ce qu’il porte.'
                  : `${departs.length} module(s) relevé(s)`}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Fermer"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={onClose}>
              <Text style={styles.croix}>✕</Text>
            </TouchableOpacity>
          </View>

          {/*
            LE VERDICT, EN HAUT ET TOUT DE SUITE.

            Il se refait à chaque module noté : on voit l'installation se
            juger à mesure qu'on la décrit, au lieu d'attendre un bouton
            « analyser » qu'on oublierait d'appuyer.
          */}
          {departs.length > 0 && (
            <View style={styles.bilan}>
              <Pastille n={bilan.dangers} mot="danger" teinte={c.danger} />
              <Pastille n={bilan.ecarts} mot="écart" teinte={c.amber} />
              {bilan.dangers === 0 && bilan.ecarts === 0 && (
                <Text style={styles.bilanOk}>
                  Rien à redire sur ce qui se voit.
                </Text>
              )}
            </View>
          )}

          <ScrollView
            style={styles.corps}
            contentContainerStyle={styles.corpsFond}
            keyboardShouldPersistTaps="handled">
            {/* ---------------------------------------- ce qu'on ajoute */}
            <Text style={styles.section}>Ajouter</Text>
            <View style={styles.rangeeBoutons}>
              <TouchableOpacity
                style={[styles.gros, { backgroundColor: c.blue }]}
                onPress={() =>
                  poser({
                    organe: 'differentiel',
                    calibre: 40,
                    sensibilite: 30,
                    typeDiff: 'A',
                  })
                }>
                <Text style={styles.grosTexte}>Différentiel 30 mA</Text>
                <Text style={styles.grosNote}>type A</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gros, { backgroundColor: c.surfaceSunken }]}
                onPress={() =>
                  poser({ organe: 'fusible', calibre: 10, usage: 'Éclairage' })
                }>
                <Text style={[styles.grosTexte, { color: c.ink }]}>
                  Porte-fusible
                </Text>
                <Text style={[styles.grosNote, { color: c.inkFaint }]}>
                  ancien tableau
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.aide}>
              Disjoncteur — le calibre lu sur la manette :
            </Text>
            <View style={styles.rangeeBoutons}>
              {CALIBRES.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={styles.calibre}
                  accessibilityLabel={`Disjoncteur ${a} ampères`}
                  onPress={() =>
                    poser({
                      organe: 'disjoncteur',
                      calibre: a,
                      sousDifferentiel: dernierDiff,
                    })
                  }>
                  <Text style={styles.calibreTexte}>{a} A</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ------------------------------------- ce qui est déjà noté */}
            {departs.length > 0 && <Text style={styles.section}>Le rail</Text>}
            {departs.map((d, i) => (
              <View key={d.id}>
                <TouchableOpacity
                  style={styles.ligne}
                  // Le nom du module SE LIT dans la ligne, mais un lecteur
                  // d'écran ne lit pas une puce numérotée : on le dit.
                  accessibilityLabel={`${nommer(d)} — ${d.usage || 'usage non noté'}`}
                  onPress={() => setOuvert(ouvert === d.id ? null : d.id)}>
                  <View
                    style={[
                      styles.puce,
                      {
                        backgroundColor:
                          d.organe === 'differentiel'
                            ? c.blue
                            : d.organe === 'fusible'
                              ? c.danger
                              : c.surfaceSunken,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.puceTexte,
                        {
                          color:
                            d.organe === 'disjoncteur' ? c.ink : '#FFFFFF',
                        },
                      ]}>
                      {i + 1}
                    </Text>
                  </View>
                  <View style={styles.ligneTexte}>
                    <Text style={styles.ligneTitre} numberOfLines={1}>
                      {nommer(d)}
                    </Text>
                    <Text style={styles.ligneNote} numberOfLines={1}>
                      {d.usage || 'Usage non noté'}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{ouvert === d.id ? '▾' : '›'}</Text>
                </TouchableOpacity>

                {ouvert === d.id && (
                  <View style={styles.detail}>
                    {d.organe === 'differentiel' ? (
                      <>
                        <Text style={styles.aide}>Type</Text>
                        <View style={styles.rangeeBoutons}>
                          {(['A', 'AC', 'F'] as const).map((t) => (
                            <TouchableOpacity
                              key={t}
                              style={[
                                styles.choix,
                                d.typeDiff === t && {
                                  backgroundColor: c.blue,
                                },
                              ]}
                              onPress={() => onModifier(d.id, { typeDiff: t })}>
                              <Text
                                style={[
                                  styles.choixTexte,
                                  d.typeDiff === t && { color: '#FFFFFF' },
                                ]}>
                                {t}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.aide}>Sensibilité</Text>
                        <View style={styles.rangeeBoutons}>
                          {[30, 300].map((s) => (
                            <TouchableOpacity
                              key={s}
                              style={[
                                styles.choix,
                                d.sensibilite === s && {
                                  backgroundColor: c.blue,
                                },
                              ]}
                              onPress={() =>
                                onModifier(d.id, { sensibilite: s })
                              }>
                              <Text
                                style={[
                                  styles.choixTexte,
                                  d.sensibilite === s && { color: '#FFFFFF' },
                                ]}>
                                {s} mA
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={styles.aide}>Ce qu’il commande</Text>
                        <View style={styles.rangeeBoutons}>
                          {USAGES.map((u) => (
                            <TouchableOpacity
                              key={u}
                              style={[
                                styles.choix,
                                d.usage === u && { backgroundColor: c.blue },
                              ]}
                              onPress={() => onModifier(d.id, { usage: u })}>
                              <Text
                                style={[
                                  styles.choixTexte,
                                  d.usage === u && { color: '#FFFFFF' },
                                ]}>
                                {u}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.aide}>Calibre</Text>
                        <View style={styles.rangeeBoutons}>
                          {CALIBRES.map((a) => (
                            <TouchableOpacity
                              key={a}
                              style={[
                                styles.choix,
                                d.calibre === a && { backgroundColor: c.blue },
                              ]}
                              onPress={() => onModifier(d.id, { calibre: a })}>
                              <Text
                                style={[
                                  styles.choixTexte,
                                  d.calibre === a && { color: '#FFFFFF' },
                                ]}>
                                {a} A
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}
                    <TouchableOpacity
                      style={styles.retirer}
                      onPress={() => {
                        onRetirer(d.id);
                        setOuvert(null);
                        haptic('leger');
                      }}>
                      <Text style={styles.retirerTexte}>Retirer ce module</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}

            {/* ------------------------------------------- le contenant */}
            {departs.length > 0 && (
              <>
                <Text style={styles.section}>Le tableau</Text>
                <Text style={styles.aide}>
                  Modules par rangée — pour juger la place qui reste :
                </Text>
                <View style={styles.rangeeBoutons}>
                  {[13, 18].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.choix,
                        existant?.parRangee === m && {
                          backgroundColor: c.blue,
                        },
                      ]}
                      onPress={() => onDecrire({ parRangee: m })}>
                      <Text
                        style={[
                          styles.choixTexte,
                          existant?.parRangee === m && { color: '#FFFFFF' },
                        ]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.aide}>Rangées :</Text>
                <View style={styles.rangeeBoutons}>
                  {[1, 2, 3, 4].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.choix,
                        existant?.rangees === r && { backgroundColor: c.blue },
                      ]}
                      onPress={() => onDecrire({ rangees: r })}>
                      <Text
                        style={[
                          styles.choixTexte,
                          existant?.rangees === r && { color: '#FFFFFF' },
                        ]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* --------------------------------------------- le verdict */}
            {constats.length > 0 && (
              <>
                <Text style={styles.section}>Ce qu’il faut reprendre</Text>
                {constats.map((k) => (
                  <View key={k.id} style={styles.constat}>
                    <View
                      style={[
                        styles.etiquette,
                        { backgroundColor: c[TEINTE[k.gravite]] as string },
                      ]}>
                      <Text style={styles.etiquetteTexte}>
                        {MOT[k.gravite]}
                      </Text>
                    </View>
                    <Text style={styles.constatTitre}>{k.titre}</Text>
                    <Text style={styles.constatDetail}>{k.detail}</Text>
                    <Text style={styles.constatRemede}>→ {k.remede}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Le nom d'un module, tel qu'on le lirait à voix haute. */
function nommer(d: DepartExistant): string {
  if (d.organe === 'differentiel') {
    return `Différentiel ${d.sensibilite ?? 30} mA${
      d.typeDiff ? ` type ${d.typeDiff}` : ''
    }`;
  }
  if (d.organe === 'fusible') return `Fusible ${d.calibre ?? '?'} A`;
  if (d.organe === 'agcp') return 'Disjoncteur d’abonné';
  if (d.organe === 'parafoudre') return 'Parafoudre';
  return `Disjoncteur ${d.calibre ?? '?'} A`;
}

function Pastille({
  n,
  mot,
  teinte,
}: {
  n: number;
  mot: string;
  teinte: string;
}) {
  const styles = getStyles(useTheme());
  if (n === 0) return null;
  return (
    <View style={[styles.pastille, { backgroundColor: teinte }]}>
      <Text style={styles.pastilleTexte}>
        {n} {mot}
        {n > 1 ? 's' : ''}
      </Text>
    </View>
  );
}

const getStyles = (c: Palette) =>
  StyleSheet.create({
    fond: {
      flex: 1,
      backgroundColor: 'rgba(11,13,18,0.45)',
      justifyContent: 'flex-end',
    },
    carte: {
      backgroundColor: c.bg,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 20,
      maxHeight: '92%',
      ...shadowCard,
    },
    tete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    teteTexte: { flex: 1 },
    titre: { color: c.ink, fontSize: 19, fontWeight: '800' },
    sousTitre: { color: c.inkFaint, fontSize: 13, marginTop: 2 },
    croix: { color: c.inkFaint, fontSize: 17, fontWeight: '700' },
    bilan: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
    bilanOk: { color: c.green, fontSize: 13, fontWeight: '600' },
    pastille: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
    pastilleTexte: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
    corps: { marginTop: 8 },
    corpsFond: { paddingBottom: 16 },
    section: {
      color: c.ink,
      fontSize: 13,
      fontWeight: '800',
      marginTop: 18,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    aide: { color: c.inkFaint, fontSize: 12.5, marginTop: 10, marginBottom: 6 },
    rangeeBoutons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    gros: {
      flex: 1,
      minWidth: 140,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    grosTexte: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
    grosNote: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
    calibre: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minWidth: 62,
      alignItems: 'center',
    },
    calibreTexte: { color: c.ink, fontSize: 15, fontWeight: '800' },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: 11,
      paddingHorizontal: 12,
      marginBottom: 6,
    },
    puce: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    puceTexte: { fontSize: 12.5, fontWeight: '800' },
    ligneTexte: { flex: 1 },
    ligneTitre: { color: c.ink, fontSize: 14.5, fontWeight: '700' },
    ligneNote: { color: c.inkFaint, fontSize: 12.5, marginTop: 1 },
    chevron: { color: c.inkFaint, fontSize: 16, fontWeight: '700' },
    detail: {
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 10,
    },
    choix: {
      backgroundColor: c.surface,
      borderRadius: radius.pill,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    choixTexte: { color: c.ink, fontSize: 13.5, fontWeight: '700' },
    retirer: { marginTop: 14, alignItems: 'center' },
    retirerTexte: { color: c.danger, fontSize: 13.5, fontWeight: '700' },
    constat: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 8,
    },
    etiquette: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginBottom: 7,
    },
    etiquetteTexte: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    constatTitre: { color: c.ink, fontSize: 14.5, fontWeight: '700' },
    constatDetail: { color: c.inkSoft, fontSize: 13, marginTop: 3, lineHeight: 18 },
    constatRemede: { color: c.blue, fontSize: 13, marginTop: 6, fontWeight: '600' },
  });
