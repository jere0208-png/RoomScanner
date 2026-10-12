/**
 * LES MEUBLES EN VRAI — des modèles, plus des caisses.
 *
 * Relevé du patron : « il faut avoir des modèles réalistes de meubles aux
 * mesures réelles, non pas des cubes codés ».
 *
 * Jusqu'ici un meuble était une poignée de boîtes en PROPORTIONS (0 à 1 sur
 * chaque axe, voir `furniture3d`) : la silhouette suivait la taille, et c'était
 * précisément le défaut. Une table de deux mètres recevait des pieds de seize
 * centimètres, un canapé de trois places des accoudoirs d'un tiers de mètre,
 * et rien n'avait d'arrondi — un coussin était un pavé.
 *
 * Ici chaque meuble est FABRIQUÉ à ses cotes, en mètres, comme le ferait un
 * menuisier : un pied de table fait quatre centimètres et demi qu'elle mesure
 * un mètre vingt ou deux mètres ; une assise est à quarante-cinq centimètres
 * du sol ; un oreiller a son galbe ; une vasque est creusée ; un livre a son
 * épaisseur. Ce qui dépend de la taille — le nombre de portes d'une armoire,
 * de places d'un canapé, de tablettes d'une bibliothèque, de marches d'un
 * escalier — se COMPTE, au lieu de s'étirer. Et tout tient dans la boîte
 * relevée : largeur, profondeur, hauteur, au millimètre (seule la
 * robinetterie dépasse d'un plan de vasque, comme dans la vraie vie).
 *
 * Les volumes portent des NORMALES LISSÉES (une arête arrondie accroche la
 * lumière au lieu de casser l'ombrage) et une MATIÈRE réelle — tissu, linge,
 * chêne, noyer, laque, inox, chrome, céramique, verre, écran, pierre,
 * feuillage — que SceneKit rend en matériaux physiques : le chêne a son fil,
 * le tissu sa trame, l'inox son reflet (voir `RoomScanVisite.swift`).
 *
 * LE STYLE RESTE CELUI DE LA MISE EN AMBIANCE : neutres chauds, bois clair,
 * linge blanc, lin, quelques notes douces (sauge, argile) sur un coussin ou
 * un plaid. Ces meubles servent à imaginer la pièce, pas à la décorer.
 *
 * Le repère local d'un meuble est celui de son emprise : `x` le long de la
 * largeur (centré), `y` la hauteur depuis son dessous, `z` la profondeur
 * (centrée), l'AVANT en `z = −profondeur/2` — la convention de `furniture3d`
 * et du plan.
 */

/** Les matières réelles. */
export type Matiere =
  | 'tissu'
  | 'linge'
  | 'bois'
  | 'laque'
  | 'inox'
  | 'chrome'
  | 'noir'
  | 'ceramique'
  | 'verre'
  | 'ecran'
  | 'feuillage'
  | 'terre'
  | 'miroir'
  | 'pierre'
  | 'papier'
  /**
   * CE QUI ÉCLAIRE — le diffuseur d'une applique, le verre d'un spot, une
   * ampoule. Il ne reçoit pas la lumière de la scène : il la DONNE, et se
   * peint donc de sa propre teinte, sans ombre (voir `appareils3d`).
   */
  | 'lumiere'
  /**
   * LE VITRAGE D'UNE MENUISERIE — le bleu du dehors. Il ne reçoit pas la
   * lumière de la pièce : il montre le jour, de sa propre teinte, et laisse
   * deviner ce qu'il y a derrière.
   */
  | 'vitrage';

/**
 * Comment la carte graphique rend chaque matière.
 *
 * `code` dit au natif ce qu'il ajoute à la teinte : 1 le fil du bois, 2 la
 * trame d'un tissu, 3 la transparence du verre, 4 les deux faces d'une
 * feuille, 5 la lumière propre d'un luminaire, 6 le jour d'un vitrage. `rugosite` et `metal` sont les deux réglages d'un matériau
 * physique : un chrome est lisse et métallique, un lin rugueux et mat.
 */
export const RENDU: Record<Matiere, { code: number; rugosite: number; metal: number }> = {
  tissu: { code: 2, rugosite: 0.95, metal: 0 },
  linge: { code: 2, rugosite: 0.88, metal: 0 },
  bois: { code: 1, rugosite: 0.58, metal: 0 },
  laque: { code: 0, rugosite: 0.32, metal: 0 },
  inox: { code: 0, rugosite: 0.34, metal: 0.75 },
  chrome: { code: 0, rugosite: 0.12, metal: 0.95 },
  noir: { code: 0, rugosite: 0.5, metal: 0 },
  ceramique: { code: 0, rugosite: 0.14, metal: 0 },
  verre: { code: 3, rugosite: 0.05, metal: 0 },
  ecran: { code: 0, rugosite: 0.18, metal: 0 },
  feuillage: { code: 4, rugosite: 0.65, metal: 0 },
  terre: { code: 0, rugosite: 0.85, metal: 0 },
  miroir: { code: 0, rugosite: 0.03, metal: 1 },
  pierre: { code: 0, rugosite: 0.42, metal: 0 },
  papier: { code: 0, rugosite: 0.8, metal: 0 },
  lumiere: { code: 5, rugosite: 0.5, metal: 0 },
  vitrage: { code: 6, rugosite: 0.05, metal: 0 },
};

/** Le code de l'ombre de contact : un voile doux sous le meuble. */
export const CODE_OMBRE = 9;
/** Nombres d'en-tête d'un groupe, puis huit par sommet, un par indice. */
export const ENTETE_GROUPE = 8;
export const PAR_SOMMET = 8;

/** La palette de la mise en ambiance, en vraies matières. */
export const TEINTES = {
  chene: '#CDAA81',
  noyer: '#71503A',
  linge: '#F4F1EB',
  lin: '#CBC1B0',
  lin2: '#DAD1C2',
  beige: '#E2D6C4',
  laque: '#F1F0EC',
  inox: '#C6CACE',
  chrome: '#E2E5E8',
  noir: '#2C2D30',
  anthracite: '#4A4D52',
  ceramique: '#F7F7F4',
  verre: '#CFE3EA',
  /** Le bleu du dehors, quand la scène ne donne pas le sien. */
  ciel: '#BFE3F4',
  hublot: '#3A4650',
  ecran: '#08090B',
  terre: '#BA7150',
  terreau: '#4A3A2E',
  pierre: '#E6E2DB',
  ardoise: '#5A5E63',
  sauge: '#A9B6A1',
  argile: '#CDA58E',
  bleu: '#8E9FAC',
  vert: ['#4F7B47', '#3F6A3B', '#6C9153'],
  livres: ['#ECE5D6', '#A8B6A3', '#7E8D9A', '#C9A187', '#5F6B74', '#DCCBA8', '#9E6D5C', '#F3F0EA'],
} as const;

type V3 = [number, number, number];
/** Une transformation affine : trois lignes de quatre (rotation | translation). */
export type Affine = number[];
const IDENTITE: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function composer(a: Affine, b: Affine): Affine {
  const o: number[] = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    }
    o[r * 4 + 3] =
      a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
}

/** Une translation. */
export function deplacer(x: number, y: number, z: number): Affine {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
}

/** Une rotation autour d'un axe parallèle à x, y ou z, passant par `pivot`. */
export function tourner(axe: 'x' | 'y' | 'z', angle: number, pivot: V3 = [0, 0, 0]): Affine {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r: Affine =
    axe === 'x'
      ? [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]
      : axe === 'y'
        ? [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]
        : [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
  return composer(deplacer(pivot[0], pivot[1], pivot[2]), composer(r, deplacer(-pivot[0], -pivot[1], -pivot[2])));
}

/** Les sommets et triangles d'une matière, dans le repère du meuble. */
export interface GroupeLocal {
  mat: Matiere;
  couleur: string;
  /**
   * Le rang de la LAMPE dont c'est le diffuseur (voir `lumieres`) : il
   * s'allume et s'éteint avec elle. Il voyage dans le code du groupe —
   * `code + 100 × (rang + 1)` — pour que la vue native le retrouve.
   */
  lampe?: number;
  /** x, y, z, nx, ny, nz, u, v — huit nombres par sommet. */
  v: number[];
  i: number[];
}

export interface ModeleLocal {
  groupes: GroupeLocal[];
  triangles: number;
}

type Cote = 'gauche' | 'droite' | 'bas' | 'haut' | 'avant' | 'arriere';
const COTES: [Cote, Cote][] = [
  ['gauche', 'droite'],
  ['bas', 'haut'],
  ['avant', 'arriere'],
];

interface OptionsBoite {
  /** Rayon des arêtes : un nombre, ou un par axe. */
  r?: number | V3;
  /** Pas des arrondis : 1 donne un chanfrein aux normales lissées. */
  seg?: number;
  /** Les faces qu'on ne verra jamais. */
  sans?: Cote[];
  /** Une cuve vue de l'intérieur : normales et sens retournés. */
  dedans?: boolean;
}

/**
 * L'ATELIER — on y fabrique un meuble pièce par pièce.
 *
 * Chaque pièce s'ajoute au groupe de sa matière et de sa teinte : un meuble
 * finit en quelques groupes, et toute la scène en une douzaine — autant
 * d'appels de dessin, pas un de plus.
 */
export class Atelier {
  private groupes = new Map<string, GroupeLocal>();
  private m: Affine = IDENTITE;

  /**
   * Fabrique sous une transformation (une pièce inclinée, tournée).
   *
   * UN MIROIR RETOURNE LES FACES : les normales suivent la transformation,
   * mais l'ordre des sommets de chaque triangle, lui, s'inverse — et une
   * face dont l'ordre contredit la normale est une face qu'on ne voit pas.
   * Sous une transformation qui retourne l'espace (déterminant négatif), on
   * remet donc l'ordre des triangles posés pendant la fabrication.
   */
  avec(t: Affine, faire: () => void) {
    const avant = this.m;
    this.m = composer(avant, t);
    const miroir =
      t[0] * (t[5] * t[10] - t[6] * t[9]) - t[1] * (t[4] * t[10] - t[6] * t[8]) + t[2] * (t[4] * t[9] - t[5] * t[8]) < 0;
    const departs = miroir ? new Map([...this.groupes].map(([k, g]) => [k, g.i.length])) : null;
    try {
      faire();
    } finally {
      this.m = avant;
      if (departs) {
        for (const [k, g] of this.groupes) {
          for (let j = departs.get(k) ?? 0; j + 2 < g.i.length; j += 3) {
            const x = g.i[j + 1];
            g.i[j + 1] = g.i[j + 2];
            g.i[j + 2] = x;
          }
        }
      }
    }
  }

  private groupe(mat: Matiere, couleur: string): GroupeLocal {
    const cle = `${mat}|${couleur}`;
    let g = this.groupes.get(cle);
    if (!g) {
      g = { mat, couleur, v: [], i: [] };
      this.groupes.set(cle, g);
    }
    return g;
  }

  /**
   * Un sommet. Les coordonnées de texture sont PLANAIRES, en mètres, dans le
   * repère du meuble : le fil d'un plateau court le long de sa largeur, celui
   * d'une porte monte avec elle — comme le bois qu'on débite.
   */
  private sommet(g: GroupeLocal, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    const m = this.m;
    const X = m[0] * x + m[1] * y + m[2] * z + m[3];
    const Y = m[4] * x + m[5] * y + m[6] * z + m[7];
    const Z = m[8] * x + m[9] * y + m[10] * z + m[11];
    let NX = m[0] * nx + m[1] * ny + m[2] * nz;
    let NY = m[4] * nx + m[5] * ny + m[6] * nz;
    let NZ = m[8] * nx + m[9] * ny + m[10] * nz;
    const l = Math.hypot(NX, NY, NZ) || 1;
    NX /= l;
    NY /= l;
    NZ /= l;
    const ax = Math.abs(NX);
    const ay = Math.abs(NY);
    const az = Math.abs(NZ);
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = X;
      v = Z;
    } else if (az >= ax) {
      u = Y;
      v = X;
    } else {
      u = Y;
      v = Z;
    }
    const k = g.v.length / PAR_SOMMET;
    g.v.push(X, Y, Z, NX, NY, NZ, u, v);
    return k;
  }

  /**
   * UNE BOÎTE AUX ARÊTES ARRONDIES.
   *
   * Chaque face est une grille ; les sommets proches d'une arête sont
   * ramenés sur le quart de cylindre (ou le huitième de sphère, au coin) qui
   * l'arrondit, et prennent sa normale. Un rayon par axe permet un coussin
   * plus galbé que large. Rayon nul : une boîte franche, six faces, douze
   * triangles.
   */
  boite(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    mat: Matiere,
    couleur: string,
    o: OptionsBoite = {},
  ) {
    const lo: V3 = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    const hi: V3 = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    if (hi[0] - lo[0] < 1e-5 || hi[1] - lo[1] < 1e-5 || hi[2] - lo[2] < 1e-5) return;
    const rr: V3 = typeof o.r === 'number' ? [o.r, o.r, o.r] : o.r ?? [0, 0, 0];
    // Sous cinq millimètres, un arrondi ne se voit pas à l'échelle d'une
    // pièce — il ne coûterait que des sommets : l'arête reste franche.
    const r = rr.map((x, k) => (x < 0.005 ? 0 : Math.max(0, Math.min(x, (hi[k] - lo[k]) / 2 - 1e-6)))) as V3;
    const seg = Math.max(1, o.seg ?? 1);
    const ech = (k: number): number[] => {
      if (r[k] <= 1e-5) return [lo[k], hi[k]];
      const out = [lo[k]];
      for (let s = 1; s <= seg; s++) out.push(lo[k] + r[k] * (1 - Math.cos((Math.PI / 2) * (s / seg))));
      for (let s = seg; s >= 1; s--) {
        const x = hi[k] - r[k] * (1 - Math.cos((Math.PI / 2) * (s / seg)));
        if (x - out[out.length - 1] > 1e-7) out.push(x);
      }
      if (hi[k] - out[out.length - 1] > 1e-7) out.push(hi[k]);
      return out;
    };
    const g = this.groupe(mat, couleur);
    for (let a = 0; a < 3; a++) {
      for (const s of [-1, 1]) {
        if (o.sans?.includes(COTES[a][s < 0 ? 0 : 1])) continue;
        const ua = (a + 1) % 3;
        const wa = (a + 2) % 3;
        const su = ech(ua);
        const sw = ech(wa);
        const grille: number[][] = [];
        for (let j = 0; j < sw.length; j++) {
          const rang: number[] = [];
          for (let i = 0; i < su.length; i++) {
            const p: V3 = [0, 0, 0];
            p[a] = s < 0 ? lo[a] : hi[a];
            p[ua] = su[i];
            p[wa] = sw[j];
            const dedansDe: V3 = [0, 0, 0];
            const q: V3 = [0, 0, 0];
            for (let k = 0; k < 3; k++) {
              dedansDe[k] = Math.max(lo[k] + r[k], Math.min(hi[k] - r[k], p[k]));
              q[k] = r[k] > 1e-9 ? (p[k] - dedansDe[k]) / r[k] : 0;
            }
            const L = Math.hypot(q[0], q[1], q[2]);
            let pos: V3 = p;
            let n: V3 = [0, 0, 0];
            n[a] = s;
            if (L > 1e-9) {
              const nd = q.map((x) => x / L) as V3;
              pos = dedansDe.map((c, k) => c + nd[k] * r[k]) as V3;
              if (r[a] > 1e-9) {
                const nn = nd.map((x, k) => (r[k] > 1e-9 ? x / r[k] : 0));
                const l2 = Math.hypot(nn[0], nn[1], nn[2]) || 1;
                n = nn.map((x) => x / l2) as V3;
              }
            }
            if (o.dedans) n = n.map((x) => -x) as V3;
            rang.push(this.sommet(g, pos[0], pos[1], pos[2], n[0], n[1], n[2]));
          }
          grille.push(rang);
        }
        const retourne = s < 0 !== !!o.dedans;
        for (let j = 0; j + 1 < grille.length; j++) {
          for (let i = 0; i + 1 < grille[j].length; i++) {
            const A = grille[j][i];
            const B = grille[j][i + 1];
            const C = grille[j + 1][i + 1];
            const D = grille[j + 1][i];
            if (retourne) g.i.push(A, C, B, A, D, C);
            else g.i.push(A, B, C, A, C, D);
          }
        }
      }
    }
  }

  /**
   * UN TUBE — pied, montant, barre de poignée, bec de robinet. Deux rayons :
   * un pied fuselé s'affine vers le sol.
   */
  tube(
    p0: V3,
    p1: V3,
    r0: number,
    r1: number,
    mat: Matiere,
    couleur: string,
    o: { seg?: number; bouts?: 'deux' | 'haut' | 'bas' | 'aucun' } = {},
  ) {
    const seg = o.seg ?? 10;
    const bouts = o.bouts ?? 'deux';
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const dz = p1[2] - p0[2];
    const h = Math.hypot(dx, dy, dz);
    if (h < 1e-6) return;
    const w: V3 = [dx / h, dy / h, dz / h];
    const aide: V3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u: V3 = [
      aide[1] * w[2] - aide[2] * w[1],
      aide[2] * w[0] - aide[0] * w[2],
      aide[0] * w[1] - aide[1] * w[0],
    ];
    const lu = Math.hypot(u[0], u[1], u[2]);
    u = [u[0] / lu, u[1] / lu, u[2] / lu];
    const v: V3 = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    const g = this.groupe(mat, couleur);
    const bas: number[] = [];
    const haut: number[] = [];
    const pente = (r0 - r1) / h;
    for (let k = 0; k <= seg; k++) {
      const t = (k / seg) * Math.PI * 2;
      const ct = Math.cos(t);
      const st = Math.sin(t);
      const rho: V3 = [ct * u[0] + st * v[0], ct * u[1] + st * v[1], ct * u[2] + st * v[2]];
      let n: V3 = [rho[0] + w[0] * pente, rho[1] + w[1] * pente, rho[2] + w[2] * pente];
      const ln = Math.hypot(n[0], n[1], n[2]);
      n = [n[0] / ln, n[1] / ln, n[2] / ln];
      bas.push(this.sommet(g, p0[0] + rho[0] * r0, p0[1] + rho[1] * r0, p0[2] + rho[2] * r0, n[0], n[1], n[2]));
      haut.push(this.sommet(g, p1[0] + rho[0] * r1, p1[1] + rho[1] * r1, p1[2] + rho[2] * r1, n[0], n[1], n[2]));
    }
    for (let k = 0; k < seg; k++) {
      g.i.push(bas[k], bas[k + 1], haut[k + 1], bas[k], haut[k + 1], haut[k]);
    }
    const capuchon = (c: V3, r: number, sens: 1 | -1) => {
      if (r < 1e-6) return;
      const centre = this.sommet(g, c[0], c[1], c[2], w[0] * sens, w[1] * sens, w[2] * sens);
      const anneau: number[] = [];
      for (let k = 0; k <= seg; k++) {
        const t = (k / seg) * Math.PI * 2;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        anneau.push(
          this.sommet(
            g,
            c[0] + (ct * u[0] + st * v[0]) * r,
            c[1] + (ct * u[1] + st * v[1]) * r,
            c[2] + (ct * u[2] + st * v[2]) * r,
            w[0] * sens,
            w[1] * sens,
            w[2] * sens,
          ),
        );
      }
      for (let k = 0; k < seg; k++) {
        if (sens > 0) g.i.push(centre, anneau[k], anneau[k + 1]);
        else g.i.push(centre, anneau[k + 1], anneau[k]);
      }
    };
    if (bouts === 'deux' || bouts === 'haut') capuchon(p1, r1, 1);
    if (bouts === 'deux' || bouts === 'bas') capuchon(p0, r0, -1);
  }

  /**
   * UNE PIÈCE TOURNÉE — vasque, cuvette, pot, pied de table, bouton.
   *
   * Le profil se donne du bas vers le haut, en (rayon, hauteur) : l'extérieur
   * en montant, puis l'intérieur en redescendant pour une pièce creuse. La
   * normale de chaque segment est (Δhauteur, −Δrayon) — elle regarde dehors
   * en montant, vers le haut en rentrant, et vers le creux en redescendant.
   * `sx`/`sz` étirent le tour en ellipse : une cuvette est ovale.
   * Un point marqué `true` est une ARÊTE vive : la lumière y casse.
   */
  tour(
    profil: [number, number, boolean?][],
    cx: number,
    cz: number,
    mat: Matiere,
    couleur: string,
    o: { seg?: number; sx?: number; sz?: number } = {},
  ) {
    const seg = o.seg ?? 24;
    const sx = o.sx ?? 1;
    const sz = o.sz ?? 1;
    const g = this.groupe(mat, couleur);
    const N2: [number, number][] = [];
    for (let k = 0; k + 1 < profil.length; k++) {
      const dr = profil[k + 1][0] - profil[k][0];
      const dy = profil[k + 1][1] - profil[k][1];
      const l = Math.hypot(dr, dy) || 1;
      N2.push([dy / l, -dr / l]);
    }
    const normaleAu = (j: number, k: number): [number, number] => {
      // j : le point ; k : le segment qui l'emploie.
      const vif = profil[j][2] === true;
      if (vif) return N2[k];
      const a = N2[j - 1];
      const b = N2[j];
      if (!a) return b;
      if (!b) return a;
      const n: [number, number] = [a[0] + b[0], a[1] + b[1]];
      const l = Math.hypot(n[0], n[1]) || 1;
      return [n[0] / l, n[1] / l];
    };
    const anneau = (j: number, k: number): number[] => {
      const [r, y] = profil[j];
      const n2 = normaleAu(j, k);
      const out: number[] = [];
      for (let s = 0; s <= seg; s++) {
        const t = (s / seg) * Math.PI * 2;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        let nx = (n2[0] * ct) / sx;
        const ny = n2[1];
        let nz = (n2[0] * st) / sz;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        nz /= l;
        out.push(this.sommet(g, cx + r * ct * sx, y, cz + r * st * sz, nx, ny / l, nz));
      }
      return out;
    };
    for (let k = 0; k + 1 < profil.length; k++) {
      const A = anneau(k, k);
      const B = anneau(k + 1, k);
      for (let s = 0; s < seg; s++) {
        g.i.push(A[s], B[s], B[s + 1], A[s], B[s + 1], A[s + 1]);
      }
    }
  }

  /** Un BLOC à huit coins quelconques (une hotte, un limon) : faces planes. */
  bloc(c: V3[], mat: Matiere, couleur: string) {
    // c : 0-3 le dessous (avant-gauche, avant-droit, arrière-droit, arrière-gauche), 4-7 le dessus.
    const g = this.groupe(mat, couleur);
    const faces: [number, number, number, number][] = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];
    for (const f of faces) {
      const [a, b, cc, d] = f.map((k) => c[k]);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      // Sortante : le dessous regarde en bas, etc. — l'ordre des coins le garantit.
      const l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-12) continue;
      n = [-n[0] / l, -n[1] / l, -n[2] / l];
      const ids = [a, b, cc, d].map((p) => this.sommet(g, p[0], p[1], p[2], n[0], n[1], n[2]));
      g.i.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
    }
  }

  /**
   * UNE FEUILLE : un losange à nervure, vu des deux côtés. Soixante feuilles
   * font un ficus ; trois boules vertes faisaient un brocoli.
   */
  feuille(base: V3, dir: V3, plan: V3, long: number, large: number, couleur: string) {
    const g = this.groupe('feuillage', couleur);
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
    // Le travers de la feuille : perpendiculaire à sa direction, dans `plan`.
    let t: V3 = [d[1] * plan[2] - d[2] * plan[1], d[2] * plan[0] - d[0] * plan[2], d[0] * plan[1] - d[1] * plan[0]];
    const lt = Math.hypot(t[0], t[1], t[2]) || 1;
    t = [t[0] / lt, t[1] / lt, t[2] / lt];
    let n: V3 = [t[1] * d[2] - t[2] * d[1], t[2] * d[0] - t[0] * d[2], t[0] * d[1] - t[1] * d[0]];
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    const at = (a: number, b: number, h = 0): V3 => [
      base[0] + d[0] * a * long + t[0] * b * large + n[0] * h,
      base[1] + d[1] * a * long + t[1] * b * large + n[1] * h,
      base[2] + d[2] * a * long + t[2] * b * large + n[2] * h,
    ];
    const pts = [at(0, 0), at(0.42, -0.5), at(0.45, 0, large * 0.18), at(0.42, 0.5), at(1, 0)];
    const ids = pts.map((p, k) => {
      const pli = k === 1 ? -0.35 : k === 3 ? 0.35 : 0;
      const nn: V3 = [n[0] + t[0] * pli, n[1] + t[1] * pli, n[2] + t[2] * pli];
      return this.sommet(g, p[0], p[1], p[2], nn[0], nn[1], nn[2]);
    });
    g.i.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2], ids[1], ids[2], ids[4], ids[2], ids[3], ids[4]);
  }

  /**
   * Un triangle, tourné pour regarder du côté de `n` : la carte graphique
   * jette les faces vues de dos, et un sens se règle mieux sur la normale
   * voulue que de tête, contour par contour.
   */
  private triangle(g: GroupeLocal, ids: [number, number, number], pts: [V3, V3, V3], n: V3) {
    const [a, b, c] = pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const x = u[1] * v[2] - u[2] * v[1];
    const y = u[2] * v[0] - u[0] * v[2];
    const z = u[0] * v[1] - u[1] * v[0];
    if (x * n[0] + y * n[1] + z * n[2] >= 0) g.i.push(ids[0], ids[1], ids[2]);
    else g.i.push(ids[0], ids[2], ids[1]);
  }

  /**
   * UNE FACETTE PLANE ET CONVEXE — l'avant d'une plaque autour de ses
   * fenêtres, le fond d'un puits de prise, le verre d'une porte de tableau.
   * Une boîte n'a que des faces pleines ; une plaque a des TROUS, et c'est
   * par eux qu'on reconnaît ce qu'elle porte.
   */
  polygone(pts: V3[], n: V3, mat: Matiere, couleur: string) {
    if (pts.length < 3) return;
    const g = this.groupe(mat, couleur);
    const ids = pts.map((p) => this.sommet(g, p[0], p[1], p[2], n[0], n[1], n[2]));
    for (let k = 1; k + 1 < pts.length; k++) {
      this.triangle(g, [ids[0], ids[k], ids[k + 1]], [pts[0], pts[k], pts[k + 1]], n);
    }
  }

  /**
   * UNE BANDE entre deux contours de même nombre de points — le flanc d'une
   * plaque, son biseau, la paroi d'un puits. Chaque point porte sa normale :
   * la lumière glisse le long d'un bord arrondi au lieu de s'y casser.
   */
  bande(a: V3[], b: V3[], na: V3[], nb: V3[], mat: Matiere, couleur: string, ferme = true) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return;
    const g = this.groupe(mat, couleur);
    const ia = a.slice(0, n).map((p, k) => this.sommet(g, p[0], p[1], p[2], na[k][0], na[k][1], na[k][2]));
    const ib = b.slice(0, n).map((p, k) => this.sommet(g, p[0], p[1], p[2], nb[k][0], nb[k][1], nb[k][2]));
    const fin = ferme ? n : n - 1;
    for (let k = 0; k < fin; k++) {
      const k2 = (k + 1) % n;
      const m: V3 = [
        na[k][0] + na[k2][0] + nb[k][0] + nb[k2][0],
        na[k][1] + na[k2][1] + nb[k][1] + nb[k2][1],
        na[k][2] + na[k2][2] + nb[k][2] + nb[k2][2],
      ];
      this.triangle(g, [ia[k], ia[k2], ib[k2]], [a[k], a[k2], b[k2]], m);
      this.triangle(g, [ia[k], ib[k2], ib[k]], [a[k], b[k2], b[k]], m);
    }
  }

  finir(): ModeleLocal {
    const groupes = [...this.groupes.values()].filter((g) => g.i.length > 0);
    return { groupes, triangles: groupes.reduce((n, g) => n + g.i.length / 3, 0) };
  }
}

