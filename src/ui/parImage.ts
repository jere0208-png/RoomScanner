/**
 * UN SEUL RENDU PAR IMAGE, JAMAIS DEUX.
 *
 * Relevé du chantier : « l'application fait chauffer le téléphone… augmente
 * la fluidité ». Les deux tiennent souvent à la même cause, et c'est un
 * piège classique du tactile : LES DOIGTS VONT PLUS VITE QUE L'ÉCRAN.
 *
 * Sur un iPhone récent, la dalle affiche jusqu'à cent vingt images par
 * seconde et le tactile remonte au même rythme, parfois davantage. Chaque
 * mouvement du doigt déclenchait un rendu complet de la scène 3D — plusieurs
 * centaines de tracés reconstruits et comparés — alors qu'entre deux images
 * affichées, tous les rendus intermédiaires sauf le dernier finissent à la
 * poubelle. On calculait deux fois pour montrer une fois.
 *
 * On garde donc la DERNIÈRE valeur reçue et on ne rend qu'au battement
 * suivant de l'écran. Rien ne se perd — la dernière position du doigt est
 * toujours celle qu'on affiche — et le travail inutile disparaît : moins de
 * chaleur, et une image qui arrive à l'heure plutôt que deux en retard.
 */
export interface ParImage<T> {
  /** Reçoit une valeur ; l'affichage suivra au prochain battement. */
  (valeur: T): void;
  /** À appeler au démontage : une image en attente ne doit rien réveiller. */
  annuler(): void;
}

export function parImage<T>(rendre: (valeur: T) => void): ParImage<T> {
  let attente: { v: T } | null = null;
  let jeton: number | null = null;
  const poser = (valeur: T) => {
    attente = { v: valeur };
    if (jeton !== null) return;
    jeton = requestAnimationFrame(() => {
      jeton = null;
      const prete = attente;
      attente = null;
      if (prete) rendre(prete.v);
    });
  };
  poser.annuler = () => {
    if (jeton !== null) cancelAnimationFrame(jeton);
    jeton = null;
    attente = null;
  };
  return poser as ParImage<T>;
}
