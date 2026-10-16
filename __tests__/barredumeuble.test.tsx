/**
 * LA BARRE DU MEUBLE CHOISI — ce qui compte, en petit.
 *
 * Relevé du patron, capture à l'appui : « revois le menu affiché en bas lors
 * de la sélection d'un meuble : l'info “passe par les portes” n'est pas
 * importante, elle l'est si un meuble ne passe PAS par les portes. Les
 * chiffres de positionnement sont trop gros et prennent trop de place. »
 * Et sur la même capture, un frigo « posé à −0,85 m » : la pose se lisait
 * dans le repère de RoomPlan, pas depuis le sol.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { ObjectBar } from '../src/components/ObjectBar';
import type { WallSeg } from '../src/geometry/floorplan';
import { getStyles } from '../src/screens/result/styles';
import { useScanStore } from '../src/store/scanStore';
import { light } from '../src/theme';

const STYLES = getStyles(light) as unknown as Record<string, object>;
/** Un frigo de 1,94 m dont le dessous est au sol, sol à −0,85 dans le repère du scan. */
const FRIGO = {
  id: 'f',
  category: 'refrigerator',
  width: 0.6,
  depth: 0.65,
  height: 1.94,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, -0.85 + 0.97, 1, 1],
} as ObjectData;

const monter = (props: Record<string, unknown>) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ObjectBar
        object={FRIGO}
        styles={STYLES}
        palette={light}
        onPrompt={jest.fn()}
        onResize={jest.fn()}
        onRotate={jest.fn()}
        onCancel={jest.fn()}
        onHeight={jest.fn()}
        {...props}
      />,
    );
  });
  return t;
};
const textes = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));

/*
  MIS À JOUR — revue des « découvreurs » (six sur huit) : le silence ne se
  lisait pas comme un oui ; on croyait que l'outil n'avait pas regardé. Un
  meuble qui passe le DIT, discrètement, en vert, avec le compte des portes.
  L'alerte, elle, reste la même.
*/
describe('« ça passe » répond, oui ou non', () => {
  it('un meuble qui passe : « ✓ Passe par les 2 portes »', () => {
    const t = monter({ passage: { ok: true, court: 'Passe par les portes', detail: '…', portes: 2 } });
    expect(textes(t)).toContain('✓ Passe par les 2 portes');
    const puce = t.root.findAll((n) => n.props.accessibilityLabel === 'Ça passe ?', { deep: false });
    expect(puce).toHaveLength(1);
    act(() => t.unmount());
  });

  it('une seule porte se dit au singulier ; en kit, le verdict garde son mot', () => {
    const une = monter({ passage: { ok: true, court: 'Passe par les portes', detail: '…', portes: 1 } });
    expect(textes(une)).toContain('✓ Passe par la porte');
    act(() => une.unmount());
    const kit = monter({ passage: { ok: true, court: 'Passe en kit', detail: '…' } });
    expect(textes(kit)).toContain('✓ Passe en kit');
    act(() => kit.unmount());
  });

  it('un meuble qui ne passe pas : la puce, en alerte', () => {
    const t = monter({ passage: { ok: false, court: 'Ne passe pas par la porte d’entrée', detail: '…' } });
    expect(textes(t)).toContain('Ne passe pas par la porte d’entrée');
    act(() => t.unmount());
  });
});

describe('la pose se compte depuis le sol', () => {
  it('le frigo posé au sol se lit « 0,00 », pas « −0,85 »', () => {
    const t = monter({ sol: -0.85 });
    const vus = textes(t).join(' | ');
    expect(vus).toContain('0,00');
    expect(vus).not.toContain('-0,85');
    act(() => t.unmount());
  });

  it('et la pose saisie se pose au-dessus du sol du plan', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: -0.85 + 1.25,
    });
    act(() => {
      useScanStore.setState({ walls: [mur('n', 0, 0, 3, 0), mur('e', 3, 0, 3, 3)], objects: [FRIGO] });
      useScanStore.getState().setObjectHeight('f', undefined, 0.5);
    });
    const o = useScanStore.getState().objects.find((x) => x.id === 'f')!;
    expect(o.transform[13] - o.height / 2).toBeCloseTo(-0.85 + 0.5, 6);
  });
});

describe('des chiffres qui ne prennent plus la barre', () => {
  it('plus petits, dans des pastilles plus basses', () => {
    const s = getStyles(light) as unknown as Record<string, { fontSize?: number; minHeight?: number }>;
    expect(s.clValeur.fontSize!).toBeLessThanOrEqual(13.5);
    expect(s.clChamp.minHeight!).toBeLessThanOrEqual(28);
  });
});
