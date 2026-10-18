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
  arreterEnvoi,
  construireFormData,
  construireJournal,
  construirePartie,
  demarrerEnvoi,
  envoyerDiagnostic,
} from '../src/diagnostic/envoi';
import { noter } from '../src/diagnostic/journal';
import { useScanStore } from '../src/store/scanStore';
import { diagnosticEvents } from 'react-native-room-scan';
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
      videos: ['/tmp/ecran.mp4'],
      gestes: [{ phase: 'debut', x: 1, y: 2, at: 10 }],
      debut: 0,
      fin: 65_000,
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
    const issue = await envoyerDiagnostic({ message: '', videos: [], gestes: [] });
    expect(issue).toBe('envoye');
    expect(aLeChamp(corps!, 'video')).toBe(false);
  });

  it('propose le partage quand le reseau lache', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('hors ligne');
    }) as unknown as typeof fetch;
    const issue = await envoyerDiagnostic({ message: 'x', videos: ['/tmp/e.mp4'], gestes: [] });
    expect(issue).toBe('partage');
    const a = useAlerte.getState().courante;
    expect(a?.titre).toBe('Envoi impossible');
    expect(a?.actions?.some((x) => x.label === 'Partager le fichier')).toBe(true);
  });
});

/*
  UNE SESSION DE PLUSIEURS MINUTES — relevé du patron : le bouton enregistre
  du premier appui au second. La vidéo part par tranches d'une minute : la
  première avec le journal, chacune des suivantes dans le dossier du rapport.
*/
describe('une session de plusieurs minutes', () => {
  const vraiFetch = global.fetch;
  afterEach(() => {
    global.fetch = vraiFetch;
  });

  it('le journal dit la session : début, fin, durée, tranches', () => {
    const j = JSON.parse(
      construireJournal({}, { walls: [] }, [], [], { debut: 1000, fin: 193_000, duree: 192, parties: 4, planDebut: { walls: [1] } }),
    );
    expect(j.session).toEqual({ debut: 1000, fin: 193_000, duree: 192, parties: 4, planDebut: { walls: [1] } });
  });

  it('une tranche suivante porte son dossier et son rang', () => {
    const fd = construirePartie({ identifiant: 'c1', jeton: 'jt' }, 'rapports/2026-10-18_20-42-05', 3, '/tmp/s3.mp4');
    expect(champ(fd, 'action')).toBe('diagnostic-video');
    expect(champ(fd, 'dossier')).toBe('rapports/2026-10-18_20-42-05');
    expect(champ(fd, 'rang')).toBe('3');
    expect(aLeChamp(fd, 'video')).toBe(true);
  });

  it('trois minutes : le journal et la première, puis une requête par minute', async () => {
    const corps: FormData[] = [];
    global.fetch = jest.fn(async (_url: unknown, init: { body?: FormData } = {}) => {
      corps.push(init.body!);
      return { json: async () => ({ ok: true, dossier: 'rapports/2026-10-18_20-42-05' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const issue = await envoyerDiagnostic({
      message: 'le frigo sort du recoin',
      videos: ['/tmp/s1.mp4', '/tmp/s2.mp4', '/tmp/s3.mp4'],
      gestes: [],
      debut: 0,
      fin: 180_000,
    });
    expect(issue).toBe('envoye');
    expect(corps).toHaveLength(3);
    expect(champ(corps[0], 'action')).toBe('diagnostic');
    expect(champ(corps[0], 'parties')).toBe('3');
    expect(JSON.parse(String(champ(corps[0], 'journal'))).session).toMatchObject({ duree: 180, parties: 3 });
    expect(corps.slice(1).map((c) => [champ(c, 'action'), champ(c, 'rang')])).toEqual([
      ['diagnostic-video', '2'],
      ['diagnostic-video', '3'],
    ]);
  });

  it('un serveur d’avant les tranches : le dit, sans perdre la première minute', async () => {
    global.fetch = jest.fn(async () => ({ json: async () => ({ ok: true }) }) as unknown as Response) as unknown as typeof fetch;
    const issue = await envoyerDiagnostic({ message: '', videos: ['/tmp/s1.mp4', '/tmp/s2.mp4'], gestes: [], debut: 0, fin: 120_000 });
    expect(issue).toBe('partiel');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(useAlerte.getState().courante?.titre).toBe('Envoi incomplet');
  });
});

/*
  LE BOUTON-INTERRUPTEUR, VU DU JAVASCRIPT — `debut` remet le fil à zéro et
  retient le plan du premier appui ; `envoyer` part avec le plan d'arrivée et
  les évènements de la session seulement ; `jete` oublie tout.
*/
describe('une session, du premier appui au second', () => {
  const vraiFetch = global.fetch;
  afterEach(() => {
    global.fetch = vraiFetch;
    arreterEnvoi();
    jest.useRealTimers();
  });

  it('le plan avant et après, et les évènements de la session seule', async () => {
    jest.useFakeTimers();
    const corps: FormData[] = [];
    global.fetch = jest.fn(async (_url: unknown, init: { body?: FormData } = {}) => {
      corps.push(init.body!);
      return { json: async () => ({ ok: true, dossier: 'rapports/2026-10-18_20-42-05' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    // L'émetteur natif est une doublure au banc : on garde ses abonnés.
    const abonnes = new Map<string, (e: unknown) => void>();
    jest.spyOn(diagnosticEvents, 'addListener').mockImplementation(((nom: string, f: (e: unknown) => void) => {
      abonnes.set(nom, f);
      return { remove: () => abonnes.delete(nom) };
    }) as never);
    const emit = (nom: string, e: unknown) => abonnes.get(nom)?.(e);
    demarrerEnvoi();
    jest.setSystemTime(1_000_000);
    noter('avant la session');
    useScanStore.setState({ scanName: 'Avant' });
    jest.setSystemTime(1_000_100);
    emit('debut', { debut: 1_000_100 });
    jest.setSystemTime(1_030_000);
    useScanStore.setState({ scanName: 'Après' });
    noter('plan', { scanName: 'Après' });
    emit('envoyer', {
      message: 'test',
      videos: [],
      gestes: [],
      debut: 1_000_100,
      fin: 1_040_000,
    });
    jest.useRealTimers();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(corps).toHaveLength(1);
    const j = JSON.parse(String(champ(corps[0], 'journal')));
    expect(j.session.planDebut.scanName).toBe('Avant');
    expect(j.plan.scanName).toBe('Après');
    expect(j.session.duree).toBe(40);
    const types = j.evenements.map((e: { type: string }) => e.type);
    expect(types).toContain('session');
    expect(types).toContain('plan');
    expect(types).not.toContain('avant la session');
  });
});
