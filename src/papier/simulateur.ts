/**
 * LA PLANCHE D'ESSAI — on imprime un plan pour éprouver celui qui le relit.
 *
 * Relevé du patron : « tu testes ta propre fonction en simulant ». C'est la
 * seule façon honnête de vérifier un lecteur de plan : on part d'un
 * appartement DONT ON CONNAÎT LES COTES, on l'imprime comme un bureau
 * d'études l'imprimerait, on photographie la feuille de travers, à l'ombre,
 * avec du grain — et on demande au lecteur de retrouver l'appartement. Un
 * banc qui compare des nombres à des nombres ne prouverait rien : le
 * difficile n'est pas de calculer, c'est de LIRE.
 *
 * Ce que la planche imite, et pourquoi :
 *
 *   — LE DOUBLE TRAIT DES MURS. Un mur de plan n'est pas un trait : ce sont
 *     deux parallèles espacées de son épaisseur. C'est ce qui permet de
 *     rendre au relevé un mur de 20 et un mur de 7, au lieu de tout mettre
 *     à la même épaisseur par défaut.
 *   — LES TROUS DE MENUISERIE. Une porte, sur un plan, c'est une
 *     INTERRUPTION de la maçonnerie, deux tableaux, un vantail et son arc.
 *     Une fenêtre, c'est la même interruption barrée de traits fins. Le
 *     lecteur ne cherche pas des portes : il cherche des trous, et regarde
 *     ce qu'il y a dedans.
 *   — LES COTES ÉCRITES. Ligne d'attache, arrêts obliques, et le nombre
 *     posé dessus. C'est la seule chose qui donne l'ÉCHELLE VRAIE ; le reste
 *     n'est qu'un dessin proportionnel.
 *   — LA PHOTO. Rotation, perspective, ombre portée, grain, flou. Une
 *     feuille posée sur une table et prise au téléphone n'est jamais
 *     d'équerre, jamais éclairée d'un seul tenant.
 *
 * Le hasard est À GRAINE : deux exécutions du même banc doivent produire la
 * même image, sans quoi un échec sur cent ne se reproduirait jamais.
 */
import { echantillon, imageVide, type ImageGrise } from './image';
import { gabarit } from './gabarits';
import { tracer, transformer, type Forme, type P } from './trace';
import type { PhotoDePlan, TexteLu } from './entree';

export interface MurPapier {
  a: P;
  b: P;
  /** Épaisseur de la maçonnerie (m). Par défaut 0,2 : un mur de refend. */
  ep?: number;
  /**
   * COMMENT LE MUR EST DESSINÉ. Les trois conventions se rencontrent, et
   * souvent sur la même planche : le porteur en aplat ou hachuré, la cloison
   * en double trait.
   *
   * On a d'abord écrit le lecteur pour le seul double trait ; les plans
   * réels ont démenti dès le premier — sur un plan d'implantation électrique
   * courant, tous les murs sont des aplats. Une planche d'essai qui ne sait
   * imprimer qu'une convention n'éprouve qu'un tiers du travail.
   */
  style?: 'double' | 'aplat' | 'hachure';
}

export interface OuverturePapier {
  /** Rang du mur percé dans `murs`. */
  mur: number;
  /** Cote du MILIEU de l'ouverture depuis l'extrémité `a` du mur (m). */
  at: number;
  largeur: number;
  nature: 'porte' | 'fenetre' | 'baie';
  /** De quel côté le vantail s'ouvre : +1 ou −1. */
  cote?: 1 | -1;
  /** De quel bord la porte pivote : 'a' (par défaut) ou 'b'. */
  pivot?: 'a' | 'b';
}

export interface SymbolePapier {
  cle: string;
  at: P;
  /** Rotation du symbole (rad). Un symbole mural regarde la pièce. */
  angle?: number;
  /** Empreinte forcée (m) ; sinon celle du gabarit. */
  taille?: number;
}

