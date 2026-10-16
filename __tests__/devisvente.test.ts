/**
 * LE PRIX DE VENTE DE L'ARTISAN — relevé d'un électricien artisan (2
 * salariés, sur Obat et Batappli) : « je paierais pour de vrai si… ».
 *
 * 1. Prix de vente HT = prix d'achat × coefficient, quand son tarif pro
 *    connaît l'article — et seulement alors ; sinon le prix public ramené HT.
 * 2. Des lignes libres (fourniture, main-d'œuvre, forfait) dans le total.
 * 4. Des heures de pose corrigées à la main.
 * 5. Un acompte en pour cent, et son montant TTC.
 * 6. TVA 20 %, 10 % ou 5,5 %, choisie pour le devis.
 *
 * Un seul calcul pour tout cela : `prixDuDevis` → `vendreLeDevis`.
 */
import {
  POSE_VIDE,
  estimerLaPose,
  pourcent,
  prixDAchat,
  vendreLeDevis,
  type LigneLibre,
} from '../src/geometry/mainDOeuvre';

const lignes = [
  { famille: 'Prises', code: 'meca-prise', libelle: 'Prise 16 A', quantite: 2, unite: 'u', pu: 12, total: 24 },
  { famille: 'Tableau', code: 'disj-16', libelle: 'Disjoncteur 16 A', quantite: 1, unite: 'u', pu: 9, total: 9 },
  // Un prix tapé par l'artisan (15 € TTC de base, soit 12,50 € HT).
  { famille: 'Divers', code: 'boite', libelle: 'Boîte', quantite: 1, unite: 'u', pu: 15, total: 15, prixAjuste: true },
];
const devis = { lignes };
const pose = estimerLaPose(
  [{ id: 'p', kind: 'prise', wallId: 'n', along: 1, height: 0.3, side: 1 }],
  [],
  1,
  { taux: 45, chantier: 'renovation' },
);
const vente = (code: string, r: ReturnType<typeof vendreLeDevis>) => r.fournitures.find((v) => v.ligne.code === code)!;

describe('prix d’achat × coefficient', () => {
  it('s’applique à l’article dont le tarif pro donne un prix d’achat', () => {
    const r = vendreLeDevis(devis, pose, { prixAchat: { 'meca-prise': 5 }, coefficient: 1.3 });
    expect(vente('meca-prise', r)).toMatchObject({ puHt: 6.5, totalHt: 13, auCoefficient: true });
  });

  it('et SEULEMENT à lui : sans prix d’achat, le prix public ramené HT', () => {
    const r = vendreLeDevis(devis, pose, { prixAchat: { 'meca-prise': 5 }, coefficient: 1.3 });
    expect(vente('disj-16', r)).toMatchObject({ puHt: 7.5, totalHt: 7.5, auCoefficient: false });
  });

  it('sans coefficient, le prix d’achat ne change rien : comportement d’avant', () => {
    const sans = vendreLeDevis(devis, pose, { prixAchat: { 'meca-prise': 5 } });
    const rien = vendreLeDevis(devis, pose);
    expect(vente('meca-prise', sans)).toMatchObject({ puHt: 10, auCoefficient: false });
    expect(sans.totaux).toEqual(rien.totaux);
  });

  it('le prix tapé par l’artisan gagne toujours sur le coefficient', () => {
    const r = vendreLeDevis(devis, pose, { prixAchat: { boite: 2 }, coefficient: 1.3 });
    expect(vente('boite', r)).toMatchObject({ puHt: 12.5, auCoefficient: false });
  });

  it('le total des fournitures est la somme des lignes HT', () => {
    const r = vendreLeDevis(devis, pose, { prixAchat: { 'meca-prise': 5 }, coefficient: 1.3 });
    expect(r.totaux.fournituresHt).toBe(13 + 7.5 + 12.5);
  });

  it('prixDAchat lit le tarif importé par sa clé, et ignore ce qu’il ne connaît pas', () => {
    const tarif = { prix: { 'meca-g-prise': { pu: 3.1 }, 'disj-16': { pu: 0 } } };
    expect(prixDAchat(lignes, (c) => (c.startsWith('meca-') ? `meca-g-${c.slice(5)}` : c), tarif)).toEqual({
      'meca-prise': 3.1,
    });
    expect(prixDAchat(lignes, (c) => c, null)).toEqual({});
  });
});

