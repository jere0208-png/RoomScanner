/**
 * LE MÉNAGE DES RÉFÉRENCES — le tour de l'application l'a montré : deux
 * états survivaient à ce qui leur donnait sens.
 *
 * - Supprimer un interrupteur laissait son identifiant dans les `commands`
 *   des appliques et des points du plafond : le contrôle de conformité
 *   croyait le point « commandé » alors que sa commande n'existe plus, et
 *   le constat « point lumineux sans commande » ne tombait jamais.
 * - L'arrivage d'un scan (le popup « Relevé terminé ») survivait à
 *   l'ouverture d'un AUTRE dossier : on scannait, on filait à la
 *   bibliothèque sans valider, on ouvrait un vieux plan — et le popup
 *   proposait d'y intégrer les meubles d'un autre logement.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.advanceTimersByTime(2000));

const MUR: WallSeg = {
  id: 'n',
  type: 'wall',
  a: { x: 0, z: 0 },
  b: { x: 5, z: 0 },
  height: 2.5,
  yCenter: 1.25,
};

const fx = (id: string, kind: Fixture['kind'], extra: Partial<Fixture> = {}): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along: 1,
  height: 0.25,
  side: 1,
  ...extra,
});

describe('supprimer un interrupteur', () => {
  it('défait ses liens — applique ET point du plafond', () => {
    const dcl: CeilingFixture = {
      id: 'c1',
      kind: 'dcl',
      roomId: 'r1',
      at: { x: 2, z: 1 },
      commands: ['i1'],
    };
    useScanStore.setState({
      walls: [MUR],
      fixtures: [
        fx('i1', 'inter', { along: 3, height: 1.1 }),
        fx('ap1', 'applique', { along: 2, height: 1.8, commands: ['i1'] }),
      ],
      ceiling: [dcl],
    });
    useScanStore.getState().removeFixture('i1');
    const st = useScanStore.getState();
    expect(st.fixtures.find((f) => f.id === 'ap1')!.commands ?? []).toEqual([]);
    expect(st.ceiling[0].commands ?? []).toEqual([]);
  });
});

describe('l’arrivage d’un scan', () => {
  it('ne suit pas dans un autre dossier', () => {
    useScanStore.setState({
      arrivage: { meubles: 3 },
      saves: [
        {
          id: 'sv1',
          name: 'Ancien chantier',
          createdAt: 1,
          updatedAt: 1,
          modelPath: null,
          rooms: [],
          walls: [MUR],
          openings: [],
          objects: [],
          fixtures: [],
          photos: [],
          ceiling: [],
        },
      ],
    });
    useScanStore.getState().openSave('sv1');
    expect(useScanStore.getState().arrivage).toBeNull();
  });

  it('ne survit pas à un nouveau départ', () => {
    useScanStore.setState({ arrivage: { meubles: 2 } });
    useScanStore.getState().reset();
    expect(useScanStore.getState().arrivage).toBeNull();
  });
});

/**
 * LE MÊME MÉNAGE, PAR TOUS LES CHEMINS. Supprimer un mur ou une pièce
 * emporte des interrupteurs : leurs liens doivent partir avec eux, et le
 * plafond d'une pièce détruite n'a plus rien à éclairer ni à facturer.
 */
