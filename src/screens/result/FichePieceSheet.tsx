/**
 * LA FICHE DE LA PIÈCE — tout ce que le scan en a appris, d'un coup d'œil.
 *
 * Relevé du patron : « cherche des améliorations à apporter au scan, qu'il
 * peut apporter ensuite à notre app en termes d'informations sur les pièces
 * scannées ». Le bandeau de la pièce ne disait que sa surface, ses cotes et
 * une hauteur — celle du plus haut de ses murs. La fiche dit ce qu'on vient
 * chercher en entrant :
 *
 *   — LA SURFACE, et quand le plafond descend, LA SURFACE HABITABLE : ce qui
 *     est sous 1,80 m ne compte pas (loi Carrez) ;
 *   — LA HAUTEUR SOUS PLAFOND MESURÉE au LiDAR, de la plus basse à la plus
 *     haute, et le PLAFOND RAMPANT quand il l'est ;
 *   — LE VOLUME, qui dimensionne le chauffage et la ventilation ;
 *   — LES OUVERTURES, la surface vitrée et l'EXPOSITION de chaque fenêtre ;
 *   — LES ÉQUIPEMENTS que le scan a reconnus, et LES CIRCUITS qu'ils
 *     appellent — posables d'un appui, derrière l'appareil.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { CircuitConseille, FicheDeLaPiece } from '../../geometry/fichePiece';
import { HAUTEUR_HABITABLE } from '../../geometry/fichePiece';
import { radius, shadowCard, useTheme, type Palette } from '../../theme';
import { SOLAIRES } from '../../ui/solaires';
import { haptic } from '../../ui/haptic';
import { useModeElec } from '../../store/usage';
import { AlerteHote } from '../../components/AlerteHote';

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const CHECK = 'M9.5 16.2 5.8 12.5l-1.4 1.4 5.1 5.1 10.6-10.6-1.4-1.4z';

export function FichePieceSheet({
  visible,
  nom,
  fiche,
  onClose,
  onPoser,
}: {
  visible: boolean;
  nom: string;
  fiche: FicheDeLaPiece | null;
  onClose: () => void;
  /** Pose les circuits demandés, derrière leurs appareils. */
  onPoser: (circuits: CircuitConseille[]) => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const modeElec = useModeElec();
  const aPoser = fiche ?fiche.circuits.filter((k) => !k.deja && k.pose) : [];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/*
        LE VOILE À CÔTÉ DE LA FICHE, PAS AUTOUR — revue VoiceOver : la fiche
        vivait dans le Pressable du voile, et iOS cache au lecteur d'écran
        ce que contient un élément accessible : ni la croix ni « Tout poser »
        n'étaient activables. L'appui hors de la fiche ferme toujours.
      */}
      <View style={s.fond}>
        <Pressable
          testID="voile-fiche"
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={s.carte} accessibilityViewIsModal>
          <View style={s.tete}>
            <View style={s.teteTexte}>
              <Text style={s.titre} numberOfLines={1}>
                {nom || 'Pièce sans nom'}
              </Text>
              <Text style={s.sousTitre}>Ce que le scan en a appris</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={onClose}>
              <Text style={s.croix}>✕</Text>
            </TouchableOpacity>
          </View>

          {fiche && (
            <ScrollView style={s.corps} contentContainerStyle={s.corpsFond}>
              {fiche.rampant && (
                <View style={s.rampant} testID="plafond-rampant">
                  <Svg width={16} height={16} viewBox="0 0 24 24">
                    <Path d={SOLAIRES.elevations} fill="#FFFFFF" fillRule="evenodd" />
                  </Svg>
                  <Text style={s.rampantTexte}>
                    Plafond rampant : de {fr(fiche.hauteurMin ?? 0)} à {fr(fiche.hauteurMax ?? 0)} m
                  </Text>
                </View>
              )}

              {fiche.cotesDesMurs.length > 0 && (
                <>
                  <Text style={s.section}>Longueur des murs</Text>
                  <View style={s.bloc}>
                    <Text style={s.ligne}>{fiche.cotesDesMurs.map((l) => fr(l)).join(' · ')} m</Text>
                  </View>
                </>
              )}

              <View style={s.tuiles}>
                <Tuile
                  mot="Surface au sol"
                  valeur={`${fiche.surfaceExacte ? '' : '≈ '}${fr(fiche.surface)} m²`}
                  note={
                    !fiche.surfaceExacte && fiche.surfaceReleve
                      ? `Le scan a mesuré ${fr(fiche.surfaceReleve)} m²`
                      : 'Le contour des murs'
                  }
                />
                {fiche.surfaceHabitable !== null && (
                  <Tuile
                    mot="Surface habitable"
                    valeur={`${fr(fiche.surfaceHabitable)} m²`}
                    note={fiche.raisonHabitable ?? (modeElec ? `Sous ${fr(HAUTEUR_HABITABLE)} m exclu (loi Carrez)` : 'Celle d’une annonce')}
                    accent
                  />
                )}
                <Tuile
                  mot="Hauteur sous plafond"
                  valeur={`${fr(fiche.hauteur)} m`}
                  note={
                    fiche.hauteurMesuree
                      ? fiche.rampant
                        ? 'Moyenne mesurée par le téléphone'
                        : `Mesurée par le téléphone · ${fr(fiche.hauteurMin ?? fiche.hauteur)}–${fr(fiche.hauteurMax ?? fiche.hauteur)} m`
                      : 'La hauteur des murs'
                  }
                />
                <Tuile mot="Volume" valeur={`${fr(fiche.volume, 1)} m³`} note={modeElec ? 'Pour le chauffage et la VMC' : 'Pour choisir un chauffage'} />
                <Tuile mot="Périmètre" valeur={`${fr(fiche.perimetre)} m`} note="Les plinthes" />
                <Tuile mot="Murs à peindre" valeur={`${fr(fiche.mursNets, 1)} m²`} note="Ouvertures déduites" />
              </View>

              <Text style={s.section}>Ouvertures</Text>
              <View style={s.bloc}>
                <Text style={s.ligne}>
                  {fiche.portes} porte{fiche.portes > 1 ? 's' : ''} · {fiche.fenetres} fenêtre
                  {fiche.fenetres > 1 ? 's' : ''}
                  {fiche.surfaceVitree > 0
                    ? ` · ${fr(fiche.surfaceVitree)} m² vitrés (${Math.round((fiche.surfaceVitree / Math.max(0.01, fiche.surface)) * 100)} % du sol)`
                    : ''}
                </Text>
                {fiche.expositions && fiche.expositions.length > 0 && (
                  <View style={s.puces}>
                    {fiche.expositions.map((e) => (
                      <View key={e.aire} style={s.puce}>
                        <Svg width={13} height={13} viewBox="0 0 24 24">
                          <Path d={SOLAIRES.soleil} fill={c.amber} fillRule="evenodd" />
                        </Svg>
                        <Text style={s.puceTexte}>
                          {e.n > 1 ? `${e.n} fenêtres exposées` : 'Fenêtre exposée'} {e.aire}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {fiche.fenetres > 0 && !fiche.expositions && (
                  <Text style={s.note}>Sans nord relevé au scan, l’exposition ne se dit pas.</Text>
                )}
              </View>

              {fiche.equipements.length > 0 && (
                <>
                  <Text style={s.section}>Reconnu par le scan</Text>
                  <View style={s.puces}>
                    {fiche.equipements.map((e) => (
                      <View key={e.nom} style={s.puce}>
                        <Text style={s.puceTexte}>
                          {e.nom}
                          {e.n > 1 ? ` ×${e.n}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/*
                LES CIRCUITS, POUR L'ÉLECTRICIEN SEULEMENT — relevé du patron,
                point 1 de la réflexion « grand public » : un particulier
                lisait « Circuits à prévoir » et un bouton « Poser » sous la
                fiche de son salon.
              */}
              {modeElec && fiche.circuits.length > 0 && (
                <>
                  <Text style={s.section}>Circuits à prévoir</Text>
                  <View style={s.bloc} testID="circuits-a-prevoir">
                    {fiche.circuits.map((k) => (
                      <View key={k.objetId} style={s.circuit}>
                        <View style={s.circuitTexte}>
                          <Text style={s.circuitNom}>{k.appareil}</Text>
                          <Text style={s.note}>{k.quoi}</Text>
                        </View>
                        {k.deja ? (
                          <View style={[s.etat, { backgroundColor: c.green }]}>
                            <Svg width={12} height={12} viewBox="0 0 24 24">
                              <Path d={CHECK} fill="#FFFFFF" />
                            </Svg>
                            <Text style={s.etatTexte}>Posée</Text>
                          </View>
                        ) : k.pose ? (
                          <TouchableOpacity
                            accessibilityLabel={`Poser : ${k.quoi} — ${k.appareil}`}
                            style={s.poser}
                            onPress={() => {
                              onPoser([k]);
                              haptic('accroche');
                            }}>
                            <Text style={s.poserTexte}>Poser</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={s.note}>Pas de mur derrière</Text>
                        )}
                      </View>
                    ))}
                    {aPoser.length > 1 && (
                      <TouchableOpacity
                        accessibilityLabel="Poser tous les circuits"
                        style={s.toutPoser}
                        onPress={() => {
                          onPoser(aPoser);
                          haptic('succes');
                        }}>
                        <Text style={s.toutPoserTexte}>Tout poser ({aPoser.length})</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
      {/* Une alerte levée la fiche ouverte s'affiche dans sa fenêtre :
          voir la pile d'hôtes de `src/ui/alerte.ts`. */}
      <AlerteHote imbrique actif={visible} />
    </Modal>
  );
}

function Tuile({ mot, valeur, note, accent }: { mot: string; valeur: string; note: string; accent?: boolean }) {
  const c = useTheme();
  const s = getStyles(c);
  return (
    <View style={[s.tuile, accent && { borderColor: c.blue, borderWidth: 1.5 }]} accessibilityLabel={`${mot} : ${valeur}`}>
      <Text style={s.tuileMot}>{mot}</Text>
      <Text style={s.tuileValeur}>{valeur}</Text>
      <Text style={s.tuileNote} numberOfLines={2}>
        {note}
      </Text>
    </View>
  );
}

const getStyles = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: 'rgba(11,13,18,0.45)', justifyContent: 'flex-end' },
    carte: {
      backgroundColor: c.bg,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 24,
      maxHeight: '88%',
      ...shadowCard,
    },
    tete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    teteTexte: { flex: 1 },
    titre: { color: c.ink, fontSize: 19, fontWeight: '700' },
    sousTitre: { color: c.inkFaint, fontSize: 13, marginTop: 2 },
    croix: { color: c.inkFaint, fontSize: 17, fontWeight: '700' },
    corps: { marginTop: 12 },
    corpsFond: { paddingBottom: 12, gap: 6 },
    rampant: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.amber,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignSelf: 'flex-start',
    },
    rampantTexte: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
    tuiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    tuile: {
      flexGrow: 1,
      flexBasis: '46%',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 12,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    tuileMot: { color: c.inkFaint, fontSize: 12, fontWeight: '600' },
    tuileValeur: { color: c.ink, fontSize: 20, fontWeight: '800', marginTop: 2 },
    tuileNote: { color: c.inkSoft, fontSize: 11.5, marginTop: 3, lineHeight: 15 },
    section: {
      color: c.ink,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 14,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    bloc: { backgroundColor: c.surface, borderRadius: radius.md, padding: 12, gap: 8 },
    ligne: { color: c.ink, fontSize: 14, fontWeight: '600', lineHeight: 19 },
    note: { color: c.inkFaint, fontSize: 12.5, lineHeight: 17 },
    puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    puce: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    puceTexte: { color: c.ink, fontSize: 12.5, fontWeight: '700' },
    circuit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    circuitTexte: { flex: 1 },
    circuitNom: { color: c.ink, fontSize: 14.5, fontWeight: '700' },
    etat: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
    etatTexte: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
    poser: { backgroundColor: c.blue, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
    poserTexte: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
    toutPoser: { alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: c.blueSoft },
    toutPoserTexte: { color: c.blue, fontSize: 14, fontWeight: '700' },
  });
