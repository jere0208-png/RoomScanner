/**
 * LE CANAL DES PRIX NE DOIT PLUS DÉPENDRE D'UN SCRIPT.
 *
 * CE DÉFAUT S'EST PRODUIT DEUX FOIS, ET LA SECONDE A ANNULÉ LA PREMIÈRE
 * CORRECTION. Le 5 septembre, interrogé, `bourseur.fr/api.php` répondait
 * « Identifiant manquant » : le fichier en ligne était ANTÉRIEUR à l'action
 * `tarifs`, et l'application retombait silencieusement sur ses prix
 * embarqués. Le serveur a été remis à jour, il a fonctionné — puis, trois
 * jours plus tard, il répondait de nouveau « Identifiant manquant », alors
 * que `tarifs.json`, lui, était toujours en ligne et lisible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FICHIER STATIQUE NE SE DÉSYNCHRONISE PAS.
 *
 * Le catalogue est un objet JSON posé à côté du script. Le script, lui, est
 * du CODE : il se redéploie, il se remplace, il repart en arrière — et quand
 * il repart en arrière, il emporte une fonctionnalité qui n'a rien à voir
 * avec lui. Le fichier, non : il est là ou il n'est pas là.
 *
 * On demande donc les DEUX en même temps, et l'API garde la priorité — elle
 * pourra un jour servir un catalogue calculé, ce qu'un fichier ne sait pas
 * faire. Mais elle n'est plus le seul chemin.
 *
 * EN MÊME TEMPS, ET NON L'UN APRÈS L'AUTRE. Deux attentes de six secondes en
 * file donneraient douze secondes sur un chantier sans réseau, pour un geste
 * dont toute la promesse est d'être rapide. Les deux partent ensemble : le
 * budget d'attente ne bouge pas.
 */
const mockCoffre = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockCoffre.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockCoffre.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockCoffre.delete(k);
  }),
}));

import { SERVEUR } from '../src/config/serveur';
import { verifierLesTarifs } from '../src/net/tarifs';
import { appliquerLesTarifs, tarifsAppliques } from '../src/geometry/prix';

const vraie = SERVEUR.url;
beforeAll(() => {
  SERVEUR.url = 'https://exemple.test';
});
afterAll(() => {
  SERVEUR.url = vraie;
});

const catalogue = (version: string, pu: number) => ({
  version,
  releve: '2026-09-05',
  source: 'Castorama',
  prix: { 'diff-AC': pu },
});

/** Les adresses appelées, dans l'ordre où elles sont parties. */
let appels: string[] = [];

/**
 * Un serveur où l'on choisit ce que répond CHAQUE porte : le script et le
 * fichier. `null` = la porte refuse d'ouvrir (réseau coupé, 404).
 */
