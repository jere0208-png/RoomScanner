/**
 * LE RECALAGE D'UN ÉTAGE, AU CENTIMÈTRE ET AU DEMI-DEGRÉ.
 *
 * Relevé du patron : « fais pareil pour tout le reste ». Le recalage ne se
 * faisait qu'au doigt, et ne tournait pas : un étage relevé de deux degrés de
 * travers le restait. Et les NOTES de l'étage restaient sur place quand on le
 * déplaçait.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { centreDuNiveau, pivoterPoint, type WallSeg } from '../src/geometry/floorplan';
import { PAS_ROTATION, RecalageBar } from '../src/components/RecalageBar';
import { useScanStore } from '../src/store/scanStore';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, niveau: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  niveau,
});
const proche = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThan(1e-6);

const poser = () =>
  useScanStore.setState({
    walls: [
      mur('r0', 0, 0, 4, 0, 0),
      mur('e0', 0, 0, 4, 0, 1),
      mur('e1', 4, 0, 4, 2, 1),
    ],
    openings: [],
    rooms: [{ id: 'haut', name: 'Chambre', niveau: 1, wallIds: ['e0', 'e1'] }],
    objects: [
      {
        id: 'lit',
        category: 'bed',
        width: 1.6,
        depth: 2,
        height: 0.5,
        roomId: 'haut',
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.25, 1, 1],
      },
    ],
    ceiling: [],
    notes: [
      { id: 'n0', text: 'Arrivée gaz', at: { x: 1, z: 1 } },
      { id: 'n1', text: 'Trappe', at: { x: 3, z: 1 }, niveau: 1 },
    ],
    dirty: false,
  } as never);

describe('déplacer un étage', () => {
  beforeEach(poser);

  it('emporte ses notes — et laisse celles des autres étages', () => {
    useScanStore.getState().recalerNiveau(1, 0.01, -0.02);
    const notes = useScanStore.getState().notes;
    proche(notes.find((n) => n.id === 'n1')!.at.x, 3.01);
    proche(notes.find((n) => n.id === 'n1')!.at.z, 0.98);
    proche(notes.find((n) => n.id === 'n0')!.at.x, 1);
  });
});

describe('tourner un étage', () => {
  beforeEach(poser);

  it('tourne autour de son centre : murs, meubles et notes ensemble', () => {
    const c = centreDuNiveau(useScanStore.getState().walls, 1)!;
    proche(c.x, 2);
    proche(c.z, 1);
    useScanStore.getState().tournerNiveau(1, Math.PI / 2);
    const st = useScanStore.getState();
    const e0 = st.walls.find((w) => w.id === 'e0')!;
    const attendu = pivoterPoint({ x: 0, z: 0 }, c, Math.PI / 2);
    proche(e0.a.x, attendu.x);
    proche(e0.a.z, attendu.z);
    // Le rez ne bouge pas.
    const r0 = st.walls.find((w) => w.id === 'r0')!;
    proche(r0.a.x, 0);
    // Le lit était au centre : il y reste, mais il a tourné d'un quart.
    const t = st.objects[0].transform;
    proche(t[12], 2);
    proche(t[14], 1);
    proche(Math.atan2(t[2], t[0]), Math.PI / 2);
    // La note de l'étage a tourné, celle du rez non.
    const n1 = st.notes.find((n) => n.id === 'n1')!;
    const n1Attendu = pivoterPoint({ x: 3, z: 1 }, c, Math.PI / 2);
    proche(n1.at.x, n1Attendu.x);
    proche(st.notes.find((n) => n.id === 'n0')!.at.x, 1);
  });

  it('un pas vaut un demi-degré, et « Annuler » défait la série d’un appui', () => {
    proche(PAS_ROTATION, (0.5 * Math.PI) / 180);
    const avant = useScanStore.getState().walls.find((w) => w.id === 'e1')!.b;
    useScanStore.getState().tournerNiveau(1, PAS_ROTATION);
    useScanStore.getState().tournerNiveau(1, PAS_ROTATION);
    useScanStore.getState().undo();
    const apres = useScanStore.getState().walls.find((w) => w.id === 'e1')!.b;
    proche(apres.x, avant.x);
    proche(apres.z, avant.z);
  });
});

describe('la barre de recalage', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('porte quatre flèches, deux rotations et « Terminé »', () => {
    const pas: [number, number][] = [];
    const tours: number[] = [];
    let fini = false;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RecalageBar
          texte="Glissez l’étage"
          onPas={(dx, dy) => pas.push([dx, dy])}
          onTourner={(s) => tours.push(s)}
          onTerminer={() => {
            fini = true;
          }}
        />,
      );
    });
    const par = (l: string) =>
      t.root.findAll((n) => n.props?.accessibilityLabel === l && (n.props?.onPressIn || n.props?.onPress))[0];
    act(() => {
      par('Déplacer l’étage vers la droite').props.onPressIn();
      par('Déplacer l’étage vers la droite').props.onPressOut();
    });
    act(() => {
      par('Tourner l’étage à gauche').props.onPressIn();
      par('Tourner l’étage à gauche').props.onPressOut();
    });
    act(() => par('Terminer le recalage').props.onPress());
    expect(pas).toEqual([[1, 0]]);
    expect(tours).toEqual([-1]);
    expect(fini).toBe(true);
    act(() => t.unmount());
  });
});
