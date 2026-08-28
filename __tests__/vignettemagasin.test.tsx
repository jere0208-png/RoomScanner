/**
 * UNE IMAGE PAR ARTICLE — et son NOM quand la photo manque.
 *
 * Relevé du patron : « donne des images à chaque élément du magasin aussi, et
 * si pas dispo marque sur l'image (par exemple si le Alim LED 24V est pas
 * dispo, on marque son nom proprement) ».
 *
 * OÙ ON EN ÉTAIT. Le ticket du devis portait des photos ; le magasin, non —
 * cent seize lignes de texte, où l'on cherche une gaine annelée entre deux
 * goulottes en lisant chaque libellé. La photo est ce qui fait reconnaître un
 * article avant de le lire.
 *
 * ET IL N'Y EN A QUE TRENTE. Le catalogue de photos couvre l'appareillage et
 * le tableau ; les consommables, les courants faibles et l'outillage n'en ont
 * pas. Quatre-vingt-six articles sur cent seize se retrouveraient donc avec un
 * trou à la place de l'image — d'où la pastille au nom, qui est exactement ce
 * que le relevé demande.
 *
 * POURQUOI ON NE RENVOIE PAS UNE PHOTO VOISINE, alors que la maison le fait
 * déjà pour les prises (« une 16, une 20 et une 32 sont le MÊME objet sur le
 * mur »). Parce qu'un disjoncteur PORTE SON CALIBRE IMPRIMÉ sur sa face : la
 * photo du 16 A posée sur la ligne du 6 A dirait « 16 » à côté d'un libellé
 * qui dit 6. Une vignette qui contredit sa ligne est pire qu'une vignette
 * absente — c'est la règle des prix appliquée aux images : ce qu'on ne peut
 * pas montrer honnêtement, on l'écrit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MagasinScreen } from '../src/screens/MagasinScreen';
import { useScanStore } from '../src/store/scanStore';
import { catalogueDuMagasin } from '../src/geometry/magasin';
import { photoDe } from '../src/ui/produits';
import { GAMMES } from '../src/geometry/prix';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const ouvrir = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
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

/** Les vignettes posées par l'écran, par code d'article. */
const vignettes = (t: TestRenderer.ReactTestRenderer) => {
  const out = new Map<string, { photo: boolean; nom: string | null }>();
  for (const n of t.root.findAll(
    (x) => typeof x.props?.testID === 'string' &&
      String(x.props.testID).startsWith('vignette-'),
  )) {
    const code = String(n.props.testID).slice('vignette-'.length);
    if (out.has(code)) continue;
    const photo = n.findAllByType(Image).length > 0;
    const textes = n.findAllByType(Text);
    out.set(code, {
      photo,
      nom: textes.length > 0 ? String(textes[0].props.children) : null,
    });
  }
  return out;
};

describe('chaque article du magasin porte une image', () => {
  it('aucune ligne ne reste sans vignette', () => {
    const t = ouvrir();
    const vues = vignettes(t);
    const codes = catalogueDuMagasin(GAMMES[0].id).map((a) => a.code);
    expect(codes.length).toBeGreaterThan(100);
    for (const code of codes) expect(vues.has(code)).toBe(true);
  });

  it('et celles dont on a la photo la portent VRAIMENT', () => {
    /*
      La photo, quand elle existe, vient de `photoDe` — la même table que le
      ticket du devis. Deux catalogues d'images pour un seul catalogue
      d'articles finiraient par montrer deux produits différents pour la même
      ligne.
    */
    const t = ouvrir();
    const vues = vignettes(t);
    const avecPhoto = catalogueDuMagasin(GAMMES[0].id).filter((a) =>
      photoDe(a.code),
    );
    expect(avecPhoto.length).toBeGreaterThan(20);
    for (const a of avecPhoto) expect(vues.get(a.code)?.photo).toBe(true);
  });
});

describe('quand la photo manque, la vignette porte le nom', () => {
  it('l’alimentation LED — l’exemple du relevé — écrit son nom', () => {
    const t = ouvrir();
    expect(photoDe('transfo-led')).toBeNull();
    const v = vignettes(t).get('transfo-led');
    expect(v?.photo).toBe(false);
    expect(v?.nom).toBe('Alimentation LED 24 V');
  });

  it('et tous les autres aussi : plus un seul trou', () => {
    const t = ouvrir();
    const vues = vignettes(t);
    for (const a of catalogueDuMagasin(GAMMES[0].id)) {
      if (photoDe(a.code)) continue;
      expect(vues.get(a.code)?.nom).toBe(a.libelle);
    }
  });

  it('mais un article QUI A sa photo n’écrit rien dessus', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte le banc : une pastille au nom
      posée partout ferait passer les deux épreuves du dessus sans qu'aucune
      photo ne s'affiche jamais.
    */
    const t = ouvrir();
    const vues = vignettes(t);
    const avecPhoto = catalogueDuMagasin(GAMMES[0].id).find((a) =>
      photoDe(a.code),
    )!;
    expect(vues.get(avecPhoto.code)?.nom).toBeNull();
  });
});

describe('« proprement » : le nom ne déborde pas de sa pastille', () => {
  it('le corps RÉTRÉCIT pour que le nom entier tienne', () => {
    /*
      « On marque son nom PROPREMENT ». Un libellé fait de trois à trente-deux
      signes — « Vis à placo » contre « Boîte d'encastrement Ø 67 double ».

      MESURÉ, ET C'EST CE QUI A DÉCIDÉ : dans une pastille de quarante-quatre
      points, un corps de 8 tient huit à neuf signes par ligne, et
      « Alimentation » en fait douze. Rendu tel quel, le mot se casse en deux
      ou déborde — les deux se lisent comme un défaut d'affichage.

      On ne rogne donc pas le libellé à la main, avec une estimation de largeur
      qui se tromperait de police : on demande au rendu de réduire le corps
      jusqu'à ce que le nom entier tienne, avec un plancher sous lequel on ne
      lit plus.
    */
    const t = ouvrir();
    const pastille = t.root
      .findAll(
        (x) => String(x.props?.testID ?? '') === 'vignette-transfo-led',
      )[0]
      .findAllByType(Text)[0];
    expect(pastille.props.adjustsFontSizeToFit).toBe(true);
    expect(pastille.props.numberOfLines).toBe(3);
    // Le plancher : en dessous, la coupure à la fin reprend la main.
    expect(pastille.props.minimumFontScale).toBeGreaterThanOrEqual(0.5);
    expect(pastille.props.ellipsizeMode).toBe('tail');
  });

  it('et le plus long libellé du catalogue reste tenu par la même règle', () => {
    // Le contrôle en sens inverse : la règle vaut pour tous, pas seulement
    // pour l'exemple du relevé.
    const t = ouvrir();
    const long = catalogueDuMagasin(GAMMES[0].id)
      .filter((a) => !photoDe(a.code))
      .sort((a, b) => b.libelle.length - a.libelle.length)[0];
    const pastille = t.root
      .findAll((x) => String(x.props?.testID ?? '') === `vignette-${long.code}`)[0]
      .findAllByType(Text)[0];
    expect(pastille.props.adjustsFontSizeToFit).toBe(true);
    // Le nom ENTIER est confié au rendu : on ne l'a pas rogné en amont.
    expect(String(pastille.props.children)).toBe(long.libelle);
  });
});
