/**
 * LE BANDEAU D'UN MEUBLE — trois rangées, et il annonce ce qu'il prend.
 *
 * Relevé du patron, capture à l'appui : « réduis le bloc d'édition de meuble
 * comme tu peux intelligemment, il prend trop de place. Fais en sorte qu'il
 * soit pas sur un autre élément. »
 *
 * IL EN FAISAIT CINQ, et c'est ce qui le rendait énorme :
 *
 *   1. la silhouette et le nom du meuble, seuls sur leur ligne ;
 *   2. les quatre flèches et leur note ;
 *   3. « H » et « Pose », deux pastilles ;
 *   4. largeur × profondeur, deux pastilles ;
 *   5. « Pivoter » et « Retirer », deux pastilles à mot.
 *
 * Deux cent dix-sept points de haut sur un écran qui en fait huit cents :
 * plus du quart de la page pour régler un meuble, posé par-dessus le plan
 * qu'on est en train de regarder.
 *
 * TROIS RANGÉES SUFFISENT, ET RIEN N'EST RETIRÉ — c'est la contrainte qui
 * rend l'exercice intéressant. Les deux GESTES (pivoter, retirer) montent
 * dans la ligne du titre, à droite : cette ligne ne portait qu'un mot et
 * gardait toute sa hauteur pour lui. Et les QUATRE cotes tiennent sur une
 * seule rangée, chacune avec son mot À L'INTÉRIEUR de sa pastille — « H
 * 2,10 » plutôt que « H » posé à côté, ce qui coûtait une largeur et deux
 * marges pour une lettre.
 *
 * ET IL ANNONCE SON ENCOMBREMENT, comme le peigne « Afficher » l'a fait
 * avant lui. L'écran gardait un nombre écrit à la main — 132 — pour savoir
 * où NE PAS poser le menu d'un mur. Le bandeau en faisait 217 : la réserve
 * mentait de quatre-vingts points, et c'est exactement « il est sur un autre
 * élément ». Le nombre se calcule désormais dans le fichier qui dessine les
 * rangées, et l'écran le lit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  HAUTEUR_BANDEAU_MEUBLE,
  HAUTEUR_BANDEAU_MEUBLE_COURANTE,
  ObjectBar,
} from '../src/components/ObjectBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';
import type { ObjectData } from 'react-native-room-scan';

const MEUBLE: ObjectData = {
  id: 'o1',
  category: 'storage',
  width: 0.76,
  depth: 0.6,
  height: 2.1,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1.05, 1.5, 1],
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ObjectBar
        object={MEUBLE}
        styles={getStyles(light)}
        palette={light}
        onPrompt={() => {}}
        onResize={() => {}}
        onHeight={() => {}}
        onRotate={() => {}}
        onCancel={() => {}}
        onNudge={() => {}}
      />,
    );
  });
  arbre = t;
  return t;
};

/**
 * Un bouton, par son étiquette parlée.
 *
 * On accepte `onPressIn` autant que `onPress` : les quatre flèches partent à
 * l APPUI, pas au relâchement — sans quoi le premier centimètre attendrait
 * que le doigt se lève. Un banc qui ne chercherait que `onPress` ne les
 * verrait pas, et déclarerait absent ce qui est là.
 */
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    (n) =>
      n.props.accessibilityLabel === label &&
      (!!n.props.onPress || !!n.props.onPressIn),
  )[0];

/**
 * LA RANGÉE d'un nœud : la `View` qui est fille DIRECTE de la carte.
 *
 * Pas « la `View` ancêtre la plus proche » : chaque geste vit dans sa propre
 * cellule (la pastille et son mot dessous), qui est une `View`. Compter
 * celles-là ferait quatre rangées là où l'œil en voit trois — le banc aurait
 * mesuré la structure au lieu des ÉTAGES.
 */
const rangeeDe = (
  t: TestRenderer.ReactTestRenderer,
  n: TestRenderer.ReactTestInstance,
) => {
  const carte = t.root.findAllByType(View)[0];
  let p: TestRenderer.ReactTestInstance | null = n;
  let dernier: TestRenderer.ReactTestInstance | null = null;
  while (p) {
    if (p === carte) return dernier;
    if (p.type === View) dernier = p;
    p = p.parent ?? null;
  }
  return dernier;
};

