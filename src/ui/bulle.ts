/**
 * LA BULLE AU-DESSUS D'UN BOUTON — « il n'y a rien à montrer ».
 *
 * Relevé du patron : « sur le plan 2D, empêche l'activation des boutons
 * Appareils, Meubles, etc. si aucun élément à afficher ; au clic, le bouton
 * ne devient pas actif et affiche un petit message au-dessus, comme “Aucun
 * appareil à afficher, passez en mode édition”. Pareil pour “Nord” ».
 *
 * Un calque vide qui s'allume ne montre rien — et l'on croit que l'app ne
 * marche pas. La pastille reste éteinte, et une bulle dit pourquoi, juste
 * au-dessus d'elle, le temps de la lire.
 *
 * ELLE VIT À LA RACINE (`BulleHote`), comme les astuces : posée dans la
 * pastille, elle passait sous les pastilles empilées au-dessus de la rangée.
 * La pastille donne sa place à l'écran ; l'hôte dessine la bulle par-dessus
 * tout.
 */
import { create } from 'zustand';

export interface Bulle {
  texte: string;
  /** Le milieu du bouton, en coordonnées d'écran. */
  x: number;
  /** Le haut du bouton, en coordonnées d'écran : la bulle se pose au-dessus. */
  y: number;
  /** Change à chaque appui : deux appuis de suite relancent la bulle. */
  n: number;
}

interface EtatDeLaBulle {
  bulle: Bulle | null;
  montrer: (texte: string, x: number, y: number) => void;
  cacher: () => void;
}

export const useBulle = create<EtatDeLaBulle>((set, get) => ({
  bulle: null,
  montrer: (texte, x, y) => set({ bulle: { texte, x, y, n: (get().bulle?.n ?? 0) + 1 } }),
  cacher: () => set({ bulle: null }),
}));

/** Combien de temps la bulle reste lisible. */
export const DUREE_BULLE = 2600;
