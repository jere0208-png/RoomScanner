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
import { Alert } from 'react-native';

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
}): void {
  if (!opts.dirty) {
    opts.partir();
    return;
  }
  Alert.alert('Modifications non enregistrées', opts.message, [
    {
      text: 'Enregistrer',
      onPress: () => {
        opts.enregistrer();
        opts.partir();
      },
    },
    { text: opts.jeter, style: 'destructive', onPress: opts.partir },
    { text: 'Rester', style: 'cancel' },
  ]);
}
