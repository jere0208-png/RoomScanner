/**
 * LES OUVERTURES ET L'ÉCHELLE — le moment où un dessin devient un relevé.
 *
 * Jusqu'ici tout se comptait en pixels. Ici le plan prend ses cotes, et
 * c'est là que se joue l'utilité de la fonction entière : un plan
 * d'électricien faux d'un dixième est pire qu'un plan absent — on commande
 * la gaine dessus, on perce dessus, on chiffre dessus.
 *
 * Le banc suit les quatre sources d'échelle, de la plus sûre à la dernière :
 * les cotes écrites du plan, l'échelle déclarée, les portes du bâti
 * français, et la main. Et il vérifie qu'aucune ne se prend pour une autre :
 * `Echelle.origine` accompagne le relevé jusqu'à l'écran, parce qu'un plan
 * calé sur des portes n'a pas le même statut qu'un plan calé sur les cotes
 * du bureau d'études.
 */
import { binariser, effacerBoites } from '../src/papier/image';
import { photographierPlanche } from '../src/papier/simulateur';
import { T1 } from '../src/papier/planches';
import { fusionnerTraits, segmentsDe } from '../src/papier/traits';
import { calerSurLeMasque, mursDesTraits, souderLesCoins } from '../src/papier/murs';
import { ouverturesDesMurs } from '../src/papier/ouvertures';
import {
  choisirEchelle,
  echelleALaMain,
  echelleDeclaree,
  echelleParCotes,
  echelleParPortes,
  lireUneCote,
} from '../src/papier/echelle';

const lire = (reglage = {}) => {
  const photo = photographierPlanche(T1, { echelle: 100, ...reglage });
  const masque = effacerBoites(binariser(photo.image), photo.textes);
  const traits = fusionnerTraits(segmentsDe(masque));
  const murs = souderLesCoins(calerSurLeMasque(mursDesTraits(traits), masque));
  const ouvertures = ouverturesDesMurs(murs, masque, traits);
  return { photo, masque, traits, murs, ouvertures };
};

describe('lire une cote écrite', () => {
  it('comprend les trois écritures d’un plan français', () => {
    // Mètres à deux décimales : la forme la plus courante.
    expect(lireUneCote('3.50')).toBeCloseTo(3.5, 3);
    expect(lireUneCote('3,50')).toBeCloseTo(3.5, 3);
    expect(lireUneCote('10.83')).toBeCloseTo(10.83, 3);
    // Centimètres, la forme des plans de menuiserie.
    expect(lireUneCote('350')).toBeCloseTo(3.5, 3);
    // Millimètres, la forme des bureaux d’études.
    expect(lireUneCote('3500')).toBeCloseTo(3.5, 3);
  });

  it('ne prend pas une largeur sur hauteur pour une longueur', () => {
    // « 1.60/2.48 » cote une menuiserie : largeur, puis hauteur. Seule la
    // largeur est une longueur du plan.
    expect(lireUneCote('1.60/2.48')).toBeCloseTo(1.6, 3);
  });

  it('refuse ce qui n’est pas une longueur', () => {
    // Une surface écrite dans un cartouche de pièce a exactement l'allure
    // d'une cote, et fausserait l'échelle de moitié si on la comptait.
    expect(lireUneCote('S : 12.73 m²')).toBeNull();
    expect(lireUneCote('12.73 m2')).toBeNull();
    expect(lireUneCote('1:50')).toBeNull();
    expect(lireUneCote('Chambre 1')).toBeNull();
    expect(lireUneCote('VR MOT')).toBeNull();
  });
});

