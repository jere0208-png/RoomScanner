import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import {
  Alert,
  Animated,
  InteractionManager,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { RoomScan } from 'react-native-room-scan';
import {
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { DEFAULT_VIEW3D, Iso3DView, type View3DParams } from '../components/Iso3DView';
import { buildScanPdf, pdfFilename, toBase64 } from '../export/pdf';
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
import { planRoutes } from '../geometry/elecplan';
import { floorsOf, useScanStore } from '../store/scanStore';
import { deviceNames } from '../geometry/naming';
import { PromptSheet, type PromptData } from '../components/Sheet';
import type { CeilingFixture } from '../geometry/ceiling';


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
  box: { height: 380, borderRadius: 16, overflow: 'hidden' },
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

export function ExportScreen() {
  const setScreen = useScanStore((s) => s.setScreen);
  const scanName = useScanStore((s) => s.scanName);
  const tousLesMurs = useScanStore((s) => s.walls);
  const toutesLesOuvertures = useScanStore((s) => s.openings);
  const tousLesMeubles = useScanStore((s) => s.objects);
  const toutLAppareillage = useScanStore((s) => s.fixtures);
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
  /** Une case de la grille : icône, mot, état, bascule. */
type OptionDef = [keyof typeof EXPORT_ICONS, string, boolean, () => void];

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
  const [includeMetre, setIncludeMetre] = useState(true);
  const [measures2D, setMeasures2D] = useState(true);
  /**
   * Plan des gaines : le tracé du tableau à chaque appareil, celui-là même
   * dont le devis donne les longueurs. Décoché par défaut — un plan
   * d'architecte n'a pas à porter le tirage —, mais à un interrupteur près
   * quand c'est l'électricien qui imprime.
   */
  const [gaines, setGaines] = useState(false);
  const toutLePlafond = useScanStore((s) => s.ceiling);
  /** La feuille d'implantation du plafond, avec ses liens de commande. */
  const [plafond, setPlafond] = useState(true);
  const toutesLesPhotos = useScanStore((s) => s.photos);
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
  const { walls, openings, rooms, fixtures, photos, objects, ceiling } =
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
        niveauCourant,
      ],
    );
  /** Le titre du dossier : il porte l'étage dès qu'il y en a plusieurs. */
  const titreDuDossier =
    niveaux.length > 1
      ? `${scanName} — ${nomDuNiveau(niveauCourant)}`
      : scanName;
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
   * LES ÉLÉVATIONS : un mur vu de face par feuille.
   *
   * Décochées par défaut, et ce n'est pas de la prudence : elles font une
   * feuille PAR MUR. C'est le dossier qu'on emporte sur le chantier, pas
   * celui qu'on envoie au client.
   */
  const [elevations, setElevations] = useState(false);
  /*
    TOUS LES MURS, OU SEULEMENT LES ÉQUIPÉS.

    Le dossier ne portait plus que les murs qui tiennent quelque chose — un
    gain net quand on relit une pose. Mais on vient parfois y chercher
    l'inverse : le mur VU DE FACE avec ses retours cotés, AVANT d'avoir rien
    posé, pour décider où percer. Les deux usages sont justes, celui-ci se
    demande.
  */
  /** « Cotes Élec » : les murs équipés, de face, cotés — voir
   *  `feuillesElevations` pour l'absorption sans doublon. */
  const [cotesElec, setCotesElec] = useState(false);
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
  const placement = useMemo(
    () => fixturePlacement(fixtures, walls, roomInputsOf(rooms, parts)),
    [fixtures, walls, rooms, parts],
  );
  const cheminements = useMemo(
    () => planRoutes(walls, rooms, parts, fixtures, placement, ceiling),
    [walls, rooms, parts, fixtures, placement, ceiling],
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
  const [measures3D, setMeasures3D] = useState(true);
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

  const doExport = async () => {
    try {
      /**
       * Les photos, relues et réduites AVANT de bâtir le document.
       *
       * TOUTES, et dans l'ordre où elles ont été prises — relevé du
       * patron : « plusieurs photos d'un mur, et un retour doit pouvoir
       * avoir la sienne ». Le dossier n'en gardait qu'une par mur, au
       * motif que « deux vignettes de la même cloison n'apprennent rien
       * de plus » : c'est faux dès qu'un mur est percé, le pan de gauche
       * et le tableau de droite sont deux chantiers. Chacune emporte la
       * cote de sa punaise, qui dit de quel retour elle parle.
       *
       * Celle qui ne se relit pas — fichier effacé hors de l'app — est
       * simplement absente : sa feuille sort sans elle.
       */
      const vignettes: {
        wallId: string;
        base64: string;
        along?: number;
      }[] = [];
      if (elevations) {
        for (const ph of [...photos].sort((a, b) => a.at - b.at)) {
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
      Alert.alert('Export impossible', e?.message ?? 'Erreur inconnue');
    }
  };

  /**
   * LE DOSSIER SE BÂTIT PENDANT QU'ON CHOISIT, PAS APRÈS.
   *
   * Sur un logement meublé, l'assemblage du PDF prend près d'une demi-seconde :
   * plan, deux vues 3D, élévations, schémas, métré. Elle tombait tout entière
   * APRÈS l'appui sur « Exporter » — l'écran se fige, et l'électricien croit
   * que rien ne s'est passé.
   *
   * Or il passe plusieurs secondes à régler ses options : c'est là qu'on
   * travaille. Dès que ses choix se posent — six cents millisecondes sans
   * changement, et une fois les animations finies — on bâtit le document en
   * tâche de fond et on le garde. S'il n'a rien retouché depuis, l'appui sur le
   * bouton n'a plus qu'à partager des octets déjà prêts.
   */
  /** Une vue de l'écran, dans les unités du document. */
  const conv = (v: View3DParams, b: { w: number; h: number }) => ({
    theta: v.theta,
    tilt: v.tilt,
    zoom: v.zoom,
    fx: v.ox / (b.w / 2),
    fy: v.oy / (b.h / 2),
  });

  const batir = (vignettes: { wallId: string; base64: string }[]) =>
    buildScanPdf(
        {
          name: titreDuDossier,
          walls,
          openings,
          objects: showFurniture ? objects : [],
          rooms,
          fixtures,
          routes: gaines || schema ? cheminements?.traces : undefined,
          floors: floorsOf(rooms),
          roomNames: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
          photos: vignettes,
          north,
          deviceNames: noms,
          client,
          address,
        },
        include3D,
        {
          // Pas de `plan` : le document cadre le sien, droit et entier.
          views: vues.map((v, i) =>
            conv(v, boites.current[i] ?? { w: 1, h: 1 }),
          ),
          colorOpenings: showOpeningColors,
          // Le tableau trouve sur place : sa feuille ne sort qu en renovation,
          // et seulement au rez-de-chaussee — un tableau ne se releve qu une
          // fois, il n a pas a se repeter sur le dossier de chaque etage.
          existant: niveauCourant === 0 ? (existant ?? undefined) : undefined,
          measures2D,
          measures3D,
          schemas: schema ? schemas : null,
          // Les repères de circuit voyagent À PART : le plan les porte dès
          // que l'app les connaît, que la feuille de schéma soit demandée
          // ou non. C'est le lien entre le plan et le tableau, pas une
          // dépendance de pagination.
          marks: schemas?.marks ?? null,
          // Le plafond ne s'impose pas : il fait une feuille de plus, et
          // tout le monde n'équipe pas les plafonds.
          ceiling: plafond ? ceiling : undefined,
          surfaces: showSurfaces,
          textures: showTextures,
          metre: includeMetre,
          ...feuillesElevations(elevations, cotesElec),
        },
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
    showFurniture,
    showSurfaces,
    showTextures,
    showOpeningColors,
    measures2D,
    measures3D,
    includeMetre,
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
  const pret = useRef<{ cle: string; bytes: Uint8Array } | null>(null);
  useEffect(() => {
    // Les élévations relisent les photos sur le disque : c'est asynchrone, et
    // c'est le geste coûteux. On ne prépare donc que les dossiers sans photo.
    if ((elevations || cotesElec) && photos.length > 0) return;
    let vivant = true;
    let tache: { cancel: () => void } | null = null;
    const t = setTimeout(() => {
      tache = InteractionManager.runAfterInteractions(() => {
        if (!vivant) return;
        try {
          pret.current = { cle: empreinte, bytes: batir([]) };
        } catch {
          // Un dossier qui refuse de se bâtir à blanc le dira à l'appui :
          // ici, on ne dérange personne.
          pret.current = null;
        }
      });
    }, 600);
    return () => {
      vivant = false;
      clearTimeout(t);
      tache?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empreinte]);

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

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.fadeWrap,
          {
            opacity: fade,
            transform: [
              {
                translateY: fade.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.roundButton}
          // Le seul retour de l'app qui restait muet : le nom s'écrit,
          // comme sur les trois autres écrans.
          accessibilityLabel="Retour"
          onPress={() => setScreen('result')}>
          <BackChevron color={c.ink} />
        </TouchableOpacity>
        {/* Le bord gauche rend le même retour que la flèche. */}
        <RetourGlisse onRetour={() => setScreen('result')} />
        <Text style={styles.title}>Aperçu du PDF</Text>
        <TouchableOpacity
          style={[styles.roundButton, styles.resetButton]}
          accessibilityLabel="Remettre les cadrages à zéro"
          onPress={reset}>
          <Text style={styles.resetIcon}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollEnabled={!scrollLocked}>
        {/*
          À QUI EST CE DOSSIER.

          Le cartouche ne portait que le nom du fichier. Un devis, un plan
          d'exécution, un dossier de réception portent toujours le nom de
          celui qui le reçoit et l'adresse du chantier — c'est ce qu'on
          cherche en premier sur une pile de plans, et ce qui distingue
          deux T3 identiques rue Pasteur.
        */}
        <View style={styles.dossier}>
          {(
            [
              ['Client', client, 'Nom du client', (t: string) => setClientInfo(t, address)],
              ['Chantier', address, 'Adresse du chantier', (t: string) => setClientInfo(client, t)],
            ] as [string, string, string, (t: string) => void][]
          ).map(([titre, valeur, invite, poser]) => (
            <TouchableOpacity
              key={titre}
              /*
                ON NE DEVINE PAS QU'UNE ÉTIQUETTE SE TOUCHE.

                Ces deux cases s'éditaient déjà, mais rien ne le disait :
                « CLIENT — Non renseigné » se lit comme une constatation, pas
                comme un champ. Le parcours d'essai l'a montré — on arrive à
                l'export, le cartouche annonce « non renseigné », et l'on
                repart avec un dossier anonyme sans avoir compris qu'il
                suffisait d'appuyer. Le crayon dit « ça s'édite » : c'est le
                même signe que sur le bandeau des cotes, et il vaut mieux
                qu'une notice.
              */
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
                  <Path
                    d={SOLAIRES.crayon}
                    fill={c.inkFaint}
                    fillRule="evenodd"
                  />
                </Svg>
              </View>
              <Text
                style={[styles.dossierValeur, !valeur && styles.dossierVide]}
                numberOfLines={1}>
                {valeur || 'Non renseigné'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ce qui entre dans le document : neuf réglages, en une grille
            d'icônes plutôt qu'en neuf lignes d'interrupteurs. Empilés, ils
            repoussaient l'aperçu — la seule chose qu'on veuille vraiment
            voir ici — sous la ligne de flottaison. Actif = pastille bleue,
            comme partout ailleurs dans l'app. */}
        <View style={styles.grille}>
          {(
            [
              ['vues3d', 'Vues 3D', include3D, () => setInclude3D(!include3D)],
              [
                'metre',
                'Métré',
                includeMetre,
                () => setIncludeMetre(!includeMetre),
              ],
              [
                'cotes2d',
                'Cotes 2D',
                measures2D,
                () => setMeasures2D(!measures2D),
              ],
              [
                'cotes3d',
                'Cotes 3D',
                measures3D,
                () => setMeasures3D(!measures3D),
              ],
              [
                'meubles',
                'Meubles',
                showFurniture,
                () => setShowFurniture(!showFurniture),
              ],
              [
                'surface',
                'Surfaces',
                showSurfaces,
                () => setShowSurfaces(!showSurfaces),
              ],
              [
                'ouvertures',
                'Ouvertures',
                showOpeningColors,
                () => setShowOpeningColors(!showOpeningColors),
              ],
              ...(colorsAvailable
                ? [
                    [
                      'couleurs',
                      'Couleurs',
                      showTextures,
                      () => setShowTextures(!showTextures),
                    ] as OptionDef,
                  ]
                : []),
              ...(cheminements
                ? [
                    [
                      'gaines',
                      'Gaines',
                      gaines,
                      () => setGaines(!gaines),
                    ] as OptionDef,
                  ]
                : []),
              ...(ceiling.length > 0
                ? [
                    [
                      'plafond',
                      'Plafond',
                      plafond,
                      () => setPlafond(!plafond),
                    ] as OptionDef,
                  ]
                : []),
              [
                'elevations',
                'Élévations',
                elevations,
                () => setElevations(!elevations),
              ],
              // Les murs équipés, de face et cotés — absorbé par les
              // élévations quand elles sont là : jamais de feuille double.
              [
                'cotesElec',
                'Cotes Élec',
                cotesElec,
                () => setCotesElec(!cotesElec),
              ] as OptionDef,
              ...(schemas
                ? [
                    [
                      'schema',
                      'Schémas',
                      schema,
                      () => setSchema(!schema),
                    ] as OptionDef,
                  ]
                : []),
            ] as OptionDef[]
          ).map(([icon, label, actif, press]) => (
            /* Le nom SOUS le bloc, pas dedans : la pastille ne porte que son
               icône, centrée, et le mot se lit en légende. Un carré qui
               contient à la fois un dessin et un mot n'a de place ni pour
               l'un ni pour l'autre — l'icône rétrécissait, le mot se
               tronquait, et l'état actif se lisait mal sous le texte. */
            <View key={icon} style={styles.optionCell}>
              <TouchableOpacity
                style={[styles.option, actif && styles.optionOn]}
                activeOpacity={0.8}
                accessibilityLabel={label}
                onPress={press}>
                <Svg width={24} height={24} viewBox="0 0 24 24">
                  {/* La silhouette Solar, remplie — jamais de trait. */}
                  <Path
                    d={EXPORT_ICONS[icon]}
                    fill={actif ? '#FFFFFF' : c.ink}
                    fillRule="evenodd"
                  />
                </Svg>
              </TouchableOpacity>
              <Text
                style={[styles.optionText, actif && styles.optionTextOn]}
                numberOfLines={1}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {/*
          LES NUMÉROS DE FEUILLE SUIVENT LE DOCUMENT.

          Ils étaient écrits en dur — « Feuille 1 », « Feuille 2 · Vues
          3D » — alors que le PDF insère le plafond en deuxième et le
          métré en troisième. On cadrait donc la « feuille 2 » pour la
          retrouver en quatrième page, et on cherchait la feuille du
          plafond dans un écran qui ne la montrait nulle part.
        */}
        <Text style={styles.sheetLabel}>
          {avecPlafond
            ? 'Feuille 1 · Plan d’ensemble et plafond'
            : 'Feuille 1 · Plan d’ensemble'}
        </Text>
        <View style={styles.sheetCard}>
          {/* Plus de verrou de défilement ici : rien ne se manipule sur le
              plan, donc le doigt doit pouvoir le traverser pour faire
              défiler la page. */}
          <PlanPreview
            cotes={measures2D}
            routes={gaines || schema ? cheminements?.traces : undefined}
            ceiling={avecPlafond ? ceiling : undefined}
          />
        </View>

        {/*
          LA PRÉSENTATION N'EST PLUS ICI.

          Elle a occupé trois places avant celle-ci — pied de page, écran du
          scan, sous l'aperçu — et le malentendu était le même à chaque
          fois : on la rangeait dans le RÉGLAGE D'UN DOCUMENT alors que
          c'est une SORTIE. Elle se choisit donc sur le bouton
          « Exporter », avec le PDF, le modèle 3D et le bordereau. Cet
          écran-ci ne sert qu'à composer une feuille.
        */}

        {include3D && (
          <>
            {/*
              UNE PERSPECTIVE PAR FEUILLE, ET AUTANT QU'IL EN FAUT.

              Deux vues se partageaient une page, chacune dans une case du
              tiers d'un A4 : on n'y distinguait plus une porte d'une
              fenêtre. Chacune prend maintenant sa feuille entière, et l'on
              en ajoute quand un angle manque — de face pour la cuisine, de
              l'autre bout pour le séjour.
            */}
            {vues.map((v, i) => (
              <React.Fragment key={i}>
                <View style={styles.sheetHead}>
                  <Text style={styles.sheetLabel}>
                    {`Feuille ${(includeMetre ? 1 : 0) + 2 + i} · Perspective${
                      vues.length > 1 ? ` ${i + 1}` : ''
                    }`}
                  </Text>
                  {i > 0 && (
                    <TouchableOpacity
                      accessibilityLabel={`Retirer la perspective ${i + 1}`}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() =>
                        setVues((liste) => liste.filter((_, k) => k !== i))
                      }>
                      <Text style={styles.retirer}>Retirer</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.sheetCard}>
                  <View
                    {...lockProps}
                    style={[styles.view3d, styles.view3dLast]}
                    onLayout={(e) => {
                      boites.current[i] = {
                        w: e.nativeEvent.layout.width,
                        h: e.nativeEvent.layout.height,
                      };
                    }}>
                    <Iso3DView
                      value={v}
                      onChange={(nv) =>
                        setVues((liste) =>
                          liste.map((x, k) => (k === i ? nv : x)),
                        )
                      }
                      showMeasures={measures3D}
                      // Les cardinaux appartiennent au plan 2D : sur une
                      // perspective, quatre lettres au bord du cadre ne
                      // désignent plus rien.
                      showNorth={false}
                    />
                  </View>
                </View>
              </React.Fragment>
            ))}
            {vues.length < MAX_VUES && (
              <TouchableOpacity
                style={styles.ajouter}
                accessibilityLabel="Ajouter une perspective"
                onPress={() =>
                  setVues((liste) => [
                    ...liste,
                    { ...angleSuivant(liste.length) },
                  ])
                }>
                <Text style={styles.ajouterTexte}>+ Ajouter une perspective</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={styles.hint}>
          Le plan 2D est cadré par le document : droit, entier, coté. Les
          perspectives, elles, se règlent — un doigt pour tourner, deux pour
          zoomer. ↻ remet leurs angles à zéro.
        </Text>
      </ScrollView>

      {/* Cet écran compose UNE feuille et la sort. La présentation, elle,
          se choisit sur le bouton « Exporter » du plan, avec les autres
          sorties. */}
      <TouchableOpacity style={styles.exportButton} onPress={doExport}>
        <Text style={styles.exportText}>Exporter le PDF</Text>
      </TouchableOpacity>
      <PromptSheet data={prompt} onClose={() => setPrompt(null)} />
      </Animated.View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
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
  resetButton: { marginLeft: 'auto' },
  resetIcon: { color: c.blue, fontSize: 20, fontWeight: '700' },
  title: {
    color: c.ink,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginLeft: 12,
  },
  scroll: { paddingBottom: 16 },
  // Quatre par ligne : la grille tient en deux rangées, l'aperçu remonte.
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 6,
    marginBottom: 10,
  },
  optionCell: { width: '23.5%', alignItems: 'center' },
  option: {
    // Une tuile BASSE, et une icône plus grande dedans.
    //
    // Le carré parfait donnait des pavés de 85 px de haut : neuf options
    // occupaient tout l'écran avant même l'aperçu du plan, qu'on ne voyait
    // plus. La hauteur est fixe et courte, l'icône y gagne trois points —
    // ce qu'on doit reconnaître, c'est le dessin, pas la surface bleue.
    width: '100%',
    // Neuf options remplissaient l'écran avant même l'aperçu du plan.
    // Quarante points — relevé du patron : « réduis plus les blocs que
    // les icônes » ; la tuile perd six points, l'icône deux.
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  optionOn: { backgroundColor: c.blue },
  optionText: {
    color: c.inkFaint,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    marginTop: 3,
  },
  optionTextOn: { color: c.blue, fontWeight: '800' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 6,
    ...shadowCard,
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  switchLabel: {
    color: c.ink,
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 10,
  },
  // Zone centrale du modèle : les gouttières latérales restent au scroll.
  lockWrap: { marginHorizontal: 32 },
  fadeWrap: { flex: 1 },
  /** Le bloc « à qui est ce dossier », en tête de l'écran. */
  dossier: { flexDirection: 'row', gap: 10, marginBottom: 14 },
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
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dossierValeur: { color: c.ink, fontSize: 14.5, fontWeight: '700', marginTop: 3 },
  dossierVide: { color: c.inkFaint, fontWeight: '600' },
  sheetLabel: {
    color: c.inkSoft,
    fontSize: 12.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 6,
  },
  /* Le titre de feuille et son bouton « Retirer » sur la même ligne : le
     bouton se lit comme une action SUR cette feuille-là, pas sur la
     suivante. */
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  retirer: {
    color: c.danger,
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
  },
  ajouter: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.line,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  ajouterTexte: { color: c.blue, fontSize: 14.5, fontWeight: '700' },
  sheetCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: 6,
    ...shadowCard,
  },
  // Gouttières invisibles : les bandes latérales appartiennent au scroll,
  // seul le centre manipule le modèle.
  view3d: { height: 210, borderRadius: 14, overflow: 'hidden', marginHorizontal: 32 },
  view3dLast: { marginTop: 6 },
  hint: {
    color: c.inkFaint,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
  },
  exportButton: {
    backgroundColor: c.blue,
    marginBottom: 28,
    marginTop: 6,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    ...glow(c.blue),
  },
  exportText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
}));
