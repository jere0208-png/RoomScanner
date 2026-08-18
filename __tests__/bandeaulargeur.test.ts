/**
 * LE BANDEAU DU MEUBLE TIENT DANS SON BLOC — compté, pas regardé.
 *
 * Relevé du chantier, deux fois : « le bouton de validation sort du bloc ».
 * Deux corrections l'ont élargi en espérant que ça suffise, et il est
 * ressorti. Une vue qui déborde en React Native n'est pas rognée : elle
 * sort, et le bouton bleu va se poser sur la colonne d'actions.
 *
 * Ce banc additionne ce qui NE PEUT PAS se comprimer — les trois boutons,
 * leurs écarts, les marges du bloc — et le compare à la place disponible sur
 * le plus étroit des iPhone. Les chiffres viennent des styles réels : changer
 * une taille de bouton sans regarder fait échouer ce test, pas la capture
 * d'écran d'un chantier.
 *
 * La largeur des textes est estimée (0,62 × la taille de police par
 * caractère, ce que donne la police système en gras) : c'est une hypothèse,
 * elle est écrite ici, et elle est large — une estimation trop généreuse ne
 * peut que rendre le test plus sévère.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

/** Largeur d'un texte, en points. */
const largeurTexte = (n: number, taille: number) => n * taille * 0.62;

/**
 * Le plus étroit des iPhone encore en service : le SE, 375 points. Les
 * 320 points de l'iPhone 5 ne concernent plus aucun appareil sous iOS 17.
 */
const ECRAN_ETROIT = 375;

describe('le bandeau du meuble', () => {
  // Les styles sont typés au plus juste par StyleSheet ; ici on ne veut que
  // lire des nombres, on passe donc par `unknown`.
  const s = getStyles(light) as unknown as Record<string, Record<string, number>>;

  /** Ce que le bloc laisse à son contenu, sur un écran donné. */
  const disponible = (ecran: number) =>
    ecran -
    (s.editBar.left as number) -
    (s.editBar.right as number) -
    (s.editBar.marginRight as number) -
    2 * (s.editBar.paddingHorizontal as number);

  it('laisse de la place à son contenu, même sur un écran étroit', () => {
    expect(disponible(ECRAN_ETROIT)).toBeGreaterThan(240);
  });

  /**
   * CE QUI NE CÈDE JAMAIS : les trois commandes, le séparateur, l'unité, et
   * les deux pastilles réduites à leur texte.
   */
  it('fait tenir ses commandes et ses cotes dans le bloc', () => {
    const bouton = s.iconBtn.width as number;
    const ecartIcones = s.editIcons.gap as number;
    const ecartRangee = s.editRow.gap as number;
    // Trois boutons : pivoter, annuler, valider.
    const commandes = 3 * bouton + 2 * ecartIcones;
    // Une pastille de cote : ses marges, quatre caractères (« 0,00 ») et,
    // pour la seconde, l'unité collée dedans.
    const pastille =
      2 * (s.clChamp.paddingHorizontal as number) +
      largeurTexte(4, s.clValeur.fontSize as number);
    const unite =
      (s.clChamp.gap as number) + largeurTexte(1, s.unit.fontSize as number);
    const separateur = largeurTexte(1, s.unit.fontSize as number);
    const total =
      pastille + ecartRangee + separateur + ecartRangee + (pastille + unite) +
      ecartRangee + commandes;
    // Et il reste de la marge : une ligne qui tient au point près
    // ressortira au premier libellé qui s'allonge.
    expect(Math.round(total)).toBeLessThanOrEqual(disponible(ECRAN_ETROIT) - 20);
  });

  /**
   * ET SI ÇA NE TIENT PLUS, CE SONT LES CHIFFRES QUI SE SERRENT.
   *
   * L'ordre de sacrifice est ce qui empêche le défaut de revenir : une
   * pastille de cote peut se réduire, un bouton non. Sans ces deux
   * propriétés, la ligne repousse le dernier bouton dehors dès qu'un
   * libellé s'allonge.
   */
  it('sacrifie les cotes avant les boutons', () => {
    expect(s.clChamp.flexShrink).toBe(1);
    expect(s.editIcons.flexShrink).toBe(0);
    expect(s.unit.flexShrink).toBe(0);
  });

  /** Les angles : une carte, plus un galet. */
  it('a des angles de carte, pas de pilule', () => {
    expect(s.editBar.borderRadius).toBeLessThanOrEqual(16);
    expect(s.iconBtn.borderRadius).toBeLessThanOrEqual(12);
    expect(s.clChamp.borderRadius).toBeLessThanOrEqual(12);
  });
});
