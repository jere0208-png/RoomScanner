/**
 * CE QUE LE SCAN DIT D'UNE PIÈCE — et que l'application dit désormais.
 *
 * Relevé du patron : « cherche des améliorations à apporter au scan, qu'il
 * peut apporter ensuite à notre app en termes d'informations sur les pièces
 * scannées ; améliore au maximum le natif ».
 *
 * Ce banc tient :
 *   — LE NATIF MESURE LE VOLUME : le sol et la hauteur sous plafond, carreau
 *     par carreau, lus dans le maillage LiDAR classé ; il livre les sols de
 *     RoomPlan (iOS 17) et la place du mur de chaque photo ;
 *   — LE PLAFOND D'UNE PIÈCE : plat, rampant (et sa surface habitable, loi
 *     Carrez), ou trop peu vu pour en rien dire ;
 *   — LE SOL DE ROOMPLAN, LES PHOTOS RETROUVÉES PAR LEUR PLACE ;
 *   — LE BORD DE LA BAIGNOIRE COMPTÉ AU-DESSUS DU VRAI SOL ;
 *   — LES CIRCUITS QU'APPELLENT LES APPAREILS RECONNUS, ET L'EXPOSITION ;
 *   — LA FIN DU SCAN qui enregistre tout cela sur chaque pièce, et la fiche
 *     qui le montre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ObjectData, SurfaceData, VolumeReleve } from 'react-native-room-scan';
import {
  circuitsDesAppareils,
  ficheDeLaPiece,
  plafondDeLaPiece,
  solReleveDe,
} from '../src/geometry/fichePiece';
import { photosDesMurs } from '../src/geometry/photosAuto';
import { wetZones } from '../src/geometry/volumes';
import { solDesMurs, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';
import { FichePieceSheet } from '../src/screens/result/FichePieceSheet';
import type { Fixture } from '../src/geometry/electrical';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** Une pièce de 4 × 3 m, de (0,0) à (4,3). */
const CONTOUR = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
  { x: 0, z: 3 },
];

/** Un relevé de plafond : `h(x, z)` en mètres, sur la pièce (0 : pas vu). */
const releve = (h: (x: number, z: number) => number): VolumeReleve => {
  const pas = 0.25;
  const cols = 16;
  const rows = 12;
  const plafond: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) plafond.push(Math.round(h((c + 0.5) * pas, (r + 0.5) * pas) * 100));
  }
  return { sol: -1.3, pas, minX: 0, minZ: 0, cols, rows, plafond };
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId = 'room-1'): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

describe('le natif mesure ce que RoomPlan ne dit pas', () => {
  it('le volume se lit dans le maillage classé : le sol, puis le plafond carreau par carreau', () => {
    const m = lire('modules/react-native-room-scan/ios/RoomScanMaillage.swift');
    expect(m).toContain('static func accumuler(');
    expect(m).toContain('guard k == 2 || k == 3');
    expect(m).toContain('"plafond": hauteurs');
    expect(m).toContain('out["volume"] = v');
  });

  it('les sols de RoomPlan (iOS 17) partent avec leur polygone exact', () => {
    const m = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(m).toContain('static func solsDe(_ room: CapturedRoom)');
    expect(m).toContain('sol.polygonCorners');
    expect(m).toContain('"sols": sols,');
  });

  it('chaque photo de mur emporte la place de son mur', () => {
    const m = lire('modules/react-native-room-scan/ios/RoomScanPhotoMur.swift');
    expect(m).toContain('"cx": m.milieu.x');
    expect(m).toContain('"longueur": m.longueur');
  });
});

