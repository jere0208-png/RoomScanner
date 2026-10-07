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
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoomScanVisite } from 'react-native-room-scan';
import { Iso3DView } from './Iso3DView';
import { Verre } from './Verre';
import { SOLAIRES } from '../ui/solaires';
import { floorsOf, useScanStore } from '../store/scanStore';
import { useModeElec } from '../store/usage';
import { filtrerAuNiveau, type Pt } from '../geometry/floorplan';
import { buildScene, type ScenePalette } from '../geometry/scene3d';
import { cameraNative, maillageDeLaVisite } from '../geometry/visite3d';
import { mixHex } from '../geometry/appearance';
import { MAQUETTE, matieresDesSols } from '../ui/maquette';
import { hexDePeinture } from '../ui/peintures';
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
/**
 * EN NATIF, UNE IMAGE PAR RAFRAÎCHISSEMENT. SceneKit tient la scène sur la
 * carte graphique ; le JavaScript n'a plus qu'à déplacer le point et poser
 * six nombres. Soixante fois par seconde, c'est un pas qui ne saccade pas.
 */
export const PERIODE_NATIF = 16;
/** Au pire, huit images par seconde : en dessous, on ne marche plus, on saute. */
const PERIODE_MAX = 125;

/**
 * LA CADENCE SUIT CE QUE COÛTE UNE IMAGE.
 *
 * Demander une image toutes les 33 ms quand chacune en coûte 80, c'est
 * occuper le fil JavaScript sans relâche : les pouces n'y trouvent plus de
 * place, la manette répond en retard — et c'est ÇA qui se sent fébrile,
 * davantage qu'une image de moins par seconde. On laisse donc un tiers du
 * temps libre (l'image coûte deux tiers de la période), sans jamais
 * descendre sous trente images par seconde quand le téléphone les tient.
 */
