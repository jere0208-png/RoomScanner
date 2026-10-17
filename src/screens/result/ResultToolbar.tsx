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
import React, { useState } from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '../../theme';
import { RangeeOutils } from '../../components/RangeeOutils';
import { ToolPill } from '../../components/ToolPill';
import { CeilingIcon } from '../../components/CeilingIcon';
import { VignetteProduit } from '../../components/VignetteProduit';
import { photoDe } from '../../ui/produits';

import {
  CEILINGS,
  CEILING_KINDS,
  type CeilingKind,
} from '../../geometry/ceiling';
import { type FixtureKind } from '../../geometry/electrical';
import { type ActionData } from '../../components/Sheet';
import { useScanStore } from '../../store/scanStore';
import { useModeElec } from '../../store/usage';

/*
  LES OUTILS DE L'ÉLECTRICIEN, PAR LEUR CLÉ — voir `store/usage`.

  Sans le mode Électricité, la barre du plan ne propose ni d'appareil à poser,
  ni de plafond à équiper, ni de gaines à montrer ; celle du volume, ni la nuit
  (qui n'allume que des luminaires posés), ni le gabarit des volumes de salle
  d'eau, ni les repères d'appareils. Relevé du patron : « c'est trop axé
  électricité et pas très intuitif pour ceux qui n'y comprennent rien ».

  ON FILTRE PAR CLÉ, à la sortie, plutôt que d'envelopper chaque pastille
  d'une condition : une pastille ajoutée demain au milieu de la rangée n'a pas
  à savoir qu'il existe un mode, et la liste de ce qui est électrique se lit
  ici, en une ligne, au lieu d'être éparpillée dans deux cents lignes de JSX.
*/
const OUTILS_ELEC_PLAN = new Set(['plus', 'plafond', 'gaines', 'elec']);
const OUTILS_ELEC_VOLUME = new Set(['volumes', 'nuit', 'plafond', 'reperes']);

/* Revue « Bernard » : « Cotes » est un mot de métier ; le particulier
   cherche les « Dimensions ». Et l'électricien aussi, désormais — revue des
   « découvreurs » : « Cotes » ici, « Dimensions » là, pour le même calque,
   selon la vue ou le mode. Un mot, partout. */
const DIMENSIONS = 'Dimensions';

const sansElec = (
  outils: (React.ReactElement | null | false | undefined)[],
  cles: Set<string>,
  modeElec: boolean,
): React.ReactElement[] =>
  outils.filter(
    (el): el is React.ReactElement =>
      !!el && (modeElec || !cles.has(String(el.key))),
  );
import { CalquesSheet } from '../../components/CalquesSheet';
import { astuce } from '../../ui/astuce';
import { getStyles } from './styles';

/*
  RIEN À MONTRER, ET LA PASTILLE LE DIT — relevé du patron : « sur le plan
  2D, empêche l'activation des boutons Appareils, Meubles, etc. si aucun
  élément à afficher ; au clic, le bouton ne devient pas actif et affiche un
  petit message au-dessus. Pareil pour “Nord” » — puis « fais de même sur
  plan 3D ».

  Chaque calque qui peut être vide a sa phrase : ce qui manque, et où aller
  le chercher. `null` : il y a de quoi montrer, la pastille s'allume.
*/
const RIEN = {
  cotes: 'Aucun mur à coter : scannez ou dessinez une pièce.',
  meubles2D: 'Aucun meuble à afficher — passez en mode édition pour en ajouter.',
  meubles3D: 'Aucun meuble à afficher — ajoutez-en en mode édition, sur le plan.',
  appareils: 'Aucun appareil à afficher — passez en mode édition pour en poser.',
  surfaces: 'Aucune pièce refermée : pas de surface à afficher.',
  nuit: 'Aucun luminaire à allumer — posez-en en mode édition, sur le plan.',
  murs: 'Aucun mur à afficher : scannez ou dessinez une pièce.',
  plafond: 'Aucun appareil au plafond — posez-en en mode édition.',
  gaines: 'Posez le tableau sur le plan : l’app propose alors un tracé de gaines (pas vos câbles réels).',
  notes: 'Aucune note — écrivez-en en mode édition.',
  photos: 'Aucune photo — en édition, touchez un mur puis « Photo ».',
  couleurs: 'Aucune couleur relevée sur ce plan.',
  reperes: 'Aucun appareil posé — passez en mode édition, sur le plan.',
  volumes: 'Aucune baignoire ni douche relevée.',
  decorer: 'Aucune pièce refermée à décorer : scannez ou dessinez une pièce.',
} as const;

