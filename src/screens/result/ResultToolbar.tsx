/**
 * LA BARRE D'OUTILS DU PLAN — deux rangées, jamais mélangées.
 *
 * En lecture, on ne fait que REGARDER : la rangée ne porte que ce qui
 * s'affiche ou non. En édition, on TRAVAILLE : les calques cèdent la place
 * aux outils, et les cotes ou les meubles restent tels qu'on les avait
 * laissés. Les pastilles rentrent dans le bouton d'édition et en
 * ressortent : c'est lui qui commande le changement, autant qu'on le voie.
 *
 * Elle vivait au milieu de `ResultScreen`, entre le plan et ses sept
 * fenêtres. Les calques qu'elle allume et qu'elle éteint sont dans le
 * magasin : elle les lit elle-même plutôt que de se les faire passer, et
 * ne reçoit que ce qui appartient à l'écran — l'animation, la géométrie de
 * la carte, et les gestes en attente.
 */
import React from 'react';
import { Animated } from 'react-native';
import { Compass } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { RangeeOutils } from '../../components/RangeeOutils';
import { ToolPill } from '../../components/ToolPill';
import { CeilingIcon } from '../../components/CeilingIcon';
import {
  CEILINGS,
  CEILING_KINDS,
  type CeilingKind,
} from '../../geometry/ceiling';
import { type FixtureKind } from '../../geometry/electrical';
import { type ActionData } from '../../components/Sheet';
import { useScanStore } from '../../store/scanStore';
import { getStyles } from './styles';

/** Ce que les deux rangées partagent : la place qu'elles occupent. */
type Cadre = {
  anim: Animated.Value;
  /** Largeur de la carte du plan. */
  largeur: number;
  /** Ligne de fond : au-dessus de l'indicateur d'accueil. */
  bas: number;
};

/**
 * LA RANGÉE DU PLAN 2D.
 *
 * Elle réserve 62 points à droite pour la colonne des actions, et fait
 * monter son trop-plein au-dessus d'elle.
 */
