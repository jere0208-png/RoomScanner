/**
 * LE CADRAGE DU PLAN QUAND L'ÉTAGE EST MINUSCULE.
 *
 * Relevé du patron, capture à l'appui : « à la création d'un étage, tout est
 * trop zoomé et impossible de le rendre plus petit que ça… il y a un réel
 * bug ». Deux murs relevés de travers — sept dixièmes de mètre carré — et le
 * plan les affiche gros comme le bras, le niveau du dessous fuyant hors du
 * cadre en deux traits gris.
 *
 * Le défaut est arrivé avec le filtre de niveau, et il était inévitable : le
 * cadrage AJUSTE le contenu au cadre. Tant que le plan portait tous les
 * étages, il y avait toujours de quoi remplir ; réduit au seul étage
 * courant, un relevé raté de un mètre trente se retrouve grossi jusqu'à
 * remplir un téléphone. Trois choses le règlent, et aucune ne suffit seule :
 *
 *   — le cadrage compte AUSSI le niveau du dessous. C'est ce qu'on a sous
 *     les yeux, et c'est le repère sur lequel on aligne l'étage : le mettre
 *     hors champ, c'est retirer la seule chose qui aide ;
 *   — l'échelle est PLAFONNÉE. Un plan de bâtiment se lit à une échelle de
 *     plan ; grossir deux murs jusqu'au bord de l'écran ne montre rien de
 *     plus et fait perdre le nord ;
 *   — on peut dézoomer bien plus loin qu'avant. Le pincement s'arrêtait à
 *     quatre dixièmes, ce qui, sur un cadrage déjà énorme, ne rendait rien.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { ECHELLE_MAX_PLAN, makeMapping, type WallSeg } from '../src/geometry/floorplan';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  niveau?: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
  ...(niveau === undefined ? {} : { niveau }),
});

/** Le rez : un logement ordinaire de 10 × 8. */
const BAS = [
  mur('bn', 0, 0, 10, 0),
  mur('be', 10, 0, 10, 8),
  mur('bs', 10, 8, 0, 8),
  mur('bo', 0, 8, 0, 0),
];
/** L'étage raté : deux murs d'un mètre trente, en équerre. */
const HAUT = [mur('hn', 4, 3, 5.35, 3, 1), mur('he', 5.35, 3, 5.35, 4.35, 1)];

describe('l’échelle du plan', () => {
  it('ne grossit pas un relevé minuscule jusqu’à remplir l’écran', () => {
    const m = makeMapping({ minX: 0, maxX: 1.35, minZ: 0, maxZ: 1.35 }, 600, 480);
    expect(m.scale).toBeLessThanOrEqual(ECHELLE_MAX_PLAN);
  });

  it('mais remplit toujours le cadre pour un logement ordinaire', () => {
    const m = makeMapping({ minX: 0, maxX: 10, minZ: 0, maxZ: 8 }, 600, 480);
    // Huit mètres dans 480 points, moins deux marges de 40 : la hauteur
    // commande, et rien n'est plafonné à cette échelle-là.
    expect(m.scale).toBeCloseTo((480 - 80) / 8, 6);
  });

  it('et garde le plan centré, plafonné ou non', () => {
    const m = makeMapping({ minX: 4, maxX: 5.35, minZ: 3, maxZ: 4.35 }, 600, 480);
    const a = m.toPx({ x: 4, z: 3 });
    const b = m.toPx({ x: 5.35, z: 4.35 });
    expect((a.x + b.x) / 2).toBeCloseTo(300, 6);
    expect((a.y + b.y) / 2).toBeCloseTo(240, 6);
  });
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

describe('le cadrage d’un étage minuscule', () => {
  const monter = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: [...BAS, ...HAUT],
        openings: [],
        objects: [],
        rooms: [
          { id: 'r1', name: 'Séjour', floor: null },
          { id: 'r2', name: 'Combles', floor: null, niveau: 1 },
        ] as never,
        fixtures: [],
        ceiling: [],
        photos: [],
        notes: [],
        niveauCourant: 1,
      });
      t = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          filigrane={BAS}
        />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
    });
    arbre = t;
    return t;
  };

  it('garde le niveau du dessous DANS le cadre : c’est le repère', () => {
    const t = monter();
    const dessous = t.root
      .findAllByType(Line)
      .filter((n) => n.props.strokeOpacity === 0.16);
    expect(dessous).toHaveLength(BAS.length);
    for (const n of dessous) {
      for (const v of [n.props.x1, n.props.x2]) {
        expect(Number(v)).toBeGreaterThanOrEqual(-1);
        expect(Number(v)).toBeLessThanOrEqual(601);
      }
      for (const v of [n.props.y1, n.props.y2]) {
        expect(Number(v)).toBeGreaterThanOrEqual(-1);
        expect(Number(v)).toBeLessThanOrEqual(481);
      }
    }
  });
});
