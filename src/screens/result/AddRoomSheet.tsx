/**
 * AJOUTER UNE PIÈCE, sans tout recommencer.
 *
 * Un logement ne se relève pas toujours d'un trait : on scanne le séjour,
 * on est appelé ailleurs, on revient pour la chambre. La seule porte de
 * sortie était « Nouveau scan » — qui efface tout. On pose donc une pièce
 * aux cotes qu'on donne, accolée au plan, et on l'ajuste au doigt comme
 * n'importe quel mur.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, Text } from 'react-native';
import { useTheme } from '../../theme';
import { RoomChoice } from '../../components/RoomChoice';
import { getStyles } from './styles';

/** Les gabarits proposés : des pièces qu'on rencontre, aux cotes usuelles. */
const MODELES = [
  { nom: 'Chambre', largeur: 3.4, profondeur: 3 },
  { nom: 'Séjour', largeur: 5, profondeur: 4 },
  { nom: 'Cuisine', largeur: 3.2, profondeur: 2.6 },
  { nom: 'Salle de bain', largeur: 2.4, profondeur: 2 },
  { nom: 'WC', largeur: 1.4, profondeur: 1 },
  { nom: 'Dégagement', largeur: 3, profondeur: 1.2 },
  { nom: 'Bureau', largeur: 3, profondeur: 2.6 },
  { nom: 'Buanderie', largeur: 2.2, profondeur: 1.8 },
];

export function AddRoomSheet({
  visible,
  accolee,
  onClose,
  onChoose,
  onCustom,
}: {
  visible: boolean;
  /** Un mur est désigné : la pièce viendra s'y accoler. */
  accolee: boolean;
  onClose: () => void;
  onChoose: (largeur: number, profondeur: number, nom: string) => void;
  onCustom: () => void;
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
          <Text style={styles.modalTitle}>Ajouter une pièce</Text>
          <Text style={styles.modalSubtitle}>
            {accolee
              ? 'Elle s’accole au mur choisi et le partage avec lui : ' +
                'elle en prend la longueur, et vous donnez la profondeur.'
              : 'Elle se pose à côté du plan. Pour l’accoler, touchez ' +
                'd’abord le mur qui les séparera, puis ajoutez-la.'}
          </Text>
          <ScrollView style={styles.nameScroll}>
            <RoomChoice
              modeles={MODELES}
              onChoose={(m) =>
                onChoose(m.largeur, Math.min(m.largeur, m.profondeur), m.nom)
              }
              onCustom={onCustom}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
