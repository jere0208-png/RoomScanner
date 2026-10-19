/**
 * LE MEUBLE PREND SA PLACE DANS SA NICHE.
 *
 * Relevé du patron, capture à l'appui : « mon frigo ne veut pas se caler
 * dans le coin dans lequel il se trouve, entre trois murs, sur le plan 2D.
 * Pourtant il a été scanné tel quel. On doit adapter la taille des meubles à
 * leur espace pour une reconstitution parfaite. »
 *
 * RoomPlan rend une boîte un peu plus petite que le meuble : 46 × 42 cm pour
 * un frigo logé dans un renfoncement de 62 cm. On lit, côté par côté, l'écart
 * entre le meuble et le nu du mur qui lui fait face (un mur à peu près
 * parallèle, qui couvre au moins la moitié du côté) :
 *
 *   — ENTRE DEUX MURS QUI SE FONT FACE, à moins de vingt centimètres de
 *     chacun, le meuble remplit l'intervalle — ou y est ramené, s'il
 *     mordait dans le mur ;
 *   — s'il est ainsi logé, et qu'un mur est aussi dans son DOS, il s'y
 *     adosse.
 *
 * Un meuble contre un seul mur, ou dans un angle, ne bouge pas : rien ne dit
 * qu'un canapé touche le mur, et il est rare qu'il le touche. Ni un tapis,
 * ni ce qui est suspendu. Et un meuble qui viendrait chevaucher son voisin
 * garde ses cotes.
 */
import { estUnCaisson } from './caisson';
import type { ObjectData } from 'react-native-room-scan';
import { demiFacesDe, segLength, solDesMurs, type DemiFaces, type Pt, type WallSeg } from './floorplan';

/** Jusqu'où un meuble est réputé « contre » un mur (m). */
const ECART_MAX = 0.2;
/** Ce qu'il peut mordre dans le mur, et qu'on lui retire (m). */
const MORSURE_MAX = 0.08;
/** Ce que RoomPlan se trompe sur un meuble qui ne s'encastre pas (m). */
const ERREUR_DE_MESURE = 0.05;
/** Murs à 10° près parallèles au côté. */
const PARALLELE = Math.cos((10 * Math.PI) / 180);

interface Repere {
  c: Pt;
  ex: Pt;
  ez: Pt;
  w: number;
  d: number;
}

function repereDe(o: ObjectData): Repere {
  const t = o.transform;
  const lx = Math.hypot(t[0], t[2]) || 1;
  const lz = Math.hypot(t[8], t[10]) || 1;
  return {
    c: { x: t[12], z: t[14] },
    ex: { x: t[0] / lx, z: t[2] / lx },
    ez: { x: t[8] / lz, z: t[10] / lz },
    w: o.width,
    d: o.depth,
  };
}

/**
 * L'écart entre un côté du meuble et le nu du mur qui lui fait face, ou
 * null. `n` : la normale sortante du côté ; `t` : sa direction ; `m` : son
 * milieu ; `demi` : sa demi-longueur.
 */
/*
  LES MURS LUS UNE FOIS — leur longueur, leur direction, leurs faces, gardées
  par tableau de murs (comme `facesDesMurs`) : chaque côté de chaque meuble
  les parcourt tous, à chaque passe.
*/
interface MurLu {
  w: WallSeg;
  L: number;
  u: Pt;
  f: DemiFaces;
}
const mursLus = new WeakMap<WallSeg[], MurLu[]>();
function lireLesMurs(walls: WallSeg[]): MurLu[] {
  let lus = mursLus.get(walls);
  if (!lus) {
    lus = [];
    for (const w of walls) {
      if (w.type !== 'wall') continue;
      const L = segLength(w);
      if (L < 0.05) continue;
      lus.push({ w, L, u: { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L }, f: demiFacesDe(walls, w) });
    }
    mursLus.set(walls, lus);
  }
  return lus;
}

