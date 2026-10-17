/**
 * L'ACCUEIL ÉPURÉ — revue des huit testeurs « découvreurs » (clair-01, 04, 05).
 *
 *   — LE LIDAR DIT UNE FOIS : plus de mention au pied de la connexion ; une
 *     ligne sur la question d'usage ; la tuile éteinte sur l'accueil (voir
 *     aussi `lidartot.test.tsx` : plus de paragraphe ni de lien en double,
 *     la tuile éteinte en dernière place) ;
 *   — LA QUESTION D'USAGE ne cite plus « NF C 15-100 » au particulier ;
 *   — L'EN-TÊTE : une ligne de salut, une ligne de question, plus petite ;
 *   — « MES PLANS » VIDE montre l'exemple en vignette, et l'ouvre ;
 *   — « LIRE UN PLAN PAPIER » dit la règle : une lecture offerte hors Pro ;
 *   — LE PLAN EN COURS : « Plan en cours » pour un scan comme pour un
 *     dessin, « Reprendre » mis en avant, « Jeter » éloigné et confirmé ;
 *   — LA BIBLIOTHÈQUE compte des « plans », jamais des « scans ».
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => null),
    pause: jest.fn(),
    resume: jest.fn(),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { HomeScreen, metaDuBrouillon, ordreDesTuiles, sousLecture } from '../src/screens/HomeScreen';
import { PlanThumb } from '../src/screens/LibraryScreen';
import { SignInScreen } from '../src/screens/SignInScreen';
import { PremierLancement } from '../src/components/PremierLancement';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useNotifications } from '../src/store/notifications';
import { useUsage } from '../src/store/usage';
import { useAlerte } from '../src/ui/alerte';
import { MESSAGES_EMBARQUES } from '../src/data/nouveautes';
import { NOM_EXEMPLE } from '../src/data/exemple';

const lire = (rel: string) => readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');

let arbre: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null, error: null });
  useAccountStore.setState({ compte: null, pro: false, invite: false });
  useNotifications.setState({ charge: true, recus: [], lus: MESSAGES_EMBARQUES.map((m) => m.id), supprimes: [] });
});
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => useAlerte.setState({ courante: null, file: [] } as never));
  jest.useRealTimers();
  useUsage.setState({ charge: true, modeElec: true, choisi: true });
});

const monter = (ecran: React.ReactElement = <HomeScreen />) => {
  act(() => {
    arbre = TestRenderer.create(ecran);
  });
  return arbre!;
};
const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children ?? []).filter((x: unknown) => typeof x === 'string').join(''))
    .join(' | ');
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === label)[0];

const BROUILLON = {
  at: Date.now() - 5 * 60000,
  name: 'Salon',
  walls: [
    { id: 'n', type: 'wall', a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, height: 2.5, yCenter: 1.25 },
    { id: 'e', type: 'wall', a: { x: 4, z: 0 }, b: { x: 4, z: 3 }, height: 2.5, yCenter: 1.25 },
    { id: 'p', type: 'door', a: { x: 1, z: 0 }, b: { x: 2, z: 0 }, height: 2, yCenter: 1 },
  ],
  openings: [],
  objects: [],
  rooms: [],
  fixtures: [],
  ceiling: [],
  photos: [],
  modelPath: null,
};

describe('le LiDAR dit une fois', () => {
  it('le pied de la connexion n’en parle plus', () => {
    const t = monter(<SignInScreen />);
    const vu = mots(t);
    expect(vu).not.toContain('LiDAR');
    expect(vu).not.toContain('capteur');
    // La règle du jeu reste dite.
    expect(vu).toContain('gratuit et sans limite');
  });

  it('l’ordre des tuiles : le scan en dernier quand il est indisponible', () => {
    const t = { scan: 'S', dessin: 'D', exemple: 'E', lecture: 'L' };
    expect(ordreDesTuiles(false, t)).toEqual(['S', 'D', 'E', 'L']);
    expect(ordreDesTuiles(true, t)).toEqual(['D', 'L', 'E', 'S']);
  });
});

describe('la question d’usage parle au particulier', () => {
  it('la carte électricité ne cite plus « NF C 15-100 »', () => {
    useUsage.setState({ charge: true, choisi: false });
    const t = monter(<PremierLancement onFini={() => {}} />);
    const passer = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Passer'),
    )[0];
    act(() => passer.props.onPress());
    const vu = mots(t);
    expect(vu).toContain('Prévoir l’électricité');
    expect(vu).not.toContain('NF C');
    expect(vu).not.toContain('15-100');
    expect(vu).toContain('prises et lumières');
  });
});

describe('l’en-tête tient en deux lignes', () => {
  /*
    MIS À JOUR — le patron : « le sous-titre est devenu tout petit, remets-le
    comme avant, plus grand, plus moderne ». Un grand titre en deux tons : la
    question à la même taille que le salut, en retrait de couleur.
  */
  it('un salut et une question au même grand corps, deux tons, chacun sa ligne', () => {
    const t = monter();
    const salut = t.root.findAll((n) => n.type === Text && n.props.accessibilityRole === 'header')[0];
    expect(salut.props.numberOfLines).toBe(1);
    expect([].concat(salut.props.children).join('')).not.toContain('?');
    const question = t.root.findAll((n) => n.type === Text && n.props.testID === 'question-du-jour')[0];
    const st = StyleSheet.flatten(salut.props.style) as { fontSize: number; color: string };
    const qt = StyleSheet.flatten(question.props.style) as { fontSize: number; color: string };
    expect(qt.fontSize).toBe(st.fontSize);
    expect(qt.fontSize).toBeGreaterThanOrEqual(28);
    expect(qt.color).not.toBe(st.color);
    expect(String(question.props.children).length).toBeLessThanOrEqual(30);
  });
});

