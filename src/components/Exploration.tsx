/**
 * L'EXPLORATION — entrer dans la pièce, et s'y promener comme dans un jeu.
 *
 * Relevé du patron : « enlève la visualisation vidéo, mais ajoute un vrai
 * mode où l'on rentre dans la pièce créée, sous forme de point qui se balade
 * avec nos déplacements comme un jeu vidéo mobile, avec collisions sur murs
 * et meubles etc. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE DE TOUS LES JEUX MOBILES : deux pouces.
 *
 * Le gauche MARCHE — une manette sous le pouce, qui avance dans le sens où on
 * la pousse, d'autant plus vite qu'on la pousse loin. Le droit REGARDE — on
 * glisse, la tête tourne. Personne n'a à apprendre ce geste : il est celui de
 * tous les jeux de l'App Store, et c'est précisément le public qu'on vise.
 *
 * LE POINT QUI SE BALADE, c'est la mini-carte : le plan, et soi dessus, avec
 * le cône de ce qu'on regarde. On sait toujours où l'on est dans le logement
 * — ce que la vue à hauteur d'œil, à elle seule, ne dit jamais.
 *
 * CE QU'ON VOIT EST LA 3D DE L'APPLICATION, pas un rendu à part. La première
 * visite intérieure avait son propre dessin, et ses propres défauts ; celle-ci
 * montre ce que montre le volume — mêmes meubles, mêmes matières, mêmes
 * peintures — avec un sol et un plafond qu'il sait désormais tenir de
 * l'intérieur. La marche, elle, vit dans `geometry/exploration`, et s'éprouve
 * à la règle.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iso3DView } from './Iso3DView';
import { useScanStore } from '../store/scanStore';
import { filtrerAuNiveau, type Pt } from '../geometry/floorplan';
import {
  HAUTEUR_OEIL,
  deplacer,
  obstaclesDeLaVisite,
  pointDeDepart,
} from '../geometry/exploration';
import { haptic, releaseHaptic } from '../ui/haptic';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/**
 * LE PAS — 1,4 m/s à fond de manette : celui de quelqu'un qui visite.
 *
 * Plus vite, on traverse un séjour en deux secondes et l'on ne voit rien ;
 * plus lentement, on s'impatiente devant un couloir.
 */
export const VITESSE_MARCHE = 1.4;
/**
 * L'OUVERTURE DU REGARD — 68° EN LARGEUR, quelle que soit la forme de l'écran.
 *
 * La 3D compte son ouverture en HAUTEUR. Sur un téléphone tenu droit, 72° de
 * haut ne laissaient que 48° de large : on regardait le logement par une
 * fente, et, à deux mètres d'un mur, son pied tombait pile au bord bas de
 * l'écran — plus de sol du tout, ce qui se lit comme flotter. Les jeux fixent
 * l'ouverture sur la LARGEUR et en déduisent la hauteur ; on fait pareil.
 */
const OUVERTURE_LARGEUR = 68;
/** La hauteur qui donne cette largeur, pour un écran donné. */
const ouvertureVerticale = (w: number, h: number) => {
  if (!(w > 0) || !(h > 0)) return 72;
  const demi = ((OUVERTURE_LARGEUR / 2) * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(demi) * (h / w)) * 180) / Math.PI;
};
/**
 * LE REGARD PART UN PEU VERS LE SOL — 7°.
 *
 * C'est l'angle de quelqu'un qui entre dans une pièce : on regarde où l'on
 * met les pieds, et l'on voit le parquet, les meubles, la profondeur. Droit
 * devant, à hauteur d'œil, on ne voit que des murs.
 */
