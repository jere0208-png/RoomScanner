/**
 * RECONNAÎTRE LES SYMBOLES — sans jamais comparer deux images.
 *
 * Personne ne dessine le symbole d'une prise tout à fait pareil. La CEI
 * 60617 en fixe l'esprit ; chaque bureau d'études en fait sa variante, un
 * plan de rénovation tracé à la main en fait une troisième, et le même
 * symbole se retrouve à trois échelles sur la même feuille. Comparer des
 * pixels à des pixels ne peut donc pas marcher — et c'est exactement ce que
 * font les reconnaissances par gabarit qui échouent dès la deuxième feuille.
 *
 * On compare des INVARIANTS : ce qui survit à une rotation, à un changement
 * d'échelle et à la main de celui qui a dessiné.
 *
 *   — LE NOMBRE DE TROUS. Le plus solide de tous, et le seul qui soit
 *     ENTIER : un point lumineux (cercle barré d'une croix) en a quatre, un
 *     spot un, un socle de prise un (son demi-disque), un interrupteur
 *     aucun. Deux symboles qui n'ont pas le même nombre de trous ne sont
 *     jamais le même symbole.
 *   — LE REMPLISSAGE du disque englobant : un triangle occupe moins qu'un
 *     rond, un trait moins qu'un triangle.
 *   — L'ALLONGEMENT, tiré de l'inertie : ce qui distingue une baignoire
 *     d'un lavabo avant même de regarder le détail.
 *   — LA COMPACITÉ (aire sur périmètre au carré) : la mesure classique du
 *     découpage d'une forme.
 *   — DEUX MOMENTS DE HU, invariants par rotation et par échelle.
 *   — LA SYMÉTRIE À DEMI-TOUR : un point lumineux la respecte, une prise
 *     avec sa tige non.
 *
 * LES RÉFÉRENCES SORTENT DES MÊMES DESSINS QUE LES PLANCHES D'ESSAI. On
 * rasterise chaque gabarit une fois, à taille fixe, et l'on en tire ses
 * invariants. Une seule source de vérité : le jour où l'on redresse le
 * symbole d'une prise, la référence suit toute seule.
 *
 * CE QU'ON NE RECONNAÎT PAS, ON LE DIT. Au-delà d'un certain écart, le
 * symbole ressort en `repere` — un point à qualifier posé au bon endroit,
 * avec sa vignette. Un plan qui ment est pire qu'un plan incomplet.
 */
import { binariser, ilots, imageVide, masqueDeLIlot, trousDe, type Masque } from './image';
import { GABARITS, type Gabarit } from './gabarits';
import { tracer, transformer, type P } from './trace';

export interface SymboleLu {
  /** Clef du gabarit reconnu, ou `null` si rien ne ressemble d'assez près. */
  cle: string | null;
  gabarit?: Gabarit;
  /** Centre du symbole, en pixels de l'image lue. */
  at: P;
  /** Diamètre de son emprise (px). */
  taille: number;
  /** De 0 à 1 : ce qu'on est prêt à parier sur cette reconnaissance. */
  sur: number;
}

/** Les invariants d'une forme — sept nombres, et pas un pixel. */
export interface Signature {
  trous: number;
  remplissage: number;
  allongement: number;
  compacite: number;
  hu1: number;
  hu2: number;
  symetrie: number;
}

/** Taille de rasterisation des références : assez fine pour les trous. */
const COTE_REF = 96;

