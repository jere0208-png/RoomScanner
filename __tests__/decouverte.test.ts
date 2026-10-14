/**
 * SIX PERSONNES DÉCOUVRENT L'APP — ce que « Hugo », étudiant qui touche à
 * tout, a cassé : un plan rouvert sur un étage vide, « Annuler » qui laisse
 * la vue sur un niveau vidé, des emoji imprimés « ? ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import { act } from 'react-test-renderer';
import type { WallSeg } from '../src/geometry/floorplan';
import { niveauApresRetour, niveauDeDepart, useScanStore } from '../src/store/scanStore';
import { buildScanPdf } from '../src/export/pdf';

const mur = (id: string, niveau: number, ax = 0, az = 0, bx = 4, bz = 0): WallSeg =>
  ({ id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, ...(niveau ? { niveau } : {}) }) as WallSeg;

describe('le niveau où s’ouvre un plan', () => {
  it('le rez-de-chaussée s’il a des murs, sinon le plus bas', () => {
    expect(niveauDeDepart([mur('a', 0), mur('b', 1)])).toBe(0);
    expect(niveauDeDepart([mur('a', 1), mur('b', 2)])).toBe(1);
    expect(niveauDeDepart([])).toBe(0);
  });

  it('un plan rouvert juste après avoir regardé l’étage d’un autre s’ouvre sur ses murs', () => {
    const st = () => useScanStore.getState();
    act(() => {
      useScanStore.setState({
        niveauCourant: 1,
        saves: [{ id: 's1', name: 'Studio', createdAt: 1, updatedAt: 1, modelPath: null, rooms: [], walls: [mur('a', 0), mur('b', 0, 4, 0, 4, 3)], openings: [], objects: [] }],
      } as never);
      st().openSave('s1');
    });
    expect(st().niveauCourant).toBe(0);
  });
});

describe('après « Annuler », on voit ce qui a changé', () => {
  it('l’étage annulé ne laisse pas la vue sur un niveau vide', () => {
    const rdc = [mur('a', 0)];
    const avecEtage = [...rdc, mur('e', 1)];
    expect(niveauApresRetour(avecEtage, rdc, 1)).toBe(0);
  });
  it('une retouche de l’étage annulée depuis le rez-de-chaussée montre l’étage', () => {
    const rdc = mur('a', 0);
    const avant = mur('e', 1);
    const apres = { ...avant, height: 2.4 };
    expect(niveauApresRetour([rdc, apres], [rdc, avant], 0)).toBe(1);
  });
});

describe('le dossier et les emoji', () => {
  it('« 🏠 Coloc des Lilas ✨ » s’imprime « Coloc des Lilas », sans « ? »', () => {
    const walls = [mur('n', 0, 0, 0, 4, 0), mur('e', 0, 4, 0, 4, 3), mur('s', 0, 4, 3, 0, 3), mur('o', 0, 0, 3, 0, 0)];
    const txt = Buffer.from(
      buildScanPdf({ name: '🏠 Coloc des Lilas ✨', walls, openings: [], objects: [], rooms: [{ id: 'r', wallIds: ['n', 'e', 's', 'o'] }], roomNames: { r: '🛏️ Chambre de Hugo' } } as never, false, {}),
    ).toString('latin1');
    expect(txt).toContain('(Coloc des Lilas)');
    expect(txt).not.toMatch(/\(\?+ ?Coloc|Lilas \?\)/);
  });
});

import { meubleDansLaPiece } from '../src/geometry/floorplan';
describe('le meuble rentre-t-il dans sa pièce ? (revue « Chloé »)', () => {
  const sejour = [{ x: 0, z: 0 }, { x: 5.5, z: 0 }, { x: 5.5, z: 4 }, { x: 0, z: 4 }];
  const canape = (w: number) => ({ width: w, depth: 1.8, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.75, 0.4, 2, 1] });
  it('un canapé d’angle de 2,80 m dans un séjour de 5,50 : il rentre, et l’on dit la place qui reste', () => {
    const v = meubleDansLaPiece(canape(2.8), [sejour])!;
    expect(v.dedans).toBe(true);
    expect(v.reste).toBeCloseTo(1.1, 2);
  });
  it('élargi à 6,00 m, il dépasse de 25 cm', () => {
    const v = meubleDansLaPiece(canape(6), [sejour])!;
    expect(v.dedans).toBe(false);
    expect(v.depasse).toBeCloseTo(0.25, 2);
  });
});

import { astuce, useAstuce } from '../src/ui/astuce';
describe('« Annuler » passe devant (revue « Paul »)', () => {
  it('le bandeau d’annulation se montre tout de suite, et s’oublie hors du plan', () => {
    act(() => useAstuce.setState({ courante: null, file: [] }));
    astuce('2 min 31 s · −5 % de batterie');
    astuce('Mur retiré.', { action: { label: 'Annuler', faire: () => {} } });
    expect(useAstuce.getState().courante?.texte).toBe('Mur retiré.');
    useAstuce.getState().oublierLesAnnulations();
    expect(useAstuce.getState().courante?.texte).toBe('2 min 31 s · −5 % de batterie');
  });
});
