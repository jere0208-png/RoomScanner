/**
 * UN LOGEMENT N'A QU'UNE HAUTEUR SOUS PLAFOND.
 *
 * Releve du patron : « optimise des choses qui pourraient prendre plus en
 * facilite et moins de temps ».
 *
 * La hauteur se reglait PIECE PAR PIECE. Sur un T4 — sejour, cuisine, trois
 * chambres, salle de bain, WC, degagement — c'est huit fois le meme geste :
 * choisir la piece, ouvrir son bandeau, saisir 2,50, valider. Or un plancher
 * est coule d'un seul tenant : dans un logement, la hauteur est la MEME
 * partout, sauf accident — et l'accident (retombee de poutre, sous-pente,
 * muret) a deja son reglage a lui, mur par mur.
 *
 * On garde donc le reglage par piece, qui reste juste, et on ajoute ce qui
 * manquait : la meme hauteur PARTOUT, en un geste.
 *
 * CE QUI N'EST PAS UNE PIECE SUIT AUSSI. Un recoin technique, un placard
 * sous escalier, un mur qu'aucune piece ne revendique : les laisser a leur
 * ancienne hauteur produirait un logement a deux plafonds, visible en 3D et
 * faux au metre. La hauteur d'un logement est celle de TOUS ses murs.
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

import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

const mur = (id: string, h: number, roomId?: string): WallSeg => ({
  id,
  type: 'wall',
  a: { x: 0, z: 0 },
  b: { x: 3, z: 0 },
  height: h,
  yCenter: h / 2,
  roomId,
});

/** Deux pieces a des hauteurs differentes, et un mur qui n'est a personne. */
const poser = () =>
  useScanStore.setState({
    walls: [
      mur('a1', 2.5, 'r1'),
      mur('a2', 2.5, 'r1'),
      mur('b1', 2.2, 'r2'),
      mur('orphelin', 2.2),
    ],
    rooms: [
      { id: 'r1', name: 'Séjour', floor: null },
      { id: 'r2', name: 'Cuisine', floor: null },
    ],
    openings: [],
  });

const hauteurs = () => st().walls.map((w) => w.height);

beforeEach(() => {
  mockMagasin.clear();
  poser();
  // Les pieces portent leurs murs : c'est ce que `setRoomHeight` lit.
  useScanStore.setState({
    rooms: [
      { id: 'r1', name: 'Séjour', floor: null, wallIds: ['a1', 'a2'] },
      { id: 'r2', name: 'Cuisine', floor: null, wallIds: ['b1'] },
    ],
  });
});

describe('la hauteur de tout le logement', () => {
  it('se pose d’un seul geste, sur toutes les pieces', () => {
    st().setAllRoomHeights(2.7);
    expect(hauteurs()).toEqual([2.7, 2.7, 2.7, 2.7]);
  });

  it('emporte les murs qu’aucune piece ne revendique', () => {
    st().setAllRoomHeights(2.7);
    expect(st().walls.find((w) => w.id === 'orphelin')!.height).toBeCloseTo(2.7, 3);
  });

  it('repose le sol : le plafond monte, le plancher ne bouge pas', () => {
    st().setAllRoomHeights(2.7);
    for (const w of st().walls) {
      expect(w.yCenter - w.height / 2).toBeCloseTo(0, 3);
    }
  });

  it('s’annule d’un seul geste, comme un reglage unique', () => {
    st().setAllRoomHeights(2.7);
    st().undo();
    expect(hauteurs()).toEqual([2.5, 2.5, 2.2, 2.2]);
  });

  /*
    LES MEMES GARDE-FOUS QUE LE REGLAGE PAR PIECE : sous le metre ce n'est
    plus une piece, au-dela de six on a tape a cote.
  */
  it('refuse ce qui n’est pas une hauteur de logement', () => {
    st().setAllRoomHeights(0.5);
    expect(hauteurs()).toEqual([2.5, 2.5, 2.2, 2.2]);
    st().setAllRoomHeights(9);
    expect(hauteurs()).toEqual([2.5, 2.5, 2.2, 2.2]);
  });

  it('ne touche a rien quand tout est deja a la bonne cote', () => {
    // Un pas d'historique pour rien, c'est une annulation qui ne defait
    // rien — et l'electricien croit son geste perdu.
    useScanStore.setState({
      walls: st().walls.map((w) => ({ ...w, height: 2.5, yCenter: 1.25 })),
    });
    const avant = st().walls;
    st().setAllRoomHeights(2.5);
    expect(st().walls).toBe(avant);
  });
});
