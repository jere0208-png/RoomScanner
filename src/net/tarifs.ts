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
 * ET PAR DEUX CHEMINS À LA FOIS. Le script `api.php` d'abord — il pourra un
 * jour servir un catalogue calculé —, mais AUSSI le fichier `tarifs.json` posé
 * à côté de lui. Le script est du code : il se redéploie, il repart en
 * arrière, et il a emporté deux fois cette fonctionnalité avec lui en
 * répondant « Identifiant manquant » à une question qu'il ne connaissait plus.
 * Un fichier statique, lui, ne se désynchronise pas. Voir `demander`.
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
import { appliquerLesTarifs, type OffreEnseigne, type TarifsRecus } from '../geometry/prix';

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

/** Une table de chaînes, sans ce qui n'en est pas une (`filtre` en plus). */
function chaines(
  brut: unknown,
  filtre: (v: string) => boolean = () => true,
): Record<string, string> | undefined {
  if (!brut || typeof brut !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(brut as Record<string, unknown>)) {
    if (typeof v === 'string' && v && filtre(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
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
  const t: TarifsRecus = { version: o.version, releve: o.releve, source: o.source, prix };
  // Ce que le relevé du matin ajoute — le jour de chaque prix, son produit.
  // Un catalogue d'avant n'en a pas : il reste lisible tel quel.
  const jours = chaines(o.jours, (v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
  const ean = chaines(o.ean, (v) => /^\d{8,14}$/.test(v));
  const liens = chaines(o.liens, (v) => v.startsWith('https://'));
  if (jours) t.jours = jours;
  if (ean) t.ean = ean;
  if (liens) t.liens = liens;
  // Le prix de chaque enseigne : on ne garde que les offres lisibles, et
  // seulement pour les articles dont le prix est là.
  if (o.offres && typeof o.offres === 'object') {
    const offres: Record<string, OffreEnseigne[]> = {};
    for (const [cle, liste] of Object.entries(o.offres as Record<string, unknown>)) {
      if (!Array.isArray(liste) || prix[cle] === undefined) continue;
      const bonnes: OffreEnseigne[] = [];
      for (const x of liste as Record<string, unknown>[]) {
        const pu = Number(x?.pu);
        if (typeof x?.enseigne !== 'string' || !x.enseigne || !(isFinite(pu) && pu > 0)) continue;
        const of: OffreEnseigne = { enseigne: x.enseigne, pu };
        if (typeof x.jour === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.jour)) of.jour = x.jour;
        if (typeof x.url === 'string' && x.url.startsWith('https://')) of.url = x.url;
        bonnes.push(of);
      }
      if (bonnes.length) offres[cle] = bonnes.sort((a, b) => a.pu - b.pu);
    }
    if (Object.keys(offres).length) t.offres = offres;
  }
  return t;
}

/**
 * LE SABLIER DE LA VISITE — UN SEUL, ET ON LE RANGE.
 *
 * Chaque requête portait le sien, et personne ne l'éteignait : une promesse
 * qui gagne sa course laisse derrière elle un `setTimeout` de six secondes
 * qui court jusqu'au bout pour rien. Avec deux portes au lieu d'une, cela
 * faisait deux minuteurs pendants à CHAQUE consultation du prix — et sur un
 * banc chargé, une file de minuteurs oubliés se paie en secondes.
 *
 * Il y en a donc UN pour toute la visite, et il se range dès qu'elle est
 * finie. C'est aussi la bonne sémantique : ce qu'on borne, c'est l'attente de
 * l'utilisateur, pas celle de chaque paquet.
 */
function sablier(): { attendre: Promise<void>; ranger: () => void } {
  let jeton: ReturnType<typeof setTimeout> | null = null;
  const attendre = new Promise<void>((suite) => {
    jeton = setTimeout(suite, DELAI);
  });
  return {
    attendre,
    ranger: () => {
      if (jeton !== null) clearTimeout(jeton);
      jeton = null;
    },
  };
}

/** Le catalogue tel que le SCRIPT le rend : enveloppé dans `{ok, tarifs}`. */
async function parLeScript(): Promise<TarifsRecus | null> {
  try {
    const reponse = await fetch(`${SERVEUR.url}/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tarifs' }),
    });
    const json = (await reponse.json()) as Record<string, unknown>;
    if (json?.ok !== true) return null;
    return lire(json.tarifs);
  } catch {
    return null;
  }
}

/**
 * LE MÊME CATALOGUE, PRIS DIRECTEMENT DANS SON FICHIER.
 *
 * `<serveur>/tarifs.json` — là où le dépôt le place, à côté de `api.php`, et
 * là où son mode d'emploi dit de le déposer. Le fichier n'est pas enveloppé :
 * c'est l'objet lui-même.
 */
async function parLeFichier(): Promise<TarifsRecus | null> {
  try {
    const reponse = await fetch(`${SERVEUR.url}/tarifs.json`);
    return lire(await reponse.json());
  } catch {
    return null;
  }
}

/**
 * LE RELEVÉ DU MATIN, publié par le dépôt (voir `SERVEUR.tarifsDuJour`).
 *
 * C'est le seul des trois chemins qui change TOUS LES JOURS sans personne :
 * les deux autres attendent qu'on dépose un fichier sur l'hébergement.
 */
async function parLeReleveDuJour(): Promise<TarifsRecus | null> {
  if (!SERVEUR.tarifsDuJour) return null;
  try {
    const reponse = await fetch(SERVEUR.tarifsDuJour);
    return lire(await reponse.json());
  } catch {
    return null;
  }
}

/**
 * LE PLUS RÉCENT DES CATALOGUES ARRIVÉS — et, à égalité, dans l'ordre donné.
 *
 * Relevé du patron : « les prix ne s'actualisent pas même après un forçage,
 * ça reste antidaté ». Le script de l'hébergement passait AVANT tout le
 * reste : tant qu'il répondait, il imposait son fichier du 5 septembre, même
 * à côté d'un relevé du matin. Ce qui départage maintenant, c'est le JOUR DU
 * RELEVÉ ; l'ordre ne sert plus qu'à trancher entre deux relevés du même jour.
 */
export function lePlusRecent(...catalogues: (TarifsRecus | null)[]): TarifsRecus | null {
  let meilleur: TarifsRecus | null = null;
  for (const c of catalogues) {
    if (c && (!meilleur || c.releve > meilleur.releve)) meilleur = c;
  }
  return meilleur;
}

/**
 * VA CHERCHER LE CATALOGUE — PAR TROIS CHEMINS, EN MÊME TEMPS.
 *
 * CE DÉFAUT S'EST PRODUIT DEUX FOIS. Interrogé, `bourseur.fr/api.php`
 * répondait « Identifiant manquant » : le fichier en ligne était ANTÉRIEUR à
 * l'action `tarifs`, tombait dans sa branche d'authentification, et
 * l'application repartait silencieusement avec ses prix embarqués. Le serveur
 * a été remis à jour, il a fonctionné — puis, trois jours plus tard, il
 * répondait de nouveau la même chose, alors que `tarifs.json` était toujours
 * en ligne et parfaitement lisible.
 *
 * UN FICHIER STATIQUE NE SE DÉSYNCHRONISE PAS. Le script est du CODE : il se
 * redéploie, il se remplace, il repart en arrière — et quand il repart en
 * arrière, il emporte une fonctionnalité qui n'a rien à voir avec lui. Le
 * fichier est là, ou il n'est pas là.
 *
 * L'API GARDE LA PRIORITÉ : elle pourra un jour servir un catalogue calculé —
 * par région, par enseigne, par compte —, ce qu'un fichier ne sait pas faire.
 * Elle n'est simplement plus le seul chemin.
 *
 * ET LES DEUX PARTENT ENSEMBLE, pas l'un après l'autre : deux attentes de six
 * secondes en file donneraient douze secondes sur un chantier sans réseau,
 * pour un geste dont toute la promesse est d'être rapide. On ne paie qu'un
 * seul budget d'attente.
 */
async function demander(): Promise<TarifsRecus | null> {
  if (!SERVEUR.url && !SERVEUR.tarifsDuJour) return null;
  let duScript: TarifsRecus | null = null;
  let duFichier: TarifsRecus | null = null;
  let duJour: TarifsRecus | null = null;
  const script = (SERVEUR.url ? parLeScript() : Promise.resolve(null)).then((r) => {
    duScript = r;
  });
  const fichier = (SERVEUR.url ? parLeFichier() : Promise.resolve(null)).then((r) => {
    duFichier = r;
  });
  const releve = parLeReleveDuJour().then((r) => {
    duJour = r;
  });
  const sable = sablier();
  try {
    /*
      ON REND LA MAIN QUAND TOUT A RÉPONDU, ou quand le délai est passé.
      Dans ce second cas on repart avec ce qui EST déjà arrivé — un fichier
      rapide ne doit pas attendre un script qui pend.
    */
    await Promise.race([Promise.all([script, fichier, releve]), sable.attendre]);
  } finally {
    sable.ranger();
  }
  // À égalité de jour : l'API d'abord (elle pourra un jour calculer), puis
  // le relevé du matin, puis le fichier déposé.
  return lePlusRecent(duScript, duJour, duFichier);
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