describe('supprimer un mur ou une piece', () => {
  const deuxMurs = (): WallSeg[] => [
    MUR,
    { ...MUR, id: 'e', a: { x: 5, z: 0 }, b: { x: 5, z: 4 } },
    { ...MUR, id: 's', a: { x: 5, z: 4 }, b: { x: 0, z: 4 } },
    { ...MUR, id: 'w', a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
  ];

  it('retirer le mur d’un interrupteur defait ses liens', () => {
    useScanStore.setState({
      rooms: [{ id: 'r1', name: 'Séjour', wallIds: ['n', 'e', 's', 'w'] }],
      walls: deuxMurs(),
      openings: [],
      objects: [],
      photos: [],
      fixtures: [
        fx('i1', 'inter', { wallId: 'e', height: 1.1 }),
        fx('ap1', 'applique', { along: 2, height: 1.8, commands: ['i1'] }),
      ],
      ceiling: [
        { id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 2 }, commands: ['i1'] },
      ],
    });
    useScanStore.getState().removeWall('e');
    const st = useScanStore.getState();
    expect(st.fixtures.find((f) => f.id === 'ap1')!.commands ?? []).toEqual([]);
    expect(st.ceiling[0].commands ?? []).toEqual([]);
  });

  it('supprimer une piece emporte son plafond', () => {
    useScanStore.setState({
      // Deux pièces : le magasin refuse de supprimer la dernière.
      rooms: [
        { id: 'r1', name: 'Séjour', wallIds: ['n', 'e', 's', 'w'] },
        { id: 'r2', name: 'Chambre', wallIds: ['e'] },
      ],
      walls: deuxMurs(),
      openings: [],
      objects: [],
      photos: [],
      fixtures: [],
      ceiling: [
        { id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 2 } },
        { id: 'c2', kind: 'spot', roomId: 'r2', at: { x: 9, z: 9 } },
      ],
    });
    useScanStore.getState().removeRoom('r1');
    const restants = useScanStore.getState().ceiling.map((c) => c.id);
    expect(restants).toEqual(['c2']);
  });

  it('fusionner deux pieces remet le plafond de la seconde dans la premiere', () => {
    useScanStore.setState({
      // Voisines par le refend « e » : la fusion refuse les pièces
      // disjointes.
      rooms: [
        { id: 'ra', name: 'Séjour', wallIds: ['n', 'e'] },
        { id: 'rb', name: 'Cuisine', wallIds: ['e', 's', 'w'] },
      ],
      walls: deuxMurs(),
      objects: [],
      ceiling: [{ id: 'c1', kind: 'dcl', roomId: 'rb', at: { x: 1, z: 3 } }],
    });
    useScanStore.getState().mergeRooms('ra', 'rb');
    expect(useScanStore.getState().ceiling[0].roomId).toBe('ra');
  });
});

describe('abandonner les modifications', () => {
  it('restaure AUSSI le plafond, les photos et le nord', () => {
    useScanStore.setState({
      arrivage: null,
      saves: [
        {
          id: 'sv1',
          name: 'Chantier',
          createdAt: 1,
          updatedAt: 1,
          modelPath: null,
          rooms: [{ id: 'r1', name: 'Séjour', wallIds: ['n'] }],
          walls: [MUR],
          openings: [],
          objects: [],
          fixtures: [],
          photos: [
            { id: 'ph1', wallId: 'n', along: 1, at: 1.4, path: '/p/a.jpg' },
          ],
          ceiling: [{ id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1 } }],
          north: 1.2,
        },
      ],
    });
    useScanStore.getState().openSave('sv1');
    useScanStore.setState({
      ceiling: [],
      photos: [],
      north: 0,
      dirty: true,
    });
    useScanStore.getState().revertCurrent();
    const st = useScanStore.getState();
    expect(st.ceiling.map((c) => c.id)).toEqual(['c1']);
    expect(st.photos.map((p) => p.id)).toEqual(['ph1']);
    expect(st.north).toBeCloseTo(1.2);
  });
});

describe('annuler la suppression d’un appareil groupe', () => {
  it('rend l’ensemble ENTIER : la plaque commune survit au retour', () => {
    useScanStore.setState({
      walls: [MUR],
      fixtures: [
        fx('a', 'prise', { group: 'pl-1' }),
        fx('b', 'prise', { along: 1.071, group: 'pl-1' }),
      ],
      ceiling: [],
    });
    jest.advanceTimersByTime(2000);
    useScanStore.getState().removeFixture('b');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().undo();
    const st = useScanStore.getState();
    expect(st.fixtures).toHaveLength(2);
    expect(st.fixtures.every((f) => f.group === 'pl-1')).toBe(true);
  });
});
