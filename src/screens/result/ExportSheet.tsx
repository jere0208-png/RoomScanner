/**
 * LE CHOIX DU FORMAT D'EXPORT.
 *
 * Sorti de `ResultScreen` avec les six autres fenêtres de cet écran : à
 * quatre mille lignes, retoucher la vignette d'une sortie obligeait à
 * traverser tout le plan et ses bandeaux pour y arriver.
 */
import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { ExportArt, type ExportArtKind } from '../../components/ExportArt';
import { getStyles } from './styles';

export function ExportSheet({
  visible,
  onClose,
  onDismiss,
  onPdf,
  onObj,
  onMaterial,
  onCsv,
  onImage,
  onPresentation,
}: {
  visible: boolean;
  onClose: () => void;
  /** iOS ne présente pas deux écrans à la fois : le partage attend ici. */
  onDismiss: () => void;
  onPdf: () => void;
  onObj: () => void;
  onMaterial: () => void;
  onCsv: () => void;
  onImage: () => void;
  onPresentation: () => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const sorties: [ExportArtKind, string, string, () => void][] = [
    [
      'pdf',
      'Plan PDF',
      'Plan coté, métré par pièce, vues 3D. À imprimer ou à envoyer.',
      onPdf,
    ],
    [
      'obj',
      'Modèle 3D',
      'Fichier OBJ du plan retouché, pour Blender ou SketchUp.',
      onObj,
    ],
    [
      'materiel',
      'Liste du matériel',
      'Appareillage par pièce, circuits et disjoncteurs, ' +
        'conformité. Le document à remettre.',
      onMaterial,
    ],
    /*
      LE MÊME MÉTRÉ, MAIS DANS UN TABLEUR.

      Le PDF est fait pour être REMIS ; un devis, lui, se prépare dans un
      tableur, où l'on colle ses prix à côté des quantités. Recopier soixante
      lignes depuis un PDF, personne ne le fait : on refait le métré, et on
      se trompe.
    */
    [
      'csv',
      'Métré CSV',
      'Surfaces, appareillage, circuits et câble, en colonnes. ' +
        'À ouvrir dans Excel pour chiffrer.',
      onCsv,
    ],
    [
      'image',
      'Image',
      'Capture de la vue affichée, avec le filigrane EchoPlan.',
      onImage,
    ],
    /*
      LA PRÉSENTATION SE CHOISIT ICI, avec les autres sorties.

      Elle a longtemps cherché sa place : au pied de l'écran d'export, puis
      sur l'écran du scan, puis sous l'aperçu du plan. À chaque fois le même
      malentendu — on la rangeait dans le réglage d'un DOCUMENT, alors que
      c'est une SORTIE, au même titre qu'un PDF ou un modèle 3D. Elle est
      donc dans le menu qui les propose : c'est celle qu'on lance devant
      quelqu'un.
    */
    [
      'presentation',
      'Présentation animée',
      'Le logement se présente tout seul, pièce par pièce. ' +
        'À montrer au client, sur place.',
      onPresentation,
    ],
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onDismiss={onDismiss}
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>Exporter</Text>
          <Text style={styles.modalSubtitle}>
            Un document à remettre, ou une présentation à montrer.
          </Text>
          {sorties.map(([art, titre, detail, action]) => (
            <TouchableOpacity
              key={titre}
              style={styles.exportChoice}
              activeOpacity={0.8}
              onPress={action}>
              {/* La vignette dit CE QU'ON OBTIENT : une feuille cotée, un
                  volume, un bordereau, une capture. On la reconnaît sans
                  lire — quatre lignes de texte, non. */}
              <ExportArt kind={art} c={teinte} />
              <View style={styles.exportChoiceTexts}>
                <Text style={styles.exportChoiceTitle}>{titre}</Text>
                <Text style={styles.exportChoiceDetail}>{detail}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
