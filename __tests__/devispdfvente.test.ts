/**
 * LE PDF DU CLIENT, AU PRIX DE L'ARTISAN — relevé d'un électricien artisan.
 *
 * Le PDF imprime le prix de VENTE (achat × coefficient quand il s'applique),
 * jamais le prix d'achat ni le coefficient ; les lignes libres, l'acompte en
 * euros, la validité et les conditions de paiement réglées dans « Mon
 * entreprise » ; et une mention de TVA réduite prudente, sans règle non
 * vérifiée (« attestation du client requise » est parti).
 */
import { buildDevisPdf } from '../src/export/pdf';
import type { Devis, LigneDevis } from '../src/geometry/devis';
import { estimerLaPose, vendreLeDevis } from '../src/geometry/mainDOeuvre';
import { GAMMES } from '../src/geometry/prix';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
const E = String.fromCharCode(0x80);
const enEuros = (v: number) => {
  const [e, c] = v.toFixed(2).split('.');
  return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${c} ${E}`;
};

const lignes: LigneDevis[] = [
  { famille: 'Prises', code: 'meca-prise', libelle: 'Prise 16 A', quantite: 4, unite: 'u', pu: 12, total: 48 },
  { famille: 'Tableau', code: 'disj-16', libelle: 'Disjoncteur 16 A', quantite: 2, unite: 'u', pu: 9, total: 18 },
];
const devis: Devis = {
  gamme: GAMMES[0].id,
  version: 'test',
  lignes,
  total: 66,
  totalPublic: 66,
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
const prix = vendreLeDevis(devis, pose, {
  // 7,77 € HT d'achat, vendu × 1,3 : 10,10 € HT.
  prixAchat: { 'meca-prise': 7.77 },
  coefficient: 1.3,
  lignesLibres: [
    { id: 'a', designation: 'Consuel', quantite: 1, unite: 'forfait', puHt: 160, type: 'forfait' },
    { id: 'b', designation: 'Dépose ancien tableau', quantite: 1.5, unite: 'h', puHt: 45, type: 'mainDOeuvre' },
  ],
  tva: 0.055,
  acompte: 30,
});
const src = latin1(
  buildDevisPdf({
    numero: 'D-2026-0012',
    date: new Date(2026, 9, 16),
    chantier: 'Maison Durand',
    client: 'Paul Durand',
    devis,
    pose,
    prix,
    conditions: { validite: 45, paiement: 'Solde à 30 jours fin de mois.' },
    parLArtisan: true,
  }),
);

it('imprime le prix de vente, ni le prix d’achat ni le coefficient', () => {
  expect(src).toContain(`(${enEuros(10.1)}) Tj`);
  expect(src).toContain(`(${enEuros(40.4)}) Tj`);
  expect(src).not.toContain('7,77');
  expect(src).not.toMatch(/coef/i);
  expect(src).not.toMatch(/achat/i);
  expect(src).not.toMatch(/× ?1,3/);
});

it('les lignes libres sont au PDF et dans son total', () => {
  expect(src).toContain('(Consuel) Tj');
  expect(src).toContain('(Dépose ancien tableau) Tj');
  expect(src).toContain('(Forfaits HT) Tj');
  expect(src).toContain(`(${enEuros(160)}) Tj`);
  expect(src).toContain(`(${enEuros(67.5)}) Tj`);
  // Le même TOTAL TTC que l'écran : celui de `prixDuDevis`.
  expect(src).toContain(`(${enEuros(prix.totaux.ttc)}) Tj`);
  expect(prix.totaux.forfaitsHt).toBe(160);
});

it('l’acompte en pour cent et en euros TTC', () => {
  expect(src).toContain('(Acompte 30 % à la commande) Tj');
  expect(src).toContain(`(${enEuros(prix.totaux.acompte)} TTC) Tj`);
});

it('la validité et les conditions de paiement de l’entreprise', () => {
  expect(src).toContain('Valable 45 jours, jusqu\u0092au 30/11/2026');
  expect(src).not.toContain('Valable un mois');
  expect(src).toContain('Conditions de paiement : Solde à 30 jours fin de mois.');
});

it('TVA 5,5 %, avec une mention prudente', () => {
  expect(src).toContain('(TVA 5,5 %) Tj');
  // Les parenthèses s'échappent dans le flux PDF.
  expect(src).toContain('TVA à taux réduit \\(5,5 %\\) sous réserve des conditions d\u0092éligibilité');
  expect(src).toContain('logement achevé depuis plus de 2 ans');
  expect(src).not.toMatch(/attestation/i);
});

it('sans le prix de l’écran, le PDF revend au prix public et garde 30 jours', () => {
  const seul = latin1(buildDevisPdf({ numero: 'D-1', date: new Date(2026, 0, 1), chantier: 'X', devis, pose }));
  // 12 € TTC de base : 10,00 € HT l'unité.
  expect(seul).toContain(`(${enEuros(10)}) Tj`);
  expect(seul).toContain('Valable 30 jours');
  expect(seul).not.toContain('Acompte');
});
