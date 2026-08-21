/**
 * UN RETOUR DE MUR EST INDÉPENDANT.
 *
 * Relevé du chantier : « un retour de mur perpendiculaire à un long mur, si
 * j essaye de prolonger ce retour, c est le long mur qui est impacté. Chaque
 * retour de mur doit être indépendant. On doit pouvoir facilement raccrocher
 * ce retour à une autre fin de mur avec un système d accroche ».
 *
 * LES DEUX COMPORTEMENTS SONT JUSTES, mais pas au même moment. Tirer le coin
 * d une pièce doit ENTRAÎNER les murs qui s y rejoignent : sans quoi le
 * contour s ouvre, la surface disparaît et le métré avec elle. Allonger un
 * retour, au contraire, ne doit toucher que lui.
 *
 * On ne devine pas laquelle des deux on veut : on la DIT. « Détacher ce
 * mur » dessoude ses bouts de ses voisins ; il se déplace alors seul, et
 * l aimant le raccroche dès qu on ramène son extrémité près d une autre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Un long mur, et un retour perpendiculaire qui part de son extrémité. */
const enL = () => {
  const walls = [
    mur('long', 0, 0, 6, 0),
    mur('retour', 6, 0, 6, 2),
  ];
  useScanStore.setState({
    walls,
    rooms: [{ id: 'r1', name: 'Séjour', wallIds: walls.map((w) => w.id) }],
    openings: [],
    objects: [],
    fixtures: [],
    ceiling: [],
    photos: [],
  });
};

const w = (id: string) => useScanStore.getState().walls.find((x) => x.id === id)!;

describe('le coin d une pièce entraîne ses murs', () => {
  it('c est le comportement par défaut, et il doit le rester', () => {
    // Sans lui, tirer un coin ouvrirait le contour : plus de surface, plus
    // de métré, plus de plan exploitable.
    enL();
    useScanStore.getState().moveWallPoint('retour', 'a', { x: 6.5, z: 0 });
    expect(w('long').b.x).toBeCloseTo(6.5, 3);
  });
});

describe('détacher un retour', () => {
  it('le dessoude de ses voisins', () => {
    enL();
    useScanStore.getState().detacherMur('retour');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().moveWallPoint('retour', 'a', { x: 5, z: 0 });
    // Le retour a bougé...
    expect(w('retour').a.x).toBeCloseTo(5, 3);
    // ...et le long mur est resté où il était.
    expect(w('long').b.x).toBeCloseTo(6, 3);
  });

  it('ne touche à rien d autre que ses jonctions', () => {
    enL();
    const avant = { ...w('retour').b };
    useScanStore.getState().detacherMur('retour');
    // Le mur lui-même n a pas bougé d un millimètre : détacher n est pas
    // déplacer, c est seulement défaire la soudure.
    expect(w('retour').a).toEqual({ x: 6, z: 0 });
    expect(w('retour').b).toEqual(avant);
    expect(w('long').b).toEqual({ x: 6, z: 0 });
  });

  it('un mur déjà libre ne change pas', () => {
    enL();
    const avant = useScanStore.getState().walls;
    useScanStore.getState().detacherMur('long');
    // « long » partage son bout b avec le retour : il se detache aussi.
    expect(useScanStore.getState().walls).not.toBe(avant);
    // Mais un mur seul au monde ne bouge rien.
    useScanStore.setState({ walls: [mur('seul', 0, 0, 3, 0)] });
    const solo = useScanStore.getState().walls;
    useScanStore.getState().detacherMur('seul');
    expect(useScanStore.getState().walls).toBe(solo);
  });
});

describe('raccrocher au bout d un autre mur', () => {
  it('l aimant soude dès qu on approche', () => {
    /*
      C est la seconde moitié de la demande : « on doit pouvoir facilement
      raccrocher ce retour à une autre fin de mur ». La soudure existe — un
      bout amené à moins de vingt-cinq centimètres d un autre s y pose
      EXACTEMENT — mais elle ne servait à rien tant qu on ne pouvait pas
      détacher d abord.
    */
    enL();
    useScanStore.getState().detacherMur('retour');
    jest.advanceTimersByTime(2000);
    // On ramène le bout libre du retour près du DÉBUT du long mur.
    useScanStore.getState().moveWallPoint('retour', 'b', { x: 0.12, z: 0.08 });
    expect(w('retour').b.x).toBeCloseTo(0, 6);
    expect(w('retour').b.z).toBeCloseTo(0, 6);
  });
});
