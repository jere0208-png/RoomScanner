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
import { colors } from '../theme';
import {
  bounds,
  makeMapping,
  segLength,
  toFootprint,
  type Mapping,
  type WallSeg,
} from '../geometry/floorplan';
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
  const [layout, setLayout] = useState({ w: 0, h: 0 });

  // Cadrage figé sur le scan chargé (pas sur les éditions),
  // sinon le plan "respire" pendant qu'on déplace un coin.
  const mapping = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    return makeMapping(bounds(walls), layout.w, layout.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSaveId, layout.w, layout.h]);

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
      }>
      {mapping && (
        <>
          <Svg width={layout.w} height={layout.h}>
            <Defs>
              <Pattern id="grid" width={22} height={22} patternUnits="userSpaceOnUse">
                <Circle cx={1.2} cy={1.2} r={1.2} fill={colors.line} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={layout.w} height={layout.h} fill="url(#grid)" />

            {/* Objets (empreintes au sol) */}
            {objects.map((o) => {
              const f = toFootprint(o);
              const c = mapping.toPx({ x: f.cx, z: f.cz });
              const w = f.width * mapping.scale;
              const d = f.depth * mapping.scale;
              return (
                <G
                  key={f.id}
                  transform={`translate(${c.x}, ${c.y}) rotate(${(f.yaw * 180) / Math.PI})`}>
                  <Rect
                    x={-w / 2}
                    y={-d / 2}
                    width={w}
                    height={d}
                    fill={colors.blueSoft}
                    stroke={colors.lineStrong}
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
              const color = o.type === 'door' ? colors.amber : colors.sky;
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
            corners.map((c) => (
              <CornerHandle
                key={`${c.wallId}-${c.end}`}
                corner={c}
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
  mapping: Mapping;
  showMeasure: boolean;
  selected: boolean;
  onPress?: () => void;
}) {
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
        stroke={selected ? colors.blue : colors.ink}
        strokeWidth={selected ? 8 : 6}
        strokeLinecap="round"
      />
      {showMeasure && (
        <SvgText
          x={mid.x}
          y={mid.y + 3}
          fill={selected ? colors.blue : colors.inkSoft}
          fontSize={selected ? 11 : 10}
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
  mapping: Mapping;
}) {
  const startRef = useRef({ x: corner.x, z: corner.z });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = { x: corner.x, z: corner.z };
        },
        onPanResponderMove: (_e, g) => {
          useScanStore.getState().moveWallPoint(corner.wallId, corner.end, {
            x: startRef.current.x + g.dx / mapping.scale,
            z: startRef.current.z + g.dy / mapping.scale,
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.blue,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#0B0D12',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
