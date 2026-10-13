/**
 * LA LOGIQUE DE CONSTRUCTION — relevé du patron, vidéo d'un scan à l'appui :
 * « l'encadrement de l'ouvrant n'est pas correctement pris en compte : il y
 * a une marge de quelques centimètres que le scan ne repère pas, pourtant
 * bien visible à l'écran. J'ai ensuite scanné les autres ouvrants autour de
 * celui-ci, et tous diffèrent de quelques centimètres, alors que la logique
 * serait que tout soit au même niveau de hauteur. Même si le scan repère
 * quelques centimètres de différence, il doit les réaligner pour
 * correspondre à une logique. Fais ça pour toute détection, que ce soit les
 * murs, les portes et autres : une logique imparable en termes de
 * construction. »
 *
 * UN BÂTIMENT SE CONSTRUIT SUR DES NIVEAUX COMMUNS. Les linteaux d'un même
 * étage sont coulés à la même hauteur, les appuis aussi ; trois portes de
 * chambre sont trois fois le même bloc-porte ; un mur monte du sol au
 * plafond, et tous les murs d'une pièce ont donc la même hauteur ; un mur
 * est d'équerre avec son voisin. Le LiDAR, lui, mesure chaque chose à deux
 * ou trois centimètres près, chacune de son côté : quatre fenêtres alignées
 * ressortent à 2,14, 2,16, 2,17 et 2,19.
 *
 * Ce module ramène le relevé à cette logique, en deux temps :
 *
 * 1. L'ENCADREMENT RÉEL, LU DANS LE MAILLAGE. RoomPlan cadre la baie à
 *    quelques centimètres près — son rectangle tombe sur la face du linteau,
 *    au milieu du tableau. Le maillage LiDAR voit où le mur plein reprend :
 *    au-dessus de la baie (`dessus`, déjà relevé pour le coffre de volet),
 *    de chaque côté et sous l'appui (`tableaux`). La baie se recale sur ces
 *    arêtes, à dix centimètres au plus.
 *
 * 2. LES NIVEAUX COMMUNS. Ce qui ne diffère que de l'erreur du scan prend
 *    UNE valeur, au centimètre : les murs presque d'équerre se redressent
 *    (à 3° près), les hauts et les pieds de murs voisins de 3 cm se
 *    rejoignent, les linteaux et les appuis voisins de 4 cm s'alignent, les
 *    baies de même nature larges à 2 cm près prennent la même largeur, et
 *    une porte part du sol. Au-delà, l'écart est réel — un mur de jambette,
 *    un pan coupé, une imposte — et il reste.
 */
import type { ObjectData } from 'react-native-room-scan';
import { coffreDuProfil, type ProfilDessus } from './coffreLidar';
import { reprojectOpenings, segLength, straightenWalls, type Pt, type WallSeg } from './floorplan';

/** Les écarts que le scan fait, et en deçà desquels on aligne (m, °). */
export const TOLERANCES_DU_RELEVE = {
  /** Un mur à moins de 3° de la trame du logement est d'équerre. */
  equerre: 3,
  /** Les hauts et les pieds de murs. */
  mur: 0.03,
  /** Les linteaux et les appuis des baies. */
  niveau: 0.04,
  /** Les largeurs des baies d'une même nature. */
  largeur: 0.02,
  /** Une baie qui part à moins de 8 cm du sol part du sol. */
  seuil: 0.08,
} as const;

// ------------------------------------------------- 1. l'encadrement réel

/** Ce que le natif mesure à travers les tableaux et l'appui d'une baie. */
export interface ProfilTableaux {
  /** Largeur d'une tranche (m). */
  pas: number;
  /** Première tranche, comptée depuis le bord de RoomPlan, vers le mur (m). */
  depuis: number;
  gauche: number[];
  nombresGauche: number[];
  droite: number[];
  nombresDroite: number[];
  dessous?: number[];
  nombresDessous?: number[];
  oriente?: boolean;
}

/** Points du maillage qu'il faut dans une tranche pour la croire. */
const POINTS_MIN = 6;
/** Plus loin que cela du bord de RoomPlan, ce n'est plus une erreur de cadrage (m). */
const RECALAGE_MAX = 0.1;

