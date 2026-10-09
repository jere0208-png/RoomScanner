/**
 * LES NOTIFICATIONS — la boîte des messages de l'éditeur.
 *
 * Relevé du patron : « un vrai système comme les autres apps : une sorte de
 * mail intra app ; suppression de la notif, pastille avec le nombre de non
 * lues ». Ce banc tient la chaîne entière :
 *
 *   — ce qui arrive du serveur est LU COMME UNE DONNÉE : vérifié, borné, et
 *     écarté s'il ne tient pas debout ;
 *   — ce que l'utilisateur en fait (lire, supprimer) lui appartient et
 *     survit à la synchronisation suivante ;
 *   — l'écran : la liste rangée par jour, le point bleu, « Tout lire »,
 *     le message ouvert en entier, la suppression et son « Annuler » ;
 *   — la page d'envoi du patron : protégée, et elle écrit ce que l'app lit.
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { lireMessage, lireMessages, type Message } from '../src/net/messages';
import { MESSAGES_EMBARQUES } from '../src/data/nouveautes';
import { messagesVisibles, nombreNonLus, useNotifications } from '../src/store/notifications';
import { NotificationsScreen, heureCourte, rayonDe } from '../src/screens/NotificationsScreen';
import { useScanStore } from '../src/store/scanStore';
import { SERVEUR } from '../src/config/serveur';

const brut = (x: Partial<Record<string, unknown>> = {}) => ({
  id: 'm1',
  date: '2026-10-09T10:00:00Z',
  titre: 'Nouveau',
  texte: 'Bonjour.',
  genre: 'nouveaute',
  ...x,
});

const reponse = (corps: unknown, ok = true) => ({ ok, json: async () => corps });

beforeEach(() => {
  mockDisque.clear();
  useNotifications.setState({ charge: true, recus: [], lus: [], supprimes: [], enCours: false });
});

describe('ce qui arrive du serveur', () => {
  it('un message complet est lu tel quel', () => {
    const m = lireMessage(brut())!;
    expect(m.id).toBe('m1');
    expect(m.date).toBe(Date.parse('2026-10-09T10:00:00Z'));
    expect(m.genre).toBe('nouveaute');
  });

  it('sans titre, sans texte, sans date lisible : écarté', () => {
    expect(lireMessage(brut({ titre: '' }))).toBeNull();
    expect(lireMessage(brut({ texte: 42 }))).toBeNull();
    expect(lireMessage(brut({ date: 'hier' }))).toBeNull();
    expect(lireMessage('message')).toBeNull();
  });

  it('un genre inconnu devient une information ; les champs sont bornés', () => {
    const m = lireMessage(brut({ genre: 'pirate', titre: 'x'.repeat(500) }))!;
    expect(m.genre).toBe('info');
    expect(m.titre.length).toBe(120);
  });

  it('un bouton n’ouvre qu’un écran connu, ou une adresse en https', () => {
    expect(lireMessage(brut({ action: { libelle: 'Voir', ecran: 'pro' } }))!.action).toEqual({ libelle: 'Voir', ecran: 'pro' });
    expect(lireMessage(brut({ action: { libelle: 'Voir', url: 'https://bourseur.fr' } }))!.action).toEqual({
      libelle: 'Voir',
      url: 'https://bourseur.fr',
    });
    expect(lireMessage(brut({ action: { libelle: 'Voir', url: 'http://bourseur.fr' } }))!.action).toBeUndefined();
    expect(lireMessage(brut({ action: { libelle: 'Voir', url: 'javascript:alert(1)' } }))!.action).toBeUndefined();
    expect(lireMessage(brut({ action: { libelle: 'Voir', ecran: 'reglages-secrets' } }))!.action).toBeUndefined();
  });

  it('le fichier entier : la forme de la page d’envoi, ou une liste nue ; sans doublon', () => {
    expect(lireMessages({ version: 1, messages: [brut(), brut(), brut({ id: 'm2' })] })!.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(lireMessages([brut()])).toHaveLength(1);
    expect(lireMessages({ autre: true })).toBeNull();
  });

  it('le fichier du dépôt se lit, et il est vide au départ', () => {
    const fichier = JSON.parse(readFileSync(join(__dirname, '..', 'server', 'messages.json'), 'utf8'));
    expect(lireMessages(fichier)).toEqual([]);
  });
});

describe('la boîte', () => {
  /* Les bancs tournent en mode local ; ceux qui synchronisent posent leur serveur. */
  const urlAvant = SERVEUR.url;
  beforeEach(() => {
    SERVEUR.url = 'https://serveur.test';
  });
  afterEach(() => {
    SERVEUR.url = urlAvant;
  });
  const recu: Message = { id: 'r1', date: Date.UTC(2026, 9, 9), titre: 'Annonce', texte: 'Texte.', genre: 'info' };

  it('mêle les messages reçus et embarqués, du plus récent au plus ancien', () => {
    const v = messagesVisibles({ recus: [recu], supprimes: [] });
    expect(v.map((m) => m.id)).toEqual(expect.arrayContaining(['r1', ...MESSAGES_EMBARQUES.map((m) => m.id)]));
    for (let i = 1; i < v.length; i++) expect(v[i - 1].date).toBeGreaterThanOrEqual(v[i].date);
  });

  it('la pastille compte les non lus ; une suppression compte comme lue', () => {
    useNotifications.setState({ recus: [recu] });
    const tous = MESSAGES_EMBARQUES.length + 1;
    expect(nombreNonLus(useNotifications.getState())).toBe(tous);
    useNotifications.getState().marquerLu('r1');
    expect(nombreNonLus(useNotifications.getState())).toBe(tous - 1);
    useNotifications.getState().supprimer(MESSAGES_EMBARQUES[0].id);
    expect(nombreNonLus(useNotifications.getState())).toBe(tous - 2);
    useNotifications.getState().toutLire();
    expect(nombreNonLus(useNotifications.getState())).toBe(0);
  });

  it('une suppression s’annule', () => {
    useNotifications.getState().supprimer('bienvenue');
    expect(messagesVisibles(useNotifications.getState()).some((m) => m.id === 'bienvenue')).toBe(false);
    useNotifications.getState().restaurer('bienvenue');
    expect(messagesVisibles(useNotifications.getState()).some((m) => m.id === 'bienvenue')).toBe(true);
  });

  it('ce qu’on a lu et supprimé survit au redémarrage', async () => {
    useNotifications.getState().marquerLu('bienvenue');
    useNotifications.getState().supprimer('version-2026-10');
    await Promise.resolve();
    useNotifications.setState({ charge: false, lus: [], supprimes: [] });
    await useNotifications.getState().charger();
    expect(useNotifications.getState().lus).toContain('bienvenue');
    expect(useNotifications.getState().supprimes).toContain('version-2026-10');
  });

  it('se synchronise : les reçus arrivent, et un silence du serveur ne vide rien', async () => {
    const avant = global.fetch;
    global.fetch = jest.fn(async () => reponse({ messages: [brut({ id: 'serveur-1' })] })) as never;
    await useNotifications.getState().rafraichir();
    expect(useNotifications.getState().recus.map((m) => m.id)).toEqual(['serveur-1']);
    global.fetch = jest.fn(async () => {
      throw new Error('hors ligne');
    }) as never;
    await useNotifications.getState().rafraichir();
    expect(useNotifications.getState().recus.map((m) => m.id)).toEqual(['serveur-1']);
    global.fetch = avant;
  });

  it('un message retiré par l’éditeur emporte avec lui son état lu — les listes ne grossissent pas', async () => {
    useNotifications.setState({ recus: [recu], lus: ['r1', 'bienvenue'], supprimes: ['r1'] });
    const avant = global.fetch;
    global.fetch = jest.fn(async () => reponse({ messages: [] })) as never;
    await useNotifications.getState().rafraichir();
    expect(useNotifications.getState().lus).toEqual(['bienvenue']);
    expect(useNotifications.getState().supprimes).toEqual([]);
    global.fetch = avant;
  });
});

