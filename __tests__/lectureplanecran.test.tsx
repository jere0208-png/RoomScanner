/**
 * LIRE UN PLAN PAPIER — la page, de l'invitation au plan créé.
 *
 * Relevé du patron : « une lecture de plan papier à la place de "Comment ça
 * marche" dans l'accueil. On ouvre une page photo avec les détails qui
 * demandent à scanner un plan papier de manière moderne. Si la vision
 * détecte le plan, il le scanne, et crée à partir de celui-ci un plan 2D. Le
 * système doit être fiable et facilement utilisable. »
 *
 * Le scanner (natif) et le serveur (l'IA) sont simulés : ce banc tient le
 * PARCOURS — ce que l'utilisateur voit, ce qu'il touche, ce qui se crée — et
 * les portes quand ça bloque (le compte, le Pro).
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: { isSupported: jest.fn(async () => true) },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
const mockScanner = jest.fn();
const mockEnvoyer = jest.fn();
jest.mock('../src/native/lecturePlan', () => ({
  scannerUnPlan: () => mockScanner(),
  importerUnPlan: () => mockScanner(),
  scannerDisponible: async () => true,
}));
jest.mock('../src/net/lecturePlan', () => ({
  envoyerLePlan: (...a: unknown[]) => mockEnvoyer(...a),
  DELAI_DE_LECTURE: 150000,
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LecturePlanScreen } from '../src/screens/LecturePlanScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ProfilScreen } from '../src/screens/ProfilScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { usePremieresFois } from '../src/store/premieresFois';
import type { LectureBrute, PointLu } from '../src/geometry/lecturePlan';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

/* Un deux-pièces de 8 × 5 m, photographié à 100 pixels par mètre. */
const PAGE = { base64: 'x'.repeat(2000), largeur: 1000, hauteur: 700, textes: [] };
const vers = (x: number, z: number): PointLu => [((100 + 100 * x) / 1000) * 1000, ((100 + 100 * z) / 700) * 1000];
const ep = (m: number) => ((m * 100) / 1000) * 1000;
const LECTURE: LectureBrute = {
  est_un_plan: true,
  murs: [
    [...vers(0, 0), ...vers(8, 0), ep(0.2)],
    [...vers(8, 0), ...vers(8, 5), ep(0.2)],
    [...vers(8, 5), ...vers(0, 5), ep(0.2)],
    [...vers(0, 5), ...vers(0, 0), ep(0.2)],
    [...vers(4.5, 0), ...vers(4.5, 5), ep(0.1)],
  ],
  ouvertures: [{ type: 'porte', a: vers(4.5, 3), b: vers(4.5, 3.83) }],
  cotes: [
    { texte: '8,20', a: vers(-0.1, -0.6), b: vers(8.1, -0.6), reference: 'exterieur' },
    { texte: '5,20', a: vers(-0.6, -0.1), b: vers(-0.6, 5.1), reference: 'exterieur' },
    { texte: '450', a: vers(0, -0.3), b: vers(4.5, -0.3), reference: 'axes' },
    { texte: '350', a: vers(4.5, -0.3), b: vers(8, -0.3), reference: 'axes' },
    { texte: '4,35', a: vers(0.1, 1), b: vers(4.45, 1), reference: 'interieur' },
    { texte: '3,35', a: vers(4.55, 1), b: vers(7.9, 1), reference: 'interieur' },
    { texte: '4,80', a: vers(2, 0.1), b: vers(2, 4.9), reference: 'interieur' },
  ],
  pieces: [
    { nom: 'SÉJOUR', point: vers(2.2, 2.5), surface: '20,9 m²' },
    { nom: 'Chambre', point: vers(6.2, 2.5) },
  ],
  symboles: [
    { libelle: 'socket', point: vers(0.25, 2) },
    { libelle: 'point lumineux', code: 'DCL', point: vers(2.2, 2.5), plafond: true },
    { libelle: 'interrupteur', code: 'S', point: vers(4.25, 1) },
  ],
  liens: [[2, 1]],
};

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children).join(''))
    .join(' | ');
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];

async function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    t = TestRenderer.create(<LecturePlanScreen />);
  });
  return t;
}

beforeEach(() => {
  mockScanner.mockReset();
  mockEnvoyer.mockReset();
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({ screen: 'lecture', forcerTarifs: false } as never);
    useAccountStore.setState({ compte: { id: 'email:a@b.fr', prenom: 'A' } as never, jeton: 'j', pro: false, proVia: null, invite: false } as never);
  });
});

