/**
 * LA PAGE D'ABONNEMENT REFONDUE — une offre, pas un comparatif.
 *
 * L'ancienne page mettait deux colonnes côte à côte, Gratuit contre Pro,
 * chacune avec son pouce d'argile. Le comparatif se défend quand on hésite
 * entre deux formules ; ici il n'y en a qu'une à vendre, et la colonne
 * « Gratuit » occupait la moitié de l'écran pour rappeler ce que
 * l'utilisateur a DÉJÀ. Le patron a donné un design à suivre : un titre, le
 * choix de la facturation, une carte de prix, ce que l'offre apporte, et un
 * seul bouton en pied de page.
 *
 * Ce banc tient la nouvelle page. Il tient aussi ce qui ne change pas et ne
 * doit jamais disparaître : le code promo du patron, la restauration d'achat
 * exigée par Apple, et le fait qu'on ne vende jamais à qui a déjà payé.
 */
const mockMagasin = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

/** L'App Store en doublet : on regarde QUEL produit part à l'achat. */
const achats: string[] = [];
jest.mock('../src/native/account', () => ({
  acheterAbonnement: jest.fn(async (produit: string) => {
    achats.push(produit);
    return true;
  }),
  restaurerAbonnement: jest.fn(async () => false),
  connexionApple: jest.fn(async () => null),
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => {}),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import {
  PRIX_PRO,
  PRIX_PRO_AN,
  PRODUIT_PRO,
  PRODUIT_PRO_AN,
  useAccountStore,
} from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

const noeuds = (a: TestRenderer.ReactTestRenderer) =>
  a.root.findAll(() => true, { deep: true });

const parLabel = (a: TestRenderer.ReactTestRenderer, label: string) =>
  noeuds(a).find((n) => n.props?.accessibilityLabel === label);

const texte = (a: TestRenderer.ReactTestRenderer) =>
  noeuds(a)
    .flatMap((n) => {
      const e = n.props?.children;
      if (typeof e === 'string') return [e];
      // La typo d'or n'écrit pas ses lettres en enfants : elle les porte.
      if (typeof n.props?.texte === 'string') return [n.props.texte];
      return [];
    })
    .join(' | ');

const rendre = () => {
  let a: TestRenderer.ReactTestRenderer;
  act(() => {
    a = TestRenderer.create(<PaywallScreen />);
  });
  return a!;
};

beforeEach(() => {
  mockMagasin.clear();
  achats.length = 0;
  useScanStore.setState({ themePref: 'light' });
  useAccountStore.setState({
    charge: true,
    compte: { id: 'c1', prenom: 'Sam', methode: 'email' },
    jeton: null,
    pro: false,
    paywallVisible: true,
    remisePct: 0,
    codeOffert: null,
  });
});

describe('la page se lit de haut en bas', () => {
  it('annonce l’offre, son prix et ce qu’elle apporte', () => {
    const a = rendre();
    const t = texte(a);
    expect(t).toContain('Pro');
    expect(t).toContain(PRIX_PRO);
    // Ce qu'on achète s'ÉNUMÈRE : un prix sans liste ne dit pas ce qu'on
    // paie, et la moitié des fonctions de l'app ne se devinent pas.
    expect(t).toContain('Relevés illimités');
    expect(noeuds(a).filter((n) => n.props?.testID === 'ligne-atout').length)
      .toBeGreaterThanOrEqual(5);
  });

  it('se referme par la flèche de retour', () => {
    const a = rendre();
    act(() => {
      parLabel(a, 'Retour')?.props.onPress();
    });
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });
});

describe('mensuel ou annuel', () => {
  it('part sur le mensuel, marqué comme tel', () => {
    const a = rendre();
    expect(
      parLabel(a, 'Facturation mensuelle')?.props.accessibilityState?.selected,
    ).toBe(true);
    expect(texte(a)).toContain(PRIX_PRO);
  });

  it('l’annuel change le prix affiché et dit ce qu’il fait gagner', () => {
    const a = rendre();
    act(() => {
      parLabel(a, 'Facturation annuelle')?.props.onPress();
    });
    const t = texte(a);
    expect(t).toContain(PRIX_PRO_AN);
    // Un prix annuel plus GROS que le mensuel, sans rien pour l'expliquer,
    // se lit comme une punition : l'économie doit être écrite.
    expect(t).toMatch(/offert|économ/i);
  });

  it('achète le produit de l’offre choisie, pas un autre', async () => {
    const a = rendre();
    await act(async () => {
      await parLabel(a, 'S’abonner')?.props.onPress();
    });
    expect(achats).toEqual([PRODUIT_PRO]);

    achats.length = 0;
    useAccountStore.setState({ pro: false, paywallVisible: true });
    const b = rendre();
    act(() => {
      parLabel(b, 'Facturation annuelle')?.props.onPress();
    });
    await act(async () => {
      await parLabel(b, 'S’abonner')?.props.onPress();
    });
    expect(achats).toEqual([PRODUIT_PRO_AN]);
  });
});

describe('ce qui ne doit jamais disparaître', () => {
  it('garde le champ de code promo du patron', () => {
    const a = rendre();
    expect(parLabel(a, 'Code promo')).toBeDefined();
    expect(parLabel(a, 'Appliquer le code')).toBeDefined();
  });

  it('garde « Restaurer l’achat » — Apple l’exige', () => {
    const a = rendre();
    expect(parLabel(a, 'Restaurer l’achat')).toBeDefined();
  });

  it('montre la remise appliquée, prix plein barré à côté', () => {
    useAccountStore.setState({ remisePct: 20, codeOffert: 'FIRST20' });
    const a = rendre();
    const t = texte(a);
    // Une remise sans référence n'est qu'un prix comme un autre.
    expect(t).toContain('3,92 €');
    expect(t).toContain(PRIX_PRO);
  });
});
