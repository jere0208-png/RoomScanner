/**
 * PLUSIEURS MEUBLES D'UN COUP, ET LE VERROU — manques proposés par l'agent
 * testeur MEUBLES (19/10) :
 *   — aligner ou répartir plusieurs meubles d'un coup (il fallait une
 *     sélection multiple) ;
 *   — verrouiller un meuble contre les déplacements accidentels.
 * Chaque geste est un seul « Annuler » ; « à gauche » est la gauche qu'on
 * voit, même plan tourné ; un meuble verrouillé ne bouge pas et sert
 * d'ancre à l'alignement.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { catalogItem } from '../src/geometry/catalogue';
import { empriseDuCaisson } from '../src/geometry/caisson';
import { cibleDAlignement, cibleDeRepartition, estVerrouille } from '../src/geometry/alignement';
import { ObjectBar } from '../src/components/ObjectBar';
import { View } from 'react-native';
import { FloorplanEditor, GroupeDragHandle, ObjectDragHandle, RotateHandle } from '../src/components/FloorplanEditor';
import { finirLeGeste } from '../src/store/geste';
import { ResultScreen } from '../src/screens/ResultScreen';
import { SelectionMeublesBar } from '../src/components/SelectionMeublesBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const st = () => useScanStore.getState();
const meuble = (id: string) => st().objects.find((o) => o.id === id)!;
const yawDe = (o: ObjectData) => Math.atan2(o.transform[2], o.transform[0]);
/** Les bords à l'écran, plan tourné de `rot`. */
const ecran = (o: ObjectData, rot = 0) => {
  const a = yawDe(o) + rot;
  const hx = Math.abs(Math.cos(a)) * (o.width / 2) + Math.abs(Math.sin(a)) * (o.depth / 2);
  const hy = Math.abs(Math.sin(a)) * (o.width / 2) + Math.abs(Math.cos(a)) * (o.depth / 2);
  const sx = o.transform[12] * Math.cos(rot) - o.transform[14] * Math.sin(rot);
  const sy = o.transform[12] * Math.sin(rot) + o.transform[14] * Math.cos(rot);
  return { g: sx - hx, d: sx + hx, h: sy - hy, b: sy + hy, sx, sy };
};

let trois: string[] = [];
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  act(() => st().ouvrirExemple());
  // Le séjour vidé (la cuisine reste, le long de la façade), puis trois
  // chaises en désordre au milieu (x 0 → 5, z 0 → 4).
  useScanStore.setState({ objects: st().objects.filter((o) => !(o.transform[12] < 5 && o.transform[14] > 0.8)) });
  trois = [
    st().addObject(catalogItem('chaise')!, 1.4, 2.0),
    st().addObject(catalogItem('chaise')!, 2.3, 2.5),
    st().addObject(catalogItem('chaise')!, 3.5, 2.2),
  ];
  jest.advanceTimersByTime(2000);
});

describe('aligner plusieurs meubles', () => {
  it('« en haut » : les trois bords hauts au même niveau, en un seul « Annuler »', () => {
    const avant = trois.map((id) => meuble(id).transform.slice());
    st().alignerMeubles(trois, 'haut', 0);
    const hauts = trois.map((id) => ecran(meuble(id)).h);
    expect(Math.max(...hauts) - Math.min(...hauts)).toBeLessThan(0.005);
    // Le plus haut n'a pas bougé : c'est lui la référence.
    expect(Math.min(...hauts)).toBeCloseTo(2.0 - 0.225, 3);
    st().undo();
    trois.forEach((id, k) => expect(meuble(id).transform).toEqual(avant[k]));
  });

  it('« à gauche » est la gauche de l’écran, plan tourné d’un quart de tour', () => {
    const rot = Math.PI / 2;
    st().alignerMeubles(trois, 'gauche', rot);
    const gauches = trois.map((id) => ecran(meuble(id), rot).g);
    expect(Math.max(...gauches) - Math.min(...gauches)).toBeLessThan(0.005);
  });

  it('un meuble verrouillé sert d’ancre : il ne bouge pas, les autres s’alignent sur lui', () => {
    st().verrouillerMeuble(trois[2], true);
    const ancre = meuble(trois[2]).transform.slice();
    st().alignerMeubles(trois, 'bas', 0);
    expect(meuble(trois[2]).transform).toEqual(ancre);
    for (const id of trois) expect(ecran(meuble(id)).b).toBeCloseTo(ecran(meuble(trois[2])).b, 3);
  });

  it('aligné contre un mur, aucun n’y entre', () => {
    // Le séjour a sa façade en z = 0 : on en colle une contre, puis on aligne tout en haut.
    st().setObjectCenter(trois[2], 4.2, 0.3);
    st().alignerMeubles(trois, 'haut', 0);
    for (const id of trois) expect(ecran(meuble(id)).h).toBeGreaterThanOrEqual(-0.005);
  });
});

