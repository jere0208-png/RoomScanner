/**
 * LE MUR SE TOUCHE PARTOUT OÙ IL SE VOIT ; LA RANGÉE DIT QU'ELLE DÉFILE.
 *
 * Relevé du patron : « la sélection d'un mur au doigt est parfois
 * compliquée, on doit cliquer sur la partie intérieure ; sélectionne même si
 * on clique sur l'extérieur du même mur. Le menu de mur a des boutons qu'il
 * faut faire glisser, mais l'utilisateur ne comprend pas forcément qu'on peut
 * voir le reste. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScrollView, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { cibleDeFacade, cotesExterieurs } from '../src/geometry/cibleMur';
import { pointInPolygon } from '../src/geometry/appearance';
import { roomParts, WALL_T, type WallSeg } from '../src/geometry/floorplan';
import { SUREPAISSEUR_FACADE } from '../src/geometry/poche';
import { RangeeDActions } from '../src/components/StripBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const mur = (id: string, roomId: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId,
});
/* Deux pièces de part et d'autre du refend x = 4. */
const MURS = [
  mur('n1', 'r1', 0, 0, 4, 0), mur('ref', 'r1', 4, 0, 4, 3), mur('s1', 'r1', 4, 3, 0, 3), mur('o1', 'r1', 0, 3, 0, 0),
  mur('n2', 'r2', 4, 0, 7, 0), mur('e2', 'r2', 7, 0, 7, 3), mur('s2', 'r2', 7, 3, 4, 3),
];
const PARTS = roomParts(MURS, [
  { id: 'r1', wallIds: ['n1', 'ref', 's1', 'o1'] },
  { id: 'r2', wallIds: ['n2', 'e2', 's2', 'ref'] },
]);

describe('toute l’épaisseur dessinée d’un mur se touche', () => {
  it('chaque façade connaît son côté du dehors ; le refend n’en a pas', () => {
    const cotes = cotesExterieurs(MURS, PARTS);
    expect(cotes.has('ref')).toBe(false);
    for (const id of ['n1', 'o1', 'e2', 's2']) expect([id, cotes.has(id)]).toEqual([id, true]);
  });

  it('la surépaisseur de façade répond au doigt — côté dehors, pas côté pièce', () => {
    const cote = cotesExterieurs(MURS, PARTS).get('n1')!;
    const cible = cibleDeFacade(MURS[0], cote);
    // Le mur nord, en z = 0 : le dehors est vers −z.
    const dansLaSurepaisseur = { x: 2, z: -(WALL_T / 2 + SUREPAISSEUR_FACADE * 0.6) };
    expect(pointInPolygon(dansLaSurepaisseur, cible)).toBe(true);
    expect(pointInPolygon({ x: 2, z: WALL_T }, cible)).toBe(false);
  });

  it('le plan pose cette cible sur chaque façade', () => {
    const plan = lire('src/components/FloorplanEditor.tsx');
    expect(plan).toContain('exterieur={dehorsDesMurs.get(w.id)}');
    expect(plan).toContain('{facade ? <Polygon points={facade} fill="transparent" stroke="none" /> : null}');
  });
});

describe('la rangée des gestes dit qu’elle défile', () => {
  const STYLES = getStyles(light) as unknown as Record<string, object>;
  const fleche = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];

  it('une flèche « › » quand des gestes sont hors de vue, « ‹ » une fois au bout', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RangeeDActions styles={STYLES}>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={{ width: 52 }} />
          ))}
        </RangeeDActions>,
      );
    });
    const defile = t.root.findByType(ScrollView);
    // Rien ne déborde tant qu'on n'a rien mesuré.
    expect(fleche(t, 'Voir les autres gestes')).toBeUndefined();
    act(() => {
      defile.props.onLayout({ nativeEvent: { layout: { width: 300, height: 60 } } });
      defile.props.onContentSizeChange(470, 60);
    });
    expect(fleche(t, 'Voir les autres gestes')).toBeDefined();
    expect(fleche(t, 'Revenir aux premiers gestes')).toBeUndefined();
    act(() => defile.props.onScroll({ nativeEvent: { contentOffset: { x: 170, y: 0 } } }));
    expect(fleche(t, 'Voir les autres gestes')).toBeUndefined();
    expect(fleche(t, 'Revenir aux premiers gestes')).toBeDefined();
    act(() => t.unmount());
  });

  it('et se tait quand tout tient', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RangeeDActions styles={STYLES}>
          <View style={{ width: 52 }} />
        </RangeeDActions>,
      );
    });
    const defile = t.root.findByType(ScrollView);
    act(() => {
      defile.props.onLayout({ nativeEvent: { layout: { width: 300, height: 60 } } });
      defile.props.onContentSizeChange(52, 60);
    });
    expect(fleche(t, 'Voir les autres gestes')).toBeUndefined();
    act(() => t.unmount());
  });
});
