/**
 * LE MOBILIER MAISON — un catalogue complet, dans UN style de mise en scène.
 *
 * Relevé du patron : « enlève les mobiliers aux noms IKEA, fais un
 * catalogue de notre propre source, avec nos noms (basiques). Mais fais un
 * catalogue complet, et des textures réalistes au 3D. Coussins blancs pour
 * un lit, sommier bois, support bois, couverture neutre blanc
 * cassé/beige.. fais tous les mobiliers dans ce style. Ils ne servent pas
 * à redécorer mais à imaginer la pièce seulement. »
 *
 * LA DOCTRINE CHANGE, ET SE TIENT : les cotes du commerce restent (c'est
 * elles qui font le réalisme d'un plan), les NOMS redeviennent à nous —
 * « Lit 160 », « Étagère à casiers », « Armoire 2 portes ». Pas de marque
 * au catalogue : un meuble de mise en ambiance n'a pas d'étiquette.
 *
 * ET UN SEUL STYLE POUR TOUT LE MOBILIER — celui du home staging : coussins
 * BLANCS, bois clair du sommier et des supports, couverture BEIGE, tissus
 * lin, électroménager blanc, sanitaires céramique. Chaque PIÈCE d'un meuble
 * porte désormais SA matière (`FurnPart.mat`) : un lit n'est plus un volume
 * d'une teinte, c'est un sommier bois sous un matelas blanc sous une
 * couverture beige entre deux oreillers blancs.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { CATALOGUE, CATALOG_ITEMS } from '../src/geometry/catalogue';
import { furnitureParts } from '../src/geometry/furniture3d';
import { buildScene } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import type { WallSeg } from '../src/geometry/floorplan';

describe('le catalogue est à nous, et il est complet', () => {
  it('aucun nom de marque, nulle part', () => {
    for (const i of CATALOG_ITEMS) {
      expect(i.marque).toBeUndefined();
      expect(i.label).not.toMatch(
        /ikea|malm|kallax|billy|pax|kivik|klippan|poang|poäng|lack|ekedalen|besta|bestå|micke|bekant|hemnes/i,
      );
    }
  });

  it('complet : six familles, quarante-cinq meubles au moins', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(6);
    expect(CATALOG_ITEMS.length).toBeGreaterThanOrEqual(45);
    // Les manques d'hier, par sondage : le grand lit, le lit bébé, le
    // buffet, la table ronde, le tapis, la plante — la panoplie qui fait
    // qu'on peut IMAGINER n'importe quelle pièce d'un logement.
    const cles = CATALOG_ITEMS.map((i) => i.key);
    for (const cle of ['lit180', 'litBebe', 'buffet', 'tableRonde', 'tapis', 'plante']) {
      expect(cles).toContain(cle);
    }
  });

  it('les cotes du commerce restent : elles font le réalisme', () => {
    const lit = CATALOG_ITEMS.find((i) => i.key === 'lit160')!;
    expect(lit.w).toBeGreaterThanOrEqual(1.6);
    const casiers = CATALOG_ITEMS.find((i) => i.key === 'casiers2')!;
    expect(casiers.w).toBeCloseTo(0.77, 2);
  });
});

describe('un seul style : la mise en ambiance', () => {
  it('le lit, mot pour mot : coussins blancs, sommier bois, couverture beige', () => {
    const mats = new Set(furnitureParts('bed').map((p) => p.mat));
    expect(mats.has('blanc')).toBe(true);
    expect(mats.has('bois')).toBe(true);
    expect(mats.has('beige')).toBe(true);
  });

  it('le canapé est en lin sur bois, la chaise aussi', () => {
    const canape = new Set(furnitureParts('sofa').map((p) => p.mat));
    expect(canape.has('lin')).toBe(true);
    const chaise = new Set(furnitureParts('chair').map((p) => p.mat));
    expect(chaise.has('bois') || chaise.has('lin')).toBe(true);
  });

  it('la plante a son feuillage, le tapis son lin', () => {
    expect(
      furnitureParts('plant', 'plante').some((p) => p.mat === 'feuillage'),
    ).toBe(true);
    expect(
      furnitureParts('rug', 'tapis').some((p) => p.mat === 'lin' || p.mat === 'beige'),
    ).toBe(true);
  });

  it('et la scène rend un lit en TROIS teintes au moins', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id,
      type: 'wall',
      a: { x: ax, z: az },
      b: { x: bx, z: bz },
      height: 2.5,
      yCenter: 1.25,
      roomId: 'r1',
    });
    const sc = buildScene(
      [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)],
      [],
      [
        {
          id: 'lit',
          category: 'bed',
          width: 1.6,
          depth: 2,
          height: 1,
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.5, 1.5, 1],
        } as never,
      ],
      { palette: MAQUETTE, rooms: [{ id: 'r1', wallIds: ['n', 'e', 's', 'o'] }] },
    );
    const teintes = new Set(
      sc.faces.filter((f) => f.ownerId === 'lit' && f.fill).map((f) => f.fill),
    );
    expect(teintes.size).toBeGreaterThanOrEqual(3);
  });
});
