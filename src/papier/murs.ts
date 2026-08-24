/**
 * DES TRAITS AUX MURS.
 *
 * Un plan ne dessine pas les murs de la même façon d'un bureau d'études à
 * l'autre, et souvent pas de la même façon sur une même feuille. On en a
 * relevé trois, sur de vrais plans français :
 *
 *   — L'APLAT. Le mur est un rectangle NOIR (porteur) ou GRIS (cloison).
 *     C'est la convention des plans d'implantation électrique, la plus
 *     répandue de toutes. Sur l'urne de Hough, un aplat de vingt pixels
 *     donne un pic unique au milieu, et la largeur mesurée EST l'épaisseur
 *     du mur : il n'y a rien de plus à faire.
 *   — LE DOUBLE TRAIT. Deux parallèles espacées de l'épaisseur, le vide
 *     entre les deux. C'est la convention du dessin d'architecte, et c'est
 *     elle qui demande du travail : il faut RECONNAÎTRE les couples.
 *   — LE DOUBLE TRAIT HACHURÉ. Le même, plus des obliques à quarante-cinq
 *     degrés qui disent « maçonnerie ». Ces obliques sont, de loin, la
 *     première source de faux traits : elles sont courtes, nombreuses, et
 *     toutes parallèles entre elles.
 *
 * ON N'INVENTE PAS DE MUR À PARTIR D'UN TRAIT SEUL. Un trait fin isolé, sur
 * un plan, c'est neuf fois sur dix une ligne de cote, un vantail de porte,
 * un axe de symétrie ou un renvoi — et une fois sur dix une cloison dessinée
 * à l'économie. Prendre les dix pour des murs remplissait le plan de
 * cloisons fantômes en travers des pièces. Celui qui veut ce comportement
 * l'active (`accepterSimples`), et il sait alors ce qu'il fait.
 */
import { allume, type Masque } from './image';
import type { P } from './trace';
import type { Trait } from './traits';

export interface MurLu {
  /** L'axe du mur, en pixels de l'image lue. */
  a: P;
  b: P;
  /** Épaisseur de la maçonnerie (px). */
  ep: number;
  /** D'où il vient : ce que le plan en disait. */
  facon: 'aplat' | 'double' | 'simple';
  /** Longueur de l'axe (px). */
  len: number;
}

export interface ReglageMurs {
  /** Épaisseur (px) à partir de laquelle un trait EST un mur en aplat. */
  epaisMin?: number;
  /** Écart admissible entre les deux bords d'un mur (px). */
  ecartMin?: number;
  ecartMax?: number;
  /** Part du plus court des deux bords qui doit se faire face. */
  recouvreMin?: number;
  /** Longueur minimale d'un mur (px). */
  longueurMin?: number;
  /** Accepter les traits simples comme cloisons, avec cette épaisseur (px). */
  accepterSimples?: number;
  /** Part d'encre exigée d'un trait pour qu'il compte comme bord de mur. */
  pleinMin?: number;
}

const long = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * LA PLUS LARGE OUVERTURE QU'UN MUR PUISSE PORTER, en épaisseurs de mur
 * porteur.
 *
 * Faute d'échelle à ce stade — on ne sait pas encore ce que vaut un pixel —
 * les largeurs se mesurent en épaisseurs du mur le plus épais du plan, qui
 * fait vingt à vingt-cinq centimètres en logement. Sept fois, c'est un mètre
 * quarante : une porte-fenêtre, une baie de séjour, une trémie d'escalier.
 * On était parti sur cinq (un mètre) et la fenêtre de 1,20 m du T1 coupait
 * le mur en deux morceaux qui ne se rejoignaient plus.
 */
const OUVERTURE_MAX = 7;
/** Le rang `q` d'une série, de 0 (le plus petit) à 1. */
const rang = (v: number[], q: number) => {
  if (!v.length) return 0;
  const t = v.slice().sort((x, y) => x - y);
  return t[Math.max(0, Math.min(t.length - 1, Math.round(q * (t.length - 1))))];
};

