/**
 * DUPLIQUER UNE PIÈCE — avec tout ce qu'on vient d'y poser.
 *
 * Un logement a trois chambres qui se ressemblent, deux WC, des combles
 * découpés en cellules identiques. On les relevait une par une, et surtout
 * on les ÉQUIPAIT une par une : cinq socles, un interrupteur, un point
 * lumineux, à chaque fois, aux mêmes cotes. L'application savait dupliquer
 * un plan entier (`duplicateSave`) mais pas une pièce.
 *
 * Le gain n'est pas la géométrie — quatre murs se retracent vite. C'est
 * L'APPAREILLAGE : c'est lui qui prend le temps, et c'est lui que la copie
 * doit emporter, avec les ouvertures, le mobilier et les points de plafond.
 * Une chambre dupliquée est une chambre finie.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockMagasin.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockMagasin.delete(k); }),
}));

import { useScanStore } from '../src/store/scanStore';
import { niveauDe, roomParts } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

/** Une chambre équipée : porte, deux prises, un point de plafond. */
const chambreEquipee = () => {
  useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
  st().commencerAuClavier();
  const id = st().addRoomBox(4, 3, 'Chambre');
  const mur = st().walls.find((w) => w.roomId === id)!;
  st().addOpening(mur.id);
  st().addFixture('prise', mur.id, 0.8);
  st().addFixture('inter', mur.id, 2.2);
  st().addCeiling('dcl', id, { x: 2, z: 1.5 });
  return id;
};

describe('dupliquer une pièce', () => {
  it('emporte les murs, les ouvertures, l’appareillage et le plafond', () => {
    const source = chambreEquipee();
    const avant = {
      murs: st().walls.length,
      baies: st().openings.length,
      appareils: st().fixtures.length,
      plafond: st().ceiling.length,
    };
    const copie = st().duplicateRoom(source)!;
    expect(copie).toBeTruthy();
    expect(copie).not.toBe(source);
    // Tout est là en double : c'est l'appareillage qui fait le gain.
    expect({
      murs: st().walls.length,
      baies: st().openings.length,
      appareils: st().fixtures.length,
      plafond: st().ceiling.length,
    }).toEqual({
      murs: avant.murs * 2,
      baies: avant.baies * 2,
      appareils: avant.appareils * 2,
      plafond: avant.plafond * 2,
    });
    // Et la copie porte VRAIMENT les siens, pas des renvois vers l'original.
    const mursCopie = st().walls.filter((w) => w.roomId === copie);
    expect(mursCopie).toHaveLength(4);
    const idsCopie = new Set(mursCopie.map((w) => w.id));
    expect(
      st().fixtures.filter((f) => idsCopie.has(f.wallId)),
    ).toHaveLength(2);
    expect(st().ceiling.filter((c) => c.roomId === copie)).toHaveLength(1);
  });

  it('numérote le nom au lieu de le répéter', () => {
    const source = chambreEquipee();
    st().duplicateRoom(source);
    expect(st().rooms.map((r) => r.name)).toEqual(['Chambre', 'Chambre 2']);
    // Une troisième reprend la suite, elle ne redevient pas « Chambre 2 ».
    st().duplicateRoom(source);
    expect(st().rooms.map((r) => r.name)).toEqual([
      'Chambre',
      'Chambre 2',
      'Chambre 3',
    ]);
  });

  it('la pose À CÔTÉ, jamais par-dessus l’originale', () => {
    const source = chambreEquipee();
    const copie = st().duplicateRoom(source)!;
    const parts = roomParts(st().walls, st().rooms);
    const a = parts.find((p) => p.roomId === source)!;
    const b = parts.find((p) => p.roomId === copie)!;
    expect(a.surface && b.surface).toBeTruthy();
    // Deux pièces superposées, c'est un métré qui double sans raison.
    const chevauche =
      Math.abs(a.labelAt.x - b.labelAt.x) < 0.5 &&
      Math.abs(a.labelAt.z - b.labelAt.z) < 0.5;
    expect(chevauche).toBe(false);
    // Même surface, tout de même : c'est une copie.
    expect(b.surface!.area).toBeCloseTo(a.surface!.area, 1);
  });

  it('reste à l’étage où l’on travaille', () => {
    const source = chambreEquipee();
    st().allerAuNiveau(1);
    const copie = st().duplicateRoom(source)!;
    const piece = st().rooms.find((r) => r.id === copie)!;
    expect(niveauDe(piece)).toBe(1);
    for (const m of st().walls.filter((w) => w.roomId === copie)) {
      expect(niveauDe(m)).toBe(1);
    }
  });

  it('et s’annule d’un seul geste', () => {
    const source = chambreEquipee();
    const avant = st().rooms.length;
    st().duplicateRoom(source);
    st().undo();
    expect(st().rooms).toHaveLength(avant);
    expect(st().fixtures).toHaveLength(2);
  });
});
