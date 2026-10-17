/**
 * LA VISITE SANS LAMPES — le contrat d'aujourd'hui.
 *
 * Relevé du patron : « Le système de lumière est mal fait et nuit au
 * développement de l'app. Supprime la possibilité d'éclairer la pièce en
 * appuyant sur le bouton lors de la visite uniquement, rends l'éclairage
 * qu'on avait de base d'une pièce avant aujourd'hui. Enlève les "tout
 * allumer", et autres boutons liés à la lumière lors de la visite. »
 *
 * Ce banc tient :
 *   — dans la visite, ni pastille de température, ni « Tout allumer », ni
 *     interrupteur à toucher, ni propriété de lampe passée à la vue native ;
 *   — côté natif, le jour fixe d'avant (620 / 420 / 200 en visite, la
 *     maquette inchangée à 640 / 380 / 160), plus de température ;
 *   — et ce qui reste : le ciel derrière les baies, le vrai verre, les
 *     diffuseurs des luminaires (toujours éteints).
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: { isSupported: jest.fn(async () => true), viewModel: jest.fn(async () => false) },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: 'RoomScanCanvas',
  RoomScanVisite: 'RoomScanVisite',
  poserCameraDeVisite: jest.fn(() => true),
  poserOrbiteDeMaquette: jest.fn(() => true),
  poserLeveeDeMaquette: jest.fn(() => true),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Exploration } from '../src/components/Exploration';
import type { CeilingFixture } from '../src/geometry/ceiling';
import type { Fixture } from '../src/geometry/electrical';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const swift = lire('modules/react-native-room-scan/ios/RoomScanVisite.swift');

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)];
const ROOMS = detectRooms(MURS).map((r, i) => ({ id: `room-${i + 1}`, name: 'Séjour', wallIds: r.wallIds }));

describe('dans la visite : plus aucun bouton de lumière', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('ni pastille, ni « Tout allumer », ni lampe passée au natif — même en mode Électricité, avec des lampes', () => {
    const fixtures: Fixture[] = [
      { id: 'i', kind: 'inter', wallId: 'n', along: 3, height: 1.1, side: 1 },
      { id: 'ap', kind: 'applique', wallId: 'n', along: 1, height: 1.9, side: 1 },
    ];
    const ceiling: CeilingFixture[] = [{ id: 'd', kind: 'dcl', roomId: 'room-1', at: { x: 2, z: 1.5 } }];
    act(() => {
      useUsage.setState({ modeElec: true, choisi: true, charge: true } as never);
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: ROOMS as never,
        fixtures,
        ceiling,
        niveauCourant: 0,
      } as never);
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Exploration visible onClose={() => {}} />);
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(t.root.findAll((n) => n.props?.testID === 'temperature-lampes')).toHaveLength(0);
    expect(t.root.findAll((n) => n.props?.testID === 'tout-allumer')).toHaveLength(0);
    const textes = t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' | ');
    expect(textes).not.toMatch(/Tout allumer|Tout éteindre|interrupteur|\bK\b/);
    expect(textes).toContain('Pouce gauche pour marcher · glissez à droite pour regarder');

    const vue = t.root.findAll((n) => n.type === ('RoomScanVisite' as never))[0];
    expect(vue).toBeDefined();
    expect(vue.props).not.toHaveProperty('temperature');
    expect(vue.props).not.toHaveProperty('piecesDuMaillage');
    expect(vue.props).not.toHaveProperty('piecesDesSols');
    // Les luminaires se voient toujours : leurs diffuseurs portent leur rang (code ≥ 100).
    const flux = vue.props.meubles as number[];
    const codes: number[] = [];
    for (let k = 0; k < flux.length; k += 8 + flux[k + 6] * 8 + flux[k + 7]) codes.push(flux[k]);
    expect(codes.some((c) => c >= 100 && c % 100 === 5)).toBe(true);

    // Un appui bref sur l'écran ne fait plus rien d'autre que marcher et regarder.
    const zone = t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Marcher et regarder' && typeof n.props?.onResponderGrant === 'function',
    )[0];
    const touche = { identifier: 1, pageX: 300, pageY: 300 };
    expect(() =>
      act(() => {
        zone.props.onResponderGrant({ nativeEvent: { touches: [touche], changedTouches: [touche] } });
        zone.props.onResponderRelease({ nativeEvent: { touches: [], changedTouches: [touche] } });
        jest.advanceTimersByTime(20);
      }),
    ).not.toThrow();
    act(() => t.unmount());
  });

  it('le code de la visite ne connaît plus ni interrupteur, ni température, ni lampe envoyée', () => {
    const expl = lire('src/components/Exploration.tsx');
    expect(expl).not.toMatch(/interrupteurSousLeDoigt|lampesDeLInterrupteur|lampesPourLeNatif|poserLampesDeVisite/);
    expect(expl).not.toMatch(/temperature|Temperature|allumees|tout-allumer/);
    expect(existsSync(join(__dirname, '..', 'src/store/temperatureLampes.ts'))).toBe(false);
    expect(lire('modules/react-native-room-scan/src/index.ts')).not.toMatch(/poserLampesDeVisite|temperature\?|piecesDuMaillage/);
  });
});

describe('côté natif : le jour d’avant, fixe', () => {
  const triplet = (nom: string) => {
    const m = swift.match(new RegExp(`static let ${nom}: \\(ambiance: CGFloat, jour: CGFloat, contre: CGFloat\\) = \\((\\d+), (\\d+), (\\d+)\\)`));
    return m ? [1, 2, 3].map((k) => Number(m[k])) : null;
  };

  it('en visite 620 / 420 / 200, en maquette 640 / 380 / 160', () => {
    expect(triplet('JOUR_VISITE')).toEqual([620, 420, 200]);
    expect(triplet('JOUR_MAQUETTE')).toEqual([640, 380, 160]);
    expect(swift).toContain('let j = maquette ? Self.JOUR_MAQUETTE : Self.JOUR_VISITE');
    // La vue part du jour de la visite.
    expect(swift).toContain('ambiante.intensity = RoomScanVisite.JOUR_VISITE.ambiance');
    expect(swift).toContain('jour.intensity = RoomScanVisite.JOUR_VISITE.jour');
    expect(swift).toContain('contre.intensity = RoomScanVisite.JOUR_VISITE.contre');
  });

  it('plus de température, plus de lampes, plus de pièces : rien ne fait varier le jour', () => {
    expect(swift).not.toMatch(/@objc var temperature|teinteDeKelvin|teinteDesLampes/);
    expect(swift).not.toMatch(/poserLampes|lampesPosees|lampeAllumee|appliquerLampes|sansLampes/);
    expect(swift).not.toMatch(/piecesDuMaillage|piecesDesSols|piecesEclairees|CLARTE_PIECE_ALLUMEE/);
    const m = lire('modules/react-native-room-scan/ios/RoomScan.m');
    expect(m).not.toMatch(/RCT_EXPORT_VIEW_PROPERTY\((temperature|piecesDuMaillage|piecesDesSols)/);
    expect(m).not.toMatch(/RCT_EXTERN_METHOD\(lampes:/);
  });

  it('le diffuseur d’un luminaire prend toujours la matière éteinte', () => {
    // Nommé sur la file de fond, habillé à l'accrochage (relevé « pont natif lourd »).
    expect(swift).toContain('if code == 5 && lampe >= 0 { n.name = Self.NOEUD_DIFFUSEUR }');
    expect(swift).toContain('if noeud.name == Self.NOEUD_DIFFUSEUR { noeud.geometry?.materials = [diffuseurEteint] }');
    expect(swift).not.toMatch(/diffuseurAllume/);
  });

  it('le ciel derrière les baies et le vrai verre demeurent', () => {
    expect(swift).toContain('static func imageDuCiel(_ fond: UIColor) -> UIImage');
    expect(swift).toMatch(/scene\.background\.contents = maquette \? nil : Self\.imageDuCiel/);
    expect(swift).toContain('static let nuanceurVerre = """');
    expect(swift).toContain('m.shaderModifiers = [.fragment: Self.nuanceurVerre]');
  });
});

describe('le parcours de captures', () => {
  it('une seule capture de la visite, sans « Tout allumer »', () => {
    const flow = lire('.maestro/06_visite_rendus.yaml');
    expect(flow).not.toContain('tout-allumer');
    expect(flow).toContain('takeScreenshot: ${THEME}-60-visite\n');
    expect((flow.match(/takeScreenshot:/g) ?? []).length).toBe(1);
  });
});
