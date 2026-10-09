/**
 * LES OUVERTURES AUX COTES DU MÈTRE — comme le mur, la pièce et le meuble.
 *
 * Relevé du patron : « fais pareil pour les ouvertures (portes et
 * fenêtres) ».
 *
 *   — LA POSITION SE COMPTE AU NU DU COIN. Elle se comptait depuis le bout
 *     du trait, c'est-à-dire l'axe du mur d'angle : 7 cm de plus que ce que
 *     lit le mètre posé contre le refend.
 *   — DEPUIS L'UN OU L'AUTRE COIN, et « Centrer » centre entre les deux nus.
 *   — TOUTES LES COTES D'UN COUP (largeur, hauteur, allège, position), une
 *     seule annulation ; et une menuiserie neuve les demande dès sa pose.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  WALL_T,
  ouvertureCotee,
  positionOuverture,
  segLength,
  type WallSeg,
} from '../src/geometry/floorplan';
import { OuvertureSheet } from '../src/components/MurNeufSheet';
import { useScanStore } from '../src/store/scanStore';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
  ...extra,
});
const proche = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThan(1e-6);

/* Un mur de 4 m, fermé à gauche par un porteur de 20, à droite par un mur
   de 14 ; une fenêtre de 1,20 m posée de 1,00 à 2,20 m sur le trait. */
const LONG = mur('l', 0, 0, 4, 0);
const PORTEUR = mur('p', 0, 0, 0, 3, { epaisseur: 0.2 });
const DROIT = mur('d', 4, 0, 4, 3);
const MURS = [LONG, PORTEUR, DROIT];
const FENETRE: WallSeg = {
  id: 'f',
  type: 'window',
  a: { x: 1, z: 0 },
  b: { x: 2.2, z: 0 },
  height: 1.15,
  yCenter: 0.95 + 1.15 / 2,
  roomId: 'r1',
};

describe('la position au nu du coin', () => {
  it('se lit depuis la face du mur d’angle, pas depuis son axe', () => {
    const p = positionOuverture(FENETRE, MURS)!;
    // 1,00 m sur le trait, moins 10 cm de demi-porteur.
    proche(p.depuisA, 0.9);
    // De l'autre côté : 4 − 2,20 − 7 cm de demi-mur.
    proche(p.depuisB, 4 - 2.2 - WALL_T / 2);
  });

  it('« à 50 cm du coin » pose le tableau à 50 cm du nu', () => {
    const c = ouvertureCotee(FENETRE, MURS, { largeur: 1.2, hauteur: 1.15, allege: 0.95, depuis: 0.5 })!;
    proche(Math.min(c.a.x, c.b.x), 0.1 + 0.5);
    proche(Math.abs(c.b.x - c.a.x), 1.2);
  });

  it('depuis l’autre coin, la même cote se compte de l’autre bout', () => {
    const c = ouvertureCotee(FENETRE, MURS, { largeur: 1, hauteur: 1.15, allege: 0.95, depuis: 0.3, depuisB: true })!;
    proche(4 - WALL_T / 2 - Math.max(c.a.x, c.b.x), 0.3);
  });

  it('largeur, hauteur et allège se posent ensemble, depuis le sol du mur', () => {
    const c = ouvertureCotee(FENETRE, MURS, { largeur: 0.8, hauteur: 1.35, allege: 0.6, depuis: 0.2 })!;
    proche(c.height, 1.35);
    proche(c.yCenter - c.height / 2, 0.6);
  });

  it('rien ne sort du mur, et une porte part du sol', () => {
    const c = ouvertureCotee(FENETRE, MURS, { largeur: 1.2, hauteur: 1.15, allege: 0.95, depuis: 9 })!;
    expect(Math.max(c.a.x, c.b.x)).toBeLessThanOrEqual(4);
    const porte = { ...FENETRE, type: 'door' as const };
    const p = ouvertureCotee(porte, MURS, { largeur: 0.83, hauteur: 2.04, allege: 0.9, depuis: 0.1 })!;
    proche(p.yCenter - p.height / 2, 0);
  });

  it('le sens du trait est gardé : une porte cotée ne change pas de charnière', () => {
    const inverse = { ...FENETRE, a: FENETRE.b, b: FENETRE.a };
    const c = ouvertureCotee(inverse, MURS, { largeur: 1.2, hauteur: 1.15, allege: 0.95, depuis: 0.5 })!;
    expect(c.a.x).toBeGreaterThan(c.b.x);
  });
});

