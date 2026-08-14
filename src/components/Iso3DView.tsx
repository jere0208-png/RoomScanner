import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { themedStyles, useTheme, type Palette } from '../theme';
import { closedLoop, toFootprint } from '../geometry/floorplan';
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
  /** 'auto' : ombrage recalculé selon l'orientation à la projection. */
  shade?: boolean;
  /** Biais de tri (m) : les ouvertures se dessinent juste devant leur mur. */
  bias?: number;
  isFloor?: boolean;
}

/** Épaisseur donnée aux murs dans la vue 3D (m). */
const WALL_T = 0.14;

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mélange linéaire de deux couleurs hex. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp(t, 0, 1)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Vue 3D axonométrique du scan, dérivée des mêmes données paramétriques
 * que le plan 2D : murs épais extrudés, portes/fenêtres, meubles.
 * Un doigt : horizontal pour tourner, vertical pour incliner.
 */
export function Iso3DView() {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const objects = useScanStore((s) => s.objects);
  const c = useTheme();
  const styles = getStyles(c);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [angles, setAngles] = useState({ theta: -32, tilt: 58 });
  const anglesRef = useRef(angles);
  const grabRef = useRef(angles);

  // Créé UNE seule fois : un responder recréé en plein geste perd le suivi.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        grabRef.current = anglesRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const next = {
          // Glisser à droite « pousse » la face avant vers la droite.
          theta: grabRef.current.theta - g.dx * 0.45,
          tilt: clamp(grabRef.current.tilt - g.dy * 0.3, 15, 80),
        };
        anglesRef.current = next;
        setAngles(next);
      },
    }),
  ).current;

  // Niveau du sol : base du mur le plus bas (repère monde RoomPlan).
  const floorY = useMemo(() => {
    if (walls.length === 0) return 0;
    return Math.min(...walls.map((w) => w.yCenter - w.height / 2));
  }, [walls]);

  const faces = useMemo(() => {
    const list: Face[] = [];

    // Sol : la boucle fermée si elle existe.
    const loop = closedLoop(walls);
    if (loop) {
      list.push({
        pts: loop.map((p) => ({ x: p.x, y: 0, z: p.z })),
        fill: c.surfaceSunken,
        stroke: c.lineStrong,
        isFloor: true,
      });
    }

    const vquad = (
      p: { x: number; z: number },
      q: { x: number; z: number },
      yBase: number,
      yTop: number,
    ): P3[] => [
      { x: p.x, y: yBase, z: p.z },
      { x: q.x, y: yBase, z: q.z },
      { x: q.x, y: yTop, z: q.z },
      { x: p.x, y: yTop, z: p.z },
    ];

    // Murs épais : boîte (2 longs pans, 2 chants, 1 dessus).
    for (const w of walls) {
      const dx = w.b.x - w.a.x;
      const dz = w.b.z - w.a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * (WALL_T / 2);
      const nz = (dx / len) * (WALL_T / 2);
      const a1 = { x: w.a.x + nx, z: w.a.z + nz };
      const a2 = { x: w.a.x - nx, z: w.a.z - nz };
      const b1 = { x: w.b.x + nx, z: w.b.z + nz };
      const b2 = { x: w.b.x - nx, z: w.b.z - nz };

      const sides: [typeof a1, typeof a1][] = [
        [a1, b1],
        [b2, a2],
        [a2, a1],
        [b1, b2],
      ];
      for (const [p, q] of sides) {
        list.push({
          pts: vquad(p, q, 0, w.height),
          fill: '#FFFFFF',
          stroke: '#8A94A6',
          shade: true,
        });
      }
      list.push({
        pts: [a1, b1, b2, a2].map((p) => ({ x: p.x, y: w.height, z: p.z })),
        fill: '#F4F7FB',
        stroke: '#94A0B4',
      });
    }

    // Portes / fenêtres : posées sur le mur, à leur vraie hauteur.
    for (const o of openings) {
      const yBase = Math.max(0, o.yCenter - o.height / 2 - floorY);
      list.push({
        pts: vquad(o.a, o.b, yBase, yBase + o.height),
        fill: o.type === 'door' ? c.amber : c.sky,
        stroke: 'none',
        bias: 0.12,
      });
    }

    // Meubles : boîtes grises-bleutées.
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
        list.push({
          pts: vquad(corners[i], corners[(i + 1) % 4], yBase, yTop),
          fill: '#D8E1F2',
          stroke: '#9FACBF',
        });
      }
      list.push({
        pts: corners.map((p) => ({ x: p.x, y: yTop, z: p.z })),
        fill: '#E9EEF9',
        stroke: '#9FACBF',
      });
    }

    return list;
  }, [walls, openings, objects, floorY, c]);

  // Centre et rayon englobants en 3D : l'échelle reste stable en rotation.
  const { center, radius3d } = useMemo(() => {
    const all = faces.flatMap((f) => f.pts);
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
    const ct = Math.cos(rad(angles.theta));
    const st = Math.sin(rad(angles.theta));
    const cp = Math.cos(rad(angles.tilt));
    const sp = Math.sin(rad(angles.tilt));
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

    const polys = faces.map((face) => {
      const proj = face.pts.map(project);
      const depth = face.isFloor
        ? -Infinity
        : proj.reduce((s, p) => s + p.depth, 0) / proj.length + (face.bias ?? 0);

      let fill = face.fill;
      if (face.shade) {
        // Lumière liée à la caméra : les pans face à nous sont clairs,
        // ceux de profil s'assombrissent — le volume se lit immédiatement.
        const a = face.pts[0];
        const b = face.pts[1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const facingCam = ((-dz / len) * st + (dx / len) * ct + 1) / 2;
        fill = mix('#BFC9D8', '#FCFDFF', facingCam);
      }

      return { proj, depth, fill, stroke: face.stroke };
    });

    polys.sort((p, q) => p.depth - q.depth);
    return polys;
  }, [faces, layout, angles, center, radius3d]);

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
      {/* pointerEvents="none" : le SVG ne doit pas voler les gestes de rotation. */}
      {rendered && (
        <View pointerEvents="none">
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
        </View>
      )}
      <View style={styles.hintPill} pointerEvents="none">
        <Text style={styles.hintText}>Un doigt : tourner · incliner</Text>
      </View>
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
  hintPill: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: c.surfaceSunken,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  hintText: { color: c.inkFaint, fontSize: 11, fontWeight: '600' },
}));