function signature(m: Masque): Signature {
  let aire = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.l; x++) {
      if (m.on[y * m.l + x] !== 1) continue;
      aire++;
      sx += x;
      sy += y;
    }
  }
  if (aire === 0) {
    return {
      trous: 0,
      remplissage: 0,
      allongement: 1,
      compacite: 0,
      hu1: 0,
      hu2: 0,
      symetrie: 0,
    };
  }
  const cx = sx / aire;
  const cy = sy / aire;

  let m20 = 0;
  let m02 = 0;
  let m11 = 0;
  let rayonMax = 0;
  let perimetre = 0;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.l; x++) {
      if (m.on[y * m.l + x] !== 1) continue;
      const dx = x - cx;
      const dy = y - cy;
      m20 += dx * dx;
      m02 += dy * dy;
      m11 += dx * dy;
      rayonMax = Math.max(rayonMax, Math.hypot(dx, dy));
      // Un pixel de bord a au moins un voisin éteint en quatre-connexité.
      const bord =
        x === 0 ||
        y === 0 ||
        x === m.l - 1 ||
        y === m.h - 1 ||
        m.on[y * m.l + x - 1] !== 1 ||
        m.on[y * m.l + x + 1] !== 1 ||
        m.on[(y - 1) * m.l + x] !== 1 ||
        m.on[(y + 1) * m.l + x] !== 1;
      if (bord) perimetre++;
    }
  }

  /*
    Moments centraux normalisés : c'est la normalisation par l'aire qui rend
    les moments de Hu insensibles à l'échelle. On s'arrête aux DEUX PREMIERS.
    Les suivants font intervenir les moments d'ordre trois, et sur un symbole
    de trente pixels de côté ils ne ramassent plus que du bruit — deux
    suffisent à séparer nos vingt symboles, ce qu'un banc vérifie.
  */
  const n = (p: number, q: number, v: number) => v / Math.pow(aire, 1 + (p + q) / 2);
  const n20 = n(2, 0, m20);
  const n02 = n(0, 2, m02);
  const n11 = n(1, 1, m11);
  const hu1 = n20 + n02;
  const hu2 = (n20 - n02) * (n20 - n02) + 4 * n11 * n11;

  // Allongement : rapport des deux axes d'inertie.
  const tr = m20 + m02;
  const det = m20 * m02 - m11 * m11;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = Math.max(1e-9, tr / 2 - Math.sqrt(disc));
  const allongement = Math.sqrt(l1 / l2);

  // Symétrie à demi-tour : part des pixels qui retombent sur un pixel.
  let pareils = 0;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.l; x++) {
      if (m.on[y * m.l + x] !== 1) continue;
      const rx = Math.round(2 * cx - x);
      const ry = Math.round(2 * cy - y);
      if (rx >= 0 && ry >= 0 && rx < m.l && ry < m.h && m.on[ry * m.l + rx] === 1) {
        pareils++;
      }
    }
  }

  return {
    trous: trousDe(m),
    remplissage: aire / Math.max(1, Math.PI * rayonMax * rayonMax),
    allongement,
    compacite: (4 * Math.PI * aire) / Math.max(1, perimetre * perimetre),
    hu1,
    hu2,
    symetrie: pareils / aire,
  };
}

/** Le gabarit, rasterisé puis résumé — calculé une fois pour toutes. */
const REFERENCES = new Map<string, Signature>();

function referenceDe(g: Gabarit): Signature {
  const dejaVu = REFERENCES.get(g.cle);
  if (dejaVu) return dejaVu;
  const img = imageVide(COTE_REF, COTE_REF, 250);
  tracer(
    img,
    transformer(g.formes, {
      x: COTE_REF / 2,
      y: COTE_REF / 2,
      echelle: COTE_REF * 0.42,
    }),
    { trait: Math.max(2, COTE_REF / 28), encre: 20 },
  );
  const s = signature(binariser(img, { fenetre: COTE_REF }));
  REFERENCES.set(g.cle, s);
  return s;
}

/**
 * L'écart entre deux signatures.
 *
 * Le nombre de trous n'est pas une mesure mais un COMPTE : une différence
 * d'un trou n'est pas « un peu différent », c'est un autre symbole. On le
 * traite donc comme une pénalité franche, et non comme un écart à moyenner.
 */
