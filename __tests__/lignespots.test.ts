/**
 * UNE LIGNE DE SPOTS EST UN PONTAGE.
 *
 * Releve du patron : « pour les choses logiques de pontage, comme la "ligne de
 * spots" qu'on met, c'est des spots pontes entre eux. On doit pouvoir lier des
 * spots entre eux pour la logique de pontage, et delier un spot sur une ligne
 * par exemple. »
 *
 * C'est exact, et c'est le SECOND endroit — avec les socles — ou la gaine ne
 * remonte pas au tableau : six spots alignes au plafond se tirent de proche en
 * proche, on ne redescend pas six fois.
 *
 * LA LIGNE EXISTAIT DEJA DANS LE MODELE (`CeilingFixture.row`) : on la pose
 * d'un geste, on la deplace, on la retourne d'un bloc, et l'ecran la surligne
 * en entier au premier appui. Elle ne servait qu'a l'ecran — elle sert
 * maintenant au metre, et l'on peut la defaire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { planRoutes } from '../src/geometry/elecplan';
import { useScanStore } from '../src/store/scanStore';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { fixturePlacement, roomInputsOf } from '../src/geometry/nfc15100';
import type { CeilingFixture } from '../src/geometry/ceiling';
import type { Fixture } from '../src/geometry/electrical';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const TABLEAU: Fixture = {
  id: 'tab',
  kind: 'tableau',
  wallId: 'o',
  along: 0.4,
  height: 1.35,
  side: 1,
};

const INTER: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'o',
  along: 1.2,
  height: 1.1,
  side: 1,
};

/** Quatre spots en ligne, à un mètre l'un de l'autre. */
const spots = (row?: string): CeilingFixture[] =>
  [1.5, 2.5, 3.5, 4.5].map((x, i) => ({
    id: `s${i}`,
    kind: 'spot' as const,
    roomId: 'r1',
    at: { x, z: 2 },
    ...(row ? { row } : {}),
  }));

const ROOMS = [{ id: 'r1', name: 'Séjour', floor: null }];

const metrer = (ceiling: CeilingFixture[]) => {
  const fixtures = [TABLEAU, INTER];
  const parts = roomParts(MURS, ROOMS as never);
  const entrees = roomInputsOf(ROOMS as never, parts);
  return planRoutes(
    MURS,
    ROOMS as never,
    parts,
    fixtures,
    fixturePlacement(fixtures, MURS, entrees),
    ceiling,
    [],
  )!;
};

/** La gaine totale d'un plan. */
const gaine = (ceiling: CeilingFixture[]) => {
  let t = 0;
  for (const m of metrer(ceiling).metre.values()) t += m.conduit;
  return t;
};

describe('quatre spots en ligne', () => {
  it('se pontent : la gaine va de spot en spot', () => {
    /*
      Un metre par saut, et une seule montee depuis le tableau. Sans la ligne,
      chacun redescend — c'est quatre fois le tour de la piece.
    */
    const plan = metrer(spots('ligne-1'));
    const m = plan.metre.get([...plan.metre.keys()][0])!;
    const sauts = plan.metre.get([...plan.metre.keys()][0])!.troncons.filter(
      (t) => t.conduit < 1.5,
    );
    expect(sauts.length).toBe(3);
    expect(m.troncons.length).toBeGreaterThan(3);
  });

  it('et ça coûte bien moins de gaine que quatre descentes', () => {
    // Le controle en sens inverse, par le compteur : les memes quatre spots,
    // sans ligne.
    expect(gaine(spots('ligne-1'))).toBeLessThan(gaine(spots()) / 2);
  });

  it('mais deux spots sans ligne ne se pontent pas tout seuls', () => {
    /*
      Le pontage suit la LIGNE, pas la proximite. Deux spots poses separement
      peuvent etre voisins sans etre du meme circuit d'usage — c'est a
      l'electricien de le dire, et c'est ce que fait le bouton « Lier ».
    */
    const plan = metrer(spots());
    const m = plan.metre.get([...plan.metre.keys()][0])!;
    expect(m.troncons.filter((t) => t.conduit < 1.5).length).toBe(0);
  });
});

describe('la tête de ligne', () => {
  it('est le spot le plus proche du tableau', () => {
    /*
      Meme raison que chez les prises : c'est lui qu'on alimente, et les
      autres se prennent en s'eloignant. Enfiler les spots dans l'ordre de la
      liste ferait remonter la gaine puis redescendre.
    */
    const enversLaListe = [...spots('ligne-1')].reverse();
    const plan = metrer(enversLaListe);
    const m = plan.metre.get([...plan.metre.keys()][0])!;
    const montee = m.troncons
      .filter((t) => t.id.startsWith('s'))
      .reduce((a, b) => (a.conduit > b.conduit ? a : b));
    // Le tableau est contre le mur ouest : le premier spot est le plus proche.
    expect(montee.id).toBe('s0');
  });
});

describe('lier et délier', () => {
  /*
    Releve du patron : « on doit pouvoir lier des spots entre eux pour la
    logique de pontage, et delier un spot sur une ligne ».
  */
  const poser = (ceiling: CeilingFixture[]) =>
    useScanStore.setState({ ceiling });
  const lu = () => useScanStore.getState().ceiling;

  it('lier deux spots libres leur donne la même ligne', () => {
    poser(spots());
    useScanStore.getState().lierPlafond('s1', 's0');
    const [a, b] = [lu().find((x) => x.id === 's0')!, lu().find((x) => x.id === 's1')!];
    expect(a.row).toBeDefined();
    expect(b.row).toBe(a.row);
    // Et les autres restent seuls : lier deux spots n'en enrôle pas quatre.
    expect(lu().filter((x) => x.row === a.row)).toHaveLength(2);
  });

  it('délier un spot le sort de la ligne, et les autres restent liés', () => {
    poser(spots('ligne-1'));
    useScanStore.getState().delierPlafond('s2');
    expect(lu().find((x) => x.id === 's2')!.row).toBeUndefined();
    expect(lu().filter((x) => x.row === 'ligne-1')).toHaveLength(3);
  });

  it('et sortir l’avant-dernier défait la ligne entière', () => {
    /*
      UN SPOT SEUL N'EST PAS UNE LIGNE.

      Le dernier resterait dans une ligne d'un seul : il se croirait ponte et
      n'aurait personne a qui se ponter. Le metre, lui, ignore les lignes de
      moins de deux — mais un modele qui ment a l'ecran finit par mentir au
      calcul.
    */
    poser(spots('ligne-1').slice(0, 2));
    useScanStore.getState().delierPlafond('s0');
    expect(lu().every((x) => x.row === undefined)).toBe(true);
  });

  it('et le métré suit : délier fait remonter la gaine', () => {
    // Le controle qui compte : ce n'est pas qu'une etiquette, c'est du
    // cuivre.
    const liee = spots('ligne-1');
    const coupee = liee.map((x) =>
      x.id === 's2' ? { ...x, row: undefined } : x,
    );
    expect(gaine(coupee)).toBeGreaterThan(gaine(liee));
  });
});