const TANGAGE_DEPART = -0.12;
/** Ce que le regard peut lever ou baisser : ni le plafond, ni les pieds. */
const TANGAGE_MAX = 0.6;
/** Un balayage de l'écran entier fait un peu plus d'un demi-tour. */
const SENSIBILITE = 0.0065;
/** Le rayon de la manette, en points : un pouce y tient sans viser. */
const RAYON_MANETTE = 58;
/** Au centre, la manette ne fait rien : le pouce posé tremble toujours. */
const ZONE_MORTE = 0.12;
/** Une image toutes les trente-trois millisecondes, pas davantage. */
const PERIODE = 33;

/** Où l'on se tient, et où l'on regarde — `lacet` à la façon de la 3D. */
interface Pose {
  x: number;
  z: number;
  /** 0 = z croissants, π/2 = x croissants (convention de `PovCamera`). */
  lacet: number;
  tangage: number;
}

/** L'avant et la droite du regard, couchés sur le sol. */
const reperes = (lacet: number) => ({
  avant: { x: Math.sin(lacet), z: Math.cos(lacet) },
  droite: { x: Math.cos(lacet), z: -Math.sin(lacet) },
});

/**
 * LA MANETTE — sous le pouce gauche.
 *
 * Elle tient SON état (la position du bouton) et n'écrit que dans une
 * référence : la bouger ne redessine pas la scène, qui ne se redessine qu'au
 * rythme de la boucle de marche. Un bouton qui suivrait le pouce en
 * redessinant tout le logement à chaque millimètre serait en retard sur lui.
 */
function Manette({
  surVecteur,
  styles,
  teinte,
}: {
  surVecteur: (v: { x: number; y: number }) => void;
  styles: ReturnType<typeof getStyles>;
  teinte: Palette;
}) {
  const [bouton, setBouton] = useState({ x: 0, y: 0 });
  const centre = useRef({ x: 0, y: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          // Le centre est là où le pouce s'est posé dans la base : on ne
          // vise pas le milieu exact d'un cercle qu'on ne regarde pas.
          const { locationX, locationY } = e.nativeEvent;
          centre.current = {
            x: Number.isFinite(locationX) ? locationX : RAYON_MANETTE,
            y: Number.isFinite(locationY) ? locationY : RAYON_MANETTE,
          };
          haptic('leger');
        },
        onPanResponderMove: (_e, g) => {
          let dx = g.dx;
          let dy = g.dy;
          const d = Math.hypot(dx, dy);
          if (d > RAYON_MANETTE) {
            dx = (dx / d) * RAYON_MANETTE;
            dy = (dy / d) * RAYON_MANETTE;
          }
          setBouton({ x: dx, y: dy });
          const vx = dx / RAYON_MANETTE;
          const vy = dy / RAYON_MANETTE;
          const force = Math.hypot(vx, vy);
          if (force < ZONE_MORTE) {
            surVecteur({ x: 0, y: 0 });
            return;
          }
          // Au-delà de la zone morte, la vitesse repart de zéro : sans ça,
          // on démarrerait d'un coup à douze pour cent.
          const k = (force - ZONE_MORTE) / (1 - ZONE_MORTE) / force;
          surVecteur({ x: vx * k, y: vy * k });
        },
        onPanResponderRelease: () => {
          setBouton({ x: 0, y: 0 });
          surVecteur({ x: 0, y: 0 });
        },
        onPanResponderTerminate: () => {
          setBouton({ x: 0, y: 0 });
          surVecteur({ x: 0, y: 0 });
        },
      }),
    [surVecteur],
  );
  return (
    <View
      {...pan.panHandlers}
      accessibilityLabel="Marcher"
      accessibilityHint="Poussez dans la direction où vous voulez aller"
      style={styles.manette}>
      <View
        pointerEvents="none"
        style={[
          styles.manetteBouton,
          {
            transform: [{ translateX: bouton.x }, { translateY: bouton.y }],
            backgroundColor: teinte.blue,
          },
        ]}
      />
    </View>
  );
}

