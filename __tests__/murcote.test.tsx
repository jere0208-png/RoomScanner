/**
 * LE MUR NEUF AUX COTES DU MÈTRE, ET L'ÉPAISSEUR DE CHAQUE MUR.
 *
 * Relevé du patron : « l'ajout d'un mur n'est pas opérationnel, on doit le
 * placer au millimètre près nous-même, alors que les épaisseurs des murs
 * comptent ».
 *
 * Trois choses à tenir :
 *   1. chaque mur a son épaisseur, et la géométrie partagée (`wallQuads` —
 *      plan, 3D, PDF, DXF) la suit ;
 *   2. les cotes tapées se mesurent d'une face à l'autre, comme au mètre
 *      ruban, et `murNeufCote` les convertit vers l'axe ;
 *   3. la feuille « Nouveau mur » rend ce qu'on a tapé, et la cloison en T
 *      se compte depuis le coin qu'on choisit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  WALL_T,
  depuisParDefaut,
  epaisseurDe,
  murNeufCote,
  posesDeMur,
  posesEnT,
  wallQuads,
  type PoseDeMur,
  type SaisieMurNeuf,
  type WallSeg,
} from '../src/geometry/floorplan';
import { MurNeufSheet, ecrireCm, lireCm } from '../src/components/MurNeufSheet';
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
/** La largeur d'un corps de mur au bout `a` : l'épaisseur dessinée. */
const largeurEnA = (q: { a1: { x: number; z: number }; a2: { x: number; z: number } }) =>
  Math.hypot(q.a1.x - q.a2.x, q.a1.z - q.a2.z);

describe('chaque mur a son épaisseur', () => {
  it('un mur relevé garde celle de tous ; un mur qui dit la sienne la dessine', () => {
    expect(epaisseurDe(mur('m', 0, 0, 1, 0))).toBe(WALL_T);
    const q = wallQuads([mur('c', 0, 0, 2, 0, { epaisseur: 0.07 }), mur('p', 0, 5, 2, 5, { epaisseur: 0.2 })]);
    proche(largeurEnA(q.get('c')!), 0.07);
    proche(largeurEnA(q.get('p')!), 0.2);
  });

  it('un `t` explicite les force toutes, comme avant', () => {
    const q = wallQuads([mur('c', 0, 0, 2, 0, { epaisseur: 0.07 })], 0.14);
    proche(largeurEnA(q.get('c')!), 0.14);
  });

  it('en T, la cloison entre dans le corps de SON voisin, de sa demi-épaisseur à lui', () => {
    const hote = mur('h', 0, 0, 4, 0, { epaisseur: 0.2 });
    const cloison = mur('t', 2, 0, 2, 1.5, { epaisseur: 0.07 });
    const q = wallQuads([hote, cloison]).get('t')!;
    // Le bout `a` de la cloison recule de 10 cm : il disparaît dans le porteur.
    proche(Math.min(q.a1.z, q.a2.z), -0.1);
    proche(largeurEnA(q), 0.07);
  });
});