// ---------------------------------------------------------------- outils

const borne = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/* eslint-disable no-bitwise -- un hachage et un générateur pseudo-aléatoire : du calcul sur 32 bits */
/** Un hasard REPRODUCTIBLE : le même meuble garde les mêmes livres. */
export function graineDe(texte: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

export interface Gabarit {
  W: number;
  D: number;
  H: number;
}

export interface Commande {
  categorie: string;
  modele: string;
  /** La teinte relevée au scan : elle habille le tissu, ou le corps. */
  teinte?: string;
  /**
   * LE DESSUS ET LES CÔTÉS RELEVÉS, chacun sa couleur : le plateau d'une
   * table, le dessus d'un buffet ont la leur ; façades et montants l'autre.
   */
  dessus?: string;
  cotes?: string;
  /** Les précisions de RoomPlan (iOS 17) : « SofaType:lShaped »… */
  attributs: string[];
  hasard: () => number;
}

const attribut = (c: Commande, type: string): string | undefined => {
  const t = type.toLowerCase();
  for (const a of c.attributs) {
    const [k, v] = a.split(':');
    if ((k ?? '').toLowerCase() === t) return (v ?? '').toLowerCase();
  }
  return undefined;
};

/**
 * UNE PORTE — son huisserie, son vantail, ses deux poignées.
 *
 * Relevé du patron : « ajoute des portes 3D lors des ouvrants portes ; si
 * rien derrière, la porte doit être fermée ». Le gabarit est celui de la
 * baie : W sa largeur, D l'épaisseur du mur, H sa hauteur. Le vantail
 * pivote autour de son gond (`PorteGond` : gauche = −x, droite = +x), de
 * `PorteAngle` degrés, vers le côté `PorteSens` (+1 : +z local, la normale du
 * mur). Fermé, il se tient dans l'épaisseur du mur.
 */
function porte3d(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const angle = ((Number(attribut(c, 'PorteAngle') ?? 0) || 0) * Math.PI) / 180;
  const gond = attribut(c, 'PorteGond') === 'droite' ? 1 : -1;
  const sens = attribut(c, 'PorteSens') === '-1' ? -1 : 1;
  const teinte = c.teinte ?? TEINTES.laque;
  const cadre = Math.min(0.05, W * 0.08);
  const prof = D + 0.012;
  // L'huisserie : deux montants et une traverse, un rien plus épais que le mur.
  a.boite(-W / 2, -W / 2 + cadre, 0, H, -prof / 2, prof / 2, 'laque', teinte, { r: 0.004 });
  a.boite(W / 2 - cadre, W / 2, 0, H, -prof / 2, prof / 2, 'laque', teinte, { r: 0.004 });
  a.boite(-W / 2, W / 2, H - cadre, H, -prof / 2, prof / 2, 'laque', teinte, { r: 0.004 });
  // Le vantail, autour de son gond.
  const e = 0.04;
  const xg = gond * (W / 2 - cadre);
  const largeur = Math.max(0.2, W - 2 * cadre - 0.006);
  const hV = Math.max(0.3, H - cadre - 0.01);
  a.avec(tourner('y', gond * sens * angle, [xg, 0, 0]), () => {
    const x0 = xg - gond * 0.003;
    const x1 = xg - gond * largeur;
    a.boite(x0, x1, 0.008, 0.008 + hV, -e / 2, e / 2, 'laque', teinte, { r: 0.004 });
    // Les poignées, une de chaque côté, à 1,05 m, à l'opposé du gond.
    const xp = xg - gond * (largeur - 0.065);
    const yp = Math.min(1.05, hV * 0.5);
    for (const cote of [-1, 1]) {
      const zr = cote * (e / 2 + 0.002);
      a.boite(xp - 0.018, xp + 0.018, yp - 0.07, yp + 0.07, zr, zr + cote * 0.008, 'chrome', TEINTES.chrome, { r: 0.004 });
      a.tube([xp, yp + 0.03, zr], [xp, yp + 0.03, zr + cote * 0.05], 0.009, 0.009, 'chrome', TEINTES.chrome, { seg: 10 });
      a.tube([xp, yp + 0.03, zr + cote * 0.05], [xp + gond * 0.12, yp + 0.03, zr + cote * 0.05], 0.009, 0.009, 'chrome', TEINTES.chrome, { seg: 10 });
    }
  });
}

/**
 * UNE FENÊTRE, UNE PORTE-FENÊTRE, UNE BAIE COULISSANTE — son dormant, ses
 * vantaux, leurs vitrages au bleu du dehors, la crémone côté pièce.
 *
 * Relevé du patron : « fais aussi un 3D pour les ouvrants baie et fenêtres,
 * avec le bleu de dehors pour les espaces vitrés ». Le gabarit est celui de
 * la baie : W sa largeur, D l'épaisseur du mur, H sa hauteur. La menuiserie
 * se pose côté pièce dans l'épaisseur (`FenetreSens` : +1, la pièce est en
 * +z local), comme on la pose chez nous, et reste FERMÉE :
 *   — `fenetre` : un ou deux vantaux à la française, la crémone au milieu ;
 *   — `portefenetre` : la même, jusqu'au sol, un soubassement plus haut et
 *     un seuil plat ;
 *   — `coulissant` : deux vantaux sur deux rails qui se recouvrent, une
 *     poignée cuvette sur chaque montant extérieur.
 */
function fenetre3d(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const type = attribut(c, 'FenetreType') ?? 'fenetre';
  const sens = attribut(c, 'FenetreSens') === '-1' ? -1 : 1;
  const vantaux = Math.max(1, Math.min(4, Math.round(Number(attribut(c, 'Vantaux') ?? 1) || 1)));
  // Vu du dehors (la maquette), un verre clair qu'on traverse du regard ;
  // vu du dedans (la visite), le jour bleu.
  const clair = attribut(c, 'Vitrage') === 'clair';
  const vitre = clair ? TEINTES.verre : c.teinte ?? TEINTES.ciel;
  const matVitre: Matiere = clair ? 'verre' : 'vitrage';
  const blanc = TEINTES.laque;
  const auSol = type === 'portefenetre' || type === 'coulissant';
  // Le dormant : un cadre de cinq centimètres, côté pièce dans l'épaisseur.
  const dorm = Math.min(0.055, W * 0.08, H * 0.08);
  const pD = Math.min(0.07, Math.max(0.035, D * 0.7));
  const zc = sens * Math.max(0, D / 2 - pD / 2 - 0.015);
  const z0 = zc - pD / 2;
  const z1 = zc + pD / 2;
  const bas = auSol ? 0.02 : dorm;
  a.boite(-W / 2, -W / 2 + dorm, 0, H, z0, z1, 'laque', blanc, { r: 0.003 });
  a.boite(W / 2 - dorm, W / 2, 0, H, z0, z1, 'laque', blanc, { r: 0.003 });
  a.boite(-W / 2 + dorm, W / 2 - dorm, H - dorm, H, z0, z1, 'laque', blanc, { r: 0.003 });
  a.boite(-W / 2 + dorm, W / 2 - dorm, 0, bas, z0, z1, auSol ? 'inox' : 'laque', auSol ? TEINTES.inox : blanc, { r: 0.003 });
  const xi0 = -W / 2 + dorm;
  const xi1 = W / 2 - dorm;
  const yi0 = bas;
  const yi1 = H - dorm;
  if (xi1 - xi0 < 0.1 || yi1 - yi0 < 0.1) return;

  /** Un vantail : son cadre, son vitrage. Rend l'abscisse de ses montants. */
  const vantail = (x0: number, x1: number, zv: number, ep: number, soubassement: number) => {
    const p = Math.min(0.06, (x1 - x0) * 0.16);
    const pb = Math.max(p, soubassement);
    a.boite(x0, x0 + p, yi0, yi1, zv - ep / 2, zv + ep / 2, 'laque', blanc, { r: 0.003 });
    a.boite(x1 - p, x1, yi0, yi1, zv - ep / 2, zv + ep / 2, 'laque', blanc, { r: 0.003 });
    a.boite(x0 + p, x1 - p, yi1 - p, yi1, zv - ep / 2, zv + ep / 2, 'laque', blanc, { r: 0.003 });
    a.boite(x0 + p, x1 - p, yi0, yi0 + pb, zv - ep / 2, zv + ep / 2, 'laque', blanc, { r: 0.003 });
    // Le vitrage : le bleu du dehors, en retrait d'un rien dans son cadre.
    a.boite(x0 + p, x1 - p, yi0 + pb, yi1 - p, zv - 0.012, zv + 0.012, matVitre, vitre);
  };
  // La poignée, côté pièce, à hauteur de main.
  const yMain = auSol ? Math.min(1.05, (yi0 + yi1) / 2) : (yi0 + yi1) / 2;
  const cremone = (x: number, zFace: number) => {
    a.boite(x - 0.014, x + 0.014, yMain - 0.045, yMain + 0.045, zFace, zFace + sens * 0.01, 'laque', blanc, { r: 0.004 });
    a.tube([x, yMain, zFace + sens * 0.01], [x, yMain, zFace + sens * 0.035], 0.008, 0.008, 'laque', blanc, { seg: 8 });
    a.tube([x, yMain, zFace + sens * 0.035], [x, yMain - 0.11, zFace + sens * 0.035], 0.008, 0.008, 'laque', blanc, { seg: 8 });
  };

  if (type === 'coulissant') {
    // Deux rails, deux vantaux qui se recouvrent de quatre centimètres.
    const milieu = (xi0 + xi1) / 2;
    const recouvre = 0.04;
    const ep = 0.035;
    const zExt = zc - sens * 0.02;
    const zInt = zc + sens * 0.02;
    vantail(xi0, milieu + recouvre / 2, zExt, ep, 0.08);
    vantail(milieu - recouvre / 2, xi1, zInt, ep, 0.08);
    // Les poignées cuvettes, sur les montants extérieurs, côté pièce.
    for (const [x, zv] of [
      [xi0 + 0.03, zExt],
      [xi1 - 0.03, zInt],
    ] as const) {
      const zf = zv + sens * (ep / 2);
      a.boite(x - 0.011, x + 0.011, yMain - 0.13, yMain + 0.13, zf, zf + sens * 0.012, 'inox', TEINTES.inox, { r: 0.004 });
    }
    return;
  }

  // À la française : les vantaux côte à côte, la crémone sur le battement.
  const ep = 0.055;
  const zv = zc + sens * 0.004;
  const pas = (xi1 - xi0) / vantaux;
  for (let k = 0; k < vantaux; k++) {
    vantail(xi0 + k * pas + 0.002, xi0 + (k + 1) * pas - 0.002, zv, ep, auSol ? 0.13 : 0);
  }
  const xc = vantaux >= 2 ? xi0 + Math.floor(vantaux / 2) * pas + 0.03 : xi1 - 0.035;
  cremone(xc, zv + sens * (ep / 2));
}

/** Quatre pieds ronds, fuselés vers le sol. */
function pieds(
  a: Atelier,
  xs: [number, number],
  zs: [number, number],
  y0: number,
  y1: number,
  rHaut: number,
  rBas: number,
  mat: Matiere,
  couleur: string,
) {
  for (const x of xs) for (const z of zs) a.tube([x, y0, z], [x, y1, z], rBas, rHaut, mat, couleur, { seg: 8, bouts: 'bas' });
}

/**
 * CE QUI DÉPASSE D'UNE FAÇADE : une poignée barre (plots et barre) ou un
 * bouton. La façade recule d'autant dans l'emprise : la profondeur relevée
 * d'un meuble se mesure poignées comprises.
 */
const SAILLIE_POIGNEE = 0.036;
const SAILLIE_BOUTON = 0.024;

/** Une poignée barre : deux plots et la barre, en avant d'une façade. */
function poignee(a: Atelier, x: number, y: number, zFace: number, long: number, verticale: boolean) {
  const saillie = 0.028;
  const r = 0.006;
  const d = long / 2;
  const p0: V3 = verticale ? [x, y - d, zFace - saillie] : [x - d, y, zFace - saillie];
  const p1: V3 = verticale ? [x, y + d, zFace - saillie] : [x + d, y, zFace - saillie];
  a.tube(p0, p1, r, r, 'inox', TEINTES.inox, { seg: 8 });
  const plot = (p: V3) => a.tube([p[0], p[1], zFace], [p[0], p[1], zFace - saillie], 0.0045, 0.0045, 'inox', TEINTES.inox, { seg: 6, bouts: 'aucun' });
  const e = d * 0.82;
  plot(verticale ? [x, y - e, 0] : [x - e, y, 0]);
  plot(verticale ? [x, y + e, 0] : [x + e, y, 0]);
}

/** Un bouton de meuble, rond. */
function bouton(a: Atelier, x: number, y: number, zFace: number, couleur = TEINTES.noyer, mat: Matiere = 'bois') {
  a.tube([x, y, zFace], [x, y, zFace - 0.022], 0.012, 0.016, mat, couleur, { seg: 10, bouts: 'haut' });
}

// ------------------------------------------------------------ ce qui se compte

/** Les places d'un canapé, d'après la largeur entre ses accoudoirs. */
export const placesDuCanape = (largeurUtile: number) => (largeurUtile > 1.75 ? 3 : 2);
/** Les portes d'une armoire : une par demi-mètre. */
export const portesDArmoire = (W: number) => Math.max(1, Math.round(W / 0.5));
/** Les marches d'un escalier : dix-huit centimètres de hauteur chacune. */
export const marchesDEscalier = (H: number) => borne(Math.round(H / 0.18), 3, 20);

// ------------------------------------------------------------ les modèles

/*
  LE LIT — cadre et pieds de bois, matelas, couette qui retombe, oreillers
  galbés, tête de lit capitonnée en lés, plaid au pied.
*/
function lit(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  if (c.modele.startsWith('litsuperpose')) return litSuperpose(a, { W, D, H }, c);
  if (c.modele.startsWith('litbebe') || (W < 0.8 && D < 1.45)) return berceau(a, { W, D, H });
  const tete = H >= 0.7 ? borne(D * 0.045, 0.06, 0.09) : 0;
  const zT = D / 2 - tete;
  const dessusCouette = tete ? Math.min(0.6, H - 0.18) : H - Math.min(0.12, H * 0.2);
  const dessusMatelas = dessusCouette - 0.045;
  const hOreiller = Math.min(0.15, H - dessusMatelas - 0.012);
  const hCadre = borne(dessusMatelas - 0.22, 0.1, 0.36);
  const hPied = Math.min(0.1, hCadre * 0.45);
  const tissuTete = c.teinte ?? TEINTES.lin2;
  // Les pieds et le cadre.
  pieds(a, [-W / 2 + 0.07, W / 2 - 0.07], [-D / 2 + 0.07, zT - 0.07], 0, hPied, 0.024, 0.018, 'bois', TEINTES.chene);
  a.boite(-W / 2 + 0.005, W / 2 - 0.005, hPied, hCadre, -D / 2 + 0.005, zT, 'bois', TEINTES.chene, { r: 0.012 });
  // Le matelas.
  a.boite(-W / 2 + 0.03, W / 2 - 0.03, hCadre, dessusMatelas, -D / 2 + 0.03, zT - 0.01, 'linge', TEINTES.linge, {
    r: [0.04, 0.035, 0.04],
    seg: 2,
    sans: ['bas'],
  });
  // La couette, qui couvre les deux tiers et retombe sur les flancs.
  const zCouv = zT - Math.min(0.62, D * 0.3);
  a.boite(-W / 2, W / 2, hCadre - 0.02, dessusCouette, -D / 2, zCouv, 'linge', TEINTES.beige, {
    r: [0.035, 0.03, 0.035],
    seg: 2,
    sans: ['bas'],
  });
  // Le rabat du drap, en bandeau blanc au bord de la couette.
  a.boite(-W / 2 + 0.004, W / 2 - 0.004, dessusCouette - 0.03, dessusCouette + 0.012, zCouv - 0.24, zCouv + 0.005, 'linge', TEINTES.linge, {
    r: [0.02, 0.018, 0.02],
    seg: 2,
    sans: ['bas'],
  });
  // Le plaid au pied du lit.
  a.boite(-W / 2 - 0.0, W / 2, dessusCouette - 0.006, dessusCouette + 0.014, -D / 2 + 0.12, -D / 2 + 0.5, 'tissu', TEINTES.argile, {
    r: [0.012, 0.009, 0.012],
    sans: ['bas'],
  });
  // Les oreillers, posés contre la tête, à peine inclinés.
  const n = W >= 1.25 ? 2 : 1;
  const largeO = Math.min(0.68, (W - 0.12) / n - 0.05);
  for (let k = 0; k < n; k++) {
    const xc = n === 1 ? 0 : (k === 0 ? -1 : 1) * (largeO / 2 + 0.03);
    a.avec(tourner('x', 0.2, [0, dessusMatelas, zT - 0.03]), () => {
      a.boite(xc - largeO / 2, xc + largeO / 2, dessusMatelas, dessusMatelas + hOreiller, zT - 0.47, zT - 0.05, 'linge', TEINTES.linge, {
        r: [0.07, 0.07, 0.09],
        seg: 2,
      });
    });
  }
  // Un coussin d'accent devant eux, sur un grand lit.
  const hAccent = Math.min(0.3, (H - dessusMatelas - 0.02) / Math.cos(0.42));
  if (W >= 1.35 && hAccent > 0.18) {
    a.avec(tourner('x', 0.42, [0, dessusMatelas, zT - 0.5]), () => {
      a.boite(-0.24, 0.24, dessusMatelas, dessusMatelas + hAccent, zT - 0.62, zT - 0.5, 'tissu', TEINTES.sauge, {
        r: [0.05, 0.06, 0.05],
        seg: 2,
      });
    });
  }
  // La tête de lit, capitonnée en lés verticaux.
  if (tete) {
    const les = Math.max(2, Math.round(W / 0.3));
    const pas = W / les;
    for (let k = 0; k < les; k++) {
      a.boite(-W / 2 + k * pas, -W / 2 + (k + 1) * pas, hPied, H, zT, D / 2, 'tissu', tissuTete, {
        r: [0.028, 0.03, 0.03],
        sans: ['bas', 'arriere'],
      });
    }
  }
}

/* Le lit de bébé : barreaux, rails, matelas. */
function berceau(a: Atelier, { W, D, H }: Gabarit) {
  const bois = TEINTES.laque;
  const e = 0.04;
  for (const x of [-W / 2 + e / 2, W / 2 - e / 2]) {
    for (const z of [-D / 2 + e / 2, D / 2 - e / 2]) a.boite(x - e / 2, x + e / 2, 0, H, z - e / 2, z + e / 2, 'laque', bois, { r: 0.008 });
  }
  const yMat = Math.min(0.3, H * 0.35);
  a.boite(-W / 2 + e, W / 2 - e, yMat - 0.03, yMat, -D / 2 + e, D / 2 - e, 'laque', bois);
  a.boite(-W / 2 + e + 0.01, W / 2 - e - 0.01, yMat, yMat + 0.1, -D / 2 + e + 0.01, D / 2 - e - 0.01, 'linge', TEINTES.linge, { r: 0.03, seg: 2 });
  for (const [y0, y1] of [
    [yMat - 0.06, yMat - 0.02],
    [H - 0.05, H],
  ]) {
    a.boite(-W / 2 + e, W / 2 - e, y0, y1, -D / 2 + 0.005, -D / 2 + e - 0.005, 'laque', bois, { r: 0.006 });
    a.boite(-W / 2 + e, W / 2 - e, y0, y1, D / 2 - e + 0.005, D / 2 - 0.005, 'laque', bois, { r: 0.006 });
    a.boite(-W / 2 + 0.005, -W / 2 + e - 0.005, y0, y1, -D / 2 + e, D / 2 - e, 'laque', bois, { r: 0.006 });
    a.boite(W / 2 - e + 0.005, W / 2 - 0.005, y0, y1, -D / 2 + e, D / 2 - e, 'laque', bois, { r: 0.006 });
  }
  const barreaux = (x0: number, x1: number, z: number, axeX: boolean) => {
    const n = Math.max(2, Math.floor(Math.abs(x1 - x0) / 0.075));
    for (let k = 1; k < n; k++) {
      const t = x0 + ((x1 - x0) * k) / n;
      const p0: V3 = axeX ? [t, yMat - 0.02, z] : [z, yMat - 0.02, t];
      const p1: V3 = axeX ? [t, H - 0.05, z] : [z, H - 0.05, t];
      a.tube(p0, p1, 0.011, 0.011, 'laque', bois, { seg: 8, bouts: 'aucun' });
    }
  };
  barreaux(-W / 2 + e, W / 2 - e, -D / 2 + e / 2, true);
  barreaux(-W / 2 + e, W / 2 - e, D / 2 - e / 2, true);
  barreaux(-D / 2 + e, D / 2 - e, -W / 2 + e / 2, false);
  barreaux(-D / 2 + e, D / 2 - e, W / 2 - e / 2, false);
}

/*
  LE CANAPÉ — et le fauteuil, qui en est un à une place. Les places se
  COMPTENT d'après la largeur ; l'assise est à quarante-cinq centimètres,
  les accoudoirs ont l'épaisseur d'un accoudoir, le dossier s'incline.
  En angle quand RoomPlan le dit — ou quand l'emprise ne laisse pas de doute.
*/
function canape(a: Atelier, { W, D, H }: Gabarit, c: Commande, fauteuil = false) {
  /*
    LA MÉRIDIENNE À GAUCHE — un canapé d'angle réuni au scan dit de quel
    côté elle avance (`SofaAngle`, voir `canapeAngle`). Le dessin la pose à
    droite : on le fabrique dans un miroir.
  */
  if (attribut(c, 'SofaAngle') === 'gauche') {
    const droit = { ...c, attributs: c.attributs.filter((x) => !/^sofaangle:/i.test(x)) };
    a.avec([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], () => canape(a, { W, D, H }, droit, fauteuil));
    return;
  }
  const type = attribut(c, 'SofaType');
  const unePlace = fauteuil || type === 'singleseat' || W < 1.15;
  const angle = !unePlace && (type === 'lshaped' || (type === undefined && D > 1.35 && W > 1.9));
  const tissu = c.teinte ?? TEINTES.lin;
  const coussin = c.teinte ?? TEINTES.lin2;
  const hPied = Math.min(0.1, H * 0.13);
  const hBase = Math.min(0.3, H * 0.38);
  const hAssise = Math.min(0.46, H * 0.57);
  const hBras = Math.min(0.64, H * 0.8);
  const bras = unePlace ? borne(W * 0.16, 0.1, 0.19) : borne(W * 0.075, 0.12, 0.2);
  const dDos = borne(D * 0.22, 0.14, 0.24);
  // La profondeur du corps principal : tout, ou le dossier long d'un angle.
  const dCorps = angle ? Math.min(1.0, D * 0.55) : D;
  const zAv = D / 2 - dCorps;
  const zDos = D / 2 - dDos;
  pieds(a, [-W / 2 + 0.06, W / 2 - 0.06], [zAv + 0.06, D / 2 - 0.06], 0, hPied, 0.022, 0.015, 'bois', TEINTES.noyer);
  // Accoudoirs : le gauche suit le corps ; le droit, en angle, toute la profondeur.
  a.boite(-W / 2, -W / 2 + bras, hPied, hBras, zAv, D / 2, 'tissu', tissu, { r: [0.045, 0.05, 0.045], seg: 2, sans: ['bas'] });
  a.boite(W / 2 - bras, W / 2, hPied, hBras, angle ? -D / 2 : zAv, D / 2, 'tissu', tissu, { r: [0.045, 0.05, 0.045], seg: 2, sans: ['bas'] });
  if (angle) {
    const xm = W / 2 - bras - Math.min(0.95, (W - 2 * bras) * 0.45) + 0.06;
    pieds(a, [xm, W / 2 - 0.06], [-D / 2 + 0.06, -D / 2 + 0.06], 0, hPied, 0.022, 0.015, 'bois', TEINTES.noyer);
  }
  // Le dossier et le socle.
  const xg = -W / 2 + bras;
  const xd = W / 2 - bras;
  a.boite(xg, xd, hPied, H - 0.09, zDos, D / 2, 'tissu', tissu, { r: [0.03, 0.04, 0.035], sans: ['bas'] });
  a.boite(xg, xd, hPied, hBase, zAv, zDos, 'tissu', tissu, { r: 0.02, sans: ['bas'] });
  // Les coussins d'assise.
  const n = unePlace ? 1 : placesDuCanape(xd - xg);
  const jeu = 0.008;
  const lc = (xd - xg - jeu * (n + 1)) / n;
  for (let k = 0; k < n; k++) {
    const x0 = xg + jeu + k * (lc + jeu);
    a.boite(x0, x0 + lc, hBase, hAssise, zAv, zDos, 'tissu', coussin, { r: [0.05, 0.045, 0.05], seg: 2 });
  }
  // La méridienne d'un angle : socle et coussin jusqu'à l'avant.
  if (angle) {
    const largeM = Math.min(0.95, (xd - xg) * 0.45);
    a.boite(xd - largeM, xd, hPied, hBase, -D / 2, zAv, 'tissu', tissu, { r: 0.02, sans: ['bas'] });
    a.boite(xd - largeM + jeu, xd - jeu, hBase, hAssise, -D / 2, zAv + 0.02, 'tissu', coussin, { r: [0.05, 0.045, 0.05], seg: 2 });
  }
  // Les coussins de dossier, inclinés.
  for (let k = 0; k < n; k++) {
    const x0 = xg + jeu + k * (lc + jeu);
    a.avec(tourner('x', 0.13, [0, hAssise, zDos]), () => {
      a.boite(x0, x0 + lc, hAssise - 0.02, H - 0.035, zDos - 0.17, zDos + 0.01, 'tissu', coussin, {
        r: [0.06, 0.06, 0.07],
        seg: 2,
      });
    });
  }
  // Deux coussins déco aux extrémités, sur un vrai canapé.
  if (!unePlace && W > 1.5) {
    const cote = Math.min(0.4, (H - hAssise - 0.03 - 0.15 * Math.sin(0.45)) / Math.cos(0.45));
    for (const [sens, teinte] of [
      [-1, TEINTES.argile],
      [1, TEINTES.sauge],
    ] as [number, string][]) {
      const xc = sens * (W / 2 - bras - cote / 2 - 0.05);
      a.avec(tourner('x', 0.45, [xc, hAssise, zDos - 0.17]), () => {
        a.boite(xc - cote / 2, xc + cote / 2, hAssise, hAssise + cote, zDos - 0.32, zDos - 0.18, 'tissu', teinte, {
          r: [0.06, 0.07, 0.05],
          seg: 2,
        });
      });
    }
  }
}

/*
  LA CHAISE — et ses cousins : tabouret, banc, fauteuil de bureau.
*/
function chaise(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  const type = attribut(c, 'ChairType');
  if (c.modele.startsWith('fauteuilbureau') || type === 'swivel') return fauteuilDeBureau(a, g, c);
  if (c.modele.startsWith('fauteuil')) return canape(a, g, c, true);
  if (c.modele.startsWith('banc') || (W > 0.8 && H < 0.62)) return banc(a, g, c);
  if (type === 'stool' || attribut(c, 'ChairBackType') === 'missing' || H < 0.78) return tabouret(a, g, c);
  if (attribut(c, 'ChairArmType') === 'existing' && W > 0.62) return canape(a, g, c, true);
  const hS = Math.min(0.46, H * 0.52);
  const bois = TEINTES.chene;
  const zAr = D / 2 - 0.035;
  // Pieds avant fuselés, montants arrière qui filent jusqu'au dossier.
  pieds(a, [-W / 2 + 0.035, W / 2 - 0.035], [-D / 2 + 0.035, -D / 2 + 0.035], 0, hS - 0.03, 0.017, 0.012, 'bois', bois);
  for (const x of [-W / 2 + 0.035, W / 2 - 0.035]) {
    a.tube([x, 0, zAr], [x, hS, zAr - 0.005], 0.012, 0.016, 'bois', bois, { seg: 10, bouts: 'bas' });
    a.tube([x, hS, zAr - 0.005], [x, H - 0.01, D / 2 - 0.016], 0.016, 0.014, 'bois', bois, { seg: 10 });
  }
  // L'assise : la ceinture de bois, la galette de lin.
  a.boite(-W / 2 + 0.01, W / 2 - 0.01, hS - 0.06, hS - 0.025, -D / 2 + 0.01, zAr, 'bois', bois, { r: 0.006 });
  a.boite(-W / 2 + 0.012, W / 2 - 0.012, hS - 0.03, hS, -D / 2 + 0.008, zAr - 0.01, 'tissu', c.teinte ?? TEINTES.lin, {
    r: [0.02, 0.012, 0.02],
    seg: 1,
  });
  // Le dossier cintré : un bandeau incliné.
  a.avec(tourner('x', 0.06, [0, hS, zAr]), () => {
    a.boite(-W / 2 + 0.03, W / 2 - 0.03, H - 0.22, H - 0.04, zAr - 0.04, zAr - 0.017, 'bois', bois, { r: 0.01, seg: 1 });
  });
  // Les traverses basses.
  a.tube([-W / 2 + 0.035, 0.16, -D / 2 + 0.035], [-W / 2 + 0.035, 0.16, zAr], 0.008, 0.008, 'bois', bois, { seg: 6, bouts: 'aucun' });
  a.tube([W / 2 - 0.035, 0.16, -D / 2 + 0.035], [W / 2 - 0.035, 0.16, zAr], 0.008, 0.008, 'bois', bois, { seg: 6, bouts: 'aucun' });
}

function tabouret(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const r = Math.min(W, D) / 2;
  const assise = c.teinte ?? TEINTES.chene;
  a.tour(
    [
      [0, H - 0.04],
      [r - 0.012, H - 0.04, true],
      [r, H - 0.028],
      [r, H - 0.012],
      [r - 0.012, H],
      [0, H],
    ],
    0,
    0,
    c.teinte ? 'tissu' : 'bois',
    assise,
    { seg: 32 },
  );
  const e = r * 0.78;
  // Deux millimètres et demi au-dessus du sol : le bout d'un pied INCLINÉ est
  // un disque penché, qui passait sous le sol d'autant.
  const coins: V3[] = [
    [-e, 0.0025, -e],
    [e, 0.0025, -e],
    [e, 0.0025, e],
    [-e, 0.0025, e],
  ];
  for (const p of coins) {
    a.tube(p, [p[0] * 0.55, H - 0.04, p[2] * 0.55], 0.013, 0.016, 'bois', TEINTES.chene, { seg: 8, bouts: 'bas' });
  }
  const yR = H * 0.32;
  for (let k = 0; k < 4; k++) {
    const p = coins[k];
    const q = coins[(k + 1) % 4];
    const f = 1 - (1 - 0.55) * (yR / (H - 0.04));
    a.tube([p[0] * f, yR, p[2] * f], [q[0] * f, yR, q[2] * f], 0.008, 0.008, 'bois', TEINTES.chene, { seg: 6, bouts: 'aucun' });
  }
}

function banc(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const galette = W > 0.7 ? 0.04 : 0;
  const yP = H - galette;
  a.boite(-W / 2, W / 2, yP - 0.035, yP, -D / 2, D / 2, 'bois', TEINTES.chene, { r: 0.006 });
  for (const x of [-W / 2 + 0.04, W / 2 - 0.062]) {
    a.boite(x, x + 0.022, 0, yP - 0.035, -D / 2 + 0.02, D / 2 - 0.02, 'bois', TEINTES.chene, { r: 0.004 });
  }
  a.boite(-W / 2 + 0.06, W / 2 - 0.06, 0.12, 0.14, -D / 2 + 0.03, D / 2 - 0.03, 'bois', TEINTES.chene, { r: 0.003 });
  if (galette) {
    a.boite(-W / 2 + 0.015, W / 2 - 0.015, yP, H, -D / 2 + 0.015, D / 2 - 0.015, 'tissu', c.teinte ?? TEINTES.lin2, {
      r: [0.03, 0.018, 0.03],
      seg: 2,
      sans: ['bas'],
    });
  }
}

function fauteuilDeBureau(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const R = Math.min(W, D) / 2 - 0.03;
  const hS = Math.min(0.48, H * 0.45);
  const tissu = c.teinte ?? TEINTES.anthracite;
  // L'étoile à cinq branches et ses roulettes.
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2;
    const x = Math.sin(ang) * R;
    const z = Math.cos(ang) * R;
    a.tube([0, 0.08, 0], [x, 0.065, z], 0.018, 0.014, 'noir', TEINTES.noir, { seg: 8, bouts: 'haut' });
    a.tube([x - 0.02, 0.028, z], [x + 0.02, 0.028, z], 0.028, 0.028, 'noir', TEINTES.noir, { seg: 8 });
  }
  a.tube([0, 0.06, 0], [0, 0.1, 0], 0.04, 0.035, 'noir', TEINTES.noir, { seg: 12 });
  a.tube([0, 0.1, 0], [0, hS - 0.06, 0], 0.024, 0.024, 'chrome', TEINTES.chrome, { seg: 12 });
  // L'assise et le dossier.
  a.boite(-W / 2 + 0.04, W / 2 - 0.04, hS - 0.08, hS, -D / 2 + 0.03, D / 2 - 0.1, 'tissu', tissu, { r: [0.04, 0.035, 0.04], seg: 1 });
  a.boite(-0.03, 0.03, hS - 0.07, hS + 0.12, D / 2 - 0.11, D / 2 - 0.06, 'noir', TEINTES.noir, { r: 0.01 });
  a.avec(tourner('x', 0.1, [0, hS, D / 2 - 0.08]), () => {
    a.boite(-W / 2 + 0.07, W / 2 - 0.07, hS + 0.08, H - 0.02, D / 2 - 0.17, D / 2 - 0.11, 'tissu', tissu, { r: [0.05, 0.05, 0.025], seg: 2 });
  });
  // Les accoudoirs.
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.05);
    a.tube([x, hS - 0.05, 0.02], [x, hS + 0.18, 0.02], 0.012, 0.012, 'noir', TEINTES.noir, { seg: 8 });
    a.boite(x - 0.03, x + 0.03, hS + 0.18, hS + 0.21, -0.12, 0.12, 'noir', TEINTES.noir, { r: 0.012, seg: 1 });
  }
}

