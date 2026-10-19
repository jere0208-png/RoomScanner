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
const mockFichier = jest.fn();
const mockPageDuPdf = jest.fn();
jest.mock('../src/native/lecturePlan', () => ({
  scannerUnPlan: () => mockScanner(),
  importerUnPlan: () => mockScanner(),
  ouvrirUnFichier: () => mockFichier(),
  pageDuPdf: (n: number) => mockPageDuPdf(n),
  scannerDisponible: async () => true,
}));
jest.mock('../src/net/lecturePlan', () => ({
  envoyerLePlan: (...a: unknown[]) => mockEnvoyer(...a),
  DELAI_DE_LECTURE: 200000,
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Modal, ScrollView, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LecturePlanScreen } from '../src/screens/LecturePlanScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ProfilScreen } from '../src/screens/ProfilScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
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
  mockFichier.mockReset();
  mockPageDuPdf.mockReset();
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

  it('et le profil ne propose plus de présentation (il n’y en a plus)', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ProfilScreen />);
    });
    expect(bouton(t, 'Revoir la présentation')).toBeUndefined();
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
    // Et la troisième : le plan reçu en fichier.
    expect(bouton(t, 'Ouvrir un fichier')).toBeDefined();
    expect(vu).toMatch(/PDF/);
    expect(vu).toMatch(/Une lecture offerte pour essayer, puis réservée au Pro/);
    act(() => t.unmount());
  });

  it('la page ne défile plus : tout tient dans l’écran, le visuel avant le texte', async () => {
    // Relevé du patron : « fais une refonte de la page (…) sans scroll. »
    const t = await monter();
    expect(t.root.findAllByType(ScrollView)).toHaveLength(0);
    // Les quatre conseils se disent en deux mots, le détail reste à la lecture d'écran.
    expect(t.root.findAll((n) => n.props?.accessibilityLabel === 'Bien éclairé : Sans reflet ni ombre portée : près d’une fenêtre, flash éteint.').length).toBeGreaterThan(0);
    expect(textes(t)).not.toMatch(/Sans reflet ni ombre portée/);
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
    // Le compte part avec la page ; la preuve d'abonnement seulement si le
    // téléphone en tient une (ici, aucun module StoreKit : pas de preuve).
    expect(mockEnvoyer.mock.calls[0][1]).toEqual({ identifiant: 'email:a@b.fr', jeton: 'j' });
    expect(mockEnvoyer.mock.calls[0][2]).toBeNull();
    await act(async () => finir({ ok: true, lecture: LECTURE, essai: true }));

    // Ce qu'on a lu : le plan dessiné, son bilan, sa confiance.
    expect(t.root.findAll((n) => n.props?.testID === 'apercu-plan-lu').length).toBeGreaterThan(0);
    const vu = textes(t);
    expect(vu).toContain('Lecture sûre');
    // Les chiffres du plan lu sont des tuiles : « 2 », et « pièces » dessous.
    expect(t.root.findAll((n) => n.props?.accessibilityLabel === '2 pièces').length).toBeGreaterThan(0);
    expect(vu).toMatch(/cotes lues tiennent le plan/);
    expect(vu).toContain('socket → Prise 16 A');
    expect(vu).toMatch(/C’était votre lecture d’essai/);

    // Le plan lu tient l'écran : le détail des mesures et des symboles n'a
    // sa liste qui défile que dans sa feuille, ouverte d'un appui.
    const horsDesFeuilles = t.root
      .findAllByType(ScrollView)
      .filter((sv) => {
        let n: typeof sv | null = sv.parent;
        while (n && n.type !== Modal) n = n.parent;
        return !n;
      });
    expect(horsDesFeuilles).toHaveLength(0);
    expect(bouton(t, 'Le détail de la lecture')).toBeDefined();

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

  it('un appui long sur la confiance partage la lecture brute de l’IA — le diagnostic', async () => {
    const { Share } = jest.requireActual('react-native') as typeof import('react-native');
    const partage = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    mockScanner.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValue({ ok: true, lecture: LECTURE, essai: false });
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    const confiance = t.root.findAll((n) => n.props?.testID === 'confiance-de-lecture' && typeof n.props?.onLongPress === 'function')[0];
    act(() => confiance.props.onLongPress());
    expect(partage).toHaveBeenCalledTimes(1);
    expect(String(partage.mock.calls[0][0].message)).toContain('"est_un_plan":true');
    partage.mockRestore();
    act(() => t.unmount());
  });

  it('l’essai utilisé : la porte du Pro', async () => {
    mockScanner.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValue({ ok: false, motif: 'pro', message: 'Votre lecture d’essai est utilisée.' });
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    expect(textes(t)).toContain('Réservé au Pro');
    act(() => bouton(t, 'Passer au Pro').props.onPress());
    // La page Pro s'ouvre (revues « Thomas », « Sophie ») : le drapeau des
    // tarifs du devis ne faisait rien bouger.
    expect(useAccountStore.getState().paywallVisible).toBe(true);
    act(() => useAccountStore.setState({ paywallVisible: false } as never));
    act(() => t.unmount());
  });

  it('sans compte : la porte de la connexion — AVANT de scanner, pas après', async () => {
    act(() => useAccountStore.setState({ compte: null, jeton: null, invite: true } as never));
    mockScanner.mockResolvedValue(PAGE);
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    // Pas de feuille prise pour rien.
    expect(mockScanner).not.toHaveBeenCalled();
    expect(mockEnvoyer).not.toHaveBeenCalled();
    expect(textes(t)).toContain('Un compte, d’abord');
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

/**
 * « UN COMPTE, D'ABORD » ALORS QU'ON EST CONNECTÉ — relevé du patron : « ils
 * me disent "Un compte, d'abord" et me proposent de me connecter, bouton qui
 * ne fait rien. Je suis pourtant connecté. »
 *
 * Le compte était là, sans jeton valide : la connexion s'était faite quand le
 * serveur ne répondait pas (l'app ouvre quand même, en local), ou le serveur
 * ne reconnaît plus le jeton. « Me connecter » quittait le mode invité — où
 * l'on n'était pas : il ne faisait rien. Seule une nouvelle connexion rend un
 * jeton : le bouton l'ouvre, et ramène ici.
 */
describe('connecté, mais sans jeton que le serveur reconnaisse', () => {
  it('connecté hors ligne : on le dit avant de scanner, et « Me reconnecter » ouvre la connexion', async () => {
    act(() => useAccountStore.setState({ compte: { id: 'email:a@b.fr', prenom: 'A' } as never, jeton: null, invite: false } as never));
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    expect(mockScanner).not.toHaveBeenCalled();
    const vu = textes(t);
    expect(vu).toContain('Reconnectez-vous');
    expect(vu).not.toContain('Un compte, d’abord');
    expect(bouton(t, 'Me connecter')).toBeUndefined();
    act(() => bouton(t, 'Me reconnecter').props.onPress());
    // La porte de connexion s'ouvre (plus de compte à l'écran), et l'app
    // reviendra sur la lecture : l'écran courant n'a pas bougé.
    expect(useAccountStore.getState().compte).toBeNull();
    expect(useAccountStore.getState().invite).toBe(false);
    expect(useScanStore.getState().screen).toBe('lecture');
    act(() => t.unmount());
  });

  it('le serveur ne reconnaît plus le jeton : on se reconnecte, et la page prise attend sa lecture', async () => {
    mockScanner.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValueOnce({ ok: false, motif: 'compte', message: 'Votre session a expiré : reconnectez-vous, puis recommencez.' });
    const t = await monter();
    await act(async () => bouton(t, 'Scanner le plan').props.onPress());
    expect(textes(t)).toContain('Reconnectez-vous');
    act(() => bouton(t, 'Me reconnecter').props.onPress());
    act(() => t.unmount());
    // … la connexion rend un jeton neuf, l'app revient sur la page …
    act(() => useAccountStore.setState({ compte: { id: 'email:a@b.fr', prenom: 'A' } as never, jeton: 'neuf', invite: false } as never));
    mockEnvoyer.mockResolvedValueOnce({ ok: true, lecture: LECTURE, essai: false });
    const t2 = await monter();
    // La même page, prête : on la lit sans rescanner.
    expect(t2.root.findAll((n) => n.props?.testID === 'apercu-du-fichier').length).toBeGreaterThan(0);
    await act(async () => bouton(t2, 'Lire ce plan').props.onPress());
    expect(mockScanner).toHaveBeenCalledTimes(1);
    expect(mockEnvoyer).toHaveBeenCalledTimes(2);
    expect(mockEnvoyer.mock.calls[1][0]).toBe(PAGE);
    expect(mockEnvoyer.mock.calls[1][1]).toEqual({ identifiant: 'email:a@b.fr', jeton: 'neuf' });
    expect(bouton(t2, 'Créer le plan')).toBeDefined();
    act(() => t2.unmount());
  });

  it('et la page n’attend qu’une fois : rouvrir l’écran plus tard repart de l’invitation', async () => {
    const t = await monter();
    expect(bouton(t, 'Scanner le plan')).toBeDefined();
    act(() => t.unmount());
  });
});

/**
 * UN FICHIER PLUTÔT QU'UNE PHOTO — relevé du patron : « on doit aussi
 * pouvoir lire un fichier PDF ou image au lieu de scanner le papier à
 * l'appareil photo ». Le plan d'un architecte arrive en PDF par courriel ;
 * l'imprimer pour le photographier, c'était perdre sa netteté.
 */
describe('un fichier plutôt qu’une photo', () => {
  it('une image : elle se lit tout de suite, comme une photo', async () => {
    mockFichier.mockResolvedValue(PAGE);
    mockEnvoyer.mockResolvedValue({ ok: true, lecture: LECTURE, essai: false });
    const t = await monter();
    await act(async () => bouton(t, 'Ouvrir un fichier').props.onPress());
    expect(mockEnvoyer).toHaveBeenCalledTimes(1);
    expect(mockEnvoyer.mock.calls[0][0]).toBe(PAGE);
    expect(bouton(t, 'Créer le plan')).toBeDefined();
    act(() => t.unmount());
  });

  it('un PDF d’une page : il se lit tout de suite aussi', async () => {
    mockFichier.mockResolvedValue({ ...PAGE, page: 1, pages: 1 });
    mockEnvoyer.mockResolvedValue({ ok: true, lecture: LECTURE, essai: false });
    const t = await monter();
    await act(async () => bouton(t, 'Ouvrir un fichier').props.onPress());
    expect(mockEnvoyer).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
  });

  it('un PDF de plusieurs pages : on voit la page retenue, on peut en changer, RIEN ne part avant « Lire »', async () => {
    // Le natif retient la page qui porte le plus de cotes : ici la 2e sur 5.
    mockFichier.mockResolvedValue({ ...PAGE, base64: 'p2'.repeat(1000), page: 2, pages: 5 });
    mockPageDuPdf.mockImplementation(async (n: number) => ({ ...PAGE, base64: `p${n}`.repeat(1000), page: n, pages: 5 }));
    mockEnvoyer.mockResolvedValue({ ok: true, lecture: LECTURE, essai: false });
    const t = await monter();
    await act(async () => bouton(t, 'Ouvrir un fichier').props.onPress());
    // Une lecture coûte : on ne la dépense pas sur la page de garde du dossier.
    expect(mockEnvoyer).not.toHaveBeenCalled();
    expect(t.root.findAll((n) => n.props?.testID === 'apercu-du-fichier').length).toBeGreaterThan(0);
    expect(textes(t)).toContain('Page 2 sur 5');
    await act(async () => bouton(t, 'Page suivante').props.onPress());
    expect(mockPageDuPdf).toHaveBeenCalledWith(3);
    expect(textes(t)).toContain('Page 3 sur 5');
    await act(async () => bouton(t, 'Page précédente').props.onPress());
    await act(async () => bouton(t, 'Page précédente').props.onPress());
    expect(mockPageDuPdf).toHaveBeenLastCalledWith(1);
    // À la première page, on ne recule plus.
    expect(bouton(t, 'Page précédente')).toBeUndefined();
    await act(async () => bouton(t, 'Lire cette page').props.onPress());
    expect(mockEnvoyer).toHaveBeenCalledTimes(1);
    expect(mockEnvoyer.mock.calls[0][0].base64).toBe('p1'.repeat(1000));
    expect(bouton(t, 'Créer le plan')).toBeDefined();
    act(() => t.unmount());
  });

  it('un PDF protégé par un mot de passe : dit en clair, sans rien envoyer', async () => {
    mockFichier.mockResolvedValue({ erreur: 'protege' });
    const t = await monter();
    await act(async () => bouton(t, 'Ouvrir un fichier').props.onPress());
    expect(mockEnvoyer).not.toHaveBeenCalled();
    expect(textes(t)).toContain('Ce fichier ne s’ouvre pas');
    expect(textes(t)).toMatch(/mot de passe/);
    act(() => bouton(t, 'Choisir un autre fichier').props.onPress());
    expect(bouton(t, 'Ouvrir un fichier')).toBeDefined();
    act(() => t.unmount());
  });

  it('un fichier qui n’est ni un PDF ni une image : dit en clair', async () => {
    mockFichier.mockResolvedValue({ erreur: 'format' });
    const t = await monter();
    await act(async () => bouton(t, 'Ouvrir un fichier').props.onPress());
    expect(mockEnvoyer).not.toHaveBeenCalled();
    expect(textes(t)).toMatch(/PDF ou une image/);
    act(() => t.unmount());
  });

  it('renoncer au sélecteur ramène à l’invitation', async () => {
    mockFichier.mockResolvedValue(null);
    const t = await monter();
    await act(async () => bouton(t, 'Ouvrir un fichier').props.onPress());
    expect(mockEnvoyer).not.toHaveBeenCalled();
    expect(bouton(t, 'Ouvrir un fichier')).toBeDefined();
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
    // Trois lectures ciblées, en parallèle : les murs et les ouvertures, les
    // pièces et les cotes, l'électricité (relevés du patron : « manque
    // beaucoup de murs », « ne repère pas les cloisons, pas de porte »).
    expect(lecteur).toContain("'name' => 'murs_lus'");
    expect(lecteur).toContain("'name' => 'pieces_lues'");
    expect(lecteur).toContain("'name' => 'electricite_lue'");
    expect(lecteur).toContain('function appelerEnParallele(');
    expect(lecteur).toContain("'tool_choice' => $impose ? ['type' => 'tool', 'name' => $l['outil']['name']] : ['type' => 'auto']");
    // La lecture rendue à l'app garde la forme qu'elle attend.
    expect(lecteur).toContain('function lectureAssemblee(');
    // La feuille et ses loupes quadrillées, à la définition que regarde le lecteur.
    expect(lecteur).toContain('function vuesDuPlan(');
    expect(lecteur).toContain('const VUE_PIXELS = 1150000;');
    expect(lecteur).toContain('QUADRILLAGE VIOLET');
    // Le contour de chaque pièce, et le cadre du plan principal.
    expect(lecteur).toContain("'contour' => ['type' => 'array', 'items' => $point, 'minItems' => 3]");
    expect(lecteur).toContain("'cadre' =>");
    expect(lecteur).toContain('UN SEUL PLAN.');
    expect(lecteur).toContain('SOIS EXHAUSTIF.');
    // La clé, débarrassée d'un espace ou d'un retour à la ligne collé avec.
    expect(lecteur).toContain("'x-api-key: ' . trim(ANTHROPIC_CLE)");
    // L'outil imposé refusé (code 400) : un second essai, le modèle choisit.
    expect(lecteur).toContain('function refusDeLOutilImpose(');
    // Et le texte de l'API se lit dans l'app, pour corriger à coup sûr.
    expect(lecteur).toContain("mb_substr($message, 0, 220)");
    expect(lecteur).not.toMatch(/sk-ant-/);
    // Un refus de l'API dit SA cause : crédit, clé, modèle, image (relevé du
    // patron : « il la refuse directement », sans dire pourquoi).
    expect(lecteur).toContain('function raisonDuRefus(');
    expect(lecteur).toContain("stripos($message, 'credit balance')");
    expect(lecteur).toContain('vérifiez ANTHROPIC_CLE');
    expect(lecteur).toContain("error_log('EchoPlan lecture-plan : HTTP '");
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

  it('le natif : le sélecteur de fichiers d’iOS, et le PDF rendu à haute définition', () => {
    const swift = lire('modules', 'react-native-room-scan', 'ios', 'RoomScanLecturePlan.swift');
    expect(swift).toContain('UIDocumentPickerViewController(forOpeningContentTypes: [.pdf, .image], asCopy: true)');
    // Lu en mémoire : la copie du sélecteur est effacée aussitôt.
    expect(swift).toContain('PDFDocument(data: donnees)');
    expect(swift).toContain('try? FileManager.default.removeItem(at: url)');
    expect(swift).toContain('doc.isLocked');
    // La page retenue : celle qui porte le plus de cotes.
    expect(swift).toContain('static func meilleurePage(');
    const m = lire('modules', 'react-native-room-scan', 'ios', 'RoomScan.m');
    expect(m).toContain('RCT_EXTERN_METHOD(ouvrirUnFichier:');
    expect(m).toContain('RCT_EXTERN_METHOD(pageDuPdf:');
    expect(lire('modules', 'react-native-room-scan', 'RoomScan.podspec')).toContain('"PDFKit"');
  });

  it('la confidentialité le dit', () => {
    const page = lire('src', 'screens', 'ConfidentialiteScreen.tsx');
    expect(page).toContain('La lecture d’un plan papier, et elle seule');
    expect(page).toContain('Claude, d’Anthropic');
  });
});
