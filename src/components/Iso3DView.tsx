import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { colors } from '../theme';
import {
  closedLoop,
  toFootprint,
  type WallSeg,
} from '../geometry/floorplan';
import { useScanStore } from '../store/scanStore';

interface P3 {
  x: number;
  y: number;
  z: number;
}

interface Face {
  pts: P3[];
  fill: string;
  stroke: string;
  /** Biais de tri (m) : les ouvertures se dessinent juste devant leur mur. */
  bias?: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Mélange linéaire de deux couleurs hex. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Vue 3D axonométrique du scan, dérivée des mêmes données paramétriques
 * que le plan 2D : murs extrudés, portes/fenêtres, meubles. Un doigt pour
 * tourner (horizontal) et incliner (vertical). Aucune dépendance native.
 */
export function Iso3DView() {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const objects = useScanStore((s) => s.objects);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [theta, setTheta] = useState(-32);
  const [tilt, setTilt] = useState(58);
  const startAngles = useRef({ theta: -32, tilt: 58 });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startAngles.current = { theta, tilt };
        },
        onPanResponderMove: (_e, g) => {
          setTheta(startAngles.current.theta + g.dx * 0.45);
          setTilt(Math.min(80, Math.max(18, startAngles.current.tilt - g.dy * 0.3)));
        },
      }),
    [theta, tilt],
  );

  // Niveau du sol : base du mur le plus bas (repère monde RoomPlan).
  const floorY = useMemo(() => {
    if (walls.length === 0) return 0;
    return Math.min(...walls.map((w) => w.yCenter - w.height / 2));
  }, [walls]);

  const faces = useMemo(() => {
    const list: { face: Face; isFloor: boolean }[] = [];

    // Sol : la boucle fermée si elle existe, sinon rien.
    const loop = closedLoop(walls);
    if (loop) {
      list.push({
        isFloor: true,
        face: {
          pts: loop.map((p) => ({ x: p.x, y: 0, z: p.z })),
          fill: colors.surfaceSunken,
          stroke: colors.lineStrong,
        },
      });
    }

    const wallQuad = (w: WallSeg, yBase: number, yTop: number): P3[] => [
      { x: w.a.x, y: yBase, z: w.a.z },
      { x: w.b.x, y: yBase, z: w.b.z },
      { x: w.b.x, y: yTop, z: w.b.z },
      { x: w.a.x, y: yTop, z: w.a.z },
    ];

    for (const w of walls) {
      list.push({
        isFloor: false,
        face: {
          pts: wallQuad(w, 0, w.height),
          fill: '#FFFFFF', // ré-ombré à la projection selon l'orientation
          stroke: '#8A94A6',
        },
      });
    }

    for (const o of openings) {
      const yBase = Math.max(0, o.yCenter - o.height / 2 - floorY);
      list.push({
        isFloor: false,
        face: {
          pts: wallQuad(o, yBase, yBase + o.height),
          fill: o.type === 'door' ? colors.amber : colors.sky,
          stroke: 'none',
          bias: 0.04,
        },
      });
    }

    for (const obj of objects.map(toFootprint)) {
      const c = Math.cos(obj.yaw);
      const s = Math.sin(obj.yaw);
      const hw = obj.width / 2;
      const hd = obj.depth / 2;
      const corners = [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ].map(([lx, lz]) => ({
        x: obj.cx + lx * c - lz * s,
        z: obj.cz + lx * s + lz * c,
      }));
      const yBase = Math.max(0, obj.yCenter - obj.height / 2 - floorY);
      const yTop = yBase + obj.height;
      for (let i = 0; i < 4; i++) {
        const p = corners[i];
        const q = corners[(i + 1) % 4];
        list.push({
          isFloor: false,
          face: {
            pts: [
              { x: p.x, y: yBase, z: p.z },
              { x: q.x, y: yBase, z: q.z },
              { x: q.x, y: yTop, z: q.z },
              { x: p.x, y: yTop, z: p.z },
            ],
            fill: '#D8E1F2',
            stroke: '#9FACBF',
          },
        });
      }
      list.push({
        isFloor: false,
        face: {
          pts: corners.map((p) => ({ x: p.x, y: yTop, z: p.z })),
          fill: '#E9EEF9',
          stroke: '#9FACBF',
        },
      });
    }

    return list;
  }, [walls, openings, objects, floorY]);

  // Centre et rayon englobant en 3D : l'échelle reste stable en rotation.
  const { center, radius3d } = useMemo(() => {
    const all = faces.flatMap((f) => f.face.pts);
    if (all.length === 0) {
      return { center: { x: 0, y: 0, z: 0 }, radius3d: 1 };
    }
    const c = {
      x: all.reduce((s, p) => s + p.x, 0) / all.length,
      y: all.reduce((s, p) => s + p.y, 0) / all.length,
      z: all.reduce((s, p) => s + p.z, 0) / all.length,
    };
    const r = Math.max(
      0.5,
      ...all.map((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)),
    );
    return { center: c, radius3d: r };
  }, [faces]);

  const rendered = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    const ct = Math.cos(rad(theta));
    const st = Math.sin(rad(theta));
    const cp = Math.cos(rad(tilt));
    const sp = Math.sin(rad(tilt));
    const scale = (Math.min(layout.w, layout.h) * 0.44) / radius3d;

    const project = (p: P3) => {
      const x = p.x - center.x;
      const y = p.y - center.y;
      const z = p.z - center.z;
      const rx = x * ct - z * st;
      const rz = x * st + z * ct;
      return {
        sx: layout.w / 2 + rx * scale,
        sy: layout.h / 2 + (rz * cp - y * sp) * scale,
        depth: rz * sp + y * cp,
      };
    };

    const polys = faces.map(({ face, isFloor }) => {
      const proj = face.pts.map(project);
      const depth = isFloor
        ? -Infinity
        : proj.reduce((s, p) => s + p.depth, 0) / proj.length + (face.bias ?? 0);

      let fill = face.fill;
      if (fill === '#FFFFFF') {
        // Ombrage des murs : plus la face est frontale, plus elle est claire.
        const a = face.pts[0];
        const b = face.pts[1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        // Normale du mur tournée en repère vue ; sa composante caméra fait la lumière.
        const facing = Math.abs(((-dz / len) * st + (dx / len) * ct));
        fill = mix('#C7D0DD', '#FBFCFE', facing);
      }

      return { proj, depth, fill, stroke: face.stroke };
    });

    polys.sort((p, q) => p.depth - q.depth);
    return polys;
  }, [faces, layout, theta, tilt, center, radius3d]);

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setLayout({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      {...pan.panHandlers}>
      {rendered && (
        <Svg width={layout.w} height={layout.h}>
          {rendered.map((p, i) => (
            <Polygon
              key={i}
              points={p.proj.map((q) => `${q.sx},${q.sy}`).join(' ')}
              fill={p.fill}
              stroke={p.stroke}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      )}
      <View style={styles.hintPill} pointerEvents="none">
        <Text style={styles.hintText}>Glissez pour tourner</Text>
      </View>
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
  hintPill: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  hintText: { color: colors.inkFaint, fontSize: 11, fontWeight: '600' },
});