/**
 * OÙ LE MUR PLEIN REPREND, en partant de l'intérieur de la baie : l'écart
 * (m) entre le bord que RoomPlan a donné et la vraie arête, positif vers le
 * mur. Dans la baie, le maillage ne voit rien de proche (le dehors), ou le
 * tableau et la menuiserie en retrait ; sur le mur, une face pleine (ou la
 * saillie d'un coffre, d'un habillage). L'arête est la première tranche
 * d'une suite de trois tranches pleines, précédée de deux creuses au moins.
 * `null` : le profil ne dit rien de sûr.
 */
export function areteDuProfil(
  ecarts: readonly number[],
  nombres: readonly number[],
  pas: number,
  depuis: number,
  oriente = true,
): number | null {
  const n = Math.min(ecarts.length, nombres.length);
  const ecart = (i: number) => (oriente ? ecarts[i] : Math.abs(ecarts[i]));
  const plein = (i: number) => i < n && (nombres[i] ?? 0) >= POINTS_MIN && ecart(i) > -3;
  for (let k = 0; k + 2 < n; k++) {
    if (!(plein(k) && plein(k + 1) && plein(k + 2))) continue;
    let creux = 0;
    for (let j = 0; j < k; j++) if (!plein(j)) creux++;
    if (creux < 2 || creux < k * 0.6) return null;
    const ecartAuBord = depuis + k * pas;
    return Math.abs(ecartAuBord) <= RECALAGE_MAX + 1e-9 ? ecartAuBord : null;
  }
  return null;
}

const auCentimetre = (m: number) => Math.round(m * 100) / 100;

/**
 * LA BAIE SE RECALE SUR SON ENCADREMENT : ses côtés sur les tableaux, son
 * haut sous le linteau, son appui sur la pierre. Un haut déjà repris par le
 * coffre de volet (voir `avecCoffresDuLidar`) ne bouge plus.
 */
export function avecLesBordsDuLidar(
  segments: WallSeg[],
  dessus: Record<string, ProfilDessus> | undefined,
  tableaux: Record<string, ProfilTableaux> | undefined,
): WallSeg[] {
  if (!dessus && !tableaux) return segments;
  return segments.map((s) => {
    if (s.type === 'wall') return s;
    let o = s;
    // Le haut : sous le linteau.
    const pd = dessus?.[s.id];
    if (pd && !coffreDuProfil(pd)) {
      const d = areteDuProfil(pd.ecarts, pd.nombres, pd.pas, pd.depuis, pd.oriente !== false);
      if (d !== null && Math.abs(d) >= 0.01) {
        o = { ...o, height: o.height + d, yCenter: o.yCenter + d / 2 };
      }
    }
    const pt = tableaux?.[s.id];
    if (pt) {
      const sens = pt.oriente !== false;
      const L = segLength(o);
      if (L > 0.3) {
        const u = { x: (o.b.x - o.a.x) / L, z: (o.b.z - o.a.z) / L };
        // Le côté gauche est le bout A, le droit le bout B (le repère de RoomPlan).
        const g = areteDuProfil(pt.gauche, pt.nombresGauche, pt.pas, pt.depuis, sens);
        const dr = areteDuProfil(pt.droite, pt.nombresDroite, pt.pas, pt.depuis, sens);
        const ga = g !== null && Math.abs(g) >= 0.01 ? g : 0;
        const gb = dr !== null && Math.abs(dr) >= 0.01 ? dr : 0;
        if (ga || gb) {
          o = {
            ...o,
            a: { x: o.a.x - u.x * ga, z: o.a.z - u.z * ga },
            b: { x: o.b.x + u.x * gb, z: o.b.z + u.z * gb },
          };
        }
      }
      // L'appui : seulement une fenêtre, une porte part du sol.
      if (o.type === 'window' && pt.dessous && pt.nombresDessous) {
        const d = areteDuProfil(pt.dessous, pt.nombresDessous, pt.pas, pt.depuis, sens);
        if (d !== null && Math.abs(d) >= 0.01) {
          o = { ...o, height: o.height + d, yCenter: o.yCenter - d / 2 };
        }
      }
    }
    if (o === s) return s;
    return { ...o, height: auCentimetre(o.height) || o.height };
  });
}

// ------------------------------------------------------ 2. les niveaux communs

/**
 * DES VALEURS VOISINES, UNE SEULE VALEUR. Les valeurs se rangent en grappes
 * (deux voisines à moins de `tol`, la grappe entière tenant dans une fois et
 * demie `tol`) ; une grappe de deux valeurs ou plus prend sa médiane, au
 * centimètre. Une valeur seule reste ce qu'elle est : rien ne dit qu'elle
 * est fausse.
 */
