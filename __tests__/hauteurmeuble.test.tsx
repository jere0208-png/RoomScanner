/**
 * UN MEUBLE A UNE TROISIÈME COTE, ET ELLE SE POSE À UNE HAUTEUR.
 *
 * Le relevé ne réglait qu'un meuble posé au sol : largeur, profondeur, et
 * c'est tout. Or la moitié de ce qui gêne un électricien est accroché en
 * l'air — meubles hauts de cuisine, hotte, télé, étagère, chauffe-eau. Deux
 * choses manquaient pour les décrire : la hauteur du meuble, et la hauteur
 * de son DESSOUS au-dessus du sol.
 *
 * Sans la seconde, l'élévation dessine tout depuis le sol : un meuble haut
 * de cuisine y devient une colonne pleine du carrelage au plafond, et le
 * plan de travail sur lequel on pose les prises disparaît sous lui. C'est le
 * genre de défaut qu'on ne voit qu'en regardant le dessin — d'où ce banc,
 * qui compte les traits plutôt que de les relire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: { takePhoto: jest.fn(async () => null) },
  scanEvents: { addListener: jest.fn(), removeAllListeners: jest.fn() },
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Rect, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { ObjectBar } from '../src/components/ObjectBar';
import { wallFace } from '../src/geometry/electrical';
import { wallQuads } from '../src/geometry/floorplan';
import { wallFurniture } from '../src/geometry/nfc15100';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';

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

/** Une cuisine de 4 × 3 ; le mur nord porte les meubles. */
const W: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

/**
 * Un meuble, posé à `base` mètres du sol.
 *
 * La matrice est celle de RoomPlan : colonne-major, la translation en
 * 12/13/14. C'est `transform[13]` — l'altitude du CENTRE — qui porte la
 * hauteur de pose ; il n'y a pas d'autre champ pour ça, et c'est bien lui
 * que le réglage doit écrire.
 */
const meuble = (
  id: string,
  category: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  base: number,
): ObjectData => ({
  id,
  category,
  width: w,
  depth: d,
  height: h,
  roomId: 'r1',
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, base + h / 2, cz, 1],
});

/** Un meuble haut de cuisine : 70 cm de haut, dessous à 1,40 m. */
const HAUT = meuble('mh', 'storage', 2, 0.25, 1.2, 0.35, 0.7, 1.4);
/** Et un bas, posé par terre. */
const BAS = meuble('mb', 'storage', 0.8, 0.3, 1.2, 0.6, 0.9, 0);

describe('la hauteur de pose, dans la géométrie', () => {
  const face = () => wallFace(W[0], wallQuads(W).get('n'), 1);

  it('rend le dessous du meuble, pas seulement son dessus', () => {
    const vus = wallFurniture(face(), [HAUT, BAS]);
    expect(vus).toHaveLength(2);
    const haut = vus.find((m) => Math.abs(m.top - 2.1) < 1e-6)!;
    const bas = vus.find((m) => Math.abs(m.top - 0.9) < 1e-6)!;
    // Sans cette cote, les deux meubles commencent au sol et le plan de
    // travail entre eux n'existe plus.
    expect(haut.base).toBeCloseTo(1.4);
    expect(bas.base).toBeCloseTo(0);
  });

  it('ne descend jamais sous le sol', () => {
    // Un scan peut placer un meuble légèrement enfoncé : la silhouette ne
    // doit pas déborder sous la ligne du sol pour autant.
    const enfonce = meuble('me', 'table', 2, 0.3, 1, 0.6, 0.8, -0.12);
    expect(wallFurniture(face(), [enfonce])[0].base).toBe(0);
  });
});

describe('l’élévation dessine les meubles à leur hauteur', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  const rendu = (objets: ObjectData[]) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: W,
        openings: [],
        objects: objets,
        rooms: [{ id: 'r1', name: 'Cuisine', floor: null }],
        fixtures: [],
        photos: [],
        ceiling: [],
      });
      tree = TestRenderer.create(
        <WallElevation
          wallId="n"
          selectedId={null}
          onSelect={() => {}}
          onAddRequest={() => {}}
          onClose={() => {}}
        />,
      );
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 360, height: 300 } },
          });
        }
      }
    });
    arbre = tree;
    return tree;
  };

  /** Les silhouettes de meubles : en pointillé au loin, en bleu plein
   *  quand le meuble est CONTRE le mur (la convention du plan). */
  const silhouettes = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(Rect)
      .filter(
        (n) =>
          n.props.strokeDasharray === '5 4' ||
          (Number(n.props.fillOpacity) === 0.1 && !n.props.strokeDasharray),
      );

  it('ne fait pas descendre un meuble haut jusqu’au sol', () => {
    const tree = rendu([HAUT]);
    const s = silhouettes(tree);
    expect(s).toHaveLength(1);
    const { y, height } = s[0].props;
    // Le sol est en bas du dessin : un meuble accroché à 1,40 m sous un
    // plafond de 2,50 m occupe 70 cm — moins du tiers de la hauteur du mur.
    // Une silhouette qui descend au sol en ferait 2,10 m.
    const solY = y + height;
    expect(height).toBeGreaterThan(0);
    expect(height / solY).toBeLessThan(0.45);
  });

  it('cote la hauteur de pose, comme on cote un appareil', () => {
    const tree = rendu([HAUT]);
    const textes = tree.root
      .findAllByType(SvgText)
      .map((n) => String(n.props.children ?? ''));
    // 140 cm : la cote qu'un cuisiniste et un électricien se donnent.
    expect(textes.join(' ')).toContain('140');
  });

  it('ne cote pas ce qui est posé par terre', () => {
    // Un meuble au sol n'a pas de hauteur de pose : écrire « 0 » sous
    // chaque caisson brouillerait les seules cotes qui comptent.
    const tree = rendu([BAS]);
    const textes = tree.root
      .findAllByType(SvgText)
      .map((n) => String(n.props.children ?? ''))
      .join(' | ');
    expect(textes.split(' | ')).not.toContain('0');
  });
});

