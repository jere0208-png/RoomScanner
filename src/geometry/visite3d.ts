/**
 * LA VISITE EN NATIF — ce que la scène envoie à SceneKit.
 *
 * Relevé du patron : « l'exploration n'est pas du tout fluide lorsqu'on se
 * déplace s'il y a un minimum d'éléments (...) le sol en parquet apparaît
 * mal aussi, selon la vue, il disparaît ». Les deux ont la même cause : la
 * vue à la première personne était PEINTE en JavaScript — six cents faces
 * projetées, triées comme un peintre, puis envoyées au canevas, trente fois
 * par seconde. Sur le téléphone, Hermes ne compile pas à la volée : une
 * image coûtait bien plus que sa part de seconde, et le tri du peintre, qui
 * ne range les faces que sur UN nombre, laissait tomber les joints du sol
 * derrière lui dès qu'on les regardait de biais.
 *
 * On ne peint plus en JavaScript. La scène est BÂTIE UNE FOIS — la même que
 * celle de la maquette (`buildScene`) : murs percés de leurs baies, meubles,
 * sols et plafonds, teintes relevées au scan — puis remise à SceneKit, le
 * moteur 3D d'iOS, qui la tient sur la carte graphique. Ensuite, seule la
 * caméra bouge : six nombres par image. La profondeur est jugée au pixel par
 * le matériel, pas par un tri : rien ne passe plus devant ce qui est devant.
 *
 * Et le parquet n'est plus des traits posés un souffle au-dessus du sol :
 * c'est une TEXTURE, les lames et leurs abouts dessinés dans l'image du sol,
 * répétée à l'échelle réelle (une lame de 22 cm sur 1,35 m). Elle ne peut
 * pas disparaître.
 *
 * CE QUI TRAVERSE LE PONT, et sous quelle forme — la leçon du canevas : des
 * NOMBRES À PLAT, qui se convertissent d'un bloc.
 *
 *   `maillage` : les triangles de tout le bâti et du mobilier ;
 *                [x, y, z] × 3 puis [r, g, b] (0–1), douze nombres par triangle.
 *   `sols`     : un bloc par sol — [matière, sens, r, g, b, n] puis n triangles
 *                de neuf coordonnées. La matière dit l'image à répéter, le
 *                sens celui des lames.
 *   `camera`   : [x, y, z, lacet, tangage, ouverture verticale en degrés].
 */
import { Habilleur } from './habillage';
import type { Face3D, P3, PovCamera } from './scene3d';

/** La matière d'un sol, telle que le natif la lit. */
export const MATIERE = { aucune: 0, parquet: 1, carrelage: 2 } as const;
/** Le sens des lames : le long de x, ou le long de z. */
export const SENS = { x: 0, z: 1 } as const;
/** Nombres par triangle dans `maillage`. */
export const PAR_TRIANGLE = 12;
/** Nombres d'en-tête d'un sol dans `sols`. */
export const ENTETE_SOL = 6;

export interface MaillageDeVisite {
  maillage: number[];
  sols: number[];
  /** Les vraies images du relevé (chemins), dans l'ordre de leur rang. */
  textures: string[];
  /** Les faces habillées : seize nombres par triangle (voir `Habilleur`). */
  texturees: number[];
  /** Les arêtes du bâti : six nombres par segment (voir `aretesDuBati`). */
  aretes: number[];
}

/** Combien de jeux d'arêtes se gardent : maquette, visite, et un peu de marge. */
const ARETES_GARDEES = 4;
const aretesGardees: { empreinte: Float64Array; aretes: number[] }[] = [];

