/**
 * LES MEUBLES GARDENT LEUR COULEUR EN VISITE — premier diagnostic envoyé par
 * le patron (vidéo) : « lumière trop forte sur les meubles, ça les rend
 * blancs ». Les meubles (matière physique) recevaient l'ambiance du bâti ET un
 * environnement fort : près de deux fois la lumière d'un mur.
 *
 * Banc de source : SceneKit ne tourne pas ici ; on garde les réglages qui
 * empêchent la saturation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const swift = readFileSync(
  join(__dirname, '..', 'modules/react-native-room-scan/ios/RoomScanVisite.swift'),
  'utf8',
);
const nombre = (re: RegExp) => Number((swift.match(re) ?? [])[1]);

describe('la lumière des meubles, en visite', () => {
  it('les meubles ont leur ambiance à eux, plus douce que celle du bâti', () => {
    expect(swift).toMatch(/ambiante\.categoryBitMask = Self\.MASQUE_PIECE/);
    expect(swift).toMatch(/ambianteMeubles\.categoryBitMask = Self\.MASQUE_MEUBLE/);
    const bati = nombre(/ambiante\.intensity = (\d+)\n/);
    const meubles = nombre(/ambianteMeubles\.intensity = (\d+)\n/);
    expect(meubles).toBeLessThan(bati * 0.75);
  });

  it("l'environnement ne fait plus que le reflet du chrome", () => {
    expect(nombre(/scene\.lightingEnvironment\.intensity = ([\d.]+)/)).toBeLessThanOrEqual(0.25);
  });
});

describe('la lampe allumée, sur les meubles', () => {
  it('sa lueur ne fait qu’effleurer les meubles (relevé du patron : « faible impact »)', () => {
    const bloc = swift.slice(swift.indexOf('private func lueurDesMeubles'));
    const intensite = Number((bloc.match(/l\.intensity = (\d+)/) ?? [])[1]);
    expect(intensite).toBeLessThanOrEqual(20);
    // Et les faisceaux des lampes ne touchent que le bâti.
    expect(swift).toMatch(/l\.categoryBitMask = Self\.MASQUE_PIECE/);
  });
});