describe('répartir à intervalles égaux', () => {
  it('les jours entre voisins sont égaux, les deux extrêmes ne bougent pas', () => {
    const g = ecran(meuble(trois[0])).g;
    const d = ecran(meuble(trois[2])).d;
    st().repartirMeubles(trois, 'horizontal', 0);
    const e = trois.map((id) => ecran(meuble(id))).sort((a, b) => a.sx - b.sx);
    expect(e[0].g).toBeCloseTo(g, 4);
    expect(e[2].d).toBeCloseTo(d, 4);
    expect(e[1].g - e[0].d).toBeCloseTo(e[2].g - e[1].d, 3);
  });

  it('moins de trois meubles : rien ne bouge', () => {
    expect(cibleDeRepartition(trois.slice(0, 2).map(meuble), 'horizontal', 0).size).toBe(0);
    expect(cibleDAlignement([meuble(trois[0])], 'haut', 0).size).toBe(0);
  });
});

describe('déplacer et retirer ensemble', () => {
  it('un glisser de l’ensemble ne coûte qu’un « Annuler », et se range au lâcher', () => {
    const depuis = Object.fromEntries(trois.map((id) => [id, { x: meuble(id).transform[12], z: meuble(id).transform[14] }]));
    st().deplacerMeubles(trois, 0.1, 0, { depuis });
    st().deplacerMeubles(trois, 0.3, 0, { depuis });
    st().deplacerMeubles(trois, 0.5, 0, { depuis, ranger: true });
    trois.forEach((id) => expect(meuble(id).transform[12]).toBeCloseTo(depuis[id].x + 0.5, 3));
    st().undo();
    trois.forEach((id) => expect(meuble(id).transform[12]).toBeCloseTo(depuis[id].x, 6));
  });

  it('retirer la sélection : un seul « Annuler » les rend tous', () => {
    const n = st().objects.length;
    st().retirerLesMeubles(trois);
    expect(st().objects.length).toBe(n - 3);
    st().undo();
    expect(st().objects.length).toBe(n);
  });
});

describe('le verrou', () => {
  it('un meuble verrouillé ne se déplace, ne tourne ni ne se redimensionne plus', () => {
    const id = trois[0];
    st().verrouillerMeuble(id, true);
    expect(estVerrouille(meuble(id))).toBe(true);
    const avant = { ...meuble(id), transform: meuble(id).transform.slice() };
    st().setObjectCenter(id, 2, 3);
    st().setObjectCenter(id, 2, 3, true);
    st().rotateObject(id);
    st().setObjectYaw(id, 1);
    st().resizeObject(id, 1, 1);
    st().resizeObjectSide(id, 'largeur+', 1, { width: 0.45, depth: 0.45, cx: 1.4, cz: 2 } as never);
    st().setObjectHeight(id, 1.2);
    st().deplacerMeubles([id], 1, 1);
    expect(meuble(id).transform).toEqual(avant.transform);
    expect(meuble(id).width).toBe(avant.width);
    expect(meuble(id).height).toBe(avant.height);
    // Déverrouillé, il repart.
    st().verrouillerMeuble(id, false);
    expect(estVerrouille(meuble(id))).toBe(false);
    st().setObjectCenter(id, 1.6, 2.0);
    expect(meuble(id).transform[12]).toBeCloseTo(1.6, 3);
  });

  it('il s’enregistre avec le plan et passe dans la copie', () => {
    st().verrouillerMeuble(trois[1], true);
    st().commitCurrent();
    const enregistre = st().saves.find((s) => s.id === st().currentSaveId)!;
    expect(estVerrouille(enregistre.objects.find((o) => o.id === trois[1]))).toBe(true);
    st().saveAsCopy('Copie');
    expect(estVerrouille(st().objects.find((o) => o.id === trois[1]))).toBe(true);
  });

  it('il s’annule comme un geste', () => {
    st().verrouillerMeuble(trois[0], true);
    st().undo();
    expect(estVerrouille(meuble(trois[0]))).toBe(false);
  });
});