export function ecartDeSignature(a: Signature, b: Signature): number {
  const rel = (x: number, y: number, echelle: number) =>
    Math.abs(x - y) / Math.max(echelle, 1e-6);
  let d = 0;
  d += Math.min(2, Math.abs(a.trous - b.trous)) * 0.6;
  d += rel(a.remplissage, b.remplissage, 0.5) * 0.5;
  d += rel(a.allongement, b.allongement, 2) * 0.4;
  d += rel(a.compacite, b.compacite, 0.5) * 0.3;
  d += rel(a.hu1, b.hu1, 0.5) * 0.6;
  d += rel(a.hu2, b.hu2, 0.1) * 0.3;
  d += rel(a.symetrie, b.symetrie, 1) * 0.4;
  return d;
}

/** Le gabarit le plus proche d'une forme, et de combien il l'est. */
export function reconnaitre(
  forme: Masque,
  candidats: Gabarit[] = GABARITS,
): { gabarit: Gabarit | null; ecart: number } {
  const s = signature(forme);
  let mieux: Gabarit | null = null;
  let ecart = Infinity;
  for (const g of candidats) {
    const d = ecartDeSignature(s, referenceDe(g));
    if (d < ecart) {
      ecart = d;
      mieux = g;
    }
  }
  return { gabarit: mieux, ecart };
}

export interface ReglageSymboles {
  /** Écart maximal admis pour NOMMER un symbole. Au-delà : un repère. */
  ecartMax?: number;
  /** Emprise minimale d'un symbole (px). */
  tailleMin?: number;
  /** Emprise maximale (px). */
  tailleMax?: number;
  /** Nombre de pixels d'encre minimal — en dessous, c'est de la poussière. */
  encreMin?: number;
}

/**
 * Les symboles d'un plan, une fois la maçonnerie et l'écriture retirées.
 *
 * On ne cherche PAS dans le masque entier : les murs y forment des îlots
 * énormes auxquels tous les symboles qui les touchent se trouvent soudés —
 * une prise dessinée contre son mur ne serait jamais qu'un bout de mur. Le
 * masque doit donc arriver ÉBARBÉ (voir `effacerMurs`), et c'est le seul
 * ordre d'appel qui donne quelque chose.
 */
export function symbolesDuMasque(
  masque: Masque,
  reglage: ReglageSymboles = {},
): SymboleLu[] {
  const tailleMin = reglage.tailleMin ?? 8;
  const tailleMax = reglage.tailleMax ?? Math.min(masque.l, masque.h) / 4;
  const encreMin = reglage.encreMin ?? 12;
  /*
    SIX DIXIÈMES : LA FRONTIÈRE ENTRE « RECONNU » ET « À QUALIFIER ».

    Les vingt-quatre symboles du dictionnaire se reconnaissent eux-mêmes
    avec un écart de deux à cinq dixièmes selon la taille et l'angle. On
    était parti sur un et un dixième, et un pentagone barré — qui n'est
    AUCUN de nos symboles — passait pour un tableau électrique avec quatre
    dixièmes d'écart. Mieux vaut un repère à qualifier qu'un tableau
    imaginaire au milieu d'un séjour.
  */
  const ecartMax = reglage.ecartMax ?? 0.6;

  const out: SymboleLu[] = [];
  for (const i of ilots(masque, encreMin)) {
    const l = i.maxX - i.minX + 1;
    const h = i.maxY - i.minY + 1;
    const taille = Math.max(l, h);
    if (taille < tailleMin || taille > tailleMax) continue;
    /*
      LES BOUTS DE TRAIT NE SONT PAS DES REPÈRES.

      Ébarber la maçonnerie laisse des miettes : le reste d'une ligne de
      cote, un morceau d'arc de porte, la queue d'une attache. Toutes ont la
      même allure — longues et minces. Aucun symbole du dictionnaire ne
      dépasse un rapport de deux et demi entre ses côtés (la baignoire est le
      plus allongé), et six laisse une marge confortable. Sans ce filtre, le
      plan se couvrait de repères à qualifier qui n'étaient que des débris.
    */
    if (Math.max(l, h) > 6 * Math.max(1, Math.min(l, h))) continue;
    const forme = masqueDeLIlot(i, masque, 2);
    const { gabarit, ecart } = reconnaitre(forme);
    const reconnu = gabarit && ecart <= ecartMax;
    out.push({
      cle: reconnu ? gabarit.cle : null,
      gabarit: reconnu ? gabarit : undefined,
      at: { x: (i.minX + i.maxX) / 2, y: (i.minY + i.maxY) / 2 },
      taille,
      sur: reconnu ? Math.max(0, 1 - ecart / ecartMax) : 0,
    });
  }
  return out;
}

