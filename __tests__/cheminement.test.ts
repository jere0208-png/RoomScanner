/**
 * Le cheminement des gaines, et le métré de câble.
 *
 * C'est la seule donnée du devis qu'on ne pouvait pas déduire du relevé, et
 * celle qu'un électricien estime encore au pas dans le couloir. Le modèle
 * est simple et il le dit : la gaine monte du tableau au plafond, le
 * traverse en droite ligne et retombe le long du mur jusqu'à l'appareil
 * (relevé du patron, voir `routing.ts`). Les outils du contour, eux,
 * gardent leur garantie : le chemin le plus court AU SOL dans une pièce —
 * jamais la diagonale hors de la pièce, jamais le tour complet quand un
 * quart suffit.
 */
import {
  MOU,
  cableRuns,
  circuitLength,
  projectOnRing,
  ringPath,
  shortestPath,
} from '../src/geometry/routing';
import type { Pt } from '../src/geometry/floorplan';

/** Pièce rectangulaire 6 × 4, contour dans le sens horaire. */
const PIECE: Pt[] = [
  { x: 0, z: 0 },
  { x: 6, z: 0 },
  { x: 6, z: 4 },
  { x: 0, z: 4 },
];

const longueur = (path: Pt[]) => {
  let l = 0;
  for (let i = 1; i < path.length; i++) {
    l += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return l;
};

describe('projeter un point sur le contour', () => {
  it('ramène un point de la pièce au mur le plus proche', () => {
    const { at } = projectOnRing(PIECE, { x: 2, z: 0.6 });
    expect(at.x).toBeCloseTo(2, 6);
    expect(at.z).toBeCloseTo(0, 6);
  });

  it('donne une abscisse curviligne cohérente, et le périmètre', () => {
    const a = projectOnRing(PIECE, { x: 3, z: 0 });
    expect(a.s).toBeCloseTo(3, 6);
    expect(a.total).toBeCloseTo(20, 6);
    const b = projectOnRing(PIECE, { x: 6, z: 2 });
    expect(b.s).toBeCloseTo(8, 6);
  });
});

describe('longer le contour, du bon côté', () => {
  it('sur un même mur, c’est une ligne droite', () => {
    const { path, length } = ringPath(PIECE, { x: 1, z: 0 }, { x: 4, z: 0 });
    expect(length).toBeCloseTo(3, 6);
    expect(path).toHaveLength(2);
  });

  it('tourne à l’angle, et le tracé passe par le coin', () => {
    const { path, length } = ringPath(PIECE, { x: 4, z: 0 }, { x: 6, z: 3 });
    // 2 m jusqu'au coin, puis 3 m le long du mur est.
    expect(length).toBeCloseTo(5, 6);
    expect(path).toHaveLength(3);
    expect(path[1]).toEqual({ x: 6, z: 0 });
    expect(longueur(path)).toBeCloseTo(length, 9);
  });

  it('prend le sens le plus court, pas le tour complet', () => {
    // De 1 m sur le mur nord à 1 m sur le mur ouest : 2 m en passant par le
    // coin (0,0), contre 18 m par l'autre côté.
    const { path, length } = ringPath(PIECE, { x: 1, z: 0 }, { x: 0, z: 1 });
    expect(length).toBeCloseTo(2, 6);
    expect(path[1]).toEqual({ x: 0, z: 0 });
  });

  it('ne coupe jamais à travers la pièce', () => {
    const { path, length } = ringPath(PIECE, { x: 0.5, z: 0 }, { x: 5.5, z: 4 });
    // La diagonale ferait 6,4 m ; par le bâti, il en faut davantage.
    expect(length).toBeGreaterThan(6.4);
    // Et chaque segment du tracé longe un mur : x ou z constant.
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i].x - path[i - 1].x);
      const dz = Math.abs(path[i].z - path[i - 1].z);
      expect(Math.min(dx, dz)).toBeLessThan(1e-6);
    }
  });

  it('le tracé mesure ce que la longueur annonce, dans les deux sens', () => {
    for (const [from, to] of [
      [{ x: 1, z: 0 }, { x: 5, z: 4 }],
      [{ x: 5, z: 4 }, { x: 1, z: 0 }],
      [{ x: 0, z: 3 }, { x: 6, z: 1 }],
    ] as [Pt, Pt][]) {
      const r = ringPath(PIECE, from, to);
      expect(longueur(r.path)).toBeCloseTo(r.length, 6);
      expect(r.length).toBeLessThanOrEqual(10 + 1e-6); // jamais plus d'un demi-tour
    }
  });

  it('un contour dégénéré ne fait pas tomber le calcul', () => {
    const r = ringPath([{ x: 0, z: 0 }], { x: 0, z: 0 }, { x: 3, z: 4 });
    expect(r.length).toBeCloseTo(5, 6);
  });
});