function ecartAuMur(m: Pt, n: Pt, t: Pt, demi: number, walls: WallSeg[], centre: Pt = m): number | null {
  let mieux: number | null = null;
  for (const { w, L, u, f } of lireLesMurs(walls)) {
    if (Math.abs(u.x * t.x + u.z * t.z) < PARALLELE) continue;
    // La distance de la ligne du mur au côté, le long de la normale.
    const loin = (w.a.x - m.x) * n.x + (w.a.z - m.z) * n.z;
    /*
      JUSQU'À LA FACE TOURNÉE VERS LE MEUBLE — pas jusqu'à une
      demi-épaisseur. Le trait d'un mur scanné EST sa face (voir
      `facesDesMurs`) : le frigo calé à 7 cm du nu se cale contre lui.
    */
    /*
      LE CÔTÉ DU MUR SE LIT AU CENTRE DU MEUBLE, pas au milieu de son côté —
      rejeu des relevés du patron : un lave-linge relevé pile contre le mur
      (son côté SUR le trait) tombait du mauvais côté au centième près ; on
      prenait la face de l'autre côté (14 cm), le mur sortait du compte, et
      l'alignement de cuisine faisait glisser l'appareil… dans ce mur.
    */
    const cote = (centre.x - w.a.x) * -u.z + (centre.z - w.a.z) * u.x >= 0 ? f.plus : f.moins;
    const ecart = loin - cote;
    if (ecart < -MORSURE_MAX || ecart > ECART_MAX) continue;
    // Le mur couvre-t-il au moins la moitié du côté ?
    const p0 = { x: m.x - t.x * demi, z: m.z - t.z * demi };
    const p1 = { x: m.x + t.x * demi, z: m.z + t.z * demi };
    const s0 = (p0.x - w.a.x) * u.x + (p0.z - w.a.z) * u.z;
    const s1 = (p1.x - w.a.x) * u.x + (p1.z - w.a.z) * u.z;
    const commun = Math.min(Math.max(s0, s1), L) - Math.max(Math.min(s0, s1), 0);
    if (commun < demi) continue;
    if (mieux === null || Math.abs(ecart) < Math.abs(mieux)) mieux = ecart;
  }
  return mieux;
}

/** Le meuble calé dans sa niche, ou null s'il n'y est pas (ou y est déjà). */
export function calerDansLaNiche<O extends ObjectData>(o: O, walls: WallSeg[]): O | null {
  if ((o.height ?? 0) < 0.1 || /tapis|rug/i.test(o.category ?? '')) return null;
  const dessous = o.transform[13] - o.height / 2 - solDesMurs(walls);
  if (dessous > 0.3) return null;
  const r = repereDe(o);
  const cote = (axe: Pt, autre: Pt, demiAxe: number, demiAutre: number, signe: 1 | -1) =>
    ecartAuMur(
      { x: r.c.x + axe.x * demiAxe * signe, z: r.c.z + axe.z * demiAxe * signe },
      { x: axe.x * signe, z: axe.z * signe },
      autre,
      demiAutre,
      walls,
      r.c,
    );
  // Les deux côtés de la largeur (±x local), puis le dos (+z local).
  const gauche = cote(r.ex, r.ez, r.w / 2, r.d / 2, -1);
  const droite = cote(r.ex, r.ez, r.w / 2, r.d / 2, 1);
  const enLargeur = gauche !== null && droite !== null;
  const dos = enLargeur ? cote(r.ez, r.ex, r.d / 2, r.w / 2, 1) : null;
  // Entre deux murs qui se font face sur la profondeur, aussi.
  const avant = cote(r.ez, r.ex, r.d / 2, r.w / 2, -1);
  const arriere = dos ?? cote(r.ez, r.ex, r.d / 2, r.w / 2, 1);
  const enProfondeur = avant !== null && arriere !== null;
  if (!enLargeur && !enProfondeur) return null;

  // Les côtés bougent de leur écart ; le centre suit.
  let dxG = 0;
  let dxD = 0;
  let dzAv = 0;
  let dzAr = 0;
  if (enLargeur) {
    dxG = gauche!;
    dxD = droite!;
  }
  if (enProfondeur) {
    dzAv = avant!;
    dzAr = arriere!;
  } else if (dos !== null) {
    dzAr = dos;
  }
  if (Math.abs(dxG) + Math.abs(dxD) + Math.abs(dzAv) + Math.abs(dzAr) < 0.005) return null;
  const w = r.w + dxG + dxD;
  const d = r.d + dzAv + dzAr;
  // Un meuble qui doublerait n'est pas un meuble mal mesuré.
  if (w < 0.1 || d < 0.1 || w > r.w * 1.6 + 0.05 || d > r.d * 1.6 + 0.05) return null;
  /*
    SEUL CE QUI S'ENCASTRE REMPLIT SA NICHE — revue « Sandrine » : un lit de
    1,40 relevé dans une alcôve de 1,75 sortait en 1,61 ; un lit change de
    taille normalisée, pas de quelques centimètres. Le frigo, le lave-linge,
    le four, le placard se logent dans leur niche (le relevé du patron) ;
    tout le reste ne bouge que de l'erreur de mesure de RoomPlan.
  */
  const encastrable = /refrigerator|fridge|washer|dryer|dishwasher|oven|stove|storage|cabinet|wardrobe|placard/i.test(
    o.category ?? '',
  );
  if (!encastrable && (Math.abs(w - r.w) > ERREUR_DE_MESURE || Math.abs(d - r.d) > ERREUR_DE_MESURE)) return null;
  const glisseX = (dxD - dxG) / 2;
  const glisseZ = (dzAr - dzAv) / 2;
  const t = [...o.transform];
  t[12] = r.c.x + r.ex.x * glisseX + r.ez.x * glisseZ;
  t[14] = r.c.z + r.ex.z * glisseX + r.ez.z * glisseZ;
  return { ...o, width: w, depth: d, transform: t };
}

