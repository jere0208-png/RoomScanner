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
  it('la lumière d’une pièce ne touche que le bâti ; meubles et appareils portent l’autre masque', () => {
    expect(swift).toMatch(/l\.categoryBitMask = piece >= 0 \? Self\.masqueDeLaPiece\(piece\) : Self\.MASQUE_PIECE/);
    expect(swift).toMatch(/m\.categoryBitMask = Self\.MASQUE_MEUBLE/);
  });
});

describe('la température des lampes (relevé du patron : 2700, 3000, 4000 K, et autre)', () => {
  it('le natif reçoit la température, et en tire la teinte de toutes les lampes', () => {
    const m = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScan.m'), 'utf8');
    expect(m).toMatch(/RCT_EXPORT_VIEW_PROPERTY\(temperature, NSNumber\)/);
    expect(swift).toMatch(/@objc var temperature: NSNumber/);
    expect(swift).toMatch(/static func teinteDeKelvin/);
    // La lumière des pièces prend la teinte choisie.
    const bloc = swift.slice(swift.indexOf('private func lumiereDeLaPiece'), swift.indexOf('private func lumiereDeLaPiece') + 400);
    expect(bloc).toMatch(/l\.color = teinteDesLampes/);
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

describe('le rendu retenu : C, « Chaleureux du soir » (relevé du patron)', () => {
  const r = (() => {
    const m = swift.match(
      /static let RENDU = Rendu\(\s*eteint: \((\d+), (\d+), (\d+)\), allume: \((\d+), (\d+), (\d+)\), rebond: \(([\d.]+), ([\d.]+)\), lisere: ([\d.]+),\s*albedoMeubles: ([\d.]+), albedoSol: ([\d.]+), veinage: (true|false), ombre: ([\d.]+), lampes: ([\d.]+)/,
    )!;
    return {
      eteint: [1, 2, 3].map((k) => Number(m[k])),
      allume: [4, 5, 6].map((k) => Number(m[k])),
      rebond: [Number(m[7]), Number(m[8])],
      lampes: Number(m[14]),
    };
  })();

  it('« parfait en mode tout éteint » : l’éteint ne bouge pas', () => {
    expect(r.eteint).toEqual([300, 180, 90]);
    expect(r.rebond[0]).toBeCloseTo(0.22);
  });

  it('« la lumière ne doit pas agir sur les autres pièces » : allumer ne touche plus au jour du logement', () => {
    // Le jour du logement ne dépend que de la présence de lampes, pas de leur état.
    expect(swift).toMatch(/let j = maquette \? Self\.JOUR_MAQUETTE : sansLampes \? choix\.allume : choix\.eteint/);
    const bloc = swift.slice(swift.indexOf('private func appliquerLampes'), swift.indexOf('private func rebondDuMoment'));
    expect(bloc).not.toMatch(/ambiante\.intensity|jour\.intensity|contre\.intensity/);
    expect(bloc).toMatch(/let aucune = v\.count < Self\.PAR_LAMPE/);
    // Seule la pièce allumée gagne en clarté, au pourcentage du réglage.
    expect(swift).toMatch(/static let CLARTE_PIECE_ALLUMEE: CGFloat = 0\.08/);
    expect(swift).toMatch(/guard modePose == false, piecesEclairees\.contains\(piece\) else \{ return base \}/);
  });

  it('« on va sur 5 % » : la force des lampes au vingtième de celle de la 746', () => {
    expect(swift).toMatch(/static let FORCE_DES_LAMPES: CGFloat = 0\.6 \* 0\.05/);
    expect(swift).toMatch(/l\.intensity = puissance \* Self\.FORCE_DES_LAMPES/);
    expect(swift).toMatch(/static let CLARTE_PIECE_ALLUMEE: CGFloat = 0\.08 \* 0\.05/);
  });

  it('« la lumière d’un côté disparaît selon la distance », « sortir d’une pièce ne doit pas éteindre l’autre » : une lumière par pièce allumée, où que soit le visiteur', () => {
    const bloc = swift.slice(swift.indexOf('private func appliquerLampes'), swift.indexOf('private func rebondDuMoment'));
    // Plus de tri par distance ni de « source » réservée aux plus proches.
    expect(bloc).not.toMatch(/let source = /);
    expect(bloc).toMatch(/for \(piece, e\) in parPiece where e\.n > 0/);
    expect(bloc).toMatch(/lumiereDeLaPiece\(piece, en: c, puissance: e\.force\)/);
  });

  it('plus aucune lueur sur les meubles', () => {
    expect(swift).not.toMatch(/lueurDesMeubles/);
  });

  it('plus de choix de rendu ni de pastille : un seul rendu, les murs blancs chauds', () => {
    expect(swift).not.toMatch(/static let RENDUS/);
    expect(swift).not.toMatch(/@objc var rendu/);
    const expl = readFileSync(join(__dirname, '../src/components/Exploration.tsx'), 'utf8');
    expect(expl).not.toMatch(/rendu-visite/);
    expect(expl).toMatch(/MURS_DE_LA_VISITE = '#F6F1E8'/);
    expect(expl).toMatch(/testID="tout-allumer"/);
  });

  it('« enlève les textures sur les meubles » : plus de fil de bois ni de trame dessinés', () => {
    expect(swift).not.toMatch(/textureDuMeuble/);
    const meuble = swift.slice(swift.indexOf('private func materiauDuMeuble'), swift.indexOf('static func teinteReelle'));
    expect(meuble).not.toMatch(/contentsTransform/);
  });

  it('murs et plafonds reçoivent la lumière diffuse, meubles et sol non', () => {
    expect(swift).toMatch(/_output\.color\.rgb \+= _surface\.diffuse\.rgb \* rebond;/);
    const meuble = swift.slice(swift.indexOf('private func materiauDuMeuble'), swift.indexOf('static func teinteReelle'));
    expect(meuble).not.toMatch(/nuanceurRebond/);
  });

  it('le parcours de captures photographie la visite éteinte puis allumée', () => {
    const flow = readFileSync(join(__dirname, '../.maestro/06_visite_rendus.yaml'), 'utf8');
    expect(flow).toContain('60-visite-eteinte');
    expect(flow).toContain('61-visite-allumee');
  });
});

describe('sans aucune lampe, la visite est éclairée (relevé du patron : « éclairage allumé par défaut sans lampes »)', () => {
  it('la vue part allumée, et ne s’assombrit que si des lampes sont posées, toutes éteintes', () => {
    expect(swift).toMatch(/private var sansLampes = true/);
    expect(swift).toMatch(/ambiante\.intensity = RoomScanVisite\.RENDU\.allume\.ambiance/);
    // Pas de fondu avant la première image.
    expect(swift).toMatch(/SCNTransaction\.animationDuration = maquette \|\| !premiereAnnoncee \? 0 : 0\.45/);
  });
});

describe('une lampe, une pièce (relevé du patron : « elle ne doit pas agir sur les autres pièces »)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pieceDeLaFace, maillageDeLaVisite } = require('../src/geometry/visite3d');
  const salon = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
  const chambre = [{ x: 4, z: 0 }, { x: 7, z: 0 }, { x: 7, z: 3 }, { x: 4, z: 3 }];

  it('une face de cloison appartient à la pièce qu’elle regarde', () => {
    const cloison = [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }, { x: 4, y: 2.5, z: 3 }, { x: 4, y: 2.5, z: 0 }];
    expect(pieceDeLaFace(cloison, { x: -1, y: 0, z: 0 }, [salon, chambre])).toBe(0);
    expect(pieceDeLaFace(cloison, { x: 1, y: 0, z: 0 }, [salon, chambre])).toBe(1);
    // Hors de toute pièce : −1.
    expect(pieceDeLaFace([{ x: 20, y: 0, z: 20 }], { x: 0, y: 1, z: 0 }, [salon, chambre])).toBe(-1);
  });

  it('le maillage de visite donne une pièce par triangle et par sol', () => {
    const faces = [
      { pts: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }], fill: '#CCCCCC', isFloor: true },
      { pts: [{ x: 5, y: 2.5, z: 1 }, { x: 6, y: 2.5, z: 1 }, { x: 6, y: 2.5, z: 2 }], fill: '#FFFFFF', isCeiling: true },
    ];
    const m = maillageDeLaVisite(faces as never, { pieces: [salon, chambre] });
    expect(m.piecesDesSols).toEqual([0]);
    expect(m.piecesDuMaillage).toEqual([1]);
    expect(m.maillage.length / 12).toBe(m.piecesDuMaillage.length);
  });

  it('le natif découpe le bâti et les sols par pièce, et borne chaque lampe à la sienne', () => {
    expect(swift).toMatch(/private static func masqueDeLaPiece\(_ piece: Int\) -> Int/);
    expect(swift).toMatch(/n\.categoryBitMask = Self\.MASQUE_PIECE \| Self\.masqueDeLaPiece\(piece\)/);
    expect(swift).toMatch(/noeud\.categoryBitMask = Self\.MASQUE_PIECE \| Self\.masqueDeLaPiece\(piece\)/);
    expect(swift).toMatch(/static let PAR_LAMPE = 10/);
    const m = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScan.m'), 'utf8');
    expect(m).toMatch(/RCT_EXPORT_VIEW_PROPERTY\(piecesDuMaillage, NSArray\)/);
    expect(m).toMatch(/RCT_EXPORT_VIEW_PROPERTY\(piecesDesSols, NSArray\)/);
  });
});

describe('le réglage de la lumière a servi : il est retiré, 5 % retenu', () => {
  it('plus de réglage dans la visite ni de propriété native', () => {
    const expl = readFileSync(join(__dirname, '../src/components/Exploration.tsx'), 'utf8');
    expect(expl).not.toMatch(/intensite-moins|intensite-plus|intensite=\{/);
    const m = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScan.m'), 'utf8');
    expect(m).not.toMatch(/RCT_EXPORT_VIEW_PROPERTY\(intensite/);
  });
});
