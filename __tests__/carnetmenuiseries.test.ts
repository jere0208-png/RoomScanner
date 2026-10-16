/**
 * LE CARNET DES MENUISERIES — inspiré des plans « MEX » du dossier
 * d'architecte fourni par le patron : chaque baie repérée, avec son type,
 * sa largeur × hauteur et son allège. Ce qu'on envoie au menuisier.
 */
import { carnetDesMenuiseries, typeDeMenuiserie } from '../src/geometry/menuiseries';
import { appartementExemple } from '../src/data/exemple';
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';

const ex = appartementExemple();
const noms = Object.fromEntries(ex.rooms.map((r) => [r.id, r.name]));
const carnet = carnetDesMenuiseries(ex.walls as WallSeg[], ex.openings as WallSeg[], ex.rooms, noms);

it('chaque baie de l’exemple a sa ligne, repérée P, F ou B', () => {
  expect(carnet).toHaveLength(ex.openings.length);
  expect(carnet.filter((l) => l.repere.startsWith('P'))).toHaveLength(4);
  expect(carnet.filter((l) => l.repere.startsWith('F'))).toHaveLength(5);
  expect(carnet.filter((l) => l.repere.startsWith('B'))).toHaveLength(1);
  expect(new Set(carnet.map((l) => l.repere)).size).toBe(carnet.length);
});

it('la porte-fenêtre n’a pas d’allège, la fenêtre du séjour l’a', () => {
  const pf = carnet.find((l) => l.type === 'Porte-fenêtre')!;
  expect(pf.allege).toBeNull();
  expect(pf.hauteur).toBeCloseTo(2.15, 2);
  const f = carnet.find((l) => l.type === 'Fenêtre' && Math.abs(l.largeur - 1.4) < 0.01)!;
  expect(f.allege).toBeCloseTo(0.95, 2);
});

it('une porte entre deux pièces les nomme toutes les deux', () => {
  const porteChambre = carnet.find((l) => l.type === 'Porte' && l.pieces.includes('Chambre'))!;
  expect(porteChambre.pieces).toContain(' / ');
});

it('la porte palière se dit porte d’entrée', () => {
  expect(carnet.filter((l) => l.type === 'Porte d’entrée')).toHaveLength(1);
});

it('les types se disent comme sur un carnet', () => {
  const base = { id: 'o', a: { x: 0, z: 0 }, b: { x: 1, z: 0 }, height: 2, yCenter: 1 } as WallSeg;
  expect(typeDeMenuiserie({ ...base, type: 'door', garage: true })).toBe('Porte de garage');
  expect(typeDeMenuiserie({ ...base, type: 'door', vantaux: 2 })).toBe('Porte double');
  expect(typeDeMenuiserie({ ...base, type: 'opening' })).toBe('Passage libre');
});

it('le dossier avec métré porte la feuille des menuiseries', () => {
  const b = buildScanPdf(
    { name: 'Exemple', walls: ex.walls, openings: ex.openings, objects: [], rooms: ex.rooms, roomNames: noms, fixtures: [] } as never,
    false,
    { metre: true, surfaces: true } as never,
  );
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  expect(s).toContain('(Menuiseries)');
  expect(s).toContain('(F1)');
});
