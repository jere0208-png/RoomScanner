/**
 * LES SIÈGES REGARDENT LA PIÈCE — pas le mur.
 *
 * Relevé du patron : « parfois les fauteuils sont captés mais tournés vers le
 * mur sans logique ; il faut manuellement les tourner tout le temps ».
 *
 * RoomPlan rend une boîte et un angle, et pour un siège cet angle vaut aussi
 * bien θ que θ + 180° : rien dans un nuage de points ne dit sûrement où est
 * le dossier. Le garde-fou du rendu (`faceIntoRoom`) ne retournait qu'un
 * meuble COLLÉ au mur ; un fauteuil à trente centimètres de la cloison, le
 * nez dedans, restait ainsi — et revenait ainsi à chaque scan.
 *
 * On tranche donc à la fin du scan, une fois pour toutes, et seulement par
 * demi-tour (un quart de tour échangerait largeur et profondeur) :
 *
 *   — ADOSSÉ À UN MUR, il regarde déjà la pièce : on n'y touche pas ;
 *   — LE NEZ CONTRE UN MUR proche, avec la place dans son dos : demi-tour ;
 *   — ATTABLÉ (sa table juste devant), il a raison, même le nez au mur : une
 *     chaise glissée sous un bureau contre la cloison ne bouge pas ;
 *   — sinon, ce qu'on regarde dans la pièce DÉCIDE : la télé ou la table
 *     basse pour un canapé ou un fauteuil, la table ou le bureau pour une
 *     chaise — le siège qui lui tourne le dos fait demi-tour.
 *
 * L'avant d'un meuble est son côté −z local, comme partout dans l'app
 * (`furnitureParts`, `modeles3d`).
 */
import type { ObjectData } from 'react-native-room-scan';
import type { Pt, WallSeg } from './floorplan';

const SIEGE = /chair|sofa|couch|armchair/i;
const ECRAN = /television|\btv\b/i;
const PLAN = /table|desk/i;

/** Jusqu'où un rayon parti de `p` dans la direction `d` va avant de toucher un mur. */
function distanceAuMur(p: Pt, d: Pt, walls: readonly WallSeg[]): number {
  let best = Infinity;
  for (const w of walls) {
    if (w.type !== 'wall') continue;
    const ex = w.b.x - w.a.x;
    const ez = w.b.z - w.a.z;
    const det = d.x * -ez - d.z * -ex;
    if (Math.abs(det) < 1e-9) continue;
    const ax = w.a.x - p.x;
    const az = w.a.z - p.z;
    // p + t·d = a + s·e
    const t = (ax * -ez - az * -ex) / det;
    const s = (d.x * az - d.z * ax) / det;
    if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return best;
}

/** Le même meuble, retourné d'un demi-tour sur place. */
function demiTour<O extends ObjectData>(o: O): O {
  const m = [...o.transform];
  for (const k of [0, 1, 2, 8, 9, 10]) m[k] = -m[k];
  return { ...o, transform: m };
}

export function orienterLesSieges<O extends ObjectData>(
  objects: O[],
  walls: readonly WallSeg[],
): O[] {
  if (walls.length === 0) return objects;
  return objects.map(o => {
    const cat = o.category ?? '';
    if (!SIEGE.test(cat)) return o;
    const t = o.transform;
    const p = { x: t[12], z: t[14] };
    const l = Math.hypot(t[8], t[10]) || 1;
    const avant = { x: -t[8] / l, z: -t[10] / l };
    const arriere = { x: -avant.x, z: -avant.z };
    const demi = (o.depth ?? 0.8) / 2;
    // Ce que ce siège regarde d'ordinaire, le plus proche dans sa pièce.
    const canape = /sofa|couch|armchair/i.test(cat);
    let foyer: { x: number; z: number; d: number } | null = null;
    for (const f of objects) {
      if (f === o || (o.roomId && f.roomId && f.roomId !== o.roomId)) continue;
      const fc = f.category ?? '';
      // Un canapé regarde la télé ou la table basse ; une chaise, sa table.
      const basse = PLAN.test(fc) && (f.height ?? 1) < 0.55;
      if (!(canape ? ECRAN.test(fc) || basse : PLAN.test(fc) && !basse))
        continue;
      const d = Math.hypot(f.transform[12] - p.x, f.transform[14] - p.z);
      if (d > 0.2 && d < 5 && (!foyer || d < foyer.d))
        foyer = { x: f.transform[12], z: f.transform[14], d };
    }
    const versFoyer = foyer
      ? ((foyer.x - p.x) * avant.x + (foyer.z - p.z) * avant.z) / foyer.d
      : 0;
    // Attablé : la table est juste devant — on n'y touche pas, mur ou pas.
    if (foyer && foyer.d < 1.5 && versFoyer > 0.3) return o;
    const dAvant = distanceAuMur(p, avant, walls);
    const dArriere = distanceAuMur(p, arriere, walls);
    // Adossé : son dos touche presque le mur — il regarde déjà la pièce.
    if (dArriere <= demi + 0.3) return o;
    // Le nez contre un mur proche, la place dans son dos : demi-tour.
    if (dAvant <= demi + 0.6 && dArriere > dAvant + 0.3) return demiTour(o);
    // Sinon, il tourne le dos à ce qu'il devrait regarder : demi-tour.
    if (foyer && versFoyer < -0.3) return demiTour(o);
    return o;
  });
}
