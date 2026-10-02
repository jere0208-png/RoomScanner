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
  modeElec = true,
  onClose,
  onDismiss,
  onPdf,
  onObj,
  onMaterial,
  onCsv,
  onDxf,
  onImage,
}: {
  visible: boolean;
  /**
   * LE MODE ÉLECTRICITÉ — voir `store/usage`. Sans lui, la liste du matériel
   * (appareillage, circuits, conformité) n'a rien à lister, et le métré ne
   * porte plus que les pièces : surfaces, périmètres, murs à peindre.
   */
  modeElec?: boolean;
  onClose: () => void;
  /** iOS ne présente pas deux écrans à la fois : le partage attend ici. */
  onDismiss: () => void;
  onPdf: () => void;
  onObj: () => void;
  onMaterial: () => void;
  onCsv: () => void;
  onDxf: () => void;
  onImage: () => void;
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
      modeElec
        ? 'En colonnes, pour chiffrer dans Excel.'
        : 'Surfaces et murs, pour Excel.',
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
  ];
  /*
    SANS LE MODE, CINQ SORTIES — et la cinquième prend la ligne entière.

    Une grille de deux qui finit sur une tuile seule laisse un trou à droite,
    qu'on lit comme un bouton manquant. La dernière s'étale donc quand le
    compte est impair : la grille reste pleine, quel que soit le mode.
  */
  const visibles = modeElec
    ? sorties
    : sorties.filter(([art]) => art !== 'materiel');
  const impaire = visibles.length % 2 === 1;
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
            Un document à remettre, ou un fichier à envoyer.
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
            {/*
              SIX FICHIERS, TROIS RANGÉES — et plus de tuile à part.

              La septième sortie était la présentation animée, en pleine
              largeur parce qu'elle ne produisait pas de fichier. Elle a
              disparu avec la refonte grand public (voir README) : une visite
              qui défile toute seule, mur par mur et appareil par appareil,
              ne parlait qu'aux électriciens. On entre désormais dans le
              logement soi-même — c'est l'Exploration, sur la barre de la 3D.
            */}
            {visibles.map(([art, titre, detail, action], i) => (
              <TouchableOpacity
                key={titre}
                style={[
                  styles.exportTuile,
                  impaire && i === visibles.length - 1 && styles.exportTuileLarge,
                ]}
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
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