describe('l’heure et le jour', () => {
  const maintenant = new Date(2026, 9, 9, 18).getTime();
  it('dit l’heure courte de la liste', () => {
    expect(heureCourte(maintenant - 30 * 1000, maintenant)).toBe('maintenant');
    expect(heureCourte(maintenant - 5 * 60000, maintenant)).toBe('5 min');
    expect(heureCourte(maintenant - 3 * 3600000, maintenant)).toBe('3 h');
    expect(heureCourte(maintenant - 30 * 3600000, maintenant)).toBe('hier');
    expect(heureCourte(maintenant - 4 * 86400000, maintenant)).toBe('4 j');
  });
  it('range par jour : aujourd’hui, cette semaine, plus tôt', () => {
    expect(rayonDe(maintenant - 3600000, maintenant)).toBe('Aujourd’hui');
    expect(rayonDe(maintenant - 2 * 86400000, maintenant)).toBe('Cette semaine');
    expect(rayonDe(maintenant - 20 * 86400000, maintenant)).toBe('Plus tôt');
  });
});

describe('l’écran', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });
  const avant = global.fetch;
  beforeEach(() => {
    // L'écran se synchronise en s'ouvrant : le serveur ne répond rien ici.
    global.fetch = jest.fn(async () => reponse(null, false)) as never;
    useScanStore.setState({ screen: 'notifications' });
  });
  afterAll(() => {
    global.fetch = avant;
  });

  const monter = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<NotificationsScreen />);
    });
    arbre = t;
    return t;
  };
  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Text)
      .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)))
      .join(' | ');
  const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAll((n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === label)[0];
  const attendre = (ms = 600) =>
    act(() => {
      jest.advanceTimersByTime(ms);
    });

  it('montre les messages, le point bleu de ce qui n’est pas lu, et « Tout lire »', () => {
    useNotifications.setState({ lus: ['bienvenue'] });
    const t = monter();
    const vu = textes(t);
    expect(vu).toContain('Bienvenue sur EchoPlan');
    expect(t.root.findAll((n) => n.props?.testID === 'non-lu-version-2026-10').length).toBeGreaterThan(0);
    expect(t.root.findAll((n) => n.props?.testID === 'non-lu-bienvenue')).toHaveLength(0);
    act(() => bouton(t, 'Tout marquer comme lu').props.onPress());
    expect(nombreNonLus(useNotifications.getState())).toBe(0);
    expect(bouton(t, 'Tout marquer comme lu')).toBeUndefined();
  });

  it('un appui ouvre le message en entier, et le marque lu', () => {
    const t = monter();
    act(() => bouton(t, 'Non lue, Bienvenue sur EchoPlan').props.onPress());
    attendre();
    expect(useNotifications.getState().lus).toContain('bienvenue');
    expect(textes(t)).toContain('balayez-la vers la gauche pour la supprimer');
  });

  it('le bouton du message mène où il dit', () => {
    const t = monter();
    act(() => bouton(t, 'Non lue, Bienvenue sur EchoPlan').props.onPress());
    attendre();
    const action = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && n.props?.label === 'Visiter l’appartement exemple',
    )[0];
    act(() => action.props.onPress());
    attendre();
    expect(useScanStore.getState().screen).toBe('result');
  });

  it('se supprime d’un geste — et « Annuler » la rend', () => {
    const t = monter();
    act(() => bouton(t, 'Supprimer Bienvenue sur EchoPlan').props.onPress());
    attendre();
    expect(useNotifications.getState().supprimes).toContain('bienvenue');
    expect(textes(t)).toContain('Notification supprimée');
    act(() => bouton(t, 'Annuler la suppression').props.onPress());
    expect(useNotifications.getState().supprimes).not.toContain('bienvenue');
    expect(textes(t)).toContain('Bienvenue sur EchoPlan');
  });

  /*
    LE BOUTON EST AU BORD DROIT — relevé du patron : « si on s'arrête en
    cours de glissé, un bloc rouge sans texte s'affiche ». Il était rangé à
    gauche, sous la ligne, par un étirement qui l'emportait sur
    l'alignement : la part rouge découverte à droite restait vide.
  */
  it('la corbeille se découvre à droite, avec son mot', () => {
    const t = monter();
    const b = bouton(t, 'Supprimer Bienvenue sur EchoPlan');
    const derriere = b.parent!;
    const st = StyleSheet.flatten(derriere.props.style) as { flexDirection?: string; justifyContent?: string };
    expect(st.flexDirection).toBe('row');
    expect(st.justifyContent).toBe('flex-end');
    expect((StyleSheet.flatten(b.props.style) as { alignSelf?: string }).alignSelf).toBeUndefined();
    const mots = b.findAll((n) => n.props?.children === 'Supprimer');
    expect(mots.length).toBeGreaterThan(0);
  });

  it('se supprime aussi depuis le message ouvert', () => {
    const t = monter();
    act(() => bouton(t, 'Non lue, Bienvenue sur EchoPlan').props.onPress());
    attendre();
    act(() => bouton(t, 'Supprimer la notification').props.onPress());
    attendre();
    expect(useNotifications.getState().supprimes).toContain('bienvenue');
  });

  it('« Non lues » filtre, et dit quand tout est lu', () => {
    useNotifications.setState({ lus: MESSAGES_EMBARQUES.map((m) => m.id) });
    const t = monter();
    act(() => bouton(t, 'Notifications non lues').props.onPress());
    expect(textes(t)).toContain('Tout est lu');
  });

  it('vide, elle le dit avec des mots', () => {
    useNotifications.setState({ supprimes: MESSAGES_EMBARQUES.map((m) => m.id) });
    const t = monter();
    expect(textes(t)).toContain('Aucune notification');
  });

  it('le retour ramène à l’accueil', () => {
    const t = monter();
    act(() => bouton(t, 'Retour').props.onPress());
    expect(useScanStore.getState().screen).toBe('home');
  });
});

