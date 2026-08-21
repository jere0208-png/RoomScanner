/**
 * LA PAGE PROFIL — le compte devient un endroit, plus un popup.
 *
 * Le compte tenait dans une carte modale ouverte depuis l'accueil : un
 * avatar, un nom, trois boutons. Tout ce qui touche à l'utilisateur — son
 * identité, son abonnement, l'apparence de l'app, ses réglages — n'avait
 * donc nulle part où aller, et l'accueil se chargeait du reste : le bouton
 * de thème y flottait dans un coin, seul réglage de l'application à vivre
 * sur l'écran d'arrivée.
 *
 * Le patron a donné un design à suivre : une page pleine, un titre, des
 * sections. Ce banc tient ce qu'elle doit porter — l'identité, l'offre,
 * l'apparence en trois choix, les rangées — et surtout ce qu'elle a REPRIS
 * à l'accueil : le thème n'y est plus.
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

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { ProfilScreen } from '../src/screens/ProfilScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';

/** Tous les nœuds de l'arbre, à plat : on cherche par étiquette. */
const noeuds = (a: TestRenderer.ReactTestRenderer) =>
  a.root.findAll(() => true, { deep: true });

/** Le nœud portant cette étiquette d'accessibilité, ou `undefined`. */
const parLabel = (a: TestRenderer.ReactTestRenderer, label: string) =>
  noeuds(a).find((n) => n.props?.accessibilityLabel === label);

/** Tout le texte de l'écran, en une chaîne — de quoi chercher un mot. */
const texte = (a: TestRenderer.ReactTestRenderer) =>
  noeuds(a)
    .flatMap((n) => (typeof n.props?.children === 'string' ? [n.props.children] : []))
    .join(' | ');

const rendre = (quoi: React.ReactElement) => {
  let a: TestRenderer.ReactTestRenderer;
  act(() => {
    a = TestRenderer.create(quoi);
  });
  return a!;
};

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({
    charge: true,
    compte: { id: 'c1', prenom: 'Sam', email: 'sam@exemple.fr', methode: 'email' },
    jeton: null,
    pro: false,
    paywallVisible: false,
    plansUtilises: 0,
    bonusEssais: 0,
  });
  useScanStore.setState({ screen: 'profil', themePref: 'light', saves: [] });
});

describe("l'identité en tête", () => {
  it('porte le nom et l’adresse du compte', () => {
    const a = rendre(<ProfilScreen />);
    const t = texte(a);
    expect(t).toContain('Sam');
    expect(t).toContain('sam@exemple.fr');
  });

  it('revient à l’accueil par la flèche', () => {
    const a = rendre(<ProfilScreen />);
    act(() => {
      parLabel(a, 'Retour')?.props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('home');
  });
});

describe("l'abonnement, en carte", () => {
  it('en gratuit, propose l’offre — et l’ouvre', () => {
    const a = rendre(<ProfilScreen />);
    expect(texte(a)).toContain('Passer en Pro');
    act(() => {
      parLabel(a, 'Voir l’offre Pro')?.props.onPress();
    });
    expect(useAccountStore.getState().paywallVisible).toBe(true);
  });

  it('en Pro, la carte dit l’abonnement actif et ne vend plus rien', () => {
    useAccountStore.setState({ pro: true, proVia: 'abonnement' });
    const a = rendre(<ProfilScreen />);
    // Proposer d'acheter ce qu'on a déjà est la faute qui fait douter d'un
    // paiement passé.
    expect(parLabel(a, 'Voir l’offre Pro')).toBeUndefined();
    expect(texte(a)).toContain('EchoPlan Pro');
  });
});

describe("l'apparence a quitté l'accueil", () => {
  it('offre les trois choix, celui du moment marqué', () => {
    const a = rendre(<ProfilScreen />);
    for (const l of ['Thème système', 'Thème clair', 'Thème sombre']) {
      expect(parLabel(a, l)).toBeDefined();
    }
    // Le choix courant se VOIT : sans marque, on ne sait pas d'où l'on part.
    expect(parLabel(a, 'Thème clair')?.props.accessibilityState?.selected).toBe(
      true,
    );
    expect(parLabel(a, 'Thème sombre')?.props.accessibilityState?.selected).toBe(
      false,
    );
  });

  it('chaque rond pose sa préférence', () => {
    const a = rendre(<ProfilScreen />);
    act(() => {
      parLabel(a, 'Thème sombre')?.props.onPress();
    });
    expect(useScanStore.getState().themePref).toBe('dark');
    act(() => {
      parLabel(a, 'Thème système')?.props.onPress();
    });
    expect(useScanStore.getState().themePref).toBe('system');
  });

  it('l’accueil n’a plus de bouton de thème', () => {
    useScanStore.setState({ screen: 'home' });
    const a = rendre(<HomeScreen />);
    const reste = noeuds(a).filter((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Passer en thème'),
    );
    // Un réglage sur l'écran d'arrivée, c'est un réglage qu'on déclenche
    // par erreur en visant autre chose : il vit dans la page profil.
    expect(reste).toHaveLength(0);
  });

  it('le bloc profil de l’accueil ouvre la page, plus un popup', () => {
    useScanStore.setState({ screen: 'home' });
    const a = rendre(<HomeScreen />);
    act(() => {
      parLabel(a, 'Mon compte')?.props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('profil');
  });
});

describe('les rangées de réglages', () => {
  it('mènent à la bibliothèque', () => {
    useScanStore.setState({ saves: [] });
    const a = rendre(<ProfilScreen />);
    act(() => {
      parLabel(a, 'Mes scans')?.props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('library');
  });

  it('la suppression du compte demande confirmation', () => {
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const a = rendre(<ProfilScreen />);
    // Les deux gestes qu'on ne pose pas par mégarde vivent sous le « ⋯ » :
    // une déconnexion à portée de pouce, au milieu des réglages, se
    // déclenche en visant autre chose.
    act(() => {
      parLabel(a, 'Plus d’options')?.props.onPress();
    });
    act(() => {
      parLabel(a, 'Supprimer mon compte')?.props.onPress();
    });
    // Un geste destructif garde la feuille austère du système : la
    // déguiser en jolie carte l'affaiblirait.
    expect(alerte).toHaveBeenCalled();
    expect(useAccountStore.getState().compte).not.toBeNull();
    alerte.mockRestore();
  });

  it('la déconnexion rend la porte d’entrée', () => {
    const a = rendre(<ProfilScreen />);
    act(() => {
      parLabel(a, 'Plus d’options')?.props.onPress();
    });
    act(() => {
      parLabel(a, 'Se déconnecter')?.props.onPress();
    });
    expect(useAccountStore.getState().compte).toBeNull();
  });
});