export function niveauxCommuns(valeurs: readonly number[], tol: number): number[] {
  const ordre = valeurs.map((v, i) => ({ v, i })).filter((x) => Number.isFinite(x.v)).sort((p, q) => p.v - q.v);
  const out = [...valeurs];
  let debut = 0;
  for (let k = 1; k <= ordre.length; k++) {
    const coupe =
      k === ordre.length ||
      ordre[k].v - ordre[k - 1].v > tol + 1e-9 ||
      ordre[k].v - ordre[debut].v > tol * 1.5 + 1e-9;
    if (!coupe) continue;
    const grappe = ordre.slice(debut, k);
    if (grappe.length >= 2) {
      const tries = grappe.map((x) => x.v);
      const m = tries.length % 2 ? tries[(tries.length - 1) / 2] : (tries[tries.length / 2 - 1] + tries[tries.length / 2]) / 2;
      const v = auCentimetre(m);
      for (const x of grappe) out[x.i] = v;
    }
    debut = k;
  }
  return out;
}

/**
 * LES MURS D'ÉQUERRE, À LA MÊME HAUTEUR. Le redressement aligne les nœuds
 * (voir `straightenWalls`) ; les hauts et les pieds voisins se rejoignent.
 */
function mursLogiques(walls: WallSeg[]): WallSeg[] {
  const murs = walls.filter((w) => w.type === 'wall');
  if (murs.length === 0) return walls;
  const droits = murs.length >= 3 ? straightenWalls(walls, TOLERANCES_DU_RELEVE.equerre, 0.12) : walls;
  const pieds = niveauxCommuns(
    droits.map((w) => (w.type === 'wall' ? w.yCenter - w.height / 2 : NaN)),
    TOLERANCES_DU_RELEVE.mur,
  );
  const hauts = niveauxCommuns(
    droits.map((w) => (w.type === 'wall' ? w.yCenter + w.height / 2 : NaN)),
    TOLERANCES_DU_RELEVE.mur,
  );
  return droits.map((w, i) => {
    if (w.type !== 'wall') return w;
    const height = hauts[i] - pieds[i];
    if (!(height > 0.2)) return w;
    const yCenter = pieds[i] + height / 2;
    return Math.abs(height - w.height) < 1e-9 && Math.abs(yCenter - w.yCenter) < 1e-9 ? w : { ...w, height, yCenter };
  });
}

/**
 * LES BAIES SUR LES MÊMES NIVEAUX : les linteaux ensemble, les appuis
 * ensemble, la porte au sol, les largeurs d'une même nature égales.
 */
function baiesLogiques(openings: WallSeg[], sol: number): WallSeg[] {
  if (openings.length === 0) return openings;
  const T = TOLERANCES_DU_RELEVE;
  const basDe = (o: WallSeg) => o.yCenter - o.height / 2;
  // Une porte, un passage, une porte-fenêtre : du sol.
  const bas = openings.map((o) => (basDe(o) - sol <= T.seuil ? sol : basDe(o)));
  const hauts = niveauxCommuns(
    openings.map((o) => o.yCenter + o.height / 2),
    T.niveau,
  );
  // Les appuis des fenêtres, entre eux.
  const appuis = niveauxCommuns(
    openings.map((o, i) => (o.type === 'window' && bas[i] > sol ? bas[i] : NaN)),
    T.niveau,
  );
  const largeurs = new Map<string, number>();
  for (const type of new Set(openings.map((o) => o.type))) {
    const ici = openings.filter((o) => o.type === type);
    const l = niveauxCommuns(ici.map(segLength), T.largeur);
    ici.forEach((o, k) => largeurs.set(o.id, l[k]));
  }
  return openings.map((o, i) => {
    const b = Number.isFinite(appuis[i]) ? appuis[i] : bas[i];
    const h = hauts[i] - b;
    if (!(h > 0.3)) return o;
    let a = o.a;
    let e = o.b;
    const L = segLength(o);
    const voulue = largeurs.get(o.id) ?? L;
    if (L > 1e-6 && Math.abs(voulue - L) > 1e-9) {
      const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      const u = { x: (o.b.x - o.a.x) / L, z: (o.b.z - o.a.z) / L };
      a = { x: m.x - (u.x * voulue) / 2, z: m.z - (u.z * voulue) / 2 };
      e = { x: m.x + (u.x * voulue) / 2, z: m.z + (u.z * voulue) / 2 };
    }
    const yCenter = b + h / 2;
    if (a === o.a && Math.abs(h - o.height) < 1e-9 && Math.abs(yCenter - o.yCenter) < 1e-9) return o;
    return { ...o, a, b: e, height: h, yCenter };
  });
}

