import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import {
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
import { floorsOf, useScanStore } from '../store/scanStore';

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
}: {
  value: PlanView;
  onChange: (v: PlanView) => void;
  onBox: (b: { w: number; h: number }) => void;
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
          showMeasures
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
  const styles = getStyles(c);

  const [include3D, setInclude3D] = useState(true);
  const [measures2D, setMeasures2D] = useState(true);
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
          floors: floorsOf(rooms),
          roomNames: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
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
          surfaces: showSurfaces,
          textures: showTextures,
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
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Inclure des vues 3D</Text>
          <Switch value={include3D} onValueChange={setInclude3D} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>
            Afficher la couleur des portes et fenêtres
          </Text>
          <Switch value={showOpeningColors} onValueChange={setShowOpeningColors} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Inclure les meubles</Text>
          <Switch value={showFurniture} onValueChange={setShowFurniture} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>
            Surface au sol (fond pointillé et m²)
          </Text>
          <Switch value={showSurfaces} onValueChange={setShowSurfaces} />
        </View>
        {colorsAvailable && (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              Couleurs et textures relevées au scan
            </Text>
            <Switch value={showTextures} onValueChange={setShowTextures} />
          </View>
        )}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Cotes sur le plan 2D</Text>
          <Switch value={measures2D} onValueChange={setMeasures2D} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Cotes sur les vues 3D</Text>
          <Switch value={measures3D} onValueChange={setMeasures3D} />
        </View>

        <Text style={styles.sheetLabel}>Feuille 1 · Plan d'ensemble</Text>
        <View style={styles.sheetCard}>
          {/* Le verrou de scroll ne couvre QUE la zone centrale du modèle */}
          <View {...lockProps} style={styles.lockWrap}>
            <PlanPreview
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
            <Text style={styles.sheetLabel}>Feuille 2 · Vues 3D</Text>
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
                <Iso3DView value={v1} onChange={setV1} />
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
                <Iso3DView value={v2} onChange={setV2} />
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

      <TouchableOpacity style={styles.exportButton} onPress={doExport}>
        <Text style={styles.exportText}>Exporter le PDF</Text>
      </TouchableOpacity>
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
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
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
  exportButton: {
    backgroundColor: c.blue,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 6,
    shadowColor: c.blue,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  exportText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
}));
