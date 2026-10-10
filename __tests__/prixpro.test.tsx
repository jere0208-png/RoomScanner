/**
 * LES PRIX PRO, LES PRIX DE CHAQUE MAGASIN, LE TOTAL AU MOINS CHER.
 *
 * Relevés du patron : « trouve un moyen d'avoir aussi les prix pro Rexel,
 * Balitrand, Yesss, etc. » ; puis « liste en petit le prix de chaque magasin
 * […] le devis total se fiera au prix le moins cher ; donne aussi le prix
 * total "public" sous le total, en petit » ; et « n'affiche le bouton du devis
 * qu'à partir d'un élément coûtant placé, à côté du bouton des normes ».
 *
 * Les prix pro ne sont publiés nulle part — ce sont ceux du COMPTE de
 * l'électricien. On lit donc le tarif qu'il exporte de son espace client, et
 * on le rapproche du devis par l'EAN ou la référence fabricant, jamais par la
 * désignation. Ce banc tient la lecture (séparateurs, décimales, en-têtes des
 * distributeurs, unité de prix, remise), le rapprochement, l'achat du devis,
 * et ce que l'écran en montre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  achatPro,
  cleDeRef,
  distributeurDe,
  lireCSV,
  lireTarif,
  nombre,
  rapprocher,
  roleDe,
} from '../src/geometry/tarifPro';
import { usePrixPro } from '../src/store/prixPro';
import { CartePrixPro, motDeLImport } from '../src/components/CartePrixPro';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import { GAMMES, appliquerLesTarifs, cleDuTarif } from '../src/geometry/prix';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** Un export comme en rendent les espaces clients : un titre, puis l'en-tête. */
const EXPORT_REXEL = [
  '﻿Mon tarif personnalisé — compte 123456;;;;;;;',
  'Référence Rexel;Référence fabricant;Désignation;Marque;Code EAN;Prix public HT;Prix net HT;Unité de prix',
  'LEG600901;600901;Plaque Dooxie 1 poste blanc;LEGRAND;3414971090040;2,10;1,12;U',
  'LEG092840;092840;"Interrupteur différentiel 40A ""AC"" 30mA";LEGRAND;3245060928407;98,50;37,31;U',
  'XXX000001;ABC12;Boîte Batibox 1 poste P40;LEGRAND;;;"123,00";C',
  'NEXCAB15;;Fil H07VU 1,5 noir 100m;NEXANS;3427500597262;45,00;21,90;U',
].join('\r\n');

describe('la lecture du tarif', () => {
  it('un CSV français : point-virgule, guillemets, virgule décimale', () => {
    const l = lireCSV(EXPORT_REXEL);
    expect(l[1][0]).toBe('Référence Rexel');
    expect(l[3][2]).toBe('Interrupteur différentiel 40A "AC" 30mA');
    expect(nombre('1 234,56 €')).toBe(1234.56);
    expect(nombre('1.234,56')).toBe(1234.56);
    expect(nombre('12.5')).toBe(12.5);
    expect(nombre('sur devis')).toBeNull();
  });

  it('les en-têtes des distributeurs', () => {
    expect(roleDe('Code EAN')).toBe('ean');
    expect(roleDe('GTIN')).toBe('ean');
    expect(roleDe('Référence fabricant')).toBe('refFab');
    expect(roleDe('Réf. Rexel')).toBe('refDistrib');
    expect(roleDe('Désignation')).toBe('designation');
    expect(roleDe('Prix net HT')).toBe('net');
    expect(roleDe('Prix public HT')).toBe('public');
    expect(roleDe('Unité de prix')).toBe('parQuantite');
    expect(roleDe('Remise %')).toBe('remise');
    expect(roleDe('Marque')).toBeNull();
  });

  it('l’en-tête trouvé sous le titre, le prix « au cent » ramené à l’unité', () => {
    const t = lireTarif(lireCSV(EXPORT_REXEL))!;
    expect(t).toHaveLength(4);
    expect(t[0]).toMatchObject({ ean: '3414971090040', refFab: '600901', net: 1.12, parQuantite: 1 });
    expect(t[2]).toMatchObject({ refFab: 'ABC12', net: 123, parQuantite: 100 });
  });

  it('un prix public et une remise, sans net : le net est le public remisé', () => {
    const t = lireTarif([
      ['EAN', 'Désignation', 'Prix public', 'Remise %'],
      ['3414971090040', 'Plaque', '2,00', '35 %'],
      ['3414971090071', 'Plaque 2', '4,00', '1'],
    ])!;
    expect(t[0].net).toBeCloseTo(1.3);
    // « 1 » sans signe : un pour cent, pas cent pour cent.
    expect(t[1].net).toBeCloseTo(3.96);
  });

  it('un fichier sans colonne de produit ou de prix est refusé', () => {
    expect(lireTarif([['Nom', 'Ville'], ['Dupont', 'Lyon']])).toBeNull();
  });
});