/**
 * REMET UN TRAIT DANS LE SENS DE SON ANGLE.
 *
 * Tout ce fichier raisonne en abscisses le long d'un trait, et l'angle d'une
 * droite se ramène dans [0, π[ — sans quoi deux bords d'un même mur, l'un
 * relevé de gauche à droite et l'autre de droite à gauche, passeraient pour
 * perpendiculaires. Mais si le trait, lui, pointe dans l'autre sens, ses
 * propres abscisses deviennent NÉGATIVES : le recouvrement calculé valait
 * moins que zéro et le couple était rejeté. Trois murs sur cinq manquaient à
 * l'appel, et le plan ne se refermait pas.
 */
function remettreDroit<T extends { a: P; b: P }>(t: T): T {
  const dx = t.b.x - t.a.x;
  const dy = t.b.y - t.a.y;
  if (dy < 0 || (dy === 0 && dx < 0)) return { ...t, a: t.b, b: t.a };
  return t;
}

/** L'angle d'un trait, ramené dans [0, π[. */
const angleDe = (t: Trait) => {
  const a = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
  return ((a % Math.PI) + Math.PI) % Math.PI;
};

/** Écart d'angle entre deux directions non orientées. */
function ecartAngle(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  return d > Math.PI / 2 ? Math.PI - d : d;
}

/** Projection d'un point sur la droite d'un trait : abscisse et écart. */
function projeter(t: Trait, p: P): { s: number; d: number } {
  const ang = angleDe(t);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const dx = p.x - t.a.x;
  const dy = p.y - t.a.y;
  return { s: dx * ux + dy * uy, d: -dy * ux + dx * uy };
}

/**
 * Les murs que portent ces traits.
 *
 * L'ordre compte : on prend d'abord les aplats (aucune ambiguïté), puis on
 * marie ce qui reste. Un bord déjà marié ne se remarie pas — un mur mitoyen
 * partagerait sinon son bord avec son voisin, et l'on obtiendrait deux murs
 * qui se chevauchent au lieu de deux murs bout à bout.
 */
