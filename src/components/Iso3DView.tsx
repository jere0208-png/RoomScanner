import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { themedStyles, useTheme, type Palette } from '../theme';
import {
  pointOnSeg,
  roomOf,
  segLength,
  wallQuads,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';

/** Milieu d'une ouverture, au sol. */
const midOf = (o: WallSeg): Pt => ({
  x: (o.a.x + o.b.x) / 2,
  z: (o.a.z + o.b.z) / 2,
});
import { dotStep, floorDots, inkOn, mixHex } from '../geometry/appearance';
import {
  faceDepth,
  buildScene,
  cutawayOpacity,
  isHiddenFace,
  sceneFraming,
  shadeFill,
  type P3,
  type ScenePalette,
} from '../geometry/scene3d';
import { floorsOf, useScanStore } from '../store/scanStore';
import {
  FIXTURES,
  assemblyTag,
  faceX,
  facePoint,
  postsOf,
  wallFace,
  type FixtureKind,
} from '../geometry/electrical';

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

interface Props {
  /** Mode contrôlé (aperçu d'export) : état de caméra fourni par le parent. */
  value?: View3DParams;
  onChange?: (v: View3DParams) => void;
  /** Cotes sur les arêtes (arêtes en noir). */
  showMeasures?: boolean;
  /**
   * Les repères électriques : la désignation posée sur chaque appareil, sa
   * hauteur et sa cote au bord.
   *
   * Ils sont indispensables pour poser, et encombrants pour montrer. Une
   * pièce équipée en porte une dizaine ; dès qu'on veut regarder le volume,
   * le lever de plan ou une couleur de mur, ils couvrent la moitié de la
   * scène. Comme tous les autres calques, ils s'éteignent.
   */
  showElecTags?: boolean;
  /** N'afficher qu'une pièce : ses murs, son sol, ses meubles. */
  focusRoomId?: string | null;
}

/**
 * Vue 3D axonométrique du scan, dérivée des mêmes données paramétriques
 * que le plan 2D : murs épais extrudés, portes/fenêtres, meubles.
 * Un doigt : tourner/incliner. Deux doigts : pincer pour zoomer, déplacer.
 */
export function Iso3DView({
  value,
  onChange,
  showMeasures,
  showElecTags = true,
  focusRoomId,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const allObjects = useScanStore((s) => s.objects);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const objects = useMemo(
    () => (showFurniture ? allObjects : []),
    [showFurniture, allObjects],
  );
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const solidWalls = useScanStore((s) => s.solidWalls);
  const allRooms = useScanStore((s) => s.rooms);
  // Coupe : on ne garde que la pièce visée, murs et meubles compris.
  const rooms = useMemo(
    () => (focusRoomId ? allRooms.filter((r) => r.id === focusRoomId) : allRooms),
    [allRooms, focusRoomId],
  );
  const keptWalls = useMemo(() => {
    if (!focusRoomId) return walls;
    const ids = new Set(rooms[0]?.wallIds ?? []);
    return walls.filter((w) => ids.has(w.id));
  }, [walls, rooms, focusRoomId]);
  const keptOpenings = useMemo(() => {
    if (!focusRoomId) return openings;
    return openings.filter((o) =>
      keptWalls.some((w) => pointOnSeg(midOf(o), w.a, w.b).dist < 0.6),
    );
  }, [openings, keptWalls, focusRoomId]);
  const keptObjects = useMemo(
    () =>
      focusRoomId ? objects.filter((o) => roomOf(o) === focusRoomId) : objects,
    [objects, focusRoomId],
  );
  // L'appareillage suit son mur : en coupe sur une pièce, les prises des
  // autres pièces s'en vont avec les murs qui les portaient.
  const allFixtures = useScanStore((s) => s.fixtures);
  const fixtures = useMemo(() => {
    if (!focusRoomId) return allFixtures;
    const ids = new Set(keptWalls.map((w) => w.id));
    return allFixtures.filter((f) => ids.has(f.wallId));
  }, [allFixtures, keptWalls, focusRoomId]);
  const floors = useMemo(() => floorsOf(rooms), [rooms]);
  const roomNames = useMemo(
    () => new Map(rooms.map((r) => [r.id, r.name])),
    [rooms],
  );
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
  const tapRef = useRef({ x: 0, y: 0, multi: false, t0: 0 });
  // Pendant un geste, les cotes sont masquées : c'est leur recalcul à
  // chaque frame qui faisait ramer les mouvements.
  const [interacting, setInteracting] = useState(false);

  // Créé UNE seule fois : un responder recréé en plein geste perd le suivi.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderGrant: (e, g) => {
        const t = e.nativeEvent.touches;
        setInteracting(true);
        tapRef.current = {
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
          multi: t.length >= 2,
          t0: Date.now(),
        };
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
        // Un second doigt, meme une fraction de seconde, ote au geste tout
        // droit a etre lu comme un tap au relachement.
        if (t.length >= 2) tapRef.current.multi = true;
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
        setInteracting(false);
        // Tap simple (sans glisser) : cadrer la vue sur le mur touché.
        //
        // « Sans glisser » ne suffisait pas : un pincement court laisse un
        // `dx` de centroïde minuscule, donc la vue se recadrait toute seule
        // au relâchement, comme si on avait tapé un mur. Un geste à deux
        // doigts n'est JAMAIS un tap — on s'en souvient pour toute la durée
        // du geste —, et un tap ne dure pas une seconde.
        const geste = tapRef.current;
        if (
          !geste.multi &&
          baseRef.current.mode === 'rotate' &&
          Math.abs(g.dx) + Math.abs(g.dy) < 6 &&
          Date.now() - geste.t0 < 500
        ) {
          focusRef.current?.(geste.x, geste.y);
        }
      },
      onPanResponderTerminate: () => setInteracting(false),
    }),
  ).current;

  // Palette 3D de l'app : neutres du thème + teintes des ouvertures.
  const palette: ScenePalette = useMemo(
    () => ({
      floor: c.surfaceSunken,
      floorStroke: c.lineStrong,
      wall: '#FFFFFF',
      wallStroke: '#8A94A6',
      wallTop: '#F4F7FB',
      wallTopStroke: '#94A0B4',
      opening: '#B9C2CE',
      door: c.amber,
      window: c.sky,
      passage: c.blue,
      object: '#D8E1F2',
      objectTop: '#E9EEF9',
      objectStroke: '#9FACBF',
    }),
    [c],
  );

  // Scène partagée avec le PDF : mêmes onglets, mêmes bandes, mêmes couleurs.
  const scene = useMemo(
    () =>
      buildScene(keptWalls, keptOpenings, keptObjects, {
        palette,
        colorOpenings,
        showSurfaces,
        showTextures,
        floors,
        rooms,
        fixtures,
        // Pendant un geste : mêmes volumes et mêmes contours, mais des pans
        // d'un seul tenant. C'est le découpage en bandes qui coûtait cher,
        // pas les contours — les supprimer faisait fondre le modèle en blanc.
        coarse: interacting,
      }),
    [
      keptWalls,
      keptOpenings,
      keptObjects,
      palette,
      colorOpenings,
      showSurfaces,
      showTextures,
      floors,
      rooms,
      fixtures,
      interacting,
    ],
  );
  const faces = scene.faces;

  // Centre pris sur la BOÎTE ENGLOBANTE, jamais sur la moyenne des points :
  // la moyenne dépend de la finesse du découpage, et le modèle sauterait au
  // début de chaque geste, quand la scène passe en pans d'un seul tenant.
  const { center, radius3d } = useMemo(() => sceneFraming(faces), [faces]);

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

    // Faces de volume qui tournent le dos à la caméra : jetées avant même
    // d'être projetées. Un mur ne peut donc plus montrer ses deux faces à la
    // fois, et aucun tri en profondeur n'a à les départager.
    const cam = { ct, st, cp, sp };
    const polys = faces
      .filter((face) => !isHiddenFace(face, cam))
      .map((face) => {
      const proj = face.pts.map(project);
      // Une arête se trie avec le pan qu'elle borde (`depthAt`), pas sur sa
      // propre position : sinon l'arête basse d'un mur passe avant lui et le
      // pan la repeint — c'est ce qui effaçait le silhouettage.
      const depth = faceDepth(face, project, cam);

      // Lumière liée à la caméra : les pans face à nous sont clairs, ceux de
      // profil s'assombrissent — le volume se lit immédiatement.
      const fill = shadeFill(face, ct, st) ?? 'none';
      // Écorché : un mur qui nous fait face s'efface pour laisser voir la
      // pièce. Il garde son arête, donc sa présence.
      const voile =
        !solidWalls && face.cutaway && face.normal
          ? cutawayOpacity(face.normal, cam)
          : 1;

      // Mode cotes : toutes les arêtes en noir.
      // Un pan sans contour propre est bordé de SA PROPRE couleur : sans ça,
      // l'anticrénelage laisse une couture blanche entre deux bandes voisines
      // et le mur paraît fait de morceaux.
      // Mode cotes : arêtes en noir — SAUF les passages, dont le bleu
      // pointillé est justement ce qui les distingue d'un panneau.
      const stroke =
        showMeasures && !face.isFloor && !face.dashed && face.stroke
          ? '#0B0D12'
          : face.stroke ?? fill;
      return { proj, depth, fill, stroke, voile, dashed: !!face.dashed };
      });

    // Cotes insérées DANS le tri de profondeur : un mur proche recouvre
    // les cotes des éléments situés derrière lui (fini les fuites).
    type Item =
      | {
          kind: 'poly';
          depth: number;
          proj: typeof polys[0]['proj'];
          fill: string;
          stroke: string;
          /** Écorché : 1 = plein, 0,15 = mur effacé pour voir la pièce. */
          voile: number;
          dashed: boolean;
        }
      | { kind: 'dot'; depth: number; x: number; y: number; color: string }
      | {
          kind: 'elec';
          /** Bout de la ligne de cote vers le bord du mur. */
          bx?: number;
          by?: number;
          /** Bout de la ligne de cote vers le sol. */
          sx?: number;
          sy?: number;
          /** Désignation courte, posée au-dessus de l'appareil. */
          nom?: string;
          depth: number;
          x: number;
          y: number;
          color: string;
          /** Opacité du point de repère : 1 de loin, 0 dès qu'on voit la plaque. */
          pastille: number;
          /** Cotes lues sur la face, affichées une fois zoomé dessus. */
          haut?: string;
          bord?: string;
        }
      | {
          kind: 'label';
          depth: number;
          x: number;
          y: number;
          angle: number;
          text: string;
          /** Les cotes de détail apparaissent en fondu, avec le zoom. */
          opacity: number;
        }
      | {
          kind: 'area';
          depth: number;
          x: number;
          y: number;
          /** Nom de la pièce, tel qu'il est posé sur le plan 2D. */
          name: string;
          area: string;
        };
    const items: Item[] = polys.map((p) => ({ kind: 'poly' as const, ...p }));

    // Semis du sol : même code que le plan 2D, projeté sur le plan y = 0.
    // C'est ce fond pointillé qui distingue la surface au sol des murs.
    if (showSurfaces && !interacting) {
      // Une pièce = un semis et une étiquette. Le budget de points est
      // partagé : dix pièces ne doivent pas coûter dix fois plus cher.
      const budget = Math.max(80, Math.round(350 / Math.max(1, scene.rooms.length)));
      for (const room of scene.rooms) {
        if (!room.surface) continue;
        const base = room.floorFill;
        const dotColor = mixHex(base, inkOn(base), 0.42);
        for (const p of floorDots(room.surface.pts, dotStep(scale, 22), budget)) {
          const q = project({ x: p.x, y: 0, z: p.z });
          items.push({ kind: 'dot', depth: -Infinity, x: q.sx, y: q.sy, color: dotColor });
        }
        // Même cartouche qu'en 2D, au même endroit : le nom donné sur le
        // plan se retrouve au centre de la pièce sur le modèle.
        // Posé au large de la pièce, et par-dessus tout le reste : c'est
        // une annotation, pas un volume — un mur ne doit pas la trancher.
        const q = project({ x: room.labelAt.x, y: 0, z: room.labelAt.z });
        items.push({
          kind: 'area',
          depth: Infinity,
          x: q.sx,
          y: q.sy,
          name: roomNames.get(room.roomId) ?? '',
          area: `${room.surface.exact ? '' : '≈ '}${room.surface.area
            .toFixed(1)
            .replace('.', ',')} m²`,
        });
      }
    }

    // ------------------------------------------- appareillage électrique
    // Le volume posé sur le mur fait 8 cm : à l'échelle d'un logement
    // entier, c'est deux pixels. On pose donc au-dessus un repère de taille
    // FIXE pour qu'un appareil se voie quel que soit le zoom.
    if (!interacting && showElecTags) {
      const quads = wallQuads(keptWalls);
      const byId = new Map(keptWalls.map((w) => [w.id, w]));

      // Un ensemble se désigne UNE fois : deux prises sous une même plaque
      // ne portent pas deux étiquettes, ni deux jeux de cotes.
      const lots = new Map<string, typeof fixtures>();
      for (const f of fixtures) {
        const cle = f.group ? `g:${f.group}:${f.wallId}:${f.side}` : `s:${f.id}`;
        const l = lots.get(cle);
        if (l) l.push(f);
        else lots.set(cle, [f]);
      }

      for (const lot of lots.values()) {
        const w = byId.get(lot[0].wallId);
        if (!w) continue;
        const face = wallFace(w, quads.get(w.id), lot[0].side);
        // Face qui tourne le dos à la caméra : l'appareil est derrière le
        // mur, on ne le montre pas (même test que `isHiddenFace`).
        if (face.nx * st * sp + face.nz * ct * sp <= 0) continue;

        // L'emprise de la plaque commune, et les postes qu'elle porte.
        const postes: FixtureKind[] = [];
        let x0 = Infinity;
        let x1 = -Infinity;
        let saillie = 0;
        for (const f of lot) {
          const sp2 = FIXTURES[f.kind];
          const cx = faceX(face, f.along);
          x0 = Math.min(x0, cx - sp2.w / 2);
          x1 = Math.max(x1, cx + sp2.w / 2);
          saillie = Math.max(saillie, sp2.depth);
          postes.push(...postsOf(f.kind));
        }
        const x = (x0 + x1) / 2;
        const hauteur =
          lot.reduce((t, f) => t + f.height, 0) / lot.length;
        const p = facePoint(face, x, saillie + 0.01);
        const q = project({ x: p.x, y: hauteur, z: p.z });

        // Tant que la plaque est trop petite pour se voir, un point de sa
        // couleur en tient lieu ; il s'efface à mesure qu'elle grandit.
        const taille = (x1 - x0) * scale;
        const pastille = Math.max(0, Math.min(1, (16 - taille) / 8));

        // Les deux cotes se lisent comme sur un plan : un filet pointillé
        // jusqu'au bord du mur, un autre jusqu'au sol, et le nombre posé
        // dessus.
        const versBord = x <= face.len / 2 ? 0 : face.len;
        const pb = facePoint(face, versBord, saillie + 0.01);
        const qb = project({ x: pb.x, y: hauteur, z: pb.z });
        const qs = project({ x: p.x, y: 0, z: p.z });
        items.push({
          kind: 'elec',
          pastille,
          // AU-DESSUS de la géométrie, comme les cartouches de pièce.
          //
          // Trié à sa profondeur, un repère bas — une prise à 20 cm —
          // passait AVANT le pan de mur qui le porte, et le mur le
          // repeignait aussitôt : on ne voyait plus que sa cote, qui
          // dépassait sous le mur. Un repère est une annotation, pas un
          // volume ; il se lit par-dessus, et c'est le masquage des faces
          // arrière qui l'empêche de traverser une cloison.
          depth: 1e6,
          x: q.sx,
          y: q.sy,
          color: FIXTURES[lot[0].kind].color,
          haut: scale > 90 ? `${Math.round(hauteur * 100)}` : undefined,
          bord:
            scale > 90
              ? `${Math.round(Math.abs(x - versBord) * 100)}`
              : undefined,
          // La désignation en toutes lettres, POSÉE SUR l'appareil. Le
          // symbole gravé se réduisait à trois traits gris : un mot se lit.
          nom: scale > 70 ? assemblyTag(postes) : undefined,
          bx: qb.sx,
          by: qb.sy,
          sx: qs.sx,
          sy: qs.sy,
        });
      }
    }

    if (showMeasures && !interacting) {
      /**
       * Niveau de détail, de 0 à 1, piloté par le zoom — la même idée qu'au
       * plan 2D. De loin, on ne garde que les grandes cotes : une vue
       * criblée de nombres ne se lit pas. En s'approchant, les petites
       * arêtes et les hauteurs sous plafond de CHAQUE mur apparaissent en
       * fondu, sans jamais sauter à l'écran.
       */
      const detail = Math.max(0, Math.min(1, (scale - 55) / 45));
      const edgeLabel = (
        p0: { sx: number; sy: number; depth: number },
        p1: { sx: number; sy: number; depth: number },
        text: string,
        /** Cote de détail : elle n'existe qu'une fois assez zoomé. */
        fine = false,
      ) => {
        const dx = p1.sx - p0.sx;
        const dy = p1.sy - p0.sy;
        const norm = Math.hypot(dx, dy) || 1;
        // Sous 22 px, le texte serait plus long que l'arête qu'il cote :
        // aucun zoom ne le rendrait lisible.
        if (norm < 22) return;
        const courte = norm < 46;
        const opacity = fine || courte ? detail : 1;
        if (opacity < 0.03) return;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        let n = { x: -dy / norm, y: dx / norm };
        if (n.y > 0) n = { x: -n.x, y: -n.y };
        items.push({
          kind: 'label',
          depth: (p0.depth + p1.depth) / 2 + 0.03,
          x: (p0.sx + p1.sx) / 2 + n.x * 9,
          y: (p0.sy + p1.sy) / 2 + n.y * 9,
          angle,
          text,
          opacity,
        });
      };
      // Les menuiseries : largeur sur le linteau, hauteur sur le tableau.
      // Ce sont des cotes de détail — elles n'apparaissent qu'en approchant,
      // sinon elles s'empilent sur celles du mur qui les porte.
      const solY = keptWalls.length
        ? Math.min(...keptWalls.map((x) => x.yCenter - x.height / 2))
        : 0;
      for (const o of keptOpenings) {
        const y0 = Math.max(0, o.yCenter - o.height / 2 - solY);
        const y1 = y0 + o.height;
        const pa = project({ x: o.a.x, y: y1, z: o.a.z });
        const pb = project({ x: o.b.x, y: y1, z: o.b.z });
        edgeLabel(pa, pb, `${segLength(o).toFixed(2).replace('.', ',')} m`, true);
        const bas = project({ x: o.a.x, y: y0, z: o.a.z });
        edgeLabel(bas, pa, `${o.height.toFixed(2).replace('.', ',')} m`, true);
      }

      const seenHeights = new Set<string>();
      for (const w of walls) {
        const pA = project({ x: w.a.x, y: w.height, z: w.a.z });
        const pB = project({ x: w.b.x, y: w.height, z: w.b.z });
        edgeLabel(pA, pB, `${segLength(w).toFixed(2).replace('.', ',')} m`);
        // La hauteur sous plafond : une seule de loin — elle est la même
        // partout —, puis celle de chaque mur quand on s'approche, sur son
        // arête verticale.
        const hKey = w.height.toFixed(2);
        const premiere = !seenHeights.has(hKey);
        seenHeights.add(hKey);
        const p0 = project({ x: w.a.x, y: 0, z: w.a.z });
        edgeLabel(p0, pA, `${hKey.replace('.', ',')} m`, !premiere);
      }
    }

    items.sort((p, q) => p.depth - q.depth);
    return items;
  }, [
    scene,
    faces,
    fixtures,
    keptWalls,
    keptOpenings,
    roomNames,
    layout,
    view,
    center,
    radius3d,
    showMeasures,
    showElecTags,
    showSurfaces,
    solidWalls,
    walls,
    interacting,
  ]);

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

    // Face au mur, du CÔTÉ où l'on regarde : on choisit l'orientation qui
    // demande la plus petite rotation depuis le point de vue actuel — la
    // face touchée vient vers la caméra, jamais celle de derrière.
    const phi = (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    const midw = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    const norm180 = (a: number) => ((a + 540) % 360) - 180;
    const cand = [-phi, -phi + 180].reduce((bestC, c2) =>
      Math.abs(norm180(c2 - v.theta)) < Math.abs(norm180(bestC - v.theta))
        ? c2
        : bestC,
    );
    // Continuité : on applique le delta au theta courant (pas de saut à 360°).
    const thetaN = v.theta + norm180(cand - v.theta);
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
            {rendered.map((item, i) =>
              item.kind === 'poly' ? (
                // Deux points = une arête : react-native-svg ne dessine pas
                // un polygone dégénéré, il faut une vraie ligne.
                item.proj.length === 2 ? (
                  <Line
                    key={i}
                    x1={item.proj[0].sx}
                    y1={item.proj[0].sy}
                    x2={item.proj[1].sx}
                    y2={item.proj[1].sy}
                    stroke={item.stroke}
                    strokeWidth={item.dashed ? 1.8 : 1}
                    strokeDasharray={item.dashed ? '6 4' : '0'}
                    strokeLinecap="round"
                    opacity={item.voile}
                  />
                ) : (
                <Polygon
                  key={i}
                  points={item.proj.map((q) => `${q.sx},${q.sy}`).join(' ')}
                  fill={item.fill}
                  stroke={item.stroke}
                  strokeWidth={item.dashed ? 1.8 : 1}
                  strokeDasharray={item.dashed ? '6 4' : '0'}
                  strokeLinejoin="round"
                  // L'aplat s'efface, l'arête reste : un mur estompé doit
                  // continuer à dire où il passe.
                  fillOpacity={item.voile}
                  strokeOpacity={0.25 + 0.75 * item.voile}
                />
                )
              ) : item.kind === 'dot' ? (
                <Circle key={i} cx={item.x} cy={item.y} r={1.1} fill={item.color} />
              ) : item.kind === 'elec' ? (
                <G key={i}>
                  {item.pastille > 0.02 && (
                    <>
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={6.5}
                        fill={c.surface}
                        opacity={item.pastille * 0.9}
                      />
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={4}
                        fill={item.color}
                        opacity={item.pastille}
                      />
                    </>
                  )}
                  {item.haut && (
                    <>
                      {/* Cote du bord : filet pointillé jusqu'au retour de
                          mur, nombre posé dessus. */}
                      <Line
                        x1={item.x}
                        y1={item.y}
                        x2={item.bx ?? item.x}
                        y2={item.by ?? item.y}
                        stroke={c.ink}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        opacity={0.5}
                      />
                      <SvgText
                        x={((item.bx ?? item.x) + item.x) / 2}
                        y={((item.by ?? item.y) + item.y) / 2 - 4}
                        fill={c.ink}
                        fontSize={9.5}
                        fontWeight="800"
                        textAnchor="middle">
                        {item.bord}
                      </SvgText>
                      {/* Cote du sol : même filet, à l'aplomb. */}
                      <Line
                        x1={item.x}
                        y1={item.y}
                        x2={item.sx ?? item.x}
                        y2={item.sy ?? item.y}
                        stroke={c.ink}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        opacity={0.5}
                      />
                      <SvgText
                        x={((item.sx ?? item.x) + item.x) / 2 + 7}
                        y={((item.sy ?? item.y) + item.y) / 2 + 3}
                        fill={c.ink}
                        fontSize={9.5}
                        fontWeight="800">
                        {item.haut}
                      </SvgText>
                      {/* La désignation, AU CENTRE de l'appareil. Deux
                          passes : un liseré clair dessous, le texte
                          par-dessus — sans quoi « PC » disparaît sur un
                          mécanisme ambre. */}
                      {item.nom && (
                        <>
                          <SvgText
                            x={item.x}
                            y={item.y + 3}
                            fill="none"
                            stroke={c.surface}
                            strokeWidth={2.6}
                            strokeLinejoin="round"
                            fontSize={9}
                            fontWeight="800"
                            textAnchor="middle">
                            {item.nom}
                          </SvgText>
                          <SvgText
                            x={item.x}
                            y={item.y + 3}
                            fill={c.ink}
                            fontSize={9}
                            fontWeight="800"
                            textAnchor="middle">
                            {item.nom}
                          </SvgText>
                        </>
                      )}
                    </>
                  )}
                </G>
              ) : item.kind === 'area' ? (
                (() => {
                  // Cartouche identique à celui du plan 2D : cadre, nom
                  // au-dessus, surface en dessous.
                  const label = item.name || item.area;
                  const wpx = Math.max(46, label.length * 7 + 18);
                  const hpx = item.name ? 38 : 24;
                  return (
                    <React.Fragment key={i}>
                      <Rect
                        x={item.x - wpx / 2}
                        y={item.y - hpx / 2}
                        width={wpx}
                        height={hpx}
                        rx={6}
                        fill={c.surface}
                        stroke={c.lineStrong}
                        strokeWidth={1}
                      />
                      {item.name !== '' && (
                        <SvgText
                          x={item.x}
                          y={item.y - 3}
                          fontSize={11}
                          fontWeight="700"
                          fill={c.ink}
                          textAnchor="middle">
                          {item.name}
                        </SvgText>
                      )}
                      <SvgText
                        x={item.x}
                        y={item.y + (item.name !== '' ? 12 : 4)}
                        fontSize={item.name !== '' ? 10 : 11}
                        fontWeight="700"
                        fill={c.inkSoft}
                        textAnchor="middle">
                        {item.area}
                      </SvgText>
                    </React.Fragment>
                  );
                })()
              ) : (
                <G key={i} opacity={item.opacity}>
                  <SvgText
                    x={item.x}
                    y={item.y}
                    fontSize={10}
                    fontWeight="700"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    textAnchor="middle"
                    transform={`rotate(${item.angle}, ${item.x}, ${item.y})`}>
                    {item.text}
                  </SvgText>
                  <SvgText
                    x={item.x}
                    y={item.y}
                    fontSize={10}
                    fontWeight="700"
                    fill="#0B0D12"
                    textAnchor="middle"
                    transform={`rotate(${item.angle}, ${item.x}, ${item.y})`}>
                    {item.text}
                  </SvgText>
                </G>
              ),
            )}
          </Svg>
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
}));
