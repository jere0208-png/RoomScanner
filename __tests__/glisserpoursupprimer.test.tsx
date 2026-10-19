/**
 * LE GLISSÉ NE JETTE JAMAIS À LUI SEUL — relevé du patron : « le glisser pour
 * voir Supprimer est trop capricieux et rapide sur le listing des plans ;
 * qu'on ne puisse pas juste glisser pour supprimer directement, mais qu'on
 * propose le Supprimer ». Et, dans la chambre de l'appartement de test, le
 * coffrage qui rentrait dans un mur d'un côté et laissait un jour de l'autre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  DEPART_DU_GLISSE,
  GlisserPourSupprimer,
  OUVERT,
  placeAuDoigt,
  poseAuLacher,
} from '../src/components/GlisserPourSupprimer';
import { useScanStore } from '../src/store/scanStore';
import { empriseDuCaisson } from '../src/geometry/caisson';
import { clampFootprint, facesDesMurs, roomParts, toFootprint } from '../src/geometry/floorplan';

describe('le glissé de la liste des plans', () => {
  it('un glissé long ou très vif offre la corbeille, il ne jette pas', () => {
    expect(poseAuLacher(placeAuDoigt(0, -400), -3)).toBe(OUVERT);
    expect(poseAuLacher(placeAuDoigt(0, -1000), -8)).toBe(OUVERT);
  });

  it('au-delà de la corbeille, la carte résiste comme un élastique', () => {
    expect(placeAuDoigt(0, -400)).toBeGreaterThan(-200);
    expect(placeAuDoigt(0, -400)).toBeLessThan(OUVERT);
    // Elle suit le doigt un peu moins vite que lui.
    expect(placeAuDoigt(0, -50)).toBeGreaterThan(-50);
  });

  it('un petit glissé se referme ; un glissé franc ouvre', () => {
    expect(poseAuLacher(placeAuDoigt(0, -40), -0.2)).toBe(0);
    expect(poseAuLacher(placeAuDoigt(0, -90), -0.2)).toBe(OUVERT);
    // Une ligne ouverte, ramenée vers la droite, se referme.
    expect(poseAuLacher(placeAuDoigt(OUVERT, 60), 0.4)).toBe(0);
  });

  it('le geste ne démarre qu’à un vrai glissé horizontal', () => {
    expect(DEPART_DU_GLISSE).toBeGreaterThanOrEqual(16);
  });

  it('seule la corbeille touchée jette', () => {
    const jeter = jest.fn();
    jest.useFakeTimers();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GlisserPourSupprimer libelle="Salon Dupont" onSupprimer={jeter}>
          {() => <Text>Salon Dupont</Text>}
        </GlisserPourSupprimer>,
      );
    });
    const corbeille = t.root.find((n) => n.props.accessibilityLabel === 'Supprimer Salon Dupont' && typeof n.props.onPress === 'function');
    act(() => corbeille.props.onPress());
    act(() => jest.advanceTimersByTime(500));
    expect(jeter).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
    jest.useRealTimers();
  });
});

describe('le coffrage de la chambre', () => {
  it('reste de nu à nu à l’affichage, sur chacun de ses murs', () => {
    const st = () => useScanStore.getState();
    act(() => st().ouvrirExemple());
    const ch = st().rooms.find((r) => r.name === 'Chambre')!;
    const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === ch.id)!;
    const faces = facesDesMurs(st().walls);
    for (const w of part.walls) {
      let id: string | null = null;
      act(() => {
        id = st().ajouterCaisson(w.id, ch.id);
      });
      if (!id) continue;
      const c = st().objects.find((o) => o.id === id)!;
      const avant = toFootprint(c);
      const apres = clampFootprint(avant, part.walls, part.labelAt, undefined, undefined, faces, part.surface?.pts);
      expect(apres.cx).toBeCloseTo(avant.cx, 6);
      expect(apres.cz).toBeCloseTo(avant.cz, 6);
      expect(apres.width).toBeCloseTo(avant.width, 6);
      // Et l'emprise est bien celle de la chambre au nu (5,07 → 8 ; 0 → 3,53).
      for (const p of empriseDuCaisson(c)) {
        expect(p.x).toBeGreaterThanOrEqual(5.07 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(8 + 1e-6);
      }
      act(() => st().undo());
    }
  });
});
