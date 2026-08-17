/**
 * LA VISITE INTÉRIEURE — debout dans le logement relevé.
 *
 * Ce qui existait s'appelait « Modèle AR » et ouvrait le .usdz du scan dans
 * la visionneuse d'Apple : la maquette se posait sur la table du salon, en
 * réalité augmentée, avec l'image de la caméra derrière. Pour préparer une
 * pose, c'est l'inverse de ce qu'il faut — on veut se tenir À L'INTÉRIEUR,
 * là où l'on percera, et ne voir QUE ce qu'on a relevé.
 *
 * Alors on entre. Œil à 1,62 m, pouce gauche pour marcher, pouce droit pour
 * regarder, les murs qui arrêtent et les portes qui laissent passer. Aucune
 * image de caméra, aucun décor inventé : le fond est un noir neutre, et
 * tout ce qui s'affiche vient du relevé — cloisons et leurs épaisseurs,
 * menuiseries, mobilier, appareillage à sa hauteur, gaines dans la chape.
 *
 * Le calcul vit dans `geometry/walk.ts` et s'éprouve sans écran : la
 * découpe au plan proche, le tri du peintre, et surtout la marche — le banc
 * lance le visiteur cent fois d'un mètre dans soixante-douze directions et
 * vérifie qu'il ne sort jamais du logement ni ne franchit une cloison
 * ailleurs que par une porte.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';
import { useScanStore, floorsOf } from '../store/scanStore';
import { buildScene, type ScenePalette } from '../geometry/scene3d';
import {
  HAUTEUR_OEIL,
  departVisite,
  obstaclesOf,
  step,
  walkFaces,
  type WalkCam,
} from '../geometry/walk';
import type { Pt } from '../geometry/floorplan';
import { useTheme } from '../theme';

/** Vitesse de marche : 1,3 m/s — le pas d'un homme qui visite, pas qui court. */
const VITESSE = 1.3;
/** Sensibilité du regard : un balayage de l'écran fait un demi-tour. */
const SENSIBILITE = 0.006;
/** Ce que le pouce peut incliner le regard : ni les pieds, ni le zénith. */
const PITCH_MAX = 1.1;

