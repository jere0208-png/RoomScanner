/**
 * LE CATALOGUE DU MAGASIN — et la preuve, article par article.
 *
 * Relevé du patron : « tu fais un vrai catalogue aux prix actuels mis à jour
 * avec un maximum de produits utiles, jusqu'aux vis », puis : « on n'a pas le
 * droit à l'erreur, pour chaque produit tu dois vérifier que ce soit bien
 * celui qu'on présente ».
 *
 * CE BANC TIENT CINQ CHOSES, ET LA TROISIÈME EST CELLE QUI COMPTE.
 *
 *   1. TOUT ARTICLE DU MAGASIN A UN PRIX. Un rayon avec une étiquette vide
 *      n'est pas un rayon ;
 *   2. TOUT CE QUE LE DEVIS SAIT CHIFFRER SE RETROUVE AU MAGASIN. Une ligne de
 *      devis qu'on ne peut pas racheter est une ligne qu'on ne peut pas
 *      corriger ;
 *   3. **UN PRIX RELEVÉ PORTE SA RÉFÉRENCE, ET LES DEUX CÔTÉS D'UNE
 *      COMPARAISON PORTENT LA MÊME.** C'est là que « pas le droit à l'erreur »
 *      se joue : deux différentiels « 40 A 30 mA type AC » peuvent être deux
 *      appareils à trente euros d'écart ;
 *   4. LE BOUTON AMAZON NE S'AFFICHE QUE SUR DU VÉRIFIÉ des deux côtés. On ne
 *      compare pas un prix vu à un prix supposé ;
 *   5. ET LE LIEN SE FABRIQUE À UN SEUL ENDROIT, pour que la balise partenaire
 *      s'ajoute plus tard sans réécrire cent cinquante adresses.
 *
 * CE QUE CE BANC NE PEUT PAS TENIR, et c'est dit franchement : il ne va pas
 * voir en rayon. Il vérifie la COHÉRENCE de ce qu'on affirme — qu'un prix dit
 * d'où il vient, qu'une comparaison porte sur la même référence — pas que le
 * prix de Castorama est toujours celui d'aujourd'hui. Ça, c'est le travail du
 * catalogue distant (`tarifsreseau`), et du relevé qu'on refait.
 */
import {
  ARTICLES,
  PARTENAIRE_AMAZON,
  RAYONS,
  articleDuMagasin,
  catalogueDuMagasin,
  lienAmazon,
  offreAmazon,
} from '../src/geometry/magasin';
import {
  GAMMES,
  TARIFS_COMMUNS,
  TARIFS_MECANISME,
  tarifPlaque,
} from '../src/geometry/prix';
import { buyingList, type PullRow } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import type { Fixture } from '../src/geometry/electrical';
import type { Wire } from '../src/geometry/schema';
import type { Circuit, Differential } from '../src/geometry/nfc15100';

describe('le catalogue tient debout', () => {
  it('chaque article a un prix, un rayon connu et une unité', () => {
    const catalogue = catalogueDuMagasin('celiane');
    expect(catalogue.length).toBeGreaterThan(90);
    for (const a of catalogue) {
      expect(`${a.code} : ${a.tarif.pu > 0}`).toBe(`${a.code} : true`);
      expect(RAYONS).toContain(a.rayon);
      expect(a.unite.length).toBeGreaterThan(0);
      expect(a.libelle.length).toBeGreaterThan(2);
    }
  });

  it('et chaque prix dit d’où il vient et de quand il date', () => {
    for (const a of catalogueDuMagasin('dooxie')) {
      expect(`${a.code} : ${a.tarif.source}`).not.toContain(': undefined');
      expect(a.tarif.releve).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
    }
  });

  it('aucun code en double : un article, une étiquette', () => {
    const vus = new Set<string>();
    for (const a of catalogueDuMagasin('mosaic')) {
      expect(`déjà vu ${a.code} : ${vus.has(a.code)}`).toBe(
        `déjà vu ${a.code} : false`,
      );
      vus.add(a.code);
    }
  });

  it('« jusqu’aux vis » : les consommables et l’outillage sont là', () => {
    /*
      Le relevé du patron est littéral, et il vaut d'être éprouvé : le devis
      ne chiffrait que ce que le plan sait compter. On ne part pas au comptoir
      avec cette liste-là.
    */
    const codes = new Set(ARTICLES.map((a) => a.code));
    for (const attendu of [
      'vis-placo',
      'cheville-nylon',
      'collier-colson',
      'wago-2',
      'ruban-isolant',
      'platre-scellement',
      'tire-fil',
      'scie-cloche-67',
    ]) {
      expect(`${attendu} au catalogue : ${codes.has(attendu)}`).toBe(
        `${attendu} au catalogue : true`,
      );
    }
  });
});

