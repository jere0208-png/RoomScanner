/**
 * LA POSE AU SCAN EN 3D — le vrai produit au viseur, à la cote du métier.
 *
 * Relevé du patron : « revois complètement l'interface du scan pour le
 * placement des produits électriques, intègre directement les éléments en
 * 3D, et revois aussi les icônes pour du réaliste ».
 *
 * Ce banc tient ce que le natif reçoit, puisque le natif ne se teste pas
 * ici : chaque produit du rail a sa PHOTO et son MODÈLE, le modèle se plaque
 * au mur sans y entrer (ou pend sous le plafond), et les règles de hauteur
 * envoyées au natif sont celles que l'ancrage du plan appliquera — le
 * fantôme se pose là où le plan posera.
 */
import {
  PRODUITS_DU_SCAN,
  configurationDeLaPose,
  modeleDuScan,
} from '../src/geometry/poseAR';
import { photoDe } from '../src/ui/produits';
import { aimanterHauteur, ancrerElec, apercuDeHauteur } from '../src/geometry/viseur';
import { PAR_SOMMET } from '../src/geometry/modeles3d';
import type { WallSeg } from '../src/geometry/floorplan';

/** Les sommets d'un flux de groupes (format des meubles de la maquette). */
function sommets(flux: number[]) {
  const out: { x: number; y: number; z: number }[] = [];
  let k = 0;
  while (k + 8 <= flux.length) {
    const nS = flux[k + 6];
    const nI = flux[k + 7];
    k += 8;
    for (let i = 0; i < nS; i++) {
      out.push({ x: flux[k + i * PAR_SOMMET], y: flux[k + i * PAR_SOMMET + 1], z: flux[k + i * PAR_SOMMET + 2] });
    }
    k += nS * PAR_SOMMET + nI;
  }
  expect(k).toBe(flux.length);
  return out;
}

describe('le rail : des produits en photo, plus des symboles', () => {
  it.each(PRODUITS_DU_SCAN.map((p) => [p.mot, p] as const))('%s a sa photo', (_m, p) => {
    expect(photoDe(p.photo)).not.toBeNull();
  });

  it('les murs d’abord, puis le plafond', () => {
    const ou = PRODUITS_DU_SCAN.map((p) => p.ou);
    expect(ou.indexOf('plafond')).toBeGreaterThan(0);
    expect(ou.slice(ou.indexOf('plafond')).every((o) => o === 'plafond')).toBe(true);
  });
});

describe('chaque produit part au natif avec son vrai modèle', () => {
  const config = configurationDeLaPose();

  it.each(PRODUITS_DU_SCAN.map((p) => [p.mot, p] as const))('%s', (_m, p) => {
    const pts = sommets(config.modeles[p.kind]);
    expect(pts.length).toBeGreaterThan(40);
    expect(pts.every((q) => [q.x, q.y, q.z].every(Number.isFinite))).toBe(true);
    if (p.ou === 'mur') {
      // Plaqué au nu : rien n'entre dans le mur, rien ne flotte à plus de 12 cm.
      expect(Math.min(...pts.map((q) => q.z))).toBeGreaterThanOrEqual(-1e-4);
      expect(Math.max(...pts.map((q) => q.z))).toBeLessThan(0.12);
      // Centré sur la visée.
      const cx = (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2;
      expect(Math.abs(cx)).toBeLessThan(0.01);
    } else {
      // Pendu sous le plafond, jamais au-dessus.
      expect(Math.max(...pts.map((q) => q.y))).toBeLessThanOrEqual(1e-4);
    }
  });

  it('une prise double est plus large qu’une simple, à la même hauteur', () => {
    const larg = (k: string) => {
      const pts = sommets(modeleDuScan(PRODUITS_DU_SCAN.find((p) => p.kind === k)!));
      return Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
    };
    expect(larg('prise2')).toBeGreaterThan(larg('prise') + 0.06);
  });
});

describe('les règles de hauteur du natif sont celles du plan', () => {
  const config = configurationDeLaPose();
  /** Ce que le natif ferait de cette visée, d'après les règles reçues. */
  const natif = (kind: string, vise: number) => {
    const k = config.auMur[kind] ?? kind;
    const p = config.paliers[k];
    if (p) {
      const h = p.reduce((m, x) => (Math.abs(x - vise) < Math.abs(m - vise) ? x : m), p[0]);
      return Math.abs(h - vise) > config.portee ? vise : h;
    }
    return config.std[k] ?? vise;
  };

  it.each([
    ['prise', 0.19],
    ['prise', 0.9],
    ['prise', 1.95],
    ['prise2', 1.2],
    ['inter', 0.4],
    ['volet', 1.6],
    ['rj45', 0.3],
    ['tv', 1.05],
    ['applique', 1.2],
    ['dcl', 1.5],
  ] as const)('%s visée à %s m', (kind, vise) => {
    const plan = aimanterHauteur((config.auMur[kind] ?? kind) as never, vise).hauteur;
    expect(natif(kind, vise)).toBeCloseTo(plan, 6);
  });

  it('ce qui va au plafond, et ce qui n’y va que là', () => {
    expect(config.plafond).toEqual(expect.arrayContaining(['dcl', 'spot', 'daaf']));
    expect(config.plafondSeul).toEqual(expect.arrayContaining(['spot', 'daaf']));
    // Un point lumineux visé sur un mur y devient une applique.
    expect(config.plafondSeul).not.toContain('dcl');
    expect(config.auMur.dcl).toBe('applique');
  });
});

describe('la phrase du viseur, au présent', () => {
  it('dit le palier et sa cote', () => {
    expect(apercuDeHauteur('prise', 0.19)).toBe('Prise plinthe · 25 cm');
    expect(apercuDeHauteur('prise', 1.0)).toBe('Prise plan de travail · 1,10 m');
    expect(apercuDeHauteur('inter', 0.4)).toBe('Interrupteur · 1,10 m');
    expect(apercuDeHauteur('applique', 1.2)).toBe('Applique murale · 1,90 m');
  });

  it('et ne devine pas au-delà de la portée de l’aimant', () => {
    // Une prise visée à deux mètres : ni plinthe ni crédence.
    expect(apercuDeHauteur('prise', 2)).toBe('Prise 16 A · 2,00 m');
  });
});

describe('un point visé au plafond y va, même près d’un mur', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
  });
  const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)];
  const PIECE = [{ id: 'r', outline: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] }];

  it('le natif le dit, et le plan le croit', () => {
    // À vingt centimètres du mur nord, visé bas dans le repère d'ARKit (dont
    // l'origine est à hauteur de main) : sans le drapeau, une applique.
    const sans = ancrerElec([{ kind: 'dcl', x: 2, y: 0.9, z: 0.2 }], MURS, PIECE);
    expect(sans.fixtures.map((f) => f.kind)).toEqual(['applique']);
    const avec = ancrerElec([{ kind: 'dcl', x: 2, y: 0.9, z: 0.2, plafond: true }], MURS, PIECE);
    expect(avec.ceiling.map((c) => c.kind)).toEqual(['dcl']);
    expect(avec.fixtures).toHaveLength(0);
  });
});