/*
  LA TABLE — à manger, ronde, basse, bout de canapé, bureau.
*/
function table(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  const m = c.modele;
  const forme = attribut(c, 'TableShapeType');
  const ronde = m.startsWith('tableronde') || m.startsWith('boutcanape') || forme === 'circularelliptic' || forme === 'elliptic';
  const basse = m.startsWith('tablebasse') || m.startsWith('boutcanape') || attribut(c, 'TableType') === 'coffee' || H < 0.56;
  const bureau = m.startsWith('bureau') || c.categorie.includes('desk');
  const ep = basse ? 0.03 : 0.035;
  // Le plateau relevé au scan : une table n'est pas toujours en chêne.
  const bois = c.dessus ?? c.teinte ?? TEINTES.chene;
  if (ronde) {
    const R = W / 2;
    a.tour(
      [
        [0, H - ep],
        [R - 0.006, H - ep, true],
        [R, H - ep + 0.006],
        [R, H - 0.006],
        [R - 0.006, H, true],
        [0, H],
      ],
      0,
      0,
      'bois',
      bois,
      { seg: 48, sz: D / W },
    );
    if (basse) {
      // Trois pieds évasés.
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + Math.PI / 6;
        const rx = (W / 2) * 0.72;
        const rz = (D / 2) * 0.72;
        a.tube([Math.cos(ang) * rx, 0.004, Math.sin(ang) * rz], [Math.cos(ang) * rx * 0.72, H - ep, Math.sin(ang) * rz * 0.72], 0.014, 0.019, 'bois', TEINTES.noyer, {
          seg: 10,
          bouts: 'bas',
        });
      }
    } else {
      // Le pied central et son empattement.
      a.tube([0, 0.03, 0], [0, H - ep, 0], 0.045, 0.055, 'bois', bois, { seg: 18, bouts: 'aucun' });
      const rb = Math.min(W, D) * 0.24;
      a.tour(
        [
          [0, 0],
          [rb, 0, true],
          [rb, 0.012],
          [rb * 0.55, 0.035],
          [0, 0.04],
        ],
        0,
        0,
        'bois',
        bois,
        { seg: 32 },
      );
    }
    return;
  }
  // Le plateau.
  a.boite(-W / 2, W / 2, H - ep, H, -D / 2, D / 2, 'bois', bois, { r: basse ? [0.02, 0.005, 0.02] : 0.005, seg: basse ? 2 : 1 });
  if (bureau) {
    // Piètement d'acier noir, et un voile de fond.
    const e = 0.03;
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05 - e]) {
      for (const z of [-D / 2 + 0.05, D / 2 - 0.05 - e]) a.boite(x, x + e, 0, H - ep, z, z + e, 'noir', TEINTES.noir, { r: 0.004 });
      a.boite(x, x + e, H - ep - 0.04, H - ep, -D / 2 + 0.05, D / 2 - 0.05, 'noir', TEINTES.noir, { r: 0.004 });
    }
    a.boite(-W / 2 + 0.08, W / 2 - 0.08, H - ep - 0.3, H - ep - 0.02, D / 2 - 0.07, D / 2 - 0.06, 'bois', bois);
    return;
  }
  if (basse) {
    // Table basse : pieds carrés et tablette.
    const e = 0.04;
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03 - e]) {
      for (const z of [-D / 2 + 0.03, D / 2 - 0.03 - e]) a.boite(x, x + e, 0, H - ep, z, z + e, 'bois', bois, { r: 0.006 });
    }
    a.boite(-W / 2 + 0.07, W / 2 - 0.07, 0.1, 0.12, -D / 2 + 0.07, D / 2 - 0.07, 'bois', bois, { r: 0.003 });
    return;
  }
  // Table à manger : ceinture et pieds fuselés.
  const e = 0.055;
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05 - e]) {
    for (const z of [-D / 2 + 0.05, D / 2 - 0.05 - e]) {
      a.bloc(
        [
          [x + 0.012, 0, z + 0.012],
          [x + e - 0.012, 0, z + 0.012],
          [x + e - 0.012, 0, z + e - 0.012],
          [x + 0.012, 0, z + e - 0.012],
          [x, H - ep, z],
          [x + e, H - ep, z],
          [x + e, H - ep, z + e],
          [x, H - ep, z + e],
        ],
        'bois',
        bois,
      );
    }
  }
  const yC = H - ep - 0.075;
  a.boite(-W / 2 + 0.06, W / 2 - 0.06, yC, H - ep, -D / 2 + 0.065, -D / 2 + 0.085, 'bois', bois);
  a.boite(-W / 2 + 0.06, W / 2 - 0.06, yC, H - ep, D / 2 - 0.085, D / 2 - 0.065, 'bois', bois);
  a.boite(-W / 2 + 0.065, -W / 2 + 0.085, yC, H - ep, -D / 2 + 0.06, D / 2 - 0.06, 'bois', bois);
  a.boite(W / 2 - 0.085, W / 2 - 0.065, yC, H - ep, -D / 2 + 0.06, D / 2 - 0.06, 'bois', bois);
}

/*
  LA TÉLÉVISION — une dalle fine et son verre noir ; au mur, ou sur un pied
  quand l'emprise a la profondeur d'un pied.
*/
function television(a: Atelier, { W, D, H }: Gabarit) {
  const ep = Math.min(D, 0.045);
  const surPied = D > 0.14;
  const y0 = surPied ? Math.min(0.08, H * 0.12) : 0;
  const z0 = surPied ? -ep / 2 : -D / 2;
  const z1 = z0 + ep;
  a.boite(-W / 2, W / 2, y0, H, z0, z1, 'noir', TEINTES.noir, { r: 0.004 });
  // La platine murale : elle tient la dalle à quelques centimètres du mur.
  if (!surPied && D / 2 - z1 > 0.005) a.boite(-W * 0.15, W * 0.15, H * 0.3, H * 0.7, z1, D / 2, 'noir', TEINTES.anthracite);
  a.boite(-W / 2 + 0.006, W / 2 - 0.006, y0 + 0.006, H - 0.006, z0 - (surPied ? 0.0015 : 0), z0 + 0.001, 'ecran', TEINTES.ecran, { sans: ['arriere'] });
  if (!surPied) a.boite(-W / 2 + 0.004, W / 2 - 0.004, y0 + 0.004, H - 0.004, z0 + 0.0012, z0 + 0.003, 'noir', TEINTES.noir);
  if (surPied) {
    a.boite(-W * 0.18, W * 0.18, 0, 0.012, -D / 2, D / 2, 'noir', TEINTES.anthracite, { r: [0.02, 0.004, 0.02], seg: 2 });
    a.boite(-0.03, 0.03, 0.012, y0 + 0.1, -0.01, 0.01, 'noir', TEINTES.anthracite, { r: 0.005 });
  }
}

/*
  LES RANGEMENTS — armoire, cuisine, bibliothèque, casiers, commode, buffet,
  chevet, meuble TV, hotte. RoomPlan ne dit que « storage » : l'emprise
  décide, à moins que le modèle du catalogue ou un attribut ne tranche.
*/
function rangement(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  const m = c.modele;
  const sorte = attribut(c, 'StorageType');
  if (m.startsWith('casiers') || m.startsWith('kallax')) return casiers(a, g, c);
  if (m.startsWith('biblio') || m.startsWith('billy') || sorte === 'shelf' || (!m && H >= 1.3 && D <= 0.42)) return bibliotheque(a, g, c);
  if (m.startsWith('etagere')) return etagereMurale(a, g, c);
  if (m.startsWith('hotte')) return hotte(a, g);
  if (m.startsWith('meublehaut')) return meubleHaut(a, g, c);
  if (m.startsWith('colonnesdb')) return armoire(a, g, c, 1);
  // Avant « armoire » : l'armoire de toilette n'est pas une penderie.
  if (m.startsWith('armoiretoilette')) return armoireDeToilette(a, g, c);
  if (m.startsWith('armoire') || m.startsWith('dressing') || m.startsWith('pax') || H >= 1.5) return armoire(a, g, c);
  if (m.startsWith('meublebas') || m.startsWith('ilot') || (!m && H >= 0.78 && H <= 1.0 && D >= 0.5)) return cuisineBas(a, g, c);
  if (m.startsWith('meubletv')) return meubleTv(a, g, c);
  if (m.startsWith('chevet') || (!m && W <= 0.6 && H <= 0.72)) return chevet(a, g, c);
  if (m.startsWith('caisson')) return caisson(a, g);
  if (m.startsWith('meublechaussures')) return meubleChaussures(a, g, c);
  if (m.startsWith('commode') || (!m && W <= 1.1 && H > 0.7)) return commode(a, g, c);
  return buffet(a, g, c);
}

