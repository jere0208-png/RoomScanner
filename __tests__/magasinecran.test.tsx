/**
 * LA PAGE MAGASIN — et une dette que ce banc rembourse.
 *
 * `MagasinScreen` a été livrée SANS BANC D'ÉCRAN. Le catalogue avait le sien
 * (`magasin`), le devis aussi (`panierdevis`), mais la page elle-même — celle
 * qu'on touche — n'était tenue par rien. C'est le genre de trou qui ne se voit
 * pas le jour où on le creuse : tout marche, les bancs sont verts, et le
 * premier changement de mise en page casse quelque chose que personne ne
 * rattrape.
 *
 * CE QU'IL TIENT, ET POURQUOI CE SONT CES CHOSES-LÀ.
 *
 *   UNE PAGE, PAS UNE FEUILLE. C'est la leçon payée deux fois sur l'écran du
 *   devis : `SheetShell` enveloppe son contenu dans deux `Pressable`, un
 *   `Pressable` prend le geste dès le posé du doigt, et la liste posée dessous
 *   ne le récupère jamais. Un catalogue de cent seize articles qui ne défile
 *   pas n'est pas un catalogue ;
 *
 *   LE CADDIE VIT DANS LE MAGASIN, ce sont les mêmes ajouts que le devis lit.
 *   Deux listes d'articles pris — une pour le rayon, une pour le ticket —
 *   finiraient par diverger, et l'électricien paierait la différence ;
 *
 *   « − » NE DESCEND PAS SOUS ZÉRO. Une quantité négative n'existe pas au
 *   comptoir, et le bouton doit s'éteindre plutôt que de laisser faire ;
 *
 *   ET LE PRIX DIT TOUJOURS D'OÙ IL VIENT. C'est la règle du devis, et elle ne
 *   s'assouplit pas parce qu'on est au rayon : un prix relevé porte son
 *   enseigne, une estimation le dit.
 *
 * CE QU'IL NE PEUT PAS TENIR : le rendu. Il n'est pas regardable depuis cette
 * machine, et c'est écrit ici plutôt que sous-entendu.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MagasinScreen } from '../src/screens/MagasinScreen';
import { useScanStore } from '../src/store/scanStore';
import { GAMMES } from '../src/geometry/prix';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const ouvrir = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    /*
      LE MAGASIN SURVIT D'UN BANC À L'AUTRE, ET SON HISTORIQUE AUSSI : seul
      `reset()` efface le filet d'annulation. Une épreuve qui ajoute au caddie
      laisserait la suivante démarrer avec un caddie plein.
    */
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'magasin',
      gammeDevis: GAMMES[0].id,
      devisAjouts: [],
    });
    t = TestRenderer.create(<MagasinScreen />);
  });
  arbre = t;
  return t;
};

const mots = (t: TestRenderer.ReactTestRenderer): string[] =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((s) => s.length > 0);

/** Un bouton par son nom parlé — c'est ainsi qu'on le désigne à l'écran. */
const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      String(n.props?.accessibilityLabel ?? '').startsWith(nom),
  )[0];

describe('le catalogue se lit et se cherche', () => {
  it('les rayons sont là, dans l’ordre du chantier', () => {
    const lus = mots(ouvrir());
    // Le premier rayon est celui qu'on tire en premier sur un chantier.
    const conduits = lus.indexOf('CONDUITS ET CONDUCTEURS');
    const tableau = lus.indexOf('TABLEAU');
    expect(conduits).toBeGreaterThanOrEqual(0);
    expect(tableau).toBeGreaterThan(conduits);
  });

  it('et la recherche ne garde que ce qu’on a demandé', () => {
    const t = ouvrir();
    const champ = t.root.findByType(TextInput);
    act(() => champ.props.onChangeText('wago'));
    const lus = mots(t);
    expect(lus.some((m) => m.toLowerCase().includes('borne'))).toBe(true);
    expect(lus).not.toContain('Gaine ICTA Ø 20');
  });

  it('elle se moque des accents et de la casse', () => {
    const t = ouvrir();
    act(() => t.root.findByType(TextInput).props.onChangeText('PRÉFILÉE'));
    expect(mots(t).some((m) => m.includes('préfilée'))).toBe(true);
  });

  it('et quand rien ne correspond, elle le DIT au lieu d’une page vide', () => {
    const t = ouvrir();
    act(() => t.root.findByType(TextInput).props.onChangeText('zzzz'));
    expect(mots(t).some((m) => m.includes('Aucun article'))).toBe(true);
  });
});

