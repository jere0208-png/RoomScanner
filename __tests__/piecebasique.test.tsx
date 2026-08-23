/**
 * UNE PIECE BASIQUE : POSEE, EN POINTILLES, ETIREE PAR SES COTES.
 *
 * Deuxieme releve du patron sur l'ajout d'une piece, apres essai du geste
 * « poser un doigt, glisser, lacher » : « le "ajouter une piece" ne montre
 * pas qu'il faut creer la piece, et de plus au glissement, ca s'annule tout
 * seul avec le deplacement du plan. On doit faire une piece basique
 * modifiable comme un meuble sur ses cotes, en pointilles, et on doit
 * pouvoir le placer en le glissant avec le doigt dans sa surface ».
 *
 * Le magasin savait deja la poser (`addRoomLibre`) et la fermer
 * (`arreterPiece`). Restait ce que le DOIGT et l'OEIL en voient : le trait
 * pointille qui dit « pas encore arretee », et les quatre poignees de cote
 * — les memes que celles d'un meuble, parce qu'un geste qu'on connait deja
 * n'est pas un geste a apprendre.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { roomExtent, roomParts, type WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

const emprise = (roomId: string) => {
  const murs = st().walls.filter((w) => w.roomId === roomId);
  const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
  const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  };
};

const cotes = (roomId: string) => {
  const p = roomParts(st().walls, st().rooms).find((x) => x.roomId === roomId)!;
  return roomExtent(p.surface!.pts);
};

beforeEach(() => {
  mockMagasin.clear();
  st().reset();
  st().commencerAuClavier();
});

describe('etirer une piece par un cote', () => {
  it('pousse le bord tire et laisse l’oppose ou il est', () => {
    const id = st().addRoomLibre(3, 3, '')!;
    const av = emprise(id);
    st().resizeRoomSide(id, 'largeur+', 0.5);
    const ap = emprise(id);
    // Le bord gauche n'a pas bouge d'un millimetre ; le droit a suivi le
    // doigt. C'est ce qui distingue un etirement d'un deplacement.
    expect(ap.x0).toBeCloseTo(av.x0, 3);
    expect(ap.x1).toBeCloseTo(av.x1 + 0.5, 3);
    expect(cotes(id).width).toBeCloseTo(3.5, 2);
  });

  it('et dans l’autre sens, c’est le bord droit qui tient', () => {
    const id = st().addRoomLibre(3, 3, '')!;
    const av = emprise(id);
    st().resizeRoomSide(id, 'largeur-', 0.5);
    const ap = emprise(id);
    expect(ap.x1).toBeCloseTo(av.x1, 3);
    expect(ap.x0).toBeCloseTo(av.x0 - 0.5, 3);
  });

  it('tire aussi la profondeur, sans toucher a la largeur', () => {
    const id = st().addRoomLibre(3, 3, '')!;
    const av = emprise(id);
    st().resizeRoomSide(id, 'profondeur+', 0.4);
    const ap = emprise(id);
    expect(ap.z0).toBeCloseTo(av.z0, 3);
    expect(ap.z1).toBeCloseTo(av.z1 + 0.4, 3);
    // Et la largeur n'a pas bouge. On la mesure sur l'emprise, pas sur
    // `roomExtent` : sur un carre, celui-ci nomme « largeur » le plus grand
    // des deux cotes, quel que soit l'axe.
    expect(ap.x1 - ap.x0).toBeCloseTo(av.x1 - av.x0, 3);
  });

  /**
   * RIEN NE SE CUMULE — le defaut filme sur le chantier avec les meubles.
   *
   * La poignee envoie la distance TOTALE parcourue depuis l'appui, et l'etat
   * du depart avec. Cinquante images d'un meme geste doivent donner la meme
   * piece qu'un seul appel : sans ce point fixe, chaque image repart d'une
   * cote deja corrigee par la borne, et la piece part en vrille.
   */
  it('donne le meme resultat en cinquante images qu’en un seul appel', () => {
    const id = st().addRoomLibre(3, 3, '')!;
    const e = emprise(id);
    const depart = {
      x0: e.x0,
      z0: e.z0,
      largeur: e.x1 - e.x0,
      profondeur: e.z1 - e.z0,
    };
    for (let i = 1; i <= 50; i++) {
      st().resizeRoomSide(id, 'largeur+', (0.8 * i) / 50, depart);
    }
    expect(cotes(id).width).toBeCloseTo(3.8, 2);
    expect(emprise(id).x0).toBeCloseTo(e.x0, 3);
  });

  it('ne fait qu’UN pas d’historique pour tout le geste', () => {
    const id = st().addRoomLibre(3, 3, '')!;
    const e = emprise(id);
    const depart = {
      x0: e.x0,
      z0: e.z0,
      largeur: e.x1 - e.x0,
      profondeur: e.z1 - e.z0,
    };
    for (let i = 1; i <= 30; i++) {
      st().resizeRoomSide(id, 'largeur+', (0.6 * i) / 30, depart);
    }
    st().undo();
    // Une annulation, et la piece a repris ses trois metres.
    expect(cotes(id).width).toBeCloseTo(3, 2);
  });

  it('ne laisse pas la piece devenir un trait', () => {
    const id = st().addRoomLibre(3, 3, '')!;
    st().resizeRoomSide(id, 'largeur-', -5);
    // Une piece de six centimetres ne s'attrape plus : on borne.
    expect(cotes(id).width).toBeGreaterThan(0.5);
  });
});

/**
 * ET CE QUE L'OEIL EN VOIT : le trait pointille, et les quatre poignees.
 */
describe('la piece neuve sur le plan', () => {
  const mur = (
    id: string,
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  });
  const MURS = [
    mur('n', 0, 0, 3, 0),
    mur('e', 3, 0, 3, 3),
    mur('s', 3, 3, 0, 3),
    mur('w', 0, 3, 0, 0),
  ];

  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  function plan(neuve: boolean) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: [
          { id: 'r1', name: 'Chambre', floor: null, neuve: neuve || undefined },
        ],
        fixtures: [],
        ceiling: [],
        photos: [],
        showFurniture: true,
      });
      tree = TestRenderer.create(
        <FloorplanEditor
          editable
          showMeasures={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          selectedRoomId="r1"
          onMoveRoom={() => {}}
          onSelectRoom={() => {}}
        />,
      );
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 340, height: 460 } },
          });
        }
      }
    });
    arbre = tree;
    return tree;
  }

  const pointilles = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAll((n) => !!n.props?.strokeDasharray).length;

  const COTES = ['largeur+', 'largeur-', 'profondeur+', 'profondeur-'];
  const poignee = (tree: TestRenderer.ReactTestRenderer, cote: string) =>
    tree.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === `Étirer le côté ${cote} de la pièce`,
    );

  it('se dessine en pointilles tant qu’elle n’est pas arretee', () => {
    expect(pointilles(plan(true))).toBeGreaterThan(0);
  });

  it('et en trait plein des qu’elle l’est', () => {
    expect(pointilles(plan(false))).toBe(0);
  });

  it('offre les quatre poignees de cote', () => {
    const tree = plan(true);
    // `findAll` compte la vue et son composant : on juge de la presence,
    // pas du nombre de noeuds.
    for (const c of COTES) expect(poignee(tree, c).length).toBeGreaterThan(0);
  });

  it('et les retire quand la piece est arretee', () => {
    const tree = plan(false);
    for (const c of COTES) expect(poignee(tree, c)).toHaveLength(0);
  });
});
