/**
 * CE QU'ON DIT QUAND ÇA RATE — et c'est toujours QUOI FAIRE.
 *
 * Relevé du patron, après une passe globale : « on doit penser utilisateur
 * simple, sans professionnalisme forcément. »
 *
 * L'APPLICATION DISAIT LA PANNE, JAMAIS LA SORTIE :
 *
 *     « Export impossible » — « Erreur inconnue »
 *     « Capture impossible » — « Erreur inconnue »
 *     « Enregistrement impossible » — le message brut du système
 *
 * « Impossible » est un constat, et l'utilisateur l'a déjà fait : il vient de
 * voir que ça n'a pas marché. « Erreur inconnue » est un aveu — la seule
 * phrase de l'application qui dise « nous ne savons pas ». Ni l'un ni l'autre
 * ne répond à la seule question qu'on se pose devant un écran bloqué : et
 * maintenant, je fais quoi ?
 *
 * LE TON JUSTE EXISTAIT DÉJÀ ICI, et c'est ce qui rend l'écart embarrassant :
 * le guide du scan dit « balayez plus lentement, du sol au plafond, avec
 * davantage de lumière ». Une consigne, un geste, une sortie. Il n'était
 * simplement écrit nulle part ailleurs.
 *
 * LE DÉTAIL TECHNIQUE N'EST PAS JETÉ, IL EST DÉPLACÉ. Il s'ajoute derrière la
 * consigne, entre parenthèses — un développeur en a besoin, l'utilisateur n'en
 * a pas besoin EN PREMIER. Et il ne s'ajoute que s'il est court : une trace
 * d'appel de six lignes collée sous la phrase, c'est la phrase qu'on ne lit
 * plus.
 */
import { enregistrerPanne } from './journalPannes';

/** Les moments où l'application peut échouer devant quelqu'un. */
export const SUJETS = [
  'export',
  'capture',
  'enregistrement',
  'releve',
  'achat',
  'restauration',
  'connexion',
] as const;

export type Sujet = (typeof SUJETS)[number];

/**
 * LE TITRE NOMME CE QUI A MANQUÉ, il ne constate pas l'échec.
 *
 * « Export impossible » et « Le fichier n'est pas parti » disent la même
 * chose ; le second dit AUSSI de quoi on parle, ce qui permet de savoir tout
 * de suite s'il faut recommencer ou changer quelque chose.
 */
const DIT: Record<Sujet, { titre: string; faire: string }> = {
  export: {
    titre: 'Le fichier n’est pas parti',
    /*
      PAS DE « PLACE SUR LE TÉLÉPHONE » PAR DÉFAUT — revue « fiabilité » :
      la consigne accusait toujours le stockage, même quand le dossier
      n'avait pas pu se calculer. On faisait vider son iPhone pour rien. Le
      stockage n'est accusé que quand le système le dit (`PLACE_EXPORT`).
    */
    faire: 'Un problème est survenu en préparant le fichier. Réessayez dans un instant.',
  },
  capture: {
    titre: 'L’image n’a pas été prise',
    faire: 'Revenez au plan et réessayez ; s’il est très grand, dézoomez un peu.',
  },
  enregistrement: {
    titre: 'Le plan n’a pas été enregistré',
    /*
      ON COMMENCE PAR RASSURER, et ce n'est pas de la politesse : c'est le
      seul défaut de cette application qui puisse coûter une visite entière.
      Celui qui lit ça doit savoir, avant tout le reste, que son travail est
      toujours là.
    */
    faire:
      'Votre travail est toujours à l’écran. Libérez un peu de place sur le téléphone et réessayez.',
  },
  releve: {
    titre: 'Le relevé n’a pas abouti',
    faire:
      'Éclairez la pièce, tenez le téléphone à hauteur de poitrine et balayez les murs lentement, du sol au plafond.',
  },
  achat: {
    titre: 'L’achat n’est pas passé',
    faire: 'Rien n’a été débité. Vérifiez votre connexion et réessayez.',
  },
  restauration: {
    titre: 'Achat non retrouvé',
    faire:
      'Vérifiez que vous êtes connecté au même compte Apple qu’au moment de l’achat.',
  },
  connexion: {
    titre: 'La connexion n’a pas abouti',
    faire: 'Vérifiez votre accès à internet, puis réessayez.',
  },
};

