/**
 * LA LUMIÈRE DE LA VISITE ET DE LA MAQUETTE — relevés du patron :
 *   — « les murs intérieurs lors de la visite et 3D sont de base trop gris ;
 *     donne-leur un ton plus beige » ;
 *   — « les éléments élec sont trop sous faible luminosité sans lumière, ils
 *     sont trop gris ; ajoute-leur un peu de lumière même sans lumière de
 *     pièce » ;
 *   — « la lumière plafond éclaire encore beaucoup trop les meubles et
 *     éléments élec ; elle doit être perceptible sur les murs mais très peu
 *     sur les meubles et éléments : max 10 % de leur couleur de base ».
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

describe('la lampe du plafond, sur les meubles et l’appareillage : au plus 10 %', () => {
  const nombre = (re: RegExp, src = swift) => Number((src.match(re) ?? [])[1]);

  it('la lueur des meubles reste sous le dixième de l’ambiance la plus sombre', () => {
    const lueur = nombre(/l\.intensity = (\d+)/, swift.slice(swift.indexOf('private func lueurDesMeubles')));
    const eteint = nombre(/JOUR_ETEINT: \(ambiance: CGFloat, jour: CGFloat, contre: CGFloat\) = \((\d+)/);
    expect(eteint).toBeGreaterThan(0);
    expect(lueur).toBeLessThanOrEqual(eteint * 0.1);
  });

  it('allumer AJOUTE de la lumière, en fondu — jamais n’assombrit', () => {
    const bloc = swift.slice(swift.indexOf('private func appliquerLampes'), swift.indexOf('private func reglerLeJour'));
    // Les lampes ne touchent pas elles-mêmes au jour : elles passent par
    // `reglerLeJour`, qui choisit entre l'éteint et l'allumé.
    expect(bloc).not.toMatch(/ambiante\.|jour\.intensity|contre\./);
    expect(bloc).toMatch(/lumiereAllumee = allumees > 0/);
    const regle = swift.slice(swift.indexOf('private func reglerLeJour'));
    expect(regle.slice(0, 600)).toMatch(/lumiereAllumee \? Self\.JOUR_ALLUME : Self\.JOUR_ETEINT/);
    expect(regle.slice(0, 600)).toMatch(/SCNTransaction\.animationDuration = maquette \? 0 : 0\.45/);
  });

  it('la visite est plus sombre de base ; allumer lui rend la lumière d’avant (relevé du patron)', () => {
    const jour = (nom: string) => {
      const m = swift.match(new RegExp(nom + ': \\(ambiance: CGFloat, jour: CGFloat, contre: CGFloat\\) = \\((\\d+), (\\d+), (\\d+)\\)'));
      return (m ?? []).slice(1).map(Number);
    };
    const eteint = jour('JOUR_ETEINT');
    const allume = jour('JOUR_ALLUME');
    expect(eteint).toHaveLength(3);
    expect(allume).toHaveLength(3);
    // L'ancienne visite, éteinte : 620, 420, 200. Allumée, on la retrouve
    // à cinq pour cent près ; éteinte, on descend d'un bon tiers.
    [620, 420, 200].forEach((avant, i) => {
      expect(Math.abs(allume[i] - avant) / avant).toBeLessThanOrEqual(0.05);
      expect(eteint[i]).toBeLessThanOrEqual(avant * 0.65);
    });
    // La vue s'ouvre éteinte.
    expect(swift).toMatch(/ambiante\.intensity = Self\.JOUR_ETEINT\.ambiance/);
  });

  it('les faisceaux ne touchent que le bâti, meubles et appareils portent l’autre masque', () => {
    expect(swift).toMatch(/l\.categoryBitMask = Self\.MASQUE_PIECE/);
    expect(swift).toMatch(/m\.categoryBitMask = Self\.MASQUE_MEUBLE/);
  });
});

describe('la température des lampes (relevé du patron : 2700, 3000, 4000 K, et autre)', () => {
  it('le natif reçoit la température, et en tire la teinte de toutes les lampes', () => {
    const m = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScan.m'), 'utf8');
    expect(m).toMatch(/RCT_EXPORT_VIEW_PROPERTY\(temperature, NSNumber\)/);
    expect(swift).toMatch(/@objc var temperature: NSNumber/);
    expect(swift).toMatch(/static func teinteDeKelvin/);
    // Les faisceaux prennent la teinte choisie.
    const bloc = swift.slice(swift.indexOf('private func lumieres'), swift.indexOf('private func lumieres') + 600);
    expect(bloc).toMatch(/teinteDesLampes/);
  });

  it('le réglage passe de 2700 à 3000, 4000, 6500 K, puis recommence', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useTemperatureLampes, TEMPERATURES } = require('../src/store/temperatureLampes');
    expect(TEMPERATURES.map((t: { k: number }) => t.k)).toEqual([2700, 3000, 4000, 6500]);
    useTemperatureLampes.setState({ kelvin: 2700 });
    const vus = [1, 2, 3, 4].map(() => useTemperatureLampes.getState().suivante());
    expect(vus).toEqual([3000, 4000, 6500, 2700]);
  });
});

describe('rien ne blanchit plus sous la lampe (relevé du patron : « tout devient blanc »)', () => {
  it('le halo s’efface quand on s’en approche', () => {
    const bloc = swift.slice(swift.indexOf('private lazy var matiereDuHalo'));
    expect(bloc.slice(0, 2000)).toMatch(/smoothstep\(1\.0, 2\.5, length\(_surface\.position\)\)/);
  });

  it('la couleur d’un meuble ne dépasse pas sa teinte de plus de 15 %', () => {
    expect(swift).toMatch(/_output\.color\.rgb = min\(_output\.color\.rgb, _surface\.diffuse\.rgb \* 1\.15 \+ _surface\.emission\.rgb\)/);
    const bloc = swift.slice(swift.indexOf('private func materiauDuMeuble'));
    expect(bloc).toMatch(/nuanceurPlafondDesMeubles/);
  });
});

describe('le semi-réalisme de la visite (relevé du patron : « trop dessin animé »)', () => {
  it("le liseré se règle selon la vue, maquette ou visite", () => {
    expect(swift).toMatch(/if let coque = noeudDeContour/);
  });

  it('les matières pleines prennent une teinte de matière réelle : au plus huit dixièmes', () => {
    expect(swift).toMatch(/plafond: CGFloat = 0\.8/);
    expect(swift).toMatch(/let k: CGFloat = l > plafond \? plafond \/ l : 1/);
    const bloc = swift.slice(swift.indexOf('private func materiauDuMeuble'));
    expect(bloc.slice(0, 600)).toMatch(/Self\.teinteReelle\(teinteRelevee\)/);
  });

  it('le plafond : un ton plus clair que les murs, jamais le blanc pur', () => {
    const scene = readFileSync(join(__dirname, '../src/geometry/scene3d.ts'), 'utf8');
    expect(scene).toMatch(/fill: mixHex\(pal\.wallInside \?\? pal\.wall, '#FFFFFF', 0\.3\)/);
  });
});

describe('les murs restent blancs dans la pénombre (relevé du patron : « les murs sont trop gris »)', () => {
  it('murs et plafonds reçoivent la lumière diffuse de la pièce, en part de leur teinte', () => {
    expect(swift).toMatch(/_output\.color\.rgb \+= _surface\.diffuse\.rgb \* rebond;/);
    const geo = swift.slice(swift.indexOf('private func geometrie('));
    expect(geo.slice(0, 4000)).toMatch(/m\.shaderModifiers = \[\.fragment: Self\.nuanceurRebond\]/);
    const n = (nom: string) => Number((swift.match(new RegExp(`static let ${nom}: CGFloat = ([\\d.]+)`)) ?? [])[1]);
    // Éteint, un mur blanc remonte vers le blanc ; allumé, un peu moins de
    // rebond, la lampe faisant le reste.
    expect(n('REBOND_ETEINT')).toBeGreaterThanOrEqual(0.35);
    expect(n('REBOND_ALLUME')).toBeLessThan(n('REBOND_ETEINT'));
  });

  it('les meubles et le sol n’en reçoivent pas : ils se détachent du mur', () => {
    const meuble = swift.slice(swift.indexOf('private func materiauDuMeuble'), swift.indexOf('static func teinteReelle'));
    expect(meuble).not.toMatch(/nuanceurRebond/);
    const sols = swift.slice(swift.indexOf('private func noeudsDesSols'));
    expect(sols.slice(0, 4000)).not.toMatch(/nuanceurRebond/);
  });

  it('un liseré léger revient en visite (« les meubles se fondent dans le mur »)', () => {
    expect(swift).toMatch(/matiereContour\.transparency = maquette \? 0\.32 : 0\.2/);
    expect(swift).not.toMatch(/c\.isHidden = !maquette/);
  });

  it('le parquet a son veinage, et sa teinte de matière réelle', () => {
    expect(swift).toMatch(/LE FIL DU BOIS/);
    expect(swift).toMatch(/teinteReelle\(UIColor\([\s\S]{0,140}plafond: 0\.7\)/);
  });
});
