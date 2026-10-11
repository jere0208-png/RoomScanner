/**
 * LA FENÊTRE DU TABLEAU FINI — le coffret dessiné, puis sa légende.
 *
 * Relevé du patron, photo d'un coffret à l'appui : « avoir un rendu visuel
 * du tableau fini réaliste, avec le tableau que l'on a constitué ». Elle
 * s'ouvre en touchant le tableau sur la maquette 3D, depuis la feuille du
 * tableau, ou depuis la fiche du tableau posé sur le plan.
 *
 * Le dessin tient dans la largeur de l'écran et se pince pour lire les
 * étiquettes ; la légende, dessous, les redit en toutes lettres — repère,
 * organe, usage et pièce —, parce qu'une étiquette de quinze millimètres se
 * lit mal sur un téléphone, même agrandie.
 *
 * Tant qu'aucun tableau n'a été constitué, elle montre celui que le plan
 * appelle (`tableauDepuisLePlan`), et le dit.
 */
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dimensionsDuCoffret, implanter, type TableauExistant } from '../geometry/existant';
import { etiquettesDuTableau } from '../geometry/tableauFini';
import { SOLAIRES } from '../ui/solaires';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import { BackChevron } from './BackChevron';
import { TableauRealiste, teinteDeLEtiquette } from './TableauRealiste';
import { nommerOrgane } from './TableauVivant';

export function TableauFiniSheet({
  visible,
  tableau,
  projete,
  onClose,
  onModifier,
}: {
  visible: boolean;
  tableau: TableauExistant | null;
  /** Le tableau vient du plan : rien n'a encore été constitué. */
  projete: boolean;
  onClose: () => void;
  /** Ouvre la construction du tableau (la feuille du tableau). */
  onModifier?: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const marges = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const lecture = useMemo(() => {
    if (!tableau) return null;
    const impl = implanter(tableau);
    const dims = dimensionsDuCoffret({ rangees: impl.rangees, parRangee: impl.parRangee });
    // La largeur du dessin, cotes comprises (voir `TableauRealiste`).
    const largeurMm = Math.round(dims.largeur * 1000) + 42;
    const ordre = [...impl.modules].sort((a, b) => a.rangee - b.rangee || a.debut - b.debut);
    return { impl, ordre, largeurMm, etiquettes: etiquettesDuTableau(tableau) };
  }, [tableau]);
  if (!visible) return null;
  const echelle = lecture ? Math.max(0.6, (width - 32) / lecture.largeurMm) : 1;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[s.fond, { paddingTop: marges.top + 6 }]}>
        <View style={s.tete}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={10} style={s.retour} onPress={onClose}>
            <BackChevron color={c.ink} size={22} />
          </Pressable>
          <View style={s.titres}>
            <Text style={s.titre}>Le tableau</Text>
            <Text style={s.sous}>
              {projete
                ? 'Projeté d’après le plan — constituez-le pour qu’il soit le vôtre.'
                : 'Tel que vous l’avez constitué.'}
            </Text>
          </View>
        </View>
        {onModifier ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={projete ? 'Constituer le tableau' : 'Modifier le tableau'}
            style={({ pressed }) => [s.modifier, pressed && { opacity: 0.8 }]}
            onPress={onModifier}>
            <Text style={s.modifierTexte}>{projete ? 'Constituer le tableau' : 'Modifier le tableau'}</Text>
          </Pressable>
        ) : null}
        <ScrollView contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}>
          {lecture && tableau ? (
            <>
              {/* Le dessin se pince : les étiquettes se lisent de près. */}
              <ScrollView
                horizontal
                maximumZoomScale={4}
                minimumZoomScale={1}
                bouncesZoom
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.dessin}>
                <TableauRealiste tableau={tableau} echelle={echelle} />
              </ScrollView>
              <Text style={s.section}>Légende</Text>
              {lecture.ordre.map(({ depart: d }) => {
                const e = lecture.etiquettes.get(d.id);
                if (!e) return null;
                const detail = [d.usage, d.piece].filter(Boolean).join(' · ');
                return (
                  <View key={d.id} style={s.ligne} accessibilityLabel={`${e.repere}, ${nommerOrgane(d)}${detail ? `, ${detail}` : ''}`}>
                    <View style={[s.pastille, { backgroundColor: `${teinteDeLEtiquette(d)}22` }]}>
                      <Svg width={18} height={18} viewBox="0 0 24 24">
                        <Path d={SOLAIRES[e.icone]} fill={teinteDeLEtiquette(d)} fillRule="evenodd" />
                      </Svg>
                    </View>
                    <View style={s.ligneTextes}>
                      <Text style={s.ligneNom}>{`${e.repere} · ${nommerOrgane(d)}`}</Text>
                      {detail ? <Text style={s.ligneDetail}>{detail}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={s.vide}>Aucun tableau à montrer : posez le tableau sur le plan, ou constituez-le.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    tete: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
    retour: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titres: { flex: 1 },
    titre: { color: c.ink, fontSize: 22, fontWeight: '700' },
    sous: { color: c.inkSoft, fontSize: 13, marginTop: 2 },
    modifier: {
      marginHorizontal: 16,
      marginTop: 12,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modifierTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    dessin: { paddingHorizontal: 16, paddingTop: 16 },
    section: {
      color: c.inkSoft,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 18,
      marginBottom: 6,
      marginHorizontal: 16,
    },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    pastille: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    ligneTextes: { flex: 1 },
    ligneNom: { color: c.ink, fontSize: 15, fontWeight: '600' },
    ligneDetail: { color: c.inkSoft, fontSize: 13, marginTop: 1 },
    vide: { color: c.inkSoft, fontSize: 14, margin: 16 },
  }),
);
