/**
 * LES TABLEAUX CHIFFRÉS DISENT LA MÊME CHOSE PARTOUT — relecture
 * « tableaux chiffrés » du PDF :
 *   — un seul coffret : le devis en commandait deux rangées, la liste du
 *     matériel en dessinait trois, la feuille du tableau en annonçait quatre ;
 *   — la main-d'œuvre est la somme de ses lignes, au centime ;
 *   — l'acompte s'écrit depuis son taux, avec son montant et le solde ;
 *   — le bordereau additionne les mêmes mètres que le tirage ;
 *   — le devis aligne ses nombres et met le « HT » une fois, en en-tête.
 */
import type { Circuit, Differential } from '../src/geometry/nfc15100';
import { coffretDuPlan, planDifferentials } from '../src/geometry/nfc15100';
import { remplirLeCoffret, tailleDuCoffret } from '../src/geometry/coffret';
import { tableauDepuisLePlan } from '../src/geometry/tableauFini';
import { boardRows, buildDevisPdf } from '../src/export/pdf';
import { vendreLeDevis, type Pose } from '../src/geometry/mainDOeuvre';
import { buyingList, type PullRow } from '../src/geometry/conduits';
import type { Wire } from '../src/geometry/schema';
import type { LigneDevis, Devis } from '../src/geometry/devis';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const circuit = (id: string, label: string, nature: Circuit['nature'], breaker: number | null): Circuit =>
  ({ id, label, nature, points: 2, section: 2.5, breaker, rooms: ['Séjour'], fixtureIds: [] }) as unknown as Circuit;

describe('un seul coffret, trois documents', () => {
  const circuits = [
    circuit('c1', 'Four', 'specialise', 20),
    circuit('c2', 'Lave-vaisselle', 'specialise', 20),
    circuit('c3', 'Lave-linge', 'specialise', 20),
    circuit('c4', 'Cuisson', 'cuisson', 32),
    circuit('c5', 'Prises cuisine 1', 'prises', 20),
    circuit('c6', 'Prises 2', 'prises', 20),
    circuit('c7', 'Prises 1', 'prises', 20),
    circuit('c8', 'Éclairage 1', 'eclairage', 16),
    circuit('c9', 'Courants faibles', 'vdi', null),
  ];
  const diffs: Differential[] = planDifferentials(circuits, 45);

  it('chaque différentiel ouvre sa rangée, la réserve de 20 % tient', () => {
    expect(remplirLeCoffret([6, 4, 4])).toEqual([6, 4, 4]);
    expect(tailleDuCoffret([6, 4, 4])).toEqual({ rangees: 3, modules: 14 });
    // Un différentiel et onze disjoncteurs : la rangée déborde.
    expect(remplirLeCoffret([15])).toEqual([13, 2]);
    // Treize modules sur une rangée de treize : pas de réserve, une de plus.
    expect(tailleDuCoffret([13]).rangees).toBe(2);
    // Les contacteurs prennent la place libre avant d'ouvrir une rangée.
    expect(remplirLeCoffret([12], 3)).toEqual([13, 2]);
    // Un coffret du commerce a quatre rangées au plus.
    expect(tailleDuCoffret([13, 13, 13, 13, 13]).rangees).toBe(4);
  });

  it('le dessin de la liste, la feuille du tableau et la règle disent le même nombre de rangées', () => {
    const rangees = coffretDuPlan(circuits, diffs).rangees;
    expect(rangees).toBeGreaterThan(0);
    expect(boardRows({ circuits, differentials: diffs } as never)).toHaveLength(rangees);
    expect(tableauDepuisLePlan(circuits, diffs).rangees).toBe(rangees);
  });

  it('les contacteurs ont leur module au dessin, à la même règle', () => {
    const organes = [{ code: 'contacteur-jn' as const, label: 'Contacteur jour/nuit 20 A', spec: '', quantity: 2, marque: 'HC' }];
    const rows = boardRows({ circuits, differentials: diffs } as never, organes);
    expect(rows.flatMap((r) => r.modules).filter((m) => m.marque === 'HC')).toHaveLength(2);
    expect(rows).toHaveLength(coffretDuPlan(circuits, diffs, organes).rangees);
  });
});

describe('la main-d’œuvre est la somme de ses lignes', () => {
  it('à 42,50 €/h, quatre lignes au quart d’heure font 85,02 €, pas 85,00 €', () => {
    const pose: Pose = {
      lignes: [
        { famille: 'Prises', quantite: 1, heures: 0.25 },
        { famille: 'Commandes', quantite: 1, heures: 0.25 },
        { famille: 'Divers', quantite: 1, heures: 0.25 },
        { famille: 'Tableau', quantite: 1, heures: 1.25 },
      ],
      heures: 2,
      taux: 42.5,
      ht: 85,
      tauxTva: 0.1,
      tva: 8.5,
      ttc: 93.5,
    };
    const prix = vendreLeDevis({ lignes: [] }, pose);
    const lignes = prix.pose.lignes.map((l) => l.totalHt);
    expect(lignes).toEqual([10.63, 10.63, 10.63, 53.13]);
    expect(prix.totaux.poseHt).toBeCloseTo(85.02, 9);
  });
});

