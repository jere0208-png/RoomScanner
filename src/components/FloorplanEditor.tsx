import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Pattern,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { themedStyles, useTheme, type Palette } from '../theme';
import {
  bounds,
  makeMapping,
  segLength,
  toFootprint,
  type WallSeg,
} from '../geometry/floorplan';

interface EffMapping {
  scale: number;
  toPx: (p: { x: number; z: number }) => { x: number; y: number };
  deltaToMeters: (dx: number, dy: number) => { x: number; z: number };
}
import { useScanStore } from '../store/scanStore';

interface Props {
  /** Cotes visibles le long des murs. */
  showMeasures: boolean;
  /** Mode édition : sélection des murs + poignées de coin. */
  editable: boolean;
  selectedWallId: string | null;
  onSelectWall: (id: string | null) => void;
}

/**
 * Plan 2D vu de dessus, dérivé du store (source de vérité paramétrique).
 * En lecture : plan épuré, cotes discrètes. En édition : murs sélectionnables
 * et coins déplaçables (les murs soudés au même coin suivent).
 */
export function FloorplanEditor({
  showMeasures,
  editable,
  selectedWallId,
  onSelectWall,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const objects = useScanStore((s) => s.objects);
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const c = useTheme();
  const styles = getStyles(c);
  const [layout, setLayout] = useState({ w: 0, h: 0 });

  // Navigation du plan : zoom (pincer), déplacement (glisser), rotation (torsion).
  const [view, setView] = useState({ zoom: 1, ox: 0, oy: 0, rot: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const navBase = useRef({
    v: { zoom: 1, ox: 0, oy: 0, rot: 0 },
    mode: 'pan' as 'pan' | 'pinch',
    dx0: 0,
    dy0: 0,
    d0: 1,
    mx0: 0,
    my0: 0,
    a0: 0,
  });
  const touchAngle = (t: { pageX: number; pageY: number }[]) =>
    Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX);
  const snapshot = (e: any, g: any) => {
    const t = e.nativeEvent.touches;
    navBase.current = {
      v: viewRef.current,
      mode: t.length >= 2 ? 'pinch' : 'pan',
      dx0: g.dx,
      dy0: g.dy,
      d0:
        t.length >= 2
          ? Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY))
          : 1,
      mx0: t.length >= 2 ? (t[0].pageX + t[1].pageX) / 2 : 0,
      my0: t.length >= 2 ? (t[0].pageY + t[1].pageY) / 2 : 0,
      a0: t.length >= 2 ? touchAngle(t) : 0,
    };
  };
  const nav = useRef(
    PanResponder.create({
      // Ne prend la main QUE sur un mouvement : les taps (sélection de mur)
      // et les poignées de coin gardent la priorité.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderGrant: snapshot,
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        const mode = t.length >= 2 ? 'pinch' : 'pan';
        if (mode !== navBase.current.mode) snapshot(e, g);
        const base = navBase.current;
        if (mode === 'pinch' && t.length >= 2) {
          const d = Math.max(
            8,
            Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY),
          );
          const mx = (t[0].pageX + t[1].pageX) / 2;
          const my = (t[0].pageY + t[1].pageY) / 2;
          let twist = touchAngle(t) - base.a0;
          if (twist > Math.PI) twist -= 2 * Math.PI;
          if (twist < -Math.PI) twist += 2 * Math.PI;
          setView({
            zoom: Math.min(6, Math.max(0.4, base.v.zoom * (d / base.d0))),
            ox: base.v.ox + (mx - base.mx0),
            oy: base.v.oy + (my - base.my0),
            rot: base.v.rot + twist,
          });
        } else {
          setView({
            ...base.v,
            ox: base.v.ox + (g.dx - base.dx0),
            oy: base.v.oy + (g.dy - base.dy0),
          });
        }
      },
    }),
  ).current;

  // Cadrage figé sur le scan chargé (pas sur les éditions),
  // sinon le plan "respire" pendant qu'on déplace un coin.
  const baseMapping = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    return makeMapping(bounds(walls), layout.w, layout.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSaveId, layout.w, layout.h]);

  // Cadrage composite : ajustement au canevas + navigation utilisateur.
  const mapping = useMemo(() => {
    if (!baseMapping) return null;
    const cx = layout.w / 2;
    const cy = layout.h / 2;
    const cos = Math.cos(view.rot);
    const sin = Math.sin(view.rot);
    const scale = baseMapping.scale * view.zoom;
    return {
      scale,
      toPx: (p: { x: number; z: number }) => {
        const b = baseMapping.toPx(p);
        const dx = (b.x - cx) * view.zoom;
        const dy = (b.y - cy) * view.zoom;
        return {
          x: cx + dx * cos - dy * sin + view.ox,
          y: cy + dx * sin + dy * cos + view.oy,
        };
      },
      /** Déplacement écran → déplacement monde (m), rotation/zoom déduits. */
      deltaToMeters: (dx: number, dy: number) => ({
        x: (dx * cos + dy * sin) / scale,
        z: (-dx * sin + dy * cos) / scale,
      }),
    };
  }, [baseMapping, view, layout]);

  // Coins uniques (les extrémités soudées partagent les mêmes coordonnées).
  const corners = useMemo(() => {
    const seen = new Map<string, { x: number; z: number; wallId: string; end: 'a' | 'b' }>();
    for (const w of walls) {
      for (const end of ['a', 'b'] as const) {
        const p = w[end];
        const key = `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
        if (!seen.has(key)) seen.set(key, { x: p.x, z: p.z, wallId: w.id, end });
      }
    }
    return [...seen.values()];
  }, [walls]);

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setLayout({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      {...nav.panHandlers}>
      {mapping && (
        <>
          <Svg width={layout.w} height={layout.h}>
            <Defs>
              <Pattern id="grid" width={22} height={22} patternUnits="userSpaceOnUse">
                <Circle cx={1.2} cy={1.2} r={1.2} fill={c.line} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={layout.w} height={layout.h} fill="url(#grid)" />

            {/* Objets (empreintes au sol) */}
            {objects.map((o) => {
              const f = toFootprint(o);
              const ctr = mapping.toPx({ x: f.cx, z: f.cz });
              const w = f.width * mapping.scale;
              const d = f.depth * mapping.scale;
              return (
                <G
                  key={f.id}
                  transform={`translate(${ctr.x}, ${ctr.y}) rotate(${((f.yaw + view.rot) * 180) / Math.PI})`}>
                  <Rect
                    x={-w / 2}
                    y={-d / 2}
                    width={w}
                    height={d}
                    fill={c.blueSoft}
                    stroke={c.lineStrong}
                    strokeWidth={1}
                    rx={3}
                  />
                </G>
              );
            })}

            {/* Murs */}
            {walls.map((w) => (
              <WallLine
                key={w.id}
                wall={w}
                mapping={mapping}
                showMeasure={showMeasures}
                selected={editable && w.id === selectedWallId}
                onPress={
                  editable
                    ? () => onSelectWall(w.id === selectedWallId ? null : w.id)
                    : undefined
                }
              />
            ))}

            {/* Portes / fenêtres / ouvertures */}
            {openings.map((o) => {
              const a = mapping.toPx(o.a);
              const b = mapping.toPx(o.b);
              const color = colorOpenings
                ? o.type === 'door'
                  ? c.amber
                  : c.sky
                : c.inkFaint;
              return (
                <Line
                  key={o.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={color}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              );
            })}
          </Svg>

          {/* Poignées de coin, uniquement en mode édition */}
          {editable &&
            corners.map((pt) => (
              <CornerHandle
                key={`${pt.wallId}-${pt.end}`}
                corner={pt}
                mapping={mapping}
              />
            ))}
        </>
      )}
    </View>
  );
}

function WallLine({
  wall,
  mapping,
  showMeasure,
  selected,
  onPress,
}: {
  wall: WallSeg;
  mapping: EffMapping;
  showMeasure: boolean;
  selected: boolean;
  onPress?: () => void;
}) {
  const c = useTheme();
  const a = mapping.toPx(wall.a);
  const b = mapping.toPx(wall.b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const norm = Math.hypot(dx, dy) || 1;

  // Cote : petit texte posé le long du mur, sans cadre, jamais à l'envers.
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  let n = { x: -dy / norm, y: dx / norm };
  if (n.y > 0) n = { x: -n.x, y: -n.y }; // toujours du côté "haut" écran
  const mid = { x: (a.x + b.x) / 2 + n.x * 11, y: (a.y + b.y) / 2 + n.y * 11 };
  const label = `${segLength(wall).toFixed(2).replace('.', ',')} m`;

  return (
    <G onPress={onPress}>
      {/* Zone de toucher élargie, invisible */}
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={30} />
      <Line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={selected ? c.blue : c.ink}
        strokeWidth={6}
        strokeLinecap="round"
      />
      {showMeasure && (
        <SvgText
          x={mid.x}
          y={mid.y + 3}
          fill={selected ? c.blue : c.inkSoft}
          fontSize={10}
          fontWeight="600"
          textAnchor="middle"
          transform={`rotate(${angle}, ${mid.x}, ${mid.y})`}>
          {label}
        </SvgText>
      )}
    </G>
  );
}

function CornerHandle({
  corner,
  mapping,
}: {
  corner: { x: number; z: number; wallId: string; end: 'a' | 'b' };
  mapping: EffMapping;
}) {
  const styles = getStyles(useTheme());
  const startRef = useRef({ x: corner.x, z: corner.z });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = { x: corner.x, z: corner.z };
        },
        onPanResponderMove: (_e, g) => {
          const d = mapping.deltaToMeters(g.dx, g.dy);
          useScanStore.getState().moveWallPoint(corner.wallId, corner.end, {
            x: startRef.current.x + d.x,
            z: startRef.current.z + d.z,
          });
        },
      }),
    [corner.wallId, corner.end, corner.x, corner.z, mapping],
  );

  const px = mapping.toPx(corner);
  return (
    <View
      {...pan.panHandlers}
      style={[styles.handle, { left: px.x - 16, top: px.y - 16 }]}>
      <View style={styles.handleDot} />
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: c.blue,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#0B0D12',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
}));
