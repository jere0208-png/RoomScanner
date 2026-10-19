/**
 * LES MANQUES DE L'ÉLECTRICIEN, COMBLÉS — proposés par l'agent testeur
 * ÉLECTRICITÉ (19/10) :
 *   — porter un appareil sur un autre mur sans le supprimer ni le reposer :
 *     sa hauteur, son lien, son sigle et sa plaque le suivent ;
 *   — copier l'équipement d'une pièce dans une autre, mur à mur ;
 * et le défaut relevé par l'agent testeur PLAN 3D : les gaines montaient
 * jusqu'au vrai plafond d'une pièce à faux plafond.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: { takePhoto: jest.fn(async () => null) },
  scanEvents: { addListener: jest.fn(), removeAllListeners: jest.fn() },
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { useScanStore, resetPersistCache } from '../src/store/scanStore';
import { FIXTURES, faceX, pieceDuCote, wallFace, overlaps, type Fixture } from '../src/geometry/electrical';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { planRoutes } from '../src/geometry/elecplan';
import { fixturePlacement, roomInputsOf } from '../src/geometry/nfc15100';
import type { CeilingFixture } from '../src/geometry/ceiling';
import type { ActionData } from '../src/components/Sheet';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
// Deux pièces côte à côte : le séjour (0..5) et la chambre (5..9), refend en x = 5.
const MURS: WallSeg[] = [
  mur('n1', 0, 0, 5, 0),
  mur('refend', 5, 0, 5, 4),
  mur('s1', 5, 4, 0, 4),
  mur('o1', 0, 4, 0, 0),
  mur('n2', 5, 0, 9, 0),
  mur('e2', 9, 0, 9, 4),
  mur('s2', 9, 4, 5, 4),
];
const PIECES = [
  { id: 'sejour', name: 'Séjour', wallIds: ['n1', 'refend', 's1', 'o1'] },
  { id: 'chambre', name: 'Chambre', wallIds: ['n2', 'e2', 's2', 'refend'] },
];
const S = () => useScanStore.getState();

/** La face d'un mur qui donne dans une pièce. */
const coteVers = (wallId: string, roomId: string): 1 | -1 => {
  const w = MURS.find((x) => x.id === wallId)!;
  return pieceDuCote(w, 1, MURS, PIECES) === roomId ? 1 : -1;
};

const poser = (fx: Fixture[], ceiling: CeilingFixture[] = []) => {
  resetPersistCache();
  useScanStore.setState({
    walls: MURS,
    rooms: PIECES,
    openings: [],
    objects: [],
    fixtures: fx,
    ceiling,
    notes: [],
    mesures: [],
    saves: [],
    currentSaveId: null,
    dirty: false,
  });
};

