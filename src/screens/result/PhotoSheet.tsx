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
import { useScanStore } from '../../store/scanStore';
import {
  cheminVivant,
  choisirPhotosVisibles,
  messagePhotoManquante,
  ouvrirReglagesPhotos,
  type IssueRepose,
} from '../../ui/photos';
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
  /** La dernière photo qu'on est allé rechercher : une tentative, pas deux. */
  const repose = React.useRef<string | null>(null);
  /**
   * POURQUOI ELLE MANQUE, quand le coffre ne l'a pas rendue — accès
   * refusé, accès limité, image effacée. Rattaché à SA photo : une réponse
   * tardive ne s'affiche pas sous la suivante.
   */
  const [manque, setManque] = React.useState<{ id: string; issue: IssueRepose } | null>(null);
  const ph = photos.find((p) => p.id === photoId);
  const mur = ph ? walls.find((w) => w.id === ph.wallId) : undefined;
  const aDire = ph && manque?.id === ph.id ? messagePhotoManquante(manque.issue) : null;

  /** Va chercher l'image au coffre, et retient pourquoi s'il ne la rend pas. */
  const rechercher = (id: string) => {
    useScanStore
      .getState()
      .reposerPhoto(id)
      .then((issue) => setManque(issue === 'repose' ? null : { id, issue }))
      .catch(() => {});
  };

  /**
   * LE GESTE QUI RÉPARE. Accès limité : la feuille du système où l'on
   * coche ses photos, puis une nouvelle recherche. Refus : les Réglages —
   * iOS ne repose jamais la question.
   */
  const reparer = (id: string, geste: 'choisir' | 'reglages') => {
    if (geste === 'reglages') {
      ouvrirReglagesPhotos();
      return;
    }
    choisirPhotosVisibles()
      .then(() => rechercher(id))
      .catch(() => {});
  };
  return (
    <Modal
      visible={!!photoId}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.photoFond} onPress={onClose}>
        {ph ? (
          <>
            {/*
              LE FICHIER MANQUE ? ON VA LE CHERCHER DANS LE COFFRE.

              Après une réinstallation, les Documents de l'application sont
              vides : le chemin ne mène plus à rien. C'est l'échec de
              chargement qui le dit — et c'est le bon moment pour redemander
              l'image à la photothèque, plutôt que de tout relire à chaque
              ouverture d'un scan pour un cas qui n'arrive presque jamais.

              Une seule tentative par photo : si le coffre ne l'a plus non
              plus — l'utilisateur a pu effacer l'image de ses Photos —, on
              ne boucle pas sur une image qui n'existe nulle part.
            */}
            <Image
              source={{ uri: `file://${cheminVivant(ph.path)}` }}
              style={styles.photoPleine}
              resizeMode="contain"
              onError={() => {
                if (repose.current === ph.id) return;
                repose.current = ph.id;
                rechercher(ph.id);
              }}
            />
            {aDire ? (
              <View style={styles.photoManque}>
                <Text style={styles.photoManqueTexte}>{aDire.texte}</Text>
                {aDire.geste ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => reparer(ph.id, aDire.geste!)}>
                    <Text style={styles.photoManqueGeste}>
                      {aDire.geste === 'choisir'
                        ? 'Choisir les photos'
                        : 'Ouvrir les Réglages'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
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
