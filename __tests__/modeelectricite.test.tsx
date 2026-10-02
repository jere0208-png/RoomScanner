/**
 * LE MODE ÉLECTRICITÉ — l'application grand public, et l'atelier derrière un
 * interrupteur.
 *
 * Relevé du patron : « elle doit être suggérée à un public large sur l'App
 * Store et non seulement aux électriciens. Mais j'ai édité l'application pour
 * qu'elle me serve à moi aussi, en tant qu'électricien. Sauf que c'est trop
 * axé électricité et pas très intuitif pour ceux qui n'y comprennent rien. »
 * Et : « une proposition pour passer à un mode "Électricité", sans quoi on
 * pourrait simplement scanner la pièce pour les cotes, meubles etc. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE MESURE CE BANC.
 *
 * 1. LA PRÉFÉRENCE : une seule, pour tout l'appareil, retenue d'une ouverture
 *    à l'autre. Une installation neuve démarre SANS l'électricité — c'est le
 *    public large — et celle de quelqu'un qui a déjà posé des prises garde
 *    ses outils sans qu'on lui pose la question.
 *
 * 2. CE QU'ON NE VOIT PLUS SANS ELLE : les appareils, le plafond équipé, les
 *    gaines, le devis, le contrôle NF C 15-100, le tableau existant, la liste
 *    du matériel. Tout ce qu'un particulier ne comprend pas — et qui lui
 *    faisait croire qu'il s'était trompé d'application.
 *
 * 3. CE QUI NE BOUGE PAS : les DONNÉES. Un plan équipé, ouvert sans le mode,
 *    garde ses prises ; on les retrouve en le rallumant. Un interrupteur qui
 *    effacerait le travail d'un chantier ne serait pas un interrupteur.
 *
 * 4. LA PROPOSITION : sans le mode, le menu du plan offre de le passer. C'est
 *    la porte d'entrée de l'électricien qui découvre l'application.
 *
 * ET LES AUTRES BANCS RESTENT EN MODE ÉLECTRICITÉ. Ils décrivent l'atelier
 * tel qu'il a été construit, relevé après relevé : `jest.setup.js` allume le
 * mode pour eux, et ce banc-ci l'éteint explicitement là où il le veut.
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
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useUsage, CLE_USAGE } from '../src/store/usage';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

/** Remet la préférence dans l'état d'une installation qui ne l'a jamais lue. */
const neuve = () => {
  mockDisque.clear();
  useUsage.setState({ charge: false, modeElec: false, choisi: false });
};

