/**
 * LE RENOMMAGE DU SCAN — EN FEUILLE DU BAS, pas en boîte centrée.
 *
 * Une boîte au milieu de l'écran avec un champ de saisie finit toujours par
 * se faire manger la moitié : le clavier iOS occupe le bas de l'écran, et
 * recouvrait ici le champ lui-même, « Annuler », « Renommer » et la copie.
 * La feuille, elle, monte avec lui.
 */
import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { SheetShell } from '../../components/Sheet';
import { getStyles } from './styles';

export function RenameSheet({
  visible,
  valeur,
  onChange,
  onClose,
  onRename,
  onCopy,
}: {
  visible: boolean;
  valeur: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onRename: () => void;
  /** Garder l'ancien dossier et en ouvrir un neuf sous ce nom-là. */
  onCopy: () => void;
}) {
  const styles = getStyles(useTheme());
  return (
    <SheetShell visible={visible} onClose={onClose}>
      <View>
        <Text style={styles.modalTitle}>Nom du scan</Text>
        <Text style={styles.modalSubtitle}>
          Les modifications du plan s’enregistrent avec le bouton en bas à
          droite du plan.
        </Text>
        <TextInput
          style={styles.modalInput}
          value={valeur}
          onChangeText={onChange}
          autoFocus
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={onRename}
        />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalGhost} onPress={onClose}>
            <Text style={styles.modalGhostText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalPrimary} onPress={onRename}>
            <Text style={styles.modalPrimaryText}>Renommer</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.modalCopy} onPress={onCopy}>
          <Text style={styles.modalCopyText}>
            Enregistrer comme nouvelle copie
          </Text>
        </TouchableOpacity>
      </View>
    </SheetShell>
  );
}
