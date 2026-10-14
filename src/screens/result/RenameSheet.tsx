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
import { NOM_PLAN_MAX } from '../../store/scanStore';

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
        {/* Revue « Yasmine » : la phrase renvoyait à un bouton qui n'existe
            plus — le plan s'enregistre tout seul. */}
        <Text style={styles.modalSubtitle}>Le nom qu’on lit dans vos plans et sur le dossier.</Text>
        <TextInput
          style={styles.modalInput}
          value={valeur}
          onChangeText={onChange}
          autoFocus
          selectTextOnFocus
          clearButtonMode="while-editing"
          maxLength={NOM_PLAN_MAX}
          returnKeyType="done"
          onSubmitEditing={onRename}
        />
        {/* La limite se voit avant d'être atteinte (revue « Hugo »). */}
        {valeur.length >= NOM_PLAN_MAX - 10 && (
          <Text style={styles.modalSubtitle}>{`${valeur.length}/${NOM_PLAN_MAX} caractères`}</Text>
        )}
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
