/**
 * LE DEVIS SE CORRIGE À LA MAIN — quantités, et articles en plus.
 *
 * Relevé du patron : « ajoute la possibilité d'augmenter ou diminuer le nombre
 * de produits dans le devis ou d'en ajouter un ».
 *
 * CE QUI EXISTAIT, ET CE QUI MANQUAIT. On pouvait déjà ÉCARTER une ligne — le
 * client fournit son tableau, les gaines sont déjà en place — mais c'était
 * tout ou rien. Or un métré est une estimation : le plan compte deux couronnes
 * de 2,5 mm², on sait qu'il en faudra trois parce qu'on connaît la maison. Et
 * il manquait l'inverse : ce qu'aucun plan ne peut deviner — les chevilles,
 * les colliers, le plâtre, l'aiguille.
 *
 * DEUX GESTES, DEUX NATURES, ET LE DEVIS NE LES CONFOND PAS.
 *
 *   CORRIGER une quantité du métré : la ligne reste une ligne du métré, mais
 *   son nombre vient de l'électricien. Le devis le dit — on ne fait pas passer
 *   un chiffre humain pour un chiffre mesuré ;
 *   AJOUTER un article du magasin : il n'était pas au métré, il n'y sera
 *   jamais, et sa quantité n'a aucune raison d'être devinée.
 *
 * ET LE TOTAL SUIT, TOUJOURS. C'est la règle du ticket depuis le premier
 * jour : le total est la somme de ses lignes, au centime. Un ajustement qui ne
 * remonterait pas au total serait un devis qui ment sur ce qu'il montre.
 */
import { buyingList, type PullRow } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import type { Fixture } from '../src/geometry/electrical';
import type { Wire } from '../src/geometry/schema';
import type { Circuit, Differential } from '../src/geometry/nfc15100';
import { TARIFS_COMMUNS } from '../src/geometry/prix';

const TROIS_FILS = (section: number): Wire[] => [
  { role: 'phase', color: '#B8352A', label: 'Phase — rouge', section },
  { role: 'neutre', color: '#2E6FD6', label: 'Neutre — bleu clair', section },
  { role: 'terre', color: '#5A9E31', label: 'Terre — vert/jaune', section },
];

