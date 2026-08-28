/**
 * L'ANIMATION DE LA VITRINE — le plan qui se lève, image par image.
 *
 * Elle montre en trois secondes ce que fait l'application : un plan 2D coté,
 * avec ses appareils électriques, qui se RELÈVE pour devenir un logement
 * meublé en volume. C'est le geste de l'app — la bascule 2D/3D — joué tout
 * seul, et c'est ce qu'on comprend sans une ligne de texte.
 *
 * CES IMAGES SONT CALCULÉES AU BUILD, PAS SUR LE TÉLÉPHONE.
 *
 * La version précédente rendait la scène à vingt-cinq images par seconde sur
 * l'appareil : cent cinquante polygones reprojetés à chaque image, sur un
 * écran d'accueil qui n'a rien à calculer. Ici, tout est cuit d'avance
 * (`npm run showcase`) et embarqué dans l'app : le téléphone ne fait plus que
 * feuilleter des images. Rien à recalculer, donc rien qui puisse ramer ni
 * diverger d'un appareil à l'autre.
 *
 * Le fichier ne contient que de la GÉOMÉTRIE : il rend une chaîne SVG pour un
 * avancement donné, et c'est l'outil qui les convertit en images.
 */
import {
  buildScene,
  cutawayOpacity,
  faceDepth,
  isHiddenFace,
  sceneFraming,
  shadeFill,
  type ScenePalette,
} from '../geometry/scene3d';
import { segLength, type WallSeg } from '../geometry/floorplan';
import { FIXTURES, type Fixture } from '../geometry/electrical';
import type { ObjectData } from 'react-native-room-scan';

/**
 * Le nombre d'images du cycle complet.
 *
 * Il est passé de 44 à 52 quand la levée s'est allongée : à cadence égale
 * (quinze images par seconde), la douceur ne peut venir QUE d'un pas plus
 * petit entre deux images — et le pas le plus grand de l'ancien cycle
 * faisait cinq degrés et demi d'inclinaison d'un coup, ce qui se lisait
 * comme des paliers. Huit images de plus, c'est 80 ko dans l'IPA.
 *
 * PUIS DE 52 À 105, quand la vitrine a cessé de montrer un geste pour
 * raconter un CHEMINEMENT. Relevé du patron : « refais à l'intérieur de
 * l'écran une animation moderne, rapide et compréhensible : plan 2D, les murs
 * montent et forment un plan 3D, des interrupteurs et prises pop à des
 * endroits, on affiche les cotes rapidement, avec des transitions rapides
 * mais en fondu toujours, et un aperçu d'un scroll du PDF final des plans,
 * etc. En 5-8 secondes, on doit comprendre le cheminement de l'app. »
 *
 * PUIS DE 105 À 80, parce que sept secondes, c'est long. Relevé du patron, en
 * la regardant tourner : « fais une meilleure animation dans l'iPhone, moderne
 * avec du peps, et des gros titres. Rapide. » Cinq secondes et un tiers : le
 * bas de la fourchette demandée, et vingt-cinq images de moins dans l'IPA.
 *
 * CE QU'ON A RACCOURCI, ET CE QU'ON N'A PAS TOUCHÉ. Les temps de LECTURE se
 * resserrent — on comprend un plan en une demi-seconde quand un titre le
 * nomme. Le défilement du dossier, lui, garde sa durée : c'est le seul moment
 * où l'œil suit quelque chose au lieu de le reconnaître.
 */
export const SHOWCASE_FRAMES = 80;

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  height: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: height / 2,
  roomId: 'r1',
});

const meuble = (
  id: string,
  category: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
): ObjectData => ({
  id,
  category,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, h / 2, cz, 1],
});

/**
 * LE LOGEMENT DE LA VITRINE : un T2 qu'on pourrait relever demain.
 *
 * Il suit la forme de l'ÉCRAN — chambre en haut, séjour en bas — parce qu'un
 * T2 en largeur occupait une bande au milieu d'un téléphone et laissait deux
 * déserts au-dessus et en dessous.
 *
 * Et il tient debout, ce qui n'était pas le cas : le refend s'arrêtait au
 * milieu du logement, donc la chambre n'était pas une pièce, et l'armoire
 * flottait à cinquante centimètres de son mur. On montrait un plan que
 * personne n'a jamais relevé — dans une vitrine dont c'est tout le propos.
 *
 * Les trois règles suivies ici sont celles d'un vrai relevé : les pièces se
 * ferment, chaque meuble est CONTRE quelque chose (sauf la table basse, au
 * milieu du salon, qui est à sa place), et chaque pièce a sa porte et sa
 * fenêtre.
 */
export const PLAN = {
  murs: [
    ['n', 0, 0, 4.2, 0],
    ['e', 4.2, 0, 4.2, 6.4],
    ['s', 4.2, 6.4, 0, 6.4],
    ['o', 0, 6.4, 0, 0],
    // Le refend TRAVERSE, et il est percé d'une porte.
    ['refend', 0, 2.7, 4.2, 2.7],
  ] as [string, number, number, number, number][],
  meubles: [
    // --- Chambre (en haut) : lit tête au nord, armoire contre l'est.
    ['lit', 'bed', 0.95, 1.05, 1.5, 2.0, 0.5],
    ['chevet', 'storage', 1.95, 0.25, 0.45, 0.45, 0.5],
    ['armoire', 'storage', 3.9, 1.5, 0.58, 1.8, 2.1],
    // --- Séjour (en bas) : canapé dos au refend, télé en face, sur le
    //     mur du fond ; la table basse entre les deux.
    ['canape', 'sofa', 1.65, 3.15, 2.2, 0.88, 0.8],
    ['table', 'table', 1.65, 4.5, 1.1, 0.6, 0.42],
    ['tv', 'television', 1.65, 6.31, 1.3, 0.14, 0.62],
    ['biblio', 'storage', 0.23, 5.1, 0.42, 1.6, 1.9],
  ] as [string, string, number, number, number, number, number][],
  /** L'appareillage : c'est lui qu'on vient chercher dans cette app. */
  elec: [
    // Séjour : une prise derrière la télé, une au canapé, l'interrupteur
    // à l'entrée, la prise réseau au meuble bas.
    { id: 'f1', kind: 'prise', wallId: 's', along: 1.9, height: 0.25, side: 1 },
    { id: 'f2', kind: 'prise', wallId: 'o', along: 3.1, height: 0.25, side: 1 },
    { id: 'f3', kind: 'inter', wallId: 'e', along: 5.4, height: 1.1, side: 1 },
    { id: 'f4', kind: 'rj45', wallId: 's', along: 2.9, height: 0.25, side: 1 },
    // Chambre : l'interrupteur près de la porte, une prise au chevet.
    { id: 'f5', kind: 'inter', wallId: 'refend', along: 2.6, height: 1.1, side: -1 },
    { id: 'f6', kind: 'prise', wallId: 'n', along: 2.3, height: 0.25, side: 1 },
  ] as Fixture[],
};

