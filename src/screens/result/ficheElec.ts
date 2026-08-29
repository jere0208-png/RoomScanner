/**
 * CE QU'ON DIT D'UN APPAREIL QU'ON TOUCHE SANS ÊTRE EN ÉDITION.
 *
 * Relevé du patron : « un clic sur un interrupteur ou lumière ou autre élément
 * élec sans être dans le mode Édition doit juste afficher les liens circuits
 * en lien, et la possibilité de link à un inter. »
 *
 * CE QUE ÇA FAISAIT AVANT : ça ouvrait l'ÉTABLI — la fiche d'élévation
 * complète, avec ses flèches au centimètre, ses champs de cote et son bouton
 * « Retirer ». Un atelier, pour quelqu'un qui regardait. Hors édition, on ne
 * vient pas déplacer une prise à un centimètre près : on vient répondre à deux
 * questions — « celle-là, elle est sur quoi ? » et « elle est reliée à quoi ? »
 * — et éventuellement nouer un lien.
 *
 * POURQUOI C'EST UN MODULE, ET PAS QUINZE LIGNES DANS L'ÉCRAN. La phrase
 * dépend de la NATURE de l'appareil : un interrupteur allume, une prise
 * s'allume, une RJ45 ne fait ni l'un ni l'autre. Trois cas, chacun avec son
 * absence à dire — et une absence bien dite est ce qui distingue « rien n'est
 * relié » de « on ne sait pas ». C'est une règle, elle s'éprouve, elle ne se
 * relit pas au milieu de quatre mille lignes d'écran.
 */
import {
  COMMANDES_MURALES,
  FIXTURES,
  seCommande,
  type Fixture,
} from '../../geometry/electrical';

export interface FicheElecEntree {
  appareil: Fixture;
  /** La pièce qui le porte, si le plan la connaît. */
  piece?: string;
  /** Le repère de son départ — « C3 ». Absent tant qu'il n'y a pas de tableau. */
  circuit?: string;
  /** Ce qui l'allume, en toutes lettres. Vide s'il n'est relié à rien. */
  allumePar?: string[];
  /** Ce qu'il allume, en toutes lettres. Vide s'il ne commande rien. */
  allume?: string[];
}

/** Une énumération qui se lit : « A », « A et B », « A, B et C ». */
function enumerer(mots: string[]): string {
  if (mots.length <= 1) return mots[0] ?? '';
  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
}

/**
 * Le titre et la phrase de la fiche.
 *
 * LA PHRASE SE LIT D'UNE TRAITE, et ses morceaux sont toujours dans le même
 * ordre : où c'est, sur quoi c'est, avec quoi c'est relié. Un ordre qui change
 * selon ce qu'on a sous la main oblige à relire.
 */
export function ficheElec(e: FicheElecEntree): {
  titre: string;
  sousTitre: string;
} {
  const spec = FIXTURES[e.appareil.kind];
  const bouts: string[] = [];
  if (e.piece) bouts.push(e.piece);

  /*
    LE CIRCUIT, ET SON ABSENCE.

    Un appareil sans départ n'est pas une anomalie : c'est un plan sur lequel
    on n'a pas encore posé de tableau. Le dire ainsi — « pas encore sur un
    circuit » — répond à la question au lieu de laisser un blanc que l'œil
    prend pour une panne.
  */
  bouts.push(e.circuit ? `circuit ${e.circuit}` : 'pas encore sur un circuit');

  const commande = COMMANDES_MURALES.includes(e.appareil.kind);
  const sAllume = seCommande(e.appareil.kind);
  const allume = e.allume ?? [];
  const allumePar = e.allumePar ?? [];

  if (commande) {
    bouts.push(
      allume.length > 0
        ? `allume ${enumerer(allume)}`
        : 'n’allume rien pour l’instant',
    );
  } else if (sAllume) {
    /*
      UNE PRISE ORDINAIRE N'EST PAS « NON RELIÉE », ELLE EST ORDINAIRE.

      Dire « aucun interrupteur » de toutes les prises du logement ferait lire
      un défaut sur quarante appareils qui vont très bien : une prise
      commandée est l'exception, pas la règle. On ne parle donc du lien que
      s'il EXISTE — et le bouton « Lier », lui, est là dans les deux cas pour
      qui veut en créer un.
    */
    if (allumePar.length > 0) {
      bouts.push(`allumé par ${enumerer(allumePar)}`);
    }
  }

  return { titre: spec.label, sousTitre: bouts.join(' · ') };
}

/**
 * CE QUE LE BOUTON DE LIEN PROPOSE, selon ce qu'on tient.
 *
 * Le même geste, deux phrases : on part d'un interrupteur pour chercher ce
 * qu'il allume, on part d'une prise pour chercher ce qui l'allume. C'est la
 * seule chose qui change, et c'est celle qui dit à l'utilisateur ce qu'on
 * attend de son prochain appui.
 */
export function motDuLien(f: Fixture): string | null {
  if (COMMANDES_MURALES.includes(f.kind)) return 'Choisir ce qu’il allume';
  if (seCommande(f.kind)) return 'Choisir l’interrupteur qui l’allume';
  return null;
}