/**
 * LES ARÊTES DU BÂTI — relevé du patron : « ajoute des arêtes légères sur les
 * murs et plafonds, plus visibles, et autour des ouvrants sans porte ; on doit
 * mieux voir les fins de chaque pan de mur ».
 *
 * Chaque côté de chaque face est une arête candidate. On garde celles qui
 * marquent une FORME : deux faces qui s'y rejoignent en faisant un angle (un
 * angle de pièce, la fin d'un mur, son chant, le tableau d'une ouverture), ou
 * un bord qui n'appartient qu'à une face (la jonction avec le plafond, avec
 * le sol). Deux pans d'un même mur, côte à côte et dans le même plan — au-
 * dessus et au-dessous d'une fenêtre —, ne laissent pas de trait.
 *
 * Chaque segment est décollé de quatre millimètres le long de la moyenne des
 * normales de ses faces : vers l'œil qui le regarde, il passe devant elles.
 *
 * LE CALCUL SE GARDE TANT QUE LE BÂTI NE BOUGE PAS — relevé de l'expert 3D :
 * la visite, montée même fermée, refaisait ses arêtes à chaque lâcher d'un
 * meuble dans le plan 2D, environ deux cents millisecondes sous Node, le
 * double sur l'iPhone, pour des traits qui ne dépendent QUE du bâti (les
 * meubles n'entrent pas dans `polys`). Les dernières faces reçues sont donc
 * comparées, nombre à nombre, à celles des derniers calculs : les mêmes, et
 * l'on rend les mêmes arêtes, sans rien refaire. La maquette (sans plafond)
 * et la visite (avec) ont chacune leur place dans la réserve.
 *
 * Le tableau rendu est PARTAGÉ entre les appels : il se lit, il ne se
 * modifie pas.
 */
export function aretesDuBati(polysBruts: { pts: P3[]; n: P3 }[]): number[] {
  const empreinte = empreinteDesFaces(polysBruts);
  const i = aretesGardees.findIndex((g) => memesNombres(g.empreinte, empreinte));
  if (i >= 0) {
    const g = aretesGardees[i];
    // La plus récente en tête : c'est la dernière que l'on chassera.
    if (i > 0) {
      aretesGardees.splice(i, 1);
      aretesGardees.unshift(g);
    }
    return g.aretes;
  }
  const aretes = calculerLesAretes(polysBruts);
  aretesGardees.unshift({ empreinte, aretes });
  if (aretesGardees.length > ARETES_GARDEES) aretesGardees.length = ARETES_GARDEES;
  return aretes;
}

/**
 * TOUT CE QUE LIT LE CALCUL, À PLAT : pour chaque face, son nombre de
 * sommets, sa normale, puis ses sommets. Deux empreintes égales nombre à
 * nombre donnent forcément les mêmes arêtes — le calcul ne lit rien d'autre.
 */
function empreinteDesFaces(polys: { pts: P3[]; n: P3 }[]): Float64Array {
  let taille = 0;
  for (const { pts } of polys) taille += 4 + pts.length * 3;
  const out = new Float64Array(taille);
  let k = 0;
  for (const { pts, n } of polys) {
    out[k++] = pts.length;
    out[k++] = n.x;
    out[k++] = n.y;
    out[k++] = n.z;
    for (const p of pts) {
      out[k++] = p.x;
      out[k++] = p.y;
      out[k++] = p.z;
    }
  }
  return out;
}

