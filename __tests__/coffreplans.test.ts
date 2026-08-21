/**
 * LES PLANS QUI SUIVENT LE COMPTE.
 *
 * Seconde moitié du relevé du chantier : « que les photos soient lues même
 * s'il réinstalle l'application, tant qu'il est sur son compte ». Les photos
 * survivent maintenant dans la photothèque du téléphone — mais un scan vit
 * dans le stockage de l'application, et celui-là part avec elle. Une photo
 * restaurée n'aurait plus de plan où se punaiser.
 *
 * Ce banc tient les deux propriétés qui comptent : ce qui monte est du TEXTE
 * (jamais une image), et un serveur muet ne casse rien.
 */
import { SERVEUR } from '../src/config/serveur';
import {
  catalogueDesPlans,
  deposerPlan,
  reprendrePlan,
} from '../src/net/coffrePlans';

/*
  LE BANC REBRANCHE LE SERVEUR.

  `jest.setup.js` vide l'URL pour tous les bancs — un test ne doit jamais
  appeler bourseur.fr pour de vrai. Celui-ci teste précisément le client du
  serveur : il la repose, et rend tout au dernier test, pour ne pas ouvrir
  la porte aux suites suivantes.
*/
const vraie = SERVEUR.url;
beforeAll(() => {
  SERVEUR.url = 'https://exemple.test';
});
afterAll(() => {
  SERVEUR.url = vraie;
});

const QUI = { identifiant: 'compte-1', jeton: 'jeton-1' };

/** Les requêtes parties, pour les relire. */
let envois: { action: string; corps: Record<string, unknown> }[] = [];

const repond = (charge: Record<string, unknown>) => {
  global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
    const corps = JSON.parse(String((init as { body: string }).body));
    envois.push({ action: corps.action, corps });
    return { json: async () => charge } as Response;
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  envois = [];
});

describe('déposer un plan', () => {
  it('envoie le texte du relevé, jamais une image', async () => {
    repond({ ok: true });
    const ok = await deposerPlan(QUI, {
      scan: 's1',
      nom: 'Chantier Dupont',
      maj: 1700,
      contenu: JSON.stringify({ walls: [], photos: [{ asset: 'PH-1' }] }),
    });
    expect(ok).toBe(true);
    expect(envois).toHaveLength(1);
    expect(envois[0].action).toBe('deposer');
    expect(envois[0].corps.identifiant).toBe('compte-1');
    // Le plan porte le RENVOI vers la photo, pas la photo : les octets des
    // images restent sur le téléphone de l'électricien.
    const contenu = String(envois[0].corps.contenu);
    expect(contenu).toContain('PH-1');
    expect(contenu.length).toBeLessThan(500);
  });

  it('un serveur qui refuse ne casse rien : il rend faux', async () => {
    repond({ ok: false, raison: 'Plan trop lourd.' });
    const ok = await deposerPlan(QUI, {
      scan: 's1',
      nom: 'X',
      maj: 1,
      contenu: '{}',
    });
    expect(ok).toBe(false);
  });

  it('un serveur injoignable ne lève pas', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('réseau');
    }) as unknown as typeof fetch;
    await expect(
      deposerPlan(QUI, { scan: 's1', nom: 'X', maj: 1, contenu: '{}' }),
    ).resolves.toBe(false);
  });
});

describe('reprendre ses plans', () => {
  it('liste ce que le compte garde, sans télécharger les plans', async () => {
    repond({
      ok: true,
      plans: [
        { scan: 's2', nom: 'Martin', maj: 1800, taille: 42000 },
        { scan: 's1', nom: 'Dupont', maj: 1700, taille: 31000 },
      ],
    });
    const liste = await catalogueDesPlans(QUI);
    expect(liste).toHaveLength(2);
    // Le plus récent d'abord : c'est celui qu'on cherche en rouvrant l'app.
    expect(liste![0].nom).toBe('Martin');
    expect(liste![0].taille).toBe(42000);
    // Aucun contenu n'est descendu : vingt relevés ne coûtent pas vingt
    // téléchargements pour en ouvrir un.
    expect(liste![0]).not.toHaveProperty('contenu');
  });

  it('redescend un plan entier, à la demande', async () => {
    repond({ ok: true, nom: 'Dupont', contenu: '{"walls":[]}', maj: 1700 });
    const plan = await reprendrePlan(QUI, 's1');
    expect(plan?.nom).toBe('Dupont');
    expect(plan?.contenu).toBe('{"walls":[]}');
    expect(envois[0].corps.scan).toBe('s1');
  });

  it('un plan que le serveur n’a pas rend null, pas une exception', async () => {
    repond({ ok: false, raison: 'Plan introuvable.' });
    await expect(reprendrePlan(QUI, 'inconnu')).resolves.toBeNull();
  });

  it('une réponse mal formée ne devient pas un plan vide', async () => {
    // Un hébergement mutualisé qui renvoie une page d'erreur en HTML, un
    // proxy qui s'interpose : la réponse existe mais ne dit rien de bon. On
    // ne remplace pas un relevé par du vide.
    repond({ ok: true });
    await expect(reprendrePlan(QUI, 's1')).resolves.toBeNull();
    repond({ ok: true, plans: 'pas une liste' });
    await expect(catalogueDesPlans(QUI)).resolves.toBeNull();
  });
});
