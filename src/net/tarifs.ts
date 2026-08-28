/**
 * ALLER VOIR SI LES PRIX ONT BOUGÉ.
 *
 * Relevé du patron : « pour les prix, j'aimerais une actualisation automatique
 * via l'application, au clic sur le devis, un chargement des prix pour voir si
 * les prix sont à jour. Fournir une référence pour le prix (ex : Castorama -
 * date). »
 *
 * D'OÙ VIENNENT LES PRIX, ET POURQUOI PAS DIRECTEMENT DU MAGASIN. Les sites de
 * vente refusent la lecture automatique : Leroy Merlin et 123elec renvoient
 * tous deux une page de vérification anti-robot, et un téléphone qui irait les
 * lire se ferait fermer la porte au premier chantier. Le relevé se fait donc
 * EN AMONT, une fois, du côté du serveur — c'est là qu'on regarde une enseigne
 * et qu'on note ce qu'on a vu —, et l'application ne fait que redescendre le
 * résultat. Elle porte l'enseigne et le jour, et le devis les affiche.
 *
 * OFFLINE-FIRST, COMME TOUT LE RESTE. Six secondes d'attente, puis on passe :
 * un serveur injoignable ne bloque jamais un chantier. Le dernier catalogue
 * reçu est gardé sur le téléphone et resservi tel quel — avec sa date, pour
 * qu'on sache de quand il date —, et à défaut ce sont les prix embarqués qui
 * chiffrent, comme ils l'ont toujours fait.
 *
 * ON NE VA PAS VOIR À CHAQUE OUVERTURE. Un tarif d'appareillage ne bouge pas
 * dans la journée. On regarde si le catalogue gardé a plus d'un jour ; sinon
 * on le ressert sans toucher au réseau, et l'écran le dit — « déjà à jour ».
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVEUR } from '../config/serveur';
import { appliquerLesTarifs, type TarifsRecus } from '../geometry/prix';

/** Où le dernier catalogue reçu dort entre deux chantiers. */
const CLE = 'echoplan.tarifs.v1';

/** Six secondes : au-delà, on est sur un chantier sans réseau. */
const DELAI = 6000;

/**
 * L'ÂGE À PARTIR DUQUEL ON REDEMANDE — un jour.
 *
 * Assez court pour qu'un devis fait le lendemain d'une hausse la porte, assez
 * long pour ne pas rappeler le serveur à chaque fois qu'on ouvre le devis
 * d'un même chantier. Un prix d'appareillage ne bouge pas dans la journée.
 */
export const FRAICHEUR = 24 * 60 * 60 * 1000;

/** Ce que le téléphone garde : le catalogue, et QUAND on l'a demandé. */
export interface TarifsGardes {
  catalogue: TarifsRecus;
  /** Horodatage de la dernière réponse du serveur, en millisecondes. */
  vu: number;
}

/**
 * CE QUE L'ÉCRAN A BESOIN DE SAVOIR, et rien de plus.
 *
 * Trois issues, et chacune se dit autrement à celui qui regarde : on est allé
 * voir et les prix ont changé ; on est allé voir et ils étaient déjà bons ; on
 * n'a pas pu y aller. La quatrième — « le serveur n'existe pas » — se confond
 * avec la troisième pour l'utilisateur, mais pas pour nous.
 */
export type IssueTarifs = 'actualise' | 'ajour' | 'horsligne';

export interface Verification {
  issue: IssueTarifs;
  /** Le catalogue qui chiffre désormais. `null` = les prix embarqués. */
  catalogue: TarifsRecus | null;
  /** Quand ce catalogue a été reçu. `null` quand il n'y en a pas. */
  vu: number | null;
}

/** Un catalogue mal formé ne doit pas casser un devis : on le refuse en bloc. */
function lire(brut: unknown): TarifsRecus | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.version !== 'string' || !o.version) return null;
  if (typeof o.releve !== 'string' || !o.releve) return null;
  if (typeof o.source !== 'string' || !o.source) return null;
  if (!o.prix || typeof o.prix !== 'object') return null;
  const prix: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.prix as Record<string, unknown>)) {
    const n = Number(v);
    // Un prix négatif, nul ou illisible n'est pas un prix : on garde le nôtre
    // plutôt que d'annoncer une gaine à zéro euro.
    if (isFinite(n) && n > 0) prix[k] = n;
  }
  return { version: o.version, releve: o.releve, source: o.source, prix };
}

