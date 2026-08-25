/**
 * NOS ALERTES À NOUS.
 *
 * `Sheet.tsx` le dit depuis longtemps, et c'était vrai partout ailleurs :
 * « `Alert.alert` et `Alert.prompt` sont ceux d'iOS : police système,
 * boutons bleus empilés, coins de 2019. Au milieu d'une app qui a sa
 * typographie, ses rayons et son bleu, ils font tache. »
 *
 * Les feuilles maison avaient remplacé les saisies et les menus. Restaient
 * VINGT-CINQ fenêtres système, disséminées : « Export impossible » cinq
 * fois, « Enregistrement impossible », « Achat impossible », « Connexion
 * impossible », et le « Abandonner ce relevé ? » du scan — le seul dans un
 * parcours normal, les autres n'apparaissant qu'en cas d'échec. Une
 * application dont la moitié des messages d'erreur sont dessinés par
 * quelqu'un d'autre n'a pas fini son travail.
 *
 * POURQUOI UNE PORTE D'ENTRÉE GLOBALE, et non un état par écran. Une alerte
 * naît le plus souvent dans un `catch` — un export qui échoue, un achat
 * refusé —, parfois au fond d'un composant qui n'a ni menu ni feuille à
 * lui (le mur vu de face, la fiche du compte). Leur demander à tous de
 * porter un état, c'est se garantir que le prochain appellera `Alert.alert`
 * « juste pour cette fois ». Ici, `alerte()` s'appelle de n'importe où, y
 * compris hors de React, comme la fonction système qu'elle remplace.
 *
 * ELLE NE FAIT QU'UNE CHOSE À LA FOIS. Deux alertes empilées, c'est une
 * fenêtre qui en cache une autre : la seconde attend que la première soit
 * refermée. iOS le faisait déjà ; on ne fait pas moins bien.
 */
import { create } from 'zustand';

export interface ActionAlerte {
  label: string;
  /** Le geste qui enlève, en rouge — comme partout ailleurs. */
  danger?: boolean;
  onPress?: () => void;
}

export interface DonneesAlerte {
  titre: string;
  message?: string;
  actions?: ActionAlerte[];
}

interface EtatAlerte {
  /** L'alerte à l'écran, et celles qui attendent leur tour. */
  courante: DonneesAlerte | null;
  file: DonneesAlerte[];
  poser: (a: DonneesAlerte) => void;
  fermer: () => void;
}

export const useAlerte = create<EtatAlerte>((set, get) => ({
  courante: null,
  file: [],
  poser: (a) => {
    const st = get();
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

/**
 * Pose une alerte, de n'importe où.
 *
 * Sans action, elle en porte une : « Continuer ». Un message qu'on ne peut
 * pas refermer n'existe pas, et l'oubli serait invisible jusqu'au chantier.
 */
export function alerte(
  titre: string,
  message?: string,
  actions?: ActionAlerte[],
) {
  useAlerte.getState().poser({ titre, message, actions });
}