describe('le magasin', () => {
  beforeEach(() => {
    useScanStore.setState({ walls: MURS, openings: [FENETRE], dirty: false } as never);
  });

  it('applique toutes les cotes d’un coup, et une annulation les défait toutes', () => {
    useScanStore.getState().coterOuverture('f', { largeur: 0.8, hauteur: 1.35, allege: 0.6, depuis: 0.2 });
    const o = useScanStore.getState().openings[0];
    proche(segLength(o), 0.8);
    proche(o.height, 1.35);
    useScanStore.getState().undo();
    const r = useScanStore.getState().openings[0];
    proche(segLength(r), 1.2);
    proche(r.height, 1.15);
  });

  it('une menuiserie neuve rend son identifiant — l’écran lui demande ses cotes', () => {
    const id = useScanStore.getState().addOpening('l', 'door');
    expect(typeof id).toBe('string');
    expect(useScanStore.getState().openings.some((x) => x.id === id)).toBe(true);
  });
});

describe('la feuille « Cotes de la fenêtre »', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  const monter = (o: WallSeg) => {
    const recu: unknown[] = [];
    const Cadre = () => {
      const [x, setX] = React.useState<WallSeg | null>(o);
      return (
        <OuvertureSheet ouverture={x} walls={MURS} sol={0} onClose={() => setX(null)} onAppliquer={(s) => recu.push(s)} />
      );
    };
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Cadre />);
    });
    return { t, recu };
  };
  const champ = (t: TestRenderer.ReactTestRenderer, id: string) =>
    t.root.findAll((n) => n.props?.testID === id && typeof n.props?.onChangeText === 'function')[0];
  const parLabel = (t: TestRenderer.ReactTestRenderer, l: string) =>
    t.root.findAll((n) => n.props?.accessibilityLabel === l && typeof n.props?.onPress === 'function')[0];

  it('part des cotes actuelles, depuis le coin le plus proche, au nu', () => {
    const { t } = monter(FENETRE);
    expect(champ(t, 'champ-largeur').props.value).toBe('120');
    expect(champ(t, 'champ-hauteur').props.value).toBe('115');
    expect(champ(t, 'champ-allege').props.value).toBe('95');
    // Le coin gauche est le plus proche : 90 cm au nu (et non 100 à l'axe).
    expect(champ(t, 'champ-position').props.value).toBe('90');
    act(() => t.unmount());
  });

  it('une pastille courante remplit le champ ; « Centrer » centre entre les nus', () => {
    const { t, recu } = monter(FENETRE);
    act(() => parLabel(t, 'Largeur 80').props.onPress());
    act(() => parLabel(t, 'Centrer sur le mur').props.onPress());
    // Nu à nu : 4 − 0,10 − 0,07 = 3,83 ; (3,83 − 0,80) / 2 = 1,515.
    expect(champ(t, 'champ-position').props.value).toBe('151,5');
    act(() => parLabel(t, 'Appliquer les cotes').props.onPress());
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(recu).toEqual([{ largeur: 0.8, hauteur: 1.15, allege: 0.95, depuis: 1.515, depuisB: false }]);
    act(() => t.unmount());
  });

  it('une porte ne demande pas d’allège', () => {
    const { t } = monter({ ...FENETRE, type: 'door', height: 2.04, yCenter: 1.02 });
    expect(champ(t, 'champ-allege')).toBeUndefined();
    act(() => t.unmount());
  });
});
