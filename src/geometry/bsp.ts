/**
 * L'ORDRE DE PEINTURE QUI NE PEUT PAS SE TROMPER.
 *
 * Relevé du patron, après cinq corrections sur le même sujet : « fais un
 * système plus infaillible en restant fluide, mais avec un vrai 3D strict —
 * impossible qu'un mur passe devant un élément ».
 *
 * CE QUE LE TRI DU PEINTRE NE PEUT PAS PROMETTRE. Le classement actuel
 * compare les faces DEUX À DEUX, là où elles se recouvrent à l'écran, et
 * range le tout par un tri topologique. Il est juste presque partout — la
 * mesure le dit : zéro faute sur mille huit prises de vue — mais il porte
 * deux impossibilités dans sa définition même :
 *
 *   — LA RONDE. A doit passer devant B, B devant C, C devant A. C'est une
 *     configuration géométrique parfaitement ordinaire, et AUCUN ordre de
 *     peinture ne la satisfait. Le classement tranche alors au moins pire
 *     (voir `denouer`), c'est-à-dire qu'il se trompe exprès ;
 *
 *   — LES VOLUMES QUI SE TRAVERSENT. Deux boîtes qui s'interpénètrent n'ont
 *     pas d'ordre : chacune est devant l'autre, selon l'endroit qu'on
 *     regarde. C'est le cas du meuble à cheval sur une cloison, et le
 *     rabotage des boîtes trop grandes n'en couvre qu'une partie.
 *
 * ON NE TRIE DONC PLUS, ON DÉCOUPE. Un arbre BSP (binary space partitioning)
 * prend les faces, choisit un plan, range de part et d'autre ce qui s'y
 * range — et COUPE EN DEUX ce qui le traverse. À la fin, plus une seule
 * paire de faces ne se traverse, et il n'existe plus de ronde : c'est une
 * propriété de la construction, pas un résultat de mesure. Pour n'importe
 * quelle position d'œil, un parcours de l'arbre rend l'ordre EXACT.
 *
 * ET C'EST PLUS FLUIDE, pas moins. La scène ne bouge pas — seule la caméra
 * tourne : l'arbre se construit UNE FOIS par plan, et chaque image ne fait
 * plus que le parcourir, en temps linéaire, sans comparer quoi que ce soit.
 * Le classement à l'écran, lui, coûtait une dizaine de millisecondes par
 * image sur un logement meublé, au point qu'il fallait le mémoriser quelques
 * degrés et vivre avec ce qu'il laissait passer entre deux.
 */
import type { Face3D, P3 } from './scene3d';

/** Un plan, sous la forme n·p = d. */
export interface Plan {
  n: P3;
  d: number;
}

/**
 * Ce qui sépare « sur le plan » de « d'un côté ».
 *
 * Un millimètre : en deçà, deux faces sont coplanaires pour l'œil comme pour
 * le calcul, et les distinguer ne ferait que multiplier les découpes.
 */
const EPS = 0.001;

/** Le plan d'une face, orienté par ses trois premiers sommets. */
export function planDe(pts: P3[]): Plan | null {
  const a = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const u = { x: pts[i].x - a.x, y: pts[i].y - a.y, z: pts[i].z - a.z };
    const v = { x: pts[i + 1].x - a.x, y: pts[i + 1].y - a.y, z: pts[i + 1].z - a.z };
    const n = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    const l = Math.hypot(n.x, n.y, n.z);
    // Trois points alignés ne définissent pas de plan : on essaie les suivants.
    if (l < 1e-9) continue;
    const u2 = { x: n.x / l, y: n.y / l, z: n.z / l };
    return { n: u2, d: u2.x * a.x + u2.y * a.y + u2.z * a.z };
  }
  return null;
}

const cote = (pl: Plan, p: P3) => pl.n.x * p.x + pl.n.y * p.y + pl.n.z * p.z - pl.d;

/**
 * COUPE UN POLYGONE EN DEUX le long d'un plan.
 *
 * Rend les deux morceaux — celui du côté de la normale, et l'autre. Le point
 * d'intersection est calculé sur chaque arête qui traverse : c'est ce qui
 * garantit que les deux morceaux se recollent exactement, sans jour ni
 * recouvrement.
 */
export function couper(
  pts: P3[],
  pl: Plan,
): { devant: P3[] | null; derriere: P3[] | null } {
  const devant: P3[] = [];
  const derriere: P3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ca = cote(pl, a);
    const cb = cote(pl, b);
    if (ca > -EPS) devant.push(a);
    if (ca < EPS) derriere.push(a);
    // L'arête traverse : le point de passage appartient aux DEUX morceaux.
    if ((ca > EPS && cb < -EPS) || (ca < -EPS && cb > EPS)) {
      const t = ca / (ca - cb);
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      };
      devant.push(p);
      derriere.push(p);
    }
  }
  return {
    devant: devant.length >= 3 ? devant : null,
    derriere: derriere.length >= 3 ? derriere : null,
  };
}

