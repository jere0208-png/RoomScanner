/**
 * LA LIGNE DE SPOTS — ce qu'on attend d'une pose en série.
 *
 * Le défaut relevé sur le chantier tenait en une phrase : « ça ne sépare
 * pas la petite partie, et un spot est collé au mur ». Les deux venaient
 * du même raccourci — la pièce était traitée comme son rectangle
 * englobant, la ligne le traversait de bout en bout, et le point qui
 * tombait dans le vide était rabattu contre la cloison la plus proche.
 *
 * Ce fichier fixe les trois règles du métier :
 *   — aucun spot ne se pose à moins de vingt centimètres d'un mur ;
 *   — un retour de pièce reçoit SES spots, pas ceux d'à côté ;
 *   — la ligne se tend sur la longueur ou sur la largeur, au choix.
 */
import { roomZones, spreadPoints } from '../src/geometry/ceiling';
import type { Pt } from '../src/geometry/floorplan';
import { pointInPolygon } from '../src/geometry/appearance';

/** Le séjour de la capture : un grand rectangle et son retour, en bas. */
const EN_L: Pt[] = [
  { x: 0, z: 0 },
  { x: 3.2, z: 0 },
  { x: 3.2, z: 4.6 },
  { x: 2.2, z: 5.4 },
  { x: 2.2, z: 6.0 },
  { x: 1.4, z: 6.0 },
  { x: 1.4, z: 7.2 },
  { x: 0, z: 7.2 },
];

const RECT: Pt[] = [
  { x: 0, z: 0 },
  { x: 6, z: 0 },
  { x: 6, z: 3.4 },
  { x: 0, z: 3.4 },
];

/** Distance d'un point au bord du contour. */
function auMur(p: Pt, ring: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    d = Math.min(d, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return d;
}

describe('la pose d’une ligne de spots', () => {
  it('ne colle jamais un spot au mur, dans aucune pièce', () => {
    for (const ring of [EN_L, RECT]) {
      for (const n of [2, 3, 4, 5, 6, 8]) {
        for (const axe of ['longueur', 'largeur'] as const) {
          const pts = spreadPoints(ring, n, 0, axe);
          expect(pts).toHaveLength(n);
          for (const p of pts) {
            expect(pointInPolygon(p, ring)).toBe(true);
            expect(`${n} ${axe} : ${auMur(p, ring).toFixed(2)} m du mur`).toBe(
              `${n} ${axe} : ${Math.max(auMur(p, ring), 0.2).toFixed(2)} m du mur`,
            );
          }
        }
      }
    }
  });

  /**
   * LE RETOUR EST UNE PIÈCE À PART ENTIÈRE.
   *
   * Il fait un sixième de la surface : sur quatre spots, il lui en revient
   * un. Avant, il n'en recevait aucun qui lui appartienne — seulement le
   * dernier d'une ligne venue du séjour, échoué contre sa cloison.
   */
  it('donne au retour d’une pièce en L ses propres spots', () => {
    const zones = roomZones(EN_L, 0, 3);
    expect(zones.length).toBeGreaterThanOrEqual(2);
    const pts = spreadPoints(EN_L, 4, 0, 'longueur');
    // Le retour, c'est tout ce qui est au-delà de z = 5 m.
    const bas = pts.filter((p) => p.z > 5);
    expect(`${bas.length} spot(s) dans le retour`).toBe('1 spot(s) dans le retour');
    // Et il est centré chez lui, pas rabattu sur un bord.
    expect(auMur(bas[0], EN_L)).toBeGreaterThan(0.3);
  });

  /**
   * L'AXE SE CHOISIT — c'est l'électricien qui sait.
   *
   * Une cuisine s'éclaire en travers, un couloir en long. Sur la
   * longueur, les spots s'écartent le long du grand côté ; sur la
   * largeur, le long du petit.
   */
  it('tend la ligne sur l’axe demandé', () => {
    const etendue = (pts: Pt[], cle: 'x' | 'z') =>
      Math.max(...pts.map((p) => p[cle])) - Math.min(...pts.map((p) => p[cle]));
    const long = spreadPoints(RECT, 4, 0, 'longueur');
    const large = spreadPoints(RECT, 4, 0, 'largeur');
    // La pièce fait 6 × 3,4 : la longueur, c'est X.
    expect(etendue(long, 'x')).toBeGreaterThan(etendue(long, 'z'));
    expect(etendue(large, 'z')).toBeGreaterThan(etendue(large, 'x'));
  });

  /** Une pièce relevée de biais donne la même ligne, tournée. */
  it('suit la trame du logement, pas le repère du scan', () => {
    const a = (37 * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const biais = RECT.map((p) => ({
      x: p.x * cos - p.z * sin,
      z: p.x * sin + p.z * cos,
    }));
    const droit = spreadPoints(RECT, 4, 0, 'longueur');
    const tourne = spreadPoints(biais, 4, a, 'longueur');
    expect(tourne).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const attendu = {
        x: droit[i].x * cos - droit[i].z * sin,
        z: droit[i].x * sin + droit[i].z * cos,
      };
      expect(Math.hypot(tourne[i].x - attendu.x, tourne[i].z - attendu.z)).toBeLessThan(
        0.2,
      );
    }
  });

  /** Un placard minuscule ne se découpe pas : une ligne, et c'est tout. */
  it('ne s’effondre pas sur une pièce trop petite pour des zones', () => {
    const placard: Pt[] = [
      { x: 0, z: 0 },
      { x: 0.9, z: 0 },
      { x: 0.9, z: 1.2 },
      { x: 0, z: 1.2 },
    ];
    const pts = spreadPoints(placard, 2, 0, 'longueur');
    expect(pts).toHaveLength(2);
    for (const p of pts) expect(pointInPolygon(p, placard)).toBe(true);
  });
});
