/**
 * UN ÉTAGE À LA FOIS, ET UN ÉTAGE QU'ON PEUT DÉFAIRE.
 *
 * Relevé du patron, capture à l'appui : « ajouter un étage ne fonctionne pas
 * bien, une construction mal faite apparaît sur un autre plan, et rien ne
 * peut se séparer, revois tout ça pour que ce soit facile, logique ».
 *
 * Sur sa capture, le sélecteur dit « R+1 », l'en-tête compte deux murs et
 * 3,6 m² — et l'on voit DEUX logements l'un sur l'autre, chacun avec son
 * cartouche de pièce. L'écran des résultats filtrait bien par niveau : ses
 * chiffres, son métré, son dossier ne parlent que de l'étage choisi. Mais le
 * DESSIN, lui, ne filtrait rien : le plan et la 3D lisaient les murs, les
 * pièces, les meubles et l'appareillage DIRECTEMENT dans le magasin, tous
 * niveaux confondus.
 *
 * Ce n'est pas seulement laid. Les jonctions d'onglet se calculent sur le
 * graphe des murs : deux étages mêlés, et un mur du haut s'assemble avec un
 * mur du bas qu'il croise — la « construction mal faite ». En volume, c'est
 * pire : les deux niveaux sont posés à la même altitude, l'un DANS l'autre.
 *
 * Et rien ne pouvait se séparer, en effet : le menu des étages savait en
 * ajouter et les recaler, jamais en retirer. Un relevé raté restait dans le
 * dossier pour toujours.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { NIVEAU_RDC, niveauDe, type WallSeg } from '../src/geometry/floorplan';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  roomId: string,
  niveau?: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
  ...(niveau === undefined ? {} : { niveau }),
});

/*
  DEUX LOGEMENTS DE 5 × 4, ET L'ÉTAGE TOMBE À CÔTÉ.

  Douze mètres de décalage : c'est le cas NORMAL, pas l'exception. ARKit
  repart de l'endroit où l'on a appuyé sur « Scanner », et après un escalier
  le relevé du haut tombe où il veut. C'est ce qui rend le défaut si visible
  sur la capture du patron — les deux plans côte à côte, mêlés — et c'est ce
  qui permet ici de dire lequel est dessiné.
*/
const BAS = [
  mur('bn', 0, 0, 5, 0, 'rbas'),
  mur('be', 5, 0, 5, 4, 'rbas'),
  mur('bs', 5, 4, 0, 4, 'rbas'),
  mur('bo', 0, 4, 0, 0, 'rbas'),
];
const D = 12;
/* Et il n'a pas les mêmes cotes : c'est à elles qu'on le reconnaît. */
const HAUT = [
  mur('hn', D, 0, D + 3, 0, 'rhaut', 1),
  mur('he', D + 3, 0, D + 3, 2, 'rhaut', 1),
  mur('hs', D + 3, 2, D, 2, 'rhaut', 1),
  mur('ho', D, 2, D, 0, 'rhaut', 1),
];
const PIECES = [
  { id: 'rbas', name: 'Cuisine', floor: null, wallIds: BAS.map((w) => w.id) },
  {
    id: 'rhaut',
    name: 'Chambre',
    floor: null,
    niveau: 1,
    wallIds: HAUT.map((w) => w.id),
  },
];

const poser = (niveau: number) => {
  useScanStore.setState({
    walls: [...BAS, ...HAUT],
    openings: [],
    objects: [],
    rooms: PIECES as never,
    fixtures: [],
    ceiling: [],
    photos: [],
    notes: [],
    niveauCourant: niveau,
    // Le cartouche d'une pièce — son nom — vit dans le calque « Surfaces ».
    showSurfaces: true,
  });
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Les mots réellement peints dans le dessin. */
const mots = (t: TestRenderer.ReactTestRenderer) =>
  [...t.root.findAllByType(SvgText), ...t.root.findAllByType(Text)]
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string')
        .join(''),
    )
    .join(' | ');

const monter = (quoi: 'plan' | 'volume', niveau: number) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    poser(niveau);
    t = TestRenderer.create(
      quoi === 'plan' ? (
        <FloorplanEditor
          showMeasures
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
        />
      ) : (
        <Iso3DView value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }} />
      ),
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
  });
  arbre = t;
  return t;
};

