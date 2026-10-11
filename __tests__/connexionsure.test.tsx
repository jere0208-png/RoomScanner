/**
 * PERSONNE NE SE CONNECTE AU COMPTE D'UN AUTRE.
 *
 * Constat de l'audit : le serveur délivrait un jeton à n'importe quel
 * identifiant — « email:quelquun@exemple.fr », « apple:… », « google:… » —
 * sans la moindre preuve. Le jeton ouvrait la liste et le téléchargement des
 * plans déposés sous ce compte, adresses des clients comprises. Il suffisait
 * de connaître l'e-mail de quelqu'un.
 *
 * Chaque connexion apporte désormais SA preuve, que le serveur vérifie :
 *   — l'e-mail : un code à six chiffres envoyé à l'adresse ;
 *   — Google : la signature que la page de connexion Google a posée ;
 *   — Apple : le jeton d'identité signé par Apple.
 * Et supprimer son compte l'efface aussi du serveur, plans compris.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NativeModules, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SERVEUR } from '../src/config/serveur';
import { SignInScreen } from '../src/screens/SignInScreen';
import { useAccountStore } from '../src/store/accountStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** Ce que le serveur a reçu : action et corps. */
let recus: { action: string; corps: Record<string, unknown> }[] = [];
let reponses: Record<string, Record<string, unknown>> = {};
const vraie = SERVEUR.url;
const fetchAvant = global.fetch;
beforeEach(() => {
  recus = [];
  reponses = {
    code_email: { ok: true },
    connecter: { ok: true, jeton: 'j', pro: '', plans: 0 },
    supprimer: { ok: true },
  };
  SERVEUR.url = 'https://exemple.test';
  global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    recus.push({ action: corps.action, corps });
    return { json: async () => reponses[corps.action] ?? { ok: false } } as Response;
  }) as unknown as typeof fetch;
  act(() => useAccountStore.setState({ compte: null, jeton: null, invite: false }));
});
afterAll(() => {
  SERVEUR.url = vraie;
  global.fetch = fetchAvant;
});

const parLabel = (t: TestRenderer.ReactTestRenderer, l: string) =>
  t.root.findAll((n) => n.props.accessibilityLabel === l && typeof n.props.onPress === 'function', { deep: false })[0];
const champ = (t: TestRenderer.ReactTestRenderer, placeholder: string) =>
  t.root.findAll((n) => n.type === TextInput && n.props.placeholder === placeholder)[0];
const textes = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));

describe('l’e-mail se prouve par un code', () => {
  const monter = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<SignInScreen />);
    });
    act(() => parLabel(t, 'Continuer avec un e-mail').props.onPress());
    act(() => champ(t, 'Prénom').props.onChangeText('Marie'));
    act(() => champ(t, 'adresse@exemple.fr').props.onChangeText('Marie@Exemple.fr'));
    return t;
  };

  it('d’abord un code envoyé à l’adresse — pas de compte sans lui', async () => {
    const t = monter();
    await act(async () => {
      await parLabel(t, 'Recevoir un code').props.onPress();
    });
    expect(recus.map((r) => r.action)).toEqual(['code_email']);
    expect(recus[0].corps.email).toBe('marie@exemple.fr');
    expect(useAccountStore.getState().compte).toBeNull();
    expect(textes(t).join(' ')).toMatch(/marie@exemple\.fr/);
    act(() => t.unmount());
  });

  it('puis le code, qui part avec la connexion', async () => {
    const t = monter();
    await act(async () => {
      await parLabel(t, 'Recevoir un code').props.onPress();
    });
    act(() => champ(t, 'Code à 6 chiffres').props.onChangeText('123456'));
    await act(async () => {
      await parLabel(t, 'Se connecter').props.onPress();
    });
    const connexion = recus.find((r) => r.action === 'connecter')!;
    expect(connexion.corps.identifiant).toBe('email:marie@exemple.fr');
    expect(connexion.corps.code).toBe('123456');
    expect(useAccountStore.getState().compte?.id).toBe('email:marie@exemple.fr');
    act(() => t.unmount());
  });

  it('un code refusé par le serveur ne connecte personne', async () => {
    reponses.connecter = { ok: false, raison: 'Code incorrect.' };
    const t = monter();
    await act(async () => {
      await parLabel(t, 'Recevoir un code').props.onPress();
    });
    act(() => champ(t, 'Code à 6 chiffres').props.onChangeText('000000'));
    await act(async () => {
      await parLabel(t, 'Se connecter').props.onPress();
    });
    expect(useAccountStore.getState().compte).toBeNull();
    act(() => t.unmount());
  });
});

