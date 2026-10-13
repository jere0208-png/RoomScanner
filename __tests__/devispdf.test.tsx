/**
 * LE DEVIS S'EXPORTE EN PDF.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le devis ne
 * s'exportait pas — ni PDF ni partage, pas de bloc entreprise ou client,
 * pas de numéro. « Pour un pro, c'est une impasse. »
 *
 * Le document est celui qu'on remet au client : l'entreprise en tête, le
 * client et le chantier, un numéro et une date, les fournitures rayon par
 * rayon, la pose estimée avec sa TVA, le total, les exclusions, et la case
 * « bon pour accord ». Un long devis passe sur plusieurs pages ; le total
 * n'arrive qu'une fois, à la fin.
 */
const mockDisque = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import { buildDevisPdf } from '../src/export/pdf';
import type { Devis, LigneDevis } from '../src/geometry/devis';
import { estimerLaPose, totauxDuDevis } from '../src/geometry/mainDOeuvre';
import { DevisScreen } from '../src/screens/DevisScreen';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import { GAMMES } from '../src/geometry/prix';
import { useAccountStore } from '../src/store/accountStore';
import { ENTREPRISE_VIDE, useEntreprise } from '../src/store/entreprise';
import { useScanStore } from '../src/store/scanStore';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
const pages = (b: Uint8Array) => (latin1(b).match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

const ligne = (i: number, extra: Partial<LigneDevis> = {}): LigneDevis => ({
  famille: i % 2 ? 'Prises' : 'Tableau',
  code: `art-${i}`,
  libelle: `Article ${i}`,
  quantite: 2,
  unite: 'u',
  pu: 10,
  total: 20,
  ...extra,
});

const devisDe = (lignes: LigneDevis[]): Devis => ({
  gamme: GAMMES[0].id,
  version: 'test',
  lignes,
  total: lignes.reduce((s, l) => s + l.total, 0),
  totalPublic: 0,
  parFamille: [],
  sansPrix: [],
  exclusions: ['Luminaires : cela dépend des envies.', 'Main-d’œuvre : ce devis chiffre la fourniture.'],
  legende: [],
});

const DUPONT = { nom: 'Électricité Dupont', telephone: '06 12 34 56 78', email: 'contact@dupont-elec.fr', siret: '123 456 789 00012', adresse: '12 rue des Lilas, Lyon' };

describe('le document', () => {
  const lignes = [
    ligne(1),
    ligne(2),
    ligne(3, { ecarte: true, total: 0 }),
    ligne(4, { pu: null, total: 0, libelle: 'Article sans prix' }),
  ];
  const pose = estimerLaPose(
    [{ id: 'p', kind: 'prise', wallId: 'n', along: 1, height: 0.3, side: 1 }],
    [],
    2,
    { taux: 45, chantier: 'renovation' },
  );
  const src = latin1(
    buildDevisPdf({
      numero: 'D-2026-0007',
      date: new Date(2026, 9, 11),
      chantier: 'Appartement Martin',
      client: 'Claire Martin',
      adresse: '8 rue Pasteur, Lyon',
      entreprise: DUPONT,
      gamme: 'Legrand Céliane',
      devis: devisDe(lignes),
      pose,
    }),
  );

  /*
    REVUE « KARIM » : HT, TVA et TTC, au taux du chantier pour tout le
    devis — fournitures ramenées hors taxes.
  */
  it('donne le HT, la TVA du chantier et le TTC', () => {
    const t = totauxDuDevis(devisDe(lignes).total, pose);
    expect(t.fournituresHt).toBeCloseTo(devisDe(lignes).total / 1.2, 2);
    expect(t.tauxTva).toBe(pose.tauxTva);
    expect(t.ttc).toBeCloseTo((t.fournituresHt + pose.ht) * (1 + pose.tauxTva), 1);
    expect(src).toContain('(Total HT) Tj');
    expect(src).toContain('(Fournitures HT) Tj');
    expect(src).toMatch(/\(TVA \d+ %\) Tj/);
  });

  it('l’entreprise, le client, le numéro et la date en tête', () => {
    expect(src).toContain('(Électricité Dupont) Tj');
    expect(src).toContain('SIRET 123 456 789 00012');
    expect(src).toContain('(DEVIS) Tj');
    expect(src).toContain('D-2026-0007');
    expect(src).toContain('11/10/2026');
    expect(src).toContain('Claire Martin');
    expect(src).toContain('8 rue Pasteur, Lyon');
    expect(src).toContain('Appartement Martin');
  });

  it('les fournitures, sans les lignes écartées ; ce qui n’a pas de prix le dit', () => {
    expect(src).toContain('(Article 1) Tj');
    expect(src).toContain('(Article 2) Tj');
    expect(src).not.toContain('(Article 3) Tj');
    expect(src).toContain('(Article sans prix) Tj');
    expect(src).toContain('(à chiffrer) Tj');
  });

  it('ce qui ne se facture pas ne s’écrit pas « 0,00 € »', () => {
    const doc = latin1(
      buildDevisPdf({
        numero: 'D-2026-0009',
        date: new Date(2026, 9, 11),
        chantier: 'Séjour',
        devis: devisDe([
          ligne(1, { libelle: 'Point lumineux DCL', pu: 0, total: 0, note: 'Luminaire non compté : cela dépend des envies.' }),
          ligne(2, { libelle: 'Tableau électrique', pu: 0, total: 0, note: 'Le coffret lui-même est compté au rayon Tableau.' }),
          // Une ligne chiffrée : les totaux ne sont pas à zéro.
          ligne(3),
        ]),
      }),
    );
    expect(doc).toContain('(non compté) Tj');
    expect(doc).toContain('(compris) Tj');
    expect(doc).not.toContain('(0,00 €) Tj'.replace('€', String.fromCharCode(0x80)));
  });

  it('la pose estimée avec sa TVA, le total, les exclusions, le bon pour accord', () => {
    expect(src).toContain('Main-d');
    expect(src).toContain('TVA 10 %');
    expect(src).toMatch(/\(TOTAL TTC\) Tj/);
    expect(src).toContain('Luminaires : cela dépend des envies.');
    expect(src).toContain('Bon pour accord');
  });

  it('un long devis passe sur plusieurs pages, le total une seule fois', () => {
    const long = latin1(
      buildDevisPdf({
        numero: 'D-2026-0008',
        date: new Date(2026, 9, 11),
        chantier: 'Maison',
        devis: devisDe(Array.from({ length: 90 }, (_, i) => ligne(i + 10))),
      }),
    );
    expect(pages(new Uint8Array([...long].map((c) => c.charCodeAt(0))))).toBeGreaterThanOrEqual(2);
    expect((long.match(/\(TOTAL TTC\) Tj/g) ?? []).length).toBe(1);
    for (let i = 10; i < 100; i++) expect(long).toContain(`(Article ${i}) Tj`);
    expect(long).toMatch(/page 2 \/ \d/);
  });
});

describe('la numérotation des devis', () => {
  afterEach(() => useEntreprise.setState({ ...ENTREPRISE_VIDE, dernierDevis: null } as never));

  it('suit l’année et s’incrémente, et se garde sur l’appareil', () => {
    useEntreprise.setState({ dernierDevis: null } as never);
    const a = useEntreprise.getState().numeroterUnDevis(new Date(2026, 9, 11));
    const b = useEntreprise.getState().numeroterUnDevis(new Date(2026, 9, 12));
    expect(a).toBe('D-2026-0001');
    expect(b).toBe('D-2026-0002');
    expect(JSON.parse(mockDisque.get('echoplan.entreprise.v1')!).dernierDevis).toEqual({ annee: 2026, rang: 2 });
    // Une nouvelle année repart à un.
    expect(useEntreprise.getState().numeroterUnDevis(new Date(2027, 0, 3))).toBe('D-2027-0001');
  });
});

describe('sur la page du devis', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  });
  const fx = (id: string, kind: FixtureKind, along: number): Fixture => ({ id, kind, wallId: 'n', along, height: 0.25, side: 1 });

  it('« Exporter le devis » partage un PDF numéroté, et le plan garde son numéro', async () => {
    useAccountStore.setState({ compte: { id: 'x', email: 'a@b.c' }, pro: true } as never);
    useEntreprise.setState({ ...DUPONT, charge: true, dernierDevis: { annee: new Date().getFullYear(), rang: 41 } } as never);
    const partager = RoomScan.sharePDF as unknown as jest.Mock;
    partager.mockClear();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)],
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
        fixtures: [fx('p1', 'prise', 1), fx('tb', 'tableau', 4)],
        ceiling: [],
        photos: [],
        notes: [],
        niveauCourant: 0,
        screen: 'devis',
        scanName: 'Chantier Martin',
        gammeDevis: GAMMES[0].id,
        devisEcartes: [],
        devisQuantites: {},
        devisAjouts: [],
        devisPrix: {},
        devisNumero: null,
        etapeDevis: 0,
      } as never);
      t = TestRenderer.create(<DevisScreen />);
    });
    arbre = t;
    const mesurer = () =>
      act(() => {
        for (const n of t.root.findAllByType(View)) {
          if (typeof n.props.onLayout === 'function') n.props.onLayout({ nativeEvent: { layout: { width: 360, height: 240 } } });
        }
      });
    mesurer();
    const bouton = (nom: string) =>
      t.root.findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith(nom)).pop()!;
    act(() => bouton('Voir le prix').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 50);
    });
    mesurer();
    await act(async () => {
      await bouton('Exporter le devis').props.onPress();
    });
    expect(partager).toHaveBeenCalledTimes(1);
    const annee = new Date().getFullYear();
    expect(partager.mock.calls[0][1]).toBe(`Devis D-${annee}-0042 — Chantier Martin.pdf`);
    expect(useScanStore.getState().devisNumero).toBe(`D-${annee}-0042`);
    // Un second envoi du même devis garde son numéro.
    await act(async () => {
      await bouton('Exporter le devis').props.onPress();
    });
    expect(partager.mock.calls[1][1]).toBe(`Devis D-${annee}-0042 — Chantier Martin.pdf`);
  });
});