describe('le devis', () => {
  const ligne = (i: number, extra: Partial<LigneDevis> = {}): LigneDevis => ({
    famille: i % 2 ? 'Prises' : 'Tableau',
    code: `art-${i}`,
    libelle: `Article ${i}`,
    quantite: 2,
    unite: 'u',
    pu: 12,
    total: 24,
    ...extra,
  });
  const devis = {
    lignes: [ligne(1), ligne(2), ligne(3), ligne(4, { unite: 'cour. 100 m', quantite: 1, total: 12 })],
    exclusions: [],
  } as unknown as Devis;
  const pose: Pose = {
    lignes: [{ famille: 'Prises', quantite: 4, heures: 2.5 }],
    heures: 2.5,
    taux: 45,
    ht: 112.5,
    tauxTva: 0.1,
    tva: 11.25,
    ttc: 123.75,
  };
  const prix = vendreLeDevis(devis, pose, { acompte: 30 });
  const src = latin1(
    buildDevisPdf({
      numero: 'D-1',
      date: new Date(2026, 9, 19),
      chantier: 'Essai',
      devis,
      pose,
      prix,
      parLArtisan: true,
      conditions: { paiement: 'Acompte de 50 % à la signature.' },
      entreprise: { nom: 'Dupont', formeJuridique: 'SARL au capital de 10 000 €', tvaIntra: 'FR 12 123456789', mediateur: 'CM2C' },
    }),
  );

  it('le nombre et son unité dans deux colonnes, le « HT » une fois', () => {
    expect(src).toContain('(Unité) Tj');
    expect(src).toContain('(cour. 100 m) Tj');
    expect(src).not.toContain('HT/h');
    expect(src).not.toMatch(/€ HT\) Tj/);
  });

  it('un sous-total par rayon', () => {
    expect(src).toContain('(Sous-total prises) Tj');
    expect(src).toContain('(Sous-total tableau) Tj');
  });

  it('l’acompte écrit depuis son taux, avec son montant et le solde ; le texte libre contradictoire cède', () => {
    const t = prix.totaux;
    expect(src).toContain('(Solde à la réception des travaux) Tj');
    const solde = Math.round((t.ttc - t.acompte) * 100) / 100;
    const euros = (v: number) => {
      const [e, c] = v.toFixed(2).split('.');
      return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${c}`;
    };
    expect(src).toContain(`Acompte de 30 % à la commande, soit ${euros(t.acompte)}`);
    expect(src).toContain(`solde de ${euros(solde)}`);
    expect(src).not.toContain('50 %');
  });

  it('les mentions de l’entreprise, le début des travaux et les deux signatures', () => {
    expect(src).toContain('SARL au capital de 10 000');
    expect(src).toContain('TVA intracom. FR 12 123456789');
    expect(src).toContain('Médiateur de la consommation : CM2C.');
    expect(src).toContain('Début des travaux : à convenir');
    expect(src).toContain('Pour l’entreprise'.replace('’', '\u0092'));
    expect(src).toContain('Bon pour accord');
  });
});

describe('le bordereau additionne les mêmes mètres que le tirage', () => {
  const brins = (section: number): Wire[] => [
    { role: 'phase', color: '#B8352A', label: 'Phase', section },
    { role: 'neutre', color: '#2E6FD6', label: 'Neutre', section },
    { role: 'terre', color: '#5A9E31', label: 'Terre', section },
  ];
  const ligneDeTirage = (id: string, cable: number): PullRow => ({
    circuitId: id,
    label: id,
    section: 2.5,
    nature: 'specialise' as const,
    brins: brins(2.5),
    fils: 3,
    conduit: 20,
    troncons: [{ id: `${id}-t`, conduit: cable, cable, role: 'autre' as const }],
    runs: 1,
    conduitLength: Math.ceil(cable),
    cableLength: Math.ceil(cable),
    approx: false,
    protection: '20 A',
  });

  it('chaque circuit arrondi au mètre supérieur, puis additionné', () => {
    const rows = [ligneDeTirage('a', 9.4), ligneDeTirage('b', 10.3), ligneDeTirage('c', 6.2)];
    const phase = buyingList(rows, [], []).find((l) => l.code === 'fil-2.5-phase')!;
    // Le tirage imprime 10 + 11 + 7 = 28 m ; la note dit 28 m, pas 26.
    expect(phase.note).toMatch(/^28 m de parcours/);
  });

  it('un départ trop long dit sa longueur, au décimètre supérieur', () => {
    const six: PullRow = { ...ligneDeTirage('cuisson', 10.04), section: 6, brins: brins(6), conduit: 25 };
    const phase = buyingList([six], [], []).find((l) => l.code === 'fil-6-phase')!;
    expect(phase.note).toContain('départ de 10,1 m, plus long que la couronne de 10 m');
  });
});
