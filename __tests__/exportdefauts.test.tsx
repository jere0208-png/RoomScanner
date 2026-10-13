/**
 * CE QUI EST COCHÉ QUAND ON OUVRE L'EXPORT.
 *
 * Relevé du patron, en deux temps :
 *
 *   1. « Dans l'export PDF, on doit avoir de base coché : Vues 3D, Métré,
 *      Cotes 2D, Meubles. Le reste est décoché. »
 *   2. « Coche aussi Élec et élévations de base. »
 *
 * C'est le dossier qu'on envoie neuf fois sur dix : le plan coté avec ses
 * meubles, le métré, les perspectives — et LES MURS VUS DE FACE. Ceux-là
 * ont d'abord été écartés parce qu'ils font une feuille par mur ; sauf que
 * ce dossier-là est celui de l'électricien, et qu'un mur vu de face avec
 * ses retours cotés est ce sur quoi il perce. Le reste — surfaces teintées,
 * ouvertures en couleur, plafond, gaines, schémas, cotes 3D — répond à une
 * demande particulière, et se coche quand elle se présente.
 *
 * Le défaut n'était pas d'avoir trop d'options : c'était d'en avoir six
 * cochées d'office. Un dossier de onze feuilles part chez le client alors
 * qu'on en voulait quatre, et personne ne décoche ce qu'on ne sait pas
 * coché.
 *
 * ATTENTION AU PIÈGE : quatre de ces réglages (meubles, surfaces,
 * ouvertures, couleurs) sont ceux de l'ÉCRAN DU PLAN, partagés par le
 * magasin. L'export les pose à son ouverture — l'aperçu montre alors
 * exactement ce que le dossier contiendra, ce qui est le point de cet écran.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Switch, View } from 'react-native';
import { useReglagesExport } from '../src/store/reglagesExport';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import type { CeilingFixture } from '../src/geometry/ceiling';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** De quoi faire paraître TOUTES les options, y compris les conditionnelles. */
const PLAFOND: CeilingFixture[] = [
  { id: 'pl1', kind: 'dcl', roomId: SNAPSHOT_ROOMS[0].id, at: { x: 1.6, z: 1.4 } },
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'export',
      scanName: 'Chantier test',
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
      north: 0,
      // Le plan vient d'être regardé avec TOUT allumé : c'est le cas qui
      // piège, l'export ne doit pas en hériter.
      showFurniture: true,
      showSurfaces: true,
      showTextures: true,
      showOpeningColors: true,
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
    jest.advanceTimersByTime(400);
  });
  arbre = t;
  return t;
}

/**
 * L'état de chaque réglage : l'interrupteur de chaque feuille, les calques
 * du plan, et le choix des murs de face.
 */
const options = (t: TestRenderer.ReactTestRenderer) => {
  const out = new Map<string, boolean>();
  for (const sw of t.root.findAllByType(Switch)) {
    if (typeof sw.props.accessibilityLabel === 'string') out.set(sw.props.accessibilityLabel, !!sw.props.value);
  }
  for (const n of t.root.findAll(
    (x) =>
      typeof x.props.accessibilityLabel === 'string' &&
      typeof x.props.onPress === 'function' &&
      typeof x.props.accessibilityState?.selected === 'boolean',
    { deep: false },
  )) {
    out.set(n.props.accessibilityLabel, n.props.accessibilityState.selected);
  }
  return out;
};

describe('les options cochées à l’ouverture de l’export', () => {
  /*
    LES MÊMES DÉFAUTS, DITS AUTREMENT — la grille d'icônes est devenue une
    carte par feuille (relevé du patron : « tous ces boutons ne sont pas
    ludiques, on ne comprend pas leur intérêt ») : « Cotes 2D » est le
    calque Cotes du plan, « Élévations » et « Cotes Élec » sont les murs de
    face — tous les murs.
  */
  // « Surfaces » est cochée : un dossier sans un nom de pièce ni un mètre
  // carré ne sert à personne (correctif de l'audit).
  // Revue « Karim » : l'électricien imprime son plafond et ses schémas —
  // cochés pour lui, plus à recocher à chaque dossier. (Le plan des gaines
  // aussi, quand ce plan a un tirage à montrer.)
  const COCHEES = ['Page de garde', 'Vues 3D', 'Métré', 'Cotes', 'Meubles', 'Surfaces', 'Murs de face', 'Tous les murs', 'Plafond', 'Schémas'];
  const DECOCHEES = [
    'Cotes sur la 3D',
    'Menuiseries en couleur',
    'Couleurs relevées',
    'Murs équipés',
  ];

  it('coche celles du dossier ordinaire', () => {
    const o = options(monter());
    for (const nom of COCHEES) {
      expect({ [nom]: o.get(nom) }).toEqual({ [nom]: true });
    }
  });

  it('et décoche tout le reste', () => {
    const o = options(monter());
    for (const nom of DECOCHEES) {
      if (!o.has(nom)) continue;
      expect({ [nom]: o.get(nom) }).toEqual({ [nom]: false });
    }
    // Et l'on a bien vu des réglages éteints : le banc n'est pas vide.
    expect(DECOCHEES.filter((n) => o.has(n)).length).toBeGreaterThanOrEqual(3);
  });

  /*
    REVUES « KARIM » ET « INÈS » : les cases se recochaient à chaque export.
  */
  it('retiennent le choix d’un export à l’autre', () => {
    const t = monter();
    const metre = t.root.findAllByType(Switch).find((sw) => sw.props.accessibilityLabel === 'Métré')!;
    act(() => metre.props.onValueChange(false));
    act(() => t.unmount());
    expect(options(monter()).get('Métré')).toBe(false);
    act(() => useReglagesExport.setState({ choix: {} }));
  });

  it('et les options du plan suivent, pour que l’aperçu ne mente pas', () => {
    monter();
    const st = useScanStore.getState();
    expect(st.showFurniture).toBe(true);
    expect(st.showSurfaces).toBe(true);
    expect(st.showTextures).toBe(false);
    expect(st.showOpeningColors).toBe(false);
  });
});

/*
  LE PARTICULIER N'A PAS BESOIN DE CHAQUE MUR DE FACE — correctif de l'audit :
  une feuille par mur, un dossier interminable, pour quelqu'un qui ne perce
  pas. L'électricien les garde cochées : c'est sur elles qu'il perce.
*/
describe('les murs de face, selon qui exporte', () => {
  afterEach(() => useUsage.setState({ modeElec: true }));

  it('décochés pour le particulier', () => {
    useUsage.setState({ modeElec: false });
    const o = options(monter());
    expect(o.get('Murs de face')).toBe(false);
    // Le reste du dossier ordinaire, lui, reste coché.
    for (const nom of ['Vues 3D', 'Métré', 'Cotes', 'Meubles', 'Surfaces']) {
      expect({ [nom]: o.get(nom) }).toEqual({ [nom]: true });
    }
  });

  it('cochés pour l’électricien', () => {
    useUsage.setState({ modeElec: true });
    expect(options(monter()).get('Murs de face')).toBe(true);
  });
});