/** Les façades d'une rangée de portes, avec leurs poignées appariées. */
function portes(a: Atelier, x0: number, x1: number, y0: number, y1: number, zFace: number, n: number, couleur: string, mat: Matiere = 'laque', hPoignee?: number) {
  const jeu = 0.003;
  const lp = (x1 - x0 - jeu * (n + 1)) / n;
  const yP = hPoignee ?? (y0 + y1) / 2;
  for (let k = 0; k < n; k++) {
    const a0 = x0 + jeu + k * (lp + jeu);
    a.boite(a0, a0 + lp, y0 + jeu, y1 - jeu, zFace, zFace + 0.019, mat, couleur, { r: 0.0025, sans: ['arriere'] });
    // Les portes vont par paires : la poignée est du côté où elles se rejoignent.
    const versDroite = k % 2 === 0 && k + 1 < n;
    const xP = versDroite ? a0 + lp - 0.035 : a0 + 0.035;
    poignee(a, xP, yP, zFace, Math.min(0.32, (y1 - y0) * 0.22), true);
  }
}

/** Une colonne de tiroirs. */
function tiroirs(a: Atelier, x0: number, x1: number, y0: number, y1: number, zFace: number, hauteurs: number[], couleur: string, mat: Matiere = 'laque', boutons = false) {
  const jeu = 0.003;
  const total = hauteurs.reduce((s, h) => s + h, 0);
  let y = y1;
  for (const h of hauteurs) {
    const hh = ((y1 - y0) * h) / total;
    a.boite(x0 + jeu, x1 - jeu, y - hh + jeu, y - jeu, zFace, zFace + 0.019, mat, couleur, { r: 0.0025, sans: ['arriere'] });
    const yP = y - Math.min(0.05, hh * 0.3);
    if (boutons) {
      bouton(a, x0 + (x1 - x0) * 0.25, yP, zFace);
      bouton(a, x0 + (x1 - x0) * 0.75, yP, zFace);
    } else {
      poignee(a, (x0 + x1) / 2, yP, zFace, Math.min(0.3, (x1 - x0) * 0.5), false);
    }
    y -= hh;
  }
}

function armoire(a: Atelier, { W, D, H }: Gabarit, c: Commande, nForce?: number) {
  const corps = c.teinte ?? TEINTES.laque;
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2 + 0.02, W / 2 - 0.02, 0, 0.07, zF + 0.03, D / 2 - 0.01, 'laque', TEINTES.pierre);
  a.boite(-W / 2, W / 2, 0.07, H, zF + 0.019, D / 2, 'laque', corps, { r: 0.003, sans: ['bas'] });
  const n = nForce ?? portesDArmoire(W);
  portes(a, -W / 2, W / 2, 0.07, H, zF, n, corps, 'laque', Math.min(1.05, H * 0.5));
}

function cuisineBas(a: Atelier, { W, D, H }: Gabarit, c: Commande, sansPlan = false) {
  const corps = c.teinte ?? TEINTES.laque;
  const hPlinthe = 0.1;
  const ePlan = 0.038;
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2, W / 2, 0, hPlinthe, zF + 0.05, D / 2 - 0.01, 'noir', TEINTES.anthracite);
  a.boite(-W / 2, W / 2, hPlinthe, H - ePlan, zF + 0.019, D / 2, 'laque', corps, { sans: ['bas', 'haut'] });
  if (!sansPlan) a.boite(-W / 2, W / 2, H - ePlan, H, -D / 2, D / 2, 'bois', c.dessus ?? TEINTES.chene, { r: 0.003 });
  // Les façades, par modules de soixante : tiroirs à gauche, portes ensuite.
  const nCol = Math.max(1, Math.round(W / 0.6));
  const lc = W / nCol;
  for (let k = 0; k < nCol; k++) {
    const x0 = -W / 2 + k * lc;
    if (k === 0 && nCol > 1) tiroirs(a, x0, x0 + lc, hPlinthe, H - ePlan, zF, [1, 1.4, 1.6], corps);
    else {
      tiroirs(a, x0, x0 + lc, H - ePlan - 0.17, H - ePlan, zF, [1], corps);
      portes(a, x0, x0 + lc, hPlinthe, H - ePlan - 0.17, zF, lc > 0.75 ? 2 : 1, corps, 'laque', H - ePlan - 0.24);
    }
  }
}

function meubleHaut(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  // Il se repeint, comme les autres meubles (voir « Décorer »).
  const corps = c.teinte ?? TEINTES.laque;
  const n = Math.max(1, Math.round(W / 0.45));
  if (c.modele.startsWith('meublehautvitre')) {
    /*
      LE MEUBLE HAUT VITRÉ — un caisson ouvert, une étagère, ce qu'on y
      range, et des portes de verre à cadre : on voit au travers.
    */
    const e = 0.016;
    const zF = -D / 2 + 0.004;
    a.boite(-W / 2, W / 2, 0, H, D / 2 - e, D / 2, 'laque', corps, { r: 0.002 });
    a.boite(-W / 2, -W / 2 + e, 0, H, zF + 0.02, D / 2 - e, 'laque', corps, { r: 0.002 });
    a.boite(W / 2 - e, W / 2, 0, H, zF + 0.02, D / 2 - e, 'laque', corps, { r: 0.002 });
    a.boite(-W / 2 + e, W / 2 - e, H - e, H, zF + 0.02, D / 2 - e, 'laque', corps);
    a.boite(-W / 2 + e, W / 2 - e, 0, e, zF + 0.02, D / 2 - e, 'laque', corps);
    a.boite(-W / 2 + e, W / 2 - e, H / 2 - e / 2, H / 2 + e / 2, zF + 0.03, D / 2 - e, 'laque', corps);
    // Les tasses, sur l'étagère et au fond.
    for (const y of [e, H / 2 + e / 2]) {
      const nb = Math.max(2, Math.floor((W - 2 * e) / 0.12));
      for (let k = 0; k < nb; k++) {
        const x = -W / 2 + e + ((k + 0.5) * (W - 2 * e)) / nb;
        a.tour([[0, y], [0.035, y, true], [0.04, y + 0.09, true], [0, y + 0.09]], x, 0, 'ceramique', TEINTES.ceramique, { seg: 14 });
      }
    }
    // Les portes : un cadre, et le verre.
    const jeu = 0.003;
    const lp = (W - jeu * (n + 1)) / n;
    const b = 0.045;
    for (let k = 0; k < n; k++) {
      const x0 = -W / 2 + jeu + k * (lp + jeu);
      const x1 = x0 + lp;
      a.boite(x0, x1, jeu, jeu + b, zF, zF + 0.019, 'laque', corps, { r: 0.002 });
      a.boite(x0, x1, H - jeu - b, H - jeu, zF, zF + 0.019, 'laque', corps, { r: 0.002 });
      a.boite(x0, x0 + b, jeu + b, H - jeu - b, zF, zF + 0.019, 'laque', corps, { r: 0.002 });
      a.boite(x1 - b, x1, jeu + b, H - jeu - b, zF, zF + 0.019, 'laque', corps, { r: 0.002 });
      a.boite(x0 + b, x1 - b, jeu + b, H - jeu - b, zF + 0.007, zF + 0.011, 'verre', TEINTES.verre);
    }
    return;
  }
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2, W / 2, 0, H, zF + 0.019, D / 2, 'laque', corps, { r: 0.002 });
  portes(a, -W / 2, W / 2, 0, H, zF, n, corps, 'laque', Math.min(0.16, H * 0.25));
}

/**
 * L'ARMOIRE DE TOILETTE — un caisson peu profond, accroché au-dessus du
 * lavabo, ses portes en miroir.
 */
function armoireDeToilette(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const corps = c.teinte ?? TEINTES.laque;
  a.boite(-W / 2, W / 2, 0, H, -D / 2 + 0.02, D / 2, 'laque', corps, { r: 0.004, seg: 1 });
  const n = W > 0.5 ? 2 : 1;
  const jeu = 0.004;
  const lp = (W - jeu * (n + 1)) / n;
  for (let k = 0; k < n; k++) {
    const x0 = -W / 2 + jeu + k * (lp + jeu);
    a.boite(x0, x0 + lp, jeu, H - jeu, -D / 2 + 0.003, -D / 2 + 0.02, 'laque', corps, { r: 0.002, sans: ['arriere'] });
    a.boite(x0 + 0.008, x0 + lp - 0.008, jeu + 0.008, H - jeu - 0.008, -D / 2, -D / 2 + 0.003, 'miroir', TEINTES.chrome, {
      sans: ['arriere'],
    });
  }
}

function hotte(a: Atelier, { W, D, H }: Gabarit) {
  const hc = Math.min(0.09, H * 0.3);
  const cl = Math.min(0.3, W * 0.5);
  const cd = Math.min(0.26, D * 0.55);
  a.boite(-W / 2, W / 2, 0.0002, hc, -D / 2, D / 2, 'inox', TEINTES.inox, { r: 0.004 });
  const zc = D / 2 - cd / 2;
  const hPyr = Math.min(0.2, H - hc - 0.02);
  a.bloc(
    [
      [-W / 2 + 0.01, hc, -D / 2 + 0.01],
      [W / 2 - 0.01, hc, -D / 2 + 0.01],
      [W / 2 - 0.01, hc, D / 2],
      [-W / 2 + 0.01, hc, D / 2],
      [-cl / 2, hc + hPyr, zc - cd / 2],
      [cl / 2, hc + hPyr, zc - cd / 2],
      [cl / 2, hc + hPyr, D / 2],
      [-cl / 2, hc + hPyr, D / 2],
    ],
    'inox',
    TEINTES.inox,
  );
  a.boite(-cl / 2, cl / 2, hc + hPyr, H, zc - cd / 2, D / 2, 'inox', TEINTES.inox, { sans: ['bas'] });
  a.boite(-W / 2 + 0.03, W / 2 - 0.03, 0.0, 0.0001, -D / 2 + 0.03, D / 2 - 0.03, 'noir', TEINTES.anthracite, { sans: ['haut'] });
}

function commode(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const hPied = Math.min(0.14, H * 0.15);
  pieds(a, [-W / 2 + 0.04, W / 2 - 0.04], [-D / 2 + 0.05, D / 2 - 0.05], 0, hPied, 0.018, 0.012, 'bois', c.cotes ?? TEINTES.chene);
  const zF = -D / 2 + SAILLIE_BOUTON;
  a.boite(-W / 2, W / 2, hPied, H, zF + 0.019, D / 2, 'bois', c.cotes ?? TEINTES.chene, { r: 0.004 });
  const n = Math.max(2, Math.round((H - hPied) / 0.22));
  tiroirs(a, -W / 2 + 0.015, W / 2 - 0.015, hPied + 0.015, H - 0.025, zF, new Array(n).fill(1), TEINTES.laque, 'laque', true);
}

