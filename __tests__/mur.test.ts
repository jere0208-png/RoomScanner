/**
 * DÉPLACER UN MUR, ET LE FAIRE TOURNER.
 *
 * Jusqu'ici, un mur ne se retouchait que par ses COINS, un par un. Pour
 * pousser une cloison de dix centimètres, il fallait donc tirer deux
 * poignées l'une après l'autre — et viser deux fois le même déplacement au
 * doigt, ce qui ne donne jamais deux fois le même. Le mur arrivait de
 * travers, et on recommençait.
 *
 * Ce sont pourtant les deux gestes du métier : on POUSSE une cloison (elle
 * reste parallèle à elle-même) et on la PIVOTE (elle garde sa longueur). Ils
 * existent maintenant, et ce banc tient ce qui les rend sûrs : le mur reste
 * accroché à ses voisins, il garde sa longueur en tournant, et les aimants
 * qui rattrapent la main ne trahissent pas l'intention.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { segLength, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Un séjour carré de 4 × 4, quatre murs soudés bout à bout. */
const CARRE: WallSeg[] = [
  { id: 'n', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } },
  { id: 'e', a: { x: 4, z: 0 }, b: { x: 4, z: 4 } },
  { id: 's', a: { x: 4, z: 4 }, b: { x: 0, z: 4 } },
  { id: 'o', a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
].map((w) => ({
  ...w,
  type: 'wall' as const,
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
}));

const poser = () =>
  useScanStore.setState({
    walls: CARRE.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })),
    openings: [],
    objects: [],
    rooms: [
      { id: 'r1', name: 'Séjour', floor: null, wallIds: CARRE.map((w) => w.id) },
    ],
    fixtures: [],
    ceiling: [],
    photos: [],
  });

const mur = (id: string) => useScanStore.getState().walls.find((w) => w.id === id)!;

describe('pousser un mur', () => {
  beforeEach(poser);

  /*
    LE MUR RESTE ACCROCHÉ À SES VOISINS.

    C'est toute la différence entre déplacer un mur et le décoller : dans un
    logement, pousser une cloison ÉTIRE les deux murs qui la tiennent. Les
    laisser où ils étaient ouvrirait le contour, et la pièce cesserait
    d'avoir une surface.
  */
  it('emmène les extrémités des murs qui le tiennent', () => {
    useScanStore.getState().moveWall('n', 0, 0.6);
    // Le mur nord est descendu de 60 cm...
    expect(mur('n').a.z).toBeCloseTo(0.6, 6);
    expect(mur('n').b.z).toBeCloseTo(0.6, 6);
    // ...et les deux murs qui s'y raccrochent l'ont suivi par ce bout-là,
    // sans bouger de l'autre.
    expect(mur('e').a.z).toBeCloseTo(0.6, 6);
    expect(mur('e').b.z).toBeCloseTo(4, 6);
    expect(mur('o').b.z).toBeCloseTo(0.6, 6);
    expect(mur('o').a.z).toBeCloseTo(4, 6);
    // Le mur d'en face n'a pas bougé.
    expect(mur('s').a.z).toBeCloseTo(4, 6);
  });

  it('garde sa longueur et sa direction', () => {
    const avant = segLength(mur('n'));
    useScanStore.getState().moveWall('n', 0.35, 0.6);
    expect(segLength(mur('n'))).toBeCloseTo(avant, 6);
    // Toujours horizontal : pousser n'est pas tourner.
    expect(mur('n').a.z).toBeCloseTo(mur('n').b.z, 9);
  });

  /*
    L'AIMANT RATTRAPE LA MAIN, IL NE LA CONTREDIT PAS.

    Une cloison poussée à trois centimètres de l'aplomb d'une autre est une
    cloison qu'on voulait aligner : le doigt ne fait pas mieux sur un écran
    de six pouces. Au-delà de douze centimètres, en revanche, c'est un choix
    — et le reprendre serait insupportable.
  */
  it('s’aligne sur un mur parallèle quand il en approche', () => {
    // Le mur nord poussé à 3,94 : le mur sud est à 4.
    useScanStore.getState().moveWall('n', 0, 3.94);
    expect(mur('n').a.z).toBeCloseTo(4, 6);
  });

  it('mais laisse le mur où on l’a mis quand c’est franc', () => {
    useScanStore.getState().moveWall('n', 0, 1.5);
    expect(mur('n').a.z).toBeCloseTo(1.5, 6);
  });

  it('s’annule d’un seul retour en arrière', () => {
    useScanStore.getState().moveWall('n', 0, 0.6);
    useScanStore.getState().undo();
    expect(mur('n').a.z).toBeCloseTo(0, 6);
    expect(mur('e').a.z).toBeCloseTo(0, 6);
  });
});