export interface CotePapier {
  a: P;
  b: P;
  /** Ce qui est ÉCRIT. Absent = la longueur réelle, en centimètres. */
  texte?: string;
  /** Décalage de la ligne de cote par rapport au segment coté (m). */
  deport?: number;
}

export interface Planche {
  murs: MurPapier[];
  ouvertures?: OuverturePapier[];
  symboles?: SymbolePapier[];
  cotes?: CotePapier[];
  etiquettes?: { at: P; texte: string }[];
}

export interface ReglagePhoto {
  /** Points par mètre sur la feuille. 100 ≈ un plan au 1/50 imprimé à 200 dpi. */
  echelle?: number;
  /** Marge de papier autour du dessin (m). */
  marge?: number;
  /** Épaisseur du trait fin (px). */
  trait?: number;
  /** Noirceur de l'encre (0 = noir franc, 120 = crayon gris). */
  encre?: number;
  /** Inclinaison de la feuille (degrés). */
  rotation?: number;
  /** Prise de vue de biais, de 0 (à plat) à 1 (très penchée). */
  perspective?: number;
  /** Ombre portée, de 0 à 1. */
  ombre?: number;
  /** Grain du capteur, de 0 à 1. */
  bruit?: number;
  /** Flou de mise au point, en pixels. */
  flou?: number;
  graine?: number;
}

export interface PhotoSimulee extends PhotoDePlan {
  /** Une planche imprimée porte TOUJOURS ses textes, même vides. */
  textes: TexteLu[];
  /**
   * LA VÉRITÉ DU BANC : ce que le lecteur est censé retrouver.
   *
   * Elle n'existe que dans la simulation — on ne l'utilise jamais pour
   * lire, seulement pour noter la lecture.
   */
  verite: {
    pxParMetre: number;
    planche: Planche;
    /** Où un point du plan est tombé sur l'image finale. */
    versImage: (p: P) => P;
  };
}

/*
  Un générateur à graine EST de l'arithmétique de bits : la règle qui les
  interdit vise les drapeaux bricolés dans du code métier, pas mulberry32.
*/
/* eslint-disable no-bitwise */
/** Générateur à graine — un banc doit pouvoir rejouer son propre grain. */
function dés(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* eslint-enable no-bitwise */

const dir = (m: MurPapier) => {
  const dx = m.b.x - m.a.x;
  const dz = m.b.y - m.a.y;
  const n = Math.hypot(dx, dz) || 1;
  return { ux: dx / n, uy: dz / n, len: n };
};

/** Le point d'un mur à la cote `t`, décalé de `d` sur sa normale. */
function surLeMur(m: MurPapier, t: number, d = 0): P {
  const { ux, uy } = dir(m);
  return { x: m.a.x + ux * t - uy * d, y: m.a.y + uy * t + ux * d };
}

/**
 * Les formes de la maçonnerie : deux bords par mur, coupés aux ouvertures,
 * plus les tableaux qui referment la coupe.
 */
function formesDesMurs(planche: Planche): Forme[] {
  const out: Forme[] = [];
  planche.murs.forEach((m, i) => {
    const ep = m.ep ?? 0.2;
    const style = m.style ?? 'double';
    const { len } = dir(m);
    // Les trous de ce mur, rangés le long de son axe.
    const trous = (planche.ouvertures ?? [])
      .filter((o) => o.mur === i)
      .map((o) => ({
        ...o,
        d: Math.max(0, o.at - o.largeur / 2),
        f: Math.min(len, o.at + o.largeur / 2),
      }))
      .sort((a, b) => a.d - b.d);

    // La maçonnerie pleine, morceau par morceau entre les trous.
    const troncons: { d: number; f: number }[] = [];
    let t = 0;
    for (const trou of trous) {
      if (trou.d > t) troncons.push({ d: t, f: trou.d });
      t = Math.max(t, trou.f);
    }
    if (t < len) troncons.push({ d: t, f: len });

    for (const tr of troncons) {
      if (style === 'aplat') {
        out.push({
          t: 'aplat',
          pts: [
            surLeMur(m, tr.d, -ep / 2),
            surLeMur(m, tr.f, -ep / 2),
            surLeMur(m, tr.f, ep / 2),
            surLeMur(m, tr.d, ep / 2),
          ],
        });
        continue;
      }
      for (const bord of [-1, 1]) {
        out.push({
          t: 'seg',
          a: surLeMur(m, tr.d, (bord * ep) / 2),
          b: surLeMur(m, tr.f, (bord * ep) / 2),
        });
      }
      if (style === 'hachure') {
        // Les obliques du mur porteur, tous les demi-mur, à quarante-cinq
        // degrés. Elles n'existent que pour dire « maçonnerie » — et elles
        // sont, pour le lecteur, la principale source de faux traits.
        const pas = ep / 2;
        for (let s = tr.d + pas; s < tr.f; s += pas) {
          const a = surLeMur(m, s, -ep / 2);
          const b = surLeMur(m, Math.min(tr.f, s + ep), ep / 2);
          out.push({ t: 'seg', a, b, w: 0.012 });
        }
      }
    }

    // Les tableaux : la tranche de maçonnerie qui se voit dans le trou.
    for (const trou of trous) {
      for (const c of [trou.d, trou.f]) {
        out.push({ t: 'seg', a: surLeMur(m, c, -ep / 2), b: surLeMur(m, c, ep / 2) });
      }
    }
    // Les abouts : un mur qui ne touche rien se ferme au bout.
    if (style !== 'aplat') {
      for (const bout of [0, len]) {
        const p = surLeMur(m, bout);
        const colle = planche.murs.some((autre, j) => {
          if (j === i) return false;
          return [autre.a, autre.b].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < ep);
        });
        if (!colle) {
          out.push({ t: 'seg', a: surLeMur(m, bout, -ep / 2), b: surLeMur(m, bout, ep / 2) });
        }
      }
    }
  });
  return out;
}

