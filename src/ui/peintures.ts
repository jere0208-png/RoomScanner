/**
 * LA PEINTURE DES PIÈCES — une palette imposée, et courte.
 *
 * Septième des dix améliorations. La maquette rendait deux choses : le blanc
 * cassé du dessin, ou la teinte RELEVÉE au scan. Entre les deux, rien — et
 * c'est justement là que se tient la question qu'un client pose toujours :
 * « et si on mettait du vert d'eau ? ». On y répondait en la mimant du doigt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PALETTE, ET PAS UN SÉLECTEUR DE COULEUR.
 *
 * C'est la doctrine du mobilier, mot pour mot — relevé du patron : « ils ne
 * servent pas à redécorer mais à imaginer la pièce seulement ». Un choix
 * libre produirait des maquettes fuchsia qu'on ne montre à personne, et
 * ferait d'une application de relevé un logiciel de décoration. Douze
 * teintes de peinture d'intérieur, celles qu'on trouve en pot chez le
 * marchand, choisies pour se tenir ensemble : quel que soit le tirage, la
 * maquette reste montrable.
 *
 * LE BLANC CASSÉ OUVRE LA LISTE parce qu'il est l'état de départ d'un mur —
 * choisir le premier de la liste, c'est revenir à ce qu'on avait.
 */

export interface Peinture {
  /** Ce qui s'enregistre dans le dossier. */
  cle: string;
  /** Ce qui s'affiche sous la pastille. */
  nom: string;
  hex: string;
}

/** La clé de l'état de départ : un mur non peint. */
export const PEINTURE_DEFAUT = 'blanc';

/**
 * LES DOUZE.
 *
 * Six clairs pour agrandir, quatre teintes sourdes qui passent partout, et
 * deux foncés — parce qu'un pan sombre est la seule façon de montrer à quoi
 * ressemble un mur d'accent, et que c'est demandé dès qu'on parle peinture.
 */
export const PEINTURES: Peinture[] = [
  { cle: 'blanc', nom: 'Blanc cassé', hex: '#FFFCF6' },
  { cle: 'craie', nom: 'Craie', hex: '#F4F1EA' },
  { cle: 'lin', nom: 'Lin', hex: '#EFE6D6' },
  { cle: 'sable', nom: 'Sable', hex: '#E8DCC6' },
  { cle: 'perle', nom: 'Gris perle', hex: '#E4E5E3' },
  { cle: 'galet', nom: 'Galet', hex: '#D3D2CD' },
  { cle: 'argile', nom: 'Argile', hex: '#DFCDB8' },
  { cle: 'sauge', nom: 'Vert sauge', hex: '#D5DED0' },
  { cle: 'eucalyptus', nom: 'Eucalyptus', hex: '#B9C8BC' },
  { cle: 'bleuGris', nom: 'Bleu gris', hex: '#CBD7DF' },
  { cle: 'terracotta', nom: 'Terracotta', hex: '#D9A386' },
  { cle: 'anthracite', nom: 'Anthracite', hex: '#4C5157' },
];

const PAR_CLE = new Map(PEINTURES.map((p) => [p.cle, p]));

/**
 * La teinte d'une clé, ou `null`.
 *
 * `null` COMPTE. Un dossier enregistré par une version future porte une clé
 * que celle-ci ne connaît pas : elle retombe alors sur le blanc du dessin.
 * Rendre la première teinte de la liste repeindrait la pièce sans prévenir,
 * et personne ne saurait d'où sort cette couleur.
 */
export function hexDePeinture(cle: string | null | undefined): string | null {
  if (!cle) return null;
  return PAR_CLE.get(cle)?.hex ?? null;
}

/** Le nom d'une clé, pour le dire à l'écran. */
export function nomDePeinture(cle: string | null | undefined): string | null {
  if (!cle) return null;
  return PAR_CLE.get(cle)?.nom ?? null;
}
