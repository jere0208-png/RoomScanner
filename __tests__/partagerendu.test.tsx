/**
 * LA PIÈCE SORT DE L'APPLICATION — revue « découvreurs » (agente
 * immobilière, influenceuse déco, designer) : « la vue de la pièce dans
 * Décorer est la plus belle image de l'app, et elle ne peut pas sortir » ;
 * « impossible de faire une photo pendant la visite ».
 *
 *   — « Décorer » porte un bouton « Partager » ; la visite, un appareil photo ;
 *   — deux appuis : une capture, un partage ;
 *   — le temps de la capture, la pièce de « Décorer » ne tourne plus, posée
 *     de trois quarts, dans un cadre carré (4:3 à la demande) ;
 *   — la vue native (Metal, que la capture rend noire) laisse la place au
 *     rendu en JavaScript, dans « Décorer » comme dans la visite ;
 *   — « Image prête » se dit dans la fenêtre, et le logo signe l'image gratuite.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => false),
    shareFile: jest.fn(async () => true),
    takePhoto: jest.fn(async () => null),
    readPhoto: jest.fn(async () => null),
    deletePhotos: jest.fn(async () => 0),
  },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  // Le doublet de la vue SceneKit : la 3D passe par le natif, comme sur l'iPhone.
  RoomScanVisite: 'RoomScanVisite',
  poserCameraDeVisite: jest.fn(() => true),
  poserOrbiteDeMaquette: jest.fn(() => false),
  poserLeveeDeMaquette: jest.fn(() => false),
}));

import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { captureRef } from 'react-native-view-shot';
import { RoomScan } from 'react-native-room-scan';
import { DecorSheet, VUE_PHOTO } from '../src/components/DecorSheet';
import { Exploration } from '../src/components/Exploration';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { useAlerte } from '../src/ui/alerte';
import { tailleDeCapture } from '../src/ui/partageRendu';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const capturer = captureRef as unknown as jest.Mock;
const partager = RoomScan.shareFile as unknown as jest.Mock;

let arbre: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  capturer.mockReset();
  capturer.mockImplementation(async () => 'file:///tmp/capture.png');
  partager.mockClear();
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: i === 0 ? 'Séjour' : `Pièce ${i + 1}`, floor: null })),
      fixtures: [],
      ceiling: [],
    });
  });
});
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function monterDecor() {
  let t!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    t = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale={SNAPSHOT_ROOMS[0].id} />);
  });
  arbre = t;
  return t;
}
const boutonPartager = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll(
    (n) => n.props?.accessibilityLabel === 'Partager une image de la pièce' && typeof n.props?.onPress === 'function',
  )[0];
const apercu = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Iso3DView)[0];
/** Laisse passer les images d'écran et les promesses de la capture. */
async function laisserFiler(ms = 200) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

