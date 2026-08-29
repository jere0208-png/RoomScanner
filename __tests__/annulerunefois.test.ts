/**
 * UN GESTE REFUSÉ NE COÛTE PAS UNE ANNULATION.
 *
 * Relevé du patron : « trouve des défauts. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ON A TROUVÉ, ET COMMENT. Sept gestes du magasin appellent
 * `pushHistory` — « retiens l'état d'avant » — PUIS renoncent, parce que le
 * mur a disparu, la pièce n'a pas de surface, les deux pièces à fusionner sont
 * la même. L'historique garde alors un point qui ne correspond à AUCUN
 * changement.
 *
 * CE QUE ÇA DONNE AU DOIGT : on touche « Annuler », il ne se passe rien. On
 * touche une seconde fois, et là ça revient en arrière. C'est l'un des rares
 * défauts qu'on ne signale jamais parce qu'on croit avoir mal appuyé — et
 * l'un des plus agaçants quand on travaille vite.
 *
 * L'HISTORIQUE NE DÉDOUBLONNE PAS, et c'est délibéré : il FUSIONNE les états
 * d'un geste continu — un mur qu'on fait glisser envoie cinquante états par
 * seconde — mais seulement ceux-là, reconnus à leur clé. Un geste discret
 * empile toujours. La correction ne peut donc pas venir de l'historique : elle
 * vient de l'ordre, la garde AVANT le point de reprise.
 *
 * ON MESURE LA CHOSE PAR OÙ ELLE SE VOIT : on fait un vrai geste, on en tente
 * un refusé, on annule UNE fois, et l'on doit être revenu avant le vrai geste.
 */
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
  RoomScanCanvas: undefined,
}));

import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';
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

const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const MEUBLE: ObjectData = {
  id: 'm1',
  category: 'sofa',
  width: 2,
  depth: 0.9,
  height: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0.4, 2, 1],
};

const st = () => useScanStore.getState();

const poser = () => {
  st().reset();
  useScanStore.setState({
    walls: MURS.map((w) => ({ ...w })),
    openings: [],
    objects: [{ ...MEUBLE, transform: [...MEUBLE.transform] }],
    rooms: [
      { id: 'r1', name: 'Séjour', floor: null, wallIds: MURS.map((w) => w.id) },
    ] as never,
    fixtures: [],
    ceiling: [],
    photos: [],
    notes: [],
  });
};

/** L'empreinte de ce qui se dessine : deux états égaux ont la même. */
const empreinte = () =>
  JSON.stringify({
    murs: st().walls,
    meubles: st().objects,
    pieces: st().rooms,
  });

beforeEach(poser);

/**
 * LE SCÉNARIO, IDENTIQUE POUR CHACUN : un vrai geste, un geste refusé, une
 * seule annulation. On doit être revenu au départ.
 */
const uneSeuleAnnulation = (refuse: () => void) => {
  const depart = empreinte();
  // Un vrai geste, qui change quelque chose.
  st().setObjectCenter('m1', 3.4, 3.1);
  expect(empreinte()).not.toBe(depart);
  // Le geste refusé : il ne change rien, il ne doit rien coûter non plus.
  refuse();
  st().undo();
  return empreinte();
};

describe('les gestes qui renoncent ne mangent pas une annulation', () => {
  it('déplacer un meuble qui n’existe plus', () => {
    /*
      LE CAS RÉEL : on touche un meuble, on ouvre son bandeau, quelqu'un le
      supprime — ou l'on revient d'un « Annuler » qui l'a emporté — et la
      poignée envoie encore un déplacement. L'identifiant ne désigne plus
      rien.
    */
    const depart = empreinte();
    expect(uneSeuleAnnulation(() => st().setObjectCenter('fantome', 1, 1))).toBe(
      depart,
    );
  });

  it('ranger un meuble qui n’existe plus', () => {
    const depart = empreinte();
    expect(uneSeuleAnnulation(() => st().rangerMeuble('fantome', 1, 1))).toBe(
      depart,
    );
  });

  it('tirer le coin d’un mur qui n’existe plus', () => {
    const depart = empreinte();
    expect(
      uneSeuleAnnulation(() => st().moveWallPoint('fantome', 'a', { x: 1, z: 1 })),
    ).toBe(depart);
  });

  it('fusionner une pièce avec elle-même', () => {
    // Deux fois la même pièce : le magasin refuse, et il a raison. Ce qu'on
    // lui reproche, c'est d'avoir d'abord pris un point de reprise.
    const depart = empreinte();
    expect(uneSeuleAnnulation(() => st().mergeRooms('r1', 'r1'))).toBe(depart);
  });

  it('scinder une pièce dont on ne connaît pas la surface', () => {
    const depart = empreinte();
    expect(uneSeuleAnnulation(() => st().splitRoom('fantome'))).toBe(depart);
  });

  it('poser un rectangle de pièce qui n’en est pas un', () => {
    /*
      Deux coins confondus : il n'y a pas de rectangle à poser. Le geste est
      possible au doigt — on pose et l'on relâche au même endroit.
    */
    const depart = empreinte();
    expect(
      uneSeuleAnnulation(() =>
        st().addRoomRect({ x: 1, z: 1 }, { x: 1, z: 1 }, 'Néant'),
      ),
    ).toBe(depart);
  });

  it('et redétecter les pièces sur un plan sans murs', () => {
    const depart = empreinte();
    const refus = () => {
      useScanStore.setState({ walls: [] });
      st().redetectRooms();
      useScanStore.setState({ walls: MURS.map((w) => ({ ...w })) });
    };
    // Le plan est remis comme avant : ce qu'on mesure, c'est l'historique.
    expect(uneSeuleAnnulation(refus)).toBe(depart);
  });
});

describe('mais un vrai geste, lui, coûte bien une annulation', () => {
  it('deux gestes, deux retours', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, ET IL PORTE TOUT. Un historique qui
      n'empilerait plus rien passerait les sept épreuves du dessus sans
      qu'aucune ne prouve quoi que ce soit — et « Annuler » ne servirait
      plus à rien.
    */
    const depart = empreinte();
    st().setObjectCenter('m1', 3.4, 3.1);
    const apresUn = empreinte();
    st().resizeObject('m1', 1.2, 0.5);
    expect(empreinte()).not.toBe(apresUn);
    st().undo();
    expect(empreinte()).toBe(apresUn);
    st().undo();
    expect(empreinte()).toBe(depart);
  });
});
