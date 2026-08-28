/**
 * LES PRIX PEUVENT ÊTRE ACTUALISÉS, ET CHAQUE PRIX DIT D'OÙ IL VIENT.
 *
 * Relevé du patron : « pour les prix, j'aimerais une actualisation
 * automatique via l'application, au clic sur le devis, un chargement des prix
 * pour voir si les prix sont à jour. Fournir une référence pour le prix
 * (ex : Castorama - date). »
 *
 * C'ÉTAIT LE SEUL ENDROIT OÙ L'APP AVANÇAIT SANS PREUVE. Le catalogue est
 * daté et signé depuis le premier jour — chaque article porte le mois de son
 * relevé et l'endroit où on l'a vu —, mais ces chiffres étaient POSÉS À LA
 * MAIN, aux ordres de grandeur du marché français, et rien ne pouvait les
 * rafraîchir : il fallait une nouvelle version de l'application. Un tarif
 * vieillit, et le cuivre bouge d'un trimestre à l'autre.
 *
 * TROIS CHOSES SE TIENNENT ICI, ET AUCUNE NE VAUT SANS LES DEUX AUTRES.
 *
 *   1. UN CATALOGUE REÇU REMPLACE LE CATALOGUE EMBARQUÉ, article par article
 *      — et seulement ceux qu'il porte. Un serveur qui ne connaît que le
 *      cuivre ne doit pas effacer l'appareillage ;
 *   2. LE PRIX GARDE SA RÉFÉRENCE JUSQU'AU TICKET. Un devis qui cache d'où
 *      sortent ses chiffres n'est pas un devis, c'est une devinette : chaque
 *      ligne porte son enseigne et son jour ;
 *   3. ET L'ON PEUT REVENIR EN ARRIÈRE. Un catalogue reçu qu'on retire rend
 *      exactement les prix embarqués — sans quoi une lecture ratée laisserait
 *      l'application dans un état qu'aucun banc ne décrit.
 *
 * L'ÉTAT VIT DANS UN MODULE, ET UN MODULE SURVIT D'UN BANC À L'AUTRE — c'est
 * le même piège que le magasin Zustand, qui a déjà fait passer une épreuve
 * pour la mauvaise raison. On remet donc le catalogue à zéro après chaque
 * épreuve, et l'on éprouve ce retour à zéro comme le reste.
 */
import { buyingList, type PullRow } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import type { Fixture } from '../src/geometry/electrical';
import type { Wire } from '../src/geometry/schema';
import type { Circuit, Differential } from '../src/geometry/nfc15100';
import {
  appliquerLesTarifs,
  tarifsAppliques,
  TARIFS_COMMUNS,
  TARIFS_MECANISME,
  type TarifsRecus,
} from '../src/geometry/prix';
import type { CeilingFixture } from '../src/geometry/ceiling';

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
  fx('i1', 'inter'),
  fx('t1', 'tableau'),
];

const PLAFOND: CeilingFixture[] = [
  { id: 'l1', kind: 'dcl', roomId: 'r1', at: { x: 1, z: 1 } },
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

const ACHATS = buyingList(TIRAGE, APPAREILS, PLAFOND);
const devis = () => chiffrer(ACHATS, CIRCUITS, DIFFS, 'celiane');

/*
  UN CATALOGUE REÇU, tel que le serveur le rend : des prix par code, une
  enseigne, un jour. On n'y met QUE deux articles — c'est le sujet : ce que le
  serveur ignore doit rester ce qu'il était.
*/
const RECU: TarifsRecus = {
  version: '2026-09',
  releve: '2026-09-03',
  source: 'Castorama',
  prix: {
    'icta-20': 31.4,
    'meca-celiane-prise': 13.9,
  },
};

afterEach(() => appliquerLesTarifs(null));

describe('un catalogue reçu remplace le catalogue embarqué', () => {
  it('article par article, et seulement ceux qu’il porte', () => {
    const avant = devis();
    appliquerLesTarifs(RECU);
    const apres = devis();

    const gaineAvant = avant.lignes.find((l) => l.code === 'icta-20')!;
    const gaineApres = apres.lignes.find((l) => l.code === 'icta-20')!;
    expect(gaineAvant.pu).toBe(TARIFS_COMMUNS['icta-20'].pu);
    expect(gaineApres.pu).toBe(31.4);

    // Ce que le serveur ignore ne bouge pas d'un centime — et il y en a,
    // sans quoi cette épreuve ne prouverait rien.
    const ignores = avant.lignes.filter(
      (l) => l.code && l.pu !== null && !(l.code in RECU.prix) && l.code !== 'meca-prise',
    );
    expect(ignores.length).toBeGreaterThan(2);
    for (const l of ignores) {
      expect(apres.lignes.find((x) => x.code === l.code)!.pu).toBe(l.pu);
    }
  });

  it('y compris l’appareillage, qui dépend de la gamme choisie', () => {
    const avant = devis().lignes.find((l) => l.code === 'meca-prise')!;
    expect(avant.pu).toBe(TARIFS_MECANISME.celiane.prise!.pu);
    appliquerLesTarifs(RECU);
    expect(devis().lignes.find((l) => l.code === 'meca-prise')!.pu).toBe(13.9);
  });

  it('et le total suit, sans qu’on ait à le recalculer à la main', () => {
    const avant = devis().total;
    appliquerLesTarifs(RECU);
    const apres = devis().total;
    expect(apres).not.toBe(avant);
    // Le total reste la somme de ses lignes : c'est la règle du ticket.
    const somme = devis().lignes.reduce((s, l) => s + l.total, 0);
    expect(Math.round(apres * 100)).toBe(Math.round(somme * 100));
  });
});

describe('chaque prix dit d’où il vient', () => {
  it('l’enseigne et le jour du relevé descendent jusqu’à la ligne', () => {
    appliquerLesTarifs(RECU);
    const l = devis().lignes.find((x) => x.code === 'icta-20')!;
    expect(l.source).toBe('Castorama');
    expect(l.releve).toBe('2026-09-03');
  });

  it('et un prix embarqué le dit aussi, au lieu de se taire', () => {
    const l = devis().lignes.find((x) => x.code === 'icta-20')!;
    expect(l.source).toBe(TARIFS_COMMUNS['icta-20'].source);
    expect(l.releve).toBe(TARIFS_COMMUNS['icta-20'].releve);
  });
});

describe('et l’on peut revenir en arrière', () => {
  it('retirer le catalogue reçu rend exactement les prix embarqués', () => {
    const avant = devis();
    appliquerLesTarifs(RECU);
    appliquerLesTarifs(null);
    const apres = devis();
    expect(apres.total).toBe(avant.total);
    expect(tarifsAppliques()).toBeNull();
  });

  it('et l’on sait toujours ce qui est appliqué', () => {
    expect(tarifsAppliques()).toBeNull();
    appliquerLesTarifs(RECU);
    expect(tarifsAppliques()?.source).toBe('Castorama');
    expect(tarifsAppliques()?.releve).toBe('2026-09-03');
  });
});