/** L'emprise au sol d'un meuble, en polygone. */
function emprise(o: ObjectData): Pt[] {
  const r = repereDe(o);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => ({
    x: r.c.x + r.ex.x * (r.w / 2) * sx + r.ez.x * (r.d / 2) * sz,
    z: r.c.z + r.ex.z * (r.w / 2) * sx + r.ez.z * (r.d / 2) * sz,
  }));
}

/**
 * DEUX MEUBLES ASSEZ PROCHES POUR SE TOUCHER ? — leurs cercles circonscrits,
 * agrandis de `marge`, se recoupent. Faux : ils sont plus loin que `marge`
 * l'un de l'autre, et tout calcul d'emprise est inutile (rejeu d'un gros
 * relevé : deux cents meubles, toutes les paires, à chaque passe).
 */
const rayons = new WeakMap<ObjectData, number>();
const rayonDe = (o: ObjectData) => {
  let r = rayons.get(o);
  if (r === undefined) {
    r = Math.hypot(o.width, o.depth) / 2;
    rayons.set(o, r);
  }
  return r;
};
function assezProches(a: ObjectData, b: ObjectData, marge: number): boolean {
  const dx = a.transform[12] - b.transform[12];
  const dz = a.transform[14] - b.transform[14];
  const portee = rayonDe(a) + rayonDe(b) + marge;
  return dx * dx + dz * dz <= portee * portee;
}

/** Deux emprises convexes se chevauchent-elles de plus d'un centimètre ? */
function chevauchent(p: Pt[], q: Pt[]): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l < 1e-9) continue;
      const ax = { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
      const proj = (pts: Pt[]) => pts.map((v) => v.x * ax.x + v.z * ax.z);
      const pp = proj(p);
      const qq = proj(q);
      if (Math.max(...pp) <= Math.min(...qq) + 0.01 || Math.max(...qq) <= Math.min(...pp) + 0.01) return false;
    }
  }
  return true;
}

/**
 * Tout le relevé : chaque meuble logé entre des murs prend sa place — sauf
 * s'il venait alors chevaucher un voisin qu'il ne chevauchait pas.
 */
export function calerLesMeubles<O extends ObjectData>(objets: O[], walls: WallSeg[]): O[] {
  let change = false;
  const out = objets.map((o) => {
    const cale = calerDansLaNiche(o, walls);
    if (!cale) return o;
    const avant = emprise(o);
    const apres = emprise(cale);
    // Le caisson sous plafond est au-dessus : il ne gêne aucun meuble posé au sol.
    const gene = objets.some(
      (v) =>
        v !== o &&
        !estUnCaisson(v) &&
        assezProches(cale, v, 0) &&
        chevauchent(apres, emprise(v)) &&
        !chevauchent(avant, emprise(v)),
    );
    if (gene) return o;
    change = true;
    return cale;
  });
  return change ? out : objets;
}

