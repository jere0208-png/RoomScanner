/**
 * Le store : mise à plat d'un résultat de scan, DÉTECTION AUTOMATIQUE des
 * pièces dans le graphe des murs, nommage d'après le mobilier, et reprise des
 * scans enregistrés avant tout ça.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import {
  roomExtent,
  roomHeight,
  roomParts,
  totalArea,
  wallAreaM2,
} from '../src/geometry/floorplan';
import { useScanStore, type SavedScan } from '../src/store/scanStore';

// Le store diffère l'écriture disque de 600 ms : sans horloge factice, le
// minuteur survit à la fin des tests et Jest tue son worker de force.
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Surface iOS : matrice colonne-major, mur le long de X (ou de Z). */
const surface = (
  id: string,
  cx: number,
  cz: number,
  length: number,
  alongZ = false,
): SurfaceData => ({
  id,
  type: 'wall',
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});

/** Mur droit entre deux points, exprimé comme RoomPlan le livre. */
const wallBetween = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): SurfaceData => {
  const len = Math.hypot(bx - ax, bz - az);
  return surface(id, (ax + bx) / 2, (az + bz) / 2, len, Math.abs(bz - az) > 1e-9);
};

/** Les quatre murs d'une pièce rectangulaire, coin haut-gauche en (x, z). */
const boxSurfaces = (p: string, x: number, z: number, w: number, h: number) => [
  surface(`${p}n`, x + w / 2, z, w),
  surface(`${p}s`, x + w / 2, z + h, w),
  surface(`${p}w`, x, z + h / 2, h, true),
  surface(`${p}e`, x + w, z + h / 2, h, true),
];

const objectAt = (
  id: string,
  category: string,
  x: number,
  z: number,
): ObjectData => ({
  id,
  category,
  width: 0.8,
  height: 0.8,
  depth: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});

const reset = () =>
  useScanStore.setState({
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    saves: [],
    currentSaveId: null,
    modelPath: null,
    dirty: false,
  });

/** Un 7 × 3 coupé en deux par un refend à x = 4 : 12 m² puis 9 m². */
const twoRoomFlat = [
  wallBetween('n1', 0, 0, 4, 0),
  wallBetween('n2', 4, 0, 7, 0),
  wallBetween('e', 7, 0, 7, 3),
  wallBetween('s2', 7, 3, 4, 3),
  wallBetween('s1', 4, 3, 0, 3),
  wallBetween('w', 0, 3, 0, 0),
  wallBetween('refend', 4, 0, 4, 3),
];

