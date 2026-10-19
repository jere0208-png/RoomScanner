/**
 * L'ENTREPRISE DE L'ARTISAN — son nom et ses coordonnées, en tête du dossier.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le PDF n'avait ni
 * nom, ni coordonnées de l'artisan, et la marque EchoPlan y était figée.
 * Pour un électricien qui remet le dossier à son client, c'est sa signature
 * qui doit y paraître, pas celle de l'outil.
 *
 * UNE PRÉFÉRENCE DE L'APPAREIL, comme le mode d'usage (`usage.ts`) : c'est
 * l'artisan qui a une entreprise, pas le logement. Gardée sur le disque,
 * prise au moment où l'on s'en sert.
 */
import { create } from 'zustand';

export const CLE_ENTREPRISE = 'echoplan.entreprise.v1';

export interface Entreprise {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  siret: string;
  /**
   * L'ASSURANCE DÉCENNALE — assureur, numéro de contrat, zone couverte. Une
   * mention obligatoire sur le devis d'un artisan du bâtiment (revue
   * « Nadia » : elle n'existait nulle part).
   */
  decennale: string;
  /*
    LES MENTIONS DU DEVIS — relecture « structure » du PDF : un devis
    d'artisan porte aussi sa forme juridique et son capital, son
    immatriculation (RCS ou répertoire des métiers), son numéro de TVA
    intracommunautaire et le médiateur de la consommation qu'il a désigné.
    Facultatives : imprimées dès qu'elles sont remplies.
  */
  /** « SARL au capital de 10 000 € ». */
  formeJuridique: string;
  /** « RCS Lyon 123 456 789 » ou « RM 123 456 789 ». */
  immatriculation: string;
  /** « FR 12 123456789 ». */
  tvaIntra: string;
  /** Le médiateur de la consommation : nom et site. */
  mediateur: string;
}

export const ENTREPRISE_VIDE: Entreprise = {
  nom: '',
  adresse: '',
  telephone: '',
  email: '',
  siret: '',
  decennale: '',
  formeJuridique: '',
  immatriculation: '',
  tvaIntra: '',
  mediateur: '',
};

/**
 * LES CONDITIONS DE SES DEVIS — relevé d'un électricien artisan (2 salariés,
 * sur Obat et Batappli) : « je paierais pour de vrai si… » le devis vendait
 * à SON coefficient, demandait SON acompte, avec SA validité et SES
 * conditions de paiement. Comme le nom de l'entreprise, ce sont des
 * habitudes de l'artisan, pas d'un chantier : réglées une fois.
 */
export interface ConditionsDevis {
  /**
   * PRIX DE VENTE HT = PRIX D'ACHAT × COEFFICIENT, sur les articles que son
   * tarif pro reconnaît (voir `vendreLeDevis`). Vide : le prix public.
   * Jamais imprimé.
   */
  coefficient: number | null;
  /** L'acompte à la commande, en pour cent du TTC. */
  acompte: number;
  /** La validité du devis, en jours. */
  validite: number;
  /** Les conditions de paiement, en une phrase. */
  paiement: string;
}

export const CONDITIONS_PAR_DEFAUT: ConditionsDevis = {
  coefficient: null,
  acompte: 30,
  validite: 30,
  paiement: 'Acompte à la signature, solde à la fin des travaux.',
};

/** Bornes : un coefficient sous 1 vend à perte, au-delà de 5 c'est une faute de frappe. */
export const COEF_MIN = 1;
export const COEF_MAX = 5;
export const PAIEMENT_MAX = 160;

/** Des conditions lisibles, quoi qu'on ait tapé ou lu sur le disque. */
export function conditionsPropres(c: Partial<Record<keyof ConditionsDevis, unknown>>, avant: ConditionsDevis): ConditionsDevis {
  const out = { ...avant };
  if (c.coefficient === null) out.coefficient = null;
  else if (typeof c.coefficient === 'number' && isFinite(c.coefficient)) {
    out.coefficient = Math.round(Math.max(COEF_MIN, Math.min(COEF_MAX, c.coefficient)) * 100) / 100;
  }
  if (typeof c.acompte === 'number' && isFinite(c.acompte)) out.acompte = Math.round(Math.max(0, Math.min(100, c.acompte)));
  if (typeof c.validite === 'number' && isFinite(c.validite)) out.validite = Math.round(Math.max(1, Math.min(365, c.validite)));
  if (typeof c.paiement === 'string') out.paiement = c.paiement.trim().slice(0, PAIEMENT_MAX);
  return out;
}

function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

/** Le dernier numéro de devis attribué : son année, et son rang dans l'année. */
export interface DernierDevis {
  annee: number;
  rang: number;
}

