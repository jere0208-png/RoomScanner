/**
 * LA 3D À L'IDENTIQUE DU RELEVÉ — vraies images des murs et du sol, meubles
 * à leurs mesures et à leurs couleurs.
 *
 * Relevé du patron : « améliore considérablement la récupération des
 * textures et couleurs des sols et murs scannés ; on veut une reproduction à
 * l'identique, sur le modèle 3D, de ce que l'on scanne. Fais aussi un système
 * qui recopie les meubles détectés et les transforme dans leur forme 3D aux
 * mesures respectées. »
 *
 * Ce banc tient :
 *   — LE NATIF FABRIQUE LES ORTHOPHOTOS : chaque face de mur vue de face, le
 *     sol vu d'en haut, la profondeur LiDAR pour écarter ce qui est caché ;
 *     la vue 3D native sait poser une image sur une face ;
 *   — LE RATTACHEMENT au plan (par la place), les TRANCHES disjointes, les
 *     coordonnées d'image ;
 *   — LA SCÈNE : les pans habillés, pas les menuiseries ni un côté repeint ;
 *     les flux de la visite et de la maquette ;
 *   — LA FIN DU SCAN qui rattache tout et montre les couleurs ;
 *   — LES MEUBLES : le dessus et les côtés relevés, les vraies cotes.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-test-renderer';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import {
  habillerLaFace,
  habillerLeSol,
  habillerLesMurs,
  type OrthoDeMurBrute,
} from '../src/geometry/habillage';
import { buildScene, type Face3D, type ScenePalette } from '../src/geometry/scene3d';
import { maillageDeLaVisite } from '../src/geometry/visite3d';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { modeleDe } from '../src/geometry/modeles3d';
import type { WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

/** L'orthophoto du mur nord vue de l'intérieur (z > 0) : l'axe z RoomPlan pointe vers +z. */
const orthoNord = (path = '/ortho-n.jpg', cx = 2, longueur = 4): OrthoDeMurBrute => ({
  wallId: 'rp-n',
  cote: 1,
  path,
  cx,
  cz: 0,
  dx: 1,
  dz: 0,
  longueur,
  hauteur: 2.5,
  yBas: -1.3,
});

describe('le natif fabrique les vraies images', () => {
  it('chaque face de mur et le sol, projetés dans la caméra, la profondeur LiDAR décide', () => {
    const o = lire('modules/react-native-room-scan/ios/RoomScanOrtho.swift');
    expect(o).toContain('final class OrthophotosDuReleve');
    expect(o).toContain('guard mesure > 0.05, abs(mesure - z) < 0.08 else { continue }');
    expect(o).toContain('ortho-mur-');
    expect(o).toContain('ortho-sol-');
    const m = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(m).toContain('sortie["orthos"] = OrthophotosDuReleve.shared.livrer()');
    expect(m).toContain('OrthophotosDuReleve.shared.update(room: room)');
  });

  it('la vue 3D native pose une image sur une face', () => {
    const v = lire('modules/react-native-room-scan/ios/RoomScanVisite.swift');
    expect(v).toContain('didSet { if texturees != oldValue { rebatir() } }');
    expect(v).toContain('SCNGeometrySource(textureCoordinates: uvs)');
    expect(v).toContain('m.diffuse.contents = image');
    const pont = lire('modules/react-native-room-scan/ios/RoomScan.m');
    expect(pont).toContain('RCT_EXPORT_VIEW_PROPERTY(texturees, NSArray)');
  });

  it('le dessus et les côtés d’un meuble, chacun sa couleur ; le modèle exporté n’est plus noir', () => {
    const t = lire('modules/react-native-room-scan/ios/RoomScanTexture.swift');
    expect(t).toContain('acc.add(k == 0 ? 0 : 1, c)');
    expect(t).toContain('func couleurs(for o: CapturedRoom.Object)');
    const m = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(m).not.toMatch(/c\.x \/ 255/);
  });
});

describe('le rattachement au plan', () => {
  it('l’orthophoto rejoint son mur et sa face, par sa place', () => {
    const [n] = habillerLesMurs(MURS, [orthoNord()]);
    expect(n.orthos).toHaveLength(1);
    // Le mur nord va de x = 0 à x = 4 ; sa face +1 regarde vers +z, la pièce.
    expect(n.orthos![0].side).toBe(1);
    expect(n.orthos![0].ux).toBeCloseTo(1, 6);
  });

  it('un passage de plus ajoute ses images à celles d’avant', () => {
    const une = habillerLesMurs(MURS, [orthoNord('/a.jpg')]);
    const deux = habillerLesMurs(une, [orthoNord('/b.jpg')]);
    expect(deux[0].orthos!.map((o) => o.path)).toEqual(['/a.jpg', '/b.jpg']);
  });
});

const pan = (w: WallSeg, side: 1 | -1): Face3D => ({
  pts: [
    { x: 0, y: 0, z: 0.07 * side },
    { x: 4, y: 0, z: 0.07 * side },
    { x: 4, y: 2.5, z: 0.07 * side },
    { x: 0, y: 2.5, z: 0.07 * side },
  ],
  fill: '#FFFFFF',
  stroke: null,
  normal: { x: 0, y: 0, z: side },
  wallId: w.id,
});