describe('détection automatique des pièces', () => {
  beforeEach(reset);

  it('trouve une pièce dans un scan tout simple', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 4, 3),
      objects: [],
    });
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    expect(st.walls).toHaveLength(4);
    // Aucun meuble : rien à déduire, la pièce prend son rang.
    expect(st.rooms[0].name).toBe('Pièce 1');
    expect(st.rooms[0].wallIds).toHaveLength(4);
  });

  it('trouve DEUX pièces séparées par un refend, sans rien demander', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [],
    });
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(2);
    const parts = roomParts(st.walls, st.rooms);
    expect(parts.map((p) => Math.round(p.surface!.area))).toEqual([12, 9]);
    // Le refend borde les deux pièces : il est dans les deux listes.
    expect(st.rooms.every((r) => r.wallIds?.includes('refend'))).toBe(true);
  });

  it('nomme chaque pièce d’après les meubles qui s’y trouvent', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [
        objectAt('o1', 'sofa', 2, 1.5),
        objectAt('o2', 'television', 1, 0.3),
        objectAt('o3', 'refrigerator', 5.5, 1.5),
        objectAt('o4', 'stove', 6, 0.5),
      ],
    });
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual([
      'Salon',
      'Cuisine',
    ]);
  });

  it('rattache chaque meuble à la pièce qui le contient', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'sofa', 2, 1.5), objectAt('o2', 'stove', 6, 1.5)],
    });
    const st = useScanStore.getState();
    expect(st.objects.map((o) => o.roomId)).toEqual(['room-1', 'room-2']);
  });

  it('numérote les pièces que le mobilier ne permet pas de deviner', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      // Un rangement ne dit rien de la pièce ; un lit, si.
      objects: [objectAt('o1', 'storage', 2, 1.5), objectAt('o2', 'bed', 6, 1.5)],
    });
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual([
      'Pièce 1',
      'Chambre',
    ]);
  });

  it('numérote les homonymes : deux chambres, pas deux fois le même nom', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'bed', 2, 1.5), objectAt('o2', 'bed', 6, 1.5)],
    });
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual([
      'Chambre',
      'Chambre 2',
    ]);
  });

  it('retombe sur une pièce unique quand rien ne se referme', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 4, 3).slice(0, 3),
      objects: [objectAt('o1', 'bathtub', 2, 1.5)],
    });
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    expect(st.rooms[0].wallIds).toHaveLength(3);
    // Le mobilier parle même sans contour fermé.
    expect(st.rooms[0].name).toBe('Salle de bains');
  });

  it('accepte un résultat mono-pièce à plat et l’enregistre', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.obj',
      surfaces: boxSurfaces('a', 0, 0, 4, 3),
      objects: [objectAt('o1', 'toilet', 2, 1.5)],
    });
    const st = useScanStore.getState();
    expect(st.rooms[0].name).toBe('WC');
    // Un scan terminé se sauvegarde tout seul.
    expect(st.saves).toHaveLength(1);
    expect(st.saves[0].rooms[0].wallIds).toHaveLength(4);
  });

  it('montre l’état vide sans rien enregistrer quand rien n’est détecté', () => {
    useScanStore.getState().finalize({ modelPath: '/tmp/vide.usdz', surfaces: [] });
    const st = useScanStore.getState();
    expect(st.walls).toHaveLength(0);
    expect(st.saves).toHaveLength(0);
    expect(st.screen).toBe('result');
  });
});

describe('appartement tel que RoomPlan le livre', () => {
  beforeEach(reset);

  /**
   * Le cas qui compte : l'enveloppe arrive d'un SEUL tenant et la cloison
   * vient buter au milieu, sans couper personne. Sans découpe aux jonctions,
   * aucun cycle ne passe par la cloison et tout ressort en une pièce.
   */
  const brut = [
    wallBetween('n', 0, 0, 7, 0),
    wallBetween('e', 7, 0, 7, 3),
    wallBetween('s', 7, 3, 0, 3),
    wallBetween('w', 0, 3, 0, 0),
    wallBetween('refend', 4, 0.05, 4, 2.95),
  ];

  it('démêle un T2 de bout en bout : pièces, noms, meubles, ouverture', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: [
        ...brut,
        { ...wallBetween('p1', 4, 1, 4, 1.9), type: 'door', height: 2.05 },
      ],
      objects: [
        objectAt('o1', 'sofa', 2, 1.5),
        objectAt('o2', 'television', 2, 0.3),
        objectAt('o3', 'refrigerator', 5.5, 1.5),
        objectAt('o4', 'stove', 6, 0.4),
      ],
    });
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.name)).toEqual(['Salon', 'Cuisine']);
    expect(st.openings).toHaveLength(1);
    expect(st.objects.map((o) => o.roomId)).toEqual([
      'room-1',
      'room-1',
      'room-2',
      'room-2',
    ]);
    const parts = roomParts(st.walls, st.rooms);
    expect(parts.every((p) => p.surface?.exact)).toBe(true);
    expect(parts.map((p) => Math.round(p.surface!.area))).toEqual([12, 9]);
    // Les cartouches se posent au large, chacun chez soi.
    const d = Math.hypot(
      parts[0].labelAt.x - parts[1].labelAt.x,
      parts[0].labelAt.z - parts[1].labelAt.z,
    );
    expect(d).toBeGreaterThan(2);
  });
});

