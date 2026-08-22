/**
 * CHAQUE GESTE S'ANNULE POUR LUI-MÊME.
 *
 * Trouvé en simulant un utilisateur qui équipe un mur : on pose deux prises
 * l'une après l'autre, on touche « Annuler »… et les DEUX disparaissent. Le
 * pas d'historique avait été fusionné.
 *
 * La fusion existe pour une bonne raison, et il faut la garder : un mur
 * qu'on fait glisser envoie cinquante états par seconde, et sans elle
 * cinquante annulations seraient nécessaires pour revenir en arrière d'un
 * seul geste. Mais elle ne vaut que pour les gestes CONTINUS, ceux qui
 * suivent le doigt.
 *
 * Ces gestes-là se reconnaissent à leur clé : elle désigne l'objet qu'on
 * manipule (`move:mur-3:a`, `moveObject:o1`). Un geste DISCRET — poser une
 * prise, ajouter une pièce, supprimer un mur — porte une clé simple, et ne
 * se fusionne jamais avec le suivant, si rapide soit-il.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockMagasin.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockMagasin.delete(k); }),
}));

import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
  st().commencerAuClavier();
  st().addRoomBox(5, 4, 'Séjour');
});

describe('« Annuler » défait un geste, pas deux', () => {
  it('rend une prise à la fois, même posées coup sur coup', () => {
    const mur = st().walls[0].id;
    st().addFixture('prise', mur, 1.2);
    st().addFixture('prise', mur, 2.4);
    expect(st().fixtures).toHaveLength(2);
    st().undo();
    expect(`${st().fixtures.length} prise(s) après une annulation`).toBe(
      '1 prise(s) après une annulation',
    );
    st().undo();
    expect(st().fixtures).toHaveLength(0);
  });

  it('et vaut pour les pièces posées à la suite', () => {
    st().addRoomBox(3, 3, 'Chambre');
    expect(st().rooms).toHaveLength(2);
    st().undo();
    expect(st().rooms).toHaveLength(1);
  });

  it('mais un mur qu’on FAIT GLISSER reste un seul pas', () => {
    const mur = st().walls[0];
    const piecesAvant = st().rooms.length;
    // Cinquante images de glissement, comme un vrai doigt.
    for (let i = 1; i <= 50; i++) {
      st().moveWallPoint(mur.id, 'a', { x: i * 0.01, z: 0 });
    }
    st().undo();
    // Un seul retour en arrière remet le mur où il était : sans la fusion,
    // il faudrait cinquante annulations pour un geste.
    expect(st().walls[0].a.x).toBeCloseTo(mur.a.x, 3);
    expect(st().rooms).toHaveLength(piecesAvant);
  });
});