describe('l’accueil y mène', () => {
  it('« Lire un plan papier » a pris la place de « Comment ça marche »', () => {
    act(() => useScanStore.setState({ screen: 'home' } as never));
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<HomeScreen />);
    });
    expect(bouton(t, 'Comment ça marche')).toBeUndefined();
    act(() => bouton(t, 'Lire un plan papier').props.onPress());
    expect(useScanStore.getState().screen).toBe('lecture');
    act(() => t.unmount());
  });

  it('et le film se revoit depuis le profil', () => {
    act(() => usePremieresFois.setState({ charge: true, vues: ['accueil', 'allumer'] } as never));
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ProfilScreen />);
    });
    act(() => bouton(t, 'Revoir la présentation').props.onPress());
    expect(usePremieresFois.getState().vues).toEqual(['allumer']);
    expect(useScanStore.getState().screen).toBe('home');
    act(() => t.unmount());
  });
});

describe('la page', () => {
  it('invite : ce qu’il faut pour une bonne lecture, et deux portes', async () => {
    const t = await monter();
    const vu = textes(t);
    for (const mot of ['Bien éclairé', 'La feuille entière', 'Les cotes lisibles', 'Les symboles aussi']) {
      expect(vu).toContain(mot);
    }
    expect(bouton(t, 'Scanner le plan')).toBeDefined();
    expect(bouton(t, 'Importer une photo')).toBeDefined();
    expect(vu).toMatch(/Une lecture offerte pour essayer, puis réservée au Pro/);
    act(() => t.unmount());
  });

  it('renoncer au scanner ramène à l’invitation, sans rien envoyer', async () => {
    mockScanner.mockResolvedValue(null);
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    expect(mockEnvoyer).not.toHaveBeenCalled();
    expect(bouton(t, 'Scanner le plan')).toBeDefined();
    act(() => t.unmount());
  });

  it('scanne, lit, montre ce qu’il a lu — puis crée le plan d’un appui', async () => {
    mockScanner.mockResolvedValue(PAGE);
    let finir!: (v: unknown) => void;
    mockEnvoyer.mockReturnValue(new Promise((r) => (finir = r)));
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    // Pendant la lecture : la page, et les étapes.
    expect(t.root.findAll((n) => n.props?.testID === 'lecture-en-cours').length).toBeGreaterThan(0);
    expect(textes(t)).toContain('Lecture du plan par l’IA');
    // Le compte part avec la page, et l'abonnement s'il y en a un.
    expect(mockEnvoyer.mock.calls[0][1]).toEqual({ identifiant: 'email:a@b.fr', jeton: 'j' });
    expect(mockEnvoyer.mock.calls[0][2]).toBe(false);
    await act(async () => finir({ ok: true, lecture: LECTURE, essai: true }));

    // Ce qu'on a lu : le plan dessiné, son bilan, sa confiance.
    expect(t.root.findAll((n) => n.props?.testID === 'apercu-plan-lu').length).toBeGreaterThan(0);
    const vu = textes(t);
    expect(vu).toContain('Lecture sûre');
    expect(vu).toMatch(/2 pièces/);
    expect(vu).toMatch(/cotes lues tiennent le plan/);
    expect(vu).toContain('socket → Prise 16 A');
    expect(vu).toMatch(/C’était votre lecture d’essai/);

    // Rien n'est créé tant qu'on n'a pas dit oui.
    expect(useScanStore.getState().walls).toHaveLength(0);
    act(() => bouton(t, 'Créer le plan').props.onPress());
    const st = useScanStore.getState();
    expect(st.screen).toBe('result');
    expect(st.dirty).toBe(true);
    expect(st.scanName).toMatch(/^Plan lu le /);
    expect(st.rooms.map((r) => r.name).sort()).toEqual(['Chambre', 'Séjour']);
    expect(st.fixtures.map((f) => f.kind).sort()).toEqual(['inter', 'prise']);
    expect(st.ceiling.map((c) => c.kind)).toEqual(['dcl']);
    // L'interrupteur commande le point lumineux, comme le trait le disait.
    expect(st.ceiling[0].commands).toEqual([st.fixtures.find((f) => f.kind === 'inter')!.id]);
    expect(st.openings.map((o) => o.type)).toEqual(['door']);
    // Les mesures : le refend à 4,50 m d'axe, la façade à 8 m.
    const xs = [...new Set(st.walls.filter((w) => w.a.x === w.b.x).map((w) => w.a.x))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 4.5, 8]);
    act(() => t.unmount());
  });

  it('l’essai utilisé : la porte du Pro', async () => {
    mockScanner.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValue({ ok: false, motif: 'pro', message: 'Votre lecture d’essai est utilisée.' });
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    expect(textes(t)).toContain('Réservé au Pro');
    act(() => bouton(t, 'Passer au Pro').props.onPress());
    expect(useScanStore.getState().forcerTarifs).toBe(true);
    act(() => t.unmount());
  });

  it('sans compte : la porte de la connexion', async () => {
    act(() => useAccountStore.setState({ compte: null, jeton: null, invite: true } as never));
    mockScanner.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValue({ ok: false, motif: 'compte', message: 'Connectez-vous.' });
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    expect(mockEnvoyer.mock.calls[0][1]).toBeNull();
    act(() => bouton(t, 'Me connecter').props.onPress());
    expect(useAccountStore.getState().invite).toBe(false);
    act(() => t.unmount());
  });

  it('une photo qui n’est pas un plan le dit, et se reprend', async () => {
    mockScanner.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValue({ ok: true, lecture: { est_un_plan: false, raison: 'La photo est floue.' }, essai: true });
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    expect(textes(t)).toContain('La photo est floue.');
    act(() => bouton(t, 'Reprendre une photo').props.onPress());
    expect(bouton(t, 'Scanner le plan')).toBeDefined();
    act(() => t.unmount());
  });

  it('le réseau tombe : on réessaie la même page, sans la reprendre', async () => {
    mockScanner.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValueOnce({ ok: false, motif: 'reseau', message: 'La lecture n’a pas abouti.' });
    mockEnvoyer.mockResolvedValueOnce({ ok: true, lecture: LECTURE, essai: false });
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    await act(async () => bouton(t, 'Réessayer').props.onPress());
    expect(mockScanner).toHaveBeenCalledTimes(1);
    expect(mockEnvoyer).toHaveBeenCalledTimes(2);
    expect(bouton(t, 'Créer le plan')).toBeDefined();
    act(() => t.unmount());
  });
});

