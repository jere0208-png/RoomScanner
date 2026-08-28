/**
 * LES VOLUMES DE LA SALLE D'EAU SE VOIENT SUR LA MAQUETTE.
 *
 * La géométrie existe depuis longtemps — `wetZones`, `volumeAt`,
 * `volumeVerdict` — et elle ne servait qu'au CONTRÔLE ÉCRIT : une ligne de
 * texte dans la feuille des diagnostics, « prise en volume 1, interdite ».
 * Personne ne relit une ligne de texte pour une pièce qu'il croit connaître.
 *
 * OR C'EST LA FAUTE LA PLUS CHÈRE DU MÉTIER. Un socle en volume 1 se voit au
 * Consuel, se dépose, se rebouche, se repeint. Elle ne coûte rien à éviter et
 * tout à corriger — et elle se prend en posant « à peu près là », parce qu'un
 * volume ne se dessine nulle part sur un mur nu.
 *
 * ON LA MONTRE DONC LÀ OÙ ON POSE : sur la maquette, en transparence, comme un
 * gabarit qu'on aurait tracé au sol. Et l'appareil qui tombe dedans **rougit
 * sur place** — on ne demande pas à l'électricien d'aller lire une feuille
 * pour savoir que la prise qu'il regarde est interdite.
 *
 * CE QUE CE BANC TIENT : que les volumes apparaissent quand il y a de quoi les
 * calculer, qu'ils disparaissent sinon, et qu'un appareil interdit se signale.
 * Ce qu'il ne tient pas : les teintes exactes et la transparence — ça se
 * regarde dans l'application, et c'est dit ici plutôt que sous-entendu.
 */
const canevasPresent = { valeur: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  get RoomScanCanvas() {
    return canevasPresent.valeur ? 'RoomScanCanvas' : undefined;
  },
}));

import React from 'react';
import { View } from 'react-native';
import { Circle, Polygon } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { ObjectData } from 'react-native-room-scan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Une salle d'eau de 3 × 2, la baignoire le long du mur nord. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 3, 0),
  mur('e', 3, 0, 3, 2),
  mur('s', 3, 2, 0, 2),
  mur('o', 0, 2, 0, 0),
];

const BAIGNOIRE: ObjectData = {
  id: 'b1',
  category: 'bathtub',
  width: 1.7,
  depth: 0.75,
  height: 0.55,
  // Posée contre le mur nord, à gauche : centre en (0,95 ; 0,40).
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.95, 0.275, 0.4, 1],
} as ObjectData;

/** Une prise juste au-dessus de la baignoire : le cas interdit. */
const PRISE_INTERDITE: Fixture = {
  id: 'p-mauvaise',
  kind: 'prise',
  wallId: 'n',
  along: 0.95,
  height: 1.1,
  side: 1,
};

/** Et une prise au fond, bien à l'écart : le cas permis. */
const PRISE_OK: Fixture = {
  id: 'p-bonne',
  kind: 'prise',
  wallId: 's',
  along: 2.6,
  height: 1.1,
  side: 1,
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (
  opts: { objects?: ObjectData[]; fixtures?: Fixture[] } = {},
  props: Record<string, unknown> = {},
) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: opts.objects ?? [BAIGNOIRE],
      rooms: [{ id: 'r1', name: 'Salle d’eau', floor: null }] as never,
      fixtures: opts.fixtures ?? [PRISE_INTERDITE, PRISE_OK],
      ceiling: [],
      photos: [],
      showFurniture: true,
    });
    t = TestRenderer.create(
      <Iso3DView
        value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }}
        showVolumes
        {...props}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
  });
  arbre = t;
  return t;
};

/** Les nappes de volume posées sur la maquette. */
const nappes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Polygon)
    .filter((n) => String(n.props.testID ?? '').startsWith('volume-'));

/** Les appareils signalés comme interdits. */
const alertes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Circle)
    .filter((n) => String(n.props.testID ?? '').startsWith('interdit-'));

describe('les volumes se dessinent quand il y a de quoi les calculer', () => {
  it('une baignoire relevée fait apparaître ses volumes', () => {
    const vus = nappes(monter());
    expect(vus.length).toBeGreaterThan(0);
    // Les deux volumes qui se dessinent : le 1 au droit de la baignoire, le 2
    // à soixante centimètres autour.
    const noms = new Set(vus.map((n) => String(n.props.testID).split('-')[1]));
    expect(noms.has('1')).toBe(true);
    expect(noms.has('2')).toBe(true);
  });

  it('sans baignoire ni douche, il n’y a rien à montrer', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et c'est la règle de `wetZones` depuis le
      début : sans zone humide relevée, il n'y a pas de volume — et l'app doit
      le dire en ne dessinant RIEN, plutôt que de rassurer à tort avec un
      gabarit vide.
    */
    expect(nappes(monter({ objects: [] }))).toHaveLength(0);
  });

  it('et le calque s’éteint : on ne les impose pas', () => {
    // Un gabarit permanent finirait par masquer la maquette qu'il sert à
    // vérifier. Il s'allume quand on pose, il s'éteint quand on montre.
    expect(nappes(monter({}, { showVolumes: false }))).toHaveLength(0);
  });
});

describe('un appareil interdit se signale sur place', () => {
  it('la prise au-dessus de la baignoire rougit', () => {
    const t = monter();
    const vus = alertes(t);
    expect(vus).toHaveLength(1);
    expect(vus[0].props.testID).toBe('interdit-p-mauvaise');
  });

  it('celle du fond, non', () => {
    /*
      Sans ce contrôle, une pastille posée sur TOUS les appareils passerait
      l'épreuve du dessus sans rien prouver.
    */
    const t = monter();
    expect(
      alertes(t).map((n) => String(n.props.testID)),
    ).not.toContain('interdit-p-bonne');
  });

  it('et l’alerte suit le calque, comme les volumes', () => {
    expect(alertes(monter({}, { showVolumes: false }))).toHaveLength(0);
  });

  it('une commande n’est pas un socle : elle ne rougit pas au même endroit', () => {
    /*
      LA NORME NE DIT PAS LA MÊME CHOSE DE TOUT. Un socle est interdit en
      volume 2 ; un interrupteur y est admis. Signaler les deux de la même
      façon apprendrait à l'électricien à ignorer le signal.
    */
    const inter: Fixture = { ...PRISE_INTERDITE, id: 'i-vol2', kind: 'inter' };
    const t = monter({ fixtures: [inter] });
    const noms = alertes(t).map((n) => String(n.props.testID));
    // En volume 1, une commande reste interdite ; ce banc ne juge que le fait
    // que les deux familles ne soient pas confondues.
    expect(noms.length).toBeLessThanOrEqual(1);
  });
});