/**
 * LE POINT QUI SE BALADE — la mini-carte.
 *
 * Le plan tel qu'on l'a vu en 2D, nord en haut, et soi dessus : un point et
 * le cône du regard. Elle ne tourne pas avec la tête, et c'est voulu : une
 * carte qui tourne ne se compare plus au plan qu'on vient de quitter.
 */
function MiniCarte({
  murs,
  pose,
  styles,
  teinte,
}: {
  murs: { a: Pt; b: Pt }[];
  pose: Pose;
  styles: ReturnType<typeof getStyles>;
  teinte: Palette;
}) {
  const T = 112;
  const marge = 10;
  const cadre = useMemo(() => {
    const xs = murs.flatMap((m) => [m.a.x, m.b.x]);
    const zs = murs.flatMap((m) => [m.a.z, m.b.z]);
    const x0 = Math.min(...xs);
    const z0 = Math.min(...zs);
    const l = Math.max(Math.max(...xs) - x0, Math.max(...zs) - z0, 1);
    return { x0, z0, k: (T - marge * 2) / l };
  }, [murs]);
  const px = (p: Pt) => ({
    x: marge + (p.x - cadre.x0) * cadre.k,
    y: marge + (p.z - cadre.z0) * cadre.k,
  });
  const ici = px(pose);
  const { avant } = reperes(pose.lacet);
  const demi = ((OUVERTURE_LARGEUR / 2) * Math.PI) / 180;
  const cone = (s: number) => {
    const c = Math.cos(s * demi);
    const n = Math.sin(s * demi);
    // L'avant tourné de ±demi, sur le plan (x à droite, z vers le bas).
    const dx = avant.x * c - avant.z * n;
    const dz = avant.x * n + avant.z * c;
    return { x: ici.x + dx * 22, y: ici.y + dz * 22 };
  };
  const g = cone(-1);
  const d = cone(1);
  return (
    <View style={styles.carte} pointerEvents="none" accessibilityLabel="Plan">
      <Svg width={T} height={T}>
        {murs.map((m, i) => {
          const a = px(m.a);
          const b = px(m.b);
          return (
            <Line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={teinte.ink}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.7}
            />
          );
        })}
        <Path
          d={`M${ici.x} ${ici.y} L${g.x} ${g.y} L${d.x} ${d.y} Z`}
          fill={teinte.blue}
          opacity={0.22}
        />
        <Circle cx={ici.x} cy={ici.y} r={6} fill="#FFFFFF" />
        <Circle cx={ici.x} cy={ici.y} r={4.5} fill={teinte.blue} />
      </Svg>
    </View>
  );
}

