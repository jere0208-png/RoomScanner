/**
 * LE CHOIX DU FORMAT D'EXPORT.
 *
 * Sorti de `ResultScreen` avec les six autres fenêtres de cet écran : à
 * quatre mille lignes, retoucher la vignette d'une sortie obligeait à
 * traverser tout le plan et ses bandeaux pour y arriver.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../theme';
import { type ExportArtKind } from '../../components/ExportArt';
import { ExportFond, type MurDuFond } from '../../components/ExportFond';
import { getStyles } from './styles';
import { useAccountStore } from '../../store/accountStore';
import { useScanStore } from '../../store/scanStore';
import { SheetShell } from '../../components/Sheet';
import { BackChevron } from '../../components/BackChevron';

/**
 * La hauteur d'une carte : assez pour que l'image se lise. C'est un
 * MINIMUM — revue de lancement : « En calques, pour AutoCAD. À envoyer à
 * l'architecte » se coupait en « à envoyer… » dans une carte de 92 points
 * fixes, et plus encore en grand texte. La carte grandit avec son texte.
 */
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
  onDevis,
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
  /**
   * Le devis (mode électricité). Sans elle, la feuille se ferme et ouvre la
   * page du devis d'elle-même — comme la pastille du prix sur le plan.
   */
  onDevis?: () => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  /*
    LE BADGE PRO SUR CE QUI EST PRO — le dire AVANT le toucher, pas après.
    L'image filigranée reste libre : c'est un partage qui fait connaître
    l'application, et il ne cède rien de ce qui se vend.
  */
  const pro = useAccountStore((st) => st.pro);
  /*
    CE QUI ATTEND LA FERMETURE — iOS ne présente pas deux fenêtres à la
    fois : l'offre Pro (ou la page du devis) part quand la feuille a fini de
    disparaître. Si `onDismiss` ne vient pas (hors iOS), un délai prend le
    relais.
  */
  const apres = useRef<(() => void) | null>(null);
  const lancerApres = () => {
    const a = apres.current;
    apres.current = null;
    a?.();
  };
  useEffect(() => {
    if (visible || !apres.current) return;
    const t = setTimeout(lancerApres, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const ouvrirDevis =
    onDevis ??
    (() => {
      apres.current = () => {
        // Comme la pastille du plan : le total se voit, le devis détaillé est Pro.
        if (!useAccountStore.getState().pro) {
          useAccountStore.getState().ouvrirSurprise();
          return;
        }
        useScanStore.getState().demanderLesTarifs();
        useScanStore.getState().setScreen('devis');
      };
      onClose();
    });
  const sorties: [ExportArtKind, string, string, () => void][] = [
    /*
      LE DEVIS EN TÊTE, EN MODE ÉLECTRICITÉ — revue « Gérard », puis
      « clair-44 » : l'électricien venait envoyer son devis et trouvait le
      modèle 3D pour Blender, le DXF, le tableur… et pas le devis, qui ne
      s'ouvrait que par la pastille du prix ou au fond de l'export PDF.
      C'est ce qu'il remet le plus souvent : il passe devant.
    */
    ...(modeElec
      ? ([
          [
            'devis',
            'Devis',
            'Numéroté, à votre en-tête, matériel et pose compris.',
            ouvrirDevis,
          ],
        ] as [ExportArtKind, string, string, () => void][])
      : []),
    [
      'pdf',
      'Plan PDF',
      /*
        L'UNIFILAIRE SE DIT SUR LA CARTE — relevé « electricien » : en mode
        Électricité, la carte ne parlait que de cotes et de 3D, et l'on
        cherchait le schéma ailleurs. Le dossier de l'électricien porte, coché
        d'office, le schéma unifilaire et les murs de face où il perce.
      */
      modeElec ? 'Coté, métré, schéma unifilaire, murs de face.' : 'Coté, métré, vues 3D.',
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
      // Revue « clair-20 » : le badge « GRATUIT » puis « Gratuite » dans
      // la même carte — le badge le dit, le texte ne le répète pas.
      pro
        ? 'La vue affichée, avec ses cotes : à envoyer ou à imprimer, sans logo.'
        : 'La vue affichée, avec ses cotes : à envoyer ou à imprimer, avec le logo EchoPlan.',
      onImage,
    ],
  ];
  /*
    SANS PRO, L'IMAGE GRATUITE EN TÊTE — revue « Bernard » : cinq sorties
    « PRO » avant la seule qu'il pouvait prendre, en dernier.
  */
  const enOrdre = pro
    ? sorties
    : [
        ...sorties.filter(([art]) => art === 'devis'),
        ...sorties.filter(([art]) => art === 'image'),
        ...sorties.filter(([art]) => art !== 'image' && art !== 'devis'),
      ];
  const visibles = modeElec
    ? enOrdre
    : enOrdre.filter(([art]) => art !== 'materiel');
  /*
    LES DEUX SORTIES UTILES D'ABORD — revue « Inès » : le PDF et l'image,
    qu'on envoie tous les jours, étaient mêlés à l'OBJ, au DXF et au
    tableur. Hors mode électricien, ceux-là attendent sous « Autres
    formats ». L'électricien, lui, chiffre au tableur : tout reste à vue.
  */
  const [autres, setAutres] = useState(false);
  const principales = modeElec ? visibles : visibles.filter(([art]) => art === 'pdf' || art === 'image');
  const secondaires = modeElec ? [] : visibles.filter(([art]) => art !== 'pdf' && art !== 'image');
  /*
    LA LARGEUR DES CARTES. L'image se dessine à la taille de la carte : elle
    est déduite de l'écran dès la première image (la feuille du bas garde
    18 points de rembourrage de part et d'autre ; sur tablette, elle est
    bornée à 560), puis précisée à la pose.
  */
  const ecran = useWindowDimensions();
  const [largeur, setLargeur] = useState(
    Math.max(200, (ecran.width > 620 ? 560 : ecran.width) - 36),
  );
  /* La hauteur réelle de chaque carte, pour que l'image de fond la couvre
     entière quand le texte l'a fait grandir. */
  const [hauteurs, setHauteurs] = useState<Record<string, number>>({});

  return (
    /*
      LA MÊME FEUILLE QUE LES AUTRES MENUS — revue UX : le choix d'export
      était le seul menu présenté en carte centrée, en fondu, sans poignée
      ni geste de fermeture. Il monte maintenant du bas dans la coquille
      commune (`SheetShell`) : poignée qu'on tire, croix, voile, même
      animation. Le contenu ne change pas — une sortie par ligne, chacune
      avec son image. La fenêtre native partie, `onDismiss` lance ce qui
      attendait (le partage, l'offre Pro, la page du devis) : iOS ne
      présente pas deux fenêtres à la fois.
    */
    <SheetShell
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        onDismiss();
        lancerApres();
      }}
      // La liste défile d'elle-même : deux défilements l'un dans l'autre se
      // disputeraient le doigt.
      defile={false}
      styleFeuille={styles.exportFeuille}
      styleVoile={styles.exportVoile}>
      <View testID="feuille-export">
        <View style={styles.exportEntete}>
          <View style={styles.exportEnteteTextes}>
            <Text style={styles.modalTitle}>Exporter</Text>
            <Text style={styles.modalSubtitle}>
              Un document à remettre, ou un fichier à envoyer.
            </Text>
          </View>
          {/* Pas de croix ici : la coquille commune la porte. */}
        </View>
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
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - largeur) > 1) setLargeur(w);
          }}>
          {[...principales, ...(autres ? secondaires : [])].map(([art, titre, detail, action]) => {
            /* Le badge se voit, il doit aussi se dire : « PRO » posé sur
               la carte n'était pas lu par VoiceOver. */
            const statut = pro ? '' : art === 'image' ? ', gratuit' : ', réservé à l’abonnement Pro';
            return (
              <TouchableOpacity
                key={titre}
                style={styles.exportCarte}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${titre}${statut}`}
                accessibilityHint={detail}
                onLayout={(e) => {
                  const h = Math.round(e.nativeEvent.layout.height);
                  if (h > 0 && hauteurs[art] !== h) setHauteurs((x) => ({ ...x, [art]: h }));
                }}
                onPress={action}>
                <View style={styles.exportCarteFond} pointerEvents="none">
                  <ExportFond
                    kind={art}
                    c={teinte}
                    largeur={largeur}
                    hauteur={Math.max(HAUTEUR_CARTE, hauteurs[art] ?? 0)}
                    murs={murs}
                  />
                </View>
                <View style={styles.exportCarteTextes} pointerEvents="none">
                  <View style={styles.exportCarteLigne}>
                    <Text style={styles.exportCarteTitre}>{titre}</Text>
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
                  <Text style={styles.exportCarteDetail}>{detail}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {secondaires.length > 0 && !autres && (
            <TouchableOpacity
              style={styles.exportAutres}
              accessibilityRole="button"
              accessibilityLabel="Autres formats"
              accessibilityHint="Modèle 3D, plan DXF, tableau des surfaces"
              onPress={() => setAutres(true)}>
              <View style={styles.exportAutresTextes}>
                <Text style={styles.exportAutresTexte}>Autres formats</Text>
                <Text style={styles.exportAutresDetail}>3D, DXF pour l’architecte, tableau des surfaces</Text>
              </View>
              {/* Le chevron de l'app, tourné vers le bas : la liste se
                  déplie sur place, on ne change pas d'écran. */}
              <View style={styles.exportAutresChevron}>
                <BackChevron size={18} color={teinte.inkFaint} />
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </SheetShell>
  );
}
