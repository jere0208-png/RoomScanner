/**
 * ALLER VOIR SI LES PRIX ONT BOUGÉ — sans jamais bloquer un chantier.
 *
 * Seconde moitié du relevé du patron sur les prix : « une actualisation
 * automatique via l'application, au clic sur le devis ». Le catalogue reçu et
 * son application sont éprouvés à côté (`tarifsajour`) ; ici, c'est le VOYAGE
 * qui est en cause, et il a trois issues qu'il faut savoir distinguer :
 *
 *   — ON EST ALLÉ VOIR ET LES PRIX ONT CHANGÉ (« actualisé ») ;
 *   — ON EST ALLÉ VOIR ET ILS ÉTAIENT DÉJÀ BONS (« à jour ») — ou l'on n'y est
 *     même pas allé, parce que le catalogue gardé date de moins d'un jour ;
 *   — ON N'A PAS PU Y ALLER (« hors ligne »), et l'on repart avec ce qu'on
 *     avait.
 *
 * « ACTUALISÉ » NE VEUT PAS DIRE « ARRIVÉ », MAIS « CHANGÉ ». Un serveur qui
 * rend la même version que la veille n'a rien actualisé ; l'annoncer quand
 * même ferait mentir l'écran à chaque ouverture, et l'on cesserait vite de le
 * lire. C'est le piège de ce module, et il a sa propre épreuve.
 *
 * ET L'HEURE SE PASSE EN PARAMÈTRE. Une fonction qui lit l'horloge du monde ne
 * se met pas sur un banc — c'est la même raison qui interdit `Date.now()` dans
 * les scripts de la maison.
 */
/*
  LE STOCKAGE DU TÉLÉPHONE, EN MÉMOIRE. Le vrai module est du code natif : il
  n'existe pas sous Node, et Jest ne sait pas le lire. Un dictionnaire suffit —
  ce qu'on éprouve ici, c'est que le catalogue est GARDÉ et RELU, pas la
  manière dont iOS l'écrit sur son disque.
*/
// Le nom commence par « mock » : Jest n'autorise que ceux-là dans une
// fabrique de module, pour être sûr qu'ils sont initialisés avant elle.
const mockCoffre = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockCoffre.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockCoffre.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockCoffre.delete(k);
  }),
  clear: jest.fn(async () => {
    mockCoffre.clear();
  }),
}));

import { SERVEUR } from '../src/config/serveur';
import {
  FRAICHEUR,
  reprendreLesTarifs,
  tarifsGardes,
  verifierLesTarifs,
} from '../src/net/tarifs';
import { appliquerLesTarifs, tarifsAppliques } from '../src/geometry/prix';

/*
  LE BANC REBRANCHE LE SERVEUR. `jest.setup.js` vide l'URL pour tous les
  bancs — aucun test ne doit appeler bourseur.fr pour de vrai. Celui-ci
  éprouve précisément le client : il la repose, et rend tout à la fin.
*/
const vraie = SERVEUR.url;
beforeAll(() => {
  SERVEUR.url = 'https://exemple.test';
});
afterAll(() => {
  SERVEUR.url = vraie;
});

const CATALOGUE = (version: string) => ({
  version,
  releve: '2026-09-03',
  source: 'Castorama',
  prix: { 'icta-20': 31.4 },
});

let envois: Record<string, unknown>[] = [];

const repond = (charge: Record<string, unknown>) => {
  global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
    envois.push(JSON.parse(String((init as { body: string }).body)));
    return { json: async () => charge } as Response;
  }) as unknown as typeof fetch;
};

const muet = () => {
  global.fetch = jest.fn(async () => {
    throw new Error('réseau');
  }) as unknown as typeof fetch;
};

beforeEach(async () => {
  envois = [];
  appliquerLesTarifs(null);
  mockCoffre.clear();
});
afterEach(() => appliquerLesTarifs(null));

const MIDI = 1_800_000_000_000;

