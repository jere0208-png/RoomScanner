import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
import { roomParts } from '../geometry/floorplan';
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
import { ClientTour } from '../components/ClientTour';
import { PlayCircle } from 'lucide-react-native';
import type { CeilingFixture } from '../geometry/ceiling';

interface PlanView {
  zoom: number;
  ox: number;
  oy: number;
}
const DEFAULT_PLAN: PlanView = { zoom: 1, ox: 0, oy: 0 };
const DEFAULT_V1: View3DParams = { ...DEFAULT_VIEW3D };
const DEFAULT_V2: View3DParams = { ...DEFAULT_VIEW3D, theta: 148, tilt: 42 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Aperçu interactif du plan 2D : un doigt déplace, deux doigts zooment.
 * Le cadrage choisi ici est reproduit tel quel dans le PDF.
 */
function PlanPreview({
  value,
  onChange,
  onBox,
  cotes,
  routes,
  ceiling,
}: {
  value: PlanView;
  onChange: (v: PlanView) => void;
  onBox: (b: { w: number; h: number }) => void;
  /**
   * Ce que le document portera vraiment.
   *
   * L'aperçu montrait TOUJOURS les cotes, quel que soit l'interrupteur : on
   * décochait « cotes sur le plan 2D » et rien ne changeait sous les yeux —
   * on ne pouvait donc vérifier son réglage qu'en ouvrant le PDF.
   */
  cotes: boolean;
  routes?: { id: string; path: { x: number; z: number }[] }[];
  /**
   * Les appareils de plafond, quand c'est la feuille du plafond qu'on
   * cadre. Un aperçu qui ne montre pas ce que la feuille portera ne sert
   * à rien — et laisse croire que la feuille n'existe pas.
   */
  ceiling?: CeilingFixture[];
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const baseRef = useRef({
    v: DEFAULT_PLAN,
    mode: 'pan' as 'pan' | 'pinch',
    dx0: 0,
    dy0: 0,
    d0: 1,
    mx0: 0,
    my0: 0,
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 3,
      onPanResponderGrant: (e, g) => {
        const t = e.nativeEvent.touches;
        baseRef.current = {
          v: valueRef.current,
          mode: t.length >= 2 ? 'pinch' : 'pan',
          dx0: g.dx,
          dy0: g.dy,
          d0:
            t.length >= 2
              ? Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY))
              : 1,
          mx0: t.length >= 2 ? (t[0].pageX + t[1].pageX) / 2 : 0,
          my0: t.length >= 2 ? (t[0].pageY + t[1].pageY) / 2 : 0,
        };
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        const mode = t.length >= 2 ? 'pinch' : 'pan';
        if (mode !== baseRef.current.mode) {
          baseRef.current = {
            v: valueRef.current,
            mode,
            dx0: g.dx,
            dy0: g.dy,
            d0:
              t.length >= 2
                ? Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY))
                : 1,
            mx0: t.length >= 2 ? (t[0].pageX + t[1].pageX) / 2 : 0,
            my0: t.length >= 2 ? (t[0].pageY + t[1].pageY) / 2 : 0,
          };
        }
        const base = baseRef.current;
        if (mode === 'pinch' && t.length >= 2) {
          const d = Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY));
          const mx = (t[0].pageX + t[1].pageX) / 2;
          const my = (t[0].pageY + t[1].pageY) / 2;
          changeRef.current({
            zoom: clamp(base.v.zoom * (d / base.d0), 0.4, 4),
            ox: base.v.ox + (mx - base.mx0),
            oy: base.v.oy + (my - base.my0),
          });
        } else {
          changeRef.current({
            zoom: base.v.zoom,
            ox: base.v.ox + (g.dx - base.dx0),
            oy: base.v.oy + (g.dy - base.dy0),
          });
        }
      },
    }),
  ).current;

  return (
    <View
      style={planStyles.box}
      onLayout={(e) =>
        onBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }>
      <View
        pointerEvents="none"
        style={[
          planStyles.inner,
          {
            transform: [
              { translateX: value.ox },
              { translateY: value.oy },
              { scale: value.zoom },
            ],
          },
        ]}>
        <FloorplanEditor
          showMeasures={cotes}
          cableRoutes={routes}
          ceiling={ceiling}
          showCeiling={!!ceiling}
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
        />
      </View>
      <View {...pan.panHandlers} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const planStyles = StyleSheet.create({
  box: { height: 380, borderRadius: 16, overflow: 'hidden' },
  inner: { flex: 1 },
});

export function ExportScreen() {
  const setScreen = useScanStore((s) => s.setScreen);
  const scanName = useScanStore((s) => s.scanName);
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const objects = useScanStore((s) => s.objects);
  const fixtures = useScanStore((s) => s.fixtures);
  const showOpeningColors = useScanStore((s) => s.showOpeningColors);
  const setShowOpeningColors = useScanStore((s) => s.setShowOpeningColors);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const setShowFurniture = useScanStore((s) => s.setShowFurniture);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const setShowSurfaces = useScanStore((s) => s.setShowSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const setShowTextures = useScanStore((s) => s.setShowTextures);
  const rooms = useScanStore((s) => s.rooms);
  const colorsAvailable = hasCapturedColors(
    walls,
    rooms.map((r) => r.floor),
  );
  const c = useTheme();
  /** Une case de la grille : icône, mot, état, bascule. */
type OptionDef = [keyof typeof EXPORT_ICONS, string, boolean, () => void];

/**
 * Icônes des options d'export, tracées en 24×24.
 *
 * Un mot sous chacune : l'icône seule se devine mal — « surfaces » et
 * « couleurs » se ressemblent trop —, et le mot seul reprend la place qu'on
 * cherchait justement à gagner.
 */
const EXPORT_ICONS = {
  vues3d: ['M12 3 l8 4.5 v9 L12 21 l-8 -4.5 v-9 z', 'M12 12 l8 -4.5', 'M12 12 v9', 'M12 12 L4 7.5'],
  metre: ['M4 5 h16 v14 H4 z', 'M4 12 h16', 'M12 5 v14'],
  plafond: ['M3.5 6 h17', 'M12 6 v3.5', 'M7.5 15 a4.5 4.5 0 0 1 9 0 z', 'M6 18.5 h12'],
  cotes2d: ['M3 12 h18', 'M6 9 v6', 'M18 9 v6', 'M9 4 h6 v3 H9 z'],
  cotes3d: ['M4 18 l6 -12 6 6 4 -4', 'M3 21 h18', 'M6 15 v6'],
  meubles: ['M4 17 v-5 a2 2 0 0 1 2 -2 h12 a2 2 0 0 1 2 2 v5', 'M4 17 h16', 'M6 17 v3', 'M18 17 v3'],
  surface: ['M4 6 h16 v12 H4 z', 'M8 10 h.01', 'M12 10 h.01', 'M16 10 h.01', 'M8 14 h.01', 'M12 14 h.01', 'M16 14 h.01'],
  ouvertures: ['M5 4 v16 h9 V4 z', 'M14 20 l5 2 V2 l-5 2', 'M8 12 h.01'],
  couleurs: ['M12 3 a9 9 0 1 0 0 18 h2 a2 2 0 0 0 0 -4 h-1 a2 2 0 0 1 0 -4 h3 a4 4 0 0 0 0 -8 z', 'M8 9 h.01', 'M12 7 h.01'],
  gaines: ['M4 20 h9 a3 3 0 0 0 3 -3 V7', 'M13 4 h6 v3 h-6 z', 'M4 17.5 v5'],
  // Élévation : un mur vu de face, sa cote au-dessus, une prise dessus.
  elevations: [
    'M4 19 h16',
    'M5 19 V8 h14 v11',
    'M4 5.5 h16',
    'M4 4 v3',
    'M20 4 v3',
    'M10.5 13.5 h3 v3 h-3 z',
  ],
  // Schémas : un peigne de tableau, deux départs sous une barre.
  schema: ['M12 3 v4', 'M4 7 h16', 'M8 7 v4', 'M16 7 v4', 'M6 11 h4 v6 H6 z', 'M14 11 h4 v6 h-4 z'],
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
  const ceiling = useScanStore((s) => s.ceiling);
  /** La feuille d'implantation du plafond, avec ses liens de commande. */
  const [plafond, setPlafond] = useState(true);
  const photos = useScanStore((s) => s.photos);
  const north = useScanStore((s) => s.north);
  /**
   * LES ÉLÉVATIONS : un mur vu de face par feuille.
   *
   * Décochées par défaut, et ce n'est pas de la prudence : elles font une
   * feuille PAR MUR. C'est le dossier qu'on emporte sur le chantier, pas
   * celui qu'on envoie au client.
   */
  const [elevations, setElevations] = useState(false);
  /** La visite guidée, plein écran : ce qu'on montre au client. */
  const [visite, setVisite] = useState(false);
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
  const [plan, setPlan] = useState<PlanView>(DEFAULT_PLAN);
  const [v1, setV1] = useState<View3DParams>(DEFAULT_V1);
  const [v2, setV2] = useState<View3DParams>(DEFAULT_V2);
  const planBox = useRef({ w: 1, h: 1 });
  const box1 = useRef({ w: 1, h: 1 });
  const box2 = useRef({ w: 1, h: 1 });

  const reset = () => {
    setPlan(DEFAULT_PLAN);
    setV1(DEFAULT_V1);
    setV2(DEFAULT_V2);
  };

  const doExport = async () => {
    try {
      /**
       * Les photos, relues et réduites AVANT de bâtir le document.
       *
       * Une par mur, la dernière prise : deux vignettes de la même
       * cloison n'apprennent rien de plus, et chacune pèse dans le
       * fichier qu'on enverra par messagerie. Celle qui ne se relit pas
       * — fichier effacé hors de l'app — est simplement absente : sa
       * feuille sort sans elle.
       */
      const vignettes: { wallId: string; base64: string }[] = [];
      if (elevations) {
        const vues = new Set<string>();
        for (const ph of [...photos].sort((a, b) => b.at - a.at)) {
          if (vues.has(ph.wallId)) continue;
          vues.add(ph.wallId);
          const b64 = await RoomScan.readPhoto(ph.path, 900);
          if (b64) vignettes.push({ wallId: ph.wallId, base64: b64 });
        }
      }
      const conv = (v: View3DParams, b: { w: number; h: number }) => ({
        theta: v.theta,
        tilt: v.tilt,
        zoom: v.zoom,
        fx: v.ox / (b.w / 2),
        fy: v.oy / (b.h / 2),
      });
      const bytes = buildScanPdf(
        {
          name: scanName,
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
        },
        include3D,
        {
          plan: {
            zoom: plan.zoom,
            fx: plan.ox / (planBox.current.w / 2),
            fy: plan.oy / (planBox.current.h / 2),
          },
          views: [conv(v1, box1.current), conv(v2, box2.current)],
          colorOpenings: showOpeningColors,
          measures2D,
          measures3D,
          schemas: schema ? schemas : null,
          // Le plafond ne s'impose pas : il fait une feuille de plus, et
          // tout le monde n'équipe pas les plafonds.
          ceiling: plafond ? ceiling : undefined,
          surfaces: showSurfaces,
          textures: showTextures,
          metre: includeMetre,
          elevations,
        },
      );
      await RoomScan.sharePDF(toBase64(bytes), pdfFilename(scanName));
    } catch (e: any) {
      Alert.alert('Export impossible', e?.message ?? 'Erreur inconnue');
    }
  };

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
        <TouchableOpacity style={styles.roundButton} onPress={() => setScreen('result')}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Aperçu du PDF</Text>
        <TouchableOpacity style={[styles.roundButton, styles.resetButton]} onPress={reset}>
          <Text style={styles.resetIcon}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollEnabled={!scrollLocked}>
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
                <Svg width={26} height={26} viewBox="0 0 24 24">
                  {EXPORT_ICONS[icon].map((d) => (
                    <Path
                      key={d}
                      d={d}
                      stroke={actif ? '#FFFFFF' : c.ink}
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
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
            ? "Feuille 1 · Plan d'ensemble et plafond"
            : "Feuille 1 · Plan d'ensemble"}
        </Text>
        <View style={styles.sheetCard}>
          {/* Le verrou de scroll ne couvre QUE la zone centrale du modèle */}
          <View {...lockProps} style={styles.lockWrap}>
            <PlanPreview
              cotes={measures2D}
              routes={gaines || schema ? cheminements?.traces : undefined}
              ceiling={avecPlafond ? ceiling : undefined}
              value={plan}
              onChange={setPlan}
              onBox={(b) => {
                planBox.current = b;
              }}
            />
          </View>
        </View>

        {include3D && (
          <>
            <Text style={styles.sheetLabel}>
              {`Feuille ${(includeMetre ? 1 : 0) + 2} · Vues 3D`}
            </Text>
            <View style={styles.sheetCard}>
              <View
                {...lockProps}
                style={styles.view3d}
                onLayout={(e) => {
                  box1.current = {
                    w: e.nativeEvent.layout.width,
                    h: e.nativeEvent.layout.height,
                  };
                }}>
                <Iso3DView value={v1} onChange={setV1} showMeasures={measures3D} />
              </View>
              <View
                {...lockProps}
                style={[styles.view3d, styles.view3dLast]}
                onLayout={(e) => {
                  box2.current = {
                    w: e.nativeEvent.layout.width,
                    h: e.nativeEvent.layout.height,
                  };
                }}>
                <Iso3DView value={v2} onChange={setV2} showMeasures={measures3D} />
              </View>
            </View>
          </>
        )}

        <Text style={styles.hint}>
          Cadrez chaque vue comme vous voulez la voir dans le PDF : un doigt
          pour déplacer (ou tourner en 3D), deux doigts pour zoomer. ↻ remet
          tout à zéro.
        </Text>
      </ScrollView>

      {/*
        DEUX SORTIES, DEUX PUBLICS.

        Le PDF part chez le fournisseur et sur le chantier ; il ne se montre
        pas à un client dans son salon. La visite guidée, elle, joue le
        relevé toute seule — le logement tourne, la caméra s'arrête sur
        chaque pièce puis face à chaque mur équipé, et un carton annonce ce
        qu'on regarde. On lance, et on laisse regarder.
      */}
      <View style={styles.sorties}>
        <TouchableOpacity
          style={styles.visiteButton}
          onPress={() => setVisite(true)}>
          <PlayCircle size={19} color={c.blue} strokeWidth={2.2} />
          <Text style={styles.visiteText}>Présentation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportButton} onPress={doExport}>
          <Text style={styles.exportText}>Exporter le PDF</Text>
        </TouchableOpacity>
      </View>
      <ClientTour visible={visite} onClose={() => setVisite(false)} />
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
  backChevron: { color: c.ink, fontSize: 24, fontWeight: '600', marginTop: -3 },
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
    // À 46 px, les trois rangées tiennent dans ce que prenaient deux.
    height: 46,
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
  sheetLabel: {
    color: c.inkSoft,
    fontSize: 12.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 6,
  },
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
  sorties: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 6,
  },
  /** La visite : une sortie SECONDAIRE, en creux — le PDF reste l'acte. */
  visiteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  visiteText: { color: c.blue, fontSize: 14.5, fontWeight: '800' },
  exportButton: {
    flex: 1,
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    ...glow(c.blue),
  },
  exportText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
}));
