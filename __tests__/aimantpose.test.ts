/**
 * ON POSE A LA COTE DU METIER, PAS A LA HAUTEUR DU DOIGT.
 *
 * Releve du patron : « lors d'un scan, j'aimerais qu'on pose de maniere
 * logique les elements et non EXACTEMENT la ou on cible. Si l'utilisateur
 * vise le bas d'un mur, on cible bien l'endroit du mur, mais on place la
 * prise directement a 25 cm ; si l'utilisateur vise le milieu du mur,
 * 110 cm (prise credence par exemple). Pareil pour les lumieres, on met
 * automatiquement 1 m 90. »
 *
 * C'est la difference entre un releve et un PLAN D'EXECUTION. Personne ne
 * pose une prise a 23,7 cm : on pose a 25, et c'est ce qui se percera. Un
 * viseur tenu a bout de bras dans une piece vide donne le centimetre pres —
 * autant dire un chiffre faux, qu'il faudra corriger un par un a la table.
 *
 * LA COTE VISEE CHOISIT LE PALIER, elle ne le remplace pas. Viser le bas
 * d'un mur veut dire « plinthe » ; viser a mi-hauteur veut dire « au-dessus
 * du plan de travail ». C'est l'INTENTION qu'on lit dans le geste, et on la
 * traduit dans la cote que le metier emploie.
 *
 * ET L'ON NE DEVINE QUE CE QUI SE DEVINE : un appareil qui n'a qu'une seule
 * cote usuelle y va toujours, et celui qu'on pose hors de toute cote connue
 * garde sa hauteur — mieux vaut un chiffre releve qu'un chiffre invente.
 */
import { aimanterHauteur, palierProche } from '../src/geometry/viseur';

describe('la hauteur d’une pose au viseur', () => {
  it('vise le bas d’un mur : prise de plinthe a 25 cm', () => {
    expect(aimanterHauteur('prise', 0.18).hauteur).toBeCloseTo(0.25, 3);
    expect(aimanterHauteur('prise', 0.31).hauteur).toBeCloseTo(0.25, 3);
  });

  it('vise le milieu : prise de credence a 110 cm', () => {
    expect(aimanterHauteur('prise', 0.96).hauteur).toBeCloseTo(1.1, 3);
    expect(aimanterHauteur('prise', 1.24).hauteur).toBeCloseTo(1.1, 3);
  });

  it('une applique va a 1,90 m', () => {
    expect(aimanterHauteur('applique', 1.72).hauteur).toBeCloseTo(1.9, 3);
    expect(aimanterHauteur('applique', 2.05).hauteur).toBeCloseTo(1.9, 3);
  });

  it('un interrupteur va a 1,10 m', () => {
    expect(aimanterHauteur('inter', 1.02).hauteur).toBeCloseTo(1.1, 3);
  });

  it('et le message dit ce qui a ete pose, en clair', () => {
    // « Prise plinthe placee a 25 cm » — releve du patron : un message doit
    // apparaitre sans gener. Il nomme le palier retenu, pas le type brut :
    // c'est le palier qui explique pourquoi la cote n'est pas celle du
    // doigt.
    expect(aimanterHauteur('prise', 0.18).mot).toMatch(/plinthe/i);
    expect(aimanterHauteur('prise', 0.18).mot).toMatch(/25/);
    expect(aimanterHauteur('prise', 1.05).mot).toMatch(/110|1,10/);
  });

  it('garde la cote relevee quand on vise hors de toute cote connue', () => {
    /*
      MIEUX VAUT UN CHIFFRE RELEVE QU'UN CHIFFRE INVENTE.

      Une prise visee a deux metres n'est ni une plinthe ni une credence :
      c'est probablement une attente de televiseur, ou une erreur de visee.
      Dans les deux cas, la ramener de force a 1,10 m effacerait ce que
      l'electricien a vu de ses yeux.
    */
    const loin = aimanterHauteur('prise', 2.0);
    expect(loin.hauteur).toBeCloseTo(2.0, 3);
    expect(loin.mot).toBeNull();
  });

  it('un appareil a cote unique y va toujours', () => {
    // Un tableau se pose entre 90 cm et 1,80 m, et sa cote usuelle est
    // 1,35 : viser haut ou bas ne change pas ce qu'on va poser.
    expect(aimanterHauteur('tableau', 1.6).hauteur).toBeCloseTo(1.35, 3);
  });

  it('le palier le plus proche gagne, et la frontiere est nette', () => {
    // A mi-chemin entre 25 et 110, on bascule : 67,5 cm.
    expect(palierProche([0.25, 1.1], 0.6)).toBeCloseTo(0.25, 3);
    expect(palierProche([0.25, 1.1], 0.75)).toBeCloseTo(1.1, 3);
  });
});
