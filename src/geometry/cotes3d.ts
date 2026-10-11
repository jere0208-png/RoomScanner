/**
 * LES COTES DE LA PERSPECTIVE, À LA FAÇON D'UN ARCHITECTE.
 *
 * Relevé du patron : « rends les cotes 3D plus professionnelles, sans gêner
 * le plan avec les délimitations et sans gros bloc blanc arrière ; un rendu
 * clean et compréhensible ».
 *
 * La perspective posait un cartouche blanc « 3,00 m » au milieu du faîte de
 * CHAQUE mur, cloisons comprises : une vingtaine de pavés blancs sur le
 * modèle, qui cachaient ce qu'ils cotaient. Un dessinateur fait l'inverse :
 *
 *   — il ne cote que l'ENVELOPPE, à l'extérieur du volume — les cloisons se
 *     lisent sur le plan coté, qui est fait pour ça ;
 *   — la ligne de cote court PARALLÈLE à la façade, à quelques dizaines de
 *     centimètres d'elle ; deux lignes de rappel fines la relient au nu du
 *     mur ; le chiffre se pose sur la ligne, sans fond ;
 *   — les façades qui font face à l'œil se cotent AU SOL, devant elles ; les
 *     autres AU FAÎTE, derrière : les deux restent hors du volume à l'écran ;
 *   — la hauteur se cote une fois, sur l'angle extrême du volume à
 *     l'écran (à gauche ou à droite, au choix de l'appelant) : là, sa ligne
 *     verticale court hors du dessin.
 *
 * Ce module ne dessine rien : il rend des segments dans le repère de la
 * scène (sol à y = 0). Le dossier PDF et la 3D de l'app les tracent chacun
 * avec leurs moyens.
 */
import { pointInPolygon } from './appearance';
import { epaisseurDe, segLength, type Pt, type RoomPart, type WallSeg } from './floorplan';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface Cote3D {
  /** La ligne de cote, de bout en bout. */
  a: P3;
  b: P3;
  /** Les lignes de rappel, du nu du mur à un peu au-delà de la ligne de cote. */
  rappels: [P3, P3][];
  /** Le chiffre, en mètres, à la française. */
  texte: string;
  genre: 'longueur' | 'hauteur';
}

/** La ligne de cote se tient à cette distance du nu du mur (m). */
export const ECART_DE_COTE = 0.45;
/** Plus court, un mur ne se cote pas sur la perspective : le chiffre ne tiendrait pas. */
const COTE_MIN = 0.3;

const enMetres = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;

/**
 * Les cotes de l'enveloppe. `vers` est la direction de l'œil projetée au
 * sol (elle dit quelles façades nous font face) ; `ecart`, la distance de
 * la ligne de cote au nu du mur.
 */
export function cotesExterieures(
  walls: WallSeg[],
  parts: Pick<RoomPart, 'surface'>[],
  vers: { x: number; z: number },
  ecart = ECART_DE_COTE,
  /** De quel côté de l'écran coter la hauteur. */
  coteHauteur: 'gauche' | 'droite' = 'droite',
): Cote3D[] {
  const contours = parts.map((p) => p.surface?.pts ?? []).filter((c) => c.length >= 3);
  if (contours.length === 0) return [];
  const dedans = (p: Pt) => contours.some((c) => pointInPolygon(p, c));
  const cotes: Cote3D[] = [];
  /** Les bouts des façades, pour l'angle de la hauteur. */
  const bouts: { p: Pt; dehors: Pt; nu: number; hauteur: number }[] = [];

  for (const w of walls) {
    if (w.type && w.type !== 'wall') continue;
    const L = segLength(w);
    if (L < COTE_MIN) continue;
    const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
    const n = { x: -u.z, z: u.x };
    const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    const nu = epaisseurDe(w) / 2;
    const sonde = nu + 0.2;
    const d1 = dedans({ x: m.x + n.x * sonde, z: m.z + n.z * sonde });
    const d2 = dedans({ x: m.x - n.x * sonde, z: m.z - n.z * sonde });
    // Une cloison (des pièces des deux côtés) ou un mur isolé : pas de cote ici.
    if (d1 === d2) continue;
    const dehors = d1 ? { x: -n.x, z: -n.z } : n;
    const face = dehors.x * vers.x + dehors.z * vers.z > 0;
    const y = face ? 0 : w.height;
    const loin = nu + ecart;
    const ici = (p: Pt, k: number): P3 => ({ x: p.x + dehors.x * k, y, z: p.z + dehors.z * k });
    cotes.push({
      a: ici(w.a, loin),
      b: ici(w.b, loin),
      rappels: [
        [ici(w.a, nu + 0.06), ici(w.a, loin + 0.12)],
        [ici(w.b, nu + 0.06), ici(w.b, loin + 0.12)],
      ],
      texte: enMetres(L),
      genre: 'longueur',
    });
    bouts.push({ p: w.a, dehors, nu, hauteur: w.height });
    bouts.push({ p: w.b, dehors, nu, hauteur: w.height });
  }

  /*
    LA HAUTEUR, UNE FOIS, SUR L'ANGLE EXTRÊME DU VOLUME À L'ÉCRAN — à
    l'aplomb du coin, écartée selon la bissectrice des deux façades qui s'y
    rencontrent. Sur l'angle le plus proche de l'œil, sa ligne verticale
    tombait devant le volume ; sur le bord, elle court hors du dessin.
  */
  if (bouts.length > 0) {
    // La droite de l'écran, au sol : perpendiculaire à l'œil.
    const sens = coteHauteur === 'droite' ? 1 : -1;
    const ecran = (p: Pt) => sens * (p.x * vers.z - p.z * vers.x);
    const coin = bouts.reduce((best, x) => (ecran(x.p) > ecran(best.p) ? x : best));
    const voisins = bouts.filter((x) => Math.hypot(x.p.x - coin.p.x, x.p.z - coin.p.z) < 0.05);
    const somme = voisins.reduce((s, x) => ({ x: s.x + x.dehors.x, z: s.z + x.dehors.z }), { x: 0, z: 0 });
    const l = Math.hypot(somme.x, somme.z) || 1;
    const bis = { x: somme.x / l, z: somme.z / l };
    const h = Math.max(...voisins.map((x) => x.hauteur));
    const loin = coin.nu + ecart;
    const ici = (k: number, y: number): P3 => ({ x: coin.p.x + bis.x * k, y, z: coin.p.z + bis.z * k });
    cotes.push({
      a: ici(loin, 0),
      b: ici(loin, h),
      rappels: [
        [ici(coin.nu + 0.06, 0), ici(loin + 0.12, 0)],
        [ici(coin.nu + 0.06, h), ici(loin + 0.12, h)],
      ],
      texte: enMetres(h),
      genre: 'hauteur',
    });
  }
  return cotes;
}