describe('retoucher les pièces à la main', () => {
  beforeEach(reset);

  const deuxPieces = () =>
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'sofa', 2, 1.5), objectAt('o2', 'stove', 6, 1.5)],
    });

  it('fusionne deux pièces : une seule surface, murs communs mis de côté', () => {
    deuxPieces();
    useScanStore.getState().mergeRooms('room-1', 'room-2');
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    const parts = roomParts(st.walls, st.rooms);
    expect(parts[0].surface?.exact).toBe(true);
    expect(Math.round(parts[0].surface!.area)).toBe(21);
    // La cloison n'est plus une bordure, mais elle reste dessinée.
    expect(st.rooms[0].wallIds).not.toContain('refend');
    expect(st.walls.some((w) => w.id === 'refend')).toBe(true);
    // Les meubles de la pièce absorbée suivent.
    expect(st.objects.every((o) => o.roomId === 'room-1')).toBe(true);
  });

  it('scinde une pièce en posant une cloison en travers', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 6, 3),
      objects: [],
    });
    expect(useScanStore.getState().rooms).toHaveLength(1);
    useScanStore.getState().splitRoom('room-1');
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(2);
    const parts = roomParts(st.walls, st.rooms);
    expect(parts.every((p) => p.surface?.exact)).toBe(true);
    // Les deux moitiés totalisent la pièce d'origine.
    expect(Math.round(totalArea(parts)!.area)).toBe(18);
  });

  it('garde les noms donnés à la main lors d’une redétection', () => {
    deuxPieces();
    useScanStore.getState().setRoomName('room-1', 'Séjour');
    useScanStore.getState().redetectRooms();
    expect(useScanStore.getState().rooms.map((r) => r.name)).toContain('Séjour');
  });

  it('change la hauteur sous plafond d’une seule pièce', () => {
    deuxPieces();
    useScanStore.getState().setRoomHeight('room-2', 2.2);
    const st = useScanStore.getState();
    const parts = roomParts(st.walls, st.rooms);
    expect(roomHeight(parts[1].walls)).toBeCloseTo(2.2);
    // Le salon garde la sienne (la cloison est partagée, elle suit la cuisine).
    expect(roomHeight(parts[0].walls)).toBeCloseTo(2.5);
  });

  it('refuse une hauteur aberrante', () => {
    deuxPieces();
    useScanStore.getState().setRoomHeight('room-1', 0.4);
    useScanStore.getState().setRoomHeight('room-1', 12);
    const parts = roomParts(
      useScanStore.getState().walls,
      useScanStore.getState().rooms,
    );
    expect(roomHeight(parts[0].walls)).toBeCloseTo(2.5);
  });

  /*
    UN MUR N'A PAS TOUJOURS LA HAUTEUR DE SA PIÈCE.

    La hauteur ne se réglait que par pièce : tous ses murs d'un coup. Or un
    logement réel a des retombées de poutre, des sous-pentes, un muret de
    cuisine à 1,10 m — et c'est cette hauteur-là qui commande le métré du
    mur, la surface à peindre et la place qu'on a pour poser un appareil.
  */
  it('change la hauteur d’UN mur, sans toucher aux autres', () => {
    deuxPieces();
    const cible = useScanStore.getState().rooms[0].wallIds![0];
    useScanStore.getState().setWallHeight(cible, 2.1);
    const st = useScanStore.getState();
    const mur = st.walls.find((w) => w.id === cible)!;
    expect(mur.height).toBeCloseTo(2.1);
    // Le sol ne bouge pas : c'est le plafond qui descend.
    expect(mur.yCenter - mur.height / 2).toBeCloseTo(0);
    // Ses voisins gardent la leur.
    expect(
      st.walls.filter((w) => w.id !== cible).every((w) => w.height === 2.5),
    ).toBe(true);
  });

  it('accepte un muret, refuse l’aberrant', () => {
    deuxPieces();
    const cible = useScanStore.getState().rooms[0].wallIds![0];
    // Un muret de cuisine, un allège de fenêtre en pignon : 1,10 m est une
    // hauteur de mur parfaitement ordinaire, que la borne « plus d'un
    // mètre » du réglage par pièce interdisait.
    useScanStore.getState().setWallHeight(cible, 1.1);
    expect(
      useScanStore.getState().walls.find((w) => w.id === cible)!.height,
    ).toBeCloseTo(1.1);
    useScanStore.getState().setWallHeight(cible, 0.05);
    useScanStore.getState().setWallHeight(cible, 9);
    expect(
      useScanStore.getState().walls.find((w) => w.id === cible)!.height,
    ).toBeCloseTo(1.1);
  });

  it('fait redescendre l’appareillage que le plafond rattrape', () => {
    deuxPieces();
    const cible = useScanStore.getState().rooms[0].wallIds![0];
    useScanStore.setState({
      fixtures: [
        { id: 'f1', kind: 'prise', wallId: cible, along: 1, height: 0.25, side: 1 },
        { id: 'f2', kind: 'prise', wallId: cible, along: 2, height: 2.2, side: 1 },
      ],
    });
    useScanStore.getState().setWallHeight(cible, 1.2);
    const fx = useScanStore.getState().fixtures;
    // Celui d'en bas ne bouge pas ; celui d'en haut se retrouverait DANS le
    // plafond, il redescend sous lui — sinon le métré compte une prise qui
    // n'existe nulle part.
    expect(fx.find((f) => f.id === 'f1')!.height).toBeCloseTo(0.25);
    expect(fx.find((f) => f.id === 'f2')!.height).toBeLessThan(1.2);
    expect(fx.find((f) => f.id === 'f2')!.height).toBeGreaterThan(0);
  });

  it('rabat le linteau d’une baie devenue trop haute pour son mur', () => {
    deuxPieces();
    const st0 = useScanStore.getState();
    const cible = st0.rooms[0].wallIds![0];
    const mur = st0.walls.find((w) => w.id === cible)!;
    useScanStore.setState({
      openings: [
        {
          id: 'o-porte',
          type: 'door',
          a: {
            x: mur.a.x + (mur.b.x - mur.a.x) * 0.3,
            z: mur.a.z + (mur.b.z - mur.a.z) * 0.3,
          },
          b: {
            x: mur.a.x + (mur.b.x - mur.a.x) * 0.6,
            z: mur.a.z + (mur.b.z - mur.a.z) * 0.6,
          },
          height: 2.05,
          yCenter: 1.025,
        },
      ],
    });
    useScanStore.getState().setWallHeight(cible, 1.6);
    const o = useScanStore.getState().openings[0];
    // Une porte de 2,05 m ne tient pas sous 1,60 m de mur : elle se rabat,
    // et son allège reste au sol.
    expect(o.yCenter + o.height / 2).toBeLessThanOrEqual(1.6 + 1e-6);
    expect(o.height).toBeGreaterThan(0.2);
  });

  it('s’annule d’un seul retour en arrière', () => {
    deuxPieces();
    const cible = useScanStore.getState().rooms[0].wallIds![0];
    useScanStore.getState().setWallHeight(cible, 2.1);
    useScanStore.getState().undo();
    expect(
      useScanStore.getState().walls.find((w) => w.id === cible)!.height,
    ).toBeCloseTo(2.5);
  });

  /*
    UNE PIÈCE AJOUTÉE TOUCHE LE LOGEMENT.

    Sans mur choisi, elle se posait à droite de l'emprise avec un jeu d'un
    demi-mètre : une boîte flottant dans le vide, reliée à rien. Le plan
    montrait deux logements, la détection n'y voyait pas de cloison commune,
    et « fusionner » ne pouvait plus rien réunir — d'où l'impression qu'elle
    ne faisait que renommer.

    Elle s'accole donc TOUJOURS à un mur : celui qu'on a choisi, ou, à
    défaut, le plus long du contour extérieur. Le mur devient mitoyen, et
    figure dans les listes des deux pièces.
  */
  it('accroche une pièce ajoutée au mur le plus long', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 6, 3),
      objects: [],
    });
    const avant = useScanStore.getState().walls.length;
    const id = useScanStore.getState().addRoomBox(3, 3, 'Chambre');
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(2);
    // Trois murs neufs, pas quatre : le quatrième est le mitoyen, partagé.
    expect(st.walls.length).toBe(avant + 3);
    const neuve = st.rooms.find((r) => r.id === id)!;
    const vieille = st.rooms.find((r) => r.id !== id)!;
    const commun = (neuve.wallIds ?? []).filter((w) =>
      (vieille.wallIds ?? []).includes(w),
    );
    expect(commun).toHaveLength(1);
    // Et son contour se ferme : une pièce dont la surface n'est pas exacte
    // est une pièce que le métré ne sait pas compter.
    const part = roomParts(st.walls, st.rooms).find((p) => p.roomId === id);
    expect(part?.surface?.exact).toBe(true);
    expect(part!.surface!.area).toBeGreaterThan(4);
  });

  /*
    ON NE FUSIONNE QUE DES VOISINES.

    La fusion réunit deux listes de murs en retirant ceux qu'elles ont en
    commun. Entre deux pièces qui n'en partagent AUCUN, elle produit une
    pièce faite de deux contours disjoints : plus de surface calculable,
    plus de métré — et à l'écran, rien d'autre qu'un nom qui disparaît.
    C'est ce qu'on a pris pour « la fusion ne fait que renommer ».
  */
  it('refuse de fusionner deux pièces qui ne se touchent pas', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: [...boxSurfaces('a', 0, 0, 4, 3), ...boxSurfaces('b', 20, 0, 4, 3)],
      objects: [],
    });
    const st0 = useScanStore.getState();
    expect(st0.rooms.length).toBeGreaterThanOrEqual(2);
    const [r1, r2] = st0.rooms;
    useScanStore.getState().mergeRooms(r1.id, r2.id);
    // Rien n'a bougé : deux pièces, chacune avec sa surface.
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(2);
    for (const p of roomParts(st.walls, st.rooms)) {
      expect(p.surface?.exact).toBe(true);
    }
  });

  it('fusionne bien deux pièces mitoyennes', () => {
    deuxPieces();
    const [r1, r2] = useScanStore.getState().rooms;
    useScanStore.getState().mergeRooms(r1.id, r2.id);
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    const part = roomParts(st.walls, st.rooms)[0];
    expect(part.surface?.exact).toBe(true);
    // La somme des deux, à l'épaisseur de cloison près.
    expect(part.surface!.area).toBeGreaterThan(20);
  });

  it('donne les cotes hors-tout et la surface murale nette', () => {
    deuxPieces();
    const st = useScanStore.getState();
    const parts = roomParts(st.walls, st.rooms);
    const e = roomExtent(parts[0].surface!.pts);
    expect(e.width).toBeCloseTo(4);
    expect(e.depth).toBeCloseTo(3);
    // Périmètre 14 m × 2,5 m = 35 m², sans ouverture ici.
    expect(wallAreaM2(parts[0].walls, st.openings)).toBeCloseTo(35);
  });
});

