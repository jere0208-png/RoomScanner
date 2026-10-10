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
import { RoomScanVisite, poserCameraDeVisite, poserLampesDeVisite } from 'react-native-room-scan';
import { Iso3DView } from './Iso3DView';
import { SOLAIRES } from '../ui/solaires';
import { floorsOf, useScanStore } from '../store/scanStore';
import { useModeElec } from '../store/usage';
import { filtrerAuNiveau, roomParts, type Pt } from '../geometry/floorplan';
import { buildScene, type ScenePalette } from '../geometry/scene3d';
import { cameraNative, maillageDeLaVisite } from '../geometry/visite3d';
import { maillageDesMeubles } from '../geometry/modeles3d';
import { groupesDesAppareils } from '../geometry/appareils3d';
import {
  basculer,
  interrupteurSousLeDoigt,
  interrupteursDeLaVisite,
  lampesDeLaScene,
  lampesDeLInterrupteur,
  lampesPourLeNatif,
  rangsDesLampes,
  type Lampe,
} from '../geometry/lumieres';
import { fixturePlacement, roomInputsOf } from '../geometry/nfc15100';
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
import { ombreBouton, radius, themedStyles, useTheme, type Palette } from '../theme';
import { FondDeVerre, SUR_VERRE } from './Verre';
import { useFigePendantLeGeste } from '../store/geste';

/**
 * LE PAS — 1,65 m/s à fond de manette : celui de quelqu'un qui visite d'un
 * bon pas.
 *
 * Relevé du patron : « accélère légèrement la marche ». À 1,4 m/s, on
 * s'impatientait dans un couloir ; plus vite encore, on traverse un séjour
 * en deux secondes et l'on ne voit rien. L'élan, lui, ne bouge pas : on
 * part et on s'arrête aussi net qu'avant.
 */
export const VITESSE_MARCHE = 1.65;
/** Un appui, pas un geste : moins de trois dixièmes de seconde, à peine bougé. */
const APPUI_MS = 300;
const APPUI_PX = 12;
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
/**
 * L'ÉLAN ET L'ARRÊT — un dixième de seconde pour prendre sa vitesse, un
 * vingtième pour la perdre.
 *
 * La vitesse sautait de zéro à 1,4 m/s au premier millimètre de pouce, et
 * retombait à zéro d'un coup : la caméra démarrait et s'arrêtait par
 * secousses, ce qui se lit comme un défaut. Un jeu donne à la marche un
 * élan à peine perceptible ; on l'imite, sans qu'il devienne une glissade :
 * pouce levé, on est arrêté en moins de deux dixièmes de seconde.
 */
