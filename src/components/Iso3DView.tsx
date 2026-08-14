import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/** Paramètres de caméra de la vue 3D (contrôlables de l'extérieur). */
export interface View3DParams {
  theta: number;
  tilt: number;
  zoom: number;
  ox: number;
  oy: number;
}

export const DEFAULT_VIEW3D: View3DParams = {
  theta: -32,
  tilt: 58,
  zoom: 1,
  ox: 0,
  oy: 0,
};

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

interface Props {
  /** Mode contrôlé (aperçu d'export) : état de caméra fourni par le parent. */
  value?: View3DParams;
  onChange?: (v: View3DParams) => void;
  /** Cache la pastille d'aide (pour les petits encarts d'aperçu). */
  hideHint?: boolean;
}

/**
 * Vue 3D axonométrique du scan, dérivée des mêmes données paramétriques
 * que le plan 2D : murs épais extrudés, portes/fenêtres, meubles.
 * Un doigt : tourner/incliner. Deux doigts : pincer pour zoomer, déplacer.
 */
export function Iso3DView({ value, onChange, hideHint }: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const objects = useScanStore((s) => s.objects);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const c = useTheme();
  const styles = getStyles(c);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [inner, setInner] = useState<View3DParams>(DEFAULT_VIEW3D);
  const view = value ?? inner;
  const viewRef = useRef(view);
  const changeRef = useRef<Props['onChange']>(undefined);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  const update = (v: View3DParams) => {
    viewRef.current = v;
    if (changeRef.current) {
      changeRef.current(v);
    } else {
      setInner(v);
    }
  };

  const baseRef = useRef({
    v: DEFAULT_VIEW3D,
    mode: 'rotate' as 'rotate' | 'pinch',
    dx0: 0,
    dy0: 0,
    d0: 1,
    mx0: 0,
    my0: 0,
  });

  // Créé UNE seule fois : un responder recréé en plein geste perd le suivi.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderGrant: (e, g) => {
        const t = e.nativeEvent.touches;
        baseRef.current = {
          v: viewRef.current,
          mode: t.length >= 2 ? 'pinch' : 'rotate',
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
        const mode = t.length >= 2 ? 'pinch' : 'rotate';
        if (mode !== baseRef.current.mode) {
          // Le nombre de doigts a changé en plein geste : on repart d'ici.
          baseRef.current = {
            v: viewRef.current,
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
          update({
            theta: base.v.theta,
            tilt: base.v.tilt,
            zoom: clamp(base.v.zoom * (d / base.d0), 0.4, 4),
            ox: base.v.ox + (mx - base.mx0),
            oy: base.v.oy + (my - base.my0),
          });
        } else {
          const ddx = g.dx - base.dx0;
          const ddy = g.dy - base.dy0;
          update({
            ...base.v,
            // Glisser à droite « pousse » la face avant vers la droite.
            theta: base.v.theta - ddx * 0.45,
            tilt: clamp(base.v.tilt - ddy * 0.3, 15, 80),
          });
        }
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

    // Aux coins partagés, chaque mur est prolongé d'une demi-épaisseur :
    // les boîtes se rejoignent et l'angle extérieur se termine en pointe.
    const cornerKey = (p: { x: number; z: number }) =>
      `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
    const cornerCount = new Map<string, number>();
    for (const w of walls) {
      for (const p of [w.a, w.b]) {
        cornerCount.set(cornerKey(p), (cornerCount.get(cornerKey(p)) ?? 0) + 1);
      }
    }

    // Murs épais : boîte (2 longs pans, 2 chants, 1 dessus).
    for (const w of walls) {
      const dx = w.b.x - w.a.x;
      const dz = w.b.z - w.a.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const extA = (cornerCount.get(cornerKey(w.a)) ?? 0) > 1 ? WALL_T / 2 : 0;
      const extB = (cornerCount.get(cornerKey(w.b)) ?? 0) > 1 ? WALL_T / 2 : 0;
      const pa = { x: w.a.x - ux * extA, z: w.a.z - uz * extA };
      const pb = { x: w.b.x + ux * extB, z: w.b.z + uz * extB };
      const nx = (-dz / len) * (WALL_T / 2);
      const nz = (dx / len) * (WALL_T / 2);
      const a1 = { x: pa.x + nx, z: pa.z + nz };
      const a2 = { x: pa.x - nx, z: pa.z - nz };
      const b1 = { x: pb.x + nx, z: pb.z + nz };
      const b2 = { x: pb.x - nx, z: pb.z - nz };

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
        fill: colorOpenings
          ? o.type === 'door'
            ? c.amber
            : c.sky
          : '#B9C2CE',
        stroke: 'none',
        bias: 0.12,
      });
    }

    // Meubles : boîtes grises-bleutées.
    for (const obj of objects.map(toFootprint)) {
      const cosY = Math.cos(obj.yaw);
      const sinY = Math.sin(obj.yaw);
      const hw = obj.width / 2;
      const hd = obj.depth / 2;
      const corners = [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ].map(([lx, lz]) => ({
        x: obj.cx + lx * cosY - lz * sinY,
        z: obj.cz + lx * sinY + lz * cosY,
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
  }, [walls, openings, objects, floorY, c, colorOpenings]);

  // Centre et rayon englobants en 3D : l'échelle reste stable en rotation.
  const { center, radius3d } = useMemo(() => {
    const all = faces.flatMap((f) => f.pts);
    if (all.length === 0) {
      return { center: { x: 0, y: 0, z: 0 }, radius3d: 1 };
    }
    const ctr = {
      x: all.reduce((s, p) => s + p.x, 0) / all.length,
      y: all.reduce((s, p) => s + p.y, 0) / all.length,
      z: all.reduce((s, p) => s + p.z, 0) / all.length,
    };
    const r = Math.max(
      0.5,
      ...all.map((p) => Math.hypot(p.x - ctr.x, p.y - ctr.y, p.z - ctr.z)),
    );
    return { center: ctr, radius3d: r };
  }, [faces]);

  const rendered = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    const ct = Math.cos(rad(view.theta));
    const st = Math.sin(rad(view.theta));
    const cp = Math.cos(rad(view.tilt));
    const sp = Math.sin(rad(view.tilt));
    const scale = ((Math.min(layout.w, layout.h) * 0.44) / radius3d) * view.zoom;

    const project = (p: P3) => {
      const x = p.x - center.x;
      const y = p.y - center.y;
      const z = p.z - center.z;
      const rx = x * ct - z * st;
      const rz = x * st + z * ct;
      return {
        sx: layout.w / 2 + view.ox + rx * scale,
        sy: layout.h / 2 + view.oy + (rz * cp - y * sp) * scale,
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
  }, [faces, layout, view, center, radius3d]);

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
      {/* pointerEvents="none" : le SVG ne doit pas voler les gestes. */}
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
      {!hideHint && (
        <View style={styles.hintPill} pointerEvents="none">
          <Text style={styles.hintText}>
            1 doigt : tourner · 2 doigts : zoomer, déplacer
          </Text>
        </View>
      )}
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
