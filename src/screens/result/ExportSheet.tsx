/**
 * LE CHOIX DU FORMAT D'EXPORT.
 *
 * Sorti de `ResultScreen` avec les six autres fenêtres de cet écran : à
 * quatre mille lignes, retoucher la vignette d'une sortie obligeait à
 * traverser tout le plan et ses bandeaux pour y arriver.
 */
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../theme';
import { type ExportArtKind } from '../../components/ExportArt';
import {
  ExportFond,
  FOND_SOMBRE,
  type MurDuFond,
} from '../../components/ExportFond';
import { getStyles } from './styles';
import { useAccountStore } from '../../store/accountStore';

/** La hauteur d'une carte : assez pour que l'image se lise, pas plus. */
export const HAUTEUR_CARTE = 92;

export function ExportSheet({
  visible,
  modeElec = true,
  murs = [],
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
  /**
   * Les murs du niveau affiché : c'est LEUR plan que les images de fond
   * dessinent. Vide, un logement d'exemple tient lieu.
   */
  murs?: MurDuFond[];
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
  /*
    LE BADGE PRO SUR CE QUI EST PRO — le dire AVANT le toucher, pas après.
    L'image filigranée reste libre : c'est un partage qui fait connaître
    l'application, et il ne cède rien de ce qui se vend.
  */
  const pro = useAccountStore((st) => st.pro);
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
      modeElec ? 'Fichier OBJ, pour Blender.' : 'Pour les logiciels 3D (fichier OBJ).',
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
      // Revue « Léa » : « CSV » ne dit rien au particulier.
      modeElec ? 'Métré CSV' : 'Tableau des surfaces',
      modeElec
        ? 'En colonnes, pour chiffrer dans Excel.'
        : 'Pièce par pièce, à ouvrir dans Excel ou Numbers.',
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
      modeElec ? 'En calques, pour AutoCAD. À envoyer à l’architecte.' : 'À envoyer à l’architecte ou au cuisiniste.',
      onDxf,
    ],
    [
      'image',
      'Image du plan',
      // Revues « Nadia », « Marie », « Sophie » : la seule sortie gratuite
      // ne disait pas qu'elle l'était.
      // Revue « Bernard » : il cherchait comment IMPRIMER son plan.
      'La vue affichée, avec ses cotes : à envoyer ou à imprimer. Gratuite, avec le logo EchoPlan.',
      onImage,
    ],
  ];
  /*
    SANS PRO, L'IMAGE GRATUITE EN TÊTE — revue « Bernard » : cinq sorties
    « PRO » avant la seule qu'il pouvait prendre, en dernier.
  */
  const enOrdre = pro ? sorties : [...sorties.filter(([art]) => art === 'image'), ...sorties.filter(([art]) => art !== 'image')];
  const visibles = modeElec
    ? enOrdre
    : enOrdre.filter(([art]) => art !== 'materiel');
  /*
    LA LARGEUR DES CARTES. L'image se dessine à la taille de la carte : elle
    est déduite de l'écran dès la première image (la feuille garde 28 points
    de marge de part et d'autre, la carte 20 de rembourrage), puis précisée
    à la pose.
  */
  const ecran = useWindowDimensions();
  const [largeur, setLargeur] = useState(Math.max(200, ecran.width - 96));

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
            UNE SORTIE PAR LIGNE, ET CHACUNE MONTRE CE QU'ELLE DONNE.

            Relevé du patron : « revois le menu exporter pour afficher des
            options dans un listing vertical 1 par 1, avec des images de fond
            pour une compréhension visuelle ». La grille de deux tenait dans
            l'écran, mais chaque tuile ne portait qu'une icône de 44 points :
            on lisait le format, on ne voyait pas le résultat. Chaque carte
            prend maintenant la largeur, et son fond MONTRE ce qu'on obtient
            — avec le plan qu'on vient de relever (voir `ExportFond`). La
            liste défile si l'écran est court : six cartes, c'est plus haut
            qu'un petit iPhone.
          */}
          <ScrollView
            style={{ maxHeight: ecran.height * 0.66 }}
            contentContainerStyle={styles.exportListe}
            showsVerticalScrollIndicator={false}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - largeur) > 1) setLargeur(w);
            }}>
            {visibles.map(([art, titre, detail, action]) => {
              const sombre = FOND_SOMBRE(art, teinte);
              return (
                <TouchableOpacity
                  key={titre}
                  style={styles.exportCarte}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={titre}
                  accessibilityHint={detail}
                  onPress={action}>
                  <View style={styles.exportCarteFond} pointerEvents="none">
                    <ExportFond
                      kind={art}
                      c={teinte}
                      largeur={largeur}
                      hauteur={HAUTEUR_CARTE}
                      murs={murs}
                    />
                  </View>
                  <View style={styles.exportCarteTextes} pointerEvents="none">
                    <View style={styles.exportCarteLigne}>
                      <Text
                        style={[styles.exportCarteTitre, sombre && styles.exportCarteTitreClair]}
                        numberOfLines={1}>
                        {titre}
                      </Text>
                      {!pro && art !== 'image' && (
                        <View style={styles.exportBadgePro} testID={`badge-pro-${art}`}>
                          <Text style={styles.exportBadgeProTexte}>PRO</Text>
                        </View>
                      )}
                      {!pro && art === 'image' && (
                        <View style={styles.exportBadgeGratuit} testID="badge-gratuit-image">
                          <Text style={styles.exportBadgeProTexte}>GRATUIT</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.exportCarteDetail, sombre && styles.exportCarteDetailClair]}
                      numberOfLines={2}>
                      {detail}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
