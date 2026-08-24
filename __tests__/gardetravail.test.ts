/**
 * TROIS GESTES MÈNENT DEHORS, UNE SEULE GARDE LES COUVRE.
 *
 * Le parcours d'essai a trouvé les trois l'un après l'autre, chacun perdant
 * le travail en silence : la flèche de retour, l'ouverture d'un autre relevé
 * depuis la bibliothèque, et « Nouveau scan » — le pire, qui efface aussi le
 * brouillon des trente secondes.
 *
 * Les corriger un par un avait produit trois fois la même alerte à trois
 * endroits : trois occasions de diverger, et une quatrième sortie qui
 * naîtrait demain sans garde du tout. Ce banc tient la garde commune.
 */

/*
  DE L'ALERTE SYSTÈME À NOTRE FEUILLE.

  Cette garde posait sa question dans un `Alert.alert` : police système,
  boutons bleus empilés, coins de 2019. Relevé du patron, capture à l'appui :
  « la popup des modifications non enregistrées est trop basique, donne-lui
  notre identité ».

  Ce qui change est le SUPPORT, pas la règle : mêmes issues, même ordre,
  même silence quand il n'y a rien à perdre. Le banc suit donc la question là
  où elle se pose maintenant — dans la feuille que l'écran ouvre.
*/
import { Alert } from 'react-native';
import { garderLeTravail } from '../src/ui/gardeTravail';
import type { ActionData } from '../src/components/Sheet';

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  feuilles.length = 0;
});
afterEach(() => jest.restoreAllMocks());

/** Les feuilles ouvertes par la garde, dans l'ordre. */
const feuilles: ActionData[] = [];
const demander = (d: ActionData) => {
  feuilles.push(d);
};
/** Les choix de la dernière feuille, comme on les lit à l'écran. */
const choixFeuille = () => feuilles[feuilles.length - 1]?.actions ?? [];

describe('la garde du travail non enregistré', () => {
  it('ne demande rien quand il n’y a rien à perdre', () => {
    const fait: string[] = [];
    garderLeTravail({
      demander,
      dirty: false,
      message: 'peu importe',
      jeter: 'Partir',
      enregistrer: () => fait.push('enregistre'),
      partir: () => fait.push('part'),
    });
    // Une confirmation inutile est une confirmation qu'on apprend à
    // balayer sans lire — et le jour où elle compte, on la balaie aussi.
    expect(feuilles).toHaveLength(0);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(fait).toEqual(['part']);
  });

  it('propose d’ENREGISTRER en premier', () => {
    garderLeTravail({
      demander,
      dirty: true,
      message: 'Le plan a été modifié.',
      jeter: 'Partir sans enregistrer',
      enregistrer: () => {},
      partir: () => {},
    });
    expect(feuilles).toHaveLength(1);
    expect(feuilles[0].title).toBe('Modifications non enregistrées');
    /*
      Sur un chantier, on répond à une question sans la lire en entier : le
      premier choix doit être celui qu'on veut neuf fois sur dix.

      « Rester » a disparu de la liste : nos feuilles se referment d'un
      appui à côté ou d'un glissement vers le bas, et un choix qui ne fait
      rien n'a plus à occuper une ligne.
    */
    expect(choixFeuille().map((c) => c.label)).toEqual([
      'Enregistrer',
      'Partir sans enregistrer',
    ]);
    // Et le geste destructeur se signale comme tel.
    expect(choixFeuille()[1].danger).toBe(true);
  });

  it('range le travail AVANT de partir', () => {
    const fait: string[] = [];
    garderLeTravail({
      demander,
      dirty: true,
      message: '',
      jeter: 'Partir',
      enregistrer: () => fait.push('enregistre'),
      partir: () => fait.push('part'),
    });
    choixFeuille()[0].onPress();
    // L'ordre compte : partir d'abord, c'est enregistrer un plan qu'on a
    // déjà quitté.
    expect(fait).toEqual(['enregistre', 'part']);
  });

  it('marque le geste destructeur, et dit ce qu’il coûte', () => {
    const fait: string[] = [];
    garderLeTravail({
      demander,
      dirty: true,
      message: '',
      jeter: 'Repartir sans enregistrer',
      enregistrer: () => fait.push('enregistre'),
      partir: () => fait.push('part'),
    });
    expect(choixFeuille()[1].danger).toBe(true);
    // Chaque issue dit sa conséquence sous son nom : la feuille a la place
    // qu'une alerte système n'avait pas.
    expect(choixFeuille()[1].hint).toMatch(/perdu/);
    choixFeuille()[1].onPress();
    expect(fait).toEqual(['part']);
    /*
      L'ISSUE DE SECOURS N'EST PLUS UNE LIGNE.

      L'alerte avait un troisième bouton, « Rester », qui ne faisait rien :
      il fallait bien une sortie à celui qui a touché par erreur. Nos
      feuilles se referment d'un appui à côté ou d'un glissement vers le
      bas — la sortie est le geste, pas un bouton — et un choix qui ne fait
      rien n'a plus à occuper une ligne.
    */
    expect(choixFeuille()).toHaveLength(2);
  });
});
