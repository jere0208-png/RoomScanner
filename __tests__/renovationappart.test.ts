/**
 * LE RAYON ÉLECTRIQUE TIENT UNE RÉNOVATION D'APPARTEMENT.
 *
 * Relevé du patron : « fais un check du rayon complet électrique pour les
 * besoins standards, rénovation d'appartement par exemple ».
 *
 * POURQUOI CE BANC PLUTÔT QU'UNE RELECTURE. Un catalogue se juge à ce qu'il
 * ne contient PAS, et un manque ne se voit pas : on ne remarque une barrette
 * de liaison équipotentielle absente qu'au moment où l'on en cherche une. Une
 * relecture attentive laisse passer ce qu'elle n'a pas pensé à chercher — la
 * preuve, c'est que la première version du catalogue, écrite d'une traite en
 * regardant ce que le plan sait compter, n'avait NI la préfilée NI la liaison
 * équipotentielle, deux articles qu'aucune rénovation ne saute.
 *
 * ON ÉCRIT DONC LE CHANTIER, ET L'ON DEMANDE AU CATALOGUE DE RÉPONDRE. La
 * liste ci-dessous est un T3 des années soixante-dix qu'on refait à neuf :
 * tableau déposé, circuits refaits, cloisons déjà finies. C'est le chantier le
 * plus courant de cette application, et chaque ligne est là parce qu'on la
 * pose vraiment.
 *
 * CE BANC NE DIT PAS QUE LES PRIX SONT JUSTES — ça, c'est le relevé en rayon,
 * et `magasin` en tient la cohérence. Il dit qu'on peut FAIRE SA LISTE sans
 * sortir de l'application.
 */
import {
  ARTICLES,
  articleDuMagasin,
  catalogueDuMagasin,
} from '../src/geometry/magasin';
import { TARIFS_COMMUNS } from '../src/geometry/prix';

/**
 * LE CHANTIER, POSTE PAR POSTE — et ce qu'il faut au rayon pour le tenir.
 *
 * Chaque entrée nomme un geste réel du chantier et le code qui doit exister.
 * Un banc qui listerait des codes sans dire à quoi ils servent ne serait qu'un
 * inventaire ; celui-ci se relit comme un métré.
 */
const CHANTIER: { geste: string; code: string }[] = [
  // --------------------------------------------------------- le tableau
  { geste: 'déposer et remonter le tableau', code: 'coffret-2' },
  { geste: 'la protection des prises', code: 'diff-AC' },
  { geste: 'la protection du lave-linge et de la plaque', code: 'diff-A' },
  { geste: 'protéger l’éclairage', code: 'disj-10' },
  { geste: 'protéger les prises', code: 'disj-16' },
  { geste: 'protéger un circuit spécialisé', code: 'disj-20' },
  { geste: 'protéger la plaque de cuisson', code: 'disj-32' },
  { geste: 'alimenter la rangée', code: 'peigne' },
  { geste: 'répartir la terre', code: 'bornier-terre' },
  {
    geste: 'ajouter un départ sans refaire la rangée',
    code: 'disj-diff-20',
  },
  { geste: 'le chauffe-eau en heures creuses', code: 'contacteur-jn' },
  // ------------------------------------------------- ce qui court dans les murs
  { geste: 'passer l’éclairage', code: 'icta-16' },
  { geste: 'passer les prises', code: 'icta-20' },
  { geste: 'passer dans une cloison finie, sans tirer', code: 'icta-prefilee-3g1.5' },
  { geste: 'idem pour un circuit de prises', code: 'icta-prefilee-3g2.5' },
  { geste: 'câbler l’éclairage', code: 'fil-1.5' },
  { geste: 'câbler les prises', code: 'fil-2.5' },
  { geste: 'câbler la plaque de cuisson', code: 'fil-6' },
  { geste: 'passer en apparent quand on ne saigne pas', code: 'goulotte-40' },
  // --------------------------------------------------------- l’encastrement
  { geste: 'poser un mécanisme', code: 'boite-encastrement' },
  { geste: 'poser un ensemble double', code: 'boite-encastrement-2' },
  { geste: 'poser un point lumineux', code: 'boite-dcl' },
  { geste: 'dériver dans un faux plafond', code: 'boite-derivation' },
  { geste: 'rattraper l’épaisseur d’un doublage', code: 'rehausse-boite' },
  { geste: 'fermer un poste laissé libre', code: 'obturateur' },
  // ------------------------------------------------------------ la salle d’eau
  /*
    LA LIAISON ÉQUIPOTENTIELLE EST OBLIGATOIRE (NF C 15-100) et se refait à
    chaque rénovation, puisqu'on touche aux canalisations. Elle ne coûte
    presque rien, et c'est exactement le poste qu'on oublie au devis pour le
    payer sur le chantier.
  */
  { geste: 'la liaison équipotentielle de la salle d’eau', code: 'barrette-equipotentielle' },
  { geste: 'la serrer sur les tubes', code: 'collier-equipotentiel' },
  // ------------------------------------------------------------ l’appareillage
  { geste: 'raccorder la plaque en dur', code: 'sortie-cable-32' },
  { geste: 'commander un volet roulant', code: 'inter-volet' },
  { geste: 'la sonnette d’entrée', code: 'carillon' },
  { geste: 'une prise au balcon ou à la cave', code: 'prise-etanche' },
  { geste: 'un interrupteur de cave', code: 'inter-etanche' },
  // --------------------------------------------------------- courants faibles
  { geste: 'le coffret de communication, obligatoire', code: 'coffret-com' },
  { geste: 'tirer le réseau', code: 'futp6' },
  { geste: 'tirer la télévision', code: 'coax' },
  // ------------------------------------------------------------- le plafond
  { geste: 'le détecteur de fumée, obligatoire', code: 'plafond-daaf' },
  { geste: 'la bouche de VMC', code: 'plafond-vmc' },
  // ------------------------------------------------- ce qui vide le camion
  { geste: 'reboucher les saignées et sceller les boîtes', code: 'platre-scellement' },
  { geste: 'fixer les boîtes en cloison sèche', code: 'vis-placo' },
  { geste: 'cheviller dans le dur', code: 'cheville-nylon' },
  { geste: 'tenir les gaines', code: 'collier-gaine-20' },
  { geste: 'connecter dans les boîtes', code: 'wago-3' },
  { geste: 'isoler', code: 'ruban-isolant' },
  { geste: 'passer les fils dans une gaine en place', code: 'tire-fil' },
  { geste: 'percer les boîtes en cloison sèche', code: 'fraise-placo-67' },
];

