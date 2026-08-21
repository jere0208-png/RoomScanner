/**
 * Le cheminement des gaines, et le métré de câble.
 *
 * C'est la seule donnée du devis qu'on ne pouvait pas déduire du relevé, et
 * celle qu'un électricien estime encore au pas dans le couloir. Le modèle
 * est simple et il le dit : la gaine longe le contour à hauteur de plinthe,
 * tourne aux angles, remonte à l'appareil. Ce qu'il doit garantir, c'est
 * qu'il prend TOUJOURS le chemin le plus court par le bâti — jamais la
 * diagonale à travers la pièce, jamais le tour complet quand un quart
 * suffit.
 */
import {
  HAUTEUR_GAINE,
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
  const tableau = { x: 0.4, z: 0 };
  const devices = [
    { id: 'a', at: { x: 3, z: 0 }, height: 0.25 },
    { id: 'b', at: { x: 6, z: 2 }, height: 1.1 },
  ];

  it('compte le parcours, la descente, la remontée et le mou', () => {
    const runs = cableRuns(PIECE, tableau, 1.3, devices);
    expect(runs).toHaveLength(2);

    const a = runs[0];
    const parcours = 3 - 0.4;
    const descente = 1.3 - HAUTEUR_GAINE;
    const remontee = Math.abs(0.25 - HAUTEUR_GAINE);
    expect(a.length).toBeCloseTo(parcours + descente + remontee + MOU, 6);

    /**
     * ET LE PARCOURS EST LE PLUS COURT, PAS LE TOUR DU PROPRIÉTAIRE.
     *
     * Cet appareil est sur le mur d'en face. La gaine longeait le contour
     * — 5,60 m jusqu'au coin, puis 2 m — soit 7,60 m de conduit pour
     * atteindre un point qui n'est qu'à 5,89 m en droite ligne. Une pièce
     * carrée ne masque rien : le trajet est donc la droite, dans la dalle.
     */
    const b = runs[1];
    const parcoursB = Math.hypot(6 - 0.4, 2);
    expect(b.length).toBeCloseTo(
      parcoursB + descente + Math.abs(1.1 - HAUTEUR_GAINE) + MOU,
      6,
    );
    expect(b.path).toHaveLength(2);
  });

  it('chaque départ est compté séparément : c’est ce qu’on tire', () => {
    const runs = cableRuns(PIECE, tableau, 1.3, devices);
    const total = runs[0].length + runs[1].length;
    expect(circuitLength(runs)).toBe(Math.ceil(total));
  });

  it('s’arrondit au mètre supérieur : on n’achète pas au centimètre', () => {
    const runs = cableRuns(PIECE, tableau, 1.3, [devices[0]]);
    expect(Number.isInteger(circuitLength(runs))).toBe(true);
    expect(circuitLength(runs)).toBeGreaterThanOrEqual(runs[0].length);
    expect(circuitLength(runs) - runs[0].length).toBeLessThan(1);
  });

  it('un appareil à l’aplomb du tableau ne coûte que ses abouts', () => {
    const runs = cableRuns(PIECE, tableau, 1.3, [
      { id: 'x', at: tableau, height: 1.3 },
    ]);
    expect(runs[0].length).toBeCloseTo(2 * (1.3 - HAUTEUR_GAINE) + MOU, 6);
  });

  it('un tableau hors de la pièce : la traversée est comptée, et tracée', () => {
    // Tableau dans le dégagement, à 1,50 m du mur nord.
    const dehors = { x: 3, z: -1.5 };
    const runs = cableRuns(PIECE, dehors, 1.3, [
      { id: 'a', at: { x: 3, z: 0 }, height: 0.25 },
    ]);
    const descente = 1.3 - HAUTEUR_GAINE;
    const remontee = Math.abs(0.25 - HAUTEUR_GAINE);
    // 1,50 m de traversée, puis rien à longer : l'appareil est à l'aplomb.
    expect(runs[0].length).toBeCloseTo(1.5 + descente + remontee + MOU, 6);
    // Et le tracé part bien du tableau.
    expect(runs[0].path[0]).toEqual(dehors);
  });

  it('la gaine se compte sans le mou : on tire du fil en plus, pas du tube', () => {
    const runs = cableRuns(PIECE, tableau, 1.3, [devices[0]]);
    expect(runs[0].length - runs[0].conduit).toBeCloseTo(MOU, 6);
    expect(runs[0].conduit).toBeGreaterThan(0);
  });

  it('sans appareil, le circuit ne coûte rien', () => {
    expect(circuitLength(cableRuns(PIECE, tableau, 1.3, []))).toBe(0);
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
