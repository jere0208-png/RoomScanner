import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
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
  ajusterBlocs,
  coupeDevant,
  cutawayOpacity,
  dosTourne,
  povProjector,
  visibleAvecLeMur,
  type PovCamera,
  isHiddenFace,
  sceneFraming,
  shadeFill,
  roomRanks,
  type P3,
  type Scene,
  type ScenePalette,
} from '../geometry/scene3d';
import { hiddenByBox } from '../geometry/furniture';
import { parImage } from '../ui/parImage';
import { floorsOf, useScanStore } from '../store/scanStore';
import { CardinalRing } from './CardinalRing';
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

/**
 * LA TAILLE DU SIGLE (PC, INT…) SUIT LE ZOOM.
 *
 * Relevé du patron : « même en dézoomé ils sont trop gros — il faut une
 * intelligence de zoom qui augmente la taille des noms avec ». Écrit en 10
 * fixe, « PC » couvrait la moitié d'une chambre vue de loin. La taille est
 * donc une fonction du zoom (pixels par mètre), bornée aux deux bouts :
 * discret de loin sans devenir illisible, et jamais plus gros qu'avant de
 * près — au-delà, c'est la désignation longue qui prend le relais.
 */
export function tailleDuSigle(scale: number): number {
  return Math.max(5.5, Math.min(10, scale * 0.085));
}

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
  /**
   * L'ŒIL DANS LE LOGEMENT, au lieu de la maquette vue de loin.
   *
   * Quand cette caméra est fournie, la vue passe en PERSPECTIVE : on se tient
   * dans la pièce, à hauteur d'homme, et l'on tourne sur soi-même. Les murs
   * s'écartent, le plafond passe au-dessus. C'est la « visite » du chantier,
   * et ça ne sert qu'à montrer — on ne mesure pas sur une fuyante.
   */
  pov?: PovCamera | null;
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
  /**
   * N'AFFICHER QU'UN MUR — celui qu'on est en train de présenter.
   *
   * La visite guidée se place face à un mur et annonce ce qui s'y trouve.
   * Les trois autres restaient dans le champ : celui de gauche et celui de
   * droite fuyaient vers l'œil et mangeaient la moitié de l'image, et le
   * client ne savait plus lequel on lui montrait — on lui disait « ce
   * mur-là » devant quatre murs.
   *
   * À la différence de `focusRoomId`, qui écarte les murs AVANT de bâtir la
   * scène, celui-ci filtre à la peinture : un mur soudé à ses voisins tire
   * sa forme de tout le graphe — le retirer des entrées changerait les
   * onglets des coins du mur qu'on garde, et la maçonnerie présentée ne
   * serait plus celle du logement.
   */
  focusWallId?: string | null;
  /** Les points cardinaux autour de la vue, comme sur le plan. */
  showNorth?: boolean;
  /** Le calque du plafond, comme sur le plan 2D. */
  showCeiling?: boolean;
  /**
   * LES GAINES, en volume : le même calque que sur le plan.
   *
   * Sur le plan, un tireté suffit — on lit un tracé. Dans le modèle, on
   * prépare une pose : il faut voir le tube arriver au pied du mur et
   * remonter dans la cloison jusqu'à la boîte.
   */
  cableRoutes?: { id: string; path: Pt[] }[];
  /** Hauteur de l'appareil desservi, pour dessiner la remontée. */
  routeHeights?: Record<string, number>;
  /**
   * Force l'écorché, quel que soit le réglage de l'utilisateur.
   *
   * Pendant la présentation, on ne demande pas au client d'aller cocher
   * « murs pleins » : montrer un mur équipé en gardant opaque la cloison
   * qui se trouve devant, c'est ne rien montrer du tout.
   */
  cutaway?: boolean;
  /**
   * LES COTES DE LA PRÉSENTATION, EN FONDU — de 0 à 1.
   *
   * `null` = le comportement ordinaire (elles suivent le bouton « Cotes »
   * et le zoom). Un nombre = la présentation les pilote : toutes les cotes
   * du mur paraissent ENSEMBLE, en fondu, tiennent le temps qu'on les lise,
   * puis s'effacent.
   *
   * Elles se déroulaient auparavant comme un mètre qu'on tire, chaque filet
   * s'étirant de l'appareil vers le mur. Le geste était joli et il coûtait
   * cher : pendant qu'un filet s'allonge, son nombre n'est pas encore là, et
   * l'œil du client suit le mouvement au lieu de lire la valeur. Un mur
   * équipé porte huit cotes ; huit petits mouvements successifs, c'est du
   * bruit. Un fondu simultané pose le tout d'un coup, et l'on regarde.
   */
  elecCotes?: number | null;
  /**
   * RENDU ALLÉGÉ EN CONTINU — pour ce qui bouge tout seul.
   *
   * Le mode existait déjà, mais seulement pendant un geste : dès que le
   * doigt se lève, le modèle repasse en pans découpés. Une présentation,
   * elle, bouge sans qu'aucun doigt ne la touche : elle se rendait donc
   * toujours en qualité pleine, et un logement meublé — mille faces — ne
   * suivait plus. Vu de loin, en mouvement, la découpe en bandes ne se
   * voit pas ; les saccades, si.
   */
  light?: boolean;
  /**
   * LES PIÈCES À BÂTIR D'AVANCE.
   *
   * La présentation change de pièce à chaque étape, et chaque changement
   * refait le modèle : murs extrudés, mobilier, appareillage. Cent
   * millisecondes de calcul, pile au moment où la caméra part — un à-coup
   * par étape, toujours au même endroit, celui qu'on remarque.
   *
   * Avec cette liste, les modèles sont bâtis pendant le rideau de
   * préparation et rangés : les étapes n'ont plus qu'à les reprendre.
   */
  prebuildRooms?: (string | null)[];
}

