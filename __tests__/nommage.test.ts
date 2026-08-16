/**
 * NOMMER LES MURS ET LES APPAREILS — « Séjour, mur nord, prise plinthe 2 ».
 *
 * Sur un chantier, « le mur de gauche » ne veut rien dire une fois la
 * feuille retournée, et « w-3 » encore moins. Le nord, lui, se vérifie avec
 * n'importe quel téléphone. Encore faut-il que l'orientation soit juste :
 * une rose des vents fausse est pire que pas de rose du tout, parce qu'on
 * la croit.
 */
import {
  bearingName,
  deviceNames,
  wallCardinal,
  wallLabel,
} from '../src/geometry/naming';
import { roomParts } from '../src/geometry/floorplan';
import { fixturePlacement, roomInputsOf } from '../src/geometry/nfc15100';

import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Une pièce de 5 × 4, d'équerre avec le repère du scan. */
const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const R = [{ id: 'r1', name: 'Séjour', wallIds: W.map((w) => w.id) }];
const CENTRE = { x: 2.5, z: 2 };

describe('l’aire de vent d’une direction', () => {
  it('cap 0 : l’axe −Z regarde le nord', () => {
    // Le scan a commencé face au nord : −Z EST le nord, +X est l'est.
    expect(bearingName({ x: 0, z: -1 }, 0)).toBe('nord');
    expect(bearingName({ x: 1, z: 0 }, 0)).toBe('est');
    expect(bearingName({ x: 0, z: 1 }, 0)).toBe('sud');
    expect(bearingName({ x: -1, z: 0 }, 0)).toBe('ouest');
  });

  it('un quart de tour du scan fait tourner toutes les aires', () => {
    // Le relevé a commencé face à l'est : ce qui était au nord est
    // maintenant à l'ouest.
    expect(bearingName({ x: 0, z: -1 }, 90)).toBe('est');
    expect(bearingName({ x: 1, z: 0 }, 90)).toBe('sud');
  });

  it('et les diagonales se disent aussi', () => {
    expect(bearingName({ x: 1, z: -1 }, 0)).toBe('nord-est');
    expect(bearingName({ x: -1, z: 1 }, 0)).toBe('sud-ouest');
  });
});

describe('le mur d’une pièce', () => {
  it('se nomme par le côté où il se trouve, pas par où il regarde', () => {
    // Le mur « n » borde le haut de la pièce : c'est le mur nord, même si
    // sa face intérieure, elle, regarde vers le sud.
    expect(wallCardinal(W[0], CENTRE, 0)).toBe('nord');
    expect(wallCardinal(W[1], CENTRE, 0)).toBe('est');
    expect(wallCardinal(W[2], CENTRE, 0)).toBe('sud');
    expect(wallCardinal(W[3], CENTRE, 0)).toBe('ouest');
  });

  it('suit le cap du scan', () => {
    expect(wallCardinal(W[0], CENTRE, 90)).toBe('est');
    expect(wallCardinal(W[1], CENTRE, 90)).toBe('sud');
  });

  /**
   * SANS BOUSSOLE, ON NE NOMME PAS.
   *
   * Les scans anciens et les appareils sans magnétomètre n'ont pas de cap.
   * Inventer une orientation serait le pire des services : on la croirait,
   * et on percerait le mauvais mur.
   */
  it('et se tait quand la boussole s’est tue', () => {
    expect(wallCardinal(W[0], CENTRE, null)).toBeNull();
    expect(wallLabel(W[0], CENTRE, null)).toBeNull();
    expect(wallLabel(W[0], CENTRE, 0)).toBe('mur nord');
  });
});

describe('le nom d’un appareil', () => {
  const f = (
    id: string,
    kind: Fixture['kind'],
    wallId: string,
    along: number,
    height: number,
  ): Fixture => ({ id, kind, wallId, along, height, side: 1 });
  const FX: Fixture[] = [
    f('a', 'prise', 'n', 0.5, 0.25),
    f('b', 'prise', 'n', 2.5, 0.25),
    f('c', 'prise', 'e', 1, 1.1),
    f('d', 'prise2', 's', 2, 0.25),
    f('e', 'inter', 'w', 1, 1.1),
  ];
  const parts = roomParts(W, R);
  const placement = fixturePlacement(FX, W, roomInputsOf(R, parts));
  const centers = new Map(parts.map((p) => [p.roomId, p.labelAt]));
  const noms = deviceNames(
    FX,
    W,
    placement,
    { r1: 'Séjour' },
    centers,
    0,
  );

  it('dit le type, la qualité, et le numéro dans la pièce', () => {
    expect(noms.get('a')!.nom).toBe('Prise plinthe 1');
    expect(noms.get('b')!.nom).toBe('Prise plinthe 2');
    // Même type, autre hauteur : autre qualité, donc autre suite de numéros.
    expect(noms.get('c')!.nom).toBe('Prise plan de travail 1');
    expect(noms.get('d')!.nom).toBe('Double prise plinthe 1');
  });

  it('parle comme on parle, pas comme le catalogue', () => {
    // Le catalogue dit « Prise 16 A » et « Prise double » ; sur le chantier
    // on dit « une prise » et « une double prise ».
    expect(noms.get('a')!.nom).not.toContain('16 A');
    expect(noms.get('d')!.nom.startsWith('Double prise')).toBe(true);
  });

  it('situe chacun : sa pièce et son mur', () => {
    expect(noms.get('a')!.piece).toBe('Séjour');
    expect(noms.get('a')!.mur).toBe('mur nord');
    expect(noms.get('c')!.mur).toBe('mur est');
    expect(noms.get('e')!.mur).toBe('mur ouest');
  });

  it('et sans boussole, il reste le type et la pièce', () => {
    const sans = deviceNames(FX, W, placement, { r1: 'Séjour' }, centers, null);
    expect(sans.get('a')!.nom).toBe('Prise plinthe 1');
    expect(sans.get('a')!.piece).toBe('Séjour');
    expect(sans.get('a')!.mur).toBe('');
  });
});
