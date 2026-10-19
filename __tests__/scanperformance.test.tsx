/**
 * LE SCAN NE GASPILLE NI LE FIL PRINCIPAL NI LES IMAGES D'ARKIT — revue
 * « performance du scan ».
 *
 *   1. L'écran de scan ne se redessine que si ce qu'il montre change : la
 *      visée arrive dix fois par seconde dès que la hauteur bouge d'un
 *      centimètre, mais la phrase (« Prise plinthe · 25 cm ») et l'accroche
 *      ne changent pas tant qu'on reste à portée du même palier.
 *   2. Côté natif (lu dans les sources, qu'on ne compile pas ici) : l'analyse
 *      du direct quitte le fil principal, la caméra n'est lue qu'une fois par
 *      mise à jour, et le releveur de couleurs ne retient plus la prise ARKit
 *      entière pendant son relevé.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React, { Profiler } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scanEvents } from 'react-native-room-scan';
import TestRenderer, { act } from 'react-test-renderer';
import { ScanScreen } from '../src/screens/ScanScreen';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('l’écran de scan et la visée', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  it('trente visées au même palier ne redessinent l’écran qu’une fois ; un palier quitté, une de plus', () => {
    act(() => {
      useUsage.setState({ modeElec: true });
      useScanStore.getState().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false } as never);
    });
    const ajout = scanEvents.addListener as jest.Mock;
    ajout.mockClear();
    let rendus = 0;
    act(() => {
      arbre = TestRenderer.create(
        <Profiler id="scan" onRender={() => (rendus += 1)}>
          <ScanScreen />
        </Profiler>,
      );
    });
    const appel = ajout.mock.calls.find((c) => c[0] === 'onVisee');
    expect(appel).toBeDefined();
    const viser = appel![1] as (e: unknown) => void;
    const avant = rendus;
    // La main tremble autour de 25 cm : la hauteur change à chaque visée.
    // Une visée par tour : sur l'appareil, chacune arrive seule du natif.
    for (let k = 0; k < 30; k++) {
      act(() => viser({ kind: 'prise', ok: true, plafond: false, hauteur: 0.22 + (k % 7) * 0.01 }));
    }
    expect(rendus - avant).toBe(1);
    // Hors de portée du palier : la phrase change, l'écran suit.
    act(() => viser({ kind: 'prise', ok: true, plafond: false, hauteur: 0.7 }));
    expect(rendus - avant).toBe(2);
    // L'accroche perdue se montre aussi.
    act(() => viser({ kind: 'prise', ok: false, plafond: false, hauteur: 0.7 }));
    expect(rendus - avant).toBe(3);
  });
});

describe('le natif ménage le fil principal et les images d’ARKit', () => {
  const manager = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
  const couleurs = lire('modules/react-native-room-scan/ios/RoomScanTexture.swift');

  it('l’analyse du direct tourne sur une file de fond, une à la fois, et revient au fil principal', () => {
    expect(manager).toContain('private let fileDuDirect = DispatchQueue(');
    expect(manager).toMatch(/guard !analyseEnCours, Date\(\)\.timeIntervalSince\(lastLiveEmit\) > 0\.5/);
    expect(manager).toMatch(/fileDuDirect\.async \{[\s\S]*?analyserLeDirect\([\s\S]*?DispatchQueue\.main\.async/);
    // Un relevé quitté ou recommencé ne reçoit pas l'analyse d'avant.
    expect(manager).toMatch(/guard self\.generationReleve == generation, !self\.abandonne/);
  });

  it('une seule lecture de la caméra par mise à jour du direct', () => {
    const debut = manager.indexOf('func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom)');
    const fin = manager.indexOf('static func analyserLeDirect(');
    const corps = manager.slice(debut, fin);
    expect(corps.match(/\.currentFrame/g)).toHaveLength(1);
    expect(corps).toContain('autoreleasepool');
  });

  it('le releveur de couleurs ne garde que la caméra, l’image et la profondeur', () => {
    expect(couleurs).not.toContain('init?(frame: ARFrame)');
    expect(couleurs).toContain('init?(camera: ARCamera, image b: CVPixelBuffer, donnees: ARDepthData)');
    const tick = couleurs.slice(couleurs.indexOf('private func tick()'), couleurs.indexOf('private static func lire('));
    expect(tick).not.toContain('session.currentFrame');
  });
});
