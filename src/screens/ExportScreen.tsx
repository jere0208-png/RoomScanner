import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import {
  Animated,
  InteractionManager,
  Easing,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { RoomScan } from 'react-native-room-scan';
import {
  ombreAction,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { DEFAULT_VIEW3D, Iso3DView, type View3DParams } from '../components/Iso3DView';
import { buildScanPdf, pdfFilename, sommaireDuDossier, toBase64 } from '../export/pdf';
import { ApercuDuDossier } from '../components/ApercuDuDossier';
import { haptic } from '../ui/haptic';
import { hasCapturedColors } from '../geometry/appearance';
import {
  filtrerAuNiveau,
  niveauxPresents,
  nomDuNiveau,
  roomParts,
  type Pt,
} from '../geometry/floorplan';
import {
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../geometry/nfc15100';
import { fixtureMarks, multiWire, schemaRows } from '../geometry/schema';
import { useModeElec } from '../store/usage';
import { useReglagesTravaux } from '../store/reglagesTravaux';
import { entrepriseAImprimer, useEntreprise } from '../store/entreprise';
import { piecesRetenues, travauxDesPieces } from '../geometry/travaux';
import type { Fixture } from '../geometry/electrical';
import { planRoutes } from '../geometry/elecplan';
import { floorsOf, useScanStore } from '../store/scanStore';
import { useAccountStore, useDossierNet } from '../store/accountStore';
import { deviceNames } from '../geometry/naming';
import { PromptSheet, type PromptData } from '../components/Sheet';
import type { CeilingFixture } from '../geometry/ceiling';
import { alerte } from '../ui/alerte';
import { panne as expliquer } from '../ui/panne';


/**
 * LES ANGLES PROPOSÉS, dans l'ordre où on les ajoute.
 *
 * Une perspective de plus doit montrer AUTRE CHOSE : ajouter deux fois le
 * même trois-quarts ferait deux pages identiques. Les angles tournent donc
 * autour du logement, et l'inclinaison alterne entre le regard debout et la
 * vue plongeante.
 */
const ANGLES: View3DParams[] = [
  { ...DEFAULT_VIEW3D },
  { ...DEFAULT_VIEW3D, theta: 148, tilt: 42 },
  { ...DEFAULT_VIEW3D, theta: 58, tilt: 68 },
  { ...DEFAULT_VIEW3D, theta: -122, tilt: 36 },
];
/** Au-delà, le dossier s'épaissit sans rien montrer de neuf. */
const MAX_VUES = 4;
const angleSuivant = (n: number): View3DParams => ({
  ...(ANGLES[n % ANGLES.length] ?? ANGLES[0]),
  theta: (ANGLES[n % ANGLES.length] ?? ANGLES[0]).theta + Math.floor(n / ANGLES.length) * 23,
});

/**
 * L'APERÇU DU PLAN — une image, pas un cadrage.
 *
 * On pouvait le déplacer et le zoomer au doigt, et ce cadrage partait dans
 * le PDF. C'est une liberté qui ne produit que des documents ratés : un plan
 * coupé, décentré, à une échelle qui n'en est pas une. Un plan d'exécution
 * se lit DROIT, entier, avec toutes ses cotes — le cadrage est l'affaire du
 * document, qui sait la place dont il dispose, pas celle du doigt sur un
 * écran de six pouces.
 *
 * Le geste est donc rendu au défilement : glisser sur l'aperçu fait défiler
 * la page, comme partout ailleurs. C'est ce que la main essaie de faire
 * neuf fois sur dix.
 */
function PlanPreview({
  cotes,
  routes,
  ceiling,
}: {
  cotes: boolean;
  routes?: { id: string; path: Pt[] }[];
  ceiling?: CeilingFixture[];
}) {
  return (
    <View
      accessibilityLabel="Aperçu du plan"
      style={planStyles.box}
      pointerEvents="none">
      <FloorplanEditor
        showMeasures={cotes}
        cableRoutes={routes}
        ceiling={ceiling}
        showCeiling={!!ceiling}
        // Les cardinaux ne s'affichent QUE sur le plan 2D du PDF lui-même
        // (relevé du patron) : l'aperçu reste dégagé, la rose est de série
        // dans le document.
        showNorth={false}
        editable={false}
        selectedWallId={null}
        onSelectWall={() => {}}
      />
    </View>
  );
}

const planStyles = StyleSheet.create({
  box: { height: 250, borderRadius: 14, overflow: 'hidden' },
  inner: { flex: 1 },
});

/**
 * LES ÉLÉVATIONS QUE LE DOSSIER IMPRIME — deux cases franches.
 *
 * « Élévations » = TOUS les murs, d'office ; « Cotes Élec » = les murs
 * ÉQUIPÉS d'au moins un appareil. La case « Tous les murs » a vécu —
 * relevé du patron : deux cases qui se conditionnaient pour dire trois
 * états, c'était une de trop. L'absorption reste structurelle : cocher
 * les deux n'imprime qu'une seule série, la plus large.
 */
export function feuillesElevations(
  elevations: boolean,
  cotesElec: boolean,
): { elevations: boolean; toutesElevations: boolean } {
  return {
    elevations: elevations || cotesElec,
    toutesElevations: elevations,
  };
}

/* Des listes vides STABLES : un `[]` écrit dans le rendu serait neuf à chaque
   image, et referait le dossier entier à chaque bascule d'option. */
const AUCUN_APPAREIL: Fixture[] = [];
const AUCUN_PLAFOND: CeilingFixture[] = [];

export function ExportScreen() {
  const setScreen = useScanStore((s) => s.setScreen);
  const scanName = useScanStore((s) => s.scanName);
  const tousLesMurs = useScanStore((s) => s.walls);
  const toutesLesOuvertures = useScanStore((s) => s.openings);
  const tousLesMeubles = useScanStore((s) => s.objects);
  /*
    LE MODE ÉLECTRICITÉ — voir `store/usage`. Sans lui, le dossier ne porte ni
    appareils, ni plafond équipé, ni gaines, ni schémas : on lui donne des
    listes vides, et tout ce qui s'en déduit — tirages, repères, cotes
    d'appareils, schémas — se tait de soi-même. Le relevé, lui, les garde.
  */
  const modeElec = useModeElec();
  const appareillageStocke = useScanStore((s) => s.fixtures);
  const toutLAppareillage = modeElec ? appareillageStocke : AUCUN_APPAREIL;
  const showOpeningColors = useScanStore((s) => s.showOpeningColors);
  const setShowOpeningColors = useScanStore((s) => s.setShowOpeningColors);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const setShowSurfaces = useScanStore((s) => s.setShowSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const setShowTextures = useScanStore((s) => s.setShowTextures);
  const toutesLesPieces = useScanStore((s) => s.rooms);
  const c = useTheme();

/**
 * Icônes des options d'export — le jeu « SOLAR BOLD », le même que la
 * rangée d'outils (refonte du patron ; généré dans src/ui/solaires.ts).
 *
 * Un mot sous chacune : l'icône seule se devine mal — « surfaces » et
 * « couleurs » se ressemblent trop —, et le mot seul reprend la place qu'on
 * cherchait justement à gagner.
 */
const EXPORT_ICONS = {
  vues3d: SOLAIRES.vues3d,
  metre: SOLAIRES.metre,
  achats: SOLAIRES.panier,
  plafond: SOLAIRES.plafond,
  cotes2d: SOLAIRES.cotes2d,
  cotes3d: SOLAIRES.cotes3d,
  meubles: SOLAIRES.meubles,
  surface: SOLAIRES.surface,
  ouvertures: SOLAIRES.ouvertures,
  couleurs: SOLAIRES.couleurs,
  gaines: SOLAIRES.gaines,
  elevations: SOLAIRES.elevations,
  cotesElec: SOLAIRES.elec,
  schema: SOLAIRES.schema,
} as const;

const styles = getStyles(c);

  const [include3D, setInclude3D] = useState(true);
  /**
   * LA PAGE DE GARDE — correctif de l'audit : le dossier s'ouvrait sur le
   * plan coté, sans dire de quoi il s'agissait. Cochée de base : c'est elle
   * qu'on voit en premier, chez l'acheteur comme chez le client.
   */
  const [garde, setGarde] = useState(true);
  /**
   * Les repères d'appareillage sur les perspectives : ÉTEINTS AU DÉPART —
   * relevé du patron : « dans la page export, le bloc vue 3D, enlève les
   * repères sur le modèle présenté ». Une perspective se montre au client ;
   * la pastille « Repères » les rallume pour le chantier, dans l'aperçu comme
   * sur la feuille.
   */
  const [reperes3D, setReperes3D] = useState(false);
  const [includeMetre, setIncludeMetre] = useState(true);
  /*
    « CE QU'IL FAUT ACHETER » DANS LE DOSSIER — relevé du patron, point 3 de
    la réflexion « grand public ». Coché d'office pour le particulier, qui
    refait son logement ; pas pour l'électricien, dont le client ne lui a
    pas demandé de compter les pots de peinture.
  */
  const [includeAchats, setIncludeAchats] = useState(!modeElec);
  const reglages = useReglagesTravaux();
  useEffect(() => {
    if (!reglages.charge) reglages.charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
    L'ENTREPRISE DE L'ARTISAN, EN TÊTE DE CHAQUE FEUILLE — correctif de
    l'audit. Seulement pour l'électricien : le particulier relève son
    propre logement.
  */
  const entreprise = useEntreprise();
  useEffect(() => {
    if (!entreprise.charge) entreprise.charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entrepriseDuDossier = modeElec ? entrepriseAImprimer(entreprise) : null;
  const [measures2D, setMeasures2D] = useState(true);
  /**
   * Plan des gaines : le tracé du tableau à chaque appareil, celui-là même
   * dont le devis donne les longueurs. Décoché par défaut — un plan
   * d'architecte n'a pas à porter le tirage —, mais à un interrupteur près
   * quand c'est l'électricien qui imprime.
   */
  const [gaines, setGaines] = useState(false);
  const plafondStocke = useScanStore((s) => s.ceiling);
  const toutLePlafond = modeElec ? plafondStocke : AUCUN_PLAFOND;
  const toutesLesNotes = useScanStore((s) => s.notes);
  /** La feuille d'implantation du plafond, avec ses liens de commande. */
  const [plafond, setPlafond] = useState(false);
  const toutesLesPhotos = useScanStore((s) => s.photos);
  const toutesLesMesures = useScanStore((s) => s.mesures);
  /*
    LE DOSSIER SORT L'ÉTAGE QU'ON REGARDE.

    Un PDF qui empilerait les niveaux donnerait un plan où les murs du haut
    traversent les pièces du bas, un métré qui compte deux fois, et un
    schéma où l'appareillage des deux étages se mêle sur le même tableau.
    On exporte donc ce que l'écran montre — et le nom du fichier dit
    lequel, pour qu'on ne se retrouve pas avec deux « Chantier Dupont.pdf »
    dont on ne sait plus lequel est l'étage.
  */
  const niveauCourant = useScanStore((s) => s.niveauCourant);
  const niveaux = useMemo(
    () => niveauxPresents(tousLesMurs, toutesLesPieces),
    [tousLesMurs, toutesLesPieces],
  );
  const { walls, openings, rooms, fixtures, photos, objects, ceiling, notes } =
    useMemo(
      () =>
        filtrerAuNiveau(
          {
            walls: tousLesMurs,
            openings: toutesLesOuvertures,
            rooms: toutesLesPieces,
            fixtures: toutLAppareillage,
            photos: toutesLesPhotos,
            objects: tousLesMeubles,
            ceiling: toutLePlafond,
            notes: toutesLesNotes,
          },
          niveauCourant,
        ),
      [
        tousLesMurs,
        toutesLesOuvertures,
        toutesLesPieces,
        toutLAppareillage,
        toutesLesPhotos,
        tousLesMeubles,
        toutLePlafond,
        toutesLesNotes,
        niveauCourant,
      ],
    );
  /*
    TOUS LES NIVEAUX DANS LE MÊME DOSSIER — correctif de l'audit : une maison
    à étage partait en deux PDF, et personne n'avait le logement entier sous
    les yeux. Coché dès qu'il y a plusieurs niveaux : chacun garde ses
    feuilles, titrées de son nom (le PDF ne les empile pas sur un même plan).
    Les feuilles électriques restent celles de l'étage affiché. Décoché, on
    retrouve le dossier de l'étage affiché, seul.
  */
  const [tousNiveaux, setTousNiveaux] = useState(true);
  const multi = niveaux.length > 1 && tousNiveaux;
  /** Le titre du dossier : il porte l'étage quand il n'en sort qu'un parmi plusieurs. */
  const titreDuDossier =
    niveaux.length > 1 && !multi
      ? `${scanName} — ${nomDuNiveau(niveauCourant)}`
      : scanName;
  /** Les niveaux, dans l'ordre du dossier : le rez-de-chaussée, les étages en montant, puis les sous-sols. */
  const parNiveau = useMemo(
    () =>
      multi
        ? [...niveaux]
            .sort((a, b) => (a >= 0 ? a : 100 - a) - (b >= 0 ? b : 100 - b))
            .map((nv) => ({
              nv,
              ...filtrerAuNiveau(
                {
                  walls: tousLesMurs,
                  openings: toutesLesOuvertures,
                  rooms: toutesLesPieces,
                  fixtures: toutLAppareillage,
                  photos: toutesLesPhotos,
                  objects: tousLesMeubles,
                  ceiling: toutLePlafond,
                  notes: toutesLesNotes,
                },
                nv,
              ),
            }))
        : [],
    [
      multi,
      niveaux,
      tousLesMurs,
      toutesLesOuvertures,
      toutesLesPieces,
      toutLAppareillage,
      toutesLesPhotos,
      tousLesMeubles,
      toutLePlafond,
      toutesLesNotes,
    ],
  );
  // Les couleurs relevées se jugent sur l'étage qu'on exporte : le
  // rez-de-chaussée peut les avoir et l'étage non, s'il a été scanné dans
  // le noir.
  const colorsAvailable = hasCapturedColors(
    walls,
    rooms.map((r) => r.floor),
  );
  const existant = useScanStore((s) => s.existant);
  const north = useScanStore((s) => s.north);
  const client = useScanStore((s) => s.client);
  const address = useScanStore((s) => s.address);
  const setClientInfo = useScanStore((s) => s.setClientInfo);
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  /**
   * LES ÉLÉVATIONS : un mur vu de face par feuille. COCHÉES DE BASE.
   *
   * Elles ne l'étaient pas, et l'argument tenait : une feuille PAR MUR, un
   * dossier qui triple. Relevé du patron : « coche aussi Élec et élévations
   * de base ». C'est lui qui emporte le dossier, et ce qu'il regarde en
   * perçant, c'est le mur VU DE FACE avec ses retours cotés — un plan vu du
   * dessus ne dit pas à quelle hauteur poser. Les décocher reste un geste ;
   * les chercher quand on est sur l'échelle n'en est pas un.
   *
   * POUR L'ÉLECTRICIEN SEULEMENT — correctif de l'audit : le particulier, qui
   * ne perce pas, recevait une feuille par mur, un dossier interminable.
   */
  const [elevations, setElevations] = useState(modeElec);
  /*
    TOUS LES MURS, OU SEULEMENT LES ÉQUIPÉS.

    Le dossier ne portait plus que les murs qui tiennent quelque chose — un
    gain net quand on relit une pose. Mais on vient parfois y chercher
    l'inverse : le mur VU DE FACE avec ses retours cotés, AVANT d'avoir rien
    posé, pour décider où percer. Les deux usages sont justes, celui-ci se
    demande.
  */
  /*
    « Cotes Élec » : les murs équipés, de face, cotés — voir
    `feuillesElevations` pour l'absorption sans doublon.

    COCHÉE DE BASE elle aussi, avec les élévations. Tant que les deux le
    sont, elle n'ajoute rien : la plus large absorbe l'autre, et le dossier
    ne double aucune feuille. Elle prend son sens au moment où l'on décoche
    « Élévations » pour alléger — les murs ÉQUIPÉS restent alors dans le
    dossier, et c'est le repli que l'on veut à ce moment-là, pas le vide.
  */
  const [cotesElec, setCotesElec] = useState(modeElec);
  /*
    LES POINTS CARDINAUX — DE SÉRIE, SUR LE PLAN 2D SEULEMENT.

    Ils ont été une option « Nord », éteinte par défaut : le patron a
    tranché — pas de bouton. Le dossier désigne ses murs par leur cardinal
    (« Prise plinthe 1 · mur nord ») : le repère qui permet de le vérifier
    sur place n'est pas un ornement qu'on coche, c'est une pièce du
    document. Il vit sur le plan 2D seulement — c'est la feuille qu'on
    oriente ; sur une perspective, quatre lettres au bord du cadre ne
    désignent plus rien. Et sans cap relevé au scan, rien ne se dessine :
    on n'invente pas un nord.
  */

  const parts = useMemo(() => roomParts(walls, rooms), [walls, rooms]);
  /** Les pièces des achats : le même calcul que la feuille « Travaux ». */
  const piecesTravaux = useMemo(
    () =>
      travauxDesPieces(
        parts,
        openings,
        (id, rang) => rooms.find((r) => r.id === id)?.name || `Pièce ${rang + 1}`,
        // Le décor de « Décorer » : la peinture se compte par teinte.
        (id) => rooms.find((r) => r.id === id),
      ),
    [parts, openings, rooms],
  );
  /*
    LES SEULES PIÈCES COCHÉES DANS « TRAVAUX » — correctif de l'audit : une
    pièce décochée comptait quand même au dossier.
  */
  /*
    Sur plusieurs niveaux, les achats comptent tout le logement — chaque
    pièce avec son niveau, deux « Chambre » ne se confondent pas.
  */
  const piecesDuDossier = useMemo(
    () =>
      multi
        ? parNiveau.flatMap((x) =>
            travauxDesPieces(
              roomParts(x.walls, x.rooms),
              x.openings,
              (id, rang) => `${nomDuNiveau(x.nv)} · ${x.rooms.find((r) => r.id === id)?.name || `Pièce ${rang + 1}`}`,
              (id) => x.rooms.find((r) => r.id === id),
            ),
          )
        : piecesTravaux,
    [multi, parNiveau, piecesTravaux],
  );
  const retenues = useMemo(
    () => piecesRetenues(piecesDuDossier, reglages.horsTravaux),
    [piecesDuDossier, reglages.horsTravaux],
  );
  const achatsDuDossier = (oui: boolean) =>
    oui && retenues.length > 0
      ? {
          pieces: retenues,
          hypotheses: reglages.hypotheses,
          prix: reglages.avecPrix ? reglages.prix : null,
        }
      : null;
  const placement = useMemo(
    () => fixturePlacement(fixtures, walls, roomInputsOf(rooms, parts)),
    [fixtures, walls, rooms, parts],
  );
  const cheminements = useMemo(
    () => planRoutes(walls, rooms, parts, fixtures, placement, ceiling, openings),
    [walls, rooms, parts, fixtures, placement, ceiling, openings],
  );
  /**
   * Le nom de chaque appareil : « Séjour, mur nord — Prise plinthe 2 ».
   *
   * Il se calcule ici, et nulle part ailleurs : c'est le seul endroit qui
   * connaît à la fois le placement des appareils dans les pièces, les noms
   * donnés aux pièces et le cap de la boussole.
   */
  const noms = useMemo(
    () =>
      deviceNames(
        fixtures,
        walls,
        placement,
        Object.fromEntries(rooms.map((r) => [r.id, r.name])),
        new Map(parts.map((p) => [p.roomId, p.labelAt])),
        north,
      ),
    [fixtures, walls, placement, rooms, parts, north],
  );
  /**
   * CE QUI EST COCHÉ QUAND ON ARRIVE — relevé du patron : « dans l'export
   * PDF, on doit avoir de base coché : Vues 3D, Métré, Cotes 2D, Meubles.
   * Le reste est décoché. »
   *
   * C'est le dossier qu'on envoie neuf fois sur dix : le plan coté avec ses
   * meubles, le métré, les perspectives. Tout le reste — surfaces teintées,
   * ouvertures en couleur, plafond, élévations, gaines, schémas, cotes 3D —
   * répond à une demande particulière, et se coche quand elle se présente.
   *
   * Le défaut n'était pas d'avoir trop d'options : c'était d'en avoir six
   * cochées d'office. Un dossier de onze feuilles partait chez le client
   * quand on en voulait quatre, et personne ne décoche ce qu'il ne sait pas
   * coché.
   *
   * QUATRE DE CES RÉGLAGES SONT CEUX DU PLAN (meubles, surfaces, ouvertures,
   * couleurs), partagés par le magasin : on les pose ici, à l'ouverture.
   * L'aperçu montre alors exactement ce que le dossier contiendra — c'est
   * tout l'intérêt de cet écran — et le plan les retrouve tels quels en
   * revenant, puisque ce sont les mêmes boutons.
   */
  useEffect(() => {
    setShowFurniture(true);
    // Les SURFACES restent comme le plan les montre (allumées d'office) : un
    // dossier sans un nom de pièce ni un mètre carré ne sert à personne.
    setShowTextures(false);
    setShowOpeningColors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Schémas unifilaire et multifilaire, tirés des mêmes circuits. */
  const [schema, setSchema] = useState(false);
  const schemas = useMemo(() => {
    if (fixtures.length === 0) return null;
    const list = materialList(
      roomInputsOf(rooms, parts),
      fixtures,
      wallToRooms(roomInputsOf(rooms, parts)),
      placement,
      cheminements?.parCircuit,
      ceiling,
    );
    const rows = schemaRows(list.circuits, list.differentials, fixtures);
    return {
      rows,
      differentials: list.differentials,
      multi: list.circuits.map((circ, i) => multiWire(circ, fixtures, `C${i + 1}`)),
      // Le lien entre le plan et le tableau : chaque appareil sait de quel
      // départ il dépend, et c'est ce repère qui s'écrit sur le tracé.
      marks: fixtureMarks(list.circuits),
    };
  }, [rooms, parts, fixtures, placement, cheminements, ceiling]);
  const [measures3D, setMeasures3D] = useState(false);
  // Toucher un modèle verrouille le défilement (iOS annule sinon le geste
  // JS au profit du scroll natif) ; le relâcher le rend au ScrollView.
  const [scrollLocked, setScrollLocked] = useState(false);
  const lockProps = {
    onTouchStart: () => setScrollLocked(true),
    onTouchEnd: (e: any) => {
      if (e.nativeEvent.touches.length === 0) setScrollLocked(false);
    },
    onTouchCancel: () => setScrollLocked(false),
  };
  /** Le plafond se dessine SUR le plan d'ensemble, pas sur une feuille à part. */
  const avecPlafond = plafond && ceiling.length > 0;
  const [vues, setVues] = useState<View3DParams[]>([{ ...ANGLES[0] }]);
  const boites = useRef<{ w: number; h: number }[]>([{ w: 1, h: 1 }]);

  const reset = () => {
    setVues((liste) => liste.map((_, i) => ({ ...angleSuivant(i) })));
  };

  const exportOuvert = useAccountStore((st) => st.exportOuvert);
  /** Abonné : les feuilles de l'aperçu sont nettes ; sinon floutées. */
  const net = useDossierNet();

  const doExport = async () => {
    /* L'aperçu est libre, l'export est Pro : la barrière est ici — voir
       `exportOuvert`. */
    if (!exportOuvert()) return;
    try {
      /**
       * Les photos, relues et réduites AVANT de bâtir le document.
       *
       * TOUTES, et dans l'ordre où elles ont été prises — relevé du
       * patron : « plusieurs photos d'un mur, et un retour doit pouvoir
       * avoir la sienne ». Chacune emporte la cote de sa punaise, qui dit
       * de quel retour elle parle. Celle qui ne se relit pas — fichier
       * effacé hors de l'app — est simplement absente.
       */
      const vignettes: {
        wallId: string;
        base64: string;
        along?: number;
      }[] = [];
      if (elevations || cotesElec) {
        for (const ph of [...(multi ? toutesLesPhotos : photos)].sort((a, b) => a.at - b.at)) {
          const b64 = await RoomScan.readPhoto(ph.path, 900);
          if (b64) {
            vignettes.push({
              wallId: ph.wallId,
              base64: b64,
              along: ph.along,
            });
          }
        }
      }
      const bytes =
        pret.current && pret.current.cle === empreinte && vignettes.length === 0
          ? pret.current.bytes
          : batir(vignettes);
      await RoomScan.sharePDF(toBase64(bytes), pdfFilename(titreDuDossier));
    } catch (e: any) {
      alerte(expliquer('export', e).titre, expliquer('export', e).message);
    }
  };

  /** Une vue de l'écran, dans les unités du document. */
  const conv = (v: View3DParams, b: { w: number; h: number }) => ({
    theta: v.theta,
    tilt: v.tilt,
    zoom: v.zoom,
    fx: v.ox / (b.w / 2),
    fy: v.oy / (b.h / 2),
  });

  /**
   * CE QUI ENTRE DANS LE DOSSIER — une seule écriture, pour le document et
   * pour son sommaire : l'aperçu ne peut pas annoncer une feuille que le PDF
   * n'imprime pas.
   */
  const entrees = (vignettes: { wallId: string; base64: string; along?: number }[]) =>
    [
      {
        name: titreDuDossier,
        walls,
        openings,
        objects: showFurniture ? objects : [],
        rooms,
        fixtures,
        routes: gaines || schema ? cheminements?.traces : undefined,
        // Les mots du relevé passent au dossier : c'est celui qui pose
        // qui les lit, et il lit cette feuille-là.
        notes,
        // Les cotes posées à la règle, à l'étage imprimé.
        mesures: toutesLesMesures.filter((m) => (m.niveau ?? 0) === niveauCourant),
        floors: floorsOf(rooms),
        roomNames: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
        photos: vignettes,
        north,
        deviceNames: noms,
        client,
        address,
        // Le particulier relève son propre logement : le cartouche le dit.
        particulier: !modeElec,
        entreprise: entrepriseDuDossier,
      },
      include3D,
      {
        // Pas de `plan` : le document cadre le sien, droit et entier.
        views: vues.map((v, i) => conv(v, boites.current[i] ?? { w: 1, h: 1 })),
        colorOpenings: showOpeningColors,
        // Le tableau trouvé sur place : sa feuille ne sort qu'en rénovation,
        // et seulement au rez-de-chaussée — un tableau ne se relève qu'une
        // fois, il n'a pas à se répéter sur le dossier de chaque étage.
        existant: niveauCourant === 0 ? (existant ?? undefined) : undefined,
        measures2D,
        measures3D,
        schemas: schema ? schemas : null,
        // Les repères de circuit voyagent À PART : le plan les porte dès
        // que l'app les connaît. C'est le lien entre le plan et le tableau.
        marks: schemas?.marks ?? null,
        // Le plafond se dessine sur le plan d'ensemble, quand on le demande.
        ceiling: plafond ? ceiling : undefined,
        surfaces: showSurfaces,
        textures: showTextures,
        metre: includeMetre,
        garde,
        niveaux: multi
          ? parNiveau.map((x) => {
              const courant = x.nv === niveauCourant;
              const ici = new Set(x.walls.map((w) => w.id));
              return {
                nom: nomDuNiveau(x.nv),
                courant,
                scan: {
                  walls: x.walls,
                  openings: x.openings,
                  objects: showFurniture ? x.objects : [],
                  rooms: x.rooms,
                  fixtures: x.fixtures,
                  routes: courant && (gaines || schema) ? cheminements?.traces : undefined,
                  notes: x.notes,
                  mesures: toutesLesMesures.filter((m) => (m.niveau ?? 0) === x.nv),
                  floors: floorsOf(x.rooms),
                  roomNames: Object.fromEntries(x.rooms.map((r) => [r.id, r.name])),
                  photos: vignettes.filter((v) => ici.has(v.wallId)),
                  deviceNames: courant ? noms : undefined,
                },
              };
            })
          : undefined,
        reperes3D,
        achats: achatsDuDossier(includeAchats),
        ...feuillesElevations(elevations, cotesElec),
      },
    ] as const;

  const batir = (vignettes: { wallId: string; base64: string; along?: number }[]) =>
    buildScanPdf(...entrees(vignettes));

  /*
    LES PHOTOS COMPTENT DANS LE SOMMAIRE, PAS DANS L'APERÇU. Un mur
    photographié a sa feuille : on la compte, avec une photo vide — la vraie
    se relit sur le disque au moment d'envoyer.
  */
  const photosVides = useMemo(
    () => (multi ? toutesLesPhotos : photos).map((p) => ({ wallId: p.wallId, base64: '', along: p.along })),
    [multi, toutesLesPhotos, photos],
  );

  /** L'empreinte des choix : si elle n'a pas bougé, le document non plus. */
  const empreinte = JSON.stringify([
    scanName,
    walls.length,
    openings.length,
    objects.length,
    rooms.length,
    fixtures.length,
    ceiling.length,
    photos.length,
    showFurniture,
    showSurfaces,
    showTextures,
    showOpeningColors,
    measures2D,
    measures3D,
    includeMetre,
    garde,
    multi,
    tousLesMurs.length,
    toutesLesPieces.length,
    reperes3D,
    includeAchats,
    reglages.hypotheses,
    reglages.avecPrix,
    reglages.prix,
    reglages.horsTravaux,
    entrepriseDuDossier,
    elevations,
    cotesElec,
    gaines,
    schema,
    plafond,
    include3D,
    client,
    address,
    vues,
  ]);

  /** Le sommaire : les feuilles, dans l'ordre — il suit chaque réglage. */
  const sommaire = useMemo(
    () => sommaireDuDossier(...entrees(photosVides)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empreinte, photosVides],
  );
  /** Ce qu'apporterait chaque feuille si on la cochait : on le dit avant. */
  const avecTout = useMemo(() => {
    const [scan, , opts] = entrees(photosVides);
    return sommaireDuDossier(scan, true, {
      ...opts,
      metre: true,
      achats: achatsDuDossier(true),
      schemas: schemas ?? null,
      ...feuillesElevations(true, true),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empreinte, photosVides, schemas]);
  const combien = (liste: { genre: string }[], ...genres: string[]) =>
    liste.filter((f) => genres.includes(f.genre)).length;

  /**
   * LE DOSSIER SE BÂTIT PENDANT QU'ON CHOISIT — ET SE MONTRE.
   *
   * Dès que les choix se posent (six cents millisecondes sans changement,
   * les animations finies), on bâtit le document en tâche de fond : l'appui
   * sur « Exporter » n'a plus qu'à partager des octets déjà prêts. Et ces
   * octets, on les MONTRE : le natif rend chaque feuille en image — nette
   * pour l'abonné, floutée et filigranée pour les autres (`apercuPdf`).
   */
  const pret = useRef<{ cle: string; bytes: Uint8Array } | null>(null);
  const [images, setImages] = useState<string[] | null>(null);
  const [enCours, setEnCours] = useState(true);
  const generation = useRef(0);
  useEffect(() => {
    let vivant = true;
    let tache: { cancel: () => void } | null = null;
    setEnCours(true);
    const t = setTimeout(() => {
      tache = InteractionManager.runAfterInteractions(() => {
        if (!vivant) return;
        const ici = ++generation.current;
        try {
          const bytes = batir(photosVides);
          pret.current = { cle: empreinte, bytes };
          RoomScan.apercuPdf(toBase64(bytes), {
            largeur: 1100,
            flou: net ? 0 : FLOU_DE_L_APERCU,
            filigrane: net ? '' : 'EchoPlan',
            maxPages: 40,
          })
            .then((pages) => {
              if (ici !== generation.current) return;
              setImages(pages);
              setEnCours(false);
            })
            .catch(() => {
              if (ici === generation.current) setEnCours(false);
            });
        } catch {
          // Un dossier qui refuse de se bâtir à blanc le dira à l'appui :
          // ici, on ne dérange personne.
          pret.current = null;
          setEnCours(false);
        }
      });
    }, 600);
    return () => {
      vivant = false;
      clearTimeout(t);
      tache?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empreinte, net]);

  // Arrivée en fondu rapide, dans la continuité de l'onde de transition.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  /** Le mot qui explique le dernier calque touché du plan. */
  const [calqueDit, setCalqueDit] = useState<string | null>(null);
  const basculer = (fait: () => void, mot?: string) => {
    fait();
    if (mot) setCalqueDit(mot);
    haptic('leger');
  };

  /* LES MURS DE FACE : tous, seulement les équipés, ou aucun. */
  const murs: 'tous' | 'equipes' | null = elevations ? 'tous' : cotesElec ? 'equipes' : null;
  const choisirMurs = (m: 'tous' | 'equipes' | null) => {
    setElevations(m === 'tous');
    setCotesElec(m !== null);
    haptic('leger');
  };

  /** Les calques du plan : ce qu'on voit sur la feuille maîtresse. */
  const calques: { cle: keyof typeof EXPORT_ICONS; mot: string; dit: string; actif: boolean; basculer: () => void }[] = [
    {
      cle: 'cotes2d',
      mot: 'Cotes',
      dit: 'Les longueurs de chaque mur, au centimètre.',
      actif: measures2D,
      basculer: () => setMeasures2D(!measures2D),
    },
    {
      cle: 'meubles',
      mot: 'Meubles',
      dit: 'Le mobilier, dessiné à sa place.',
      actif: showFurniture,
      basculer: () => setShowFurniture(!showFurniture),
    },
    {
      cle: 'surface',
      mot: 'Surfaces',
      dit: 'Chaque pièce teintée, avec sa surface au sol.',
      actif: showSurfaces,
      basculer: () => setShowSurfaces(!showSurfaces),
    },
    {
      cle: 'ouvertures',
      mot: 'Menuiseries en couleur',
      dit: 'Portes et fenêtres en couleur, repérées d’un coup d’œil.',
      actif: showOpeningColors,
      basculer: () => setShowOpeningColors(!showOpeningColors),
    },
    ...(colorsAvailable
      ? [
          {
            cle: 'couleurs' as const,
            mot: 'Couleurs relevées',
            dit: 'Les teintes des murs et des sols, telles que le scan les a vues.',
            actif: showTextures,
            basculer: () => setShowTextures(!showTextures),
          },
        ]
      : []),
    ...(ceiling.length > 0
      ? [
          {
            cle: 'plafond' as const,
            mot: 'Plafond',
            dit: 'Les points lumineux du plafond, et ce qui les commande.',
            actif: plafond,
            basculer: () => setPlafond(!plafond),
          },
        ]
      : []),
  ];

  return (
    /*
      EN ENVELOPPE, comme le plan et la bibliothèque : l'écran porte des
      boutons jusqu'au bord, et une bande posée par-dessus leur volerait leurs
      vingt-quatre premiers points sans que rien ne l'explique.
    */
    <RetourGlisse onRetour={() => setScreen('result')} style={styles.container}>
      <Animated.View
        style={[
          styles.fadeWrap,
          {
            opacity: fade,
            transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.roundButton} accessibilityLabel="Retour" onPress={() => setScreen('result')}>
            <BackChevron color={c.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Export PDF</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          scrollEnabled={!scrollLocked}>
          {/*
            L'APERÇU D'ABORD — relevé du patron : « tous ces boutons ne sont
            pas ludiques, on ne comprend pas réellement leur intérêt sur le
            plan PDF ». On voit le dossier, feuille par feuille, AVANT de le
            régler : chaque réglage, en dessous, l'ajoute ou le retire sous
            les yeux.
          */}
          <ApercuDuDossier
            sommaire={sommaire}
            images={images}
            enCours={enCours}
            net={net}
            onDeflouter={doExport}
          />

          {/*
            À QUI EST CE DOSSIER — le cartouche de chaque feuille porte le
            nom du client et l'adresse du chantier. Le crayon dit que ça
            s'édite.
          */}
          <View style={styles.dossier}>
            {(
              [
                /*
                  LE PARTICULIER N'A NI CLIENT NI CHANTIER — relevé du patron,
                  point 1 de la réflexion « grand public ».
                */
                ...(modeElec
                  ? [
                      ['Client', client, 'Nom du client', (t: string) => setClientInfo(t, address)],
                      ['Chantier', address, 'Adresse du chantier', (t: string) => setClientInfo(client, t)],
                    ]
                  : [
                      ['Propriétaire', client, 'Nom du propriétaire', (t: string) => setClientInfo(t, address)],
                      ['Adresse', address, 'Adresse du logement', (t: string) => setClientInfo(client, t)],
                    ]),
              ] as [string, string, string, (t: string) => void][]
            ).map(([titre, valeur, invite, poser]) => (
              <TouchableOpacity
                key={titre}
                accessibilityLabel={`Renseigner : ${invite}`}
                style={styles.dossierCase}
                onPress={() =>
                  setPrompt({
                    title: invite,
                    subtitle: 'Il paraît dans le cartouche de chaque feuille.',
                    value: valeur,
                    okLabel: 'Enregistrer',
                    onSubmit: poser,
                  })
                }>
                <View style={styles.dossierEntete}>
                  <Text style={styles.dossierTitre}>{titre.toUpperCase()}</Text>
                  <Svg width={11} height={11} viewBox="0 0 24 24">
                    <Path d={SOLAIRES.crayon} fill={c.inkFaint} fillRule="evenodd" />
                  </Svg>
                </View>
                <Text style={[styles.dossierValeur, !valeur && styles.dossierVide]} numberOfLines={1}>
                  {valeur || 'Non renseigné'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>Composez votre dossier</Text>

          {/* ------------------------------------------------ le plan coté */}
          {/* ----------------------------------------- la page de garde */}
          <Carte
            icone={SOLAIRES.maison}
            titre="Page de garde"
            dit="Le logement, à qui il est, ses surfaces, une vue d’ensemble et le contenu du dossier."
            pages={pagesDe(garde, combien(sommaire, 'garde'), 1)}
            actif={garde}
            label="Page de garde"
            onChange={(v) => basculer(() => setGarde(v))}
          />

          {/* ------------------------------------------ tous les niveaux */}
          {niveaux.length > 1 && (
            <Carte
              icone={SOLAIRES.etage}
              titre="Tous les niveaux"
              dit={`Les ${niveaux.length} niveaux dans un seul dossier, chacun avec ses plans et son métré.`}
              pages={multi ? 'Tout le logement' : nomDuNiveau(niveauCourant)}
              actif={tousNiveaux}
              label="Tous les niveaux"
              onChange={(v) => basculer(() => setTousNiveaux(v))}
            />
          )}

          <Carte
            icone={EXPORT_ICONS.cotes2d}
            titre="Plan coté"
            dit="La feuille maîtresse : le logement vu du dessus, droit et entier."
            pages="Toujours inclus">
            <View style={styles.calques}>
              {calques.map((k) => (
                <TouchableOpacity
                  key={k.cle}
                  accessibilityLabel={k.mot}
                  accessibilityState={{ selected: k.actif }}
                  style={[styles.calque, k.actif && styles.calqueOn]}
                  onPress={() => basculer(k.basculer, `${k.mot} : ${k.dit}`)}>
                  <Svg width={15} height={15} viewBox="0 0 24 24">
                    <Path d={EXPORT_ICONS[k.cle]} fill={k.actif ? '#FFFFFF' : c.ink} fillRule="evenodd" />
                  </Svg>
                  <Text style={[styles.calqueMot, k.actif && styles.calqueMotOn]}>{k.mot}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.calqueDit}>
              {calqueDit ?? 'Touchez un calque : le plan ci-dessous le montre ou le retire.'}
            </Text>
            <PlanPreview
              cotes={measures2D}
              routes={gaines || schema ? cheminements?.traces : undefined}
              ceiling={avecPlafond ? ceiling : undefined}
            />
          </Carte>

          {/* ------------------------------------------------- le métré */}
          <Carte
            icone={EXPORT_ICONS.metre}
            titre="Métré"
            dit="Surfaces, périmètres, plinthes et ouvertures : de quoi chiffrer sols et peinture."
            pages={pagesDe(includeMetre, combien(sommaire, 'metre'), combien(avecTout, 'metre'))}
            actif={includeMetre}
            label="Métré"
            onChange={(v) => basculer(() => setIncludeMetre(v))}
          />

          {/* -------------------------------------- ce qu'il faut acheter */}
          {piecesTravaux.length > 0 && (
            <Carte
              icone={EXPORT_ICONS.achats}
              titre="Ce qu’il faut acheter"
              dit={
                reglages.avecPrix
                  ? 'Peinture, sol et plinthes, pièce par pièce — avec le prix estimé.'
                  : 'Peinture, sol et plinthes, pièce par pièce — aux réglages de « Travaux ».'
              }
              pages={pagesDe(includeAchats, combien(sommaire, 'achats'), combien(avecTout, 'achats'))}
              actif={includeAchats}
              label="Ce qu’il faut acheter"
              onChange={(v) => basculer(() => setIncludeAchats(v))}
            />
          )}

          {/* ---------------------------------------------- les vues 3D */}
          <Carte
            icone={EXPORT_ICONS.vues3d}
            titre="Vues 3D"
            dit={
              modeElec
                ? 'Le logement en perspective : le client s’y projette d’un regard.'
                : 'Le logement en perspective : on s’y projette d’un regard.'
            }
            pages={pagesDe(include3D, combien(sommaire, 'perspective'), Math.max(1, vues.length))}
            actif={include3D}
            label="Vues 3D"
            onChange={(v) => basculer(() => setInclude3D(v))}>
            {include3D && (
              <>
                <View style={styles.calques}>
                  <TouchableOpacity
                    accessibilityLabel="Cotes sur la 3D"
                    accessibilityState={{ selected: measures3D }}
                    style={[styles.calque, measures3D && styles.calqueOn]}
                    onPress={() => basculer(() => setMeasures3D(!measures3D))}>
                    <Svg width={15} height={15} viewBox="0 0 24 24">
                      <Path d={EXPORT_ICONS.cotes3d} fill={measures3D ? '#FFFFFF' : c.ink} fillRule="evenodd" />
                    </Svg>
                    <Text style={[styles.calqueMot, measures3D && styles.calqueMotOn]}>Cotes sur la 3D</Text>
                  </TouchableOpacity>
                  {/* Les repères d'appareillage : utiles au chantier, de trop
                      sur une perspective qu'on montre au client. */}
                  {modeElec && toutLAppareillage.length > 0 && (
                    <TouchableOpacity
                      accessibilityLabel="Repères sur la 3D"
                      accessibilityState={{ selected: reperes3D }}
                      style={[styles.calque, reperes3D && styles.calqueOn]}
                      onPress={() => basculer(() => setReperes3D(!reperes3D))}>
                      <Svg width={15} height={15} viewBox="0 0 24 24">
                        <Path d={SOLAIRES.reperes} fill={reperes3D ? '#FFFFFF' : c.ink} fillRule="evenodd" />
                      </Svg>
                      <Text style={[styles.calqueMot, reperes3D && styles.calqueMotOn]}>Repères</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity accessibilityLabel="Remettre les cadrages à zéro" style={styles.calque} onPress={reset}>
                    <Text style={styles.calqueMot}>↻ Recadrer</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.calqueDit}>Un doigt pour tourner, deux pour zoomer : chaque vue part telle quelle.</Text>
                {vues.map((v, i) => (
                  <React.Fragment key={i}>
                    {vues.length > 1 && (
                      <View style={styles.vueTete}>
                        <Text style={styles.vueNom}>Vue {i + 1}</Text>
                        {i > 0 && (
                          <TouchableOpacity
                            accessibilityLabel={`Retirer la perspective ${i + 1}`}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            onPress={() => setVues((liste) => liste.filter((_, k) => k !== i))}>
                            <Text style={styles.retirer}>Retirer</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <View
                      {...lockProps}
                      style={styles.view3d}
                      onLayout={(e) => {
                        boites.current[i] = {
                          w: e.nativeEvent.layout.width,
                          h: e.nativeEvent.layout.height,
                        };
                      }}>
                      <Iso3DView
                        value={v}
                        onChange={(nv) => setVues((liste) => liste.map((x, k) => (k === i ? nv : x)))}
                        showMeasures={measures3D}
                        // Ce qu'on voit est ce qui part : l'aperçu suit la
                        // pastille « Repères », comme la feuille.
                        showElecTags={reperes3D}
                        // Les cardinaux appartiennent au plan 2D : sur une
                        // perspective, quatre lettres au bord du cadre ne
                        // désignent plus rien.
                        showNorth={false}
                      />
                    </View>
                  </React.Fragment>
                ))}
                {vues.length < MAX_VUES && (
                  <TouchableOpacity
                    style={styles.ajouter}
                    accessibilityLabel="Ajouter une perspective"
                    onPress={() => setVues((liste) => [...liste, { ...angleSuivant(liste.length) }])}>
                    <Text style={styles.ajouterTexte}>+ Un autre angle</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Carte>

          {/* ------------------------------------------ les murs de face */}
          <Carte
            icone={EXPORT_ICONS.elevations}
            titre="Murs de face"
            dit={
              modeElec
                ? 'Chaque mur vu de face, coté : là où l’on perce, à la bonne hauteur.'
                : 'Chaque mur vu de face, coté, avec ses portes et ses fenêtres.'
            }
            pages={pagesDe(murs !== null, combien(sommaire, 'elevation'), combien(avecTout, 'elevation'))}
            actif={murs !== null}
            label="Murs de face"
            onChange={(v) => choisirMurs(v ? 'tous' : null)}>
            {murs !== null && modeElec && (
              <View style={styles.segment}>
                {(
                  [
                    ['tous', 'Tous les murs'],
                    ['equipes', 'Murs équipés'],
                  ] as const
                ).map(([m, mot]) => (
                  <TouchableOpacity
                    key={m}
                    accessibilityLabel={mot}
                    accessibilityState={{ selected: murs === m }}
                    style={[styles.segmentCase, murs === m && styles.segmentCaseOn]}
                    onPress={() => choisirMurs(m)}>
                    <Text style={[styles.segmentMot, murs === m && styles.segmentMotOn]}>{mot}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Carte>

          {/* ------------------------------------------ le plan des gaines */}
          {cheminements && (
            <Carte
              icone={EXPORT_ICONS.gaines}
              titre="Plan des gaines"
              dit="Le chemin de chaque câble, et le tirage circuit par circuit."
              pages={pagesDe(gaines, combien(sommaire, 'gaines'), 1)}
              actif={gaines}
              label="Plan des gaines"
              onChange={(v) => basculer(() => setGaines(v))}
            />
          )}

          {/* ------------------------------------------- les schémas */}
          {schemas && (
            <Carte
              icone={EXPORT_ICONS.schema}
              titre="Schémas électriques"
              dit="L’unifilaire et le multifilaire : le tableau, et le câblage de chaque circuit."
              pages={pagesDe(schema, combien(sommaire, 'unifilaire', 'multifilaire'), combien(avecTout, 'unifilaire', 'multifilaire'))}
              actif={schema}
              label="Schémas"
              onChange={(v) => basculer(() => setSchema(v))}
            />
          )}

          {/* ------------------------------------------ le tableau existant */}
          {combien(sommaire, 'existant') > 0 && (
            <Carte
              icone={EXPORT_ICONS.cotesElec}
              titre="Tableau existant"
              dit="Le tableau relevé sur place, et ce qu’il faut reprendre."
              pages="Inclus d’office"
            />
          )}
        </ScrollView>

        {/*
          LE BOUTON DIT CE QU'IL FAIT. Abonné : il envoie le dossier. Sinon :
          il défloute — c'est l'offre, au moment où le dossier est sous les
          yeux.
        */}
        <TouchableOpacity
          style={styles.exportButton}
          accessibilityLabel={net ? 'Exporter le PDF' : 'Déflouter et télécharger'}
          onPress={doExport}>
          {!net && (
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path d={CADENAS} fill="#FFFFFF" />
            </Svg>
          )}
          <Text style={styles.exportText}>
            {net
              ? `Exporter le PDF · ${sommaire.length} feuille${sommaire.length > 1 ? 's' : ''}`
              : 'Déflouter et télécharger'}
          </Text>
        </TouchableOpacity>
        <PromptSheet data={prompt} onClose={() => setPrompt(null)} />
      </Animated.View>
    </RetourGlisse>
  );
}

/** Le flou de l'aperçu sans abonnement : on reconnaît son plan, on ne lit pas une cote. */
export const FLOU_DE_L_APERCU = 6;

const CADENAS =
  'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z';

/** Ce qu'une feuille pèse dans le dossier, dit avant qu'on la coche. */
function pagesDe(actif: boolean, ici: number, siCochee: number): string {
  const n = actif ? ici : siCochee;
  if (n <= 0) return actif ? 'Rien à imprimer' : '';
  const mot = `${n} feuille${n > 1 ? 's' : ''}`;
  return actif ? mot : `+ ${mot}`;
}

/**
 * UNE FEUILLE DU DOSSIER, UNE CARTE — son icône, son nom, À QUOI ELLE SERT,
 * ce qu'elle pèse, et son interrupteur. On ne coche plus une icône muette :
 * on décide d'une feuille dont on sait ce qu'elle dit.
 */
function Carte({
  icone,
  titre,
  dit,
  pages,
  actif,
  label,
  onChange,
  children,
}: {
  icone: string;
  titre: string;
  dit: string;
  pages: string;
  actif?: boolean;
  label?: string;
  onChange?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const allumee = actif === undefined || actif;
  return (
    <View style={[s.carte, !allumee && s.carteEteinte]}>
      <View style={s.carteTete}>
        <View style={[s.carteIcone, allumee && { backgroundColor: c.blue }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d={icone} fill={allumee ? '#FFFFFF' : c.inkSoft} fillRule="evenodd" />
          </Svg>
        </View>
        <View style={s.carteTexte}>
          <View style={s.carteLigne}>
            <Text style={s.carteTitre}>{titre}</Text>
            {!!pages && <Text style={[s.cartePages, allumee && { color: c.blue }]}>{pages}</Text>}
          </View>
          <Text style={s.carteDit}>{dit}</Text>
        </View>
        {onChange && (
          <Switch
            accessibilityLabel={label ?? titre}
            value={!!actif}
            onValueChange={onChange}
            trackColor={{ true: c.blue, false: c.surfaceSunken }}
          />
        )}
      </View>
      {children ? <View style={s.carteCorps}>{children}</View> : null}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 58,
    paddingHorizontal: 18,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  title: {
    color: c.ink,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginLeft: 12,
  },
  scroll: { paddingBottom: 18, gap: 12 },
  fadeWrap: { flex: 1 },
  /** Le bloc « à qui est ce dossier ». */
  dossier: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dossierCase: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  /* Le titre et son crayon sur la même ligne : le signe est À CÔTÉ du mot
     qu'il qualifie, pas perdu dans un coin de la case. */
  dossierEntete: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dossierTitre: {
    color: c.inkFaint,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  dossierValeur: { color: c.ink, fontSize: 14.5, fontWeight: '700', marginTop: 3 },
  dossierVide: { color: c.inkFaint, fontWeight: '600' },
  section: {
    color: c.inkSoft,
    fontSize: 12.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
  },
  carte: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: 14,
    ...shadowCard,
    shadowOpacity: 0.06,
  },
  carteEteinte: { opacity: 0.86 },
  carteTete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  carteIcone: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carteTexte: { flex: 1 },
  carteLigne: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  carteTitre: { color: c.ink, fontSize: 16, fontWeight: '700' },
  cartePages: { color: c.inkFaint, fontSize: 12, fontWeight: '700' },
  carteDit: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
  carteCorps: { marginTop: 12, gap: 8 },
  calques: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  calque: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  calqueOn: { backgroundColor: c.blue },
  calqueMot: { color: c.ink, fontSize: 13, fontWeight: '700' },
  calqueMotOn: { color: '#FFFFFF' },
  calqueDit: { color: c.inkFaint, fontSize: 12.5, lineHeight: 17 },
  vueTete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  vueNom: { color: c.inkSoft, fontSize: 12.5, fontWeight: '700' },
  retirer: { color: c.danger, fontSize: 12.5, fontWeight: '700' },
  // Gouttières invisibles : les bandes latérales appartiennent au scroll,
  // seul le centre manipule le modèle.
  view3d: { height: 210, borderRadius: 14, overflow: 'hidden', marginHorizontal: 18 },
  ajouter: {
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.line,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  ajouterTexte: { color: c.blue, fontSize: 14, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: c.surfaceSunken, borderRadius: radius.pill, padding: 3 },
  segmentCase: { flex: 1, alignItems: 'center', borderRadius: radius.pill, paddingVertical: 8 },
  segmentCaseOn: { backgroundColor: c.surface, ...shadowCard, shadowOpacity: 0.08 },
  segmentMot: { color: c.inkSoft, fontSize: 13, fontWeight: '700' },
  segmentMotOn: { color: c.ink },
  exportButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.blue,
    marginBottom: 28,
    marginTop: 6,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    ...ombreAction,
  },
  exportText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
}));
