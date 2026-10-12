/**
 * TOURNÉE N°4 — LES MEUBLES ET LES FICHIERS.
 *
 * - « Bernard » : le four et la plaque se cognaient ; le four partait 52 cm
 *   en avant.
 * - « Yasmine » : le canapé d'angle n'avait ni gauche ni droite, et le plan
 *   le dessinait droit.
 * - « Claire » : le ruban LED n'existait jamais en DXF, et l'appareillage
 *   s'y écrivait « inter », « prise2 », « rjPrise ».
 * - « Sébastien » : les deux niveaux d'une maison sortaient en tableur sous
 *   le même nom de fichier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogItem } from '../src/geometry/catalogue';
import { furnitureStrokes, meridienneDe } from '../src/geometry/furniture';
import { buildDxf } from '../src/export/dxf';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

describe('le four sous plaque', () => {
  it('est un meuble entier, de 0 à 0,90 m', () => {
    const item = catalogItem('fourEtPlaque')!;
    expect(item.label).toBe('Four sous plaque');
    expect(item.category).toBe('stove');
    expect(item.h).toBeCloseTo(0.9, 9);
    expect(item.base ?? 0).toBe(0);
  });
});

describe('le canapé d’angle', () => {
  it('a sa méridienne à droite par défaut, et se bascule', () => {
    expect(meridienneDe({ modele: 'canapeAngle' })).toBe('droite');
    expect(meridienneDe({ modele: 'canape3' })).toBeNull();
    const st = useScanStore.getState();
    st.reset();
    st.commencerAuClavier();
    st.addRoomLibre(5, 4, 'Séjour', { auNu: true });
    const id = useScanStore.getState().addObject(catalogItem('canapeAngle')!, 2.5, 2);
    useScanStore.getState().setMeridienne(id, 'gauche');
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(meridienneDe(o)).toBe('gauche');
    expect(o.attributes).toEqual(expect.arrayContaining(['SofaType:lShaped', 'SofaAngle:gauche']));
    useScanStore.getState().undo();
    expect(meridienneDe(useScanStore.getState().objects.find((x) => x.id === id)!)).toBe('droite');
  });

  it('se dessine en L, la méridienne du côté choisi', () => {
    const droit = furnitureStrokes('sofa', 2.6, 1.6);
    const aDroite = furnitureStrokes('sofa', 2.6, 1.6, 'droite');
    const aGauche = furnitureStrokes('sofa', 2.6, 1.6, 'gauche');
    expect(aDroite).not.toEqual(droit);
    // La méridienne descend jusqu'au bord avant (y = −0,8 m), du côté choisi.
    const avant = (traits: { x: number; y: number }[][]) =>
      traits.flat().filter((p) => Math.abs(p.y + 0.8) < 1e-9).map((p) => p.x);
    expect(Math.min(...avant(aDroite))).toBeGreaterThan(0);
    expect(Math.max(...avant(aGauche))).toBeLessThan(0);
  });
});

describe('le DXF', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
  });
  const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

  it('porte le plafond et le ruban LED sur leur calque, et l’appareillage en toutes lettres', () => {
    const dxf = buildDxf({
      walls: MURS,
      openings: [],
      rooms: [{ id: 'r', name: 'Séjour', wallIds: ['n', 'e', 's', 'o'] }],
      fixtures: [{ id: 'p', kind: 'prise3', wallId: 'n', along: 1 }],
      ceiling: [
        { id: 'd', kind: 'dcl', at: { x: 2, z: 1.5 } },
        { id: 'l', kind: 'led', at: { x: 0.2, z: 0.2 }, trace: [{ x: 0.2, z: 0.2 }, { x: 3.8, z: 0.2 }], ferme: false },
      ],
    });
    expect(dxf).toContain('ECHOPLAN-ECLAIRAGE');
    expect(dxf).toContain('LED 3,60 m');
    expect(dxf).toContain('Prise triple');
    expect(dxf).not.toMatch(/\nprise3\r?\n/);
  });
});

describe('le tableur d’une maison à étages', () => {
  it('dit son niveau dans le nom du fichier', () => {
    const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    expect(ecran).toContain('metreFilename(niveaux.length > 1 ? `${scanName} — ${nomDuNiveau(niveauCourant)}` : scanName)');
  });
});
