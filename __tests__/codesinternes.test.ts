/**
 * LES CODES INTERNES, LE TEMPS DU DÉVELOPPEMENT.
 *
 * Relevé du patron : « ça demande le plan Pro, alors que mon compte l'était.
 * L'app n'est pas encore sur le store Apple. Ça demande une connexion sur le
 * store lors d'une application de coupon… l'app est encore en dev. »
 *
 * « J'ai un code » ouvre la feuille des codes d'offre d'Apple : elle n'existe
 * que pour une app publiée. En développement, c'était une impasse — et la base
 * neuve du serveur avait oublié le Pro du patron.
 *
 * Le serveur rouvre donc ses codes maison, mais SEULEMENT quand sa config le
 * dit (`CODES_INTERNES`), et il le fait savoir à l'app. Fermé, rien ne change :
 * l'app publiée ne propose que la feuille d'Apple (règle 3.1.1).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => undefined),
  connexionApple: jest.fn(async () => ({ id: 'A1', prenom: 'Jé' })),
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => false),
  echeanceAbonnement: jest.fn(async () => null),
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAccountStore } from '../src/store/accountStore';
import { SERVEUR } from '../src/config/serveur';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const fetchMock = jest.fn();
const reponse = (corps: unknown) => Promise.resolve({ json: async () => corps } as Response);
const COMPTE = { id: 'email:jere@exemple.fr', email: 'jere@exemple.fr', methode: 'email' as const };

beforeEach(() => {
  SERVEUR.url = 'https://exemple.fr/echoplan';
  global.fetch = fetchMock as never;
  fetchMock.mockReset();
  useAccountStore.setState({
    charge: true,
    compte: COMPTE,
    jeton: 'jeton',
    pro: false,
    proVia: null,
    paywallVisible: true,
    codesInternes: false,
  } as never);
});
afterEach(() => {
  SERVEUR.url = '';
});

describe('l’app apprend du serveur que les codes internes sont ouverts', () => {
  it('à la connexion', async () => {
    fetchMock.mockReturnValueOnce(reponse({ ok: true, jeton: 'j2', pro: '', plans: 0, codes: true }));
    useAccountStore.setState({ compte: null, jeton: null } as never);
    await useAccountStore.getState().connecter(COMPTE);
    expect(useAccountStore.getState().codesInternes).toBe(true);
  });

  it('et fermés, ils le restent', async () => {
    fetchMock.mockReturnValueOnce(reponse({ ok: true, jeton: 'j2', pro: '', plans: 0 }));
    useAccountStore.setState({ compte: null, jeton: null } as never);
    await useAccountStore.getState().connecter(COMPTE);
    expect(useAccountStore.getState().codesInternes).toBe(false);
  });
});

describe('appliquer un code interne', () => {
  it('le Pro s’ouvre, par le code, et la page Pro se referme', async () => {
    fetchMock.mockReturnValueOnce(reponse({ ok: true, pro: 'code' }));
    const r = await useAccountStore.getState().appliquerCodeInterne(' mon-code ');
    expect(r.ok).toBe(true);
    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps).toMatchObject({ action: 'code', identifiant: COMPTE.id, jeton: 'jeton', code: 'MON-CODE' });
    const s = useAccountStore.getState();
    expect(s.pro).toBe(true);
    expect(s.proVia).toBe('code');
    expect(s.paywallVisible).toBe(false);
  });

  it('un code refusé le dit, et ne donne rien', async () => {
    fetchMock.mockReturnValueOnce(reponse({ ok: false, raison: 'Code inconnu ou partiel.' }));
    const r = await useAccountStore.getState().appliquerCodeInterne('FAUX');
    expect(r).toEqual({ ok: false, raison: 'Code inconnu ou partiel.' });
    expect(useAccountStore.getState().pro).toBe(false);
  });

  it('sans jeton, on le dit : il faut se reconnecter', async () => {
    useAccountStore.setState({ jeton: null } as never);
    const r = await useAccountStore.getState().appliquerCodeInterne('MON-CODE');
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/reconnect/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ce qui le tient', () => {
  it('le serveur n’accepte un code que si sa config ouvre les codes internes, et le dit à l’app', () => {
    const api = lire('server', 'api.php');
    expect(api).toContain('function codesInternesOuverts()');
    expect(api).toMatch(/if \(!codesInternesOuverts\(\)\) \{\s*sortir\(\['ok' => false, 'raison' => 'Les codes internes sont fermés\.'\]\);/);
    expect(api).toContain("'codes' => codesInternesOuverts()");
    expect(lire('server', 'config-echoplan.exemple.php')).toContain('const CODES_INTERNES = false;');
  });

  it('la page Pro propose le code interne quand il est ouvert, la feuille d’Apple sinon', () => {
    const page = lire('src', 'screens', 'PaywallScreen.tsx');
    expect(page).toContain('if (codesInternes) {');
    expect(page).toContain('appliquerCodeInterne(');
  });
});
