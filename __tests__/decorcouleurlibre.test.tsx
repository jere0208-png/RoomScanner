/**
 * DÉCORER : LE MODÈLE DU MEUBLE, ET LA COULEUR LIBRE.
 *
 * Relevé du patron, mot pour mot : « Le choix des meubles dans Décorer doit
 * afficher le modèle du meuble choisi, et donne la possibilité de choisir
 * beaucoup de couleurs pour meubles, murs, sols, dans une palette de
 * sélection RGB. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { PixelRatio, StyleSheet, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DecorSheet, VIGNETTE_CARTE } from '../src/components/DecorSheet';
import { NuancierLibre, CIBLE_MIN } from '../src/components/NuancierLibre';
import * as vignette3d from '../src/geometry/vignette3d';
import { meubleAVoir } from '../src/components/VignetteMeuble';
import { useScanStore, type SavedScan } from '../src/store/scanStore';
import { useCouleursRecentes } from '../src/store/couleursRecentes';
import {
  bornerTeinte,
  estHex,
  hexVersHsv,
  hexVersRgb,
  hsvVersHex,
  hsvVersRgb,
  lireHex,
  rgbVersHex,
  rgbVersHsv,
} from '../src/ui/couleurLibre';
import { COULEUR_PERSONNALISEE, estCouleurLibre, hexDePeinture, nomDePeinture, nomDeTeinte } from '../src/ui/peintures';
import {
  TEINTE_LIBRE,
  cleDeTeinte,
  hexDeTeinte,
  peinturesDesPieces,
  solSurLePlan,
  solsDesPieces,
} from '../src/ui/habillage';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { MATIERE, ENTETE_SOL, composantes, maillageDeLaVisite } from '../src/geometry/visite3d';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { mixHex } from '../src/geometry/appearance';
import type { WallSeg } from '../src/geometry/floorplan';

/** Laisse passer quelques images (`requestAnimationFrame`, sous Jest : un `setTimeout`). */
const images = async (n = 12) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2));
    });
  }
};

// Des cotes à part pour chaque épreuve : le cache des vignettes ne sert pas d'une épreuve à l'autre.
let cote = 1;
const objet = (id: string, roomId: string, modele: string, category: string) => ({
  id,
  category,
  modele,
  width: 1 + cote * 0.001,
  depth: 0.9,
  height: 0.8,
  roomId,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0.5, 1, 1],
});

const mettreEnPlace = () => {
  cote++;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null },
        { id: 'r2', name: 'Chambre', floor: null },
      ] as never,
      objects: [
        objet('o1', 'r1', 'canape2', 'sofa'),
        objet('o2', 'r1', 'chaise', 'chair'),
        objet('o4', 'r2', 'lit140', 'bed'),
      ] as never,
    });
  });
};

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale="r1" />);
  });
  return t;
};
const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', {
    deep: false,
  })[0];
  expect([label, !!b]).toEqual([label, true]);
  act(() => b.props.onPress());
};
const parId = (t: TestRenderer.ReactTestRenderer, id: string) =>
  t.root.findAll((n) => n.props.testID === id, { deep: false });
const uriDe = (t: TestRenderer.ReactTestRenderer, id: string): string | undefined => parId(t, id)[0]?.props.source?.uri;
const piece = (id: string) => useScanStore.getState().rooms.find((r) => r.id === id)!;
const meuble = (id: string) => useScanStore.getState().objects.find((o) => o.id === id)!;

afterEach(() => jest.restoreAllMocks());

