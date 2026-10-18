/**
 * LE CAISSON SOUS PLAFOND, ÉLÉMENT DU PLAN — posé contre un mur depuis sa
 * barre (« Caisson »), collé au plafond, dessiné au-dessus de tout, et sans
 * gêner ni les portes ni les meubles posés dessous.
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
import type { ObjectData } from 'react-native-room-scan';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Path, Rect } from 'react-native-svg';
import { useScanStore } from '../src/store/scanStore';
import { empriseDuCaisson, estUnCaisson } from '../src/geometry/caisson';
import { hauteurDeLaPiece, roomParts, solDesMurs } from '../src/geometry/floorplan';
import { pointInPolygon } from '../src/geometry/appearance';
import { nomDuMeuble } from '../src/geometry/furniture';
import { battantsDesPortes, meublesQuiBloquent, passageDuMeuble } from '../src/geometry/passage';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { buildScanPdf } from '../src/export/pdf';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';

const st = () => useScanStore.getState();
const piece = (nom: string) => st().rooms.find((r) => r.name === nom)!;
const caisson = (id: string) => st().objects.find((o) => o.id === id)!;
const dessus = (id: string) => caisson(id).transform[13] + caisson(id).height / 2;

beforeEach(() => {
  mockMagasin.clear();
  st().ouvrirExemple();
});

describe('poser un caisson contre un mur', () => {
  it('contre le mur nord du séjour : de nu à nu, 40 × 30, collé au plafond', () => {
    const sejour = piece('Séjour-cuisine');
    const id = st().ajouterCaisson('nord', sejour.id)!;
    expect(id).toBeTruthy();
    const c = caisson(id);
    expect(estUnCaisson(c)).toBe(true);
    expect(nomDuMeuble(c)).toBe('Caisson de plafond');
    expect(c).toMatchObject({ depth: 0.4, height: 0.3, roomId: sejour.id });
    const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === sejour.id)!;
    expect(dessus(id)).toBeCloseTo(solDesMurs(part.walls) + hauteurDeLaPiece(part), 6);
    // Contre la façade (z = 0), dans le séjour, jusqu'au nu du refend (x = 4,93).
    const e = empriseDuCaisson(c);
    expect(Math.min(...e.map((p) => p.z))).toBeCloseTo(0, 6);
    expect(Math.max(...e.map((p) => p.z))).toBeCloseTo(0.4, 6);
    expect(Math.max(...e.map((p) => p.x))).toBeCloseTo(5 - 0.07, 2);
    // Un seul « Annuler » le retire.
    st().undo();
    expect(st().objects.some((o) => o.id === id)).toBe(false);
  });

  it('contre le refend séjour/chambre, du côté de la pièce choisie', () => {
    const chambre = piece('Chambre');
    const id = st().ajouterCaisson('refend', chambre.id)!;
    const c = caisson(id);
    const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === chambre.id)!;
    expect(pointInPolygon({ x: c.transform[12], z: c.transform[14] }, part.surface!.pts)).toBe(true);
    // Il part du nu du refend (5 + 0,07), pas de son axe.
    expect(Math.min(...empriseDuCaisson(c).map((p) => p.x))).toBeCloseTo(5.07, 2);
  });

  it('régler sa retombée ou son dessous ne le décolle pas du plafond', () => {
    const id = st().ajouterCaisson('nord', piece('Séjour-cuisine').id)!;
    const plafond = dessus(id);
    st().setObjectHeight(id, 0.5);
    expect(caisson(id).height).toBeCloseTo(0.5, 9);
    expect(dessus(id)).toBeCloseTo(plafond, 9);
    // Le dessous à 2,10 du sol : la retombée devient plafond − 2,10.
    const sol = solDesMurs(st().walls);
    st().setObjectHeight(id, undefined, 2.1);
    expect(dessus(id)).toBeCloseTo(plafond, 9);
    expect(caisson(id).height).toBeCloseTo(plafond - sol - 2.1, 9);
  });

  it('la hauteur de la pièce change : il reste collé au plafond', () => {
    const sejour = piece('Séjour-cuisine');
    const id = st().ajouterCaisson('nord', sejour.id)!;
    st().setRoomHeight(sejour.id, 2.9);
    const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === sejour.id)!;
    expect(dessus(id)).toBeCloseTo(solDesMurs(part.walls) + 2.9, 6);
    st().setAllRoomHeights(2.6);
    expect(dessus(id)).toBeCloseTo(solDesMurs(st().walls) + 2.6, 6);
  });
});

describe('au-dessus de tout, il ne gêne rien', () => {
  it('ni le battant d’une porte, ni le passage des meubles', () => {
    const id = st().ajouterCaisson('refend', piece('Chambre').id)!;
    const c = caisson(id);
    // Posé en travers de tout le refend, il surplombe le battant de la porte de la chambre.
    const battants = battantsDesPortes(st().openings, st().walls, st().rooms);
    const bloque = [...meublesQuiBloquent(battants, st().objects, solDesMurs(st().walls)).values()].flat();
    expect(bloque).not.toContain(id);
    // Sur un relevé dont le sol est à −1,30, pareil.
    const bas = st().objects.map((o) => ({ ...o, transform: o.transform.map((v, k) => (k === 13 ? v - 1.3 : v)) }));
    const bloqueBas = [...meublesQuiBloquent(battants, bas, solDesMurs(st().walls) - 1.3).values()].flat();
    expect(bloqueBas).not.toContain(id);
    expect(passageDuMeuble(c, { walls: st().walls, openings: st().openings, rooms: st().rooms })).toBeNull();
  });

  it('en 3D, la porte s’ouvre sous le caisson qui surplombe son battant', () => {
    const PAL = {
      floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#DDDDDD',
      wallTopStroke: '#777777', opening: '#AACCEE', door: '#AA8866', window: '#AACCEE', passage: '#AACCEE',
      object: '#BBBBBB', objectTop: '#CCCCCC', objectStroke: '#999999',
    } as unknown as ScenePalette;
    const angleDe = (objets: ObjectData[]) => {
      const sc = buildScene(st().walls, st().openings, objets, { palette: PAL, rooms: st().rooms as never });
      return (sc.meubles ?? [])
        .filter((m) => m.category === 'porte3d')
        .map((m) => Number(m.attributes?.find((a) => a.startsWith('PorteAngle:'))?.split(':')[1] ?? 0));
    };
    const sans = angleDe(st().objects);
    st().ajouterCaisson('refend', piece('Chambre').id);
    st().ajouterCaisson('refend#1', piece('Salle d’eau').id);
    expect(angleDe(st().objects)).toEqual(sans);
  });

  it('le plan le dessine en pointillés, par-dessus les meubles, avec ses diagonales', () => {
    const id = st().ajouterCaisson('nord', piece('Séjour-cuisine').id)!;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<FloorplanEditor showMeasures={false} editable={false} selectedWallId={null} onSelectWall={() => {}} />);
    });
    act(() => {
      t.root.findAllByType(View)[0].props.onLayout?.({ nativeEvent: { layout: { width: 400, height: 400 } } });
    });
    const groupes = t.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('meuble-'));
    const ordre = groupes.map((g) => g.props.testID as string);
    // Dessiné en dernier : au-dessus des meubles qu'il surplombe.
    expect(ordre[ordre.length - 1]).toBe(`meuble-${id}`);
    const g = groupes[groupes.length - 1];
    expect(g.findAllByType(Rect)[0].props.strokeDasharray).toBe('6 4');
    expect(g.findAllByType(Path).some((p) => p.props.strokeDasharray === '4 3')).toBe(true);
    act(() => t.unmount());
  });

  it('le dossier PDF le dessine aussi en pointillés', () => {
    st().ajouterCaisson('nord', piece('Séjour-cuisine').id);
    const s = st();
    const latin1 = (bytes: Uint8Array) => {
      let out = '';
      for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      return out;
    };
    const avec = latin1(buildScanPdf({ name: 'Essai', walls: s.walls, openings: s.openings, objects: s.objects, rooms: s.rooms }, false, { metre: false }));
    const sans = latin1(
      buildScanPdf({ name: 'Essai', walls: s.walls, openings: s.openings, objects: s.objects.filter((o) => !estUnCaisson(o)), rooms: s.rooms }, false, { metre: false }),
    );
    const tirets = (src: string) => (src.match(/\[3 2\] 0 d/g) ?? []).length;
    expect(tirets(avec)).toBeGreaterThan(tirets(sans));
  });
});
