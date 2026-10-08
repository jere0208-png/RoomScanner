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
  // L'App Store ne répond pas dans ce banc : la page garde ce qu'on lui
  // a posé dans `offres`, ou ses prix de référence.
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => null),
}));

import React from 'react';
import { StyleSheet } from 'react-native';
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
    offres: null,
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
    expect(t).toContain('Plan PDF coté, à envoyer ou imprimer');
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

describe('la page tient dans l’écran, sans défilement', () => {
  /*
    RELEVÉ DU PATRON, CAPTURE À L'APPUI : « tout doit être visible sans
    scroll ». Une page qui vend et qu'il faut faire défiler cache la
    moitié de ce qu'elle vend — et le lecteur décide sur ce qu'il voit.

    Ce banc ne mesure pas des pixels (ils dépendent du téléphone) : il
    tient ce qui FAIT la hauteur — le nombre de lignes et leur longueur.
    Chaque atout doit tenir sur UNE ligne ; c'est le passage à deux lignes
    qui a fait déborder la page.
  */
  it('écrit ses atouts en une ligne chacun', () => {
    const a = rendre();
    const lignes = noeuds(a).filter((n) => n.props?.testID === 'ligne-atout');
    expect(lignes.length).toBeGreaterThanOrEqual(5);
    for (const l of lignes) {
      const mot = l.findAll((n) => typeof n.props?.children === 'string')[0];
      expect(String(mot.props.children).length).toBeLessThanOrEqual(40);
    }
  });

  it('« J’ai un code » n’ajoute rien à la page : c’est la feuille d’Apple qui s’ouvre', async () => {
    const { ouvrirCodeOffre } = require('../src/native/account');
    const a = rendre();
    expect(parLabel(a, 'Code promo')).toBeUndefined();
    await act(async () => {
      parLabel(a, 'J’ai un code')?.props.onPress();
    });
    expect(ouvrirCodeOffre).toHaveBeenCalled();
    // Ni champ ni bouton maison : un code se saisit chez Apple.
    expect(parLabel(a, 'Code promo')).toBeUndefined();
    expect(parLabel(a, 'Appliquer le code')).toBeUndefined();
  });

  it('ne pose rien d’inerte dans la barre du haut', () => {
    const a = rendre();
    // Relevé du patron : « un bloc blanc rond en haut à droite sans
    // raison ». C'était le vide qui recentre le titre — il avait pris la
    // peau du bouton de retour, ombre comprise.
    const barre = parLabel(a, 'Retour')!.parent!;
    const ronds = barre.children.filter(
      (e): e is TestRenderer.ReactTestInstance => typeof e !== 'string',
    );
    for (const n of ronds) {
      if (typeof n.props?.onPress === 'function') continue;
      const st = StyleSheet.flatten(n.props?.style) as
        | { backgroundColor?: string }
        | undefined;
      expect(st?.backgroundColor).toBeUndefined();
    }
  });
});

describe('ce qui ne doit jamais disparaître', () => {
  it('garde « J’ai un code », sous la main — pour les codes d’offre d’Apple', () => {
    const a = rendre();
    expect(parLabel(a, 'J’ai un code')).toBeDefined();
  });

  it('garde « Restaurer l’achat » — Apple l’exige', () => {
    const a = rendre();
    expect(parLabel(a, 'Restaurer l’achat')).toBeDefined();
  });

  it('montre l’offre de bienvenue d’Apple, prix plein barré à côté — seulement si elle s’applique', () => {
    const mensuel = {
      id: 'echoplan.pro.mensuel',
      prix: PRIX_PRO,
      valeur: 4.9,
      periode: { unite: 'mois' as const, valeur: 1 },
      offre: {
        prix: '3,92 €',
        valeur: 3.92,
        periode: { unite: 'mois' as const, valeur: 1 },
        nombre: 1,
        mode: 'remise' as const,
        eligible: true,
      },
    };
    useAccountStore.setState({ offres: { mensuel } });
    let a = rendre();
    // Une remise sans référence n'est qu'un prix comme un autre.
    expect(texte(a)).toContain('3,92 €');
    expect(texte(a)).toContain(PRIX_PRO);
    act(() => a.unmount());
    // Déjà eue : plus de prix barré.
    useAccountStore.setState({ offres: { mensuel: { ...mensuel, offre: { ...mensuel.offre, eligible: false } } } });
    a = rendre();
    expect(texte(a)).not.toContain('3,92 €');
  });
});
