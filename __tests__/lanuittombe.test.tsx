/**
 * LA NUIT TOMBE, ET LES LUMIÈRES S'ALLUMENT VRAIMENT.
 *
 * Relevé du patron : « propose des améliorations modernisant l'app et la
 * rendant plus ludique » — puis « fais tout ». Première idée, et la plus
 * parlante : on éteint la maquette, et toucher un interrupteur allume
 * RÉELLEMENT ce qu'il commande.
 *
 * TOUT EXISTAIT SAUF LA NUIT. L'app savait déjà quoi allume quoi (les
 * liens), tenait l'état des lampes allumées, et posait leurs halos. Mais en
 * plein jour, un halo ambre sur un sol crème ne se voit pas : on cliquait,
 * « il ne se passe rien ». Le crépuscule est ce qui manquait — pas une
 * fonction de plus, une CONDITION pour que celles d'avant se voient.
 *
 * CE QUE LA NUIT NE FAIT PAS : toucher au relevé. C'est un état de VISITE,
 * comme les lampes allumées — on essaie l'installation comme on le ferait
 * sur un chantier fini, et fermer la maquette rallume le jour.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: { isSupported: jest.fn(async () => true), viewModel: jest.fn(async () => false) },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
}));

import { crepuscule, ECLAT_LAMPE, MAQUETTE } from '../src/ui/maquette';

/** La luminance d'une teinte : c'est elle qu'on mesure, pas le nom. */
const lum = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

describe('le crépuscule de la maquette', () => {
  it('assombrit tout ce qui est bâti : sol, murs, meubles', () => {
    const nuit = crepuscule(MAQUETTE);
    for (const cle of ['floor', 'wall', 'wallTop', 'object'] as const) {
      expect(lum(nuit[cle])).toBeLessThan(lum(MAQUETTE[cle]) * 0.6);
    }
  });

  it('mais garde la CHALEUR du jour : une nuit bleue est une nuit de film', () => {
    /*
      Un crépuscule qui vire au bleu-gris fait un écran technique de plus —
      exactement ce que la maquette a fui. On descend la luminosité et l'on
      garde la teinte : le sable devient une pénombre de sable.
    */
    const jour = MAQUETTE.floor;
    const nuit = crepuscule(MAQUETTE).floor;
    const rouge = (h: string) => (parseInt(h.replace('#', ''), 16) >> 16) & 255;
    const bleu = (h: string) => parseInt(h.replace('#', ''), 16) & 255;
    expect(rouge(jour)).toBeGreaterThan(bleu(jour));
    expect(rouge(nuit)).toBeGreaterThan(bleu(nuit));
  });

  it('et les menuiseries gardent leur rôle : elles désignent, elles ne décorent pas', () => {
    // Portes et fenêtres restent lisibles la nuit : ce sont des repères de
    // lecture, pas de la matière.
    const nuit = crepuscule({ ...MAQUETTE, door: '#E8A13B', window: '#4C8DF6' });
    expect(nuit.door).toBe('#E8A13B');
    expect(nuit.window).toBe('#4C8DF6');
  });

  it('deux fois de suite ne fait pas deux nuits', () => {
    // Le contre-sens : la palette dérivée doit être stable, sinon un rendu
    // qui la recalcule enfonce la scène dans le noir à chaque image.
    const une = crepuscule(MAQUETTE);
    const deux = crepuscule(MAQUETTE);
    expect(deux).toEqual(une);
  });
});

describe('la lampe éclaire plus fort la nuit', () => {
  it('sinon on éteint la maquette sans rien gagner', () => {
    /*
      Le piège de la moitié du travail : assombrir le bâti et laisser les
      halos tels quels, c'est perdre des deux côtés — la pénombre gagne, la
      lampe reste timide, et l'écran a l'air en panne.
    */
    for (const cle of ['nappe', 'coeur'] as const) {
      const [basJ, hautJ] = ECLAT_LAMPE.jour[cle];
      const [basN, hautN] = ECLAT_LAMPE.nuit[cle];
      expect(basN).toBeGreaterThan(basJ);
      expect(hautN).toBeGreaterThan(hautJ);
      // Et l'on reste dans une opacité valable : un halo au-delà de un est
      // un halo qui ne respire plus.
      expect(hautN).toBeLessThanOrEqual(1);
    }
  });
});

describe('le bouton de la nuit', () => {
  it('existe dans la barre d’outils 3D, avec sa lune', () => {
    /*
      Par la mesure du code source, comme `motsclairs` : la pastille vit
      dans la rangée du mode VOLUME (elle n'a pas de sens sur un plan 2D),
      et porte l'icône `lune` du jeu Solar.
    */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'result', 'ResultToolbar.tsx'),
      'utf8',
    );
    expect(src).toContain('icon="lune"');
    expect(src).toContain('label="Nuit"');
  });
});