describe('le caddie remplit le devis', () => {
  it('un appui sur « + » ajoute l’article au devis, pas à une liste à part', () => {
    /*
      C'EST LE POINT : le magasin n'a PAS sa propre liste. Ce qu'on prend au
      rayon est exactement ce que le ticket lira — deux listes finiraient par
      diverger, et l'électricien paierait la différence.
    */
    const t = ouvrir();
    const plus = bouton(t, 'Ajouter un');
    expect(plus).toBeDefined();
    act(() => plus.props.onPress());
    const ajouts = useScanStore.getState().devisAjouts;
    expect(ajouts).toHaveLength(1);
    expect(ajouts[0].quantite).toBe(1);
  });

  it('et le compte du caddie s’affiche, avec son total', () => {
    const t = ouvrir();
    act(() => bouton(t, 'Ajouter un').props.onPress());
    const lus = mots(t);
    expect(lus.some((m) => m.includes('article ajouté'))).toBe(true);
    expect(lus.some((m) => /\d+,\d{2} €/.test(m))).toBe(true);
  });

  it('« − » ne descend pas sous zéro : il s’éteint', () => {
    const t = ouvrir();
    const moins = bouton(t, 'Retirer un');
    expect(moins.props.disabled).toBe(true);
    // Et il s'allume dès qu'il y a quelque chose à retirer.
    act(() => bouton(t, 'Ajouter un').props.onPress());
    expect(bouton(t, 'Retirer un').props.disabled).toBe(false);
  });

  it('et retirer le dernier fait disparaître l’article du devis', () => {
    /*
      Un article du magasin qu'on repose n'a jamais eu de raison d'être au
      ticket — à la différence d'une ligne du métré, qui reste barrée à zéro
      parce qu'un article qu'on ne voit plus est un article qu'on croit
      oublié.
    */
    const t = ouvrir();
    act(() => bouton(t, 'Ajouter un').props.onPress());
    act(() => bouton(t, 'Retirer un').props.onPress());
    expect(useScanStore.getState().devisAjouts).toEqual([]);
  });
});

describe('le prix dit toujours d’où il vient', () => {
  it('chaque article porte son enseigne ou son estimation, et sa date', () => {
    const lus = mots(ouvrir());
    // Au moins un prix relevé en rayon, au moins une estimation : les deux
    // provenances cohabitent, et c'est ce que le lecteur doit pouvoir voir.
    expect(lus.some((m) => m.startsWith('Castorama · '))).toBe(true);
    expect(lus.some((m) => m.startsWith('Estimation'))).toBe(true);
  });
});

describe('c’est une PAGE, et elle défile', () => {
  it('un rouleau porte le catalogue', () => {
    expect(ouvrir().root.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it('et personne au-dessus de lui ne prend l’appui au posé', () => {
    /*
      LA CAUSE, ET NON LE SYMPTÔME — la leçon payée deux fois sur l'écran du
      devis. Un `Pressable` répond `true` à `onStartShouldSetResponder` : il
      prend le geste AU POSÉ du doigt, et la liste posée dessous doit le lui
      reprendre au premier millimètre de mouvement. Ce rattrapage ne se fait
      pas. Une page n'a pas de coquille ; une feuille en a deux.
    */
    const t = ouvrir();
    const rouleau = t.root.findAllByType(ScrollView)[0];
    let n = rouleau.parent;
    const coupables: string[] = [];
    while (n) {
      if (n.type === Pressable) coupables.push('Pressable');
      n = n.parent;
    }
    expect(coupables).toEqual([]);
  });

  it('et le retour ramène au devis, d’où l’on vient', () => {
    const t = ouvrir();
    act(() => bouton(t, 'Retour').props.onPress());
    expect(useScanStore.getState().screen).toBe('devis');
  });
});

describe('le contrôle en sens inverse', () => {
  it('la sonde des mots voit bien ce qu’elle prétend lire', () => {
    /*
      Une épreuve qui cherche des textes dans un arbre vide passerait tous les
      « ne contient pas » du dessus sans rien prouver. On vérifie donc que la
      page écrit BEAUCOUP — un catalogue de cent seize articles, ce sont des
      centaines de mots.
    */
    const t = ouvrir();
    expect(mots(t).length).toBeGreaterThan(100);
    expect(t.root.findAllByType(View).length).toBeGreaterThan(50);
  });
});
