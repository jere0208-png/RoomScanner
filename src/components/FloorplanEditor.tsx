import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Pattern,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { themedStyles, useTheme, type Palette } from '../theme';
import {
  bounds,
  clampFootprint,
  makeMapping,
  quadPoints,
  roomSurface,
  segLength,
  toFootprint,
  wallQuads,
  wallsCentroid,
  WALL_T,
  type WallQuad,
  type WallSeg,
} from '../geometry/floorplan';
import { dotStep, mixHex } from '../geometry/appearance';
import { frCategory, furnKind, furnitureStrokes } from '../geometry/furniture';

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
  /** Meuble sélectionné : surligné, déplaçable, supprimable. */
  selectedObjectId?: string | null;
  onDeleteObject?: (id: string) => void;
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
  selectedObjectId,
  onDeleteObject,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const allObjects = useScanStore((s) => s.objects);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const objects = showFurniture ? allObjects : [];
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const roomName = useScanStore((s) => s.roomName);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const floorData = useScanStore((s) => s.floor);
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

  // Corps des murs : onglets calculés une fois pour tout le rendu.
  const quads = useMemo(() => wallQuads(walls), [walls]);
  // Surface au sol : contour, aire, et semis de points qui la distingue
  // immédiatement des murs (pochés en noir).
  const surface = useMemo(() => roomSurface(walls), [walls]);
  const floorFill = useMemo(() => {
    const captured = showTextures && floorData?.color;
    return captured ? mixHex(captured, '#FFFFFF', 0.42) : c.surfaceSunken;
  }, [showTextures, floorData, c]);
  /**
   * Semis du sol : motif répété, calé sur l'origine du monde. Un vrai nuage
   * de points suivrait mieux la rotation, mais coûterait un millier de
   * cercles à redessiner à chaque image de déplacement — ici le pas et le
   * calage suffisent à faire lire l'échelle, pour un coût nul.
   */
  const dots = useMemo(() => {
    if (!mapping) return null;
    const size = dotStep(mapping.scale, 16) * mapping.scale;
    const origin = mapping.toPx({ x: 0, z: 0 });
    const wrap = (v: number) => ((v % size) + size) % size;
    return { size, x: wrap(origin.x), y: wrap(origin.y) };
  }, [mapping]);

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
            {/* Surface au sol : aplat + semis de points, pour la distinguer
                d'un coup d'œil des murs pochés en noir. */}
            {showSurfaces && surface && dots && (
              <G>
                <Defs>
                  <Pattern
                    id="floorDots"
                    x={dots.x}
                    y={dots.y}
                    width={dots.size}
                    height={dots.size}
                    patternUnits="userSpaceOnUse">
                    <Circle cx={1.1} cy={1.1} r={1.1} fill={c.inkFaint} />
                  </Pattern>
                </Defs>
                {(() => {
                  const poly = surface.pts
                    .map((p) => {
                      const q = mapping.toPx(p);
                      return `${q.x},${q.y}`;
                    })
                    .join(' ');
                  return (
                    <>
                      <Polygon points={poly} fill={floorFill} stroke="none" />
                      <Polygon points={poly} fill="url(#floorDots)" stroke="none" />
                    </>
                  );
                })()}
              </G>
            )}

            {/* Objets (empreintes au sol) */}
            {objects.map((o) => {
              const f = clampFootprint(toFootprint(o), walls, wallsCentroid(walls));
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
                    stroke={o.id === selectedObjectId ? c.blue : c.lineStrong}
                    strokeWidth={o.id === selectedObjectId ? 2.5 : 1}
                    rx={3}
                  />
                  {/* Symbole de mobilier (lit, canapé, TV…) */}
                  {furnitureStrokes(furnKind(f.category), w, d).map((line, li) => (
                    <G key={`s${li}`}>
                      {line.slice(1).map((p, pi) => (
                        <Line
                          key={pi}
                          x1={line[pi].x}
                          y1={line[pi].y}
                          x2={p.x}
                          y2={p.y}
                          stroke={c.inkSoft}
                          strokeWidth={1.2}
                          strokeLinecap="round"
                        />
                      ))}
                    </G>
                  ))}
                  {/* Nom du meuble (horizontal, si la place le permet) */}
                  {w > 46 && d > 18 && (
                    <SvgText
                      transform={`rotate(${(-(f.yaw + view.rot) * 180) / Math.PI})`}
                      x={0}
                      y={3}
                      fill={c.inkSoft}
                      fontSize={8.5}
                      fontWeight="600"
                      textAnchor="middle">
                      {frCategory(f.category)}
                    </SvgText>
                  )}
                </G>
              );
            })}

            {/* Murs : corps poché aux jonctions d'onglet */}
            {walls.map((w) => (
              <WallBody
                key={w.id}
                wall={w}
                quad={quads.get(w.id)}
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

            {/* Portes / fenêtres : trouée dans le mur, puis trait de repérage */}
            {openings.map((o) => {
              const dx = o.b.x - o.a.x;
              const dz = o.b.z - o.a.z;
              const len = Math.hypot(dx, dz) || 1;
              // Trouée un peu plus épaisse que le mur : elle le traverse net.
              const nx = (-dz / len) * (WALL_T / 2 + 0.03);
              const nz = (dx / len) * (WALL_T / 2 + 0.03);
              const slot = [
                { x: o.a.x + nx, z: o.a.z + nz },
                { x: o.b.x + nx, z: o.b.z + nz },
                { x: o.b.x - nx, z: o.b.z - nz },
                { x: o.a.x - nx, z: o.a.z - nz },
              ].map((p) => mapping.toPx(p));
              const a = mapping.toPx(o.a);
              const b = mapping.toPx(o.b);
              const color = colorOpenings
                ? o.type === 'door'
                  ? c.amber
                  : c.sky
                : c.inkFaint;
              return (
                <G key={o.id}>
                  <Polygon
                    points={slot.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill={showSurfaces ? floorFill : c.surface}
                    stroke="none"
                  />
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={color}
                    strokeWidth={3}
                    strokeLinecap="butt"
                  />
                </G>
              );
            })}

            {/* Cartouche de pièce : nom encadré et surface au sol.
                Il esquive les meubles pour rester lisible. */}
            {walls.length > 0 &&
              (roomName !== '' || (showSurfaces && surface)) &&
              (() => {
                const areaText =
                  showSurfaces && surface
                    ? `${surface.exact ? '' : '≈ '}${surface.area
                        .toFixed(1)
                        .replace('.', ',')} m²`
                    : null;
                const ctr = wallsCentroid(walls);
                const foots = objects.map((o) =>
                  clampFootprint(toFootprint(o), walls, ctr),
                );
                const text = roomName !== '' ? roomName : areaText ?? '';
                const wpx = Math.max(46, text.length * 7 + 18);
                const hpx = roomName !== '' && areaText ? 38 : 24;
                const labelW = wpx / mapping.scale;
                const labelH = hpx / mapping.scale;
                const collides = (pt: { x: number; z: number }) =>
                  foots.some(
                    (f) =>
                      Math.abs(pt.x - f.cx) < (f.width + labelW) / 2 &&
                      Math.abs(pt.z - f.cz) < (f.depth + labelH) / 2,
                  );
                let pos = ctr;
                for (const [ox, oz] of [
                  [0, 0],
                  [0, 0.5],
                  [0, -0.5],
                  [0.7, 0],
                  [-0.7, 0],
                  [0, 1],
                  [0, -1],
                ]) {
                  const cand = { x: ctr.x + ox, z: ctr.z + oz };
                  if (!collides(cand)) {
                    pos = cand;
                    break;
                  }
                }
                const p = mapping.toPx(pos);
                return (
                  <G>
                    <Rect
                      x={p.x - wpx / 2}
                      y={p.y - hpx / 2}
                      width={wpx}
                      height={hpx}
                      rx={6}
                      fill={c.surface}
                      stroke={c.lineStrong}
                      strokeWidth={1}
                    />
                    {roomName !== '' && (
                      <SvgText
                        x={p.x}
                        y={p.y + (areaText ? -3 : 4)}
                        fill={c.ink}
                        fontSize={11}
                        fontWeight="700"
                        textAnchor="middle">
                        {roomName}
                      </SvgText>
                    )}
                    {areaText && (
                      <SvgText
                        x={p.x}
                        y={p.y + (roomName !== '' ? 12 : 4)}
                        fill={c.inkSoft}
                        fontSize={roomName !== '' ? 10 : 11}
                        fontWeight="700"
                        textAnchor="middle">
                        {areaText}
                      </SvgText>
                    )}
                  </G>
                );
              })()}
          </Svg>

          {/* Meuble sélectionné : poignée de déplacement + bouton supprimer */}
          {selectedObjectId &&
            (() => {
              const o = allObjects.find((x) => x.id === selectedObjectId);
              if (!o) return null;
              const f = clampFootprint(toFootprint(o), walls, wallsCentroid(walls));
              const p = mapping.toPx({ x: f.cx, z: f.cz });
              return (
                <>
                  <ObjectDragHandle objectId={o.id} center={p} mapping={mapping} raw={o} />
                  <TouchableOpacity
                    style={[styles.objDelete, { left: p.x + 20, top: p.y - 44 }]}
                    onPress={() => onDeleteObject?.(o.id)}>
                    <Text style={styles.objDeleteText}>✕</Text>
                  </TouchableOpacity>
                </>
              );
            })()}

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

/**
 * Un mur au plan : corps poché dont les quatre coins viennent des onglets
 * partagés (`wallQuads`) — deux murs qui se rejoignent forment donc un angle
 * franc, sans recouvrement ni fente.
 */
function WallBody({
  wall,
  quad,
  mapping,
  showMeasure,
  selected,
  onPress,
}: {
  wall: WallSeg;
  quad?: WallQuad;
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
  // Sous une certaine échelle le poché est plus fin qu'un trait : on garde
  // alors un trait plein, sinon le mur disparaît quand on dézoome.
  const bodyPx = WALL_T * mapping.scale;
  const body =
    quad && bodyPx >= 2.5
      ? quadPoints(quad)
          .map((p) => mapping.toPx(p))
          .map((p) => `${p.x},${p.y}`)
          .join(' ')
      : null;

  // Cote : petit texte posé le long du mur, sans cadre, jamais à l'envers.
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  let n = { x: -dy / norm, y: dx / norm };
  if (n.y > 0) n = { x: -n.x, y: -n.y }; // toujours du côté "haut" écran
  const mid = {
    x: (a.x + b.x) / 2 + n.x * (bodyPx / 2 + 9),
    y: (a.y + b.y) / 2 + n.y * (bodyPx / 2 + 9),
  };
  const label = `${segLength(wall).toFixed(2).replace('.', ',')} m`;

  return (
    <G onPress={onPress}>
      {/* Zone de toucher élargie, invisible */}
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={30} />
      {body ? (
        <Polygon points={body} fill={selected ? c.blue : c.ink} stroke="none" />
      ) : (
        <Line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={selected ? c.blue : c.ink}
          strokeWidth={2.5}
          strokeLinecap="butt"
        />
      )}
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

function ObjectDragHandle({
  objectId,
  center,
  mapping,
  raw,
}: {
  objectId: string;
  center: { x: number; y: number };
  mapping: EffMapping;
  raw: { transform: number[] };
}) {
  const styles = getStyles(useTheme());
  const startRef = useRef({ x: raw.transform[12], z: raw.transform[14] });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = { x: raw.transform[12], z: raw.transform[14] };
        },
        onPanResponderMove: (_e, g) => {
          const d = mapping.deltaToMeters(g.dx, g.dy);
          useScanStore
            .getState()
            .setObjectCenter(objectId, startRef.current.x + d.x, startRef.current.z + d.z);
        },
      }),
    [objectId, mapping, raw],
  );
  return (
    <View
      {...pan.panHandlers}
      style={[styles.objDrag, { left: center.x - 22, top: center.y - 22 }]}
    />
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
  // Zone de saisie invisible : le coin se déplace au doigt, sans marqueur.
  return (
    <View
      {...pan.panHandlers}
      style={[styles.handle, { left: px.x - 16, top: px.y - 16 }]}
    />
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
  objDrag: { position: 'absolute', width: 44, height: 44 },
  objDelete: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B0D12',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  objDeleteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
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
