/**
 * Face au mur — l'établi de l'électricien.
 *
 * Un plan vu de dessus ne dit rien d'une hauteur, et une vue 3D en
 * perspective ne se cote pas : pour poser une prise, il faut se mettre
 * DEVANT le mur, bien à plat. C'est tout ce que fait cet écran — un seul
 * mur, vu de face, à l'échelle, avec ses portes et ses fenêtres, et les
 * trois cotes qui comptent : depuis la gauche, depuis la droite, depuis le
 * sol.
 *
 * On déplace l'appareil au doigt et les cotes suivent ; on tape une valeur
 * et l'appareil suit. Le doigt est imprécis, donc le geste s'arrête sur les
 * repères qui comptent — hauteur usuelle du type d'appareil, alignement avec
 * un appareil déjà posé, milieu du mur — et le repère s'affiche pendant
 * qu'on y est accroché.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { roomOf, roomParts, wallQuadsOf } from '../geometry/floorplan';
import {
  FIXTURES as SPECS,
  type FixtureKind,
} from '../geometry/electrical';
import {
  checkElectrical,
  HEIGHT_RULES,
  requirementFor,
  roomInputsOf,
  roomUse,
  wallToRooms,
} from '../geometry/nfc15100';
import { assignOpenings } from '../geometry/scene3d';
import {
  FIXTURES,
  faceX,
  faceXofT,
  fromFaceX,
  interiorSide,
  wallFace,
  type Fixture,
} from '../geometry/electrical';
import { useScanStore } from '../store/scanStore';

const PAD_X = 30;
const PAD_TOP = 26;
const PAD_BOTTOM = 34;
/** Tolérance d'accrochage, en mètres. */
const SNAP = 0.03;

const cm = (m: number) => Math.round(m * 100);

interface Props {
  wallId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Ouvre le catalogue pour poser un appareil de plus sur ce mur. */
  onAddRequest: () => void;
  onClose: () => void;
}