/**
 * EFFACE LA MAÇONNERIE DU MASQUE.
 *
 * Un symbole se dessine contre son mur, et souvent le touche : dans le
 * masque brut, il n'est qu'une excroissance de l'îlot du mur, lequel court
 * sur toute la feuille. On retire donc l'emprise des murs — leur épaisseur
 * plus un pixel de jeu — avant de chercher les symboles. Ce qui reste
 * collé au bord se détache alors tout seul.
 */
export function effacerMurs(
  masque: Masque,
  murs: { a: P; b: P; ep: number; facon?: string }[],
  { jeu = 1, trait = 2 }: { jeu?: number; trait?: number } = {},
): Masque {
  const out = { l: masque.l, h: masque.h, on: masque.on.slice() };
  const gomme = (x: number, y: number) => {
    const i = Math.round(y) * masque.l + Math.round(x);
    if (x < -0.5 || y < -0.5 || x >= masque.l || y >= masque.h) return;
    out.on[i] = 0;
  };
  for (const m of murs) {
    const dx = m.b.x - m.a.x;
    const dy = m.b.y - m.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    if (m.facon === 'aplat') {
      // Un mur en aplat est plein : rien ne peut être dessiné dedans, et
      // l'emprise entière s'en va.
      const demi = m.ep / 2 + jeu;
      for (let s = -jeu; s <= len + jeu; s += 0.5) {
        for (let d = -demi; d <= demi; d += 0.5) {
          gomme(m.a.x + ux * s - uy * d, m.a.y + uy * s + ux * d);
        }
      }
      continue;
    }
    /*
      ON N'EFFACE QUE LES BORDS, PAS TOUT LE MUR.

      Un symbole dessiné contre son mur le CHEVAUCHE souvent d'un ou deux
      pixels — c'est même à cela qu'on voit qu'il est mural. Effacer
      l'emprise entière du mur, comme on le faisait, lui coupait le pied : le
      cercle d'un point lumineux perdait un morceau, ses quatre trous
      devenaient deux, et il n'était plus reconnu du tout. On ne retire donc
      que les deux TRAITS de bord — assez pour détacher le symbole de la
      maçonnerie, pas assez pour l'amputer. Un mur en aplat, lui, est plein :
      rien n'y est jamais dessiné, et il s'en va tout entier.
    */
    /*
      LA GOMME FAIT LA LARGEUR DU TRAIT, PAS UN PIXEL DE PLUS.

      Trois pixels de part et d'autre du bord, cela paraissait prudent : cela
      coupait en fait le premier tiers de tout symbole posé CONTRE le mur —
      c'est-à-dire de tous les symboles muraux. Le cercle d'un point lumineux
      perdait son arc supérieur, ses quatre trous devenaient deux, et il
      n'était plus reconnu. On efface donc l'épaisseur du trait de dessin, et
      rien d'autre.
    */
    const large = trait / 2 + 0.5;
    for (const sens of [-1, 1]) {
      for (let s = -jeu; s <= len + jeu; s += 0.5) {
        for (let k = -large; k <= large; k += 0.5) {
          const d = (sens * m.ep) / 2 + k;
          gomme(m.a.x + ux * s - uy * d, m.a.y + uy * s + ux * d);
        }
      }
    }
  }
  return out;
}
