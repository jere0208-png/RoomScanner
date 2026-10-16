/**
 * LA LISTE D'ACHATS A SON PANIER ET SON NOM — DÉCORER GARDE LE ROULEAU.
 *
 * Revue de lisibilité (captures clair-11, clair-13) : la pastille « Achats »,
 * l'entrée « Ce qu'il faut acheter » du menu et « Décorer » portaient le
 * même rouleau ; trois noms pour une feuille ; et en 3D la pastille n'était
 * plus qu'une icône. Un panier pour la liste, un seul nom — « Liste
 * d'achats » —, et le mot reste en 3D.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { Path } from 'react-native-svg';
import { ActionSheet } from '../src/components/Sheet';
import { SOLAIRES } from '../src/ui/solaires';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const RESULT = lire('src/screens/ResultScreen.tsx');

/** L'objet du menu du plan qui porte ce libellé, en texte. */
const entree = (label: string) => {
  const debut = RESULT.indexOf('const menuDuScan');
  const i = RESULT.indexOf(`label: '${label}'`, debut);
  expect([label, i > 0]).toEqual([label, true]);
  return RESULT.slice(i, RESULT.indexOf('\n', RESULT.indexOf('icon:', i)));
};

describe('le panier', () => {
  it('existe dans le jeu Solar, en tracé plein et dense', () => {
    expect(SOLAIRES.panier.startsWith('M')).toBe(true);
    expect(SOLAIRES.panier.length).toBeGreaterThan(60);
  });

  it('le menu : « Liste d’achats » au panier, « Décorer » au rouleau', () => {
    expect(entree('Liste d’achats')).toContain("icon: 'panier'");
    expect(entree('Décorer')).toContain("icon: 'rouleau'");
    expect(RESULT).not.toContain("label: 'Ce qu’il faut acheter'");
  });

  it('la pastille de la barre : le panier, le nom, et le mot même serrée (vue 3D)', () => {
    const i = RESULT.indexOf('accessibilityLabel="Liste d’achats"');
    expect(i).toBeGreaterThan(0);
    const bloc = RESULT.slice(i, RESULT.indexOf('</TouchableOpacity>', i));
    expect(bloc).toContain('SOLAIRES.panier');
    expect(bloc).toContain('Liste d’achats');
    // Le mot n'est plus conditionné à la place disponible.
    expect(bloc).not.toMatch(/!rangeeSerree &&/);
    expect(RESULT).not.toContain('accessibilityLabel="Achats"');
  });

  it('le menu dessine bien le panier (la clé existe dans la feuille)', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ActionSheet
          data={{ title: 'Plan', actions: [{ label: 'Liste d’achats', icon: 'panier', onPress: () => {} }] }}
          onClose={() => {}}
        />,
      );
    });
    expect(t.root.findAllByType(Path).map((p) => p.props.d)).toContain(SOLAIRES.panier);
    act(() => t.unmount());
  });

  it('la feuille s’appelle comme son bouton', () => {
    expect(lire('src/components/TravauxSheet.tsx')).toContain('<Text style={s.titre}>Liste d’achats</Text>');
  });
});