describe('le bandeau tient sur trois rangées', () => {
  it('et pas une de plus', () => {
    const t = monter();
    /*
      ON COMPTE LES RANGÉES PAR CE QU'ELLES PORTENT, pas par la structure.

      Compter les `View` enfants de la carte ne prouve rien : une rangée peut
      s'envelopper, et un enveloppeur vide compterait pour une rangée. On
      relève donc la rangée de CHAQUE commande, et l'on compte les rangées
      distinctes — c'est le nombre d'étages que l'œil voit.
    */
    const rangees = new Set(
      t.root
        .findAll(
          (n) =>
            !!n.props.accessibilityLabel &&
            (!!n.props.onPress || !!n.props.onPressIn),
        )
        .map((n) => rangeeDe(t, n)),
    );
    expect(rangees.size).toBeLessThanOrEqual(3);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE, et c'est LE contrôle de ce lot : réduire un
    bandeau en lui retirant des réglages n'est pas le réduire, c'est
    l'amputer. Tout ce qu'on pouvait faire, on doit encore pouvoir le faire.
  */
  it('sans rien perdre : les quatre cotes et les deux gestes sont là', () => {
    const t = monter();
    for (const label of [
      'Largeur',
      'Profondeur',
      'Hauteur du meuble',
      'Hauteur de pose',
      'Pivoter',
      'Retirer le meuble',
      'Déplacer vers le haut',
      'Déplacer vers le bas',
      'Déplacer vers la gauche',
      'Déplacer vers la droite',
    ]) {
      expect({ label, present: !!bouton(t, label) }).toEqual({
        label,
        present: true,
      });
    }
  });

  it('les deux gestes montent dans la ligne du titre', () => {
    const t = monter();
    const titre = t.root
      .findAllByType(Text)
      .find((n) => String(n.props.children).length > 0)!;
    const rangeeTitre = rangeeDe(t, titre);
    // Pivoter et Retirer partagent la rangée du nom : c'est elle qui portait
    // un seul mot et gardait toute sa hauteur pour lui.
    for (const label of ['Pivoter', 'Retirer le meuble']) {
      let p: TestRenderer.ReactTestInstance | null = bouton(t, label);
      let partage = false;
      while (p) {
        if (p === rangeeTitre) {
          partage = true;
          break;
        }
        p = p.parent ?? null;
      }
      expect({ label, partage }).toEqual({ label, partage: true });
    }
  });

  it('et les quatre cotes tiennent sur UNE rangée', () => {
    const t = monter();
    const rangees = new Set(
      ['Largeur', 'Profondeur', 'Hauteur du meuble', 'Hauteur de pose'].map(
        (l) => rangeeDe(t, bouton(t, l)),
      ),
    );
    expect(rangees.size).toBe(1);
  });
});

describe('il annonce ce qu’il prend', () => {
  /*
    CE QU'ON VOIT, ET CE QU'ON RÉSERVE — deux nombres, et c'est voulu.

    Le bandeau fait trois rangées sur un iPhone courant : c'est ce que le
    patron verra. Sur un petit modèle, les quatre cotes passent à la ligne
    et il en fait quatre. L'écran réserve LE PIRE des deux.

    Déclarer l'ordinaire serait refaire, à l'envers, le défaut qu'on vient de
    corriger : une réserve trop courte laisse poser un menu SUR le bandeau.
    Une réserve un peu large ne coûte que quelques points de plan gardés pour
    rien. Les deux erreurs ne se valent pas.
  */
  it('réserve le PIRE cas, pas l’ordinaire', () => {
    expect(HAUTEUR_BANDEAU_MEUBLE).toBeGreaterThan(
      HAUTEUR_BANDEAU_MEUBLE_COURANTE,
    );
    // Une rangée de cotes de plus, et son interligne : pas davantage.
    expect(
      HAUTEUR_BANDEAU_MEUBLE - HAUTEUR_BANDEAU_MEUBLE_COURANTE,
    ).toBeLessThanOrEqual(34 + 12);
  });

  /*
    ET C'EST BIEN PLUS PETIT QU'AVANT. Cinq rangées faisaient deux cent
    dix-sept points ; ce qu'on voit doit en faire nettement moins, sans quoi
    on aurait réorganisé sans rien gagner — et c'est le reproche du patron.
  */
  it('et ce qu’on voit est un bon tiers plus petit qu’avant', () => {
    expect(HAUTEUR_BANDEAU_MEUBLE_COURANTE).toBeLessThan(217 * 0.72);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE : même le pire cas reste sous l'ancien
    ordinaire. Sans lui, on aurait pu « réduire » le bandeau à trois rangées
    tout en réservant plus de place qu'avant — et rien n'aurait changé pour
    ce que le plan peut poser.
  */
  it('et même le pire cas tient sous les cinq rangées d’avant', () => {
    expect(HAUTEUR_BANDEAU_MEUBLE).toBeLessThan(217);
  });
});