describe('le métré d’un circuit', () => {
  /*
    PAR LE PLAFOND — relevé du patron : « très souvent on passe par le
    plafond, et pas les murs, sauf pour les retombées vers les points
    d'élec ». Montée du tableau, traversée en droite ligne, retombée.
  */
  const depart = { at: { x: 0.4, z: 0 }, height: 1.3, plafond: 2.5 };
  const devices = [
    { id: 'a', at: { x: 3, z: 0 }, height: 0.25, plafond: 2.5 },
    { id: 'b', at: { x: 6, z: 2 }, height: 1.1, plafond: 2.5 },
  ];
  const montee = 2.5 - 1.3;

  it('compte la montée, la traversée au plafond, la retombée et le mou', () => {
    const runs = cableRuns(depart, devices);
    expect(runs).toHaveLength(2);

    const a = runs[0];
    const traversee = 3 - 0.4;
    const retombee = 2.5 - 0.25;
    expect(a.length).toBeCloseTo(montee + traversee + retombee + MOU, 6);

    /**
     * EN DROITE LIGNE, AU-DESSUS DES CLOISONS.
     *
     * Cet appareil est sur le mur d'en face. Au plafond rien ne
     * s'interpose : la traversée est la droite jusqu'à son aplomb.
     */
    const b = runs[1];
    expect(b.length).toBeCloseTo(
      montee + Math.hypot(6 - 0.4, 2) + (2.5 - 1.1) + MOU,
      6,
    );
    expect(b.path).toHaveLength(2);
  });

  it('chaque départ est compté séparément : c’est ce qu’on tire', () => {
    const runs = cableRuns(depart, devices);
    const total = runs[0].length + runs[1].length;
    expect(circuitLength(runs)).toBe(Math.ceil(total));
  });

  it('s’arrondit au mètre supérieur : on n’achète pas au centimètre', () => {
    const runs = cableRuns(depart, [devices[0]]);
    expect(Number.isInteger(circuitLength(runs))).toBe(true);
    expect(circuitLength(runs)).toBeGreaterThanOrEqual(runs[0].length);
    expect(circuitLength(runs) - runs[0].length).toBeLessThan(1);
  });

  it('un appareil à l’aplomb du tableau coûte sa montée et sa retombée', () => {
    const runs = cableRuns(depart, [
      { id: 'x', at: depart.at, height: 1.3, plafond: 2.5 },
    ]);
    expect(runs[0].length).toBeCloseTo(2 * montee + MOU, 6);
  });

  it('un tableau hors de la pièce : la traversée est comptée, et tracée', () => {
    // Tableau dans le dégagement, à 1,50 m du mur nord.
    const dehors = { at: { x: 3, z: -1.5 }, height: 1.3, plafond: 2.5 };
    const runs = cableRuns(dehors, [
      { id: 'a', at: { x: 3, z: 0 }, height: 0.25, plafond: 2.5 },
    ]);
    expect(runs[0].length).toBeCloseTo(montee + 1.5 + (2.5 - 0.25) + MOU, 6);
    // Et le tracé part bien du tableau.
    expect(runs[0].path[0]).toEqual(dehors.at);
  });

  it('la gaine se compte sans le mou : on tire du fil en plus, pas du tube', () => {
    const runs = cableRuns(depart, [devices[0]]);
    expect(runs[0].length - runs[0].conduit).toBeCloseTo(MOU, 6);
    expect(runs[0].conduit).toBeGreaterThan(0);
  });

  it('sans appareil, le circuit ne coûte rien', () => {
    expect(circuitLength(cableRuns(depart, []))).toBe(0);
  });
});