describe('« Mes plans », avant le premier', () => {
  it('montre l’exemple en vignette, et l’ouvre d’un appui', () => {
    const t = monter();
    const carte = t.root.findAll((n) => n.props?.testID === 'plans-vide' && typeof n.props?.onPress === 'function')[0];
    expect(carte).toBeDefined();
    // La vignette est un `React.memo` (lot « maj-plans ») : le moteur de test
    // la range sous sa fonction intérieure.
    const Vignette = (PlanThumb as unknown as { type: React.FC }).type;
    expect(carte.findAllByType(Vignette)).toHaveLength(1);
    expect(carte.findByType(Vignette).props.scan.name).toBe(NOM_EXEMPLE);
    act(() => carte.props.onPress());
    expect(useScanStore.getState().screen).toBe('result');
    expect(useScanStore.getState().scanName).toBe(NOM_EXEMPLE);
    // Rien n'est enregistré pour autant.
    expect(useScanStore.getState().saves).toHaveLength(0);
  });
});

describe('« Lire un plan papier » dit la règle', () => {
  it('hors Pro : une lecture offerte ; en Pro : rien à compter', () => {
    expect(sousLecture(false)).toContain('1 lecture offerte');
    expect(sousLecture(true)).not.toContain('offerte');
    let t = monter();
    expect(bouton(t, 'Lire un plan papier').props.accessibilityHint).toBe(sousLecture(false));
    act(() => t.unmount());
    useAccountStore.setState({ pro: true });
    t = monter();
    expect(bouton(t, 'Lire un plan papier').props.accessibilityHint).toBe('Photo ou PDF');
  });

  it('la règle est bien celle du serveur : une lecture d’essai par compte', () => {
    const api = lire('server/api.php');
    expect(api).toMatch(/!\$estPro && \(int\) \$l\['lectures'\] >= 1/);
  });
});

