/**
 * L'APPARTEMENT D'EXEMPLE — ce qu'on montre avant d'avoir relevé quoi que
 * ce soit. Il est la vitrine de l'application : un meuble planté dans un
 * mur, une pièce sans nom ou une fenêtre qui flotte s'y verraient avant tout
 * le reste. Ce banc tient qu'il est propre, comme le serait un vrai relevé.
 */
import { appartementExemple, NOM_EXEMPLE } from '../src/data/exemple';
import { murDeLOuverture, roomParts, totalArea } from '../src/geometry/floorplan';
import { poserLibre } from '../src/geometry/poser';

const ex = appartementExemple();
const parts = roomParts(ex.walls, ex.rooms);

describe('l’appartement d’exemple', () => {
  it('porte un nom qui le distingue d’un vrai plan', () => {
    expect(NOM_EXEMPLE).toBe('Appartement exemple');
  });

  it('a ses cinq pièces, nommées, et ses 48 m²', () => {
    expect(ex.rooms.map((r) => r.name).sort()).toEqual(
      ['Bureau', 'Chambre', 'Entrée', 'Salle d’eau', 'Séjour'].sort(),
    );
    expect(parts.every((p) => p.surface?.exact)).toBe(true);
    expect(Math.round(totalArea(parts)!.area)).toBe(48);
  });

  it('chaque meuble est dans une pièce, et aucun ne mord dans un mur', () => {
    expect(ex.objects.length).toBeGreaterThan(15);
    for (const o of ex.objects) {
      const t = o.transform;
      const yaw = Math.atan2(t[2], t[0]);
      const pose = poserLibre({ x: t[12], z: t[14] }, { width: o.width, depth: o.depth, yaw }, ex.walls);
      expect([o.id, pose.valide]).toEqual([o.id, true]);
      expect([o.id, !!o.roomId]).toEqual([o.id, true]);
    }
  });

  it('chaque menuiserie est posée sur un mur', () => {
    for (const o of ex.openings) {
      expect([o.id, !!murDeLOuverture(o, ex.walls)]).toEqual([o.id, true]);
    }
    // Une porte d'entrée, une pièce de jour éclairée : c'est un logement.
    expect(ex.openings.filter((o) => o.type === 'window').length).toBeGreaterThanOrEqual(4);
    expect(ex.openings.some((o) => o.id === 'porte-entree')).toBe(true);
  });
});
