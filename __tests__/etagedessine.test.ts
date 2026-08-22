/**
 * CE QU'ON DESSINE À L'ÉTAGE RESTE À L'ÉTAGE.
 *
 * Trouvé en simulant un utilisateur qui relève une maison : on scanne le
 * rez-de-chaussée, on monte d'un niveau, et l'on ajoute une chambre à la
 * main — parce qu'on n'a pas de LiDAR, ou parce qu'il est plus rapide de la
 * poser à ses cotes. Elle arrivait au REZ-DE-CHAUSSÉE, superposée au
 * séjour : deux pièces au même endroit, un métré faux, et une surface au
 * sol qui double sans raison.
 *
 * L'étage est porté par chaque mur et chaque pièce (`niveau`), et seul le
 * scan d'un étage le posait. Tout ce qui se dessine à la main l'ignorait —
 * or c'est précisément le chemin de ceux qui n'ont pas de caméra.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockMagasin.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockMagasin.delete(k); }),
}));

import { useScanStore } from '../src/store/scanStore';
import { niveauDe } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
  st().commencerAuClavier();
  st().addRoomBox(5, 4, 'Séjour');
});

describe('une pièce dessinée à l’étage', () => {
  it('porte le niveau où on l’a posée', () => {
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
    expect(`Chambre au niveau ${niveauDe(chambre)}`).toBe('Chambre au niveau 1');
    // Ses murs aussi : c'est eux que le plan filtre pour n'afficher qu'un
    // niveau à la fois.
    const murs = st().walls.filter((w) => w.roomId === chambre.id);
    expect(murs.length).toBeGreaterThan(0);
    for (const m of murs) expect(niveauDe(m)).toBe(1);
  });

  it('et laisse le rez-de-chaussée où il est', () => {
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const sejour = st().rooms.find((r) => r.name === 'Séjour')!;
    expect(niveauDe(sejour)).toBe(0);
    // Un niveau, un jeu de murs : rien ne se superpose.
    const parNiveau = st().walls.reduce(
      (m, w) => ({ ...m, [niveauDe(w)]: (m[niveauDe(w)] ?? 0) + 1 }),
      {} as Record<number, number>,
    );
    expect(Object.keys(parNiveau).sort()).toEqual(['0', '1']);
  });

  it('vaut aussi pour un mur tracé seul', () => {
    st().allerAuNiveau(2);
    st().addWallBetween({ x: 0, z: 0 }, { x: 3, z: 0 });
    const neuf = st().walls[st().walls.length - 1];
    expect(niveauDe(neuf)).toBe(2);
  });
});