describe('le rayon tient une rénovation d’appartement', () => {
  it('chaque geste du chantier a son article, et son prix', () => {
    const manques = CHANTIER.filter(
      (l) => !articleDuMagasin(l.code, 'dooxie'),
    ).map((l) => `${l.code} — ${l.geste}`);
    expect(manques).toEqual([]);
  });

  it('et l’appareillage suit la gamme choisie, sans trou', () => {
    /*
      Une rénovation se chiffre dans UNE gamme, et l'électricien en change
      d'un chantier à l'autre. Les mécanismes qu'on pose partout — socle,
      interrupteur, va-et-vient, réseau, télévision — doivent exister dans
      les cinq, sans quoi le devis changerait de contenu en changeant de
      modèle.
    */
    for (const gamme of ['dooxie', 'ovalis', 'odace', 'mosaic', 'celiane'] as const) {
      const codes = new Set(catalogueDuMagasin(gamme).map((a) => a.code));
      const manques = [
        'meca-prise',
        'meca-inter',
        'meca-va',
        'meca-rj45',
        'meca-tv',
        'meca-prise20',
        'meca-prise32',
        'meca-sortieCable',
        'plaque-1',
        'plaque-2',
        'plaque-3',
      ].filter((c) => !codes.has(c));
      expect(`${gamme} : ${manques.join(', ')}`).toBe(`${gamme} : `);
    }
  });
});

describe('ce que le chantier coûte se tient debout', () => {
  it('aucun article du chantier n’est à zéro euro', () => {
    /*
      Un prix nul au milieu d'une liste de courses ne se lit pas comme
      « gratuit » : il se lit comme « on a oublié de le chiffrer ». Les seuls
      articles à zéro du devis sont les luminaires, et le devis DIT pourquoi.
    */
    for (const l of CHANTIER) {
      const a = articleDuMagasin(l.code, 'dooxie')!;
      expect(`${l.code} : ${a.tarif.pu > 0}`).toBe(`${l.code} : true`);
    }
  });

  it('et la préfilée coûte PLUS cher que la gaine et les fils séparés', () => {
    /*
      CE N'EST PAS UNE ERREUR, C'EST UN ARBITRAGE — et il faut qu'il reste
      visible. En neuf on tire ses fils ; en rénovation on passe dans des
      cloisons finies, et le fil qu'on ne tire pas est une demi-journée
      gagnée. Le jour où la préfilée deviendrait la moins chère des deux, ce
      serait un prix à revérifier avant d'être une bonne nouvelle.
    */
    const separe =
      TARIFS_COMMUNS['icta-16'].pu + 3 * TARIFS_COMMUNS['fil-1.5'].pu * 0.34;
    expect(TARIFS_COMMUNS['icta-prefilee-3g1.5'].pu).toBeGreaterThan(separe);
  });
});

describe('le catalogue reste lisible', () => {
  it('chaque article dit à quoi il sert, pas seulement ce qu’il est', () => {
    /*
      « Barrette de liaison équipotentielle » ne dit rien à qui ne l'a jamais
      posée ; « salle d'eau — obligatoire, relie les canalisations à la
      terre » le dit. Un magasin dont les étiquettes n'expliquent rien oblige
      à savoir avant d'acheter.
    */
    const muets = ARTICLES.filter((a) => !a.precision).map((a) => a.code);
    // Quelques évidences n'ont rien à préciser — un foret est un foret.
    expect(muets.length).toBeLessThan(8);
  });
});