export interface FramePalette {
  fond: string;
  sol: string;
  solTrait: string;
  mur: string;
  murTrait: string;
  murDessus: string;
  meuble: string;
  meubleTrait: string;
  cote: string;
  baie: string;
  porte: string;
}

export const SHOWCASE_PALETTE: FramePalette = {
  fond: '#FFFFFF',
  sol: '#EEF2FB',
  solTrait: '#D5DCEA',
  mur: '#FFFFFF',
  murTrait: '#8A93A3',
  murDessus: '#E4E9F2',
  meuble: '#DCE6FA',
  meubleTrait: '#2F6BFF',
  cote: '#5A6472',
  baie: '#3EB8E5',
  porte: '#E8A13B',
};

/** Mélange de deux couleurs, en fraction. */
function melange(a: string, b: string, t: number): string {
  const lire = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = lire(a);
  const [r2, g2, b2] = lire(b);
  const v = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${v(r1, r2)}${v(g1, g2)}${v(b1, b2)}`;
}

/**
 * LE POCHÉ EST NOIR SUR LE PLAN, GRIS SUR LE VOLUME.
 *
 * C'est la convention du dessin d'architecte, et c'est ce qui rend un plan
 * lisible d'un coup d'œil : la coupe de la maçonnerie se dessine pleine. Vu
 * d'en haut, on ne voit QUE ce dessus — un gris clair y donnait une feuille
 * blanche où rien ne se lisait. En volume, la même surface redevient le
 * dessus des cloisons, et un noir franc y ferait une balafre.
 */
const scenePalette = (p: FramePalette, t = 0): ScenePalette => ({
  floor: p.sol,
  floorStroke: p.solTrait,
  wall: p.mur,
  wallStroke: p.murTrait,
  wallTop: melange('#12161D', p.murDessus, Math.min(1, t * 2.2)),
  wallTopStroke: melange('#12161D', p.murTrait, Math.min(1, t * 2.2)),
  opening: p.baie,
  door: p.porte,
  window: p.baie,
  passage: p.meubleTrait,
  object: p.meuble,
  objectTop: '#FFFFFF',
  objectStroke: p.meubleTrait,
});

/**
 * Lissage SINUSOÏDAL : le plan démarre et s'arrête en douceur, comme une
 * main. Il a remplacé le quadratique pour sa vitesse de pointe : à mi-course,
 * le quadratique file à 1,5 fois la moyenne, le sinus à π/2 — et à quinze
 * images par seconde, c'est ce pic-là qui se voit. Il est borné : hors de
 * [0, 1], une rampe n'a rien à dire.
 */
const soie = (t: number) =>
  (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;

/*
 * LE SCÉNARIO, EN SEPT TEMPS — le cheminement de l'application.
 *
 * Relevé du patron : « en 5-8 secondes, on doit comprendre le cheminement de
 * l'app ». La version d'avant jouait UN geste — la bascule 2D/3D, en boucle.
 * C'était juste et court, et ça ne disait pas ce que l'application produit.
 *
 *   1. LE PLAN. Un T2 à plat, vu de dessus. C'est par là qu'on commence.
 *   2. LA LEVÉE. Les murs montent, la caméra s'incline : le même dessin
 *      devient un volume. Rien n'est remplacé — c'est le plan qui se relève.
 *   3. LA POSE. Les appareils paraissent un par un, chacun à sa place sur son
 *      mur. C'est le sujet de l'application, et c'est le temps qui manquait :
 *      ils étaient là depuis la première image, donc on ne les voyait pas
 *      arriver.
 *   4. LES COTES. Chaque appareil dit sa hauteur, en fondu rapide. C'est le
 *      calque « Cotes » de l'app, joué en une seconde.
 *   5. LE FONDU vers le dossier.
 *   6. LA PAGE qui défile — le PDF qu'on remet au client.
 *   7. LE RETOUR au plan, et ça recommence.
 *
 * ET LA CAMÉRA NE S'ARRÊTE JAMAIS. Un palier où tout se fige se lit comme un
 * diaporama : la visite guidée l'a déjà appris, c'est le mouvement qui
 * continue pendant l'arrêt qui donne la vie. Pendant la pose et les cotes, la
 * caméra dérive en azimut et se rapproche d'un souffle.
 *
 * LA SCÈNE REDESCEND PENDANT QUE LA PAGE EST DEVANT. Elle est cachée — la
 * page couvre l'écran — mais elle redescend quand même, en douceur : le cycle
 * se referme sur le plan sans qu'aucune valeur ne saute, et le garde-fou de
 * continuité garde son sens.
 */
const PLAN_PLAT = 8;
const LEVEE = 18;
const POSE = 12;
const COTES = 9;
const FONDU = 5;
const PAGE = 22;
/** Le retour occupe ce qui reste : 80 − 74 = 6 images. */

interface Instant {
  t: number;
  theta: number;
  zoom: number;
  /** L'arrivée des appareils, 0 → 1. */
  elec: number;
  /** Les cotes de pose, 0 (rien) → 1 (toutes). */
  cotes: number;
  /** Le fondu vers la page du dossier, 0 (la maquette) → 1 (la page). */
  page: number;
  /** Le défilement de la page, 0 (en tête) → 1 (en pied). */
  defilement: number;
}

const NEUTRE = { elec: 0, cotes: 0, page: 0, defilement: 0 };

function instant(frame: number): Instant {
  const n = SHOWCASE_FRAMES;
  const i = ((frame % n) + n) % n;
  let d = 0;

  // 1 — le plan, à plat.
  if (i < (d += PLAN_PLAT)) return { ...NEUTRE, t: 0, theta: 0, zoom: 1 };

  // 2 — la levée.
  if (i < (d += LEVEE)) {
    const t = soie((i - PLAN_PLAT) / LEVEE);
    return { ...NEUTRE, t, theta: -14 * t, zoom: 1 + 0.045 * t };
  }

  // 3 — la pose des appareils, sur une caméra qui dérive.
  if (i < (d += POSE)) {
    const h = soie((i - PLAN_PLAT - LEVEE) / (POSE - 1));
    return {
      ...NEUTRE,
      t: 1,
      theta: -14 - 4 * h,
      zoom: 1.045 + 0.02 * h,
      elec: h,
    };
  }

  // 4 — les cotes, appareils posés.
  if (i < (d += COTES)) {
    const h = soie((i - PLAN_PLAT - LEVEE - POSE) / (COTES - 1));
    return {
      ...NEUTRE,
      t: 1,
      theta: -18 - 3 * h,
      zoom: 1.065 + 0.02 * h,
      elec: 1,
      cotes: h,
    };
  }

  // 5 — le fondu vers le dossier : la maquette reste, la page monte dessus.
  if (i < (d += FONDU)) {
    const h = soie((i - PLAN_PLAT - LEVEE - POSE - COTES) / FONDU);
    return {
      t: 1,
      theta: -21,
      zoom: 1.085,
      elec: 1,
      cotes: 1,
      page: h,
      defilement: 0,
    };
  }

  // 6 — la page défile. Derrière, la maquette redescend vers le plan.
  if (i < (d += PAGE)) {
    const h = (i - PLAN_PLAT - LEVEE - POSE - COTES - FONDU) / (PAGE - 1);
    const t = 1 - soie(h);
    return {
      t,
      theta: -21 * t,
      zoom: 1 + 0.085 * t,
      elec: 1 - soie(h * 1.6),
      cotes: 0,
      page: 1,
      defilement: soie(h),
    };
  }

  // 7 — le retour : la page s'efface sur le plan, prêt à recommencer.
  const reste = n - d;
  const h = soie((i - d) / reste);
  return { ...NEUTRE, t: 0, theta: 0, zoom: 1, page: 1 - h, defilement: 1 };
}

export function avancement(frame: number): number {
  return instant(frame).t;
}

/** La caméra d'une image du cycle : l'azimut (degrés) et le rapprochement. */
export function camera(frame: number): { theta: number; zoom: number } {
  const { theta, zoom } = instant(frame);
  return { theta, zoom };
}

/** Tout ce qui n'est ni la levée ni la caméra : appareils, cotes, dossier. */
export function etatDeLImage(frame: number): Instant {
  return instant(frame);
}

/**
 * LES GROS TITRES — un mot par temps, et c'est lui qui fait comprendre.
 *
 * Relevé du patron : « moderne avec du peps, et des gros titres ». Une
 * animation muette demande à l'œil de deviner ce qu'il regarde : on voit un
 * plan se lever sans savoir que c'est ÇA, le geste de l'application. Un mot
 * posé dessus fait la moitié du travail — et permet de raccourcir le reste,
 * parce qu'on lit « LE RELEVÉ » plus vite qu'on ne le déduit.
 *
 * CINQ MOTS, DIX SIGNES AU PLUS. C'est ce qui permet de les écrire GROS : à
 * dix signes, le mot tient toute la largeur de l'écran en corps 30. Un
 * sixième mot, ou un mot de quinze signes, et l'on retombe sur du texte.
 */
export const TITRES: { mot: string; jusqua: number }[] = [
  { mot: 'LE RELEVÉ', jusqua: PLAN_PLAT },
  { mot: 'EN VOLUME', jusqua: PLAN_PLAT + LEVEE },
  { mot: 'LES PRISES', jusqua: PLAN_PLAT + LEVEE + POSE },
  { mot: 'LES COTES', jusqua: PLAN_PLAT + LEVEE + POSE + COTES },
  { mot: 'LE DOSSIER', jusqua: SHOWCASE_FRAMES },
];

/**
 * Le titre d'une image, et son ENTRÉE.
 *
 * `avance` va de 0 à 1 sur les trois premières images du temps : le mot
 * monte de douze points et paraît. Trois images, c'est deux dixièmes de
 * seconde — assez pour que ce soit un mouvement, trop peu pour qu'on
 * attende. C'est ça, le peps : rien ne se pose mollement.
 */
export function titreDeLImage(frame: number): { mot: string; avance: number } {
  const n = SHOWCASE_FRAMES;
  const i = ((frame % n) + n) % n;
  let debut = 0;
  for (const t of TITRES) {
    if (i < t.jusqua) {
      return { mot: t.mot, avance: soie((i - debut + 1) / 3) };
    }
    debut = t.jusqua;
  }
  return { mot: TITRES[TITRES.length - 1].mot, avance: 1 };
}

/** Où l'on en est du cycle, de 0 à 1 : c'est la barre du bandeau. */
export function progression(frame: number): number {
  const n = SHOWCASE_FRAMES;
  return (((frame % n) + n) % n) / (n - 1);
}

/**
 * LE BANDEAU DU TITRE — posé sur tout, y compris sur le dossier.
 *
 * Il est PLEIN et bleu, et non un texte posé à même l'image : le mot doit se
 * lire aussi bien sur un plan blanc que sur une page de bordereau grise, et
 * un texte qui change de fond change de lisibilité. Un aplat règle la
 * question une fois pour toutes.
 *
 * ET IL PORTE LA BARRE D'AVANCEMENT. Elle ne sert à rien qu'à dire « ça
 * tourne, et ça va finir » — c'est exactement ce qu'on regarde sans le
 * savoir sur une vitrine.
 */
export function bandeauSvg(
  frame: number,
  W: number,
  H: number,
  p: FramePalette = SHOWCASE_PALETTE,
): string {
  const { mot, avance } = titreDeLImage(frame);
  const haut = 58;
  const y = H - haut;
  // Le mot monte en paraissant : douze points, sur les trois images d'entrée.
  const monte = (1 - avance) * 12;
  const corps = Math.min(30, (W * 0.86) / (mot.length * 0.58));
  return (
    `<rect x="0" y="${y}" width="${W}" height="${haut}" fill="${p.meubleTrait}"/>` +
    `<g opacity="${avance.toFixed(2)}">` +
    `<text x="${(W / 2).toFixed(0)}" y="${(y + 36 + monte).toFixed(1)}" ` +
    `font-family="Helvetica" font-size="${corps.toFixed(1)}" font-weight="bold" ` +
    `letter-spacing="0.5" text-anchor="middle" fill="#FFFFFF">${mot}</text>` +
    `</g>` +
    // La barre : un rail sombre, un trait blanc qui avance dessus.
    `<rect x="0" y="${(H - 4).toFixed(0)}" width="${W}" height="4" ` +
    `fill="#FFFFFF" fill-opacity="0.25"/>` +
    `<rect x="0" y="${(H - 4).toFixed(0)}" ` +
    `width="${(W * progression(frame)).toFixed(1)}" height="4" fill="#FFFFFF"/>`
  );
}

/*
 * LA POSE D'UN APPAREIL — chacun son tour, et pas tous ensemble.
 *
 * Six appareils qui paraissent d'un bloc, c'est un calque qu'on allume ; six
 * appareils qui se posent l'un après l'autre, c'est quelqu'un qui équipe un
 * logement. Les fenêtres se chevauchent largement — on ne compte pas jusqu'à
 * six, on voit un logement s'équiper.
 */
/**
 * L'APPAREIL QUI PORTE LA COTE ÉCRITE.
 *
 * UN INTERRUPTEUR, parce qu'il est haut — cent dix centimètres — : son filet
 * est long et la bulle a de la place. Une cote de prise à vingt-cinq
 * centimètres se pose au ras du sol, là où le mobilier passe devant.
 *
 * ET CELUI DU REFEND, PAS CELUI DU SÉJOUR. Le premier choix était
 * l'interrupteur de l'entrée, posé sur le mur de droite : sa bulle sortait de
 * l'écran par le bord, et le temps fort des cotes ne montrait rien du tout.
 * Celui du refend est au milieu du logement, quel que soit l'angle de la
 * caméra.
 */
const COTE_MONTREE = 'f5';

export function pose(elec: number, k: number): number {
  const debut = (k / Math.max(1, PLAN.elec.length)) * 0.55;
  return soie((elec - debut) / 0.45);
}

/*
 * LA VAGUE DU MOBILIER : chaque meuble a sa fenêtre d'apparition, calée sur
 * sa position — la chambre en haut se meuble d'abord, le séjour en bas la
 * rattrape. Les fenêtres se chevauchent largement : on voit un logement qui
 * se remplit, pas des meubles qui surgissent un à un. Et comme la fenêtre
 * dépend de `t`, la vague se rejoue à l'envers pendant le retour, d'elle-même.
 */
export function cascade(t: number, k: number): number {
  const cz = PLAN.meubles[k]?.[3] ?? 0;
  const debut = 0.05 + (cz / 6.4) * 0.26;
  return soie((t - debut) / 0.38);
}

/**
 * Une image de l'animation, en SVG.
 *
 * `t` va de 0 (le plan, à plat, coté) à 1 (le volume meublé). Tout le reste
 * en découle : la hauteur des murs, l'inclinaison de la caméra, la présence
 * des meubles, l'effacement des cotes.
 */
export function frameSvg(
  t: number,
  W: number,
  H: number,
  p: FramePalette = SHOWCASE_PALETTE,
  // La caméra du CYCLE : `t` ne dit que la levée, la dérive des paliers
  // vient d'ici. Sans elle, on retombe sur une caméra asservie à `t`.
  cam?: { theta?: number; zoom?: number },
  /*
    CE QUI NE SE DÉDUIT PAS DE LA LEVÉE : les appareils arrivent après elle,
    les cotes après eux. `t` ne sait dire que la hauteur des murs.
  */
  etat?: { elec?: number; cotes?: number },
): string {
  /*
    LE PLAN SE LÈVE, AU SENS PROPRE.

    À `t` = 0 les murs n'ont pas d'épaisseur visible et la caméra est à la
    verticale : c'est un plan. Les murs poussent ensuite, la caméra descend
    vers l'oblique, et le même dessin devient un volume. Rien n'est coupé ni
    remplacé — c'est bien le plan qu'on regarde se relever.
  */
  const hauteur = 0.02 + 2.48 * t;
  /*
    L'INCLINAISON PART DE ZÉRO, et non de quatre-vingt-dix.

    La projection écrit `sy = rz·cos(tilt) − y·sin(tilt)` : à zéro, la hauteur
    n'a aucun effet et l'on regarde droit d'en haut — c'est le plan. À
    quatre-vingt-dix, c'est l'inverse : la profondeur disparaît et tout
    s'écrase sur une ligne. Pris à l'envers, le « plan » de la première image
    était un trait horizontal, et le banc l'a dit avant l'écran.
  */
  const tilt = 52 * t;
  // Un quart de tour très lent pendant la levée : le volume se révèle au
  // lieu de se déplier de face. Le cycle complet passe sa propre caméra,
  // qui dérive aussi pendant les paliers.
  const theta = cam?.theta ?? -14 * t;
  const zoom = cam?.zoom ?? 1;

  const murs = PLAN.murs.map(([id, ax, az, bx, bz]) =>
    mur(id, ax, az, bx, bz, hauteur),
  );
  /*
    CHAQUE PIÈCE A SA PORTE ET SA FENÊTRE.

    Le logement n'avait qu'une baie et une porte d'entrée : la chambre ne
    s'ouvrait sur rien, ce qui se voit tout de suite sur un plan. Il y a
    maintenant la porte palière, la porte de chambre dans le refend, et une
    fenêtre par pièce — la chambre au nord, le séjour à l'ouest.
  */
  const baie = (
    id: string,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    type: 'window' | 'door',
    haut: number,
    allege: number,
  ): WallSeg => {
    const h = Math.max(0.02, Math.min(haut, hauteur - allege));
    return {
      ...mur(id, ax, az, bx, bz, hauteur),
      type,
      height: h,
      yCenter: allege + h / 2,
    };
  };
  const ouvertures: WallSeg[] = [
    baie('fen-sejour', 0, 5.6, 0, 4.1, 'window', 1.45, 0.95),
    baie('fen-chambre', 2.7, 0, 3.9, 0, 'window', 1.35, 1.0),
    baie('porte-entree', 4.2, 5.05, 4.2, 5.95, 'door', 2.05, 0),
    baie('porte-chambre', 3.0, 2.7, 3.85, 2.7, 'door', 2.05, 0),
  ];
  /*
    LE MOBILIER ARRIVE EN VAGUE, PAS D'UN COUP — ni même d'un seul fondu.

    Il sortait du sol à pleine opacité : une coupure, corrigée d'abord par un
    fondu global. Mais un logement entier qui se matérialise d'un bloc reste
    mécanique. Chaque meuble a maintenant sa fenêtre (`cascade`), calée sur
    sa position : la vague suit la levée du nord au sud, chaque meuble sort
    du sol en fondu, et les fenêtres se chevauchent assez pour qu'on voie un
    logement se remplir — pas des meubles surgir.
  */
  const apparitions = PLAN.meubles.map((_, k) => cascade(t, k));
  const appParId = new Map(
    PLAN.meubles.map(([id], k) => [id, apparitions[k]]),
  );
  const meubles = PLAN.meubles.map(([id, cat, cx, cz, w, d, h], k) =>
    meuble(id, cat, cx, cz, w, d, Math.max(0.02, h * apparitions[k])),
  );

  const scene = buildScene(murs, ouvertures, meubles, {
    palette: scenePalette(p, t),
    showSurfaces: true,
    rooms: [{ id: 'r1', wallIds: PLAN.murs.map(([id]) => id) }],
    coarse: true,
  });
  // Le cadrage se prend sur le VOLUME FINAL, une fois pour toutes : cadrer
  // chaque image sur son propre contenu ferait respirer le logement pendant
  // la levée, comme un zoom qu'on n'a pas demandé.
  const reference = buildScene(
    PLAN.murs.map(([id, ax, az, bx, bz]) => mur(id, ax, az, bx, bz, 2.5)),
    [],
    [],
    {
      palette: scenePalette(p, 1),
      showSurfaces: true,
      rooms: [{ id: 'r1', wallIds: PLAN.murs.map(([id]) => id) }],
      coarse: true,
    },
  );
  const cadre = sceneFraming(reference.faces);

  const rad = (d: number) => (d * Math.PI) / 180;
  const ct = Math.cos(rad(theta));
  const st = Math.sin(rad(theta));
  const cp = Math.cos(rad(tilt));
  const sp = Math.sin(rad(tilt));
  // Le logement laisse une marge franche sur les quatre côtés — et le
  // rapprochement du palier se paie ici, sur l'échelle : 8,5 % au plus,
  // la marge l'absorbe sans qu'un mur sorte du cadre.
  const scale = (Math.min(W, H) * 0.6 * zoom) / cadre.radius3d;
  const project = (q: { x: number; y: number; z: number }) => {
    const x = q.x - cadre.center.x;
    const y = q.y - cadre.center.y;
    const z = q.z - cadre.center.z;
    const rx = x * ct - z * st;
    const rz = x * st + z * ct;
    return {
      sx: W / 2 + rx * scale,
      sy: H / 2 + (rz * cp - y * sp) * scale,
      depth: rz * sp + y * cp,
    };
  };
  const oeil = { ct, st, cp, sp };

  const out: string[] = [];
  out.push(`<rect width="${W}" height="${H}" fill="${p.fond}"/>`);

  const polys = scene.faces
    .filter((f) => !isHiddenFace(f, oeil))
    .map((f) => {
      const proj = f.pts.map(project);
      const voile = f.cutaway && f.normal ? cutawayOpacity(f.normal, oeil) : 1;
      return {
        depth: faceDepth(f, project, oeil),
        fill: shadeFill(f, ct, st),
        stroke: f.stroke,
        // `ownerId` dit À QUEL meuble appartient la face : c'est ce qui
        // permet à chacun de suivre sa propre fenêtre de la vague.
        owner: f.ownerId,
        voile,
        n: proj.length,
        points: proj.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' '),
      };
    })
    .sort((a, b) => a.depth - b.depth);
  for (const q of polys) {
    // Chaque meuble monte en opacité sur sa fenêtre ; la maçonnerie, elle,
    // est là dès la première image — c'est le plan.
    const vu = q.owner ? q.voile * (appParId.get(q.owner) ?? 1) : q.voile;
    if (vu < 0.01) continue;
    // Le trait d'un meuble suit exactement son fondu ; celui de la
    // maçonnerie garde son minimum, qui dit l'écorché.
    const trait = q.owner ? vu : 0.3 + 0.7 * vu;
    const commun =
      `stroke="${q.stroke ?? 'none'}" stroke-width="${q.n === 2 ? 1 : 0.9}" ` +
      `stroke-opacity="${trait.toFixed(2)}"`;
    out.push(
      q.n === 2
        ? `<polyline points="${q.points}" fill="none" ${commun}/>`
        : `<polygon points="${q.points}" fill="${q.fill ?? 'none'}" ` +
          `fill-opacity="${vu.toFixed(2)}" ${commun}/>`,
    );
  }

  /*
    LES APPAREILS SE POSENT, ILS NE SONT PLUS LÀ D'AVANCE.

    C'est le sujet de l'application, et c'était le temps qui manquait au
    scénario : ils paraissaient dès la première image, donc on ne les voyait
    jamais arriver. Relevé du patron : « des interrupteurs et prises pop à des
    endroits ». Chacun a sa fenêtre (`pose`), et il grandit en paraissant —
    c'est ce sursaut d'échelle qui fait lire un « pop » plutôt qu'un fondu.

    PUIS ILS DISENT LEUR HAUTEUR. « On affiche les cotes rapidement » : un
    filet jusqu'au sol et le nombre en centimètres, comme le calque « Cotes »
    de l'application. La vitrine ne cotait plus rien depuis qu'on lui avait
    retiré les cotes du PLAN — celles-là donnaient la taille d'un logement
    inventé, ce qui n'apprend rien. Une cote d'appareil, elle, dit ce que
    l'app sait faire.
  */
  const elec = Math.max(0, Math.min(1, etat?.elec ?? 1));
  const cotes = Math.max(0, Math.min(1, etat?.cotes ?? 0));
  const parMur = new Map(murs.map((w) => [w.id, w]));
  for (const [k, f] of PLAN.elec.entries()) {
    const vu = pose(elec, k);
    if (vu < 0.02) continue;
    const w = parMur.get(f.wallId);
    if (!w) continue;
    const len = segLength(w) || 1;
    const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
    const at = {
      x: w.a.x + u.x * f.along,
      y: Math.min(f.height, hauteur * 0.9),
      z: w.a.z + u.z * f.along,
    };
    const q = project(at);
    const spec = FIXTURES[f.kind];
    /*
      LE SIGLE S'ÉCRIT, il ne se met pas dans une pastille.

      Un disque de couleur dit qu'il y a quelque chose, jamais quoi : sur un
      mur qui en porte trois, on comptait des confettis. Le sigle se lit à la
      même taille, dans la couleur de sa famille, avec un liseré clair qui le
      détache du poché comme du mobilier.
    */
    const cx = q.sx.toFixed(1);
    const cy = (q.sy + 3).toFixed(1);
    // Le sursaut : il paraît à 60 % de sa taille et finit à 100 %.
    const corps = (9 * (0.6 + 0.4 * vu)).toFixed(1);
    const police =
      `font-family="Helvetica" font-size="${corps}" font-weight="bold" ` +
      `text-anchor="middle"`;
    out.push(
      `<text x="${cx}" y="${cy}" ${police} fill="none" ` +
        `stroke="#FFFFFF" stroke-width="3" opacity="${vu.toFixed(2)}">` +
        `${spec.short}</text>`,
      `<text x="${cx}" y="${cy}" ${police} fill="${spec.color}" ` +
        `opacity="${vu.toFixed(2)}">${spec.short}</text>`,
    );
    /*
      L'ONDE DU POP — un anneau qui s'ouvre et s'efface, sur les trois quarts
      de l'apparition. C'est ce qui distingue un appareil qui SE POSE d'un
      appareil qui se contente de paraître : l'œil suit le cercle, et sait
      qu'il vient d'arriver quelque chose ici.
    */
    if (vu > 0.02 && vu < 0.98) {
      const onde = Math.max(0, Math.min(1, vu / 0.85));
      out.push(
        `<circle cx="${cx}" cy="${(q.sy - 1).toFixed(1)}" ` +
          `r="${(4 + 14 * onde).toFixed(1)}" fill="none" ` +
          `stroke="${spec.color}" stroke-width="${(2.2 * (1 - onde)).toFixed(2)}" ` +
          `opacity="${(0.75 * (1 - onde)).toFixed(2)}"/>`,
      );
    }
    if (cotes > 0.02) {
      /*
        LE FILET DESCEND AU SOL, sous l'appareil : c'est le dessin du calque
        « Cotes », la hauteur de pose qu'on trace au crayon avant de percer.

        MAIS LE NOMBRE NE S'ÉCRIT PLUS À CÔTÉ DE CHAQUE FILET. Premier jet :
        un « 110 » et un « 25 » en corps sept et demi, sur chacun des six
        appareils. Regardé à la taille réelle de la maquette — l'écran fait
        cent dix-huit points de large, l'image deux cent soixante-quatre —,
        ces nombres tombaient sous quatre points : six taches grises
        illisibles, et un temps fort qui ne montrait rien.

        Les filets restent — ils disent que le calque est allumé — et UNE
        SEULE cote s'écrit, en grand, sur un appareil (voir plus bas). C'est
        la même chose qu'un plan qu'on annote pour une photo : on ne cote pas
        tout, on montre qu'on cote.
      */
      const bas = project({ x: at.x, y: 0, z: at.z });
      out.push(
        `<line x1="${cx}" y1="${(q.sy + 6).toFixed(1)}" x2="${bas.sx.toFixed(1)}" ` +
          `y2="${bas.sy.toFixed(1)}" stroke="${p.cote}" stroke-width="0.9" ` +
          `stroke-dasharray="2 2" opacity="${(cotes * vu).toFixed(2)}"/>`,
      );
      if (f.id === COTE_MONTREE) {
        /*
          LA BULLE DE COTE — grosse, pleine, posée à côté de son appareil.
          Dix-huit points sur une image de deux cent soixante-quatre : elle se
          lit sur le téléphone, ce qui est tout ce qu'on lui demande.
        */
        const cm = `${Math.round(f.height * 100)} cm`;
        const larg = cm.length * 10 + 16;
        /*
          LA BULLE SE POSE DU CÔTÉ OÙ IL Y A DE LA PLACE. Toujours à droite,
          elle sortait du cadre dès que l'appareil était dans la moitié droite
          de l'écran — et une bulle hors champ ne cote rien.
        */
        const aGauche = q.sx > W * 0.55;
        const bx = aGauche ? q.sx - 12 - larg : q.sx + 12;
        const by = (q.sy + bas.sy) / 2 - 12;
        out.push(
          `<line x1="${cx}" y1="${((q.sy + bas.sy) / 2).toFixed(1)}" ` +
            `x2="${(aGauche ? bx + larg - 4 : bx + 4).toFixed(1)}" ` +
            `y2="${(by + 12).toFixed(1)}" ` +
            `stroke="${p.meubleTrait}" stroke-width="1.2" ` +
            `opacity="${cotes.toFixed(2)}"/>`,
          `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${larg}" ` +
            `height="24" rx="12" fill="${p.meubleTrait}" ` +
            `opacity="${cotes.toFixed(2)}"/>`,
          `<text x="${(bx + larg / 2).toFixed(1)}" y="${(by + 17).toFixed(1)}" ` +
            `font-family="Helvetica" font-size="14" font-weight="bold" ` +
            `text-anchor="middle" fill="#FFFFFF" ` +
            `opacity="${cotes.toFixed(2)}">${cm}</text>`,
        );
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`
  );
}

/**
 * LE DOSSIER QU'ON REMET AU CLIENT — deux feuilles, qui défilent.
 *
 * Relevé du patron : « un aperçu d'un scroll du PDF final des plans etc. ».
 * C'est la fin du cheminement, et c'est ce qu'on ne montrait nulle part : la
 * vitrine s'arrêtait au volume, alors que le volume n'est qu'une étape — ce
 * qu'on emporte sur le chantier, c'est le dossier.
 *
 * LA PREMIÈRE FEUILLE PORTE LE VRAI PLAN. Elle rappelle `frameSvg` à plat et
 * le réduit dans son cadre : c'est le même dessin que celui qu'on vient de
 * regarder se lever, pas une illustration à côté. Deux plans dessinés
 * séparément finiraient par ne plus se ressembler.
 *
 * LA SECONDE EST UN BORDEREAU : des lignes, des quantités à droite, un total
 * plus foncé. On ne cherche pas à le faire lire — on cherche à ce qu'on le
 * RECONNAISSE en une demi-seconde, et une liste chiffrée se reconnaît à sa
 * forme.
 */
export function pageSvg(
  defilement: number,
  W: number,
  H: number,
  p: FramePalette = SHOWCASE_PALETTE,
): string {
  const d = Math.max(0, Math.min(1, defilement));
  // Deux feuilles et leur entre-deux : la course du défilement, c'est ce qui
  // dépasse de l'écran.
  const feuille = H * 0.98;
  const ecart = H * 0.06;
  const total = feuille * 2 + ecart;
  const y0 = -d * (total - H);
  const out: string[] = [];
  out.push(`<rect width="${W}" height="${H}" fill="#E7EAF0"/>`);
  out.push(`<g transform="translate(0 ${y0.toFixed(1)})">`);

  /** Une feuille blanche, ombre portée comprise. */
  const sheet = (y: number) =>
    `<rect x="6" y="${y.toFixed(1)}" width="${W - 12}" height="${feuille.toFixed(1)}" ` +
    `fill="#FFFFFF" stroke="#D5DCEA" stroke-width="1"/>`;

  // ---------------------------------------------------------- feuille 1
  out.push(sheet(0));
  const cartouche = (y: number, titre: string) =>
    `<rect x="6" y="${y.toFixed(1)}" width="${W - 12}" height="26" fill="${p.meubleTrait}"/>` +
    `<text x="18" y="${(y + 18).toFixed(1)}" font-family="Helvetica" font-size="12" ` +
    `font-weight="bold" fill="#FFFFFF">${titre}</text>`;
  out.push(cartouche(0, 'PLAN — T2, 27 m²'));
  /*
    LE PLAN DE LA FEUILLE EST LE PLAN DE LA VITRINE, réduit. Le rappel se fait
    à plat, appareils posés, sans cotes : c'est le plan qu'on imprime.
  */
  const cadreP = {
    x: 16,
    y: 40,
    w: Math.round(W - 32),
    h: Math.round(feuille * 0.52),
  };
  /*
    LE PLAN SE REND À LA TAILLE DE SON CADRE, il ne se réduit pas.

    Premier jet : on rendait le plan sur le format de l'écran, puis on
    l'écrasait dans le bloc de la feuille. Le cadrage de `frameSvg` réserve
    déjà une marge franche sur les quatre côtés ; réduit une seconde fois, le
    plan tenait dans le tiers de la largeur et la feuille était un désert
    blanc. Regardé en image, c'est ce qui sautait aux yeux.

    Rendu DIRECTEMENT au format du bloc, il se cadre tout seul dessus : la
    même fonction, un autre papier.
  */
  const mini = frameSvg(
    0,
    cadreP.w,
    cadreP.h,
    p,
    { theta: 0, zoom: 1 },
    { elec: 1, cotes: 0 },
  )
    .replace(/^[\s\S]*?viewBox="[^"]*">/, '')
    .replace(/<\/svg>$/, '');
  out.push(
    `<g transform="translate(${cadreP.x} ${cadreP.y})">${mini}</g>`,
  );
  // Le bloc de légende, sous le plan : trois lignes et leur pastille.
  const legende = cadreP.y + cadreP.h + 14;
  for (const [i, teinte] of [p.meubleTrait, p.porte, p.baie].entries()) {
    const y = legende + i * 16;
    out.push(
      `<circle cx="24" cy="${y.toFixed(1)}" r="4" fill="${teinte}"/>`,
      `<rect x="34" y="${(y - 3.5).toFixed(1)}" width="${(W * 0.42 - i * 18).toFixed(0)}" ` +
        `height="7" rx="3.5" fill="#C9D0DC"/>`,
    );
  }

  /*
    ET LE CARTOUCHE, EN PIED DE FEUILLE.

    Regardé en image, le bas de la première page était un désert blanc sur
    quarante pour cent de sa hauteur. Un plan d'exécution porte son cartouche
    en bas à droite — c'est ce qui le fait reconnaître comme un document et
    non comme une capture d'écran encadrée.
  */
  const yc = feuille - 76;
  out.push(
    `<rect x="${(W * 0.38).toFixed(0)}" y="${yc.toFixed(1)}" ` +
      `width="${(W * 0.62 - 6).toFixed(0)}" height="56" fill="none" ` +
      `stroke="#C9D0DC" stroke-width="1"/>`,
    `<line x1="${(W * 0.38).toFixed(0)}" y1="${(yc + 18).toFixed(1)}" ` +
      `x2="${(W - 6).toFixed(0)}" y2="${(yc + 18).toFixed(1)}" ` +
      `stroke="#C9D0DC" stroke-width="1"/>`,
    `<text x="${(W * 0.38 + 8).toFixed(0)}" y="${(yc + 13).toFixed(1)}" ` +
      `font-family="Helvetica" font-size="8" font-weight="bold" ` +
      `fill="${p.cote}">ECHOPLAN</text>`,
  );
  for (let i = 0; i < 3; i++) {
    out.push(
      `<rect x="${(W * 0.38 + 8).toFixed(0)}" y="${(yc + 26 + i * 10).toFixed(1)}" ` +
        `width="${(W * 0.42 - i * 14).toFixed(0)}" height="5" rx="2.5" ` +
        `fill="#D5DCEA"/>`,
    );
  }

  // ---------------------------------------------------------- feuille 2
  const y2 = feuille + ecart;
  out.push(sheet(y2));
  out.push(cartouche(y2, 'FOURNITURES'));
  for (let i = 0; i < 13; i++) {
    const y = y2 + 44 + i * 20;
    const large = 0.34 + ((i * 7) % 5) * 0.07;
    out.push(
      `<rect x="18" y="${(y - 8).toFixed(1)}" width="14" height="14" rx="3" ` +
        `fill="#EDF1F8" stroke="#D5DCEA" stroke-width="0.8"/>`,
      `<rect x="38" y="${(y - 3.5).toFixed(1)}" width="${(W * large).toFixed(0)}" ` +
        `height="7" rx="3.5" fill="#C9D0DC"/>`,
      `<rect x="${(W - 62).toFixed(0)}" y="${(y - 3.5).toFixed(1)}" width="44" ` +
        `height="7" rx="3.5" fill="#9AA5B5"/>`,
    );
  }
  const yTotal = y2 + 44 + 13 * 20 + 10;
  out.push(
    `<line x1="18" y1="${yTotal.toFixed(1)}" x2="${W - 18}" y2="${yTotal.toFixed(1)}" ` +
      `stroke="#9AA5B5" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<rect x="${(W - 96).toFixed(0)}" y="${(yTotal + 10).toFixed(1)}" width="78" ` +
      `height="12" rx="6" fill="${p.meubleTrait}"/>`,
  );

  out.push('</g>');
  return out.join('');
}

/**
 * UNE IMAGE DU CYCLE, tout compris — la maquette, puis le dossier par-dessus.
 *
 * LE FONDU SE FAIT ICI, ET NON PAR UN CHANGEMENT DE SCÈNE. Les deux dessins
 * sont posés l'un sur l'autre avec leurs opacités : c'est ce qui donne une
 * transition en fondu plutôt qu'une coupure, et c'est ce que le relevé
 * demande — « des transitions rapides mais en fondu toujours ».
 */
export function imageSvg(
  frame: number,
  W: number,
  H: number,
  p: FramePalette = SHOWCASE_PALETTE,
): string {
  const e = instant(frame);
  const scene = frameSvg(e.t, W, H, p, { theta: e.theta, zoom: e.zoom }, e)
    .replace(/^[\s\S]*?viewBox="[^"]*">/, '')
    .replace(/<\/svg>$/, '');
  const corps = [`<g opacity="${(1 - e.page).toFixed(2)}">${scene}</g>`];
  if (e.page > 0.01) {
    corps.push(
      `<g opacity="${e.page.toFixed(2)}">${pageSvg(e.defilement, W, H, p)}</g>`,
    );
  }
  /*
    LE TITRE PASSE APRÈS TOUT LE MONDE — c'est la couche qui NARRE, et elle ne
    participe pas au fondu : le mot ne doit pas pâlir pendant qu'une page monte
    dessous, sinon la seule chose qui explique l'image devient illisible juste
    au moment où l'image change.
  */
  corps.push(bandeauSvg(frame, W, H, p));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}">${corps.join('')}</svg>`
  );
}
