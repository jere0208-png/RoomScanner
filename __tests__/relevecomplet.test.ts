/**
 * LE RELEVÉ COMPLET DU 5 SEPTEMBRE 2026 — une seule date, partout.
 *
 * Relevé du patron : « vas-y fais tout ça. Mais vérifie bien, il est
 * impossible que l'interrupteur différentiel était à 219 € — c'est hors norme
 * comme prix pour ça. Les prix doivent absolument être exacts. »
 *
 * Il avait raison sur les deux points. Les 219 € venaient d'un résumé de
 * recherche automatique, qui mélangeait des produits ; le vrai prix, lu sur
 * la page produit, est de 49,90 €. Et la leçon vaut d'être gravée : **seule
 * une page produit fait foi**. Au cours de ce relevé, une recherche a
 * annoncé 72,90 € pour un câble à 89,90 €, 4,90 € pour un peigne à 5,19 €, et
 * 219 € pour un différentiel à 49,90 €. Trois fois sur trois, la liste avait
 * tort.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE MESURE CE BANC.
 *
 * 1. LE CATALOGUE EMBARQUÉ NE PORTE PLUS QU'UNE SEULE DATE DE RELEVÉ. C'était
 *    la demande : « tous les prix ne sont pas à jour, des prix s'affichent à
 *    la date d'aujourd'hui mais d'autres restent au 28 août ». Une campagne,
 *    une date — et le bandeau du devis peut enfin l'annoncer sans fourchette.
 *
 * 2. CE QU'ON N'A PAS PU REVOIR EST MARQUÉ COMME ESTIMÉ, jamais laissé passer
 *    pour un relevé périmé. Deux articles sont dans ce cas : l'obturateur, qui
 *    n'est plus affiché qu'en déstockage, et les bornes Wago série 273, qui ne
 *    sont plus vendues. La maison refuse les prix de fin de série depuis le
 *    premier relevé — « le devis d'un chantier qui commence dans trois
 *    semaines ne peut pas s'appuyer dessus ».
 *
 * 3. LES GARDE-FOUS QUI AURAIENT CRIÉ devant 219 €. Un interrupteur
 *    différentiel de logement tient dans une fourchette étroite, et il coûte
 *    forcément plus qu'un disjoncteur modulaire. Ce ne sont pas des goûts :
 *    c'est ce qu'il y a dans le boîtier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  GAMMES,
  RELEVE_RAYON,
  TARIFS_COMMUNS,
  TARIFS_MECANISME,
  tarifPlaque,
  type GammeId,
  type Tarif,
} from '../src/geometry/prix';

/** Un prix a-t-il été VU en rayon ? La date au jour est la marque. */
const releve = (t: Tarif) => /^\d{4}-\d{2}-\d{2}$/.test(t.releve);

/** Tous les prix du catalogue embarqué, article par article. */
const tousLesTarifs = (): { cle: string; tarif: Tarif }[] => {
  const out: { cle: string; tarif: Tarif }[] = [];
  for (const [cle, tarif] of Object.entries(TARIFS_COMMUNS)) {
    out.push({ cle, tarif });
  }
  for (const g of GAMMES.map((x) => x.id as GammeId)) {
    for (const [kind, tarif] of Object.entries(TARIFS_MECANISME[g])) {
      if (tarif) out.push({ cle: `meca-${g}-${kind}`, tarif });
    }
    for (let n = 1; n <= 5; n++) {
      const t = tarifPlaque(g, n);
      if (t) out.push({ cle: `plaque-${g}-${n}`, tarif: t });
    }
  }
  return out;
};

