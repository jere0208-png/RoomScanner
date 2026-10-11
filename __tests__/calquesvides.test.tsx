/**
 * UN CALQUE VIDE NE S'ALLUME PAS — une bulle dit pourquoi.
 *
 * Relevé du patron : « sur le plan 2D, empêche l'activation des boutons
 * Appareils, Meubles, etc. si aucun élément à afficher ; au clic, le bouton
 * ne devient pas actif et affiche un petit message au-dessus, comme “Aucun
 * appareil à afficher, passez en mode édition”. Pareil pour “Nord” » — puis
 * « fais de même sur plan 3D ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ToolPill } from '../src/components/ToolPill';
import { BulleHote } from '../src/components/BulleHote';
import { useBulle } from '../src/ui/bulle';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];

beforeEach(() => useBulle.setState({ bulle: null }));

describe('la pastille d’un calque vide', () => {
  it('ne s’allume pas : l’appui montre la bulle, pas le calque', () => {
    const onPress = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ToolPill icon="furniture" label="Meubles" active vide="Aucun meuble à afficher" onPress={onPress} />,
      );
    });
    const b = bouton(t, 'Meubles');
    // Éteinte, même si le calque était resté allumé : il n'y a rien dessous.
    expect(b.props.accessibilityState).toEqual({ selected: false, disabled: true });
    expect(b.props.accessibilityHint).toBe('Aucun meuble à afficher');
    act(() => b.props.onPress());
    expect(onPress).not.toHaveBeenCalled();
    // La bulle se pose à la place du bouton à l'écran (mesurée par le natif).
    const pastille = lire('src/components/ToolPill.tsx');
    expect(pastille).toContain('v.measureInWindow((x, y, w) => montrerBulle(vide, x + w / 2, y))');
    act(() => t.unmount());
  });

  it('avec quelque chose à montrer, elle bascule comme avant', () => {
    const onPress = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ToolPill icon="furniture" label="Meubles" active vide={null} onPress={onPress} />);
    });
    act(() => bouton(t, 'Meubles').props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(useBulle.getState().bulle).toBeNull();
    act(() => t.unmount());
  });

  it('la bulle se pose au-dessus du bouton, et dit sa phrase', () => {
    jest.useFakeTimers();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<BulleHote />);
    });
    expect(t.toJSON()).toBeNull();
    act(() => useBulle.getState().montrer('Nord inconnu — passez en mode édition pour orienter le plan.', 200, 700));
    const textes = t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
    expect(textes).toContain('Nord inconnu — passez en mode édition pour orienter le plan.');
    // Elle s'efface seule.
    act(() => jest.advanceTimersByTime(4000));
    expect(useBulle.getState().bulle).toBeNull();
    act(() => t.unmount());
    jest.useRealTimers();
  });
});

describe('les rangées du plan et de la 3D', () => {
  const barre = lire('src/screens/result/ResultToolbar.tsx');

  it('en plan : Cotes, Meubles, Appareils, Surfaces et Nord jugent ce qu’ils ont à montrer', () => {
    expect(barre).toContain("vide={contenu.murs === 0 ? RIEN.cotes : null}");
    expect(barre).toContain("vide={contenu.meubles === 0 ? RIEN.meubles2D : null}");
    expect(barre).toContain("vide={contenu.appareils === 0 ? RIEN.appareils : null}");
    expect(barre).toContain("vide={contenu.pieces === 0 ? RIEN.surfaces : null}");
    expect(barre).toContain('vide={contenu.nord ? null : RIEN.nord2D}');
    expect(barre).toContain('Aucun appareil à afficher — passez en mode édition pour en poser.');
  });

  it('en 3D aussi : Meubles, Nord, Nuit et Murs', () => {
    expect(barre).toContain("vide={contenu.meubles === 0 ? RIEN.meubles3D : null}");
    expect(barre).toContain('vide={contenu.nord ? null : RIEN.nord3D}');
    expect(barre).toContain('vide={contenu.luminaires ? null : RIEN.nuit}');
    expect(barre).toContain("vide={contenu.murs === 0 ? RIEN.murs : null}");
  });

  it('sans nord, l’édition propose d’orienter le plan ; la bulle vit à la racine', () => {
    expect(lire('src/screens/ResultScreen.tsx')).toContain('showNorth={showNorth || (editMode && !nordConnu)}');
    expect(lire('App.tsx')).toContain('<BulleHote />');
  });
});
