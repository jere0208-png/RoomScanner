/**
 * IL FAUT TRAVERSER L'OUVRANT — ce qu'on voit par la porte n'est pas relevé.
 *
 * Relevé du patron : « fais en sorte que l'app comprenne que si on est dans
 * une pièce, ça ne scanne pas la pièce au fond derrière la porte. Il faut
 * traverser l'ouvrant pour que le scan de l'autre pièce où l'on se trouve
 * démarre ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ObjectData,
  ScanResult,
  SurfaceData,
} from 'react-native-room-scan';
import { sansCeQuOnAVuParLaPorte, trajetDe } from '../src/geometry/traversee';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** Une surface RoomPlan de `a` à `b`, comme le natif la rend. */
const surface = (
  id: string,
  type: SurfaceData['type'],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h = 2.5,
): SurfaceData => {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id,
    type,
    length: L,
    height: h,
    transform: [
      ux,
      0,
      uz,
      0,
      0,
      1,
      0,
      0,
      -uz,
      0,
      ux,
      0,
      (ax + bx) / 2,
      h / 2,
      (az + bz) / 2,
      1,
    ],
  };
};
const meuble = (id: string, x: number, z: number): ObjectData => ({
  id,
  category: 'storage',
  width: 0.8,
  depth: 0.5,
  height: 1,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.5, z, 1],
});

/*
  Le séjour (0–4 m) et, derrière la cloison x = 4 et sa porte, la chambre
  (4–7 m) — dont le scan, depuis le séjour, a aperçu le mur du fond, un bout
  de ses murs latéraux, sa fenêtre et son armoire.
*/
const SEJOUR = [
  surface('n', 'wall', 0, 0, 4, 0),
  surface('cloison', 'wall', 4, 0, 4, 3),
  surface('s', 'wall', 4, 3, 0, 3),
  surface('o', 'wall', 0, 3, 0, 0),
  surface('porte', 'door', 4, 1, 4, 1.9, 2.05),
];
const CHAMBRE = [
  surface('fond', 'wall', 7, 0.5, 7, 2.5),
  surface('n2', 'wall', 5.5, 0, 7, 0),
  surface('s2', 'wall', 7, 3, 5.5, 3),
  surface('fenetre', 'window', 7, 1, 7, 2, 1.2),
];
const RELEVE = (trajet?: number[]): ScanResult => ({
  modelPath: '',
  surfaces: [...SEJOUR, ...CHAMBRE],
  objects: [meuble('canape', 1.5, 2.2), meuble('armoire', 6.5, 1.5)],
  trajet,
});
/** Un aller-retour dans le séjour, sans jamais franchir la porte. */
const DANS_LE_SEJOUR = [
  1, 1, 1.5, 1.2, 2, 1.5, 2.5, 1.5, 3, 1.4, 3.3, 1.5, 2.5, 2, 1.5, 2.2,
];
/** Le même, puis on passe la porte et l'on fait le tour de la chambre. */
const JUSQUE_DANS_LA_CHAMBRE = [
  ...DANS_LE_SEJOUR,
  3.6,
  1.45,
  4.4,
  1.45,
  5,
  1.5,
  5.8,
  1.5,
  6.2,
  2,
];

const ids = (r: ScanResult) => [
  ...(r.surfaces ?? []).map(s => s.id),
  ...(r.objects ?? []).map(o => o.id),
];

