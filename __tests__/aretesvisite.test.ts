/**
 * LES ARÊTES DU BÂTI ET LE BLANC DES MURS EN VISITE — relevés du patron :
 *   — « ajoute des arêtes légères sur les murs et plafonds, plus visibles, et
 *     autour des ouvrants sans porte ; on doit mieux voir les fins de chaque
 *     pan de mur » ;
 *   — « ajoute la couleur blanc pur sur la teinte des murs ; en visite, le
 *     plus blanc donne un gris ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aretesDuBati } from '../src/geometry/visite3d';
import { PEINTURES, hexDePeinture } from '../src/ui/peintures';

const swift = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScanVisite.swift'), 'utf8');

const P = (x: number, y: number, z: number) => ({ x, y, z });

describe('les arêtes du bâti', () => {
  it('un angle de pièce laisse un trait ; deux pans d’un même mur, non', () => {
    // Deux pans côte à côte dans le plan z = 0 (normale +z), et un mur en retour (normale +x).
    const pan1 = { pts: [P(0, 0, 0), P(1, 0, 0), P(1, 2.5, 0), P(0, 2.5, 0)], n: P(0, 0, 1) };
    const pan2 = { pts: [P(1, 0, 0), P(2, 0, 0), P(2, 2.5, 0), P(1, 2.5, 0)], n: P(0, 0, 1) };
    const retour = { pts: [P(0, 0, 3), P(0, 0, 0), P(0, 2.5, 0), P(0, 2.5, 3)], n: P(1, 0, 0) };
    const a = aretesDuBati([pan1, pan2, retour]);
    const segments = Array.from({ length: a.length / 6 }, (_, k) => a.slice(k * 6, k * 6 + 6));
    const vertical = (x: number, z: number) =>
      segments.some((s) => Math.abs(s[0] - x) < 0.01 && Math.abs(s[3] - x) < 0.01 && Math.abs(s[2] - z) < 0.01 && Math.abs(s[1] - s[4]) > 2);
    // L'angle en x = 0 : un trait (décollé de quatre millimètres vers la pièce).
    expect(vertical(0.0028, 0.0028)).toBe(true);
    // Le joint des deux pans en x = 1 : rien.
    expect(segments.some((s) => Math.abs(s[0] - 1) < 0.01 && Math.abs(s[3] - 1) < 0.01 && Math.abs(s[1] - s[4]) > 2)).toBe(false);
  });

  it('la visite les reçoit, le natif les trace d’un trait léger', () => {
    const expl = readFileSync(join(__dirname, '../src/components/Exploration.tsx'), 'utf8');
    expect(expl).toMatch(/aretes=\{maille\.aretes\}/);
    expect(swift).toMatch(/primitiveType: \.line/);
    expect(swift).toMatch(/m\.transparency = 0\.42/);
    const m = readFileSync(join(__dirname, '../modules/react-native-room-scan/ios/RoomScan.m'), 'utf8');
    expect(m).toMatch(/RCT_EXPORT_VIEW_PROPERTY\(aretes, NSArray\)/);
  });
});

describe('le blanc des murs', () => {
  it('le blanc pur est dans la palette, juste après le blanc cassé de départ', () => {
    expect(PEINTURES[0].cle).toBe('blanc');
    expect(PEINTURES[1]).toEqual({ cle: 'blancPur', nom: 'Blanc pur', hex: '#FFFFFF' });
    expect(hexDePeinture('blancPur')).toBe('#FFFFFF');
  });

  it('en visite, murs et plafonds reçoivent un quart de leur teinte : un blanc reste blanc', () => {
    expect(swift).toMatch(/static let CLARTE_DES_MURS: CGFloat = 0\.25/);
    expect(swift).toMatch(/_output\.color\.rgb \+= _surface\.diffuse\.rgb \* clarte;/);
    // Ni en maquette, ni sur les meubles.
    expect(swift).toMatch(/modePose == false \? Self\.CLARTE_DES_MURS : 0/);
    const meuble = swift.slice(swift.indexOf('private func materiauDuMeuble'), swift.indexOf('static func teinteReelle'));
    expect(meuble).not.toMatch(/nuanceurClarte/);
  });
});
