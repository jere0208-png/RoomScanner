/**
 * TIRER UNE PIECE AU DOIGT.
 *
 * Releve du patron : « a la selection d'une piece a ajouter, elle se place
 * automatiquement et impossible de creer des murs pour faire la piece
 * facilement. Il faut repenser un systeme complet facile pour
 * l'utilisateur ».
 *
 * L'application posait la piece TOUTE SEULE : elle cherchait le mur
 * exterieur le plus long, s'accolait dessus, et prenait sa longueur. Le
 * resultat est une piece qu'on n'a pas choisie, a un endroit qu'on n'a pas
 * vise, aux cotes qu'on n'a pas demandees — « Chambre 3 x 3 » sortant en
 * 5 x 3 parce que le mur d'appui faisait cinq metres.
 *
 * LE GESTE RETENU (choix du patron) : on pose un doigt, on glisse, on lache.
 * Deux coins suffisent a decrire un rectangle, et un rectangle decrit
 * presque toutes les pieces d'un logement. Pour un L, on en tire deux et on
 * les fusionne — ce que l'application sait deja faire.
 *
 * ET LA CLOISON RESTE PARTAGEE (choix du patron) : un cote du rectangle qui
 * tombe sur un mur existant ne le double pas, il le REPREND. Une seule
 * maconnerie entre deux pieces, cotee une fois, equipee des deux cotes.
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
import { roomExtent, roomParts } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

const cotes = (roomId: string) => {
  const p = roomParts(st().walls, st().rooms).find((x) => x.roomId === roomId)!;
  return roomExtent(p.surface!.pts);
};

beforeEach(() => {
  mockMagasin.clear();
  st().reset();
  st().commencerAuClavier();
});

describe('tirer une piece au doigt', () => {
  it('la fait aux cotes qu’on a tirees, la ou on l’a tiree', () => {
    const id = st().addRoomRect({ x: 1, z: 1 }, { x: 5.2, z: 4 }, 'Sejour')!;
    expect(id).toBeTruthy();
    const c = cotes(id);
    expect(c.width).toBeCloseTo(4.2, 2);
    expect(c.depth).toBeCloseTo(3, 2);
    // Et elle est LA ou on l'a mise, pas accolee ailleurs.
    const xs = st().walls.flatMap((w) => [w.a.x, w.b.x]);
    expect(Math.min(...xs)).toBeCloseTo(1, 2);
  });

  it('refuse un rectangle trop petit pour etre une piece', () => {
    // Un appui sans glissement : ce n'est pas une piece, c'est un doigt
    // pose. On ne cree rien plutot qu'un placard de six centimetres.
    expect(st().addRoomRect({ x: 1, z: 1 }, { x: 1.05, z: 1.05 }, '')).toBeNull();
    expect(st().rooms).toHaveLength(0);
  });

  it('reprend le mur existant sur lequel elle s’appuie', () => {
    /*
      UNE SEULE MACONNERIE ENTRE DEUX PIECES.

      La seconde piece est tiree JUSTE CONTRE la premiere : son cote gauche
      tombe sur le mur droit de la premiere. Ce mur ne se double pas — il
      figure dans les listes des deux pieces, et le plan ne compte que sept
      murs pour deux pieces.
    */
    const a = st().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Sejour')!;
    const b = st().addRoomRect({ x: 4, z: 0 }, { x: 7, z: 3 }, 'Cuisine')!;
    expect(st().walls).toHaveLength(7);
    const pa = st().rooms.find((r) => r.id === a)!;
    const pb = st().rooms.find((r) => r.id === b)!;
    const commun = (pa.wallIds ?? []).filter((w) =>
      (pb.wallIds ?? []).includes(w),
    );
    expect(commun).toHaveLength(1);
  });

  it('mais ne reprend rien quand elle est posee au large', () => {
    st().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Sejour');
    st().addRoomRect({ x: 8, z: 8 }, { x: 11, z: 11 }, 'Atelier');
    expect(st().walls).toHaveLength(8);
  });

  it('s’annule d’un seul geste', () => {
    st().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Sejour');
    st().undo();
    expect(st().rooms).toHaveLength(0);
    expect(st().walls).toHaveLength(0);
  });

  it('accepte qu’on tire dans n’importe quel sens', () => {
    // Du coin bas-droit vers le haut-gauche : c'est le meme rectangle.
    const id = st().addRoomRect({ x: 5, z: 4 }, { x: 1, z: 1 }, 'Sejour')!;
    const c = cotes(id);
    expect(c.width).toBeCloseTo(4, 2);
    expect(c.depth).toBeCloseTo(3, 2);
  });
});
