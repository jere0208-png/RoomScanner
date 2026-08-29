/**
 * L'ANIMATION DE LA VITRINE — le plan qui se lève, image par image.
 *
 * Elle montre en cinq secondes ce que fait l'application : un plan qui se
 * RELÈVE en volume, s'équipe, se cote, et finit en dossier. C'est le
 * cheminement de l'app, joué tout seul.
 *
 * CES IMAGES SONT CALCULÉES AU BUILD, PAS SUR LE TÉLÉPHONE.
 *
 * La toute première version rendait la scène à vingt-cinq images par seconde
 * sur l'appareil : cent cinquante polygones reprojetés à chaque image, sur un
 * écran d'accueil qui n'a rien à calculer. Tout est cuit d'avance
 * (`npm run showcase`) et embarqué : le téléphone ne fait que feuilleter.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ART DIRECTION : NUIT ÉLECTRIQUE.
 *
 * Relevé du patron, en la regardant tourner : « l'animation de l'iPhone et de
 * son écran ne me convainc pas, on dirait un truc bas de gamme. Je veux
 * quelque chose de dynamique, rapide, fluide, JS style. Un vrai art style. »
 *
 * IL A RAISON, ET LE DÉFAUT SE NOMME. La vitrine d'avant était un DESSIN
 * TECHNIQUE JUSTE, pas une image : fond blanc, murs blancs, feuilles
 * blanches, un bandeau bleu plein en bas avec le mot dedans. Rien de faux —
 * et rien de choisi. Une capture d'écran de logiciel de CAO, exactement ce
 * qu'on ne veut pas montrer pour vendre.
 *
 * QUATRE DÉCISIONS, ET C'EST TOUT CE QUI CHANGE :
 *
 *   1. LE FOND DEVIENT NOIR. C'est le seul geste qui transforme un plan de
 *      CAO en objet : sur le noir, le bleu et le cyan ÉMETTENT au lieu de
 *      colorier. Le poché du plan s'inverse — blanc lumineux au lieu de noir
 *      —, et l'on retrouve le plan d'architecte en négatif, qui est ce que
 *      tout le monde reconnaît comme « une image de plan ».
 *
 *   2. LE SOL EST UNE GRILLE. Une trame d'un mètre, qui DÉPASSE du logement
 *      et s'éteint vers les bords. Le logement cesse de flotter dans le vide :
 *      il est POSÉ quelque part, et cette trame dit l'échelle sans écrire un
 *      chiffre. C'est la profondeur qu'un aplat n'a pas.
 *
 *   3. LE BANDEAU DISPARAÎT, LE TITRE DESCEND EN BAS À GAUCHE. Un aplat plein
 *      avec un mot centré dedans, c'est une barre d'état ; un mot posé à même
 *      l'image, gros, aligné à gauche, avec son numéro et son filet, c'est une
 *      affiche. Et il ENTRE PAR UNE FENTE — un masque qui découvre le mot
 *      pendant qu'il monte, et le ravale à la fin du temps. Rien ne se pose
 *      mollement, rien ne s'efface non plus : ça coupe au montage.
 *
 *   4. VINGT-QUATRE IMAGES PAR SECONDE, ET NON QUINZE. C'est le mot
 *      « fluide », et il ne s'obtient pas autrement : à quinze, un mouvement
 *      rapide se lit par saccades, quel que soit le lissage. Soixante pour
 *      cent d'images en plus, et le lissage sinusoïdal peut enfin aller vite
 *      sans stroboscoper.
 *
 * ET LE DOSSIER CESSE D'ÊTRE UNE PAGE BLANCHE PLEIN CADRE. C'est une FEUILLE
 * qui monte du bas, avec ses marges et son ombre portée, pendant que la
 * maquette recule et s'assombrit derrière. On voit un document se poser sur
 * une scène, au lieu d'un écran qui devient blanc.
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
  type ScenePalette,
} from '../geometry/scene3d';
import { segLength, type WallSeg } from '../geometry/floorplan';
import { FIXTURES, type Fixture } from '../geometry/electrical';
import type { ObjectData } from 'react-native-room-scan';

/** La cadence de la vitrine. Voir `SHOWCASE_FRAMES` pour le pourquoi. */
export const IPS = 24;

/**
 * Le nombre d'images du cycle complet — cinq secondes rondes à 24 i/s.
 *
 * IL A LONGTEMPS SUIVI LA DURÉE, IL SUIT MAINTENANT LA CADENCE. De 44 à 52
 * quand la levée s'est allongée, de 52 à 105 quand la vitrine a cessé de
 * montrer un geste pour raconter un cheminement, de 105 à 80 parce que sept
 * secondes c'était long.
 *
 * DE 80 À 120 POUR UNE RAISON D'UNE AUTRE NATURE : la durée ne bouge pas
 * — cinq secondes avant, cinq secondes après —, c'est la CADENCE qui passe
 * de quinze à vingt-quatre images par seconde. Relevé du patron : « je veux
 * quelque chose de dynamique, rapide, fluide ».
 *
 * ET « FLUIDE » NE S'OBTIENT PAS AUTREMENT. On peut lisser une trajectoire
 * autant qu'on veut : à quinze images par seconde, l'œil sépare encore les
 * poses d'un mouvement rapide, et c'est ce hachage-là qu'on lit comme du bas
 * de gamme. Vingt-quatre, c'est la cadence du cinéma, et c'est le premier
 * palier où un mouvement franc cesse de se décomposer.
 *
 * CE QUE ÇA COÛTE : quarante images de plus dans l'IPA. Elles sont en
 * palette réduite sur un fond presque noir — de grands aplats sombres, ce
 * que le PNG compresse le mieux.
 */
export const SHOWCASE_FRAMES = 120;

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
  /** Le fond de l'écran, et la couleur du voile de vignettage. */
  fond: string;
  /** La lueur derrière la maquette : ce qui la décolle du fond. */
  lueur: string;
  /** La trame du sol, en dessous et autour du logement. */
  grille: string;
  sol: string;
  solTrait: string;
  mur: string;
  murTrait: string;
  /** Le poché VU DE DESSUS, à plat : c'est le trait du plan. */
  poche: string;
  pocheTrait: string;
  /** Le dessus des cloisons, une fois le volume levé. */
  murDessus: string;
  murDessusTrait: string;
  meuble: string;
  meubleDessus: string;
  meubleTrait: string;
  cote: string;
  baie: string;
  porte: string;
  /** La couleur qui signe : titres, filets, bulles de cote. */
  accent: string;
  texte: string;
  /** Les deux pôles de l'ombrage : le côté à l'ombre, le côté éclairé. */
  ombre: string;
  lumiere: string;
}

