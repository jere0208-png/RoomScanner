/**
 * LE BOUTON « VOIR SUR AMAZON » — le vrai logo, et ce qu'il annonce.
 *
 * DEUX VERSIONS DE CE BOUTON, ET LA PREMIÈRE REDESSINAIT LE LOGO. Elle traçait
 * la flèche sourire au trait, en se disant qu'un arc orange suffirait à faire
 * reconnaître Amazon. Relevé du patron, sans appel : « tu es sérieux avec ta
 * flèche pour Amazon ? tiens l'image du logo. »
 *
 * IL AVAIT RAISON, ET LA LEÇON DÉPASSE CE BOUTON : **une marque ne
 * s'approxime pas**. Un logo à peu près ressemblant ne se lit pas comme la
 * marque — il se lit comme une imitation, ce qui est pire que pas de logo du
 * tout sur un bouton dont tout l'intérêt est qu'on le reconnaisse SANS LIRE.
 * C'est la même famille de faute que « vérifier la boîte qu'on dessine, pas
 * celle qu'on a demandée » : on avait vérifié qu'un arc orange était dessiné,
 * pas qu'il ressemblait à quoi que ce soit.
 *
 * CE BANC GARDE DONC L'IMAGE. Il vérifie qu'on affiche le logotype fourni et
 * non un tracé maison — c'est la seule chose qu'un banc puisse tenir ici, et
 * c'est exactement celle qui a manqué.
 */
// Le thème tire le stockage du téléphone, qui est du code natif : Jest ne
// sait pas le lire. On le simule, comme partout ailleurs dans ces bancs.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BoutonAmazon } from '../src/components/BoutonAmazon';
import type { Offre } from '../src/geometry/magasin';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const OFFRE: Offre = {
  enseigne: 'Amazon',
  prix: 47.49,
  intitule: 'Legrand - Interrupteur différentiel bipolaire 40A type AC 30mA',
  reference: '092840',
  jour: '2026-08-28',
  asin: 'B007AKRUZG',
};

const rendu = (offre: Offre, reference: number) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <BoutonAmazon offre={offre} reference={reference} />,
    );
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

describe('le logo est celui de la marque', () => {
  it('c’est une IMAGE, pas un tracé redessiné à la main', () => {
    const t = rendu(OFFRE, 72.9);
    const images = t.root.findAllByType(Image);
    expect(images.length).toBeGreaterThan(0);
    // Une source d'image embarquée : `require` rend un identifiant, pas une
    // adresse — ce qui compte, c'est qu'il y en ait une.
    expect(images[0].props.source).toBeTruthy();
    // Et elle n'est pas déformée : un logotype étiré n'est plus le logotype.
    expect(images[0].props.resizeMode).toBe('contain');
  });

  it('et il se nomme, pour qui se fait lire l’écran', () => {
    const t = rendu(OFFRE, 72.9);
    expect(t.root.findAllByType(Image)[0].props.accessibilityLabel).toBe(
      'Amazon',
    );
  });
});

describe('le bandeau contient ce qu’il dessine', () => {
  /*
    « LE LOGO SORT DU BLOC », relevé du patron — et la vérification a montré
    que le bloc, lui, tenait : c'est la MAQUETTE que j'avais composée à la
    main qui plaçait le logo n'importe où, et je la lui avais montrée telle
    quelle. Deux images fausses avant de regarder la bonne.

    Ce qu'un banc peut tenir ici, ce n'est pas « ça a l'air bien » : c'est que
    le bloc n'impose AUCUNE hauteur et laisse donc son contenu le pousser.
    Une hauteur écrite en dur est la seule façon qu'un logo sorte d'un cadre —
    c'est la leçon du bandeau du meuble, qui mentait de quatre-vingts points
    sur sa réserve.
  */
  it('aucune hauteur écrite en dur : le contenu pousse le cadre', () => {
    const t = rendu(OFFRE, 72.9);
    const bouton = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && !!n.props?.style,
    )[0];
    const style = Array.isArray(bouton.props.style)
      ? Object.assign({}, ...bouton.props.style.filter(Boolean))
      : bouton.props.style;
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
    // Et le bloc empile : une rangée forcerait le logo à côté du texte.
    expect(style.flexDirection).toBeUndefined();
  });

  it('et le logo a une taille déclarée, sans quoi il prend celle du fichier', () => {
    const img = rendu(OFFRE, 72.9).root.findAllByType(Image)[0];
    const style = Array.isArray(img.props.style)
      ? Object.assign({}, ...img.props.style.filter(Boolean))
      : img.props.style;
    expect(typeof style.width).toBe('number');
    expect(typeof style.height).toBe('number');
    expect(style.width).toBeGreaterThan(style.height);
  });
});

describe('ce que le bandeau annonce', () => {
  /*
    RELEVÉ DU PATRON : « indique avec un texte discret "Un meilleur prix a été
    trouvé sur Amazon", et logo et prix ». La première version disait « Voir
    sur Amazon » — un ordre, là où il fallait une information.
  */
  it('la phrase du relevé, puis le prix et l’écart', () => {
    const lus = mots(rendu(OFFRE, 72.9)).join(' ');
    expect(lus).toContain('Un meilleur prix a été trouvé sur Amazon');
    expect(lus).toContain('47,49 €');
    expect(lus).toContain('25,41 €');
  });

  it('mais à prix ÉGAL, il ne parle pas de « meilleur prix »', () => {
    /*
      LE BOUTON S'AFFICHE AUSSI À ÉGALITÉ — c'est la règle du patron,
      « équivalent ou inférieur ». Écrire « un meilleur prix » sur un article
      qui coûte exactement pareil serait faux, et un chiffre faux, même petit,
      fait douter de tous les autres.
    */
    const lus = mots(rendu({ ...OFFRE, prix: 9.99 }, 9.99)).join(' ');
    expect(lus).not.toContain('meilleur prix');
    expect(lus).toContain('même prix');
    // Et aucune économie n'est annoncée : « − 0,00 € » ne veut rien dire.
    expect(lus).not.toContain('0,00');
  });
});