export function Toolbar2D({
  anim,
  largeur,
  bas,
  dessus,
  edition,
  pendingKind,
  pendingCeiling,
  showMeasures,
  setShowMeasures,
  showRoutes,
  showFixtures,
  setShowFixtures,
  setShowRoutes,
  hasRoutes,
  showNorth,
  setShowNorth,
  showCeiling,
  setShowCeiling,
  onFixture,
  onFurniture,
  onFurnitureOff,
  seulGeste,
  setMenu,
  setPendingCeiling,
  setPendingSpots,
}: Cadre & {
  /** Hauteur à franchir pour poser le trop-plein au-dessus des actions. */
  dessus: number;
  /** Le jeu de pastilles affiché : il RETARDE sur le mode d'édition. */
  edition: boolean;
  pendingKind: FixtureKind | null;
  pendingCeiling: CeilingKind | null;
  showMeasures: boolean;
  setShowMeasures: (f: (v: boolean) => boolean) => void;
  showRoutes: boolean;
  /** L'appareillage : un calque, qu'on éteint pour voir le plan nu. */
  showFixtures: boolean;
  setShowFixtures: (f: (v: boolean) => boolean) => void;
  setShowRoutes: (f: (v: boolean) => boolean) => void;
  /** Un tableau est posé : on sait d'où part le câble. */
  hasRoutes: boolean;
  showNorth: boolean;
  setShowNorth: (f: (v: boolean) => boolean) => void;
  showCeiling: boolean;
  setShowCeiling: (v: boolean) => void;
  onFixture: () => void;
  onFurniture: () => void;
  /** Éteindre le calque des meubles éteint ce qui l'accompagne. */
  onFurnitureOff: () => void;
  seulGeste: (garde?: 'mur' | 'plafond' | 'lien' | 'reglage') => void;
  setMenu: (m: ActionData | null) => void;
  setPendingCeiling: (k: CeilingKind | null) => void;
  setPendingSpots: (n: number | null) => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const rooms = useScanStore((s) => s.rooms);
  const ceiling = useScanStore((s) => s.ceiling);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const setShowSurfaces = useScanStore((s) => s.setShowSurfaces);
  const straightenPlan = useScanStore((s) => s.straightenPlan);

  /**
   * LE MENU DU PLAFOND.
   *
   * On choisit l'appareil, puis on touche la pièce qui le reçoit — comme
   * pour les murs. La LIGNE DE SPOTS y tient la première place : quatre
   * spots dans un séjour, c'était quatre poses suivies de quatre réglages,
   * un quart d'heure pour ce que personne ne fait à la main sur un
   * chantier.
   */
  const menuDuPlafond = () => {
    seulGeste('plafond');
    setShowCeiling(true);
    setMenu({
      title: 'Équiper le plafond',
      subtitle:
        'Choisissez l’appareil, puis touchez la pièce qui le reçoit. Il se ' +
        'pose en son centre.',
      actions: [
        ...(rooms.length > 0
          ? [
              {
                label: 'Ligne de spots',
                node: <CeilingIcon kind="spots" />,
                onPress: () =>
                  setMenu({
                    title: 'Combien de spots ?',
                    subtitle:
                      'Ils se répartissent par zones — le retour d’une pièce ' +
                      'en L reçoit les siens — avec un demi-écart aux ' +
                      'extrémités. Longueur ou largeur se choisit ensuite, ' +
                      'sur le plan.',
                    actions: [2, 3, 4, 5, 6, 8].map((n) => ({
                      label: `${n} spots`,
                      hint:
                        n <= 3
                          ? 'Petite pièce, ou une simple ligne d’appoint.'
                          : n >= 6
                          ? 'Grande pièce, ou éclairage général sans ' +
                            'plafonnier.'
                          : undefined,
                      onPress: () => {
                        seulGeste('plafond');
                        setPendingSpots(n);
                      },
                    })),
                  }),
              },
            ]
          : []),
        /*
          LE CATALOGUE SE LIT D'UN COUP D'ŒIL.

          Chaque appareil portait sa règle en trois lignes grises : la liste
          faisait deux écrans, et il fallait dérouler pour trouver un spot.
          Un électricien sait ce qu'est un détecteur de fumée ; ce qu'il
          veut, c'est le toucher. Les règles n'ont pas disparu pour autant —
          elles restent là où elles servent : le contrôle de conformité et
          le dossier imprimé.
        */
        ...CEILING_KINDS.map((k) => ({
          label: CEILINGS[k].label,
          node: <CeilingIcon kind={k} />,
          onPress: () => setPendingCeiling(k),
        })),
      ],
    });
  };

  const outils = edition
    ? [
        <ToolPill
          key="plus"
          icon="appareil"
          label="Appareil"
          active={!!pendingKind}
          onPress={onFixture}
        />,
        <ToolPill
          key="square"
          icon="square"
          label="Redresser"
          active={false}
          onPress={straightenPlan}
        />,
        // En édition, la pastille des meubles OUVRE LE CATALOGUE.
        //
        // Elle portait un « + » à côté d'elle, et restait par ailleurs un
        // interrupteur d'affichage : deux boutons pour un même sujet, dont
        // l'un modifiait le plan et l'autre non. Or on n’entre pas en
        // édition pour cacher les meubles — on y entre pour en poser.
        // Afficher ou cacher redevient ce que c’est, un calque, et se règle
        // hors édition.
        <ToolPill
          key="furniture"
          icon="furniture"
          label="Ajouter"
          active={false}
          onPress={onFurniture}
        />,
        // Le plafond s'équipe comme les murs : on choisit l'appareil, puis
        // on touche la pièce qui le reçoit.
        <ToolPill
          key="plafond"
          icon="plafond"
          label="Plafond"
          active={!!pendingCeiling}
          onPress={menuDuPlafond}
        />,
      ]
    : [
        <ToolPill
          key="ruler"
          icon="ruler"
          label="Cotes"
          active={showMeasures}
          onPress={() => setShowMeasures((v) => !v)}
        />,
        // Le calque des gaines ne s'offre que s'il a quelque chose à
        // montrer : sans tableau posé, on ne sait pas d'où part le câble,
        // et une pastille qui n'allume rien est un piège.
        ...(hasRoutes
          ? [
              <ToolPill
                key="gaines"
                icon="gaines"
                label="Gaines"
                active={showRoutes}
                onPress={() => setShowRoutes((v) => !v)}
              />,
            ]
          : []),
        // HORS ÉDITION, une pastille ne fait qu'AFFICHER ou CACHER. Le « + »
        // du catalogue vivait ici : on pouvait donc modifier le plan sans
        // être en édition, et la barre mélangeait deux natures de gestes.
        <ToolPill
          key="furniture"
          icon="furniture"
          label="Meubles"
          active={showFurniture}
          onPress={() => {
            // Éteindre le calque éteint tout ce qui l'accompagne : les
            // poignées d'un meuble invisible restaient à l'écran,
            // orphelines.
            if (showFurniture) onFurnitureOff();
            setShowFurniture(!showFurniture);
          }}
        />,
        // L'appareillage est le sujet de l'app : allumé au départ, mais il
        // se coupe — sur un logement équipé, ses symboles couvrent la
        // maçonnerie qu'on est venu regarder.
        <ToolPill
          key="elec"
          icon="elec"
          // Pas « Élec » : c'est déjà le nom de la commande qui ouvre
          // l'établi depuis un mur, et deux boutons du même écran ne
          // peuvent pas porter le même mot pour deux gestes différents.
          label="Appareils"
          active={showFixtures}
          onPress={() => setShowFixtures((v) => !v)}
        />,
        <ToolPill
          key="surface"
          icon="surface"
          label="Surfaces"
          active={showSurfaces}
          onPress={() => setShowSurfaces(!showSurfaces)}
        />,
        <ToolPill
          key="nord"
          icon="square"
          label="Nord"
          node={
            <Compass
              size={22}
              color={showNorth ? '#FFFFFF' : teinte.ink}
              strokeWidth={2}
            />
          }
          active={showNorth}
          onPress={() => setShowNorth((v) => !v)}
        />,
        // Le plafond se cache pour revoir le sol : superposés, les deux
        // calques deviennent illisibles.
        ...(ceiling.length > 0
          ? [
              <ToolPill
                key="plafond"
                icon="plafond"
                label="Plafond"
                active={showCeiling}
                onPress={() => setShowCeiling(!showCeiling)}
              />,
            ]
          : []),
      ];

  return (
    <RangeeOutils
      styles={styles}
      anim={anim}
      largeur={largeur}
      reserve={62}
      bas={bas}
      dessus={dessus}
      elements={outils.filter((el): el is React.ReactElement => !!el)}
    />
  );
}

/**
 * LA RANGÉE DE LA VUE 3D.
 *
 * EN 3D, LA COLONNE COMMENCE EN HAUT. Elle partageait le décalage du plan
 * 2D, où elle passe SOUS la rangée du bouton d'édition. Mais la 3D n'a pas
 * de bouton d'édition : la colonne descendait donc d'une cellule pour
 * laisser la place à une rangée qui n'existe pas, et la dernière pastille
 * se retrouvait à mi-hauteur du modèle.
 *
 * MÊME GRILLE QU'EN 2D, en revanche. La 3D n'a pas de colonne d'actions :
 * la rangée prenait donc toute la largeur, et ses pastilles ne tombaient
 * pas aux mêmes endroits qu'en plan — on le voit immédiatement en
 * basculant d'une vue à l'autre. Elle réserve désormais la même place à
 * droite.
 */
export function Toolbar3D({
  anim,
  largeur,
  bas,
  showMeasures,
  setShowMeasures,
  showNorth,
  setShowNorth,
  showCeiling,
  setShowCeiling,
  showElecTags,
  setShowElecTags,
  colorsAvailable,
  focusIdx,
  setFocusIdx,
}: Cadre & {
  showMeasures: boolean;
  setShowMeasures: (f: (v: boolean) => boolean) => void;
  showNorth: boolean;
  setShowNorth: (f: (v: boolean) => boolean) => void;
  showCeiling: boolean;
  setShowCeiling: (v: boolean) => void;
  showElecTags: boolean;
  setShowElecTags: (f: (v: boolean) => boolean) => void;
  /** Le scan a relevé des couleurs : sinon la pastille n'allume rien. */
  colorsAvailable: boolean;
  /** Pièce isolée en coupe (-1 = tout le logement). */
  focusIdx: number;
  setFocusIdx: (f: (i: number) => number) => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const rooms = useScanStore((s) => s.rooms);
  const ceiling = useScanStore((s) => s.ceiling);
  const fixtures = useScanStore((s) => s.fixtures);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const setShowSurfaces = useScanStore((s) => s.setShowSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const setShowTextures = useScanStore((s) => s.setShowTextures);
  const solidWalls = useScanStore((s) => s.solidWalls);
  const toggleSolidWalls = useScanStore((s) => s.toggleSolidWalls);

  const outils = [
    <ToolPill
      key="ruler"
      icon="ruler"
      label="Cotes"
      active={showMeasures}
      onPress={() => setShowMeasures((v) => !v)}
    />,
    <ToolPill
      key="furniture"
      icon="furniture"
      label="Meubles"
      active={showFurniture}
      onPress={() => setShowFurniture(!showFurniture)}
    />,
    <ToolPill
      key="surface"
      icon="surface"
      label="Surfaces"
      active={showSurfaces}
      onPress={() => setShowSurfaces(!showSurfaces)}
    />,
    <ToolPill
      key="nord"
      icon="square"
      label="Nord"
      node={
        <Compass
          size={22}
          color={showNorth ? '#FFFFFF' : teinte.ink}
          strokeWidth={2}
        />
      }
      active={showNorth}
      onPress={() => setShowNorth((v) => !v)}
    />,
    /* Le plafond existe aussi en 3D : même calque, même bouton. */
    ceiling.length > 0 ? (
      <ToolPill
        key="plafond"
        icon="plafond"
        label="Plafond"
        active={showCeiling}
        onPress={() => setShowCeiling(!showCeiling)}
      />
    ) : null,
    /* Murs pleins ou écorché : l'écorché montre la pièce, les murs pleins
       montrent le bâti. Ni l'un ni l'autre n'a toujours raison — c'est un
       réglage, pas une trouvaille. */
    <ToolPill
      key="murs"
      icon="murs"
      label="Murs"
      active={solidWalls}
      onPress={toggleSolidWalls}
    />,
    /* Les repères électriques : indispensables pour poser, encombrants pour
       montrer. Une pièce équipée en porte une dizaine, et ils couvrent
       alors la moitié de la scène. */
    fixtures.length > 0 ? (
      <ToolPill
        key="reperes"
        icon="reperes"
        label="Repères"
        active={showElecTags}
        onPress={() => setShowElecTags((v) => !v)}
      />
    ) : null,
    colorsAvailable ? (
      <ToolPill
        key="couleurs"
        icon="colors"
        label="Couleurs"
        active={showTextures}
        onPress={() => setShowTextures(!showTextures)}
      />
    ) : null,
    rooms.length > 1 ? (
      <ToolPill
        key="pieces"
        icon="rooms"
        label="Pièces"
        active={focusIdx >= 0}
        onPress={() => setFocusIdx((i) => (i + 2 > rooms.length ? -1 : i + 1))}
      />
    ) : null,
  ];

  return (
    <RangeeOutils
      styles={styles}
      anim={anim}
      largeur={largeur}
      reserve={62}
      bas={bas}
      dessus={0}
      elements={outils.filter((el): el is React.ReactElement => !!el)}
    />
  );
}