/**
 * LA PALETTE DE LA VITRINE — nuit électrique.
 *
 * Trois familles, et pas une de plus : le NOIR BLEUTÉ du fond et de ses
 * dégradés, le BLEU ÉLECTRIQUE qui signe (titres, filets, mobilier), le CYAN
 * et l'AMBRE qui ne servent qu'aux ouvertures — une fenêtre, une porte. Tout
 * le reste est du gris bleu.
 *
 * LE POCHÉ EST BLANC, ET C'EST L'INVERSION QUI FAIT L'IMAGE. Sur papier, la
 * coupe de la maçonnerie se dessine pleine et noire ; c'est la convention, et
 * c'est ce qui rend un plan lisible d'un coup d'œil. Sur un fond noir, la
 * même convention se lit à l'envers : le poché devient la seule chose
 * lumineuse de l'écran, et la première image du cycle est un plan
 * d'architecte en négatif.
 */
export const SHOWCASE_PALETTE: FramePalette = {
  fond: '#080B12',
  lueur: '#16386E',
  grille: '#2B3E63',
  sol: '#1C2D4B',
  solTrait: '#2E4166',
  mur: '#0F1829',
  murTrait: '#3E5375',
  poche: '#E9F0FF',
  pocheTrait: '#FFFFFF',
  murDessus: '#7C90B6',
  murDessusTrait: '#A9BCDD',
  meuble: '#17233C',
  meubleDessus: '#22314F',
  meubleTrait: '#3D7BFF',
  cote: '#93A6C6',
  baie: '#22D3EE',
  porte: '#FFB020',
  accent: '#3D7BFF',
  texte: '#FFFFFF',
  ombre: '#040711',
  lumiere: '#A8C8FF',
};

/**
 * LA PALETTE DU PAPIER — celle du plan IMPRIMÉ, sur la feuille du dossier.
 *
 * Elle n'est pas là par nostalgie : un PDF est blanc, et c'est justement le
 * CONTRASTE avec l'écran sombre qui fait lire « voilà le document » en une
 * demi-seconde. La même géométrie, un autre papier.
 */
export const PAPIER_PALETTE: FramePalette = {
  fond: '#FFFFFF',
  lueur: '#FFFFFF',
  grille: '#EFF3FA',
  sol: '#F3F6FC',
  solTrait: '#D9E0EC',
  mur: '#FFFFFF',
  murTrait: '#8A93A3',
  poche: '#12161D',
  pocheTrait: '#12161D',
  murDessus: '#E4E9F2',
  murDessusTrait: '#8A93A3',
  meuble: '#DCE6FA',
  meubleDessus: '#FFFFFF',
  meubleTrait: '#2F6BFF',
  cote: '#5A6472',
  baie: '#3EB8E5',
  porte: '#E8A13B',
  accent: '#2F6BFF',
  texte: '#0B0D12',
  // Les pôles de l'application, à l'identique : sur du papier, ce dessin-là
  // est déjà le bon, et c'est celui qu'on imprime.
  ombre: '#A08D74',
  lumiere: '#FFFFFF',
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
 * ÉCLAIRCIR UNE COULEUR DE L'APPLICATION POUR LA POSER SUR DU NOIR.
 *
 * Les couleurs de familles d'appareillage (`FIXTURES`) sont réglées pour du
 * papier blanc : l'ambre des prises est un brun, le bleu des commandes est
 * sombre. Posées telles quelles sur un fond noir, elles disparaissent.
 *
 * ON NE LES CHANGE PAS DANS L'APPLICATION — ce sont les couleurs des schémas,
 * elles s'impriment. On les éclaircit ICI, pour cette image-là, et le lien
 * avec la famille reste lisible : un PC ambre reste ambre, en plus clair.
 */
const eclaircir = (c: string, f: number) => melange(c, '#FFFFFF', f);

/**
 * L'OMBRAGE DE LA VITRINE — et pourquoi il ne peut pas être celui de l'app.
 *
 * `shadeFill` éclaire les pans d'un volume avec DEUX PÔLES : le côté à
 * l'ombre tire vers un brun chaud (`#A08D74`), le côté éclairé vers le blanc.
 * C'est un réglage juste, longuement défendu — « dans une pièce éclairée par
 * le jour, une ombre garde la chaleur de ce qu'elle assombrit » — et c'est ce
 * qui fait passer le rendu du dessin technique à la maquette.
 *
 * SUR DU PAPIER BLANC. Sur du noir, il DÉTRUIT la couleur : un mur bleu nuit
 * mélangé à 38 % de brun devient un gris de carton, et à 34 % de blanc un
 * gris un peu plus clair. Regardé en image, c'était le dernier reste de bas
 * de gamme — un logement en carton posé sur une belle nuit.
 *
 * ON NE TOUCHE PAS À `shadeFill` : c'est l'ombrage de la vue 3D de
 * l'application, et il s'imprime. On refait ICI le même calcul avec les pôles
 * de la palette — pour la nuit, une ombre presque noire et une lumière bleue.
 * La géométrie de l'éclairage est la même (la lumière décalée de 35° du
 * regard, pour que deux pans symétriques ne prennent jamais la même teinte) ;
 * seules les deux couleurs changent.
 */
const LUM_COS = Math.cos((35 * Math.PI) / 180);
const LUM_SIN = Math.sin((35 * Math.PI) / 180);
const HEXA = /^#[0-9a-fA-F]{6}$/;

function teinteDeFace(
  f: { fill: string | null; shade?: boolean; normal?: { x: number; z: number } | null; pts: { x: number; z: number }[] },
  ct: number,
  st: number,
  p: FramePalette,
): string | null {
  if (!f.shade || !f.fill || !HEXA.test(f.fill)) return f.fill;
  let nx: number;
  let nz: number;
  if (f.normal) {
    nx = f.normal.x;
    nz = f.normal.z;
  } else {
    const [a, b] = f.pts;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    nx = -dz / len;
    nz = dx / len;
  }
  const lx = st * LUM_COS + ct * LUM_SIN;
  const lz = ct * LUM_COS - st * LUM_SIN;
  const face = (nx * lx + nz * lz + 1) / 2;
  return melange(
    melange(f.fill, p.ombre, 0.38),
    melange(f.fill, p.lumiere, 0.34),
    face,
  );
}

/**
 * LE POCHÉ S'INVERSE PENDANT LA LEVÉE.
 *
 * Vu d'en haut, à plat, on ne voit QUE le dessus des cloisons : c'est le
 * trait du plan, et sur fond noir il doit être blanc. Une fois le volume
 * levé, la même surface redevient le dessus d'un mur qu'on regarde de biais,
 * et un blanc franc y ferait une balafre. Le passage se fait sur le premier
 * tiers de la levée — assez tôt pour qu'on ne le voie pas comme un
 * changement de couleur.
 */
const scenePalette = (p: FramePalette, t = 0): ScenePalette => {
  const k = Math.min(1, t * 2.2);
  return {
    floor: p.sol,
    floorStroke: p.solTrait,
    wall: p.mur,
    wallStroke: p.murTrait,
    wallTop: melange(p.poche, p.murDessus, k),
    wallTopStroke: melange(p.pocheTrait, p.murDessusTrait, k),
    opening: p.baie,
    door: p.porte,
    window: p.baie,
    passage: p.meubleTrait,
    object: p.meuble,
    objectTop: p.meubleDessus,
    objectStroke: p.meubleTrait,
  };
};

/**
 * Lissage SINUSOÏDAL : le plan démarre et s'arrête en douceur, comme une
 * main. Il a remplacé le quadratique pour sa vitesse de pointe : à mi-course,
 * le quadratique file à 1,5 fois la moyenne, le sinus à π/2 — et c'est ce
 * pic-là qui se voit. Il est borné : hors de [0, 1], une rampe n'a rien à
 * dire.
 */
const soie = (t: number) =>
  (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;

/**
 * LE LISSAGE QUI DÉPASSE, pour ce qui doit claquer.
 *
 * `soie` arrive à destination et s'y arrête : c'est ce qu'on veut d'une
 * caméra. Un objet qui SE POSE, lui, dépasse sa cible et revient — c'est ce
 * que fait toute matière, et c'est exactement ce qu'on lit comme « vivant »
 * plutôt que comme « interpolé ». Six pour cent de dépassement : de quoi le
 * sentir, pas de quoi le voir.
 */
const ressort = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3) * Math.cos(x * Math.PI * 1.1);
};