describe('porter un appareil sur un autre mur', () => {
  const plaque = (): Fixture[] => [
    { id: 'p1', kind: 'prise', wallId: 'n1', along: 2, height: 0.3, side: coteVers('n1', 'sejour'), group: 'g1' },
    { id: 'p2', kind: 'prise', wallId: 'n1', along: 2.071, height: 0.3, side: coteVers('n1', 'sejour'), group: 'g1', usage: 'LL' },
    { id: 'i1', kind: 'inter', wallId: 's1', along: 1, height: 1.1, side: coteVers('s1', 'sejour'), commands: ['p1'] },
  ];

  it('la plaque entière part sur le mur ouest, du côté du séjour, hauteur, sigle, plaque et liens gardés', () => {
    poser(plaque());
    expect(S().deplacerVersLeMur('p1', 'o1')).toBe(true);
    const [a, b] = ['p1', 'p2'].map((id) => S().fixtures.find((f) => f.id === id)!);
    for (const f of [a, b]) {
      expect(f.wallId).toBe('o1');
      expect(pieceDuCote(MURS.find((w) => w.id === 'o1')!, f.side, MURS, PIECES)).toBe('sejour');
      expect(f.height).toBeCloseTo(0.3, 9);
      expect(f.group).toBe('g1');
    }
    expect(b.usage).toBe('LL');
    // L'entraxe de la plaque se garde, dans le même ordre sur la face.
    const o1 = MURS.find((w) => w.id === 'o1')!;
    const face = wallFace(o1, undefined, a.side);
    expect(faceX(face, b.along) - faceX(face, a.along)).toBeCloseTo(0.071, 3);
    // L'interrupteur commande toujours la même prise.
    expect(S().fixtures.find((f) => f.id === 'i1')!.commands).toEqual(['p1']);
    expect(S().dirty).toBe(true);
    // Un seul « Annuler ».
    S().undo();
    expect(S().fixtures.find((f) => f.id === 'p1')!.wallId).toBe('n1');
    expect(S().fixtures.find((f) => f.id === 'p2')!.wallId).toBe('n1');
  });

  it('sur le refend, il passe du côté de SA pièce, et ne s’empile pas sur ce qui s’y trouve déjà', () => {
    const cote = coteVers('refend', 'sejour');
    poser([
      { id: 'x', kind: 'prise', wallId: 'n1', along: 1, height: 0.3, side: coteVers('n1', 'sejour') },
      // Le milieu du refend est déjà pris, côté séjour.
      { id: 'deja', kind: 'prise', wallId: 'refend', along: 2, height: 0.3, side: cote },
    ]);
    expect(S().deplacerVersLeMur('x', 'refend')).toBe(true);
    const x = S().fixtures.find((f) => f.id === 'x')!;
    const deja = S().fixtures.find((f) => f.id === 'deja')!;
    expect(x.side).toBe(cote);
    const face = wallFace(MURS[1], undefined, cote);
    expect(
      overlaps(
        { x: faceX(face, x.along), y: x.height, kind: x.kind },
        { x: faceX(face, deja.along), y: deja.height, kind: deja.kind },
      ),
    ).toBe(false);
  });

  it('l’établi propose « Autre mur », et suit l’appareil sur le mur choisi', () => {
    poser(plaque());
    const demandes: ActionData[] = [];
    const changes: string[] = [];
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <WallElevation
          wallId="n1"
          selectedId="i1"
          onSelect={() => {}}
          onClose={() => {}}
          onDemander={(d) => demandes.push(d)}
          onChangerDeMur={(id) => changes.push(id)}
        />,
      );
    });
    // L'inter est sur s1 : on ouvre son mur.
    act(() => t.update(
      <WallElevation
        wallId="s1"
        selectedId="i1"
        onSelect={() => {}}
        onClose={() => {}}
        onDemander={(d) => demandes.push(d)}
        onChangerDeMur={(id) => changes.push(id)}
      />,
    ));
    const bouton = t.root.find((n) => n.props.accessibilityLabel === 'Autre mur' && typeof n.props.onPress === 'function');
    act(() => bouton.props.onPress());
    expect(demandes).toHaveLength(1);
    // Les trois autres murs du séjour, pas ceux de la chambre.
    expect(demandes[0].actions).toHaveLength(3);
    act(() => demandes[0].actions[0].onPress?.());
    const i1 = S().fixtures.find((f) => f.id === 'i1')!;
    expect(i1.wallId).not.toBe('s1');
    expect(changes).toEqual([i1.wallId]);
    act(() => t.unmount());
  });
});