const TIRAGE: PullRow[] = [
  {
    circuitId: 'c1',
    label: 'Prises — Séjour',
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

const APPAREILS: Fixture[] = [
  fx('p1', 'prise'),
  fx('p2', 'prise'),
  fx('t1', 'tableau'),
];

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
  { label: 'Différentiel type AC 1', type: 'AC', rating: 40, circuits: ['c1'] },
];

const ACHATS = buyingList(TIRAGE, APPAREILS, []);
const devis = (ajust?: Parameters<typeof chiffrer>[5]) =>
  chiffrer(ACHATS, CIRCUITS, DIFFS, 'celiane', undefined, ajust);

const ligne = (d: ReturnType<typeof devis>, code: string) =>
  d.lignes.find((l) => l.code === code);

describe('corriger la quantité d’une ligne du métré', () => {
  it('la quantité change, et le total suit', () => {
    const avant = ligne(devis(), 'icta-20')!;
    const apres = devis({ quantites: { 'icta-20': avant.quantite + 2 } });
    const l = ligne(apres, 'icta-20')!;
    expect(l.quantite).toBe(avant.quantite + 2);
    expect(l.total).toBeCloseTo(l.pu! * l.quantite, 2);
    // Le total du devis reste la somme de ses lignes, au centime.
    const somme = apres.lignes.reduce((s, x) => s + x.total, 0);
    expect(Math.round(apres.total * 100)).toBe(Math.round(somme * 100));
  });

  it('et la ligne DIT qu’elle a été corrigée', () => {
    /*
      On ne fait pas passer un chiffre humain pour un chiffre mesuré. Le devis
      tient sa valeur de ce qu'il sait justifier : une quantité venue du métré
      se retrouve sur le plan, une quantité corrigée ne se retrouve nulle part
      ailleurs que dans la tête de celui qui l'a écrite.
    */
    const avant = ligne(devis(), 'icta-20')!;
    expect(avant.ajustee).toBeFalsy();
    const l = ligne(devis({ quantites: { 'icta-20': 9 } }), 'icta-20')!;
    expect(l.ajustee).toBe(true);
  });

  it('à zéro, la ligne reste au ticket : elle ne disparaît pas', () => {
    /*
      C'est déjà la règle des articles écartés, et pour la même raison : un
      article qu'on ne voit plus est un article qu'on croit oublié.
    */
    const d = devis({ quantites: { 'icta-20': 0 } });
    const l = ligne(d, 'icta-20');
    expect(l).toBeDefined();
    expect(l!.quantite).toBe(0);
    expect(l!.total).toBe(0);
  });

  it('une quantité négative ou absurde ne passe pas', () => {
    // Le contrôle en sens inverse : on prouve que la porte sait refuser.
    const d = devis({ quantites: { 'icta-20': -4 } });
    expect(ligne(d, 'icta-20')!.quantite).toBe(0);
  });
});

describe('ajouter un article du magasin', () => {
  it('il entre au devis, avec son libellé, son unité et son prix', () => {
    const d = devis({ ajouts: [{ code: 'collier-colson', quantite: 2 }] });
    const l = ligne(d, 'collier-colson')!;
    expect(l).toBeDefined();
    expect(l.quantite).toBe(2);
    expect(l.pu).toBe(TARIFS_COMMUNS['collier-colson'].pu);
    expect(l.total).toBeCloseTo(l.pu! * 2, 2);
    expect(l.libelle.length).toBeGreaterThan(3);
    expect(l.unite.length).toBeGreaterThan(0);
  });

  it('et il DIT qu’il vient du magasin, pas du métré', () => {
    const d = devis({ ajouts: [{ code: 'vis-placo', quantite: 1 }] });
    expect(ligne(d, 'vis-placo')!.duMagasin).toBe(true);
    // Une ligne du métré, elle, ne le dit pas.
    expect(ligne(d, 'icta-20')!.duMagasin).toBeFalsy();
  });

  it('le total le compte, comme le reste', () => {
    const sans = devis().total;
    const avec = devis({ ajouts: [{ code: 'tire-fil', quantite: 1 }] });
    expect(avec.total).toBeCloseTo(
      sans + TARIFS_COMMUNS['tire-fil'].pu,
      2,
    );
  });

  it('un code que le catalogue ne connaît pas n’entre pas', () => {
    /*
      Le contrôle en sens inverse. Une ligne sans prix au milieu d'un ticket
      est pire qu'une ligne absente : on ne sait pas si elle est gratuite ou
      si on l'a oubliée.
    */
    const d = devis({ ajouts: [{ code: 'pas-un-article', quantite: 3 }] });
    expect(ligne(d, 'pas-un-article')).toBeUndefined();
  });

  it('deux fois le même article ne fait pas deux lignes', () => {
    const d = devis({
      ajouts: [
        { code: 'wago-2', quantite: 1 },
        { code: 'wago-2', quantite: 2 },
      ],
    });
    const lignes = d.lignes.filter((l) => l.code === 'wago-2');
    expect(lignes).toHaveLength(1);
    expect(lignes[0].quantite).toBe(3);
  });
});

describe('les deux gestes se combinent', () => {
  it('on corrige le métré ET on ajoute du magasin', () => {
    const d = devis({
      quantites: { 'icta-20': 5 },
      ajouts: [{ code: 'cheville-nylon', quantite: 2 }],
    });
    expect(ligne(d, 'icta-20')!.quantite).toBe(5);
    expect(ligne(d, 'cheville-nylon')!.quantite).toBe(2);
    const somme = d.lignes.reduce((s, x) => s + x.total, 0);
    expect(Math.round(d.total * 100)).toBe(Math.round(somme * 100));
  });
});