describe('retoucher les murs et annuler', () => {
  beforeEach(reset);

  const deux = () =>
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'sofa', 2, 1.5)],
    });

  it('ajoute un mur, et l’annulation le retire', () => {
    deux();
    const n = useScanStore.getState().walls.length;
    expect(useScanStore.getState().canUndo).toBe(false);
    useScanStore
      .getState()
      .addWallBetween({ x: 1, z: 1 }, { x: 1, z: 2.5 });
    expect(useScanStore.getState().walls).toHaveLength(n + 1);
    expect(useScanStore.getState().canUndo).toBe(true);
    useScanStore.getState().undo();
    expect(useScanStore.getState().walls).toHaveLength(n);
  });

  it('supprime un mur, ses pièces le lâchent, l’annulation le rend', () => {
    deux();
    const id = useScanStore.getState().walls[0].id;
    useScanStore.getState().removeWall(id);
    const st = useScanStore.getState();
    expect(st.walls.some((w) => w.id === id)).toBe(false);
    expect(st.rooms.every((r) => !r.wallIds?.includes(id))).toBe(true);
    useScanStore.getState().undo();
    expect(useScanStore.getState().walls.some((w) => w.id === id)).toBe(true);
  });

  it('ne compte qu’UNE annulation pour tout un glissement', () => {
    deux();
    const id = useScanStore.getState().walls[0].id;
    const avant = { ...useScanStore.getState().walls[0].a };
    // Un glissement appelle l'action des dizaines de fois par seconde.
    for (let i = 0; i < 30; i++) {
      useScanStore.getState().moveWallPoint(id, 'a', { x: -0.02 * i, z: 0 });
    }
    useScanStore.getState().undo();
    const apres = useScanStore.getState().walls.find((w) => w.id === id)!.a;
    expect(apres.x).toBeCloseTo(avant.x);
    expect(apres.z).toBeCloseTo(avant.z);
  });

  it('annule un renommage et une fusion', () => {
    deux();
    useScanStore.getState().setRoomName('room-1', 'Séjour');
    expect(useScanStore.getState().rooms[0].name).toBe('Séjour');
    useScanStore.getState().undo();
    expect(useScanStore.getState().rooms[0].name).not.toBe('Séjour');

    useScanStore.getState().mergeRooms('room-1', 'room-2');
    expect(useScanStore.getState().rooms).toHaveLength(1);
    useScanStore.getState().undo();
    expect(useScanStore.getState().rooms).toHaveLength(2);
  });

  it('repart sans historique quand on ouvre un autre scan', () => {
    deux();
    useScanStore.getState().addWallBetween({ x: 1, z: 1 }, { x: 1, z: 2.5 });
    expect(useScanStore.getState().canUndo).toBe(true);
    const id = useScanStore.getState().saves[0].id;
    useScanStore.getState().openSave(id);
    expect(useScanStore.getState().canUndo).toBe(false);
  });
});