describe('le magasin règle la troisième cote', () => {
  beforeEach(() => {
    act(() => {
      useScanStore.setState({
        walls: W,
        openings: [],
        objects: [HAUT, BAS],
        rooms: [{ id: 'r1', name: 'Cuisine', floor: null }],
        fixtures: [],
        photos: [],
      });
    });
  });

  it('change la hauteur sans déplacer le dessous', () => {
    useScanStore.getState().setObjectHeight('mh', 0.9);
    const o = useScanStore.getState().objects.find((x) => x.id === 'mh')!;
    expect(o.height).toBeCloseTo(0.9);
    // Un meuble qu'on rehausse pousse son dessus, pas son dessous : c'est
    // le dessous qui est fixé par la pose.
    expect(o.transform[13] - o.height / 2).toBeCloseTo(1.4);
  });

  it('change la hauteur de pose sans changer la hauteur', () => {
    useScanStore.getState().setObjectHeight('mh', undefined, 1.6);
    const o = useScanStore.getState().objects.find((x) => x.id === 'mh')!;
    expect(o.height).toBeCloseTo(0.7);
    expect(o.transform[13] - o.height / 2).toBeCloseTo(1.6);
  });

  it('refuse l’aberrant et ne touche pas aux autres meubles', () => {
    useScanStore.getState().setObjectHeight('mh', 0.01);
    useScanStore.getState().setObjectHeight('mh', 9);
    useScanStore.getState().setObjectHeight('mh', undefined, -1);
    const st = useScanStore.getState();
    expect(st.objects.find((x) => x.id === 'mh')!.height).toBeCloseTo(0.7);
    expect(st.objects.find((x) => x.id === 'mb')!.transform[13]).toBeCloseTo(
      0.45,
    );
  });

  it('s’annule', () => {
    useScanStore.getState().setObjectHeight('mh', 1.2);
    useScanStore.getState().undo();
    expect(
      useScanStore.getState().objects.find((x) => x.id === 'mh')!.height,
    ).toBeCloseTo(0.7);
  });
});

describe('le bandeau du meuble', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  const styles = new Proxy({}, { get: () => ({}) }) as Record<string, object>;
  const palette = {
    ink: '#000',
    danger: '#F00',
    inkSoft: '#666',
  } as never;

  const rendu = (onHeight: (h?: number, base?: number) => void) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ObjectBar
          object={HAUT}
          styles={styles}
          palette={palette}
          onPrompt={(p) => {
            // On répond tout de suite, comme le ferait la feuille.
            p.onSubmit('1,05');
          }}
          onResize={() => {}}
          onHeight={onHeight}
          onRotate={() => {}}
          onCancel={() => {}}
          onDone={() => {}}
        />,
      );
    });
    arbre = tree;
    return tree;
  };

  const pastille = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === label);

  it('porte la hauteur et la hauteur de pose', () => {
    const tree = rendu(() => {});
    expect(pastille(tree, 'Hauteur du meuble')).toBeDefined();
    expect(pastille(tree, 'Hauteur de pose')).toBeDefined();
    // Et il les MONTRE : 0,70 m de haut, posé à 1,40 m.
    const vus = tree.root
      .findAllByType(Text)
      .map((n) => String(n.props.children))
      .join(' | ');
    expect(vus).toContain('0,70');
    expect(vus).toContain('1,40');
  });

  it('applique la hauteur saisie, et la pose au bon endroit', () => {
    const recu: { h?: number; base?: number }[] = [];
    const tree = rendu((h, base) => recu.push({ h, base }));
    act(() => pastille(tree, 'Hauteur du meuble')!.props.onPress());
    act(() => pastille(tree, 'Hauteur de pose')!.props.onPress());
    expect(recu).toEqual([
      { h: 1.05, base: undefined },
      { h: undefined, base: 1.05 },
    ]);
  });
});
