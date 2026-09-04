/**
 * LES PRIX DU DEVIS SONT FAUX — et trois choses différentes en sont cause.
 *
 * Relevé du patron, lien à l'appui : la plaque de finition 1 poste Legrand
 * Céliane CP0021 blanc émaillé est à **2,29 €** chez Castorama ; le devis en
 * annonçait **8,50 €**. Presque quatre fois trop.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 1. LA TABLE DES PLAQUES N'AVAIT JAMAIS ÉTÉ RELEVÉE.
 *
 * Les MÉCANISMES l'avaient été, pièce par pièce, en rayon — ils portent la
 * marque `r()`. Les plaques, elles, étaient un simple tableau de nombres
 * posés à la main : pas de date, pas d'enseigne, RIEN qui dise qu'on ne les
 * avait pas vérifiés. C'est exactement pour ça que personne ne l'a vu.
 *
 * Et le relevé donne la cause : la ligne Céliane du catalogue
 * (8,50 / 14,30 / 20,20 / 27,30) est à un cheveu du **blanc amande
 * décoratif** (7,29 / 14,50 / 21,50 / 27,90). On avait chiffré une finition
 * de décoration là où un devis compte du blanc standard.
 *
 * 2. LE MAGASIN NE VOIT PAS LE CATALOGUE REÇU.
 *
 * Le devis interroge les prix venus du serveur avant les siens ; la page
 * Magasin, elle, lit les tables embarquées en direct. Le jour où le serveur
 * répond, les deux écrans annoncent deux prix pour le même article. La
 * maison connaît la règle : « une seule mesure, un seul endroit — deux
 * comptes du même nombre finissent toujours par diverger ».
 *
 * 3. LE PRIX DU PLAN N'ALLAIT PAS VOIR.
 *
 * Relevé du patron : « une récupération des prix mise à jour à chaque clic
 * sur le prix du devis sur le plan 2D ». La pastille ouvrait le devis, qui
 * ne redemandait qu'au bout d'un jour. On force désormais depuis ce
 * chemin-là : on a TOUCHÉ le prix, c'est qu'on veut le prix d'aujourd'hui.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  GAMMES,
  TARIFS_MECANISME,
  appliquerLesTarifs,
  tarifPlaque,
  type GammeId,
} from '../src/geometry/prix';
import { catalogueDuMagasin } from '../src/geometry/magasin';

const IDS = GAMMES.map((g) => g.id as GammeId);

/**
 * LE MÉCANISME DE RÉFÉRENCE D'UNE GAMME : la prise 16 A.
 *
 * On ne prend PAS le minimum de la table : elle contient aussi la boîte
 * d'encastrement (2,20 €), qui n'est pas un mécanisme mais le boîtier scellé
 * dans le mur. La première version de ce banc s'y est fait prendre et
 * accusait la Céliane d'être trop chère à 2,29 € — un banc qui compare deux
 * choses différentes ne prouve rien.
 *
 * La prise est le bon étalon : toutes les gammes en ont une, c'est l'article
 * qu'on pose le plus, et c'est le moins cher des vrais mécanismes.
 */
const mecaLePlusBasDe = (g: GammeId) => TARIFS_MECANISME[g].prise!.pu;

afterEach(() => appliquerLesTarifs(null));

