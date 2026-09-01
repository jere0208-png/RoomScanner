/**
 * L'APPLICATION EST VIVANTE — les poses se voient naître.
 *
 * Relevé du patron : « ajoute de courtes animations fluides lors d'ajouts
 * et autres interactions avec l'application un peu partout pour rendre
 * l'app vivante. Par exemple, on fait un lien d'interrupteur à lumière, on
 * voit des pointillés qui se génèrent de l'interrupteur à la lampe, puis
 * la lampe qui s'allume à la fin de l'animation. »
 *
 * UN MÉCANISME, PAS DES CAS PARTICULIERS. Chaque calque sait désormais
 * quels éléments viennent de NAÎTRE (`useNaissances` : ce qui apparaît
 * après le premier rendu, jamais ce qu'on retrouve en ouvrant un dossier),
 * et chaque naissance se salue d'une ONDÉE — un anneau qui s'élargit et
 * s'éteint, celui du pouls des prises en 3D. Prises, spots, liens : le
 * même geste visuel partout, six dixièmes de seconde, et le mur redevient
 * calme.
 *
 * LE LIEN, LUI, SE TISSE : la courbe en pointillé se dessine DE
 * l'interrupteur VERS la lampe (le trait se déroule), puis la lampe
 * s'allume — un halo chaud qui monte et s'éteint. C'est la vitrine
 * demandée, mot pour mot.
 *
 * LA RÈGLE DE LA MAISON TIENT : on n'anime jamais ce qui se mesure. Les
 * ondées et le tissage sont des calques SÉPARÉS, à durée de vie courte,
 * posés par-dessus la géométrie — pas une cote, pas un trait de plan ne
 * change de valeur pendant qu'ils vivent.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { ElecSheet } from '../src/screens/result/ElecSheet';
import { useScanStore } from '../src/store/scanStore';
import { photoDe } from '../src/ui/produits';
import { FIXTURES } from '../src/geometry/electrical';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/*
  LE PLAFOND EST UNE PROP : c'est l'écran du plan qui le passe depuis le
  magasin. Le harnais fait pareil — sans lui, le calque ne voit rien.
*/
const Harnais = () => {
  const ceiling = useScanStore((s) => s.ceiling);
  return (
    <FloorplanEditor
      showMeasures
      showCeiling
      ceiling={ceiling}
      editable
      selectedWallId={null}
      onSelectWall={() => {}}
    />
  );
};

/** Un plan d'une pièce, monté comme l'éditeur le vit. */
const monterEditeur = () => {
  let roomId = '';
  let wallId = '';
  act(() => {
    useScanStore.getState().reset();
    useScanStore.getState().commencerAuClavier();
    roomId = useScanStore
      .getState()
      .addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 })!;
    wallId = useScanStore.getState().rooms[0].wallIds![0];
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <Harnais />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
  });
  arbre = t;
  return { t, roomId, wallId };
};

const ondees = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => String(n.props?.testID ?? '').startsWith('ondee-'));

const tissages = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => String(n.props?.testID ?? '').startsWith('lien-tisse'));

describe('chaque pose se salue d’une ondée', () => {
  it('une prise posée fait son anneau, puis le plan redevient calme', () => {
    const { t, wallId } = monterEditeur();
    expect(ondees(t)).toHaveLength(0);
    act(() => {
      useScanStore.getState().addFixture('prise', wallId);
    });
    expect(ondees(t).length).toBeGreaterThan(0);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(ondees(t)).toHaveLength(0);
  });

  it('un point de plafond aussi', () => {
    const { t, roomId } = monterEditeur();
    act(() => {
      useScanStore.getState().addCeiling('dcl', roomId, { x: 2, z: 1.5 });
    });
    expect(ondees(t).length).toBeGreaterThan(0);
  });

  it('mais rouvrir un dossier ne fait naître personne', () => {
    /*
      LE CONTRE-SENS QUI COMPTE : la naissance, c'est ce qui APPARAÎT après
      le premier rendu. Un plan rouvert avec ses trente prises n'est pas
      trente naissances — un accueil qui scintille de partout n'est plus
      vivant, il est agité.
    */
    const { wallId } = monterEditeur();
    act(() => {
      useScanStore.getState().addFixture('prise', wallId);
      arbre?.unmount();
    });
    arbre = null;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <Harnais />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({
        nativeEvent: { layout: { width: 390, height: 600 } },
      });
    });
    arbre = t;
    expect(ondees(t)).toHaveLength(0);
  });
});

describe('le lien se tisse, puis la lampe s’allume', () => {
  it('la vitrine demandée, mot pour mot', () => {
    const { t, roomId, wallId } = monterEditeur();
    let inter = '';
    let lampe = '';
    act(() => {
      inter = useScanStore.getState().addFixture('inter', wallId)!;
      lampe = useScanStore.getState().addCeiling('dcl', roomId, { x: 2, z: 1.5 });
      jest.advanceTimersByTime(2000);
    });
    expect(tissages(t)).toHaveLength(0);
    act(() => {
      const ok = useScanStore.getState().lierElements(inter, lampe);
      expect(ok).toBe(true);
    });
    // Le tissage vit : la courbe qui se déroule, puis le halo de la lampe.
    expect(tissages(t).length).toBeGreaterThan(0);
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    // Fini : il ne reste que le lien en pointillé, le trait de toujours.
    expect(tissages(t)).toHaveLength(0);
  });
});

describe('le catalogue élec en vraies images', () => {
  it('les tuiles portent la photo du devis, plus un pictogramme', () => {
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
    const tuilePrise = t.root
      .findAll((n) => n.props?.accessibilityLabel === FIXTURES.prise.label)
      .pop()!;
    expect(tuilePrise).toBeTruthy();
    expect(tuilePrise.findAllByType(Image).length).toBeGreaterThan(0);
  });

  it('et les déclinaisons sans photo propre reprennent celle de leur famille', () => {
    // Une prise double est une prise ; un va-et-vient double, un
    // va-et-vient. Sans renvoi, la moitié du catalogue montrerait un nom
    // dans une pastille à côté de vraies photos — un catalogue à trous.
    for (const code of [
      'meca-prise2',
      'meca-prise3',
      'meca-inter2',
      'meca-inter3',
      'meca-rj2',
      'meca-rjPrise',
      'meca-tvPrise',
    ]) {
      expect(photoDe(code)).toBeTruthy();
    }
  });
});
