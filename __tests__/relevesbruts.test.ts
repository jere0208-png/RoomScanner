/**
 * LES RELEVÉS BRUTS — gardés à chaque fin de scan, dix au plus, envoyables.
 */
const mockMemoire = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMemoire.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => void mockMemoire.set(k, v)),
  removeItem: jest.fn(async (k: string) => void mockMemoire.delete(k)),
}));
import { fichierDuReleveBrut, garderLeReleveBrut, lesRelevesBruts, phraseDuReleveBrut } from '../src/ui/relevesBruts';

const releve = (murs: number) =>
  ({
    modelPath: '',
    surfaces: [
      ...Array.from({ length: murs }, (_, i) => ({ id: `w${i}`, type: 'wall' })),
      { id: 'd', type: 'door' },
    ],
    objects: [{ id: 'o' }],
    trajet: [0, 0, 1, 1],
  }) as never;

describe('relevés bruts', () => {
  beforeEach(() => mockMemoire.clear());

  it('garde le résultat natif tel quel, et le rend en fichier', async () => {
    const r = await garderLeReleveBrut(releve(4), 'scan', new Date(2026, 9, 14, 18, 5).getTime());
    expect(r).toMatchObject({ murs: 4, ouvertures: 1, meubles: 1, mode: 'scan' });
    const f = await fichierDuReleveBrut(r!);
    expect(f!.nom).toBe('releve-brut-2026-10-14-18h05.json');
    const j = JSON.parse(f!.contenu);
    expect(j.format).toBe('echoplan-releve-brut');
    expect(j.releve.trajet).toEqual([0, 0, 1, 1]);
    expect(phraseDuReleveBrut(r!)).toBe('14/10 · 18 h 05 · 4 murs, 1 ouverture, 1 meuble');
  });

  it('dix au plus, le plus récent d’abord', async () => {
    for (let i = 0; i < 12; i++) await garderLeReleveBrut(releve(i + 1), 'scan', 1000 + i);
    const l = await lesRelevesBruts();
    expect(l).toHaveLength(10);
    expect(l[0].quand).toBe(1011);
    // Les deux plus anciens ont disparu du stockage.
    expect(mockMemoire.has('releve-brut:1000')).toBe(false);
    expect(mockMemoire.has('releve-brut:1002')).toBe(true);
  });
});