describe('le plan ne montre qu’un étage à la fois', () => {
  it('en plan : l’étage choisi, et lui seul', () => {
    expect(mots(monter('plan', 1))).toContain('Chambre');
    expect(mots(monter('plan', 1))).not.toContain('Cuisine');
  });

  it('et le rez-de-chaussée quand c’est lui qu’on regarde', () => {
    expect(mots(monter('plan', NIVEAU_RDC))).toContain('Cuisine');
    expect(mots(monter('plan', NIVEAU_RDC))).not.toContain('Chambre');
  });

  /*
    EN VOLUME, on ne juge pas sur les cartouches : ils ne se posent qu'au
    zoom. On pose donc une prise à chaque étage, à des hauteurs qui ne se
    confondent pas — 25 cm en bas, 110 en haut — et l'on regarde laquelle
    porte sa cote. Une prise du rez qui se dessine sur le plan de l'étage,
    c'est le défaut même : les deux niveaux n'ont pas d'altitude propre, ils
    sont rendus au MÊME sol, l'un dans l'autre.
  */
  const volumeAvecPrises = (niveau: number) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      poser(niveau);
      useScanStore.setState({
        fixtures: [
          { id: 'f1', kind: 'prise', wallId: 'bn', along: 1, height: 0.25, side: 1 },
          { id: 'f2', kind: 'prise', wallId: 'hn', along: 1, height: 1.1, side: 1 },
        ] as never,
      });
      t = TestRenderer.create(
        <Iso3DView
          value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }}
          showMeasures
        />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
    });
    arbre = t;
    return mots(t);
  };

  it('en volume aussi : deux niveaux au même sol, c’est l’un DANS l’autre', () => {
    const haut = volumeAvecPrises(1);
    // La maçonnerie de l'étage, et sa prise à 110.
    expect(haut).toContain('3,00 m');
    expect(haut).toContain('110');
    // Rien du rez : ni ses cotes de 5 m, ni sa prise à 25.
    expect(haut).not.toContain('5,00 m');
    expect(haut).not.toContain('25');
    const bas = volumeAvecPrises(NIVEAU_RDC);
    expect(bas).toContain('5,00 m');
    expect(bas).toContain('25');
    expect(bas).not.toContain('3,00 m');
    expect(bas).not.toContain('110');
  });
});

describe('retirer un étage', () => {
  it('emporte tout ce qui vit dessus, et rien d’autre', () => {
    poser(1);
    useScanStore.setState({
      fixtures: [
        { id: 'f1', kind: 'prise', wallId: 'hn', along: 1, height: 0.25, side: 1 },
        { id: 'f2', kind: 'prise', wallId: 'bn', along: 1, height: 0.25, side: 1 },
      ] as never,
    });
    useScanStore.getState().retirerNiveau(1);
    const st = useScanStore.getState();
    expect(st.walls.map((w) => w.id).sort()).toEqual(BAS.map((w) => w.id).sort());
    expect(st.rooms.map((r) => r.id)).toEqual(['rbas']);
    expect(st.fixtures.map((f) => f.id)).toEqual(['f2']);
    // Et l'on ne reste pas sur un étage qui n'existe plus.
    expect(st.niveauCourant).toBe(NIVEAU_RDC);
    expect(st.dirty).toBe(true);
  });

  it('refuse d’emporter le dernier niveau du dossier', () => {
    poser(NIVEAU_RDC);
    useScanStore.setState({ walls: BAS, rooms: [PIECES[0]] as never });
    useScanStore.getState().retirerNiveau(NIVEAU_RDC);
    // Un dossier sans aucun mur n'est pas un dossier : c'est un plan vierge,
    // et cela se demande autrement (le menu du plan sait le faire).
    expect(useScanStore.getState().walls).toHaveLength(4);
  });

  it('se défait d’un seul repentir', () => {
    poser(1);
    useScanStore.getState().retirerNiveau(1);
    useScanStore.getState().undo();
    const st = useScanStore.getState();
    expect(st.walls.filter((w) => niveauDe(w) === 1)).toHaveLength(4);
  });
});
