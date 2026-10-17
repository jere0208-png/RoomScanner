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
  /*
    UNE SEULE AMBIANCE — une seconde ambiance « pour les meubles » (masquée par
    catégorie) avait été tentée : SceneKit n'applique pas ce masque aux
    lumières ambiantes, elle s'ajoutait donc sur tout, et la maquette sortait
    d'un blanc uni (murs, sols, meubles). Le banc ci-dessous empêche d'y revenir.
  */
  it('une seule lumière ambiante, sans masque de catégorie', () => {
    expect((swift.match(/\.type = \.ambient/g) ?? []).length).toBe(1);
    expect(swift).not.toMatch(/ambiante\w*\.categoryBitMask/);
  });

  it("l'environnement ne fait plus que le reflet du chrome", () => {
    expect(nombre(/scene\.lightingEnvironment\.intensity = ([\d.]+)/)).toBeLessThanOrEqual(0.25);
  });
});

describe('plus de lampe allumée dans la visite', () => {
  it('rien n’éclaire plus les meubles que le jour (relevé du patron : « supprime la possibilité d’éclairer la pièce »)', () => {
    expect(swift).not.toMatch(/lueurDesMeubles/);
    expect(swift).not.toMatch(/lumiereDeLaPiece|\.type = \.omni|\.type = \.spot/);
    expect(swift).not.toMatch(/categoryBitMask/);
  });
});
