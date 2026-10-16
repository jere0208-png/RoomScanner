/**
 * UN SEUL PRIX — revue « Gérard », électricien.
 *
 * Trois totaux pour un même chantier : la pastille « Devis 1,5 k€ » disait
 * le matériel seul ; le gros TOTAL TTC de la page aussi, à 20 % ; le PDF,
 * matériel ET pose à 10 %. Le client voyait trois prix.
 *
 * Ce banc tient qu'il n'y en a plus qu'un, pose comprise, une seule TVA :
 * `prixDuDevis`. La pastille du plan, la page du devis et le PDF remis au
 * client disent le même nombre.
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
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import { prixDuDevis, vendreLeDevis } from '../src/geometry/mainDOeuvre';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import { DevisScreen } from '../src/screens/DevisScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import { GAMMES } from '../src/geometry/prix';
import { useAccountStore } from '../src/store/accountStore';
import { useEntreprise } from '../src/store/entreprise';
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
};

/** Le prix attendu, par la fonction pure, sur le plan du magasin. */
const attendu = () => {
  const st = useScanStore.getState();
  const devis = chiffrerLePlan(st.walls, st.rooms, st.fixtures, st.ceiling, st.gammeDevis, new Set(), st.openings, {
    quantites: {},
    ajouts: [],
    prix: {},
  });
  return { devis, ...prixDuDevis(devis, st.fixtures, st.ceiling, { taux: 45, chantier: 'renovation' }) };
};

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  useReglagesPose.setState({ charge: true, taux: 45, chantier: 'renovation' });
});
let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

describe('prixDuDevis', () => {
  it('compte la pose, et une seule TVA pour tout le chantier', () => {
    act(() => useScanStore.setState(PLAN as never));
    const { devis, pose, totaux } = attendu();
    expect(pose.heures).toBeGreaterThan(0);
    expect(totaux.poseHt).toBe(pose.ht);
    expect(totaux.tauxTva).toBe(pose.tauxTva);
    // Le même calcul que `vendreLeDevis` sur la pose estimée : rien n'est recompté ailleurs.
    expect(totaux).toEqual(vendreLeDevis(devis, pose).totaux);
    // Les fournitures, ligne à ligne HT, font le total des fournitures au centime.
    const somme = Math.round(prixDuDevis(devis, PLAN.fixtures, [], { taux: 45, chantier: 'renovation' }).fournitures.reduce((t, v) => t + v.totalHt, 0) * 100) / 100;
    expect(totaux.fournituresHt).toBe(somme);
    // Plus cher que le matériel seul : la pose y est.
    expect(totaux.ttc).toBeGreaterThan(devis.total);
  });
});

describe('le même nombre partout', () => {
  it('la pastille du plan dit le total pose comprise', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ ...PLAN, screen: 'result' } as never);
      t = TestRenderer.create(<ResultScreen />);
    });
    arbre = t;
    act(() => jest.advanceTimersByTime(400));
    const pastille = t.root.findAll((n) => /^Devis — environ/.test(String(n.props?.accessibilityLabel ?? '')))[0];
    expect(pastille).toBeDefined();
    expect(pastille.props.accessibilityLabel).toBe(
      `Devis — environ ${Math.round(attendu().totaux.ttc)} euros TTC, pose comprise`,
    );
  });

  it('la pastille suit aussi les lignes libres de l’artisan', () => {
    const libre = { id: 'l1', designation: 'Déplacement', quantite: 1, unite: 'forfait', puHt: 100, type: 'forfait' as const };
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ ...PLAN, devisLignesLibres: [libre], screen: 'result' } as never);
      t = TestRenderer.create(<ResultScreen />);
    });
    arbre = t;
    act(() => jest.advanceTimersByTime(400));
    const st = useScanStore.getState();
    const { devis } = attendu();
    const avecLibre = prixDuDevis(devis, st.fixtures, st.ceiling, { taux: 45, chantier: 'renovation' }, { lignesLibres: [libre] });
    expect(avecLibre.totaux.ttc).toBeGreaterThan(attendu().totaux.ttc);
    const pastille = t.root.findAll((n) => /^Devis — environ/.test(String(n.props?.accessibilityLabel ?? '')))[0];
    expect(pastille.props.accessibilityLabel).toBe(
      `Devis — environ ${Math.round(avecLibre.totaux.ttc)} euros TTC, pose comprise`,
    );
    act(() => useScanStore.setState({ devisLignesLibres: [] } as never));
  });

  it('la page affiche ce total en HT et TTC, et le PDF le reprend au centime', async () => {
    useAccountStore.setState({ compte: { id: 'x', email: 'a@b.c' }, pro: true } as never);
    useEntreprise.setState({
      nom: 'Électricité Dupont',
      siret: '123',
      decennale: 'MAAF',
      charge: true,
      dernierDevis: null,
    } as never);
    const partager = RoomScan.sharePDF as unknown as jest.Mock;
    partager.mockClear();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({ ...PLAN, screen: 'devis', etapeDevis: 0 } as never);
      t = TestRenderer.create(<DevisScreen />);
    });
    arbre = t;
    const bouton = (nom: string) =>
      t.root.findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith(nom)).pop()!;
    act(() => bouton('Voir le prix').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 2000);
    });
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') n.props.onLayout({ nativeEvent: { layout: { width: 360, height: 240 } } });
      }
    });
    const { totaux } = attendu();
    // MIS À JOUR — le HT du devis se lit sous le TOTAL DU DEVIS (bloc « Pose ») ;
    // le total de la liste, lui, est celui du matériel seul.
    const tout = t.root
      .findAllByType(Text)
      .map((n) => [n.props.children].flat().filter((x) => typeof x === 'string').join(''))
      .join(' | ');
    expect(tout).toContain(`${fr(totaux.ht, 2)} € HT`);
    // Le gros total, une fois monté : le TTC pose comprise.
    const vus = t.root
      .findAllByType(Text)
      .map((n) => [n.props.children].flat().filter((x) => typeof x === 'string').join(''));
    expect(vus).toContain(`${fr(totaux.ttc, 2)} €`);

    await act(async () => {
      await bouton('Exporter le devis').props.onPress();
    });
    expect(partager).toHaveBeenCalledTimes(1);
    const pdf = Buffer.from(partager.mock.calls[0][0], 'base64').toString('latin1');
    const [e, c] = totaux.ttc.toFixed(2).split('.');
    const enEuros = `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${c} ${String.fromCharCode(0x80)}`;
    expect(pdf).toContain(`(${enEuros}) Tj`);
  });
});