/** Une face rangée dans l'arbre : le dessin d'origine, et ses points à elle. */
export interface FaceBsp {
  /** La face d'origine — c'est elle qui porte couleur, trait et propriétaire. */
  source: Face3D;
  /** Les points de CE morceau : la découpe n'altère jamais l'original. */
  pts: P3[];
}

interface Noeud {
  plan: Plan;
  /** Les faces posées SUR ce plan, découpe comprise. */
  sur: FaceBsp[];
  devant: Noeud | null;
  derriere: Noeud | null;
}

/**
 * LE PLAN QU'ON CHOISIT — celui qui coupe le moins.
 *
 * Prendre la première face venue construit un arbre déséquilibré et découpe
 * beaucoup ; essayer TOUTES les faces coûte un temps carré. On en tire donc
 * quelques-unes, régulièrement espacées, et l'on garde celle qui traverse le
 * moins de voisines — c'est l'heuristique classique, et elle suffit
 * largement sur une scène de logement.
 */
const CANDIDATS = 8;

function choisir(faces: FaceBsp[]): number {
  let best = -1;
  let bestCout = Infinity;
  const pas = Math.max(1, Math.floor(faces.length / CANDIDATS));
  for (let i = 0; i < faces.length; i += pas) {
    const pl = planDe(faces[i].pts);
    if (!pl) continue;
    let coupes = 0;
    let devant = 0;
    let derriere = 0;
    for (let j = 0; j < faces.length; j++) {
      if (j === i) continue;
      let plus = false;
      let moins = false;
      for (const p of faces[j].pts) {
        const c = cote(pl, p);
        if (c > EPS) plus = true;
        if (c < -EPS) moins = true;
      }
      if (plus && moins) coupes++;
      else if (plus) devant++;
      else derriere++;
    }
    // Le coût : les découpes pèsent, le déséquilibre un peu.
    const cout = coupes * 3 + Math.abs(devant - derriere);
    if (cout < bestCout) {
      bestCout = cout;
      best = i;
    }
  }
  return best;
}

function bâtir(faces: FaceBsp[]): Noeud | null {
  if (faces.length === 0) return null;
  const i = choisir(faces);
  const plan = i >= 0 ? planDe(faces[i].pts) : null;
  if (!plan) {
    // Aucune face ne définit de plan (tout est dégénéré) : on les garde
    // telles quelles plutôt que de les perdre.
    return { plan: { n: { x: 0, y: 1, z: 0 }, d: 0 }, sur: faces, devant: null, derriere: null };
  }
  const sur: FaceBsp[] = [];
  const devant: FaceBsp[] = [];
  const derriere: FaceBsp[] = [];
  for (const f of faces) {
    let plus = false;
    let moins = false;
    for (const p of f.pts) {
      const c = cote(plan, p);
      if (c > EPS) plus = true;
      if (c < -EPS) moins = true;
    }
    if (!plus && !moins) sur.push(f);
    else if (plus && !moins) devant.push(f);
    else if (moins && !plus) derriere.push(f);
    else {
      const m = couper(f.pts, plan);
      if (m.devant) devant.push({ source: f.source, pts: m.devant });
      if (m.derriere) derriere.push({ source: f.source, pts: m.derriere });
    }
  }
  return { plan, sur, devant: bâtir(devant), derriere: bâtir(derriere) };
}

/** L'arbre d'une scène : construit une fois, parcouru à chaque image. */
export interface ArbreBsp {
  racine: Noeud | null;
  /** Nombre de morceaux après découpe — ce que la garantie a coûté. */
  morceaux: number;
}

export function construireBsp(faces: Face3D[]): ArbreBsp {
  const utiles = faces
    .filter((f) => f.pts.length >= 3)
    .map((f) => ({ source: f, pts: f.pts }));
  const racine = bâtir(utiles);
  let morceaux = 0;
  const compter = (n: Noeud | null) => {
    if (!n) return;
    morceaux += n.sur.length;
    compter(n.devant);
    compter(n.derriere);
  };
  compter(racine);
  return { racine, morceaux };
}

/**
 * L'ORDRE DE PEINTURE, DU PLUS LOINTAIN AU PLUS PROCHE.
 *
 * `vers` est la direction qui va de la scène VERS L'ŒIL. À chaque nœud, on
 * peint d'abord le demi-espace opposé à l'œil, puis les faces du plan
 * lui-même, puis le demi-espace de l'œil : c'est la définition du parcours
 * BSP, et elle donne l'ordre exact — pas un ordre probable.
 */
export function ordreBsp(arbre: ArbreBsp, vers: P3): FaceBsp[] {
  const out: FaceBsp[] = [];
  const marcher = (n: Noeud | null) => {
    if (!n) return;
    const face = n.plan.n.x * vers.x + n.plan.n.y * vers.y + n.plan.n.z * vers.z;
    if (face >= 0) {
      // L'œil est du côté de la normale : le derrière se peint en premier.
      marcher(n.derriere);
      out.push(...n.sur);
      marcher(n.devant);
    } else {
      marcher(n.devant);
      out.push(...n.sur);
      marcher(n.derriere);
    }
  };
  marcher(arbre.racine);
  return out;
}
