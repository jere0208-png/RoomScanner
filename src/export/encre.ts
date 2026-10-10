/**
 * LA CARTE D'ENCRE — ce que la feuille porte déjà, point par point.
 *
 * Relevé du patron : « trop d'éléments se chevauchent sur le plan coté ;
 * fais une technique de placement qui rende la chose plus épurée en gardant
 * chaque cote et notes — par exemple, "surface au sol" rentre en collision
 * avec la cote de mur. On doit innover pour fournir un plan bien lisible. »
 *
 * Le plan imprimé savait déjà qu'un MOT ne doit pas en recouvrir un autre :
 * une réserve unique de boîtes (`posees`) que chaque étiquette interroge.
 * Il ne savait rien des TRAITS. Le trait d'une cote passait sous « surface au
 * sol », l'arc d'une porte sous sa largeur, le contour d'un meuble sous son
 * nom — et un mot barré se lit aussi mal qu'un mot recouvert.
 *
 * La carte est une grille de la fenêtre du plan, à un demi-point : chaque
 * trait, chaque aplat, chaque symbole y est ENCRÉ au moment où sa géométrie
 * est connue — avant que la première étiquette ne cherche sa place. Une
 * étiquette ne demande plus seulement « suis-je libre de mots ? » mais
 * « combien d'encre sous moi ? », et parmi ses places possibles elle prend la
 * plus blanche. C'est ce que fait un dessinateur à la main : il écrit là où
 * le papier est vide.
 *
 * Ce n'est pas un rendu : la carte ignore les couleurs et l'ordre de tracé.
 * Elle répond à une seule question, et elle y répond vite.
 */

export interface PointPage {
  x: number;
  y: number;
}

export interface BoiteEncre {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Un demi-point : un trait de cote fin se voit, une grille d'A4 tient en mémoire. */
const PAS = 0.5;

export class CarteDEncre {
  private readonly cols: number;
  private readonly rangs: number;
  private readonly cases: Uint8Array;

  constructor(
    private readonly x0: number,
    private readonly y0: number,
    largeur: number,
    hauteur: number,
  ) {
    this.cols = Math.max(1, Math.ceil(largeur / PAS));
    this.rangs = Math.max(1, Math.ceil(hauteur / PAS));
    this.cases = new Uint8Array(this.cols * this.rangs);
  }

  private marquer(i: number, j: number) {
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rangs) return;
    this.cases[j * this.cols + i] = 1;
  }

