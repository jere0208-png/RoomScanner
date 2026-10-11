/**
 * LE COFFRE DE VOLET ROULANT, LU DANS LE MAILLAGE LIDAR.
 *
 * Relevé du patron : « les coffrages de volets roulants, au-dessus des baies
 * en général, ne sont pas détectés par le lidar. Vois pourquoi. Pourtant il
 * y a bien un coffrage, et donc une forme différente d'un mur plat. »
 *
 * POURQUOI ROOMPLAN NE LE VOIT PAS. Il rend des MURS PLANS : un plan par
 * paroi, ajusté sur ce que le LiDAR a vu, et tout relief de moins de vingt
 * ou trente centimètres y est lissé — le coffre, la niche, le retour court.
 * Sa liste d'objets (meubles, portes, fenêtres) n'a pas de case pour un
 * caisson de volet. Le maillage LiDAR brut, lui, a bien vu la saillie : il
 * était relevé à chaque scan (`RoomScanMaillage.swift`), mais on n'en lisait
 * que le sol et le plafond.
 *
 * CE QU'ON EN LIT. Le natif mesure, au-dessus de chaque baie, l'écart du
 * maillage au plan du mur, tranche de deux centimètres par tranche — la
 * médiane, côté pièce positif (`profilsAuDessus`). Un coffre, c'est une
 * SAILLIE FRANCHE ET RÉGULIÈRE (six à cinquante centimètres) qui part du
 * haut de la baie, haute d'au moins dix centimètres, et qui NE SE PROLONGE
 * PAS sur le mur voisin : là, ce serait une retombée de plafond. Le natif
 * mesure donc aussi une bande témoin, à côté de la baie.
 */
import type { WallSeg } from './floorplan';

/** Ce que le natif mesure au-dessus d'une baie (voir `profilsAuDessus`). */
export interface ProfilDessus {
  /** Hauteur d'une tranche (m). */
  pas: number;
  /** Bas de la première tranche, compté depuis le HAUT de la baie (m). */
  depuis: number;
  /** Écart médian au plan du mur, par tranche (cm ; + vers la pièce). */
  ecarts: number[];
  /** Points du maillage par tranche. */
  nombres: number[];
  /** La même mesure sur le mur, à côté de la baie. */
  temoin?: number[];
  nombresTemoin?: number[];
  /** Le côté de la pièce était-il connu ? Sinon, l'écart vaut en absolu. */
  oriente?: boolean;
}

export interface CoffreLu {
  /** Hauteur du coffre (m). */
  hauteur: number;
  /** Ce qu'il avance dans la pièce (m). */
  saillie: number;
  /** Où il commence, au-dessus du haut de la baie (m). */
  bas: number;
  /**
   * Entre le haut de la baie et le coffre, le maillage est EN RETRAIT du
   * mur : c'est encore la baie (un tablier à demi descendu l'a rabotée).
   */
  baieDessous: boolean;
}

/** Points du maillage qu'il faut dans une tranche pour la croire. */
const POINTS_MIN = 6;
const POINTS_MIN_TEMOIN = 4;
/** La saillie d'un coffre (cm). */
const SAILLIE_MIN = 6;
const SAILLIE_MAX = 50;
/** Sa hauteur (m) : un tunnel courant fait 20 à 35 cm. */
const HAUTEUR_MIN = 0.1;
const HAUTEUR_MAX = 0.6;
/**
 * Où il peut commencer, au-dessus du haut que RoomPlan donne à la baie (m).
 * Jusqu'à 45 cm : un tablier à demi descendu fait cadrer la baie dessous.
 */
const BAS_MIN = -0.1;
const BAS_MAX = 0.45;