export function mursDesTraits(traits: Trait[], reglage: ReglageMurs = {}): MurLu[] {
  /*
    LE TRAIT FIN SE CHERCHE EN BAS DE LA SÉRIE, PAS AU MILIEU.

    On prenait la MÉDIANE des épaisseurs pour dire ce qu'est un trait fin.
    Sur un plan d'architecte, cela marche : presque tout y est tracé au
    tire-ligne. Sur un plan d'implantation électrique, où TOUS les murs sont
    des aplats de vingt pixels, la médiane valait vingt — et le seuil de
    l'aplat, quarante-quatre : plus un seul mur n'était reconnu. Le trait de
    dessin, lui, est toujours parmi les plus fins de la feuille, quel que
    soit le reste : c'est là qu'on va le chercher.
  */
  const fin = rang(traits.map((t) => t.ep), 0.2) || 2;
  /*
    ON NE DÉCLARE UN APLAT QU'À PARTIR DE DEUX FOIS ET DEMIE LE TRAIT.

    Les hachures d'un porteur épaississent ses bords d'un pixel ou deux ;
    avec un seuil à deux fois le trait, les deux bords d'un refend hachuré
    passaient pour deux murs en aplat de cinq pixels, posés côte à côte à dix
    centimètres l'un de l'autre. Une cloison en devenait deux, et la pièce
    trois.
  */
  const epaisMin = reglage.epaisMin ?? Math.max(6, fin * 2.5);
  const ecartMin = reglage.ecartMin ?? Math.max(3, fin * 1.5);
  const ecartMax = reglage.ecartMax ?? 60;
  const recouvreMin = reglage.recouvreMin ?? 0.55;
  const longueurMin = reglage.longueurMin ?? Math.max(20, ecartMin * 3);

  const out: MurLu[] = [];
  const restants: Trait[] = [];
  /*
    UN BORD DE MUR EST PLEIN D'ENCRE D'UN BOUT À L'AUTRE.

    Les hachures d'un porteur sont régulièrement espacées : leurs pointes
    s'alignent, et la transformée de Hough voit là des droites parfaitement
    parallèles aux bords, à mi-chemin entre eux. Elles se mariaient avec le
    vrai bord et rendaient des murs de douze centimètres au lieu de vingt.
    Un alignement de pointes n'est couvert d'encre qu'à moitié : c'est ce
    qui le trahit, et rien d'autre ne le pouvait.
  */
  const pleinMin = reglage.pleinMin ?? 0.8;
  for (const brut of traits) {
    if (brut.plein < pleinMin) continue;
    const t = remettreDroit(brut);
    if (t.len < longueurMin) continue;
    if (t.ep >= epaisMin) {
      out.push({ a: t.a, b: t.b, ep: t.ep, facon: 'aplat', len: t.len });
    } else {
      restants.push(t);
    }
  }

  // Les couples de bords, du plus solide au plus douteux.
  interface Couple {
    i: number;
    j: number;
    ecart: number;
    recouvre: number;
    s0: number;
    s1: number;
  }
  const couples: Couple[] = [];
  for (let i = 0; i < restants.length; i++) {
    for (let j = i + 1; j < restants.length; j++) {
      const A = restants[i];
      const B = restants[j];
      if (ecartAngle(angleDe(A), angleDe(B)) > 0.07) continue;
      // DEUX BORDS D'UN MÊME MUR SONT TRACÉS PAREIL. Sans cette règle, le
      // bord d'un mur épousait la ligne de cote qui court à quarante-cinq
      // centimètres devant lui, et l'on obtenait un mur de trente-trois
      // pixels d'épaisseur posé en dehors du logement.
      const gros = Math.max(A.ep, B.ep);
      const mince = Math.min(A.ep, B.ep);
      if (gros > mince * 1.8) continue;
      const pa = projeter(A, B.a);
      const pb = projeter(A, B.b);
      const ecart = (pa.d + pb.d) / 2;
      if (Math.abs(ecart) < ecartMin || Math.abs(ecart) > ecartMax) continue;
      // Les deux bords doivent SE FAIRE FACE, et pas seulement se ressembler.
      const s0 = Math.max(0, Math.min(pa.s, pb.s));
      const s1 = Math.min(A.len, Math.max(pa.s, pb.s));
      const recouvre = s1 - s0;
      if (recouvre < recouvreMin * Math.min(A.len, B.len)) continue;
      // UN MUR EST QUATRE FOIS PLUS LONG QU'ÉPAIS, au minimum. Les hachures
      // d'un porteur sont des obliques courtes, parallèles entre elles et
      // régulièrement espacées : deux voisines se mariaient en un mur en
      // biais au beau milieu de la maçonnerie. Un mur de vingt centimètres
      // qui ferait moins de quatre-vingts centimètres de long n'existe pas — et
      // c'est déjà la largeur d'un jambage entre deux portes.
      if (recouvre < 4 * Math.abs(ecart)) continue;
      couples.push({ i, j, ecart, recouvre, s0, s1 });
    }
  }
  couples.sort((x, y) => {
    // Le plus long recouvrement d'abord ; à égalité, le couple le plus
    // serré : deux murs parallèles proches ne doivent pas se voler un bord.
    if (y.recouvre !== x.recouvre) return y.recouvre - x.recouvre;
    return Math.abs(x.ecart) - Math.abs(y.ecart);
  });

  const marie = new Set<number>();
  for (const c of couples) {
    if (marie.has(c.i) || marie.has(c.j)) continue;
    marie.add(c.i);
    marie.add(c.j);
    const A = restants[c.i];
    const ang = angleDe(A);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    /*
      L'axe court au MILIEU des deux bords, sur la partie qui se fait face.

      Le décalage se prend sur la MÊME normale que celle qui a servi à
      mesurer l'écart — `projeter` mesure vers (uy, −ux). L'avoir pris à
      l'envers posait l'axe du mur de l'autre côté de son bord, c'est-à-dire
      DEHORS : un logement de quatre mètres ressortait avec ses murs vingt
      centimètres trop loin, chacun du mauvais côté.
    */
    const dx = (uy * c.ecart) / 2;
    const dy = (-ux * c.ecart) / 2;
    const a = { x: A.a.x + ux * c.s0 + dx, y: A.a.y + uy * c.s0 + dy };
    const b = { x: A.a.x + ux * c.s1 + dx, y: A.a.y + uy * c.s1 + dy };
    out.push({ a, b, ep: Math.abs(c.ecart), facon: 'double', len: long(a, b) });
  }

  if (reglage.accepterSimples) {
    restants.forEach((t, i) => {
      if (marie.has(i)) return;
      out.push({
        a: t.a,
        b: t.b,
        ep: reglage.accepterSimples as number,
        facon: 'simple',
        len: t.len,
      });
    });
  }

  /*
    UN MUR DEUX FOIS PLUS ÉPAIS QUE LES AUTRES N'EN EST PAS UN.

    Sur une planche cotée, il reste toujours un couple abusif : le bord d'un
    mur et la ligne de cote qui court devant lui, à quarante-cinq
    centimètres, se ressemblent assez pour se marier. Le résultat est un
    « mur » de quarante-cinq centimètres d'épaisseur posé en dehors du
    logement — et il ne se distingue pas par sa position, qu'on ne connaît
    pas encore, mais par son ÉPAISSEUR : sur un plan, les murs sont tous du
    même ordre, de dix à quarante centimètres. Le double de la médiane est
    déjà une anomalie.
  */
  const reunis = fusionnerMurs(out);
  const longs = reunis.filter((m) => m.len > longueurMin * 2);
  const epMedian = rang(longs.map((m) => m.ep), 0.5);
  const garde = epMedian > 0 ? reunis.filter((m) => m.ep <= epMedian * 2) : reunis;
  return garde.sort((x, y) => y.len - x.len);
}

