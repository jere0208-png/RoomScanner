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
import { Alert } from 'react-native';
import { garderLeTravail } from '../src/ui/gardeTravail';

const appel = () => (Alert.alert as jest.Mock).mock.calls[0];
const choix = () =>
  (appel()[2] ?? []) as { text: string; style?: string; onPress?: () => void }[];

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('la garde du travail non enregistré', () => {
  it('ne demande rien quand il n’y a rien à perdre', () => {
    const fait: string[] = [];
    garderLeTravail({
      dirty: false,
      message: 'peu importe',
      jeter: 'Partir',
      enregistrer: () => fait.push('enregistre'),
      partir: () => fait.push('part'),
    });
    // Une confirmation inutile est une confirmation qu'on apprend à
    // balayer sans lire — et le jour où elle compte, on la balaie aussi.
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(fait).toEqual(['part']);
  });

  it('propose d’ENREGISTRER en premier', () => {
    garderLeTravail({
      dirty: true,
      message: 'Le plan a été modifié.',
      jeter: 'Partir sans enregistrer',
      enregistrer: () => {},
      partir: () => {},
    });
    expect(Alert.alert).toHaveBeenCalled();
    // Sur un chantier, on répond à une question sans la lire en entier :
    // le premier choix doit être celui qu'on veut neuf fois sur dix.
    expect(choix().map((c) => c.text)).toEqual([
      'Enregistrer',
      'Partir sans enregistrer',
      'Rester',
    ]);
  });

  it('range le travail AVANT de partir', () => {
    const fait: string[] = [];
    garderLeTravail({
      dirty: true,
      message: '',
      jeter: 'Partir',
      enregistrer: () => fait.push('enregistre'),
      partir: () => fait.push('part'),
    });
    choix()[0].onPress?.();
    // L'ordre compte : partir d'abord, c'est enregistrer un plan qu'on a
    // déjà quitté.
    expect(fait).toEqual(['enregistre', 'part']);
  });

  it('marque le geste destructeur, et laisse une issue de secours', () => {
    const fait: string[] = [];
    garderLeTravail({
      dirty: true,
      message: '',
      jeter: 'Repartir sans enregistrer',
      enregistrer: () => fait.push('enregistre'),
      partir: () => fait.push('part'),
    });
    expect(choix()[1].style).toBe('destructive');
    choix()[1].onPress?.();
    expect(fait).toEqual(['part']);
    // « Rester » ne fait rien : c'est l'issue de celui qui a touché par
    // erreur, et elle doit être sans conséquence.
    expect(choix()[2].style).toBe('cancel');
    expect(choix()[2].onPress).toBeUndefined();
  });
});
