/**
 * Le retour haptique, et surtout : quand il DOIT se taire.
 *
 * Un glissement contre un mur produirait soixante « butée » par seconde. Un
 * appareil qui vibre à tout propos finit avec l'haptique coupée dans les
 * réglages du téléphone — donc plus rien, y compris là où c'était utile.
 * Deux garde-fous : un repos minimal entre deux secousses de même nature, et
 * un verrou tant que le geste n'a pas quitté l'état qui l'a déclenchée.
 */
import { NativeModules } from 'react-native';
import { haptic, releaseHaptic, resetHaptics } from '../src/ui/haptic';

const secousses: string[] = [];

beforeAll(() => {
  jest.useFakeTimers();
  // On se branche sur le module natif comme le ferait l'appareil.
  (NativeModules as Record<string, unknown>).RoomScanHaptics = {
    tap: (kind: string) => secousses.push(kind),
  };
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  secousses.length = 0;
  resetHaptics();
  jest.advanceTimersByTime(1000);
});

describe('une secousse quand il faut', () => {
  it('déclenche, et transmet la nature au module natif', () => {
    expect(haptic('butee')).toBe(true);
    expect(secousses).toEqual(['butee']);
  });

  it('deux natures différentes ne se gênent pas', () => {
    expect(haptic('butee')).toBe(true);
    expect(haptic('accroche')).toBe(true);
    expect(secousses).toEqual(['butee', 'accroche']);
  });
});

describe('et le silence, le reste du temps', () => {
  it('ne se répète pas dans les 120 ms', () => {
    expect(haptic('butee')).toBe(true);
    jest.advanceTimersByTime(50);
    expect(haptic('butee')).toBe(false);
    jest.advanceTimersByTime(50);
    expect(haptic('butee')).toBe(false);
    jest.advanceTimersByTime(50);
    expect(haptic('butee')).toBe(true);
    expect(secousses).toHaveLength(2);
  });

  it('un état MAINTENU ne secoue qu’une fois', () => {
    // Le meuble arrive contre le mur…
    expect(haptic('butee', true)).toBe(true);
    // …et on continue de pousser, une image sur deux, une seconde durant.
    for (let i = 0; i < 60; i++) {
      jest.advanceTimersByTime(16);
      haptic('butee', true);
    }
    expect(secousses).toHaveLength(1);
  });

  it('mais re-secoue si le geste a quitté l’état', () => {
    haptic('butee', true);
    jest.advanceTimersByTime(300);
    releaseHaptic('butee');
    expect(haptic('butee', true)).toBe(true);
    expect(secousses).toHaveLength(2);
  });

  it('le relâchement seul ne contourne pas le repos de 120 ms', () => {
    haptic('butee', true);
    releaseHaptic('butee');
    jest.advanceTimersByTime(30);
    expect(haptic('butee', true)).toBe(false);
    expect(secousses).toHaveLength(1);
  });
});

describe('rien ne casse quand l’appareil ne sait pas vibrer', () => {
  it('sans module natif, l’appel reste sans effet et sans erreur', () => {
    const garde = (NativeModules as Record<string, unknown>).RoomScanHaptics;
    (NativeModules as Record<string, unknown>).RoomScanHaptics = undefined;
    jest.resetModules();
    const frais = require('../src/ui/haptic') as typeof import('../src/ui/haptic');
    expect(() => frais.haptic('butee')).not.toThrow();
    (NativeModules as Record<string, unknown>).RoomScanHaptics = garde;
  });

  it('un module natif qui lève n’interrompt pas le geste', () => {
    (NativeModules as Record<string, unknown>).RoomScanHaptics = {
      tap: () => {
        throw new Error('moteur haptique occupé');
      },
    };
    jest.resetModules();
    const frais = require('../src/ui/haptic') as typeof import('../src/ui/haptic');
    expect(() => frais.haptic('alerte')).not.toThrow();
    (NativeModules as Record<string, unknown>).RoomScanHaptics = {
      tap: (kind: string) => secousses.push(kind),
    };
  });
});