// La couleur choisie habille tout le meuble, pas seulement ses côtés (revue « Théo »).
function chevet(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const hPied = Math.min(0.16, H * 0.28);
  pieds(a, [-W / 2 + 0.03, W / 2 - 0.03], [-D / 2 + 0.03, D / 2 - 0.03], 0, hPied, 0.015, 0.01, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  const e = 0.016;
  const zF = -D / 2 + SAILLIE_BOUTON;
  // La caisse ouverte : dessus, dessous, flancs, fond — et la niche se voit.
  a.boite(-W / 2, W / 2, H - e, H, -D / 2, D / 2, 'bois', c.dessus ?? c.teinte ?? c.cotes ?? TEINTES.chene, { r: 0.004 });
  a.boite(-W / 2, W / 2, hPied, hPied + e, zF, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  a.boite(-W / 2, -W / 2 + e, hPied, H - e, zF, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  a.boite(W / 2 - e, W / 2, hPied, H - e, zF, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  a.boite(-W / 2 + e, W / 2 - e, hPied, H - e, D / 2 - 0.008, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  const hT = Math.min(0.15, (H - hPied) * 0.4);
  a.boite(-W / 2 + e, W / 2 - e, H - e - hT, H - e, zF, D / 2 - 0.01, 'laque', c.teinte ?? TEINTES.laque, { sans: ['arriere'] });
  bouton(a, 0, H - e - hT / 2, zF);
}

function caisson(a: Atelier, { W, D, H }: Gabarit) {
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) {
    for (const z of [-D / 2 + 0.04, D / 2 - 0.04]) a.tube([x - 0.012, 0.022, z], [x + 0.012, 0.022, z], 0.022, 0.022, 'noir', TEINTES.noir, { seg: 10 });
  }
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2, W / 2, 0.045, H, zF + 0.019, D / 2, 'laque', TEINTES.laque, { r: 0.004 });
  tiroirs(a, -W / 2, W / 2, 0.045, H, zF, [1, 1, 1.8], TEINTES.laque);
}

function meubleChaussures(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2, W / 2, 0, 0.05, zF + 0.04, D / 2, 'noir', TEINTES.anthracite);
  a.boite(-W / 2, W / 2, 0.05, H, zF + 0.019, D / 2, 'laque', TEINTES.laque, { r: 0.003 });
  a.boite(-W / 2, W / 2, H - 0.022, H, -D / 2, D / 2, 'bois', c.dessus ?? c.cotes ?? TEINTES.chene, { r: 0.003 });
  tiroirs(a, -W / 2, W / 2, 0.05, H - 0.022, zF, [1, 1, 1].slice(0, Math.max(2, Math.round((H - 0.07) / 0.38))), TEINTES.laque);
}

function meubleTv(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  // Suspendu, il n'a pas de pieds : il tient au mur.
  const suspendu = c.modele.startsWith('meubletvsuspendu');
  const hPied = suspendu ? 0 : Math.min(0.12, H * 0.3);
  if (!suspendu) pieds(a, [-W / 2 + 0.05, W / 2 - 0.05], [-D / 2 + 0.05, D / 2 - 0.05], 0, hPied, 0.017, 0.012, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  const zF = -D / 2 + SAILLIE_BOUTON;
  const e = 0.018;
  a.boite(-W / 2, W / 2, H - e, H, -D / 2, D / 2, 'bois', c.dessus ?? c.teinte ?? c.cotes ?? TEINTES.chene, { r: 0.004 });
  a.boite(-W / 2, W / 2, hPied, hPied + e, zF, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  a.boite(-W / 2, -W / 2 + e, hPied, H - e, zF, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  a.boite(W / 2 - e, W / 2, hPied, H - e, zF, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  a.boite(-W / 2 + e, W / 2 - e, hPied, H - e, D / 2 - 0.008, D / 2, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  // Deux tiroirs, une niche ouverte au milieu.
  const tiers = (W - 2 * e) / 3;
  tiroirs(a, -W / 2 + e, -W / 2 + e + tiers, hPied + e, H - e, zF, [1], c.teinte ?? TEINTES.laque, 'laque', true);
  tiroirs(a, W / 2 - e - tiers, W / 2 - e, hPied + e, H - e, zF, [1], c.teinte ?? TEINTES.laque, 'laque', true);
  a.boite(-W / 2 + e + tiers, -W / 2 + e + tiers + e, hPied + e, H - e, zF, D / 2 - 0.008, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
  a.boite(W / 2 - e - tiers - e, W / 2 - e - tiers, hPied + e, H - e, zF, D / 2 - 0.008, 'bois', c.teinte ?? c.cotes ?? TEINTES.chene);
}

function buffet(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const hPied = Math.min(0.16, H * 0.2);
  pieds(a, [-W / 2 + 0.05, W / 2 - 0.05], [-D / 2 + 0.05, D / 2 - 0.05], 0, hPied, 0.018, 0.012, 'bois', c.cotes ?? TEINTES.chene);
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2, W / 2, hPied, H, zF + 0.019, D / 2, 'bois', c.teinte ?? TEINTES.chene, { r: 0.004 });
  const n = Math.max(1, Math.round(W / 0.45));
  portes(a, -W / 2 + 0.015, W / 2 - 0.015, hPied + 0.015, H - 0.03, zF, n, TEINTES.laque);
}

/** Des livres sur une tablette : des dos de toutes les tailles, quelques-uns penchés. */
function livres(a: Atelier, x0: number, x1: number, y: number, hMax: number, zFond: number, profMax: number, hasard: () => number) {
  let x = x0 + 0.01;
  const fin = x1 - 0.01;
  const remplissage = 0.45 + hasard() * 0.45;
  const limite = x0 + (x1 - x0) * remplissage;
  while (x < limite) {
    const ep = 0.018 + hasard() * 0.03;
    const h = Math.min(hMax - 0.02, 0.17 + hasard() * 0.12);
    const p = Math.min(profMax, 0.14 + hasard() * 0.07);
    if (x + ep > fin || h < 0.08) break;
    const couleur = TEINTES.livres[Math.floor(hasard() * TEINTES.livres.length)];
    a.boite(x, x + ep, y, y + h, zFond - p, zFond, 'papier', couleur, { sans: ['bas', 'arriere'] });
    x += ep + (hasard() < 0.12 ? 0.004 : 0.0008);
  }
  // Le dernier, penché contre ses voisins.
  if (x + 0.06 < fin && hasard() < 0.6) {
    const h = Math.min(hMax - 0.03, 0.2);
    a.avec(tourner('z', -0.22, [x, y, 0]), () => {
      a.boite(x, x + 0.025, y, y + h, zFond - 0.16, zFond, 'papier', TEINTES.livres[Math.floor(hasard() * TEINTES.livres.length)], {
        sans: ['bas', 'arriere'],
      });
    });
    x += 0.07;
  }
  // Un vase, parfois, au bout de la rangée.
  if (fin - x > 0.14 && hasard() < 0.45) {
    const r = Math.min(0.055, (fin - x) / 3);
    const hv = Math.min(hMax - 0.03, 0.16);
    a.tour(
      [
        [0, y],
        [r * 0.8, y, true],
        [r, y + hv * 0.4],
        [r * 0.55, y + hv * 0.85],
        [r * 0.6, y + hv, true],
        [r * 0.45, y + hv],
        [0, y + hv * 0.7],
      ],
      fin - r - 0.02,
      zFond - Math.min(profMax, 0.15) / 2,
      'ceramique',
      hasard() < 0.5 ? TEINTES.ceramique : TEINTES.sauge,
      { seg: 14 },
    );
  }
}

function bibliotheque(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const bois = c.teinte ?? TEINTES.laque;
  const mat: Matiere = c.teinte ? 'bois' : 'laque';
  const e = 0.018;
  const hSocle = 0.06;
  a.boite(-W / 2, -W / 2 + e, 0, H, -D / 2, D / 2, mat, bois, { r: 0.002 });
  a.boite(W / 2 - e, W / 2, 0, H, -D / 2, D / 2, mat, bois, { r: 0.002 });
  a.boite(-W / 2 + e, W / 2 - e, H - e, H, -D / 2, D / 2, mat, bois);
  a.boite(-W / 2 + e, W / 2 - e, 0, hSocle, -D / 2 + 0.01, D / 2, mat, bois);
  a.boite(-W / 2 + e, W / 2 - e, hSocle, H - e, D / 2 - 0.006, D / 2, mat, bois);
  const n = Math.max(2, Math.round((H - hSocle) / 0.34));
  const pas = (H - hSocle - e) / n;
  for (let k = 0; k < n; k++) {
    const y = hSocle + k * pas;
    if (k > 0) a.boite(-W / 2 + e, W / 2 - e, y - e / 2, y + e / 2, -D / 2 + 0.005, D / 2 - 0.006, mat, bois);
    livres(a, -W / 2 + e, W / 2 - e, y + (k > 0 ? e / 2 : 0), pas - e, D / 2 - 0.008, D - 0.03, c.hasard);
  }
}

function etagereMurale(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  if (c.modele.startsWith('etagerecuisine')) {
    // L'ÉTAGÈRE DE CUISINE : la planche, et des bocaux de verre, pleins.
    a.boite(-W / 2, W / 2, 0, 0.025, -D / 2, D / 2, 'bois', c.teinte ?? TEINTES.chene, { r: 0.003 });
    const n = Math.max(3, Math.floor((W - 0.06) / 0.13));
    const contenus = ['#E9D9A6', '#5A3B28', '#B4743F', '#D8C9B0', '#8C5A3C'];
    for (let k = 0; k < n; k++) {
      const x = -W / 2 + 0.065 + (k * (W - 0.13)) / (n - 1);
      const r = Math.min(D / 2 - 0.015, 0.04 + c.hasard() * 0.015);
      const h = k === 0 ? H - 0.04 : (H - 0.04) * (0.55 + c.hasard() * 0.45);
      const y0 = 0.025;
      a.tour([[0, y0], [r, y0, true], [r, y0 + h * 0.86], [r * 0.8, y0 + h * 0.9], [r * 0.82, y0 + h, true], [0, y0 + h]], x, 0, 'verre', TEINTES.verre, { seg: 16 });
      a.tour([[0, y0 + 0.004], [r - 0.006, y0 + 0.004, true], [r - 0.006, y0 + h * 0.6, true], [0, y0 + h * 0.6]], x, 0, 'linge', contenus[k % contenus.length], { seg: 14 });
      a.tour([[0, y0 + h], [r * 0.86, y0 + h, true], [r * 0.86, y0 + h + 0.012, true], [0, y0 + h + 0.012]], x, 0, 'bois', TEINTES.chene, { seg: 14 });
    }
    return;
  }
  a.boite(-W / 2, W / 2, 0, 0.025, -D / 2, D / 2, 'bois', TEINTES.chene, { r: 0.003 });
  livres(a, -W / 2, W / 2 - 0.15, 0.025, H - 0.03, D / 2, D - 0.02, c.hasard);
  // Une plante en pot au bout.
  const r = Math.min(0.05, D / 3);
  a.tour([[0, 0.025], [r * 0.8, 0.025, true], [r, 0.025 + 0.09], [r - 0.006, 0.025 + 0.09, true], [0, 0.025 + 0.08]], W / 2 - 0.08, 0, 'ceramique', TEINTES.ceramique, { seg: 16 });
  for (let k = 0; k < 9; k++) {
    const ang = (k / 9) * Math.PI * 2;
    a.feuille([W / 2 - 0.08, 0.11, 0], [Math.cos(ang) * 0.6, 0.8, Math.sin(ang) * 0.6], [0, 1, 0], Math.min(0.1, H - 0.1), 0.035, TEINTES.vert[k % 3]);
  }
}

function casiers(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const n = c.modele.includes('4') || W > 1.1 ? 4 : 2;
  const cadre = 0.04;
  const sep = 0.016;
  const mat: Matiere = 'laque';
  const t = TEINTES.laque;
  a.boite(-W / 2, -W / 2 + cadre, 0, H, -D / 2, D / 2, mat, t, { r: 0.003 });
  a.boite(W / 2 - cadre, W / 2, 0, H, -D / 2, D / 2, mat, t, { r: 0.003 });
  a.boite(-W / 2 + cadre, W / 2 - cadre, H - cadre, H, -D / 2, D / 2, mat, t, { r: 0.003 });
  a.boite(-W / 2 + cadre, W / 2 - cadre, 0, cadre, -D / 2, D / 2, mat, t, { r: 0.003 });
  const lx = (W - 2 * cadre - (n - 1) * sep) / n;
  const ly = (H - 2 * cadre - (n - 1) * sep) / n;
  for (let k = 1; k < n; k++) {
    const x = -W / 2 + cadre + k * lx + (k - 1) * sep;
    a.boite(x, x + sep, cadre, H - cadre, -D / 2, D / 2, mat, t);
    const y = cadre + k * ly + (k - 1) * sep;
    a.boite(-W / 2 + cadre, W / 2 - cadre, y, y + sep, -D / 2, D / 2, mat, t);
  }
  // Ce qu'il y a dans les cases : des paniers de tissu, des livres, du vide.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -W / 2 + cadre + i * (lx + sep);
      const y0 = cadre + j * (ly + sep);
      const tirage = c.hasard();
      if (tirage < 0.3) {
        const tt = [TEINTES.lin, TEINTES.sauge, TEINTES.argile][Math.floor(c.hasard() * 3)];
        a.boite(x0 + 0.012, x0 + lx - 0.012, y0, y0 + ly - 0.012, -D / 2 + 0.01, D / 2 - 0.01, 'tissu', tt, { r: 0.012, seg: 1 });
      } else if (tirage < 0.7) {
        livres(a, x0, x0 + lx, y0, ly, D / 2 - 0.005, D - 0.03, c.hasard);
      }
    }
  }
}

/*
  LE RÉFRIGÉRATEUR — portes galbées, poignées barres, congélateur en bas.
*/
function refrigerateur(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const corps = c.teinte ?? TEINTES.laque;
  const zF = -D / 2 + 0.035;
  if (W > 0.8) {
    // L'AMÉRICAIN : deux portes pleine hauteur, le distributeur sur la gauche.
    const inox = c.teinte ?? TEINTES.inox;
    a.boite(-W / 2, W / 2, 0.02, H, zF + 0.045, D / 2, 'inox', inox, { r: 0.012, seg: 1, sans: ['bas'] });
    a.boite(-W / 2 + 0.01, W / 2 - 0.01, 0, 0.06, zF + 0.05, D / 2 - 0.02, 'noir', TEINTES.anthracite);
    a.boite(-W / 2, -0.004, 0.06, H, zF, zF + 0.045, 'inox', inox, { r: 0.012, seg: 1, sans: ['arriere'] });
    a.boite(0.004, W / 2, 0.06, H, zF, zF + 0.045, 'inox', inox, { r: 0.012, seg: 1, sans: ['arriere'] });
    a.boite(-W / 4 - 0.1, -W / 4 + 0.1, H * 0.52, H * 0.72, zF - 0.004, zF, 'noir', TEINTES.noir, { r: 0.01 });
    poignee(a, -0.04, H * 0.55, zF, Math.min(0.9, H * 0.5), true);
    poignee(a, 0.04, H * 0.55, zF, Math.min(0.9, H * 0.5), true);
    return;
  }
  a.boite(-W / 2, W / 2, 0.02, H, zF + 0.045, D / 2, 'laque', corps, { r: 0.01, seg: 1, sans: ['bas'] });
  a.boite(-W / 2 + 0.01, W / 2 - 0.01, 0, 0.06, zF + 0.05, D / 2 - 0.02, 'noir', TEINTES.anthracite);
  const hb = Math.min(0.75, H * 0.36);
  a.boite(-W / 2, W / 2, 0.06, hb - 0.003, zF, zF + 0.045, 'laque', corps, { r: 0.012, seg: 1, sans: ['arriere'] });
  a.boite(-W / 2, W / 2, hb + 0.003, H, zF, zF + 0.045, 'laque', corps, { r: 0.012, seg: 1, sans: ['arriere'] });
  poignee(a, W / 2 - 0.05, hb + 0.3, zF, 0.36, true);
  poignee(a, W / 2 - 0.05, hb - 0.2, zF, 0.24, true);
}

/*
  LA CUISSON — plaque sur meuble, cuisinière, four encastré, micro-ondes.
*/
function plaqueVitro(a: Atelier, x0: number, x1: number, y: number, z0: number, z1: number) {
  a.boite(x0, x1, y, y + 0.006, z0, z1, 'ecran', TEINTES.ecran, { r: [0.004, 0.002, 0.004], sans: ['bas'] });
  const l = x1 - x0;
  const p = z1 - z0;
  const foyers: [number, number, number][] = [
    [x0 + l * 0.28, z0 + p * 0.3, Math.min(l, p) * 0.16],
    [x0 + l * 0.72, z0 + p * 0.3, Math.min(l, p) * 0.12],
    [x0 + l * 0.28, z0 + p * 0.72, Math.min(l, p) * 0.12],
    [x0 + l * 0.72, z0 + p * 0.72, Math.min(l, p) * 0.16],
  ];
  for (const [x, z, r] of foyers) {
    a.tour([[r * 0.86, y + 0.0062], [r, y + 0.0066], [r * 0.86, y + 0.0066]], x, z, 'noir', TEINTES.anthracite, { seg: 20 });
  }
}

function cuisson(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  const m = c.modele;
  if (m.startsWith('plaque')) {
    cuisineBas(a, g, c);
    plaqueVitro(a, -W / 2 + 0.04, W / 2 - 0.04, H - 0.002, -D / 2 + 0.06, D / 2 - 0.05);
    return;
  }
  if (H < 0.2) {
    plaqueVitro(a, -W / 2, W / 2, Math.max(0, H - 0.006), -D / 2, D / 2);
    return;
  }
  if (c.categorie.includes('oven') || m.startsWith('four') || m.startsWith('microondes')) {
    if (H < 0.42) {
      // Le micro-ondes : la porte vitrée à gauche, le bandeau à droite.
      const zF = -D / 2 + 0.005;
      a.boite(-W / 2, W / 2, 0, H, zF + 0.01, D / 2, 'laque', TEINTES.laque, { r: 0.012, seg: 1 });
      a.boite(-W / 2 + 0.015, W / 2 - 0.13, 0.015, H - 0.015, zF, zF + 0.01, 'ecran', TEINTES.hublot, { r: 0.006, sans: ['arriere'] });
      for (let k = 0; k < 3; k++) a.tube([W / 2 - 0.065, H * 0.7 - k * 0.06, zF + 0.01], [W / 2 - 0.065, H * 0.7 - k * 0.06, zF - 0.002], 0.012, 0.012, 'noir', TEINTES.anthracite, { seg: 10 });
      return;
    }
    // Le four encastré : cadre inox, porte de verre noir, poignée, afficheur.
    const zF = -D / 2 + SAILLIE_POIGNEE;
    a.boite(-W / 2, W / 2, 0, H, zF + 0.02, D / 2, 'inox', TEINTES.inox, { r: 0.003 });
    a.boite(-W / 2 + 0.01, W / 2 - 0.01, 0.01, H - 0.11, zF, zF + 0.02, 'ecran', TEINTES.ecran, { r: 0.004, sans: ['arriere'] });
    a.boite(-W / 2 + 0.01, W / 2 - 0.01, H - 0.1, H - 0.01, zF + 0.005, zF + 0.02, 'inox', TEINTES.inox, { sans: ['arriere'] });
    a.boite(-0.06, 0.06, H - 0.075, H - 0.035, zF + 0.003, zF + 0.006, 'ecran', TEINTES.ecran);
    poignee(a, 0, H - 0.14, zF, W * 0.75, false);
    return;
  }
  // La cuisinière : four, bandeau de manettes, table de cuisson.
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2, W / 2, 0, H - 0.006, zF + 0.02, D / 2, 'laque', c.teinte ?? TEINTES.laque, { r: 0.006 });
  a.boite(-W / 2 + 0.02, W / 2 - 0.02, 0.12, H - 0.16, zF, zF + 0.02, 'ecran', TEINTES.hublot, { r: 0.006, sans: ['arriere'] });
  poignee(a, 0, H - 0.2, zF, W * 0.7, false);
  for (let k = 0; k < 4; k++) {
    const x = -W / 2 + W * (0.2 + k * 0.2);
    a.tube([x, H - 0.08, zF + 0.02], [x, H - 0.08, zF - 0.008], 0.017, 0.017, 'inox', TEINTES.inox, { seg: 12 });
  }
  plaqueVitro(a, -W / 2, W / 2, H - 0.006, -D / 2 + 0.03, D / 2);
}

/*
  LE LAVE-LINGE ET SES FRÈRES — hublot chromé, bandeau, bac à produits ;
  le lave-vaisselle, lui, a une façade pleine et une barre.
*/
function electromenager(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const lv = c.categorie.includes('dishwasher') || c.modele === 'lv';
  const corps = c.teinte ?? TEINTES.laque;
  const zF = -D / 2 + SAILLIE_POIGNEE;
  a.boite(-W / 2, W / 2, 0, H, zF, D / 2, 'laque', corps, { r: [0.015, 0.012, 0.015], seg: 1 });
  if (lv) {
    a.boite(-W / 2 + 0.01, W / 2 - 0.01, H - 0.1, H - 0.02, zF - 0.002, zF, 'inox', TEINTES.inox);
    poignee(a, 0, H - 0.15, zF, W * 0.6, false);
    return;
  }
  // Le bandeau : bac à produits, afficheur, manette.
  a.boite(-W / 2 + 0.03, -W / 2 + 0.2, H - 0.11, H - 0.03, zF - 0.004, zF, 'laque', TEINTES.laque, { r: 0.004 });
  a.boite(0.0, 0.1, H - 0.085, H - 0.055, zF - 0.002, zF, 'ecran', TEINTES.ecran);
  a.tube([W / 2 - 0.09, H - 0.07, zF], [W / 2 - 0.09, H - 0.07, zF - 0.025], 0.028, 0.026, 'inox', TEINTES.chrome, { seg: 16 });
  // Le hublot : un anneau chromé, une vitre fumée bombée.
  const R = Math.min(W, H) * 0.3;
  const yc = Math.min(H * 0.45, H - 0.13 - R);
  a.avec(composer(deplacer(0, yc, zF), tourner('x', -Math.PI / 2)), () => {
    a.tour(
      [
        [R * 0.74, 0, true],
        [R, 0, true],
        [R, 0.012],
        [R * 0.96, 0.026],
        [R * 0.8, 0.028],
        [R * 0.74, 0.016, true],
      ],
      0,
      0,
      'chrome',
      TEINTES.chrome,
      { seg: 32 },
    );
    a.tour(
      [
        [R * 0.75, 0.012, true],
        [R * 0.5, 0.02],
        [0, 0.024],
      ],
      0,
      0,
      'ecran',
      TEINTES.hublot,
      { seg: 32 },
    );
  });
}

/*
  L'ÉVIER ET LA VASQUE — une cuve creusée, un plan, un robinet.
*/
function robinet(a: Atelier, x: number, y: number, z: number, haut: number, portee: number, versAvant = true) {
  const sens = versAvant ? -1 : 1;
  a.tube([x, y, z], [x, y + 0.04, z], 0.024, 0.022, 'chrome', TEINTES.chrome, { seg: 14 });
  a.tube([x, y + 0.04, z], [x, y + haut, z], 0.012, 0.012, 'chrome', TEINTES.chrome, { seg: 12, bouts: 'aucun' });
  // Le col de cygne, en six tronçons.
  const n = 6;
  let prec: V3 = [x, y + haut, z];
  for (let k = 1; k <= n; k++) {
    const t = (k / n) * Math.PI;
    const p: V3 = [x, y + haut + Math.sin(t) * portee * 0.35, z + sens * (1 - Math.cos(t)) * (portee / 2)];
    a.tube(prec, p, 0.012, 0.012, 'chrome', TEINTES.chrome, { seg: 10, bouts: k === n ? 'haut' : 'aucun' });
    prec = p;
  }
  a.tube([x + 0.024, y + 0.03, z], [x + 0.07, y + 0.05, z], 0.006, 0.006, 'chrome', TEINTES.chrome, { seg: 8 });
}

function vasqueAPoser(a: Atelier, x: number, y: number, z: number, R: number, sz: number, h: number) {
  a.tour(
    [
      [0, y],
      [R * 0.55, y, true],
      [R * 0.86, y + h * 0.3],
      [R, y + h * 0.85],
      [R, y + h, true],
      [R - 0.01, y + h, true],
      [R - 0.012, y + h * 0.85],
      [R * 0.82, y + h * 0.35],
      [R * 0.35, y + 0.014],
      [0, y + 0.012],
    ],
    x,
    z,
    'ceramique',
    TEINTES.ceramique,
    { seg: 28, sz },
  );
  a.tour([[0, y + 0.0125], [0.02, y + 0.0125], [0.02, y + 0.0135], [0, y + 0.0135]], x, z, 'chrome', TEINTES.chrome, { seg: 14 });
}

function evier(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  const m = c.modele;
  const cuisine = m.startsWith('evier') || (!m && D >= 0.55 && H >= 0.82 && W >= 0.7);
  if (cuisine) {
    cuisineBas(a, g, c, true);
    const ePlan = 0.038;
    const bx0 = -W / 2 + Math.max(0.06, W * 0.12);
    const bx1 = Math.min(W / 2 - 0.06, bx0 + Math.min(0.5, W * 0.6));
    const bz0 = -D / 2 + 0.07;
    const bz1 = D / 2 - 0.12;
    const y0 = H - ePlan;
    // Le plan, découpé autour de la cuve.
    a.boite(-W / 2, W / 2, y0, H, -D / 2, bz0, 'bois', TEINTES.chene, { r: 0.003 });
    a.boite(-W / 2, W / 2, y0, H, bz1, D / 2, 'bois', TEINTES.chene, { r: 0.003 });
    a.boite(-W / 2, bx0, y0, H, bz0, bz1, 'bois', TEINTES.chene);
    a.boite(bx1, W / 2, y0, H, bz0, bz1, 'bois', TEINTES.chene);
    // La cuve inox, creusée.
    a.boite(bx0, bx1, H - 0.2, H, bz0, bz1, 'inox', TEINTES.inox, { r: [0.025, 0.025, 0.025], seg: 2, dedans: true, sans: ['haut'] });
    a.tour([[0, H - 0.199], [0.03, H - 0.199], [0.03, H - 0.198], [0, H - 0.198]], (bx0 + bx1) / 2, (bz0 + bz1) / 2, 'chrome', TEINTES.chrome, { seg: 14 });
    robinet(a, (bx0 + bx1) / 2, H, bz1 + 0.05, 0.3, 0.2);
    return;
  }
  if (m.startsWith('lavabo') || (!m && W <= 0.7 && D <= 0.5)) {
    // Le lavabo sur colonne.
    const R = W / 2;
    const sz = D / W;
    const hB = 0.17;
    a.tour(
      [
        [0, 0],
        [0.1, 0, true],
        [0.075, 0.1],
        [0.07, H - hB - 0.05],
        [0.12, H - hB + 0.01],
        [0, H - hB + 0.02],
      ],
      0,
      0.02,
      'ceramique',
      TEINTES.ceramique,
      { seg: 28, sz: 0.85 },
    );
    a.tour(
      [
        [0, H - hB],
        [R * 0.6, H - hB, true],
        [R * 0.92, H - hB * 0.45],
        [R, H - 0.01],
        [R - 0.01, H, true],
        [R - 0.03, H, true],
        [R - 0.035, H - 0.012],
        [R * 0.75, H - hB * 0.55],
        [R * 0.3, H - hB + 0.035],
        [0, H - hB + 0.03],
      ],
      0,
      0,
      'ceramique',
      TEINTES.ceramique,
      { seg: 40, sz },
    );
    robinet(a, 0, H - 0.005, D / 2 - 0.06, 0.12, 0.13);
    return;
  }
  // Le meuble vasque : caisson suspendu, deux tiroirs, plan de bois, vasques à poser.
  const double = m.startsWith('doublevasque') || W >= 1.1;
  const ePlan = 0.03;
  const hV = 0.13;
  // La hauteur relevée est celle du bord des vasques : le plan est dessous.
  const hPlan = H - hV;
  const hCaisson = Math.min(0.5, hPlan * 0.62);
  const zF = -D / 2 + SAILLIE_POIGNEE;
  const yC = hPlan - ePlan - hCaisson;
  // Sur quatre pieds fuselés : le sol reste dégagé, comme les meubles de bains d'aujourd'hui.
  pieds(a, [-W / 2 + 0.04, W / 2 - 0.04], [zF + 0.06, D / 2 - 0.04], 0, yC, 0.016, 0.011, 'bois', TEINTES.chene);
  a.boite(-W / 2, W / 2, yC, hPlan - ePlan, zF + 0.019, D / 2, 'laque', c.teinte ?? TEINTES.laque, { r: 0.003 });
  const nCol = double ? 2 : 1;
  for (let k = 0; k < nCol; k++) {
    const x0 = -W / 2 + (k * W) / nCol;
    tiroirs(a, x0, x0 + W / nCol, hPlan - ePlan - hCaisson, hPlan - ePlan, zF, [1, 1], c.teinte ?? TEINTES.laque);
  }
  a.boite(-W / 2, W / 2, hPlan - ePlan, hPlan, -D / 2, D / 2, 'bois', TEINTES.chene, { r: 0.004 });
  const R = Math.min(0.2, (W / nCol) * 0.36, D * 0.42);
  for (let k = 0; k < nCol; k++) {
    const x = -W / 2 + ((k + 0.5) * W) / nCol;
    vasqueAPoser(a, x, hPlan, -0.03, R, 0.85, hV);
    robinet(a, x, hPlan, D / 2 - 0.05, hV + 0.1, R * 1.3);
  }
}

/*
  LE WC — cuvette ovale, abattant fermé, réservoir et sa touche chromée.
*/
function wc(a: Atelier, { W, D, H }: Gabarit) {
  const prof = Math.min(0.2, D * 0.28);
  const zR = D / 2 - prof;
  const hB = Math.min(0.41, H * 0.52);
  // Le réservoir.
  a.boite(-W / 2 + 0.005, W / 2 - 0.005, hB - 0.02, H, zR, D / 2, 'ceramique', TEINTES.ceramique, { r: [0.025, 0.02, 0.025], seg: 1 });
  a.tube([0, H - 0.001, (zR + D / 2) / 2], [0, H + 0.004, (zR + D / 2) / 2], 0.03, 0.03, 'chrome', TEINTES.chrome, { seg: 18 });
  // La cuvette, ovale, sur son pied.
  const Rx = W / 2 - 0.01;
  const zc = (-D / 2 + zR + 0.06) / 2;
  const Rz = zR + 0.06 - zc;
  const sz = Rz / Rx;
  a.tour(
    [
      [0, 0],
      [Rx * 0.5, 0, true],
      [Rx * 0.55, hB * 0.2],
      [Rx * 0.66, hB * 0.55],
      [Rx * 0.92, hB * 0.88],
      [Rx, hB, true],
      [0, hB],
    ],
    0,
    zc,
    'ceramique',
    TEINTES.ceramique,
    { seg: 28, sz },
  );
  a.boite(-Rx * 0.5, Rx * 0.5, 0, hB, zc, zR + 0.01, 'ceramique', TEINTES.ceramique, { r: [0.04, 0.02, 0.02], seg: 1, sans: ['bas'] });
  // L'abattant, fermé.
  a.tour(
    [
      [0, hB + 0.003],
      [Rx * 0.97, hB + 0.003, true],
      [Rx * 0.99, hB + 0.018],
      [Rx * 0.9, hB + 0.032],
      [0, hB + 0.036],
    ],
    0,
    zc,
    'laque',
    TEINTES.laque,
    { seg: 28, sz },
  );
}

/*
  LA BAIGNOIRE — coque, rebord, cuve galbée, robinetterie ; la douche :
  receveur, parois de verre, colonne.
*/
function baignoire(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  if (c.modele.startsWith('douche') || H > 1.2) return douche(a, g);
  const m = 0.07;
  // La coque, aux angles verticaux arrondis.
  a.boite(-W / 2, W / 2, 0, H - 0.0005, -D / 2, D / 2, 'ceramique', TEINTES.ceramique, { r: [0.03, 0, 0.03], seg: 2, sans: ['haut', 'bas'] });
  // Le rebord : un cadre plat autour de la cuve.
  a.boite(-W / 2, W / 2, H - 0.02, H, -D / 2, -D / 2 + m, 'ceramique', TEINTES.ceramique, { r: [0.02, 0.006, 0.006] });
  a.boite(-W / 2, W / 2, H - 0.02, H, D / 2 - m, D / 2, 'ceramique', TEINTES.ceramique, { r: [0.02, 0.006, 0.006] });
  a.boite(-W / 2, -W / 2 + m, H - 0.02, H, -D / 2 + m - 0.001, D / 2 - m + 0.001, 'ceramique', TEINTES.ceramique, { r: [0.006, 0.006, 0] });
  a.boite(W / 2 - m, W / 2, H - 0.02, H, -D / 2 + m - 0.001, D / 2 - m + 0.001, 'ceramique', TEINTES.ceramique, { r: [0.006, 0.006, 0] });
  // La cuve, vue de dedans.
  a.boite(-W / 2 + m, W / 2 - m, Math.max(0.05, H - 0.45), H - 0.019, -D / 2 + m, D / 2 - m, 'ceramique', TEINTES.ceramique, {
    r: [0.12, 0.1, 0.12],
    seg: 3,
    dedans: true,
    sans: ['haut'],
  });
  // Le mitigeur et son bec, côté mur, à une extrémité.
  const xR = W / 2 - m / 2;
  a.tube([xR, H, D / 2 - m / 2], [xR, H + 0.1, D / 2 - m / 2], 0.018, 0.016, 'chrome', TEINTES.chrome, { seg: 14 });
  a.tube([xR, H + 0.09, D / 2 - m / 2], [xR - 0.13, H + 0.09, D / 2 - m / 2], 0.012, 0.012, 'chrome', TEINTES.chrome, { seg: 10 });
}

function douche(a: Atelier, { W, D, H }: Gabarit) {
  const hR = 0.045;
  a.boite(-W / 2, W / 2, 0, hR, -D / 2, D / 2, 'ceramique', TEINTES.ceramique, { r: [0.01, 0.006, 0.01] });
  a.tour([[0, hR + 0.0005], [0.06, hR + 0.0005], [0.06, hR + 0.0015], [0, hR + 0.0015]], 0, 0, 'chrome', TEINTES.chrome, { seg: 20 });
  // Deux parois de verre : l'avant et le flanc gauche, cerclées de chrome.
  const hV = H - 0.05;
  a.boite(-W / 2 + 0.01, W / 2 - 0.25, hR, hV, -D / 2 + 0.005, -D / 2 + 0.013, 'verre', TEINTES.verre);
  a.boite(-W / 2 + 0.005, -W / 2 + 0.013, hR, hV, -D / 2 + 0.013, D / 2 - 0.01, 'verre', TEINTES.verre);
  a.tube([-W / 2 + 0.01, hV, -D / 2 + 0.009], [W / 2 - 0.25, hV, -D / 2 + 0.009], 0.008, 0.008, 'chrome', TEINTES.chrome, { seg: 8 });
  a.tube([-W / 2 + 0.009, hV, -D / 2 + 0.013], [-W / 2 + 0.009, hV, D / 2 - 0.01], 0.008, 0.008, 'chrome', TEINTES.chrome, { seg: 8 });
  a.tube([-W / 2 + 0.009, hR, -D / 2 + 0.009], [-W / 2 + 0.009, hV, -D / 2 + 0.009], 0.009, 0.009, 'chrome', TEINTES.chrome, { seg: 8 });
  // La colonne : barre, bras, pomme de tête, mitigeur.
  const xc = W / 2 - 0.2;
  const zc = D / 2 - 0.04;
  a.tube([xc, 0.95, zc], [xc, H - 0.12, zc], 0.011, 0.011, 'chrome', TEINTES.chrome, { seg: 12 });
  a.tube([xc, H - 0.12, zc], [xc, H - 0.12, zc - 0.32], 0.011, 0.011, 'chrome', TEINTES.chrome, { seg: 12 });
  a.tour([[0, H - 0.135], [0.12, H - 0.135, true], [0.12, H - 0.122], [0, H - 0.115]], xc, zc - 0.32, 'chrome', TEINTES.chrome, { seg: 24 });
  a.boite(xc - 0.09, xc + 0.09, 0.98, 1.04, zc - 0.035, zc + 0.03, 'chrome', TEINTES.chrome, { r: 0.012, seg: 1 });
}

/*
  L'ESCALIER — marches à nez, contremarches, limons : les marches se
  comptent sur la hauteur, à dix-huit centimètres.
*/
function escalier(a: Atelier, { W, D, H }: Gabarit) {
  const n = marchesDEscalier(H);
  const hM = H / n;
  const giron = D / n;
  const eL = 0.04;
  for (let k = 0; k < n; k++) {
    const y = (k + 1) * hM;
    const z0 = -D / 2 + k * giron;
    a.boite(-W / 2 + eL, W / 2 - eL, y - 0.035, y, Math.max(-D / 2, z0 - 0.02), z0 + giron, 'bois', TEINTES.chene, { r: 0.004 });
    a.boite(-W / 2 + eL, W / 2 - eL, k * hM, y - 0.035, z0, z0 + 0.015, 'laque', TEINTES.laque);
  }
  for (const x0 of [-W / 2, W / 2 - eL]) {
    a.bloc(
      [
        [x0, 0, -D / 2],
        [x0 + eL, 0, -D / 2],
        [x0 + eL, H - 0.25, D / 2],
        [x0, H - 0.25, D / 2],
        [x0, 0.25, -D / 2],
        [x0 + eL, 0.25, -D / 2],
        [x0 + eL, H, D / 2],
        [x0, H, D / 2],
      ],
      'laque',
      TEINTES.laque,
    );
  }
}

/*
  LA CHEMINÉE — âtre de pierre sombre, foyer creusé et ses bûches,
  tablette de bois, manteau jusqu'en haut.
*/
function cheminee(a: Atelier, { W, D, H }: Gabarit) {
  const pA = Math.min(0.35, D * 0.4);
  a.boite(-W / 2, W / 2, 0, 0.05, -D / 2, -D / 2 + pA, 'pierre', TEINTES.ardoise, { r: 0.004 });
  const zC = -D / 2 + pA - 0.12;
  const lF = Math.min(0.8, W * 0.55);
  const hF = Math.min(0.65, H * 0.42);
  const lJ = (W - lF) / 2;
  // Les jambages et le linteau.
  a.boite(-W / 2, -W / 2 + lJ, 0.05, hF + 0.05, zC, D / 2, 'laque', TEINTES.laque, { r: 0.004 });
  a.boite(W / 2 - lJ, W / 2, 0.05, hF + 0.05, zC, D / 2, 'laque', TEINTES.laque, { r: 0.004 });
  const hT = Math.min(H, hF + 0.2);
  a.boite(-W / 2, W / 2, hF + 0.05, hT - 0.05, zC, D / 2, 'laque', TEINTES.laque, { r: 0.004 });
  // Le foyer creusé.
  const zFond = Math.min(D / 2 - 0.02, zC + 0.38);
  a.boite(-lF / 2, lF / 2, 0.05, hF + 0.05, zC, zFond, 'noir', TEINTES.noir, { dedans: true, sans: ['avant'] });
  for (const [dz, dy] of [
    [0.1, 0.1],
    [0.2, 0.1],
    [0.15, 0.17],
  ]) {
    a.tube([-lF * 0.32, 0.05 + dy - 0.04, zC + dz], [lF * 0.32, 0.05 + dy - 0.04, zC + dz], 0.045, 0.045, 'bois', TEINTES.noyer, { seg: 10 });
  }
  // La tablette, et le manteau qui monte.
  a.boite(-W / 2, W / 2, hT - 0.05, hT, -D / 2 + pA - 0.18, D / 2, 'bois', TEINTES.chene, { r: 0.006 });
  if (H > hT + 0.05) a.boite(-W / 2 + 0.06, W / 2 - 0.06, hT, H, zC + 0.04, D / 2, 'laque', TEINTES.laque, { sans: ['bas'] });
}

/*
  LA PLANTE — un pot, sa terre, une tige, et un feuillage fait de feuilles.
*/
function plante(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const r = Math.min(W, D) / 2;
  const rp = r * 0.55;
  const hp = Math.min(0.36, H * 0.26);
  const pot = c.hasard() < 0.5 ? TEINTES.terre : TEINTES.ceramique;
  const matPot: Matiere = pot === TEINTES.terre ? 'terre' : 'ceramique';
  a.tour(
    [
      [0, 0],
      [rp * 0.78, 0, true],
      [rp, hp - 0.02],
      [rp + 0.008, hp - 0.02, true],
      [rp + 0.008, hp, true],
      [rp - 0.008, hp, true],
      [rp - 0.01, hp - 0.03, true],
    ],
    0,
    0,
    matPot,
    pot,
    { seg: 28 },
  );
  a.tour([[rp - 0.011, hp - 0.03], [0, hp - 0.026]], 0, 0, 'terre', TEINTES.terreau, { seg: 20 });
  const hTige = hp + (H - hp) * 0.35;
  a.tube([0, hp - 0.03, 0], [0.01, hTige, -0.01], 0.012, 0.009, 'bois', TEINTES.noyer, { seg: 8 });
  // Le feuillage : des feuilles sur une ellipsoïde, plus serrées en haut.
  const cy = hp + (H - hp) * 0.58;
  const ry = (H - hp) * 0.42;
  const rx = W / 2 - 0.02;
  const rz = D / 2 - 0.02;
  const nb = Math.round(120 + 70 * Math.min(1, (W * D) / 0.3));
  // Quelques tiges qui partent du tronc vers la couronne.
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2 + c.hasard();
    a.tube([0.01, hTige - 0.02, -0.01], [Math.cos(ang) * rx * 0.45, cy + (c.hasard() - 0.3) * ry * 0.6, Math.sin(ang) * rz * 0.45], 0.006, 0.004, 'bois', TEINTES.noyer, { seg: 6, bouts: 'aucun' });
  }
  for (let k = 0; k < nb; k++) {
    const u = c.hasard() * Math.PI * 2;
    const v = Math.acos(1 - 2 * Math.pow(c.hasard(), 0.85));
    const s = 0.35 + c.hasard() * 0.65;
    const dir: V3 = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
    const long = 0.1 + c.hasard() * 0.1;
    const base: V3 = [dir[0] * rx * s * 0.8, cy + dir[1] * ry * s * 0.8, dir[2] * rz * s * 0.8];
    const sortie: V3 = [dir[0], dir[1] * 0.6 - 0.25, dir[2]];
    // La feuille reste dans l'emprise.
    const bout: V3 = [base[0] + sortie[0] * long, base[1] + sortie[1] * long, base[2] + sortie[2] * long];
    const marge = long * 0.32 + 0.008;
    if (
      Math.max(Math.abs(bout[0]), Math.abs(base[0])) > W / 2 - marge ||
      Math.max(Math.abs(bout[2]), Math.abs(base[2])) > D / 2 - marge ||
      Math.max(bout[1], base[1]) > H - marge ||
      bout[1] < hp
    )
      continue;
    a.feuille(base, sortie, [0, 1, 0], long, long * 0.42, TEINTES.vert[Math.floor(c.hasard() * 3)]);
  }
}

/* LE TAPIS — une bordure, un champ, la trame. */
function tapis(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const h = Math.min(H, 0.015);
  a.boite(-W / 2, W / 2, 0, h - 0.002, -D / 2, D / 2, 'tissu', TEINTES.beige, { r: [0.01, 0.003, 0.01], sans: ['bas'] });
  a.boite(-W / 2 + 0.07, W / 2 - 0.07, 0, h, -D / 2 + 0.07, D / 2 - 0.07, 'tissu', c.teinte ?? TEINTES.lin2, { sans: ['bas'] });
}

function portemanteau(a: Atelier, { W, D, H }: Gabarit) {
  const r = Math.min(W, D) / 2;
  a.tour([[0, 0], [r * 0.6, 0, true], [r * 0.6, 0.015], [r * 0.45, 0.03], [0, 0.032]], 0, 0, 'noir', TEINTES.noir, { seg: 28 });
  a.tube([0, 0.03, 0], [0, H - 0.03, 0], 0.016, 0.016, 'bois', TEINTES.chene, { seg: 12 });
  a.tour([[0, H - 0.04], [0.025, H - 0.03], [0.022, H - 0.01], [0, H]], 0, 0, 'bois', TEINTES.chene, { seg: 14 });
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2;
    const y = H - 0.12 - (k % 2) * 0.12;
    a.tube([0, y, 0], [Math.cos(ang) * (r - 0.03), y + 0.07, Math.sin(ang) * (r - 0.03)], 0.007, 0.007, 'bois', TEINTES.chene, { seg: 8 });
  }
}

function miroir(a: Atelier, { W, D, H }: Gabarit, c?: Commande) {
  const ep = Math.min(D, 0.03);
  const z1 = D / 2;
  if (c?.modele.startsWith('miroirrond')) {
    // LE MIROIR ROND : un disque se tourne autour de la verticale ; on le
    // fabrique couché, puis on le redresse contre le mur.
    const R = Math.min(W, H) / 2;
    a.avec(tourner('x', -Math.PI / 2, [0, H / 2, z1]), () => {
      a.tour([[0, H / 2], [R, H / 2, true], [R, H / 2 + ep - 0.006, true], [0, H / 2 + ep - 0.006]], 0, z1, 'bois', c.teinte ?? TEINTES.chene, { seg: 48 });
      a.tour([[0, H / 2 + ep - 0.006], [R - 0.03, H / 2 + ep - 0.006, true], [R - 0.03, H / 2 + ep - 0.002, true], [0, H / 2 + ep - 0.002]], 0, z1, 'miroir', TEINTES.chrome, { seg: 48 });
    });
    return;
  }
  if (c?.modele.startsWith('miroirled')) {
    // LE MIROIR ÉCLAIRÉ : la glace bord à bord, un ruban de lumière tout
    // autour, en retrait du bord — celui des salles d'eau d'aujourd'hui.
    a.boite(-W / 2, W / 2, 0, H, z1 - ep, z1, 'noir', TEINTES.anthracite, { r: 0.012, seg: 1 });
    a.boite(-W / 2 + 0.004, W / 2 - 0.004, 0.004, H - 0.004, z1 - ep - 0.002, z1 - ep + 0.001, 'miroir', TEINTES.chrome, { sans: ['arriere'] });
    const b = Math.min(0.05, W * 0.08, H * 0.08);
    const l = 0.012;
    const zl = z1 - ep - 0.004;
    a.boite(-W / 2 + b, W / 2 - b, b, b + l, zl, zl + 0.002, 'lumiere', LUEUR);
    a.boite(-W / 2 + b, W / 2 - b, H - b - l, H - b, zl, zl + 0.002, 'lumiere', LUEUR);
    a.boite(-W / 2 + b, -W / 2 + b + l, b, H - b, zl, zl + 0.002, 'lumiere', LUEUR);
    a.boite(W / 2 - b - l, W / 2 - b, b, H - b, zl, zl + 0.002, 'lumiere', LUEUR);
    return;
  }
  a.boite(-W / 2, W / 2, 0, H, z1 - ep, z1, 'bois', TEINTES.chene, { r: 0.008, seg: 1 });
  a.boite(-W / 2 + 0.03, W / 2 - 0.03, 0.03, H - 0.03, z1 - ep - 0.002, z1 - ep + 0.001, 'miroir', TEINTES.chrome, { sans: ['arriere'] });
}

/** Ce qui éclaire, dans un meuble : l'abat-jour allumé, le ruban d'un miroir. */
const LUEUR = '#FFF2D6';

/*
  LES MEUBLES D'AUJOURD'HUI — relevé du patron : « ajoute de nouveaux
  meubles, miroirs éclairés, etc., tout ce qu'on peut trouver aujourd'hui
  dans un appartement ». Chacun a sa silhouette, à ses cotes, dans les
  matières de la mise en ambiance ; ce qui éclaire (l'abat-jour d'une lampe,
  le ruban d'un miroir) est de la matière `lumiere`.
*/

/** Une lampe : lampadaire, lampe de chevet, lampe de bureau. */
function lampe(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const R = Math.min(W, D) / 2;
  const abat = c.teinte ?? TEINTES.linge;
  if (c.modele.startsWith('lampebureau')) {
    // Le pied, le bras en deux temps, la tête orientée vers le plan.
    a.tour([[0, 0], [R * 0.9, 0, true], [R * 0.9, 0.018], [R * 0.72, 0.026], [0, 0.028]], 0, 0, 'noir', TEINTES.anthracite, { seg: 24 });
    const coude: V3 = [0, H * 0.62, D * 0.12];
    a.tube([0, 0.026, 0], coude, 0.007, 0.007, 'noir', TEINTES.anthracite, { seg: 8 });
    const tete: V3 = [0, H * 0.9, -D * 0.22];
    a.tube(coude, tete, 0.007, 0.007, 'noir', TEINTES.anthracite, { seg: 8 });
    a.tour([[R * 0.45, H * 0.8], [R * 0.25, H * 0.98], [0.01, H]], 0, -D * 0.25, 'noir', TEINTES.anthracite, { seg: 20 });
    a.tour([[0, H * 0.8], [R * 0.4, H * 0.805]], 0, -D * 0.25, 'lumiere', LUEUR, { seg: 20 });
    return;
  }
  if (c.modele.startsWith('lampechevet')) {
    // Un pied de céramique galbé, un abat-jour droit.
    const hp = H * 0.52;
    a.tour(
      [[0, 0], [R * 0.4, 0, true], [R * 0.55, hp * 0.35], [R * 0.48, hp * 0.75], [R * 0.16, hp * 0.95], [R * 0.12, hp], [0, hp]],
      0,
      0,
      'ceramique',
      TEINTES.argile,
      { seg: 24 },
    );
    a.tube([0, hp, 0], [0, H * 0.62, 0], 0.006, 0.006, 'chrome', TEINTES.chrome, { seg: 8 });
    a.tour([[R, H * 0.5], [R * 0.72, H], [R * 0.7, H - 0.002], [R * 0.97, H * 0.5 + 0.002]], 0, 0, 'tissu', abat, { seg: 28 });
    a.tour([[0, H * 0.58], [R * 0.2, H * 0.6], [0, H * 0.68]], 0, 0, 'lumiere', LUEUR, { seg: 14 });
    return;
  }
  // Le lampadaire : un socle lourd, une tige, un abat-jour.
  a.tour([[0, 0], [R * 0.7, 0, true], [R * 0.7, 0.02], [R * 0.55, 0.03], [0, 0.032]], 0, 0, 'noir', TEINTES.anthracite, { seg: 28 });
  a.tube([0, 0.03, 0], [0, H - 0.3, 0], 0.011, 0.011, 'noir', TEINTES.anthracite, { seg: 10 });
  a.tour([[R, H - 0.34], [R * 0.74, H], [R * 0.72, H - 0.002], [R * 0.98, H - 0.338]], 0, 0, 'tissu', abat, { seg: 32 });
  a.tour([[0, H - 0.3], [R * 0.16, H - 0.27], [0, H - 0.2]], 0, 0, 'lumiere', LUEUR, { seg: 14 });
}

/** Le pouf : un tambour de tissu, aux bords adoucis. */
function pouf(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const R = Math.min(W, D) / 2;
  a.tour(
    [[0, 0], [R * 0.94, 0], [R, 0.03], [R, H - 0.05], [R * 0.95, H - 0.01], [R * 0.85, H], [0, H]],
    0,
    0,
    'tissu',
    c.teinte ?? TEINTES.lin,
    { seg: 32, sx: W / (2 * R), sz: D / (2 * R) },
  );
}

/** La cave à vin : un caisson sombre, une porte vitrée, les clayettes derrière. */
function caveVin(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const corps = c.teinte ?? TEINTES.noir;
  // La poignée dépasse de la porte : la façade se pose en retrait d'autant.
  const zF = -D / 2 + 0.06;
  a.boite(-W / 2, W / 2, 0, H, zF, D / 2, 'laque', corps, { r: 0.008, seg: 1 });
  // Les clayettes de bois, chacune avec sa rangée de goulots.
  const n = Math.max(3, Math.round(H / 0.16));
  for (let k = 1; k < n; k++) {
    const y = (H * k) / n;
    a.boite(-W / 2 + 0.04, W / 2 - 0.04, y - 0.012, y, zF + 0.01, D / 2 - 0.04, 'bois', TEINTES.chene);
    for (let b = 0; b < 5; b++) {
      const x = -W / 2 + 0.07 + ((W - 0.14) * b) / 4;
      a.tube([x, y + 0.025, zF + 0.02], [x, y + 0.025, zF + 0.2], 0.03, 0.03, 'verre', '#3E5A3A', { seg: 10 });
    }
  }
  // La porte : un cadre inox et son verre fumé.
  a.boite(-W / 2, W / 2, 0.02, H - 0.02, zF - 0.02, zF, 'inox', TEINTES.inox, { r: 0.006, sans: ['arriere'] });
  a.boite(-W / 2 + 0.035, W / 2 - 0.035, 0.06, H - 0.05, zF - 0.024, zF - 0.018, 'verre', TEINTES.hublot);
  poignee(a, W / 2 - 0.05, H * 0.6, zF - 0.02, Math.min(0.4, H * 0.4), true);
}

/** La colonne four : le four, le micro-ondes au-dessus, un placard en tête. */
function colonneFour(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  const corps = c.teinte ?? TEINTES.laque;
  const zF = -D / 2 + 0.05;
  a.boite(-W / 2, W / 2, 0, H, zF, D / 2, 'laque', corps, { r: 0.004, seg: 1 });
  a.boite(-W / 2 + 0.005, W / 2 - 0.005, 0, 0.1, zF - 0.005, zF, 'noir', TEINTES.anthracite);
  // Le four, à hauteur d'yeux baissés.
  const f0 = Math.min(0.78, H * 0.37);
  const f1 = f0 + 0.6;
  a.boite(-W / 2 + 0.01, W / 2 - 0.01, f0, f1, zF - 0.02, zF, 'inox', TEINTES.inox, { r: 0.004, sans: ['arriere'] });
  a.boite(-W / 2 + 0.03, W / 2 - 0.03, f0 + 0.03, f1 - 0.1, zF - 0.022, zF - 0.02, 'ecran', TEINTES.ecran);
  a.tube([-W / 2 + 0.06, f1 - 0.05, zF - 0.035], [W / 2 - 0.06, f1 - 0.05, zF - 0.035], 0.008, 0.008, 'chrome', TEINTES.chrome, { seg: 10 });
  // Le micro-ondes, juste au-dessus.
  const m0 = f1 + 0.02;
  const m1 = Math.min(H - 0.25, m0 + 0.38);
  if (m1 - m0 > 0.2) {
    a.boite(-W / 2 + 0.01, W / 2 - 0.01, m0, m1, zF - 0.02, zF, 'inox', TEINTES.inox, { r: 0.004, sans: ['arriere'] });
    a.boite(-W / 2 + 0.03, W / 2 - 0.14, m0 + 0.03, m1 - 0.03, zF - 0.022, zF - 0.02, 'ecran', TEINTES.hublot);
  }
  // Les portes de placard, en bas et en haut.
  a.boite(-W / 2 + 0.003, W / 2 - 0.003, 0.11, f0 - 0.01, zF - 0.018, zF, 'laque', corps, { r: 0.003, sans: ['arriere'] });
  if (H - m1 > 0.12) a.boite(-W / 2 + 0.003, W / 2 - 0.003, m1 + 0.02, H - 0.005, zF - 0.018, zF, 'laque', corps, { r: 0.003, sans: ['arriere'] });
}

/** Le radiateur à ailettes, ou le sèche-serviettes à barreaux. */
function radiateur(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const blanc = c.teinte ?? TEINTES.laque;
  const z1 = D / 2;
  if (c.modele.startsWith('secheserviettes')) {
    // Deux montants, des barreaux serrés en groupes.
    const r = Math.min(0.016, D / 3);
    const zc = z1 - Math.max(r * 2, D * 0.7);
    for (const x of [-W / 2 + r, W / 2 - r]) a.tube([x, 0, zc], [x, H, zc], r, r, 'laque', blanc, { seg: 10 });
    // Les pattes qui le tiennent au mur, en haut et en bas.
    for (const x of [-W / 2 + r, W / 2 - r]) {
      for (const y of [0.12, H - 0.12]) a.boite(x - 0.01, x + 0.01, y - 0.015, y + 0.015, zc, z1, 'laque', blanc, { r: 0.004 });
    }
    let y = 0.05;
    while (y < H - 0.03) {
      a.tube([-W / 2 + r, y, zc], [W / 2 - r, y, zc], r * 0.6, r * 0.6, 'laque', blanc, { seg: 8, bouts: 'aucun' });
      y += y < H * 0.45 ? 0.05 : 0.075;
    }
    return;
  }
  // Le panneau : une face à cannelures, un dessus à grille, des pattes au mur.
  const zAv = -D / 2 + 0.006;
  const zAr = D / 2 - 0.025;
  a.boite(-W / 2, W / 2, 0, H, zAv, zAr, 'laque', blanc, { r: 0.008, seg: 1 });
  const n = Math.max(6, Math.round(W / 0.05));
  for (let k = 0; k < n; k++) {
    const x = -W / 2 + 0.03 + ((W - 0.06) * (k + 0.5)) / n;
    a.boite(x - 0.006, x + 0.006, 0.04, H - 0.04, -D / 2, zAv, 'laque', blanc);
  }
  a.boite(-W / 2 + 0.02, W / 2 - 0.02, H - 0.004, H, zAv + 0.01, zAr - 0.01, 'noir', TEINTES.anthracite);
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) a.boite(x - 0.015, x + 0.015, H * 0.4, H * 0.6, zAr, z1, 'noir', TEINTES.anthracite);
}

/** Le climatiseur mural : un caisson blanc, sa grille de soufflage. */
function climatiseur(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const blanc = c.teinte ?? TEINTES.laque;
  const zF = -D / 2 + 0.008;
  a.boite(-W / 2, W / 2, 0, H, zF, D / 2, 'laque', blanc, { r: [0.03, 0.05, 0.05], seg: 3 });
  a.boite(-W / 2 + 0.05, W / 2 - 0.05, 0.03, 0.075, zF - 0.004, zF + 0.03, 'noir', TEINTES.anthracite);
  a.boite(-W / 2 + 0.06, W / 2 - 0.06, 0.05, 0.056, -D / 2, zF + 0.01, 'laque', blanc);
  a.boite(W / 2 - 0.1, W / 2 - 0.07, H * 0.6, H * 0.6 + 0.012, zF - 0.004, zF + 0.01, 'lumiere', '#7BE0A6');
}

/** Le chauffe-eau : une cuve blanche, son boîtier, ses deux tubes. */
function chauffeEau(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const R = Math.min(W, D) / 2;
  const Rc = R * 0.9;
  const blanc = c.teinte ?? TEINTES.laque;
  const bas = Math.min(0.2, H * 0.12);
  a.tour(
    [[0, bas], [Rc * 0.8, bas], [Rc * 0.97, bas + 0.04], [Rc, bas + 0.1], [Rc, H - 0.1], [Rc * 0.97, H - 0.04], [Rc * 0.8, H], [0, H]],
    0,
    0,
    'laque',
    blanc,
    { seg: 32 },
  );
  // Le boîtier du thermostat, en saillie sur le devant de la cuve.
  a.boite(-R * 0.35, R * 0.35, bas + 0.06, bas + 0.2, -R, -Rc * 0.6, 'laque', '#E4E6E8', { r: 0.01 });
  for (const x of [-R * 0.3, R * 0.3]) a.tube([x, bas + 0.02, 0], [x, 0, 0], 0.011, 0.011, 'chrome', TEINTES.chrome, { seg: 10 });
}

/** La coiffeuse : une table à tiroir, et son miroir posé dessus. */
function coiffeuse(a: Atelier, g: Gabarit, c: Commande) {
  const { W, D, H } = g;
  const ht = Math.min(0.76, H * 0.6);
  table(a, { W, D, H: ht }, { ...c, modele: 'bureau' });
  const mx = Math.min(W * 0.32, 0.35);
  const z1 = D / 2 - 0.02;
  a.boite(-mx - 0.02, mx + 0.02, ht + 0.02, H, z1 - 0.025, z1, 'bois', TEINTES.chene, { r: 0.01, seg: 1 });
  a.boite(-mx, mx, ht + 0.04, H - 0.02, z1 - 0.027, z1 - 0.024, 'miroir', TEINTES.chrome, { sans: ['arriere'] });
}

/** L'écran d'ordinateur : un pied plat, un col, la dalle et son cadre fin. */
function ecranPc(a: Atelier, { W, D, H }: Gabarit) {
  const pied = Math.min(0.22, W * 0.4);
  // Un arrondi égal sur les trois axes : inégal, il retournait les faces des coins.
  a.boite(-pied / 2, pied / 2, 0, 0.012, -D / 2, D / 2, 'noir', TEINTES.anthracite, { r: 0.004 });
  a.boite(-0.025, 0.025, 0.012, H * 0.45, D / 2 - 0.06, D / 2 - 0.03, 'noir', TEINTES.anthracite, { r: 0.006 });
  const zd = -0.01;
  a.boite(-W / 2, W / 2, H * 0.22, H, zd, zd + 0.025, 'noir', TEINTES.noir, { r: 0.006 });
  a.boite(-W / 2 + 0.008, W / 2 - 0.008, H * 0.22 + 0.02, H - 0.008, zd - 0.002, zd, 'ecran', TEINTES.ecran);
}

/** Ce qu'on ne sait pas nommer : un volume net, sans prétendre à rien. */
function objet(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  a.boite(-W / 2, W / 2, 0, H, -D / 2, D / 2, 'laque', c.teinte ?? '#D8D4CC', { r: Math.min(0.02, W / 4, D / 4, H / 4), seg: 1 });
}

// ------------------------------------------------------------ l'aiguillage

/** Le modèle d'un meuble, d'après sa catégorie et sa référence. */
/*
  POUR PLAIRE À CHACUN — relevé du patron : « complète le catalogue par des
  variétés de décorations, meubles, pour plaire à chacun ». La décoration
  (tableaux, miroir rond, horloge, vase, plantes, rideaux), quelques meubles
  qui font une maison (piano, aquarium, poêle, lits superposés, portant) et
  le dehors (transat, jardinière, parasol, barbecue). Mêmes règles que le
  reste du mobilier : tout tient dans la caisse et la remplit, le mur est
  derrière (+z), la pièce devant (−z).
*/

/** Des feuilles semées dans une zone, toutes gardées dans l'emprise. */
function semerDesFeuilles(
  a: Atelier,
  c: Commande,
  { W, D, H }: Gabarit,
  n: number,
  semer: () => { base: V3; dir: V3; long: number },
  plancher = 0,
) {
  for (let k = 0; k < n; k++) {
    const { base, dir, long } = semer();
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const bout: V3 = [base[0] + (dir[0] / l) * long, base[1] + (dir[1] / l) * long, base[2] + (dir[2] / l) * long];
    const marge = long * 0.32 + 0.008;
    if (
      Math.max(Math.abs(bout[0]), Math.abs(base[0])) > W / 2 - marge ||
      Math.max(Math.abs(bout[2]), Math.abs(base[2])) > D / 2 - marge ||
      Math.max(bout[1], base[1]) > H - marge ||
      Math.min(bout[1], base[1]) < plancher + marge
    )
      continue;
    a.feuille(base, dir, [0, 1, 0], long, long * 0.42, TEINTES.vert[Math.floor(c.hasard() * 3)]);
  }
}

/** Le tableau, et le trio de cadres photo : un cadre, un fond, ce qu'il montre. */
function cadre(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const z0 = -D / 2;
  const z1 = D / 2;
  const zf = z0 + Math.min(0.01, D * 0.3);
  const unCadre = (x0: number, x1: number, y0: number, y1: number, bord: string, fond: string) => {
    const b = Math.min(0.035, (x1 - x0) * 0.08, (y1 - y0) * 0.08);
    a.boite(x0, x1, y0, y0 + b, z0, z1, 'bois', bord, { r: 0.003, seg: 1 });
    a.boite(x0, x1, y1 - b, y1, z0, z1, 'bois', bord, { r: 0.003, seg: 1 });
    a.boite(x0, x0 + b, y0 + b, y1 - b, z0, z1, 'bois', bord, { r: 0.003, seg: 1 });
    a.boite(x1 - b, x1, y0 + b, y1 - b, z0, z1, 'bois', bord, { r: 0.003, seg: 1 });
    // Le fond, en retrait du cadre.
    a.boite(x0 + b, x1 - b, y0 + b, y1 - b, zf, z1, 'papier', fond, { sans: ['arriere'] });
    return { x0: x0 + b, x1: x1 - b, y0: y0 + b, y1: y1 - b };
  };
  // Ce qui se montre, posé sur le fond.
  const aplat = (x0: number, x1: number, y0: number, y1: number, teinte: string) =>
    a.boite(x0, x1, y0, y1, zf - 0.002, zf, 'papier', teinte, { sans: ['arriere'] });

  if (c.modele.startsWith('triptyque')) {
    // TROIS TOILES QUI SE RÉPONDENT, côte à côte.
    const jeu = W * 0.04;
    const lw = (W - 2 * jeu) / 3;
    const teintes: [string, string][] = [
      [TEINTES.sauge, TEINTES.bleu],
      [TEINTES.argile, TEINTES.sauge],
      [TEINTES.bleu, TEINTES.argile],
    ];
    teintes.forEach(([bas, haut], k) => {
      const x0 = -W / 2 + k * (lw + jeu);
      const f = unCadre(x0, x0 + lw, 0, H, c.teinte ?? TEINTES.noir, '#F1ECE2');
      const lx = f.x1 - f.x0;
      const ly = f.y1 - f.y0;
      aplat(f.x0, f.x1, f.y0, f.y0 + ly * 0.4, bas);
      aplat(f.x0 + lx * 0.2, f.x1 - lx * 0.2, f.y0 + ly * 0.55, f.y0 + ly * 0.85, haut);
    });
    return;
  }
  if (c.modele.startsWith('cadresphotos')) {
    const teintes = [TEINTES.bleu, TEINTES.argile, TEINTES.sauge];
    const cadres: [number, number, number, number][] = [
      [-W / 2, -W / 2 + W * 0.28, H * 0.18, H * 0.82],
      [-W / 2 + W * 0.34, W / 2 - W * 0.34, 0, H],
      [W / 2 - W * 0.28, W / 2, H * 0.08, H * 0.62],
    ];
    cadres.forEach(([x0, x1, y0, y1], k) => {
      const f = unCadre(x0, x1, y0, y1, k === 1 ? TEINTES.noir : TEINTES.chene, TEINTES.linge);
      const mx = (f.x1 - f.x0) * 0.16;
      const my = (f.y1 - f.y0) * 0.16;
      aplat(f.x0 + mx, f.x1 - mx, f.y0 + my, f.y1 - my, teintes[k]);
    });
    return;
  }
  // Le tableau : une toile abstraite, un horizon, deux masses de couleur.
  const f = unCadre(-W / 2, W / 2, 0, H, c.teinte ?? TEINTES.chene, '#F1ECE2');
  const lx = f.x1 - f.x0;
  const ly = f.y1 - f.y0;
  aplat(f.x0, f.x1, f.y0, f.y0 + ly * 0.38, TEINTES.sauge);
  aplat(f.x0 + lx * 0.12, f.x0 + lx * 0.46, f.y0 + ly * 0.5, f.y0 + ly * 0.86, TEINTES.argile);
  aplat(f.x0 + lx * 0.58, f.x0 + lx * 0.9, f.y0 + ly * 0.3, f.y0 + ly * 0.66, TEINTES.bleu);
}

/** L'horloge murale : un boîtier rond, son cadran, ses aiguilles. */
function horloge(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const R = Math.min(W, H) / 2;
  const ep = Math.min(D, 0.05);
  const yc = H / 2;
  const z1 = D / 2;
  // Un disque se tourne autour de la verticale : on le fabrique couché, puis
  // on le redresse contre le mur.
  a.avec(tourner('x', -Math.PI / 2, [0, yc, z1]), () => {
    a.tour([[0, yc], [R, yc, true], [R, yc + ep - 0.006, true], [0, yc + ep - 0.006]], 0, z1, 'noir', c.teinte ?? TEINTES.noir, { seg: 48 });
    a.tour([[0, yc + ep - 0.006], [R - 0.014, yc + ep - 0.006, true], [R - 0.014, yc + ep - 0.004, true], [0, yc + ep - 0.004]], 0, z1, 'laque', TEINTES.linge, { seg: 48 });
  });
  const zh0 = z1 - ep + 0.0005;
  const zh1 = z1 - ep + 0.003;
  // Les douze heures.
  for (let k = 0; k < 12; k++) {
    a.avec(tourner('z', (k * Math.PI) / 6, [0, yc, 0]), () => {
      a.boite(-0.003, 0.003, yc + R * 0.72, yc + R * (k % 3 === 0 ? 0.86 : 0.8), zh0, zh1, 'noir', TEINTES.noir);
    });
  }
  // Dix heures dix : l'heure des vitrines.
  a.avec(tourner('z', Math.PI / 3, [0, yc, 0]), () => {
    a.boite(-0.006, 0.006, yc - R * 0.08, yc + R * 0.48, zh0, zh1, 'noir', TEINTES.noir, { r: 0.002 });
  });
  a.avec(tourner('z', -Math.PI / 3, [0, yc, 0]), () => {
    a.boite(-0.004, 0.004, yc - R * 0.1, yc + R * 0.68, zh0, zh1, 'noir', TEINTES.noir, { r: 0.0015 });
  });
}

/** Le grand vase et sa gerbe de branches. */
function vase(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const R = Math.min(W, D) / 2;
  const hv = H * 0.55;
  a.tour(
    [
      [0, 0],
      [R * 0.55, 0, true],
      [R * 0.85, hv * 0.25],
      [R, hv * 0.5],
      [R * 0.75, hv * 0.78],
      [R * 0.42, hv * 0.92],
      [R * 0.48, hv, true],
      [R * 0.36, hv, true],
      [0, hv * 0.9],
    ],
    0,
    0,
    'ceramique',
    c.teinte ?? TEINTES.argile,
    { seg: 36, sx: W / (2 * R), sz: D / (2 * R) },
  );
  // Les branches s'ouvrent depuis le col ; la première monte jusqu'en haut.
  const n = 7;
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + c.hasard() * 0.5;
    const ouvre = k === 0 ? 0.15 : 0.45 + c.hasard() * 0.5;
    const haut = k === 0 ? H - 0.006 : H * (0.72 + c.hasard() * 0.24);
    const bout: V3 = [Math.cos(ang) * (W / 2 - 0.012) * ouvre, haut, Math.sin(ang) * (D / 2 - 0.012) * ouvre];
    a.tube([0, hv * 0.85, 0], bout, 0.004, 0.003, 'bois', TEINTES.noyer, { seg: 6 });
  }
  semerDesFeuilles(a, c, { W, D, H }, 60, () => {
    const ang = c.hasard() * Math.PI * 2;
    const r = (0.2 + c.hasard() * 0.75) * (Math.min(W, D) / 2);
    const y = hv + (H - hv) * (0.35 + c.hasard() * 0.6);
    return { base: [Math.cos(ang) * r, y, Math.sin(ang) * r], dir: [Math.cos(ang), 0.5, Math.sin(ang)], long: 0.045 + c.hasard() * 0.03 };
  }, hv);
}