describe('le rapprochement', () => {
  const refs = {
    'plaque-dooxie-1': { ean: '3414971090040' },
    'diff-AC': { ean: '9999999999999', ref: '092840' },
    'boite-encastrement': { ref: 'ABC12', facteur: 0.1 },
    'fil-1.5': { ean: '3427500597262' },
    'meca-dooxie-prise': { ean: '3414971087187' },
  };
  const lignes = lireTarif(lireCSV(EXPORT_REXEL))!;

  it('par l’EAN d’abord, par la référence fabricant ensuite', () => {
    const p = rapprocher(lignes, refs);
    expect(p['plaque-dooxie-1']).toEqual({ pu: 1.12, designation: 'Plaque Dooxie 1 poste blanc', par: 'ean' });
    // L'EAN ne correspond pas, la référence fabricant si (zéros de tête compris).
    expect(p['diff-AC']).toMatchObject({ pu: 37.31, par: 'ref' });
    expect(p['fil-1.5'].pu).toBe(21.9);
    // Ce que le tarif ne connaît pas n'est pas inventé.
    expect(p['meca-dooxie-prise']).toBeUndefined();
  });

  it('au conditionnement du devis : le prix au cent, puis le facteur du relevé', () => {
    // 123 € les 100, une boîte vaut 1,23 € ; le devis compte au lot de 10
    // ramené à la boîte (facteur 0,1)… soit 0,12 € dans l'unité du devis.
    expect(rapprocher(lignes, refs)['boite-encastrement'].pu).toBe(0.12);
  });

  it('la référence du distributeur porte celle du fabricant (« LEG600901 »)', () => {
    const p = rapprocher(
      [{ refDistrib: 'LEG600901', designation: 'Plaque', net: 1.05, public: null, parQuantite: 1 }],
      { 'plaque-dooxie-1': { ref: '600901' } },
    );
    expect(p['plaque-dooxie-1'].pu).toBe(1.05);
    // Une référence trop courte ne se cherche pas dans une autre.
    const court = rapprocher(
      [{ refDistrib: 'LEG600901', designation: 'Plaque', net: 1.05, public: null, parQuantite: 1 }],
      { x: { ref: '901' } },
    );
    expect(court.x).toBeUndefined();
  });

  it('jamais par la désignation', () => {
    const p = rapprocher(
      [{ designation: 'Plaque Dooxie 1 poste blanc', net: 1, public: null, parQuantite: 1, refFab: 'ZZZ' }],
      { 'plaque-dooxie-1': { ean: '3414971090040' } },
    );
    expect(p).toEqual({});
    expect(cleDeRef('0 928-40')).toBe('92840');
  });

  it('le distributeur, d’après le nom du fichier', () => {
    expect(distributeurDe('Export_tarif_REXEL_2026.xlsx')).toBe('Rexel');
    expect(distributeurDe('tarif-yesss.csv')).toBe('Yesss Électrique');
    expect(distributeurDe('balitrand octobre.csv')).toBe('Balitrand');
    expect(distributeurDe('mon-tarif.csv')).toBe('Votre distributeur');
  });
});

describe('le tarif gardé', () => {
  beforeEach(() => usePrixPro.setState({ tarif: null, charge: true }));

  it('s’importe, se garde, se retire', () => {
    const r = usePrixPro
      .getState()
      .importerLignes(lireCSV(EXPORT_REXEL), 'tarif_rexel.csv', { 'plaque-dooxie-1': { ean: '3414971090040' } }, '2026-10-10');
    expect(r.ok).toBe(true);
    const t = usePrixPro.getState().tarif!;
    expect(t.distributeur).toBe('Rexel');
    expect(t.importe).toBe('2026-10-10');
    expect(t.lues).toBe(4);
    // On ne garde que ce qui est reconnu : pas le fichier.
    expect(Object.keys(t.prix)).toEqual(['plaque-dooxie-1']);
    usePrixPro.getState().retirer();
    expect(usePrixPro.getState().tarif).toBeNull();
  });

  it('dit pourquoi un import n’a rien donné', () => {
    const s = usePrixPro.getState();
    expect(s.importerLignes([['Nom'], ['x']], 'a.csv', {}, '2026-10-10')).toEqual({ ok: false, raison: 'colonnes' });
    expect(s.importerLignes(lireCSV(EXPORT_REXEL), 'a.csv', { x: { ean: '1' } }, '2026-10-10')).toEqual({
      ok: false,
      raison: 'aucun',
    });
    expect(motDeLImport('annule')).toBeNull();
    expect(motDeLImport('colonnes')).toMatch(/EAN/);
  });
});

// ------------------------------------------------------------- le devis

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
const fx = (id: string, kind: Fixture['kind'], along: number): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along,
  height: 0.25,
  side: 1,
});
const ROOMS = [{ id: 'r1', name: 'Séjour', floor: null }];

