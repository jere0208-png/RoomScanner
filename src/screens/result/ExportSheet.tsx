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
  onDxf,
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
  onDxf: () => void;
  onImage: () => void;
  onPresentation: () => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const sorties: [ExportArtKind, string, string, () => void][] = [
    [
      'pdf',
      'Plan PDF',
      'Coté, métré, vues 3D.',
      onPdf,
    ],
    [
      'obj',
      'Modèle 3D',
      'Fichier OBJ, pour Blender.',
      onObj,
    ],
    [
      'materiel',
      'Liste du matériel',
      'Appareillage, circuits, conformité.',
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
      'En colonnes, pour chiffrer dans Excel.',
      onCsv,
    ],
    /*
      LE DESSIN QU'ON REPREND, pas le document qu'on lit.

      Le PDF se remet à un client ; le DXF s'ouvre chez un architecte, un
      économiste, un cuisiniste, une menuiserie — qui le posent sous LEUR
      projet et l'annotent. C'est le format d'échange du bâtiment depuis
      quarante ans, et ne pas l'avoir fermait la porte des clients qui
      paient le mieux.
    */
    [
      'dxf',
      'Plan DXF',
      'En calques, pour AutoCAD. À envoyer à l’architecte.',
      onDxf,
    ],
    [
      'image',
      'Image',
      'La vue affichée, filigranée.',
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
          {/*
            DEUX PAR LIGNE — relevé du patron : « refais ce pop-up pour le
            réduire en faisant des blocs de 2 par ligne ».

            Sept sorties en pleine largeur faisaient une feuille plus haute
            que l'écran : l'image et la présentation ne se trouvaient qu'en
            défilant, et une sortie qu'on ne voit pas n'existe pas. Le
            détail de chacune s'est resserré à une ligne au passage — à
            mi-largeur, la phrase entière rendait la tuile plus haute que
            la rangée qu'elle remplaçait, et l'on n'aurait rien gagné.
          */}
          <View style={styles.exportGrille}>
            {sorties.map(([art, titre, detail, action]) =>
              /*
                LA PRÉSENTATION GARDE SA PLEINE LARGEUR.

                Les six premières sont des FICHIERS : on les obtient, on les
                envoie. La dernière ne produit rien — c'est un spectacle
                qu'on lance devant quelqu'un, sur place. Deux natures, deux
                formes ; et sept tuiles dans une grille de deux laisseraient
                de toute façon un trou.
              */
              art === 'presentation' ? (
                <TouchableOpacity
                  key={titre}
                  style={[styles.exportChoice, styles.exportChoiceLarge]}
                  activeOpacity={0.8}
                  accessibilityLabel={titre}
                  onPress={action}>
                  <ExportArt kind={art} c={teinte} />
                  <View style={styles.exportChoiceTexts}>
                    <Text style={styles.exportChoiceTitle}>{titre}</Text>
                    <Text style={styles.exportChoiceDetail}>{detail}</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={titre}
                  style={styles.exportTuile}
                  activeOpacity={0.8}
                  /* La tuile se lit d'un nom : le commentaire qui la précède
                     éloignait son titre du lecteur d'écran. */
                  accessibilityLabel={titre}
                  onPress={action}>
                  {/* La vignette dit CE QU'ON OBTIENT : une feuille cotée,
                      un volume, un bordereau, une capture. On la reconnaît
                      sans lire — quatre lignes de texte, non. */}
                  <View style={styles.exportTuileArt}>
                    <ExportArt kind={art} c={teinte} />
                  </View>
                  <Text style={styles.exportChoiceTitle}>{titre}</Text>
                  <Text style={styles.exportChoiceDetail}>{detail}</Text>
                </TouchableOpacity>
              ),
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