describe('le plan en cours', () => {
  it('« Plan en cours », et des mots qui valent pour un dessin', () => {
    useScanStore.setState({ brouillon: BROUILLON as never });
    const t = monter();
    const vu = mots(t);
    expect(vu).toContain('Plan en cours');
    expect(vu).not.toContain('Relevé interrompu');
    expect(vu).not.toContain('relevés');
    // Deux murs : la porte ne compte pas pour un mur.
    expect(vu).toContain('2 murs · Salon · il y a 5 min');
  });

  it('la ligne dit « Pas encore de mur » pour un plan vierge', () => {
    const t0 = Date.UTC(2026, 9, 9, 12);
    expect(metaDuBrouillon({ walls: [], name: '', at: t0 }, t0)).toBe('Pas encore de mur · à l’instant');
    expect(metaDuBrouillon({ walls: [{ type: 'wall' }], name: 'Cuisine', at: t0 - 3 * 60000 }, t0)).toBe('1 mur · Cuisine · il y a 3 min');
  });

  it('« Reprendre » est le bouton plein ; « Jeter », discret, est loin de lui', () => {
    useScanStore.setState({ brouillon: BROUILLON as never });
    const t = monter();
    const reprendre = bouton(t, 'Reprendre le plan en cours');
    const jeter = bouton(t, 'Jeter le plan en cours');
    expect(reprendre).toBeDefined();
    expect(jeter).toBeDefined();
    const fond = (n: TestRenderer.ReactTestInstance) => {
      const st = typeof n.props.style === 'function' ? n.props.style({ pressed: false }) : n.props.style;
      return (StyleSheet.flatten(st) as { backgroundColor?: string } | undefined)?.backgroundColor;
    };
    expect(fond(reprendre)).toBeDefined();
    expect(fond(jeter)).toBeUndefined();
    // Plus côte à côte dans la même pile : « Jeter » vit avec le texte, à
    // gauche ; « Reprendre », seul, à droite.
    const parents = (n: TestRenderer.ReactTestInstance) => {
      const out: TestRenderer.ReactTestInstance[] = [];
      for (let p = n.parent; p; p = p.parent) out.push(p);
      return out;
    };
    const carte = parents(jeter).find((p) => parents(reprendre).includes(p))!;
    const jusquA = (n: TestRenderer.ReactTestInstance) => parents(n).slice(0, parents(n).indexOf(carte));
    const avecLeTitre = (n: TestRenderer.ReactTestInstance) =>
      n.findAll((x) => x.type === Text && x.props.children === 'Plan en cours').length > 0;
    expect(jusquA(jeter).some(avecLeTitre)).toBe(true);
    expect(jusquA(reprendre).some(avecLeTitre)).toBe(false);
  });

  it('« Jeter » se confirme, et ne jette rien avant', () => {
    useScanStore.setState({ brouillon: BROUILLON as never });
    const t = monter();
    act(() => bouton(t, 'Jeter le plan en cours').props.onPress());
    const a = useAlerte.getState().courante;
    expect(a?.titre).toBe('Jeter le plan en cours ?');
    expect(useScanStore.getState().brouillon).not.toBeNull();
    act(() => a?.actions?.find((x) => x.danger)?.onPress?.());
    expect(useScanStore.getState().brouillon).toBeNull();
  });
});

describe('la bibliothèque compte des plans', () => {
  it('ni « Mes scans », ni « 3 scans rangés ici »', () => {
    const src = lire('src/screens/LibraryScreen.tsx');
    expect(src).not.toMatch(/['`>]Mes scans/);
    expect(src).not.toMatch(/\} scan\$\{/);
    expect(src).toContain("'Mes plans'");
  });
});

describe('les quatre tuiles restent symétriques', () => {
  it('les sous-titres tiennent sur une ligne (le violet dépassait)', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/screens/HomeScreen.tsx'), 'utf8') as string;
    const sous = [...src.matchAll(/\bsous="([^"]+)"/g)].map((m) => m[1]);
    expect(sous).toContain('Un T2 de 46 m²');
    // Pas plus long que le plus long des autres (« Avec vos mesures ») : une ligne.
    for (const x of sous) expect(x.length).toBeLessThanOrEqual(18);
  });
});
