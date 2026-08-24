/**
 * L'IMAGE D'UN PLAN PAPIER, EN NIVEAUX DE GRIS.
 *
 * Tout ce qui suit — les traits, les murs, les symboles — part d'ici : une
 * photo de plan, c'est-à-dire une feuille prise de biais, éclairée par une
 * ampoule d'un côté et l'ombre de la main de l'autre, avec le grain du
 * papier et parfois le quadrillage du carnet en dessous.
 *
 * ON NE TRAVAILLE PAS EN COULEUR. Un plan d'architecte est un dessin au
 * trait : la couleur n'y porte que du décor (des hachures bleues pour l'eau,
 * un fond crème). Le gris divise le travail par trois et ne perd rien.
 *
 * LE SEUIL EST LOCAL, ET C'EST TOUT LE SUJET. Un seuil global — « plus
 * sombre que 128 » — marche sur un scanner et échoue sur toute photo réelle
 * : le coin à l'ombre passe entièrement en noir, le coin sous la lampe
 * entièrement en blanc, et la moitié du plan disparaît. On compare donc
 * chaque pixel à la MOYENNE DE SON VOISINAGE, ce qui revient à ne garder
 * que ce qui est plus sombre que son propre papier.
 */

/** Une image en niveaux de gris : 0 = noir, 255 = blanc. */
export interface ImageGrise {
  l: number;
  h: number;
  /** `l × h` octets, ligne par ligne, de haut en bas. */
  px: Uint8Array;
}

/** Une image binaire : 1 = encre, 0 = papier. */
export interface Masque {
  l: number;
  h: number;
  on: Uint8Array;
}

export function imageVide(l: number, h: number, fond = 255): ImageGrise {
  const px = new Uint8Array(l * h);
  px.fill(fond);
  return { l, h, px };
}

export function masqueVide(l: number, h: number): Masque {
  return { l, h, on: new Uint8Array(l * h) };
}

/** Le pixel, ou du papier blanc hors des bords : un plan ne se prolonge pas. */
export function pixel(img: ImageGrise, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.l || y >= img.h) return 255;
  return img.px[y * img.l + x];
}

export function allume(m: Masque, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= m.l || y >= m.h) return false;
  return m.on[y * m.l + x] === 1;
}

/**
 * Image intégrale : la somme des pixels du rectangle depuis l'origine.
 *
 * C'est elle qui rend le seuil local praticable — la moyenne d'une fenêtre
 * de 80 pixels de côté se lit alors en quatre accès au lieu de six mille
 * quatre cents, pour chacun du million de pixels de la photo.
 */
export function integrale(img: ImageGrise): Float64Array {
  const { l, h, px } = img;
  const S = new Float64Array((l + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let ligne = 0;
    for (let x = 0; x < l; x++) {
      ligne += px[y * l + x];
      S[(y + 1) * (l + 1) + x + 1] = S[y * (l + 1) + x + 1] + ligne;
    }
  }
  return S;
}

/** Somme d'un rectangle inclusif, bornée à l'image. */
function somme(
  S: Float64Array,
  l: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { total: number; n: number } {
  const a = Math.max(0, x0);
  const b = Math.max(0, y0);
  const c = Math.min(l - 1, x1);
  const d = Math.min(h - 1, y1);
  const L = l + 1;
  const total =
    S[(d + 1) * L + c + 1] - S[b * L + c + 1] - S[(d + 1) * L + a] + S[b * L + a];
  return { total, n: (c - a + 1) * (d - b + 1) };
}

export interface ReglageSeuil {
  /**
   * Côté de la fenêtre de voisinage, en pixels. Par défaut le huitième de
   * la largeur : assez large pour contenir du papier autour de n'importe
   * quel trait, assez étroite pour suivre un dégradé d'éclairage.
   */
  fenetre?: number;
  /**
   * De combien il faut être plus sombre que son voisinage, en pour cent.
   *
   * Douze pour cent : en dessous, le grain du papier passe pour de l'encre
   * et le masque grésille ; au-dessus, un trait fin au crayon disparaît.
   */
  ecart?: number;
}

/**
 * Le seuil local de Bradley et Roth : chaque pixel contre la moyenne de sa
 * fenêtre, moins une marge.
 */
export function binariser(img: ImageGrise, reglage: ReglageSeuil = {}): Masque {
  const { l, h, px } = img;
  const fenetre = Math.max(3, Math.round(reglage.fenetre ?? l / 8));
  const ecart = (reglage.ecart ?? 12) / 100;
  const S = integrale(img);
  const r = Math.floor(fenetre / 2);
  const m = masqueVide(l, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const { total, n } = somme(S, l, h, x - r, y - r, x + r, y + r);
      const moyenne = total / n;
      if (px[y * l + x] < moyenne * (1 - ecart)) m.on[y * l + x] = 1;
    }
  }
  return m;
}

/** Part de l'image couverte d'encre — de quoi refuser une photo vide ou noire. */
export function encre(m: Masque): number {
  let n = 0;
  for (let i = 0; i < m.on.length; i++) n += m.on[i];
  return n / m.on.length;
}

/**
 * Épaissit (rayon > 0) ou amincit (rayon < 0) l'encre.
 *
 * Sert à recoller un trait que la photo a haché avant de le suivre, puis à
 * revenir : une dilatation seule grossirait les murs de deux pixels, et
 * l'épaisseur d'un mur est justement ce qu'on cherche à mesurer.
 */
export function grossir(m: Masque, rayon: number): Masque {
  const r = Math.abs(Math.round(rayon));
  if (r === 0) return { l: m.l, h: m.h, on: m.on.slice() };
  const dilate = rayon > 0;
  const out = masqueVide(m.l, m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.l; x++) {
      let trouve = false;
      for (let dy = -r; dy <= r && !trouve; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const v = allume(m, x + dx, y + dy);
          if (dilate ? v : !v) {
            trouve = true;
            break;
          }
        }
      }
      out.on[y * m.l + x] = (dilate ? trouve : !trouve) ? 1 : 0;
    }
  }
  return out;
}