/**
 * Vue 3D axonométrique du scan, dérivée des mêmes données paramétriques
 * que le plan 2D : murs épais extrudés, portes/fenêtres, meubles.
 * Un doigt : tourner/incliner. Deux doigts : pincer pour zoomer, déplacer.
 */
export function Iso3DView({
  pov,
  value,
  onChange,
  showMeasures,
  showElecTags = true,
  focusRoomId,
  focusWallId,
  showNorth = true,
  showCeiling = true,
  cableRoutes,
  routeHeights,
  cutaway,
  elecCotes = null,
  light = false,
  prebuildRooms,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const allObjects = useScanStore((s) => s.objects);
  const showFurniture = useScanStore((s) => s.showFurniture);
  const objects = useMemo(
    () => (showFurniture ? allObjects : []),
    [showFurniture, allObjects],
  );
  const north = useScanStore((s) => s.north);
  const ceiling = useScanStore((s) => s.ceiling);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const showSurfaces = useScanStore((s) => s.showSurfaces);
  const showTextures = useScanStore((s) => s.showTextures);
  const solidWallsReglage = useScanStore((s) => s.solidWalls);
  // La présentation impose l'écorché ; ailleurs, c'est le réglage qui décide.
  const solidWalls = cutaway === undefined ? solidWallsReglage : !cutaway;
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

  /*
    UN SEUL RENDU PAR IMAGE.

    Le tactile d'un iPhone récent remonte jusqu'à cent vingt fois par
    seconde. Chaque mouvement du doigt reconstruisait la scène entière —
    plusieurs centaines de tracés — alors qu'entre deux images affichées,
    tous les rendus intermédiaires sauf le dernier finissent à la poubelle :
    on calculait deux fois pour montrer une fois. C'est de la chaleur pure,
    et une image de retard.

    `viewRef` reste mis à jour SUR-LE-CHAMP — le geste s'appuie dessus pour
    calculer la suite, il ne peut pas attendre l'écran — et seul l'affichage
    est reporté au battement suivant.
  */
  const rendu = useRef(
    parImage<View3DParams>((v) => {
      if (changeRef.current) changeRef.current(v);
      else setInner(v);
    }),
  ).current;
  useEffect(() => rendu.annuler, [rendu]);

  const update = (v: View3DParams) => {
    viewRef.current = v;
    rendu(v);
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
  /**
   * Le classement du dernier calcul : l'angle où il a été fait, la scène à
   * laquelle il appartient, et la profondeur de chaque pan.
   */
  const ordreMemo = useRef<{
    theta: number;
    tilt: number;
    faces: typeof faces;
    d: Map<number, number>;
  } | null>(null);

  /*
    LE PINCEMENT NE RECALCULE RIEN.

    Relevé du patron : « plus les plans sont chargés en cotes et en meubles,
    plus au déplacement il est lent ». Zoomer et déplacer la maquette ne
    touche NI aux faces NI à leur ordre — c'est une transformation affine du
    résultat déjà projeté, et `fluidite3d.test.ts` le prouve à la décimale.
    Elle descend donc au pilote natif, comme sur le plan 2D : tant que les
    deux doigts sont posés, pas un rendu.

    La ROTATION, elle, ne peut pas s'éviter — tourner change ce qu'on voit.
    C'est là qu'intervient l'autre moitié : les arêtes se taisent (voir
    `interacting` plus bas).
  */
  const pince = useRef({
    tx: new Animated.Value(0),
    ty: new Animated.Value(0),
    ech: new Animated.Value(1),
  }).current;
  /** Le cadrage que le pincement a atteint, posé pour de bon au lâcher. */
  const vueVive = useRef(viewRef.current);
  /*
    ET ELLE REVIENT À PLAT AVEC LE RENDU, jamais avant — même piège que sur
    le plan 2D, où le patron a vu « l'ancienne position rapidement avant
    celle qu'on lâche » : une valeur animée se pose sur-le-champ, le dessin
    attend le rendu suivant, et il reste une image entre les deux.
  */
  useLayoutEffect(() => {
    pince.tx.setValue(0);
    pince.ty.setValue(0);
    pince.ech.setValue(1);
  }, [view, pince]);

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
        vueVive.current = viewRef.current;
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
          const zoom = clamp(base.v.zoom * (d / base.d0), 0.4, 4);
          vueVive.current = {
            theta: base.v.theta + twist,
            tilt: base.v.tilt,
            zoom,
            ox: base.v.ox + (mx - base.mx0),
            oy: base.v.oy + (my - base.my0),
          };
          /*
            LA TORSION EST LA SEULE À DEVOIR ÊTRE RENDUE : elle tourne le
            modèle. Le zoom et le déplacement passent par la couche, et l'on
            ne rejoue le dessin que si les doigts VRILLENT vraiment — un
            degré de tolérance, sinon le moindre tremblement rappelle le
            calcul qu'on cherche justement à éviter.
          */
          pince.ech.setValue(zoom / base.v.zoom);
          pince.tx.setValue(mx - base.mx0);
          pince.ty.setValue(my - base.my0);
          if (Math.abs(twist) > 1) {
            update({ ...vueVive.current, zoom: base.v.zoom, ox: base.v.ox, oy: base.v.oy });
          }
        } else {
          const ddx = g.dx - base.dx0;
          const ddy = g.dy - base.dy0;
          /*
            LA ROTATION NOURRIT LE CADRAGE RETENU, ELLE AUSSI.

            Relevé du patron : « le glisser d'un doigt ne prend pas la
            position qu'on relâche, on revient au point de départ ».
            Confier le pincement au pilote natif demandait de retenir à part
            le cadrage atteint, pour le poser au lâcher — et la rotation,
            qui continue de rendre à chaque image, ne l'alimentait pas. Le
            lâcher reposait donc la vue d'AVANT le geste.
          */
          vueVive.current = {
            ...base.v,
            // Glisser à droite « pousse » la face avant vers la droite.
            theta: base.v.theta - ddx * 0.45,
            tilt: clamp(base.v.tilt - ddy * 0.3, 15, 80),
          };
          update(vueVive.current);
        }
      },
      onPanResponderRelease: (_e, g) => {
        setInteracting(false);
        // Ce que le pincement a atteint devient le cadrage vrai, et la
        // couche revient à plat dans le même rendu : sinon la maquette
        // sauterait à sa taille d'avant le temps d'une image.
        update(vueVive.current);
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

  /**
   * LE MODÈLE DÉJÀ BÂTI SE RETROUVE, il ne se refait pas.
   *
   * Une pièce revue — la présentation qui repasse, un aller-retour entre
   * deux étapes — coûtait un modèle entier à chaque fois. On les range
   * par pièce, et on les jette dès que le plan bouge : le magasin est
   * remis à zéro par la même dépendance qui rebattrait les cartes.
   */
  const magasin = useRef(new Map<string, Scene>());
  /**
   * Le vidage saute le PREMIER passage.
   *
   * Un effet se joue après le rendu : au montage, il jetait le modèle que
   * ce rendu venait de bâtir, et le préchargement le refaisait derrière.
   * Trois constructions là où deux suffisent — c'est l'épreuve qui les a
   * comptées.
   */
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    magasin.current.clear();
  }, [
    walls,
    openings,
    objects,
    allFixtures,
    ceiling,
    palette,
    showSurfaces,
    showTextures,
    colorOpenings,
    showCeiling,
    cableRoutes,
    routeHeights,
    light,
  ]);

  /** Les entrées d'une pièce : le même filtrage que pour la pièce montrée. */
  const entreesDe = useCallback(
    (focus: string | null) => {
      const rs = focus ? allRooms.filter((r) => r.id === focus) : allRooms;
      const ids = new Set(rs[0]?.wallIds ?? []);
      const ws = focus ? walls.filter((w) => ids.has(w.id)) : walls;
      const os = focus
        ? openings.filter((o) =>
            ws.some((w) => pointOnSeg(midOf(o), w.a, w.b).dist < 0.6),
          )
        : openings;
      const murs = new Set(ws.map((w) => w.id));
      return {
        rooms: rs,
        walls: ws,
        openings: os,
        objects: focus ? objects.filter((o) => roomOf(o) === focus) : objects,
        fixtures: focus
          ? allFixtures.filter((f) => murs.has(f.wallId))
          : allFixtures,
      };
    },
    [allRooms, walls, openings, objects, allFixtures],
  );

  /** Bâtir la scène d'une pièce, ou la reprendre au magasin. */
  const batir = useCallback(
    (focus: string | null): Scene => {
      const cle = focus ?? '—';
      const deja = magasin.current.get(cle);
      if (deja) return deja;
      const e = entreesDe(focus);
      const faite = buildScene(e.walls, e.openings, e.objects, {
        palette,
        colorOpenings,
        showSurfaces,
        showTextures,
        floors: floorsOf(e.rooms),
        rooms: e.rooms,
        fixtures: e.fixtures,
        ceiling: showCeiling ? ceiling : [],
        routes: cableRoutes,
        routeHeights,
        coarse: true,
      });
      magasin.current.set(cle, faite);
      return faite;
    },
    [
      entreesDe,
      palette,
      colorOpenings,
      showSurfaces,
      showTextures,
      ceiling,
      showCeiling,
      cableRoutes,
      routeHeights,
    ],
  );

  /**
   * On bâtit d'avance, une fois, ce que la présentation va montrer.
   *
   * Le calcul est lourd et volontairement SYNCHRONE : il tombe derrière le
   * rideau de préparation, là où il ne se voit pas. Le geler ailleurs
   * serait impardonnable ; ici, c'est exactement le moment prévu pour ça.
   */
  useEffect(() => {
    if (!prebuildRooms || prebuildRooms.length === 0) return;
    for (const id of prebuildRooms) batir(id);
  }, [prebuildRooms, batir]);

  // Scène partagée avec le PDF : mêmes onglets, mêmes bandes, mêmes couleurs.
  const scene = useMemo(
    () =>
      light
        ? batir(focusRoomId ?? null)
        : buildScene(keptWalls, keptOpenings, keptObjects, {
            palette,
            colorOpenings,
            showSurfaces,
            showTextures,
            floors,
            rooms,
            fixtures,
            // Le plafond suit son propre calque, comme sur le plan :
            // superposé au mobilier, il ne se lit plus.
            ceiling: showCeiling ? ceiling : [],
            routes: cableRoutes,
            routeHeights,
            /*
              LES MURS GARDENT LEURS BANDES, MÊME EN PLEIN GESTE.

              Relevé du chantier, capture à l'appui : « il y a des modèles 3D
              qui se font superposer par des murs lorsqu'on reste appuyé pour
              tourner ». Le meuble disparaît derrière un mur qui est pourtant
              derrière lui, et il revient dès qu'on lâche le doigt.

              La scène se bâtissait alors en mode GROSSIER — chaque mur d'un
              seul tenant au lieu d'être découpé en bandes de soixante
              centimètres — pour alléger le rendu. Or c'est le découpage qui
              permet au tri du peintre de départager un mur long d'un objet
              posé devant lui : d'un seul tenant, le mur ne porte plus qu'UNE
              profondeur, celle de son centre, et il passe devant ou derrière
              EN BLOC. Un meuble placé devant sa moitié proche se retrouve
              classé derrière tout le mur.

              Le mode grossier disparaît donc, et avec lui deux dépenses
              qu'on ne voyait pas : la scène entière était RECONSTRUITE au
              premier contact du doigt, puis une seconde fois au lâcher —
              deux fois le calcul le plus lourd de la vue, à chaque geste.
              Ce qu'on croyait économiser en pans, on le payait en
              reconstructions. Le geste reste allégé là où c'est sans
              conséquence : cotes, étiquettes et surfaces se taisent tant que
              le doigt est posé.
            */
          }),
    [
      keptWalls,
      keptOpenings,
      keptObjects,
      light,
      cableRoutes,
      routeHeights,
      palette,
      colorOpenings,
      showSurfaces,
      showTextures,
      floors,
      rooms,
      ceiling,
      showCeiling,
      fixtures,
      batir,
      focusRoomId,
    ],
  );
  const faces = scene.faces;

  // Centre pris sur la BOÎTE ENGLOBANTE, jamais sur la moyenne des points :
  // la moyenne dépend de la finesse du découpage. La scène ne change plus de
  // finesse en cours de geste, mais la règle reste la bonne — un centre qui
  // dépend du nombre de points est un centre qui bouge pour rien.
  const { center, radius3d } = useMemo(() => sceneFraming(faces), [faces]);

  const rendered = useMemo(() => {
    if (layout.w === 0 || layout.h === 0) return null;
    const ct = Math.cos(rad(view.theta));
    const st = Math.sin(rad(view.theta));
    const cp = Math.cos(rad(view.tilt));
    const sp = Math.sin(rad(view.tilt));
    const scale = ((Math.min(layout.w, layout.h) * 0.44) / radius3d) * view.zoom;

    /*
      DEUX PROJECTIONS, UN SEUL RESTE.

      En perspective, l'œil est DANS la pièce : les fuyantes convergent, et
      c'est la position de l'œil — non plus une direction unique — qui dit
      quelles faces nous montrent leur dos. Tout le reste du rendu ne
      s'aperçoit de rien : mêmes faces, même tri du plus lointain au plus
      proche, mêmes couleurs.
    */
    const perspective = pov ? povProjector(pov, layout) : null;
    const project = perspective
      ? (p: P3) => perspective(p)
      : (p: P3) => {
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
    // Le rang des pièces pour CETTE caméra : de la plus lointaine à la plus
    // proche. C'est lui qui empêche le mobilier de la pièce voisine de se
    // voir au travers de la cloison mitoyenne.
    const rangs = roomRanks(scene.rooms, cam);
    const polys = faces
      .filter((face) =>
        pov ? !dosTourne(face, pov.at) && !face.isFloor : !isHiddenFace(face, cam),
      )
      /*
        UN MUR PRÉSENTÉ, C'EST LUI SEUL.

        On ne retire QUE ce qui appartient à un autre mur : sa maçonnerie,
        ses menuiseries, l'appareillage qui y est plaqué. Le sol, le
        mobilier et le plafond restent — ils situent la pièce, et une pièce
        vide autour d'un pan de mur ne se comprend plus.

        Le filtre est posé APRÈS le cadrage : la vue garde le centre et
        l'échelle du logement entier, sinon le modèle sauterait à chaque
        mur présenté.
      */
      .filter((face) => visibleAvecLeMur(face, focusWallId))
      .map((face) => {
      // De l'intérieur, une face peut être à cheval sur le plan de l'œil :
      // on la taille avant de la projeter, sinon elle se retourne et barre
      // l'écran.
      // La coupe vaut pour les arêtes autant que pour les pans : un trait
      // qui traverse le plan de l'œil barre l'écran en diagonale.
      const pts = pov ? coupeDevant(face.pts, pov) : face.pts;
      const proj = pts.map(project);
      // Une arête se trie avec le pan qu'elle borde (`depthAt`), pas sur sa
      // propre position : sinon l'arête basse d'un mur passe avant lui et le
      // pan la repeint — c'est ce qui effaçait le silhouettage.
      // Le rang de la pièce entre dans le tri : deux pièces ne se
      // traversent pas, et leurs contenus se peignent l'un après l'autre.
      const depth = pov
        ? // En perspective, la profondeur est la distance à l'œil : ni rang
          // de pièce ni couche — on est dedans, il n'y a plus de « dehors ».
          proj.reduce((t, q) => t + q.depth, 0) / Math.max(1, proj.length)
        : faceDepth(face, project, cam, rangs);

      // Lumière liée à la caméra : les pans face à nous sont clairs, ceux de
      // profil s'assombrissent — le volume se lit immédiatement.
      /*
        LA LUMIÈRE SUIT LE REGARD, même quand l'œil est dans la pièce.

        L'ombrage se calcule par rapport à l'axe de la vue. En perspective,
        cet axe n'est plus celui de la maquette mais celui de la tête : sans
        ça, tous les murs reçoivent la même teinte et l'on se retrouve devant
        un aplat blanc, sans un angle pour dire où s'arrête la pièce.
      */
      const fill =
        (pov
          ? shadeFill(face, Math.cos(pov.yaw), Math.sin(pov.yaw))
          : shadeFill(face, ct, st)) ?? 'none';
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
      return {
        proj,
        depth,
        fill,
        stroke,
        voile,
        dashed: !!face.dashed,
        owner: face.ownerId,
        room: face.roomId,
        // Le pan, et l'arête qui le borde : elles voyagent ensemble dans
        // l'ordre de peinture (voir `ajusterBlocs`).
        pan: face.panId,
        bord: face.bordDe,
      };
      });
    // Ce que la coupe a entièrement retranché — une face derrière l'œil —
    // n'a plus rien à dessiner.
    const dessinables = pov ? polys.filter((p) => p.proj.length >= 2) : polys;
    /*
      PENDANT UN GESTE, ON GARDE LE CLASSEMENT DU DERNIER REPOS.

      Le classement exact — chaque face départagée à l'écran, là où elle en
      recouvre une autre — coûte une dizaine de millisecondes sur un logement
      meublé : trop pour le refaire trente fois par seconde. On repliait donc
      la scène sur la règle des couches le temps du geste, et cette règle lâche
      justement dans les angles rasants. Le chantier l'a vu deux fois : un mur
      qui passe devant toute la pièce en pleine rotation, et un coussin de
      canapé qui paraît plus bas que son voisin selon l'angle — « tout n'est
      pas comme un vrai modèle 3D, fixe dans toutes les positions ».

      Or une scène qui tourne ne change pas de FORME, seulement d'angle : un
      ordre juste à un angle le reste quelques degrés plus loin. On le
      recalcule donc tous les quatre degrés, et l'on réutilise le précédent
      entre-temps — chaque pan retrouve sa profondeur par son numéro, chaque
      arête suit le sien. Le coût moyen retombe au quart, et le modèle garde
      le classement EXACT dans toutes les positions.
    */
    const memoire = ordreMemo.current;
    const perime =
      !memoire ||
      Math.abs(view.theta - memoire.theta) > 4 ||
      Math.abs(view.tilt - memoire.tilt) > 4 ||
      memoire.faces !== faces;
    if (perime) {
      ajusterBlocs(dessinables, false);
      const table = new Map<number, number>();
      for (const p of dessinables) {
        if (p.pan !== undefined) table.set(p.pan, p.depth);
      }
      ordreMemo.current = {
        theta: view.theta,
        tilt: view.tilt,
        faces,
        d: table,
      };
    } else {
      for (const p of dessinables) {
        const d = p.pan !== undefined ? memoire!.d.get(p.pan) : undefined;
        if (d !== undefined) p.depth = d;
        else if (p.bord !== undefined) {
          const dp = memoire!.d.get(p.bord);
          if (dp !== undefined) p.depth = dp + 1e-6;
        }
      }
    }

    // Cotes insérées DANS le tri de profondeur : un mur proche recouvre
    // les cotes des éléments situés derrière lui (fini les fuites).
    type Item =
      | {
          kind: 'poly';
          /** Le meuble dont ce pan fait partie, s'il en vient d'un. */
          owner?: string;
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
          /** Avancement du tracé des cotes, de 0 à 1. */
          fondu?: number;
          bx?: number;
          by?: number;
          /** Bout de la ligne de cote vers le sol. */
          sx?: number;
          sy?: number;
          /** Désignation courte, posée au-dessus de l'appareil. */
          nom?: string;
          /** Sa taille : elle grandit avec le zoom. */
          nomTaille?: number;
          depth: number;
          x: number;
          y: number;
          color: string;
          sigle?: string;
          /** Sa taille : elle suit le zoom, comme la désignation longue. */
          sigleTaille?: number;
          /** Opacité du point de repère : 1 de loin, 0 dès qu'on voit la plaque. */
          pastille: number;
          /** Cotes lues sur la face, affichées une fois zoomé dessus. */
          haut?: string;
          bord?: string;
          /**
           * Un meuble le cache.
           *
           * De loin, on n'en montre qu'un point de sa couleur : il ne s'agit
           * pas de lire l'appareil, mais de savoir qu'il y en a un. De près,
           * le meuble s'efface et le repère revient en entier.
           */
          derriere?: boolean;
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
    /*
      PENDANT QU'ON TOURNE, LES ARÊTES SE TAISENT.

      Tourner ne peut pas s'éviter : le modèle change de face, il faut le
      recalculer. Ce qu'on peut alléger, c'est ce qu'on repeint — et les
      arêtes en font une bonne part : cent trente-huit des quatre cent
      quatre-vingt-six faces du logement de référence, soit près d'un tiers
      du dessin (bien plus sur un meuble isolé, dont les trois quarts des
      faces sont des traits). Les taire ne touche pas au tri : une arête
      suit le pan qu'elle borde, la retirer ne déplace rien de ce qui
      reste.

      Le volume reste entièrement lisible : c'est l'ombrage des aplats qui
      dit la forme, pas le trait. Les contours reviennent au lâcher, quand
      on regarde vraiment.

      Le pincement, lui, ne passe pas par ici : il ne rend rien du tout.
    */
    const aPeindre =
      interacting && !pov
        ? dessinables.filter((p) => p.bord === undefined)
        : dessinables;
    const items: Item[] = aPeindre.map((p) => ({ kind: 'poly' as const, ...p }));
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

      /**
       * Les boîtes des meubles, dans le repère du monde.
       *
       * Un appareil posé derrière un rangement disparaît purement et
       * simplement du modèle : rien ne dit qu'il existe, et l'électricien
       * qui fait le tour compte une prise de moins. On regarde donc, image
       * par image, ce que chaque meuble intercepte.
       */
      const solY = Math.min(
        ...keptWalls.map((w2) => w2.yCenter - w2.height / 2),
      );
      const boites = keptObjects.map((o) => {
        const bas = o.transform[13] - o.height / 2 - solY;
        return {
          id: o.id,
          cx: o.transform[12],
          cz: o.transform[14],
          y0: bas,
          y1: bas + o.height,
          width: o.width,
          depth: o.depth,
          yaw: Math.atan2(o.transform[8], o.transform[10]),
        };
      });
      const versOeil = { x: st * sp, y: cp, z: ct * sp };

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
        const cachePar = boites.filter((b) =>
          hiddenByBox({ x: p.x, y: hauteur, z: p.z }, versOeil, b),
        );
        /**
         * LE MEUBLE NE S'EFFACE QUE SI LES MURS S'EFFACENT AUSSI.
         *
         * Le fondu répondait à un vrai besoin — voir la prise derrière le
         * rangement — mais il s'appliquait dans les DEUX modes. Murs
         * pleins, on se retrouvait avec un lit fantôme flottant dans une
         * pièce fermée : le modèle disait à la fois « ce mur est opaque »
         * et « ce meuble est transparent », deux affirmations qui ne
         * tiennent pas ensemble. En mode plein, on ne fond plus rien.
         */
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
          // Le sigle de la famille : c'est lui qu'on écrit de loin, à la
          // place du point de couleur.
          sigle: assemblyTag(postes),
          sigleTaille: tailleDuSigle(scale),
          /**
           * LES COTES D'UN APPAREIL SONT DES COTES.
           *
           * Elles s'affichaient en zoomant, quel que soit l'état du bouton
           * « Cotes » : on l'éteignait pour regarder le volume, les cotes
           * des murs disparaîbssaient, et celles des prises restaient —
           * avec leurs filets pointillés jusqu'au sol. Un calque qui
           * n'éteint que la moitié de ce qu'il nomme n'est pas un calque.
           */
          // La présentation décide seule quand les cotes paraissent ; sinon
          // c'est le bouton « Cotes », et le zoom.
          haut:
            (elecCotes === null ? showMeasures && scale > 90 : elecCotes > 0.02)
              ? `${Math.round(hauteur * 100)}`
              : undefined,
          bord:
            (elecCotes === null ? showMeasures && scale > 90 : elecCotes > 0.02)
              ? `${Math.round(Math.abs(x - versBord) * 100)}`
              : undefined,
          fondu: elecCotes === null ? 1 : Math.max(0, Math.min(1, elecCotes)),
          /*
            LA DÉSIGNATION VIENT AU ZOOM, ET SE POSE À CÔTÉ.

            Elle s'écrivait SUR l'appareil, à taille fixe, dès qu'on
            distinguait le logement : sur une vue d'ensemble, « DOUBLE PC »
            barrait le meuble qu'il désigne et couvrait ses voisins. C'est
            l'inverse de ce qu'on attend d'un plan — c'est petit d'abord, et
            plus on agrandit, plus on lit.

            Elle n'apparaît donc qu'au-delà de cent dix pixels par mètre,
            grandit avec le zoom, et se pose AU-DESSUS du repère : ce qu'on
            nomme reste visible.
          */
          nom: scale > 110 ? assemblyTag(postes) : undefined,
          nomTaille: Math.max(7, Math.min(11, 7 + (scale - 110) * 0.02)),
          /*
            CACHÉ PAR UN MEUBLE : le repère le dit, à tous les zooms.

            Ce drapeau ne valait qu'en dessous du zoom où le meuble
            s'effaçait — au-delà, l'appareil n'était plus « derrière »
            puisqu'on avait rendu le meuble fantôme. Le meuble reste
            maintenant plein : l'appareil est derrière lui, point.
          */
          derriere: cachePar.length > 0,
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

    /*
      LE FONDU DES MEUBLES A ÉTÉ RETIRÉ — il effaçait pour rien.

      Un meuble qui cachait un appareil passait à 22 % d'opacité une fois
      zoomé : c'est ce qui faisait « disparaître » le haut d'un rangement
      ou une tête de lit, d'un angle à l'autre, sans qu'on comprenne
      pourquoi. Deux meubles voisins détectés séparément par le scanner —
      le cas courant — et c'est la moitié d'une armoire qui s'évapore.

      Or le repère d'appareil est déjà peint PAR-DESSUS toute la géométrie
      (`depth: 1e6`, quelques lignes plus haut) : la prise derrière le
      rangement se voit de toute façon. On effaçait donc le meuble pour
      découvrir ce qui était déjà visible.
    */

    items.sort((p, q) => p.depth - q.depth);
    return items;
  }, [
    scene,
    faces,
    fixtures,
    elecCotes,
    keptWalls,
    keptOpenings,
    roomNames,
    layout,
    view,
    center,
    radius3d,
    showMeasures,
    showElecTags,
    keptObjects,
    showSurfaces,
    solidWalls,
    walls,
    interacting,
    pov,
    focusWallId,
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
        /*
          LA COUCHE DU PINCEMENT — elle porte le zoom et le déplacement
          pendant que les doigts sont posés, et rien du tout au repos.
          `collapsable={false}` : sans lui, Android la fond dans son parent
          et la transformation perd son support.
        */
        <Animated.View
          pointerEvents="none"
          collapsable={false}
          style={{
            transform: [
              { translateX: pince.tx },
              { translateY: pince.ty },
              { scale: pince.ech },
            ],
          }}>
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
                  {/* DERRIÈRE UN MEUBLE : un point de sa couleur, cerné de
                      blanc, et rien d'autre. On ne cherche pas à lire
                      l'appareil — le meuble est devant — mais à savoir
                      qu'il y en a un, sans quoi on en compte un de moins en
                      faisant le tour du modèle. En zoomant, le meuble
                      s'efface et le repère revient en entier. */}
                  {item.derriere && (
                    <>
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={5.2}
                        fill={c.surface}
                        opacity={0.92}
                      />
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={3.4}
                        fill={item.color}
                        opacity={0.55}
                      />
                      <Circle
                        cx={item.x}
                        cy={item.y}
                        r={5.2}
                        stroke={item.color}
                        strokeWidth={1}
                        strokeDasharray="2.2 2"
                        fill="none"
                        opacity={0.75}
                      />
                    </>
                  )}
                  {/*
                    LE SIGLE, ÉCRIT — et non un point de couleur.

                    Vu de loin, l'appareil se réduisait à une pastille : on
                    savait qu'il y avait quelque chose, jamais quoi. Le sigle
                    tient dans la même place et dit la nature ; son liseré
                    clair le détache d'un mur sombre comme d'un meuble.
                  */}
                  {!item.derriere && item.pastille > 0.02 && (
                    <>
                      <SvgText
                        x={item.x}
                        y={item.y + 3.4}
                        fill="none"
                        stroke={c.surface}
                        strokeWidth={2.8}
                        fontSize={item.sigleTaille ?? 10}
                        fontWeight="800"
                        textAnchor="middle"
                        opacity={item.pastille}>
                        {item.sigle}
                      </SvgText>
                      <SvgText
                        x={item.x}
                        y={item.y + 3.4}
                        fill={item.color}
                        fontSize={item.sigleTaille ?? 10}
                        fontWeight="800"
                        textAnchor="middle"
                        opacity={item.pastille}>
                        {item.sigle}
                      </SvgText>
                    </>
                  )}
                  {item.haut && (
                    <>
                      {/* Cote du bord : filet pointillé jusqu'au retour de
                          mur, nombre posé dessus. */}
                      {/* Le filet est ENTIER dès qu'il paraît : c'est son
                          opacité qui monte, pas sa longueur. Un trait qui
                          s'allonge attire l'œil sur le mouvement ; ce qu'on
                          veut faire lire, c'est le nombre au bout. */}
                      <Line
                        x1={item.x}
                        y1={item.y}
                        x2={item.bx ?? item.x}
                        y2={item.by ?? item.y}
                        stroke={c.ink}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        opacity={0.5 * (item.fondu ?? 1)}
                      />
                      {(item.fondu ?? 1) > 0.02 && (
                        <SvgText
                          x={((item.bx ?? item.x) + item.x) / 2}
                          y={((item.by ?? item.y) + item.y) / 2 - 4}
                          fill={c.ink}
                          fontSize={9.5}
                          fontWeight="800"
                          opacity={item.fondu ?? 1}
                          textAnchor="middle">
                          {item.bord}
                        </SvgText>
                      )}
                      {/* Cote du sol : même filet, à l'aplomb. */}
                      <Line
                        x1={item.x}
                        y1={item.y}
                        x2={item.sx ?? item.x}
                        y2={item.sy ?? item.y}
                        stroke={c.ink}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        opacity={0.5 * (item.fondu ?? 1)}
                      />
                      {(item.fondu ?? 1) > 0.02 && (
                        <SvgText
                          x={((item.sx ?? item.x) + item.x) / 2 + 7}
                          y={((item.sy ?? item.y) + item.y) / 2 + 3}
                          fill={c.ink}
                          fontSize={9.5}
                          fontWeight="800"
                          opacity={item.fondu ?? 1}>
                          {item.haut}
                        </SvgText>
                      )}
                      {/* La désignation, AU CENTRE de l'appareil. Deux
                          passes : un liseré clair dessous, le texte
                          par-dessus — sans quoi « PC » disparaît sur un
                          mécanisme ambre. */}
                      {item.nom && (
                        <>
                          <SvgText
                            x={item.x}
                            y={item.y - 13}
                            fill="none"
                            stroke={c.surface}
                            strokeWidth={2.6}
                            strokeLinejoin="round"
                            fontSize={item.nomTaille ?? 9}
                            fontWeight="800"
                            textAnchor="middle">
                            {item.nom}
                          </SvgText>
                          <SvgText
                            x={item.x}
                            y={item.y - 13}
                            fill={c.ink}
                            fontSize={item.nomTaille ?? 9}
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
            {/*
              LES POINTS CARDINAUX, ici aussi.

              Le plan les portait, pas la 3D — et c'est pourtant là qu'on
              tourne autour du logement jusqu'à ne plus savoir quel mur on
              regarde. L'angle se calcule autrement : la caméra tourne et
              s'incline, donc une direction du monde s'aplatit à l'écran.
              Le dessin, lui, est le même que sur le plan.
            */}
            {showNorth && north !== null && (
              <CardinalRing
                w={layout.w}
                h={layout.h}
                angleOf={(bearing) => {
                  // La direction du monde pour ce cap, dans le repère du
                  // scan : le nord y est à −`north` degrés de l'axe −Z.
                  const b = ((bearing - north) * Math.PI) / 180;
                  const dx = Math.sin(b);
                  const dz = -Math.cos(b);
                  const ct = Math.cos(rad(view.theta));
                  const st = Math.sin(rad(view.theta));
                  const cp = Math.cos(rad(view.tilt));
                  return Math.atan2((dx * st + dz * ct) * cp, dx * ct - dz * st);
                }}
              />
            )}
          </Svg>
        </Animated.View>
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