const ELAN = 0.09;
const ARRET = 0.05;
/** En dessous, on est arrêté : pas de glissade de quelques millimètres sans fin. */
const VITESSE_NULLE = 0.05;
/** La mini-carte suit à dix images par seconde : c'est un repère, pas un film. */
const PERIODE_CARTE = 100;
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
    <View style={[styles.carte, SUR_VERRE]} pointerEvents="none" accessibilityLabel="Plan">
      <FondDeVerre rayon={radius.lg} ombre={styles.carte} />
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
  // L'appareillage ne se voit qu'en mode Électricité — comme partout.
  const modeElec = useModeElec();
  const toutLAppareillage = useScanStore((s) => s.fixtures);
  const toutLePlafond = useScanStore((s) => s.ceiling);
  const showTextures = useScanStore((s) => s.showTextures);
  const colorOpenings = useScanStore((s) => s.showOpeningColors);
  /*
    FIGÉ PENDANT UN GESTE DU PLAN (voir `store/geste`) : la scène se
    prébâtit toujours, mais une fois au lâcher, plus à chaque image d'un
    meuble qu'on fait glisser.
  */
  const { walls, openings, rooms, objects, fixtures, ceiling } = useFigePendantLeGeste(useMemo(
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
  ));
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
    const { faces, meubles, appareils } = buildScene(walls, openings, objects, {
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
    // Les caisses restent au canevas : la visite a les vrais meubles, et la
    // vraie prise au mur (voir `appareils3d`).
    /*
      CHAQUE LAMPE A SON DIFFUSEUR À ELLE — il s'allume avec elle (voir
      `lumieres`). Les autres matières se partagent leurs groupes, comme avant.
    */
    const lampes = lampesDeLaScene(appareils ?? []);
    return {
      ...maillageDeLaVisite(faces, { sansMeubles: true }),
      meubles: maillageDesMeubles(meubles ?? [], groupesDesAppareils(appareils ?? [], rangsDesLampes(lampes))),
      lampes,
    };
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
  /*
    LES INTERRUPTEURS DE LA VISITE, et ce que chacun allume — relevé du
    patron : « donne la possibilité d'allumer les lumières depuis un
    interrupteur ». Les liens du plan d'abord ; sans lien, la pièce où il est.
  */
  const inters = useMemo(() => interrupteursDeLaVisite(fixtures, walls), [fixtures, walls]);
  const pieceDe = useMemo(() => {
    const entrees = roomInputsOf(
      rooms.map((r) => ({ ...r, name: r.name ?? '' })),
      roomParts(walls, rooms),
    );
    const placement = fixturePlacement(fixtures, walls, entrees);
    return (f: { id: string }) => placement.get(f.id);
  }, [fixtures, walls, rooms]);
  const [allumees, setAllumees] = useState<ReadonlySet<string>>(() => new Set());
  // On entre de jour : les lampes s'allument à la main, une visite à la fois.
  useEffect(() => {
    if (!visible) setAllumees(new Set());
  }, [visible]);
  const lampes: Lampe[] = useMemo(() => maille?.lampes ?? [], [maille]);

  // Derrière les baies : un ciel clair, dans la teinte du thème.
  const fond = useMemo(() => mixHex(teinte.sky, '#FFFFFF', 0.55), [teinte.sky]);

  /*
    LA POSE VIT DANS UNE RÉFÉRENCE — ET PLUS AUCUN RENDU PAR IMAGE.

    Relevé du patron : « la visite est bug encore plus qu'avant pour le
    déplacement ; rends-moi un système de visite 3D parfait ». Chaque pas
    réécrivait l'état de cet écran : React redessinait tout — la mini-carte,
    le bâton, la vue native —, et la caméra arrivait à la vue par ses
    PROPRIÉTÉS, ce qui faisait reconvertir le maillage entier du logement à
    chaque image (voir `RoomScanVisite.cle`). Plus le logement avait de
    meubles, plus la marche saccadait.

    Désormais une seule boucle, par image d'écran, hors de React : elle lit
    les pouces, fait le pas, et pose la caméra directement sur la vue native
    (`poserCameraDeVisite`). React ne redessine plus que la mini-carte, dix
    fois par seconde. Sans le natif (banc d'essai), la vue en JavaScript reçoit
    sa caméra comme avant, au rythme de ce qu'elle coûte.
  */
  const pose = useRef<Pose>({ x: 0, z: 0, lacet: 0, tangage: 0 });
  /** La vitesse, dans le repère du regard (m/s) : elle prend son élan. */
  const vitesse = useRef({ avant: 0, droite: 0 });
  const manette = useRef({ x: 0, y: 0 });
  /** La vue en JavaScript (sans natif) : sa caméra vit dans l'état. */
  const [vue, setVue] = useState<Pose & { geste?: boolean }>(pose.current);
  /** La mini-carte : la pose, dix fois par seconde. */
  const [carte, setCarte] = useState<Pose>(pose.current);
  /** La caméra d'ENTRÉE de la vue native — elle ne change qu'en entrant. */
  const [entree, setEntree] = useState<Pose>(pose.current);
  /** Sans régie native (ancien binaire), la caméra repasse par la propriété. */
  const [secours, setSecours] = useState<number[] | null>(null);
  const [aBouge, setABouge] = useState(false);
  const dernierRendu = useRef(0);
  const derniereCarte = useRef(0);
  /** La clé de la vue native : c'est par elle que la caméra lui parvient. */
  const cle = useRef(
    `visite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const natifPret = natif && !!maille;

  const { width: largeur, height: hauteur } = useWindowDimensions();
  const ouverture = ouvertureVerticale(largeur, hauteur);
  const cameraDe = (p: Pose) => ({
    at: { x: p.x, y: HAUTEUR_OEIL, z: p.z },
    yaw: p.lacet,
    pitch: p.tangage,
    fov: ouverture,
  });

  const plancher = natif ? PERIODE_NATIF : PERIODE;
  const cadence = useRef(plancher);
  const demande = useRef(0);
  /** La vue en JavaScript : une image au rythme de ce qu'elle coûte. */
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
    UN APPUI BREF SUR UN INTERRUPTEUR L'ACTIONNE — et rien d'autre ne change :
    la marche et le regard gardent leurs pouces. Moins de trois dixièmes de
    seconde, à peine bougé : c'est un appui, pas un pas ni un regard. La cible
    est plus large que le mécanisme, et un interrupteur derrière une cloison
    ne répond pas (voir `interrupteurSousLeDoigt`).
  */
  const appuiFini = (d: Doigt) => {
    if (Date.now() - d.t0 > APPUI_MS) return;
    if (Math.hypot(d.x - d.x0, d.y - d.y0) > APPUI_PX) return;
    if (inters.length === 0 || lampes.length === 0) return;
    const p = pose.current;
    const id = interrupteurSousLeDoigt(
      { x: d.x, y: d.y },
      { x: p.x, y: HAUTEUR_OEIL, z: p.z, lacet: p.lacet, tangage: p.tangage, fov: ouverture },
      { w: largeur, h: hauteur },
      inters,
      obstacles,
    );
    if (!id) return;
    const inter = fixtures.find((f) => f.id === id);
    if (!inter) return;
    const siennes = lampesDeLInterrupteur(inter, fixtures, ceiling, pieceDe).filter((l) =>
      lampes.some((x) => x.id === l),
    );
    if (siennes.length === 0) return;
    haptic('accroche');
    setAllumees((avant) => basculer(avant, siennes));
  };

  /** Pose la caméra là où elle doit aller — vue native, ou vue JavaScript. */
  const publier = (arret: boolean) => {
    if (natifPret) {
      const cam = cameraNative(cameraDe(pose.current));
      const pris = typeof poserCameraDeVisite === 'function' && poserCameraDeVisite(cle, cam);
      if (!pris) setSecours(cam);
    } else {
      montrer(arret);
    }
  };

  /*
    LA BOUCLE — une par image d'écran, tant qu'un pouce est posé ou que
    l'élan n'est pas retombé. Pouce levé et pas fini, rien ne tourne : une
    visite posée sur une table ne vide pas la batterie.
  */
  interface Doigt {
    role: 'marche' | 'regard';
    x0: number;
    y0: number;
    x: number;
    y: number;
    /** Quand il s'est posé : un appui bref sur un interrupteur allume. */
    t0: number;
  }
  const doigts = useRef(new Map<number, Doigt>());
  const enCours = useRef(false);
  const dernierTic = useRef(-1);
  const regardBouge = useRef(false);
  const tic = useRef<(ts: number) => void>(() => {});
  tic.current = (ts: number) => {
    if (!enCours.current) return;
    const dt =
      dernierTic.current < 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (ts - dernierTic.current) / 1000));
    dernierTic.current = ts;

    // La vitesse voulue, et l'élan pour y aller.
    const j = manette.current;
    const voulue = { avant: -j.y * VITESSE_MARCHE, droite: j.x * VITESSE_MARCHE };
    const v = vitesse.current;
    const accelere = Math.hypot(voulue.avant, voulue.droite) >= Math.hypot(v.avant, v.droite);
    const k = 1 - Math.exp(-dt / (accelere ? ELAN : ARRET));
    v.avant += (voulue.avant - v.avant) * k;
    v.droite += (voulue.droite - v.droite) * k;
    if (voulue.avant === 0 && voulue.droite === 0 && Math.hypot(v.avant, v.droite) < VITESSE_NULLE) {
      v.avant = 0;
      v.droite = 0;
    }

    let bouge = regardBouge.current;
    regardBouge.current = false;
    if (v.avant !== 0 || v.droite !== 0) {
      const p = pose.current;
      const { avant: f, droite: r } = reperes(p.lacet);
      const vise = {
        x: p.x + (f.x * v.avant + r.x * v.droite) * dt,
        z: p.z + (f.z * v.avant + r.z * v.droite) * dt,
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
      bouge = true;
    }
    if (bouge) publier(false);
    if (bouge && ts - derniereCarte.current >= PERIODE_CARTE) {
      derniereCarte.current = ts;
      setCarte({ ...pose.current });
    }

    const actif = doigts.current.size > 0 || v.avant !== 0 || v.droite !== 0;
    if (!actif) {
      // Arrêté : l'image exacte, la carte à jour, et la boucle se tait.
      enCours.current = false;
      releaseHaptic('butee');
      publier(true);
      setCarte({ ...pose.current });
      return;
    }
    requestAnimationFrame((t) => tic.current(t));
  };
  const demarrer = () => {
    if (enCours.current) return;
    enCours.current = true;
    dernierTic.current = -1;
    requestAnimationFrame((t) => tic.current(t));
  };
  const arreterTout = () => {
    enCours.current = false;
    doigts.current.clear();
    manette.current = { x: 0, y: 0 };
    vitesse.current = { avant: 0, droite: 0 };
    regardBouge.current = false;
  };

  // À chaque entrée : au cœur de la plus grande pièce, face à sa profondeur.
  useEffect(() => {
    if (!visible) {
      arreterTout();
      return;
    }
    const d = pointDeDepart(walls, rooms, obstacles);
    if (!d) return;
    arreterTout();
    // `yaw` est un angle du plan (0 = x croissants) ; la 3D compte depuis
    // les z croissants. La conversion se fait ici, une fois.
    pose.current = { x: d.at.x, z: d.at.z, lacet: Math.PI / 2 - d.yaw, tangage: TANGAGE_DEPART };
    setVue({ ...pose.current });
    setCarte({ ...pose.current });
    setEntree({ ...pose.current });
    setSecours(null);
    setABouge(false);
    // On n'y revient qu'en rouvrant : un plan modifié pendant la visite ne
    // doit pas téléporter le visiteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  // Démonté en pleine marche : la boucle s'arrête avec l'écran.
  useEffect(() => () => arreterTout(), []);

  /*
    UN SEUL GESTE POUR LES DEUX POUCES.

    Relevé du patron : « on ne peut pas se déplacer et tourner en même
    temps ». Une seule vue reçoit tous les doigts et les départage — par
    leur identifiant, et par la moitié de l'écran où ils se posent : à
    gauche on marche, à droite on regarde. Deux doigts, deux rôles.

    ET PLUS DE MANETTE À L'ÉCRAN — relevé du patron : « enlève l'affichage
    des joysticks au clic ». Elle naissait sous le pouce, un anneau et un
    bouton par-dessus la vue ; le pouce posé sait déjà où il est. La manette
    est toujours là — elle part de là où le pouce se pose —, elle ne se
    dessine plus. Un léger choc à la pose dit qu'elle a pris.
  */
  type Touche = { identifier: number | string; pageX: number; pageY: number };
  const touchesDe = (e: GestureResponderEvent) =>
    (e.nativeEvent.touches ?? []) as Touche[];
  /*
    SEULS LES DOIGTS QUI ONT BOUGÉ — relevé du patron : « le déplacement se
    coupe lorsqu'on change en même temps la vue dans la visite ». Quand seul
    le pouce du regard bouge, iOS peut redonner celui de la marche à sa
    position d'arrivée dans la liste complète (`touches`) : un doigt ne se met
    à jour que par les événements qui le concernent (`changedTouches`).
  */
  const changesDe = (e: GestureResponderEvent) =>
    ((e.nativeEvent.changedTouches as Touche[] | undefined) ?? touchesDe(e)) as Touche[];
  const accueillir = (e: GestureResponderEvent) => {
    for (const t of changesDe(e)) {
      const id = Number(t.identifier);
      if (doigts.current.has(id)) continue;
      const roles = new Set([...doigts.current.values()].map((d) => d.role));
      const aGauche = t.pageX < largeur / 2;
      const voulu: Doigt['role'] = aGauche ? 'marche' : 'regard';
      const autre: Doigt['role'] = aGauche ? 'regard' : 'marche';
      // Le rôle de sa moitié d'écran, sinon l'autre s'il est libre.
      const role = !roles.has(voulu) ? voulu : !roles.has(autre) ? autre : null;
      if (!role) continue;
      doigts.current.set(id, { role, x0: t.pageX, y0: t.pageY, x: t.pageX, y: t.pageY, t0: Date.now() });
      if (role === 'marche') haptic('leger');
      demarrer();
    }
  };
  const suivre = (e: GestureResponderEvent) => {
    for (const t of changesDe(e)) {
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
        const vx = dx / RAYON_MANETTE;
        const vy = dy / RAYON_MANETTE;
        const force = Math.hypot(vx, vy);
        if (force < ZONE_MORTE) manette.current = { x: 0, y: 0 };
        else {
          const k = (force - ZONE_MORTE) / (1 - ZONE_MORTE) / force;
          manette.current = { x: vx * k, y: vy * k };
          if (!aBouge) setABouge(true);
        }
      } else {
        const ddx = t.pageX - d.x;
        const ddy = t.pageY - d.y;
        if (ddx !== 0 || ddy !== 0) {
          // Glisser vers la droite tourne vers la droite — c'est-à-dire
          // vers −x quand on regarde +z : le lacet DÉCROÎT (voir `povBase`).
          // Le regard s'applique tout de suite ; la boucle le montre à
          // l'image suivante.
          const p = pose.current;
          pose.current = {
            ...p,
            lacet: p.lacet - ddx * SENSIBILITE,
            tangage: Math.max(-TANGAGE_MAX, Math.min(TANGAGE_MAX, p.tangage - ddy * SENSIBILITE)),
          };
          regardBouge.current = true;
          if (!aBouge) setABouge(true);
        }
      }
      d.x = t.pageX;
      d.y = t.pageY;
    }
    demarrer();
  };
  const lacher = (e: GestureResponderEvent) => {
    // Les doigts LEVÉS sont ceux de l'événement ; à défaut, ceux qui ne sont
    // plus posés.
    const changes = e.nativeEvent.changedTouches as Touche[] | undefined;
    const vivants = new Set(touchesDe(e).map((t) => Number(t.identifier)));
    const leves = changes
      ? new Set(changes.map((t) => Number(t.identifier)))
      : new Set([...doigts.current.keys()].filter((id) => !vivants.has(id)));
    for (const id of [...doigts.current.keys()]) {
      if (!leves.has(id)) continue;
      const d = doigts.current.get(id)!;
      doigts.current.delete(id);
      if (d.role === 'marche') manette.current = { x: 0, y: 0 };
      appuiFini(d);
    }
  };
  const toutLacher = () => {
    // Plus aucun doigt : ce qu'on regarde se montre tout de suite ; l'élan
    // retombe, et la boucle s'arrête d'elle-même.
    for (const d of doigts.current.values()) appuiFini(d);
    doigts.current.clear();
    manette.current = { x: 0, y: 0 };
    publier(true);
    demarrer();
  };

  /*
    LES LAMPES PARTENT PAR LA RÉGIE, comme la caméra : allumer ne reconvertit
    pas le logement. Le choix des lampes qui ont droit à une vraie source suit
    le visiteur (les plus proches) ; on ne renvoie que ce qui a changé.
  */
  const dernieresLampes = useRef('');
  useEffect(() => {
    if (!natifPret || lampes.length === 0) return;
    const valeurs = lampesPourLeNatif(lampes, allumees, { x: carte.x, z: carte.z });
    const cleValeurs = valeurs.join(',');
    if (cleValeurs === dernieresLampes.current) return;
    dernieresLampes.current = cleValeurs;
    if (typeof poserLampesDeVisite === 'function') poserLampesDeVisite(cle, valeurs);
  }, [natifPret, lampes, allumees, carte, cle]);
  // Une vue native neuve repart de zéro : ce qui a été envoyé à l'ancienne ne compte plus.
  useEffect(() => {
    dernieresLampes.current = '';
  }, [maille]);

  // La vue en JavaScript (sans natif) : sa caméra suit l'état.
  const camera = useMemo(() => cameraDe(vue), [vue, ouverture]); // eslint-disable-line react-hooks/exhaustive-deps
  // La vue native : la caméra d'entrée, puis la régie à chaque image.
  const cameraPlate = useMemo(
    () => secours ?? cameraNative(cameraDe(entree)),
    [secours, entree, ouverture], // eslint-disable-line react-hooks/exhaustive-deps
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
          {visible && walls.length > 0 && RoomScanVisite && maille && (
            <RoomScanVisite
              style={StyleSheet.absoluteFill}
              maillage={maille.maillage}
              sols={maille.sols}
              meubles={maille.meubles}
              camera={cameraPlate}
              cle={cle}
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

        {/*
          AVANT LE PREMIER PAS : DEUX REPÈRES, NETS — qui disent qu'on peut
          marcher et tourner. Ils s'effacent avec la consigne, au premier
          mouvement : ensuite, la vue est toute à la visite.
        */}
        {!aBouge && (
          <>
            <View
              style={[styles.repere, styles.repereGauche, { bottom: marges.bottom + 34 }]}
              pointerEvents="none">
              <View style={[styles.repereRond, SUR_VERRE]}>
                <FondDeVerre rayon={26} ombre={styles.repereRond} />
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path d={SOLAIRES.marcher} fill={teinte.blue} fillRule="evenodd" />
                </Svg>
              </View>
            </View>
            <View
              style={[styles.repere, styles.repereDroit, { bottom: marges.bottom + 34 }]}
              pointerEvents="none">
              <View style={[styles.repereRond, SUR_VERRE]}>
                <FondDeVerre rayon={26} ombre={styles.repereRond} />
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path d={SOLAIRES.pivoter} fill={teinte.blue} fillRule="evenodd" />
                </Svg>
              </View>
            </View>
          </>
        )}

        <View style={[styles.haut, { top: marges.top + 8 }]} pointerEvents="box-none">
          <MiniCarte
            murs={walls}
            pose={carte}
            styles={styles}
            teinte={teinte}
          />
          {/*
            « TERMINER » EST SA PILULE — relevé du patron : « le bouton quitter
            est mal fait, le bouton plus petit que le texte ». Le mot vivait
            dans une vue native de verre, posée dans le bouton : sa taille ne
            suivait pas celle du texte. Le bouton porte maintenant lui-même
            son fond, sa hauteur et son rembourrage : ce qu'on voit est ce
            qu'on touche, et le mot ne peut plus en sortir.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Terminer l’exploration"
            style={({ pressed }) => [styles.terminer, SUR_VERRE, pressed && styles.enfonce]}
            hitSlop={10}
            onPress={() => {
              arreterTout();
              onClose();
            }}>
            <FondDeVerre rayon={20} ombre={styles.terminer} />
            <Text style={styles.terminerTexte} numberOfLines={1}>
              Terminer
            </Text>
          </Pressable>
        </View>

        {/*
          LA CONSIGNE, TANT QU'ON N'A PAS BOUGÉ — et pas une seconde de plus.
          Le geste est celui de tous les jeux mobiles ; une phrase suffit à le
          rappeler, et elle s'efface dès le premier pas.
        */}
        {!aBouge && (
          <View style={[styles.consigne, { bottom: marges.bottom + 118 }]} pointerEvents="none">
            <View style={[styles.consigneBulle, SUR_VERRE]}>
              <FondDeVerre rayon={999} />
              <Text style={styles.consigneTexte}>
                {inters.length > 0 && lampes.length > 0
                  ? 'Pouce gauche pour marcher · glissez à droite pour regarder · touchez un interrupteur pour allumer'
                  : 'Pouce gauche pour marcher · glissez à droite pour regarder'}
              </Text>
            </View>
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
      backgroundColor: c.surface,
      ...ombreBouton,
    },
    terminer: {
      height: 40,
      paddingHorizontal: 18,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...ombreBouton,
    },
    terminerTexte: { color: c.blue, fontSize: 16, fontWeight: '600' },
    enfonce: { opacity: 0.7 },
    consigne: {
      position: 'absolute',
      left: 24,
      right: 24,
      alignItems: 'center',
    },
    /* La bulle porte le fond : le texte ne peint plus que ses lettres. */
    consigneBulle: {
      backgroundColor: c.surfaceVoile,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    consigneTexte: {
      color: c.ink,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    /* Les repères de verre au repos : petits, dans les coins, translucides. */
    repere: { position: 'absolute' },
    repereGauche: { left: 26 },
    repereDroit: { right: 26 },
    repereRond: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...ombreBouton,
    },
  }),
);
