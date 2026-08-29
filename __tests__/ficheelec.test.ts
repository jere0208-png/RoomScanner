/**
 * LA FICHE D'UN APPAREIL QU'ON TOUCHE SANS ÊTRE EN ÉDITION.
 *
 * Relevé du patron : « un clic sur un interrupteur ou lumière ou autre élément
 * élec sans être dans le mode Édition doit juste afficher les liens circuits
 * en lien, et la possibilité de link à un inter. »
 *
 * Ça ouvrait l'ÉTABLI — la fiche d'élévation complète, ses flèches au
 * centimètre, ses champs de cote et son bouton « Retirer ». Un atelier, pour
 * quelqu'un qui regardait.
 *
 * Hors édition, on ne vient pas déplacer une prise : on vient répondre à deux
 * questions — « celle-là, elle est sur quoi ? », « elle est reliée à quoi ? » —
 * et éventuellement nouer un lien. Ce banc tient ces deux réponses, et surtout
 * la façon de dire les ABSENCES : une absence mal dite se lit comme une panne.
 */
import { ficheElec, motDuLien } from '../src/screens/result/ficheElec';
import type { Fixture } from '../src/geometry/electrical';

const inter: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'n',
  along: 1,
  height: 1.1,
  side: 1,
};
const prise: Fixture = {
  id: 'p1',
  kind: 'prise',
  wallId: 'n',
  along: 2,
  height: 0.25,
  side: 1,
};
const rj: Fixture = {
  id: 'rj1',
  kind: 'rj45',
  wallId: 'n',
  along: 3,
  height: 0.25,
  side: 1,
};

describe('la fiche répond aux deux questions qu’on se pose', () => {
  it('elle dit où c’est, et sur quel circuit', () => {
    const { titre, sousTitre } = ficheElec({
      appareil: prise,
      piece: 'Séjour',
      circuit: 'C3',
    });
    expect(titre).toBe('Prise 16 A');
    expect(sousTitre).toContain('Séjour');
    expect(sousTitre).toContain('circuit C3');
  });

  it('et quand il n’y a pas de circuit, elle le DIT', () => {
    /*
      UNE ABSENCE MAL DITE SE LIT COMME UNE PANNE. Un appareil sans départ
      n'est pas une anomalie : c'est un plan sur lequel on n'a pas encore posé
      de tableau. Un blanc à cet endroit ferait chercher l'erreur.
    */
    const { sousTitre } = ficheElec({ appareil: prise, piece: 'Séjour' });
    expect(sousTitre).toContain('pas encore sur un circuit');
  });

  it('un interrupteur dit CE QU’IL ALLUME', () => {
    const { sousTitre } = ficheElec({
      appareil: inter,
      piece: 'Entrée',
      circuit: 'C1',
      allume: ['le plafonnier du séjour'],
    });
    expect(sousTitre).toContain('allume le plafonnier du séjour');
  });

  it('et deux points s’énumèrent, ils ne s’empilent pas', () => {
    const { sousTitre } = ficheElec({
      appareil: inter,
      allume: ['le plafonnier', 'l’applique', 'la prise du canapé'],
    });
    expect(sousTitre).toContain(
      'allume le plafonnier, l’applique et la prise du canapé',
    );
  });

  it('un interrupteur qui ne commande rien le dit AUSSI', () => {
    /*
      C'est le cas le plus utile de toute la fiche : un interrupteur posé et
      jamais relié ne se distingue d'un interrupteur relié par RIEN, sur le
      plan. C'est exactement la question qu'on vient poser.
    */
    const { sousTitre } = ficheElec({ appareil: inter, circuit: 'C1' });
    expect(sousTitre).toContain('n’allume rien pour l’instant');
  });

  it('une prise COMMANDÉE dit qui l’allume', () => {
    const { sousTitre } = ficheElec({
      appareil: prise,
      allumePar: ['l’interrupteur de l’entrée'],
    });
    expect(sousTitre).toContain('allumé par l’interrupteur de l’entrée');
  });

  it('mais une prise ORDINAIRE ne parle pas de lien', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, ET IL COMPTE. Dire « aucun interrupteur »
      de toutes les prises du logement ferait lire un défaut sur quarante
      appareils qui vont très bien : une prise commandée est l'exception, pas
      la règle. On ne parle du lien que s'il existe — le bouton « Lier », lui,
      reste là pour qui veut en créer un.
    */
    const { sousTitre } = ficheElec({ appareil: prise, circuit: 'C3' });
    expect(sousTitre).not.toMatch(/allum/);
  });

  it('et le courant faible n’en parle jamais', () => {
    const { sousTitre } = ficheElec({ appareil: rj, circuit: 'C6' });
    expect(sousTitre).not.toMatch(/allum/);
    expect(sousTitre).toContain('circuit C6');
  });

  it('les morceaux sont TOUJOURS dans le même ordre', () => {
    /*
      Où c'est, sur quoi c'est, avec quoi c'est relié. Un ordre qui change
      selon ce qu'on a sous la main oblige à relire chaque fiche.
    */
    const { sousTitre } = ficheElec({
      appareil: inter,
      piece: 'Chambre',
      circuit: 'C2',
      allume: ['le plafonnier'],
    });
    expect(sousTitre).toBe('Chambre · circuit C2 · allume le plafonnier');
  });
});

describe('le bouton de lien dit ce qu’on attend du prochain appui', () => {
  it('depuis un interrupteur : ce qu’il allume', () => {
    expect(motDuLien(inter)).toContain('allume');
  });

  it('depuis une prise : l’interrupteur qui l’allume', () => {
    expect(motDuLien(prise)).toContain('interrupteur');
  });

  it('et rien du tout sur du courant faible', () => {
    // Un geste impossible ne prend pas de place : c'est la règle de l'établi,
    // et elle vaut ici.
    expect(motDuLien(rj)).toBeNull();
  });
});
