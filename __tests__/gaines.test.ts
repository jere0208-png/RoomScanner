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

  it('compte TROIS conducteurs par mètre de parcours', () => {
    const list = buyingList(rows, []);
    // À la française : le fournisseur lit « 2,5 mm² », pas « 2.5 ».
    const c25 = list.find((r) => r.label.includes('2,5 mm²'))!;
    // 66 m de parcours → 198 m de fil → deux couronnes.
    expect(c25.note).toContain('198');
    expect(c25.quantity).toBe(2);
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