describe('l’ordre des gammes se tient', () => {
  /*
    UNE ODACE NE PEUT PAS COÛTER PLUS QU'UNE CÉLIANE — et c'est le genre de
    chose que personne ne vérifie, puisqu'on ne compare jamais deux gammes
    ligne à ligne.

    CE BANC EST UN GARDE-FOU, PAS LA RÉPARATION D'UN ACCIDENT, et il faut le
    dire : remis sur l'ancien catalogue, il PASSE. L'ordre y tenait encore.
    Mais il ne tenait qu'à un centime — la prise Odace était estimée à 10,90 €
    sous une Céliane supposée à 15,90 €, qui n'en vaut que 10,90 en rayon. Le
    relevé a fait descendre la borne haute sur le milieu de gamme ; le suivant
    l'aurait fait passer dessous.

    Le rayon donne maintenant les deux BORNES, mesurées pièce par pièce :
    l'entrée (dooxie) et le haut (Céliane). Ce banc tient l'ordre entre elles,
    et c'est ce qui empêchera un recalage futur de repasser par-dessus.

    IL NE JUGE QUE LES MÉCANISMES QU'ON POSE PARTOUT. Un thermostat ou un
    variateur se choisit sur ses fonctions, pas sur sa gamme : deux modèles
    peuvent s'inverser sans que ce soit une erreur.
  */
  const ORDRE = ['dooxie', 'ovalis', 'odace', 'mosaic', 'celiane'] as const;

  it('l’entrée de gamme reste sous le haut de gamme, pièce par pièce', () => {
    for (const kind of ['prise', 'inter', 'va', 'rj45', 'tv'] as const) {
      const bas = TARIFS_MECANISME.dooxie[kind]!.pu;
      const haut = TARIFS_MECANISME.celiane[kind]!.pu;
      expect(`${kind} : ${bas < haut}`).toBe(`${kind} : true`);
      // Et ce qui est entre les deux y reste vraiment.
      for (const g of ORDRE) {
        const pu = TARIFS_MECANISME[g][kind]!.pu;
        expect(`${g}/${kind} : ${pu >= bas && pu <= haut}`).toBe(
          `${g}/${kind} : true`,
        );
      }
    }
  });

  it('et une plaque suit le même ordre', () => {
    for (let n = 1; n <= 3; n++) {
      const bas = tarifPlaque('dooxie', n)!.pu;
      const haut = tarifPlaque('celiane', n)!.pu;
      expect(`${n} poste(s) : ${bas < haut}`).toBe(`${n} poste(s) : true`);
    }
  });
});