describe('une plaque coûte ce que coûte un morceau de plastique', () => {
  it('elle ne dépasse jamais la MOITIÉ du mécanisme le moins cher de sa gamme', () => {
    /*
      C'EST L'INVARIANT QUI AURAIT ATTRAPÉ LE DÉFAUT, et il a une raison
      physique : une plaque de finition est une pièce de plastique moulé ; le
      mécanisme derrière elle porte des contacts en laiton, des ressorts et
      des bornes. Une plaque qui coûte plus que la moitié de son mécanisme,
      c'est qu'on a chiffré une finition de DÉCORATION — verre, laiton,
      relief — là où un devis compte du blanc standard.

      Passé sur l'ancien catalogue, il tombe sur Céliane (8,50 pour un
      mécanisme à 10,90), sur Odace (5,50 pour 8,90) et sur Mosaic (6,40
      pour 9,90) — les trois gammes fausses — et laisse passer dooxie et
      ovalis, les deux qui étaient justes. Il ne dit pas seulement « c'est
      faux » : il dit LESQUELLES.
    */
    for (const g of IDS) {
      const plaque = tarifPlaque(g, 1)!.pu;
      const plafond = mecaLePlusBasDe(g) / 2;
      // La gamme est NOMMÉE dans l'attendu : un banc qui tombe doit dire
      // laquelle, sans qu'on ait à relancer sous débogueur.
      expect(`${g} : ${plaque} <= ${plafond.toFixed(2)}`).toBe(
        `${g} : ${plaque <= plafond ? plaque : plafond.toFixed(2)} <= ${plafond.toFixed(2)}`,
      );
    }
  });

  it('et deux gammes ne s’écartent pas de plus du double sur la même plaque', () => {
    /*
      Le haut de gamme se paie sur le MÉCANISME — la prise Céliane vaut deux
      fois la dooxie — mais la plaque blanche de base, c'est du plastique
      moulé dans les deux cas. Un écart de plus du double entre la moins
      chère et la plus chère trahit une finition qui s'est glissée dans la
      table. (Ancien catalogue : 8,50 contre 2,50, soit 3,4 fois.)
    */
    for (let n = 1; n <= 4; n++) {
      const tous = IDS.map((g) => tarifPlaque(g, n)!.pu);
      const bas = Math.min(...tous);
      const haut = Math.max(...tous);
      expect(`${n} poste(s) : ${(haut / bas).toFixed(2)}`).toBe(
        `${n} poste(s) : ${(haut / bas).toFixed(2)}`,
      );
      expect(haut).toBeLessThanOrEqual(bas * 2);
    }
  });

  it('le prix du POSTE ne bouge pas d’une taille à l’autre', () => {
    /*
      LE RELEVÉ A CONTREDIT LE CATALOGUE, et il faut le dire : le commentaire
      de la table affirmait qu'« une plaque triple ne vaut pas trois plaques
      simples — la matière est partagée ». Le rayon dit le contraire. Céliane :
      2,29 puis 4,59 puis 6,99 puis 9,45, soit 2,29 / 2,30 / 2,33 / 2,36 le
      poste. Le prix est linéaire, et monte même très légèrement avec la
      taille — une grande plaque casse plus au transport.

      C'est cet écart au poste qui trahit une finition décorative glissée dans
      la table : l'ancienne ligne Céliane donnait 8,50 / 7,15 / 6,73 / 6,83 le
      poste, une dégringolade de vingt pour cent qu'aucun tarif de rayon ne
      fait.
    */
    for (const g of IDS) {
      const unite = tarifPlaque(g, 1)!.pu;
      for (let n = 2; n <= 5; n++) {
        const auPoste = tarifPlaque(g, n)!.pu / n;
        expect(`${g}/${n} : ${(auPoste / unite).toFixed(2)}`).toBe(
          `${g}/${n} : ${
            auPoste >= unite * 0.85 && auPoste <= unite * 1.15
              ? (auPoste / unite).toFixed(2)
              : 'hors bornes'
          }`,
        );
      }
    }
  });

  it('et le prix monte avec le nombre de postes, toujours', () => {
    for (const g of IDS) {
      for (let n = 2; n <= 5; n++) {
        expect(tarifPlaque(g, n)!.pu).toBeGreaterThan(tarifPlaque(g, n - 1)!.pu);
      }
    }
  });
});

