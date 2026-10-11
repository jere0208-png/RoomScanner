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
import { phraseDuMurDouteux } from '../src/geometry/murDouteux';
import { useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('la phrase du mur mal vu', () => {
  it('le côté, la longueur, la distance', () => {
    expect(phraseDuMurDouteux(1, { cote: 'gauche', distance: 2.1, longueur: 3.4 })).toBe(
      'Le mur à votre gauche (3,40 m, à 2 m) est mal vu · repassez lentement dessus',
    );
    expect(phraseDuMurDouteux(1, { cote: 'devant', distance: 0.6, longueur: 1.2 })).toBe(
      'Le mur devant vous (1,20 m, à 1 m) est mal vu · repassez lentement dessus',
    );
    expect(phraseDuMurDouteux(1, { cote: 'derriere', distance: 4.4, longueur: 2 })).toMatch(/^Le mur derrière vous/);
  });

  it('plusieurs : le compte, et le plus proche nommé', () => {
    expect(phraseDuMurDouteux(3, { cote: 'droite', distance: 1.5, longueur: 2.6 })).toBe(
      '3 murs mal vus · le plus proche à votre droite (2,60 m, à 2 m)',
    );
  });

  it('sans précision du natif, le compte comme avant', () => {
    expect(phraseDuMurDouteux(2, null)).toBe('2 murs mal vus · repassez lentement dessus');
  });
});

describe('du natif à l’écran', () => {
  it('le natif dit où est le mur douteux le plus proche', () => {
    const swift = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(swift).toContain('corps["murDouteux"] = ');
    expect(swift).toContain('static func murDouteuxLePlusProche(');
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
    expect(lire('src/screens/ScanScreen.tsx')).toContain('phraseDuMurDouteux(mursDouteux, murDouteux)');
  });
});
