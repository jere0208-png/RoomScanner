/**
 * REDIMENSIONNER UNE PIÈCE À SES COTES.
 *
 * On pose un « Séjour 5,00 × 4,00 » depuis le catalogue, puis le mètre
 * donne 5,18 × 4,05. Il fallait alors déplacer QUATRE murs à la main, un
 * par un, en veillant à ne pas ouvrir les coins — pour une correction de
 * dix-huit centimètres. Le bandeau de la pièce affichait pourtant ses
 * cotes, juste à côté d'une hauteur, elle, éditable d'un appui.
 *
 * Le geste n'a de sens que sur une pièce RECTANGULAIRE : redimensionner un
 * contour en L à « largeur × profondeur » n'a pas de réponse unique, et
 * l'application n'en invente pas. Sur les autres, il ne s'offre pas.
 *
 * LE COIN DE RÉFÉRENCE NE BOUGE PAS. En gardant le coin haut-gauche, la
 * pièce grandit vers la droite et vers le bas : ce qu'on voit à l'écran ne
 * saute pas, et les pièces voisines restent où elles sont.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockMagasin.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockMagasin.delete(k); }),
}));

import { useScanStore } from '../src/store/scanStore';
import { roomExtent, roomParts } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const cotes = (id: string) => {
  const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === id)!;
  return roomExtent(part.surface!.pts);
};

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
  st().commencerAuClavier();
});

describe('redimensionner une pièce', () => {
  it('pose les cotes demandées', () => {
    const id = st().addRoomBox(5, 4, 'Séjour')!;
    st().resizeRoom(id, 5.18, 4.05);
    const e = cotes(id);
    expect(`${e.width.toFixed(2)} × ${e.depth.toFixed(2)}`).toBe('5.18 × 4.05');
  });

  it('garde le coin de référence, pour que rien ne saute à l’écran', () => {
    const id = st().addRoomBox(5, 4, 'Séjour')!;
    const avant = st().walls.filter((w) => w.roomId === id);
    const x0 = Math.min(...avant.flatMap((w) => [w.a.x, w.b.x]));
    const z0 = Math.min(...avant.flatMap((w) => [w.a.z, w.b.z]));
    st().resizeRoom(id, 7, 6);
    const apres = st().walls.filter((w) => w.roomId === id);
    expect(Math.min(...apres.flatMap((w) => [w.a.x, w.b.x]))).toBeCloseTo(x0, 3);
    expect(Math.min(...apres.flatMap((w) => [w.a.z, w.b.z]))).toBeCloseTo(z0, 3);
  });

  it('emmène l’appareillage avec son mur', () => {
    const id = st().addRoomBox(5, 4, 'Séjour')!;
    const mur = st().walls.find((w) => w.roomId === id)!;
    st().addFixture('prise', mur.id, 1.2);
    // La pose recale déjà l'appareil selon sa largeur : on part de LÀ.
    const posee = st().fixtures[0].along;
    st().resizeRoom(id, 6, 4);
    // La prise reste sur SON mur, à sa cote : on agrandit la pièce, on ne
    // déplace pas ce qui y est posé.
    const f = st().fixtures[0];
    expect(f.wallId).toBe(mur.id);
    expect(f.along).toBeCloseTo(posee, 3);
  });

  it('ramène dans le mur ce qu’un rétrécissement mettrait dehors', () => {
    const id = st().addRoomBox(5, 4, 'Séjour')!;
    const mur = st().walls.find((w) => w.roomId === id)!;
    st().addFixture('prise', mur.id, 4.5);
    st().resizeRoom(id, 2, 4);
    // Le mur ne fait plus que deux mètres : une prise à 4,50 m flotterait
    // dans le vide, et le contrôle la compterait quand même.
    const f = st().fixtures[0];
    expect(f.along).toBeLessThanOrEqual(2);
    expect(f.along).toBeGreaterThan(0);
  });

  it('refuse les cotes absurdes', () => {
    const id = st().addRoomBox(5, 4, 'Séjour')!;
    st().resizeRoom(id, 0, 4);
    expect(cotes(id).width).toBeCloseTo(5, 2);
    st().resizeRoom(id, 999, 4);
    // La même borne que pour un mur : au-delà, c'est une faute de frappe.
    expect(cotes(id).width).toBeLessThanOrEqual(60);
  });

  it('et s’annule d’un seul geste', () => {
    const id = st().addRoomBox(5, 4, 'Séjour')!;
    st().resizeRoom(id, 7, 6);
    st().undo();
    expect(cotes(id).width).toBeCloseTo(5, 2);
  });
});