interface Etat extends Entreprise, ConditionsDevis {
  charge: boolean;
  /** Corrige une ou plusieurs conditions des devis (bornées, voir `conditionsPropres`). */
  reglerConditions: (c: Partial<ConditionsDevis>) => void;
  /** Voir `numeroterUnDevis`. */
  dernierDevis: DernierDevis | null;
  charger: () => Promise<void>;
  /** Corrige un ou plusieurs champs ; les blancs autour s'en vont. */
  regler: (champs: Partial<Entreprise>) => void;
  /**
   * LE NUMÉRO DU DEVIS SUIVANT — « D-2026-0042 » : l'année, puis le rang dans
   * l'année, sans trou ni doublon sur cet appareil. Correctif de l'audit :
   * le devis n'avait pas de numéro, et un devis sans numéro ne se retrouve
   * pas dans une comptabilité.
   */
  numeroterUnDevis: (date?: Date) => string;
}

const champsDe = (e: Entreprise): Entreprise => ({
  nom: e.nom,
  adresse: e.adresse,
  telephone: e.telephone,
  email: e.email,
  siret: e.siret,
  decennale: e.decennale ?? '',
  formeJuridique: e.formeJuridique ?? '',
  immatriculation: e.immatriculation ?? '',
  tvaIntra: e.tvaIntra ?? '',
  mediateur: e.mediateur ?? '',
});

const conditionsDe = (e: ConditionsDevis): ConditionsDevis => ({
  coefficient: e.coefficient,
  acompte: e.acompte,
  validite: e.validite,
  paiement: e.paiement,
});

function ecrire(e: Entreprise & ConditionsDevis & { dernierDevis: DernierDevis | null }): void {
  try {
    disque()
      .setItem(CLE_ENTREPRISE, JSON.stringify({ ...champsDe(e), ...conditionsDe(e), dernierDevis: e.dernierDevis }))
      .catch(() => {});
  } catch {
    // Pas de disque : l'entreprise vit le temps de la session.
  }
}

export const useEntreprise = create<Etat>((set, get) => ({
  charge: false,
  ...ENTREPRISE_VIDE,
  ...CONDITIONS_PAR_DEFAUT,
  dernierDevis: null,

  charger: async () => {
    let brut: string | null = null;
    try {
      brut = await disque().getItem(CLE_ENTREPRISE);
    } catch {
      brut = null;
    }
    let lu: Record<string, unknown> | null = null;
    try {
      lu = brut ? JSON.parse(brut) : null;
    } catch {
      lu = null;
    }
    const out: Partial<Entreprise> = {};
    let dernierDevis: DernierDevis | null = get().dernierDevis;
    let conditions = conditionsDe(get());
    if (lu && typeof lu === 'object') {
      conditions = conditionsPropres(lu, conditions);
      for (const k of Object.keys(ENTREPRISE_VIDE) as (keyof Entreprise)[]) {
        if (typeof lu[k] === 'string') out[k] = lu[k] as string;
      }
      const d = lu.dernierDevis as Partial<DernierDevis> | null | undefined;
      if (d && Number.isInteger(d.annee) && Number.isInteger(d.rang)) {
        dernierDevis = { annee: d.annee as number, rang: d.rang as number };
      }
    }
    set({ charge: true, ...out, ...conditions, dernierDevis });
  },

  regler: (champs) => {
    const propres: Partial<Entreprise> = {};
    for (const [k, v] of Object.entries(champs) as [keyof Entreprise, string | undefined][]) {
      if (typeof v === 'string') propres[k] = v.trim();
    }
    set(propres);
    ecrire(get());
  },

  reglerConditions: (c) => {
    set(conditionsPropres(c, conditionsDe(get())));
    ecrire(get());
  },

  numeroterUnDevis: (date = new Date()) => {
    const annee = date.getFullYear();
    const avant = get().dernierDevis;
    const rang = avant && avant.annee === annee ? avant.rang + 1 : 1;
    set({ dernierDevis: { annee, rang } });
    ecrire(get());
    return `D-${annee}-${String(rang).padStart(4, '0')}`;
  },
}));

/**
 * L'entreprise à imprimer, ou rien : sans nom, le dossier garde la marque
 * EchoPlan plutôt qu'un cartouche à moitié vide.
 */
export function entrepriseAImprimer(e: Entreprise): EntrepriseImprimee | null {
  if (!e.nom.trim()) return null;
  // Les mentions facultatives ne s'impriment que remplies : un champ vide
  // n'a rien à dire au PDF.
  const out: EntrepriseImprimee = { ...champsDe(e) };
  for (const k of MENTIONS_FACULTATIVES) if (!out[k]?.trim()) delete out[k];
  return out;
}

const MENTIONS_FACULTATIVES = ['formeJuridique', 'immatriculation', 'tvaIntra', 'mediateur'] as const;
/** L'entreprise telle que le PDF la reçoit : ses mentions facultatives, seulement remplies. */
export type EntrepriseImprimee = Omit<Entreprise, (typeof MENTIONS_FACULTATIVES)[number]> &
  Partial<Pick<Entreprise, (typeof MENTIONS_FACULTATIVES)[number]>>;
