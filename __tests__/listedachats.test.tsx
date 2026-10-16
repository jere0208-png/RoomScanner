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

  /*
    MIS À JOUR — revue des « découvreurs » : « Décorer » a quitté le menu du
    plan (il est sur la barre du bas, au rouleau — voir `decorer.test.tsx`),
    et la pastille « Liste d'achats » a quitté la rangée du haut. La liste
    garde son panier et son nom, au menu du plan et dans « Décorer ».
  */
  it('le menu : « Liste d’achats » au panier ; « Décorer » n’y est plus en double', () => {
    expect(entree('Liste d’achats')).toContain("icon: 'panier'");
    const menu = RESULT.slice(RESULT.indexOf('const menuDuScan'), RESULT.indexOf('  return (', RESULT.indexOf('const menuDuScan')));
    expect(menu).not.toContain("label: 'Décorer'");
    expect(RESULT).not.toContain("label: 'Ce qu’il faut acheter'");
    const barre = lire('src/screens/result/ResultToolbar.tsx');
    expect(barre).toMatch(/key="decorer"\s+icon="rouleau"/);
  });

  it('plus de pastille « Liste d’achats » dans la rangée du haut', () => {
    expect(RESULT).not.toContain('accessibilityLabel="Liste d’achats"');
    expect(RESULT).not.toContain('accessibilityLabel="Achats"');
    // Elle reste à portée dans « Décorer ».
    expect(lire('src/components/DecorSheet.tsx')).toContain('accessibilityLabel="Voir la liste d’achats"');
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