/*
  LES ACTIONS DE LA BARRE, LES MÊMES EN 2D ET EN 3D — revue des
  « découvreurs » : « + Meuble » vivait en tête de rangée, sous le mot
  « Afficher » (c'est une ACTION, il ne montre ni ne cache rien), et
  disparaissait en mode électricité ; « Décorer » changeait de place d'une
  vue à l'autre. Elles suivent désormais les calques, dans cet ordre, quelle
  que soit la vue : on les retrouve sous le même pouce.

  L'ICÔNE DE L'ACTION N'EST PAS CELLE DU CALQUE : le fauteuil, c'est le
  calque « Meubles » (les montrer, les cacher). L'action s'appelle
  « Meubler » — relevé du patron : « le “+ Meuble” me dérange » — et prend
  un autre meuble, la commode et sa lampe, avec le petit « + » au coin comme
  les poses de l'édition.
*/
function actionsDeLaBarre({
  onAjouterMeuble,
  onDecorer,
  decorerVide,
  afficher,
  ouvrirAfficher,
}: {
  onAjouterMeuble?: () => void;
  onDecorer?: () => void;
  /** Rien à décorer : la pastille reste à sa place, grisée, avec sa phrase. */
  decorerVide: string | null;
  afficher: boolean;
  ouvrirAfficher: () => void;
}): React.ReactElement[] {
  const rien = () => {};
  return [
    <ToolPill
      key="ajoutMeuble"
      icon="meubler"
      label="Meubler"
      active={false}
      ajout
      vide={onAjouterMeuble ? null : 'Ouvrez le plan pour ajouter un meuble.'}
      onPress={onAjouterMeuble ?? rien}
    />,
    <ToolPill
      key="decorer"
      icon="rouleau"
      label="Décorer"
      active={false}
      vide={onDecorer ? decorerVide : RIEN.decorer}
      onPress={onDecorer ?? rien}
    />,
    <ToolPill
      key="afficher"
      icon="points"
      label="Autres"
      active={afficher}
      onPress={ouvrirAfficher}
    />,
  ];
}

/** Ce qui s'allume la nuit : une applique au mur, un luminaire au plafond. */
const LUMINAIRES_AU_PLAFOND = new Set(['dcl', 'spot', 'applique', 'ventilateur']);

/** De quoi juger ce que chaque calque a à montrer — lu une fois par rangée. */
function useContenus() {
  const murs = useScanStore((s) => s.walls.length);
  const meubles = useScanStore((s) => s.objects.length);
  const appareils = useScanStore((s) => s.fixtures.length);
  const pieces = useScanStore((s) => s.rooms.length);
  const nord = useScanStore((s) => s.north !== null && s.north !== undefined);
  const notes = useScanStore((s) => s.notes.length);
  const photos = useScanStore((s) => s.photos.length);
  const plafond = useScanStore((s) => s.ceiling.length);
  const luminaires = useScanStore(
    (s) =>
      s.fixtures.some((f) => f.kind === 'applique') ||
      s.ceiling.some((cl) => LUMINAIRES_AU_PLAFOND.has(cl.kind)),
  );
  return { murs, meubles, appareils, pieces, nord, luminaires, notes, photos, plafond };
}