/** La plante suspendue : un pot à cordes, un feuillage qui retombe. */
function planteSuspendue(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const r = Math.min(W, D) / 2;
  const rp = r * 0.5;
  const yp0 = H * 0.42;
  const yp1 = H * 0.62;
  a.tour(
    [
      [0, yp0],
      [rp * 0.72, yp0, true],
      [rp, yp1 - 0.01],
      [rp + 0.006, yp1, true],
      [0, yp1 - 0.02],
    ],
    0,
    0,
    'ceramique',
    c.teinte ?? TEINTES.ceramique,
    { seg: 28 },
  );
  // Trois cordes jusqu'au crochet.
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI * 2) / 3;
    a.tube([Math.cos(ang) * rp * 0.95, yp1, Math.sin(ang) * rp * 0.95], [0, H - 0.03, 0], 0.003, 0.003, 'tissu', TEINTES.beige, { seg: 6 });
  }
  a.tube([0, H - 0.035, 0], [0, H - 0.004, 0], 0.006, 0.006, 'noir', TEINTES.noir, { seg: 8 });
  // Les tiges qui retombent jusqu'en bas, puis les feuilles qui les habillent.
  const tiges = 7;
  for (let k = 0; k < tiges; k++) {
    const ang = (k / tiges) * Math.PI * 2 + c.hasard() * 0.4;
    const loin = r - 0.012;
    const mi: V3 = [Math.cos(ang) * loin * 0.85, yp1 - (yp1 - 0.05) * 0.35, Math.sin(ang) * loin * 0.85];
    const bas: V3 = [Math.cos(ang) * loin, k === 0 ? 0.03 : 0.03 + c.hasard() * 0.12, Math.sin(ang) * loin];
    a.tube([Math.cos(ang) * rp, yp1 - 0.005, Math.sin(ang) * rp], mi, 0.003, 0.003, 'feuillage', TEINTES.vert[1], { seg: 5 });
    a.tube(mi, bas, 0.003, 0.0025, 'feuillage', TEINTES.vert[1], { seg: 5 });
  }
  semerDesFeuilles(a, c, { W, D, H }, 140, () => {
    const ang = c.hasard() * Math.PI * 2;
    const t = Math.pow(c.hasard(), 0.8);
    const y = yp1 + 0.04 - t * (yp1 - 0.02);
    const rr = rp + (r - rp - 0.05) * Math.min(1, t * 1.4);
    return {
      base: [Math.cos(ang) * rr, y, Math.sin(ang) * rr],
      dir: [Math.cos(ang) * 0.5, -0.8, Math.sin(ang) * 0.5],
      long: 0.05 + c.hasard() * 0.04,
    };
  });
}