/** Le vantail et son arc, ou les traits fins d'une fenêtre. */
function formesDesOuvertures(planche: Planche): Forme[] {
  const out: Forme[] = [];
  for (const o of planche.ouvertures ?? []) {
    const m = planche.murs[o.mur];
    if (!m) continue;
    const ep = m.ep ?? 0.2;
    const { ux, uy } = dir(m);
    const cote = o.cote ?? 1;
    const gond = surLeMur(m, o.at + (o.pivot === 'b' ? o.largeur / 2 : -o.largeur / 2), 0);
    if (o.nature === 'porte') {
      const sens = o.pivot === 'b' ? -1 : 1;
      // Le vantail, ouvert à angle droit — la convention du dessin.
      const bout = { x: gond.x - uy * cote * o.largeur, y: gond.y + ux * cote * o.largeur };
      out.push({ t: 'seg', a: gond, b: bout, w: undefined });
      const a0 = Math.atan2(sens * uy, sens * ux);
      const a1 = Math.atan2(-uy * cote, ux * cote);
      out.push({
        t: 'arc',
        c: gond,
        r: o.largeur,
        a0: cote * sens > 0 ? a0 : a1,
        a1: cote * sens > 0 ? a1 : a0,
      });
    } else if (o.nature === 'fenetre') {
      // Le châssis se dessine bien ÉCARTÉ dans le tableau : deux traits à
      // trois pixels l'un de l'autre se fondent en une barre pleine, et la
      // fenêtre ne se distinguait plus d'un bout de mur.
      // Le châssis se pose au quart de l'épaisseur : assez loin des bords
      // pour ne pas se confondre avec eux — collé au bord, le lecteur
      // prolongeait le trait de menuiserie en trait de maçonnerie et le mur
      // ressortait amputé de son premier mètre — et assez écarté de son
      // jumeau pour qu'on voie deux traits et non une barre pleine.
      for (const d of [-ep / 4, ep / 4]) {
        out.push({
          t: 'seg',
          a: surLeMur(m, o.at - o.largeur / 2, d),
          b: surLeMur(m, o.at + o.largeur / 2, d),
        });
      }
    }
  }
  return out;
}

