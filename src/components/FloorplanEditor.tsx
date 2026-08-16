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
  Path,
  Pattern,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import {
  bounds,
  clampFootprint,
  makeMapping,
  quadPoints,
  roomExtent,
  roomOf,
  roomParts,
  segLength,
  toFootprint,
  northScreenAngle,
  planFrameAngle,
  wallQuads,
  wallRuns,
  WALL_T,
  type ObjectFootprint,
  type Pt,
  type RoomPart,
  type WallQuad,
  type WallSeg,
} from '../geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';
import {
  FIXTURES,
  FIXTURE_TAG,
  assemblySymbol,
  faceX,
  facePoint,
  stackRanks,
  wallFace,
} from '../geometry/electrical';
import { frCategory, furnKind, furnitureStrokes } from '../geometry/furniture';

/**
 * Les commandes du mur, en icônes.
 *
 * Quatre mots posés côte à côte, c'était quatre longueurs différentes et une
 * barre qui s'étirait. Une icône a toujours la même largeur ; le mot passe
 * dessous, en tout petit et en faible opacité — il est là pour la première
 * fois qu'on hésite, pas pour les cent suivantes.
 */
const WALL_ACTIONS: {
  action: 'longueur' | 'ouverture' | 'electricite' | 'supprimer';
  label: string | null;
  paths: { d: string; fill?: boolean }[];
}[] = [
  {
    action: 'longueur',
    label: 'Cotes',
    // Le double-décimètre.
    paths: [
      { d: 'M3.5 9 h17 a1.5 1.5 0 0 1 1.5 1.5 v3 a1.5 1.5 0 0 1 -1.5 1.5 h-17 a1.5 1.5 0 0 1 -1.5 -1.5 v-3 a1.5 1.5 0 0 1 1.5 -1.5 z' },
      { d: 'M7.5 9 v3' },
      { d: 'M11.5 9 v3' },
      { d: 'M15.5 9 v3' },
    ],
  },
  {
    action: 'ouverture',
    label: 'Ouvrir',
    // Une baie vue en plan : deux tableaux et le débattement.
    paths: [
      { d: 'M2.5 18 h4.5' },
      { d: 'M17 18 h4.5' },
      { d: 'M7 18 a5 5 0 0 1 10 0' },
      { d: 'M7 18 v-4' },
      { d: 'M17 18 v-4' },
    ],
  },
  {
    action: 'electricite',
    label: 'Élec',
    // L'éclair : le seul symbole que personne n'a besoin qu'on lui explique.
    paths: [{ d: 'M13.5 2.5 L5.5 13.5 h5 l-1 8 8 -11 h-5 z', fill: true }],
  },
  {
    action: 'supprimer',
    // Pas de mot : une croix se lit dans toutes les langues.
    label: null,
    paths: [{ d: 'M6.5 6.5 L17.5 17.5' }, { d: 'M17.5 6.5 L6.5 17.5' }],
  },
];

interface EffMapping {
  scale: number;
  toPx: (p: { x: number; z: number }) => { x: number; y: number };
  deltaToMeters: (dx: number, dy: number) => { x: number; z: number };
  toMeters: (px: { x: number; y: number }) => { x: number; z: number };
}
import { useScanStore } from '../store/scanStore';

/**
 * Distance d'un point à un mur, dans une direction donnée.
 *
 * Sert aux cotes de dégagement d'un meuble : on part du milieu de chacun de
 * ses côtés, perpendiculairement, et on regarde ce qu'on rencontre. Rien
 * dans cette direction : pas de cote, plutôt qu'une cote fausse.
 */
