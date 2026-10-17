/**
 * LA LUMIÈRE DE LA VISITE ET DE LA MAQUETTE — relevés du patron :
 *   — « les murs intérieurs lors de la visite et 3D sont de base trop gris ;
 *     donne-leur un ton plus beige » ;
 *   — « les éléments élec sont trop sous faible luminosité sans lumière, ils
 *     sont trop gris ; ajoute-leur un peu de lumière même sans lumière de
 *     pièce » ;
 *   — puis : « le système de lumière est mal fait et nuit au développement de
 *     l'app. Supprime la possibilité d'éclairer la pièce en appuyant sur le
 *     bouton lors de la visite, rends l'éclairage qu'on avait de base d'une
 *     pièce » (voir `visitesanslampes.test.tsx`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODE_APPAREIL, maillageDesMeubles, type GroupeLocal } from '../src/geometry/modeles3d';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import type { WallSeg } from '../src/geometry/floorplan';

const swift = readFileSync(
  join(__dirname, '../modules/react-native-room-scan/ios/RoomScanVisite.swift'),
  'utf8',
);

describe('les murs côté pièce : un blanc cassé, plus blanc que beige, jamais blanc pur', () => {
  it('la palette a son blanc cassé chaud', () => {
    expect(MAQUETTE.wallInside).toBeDefined();
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r, g, b] = rgb(MAQUETTE.wallInside!);
    // Chaud, à peine : le rouge passe le bleu, sans tourner au beige.
    expect(r - b).toBeGreaterThan(4);
    expect(r - b).toBeLessThan(16);
    // Clair, mais pas le blanc d'écran.
    expect(Math.min(r, g, b)).toBeGreaterThan(220);
    expect(MAQUETTE.wallInside!.toUpperCase()).not.toBe('#FFFFFF');
  });

  it('la face côté pièce prend le beige, la façade garde son blanc cassé', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
    });
    const walls = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
    const pal: ScenePalette = { ...MAQUETTE, wallInside: '#ABCDEF', wall: '#123456' };
    const { faces } = buildScene(walls, [], [], {
      palette: pal,
      colorOpenings: false,
      showSurfaces: false,
      rooms: [{ id: 'r', name: 'Pièce', wallIds: ['n', 'e', 's', 'o'] }],
    } as never);
    const teintes = new Set(faces.map((f) => (f.fill ?? '').toUpperCase()));
    // Les faces ombrées dérivent leur teinte : on cherche la famille.
    const proche = (cible: string) =>
      [...teintes].some((t) => t.length === 7 && Math.abs(parseInt(t.slice(1, 3), 16) - parseInt(cible.slice(1, 3), 16)) < 40 &&
        Math.abs(parseInt(t.slice(5, 7), 16) - parseInt(cible.slice(5, 7), 16)) < 40);
    expect(proche('#ABCDEF')).toBe(true);
    expect(proche('#123456')).toBe(true);
  });
});

describe('l’appareillage se voit sans lampe', () => {
  const plaque: GroupeLocal = { mat: 'laque', couleur: '#F4F4F2', v: [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1], i: [0, 1, 2] };

  it('il part sous son code, à part des meubles de même matière', () => {
    const flux = maillageDesMeubles([], [plaque]);
    expect(flux[0]).toBe(CODE_APPAREIL);
  });

  it('le natif lui donne une part de sa teinte en émission, sans le faire briller', () => {
    const bloc = swift.slice(swift.indexOf('case 7:'));
    const e = Number((bloc.match(/m\.emission\.intensity = ([\d.]+)/) ?? [])[1]);
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThanOrEqual(0.3);
  });
});

describe('les meubles ne blanchissent pas (relevé du patron : « tout devient blanc »)', () => {
  it('la couleur d’un meuble ne dépasse pas sa teinte de plus de 15 %', () => {
    expect(swift).toMatch(/_output\.color\.rgb = min\(_output\.color\.rgb, _surface\.diffuse\.rgb \* 1\.15 \+ _surface\.emission\.rgb\)/);
    const bloc = swift.slice(swift.indexOf('private static func materiauDuMeuble'));
    expect(bloc).toMatch(/nuanceurPlafondDesMeubles/);
  });
});

describe('le rendu retenu : C, « Chaleureux du soir », sans ses lampes', () => {
  it('le rendu ne garde que le liseré, les teintes de matière, le veinage et l’ombre', () => {
    const m = swift.match(
      /static let RENDU = Rendu\(lisere: ([\d.]+), albedoMeubles: ([\d.]+), albedoSol: ([\d.]+), veinage: (true|false), ombre: ([\d.]+)\)/,
    );
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(0.24);
    expect(Number(m![2])).toBeCloseTo(0.84);
    expect(Number(m![3])).toBeCloseTo(0.74);
    expect(m![4]).toBe('true');
    expect(Number(m![5])).toBeCloseTo(0.55);
    const debut = swift.indexOf('struct Rendu {');
    const rendu = swift.slice(debut, swift.indexOf('\n  }\n', debut));
    expect(rendu).not.toMatch(/eteint|allume|rebond|lampes/);
  });

  it('plus de choix de rendu ni de pastille : un seul rendu, les murs blancs chauds', () => {
    expect(swift).not.toMatch(/static let RENDUS/);
    expect(swift).not.toMatch(/@objc var rendu/);
    const expl = readFileSync(join(__dirname, '../src/components/Exploration.tsx'), 'utf8');
    expect(expl).not.toMatch(/rendu-visite/);
    expect(expl).toMatch(/MURS_DE_LA_VISITE = '#F6F1E8'/);
  });

  it('« enlève les textures sur les meubles » : plus de fil de bois ni de trame dessinés', () => {
    expect(swift).not.toMatch(/textureDuMeuble/);
    const meuble = swift.slice(swift.indexOf('private static func materiauDuMeuble'), swift.indexOf('static func teinteReelle'));
    expect(meuble).not.toMatch(/contentsTransform/);
  });

  it('le parquet garde son veinage, les meubles leur teinte de matière et leur ombre de contact', () => {
    // Le sol se dessine sur la file de fond : le rendu y arrive en paramètre.
    expect(swift).toMatch(/let avecVeinage = choix\.veinage/);
    expect(swift).toMatch(/teinte = Self\.teinteReelle\(teinteRelevee, plafond: plafond\)/);
    expect(swift).toMatch(/RoomScanVisite\.imageDOmbre\(choix\.ombre\)/);
    expect(swift).toMatch(/matiereContour\.transparency = maquette \? 0\.32 : choix\.lisere/);
  });

  it('plus de lumière diffuse ajoutée aux murs : le bâti revient à sa matière Lambert d’avant', () => {
    expect(swift).not.toMatch(/nuanceurRebond|rebond/);
    // Bâti sur la file de fond (relevé « pont natif lourd »), accroché ensuite.
    expect(swift).toMatch(/if let g = geometrie\(c\.maillage, deuxFaces: true\) \{\n\s*o\.matieresDuBati\.append\(contentsOf: g\.materials\)\n\s*noeuds\.append\(SCNNode\(geometry: g\)\)/);
    expect(swift).toMatch(/for noeud in noeuds \{ gBati\.addChildNode\(noeud\) \}/);
  });
});