describe('ce qu’on voit par la porte n’est pas relevé', () => {
  it('resté dans le séjour : la chambre aperçue disparaît, le séjour et sa porte restent', () => {
    const { releve, ecartes } = sansCeQuOnAVuParLaPorte(RELEVE(DANS_LE_SEJOUR));
    const gardes = ids(releve);
    expect(gardes).toEqual(
      expect.arrayContaining(['n', 'cloison', 's', 'o', 'porte', 'canape']),
    );
    for (const id of ['fond', 'n2', 's2', 'fenetre', 'armoire'])
      expect(gardes).not.toContain(id);
    expect(ecartes).toEqual({ murs: 3, ouvertures: 1, meubles: 1 });
  });

  it('la porte franchie, la chambre est relevée — depuis là', () => {
    const { releve, ecartes } = sansCeQuOnAVuParLaPorte(
      RELEVE(JUSQUE_DANS_LA_CHAMBRE),
    );
    expect(ids(releve)).toHaveLength(SEJOUR.length + CHAMBRE.length + 2);
    expect(ecartes).toEqual({ murs: 0, ouvertures: 0, meubles: 0 });
  });

  it('une pièce en L se voit d’un point du chemin : son recoin reste', () => {
    // Le séjour a un retour : un recoin derrière un mur de refend, vu de biais.
    const L: ScanResult = {
      modelPath: '',
      surfaces: [
        surface('a', 'wall', 0, 0, 6, 0),
        surface('b', 'wall', 6, 0, 6, 4),
        surface('c', 'wall', 6, 4, 0, 4),
        surface('d', 'wall', 0, 4, 0, 0),
        surface('refend', 'wall', 3, 0, 3, 2.5),
      ],
      objects: [meuble('bureau', 4.5, 0.6)],
      trajet: [1, 1, 1.5, 2, 2, 3, 2.5, 3.2, 3.5, 3.3],
    };
    const { ecartes } = sansCeQuOnAVuParLaPorte(L);
    expect(ecartes).toEqual({ murs: 0, ouvertures: 0, meubles: 0 });
  });

  it('sans chemin (ancien binaire) ou chemin trop court : rien n’est écarté', () => {
    const r = RELEVE();
    expect(sansCeQuOnAVuParLaPorte(r).releve).toBe(r);
    const court = RELEVE([1, 1, 1.2, 1.1]);
    expect(sansCeQuOnAVuParLaPorte(court).releve).toBe(court);
  });

  it('un chemin hors du repère des murs : on ne trie pas à l’aveugle', () => {
    const loin = RELEVE([50, 50, 51, 50, 52, 50, 53, 50, 54, 50]);
    expect(sansCeQuOnAVuParLaPorte(loin).releve).toBe(loin);
  });

  it('le chemin se lit à quinze centimètres près, et s’échantillonne au-delà de 400 points', () => {
    expect(trajetDe({ trajet: [0, 0, 0.05, 0, 0.2, 0, 0.25, 0.01] })).toEqual([
      { x: 0, z: 0 },
      { x: 0.2, z: 0 },
    ]);
    const long = Array.from({ length: 2000 }, (_, i) => [i * 0.2, 0]).flat();
    expect(trajetDe({ trajet: long })).toHaveLength(400);
  });

  it('les pièces du relevé multi-passages sont triées aussi', () => {
    const r: ScanResult = {
      modelPath: '',
      rooms: [
        {
          id: 'r1',
          surfaces: [...SEJOUR, ...CHAMBRE],
          objects: [meuble('armoire', 6.5, 1.5)],
        },
      ],
      trajet: DANS_LE_SEJOUR,
    };
    const { releve } = sansCeQuOnAVuParLaPorte(r);
    expect(releve.rooms?.[0].surfaces?.map(s => s.id)).not.toContain('fond');
    expect(releve.rooms?.[0].objects).toHaveLength(0);
  });
});

describe('le natif note le chemin, et ses compteurs font de même', () => {
  it('le chemin part avec le relevé, et repart de zéro sur un relevé neuf', () => {
    const m = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(m).toContain('"trajet": trajet,');
    expect(m).toContain('trajet.removeAll()');
    expect(m).toContain('noterLeTrajet(camera)');
    // Les compteurs, les murs douteux et le trou du contour ne voient que ce qui compte.
    expect(m).toContain('let vus = VuDuTrajet.filtrer(room, chemin: trajet)');
    expect(m).toContain('let trou = RoomScanManager.trouDuContour(vus.murs)');
    const t = lire(
      'modules/react-native-room-scan/ios/RoomScanTraversee.swift',
    );
    expect(t).toContain('enum VuDuTrajet');
  });

  it('le tri se fait à l’arrêt du scan, avant les trois issues, et se dit', () => {
    const hook = lire('src/native/useRoomScan.ts');
    expect(hook).toContain('sansCeQuOnAVuParLaPorte(brut)');
    expect(hook).toContain('direCeQuiEstEcarte(ecartes)');
  });
});
