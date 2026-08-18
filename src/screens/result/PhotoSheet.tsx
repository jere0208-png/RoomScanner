/**
 * LA PHOTO DE REPÉRAGE, EN GRAND.
 *
 * Elle documente un mur — la gaine qui en sort, le compteur qu'il porte —
 * et ne sert à rien trois semaines plus tard sans dire DE QUEL mur il
 * s'agit. Sa légende porte donc la longueur du mur, et le cas du mur
 * supprimé entre-temps est dit plutôt que laissé vide.
 */
import React from 'react';
import { Image, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { segLength, type WallSeg } from '../../geometry/floorplan';
import { fr } from './format';
import { getStyles } from './styles';

export function PhotoSheet({
  photoId,
  photos,
  walls,
  onClose,
  onDelete,
}: {
  /** La photo ouverte, ou `null` quand il n'y en a pas. */
  photoId: string | null;
  photos: { id: string; wallId: string; path: string }[];
  walls: WallSeg[];
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const styles = getStyles(useTheme());
  const ph = photos.find((p) => p.id === photoId);
  const mur = ph ? walls.find((w) => w.id === ph.wallId) : undefined;
  return (
    <Modal
      visible={!!photoId}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.photoFond} onPress={onClose}>
        {ph ? (
          <>
            <Image
              source={{ uri: `file://${ph.path}` }}
              style={styles.photoPleine}
              resizeMode="contain"
            />
            <View style={styles.photoBarre}>
              <Text style={styles.photoLegende} numberOfLines={1}>
                {mur ? `Mur de ${fr(segLength(mur), 2)} m` : 'Mur supprimé'}
              </Text>
              <TouchableOpacity onPress={() => onDelete(ph.id)}>
                <Text style={styles.photoSuppr}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </Pressable>
    </Modal>
  );
}