describe('la page d’envoi du patron', () => {
  const page = readFileSync(join(__dirname, '..', 'server', 'echoplan-messages.php'), 'utf8');

  it('est protégée : mot de passe en temps constant, jeton anti-CSRF, sortie échappée', () => {
    expect(page).toContain("hash_equals(MESSAGES_MDP");
    expect(page).toContain("hash_equals(jeton_csrf()");
    expect(page).toContain('htmlspecialchars');
    expect(page).toContain("'samesite' => 'Strict'");
    // Le mot de passe ne vit pas dans le dépôt.
    expect(readFileSync(join(__dirname, '..', '.gitignore'), 'utf8')).toContain('server/messages-cle.php');
  });

  it('écrit sous verrou, par un fichier renommé : l’app ne lit jamais un JSON à moitié', () => {
    expect(page).toContain('flock($verrou, LOCK_EX)');
    expect(page).toContain('rename($tmp, FICHIER)');
  });

  it('écrit la forme que l’app lit : mêmes genres, mêmes écrans, mêmes bornes', () => {
    for (const g of ['nouveaute', 'astuce', 'info', 'offre']) expect(page).toContain(`'${g}' =>`);
    for (const e of ['pro', 'exemple', 'bibliotheque', 'profil']) expect(page).toContain(`'${e}' =>`);
    expect(page).toContain("champ('titre', 120)");
    expect(page).toContain("champ('texte', 4000)");
    expect(page).toContain('#^https://');
  });
});
