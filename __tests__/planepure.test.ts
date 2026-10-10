/**
 * LE PLAN COTÉ ÉPURÉ — chaque mot se lit sur du blanc.
 *
 * Relevé du patron : « trop d'éléments se chevauchent sur le plan coté ;
 * essaie de faire une technique de placement qui rendrait la chose plus
 * épurée en gardant chaque cote et notes. Par exemple, surface au sol rentre
 * en collision avec la cote de mur. On doit innover pour fournir un plan bien
 * lisible. Les numéros de mur sont mieux, mais il faut les centrer sur la
 * largeur du mur. »
 *
 * Le banc `cotespdfsanschoc` tient déjà que deux MOTS ne se touchent pas. Il
 * ne voyait pas le reste : un trait de cote qui barre « surface au sol »,
 * l'arc d'une porte sous sa largeur, le contour d'un meuble sous son nom.
 * Ce banc-ci relit le PDF COMME UNE IMPRIMANTE : il repeint chaque trait et
 * chaque aplat dans l'ordre du flux — les fonds blancs effacent ce qu'ils
 * couvrent —, puis il mesure l'encre qui reste sous chaque mot.
 *
 * Et il tient la promesse inverse : rien ne s'achète en effaçant. Chaque mur
 * garde sa cote, chaque baie sa largeur, chaque note son mot.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { buildScanPdf, FENETRE_PLAN } from '../src/export/pdf';
import { appartementExemple } from '../src/data/exemple';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import { segLength, type WallSeg } from '../src/geometry/floorplan';

// ------------------------------------------------------------------ lecture

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

/** Le flux de la PREMIÈRE page : le plan d'ensemble coté. */
const pagePlan = (src: string) => {
  const i = src.indexOf('stream\n');
  const j = src.indexOf('\nendstream', i);
  return src.slice(i + 7, j);
};

/** Deux cellules par point : un trait d'un demi-point se voit. */
let RES = 2;
let W = 842 * RES;
let H = 595 * RES;
/** Une résolution plus fine, le temps d'une mesure qui la demande. */
const aLaResolution = <T,>(r: number, f: () => T): T => {
  const avant = RES;
  RES = r;
  W = 842 * RES;
  H = 595 * RES;
  try {
    return f();
  } finally {
    RES = avant;
    W = 842 * RES;
    H = 595 * RES;
  }
};

interface Mot {
  txt: string;
  taille: number;
  blanc: boolean;
  cos: number;
  sin: number;
  x: number;
  y: number;
}

const RE_MOT =
  /BT \/F\d ([\d.-]+) Tf ([\d.-]+) ([\d.-]+) ([\d.-]+) rg ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) Tm \(((?:[^()\\]|\\.)*)\) Tj ET/g;

/**
 * L'IMPRIMANTE DU BANC : traits, aplats, fonds blancs, dans l'ordre du flux.
 * Rend la carte d'encre finale et les mots écrits.
 */