describe('à l’écran', () => {
  const styles = getStyles(light) as unknown as Record<string, object>;
  const barre = (o: ObjectData, extra: Partial<React.ComponentProps<typeof ObjectBar>> = {}) => (
    <ObjectBar
      object={o}
      styles={styles}
      palette={light}
      onPrompt={() => {}}
      onResize={() => {}}
      onRotate={() => {}}
      onCancel={() => {}}
      onNudge={() => {}}
      {...extra}
    />
  );

  it('la barre du meuble propose « Verrouiller », puis le cadenas fige ses réglages', () => {
    const verrou = jest.fn();
    const multi = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(barre(meuble(trois[0]), { onVerrou: verrou, onSelectionMultiple: multi }));
    });
    act(() => t.root.findByProps({ accessibilityLabel: 'Verrouiller le meuble' }).props.onPress());
    expect(verrou).toHaveBeenCalledWith(true);
    act(() => t.root.findByProps({ accessibilityLabel: 'Sélectionner plusieurs meubles' }).props.onPress());
    expect(multi).toHaveBeenCalled();
    // Verrouillé : plus de flèches, plus de « Pivoter », les cotes ne s'ouvrent plus.
    act(() => t.update(barre({ ...meuble(trois[0]), verrou: true } as ObjectData, { onVerrou: verrou })));
    expect(t.root.findAllByProps({ accessibilityLabel: 'Pivoter' })).toHaveLength(0);
    expect(t.root.findAllByProps({ accessibilityLabel: 'Déplacer vers le haut' })).toHaveLength(0);
    expect(t.root.findAllByProps({ accessibilityLabel: 'Largeur' })).toHaveLength(0);
    act(() => t.root.findByProps({ accessibilityLabel: 'Déverrouiller le meuble' }).props.onPress());
    expect(verrou).toHaveBeenCalledWith(false);
    act(() => t.unmount());
  });

  it('la barre de sélection : compte, aligne, répartit, déplace et retire', () => {
    const fait: string[] = [];
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <SelectionMeublesBar
          ids={trois}
          styles={styles}
          palette={light}
          onAligner={(m) => fait.push(`aligner:${m}`)}
          onRepartir={(a) => fait.push(`repartir:${a}`)}
          onNudge={(dx, dy) => fait.push(`nudge:${dx},${dy}`)}
          onRetirer={() => fait.push('retirer')}
          onTerminer={() => fait.push('terminer')}
          onMenu={(m) => m.actions[0].onPress?.()}
        />,
      );
    });
    const texte = t.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children).join(' ');
    expect(texte).toMatch(/3 meubles/);
    act(() => t.root.findByProps({ accessibilityLabel: 'Aligner les meubles' }).props.onPress());
    act(() => t.root.findByProps({ accessibilityLabel: 'Répartir les meubles' }).props.onPress());
    const droite = t.root.find((x) => x.props.accessibilityLabel === 'Déplacer vers la droite' && typeof x.props.onPressIn === 'function');
    act(() => droite.props.onPressIn());
    act(() => droite.props.onPressOut());
    act(() => t.root.findByProps({ accessibilityLabel: 'Retirer les meubles choisis' }).props.onPress());
    act(() => t.root.findByProps({ accessibilityLabel: 'Terminer la sélection' }).props.onPress());
    expect(fait).toEqual(['aligner:gauche', 'repartir:horizontal', 'nudge:1,0', 'retirer', 'terminer']);
    act(() => t.unmount());
  });

  it('deux meubles : « Répartir » ne se propose pas', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <SelectionMeublesBar
          ids={trois.slice(0, 2)}
          styles={styles}
          palette={light}
          onAligner={() => {}}
          onRepartir={() => {}}
          onNudge={() => {}}
          onRetirer={() => {}}
          onTerminer={() => {}}
          onMenu={() => {}}
        />,
      );
    });
    expect(t.root.findAllByProps({ accessibilityLabel: 'Répartir les meubles' })).toHaveLength(0);
    act(() => t.unmount());
  });
});