/** Un écart de moins de quinze centimètres se referme (m). */
const ECART_CUISINE = 0.15;
/** Ce qu'un meuble peut chevaucher son voisin et qu'on lui retire (m). */
const CHEVAUCHE_MAX = 0.05;
/** Au-dessus, le meuble est suspendu : un élément haut (m). */
const SUSPENDU = 1.0;

const ENCASTRABLE = /refrigerator|fridge|washer|dryer|dishwasher|oven|stove|storage|cabinet|wardrobe|placard|sink/i;

const alignables = new WeakMap<ObjectData, boolean>();
function sAligne(o: ObjectData): boolean {
  let oui = alignables.get(o);
  if (oui === undefined) {
    oui = (o.height ?? 0) >= 0.1 && ENCASTRABLE.test(o.category ?? '') && !estUnCaisson(o) && !/tapis|rug/i.test(o.category ?? '');
    alignables.set(o, oui);
  }
  return oui;
}

/** La hauteur commune de deux meubles (m). */
function enHauteur(a: ObjectData, b: ObjectData): number {
  const bas = Math.max(a.transform[13] - a.height / 2, b.transform[13] - b.height / 2);
  const haut = Math.min(a.transform[13] + a.height / 2, b.transform[13] + b.height / 2);
  return haut - bas;
}

/**
 * L'écart entre un bout du meuble (signe ±1 le long de sa largeur) et le
 * voisin qui lui fait face : un meuble encastrable parallèle, à la même
 * hauteur, en vis-à-vis sur la moitié de la profondeur au moins. Null si
 * aucun.
 */
function ecartAuVoisin(o: ObjectData, r: Repere, signe: 1 | -1, objets: ObjectData[]): number | null {
  let mieux: number | null = null;
  for (const v of objets) {
    // Plus loin que l'écart qu'on referme : ce voisin ne compte pas.
    if (v === o || !assezProches(o, v, ECART_CUISINE + 0.05)) continue;
    if (v.id === o.id || !sAligne(v) || enHauteur(o, v) < 0.2) continue;
    const q = repereDe(v);
    const ax = Math.abs(q.ex.x * r.ex.x + q.ex.z * r.ex.z);
    const az = Math.abs(q.ez.x * r.ex.x + q.ez.z * r.ex.z);
    if (Math.max(ax, az) < PARALLELE) continue;
    const pts = emprise(v);
    const le = pts.map((p) => (p.x - r.c.x) * r.ex.x + (p.z - r.c.z) * r.ex.z);
    const travers = pts.map((p) => (p.x - r.c.x) * r.ez.x + (p.z - r.c.z) * r.ez.z);
    const commun = Math.min(Math.max(...travers), r.d / 2) - Math.max(Math.min(...travers), -r.d / 2);
    if (commun < Math.min(r.d, q.d) / 2) continue;
    const ecart = signe > 0 ? Math.min(...le) - r.w / 2 : -r.w / 2 - Math.max(...le);
    if (ecart < -CHEVAUCHE_MAX) continue;
    if (mieux === null || ecart < mieux) mieux = ecart;
  }
  return mieux;
}

/** Deux meubles se gênent : leurs emprises se chevauchent, à la même hauteur. */
function seGenent(a: ObjectData, b: ObjectData): boolean {
  return enHauteur(a, b) > 0.05 && assezProches(a, b, 0) && chevauchent(emprise(a), emprise(b));
}

