/**
 * Ce qu'un patron électricien lit en premier : le tableau de tirage et la
 * liste d'achat.
 *
 * Pas « une liste d'appareils » — combien de couronnes d'ICTA 20 charger
 * dans la camionnette, combien de boîtes d'encastrement, quelle longueur de
 * 2,5 mm² tirer. Deux confusions à ne jamais commettre : une plaque double
 * n'est pas une boîte double (c'est DEUX boîtes sous UNE plaque), et un
 * mètre de parcours n'est pas un mètre de conducteur (il en faut trois).
 */
import {
  buyingList,
  conduitFor,
  pullSchedule,
  type PullRow,
} from '../src/geometry/conduits';
import type { Wire } from '../src/geometry/schema';
import type { Circuit } from '../src/geometry/nfc15100';
import type { Fixture } from '../src/geometry/electrical';

const circuit = (
  id: string,
  label: string,
  section: number | null,
  breaker: number | null,
  fixtureIds: string[],
): Circuit => ({
  id,
  label,
  nature: section === null ? 'vdi' : 'prises',
  points: fixtureIds.length,
  section,
  breaker,
  rooms: ['Séjour'],
  fixtureIds,
});

/**
 * Les trois conducteurs d'un depart ordinaire — phase, neutre, terre.
 *
 * Les lignes de tirage sont ecrites a la main dans ce banc ; en vrai c'est
 * `wiresOf` qui les compte, et il en met davantage sur un eclairage. Ce qu'on
 * eprouve ici ne depend pas de leur nombre.
 */
const TROIS_FILS = (section: number): Wire[] => [
  { role: 'phase', color: '#B8352A', label: 'Phase — rouge', section },
  { role: 'neutre', color: '#2E6FD6', label: 'Neutre — bleu clair', section },
  { role: 'terre', color: '#5A9E31', label: 'Terre — vert/jaune', section },
];