/** Un doigt, avec l'archive tactile que `PanResponder` relit (comme `meublefluide`). */
function doigt() {
  let horloge = 1000;
  type Trace = Record<string, number | boolean>;
  let t: Trace | null = null;
  const ev = () => ({
    nativeEvent: {
      touches: t?.touchActive ? [{ identifier: 0, pageX: t.currentPageX, pageY: t.currentPageY }] : [],
      locationX: 10,
      locationY: 10,
      pageX: (t?.currentPageX as number) ?? 0,
      pageY: (t?.currentPageY as number) ?? 0,
    },
    touchHistory: {
      touchBank: [t],
      numberActiveTouches: t?.touchActive ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: horloge,
    },
  });
  return {
    poser(x: number, y: number) {
      horloge += 16;
      t = { touchActive: true, startPageX: x, startPageY: y, startTimeStamp: horloge, currentPageX: x, currentPageY: y,
        currentTimeStamp: horloge, previousPageX: x, previousPageY: y, previousTimeStamp: horloge };
      return ev();
    },
    bouger(x: number, y: number) {
      horloge += 16;
      t = { ...t!, previousPageX: t!.currentPageX, previousPageY: t!.currentPageY, currentPageX: x, currentPageY: y, currentTimeStamp: horloge };
      return ev();
    },
    lever() {
      horloge += 16;
      t = { ...t!, touchActive: false };
      return ev();
    },
  };
}

describe('sur le plan', () => {
  afterEach(() => finirLeGeste());
  const monter = (props: Partial<React.ComponentProps<typeof FloorplanEditor>>) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <FloorplanEditor showMeasures={false} editable selectedWallId={null} onSelectWall={() => {}} onSelectObject={() => {}} {...props} />,
      );
    });
    act(() => {
      for (const n of t.root.findAllByType(View)) n.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } } });
    });
    return t;
  };

  it('les meubles choisis se dessinent en bleu, et l’ensemble se glisse en un seul « Annuler »', () => {
    const t = monter({ meublesChoisis: trois });
    const trait = (id: string) => t.root.findByProps({ testID: `meuble-${id}` }).findAll((n) => n.props.strokeWidth === 2.5);
    for (const id of trois) expect(trait(id).length).toBeGreaterThan(0);
    const poignee = t.root.findByType(GroupeDragHandle);
    const h = t.root.find((n) => n.props.testID === 'glisser-les-meubles' && typeof n.props.onResponderGrant === 'function').props;
    const avant = Object.fromEntries(trois.map((id) => [id, meuble(id).transform.slice()]));
    const d = poignee.props.mapping.deltaToMeters(40, 0);
    const m = doigt();
    act(() => {
      h.onStartShouldSetResponder(m.poser(100, 100));
      h.onResponderGrant(m.poser(100, 100));
      h.onResponderMove(m.bouger(120, 100));
      h.onResponderMove(m.bouger(140, 100));
      h.onResponderRelease(m.lever());
    });
    for (const id of trois) {
      expect(meuble(id).transform[12] - avant[id][12]).toBeCloseTo(d.x, 2);
      expect(meuble(id).transform[14] - avant[id][14]).toBeCloseTo(d.z, 2);
    }
    act(() => st().undo());
    for (const id of trois) expect(meuble(id).transform).toEqual(avant[id]);
    act(() => t.unmount());
  });

  it('un appui sans glisser sur l’ensemble désigne le meuble dessous', () => {
    const choisir = jest.fn();
    const t = monter({ meublesChoisis: trois.slice(0, 2), onSelectObject: choisir });
    const poignee = t.root.findByType(GroupeDragHandle);
    // L'appui tombe au centre de la première chaise.
    const o = meuble(trois[0]);
    const q = poignee.props.mapping.toPx({ x: o.transform[12], z: o.transform[14] });
    act(() => poignee.props.onTap(q));
    expect(choisir).toHaveBeenCalledWith(trois[0]);
    act(() => t.unmount());
  });

  it('un meuble verrouillé tenu : cadenas sur le plan, ni poignée de glisser ni de rotation', () => {
    st().verrouillerMeuble(trois[0], true);
    const t = monter({ selectedObjectId: trois[0] });
    expect(t.root.findAllByProps({ testID: `cadenas-${trois[0]}` }).length).toBeGreaterThan(0);
    expect(t.root.findAllByType(ObjectDragHandle)).toHaveLength(0);
    expect(t.root.findAllByType(RotateHandle)).toHaveLength(0);
    act(() => t.unmount());
    // Libre, les poignées reviennent.
    st().verrouillerMeuble(trois[0], false);
    const t2 = monter({ selectedObjectId: trois[0] });
    expect(t2.root.findAllByType(ObjectDragHandle)).toHaveLength(1);
    act(() => t2.unmount());
  });
});

