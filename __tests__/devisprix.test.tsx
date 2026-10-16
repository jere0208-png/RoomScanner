/**
 * LE PRIX UNITAIRE D'UNE LIGNE SE CORRIGE.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : les prix
 * unitaires du devis ne se modifiaient pas. Le catalogue donne le prix
 * public relevé en enseigne ; l'électricien, lui, achète à son prix, vend à
 * son prix, et connaît le modèle exact qu'il posera. Un devis qu'on ne peut
 * pas mettre à son prix est un devis qu'on recopie ailleurs.
 *
 * Comme la quantité corrigée, le prix corrigé se voit sur la ligne
 * (« Prix modifié ») : on ne fait pas passer un chiffre humain pour un
 * chiffre relevé. Il s'enregistre avec le plan, et le bouton du plan
 * l'additionne comme la page.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisScreen } from '../src/screens/DevisScreen';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import { cleDeLigne } from '../src/geometry/devis';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import { GAMMES } from '../src/geometry/prix';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

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
const MURS = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
const fx = (id: string, kind: FixtureKind, along: number): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along,
  height: kind === 'inter' ? 1.1 : 0.25,
  side: 1,
});
const APPAREILS: Fixture[] = [fx('p1', 'prise', 0.6), fx('p2', 'prise', 1.2), fx('i1', 'inter', 3), fx('tb', 'tableau', 4.8)];
const ROOMS = [{ id: 'r1', name: 'Séjour', floor: null }];

const chiffrage = (prix?: Record<string, number>) =>
  chiffrerLePlan(MURS, ROOMS as never, APPAREILS, [], GAMMES[0].id, undefined, [], prix ? { prix } : undefined);

describe('le calcul', () => {
  const base = chiffrage();
  const cible = base.lignes.find((l) => l.pu !== null && l.pu > 0 && l.quantite > 0)!;
  const cle = cleDeLigne(cible);

  it('le prix change, le total suit, et la ligne le dit', () => {
    const d = chiffrage({ [cle]: 12.5 });
    const l = d.lignes.find((x) => cleDeLigne(x) === cle)!;
    expect(l.pu).toBe(12.5);
    expect(l.total).toBeCloseTo(12.5 * l.quantite, 2);
    expect(l.prixAjuste).toBe(true);
    const somme = d.lignes.reduce((s, x) => s + x.total, 0);
    expect(Math.round(d.total * 100)).toBe(Math.round(somme * 100));
    // Les autres lignes n'ont pas bougé.
    const autre = d.lignes.find((x) => cleDeLigne(x) !== cle && x.pu !== null)!;
    expect(autre.prixAjuste).toBeUndefined();
  });

  it('un prix absurde se borne : jamais négatif, au centime', () => {
    const l = chiffrage({ [cle]: -4 }).lignes.find((x) => cleDeLigne(x) === cle)!;
    expect(l.pu).toBe(0);
    const m = chiffrage({ [cle]: 3.14159 }).lignes.find((x) => cleDeLigne(x) === cle)!;
    expect(m.pu).toBe(3.14);
  });
});

describe('le magasin du plan', () => {
  it('règle un prix, le retire, et l’enregistre avec le plan', () => {
    useAccountStore.setState({ pro: true, plansUtilises: 0, bonusEssais: 0 } as never);
    const s = useScanStore.getState();
    s.reset();
    useScanStore.setState({ walls: MURS, rooms: ROOMS as never, fixtures: APPAREILS, scanName: 'Chantier prix' } as never);
    useScanStore.getState().reglerPrixDevis('icta-20', 0.9);
    expect(useScanStore.getState().devisPrix).toEqual({ 'icta-20': 0.9 });
    useScanStore.getState().saveAsCopy('Chantier prix');
    expect(useScanStore.getState().saves[0].devis?.prix).toEqual({ 'icta-20': 0.9 });
    useScanStore.getState().reglerPrixDevis('icta-20', null);
    expect(useScanStore.getState().devisPrix).toEqual({});
  });

  it('le bouton du plan additionne les mêmes corrections que la page', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    // Le devis du bouton passe ensuite par `prixDuDevis` (revue « Gérard ») :
    // l'appel se lit à `const devis = chiffrerLePlan(`.
    const debut = src.indexOf('const devis = chiffrerLePlan(');
    expect(debut).toBeGreaterThan(0);
    const appel = src.slice(debut, debut + 500);
    expect(appel).toMatch(/prix: devisPrix/);
    expect(appel).toMatch(/quantites: devisQuantites/);
  });
});

describe('sur la page du devis', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });
  const mesurer = (t: TestRenderer.ReactTestRenderer) =>
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 360, height: 240 } } });
        }
      }
    });

  it('toucher le prix d’une ligne le fait corriger', async () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: ROOMS as never,
        fixtures: APPAREILS,
        ceiling: [],
        photos: [],
        notes: [],
        niveauCourant: 0,
        screen: 'devis',
        gammeDevis: GAMMES[0].id,
        devisEcartes: [],
        devisQuantites: {},
        devisAjouts: [],
        devisPrix: {},
        etapeDevis: 0,
      } as never);
      t = TestRenderer.create(<DevisScreen />);
    });
    arbre = t;
    mesurer(t);
    const bouton = (nom: string) =>
      t.root.findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith(nom)).pop()!;
    act(() => bouton('Voir le prix').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 50);
    });
    mesurer(t);
    const modifier = bouton('Modifier le prix');
    expect(modifier).toBeDefined();
    const libelle = String(modifier.props.accessibilityLabel).replace('Modifier le prix : ', '');
    act(() => modifier.props.onPress());
    // Le champ du prix : celui de la feuille, pas la recherche d'articles.
    const champ = () => t.root.findAllByType(TextInput).filter((x) => typeof x.props.onSubmitEditing === 'function').pop()!;
    act(() => champ().props.onChangeText('12,50'));
    act(() => champ().props.onSubmitEditing());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    /*
      SAISI EN HT — relevé d'un électricien artisan. 12,50 € HT se garde sur
      la base du catalogue (TTC à 20 %) : 15 €, que le devis ramène à 12,50 € HT.
    */
    const prix = useScanStore.getState().devisPrix;
    expect(Object.values(prix)).toEqual([15]);
    // Le prix souligné est un texte DANS le texte de la ligne : on lit à plat.
    const aPlat = (x: unknown): string =>
      typeof x === 'string' || typeof x === 'number'
        ? String(x)
        : Array.isArray(x)
          ? x.map(aPlat).join('')
          : x && typeof x === 'object' && 'props' in x
            ? aPlat((x as { props: { children?: unknown } }).props.children)
            : '';
    const mots = t.root.findAllByType(Text).map((n) => aPlat(n.props.children));
    expect(mots).toContain('Prix modifié');
    expect(mots.some((m) => m.includes('× 12,50 € HT'))).toBe(true);
    expect(libelle.length).toBeGreaterThan(0);
  });
});
