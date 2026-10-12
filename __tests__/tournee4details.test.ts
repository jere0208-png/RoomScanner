/**
 * TOURNÉE N°4 — LES DÉTAILS QUI GÊNENT.
 *
 * - « Bernard » : les mots sous les boutons, gris pâle à 75 %, tombaient à
 *   un contraste de 1,99:1.
 * - « Mehdi » : on pouvait relier le détecteur de fumée à un interrupteur ;
 *   relier une ligne de quatre spots demandait quatre « Annuler ».
 * - « Claire » : 33 élévations, dont des joues de 0,28 m ; trois fantômes
 *   « Ajouter un mur » au pied d'une cloison en T.
 * - « Sébastien » : l'escalier restait compté dans l'habitable.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useScanStore } from '../src/store/scanStore';
import { posesDeMur, roomParts, type WallSeg } from '../src/geometry/floorplan';
import { surfacesHabitables } from '../src/geometry/habitable';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});

describe('les mots sous les boutons', () => {
  it('à l’encre douce, pleine', () => {
    const styles = readFileSync(join(__dirname, '..', 'src', 'screens', 'result', 'styles.ts'), 'utf8');
    const bloc = styles.slice(styles.indexOf('  bandeauMot: {'), styles.indexOf('  bandeauMot: {') + 200);
    expect(bloc).toContain('color: c.inkSoft');
    expect(bloc).not.toContain('opacity');
  });
});

describe('les liens de commande', () => {
  const plan = () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    const m = st().walls[0];
    const inter = st().addFixture('inter', m.id)!;
    const roomId = st().rooms[0].id;
    return { inter, roomId };
  };

  it('un détecteur de fumée ne se relie pas à un interrupteur', () => {
    const { inter, roomId } = plan();
    st().addCeiling('daaf', roomId, { x: 2, z: 1.5 });
    const daaf = st().ceiling.find((c) => c.kind === 'daaf')!;
    expect(st().lierElements(inter, daaf.id)).toBe(false);
    expect(st().ceiling.find((c) => c.id === daaf.id)!.commands ?? []).toEqual([]);
  });

  it('quatre spots reliés d’un geste se délient en un seul « Annuler »', () => {
    const { inter, roomId } = plan();
    for (let i = 0; i < 4; i++) st().addCeiling('spot', roomId, { x: 0.8 + i * 0.8, z: 1.5 });
    const spots = st().ceiling.filter((c) => c.kind === 'spot');
    for (const s of spots) st().lierElements(inter, s.id);
    expect(st().ceiling.filter((c) => (c.commands ?? []).includes(inter))).toHaveLength(4);
    st().undo();
    expect(st().ceiling.filter((c) => (c.commands ?? []).includes(inter))).toHaveLength(0);
  });
});

describe('les fantômes de mur', () => {
  it('pas de pose au pied d’une cloison en T', () => {
    const porteur = mur('porteur', 0, 0, 4, 0);
    const cloison = mur('cloison', 2, 0.07, 2, 3);
    const poses = posesDeMur([porteur, cloison]);
    // Le pied de la cloison (bout a) touche le flanc du porteur : rien n'y pousse.
    expect(poses.filter((p) => p.wallId === 'cloison' && p.bout === 'a')).toHaveLength(0);
    // Son bout libre, si.
    expect(poses.filter((p) => p.wallId === 'cloison' && p.bout === 'b')).toHaveLength(3);
  });
});

describe('l’escalier', () => {
  it('sort de la surface habitable de sa pièce', () => {
    const murs = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
    const parts = roomParts(murs, [{ id: 'r', wallIds: ['n', 'e', 's', 'o'] }]);
    const escalier = {
      category: 'stairs',
      width: 0.9,
      depth: 2.5,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1.2, 2, 1],
    };
    const sans = surfacesHabitables([{ id: 'r', name: 'Séjour' }], parts);
    const avec = surfacesHabitables([{ id: 'r', name: 'Séjour' }], parts, [escalier]);
    expect(sans.total - avec.total).toBeCloseTo(2.25, 6);
    expect(avec.pieces[0].raison).toMatch(/escalier/);
  });
});
