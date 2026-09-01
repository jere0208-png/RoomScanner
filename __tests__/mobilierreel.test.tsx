/**
 * LE MOBILIER RÉEL — de vraies références, aux vraies cotes.
 *
 * Relevé du patron : « j'aimerais comme la plupart des apps de ce type,
 * pour les meubles, l'ajout réaliste de meubles depuis un catalogue de
 * mobiliers existants réellement. Il faut dans ce cas revoir aussi le sol
 * et murs pour un réalisme profond. »
 *
 * LA MAISON CITE DÉJÀ SES MARQUES : le devis électrique parle Legrand
 * Céliane et Schneider Odace — des faits de catalogue, pas des logos. Le
 * mobilier suit la même règle : des références du commerce que tout le
 * monde possède ou connaît, à LEURS cotes réelles — c'est la cote qui fait
 * le réalisme d'un plan, pas la photo.
 *
 * ET LA 3D LES RECONNAÎT : un KALLAX est une grille de casiers, un BILLY
 * une colonne d'étagères, un PAX deux hautes portes — pas trois boîtes
 * grises de tailles différentes. Chaque meuble posé retient son MODÈLE, et
 * la silhouette se spécialise. Les matières font le reste : bois, tissu,
 * blanc d'électroménager, céramique de sanitaire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { CATALOG_ITEMS } from '../src/geometry/catalogue';
import { furnitureParts } from '../src/geometry/furniture3d';
import { buildScene } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const parRef = (cle: string) => CATALOG_ITEMS.find((i) => i.key === cle);

describe('le catalogue porte de vraies références', () => {
  it('les icônes y sont, à leurs cotes réelles', () => {
    /*
      Cotes vérifiables au mètre chez n'importe qui : un KALLAX 2×2 fait
      77 × 77 × 39, un BILLY 80 × 28 × 202, un lit MALM 160 fait 176 de
      large. Une référence à la mauvaise cote serait PIRE qu'un meuble
      générique — on planifierait sa chambre sur un mensonge.
    */
    const kallax = parRef('kallax22')!;
    expect(kallax.marque).toBe('IKEA');
    expect(kallax.w).toBeCloseTo(0.77, 2);
    expect(kallax.h).toBeCloseTo(0.77, 2);
    expect(kallax.d).toBeCloseTo(0.39, 2);

    const billy = parRef('billy80')!;
    expect(billy.w).toBeCloseTo(0.8, 2);
    expect(billy.h).toBeCloseTo(2.02, 2);

    const malm = parRef('malm160')!;
    expect(malm.w).toBeCloseTo(1.76, 2);
    expect(malm.d).toBeCloseTo(2.09, 2);
  });

  it('chaque référence réelle dit sa marque et sa matière', () => {
    const reels = CATALOG_ITEMS.filter((i) => i.marque);
    expect(reels.length).toBeGreaterThanOrEqual(12);
    for (const i of reels) {
      expect(i.matiere).toBeTruthy();
    }
  });
});

describe('le meuble posé retient son modèle', () => {
  it('et la 3D le reconnaît', () => {
    useScanStore.getState().reset();
    useScanStore.getState().commencerAuClavier();
    useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 });
    const id = useScanStore.getState().addObject(parRef('kallax22')!, 2, 1.5);
    const obj = useScanStore.getState().objects.find((o) => o.id === id)!;
    expect(obj.modele).toBe('kallax22');
    expect(obj.matiere).toBeTruthy();
  });

  it('un KALLAX est une grille, pas une boîte', () => {
    const grille = furnitureParts('storage', 'kallax22');
    const boite = furnitureParts('storage');
    expect(grille.length).toBeGreaterThan(boite.length);
  });

  it('un BILLY est une colonne d’étagères, un PAX deux hautes portes', () => {
    expect(furnitureParts('storage', 'billy80').length).toBeGreaterThan(
      furnitureParts('storage').length,
    );
    expect(furnitureParts('storage', 'pax100').length).toBeGreaterThan(
      furnitureParts('storage').length,
    );
  });
});

describe('les matières habillent la scène', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  });
  const MURS = [
    mur('n', 0, 0, 4, 0),
    mur('e', 4, 0, 4, 3),
    mur('s', 4, 3, 0, 3),
    mur('o', 0, 3, 0, 0),
  ];
  const meuble = (category: string, matiere?: string) => ({
    id: 'o1',
    category,
    width: 0.6,
    depth: 0.6,
    height: 0.85,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.425, 1.5, 1],
    ...(matiere ? { matiere } : null),
  });
  const scene = (obj: ReturnType<typeof meuble>, matieres?: Record<string, 'parquet' | 'carrelage'>) =>
    buildScene(MURS, [], [obj as never], {
      palette: MAQUETTE,
      showSurfaces: true,
      rooms: [{ id: 'r1', wallIds: ['n', 'e', 's', 'o'] }],
      matieres,
    });

  it('un frigo est blanc, une table est bois — plus le gris unique', () => {
    const duFrigo = scene(meuble('refrigerator')).faces.filter(
      (f) => f.ownerId === 'o1' && f.fill,
    );
    const deLaTable = scene(meuble('table')).faces.filter(
      (f) => f.ownerId === 'o1' && f.fill,
    );
    expect(duFrigo.length).toBeGreaterThan(0);
    expect(deLaTable.length).toBeGreaterThan(0);
    // Deux matières, deux teintes de corps : elles ne partagent rien.
    expect(duFrigo[0].fill).not.toBe(deLaTable[0].fill);
  });

  it('le parquet trace ses lames, le carrelage ses joints croisés', () => {
    const joints = (m: 'parquet' | 'carrelage') =>
      /*
        ON NE COMPTE QUE LES JOINTS DE MATIÈRE (`isFloor`) : les bases de
        murs sont AUSSI des arêtes au ras du sol, et la première version de
        ce banc les comptait — le parquet passait sans exister.
      */
      scene(meuble('table'), { r1: m }).faces.filter(
        (f) => f.pts.length === 2 && f.isFloor,
      );
    const lames = joints('parquet');
    const carreaux = joints('carrelage');
    expect(lames.length).toBeGreaterThan(6);
    expect(carreaux.length).toBeGreaterThan(6);
    // Le carrelage court dans les DEUX directions ; les lames, dans une.
    const sens = (fs: typeof lames) =>
      new Set(
        fs.map((f) =>
          Math.abs(f.pts[0].x - f.pts[1].x) > Math.abs(f.pts[0].z - f.pts[1].z)
            ? 'x'
            : 'z',
        ),
      );
    expect(sens(carreaux).size).toBe(2);
  });

  it('et sans matière déclarée, le sol reste celui de toujours', () => {
    const nus = scene(meuble('table')).faces.filter(
      (f) => f.pts.length === 2 && f.isFloor,
    );
    expect(nus).toHaveLength(0);
  });
});