// ------------------------------------------------------ 3. une chose, une fois

/**
 * UNE BAIE VUE DES DEUX CÔTÉS DE SON MUR RESTE UNE BAIE — revues « Thomas »
 * et « Bérénice » : la porte d'une cloison, vue depuis chacune de ses deux
 * pièces, sortait deux fois — 18 portes pour 9, deux battants et deux cotes
 * « 0,83 0,83 » au PDF, et le métré déduisait deux fois chaque porte des
 * murs à peindre. Deux baies parallèles, à moins de 45 cm l'une de l'autre
 * (l'épaisseur d'un mur), qui se recouvrent pour moitié au moins, n'en font
 * qu'une : au milieu des deux faces, à leur largeur moyenne. La plus haute
 * donne sa nature (une porte-fenêtre vue de dehors comme une porte).
 */
export function sansBaiesEnDouble(openings: WallSeg[]): WallSeg[] {
  const absorbees = new Set<string>();
  const out: WallSeg[] = [];
  for (let i = 0; i < openings.length; i++) {
    const o = openings[i];
    if (absorbees.has(o.id)) continue;
    const L = segLength(o);
    if (L < 1e-6) {
      out.push(o);
      continue;
    }
    const u = { x: (o.b.x - o.a.x) / L, z: (o.b.z - o.a.z) / L };
    const n = { x: -u.z, z: u.x };
    const t = (p: Pt) => (p.x - o.a.x) * u.x + (p.z - o.a.z) * u.z;
    const lat = (p: Pt) => (p.x - o.a.x) * n.x + (p.z - o.a.z) * n.z;
    let garde = o;
    for (let j = i + 1; j < openings.length; j++) {
      const q = openings[j];
      if (absorbees.has(q.id)) continue;
      const Lq = segLength(q);
      if (Lq < 1e-6) continue;
      const uq = { x: (q.b.x - q.a.x) / Lq, z: (q.b.z - q.a.z) / Lq };
      if (Math.abs(u.x * uq.x + u.z * uq.z) < 0.95) continue;
      const d = (lat(q.a) + lat(q.b)) / 2;
      if (Math.abs(d) > 0.45) continue;
      const t0 = Math.min(t(q.a), t(q.b));
      const t1 = Math.max(t(q.a), t(q.b));
      const commun = Math.min(t1, L) - Math.max(t0, 0);
      if (commun < 0.5 * Math.min(L, Lq)) continue;
      absorbees.add(q.id);
      // Au milieu des deux faces, à la largeur moyenne, autour du milieu commun.
      const mil = (L + t0 + t1) / 4;
      const largeur = (L + Lq) / 2;
      const centre = { x: o.a.x + u.x * mil + n.x * (d / 2), z: o.a.z + u.z * mil + n.z * (d / 2) };
      const haute = q.height > garde.height + 1e-9 ? q : garde;
      garde = {
        ...haute,
        id: o.id,
        a: { x: centre.x - (u.x * largeur) / 2, z: centre.z - (u.z * largeur) / 2 },
        b: { x: centre.x + (u.x * largeur) / 2, z: centre.z + (u.z * largeur) / 2 },
        height: (o.height + q.height) / 2,
        yCenter: (o.yCenter + q.yCenter) / 2,
      };
    }
    out.push(garde);
  }
  return absorbees.size > 0 ? out : openings;
}

/**
 * LA PORTE À DEUX VANTAUX — revue « Hélène » : la porte double du salon
 * d'angle, 1,40 m, sortait en deux portes de 0,69 bout à bout — deux
 * battants, deux cotes, deux passages de 0,60 là où l'on passe un buffet.
 * Deux portes ne se touchent pas : chacune a son huisserie, et un trumeau
 * les sépare. Deux portes alignées sur le même mur, bout à bout à 10 cm
 * près, de même hauteur et de même pied, d'un mètre au plus chacune, sont
 * les deux vantaux d'une seule.
 *
 * Et une porte de 1,20 m et plus, vue d'un seul tenant (la porte double
 * entre grand salon et salle à manger, 1,38), n'a pas un vantail de 1,38 :
 * aucune porte battante ne se fabrique ainsi. Elle en a deux.
 *
 * MAIS DEUX PORTES VOISINES NE SONT PAS DEUX VANTAUX — revue « Sandrine » :
 * le WC et la salle de bains, deux portes de 0,73 séparées par 7 cm et la
 * cloison qui tombe entre elles, devenaient une porte double de 1,53,
 * ensuite déplacée de 83 cm. Les deux vantaux d'une porte se touchent : le
 * jeu ne dépasse pas trois centimètres, et aucun mur n'arrive entre eux.
 */