describe('une campagne, une date', () => {
  it('tous les prix VUS EN RAYON portent la même journée', () => {
    /*
      C'est la demande, mot pour mot : « des prix s'affichent à la date
      d'aujourd'hui mais d'autres restent par exemple au 28 août ». Deux
      dates dans un catalogue embarqué, c'est une campagne laissée à
      moitié — et le bandeau du devis devait alors annoncer une fourchette
      au lieu d'une date.
    */
    const jours = new Set(
      tousLesTarifs()
        .filter((x) => releve(x.tarif))
        .map((x) => x.tarif.releve),
    );
    expect([...jours]).toEqual([RELEVE_RAYON]);
  });

  it('et l’enseigne est citée sur chacun d’eux', () => {
    for (const { cle, tarif } of tousLesTarifs()) {
      if (!releve(tarif)) continue;
      expect(`${cle} : ${tarif.source}`).toBe(`${cle} : Castorama`);
    }
  });
});

describe('ce qu’on n’a pas pu revoir ne se fait pas passer pour un relevé', () => {
  it('l’obturateur redevient une estimation : il n’est plus qu’en déstockage', () => {
    /*
      La maison refuse les prix de fin de série depuis le premier relevé — le
      variateur dooxie et la prise TV Céliane ont été écartés pour la même
      raison. Un prix de déstockage n'est pas un prix courant, et le devis
      d'un chantier qui commence dans trois semaines ne peut pas s'appuyer
      dessus.
    */
    expect(releve(TARIFS_COMMUNS.obturateur)).toBe(false);
    expect(TARIFS_COMMUNS.obturateur.source).toMatch(/valider|estimation/i);
  });

  it('les bornes Wago aussi : la série 273 n’est plus vendue', () => {
    expect(releve(TARIFS_COMMUNS['wago-2'])).toBe(false);
    expect(TARIFS_COMMUNS['wago-2'].source).toMatch(/valider|estimation/i);
  });
});

describe('les garde-fous qui auraient crié devant 219 euros', () => {
  it('un interrupteur différentiel de logement tient entre 30 et 120 euros', () => {
    /*
      Relevé du patron : « il est impossible que l'interrupteur différentiel
      était à 219 € — c'est hors norme comme prix pour ça ». Il a raison, et
      la borne se pose : un différentiel 40 A 30 mA de tableau domestique est
      un article de grande série. Au-delà de cent vingt euros, on a recopié
      autre chose — un modèle HPI, un différentiel de tête, ou un produit
      d'une liste qui n'était pas celui qu'on lisait.
    */
    for (const cle of ['diff-AC', 'diff-A']) {
      const pu = TARIFS_COMMUNS[cle].pu;
      expect(`${cle} : ${pu}`).toBe(
        `${cle} : ${pu >= 30 && pu <= 120 ? pu : 'hors fourchette'}`,
      );
    }
  });

  it('le type A coûte plus cher que le type AC — il détecte davantage', () => {
    // Le type A voit les défauts à composante continue : lave-linge, plaque
    // à induction, borne de recharge. C'est un appareil de plus, pas un
    // choix de couleur, et le prix le suit toujours.
    expect(TARIFS_COMMUNS['diff-A'].pu).toBeGreaterThan(
      TARIFS_COMMUNS['diff-AC'].pu,
    );
  });

  it('et un disjoncteur modulaire coûte moins qu’un différentiel', () => {
    /*
      Un disjoncteur coupe sur surintensité ; un différentiel mesure en
      permanence l'écart entre phase et neutre. Le second contient un tore et
      une électronique que le premier n'a pas. L'ordre ne s'inverse pas.
    */
    const moinsCher = Math.min(TARIFS_COMMUNS['diff-AC'].pu, TARIFS_COMMUNS['diff-A'].pu);
    for (const cle of ['disj-10', 'disj-16', 'disj-20', 'disj-32']) {
      expect(`${cle} : ${TARIFS_COMMUNS[cle].pu}`).toBe(
        `${cle} : ${
          TARIFS_COMMUNS[cle].pu < moinsCher
            ? TARIFS_COMMUNS[cle].pu
            : 'plus cher qu’un différentiel'
        }`,
      );
    }
  });

  it('le coffret grandit avec ses rangées, sans exception', () => {
    for (let n = 2; n <= 4; n++) {
      expect(TARIFS_COMMUNS[`coffret-${n}`].pu).toBeGreaterThan(
        TARIFS_COMMUNS[`coffret-${n - 1}`].pu,
      );
    }
  });
});