// ------------------------------------------------------------------------
describe('le modèle du meuble dans chaque carte', () => {
  beforeEach(mettreEnPlace);

  it('chaque carte porte la vignette 3D de SON meuble, calculée après la première image', async () => {
    const espion = jest.spyOn(vignette3d, 'vignetteDuMeuble');
    const t = monter();
    appuyer(t, 'Meubles');
    // Les cartes sont là, avec leur emplacement de vignette et leur pastille…
    for (const id of ['o1', 'o2']) expect(parId(t, `vignette-meuble-${id}`)).toHaveLength(1);
    expect(parId(t, 'vignette-meuble-o4')).toHaveLength(0);
    // … mais rien n'a été calculé pendant le rendu : la feuille s'ouvre d'abord.
    expect(espion).not.toHaveBeenCalled();
    await images();
    // Une vignette par carte, plus la grande du meuble choisi.
    for (const id of ['o1', 'o2']) expect(uriDe(t, `vignette-meuble-${id}-image`)).toMatch(/^data:image\/png;base64,/);
    expect(uriDe(t, 'vignette-grande-o1-image')).toMatch(/^data:image\/png;base64,/);
    expect(parId(t, 'vignette-meuble-choisi')).toHaveLength(1);
    // C'est bien le modèle de CE meuble : le canapé et la chaise diffèrent.
    expect(uriDe(t, 'vignette-meuble-o1-image')).not.toBe(uriDe(t, 'vignette-meuble-o2-image'));
    const calcules = espion.mock.calls.length;
    expect(calcules).toBe(3);
    act(() => t.unmount());
    // Rouverte, la feuille reprend tout au cache : aucun calcul.
    const t2 = monter();
    appuyer(t2, 'Meubles');
    expect(uriDe(t2, 'vignette-meuble-o1-image')).toMatch(/^data:image\/png/);
    await images(4);
    expect(espion.mock.calls.length).toBe(calcules);
    act(() => t2.unmount());
  });

  it('la vignette suit la teinte : nuancier ou couleur libre', async () => {
    const t = monter();
    appuyer(t, 'Meubles');
    await images();
    const avant = uriDe(t, 'vignette-meuble-o1-image');
    appuyer(t, 'Canapé 2 places : Bleu nuit');
    // L'image d'avant reste en place le temps du calcul : la carte ne clignote pas.
    expect(uriDe(t, 'vignette-meuble-o1-image')).toBe(avant);
    await images();
    const bleu = uriDe(t, 'vignette-meuble-o1-image');
    expect(bleu).not.toBe(avant);
    const f = Math.min(2, PixelRatio.get() || 1);
    expect(bleu).toBe(
      vignette3d.vignetteEnCache(
        meubleAVoir(meuble('o1')),
        Math.round(VIGNETTE_CARTE.largeur * f),
        Math.round(VIGNETTE_CARTE.hauteur * f),
      ),
    );
    // La pastille, en surimpression, dit la teinte.
    expect(meuble('o1').teinte).toBe(hexDeTeinte('bleuNuit'));
    act(() => t.unmount());
  });
});

// ------------------------------------------------------------------------
describe('les murs acceptent une couleur libre', () => {
  it('`hexDePeinture` rend un hexa libre tel quel ; un hexa mal formé ne donne rien', () => {
    expect(hexDePeinture('#A1B2C3')).toBe('#A1B2C3');
    expect(hexDePeinture('#ZZZZZZ')).toBeNull();
    expect(hexDePeinture('#ABC')).toBeNull();
    expect(hexDePeinture('sauge')).toBe('#D5DED0');
    expect(estCouleurLibre('#A1B2C3')).toBe(true);
    expect(estCouleurLibre('sauge')).toBe(false);
    expect(nomDePeinture('#A1B2C3')).toBe(COULEUR_PERSONNALISEE);
    expect(nomDePeinture('#nope')).toBeNull();
    // Pas de pot du commerce pour une couleur libre.
    expect(nomDeTeinte('#A1B2C3')).toBe('Teinte sur mesure #A1B2C3');
    expect(nomDeTeinte('')).toBe('Blanc cassé');
    expect(peinturesDesPieces([{ id: 'a', peinture: '#123456' }])).toEqual({
      a: '#123456',
    });
  });

  it('« Autre couleur… » ouvre le sélecteur sur la couleur actuelle ; « Tout le logement » peint partout', () => {
    mettreEnPlace();
    act(() => useScanStore.getState().setRoomPeinture('r1', 'sauge'));
    const t = monter();
    appuyer(t, 'Murs : autre couleur…');
    const champ = t.root.findByProps({ testID: 'nuancier-hexa' });
    expect(champ.props.value).toBe(hexDePeinture('sauge'));
    act(() => champ.props.onChangeText('#2a6f97'));
    act(() => champ.props.onSubmitEditing());
    expect(piece('r1').peinture).toBe('#2A6F97');
    expect(piece('r2').peinture).toBeUndefined();
    // La tuile et le titre le disent.
    const mots = t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));
    expect(mots.some((m) => m.includes(COULEUR_PERSONNALISEE))).toBe(true);
    appuyer(t, 'Tout le logement');
    appuyer(t, 'Appliquer la couleur #2A6F97');
    expect([piece('r1').peinture, piece('r2').peinture]).toEqual(['#2A6F97', '#2A6F97']);
    expect(parId(t, 'nuancier-libre')).toHaveLength(0);
    // UN « Annuler » défait le logement entier.
    appuyer(t, 'Annuler le dernier changement');
    expect([piece('r1').peinture, piece('r2').peinture ?? null]).toEqual(['#2A6F97', null]);
    act(() => t.unmount());
  });
});