describe('les lignes libres', () => {
  const libres: LigneLibre[] = [
    { id: 'a', designation: 'Consuel', quantite: 1, unite: 'forfait', puHt: 150, type: 'forfait' },
    { id: 'b', designation: 'Dépose ancien tableau', quantite: 2, unite: 'h', puHt: 45, type: 'mainDOeuvre' },
    { id: 'c', designation: 'Gaine ICTA 20', quantite: 3, unite: 'couronne', puHt: 4, type: 'fourniture' },
  ];

  it('entrent au total, chacune dans sa partie', () => {
    const avant = vendreLeDevis(devis, pose).totaux;
    const r = vendreLeDevis(devis, pose, { lignesLibres: libres });
    expect(r.libres.map((l) => l.totalHt)).toEqual([150, 90, 12]);
    expect(r.totaux.forfaitsHt).toBe(150);
    expect(r.totaux.poseHt).toBe(Math.round((avant.poseHt + 90) * 100) / 100);
    expect(r.totaux.fournituresHt).toBe(Math.round((avant.fournituresHt + 12) * 100) / 100);
    expect(r.totaux.ht).toBe(Math.round((avant.ht + 252) * 100) / 100);
  });

  it('un forfait sans pose chiffrée prend la TVA du chantier ; du matériel seul reste à 20 %', () => {
    const renovation = { ...POSE_VIDE, tauxTva: 0.1 };
    expect(vendreLeDevis({ lignes: [] }, renovation, { lignesLibres: [libres[0]] }).totaux.tauxTva).toBe(0.1);
    expect(vendreLeDevis({ lignes: [] }, renovation, { lignesLibres: [libres[2]] }).totaux.tauxTva).toBe(0.2);
  });
});

describe('les heures corrigées', () => {
  it('remplacent celles du barème pour leur famille, et la pose suit', () => {
    const famille = pose.lignes[0].famille;
    const r = vendreLeDevis(devis, pose, { heures: { [famille]: 3 } });
    const l = r.pose.lignes.find((x) => x.famille === famille)!;
    expect(l).toMatchObject({ heures: 3, corrigee: true });
    const autres = pose.lignes.filter((x) => x.famille !== famille).reduce((t, x) => t + x.heures, 0);
    expect(r.pose.heures).toBe(3 + autres);
    expect(r.pose.ht).toBe(Math.round((3 + autres) * 45 * 100) / 100);
    expect(r.totaux.poseHt).toBe(r.pose.ht);
  });
});

describe('la TVA du devis', () => {
  it('5,5 % choisie à la main : une seule TVA, au taux choisi', () => {
    const r = vendreLeDevis(devis, pose, { tva: 0.055 });
    expect(r.totaux.tauxTva).toBe(0.055);
    expect(r.totaux.tva).toBe(Math.round(r.totaux.ht * 0.055 * 100) / 100);
    expect(r.totaux.ttc).toBe(Math.round((r.totaux.ht + r.totaux.tva) * 100) / 100);
    // La pose affiche la même TVA que le total.
    expect(r.pose.tauxTva).toBe(0.055);
  });

  it('un taux inconnu est ignoré : celui du chantier', () => {
    expect(vendreLeDevis(devis, pose, { tva: 0.07 }).totaux.tauxTva).toBe(pose.tauxTva);
  });

  it('« 5,5 % » s’écrit 5,5 %, pas 6 %', () => {
    expect(pourcent(0.055)).toBe('5,5 %');
    expect(pourcent(0.1)).toBe('10 %');
    expect(pourcent(0.3)).toBe('30 %');
  });
});

describe('l’acompte', () => {
  it('se compte en pour cent du TTC', () => {
    const r = vendreLeDevis(devis, pose, { acompte: 30 });
    expect(r.totaux.tauxAcompte).toBe(30);
    expect(r.totaux.acompte).toBe(Math.round(r.totaux.ttc * 0.3 * 100) / 100);
  });

  it('sans acompte, rien', () => {
    expect(vendreLeDevis(devis, pose).totaux.acompte).toBe(0);
  });
});