function imprimer(page: string): { encre: Uint8Array; mots: Mot[] } {
  const mots: Mot[] = [];
  let m: RegExpExecArray | null;
  RE_MOT.lastIndex = 0;
  while ((m = RE_MOT.exec(page))) {
    const [r, g, b] = [Number(m[2]), Number(m[3]), Number(m[4])];
    mots.push({
      taille: Number(m[1]),
      blanc: r > 0.97 && g > 0.97 && b > 0.97,
      cos: Number(m[5]),
      sin: Number(m[6]),
      x: Number(m[9]),
      y: Number(m[10]),
      txt: m[11].replace(/\\(.)/g, '$1'),
    });
  }
  const sansTexte = page.replace(/BT [\s\S]*? ET/g, ' ');
  const encre = new Uint8Array(W * H);
  const jetons = sansTexte.split(/\s+/).filter(Boolean);
  let pile: string[] = [];
  let fond = [0, 0, 0];
  let trait = [0, 0, 0];
  let largeur = 1;
  let chemins: { x: number; y: number }[][] = [];
  let courant: { x: number; y: number }[] | null = null;
  const estBlanc = (c: number[]) => c.every((v) => v > 0.97);

  const tracer = (couleur: number[]) => {
    const v = estBlanc(couleur) ? 0 : 1;
    const rr = Math.max(largeur / 2, 0.3) * RES;
    for (const ch of chemins) {
      for (let i = 1; i < ch.length; i++) {
        const a = ch[i - 1];
        const b = ch[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.ceil(L * RES * 2));
        for (let k = 0; k <= n; k++) {
          const cx = (a.x + ((b.x - a.x) * k) / n) * RES;
          const cy = (a.y + ((b.y - a.y) * k) / n) * RES;
          for (let yy = Math.floor(cy - rr); yy <= Math.ceil(cy + rr); yy++) {
            if (yy < 0 || yy >= H) continue;
            for (let xx = Math.floor(cx - rr); xx <= Math.ceil(cx + rr); xx++) {
              if (xx < 0 || xx >= W) continue;
              if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= rr * rr) encre[yy * W + xx] = v;
            }
          }
        }
      }
    }
  };
  const remplir = (couleur: number[]) => {
    const v = estBlanc(couleur) ? 0 : 1;
    const aretes: [number, number, number, number][] = [];
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const ch of chemins) {
      for (let i = 0; i < ch.length; i++) {
        const a = ch[i];
        const b = ch[(i + 1) % ch.length];
        aretes.push([a.x * RES, a.y * RES, b.x * RES, b.y * RES]);
        y0 = Math.min(y0, a.y * RES);
        y1 = Math.max(y1, a.y * RES);
      }
    }
    for (let yy = Math.max(0, Math.floor(y0)); yy <= Math.min(H - 1, Math.ceil(y1)); yy++) {
      const cy = yy + 0.5;
      const xs: number[] = [];
      for (const [ax, ay, bx, by] of aretes) {
        if (ay > cy !== by > cy) xs.push(ax + ((cy - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let xx = Math.max(0, Math.ceil(xs[k] - 0.5)); xx <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); xx++) {
          encre[yy * W + xx] = v;
        }
      }
    }
  };
  const nombres = () => pile.map(Number);
  for (const t of jetons) {
    if (/^[-\d.[\]]/.test(t) && t !== 'd' && !/^[a-zA-Z*]+$/.test(t)) {
      pile.push(t.replace(/[[\]]/g, ''));
      continue;
    }
    const n = nombres();
    switch (t) {
      case 'rg':
        fond = n.slice(-3);
        break;
      case 'RG':
        trait = n.slice(-3);
        break;
      case 'w':
        largeur = n[n.length - 1];
        break;
      case 'm':
        courant = [{ x: n[n.length - 2], y: n[n.length - 1] }];
        chemins.push(courant);
        break;
      case 'l':
        courant?.push({ x: n[n.length - 2], y: n[n.length - 1] });
        break;
      case 're': {
        const [x, y, w, h] = n.slice(-4);
        chemins.push([
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y },
        ]);
        break;
      }
      case 'h':
        if (courant && courant.length > 1) courant.push({ ...courant[0] });
        break;
      case 'S':
        tracer(trait);
        chemins = [];
        break;
      case 's':
        for (const ch of chemins) if (ch.length > 1) ch.push({ ...ch[0] });
        tracer(trait);
        chemins = [];
        break;
      case 'f':
      case 'f*':
        remplir(fond);
        chemins = [];
        break;
      case 'b':
        remplir(fond);
        for (const ch of chemins) if (ch.length > 1) ch.push({ ...ch[0] });
        tracer(trait);
        chemins = [];
        break;
      case 'n':
        chemins = [];
        break;
      default:
        break;
    }
    pile = [];
  }
  return { encre, mots };
}

