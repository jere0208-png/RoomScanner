/**
 * LES PLANS QUI SUIVENT LE COMPTE.
 *
 * Relevé du chantier : « que les photos soient lues même s'il réinstalle
 * l'application, tant qu'il est sur son compte ». Les photos vivent
 * maintenant dans la photothèque du téléphone, où elles survivent à tout —
 * mais un scan, lui, vit dans le stockage de l'application, et celui-là part
 * avec elle. Une photo restaurée n'aurait plus de plan où se punaiser.
 *
 * Un relevé de logement entier pèse quelques dizaines de kilo-octets : des
 * murs, des ouvertures, de l'appareillage et les identifiants des photos.
 * C'est du texte, il monte sans rien coûter. LES IMAGES NE MONTENT JAMAIS
 * ICI — elles restent chez l'utilisateur, et le plan ne porte que leurs
 * renvois.
 *
 * OFFLINE-FIRST, comme le reste : cinq secondes d'attente, puis on passe.
 * Un serveur injoignable ne bloque jamais un chantier, et l'échec ne se dit
 * qu'à qui l'a demandé — jamais au milieu d'un relevé.
 */
import { SERVEUR } from '../config/serveur';

/** Ce qu'on sait d'un plan gardé au compte, sans l'avoir téléchargé. */
export interface PlanDistant {
  scan: string;
  nom: string;
  /** Horodatage de la dernière modification, tel que le téléphone l'a vu. */
  maj: number;
  /** Poids du plan en octets — de quoi prévenir avant un long transfert. */
  taille: number;
}

export interface Identite {
  identifiant: string;
  jeton: string;
}

const DELAI = 5000;

async function api(
  action: string,
  corps: Record<string, unknown>,
): Promise<{ ok: boolean; [k: string]: unknown } | null> {
  if (!SERVEUR.url) return null;
  try {
    const reponse = await Promise.race([
      fetch(`${SERVEUR.url}/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...corps }),
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('délai')), DELAI),
      ),
    ]);
    return await reponse.json();
  } catch {
    return null;
  }
}

/**
 * Dépose un plan sous le compte. Rend `false` sans rien dire quand le
 * serveur n'est pas joignable : c'est un filet, pas une condition.
 */
export async function deposerPlan(
  qui: Identite,
  plan: { scan: string; nom: string; maj: number; contenu: string },
): Promise<boolean> {
  const r = await api('deposer', { ...qui, ...plan });
  return r?.ok === true;
}

/** Ce que le compte garde, sans le contenu : de quoi choisir. */
export async function catalogueDesPlans(
  qui: Identite,
): Promise<PlanDistant[] | null> {
  const r = await api('catalogue', { ...qui });
  if (r?.ok !== true || !Array.isArray(r.plans)) return null;
  return (r.plans as Record<string, unknown>[]).map((p) => ({
    scan: String(p.scan ?? ''),
    nom: String(p.nom ?? ''),
    maj: Number(p.maj) || 0,
    taille: Number(p.taille) || 0,
  }));
}

/** Redescend un plan entier. `null` si le serveur ne l'a pas. */
export async function reprendrePlan(
  qui: Identite,
  scan: string,
): Promise<{ nom: string; contenu: string; maj: number } | null> {
  const r = await api('reprendre', { ...qui, scan });
  if (r?.ok !== true || typeof r.contenu !== 'string') return null;
  return {
    nom: String(r.nom ?? ''),
    contenu: r.contenu,
    maj: Number(r.maj) || 0,
  };
}
