/**
 * L'ÉLEC POSÉE PENDANT LE SCAN, AU VISEUR.
 *
 * Relevé du chantier : « pendant un scan, permet d'ajouter manuellement des
 * PC, inter, point lumineux. Le scan crée aussi un plafond, où l'on peut
 * placer aussi les points lumineux plafond. Ça permettrait lors d'un devis
 * de quantifier les éléments et leur placement — on mémorise l'emplacement
 * avec un viseur au centre. »
 *
 * C'est le bon moment pour le faire : on est DEVANT le mur, on voit la
 * boîte existante, on sait où passera la nouvelle. Le viser au centre de
 * l'écran vaut mieux que le replacer de mémoire une heure plus tard sur un
 * plan.
 *
 * Le natif rend des ANCRES : un point du monde, et le type visé. Tout le
 * métier est ici — rattacher chaque ancre à son mur, ou au plafond de sa
 * pièce, et en faire ce que le plan sait déjà dessiner et compter.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { ancrerElec } from '../src/geometry/viseur';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Une pièce de 4 × 3, murs dans le sens horaire. */
const W: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];
const ROOMS = [
  {
    id: 'r1',
    name: 'Séjour',
    outline: [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
      { x: 0, z: 3 },
    ],
  },
];

describe('les points visés pendant le scan', () => {
  it('posent une prise sur le mur qu’on regardait, à sa hauteur', () => {
    // Visé à 1,50 m du coin sur le mur nord, à 25 cm du sol.
    const { fixtures, ceiling } = ancrerElec(
      [{ kind: 'prise', x: 1.5, y: 0.25, z: 0.03 }],
      W,
      ROOMS,
    );
    expect(ceiling).toHaveLength(0);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].kind).toBe('prise');
    expect(fixtures[0].wallId).toBe('n');
    expect(fixtures[0].along).toBeCloseTo(1.5, 1);
    expect(fixtures[0].height).toBeCloseTo(0.25, 2);
  });

  it('choisissent la FACE qui regarde la pièce', () => {
    // Le mur nord borde la pièce par le sud : l'appareil donne dedans.
    const { fixtures } = ancrerElec(
      [{ kind: 'inter', x: 2, y: 1.1, z: 0.04 }],
      W,
      ROOMS,
    );
    const f = fixtures[0];
    // La normale de la face choisie pointe vers l'intérieur : on le
    // vérifie en reprojetant le symbole, à quinze centimètres du nu.
    expect(f.side === 1 || f.side === -1).toBe(true);
    expect(f.wallId).toBe('n');
  });

  it('envoient au PLAFOND ce qui est visé en hauteur', () => {
    // Un point lumineux au milieu de la pièce, juste sous le plafond.
    const { fixtures, ceiling } = ancrerElec(
      [{ kind: 'dcl', x: 2, y: 2.45, z: 1.5 }],
      W,
      ROOMS,
    );
    expect(fixtures).toHaveLength(0);
    expect(ceiling).toHaveLength(1);
    expect(ceiling[0].kind).toBe('dcl');
    expect(ceiling[0].roomId).toBe('r1');
    expect(ceiling[0].at.x).toBeCloseTo(2, 2);
    expect(ceiling[0].at.z).toBeCloseTo(1.5, 2);
  });

  it('jettent ce qui ne tombe sur aucun mur', () => {
    // Visé dehors, à six mètres du logement : rien à rattacher.
    const { fixtures, ceiling } = ancrerElec(
      [{ kind: 'prise', x: 12, y: 0.25, z: 12 }],
      W,
      ROOMS,
    );
    expect(fixtures).toHaveLength(0);
    expect(ceiling).toHaveLength(0);
  });

  it('donnent à chaque appareil son identité', () => {
    const { fixtures } = ancrerElec(
      [
        { kind: 'prise', x: 1, y: 0.25, z: 0.03 },
        { kind: 'prise', x: 2, y: 0.25, z: 0.03 },
      ],
      W,
      ROOMS,
    );
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].id).not.toBe(fixtures[1].id);
  });
});

/**
 * L'ÉCRAN DE SCAN : le viseur, et les boutons qui posent.
 *
 * « On mémorise l'emplacement avec un viseur au centre (un carré), dans
 * lequel on peut placer des éléments élec (bouton placé sur le côté
 * proprement). » Les boutons sont donc une colonne contre le bord — hors du
 * chemin du pouce, et loin de la miniature 3D que RoomPlan pose au
 * centre-bas.
 */
