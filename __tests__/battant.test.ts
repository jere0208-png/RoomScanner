/**
 * LE SENS D'OUVERTURE D'UNE PORTE SE CORRIGE.
 *
 * Le plan dessine le quart de cercle du battant, et il le DEVINE :
 * `pivotsDesBattants` range les portes dos a dos pour qu'aucune paire
 * d'arcs ne se croise, et le vantail s'ouvre vers l'interieur de la piece.
 * C'est une bonne supposition, et elle est fausse une fois sur deux — une
 * porte reelle pivote du cote que le menuisier a choisi, pas du cote qui
 * arrange le dessin.
 *
 * POUR UN ELECTRICIEN, CE N'EST PAS UN DETAIL DE DESSIN. L'interrupteur se
 * pose du cote de la POIGNEE, jamais du cote des paumelles : une porte
 * dessinee a l'envers, et le dossier envoie percer derriere le battant. La
 * NF C 15-100 le dit autrement — la commande doit etre atteignable en
 * entrant — mais c'est la meme paume sur le meme mur.
 *
 * DEUX GESTES, PAS UN. Le bord du pivot (gauche ou droite) et la piece vers
 * laquelle le vantail s'ouvre sont deux questions independantes : un bouton
 * unique faisant le tour des quatre combinaisons obligerait a appuyer trois
 * fois pour revenir a la bonne.
 *
 * ET LE CHOIX DE LA MAIN TIENT. Une porte reglee a la main ne se fait plus
 * ranger par la mise en place automatique au premier rendu suivant : sans
 * ca, la correction dure jusqu'au prochain deplacement du plan.
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
import { pivotsDesBattants, type WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

const PORTE: WallSeg = {
  id: 'o1',
  type: 'door',
  a: { x: 2.05, z: 0 },
  b: { x: 2.95, z: 0 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
};

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ walls: [], openings: [{ ...PORTE }] });
});

describe('le sens d’ouverture d’une porte', () => {
  it('se retourne bord sur bord', () => {
    st().flipBattant('o1', 'pivot');
    expect(st().openings[0].pivot).toBe('b');
    st().flipBattant('o1', 'pivot');
    expect(st().openings[0].pivot).toBe('a');
  });

  it('et change de piece', () => {
    st().flipBattant('o1', 'sens');
    expect(st().openings[0].versExterieur).toBe(true);
    st().flipBattant('o1', 'sens');
    expect(st().openings[0].versExterieur).toBe(false);
  });

  it('ne se laisse plus ranger par la mise en place automatique', () => {
    /*
      Deux portes qui se genent : la mise en place les met dos a dos et
      choisirait 'b' pour la seconde. Un choix pose a la main passe avant —
      sinon la correction dure jusqu'au prochain rendu.
    */
    const portes = [
      { id: 'p1', a: { x: 0, z: 0 }, b: { x: 0.9, z: 0 } },
      { id: 'p2', a: { x: 1.0, z: 0 }, b: { x: 1.9, z: 0 }, pivot: 'b' as const },
    ];
    expect(pivotsDesBattants(portes).get('p2')).toBe('b');
    const force = [
      portes[0],
      { ...portes[1], pivot: 'a' as const },
    ];
    expect(pivotsDesBattants(force).get('p2')).toBe('a');
  });

  it('ne s’applique qu’aux portes', () => {
    // Une fenetre n'a pas de battant dessine : le geste n'a rien a
    // retourner, et un reglage invisible est un reglage qu'on croit rate.
    useScanStore.setState({ openings: [{ ...PORTE, type: 'window' }] });
    st().flipBattant('o1', 'pivot');
    expect(st().openings[0].pivot).toBeUndefined();
  });

  it('s’annule d’un seul geste', () => {
    st().flipBattant('o1', 'pivot');
    st().undo();
    expect(st().openings[0].pivot).toBeUndefined();
  });
});