/** L'export qui manque vraiment de place : là, et là seulement, on le dit. */
const PLACE_EXPORT =
  'Vérifiez qu’il reste de la place sur le téléphone, puis réessayez.';

/**
 * LE STOCKAGE PLEIN, TEL QUE LE SYSTÈME LE DIT — `ENOSPC` côté fichiers,
 * `NSFileWriteOutOfSpaceError` côté Foundation, et leurs traductions.
 */
const MANQUE_DE_PLACE =
  /ENOSPC|OutOfSpace|out of space|no space|not enough space|disk full|storage full|espace insuffisant|plus assez d.espace|stockage (est )?plein/i;

/**
 * La longueur au-delà de laquelle un détail technique cesse d'aider.
 *
 * Cent vingt signes, c'est une phrase du système ; au-delà, c'est une trace
 * d'appel, et elle noie la consigne qu'elle est censée compléter.
 */
const DETAIL_MAX = 120;

/** Ce qu'une cause a d'humainement lisible — rien, la plupart du temps. */
function texteDe(cause: unknown): string {
  if (typeof cause === 'string') return cause.trim();
  if (cause instanceof Error) return String(cause.message ?? '').trim();
  if (cause && typeof cause === 'object' && 'message' in cause) {
    const m = (cause as { message?: unknown }).message;
    return typeof m === 'string' ? m.trim() : '';
  }
  return '';
}

/** Le message et le code d'une cause (`WRITE_FAILED`…), pour y chercher. */
function texteEtCode(cause: unknown): string {
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code ?? '')
      : '';
  return `${texteDe(cause)} ${code}`;
}

/** Le système dit-il que le stockage est plein ? */
function manqueDePlace(cause: unknown): boolean {
  return MANQUE_DE_PLACE.test(texteEtCode(cause));
}

/**
 * Le titre et le message d'une panne, prêts pour `alerte`.
 *
 * `cause` est ce que le système a bien voulu dire — souvent rien, souvent
 * illisible. Elle ne remplace JAMAIS la consigne : elle la suit, quand elle
 * est courte et qu'elle apporte quelque chose.
 */
export function panne(
  sujet: Sujet,
  cause?: unknown,
): { titre: string; message: string } {
  const { titre } = DIT[sujet];
  const faire =
    sujet === 'export' && manqueDePlace(cause) ? PLACE_EXPORT : DIT[sujet].faire;
  const detail = texteDe(cause);
  const utile =
    detail.length > 0 && detail.length <= DETAIL_MAX && !faire.includes(detail);
  return { titre, message: utile ? `${faire} (${detail})` : faire };
}

/**
 * Une annulation n'est pas une panne : le geste de quelqu'un qui a changé
 * d'avis n'a rien à faire dans le journal.
 */
function estUneAnnulation(cause: unknown): boolean {
  return /cancel|annul/i.test(texteEtCode(cause));
}

/**
 * LA PANNE MONTRÉE VA AUSSI AU JOURNAL — revue « fiabilité » : seul le
 * garde-fou écrivait dans le journal. Les erreurs attrapées puis montrées
 * (export, capture, achat, connexion…) n'y laissaient rien, et quand le
 * patron disait « le PDF ne part pas », le diagnostic du profil était vide.
 *
 * Même titre et même message que `panne`, qui reste pour ce qui s'affiche
 * en continu (un panneau redessiné ne s'écrit pas au journal à chaque
 * image). À n'appeler qu'UNE FOIS PAR INCIDENT, là où l'erreur est attrapée.
 */
export function signaler(
  sujet: Sujet,
  cause: unknown,
  ecran: string,
): { titre: string; message: string } {
  if (!estUneAnnulation(cause)) {
    try {
      enregistrerPanne(cause ?? `${sujet} : aucun détail`, {
        ecran: `${ecran} · ${sujet}`,
        fatale: false,
      });
    } catch {
      // Le journal ne fait jamais tomber ce qu'il observe.
    }
  }
  return panne(sujet, cause);
}