function castToWall(from: Pt, dir: Pt, walls: WallSeg[]): number | null {
  let best = Infinity;
  for (const w of walls) {
    const ex = w.b.x - w.a.x;
    const ez = w.b.z - w.a.z;
    const den = dir.x * ez - dir.z * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((w.a.x - from.x) * ez - (w.a.z - from.z) * ex) / den;
    const u = ((w.a.x - from.x) * dir.z - (w.a.z - from.z) * dir.x) / den;
    if (t > 1e-3 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  // Jusqu'au NU du mur, pas jusqu'à son axe : c'est la cote qu'on relève
  // sur place, mètre contre la plinthe.
  return isFinite(best) ? Math.max(0, best - WALL_T / 2) : null;
}

/**
 * Empreinte d'un meuble, recalée contre les murs de SA pièce seulement :
 * la cloison de la pièce voisine ne doit pas le repousser.
 */
function footprintOf(
  o: ObjectData,
  partOf: Map<string, RoomPart>,
): ObjectFootprint {
  const part = partOf.get(roomOf(o));
  if (!part) return toFootprint(o);
  return clampFootprint(toFootprint(o), part.walls, part.labelAt);
}

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
  /** Pièce sélectionnée : son cartouche est mis en avant. */
  selectedRoomId?: string | null;
  /** Appui sur le sol d'une pièce (mode édition) : la sélectionne. */
  onSelectRoom?: (id: string | null) => void;
  /** Appui sur le cartouche d'une pièce (mode édition) : la renomme. */
  onEditRoomName?: (id: string) => void;
  /**
   * Pièces en défaut de conformité électrique : leurs murs passent en rouge
   * foncé. C'est le seul signal visible sans ouvrir un menu.
   */
  alertRooms?: Set<string>;
  /** Cotes du meuble sélectionné : réclamées par sa pastille de mesure. */
  showObjectDims?: boolean;
  onToggleObjectDims?: () => void;
  /** Appui sur le vide : `null` retire aussi la sélection d'un meuble. */
  onSelectObject?: (id: string | null) => void;
  /** Ouverture sélectionnée : elle se retaille en largeur et en hauteur. */
  selectedOpeningId?: string | null;
  onSelectOpening?: (id: string | null) => void;
  /** Appui sur un symbole d'appareillage : ouvre son mur vu de face. */
  onSelectFixture?: (id: string, wallId: string) => void;
  /** Commande lancée depuis les boutons flottants du mur sélectionné. */
  onWallAction?: (
    action: 'longueur' | 'ouverture' | 'electricite' | 'supprimer',
    wallId: string,
  ) => void;
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
  selectedRoomId,
  onSelectRoom,
  onEditRoomName,
  onWallAction,
  onSelectFixture,
  selectedOpeningId,
  onSelectOpening,
  onSelectObject,
  showObjectDims,
  onToggleObjectDims,
  alertRooms,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const allObjects = useScanStore((s) => s.objects);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const objects = showFurniture ? allObjects : [];
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const north = useScanStore((s) => s.north);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
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
  // Pendant un déplacement du plan, les cotes sont masquées : leur recalcul
  // et leur rotation à chaque image faisaient saccader le geste.
  const [navigating, setNavigating] = useState(false);
  /** Emprise à l'écran du meuble sélectionné : zone interdite au plan. */
  const objBox = useRef<{ x: number; y: number; hw: number; hh: number } | null>(
    null,
  );
  const nav = useRef(
    PanResponder.create({
      // Ne prend la main QUE sur un mouvement : les taps (sélection de mur)
      // et les poignées de coin gardent la priorité.
      onStartShouldSetPanResponder: () => false,
      // Un geste qui COMMENCE sur le meuble sélectionné appartient au
      // meuble, jamais au plan. Sans cette exception, le plan se déplaçait
      // sous le doigt et le meuble ne bougeait pas d'un pouce.
      onMoveShouldSetPanResponder: (e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) <= 6) return false;
        const b = objBox.current;
        if (b) {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (
            Math.abs(x - b.x) < b.hw + 14 &&
            Math.abs(y - b.y) < b.hh + 14
          ) {
            return false;
          }
        }
        return true;
      },
      onPanResponderGrant: (e, g) => {
        setNavigating(true);
        snapshot(e, g);
      },
      onPanResponderRelease: () => setNavigating(false),
      onPanResponderTerminate: () => setNavigating(false),
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
      /** Point de l'écran → point du monde : sert au tracé d'un mur. */
      toMeters: (px: { x: number; y: number }) => {
        const dx = px.x - cx - view.ox;
        const dy = px.y - cy - view.oy;
        const ux = (dx * cos + dy * sin) / view.zoom + cx;
        const uy = (-dx * sin + dy * cos) / view.zoom + cy;
        return baseMapping.toMeters({ x: ux, y: uy });
      },
    };
  }, [baseMapping, view, layout]);

  /**
   * Niveau de détail des cotes, de 0 à 1, piloté par le zoom.
   *
   * Coter chaque retour de mur en même temps que la longueur totale
   * surchargerait le plan. On les échange donc : en dessous de 55 px/m, seule
   * la cote globale du mur s'affiche ; au-delà de 95 px/m, seuls les
   * tronçons. Entre les deux, les unes s'effacent pendant que les autres
   * apparaissent.
   */
  const detail = mapping
    ? Math.min(1, Math.max(0, (mapping.scale - 55) / 40))
    : 0;

  /**
   * Niveau de détail de l'appareillage, de 0 à 1.
   *
   * Un symbole de plan fait 22 px, quel que soit le zoom : de loin, trois
   * prises sur le même pan se chevauchent en une bouillie. En dessous de
   * 60 px/m, il ne reste donc qu'un POINT de la couleur de l'appareil — on
   * voit qu'il y a quelque chose, et combien —, et le symbole ne revient
   * qu'au-delà de 100 px/m, quand il a la place de se lire. Entre les deux,
   * l'un s'efface pendant que l'autre paraît.
   */
  const elecLod = mapping
    ? Math.min(1, Math.max(0, (mapping.scale - 60) / 40))
    : 0;

  // Corps des murs : onglets calculés une fois pour tout le rendu.
  const quads = useMemo(() => wallQuads(walls), [walls]);
  // La trame du logement : c'est SUR ELLE que les angles s'aimantent, et
  // jamais sur les axes de l'écran — un scan commencé de biais donnerait
  // sinon des meubles de biais avec des murs droits.
  const frame = useMemo(() => planFrameAngle(walls), [walls]);
  const wallById = useMemo(
    () => new Map(walls.map((w) => [w.id, w])),
    [walls],
  );
  // Quel mur borde quelle pièce : un refend en borde deux.
  const roomsOfWall = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rooms) {
      for (const id of r.wallIds ?? []) {
        const list = m.get(id) ?? [];
        list.push(r.id);
        m.set(id, list);
      }
    }
    return m;
  }, [rooms]);
  // Pièces du plan : chacune a son contour, son centre et sa teinte de sol.
  const parts = useMemo(() => roomParts(walls, rooms), [walls, rooms]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  // Le sol garde sa teinte neutre. Les couleurs relevées au scan ne servent
  // qu'à la vue 3D : sur un plan vu de dessus, sous le poché des murs et le
  // semis des points, elles ne se lisaient pas.
  const fillOf = useMemo(() => (_roomId: string) => c.surfaceSunken, [c]);
  const partOf = useMemo(
    () => new Map(parts.map((p) => [p.roomId, p])),
    [parts],
  );
  /**
   * Semis du sol : motif répété, calé sur l'origine du monde. Un vrai nuage
   * de points suivrait mieux la rotation, mais coûterait un millier de
   * cercles à redessiner à chaque image de déplacement — ici le pas et le
   * calage suffisent à faire lire l'échelle, pour un coût nul.
   */
  const dots = useMemo(() => {
    if (!mapping) return null;
    // Design d'ÉCRAN : le semis est fixe, il ne bouge ni au zoom ni au pan.
    return { size: 16, x: 0, y: 0 };
  }, [mapping]);

  // Coins uniques (les extrémités soudées partagent les mêmes coordonnées).
  // La clé porte la pièce : deux pièces qui se touchent gardent chacune sa
  // poignée, sinon déplacer un coin en emporterait deux.
  const corners = useMemo(() => {
    const seen = new Map<string, { x: number; z: number; wallId: string; end: 'a' | 'b' }>();
    for (const w of walls) {
      for (const end of ['a', 'b'] as const) {
        const p = w[end];
        const key = `${roomOf(w)}|${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
        if (!seen.has(key)) seen.set(key, { x: p.x, z: p.z, wallId: w.id, end });
      }
    }
    return [...seen.entries()].map(([key, v]) => ({ key, ...v }));
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
            {/* Toucher le vide désélectionne. Posé tout au fond du dessin :
                murs, meubles et cartouches gardent la priorité, et seul ce
                qui n'appartient à rien tombe ici. `transparent` et non
                `none` — une surface sans couleur n'est pas touchable. */}
            {editable && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill="transparent"
                onPress={() => {
                  onSelectWall(null);
                  onSelectRoom?.(null);
                  onSelectOpening?.(null);
                  onSelectObject?.(null);
                }}
              />
            )}

            {/* Surface au sol : aplat + semis de points, pour la distinguer
                d'un coup d'œil des murs pochés en noir. */}
            {showSurfaces && dots && (
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
                {parts.map((part) => {
                  if (!part.surface) return null;
                  const poly = part.surface.pts
                    .map((p) => {
                      const q = mapping.toPx(p);
                      return `${q.x},${q.y}`;
                    })
                    .join(' ');
                  return (
                    <G
                      key={part.roomId}
                      onPress={
                        editable && onSelectRoom
                          ? () =>
                              onSelectRoom(
                                part.roomId === selectedRoomId ? null : part.roomId,
                              )
                          : undefined
                      }>
                      <Polygon
                        points={poly}
                        fill={fillOf(part.roomId)}
                        stroke="none"
                      />
                      <Polygon points={poly} fill="url(#floorDots)" stroke="none" />
                    </G>
                  );
                })}
              </G>
            )}

            {/* Objets (empreintes au sol) */}
            {objects.map((o) => {
              const f = footprintOf(o, partOf);
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

            {/* Voile d'estompage : quand un mur est sélectionné, tout le
                reste passe en retrait pour qu'on ne lise plus que lui. */}
            {selectedWallId && (
              <Rect
                x={0}
                y={0}
                width={layout.w}
                height={layout.h}
                fill={c.surface}
                opacity={0.72}
                pointerEvents="none"
              />
            )}

            {/* Murs : corps poché aux jonctions d'onglet */}
            {walls.map((w) => (
              <WallBody
                key={w.id}
                wall={w}
                quad={quads.get(w.id)}
                mapping={mapping}
                showMeasure={showMeasures && !navigating}
                measureOpacity={1 - detail}
                alert={
                  !!alertRooms?.size &&
                  (roomsOfWall.get(w.id) ?? []).some((id) => alertRooms.has(id))
                }
                selected={editable && w.id === selectedWallId}
                onPress={
                  editable
                    ? () => onSelectWall(w.id === selectedWallId ? null : w.id)
                    : undefined
                }
              />
            ))}

            {/* Le mur sélectionné repasse au-dessus du voile, bien lisible. */}
            {selectedWallId &&
              (() => {
                const w = walls.find((x) => x.id === selectedWallId);
                if (!w) return null;
                return (
                  <WallBody
                    wall={w}
                    quad={quads.get(w.id)}
                    mapping={mapping}
                    showMeasure={!navigating}
                    selected
                    onPress={editable ? () => onSelectWall(null) : undefined}
                  />
                );
              })()}

            {/* Appareillage électrique : le symbole se pose DANS la pièce,
                juste devant la face qui porte l'appareil — c'est la
                convention d'un plan d'électricien, et c'est aussi le seul
                moyen de distinguer les deux faces d'une même cloison. */}
            {(() => {
              const placed = fixtures
                .map((f) => {
                  const w = wallById.get(f.wallId);
                  if (!w) return null;
                  const face = wallFace(w, quads.get(w.id), f.side);
                  return { f, face, x: faceX(face, f.along) };
                })
                .filter((p): p is NonNullable<typeof p> => !!p);
              const ranks = stackRanks(
                placed.map((p) => ({
                  id: p.f.id,
                  wallId: p.f.wallId,
                  side: p.f.side,
                  x: p.x,
                })),
              );
              return placed.map(({ f, face, x }) => {
                const spec = FIXTURES[f.kind];
                const symbol = assemblySymbol(f.kind);
                const tag = FIXTURE_TAG[f.kind];
                // Échelonnement : le deuxième appareil du même point se pose
                // plus loin du mur, sur le même filet.
                const out = 0.14 + (ranks.get(f.id) ?? 0) * (0.1 + 0.14 * elecLod);
                const anchor = mapping.toPx(facePoint(face, x, 0.02));
                const p = mapping.toPx(facePoint(face, x, out));
                // Le symbole regarde SA face : sa tige rejoint le mur. Le
                // plan pouvant être tourné, l'angle se prend à l'écran.
                const dir =
                  (Math.atan2(-face.nz, -face.nx) + view.rot) * (180 / Math.PI) - 90;
                return (
                  <G
                    key={f.id}
                    onPress={
                      onSelectFixture
                        ? () => onSelectFixture(f.id, f.wallId)
                        : undefined
                    }>
                    {/* Cible tactile élargie : le symbole fait 22 px, le
                        doigt en demande le double. */}
                    <Circle cx={p.x} cy={p.y} r={18} fill="transparent" />
                    {elecLod < 0.98 && (
                      <Circle
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill={spec.color}
                        opacity={1 - elecLod}
                      />
                    )}
                    {elecLod > 0.02 && (
                      <G opacity={elecLod}>
                        <Line
                          x1={anchor.x}
                          y1={anchor.y}
                          x2={p.x}
                          y2={p.y}
                          stroke={spec.color}
                          strokeWidth={1.2}
                        />
                        <Circle cx={p.x} cy={p.y} r={11} fill={c.surface} />
                        <G transform={`translate(${p.x}, ${p.y}) rotate(${dir})`}>
                          {symbol.map((seg, si) => (
                            <Path
                              key={si}
                              d={seg.d}
                              stroke={spec.color}
                              strokeWidth={1.6}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill={seg.fill ? spec.color : 'none'}
                            />
                          ))}
                        </G>
                        {tag && (
                          <SvgText
                            x={p.x + 12}
                            y={p.y - 8}
                            fill={spec.color}
                            fontSize={8}
                            fontWeight="800">
                            {tag}
                          </SvgText>
                        )}
                      </G>
                    )}
                  </G>
                );
              });
            })()}

            {/* Rose des vents. Relevée au magnétomètre pendant le scan, elle
                tourne avec le plan : le N montre le vrai nord, à toute
                rotation. Posée dans un coin, hors du dessin — une rose au
                milieu du plan gênerait la lecture qu'elle est censée aider. */}
            {north !== null && (
              <G
                transform={`translate(32, 32) rotate(${
                  (northScreenAngle(north, view.rot) * 180) / Math.PI + 90
                })`}>
                <Circle
                  cx={0}
                  cy={0}
                  r={21}
                  fill={c.surface}
                  fillOpacity={0.92}
                  stroke={c.line}
                  strokeWidth={1}
                />
                {/* Aiguille : la moitié nord pleine, la moitié sud en creux. */}
                <Polygon points="0,-16 4.5,0 -4.5,0" fill={c.danger} />
                <Polygon points="0,16 4.5,0 -4.5,0" fill={c.inkFaint} />
                {(
                  [
                    ['N', 0],
                    ['E', 90],
                    ['S', 180],
                    ['O', 270],
                  ] as [string, number][]
                ).map(([lettre, deg]) => {
                  const a = ((deg - 90) * Math.PI) / 180;
                  return (
                    <SvgText
                      key={lettre}
                      x={Math.cos(a) * 15.5}
                      y={Math.sin(a) * 15.5 + 3}
                      fill={lettre === 'N' ? c.ink : c.inkFaint}
                      fontSize={lettre === 'N' ? 9.5 : 8}
                      fontWeight="800"
                      textAnchor="middle">
                      {lettre}
                    </SvgText>
                  );
                })}
              </G>
            )}

            {/* Dégagements du meuble sélectionné : ce qui le sépare des
                murs, sur ses quatre côtés. Les cotes LONGENT le meuble —
                elles partent du milieu de chaque côté, perpendiculairement,
                et tournent avec lui puisqu'elles sont calculées dans le
                monde, pas à l'écran. */}
            {selectedObjectId &&
              showFurniture &&
              showObjectDims &&
              (() => {
                const o = allObjects.find((x) => x.id === selectedObjectId);
                if (!o) return null;
                const f = footprintOf(o, partOf);
                const murs = partOf.get(roomOf(o))?.walls ?? walls;
                const cos = Math.cos(f.yaw);
                const sin = Math.sin(f.yaw);
                // Les quatre normales sortantes, dans le repère du meuble.
                const cotes = [
                  { d: { x: cos, z: sin }, demi: f.width / 2 },
                  { d: { x: -cos, z: -sin }, demi: f.width / 2 },
                  { d: { x: -sin, z: cos }, demi: f.depth / 2 },
                  { d: { x: sin, z: -cos }, demi: f.depth / 2 },
                ];
                return (
                  <G>
                    {cotes.map(({ d, demi }, ci) => {
                      const from = {
                        x: f.cx + d.x * demi,
                        z: f.cz + d.z * demi,
                      };
                      const gap = castToWall(from, d, murs);
                      // Ni collé, ni à l'autre bout du logement : au-delà de
                      // 4 m, ce n'est plus un dégagement, c'est du vide.
                      if (gap === null || gap < 0.02 || gap > 4) return null;
                      const to = {
                        x: from.x + d.x * gap,
                        z: from.z + d.z * gap,
                      };
                      const A = mapping.toPx(from);
                      const B = mapping.toPx(to);
                      const len = Math.hypot(B.x - A.x, B.y - A.y);
                      if (len < 18) return null;
                      let angle =
                        (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
                      if (angle > 90) angle -= 180;
                      if (angle < -90) angle += 180;
                      const mx = (A.x + B.x) / 2;
                      const my = (A.y + B.y) / 2;
                      const texte =
                        gap < 1
                          ? `${Math.round(gap * 100)}`
                          : gap.toFixed(2).replace('.', ',');
                      return (
                        <G key={ci}>
                          <Line
                            x1={A.x}
                            y1={A.y}
                            x2={B.x}
                            y2={B.y}
                            stroke={c.blue}
                            strokeWidth={1}
                            strokeDasharray="3 3"
                          />
                          <Circle cx={A.x} cy={A.y} r={2} fill={c.blue} />
                          <Circle cx={B.x} cy={B.y} r={2} fill={c.blue} />
                          <Rect
                            x={mx - (texte.length * 3.6 + 7)}
                            y={my - 8}
                            width={texte.length * 7.2 + 14}
                            height={16}
                            rx={5}
                            fill={c.surface}
                            opacity={0.94}
                            transform={`rotate(${angle}, ${mx}, ${my})`}
                          />
                          <SvgText
                            x={mx}
                            y={my + 3.5}
                            fill={c.blue}
                            fontSize={10}
                            fontWeight="800"
                            textAnchor="middle"
                            transform={`rotate(${angle}, ${mx}, ${my})`}>
                            {texte}
                          </SvgText>
                        </G>
                      );
                    })}
                  </G>
                );
              })()}

            {/* Cotes de détail : retour de mur, baie, retour de mur. Elles
                n'apparaissent qu'une fois le plan assez zoomé pour les lire. */}
            {showMeasures && !navigating && detail > 0.02 &&
              walls.map((w) =>
                wallRuns(w, openings).map((run, ri) => {
                  const A = mapping.toPx(w.a);
                  const B = mapping.toPx(w.b);
                  const dx = B.x - A.x;
                  const dy = B.y - A.y;
                  const norm = Math.hypot(dx, dy) || 1;
                  let n = { x: -dy / norm, y: dx / norm };
                  if (n.y > 0) n = { x: -n.x, y: -n.y };
                  const t = (run.t0 + run.t1) / 2;
                  const off = WALL_T * mapping.scale + 9;
                  const px = A.x + dx * t + n.x * off;
                  const py = A.y + dy * t + n.y * off;
                  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                  if (angle > 90) angle -= 180;
                  if (angle < -90) angle += 180;
                  // Une cote plus courte que son texte serait illisible.
                  if ((run.t1 - run.t0) * norm < 26) return null;
                  return (
                    <SvgText
                      key={`run-${w.id}-${ri}`}
                      x={px}
                      y={py + 3}
                      fill={run.kind === 'mur' ? c.inkSoft : c.blue}
                      fontSize={9.5}
                      fontWeight="700"
                      opacity={detail}
                      textAnchor="middle"
                      transform={`rotate(${angle}, ${px}, ${py})`}>
                      {run.length.toFixed(2).replace('.', ',')}
                    </SvgText>
                  );
                }),
              )}

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
              const choisie = o.id === selectedOpeningId;
              return (
                <G
                  key={o.id}
                  onPress={
                    editable && onSelectOpening
                      ? () => onSelectOpening(choisie ? null : o.id)
                      : undefined
                  }>
                  {/* Cible tactile : une menuiserie fait 3 px d'épaisseur. */}
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={26}
                  />
                  <Polygon
                    points={slot.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill={showSurfaces ? fillOf(roomOf(o)) : c.surface}
                    stroke="none"
                  />
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={choisie ? c.blue : color}
                    strokeWidth={choisie ? 5 : 3}
                    strokeLinecap="butt"
                  />
                </G>
              );
            })}

            {/* Cartouche par pièce : nom encadré et surface au sol.
                Chacun esquive les meubles de sa pièce pour rester lisible. */}
            {parts.map((part) => {
              const roomName = roomById.get(part.roomId)?.name ?? '';
              const areaText =
                showSurfaces && part.surface
                  ? `${part.surface.exact ? '' : '≈ '}${part.surface.area
                      .toFixed(1)
                      .replace('.', ',')} m²`
                  : null;
              // En édition, la pièce a toujours son cartouche : c'est par lui
              // qu'on la nomme, même quand elle n'a encore ni nom ni surface.
              if (roomName === '' && !areaText && !editable) return null;
              const foots = objects
                .filter((o) => roomOf(o) === part.roomId)
                .map((o) => footprintOf(o, partOf));
              const placeholder = roomName === '' && !areaText ? 'Nommer' : '';
              // Cotes hors-tout : ce que cherche un artisan avant tout.
              const extText =
                showMeasures && part.surface
                  ? (() => {
                      const e = roomExtent(part.surface.pts);
                      return `${e.width.toFixed(2).replace('.', ',')} × ${e.depth
                        .toFixed(2)
                        .replace('.', ',')} m`;
                    })()
                  : null;
              // Le cartouche se compose LIGNE PAR LIGNE, et sa hauteur se
              // déduit d'elles : à hauteur fixe, la dernière ligne finissait
              // collée au bord pendant que le titre gardait son air. Une
              // boîte qui n'a pas la même marge en haut et en bas se voit,
              // même quand on ne saurait pas dire pourquoi.
              const lignes: {
                t: string;
                size: number;
                fill: string;
                bold: boolean;
              }[] = [];
              if (roomName !== '') {
                lignes.push({ t: roomName, size: 11, fill: selectedRoomId === part.roomId && editable ? c.blue : c.ink, bold: true });
              }
              if (areaText) {
                lignes.push({
                  t: areaText,
                  size: roomName !== '' ? 10 : 11,
                  fill: roomName !== '' ? c.inkSoft : c.ink,
                  bold: roomName === '',
                });
              }
              if (extText) {
                lignes.push({ t: extText, size: 9, fill: c.inkFaint, bold: false });
              }
              if (placeholder !== '' && lignes.length === 0) {
                lignes.push({ t: placeholder, size: 11, fill: c.inkFaint, bold: true });
              }
              const PAD = 9;
              const LH = 14;
              const hpx = PAD * 2 + lignes.length * LH;
              const wpx = Math.max(
                50,
                Math.max(...lignes.map((l) => l.t.length * (l.size * 0.62))) + 26,
              );
              const labelW = wpx / mapping.scale;
              const labelH = hpx / mapping.scale;
              const collides = (pt: Pt) =>
                foots.some(
                  (f) =>
                    Math.abs(pt.x - f.cx) < (f.width + labelW) / 2 &&
                    Math.abs(pt.z - f.cz) < (f.depth + labelH) / 2,
                );
              // Point le plus au large de la pièce : jamais dans un mur ni
              // collé à un. On s'en écarte juste assez pour éviter un meuble.
              const ctr = part.labelAt;
              let pos = ctr;
              for (const [ox, oz] of [
                [0, 0],
                [0, 0.4],
                [0, -0.4],
                [0.5, 0],
                [-0.5, 0],
                [0, 0.8],
                [0, -0.8],
              ]) {
                const cand = { x: ctr.x + ox, z: ctr.z + oz };
                if (!collides(cand)) {
                  pos = cand;
                  break;
                }
              }
              const p = mapping.toPx(pos);
              const selected = editable && part.roomId === selectedRoomId;
              return (
                <G
                  key={`label-${part.roomId}`}
                  // En édition, le cartouche EST le bouton de renommage :
                  // on touche le nom là où il s'affiche.
                  onPress={
                    editable
                      ? () => {
                          onSelectRoom?.(part.roomId);
                          onEditRoomName?.(part.roomId);
                        }
                      : undefined
                  }>
                  <Rect
                    x={p.x - wpx / 2}
                    y={p.y - hpx / 2}
                    width={wpx}
                    height={hpx}
                    rx={6}
                    fill={c.surface}
                    stroke={selected ? c.blue : c.lineStrong}
                    strokeWidth={selected ? 2 : 1}
                  />
                  {lignes.map((l, li) => (
                    <SvgText
                      key={li}
                      x={p.x}
                      y={p.y - hpx / 2 + PAD + li * LH + LH / 2 + l.size * 0.35}
                      fill={l.fill}
                      fontSize={l.size}
                      fontWeight={l.bold ? '700' : '600'}
                      textAnchor="middle">
                      {l.t}
                    </SvgText>
                  ))}
                </G>
              );
            })}
          </Svg>

          {/* Meuble sélectionné : poignée de déplacement + bouton supprimer */}
          {/* Le meuble sélectionné : toute son emprise se glisse, sa croix
              et sa poignée de rotation flottent HORS de lui.

              Une poignée de 44 px au centre ne suffisait pas : dès qu'on
              posait le doigt à côté du centre — c'est-à-dire presque
              partout sur un lit —, c'était le plan qui se déplaçait. */}
          {selectedObjectId &&
            showFurniture &&
            (() => {
              const o = allObjects.find((x) => x.id === selectedObjectId);
              if (!o) return null;
              const f = footprintOf(o, partOf);
              const p = mapping.toPx({ x: f.cx, z: f.cz });
              // Boîte écran du rectangle tourné : c'est elle qu'on empoigne.
              const ang = f.yaw + view.rot;
              const cw = Math.abs(Math.cos(ang));
              const sw = Math.abs(Math.sin(ang));
              const w = f.width * mapping.scale;
              const d = f.depth * mapping.scale;
              // Marge de 10 px autour de l'emprise : le doigt tombe rarement
              // pile dessus, et rater la poignée déplaçait le plan.
              const hw = Math.max(28, (w * cw + d * sw) / 2 + 10);
              const hh = Math.max(28, (w * sw + d * cw) / 2 + 10);
              objBox.current = { x: p.x, y: p.y, hw, hh };
              // Les boutons flottants restent DANS le plan, et à gauche de
              // la colonne d'outils : posés sur elle, on cliquait l'un pour
              // l'autre.
              const bx = Math.min(layout.w - 106, Math.max(46, p.x + hw + 2));
              const by = Math.min(layout.h - 96, Math.max(30, p.y - hh - 30));
              return (
                <>
                  <ObjectDragHandle
                    objectId={o.id}
                    center={p}
                    half={{ x: hw, y: hh }}
                    mapping={mapping}
                    raw={o}
                  />
                  <RotateHandle
                    objectId={o.id}
                    center={p}
                    at={{ x: p.x - hw - 16, y: p.y - hh - 16 }}
                    raw={o}
                    viewRot={view.rot}
                    frame={frame}
                  />
                  <TouchableOpacity
                    style={[styles.objDelete, { left: bx, top: by }]}
                    onPress={() => onDeleteObject?.(o.id)}>
                    <Text style={styles.objDeleteText}>✕</Text>
                  </TouchableOpacity>
                  {/* Les cotes à la demande : le bandeau du bas et les
                      dégagements ne s'affichent que si on les réclame. Ils
                      couvraient le plan en permanence pour un réglage qu'on
                      ne fait qu'une fois. */}
                  <TouchableOpacity
                    style={[
                      styles.objMeasure,
                      showObjectDims && styles.objMeasureOn,
                      { left: bx, top: by + 36 },
                    ]}
                    onPress={onToggleObjectDims}>
                    <Svg width={17} height={17} viewBox="0 0 24 24">
                      {[
                        'M3.5 9 h17 a1.5 1.5 0 0 1 1.5 1.5 v3 a1.5 1.5 0 0 1 -1.5 1.5 h-17 a1.5 1.5 0 0 1 -1.5 -1.5 v-3 a1.5 1.5 0 0 1 1.5 -1.5 z',
                        'M7.5 9 v3',
                        'M11.5 9 v3',
                        'M15.5 9 v3',
                      ].map((dd) => (
                        <Path
                          key={dd}
                          d={dd}
                          stroke={showObjectDims ? '#FFFFFF' : c.ink}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      ))}
                    </Svg>
                  </TouchableOpacity>
                </>
              );
            })()}

          {/* Mur sélectionné : le reste du plan s'estompe, et les commandes
              viennent se poser À CÔTÉ du mur, jamais dessus. */}
          {selectedWallId &&
            (() => {
              const w = walls.find((x) => x.id === selectedWallId);
              if (!w || !onWallAction) return null;
              const a2 = mapping.toPx(w.a);
              const b2 = mapping.toPx(w.b);
              const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
              // Décalage perpendiculaire, du côté où il y a de la place.
              const dx = b2.x - a2.x;
              const dy = b2.y - a2.y;
              const len = Math.hypot(dx, dy) || 1;
              let nx = -dy / len;
              let ny = dx / len;
              const ctr = partOf.get(roomOf(w))?.labelAt;
              const c2 = ctr ? mapping.toPx(ctr) : { x: layout.w / 2, y: layout.h / 2 };
              // Vers l'intérieur de la pièce : c'est là qu'on a de la place.
              if (nx * (c2.x - mid.x) + ny * (c2.y - mid.y) < 0) {
                nx = -nx;
                ny = -ny;
              }
              const gap = 54;
              let bx = mid.x + nx * gap;
              let by = mid.y + ny * gap;
              // Et jamais hors du cadre : la barre porte quatre commandes,
              // il lui faut 118 px de part et d'autre de son centre.
              bx = Math.min(layout.w - 118, Math.max(118, bx));
              by = Math.min(layout.h - 46, Math.max(46, by));
              return (
                <View
                  style={[styles.wallActions, { left: bx - 114, top: by - 26 }]}
                  pointerEvents="box-none">
                  {WALL_ACTIONS.map(({ action, label, paths }) => {
                    const teinte = action === 'supprimer' ? c.danger : c.ink;
                    return (
                      <TouchableOpacity
                        key={action}
                        style={styles.wallAction}
                        onPress={() => onWallAction(action, w.id)}>
                        <Svg width={21} height={21} viewBox="0 0 24 24">
                          {paths.map((seg, i) => (
                            <Path
                              key={i}
                              d={seg.d}
                              stroke={teinte}
                              strokeWidth={1.9}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill={seg.fill ? teinte : 'none'}
                            />
                          ))}
                        </Svg>
                        {label && (
                          <Text style={styles.wallActionText}>{label}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })()}

          {/* Poignées de coin, uniquement en mode édition */}
          {editable &&
            corners.map((pt) => (
              <CornerHandle key={pt.key} corner={pt} mapping={mapping} />
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
  measureOpacity = 1,
  selected,
  alert,
  onPress,
}: {
  wall: WallSeg;
  quad?: WallQuad;
  mapping: EffMapping;
  showMeasure: boolean;
  /** Les cotes globales s'effacent quand les cotes de détail arrivent. */
  measureOpacity?: number;
  selected: boolean;
  /** Le mur borde une pièce en défaut de conformité électrique. */
  alert?: boolean;
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
  // Rouge foncé : assez sombre pour rester un mur poché, assez rouge pour
  // qu'on ne le confonde pas avec les autres. La sélection reste bleue —
  // c'est un état, pas un défaut.
  const teinte = selected ? c.blue : alert ? '#8E1B1B' : c.ink;

  return (
    <G onPress={onPress}>
      {/* Zone de toucher élargie, invisible */}
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={30} />
      {body ? (
        <Polygon points={body} fill={teinte} stroke="none" />
      ) : (
        <Line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={teinte}
          strokeWidth={2.5}
          strokeLinecap="butt"
        />
      )}
      {showMeasure && measureOpacity > 0.02 && (
        <SvgText
          opacity={measureOpacity}
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
  half,
  mapping,
  raw,
}: {
  objectId: string;
  center: { x: number; y: number };
  /** Demi-largeur et demi-hauteur de l'emprise à l'écran. */
  half: { x: number; y: number };
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
      style={[
        styles.objDrag,
        {
          left: center.x - half.x,
          top: center.y - half.y,
          width: half.x * 2,
          height: half.y * 2,
        },
      ]}
    />
  );
}

/**
 * La poignée de rotation : un demi-cercle fléché posé à un coin du meuble.
 *
 * On la tire, le meuble suit l'angle du doigt autour de son centre, et la
 * valeur s'affiche le temps du geste — sans elle, on tourne à l'aveugle et
 * on ne retrouve jamais l'aplomb. Elle s'arrête d'elle-même tous les 15°,
 * à 4° près : c'est ce qui permet de revenir à l'équerre du premier coup.
 */
function RotateHandle({
  objectId,
  center,
  at,
  raw,
  viewRot,
  frame,
}: {
  objectId: string;
  center: { x: number; y: number };
  at: { x: number; y: number };
  raw: { transform: number[] };
  viewRot: number;
  /** Trame du logement : l'aimant s'y réfère. */
  frame: number;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [angle, setAngle] = useState<number | null>(null);
  const base = useRef({ yaw: 0, touche: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          base.current = {
            yaw: Math.atan2(raw.transform[2], raw.transform[0]),
            // Angle écran du point de départ de la poignée, autour du centre.
            touche: Math.atan2(at.y - center.y, at.x - center.x),
          };
          setAngle(Math.round(((base.current.yaw * 180) / Math.PI) % 360));
        },
        onPanResponderMove: (_e, g) => {
          const a = Math.atan2(
            at.y + g.dy - center.y,
            at.x + g.dx - center.x,
          );
          let yaw = base.current.yaw + (a - base.current.touche);
          // Aimant à deux forces, référé à la TRAME du logement :
          // les quarts de tour tirent de loin (8°) parce que c'est là que
          // tombent 99 % des meubles ; les seizièmes, de tout près (3°),
          // pour un meuble volontairement de biais.
          const rel = yaw - frame;
          const quart = Math.round(rel / (Math.PI / 2)) * (Math.PI / 2);
          const seizieme = Math.round(rel / (Math.PI / 12)) * (Math.PI / 12);
          if (Math.abs(rel - quart) < (8 * Math.PI) / 180) {
            yaw = frame + quart;
          } else if (Math.abs(rel - seizieme) < (3 * Math.PI) / 180) {
            yaw = frame + seizieme;
          }
          useScanStore.getState().setObjectYaw(objectId, yaw);
          const deg = Math.round(((yaw - viewRot) * 180) / Math.PI);
          setAngle(((deg % 360) + 360) % 360);
        },
        onPanResponderRelease: () => setAngle(null),
        onPanResponderTerminate: () => setAngle(null),
      }),
    [objectId, at.x, at.y, center.x, center.y, raw, viewRot, frame],
  );
  return (
    <>
      <View
        {...pan.panHandlers}
        style={[styles.rotHandle, { left: at.x - 17, top: at.y - 17 }]}>
        <Svg width={19} height={19} viewBox="0 0 24 24">
          <Path
            d="M4.5 12 a7.5 7.5 0 1 1 3 6"
            stroke={c.blue}
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M3.2 8.2 l1.6 4.2 4.2 -1.6"
            stroke={c.blue}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
      {angle !== null && (
        <View style={[styles.rotBadge, { left: at.x - 24, top: at.y - 46 }]}>
          <Text style={styles.rotBadgeText}>{`${angle}°`}</Text>
        </View>
      )}
    </>
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
  objDrag: { position: 'absolute' },
  rotHandle: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.16,
  },
  rotBadge: {
    position: 'absolute',
    minWidth: 48,
    borderRadius: radius.pill,
    backgroundColor: c.blue,
    paddingVertical: 4,
    alignItems: 'center',
  },
  rotBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  // Commandes du mur sélectionné : posées à côté de lui, jamais dessus.
  wallActions: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingHorizontal: 4,
    paddingVertical: 6,
    ...shadowCard,
    shadowOpacity: 0.14,
  },
  // Quatre colonnes de même largeur : la barre ne s'étire plus au gré de la
  // longueur des mots.
  wallAction: {
    width: 55,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  wallActionText: {
    color: c.ink,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
    opacity: 0.45,
  },
  // Hors de l'emprise et en retrait : une croix rouge posée SUR le meuble
  // se lit comme une partie de lui, et se touche par accident.
  objDelete: {
    position: 'absolute',
    opacity: 0.75,
    width: 28,
    height: 28,
    borderRadius: 14,
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
  objMeasure: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.16,
  },
  objMeasureOn: { backgroundColor: c.blue },
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
