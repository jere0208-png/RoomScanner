/**
 * L'ASTUCE — un mot qui passe, et qui ne demande rien.
 *
 * Relevé du patron : « on doit rendre la chose ludique. »
 *
 * IL Y AVAIT DEUX FAÇONS DE PARLER, ET AUCUNE NE CONVENAIT. L'ALERTE arrête
 * tout et attend qu'on la referme : c'est juste pour un échec, et beaucoup
 * trop pour « au fait, vous pouvez toucher cet interrupteur ». La FEUILLE
 * demande un choix. Il manquait la troisième : celle qui dit une chose et s'en
 * va, sans qu'on ait à faire quoi que ce soit.
 *
 * C'EST LA MÊME PORTE QUE LES ALERTES, et pour la même raison : une astuce
 * naît là où le geste se produit — au fond du magasin quand un plan
 * s'enregistre, dans un écran quand un lien se noue — et pas forcément dans un
 * composant qui aurait de la place pour la porter. `astuce()` s'appelle de
 * n'importe où, y compris hors de React.
 *
 * ELLE NE FAIT QU'UNE CHOSE À LA FOIS, et la suivante attend son tour. Deux
 * pastilles empilées, c'est la seconde qui cache la première ; deux qui se
 * remplacent, c'est la première qu'on n'a pas eu le temps de lire.
 */
import { create } from 'zustand';
import type { SOLAIRES } from './solaires';

export interface DonneesAstuce {
  /** Une phrase. Pas deux : ce qui ne tient pas en une ligne est une alerte. */
  texte: string;
  /** Le dessin qui l'accompagne, pris au jeu commun. */
  icone?: keyof typeof SOLAIRES;
  /**
   * UNE FÊTE, ou une simple information.
   *
   * La différence n'est pas décorative : une astuce qui explique se pose en
   * gris, une qui félicite prend la couleur de la maison. Mélanger les deux
   * ferait d'un conseil une récompense, et l'inverse.
   */
  fete?: boolean;
}

interface EtatAstuce {
  courante: DonneesAstuce | null;
  file: DonneesAstuce[];
  poser: (a: DonneesAstuce) => void;
  fermer: () => void;
}

export const useAstuce = create<EtatAstuce>((set, get) => ({
  courante: null,
  file: [],
  poser: (a) => {
    const st = get();
    /*
      LA MÊME PHRASE NE S'EMPILE PAS SUR ELLE-MÊME. Deux gestes rapides qui
      lèvent la même astuce — deux liens noués coup sur coup — la feraient
      passer deux fois de suite, ce qui se lit comme un bégaiement.
    */
    if (st.courante?.texte === a.texte) return;
    if (st.file.some((x) => x.texte === a.texte)) return;
    if (st.courante) {
      set({ file: [...st.file, a] });
      return;
    }
    set({ courante: a });
  },
  fermer: () => {
    const st = get();
    const [suivante, ...reste] = st.file;
    set({ courante: suivante ?? null, file: reste });
  },
}));

/** Pose une astuce, de n'importe où. */
export function astuce(
  texte: string,
  options?: { icone?: keyof typeof SOLAIRES; fete?: boolean },
) {
  useAstuce.getState().poser({ texte, ...options });
}