/**
 * Réunit les murs qui n'en font qu'un.
 *
 * Une porte coupe la maçonnerie ; le lecteur voit donc deux morceaux, et il
 * s'agit bien d'UN mur percé d'une ouverture. On les recolle quand ils
 * portent le même axe et que le trou reste sous la LARGEUR D'UNE PORTE.
 *
 * Faute d'échelle à ce stade — on ne sait pas encore ce que vaut un pixel —
 * cette largeur se mesure en épaisseurs de MUR PORTEUR : le mur le plus
 * épais du plan fait vingt à vingt-cinq centimètres, une porte quatre-vingts
 * à quatre-vingt-dix, donc quatre fois plus ; on prend cinq pour la marge.
 * Rapporté à l'épaisseur du mur LUI-MÊME, comme on le faisait, une cloison
 * de dix ne pouvait plus franchir sa propre porte : le refend du T1
 * ressortait en deux morceaux, et la pièce ne se refermait pas.
 */
export function fusionnerMurs(murs: MurLu[]): MurLu[] {
  const restants = murs.map(remettreDroit);
  const porte = OUVERTURE_MAX * Math.max(1, ...murs.map((m) => m.ep));
  const out: MurLu[] = [];
  while (restants.length) {
    let cour = restants.shift() as MurLu;
    let encore = true;
    while (encore) {
      encore = false;
      for (let i = 0; i < restants.length; i++) {
        const autre = restants[i];
        const A: Trait = { ...cour, plein: 1 };
        if (ecartAngle(angleDe(A), angleDe({ ...autre, plein: 1 })) > 0.06) continue;
        const pa = projeter(A, autre.a);
        const pb = projeter(A, autre.b);
        if (Math.abs((pa.d + pb.d) / 2) > Math.max(3, cour.ep * 0.4)) continue;
        const trou = Math.max(0, Math.max(Math.min(pa.s, pb.s) - cour.len, 0 - Math.max(pa.s, pb.s)));
        if (trou > porte) continue;
        const ang = angleDe(A);
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const bouts = [0, cour.len, pa.s, pb.s].sort((x, y) => x - y);
        const a = { x: cour.a.x + ux * bouts[0], y: cour.a.y + uy * bouts[0] };
        const b = { x: cour.a.x + ux * bouts[3], y: cour.a.y + uy * bouts[3] };
        cour = {
          a,
          b,
          ep: (cour.ep * cour.len + autre.ep * autre.len) / (cour.len + autre.len),
          facon: cour.facon,
          len: long(a, b),
        };
        restants.splice(i, 1);
        encore = true;
        break;
      }
    }
    out.push(cour);
  }
  return out;
}