export function WallElevation({
  wallId,
  selectedId,
  onSelect,
  onAddRequest,
  onClose,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const moveFixture = useScanStore((s) => s.moveFixture);
  const addFixture = useScanStore((s) => s.addFixture);
  const flipFixture = useScanStore((s) => s.flipFixture);
  const removeFixture = useScanStore((s) => s.removeFixture);
  const c = useTheme();
  const styles = getStyles(c);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [guide, setGuide] = useState<{ x?: number; y?: number }>({});
  const [editing, setEditing] = useState<'g' | 'd' | 'h' | null>(null);
  const [draft, setDraft] = useState('');

  const wall = walls.find((w) => w.id === wallId) ?? null;
  const mine = useMemo(
    () => fixtures.filter((f) => f.wallId === wallId),
    [fixtures, wallId],
  );
  const selected = mine.find((f) => f.id === selectedId) ?? null;

  // La face qu'on regarde est celle de l'appareil sélectionné : le retourner
  // fait donc passer la vue de l'autre côté, ce qui est exactement le geste
  // attendu quand on met une prise dos à dos.
  const side = selected?.side ?? (wall ? interiorSide(wall, walls, rooms) : 1);
  const face = useMemo(
    () => (wall ? wallFace(wall, wallQuadsOf(walls).get(wall.id), side) : null),
    [wall, walls, side],
  );

  const holes = useMemo(() => {
    if (!wall || walls.length === 0) return [];
    const floorY = Math.min(...walls.map((w) => w.yCenter - w.height / 2));
    return assignOpenings(walls, openings, floorY).get(wall.id) ?? [];
  }, [wall, walls, openings]);

  // ------------------------------------------------- guide de conformité
  // Poser une prise sans savoir combien la pièce en exige, c'est compter
  // dans sa tête. L'app le fait : elle annonce l'objectif, montre où on en
  // est, et rappelle la règle en une ligne.
  const objectif = useMemo(() => {
    const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
    const w2r = wallToRooms(inputs);
    const mien = inputs.find((r) => (w2r.get(wallId) ?? []).includes(r.id));
    if (!mien) return null;
    const req = requirementFor(roomUse(mien.name, mien.kind), mien.area);
    if (req.socles === 0) return null;
    const poses = fixtures.filter(
      (f) =>
        (w2r.get(f.wallId) ?? []).includes(mien.id) &&
        (f.kind === 'prise' || f.kind === 'prise2'),
    ).length;
    // Cuisine : ce sont les socles du plan de travail qui manquent en
    // premier, et ceux-là se posent à 1,10 m, pas en plinthe.
    const hauts = fixtures.filter(
      (f) =>
        (w2r.get(f.wallId) ?? []).includes(mien.id) &&
        (f.kind === 'prise' || f.kind === 'prise2') &&
        f.height >= 0.9,
    ).length;
    return {
      nom: mien.name || 'Cette pièce',
      poses,
      exiges: req.socles,
      regle: req.regle,
      surPlan: req.surPlan > hauts,
    };
  }, [rooms, walls, fixtures, wallId]);

  /**
   * Les autres constats de la pièce — ceux que le bandeau d'objectif et
   * l'avertissement de hauteur ne disent pas déjà. C'est ici qu'ils doivent
   * paraître : on a ouvert ce mur PARCE QU'il est en défaut, il serait
   * absurde de renvoyer ailleurs pour savoir lequel.
   */
  const constats = useMemo(() => {
    const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
    const w2r = wallToRooms(inputs);
    const miens = w2r.get(wallId) ?? [];
    return checkElectrical(inputs, fixtures, w2r).filter(
      (i) =>
        i.severity === 'alerte' &&
        i.code !== 'socles' &&
        i.code !== 'hauteur' &&
        !!i.roomId &&
        miens.includes(i.roomId),
    );
  }, [rooms, walls, fixtures, wallId]);

  // ------------------------------------------------------------- échelle
  const H = wall?.height ?? 2.5;
  const scale =
    face && layout.w > 0 && layout.h > 0
      ? Math.min(
          (layout.w - 2 * PAD_X) / face.len,
          (layout.h - PAD_TOP - PAD_BOTTOM) / H,
        )
      : 0;
  const originX = face ? (layout.w - face.len * scale) / 2 : 0;
  const originY = layout.h - PAD_BOTTOM;
  const px = (x: number) => originX + x * scale;
  const py = (y: number) => originY - y * scale;

  // Le PanResponder se crée une fois : il lit l'état courant dans une boîte
  // mise à jour à chaque rendu, sinon il travaillerait sur des valeurs figées.
  const live = useRef({
    mine,
    face,
    scale,
    H,
    px,
    py,
    selectedId,
    move: moveFixture,
    select: onSelect,
  });
  live.current = {
    mine,
    face,
    scale,
    H,
    px,
    py,
    selectedId,
    move: moveFixture,
    select: onSelect,
  };
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);

  const snapTo = (v: number, targets: number[]) => {
    let best: number | null = null;
    let bd = SNAP;
    for (const t of targets) {
      const d = Math.abs(v - t);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const L = live.current;
        if (!L.face || L.scale <= 0) return;
        const tx = e.nativeEvent.locationX;
        const ty = e.nativeEvent.locationY;
        // L'appareil le plus proche du doigt, à portée de pouce.
        let best: Fixture | null = null;
        let bd = 34;
        for (const f of L.mine) {
          const d = Math.hypot(
            L.px(faceX(L.face, f.along)) - tx,
            L.py(f.height) - ty,
          );
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
        if (!best) {
          drag.current = null;
          L.select(null);
          return;
        }
        drag.current = {
          id: best.id,
          x: faceX(L.face, best.along),
          y: best.height,
        };
        if (best.id !== L.selectedId) L.select(best.id);
      },
      onPanResponderMove: (_e, g) => {
        const L = live.current;
        const d = drag.current;
        if (!d || !L.face || L.scale <= 0) return;
        const spec = FIXTURES[L.mine.find((f) => f.id === d.id)?.kind ?? 'prise'];
        let x = d.x + g.dx / L.scale;
        let y = d.y - g.dy / L.scale;
        // Repères : hauteur usuelle du type posé, alignement avec les autres
        // appareils du mur, milieu du mur.
        const others = L.mine.filter((f) => f.id !== d.id);
        const sx = snapTo(x, [
          ...others.map((f) => faceX(L.face!, f.along)),
          L.face.len / 2,
        ]);
        const sy = snapTo(y, [spec.std, ...others.map((f) => f.height)]);
        if (sx !== null) x = sx;
        if (sy !== null) y = sy;
        x = Math.round(x * 100) / 100;
        y = Math.round(y * 100) / 100;
        setGuide({ x: sx ?? undefined, y: sy ?? undefined });
        L.move(d.id, fromFaceX(L.face, x), y);
      },
      onPanResponderRelease: () => {
        drag.current = null;
        setGuide({});
      },
      onPanResponderTerminate: () => {
        drag.current = null;
        setGuide({});
      },
    }),
  ).current;

  if (!wall || !face) {
    return (
      <View style={styles.sheet}>
        <Text style={styles.title}>Ce mur n'existe plus</Text>
        <TouchableOpacity style={styles.ghost} onPress={onClose}>
          <Text style={styles.ghostText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const spec = selected ? FIXTURES[selected.kind] : null;
  const selX = selected ? faceX(face, selected.along) : 0;
  const roomName =
    rooms.find((r) => r.id === roomOf(wall))?.name ?? '';

  // La règle de hauteur de l'appareil qu'on tient : c'est ici, et nulle
  // part ailleurs, qu'elle sert.
  const hauteurKO = (() => {
    if (!selected) return null;
    const r = HEIGHT_RULES[selected.kind];
    if (!r) return null;
    if (r.min !== undefined && selected.height < r.min - 1e-6) {
      return { sens: 'trop bas', regle: r.regle };
    }
    if (r.max !== undefined && selected.height > r.max + 1e-6) {
      return { sens: 'trop haut', regle: r.regle };
    }
    return null;
  })();

  /**
   * Poser l'appareil qui manque, sans quitter le mur.
   *
   * Le constat est sous les yeux, la correction doit être à portée du même
   * pouce : renvoyer au catalogue pour choisir une prise dont l'app sait
   * déjà qu'elle manque serait un détour.
   */
  const poser = (kind: FixtureKind, height?: number) => {
    const id = addFixture(kind, wallId);
    if (!id) return;
    if (height !== undefined) {
      const pose = useScanStore.getState().fixtures.find((f) => f.id === id);
      if (pose) moveFixture(id, pose.along, height);
    }
    onSelect(id);
  };

  /** Applique une cote tapée au clavier (en cm). */
  const applyDraft = () => {
    const v = parseFloat(draft.replace(',', '.'));
    if (selected && editing && isFinite(v)) {
      const m = v / 100;
      if (editing === 'g') moveFixture(selected.id, fromFaceX(face, m), selected.height);
      else if (editing === 'd')
        moveFixture(selected.id, fromFaceX(face, face.len - m), selected.height);
      else moveFixture(selected.id, selected.along, m);
    }
    setEditing(null);
  };

  const field = (key: 'g' | 'd' | 'h', label: string, value: number) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <TextInput
          style={styles.fieldInput}
          value={
            editing === key ? draft : selected ? String(cm(value)) : '—'
          }
          editable={!!selected}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          onFocus={() => {
            setEditing(key);
            setDraft(String(cm(value)));
          }}
          onChangeText={setDraft}
          onBlur={applyDraft}
          onSubmitEditing={applyDraft}
        />
        <Text style={styles.fieldUnit}>cm</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <Text style={styles.title}>
            {spec ? spec.label : 'Face au mur'}
          </Text>
          <Text style={styles.subtitle}>
            {roomName ? `${roomName} · ` : ''}
            {`mur de ${face.len.toFixed(2).replace('.', ',')} m`}
            {spec ? ` · ${spec.note}` : ' · touchez un appareil pour le coter'}
          </Text>
        </View>
        <TouchableOpacity style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.canvas}
        onLayout={(e) =>
          setLayout({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
        {...pan.panHandlers}>
        {scale > 0 && (
          <Svg width={layout.w} height={layout.h}>
            {/* Le mur, vu de face : un rectangle à l'échelle. */}
            <Rect
              x={px(0)}
              y={py(H)}
              width={face.len * scale}
              height={H * scale}
              fill={c.surfaceSunken}
              stroke={c.lineStrong}
              strokeWidth={1.5}
              rx={2}
            />

            {/* Sol : trait épais et hachures — le zéro des hauteurs. */}
            <Line
              x1={px(0) - 14}
              y1={py(0)}
              x2={px(face.len) + 14}
              y2={py(0)}
              stroke={c.ink}
              strokeWidth={2.5}
            />
            {Array.from({ length: Math.ceil(face.len * scale / 12) + 3 }).map(
              (_, i) => {
                const x = px(0) - 12 + i * 12;
                return (
                  <Line
                    key={`h${i}`}
                    x1={x}
                    y1={py(0) + 8}
                    x2={x + 7}
                    y2={py(0)}
                    stroke={c.lineStrong}
                    strokeWidth={1}
                  />
                );
              },
            )}
            {/* Plafond */}
            <Line
              x1={px(0)}
              y1={py(H)}
              x2={px(face.len)}
              y2={py(H)}
              stroke={c.inkFaint}
              strokeWidth={1}
              strokeDasharray="5 4"
            />

            {/* Portes et fenêtres : on ne perce pas un mur à leur place. */}
            {holes.map((hole, i) => {
              const xa = faceXofT(face, hole.t0);
              const xb = faceXofT(face, hole.t1);
              const x0 = Math.min(xa, xb);
              const w = Math.abs(xb - xa);
              return (
                <G key={`o${i}`}>
                  <Rect
                    x={px(x0)}
                    y={py(hole.y1)}
                    width={w * scale}
                    height={(hole.y1 - hole.y0) * scale}
                    fill={c.blueSoft}
                    stroke={c.blue}
                    strokeWidth={1.4}
                  />
                  {w * scale > 54 && (
                    <SvgText
                      x={px(x0 + w / 2)}
                      y={py(hole.y0) - 8}
                      fill={c.blue}
                      fontSize={10}
                      fontWeight="700"
                      textAnchor="middle">
                      {hole.seg.type === 'window'
                        ? 'Fenêtre'
                        : hole.seg.open
                        ? 'Passage'
                        : 'Porte'}
                    </SvgText>
                  )}
                </G>
              );
            })}

            {/* Repère d'accrochage, le temps du geste. */}
            {guide.x !== undefined && (
              <Line
                x1={px(guide.x)}
                y1={py(H) - 6}
                x2={px(guide.x)}
                y2={py(0) + 6}
                stroke={c.green}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            )}
            {guide.y !== undefined && (
              <Line
                x1={px(0) - 6}
                y1={py(guide.y)}
                x2={px(face.len) + 6}
                y2={py(guide.y)}
                stroke={c.green}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            )}

            {/* Appareils. Ceux de l'autre face restent visibles, en creux :
                savoir qu'une prise est déjà posée dos à dos évite de percer
                deux fois au même endroit. */}
            {mine.map((f) => {
              const s = FIXTURES[f.kind];
              const x = faceX(face, f.along);
              const w = Math.max(20, s.w * scale);
              const h = Math.max(20, s.h * scale);
              const on = f.id === selectedId;
              const ghost = f.side !== side;
              return (
                <G key={f.id} opacity={ghost ? 0.32 : 1}>
                  <Rect
                    x={px(x) - w / 2}
                    y={py(f.height) - h / 2}
                    width={w}
                    height={h}
                    rx={4}
                    fill={ghost ? 'none' : s.color}
                    stroke={on ? c.ink : ghost ? c.inkFaint : '#00000033'}
                    strokeWidth={on ? 2.4 : 1.2}
                    strokeDasharray={ghost ? '4 3' : '0'}
                  />
                  <SvgText
                    x={px(x)}
                    y={py(f.height) + 3.5}
                    fill={ghost ? c.inkFaint : '#FFFFFF'}
                    fontSize={Math.min(11, Math.max(8, w / 2.6))}
                    fontWeight="800"
                    textAnchor="middle">
                    {s.short}
                  </SvgText>
                  {on && (
                    <Circle
                      cx={px(x)}
                      cy={py(f.height)}
                      r={Math.max(w, h) / 2 + 7}
                      fill="none"
                      stroke={c.blue}
                      strokeWidth={1.6}
                    />
                  )}
                </G>
              );
            })}

            {/* Les trois cotes de l'appareil sélectionné. */}
            {selected && (
              <G>
                <Dim
                  x1={px(0)}
                  y1={py(selected.height)}
                  x2={px(selX)}
                  y2={py(selected.height)}
                  text={`${cm(selX)}`}
                  c={c}
                  push={{ x: -1, y: 0 }}
                />
                <Dim
                  x1={px(selX)}
                  y1={py(selected.height)}
                  x2={px(face.len)}
                  y2={py(selected.height)}
                  text={`${cm(face.len - selX)}`}
                  c={c}
                  push={{ x: 1, y: 0 }}
                />
                <Dim
                  x1={px(selX)}
                  y1={py(0)}
                  x2={px(selX)}
                  y2={py(selected.height)}
                  text={`${cm(selected.height)}`}
                  c={c}
                  vertical
                  push={{ x: 1, y: 0 }}
                />
              </G>
            )}
          </Svg>
        )}
      </View>

      {objectif && (
        <View style={styles.guide}>
          <View style={styles.guideHead}>
            <Text style={styles.guideTitle}>
              {`${objectif.nom} — ${objectif.poses} socle${
                objectif.poses > 1 ? 's' : ''
              } sur ${objectif.exiges}`}
            </Text>
            {objectif.poses >= objectif.exiges ? (
              <Text style={[styles.guideState, styles.guideOk]}>conforme</Text>
            ) : (
              <TouchableOpacity
                style={styles.guideFix}
                onPress={() => poser('prise', objectif.surPlan ? 1.1 : undefined)}>
                <Text style={styles.guideFixText}>
                  {objectif.surPlan ? '+ Prise à 110 cm' : '+ Poser une prise'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.guideBar}>
            <View
              style={[
                styles.guideFill,
                objectif.poses >= objectif.exiges && styles.guideFillOk,
                {
                  width: `${Math.min(
                    100,
                    (objectif.poses / objectif.exiges) * 100,
                  )}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.guideRule}>{objectif.regle}</Text>
        </View>
      )}

      {constats.map((issue) => (
        <View key={issue.code + issue.message} style={styles.warn}>
          <View style={styles.warnHead}>
            <Text style={styles.warnTitle} numberOfLines={2}>
              {issue.message}
            </Text>
            {issue.fix?.type === 'poser' && (
              <TouchableOpacity
                style={styles.warnFix}
                onPress={() =>
                  poser(
                    (issue.fix as { kind: FixtureKind }).kind,
                    (issue.fix as { height?: number }).height,
                  )
                }>
                <Text style={styles.warnFixText}>{issue.fix.label}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.warnRule}>{issue.regle}</Text>
        </View>
      ))}

      {hauteurKO && selected && (
        <View style={styles.warn}>
          <View style={styles.warnHead}>
            <Text style={styles.warnTitle}>{`Hauteur ${hauteurKO.sens}`}</Text>
            <TouchableOpacity
              style={styles.warnFix}
              onPress={() =>
                moveFixture(
                  selected.id,
                  selected.along,
                  SPECS[selected.kind].std,
                )
              }>
              <Text style={styles.warnFixText}>
                {`Remettre à ${cm(SPECS[selected.kind].std)} cm`}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.warnRule}>{hauteurKO.regle}</Text>
        </View>
      )}

      <View style={styles.fields}>
        {field('g', 'Gauche', selX)}
        {field('d', 'Droite', face.len - selX)}
        {field('h', 'Hauteur', selected?.height ?? 0)}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.actions}>
        <TouchableOpacity style={styles.primary} onPress={onAddRequest}>
          <Text style={styles.primaryText}>+ Appareil</Text>
        </TouchableOpacity>
        {selected && spec && (
          <>
            <TouchableOpacity
              style={styles.action}
              onPress={() =>
                moveFixture(selected.id, selected.along, spec.std)
              }>
              <Text style={styles.actionText}>
                Hauteur usuelle {cm(spec.std)} cm
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.action}
              onPress={() => flipFixture(selected.id)}>
              <Text style={styles.actionText}>Autre face</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.action}
              onPress={() => {
                removeFixture(selected.id);
                onSelect(null);
              }}>
              <Text style={styles.dangerText}>Supprimer</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Ligne de cote : trait, embouts, valeur sur fond plein. */
function Dim({
  x1,
  y1,
  x2,
  y2,
  text,
  c,
  vertical,
  push,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  c: Palette;
  vertical?: boolean;
  /** Où s'échapper quand la cote est trop courte pour porter son texte. */
  push?: { x: number; y: number };
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const w = text.length * 6.5 + 12;
  // Une cote de 20 cm fait 15 px de long : son texte n'y tient pas. On ne la
  // supprime surtout pas — c'est LA cote que l'électricien vient lire — on
  // sort l'étiquette du côté où il y a de la place.
  const trop = len < w + 6;
  const echap = trop ? (w / 2 + 8) : 0;
  const mx = (x1 + x2) / 2 + (push?.x ?? 0) * echap;
  const my = (y1 + y2) / 2 + (push?.y ?? 0) * echap;
  if (len < 3) return null;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.blue} strokeWidth={1} />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) => (
        <Line
          key={i}
          x1={vertical ? x - 4 : x}
          y1={vertical ? y : y - 4}
          x2={vertical ? x + 4 : x}
          y2={vertical ? y : y + 4}
          stroke={c.blue}
          strokeWidth={1}
        />
      ))}
      {trop && (
        <Line
          x1={(x1 + x2) / 2}
          y1={(y1 + y2) / 2}
          x2={mx}
          y2={my}
          stroke={c.blue}
          strokeWidth={0.8}
        />
      )}
      <Rect
        x={mx - w / 2}
        y={my - 8}
        width={w}
        height={16}
        rx={4}
        fill={c.surface}
        stroke={c.blue}
        strokeWidth={0.8}
      />
      <SvgText
        x={mx}
        y={my + 4}
        fill={c.blue}
        fontSize={10.5}
        fontWeight="800"
        textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    sheet: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: 14,
      width: '100%',
      ...shadowCard,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start' },
    headerTexts: { flex: 1, paddingRight: 8 },
    title: { color: c.ink, fontSize: 17, fontWeight: '800' },
    subtitle: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 2,
    },
    close: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeText: { color: c.inkSoft, fontSize: 15, fontWeight: '700' },
    canvas: {
      height: 250,
      marginTop: 10,
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      overflow: 'hidden',
    },
    guide: {
      marginTop: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    guideHead: { flexDirection: 'row', alignItems: 'center' },
    guideTitle: { color: c.ink, fontSize: 12.5, fontWeight: '800', flex: 1 },
    guideState: { fontSize: 11.5, fontWeight: '800' },
    guideFix: {
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    guideFixText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
    guideOk: { color: c.green },
    guideKo: { color: c.danger },
    guideBar: {
      height: 5,
      borderRadius: 3,
      backgroundColor: c.line,
      marginTop: 7,
      overflow: 'hidden',
    },
    guideFill: { height: 5, borderRadius: 3, backgroundColor: c.danger },
    guideFillOk: { backgroundColor: c.green },
    guideRule: {
      color: c.inkFaint,
      fontSize: 10.5,
      lineHeight: 14.5,
      marginTop: 7,
    },
    warn: {
      marginTop: 8,
      backgroundColor: c.surfaceSunken,
      borderLeftWidth: 3,
      borderLeftColor: c.danger,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    warnHead: { flexDirection: 'row', alignItems: 'center' },
    warnTitle: { color: c.danger, fontSize: 12.5, fontWeight: '800', flex: 1 },
    warnFix: {
      backgroundColor: c.danger,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    warnFixText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
    warnRule: { color: c.inkSoft, fontSize: 10.5, lineHeight: 14.5, marginTop: 3 },
    fields: { flexDirection: 'row', gap: 8, marginTop: 12 },
    field: { flex: 1 },
    fieldLabel: {
      color: c.inkFaint,
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 4,
    },
    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.lineStrong,
      paddingHorizontal: 10,
    },
    fieldInput: {
      flex: 1,
      color: c.ink,
      fontSize: 16,
      fontWeight: '700',
      paddingVertical: 9,
    },
    fieldUnit: { color: c.inkFaint, fontSize: 12, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 8, paddingVertical: 12 },
    primary: {
      backgroundColor: c.blue,
      borderRadius: radius.sm,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13.5 },
    action: {
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    actionText: { color: c.inkSoft, fontWeight: '700', fontSize: 13.5 },
    dangerText: { color: c.danger, fontWeight: '700', fontSize: 13.5 },
    ghost: {
      marginTop: 12,
      borderRadius: radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: c.surfaceSunken,
    },
    ghostText: { color: c.inkSoft, fontWeight: '600', fontSize: 14.5 },
  }),
);
