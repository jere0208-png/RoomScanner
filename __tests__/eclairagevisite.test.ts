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

describe('les quatre rendus de la visite (relevé du patron : « quatre propositions, je choisirai »)', () => {
  const rendus = (() => {
    const bloc = swift.slice(swift.indexOf('static let RENDUS: [Rendu] = ['), swift.indexOf('/// Le rendu choisi'));
    return [...bloc.matchAll(/Rendu\(\s*eteint: \((\d+), (\d+), (\d+)\), allume: \((\d+), (\d+), (\d+)\), rebond: \(([\d.]+), ([\d.]+)\), lisere: ([\d.]+),\s*albedoMeubles: (nil|[\d.]+), albedoSol: (nil|[\d.]+), veinage: (true|false), ombre: ([\d.]+), lampes: ([\d.]+)/g)].map(
      (m) => ({
        eteint: [1, 2, 3].map((k) => Number(m[k])),
        allume: [4, 5, 6].map((k) => Number(m[k])),
        rebond: [Number(m[7]), Number(m[8])],
        lisere: Number(m[9]),
        albedoMeubles: m[10] === 'nil' ? null : Number(m[10]),
        veinage: m[12] === 'true',
        ombre: Number(m[13]),
        lampes: Number(m[14]),
      }),
    );
  })();

  it('quatre rendus côté natif, quatre côté app, dans le même ordre', () => {
    expect(rendus).toHaveLength(4);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RENDUS_VISITE } = require('../src/store/renduVisite');
    expect(RENDUS_VISITE.map((r: { lettre: string }) => r.lettre)).toEqual(['A', 'B', 'C', 'D']);
    const m = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScan.m'), 'utf8');
    expect(m).toMatch(/RCT_EXPORT_VIEW_PROPERTY\(rendu, NSNumber\)/);
  });

  it('dans chacun, allumer ajoute de la lumière — jamais n’assombrit', () => {
    for (const r of rendus) {
      r.eteint.forEach((v, i) => expect(r.allume[i]).toBeGreaterThan(v));
      expect(r.rebond[1]).toBeLessThanOrEqual(r.rebond[0]);
    }
    const bloc = swift.slice(swift.indexOf('private func appliquerLampes'), swift.indexOf('private func rebondDuMoment'));
    expect(bloc).not.toMatch(/ambiante\.intensity|jour\.intensity|contre\.intensity/);
    expect(bloc).toMatch(/let eclairee = allumees > 0 \|\| v\.count < 9/);
    expect(swift).toMatch(/lumiereAllumee \? choix\.allume : choix\.eteint/);
  });

  it('A garde les matières d’avant aujourd’hui, avec la lumière et le ciel d’aujourd’hui', () => {
    const a = rendus[0];
    expect(a.eteint).toEqual([380, 250, 115]);
    expect(a.allume).toEqual([600, 400, 190]);
    expect(a.rebond).toEqual([0, 0]);
    expect(a.lisere).toBeCloseTo(0.32);
    expect(a.albedoMeubles).toBeNull();
    expect(a.veinage).toBe(false);
  });

  it('la lueur des meubles reste sous le dixième de l’ambiance la plus sombre des rendus', () => {
    const lueur = Number((swift.slice(swift.indexOf('private func lueurDesMeubles')).match(/l\.intensity = (\d+)/) ?? [])[1]);
    const plusSombre = Math.min(...rendus.map((r) => r.eteint[0]));
    expect(lueur).toBeLessThanOrEqual(plusSombre * 0.1);
  });

  it('les murs du rendu viennent de l’app ; le natif règle le reste, et la visite se réveille au changement', () => {
    const expl = readFileSync(join(__dirname, '../src/components/Exploration.tsx'), 'utf8');
    expect(expl).toMatch(/wallInside: RENDUS_VISITE\[rendu\]\?\.murs/);
    expect(expl).toMatch(/rendu=\{rendu\}/);
    expect(expl).toMatch(/testID="rendu-visite"/);
    expect(expl).toMatch(/testID="tout-allumer"/);
    expect(swift).toMatch(/rebatir\(\[\.meubles, \.sols\]\)/);
  });

  it('murs et plafonds reçoivent la lumière diffuse du rendu, meubles et sol non', () => {
    expect(swift).toMatch(/_output\.color\.rgb \+= _surface\.diffuse\.rgb \* rebond;/);
    const meuble = swift.slice(swift.indexOf('private func materiauDuMeuble'), swift.indexOf('static func teinteReelle'));
    expect(meuble).not.toMatch(/nuanceurRebond/);
    const sols = swift.slice(swift.indexOf('private func noeudsDesSols'));
    expect(sols.slice(0, 4000)).not.toMatch(/nuanceurRebond/);
  });

  it('le plafond : un ton plus clair que les murs', () => {
    const scene = readFileSync(join(__dirname, '../src/geometry/scene3d.ts'), 'utf8');
    expect(scene).toMatch(/fill: mixHex\(pal\.wallInside \?\? pal\.wall, '#FFFFFF', 0\.35\)/);
  });

  it('le parcours de captures photographie les quatre rendus, éteints puis allumés', () => {
    const flow = readFileSync(join(__dirname, '../.maestro/06_visite_rendus.yaml'), 'utf8');
    for (const l of ['A', 'B', 'C', 'D']) {
      expect(flow).toContain(`rendu-${l}-eteint`);
      expect(flow).toContain(`rendu-${l}-allume`);
    }
  });
});

describe('sans aucune lampe, la visite est éclairée (relevé du patron : « éclairage allumé par défaut sans lampes »)', () => {
  it('la vue part allumée, et ne s’assombrit que si des lampes sont posées, toutes éteintes', () => {
    expect(swift).toMatch(/private var lumiereAllumee = true/);
    expect(swift).toMatch(/ambiante\.intensity = RoomScanVisite\.RENDUS\[0\]\.allume\.ambiance/);
    // Pas de fondu avant la première image.
    expect(swift).toMatch(/SCNTransaction\.animationDuration = maquette \|\| !premiereAnnoncee \? 0 : 0\.45/);
  });
});
