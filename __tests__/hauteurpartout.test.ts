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
import type { Fixture } from '../src/geometry/electrical';
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

/**
 * CE QUI EST ACCROCHE AU MUR DESCEND AVEC LUI — pour une PIECE aussi.
 *
 * Le reglage mur par mur le faisait depuis longtemps, et il disait pourquoi :
 * « abaisser un mur sans rien d'autre laisse une prise flottant DANS le
 * plafond et une porte qui depasse du toit. Ni l'une ni l'autre ne se voit
 * sur le plan 2D — on ne s'en apercoit qu'en elevation, ou au metre, c'est-a-
 * dire trop tard. »
 *
 * Le reglage par PIECE, lui, ne le faisait pas : il posait la hauteur sur les
 * murs et s'arretait la. Abaisser une piece de 2,50 a 2,00 — un sous-sol, un
 * comble amenage, un plafond mal vu par RoomPlan — laissait donc toutes les
 * prises hautes et les portes entieres dans un logement qui ne les contenait
 * plus. Trouve en relisant les deux actions cote a cote, apres avoir ajoute
 * « la meme hauteur partout », qui heritait du meme silence.
 */
const PRISE_HAUTE: Fixture = {
  id: 'f1',
  kind: 'prise',
  wallId: 'a1',
  along: 0.5,
  height: 2.2,
  side: 1,
};

const PORTE: WallSeg = {
  id: 'o1',
  type: 'door',
  roomId: 'r1',
  a: { x: 0.5, z: 0 },
  b: { x: 1.33, z: 0 },
  height: 2.04,
  yCenter: 1.02,
};

const meubler = () =>
  useScanStore.setState({ fixtures: [PRISE_HAUTE], openings: [{ ...PORTE }] });

const prise = () => useScanStore.getState().fixtures[0];
const porte = () => useScanStore.getState().openings[0];

describe('abaisser une piece', () => {
  beforeEach(meubler);

  it('fait redescendre la prise sous le nouveau plafond', () => {
    st().setRoomHeight('r1', 2);
    // Le demi-appareil compte : c'est son AXE qu'on range, pas son bord.
    expect(prise().height).toBeLessThanOrEqual(2 - 0.04 + 1e-6);
    expect(prise().height).toBeGreaterThan(0);
  });

  it('rabote la porte qui depasserait du toit', () => {
    st().setRoomHeight('r1', 1.8);
    expect(porte().yCenter + porte().height / 2).toBeLessThanOrEqual(1.8 + 1e-6);
  });

  /*
    LE CONTROLE EN SENS INVERSE : une action qui rabaisserait tout a chaque
    passage passerait les deux epreuves ci-dessus.
  */
  it('mais ne touche a rien quand le plafond MONTE', () => {
    st().setRoomHeight('r1', 2.8);
    expect(prise().height).toBeCloseTo(2.2, 3);
    expect(porte().height).toBeCloseTo(2.04, 3);
  });

  it('et laisse tranquille ce qui tient deja sous le plafond', () => {
    st().setRoomHeight('r1', 2.5);
    expect(prise().height).toBeCloseTo(2.2, 3);
    expect(porte().height).toBeCloseTo(2.04, 3);
  });

  it('s’annule d’un seul geste, appareillage compris', () => {
    st().setRoomHeight('r1', 2);
    st().undo();
    expect(prise().height).toBeCloseTo(2.2, 3);
    expect(porte().height).toBeCloseTo(2.04, 3);
  });
});

describe('abaisser tout le logement', () => {
  beforeEach(meubler);

  it('emporte l’appareillage et les menuiseries, comme une piece', () => {
    st().setAllRoomHeights(2);
    expect(prise().height).toBeLessThanOrEqual(2 - 0.04 + 1e-6);
    expect(porte().yCenter + porte().height / 2).toBeLessThanOrEqual(2 + 1e-6);
  });

  it('mais ne les bouge pas quand le plafond monte', () => {
    st().setAllRoomHeights(2.8);
    expect(prise().height).toBeCloseTo(2.2, 3);
    expect(porte().height).toBeCloseTo(2.04, 3);
  });
});
