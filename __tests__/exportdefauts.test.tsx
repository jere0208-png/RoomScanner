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
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useScanStore } from '../src/store/scanStore';
import { light } from '../src/theme';
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

/** L'état de chaque option de la grille : cochée ou non. */
const options = (t: TestRenderer.ReactTestRenderer) => {
  const out = new Map<string, boolean>();
  for (const n of t.root.findAllByType(TouchableOpacity)) {
    const label = n.props.accessibilityLabel;
    if (typeof label !== 'string') continue;
    const st = StyleSheet.flatten(n.props.style) as { backgroundColor?: string };
    // La pastille active prend le bleu de la maison ; les autres restent au
    // gris du fond creusé.
    if (!st?.backgroundColor) continue;
    if (st.backgroundColor === light.blue) out.set(label, true);
    else if (!out.has(label)) out.set(label, false);
  }
  return out;
};

describe('les options cochées à l’ouverture de l’export', () => {
  const COCHEES = [
    'Vues 3D',
    'Métré',
    'Cotes 2D',
    'Meubles',
    'Élévations',
    'Cotes Élec',
  ];

  it('coche celles du dossier ordinaire', () => {
    const o = options(monter());
    for (const nom of COCHEES) {
      expect({ [nom]: o.get(nom) }).toEqual({ [nom]: true });
    }
  });

  it('et décoche tout le reste', () => {
    const o = options(monter());
    for (const [nom, actif] of o) {
      if (COCHEES.includes(nom)) continue;
      // Les boutons qui ne sont pas des options de la grille n'ont pas de
      // fond bleu : seules les pastilles comptent ici.
      if (!['Cotes 3D', 'Surfaces', 'Ouvertures', 'Couleurs', 'Plafond', 'Élévations', 'Cotes Élec', 'Gaines', 'Schémas'].includes(nom)) {
        continue;
      }
      expect({ [nom]: actif }).toEqual({ [nom]: false });
    }
  });

  it('et les options du plan suivent, pour que l’aperçu ne mente pas', () => {
    monter();
    const st = useScanStore.getState();
    expect(st.showFurniture).toBe(true);
    expect(st.showSurfaces).toBe(false);
    expect(st.showTextures).toBe(false);
    expect(st.showOpeningColors).toBe(false);
  });
});
