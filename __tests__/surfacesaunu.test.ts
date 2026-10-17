/**
 * UN PLAN DESSINÉ SE COMPTE À L'INTÉRIEUR DES MURS.
 *
 * Décision du patron, après les revues « Hugo » (studio dessiné au mètre
 * ruban, qui voulait comparer ses m² à son bail) et « Lucas » (la peinture
 * comptait la maçonnerie) : sur un plan dessiné aux cotes,
 *
 *   — les cotes qu'on tape sont INTÉRIEURES, de mur à mur ;
 *   — les m² se comptent au nu, cloisons déduites ;
 *   — le plan, les bandeaux et les feuilles affichent ces cotes-là.
 *
 * Avant : « 6,00 × 4,00 » donnait un intérieur dessiné de 5,86 × 3,86 et
 * annonçait 24,0 m² ; la salle d'eau de 3,20 m² en affichait 3,5.
 *
 * Un plan SCANNÉ ne change pas : on attend la mesure au mètre ruban pour
 * savoir si le trait du relevé est l'axe du mur ou sa face.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurfaceData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import {
  WALL_T,
  etendueDeLaPiece,
  longueurCotee,
  roomParts,
  segLength,
} from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const proche = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);
const parts = () => roomParts(st().walls, st().rooms);
const piece = (nom: string) => {
  const r = st().rooms.find((x) => x.name === nom)!;
  return parts().find((p) => p.roomId === r.id)!;
};

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
  st().commencerAuClavier();
});

describe('le studio d’Hugo, 6,00 × 4,00 au mètre ruban', () => {
  it('se dessine avec 6,00 × 4,00 à l’intérieur, et compte 24,0 m²', () => {
    st().addRoomLibre(6, 4, 'Studio', { auNu: true });
    const p = piece('Studio');
    proche(p.surface!.area, 24, 1e-6);
    const e = etendueDeLaPiece(p.surface!);
    proche(e.width, 6);
    proche(e.depth, 4);
    // Les axes, eux, passent une demi-épaisseur plus loin de chaque côté.
    const xs = p.walls.flatMap((w) => [w.a.x, w.b.x]);
    proche(Math.max(...xs) - Math.min(...xs), 6 + WALL_T);
  });

  it('les cotes des murs se lisent au nu', () => {
    st().addRoomLibre(6, 4, 'Studio', { auNu: true });
    const longs = st().walls.map((w) => longueurCotee(st().walls, w)).sort((a, b) => a - b);
    proche(longs[0], 4);
    proche(longs[3], 6);
  });

  it('une cloison de 7 cm se déduit des m²', () => {
    st().addRoomLibre(6, 4, 'Studio', { auNu: true });
    const murs = st().walls;
    const x0 = Math.min(...murs.flatMap((w) => [w.a.x, w.b.x]));
    const z0 = Math.min(...murs.flatMap((w) => [w.a.z, w.b.z]));
    const z1 = Math.max(...murs.flatMap((w) => [w.a.z, w.b.z]));
    // Le nu de la cloison à 2,00 m du nu du mur de gauche.
    const x = x0 + WALL_T / 2 + 2 + 0.035;
    st().addWallBetween({ x, z: z0 }, { x, z: z1 }, { epaisseur: 0.07 });
    const aires = parts().map((p) => p.surface!.area).sort((a, b) => a - b);
    expect(aires).toHaveLength(2);
    proche(aires[0], 2 * 4, 1e-6);
    proche(aires[1], (6 - 2 - 0.07) * 4, 1e-6);
  });

  it('« Cotes » de la pièce se tape à l’intérieur', () => {
    st().addRoomLibre(6, 4, 'Studio', { auNu: true });
    const id = st().rooms[0].id;
    st().resizeRoom(id, 5, 3.5, { auNu: true });
    const e = etendueDeLaPiece(piece('Studio').surface!);
    proche(e.width, 5);
    proche(e.depth, 3.5);
    proche(piece('Studio').surface!.area, 17.5);
  });

  it('« Longueur du mur » aussi, de nu à nu', () => {
    st().addRoomLibre(6, 4, 'Studio', { auNu: true });
    const haut = [...st().walls].sort((a, b) => Math.min(a.a.z, a.b.z) - Math.min(b.a.z, b.b.z))[0];
    st().setWallLength(haut.id, 6.5, { auNu: true });
    const apres = st().walls.find((w) => w.id === haut.id)!;
    proche(longueurCotee(st().walls, apres), 6.5);
    proche(segLength(apres), 6.5 + WALL_T);
  });

  it('une pièce accolée prend sa profondeur au nu des deux murs', () => {
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    const murs = st().walls;
    const bas = [...murs].sort((a, b) => Math.max(b.a.z, b.b.z) - Math.max(a.a.z, a.b.z))[0];
    st().addRoomBox(4, 2, 'Chambre', bas.id, { auNu: true });
    const e = etendueDeLaPiece(piece('Chambre').surface!);
    proche(Math.min(e.width, e.depth), 2);
  });
});

describe('un plan scanné ne change pas', () => {
  it('ses m² restent comptés au trait, en attendant la mesure au mètre ruban', () => {
    const surface = (id: string, cx: number, cz: number, length: number, alongZ = false): SurfaceData => ({
      id, type: 'wall', length, height: 2.5,
      transform: alongZ
        ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
        : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
    });
    const uuid = (k: number) => `0000000${k}-AAAA-4BBB-8CCC-DDDDDDDDDDDD`;
    st().finalize({
      modelPath: '/tmp/a.usdz',
      surfaces: [
        surface(uuid(1), 2.5, 0, 5),
        surface(uuid(2), 2.5, 4, 5),
        surface(uuid(3), 0, 2, 4, true),
        surface(uuid(4), 5, 2, 4, true),
      ],
      objects: [],
    });
    proche(parts()[0].surface!.area, 20, 1e-6);
    expect(parts()[0].surface!.nu).toBeUndefined();
  });
});

describe('l’écran tape et lit au nu', () => {
  const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
  const editeur = readFileSync(join(__dirname, '..', 'src', 'components', 'FloorplanEditor.tsx'), 'utf8');
  it('les pièces ajoutées, « Cotes » et « Longueur du mur » passent leurs cotes au nu', () => {
    expect(ecran).toMatch(/addRoomLibre\(largeur, profondeur, nom, \{ auNu: true \}\)/);
    expect(ecran).toMatch(/addRoomBox\(largeur, profondeur, nom, selectedWallId, \{ auNu: true \}\)/);
    expect(ecran).toMatch(/resizeRoom\(roomId, L, P, \{ auNu \}\)/);
    expect(ecran).toMatch(/setWallLength\(wallId, v, \{ auNu \}\)/);
  });
  it('le plan écrit la cote au nu des murs dessinés', () => {
    // Calculée une fois par plan (lot « maj-plan2d ») : `longueurs`, lue par mur.
    expect(editeur).toMatch(/\[w\.id, longueurCotee\(walls, w, parts\)\]/);
    expect(editeur).toMatch(/longueur=\{longueurs\.get\(w\.id\)\}/);
    expect(editeur).toMatch(/etendueDeLaPiece\(part\.surface\)/);
  });
});