/** La part d'encre sous un mot — dans le rectangle de ses chiffres, un demi-point en retrait. */
function encreSous(encre: Uint8Array, m: Mot): number {
  const l = m.txt.length * m.taille * 0.5;
  const h = m.taille * 0.72;
  const marge = 0.5;
  const coins = [
    [0, 0],
    [l, 0],
    [l, h],
    [0, h],
  ].map(([u, v]) => ({ x: m.x + u * m.cos - v * m.sin, y: m.y + u * m.sin + v * m.cos }));
  const x0 = Math.floor(Math.min(...coins.map((c) => c.x)) * RES);
  const x1 = Math.ceil(Math.max(...coins.map((c) => c.x)) * RES);
  const y0 = Math.floor(Math.min(...coins.map((c) => c.y)) * RES);
  const y1 = Math.ceil(Math.max(...coins.map((c) => c.y)) * RES);
  let tout = 0;
  let noir = 0;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const px = (xx + 0.5) / RES - m.x;
      const py = (yy + 0.5) / RES - m.y;
      const u = px * m.cos + py * m.sin;
      const v = -px * m.sin + py * m.cos;
      if (u < marge || u > l - marge || v < marge || v > h - marge) continue;
      tout++;
      if (xx >= 0 && xx < W && yy >= 0 && yy < H && encre[yy * W + xx]) noir++;
    }
  }
  return tout === 0 ? 0 : noir / tout;
}

const dansLePlan = (m: Mot) => m.y > FENETRE_PLAN.y && m.y < FENETRE_PLAN.y + FENETRE_PLAN.h;

/** Les mots barrés : plus de cinq pour cent d'encre sous leurs chiffres. */
function barres(page: string): string[] {
  const { encre, mots } = imprimer(page);
  return mots
    .filter((m) => !m.blanc && dansLePlan(m))
    .map((m) => ({ m, part: encreSous(encre, m) }))
    .filter((v) => v.part > 0.05)
    .map((v) => `« ${v.m.txt} » ${Math.round(v.part * 100)} %`);
}

const ecrits = (page: string) => imprimer(page).mots.filter(dansLePlan).map((m) => m.txt);

// ------------------------------------------------------------------ dossiers

const ex = appartementExemple();
const exemple = (zoom = 1) =>
  pagePlan(
    latin1(
      buildScanPdf(
        {
          name: 'Exemple',
          walls: ex.walls,
          openings: ex.openings,
          objects: ex.objects,
          rooms: ex.rooms,
          roomNames: Object.fromEntries(ex.rooms.map((r) => [r.id, r.name])),
          fixtures: [],
          notes: [{ id: 'n1', text: 'Colonne montante ici', at: { x: 4.6, z: 0.4 } }],
        } as never,
        false,
        { metre: false, surfaces: true, plan: { zoom } } as never,
      ),
    ),
  );

/** Le même, sans aucun nom de pièce : le cartouche dit « surface au sol ». */
const exempleSansNoms = () =>
  pagePlan(
    latin1(
      buildScanPdf(
        { name: 'Exemple', walls: ex.walls, openings: ex.openings, objects: ex.objects, rooms: ex.rooms, fixtures: [] } as never,
        false,
        { metre: false, surfaces: true } as never,
      ),
    ),
  );

const NOMS = ['Séjour', 'Chambre', 'Cuisine', 'Salle d’eau', 'Entrée', 'WC'];
const reference = (zoom = 1) =>
  pagePlan(
    latin1(
      buildScanPdf(
        {
          name: 'Reference',
          walls: SNAPSHOT_WALLS,
          openings: SNAPSHOT_OPENINGS,
          objects: SNAPSHOT_OBJECTS,
          rooms: SNAPSHOT_ROOMS as never,
          roomNames: Object.fromEntries(SNAPSHOT_ROOMS.map((r, i) => [r.id, NOMS[i] ?? `Pièce ${i + 1}`])),
          fixtures: SNAPSHOT_FIXTURES,
        } as never,
        false,
        { metre: false, surfaces: true, plan: { zoom } } as never,
      ),
    ),
  );

const frLen = (v: number) => v.toFixed(2).replace('.', ',');

// ------------------------------------------------------------------ épreuves

describe('chaque mot se lit sur du blanc', () => {
  for (const zoom of [1, 1.3]) {
    it(`l’appartement d’exemple, zoom ${zoom}`, () => {
      expect(barres(exemple(zoom))).toEqual([]);
    });
    it(`le plan de référence équipé, zoom ${zoom}`, () => {
      expect(barres(reference(zoom))).toEqual([]);
    });
  }
  it('et « surface au sol » ne se fait plus barrer', () => {
    expect(barres(exempleSansNoms())).toEqual([]);
  });
});

