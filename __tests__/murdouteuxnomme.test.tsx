/**
 * LE MUR MAL VU, NOMMÉ.
 *
 * Relevé du patron : « lors d'un scan, il est dit qu'un mur a été mal
 * détecté, mais on n'informe pas lequel ». Le natif ne transmettait qu'un
 * compte. Il dit maintenant OÙ est le plus proche : de quel côté du
 * téléphone (devant, derrière, à gauche, à droite), à quelle distance, et
 * sa longueur — de quoi le retrouver sans quitter l'écran des yeux.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-test-renderer';
import { consigneDuMur, phraseDuMurDouteux } from '../src/geometry/murDouteux';
import { useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('la consigne du mur mal vu', () => {
  it('dit le geste, le mur par sa longueur, et où se tourner', () => {
    expect(consigneDuMur(1, { cote: 'gauche', distance: 2.1, longueur: 1.89 })).toEqual({
      texte: 'Tournez-vous à gauche · mur de 1,9 m à revoir',
      reste: 0,
      fleche: -90,
    });
    expect(consigneDuMur(1, { cote: 'devant', distance: 0.6, longueur: 1.2 }).texte).toBe('Balayez ce mur de bas en haut, lentement');
    expect(consigneDuMur(1, { cote: 'devant', distance: 4, longueur: 3.4 }).texte).toBe('Approchez-vous du mur en face (3,4 m)');
    expect(consigneDuMur(1, { cote: 'derriere', distance: 4.4, longueur: 2.6 }).fleche).toBe(180);
  });

  it('plusieurs : un seul à la fois, les autres attendent leur tour', () => {
    const c = consigneDuMur(6, { cote: 'droite', distance: 1, longueur: 2.6, angle: 72 });
    expect(c.reste).toBe(5);
    expect(c.fleche).toBe(72);
    expect(phraseDuMurDouteux(6, { cote: 'droite', distance: 1, longueur: 2.6 })).toBe('Tournez-vous à droite · mur de 2,6 m à revoir (+5)');
  });

  it('court : deux lignes au plus, plus de « à 1 m » pour 30 cm', () => {
    for (const cote of ['gauche', 'droite', 'devant', 'derriere'] as const) {
      const t = consigneDuMur(3, { cote, distance: 0.3, longueur: 12.34 }).texte;
      expect(t.length).toBeLessThanOrEqual(46);
      expect(t).not.toMatch(/à 1 m/);
    }
  });

  it('sans précision du natif, le compte et le geste', () => {
    expect(phraseDuMurDouteux(2, null)).toBe('2 murs à revoir · balayez-les lentement');
  });
});

describe('du natif à l’écran', () => {
  it('le natif dit où est le mur douteux le plus proche', () => {
    const swift = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(swift).toContain('corps["murDouteux"] = ');
    expect(swift).toContain('static func murDouteuxLePlusProche(');
    // Seuls les vrais mal vus (confiance basse), jamais un éclat, et la cible tient.
    expect(swift).toContain('guard s.dimensions.x >= 0.5 else { return false }');
    expect(swift).toContain('cibleDouteuse');
    expect(swift).toContain('corps["murValide"] = true');
  });

  it('le magasin le garde, l’écran du scan le dit', () => {
    act(() => {
      useScanStore.getState().applyLiveUpdate({
        wallCount: 4,
        objectCount: 0,
        doorCount: 0,
        windowCount: 0,
        mursDouteux: 1,
        murDouteux: { cote: 'gauche', distance: 2.1, longueur: 3.4 },
      } as never);
    });
    expect(useScanStore.getState().murDouteux).toEqual({ cote: 'gauche', distance: 2.1, longueur: 3.4 });
    expect(lire('src/screens/ScanScreen.tsx')).toContain('consigneDuMur(mursDouteux, murDouteux)');
  });

  it('un mur repassé se fête', () => {
    act(() => {
      useScanStore.getState().applyLiveUpdate({ wallCount: 4, objectCount: 0, doorCount: 0, windowCount: 0, mursDouteux: 0, murValide: true } as never);
    });
    expect(useScanStore.getState().murValideA).toBeGreaterThan(0);
  });
});

describe('le bandeau et la pastille « Poser »', () => {
  it('le bandeau laisse sa place à la pastille, et sa phrase tient en deux lignes', () => {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { StyleSheet, Text } = require('react-native');
    const { ScanScreen } = require('../src/screens/ScanScreen');
    const { useUsage } = require('../src/store/usage');
    act(() => useUsage.setState({ modeElec: true }));
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false, mursDouteux: 6, murDouteux: { cote: 'gauche', distance: 1, longueur: 1.89 } } as never);
    });
    let t: { root: { findAll: (f: (n: { props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[]; findAllByType: (x: unknown) => { props: Record<string, unknown> }[] }; unmount: () => void };
    act(() => {
      t = TestRenderer.create(React.createElement(ScanScreen));
    });
    const pastille = t!.root.findAll((n) => n.props.accessibilityLabel === 'Afficher la pose')[0];
    const bandeaux = t!.root.findAll((n) => n.props.testID === 'bandeaux')[0];
    const ps = StyleSheet.flatten(pastille.props.style);
    const bs = StyleSheet.flatten(bandeaux.props.style);
    // La pastille : son bord droit, sa photo (24), son mot « Poser », ses marges.
    const largeurPastille = ps.paddingLeft + 24 + ps.gap + 5 * 13 * 0.6 + ps.paddingRight;
    expect(bs.right).toBeGreaterThanOrEqual(ps.right + largeurPastille);
    const phrase = t!.root.findAllByType(Text).find((x) => /à revoir/.test(String(x.props.children)))!;
    expect(phrase.props.numberOfLines).toBe(2);
    act(() => t!.unmount());
  });
});
