/**
 * Volumes de la salle d'eau.
 *
 * C'est le seul endroit de la norme où une erreur est DANGEREUSE et non
 * gênante : une prise à 40 cm d'une baignoire, personne ne la remarque sur
 * un plan, et elle tue. L'app doit donc la signaler — ou se taire
 * franchement, mais elle ne peut pas faire semblant de vérifier.
 *
 * Le découpage de la NF C 15-100 (édition 2015 et suivantes), simplifié à ce
 * qu'un plan permet honnêtement de dire :
 *
 * - **volume 0** — l'intérieur de la baignoire ou du receveur. Rien, sauf
 *   du TBTS 12 V IPX7 ;
 * - **volume 1** — au-dessus du volume 0, jusqu'à 2,25 m. Ni socle, ni
 *   commande ; éclairage TBTS ou IPX4 classe II, chauffe-eau admis sous
 *   conditions ;
 * - **volume 2** — 60 cm autour du volume 1, jusqu'à 2,25 m. IPX4 exigé ;
 *   socle interdit sauf rasoir sur transformateur de séparation ;
 * - **hors volume** — l'appareillage ordinaire, à condition que la pièce
 *   soit protégée en 30 mA et raccordée à la liaison équipotentielle
 *   supplémentaire.
 *
 * Ce que ce module NE FAIT PAS, et qu'il faut savoir : il ne connaît ni les
 * parois fixes (qui rabattent les volumes), ni la hauteur réelle d'une
 * douche à l'italienne, ni les indices IP du matériel choisi. Il situe un
 * appareil dans un volume ; il ne délivre pas une attestation.
 */
import type { Pt } from './floorplan';

export type Volume = 0 | 1 | 2;

/** Hauteur haute des volumes 1 et 2, en mètres. */
export const VOLUME_HAUT = 2.25;
/** Débord horizontal du volume 2 autour du volume 1. */
export const VOLUME2_DEBORD = 0.6;

export interface WetZone {
  /** Emprise au sol de la baignoire ou du receveur. */
  pts: Pt[];
  /** Hauteur du bord : au-dessus, on quitte le volume 0. */
  rim: number;
  kind: 'bathtub' | 'shower';
}

/** Meubles qui créent des volumes : baignoire et douche, rien d'autre. */
const MOUILLE = /bathtub|shower/i;

/**
 * Les zones humides d'une pièce, d'après le mobilier posé.
 *
 * Sans baignoire ni douche relevée, il n'y a pas de volume à calculer — et
 * l'app doit le dire plutôt que de rassurer à tort.
 */
export function wetZones(
  objects: {
    category?: string;
    width: number;
    depth: number;
    height: number;
    transform: number[];
  }[],
): WetZone[] {
  const out: WetZone[] = [];
  for (const o of objects) {
    const cat = o.category ?? '';
    if (!MOUILLE.test(cat)) continue;
    const cx = o.transform[12];
    const cz = o.transform[14];
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const pts = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sz]) => {
      const lx = (sx * o.width) / 2;
      const lz = (sz * o.depth) / 2;
      return { x: cx + lx * cos - lz * sin, z: cz + lx * sin + lz * cos };
    });
    out.push({
      pts,
      rim: Math.max(0.1, o.transform[13] + o.height / 2),
      kind: /shower/i.test(cat) ? 'shower' : 'bathtub',
    });
  }
  return out;
}

/** Distance d'un point à un polygone : 0 s'il est dedans. */
function distToZone(p: Pt, pts: Pt[]): number {
  let dedans = false;
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    ) {
      dedans = !dedans;
    }
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2));
    best = Math.min(
      best,
      Math.hypot(p.x - (a.x + ex * t), p.z - (a.z + ez * t)),
    );
  }
  return dedans ? 0 : best;
}

/**
 * Dans quel volume tombe un point, à une hauteur donnée.
 *
 * `null` = hors volume. Un appareil au-dessus de 2,25 m sort des volumes 1
 * et 2 — mais pas de l'aplomb de la baignoire, où la norme reste stricte :
 * on le laisse en volume 1, c'est le sens de la règle.
 */
export function volumeAt(
  p: Pt,
  height: number,
  zones: WetZone[],
): Volume | null {
  let pire: Volume | null = null;
  for (const z of zones) {
    const d = distToZone(p, z.pts);
    let v: Volume | null = null;
    if (d < 1e-6) v = height <= z.rim ? 0 : 1;
    else if (d <= VOLUME2_DEBORD + 1e-9 && height <= VOLUME_HAUT) v = 2;
    if (v === null) continue;
    if (pire === null || v < pire) pire = v;
  }
  return pire;
}

/** Ce que la norme permet, appareil par appareil. */
export interface VolumeVerdict {
  volume: Volume;
  /** `false` = interdit dans ce volume, quel que soit le matériel. */
  allowed: boolean;
  /** Ce qu'il faut respecter quand c'est permis. */
  regle: string;
}

/** Familles d'appareillage, du point de vue des volumes. */
const SOCLE = /^prise/;
const COMMANDE = /^(inter|va|poussoir|variateur)/;
const LUMIERE = /^applique/;

export function volumeVerdict(
  kind: string,
  volume: Volume,
): VolumeVerdict {
  if (volume === 0) {
    return {
      volume,
      allowed: false,
      regle:
        'Volume 0 (intérieur de la baignoire ou du receveur) : aucun ' +
        'appareillage, hors TBTS 12 V IPX7.',
    };
  }
  if (SOCLE.test(kind)) {
    return {
      volume,
      allowed: false,
      regle:
        volume === 1
          ? 'Volume 1 : socle de prise interdit.'
          : 'Volume 2 : socle interdit, sauf rasoir sur transformateur de ' +
            'séparation.',
    };
  }
  if (COMMANDE.test(kind)) {
    return {
      volume,
      allowed: volume === 2,
      regle:
        volume === 1
          ? 'Volume 1 : organe de commande interdit ; l’interrupteur se ' +
            'place hors volume, ou en TBTS 12 V.'
          : 'Volume 2 : commande admise en IPX4, classe II.',
    };
  }
  if (LUMIERE.test(kind)) {
    return {
      volume,
      allowed: true,
      regle:
        volume === 1
          ? 'Volume 1 : luminaire TBTS 12 V, ou IPX4 classe II.'
          : 'Volume 2 : luminaire IPX4, classe II.',
    };
  }
  return {
    volume,
    allowed: volume === 2,
    regle:
      volume === 1
        ? 'Volume 1 : seul le matériel prévu pour y être installé est admis ' +
          '(chauffe-eau sous conditions).'
        : 'Volume 2 : matériel IPX4 au minimum.',
  };
}
