/**
 * TROUVER UN PLAN COMME ON S'EN SOUVIENT — peaufinage APPLI.
 *
 * L'accueil cherchait dans le NOM seul (accents pliés), la bibliothèque dans
 * le nom, le client et l'adresse (accents NON pliés) : « Hélène » ne trouvait
 * pas « Helene » d'un côté, « Dupont » ne trouvait pas le plan du client
 * Dupont de l'autre. Une seule règle maintenant, des deux côtés :
 *   — les accents, la casse et les apostrophes ne comptent pas ;
 *   — chaque mot tapé doit se retrouver quelque part (« dupont lyon »
 *     trouve le chantier Dupont rue de Lyon), dans le nom, le client,
 *     l'adresse ou le numéro du devis envoyé ;
 *   — une faute de frappe est pardonnée dans un mot de cinq lettres ou plus
 *     (« Duppont », « apartement »), jamais dans un mot court, où elle
 *     ferait tout correspondre.
 */
import { pourChercher } from './mots';

export interface PlanCherchable {
  name?: string;
  client?: string;
  address?: string;
  devis?: { numero?: string } | null;
}

const textes = new WeakMap<object, { tout: string; mots: string[] }>();

function texteDuPlan(p: PlanCherchable): { tout: string; mots: string[] } {
  const deja = textes.get(p);
  if (deja) return deja;
  const tout = pourChercher([p.name ?? '', p.client ?? '', p.address ?? '', p.devis?.numero ?? ''].join(' '));
  const t = { tout, mots: tout.split(/[^a-z0-9]+/).filter((m) => m.length > 0) };
  textes.set(p, t);
  return t;
}

/** Une lettre de différence au plus : en plus, en moins, changée, ou deux lettres inversées. */
export function aUneFautePres(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length && diff.length <= 2; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    // Deux lettres voisines inversées : « apprtaement ».
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [court, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < court.length && court[i] === long[i]) i++;
  return court.slice(i) === long.slice(i + 1);
}

/** Le mot tapé se retrouve-t-il dans le plan ? Tel quel (même au milieu d'un mot), ou à une faute près. */
function motTrouve(mot: string, t: { tout: string; mots: string[] }): boolean {
  if (t.tout.includes(mot)) return true;
  if (mot.length < 5) return false;
  // À une faute près : contre un mot entier, ou contre le début d'un mot plus long.
  return t.mots.some((m) => aUneFautePres(mot, m) || (m.length > mot.length && aUneFautePres(mot, m.slice(0, mot.length))));
}

/** Le plan répond-il à la recherche ? Une recherche vide répond toujours. */
export function correspondAuPlan(p: PlanCherchable, quete: string): boolean {
  const mots = pourChercher(quete.trim())
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 0);
  if (mots.length === 0) return true;
  const t = texteDuPlan(p);
  return mots.every((m) => motTrouve(m, t));
}
