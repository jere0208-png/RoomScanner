/**
 * NORMES AUTO — l'installation qui se pose toute seule.
 *
 * Relevé du chantier : « construis l'ensemble du scan avec des prises, RJ,
 * etc. pour que tout soit aux normes ; place tout hors des meubles ; complète
 * l'existant ; et si tout est aux normes, dis-le ».
 *
 * Ce banc vérifie les quatre promesses, pas le nombre exact de socles — celui
 * -là vient de `requirementFor`, qui a son propre banc.
 */
import { poserAuxNormes, placesLibres } from '../src/geometry/auto';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
const MURS = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
];
const LIT = {
  width: 1.6, depth: 2, height: 0.6,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.2, 0.3, 1.2, 1],
};
const CHAMBRE = {
  id: 'r1', name: 'Chambre', kind: 'bedroom' as const, area: 12,
  wallIds: ['n', 'e', 's', 'o'], interieur: { x: 2, z: 1.5 },
};
const id = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

describe('normes auto', () => {
  it('équipe une pièce nue : socles, RJ45, commande et point lumineux', () => {
    const pose = poserAuxNormes({
      rooms: [CHAMBRE], walls: MURS, openings: [], objects: [LIT],
      fixtures: [], ceiling: [], placement: new Map(), id,
    });
    expect(pose.conforme).toBe(false);
    const kinds = pose.fixtures.map((f) => f.kind);
    expect(kinds.filter((k) => k === 'prise').length).toBeGreaterThanOrEqual(3);
    expect(kinds).toContain('rj45');
    expect(kinds).toContain('inter');
    expect(pose.ceiling).toHaveLength(1);
    // Le rapport nomme la pièce : un outil muet ne se réutilise pas.
    expect(pose.rapport.join(' ')).toContain('Chambre');
  });

  it('ne pose rien derrière un meuble', () => {
    const pose = poserAuxNormes({
      rooms: [CHAMBRE], walls: MURS, openings: [], objects: [LIT],
      fixtures: [], ceiling: [], placement: new Map(), id,
    });
    // Le mur ouest va de (0,3) vers (0,0) : son abscisse court donc en sens
    // inverse de z. Le lit s'étend de z = 0,2 à z = 2,2, soit de 0,8 à 2,8
    // sur ce mur-là — c'est cette ombre-là qui doit rester vide.
    for (const f of pose.fixtures) {
      if (f.wallId !== 'o') continue;
      const dansLeLit = f.along > 0.75 && f.along < 2.85;
      expect(`${f.kind} @ ${f.along.toFixed(2)} ${dansLeLit ? 'DERRIÈRE' : 'libre'}`)
        .toContain('libre');
    }
  });

  it('complète l’existant au lieu de tout refaire', () => {
    const dejaLa: Fixture[] = Array.from({ length: 3 }, (_, i) => ({
      id: `p${i}`, kind: 'prise' as const, wallId: 'n',
      along: 0.6 + i * 0.9, height: 0.25, side: 1,
    }));
    const placement = new Map(dejaLa.map((f) => [f.id, 'r1']));
    const pose = poserAuxNormes({
      rooms: [CHAMBRE], walls: MURS, openings: [], objects: [],
      fixtures: dejaLa, ceiling: [], placement, id,
    });
    // Trois socles suffisent à une chambre : il n'en repose aucun.
    expect(pose.fixtures.filter((f) => f.kind === 'prise')).toHaveLength(0);
    // ...mais il manque encore la RJ45, la commande et le point lumineux.
    expect(pose.fixtures.map((f) => f.kind)).toContain('rj45');
  });

  it('se tait quand tout est déjà aux normes', () => {
    const complet: Fixture[] = [
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `p${i}`, kind: 'prise' as const, wallId: 'n',
        along: 0.6 + i * 0.9, height: 0.25, side: 1 as const,
      })),
      { id: 'rj', kind: 'rj45', wallId: 'e', along: 1, height: 0.25, side: 1 },
      { id: 'it', kind: 'inter', wallId: 's', along: 1, height: 1.1, side: 1 },
    ];
    const pose = poserAuxNormes({
      rooms: [CHAMBRE], walls: MURS, openings: [], objects: [],
      fixtures: complet, ceiling: [{ id: 'd1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 } }],
      placement: new Map(complet.map((f) => [f.id, 'r1'])), id,
    });
    expect(pose.conforme).toBe(true);
    expect(pose.rapport).toHaveLength(0);
  });

  it('laisse les menuiseries tranquilles', () => {
    const porte = {
      id: 'porte', type: 'door', a: { x: 1.2, z: 0 }, b: { x: 2.1, z: 0 },
      height: 2.05, yCenter: 1.025,
    } as WallSeg;
    const places = placesLibres(MURS, [porte], [], [], { x: 2, z: 1.5 });
    const nord = places.find((p) => p.wall.id === 'n')!;
    for (const [a, b] of nord.libres) {
      // Aucun intervalle libre ne chevauche le passage.
      expect(`${a.toFixed(2)}–${b.toFixed(2)}`).toBe(
        a < 1.1 && b <= 1.15 ? `${a.toFixed(2)}–${b.toFixed(2)}` : `${a.toFixed(2)}–${b.toFixed(2)}`,
      );
      expect(a > 2.15 || b < 1.15).toBe(true);
    }
  });
});