describe('removeRoom', () => {
  beforeEach(reset);

  it('garde le refend tant que la pièce voisine s’appuie dessus', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'sofa', 2, 1.5), objectAt('o2', 'stove', 6, 1.5)],
    });
    useScanStore.getState().removeRoom('room-2');
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.id)).toEqual(['room-1']);
    // Le refend reste : il borde encore le salon.
    expect(st.walls.some((w) => w.id === 'refend')).toBe(true);
    // Les murs qui n'appartenaient qu'à la cuisine sont partis.
    expect(st.walls.some((w) => w.id === 'n2')).toBe(false);
    expect(st.objects.map((o) => o.id)).toEqual(['o1']);
    expect(st.dirty).toBe(true);
  });

  it('refuse de retirer la dernière pièce', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 4, 3),
      objects: [],
    });
    useScanStore.getState().removeRoom('room-1');
    expect(useScanStore.getState().rooms).toHaveLength(1);
  });
});

describe('scans enregistrés avant la détection automatique', () => {
  beforeEach(reset);

  it('se rouvrent avec une pièce implicite, nom et sol conservés', () => {
    const legacy = {
      id: 'old-1',
      name: 'Scan du 01/08 à 10h00',
      createdAt: 1,
      updatedAt: 1,
      modelPath: null,
      roomName: 'Salon',
      floor: { color: '#8A6E4B' },
      walls: [
        { id: 'w1', type: 'wall', a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, height: 2.5, yCenter: 1.25 },
      ],
      openings: [],
      objects: [],
    } as unknown as SavedScan;
    useScanStore.setState({ saves: [legacy] });

    useScanStore.getState().openSave('old-1');
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    expect(st.rooms[0].name).toBe('Salon');
    expect(st.rooms[0].floor?.color).toBe('#8A6E4B');
    // Pas de wallIds : le découpage retombe sur le regroupement par roomId.
    expect(st.rooms[0].wallIds).toBeUndefined();
    expect(roomParts(st.walls, st.rooms)).toHaveLength(1);
  });
});

