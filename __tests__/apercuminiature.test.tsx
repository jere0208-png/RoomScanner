/**
 * L'APERÇU DU DOSSIER NE PARAÎT JAMAIS VIDE — revue « clair-22 ».
 *
 * « Aperçu flouté : votre plan est là », et l'on ne voyait que des cases
 * grises avec une icône : « ça fait cassé ». Tant que le natif n'a pas
 * rendu les feuilles (ou sans lui), chacune se montre en miniature
 * DESSINÉE — le plan relevé, ses tableaux, son mur —, atténuée et
 * filigranée sans abonnement. Et l'on dit ce qu'on obtient : « Débloquer le
 * PDF », pas « Déflouter » ; le compte des feuilles n'a plus l'air d'un
 * bouton.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Line, Text as SvgText } from 'react-native-svg';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  ApercuDuDossier,
  FILIGRANE_MINIATURE,
  MiniatureFeuille,
} from '../src/components/ApercuDuDossier';
import { light } from '../src/theme';
import type { FeuilleDuDossier } from '../src/export/pdf';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const MURS = [
  { a: { x: 0, z: 0 }, b: { x: 6, z: 0 } },
  { a: { x: 6, z: 0 }, b: { x: 6, z: 4 } },
  { a: { x: 6, z: 4 }, b: { x: 0, z: 4 } },
  { a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
  { a: { x: 3, z: 0 }, b: { x: 3, z: 4 } },
  { a: { x: 3, z: 2 }, b: { x: 6, z: 2 } },
  { a: { x: 4.5, z: 2 }, b: { x: 4.5, z: 4 } },
];
const rendre = (el: React.ReactElement) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(el);
  });
  return r;
};
const SOMMAIRE: FeuilleDuDossier[] = [
  { genre: 'garde', titre: 'Page de garde' },
  { genre: 'plan', titre: 'Plan coté' },
  { genre: 'metre', titre: 'Métré' },
  { genre: 'achats', titre: 'Liste d’achats' },
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (p: { images?: string[] | null; net?: boolean; onDebloquer?: () => void }) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ApercuDuDossier
        sommaire={SOMMAIRE}
        images={p.images ?? null}
        enCours={false}
        net={!!p.net}
        murs={MURS}
        onDebloquer={p.onDebloquer ?? (() => {})}
      />,
    );
  });
  arbre = t;
  return t;
};

describe('sans les feuilles rendues, une miniature fidèle — jamais une icône', () => {
  it('chaque feuille a sa miniature, et le plan dessine LES murs relevés', () => {
    const t = monter({ images: null });
    const tout = t.root.findAllByType(MiniatureFeuille);
    expect(tout.map((m) => m.props.feuille.genre)).toEqual(['garde', 'plan', 'metre', 'achats']);
    const plan = tout.find((m) => m.props.feuille.genre === 'plan')!;
    // Un trait par mur relevé : c'est son logement, pas un dessin type.
    const murs = plan.findAllByType(Line).filter((l) => l.props.stroke === light.ink);
    expect(murs).toHaveLength(MURS.length);
    // La page de garde porte aussi le plan.
    const garde = tout.find((m) => m.props.feuille.genre === 'garde')!;
    expect(garde.findAllByType(Line).length).toBeGreaterThanOrEqual(MURS.length);
  });

  it('les feuilles rendues par le natif gardent la place ; les suivantes, leur miniature', () => {
    const t = monter({ images: ['IMG0', 'IMG1'] });
    expect(t.root.findAllByType(MiniatureFeuille).map((m) => m.props.feuille.genre)).toEqual(['metre', 'achats']);
  });

  it('sans abonnement : atténuée et filigranée ; abonné : nette, sans filigrane', () => {
    const verrouille = rendre(<MiniatureFeuille feuille={SOMMAIRE[1]} murs={MURS} net={false} largeur={196} />);
    const fil = verrouille.root.findAllByType(SvgText);
    expect(fil.map((x) => x.props.children)).toContain(FILIGRANE_MINIATURE);
    expect(verrouille.root.findAll((n) => n.props.opacity === 0.5).length).toBeGreaterThan(0);
    const net = rendre(<MiniatureFeuille feuille={SOMMAIRE[1]} murs={MURS} net largeur={196} />);
    expect(net.root.findAllByType(SvgText)).toHaveLength(0);
    expect(net.root.findAll((n) => n.props.opacity === 0.5)).toHaveLength(0);
  });

  it('chaque genre de feuille se dessine, même sans murs (logement d’exemple)', () => {
    const genres: FeuilleDuDossier['genre'][] = [
      'garde', 'plan', 'metre', 'achats', 'existant', 'gaines', 'perspective', 'elevation', 'unifilaire',
    ];
    for (const genre of genres) {
      const r = rendre(<MiniatureFeuille feuille={{ genre, titre: genre }} murs={[]} net largeur={196} />);
      // Plus que le fond blanc et le cartouche : la feuille montre quelque chose.
      expect([genre, r.root.findAll((n) => typeof n.type === 'string').length > 3]).toEqual([genre, true]);
    }
  });
});

describe('les mots de l’offre', () => {
  it('« Débloquer le PDF », jamais « déflouter »', () => {
    const appels: number[] = [];
    const t = monter({ images: null, onDebloquer: () => appels.push(1) });
    const lu = t.root.findAllByType(Text).map((n) => String(n.props.children)).join(' | ');
    expect(lu).not.toMatch(/flout/i);
    const offre = t.root.findAll((n) => n.props.accessibilityLabel === 'Débloquer le PDF' && typeof n.props.onPress === 'function')[0];
    expect(offre).toBeDefined();
    act(() => offre.props.onPress());
    expect(appels).toHaveLength(1);
    expect(t.root.findAll((n) => /Déflouter/.test(String(n.props.accessibilityLabel ?? '')))).toHaveLength(0);
  });

  it('une miniature se dit « atténuée », une feuille rendue « floutée »', () => {
    const t = monter({ images: ['IMG0'] });
    const labels = t.root
      .findAll((n) => n.props.accessibilityRole === 'imagebutton' && typeof n.props.onPress === 'function', { deep: false })
      .map((n) => String(n.props.accessibilityLabel));
    expect(labels[0]).toMatch(/aperçu flouté$/);
    expect(labels[1]).toMatch(/aperçu atténué$/);
  });
});

describe('le compte des feuilles n’est pas un bouton', () => {
  it('ni fond plein, ni appui : du texte, à l’encre', () => {
    const t = monter({ images: null });
    const compte = t.root.findAll((n) => n.props.testID === 'compte-feuilles')[0];
    expect(compte.props.onPress).toBeUndefined();
    expect(compte.props.accessibilityRole).toBe('text');
    expect(compte.props.accessibilityLabel).toBe('4 feuilles');
    const st = StyleSheet.flatten(compte.props.style) as { backgroundColor?: string };
    expect(st.backgroundColor).toBeUndefined();
    const chiffre = compte.findAllByType(Text)[0];
    expect(StyleSheet.flatten(chiffre.props.style).color).not.toBe('#FFFFFF');
  });
});
