/**
 * LES PHOTOS DES PRODUITS — une par article du bordereau.
 *
 * Relevé du patron : « récupère des images de chaque appareillage, fais un
 * filtre pour avoir que du produit seul sur fond détourable, tu récupères
 * chaque produit et tu les fais sous formes de petite image avant son titre
 * et son prix, quantité etc. Un ticket de caisse moderne. »
 *
 * D'OÙ ELLES VIENNENT, ET CE QUE ÇA IMPLIQUE. Ce sont les visuels catalogue
 * des fabricants — pour l'essentiel les packshots officiels de Legrand, le
 * reste chez des distributeurs. Ils sont RÉDUITS à deux cents points de côté
 * et DÉTOURÉS, mais ils restent la propriété de leurs auteurs : le patron a
 * été averti et a tranché en connaissance de cause. À revoir si l'app se
 * publie hors de son usage propre.
 *
 * LE DÉTOURAGE SE FAIT PAR LES COINS et non par la couleur : un « rendre le
 * blanc transparent » aurait mangé le boîtier BLANC d'une prise en même temps
 * que son fond. On remplit depuis le coin de l'image, ce qui n'atteint que le
 * fond connecté au bord. Cinq articles — les couronnes de fil, le peigne —
 * n'ont pas de frontière nette avec leur fond : ils gardent leur fond blanc,
 * ce qui vaut mieux qu'une vignette vide.
 *
 * LA TABLE DES FICHIERS S'ÉCRIT TOUTE SEULE (`tools/gen-produits.mjs`) :
 * React Native exige un `require` littéral — on ne compose pas un chemin à la
 * volée — et une table tenue à la main se désynchronise du dossier au premier
 * ajout. Tout ce qui est ÉCRIT À LA MAIN, comme les renvois ci-dessous, vit
 * en dehors du bloc régénéré, entre les deux repères.
 */
import type { ImageSourcePropType } from 'react-native';

/**
 * DEUX ARTICLES, UNE SEULE PHOTO.
 *
 * Relevé du patron : « les prises doivent avoir la même image, ce sont la
 * même chose en réalité ». Il a raison, et c'est plus qu'une économie de
 * fichiers : un socle 16 A, un 20 A et un 32 A sont le MÊME objet sur le mur
 * — même plaque, même couleur, même forme. Leur donner trois photos
 * différentes aurait laissé croire à trois produits qui ne se ressemblent
 * pas, alors que ce qui les sépare est écrit sur la ligne, en ampères.
 *
 * C'était en plus les deux vignettes ratées du premier jet : une prise
 * étanche pour la 20 A, un boîtier blanc illisible pour la 32 A. La bonne
 * réponse n'était pas de chercher de meilleures photos, c'était de n'en
 * chercher qu'une.
 */
const RENVOIS: Record<string, string> = {
  'meca-prise20': 'meca-prise',
  'meca-prise32': 'meca-prise',
};

// ---- début du bloc régénéré (tools/gen-produits.mjs) ----
export const PHOTOS: Record<string, ImageSourcePropType> = {
  'boite-dcl': require('../../assets/produits/boite-dcl.png'),
  'boite-derivation': require('../../assets/produits/boite-derivation.png'),
  'boite-encastrement': require('../../assets/produits/boite-encastrement.png'),
  'bornier-terre': require('../../assets/produits/bornier-terre.png'),
  'coax': require('../../assets/produits/coax.png'),
  'coffret-1': require('../../assets/produits/coffret-1.png'),
  'coffret-2': require('../../assets/produits/coffret-2.png'),
  'coffret-3': require('../../assets/produits/coffret-3.png'),
  'coffret-4': require('../../assets/produits/coffret-4.png'),
  'coffret-com': require('../../assets/produits/coffret-com.png'),
  'diff-A': require('../../assets/produits/diff-A.png'),
  'diff-AC': require('../../assets/produits/diff-AC.png'),
  'disj-10': require('../../assets/produits/disj-10.png'),
  'disj-16': require('../../assets/produits/disj-16.png'),
  'disj-2': require('../../assets/produits/disj-2.png'),
  'disj-20': require('../../assets/produits/disj-20.png'),
  'disj-32': require('../../assets/produits/disj-32.png'),
  'fil-1.5': require('../../assets/produits/fil-1.5.png'),
  'fil-10': require('../../assets/produits/fil-10.png'),
  'fil-2.5': require('../../assets/produits/fil-2.5.png'),
  'fil-6': require('../../assets/produits/fil-6.png'),
  'futp6': require('../../assets/produits/futp6.png'),
  'icta-16': require('../../assets/produits/icta-16.png'),
  'icta-20': require('../../assets/produits/icta-20.png'),
  'icta-25': require('../../assets/produits/icta-25.png'),
  'icta-32': require('../../assets/produits/icta-32.png'),
  'meca-boite': require('../../assets/produits/meca-boite.png'),
  'meca-inter': require('../../assets/produits/meca-inter.png'),
  'meca-poussoir': require('../../assets/produits/meca-poussoir.png'),
  'meca-prise': require('../../assets/produits/meca-prise.png'),
  'meca-rj45': require('../../assets/produits/meca-rj45.png'),
  'meca-sortieCable': require('../../assets/produits/meca-sortieCable.png'),
  'meca-tableau': require('../../assets/produits/meca-tableau.png'),
  'meca-thermostat': require('../../assets/produits/meca-thermostat.png'),
  'meca-tv': require('../../assets/produits/meca-tv.png'),
  'meca-va': require('../../assets/produits/meca-va.png'),
  'meca-variateur': require('../../assets/produits/meca-variateur.png'),
  'peigne': require('../../assets/produits/peigne.png'),
  'plafond-camera': require('../../assets/produits/plafond-camera.png'),
  'plafond-daaf': require('../../assets/produits/plafond-daaf.png'),
  'plafond-detecteur': require('../../assets/produits/plafond-detecteur.png'),
  'plafond-vmc': require('../../assets/produits/plafond-vmc.png'),
  'plaque-1': require('../../assets/produits/plaque-1.png'),
  'plaque-2': require('../../assets/produits/plaque-2.png'),
  'plaque-3': require('../../assets/produits/plaque-3.png'),
  'plaque-4': require('../../assets/produits/plaque-4.png'),
};
// ---- fin du bloc régénéré ----

/** La photo d'un article, renvois compris. */
export function photoDe(code: string): ImageSourcePropType | null {
  return PHOTOS[RENVOIS[code] ?? code] ?? null;
}