  /** Un trait, à son épaisseur (au moins un demi-point). */
  segment(a: PointPage, b: PointPage, epaisseur = 0.8) {
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
    const r = Math.max(epaisseur / 2, PAS / 2);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / (PAS / 2)));
    const rc = Math.ceil(r / PAS);
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const y = a.y + ((b.y - a.y) * k) / n;
      const ci = Math.floor((x - this.x0) / PAS);
      const cj = Math.floor((y - this.y0) / PAS);
      for (let dj = -rc; dj <= rc; dj++) {
        for (let di = -rc; di <= rc; di++) {
          const px = this.x0 + (ci + di + 0.5) * PAS;
          const py = this.y0 + (cj + dj + 0.5) * PAS;
          if ((px - x) ** 2 + (py - y) ** 2 <= r * r + PAS * PAS * 0.25) this.marquer(ci + di, cj + dj);
        }
      }
    }
  }

  /** Une polyligne ouverte. */
  trait(pts: PointPage[], epaisseur = 0.8) {
    for (let i = 1; i < pts.length; i++) this.segment(pts[i - 1], pts[i], epaisseur);
  }

  /** Un contour fermé. */
  contour(pts: PointPage[], epaisseur = 0.8) {
    if (pts.length < 2) return;
    this.trait([...pts, pts[0]], epaisseur);
  }

  /** Des aplats, en pair-impair : le poché, où chaque pièce est un trou. */
  aplat(contours: PointPage[][]) {
    const aretes: [number, number, number, number][] = [];
    let ymin = Infinity;
    let ymax = -Infinity;
    for (const c of contours) {
      for (let i = 0; i < c.length; i++) {
        const a = c[i];
        const b = c[(i + 1) % c.length];
        if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
        aretes.push([a.x, a.y, b.x, b.y]);
        ymin = Math.min(ymin, a.y);
        ymax = Math.max(ymax, a.y);
      }
    }
    if (aretes.length === 0) return;
    const j0 = Math.max(0, Math.floor((ymin - this.y0) / PAS));
    const j1 = Math.min(this.rangs - 1, Math.ceil((ymax - this.y0) / PAS));
    for (let j = j0; j <= j1; j++) {
      const y = this.y0 + (j + 0.5) * PAS;
      const xs: number[] = [];
      for (const [ax, ay, bx, by] of aretes) {
        if (ay > y !== by > y) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - this.x0) / PAS - 0.5));
        const i1 = Math.min(this.cols - 1, Math.floor((xs[k + 1] - this.x0) / PAS - 0.5));
        for (let i = i0; i <= i1; i++) this.cases[j * this.cols + i] = 1;
      }
    }
  }

  /** Un disque plein : la place d'un symbole. */
  disque(c: PointPage, r: number) {
    const pts: PointPage[] = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    this.aplat([pts]);
  }

  /** Une boîte pleine : un mot, ou le fond blanc d'un cartouche. */
  boite(b: BoiteEncre) {
    this.aplat([
      [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ],
    ]);
  }

  /**
   * L'ENCRE SOUS UNE BOÎTE, en cases d'un demi-point — un liseré d'un quart
   * de point en retrait : deux choses qui se frôlent ne se touchent pas.
   * Ce qui sort de la carte compte pour de l'encre : on n'écrit pas hors du
   * plan.
   */
  sous(b: BoiteEncre): number {
    const m = PAS / 2;
    const i0 = Math.floor((b.x + m - this.x0) / PAS);
    const i1 = Math.floor((b.x + b.w - m - this.x0) / PAS);
    const j0 = Math.floor((b.y + m - this.y0) / PAS);
    const j1 = Math.floor((b.y + b.h - m - this.y0) / PAS);
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rangs) n++;
        else if (this.cases[j * this.cols + i]) n++;
      }
    }
    return n;
  }

  /** L'encre que croiserait un trait — pour choisir où tirer une ligne de cote. */
  leLong(a: PointPage, b: PointPage): number {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / PAS));
    let k = 0;
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n;
      const y = a.y + ((b.y - a.y) * s) / n;
      const i = Math.floor((x - this.x0) / PAS);
      const j = Math.floor((y - this.y0) / PAS);
      if (i < 0 || j < 0 || i >= this.cols || j >= this.rangs) continue;
      if (this.cases[j * this.cols + i]) k++;
    }
    return k;
  }
}

/**
 * LA BOÎTE D'UN MOT ÉCRIT EN BIAIS, telle que `Draw.text` le pose : centré
 * sur (cx, cy) le long de son axe, la hauteur de ses chiffres — et ses quatre
 * coins tournés, pour une boîte droite qui l'enveloppe.
 */
export function boiteDuMot(
  texte: string,
  cx: number,
  cy: number,
  taille: number,
  angle = 0,
): { boite: BoiteEncre; base: PointPage } {
  const r = (angle * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const l = texte.length * taille * 0.5;
  const h = taille * 0.72;
  // Le point que `Draw.text` reçoit : il retire lui-même la demi-longueur.
  const ax = cx + (s * h) / 2;
  const ay = cy - (c * h) / 2;
  const bx = ax - (l / 2) * c;
  const by = ay - (l / 2) * s;
  const xs = [bx, bx + l * c, bx + l * c - h * s, bx - h * s];
  const ys = [by, by + l * s, by + l * s + h * c, by + h * c];
  return {
    base: { x: ax, y: ay },
    boite: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
  };
}
