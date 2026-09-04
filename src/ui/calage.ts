/**
 * CALER UNE PHOTO SUR L'ÉLÉVATION D'UN MUR.
 *
 * Huitième des dix améliorations. L'établi dessine un mur vu de face, et l'on
 * y pose les prises. À côté, dans un bouton, dort une photo DE CE MUR —
 * prise sur place une minute plus tôt, pour se souvenir de la gaine qui en
 * sort. Les deux ne se sont jamais rencontrées : on ouvrait la photo en
 * grand, on la refermait, et on replaçait sa prise de mémoire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ELLE NE S'ALIGNE PAS TOUTE SEULE, ET ON NE PRÉTEND PAS LE CONTRAIRE.
 *
 * Une photo prise à main levée, de biais, n'est pas une élévation. La caler
 * automatiquement demanderait de redresser la perspective — et une photo mal
 * redressée est PIRE qu'une photo brute : on y placerait des prises au
 * mauvais endroit en croyant mesurer. On la pose donc au mieux (elle couvre
 * le mur), et on donne le geste pour la caler à la main. C'est un REPÈRE,
 * jamais une cote, et l'écran le dit.
 *
 * LE CALAGE SE COMPTE EN FRACTIONS DU MUR, PAS EN POINTS D'ÉCRAN. Un calage
 * retenu en points ne veut plus rien dire sur un autre téléphone ni après
 * une rotation : le même dossier ouvert sur un iPad retrouverait sa photo à
 * trente centimètres du mur. En fractions, il voyage.
 */

/** Le placement d'une photo sur son mur. */
export interface Calage {
  /** Décalage horizontal, en fraction de la LARGEUR du mur. */
  dx: number;
  /** Décalage vertical, en fraction de la HAUTEUR du mur. */
  dy: number;
  /** Grossissement, 1 = la photo couvre le mur, ni plus ni moins. */
  k: number;
}

/** La photo au repos : centrée, couvrante, telle qu'on vient de la poser. */
export const CALAGE_NEUTRE: Calage = { dx: 0, dy: 0, k: 1 };

/**
 * LES BORNES — le seul chemin de retour.
 *
 * Deux doigts qui s'échappent, et la photo part à mille pour cent, hors du
 * mur : elle n'est plus nulle part, et rien à l'écran ne dit comment la
 * ramener. On la garde donc à portée de doigt, toujours.
 */
export const ECHELLE_MIN = 0.5;
export const ECHELLE_MAX = 4;
/** Un mur et demi de débattement de chaque côté : de quoi caler, pas fuir. */
export const DECALAGE_MAX = 1.5;

const fini = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

const borner = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Un calage ramené dans ses bornes.
 *
 * Un calage dont une valeur n'est pas un nombre revient au NEUTRE en entier,
 * et pas seulement sur la valeur fautive : la leçon de la maison — « une
 * garde qui nomme ce qu'elle refuse laisse passer les NaN » — et une photo à
 * NaN point disparaît sans laisser d'adresse.
 */
export function bornerCalage(c: Calage | null | undefined): Calage {
  if (!c || !fini(c.dx) || !fini(c.dy) || !fini(c.k)) return CALAGE_NEUTRE;
  return {
    dx: borner(c.dx, -DECALAGE_MAX, DECALAGE_MAX),
    dy: borner(c.dy, -DECALAGE_MAX, DECALAGE_MAX),
    k: borner(c.k, ECHELLE_MIN, ECHELLE_MAX),
  };
}

/** La position du rideau, de 0 (le mur nu) à 1 (la photo entière). */
export function bornerRideau(v: number): number {
  if (!fini(v)) return 0;
  return borner(v, 0, 1);
}

/**
 * OÙ POSER LA PHOTO, dans le repère du rectangle du mur.
 *
 * ELLE COUVRE, elle ne s'inscrit pas. Un repère visuel qui laisse deux
 * bandes grises de chaque côté se lit comme une vignette posée sur le mur,
 * pas comme le mur lui-même ; on couvre, et l'on rogne ce qui dépasse. Ses
 * proportions sont gardées : une photo étirée ne sert de repère à rien.
 *
 * LE GROSSISSEMENT PART DU CENTRE. Un zoom qui part du coin fait fuir
 * l'image en diagonale : on cherche à grossir un détail du milieu, et il
 * sort du cadre.
 *
 * SANS LES CÔTES DE L'IMAGE, elle prend celles du mur — les dimensions
 * d'une image se demandent au système, et la réponse arrive une image plus
 * tard. La photo apparaît alors d'un coup, à la bonne place, au lieu de
 * sauter d'une taille à l'autre sous les yeux.
 */
export function cadreDeLaPhoto(
  mur: { w: number; h: number },
  photo: { w: number; h: number } | null | undefined,
  calage: Calage | null | undefined,
): { x: number; y: number; w: number; h: number } {
  const c = bornerCalage(calage);
  const utile =
    photo && fini(photo.w) && fini(photo.h) && photo.w > 0 && photo.h > 0
      ? photo
      : null;
  const couvre = utile
    ? Math.max(mur.w / utile.w, mur.h / utile.h)
    : 0;
  const w = (utile ? utile.w * couvre : mur.w) * c.k;
  const h = (utile ? utile.h * couvre : mur.h) * c.k;
  return {
    x: (mur.w - w) / 2 + c.dx * mur.w,
    y: (mur.h - h) / 2 + c.dy * mur.h,
    w,
    h,
  };
}
