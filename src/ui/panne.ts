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
    faire:
      'Vérifiez qu’il reste de la place sur le téléphone, puis réessayez.',
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
  const { titre, faire } = DIT[sujet];
  const detail = texteDe(cause);
  const utile =
    detail.length > 0 && detail.length <= DETAIL_MAX && !faire.includes(detail);
  return { titre, message: utile ? `${faire} (${detail})` : faire };
}