// ------------------------------------------------------------------------
describe('les meubles : une teinte hors nuancier se dit', () => {
  it('`cleDeTeinte` ne confond plus une couleur libre avec « D’origine »', () => {
    expect(cleDeTeinte('#123456')).toBe(TEINTE_LIBRE);
    expect(cleDeTeinte(hexDeTeinte('sauge'))).toBe('sauge');
    expect(cleDeTeinte(null)).toBe('origine');
  });

  it('la couleur libre d’un meuble s’applique, et la pastille « Autre couleur » la porte', () => {
    mettreEnPlace();
    const t = monter();
    appuyer(t, 'Meubles');
    appuyer(t, 'Canapé 2 places : autre couleur…');
    const champ = t.root.findByProps({ testID: 'nuancier-hexa' });
    act(() => champ.props.onChangeText('C0FFEE'));
    act(() => champ.props.onSubmitEditing());
    expect(meuble('o1').teinte).toBe('#C0FFEE');
    const autre = t.root.findAll(
      (n) => n.props.accessibilityLabel === 'Canapé 2 places : autre couleur…' && n.props.onPress,
      { deep: false },
    )[0];
    expect(autre.props.accessibilityState.selected).toBe(true);
    // « D'origine » n'est plus coché.
    const origine = t.root.findAll(
      (n) => n.props.accessibilityLabel === 'Canapé 2 places : D’origine' && n.props.onPress,
      { deep: false },
    )[0];
    expect(origine.props.accessibilityState.selected).toBe(false);
    act(() => t.unmount());
  });
});