/** Les mêmes nombres, au bit près (`Object.is` : −0 n'est pas 0). */
function memesNombres(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** Vide la réserve des arêtes (bancs d'essai). */
export function oublierLesAretesGardees(): void {
  aretesGardees.length = 0;
}

function calculerLesAretes(polysBruts: { pts: P3[]; n: P3 }[]): number[] {
  const TOL = 0.005;
  const CASE = 0.5;
  /*
    DES NORMALES DE LONGUEUR UN — relevé du patron, sur capture : « il y a
    toujours au-dessus des ouvrants les traits verticaux ». La normale d'un
    contour (`normaleDuContour`) a la longueur de son aire : deux pans d'un
    même plan, petits, avaient un produit scalaire bien sous le seuil — ils
    passaient pour un angle, et chaque joint de linteau laissait son trait.
  */
  const polys = polysBruts.map(({ pts, n }) => {
    const l = Math.hypot(n.x, n.y, n.z) || 1;
    return { pts, n: { x: n.x / l, y: n.y / l, z: n.z / l } };
  });
  // Tous les côtés de toutes les faces, avec la normale de leur face.
  const cotes: { a: P3; b: P3; n: P3; f: number }[] = [];
  const centres: P3[] = polys.map(({ pts }) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const p of pts) {
      x += p.x;
      y += p.y;
      z += p.z;
    }
    return { x: x / pts.length, y: y / pts.length, z: z / pts.length };
  });
  polys.forEach(({ pts, n }, f) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) >= 0.02) cotes.push({ a, b, n, f });
    }
  });
  // Une grille de cases d'un demi-mètre : on ne compare que des voisins.
  const caseDe = (v: number) => Math.floor(v / CASE);
  const cleCase = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const grille = new Map<string, number[]>();
  const casesDe = (a: P3, b: P3, cb: (k: string) => void) => {
    for (let i = caseDe(Math.min(a.x, b.x) - TOL); i <= caseDe(Math.max(a.x, b.x) + TOL); i++) {
      for (let j = caseDe(Math.min(a.y, b.y) - TOL); j <= caseDe(Math.max(a.y, b.y) + TOL); j++) {
        for (let k = caseDe(Math.min(a.z, b.z) - TOL); k <= caseDe(Math.max(a.z, b.z) + TOL); k++) cb(cleCase(i, j, k));
      }
    }
  };
  cotes.forEach((c, idx) => {
    casesDe(c.a, c.b, (k) => {
      const l = grille.get(k);
      if (l) l.push(idx);
      else grille.set(k, [idx]);
    });
  });
  const distAuSegment = (p: P3, a: P3, b: P3): { d: number; t: number } => {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const l2 = ux * ux + uy * uy + uz * uz;
    const t = l2 > 0 ? ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / l2 : 0;
    const tc = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(a.x + ux * tc - p.x, a.y + uy * tc - p.y, a.z + uz * tc - p.z), t };
  };
  const voisins = (a: P3, b: P3): Set<number> => {
    const out = new Set<number>();
    casesDe(a, b, (k) => {
      for (const idx of grille.get(k) ?? []) out.add(idx);
    });
    return out;
  };
  /*
    LES JOINTS EN T. Le linteau au-dessus d'une porte touche le pan de mur
    voisin sur une partie seulement de sa hauteur : leurs côtés ne partagent
    pas leurs extrémités. Chaque côté se coupe donc aux sommets des faces
    voisines qui tombent dessus, et chaque tronçon se juge à son milieu.

    UN JOINT AU MILIEU D'UNE SURFACE PLATE NE LAISSE PAS DE TRAIT — relevé du
    patron : « des arêtes sont au-dessus des ouvrants, il ne devrait pas y en
    avoir ». Le linteau est un bloc : ses bouts, cachés dans l'épaisseur du
    mur contre le pan voisin, faisaient croire à un angle. Dès que deux faces
    d'un même plan se trouvent de part et d'autre d'un tronçon, la surface
    continue : ce qui est derrière ne compte pas.
  */
  const vus = new Set<string>();
  const cle = (p: P3) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)},${Math.round(p.z * 100)}`;
  const out: number[] = [];
  /*
    LE PRÉFILTRE PAR BOÎTE — relevé de l'expert 3D : quatre-vingt mille
    voisins éprouvés sur l'exemple, et presque tout le temps du calcul passé
    dans `distAuSegment`. Un sommet à moins de TOL du côté est forcément
    dans la boîte du côté gonflée de TOL : le point le plus proche est sur
    le côté, donc dans sa boîte, et chaque coordonnée n'en est écartée que de
    la distance au plus. Ceux qui sortent de la boîte ne se mesurent plus.
    La marge est DOUBLÉE, pour que l'arrondi ne rejette jamais un sommet que
    la mesure aurait gardé : les coupes, et donc les traits, sont les mêmes.
  */
  const MARGE = 2 * TOL;
  for (const c of cotes) {
    const proches = voisins(c.a, c.b);
    const coupes = [0, 1];
    const x0 = Math.min(c.a.x, c.b.x) - MARGE;
    const x1 = Math.max(c.a.x, c.b.x) + MARGE;
    const y0 = Math.min(c.a.y, c.b.y) - MARGE;
    const y1 = Math.max(c.a.y, c.b.y) + MARGE;
    const z0 = Math.min(c.a.z, c.b.z) - MARGE;
    const z1 = Math.max(c.a.z, c.b.z) + MARGE;
    for (const idx of proches) {
      for (const p of [cotes[idx].a, cotes[idx].b]) {
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1 || p.z < z0 || p.z > z1) continue;
        const { d, t } = distAuSegment(p, c.a, c.b);
        if (d < TOL && t > 0.001 && t < 0.999) coupes.push(t);
      }
    }
    coupes.sort((x, y) => x - y);
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const dz = c.b.z - c.a.z;
    for (let k = 0; k + 1 < coupes.length; k++) {
      const t0 = coupes[k];
      const t1 = coupes[k + 1];
      if (t1 - t0 < 1e-3) continue;
      const at = (t: number) => ({ x: c.a.x + dx * t, y: c.a.y + dy * t, z: c.a.z + dz * t });
      const a = at(t0);
      const b = at(t1);
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 0.02) continue;
      const ka = cle(a);
      const kb = cle(b);
      const k2 = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (vus.has(k2)) continue;
      vus.add(k2);
      const m = at((t0 + t1) / 2);
      // Les faces qui touchent ce tronçon en son milieu.
      const touchees: number[] = [];
      for (const idx of voisins(m, m)) {
        const o = cotes[idx];
        if (touchees.includes(o.f)) continue;
        if (distAuSegment(m, o.a, o.b).d < TOL) touchees.push(o.f);
      }
      // Une surface plate qui continue de part et d'autre : un joint.
      let joint = false;
      for (let i = 0; i < touchees.length && !joint; i++) {
        const p = polys[touchees[i]].n;
        // Le côté de la face, dans son plan : de quel côté du tronçon est son centre.
        const cote = (f: number) => {
          const n = polys[f].n;
          const sx = n.y * dz - n.z * dy;
          const sy = n.z * dx - n.x * dz;
          const sz = n.x * dy - n.y * dx;
          const q = centres[f];
          return (q.x - m.x) * sx + (q.y - m.y) * sy + (q.z - m.z) * sz;
        };
        for (let j = i + 1; j < touchees.length && !joint; j++) {
          const q = polys[touchees[j]].n;
          if (p.x * q.x + p.y * q.y + p.z * q.z < 0.94) continue;
          if (cote(touchees[i]) * cote(touchees[j]) < 0) joint = true;
        }
      }
      if (joint) continue;
      const normales = touchees.map((f) => polys[f].n);
      if (normales.length >= 2) {
        let pli = false;
        for (let i = 1; i < normales.length && !pli; i++) {
          const p = normales[0];
          const q = normales[i];
          if (p.x * q.x + p.y * q.y + p.z * q.z < 0.94) pli = true;
        }
        if (!pli) continue;
      }
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (const q of normales) {
        mx += q.x;
        my += q.y;
        mz += q.z;
      }
      const l = Math.hypot(mx, my, mz) || 1;
      const d = 0.004 / l;
      out.push(a.x + mx * d, a.y + my * d, a.z + mz * d, b.x + mx * d, b.y + my * d, b.z + mz * d);
    }
  }
  return out;
}

/**
 * LES TRIANGLES D'UN CONTOUR, TOURNÉS VERS LA NORMALE VOULUE — leur dos n'est
 * jamais dessiné : un triangle à l'envers serait invisible du bon côté.
 */
export function orienterVers(voulue: P3 | null) {
  return (pts: P3[], tris: [number, number, number][]): [number, number, number][] => {
    if (!voulue) return tris;
    const n = normaleDuContour(pts);
    return n.x * voulue.x + n.y * voulue.y + n.z * voulue.z < 0 ? tris.map(([a, b, c]) => [c, b, a]) : tris;
  };
}

/** « #RRGGBB » → trois composantes 0–1. L'illisible rend un gris moyen. */
export function composantes(hex: string | null | undefined): [number, number, number] {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return [0.5, 0.5, 0.5];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/**
 * LA NORMALE D'UN CONTOUR, par la méthode de Newell — la seule qui tienne
 * pour un polygone gauche ou concave : on somme les projections des arêtes.
 */
export function normaleDuContour(pts: P3[]): P3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    nx += (p.y - q.y) * (p.z + q.z);
    ny += (p.z - q.z) * (p.x + q.x);
    nz += (p.x - q.x) * (p.y + q.y);
  }
  return { x: nx, y: ny, z: nz };
}

/**
 * DÉCOUPE UN CONTOUR EN TRIANGLES — par les oreilles.
 *
 * Un sol en L, un plafond qui suit la pièce : ni l'un ni l'autre n'est
 * convexe, et un éventail depuis le premier sommet planterait des triangles
 * hors de la pièce. On coupe donc une « oreille » à la fois — un sommet
 * convexe dont le triangle ne contient aucun autre sommet —, jusqu'à ce
 * qu'il n'en reste que trois. Les indices rendus suivent l'ORIENTATION DU
 * CONTOUR D'ORIGINE : c'est l'appelant qui décide de quel côté regarde la
 * face.
 */
export function triangulerContour(pts: P3[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  // Le plan de travail : on écarte l'axe que la normale domine.
  const no = normaleDuContour(pts);
  const ax = Math.abs(no.x);
  const ay = Math.abs(no.y);
  const az = Math.abs(no.z);
  const uv: (p: P3) => [number, number] =
    ax >= ay && ax >= az
      ? (p) => [p.y, p.z]
      : ay >= az
      ? (p) => [p.z, p.x]
      : (p) => [p.x, p.y];
  const plan = pts.map(uv);
  const aire2 = plan.reduce((s, p, i) => {
    const q = plan[(i + 1) % n];
    return s + (p[0] * q[1] - q[0] * p[1]);
  }, 0);
  // On travaille dans le sens direct ; on remettra l'ordre d'origine après.
  const inverse = aire2 < 0;
  const reste: number[] = Array.from({ length: n }, (_, i) => (inverse ? n - 1 - i : i));
  const croix = (a: number, b: number, c: number) => {
    const [ax1, ay1] = plan[a];
    const [bx, by] = plan[b];
    const [cx, cy] = plan[c];
    return (bx - ax1) * (cy - ay1) - (by - ay1) * (cx - ax1);
  };
  const dedans = (p: number, a: number, b: number, c: number) =>
    croix(a, b, p) >= -1e-12 && croix(b, c, p) >= -1e-12 && croix(c, a, p) >= -1e-12;
  const out: [number, number, number][] = [];
  let garde = 0;
  while (reste.length > 3 && garde < 4 * n * n) {
    garde++;
    let coupee = false;
    for (let i = 0; i < reste.length; i++) {
      const a = reste[(i + reste.length - 1) % reste.length];
      const b = reste[i];
      const c = reste[(i + 1) % reste.length];
      if (croix(a, b, c) <= 1e-12) continue; // rentrant ou plat : pas une oreille
      let libre = true;
      for (const p of reste) {
        if (p === a || p === b || p === c) continue;
        if (dedans(p, a, b, c)) {
          libre = false;
          break;
        }
      }
      if (!libre) continue;
      out.push([a, b, c]);
      reste.splice(i, 1);
      coupee = true;
      break;
    }
    // Un contour dégénéré (sommets alignés, arêtes qui se croisent) ne
    // livre plus d'oreille : on finit en éventail plutôt qu'en boucle.
    if (!coupee) break;
  }
  if (reste.length >= 3) {
    for (let i = 1; i + 1 < reste.length; i++) out.push([reste[0], reste[i], reste[i + 1]]);
  }
  return inverse ? out.map(([a, b, c]) => [c, b, a]) : out;
}

/**
 * LE SENS DES LAMES D'UN SOL : celui du relevé, sinon le grand côté — la
 * même règle que les joints de la maquette (`jointsDuSol`).
 */
export function sensDesLames(pts: P3[], sens?: 'x' | 'z'): 0 | 1 {
  if (sens) return sens === 'x' ? SENS.x : SENS.z;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return maxX - minX >= maxZ - minZ ? SENS.x : SENS.z;
}

/**
 * LES FACES DE LA SCÈNE, EN TRIANGLES POUR LE NATIF.
 *
 * Chaque face pleine devient des triangles orientés du côté de sa normale :
 * le sol regarde en haut, le plafond en bas, un mur vers sa pièce — c'est
 * ce qui permet à la lumière d'éclairer le bon côté. Les ARÊTES (deux
 * points) ne voyagent pas : la lumière et l'occlusion dessinent les angles
 * mieux qu'un trait, et un trait posé sur une face se bat avec elle au
 * pixel. Les OMBRES PORTÉES de la maquette non plus : la lumière et
 * l'occlusion font le contact d'un meuble avec le sol, et une nappe posée
 * sur le sol se battrait avec lui.
 */
export function maillageDeLaVisite(faces: Face3D[], o: { sansMeubles?: boolean } = {}): MaillageDeVisite {
  const maillage: number[] = [];
  const sols: number[] = [];
  // Les murs et les sols en vraies images (voir `habillage`).
  const habilleur = new Habilleur();
  // Les faces du bâti et leur normale tournée, pour les arêtes.
  const polys: { pts: P3[]; n: P3 }[] = [];
  const pousser = (cible: number[], pts: P3[], tri: [number, number, number]) => {
    for (const i of tri) {
      const p = pts[i];
      cible.push(p.x, p.y, p.z);
    }
  };
  for (const face of faces) {
    if (face.pts.length < 3 || !face.fill || face.ombre) continue;
    // Les meubles en caisses : la visite a les vrais modèles (`modeles3d`).
    // Une fenêtre aussi : la visite a sa menuiserie en volume.
    if (o.sansMeubles && (face.meuble || (face.appareil && !face.sansModele) || face.enVolume)) continue;
    const voulue: P3 | null = face.isFloor
      ? { x: 0, y: 1, z: 0 }
      : face.isCeiling
      ? { x: 0, y: -1, z: 0 }
      : face.normal ?? null;
    if (face.habillage?.length) {
      habilleur.ajouter(face.habillage, triangulerContour, orienterVers(voulue));
      continue;
    }
    let tris = triangulerContour(face.pts);
    if (voulue) {
      const n = normaleDuContour(face.pts);
      if (n.x * voulue.x + n.y * voulue.y + n.z * voulue.z < 0) {
        tris = tris.map(([a, b, c]) => [c, b, a]);
      }
    }
    if (tris.length === 0) continue;
    if (!face.meuble && !face.appareil) {
      const n = normaleDuContour(face.pts);
      const tournee = voulue && n.x * voulue.x + n.y * voulue.y + n.z * voulue.z < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
      polys.push({ pts: face.pts, n: tournee });
    }
    const [r, g, b] = composantes(face.fill);
    if (face.isFloor) {
      sols.push(
        face.matiere === 'parquet'
          ? MATIERE.parquet
          : face.matiere === 'carrelage'
          ? MATIERE.carrelage
          : MATIERE.aucune,
        sensDesLames(face.pts, face.sensLattes),
        r,
        g,
        b,
        tris.length,
      );
      for (const t of tris) pousser(sols, face.pts, t);
    } else {
      for (const t of tris) {
        pousser(maillage, face.pts, t);
        maillage.push(r, g, b);
      }
    }
  }
  return {
    maillage,
    sols,
    textures: habilleur.textures,
    texturees: habilleur.texturees,
    aretes: aretesDuBati(polys),
  };
}

/** La caméra, à plat : position, lacet, tangage, ouverture verticale (°). */
export function cameraNative(cam: PovCamera): number[] {
  return [cam.at.x, cam.at.y, cam.at.z, cam.yaw, cam.pitch, cam.fov];
}
