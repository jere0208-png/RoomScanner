import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
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
  selectedWallId: string | null;
  onSelectWall: (id: string | null) => void;
}

/**
 * Plan 2D vu de dessus, dérivé du store (source de vérité paramétrique).
 * Les coins se déplacent au doigt ; les murs soudés au même coin suivent.
 */
export function FloorplanEditor({ selectedWallId, onSelectWall }: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const objects = useScanStore((s) => s.objects);
  const modelPath = useScanStore((s) => s.modelPath);
  const [layout, setLayout] = useState({ w: 0, h: 0 });

  // Cadrage figé sur le résultat du scan (pas sur les éditions),
  // sinon le plan "respire" pendant qu'on déplace un coin.
  const mapping = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    return makeMapping(bounds(walls), layout.w, layout.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelPath, layout.w, layout.h]);

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
                    fill="#2a3444"
                    stroke="#3d4a5f"
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
                selected={w.id === selectedWallId}
                onPress={() =>
                  onSelectWall(w.id === selectedWallId ? null : w.id)
                }
              />
            ))}

            {/* Portes / fenêtres / ouvertures */}
            {openings.map((o) => {
              const a = mapping.toPx(o.a);
              const b = mapping.toPx(o.b);
              const color = o.type === 'door' ? '#e8b04b' : '#5bc8f5';
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

          {/* Poignées de coin (Views absolues : PanResponder simple et fiable) */}
          {corners.map((c) => (
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
  selected,
  onPress,
}: {
  wall: WallSeg;
  mapping: Mapping;
  selected: boolean;
  onPress: () => void;
}) {
  const a = mapping.toPx(wall.a);
  const b = mapping.toPx(wall.b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = segLength(wall);
  // Décale la cote perpendiculairement au mur pour ne pas la poser dessus.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const norm = Math.hypot(dx, dy) || 1;
  const off = { x: (-dy / norm) * 14, y: (dx / norm) * 14 };

  return (
    <G onPress={onPress}>
      {/* Zone de toucher élargie, invisible */}
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={28} />
      <Line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={selected ? '#2f6df6' : '#e6edf5'}
        strokeWidth={selected ? 8 : 6}
        strokeLinecap="round"
      />
      <SvgText
        x={mid.x + off.x}
        y={mid.y + off.y}
        fill={selected ? '#7ea6ff' : '#9aa4b2'}
        fontSize={12}
        fontWeight="600"
        textAnchor="middle">
        {len.toFixed(2)} m
      </SvgText>
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
  container: { flex: 1, backgroundColor: '#151a21', borderRadius: 16, overflow: 'hidden' },
  handle: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2f6df6',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