// ------------------------------------------------------------------------
describe('le sélecteur RGB', () => {
  it('hexa → TSV → hexa est exact, sur tout le cube par pas de 17, et au hasard', () => {
    const pas = [0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255];
    for (const r of pas)
      for (const g of pas)
        for (const b of pas) {
          const hex = rgbVersHex({ r, g, b });
          expect(hsvVersHex(hexVersHsv(hex))).toBe(hex);
          expect(hexVersRgb(hex)).toEqual({ r, g, b });
        }
    let graine = 7;
    const hasard = () => ((graine = (graine * 16807) % 2147483647) / 2147483647) * 256;
    for (let i = 0; i < 2000; i++) {
      const hex = rgbVersHex({ r: hasard(), g: hasard(), b: hasard() });
      expect(estHex(hex)).toBe(true);
      expect(hsvVersHex(hexVersHsv(hex))).toBe(hex);
    }
  });

  it('tout est borné : teinte, saturation, valeur, canaux', () => {
    expect(hsvVersHex({ h: 720, s: 1, v: 1 })).toBe('#FF0000');
    expect(hsvVersHex({ h: -120, s: 1, v: 1 })).toBe('#0000FF');
    expect(hsvVersHex({ h: 0, s: 5, v: -2 })).toBe('#000000');
    expect(hsvVersHex({ h: NaN, s: NaN, v: 9 })).toBe('#FFFFFF');
    expect(rgbVersHex({ r: 300, g: -5, b: 12.4 })).toBe('#FF000C');
    expect(bornerTeinte(360)).toBe(0);
    for (const c of [hsvVersRgb({ h: 1e9, s: -1, v: 3 }), hsvVersRgb({ h: 200, s: 0.5, v: 0.5 })]) {
      for (const v of [c.r, c.g, c.b]) expect(v >= 0 && v <= 255).toBe(true);
    }
    const t = rgbVersHsv({ r: 999, g: -1, b: 128 });
    expect(t.h >= 0 && t.h < 360 && t.s >= 0 && t.s <= 1 && t.v >= 0 && t.v <= 1).toBe(true);
  });

  it('une saisie hexadécimale invalide est refusée, une bonne est lue', () => {
    for (const mauvais of [
      '',
      'rouge',
      '#12345',
      '12345G',
      '#GGGGGG',
      '#A1B2C3D',
      '##A1B2C3',
      '#A1 B2C3',
      null,
      undefined,
    ]) {
      expect(lireHex(mauvais as never)).toBeNull();
    }
    expect(lireHex(' a1b2c3 ')).toBe('#A1B2C3');
    expect(lireHex('#c0ffee')).toBe('#C0FFEE');
  });

  const monterNuancier = (initiale = '#336699') => {
    const onLacher = jest.fn();
    const onAppliquer = jest.fn();
    const onGeste = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <NuancierLibre
          titre="Couleur des murs"
          initiale={initiale}
          onLacher={onLacher}
          onAppliquer={onAppliquer}
          onFermer={jest.fn()}
          onGeste={onGeste}
        />,
      );
    });
    const carre = t.root.findByProps({ testID: 'nuancier-carre' });
    act(() =>
      carre.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 140 } },
      }),
    );
    return { t, onLacher, onAppliquer, onGeste };
  };
  const toucher = (x: number, y: number) => ({
    nativeEvent: { locationX: x, locationY: y, pageX: x + 50, pageY: y + 300 },
  });

  it('le carré suit le doigt sans rien appliquer ; la couleur part au lâcher', async () => {
    const { t, onLacher, onGeste } = monterNuancier('#336699');
    const carre = t.root.findByProps({ testID: 'nuancier-carre' });
    act(() => carre.props.onResponderGrant(toucher(100, 70)));
    act(() => carre.props.onResponderMove(toucher(150, 40)));
    act(() => carre.props.onResponderMove(toucher(200, 0)));
    expect(onGeste).toHaveBeenLastCalledWith(true);
    // Pendant le geste : rien n'est parti au plan.
    expect(onLacher).not.toHaveBeenCalled();
    act(() => carre.props.onResponderRelease());
    expect(onGeste).toHaveBeenLastCalledWith(false);
    // La teinte de #336699 (210°), saturée et lumineuse au coin haut droit.
    const attendu = hsvVersHex({ h: 210, s: 1, v: 1 });
    expect(onLacher).toHaveBeenCalledTimes(1);
    expect(onLacher).toHaveBeenCalledWith(attendu);
    expect(t.root.findByProps({ testID: 'nuancier-hexa' }).props.value).toBe(attendu);
    // Un doigt qui sort du carré reste borné.
    act(() => carre.props.onResponderGrant(toucher(10, 10)));
    act(() => carre.props.onResponderMove(toucher(-500, 900)));
    act(() => carre.props.onResponderRelease());
    expect(onLacher).toHaveBeenLastCalledWith('#000000');
    act(() => t.unmount());
  });

  it('la barre de teinte et les curseurs R, G, B s’appliquent au lâcher', () => {
    const { t, onLacher } = monterNuancier('#FF0000');
    const barre = t.root.findByProps({ testID: 'nuancier-teinte' });
    act(() => barre.props.onResponderGrant(toucher(0, 10)));
    act(() => barre.props.onResponderMove(toucher(200 / 3, 10)));
    expect(onLacher).not.toHaveBeenCalled();
    act(() => barre.props.onResponderRelease());
    expect(onLacher).toHaveBeenLastCalledWith('#00FF00');
    // Le curseur B, au bout de sa piste (200 − 64 pt) : le bleu à fond.
    const bleu = t.root.findByProps({ testID: 'nuancier-b' });
    act(() => bleu.props.onResponderGrant(toucher(136, 10)));
    act(() => bleu.props.onResponderRelease());
    expect(onLacher).toHaveBeenLastCalledWith('#00FFFF');
    act(() => t.unmount());
  });

  it('le champ hexa refuse une saisie invalide, applique une bonne ; « Appliquer » retient la couleur', () => {
    const { t, onLacher, onAppliquer } = monterNuancier('#336699');
    const champ = () => t.root.findAllByType(TextInput)[0];
    act(() => champ().props.onChangeText('#12345G'));
    act(() => champ().props.onSubmitEditing());
    expect(onLacher).not.toHaveBeenCalled();
    expect(t.root.findAll((n) => n.props.testID === 'nuancier-refus', { deep: false })).toHaveLength(1);
    expect(champ().props.value).toBe('#336699');
    act(() => champ().props.onChangeText('a1b2c3'));
    act(() => champ().props.onSubmitEditing());
    expect(onLacher).toHaveBeenLastCalledWith('#A1B2C3');
    expect(t.root.findAll((n) => n.props.testID === 'nuancier-refus', { deep: false })).toHaveLength(0);
    appuyer(t, 'Appliquer la couleur #A1B2C3');
    expect(onAppliquer).toHaveBeenCalledWith('#A1B2C3');
    expect(useCouleursRecentes.getState().recentes[0]).toBe('#A1B2C3');
    act(() => t.unmount());
    // Rouvert : la couleur est dans les récentes, et s'y reprend d'un appui.
    const deux = monterNuancier('#000000');
    appuyer(deux.t, 'Couleur récente #A1B2C3');
    expect(deux.onLacher).toHaveBeenLastCalledWith('#A1B2C3');
    act(() => deux.t.unmount());
  });

  it('chaque zone a son libellé, et aucune cible ne fait moins de 44 pt', () => {
    const { t } = monterNuancier('#336699');
    const touchables = t.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        (typeof n.props.onClick === 'function' || typeof n.props.onResponderGrant === 'function'),
    );
    expect(touchables.length).toBeGreaterThanOrEqual(6);
    for (const n of touchables) {
      expect(typeof n.props.accessibilityLabel).toBe('string');
      const st = StyleSheet.flatten(n.props.style) ?? {};
      const h = (st.height ?? st.minHeight) as number;
      expect([n.props.accessibilityLabel, h >= CIBLE_MIN]).toEqual([n.props.accessibilityLabel, true]);
    }
    act(() => t.unmount());
  });
});