describe('les cotes du mètre ruban, converties vers l’axe', () => {
  const hote = mur('h', 0, 0, 2, 0);
  const auBout = (angle: 0 | 90 | -90): PoseDeMur =>
    posesDeMur([hote]).find((p) => p.bout === 'b' && p.angle === angle)!;

  it('droit devant : la longueur tapée est celle du mur neuf', () => {
    const seg = murNeufCote([hote], auBout(0), { longueur: 1.5, epaisseur: WALL_T })!;
    proche(seg.a.x, 2);
    proche(seg.b.x, 3.5);
  });

  it('à l’équerre : elle part de la FACE du mur de départ', () => {
    const seg = murNeufCote([hote], auBout(90), { longueur: 1, epaisseur: WALL_T })!;
    // Un mètre au nu, c'est 1,07 m d'axe derrière un mur de 14.
    proche(Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z), 1 + WALL_T / 2);
  });

  describe('la cloison en T', () => {
    // Un mur de 4 m, fermé en `a` par un porteur de 20 cm ; libre en `b`.
    const long = mur('h', 0, 0, 4, 0);
    const porteur = mur('p', 0, 0, 0, 3, { epaisseur: 0.2 });
    const plan = [long, porteur];
    const pose = posesEnT(long).find((p) => p.angle === 90)!;
    const saisie: SaisieMurNeuf = { longueur: 1.2, epaisseur: 0.07, depuis: 0.8 };

    it('offre deux poses, une de chaque côté, au milieu du mur', () => {
      const ps = posesEnT(long);
      expect(ps.map((p) => p.angle).sort()).toEqual([-90, 90]);
      for (const p of ps) {
        expect(p.genre).toBe('t');
        proche(p.a.x, 2);
      }
    });

    it('« à 80 cm du coin » : du nu du porteur au nu de la cloison', () => {
      const seg = murNeufCote(plan, pose, saisie)!;
      // Le nu du porteur est à 10 cm de son axe ; la cloison s'étend de
      // 3,5 cm de part et d'autre du sien.
      const nuCloison = seg.a.x - 0.035;
      proche(nuCloison - 0.1, 0.8);
      // Et la longueur part de la face du mur long.
      proche(Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z), 1.2 + WALL_T / 2);
    });

    it('depuis l’autre coin, la même cote se compte de l’autre bout', () => {
      const seg = murNeufCote(plan, pose, { ...saisie, depuisB: true })!;
      // Rien ne ferme le bout `b` : pas de retrait, le nu est le bout.
      proche(4 - (seg.a.x + 0.035), 0.8);
    });

    it('une cote plus longue que le mur ne fait pas sortir la cloison', () => {
      const seg = murNeufCote(plan, pose, { ...saisie, depuis: 12 })!;
      expect(seg.a.x).toBeLessThanOrEqual(4);
    });

    it('la cote proposée d’abord est celle du milieu, au nu', () => {
      // 2 m d'axe − 10 cm de porteur − 3,5 cm de cloison.
      proche(depuisParDefaut(plan, pose, 0.07), 1.87);
    });
  });
});

describe('le magasin pose le mur neuf dans sa pièce, à son épaisseur', () => {
  beforeEach(() => {
    useScanStore.setState({
      walls: [mur('h', 0, 0, 4, 0, { roomId: 'salon', niveau: 1, height: 2.2 })],
      niveauCourant: 0,
      dirty: false,
    } as never);
  });

  it('il hérite de la pièce, de l’étage et de la hauteur de son mur de départ', () => {
    const id = useScanStore.getState().addWallBetween({ x: 2, z: 0 }, { x: 2, z: 1 }, { epaisseur: 0.07, depuis: 'h' })!;
    const neuf = useScanStore.getState().walls.find((w) => w.id === id)!;
    expect(neuf.roomId).toBe('salon');
    expect(neuf.niveau).toBe(1);
    expect(neuf.height).toBe(2.2);
    expect(neuf.epaisseur).toBe(0.07);
  });

  it('l’épaisseur de tous ne s’écrit pas — et se change sur un mur choisi', () => {
    const id = useScanStore.getState().addWallBetween({ x: 2, z: 0 }, { x: 2, z: 1 }, { epaisseur: WALL_T, depuis: 'h' })!;
    expect('epaisseur' in useScanStore.getState().walls.find((w) => w.id === id)!).toBe(false);
    useScanStore.getState().setEpaisseurMur('h', 0.2);
    expect(useScanStore.getState().walls.find((w) => w.id === 'h')!.epaisseur).toBe(0.2);
    useScanStore.getState().setEpaisseurMur('h', WALL_T);
    expect('epaisseur' in useScanStore.getState().walls.find((w) => w.id === 'h')!).toBe(false);
  });

  it('une épaisseur absurde est ramenée à ce qui se construit', () => {
    useScanStore.getState().setEpaisseurMur('h', 4);
    expect(useScanStore.getState().walls[0].epaisseur).toBe(0.6);
  });
});