const mediane = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function coffreDuProfil(p: ProfilDessus): CoffreLu | null {
  const n = Math.min(p.ecarts.length, p.nombres.length);
  const ecart = (i: number) => (p.oriente === false ? Math.abs(p.ecarts[i]) : p.ecarts[i]);
  const mesure = (i: number) => (p.nombres[i] ?? 0) >= POINTS_MIN;
  const saillant = (i: number) => mesure(i) && ecart(i) >= SAILLIE_MIN && ecart(i) <= SAILLIE_MAX;

  let i = 0;
  while (i < n) {
    if (!saillant(i)) {
      i++;
      continue;
    }
    // La course de la saillie ; un trou d'une tranche ne la coupe pas.
    let fin = i;
    let k = i + 1;
    while (k < n) {
      if (saillant(k)) {
        fin = k;
        k++;
      } else if (k + 1 < n && saillant(k + 1)) {
        k++;
      } else break;
    }
    const debut = i;
    i = fin + 1;

    const bas = p.depuis + debut * p.pas;
    const hauteur = (fin - debut + 1) * p.pas;
    if (bas < BAS_MIN - 1e-9 || bas > BAS_MAX + 1e-9) continue;
    if (hauteur < HAUTEUR_MIN - 1e-9 || hauteur > HAUTEUR_MAX + 1e-9) continue;

    // Une face régulière : la plupart des tranches tout près de la médiane.
    const vus: number[] = [];
    for (let t = debut; t <= fin; t++) if (saillant(t)) vus.push(ecart(t));
    const saillie = mediane(vus);
    if (vus.filter((e) => Math.abs(e - saillie) <= 5).length < vus.length * 0.7) continue;

    // Le témoin : la même saillie le long du mur voisin, c'est une retombée.
    if (p.temoin && p.nombresTemoin) {
      let lus = 0;
      let saillants = 0;
      for (let t = debut; t <= fin; t++) {
        if ((p.nombresTemoin[t] ?? 0) < POINTS_MIN_TEMOIN) continue;
        lus++;
        const e = p.oriente === false ? Math.abs(p.temoin[t]) : p.temoin[t];
        if (e >= SAILLIE_MIN) saillants++;
      }
      if (lus >= 3 && saillants >= lus * 0.5) continue;
    }

    // Sous le coffre, jusqu'au haut de la baie : encore la baie, en retrait ?
    const dessous: number[] = [];
    for (let t = 0; t < debut; t++) {
      const v = p.depuis + (t + 0.5) * p.pas;
      if (v > 0 && mesure(t)) dessous.push(ecart(t));
    }
    const baieDessous =
      bas >= 0.08 && dessous.length >= 3 && dessous.filter((e) => e <= -2).length >= dessous.length * 0.7;

    return { hauteur, saillie: saillie / 100, bas, baieDessous };
  }
  return null;
}

const auCentimetre = (m: number) => Math.round(m * 100) / 100;

/**
 * LE COFFRE TROUVÉ SE POSE SUR SA BAIE — sa hauteur (`coffre`, la même que
 * celle qu'on déclare à la main : l'élévation, le dossier et le contrôle la
 * lisent déjà) et sa saillie (`coffreSaillie`, qui le dessine en volume).
 * Un coffre déjà déclaré garde sa hauteur. Si la baie avait été cadrée sous
 * un tablier, elle remonte jusque sous le coffre.
 */
export function avecCoffresDuLidar(
  segments: WallSeg[],
  dessus: Record<string, ProfilDessus> | undefined,
): WallSeg[] {
  if (!dessus) return segments;
  return segments.map((s) => {
    if (s.type === 'wall') return s;
    const p = dessus[s.id];
    if (!p) return s;
    const c = coffreDuProfil(p);
    if (!c) return s;
    const remonte = c.baieDessous ? auCentimetre(c.bas) : 0;
    return {
      ...s,
      height: s.height + remonte,
      yCenter: s.yCenter + remonte / 2,
      coffre: s.coffre ?? auCentimetre(c.hauteur),
      coffreSaillie: auCentimetre(c.saillie),
    };
  });
}
