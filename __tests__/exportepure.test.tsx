/**
 * L'ÉCRAN D'EXPORT PDF, ÉPURÉ — revue des « découvreurs ».
 *
 *   — Un second éditeur de calques (Cotes, Meubles, Surfaces, « Recadrer »,
 *     « + Un autre angle ») encombrait l'écran : il se replie derrière
 *     « Personnaliser les vues ». D'abord les feuilles, ce qu'elles
 *     contiennent, et le bouton. Rien n'est retiré.
 *   — Le métré détaillé, feuille technique, n'est plus coché d'office pour
 *     le particulier (il l'est pour l'électricien).
 *   — « Ce qu'il faut acheter » renvoyait aux réglages de « Travaux », un
 *     écran qui s'appelle « Liste d'achats » : un seul nom.
 *   — « Déflouter et télécharger » → « Débloquer le PDF ».
 *   — Les interrupteurs : le `Switch` d'iOS, réglé comme dans le profil.
 *   — Le devis (mode électricité) se voit sans rien déplier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExportScreen } from '../src/screens/ExportScreen';
import { Iso3DView } from '../src/components/Iso3DView';
import { useAccountStore } from '../src/store/accountStore';
import { useReglagesExport } from '../src/store/reglagesExport';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { light } from '../src/theme';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => {
  jest.useRealTimers();
  useUsage.setState({ charge: true, modeElec: true, choisi: true });
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => useReglagesExport.setState({ choix: {} }));
  act(() => useAccountStore.setState({ pro: false } as never));
});

function monter(modeElec: boolean) {
  useUsage.setState({ charge: true, modeElec, choisi: true });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useReglagesExport.setState({ choix: {} });
    useScanStore.setState({
      screen: 'export',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      north: 0,
    });
    t = TestRenderer.create(<ExportScreen />);
  });
  act(() => jest.advanceTimersByTime(400));
  arbre = t;
  return t;
}

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join(' | ');
const interrupteur = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === label);

describe('les réglages fins des vues, repliés', () => {
  const REGLAGES_FINS = ['Cotes', 'Meubles', 'Surfaces', 'Remettre les cadrages à zéro', 'Ajouter une perspective', 'Cotes sur la 3D'];

  it('à l’ouverture : les feuilles et le bouton, pas l’éditeur', () => {
    const t = monter(false);
    for (const l of REGLAGES_FINS) expect({ [l]: bouton(t, l) }).toEqual({ [l]: undefined });
    expect(t.root.findAllByType(Iso3DView)).toHaveLength(0);
    expect(t.root.findAll((n) => n.props.accessibilityLabel === 'Aperçu du plan')).toHaveLength(0);
    // Les feuilles, elles, sont toutes là, avec leur interrupteur.
    for (const l of ['Page de garde', 'Métré', 'Liste d’achats', 'Vues 3D', 'Murs de face']) {
      expect({ [l]: !!interrupteur(t, l) }).toEqual({ [l]: true });
    }
    expect(bouton(t, 'Débloquer le PDF')).toBeDefined();
  });

  it('« Personnaliser les vues » les rend toutes : rien n’a été retiré', () => {
    const t = monter(false);
    const deplier = bouton(t, 'Personnaliser les vues');
    expect(deplier.props.accessibilityState).toEqual({ expanded: false });
    act(() => deplier.props.onPress());
    for (const l of REGLAGES_FINS) expect({ [l]: !!bouton(t, l) }).toEqual({ [l]: true });
    expect(t.root.findAllByType(Iso3DView)).toHaveLength(1);
    expect(t.root.findAll((n) => n.props.accessibilityLabel === 'Aperçu du plan').length).toBeGreaterThan(0);
    expect(bouton(t, 'Personnaliser les vues').props.accessibilityState).toEqual({ expanded: true });
    // Une perspective de plus se règle toujours, et part au dossier.
    act(() => bouton(t, 'Ajouter une perspective').props.onPress());
    expect(t.root.findAllByType(Iso3DView)).toHaveLength(2);
  });
});

describe('ce qui est coché d’office', () => {
  it('le particulier : pas le métré détaillé, mais sa liste d’achats', () => {
    const t = monter(false);
    expect(interrupteur(t, 'Métré')!.props.value).toBe(false);
    expect(interrupteur(t, 'Liste d’achats')!.props.value).toBe(true);
    // Le métré reste à un geste.
    act(() => interrupteur(t, 'Métré')!.props.onValueChange(true));
    expect(interrupteur(t, 'Métré')!.props.value).toBe(true);
  });

  it('l’électricien : le métré, d’office', () => {
    const t = monter(true);
    expect(interrupteur(t, 'Métré')!.props.value).toBe(true);
  });
});

describe('les mots', () => {
  it('« Liste d’achats », du titre au renvoi vers ses réglages', () => {
    const t = monter(false);
    const lu = textes(t);
    expect(lu).toContain('Liste d’achats');
    expect(lu).not.toMatch(/Ce qu’il faut acheter/);
    expect(lu).not.toMatch(/« Travaux »/);
    expect(lu).toMatch(/réglages de la « Liste d’achats »/);
  });

  it('« Débloquer le PDF », jamais « Déflouter »', () => {
    const t = monter(false);
    expect(textes(t)).not.toMatch(/flout/i);
    expect(t.root.findAll((n) => /Déflouter/.test(String(n.props.accessibilityLabel ?? '')))).toHaveLength(0);
    expect(textes(t)).toMatch(/Débloquer le PDF/);
  });
});

describe('les interrupteurs', () => {
  it('le Switch d’iOS, réglé comme dans le profil et la liste d’achats', () => {
    const t = monter(false);
    const tous = t.root.findAllByType(Switch);
    expect(tous.length).toBeGreaterThan(3);
    for (const s of tous) expect(s.props.trackColor).toEqual({ true: light.blue, false: light.line });
    const profil = readFileSync(join(__dirname, '..', 'src', 'screens', 'ProfilScreen.tsx'), 'utf8');
    expect(profil).toContain('trackColor={{ true: c.blue, false: c.line }}');
  });
});

describe('le devis, à vue', () => {
  it('en mode électricité, avant « Personnaliser les vues », sans rien déplier', () => {
    const t = monter(true);
    const ordre = t.root
      .findAll((n) => ['Devis', 'Personnaliser les vues'].includes(n.props.accessibilityLabel) && typeof n.props.onPress === 'function', { deep: false })
      .map((n) => n.props.accessibilityLabel);
    expect(ordre).toEqual(['Devis', 'Personnaliser les vues']);
  });
});