describe('l’habillage d’une face', () => {
  it('chaque sommet reçoit sa place dans l’image : u de gauche à droite, v du haut vers le bas', () => {
    const [n] = habillerLesMurs(MURS, [orthoNord()]);
    const [piece] = habillerLaFace(pan(n, 1), n)!;
    const uv = (x: number, y: number) => piece.uv[piece.pts.findIndex((p) => p.x === x && p.y === y)];
    expect(uv(0, 2.5)).toEqual([0, 0]);
    expect(uv(4, 0)).toEqual([1, 1]);
    // L'autre face du mur n'a pas d'image : elle garde son aplat.
    expect(habillerLaFace(pan(n, -1), n)).toBeNull();
  });

  it('deux images sur une face se partagent le mur en tranches disjointes', () => {
    const [n] = habillerLesMurs(MURS, [orthoNord('/g.jpg', 1.1, 2.2), orthoNord('/d.jpg', 2.9, 2.2)]);
    const pieces = habillerLaFace(pan(n, 1), n)!;
    expect(pieces.map((p) => p.cle)).toEqual(['/g.jpg', '/d.jpg']);
    const xs = (k: number) => pieces[k].pts.map((p) => p.x);
    // Elles se recouvrent de 1,8 à 2,2 : la couture tombe au milieu, à 2,0.
    expect(Math.max(...xs(0))).toBeCloseTo(2, 6);
    expect(Math.min(...xs(1))).toBeCloseTo(2, 6);
  });

  it('le sol prend son image par ses bornes', () => {
    const [piece] = habillerLeSol(
      [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 0, z: 3 },
      ],
      { path: '/sol.jpg', minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
    )!;
    expect(piece.uv).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });
});

describe('la scène et ses flux', () => {
  const murs = () => habillerLesMurs(MURS, [orthoNord()]);
  const scene = (o: { peintures?: Record<string, string>; showTextures?: boolean } = {}) =>
    buildScene(murs(), [], [], {
      palette: PAL,
      showSurfaces: true,
      showTextures: o.showTextures ?? true,
      rooms: [{ id: 'r1' }],
      floors: { r1: { color: '#B08A5A', ortho: { path: '/sol.jpg', minX: -1, minZ: -1, maxX: 5, maxZ: 4 } } },
      peintures: o.peintures,
    });

  it('le pan intérieur du mur nord et le sol portent leur image ; la visite les envoie au natif', () => {
    const s = scene();
    expect(s.faces.some((f) => f.wallId === 'n' && f.habillage)).toBe(true);
    expect(s.faces.some((f) => f.isFloor && f.habillage)).toBe(true);
    const v = maillageDeLaVisite(s.faces);
    expect(v.textures.sort()).toEqual(['/ortho-n.jpg', '/sol.jpg']);
    expect(v.texturees.length % 16).toBe(0);
    expect(v.texturees.length).toBeGreaterThan(0);
    // Le maillage teinté perd les faces habillées.
    const sansImages = maillageDeLaVisite(scene({ showTextures: false }).faces);
    expect(sansImages.texturees).toEqual([]);
    expect(v.maillage.length).toBeLessThan(sansImages.maillage.length);
  });

  it('un côté repeint garde sa peinture ; la maquette n’habille pas l’écorché', () => {
    expect(scene({ peintures: { r1: '#5B8C5A' } }).faces.some((f) => f.wallId === 'n' && f.habillage)).toBe(false);
    const m = maillageDeLaMaquette(scene().faces);
    expect(m.textures).toContain('/ortho-n.jpg');
    expect(m.texturees.length % 16).toBe(0);
  });
});

describe('la fin du scan', () => {
  it('rattache les orthophotos, l’image du sol, et ouvre les couleurs', () => {
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
        orthos: {
          murs: [orthoNord()],
          sol: { path: '/sol.jpg', minX: -1, minZ: -1, maxX: 5, maxZ: 4 },
        },
      });
    });
    const st = useScanStore.getState();
    expect(st.walls.some((w) => w.orthos?.some((o) => o.path === '/ortho-n.jpg'))).toBe(true);
    expect(st.rooms[0].floor?.ortho?.path).toBe('/sol.jpg');
    expect(st.showTextures).toBe(true);
  });
});

describe('les meubles du relevé', () => {
  const table = (couleurs?: { dessus?: string; cotes?: string }) =>
    modeleDe({
      id: 't1',
      category: 'table',
      width: 1.6,
      depth: 0.9,
      height: 0.75,
      cx: 0,
      cz: 0,
      yaw: 0,
      yb: 0,
      couleurs,
    });

  it('le plateau prend la couleur relevée sur le dessus — plus de chêne pour tout le monde', () => {
    const blanc = JSON.stringify(table({ dessus: '#F2F2F2' }));
    const chene = JSON.stringify(table());
    expect(blanc).not.toBe(chene);
  });

  it('un meuble coincé entre deux murs garde ses vraies cotes dans la 3D', () => {
    const lit: ObjectData = {
      id: 'lit',
      category: 'bed',
      // Plus large que la pièce de dix centimètres : le garde-fou le rabote.
      width: 3.1,
      height: 0.5,
      depth: 2,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.25, 1.5, 1],
    };
    const s = buildScene(
      [mur('n', 0, 0, 3, 0), mur('e', 3, 0, 3, 3), mur('s', 3, 3, 0, 3), mur('o', 0, 3, 0, 0)],
      [],
      [lit],
      { palette: PAL, showSurfaces: true, rooms: [{ id: 'r1' }] },
    );
    const pose = s.meubles?.find((m) => m.id === 'lit');
    expect(pose?.width).toBeCloseTo(3.1, 3);
  });
});
