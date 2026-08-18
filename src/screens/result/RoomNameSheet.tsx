/**
 * LE NOM DE LA PIÈCE — une liste plutôt qu'un clavier.
 *
 * Sur un chantier, neuf noms sur dix sont dans la liste : les taper au
 * clavier, une main sur l'échelle, est un geste qu'on n'a aucune raison de
 * demander. « Autre… » reste là pour le dixième.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../theme';
import { ROOM_NAME_CHOICES } from '../../geometry/furniture';
import { getStyles } from './styles';

export function RoomNameSheet({
  visible,
  nomActuel,
  onClose,
  onChoose,
  onOther,
}: {
  visible: boolean;
  /** Le nom porté par la pièce visée, pour cocher sa pastille. */
  nomActuel: string | null;
  onClose: () => void;
  onChoose: (nom: string) => void;
  onOther: () => void;
}) {
  const styles = getStyles(useTheme());
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>Nom de la pièce</Text>
          <Text style={styles.modalSubtitle}>
            Il s'affiche sur le plan 2D, au même endroit sur la vue 3D, et
            dans le métré du PDF.
          </Text>
          <ScrollView style={styles.nameScroll}>
            <View style={styles.nameGrid}>
              {ROOM_NAME_CHOICES.map((choice) => {
                // Les homonymes sont numérotés (« Chambre 2 ») : la pastille
                // d'origine doit rester cochée pour eux aussi.
                const on =
                  nomActuel === choice ||
                  (nomActuel ?? '').startsWith(`${choice} `);
                return (
                  <TouchableOpacity
                    key={choice}
                    style={[styles.nameChip, on && styles.nameChipOn]}
                    onPress={() => onChoose(choice)}>
                    <Text
                      style={[styles.nameChipText, on && styles.nameChipTextOn]}>
                      {choice}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalGhost} onPress={onClose}>
              <Text style={styles.modalGhostText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalPrimary} onPress={onOther}>
              <Text style={styles.modalPrimaryText}>Autre…</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
