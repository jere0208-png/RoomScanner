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
 *
 * ET ELLE S'AFFICHE LÀ OÙ ON LA VOIT — relevé de la revue App Review : «
 * Supprimer mon compte » et « S'abonner » ne montraient RIEN. L'hôte unique,
 * monté en bas d'`App`, présente sa fenêtre depuis la vue de l'application
 * — or celle-ci présente déjà le menu du compte, ou la page Pro. iOS refuse
 * une seconde fenêtre présentée par le même parent, en silence ; pire, React
 * Native se croit présenté quand même et toutes les alertes suivantes
 * restaient muettes jusqu'au redémarrage. Une fenêtre ouverte DANS une
 * fenêtre, elle, se présente très bien. D'où la PILE D'HÔTES : chaque
 * fenêtre qui peut lever une alerte monte le sien (`<AlerteHote imbrique />`),
 * qui s'inscrit ici ; seul le plus haut affiche l'alerte, et l'hôte racine
 * ne sert que quand plus aucune fenêtre n'est ouverte.
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
  /**
   * Les hôtes imbriqués, du plus bas au plus haut. Vide : c'est l'hôte
   * racine qui affiche. Voir `inscrire`.
   */
  hotes: number[];
  poser: (a: DonneesAlerte) => void;
  fermer: () => void;
  /** Un hôte imbriqué entre en scène : il passe en haut de la pile. */
  inscrire: (id: number) => void;
  /** Sa fenêtre se ferme : l'alerte en cours redescend à l'hôte d'en dessous. */
  desinscrire: (id: number) => void;
}

export const useAlerte = create<EtatAlerte>((set, get) => ({
  courante: null,
  file: [],
  hotes: [],
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
  inscrire: (id) => {
    set({ hotes: [...get().hotes.filter((h) => h !== id), id] });
  },
  desinscrire: (id) => {
    const hotes = get().hotes;
    if (hotes.includes(id)) set({ hotes: hotes.filter((h) => h !== id) });
  },
}));

/**
 * LE TEMPS QU'UNE FENÊTRE FINISSE D'ENTRER OU DE SORTIR.
 *
 * Un hôte qui devient le plus haut — parce que sa fenêtre vient de s'ouvrir,
 * ou parce que celle du dessus vient de se fermer — attend ce délai avant
 * d'afficher : iOS refuse aussi une présentation pendant qu'une autre glisse
 * encore (la page Pro monte du bas, le menu du compte s'efface en fondu).
 * L'alerte n'est pas perdue pour autant : elle reste `courante` et paraît
 * une demi-seconde plus tard.
 */
export const DELAI_RELAIS = 500;

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