describe('le conduit qui convient', () => {
  it('suit la règle de remplissage, section par section', () => {
    expect(conduitFor(1.5)).toBe(16);
    expect(conduitFor(2.5)).toBe(20);
    expect(conduitFor(4)).toBe(25);
    expect(conduitFor(6)).toBe(25);
    expect(conduitFor(10)).toBe(32);
  });

  it('met les courants faibles en 25 : on n’y tire jamais une seule paire', () => {
    expect(conduitFor(null)).toBe(25);
  });

  it('ne descend jamais en dessous de 16', () => {
    for (const s of [null, 1, 1.5, 2.5, 6, 10, 16]) {
      expect(conduitFor(s)).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('le tableau de tirage', () => {
  const circuits = [
    circuit('c1', 'Prises — Séjour', 2.5, 20, ['a', 'b', 'c']),
    circuit('c2', 'Éclairage — Séjour', 1.5, 16, ['d']),
    circuit('c3', 'Communication', null, null, ['e']),
  ];

  it('donne une ligne par circuit, conduit et protection compris', () => {
    const rows = pullSchedule(circuits);
    expect(rows).toHaveLength(3);
    expect(rows[0].conduit).toBe(20);
    expect(rows[0].protection).toBe('20 A · 2.5 mm²');
    expect(rows[1].conduit).toBe(16);
    expect(rows[2].protection).toBe('coffret com.');
  });

  it('reprend le métré du plan quand on l’a', () => {
    const rows = pullSchedule(
      circuits,
      new Map([['c1', { conduit: 18.4, cable: 21.2, runs: 3 }]]),
    );
    // Arrondi au mètre supérieur : on n'achète pas au centimètre.
    expect(rows[0].conduitLength).toBe(19);
    expect(rows[0].cableLength).toBe(22);
    expect(rows[0].runs).toBe(3);
  });

  it('sans métré, le circuit reste listé plutôt qu’oublié', () => {
    const rows = pullSchedule(circuits);
    expect(rows[0].conduitLength).toBe(0);
    expect(rows[0].runs).toBe(3);
  });
});

describe('la liste d’achat', () => {
  const rows: PullRow[] = [
    {
      circuitId: 'c1',
      label: 'Prises',
      section: 2.5,
      brins: TROIS_FILS(2.5),
      fils: 3,
      conduit: 20,
      runs: 8,
      conduitLength: 60,
      cableLength: 66,
      approx: false,
      protection: '20 A',
    },
    {
      circuitId: 'c2',
      label: 'Éclairage',
      section: 1.5,
      brins: TROIS_FILS(1.5),
      fils: 3,
      conduit: 16,
      runs: 5,
      conduitLength: 45,
      cableLength: 50,
      approx: false,
      protection: '16 A',
    },
    {
      circuitId: 'c3',
      label: 'VDI',
      section: null,
    // Un courant faible n'a ni phase ni terre : ce sont des paires.
    brins: [],
      fils: 3,
      conduit: 25,
      runs: 2,
      conduitLength: 24,
      cableLength: 27,
      approx: false,
      protection: 'coffret com.',
    },
  ];

  const fx = (id: string, kind: Fixture['kind'], group?: string): Fixture => ({
    id,
    kind,
    wallId: 'n',
    along: 1,
    height: 0.25,
    side: 1,
    group,
  });

  it('compte les gaines par diamètre, en couronnes de 100 m', () => {
    const list = buyingList(rows, []);
    const g20 = list.find((r) => r.label.includes('Ø20'))!;
    expect(g20.quantity).toBe(1);
    expect(g20.note).toContain('60 m');
    const g16 = list.find((r) => r.label.includes('Ø16'))!;
    expect(g16.quantity).toBe(1);
    const g25 = list.find((r) => r.label.includes('Ø25'))!;
    expect(g25.quantity).toBe(1);
  });

  it('compte le fil COULEUR PAR COULEUR, et non par paquets de trois', () => {
    /*
      DEUX VERSIONS, ET LA PREMIERE SOUS-COMPTAIT.

      Elle multipliait le parcours par TROIS, en dur, et sortait une seule
      ligne « rouge, bleu, vert-jaune ». Releve du patron, apres un essai sur
      un eclairage complet : « le devis ne compte que le fil bleu, alors qu'en
      realite il faut la phase pour l'interrupteur, autre couleur pour retour
      lampe, etc. »

      C'etait juste pour un circuit de prises et faux pour tout le reste : un
      simple allumage tire quatre conducteurs, un va-et-vient six. Et surtout,
      ON N'ACHETE PAS « CINQ CONDUCTEURS » : on achete une couronne de chaque
      couleur. Le chariot partait avec un tiers de fil en moins ET sans le
      violet du retour de lampe, qu'on ne trouve pas en cours de chantier.

      Une ligne par (section, role), donc. Ici, trois fils declares en 2,5 :
      66 m de parcours pour chacun.
    */
    const list = buyingList(rows, []);
    const en25 = list.filter((r) => r.code?.startsWith('fil-2.5-'));
    expect(en25.map((r) => r.code).sort()).toEqual([
      'fil-2.5-neutre',
      'fil-2.5-phase',
      'fil-2.5-terre',
    ]);
    for (const l of en25) {
      // À la française : le fournisseur lit « 2,5 mm² », pas « 2.5 ».
      expect(l.label).toContain('2,5 mm²');
      expect(l.note).toContain('66 m');
      expect(l.quantity).toBe(1);
    }
  });

  it('et chaque couleur porte son nom, pas un code', () => {
    // C'est ce qu'on lit au comptoir : « du violet, en 1,5 ».
    const list = buyingList(rows, []);
    const noms = list
      .filter((r) => r.code?.startsWith('fil-'))
      .map((r) => r.label);
    expect(noms.some((n) => n.includes('Phase — rouge'))).toBe(true);
    expect(noms.some((n) => n.includes('Neutre — bleu clair'))).toBe(true);
    expect(noms.some((n) => n.includes('Terre — vert/jaune'))).toBe(true);
  });

  it('et la gaine dit combien de conducteurs elle porte', () => {
    /*
      Releve du patron : « chaque cablage doit etre note en terme de nombre de
      fils jusqu'au tableau, adapter la gaine en fonction ». Le diametre suit
      deja la regle du tiers (`conduitPour`) — encore faut-il que celui qui
      tire puisse VERIFIER le compte avant de commander la couronne.
    */
    const list = buyingList(rows, []);
    const g20 = list.find((r) => r.code === 'icta-20')!;
    expect(g20.note).toContain('conducteurs par gaine');
  });

  it('et un ÉCLAIRAGE COMPLET tire son retour de lampe', () => {
    /*
      LE CAS QUI A FAIT LE RELEVE. Un interrupteur, un point lumineux : ce
      n'est pas trois fils, c'est quatre — le quatrieme est le retour de
      lampe, et c'est precisement lui qui distingue un circuit d'eclairage
      d'une simple alimentation. Le bordereau n'en commandait pas un metre.

      On part ici du VRAI chemin — `pullSchedule` compte les conducteurs avec
      `wiresOf` — plutot que d'ecrire la ligne a la main : un banc qui declare
      lui-meme le nombre de fils ne peut pas verifier qu'on les compte bien.
    */
    const eclairage: Circuit = {
      id: 'e1',
      label: 'Éclairage — Séjour',
      nature: 'eclairage',
      points: 2,
      section: 1.5,
      breaker: 16,
      rooms: ['Séjour'],
      fixtureIds: ['i1'],
      ceilingIds: ['dcl1'],
    };
    const lignes = pullSchedule(
      [eclairage],
      new Map([['e1', { conduit: 30, cable: 33, runs: 2 }]]),
      undefined,
      [fx('i1', 'inter')],
    );
    expect(lignes[0].fils).toBe(4);
    const roles = lignes[0].brins.map((b) => b.role).sort();
    expect(roles).toEqual(['neutre', 'phase', 'retour', 'terre']);

    const list = buyingList(lignes, [fx('i1', 'inter')]);
    const retour = list.find((r) => r.code === 'fil-1.5-retour');
    expect(retour).toBeDefined();
    expect(retour!.label).toContain('Retour de lampe — violet');
    expect(retour!.note).toContain('marge assumée');
    // Les quatre conducteurs sont commandés, pas trois.
    expect(list.filter((r) => r.code?.startsWith('fil-1.5-'))).toHaveLength(4);
  });

  it('et un VA-ET-VIENT fait grossir la gaine', () => {
    /*
      Le controle en sens inverse du diametre : six conducteurs en 1,5 ne
      passent pas dans un ICTA 16 — la regle du tiers l'interdit. Une gaine
      choisie sur la seule section aurait annonce du 16, et le tirage se
      serait fait au treuil.
    */
    const va: Circuit = {
      id: 'e2',
      label: 'Éclairage — Couloir',
      nature: 'eclairage',
      points: 3,
      section: 1.5,
      breaker: 16,
      rooms: ['Couloir'],
      fixtureIds: ['v1', 'v2'],
      ceilingIds: ['dcl2'],
    };
    const lignes = pullSchedule([va], undefined, undefined, [
      fx('v1', 'va'),
      fx('v2', 'va'),
    ]);
    expect(lignes[0].fils).toBe(6);
    expect(`six fils en 1,5 : ICTA ${lignes[0].conduit}`).toBe(
      'six fils en 1,5 : ICTA 20',
    );
  });

  it('ne commande pas de conducteur pour les courants faibles', () => {
    const list = buyingList(rows, []);
    expect(list.some((r) => r.label.includes('H07V-U') && r.note?.includes('27')))
      .toBe(false);
  });

  it('une boîte par POSTE, une plaque par ensemble', () => {
    const fixtures = [
      fx('a', 'prise'),
      fx('b', 'prise', 'g1'),
      fx('c', 'rj45', 'g1'),
      fx('d', 'prise3'),
    ];
    const list = buyingList([], fixtures);
    const boites = list.find((r) => r.label.includes('encastrement'))!;
    // Le rayon où la chercher au magasin, pas seulement son nom.
    expect(boites.family).toBe('Encastrement et finition');
    // 1 (simple) + 2 (ensemble) + 3 (prise triple) = 6 postes.
    expect(boites.quantity).toBe(6);

    const p1 = list.find((r) => r.label === 'Plaque de finition 1 poste')!;
    const p2 = list.find((r) => r.label === 'Plaque de finition 2 postes')!;
    const p3 = list.find((r) => r.label === 'Plaque de finition 3 postes')!;
    expect(p1.quantity).toBe(1);
    expect(p2.quantity).toBe(1);
    expect(p3.quantity).toBe(1);
    /**
     * La LARGEUR d'une plaque ne se commande pas.
     *
     * On l'écrivait en note : « Plaque 1 poste — 82 mm de large ». Un
     * fournisseur ne cherche pas une plaque de 82 mm, il cherche une plaque
     * un poste : la cote découle du nombre de postes, l'écrire ajoute un
     * chiffre à vérifier sans rien apporter. L'entraxe, lui, se vérifie —
     * et seulement à partir de deux postes.
     */
    expect(p1.spec).toBeUndefined();
    expect(p2.spec).toContain('71 mm');
    expect(p3.spec).toContain('71 mm');
    expect(JSON.stringify(list)).not.toContain('82 mm');
  });

  it('compte les mécanismes poste par poste, pas appareil par appareil', () => {
    const list = buyingList([], [fx('d', 'prise3'), fx('a', 'prise')]);
    const socles = list.find((r) => r.label === 'Prise 16 A')!;
    // Une prise triple, ce sont trois socles à poser.
    expect(socles.quantity).toBe(4);
  });

  it('un chantier vide ne commande rien', () => {
    expect(buyingList([], [])).toEqual([]);
  });
});
