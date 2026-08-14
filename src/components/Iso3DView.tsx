import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import { themedStyles, useTheme, type Palette } from '../theme';
import {
  closedLoop,
  segLength,
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

function pointInPoly(x: number, y: number, pts: { sx: number; sy: number }[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (
      (a.sy > y) !== (b.sy > y) &&
      x < ((b.sx - a.sx) * (y - a.sy)) / (b.sy - a.sy) + a.sx
    ) {
      inside = !inside;
    }
  }
  return inside;
}

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
  /** Cotes sur les arêtes (arêtes en noir). */
  showMeasures?: boolean;
}

/**
 * Vue 3D axonométrique du scan, dérivée des mêmes données paramétriques
 * que le plan 2D : murs épais extrudés, portes/fenêtres, meubles.
 * Un doigt : tourner/incliner. Deux doigts : pincer pour zoomer, déplacer.
 */
export function Iso3DView({ value, onChange, hideHint, showMeasures }: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const allObjects = useScanStore((s) => s.objects);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const objects = useMemo(
    () => (showFurniture ? allObjects : []),
    [showFurniture, allObjects],
  );
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
    a0: 0,
  });

  const touchAngle = (t: { pageX: number; pageY: number }[]) =>
    Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX);
  const tapRef = useRef({ x: 0, y: 0 });

  // Créé UNE seule fois : un responder recréé en plein geste perd le suivi.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderGrant: (e, g) => {
        const t = e.nativeEvent.touches;
        tapRef.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
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
          a0: t.length >= 2 ? touchAngle(t) : 0,
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
            a0: t.length >= 2 ? touchAngle(t) : 0,
          };
        }
        const base = baseRef.current;
        if (mode === 'pinch' && t.length >= 2) {
          const d = Math.max(8, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY));
          const mx = (t[0].pageX + t[1].pageX) / 2;
          const my = (t[0].pageY + t[1].pageY) / 2;
          // Torsion des deux doigts : le modèle pivote en suivant les doigts.
          let twist = ((touchAngle(t) - base.a0) * 180) / Math.PI;
          twist = ((twist + 540) % 360) - 180;
          update({
            theta: base.v.theta + twist,
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
      onPanResponderRelease: (_e, g) => {
        // Tap simple (sans glisser) : cadrer la vue sur le mur touché.
        if (baseRef.current.mode === 'rotate' && Math.abs(g.dx) + Math.abs(g.dy) < 6) {
          focusRef.current?.(tapRef.current.x, tapRef.current.y);
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

    // Assemblage des coins : UN seul mur traverse l'angle (prolongé d'une
    // demi-épaisseur), l'autre s'arrête contre lui — angle net, sans
    // interpénétration visible des boîtes.
    const cornerKey = (p: { x: number; z: number }) =>
      `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
    const cornerIds = new Map<string, string[]>();
    for (const w of walls) {
      for (const p of [w.a, w.b]) {
        const k = cornerKey(p);
        const l = cornerIds.get(k) ?? [];
        l.push(w.id);
        cornerIds.set(k, l);
      }
    }
    for (const l of cornerIds.values()) l.sort();
    const extFor = (k: string, id: string) => {
      const l = cornerIds.get(k) ?? [];
      if (l.length < 2) return 0;
      return l[0] === id ? WALL_T / 2 : -WALL_T / 2;
    };

    // Murs épais : boîte (2 longs pans, 2 chants, 1 dessus).
    for (const w of walls) {
      const dx = w.b.x - w.a.x;
      const dz = w.b.z - w.a.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const extA = extFor(cornerKey(w.a), w.id);
      const extB = extFor(cornerKey(w.b), w.id);
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

      // Mode cotes : toutes les arêtes en noir.
      const stroke =
        showMeasures && !face.isFloor && face.stroke !== 'none'
          ? '#0B0D12'
          : face.stroke;
      return { proj, depth, fill, stroke };
    });

    polys.sort((p, q) => p.depth - q.depth);

    // Cotes portées sur les arêtes : longueur de chaque mur (arête haute),
    // hauteur une fois par valeur distincte (arête verticale).
    const labels: { x: number; y: number; angle: number; text: string }[] = [];
    if (showMeasures) {
      const edgeLabel = (
        p0: { sx: number; sy: number },
        p1: { sx: number; sy: number },
        text: string,
      ) => {
        const dx = p1.sx - p0.sx;
        const dy = p1.sy - p0.sy;
        const norm = Math.hypot(dx, dy) || 1;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        let n = { x: -dy / norm, y: dx / norm };
        if (n.y > 0) n = { x: -n.x, y: -n.y };
        labels.push({
          x: (p0.sx + p1.sx) / 2 + n.x * 9,
          y: (p0.sy + p1.sy) / 2 + n.y * 9,
          angle,
          text,
        });
      };
      const seenHeights = new Set<string>();
      for (const w of walls) {
        const pA = project({ x: w.a.x, y: w.height, z: w.a.z });
        const pB = project({ x: w.b.x, y: w.height, z: w.b.z });
        edgeLabel(pA, pB, `${segLength(w).toFixed(2).replace('.', ',')} m`);
        const hKey = w.height.toFixed(2);
        if (!seenHeights.has(hKey)) {
          seenHeights.add(hKey);
          const p0 = project({ x: w.a.x, y: 0, z: w.a.z });
          edgeLabel(p0, pA, `${hKey.replace('.', ',')} m`);
        }
      }
    }

    return { polys, labels };
  }, [faces, layout, view, center, radius3d, showMeasures, walls]);

  // Tap sur un mur : oriente la caméra face au mur, zoome pour le voir entier.
  const focusRef = useRef<((tx: number, ty: number) => void) | null>(null);
  focusRef.current = (tx, ty) => {
    if (layout.w === 0 || walls.length === 0) return;
    const v = viewRef.current;
    const ct = Math.cos(rad(v.theta));
    const st = Math.sin(rad(v.theta));
    const cp = Math.cos(rad(v.tilt));
    const sp = Math.sin(rad(v.tilt));
    const baseScale = (Math.min(layout.w, layout.h) * 0.44) / radius3d;
    const scale = baseScale * v.zoom;
    const project = (p: P3) => {
      const x = p.x - center.x;
      const y = p.y - center.y;
      const z = p.z - center.z;
      const rx = x * ct - z * st;
      const rz = x * st + z * ct;
      return {
        sx: layout.w / 2 + v.ox + rx * scale,
        sy: layout.h / 2 + v.oy + (rz * cp - y * sp) * scale,
        depth: rz * sp + y * cp,
      };
    };

    let best: { wall: WallSeg; depth: number } | null = null;
    for (const w of walls) {
      const quad = [
        project({ x: w.a.x, y: 0, z: w.a.z }),
        project({ x: w.b.x, y: 0, z: w.b.z }),
        project({ x: w.b.x, y: w.height, z: w.b.z }),
        project({ x: w.a.x, y: w.height, z: w.a.z }),
      ];
      if (pointInPoly(tx, ty, quad)) {
        const depth = quad.reduce((s, p) => s + p.depth, 0) / 4;
        if (!best || depth > best.depth) best = { wall: w, depth };
      }
    }
    if (!best) return;
    const w = best.wall;

    // Face au mur, vu depuis l'intérieur de la scène.
    const phi = (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    const midw = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    const pick = [-phi, -phi + 180].find((theta) => {
      const s = Math.sin(rad(theta));
      const co = Math.cos(rad(theta));
      return (midw.x - center.x) * s + (midw.z - center.z) * co < 0;
    });
    const thetaN = pick ?? -phi;
    const tiltN = 30;
    const span = Math.max(segLength(w), w.height * 1.4);
    const zoomN = clamp((0.85 * Math.min(layout.w, layout.h)) / (span * baseScale), 1, 4);
    const scaleN = baseScale * zoomN;
    const ct2 = Math.cos(rad(thetaN));
    const st2 = Math.sin(rad(thetaN));
    const cp2 = Math.cos(rad(tiltN));
    const sp2 = Math.sin(rad(tiltN));
    const x = midw.x - center.x;
    const yy = w.height / 2 - center.y;
    const z = midw.z - center.z;
    const rx = x * ct2 - z * st2;
    const rz = x * st2 + z * ct2;
    update({
      theta: thetaN,
      tilt: tiltN,
      zoom: zoomN,
      ox: -rx * scaleN,
      oy: -(rz * cp2 - yy * sp2) * scaleN,
    });
  };

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
            {rendered.polys.map((p, i) => (
              <Polygon
                key={i}
                points={p.proj.map((q) => `${q.sx},${q.sy}`).join(' ')}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            ))}
            {rendered.labels.map((l, i) => (
              <React.Fragment key={`l${i}`}>
                <SvgText
                  x={l.x}
                  y={l.y}
                  fontSize={10}
                  fontWeight="700"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={3}
                  textAnchor="middle"
                  transform={`rotate(${l.angle}, ${l.x}, ${l.y})`}>
                  {l.text}
                </SvgText>
                <SvgText
                  x={l.x}
                  y={l.y}
                  fontSize={10}
                  fontWeight="700"
                  fill="#0B0D12"
                  textAnchor="middle"
                  transform={`rotate(${l.angle}, ${l.x}, ${l.y})`}>
                  {l.text}
                </SvgText>
              </React.Fragment>
            ))}
          </Svg>
        </View>
      )}
      {!hideHint && (
        <View style={styles.hintPill} pointerEvents="none">
          <Text style={styles.hintText}>
            1 doigt : tourner · 2 doigts : zoomer, pivoter, déplacer
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