describe('les ouvertures du T1', () => {
  const { ouvertures, murs } = lire();

  it('trouve la porte et la fenêtre, et rien d’autre', () => {
    expect(ouvertures).toHaveLength(2);
    expect(ouvertures.filter((o) => o.nature === 'porte')).toHaveLength(1);
    expect(ouvertures.filter((o) => o.nature === 'fenetre')).toHaveLength(1);
  });

  it('les mesure : 83 cm pour la porte, 1,20 m pour la fenêtre', () => {
    const porte = ouvertures.find((o) => o.nature === 'porte')!;
    const fenetre = ouvertures.find((o) => o.nature === 'fenetre')!;
    // À cent pixels par mètre, et à l'anticrénelage près.
    expect(porte.largeur).toBeGreaterThan(75);
    expect(porte.largeur).toBeLessThan(95);
    expect(fenetre.largeur).toBeGreaterThan(110);
    expect(fenetre.largeur).toBeLessThan(132);
  });

  it('les pose sur le bon mur, à la bonne cote', () => {
    const porte = ouvertures.find((o) => o.nature === 'porte')!;
    const mur = murs[porte.mur];
    // La porte est sur le refend, qui est vertical et au milieu du plan.
    expect(Math.abs(mur.b.x - mur.a.x)).toBeLessThan(20);
    expect(mur.a.x).toBeGreaterThan(250);
    expect(mur.a.x).toBeLessThan(390);
    // Elle est centrée à 2,20 m du haut du refend, soit 220 px sur un mur
    // qui commence au ras du mur du haut.
    expect(porte.at).toBeGreaterThan(180);
    expect(porte.at).toBeLessThan(260);
  });

  it('dit de quel bord la porte pivote, quand le vantail se voit', () => {
    const porte = ouvertures.find((o) => o.nature === 'porte')!;
    // Pour un électricien ce n'est pas un détail de dessin : l'interrupteur
    // se pose du côté de la POIGNÉE, jamais du côté des paumelles.
    expect(porte.pivot).toBeDefined();
  });
});

describe('l’échelle', () => {
  const { photo, traits, ouvertures } = lire();

  it('se cale sur les cotes écrites du plan, au centimètre', () => {
    const e = echelleParCotes(photo.textes, traits)!;
    expect(e).not.toBeNull();
    expect(e.origine).toBe('cotes');
    // La planche est imprimée à cent pixels par mètre : on doit retrouver
    // cent, à deux pour cent près — soit huit centimètres sur quatre mètres.
    expect(e.pxParMetre).toBeGreaterThan(98);
    expect(e.pxParMetre).toBeLessThan(102);
  });

  it('sait aussi se caler sur les portes, quand rien n’est écrit', () => {
    const e = echelleParPortes(
      ouvertures.filter((o) => o.nature === 'porte').map((o) => o.largeur),
    )!;
    expect(e.origine).toBe('portes');
    // Une porte de 83 cm lue à 83 pixels : cent pixels par mètre, à dix
    // pour cent près — c'est une estimation, et elle s'annonce comme telle.
    expect(e.pxParMetre).toBeGreaterThan(90);
    expect(e.pxParMetre).toBeLessThan(112);
    expect(e.confiance).toBeLessThan(0.6);
    expect(e.detail).toMatch(/83 cm/);
  });

  it('calcule l’échelle déclarée d’un PDF au 1/50', () => {
    // 200 points par pouce au 1/50 : un mètre de mur fait 2 cm de papier,
    // soit 157 pixels.
    const e = echelleDeclaree(200, 50)!;
    expect(e.pxParMetre).toBeCloseTo(157.5, 0);
  });

  it('préfère les cotes du plan aux portes, et la main à tout', () => {
    const cotes = echelleParCotes(photo.textes, traits);
    const portes = echelleParPortes([83]);
    expect(choisirEchelle(portes, cotes)!.origine).toBe('cotes');
    const main = echelleALaMain(400, 4);
    expect(choisirEchelle(portes, cotes, main)!.origine).toBe('main');
    expect(choisirEchelle(null, null)).toBeNull();
  });

  it('tient malgré une photo de travers et une cote mal lue', () => {
    const { photo: p2, traits: t2 } = lire({ rotation: 6, ombre: 0.5 });
    // On glisse une cote fausse, comme un OCR qui lit 8 pour 3 : le vote
    // médian doit l'écarter au lieu de la moyenner.
    const menteuse = { ...p2.textes[0], texte: '850' };
    const e = echelleParCotes([...p2.textes, menteuse], t2)!;
    expect(e.pxParMetre).toBeGreaterThan(95);
    expect(e.pxParMetre).toBeLessThan(105);
  });
});
