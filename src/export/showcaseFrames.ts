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

/** Le logement de la vitrine : un T2 franc, meublé, équipé. */
/**
 * UN LOGEMENT EN HAUTEUR, parce que l'écran l'est.
 *
 * Le premier essai était un T2 en largeur : dans un écran de téléphone, il
 * occupait une bande au milieu et laissait deux déserts au-dessus et en
 * dessous, cotes latérales comprises — hors champ. Le logement suit donc la
 * forme de l'écran : séjour en bas, chambre en haut.
 */
const PLAN = {
  murs: [
    ['n', 0, 0, 4.2, 0],
    ['e', 4.2, 0, 4.2, 6.4],
    ['s', 4.2, 6.4, 0, 6.4],
    ['o', 0, 6.4, 0, 0],
    ['refend', 0, 2.7, 2.6, 2.7],
  ] as [string, number, number, number, number][],
  meubles: [
    ['canape', 'sofa', 2.1, 5.6, 2.1, 0.85, 0.8],
    ['table', 'table', 2.1, 4.2, 1.2, 0.8, 0.75],
    ['tv', 'television', 3.95, 4.4, 0.12, 1.3, 0.55],
    ['biblio', 'storage', 0.3, 4.4, 0.4, 1.5, 1.9],
    ['lit', 'bed', 1.6, 1.3, 1.4, 1.9, 0.5],
    ['chevet', 'storage', 0.35, 0.35, 0.4, 0.4, 0.5],
    ['armoire', 'storage', 3.4, 1.1, 0.6, 1.4, 2],
  ] as [string, string, number, number, number, number, number][],
  /** L'appareillage : c'est lui qu'on vient chercher dans cette app. */
  elec: [
    { id: 'f1', kind: 'prise', wallId: 'o', along: 4.4, height: 0.25, side: 1 },
    { id: 'f2', kind: 'prise', wallId: 's', along: 2.2, height: 0.25, side: 1 },
    { id: 'f3', kind: 'prise', wallId: 'n', along: 1.1, height: 0.25, side: 1 },
    { id: 'f4', kind: 'inter', wallId: 'refend', along: 2.1, height: 1.1, side: 1 },
    { id: 'f5', kind: 'inter', wallId: 'e', along: 5.2, height: 1.1, side: 1 },
    { id: 'f6', kind: 'rj45', wallId: 'e', along: 4.1, height: 0.25, side: 1 },
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
  const ouvertures: WallSeg[] = [
    {
      ...mur('baie', 1.1, 6.4, 3.1, 6.4, hauteur),
      type: 'window',
      height: Math.min(1.5, hauteur),
      yCenter: hauteur * 0.55,
    },
    {
      ...mur('porte', 4.2, 1.3, 4.2, 2.3, hauteur),
      type: 'door',
      height: Math.min(2.05, hauteur),
      yCenter: Math.min(2.05, hauteur) / 2,
    },
  ];
  /*
    LES MEUBLES SONT LÀ DÈS LE PLAN, et ils poussent avec les murs.

    Ils sortaient du sol au tiers de la levée : le plan de départ était nu,
    et le mobilier apparaissait d'un coup — on ne reliait plus les deux
    images, on en voyait deux. Un plan de relevé porte d'ailleurs ses
    meubles, vus de dessus, comme ici.

    Ils gardent donc leur emprise dès la première image (c'est elle qu'on lit
    sur un plan) et ne gagnent que la HAUTEUR à mesure que la maçonnerie
    monte.
  */
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
        voile,
        n: proj.length,
        points: proj.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' '),
      };
    })
    .sort((a, b) => a.depth - b.depth);
  for (const q of polys) {
    const commun =
      `stroke="${q.stroke ?? 'none'}" stroke-width="${q.n === 2 ? 1 : 0.9}" ` +
      `stroke-opacity="${(0.3 + 0.7 * q.voile).toFixed(2)}"`;
    out.push(
      q.n === 2
        ? `<polyline points="${q.points}" fill="none" ${commun}/>`
        : `<polygon points="${q.points}" fill="${q.fill ?? 'none'}" ` +
          `fill-opacity="${q.voile.toFixed(2)}" ${commun}/>`,
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

  /*
    LES COTES DU PLAN, tant qu'on est à plat.

    Elles se posent le long des murs extérieurs, à l'écart de la maçonnerie,
    et s'effacent dès que le plan quitte l'horizontale.
  */
  /*
    LE FONDU DES COTES DURE ASSEZ LONGTEMPS POUR SE VOIR.

    Il s'étalait sur le premier tiers de la levée : à quarante-quatre images,
    cela laissait DEUX images entre « pleine » et « éteinte » — l'œil ne voit
    pas un fondu de deux images, il voit une coupure. Le relevé du chantier
    le disait d'une cote en particulier, mais elles sautaient toutes, chacune
    à un pas différent de l'autre selon sa position dans la rampe.

    Le fondu couvre maintenant les deux tiers de la levée : une dizaine
    d'images, de quoi voir les chiffres s'en aller.
  */
  const opaciteCotes = Math.max(0, 1 - t / 0.72);
  if (opaciteCotes > 0.01) {
    for (const w of murs) {
      if (w.id === 'refend') continue;
      const len = segLength(w);
      const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
      // Vers l'extérieur du logement : la cote ne se pose pas sur le sol.
      const centre = { x: 2.1, z: 3.2 };
      let n = { x: -u.z, z: u.x };
      if ((mid.x - centre.x) * n.x + (mid.z - centre.z) * n.z < 0) {
        n = { x: -n.x, z: -n.z };
      }
      /*
        LA COTE SE POSE FRANCHEMENT DEHORS.

        À vingt-deux centimètres de l'axe — soit quinze du nu —, elle frôlait
        la maçonnerie : à plat ça passait, mais dès les premiers degrés
        d'inclinaison le poché NOIR du mur montait par-dessus, et un chiffre
        gris sur noir ne s'estompe pas, il s'éteint. C'est ce qu'on a vu sur
        la cote de gauche.
      */
      const ecart = 0.5;
      const a = project({
        x: w.a.x + n.x * ecart,
        y: 0,
        z: w.a.z + n.z * ecart,
      });
      const b = project({
        x: w.b.x + n.x * ecart,
        y: 0,
        z: w.b.z + n.z * ecart,
      });
      const mx = (a.sx + b.sx) / 2;
      const my = (a.sy + b.sy) / 2;
      let ang = (Math.atan2(b.sy - a.sy, b.sx - a.sx) * 180) / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      const texte = `${len.toFixed(2).replace('.', ',')} m`;
      out.push(
        `<g opacity="${opaciteCotes.toFixed(2)}">` +
          `<line x1="${a.sx.toFixed(1)}" y1="${a.sy.toFixed(1)}" ` +
          `x2="${b.sx.toFixed(1)}" y2="${b.sy.toFixed(1)}" ` +
          `stroke="${p.cote}" stroke-width="0.8"/>` +
          // Les deux traits d'about, qui font la cote d'un dessinateur.
          `<line x1="${a.sx.toFixed(1)}" y1="${a.sy.toFixed(1)}" ` +
          `x2="${(a.sx + (b.sx - a.sx) * 0.02).toFixed(1)}" ` +
          `y2="${(a.sy + (b.sy - a.sy) * 0.02).toFixed(1)}" ` +
          `stroke="${p.cote}" stroke-width="2.4"/>` +
          `<line x1="${b.sx.toFixed(1)}" y1="${b.sy.toFixed(1)}" ` +
          `x2="${(b.sx + (a.sx - b.sx) * 0.02).toFixed(1)}" ` +
          `y2="${(b.sy + (a.sy - b.sy) * 0.02).toFixed(1)}" ` +
          `stroke="${p.cote}" stroke-width="2.4"/>` +
          // Deux passes, comme les sigles : un liseré clair dessous, le
          // chiffre par-dessus. Une cote doit se lire sur le blanc du sol
          // comme sur le noir d'un mur.
          `<text x="${mx.toFixed(1)}" y="${(my - 3.5).toFixed(1)}" ` +
          `font-family="Helvetica" font-size="9" font-weight="bold" ` +
          `fill="none" stroke="#FFFFFF" stroke-width="3" text-anchor="middle" ` +
          `transform="rotate(${ang.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})">` +
          `${texte}</text>` +
          `<text x="${mx.toFixed(1)}" y="${(my - 3.5).toFixed(1)}" ` +
          `font-family="Helvetica" font-size="9" font-weight="bold" ` +
          `fill="${p.cote}" text-anchor="middle" ` +
          `transform="rotate(${ang.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})">` +
          `${texte}</text></g>`,
      );
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`
  );
}