export function Exploration({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const marges = useSafeAreaInsets();

  // Le niveau qu'on regarde, et lui seul : on ne marche pas dans deux étages.
  const tousLesMurs = useScanStore((s) => s.walls);
  const toutesLesOuvertures = useScanStore((s) => s.openings);
  const toutesLesPieces = useScanStore((s) => s.rooms);
  const tousLesMeubles = useScanStore((s) => s.objects);
  const niveauCourant = useScanStore((s) => s.niveauCourant);
  const { walls, openings, rooms, objects } = useMemo(
    () =>
      filtrerAuNiveau(
        {
          walls: tousLesMurs,
          openings: toutesLesOuvertures,
          rooms: toutesLesPieces,
          fixtures: [],
          photos: [],
          objects: tousLesMeubles,
          ceiling: [],
        },
        niveauCourant,
      ),
    [tousLesMurs, toutesLesOuvertures, toutesLesPieces, tousLesMeubles, niveauCourant],
  );
  const obstacles = useMemo(
    () => obstaclesDeLaVisite(walls, openings, objects, rooms),
    [walls, openings, objects, rooms],
  );

  /*
    LA POSE VIT DANS UNE RÉFÉRENCE, ET L'ÉCRAN EN PREND UNE COPIE.

    La boucle de marche et le pouce du regard l'écrivent à chaque instant ;
    l'écran, lui, ne la relit qu'au rythme d'une image toutes les
    trente-trois millisecondes. Sans cette séparation, chaque millimètre de
    pouce redessinerait le logement entier.
  */
  const pose = useRef<Pose>({ x: 0, z: 0, lacet: 0, tangage: 0 });
  const [vue, setVue] = useState<Pose>(pose.current);
  const manette = useRef({ x: 0, y: 0 });
  const [aBouge, setABouge] = useState(false);
  const dernierRendu = useRef(0);

  // À chaque entrée : au cœur de la plus grande pièce, face à sa profondeur.
  useEffect(() => {
    if (!visible) return;
    const d = pointDeDepart(walls, rooms, obstacles);
    if (!d) return;
    // `yaw` est un angle du plan (0 = x croissants) ; la 3D compte depuis
    // les z croissants. La conversion se fait ici, une fois.
    pose.current = { x: d.at.x, z: d.at.z, lacet: Math.PI / 2 - d.yaw, tangage: TANGAGE_DEPART };
    setVue({ ...pose.current });
    setABouge(false);
    manette.current = { x: 0, y: 0 };
    // On n'y revient qu'en rouvrant : un plan modifié pendant la visite ne
    // doit pas téléporter le visiteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const montrer = (force = false) => {
    const t = Date.now();
    if (!force && t - dernierRendu.current < PERIODE) return;
    dernierRendu.current = t;
    setVue({ ...pose.current });
  };

  /*
    LA BOUCLE DE MARCHE — elle ne tourne que pendant qu'on marche.

    Pouce levé, rien ne bouge, et rien ne se redessine : une exploration
    posée sur une table ne doit pas vider la batterie à recalculer cinquante
    fois par seconde une image qui ne change pas.
  */
  const enMarche = useRef(false);
  const boucle = useRef<() => void>(() => {});
  boucle.current = () => {
    let avant = Date.now();
    const pas = () => {
      const j = manette.current;
      if (j.x === 0 && j.y === 0) {
        enMarche.current = false;
        releaseHaptic('butee');
        montrer(true);
        return;
      }
      const t = Date.now();
      const dt = Math.min(0.1, (t - avant) / 1000);
      avant = t;
      const p = pose.current;
      const { avant: f, droite: r } = reperes(p.lacet);
      // Pousser vers le haut, c'est avancer : l'axe y de l'écran est inversé.
      const v = VITESSE_MARCHE * dt;
      const vise = {
        x: p.x + (f.x * -j.y + r.x * j.x) * v,
        z: p.z + (f.z * -j.y + r.z * j.x) * v,
      };
      const arrive = deplacer({ x: p.x, z: p.z }, vise, obstacles);
      /*
        LA BUTÉE SE SENT, UNE FOIS. Un mur contre lequel on pousse arrête
        presque tout le pas : une secousse le dit à la main, sans qu'on ait à
        regarder. Elle ne se répète qu'après qu'on s'en est écarté — sans
        quoi longer une cloison vibrerait sans fin.
      */
      const voulu = Math.hypot(vise.x - p.x, vise.z - p.z);
      const fait = Math.hypot(arrive.x - p.x, arrive.z - p.z);
      if (voulu > 1e-4 && fait < voulu * 0.25) haptic('butee', true);
      else if (fait > voulu * 0.6) releaseHaptic('butee');
      pose.current = { ...p, x: arrive.x, z: arrive.z };
      montrer();
      requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  };

  const surVecteur = useMemo(
    () => (v: { x: number; y: number }) => {
      manette.current = v;
      if ((v.x !== 0 || v.y !== 0) && !enMarche.current) {
        enMarche.current = true;
        setABouge(true);
        boucle.current();
      }
    },
    [],
  );

  // Le regard : sous le pouce droit, on glisse et la tête tourne.
  const departRegard = useRef({ lacet: 0, tangage: 0 });
  const regard = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          departRegard.current = {
            lacet: pose.current.lacet,
            tangage: pose.current.tangage,
          };
        },
        onPanResponderMove: (_e, g) => {
          const lacet = departRegard.current.lacet + g.dx * SENSIBILITE;
          const tangage = Math.max(
            -TANGAGE_MAX,
            Math.min(TANGAGE_MAX, departRegard.current.tangage - g.dy * SENSIBILITE),
          );
          pose.current = { ...pose.current, lacet, tangage };
          setABouge(true);
          montrer();
        },
        onPanResponderRelease: () => montrer(true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { width: largeur, height: hauteur } = useWindowDimensions();
  const camera = useMemo(
    () => ({
      at: { x: vue.x, y: HAUTEUR_OEIL, z: vue.z },
      yaw: vue.lacet,
      pitch: vue.tangage,
      fov: ouvertureVerticale(largeur, hauteur),
    }),
    [vue, largeur, hauteur],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={styles.fond}>
        {/* La 3D, à hauteur d'œil. Elle ne prend aucun doigt : les deux
            pouces sont pour la manette et le regard. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {visible && walls.length > 0 && (
            <Iso3DView pov={camera} showMeasures={false} showNorth={false} />
          )}
        </View>

        {/* Le regard occupe tout l'écran SOUS la manette et la carte. */}
        <View
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Regarder autour"
          accessibilityHint="Glissez pour tourner la tête"
          {...regard.panHandlers}
        />

        <View style={[styles.haut, { top: marges.top + 8 }]} pointerEvents="box-none">
          <MiniCarte
            murs={walls}
            pose={vue}
            styles={styles}
            teinte={teinte}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Terminer l’exploration"
            style={({ pressed }) => [styles.terminer, pressed && styles.enfonce]}
            hitSlop={10}
            onPress={() => {
              manette.current = { x: 0, y: 0 };
              onClose();
            }}>
            <Text style={styles.terminerTexte}>Terminer</Text>
          </Pressable>
        </View>

        {/*
          LA CONSIGNE, TANT QU'ON N'A PAS BOUGÉ — et pas une seconde de plus.
          Le geste est celui de tous les jeux mobiles ; une phrase suffit à le
          rappeler, et elle s'efface dès le premier pas.
        */}
        {!aBouge && (
          <View style={[styles.consigne, { bottom: marges.bottom + 170 }]} pointerEvents="none">
            <Text style={styles.consigneTexte}>
              Pouce gauche pour marcher · glissez à droite pour regarder
            </Text>
          </View>
        )}

        <View style={[styles.bas, { bottom: marges.bottom + 26 }]} pointerEvents="box-none">
          <Manette surVecteur={surVecteur} styles={styles} teinte={teinte} />
        </View>
      </View>
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    haut: {
      position: 'absolute',
      left: 14,
      right: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    carte: {
      width: 112,
      height: 112,
      borderRadius: radius.lg,
      backgroundColor: c.surfaceVoile,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      overflow: 'hidden',
    },
    terminer: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceVoile,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    terminerTexte: { color: c.ink, fontSize: 15, fontWeight: '700' },
    enfonce: { opacity: 0.7 },
    consigne: {
      position: 'absolute',
      left: 24,
      right: 24,
      alignItems: 'center',
    },
    consigneTexte: {
      color: c.ink,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      backgroundColor: c.surfaceVoile,
      overflow: 'hidden',
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    bas: { position: 'absolute', left: 26 },
    /* La base : un disque voilé, juste assez visible pour qu'on sache où
       poser le pouce. */
    manette: {
      width: RAYON_MANETTE * 2,
      height: RAYON_MANETTE * 2,
      borderRadius: RAYON_MANETTE,
      backgroundColor: c.surfaceVoile,
      borderWidth: 1.5,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    manetteBouton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      opacity: 0.92,
      shadowColor: '#0B0D12',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
  }),
);