const serveur = (
  script: Record<string, unknown> | null,
  fichier: Record<string, unknown> | null,
) => {
  global.fetch = jest.fn(async (url: unknown) => {
    const adresse = String(url);
    appels.push(adresse);
    const charge = adresse.includes('api.php') ? script : fichier;
    if (!charge) throw new Error('réseau');
    return { ok: true, json: async () => charge } as Response;
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  appels = [];
  appliquerLesTarifs(null);
  mockCoffre.clear();
});
afterEach(() => appliquerLesTarifs(null));

const MIDI = 1_800_000_000_000;

describe('le script répond : c’est lui qui fait foi', () => {
  it('l’API garde la priorité sur le fichier', async () => {
    /*
      Elle pourra un jour servir un catalogue calculé — par région, par
      enseigne, par compte. Un fichier ne sait pas faire ça. Tant qu'elle
      répond, c'est elle qu'on écoute.
    */
    serveur(
      { ok: true, tarifs: catalogue('par-le-script', 49.9) },
      catalogue('par-le-fichier', 72.9),
    );
    const v = await verifierLesTarifs(MIDI);
    expect(v.issue).toBe('actualise');
    expect(tarifsAppliques()?.version).toBe('par-le-script');
    expect(tarifsAppliques()?.prix['diff-AC']).toBe(49.9);
  });
});

describe('le script ne comprend plus la question : le fichier prend le relais', () => {
  it('« Identifiant manquant » n’enterre plus la mise à jour', async () => {
    /*
      C'est la réponse EXACTE qu'a rendue le serveur, deux fois : un
      `api.php` antérieur à l'action `tarifs` tombe dans sa branche
      d'authentification et réclame un identifiant. Rien ne le signalait —
      l'application se contentait de repartir avec ses prix embarqués.
    */
    serveur(
      { ok: false, raison: 'Identifiant manquant.' },
      catalogue('par-le-fichier', 49.9),
    );
    const v = await verifierLesTarifs(MIDI);
    expect(v.issue).toBe('actualise');
    expect(tarifsAppliques()?.version).toBe('par-le-fichier');
    expect(tarifsAppliques()?.prix['diff-AC']).toBe(49.9);
  });

  it('et un script injoignable non plus', async () => {
    serveur(null, catalogue('par-le-fichier', 49.9));
    const v = await verifierLesTarifs(MIDI);
    expect(v.issue).toBe('actualise');
    expect(tarifsAppliques()?.version).toBe('par-le-fichier');
  });

  it('un fichier mal formé ne se substitue pas à un bon catalogue', async () => {
    /*
      Le fichier est édité à la main : une virgule de trop, une clé oubliée,
      et il ne vaut rien. Il est lu par la même garde que le reste — un
      catalogue sans version, sans jour ou sans enseigne est refusé EN BLOC,
      parce qu'un devis qui cache d'où sortent ses chiffres n'est pas un
      devis.
    */
    serveur({ ok: false, raison: 'Identifiant manquant.' }, { n_importe: 'quoi' });
    const v = await verifierLesTarifs(MIDI);
    expect(v.issue).toBe('horsligne');
    expect(tarifsAppliques()).toBeNull();
  });
});

describe('les portes s’ouvrent EN MÊME TEMPS', () => {
  it('le fichier — et le relevé du matin — sont demandés sans attendre la réponse du script', async () => {
    /*
      Deux attentes de six secondes en file donneraient douze secondes sur un
      chantier sans réseau, pour un geste dont toute la promesse est d'être
      rapide. On ne paie donc qu'un seul budget d'attente.
    */
    let libere: (() => void) | null = null;
    const lent = new Promise<void>((suite) => {
      libere = suite;
    });
    global.fetch = jest.fn(async (url: unknown) => {
      const adresse = String(url);
      appels.push(adresse);
      if (adresse.includes('api.php')) {
        await lent;
        return { ok: true, json: async () => ({ ok: false }) } as Response;
      }
      return {
        ok: true,
        json: async () => catalogue('par-le-fichier', 49.9),
      } as Response;
    }) as unknown as typeof fetch;

    const course = verifierLesTarifs(MIDI);
    // Le temps d'une microtâche : les deux départs doivent déjà être partis.
    await Promise.resolve();
    await Promise.resolve();
    expect(appels.filter((a) => a.includes('api.php'))).toHaveLength(1);
    expect(appels.filter((a) => a === `${SERVEUR.url}/tarifs.json`)).toHaveLength(1);
    // La troisième porte, ouverte depuis : le relevé publié chaque matin.
    expect(appels.filter((a) => a === SERVEUR.tarifsDuJour)).toHaveLength(1);
    libere!();
    await course;
  });

  it('un script qui PEND ne retient pas la réponse du fichier', async () => {
    /*
      Le cas le plus vicieux, et celui qu'on a vu : le script ne refuse pas,
      il ne répond pas. Sans borne partagée, on attendait sa réponse alors
      que le fichier avait déjà tout donné — six secondes d'écran d'attente
      pour un catalogue qui était là depuis la première milliseconde.
    */
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(async (url: unknown) => {
        const adresse = String(url);
        appels.push(adresse);
        // Le script ne répond JAMAIS.
        if (adresse.includes('api.php')) return new Promise<Response>(() => {});
        return {
          ok: true,
          json: async () => catalogue('par-le-fichier', 49.9),
        } as Response;
      }) as unknown as typeof fetch;

      const course = verifierLesTarifs(MIDI);
      /*
        ON VIDE LES MICROTÂCHES AVANT D'AVANCER L'HORLOGE.

        La visite lit d'abord le coffre du téléphone : les deux requêtes ne
        partent qu'après, et le sablier est créé plus tard encore. Avancer
        l'horloge tout de suite le ferait sonner AVANT d'exister — la course
        ne se réglerait jamais, et l'épreuve pendrait sans rien prouver.
      */
      for (let i = 0; i < 50 && appels.length < 3; i++) {
        await Promise.resolve();
      }
      // Le script, le fichier, le relevé du matin.
      expect(appels).toHaveLength(3);
      // Les deux requêtes sont PARTIES ; celle du fichier doit encore être
      // lue et validée, ce qui prend quelques microtâches de plus. C'est le
      // cas qu'on veut : le fichier a fini, le script n'a pas commencé.
      for (let i = 0; i < 50; i++) await Promise.resolve();
      jest.advanceTimersByTime(6001);
      const v = await course;
      expect(v.issue).toBe('actualise');
      expect(tarifsAppliques()?.version).toBe('par-le-fichier');
    } finally {
      jest.useRealTimers();
    }
  });

  it('et le sablier se range : pas de minuteur oublié derrière la visite', async () => {
    /*
      Chaque requête portait son propre `setTimeout` de six secondes, que
      personne n'éteignait quand la réponse arrivait la première. Avec deux
      portes, cela faisait deux minuteurs pendants à CHAQUE consultation du
      prix — et sur une machine chargée, une file de minuteurs oubliés se
      paie en secondes.
    */
    jest.useFakeTimers();
    try {
      serveur({ ok: true, tarifs: catalogue('v', 49.9) }, null);
      await verifierLesTarifs(MIDI);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('et le fichier se demande à la racine du serveur, à côté du script', () => {
    /*
      `<serveur>/tarifs.json` — c'est là que le dépôt le place, à côté de
      `api.php`, et c'est ce que dit le mode d'emploi du fichier. Une adresse
      devinée ailleurs serait une seconde chose à tenir d'accord.
    */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(__dirname, '..', 'src', 'net', 'tarifs.ts'),
      'utf8',
    );
    expect(src).toContain('/tarifs.json');
  });
});
