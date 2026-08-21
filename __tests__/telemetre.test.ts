/**
 * LE TÉLÉMÈTRE LASER — ce qu'on fait d'une mesure qui arrive.
 *
 * RoomPlan se trompe de deux à trois centimètres sur une pièce : sans
 * conséquence pour un plan d'ambiance, trop pour percer. Le mètre laser
 * donne le millimètre — et le donne devant le client, ce qui compte autant.
 *
 * Mais une mesure qui arrive par la radio ne dit PAS ce qu'elle mesure. Le
 * télémètre ne sait pas quel mur on vise ; il envoie un nombre. Tout le
 * métier est là : décider si ce nombre peut être la cote qu'on croit
 * corriger, et refuser d'écraser un relevé sur un doute.
 */
import {
  auCentimetre,
  ecartAuScan,
  mesurePlausible,
} from '../src/geometry/telemetre';

describe('une mesure crédible', () => {
  it('accepte ce qu’on mesure dans un logement', () => {
    expect(mesurePlausible(0.85)).toBe(true);
    expect(mesurePlausible(2.5)).toBe(true);
    expect(mesurePlausible(12)).toBe(true);
  });

  it('refuse le zéro, le négatif et l’absurde', () => {
    // Le télémètre envoie parfois une trame vide entre deux mesures, et
    // une erreur de visée donne des valeurs de stade de football.
    expect(mesurePlausible(0)).toBe(false);
    expect(mesurePlausible(-3)).toBe(false);
    expect(mesurePlausible(NaN)).toBe(false);
    expect(mesurePlausible(250)).toBe(false);
  });

  it('refuse le millimètre isolé : ce n’est pas une cote de bâtiment', () => {
    // Sous cinq centimètres, on ne mesure pas un mur : on a visé sa propre
    // main, ou le télémètre s'est déclenché dans la poche.
    expect(mesurePlausible(0.02)).toBe(false);
  });
});

describe('la cote qu’on inscrit', () => {
  it('s’arrête au centimètre', () => {
    // Le laser donne le millimètre ; un plan de bâtiment se cote au
    // centimètre. Écrire 3,472 m sur une élévation, c'est promettre une
    // précision que la maçonnerie n'a pas.
    expect(auCentimetre(3.4721)).toBe(3.47);
    expect(auCentimetre(2.505)).toBe(2.51);
    expect(auCentimetre(0.999)).toBe(1);
  });
});

describe('le garde-fou : viser le bon mur', () => {
  it('ne dit rien quand la mesure confirme le scan', () => {
    // Deux centimètres d'écart sur trois mètres : c'est exactement ce
    // qu'on vient corriger, et c'est normal.
    expect(ecartAuScan(3.44, 3.42).suspect).toBe(false);
  });

  it('alerte quand l’écart ne peut pas être une erreur de scan', () => {
    /*
      Le télémètre ne sait pas quel mur on vise. Braqué sur la cloison d'en
      face au lieu du mur sélectionné, il envoie une cote parfaitement
      valable — et qui écraserait un relevé juste. Un mètre d'écart sur
      trois, ce n'est plus une imprécision de LiDAR : c'est un autre mur.
    */
    const k = ecartAuScan(2.1, 3.42);
    expect(k.suspect).toBe(true);
    expect(k.ecart).toBeCloseTo(-1.32, 2);
  });

  it('juge en proportion, pas en centimètres secs', () => {
    // Vingt centimètres sur un mur de six mètres, c'est un scan moyen.
    // Vingt centimètres sur un placard de quatre-vingts, c'est autre chose.
    expect(ecartAuScan(6.2, 6).suspect).toBe(false);
    expect(ecartAuScan(1, 0.8).suspect).toBe(true);
  });

  it('sans cote de référence, rien n’est suspect', () => {
    // Un mur qu'on cote pour la première fois n'a rien à contredire.
    expect(ecartAuScan(3.4, null).suspect).toBe(false);
    expect(ecartAuScan(3.4, 0).suspect).toBe(false);
  });
});
