/**
 * LE MUR SE TOUCHE SUR TOUTE SON ÉPAISSEUR DESSINÉE.
 *
 * Relevé du patron : « la sélection d'un mur au doigt est parfois compliquée,
 * on doit cliquer sur la partie intérieure de la largeur du mur ; fais en
 * sorte de sélectionner même si on clique sur l'extérieur du même mur ».
 *
 * Le poché dessine un mur de FAÇADE plus épais vers le dehors
 * (`SUREPAISSEUR_FACADE`) — c'est la convention du plan d'architecte. Mais
 * la cible du doigt suivait l'épaisseur RÉELLE, centrée sur l'axe : toute la
 * part extérieure du trait noir ne répondait pas. On lui ajoute donc une
 * cible, du côté du dehors seulement — côté pièce, la cible ne grandit pas :
 * elle volerait l'appui d'un meuble plaqué contre le mur.
 */
import { pointInPolygon } from './appearance';
import { epaisseurDe, type Pt, type RoomPart, type WallSeg } from './floorplan';
import { SUREPAISSEUR_FACADE } from './poche';

/**
 * Le côté du DEHORS de chaque mur de façade : +1 du côté de `perpOf(u)`,
 * −1 de l'autre. Un mur qui borde deux pièces (un refend) n'en a pas.
 */
export function cotesExterieurs(walls: WallSeg[], parts: RoomPart[]): Map<string, 1 | -1> {
  const contours = parts.map((p) => p.surface?.pts).filter((c): c is Pt[] => !!c && c.length >= 3);
  const out = new Map<string, 1 | -1>();
  if (contours.length === 0) return out;
  for (const w of walls) {
    if (w.type !== 'wall') continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    if (L < 0.05) continue;
    const n = { x: -(w.b.z - w.a.z) / L, z: (w.b.x - w.a.x) / L };
    const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    const ecart = epaisseurDe(w) / 2 + 0.15;
    const dehors = (s: 1 | -1) => !contours.some((c) => pointInPolygon({ x: m.x + n.x * s * ecart, z: m.z + n.z * s * ecart }, c));
    const plus = dehors(1);
    const moins = dehors(-1);
    if (plus && !moins) out.set(w.id, 1);
    else if (moins && !plus) out.set(w.id, -1);
  }
  return out;
}

/**
 * La cible de la surépaisseur de façade : un quadrilatère, du nu extérieur
 * du mur jusqu'au bord du poché (et un peu au-delà, pour le doigt), qui
 * déborde aux deux bouts comme les angles saillants du poché.
 */
export function cibleDeFacade(
  w: WallSeg,
  cote: 1 | -1,
  marge = 0.04,
  /** Du trait au nu extérieur : une demi-épaisseur, ou toute pour un mur relevé d'un côté. */
  dedans = epaisseurDe(w) / 2,
): Pt[] {
  const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
  const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
  const n = { x: -u.z * cote, z: u.x * cote };
  const dehors = dedans + SUREPAISSEUR_FACADE + marge;
  const bout = SUREPAISSEUR_FACADE;
  const a = { x: w.a.x - u.x * bout, z: w.a.z - u.z * bout };
  const b = { x: w.b.x + u.x * bout, z: w.b.z + u.z * bout };
  return [
    { x: a.x + n.x * dedans, z: a.z + n.z * dedans },
    { x: b.x + n.x * dedans, z: b.z + n.z * dedans },
    { x: b.x + n.x * dehors, z: b.z + n.z * dehors },
    { x: a.x + n.x * dehors, z: a.z + n.z * dehors },
  ];
}