/**
 * Un texte imprimé, en pavés.
 *
 * On ne dessine pas de vraies lettres : le lecteur natif n'est pas simulé,
 * c'est sa SORTIE qui l'est. Mais le texte doit tout de même NOIRCIR le
 * papier, parce qu'il pollue la détection des symboles exactement comme sur
 * un vrai plan — et c'est ce qu'on veut éprouver.
 */
function formesDuTexte(texte: string, at: P, hauteur: number): Forme[] {
  const out: Forme[] = [];
  const large = hauteur * 0.62;
  const x0 = at.x - (texte.length * large) / 2;
  texte.split('').forEach((c, i) => {
    if (c === ' ') return;
    const x = x0 + i * large + large / 2;
    out.push({
      t: 'poly',
      pts: [
        { x: x - large * 0.3, y: at.y - hauteur / 2 },
        { x: x + large * 0.3, y: at.y - hauteur / 2 },
        { x: x + large * 0.3, y: at.y + hauteur / 2 },
        { x: x - large * 0.3, y: at.y + hauteur / 2 },
      ],
      ferme: true,
      w: hauteur * 0.22,
    });
  });
  return out;
}

/** Une homographie 3×3 appliquée à un point. */
function applique(H: number[], p: P): P {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/** Produit de deux homographies. */
function compose(A: number[], B: number[]): number[] {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
    }
  }
  return C;
}

function inverse(H: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ];
  return inv.map((v) => v / det);
}

/**
 * IMPRIME LA PLANCHE, PUIS LA PHOTOGRAPHIE.
 *
 * Deux temps distincts : on dessine d'abord une feuille parfaite, à plat, à
 * une échelle connue ; on la déforme ensuite comme le ferait un téléphone.
 * C'est ce qui permet de rendre la VÉRITÉ (où chaque point du plan est
 * tombé sur l'image) sans jamais la faire passer par le dessin.
 */
