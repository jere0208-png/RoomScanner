/**
 * LE PONT NATIF N'ABONNE PERSONNE AU MAGASIN ENTIER.
 *
 * `useRoomScan` appelait `useScanStore()` SANS sélecteur — l'abonnement
 * intégral : chaque écriture du magasin, quelle qu'elle soit, re-rendait
 * l'écran qui portait le crochet. Or il est porté par les trois écrans les
 * plus sensibles :
 *
 *   — l'ÉCRAN DE SCAN, où le natif écrit plusieurs fois par seconde
 *     (`applyLiveUpdate` : compte de murs, de portes, consigne). Chaque
 *     événement re-rendait tout l'écran, caméra comprise, pendant que le
 *     téléphone se bat déjà pour suivre le LiDAR ;
 *   — l'ACCUEIL, re-rendu par n'importe quelle écriture — y compris
 *     chacune des images du tracé au doigt ;
 *   — la page caméra.
 *
 * Le crochet n'a pourtant RIEN à regarder : il ne rend que des commandes
 * (démarrer, mettre en pause…), et une commande lit le magasin AU MOMENT où
 * on l'appelle — `getState()` — pas à chaque écriture.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => undefined),
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(async () => ({ walls: [], openings: [], objects: [] })),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useRoomScan } from '../src/native/useRoomScan';
import { useScanStore } from '../src/store/scanStore';

let rendus = 0;
let commandes: ReturnType<typeof useRoomScan> | null = null;
const Sonde = () => {
  rendus++;
  commandes = useRoomScan();
  return null;
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

it('un événement du scan ne re-rend pas l’écran qui porte les commandes', () => {
  rendus = 0;
  act(() => {
    arbre = TestRenderer.create(<Sonde />);
  });
  const apresMontage = rendus;
  act(() => {
    /*
      LA CADENCE RÉELLE DU RELEVÉ : le natif pousse ses comptes plusieurs
      fois par seconde pendant qu'on balaie. Dix événements, dix écritures.
    */
    for (let i = 1; i <= 10; i++) {
      useScanStore.getState().applyLiveUpdate({
        wallCount: i,
        objectCount: 0,
        doorCount: 0,
        windowCount: 0,
        confidence: 'high',
      } as never);
    }
    useScanStore.getState().setInstruction('Balayez plus lentement');
  });
  expect(rendus).toBe(apresMontage);
});

it('et les commandes marchent toujours — elles lisent le magasin au moment du geste', () => {
  act(() => {
    arbre = TestRenderer.create(<Sonde />);
  });
  act(() => {
    commandes!.pause();
  });
  expect(useScanStore.getState().paused).toBe(true);
  act(() => {
    commandes!.resume();
  });
  expect(useScanStore.getState().paused).toBe(false);
});