describe('Apple et Google apportent leur preuve', () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).RoomScanAccount;
  });

  it('Apple : le jeton d’identité signé part avec la connexion', async () => {
    (NativeModules as Record<string, unknown>).RoomScanAccount = {
      appleSignIn: jest.fn(async () => ({ id: '001.abc', jeton: 'eyJ.apple.jwt' })),
      readMarker: jest.fn(async () => null),
      writeMarker: jest.fn(async () => undefined),
    };
    await act(async () => {
      await useAccountStore.getState().connecterApple();
    });
    const connexion = recus.find((r) => r.action === 'connecter')!;
    expect(connexion.corps.identifiant).toBe('apple:001.abc');
    expect(connexion.corps.jetonApple).toBe('eyJ.apple.jwt');
  });

  it('Google : la signature de la page de connexion part avec la connexion', () => {
    const ecran = lire('src/screens/SignInScreen.tsx');
    expect(ecran).toContain("{ sig: champ('sig') }");
  });

  it('le natif rend le jeton d’identité d’Apple', () => {
    const swift = lire('modules/react-native-room-scan/ios/RoomScanAccount.swift');
    expect(swift).toContain('cred.identityToken');
    expect(swift).toContain('sortie["jeton"]');
  });
});

describe('le serveur exige la preuve', () => {
  const api = lire('server/api.php');

  it('aucun jeton sans preuve vérifiée, avant même de créer le compte', () => {
    const connecter = api.slice(api.indexOf("if ($action === 'connecter')"));
    expect(connecter.indexOf('preuveRefusee(')).toBeGreaterThan(-1);
    expect(connecter.indexOf('preuveRefusee(')).toBeLessThan(connecter.indexOf('INSERT INTO comptes'));
  });

  it('l’e-mail : un code tiré au hasard, gardé en empreinte, à durée et essais comptés', () => {
    expect(api).toContain("$action === 'code_email'");
    expect(api).toContain('random_int(0, 999999)');
    expect(api).toContain('mail(');
    expect(api).toMatch(/essais/);
    expect(lire('server/migration-connexion.sql')).toContain('CREATE TABLE IF NOT EXISTS codes_email');
  });

  it('Apple : la signature RS256 vérifiée avec les clés publiques d’Apple', () => {
    expect(api).toContain('https://appleid.apple.com/auth/keys');
    expect(api).toContain('openssl_verify(');
    expect(api).toContain("'https://appleid.apple.com'");
  });

  it('Google : la signature HMAC de la page de connexion', () => {
    expect(api).toMatch(/hash_hmac\(\s*'sha256',\s*\$identifiant \. '\|'/);
  });

  it('supprimer son compte l’efface du serveur, plans compris ; un plan retiré l’est aussi', () => {
    expect(api).toContain("$action === 'supprimer'");
    expect(api).toContain('DELETE FROM plans WHERE identifiant = ?');
    expect(api).toContain("$action === 'retirer'");
  });
});

describe('l’app tient parole', () => {
  it('supprimer son compte appelle le serveur', async () => {
    act(() => useAccountStore.setState({ compte: { id: 'email:a@b.fr', methode: 'email' }, jeton: 'j' }));
    await act(async () => {
      await useAccountStore.getState().supprimerCompte();
    });
    expect(recus.some((r) => r.action === 'supprimer' && r.corps.identifiant === 'email:a@b.fr' && r.corps.jeton === 'j')).toBe(true);
    expect(useAccountStore.getState().compte).toBeNull();
  });

  it('les textes ne promettent plus ce que le code ne fait pas', () => {
    const conf = lire('src/screens/ConfidentialiteScreen.tsx');
    expect(conf).not.toContain('Quand vous êtes connecté, le TEXTE');
    expect(lire('src/screens/SignInScreen.tsx')).not.toContain('Un seul compte par téléphone');
    expect(lire('src/store/accountStore.ts')).not.toContain('et à retrouver vos plans après une réinstallation');
  });
});