describe('ce qui la porte', () => {
  it('le serveur : l’action, l’essai, le plafond, la clé hors de l’app', () => {
    const api = lire('server', 'api.php');
    expect(api).toContain("$action === 'lire_plan'");
    expect(api).toContain("'raison' => 'pro'");
    expect(api).toContain('LECTURES_PAR_JOUR');
    const lecteur = lire('server', 'lecture-plan.php');
    expect(lecteur).toContain("'tool_choice' => ['type' => 'tool', 'name' => 'plan_lu']");
    expect(lecteur).toContain("'x-api-key: ' . ANTHROPIC_CLE");
    expect(lecteur).not.toMatch(/sk-ant-/);
    expect(lire('server', 'config-echoplan.exemple.php')).toContain("const ANTHROPIC_CLE = 'À_REMPLIR';");
    expect(lire('server', 'migration-lecture.sql')).toMatch(/ADD COLUMN lectures INT/);
    expect(lire('server', 'schema.sql')).toMatch(/lectures INT NOT NULL DEFAULT 0/);
    // La clé n'est nulle part dans l'app.
    expect(lire('src', 'net', 'lecturePlan.ts')).not.toMatch(/anthropic\.com|x-api-key/);
  });

  it('le natif : le scanner de documents d’iOS, et les textes lus sur le téléphone', () => {
    const swift = lire('modules', 'react-native-room-scan', 'ios', 'RoomScanLecturePlan.swift');
    expect(swift).toContain('VNDocumentCameraViewController()');
    expect(swift).toContain('VNRecognizeTextRequest()');
    expect(swift).toContain('requete.usesLanguageCorrection = false');
    expect(lire('modules', 'react-native-room-scan', 'ios', 'RoomScan.m')).toContain('RCT_EXTERN_MODULE(RoomScanLecturePlan, NSObject)');
    expect(lire('modules', 'react-native-room-scan', 'RoomScan.podspec')).toContain('"VisionKit"');
  });

  it('la confidentialité le dit', () => {
    const page = lire('src', 'screens', 'ConfidentialiteScreen.tsx');
    expect(page).toContain('La lecture d’un plan papier, et elle seule');
    expect(page).toContain('Claude, d’Anthropic');
  });
});
