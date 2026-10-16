/**
 * LE PDF QUE LIT LE CLIENT — revue « Gérard », électricien.
 *
 * 1. « Prix des fournitures relevés TTC en enseigne (TVA 20 %), ramenés hors
 *    taxes » : le client lisait que l'artisan revend au prix de la grande
 *    surface, sans marge. Ni enseigne, ni « prix relevé » sur le PDF client.
 * 2. « Main-d'œuvre estimée… à confirmer après visite » : l'artisan envoie
 *    son devis APRÈS la visite. Quand c'est lui qui l'envoie (mode
 *    électricité), la phrase ne le dit plus.
 */
import { buildDevisPdf, type DevisPourPdf } from '../src/export/pdf';
import type { Devis, LigneDevis } from '../src/geometry/devis';
import { estimerLaPose } from '../src/geometry/mainDOeuvre';
import { GAMMES } from '../src/geometry/prix';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const lignes: LigneDevis[] = [
  { famille: 'Prises', code: 'prise', libelle: 'Prise 16 A', quantite: 4, unite: 'u', pu: 12, total: 48 },
  { famille: 'Tableau', code: 'disj-16', libelle: 'Disjoncteur 16 A', quantite: 2, unite: 'u', pu: 9, total: 18 },
];
const devis: Devis = {
  gamme: GAMMES[0].id,
  version: 'test',
  lignes,
  total: 66,
  totalPublic: 70,
  parFamille: [],
  sansPrix: [],
  exclusions: ['Luminaires : cela dépend des envies.', 'Main-d’œuvre : ce devis chiffre la fourniture.'],
  legende: [],
};
const pose = estimerLaPose(
  [{ id: 'p', kind: 'prise', wallId: 'n', along: 1, height: 0.3, side: 1 }],
  [],
  2,
  { taux: 45, chantier: 'renovation' },
);
const pdf = (extra: Partial<DevisPourPdf> = {}) =>
  latin1(
    buildDevisPdf({
      numero: 'D-2026-0001',
      date: new Date(2026, 9, 16),
      chantier: 'Appartement Martin',
      client: 'Claire Martin',
      devis,
      pose,
      ...extra,
    }),
  );

it('ne dit ni enseigne, ni prix relevé', () => {
  const src = pdf({ parLArtisan: true });
  expect(src).not.toMatch(/enseigne/i);
  expect(src).not.toMatch(/relev/i);
  expect(src).not.toMatch(/grande surface|magasin/i);
});

it('l’artisan qui envoie ne remet pas sa main-d’œuvre « à confirmer après visite »', () => {
  expect(pdf({ parLArtisan: true })).not.toContain('à confirmer après visite');
  // Hors mode électricité, la réserve reste : personne n'a vu le chantier.
  expect(pdf({ parLArtisan: false })).toContain('à confirmer après visite');
});