describe('le devis au moins cher, et au prix public', () => {
  afterEach(() => appliquerLesTarifs(null));

  it('le total prend le magasin le moins cher ; le prix public se compte à part', () => {
    const gamme = GAMMES[0].id;
    const cle = cleDuTarif('meca-prise', gamme);
    appliquerLesTarifs({
      version: '2026-10.10',
      releve: '2026-10-10',
      source: 'Castorama',
      prix: { [cle]: 4.99 },
      offres: {
        [cle]: [
          { enseigne: 'Brico Dépôt', pu: 4.99 },
          { enseigne: 'Castorama', pu: 5.5 },
        ],
      },
    });
    const d = chiffrerLePlan(MURS, ROOMS as never, [fx('p1', 'prise', 1), fx('p2', 'prise', 2)], [], gamme);
    const l = d.lignes.find((x) => x.code === 'meca-prise')!;
    expect(l.pu).toBe(4.99);
    expect(l.source).toBe('Brico Dépôt');
    expect(l.puPublic).toBe(5.5);
    expect(l.offres?.map((o) => o.enseigne)).toEqual(['Brico Dépôt', 'Castorama']);
    // Le prix public reprend chaque ligne à son prix Castorama, et seulement
    // les lignes gardées.
    const attendu = d.lignes.reduce(
      (s, x) => s + (x.ecarte || x.pu === null ? 0 : (x.puPublic ?? x.pu) * x.quantite),
      0,
    );
    expect(d.totalPublic).toBeCloseTo(attendu, 2);
    expect(d.totalPublic).toBeGreaterThan(d.total);
  });

  it('l’achat pro porte sur les seuls articles reconnus, hors écartés', () => {
    const a = achatPro(
      [
        { code: 'meca-prise', quantite: 4, total: 22 },
        { code: 'plaque-1', quantite: 4, total: 7.6, ecarte: true },
        { code: 'fil-1.5', quantite: 1, total: 27.9 },
      ],
      (code) => cleDuTarif(code, 'dooxie'),
      {
        distributeur: 'Rexel',
        fichier: 'x.csv',
        importe: '2026-10-10',
        lues: 3,
        prix: {
          'meca-dooxie-prise': { pu: 3.1, designation: 'Prise', par: 'ean' },
          'plaque-dooxie-1': { pu: 1.12, designation: 'Plaque', par: 'ean' },
        },
      },
    )!;
    expect(a.reconnus).toBe(1);
    expect(a.totalHT).toBe(12.4);
    expect(a.publicTTC).toBe(22);
    // L'écartée garde son prix pro pour la ligne, sans compter au total.
    expect(a.parCle['plaque-dooxie-1'].pu).toBe(1.12);
    expect(achatPro([], (c) => c, null)).toBeNull();
  });

  it('l’écran : la carte, le prix pro sous la ligne, les magasins en petit, le prix public sous le total', () => {
    const src = lire('src/screens/DevisScreen.tsx');
    expect(src).toContain('<CartePrixPro');
    expect(src).toMatch(/Achat pro \$\{euros\(pro\.pu\)\} HT/);
    expect(src).toContain('testID="offres-de-la-ligne"');
    expect(src).toContain('testID="total-public"');
    // Le prix public s'écrit SOUS le total, avant la mention de la pose.
    expect(src.indexOf('testID="total-public"')).toBeGreaterThan(src.indexOf('<TotalQuiMonte'));
  });

  it('la carte dit quoi faire, puis ce qui a été reconnu', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <CartePrixPro tarif={null} reconnus={0} enCours={false} message={null} possible onImporter={() => {}} onRetirer={() => {}} />,
      );
    });
    const textes = () => t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(textes().join(' ')).toMatch(/Rexel, Sonepar, Yesss, Balitrand/);
    act(() => {
      t.update(
        <CartePrixPro
          tarif={{ distributeur: 'Rexel', fichier: 'x', importe: '2026-10-10', lues: 40, prix: {} }}
          reconnus={12}
          enCours={false}
          message={null}
          possible
          onImporter={() => {}}
          onRetirer={() => {}}
        />,
      );
    });
    expect(textes().join(' ')).toMatch(/Tarif Rexel du 10 octobre 2026 · 12 articles de ce devis reconnus/);
    act(() => t.unmount());
  });
});

describe('le bouton du devis', () => {
  it('n’apparaît qu’avec un élément chiffré, contre le bouton des normes', () => {
    const src = lire('src/screens/ResultScreen.tsx');
    const i = src.indexOf('<DevisPastille');
    const garde = src.lastIndexOf('{totalDevis !== null && totalDevis > 0 && (', i);
    expect(garde).toBeGreaterThan(0);
    expect(i - garde).toBeLessThan(80);
    // Et toujours juste avant le contrôle des normes.
    expect(src.indexOf('<ControlePastille', i) - i).toBeLessThan(1200);
  });
});
