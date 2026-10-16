/**
 * L'ABONNEMENT SE PROUVE, IL NE SE DÉCLARE PLUS.
 *
 * Revue « sécurité » : le serveur accordait la lecture de plans des abonnés
 * sur la foi d'un drapeau `abonne` que l'app écrivait — n'importe qui pouvait
 * l'écrire. Le drapeau est parti ; mais sans rien à sa place, les abonnés
 * PAYANTS perdaient leurs vingt lectures par jour.
 *
 * L'app joint maintenant `preuve` — la transaction telle qu'Apple l'a signée
 * (StoreKit 2) — et le serveur la vérifie jusqu'à la racine d'Apple.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NativeModules } from 'react-native';
import { envoyerLePlan } from '../src/net/lecturePlan';
import { echeanceAbonnement } from '../src/native/account';
import { preuveAbonnement } from '../src/store/accountStore';
import { SERVEUR } from '../src/config/serveur';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const PAGE = { base64: 'eA==', largeur: 100, hauteur: 70, textes: [] };
const QUI = { identifiant: 'email:a@b.fr', jeton: 'j' };
const JWS = 'entete.charge.signature';
const natifs = NativeModules as Record<string, unknown>;

const corpsEnvoye = (fetchMock: jest.Mock) => JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body);

describe('la requête de lecture', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    SERVEUR.url = 'https://exemple.fr/echoplan';
    fetchMock = jest.fn(async () => ({ json: async () => ({ ok: false, raison: 'pro' }) }));
    global.fetch = fetchMock as never;
  });
  afterEach(() => {
    SERVEUR.url = '';
  });

  it('joint la preuve signée quand le téléphone détient un abonnement', async () => {
    await envoyerLePlan(PAGE, QUI, JWS, 1000);
    const corps = corpsEnvoye(fetchMock);
    expect(corps.action).toBe('lire_plan');
    expect(corps.preuve).toBe(JWS);
    // Le drapeau qu'on croyait sur parole ne part plus.
    expect(corps).not.toHaveProperty('abonne');
  });

  it('part sans preuve quand il n’y a pas d’abonnement', async () => {
    await envoyerLePlan(PAGE, QUI, null, 1000);
    const corps = corpsEnvoye(fetchMock);
    expect(corps).not.toHaveProperty('preuve');
    expect(corps).not.toHaveProperty('abonne');
  });
});

describe('la preuve, demandée à l’App Store', () => {
  afterEach(() => {
    delete natifs.RoomScanAccount;
  });

  it('rend le JWS de la transaction en cours', async () => {
    const proExpiry = jest.fn(async () => ({ produit: 'echoplan.pro.mensuel', expiration: 2e12, reconduit: true, preuve: JWS }));
    natifs.RoomScanAccount = { proExpiry };
    expect(await preuveAbonnement()).toBe(JWS);
    expect(proExpiry).toHaveBeenCalledWith(['echoplan.pro.mensuel', 'echoplan.pro.annuel']);
    // L'échéance la transporte aussi, pour qui en aurait besoin.
    expect(await echeanceAbonnement(['echoplan.pro.mensuel'])).toMatchObject({ preuve: JWS });
  });

  it('rend null sans abonnement, sans signature, ou sans module natif', async () => {
    natifs.RoomScanAccount = { proExpiry: jest.fn(async () => ({ aucun: true })) };
    expect(await preuveAbonnement()).toBeNull();
    natifs.RoomScanAccount = { proExpiry: jest.fn(async () => ({ produit: 'echoplan.pro.mensuel', expiration: 2e12 })) };
    expect(await preuveAbonnement()).toBeNull();
    delete natifs.RoomScanAccount;
    expect(await preuveAbonnement()).toBeNull();
  });

  it('le natif rend la jwsRepresentation de la transaction retenue', () => {
    const swift = lire('modules', 'react-native-room-scan', 'ios', 'RoomScanAccount.swift');
    expect(swift).toContain('preuve = resultat.jwsRepresentation');
    expect(swift).toContain('sortie["preuve"] = preuve');
  });
});

describe('le serveur vérifie la preuve', () => {
  it('lire_plan passe la preuve à verifierPreuveApple, puis l’inscrit au compte', () => {
    const api = lire('server', 'api.php');
    expect(api).toContain("require __DIR__ . '/preuve-apple.php';");
    expect(api).toContain("verifierPreuveApple($corps['preuve'], (int) floor(microtime(true) * 1000))");
    expect(api).toContain('inscrireAbonnement($db, $compte, $preuve)');
    expect(api).toContain("const APPLE_BUNDLE_ID = 'fr.echoplan.app';");
    const preuve = lire('server', 'preuve-apple.php');
    expect(preuve).toContain("const APPLE_RACINE_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';");
    expect(preuve).toContain("const PRODUITS_PRO_APPLE = ['echoplan.pro.mensuel', 'echoplan.pro.annuel'];");
  });

  // Le banc PHP lui-même (chaîne de certificats de test) : là où php existe.
  let php = '';
  try {
    php = execFileSync('which', ['php'], { encoding: 'utf8' }).trim();
  } catch {
    php = '';
  }
  (php ? it : it.skip)('le banc PHP accepte le vrai et refuse les faux', () => {
    const sortie = execFileSync(php, [join(__dirname, '..', 'server', 'tests', 'preuve-apple-test.php')], { encoding: 'utf8' });
    expect(sortie).toContain('Tout passe.');
  });
});