/*
 * LE SCÉNARIO, EN SIX TEMPS — le cheminement de l'application.
 *
 *   1. LE PLAN. Un T2 à plat, vu de dessus, poché blanc sur nuit. C'est par
 *      là qu'on commence, et c'est déjà une image.
 *   2. LA LEVÉE. Les murs montent, la caméra s'incline : le même dessin
 *      devient un volume. Rien n'est remplacé — c'est le plan qui se relève.
 *   3. LA POSE. Les appareils paraissent un par un, chacun à sa place sur son
 *      mur, avec l'onde qui dit qu'il vient d'arriver.
 *   4. LES COTES. Le calque « Cotes » s'allume : les filets descendent au
 *      sol, et une hauteur de pose s'écrit en grand.
 *   5. LE DOSSIER. Une feuille monte du bas et défile pendant que la maquette
 *      recule derrière.
 *   6. LE RETOUR. La feuille redescend, le plan est là, et ça recommence.
 *
 * ET LA CAMÉRA NE S'ARRÊTE JAMAIS. Un palier où tout se fige se lit comme un
 * diaporama : c'est le mouvement qui continue pendant l'arrêt qui donne la
 * vie. Pendant la pose et les cotes, la caméra dérive en azimut et se
 * rapproche d'un souffle.
 */
const PLAN_PLAT = 14;
const LEVEE = 28;
const POSE = 20;
const COTES = 16;
const DOSSIER = 30;
/** Le retour occupe ce qui reste : 120 − 108 = 12 images, une demi-seconde. */

/** La part du temps du dossier consacrée à la MONTÉE de la feuille. */
const MONTEE = 8;

interface Instant {
  t: number;
  theta: number;
  zoom: number;
  /** L'arrivée des appareils, 0 → 1. */
  elec: number;
  /** Les cotes de pose, 0 (rien) → 1 (toutes). */
  cotes: number;
  /** La feuille du dossier, 0 (hors champ, en bas) → 1 (posée). */
  page: number;
  /** Le défilement de la feuille, 0 (en tête) → 1 (en pied). */
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

  // 5 — la feuille monte, puis défile. Derrière, la maquette redescend.
  if (i < (d += DOSSIER)) {
    const j = i - PLAN_PLAT - LEVEE - POSE - COTES;
    /*
      LA MONTÉE SE FAIT AU RESSORT, ET C'EST TOUT LE PROPOS.

      Une feuille qui arrive en fondu, c'est un calque qu'on allume ; une
      feuille qui monte du bas et se cale d'un dépassement, c'est un document
      qu'on pose sur la table. Huit images — un tiers de seconde.
    */
    const page = ressort(j / MONTEE);
    const h = Math.max(0, (j - MONTEE) / (DOSSIER - MONTEE - 1));
    const t = 1 - soie(h);
    return {
      t,
      theta: -21 * t,
      zoom: 1 + 0.085 * t,
      elec: 1 - soie(h * 1.6),
      cotes: 0,
      page,
      defilement: soie(h),
    };
  }