describe('une plaque dit d’où sort son prix — c’est ce qui manquait', () => {
  it('les gammes vues en rayon citent l’enseigne', () => {
    /*
      Les mécanismes portaient leur provenance depuis le premier relevé ; les
      plaques n'étaient qu'un tableau de nombres nus. Rien ne disait qu'on ne
      les avait jamais vérifiées — et c'est pour ça qu'elles sont restées
      fausses pendant que tout le reste se corrigeait.
    */
    for (const g of ['dooxie', 'ovalis', 'odace', 'celiane'] as GammeId[]) {
      expect(tarifPlaque(g, 1)!.source).toMatch(/castorama/i);
      // Daté au JOUR : on sait exactement quand on est allé voir.
      expect(tarifPlaque(g, 1)!.releve).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('et Mosaic avoue être estimée : elle ne se vend pas en grande surface', () => {
    /*
      Le relevé l'a confirmé : Castorama n'affiche qu'un seul article Mosaic
      blanc, vendu par un tiers. C'est une gamme de distributeur
      professionnel. Elle reste au catalogue — elle se pose beaucoup en
      tertiaire — mais son prix ne peut pas prétendre avoir été vu en rayon.
    */
    expect(tarifPlaque('mosaic', 1)!.source).not.toMatch(/castorama/i);
    expect(tarifPlaque('mosaic', 1)!.source).toMatch(/valider|estimation/i);
  });
});

describe('le magasin et le devis chiffrent le même article au même prix', () => {
  const puDuMagasin = (gamme: GammeId, code: string) =>
    catalogueDuMagasin(gamme).find((a) => a.code === code)?.tarif.pu ?? null;

  it('un prix reçu du serveur atteint AUSSI la page Magasin', () => {
    /*
      Le devis interrogeait le catalogue reçu, le magasin lisait les tables
      embarquées : le jour où le serveur répond, deux écrans annoncent deux
      prix pour le même article, et l'électricien ne sait plus lequel croire.
      « Une seule mesure, un seul endroit. »
    */
    appliquerLesTarifs({
      version: 'banc-1',
      releve: '2026-09-05',
      source: 'Castorama',
      prix: { 'plaque-celiane-1': 2.29, 'meca-celiane-prise': 10.9 },
    });
    expect(puDuMagasin('celiane', 'plaque-1')).toBe(2.29);
    expect(puDuMagasin('celiane', 'meca-prise')).toBe(10.9);
  });

  it('la clé porte la GAMME : un prix Céliane ne repeint pas la dooxie', () => {
    appliquerLesTarifs({
      version: 'banc-2',
      releve: '2026-09-05',
      source: 'Castorama',
      prix: { 'plaque-celiane-1': 2.29 },
    });
    expect(puDuMagasin('dooxie', 'plaque-1')).toBe(tarifPlaque('dooxie', 1)!.pu);
    expect(puDuMagasin('dooxie', 'plaque-1')).not.toBe(2.29);
  });

  it('ce que le catalogue reçu ignore garde le prix embarqué', () => {
    /*
      Un catalogue qui ne connaîtrait que le cuivre ne doit pas effacer
      l'appareillage : c'est ce qui permet de le remplir rayon par rayon,
      sans jamais casser un devis en cours de route.
    */
    appliquerLesTarifs({
      version: 'banc-3',
      releve: '2026-09-05',
      source: 'Castorama',
      prix: { 'icta-20': 30.9 },
    });
    expect(puDuMagasin('celiane', 'plaque-3')).toBe(tarifPlaque('celiane', 3)!.pu);
  });

  it('et un article reçu porte l’enseigne et le jour du serveur, pas les nôtres', () => {
    appliquerLesTarifs({
      version: 'banc-4',
      releve: '2026-09-05',
      source: 'Castorama',
      prix: { 'plaque-celiane-2': 4.59 },
    });
    const a = catalogueDuMagasin('celiane').find((x) => x.code === 'plaque-2')!;
    expect(a.tarif.source).toBe('Castorama');
    expect(a.tarif.releve).toBe('2026-09-05');
  });
});

describe('toucher le prix sur le plan va VRAIMENT voir', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('la pastille du plan demande une vérification forcée', () => {
    /*
      Relevé du patron : « mise à jour à chaque clic sur le prix du devis sur
      le plan 2D ». La pastille ouvrait le devis, qui ne redemandait au
      serveur qu'au bout d'un jour — on pouvait donc toucher le prix dix fois
      sans que rien n'aille voir. On a TOUCHÉ le prix : c'est qu'on veut
      celui d'aujourd'hui.
    */
    expect(lire('src/screens/ResultScreen.tsx')).toMatch(
      /<DevisPastille[\s\S]{0,300}forcerTarifs/,
    );
    /*
      ET LE DEVIS LA CONSOMME. Le drapeau se baisse à la lecture : oublié
      levé, il forcerait une visite au serveur à CHAQUE ouverture du devis, y
      compris celles où personne n'a touché le prix — c'est-à-dire six
      secondes d'attente possibles à chaque coup d'œil sur un ticket.
    */
    const devis = lire('src/screens/DevisScreen.tsx');
    expect(devis).toContain('consommerLaDemandeDeTarifs');
    expect(devis).toContain('verifier(forcer)');
  });
});