/** Un îlot d'encre d'un seul tenant. */
export interface Ilot {
  /** Indices des pixels dans le masque d'origine. */
  pixels: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Les îlots d'encre, en huit-connexité.
 *
 * HUIT et non quatre : un trait en biais tracé au crayon n'avance que d'un
 * pixel en diagonale, et la quatre-connexité le débiterait en confettis.
 *
 * Parcours en largeur avec une pile plate — une récursion serait tombée en
 * débordement dès le premier mur d'un plan un peu grand.
 */
export function ilots(m: Masque, minPixels = 1): Ilot[] {
  const vu = new Uint8Array(m.on.length);
  const out: Ilot[] = [];
  const pile: number[] = [];
  for (let d = 0; d < m.on.length; d++) {
    if (m.on[d] !== 1 || vu[d]) continue;
    pile.length = 0;
    pile.push(d);
    vu[d] = 1;
    const pixels: number[] = [];
    let minX = m.l;
    let minY = m.h;
    let maxX = 0;
    let maxY = 0;
    while (pile.length) {
      const i = pile.pop() as number;
      pixels.push(i);
      const x = i % m.l;
      const y = (i - x) / m.l;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.l || ny >= m.h) continue;
          const j = ny * m.l + nx;
          if (m.on[j] !== 1 || vu[j]) continue;
          vu[j] = 1;
          pile.push(j);
        }
      }
    }
    if (pixels.length >= minPixels) out.push({ pixels, minX, minY, maxX, maxY });
  }
  return out;
}

/** L'îlot, redécoupé dans son propre cadre — un symbole n'a pas à porter le plan. */
export function masqueDeLIlot(i: Ilot, source: Masque, marge = 0): Masque {
  const l = i.maxX - i.minX + 1 + marge * 2;
  const h = i.maxY - i.minY + 1 + marge * 2;
  const out = masqueVide(l, h);
  for (const d of i.pixels) {
    const x = d % source.l;
    const y = (d - x) / source.l;
    out.on[(y - i.minY + marge) * l + (x - i.minX + marge)] = 1;
  }
  return out;
}

/**
 * Nombre de TROUS d'un îlot : le nombre d'îlots de papier entièrement
 * cernés d'encre.
 *
 * C'est un descripteur de premier ordre pour reconnaître un symbole, et le
 * seul qui ne se laisse tromper ni par la rotation ni par l'échelle : un
 * point lumineux (un cercle barré d'une croix) a quatre trous, un socle de
 * prise n'en a aucun. On l'obtient en inondant le papier depuis le bord du
 * cadre : ce qui n'a pas été atteint est un trou.
 */
export function trousDe(m: Masque): number {
  const vu = new Uint8Array(m.on.length);
  const pile: number[] = [];
  const pousser = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= m.l || y >= m.h) return;
    const i = y * m.l + x;
    if (vu[i] || m.on[i] === 1) return;
    vu[i] = 1;
    pile.push(i);
  };
  for (let x = 0; x < m.l; x++) {
    pousser(x, 0);
    pousser(x, m.h - 1);
  }
  for (let y = 0; y < m.h; y++) {
    pousser(0, y);
    pousser(m.l - 1, y);
  }
  while (pile.length) {
    const i = pile.pop() as number;
    const x = i % m.l;
    const y = (i - x) / m.l;
    // Quatre-connexité pour le PAPIER : une diagonale d'encre doit fermer
    // un trou, sinon la croix d'un point lumineux ne cernerait rien.
    pousser(x + 1, y);
    pousser(x - 1, y);
    pousser(x, y + 1);
    pousser(x, y - 1);
  }
  let trous = 0;
  const vu2 = new Uint8Array(m.on.length);
  for (let d = 0; d < m.on.length; d++) {
    if (m.on[d] === 1 || vu[d] || vu2[d]) continue;
    trous++;
    pile.length = 0;
    pile.push(d);
    vu2[d] = 1;
    while (pile.length) {
      const i = pile.pop() as number;
      const x = i % m.l;
      const y = (i - x) / m.l;
      const voisins = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of voisins) {
        if (nx < 0 || ny < 0 || nx >= m.l || ny >= m.h) continue;
        const j = ny * m.l + nx;
        if (m.on[j] === 1 || vu[j] || vu2[j]) continue;
        vu2[j] = 1;
        pile.push(j);
      }
    }
  }
  return trous;
}

/** Lecture bilinéaire : une photo redressée ne tombe jamais sur les pixels. */
export function echantillon(img: ImageGrise, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const a = pixel(img, x0, y0);
  const b = pixel(img, x0 + 1, y0);
  const c = pixel(img, x0, y0 + 1);
  const d = pixel(img, x0 + 1, y0 + 1);
  return (
    a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
  );
}
