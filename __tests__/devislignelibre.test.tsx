/**
 * LA PAGE DU DEVIS, CÔTÉ ARTISAN — relevé d'un électricien artisan (2
 * salariés, sur Obat et Batappli) : « je paierais pour de vrai si… ».
 *
 * Sur la page : une ligne libre s'écrit, se corrige, se retire, et le total
 * la suit ; les heures de pose se corrigent ; la TVA se choisit (5,5 %) ;
 * l'acompte s'affiche en euros ; le coefficient de « Mon entreprise » fait
 * le prix de vente d'un article que son tarif pro connaît — et le PDF
 * partagé n'en dit rien.
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
import { Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import { prixDuDevis, type OptionsDuDevis } from '../src/geometry/mainDOeuvre';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import { DevisScreen } from '../src/screens/DevisScreen';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import { GAMMES, cleDuTarif } from '../src/geometry/prix';
import { useAccountStore } from '../src/store/accountStore';
import { CLE_ENTREPRISE, CONDITIONS_PAR_DEFAUT, useEntreprise } from '../src/store/entreprise';
import { usePrixPro } from '../src/store/prixPro';
import { useReglagesPose } from '../src/store/reglagesPose';
import { useScanStore } from '../src/store/scanStore';
import { fr } from '../src/screens/result/format';

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

const PLAN = {
  walls: [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)],
  openings: [],
  objects: [],
  rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
  fixtures: [fx('p1', 'prise', 1), fx('p2', 'prise2', 2), fx('p3', 'prise', 3), fx('tb', 'tableau', 4)],
  ceiling: [],
  photos: [],
  notes: [],
  niveauCourant: 0,
  scanName: 'Chantier Martin',
  gammeDevis: GAMMES[0].id,
  devisEcartes: [],
  devisQuantites: {},
  devisAjouts: [],
  devisPrix: {},
  devisNumero: null,
  devisLignesLibres: [],
  devisHeures: {},
  devisTva: null,
};

const devisDuPlan = () =>
  chiffrerLePlan(PLAN.walls, PLAN.rooms as never, PLAN.fixtures, [], PLAN.gammeDevis, new Set(), [], {
    quantites: {},
    ajouts: [],
    prix: {},
  });
/** Le prix attendu, par la fonction pure, avec ce que la page lui passe. */
const attendu = (options: OptionsDuDevis = {}) =>
  prixDuDevis(devisDuPlan(), PLAN.fixtures, [], { taux: 45, chantier: 'renovation' }, {
    lignesLibres: useScanStore.getState().devisLignesLibres,
    heures: useScanStore.getState().devisHeures,
    tva: useScanStore.getState().devisTva,
    acompte: useEntreprise.getState().acompte,
    ...options,
  });
const euros = (v: number) => `${fr(v, 2)} €`;

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockDisque.clear();
  useReglagesPose.setState({ charge: true, taux: 45, chantier: 'renovation' });
  usePrixPro.setState({ charge: true, tarif: null });
  useEntreprise.setState({ ...CONDITIONS_PAR_DEFAUT, nom: 'Électricité Dupont', siret: '123', decennale: 'MAAF', charge: true } as never);
  useAccountStore.setState({ compte: { id: 'x', email: 'a@b.c' }, pro: true } as never);
});
let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const aPlat = (x: unknown): string =>
  typeof x === 'string' || typeof x === 'number'
    ? String(x)
    : Array.isArray(x)
      ? x.map(aPlat).join('')
      : x && typeof x === 'object' && 'props' in x
        ? aPlat((x as { props: { children?: unknown } }).props.children)
        : '';