describe('le plafond d’une pièce', () => {
  it('plat : sa hauteur, sans rampant', () => {
    const p = plafondDeLaPiece(releve(() => 2.5), CONTOUR, 12)!;
    expect(p.hMoy).toBeCloseTo(2.5, 2);
    expect(p.rampant).toBe(false);
    expect(p.couverture).toBeCloseTo(1, 1);
  });

  it('rampant : de 1 m à 2,6 m, et la surface où l’on tient debout', () => {
    // Le plafond monte de 1,0 m (x = 0) à 2,6 m (x = 4) : debout dès x = 2.
    const p = plafondDeLaPiece(releve((x) => 1 + 0.4 * x), CONTOUR, 12)!;
    expect(p.rampant).toBe(true);
    expect(p.hMin).toBeLessThan(1.3);
    expect(p.hMax).toBeGreaterThan(2.3);
    // La moitié de la pièce est sous 1,80 m.
    expect(p.surfaceHabitable!).toBeGreaterThan(5);
    expect(p.surfaceHabitable!).toBeLessThan(7);
  });

  it('trop peu vu : on ne dit rien de sa forme', () => {
    // Seul un coin d'un mètre carré a été vu, et il descend.
    const p = plafondDeLaPiece(releve((x, z) => (x < 1 && z < 1 ? 1 + x : 0)), CONTOUR, 12)!;
    expect(p.rampant).toBe(false);
    expect(p.surfaceHabitable).toBeNull();
    // Et sans relevé du tout, pas de plafond.
    expect(plafondDeLaPiece(null, CONTOUR, 12)).toBeNull();
  });
});

describe('ce que le scan livrait sans qu’on s’en serve', () => {
  it('le sol de RoomPlan : sa surface exacte, dans la pièce qui le contient', () => {
    expect(solReleveDe([{ coins: [0, 0, 4, 0, 4, 3, 0, 3] }], CONTOUR)).toBeCloseTo(12, 2);
    expect(solReleveDe([{ coins: [10, 10, 12, 10, 12, 12] }], CONTOUR)).toBeNull();
  });

  it('une photo dont le mur a changé de nom se retrouve par sa place', () => {
    const photos = photosDesMurs(
      [{ wallId: 'disparu', path: '/p.jpg', cote: 1, at: 1, cx: 2, cz: 0, dx: 1, dz: 0, longueur: 4 }],
      [] as SurfaceData[],
      MURS,
    );
    expect(photos.map((p) => p.wallId)).toEqual(['n']);
  });

  it('le bord de la baignoire se compte au-dessus du VRAI sol', () => {
    // Le sol du relevé est à −1,30 m (le repère de la session) : la
    // baignoire de 55 cm a son centre à −1,025 m.
    const baignoire = {
      category: 'bathtub',
      width: 1.7,
      depth: 0.7,
      height: 0.55,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, -1.025, 1, 1],
    };
    const murs = MURS.map((w) => ({ ...w, yCenter: -1.3 + 1.25 }));
    expect(solDesMurs(murs)).toBeCloseTo(-1.3, 5);
    expect(wetZones([baignoire], solDesMurs(murs))[0].rim).toBeCloseTo(0.55, 3);
    // Sans le sol, le bord retombait à dix centimètres.
    expect(wetZones([baignoire])[0].rim).toBeCloseTo(0.1, 3);
  });
});

const objet = (id: string, category: string, x: number, z: number): ObjectData => ({
  id,
  category,
  width: 0.6,
  height: 0.85,
  depth: 0.6,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.425, z, 1],
});

describe('les appareils appellent leur circuit', () => {
  it('un four contre le mur nord : sa prise 20 A, derrière lui, au droit de son centre', () => {
    const [c] = circuitsDesAppareils([objet('f', 'oven', 1.5, 0.35)], MURS, [], MURS);
    expect(c.kind).toBe('prise20');
    expect(c.appareil).toBe('Four');
    expect(c.pose?.wallId).toBe('n');
    expect(c.pose?.along).toBeCloseTo(1.5, 2);
    expect(c.deja).toBe(false);
  });

  it('une plaque appelle sa sortie 32 A ; un lave-vaisselle déjà équipé ne demande rien', () => {
    const prise: Fixture = { id: 'p', kind: 'prise20', wallId: 'e', along: 1, height: 0.3, side: 1 };
    const cs = circuitsDesAppareils(
      [objet('pl', 'stove', 2.5, 0.35), objet('lv', 'dishwasher', 3.65, 1)],
      MURS,
      [prise],
      MURS,
    );
    expect(cs.find((x) => x.objetId === 'pl')!.kind).toBe('sortieCable');
    expect(cs.find((x) => x.objetId === 'lv')!.appareil).toBe('Lave-vaisselle');
    expect(cs.find((x) => x.objetId === 'lv')!.deja).toBe(true);
  });
});