describe('la visite au serveur', () => {
  it('rapporte un catalogue, l’applique et le garde', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    const v = await verifierLesTarifs(MIDI);
    expect(envois[0].action).toBe('tarifs');
    expect(v.issue).toBe('actualise');
    expect(tarifsAppliques()?.source).toBe('Castorama');
    expect((await tarifsGardes())?.catalogue.version).toBe('2026-09');
  });

  it('ne redemande pas tant que ce qu’on a date de moins d’un jour', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    await verifierLesTarifs(MIDI);
    envois = [];
    const v = await verifierLesTarifs(MIDI + FRAICHEUR - 1000);
    expect(envois).toHaveLength(0);
    expect(v.issue).toBe('ajour');
    // Et les prix gardés chiffrent quand même : on ne repart pas des nôtres.
    expect(tarifsAppliques()?.version).toBe('2026-09');
  });

  it('mais y retourne le lendemain', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    await verifierLesTarifs(MIDI);
    envois = [];
    repond({ ok: true, tarifs: CATALOGUE('2026-10') });
    const v = await verifierLesTarifs(MIDI + FRAICHEUR + 1000);
    expect(envois).toHaveLength(1);
    expect(v.issue).toBe('actualise');
    expect(tarifsAppliques()?.version).toBe('2026-10');
  });

  it('et tout de suite quand on le lui demande', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    await verifierLesTarifs(MIDI);
    envois = [];
    await verifierLesTarifs(MIDI + 1000, true);
    expect(envois).toHaveLength(1);
  });
});

describe('« actualisé » veut dire « changé »', () => {
  it('la même version ne s’annonce pas comme une nouveauté', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    await verifierLesTarifs(MIDI);
    const v = await verifierLesTarifs(MIDI + FRAICHEUR + 1000);
    expect(v.issue).toBe('ajour');
  });

  it('une version différente, oui', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    await verifierLesTarifs(MIDI);
    repond({ ok: true, tarifs: CATALOGUE('2026-11') });
    const v = await verifierLesTarifs(MIDI + FRAICHEUR + 1000);
    expect(v.issue).toBe('actualise');
  });
});

describe('un chantier sans réseau', () => {
  it('ne lève pas, et le dit', async () => {
    muet();
    const v = await verifierLesTarifs(MIDI);
    expect(v.issue).toBe('horsligne');
    expect(v.catalogue).toBeNull();
    // Les prix embarqués chiffrent, comme ils l'ont toujours fait.
    expect(tarifsAppliques()).toBeNull();
  });

  it('repart avec le dernier catalogue connu, jamais en arrière', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    await verifierLesTarifs(MIDI);
    appliquerLesTarifs(null);
    muet();
    const v = await verifierLesTarifs(MIDI + FRAICHEUR + 1000);
    expect(v.issue).toBe('horsligne');
    expect(v.catalogue?.version).toBe('2026-09');
    expect(tarifsAppliques()?.version).toBe('2026-09');
  });

  it('et le devis ouvert sans réseau reprend ce qui est gardé', async () => {
    repond({ ok: true, tarifs: CATALOGUE('2026-09') });
    await verifierLesTarifs(MIDI);
    appliquerLesTarifs(null);
    expect(await reprendreLesTarifs()).not.toBeNull();
    expect(tarifsAppliques()?.version).toBe('2026-09');
  });
});

describe('un catalogue mal formé ne casse pas un devis', () => {
  /*
    LE CONTRÔLE EN SENS INVERSE : on prouve que la porte SAIT refuser. Un
    lecteur qui accepte tout laisserait passer une gaine à zéro euro, et le
    devis s'en irait chez le client sans que personne ne s'en aperçoive.
  */
  it('sans version, sans enseigne ou sans prix : refusé en bloc', async () => {
    for (const mauvais of [
      { releve: '2026-09-03', source: 'Castorama', prix: {} },
      { version: '2026-09', source: 'Castorama', prix: {} },
      { version: '2026-09', releve: '2026-09-03', prix: {} },
      { version: '2026-09', releve: '2026-09-03', source: 'Castorama' },
      'pas un objet',
    ]) {
      mockCoffre.clear();
      repond({ ok: true, tarifs: mauvais });
      const v = await verifierLesTarifs(MIDI);
      expect(v.issue).toBe('horsligne');
      expect(tarifsAppliques()).toBeNull();
    }
  });

  it('et un prix nul ou négatif est écarté, pas le catalogue entier', async () => {
    repond({
      ok: true,
      tarifs: {
        version: '2026-09',
        releve: '2026-09-03',
        source: 'Castorama',
        prix: { 'icta-20': 31.4, 'icta-25': 0, 'icta-32': -4, 'fil-1.5': 'x' },
      },
    });
    await verifierLesTarifs(MIDI);
    const p = tarifsAppliques()!.prix;
    expect(p['icta-20']).toBe(31.4);
    expect(p['icta-25']).toBeUndefined();
    expect(p['icta-32']).toBeUndefined();
    expect(p['fil-1.5']).toBeUndefined();
  });
});