/** Ce que les deux rangées partagent : la place qu'elles occupent. */
type Cadre = {
  anim: Animated.Value;
  /** Largeur de la carte du plan. */
  largeur: number;
  /** Ligne de fond : au-dessus de l'indicateur d'accueil. */
  bas: number;
  /**
   * La hauteur de la pile de calques en trop, rendue à l'écran : c'est elle
   * qui dit où poser « Enregistrer », au-dessus de tout le reste.
   */
  onSuite?: (hauteur: number) => void;
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
  onSuite,
  dessus,
  edition,
  pendingKind,
  pendingCeiling,
  pendingNote,
  onNote,
  showMeasures,
  setShowMeasures,
  showRoutes,
  showFixtures,
  setShowFixtures,
  setShowRoutes,
  hasRoutes,
  showCeiling,
  setShowCeiling,
  onFixture,
  onFurniture,
  onFurnitureOff,
  seulGeste,
  setMenu,
  setPendingCeiling,
  setPendingSpots,
  onDecorer,
  onAjouterMeuble,
}: Cadre & {
  /** Ouvre « Décorer » (la vue passe en 3D). */
  onDecorer?: () => void;
  /** Passe en édition et ouvre le catalogue des meubles. */
  onAjouterMeuble?: () => void;
  /** Hauteur à franchir pour poser le trop-plein au-dessus des actions. */
  dessus: number;
  /** Le jeu de pastilles affiché : il RETARDE sur le mode d'édition. */
  edition: boolean;
  pendingKind: FixtureKind | null;
  pendingCeiling: CeilingKind | null;
  /** On attend le point où poser le mot : la pastille reste allumée. */
  pendingNote: boolean;
  onNote: () => void;
  showMeasures: boolean;
  setShowMeasures: (f: (v: boolean) => boolean) => void;
  showRoutes: boolean;
  /** L'appareillage : un calque, qu'on éteint pour voir le plan nu. */
  showFixtures: boolean;
  setShowFixtures: (f: (v: boolean) => boolean) => void;
  setShowRoutes: (f: (v: boolean) => boolean) => void;
  /** Un tableau est posé : on sait d'où part le câble. */
  hasRoutes: boolean;
  /*
    PLUS D'OPTION « NORD » — relevé du patron : « enlève l'option Nord,
    affiche-la que si elle a été calculée lors du scan, pour l'export PDF ».
    Le dossier PDF porte la rose des vents quand le scan a relevé le nord ;
    l'application ne la propose plus.
  */
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
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const setShowSurfaces = useScanStore((s) => s.setShowSurfaces);
  const straightenPlan = useScanStore((s) => s.straightenPlan);
  const modeElec = useModeElec();
  const contenu = useContenus();
  const showNotes = useScanStore((s) => s.showNotes);
  const setShowNotes = useScanStore((s) => s.setShowNotes);
  const showPhotos = useScanStore((s) => s.showPhotos);
  const setShowPhotos = useScanStore((s) => s.setShowPhotos);
  const showGrille = useScanStore((s) => s.showGrille);
  const setShowGrille = useScanStore((s) => s.setShowGrille);
  const showOpeningColors = useScanStore((s) => s.showOpeningColors);
  const setShowOpeningColors = useScanStore((s) => s.setShowOpeningColors);
  const showReperesBaies = useScanStore((s) => s.showReperesBaies);
  const setShowReperesBaies = useScanStore((s) => s.setShowReperesBaies);
  const nbBaies = useScanStore((s) => s.openings.length);
  /** Le menu « Afficher » du plan : tout ce que la rangée ne garde pas. */
  const [afficher, setAfficher] = useState(false);
  /*
    « REDRESSER » DIT CE QU'IL A FAIT — revue « Léa » : il remettait tout le
    plan d'équerre sans un mot ; elle croyait qu'il redressait un meuble, ou
    qu'il ne faisait rien. Et il s'appelle « Aligner » (revue des
    « découvreurs » : « Redresser » ne disait pas QUOI) — il aligne les murs
    presque droits, les remet d'équerre.
  */
  const redresser = () => {
    const avant = new Map(useScanStore.getState().walls.map((w) => [w.id, w]));
    straightenPlan();
    const bouge = useScanStore
      .getState()
      .walls.some((w) => {
        const v = avant.get(w.id);
        return !v || Math.hypot(w.a.x - v.a.x, w.a.z - v.a.z) > 1e-3 || Math.hypot(w.b.x - v.b.x, w.b.z - v.b.z) > 1e-3;
      });
    if (bouge) {
      astuce('Murs alignés et remis d’équerre.', { action: { label: 'Annuler', faire: () => useScanStore.getState().undo() } });
    } else {
      astuce('Le plan était déjà d’équerre.');
    }
  };

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
        /*
          ET IL SE CHOISIT EN PHOTOS, COMME LES MURS — relevé du patron :
          « trouve des images pour celles qui manquent, comme pour le
          matériel de devis ». Le catalogue des murs montrait déjà le
          produit ; le plafond restait en pictogrammes, faute de photos
          pour le spot, la DCL, le plafonnier et le ventilateur. Elles
          existent maintenant : on choisit ce qu'on posera, tel qu'on
          l'achètera. La LIGNE de spots garde son pictogramme — c'est un
          geste, pas un produit.
        */
        /*
          SANS PHOTO, SON DESSIN — pas son nom écrit dans une pastille.
          Le ruban LED et le spot au sol n'ont pas de photo : leur vignette
          écrivait « Ruban LED » en petit au milieu des produits. Ils
          prennent leur pictogramme, comme la ligne de spots.
        */
        ...CEILING_KINDS.map((k) => ({
          label: CEILINGS[k].label,
          node: photoDe(`plafond-${k}`) ? (
            <VignetteProduit code={`plafond-${k}`} libelle={CEILINGS[k].label} taille={36} />
          ) : (
            <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <CeilingIcon kind={k} size={30} />
            </View>
          ),
          onPress: () => setPendingCeiling(k),
        })),
      ],
    });
  };

  const outils = edition
    ? [
        /*
          « REDRESSER » OUVRE LA RANGÉE — relevé du patron : « mets le bouton
          Redresser tout à gauche des autres boutons ».

          Il était deuxième, entre deux poses. Or il ne pose rien : il agit
          sur TOUT le plan d'un coup, et c'est le geste qu'on fait EN
          PREMIER en entrant en édition — on remet le relevé d'équerre, puis
          on place. Les quatre autres ajoutent un objet ; celui-ci corrige
          le fond sur lequel on va les poser.
        */
        <ToolPill
          key="square"
          icon="square"
          label="Aligner"
          active={false}
          onPress={redresser}
        />,
        /*
          LE MEUBLE PASSE DEVANT L'APPAREIL — relevé du patron : « l'app
          n'est pas destinée de base qu'aux électriciens (...) comment faire
          comprendre à l'utilisateur que ce n'est pas que pour les élec mais
          aussi pour modéliser son appartement et placer des meubles pour se
          projeter ».

          La rangée d'édition se lisait « Redresser · Appareil · Meuble » :
          le premier geste de pose qu'on proposait était électrique. Or le
          meuble est ce que TOUT LE MONDE pose — l'électricien y compris,
          qui a besoin du plan de travail et du lit avant de savoir où va la
          prise. L'appareil ne perd que son rang : il reste le second, celui
          qu'on trouve sans chercher.
        */
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
          /*
            « MEUBLE », AU SINGULIER — relevé du patron.

            Le mot dit le SUJET, comme ses voisins de la rangée ; ce qu'on
            en fait dépend du mode. Et en édition, on n'en pose qu'UN : le
            bouton ouvre le catalogue pour choisir une pièce, exactement
            comme « Appareil », « Plafond » et « Note » à côté de lui — tous
            au singulier. Le pluriel appartient au CALQUE, hors édition, qui
            montre ou cache tout le mobilier d'un coup.
          */
          label="Meuble"
          active={false}
          ajout
          onPress={onFurniture}
        />,
        <ToolPill
          key="plus"
          icon="appareil"
          label="Appareil"
          active={!!pendingKind}
          ajout
          onPress={onFixture}
        />,
        // Le plafond s'équipe comme les murs : on choisit l'appareil, puis
        // on touche la pièce qui le reçoit.
        <ToolPill
          key="plafond"
          icon="plafond"
          label="Plafond"
          active={!!pendingCeiling}
          ajout
          onPress={menuDuPlafond}
        />,
        /*
          LE MOT QU'ON ÉCRIVAIT AU CRAYON DANS LA MARGE.

          « Colonne montante ici », « attente TV à confirmer avec le
          client », « gaine à reprendre ». Ces phrases sont sur tous les
          plans papier du métier et n'avaient nulle part où aller : elles
          finissaient dans le nom du plan — « T3 Pasteur (vérifier
          colonne) » — ou dans la tête de celui qui a fait le relevé, qui
          n'est pas toujours celui qui pose.

          Elle est EN ÉDITION : écrire sur le plan, c'est le modifier.
        */
        <ToolPill
          key="note"
          icon="note"
          label="Note"
          active={pendingNote}
          ajout
          onPress={onNote}
        />,
      ]
    : [
        /*
          LA RANGÉE NE GARDE QUE CE QU'ON ALLUME TOUS LES JOURS — relevé du
          patron : « affiche hors du “…” les boutons les plus utiles, comme
          les meubles, les cotes, les surfaces ». Le reste — grille, notes,
          photos, gaines, plafond, couleurs des ouvertures — vit dans le
          menu « Autres », au bout de la rangée.

          UNE BARRE STABLE — revue des « découvreurs » : les pastilles
          changeaient de place, de mot et d'icône selon la vue et le mode.
          L'ordre est désormais le même en 2D et en 3D (`actionsDeLaBarre`) :
          les calques d'abord, puis les deux ACTIONS (« Meubler »,
          « Décorer »), puis « Autres ». Ce qui n'a rien à faire est grisé,
          avec sa phrase, plutôt que retiré : la pastille garde sa place.
        */
        <ToolPill
          key="ruler"
          icon="ruler"
          label={DIMENSIONS}
          active={showMeasures}
          vide={contenu.murs === 0 ? RIEN.cotes : null}
          onPress={() => setShowMeasures((v) => !v)}
        />,
        <ToolPill
          key="furniture"
          icon="furniture"
          label="Meubles"
          active={showFurniture}
          vide={contenu.meubles === 0 ? RIEN.meubles2D : null}
          onPress={() => {
            // Éteindre le calque éteint tout ce qui l'accompagne : les
            // poignées d'un meuble invisible restaient à l'écran,
            // orphelines.
            if (showFurniture) onFurnitureOff();
            setShowFurniture(!showFurniture);
          }}
        />,
        <ToolPill
          key="surface"
          icon="surface"
          label="Surfaces"
          active={showSurfaces}
          vide={contenu.pieces === 0 ? RIEN.surfaces : null}
          onPress={() => setShowSurfaces(!showSurfaces)}
        />,
        // L'appareillage s'allume au départ, mais il se coupe — sur un
        // logement équipé, ses symboles couvrent la maçonnerie qu'on est
        // venu regarder. La PRISE, comme le bouton « Appareil » d'Ajouter —
        // relevé du patron : l'éclair disait « électricité », pas « ce que
        // j'ai posé ».
        <ToolPill
          key="elec"
          icon="appareil"
          label="Appareils"
          active={showFixtures}
          vide={contenu.appareils === 0 ? RIEN.appareils : null}
          onPress={() => setShowFixtures((v) => !v)}
        />,
        ...actionsDeLaBarre({
          onAjouterMeuble,
          onDecorer,
          decorerVide: contenu.pieces === 0 ? RIEN.decorer : null,
          afficher,
          ouvrirAfficher: () => setAfficher(true),
        }),
      ];

  return (
    <>
    <RangeeOutils
      onSuite={onSuite}
      styles={styles}
      anim={anim}
      largeur={largeur}
      reserve={62}
      bas={bas}
      dessus={dessus}
      elements={sansElec(outils, OUTILS_ELEC_PLAN, modeElec)}
    />
    <CalquesSheet
      visible={afficher}
      onClose={() => setAfficher(false)}
      titre="Afficher sur le plan"
      sousTitre="Ce que le plan montre — rien n'est supprimé."
      /*
        « AUTRES » NE RÉPÈTE PAS LA RANGÉE — revue des « découvreurs » : les
        dimensions, les meubles, les surfaces et les appareils s'y
        rallumaient une seconde fois, à côté de leurs pastilles. Le menu ne
        porte plus que ce que la rangée n'a pas.
      */
      sections={[
        {
          titre: 'Électricité',
          lignes: modeElec
            ? [
                { cle: 'plafond', icone: 'plafond' as const, libelle: 'Plafond', aide: 'Points lumineux, spots, détecteurs, VMC', actif: showCeiling, vide: contenu.plafond === 0 ? RIEN.plafond : null, onBascule: () => setShowCeiling(!showCeiling) },
                { cle: 'gaines', icone: 'gaines' as const, libelle: 'Gaines (tracé proposé)', aide: 'Un chemin calculé pour une installation neuve — pas vos câbles réels', actif: showRoutes, vide: hasRoutes ? null : RIEN.gaines, onBascule: () => setShowRoutes((v) => !v) },
              ]
            : [],
        },
        {
          titre: 'Repères',
          lignes: [
            { cle: 'grille', icone: 'grille', libelle: 'Grille', aide: 'Un trait tous les 50 cm, pour estimer d’un coup d’œil', actif: showGrille, vide: contenu.murs === 0 ? RIEN.murs : null, onBascule: () => setShowGrille(!showGrille) },
            { cle: 'ouvertures', icone: 'ouvertures', libelle: 'Portes et fenêtres en couleur', aide: 'Les portes en ambre, les fenêtres en bleu', actif: showOpeningColors, onBascule: () => setShowOpeningColors(!showOpeningColors) },
            // Les repères du carnet des menuiseries du PDF (dossier d'architecte du patron).
            { cle: 'reperesBaies', icone: 'etiquette', libelle: 'Repères des menuiseries', aide: 'P1, F1, B1… : ceux du carnet des menuiseries du PDF', actif: showReperesBaies, vide: nbBaies === 0 ? 'Aucune porte ni fenêtre relevée.' : null, onBascule: () => setShowReperesBaies(!showReperesBaies) },
            { cle: 'notes', icone: 'note', libelle: 'Notes', aide: 'Les mots écrits sur le plan', actif: showNotes, vide: contenu.notes === 0 ? RIEN.notes : null, onBascule: () => setShowNotes(!showNotes) },
            { cle: 'photos', icone: 'image', libelle: 'Photos', aide: 'Les repères des photos prises sur place', actif: showPhotos, vide: contenu.photos === 0 ? RIEN.photos : null, onBascule: () => setShowPhotos(!showPhotos) },
          ],
        },
      ]}
    />
    </>
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
  onSuite,
  anim,
  largeur,
  bas,
  showMeasures,
  setShowMeasures,
  showCeiling,
  setShowCeiling,
  showVolumes,
  setShowVolumes,
  nuit,
  setNuit,
  zonesHumides,
  showElecTags,
  setShowElecTags,
  colorsAvailable,
  focusIdx,
  setFocusIdx,
  onDecorer,
  onAjouterMeuble,
}: Cadre & {
  /** Revient au plan, en édition, catalogue ouvert : on pose un meuble en 2D. */
  onAjouterMeuble?: () => void;
  /**
   * DÉCORER — relevé du patron : « je ne vois pas la possibilité de changer
   * la couleur des meubles ou du sol ». C'est ici, sur la maquette, qu'on
   * voit ce qu'on change : le bouton y vit.
   */
  onDecorer?: () => void;
  showMeasures: boolean;
  setShowMeasures: (f: (v: boolean) => boolean) => void;
  /*
    PLUS D'OPTION « NORD » — relevé du patron : « enlève l'option Nord,
    affiche-la que si elle a été calculée lors du scan, pour l'export PDF ».
    Le dossier PDF porte la rose des vents quand le scan a relevé le nord ;
    l'application ne la propose plus.
  */
  showCeiling: boolean;
  setShowCeiling: (v: boolean) => void;
  /**
   * LA TOMBÉE DU JOUR — l'essai de l'installation, pour de vrai.
   *
   * On éteint la maquette, et toucher un interrupteur allume ce qu'il
   * commande. Un état de VISITE : le relevé n'en sait rien, et refermer la
   * maquette rallume le jour.
   */
  nuit: boolean;
  setNuit: (f: (v: boolean) => boolean) => void;
  /**
   * LE GABARIT DES VOLUMES DE SALLE D'EAU — et de quoi savoir s'il existe.
   *
   * Il vit sur la barre de la 3D parce que c'est la maquette qui le dessine :
   * un calque proposé là où rien ne s'allumerait serait un bouton en panne.
   * Il a d'abord été posé sur la barre du PLAN, par erreur — `tsc` l'a dit
   * aussitôt, et c'est exactement pour ça qu'on l'écoute.
   */
  showVolumes: boolean;
  setShowVolumes: (v: boolean) => void;
  zonesHumides: number;
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
  const fixtures = useScanStore((s) => s.fixtures);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  // La maquette a SES surfaces, éteintes à l'ouverture (voir `show3DSurfaces`).
  const show3DSurfaces = useScanStore((s) => s.show3DSurfaces);
  const setShow3DSurfaces = useScanStore((s) => s.setShow3DSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const setShowTextures = useScanStore((s) => s.setShowTextures);
  const solidWalls = useScanStore((s) => s.solidWalls);
  const toggleSolidWalls = useScanStore((s) => s.toggleSolidWalls);
  const modeElec = useModeElec();
  // Même règle qu'en plan : un calque vide ne s'allume pas, une bulle dit pourquoi.
  const contenu = useContenus();
  const showSol = useScanStore((s) => s.showSol);
  const setShowSol = useScanStore((s) => s.setShowSol);
  const showOpeningColors = useScanStore((s) => s.showOpeningColors);
  const setShowOpeningColors = useScanStore((s) => s.setShowOpeningColors);
  /** Le menu « Afficher » de la maquette, au bout de la rangée. */
  const [afficher, setAfficher] = useState(false);

  /*
    LA RANGÉE DE LA MAQUETTE — relevé du patron : « “Volumes” est peu
    intuitif, ça peut être le volume d'une pièce ; et peu de gens demandent
    cela, surtout hors élec. Rajoute un bouton “…” en bas à droite à la place
    de Pièces ». Le sol, les murs, la nuit, le plafond, les couleurs
    relevées, les volumes de salle d'eau et la pièce isolée passent au menu
    « Autres ».

    LA MÊME BARRE QU'EN PLAN — revue des « découvreurs » : en 3D, « Meubles »
    passait devant « Dimensions », « Surfaces » changeait d'icône (une
    étiquette ici, les calques là), « Couleurs » et « Repères » allaient et
    venaient selon le relevé. Même ordre, mêmes mots, mêmes icônes que le plan
    2D ; les repères électriques tiennent la place des appareils, grisés s'il
    n'y a rien à étiqueter.
  */
  const outils = [
    <ToolPill
      key="ruler"
      icon="ruler"
      label={DIMENSIONS}
      active={showMeasures}
      vide={contenu.murs === 0 ? RIEN.cotes : null}
      onPress={() => setShowMeasures((v) => !v)}
    />,
    <ToolPill
      key="furniture"
      icon="furniture"
      label="Meubles"
      active={showFurniture}
      vide={contenu.meubles === 0 ? RIEN.meubles3D : null}
      onPress={() => setShowFurniture(!showFurniture)}
    />,
    /* « Surfaces » ne pose que le nom et les m² de chaque pièce : le sol a
       son propre calque, dans le menu. */
    <ToolPill
      key="surface"
      icon="surface"
      label="Surfaces"
      active={show3DSurfaces}
      vide={contenu.pieces === 0 ? RIEN.surfaces : null}
      onPress={() => setShow3DSurfaces(!show3DSurfaces)}
    />,
    /* Les repères électriques : indispensables pour poser, encombrants pour
       montrer. Une pièce équipée en porte une dizaine. */
    <ToolPill
      key="reperes"
      icon="reperes"
      label="Repères"
      active={showElecTags}
      vide={fixtures.length === 0 ? RIEN.reperes : null}
      onPress={() => setShowElecTags((v) => !v)}
    />,
    ...actionsDeLaBarre({
      onAjouterMeuble,
      onDecorer,
      decorerVide: null,
      afficher,
      ouvrirAfficher: () => setAfficher(true),
    }),
  ];

  return (
    <>
    <RangeeOutils
      styles={styles}
      anim={anim}
      largeur={largeur}
      reserve={62}
      bas={bas}
      dessus={0}
      onSuite={onSuite}
      elements={sansElec(outils, OUTILS_ELEC_VOLUME, modeElec)}
    />
    <CalquesSheet
      visible={afficher}
      onClose={() => setAfficher(false)}
      titre="Afficher sur la maquette"
      sousTitre="Ce que la 3D montre — rien n'est supprimé."
      // La pièce isolée n'a de sens qu'à partir de deux pièces.
      vue={rooms.length < 2 ? null : {
        titre: 'Pièce isolée',
        aide: 'La maquette se réduit à la pièce choisie, en coupe.',
        options: [{ cle: '-1', libelle: 'Tout le logement' }, ...rooms.map((r, i) => ({ cle: String(i), libelle: r.name || `Pièce ${i + 1}` }))],
        actuel: String(focusIdx),
        onChoix: (cle) => setFocusIdx(() => Number(cle)),
      }}
      // « Autres » ne répète pas la rangée : voir le plan 2D.
      sections={[
        {
          titre: 'Le logement',
          lignes: [
            { cle: 'sol', icone: 'grille', libelle: 'Sol', aide: 'Le sol de chaque pièce, ses lattes ou son image relevée', actif: showSol, vide: contenu.pieces === 0 ? RIEN.surfaces : null, onBascule: () => setShowSol(!showSol) },
            { cle: 'murs', icone: 'murs', libelle: 'Murs pleins', aide: 'Éteint, les murs qui vous font face s’effacent', actif: solidWalls, vide: contenu.murs === 0 ? RIEN.murs : null, onBascule: toggleSolidWalls },
            ...(modeElec
              ? [{ cle: 'plafond', icone: 'plafond' as const, libelle: 'Plafond', aide: 'Points lumineux, spots, détecteurs, VMC', actif: showCeiling, vide: contenu.plafond === 0 ? RIEN.plafond : null, onBascule: () => setShowCeiling(!showCeiling) }]
              : []),
          ],
        },
        {
          titre: 'Ambiance',
          lignes: [
            { cle: 'couleurs', icone: 'colors', libelle: 'Couleurs relevées', aide: 'La couleur de chaque mur et du sol, relevée au scan', actif: showTextures, vide: colorsAvailable ? null : RIEN.couleurs, onBascule: () => setShowTextures(!showTextures) },
            { cle: 'ouvertures', icone: 'ouvertures', libelle: 'Portes et fenêtres en couleur', aide: 'Les portes en ambre, les fenêtres en bleu', actif: showOpeningColors, onBascule: () => setShowOpeningColors(!showOpeningColors) },
            ...(modeElec
              ? [{ cle: 'nuit', icone: 'lune' as const, libelle: 'Nuit', aide: 'La maquette s’éteint : touchez un interrupteur', actif: nuit, vide: contenu.luminaires ? null : RIEN.nuit, onBascule: () => setNuit((v) => !v) }]
              : []),
          ],
        },
        {
          titre: 'Électricité',
          lignes: modeElec
            ? [
                { cle: 'volumes', icone: 'goutte', libelle: 'Volumes de salle d’eau', aide: 'Les volumes 0, 1 et 2 autour de la baignoire et de la douche', actif: showVolumes, vide: zonesHumides > 0 ? null : RIEN.volumes, onBascule: () => setShowVolumes(!showVolumes) },
              ]
            : [],
        },
      ]}
    />
    </>
  );
}