describe('dans l’écran du plan', () => {
  it('« Plusieurs », toucher un second meuble, aligner, puis « Terminer »', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of t.root.findAllByType(View)) n.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 620 } } });
    });
    act(() => t.root.find((n) => n.props.label === 'Édition' && typeof n.props.onPress === 'function').props.onPress());
    const editeur = () => t.root.findByType(FloorplanEditor);
    act(() => editeur().props.onSelectObject(trois[0]));
    // La pastille « Plusieurs », à côté du meuble tenu.
    act(() =>
      t.root.find((n) => n.props.accessibilityLabel === 'Sélectionner plusieurs meubles' && typeof n.props.onPress === 'function').props.onPress(),
    );
    // Le meuble tenu devient le premier choisi ; un appui en ajoute un second.
    act(() => editeur().props.onSelectObject(trois[1]));
    const barre = () => t.root.findAllByType(SelectionMeublesBar);
    expect(barre()).toHaveLength(1);
    expect(barre()[0].props.ids).toEqual([trois[0], trois[1]]);
    expect(editeur().props.meublesChoisis).toEqual([trois[0], trois[1]]);
    act(() => barre()[0].props.onAligner('haut'));
    expect(ecran(meuble(trois[0])).h).toBeCloseTo(ecran(meuble(trois[1])).h, 3);
    // Retoucher un choisi le retire ; « Terminer » referme la sélection.
    act(() => editeur().props.onSelectObject(trois[1]));
    expect(barre()[0].props.ids).toEqual([trois[0]]);
    act(() => barre()[0].props.onTerminer());
    expect(barre()).toHaveLength(0);
    // Le cadenas, à côté du meuble tenu : verrouille sans ouvrir la carte.
    act(() => editeur().props.onSelectObject(trois[2]));
    act(() =>
      t.root.find((n) => n.props.accessibilityLabel === 'Verrouiller le meuble' && typeof n.props.onPress === 'function').props.onPress(),
    );
    expect(estVerrouille(meuble(trois[2]))).toBe(true);
    act(() => t.unmount());
  });
});

describe('le caisson contre un autre mur (bonus)', () => {
  it('pivoté, il se recolle de nu à nu contre le refend, avec ses cotes, en un « Annuler »', () => {
    const sejour = st().rooms.find((r) => r.name === 'Séjour-cuisine')!;
    const id = st().ajouterCaisson('nord', sejour.id)!;
    st().setObjectHeight(id, 0.4);
    st().rotateObject(id);
    const avant = { ...meuble(id), transform: meuble(id).transform.slice() };
    expect(st().recollerCaisson(id, 'refend')).toBe(true);
    const c = meuble(id);
    expect(c.depth).toBeCloseTo(avant.depth, 6);
    expect(c.height).toBeCloseTo(avant.height, 6);
    // Dos au refend (x = 5 − 7 cm de demi-épaisseur), dans le séjour.
    const e = empriseDuCaisson(c);
    expect(Math.max(...e.map((p) => p.x))).toBeCloseTo(4.93, 2);
    st().undo();
    expect(meuble(id).transform).toEqual(avant.transform);
    // Un mur qui ne borde pas sa pièce est refusé, sans point d'annulation.
    expect(st().recollerCaisson(id, 'pas-un-mur')).toBe(false);
  });

  it('la barre d’un caisson propose « Recoller »', () => {
    const styles = getStyles(light) as unknown as Record<string, object>;
    const recoller = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ObjectBar object={meuble(trois[0])} styles={styles} palette={light} onPrompt={() => {}} onResize={() => {}} onRotate={() => {}} onCancel={() => {}} onRecoller={recoller} />,
      );
    });
    act(() => t.root.findByProps({ accessibilityLabel: 'Contre un autre mur' }).props.onPress());
    expect(recoller).toHaveBeenCalled();
    act(() => t.unmount());
  });
});
