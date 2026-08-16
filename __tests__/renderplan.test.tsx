/**
 * Garde-fou visuel du PLAN 2D.
 *
 * La vue 3D avait le sien depuis longtemps ; le plan, non. C'est pourtant
 * lui qui porte le plus de calques — murs, ouvertures, meubles, appareillage,
 * gaines, plafond, cotes — et donc le plus d'occasions qu'un déplacement de
 * code change une position sans que personne ne le voie.
 *
 * Il ne compare pas des pixels mais l'ARBRE RENDU : chaque élément avec ses
 * coordonnées, ses couleurs et son ordre. C'est plus strict qu'une image —
 * un pan déplacé d'un dixième de point fait échouer — et c'est exactement ce
 * qu'il faut pour découper le composant sans rien changer au dessin.
 *
 * Quand le changement est voulu : `npm run snapshots`.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import type { CeilingFixture } from '../src/geometry/ceiling';

const dir = join(__dirname, '..', 'assets', 'rendu-reference');

/** Deux points de plafond, dont un commandé : le calque doit figurer. */
const PLAFOND: CeilingFixture[] = [
  {
    id: 'pl1',
    kind: 'dcl',
    roomId: SNAPSHOT_ROOMS[0].id,
    at: { x: 1.6, z: 1.4 },
    commands: [SNAPSHOT_FIXTURES[1]?.id ?? SNAPSHOT_FIXTURES[0].id],
  },
  { id: 'pl2', kind: 'daaf', roomId: SNAPSHOT_ROOMS[0].id, at: { x: 2.6, z: 0.8 } },
];

/**
 * Monte l'éditeur et lui donne une taille : sans `onLayout`, il ne dessine
 * rien du tout — il ne connaît pas encore son échelle.
 */
function rendu(editable: boolean) {
  useScanStore.setState({
    walls: SNAPSHOT_WALLS,
    openings: SNAPSHOT_OPENINGS,
    objects: SNAPSHOT_OBJECTS,
    rooms: SNAPSHOT_ROOMS.map((r, i) => ({
      id: r.id,
      name: `Pièce ${i + 1}`,
      floor: null,
    })),
    fixtures: SNAPSHOT_FIXTURES,
    ceiling: PLAFOND,
    photos: [],
    showFurniture: true,
    showSurfaces: true,
    showOpeningColors: true,
  });
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable={editable}
        selectedWallId={null}
        onSelectWall={() => {}}
        ceiling={PLAFOND}
        showCeiling
      />,
    );
  });
  act(() => {
    const conteneur = tree.root.findAllByType(View)[0];
    conteneur.props.onLayout?.({
      nativeEvent: { layout: { width: 360, height: 520 } },
    });
  });
  return tree;
}

/** L'arbre, mis à plat et stable : les fonctions ne se comparent pas. */
const serialise = (tree: TestRenderer.ReactTestRenderer) =>
  JSON.stringify(
    tree.toJSON(),
    (cle, valeur) => {
      if (typeof valeur === 'function') return '[fn]';
      // Les nombres flottants du rendu : trois décimales suffisent, et
      // au-delà on comparerait du bruit de calcul.
      if (typeof valeur === 'number') return Math.round(valeur * 1000) / 1000;
      return cle === '_owner' || cle === '_store' ? undefined : valeur;
    },
    1,
  );

describe('planche de rendu du plan 2D', () => {
  for (const [nom, editable] of [
    ['plan-lecture', false],
    ['plan-edition', true],
  ] as const) {
    it(`${nom} n'a pas changé`, () => {
      const actual = serialise(rendu(editable));
      if (process.env.UPDATE_SNAPSHOTS) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${nom}.json`), actual, 'utf8');
        return;
      }
      const expected = readFileSync(join(dir, `${nom}.json`), 'utf8');
      if (actual !== expected) {
        throw new Error(
          `Le rendu « ${nom} » a changé.\n` +
            'Si le changement est voulu, lancez `npm run snapshots` et ' +
            'relisez le diff avant de valider.',
        );
      }
    });
  }
});
