/**
 * LE PREMIER LANCEMENT — trois cartes, et rien qu'une fois.
 *
 * Relevé du patron : « on doit penser utilisateur simple, sans
 * professionnalisme forcément. On doit rendre la chose ludique. »
 *
 * L'application s'ouvrait sur un bouton « Commencer le scan », et rien
 * d'autre. Un électricien sait ce qu'il va y trouver ; quelqu'un qui vient
 * refaire son appartement voit un bouton qui lance sa caméra, et il ne sait ni
 * ce qu'il doit balayer, ni ce qu'il obtiendra. C'est le moment où l'on décide
 * si l'on continue, et c'était le seul écran muet.
 *
 * CE QUE CE BANC TIENT DE PARTICULIER : que les images viennent de la VITRINE.
 * Une capture d'écran refaite à la main vieillirait au premier changement de
 * dessin, et personne ne s'en apercevrait — l'accueil montrerait une
 * application qui n'existe plus. Ici, ce sont les mêmes images que celles qui
 * tournent derrière l'accueil, produites par la même géométrie.
 */
const mockDisque = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
}));

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PremierLancement } from '../src/components/PremierLancement';
import { SHOWCASE_IMAGES } from '../src/assets/showcase';
import { light } from '../src/theme';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (onFini = () => {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<PremierLancement onFini={onFini} />);
  });
  arbre = t;
  return t;
};

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      String(n.props?.accessibilityLabel ?? '').startsWith(nom),
  )[0];

describe('les trois cartes', () => {
  it('la première dit ce qu’on fait, pas ce que l’app est', () => {
    /*
      « Balayez la pièce » est une consigne ; « Scanner 3D LiDAR » est une
      fiche technique. Celui qui hésite à installer une application ne veut
      pas savoir ce qu'elle EST, il veut savoir ce qu'il va FAIRE.
    */
    expect(mots(monter())).toContain('Balayez la pièce');
  });

  it('et l’on avance jusqu’au bout', () => {
    const t = monter();
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(mots(t)).toContain('Posez vos prises');
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(mots(t)).toContain('Emportez le dossier');
  });

  it('la dernière ne dit plus « Suivant » : elle lance', () => {
    // Un « Suivant » sur la dernière carte laisse croire qu'il en reste une,
    // et l'on appuie en s'attendant à autre chose que l'accueil.
    const t = monter();
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(bouton(t, 'Suivant')).toBeUndefined();
    expect(mots(t)).toContain('C’est parti');
  });

  it('et c’est elle qui referme', () => {
    const fini = jest.fn();
    const t = monter(fini);
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Commencer').props.onPress());
    expect(fini).toHaveBeenCalled();
  });

  it('on peut passer à tout moment', () => {
    /*
      TROIS CARTES, C'EST COURT — et c'est justement pour ça qu'on peut les
      sauter sans rien perdre. Retenir quelqu'un devant une présentation est
      le meilleur moyen qu'il n'en lise aucune.
    */
    const fini = jest.fn();
    const t = monter(fini);
    act(() => bouton(t, 'Passer').props.onPress());
    expect(fini).toHaveBeenCalled();
  });

  it('trois points, et le vif suit la carte', () => {
    const t = monter();
    /*
      ON DÉDOUBLONNE PAR TESTID. `findAll` rend le nœud composite ET son
      nœud d'hôte : chaque point compte double, et l'index du vif se
      retrouve à deux au lieu de un. Le piège est connu de la maison.
    */
    const vif = () => {
      const vus = new Map<string, boolean>();
      for (const n of t.root.findAll((x) =>
        String(x.props?.testID ?? '').startsWith('point-'),
      )) {
        const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
          string,
          unknown
        >;
        const cle = String(n.props.testID);
        vus.set(cle, (vus.get(cle) ?? false) || st.backgroundColor === light.blue);
      }
      return [...vus.entries()].findIndex(([, allume]) => allume);
    };
    expect(vif()).toBe(0);
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(vif()).toBe(1);
  });
});

describe('les images sont celles de la vitrine', () => {
  it('chaque carte en montre une, et elle en vient', () => {
    /*
      C'EST LA GARANTIE DE JUSTESSE, et elle vaut plus que l'économie d'octets
      : ces images sortent de la même géométrie que l'application. Une
      illustration dessinée à côté vieillirait sans que personne ne le voie.
    */
    const t = monter();
    const source = () => t.root.findAllByType(Image)[0].props.source;
    expect(SHOWCASE_IMAGES).toContain(source());
    const premiere = source();
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(SHOWCASE_IMAGES).toContain(source());
    // Et ce n'est pas la même : trois cartes, trois moments.
    expect(source()).not.toBe(premiere);
  });

  it('et le cadre garde la proportion d’un écran', () => {
    /*
      LE CONTRÔLE QUI PROTÈGE LE DESSIN. Un cadre aux mauvaises proportions
      étirerait un plan — la seule chose qu'une application de métré ne peut
      pas se permettre, y compris sur une image de présentation.
    */
    const t = monter();
    const cadre = t.root
      .findAllByType(View)
      .map((n) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, number>)
      .find((st) => typeof st.width === 'number' && typeof st.height === 'number' && st.height > 200)!;
    expect(cadre).toBeDefined();
    // Les images cuites font 264 × 536 : un peu plus de deux fois plus haut
    // que large. Le cadre doit s'y tenir à quelques centièmes près.
    const rapport = cadre.height / cadre.width;
    expect(Math.abs(rapport - 536 / 264)).toBeLessThan(0.12);
  });
});
