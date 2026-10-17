/**
 * LA TEINTE DES PORTES — relevé du patron : « les portes doivent pouvoir avoir
 * une couleur modifiable ». Comme pour la peinture des murs, une courte
 * palette de teintes qu'on trouve vraiment chez le menuisier, plutôt qu'un
 * sélecteur libre : la maquette reste montrable.
 *
 * Le blanc ouvre la liste : c'est la porte telle qu'on la dessine d'office.
 */
export const TEINTES_PORTES = [
  { cle: 'blanc', nom: 'Blanc', hex: '#F3F2EE' },
  { cle: 'chene', nom: 'Chêne clair', hex: '#CDAA81' },
  { cle: 'noyer', nom: 'Noyer', hex: '#71503A' },
  { cle: 'gris', nom: 'Gris clair', hex: '#CFCFCB' },
  { cle: 'anthracite', nom: 'Anthracite', hex: '#4A4D52' },
  { cle: 'noir', nom: 'Noir', hex: '#26272A' },
] as const;

/** La teinte suivante de la palette (après la teinte donnée ; le blanc d'office). */
export function teinteDePorteSuivante(hex: string | null | undefined): (typeof TEINTES_PORTES)[number] {
  const i = TEINTES_PORTES.findIndex((t) => t.hex === hex);
  return TEINTES_PORTES[(Math.max(0, i) + 1) % TEINTES_PORTES.length];
}

/** Le nom d'une teinte de porte, pour le dire à l'écran. */
export function nomDeTeinteDePorte(hex: string | null | undefined): string {
  return TEINTES_PORTES.find((t) => t.hex === hex)?.nom ?? 'Blanc';
}