describe('la fiche de la pièce', () => {
  const base = {
    contour: CONTOUR,
    surface: 12,
    surfaceExacte: true,
    centre: { x: 2, z: 1.5 },
    murs: MURS,
    tousLesMurs: MURS,
    ouvertures: [
      { ...mur('f1', 1, 0, 2.2, 0), type: 'window' as const, height: 1.2, yCenter: 1.55 },
      { ...mur('p1', 0, 1, 0, 1.9), type: 'door' as const, height: 2.04, yCenter: 1.02 },
    ],
    objets: [objet('f', 'oven', 1.5, 0.35)],
    fixtures: [],
  };

  it('dit l’exposition de la fenêtre d’après le nord relevé', () => {
    // north = 0 : le relevé a commencé face au nord, qui est −z. La fenêtre
    // du mur z = 0 regarde vers −z : elle est exposée au nord.
    const f = ficheDeLaPiece({ ...base, north: 0 });
    expect(f.fenetres).toBe(1);
    expect(f.portes).toBe(1);
    expect(f.surfaceVitree).toBeCloseTo(1.44, 2);
    expect(f.expositions).toEqual([{ aire: 'nord', n: 1 }]);
    // Sans nord, on ne l'invente pas.
    expect(ficheDeLaPiece({ ...base, north: null }).expositions).toBeNull();
  });

  it('prend la hauteur mesurée, et le volume qui s’en déduit', () => {
    const plafond = plafondDeLaPiece(releve((x) => 1 + 0.4 * x), CONTOUR, 12);
    const f = ficheDeLaPiece({ ...base, north: 0, releve: { plafond } });
    expect(f.hauteurMesuree).toBe(true);
    expect(f.rampant).toBe(true);
    expect(f.surfaceHabitable).not.toBeNull();
    expect(f.volume).toBeCloseTo(12 * f.hauteur, 0);
    expect(f.equipements).toEqual([{ nom: 'Four', n: 1 }]);
  });

  it('et la feuille le montre, avec le geste qui pose le circuit', () => {
    const plafond = plafondDeLaPiece(releve((x) => 1 + 0.4 * x), CONTOUR, 12);
    const fiche = ficheDeLaPiece({ ...base, north: 0, releve: { plafond } });
    const onPoser = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<FichePieceSheet visible nom="Cuisine" fiche={fiche} onClose={() => {}} onPoser={onPoser} />);
    });
    const lu = t.root
      .findAllByType(Text)
      .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
      .join(' | ');
    expect(lu).toMatch(/Plafond rampant/);
    expect(lu).toMatch(/Surface habitable/);
    expect(lu).toMatch(/Fenêtre exposée nord/);
    const poser = t.root.findAll(
      (n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('Poser : Prise 20 A'),
      { deep: false },
    )[0];
    act(() => poser.props.onPress());
    expect(onPoser).toHaveBeenCalledWith([expect.objectContaining({ kind: 'prise20', appareil: 'Four' })]);
    act(() => t.unmount());
  });
});

describe('la fin du scan enregistre ce relevé sur chaque pièce', () => {
  it('le plafond mesuré et le sol de RoomPlan voyagent avec la pièce', () => {
    const surface = (id: string, cx: number, cz: number, length: number, alongZ = false): SurfaceData => ({
      id,
      type: 'wall',
      length,
      height: 2.5,
      transform: alongZ
        ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
        : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
    });
    act(() => {
      useScanStore.getState().finalize({
        modelPath: '',
        surfaces: [surface('n', 2, 0, 4), surface('s', 2, 3, 4), surface('o', 0, 1.5, 3, true), surface('e', 4, 1.5, 3, true)],
        objects: [],
        maillage: { ancres: 1, faces: 1, sommets: 3, classe: true, volume: releve((x) => 1 + 0.4 * x) },
        sols: [{ id: 's1', coins: [0, 0, 4, 0, 4, 3, 0, 3], y: 0 }],
      });
    });
    const piece = useScanStore.getState().rooms[0];
    expect(piece.releve?.plafond?.rampant).toBe(true);
    expect(piece.releve?.surfaceSol).toBeCloseTo(12, 1);
  });
});