describe('« Décorer » : partager la pièce', () => {
  it('un bouton « Partager » dans l’en-tête, à côté d’« Annuler »', async () => {
    const t = await monterDecor();
    expect(boutonPartager(t)).toBeTruthy();
    expect(t.root.findAll((n) => n.props?.accessibilityLabel === 'Annuler le dernier changement').length).toBeGreaterThan(0);
  });

  it('deux appuis : une capture, un partage, et « Image prête »', async () => {
    const t = await monterDecor();
    act(() => {
      boutonPartager(t).props.onPress();
      boutonPartager(t).props.onPress();
    });
    await laisserFiler();
    expect(capturer).toHaveBeenCalledTimes(1);
    expect(partager).toHaveBeenCalledTimes(1);
    expect(partager).toHaveBeenCalledWith('file:///tmp/capture.png');
    // Haute définition : une image PNG, pleine qualité, en fichier.
    expect(capturer.mock.calls[0][1]).toMatchObject({ format: 'png', quality: 1, result: 'tmpfile' });
    expect(t.root.findAll((n) => n.props?.testID === 'image-prete').length).toBeGreaterThan(0);
  });

  it('pendant la capture : la rotation est figée de trois quarts, et le rendu de secours est utilisé', async () => {
    const t = await monterDecor();
    // La capture reste en suspens : on regarde l'écran pendant qu'elle dure.
    let finir!: (uri: string) => void;
    capturer.mockImplementation(() => new Promise<string>((r) => (finir = r)));
    // La pièce tourne d'abord, seule.
    await laisserFiler(4000);
    expect(apercu(t).props.gpu).toBe(true);
    expect(apercu(t).props.value.theta).not.toBe(VUE_PHOTO.theta);
    const avant = apercu(t).props.value.theta;

    act(() => boutonPartager(t).props.onPress());
    expect(apercu(t).props.gpu).toBe(false);
    expect(apercu(t).props.value).toEqual(VUE_PHOTO);
    // Le temps passe, la capture dure : la pièce ne bouge pas.
    await laisserFiler(3000);
    expect(capturer).toHaveBeenCalledTimes(1);
    expect(apercu(t).props.value.theta).toBe(VUE_PHOTO.theta);
    expect(apercu(t).props.gpu).toBe(false);
    // Un fond propre : la pastille d'ambiance n'est pas dans l'image, le logo si.
    expect(t.root.findAll((n) => n.props?.testID === 'logo-photo-decor').length).toBeGreaterThan(0);
    // Le cadre est carré.
    const cadre = t.root.find((n) => n.props?.testID === 'cadre-photo-decor' && n.props?.collapsable === false);
    const style = StyleSheet.flatten(cadre.props.style);
    expect(style.aspectRatio ?? 1).toBe(1);

    await act(async () => {
      finir('file:///tmp/capture.png');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(partager).toHaveBeenCalledTimes(1);
    // La photo prise, la maquette native revient, et la pièce reprend son tour d'où elle était.
    expect(apercu(t).props.gpu).toBe(true);
    expect(apercu(t).props.value.theta).toBeCloseTo(avant, 0);
    await laisserFiler(1000);
    expect(apercu(t).props.value.theta).not.toBe(avant);
  });

  it('l’appui long propose le paysage 4:3 (annonce immobilière)', async () => {
    const t = await monterDecor();
    act(() => boutonPartager(t).props.onLongPress());
    const courante = useAlerte.getState().courante;
    expect(courante?.actions?.map((a) => a.label)).toEqual(['Carré · réseaux sociaux', 'Paysage 4:3 · annonce']);
    capturer.mockImplementation(() => new Promise<string>(() => {}));
    act(() => courante!.actions![1].onPress!());
    const cadre = t.root.find((n) => n.props?.testID === 'cadre-photo-decor' && n.props?.collapsable === false);
    const style = StyleSheet.flatten(cadre.props.style);
    if (style.aspectRatio != null) expect(style.aspectRatio).toBeCloseTo(4 / 3);
    else expect(typeof style.height).toBe('number');
    act(() => useAlerte.setState({ courante: null, file: [] }));
  });
});

describe('la visite : l’appareil photo', () => {
  async function monterVisite() {
    let t!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      t = TestRenderer.create(<Exploration visible onClose={jest.fn()} />);
    });
    arbre = t;
    return t;
  }
  const boutonPhoto = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Prendre une photo de la visite' && typeof n.props?.onPress === 'function',
    )[0];

  it('un rond en bas, avec son libellé', async () => {
    const t = await monterVisite();
    expect(boutonPhoto(t)).toBeTruthy();
  });

  it('deux appuis : une capture, un partage', async () => {
    const t = await monterVisite();
    // Deux appuis coup sur coup, avant que le bouton ne quitte l'écran.
    const b = boutonPhoto(t);
    act(() => {
      b.props.onPress();
      b.props.onPress();
    });
    await laisserFiler();
    expect(capturer).toHaveBeenCalledTimes(1);
    expect(partager).toHaveBeenCalledTimes(1);
    expect(t.root.findAll((n) => n.props?.testID === 'image-prete').length).toBeGreaterThan(0);
  });

  it('la vue native laisse la place au rendu en JavaScript le temps de la capture', async () => {
    const t = await monterVisite();
    // Avant : la vue SceneKit seule, pas de vue en JavaScript.
    expect(t.root.findAll((n) => (n.type as unknown) === 'RoomScanVisite').length).toBeGreaterThan(0);
    expect(t.root.findAllByType(Iso3DView)).toHaveLength(0);
    let finir!: (uri: string) => void;
    capturer.mockImplementation(() => new Promise<string>((r) => (finir = r)));
    act(() => boutonPhoto(t).props.onPress());
    const secours = t.root.findAllByType(Iso3DView);
    expect(secours).toHaveLength(1);
    expect(secours[0].props.gpu).toBe(false);
    expect(secours[0].props.pov).toBeTruthy();
    await laisserFiler();
    expect(capturer).toHaveBeenCalledTimes(1);
    await act(async () => {
      finir('file:///tmp/capture.png');
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(t.root.findAllByType(Iso3DView)).toHaveLength(0);
    expect(boutonPhoto(t)).toBeTruthy();
  });
});

describe('la haute définition', () => {
  it('1080 pixels au moins sur le petit côté, sans réduire une vue déjà assez grande', () => {
    // Écran à double densité : 375 points = 750 pixels → on rend plus grand.
    const deux = tailleDeCapture(375, 375, 2)!;
    expect(deux.width * 2).toBeGreaterThanOrEqual(1080);
    expect(deux.width).toBe(deux.height);
    // Écran à triple densité : 393 × 3 = 1179 pixels, déjà assez.
    expect(tailleDeCapture(393, 852, 3)).toEqual({ width: 393, height: 852 });
    // Le 4:3 garde son rapport.
    const p = tailleDeCapture(360, 270, 2)!;
    expect(p.width / p.height).toBeCloseTo(4 / 3, 2);
    expect(tailleDeCapture(0, 100, 3)).toBeNull();
  });
});
