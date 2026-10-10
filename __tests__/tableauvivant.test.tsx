/**
 * LE TABLEAU RELEVÉ, ORGANE PAR ORGANE — et le même, sur le plan.
 *
 * Relevé du patron : « revois pour une refonte plus ludique et fonctionnelle
 * du relevé du tableau existant. Le tableau placé sur le plan doit
 * visuellement correspondre au tableau existant, et les deux systèmes doivent
 * être liés : si on a un disjoncteur, alors un seul doit s'afficher sur le
 * tableau, avec les normes qui feront blocage, comme deux rangées minimum. »
 *
 * Ce banc tient :
 *   — L'IMPLANTATION : chaque organe à sa rangée, à sa place, à sa largeur
 *     (un différentiel prend deux modules), la réserve d'un cinquième ;
 *   — LE RATTACHEMENT : chaque départ sous le différentiel qui le précède
 *     sur le rail, comme le peigne le câble ;
 *   — LES BLOCAGES : ce que la norme refuse (deux rangées minimum, un circuit
 *     hors 30 mA…) devient un point bloquant ; ce qui est physiquement
 *     impossible (deux places pour un différentiel quand il en reste une)
 *     ne se fait pas ;
 *   — LE LIEN : le rail relevé est celui que dessinent l'élévation et la 3D —
 *     un disjoncteur relevé, un disjoncteur dessiné ;
 *   — LA FEUILLE : on touche une place, on choisit, ça se clipse.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Rect } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import {
  diagnosticExistant,
  dimensionsDuCoffret,
  grilleDuTableau,
  implanter,
  railDuReleve,
  rattacher,
  type DepartExistant,
} from '../src/geometry/existant';
import { habillerLesTableaux, modeleDAppareil, type PoseDAppareil } from '../src/geometry/appareils3d';
import { AppareilDeFace } from '../src/components/AppareilDeFace';
import { ExistantSheet } from '../src/screens/result/ExistantSheet';
import { useScanStore } from '../src/store/scanStore';

const dj = (id: string, calibre: number, rangee?: number, usage = 'Prises'): DepartExistant => ({
  id,
  organe: 'disjoncteur',
  calibre,
  usage,
  ...(rangee !== undefined ? { rangee } : {}),
});
const diff = (id: string, typeDiff: 'A' | 'AC' = 'A', rangee?: number): DepartExistant => ({
  id,
  organe: 'differentiel',
  calibre: 40,
  sensibilite: 30,
  typeDiff,
  ...(rangee !== undefined ? { rangee } : {}),
});

describe('l’implantation : chaque organe à sa place', () => {
  it('un différentiel prend deux modules, un disjoncteur un', () => {
    const impl = implanter({ departs: [diff('d1', 'A', 0), dj('c1', 16, 0), dj('c2', 20, 0)], rangees: 2, parRangee: 13 });
    expect(impl.modules.map((m) => [m.depart.id, m.rangee, m.debut, m.largeur])).toEqual([
      ['d1', 0, 0, 2],
      ['c1', 0, 2, 1],
      ['c2', 0, 3, 1],
    ]);
    expect(impl.libres).toEqual([9, 13]);
    expect(impl.occupees).toBe(4);
    // Un cinquième de 26 places, arrondi au-dessus.
    expect(impl.reserve).toBe(6);
  });

  it('sans rangées relevées, le tableau en montre deux — le minimum de la norme', () => {
    const impl = implanter({ departs: [dj('c1', 16)] });
    expect(impl.rangees).toBe(2);
    expect(impl.decrit).toBe(false);
  });

  it('un relevé d’avant, sans rangées, se range dans l’ordre, rangée après rangée', () => {
    const departs = [diff('d1'), ...Array.from({ length: 12 }, (_, i) => dj(`c${i}`, 16))];
    const impl = implanter({ departs, rangees: 2, parRangee: 13 });
    // Deux places pour le différentiel, onze disjoncteurs : la rangée est
    // pleine, le douzième passe à la suivante.
    expect(impl.modules.filter((m) => m.rangee === 0)).toHaveLength(12);
    expect(impl.modules.find((m) => m.depart.id === 'c11')!.rangee).toBe(1);
  });

  it('ce qui ne tient plus sur le rail n’est jamais perdu', () => {
    const impl = implanter({ departs: [dj('c1', 16, 0), dj('c2', 16, 1)], rangees: 1, parRangee: 13 });
    expect(impl.horsRail.map((d) => d.id)).toEqual(['c2']);
  });
});

describe('le rattachement : on le lit sur le rail', () => {
  it('chaque départ sous le différentiel qui le précède — et rien avant le premier', () => {
    const departs = [dj('avant', 16, 0), diff('d1', 'A', 0), dj('c1', 16, 0), diff('d2', 'AC', 1), dj('c2', 20, 1)];
    const impl = implanter({ departs, rangees: 2, parRangee: 13 });
    const r = new Map(rattacher(departs, impl).map((d) => [d.id, d.sousDifferentiel]));
    expect(r.get('avant')).toBeUndefined();
    expect(r.get('c1')).toBe('d1');
    expect(r.get('c2')).toBe('d2');
  });

  it('une rangée qui commence par des disjoncteurs les tient du différentiel d’au-dessus', () => {
    const departs = [diff('d1', 'A', 0), dj('c1', 16, 0), dj('c2', 16, 1)];
    const impl = implanter({ departs, rangees: 2, parRangee: 13 });
    expect(rattacher(departs, impl).find((d) => d.id === 'c2')!.sousDifferentiel).toBe('d1');
  });
});

describe('les normes qui bloquent', () => {
  const sain = (): DepartExistant[] => {
    const departs = [diff('d1', 'A', 0), dj('c1', 16, 0), diff('d2', 'AC', 1), dj('c2', 20, 1)];
    return rattacher(departs, implanter({ departs, rangees: 2, parRangee: 13 }));
  };

  it('une seule rangée : point bloquant', () => {
    const k = diagnosticExistant(sain(), { rangees: 1, parRangee: 13 }).find((c) => c.id === 'une-rangee');
    expect(k).toBeDefined();
    expect(k!.bloquant).toBe(true);
    expect(diagnosticExistant(sain(), { rangees: 2, parRangee: 13 }).some((c) => c.id === 'une-rangee')).toBe(false);
  });

  it('un disjoncteur avant tout différentiel : danger, et il est montré du doigt', () => {
    const departs = [dj('nu', 16, 0), ...sain()];
    const placees = rattacher(departs, implanter({ departs, rangees: 2, parRangee: 13 }));
    const k = diagnosticExistant(placees).find((c) => c.id === 'hors-30ma');
    expect(k?.gravite).toBe('danger');
    expect(k?.cibles).toEqual(['nu']);
  });

  it('la réserve se compte en modules : un différentiel en prend deux', () => {
    // 13 places : un différentiel (2) et neuf disjoncteurs font 11 — il
    // n'en reste que deux, moins d'un cinquième.
    const departs = [diff('d1', 'A', 0), diff('d2', 'AC', 0), ...Array.from({ length: 7 }, (_, i) => dj(`c${i}`, 16, 0))];
    expect(diagnosticExistant(departs, { rangees: 1, parRangee: 13 }).some((c) => c.id === 'reserve')).toBe(true);
  });

  it('la grille coche ce qui va, met son cadenas à ce qui bloque', () => {
    const grille = grilleDuTableau(sain(), diagnosticExistant(sain(), { rangees: 2, parRangee: 13 }), true);
    expect(grille.every((g) => g.ok === true)).toBe(true);
    const une = grilleDuTableau(sain(), diagnosticExistant(sain(), { rangees: 1, parRangee: 13 }), true);
    expect(une.find((g) => g.id === 'rangees')!.ok).toBe(false);
    // Des rangées qu'on n'a pas relevées ne se jugent pas : « à relever ».
    expect(grilleDuTableau(sain(), diagnosticExistant(sain()), false).find((g) => g.id === 'rangees')!.ok).toBeNull();
  });
});

describe('le même tableau, sur le plan', () => {
  it('un disjoncteur relevé : un seul organe sur le rail dessiné', () => {
    const rail = railDuReleve({ departs: [dj('c1', 16)], rangees: 2, parRangee: 13 })!;
    expect(rail.modules).toEqual([{ rangee: 0, debut: 0, largeur: 1, genre: 'disjoncteur' }]);
    expect(rail.rangees).toBe(2);
  });

  it('le coffret prend les cotes de son rail', () => {
    const d = dimensionsDuCoffret({ rangees: 2, parRangee: 13 });
    expect(d.largeur).toBeCloseTo(0.3275, 4);
    expect(d.hauteur).toBeCloseTo(0.34, 4);
  });

  const pose: PoseDAppareil = { id: 't', genre: 'tableau', largeur: 0.55, hauteur: 0.65, x: 0, y: 1.35, z: 0, nx: 0, nz: 1 };
  const prise: PoseDAppareil = { id: 'p', genre: 'plaque', largeur: 0.08, hauteur: 0.08, x: 1, y: 0.3, z: 0, nx: 0, nz: 1 };

  it('chaque tableau posé reçoit le rail relevé, et rien d’autre ne change', () => {
    const rail = railDuReleve({ departs: [dj('c1', 16)], rangees: 2, parRangee: 13 });
    const [t, p] = habillerLesTableaux([pose, prise], rail);
    expect(t.rail).toBe(rail);
    expect(t.largeur).toBeCloseTo(0.3275, 4);
    expect(p).toBe(prise);
    // Sans relevé, le tableau générique reste.
    expect(habillerLesTableaux([pose], null)[0]).toBe(pose);
  });

  it('en 3D, deux relevés différents font deux tableaux différents', () => {
    const un = railDuReleve({ departs: [dj('c1', 16)], rangees: 2, parRangee: 13 });
    const cinq = railDuReleve({ departs: Array.from({ length: 5 }, (_, i) => dj(`c${i}`, 16)), rangees: 2, parRangee: 13 });
    const [a] = habillerLesTableaux([pose], un);
    const [b] = habillerLesTableaux([pose], cinq);
    const ma = modeleDAppareil(a);
    const mb = modeleDAppareil(b);
    expect(ma).not.toBe(mb);
    const sommets = (m: ReturnType<typeof modeleDAppareil>) => JSON.stringify(m).length;
    expect(sommets(mb)).toBeGreaterThan(sommets(ma));
  });

  it('en élévation, un différentiel relevé : un seul bouton de test dessiné', () => {
    const rail = railDuReleve({ departs: [diff('d1', 'A', 0), dj('c1', 16, 0)], rangees: 2, parRangee: 13 });
    const [t] = habillerLesTableaux([pose], rail);
    let arbre!: TestRenderer.ReactTestRenderer;
    act(() => {
      arbre = TestRenderer.create(<AppareilDeFace pose={t} cx={100} cy={100} k={400} />);
    });
    const tests = arbre.root.findAllByType(Rect).filter((r) => r.props.fill === '#4F7FB8');
    expect(tests).toHaveLength(1);
    act(() => arbre.unmount());
    // Le tableau générique en porte quatre, un par rangée.
    act(() => {
      arbre = TestRenderer.create(<AppareilDeFace pose={pose} cx={100} cy={100} k={400} />);
    });
    expect(arbre.root.findAllByType(Rect).filter((r) => r.props.fill === '#4F7FB8')).toHaveLength(4);
    act(() => arbre.unmount());
  });
});

describe('le store range le tableau après chaque geste', () => {
  beforeEach(() => act(() => useScanStore.getState().reset()));
  const st = () => useScanStore.getState();

  it('le disjoncteur clipsé après un différentiel est sous lui, sans qu’on le dise', () => {
    st().ajouterDepart({ organe: 'differentiel', calibre: 40, sensibilite: 30, typeDiff: 'A', rangee: 0 });
    const id = st().ajouterDepart({ organe: 'disjoncteur', calibre: 16, rangee: 0 });
    const d1 = st().existant!.departs[0].id;
    expect(st().existant!.departs.find((d) => d.id === id)!.sousDifferentiel).toBe(d1);
    // Déplacé avant le différentiel, il n'est plus protégé par lui.
    st().deplacerDepart(id, { pas: -1 });
    expect(st().existant!.departs[0].id).toBe(id);
    expect(st().existant!.departs.find((d) => d.id === id)!.sousDifferentiel).toBeUndefined();
  });

  it('il change de rangée s’il y a la place, et pas autrement', () => {
    st().decrireTableau({ rangees: 2, parRangee: 13 });
    const id = st().ajouterDepart({ organe: 'disjoncteur', calibre: 16, rangee: 0 });
    st().deplacerDepart(id, { rangee: 1 });
    expect(st().existant!.departs.find((d) => d.id === id)!.rangee).toBe(1);
    // La rangée 1 pleine : il ne peut pas y descendre.
    for (let i = 0; i < 13; i++) st().ajouterDepart({ organe: 'disjoncteur', calibre: 16, rangee: 0 });
    const plein = st().existant!.departs.filter((d) => d.rangee === 0);
    expect(plein.length).toBe(13);
    const autre = st().existant!.departs.find((d) => d.rangee === 1)!.id;
    st().deplacerDepart(autre, { rangee: 0 });
    expect(st().existant!.departs.find((d) => d.id === autre)!.rangee).toBe(1);
  });

  it('un relevé d’avant reçoit ses rangées au premier geste', () => {
    act(() =>
      useScanStore.setState({
        existant: { departs: [diff('d1'), dj('c1', 16)], rangees: 2, parRangee: 13 },
      }),
    );
    st().modifierDepart('c1', { usage: 'Éclairage' });
    expect(st().existant!.departs.map((d) => d.rangee)).toEqual([0, 0]);
    expect(st().existant!.departs[1].sousDifferentiel).toBe('d1');
  });
});

describe('la feuille : on touche, on choisit, ça se clipse', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    act(() => useScanStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  const Feuille = (props: { onClose?: () => void; onPlacer?: () => void; surLePlan?: { piece?: string } | null }) => {
    const existant = useScanStore((s) => s.existant);
    // La feuille se referme pour de bon quand on la ferme : c'est après
    // son départ que l'autre écran s'ouvre.
    const [visible, setVisible] = React.useState(true);
    return (
      <ExistantSheet
        visible={visible}
        existant={existant}
        onClose={() => {
          setVisible(false);
          props.onClose?.();
        }}
        onAjouter={(d) => useScanStore.getState().ajouterDepart(d)}
        onModifier={(id, c) => useScanStore.getState().modifierDepart(id, c)}
        onRetirer={(id) => useScanStore.getState().retirerDepart(id)}
        onDecrire={(t) => useScanStore.getState().decrireTableau(t)}
        onDeplacer={(id, v) => useScanStore.getState().deplacerDepart(id, v)}
        surLePlan={props.surLePlan ?? null}
        onPlacer={props.onPlacer}
      />
    );
  };
  const monter = (props: Parameters<typeof Feuille>[0] = {}) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Feuille {...props} />);
    });
    // Le coffret prend sa largeur.
    act(() => {
      t.root.findByProps({ testID: 'tableau-vivant' }).props.onLayout({ nativeEvent: { layout: { width: 343, height: 300 } } });
    });
    return t;
  };
  const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
    const b = t.root
      .findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })
      .find(() => true);
    expect([label, !!b]).toEqual([label, true]);
    act(() => b!.props.onPress());
  };
  const organes = (t: TestRenderer.ReactTestRenderer, debut: string) =>
    t.root.findAll(
      (n) =>
        typeof n.props.onPress === 'function' &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith(debut),
      { deep: false },
    );
  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Text)
      .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
      .join(' | ');

  it('un disjoncteur choisi : un seul organe sur le tableau, à sa place', () => {
    const t = monter();
    // La palette est déjà ouverte sur la première rangée.
    expect(t.root.findAllByProps({ testID: 'palette-du-tableau' }).length).toBeGreaterThan(0);
    appuyer(t, 'Disjoncteur 16 ampères');
    expect(useScanStore.getState().existant!.departs).toHaveLength(1);
    expect(useScanStore.getState().existant!.departs[0].rangee).toBe(0);
    expect(organes(t, 'Disjoncteur 16 A')).toHaveLength(1);
    act(() => t.unmount());
  });

  it('un différentiel ne se clipse pas sur une seule place', () => {
    const t = monter();
    for (let i = 0; i < 12; i++) appuyer(t, 'Disjoncteur 16 ampères');
    // Reste une place en rangée 1 : on la vise.
    appuyer(t, 'Clipser un organe en rangée 1 — 1 place libre');
    appuyer(t, 'Clipser : Différentiel 30 mA');
    expect(useScanStore.getState().existant!.departs.some((d) => d.organe === 'differentiel')).toBe(false);
    expect(textes(t)).toMatch(/2 places, il n’en reste 1/);
    act(() => t.unmount());
  });

  it('une rangée pleine passe la main à la suivante', () => {
    const t = monter();
    for (let i = 0; i < 13; i++) appuyer(t, 'Disjoncteur 16 ampères');
    appuyer(t, 'Disjoncteur 10 ampères');
    const derniers = useScanStore.getState().existant!.departs;
    expect(derniers[13].rangee).toBe(1);
    act(() => t.unmount());
  });

  it('une rangée de moins : deux minimum, c’est un point bloquant — et une rangée garnie ne se retire pas', () => {
    const t = monter();
    appuyer(t, 'Clipser : Différentiel 30 mA');
    appuyer(t, 'Une rangée de moins');
    expect(useScanStore.getState().existant!.rangees).toBe(1);
    expect(textes(t)).toMatch(/la norme en demande deux/);
    expect(
      t.root.findAll((n) => n.props.accessibilityLabel === 'Deux rangées au minimum : bloquante').length,
    ).toBeGreaterThan(0);
    // On remonte à deux, on clipse en rangée 2, et l'on ne peut plus la retirer.
    appuyer(t, 'Une rangée de plus');
    appuyer(t, 'Clipser un organe en rangée 2 — 13 places libres');
    appuyer(t, 'Disjoncteur 20 ampères');
    appuyer(t, 'Une rangée de moins');
    expect(useScanStore.getState().existant!.rangees).toBe(2);
    expect(textes(t)).toMatch(/porte encore des organes/);
    act(() => t.unmount());
  });

  it('le verdict passe au vert quand tout ce qui se voit est conforme', () => {
    const t = monter();
    appuyer(t, 'Clipser : Différentiel 30 mA');
    appuyer(t, 'Disjoncteur 16 ampères');
    appuyer(t, 'Clipser un organe en rangée 2 — 13 places libres');
    appuyer(t, 'Clipser : Différentiel 30 mA');
    appuyer(t, 'Disjoncteur 20 ampères');
    appuyer(t, 'Une rangée de plus');
    appuyer(t, 'Une rangée de moins');
    expect(textes(t)).toMatch(/Conforme à ce qui se voit/);
    act(() => t.unmount());
  });

  it('pas encore sur le plan : un appui l’y pose, la feuille partie', () => {
    const onClose = jest.fn();
    const onPlacer = jest.fn();
    const t = monter({ onClose, onPlacer });
    appuyer(t, 'Disjoncteur 16 ampères');
    const poser = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => {
        const txt = n.findAllByType(Text).map((x) => x.props.children).join('');
        return txt === 'Le poser sur le plan';
      })!;
    act(() => poser.props.onPress());
    expect(onClose).toHaveBeenCalled();
    // On n'ouvre l'autre écran qu'une fois la feuille partie.
    expect(onPlacer).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(600));
    expect(onPlacer).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
  });
});
