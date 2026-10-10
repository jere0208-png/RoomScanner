/**
 * LE MENU « POSER » COMMENCE RANGÉ.
 *
 * Relevé du patron : « lors du scan, réduis le menu Poser par défaut ». Un
 * scan commence par balayer la pièce : la pastille « Poser » attend contre le
 * bord qu'on la touche. Tant qu'elle est rangée, ni rail, ni déclencheur, ni
 * produit 3D au viseur — la caméra et la batterie sont au relevé. Et le guide
 * de la pose attend lui aussi : il s'ouvre la première fois qu'on touche
 * « Poser », là où il explique ce qu'on a sous les yeux.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import TestRenderer, { act } from 'react-test-renderer';
import { ScanScreen } from '../src/screens/ScanScreen';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = async () => {
  act(() => {
    useUsage.setState({ charge: true, modeElec: true, choisi: true });
    useScanStore.getState().reset();
    useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false });
  });
  (RoomScan.choisirAuViseur as jest.Mock).mockClear();
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ScanScreen />);
  });
  arbre = t;
  // Le guide demande au stockage s'il a été lu : on laisse la réponse arriver.
  await act(async () => {
    await Promise.resolve();
  });
  return t;
};

const libelles = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(TouchableOpacity).map((n) => String(n.props.accessibilityLabel ?? ''));
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join(' | ');

describe('le menu « Poser » du scan', () => {
  it('commence rangé : la pastille attend, sans rail ni viseur', async () => {
    const t = await monter();
    expect(libelles(t)).toContain('Afficher la pose');
    expect(libelles(t).some((l) => l.startsWith('Choisir '))).toBe(false);
    expect(libelles(t).some((l) => l.startsWith('Poser '))).toBe(false);
    // Rien ne flotte au viseur tant qu'on balaie.
    expect(RoomScan.choisirAuViseur).not.toHaveBeenCalledWith('prise');
  });

  it('s’ouvre d’un appui, et le guide de la pose ne vient qu’à ce moment-là', async () => {
    const t = await monter();
    // Pas de guide au démarrage du scan…
    expect(textes(t)).not.toMatch(/Passer l’explication/);
    const ouvrir = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Afficher la pose')!;
    act(() => ouvrir.props.onPress());
    expect(libelles(t).filter((l) => l.startsWith('Choisir ')).length).toBeGreaterThanOrEqual(8);
    expect(RoomScan.choisirAuViseur).toHaveBeenLastCalledWith('prise');
    // … il s'ouvre la première fois qu'on touche « Poser ».
    const passer = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === 'Passer l’explication',
    );
    expect(passer.length).toBeGreaterThan(0);
  });
});
