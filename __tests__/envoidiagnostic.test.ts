/**
 * L'ENVOI D'UN DIAGNOSTIC — le multipart, et le filet du partage.
 *
 * On verifie que le corps porte le message, le journal et la video quand elle
 * existe ; que SANS video ca part quand meme ; et qu'un echec reseau ne perd
 * pas le diagnostic mais propose de le partager.
 *
 * Le banc rebranche le serveur (vide par defaut, voir jest.setup) et le rend
 * au dernier test, comme coffreplans.test.ts.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));
jest.mock('../src/native/account', () => ({
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => false),
  connexionApple: jest.fn(async () => null),
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => {}),
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => null),
}));

import {
  construireFormData,
  construireJournal,
  envoyerDiagnostic,
} from '../src/diagnostic/envoi';
import { useAccountStore } from '../src/store/accountStore';
import { useAlerte } from '../src/ui/alerte';
import { SERVEUR } from '../src/config/serveur';

/**
 * Lecture d'un corps multipart, quel que soit le FormData : celui de React
 * Native (`getParts`) sur l'appareil, celui de Node (`get`/`has`) au banc.
 */
type AnyFd = {
  getParts?: () => { fieldName?: string; string?: string }[];
  get?: (n: string) => unknown;
  has?: (n: string) => boolean;
};
const champ = (fd: FormData, nom: string): unknown => {
  const f = fd as unknown as AnyFd;
  if (typeof f.getParts === 'function') {
    const p = f.getParts().find((x) => x.fieldName === nom);
    return p?.string;
  }
  return f.get?.(nom);
};
const aLeChamp = (fd: FormData, nom: string): boolean => {
  const f = fd as unknown as AnyFd;
  if (typeof f.getParts === 'function') {
    return f.getParts().some((x) => x.fieldName === nom);
  }
  return f.has?.(nom) ?? false;
};

const vraieUrl = SERVEUR.url;
beforeAll(() => {
  SERVEUR.url = 'https://exemple.test/echoplan';
});
afterAll(() => {
  SERVEUR.url = vraieUrl;
});

beforeEach(() => {
  useAlerte.setState({ courante: null, file: [], hotes: [] });
  useAccountStore.setState({
    compte: { id: 'c1', prenom: 'Sam', methode: 'email' },
    jeton: 'jeton-de-test',
  });
});

describe('construireFormData', () => {
  it('porte identite, message, journal et la video quand elle existe', () => {
    const fd = construireFormData(
      { identifiant: 'c1', jeton: 'jt' },
      'un souci',
      '{"a":1}',
      '/tmp/ecran.mp4',
    );
    expect(champ(fd, 'action')).toBe('diagnostic');
    expect(champ(fd, 'identifiant')).toBe('c1');
    expect(champ(fd, 'jeton')).toBe('jt');
    expect(champ(fd, 'message')).toBe('un souci');
    expect(champ(fd, 'journal')).toBe('{"a":1}');
    expect(aLeChamp(fd, 'video')).toBe(true);
  });

  it('se passe de video quand il n’y en a pas', () => {
    const fd = construireFormData({ identifiant: 'c1', jeton: 'jt' }, '', '{}', null);
    expect(aLeChamp(fd, 'video')).toBe(false);
  });
});

describe('construireJournal', () => {
  it('range l’instantane, le plan, les gestes et les evenements', () => {
    const j = JSON.parse(construireJournal({ ecran: 'scan' }, { walls: [] }, [], []));
    expect(j.instant).toEqual({ ecran: 'scan' });
    expect(j.gestes).toEqual([]);
    expect(j.evenements).toEqual([]);
  });
});

describe('envoyerDiagnostic', () => {
  const vraiFetch = global.fetch;
  afterEach(() => {
    global.fetch = vraiFetch;
  });

  it('envoie en multipart et se dit « envoye »', async () => {
    let corps: FormData | null = null;
    global.fetch = jest.fn(async (_url: unknown, init: { body?: FormData } = {}) => {
      corps = init.body ?? null;
      return { json: async () => ({ ok: true }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const issue = await envoyerDiagnostic({
      message: 'bug au scan',
      video: '/tmp/ecran.mp4',
      gestes: [{ phase: 'debut', x: 1, y: 2, at: 10 }],
    });
    expect(issue).toBe('envoye');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(champ(corps!, 'message')).toBe('bug au scan');
    expect(aLeChamp(corps!, 'journal')).toBe(true);
    expect(aLeChamp(corps!, 'video')).toBe(true);
  });

  it('part quand meme sans video', async () => {
    let corps: FormData | null = null;
    global.fetch = jest.fn(async (_url: unknown, init: { body?: FormData } = {}) => {
      corps = init.body ?? null;
      return { json: async () => ({ ok: true }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const issue = await envoyerDiagnostic({ message: '', video: null, gestes: [] });
    expect(issue).toBe('envoye');
    expect(aLeChamp(corps!, 'video')).toBe(false);
  });

  it('propose le partage quand le reseau lache', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('hors ligne');
    }) as unknown as typeof fetch;
    const issue = await envoyerDiagnostic({ message: 'x', video: '/tmp/e.mp4', gestes: [] });
    expect(issue).toBe('partage');
    const a = useAlerte.getState().courante;
    expect(a?.titre).toBe('Envoi impossible');
    expect(a?.actions?.some((x) => x.label === 'Partager le fichier')).toBe(true);
  });
});