export function cadenceDeMarche(coutMs: number, plancher = PERIODE): number {
  if (!Number.isFinite(coutMs)) return plancher;
  return Math.max(plancher, Math.min(PERIODE_MAX, Math.round(coutMs * 1.5)));
}

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
  // La droite de qui regarde +z est −x : voir `povBase`, même repère.
  droite: { x: -Math.cos(lacet), z: Math.sin(lacet) },
});

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
    <Verre style={styles.carte} epais pointerEvents="none" accessibilityLabel="Plan">
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
    </Verre>
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
  // L'appareillage ne se voit qu'en mode Électricité — comme partout.
  const modeElec = useModeElec();
  const toutLAppareillage = useScanStore((s) => s.fixtures);
  const toutLePlafond = useScanStore((s) => s.ceiling);
  const showTextures = useScanStore((s) => s.showTextures);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  const { walls, openings, rooms, objects, fixtures, ceiling } = useMemo(
    () =>
      filtrerAuNiveau(
        {
          walls: tousLesMurs,
          openings: toutesLesOuvertures,
          rooms: toutesLesPieces,
          fixtures: modeElec ? toutLAppareillage : [],
          photos: [],
          objects: tousLesMeubles,
          ceiling: modeElec ? toutLePlafond : [],
        },
        niveauCourant,
      ),
    [
      tousLesMurs,
      toutesLesOuvertures,
      toutesLesPieces,
      tousLesMeubles,
      modeElec,
      toutLAppareillage,
      toutLePlafond,
      niveauCourant,
    ],
  );
  const obstacles = useMemo(
    () => obstaclesDeLaVisite(walls, openings, objects, rooms),
    [walls, openings, objects, rooms],
  );

  /*
    LA SCÈNE EST BÂTIE AVANT QU'ON ENTRE — et une seule fois.

    Relevé du patron : « il faut précharger le rendu ». Ce composant est
    monté avec l'écran du relevé, fermé ; les triangles se calculent donc
    ici, pendant qu'on regarde encore le plan, et ne changent qu'avec lui.
    À l'ouverture, le natif reçoit une scène prête ; ensuite, seule la
    caméra voyage. La maquette (`buildScene`) reste la source unique du
    modèle : mêmes baies, mêmes meubles, mêmes teintes relevées — avec un
    sol et un plafond, puisqu'on est dedans.
  */
  const natif = !!RoomScanVisite;
  const palette = useMemo<ScenePalette>(
    () => ({ ...MAQUETTE, door: teinte.amber, window: teinte.sky, passage: teinte.blue }),
    [teinte],
  );
  const peintures = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of rooms) {
      const hex = hexDePeinture(r.peinture);
      if (hex) out[r.id] = hex;
    }
    return out;
  }, [rooms]);
  const maille = useMemo(() => {
    if (!natif || walls.length === 0) return null;
    const { faces } = buildScene(walls, openings, objects, {
      palette,
      colorOpenings,
      showSurfaces: true,
      plafonds: true,
      showTextures,
      floors: floorsOf(rooms),
      rooms,
      fixtures,
      ceiling,
      matieres: matieresDesSols(rooms),
      peintures,
    });
    return maillageDeLaVisite(faces);
  }, [
    natif,
    walls,
    openings,
    objects,
    palette,
    colorOpenings,
    showTextures,
    rooms,
    fixtures,
    ceiling,
    peintures,
  ]);
  // Derrière les baies : un ciel clair, dans la teinte du thème.
  const fond = useMemo(() => mixHex(teinte.sky, '#FFFFFF', 0.55), [teinte.sky]);

  /*
    LA POSE VIT DANS UNE RÉFÉRENCE, ET L'ÉCRAN EN PREND UNE COPIE.

    La boucle de marche et le pouce du regard l'écrivent à chaque instant ;
    l'écran, lui, ne la relit qu'au rythme d'une image toutes les
    trente-trois millisecondes. Sans cette séparation, chaque millimètre de
    pouce redessinerait le logement entier.
  */
  const pose = useRef<Pose>({ x: 0, z: 0, lacet: 0, tangage: 0 });
  /*
    `geste` : l'image est prise EN MOUVEMENT. La 3D s'y accorde un ordre de
    peinture approché (voir `enMarche`) ; l'image où l'on s'arrête, elle,
    est forcée sans ce drapeau, et retrouve l'ordre exact.
  */
  const [vue, setVue] = useState<Pose & { geste?: boolean }>(pose.current);
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

  const plancher = natif ? PERIODE_NATIF : PERIODE;
  const cadence = useRef(plancher);
  const demande = useRef(0);
  const montrer = (force = false) => {
    const t = Date.now();
    if (!force && t - dernierRendu.current < cadence.current) return;
    dernierRendu.current = t;
    demande.current = t;
    setVue({ ...pose.current, geste: !force });
  };
  // Ce qu'a coûté l'image qu'on vient de poser décide de la suivante.
  useLayoutEffect(() => {
    if (!demande.current) return;
    cadence.current = cadenceDeMarche(Date.now() - demande.current, plancher);
    demande.current = 0;
  }, [vue, plancher]);

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

  const { width: largeur, height: hauteur } = useWindowDimensions();

  /*
    UN SEUL GESTE POUR LES DEUX POUCES.

    Relevé du patron : « on ne peut pas se déplacer et tourner en même
    temps ». La manette et le regard étaient deux responders, et React
    Native n'en accorde qu'UN à la fois à toute l'application : le second
    pouce frappait une porte fermée. Ici une seule vue reçoit tout, et c'est
    elle qui départage les doigts — par leur identifiant, et par la moitié
    de l'écran où ils se posent : à gauche on marche, à droite on regarde.
    Deux doigts, deux rôles, un seul geste.

    ET LA MANETTE NAÎT SOUS LE POUCE. Elle n'est plus un disque posé en bas
    à gauche qui mange la vue : elle apparaît là où le pouce se pose, en
    verre, et disparaît quand il se lève. Ce qui reste à l'écran au repos,
    ce sont deux repères de verre, discrets, qui disent qu'on peut marcher
    et tourner — pas où.
  */
  interface Doigt {
    role: 'marche' | 'regard';
    x0: number;
    y0: number;
    x: number;
    y: number;
  }
  const doigts = useRef(new Map<number, Doigt>());
  const [baton, setBaton] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const touchesDe = (e: GestureResponderEvent) =>
    (e.nativeEvent.touches ?? []) as { identifier: number | string; pageX: number; pageY: number }[];
  const accueillir = (e: GestureResponderEvent) => {
    for (const t of touchesDe(e)) {
      const id = Number(t.identifier);
      if (doigts.current.has(id)) continue;
      const roles = new Set([...doigts.current.values()].map((d) => d.role));
      const aGauche = t.pageX < largeur / 2;
      const voulu: Doigt['role'] = aGauche ? 'marche' : 'regard';
      const autre: Doigt['role'] = aGauche ? 'regard' : 'marche';
      // Le rôle de sa moitié d'écran, sinon l'autre s'il est libre.
      const role = !roles.has(voulu) ? voulu : !roles.has(autre) ? autre : null;
      if (!role) continue;
      doigts.current.set(id, { role, x0: t.pageX, y0: t.pageY, x: t.pageX, y: t.pageY });
      if (role === 'marche') {
        setBaton({ x: t.pageX, y: t.pageY, dx: 0, dy: 0 });
        haptic('leger');
      }
    }
  };
  const suivre = (e: GestureResponderEvent) => {
    let regardBouge = false;
    for (const t of touchesDe(e)) {
      const d = doigts.current.get(Number(t.identifier));
      if (!d) continue;
      if (d.role === 'marche') {
        let dx = t.pageX - d.x0;
        let dy = t.pageY - d.y0;
        const dist = Math.hypot(dx, dy);
        if (dist > RAYON_MANETTE) {
          dx = (dx / dist) * RAYON_MANETTE;
          dy = (dy / dist) * RAYON_MANETTE;
        }
        setBaton({ x: d.x0, y: d.y0, dx, dy });
        const vx = dx / RAYON_MANETTE;
        const vy = dy / RAYON_MANETTE;
        const force = Math.hypot(vx, vy);
        if (force < ZONE_MORTE) surVecteur({ x: 0, y: 0 });
        else {
          const k = (force - ZONE_MORTE) / (1 - ZONE_MORTE) / force;
          surVecteur({ x: vx * k, y: vy * k });
        }
      } else {
        const ddx = t.pageX - d.x;
        const ddy = t.pageY - d.y;
        if (ddx !== 0 || ddy !== 0) {
          // Glisser vers la droite tourne vers la droite — c'est-à-dire
          // vers −x quand on regarde +z : le lacet DÉCROÎT (voir `povBase`).
          const p = pose.current;
          pose.current = {
            ...p,
            lacet: p.lacet - ddx * SENSIBILITE,
            tangage: Math.max(-TANGAGE_MAX, Math.min(TANGAGE_MAX, p.tangage - ddy * SENSIBILITE)),
          };
          regardBouge = true;
        }
      }
      d.x = t.pageX;
      d.y = t.pageY;
    }
    if (regardBouge) {
      setABouge(true);
      montrer();
    }
  };
  const lacher = (e: GestureResponderEvent) => {
    const vivants = new Set(touchesDe(e).map((t) => Number(t.identifier)));
    for (const id of [...doigts.current.keys()]) {
      if (vivants.has(id)) continue;
      const d = doigts.current.get(id)!;
      doigts.current.delete(id);
      if (d.role === 'marche') {
        setBaton(null);
        surVecteur({ x: 0, y: 0 });
      } else {
        montrer(true);
      }
    }
  };
  const toutLacher = () => {
    doigts.current.clear();
    setBaton(null);
    surVecteur({ x: 0, y: 0 });
    montrer(true);
  };

  const camera = useMemo(
    () => ({
      at: { x: vue.x, y: HAUTEUR_OEIL, z: vue.z },
      yaw: vue.lacet,
      pitch: vue.tangage,
      fov: ouvertureVerticale(largeur, hauteur),
    }),
    [vue, largeur, hauteur],
  );
  const cameraPlate = useMemo(() => cameraNative(camera), [camera]);

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
          {visible && walls.length > 0 && RoomScanVisite && maille && (
            <RoomScanVisite
              style={StyleSheet.absoluteFill}
              maillage={maille.maillage}
              sols={maille.sols}
              camera={cameraPlate}
              fond={fond}
            />
          )}
          {/* Sans le natif (banc d'essai), la vue en JavaScript tient lieu. */}
          {visible && walls.length > 0 && !(RoomScanVisite && maille) && (
            <Iso3DView
              pov={camera}
              enMarche={!!vue.geste}
              showMeasures={false}
              showNorth={false}
            />
          )}
        </View>

        {/* Les deux pouces, une seule vue : voir « UN SEUL GESTE ». */}
        <View
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Marcher et regarder"
          accessibilityHint="Pouce gauche pour marcher, pouce droit pour regarder"
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={accueillir}
          onResponderStart={accueillir}
          onResponderMove={(e) => {
            accueillir(e);
            suivre(e);
          }}
          onResponderEnd={lacher}
          onResponderRelease={toutLacher}
          onResponderTerminate={toutLacher}
        />

        {/* Au repos : deux repères de verre, qui disent qu'on peut marcher
            et tourner — sans prendre la vue. */}
        {!baton && (
          <View
            style={[styles.repere, styles.repereGauche, { bottom: marges.bottom + 34 }]}
            pointerEvents="none">
            <Verre style={styles.repereVerre}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d={SOLAIRES.marcher} fill={teinte.ink} fillRule="evenodd" opacity={0.75} />
              </Svg>
            </Verre>
          </View>
        )}
        <View
          style={[styles.repere, styles.repereDroit, { bottom: marges.bottom + 34 }]}
          pointerEvents="none">
          <Verre style={styles.repereVerre}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d={SOLAIRES.pivoter} fill={teinte.ink} fillRule="evenodd" opacity={0.75} />
            </Svg>
          </Verre>
        </View>

        {/* Le bâton, né sous le pouce. */}
        {baton && (
          <View
            pointerEvents="none"
            accessibilityLabel="Manette"
            style={[styles.baton, { left: baton.x - RAYON_MANETTE, top: baton.y - RAYON_MANETTE }]}>
            <Verre style={styles.batonVerre} />
            <View
              style={[
                styles.batonBouton,
                { transform: [{ translateX: baton.dx }, { translateY: baton.dy }] },
              ]}
            />
          </View>
        )}

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
            style={({ pressed }) => [pressed && styles.enfonce]}
            hitSlop={10}
            onPress={() => {
              manette.current = { x: 0, y: 0 };
              onClose();
            }}>
            <Verre style={styles.terminer} epais>
              <Text style={styles.terminerTexte}>Terminer</Text>
            </Verre>
          </Pressable>
        </View>

        {/*
          LA CONSIGNE, TANT QU'ON N'A PAS BOUGÉ — et pas une seconde de plus.
          Le geste est celui de tous les jeux mobiles ; une phrase suffit à le
          rappeler, et elle s'efface dès le premier pas.
        */}
        {!aBouge && (
          <View style={[styles.consigne, { bottom: marges.bottom + 118 }]} pointerEvents="none">
            <Text style={styles.consigneTexte}>
              Pouce gauche pour marcher · glissez à droite pour regarder
            </Text>
          </View>
        )}

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
      overflow: 'hidden',
    },
    terminer: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.pill,
      overflow: 'hidden',
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
    /* Les repères de verre au repos : petits, dans les coins, translucides. */
    repere: { position: 'absolute' },
    repereGauche: { left: 26 },
    repereDroit: { right: 26 },
    repereVerre: {
      width: 56,
      height: 56,
      borderRadius: 28,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    /* Le bâton : un disque de verre sous le pouce, un bouton blanc dedans. */
    baton: {
      position: 'absolute',
      width: RAYON_MANETTE * 2,
      height: RAYON_MANETTE * 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    batonVerre: {
      position: 'absolute',
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      borderRadius: RAYON_MANETTE,
      overflow: 'hidden',
    },
    batonBouton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#FFFFFF',
      opacity: 0.92,
      shadowColor: '#0B0D12',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
  }),
);
