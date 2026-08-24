/**
 * LA GARDE DU TRAVAIL NON ENREGISTRÉ — une seule, pour tous les chemins.
 *
 * Trois gestes mènent dehors, et le parcours d'essai les a trouvés l'un
 * après l'autre, chacun perdant le travail en silence :
 *
 *   — la flèche de retour (et le bord gauche, qui fait la même chose) ;
 *   — ouvrir un autre relevé depuis la bibliothèque ;
 *   — « Nouveau scan », le pire des trois, qui efface AUSSI le brouillon
 *     des trente secondes : après lui, le travail ne se retrouve nulle part.
 *
 * Les corriger un par un a produit trois fois la même alerte, à trois
 * endroits — donc trois occasions de diverger, et une quatrième sortie qui
 * naîtrait demain sans garde du tout. Elle vit ici, une fois.
 *
 * L'ORDRE DES CHOIX N'EST PAS ANODIN. « Enregistrer » vient en premier :
 * c'est ce que l'on veut neuf fois sur dix, et sur un chantier on répond à
 * une question sans la lire en entier. Le geste destructeur est marqué
 * comme tel, et « Rester » ferme la marche — c'est l'issue de secours de
 * celui qui a touché par erreur.
 *
 * ET ELLE NE DEMANDE RIEN QUAND IL N'Y A RIEN À PERDRE : une confirmation
 * inutile est une confirmation qu'on apprend à balayer sans lire, et le
 * jour où elle compte, on la balaie aussi.
 */
import type { ActionData } from '../components/Sheet';

export function garderLeTravail(opts: {
  /** Y a-t-il quelque chose à perdre ? */
  dirty: boolean;
  /** Ce que le geste va faire au travail — dit en clair, pas en jargon. */
  message: string;
  /** Le libellé du choix destructeur : il nomme LE GESTE, jamais « OK ». */
  jeter: string;
  /** Range le travail, puis part. */
  enregistrer: () => void;
  /** Part sans rien garder. */
  partir: () => void;
  /**
   * OÙ POSER LA QUESTION — dans NOS fenêtres.
   *
   * Relevé du patron, capture à l'appui : « la popup des modifications non
   * enregistrées est trop basique, donne-lui notre identité ». C'était une
   * `Alert.alert` : police système, boutons bleus empilés, coins de 2019 —
   * au milieu d'une app qui a sa typographie, ses rayons et son bleu.
   *
   * L'app a pourtant ses feuilles depuis longtemps (voir `Sheet`), avec
   * leurs icônes et leur geste destructeur marqué. La garde s'y pose
   * maintenant : l'écran qui appelle passe SA façon d'ouvrir une feuille,
   * parce que c'est lui qui la porte à l'écran.
   */
  demander: (data: ActionData) => void;
}): void {
  if (!opts.dirty) {
    opts.partir();
    return;
  }
  opts.demander({
    title: 'Modifications non enregistrées',
    subtitle: opts.message,
    actions: [
      {
        label: 'Enregistrer',
        hint: 'Range le travail, puis quitte.',
        icon: 'sortir',
        onPress: () => {
          opts.enregistrer();
          opts.partir();
        },
      },
      {
        label: opts.jeter,
        hint: 'Ce qui vient d’être fait sera perdu.',
        icon: 'supprimer',
        danger: true,
        onPress: opts.partir,
      },
    ],
  });
}