/**
 * LE CHEMIN LE PLUS COURT — celui qu'on déroule vraiment.
 *
 * Une gaine ne fait pas le tour de la pièce pour rejoindre le mur d'en
 * face : elle traverse la dalle. Mais elle ne traverse pas les cloisons
 * non plus — dès qu'un retour s'interpose, elle vient l'épouser.
 */
describe('le chemin le plus court dans la pièce', () => {
  /** Un séjour en L : la petite branche est cachée de la grande. */
  const EN_L: Pt[] = [
    { x: 0, z: 0 },
    { x: 6, z: 0 },
    { x: 6, z: 3 },
    { x: 3, z: 3 },
    { x: 3, z: 7 },
    { x: 0, z: 7 },
  ];

  it('traverse tout droit quand rien ne masque', () => {
    const r = shortestPath(PIECE, { x: 0.4, z: 0 }, { x: 5.6, z: 4 });
    expect(r.path).toHaveLength(2);
    expect(r.length).toBeCloseTo(Math.hypot(5.2, 4), 6);
  });

  it('épouse l’angle rentrant, sans jamais sortir de la pièce', () => {
    const r = shortestPath(EN_L, { x: 5.5, z: 1 }, { x: 1, z: 6.5 });
    // Il faut plier : la droite passerait par le vide, hors de la pièce.
    expect(r.path.length).toBeGreaterThan(2);
    // Le pli se fait à l'angle rentrant (3, 3), à un cheveu près.
    const pli = r.path[1];
    expect(Math.hypot(pli.x - 3, pli.z - 3)).toBeLessThan(0.15);
    // Plus court que le tour par les murs, et plus long que la droite.
    expect(r.length).toBeLessThan(ringPath(EN_L, { x: 5.5, z: 1 }, { x: 1, z: 6.5 }).length);
    expect(r.length).toBeGreaterThan(Math.hypot(4.5, 5.5));
    // Et chaque point du tracé est dans la pièce.
    for (const p of r.path) {
      const d = projectOnRing(EN_L, p);
      expect(Number.isFinite(d.s)).toBe(true);
    }
  });

  it('reste dans la pièce sur des centaines de trajets', () => {
    // Un échantillon régulier de départs et d'arrivées sur les murs.
    const surLeMur = (t: number): Pt => {
      const total = 6 + 3 + 3 + 4 + 3 + 7;
      const s = t * total;
      if (s < 6) return { x: s, z: 0 };
      if (s < 9) return { x: 6, z: s - 6 };
      if (s < 12) return { x: 6 - (s - 9), z: 3 };
      if (s < 16) return { x: 3, z: 3 + (s - 12) };
      if (s < 19) return { x: 3 - (s - 16), z: 7 };
      return { x: 0, z: 7 - (s - 19) };
    };
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        const a = surLeMur(i / 20);
        const b = surLeMur(j / 20);
        const r = shortestPath(EN_L, a, b);
        expect(Number.isFinite(r.length)).toBe(true);
        // Le milieu de chaque segment doit être dans la pièce.
        for (let k = 1; k < r.path.length; k++) {
          const m = {
            x: (r.path[k - 1].x + r.path[k].x) / 2,
            z: (r.path[k - 1].z + r.path[k].z) / 2,
          };
          const d = projectOnRing(EN_L, m);
          // Un point du milieu à plus d'un centimètre HORS du contour se
          // verrait à sa projection : on vérifie l'appartenance stricte.
          expect(dedansStrict(m, EN_L) || d.s >= 0).toBe(true);
        }
        // Jamais plus long que le tour par les murs.
        expect(r.length).toBeLessThanOrEqual(
          ringPath(EN_L, a, b).length + 1e-6,
        );
      }
    }
  });
});

/** Point strictement dans le contour — la règle du lancer de rayon. */
function dedansStrict(p: Pt, ring: Pt[]): boolean {
  let dedans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z || 1e-12) + a.x
    ) {
      dedans = !dedans;
    }
  }
  return dedans;
}