/** Les rideaux : une tringle, deux pans plissés qui tombent au sol. */
function rideaux(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const tissu = c.teinte ?? TEINTES.lin2;
  const zt = D / 2 - 0.03;
  a.tube([-W / 2 + 0.012, H - 0.03, zt], [W / 2 - 0.012, H - 0.03, zt], 0.012, 0.012, 'noir', TEINTES.anthracite, { seg: 10 });
  const pan = W * 0.32;
  const plis = 7;
  const lp = pan / plis;
  for (const gauche of [true, false]) {
    const xa = gauche ? -W / 2 : W / 2 - pan;
    for (let k = 0; k < plis; k++) {
      const x0 = xa + k * lp;
      const avant = k % 2 === 0;
      a.boite(x0, x0 + lp, 0.01, H - 0.05, avant ? -D / 2 : -D / 2 + 0.03, avant ? -D / 2 + 0.03 : -D / 2 + 0.06, 'tissu', tissu, {
        // Un rayon UNIFORME : plus fin en hauteur, l'arrondi des coins retournait ses faces.
        r: Math.min(0.01, lp * 0.3),
        seg: 2,
      });
    }
  }
}

/** Le piano droit : le coffre, les joues, le clavier, le pupitre. */
function piano(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const corps = c.teinte ?? TEINTES.noir;
  const zDos = D / 2 - Math.min(0.32, D * 0.55);
  a.boite(-W / 2, W / 2, 0.06, H, zDos, D / 2, 'laque', corps, { r: 0.01, seg: 1 });
  a.boite(-W / 2, W / 2, 0, 0.06, zDos - 0.03, D / 2, 'laque', corps, { r: 0.004 });
  const yK = Math.min(0.72, H * 0.58);
  const joue = 0.06;
  a.boite(-W / 2, -W / 2 + joue, 0, yK + 0.06, -D / 2, zDos, 'laque', corps, { r: 0.008, seg: 1 });
  a.boite(W / 2 - joue, W / 2, 0, yK + 0.06, -D / 2, zDos, 'laque', corps, { r: 0.008, seg: 1 });
  const xg = -W / 2 + joue;
  const xd = W / 2 - joue;
  const zK = -D / 2 + 0.02;
  // Le lit du clavier, les blanches, les noires.
  a.boite(xg, xd, yK - 0.05, yK, zK, zDos, 'laque', corps, { r: 0.004 });
  a.boite(xg + 0.01, xd - 0.01, yK, yK + 0.02, zK + 0.005, zK + 0.15, 'ceramique', TEINTES.linge, { r: 0.002 });
  const pas = 0.0235;
  const nb = Math.floor((xd - xg - 0.02) / pas);
  for (let k = 0; k < nb - 1; k++) {
    const note = k % 7;
    // Pas de noire entre mi et fa, ni entre si et do.
    if (note === 2 || note === 6) continue;
    const x = xg + 0.01 + (k + 1) * pas;
    a.boite(x - 0.006, x + 0.006, yK + 0.02, yK + 0.032, zK + 0.06, zK + 0.15, 'noir', TEINTES.ecran, { r: 0.002 });
  }
  // Le pupitre, contre le coffre.
  a.boite(xg, xd, yK + 0.02, yK + 0.34, zDos - 0.05, zDos, 'laque', corps, { r: 0.006 });
  // Les pédales.
  for (const x of [-0.08, 0, 0.08]) {
    a.boite(x - 0.015, x + 0.015, 0.03, 0.05, zDos - 0.13, zDos - 0.03, 'inox', TEINTES.inox, { r: 0.004 });
  }
}

/** L'aquarium sur son meuble : le bac, l'eau, le sable, les plantes. */
function aquarium(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const corps = c.teinte ?? TEINTES.noir;
  const hM = Math.min(0.75, H * 0.58);
  const yT = H - 0.06;
  a.boite(-W / 2, W / 2, 0, hM, -D / 2, D / 2, 'laque', corps, { r: 0.006, seg: 1 });
  a.boite(-W / 2 + 0.005, W / 2 - 0.005, hM, yT, -D / 2 + 0.005, D / 2 - 0.005, 'verre', TEINTES.verre);
  a.boite(-W / 2 + 0.015, W / 2 - 0.015, hM + 0.004, hM + 0.035, -D / 2 + 0.015, D / 2 - 0.015, 'pierre', '#D9C9A3');
  a.boite(-W / 2 + 0.012, W / 2 - 0.012, hM + 0.035, yT - 0.04, -D / 2 + 0.012, D / 2 - 0.012, 'verre', '#9FD0D8');
  semerDesFeuilles(
    a,
    c,
    { W, D, H: yT - 0.05 },
    70,
    () => {
      const x = (c.hasard() - 0.5) * (W - 0.12);
      const z = (c.hasard() - 0.2) * (D - 0.1) * 0.5;
      return { base: [x, hM + 0.04 + c.hasard() * 0.12, z], dir: [(c.hasard() - 0.5) * 0.4, 1, (c.hasard() - 0.5) * 0.3], long: 0.06 + c.hasard() * 0.08 };
    },
    hM + 0.03,
  );
  a.boite(-W / 2, W / 2, yT, H, -D / 2, D / 2, 'laque', corps, { r: 0.006 });
}

/** Le poêle à bois : le corps de fonte, la vitre et son feu, le conduit. */
function poele(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const fonte = c.teinte ?? TEINTES.anthracite;
  const hC = Math.min(0.78, H * 0.68);
  const zF = -D / 2 + 0.008;
  a.boite(-W / 2 + 0.03, W / 2 - 0.03, 0, 0.08, zF + 0.03, D / 2 - 0.03, 'noir', TEINTES.noir);
  a.boite(-W / 2, W / 2, 0.08, hC, zF, D / 2, 'noir', fonte, { r: 0.025, seg: 2 });
  // La porte : un cadre, la vitre, et le feu derrière.
  const wx = (W / 2) * 0.62;
  const y0 = 0.08 + (hC - 0.08) * 0.28;
  const y1 = hC - 0.07;
  const b = 0.025;
  a.boite(-wx, wx, y0, y0 + b, -D / 2, zF, 'noir', TEINTES.noir);
  a.boite(-wx, wx, y1 - b, y1, -D / 2, zF, 'noir', TEINTES.noir);
  a.boite(-wx, -wx + b, y0 + b, y1 - b, -D / 2, zF, 'noir', TEINTES.noir);
  a.boite(wx - b, wx, y0 + b, y1 - b, -D / 2, zF, 'noir', TEINTES.noir);
  a.boite(-wx + b, wx - b, y0 + b, y1 - b, zF - 0.004, zF - 0.002, 'lumiere', '#FFB061');
  a.boite(-wx + b, wx - b, y0 + b, y1 - b, -D / 2 + 0.001, -D / 2 + 0.003, 'verre', TEINTES.hublot);
  a.tube([0, hC - 0.01, 0.04], [0, H - 0.004, 0.04], 0.055, 0.055, 'noir', fonte, { seg: 20 });
}