describe('la préférence', () => {
  beforeEach(neuve);
  afterAll(() => useUsage.setState({ charge: true, modeElec: true, choisi: true }));

  it('une installation neuve démarre sans l’électricité, et sans avoir répondu', async () => {
    await useUsage.getState().charger();
    const u = useUsage.getState();
    expect(u.charge).toBe(true);
    expect(u.modeElec).toBe(false);
    // Pas encore de réponse : c'est le premier lancement qui la demandera.
    expect(u.choisi).toBe(false);
  });

  it('le choix se retient d’une ouverture à l’autre', async () => {
    await useUsage.getState().charger();
    act(() => useUsage.getState().choisir(true));
    // On repart comme au lancement suivant : l'état en mémoire est perdu,
    // seul le disque se souvient.
    useUsage.setState({ charge: false, modeElec: false, choisi: false });
    await useUsage.getState().charger();
    expect(useUsage.getState().modeElec).toBe(true);
    expect(useUsage.getState().choisi).toBe(true);
  });

  it('un disque illisible ne casse rien : on repart du grand public', async () => {
    mockDisque.set(CLE_USAGE, '{pas du json');
    await useUsage.getState().charger();
    expect(useUsage.getState().modeElec).toBe(false);
    expect(useUsage.getState().charge).toBe(true);
  });

  it('l’électricien qui a déjà posé des prises garde ses outils, sans question', async () => {
    /*
      C'est le patron lui-même : son téléphone porte des dizaines de plans
      équipés. Le jour où la mise à jour arrive, lui demander « êtes-vous
      électricien ? » serait une question idiote, et lui retirer ses prises
      jusqu'à ce qu'il trouve le réglage, une régression. On le DÉDUIT de sa
      bibliothèque.
    */
    await useUsage.getState().charger();
    useUsage.getState().deduireDuPasse([{ fixtures: [{}], ceiling: [] }]);
    expect(useUsage.getState().modeElec).toBe(true);
    expect(useUsage.getState().choisi).toBe(true);
  });

  it('mais une bibliothèque sans appareil ne décide rien à sa place', async () => {
    await useUsage.getState().charger();
    useUsage.getState().deduireDuPasse([{ fixtures: [], ceiling: [] }, {}]);
    expect(useUsage.getState().modeElec).toBe(false);
    expect(useUsage.getState().choisi).toBe(false);
  });

  it('et une réponse donnée n’est jamais écrasée par la déduction', async () => {
    /*
      Quelqu'un qui a dit « grand public » puis ouvert un plan d'électricien
      reçu d'un collègue ne doit pas voir l'application changer de visage
      dans son dos.
    */
    await useUsage.getState().charger();
    act(() => useUsage.getState().choisir(false));
    useUsage.getState().deduireDuPasse([{ fixtures: [{}] }]);
    expect(useUsage.getState().modeElec).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter(modeElec: boolean) {
  useUsage.setState({ charge: true, modeElec, choisi: true });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      scanName: 'Appartement',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      // UN PLAN ÉQUIPÉ — c'est tout l'enjeu : il a des prises, et sans le
      // mode on ne doit pas les voir.
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  act(() => jest.advanceTimersByTime(400));
  arbre = t;
  return t;
}

const etiquettes = (t: TestRenderer.ReactTestRenderer) =>
  new Set(
    t.root
      .findAllByType(TouchableOpacity)
      .map((n) => String(n.props.accessibilityLabel ?? '')),
  );

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string')
        .join(''),
    );

const presser = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);
  expect(b).toBeDefined();
  act(() => b!.props.onPress());
  act(() => jest.advanceTimersByTime(400));
};

describe('sans le mode, l’électricité disparaît de l’écran', () => {
  it('la barre du plan ne propose plus ni appareils, ni gaines, ni plafond', () => {
    const t = monter(false);
    const vu = etiquettes(t);
    for (const outil of ['Appareils', 'Gaines', 'Plafond']) {
      expect(`${outil} : ${vu.has(outil)}`).toBe(`${outil} : false`);
    }
    // Ce qui sert à tout le monde reste.
    for (const outil of ['Cotes', 'Meubles', 'Surfaces']) {
      expect(`${outil} : ${vu.has(outil)}`).toBe(`${outil} : true`);
    }
  });

  it('en édition, on pose des meubles — pas des prises', () => {
    const t = monter(false);
    presser(t, 'Édition');
    const vu = etiquettes(t);
    expect(vu.has('Appareil')).toBe(false);
    expect(vu.has('Plafond')).toBe(false);
    expect(vu.has('Meuble')).toBe(true);
    expect(vu.has('Note')).toBe(true);
  });

  it('ni devis, ni contrôle des normes sur le plan', () => {
    /*
      Les deux pastilles posées sur le plan — le total du devis et le verdict
      NF C 15-100 — sont les premières choses qu'un particulier voyait, et
      les deux lui parlaient une langue qu'il ne parle pas.
    */
    const t = monter(false);
    const vu = etiquettes(t);
    expect([...vu].some((l) => /devis/i.test(l))).toBe(false);
    expect([...vu].some((l) => /norme|NF C/i.test(l))).toBe(false);
  });

  it('la 3D ne propose plus la nuit, les volumes, ni les repères', () => {
    const t = monter(false);
    presser(t, 'Passer en 3D');
    const vu = etiquettes(t);
    for (const outil of ['Nuit', 'Volumes', 'Repères', 'Plafond']) {
      expect(`${outil} : ${vu.has(outil)}`).toBe(`${outil} : false`);
    }
    expect(vu.has('Meubles')).toBe(true);
  });

  it('le menu du plan ne propose plus de relever un tableau électrique', () => {
    const t = monter(false);
    presser(t, 'Plus');
    expect(textes(t)).not.toContain('Relever le tableau existant');
  });

  it('l’export ne propose plus la liste du matériel électrique', () => {
    const t = monter(false);
    presser(t, 'Exporter');
    const vu = textes(t);
    expect(vu).not.toContain('Liste du matériel');
    // Le plan, lui, s'exporte toujours.
    expect(vu).toContain('Plan PDF');
  });
});

describe('les données ne bougent pas', () => {
  it('un plan équipé, ouvert sans le mode, garde ses prises en mémoire', () => {
    monter(false);
    // Le mode masque ; il n'efface pas. On les retrouve en le rallumant.
    expect(useScanStore.getState().fixtures).toHaveLength(SNAPSHOT_FIXTURES.length);
  });
});

describe('la proposition', () => {
  it('sans le mode, le menu du plan offre de le passer', () => {
    const t = monter(false);
    presser(t, 'Plus');
    expect(textes(t)).toContain('Passer en mode Électricité');
  });

  it('avec le mode, tout est là — et la proposition se tait', () => {
    const t = monter(true);
    const vu = etiquettes(t);
    expect(vu.has('Appareils')).toBe(true);
    presser(t, 'Plus');
    const menu = textes(t);
    expect(menu).toContain('Relever le tableau existant');
    expect(menu).not.toContain('Passer en mode Électricité');
  });
});

describe('l’interrupteur du profil', () => {
  it('se trouve dans « Mon usage », et il allume comme il éteint', () => {
    /*
      Une préférence de l'APPAREIL, pas du plan : elle vit avec l'apparence.
      Un interrupteur d'iOS et non deux boutons — on l'allume ou on
      l'éteint, il n'y a pas de troisième réponse.
    */
    const { Switch } = require('react-native') as typeof import('react-native');
    const {
      ProfilScreen,
    } = require('../src/screens/ProfilScreen') as typeof import('../src/screens/ProfilScreen');
    useUsage.setState({ charge: true, modeElec: false, choisi: true });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ProfilScreen />);
    });
    arbre = t;
    expect(textes(t)).toContain('Mon usage');
    const inter = t.root
      .findAllByType(Switch)
      .find((n) => n.props.accessibilityLabel === 'Mode Électricité');
    expect(inter).toBeDefined();
    expect(inter!.props.value).toBe(false);
    act(() => inter!.props.onValueChange(true));
    expect(useUsage.getState().modeElec).toBe(true);
    act(() => inter!.props.onValueChange(false));
    expect(useUsage.getState().modeElec).toBe(false);
  });
});
