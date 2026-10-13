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
import { coffreDuProfil, type ProfilDessus } from './coffreLidar';
import { reprojectOpenings, segLength, straightenWalls, type WallSeg } from './floorplan';

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
  const droits = murs.length >= 3 ? straightenWalls(walls, TOLERANCES_DU_RELEVE.equerre) : walls;
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

/**
 * LE RELEVÉ RAMENÉ À LA LOGIQUE DE CONSTRUCTION — les murs d'équerre et à
 * la même hauteur, les baies suivant leurs murs, puis sur leurs niveaux
 * communs. À appeler sur ce que le scan vient de livrer, une fois ses murs
 * nettoyés (soudés, coupés, recollés).
 */
export function releveLogique(walls: WallSeg[], openings: WallSeg[]): { walls: WallSeg[]; openings: WallSeg[] } {
  const murs = mursLogiques(walls);
  const suivies = reprojectOpenings(walls, murs, openings);
  const pieds = murs.filter((w) => w.type === 'wall').map((w) => w.yCenter - w.height / 2);
  const sol = pieds.length > 0 ? Math.min(...pieds) : 0;
  return { walls: murs, openings: baiesLogiques(suivies, sol) };
}