/** Les lits superposés : quatre montants, deux couchages, la barrière, l'échelle. */
function litSuperpose(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const bois = TEINTES.chene;
  const p = 0.05;
  for (const gauche of [true, false]) {
    for (const tete of [true, false]) {
      a.boite(gauche ? -W / 2 : W / 2 - p, gauche ? -W / 2 + p : W / 2, 0, H, tete ? D / 2 - p : -D / 2, tete ? D / 2 : -D / 2 + p, 'bois', bois, {
        r: 0.008,
        seg: 1,
      });
    }
  }
  const yH = Math.min(1.12, H * 0.68);
  for (const y of [0.18, yH]) {
    a.boite(-W / 2 + p, W / 2 - p, y, y + 0.1, -D / 2 + p, D / 2 - p, 'bois', bois, { r: 0.006, seg: 1 });
    a.boite(-W / 2 + p + 0.01, W / 2 - p - 0.01, y + 0.1, y + 0.24, -D / 2 + p + 0.01, D / 2 - p - 0.01, 'linge', TEINTES.linge, { r: 0.04, seg: 2 });
    a.boite(-W / 2 + p + 0.005, W / 2 - p - 0.005, y + 0.24, y + 0.27, -D / 2 + p + 0.005, D / 2 - p - 0.45, 'tissu', c.teinte ?? TEINTES.sauge, {
      r: [0.02, 0.012, 0.02],
      seg: 2,
    });
    a.boite(-W / 2 + p + 0.08, W / 2 - p - 0.08, y + 0.24, y + 0.33, D / 2 - p - 0.38, D / 2 - p - 0.06, 'linge', TEINTES.linge, {
      r: [0.05, 0.04, 0.05],
      seg: 2,
    });
  }
  // La barrière du haut, côté pièce, sur la longueur que l'échelle laisse.
  const zE0 = -D / 2 + p + 0.06;
  const zE1 = zE0 + 0.4;
  a.boite(-W / 2, -W / 2 + 0.03, yH + 0.3, yH + 0.4, zE1 + 0.04, D / 2 - p, 'bois', bois, { r: 0.006 });
  a.boite(-W / 2, -W / 2 + 0.03, yH + 0.3, Math.min(H, yH + 0.4), -D / 2 + p, zE0 - 0.02, 'bois', bois, { r: 0.006 });
  // L'échelle : deux montants, des barreaux.
  for (const z of [zE0, zE1]) a.boite(-W / 2, -W / 2 + 0.03, 0, yH + 0.4, z - 0.02, z + 0.02, 'bois', bois, { r: 0.006 });
  for (let y = 0.3; y < yH + 0.2; y += 0.26) {
    a.tube([-W / 2 + 0.015, y, zE0 + 0.02], [-W / 2 + 0.015, y, zE1 - 0.02], 0.014, 0.014, 'bois', bois, { seg: 8, bouts: 'aucun' });
  }
}

/** Le portant : deux pieds, une barre, des vêtements sur leurs cintres. */
function portant(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const metal = TEINTES.noir;
  const xm = W / 2 - 0.02;
  for (const s of [-1, 1]) {
    a.boite(s * xm - 0.02, s * xm + 0.02, 0, 0.03, -D / 2, D / 2, 'noir', metal, { r: 0.008 });
    a.tube([s * xm, 0.03, 0], [s * xm, H - 0.012, 0], 0.012, 0.012, 'noir', metal, { seg: 10 });
  }
  a.tube([-xm, H - 0.03, 0], [xm, H - 0.03, 0], 0.012, 0.012, 'noir', metal, { seg: 10 });
  const teintes = [TEINTES.linge, TEINTES.bleu, TEINTES.argile, TEINTES.sauge, TEINTES.anthracite, TEINTES.beige, '#7C8C6E', TEINTES.lin];
  const n = Math.max(4, Math.floor((2 * xm - 0.12) / 0.11));
  for (let k = 0; k < n; k++) {
    const x = -xm + 0.08 + (k * (2 * xm - 0.16)) / (n - 1);
    const y1 = H - 0.09;
    const y0 = y1 - H * (0.38 + c.hasard() * 0.22);
    a.boite(x - 0.02, x + 0.02, y0, y1, -D / 2 + 0.03, D / 2 - 0.03, 'tissu', teintes[k % teintes.length], { r: [0.015, 0.03, 0.06], seg: 2 });
    // Le cintre : deux bras, du crochet aux épaules.
    a.tube([x, y1 + 0.002, -D / 2 + 0.07], [x, H - 0.045, 0], 0.003, 0.003, 'bois', TEINTES.chene, { seg: 5 });
    a.tube([x, y1 + 0.002, D / 2 - 0.07], [x, H - 0.045, 0], 0.003, 0.003, 'bois', TEINTES.chene, { seg: 5 });
  }
}

/** Le transat : un piétement de bois, une toile tendue qui remonte en dossier. */
function transat(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const toile = c.teinte ?? TEINTES.bleu;
  const bois = TEINTES.chene;
  const yS = Math.min(0.33, H * 0.38);
  const zPli = -D / 2 + D * 0.42;
  // L'assise, à plat, jusqu'au pli.
  a.boite(-W / 2 + 0.03, W / 2 - 0.03, yS - 0.03, yS, -D / 2 + 0.02, zPli, 'tissu', toile, { r: 0.008 });
  // Le dossier : la même toile, relevée jusqu'en haut.
  const dy = H - yS - 0.03;
  const dz = D / 2 - 0.08 - zPli;
  const L = Math.hypot(dy, dz);
  const angle = Math.atan2(dy, dz);
  a.avec(tourner('x', -angle, [0, yS, zPli]), () => {
    a.boite(-W / 2 + 0.03, W / 2 - 0.03, yS - 0.03, yS, zPli, zPli + L, 'tissu', toile, { r: 0.008 });
  });
  // Les longerons de bois, de chaque côté, sous la toile.
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.016);
    a.tube([x, yS - 0.015, -D / 2 + 0.016], [x, yS - 0.015, zPli], 0.014, 0.014, 'bois', bois, { seg: 8 });
    a.tube([x, yS - 0.015, zPli], [x, H - 0.02, D / 2 - 0.09], 0.014, 0.014, 'bois', bois, { seg: 8 });
    // Les pieds : devant, et la béquille du dossier.
    a.tube([x, 0.0, -D / 2 + 0.05], [x, yS - 0.03, -D / 2 + 0.05], 0.014, 0.014, 'bois', bois, { seg: 8 });
    // Incliné, son bout s'enfonce d'un rayon : on le pose un centimètre plus haut.
    a.tube([x, 0.01, D / 2 - 0.016], [x, (yS + H) * 0.5, (zPli + D / 2) * 0.5], 0.014, 0.014, 'bois', bois, { seg: 8 });
  }
}

/** La jardinière : un bac de bois, sa terre, des touffes qui montent. */
function jardiniere(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const hB = Math.min(0.35, H * 0.45);
  a.boite(-W / 2, W / 2, 0, hB, -D / 2, D / 2, 'bois', c.teinte ?? TEINTES.chene, { r: 0.01, seg: 1 });
  a.boite(-W / 2 + 0.025, W / 2 - 0.025, hB - 0.03, hB + 0.002, -D / 2 + 0.025, D / 2 - 0.025, 'terre', TEINTES.terreau);
  const touffes = Math.max(3, Math.round(W / 0.22));
  for (let t = 0; t < touffes; t++) {
    const xc = -W / 2 + ((t + 0.5) * W) / touffes;
    const tiges: V3[] = [];
    for (let k = 0; k < 3; k++) {
      const haut = t === 0 && k === 0 ? H - 0.012 : hB + (H - hB) * (0.55 + c.hasard() * 0.4);
      const bout: V3 = [xc + (c.hasard() - 0.5) * 0.08, haut, (c.hasard() - 0.5) * (D - 0.12) * 0.6];
      a.tube([xc, hB - 0.01, 0], bout, 0.004, 0.003, 'bois', '#5F7F45', { seg: 5 });
      tiges.push(bout);
    }
    semerDesFeuilles(
      a,
      c,
      { W, D, H },
      34,
      () => {
        const tg = tiges[Math.floor(c.hasard() * tiges.length)];
        const f = 0.3 + c.hasard() * 0.7;
        const base: V3 = [xc + (tg[0] - xc) * f, hB + (tg[1] - hB) * f, tg[2] * f];
        return { base, dir: [(c.hasard() - 0.5) * 1.2, 0.6, (c.hasard() - 0.5) * 1.2], long: 0.06 + c.hasard() * 0.06 };
      },
      hB,
    );
  }
}

/** Le parasol : un pied lesté, un mât, une toile à huit pans. */
function parasol(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const R = Math.min(W, D) / 2 - 0.004;
  a.tour([[0, 0], [0.24, 0, true], [0.24, 0.05], [0.06, 0.08], [0, 0.085]], 0, 0, 'noir', TEINTES.anthracite, { seg: 28 });
  a.tube([0, 0.08, 0], [0, H - 0.06, 0], 0.018, 0.018, 'bois', TEINTES.chene, { seg: 10 });
  a.tour([[0, H - 0.34], [R, H - 0.46, true], [R, H - 0.44, true], [0, H - 0.05]], 0, 0, 'tissu', c.teinte ?? TEINTES.linge, {
    seg: 8,
    sx: W / (2 * R + 0.008),
    sz: D / (2 * R + 0.008),
  });
  a.tour([[0, H - 0.06], [0.025, H - 0.05], [0.02, H - 0.006], [0, H - 0.002]], 0, 0, 'bois', TEINTES.chene, { seg: 12 });
}

/** Le barbecue : la cuve, le couvercle bombé, ses pieds et sa tablette. */
function barbecue(a: Atelier, { W, D, H }: Gabarit, c: Commande) {
  const fonte = c.teinte ?? TEINTES.noir;
  const xb0 = -W / 2 + Math.min(0.24, W * 0.28);
  for (const x of [xb0 + 0.03, W / 2 - 0.03]) {
    for (const z of [-D / 2 + 0.03, D / 2 - 0.03]) {
      a.tube([x, 0, z], [x, 0.62, z], 0.015, 0.015, 'noir', TEINTES.anthracite, { seg: 8 });
    }
  }
  a.boite(xb0 + 0.01, W / 2 - 0.01, 0.22, 0.24, -D / 2 + 0.02, D / 2 - 0.02, 'bois', TEINTES.chene);
  a.boite(xb0, W / 2, 0.6, 0.82, -D / 2 + 0.02, D / 2, 'noir', fonte, { r: 0.03, seg: 2 });
  a.boite(xb0, W / 2, 0.82, H, -D / 2 + 0.02, D / 2, 'noir', fonte, { r: [0.05, 0.08, 0.1], seg: 3 });
  // La poignée du couvercle, devant.
  const xm = (xb0 + W / 2) / 2;
  a.boite(xm - 0.12, xm + 0.12, 0.9, 0.925, -D / 2, -D / 2 + 0.02, 'inox', TEINTES.inox, { r: 0.008 });
  // La tablette latérale.
  a.boite(-W / 2, xb0, 0.76, 0.79, -D / 2 + 0.04, D / 2 - 0.04, 'bois', TEINTES.chene, { r: 0.004 });
}

export function fabriquer(categorie: string, g: Gabarit, c: Omit<Commande, 'categorie'>): ModeleLocal {
  const a = new Atelier();
  const cat = (categorie || '').toLowerCase();
  const m = (c.modele || '').toLowerCase();
  const cmd: Commande = { ...c, categorie: cat, modele: m };
  const gab: Gabarit = { W: Math.max(0.02, g.W), D: Math.max(0.02, g.D), H: Math.max(0.005, g.H) };
  if (cat === 'porte3d') porte3d(a, gab, cmd);
  else if (cat === 'fenetre3d') fenetre3d(a, gab, cmd);
  else if (m.startsWith('tapis') || cat.includes('tapis') || cat.includes('rug')) tapis(a, gab, cmd);
  else if (m.startsWith('portemanteau') || cat.includes('portemanteau')) portemanteau(a, gab);
  else if (m.startsWith('miroir') || cat.includes('miroir') || cat.includes('mirror')) miroir(a, gab, cmd);
  else if (m.startsWith('lampe') || m.startsWith('lampadaire') || cat.includes('lampe') || cat.includes('lamp')) lampe(a, gab, cmd);
  else if (m.startsWith('pouf') || cat.includes('pouf')) pouf(a, gab, cmd);
  else if (m.startsWith('cavevin')) caveVin(a, gab, cmd);
  else if (m.startsWith('colonnefour')) colonneFour(a, gab, cmd);
  else if (m.startsWith('coiffeuse')) coiffeuse(a, gab, cmd);
  else if (m.startsWith('radiateur') || m.startsWith('secheserviettes') || cat.includes('radiateur')) radiateur(a, gab, cmd);
  else if (m.startsWith('clim') || cat.includes('climatiseur')) climatiseur(a, gab, cmd);
  else if (m.startsWith('ecran')) ecranPc(a, gab);
  else if (m.startsWith('cumulus') || cat.includes('chauffeeau')) chauffeEau(a, gab, cmd);
  else if (m.startsWith('plantesuspendue')) planteSuspendue(a, gab, cmd);
  else if (m.startsWith('jardiniere')) jardiniere(a, gab, cmd);
  else if (m.startsWith('plante') || cat.includes('plant')) plante(a, gab, cmd);
  // La décoration et le dehors (voir « Pour plaire à chacun »).
  else if (cat.includes('cadre')) cadre(a, gab, cmd);
  else if (cat.includes('horloge')) horloge(a, gab, cmd);
  else if (cat.includes('vase')) vase(a, gab, cmd);
  else if (cat.includes('rideau')) rideaux(a, gab, cmd);
  else if (cat.includes('piano')) piano(a, gab, cmd);
  else if (cat.includes('aquarium')) aquarium(a, gab, cmd);
  else if (cat.includes('poele')) poele(a, gab, cmd);
  else if (cat.includes('portant')) portant(a, gab, cmd);
  else if (cat.includes('transat')) transat(a, gab, cmd);
  else if (cat.includes('parasol')) parasol(a, gab, cmd);
  else if (cat.includes('barbecue')) barbecue(a, gab, cmd);
  else if (cat.includes('bed')) lit(a, gab, cmd);
  else if (cat.includes('sofa') || cat.includes('couch')) canape(a, gab, cmd);
  else if (cat.includes('chair') || cat.includes('stool')) chaise(a, gab, cmd);
  else if (cat.includes('table') || cat.includes('desk')) table(a, gab, cmd);
  else if (cat.includes('television') || cat === 'tv') television(a, gab);
  else if (cat.includes('refrigerator') || cat.includes('fridge')) refrigerateur(a, gab, cmd);
  else if (cat.includes('stove') || cat.includes('oven') || cat.includes('cooktop')) cuisson(a, gab, cmd);
  else if (cat.includes('dishwasher') || cat.includes('washer') || cat.includes('dryer')) electromenager(a, gab, cmd);
  else if (cat.includes('sink')) evier(a, gab, cmd);
  else if (cat.includes('toilet')) wc(a, gab);
  else if (cat.includes('bathtub') || cat.includes('shower')) baignoire(a, gab, cmd);
  else if (cat.includes('stair')) escalier(a, gab);
  else if (cat.includes('fireplace')) cheminee(a, gab);
  else if (cat.includes('storage') || cat.includes('cabinet') || cat.includes('wardrobe') || cat.includes('shelf')) rangement(a, gab, cmd);
  else objet(a, gab, cmd);
  return a.finir();
}

// ------------------------------------------------------------ dans la scène

/** Un meuble à sa place : ce que la scène a décidé (voir `buildScene`). */
export interface PoseDeMeuble {
  id: string;
  category: string;
  modele?: string;
  width: number;
  depth: number;
  height: number;
  /** Centre de l'emprise, au sol. */
  cx: number;
  cz: number;
  /** Rotation autour de la verticale (radians), comme les faces. */
  yaw: number;
  /** Hauteur du dessous du meuble. */
  yb: number;
  /** Teinte relevée au scan, quand on la demande. */
  color?: string;
  /** Le dessus et les côtés relevés, chacun sa couleur. */
  couleurs?: { dessus?: string; cotes?: string };
  attributes?: string[];
  /** Le mur qui porte une porte en volume : un mur isolé ne garde que les siennes. */
  murId?: string;
}

const ATELIER_CACHE = new Map<string, ModeleLocal>();
const CACHE_MAX = 240;

/** Le modèle d'un meuble posé — fabriqué une fois, gardé tant qu'il ne change pas. */
export function modeleDe(p: PoseDeMeuble): ModeleLocal {
  const cle = [
    p.id,
    p.category,
    p.modele ?? '',
    p.width.toFixed(3),
    p.depth.toFixed(3),
    p.height.toFixed(3),
    p.color ?? '',
    p.couleurs?.dessus ?? '',
    p.couleurs?.cotes ?? '',
    (p.attributes ?? []).join(','),
  ].join('|');
  const deja = ATELIER_CACHE.get(cle);
  if (deja) return deja;
  const modele = fabriquer(
    p.category,
    { W: p.width, D: p.depth, H: p.height },
    {
      modele: p.modele ?? '',
      teinte: p.color,
      dessus: p.couleurs?.dessus,
      cotes: p.couleurs?.cotes,
      attributs: p.attributes ?? [],
      hasard: graineDe(p.id || cle),
    },
  );
  if (ATELIER_CACHE.size >= CACHE_MAX) {
    const premiere = ATELIER_CACHE.keys().next().value;
    if (premiere !== undefined) ATELIER_CACHE.delete(premiere);
  }
  ATELIER_CACHE.set(cle, modele);
  return modele;
}

const composantesDe = (hex: string): [number, number, number] => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return [0.8, 0.8, 0.8];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
};

/**
 * LE BLANC QUI NE FAIT PLUS MAL AUX YEUX — relevé du patron : « les meubles
 * et portes blancs sont trop blancs et font mal aux yeux ; réduis le blanc ».
 *
 * Sous la lumière de la scène, un blanc pur — et les laques, céramiques et
 * linges, entre 94 et 97 % — sortait à l'écran en blanc brûlé : plus aucun
 * détail, un éclat qui fatigue l'œil. Les teintes très claires se tassent
 * vers un blanc cassé : au-delà de 76 % de clarté, la part qui dépasse est
 * réduite des deux tiers. Un blanc pur finit à 84 %, une laque à 82 % ; la
 * nuance se garde (les trois composantes baissent ensemble), et rien de plus
 * sombre ne bouge.
 */
export const SEUIL_DU_BLANC = 0.76;
export function adoucirLeBlanc([r, g, b]: [number, number, number]): [number, number, number] {
  const m = Math.max(r, g, b);
  if (m <= SEUIL_DU_BLANC) return [r, g, b];
  const k = (SEUIL_DU_BLANC + (m - SEUIL_DU_BLANC) / 3) / m;
  return [r * k, g * k, b * k];
}

/** Les meubles qui ne POSENT pas une ombre : ce qui est à plat, ou au mur. */
const SANS_OMBRE = /tapis|rug|miroir|mirror/i;

/**
 * TOUS LES MEUBLES DE LA SCÈNE, POUR LA CARTE GRAPHIQUE.
 *
 * Chaque groupe (une matière, une teinte) part en un bloc :
 *   [code, r, g, b, rugosité, métal, nSommets, nIndices]
 *   puis nSommets × (x, y, z, nx, ny, nz, u, v), puis les indices.
 * Les mêmes matières de tous les meubles sont réunies : un appel de dessin
 * par matière, quel que soit le nombre de meubles.
 *
 * Sous chaque meuble posé au sol, un VOILE D'OMBRE (code 9) : un carré un
 * peu plus grand que l'emprise, que le natif dégrade du centre vers le bord.
 * C'est ce qui fait qu'un meuble POSE au lieu de flotter.
 */
export function maillageDesMeubles(
  poses: PoseDeMeuble[],
  /**
   * Des groupes DÉJÀ POSÉS dans la scène — l'appareillage, fabriqué à part
   * (voir `appareils3d`). Ils rejoignent les groupes de même matière : une
   * prise blanche et une table laquée partent dans le même appel de dessin.
   */
  dejaPoses: GroupeLocal[] = [],
): number[] {
  const groupes = new Map<string, { code: number; rgb: [number, number, number]; rug: number; met: number; v: number[]; i: number[] }>();
  const groupe = (cle: string, code: number, couleur: string, rug: number, met: number) => {
    let g = groupes.get(cle);
    if (!g) {
      g = { code, rgb: adoucirLeBlanc(composantesDe(couleur)), rug, met, v: [], i: [] };
      groupes.set(cle, g);
    }
    return g;
  };
  for (const p of poses) {
    if (!(p.width > 0) || !(p.depth > 0) || !(p.height > 0)) continue;
    const modele = modeleDe(p);
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    for (const gl of modele.groupes) {
      const r = RENDU[gl.mat];
      const g = groupe(`${gl.mat}|${gl.couleur}`, r.code, gl.couleur, r.rugosite, r.metal);
      const base = g.v.length / PAR_SOMMET;
      const v = gl.v;
      for (let k = 0; k < v.length; k += PAR_SOMMET) {
        const x = v[k];
        const z = v[k + 2];
        const nx = v[k + 3];
        const nz = v[k + 5];
        g.v.push(
          p.cx + x * c - z * s,
          p.yb + v[k + 1],
          p.cz + x * s + z * c,
          nx * c - nz * s,
          v[k + 4],
          nx * s + nz * c,
          v[k + 6],
          v[k + 7],
        );
      }
      for (const idx of gl.i) g.i.push(base + idx);
    }
    // L'ombre de contact.
    if (p.yb < 0.05 && !SANS_OMBRE.test(`${p.category} ${p.modele ?? ''}`)) {
      const g = groupe('ombre', CODE_OMBRE, '#000000', 1, 0);
      const mx = p.width / 2 + Math.min(0.12, 0.06 + p.width * 0.04);
      const mz = p.depth / 2 + Math.min(0.12, 0.06 + p.depth * 0.04);
      const base = g.v.length / PAR_SOMMET;
      const y = p.yb + 0.003;
      for (const [lx, lz, u, vv] of [
        [-mx, -mz, 0, 0],
        [mx, -mz, 1, 0],
        [mx, mz, 1, 1],
        [-mx, mz, 0, 1],
      ]) {
        g.v.push(p.cx + lx * c - lz * s, y, p.cz + lx * s + lz * c, 0, 1, 0, u, vv);
      }
      g.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  for (const gl of dejaPoses) {
    if (gl.i.length === 0) continue;
    const r = RENDU[gl.mat];
    const lampe = gl.lampe !== undefined && gl.lampe >= 0 ? gl.lampe : null;
    const g = groupe(
      lampe === null ? `${gl.mat}|${gl.couleur}` : `${gl.mat}|${gl.couleur}|L${lampe}`,
      lampe === null ? r.code : r.code + 100 * (lampe + 1),
      gl.couleur,
      r.rugosite,
      r.metal,
    );
    const base = g.v.length / PAR_SOMMET;
    for (const x of gl.v) g.v.push(x);
    for (const idx of gl.i) g.i.push(base + idx);
  }
  const out: number[] = [];
  // L'ombre d'abord : elle se pose sur le sol, sous tout le reste.
  const ordre = [...groupes.values()].sort((a, b) => (a.code === CODE_OMBRE ? -1 : b.code === CODE_OMBRE ? 1 : 0));
  for (const g of ordre) {
    const nS = g.v.length / PAR_SOMMET;
    out.push(g.code, g.rgb[0], g.rgb[1], g.rgb[2], g.rug, g.met, nS, g.i.length);
    for (const x of g.v) out.push(x);
    for (const x of g.i) out.push(x);
  }
  return out;
}