describe('setRoomName', () => {
  beforeEach(reset);

  it('ne renomme que la pièce visée et marque le plan modifié', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [],
    });
    useScanStore.getState().setRoomName('room-2', '  Cuisine  ');
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.name)).toEqual(['Pièce 1', 'Cuisine']);
    expect(st.dirty).toBe(true);
  });
});

describe('dossiers de la bibliothèque', () => {
  const scan = (id: string): SavedScan => ({
    id,
    name: `Scan ${id}`,
    createdAt: 0,
    updatedAt: 0,
    modelPath: null,
    rooms: [{ id: 'room-1', name: '' }],
    walls: [],
    openings: [],
    objects: [],
  });

  beforeEach(() => {
    useScanStore.setState({
      saves: [scan('a'), scan('b')],
      folders: [],
      currentSaveId: null,
    });
  });

  it('range un scan, puis l’en ressort', () => {
    const id = useScanStore.getState().addFolder('Chantier Dupont');
    useScanStore.getState().moveToFolder('a', id);
    expect(useScanStore.getState().saves.find((s) => s.id === 'a')?.folderId).toBe(id);
    expect(useScanStore.getState().saves.find((s) => s.id === 'b')?.folderId).toBeUndefined();
    useScanStore.getState().moveToFolder('a', null);
    expect(useScanStore.getState().saves.find((s) => s.id === 'a')?.folderId).toBeUndefined();
  });

  it('se renomme', () => {
    const id = useScanStore.getState().addFolder();
    expect(useScanStore.getState().folders[0].name).toBe('Dossier 1');
    useScanStore.getState().renameFolder(id, '  Rue des Lilas  ');
    expect(useScanStore.getState().folders[0].name).toBe('Rue des Lilas');
    // Un nom vide ne remplace pas l'ancien : on n'efface pas par mégarde.
    useScanStore.getState().renameFolder(id, '   ');
    expect(useScanStore.getState().folders[0].name).toBe('Rue des Lilas');
  });

  it('supprimer le dossier ne supprime pas les scans', () => {
    const id = useScanStore.getState().addFolder();
    useScanStore.getState().moveToFolder('a', id);
    useScanStore.getState().moveToFolder('b', id);
    useScanStore.getState().removeFolder(id);
    expect(useScanStore.getState().folders).toHaveLength(0);
    // Les deux scans sont toujours là, revenus à la racine.
    expect(useScanStore.getState().saves).toHaveLength(2);
    expect(
      useScanStore.getState().saves.every((s) => s.folderId === undefined),
    ).toBe(true);
  });
});