describe('la feuille « Nouveau mur »', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  const long = mur('h', 0, 0, 4, 0);
  const porteur = mur('p', 0, 0, 0, 3, { epaisseur: 0.2 });

  const monter = (pose: PoseDeMur, walls: WallSeg[] = [long, porteur]) => {
    const recu: SaisieMurNeuf[] = [];
    const apercus: (SaisieMurNeuf | null)[] = [];
    const Cadre = () => {
      const [p, setP] = React.useState<PoseDeMur | null>(pose);
      return (
        <MurNeufSheet
          pose={p}
          walls={walls}
          onClose={() => setP(null)}
          onPoser={(s) => recu.push(s)}
          onApercu={(s) => apercus.push(s)}
        />
      );
    };
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Cadre />);
    });
    return { t, recu, apercus };
  };
  const parId = (t: TestRenderer.ReactTestRenderer, id: string) =>
    t.root.findAll((n) => n.props?.testID === id && typeof n.props?.onChangeText === 'function')[0];
  const parLabel = (t: TestRenderer.ReactTestRenderer, l: string) =>
    t.root.findAll((n) => n.props?.accessibilityLabel === l && typeof n.props?.onPress === 'function')[0];

  it('lit les centimètres à la française', () => {
    expect(lireCm('83,5')).toBeCloseTo(0.835);
    expect(lireCm('abc')).toBeNull();
    expect(ecrireCm(1.87)).toBe('187');
  });

  it('en T : longueur, coin, épaisseur — et rend ce qu’on a tapé, en mètres', () => {
    const pose = posesEnT(long).find((p) => p.angle === 90)!;
    const { t, recu, apercus } = monter(pose);
    const mots = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(mots).toContain('Nouveau mur');
    expect(mots).toContain('Depuis le coin');
    // Le milieu du mur, au nu, est proposé d'abord.
    expect(parId(t, 'champ-depuis').props.value).toBe('187');
    act(() => parId(t, 'champ-longueur').props.onChangeText('120'));
    act(() => parId(t, 'champ-depuis').props.onChangeText('80'));
    act(() => parLabel(t, 'Épaisseur Porteur').props.onPress());
    // L'aperçu suit chaque chiffre : le plan derrière montre où il tombe.
    expect(apercus[apercus.length - 1]).toEqual({ longueur: 1.2, epaisseur: 0.2, depuis: 0.8, depuisB: false });
    act(() => parLabel(t, 'Poser le mur').props.onPress());
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(recu).toEqual([{ longueur: 1.2, epaisseur: 0.2, depuis: 0.8, depuisB: false }]);
    act(() => t.unmount());
  });

  it('une cloison en T part en cloison ; un mur prolongé prend l’épaisseur du sien', () => {
    let m = monter(posesEnT(long)[0]);
    expect(parLabel(m.t, 'Épaisseur Cloison').props.accessibilityState.selected).toBe(true);
    act(() => m.t.unmount());
    const epais = mur('x', 0, 0, 2, 0, { epaisseur: 0.2 });
    m = monter(posesDeMur([epais])[0], [epais]);
    expect(parLabel(m.t, 'Épaisseur Porteur').props.accessibilityState.selected).toBe(true);
    // Au bout d'un mur, pas de coin à donner.
    expect(parId(m.t, 'champ-depuis')).toBeUndefined();
    act(() => m.t.unmount());
  });

  it('sans longueur lisible, rien ne se pose', () => {
    const { t, recu } = monter(posesEnT(long)[0]);
    act(() => parId(t, 'champ-longueur').props.onChangeText(''));
    act(() => parLabel(t, 'Poser le mur').props.onPress());
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(recu).toHaveLength(0);
    act(() => t.unmount());
  });
});