describe('copier l’équipement d’une pièce dans une autre', () => {
  it('mur à mur, liens recâblés entre les copies, plafond à sa place relative, un seul « Annuler »', () => {
    const plafond: CeilingFixture[] = [
      { id: 'dcl', kind: 'dcl', roomId: 'sejour', at: { x: 2.5, z: 2 }, commands: ['i1'] } as CeilingFixture,
    ];
    poser(
      [
        { id: 'p1', kind: 'prise', wallId: 'n1', along: 2.5, height: 0.3, side: coteVers('n1', 'sejour') },
        { id: 'i1', kind: 'inter', wallId: 's1', along: 4, height: 1.1, side: coteVers('s1', 'sejour') },
        // Sur le mur ouest du séjour : l'ouest de la chambre, c'est le refend,
        // vu de la chambre.
        { id: 'o', kind: 'prise', wallId: 'o1', along: 2, height: 0.3, side: coteVers('o1', 'sejour') },
      ],
      plafond,
    );
    const avant = S().fixtures.length;
    const r = S().copierEquipement('sejour', 'chambre');
    // Deux prises, l'inter et le DCL.
    expect(r).toEqual({ copies: 4, sansPlace: 0 });
    const copies = S().fixtures.slice(avant);
    const ouest = copies.find((f) => f.wallId === 'refend')!;
    expect(ouest.side).toBe(coteVers('refend', 'chambre'));
    const pc = copies.find((f) => f.kind === 'prise' && f.wallId !== 'refend')!;
    const ic = copies.find((f) => f.kind === 'inter')!;
    expect(pc.wallId).toBe('n2');
    expect(ic.wallId).toBe('s2');
    // Chaque copie donne dans la chambre.
    const placement = fixturePlacement(S().fixtures, MURS, roomInputsOf(PIECES, roomParts(MURS, PIECES)));
    expect(placement.get(pc.id)).toBe('chambre');
    expect(placement.get(ic.id)).toBe('chambre');
    // Le DCL copié est dans la chambre, au milieu, commandé par l'INTER COPIÉ.
    const dc = S().ceiling.find((c) => c.roomId === 'chambre')!;
    expect(dc.at.x).toBeCloseTo(7, 1);
    expect(dc.at.z).toBeCloseTo(2, 1);
    expect(dc.commands).toEqual([ic.id]);
    // L'original n'a pas bougé, et garde son inter.
    expect(S().ceiling.find((c) => c.id === 'dcl')!.commands).toEqual(['i1']);
    S().undo();
    expect(S().fixtures).toHaveLength(avant);
    expect(S().ceiling).toHaveLength(1);
  });

  it('un mur qui manque à la pièce cible : l’appareil n’est pas inventé, il est compté', () => {
    poser([
      // Sur le refend côté séjour : il regarde vers l'ouest — l'est de la chambre.
      { id: 'e', kind: 'prise', wallId: 'refend', along: 2, height: 0.3, side: coteVers('refend', 'sejour') },
    ]);
    // La chambre ouverte côté est.
    useScanStore.setState({ rooms: [PIECES[0], { ...PIECES[1], wallIds: ['n2', 's2', 'refend'] }] });
    expect(S().copierEquipement('sejour', 'chambre')).toEqual({ copies: 0, sansPlace: 1 });
    expect(S().fixtures).toHaveLength(1);
  });

  it('une plaque part entière, et rien ne s’empile sur l’existant', () => {
    const side1 = coteVers('n1', 'sejour');
    const side2 = coteVers('n2', 'chambre');
    poser([
      { id: 'a', kind: 'prise', wallId: 'n1', along: 2.5, height: 0.3, side: side1, group: 'g' },
      { id: 'b', kind: 'prise', wallId: 'n1', along: 2.571, height: 0.3, side: side1, group: 'g' },
      // La chambre a déjà une prise là où la copie tomberait (même fraction).
      { id: 'deja', kind: 'prise', wallId: 'n2', along: 2, height: 0.3, side: side2 },
    ]);
    const r = S().copierEquipement('sejour', 'chambre');
    expect(r.copies).toBe(2);
    const copies = S().fixtures.filter((f) => f.wallId === 'n2' && f.id !== 'deja');
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((f) => f.group)).size).toBe(1);
    expect(copies[0].group).not.toBe('g');
    const face = wallFace(MURS[4], undefined, side2);
    const deja = S().fixtures.find((f) => f.id === 'deja')!;
    for (const c of copies) {
      expect(
        overlaps(
          { x: faceX(face, c.along), y: c.height, kind: c.kind },
          { x: faceX(face, deja.along), y: deja.height, kind: deja.kind },
        ),
      ).toBe(false);
    }
    expect(FIXTURES.prise).toBeDefined();
  });
});

describe('les gaines restent sous le faux plafond', () => {
  it('une pièce baissée à 2,30 m : la gaine monte à 2,30, et le métré raccourcit', () => {
    const murs = MURS.slice(0, 4).map((w) => ({ ...w, roomId: 'sejour' }));
    const fx: Fixture[] = [
      { id: 'tab', kind: 'tableau', wallId: 'o1', along: 2, height: 1.4, side: coteVers('o1', 'sejour') },
      { id: 'p', kind: 'prise', wallId: 'refend', along: 2, height: 0.3, side: coteVers('refend', 'sejour') },
    ];
    const metre = (hauteur?: number) => {
      const rooms = [{ ...PIECES[0], ...(hauteur ? { hauteur } : {}) }];
      const parts = roomParts(murs, rooms);
      const placement = fixturePlacement(fx, murs, roomInputsOf(rooms, parts));
      const plan = planRoutes(murs, rooms, parts, fx, placement, [], [])!;
      return [...plan.metre.values()].reduce((s, v) => s + v.conduit, 0);
    };
    const haut = metre();
    const bas = metre(2.3);
    // Montée et retombée raccourcies de 20 cm chacune.
    expect(haut - bas).toBeCloseTo(0.4, 2);
  });
});