/**
 * SOUDE LES COINS.
 *
 * Deux murs qui se rejoignent ne se touchent presque jamais dans le relevé :
 * l'un s'arrête au bord de l'autre, l'autre au bord du premier, et il reste
 * un carré vide de la taille de l'épaisseur. Un plan qui garde ces trous ne
 * se referme pas en pièces — et la détection des pièces de l'app, elle, ne
 * voit que ce qui se referme.
 *
 * On prolonge donc chaque bout jusqu'à l'INTERSECTION DES AXES, quand elle
 * est proche. Deux murs parallèles n'ont pas d'intersection : ils sont
 * laissés tels quels.
 */
export function souderLesCoins(murs: MurLu[], portee = 2.2): MurLu[] {
  const out = murs.map((m) => ({ ...m, a: { ...m.a }, b: { ...m.b } }));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const A = out[i];
      const B = out[j];
      const angA = angleDe({ ...A, plein: 1 });
      const angB = angleDe({ ...B, plein: 1 });
      if (ecartAngle(angA, angB) < 0.3) continue;
      const x = croisement(A, B);
      if (!x) continue;
      const seuil = portee * Math.max(A.ep, B.ep);
      for (const M of [A, B]) {
        const da = long(M.a, x);
        const db = long(M.b, x);
        if (da < seuil && da < db) M.a = { ...x };
        else if (db < seuil) M.b = { ...x };
      }
    }
  }
  return out.map((m) => ({ ...m, len: long(m.a, m.b) }));
}