async function demander(): Promise<TarifsRecus | null> {
  if (!SERVEUR.url) return null;
  try {
    const reponse = await Promise.race([
      fetch(`${SERVEUR.url}/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tarifs' }),
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('délai')), DELAI),
      ),
    ]);
    const json = (await reponse.json()) as Record<string, unknown>;
    if (json?.ok !== true) return null;
    return lire(json.tarifs);
  } catch {
    return null;
  }
}

/** Le catalogue gardé sur le téléphone, s'il y en a un de lisible. */
export async function tarifsGardes(): Promise<TarifsGardes | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (!brut) return null;
    const o = JSON.parse(brut) as Record<string, unknown>;
    const catalogue = lire(o.catalogue);
    if (!catalogue) return null;
    return { catalogue, vu: Number(o.vu) || 0 };
  } catch {
    return null;
  }
}

/**
 * VA VOIR SI LES PRIX ONT BOUGÉ, ET LES APPLIQUE.
 *
 * Rend ce qu'il faut dire à l'écran. N'échoue jamais : au pire, on repart avec
 * ce qu'on avait — et l'on repart TOUJOURS avec quelque chose, puisque le
 * catalogue embarqué existe.
 *
 * @param maintenant L'heure, passée en paramètre : une fonction qui lit
 *   l'horloge du monde ne se met pas sur un banc. C'est la même raison qui
 *   interdit `Date.now()` dans les scripts de la maison.
 * @param forcer Redemander même si le catalogue gardé est encore frais —
 *   c'est le geste « vérifier maintenant » de l'écran.
 */
export async function verifierLesTarifs(
  maintenant: number,
  forcer = false,
): Promise<Verification> {
  const garde = await tarifsGardes();
  const frais = !!garde && maintenant - garde.vu < FRAICHEUR;
  if (garde && frais && !forcer) {
    appliquerLesTarifs(garde.catalogue);
    return { issue: 'ajour', catalogue: garde.catalogue, vu: garde.vu };
  }
  const recu = await demander();
  if (!recu) {
    // Hors ligne : on garde ce qu'on avait. Un devis se fait aussi en cave.
    if (garde) appliquerLesTarifs(garde.catalogue);
    return {
      issue: 'horsligne',
      catalogue: garde?.catalogue ?? null,
      vu: garde?.vu ?? null,
    };
  }
  appliquerLesTarifs(recu);
  try {
    await AsyncStorage.setItem(
      CLE,
      JSON.stringify({ catalogue: recu, vu: maintenant }),
    );
  } catch {
    // Le catalogue est appliqué : ne pas savoir le garder n'est pas un échec
    // de la vérification, seulement une visite de plus la prochaine fois.
  }
  /*
    « ACTUALISÉ » NE VEUT PAS DIRE « ARRIVÉ », MAIS « CHANGÉ ».

    Un serveur qui rend la même version que ce qu'on avait n'a rien
    actualisé : le dire quand même ferait mentir l'écran à chaque ouverture,
    et l'on cesserait vite de le lire. On compare donc la VERSION.
  */
  const change = garde?.catalogue.version !== recu.version;
  return {
    issue: change ? 'actualise' : 'ajour',
    catalogue: recu,
    vu: maintenant,
  };
}

/**
 * REMET LES PRIX GARDÉS AU DÉMARRAGE, sans réseau.
 *
 * Un devis ouvert hors ligne doit chiffrer avec le dernier catalogue connu,
 * pas repartir des prix embarqués : ce serait un total qui recule.
 */
export async function reprendreLesTarifs(): Promise<TarifsRecus | null> {
  const garde = await tarifsGardes();
  if (garde) appliquerLesTarifs(garde.catalogue);
  return garde?.catalogue ?? null;
}