// ------------------------------------------------------------------------
const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

/** Le premier bloc de sol du maillage de visite : matière et teinte. */
const premierSol = (sols: number[]) => ({
  matiere: sols[0],
  rgb: sols.slice(2, 5),
});
const sceneDe = (piece: { sol?: string; solTeinte?: string }, matieres: Record<string, 'parquet' | 'carrelage'>) =>
  buildScene(MURS, [], [], {
    palette: PAL,
    showSurfaces: true,
    rooms: [{ id: 'r1', wallIds: ['n', 'e', 's', 'o'] }],
    sols: solsDesPieces([{ id: 'r1', ...piece }]),
    matieres,
  });

describe('la teinte libre du sol', () => {
  it('passe dans le maillage de la visite, et garde la matière du sol', () => {
    const HEX = '#2E7D32';
    // Un parquet de chêne, teinté : il reste un parquet.
    const chene = maillageDeLaVisite(sceneDe({ sol: 'chene' }, {}).faces);
    const cheneTeinte = maillageDeLaVisite(sceneDe({ sol: 'chene', solTeinte: HEX }, {}).faces);
    expect(premierSol(cheneTeinte.sols).matiere).toBe(MATIERE.parquet);
    expect(premierSol(chene.sols).rgb).not.toEqual(premierSol(cheneTeinte.sols).rgb);
    const attendu = composantes(mixHex(PAL.floor, HEX, 0.85));
    premierSol(cheneTeinte.sols).rgb.forEach((v, i) => expect(v).toBeCloseTo(attendu[i], 5));
    expect(cheneTeinte.sols.length).toBeGreaterThan(ENTETE_SOL);
    // « Selon la pièce » : la teinte libre garde la matière devinée (une salle d'eau carrelée).
    const sdb = maillageDeLaVisite(sceneDe({ solTeinte: HEX }, { r1: 'carrelage' }).faces);
    expect(premierSol(sdb.sols).matiere).toBe(MATIERE.carrelage);
    premierSol(sdb.sols).rgb.forEach((v, i) => expect(v).toBeCloseTo(attendu[i], 5));
    // Béton ciré : pas de joints, teinté quand même.
    const beton = maillageDeLaVisite(sceneDe({ sol: 'beton', solTeinte: HEX }, { r1: 'parquet' }).faces);
    expect(premierSol(beton.sols).matiere).toBe(MATIERE.aucune);
    // La maquette (carte graphique) reçoit la même teinte.
    const maquette = maillageDeLaMaquette(sceneDe({ sol: 'chene', solTeinte: HEX }, {}).faces);
    premierSol(maquette.sols).rgb.forEach((v, i) => expect(v).toBeCloseTo(attendu[i], 5));
  });

  it('se voit aussi sur le plan 2D ; illisible, elle ne compte pas', () => {
    expect(solSurLePlan('chene', '#FFFFFF', 0.5, '#000000')).toBe('#808080');
    expect(solSurLePlan(null, '#FFFFFF', 0.5, '#000000')).toBe('#808080');
    expect(solSurLePlan(null, '#FFFFFF', 0.5, 'vert')).toBeNull();
    expect(solsDesPieces([{ id: 'a', solTeinte: 'vert' }])).toEqual({});
  });

  it('dans Décorer : « Autre couleur… » teinte le sol sans toucher à sa matière ; un sol du nuancier la retire', () => {
    mettreEnPlace();
    act(() => useScanStore.getState().setRoomSol('r1', 'chene'));
    const t = monter();
    appuyer(t, 'Sol');
    appuyer(t, 'Sol : autre couleur…');
    const champ = t.root.findByProps({ testID: 'nuancier-hexa' });
    expect(champ.props.value).toBe('#C89A66');
    act(() => champ.props.onChangeText('#2E7D32'));
    act(() => champ.props.onSubmitEditing());
    expect([piece('r1').sol, piece('r1').solTeinte]).toEqual(['chene', '#2E7D32']);
    // Annulable.
    appuyer(t, 'Annuler le dernier changement');
    expect(piece('r1').solTeinte).toBeUndefined();
    act(() => useScanStore.getState().setRoomSolTeinte('r1', '#2e7d32'));
    expect(piece('r1').solTeinte).toBe('#2E7D32');
    // Un sol du nuancier porte sa propre teinte.
    appuyer(t, 'Sol : Noyer');
    expect([piece('r1').sol, piece('r1').solTeinte]).toEqual(['noyer', undefined]);
    act(() => t.unmount());
  });
});