describe('tout ce que le devis chiffre se rachète au magasin', () => {
  /*
    UNE LIGNE DE DEVIS QU'ON NE PEUT PAS RACHETER est une ligne qu'on ne peut
    pas corriger : le « + » du ticket n'aurait rien à quoi se raccrocher, et
    l'électricien devrait sortir de l'application pour un article que
    l'application connaît.
  */
  const TROIS_FILS = (section: number): Wire[] => [
    { role: 'phase', color: '#B8352A', label: 'Phase', section },
    { role: 'neutre', color: '#2E6FD6', label: 'Neutre', section },
    { role: 'terre', color: '#5A9E31', label: 'Terre', section },
  ];
  const TIRAGE: PullRow[] = [
    {
      circuitId: 'c1',
      label: 'Prises',
      section: 2.5,
      nature: 'prises' as const,
      brins: TROIS_FILS(2.5),
      fils: 3,
      conduit: 20,
      troncons: [],
      runs: 8,
      conduitLength: 62,
      cableLength: 68,
      approx: false,
      protection: '20 A',
    },
  ];
  const fx = (id: string, kind: Fixture['kind']): Fixture => ({
    id,
    kind,
    wallId: 'n',
    along: 1,
    height: 0.25,
    side: 1,
  });
  const CIRCUITS: Circuit[] = [
    {
      id: 'c1',
      label: 'c1',
      nature: 'prises',
      points: 4,
      section: 2.5,
      breaker: 20,
      rooms: ['Séjour'],
      fixtureIds: [],
    },
  ];
  const DIFFS: Differential[] = [
    { label: 'D', type: 'AC', rating: 40, circuits: ['c1'] },
  ];

  it('chaque ligne chiffrée a son article au rayon', () => {
    const achats = buyingList(
      TIRAGE,
      [fx('p1', 'prise'), fx('i1', 'inter'), fx('t1', 'tableau')],
      [{ id: 'l1', kind: 'dcl', roomId: 'r1', at: { x: 1, z: 1 } }],
    );
    for (const g of GAMMES) {
      const d = chiffrer(achats, CIRCUITS, DIFFS, g.id);
      /*
        LES LIGNES À ZÉRO EURO NE SONT PAS DES ARTICLES DE RAYON, et elles ont
        leur raison d'être : un luminaire « dépend des envies » et le tableau
        se chiffre par son coffret. Le devis les liste à zéro EN LE DISANT ;
        elles n'ont rien à faire au magasin.
      */
      const manquants = d.lignes
        .filter((l) => l.pu !== null && l.pu > 0 && l.code)
        .filter((l) => !articleDuMagasin(l.code, g.id))
        .map((l) => `${l.code} (${l.libelle})`);
      expect(`${g.id} : ${manquants.join(', ')}`).toBe(`${g.id} : `);
    }
  });
});

describe('une comparaison ne porte que sur le même produit', () => {
  it('les deux côtés d’un couple portent la MÊME référence', () => {
    /*
      C'EST LA RÈGLE « PAS LE DROIT À L'ERREUR », mise en épreuve. Une offre
      Amazon rapprochée d'une offre en rayon doit désigner le même article, et
      la seule preuve qui tienne est la référence — pas un libellé qui se
      ressemble.

      Une seule tolérance, et elle est explicite : quand une enseigne ne
      publie que son EAN, on garde l'EAN des deux côtés. C'est le cas des
      colliers Diall.
    */
    for (const a of ARTICLES) {
      const amazon = (a.offres ?? []).find((o) => o.enseigne === 'Amazon');
      const rayon = (a.offres ?? []).find((o) => o.enseigne !== 'Amazon');
      if (!amazon || !rayon) continue;
      expect(`${a.code} : ${amazon.reference} vs ${rayon.reference}`).toBe(
        `${a.code} : ${rayon.reference} vs ${rayon.reference}`,
      );
    }
  });

  it('et chaque offre dit son intitulé, sa référence et son jour', () => {
    for (const a of ARTICLES) {
      for (const o of a.offres ?? []) {
        expect(`${a.code}/${o.enseigne} intitulé`).toBe(
          `${a.code}/${o.enseigne} intitulé`,
        );
        expect(o.intitule.length).toBeGreaterThan(8);
        expect(o.reference.length).toBeGreaterThan(3);
        expect(o.jour).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(o.prix).toBeGreaterThan(0);
      }
    }
  });

  it('le prix du catalogue est bien celui de l’offre en rayon', () => {
    /*
      Le catalogue chiffre depuis `prix.ts`, les offres vivent dans
      `magasin.ts` : deux endroits, une seule vérité. S'ils divergent, le
      magasin annonce un prix que le devis ne retrouve pas — et c'est l'écart
      que personne ne remarque avant le client.
    */
    for (const a of ARTICLES) {
      const rayon = (a.offres ?? []).find((o) => o.enseigne !== 'Amazon');
      if (!rayon) continue;
      const tarif = TARIFS_COMMUNS[a.code];
      expect(`${a.code} : ${tarif?.pu}`).toBe(`${a.code} : ${rayon.prix}`);
    }
  });
});

