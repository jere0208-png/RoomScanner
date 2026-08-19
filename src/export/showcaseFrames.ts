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

/** Le nombre d'images du cycle complet. */
export const SHOWCASE_FRAMES = 44;

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

/** Lissage : le plan démarre et s'arrête en douceur, comme une main. */
const doux = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/**
 * LE SCÉNARIO, en quatre temps.
 *
 * Un palier sur le plan (on lit les cotes), la levée, un palier sur le
 * volume (on regarde les meubles), puis le retour — et ça recommence. Les
 * paliers font l'essentiel du travail : sans eux, on ne voit qu'un
 * mouvement, jamais les deux états qu'il relie.
 */
export function avancement(frame: number): number {
  const n = SHOWCASE_FRAMES;
  const i = ((frame % n) + n) % n;
  const palier = Math.round(n * 0.18);
  const levee = Math.round(n * 0.27);
  if (i < palier) return 0;
  if (i < palier + levee) return doux((i - palier) / levee);
  if (i < palier * 2 + levee) return 1;
  const reste = n - (palier * 2 + levee);
  return 1 - doux((i - (palier * 2 + levee)) / reste);
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
  // lieu de se déplier de face.
  const theta = -16 * t;

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
    LE MOBILIER ARRIVE EN FONDU, PAS D'UN COUP.

    Il sortait du sol à pleine opacité : d'une image à l'autre, un logement
    vide devenait un logement meublé. L'œil ne relie pas ces deux images, il
    voit une coupure — et une coupure au milieu d'un mouvement se lit comme
    un défaut d'affichage, pas comme une intention.

    Le fondu est RAPIDE — il commence dès les premiers degrés d'inclinaison
    et se termine au tiers de la levée — mais c'en est un : le logement se
    remplit pendant que ses murs montent, et l'on comprend que c'est le même.
  */
  const apparition = Math.max(0, Math.min(1, (t - 0.06) / 0.3));
  const pousse = doux(t);
  const meubles = PLAN.meubles.map(([id, cat, cx, cz, w, d, h]) =>
    meuble(id, cat, cx, cz, w, d, Math.max(0.02, h * pousse)),
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
  // Les cotes se posent HORS de la maçonnerie, et il leur faut leur bande :
  // le logement laisse donc une marge franche sur les quatre côtés.
  const scale = (Math.min(W, H) * 0.6) / cadre.radius3d;
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
  const cam = { ct, st, cp, sp };

  const out: string[] = [];
  out.push(`<rect width="${W}" height="${H}" fill="${p.fond}"/>`);

  const polys = scene.faces
    .filter((f) => !isHiddenFace(f, cam))
    .map((f) => {
      const proj = f.pts.map(project);
      const voile = f.cutaway && f.normal ? cutawayOpacity(f.normal, cam) : 1;
      return {
        depth: faceDepth(f, project, cam),
        fill: shadeFill(f, ct, st),
        stroke: f.stroke,
        // `ownerId` marque les faces d'un meuble : c'est ce qui permet de
        // les faire apparaître ensemble.
        meuble: !!f.ownerId,
        voile,
        n: proj.length,
        points: proj.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' '),
      };
    })
    .sort((a, b) => a.depth - b.depth);
  for (const q of polys) {
    // Le mobilier monte en opacité ; la maçonnerie, elle, est là dès la
    // première image — c'est le plan.
    const vu = q.meuble ? q.voile * apparition : q.voile;
    if (vu < 0.01) continue;
    // Le trait d'un meuble suit exactement son fondu ; celui de la
    // maçonnerie garde son minimum, qui dit l'écorché.
    const trait = q.meuble ? vu : 0.3 + 0.7 * vu;
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
    LES APPAREILS RESTENT VISIBLES DU DÉBUT À LA FIN.

    C'est le sujet de l'application : le plan sert à savoir où sont les
    prises. Les cotes, elles, s'effacent en montant — un volume couvert de
    chiffres ne se lit pas, et sur le chantier on ne cote pas une perspective.
  */
  const parMur = new Map(murs.map((w) => [w.id, w]));
  for (const f of PLAN.elec) {
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
    const police =
      `font-family="Helvetica" font-size="9" font-weight="bold" ` +
      `text-anchor="middle"`;
    out.push(
      `<text x="${cx}" y="${cy}" ${police} fill="none" ` +
        `stroke="#FFFFFF" stroke-width="3">${spec.short}</text>`,
      `<text x="${cx}" y="${cy}" ${police} fill="${spec.color}">${spec.short}</text>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`
  );
}