async function auTicket() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({ ...PLAN, screen: 'devis', etapeDevis: 0 } as never);
    t = TestRenderer.create(<DevisScreen />);
  });
  arbre = t;
  act(() => bouton(t, 'Voir le prix').props.onPress());
  await act(async () => {
    jest.advanceTimersByTime(ATTENTE_MIN + 2000);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') n.props.onLayout({ nativeEvent: { layout: { width: 360, height: 240 } } });
    }
  });
  return t;
}
const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith(nom)).pop()!;
const champ = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === nom)!;
const mots = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Text).map((n) => aPlat(n.props.children));
/** Le champ de la feuille de saisie (celle qui valide au retour clavier). */
const feuille = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(TextInput).filter((x) => typeof x.props.onSubmitEditing === 'function').pop()!;
const saisir = (t: TestRenderer.ReactTestRenderer, v: string) => {
  act(() => feuille(t).props.onChangeText(v));
  act(() => feuille(t).props.onSubmitEditing());
  act(() => {
    jest.advanceTimersByTime(400);
  });
};

describe('les lignes libres', () => {
  it('s’écrivent, entrent au total, se corrigent et se retirent', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'Ajouter une ligne libre').props.onPress());
    act(() => bouton(t, 'Ligne courante : Consuel').props.onPress());
    act(() => champ(t, 'Prix unitaire HT').props.onChangeText('150'));
    act(() => bouton(t, 'Enregistrer la ligne').props.onPress());

    const [l] = useScanStore.getState().devisLignesLibres;
    expect(l).toMatchObject({ designation: 'Consuel', quantite: 1, puHt: 150, type: 'forfait' });
    expect(mots(t)).toContain('Consuel');
    // Le gros total suit : celui de `prixDuDevis`, ligne libre comprise.
    const avec = attendu();
    expect(avec.totaux.forfaitsHt).toBe(150);
    expect(mots(t)).toContain(euros(avec.totaux.ttc));

    act(() => bouton(t, 'Modifier la ligne : Consuel').props.onPress());
    act(() => champ(t, 'Prix unitaire HT').props.onChangeText('180,5'));
    act(() => champ(t, 'Unité').props.onChangeText('forf.'));
    act(() => bouton(t, 'Enregistrer la ligne').props.onPress());
    expect(useScanStore.getState().devisLignesLibres).toEqual([{ ...l, puHt: 180.5, unite: 'forf.' }]);
    expect(mots(t)).toContain(euros(attendu().totaux.ttc));

    act(() => bouton(t, 'Retirer la ligne : Consuel').props.onPress());
    expect(useScanStore.getState().devisLignesLibres).toEqual([]);
    expect(mots(t)).not.toContain('Consuel');
  });

  it('une ligne sans prix ne s’enregistre pas, et la page le dit', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'Ajouter une ligne libre').props.onPress());
    act(() => champ(t, 'Désignation').props.onChangeText('Déplacement'));
    act(() => bouton(t, 'Enregistrer la ligne').props.onPress());
    expect(useScanStore.getState().devisLignesLibres).toEqual([]);
    expect(mots(t)).toContain('Le prix unitaire HT doit être un nombre.');
  });

  it('le magasin les garde et les écarte d’une ligne abîmée', () => {
    act(() => useScanStore.setState({ devisLignesLibres: [] } as never));
    const st = useScanStore.getState();
    st.ecrireLigneLibre({ id: 'x', designation: 'Mise en service', quantite: 1, unite: 'u', puHt: 80, type: 'mainDOeuvre' });
    st.ecrireLigneLibre({ id: 'y', designation: 'Abîmée', quantite: -1, unite: 'u', puHt: 10, type: 'forfait' });
    expect(useScanStore.getState().devisLignesLibres.map((l) => l.id)).toEqual(['x']);
  });
});