/** Le point où se croisent les axes de deux murs, s'il existe. */
function croisement(A: MurLu, B: MurLu): P | null {
  const x1 = A.a.x;
  const y1 = A.a.y;
  const x2 = A.b.x;
  const y2 = A.b.y;
  const x3 = B.a.x;
  const y3 = B.a.y;
  const x4 = B.b.x;
  const y4 = B.b.y;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/**
 * CALE LES MURS SUR LA MAÇONNERIE.
 *
 * Un mur trouvé par appariement de bords s'arrête là où ses DEUX bords ont
 * été relevés d'un seul tenant. Une fenêtre suffit à l'amputer : dans son
 * tableau, les bords cèdent la place aux traits fins du châssis, le couple
 * se casse, et le mur de quatre mètres ressort à trois deux.
 *
 * On repart donc du masque : on avance le long de l'axe, bien au-delà des
 * deux bouts, et l'on demande à chaque pas s'il y a de l'encre DES DEUX
 * CÔTÉS, à un demi-mur de distance. C'est vrai d'un mur en aplat comme d'un
 * mur en double trait. On garde le plus long morceau qui contienne le mur
 * de départ, en tolérant les trous de menuiserie — la même largeur de porte
 * que la fusion, mesurée en épaisseurs de mur porteur.
 */
export function calerSurLeMasque(murs: MurLu[], masque: Masque): MurLu[] {
  const porte = OUVERTURE_MAX * Math.max(1, ...murs.map((m) => m.ep));
  return murs.map((m) => {
    const ux = (m.b.x - m.a.x) / (m.len || 1);
    const uy = (m.b.y - m.a.y) / (m.len || 1);
    const demi = m.ep / 2;
    const bord = (s: number, sens: 1 | -1) => {
      const x0 = m.a.x + ux * s;
      const y0 = m.a.y + uy * s;
      /*
        TROIS PIXELS DE JEU DE PART ET D'AUTRE DU BORD.

        L'épaisseur d'un mur relevée sur un couple de bords n'est jamais
        ronde — quinze virgule neuf pour un mur de vingt, quand un des deux
        bords a été confondu avec un trait de châssis. Deux pixels de jeu
        laissaient le test tomber juste à côté du bord, et le mur refusait de
        s'étendre à sa propre maçonnerie.
      */
      for (let k = -3; k <= 3; k++) {
        const d = sens * demi + k;
        if (allume(masque, Math.round(x0 - uy * d), Math.round(y0 + ux * d))) return true;
      }
      return false;
    };
    const macon = (s: number) => bord(s, 1) && bord(s, -1);

    // La maçonnerie le long de l'axe, bien au-delà des deux bouts, découpée
    // en morceaux d'un seul tenant.
    const debut = Math.round(-m.len);
    const fin = Math.round(m.len * 2);
    /*
      LA SENTINELLE EST `null`, ET NON −1.

      On parcourt l'axe DE PART ET D'AUTRE du mur : les abscisses négatives
      sont des positions comme les autres. Marquer « aucun morceau en cours »
      par −1 confondait donc la sentinelle avec un morceau commencé un pixel
      avant le mur, et TOUT ce qui précédait le mur était perdu. Les murs
      s'étendaient vers l'avant et jamais vers l'arrière — un défaut qui ne se
      voyait que sur le mur percé d'une fenêtre, amputé de son premier mètre.
    */
    const runs: { d: number; f: number }[] = [];
    let ouvert: number | null = null;
    for (let s = debut; s <= fin; s++) {
      if (macon(s)) {
        if (ouvert === null) ouvert = s;
      } else if (ouvert !== null) {
        runs.push({ d: ouvert, f: s - 1 });
        ouvert = null;
      }
    }
    if (ouvert !== null) runs.push({ d: ouvert, f: fin });

    /*
      ON N'ABSORBE QUE CE QUI RESSEMBLE À DE LA MAÇONNERIE.

      Le mur s'étend aux morceaux voisins tant qu'un trou de menuiserie les
      sépare — c'est ainsi qu'un mur de quatre mètres percé d'une fenêtre
      redevient entier. Mais le morceau absorbé doit faire au moins TROIS
      FOIS l'épaisseur : sans cette clause, le refend du T1 sautait par-dessus
      le mur du haut pour aller mordre la LIGNE DE COTE, qui offre elle aussi
      de l'encre des deux côtés de l'axe — trois pixels d'encre, et le mur
      ressortait quarante-cinq centimètres trop long, dehors.
    */
    let d0 = 0;
    let f0 = m.len;
    const assez = 3 * m.ep;
    let bouge = true;
    while (bouge) {
      bouge = false;
      for (const r of runs) {
        const dedans = r.f >= d0 - 1 && r.d <= f0 + 1;
        const avant = r.f < d0 && d0 - r.f <= porte && r.f - r.d >= assez;
        const apres = r.d > f0 && r.d - f0 <= porte && r.f - r.d >= assez;
        if (!dedans && !avant && !apres) continue;
        const nd = Math.min(d0, r.d);
        const nf = Math.max(f0, r.f);
        if (nd !== d0 || nf !== f0) {
          d0 = nd;
          f0 = nf;
          bouge = true;
        }
      }
    }
    const a = { x: m.a.x + ux * d0, y: m.a.y + uy * d0 };
    const b = { x: m.a.x + ux * f0, y: m.a.y + uy * f0 };
    return { ...m, a, b, len: long(a, b) };
  });
}