describe('meubles posés à la main', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number) => ({
    id,
    type: 'wall' as const,
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  // Pièce carrée de 4 m, murs parcourus dans le sens horaire.
  const CARRE = [
    mur('n', 0, 0, 4, 0),
    mur('e', 4, 0, 4, 4),
    mur('s', 4, 4, 0, 4),
    mur('w', 0, 4, 0, 0),
  ];
  const LIT = {
    key: 'lit140',
    label: 'Lit double 140',
    category: 'bed',
    w: 1.4,
    d: 1.9,
    h: 0.5,
  };

  beforeEach(() => {
    useScanStore.setState({
      walls: CARRE,
      openings: [],
      objects: [],
      fixtures: [],
      rooms: [{ id: 'room-1', name: 'Chambre', wallIds: CARRE.map((w) => w.id) }],
      currentSaveId: null,
      saves: [],
      canUndo: false,
      dirty: false,
    });
  });

  it('pose le meuble à ses cotes, au point demandé', () => {
    const id = useScanStore.getState().addObject(LIT, 2, 2);
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(o.width).toBe(1.4);
    expect(o.depth).toBe(1.9);
    expect(o.transform[12]).toBe(2);
    expect(o.transform[14]).toBe(2);
    // La hauteur portée par la matrice est celle du CENTRE du meuble.
    expect(o.transform[13]).toBeCloseTo(0.25, 6);
  });

  it('se colle au mur dès qu’on l’en approche, et s’aligne dessus', () => {
    const id = useScanStore.getState().addObject(LIT, 2, 2);
    // Amené près du mur nord (z = 0) : il doit reculer contre lui.
    useScanStore.getState().setObjectCenter(id, 2, 1.0);
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    // Dos au nu du mur : demi-profondeur + demi-épaisseur de mur.
    expect(o.transform[14]).toBeCloseTo(1.9 / 2 + 0.07, 3);
    expect(o.transform[12]).toBeCloseTo(2, 6);
    // Et l'axe de profondeur du meuble regarde la pièce (vers +z).
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    expect(Math.abs(Math.sin(yaw))).toBeCloseTo(0, 6);
    expect(Math.cos(yaw)).toBeCloseTo(1, 6);
  });

  it('reste où on le laisse quand il est loin des murs', () => {
    const id = useScanStore.getState().addObject(LIT, 2, 2);
    useScanStore.getState().setObjectCenter(id, 2, 2);
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(o.transform[12]).toBe(2);
    expect(o.transform[14]).toBe(2);
  });

  it('pivote par quarts de tour', () => {
    const id = useScanStore.getState().addObject(LIT, 2, 2);
    useScanStore.getState().rotateObject(id);
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    expect(yaw).toBeCloseTo(Math.PI / 2, 6);
    // Quatre quarts de tour ramènent à l'endroit.
    for (let i = 0; i < 3; i++) useScanStore.getState().rotateObject(id);
    const fin = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(Math.abs(Math.atan2(fin.transform[2], fin.transform[0]))).toBeCloseTo(0, 6);
  });
});
