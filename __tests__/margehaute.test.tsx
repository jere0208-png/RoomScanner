/**
 * LA MARGE DU HAUT NE SE COMPTE QU'UNE FOIS.
 *
 * Releve du patron, capture a l'appui : « dans mes scans tout est descendu
 * sans raison en laissant une marge en haut ». Sur l'image, le titre « Mes
 * scans » commence au tiers de l'ecran, sous un blanc que rien n'explique.
 *
 * LA CAUSE EST UN STYLE POSE DEUX FOIS. La bibliotheque a ete enveloppee
 * dans `RetourGlisse` — le retour au glissement du bord gauche — et l'on a
 * passe a l'enveloppe le style de l'ecran, `container`, sans le retirer du
 * bloc qu'elle entoure. Les deux portaient donc le meme `paddingTop`, et
 * React Native les additionne comme deux boites imbriquees : la marge du
 * haut a double d'un coup, en silence.
 *
 * C'est le genre de defaut qu'aucun banc de comportement ne voit — tout
 * fonctionne, tout est atteignable, tout est simplement cinquante-huit
 * points trop bas.
 *
 * ON NE CHERCHE PAS UN CHIFFRE. La regle est de NATURE : la somme des marges
 * hautes, depuis la racine de l'ecran jusqu'a son en-tete, vaut ce que le
 * style de l'ecran declare — pas deux fois.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { RetourGlisse } from '../src/components/RetourGlisse';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const plat = (st: unknown) =>
  (StyleSheet.flatten(st as never) ?? {}) as Record<string, number>;

const monter = () => {
  useScanStore.setState({ saves: [], screen: 'library' });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<LibraryScreen />);
  });
  arbre = t;
  return t;
};

/**
 * LES MARGES HAUTES DECLAREES DANS LA CHAINE D'EMBOITEMENT, depuis
 * l'enveloppe de retour jusqu'au bloc qui met la page en page.
 *
 * C'est ce que l'oeil voit : deux boites imbriquees qui portent chacune
 * vingt points en font quarante. On ne regarde que les premieres — au-dela,
 * on est dans le contenu, et une carte a le droit d'avoir sa marge.
 */
const margesDuHaut = (t: TestRenderer.ReactTestRenderer) => {
  const enveloppe = t.root.findByType(RetourGlisse);
  const boites = [
    plat(enveloppe.props.style),
    ...enveloppe.findAllByType(View).slice(0, 2).map((n) => plat(n.props.style)),
  ];
  return boites.map((st) => Number(st.paddingTop ?? 0)).filter((v) => v > 0);
};

describe('l’écran « Mes scans »', () => {
  it('ne descend pas sa page de deux marges', () => {
    // Une seule boite de la chaine porte la marge du haut. Deux la doublent
    // — c'est exactement ce que la capture montrait.
    expect(margesDuHaut(monter())).toHaveLength(1);
  });

  it('garde une marge, tout de meme : le titre ne colle pas a l’heure', () => {
    // Le contraire du defaut serait de tout remonter sous la barre d'etat.
    expect(margesDuHaut(monter())[0]).toBeGreaterThan(30);
  });

  /*
    LE CONTROLE EN SENS INVERSE : un ecran dont l'enveloppe ET le bloc
    seraient tous deux SANS marge passerait la premiere epreuve. La seconde
    l'attrape.
  */
  it('et l’enveloppe remplit bien l’ecran, sinon le bord ne capte rien', () => {
    // `RetourGlisse` capte le glissement du bord gauche : sans hauteur, il
    // n'y a pas de bord a toucher.
    const enveloppe = monter().root.findByType(RetourGlisse);
    expect(plat(enveloppe.props.style).flex).toBe(1);
  });
});