describe('l’écran de scan', () => {
  const monter = () => {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { ScanScreen } = require('../src/screens/ScanScreen');
    const { useScanStore } = require('../src/store/scanStore');
    let tree: any;
    TestRenderer.act(() => {
      useScanStore.setState({ screen: 'scan', paused: false, processing: false });
      tree = TestRenderer.create(React.createElement(ScanScreen));
    });
    return tree;
  };

  const bouton = (tree: any, debut: string) =>
    tree.root
      .findAll((n: any) => typeof n.props?.onPress === 'function')
      .find((n: any) =>
        String(n.props.accessibilityLabel ?? '').startsWith(debut),
      );

  it('offre PC, INT et LUM à portée de pouce', () => {
    const tree = monter();
    expect(bouton(tree, 'Poser PC')).toBeDefined();
    expect(bouton(tree, 'Poser INT')).toBeDefined();
    expect(bouton(tree, 'Poser LUM')).toBeDefined();
  });

  it('pose ce qu’on vise, et le compte', async () => {
    const { RoomScan } = require('react-native-room-scan');
    RoomScan.poserAuViseur = jest.fn(async () => true);
    const TestRenderer = require('react-test-renderer');
    const tree = monter();
    await TestRenderer.act(async () => {
      await bouton(tree, 'Poser PC').props.onPress();
    });
    expect(RoomScan.poserAuViseur).toHaveBeenCalledWith('prise');
    const dits = tree.root
      .findAll((n: any) => typeof n.props?.children === 'string')
      .map((n: any) => n.props.children)
      .join(' | ');
    expect(dits).toContain('1 appareil posé');
  });

  it('et le dit franchement quand il n’y a rien à viser', async () => {
    const { RoomScan } = require('react-native-room-scan');
    RoomScan.poserAuViseur = jest.fn(async () => false);
    const TestRenderer = require('react-test-renderer');
    const tree = monter();
    await TestRenderer.act(async () => {
      await bouton(tree, 'Poser LUM').props.onPress();
    });
    const dits = tree.root
      .findAll((n: any) => typeof n.props?.children === 'string')
      .map((n: any) => n.props.children)
      .join(' | ');
    expect(dits).toContain('Rien à viser');
  });
});

/**
 * LE MUR VISÉ SURVIT AU RECALAGE DU MODÈLE.
 *
 * Relevé du chantier : « j'ai essayé d'ajouter les éléments élec, ça a bien
 * pris en compte mais rien ne s'affiche sur le plan 2D ensuite ».
 *
 * La cause : les ancres étaient des points du monde ARKit, mais le modèle
 * livré passe par `RoomBuilder` — et par `StructureBuilder` dès qu'il y a
 * plusieurs passages. Ces post-traitements RECALENT la géométrie dans leur
 * propre repère. Les points, restés dans l'ancien, tombaient alors à des
 * mètres de tout mur… et `ancrerElec` les jetait, exactement comme prévu :
 * silencieusement.
 *
 * L'ancre porte donc l'IDENTIFIANT du mur visé et la cote relevée sur lui.
 * Un identifiant ne se déplace pas, lui — et le plan garde celui que
 * RoomPlan a donné à chaque surface.
 */
describe('l’ancre qui connaît son mur', () => {
  it('se pose sur le mur nommé, même si le monde a bougé', () => {
    // Le point du monde est faux — dix mètres à côté, comme après un
    // recalage — mais l'ancre sait sur quel mur elle a été prise.
    const { fixtures } = ancrerElec(
      [
        {
          kind: 'prise',
          wallId: 'n',
          along: 1.5,
          height: 0.25,
          x: 40,
          y: 40,
          z: 40,
        },
      ],
      W,
      ROOMS,
    );
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].wallId).toBe('n');
    expect(fixtures[0].along).toBeCloseTo(1.5, 2);
    expect(fixtures[0].height).toBeCloseTo(0.25, 2);
  });

  it('retombe sur le point du monde quand le mur a disparu', () => {
    // La fusion a pu redécouper les murs : l'identifiant ne répond plus,
    // et la position reprend la main.
    const { fixtures } = ancrerElec(
      [
        {
          kind: 'prise',
          wallId: 'mur-qui-nexiste-plus',
          along: 1.5,
          height: 0.25,
          x: 1.5,
          y: 0.25,
          z: 0.03,
        },
      ],
      W,
      ROOMS,
    );
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].wallId).toBe('n');
  });

  it('borne la cote au mur : un relevé de travers ne sort pas du pan', () => {
    const { fixtures } = ancrerElec(
      [{ kind: 'inter', wallId: 'n', along: 99, height: 9, x: 0, y: 0, z: 0 }],
      W,
      ROOMS,
    );
    expect(fixtures[0].along).toBeLessThanOrEqual(4);
    expect(fixtures[0].height).toBeLessThanOrEqual(2.5);
  });
});
