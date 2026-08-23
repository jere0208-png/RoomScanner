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
    // La colonne d'actions garde soixante-douze points ; la carte part du
    // bord gauche et s'arrête avant elle (`maxWidth`, posé à l'affichage).
    72 -
    2 * (s.editBar.paddingHorizontal as number);

  it('laisse de la place à son contenu, même sur un écran étroit', () => {
    expect(disponible(ECRAN_ETROIT)).toBeGreaterThan(240);
  });

  /**
   * CE QUI NE CÈDE JAMAIS : les trois commandes, le séparateur, l'unité, et
   * les deux pastilles réduites à leur texte.
   */
  /*
    CE BANC COMPTAIT UNE LIGNE QUI N'EXISTE PLUS.

    Il additionnait, au point près, ce qu'une SEULE rangée devait porter :
    deux pastilles de cote, un séparateur, une unité et trois boutons — et il
    exigeait que la somme tienne dans la largeur d'un iPhone étroit. C'était
    la bonne question tant que la réponse était « tout sur une ligne ».

    Relevé du patron, capture à l'appui : « toujours les boutons sont coupés
    et le texte aussi. Fais en 2 parties, avec le texte au-dessus et les
    boutons en dessous. » La ligne unique était le défaut, pas sa largeur.

    Ce qu'on vérifie maintenant est donc l'inverse : que PLUS RIEN ne dépend
    d'un calcul de largeur. Les cotes tiennent leur rangée, les boutons la
    leur, et chacun garde sa taille — c'est la rangée qui se replie.
  */
  it('ne fait plus tenir ses boutons dans la rangée des cotes', () => {
    // Une rangée d'actions qui se replie : c'est elle qui remplace le
    // calcul au point près.
    expect(s.editIcons.flexWrap).toBe('wrap');
    expect(s.bandeauActions.flexWrap).toBe('wrap');
  });

  it('ne sacrifie plus rien : ni les cotes, ni les boutons', () => {
    // Le `flexShrink` était l'ordre de sacrifice d'une ligne trop courte.
    // Personne ne cède plus, parce que personne ne partage plus sa ligne.
    expect(s.clChamp.flexShrink).toBe(0);
    expect(s.editIcons.flexShrink).toBe(0);
    expect(s.unit.flexShrink).toBe(0);
  });

  /**
   * ET CHAQUE COMMANDE A LA TAILLE D'UN DOIGT.
   *
   * Les pastilles faisaient vingt-huit points dessinés et empruntaient le
   * reste au débord (`hitSlop`) : la cible était bonne, le dessin non —
   * quatre ronds serrés au bout d'une ligne pleine. Depuis que la rangée
   * d'actions vit sous le texte, la place est là.
   */
  it('donne à chaque commande la taille d’un doigt', () => {
    expect(s.iconBtn.width).toBeGreaterThanOrEqual(44);
    expect(s.iconBtnOk.width).toBeGreaterThanOrEqual(44);
    expect(s.nudgeBtn.width).toBeGreaterThanOrEqual(44);
    expect(s.clChamp.minHeight).toBeGreaterThanOrEqual(44);
  });

  /** Les angles : une carte, plus un galet. */
  it('a des angles de carte, pas de pilule', () => {
    expect(s.editBar.borderRadius).toBeLessThanOrEqual(20);
    expect(s.bandeau.borderRadius).toBeLessThanOrEqual(20);
  });
});
