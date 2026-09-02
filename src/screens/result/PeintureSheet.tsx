/**
 * LE NUANCIER D'UNE PIÈCE — douze teintes, et rien d'autre.
 *
 * Septième des dix améliorations. La maquette rendait deux choses : le blanc
 * cassé du dessin, ou la teinte relevée au scan. Entre les deux, rien — et
 * c'est justement là que se tient la question qu'un client pose toujours :
 * « et si on mettait du vert d'eau ? ».
 *
 * PAS DE SÉLECTEUR DE COULEUR. C'est la doctrine du mobilier, mot pour mot —
 * « ils ne servent pas à redécorer mais à imaginer la pièce seulement ». Un
 * choix libre produirait des maquettes fuchsia qu'on ne montre à personne.
 * Douze pots, ceux qu'on trouve chez le marchand.
 *
 * LE NUANCIER SE VOIT EN GRAND, en bas de l'écran. Une couleur ne se juge
 * pas sur une pastille de douze points : les carrés font soixante-douze de
 * côté, et le nom se lit dessous — « Vert sauge » dit plus qu'un carré vert
 * quand il s'agit d'en parler à quelqu'un au téléphone.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { PEINTURES, PEINTURE_DEFAUT } from '../../ui/peintures';
import { SOLAIRES } from '../../ui/solaires';
import { getStyles } from './styles';

export function PeintureSheet({
  visible,
  nomPiece,
  choisie,
  onChoisir,
  onClose,
}: {
  visible: boolean;
  nomPiece: string;
  /** La clé posée sur la pièce, ou `null` : elle est alors au blanc. */
  choisie: string | null;
  onChoisir: (cle: string | null) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Une pièce sans peinture EST au blanc cassé : la première case porte donc
  // la coche, plutôt que de laisser le nuancier sans réponse.
  const active = choisie ?? PEINTURE_DEFAUT;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>Peindre {nomPiece}</Text>
          <Text style={styles.catAide}>
            La teinte habille les murs de cette pièce en 3D. Elle ne change
            rien au relevé.
          </Text>
          <ScrollView style={styles.catScroll}>
            <View style={styles.peintureGrille}>
              {PEINTURES.map((p) => {
                const prise = p.cle === active;
                return (
                  <Pressable
                    key={p.cle}
                    accessibilityRole="button"
                    accessibilityState={{ selected: prise }}
                    accessibilityLabel={p.nom}
                    style={styles.peintureCase}
                    onPress={() =>
                      onChoisir(p.cle === PEINTURE_DEFAUT ? null : p.cle)
                    }>
                    <View
                      style={[
                        styles.peintureCarre,
                        { backgroundColor: p.hex },
                        prise && styles.peintureCarrePrise,
                      ]}>
                      {prise && (
                        <Svg width={22} height={22} viewBox="0 0 24 24">
                          <Path
                            d={SOLAIRES.check}
                            fill="none"
                            /* La coche se pose SUR la teinte : sur un
                               anthracite, une coche sombre ne se voit pas. */
                            stroke={p.cle === 'anthracite' ? '#FFFFFF' : c.ink}
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Svg>
                      )}
                    </View>
                    <Text style={styles.peintureNom} numberOfLines={1}>
                      {p.nom}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