const JEU_ENTRE_VANTAUX = 0.03;
const PORTE_A_DEUX_VANTAUX = 1.2;
const estUnVantail = (o: WallSeg, L: number) =>
  o.type === 'door' && !o.open && !o.garage && !o.vantaux && L >= 0.3 && L <= 1;

export function portesDoubles(
  openings: WallSeg[],
  /** Les murs : un bout de cloison entre deux portes les sépare. */
  walls: WallSeg[] = [],
): WallSeg[] {
  const prises = new Set<string>();
  const out: WallSeg[] = [];
  for (let i = 0; i < openings.length; i++) {
    const o = openings[i];
    if (prises.has(o.id)) continue;
    const L = segLength(o);
    if (o.type === 'door' && !o.open && !o.garage && !o.vantaux && L >= PORTE_A_DEUX_VANTAUX) {
      out.push({ ...o, vantaux: 2, pivot: undefined });
      prises.add(o.id);
      continue;
    }
    if (!estUnVantail(o, L)) {
      out.push(o);
      continue;
    }
    const u = { x: (o.b.x - o.a.x) / L, z: (o.b.z - o.a.z) / L };
    const n = { x: -u.z, z: u.x };
    const t = (p: Pt) => (p.x - o.a.x) * u.x + (p.z - o.a.z) * u.z;
    const lat = (p: Pt) => (p.x - o.a.x) * n.x + (p.z - o.a.z) * n.z;
    const pied = (w: WallSeg) => w.yCenter - w.height / 2;
    let double: WallSeg | null = null;
    for (let j = i + 1; j < openings.length && !double; j++) {
      const q = openings[j];
      if (prises.has(q.id)) continue;
      const Lq = segLength(q);
      if (!estUnVantail(q, Lq)) continue;
      const uq = { x: (q.b.x - q.a.x) / Lq, z: (q.b.z - q.a.z) / Lq };
      if (Math.abs(u.x * uq.x + u.z * uq.z) < 0.98) continue;
      if (Math.abs(lat(q.a)) > 0.08 || Math.abs(lat(q.b)) > 0.08) continue;
      if (Math.abs(q.height - o.height) > 0.1 || Math.abs(pied(q) - pied(o)) > 0.1) continue;
      const t0 = Math.min(t(q.a), t(q.b));
      const t1 = Math.max(t(q.a), t(q.b));
      // Le jeu entre les deux : un léger recouvrement est du bruit.
      const jeu = t0 >= L / 2 ? t0 - L : -t1;
      if (jeu < -0.05 || jeu > JEU_ENTRE_VANTAUX) continue;
      // Un mur qui arrive entre les deux : ce sont deux portes.
      const entreDeux = t0 >= L / 2 ? [L - 0.02, t0 + 0.02] : [t1 - 0.02, 0.02];
      const separees = walls.some(
        (w) =>
          w.type === 'wall' &&
          [w.a, w.b].some((p) => {
            const tp = t(p);
            return Math.abs(lat(p)) < 0.2 && tp > entreDeux[0] && tp < entreDeux[1];
          }),
      );
      if (separees) continue;
      const debut = Math.min(0, t0);
      const fin = Math.max(L, t1);
      const haut = Math.max(o.yCenter + o.height / 2, q.yCenter + q.height / 2);
      const bas = Math.min(pied(o), pied(q));
      prises.add(q.id);
      double = {
        ...o,
        a: { x: o.a.x + u.x * debut, z: o.a.z + u.z * debut },
        b: { x: o.a.x + u.x * fin, z: o.a.z + u.z * fin },
        height: haut - bas,
        yCenter: (haut + bas) / 2,
        vantaux: 2,
        pivot: undefined,
      };
    }
    out.push(double ?? o);
  }
  return prises.size > 0 ? out : openings;
}