describe('le bouton Amazon ne s’affiche que sur du vérifié', () => {
  const article = (code: string) => ARTICLES.find((a) => a.code === code)!;

  it('quand Amazon est moins cher ET que les deux prix ont été vus', () => {
    const a = article('diff-AC');
    const o = offreAmazon(a, TARIFS_COMMUNS['diff-AC']);
    expect(o).not.toBeNull();
    expect(o!.prix).toBeLessThan(TARIFS_COMMUNS['diff-AC'].pu);
    expect(o!.asin).toBeTruthy();
  });

  it('à prix égal aussi — « équivalent ou inférieur »', () => {
    const a = article('collier-colson');
    expect(offreAmazon(a, TARIFS_COMMUNS['collier-colson'])).not.toBeNull();
  });

  it('mais jamais quand Amazon est plus cher', () => {
    for (const code of ['icta-20', 'fil-2.5', 'boite-encastrement']) {
      expect(`${code} : ${offreAmazon(article(code), TARIFS_COMMUNS[code])}`).toBe(
        `${code} : null`,
      );
    }
  });

  it('ni quand le prix de référence n’est qu’une estimation', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et c'est le plus important de ce banc : on
      fabrique une offre Amazon imbattable sur un article dont le prix n'a
      JAMAIS été vu en rayon, et l'on exige que le bouton refuse de s'afficher.
      Annoncer une économie contre une estimation, c'est annoncer une économie
      qu'on n'a pas mesurée.
    */
    const invente = {
      code: 'vis-placo',
      rayon: 'Fixation et consommables' as const,
      libelle: 'Vis à placo',
      unite: 'boîte',
      offres: [
        {
          enseigne: 'Amazon',
          prix: 0.5,
          intitule: 'Un lot de vis très bon marché',
          reference: 'X',
          jour: '2026-08-28',
          asin: 'B000000000',
        },
      ],
    };
    expect(offreAmazon(invente, TARIFS_COMMUNS['vis-placo'])).toBeNull();
  });

  it('et un article sans offre n’en a évidemment pas', () => {
    expect(offreAmazon(article('tire-fil'), TARIFS_COMMUNS['tire-fil'])).toBeNull();
  });
});

describe('le lien Amazon se fabrique à un seul endroit', () => {
  it('sans balise partenaire, il mène à la fiche produit', () => {
    // Relevé du patron : « on mettra plus tard un lien partenaires amazon ».
    // Tant qu'il n'y en a pas, le lien marche et ne rapporte rien.
    expect(PARTENAIRE_AMAZON).toBe('');
    expect(lienAmazon('B007AKRUZG')).toBe('https://www.amazon.fr/dp/B007AKRUZG');
  });

  it('et aucune adresse n’est écrite en dur dans le catalogue', () => {
    /*
      C'est ce qui permettra d'ajouter la balise en UNE ligne. Une adresse
      complète recopiée article par article obligerait à les réécrire toutes.
    */
    for (const a of ARTICLES) {
      for (const o of a.offres ?? []) {
        expect(`${a.code} : ${o.reference}`).not.toContain('http');
        expect(`${a.code} : ${o.intitule}`).not.toContain('amazon.fr/');
      }
    }
  });
});
