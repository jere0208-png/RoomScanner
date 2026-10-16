/**
 * LES PETITS ÉCARTS DU MÉTREUR — revue « Nadia », métreuse.
 *
 *   — « Périmètre » annonçait 59,6 m sur l'exemple : la somme des tours de
 *     pièces, chaque cloison comptée une fois par pièce qu'elle borde. Ce
 *     chiffre-là (celui des plinthes et des murs à peindre) se nomme
 *     maintenant pour ce qu'il est : « m tour des pièces ».
 *   — « 3m405 », recopié du laser au millimètre, était refusé.
 *   — Le cellier : l'en-tête le disait hors du logement, le code le
 *     comptait. Un cellier DANS le logement compte (revues « Gérard » et
 *     « Bérénice ») ; un cellier extérieur, une dépendance, non.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireCote, metresCandidats } from '../src/geometry/lecturePlan';
import { surfacesHabitables } from '../src/geometry/habitable';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';

describe('le bandeau des mesures', () => {
  const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
  it('ne dit plus « périmètre » pour la somme des tours de pièces', () => {
    expect(ecran).not.toContain("label: 'm périmètre'");
    // MIS À JOUR — revue des « découvreurs » : le bandeau ne garde que les
    // pièces et les m² habitables ; le tour des pièces vit sur la fiche de
    // pièce (« Périmètre ») et dans la liste d'achats (les plinthes).
    expect(ecran).not.toContain("label: 'm tour des pièces'");
  });
});

describe('la cote au millimètre', () => {
  it('« 3m405 » se lit 3,405 m', () => {
    const lu = lireCote('3m405');
    expect(lu).not.toBeNull();
    expect(lu!.valeur).toBeCloseTo(3.405, 9);
    expect(lu!.unite).toBe('m');
    expect(metresCandidats('3 m 405')[0]).toBeCloseTo(3.405, 9);
  });
  it('sans rien changer aux cotes au centimètre', () => {
    expect(lireCote('3m20')!.valeur).toBeCloseTo(3.2, 9);
    expect(lireCote('3m2')!.valeur).toBeCloseTo(3.2, 9);
    expect(lireCote('3m05')!.valeur).toBeCloseTo(3.05, 9);
    expect(lireCote('3m4050')).toBeNull();
  });
});

describe('le cellier', () => {
  it('compte dans le logement, pas dehors', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id,
      type: 'wall',
      a: { x: ax, z: az },
      b: { x: bx, z: bz },
      height: 2.5,
      yCenter: 1.25,
    });
    const murs = [mur('a', 0, 0, 2, 0), mur('b', 2, 0, 2, 2), mur('c', 2, 2, 0, 2), mur('d', 0, 2, 0, 0)];
    const parts = roomParts(murs, [{ id: 'p', wallIds: ['a', 'b', 'c', 'd'] }]);
    expect(surfacesHabitables([{ id: 'p', name: 'Cellier' }], parts, []).total).toBeCloseTo(4, 6);
    const dehors = surfacesHabitables([{ id: 'p', name: 'Cellier extérieur' }], parts, []);
    expect(dehors.total).toBe(0);
    expect(dehors.pieces[0].raison).not.toBeNull();
  });
});
