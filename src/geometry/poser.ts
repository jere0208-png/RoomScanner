/**
 * POSER UN MEUBLE À LA MAIN — le doigt commande, le mur refuse.
 *
 * Relevé du patron : « on doit pouvoir les placer n'importe où, même
 * traverser les murs, mais impossible à placer SUR un mur (meuble rouge au
 * placement si impossible), et une légère attraction contre les murs (sans
 * les toucher), et pas de bouton valider ».
 *
 * C'EST L'INVERSE DE CE QUE FAISAIT L'APPLICATION. Le meuble était contraint
 * à chaque image : rabattu hors des murs, retourné pour entrer dans une
 * niche, raboté pour tenir dans un recoin. Le doigt proposait, la géométrie
 * disposait — et l'on se battait avec un meuble qui glissait tout seul, sans
 * jamais comprendre pourquoi.
 *
 * La règle du patron est plus simple et plus juste : LE DOIGT COMMANDE. Le
 * meuble suit exactement, y compris à travers les murs — on traverse une
 * cloison pour aller dans la pièce d'à côté, c'est le geste naturel de qui
 * déménage une commode. Ce qui est refusé, c'est de LÂCHER dans la
 * maçonnerie.
 */
import { WALL_T, type Pt, type WallSeg } from './floorplan';

/**
 * PORTÉE DE L'AIMANT, en mètres depuis le nu du mur.
 *
 * Vingt-cinq centimètres : une commode lâchée à cette distance n'a pas été
 * posée là exprès — c'est un doigt qui n'a pas visé juste, et personne ne
 * laisse volontairement un jeu de vingt centimètres derrière un meuble. Au
 * large, en revanche, on ne touche à rien : un îlot de cuisine est au milieu
 * de la pièce parce que quelqu'un l'y a mis.
 */
export const PORTEE_AIMANT = 0.25;

/** Ce qu'on sait d'un meuble pour le poser : son emprise et son cap. */
export interface EmpriseMeuble {
  width: number;
  depth: number;
  yaw: number;
}

/** Les quatre coins de l'emprise, dans le repère du plan. */
function coins(centre: Pt, m: EmpriseMeuble): Pt[] {
  const cos = Math.cos(m.yaw);
  const sin = Math.sin(m.yaw);
  return [
    [-m.width / 2, -m.depth / 2],
    [m.width / 2, -m.depth / 2],
    [m.width / 2, m.depth / 2],
    [-m.width / 2, m.depth / 2],
  ].map(([lx, lz]) => ({
    x: centre.x + lx * cos - lz * sin,
    z: centre.z + lx * sin + lz * cos,
  }));
}

/**
 * La distance SIGNÉE d'un point à l'axe d'un mur, et sa position le long.
 *
 * Le signe dit de quel côté l'on se trouve : c'est lui qui permet de savoir
 * si le meuble chevauche la maçonnerie ou s'il est franchement d'un bord.
 */
function versLeMur(p: Pt, w: WallSeg) {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const d = (p.x - w.a.x) * nx + (p.z - w.a.z) * nz;
  const t = ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / (len * len);
  return { d, t, nx, nz, len };
}

/** Le résultat d'une pose : où le meuble va, et ce qu'il faut en dire. */
export interface PoseMeuble {
  centre: Pt;
  /** `false` = il chevauche la maçonnerie ; l'écran le montre en ROUGE. */
  valide: boolean;
  /** L'aimant a joué : la main doit le sentir, l'œil aussi. */
  aimante: boolean;
}

/**
 * Où poser le meuble que le doigt amène à `vise`.
 *
 * On ne DÉPLACE jamais le meuble contre la volonté du doigt, sauf d'un
 * cheveu : l'aimant, et lui seul, a le droit de corriger — et seulement pour
 * amener AU NU d'un mur ce qui en est tout près.
 */
export function poserLibre(
  vise: Pt,
  meuble: EmpriseMeuble,
  murs: WallSeg[],
): PoseMeuble {
  const demi = WALL_T / 2;
  /** Le mur le plus proche que le meuble longe, et de combien il en est. */
  let meilleur: { jeu: number; w: WallSeg; signe: number } | null = null;
  let dansLeMur = false;

  for (const w of murs) {
    if (w.type !== 'wall') continue;
    const cs = coins(vise, meuble);
    const infos = cs.map((p) => versLeMur(p, w));
    // Le meuble ne concerne que les murs qu'il LONGE : au-delà des bouts,
    // un mur bien orienté attraperait un meuble posé trois mètres plus loin.
    const ts = infos.map((i) => i.t);
    if (Math.max(...ts) < -0.05 || Math.min(...ts) > 1.05) continue;
    const ds = infos.map((i) => i.d);
    const min = Math.min(...ds);
    const max = Math.max(...ds);
    /*
      CHEVAUCHER, C'EST AVOIR UN PIED DE CHAQUE CÔTÉ DU NU.

      Le mur occupe une bande d'épaisseur `WALL_T` autour de son axe. Si les
      coins du meuble se répartissent des deux côtés de cette bande — ou
      dedans — c'est qu'il mord dans la maçonnerie, et on ne lâche pas là.
    */
    if (min < demi && max > -demi) dansLeMur = true;
    // Le jeu : la distance du bord le plus proche au nu du mur, du côté où
    // le meuble se trouve.
    const cote = min >= 0 ? 1 : -1;
    const jeu = cote > 0 ? min - demi : -max - demi;
    if (jeu >= 0 && (!meilleur || jeu < meilleur.jeu)) {
      meilleur = { jeu, w, signe: cote };
    }
  }

  if (dansLeMur) return { centre: vise, valide: false, aimante: false };

  /*
    L'AIMANT AMÈNE AU NU, JAMAIS AU-DELÀ.

    Une commode lâchée à vingt centimètres d'un mur n'a pas été posée là
    exprès. On l'amène CONTRE — sa face arrière au nu — et pas dedans : un
    meuble se pose contre un mur, il n'y entre pas.
  */
  if (meilleur && meilleur.jeu > 1e-4 && meilleur.jeu <= PORTEE_AIMANT) {
    const { nx, nz } = versLeMur(vise, meilleur.w);
    const k = meilleur.jeu * meilleur.signe;
    return {
      centre: { x: vise.x - nx * k, z: vise.z - nz * k },
      valide: true,
      aimante: true,
    };
  }

  return { centre: vise, valide: true, aimante: false };
}
