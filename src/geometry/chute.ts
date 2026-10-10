/**
 * LA CHUTE DE TENSION D'UN CIRCUIT — ce que la longueur coûte au bout du fil.
 *
 * Proposée comme amélioration « productive » (le patron : « améliore
 * considérablement l'app avec des idées que tu trouveras intéressantes et
 * productives »). L'application sait déjà la SECTION et le CALIBRE de chaque
 * circuit, et elle trace son cheminement jusqu'au dernier point : elle a
 * donc tout ce qu'il faut pour dire ce qu'un électricien vérifie à la fin
 * d'une étude, et oublie volontiers sur un chantier de rénovation — un
 * circuit trop long pour sa section.
 *
 * LA FORMULE est celle du guide UTE C 15-105, en monophasé, résistance seule
 * (les sections domestiques rendent la réactance négligeable) :
 *
 *     ΔU = 2 × ρ × L × Ib / S        ΔU % = ΔU / 230 × 100
 *
 * avec ρ = 0,0225 Ω·mm²/m (cuivre en service), L la longueur du tableau au
 * point le plus éloigné EN SUIVANT LE CÂBLE (pontages compris), S la section.
 *
 * LE COURANT D'EMPLOI se prend comme le fait une étude prudente :
 *   — prises et circuits spécialisés : le calibre du disjoncteur — on ne
 *     sait pas ce qu'on y branchera, on suppose le pire ;
 *   — éclairage : cent voltampères par point, borné au calibre — c'est la
 *     règle de comptage de la norme, et c'est ce qu'un circuit d'éclairage
 *     porte vraiment (le supposer à 10 A ferait signaler chaque couloir).
 *
 * LES LIMITES, pour une installation alimentée par le réseau public basse
 * tension : 3 % pour l'éclairage, 5 % pour les autres usages.
 *
 * C'est un CONSTAT D'INFORMATION, jamais une alerte : l'estimation repose
 * sur un cheminement tracé, pas mesuré, et le geste qui la règle — passer en
 * section supérieure, couper le circuit en deux — reste un choix d'homme de
 * l'art.
 */
import type { CircuitNature } from './nfc15100';

/** Résistivité du cuivre en service (Ω·mm²/m). */
export const RHO_CUIVRE = 0.0225;
/** Tension simple (V). */
export const TENSION = 230;
/** Voltampères comptés par point d'éclairage. */
export const VA_PAR_POINT = 100;

export interface ChuteDeTension {
  circuitId: string;
  label: string;
  nature: CircuitNature;
  section: number;
  calibre: number;
  /** Du tableau au point le plus éloigné, en suivant le câble (m). */
  longueur: number;
  /** Le courant d'emploi retenu (A). */
  courant: number;
  /** La chute estimée (%). */
  pourcent: number;
  /** La limite de son usage (%). */
  limite: number;
}

/** La limite d'un usage : 3 % pour l'éclairage, 5 % pour le reste. */
export const limiteDe = (nature: CircuitNature) => (nature === 'eclairage' ? 3 : 5);

/** Le courant d'emploi retenu pour un circuit (voir l'en-tête). */
export function courantDEmploi(nature: CircuitNature, calibre: number, points: number): number {
  if (nature === 'eclairage') return Math.min(calibre, (Math.max(1, points) * VA_PAR_POINT) / TENSION);
  return calibre;
}

/** La chute de tension, en pour cent. */
export function pourcentDeChute(longueur: number, courant: number, section: number): number {
  if (!(section > 0) || !(longueur > 0) || !(courant > 0)) return 0;
  return ((2 * RHO_CUIVRE * longueur * courant) / section / TENSION) * 100;
}

/** La chute d'un circuit — `null` pour un courant faible, qui n'a ni section ni calibre. */
export function chuteDuCircuit(
  c: { id: string; label: string; nature: CircuitNature; section: number | null; breaker: number | null; points: number },
  longueur: number,
): ChuteDeTension | null {
  if (!c.section || !c.breaker || c.nature === 'vdi') return null;
  const courant = courantDEmploi(c.nature, c.breaker, c.points);
  return {
    circuitId: c.id,
    label: c.label,
    nature: c.nature,
    section: c.section,
    calibre: c.breaker,
    longueur,
    courant,
    pourcent: pourcentDeChute(longueur, courant, c.section),
    limite: limiteDe(c.nature),
  };
}

/**
 * Les constats de chute, au format du contrôle (`ElecIssue`) : ce que le
 * diagnostic de l'écran et le dossier imprimé lisent déjà.
 */
export function constatsDeChute(
  chutes: readonly ChuteDeTension[],
): { code: 'chute'; severity: 'info'; message: string; regle: string }[] {
  const out: { code: 'chute'; severity: 'info'; message: string; regle: string }[] = [];
  for (const ch of chutes) {
    const c = constatDeChute(ch);
    if (c) out.push({ code: 'chute', severity: 'info', ...c });
  }
  return out;
}

/** « 4,2 % » */
const pc = (x: number) => `${x.toFixed(1).replace('.', ',')} %`;
/** « 2,5 mm² » */
const mm = (s: number) => `${String(s).replace('.', ',')} mm²`;

/**
 * Le constat d'un circuit qui dépasse — ou rien. La phrase dit le circuit, la
 * chute et sa limite ; l'aide, les deux gestes qui la règlent.
 */
export function constatDeChute(ch: ChuteDeTension): { message: string; regle: string } | null {
  if (ch.pourcent <= ch.limite) return null;
  const suivante = ch.section < 1.5 ? 1.5 : ch.section < 2.5 ? 2.5 : ch.section < 4 ? 4 : ch.section < 6 ? 6 : 10;
  return {
    message: `${ch.label} : ${Math.round(ch.longueur)} m de câble en ${mm(ch.section)} — chute de tension estimée ${pc(
      ch.pourcent,
    )} (limite ${pc(ch.limite)}).`,
    regle:
      `Au-delà de ${pc(ch.limite)}, les appareils en bout de ligne sont sous-alimentés. ` +
      `Passer en ${mm(suivante)} (protection inchangée), ou couper le circuit en deux. ` +
      'Estimation sur le cheminement tracé : à confirmer au métré réel.',
  };
}