export function WalkView({
  visible,
  onClose,
  cableRoutes,
  routeHeights,
}: {
  visible: boolean;
  onClose: () => void;
  cableRoutes?: { id: string; path: Pt[] }[];
  routeHeights?: Record<string, number>;
}) {
  const c = useTheme();
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const objects = useScanStore((s) => s.objects);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const ceiling = useScanStore((s) => s.ceiling);
  const showTextures = useScanStore((s) => s.showTextures);
  const floors = useMemo(() => floorsOf(rooms), [rooms]);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  /**
   * La caméra vit dans une référence, pas dans un état.
   *
   * Elle change trente fois par seconde ; passer par `setState` à chaque
   * image ferait recalculer les mémos de la scène — et la scène, elle, ne
   * bouge pas d'un millimètre pendant qu'on marche.
   */
  const cam = useRef<WalkCam>({
    x: 0,
    z: 0,
    y: HAUTEUR_OEIL,
    yaw: 0,
    pitch: -0.05,
  });
  const [, redessine] = useState(0);
  /** Direction du pouce gauche, en fraction de vitesse. */
  const marche = useRef({ avant: 0, cote: 0 });

  const palette: ScenePalette = useMemo(
    () => ({
      floor: '#3A4048',
      floorStroke: '#2A3038',
      wall: '#EDF1F6',
      wallStroke: '#7E8794',
      wallTop: '#DCE3EC',
      wallTopStroke: '#7E8794',
      opening: '#9FB2C6',
      door: c.amber,
      window: c.sky,
      passage: c.blue,
      object: '#C3CEDD',
      objectTop: '#D6DFEA',
      objectStroke: '#8994A5',
    }),
    [c],
  );

  /**
   * La scène est bâtie UNE FOIS, en pans d'un seul tenant.
   *
   * On la traverse à pied : le tri en profondeur se fait sur la distance à
   * l'œil, pas sur un découpage en bandes. Les bandes ne serviraient qu'à
   * multiplier les polygones — et à trente images par seconde, chaque
   * polygone se paie.
   */
  const scene = useMemo(
    () =>
      buildScene(walls, openings, objects, {
        palette,
        showSurfaces: true,
        showTextures,
        floors,
        rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
        fixtures,
        ceiling,
        routes: cableRoutes,
        routeHeights,
        ceilingSlab: true,
        coarse: true,
      }),
    [
      walls,
      openings,
      objects,
      rooms,
      fixtures,
      ceiling,
      floors,
      showTextures,
      palette,
      cableRoutes,
      routeHeights,
    ],
  );

  const obstacles = useMemo(
    () => obstaclesOf(walls, openings),
    [walls, openings],
  );

  /** Où l'on se pose en entrant : le point le plus dégagé du logement. */
  useEffect(() => {
    if (!visible) return;
    const xs = walls.flatMap((w) => [w.a.x, w.b.x]);
    const zs = walls.flatMap((w) => [w.a.z, w.b.z]);
    if (xs.length === 0) return;
    const depart = departVisite(obstacles, {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      z0: Math.min(...zs),
      z1: Math.max(...zs),
    });
    // Le regard part vers la pièce, pas vers le mur le plus proche : on
    // vise le centre du logement.
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    cam.current = {
      x: depart.x,
      z: depart.z,
      y: HAUTEUR_OEIL,
      yaw: Math.atan2(cx - depart.x, -(cz - depart.z)),
      pitch: -0.05,
    };
    redessine((n) => n + 1);
  }, [visible, obstacles, walls]);

  /** La boucle de marche : trente images par seconde, tant qu'on avance. */
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      const m = marche.current;
      if (m.avant === 0 && m.cote === 0) return;
      const k = VITESSE / 30;
      const cy = Math.cos(cam.current.yaw);
      const sy = Math.sin(cam.current.yaw);
      // Avant = vers les z négatifs quand le cap est nul, comme le plan.
      const dx = (m.avant * sy + m.cote * cy) * k;
      const dz = (-m.avant * cy + m.cote * sy) * k;
      const p = step(
        obstacles,
        { x: cam.current.x, z: cam.current.z },
        { x: cam.current.x + dx, z: cam.current.z + dz },
      );
      cam.current = { ...cam.current, x: p.x, z: p.z };
      redessine((n) => n + 1);
    }, 33);
    return () => clearInterval(t);
  }, [visible, obstacles]);

  /**
   * Le pouce DROIT tourne la tête — à l'INCRÉMENT, pas au cumul.
   *
   * `dx` d'un geste est mesuré depuis le début du glissement : l'utiliser
   * tel quel à chaque événement fait tourner la tête de plus en plus vite
   * pendant qu'on glisse, et un balayage tranquille finit en toupie. On ne
   * garde donc que ce qui a bougé DEPUIS LA DERNIÈRE IMAGE.
   */
  const dernier = useRef({ x: 0, y: 0 });
  const regard = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dernier.current = { x: 0, y: 0 };
      },
      onPanResponderMove: (_e, g) => {
        const dx = g.dx - dernier.current.x;
        const dy = g.dy - dernier.current.y;
        dernier.current = { x: g.dx, y: g.dy };
        cam.current = {
          ...cam.current,
          yaw: cam.current.yaw + dx * SENSIBILITE,
          pitch: Math.max(
            -PITCH_MAX,
            Math.min(PITCH_MAX, cam.current.pitch - dy * SENSIBILITE * 0.7),
          ),
        };
        redessine((n) => n + 1);
      },
    }),
  ).current;

  /** Le pouce GAUCHE marche : un manche, comme dans tous les jeux. */
  const [manche, setManche] = useState({ x: 0, y: 0 });
  const joystick = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => {
        const R = 44;
        const d = Math.hypot(g.dx, g.dy) || 1;
        const k = Math.min(1, d / R);
        const ux = (g.dx / d) * k;
        const uy = (g.dy / d) * k;
        setManche({ x: ux * R, y: uy * R });
        marche.current = { avant: -uy, cote: ux };
      },
      onPanResponderRelease: () => {
        setManche({ x: 0, y: 0 });
        marche.current = { avant: 0, cote: 0 };
      },
      onPanResponderTerminate: () => {
        setManche({ x: 0, y: 0 });
        marche.current = { avant: 0, cote: 0 };
      },
    }),
  ).current;

  const vues = useMemo(
    () =>
      layout.w > 0
        ? walkFaces(scene.faces, cam.current, layout.w, layout.h)
        : [],
    // La caméra est une référence : c'est `redessine` qui rythme le rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, layout, cam.current.x, cam.current.z, cam.current.yaw, cam.current.pitch],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View
        style={styles.plein}
        onLayout={(e) =>
          setLayout({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }>
        {/* LE MODÈLE, ET RIEN D'AUTRE. Le fond est un noir neutre : ni ciel
            peint, ni image de caméra — tout ce qu'on voit a été relevé. */}
        {layout.w > 0 && (
          <Svg width={layout.w} height={layout.h} style={styles.toile}>
            {vues.map((f, i) =>
              f.pts.length < 3 ? (
                <Polyline
                  key={i}
                  points={f.pts.map((p) => `${p.sx},${p.sy}`).join(' ')}
                  fill="none"
                  stroke={f.stroke ?? '#000'}
                  strokeWidth={1.2}
                  strokeDasharray={f.dashed ? '6 4' : undefined}
                />
              ) : (
                <Polygon
                  key={i}
                  points={f.pts.map((p) => `${p.sx},${p.sy}`).join(' ')}
                  fill={f.fill ?? 'none'}
                  stroke={f.stroke ?? 'none'}
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                />
              ),
            )}
          </Svg>
        )}

        {/* Le regard : toute la surface, sauf le coin du manche. */}
        <View style={styles.regard} {...regard.panHandlers} />

        {/* Le manche de marche, en bas à gauche : sous le pouce, là où il
            tombe naturellement quand on tient le téléphone à deux mains. */}
        <View style={styles.mancheZone} {...joystick.panHandlers}>
          <Svg width={112} height={112}>
            <Circle cx={56} cy={56} r={44} fill="rgba(255,255,255,0.10)" />
            <Circle
              cx={56 + manche.x}
              cy={56 + manche.y}
              r={20}
              fill="rgba(255,255,255,0.55)"
            />
          </Svg>
        </View>

        <TouchableOpacity
          style={styles.sortie}
          accessibilityLabel="Quitter la visite"
          onPress={onClose}>
          <Text style={styles.sortieTexte}>Quitter</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  plein: { flex: 1, backgroundColor: '#0B0E12' },
  toile: { position: 'absolute', left: 0, top: 0 },
  regard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  mancheZone: {
    position: 'absolute',
    left: 18,
    bottom: 34,
    width: 112,
    height: 112,
  },
  sortie: {
    position: 'absolute',
    right: 16,
    top: 54,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  sortieTexte: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