export function photographierPlanche(
  planche: Planche,
  reglage: ReglagePhoto = {},
): PhotoSimulee {
  const pxm = reglage.echelle ?? 100;
  /*
    UN MÈTRE DE PAPIER AUTOUR DU DESSIN.

    Soixante centimètres ne suffisaient pas : une ligne de cote se pose à
    quarante-cinq centimètres du mur, et son nombre dix-huit centimètres
    au-dessus d'elle — le texte « 400 » tombait à trois pixels HORS de la
    feuille, l'OCR le rendait tout de même (c'est une simulation), et le
    lecteur cherchait sa ligne de cote au-delà du bord de l'image.
  */
  const marge = reglage.marge ?? 1;
  const trait = reglage.trait ?? 2;
  const rnd = dés(reglage.graine ?? 12345);

  const pts = planche.murs.flatMap((m) => [m.a, m.b]);
  const minX = Math.min(...pts.map((p) => p.x)) - marge;
  const minY = Math.min(...pts.map((p) => p.y)) - marge;
  const maxX = Math.max(...pts.map((p) => p.x)) + marge;
  const maxY = Math.max(...pts.map((p) => p.y)) + marge;
  const l = Math.ceil((maxX - minX) * pxm);
  const h = Math.ceil((maxY - minY) * pxm);
  const versPapier = (p: P): P => ({ x: (p.x - minX) * pxm, y: (p.y - minY) * pxm });
  const enPx = (formes: Forme[]) =>
    formes.map((f) => {
      if (f.t === 'seg') return { ...f, a: versPapier(f.a), b: versPapier(f.b), w: f.w && f.w * pxm };
      if (f.t === 'poly') return { ...f, pts: f.pts.map(versPapier), w: f.w && f.w * pxm };
      if (f.t === 'aplat') return { ...f, pts: f.pts.map(versPapier) };
      if (f.t === 'disque') return { ...f, c: versPapier(f.c), r: f.r * pxm };
      return { ...f, c: versPapier(f.c), r: f.r * pxm, w: f.w && f.w * pxm };
    });

  const feuille = imageVide(l, h, 250);
  const encre = reglage.encre ?? 25;

  // La maçonnerie, d'abord : c'est elle qui porte tout le reste.
  tracer(feuille, enPx(formesDesMurs(planche)), { trait: trait * 1.4, encre });
  tracer(feuille, enPx(formesDesOuvertures(planche)), { trait, encre });

  // Les symboles, chacun à l'empreinte de son gabarit.
  const symboles: Forme[] = [];
  for (const s of planche.symboles ?? []) {
    const g = gabarit(s.cle);
    if (!g) continue;
    const r = (s.taille ?? g.taille) / 2;
    symboles.push(
      ...transformer(g.formes, { x: s.at.x, y: s.at.y, echelle: r, angle: s.angle ?? 0 }),
    );
  }
  tracer(feuille, enPx(symboles), { trait: trait * 0.9, encre });

  // Les cotes, et le texte qu'on en lira.
  const textes: TexteLu[] = [];
  const hauteurTexte = 0.22; // m sur le papier : ~2,5 mm au 1/50
  for (const c of planche.cotes ?? []) {
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const n = Math.hypot(dx, dy) || 1;
    const nx = -dy / n;
    const ny = dx / n;
    const d = c.deport ?? 0.45;
    const A = { x: c.a.x + nx * d, y: c.a.y + ny * d };
    const B = { x: c.b.x + nx * d, y: c.b.y + ny * d };
    const cotes: Forme[] = [
      { t: 'seg', a: A, b: B },
      { t: 'seg', a: c.a, b: { x: A.x + nx * 0.12, y: A.y + ny * 0.12 } },
      { t: 'seg', a: c.b, b: { x: B.x + nx * 0.12, y: B.y + ny * 0.12 } },
      // Les arrêts obliques du dessin technique.
      {
        t: 'seg',
        a: { x: A.x - (dx / n) * 0.1 - nx * 0.1, y: A.y - (dy / n) * 0.1 - ny * 0.1 },
        b: { x: A.x + (dx / n) * 0.1 + nx * 0.1, y: A.y + (dy / n) * 0.1 + ny * 0.1 },
      },
      {
        t: 'seg',
        a: { x: B.x - (dx / n) * 0.1 - nx * 0.1, y: B.y - (dy / n) * 0.1 - ny * 0.1 },
        b: { x: B.x + (dx / n) * 0.1 + nx * 0.1, y: B.y + (dy / n) * 0.1 + ny * 0.1 },
      },
    ];
    tracer(feuille, enPx(cotes), { trait: trait * 0.7, encre: encre + 40 });
    const texte = c.texte ?? String(Math.round(n * 100));
    // LE NOMBRE SE POSE AU-DESSUS DE SA LIGNE, du côté opposé à ce qu'il
    // cote. Posé de l'autre côté, il tombait sur la maçonnerie et l'effaçait
    // — le bord du mur de droite disparaissait sous le texte « 300 », et le
    // lecteur rendait un mur coupé en deux.
    const cote = Math.sign(d) || 1;
    const milieu = {
      x: (A.x + B.x) / 2 + nx * 0.18 * cote,
      y: (A.y + B.y) / 2 + ny * 0.18 * cote,
    };
    tracer(feuille, enPx(formesDuTexte(texte, milieu, hauteurTexte)), {
      trait: trait * 0.6,
      encre: encre + 30,
    });
    const centre = versPapier(milieu);
    textes.push({
      texte,
      x: centre.x - (texte.length * hauteurTexte * 0.62 * pxm) / 2,
      y: centre.y - (hauteurTexte * pxm) / 2,
      l: texte.length * hauteurTexte * 0.62 * pxm,
      h: hauteurTexte * pxm,
      sur: 0.95,
    });
  }

  for (const e of planche.etiquettes ?? []) {
    tracer(feuille, enPx(formesDuTexte(e.texte, e.at, hauteurTexte * 1.2)), {
      trait: trait * 0.7,
      encre,
    });
    const centre = versPapier(e.at);
    textes.push({
      texte: e.texte,
      x: centre.x - (e.texte.length * hauteurTexte * 1.2 * 0.62 * pxm) / 2,
      y: centre.y - (hauteurTexte * 1.2 * pxm) / 2,
      l: e.texte.length * hauteurTexte * 1.2 * 0.62 * pxm,
      h: hauteurTexte * 1.2 * pxm,
      sur: 0.9,
    });
  }

  // ── La prise de vue ────────────────────────────────────────────────────
  const rot = ((reglage.rotation ?? 0) * Math.PI) / 180;
  const persp = reglage.perspective ?? 0;
  let H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (rot || persp) {
    const cx = l / 2;
    const cy = h / 2;
    const vers = [1, 0, -cx, 0, 1, -cy, 0, 0, 1];
    const revient = [1, 0, cx, 0, 1, cy, 0, 0, 1];
    const tourne = [Math.cos(rot), -Math.sin(rot), 0, Math.sin(rot), Math.cos(rot), 0, 0, 0, 1];
    // La perspective d'une feuille posée sur une table : le haut s'éloigne.
    const penche = [1, 0, 0, 0, 1, 0, 0, (persp * 0.6) / h, 1];
    H = compose(revient, compose(compose(penche, tourne), vers));
  }
  const Hinv = inverse(H);
  const photo: ImageGrise =
    rot || persp
      ? (() => {
          const out = imageVide(l, h, 250);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < l; x++) {
              const s = applique(Hinv, { x: x + 0.5, y: y + 0.5 });
              out.px[y * l + x] = Math.round(
                Math.max(0, Math.min(255, echantillon(feuille, s.x - 0.5, s.y - 0.5))),
              );
            }
          }
          return out;
        })()
      : feuille;

  // L'ombre : un dégradé oblique, comme une lampe de côté et une main.
  const ombre = reglage.ombre ?? 0;
  if (ombre > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        const t = (x / l) * 0.7 + (y / h) * 0.3;
        // JUSQU'AUX DEUX TIERS DE LA LUMIÈRE. Une main au-dessus de la
        // feuille, ou une fenêtre d'un seul côté, font perdre bien plus que
        // le quart qu'on modélisait : le coin sombre descendait à peine sous
        // le seuil global, et l'essai censé montrer qu'un seuil global échoue
        // le montrait à peine.
        const k = 1 - ombre * 0.75 * t;
        const i = y * l + x;
        photo.px[i] = Math.max(0, Math.min(255, Math.round(photo.px[i] * k)));
      }
    }
  }

  // Le flou : trois passes de moyenne 3×3 valent une gaussienne honnête.
  const flou = Math.round(reglage.flou ?? 0);
  for (let passe = 0; passe < flou; passe++) {
    const src = photo.px.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= l || ny >= h) continue;
            s += src[ny * l + nx];
            n++;
          }
        }
        photo.px[y * l + x] = Math.round(s / n);
      }
    }
  }

  // Le grain, en dernier : c'est le capteur, il ne se floute pas.
  const bruit = reglage.bruit ?? 0;
  if (bruit > 0) {
    for (let i = 0; i < photo.px.length; i++) {
      const g = (rnd() + rnd() + rnd() - 1.5) * 2 * bruit * 40;
      photo.px[i] = Math.max(0, Math.min(255, Math.round(photo.px[i] + g)));
    }
  }

  const versImage = (p: P) => applique(H, versPapier(p));
  return {
    image: photo,
    textes: textes.map((t) => {
      // La boîte suit la feuille : quatre coins transformés, puis leur cadre.
      const coins = [
        { x: t.x, y: t.y },
        { x: t.x + t.l, y: t.y },
        { x: t.x, y: t.y + t.h },
        { x: t.x + t.l, y: t.y + t.h },
      ].map((p) => applique(H, p));
      const xs = coins.map((p) => p.x);
      const ys = coins.map((p) => p.y);
      return {
        ...t,
        x: Math.min(...xs),
        y: Math.min(...ys),
        l: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    }),
    verite: { pxParMetre: pxm, planche, versImage },
  };
}
