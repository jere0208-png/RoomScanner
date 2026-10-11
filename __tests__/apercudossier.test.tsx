/**
 * L'EXPORT PDF REFAIT — on voit son dossier, et sans abonnement on le voit
 * flouté.
 *
 * Relevé du patron : « refais la page export PDF ; tous ces boutons ne sont
 * pas ludiques, on ne comprend pas réellement leur intérêt sur le plan PDF.
 * Lors de l'export, si l'utilisateur n'a pas d'abonnement, donne-lui la
 * possibilité de voir son PDF flouté, mais assez pour voir que c'est son
 * plan, avec de gros filigranes EchoPlan — une technique de confiance, et
 * son PDF doit donner l'envie d'acheter pour déflouter et télécharger. »
 *
 * Ce banc tient :
 *   — LE SOMMAIRE EST CELUI DU DOCUMENT : autant de feuilles que le PDF en
 *     imprime, dans le même ordre ;
 *   — SANS ABONNEMENT, LE NATIF REND LES FEUILLES FLOUTÉES ET FILIGRANÉES, et
 *     le bouton du bas défloute (il passe par la barrière, jamais par l'envoi) ;
 *   — ABONNÉ, ELLES SONT NETTES, et le bouton envoie le dossier ;
 *   — CHAQUE RÉGLAGE CHANGE LE COMPTE sous les yeux.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Switch, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoomScan } from 'react-native-room-scan';
import { ExportScreen, FLOU_DE_L_APERCU } from '../src/screens/ExportScreen';
import { buildScanPdf, sommaireDuDossier } from '../src/export/pdf';
import { resumeDuDossier } from '../src/components/ApercuDuDossier';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useAlerte } from '../src/ui/alerte';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const apercu = RoomScan.apercuPdf as unknown as jest.Mock;
const partager = RoomScan.sharePDF as unknown as jest.Mock;

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => useAccountStore.setState({ compte: null, pro: false }));
});

const BASE = {
  name: 'Chantier test',
  walls: SNAPSHOT_WALLS,
  openings: SNAPSHOT_OPENINGS,
  objects: SNAPSHOT_OBJECTS,
  rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
  fixtures: SNAPSHOT_FIXTURES,
};

/** Combien de feuilles un PDF porte : ses objets `/Type /Page`. */
const feuillesDuPdf = (bytes: Uint8Array) =>
  (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

describe('le sommaire est celui du document', () => {
  it('autant de feuilles que le PDF, dans le même ordre', () => {
    for (const [include3D, opts] of [
      [true, { metre: true }],
      [false, { metre: false }],
      [true, { metre: true, elevations: true, toutesElevations: true }],
    ] as const) {
      const sommaire = sommaireDuDossier(BASE, include3D, opts);
      expect(sommaire.length).toBe(feuillesDuPdf(buildScanPdf(BASE, include3D, opts)));
      expect(sommaire[0]).toEqual({ genre: 'plan', titre: 'Plan coté' });
    }
  });

  it('et se dit comme on le dirait', () => {
    expect(
      resumeDuDossier([
        { genre: 'plan', titre: 'Plan coté' },
        { genre: 'metre', titre: 'Métré' },
        { genre: 'elevation', titre: 'Mur 1' },
        { genre: 'elevation', titre: 'Mur 2' },
      ]),
    ).toBe('1 plan · 1 métré · 2 murs de face');
  });
});

function monter(pro: boolean) {
  apercu.mockReset();
  apercu.mockImplementation(async (_b64: string, o: { maxPages: number }) =>
    Array.from({ length: Math.min(3, o.maxPages) }, (_, i) => `IMG${i}`),
  );
  partager.mockClear();
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useAccountStore.setState({
      compte: pro ? { id: 'u1', methode: 'apple' } : null,
      pro,
    } as never);
    useScanStore.setState({
      screen: 'export',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: BASE.rooms,
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      north: 0,
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
  arbre = t;
  return t;
}

/** Laisse le dossier se bâtir, puis le natif rendre ses feuilles. */
const bâtir = async () => {
  await act(async () => {
    jest.advanceTimersByTime(700);
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join(' | ');
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];

describe('sans abonnement : le dossier flouté, et l’envie de le déflouter', () => {
  it('le natif rend les feuilles floutées et filigranées EchoPlan', async () => {
    const t = monter(false);
    await bâtir();
    expect(apercu).toHaveBeenCalled();
    const o = apercu.mock.calls[apercu.mock.calls.length - 1][1];
    expect(o.flou).toBe(FLOU_DE_L_APERCU);
    expect(o.flou).toBeGreaterThan(0);
    expect(o.filigrane).toBe('EchoPlan');
    // Les feuilles se montrent, et disent qu'elles sont floutées.
    expect(t.root.findAll((n) => /aperçu flouté/.test(String(n.props.accessibilityLabel ?? ''))).length).toBeGreaterThan(0);
  });

  it('le bouton du bas défloute : il passe par la barrière, jamais par l’envoi', async () => {
    const t = monter(false);
    await bâtir();
    const b = bouton(t, 'Déflouter et télécharger');
    expect(b).toBeDefined();
    await act(async () => {
      await b.props.onPress();
    });
    expect(partager).not.toHaveBeenCalled();
    // L'invité se voit proposer le compte : c'est la porte de l'offre.
    // Le titre dit que le PDF est Pro ; le message, que le compte s'ouvre
    // gratuitement (revues « Thomas », « Nadia », « Marie »).
    const q = useAlerte.getState().courante;
    expect(`${q?.titre ?? ''} ${q?.message ?? ''}`).toMatch(/compte/i);
    act(() => useAlerte.setState({ courante: null } as never));
  });
});

describe('abonné : le dossier net, et il part', () => {
  it('les feuilles sont nettes, sans filigrane, et le bouton envoie', async () => {
    const t = monter(true);
    await bâtir();
    const o = apercu.mock.calls[apercu.mock.calls.length - 1][1];
    expect(o.flou).toBe(0);
    expect(o.filigrane).toBe('');
    const b = t.root.findAll(
      (n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel === 'Exporter le PDF',
      { deep: false },
    )[0];
    expect(b).toBeDefined();
    await act(async () => {
      await b.props.onPress();
    });
    expect(partager).toHaveBeenCalledTimes(1);
  });
});

describe('chaque réglage change le dossier sous les yeux', () => {
  it('retirer le métré retire une feuille', async () => {
    const t = monter(true);
    await bâtir();
    const compte = () => Number(/Exporter le PDF · (\d+) feuilles?/.exec(textes(t))?.[1] ?? 'NaN');
    const avant = compte();
    const metre = t.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === 'Métré')!;
    act(() => metre.props.onValueChange(false));
    expect(compte()).toBe(avant - 1);
  });

  it('un calque touché dit ce qu’il montre', async () => {
    const t = monter(true);
    await bâtir();
    act(() => bouton(t, 'Surfaces').props.onPress());
    expect(textes(t)).toMatch(/Surfaces : Chaque pièce teintée/);
  });
});

describe('le flou est gravé par le natif, pas posé par l’écran', () => {
  const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('le natif floute et filigrane l’image avant de la rendre', () => {
    const natif = lire('modules/react-native-room-scan/ios/RoomScanApercu.swift');
    expect(natif).toContain('CIGaussianBlur');
    expect(natif).toContain('static func filigraner');
    expect(lire('modules/react-native-room-scan/ios/RoomScan.m')).toContain('RCT_EXTERN_METHOD(apercuPdf:');
  });
});
