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
 * LA DOCTRINE A BOUGÉ — relevé du patron, plus tard : « donne la
 * possibilité de choisir beaucoup de couleurs pour meubles, murs, sols, dans
 * une palette de sélection RGB ». Les treize restent EN TÊTE, comme des
 * raccourcis montrables ; « Autre couleur… » ouvre le sélecteur libre
 * (`components/NuancierLibre`), dont la couleur s'enregistre en `#RRGGBB`
 * à la place de la clé. Une couleur libre n'a pas de pot au rayon : la liste
 * d'achats écrit « Teinte sur mesure » et son code.
 *
 * LE BLANC CASSÉ OUVRE LA LISTE parce qu'il est l'état de départ d'un mur —
 * choisir le premier de la liste, c'est revenir à ce qu'on avait.
 */

import { estHex } from './couleurLibre';

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
 * LES TREIZE — les douze d'origine, et le blanc pur que le patron a demandé.
 *
 * Six clairs pour agrandir, quatre teintes sourdes qui passent partout, et
 * deux foncés — parce qu'un pan sombre est la seule façon de montrer à quoi
 * ressemble un mur d'accent, et que c'est demandé dès qu'on parle peinture.
 */
export const PEINTURES: Peinture[] = [
  { cle: 'blanc', nom: 'Blanc cassé', hex: '#FFFCF6' },
  // Relevé du patron : « ajoute la couleur blanc pur sur la teinte des murs ».
  { cle: 'blancPur', nom: 'Blanc pur', hex: '#FFFFFF' },
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
  /*
    UNE COULEUR LIBRE SE REND TELLE QUELLE — relevé du patron : « donne la
    possibilité de choisir beaucoup de couleurs (...) dans une palette de
    sélection RGB ». Le nuancier reste en raccourcis ; la clé d'une couleur
    choisie au sélecteur EST son hexa (`#RRGGBB`), et aucune clé de palette
    ne commence par « # ». Un hexa mal formé ne donne rien, comme une clé
    inconnue.
  */
  if (cle.startsWith('#')) return estCouleurLibre(cle) ? cle : null;
  return PAR_CLE.get(cle)?.hex ?? null;
}

/** Une couleur libre, choisie au sélecteur RGB : `#RRGGBB`. */
export function estCouleurLibre(cle: string | null | undefined): cle is string {
  return estHex(cle);
}

/** Ce qu'on dit d'une couleur libre, partout où une teinte a un nom. */
export const COULEUR_PERSONNALISEE = 'Couleur personnalisée';
/** Une couleur libre ne se vend pas en pot : elle se fait faire. */
export const TEINTE_SUR_MESURE = 'Teinte sur mesure';

/** Le nom d'une clé, pour le dire à l'écran. */
export function nomDePeinture(cle: string | null | undefined): string | null {
  if (!cle) return null;
  if (cle.startsWith('#')) return estCouleurLibre(cle) ? COULEUR_PERSONNALISEE : null;
  return PAR_CLE.get(cle)?.nom ?? null;
}

/**
 * Le nom d'une teinte dans « Ce qu'il faut acheter » : celui du nuancier, ou
 * « Sans teinte choisie » pour les murs qu'on n'a pas peints dans
 * « Décorer » (la clé vide).
 */
export function nomDeTeinte(cle: string): string {
  /*
    SANS CHOIX, C'EST LE BLANC CASSÉ — revue « Lucas » : choisir « Blanc
    cassé » dans Décorer n'enregistre rien (c'est la teinte de départ), et
    la liste d'achats écrivait « Sans teinte choisie ». Le mur, lui, est
    bien peint en blanc cassé : on le dit.
  */
  /*
    PAS DE POT DU COMMERCE POUR UNE COULEUR LIBRE — elle se fait teinter à
    la machine, chez le marchand : la liste d'achats le dit, avec le code
    à lui donner.
  */
  if (estCouleurLibre(cle)) return `${TEINTE_SUR_MESURE} ${cle.toUpperCase()}`;
  return nomDePeinture(cle || PEINTURE_DEFAUT) ?? 'Sans teinte choisie';
}
