/**
 * LE CATALOGUE DIT VRAI — photos vérifiées À L'ŒIL, une par une.
 *
 * Relevé du patron : « l'interrupteur affiche une image d'interrupteur
 * volet roulant.. pareil pour le double, triple.. le va-et-vient affiche un
 * bouton poussoir lumineux… "TV + prise" affiche que la TV.. on doit voir
 * les deux images avec un + au centre. Cherche bien les images, vérifies et
 * pose les. Trouve d'autres éléments à incorporer et rends-les
 * fonctionnels. »
 *
 * CE QUE LA VÉRIFICATION A MONTRÉ, image par image : `meca-inter.png`
 * montrait une commande à quatre directions — un inter de VOLET ROULANT ;
 * `meca-va.png` et `meca-poussoir.png` montraient tous deux un poussoir à
 * voyant ; aucun fichier du jeu ne montrait un interrupteur SIMPLE.
 *
 * CE QUI EN EST FAIT :
 *   — l'interrupteur simple est né par RETOUCHE : le poussoir à voyant,
 *     débarrassé de ses trois points (greffe d'un morceau propre du
 *     basculeur) — photoréaliste, et sans question de source ;
 *   — le va-et-vient RENVOIE à l'interrupteur simple : les deux produits
 *     ont la même face, c'est le câblage qui change — pas la photo ;
 *   — la photo de volet roulant cesse de mentir : elle devient celle d'un
 *     NOUVEL élément, l'inter volet roulant (`volet`), fonctionnel de bout
 *     en bout — catalogue, plan, devis ;
 *   — les COMBOS montrent leurs deux visages : « TV + prise » = la photo de
 *     la TV, un « + », la photo de la prise.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ElecSheet } from '../src/screens/result/ElecSheet';
import { DevisAttention } from '../src/components/DevisAttention';
import { photoDe } from '../src/ui/produits';
import { FIXTURES, FIXTURE_FAMILIES } from '../src/geometry/electrical';
import { catalogueDuMagasin } from '../src/geometry/magasin';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

describe('les photos disent ce qu’elles montrent', () => {
  it('le va-et-vient a la face de l’interrupteur simple — même photo', () => {
    expect(photoDe('meca-va')).toBe(photoDe('meca-inter'));
  });

  it('le volet roulant a la sienne, distincte de l’interrupteur', () => {
    expect(photoDe('meca-volet')).toBeTruthy();
    expect(photoDe('meca-volet')).not.toBe(photoDe('meca-inter'));
  });
});

describe('l’inter volet roulant est fonctionnel de bout en bout', () => {
  it('a sa fiche, sa famille, et son prix dans chaque gamme', () => {
    expect(FIXTURES.volet).toBeTruthy();
    expect(FIXTURES.volet.family).toBe('Commandes');
    const commandes = FIXTURE_FAMILIES.find((f) => f.name === 'Commandes');
    expect(commandes?.kinds).toContain('volet');
    // Un article sans prix n'est pas vendu : le magasin le porte, dans
    // chaque gamme.
    for (const gamme of ['dooxie', 'celiane', 'odace'] as const) {
      const article = catalogueDuMagasin(gamme as never).find(
        (a) => a.code === 'meca-volet',
      );
      expect(article).toBeTruthy();
      expect(article!.tarif.pu).toBeGreaterThan(0);
    }
  });
});

describe('les combos montrent leurs deux visages', () => {
  const monterCatalogue = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ElecSheet
          visible
          vue="catalogue"
          wallId={null}
          focusX={undefined}
          selectedId={null}
          onSelect={() => {}}
          onAddRequest={() => {}}
          onChoose={() => {}}
          onClose={() => {}}
        />,
      );
    });
    arbre = t;
    return t;
  };

  it('« TV + prise » : la TV, un plus, la prise', () => {
    const t = monterCatalogue();
    const tuile = t.root
      .findAll((n) => n.props?.accessibilityLabel === FIXTURES.tvPrise.label)
      .pop()!;
    expect(tuile).toBeTruthy();
    expect(tuile.findAllByType(Image).length).toBeGreaterThanOrEqual(2);
    const mots = tuile
      .findAllByType(Text)
      .map((n) => String(n.props.children))
      .join('');
    expect(mots).toContain('+');
  });

  it('« RJ45 + prise » pareil', () => {
    const t = monterCatalogue();
    const tuile = t.root
      .findAll((n) => n.props?.accessibilityLabel === FIXTURES.rjPrise.label)
      .pop()!;
    expect(tuile.findAllByType(Image).length).toBeGreaterThanOrEqual(2);
  });
});

describe('la page Attention du devis dit ce qui manque', () => {
  const monter = (props: { tableauAbsent?: boolean; manquesNfc?: number }) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DevisAttention {...props} />);
    });
    arbre = t;
    return t;
  };
  const mots = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Text)
      .map((n) =>
        Array.isArray(n.props.children)
          ? n.props.children.join('')
          : String(n.props.children),
      )
      .join(' | ');

  it('sans TGBT posé : le titre, la photo du coffret, et quoi faire', () => {
    const t = monter({ tableauAbsent: true });
    expect(mots(t)).toContain('Tableau non compté');
    expect(mots(t)).toMatch(/[Pp]osez/);
    // Une vraie image — la photo du tableau du devis, pas un pictogramme.
    expect(t.root.findAllByType(Image).length).toBeGreaterThan(0);
  });

  it('avec des réserves NF C 15-100 : leur compte, en clair', () => {
    const t = monter({ manquesNfc: 3 });
    expect(mots(t)).toContain('NF C 15-100');
    expect(mots(t)).toContain('3');
  });

  it('et rien de tout ça quand tout va bien', () => {
    const t = monter({ tableauAbsent: false, manquesNfc: 0 });
    expect(mots(t)).not.toContain('Tableau non compté');
    expect(mots(t)).not.toContain('NF C 15-100');
    // L'avertissement des luminaires, lui, est toujours là.
    expect(mots(t)).toContain('luminaires');
  });
});
