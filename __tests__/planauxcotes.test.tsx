/**
 * UN PLAN DESSINÉ AUX COTES, SANS LIDAR.
 *
 * Revue « Hugo » (iPhone 13, studio de 24 m² mesuré au mètre ruban) : il
 * dessine son studio, pose la cloison de la salle d'eau, et les gestes de
 * cotes le lâchent un à un.
 *
 *   — la cloison posée ne crée pas la pièce : il faut deviner « … » puis
 *     « Redétecter les pièces » ;
 *   — « Cotes » de la pièce ne fait plus rien dès qu'il y a une cloison ;
 *   — « Longueur du mur » aimante ce qu'il tape (6,05, 6,10, 5,92 donnent
 *     tous 6,00), et au-delà de douze centimètres le mur d'en bout penche ;
 *   — le bout qui bouge n'est pas le même selon le mur ;
 *   — « Sur mesure » ne s'ouvre pas (deux fenêtres enchaînées sans attendre
 *     la fermeture de la première), et une faute de frappe ferme la feuille
 *     sans rien dire ;
 *   — la fenêtre cotée « à 80 cm de la cloison » tombe à 83,5 ;
 *   — « Salle d'eau » n'est pas dans les noms proposés, et un nom écrit avec
 *     l'apostrophe de l'app n'est pas reconnu par le contrôle des normes.
 *
 * Revue « Inès » : changer la longueur d'un mur du premier déplaçait le mur
 * du rez-de-chaussée qui était juste en dessous.
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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import {
  depuisParDefaut,
  niveauDe,
  roomParts,
  segLength,
  type WallSeg,
} from '../src/geometry/floorplan';
import { ROOM_NAME_CHOICES } from '../src/geometry/furniture';
import { roomUse } from '../src/geometry/nfc15100';
import { AddRoomSheet } from '../src/screens/result/AddRoomSheet';

const st = () => useScanStore.getState();
const proche = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

/** Le mur dont les deux bouts sont à cette profondeur (horizontal), ou à cette abscisse. */
const murEnZ = (z: number, n = 0) =>
  st().walls.find((w) => niveauDe(w) === n && Math.abs(w.a.z - z) < 1e-6 && Math.abs(w.b.z - z) < 1e-6)!;
const murEnX = (x: number, n = 0) =>
  st().walls.find((w) => niveauDe(w) === n && Math.abs(w.a.x - x) < 1e-6 && Math.abs(w.b.x - x) < 1e-6)!;
const dAplomb = (w: WallSeg) => Math.abs(w.a.x - w.b.x) < 1e-9 || Math.abs(w.a.z - w.b.z) < 1e-9;

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
  st().commencerAuClavier();
  st().addRoomBox(6, 4, 'Studio');
});

describe('« Longueur du mur » : la cote tapée est la cote posée', () => {
  for (const v of [6.05, 6.1, 5.92, 5.89, 6.13]) {
    it(`${v.toFixed(2)} m donne ${v.toFixed(2)} m, et la pièce reste d’équerre`, () => {
      const haut = murEnZ(0);
      st().setWallLength(haut.id, v);
      proche(segLength(st().walls.find((w) => w.id === haut.id)!), v);
      // Le mur d'en bout s'est décalé d'aplomb, et celui d'en face a suivi.
      expect(st().walls.every(dAplomb)).toBe(true);
      expect(murEnX(v)).toBeTruthy();
      proche(segLength(murEnZ(4)), v);
    });
  }

  it('le coin de gauche ne bouge jamais, quel que soit le sens du tracé', () => {
    // Le mur du bas est tracé de droite à gauche.
    const bas = murEnZ(4);
    expect(bas.a.x).toBeGreaterThan(bas.b.x);
    st().setWallLength(bas.id, 6.2);
    expect(murEnX(0)).toBeTruthy();
    expect(murEnX(6.2)).toBeTruthy();
  });

  it('« Cotes » marche encore après', () => {
    st().setWallLength(murEnZ(0).id, 6.1);
    const id = st().rooms[0].id;
    st().resizeRoom(id, 6.14, 4.14);
    expect(murEnX(6.14)).toBeTruthy();
    expect(murEnZ(4.14)).toBeTruthy();
  });

  it('à l’étage, le rez-de-chaussée en dessous ne bouge pas', () => {
    const rez = st().walls.map((w) => ({ ...w }));
    useScanStore.setState({
      walls: [...st().walls, ...rez.map((w) => ({ ...w, id: `${w.id}-n1`, niveau: 1, roomId: 'haut' }))],
    });
    st().allerAuNiveau(1);
    st().setWallLength(murEnZ(0, 1).id, 6.3);
    const apres = st().walls.filter((w) => niveauDe(w) === 0);
    expect(apres.map((w) => [w.a, w.b])).toEqual(rez.map((w) => [w.a, w.b]));
  });
});

