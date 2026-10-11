/**
 * LA BAIE VITRÉE N'EST PAS UNE PORTE.
 *
 * Relevé du patron : « ma baie vitrée a été détectée comme une porte, et à
 * l'ouverture du plan elle est rouge car dans son ouverture se trouve le
 * canapé ». RoomPlan range souvent une baie coulissante parmi les portes : le
 * plan lui dessinait alors un vantail de 2,40 m — un quart de cercle qui
 * balaie la moitié du séjour, et déclare « gêné » tout ce qu'il touche.
 *
 * Une « porte » de 1,60 m et plus, percée dans un mur de façade, est une
 * baie : elle devient une fenêtre (une porte-fenêtre qui descend au sol),
 * sans battant. Une porte intérieure, si large soit-elle, reste une porte.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baiesVitrees, type WallSeg } from '../src/geometry/floorplan';
import { battantsDesPortes } from '../src/geometry/passage';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
/** Deux pièces : un séjour (0..5) et une chambre (5..8), un refend en x = 5. */
const MURS = [
  mur('n1', 0, 0, 5, 0),
  mur('ref', 5, 0, 5, 4),
  mur('s1', 5, 4, 0, 4),
  mur('o1', 0, 4, 0, 0),
  mur('n2', 5, 0, 8, 0),
  mur('e2', 8, 0, 8, 4),
  mur('s2', 8, 4, 5, 4),
];
const porte = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  ...mur(id, ax, az, bx, bz),
  type: 'door',
  height: 2.15,
  yCenter: 1.075,
});

describe('une large « porte » en façade est une baie', () => {
  it('la baie de 2,40 m du séjour devient une fenêtre qui descend au sol', () => {
    const [baie] = baiesVitrees([porte('baie', 1.2, 0, 3.6, 0)], MURS);
    expect(baie.type).toBe('window');
    expect(baie.yCenter - baie.height / 2).toBeCloseTo(0, 6);
    // Plus de vantail : rien ne balaie le séjour.
    expect(battantsDesPortes([baie], MURS)).toHaveLength(0);
  });

  it('une porte ordinaire reste une porte', () => {
    const [p] = baiesVitrees([porte('p', 0, 1, 0, 1.9)], MURS);
    expect(p.type).toBe('door');
  });

  it('une large porte intérieure, entre deux pièces, reste une porte', () => {
    const [p] = baiesVitrees([porte('double', 5, 1, 5, 2.8)], MURS);
    expect(p.type).toBe('door');
  });

  it('sans pièce refermée, seule une très large porte passe pour une baie', () => {
    const seul = [mur('n', 0, 0, 5, 0)];
    expect(baiesVitrees([porte('b', 1, 0, 3, 0)], seul)[0].type).toBe('window');
    expect(baiesVitrees([porte('b', 1, 0, 2.65, 0)], seul)[0].type).toBe('door');
  });

  it('la fin du scan et l’ouverture d’un plan rangent les baies', () => {
    const store = readFileSync(join(__dirname, '..', 'src/store/scanStore.ts'), 'utf8');
    expect(store.match(/baiesVitrees\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
