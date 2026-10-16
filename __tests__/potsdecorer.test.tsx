/**
 * DÉCORER DIT COMBIEN DE POTS — et son « Annuler » se lit.
 *
 * Revue de lisibilité : la quantité de peinture vivait derrière « Voir ma
 * liste d'achats », sous treize pastilles, hors de l'écran. Elle se lit en
 * tête de l'onglet Murs dès qu'une teinte est posée, calculée par la liste
 * d'achats elle-même (`geometry/travaux`) — pas par un second calcul qui
 * finirait par dire autre chose. Et le bouton Annuler n'était qu'une flèche,
 * à 35 % d'opacité quand rien n'était à défaire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DecorSheet } from '../src/components/DecorSheet';
import { useScanStore } from '../src/store/scanStore';
import { niveauDe, roomParts } from '../src/geometry/floorplan';
import { HYPOTHESES, achats, travauxDesPieces } from '../src/geometry/travaux';

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));
const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
  expect([label, !!b]).toEqual([label, true]);
  act(() => b.props.onPress());
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

beforeEach(() => {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.getState().ouvrirExemple();
  });
});

/** La pièce de l'exemple qui a un contour : la première venue. */
function pieceAvecContour() {
  const st = useScanStore.getState();
  const part = roomParts(st.walls, st.rooms).find((p) => (p.surface?.area ?? 0) > 0)!;
  return st.rooms.find((r) => r.id === part.roomId)!;
}

describe('les pots, en tête de l’onglet Murs', () => {
  it('rien tant que la pièce garde ses murs d’origine', () => {
    const piece = pieceAvecContour();
    act(() => {
      arbre = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale={piece.id} onAchats={jest.fn()} />);
    });
    expect(arbre!.root.findAll((n) => n.props.testID === 'pots-de-la-piece')).toHaveLength(0);
  });

  it('une teinte posée : « ≈ N pots de 2,5 L · Voir la liste », N celui de la liste d’achats', () => {
    const piece = pieceAvecContour();
    const onAchats = jest.fn();
    act(() => {
      arbre = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale={piece.id} onAchats={onAchats} />);
    });
    appuyer(arbre!, 'Murs : Vert sauge');
    const ligne = arbre!.root.findAll((n) => n.props.testID === 'pots-de-la-piece', { deep: false })[0];
    expect(ligne).toBeDefined();

    // Le même calcul que la feuille « Liste d'achats », pour cette pièce.
    const st = useScanStore.getState();
    const n = niveauDe(piece);
    const part = roomParts(st.walls.filter((w) => niveauDe(w) === n), st.rooms.filter((r) => niveauDe(r) === n)).find(
      (p) => p.roomId === piece.id,
    )!;
    const a = achats(
      travauxDesPieces([part], st.openings.filter((o) => niveauDe(o) === n), () => 'x', (id) => st.rooms.find((r) => r.id === id)),
      HYPOTHESES,
    );
    const attendu = a.murs.parTeinte!.find((x) => x.cle === 'sauge')!.pots;
    expect(attendu).toBeGreaterThan(0);
    const vu = textes(arbre!).join(' | ');
    expect(vu).toContain(`≈ ${attendu} pot${attendu > 1 ? 's' : ''} de 2,5 L`);
    expect(vu).toContain('· Voir la liste');
    appuyer(arbre!, 'Voir la liste d’achats');
    expect(onAchats).toHaveBeenCalled();
  });

  it('le calcul n’est pas dupliqué : la feuille appelle `achats` de `geometry/travaux`', () => {
    const src = readFileSync(join(__dirname, '..', 'src/components/DecorSheet.tsx'), 'utf8');
    expect(src).toMatch(/import \{[^}]*\bachats\b[^}]*\} from '\.\.\/geometry\/travaux'/);
    expect(src).not.toMatch(/rendement|couches \*/);
  });
});

describe('« Annuler » se lit', () => {
  it('le mot accompagne la flèche, et l’état éteint ne passe plus par l’opacité', () => {
    const piece = pieceAvecContour();
    act(() => {
      arbre = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale={piece.id} />);
    });
    const bouton = () =>
      arbre!.root.findAll((n) => n.props.accessibilityLabel === 'Annuler le dernier changement' && typeof n.props.onPress === 'function', { deep: false })[0];
    expect(bouton().findAllByType(Text).map((n) => n.props.children)).toContain('Annuler');
    // Éteint (rien à défaire) : aucune opacité sous 1 sur le bouton.
    expect(bouton().props.disabled).toBe(true);
    const style = StyleSheet.flatten(
      typeof bouton().props.style === 'function' ? bouton().props.style({ pressed: false }) : bouton().props.style,
    ) as { opacity?: number };
    expect(style.opacity ?? 1).toBe(1);
  });
});