describe('la cloison de la salle d’eau', () => {
  const salleDEau = () => {
    const haut = murEnZ(0);
    st().addWallBetween({ x: 2, z: 0 }, { x: 2, z: 1.6 }, { depuis: haut.id, epaisseur: 0.07 });
    const pan = st().walls[st().walls.length - 1];
    st().addWallBetween({ x: 2, z: 1.6 }, { x: 0, z: 1.6 }, { depuis: pan.id, epaisseur: 0.07 });
  };

  it('fait apparaître la pièce dès qu’elle se referme', () => {
    const haut = murEnZ(0);
    st().addWallBetween({ x: 2, z: 0 }, { x: 2, z: 1.6 }, { depuis: haut.id, epaisseur: 0.07 });
    // Un seul pan : rien n'est fermé, rien ne change.
    expect(st().rooms).toHaveLength(1);
    const pan = st().walls[st().walls.length - 1];
    st().addWallBetween({ x: 2, z: 1.6 }, { x: 0, z: 1.6 }, { depuis: pan.id, epaisseur: 0.07 });
    expect(st().rooms).toHaveLength(2);
    const aires = roomParts(st().walls, st().rooms).map((p) => p.surface?.area ?? 0).sort((a, b) => a - b);
    expect(aires[0]).toBeGreaterThan(2.5);
    expect(aires[0]).toBeLessThan(3.5);
  });

  it('même tracée sans mur de départ', () => {
    st().addWallBetween({ x: 2, z: 0 }, { x: 2, z: 1.6 });
    st().addWallBetween({ x: 2, z: 1.6 }, { x: 0, z: 1.6 });
    expect(st().rooms).toHaveLength(2);
  });

  it('et « Cotes » de la salle d’eau la redimensionne, le plan restant cousu', () => {
    salleDEau();
    const parts = roomParts(st().walls, st().rooms);
    const petite = parts.reduce((a, b) => ((a.surface?.area ?? 0) < (b.surface?.area ?? 0) ? a : b));
    st().resizeRoom(petite.roomId, 2.1, 1.6);
    const apres = roomParts(st().walls, st().rooms);
    const elle = apres.find((p) => p.roomId === petite.roomId)!;
    const xs = elle.walls.flatMap((w) => [w.a.x, w.b.x]);
    proche(Math.max(...xs) - Math.min(...xs), 2.1);
    // Les deux pièces ont toujours une surface : rien ne s'est ouvert.
    expect(apres.every((p) => (p.surface?.area ?? 0) > 0)).toBe(true);
  });

  it('une fenêtre cotée depuis la cloison part du nu de la CLOISON', () => {
    salleDEau();
    // Le mur du haut, côté pièce principale, commence à la cloison.
    const cote = st().walls.find(
      (w) => Math.abs(w.a.z) < 1e-6 && Math.abs(w.b.z) < 1e-6 && Math.min(w.a.x, w.b.x) > 1.9,
    )!;
    const depuisCloison = Math.abs(cote.a.x - 2) < 1e-6 ? 'a' : 'b';
    // Au milieu du mur de 4 m, au nu de la cloison de 7 cm : 2 − 0,035 − 0,035.
    const v = depuisParDefaut(st().walls, { id: 'x', wallId: cote.id, bout: depuisCloison, angle: 90 } as never, 0.07, depuisCloison === 'b');
    proche(v, 1.93, 0.006);
  });
});

describe('« Ajouter une pièce » sur mesure', () => {
  const monter = (onChoose: jest.Mock) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <AddRoomSheet visible accolee={false} planVide onClose={() => {}} onChoose={onChoose} />,
      );
    });
    return t;
  };
  const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAll((n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === label)[0];
  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' | ');

  it('se tape dans la feuille même : deux champs, en mètres', () => {
    const choisi = jest.fn();
    const t = monter(choisi);
    act(() => bouton(t, 'Sur mesure').props.onPress());
    const champs = t.root.findAllByType(TextInput);
    expect(champs).toHaveLength(2);
    expect(champs.every((c) => c.props.keyboardType === 'decimal-pad')).toBe(true);
    act(() => champs[0].props.onChangeText('6,00'));
    act(() => champs[1].props.onChangeText('4'));
    act(() => bouton(t, 'Ajouter la pièce').props.onPress());
    expect(choisi).toHaveBeenCalledWith(6, 4, '');
    act(() => t.unmount());
  });

  it('une cote en centimètres se signale dans la feuille, sans la fermer', () => {
    const choisi = jest.fn();
    const t = monter(choisi);
    act(() => bouton(t, 'Sur mesure').props.onPress());
    const champs = t.root.findAllByType(TextInput);
    act(() => champs[0].props.onChangeText('600'));
    act(() => champs[1].props.onChangeText('400'));
    act(() => bouton(t, 'Ajouter la pièce').props.onPress());
    expect(choisi).not.toHaveBeenCalled();
    expect(textes(t)).toMatch(/Vouliez-vous dire 6,00 m/);
    act(() => t.unmount());
  });

  it('sur un plan vide, la feuille parle du plan vide, et s’annule', () => {
    const t = monter(jest.fn());
    expect(textes(t)).not.toMatch(/touchez d’abord le mur/);
    expect(bouton(t, 'Annuler')).toBeTruthy();
    act(() => t.unmount());
  });

  it('le plan ne passe plus par une seconde fenêtre pour les cotes', () => {
    const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    expect(ecran).not.toMatch(/title: 'Pièce sur mesure'/);
    expect(ecran).not.toMatch(/title: 'Cotes de la pièce'/);
  });
});

describe('les noms de pièce', () => {
  it('proposent la salle d’eau et la pièce principale', () => {
    expect(ROOM_NAME_CHOICES).toContain('Salle d’eau');
    expect(ROOM_NAME_CHOICES).toContain('Pièce principale');
  });

  it('et le contrôle des normes reconnaît la salle d’eau, quelle que soit l’apostrophe', () => {
    expect(roomUse('Salle d’eau')).toBe('sdb');
    expect(roomUse("Salle d'eau")).toBe('sdb');
    expect(roomUse('Pièce principale')).toBe('sejour');
  });
});