describe('rien ne s’achète en effaçant', () => {
  it('chaque mur garde sa cote', () => {
    const vus = ecrits(exemple());
    const voulus = (ex.walls as WallSeg[]).map((w) => `${frLen(segLength(w))} m`);
    // Chaque longueur autant de fois qu'il y a de murs qui la portent.
    const compte = (l: string[]) => l.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string, number>());
    const manque = [...compte(voulus)].filter(([t, n]) => (compte(vus).get(t) ?? 0) < n);
    expect(manque).toEqual([]);
  });

  it('chaque baie garde sa largeur', () => {
    const vus = ecrits(exemple());
    for (const o of ex.openings as WallSeg[]) expect(vus).toContain(frLen(segLength(o)));
  });

  it('chaque note garde son mot', () => {
    expect(ecrits(exemple())).toContain('Colonne montante ici');
  });
});

describe('le numéro d’un mur se centre dans son épaisseur', () => {
  it('à égale distance des deux faces du poché', () => {
    // Au quart de point : à la grille du demi-point, l'arrondi des deux
    // bords du poché pèse déjà un point.
    aLaResolution(4, () => mesurerLeCentrage());
  });
});

function mesurerLeCentrage() {
  {
    const { encre, mots } = imprimer(exemple());
    const numeros = mots.filter((m) => m.blanc && /^\d+$/.test(m.txt) && dansLePlan(m));
    expect(numeros.length).toBeGreaterThan(8);
    const noir = (x: number, y: number) => {
      const xx = Math.floor(x * RES);
      const yy = Math.floor(y * RES);
      return xx >= 0 && xx < W && yy >= 0 && yy < H && encre[yy * W + xx] === 1;
    };
    const ecarts: string[] = [];
    for (const m of numeros) {
      // Le milieu des chiffres, là où l'œil les lit.
      const cx = m.x + (m.txt.length * m.taille * 0.5) / 2;
      const cy = m.y + (m.taille * 0.72) / 2;
      const jusquauBlanc = (dx: number, dy: number) => {
        let k = 0;
        while (k < 40 && noir(cx + dx * k, cy + dy * k)) k += 0.1;
        return k;
      };
      const haut = jusquauBlanc(0, 1);
      const bas = jusquauBlanc(0, -1);
      const gauche = jusquauBlanc(-1, 0);
      const droite = jusquauBlanc(1, 0);
      // Le travers du mur est l'axe le plus court.
      const [a, b] = haut + bas < gauche + droite ? [haut, bas] : [gauche, droite];
      if (Math.abs(a - b) > 0.6) ecarts.push(`mur ${m.txt} : ${a.toFixed(1)} / ${b.toFixed(1)}`);
    }
    expect(ecarts).toEqual([]);
  }
}

describe('et l’imprimante du banc sait voir un trait sous un mot', () => {
  it('un trait qui barre un mot compte', () => {
    const y = FENETRE_PLAN.y + 100;
    const page =
      `0 0 0 RG 1 w 100 ${y + 3} m 160 ${y + 3} l S ` +
      `BT /F1 8.5 Tf 0 0 0 rg 1 0 0 1 110 ${y} Tm (3,60 m) Tj ET`;
    const vu = barres(page);
    expect(vu).toHaveLength(1);
    expect(vu[0]).toMatch(/^« 3,60 m » \d+ %$/);
  });

  it('un fond blanc posé ensuite efface ce qu’il couvre', () => {
    const y = FENETRE_PLAN.y + 100;
    const page =
      `0 0 0 RG 1 w 100 ${y + 3} m 160 ${y + 3} l S ` +
      `[] 0 d 1 1 1 rg 105 ${y - 2} 50 12 re f ` +
      `BT /F1 8.5 Tf 0 0 0 rg 1 0 0 1 110 ${y} Tm (3,60 m) Tj ET`;
    expect(barres(page)).toEqual([]);
  });
});
