/**
 * L'EN-TÊTE DE L'ARTISAN — son entreprise dans le cartouche du dossier.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le PDF n'avait ni
 * nom, ni coordonnées de l'artisan, et la marque EchoPlan y était figée.
 * L'électricien renseigne son entreprise une fois, au profil ; chaque
 * feuille la porte ensuite à la place de la marque.
 */
const mockDisque = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
}));

import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
import { CLE_ENTREPRISE, ENTREPRISE_VIDE, entrepriseAImprimer, useEntreprise } from '../src/store/entreprise';
import { useUsage } from '../src/store/usage';
import { ProfilScreen } from '../src/screens/ProfilScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
const walls = [mur('a', 0, 0, 4, 0), mur('b', 4, 0, 4, 3), mur('c', 4, 3, 0, 3), mur('d', 0, 3, 0, 0)];

const DUPONT = {
  nom: 'Électricité Dupont',
  adresse: '12 rue des Lilas, 69003 Lyon',
  telephone: '06 12 34 56 78',
  email: 'contact@dupont-elec.fr',
  siret: '123 456 789 00012',
};

afterEach(() => {
  useEntreprise.setState({ ...ENTREPRISE_VIDE });
  useUsage.setState({ modeElec: true });
  mockDisque.clear();
});

describe('le cartouche du dossier', () => {
  it('porte l’entreprise de l’artisan à la place de la marque', () => {
    const src = latin1(buildScanPdf({ name: 'Chantier', walls, openings: [], objects: [], entreprise: DUPONT }, false, { metre: false }));
    expect(src).toContain('(Électricité Dupont) Tj');
    expect(src).toContain('06 12 34 56 78');
    expect(src).toContain('contact@dupont-elec.fr');
    expect(src).not.toContain('(EchoPlan) Tj');
  });

  it('sans entreprise, il garde la marque', () => {
    const src = latin1(buildScanPdf({ name: 'Chantier', walls, openings: [], objects: [] }, false, { metre: false }));
    expect(src).toContain('(EchoPlan) Tj');
  });

  it('une entreprise sans nom ne s’imprime pas', () => {
    expect(entrepriseAImprimer({ ...ENTREPRISE_VIDE, telephone: '06' })).toBeNull();
    expect(entrepriseAImprimer({ ...ENTREPRISE_VIDE, nom: 'Dupont' })?.nom).toBe('Dupont');
  });
});

describe('l’entreprise se garde sur l’appareil', () => {
  it('ce qu’on règle s’écrit, et se relit', async () => {
    useEntreprise.getState().regler({ nom: '  Électricité Dupont ', telephone: '06 12 34 56 78' });
    expect(useEntreprise.getState().nom).toBe('Électricité Dupont');
    expect(JSON.parse(mockDisque.get(CLE_ENTREPRISE)!).telephone).toBe('06 12 34 56 78');
    useEntreprise.setState({ ...ENTREPRISE_VIDE, charge: false });
    await act(async () => {
      await useEntreprise.getState().charger();
    });
    expect(useEntreprise.getState().nom).toBe('Électricité Dupont');
    expect(useEntreprise.getState().charge).toBe(true);
  });
});

describe('au profil', () => {
  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Text)
      .map((x) => (Array.isArray(x.props.children) ? x.props.children.join('') : String(x.props.children ?? '')))
      .join(' | ');

  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('l’électricien renseigne son entreprise', () => {
    useUsage.setState({ modeElec: true });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ProfilScreen />);
    });
    expect(textes(t)).toContain('Mon entreprise');
    const nom = t.root.findAll(
      (x) => x.props.accessibilityLabel === 'Nom de l’entreprise' && typeof x.props.onPress === 'function',
    )[0];
    act(() => nom.props.onPress());
    act(() => t.root.findAllByType(TextInput)[0].props.onChangeText('Électricité Dupont'));
    act(() => t.root.findAllByType(TextInput)[0].props.onSubmitEditing());
    // La feuille se referme, puis la valeur part.
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(useEntreprise.getState().nom).toBe('Électricité Dupont');
    act(() => t.unmount());
  });

  it('le particulier n’a pas d’entreprise à renseigner', () => {
    useUsage.setState({ modeElec: false });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ProfilScreen />);
    });
    expect(textes(t)).not.toContain('Mon entreprise');
    act(() => t.unmount());
  });
});

describe('à l’export', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  /** L'entreprise que l'écran d'export passe au dossier. */
  function entrepriseDuDossier(): unknown {
    const { View } = require('react-native');
    const { ExportScreen } = require('../src/screens/ExportScreen');
    const { useScanStore } = require('../src/store/scanStore');
    const { appartementExemple } = require('../src/data/exemple');
    const pdf = require('../src/export/pdf');
    const espion = jest.spyOn(pdf, 'buildScanPdf');
    espion.mockClear();
    const ex = appartementExemple();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'export',
        scanName: 'Chantier',
        walls: ex.walls,
        openings: ex.openings,
        objects: ex.objects,
        rooms: ex.rooms,
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      t = TestRenderer.create(<ExportScreen />);
    });
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    const appels = espion.mock.calls;
    espion.mockRestore();
    act(() => t.unmount());
    return (appels[appels.length - 1][0] as { entreprise?: unknown }).entreprise;
  }

  it('le dossier de l’électricien porte son entreprise', () => {
    useUsage.setState({ modeElec: true });
    useEntreprise.setState({ ...DUPONT, charge: true });
    expect(entrepriseDuDossier()).toEqual(DUPONT);
  });

  it('celui du particulier, non', () => {
    useUsage.setState({ modeElec: false });
    useEntreprise.setState({ ...DUPONT, charge: true });
    expect(entrepriseDuDossier()).toBeNull();
  });
});
