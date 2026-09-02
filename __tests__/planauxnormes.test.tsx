/**
 * LE PLAN PASSE AUX NORMES — et l'app le dit, une fois.
 *
 * Troisième des dix améliorations : quand le contrôle NF C 15-100 tombe à
 * ZÉRO réserve, la récompense du travail bien fait — au moment exact où
 * elle a un sens.
 *
 * CE MOMENT N'EXISTAIT NULLE PART. L'écran comptait les réserves et les
 * listait ; passer de « 1 » à « 0 » ne produisait rien — le compteur
 * disparaissait, c'est tout. Or c'est LE moment du travail d'électricien :
 * celui où le plan devient montrable au client, et défendable au Consuel.
 *
 * TROIS GARDES, ET CHACUNE VAUT SON POIDS :
 *   — il faut avoir eu des réserves AVANT. Un plan vide n'a aucune réserve :
 *     féliciter quelqu'un qui vient d'ouvrir l'app, c'est lui apprendre que
 *     les félicitations de cette app ne valent rien ;
 *   — il faut du travail RÉEL — des appareils posés. Même raison, autrement
 *     dite ;
 *   — et ça ne se dit qu'UNE FOIS par plan. Une fête qui repasse à chaque
 *     aller-retour du contrôle devient un clignotant.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { celebrerSiAuxNormes, resetCelebration } from '../src/ui/auxNormes';
import { useAstuce } from '../src/ui/astuce';

const vider = () => {
  useAstuce.setState({ courante: null, file: [] });
  resetCelebration();
};

/** Ce que l'app vient de dire, s'il y a quelque chose. */
const dit = () => useAstuce.getState().courante;

beforeEach(vider);

describe('la fête du plan aux normes', () => {
  it('tombe quand la dernière réserve est levée', () => {
    // On avait des réserves, on a posé, il n'en reste plus.
    celebrerSiAuxNormes({ reserves: 2, appareils: 6 });
    expect(dit()).toBeNull();
    celebrerSiAuxNormes({ reserves: 0, appareils: 8 });
    expect(dit()?.fete).toBe(true);
    expect(dit()?.texte).toMatch(/NF C 15-100/);
  });

  it('mais jamais sur un plan qu’on vient d’ouvrir', () => {
    /*
      LA GARDE QUI COMPTE LE PLUS. Un plan vide n'a aucune réserve : sans
      elle, l'app félicite quelqu'un qui n'a rien fait — et l'on apprend du
      même coup que ses félicitations ne valent rien.
    */
    celebrerSiAuxNormes({ reserves: 0, appareils: 0 });
    expect(dit()).toBeNull();
  });

  it('ni sur un plan sans appareils, même après un passage à zéro', () => {
    celebrerSiAuxNormes({ reserves: 3, appareils: 0 });
    celebrerSiAuxNormes({ reserves: 0, appareils: 0 });
    expect(dit()).toBeNull();
  });

  it('et une seule fois : une fête qui repasse est un clignotant', () => {
    celebrerSiAuxNormes({ reserves: 2, appareils: 6 });
    celebrerSiAuxNormes({ reserves: 0, appareils: 8 });
    expect(dit()?.fete).toBe(true);
    useAstuce.setState({ courante: null, file: [] });
    // On repose une prise, une réserve revient, on la lève : silence.
    celebrerSiAuxNormes({ reserves: 1, appareils: 9 });
    celebrerSiAuxNormes({ reserves: 0, appareils: 10 });
    expect(dit()).toBeNull();
  });

  it('un nouveau plan a droit à sa propre fête', () => {
    // `resetCelebration` accompagne l'ouverture d'un dossier : la
    // récompense appartient AU PLAN, pas à la session.
    celebrerSiAuxNormes({ reserves: 2, appareils: 6 });
    celebrerSiAuxNormes({ reserves: 0, appareils: 8 });
    useAstuce.setState({ courante: null, file: [] });
    resetCelebration();
    celebrerSiAuxNormes({ reserves: 4, appareils: 3 });
    celebrerSiAuxNormes({ reserves: 0, appareils: 12 });
    expect(dit()?.fete).toBe(true);
  });
});

describe('l’écran du plan la déclenche', () => {
  it('par la mesure : il compte ses réserves et appelle la fête', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
      'utf8',
    );
    expect(src).toContain('celebrerSiAuxNormes');
    // Et l'ouverture d'un dossier rend sa fête au plan suivant.
    expect(src).toContain('resetCelebration');
  });
});