  // 6 — le retour : la feuille redescend, le plan est prêt à recommencer.
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
 * Une animation muette demande à l'œil de deviner ce qu'il regarde : on voit
 * un plan se lever sans savoir que c'est ÇA, le geste de l'application. Un
 * mot posé dessus fait la moitié du travail — et permet de raccourcir le
 * reste, parce qu'on lit « LE RELEVÉ » plus vite qu'on ne le déduit.
 *
 * CINQ MOTS, DIX SIGNES AU PLUS. C'est ce qui permet de les écrire GROS : à
 * dix signes, le mot tient toute la largeur de l'écran en corps 34. Un
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
 * LA FENTE DU TITRE — sa hauteur, et la course d'un mot qui la traverse.
 *
 * Le mot n'existe qu'entre ces deux lignes : il y monte par le bas, il en
 * sort par le haut. La fente épouse la boîte des capitales, et la course vaut
 * sa hauteur — c'est ce qui garantit qu'un mot est ENTIÈREMENT dessous avant
 * d'entrer, et entièrement dessus après être sorti.
 */
const FENTE = 34;

/**
 * LA BASCULE EST UN ROULEAU, PAS UNE COUPURE.
 *
 * Premier réglage : chaque mot entrait au début de son temps et sortait à la
 * fin. Entre les deux, la fente restait VIDE pendant une image ou deux, et
 * l'on voyait passer un mot coupé en tranche — ce qui se lit comme un défaut
 * d'affichage, pas comme un montage.
 *
 * La bascule est maintenant À CHEVAL sur la coupure : sur cinq images, le mot
 * qui s'en va monte pendant que le suivant arrive, dans la même fente. Il y a
 * donc toujours quelque chose à lire, et le passage d'un temps à l'autre est
 * un mouvement continu — c'est le geste qu'on connaît des compteurs
 * kilométriques, et c'est ce qui donne le rythme.
 */
const ROULEAU = 5;

/** Où en est un titre à cette image : sa place dans la fente, et sa densité. */
function placeDuTitre(i: number, debut: number, fin: number) {
  const dedans = soie((i - debut + ROULEAU / 2) / ROULEAU);
  const dehors = soie((i - fin + ROULEAU / 2) / ROULEAU);
  return {
    dedans,
    dehors,
    dy: (1 - dedans) * FENTE - dehors * FENTE,
    opacite: dedans * (1 - dehors),
  };
}

export interface EtatDuTitre {
  mot: string;
  /** Le rang du temps, à partir de 1 : c'est le numéro affiché. */
  rang: number;
  /** L'entrée, 0 (encore sous la fente) → 1 (en place). */
  avance: number;
  /** La sortie, 0 (en place) → 1 (ravalé au-dessus de la fente). */
  sortie: number;
  /** Le décalage dans la fente, en points : positif = encore dessous. */
  dy: number;
  opacite: number;
}

/**
 * LES MOTS PRÉSENTS À CETTE IMAGE — un, ou deux pendant la bascule.
 *
 * LE CYCLE SE REFERME AUSSI SUR LE TITRE. Le dernier mot doit sortir pendant
 * que le premier entre, et ces deux moments sont de part et d'autre de
 * l'image zéro. Chaque titre est donc évalué DEUX FOIS — à `i` et à `i + n` —
 * et l'on garde la meilleure des deux : c'est ce qui fait que la boucle ne se
 * voit pas, au lieu d'une fente vide à chaque tour.
 */
export function titresDeLImage(frame: number): EtatDuTitre[] {
  const n = SHOWCASE_FRAMES;
  const i = ((frame % n) + n) % n;
  const vus: EtatDuTitre[] = [];
  let debut = 0;
  for (const [k, t] of TITRES.entries()) {
    const a = placeDuTitre(i, debut, t.jusqua);
    const b = placeDuTitre(i + n, debut, t.jusqua);
    const q = b.opacite > a.opacite ? b : a;
    if (q.opacite > 0.01) {
      vus.push({
        mot: t.mot,
        rang: k + 1,
        avance: q.dedans,
        sortie: q.dehors,
        dy: q.dy,
        opacite: q.opacite,
      });
    }
    debut = t.jusqua;
  }
  return vus.sort((x, y) => x.opacite - y.opacite);
}

/** Le mot DOMINANT de l'image : celui qu'on lit, celui qui donne le numéro. */
export function titreDeLImage(frame: number): EtatDuTitre {
  const vus = titresDeLImage(frame);
  if (vus.length) return vus[vus.length - 1];
  // Hors bascule, la boucle repasse toujours par un titre : ce retour n'est
  // là que pour que la fonction soit totale.
  return {
    mot: TITRES[0].mot,
    rang: 1,
    avance: 1,
    sortie: 0,
    dy: 0,
    opacite: 1,
  };
}

/** Où l'on en est du cycle, de 0 à 1 : c'est le filet du bas. */
export function progression(frame: number): number {
  const n = SHOWCASE_FRAMES;
  return (((frame % n) + n) % n) / (n - 1);
}

/**
 * LA BANDE DU BAS — le titre, son numéro, son filet, et l'avancement.
 *
 * ELLE N'EST PLUS UN APLAT. La version d'avant posait un rectangle bleu plein
 * en pied d'écran avec le mot centré dedans : c'est le dessin d'une barre
 * d'état, pas d'une affiche, et c'était la première chose qui faisait bas de
 * gamme. Le mot est maintenant posé À MÊME l'image, aligné à gauche, avec
 * son numéro de temps au-dessus et un filet d'accent qui pousse sous lui.
 *
 * IL RESTE LISIBLE SANS APLAT parce que le fond est noir et le mot blanc :
 * c'est le passage en nuit qui a rendu le rectangle inutile. Sur la feuille
 * du dossier — le seul moment clair de la vitrine — le titre garde sa place :
 * la feuille s'arrête au-dessus de la bande, elle ne monte jamais dessous.
 */
export const BANDE = 92;

export function titreSvg(
  frame: number,
  W: number,
  H: number,
  p: FramePalette = SHOWCASE_PALETTE,
): string {
  const vus = titresDeLImage(frame);
  const chef = titreDeLImage(frame);
  const marge = 18;
  const base = H - 34;
  const fente = { y: base - 28, h: FENTE };
  const id = `f${frame}`;
  const out: string[] = [];

  // Le numéro du temps, au-dessus du mot : « 03 / 05 ».
  out.push(
    `<text x="${marge}" y="${(base - 40).toFixed(0)}" ` +
      `font-family="Helvetica, Arial, sans-serif" ` +
      `font-size="9.5" font-weight="bold" letter-spacing="2.2" fill="${p.accent}" ` +
      `opacity="${(chef.opacite * 0.95).toFixed(2)}">` +
      `0${chef.rang} / 0${TITRES.length}</text>`,
  );

  // Les mots, dans la fente — le sortant et l'entrant se croisent dedans.
  const dedans = vus
    .map((v) => {
      const corps = Math.min(34, (W - 2 * marge) / (v.mot.length * 0.62));
      return (
        `<text x="${marge}" y="${(base + v.dy).toFixed(1)}" ` +
        `font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${corps.toFixed(1)}" font-weight="bold" letter-spacing="-0.9" ` +
        `fill="${p.texte}" opacity="${v.opacite.toFixed(2)}">${v.mot}</text>`
      );
    })
    .join('');
  out.push(
    `<defs><clipPath id="${id}"><rect x="0" y="${fente.y.toFixed(1)}" ` +
      `width="${W}" height="${fente.h}"/></clipPath></defs>`,
    `<g clip-path="url(#${id})">${dedans}</g>`,
  );

  // Le filet d'accent, qui pousse sous le mot en même temps qu'il entre.
  out.push(
    `<rect x="${marge}" y="${(base + 9).toFixed(1)}" ` +
      `width="${(38 * chef.opacite).toFixed(1)}" height="3" ` +
      `fill="${p.accent}"/>`,
  );

  /*
    L'AVANCEMENT EST UN FILET D'UN POINT ET DEMI, au ras du bord.

    Il ne sert à rien qu'à dire « ça tourne, et ça va finir » — c'est
    exactement ce qu'on regarde sans le savoir sur une vitrine. Un point et
    demi, parce qu'une barre plus épaisse redeviendrait un élément d'interface.
  */
  const yb = H - 1.5;
  return (
    out.join('') +
    `<rect x="0" y="${yb}" width="${W}" height="1.5" fill="${p.texte}" fill-opacity="0.12"/>` +
    `<rect x="0" y="${yb}" width="${(W * progression(frame)).toFixed(1)}" ` +
    `height="1.5" fill="${p.accent}"/>`
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
 * `t` va de 0 (le plan, à plat, poché blanc) à 1 (le volume meublé). Tout le
 * reste en découle : la hauteur des murs, l'inclinaison de la caméra, la
 * présence des meubles.
 *
 * ELLE NE POSE AUCUN `id` SVG, et c'est délibéré : cette fonction est
 * RAPPELÉE À L'INTÉRIEUR d'une autre image — le plan imprimé de la feuille du
 * dossier est ce même dessin, réduit. Deux `<clipPath id="x">` dans un même
 * document, et c'est le dernier qui gagne pour tout le monde. Les dégradés et
 * les masques vivent donc dans `imageSvg` et dans `titreSvg`, jamais ici.
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
  etat?: { elec?: number; cotes?: number; grille?: boolean },
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
    LE MOBILIER ARRIVE EN VAGUE, calée sur la position de chaque meuble : la
    vague suit la levée du nord au sud, chaque meuble sort du sol en fondu, et
    les fenêtres se chevauchent assez pour qu'on voie un logement se remplir —
    pas des meubles surgir.
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

  /*
    LA TRAME DU SOL — un mètre, et elle DÉPASSE du logement.

    C'est le geste qui décolle la maquette du fond. Sans elle, un logement
    sombre sur un fond sombre flotte dans le vide, et l'œil n'a rien pour
    juger ni la taille ni l'assiette. Avec elle, le logement est POSÉ, et la
    trame dit l'échelle sans écrire un chiffre — un carreau, un mètre.

    ELLE S'ÉTEINT VERS LES BORDS, par le calcul et non par un masque : chaque
    ligne prend son opacité de sa distance au logement. Un masque en dégradé
    demanderait un `id` SVG, et cette fonction n'a pas le droit d'en poser
    (voir l'en-tête). C'est la contrainte qui a choisi la méthode, et le
    résultat est le même.

    Elle est dessinée AVANT la scène : le sol des pièces, opaque, la couvre à
    l'intérieur du logement. Il ne reste donc que le pourtour — exactement ce
    qu'on veut voir.
  */
  if (etat?.grille !== false) {
    const bord = 3.4;
    const cxp = 2.1;
    const czp = 3.2;
    const trame: string[] = [];
    const ligne = (
      a: { x: number; z: number },
      b: { x: number; z: number },
      loin: number,
    ) => {
      const o = Math.max(0, 0.62 - loin * 0.055);
      if (o < 0.03) return;
      const q1 = project({ x: a.x, y: 0, z: a.z });
      const q2 = project({ x: b.x, y: 0, z: b.z });
      trame.push(
        `<line x1="${q1.sx.toFixed(1)}" y1="${q1.sy.toFixed(1)}" ` +
          `x2="${q2.sx.toFixed(1)}" y2="${q2.sy.toFixed(1)}" ` +
          `stroke="${p.grille}" stroke-width="0.8" opacity="${o.toFixed(2)}"/>`,
      );
    };
    for (let x = -bord; x <= 4.2 + bord + 0.001; x += 1) {
      ligne(
        { x, z: -bord },
        { x, z: 6.4 + bord },
        Math.abs(x - cxp) > 2.1 ? Math.abs(x - cxp) - 2.1 : 0,
      );
    }
    for (let z = -bord; z <= 6.4 + bord + 0.001; z += 1) {
      ligne(
        { x: -bord, z },
        { x: 4.2 + bord, z },
        Math.abs(z - czp) > 3.2 ? Math.abs(z - czp) - 3.2 : 0,
      );
    }
    out.push(trame.join(''));
  }

  const polys = scene.faces
    .filter((f) => !isHiddenFace(f, oeil))
    .map((f) => {
      const proj = f.pts.map(project);
      const voile = f.cutaway && f.normal ? cutawayOpacity(f.normal, oeil) : 1;
      return {
        depth: faceDepth(f, project, oeil),
        fill: teinteDeFace(f, ct, st, p),
        stroke: f.stroke,
        // Le sol est le seul pan qui laisse voir ce qu'il y a dessous.
        sol: f.isFloor === true,
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
    /*
      LE SOL EST TRANSLUCIDE, ET C'EST LA TRAME QUI EN PROFITE.

      Elle est dessinée AVANT la scène : le sol des pièces, opaque, la couvrait
      donc à l'intérieur du logement, et les deux pièces se lisaient comme deux
      trous noirs au milieu d'un quadrillage. À sept dixièmes, le sol garde sa
      teinte et la trame se devine dessous — le carrelage d'un plan technique,
      exactement ce qu'on veut ici.
    */
    const vu =
      (q.owner ? q.voile * (appParId.get(q.owner) ?? 1) : q.voile) *
      (q.sol && p.fond !== '#FFFFFF' ? 0.7 : 1);
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
    jamais arriver. Chacun a sa fenêtre (`pose`), et il grandit en paraissant
    — c'est ce sursaut d'échelle qui fait lire un « pop » plutôt qu'un fondu.

    PUIS ILS DISENT LEUR HAUTEUR. Un filet jusqu'au sol et le nombre en
    centimètres, comme le calque « Cotes » de l'application.
  */
  const elec = Math.max(0, Math.min(1, etat?.elec ?? 1));
  const cotes = Math.max(0, Math.min(1, etat?.cotes ?? 0));
  const sombre = p.fond !== '#FFFFFF';
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
    // Sur la nuit, la couleur de famille s'éclaircit pour émettre ; sur le
    // papier, elle reste celle du schéma imprimé.
    const teinte = sombre ? eclaircir(spec.color, 0.45) : spec.color;
    /*
      LE SIGLE S'ÉCRIT, il ne se met pas dans une pastille.

      Un disque de couleur dit qu'il y a quelque chose, jamais quoi : sur un
      mur qui en porte trois, on comptait des confettis. Le sigle se lit à la
      même taille, dans la couleur de sa famille, avec un liseré qui le
      détache du poché comme du mobilier — clair sur le papier, sombre sur la
      nuit.
    */
    const cx = q.sx.toFixed(1);
    const cy = (q.sy + 3).toFixed(1);
    /*
      LA LUEUR DE L'APPAREIL — deux disques, et c'est ce qui fait la nuit.

      Un sigle de neuf points posé sur du noir est un caractère perdu ; le
      même sigle sur une lueur de sa couleur devient un POINT LUMINEUX qu'on
      repère avant de le lire. C'est le seul endroit de l'image où l'on
      dépense de la couleur, et c'est le sujet de l'application.
    */
    if (sombre) {
      out.push(
        `<circle cx="${cx}" cy="${(q.sy - 1).toFixed(1)}" r="${(13 * vu).toFixed(1)}" ` +
          `fill="${teinte}" opacity="${(0.13 * vu).toFixed(2)}"/>`,
        `<circle cx="${cx}" cy="${(q.sy - 1).toFixed(1)}" r="${(7 * vu).toFixed(1)}" ` +
          `fill="${teinte}" opacity="${(0.22 * vu).toFixed(2)}"/>`,
      );
    }
    // Le sursaut : il paraît à 60 % de sa taille et finit à 100 %.
    const corps = (9 * (0.6 + 0.4 * vu)).toFixed(1);
    const police =
      `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" ` +
      `font-size="${corps}" font-weight="bold" text-anchor="middle"`;
    out.push(
      `<text x="${cx}" y="${cy}" ${police} fill="none" ` +
        `stroke="${p.fond}" stroke-width="3" opacity="${vu.toFixed(2)}">` +
        `${spec.short}</text>`,
      `<text x="${cx}" y="${cy}" ${police} fill="${teinte}" ` +
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
          `r="${(4 + 16 * onde).toFixed(1)}" fill="none" ` +
          `stroke="${teinte}" stroke-width="${(2.4 * (1 - onde)).toFixed(2)}" ` +
          `opacity="${(0.85 * (1 - onde)).toFixed(2)}"/>`,
      );
    }
    if (cotes > 0.02) {
      /*
        LE FILET DESCEND AU SOL, sous l'appareil : c'est le dessin du calque
        « Cotes », la hauteur de pose qu'on trace au crayon avant de percer.

        MAIS LE NOMBRE NE S'ÉCRIT PLUS À CÔTÉ DE CHAQUE FILET. Premier jet :
        un « 110 » et un « 25 » en corps sept et demi, sur chacun des six
        appareils. Regardé à la taille réelle de la maquette, ces nombres
        tombaient sous quatre points : six taches illisibles, et un temps fort
        qui ne montrait rien. Les filets restent — ils disent que le calque
        est allumé — et UNE SEULE cote s'écrit, en grand.
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
            `stroke="${p.accent}" stroke-width="1.2" ` +
            `opacity="${cotes.toFixed(2)}"/>`,
          `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${larg}" ` +
            `height="24" rx="12" fill="${p.accent}" ` +
            `opacity="${cotes.toFixed(2)}"/>`,
          `<text x="${(bx + larg / 2).toFixed(1)}" y="${(by + 17).toFixed(1)}" ` +
            `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="14" ` +
            `font-weight="bold" text-anchor="middle" fill="#FFFFFF" ` +
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
 * LE DOSSIER QU'ON REMET AU CLIENT — une feuille, qui monte et défile.
 *
 * C'est la fin du cheminement : la vitrine s'arrêtait au volume, alors que le
 * volume n'est qu'une étape — ce qu'on emporte sur le chantier, c'est le
 * dossier.
 *
 * ELLE NE REMPLIT PLUS L'ÉCRAN, ET C'EST TOUT CE QUI A CHANGÉ. Le premier
 * dessin posait une page blanche de bord à bord : sur un fond noir, ça ne
 * dit pas « voici le document », ça dit « l'écran est devenu blanc ». La
 * feuille a maintenant ses marges, ses coins arrondis et son ombre portée —
 * on voit un objet posé sur une scène.
 *
 * LA PREMIÈRE PAGE PORTE LE VRAI PLAN. Elle rappelle `frameSvg` à plat, sur
 * la palette du PAPIER, et le rend dans son cadre : c'est le même dessin que
 * celui qu'on vient de regarder se lever, pas une illustration à côté. Deux
 * plans dessinés séparément finiraient par ne plus se ressembler.
 *
 * LA SECONDE EST UN BORDEREAU : des lignes, des quantités à droite, un total.
 * On ne cherche pas à le faire lire — on cherche à ce qu'on le RECONNAISSE en
 * une demi-seconde, et une liste chiffrée se reconnaît à sa forme.
 */
export function pageSvg(
  defilement: number,
  W: number,
  H: number,
  p: FramePalette = SHOWCASE_PALETTE,
): string {
  const d = Math.max(0, Math.min(1, defilement));
  const pap = p.fond === '#FFFFFF' ? p : PAPIER_PALETTE;
  // La fenêtre de la feuille : des marges, et le titre laissé libre en bas.
  const x0 = 18;
  const larg = W - 2 * x0;
  const y0 = 22;
  const haut = H - BANDE - y0 - 10;
  /*
    UNE FEUILLE À PEINE PLUS HAUTE QUE SA FENÊTRE.

    Premier dessin : des feuilles d'un tiers plus hautes, et un défilement
    qui courait jusqu'en bas de la seconde. Regardé en image, le dernier
    tiers du temps fort ne montrait QUE du blanc — la page était finie et
    l'on continuait de dérouler. La feuille fait maintenant six pour cent de
    plus que la fenêtre : le défilement va d'une page à l'autre, et il
    s'arrête là où le contenu s'arrête.
  */
  const feuille = haut * 1.06;
  const ecart = 14;
  const total = feuille * 2 + ecart;
  const dy = -d * (total - haut);
  const out: string[] = [];

  /*
    L'OMBRE PORTÉE, EN TROIS COUCHES. Une ombre floue demanderait un filtre
    SVG, donc un `id`, donc un risque de collision dans le document complet.
    Trois rectangles décalés et de plus en plus faibles font le même office à
    cette taille — et ne coûtent rien au rendu.
  */
  for (const [i, o] of [0.5, 0.3, 0.16].entries()) {
    const e = (i + 1) * 3;
    out.push(
      `<rect x="${(x0 - e / 2).toFixed(1)}" y="${(y0 + e).toFixed(1)}" ` +
        `width="${(larg + e).toFixed(1)}" height="${haut.toFixed(1)}" rx="${(7 + e / 2).toFixed(1)}" ` +
        `fill="#000000" opacity="${o}"/>`,
    );
  }

  const contenu: string[] = [];
  /** Une page blanche, dans le défilement. */
  const page = (y: number) =>
    `<rect x="0" y="${y.toFixed(1)}" width="${larg}" height="${feuille.toFixed(1)}" ` +
    `fill="#FFFFFF"/>`;
  const cartouche = (y: number, titre: string) =>
    `<rect x="0" y="${y.toFixed(1)}" width="${larg}" height="24" fill="${pap.accent}"/>` +
    `<text x="10" y="${(y + 16.5).toFixed(1)}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" ` +
    `font-size="11" font-weight="bold" letter-spacing="0.6" fill="#FFFFFF">${titre}</text>`;

  // ---------------------------------------------------------- page 1
  contenu.push(page(0), cartouche(0, 'PLAN — T2, 27 m²'));
  /*
    LE PLAN DE LA FEUILLE SE REND À LA TAILLE DE SON CADRE, il ne se réduit
    pas. Premier jet : on rendait le plan au format de l'écran, puis on
    l'écrasait dans le bloc. Le cadrage de `frameSvg` réserve déjà une marge
    franche ; réduit une seconde fois, le plan tenait dans le tiers de la
    largeur et la feuille était un désert blanc.

    ET SANS SA TRAME : la grille du sol est un décor d'écran. Sur une feuille
    imprimée, elle ferait un fond de page quadrillé qui n'a rien à y faire.
  */
  const cadreP = { x: 12, y: 34, w: Math.round(larg - 24), h: Math.round(feuille * 0.46) };
  const mini = frameSvg(
    0,
    cadreP.w,
    cadreP.h,
    pap,
    { theta: 0, zoom: 1 },
    { elec: 1, cotes: 0, grille: false },
  )
    .replace(/^[\s\S]*?viewBox="[^"]*">/, '')
    .replace(/<\/svg>$/, '');
  contenu.push(`<g transform="translate(${cadreP.x} ${cadreP.y})">${mini}</g>`);
  // La légende, sous le plan : trois lignes et leur pastille de famille.
  const legende = cadreP.y + cadreP.h + 16;
  for (const [i, teinte] of [pap.accent, pap.porte, pap.baie].entries()) {
    const y = legende + i * 16;
    contenu.push(
      `<circle cx="18" cy="${y.toFixed(1)}" r="4" fill="${teinte}"/>`,
      `<rect x="28" y="${(y - 3.5).toFixed(1)}" width="${(larg * 0.46 - i * 18).toFixed(0)}" ` +
        `height="7" rx="3.5" fill="#C9D0DC"/>`,
    );
  }
  /*
    ET LE CARTOUCHE, EN PIED DE PAGE. Un plan d'exécution porte le sien en bas
    à droite — c'est ce qui le fait reconnaître comme un document, et non
    comme une capture d'écran encadrée.
  */
  const yc = feuille - 68;
  contenu.push(
    `<rect x="${(larg * 0.36).toFixed(0)}" y="${yc.toFixed(1)}" ` +
      `width="${(larg * 0.64 - 12).toFixed(0)}" height="54" fill="none" ` +
      `stroke="#C9D0DC" stroke-width="1"/>`,
    `<line x1="${(larg * 0.36).toFixed(0)}" y1="${(yc + 17).toFixed(1)}" ` +
      `x2="${(larg - 12).toFixed(0)}" y2="${(yc + 17).toFixed(1)}" ` +
      `stroke="#C9D0DC" stroke-width="1"/>`,
    `<text x="${(larg * 0.36 + 8).toFixed(0)}" y="${(yc + 12.5).toFixed(1)}" ` +
      `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="8.5" ` +
      `font-weight="bold" letter-spacing="1" fill="${pap.cote}">ECHOPLAN</text>`,
  );
  for (let i = 0; i < 3; i++) {
    contenu.push(
      `<rect x="${(larg * 0.36 + 8).toFixed(0)}" y="${(yc + 25 + i * 10).toFixed(1)}" ` +
        `width="${(larg * 0.44 - i * 14).toFixed(0)}" height="5" rx="2.5" fill="#D5DCEA"/>`,
    );
  }

  // ---------------------------------------------------------- page 2
  const y2 = feuille + ecart;
  contenu.push(page(y2), cartouche(y2, 'FOURNITURES'));
  const lignes = Math.max(6, Math.floor((feuille - 96) / 20));
  for (let i = 0; i < lignes; i++) {
    const y = y2 + 42 + i * 20;
    const large = 0.32 + ((i * 7) % 5) * 0.07;
    contenu.push(
      `<rect x="12" y="${(y - 8).toFixed(1)}" width="14" height="14" rx="3" ` +
        `fill="#EDF1F8" stroke="#D5DCEA" stroke-width="0.8"/>`,
      `<rect x="32" y="${(y - 3.5).toFixed(1)}" width="${(larg * large).toFixed(0)}" ` +
        `height="7" rx="3.5" fill="#C9D0DC"/>`,
      `<rect x="${(larg - 56).toFixed(0)}" y="${(y - 3.5).toFixed(1)}" width="44" ` +
        `height="7" rx="3.5" fill="#9AA5B5"/>`,
    );
  }
  const yTotal = y2 + 42 + lignes * 20 + 8;
  contenu.push(
    `<line x1="12" y1="${yTotal.toFixed(1)}" x2="${larg - 12}" y2="${yTotal.toFixed(1)}" ` +
      `stroke="#9AA5B5" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<rect x="${(larg - 90).toFixed(0)}" y="${(yTotal + 10).toFixed(1)}" width="78" ` +
      `height="12" rx="6" fill="${pap.accent}"/>`,
  );

  /*
    LE DÉFILEMENT EST DÉCOUPÉ PAR LA FEUILLE, pas par un masque : deux
    rectangles blancs arrondis se recouvrent, et l'on dessine par-dessus. Le
    `clipPath` d'un `id` unique serait plus propre — et rendrait cette
    fonction inutilisable à l'intérieur d'une autre image, comme `frameSvg`.
    On paie donc le découpage par un fond de fenêtre et un cadre par-dessus.
  */
  out.push(
    `<rect x="${x0}" y="${y0}" width="${larg}" height="${haut.toFixed(1)}" rx="5" fill="#FFFFFF"/>`,
    `<svg x="${x0}" y="${y0}" width="${larg}" height="${haut.toFixed(1)}" ` +
      `viewBox="0 ${(-dy).toFixed(1)} ${larg} ${haut.toFixed(1)}">${contenu.join('')}</svg>`,
    // Le liseré de la feuille, par-dessus, pour rattraper les coins arrondis.
    `<rect x="${x0}" y="${y0}" width="${larg}" height="${haut.toFixed(1)}" rx="5" ` +
      `fill="none" stroke="${p.fond}" stroke-width="4"/>`,
    `<rect x="${(x0 - 0.5).toFixed(1)}" y="${(y0 - 0.5).toFixed(1)}" ` +
      `width="${larg + 1}" height="${(haut + 1).toFixed(1)}" rx="5.5" ` +
      `fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="1"/>`,
  );
  return out.join('');
}

/**
 * LE FOND DE L'ÉCRAN CUIT — un aplat, et rien d'autre.
 *
 * IL A PORTÉ LA LUEUR, IL NE LA PORTE PLUS, ET C'EST UNE DÉCISION DE POIDS.
 *
 * Le premier dessin posait ici deux dégradés radiaux : une lueur bleue
 * derrière la maquette, un vignettage sur les bords. C'était juste, et
 * regardé en image c'était même ce qui décollait la maquette du fond.
 *
 * MESURÉ, C'ÉTAIT 480 KO DANS L'IPA. Un dégradé lisse est le pire ennemi
 * d'une palette réduite : chaque image doit tramer le passage d'un ton à
 * l'autre sur toute sa surface, et le PNG ne compresse plus rien. Cent vingt
 * images passaient de 820 ko à 1,3 Mo — pour un fond qui ne change JAMAIS
 * d'une image à l'autre.
 *
 * ON NE LE CUIT DONC PLUS : la lueur et le vignettage sont posés EN DIRECT
 * dans l'écran du téléphone, en vectoriel (voir `PhoneShowcase`). C'est le
 * même dessin, il est plus lisse — un vecteur ne trame pas —, il ne coûte pas
 * un octet, et il peut respirer avec le boîtier, ce qu'une image cuite ne
 * saura jamais faire.
 */
function fondSvg(W: number, H: number, p: FramePalette): string {
  return `<rect width="${W}" height="${H}" fill="${p.fond}"/>`;
}

/**
 * UNE IMAGE DU CYCLE, tout compris — la nuit, la maquette, le dossier, le mot.
 *
 * LE DOSSIER NE REMPLACE PAS LA MAQUETTE, IL PASSE DEVANT ELLE. La feuille
 * monte du bas pendant que la scène RECULE — elle se réduit d'un dixième et
 * s'assombrit, sans jamais disparaître. C'est ce qu'on fait quand on pose un
 * document sur une table : ce qu'il y avait dessous reste là, en dessous.
 *
 * Une transition en fondu pur laissait, à mi-course, une image double où l'on
 * ne lisait ni le plan ni la page. Ici, à mi-course, on lit une feuille qui
 * monte — parce qu'il y a un MOUVEMENT à suivre.
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
  const corps = [fondSvg(W, H, p)];
  /*
    LA MAQUETTE SE CENTRE DANS CE QUI RESTE, pas au milieu de l'écran.

    `frameSvg` cadre sur H/2 — c'est juste pour une image seule. Ici, la bande
    du titre mange quatre-vingt-douze points en bas : centrée sur H/2, la
    maquette descendait sous le mot. Elle remonte donc de la demi-bande, et
    le recul du dossier se prend sur CE centre-là.
  */
  const k = 1 - 0.1 * e.page;
  corps.push(
    `<g opacity="${(1 - 0.78 * e.page).toFixed(2)}" ` +
      `transform="translate(0 ${(-BANDE / 2).toFixed(1)}) ` +
      `translate(${(W / 2).toFixed(1)} ${(H / 2).toFixed(1)}) ` +
      `scale(${k.toFixed(3)}) translate(${(-W / 2).toFixed(1)} ${(-H / 2).toFixed(1)})">` +
      `${scene}</g>`,
  );
  if (e.page > 0.005) {
    /*
      LA FEUILLE MONTE DU BAS. Hors champ à `page` = 0, posée à `page` = 1 :
      c'est la même valeur qui fait reculer la scène, donc les deux
      mouvements sont solidaires par construction et ne peuvent pas se
      désynchroniser.
    */
    const monte = (1 - e.page) * H;
    corps.push(
      `<g transform="translate(0 ${monte.toFixed(1)})">` +
        `${pageSvg(e.defilement, W, H, p)}</g>`,
    );
  }
  /*
    LE TITRE PASSE APRÈS TOUT LE MONDE — c'est la couche qui NARRE, et elle ne
    participe à aucune transition : le mot ne doit pas pâlir pendant qu'une
    page monte dessous, sinon la seule chose qui explique l'image devient
    illisible juste au moment où l'image change.
  */
  corps.push(titreSvg(frame, W, H, p));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}">${corps.join('')}</svg>`
  );
}