describe('les heures, la TVA, l’acompte', () => {
  it('les heures d’une famille de pose se corrigent, et le total suit', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'Corriger les heures : Prises').props.onPress());
    saisir(t, '6');
    expect(useScanStore.getState().devisHeures).toEqual({ Prises: 6 });
    expect(mots(t)).toContain(euros(attendu().totaux.ttc));
    expect(mots(t).some((m) => m.includes('corrigé'))).toBe(true);
  });

  it('TVA 5,5 % se choisit pour le devis', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'TVA 5,5 %').props.onPress());
    expect(useScanStore.getState().devisTva).toBe(0.055);
    const ht = t.root.findAll((n) => n.props?.testID === 'total-ht' && n.type === Text)[0];
    expect(aPlat(ht.props.children)).toContain('TVA 5,5 %');
    expect(mots(t)).toContain(euros(attendu().totaux.ttc));
  });

  it('l’acompte de « Mon entreprise » s’affiche en euros TTC', async () => {
    const t = await auTicket();
    const a = t.root.findAll((n) => n.props?.testID === 'acompte' && n.type === Text)[0];
    const { totaux } = attendu();
    expect(aPlat(a.props.children)).toBe(`Acompte 30 % à la commande : ${euros(totaux.acompte)} TTC`);
  });
});

describe('le coefficient de vente', () => {
  it('fait le prix de l’article que le tarif connaît, et le PDF n’en dit rien', async () => {
    const devis = devisDuPlan();
    const prise = devis.lignes.find((l) => l.code.startsWith('meca-') && (l.pu ?? 0) > 0)!;
    usePrixPro.setState({
      charge: true,
      tarif: {
        distributeur: 'Rexel',
        fichier: 'rexel.csv',
        importe: '2026-10-10',
        lues: 1,
        prix: { [cleDuTarif(prise.code, devis.gamme)]: { pu: 2.37, designation: 'Prise', par: 'ean' } },
      },
    });
    useEntreprise.getState().reglerConditions({ coefficient: 1.3 });
    const t = await auTicket();
    // 2,37 × 1,3 = 3,081 → 3,08 € HT.
    expect(mots(t)).toContain(`${prise.quantite} ${prise.unite} × 3,08 € HT`);
    expect(mots(t).some((m) => m.includes('vendu × 1,30'))).toBe(true);

    const partager = RoomScan.sharePDF as unknown as jest.Mock;
    partager.mockClear();
    await act(async () => {
      await bouton(t, 'Exporter le devis').props.onPress();
    });
    const pdf = Buffer.from(partager.mock.calls[0][0], 'base64').toString('latin1');
    expect(pdf).toContain(`(3,08 ${String.fromCharCode(0x80)}) Tj`);
    expect(pdf).not.toContain('2,37');
    expect(pdf).not.toMatch(/coef|achat/i);
  });

  it('se règle dans « Mon entreprise », borné, et se garde sur l’appareil', async () => {
    const e = useEntreprise.getState();
    e.reglerConditions({ coefficient: 0.8, acompte: 140, validite: 0, paiement: '  À réception.  ' });
    expect(useEntreprise.getState()).toMatchObject({ coefficient: 1, acompte: 100, validite: 1, paiement: 'À réception.' });
    e.reglerConditions({ coefficient: null });
    expect(useEntreprise.getState().coefficient).toBeNull();
    e.reglerConditions({ coefficient: 1.35, acompte: 40, validite: 60 });
    const lu = JSON.parse(mockDisque.get(CLE_ENTREPRISE)!);
    expect(lu).toMatchObject({ coefficient: 1.35, acompte: 40, validite: 60, paiement: 'À réception.' });
    useEntreprise.setState({ ...CONDITIONS_PAR_DEFAUT, charge: false } as never);
    await act(async () => {
      await useEntreprise.getState().charger();
    });
    expect(useEntreprise.getState()).toMatchObject({ coefficient: 1.35, acompte: 40, validite: 60 });
  });

  it('se règle aussi depuis la page, sous « Vos conditions »', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'Vos conditions de devis').props.onPress());
    act(() => bouton(t, 'Régler : Coefficient de vente').props.onPress());
    saisir(t, '1,4');
    expect(useEntreprise.getState().coefficient).toBe(1.4);
    act(() => bouton(t, 'Régler : Coefficient de vente').props.onPress());
    saisir(t, '');
    expect(useEntreprise.getState().coefficient).toBeNull();
  });
});