// ------------------------------------------------------------------------
describe('la couleur libre se sauvegarde et se relit', () => {
  it('aller-retour par le dossier enregistré : murs, sol, meuble', () => {
    mettreEnPlace();
    const st = useScanStore.getState;
    act(() => {
      st().setRoomPeinture('r1', '#2A6F97');
      st().setRoomSol('r1', 'carrelage');
      st().setRoomSolTeinte('r1', '#B5651D');
      st().setObjectTeinte('o1', '#C0FFEE');
    });
    const s = st();
    const save = {
      id: 'libre',
      name: 'Couleurs libres',
      createdAt: 1,
      updatedAt: 1,
      modelPath: null,
      rooms: s.rooms,
      walls: s.walls,
      openings: s.openings,
      objects: s.objects,
    } as unknown as SavedScan;
    // Ce qui part sur le disque : du JSON.
    const relu = JSON.parse(JSON.stringify(save)) as SavedScan;
    act(() => {
      st().reset();
      useScanStore.setState({ saves: [relu] });
    });
    expect(st().rooms).toHaveLength(0);
    act(() => st().openSave('libre'));
    expect([piece('r1').peinture, piece('r1').sol, piece('r1').solTeinte]).toEqual(['#2A6F97', 'carrelage', '#B5651D']);
    expect(meuble('o1').teinte).toBe('#C0FFEE');
    expect(hexDePeinture(piece('r1').peinture)).toBe('#2A6F97');
    expect(solsDesPieces(st().rooms).r1).toEqual({
      hex: '#B5651D',
      motif: 'carrelage',
    });
  });

  it('la teinte libre du sol survit à « Redétecter les pièces »', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'result',
        walls: MURS.map((w) => ({ ...w, roomId: undefined })) as never,
      });
      useScanStore.getState().redetectRooms();
    });
    const id = useScanStore.getState().rooms[0]?.id;
    expect(id).toBeTruthy();
    act(() => {
      useScanStore.getState().setRoomPeinture(id, '#123456');
      useScanStore.getState().setRoomSolTeinte(id, '#654321');
    });
    act(() => useScanStore.getState().redetectRooms());
    const r = useScanStore.getState().rooms[0];
    expect([r.peinture, r.solTeinte]).toEqual(['#123456', '#654321']);
  });
});
