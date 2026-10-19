/**
 * ALIGNER ET RÉPARTIR PLUSIEURS MEUBLES — manque proposé par l'agent
 * testeur MEUBLES : « aligner ou répartir plusieurs meubles d'un coup ».
 *
 * Tout se raisonne DANS LES AXES DE L'ÉCRAN : le plan peut être tourné
 * (`rot`), et « aligner à gauche » doit vouloir dire la gauche qu'on voit,
 * pas celle du repère du scan. Le passage se fait comme pour les flèches et
 * « Placer » : x_écran = x·cos r − z·sin r, y_écran = x·sin r + z·cos r.
 *
 * Ces fonctions ne disent que OÙ chaque meuble doit aller ; c'est le magasin
 * qui les y range (hors des murs, hors des voisins : `rangerMeuble`).
 */
import type { ObjectData } from 'react-native-room-scan';

/**
 * UN MEUBLE VERROUILLÉ — manque proposé par l'agent testeur MEUBLES :
 * « verrouiller un meuble contre les déplacements accidentels ». Le champ
 * `verrou` est facultatif sur le meuble enregistré : absent, il est libre,
 * comme tous les plans d'avant.
 */
export type MeubleVerrouillable = ObjectData & { verrou?: boolean };
export const estVerrouille = (o: ObjectData | null | undefined): boolean => !!(o as MeubleVerrouillable | null | undefined)?.verrou;

export type ModeDAlignement = 'gauche' | 'droite' | 'haut' | 'bas' | 'verticale' | 'horizontale';
export type AxeDeRepartition = 'horizontal' | 'vertical';

interface Emprise {
  id: string;
  /** Centre à l'écran (mêmes unités que le plan : mètres, axes tournés). */
  sx: number;
  sy: number;
  /** Demi-étendues à l'écran, le meuble tourné compris. */
  hx: number;
  hy: number;
  verrou: boolean;
}

function empriseALEcran(o: ObjectData, rot: number): Emprise {
  const t = o.transform;
  const yaw = Math.atan2(t[2], t[0]);
  const a = yaw + rot;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  return {
    id: o.id,
    sx: t[12] * cs - t[14] * sn,
    sy: t[12] * sn + t[14] * cs,
    hx: Math.abs((o.width / 2) * Math.cos(a)) + Math.abs((o.depth / 2) * Math.sin(a)),
    hy: Math.abs((o.width / 2) * Math.sin(a)) + Math.abs((o.depth / 2) * Math.cos(a)),
    verrou: estVerrouille(o),
  };
}

/** Un déplacement à l'écran, ramené dans le repère du plan. */
function versLePlan(dsx: number, dsy: number, rot: number): { dx: number; dz: number } {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  return { dx: dsx * cs + dsy * sn, dz: -dsx * sn + dsy * cs };
}

function cibles(
  meubles: ObjectData[],
  emprises: Emprise[],
  rot: number,
  deplacement: (e: Emprise) => { dsx: number; dsy: number } | null,
): Map<string, { x: number; z: number }> {
  const out = new Map<string, { x: number; z: number }>();
  for (const e of emprises) {
    if (e.verrou) continue;
    const d = deplacement(e);
    if (!d || (Math.abs(d.dsx) < 1e-6 && Math.abs(d.dsy) < 1e-6)) continue;
    const o = meubles.find((m) => m.id === e.id)!;
    const v = versLePlan(d.dsx, d.dsy, rot);
    out.set(e.id, { x: o.transform[12] + v.dx, z: o.transform[14] + v.dz });
  }
  return out;
}

/**
 * Où va chaque meuble pour s'aligner. UN MEUBLE VERROUILLÉ SERT D'ANCRE : il
 * ne bouge pas, et c'est sur lui (sur eux) que les autres s'alignent. Sans
 * verrou, la référence est le meuble le plus à gauche (le plus haut…), ou le
 * milieu de l'ensemble pour un centrage.
 */
export function cibleDAlignement(
  meubles: ObjectData[],
  mode: ModeDAlignement,
  rot: number,
): Map<string, { x: number; z: number }> {
  if (meubles.length < 2) return new Map();
  const emprises = meubles.map((o) => empriseALEcran(o, rot));
  const ancres = emprises.some((e) => e.verrou) ? emprises.filter((e) => e.verrou) : emprises;
  const min = (f: (e: Emprise) => number) => Math.min(...ancres.map(f));
  const max = (f: (e: Emprise) => number) => Math.max(...ancres.map(f));
  switch (mode) {
    case 'gauche': {
      const g = min((e) => e.sx - e.hx);
      return cibles(meubles, emprises, rot, (e) => ({ dsx: g - (e.sx - e.hx), dsy: 0 }));
    }
    case 'droite': {
      const d = max((e) => e.sx + e.hx);
      return cibles(meubles, emprises, rot, (e) => ({ dsx: d - (e.sx + e.hx), dsy: 0 }));
    }
    case 'haut': {
      const h = min((e) => e.sy - e.hy);
      return cibles(meubles, emprises, rot, (e) => ({ dsx: 0, dsy: h - (e.sy - e.hy) }));
    }
    case 'bas': {
      const b = max((e) => e.sy + e.hy);
      return cibles(meubles, emprises, rot, (e) => ({ dsx: 0, dsy: b - (e.sy + e.hy) }));
    }
    case 'verticale': {
      // Les centres sur une même verticale : au milieu de l'ensemble (des ancres).
      const m = (min((e) => e.sx - e.hx) + max((e) => e.sx + e.hx)) / 2;
      return cibles(meubles, emprises, rot, (e) => ({ dsx: m - e.sx, dsy: 0 }));
    }
    case 'horizontale': {
      const m = (min((e) => e.sy - e.hy) + max((e) => e.sy + e.hy)) / 2;
      return cibles(meubles, emprises, rot, (e) => ({ dsx: 0, dsy: m - e.sy }));
    }
  }
}

/**
 * RÉPARTIR À INTERVALLES ÉGAUX — trois meubles au moins. Les deux extrêmes
 * restent où ils sont ; ceux du milieu se placent pour que les JOURS entre
 * deux meubles voisins soient égaux (pas leurs centres : une table et une
 * chaise ne font pas la même largeur). Un meuble verrouillé garde sa place.
 */
export function cibleDeRepartition(
  meubles: ObjectData[],
  axe: AxeDeRepartition,
  rot: number,
): Map<string, { x: number; z: number }> {
  if (meubles.length < 3) return new Map();
  const horizontal = axe === 'horizontal';
  const c = (e: Emprise) => (horizontal ? e.sx : e.sy);
  const h = (e: Emprise) => (horizontal ? e.hx : e.hy);
  const emprises = meubles.map((o) => empriseALEcran(o, rot)).sort((a, b) => c(a) - c(b));
  const debut = c(emprises[0]) - h(emprises[0]);
  const fin = c(emprises[emprises.length - 1]) + h(emprises[emprises.length - 1]);
  const tailles = emprises.reduce((s, e) => s + 2 * h(e), 0);
  const jour = (fin - debut - tailles) / (emprises.length - 1);
  const voulu = new Map<string, number>();
  let x = debut;
  for (const e of emprises) {
    voulu.set(e.id, x + h(e));
    x += 2 * h(e) + jour;
  }
  return cibles(meubles, emprises.slice(1, -1), rot, (e) => {
    const d = voulu.get(e.id)! - c(e);
    return horizontal ? { dsx: d, dsy: 0 } : { dsx: 0, dsy: d };
  });
}
