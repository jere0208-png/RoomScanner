/**
 * LES PRIX DU JOUR — relevés chaque matin, jamais antidatés.
 *
 * Relevé du patron : « revois le système de devis, les prix ne s'actualisent
 * pas même après un forçage, ça reste antidaté ; vérifie que tous les prix
 * sont bien réels ».
 *
 * La cause n'était pas le geste : le « forçage » allait bien chercher le
 * catalogue — un fichier posé à la main sur le serveur, relevé le 5 septembre
 * et jamais relu. Il revenait donc, fidèlement, avec sa date. Ce banc tient :
 *
 *   — le relevé du matin (`tools/releve-prix.js`) : la page produit lue dans
 *     ses données structurées, le même produit ou rien (l'EAN), le
 *     conditionnement du devis, un saut invraisemblable écarté, et chaque prix
 *     daté du jour où il a été VU — jamais d'« aujourd'hui » sur un prix
 *     qu'on n'a pas revu ;
 *   — l'app : le plus récent des catalogues l'emporte (le fichier du 5
 *     septembre ne passe plus devant le relevé du matin), et chaque ligne du
 *     devis porte le jour de SON prix ;
 *   — la tâche planifiée : tous les matins, sur une branche à part.
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVEUR } from '../src/config/serveur';
import { lePlusRecent, verifierLesTarifs } from '../src/net/tarifs';
import {
  appliquerLesTarifs,
  moisDeLaVersion,
  tarifRecu,
  tarifsAppliques,
  type TarifsRecus,
} from '../src/geometry/prix';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const releve = require('../tools/releve-prix.js') as {
  produitDeLaPage: (html: string) => { ean: string; prix: number | null; dispo: string; intitule: string } | null;
  catalogueDuJour: (x: {
    sources: {
      enseigne?: string;
      articles: Record<
        string,
        { url?: string; ean?: string; facteur?: number; autres?: { enseigne: string; url: string }[] }
      >;
    };
    lus: Record<string, Record<string, { ean: string; prix: number | null } | null>>;
    precedent: Partial<TarifsRecus> | null;
    jour: string;
  }) => TarifsRecus & { echecs: string[]; suspects: string[] };
  joursEntre: (a: string, b: string) => number;
};

const racine = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(racine, p), 'utf8');

afterEach(() => appliquerLesTarifs(null));

const page = (ean: string, prix: string) => `<html><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Prise avec terre affleurante Legrand Dooxie blanc carrée",
"gtin13":"${ean}","offers":{"@type":"Offer","price":"${prix}","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
</script></html>`;

describe('le relevé du matin', () => {
  it('lit la page produit dans ses données structurées', () => {
    const p = releve.produitDeLaPage(page('3414971087187', '5.5'));
    expect(p).toEqual({
      ean: '3414971087187',
      prix: 5.5,
      dispo: 'InStock',
      intitule: 'Prise avec terre affleurante Legrand Dooxie blanc carrée',
    });
    expect(releve.produitDeLaPage('<html>maintenance</html>')).toBeNull();
  });

  const sources = {
    enseigne: 'Castorama',
    articles: {
      'meca-dooxie-prise': { url: 'https://www.castorama.fr/a/3414971087187_CAFR.prd', ean: '3414971087187' },
      'boite-encastrement': { url: 'https://www.castorama.fr/b/1_CAFR.prd', ean: '1111111111111', facteur: 0.1 },
      'fil-10': { url: 'https://www.castorama.fr/c/2_CAFR.prd', ean: '2222222222222', facteur: 10 },
      'diff-AC': { url: 'https://www.castorama.fr/d/3_CAFR.prd', ean: '3333333333333' },
    },
  };

  it('le prix du jour, au conditionnement du devis, daté du jour', () => {
    const cat = releve.catalogueDuJour({
      sources,
      lus: {
        'meca-dooxie-prise': { Castorama: { ean: '3414971087187', prix: 5.5 } },
        'boite-encastrement': { Castorama: { ean: '1111111111111', prix: 20.5 } },
        'fil-10': { Castorama: { ean: '2222222222222', prix: 2.69 } },
        'diff-AC': { Castorama: { ean: '3333333333333', prix: 49.9 } },
      },
      precedent: null,
      jour: '2026-10-10',
    });
    expect(cat.prix).toEqual({
      'meca-dooxie-prise': 5.5,
      'boite-encastrement': 2.05, // le lot de dix, à la boîte
      'fil-10': 26.9, // le mètre, à la couronne de 10 m
      'diff-AC': 49.9,
    });
    expect(cat.releve).toBe('2026-10-10');
    expect(Object.values(cat.jours ?? {}).every((j) => j === '2026-10-10')).toBe(true);
    expect(cat.ean?.['meca-dooxie-prise']).toBe('3414971087187');
    // Une version que l'app sait écrire : « Octobre 2026 », pas « 2026-10-10 ».
    expect(moisDeLaVersion(cat.version)).toBe('Octobre 2026');
  });

  it('le même produit ou rien : un EAN changé garde le prix d’avant, AVEC SA DATE', () => {
    const cat = releve.catalogueDuJour({
      sources,
      lus: {
        'meca-dooxie-prise': { Castorama: { ean: '9999999999999', prix: 1.0 } },
        'boite-encastrement': { Castorama: { ean: '1111111111111', prix: 20.5 } },
        'fil-10': { Castorama: { ean: '2222222222222', prix: 2.69 } },
        'diff-AC': { Castorama: null },
      },
      precedent: {
        releve: '2026-10-08',
        prix: { 'meca-dooxie-prise': 5.5, 'diff-AC': 49.9 },
        jours: { 'meca-dooxie-prise': '2026-10-08', 'diff-AC': '2026-10-01' },
      },
      jour: '2026-10-10',
    });
    expect(cat.prix['meca-dooxie-prise']).toBe(5.5);
    expect(cat.jours?.['meca-dooxie-prise']).toBe('2026-10-08');
    // Plus d'une semaine sans relecture : il quitte le catalogue, l'app
    // reprend son prix embarqué, daté lui aussi.
    expect(cat.prix['diff-AC']).toBeUndefined();
    expect(cat.echecs.sort()).toEqual(['diff-AC', 'meca-dooxie-prise']);
  });

  it('le moins cher des magasins fait le prix ; tous restent listés', () => {
    const cat = releve.catalogueDuJour({
      sources: {
        enseigne: 'Castorama',
        articles: {
          'plaque-dooxie-1': {
            url: 'https://www.castorama.fr/p/3414971090040_CAFR.prd',
            ean: '3414971090040',
            autres: [{ enseigne: 'Brico Dépôt', url: 'https://www.bricodepot.fr/p/3414971090040/plaque' }],
          },
        },
      },
      lus: {
        'plaque-dooxie-1': {
          Castorama: { ean: '3414971090040', prix: 1.9 },
          'Brico Dépôt': { ean: '3414971090040', prix: 1.69 },
        },
      },
      precedent: null,
      jour: '2026-10-10',
    });
    expect(cat.prix['plaque-dooxie-1']).toBe(1.69);
    expect(cat.offres?.['plaque-dooxie-1'].map((o) => [o.enseigne, o.pu])).toEqual([
      ['Brico Dépôt', 1.69],
      ['Castorama', 1.9],
    ]);
    // Et l'app en tire le prix retenu, son magasin, et le prix public.
    appliquerLesTarifs(cat);
    const t = tarifRecu('plaque-dooxie-1');
    expect(t?.pu).toBe(1.69);
    expect(t?.source).toBe('Brico Dépôt');
    expect(t?.public).toBe(1.9);
  });

  it('un saut invraisemblable se signale, il ne s’applique pas', () => {
    const cat = releve.catalogueDuJour({
      sources,
      lus: {
        'meca-dooxie-prise': { Castorama: { ean: '3414971087187', prix: 55 } },
        'boite-encastrement': { Castorama: { ean: '1111111111111', prix: 20.5 } },
        'fil-10': { Castorama: { ean: '2222222222222', prix: 2.69 } },
        'diff-AC': { Castorama: { ean: '3333333333333', prix: 52.9 } },
      },
      precedent: { releve: '2026-10-09', prix: { 'meca-dooxie-prise': 5.5, 'diff-AC': 49.9 } },
      jour: '2026-10-10',
    });
    expect(cat.prix['meca-dooxie-prise']).toBe(5.5);
    expect(cat.suspects).toEqual(['meca-dooxie-prise (Castorama) : 5.5 → 55']);
    // Une vraie hausse, elle, passe.
    expect(cat.prix['diff-AC']).toBe(52.9);
  });

  it('chaque article du catalogue a sa page produit, son EAN et son conditionnement', () => {
    const s = JSON.parse(lire('server/sources-prix.json')) as {
      articles: Record<
        string,
        { url: string | null; ean?: string; facteur?: number; autres?: { enseigne: string; url: string }[] }
      >;
    };
    const avecPage = Object.entries(s.articles).filter(([, a]) => a.url);
    expect(avecPage.length).toBeGreaterThanOrEqual(150);
    for (const [cle, a] of avecPage) {
      expect([cle, /^https:\/\/www\.castorama\.fr\/.+_CAFR\.prd$/.test(a.url!)]).toEqual([cle, true]);
      expect([cle, /^\d{13}$/.test(a.ean ?? '')]).toEqual([cle, true]);
      expect([cle, (a.facteur ?? 1) > 0]).toEqual([cle, true]);
      // L'autre magasin vend LE MÊME produit : son adresse porte le même EAN.
      for (const o of a.autres ?? []) {
        expect([cle, o.url.includes(`/p/${a.ean}/`)]).toEqual([cle, true]);
      }
    }
  });
});

describe('l’app prend le plus récent', () => {
  const cat = (releveLe: string, pu: number, version = releveLe): TarifsRecus => ({
    version,
    releve: releveLe,
    source: 'Castorama',
    prix: { 'diff-AC': pu },
  });

  it('le fichier du 5 septembre ne passe plus devant le relevé du matin', () => {
    const script = cat('2026-09-05', 49.9);
    const duJour = cat('2026-10-10', 52.9);
    expect(lePlusRecent(script, duJour, null)).toBe(duJour);
    // À égalité de jour, l'ordre tranche : l'API d'abord.
    const autre = cat('2026-10-10', 51.9);
    expect(lePlusRecent(autre, duJour)).toBe(autre);
    expect(lePlusRecent(null, null)).toBeNull();
  });

  it('le forçage rapporte le relevé du matin, même quand le script répond l’ancien', async () => {
    const vraie = SERVEUR.url;
    SERVEUR.url = 'https://exemple.test';
    mockCoffre.clear();
    global.fetch = jest.fn(async (url: unknown) => {
      const a = String(url);
      const charge = a.includes('api.php')
        ? { ok: true, tarifs: cat('2026-09-05', 49.9, '2026-09.2') }
        : a === SERVEUR.tarifsDuJour
          ? cat('2026-10-10', 52.9, '2026-10.10')
          : cat('2026-09-05', 49.9, '2026-09.2');
      return { ok: true, json: async () => charge } as Response;
    }) as unknown as typeof fetch;
    try {
      const v = await verifierLesTarifs(Date.parse('2026-10-10T08:00:00Z'), true);
      expect(v.issue).toBe('actualise');
      expect(tarifsAppliques()?.releve).toBe('2026-10-10');
      expect(tarifRecu('diff-AC')?.pu).toBe(52.9);
    } finally {
      SERVEUR.url = vraie;
    }
  });

  it('chaque prix porte SON jour', () => {
    appliquerLesTarifs({
      version: '2026-10.10',
      releve: '2026-10-10',
      source: 'Castorama',
      prix: { 'diff-AC': 52.9, 'fil-1.5': 27.9 },
      jours: { 'fil-1.5': '2026-10-08' },
    });
    expect(tarifRecu('diff-AC')?.releve).toBe('2026-10-10');
    expect(tarifRecu('fil-1.5')?.releve).toBe('2026-10-08');
  });
});

describe('la tâche du matin', () => {
  it('tous les matins, et à la demande, publiée sur une branche à part', () => {
    const w = lire('.github/workflows/releve-prix.yml');
    expect(w).toMatch(/schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/);
    expect(w).toContain('workflow_dispatch');
    expect(w).toContain('node tools/releve-prix.js');
    // La branche `tarifs`, réécrite d'un seul commit : `main` n'est jamais touchée.
    expect(w).toMatch(/push -q -f .* tarifs/);
    expect(w).not.toMatch(/push[^\n]*main/);
    expect(SERVEUR.tarifsDuJour).toBe(
      'https://raw.githubusercontent.com/jere0208-png/RoomScanner/tarifs/tarifs.json',
    );
  });

  it('la recherche du site n’est jamais lue (robots.txt l’interdit)', () => {
    const script = lire('tools/releve-prix.js');
    expect(script).not.toMatch(/castorama\.fr\/search/);
  });
});