/** Le meuble aligné sur ses murs et ses voisins, ou null s'il l'est déjà. */
function alignerLeMeuble<O extends ObjectData>(o: O, objets: ObjectData[], walls: WallSeg[]): O | null {
  if (!sAligne(o)) return null;
  const r = repereDe(o);
  const suspendu = o.transform[13] - o.height / 2 - solDesMurs(walls) > SUSPENDU;
  const proche = (e: number | null) => (e !== null && e >= -CHEVAUCHE_MAX && e <= ECART_CUISINE ? e : null);

  // Le dos : contre le seul mur qui le borde, sur la profondeur.
  const dosAuMur = (signe: 1 | -1) =>
    proche(
      ecartAuMur(
        { x: r.c.x + r.ez.x * (r.d / 2) * signe, z: r.c.z + r.ez.z * (r.d / 2) * signe },
        { x: r.ez.x * signe, z: r.ez.z * signe },
        r.ex,
        r.w / 2,
        walls,
        r.c,
      ),
    );
  const devant = dosAuMur(-1);
  const derriere = dosAuMur(1);
  let glisseZ = 0;
  if ((devant === null) !== (derriere === null)) glisseZ = derriere ?? -(devant as number);

  // Les bouts : le mur d'angle ou le voisin le plus proche.
  const bout = (signe: 1 | -1): number | null => {
    const mur = ecartAuMur(
      { x: r.c.x + r.ex.x * (r.w / 2) * signe, z: r.c.z + r.ex.z * (r.w / 2) * signe },
      { x: r.ex.x * signe, z: r.ex.z * signe },
      r.ez,
      r.d / 2,
      walls,
      r.c,
    );
    const voisin = ecartAuVoisin(o, r, signe, objets);
    const tous = [mur, voisin].filter((e): e is number => e !== null && e >= -CHEVAUCHE_MAX);
    return tous.length ? proche(Math.min(...tous)) : null;
  };
  const gauche = bout(-1);
  const droite = bout(1);
  let w = r.w;
  let glisseX = 0;
  // Un appareil a sa largeur normalisée : il glisse, il ne s'élargit pas.
  const appareil = /refrigerator|fridge|washer|dryer|dishwasher|oven|stove/i.test(o.category ?? '');
  if (suspendu || (!appareil && gauche !== null && droite !== null && gauche + droite <= ECART_CUISINE)) {
    // L'élément haut prend la largeur du mur ; le meuble bas pris entre deux comble l'intervalle.
    w = r.w + (gauche ?? 0) + (droite ?? 0);
    glisseX = ((droite ?? 0) - (gauche ?? 0)) / 2;
  } else if (gauche !== null || droite !== null) {
    // Sinon il glisse jusqu'à toucher le plus proche.
    glisseX = droite !== null && (gauche === null || Math.abs(droite) <= Math.abs(gauche)) ? droite : -(gauche as number);
  }
  if (Math.abs(w - r.w) > Math.min(0.25 * r.w, 0.3) || w < 0.1) {
    w = r.w;
    glisseX = 0;
  }
  if (Math.abs(w - r.w) + Math.abs(glisseX) + Math.abs(glisseZ) < 0.005) return null;
  const t = [...o.transform];
  t[12] = r.c.x + r.ex.x * glisseX + r.ez.x * glisseZ;
  t[14] = r.c.z + r.ex.z * glisseX + r.ez.z * glisseZ;
  return { ...o, width: w, transform: t };
}

/*
  LA CUISINE SE RANGE COMME ON L'A POSÉE — diagnostic du patron, sa petite
  cuisine : « les meubles hauts ne prennent pas la largeur du mur alors que
  dans la réalité si ; le meuble à côté du lave-linge est en retrait, laissant
  une marge inutile au mur. Il manque une logique de placement, même si le
  scan pense voir autre chose. »

  Pour ce qui s'encastre (meubles bas et hauts, électroménager), une fois les
  niches calées :
    — LE DOS : à moins de quinze centimètres d'un seul mur, il s'y adosse ;
    — LES BOUTS : l'écart de moins de quinze centimètres avec le mur d'angle
      ou le meuble voisin, à la même hauteur, se referme. L'élément haut
      s'allonge (il prend la largeur du mur) ; le meuble bas glisse jusqu'à
      toucher, ou comble l'intervalle s'il est pris entre deux.
  Jamais plus d'un quart de sa largeur ni de trente centimètres, et jamais
  au point de chevaucher un voisin qu'il ne chevauchait pas.
*/
export function alignerLesMeubles<O extends ObjectData>(objets: O[], walls: WallSeg[]): O[] {
  let out = objets;
  for (let passe = 0; passe < 2; passe++) {
    let change = false;
    const suivant = [...out];
    for (let i = 0; i < suivant.length; i++) {
      const o = suivant[i];
      const aligne = alignerLeMeuble(o, suivant, walls);
      if (!aligne) continue;
      const gene = suivant.some((v, k) => k !== i && !estUnCaisson(v) && seGenent(aligne, v) && !seGenent(o, v));
      if (gene) continue;
      suivant[i] = aligne;
      change = true;
    }
    if (!change) break;
    out = suivant;
  }
  return out;
}