describe('tourner un mur', () => {
  beforeEach(poser);

  /*
    IL PIVOTE AUTOUR DE SON MILIEU.

    Autour d'un bout, le mur balaie la pièce et son autre extrémité part au
    loin : le geste devient impossible à viser. Autour du milieu, ce qu'on
    voit tourner est ce qu'on tient.
  */
  it('pivote autour de son milieu, sans changer de longueur', () => {
    const avant = segLength(mur('n'));
    const milieu = {
      x: (mur('n').a.x + mur('n').b.x) / 2,
      z: (mur('n').a.z + mur('n').b.z) / 2,
    };
    useScanStore.getState().rotateWall('n', 30);
    expect(segLength(mur('n'))).toBeCloseTo(avant, 6);
    const apres = {
      x: (mur('n').a.x + mur('n').b.x) / 2,
      z: (mur('n').a.z + mur('n').b.z) / 2,
    };
    expect(apres.x).toBeCloseTo(milieu.x, 6);
    expect(apres.z).toBeCloseTo(milieu.z, 6);
  });

  it('emmène les murs qui le tiennent', () => {
    useScanStore.getState().rotateWall('n', 30);
    // Les voisins restent soudés : leur extrémité colle au bout du mur qui
    // a tourné, au millimètre.
    expect(mur('o').b.x).toBeCloseTo(mur('n').a.x, 6);
    expect(mur('o').b.z).toBeCloseTo(mur('n').a.z, 6);
    expect(mur('e').a.x).toBeCloseTo(mur('n').b.x, 6);
    expect(mur('e').a.z).toBeCloseTo(mur('n').b.z, 6);
  });

  /*
    ET IL S'ARRÊTE SUR LES ANGLES QU'ON VISE.

    Un mur se pose d'équerre, en biais à quarante-cinq, rarement à
    trente-sept degrés. La rotation s'accroche donc tous les quinze degrés,
    à trois près : de quoi retrouver l'aplomb du premier coup sans interdire
    l'angle qu'on veut vraiment.
  */
  it('s’accroche tous les quinze degrés', () => {
    // Un pas de 14° : l'accroche le ramène à 15, l'aplomb du dessinateur.
    useScanStore.getState().rotateWall('n', 14);
    const w = mur('n');
    const deg = (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    expect(deg).toBeCloseTo(15, 4);
  });

  it('et laisse passer un angle franchement choisi', () => {
    // Dix degrés est à cinq du premier cran : c'est un choix, on le garde.
    useScanStore.getState().rotateWall('n', 10);
    const w = mur('n');
    const deg = (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    expect(deg).toBeCloseTo(10, 4);
  });

  /*
    UN PAS DE ROTATION EST BORNÉ — quoi qu'on lui demande.

    Relevé du chantier, vidéo à l'appui : « la rotation part dans tous les
    sens ». Le geste envoyait des pas aberrants, et le mur balayait le plan
    d'une image à l'autre — la pièce passait de 0,8 à 6,7 m² en trois
    dixièmes de seconde.

    Le geste a été refait, mais la borne vit ICI, dans le magasin : c'est le
    seul endroit qui protège de TOUT appelant, y compris d'un geste qu'on
    réécrira un jour. Vingt degrés en un pas, c'est déjà un mouvement franc
    du poignet.
  */
  it('ne tourne jamais de plus de vingt degrés d’un coup', () => {
    useScanStore.getState().rotateWall('n', 200);
    const w = mur('n');
    const deg = (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    expect(Math.abs(deg)).toBeLessThanOrEqual(20.001);
  });

  it('et pas davantage dans l’autre sens', () => {
    useScanStore.getState().rotateWall('n', -95);
    const w = mur('n');
    const deg = (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    expect(deg).toBeGreaterThanOrEqual(-20.001);
  });

  it('s’annule d’un seul retour en arrière', () => {
    useScanStore.getState().rotateWall('n', 30);
    useScanStore.getState().undo();
    expect(mur('n').a.z).toBeCloseTo(0, 6);
    expect(mur('n').b.z).toBeCloseTo(0, 6);
  });
});