/**
 * UN MEUBLE, UNE FOIS — revues « Thomas » et « Bérénice ».
 * - Le séjour repris à un passage de plus gardait deux canapés : l'ancien,
 *   poussé par le nouveau, partait de 87 cm dans le refend. Deux meubles de
 *   même nature, de même taille à un quart près, dont les centres tombent à
 *   moins de la moitié de la plus petite largeur, sont le même meuble vu
 *   deux fois : on garde le plus grand.
 * - La table de 2,40 m que RoomPlan coupe en deux ressortait en deux
 *   moitiés, dessinées en rouge. Deux tables de même profondeur et de même
 *   cap, alignées, bout à bout à 6 cm près, en font une.
 */
export function sansMeublesEnDouble<O extends ObjectData>(objets: O[]): O[] {
  const cap = (o: O) => Math.atan2(o.transform[2], o.transform[0]);
  const memeCap = (a: O, b: O, tol: number) => {
    let d = Math.abs(cap(a) - cap(b)) % Math.PI;
    if (d > Math.PI / 2) d = Math.PI - d;
    return d <= tol;
  };
  const jetes = new Set<string>();
  const suite = objets.map((o) => o);
  for (let i = 0; i < suite.length; i++) {
    const a = suite[i];
    if (jetes.has(a.id)) continue;
    for (let j = i + 1; j < suite.length; j++) {
      const b = suite[j];
      if (jetes.has(b.id) || a.category !== b.category) continue;
      if (!memeCap(a, b, (15 * Math.PI) / 180)) continue;
      const d = Math.hypot(a.transform[12] - b.transform[12], a.transform[14] - b.transform[14]);
      const semblables =
        Math.abs(a.width - b.width) <= 0.25 * Math.max(a.width, b.width) &&
        Math.abs(a.depth - b.depth) <= 0.25 * Math.max(a.depth, b.depth);
      if (semblables && d <= 0.5 * Math.min(a.width, b.width)) {
        // Le même meuble vu deux fois : le plus grand reste.
        const petit = a.width * a.depth >= b.width * b.depth ? b : a;
        jetes.add(petit.id);
        if (petit === a) break;
        continue;
      }
      // La table coupée en deux.
      if (!/table/i.test(a.category) || !memeCap(a, b, (5 * Math.PI) / 180) || Math.abs(a.depth - b.depth) > 0.05) continue;
      const ca = cap(a);
      const u = { x: Math.cos(ca), z: Math.sin(ca) };
      const dx = b.transform[12] - a.transform[12];
      const dz = b.transform[14] - a.transform[14];
      const le = dx * u.x + dz * u.z;
      const travers = Math.abs(-dx * u.z + dz * u.x);
      const jeu = Math.abs(le) - (a.width + b.width) / 2;
      if (travers > 0.05 || jeu > 0.06 || jeu < -0.05) continue;
      const debut = Math.min(-a.width / 2, le - b.width / 2);
      const fin = Math.max(a.width / 2, le + b.width / 2);
      const milieu = (debut + fin) / 2;
      const t = [...a.transform];
      t[12] = a.transform[12] + u.x * milieu;
      t[14] = a.transform[14] + u.z * milieu;
      suite[i] = { ...a, width: fin - debut, transform: t };
      jetes.add(b.id);
      // On revoit la table agrandie : une troisième part peut suivre.
      i--;
      break;
    }
  }
  return jetes.size > 0 ? suite.filter((o) => !jetes.has(o.id)) : objets;
}

/**
 * LE RELEVÉ RAMENÉ À LA LOGIQUE DE CONSTRUCTION — les murs d'équerre et à
 * la même hauteur, les baies suivant leurs murs, puis sur leurs niveaux
 * communs. À appeler sur ce que le scan vient de livrer, une fois ses murs
 * nettoyés (soudés, coupés, recollés).
 */
export function releveLogique(walls: WallSeg[], openings: WallSeg[]): { walls: WallSeg[]; openings: WallSeg[] } {
  const murs = mursLogiques(walls);
  const suivies = reprojectOpenings(walls, murs, portesDoubles(sansBaiesEnDouble(openings), walls));
  const pieds = murs.filter((w) => w.type === 'wall').map((w) => w.yCenter - w.height / 2);
  const sol = pieds.length > 0 ? Math.min(...pieds) : 0;
  return { walls: murs, openings: baiesLogiques(suivies, sol) };
}
