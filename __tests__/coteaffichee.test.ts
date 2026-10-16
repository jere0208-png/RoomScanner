/**
 * LA COTE TAPÉE SE LIT SUR LA COTE AFFICHÉE — revue « Nadia », métreuse.
 *
 * Le champ « Longueur du mur » se pré-remplit de la cote du plan
 * (`longueurCotee`) : intérieure sur un mur dessiné, et aussi sur un mur
 * scanné dont la pièce se compte au nu. Mais l'écart axe/intérieur n'était
 * repris que pour un mur dessiné : sur un mur scanné, la valeur tapée
 * s'appliquait à l'axe — sept centimètres d'erreur. Et le champ ne disait
 * pas sur quoi il se lisait.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { WALL_T, longueurCotee, roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const proche = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
const cote = (id: string) => {
  const murs = st().walls;
  return longueurCotee(murs, murs.find((w) => w.id === id)!, roomParts(murs, st().rooms));
};

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  // Un plan scanné : deux pièces, un refend relevé de ses deux faces (posé
  // à son axe) en x = 4 — la façade se cote de son nu.
  useScanStore.setState({
    walls: [
      mur('n1', 0, 0, 4, 0),
      mur('n2', 4, 0, 7, 0),
      mur('e', 7, 0, 7, 4),
      mur('s2', 7, 4, 4, 4),
      mur('s1', 4, 4, 0, 4),
      mur('o', 0, 4, 0, 0),
      { ...mur('c', 4, 0, 4, 4), deuxFaces: true },
    ],
    rooms: [
      { id: 'gauche', name: 'Séjour', wallIds: ['n1', 'c', 's1', 'o'] },
      { id: 'droite', name: 'Chambre', wallIds: ['n2', 'e', 's2', 'c'] },
    ] as never,
    openings: [],
  });
});

describe('sur un mur scanné', () => {
  it('le champ montre la cote intérieure', () => {
    proche(cote('n1'), 4 - WALL_T / 2);
  });

  it('3,50 tapé donne 3,50 à l’intérieur, pas à l’axe', () => {
    st().setWallLength('n1', 3.5, { auNu: false });
    proche(cote('n1'), 3.5);
    proche(segLength(st().walls.find((w) => w.id === 'n1')!), 3.5 + WALL_T / 2);
  });

  it('le laser aussi, avec la même référence', () => {
    st().setWallLength('n1', 3.812, { auNu: false });
    proche(cote('n1'), 3.812);
  });

  it('sans référence d’écran, la longueur reste à l’axe (les appels internes)', () => {
    st().setWallLength('n1', 3.5);
    proche(segLength(st().walls.find((w) => w.id === 'n1')!), 3.5);
  });
});

describe('le champ dit sur quoi il se lit', () => {
  const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
  it('« intérieure » ou « à l’axe » dans le sous-titre', () => {
    expect(ecran).toContain('Cote intérieure, de nu à nu.');
    expect(ecran).toContain('Cote à l’axe du mur.');
    expect(ecran).toMatch(/subtitle: interieure\s*\?/);
  });
  it('et la saisie se lit sur la valeur proposée', () => {
    expect(ecran).toMatch(/value: cote\.toFixed\(2\)/);
    expect(ecran).toMatch(/setWallLength\(wallId, v, \{ auNu \}\)/);
  });
});
