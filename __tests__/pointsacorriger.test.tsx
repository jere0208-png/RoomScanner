/**
 * TROIS RETOUCHES DE L'ÉCRAN DU PLAN.
 *
 * Relevé du patron : « dans le mode édition, je vois un "N?" à côté du
 * bouton des points à corriger. Aussi, revois de façon plus ludique et
 * moderne l'affichage des points à corriger. Depuis l'extérieur sur la vue
 * 3D, on doit voir transparent dans les fenêtres, pas bleu. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { NorthBadge } from '../src/components/CardinalRing';
import { DiagnosticSheet, type Constat } from '../src/components/DiagnosticSheet';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { fabriquer } from '../src/geometry/modeles3d';
import type { WallSeg } from '../src/geometry/floorplan';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));

describe('le nord à orienter se dit en clair', () => {
  it('plus de « N? » énigmatique : une boussole et « Orienter le nord »', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<NorthBadge x={10} y={54} invite={false} onPress={jest.fn()} />);
    });
    const tout = JSON.stringify(t.toJSON());
    expect(tout).not.toContain('N?');
    expect(tout).toContain('Orienter le nord');
    act(() => t.unmount());
  });

  it('il se pose SOUS la rangée des pastilles, plus à côté d’elles', () => {
    const plan = lire('src/components/FloorplanEditor.tsx');
    expect(plan).toContain('<NorthBadge\n          x={10}\n          y={HAUT_SOUS_LES_PASTILLES}');
  });

  it('« Mesurer » se resserre en icône : la rangée tient dans un téléphone', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('accessibilityLabel="Mesurer"');
    expect(ecran).not.toContain('>Mesurer</Text>');
  });

  it('le prix du devis ne sort plus de l’écran : la rangée se serre quand elle déborde', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('return total > winLargeur - 2 * 16 - 20;');
    // « Explorer » garde son mot (revue « Chloé ») : serré, il se dit « Visite ».
    expect(ecran).toContain("<Text style={styles.explorerPastilleTexte}>{explorerCourt ? 'Visite' : 'Explorer'}</Text>");
    expect(ecran).toContain('{!rangeeSerree && <Text style={styles.vuePastilleTexte}>Travaux</Text>}');
  });
});

describe('les points à corriger, version ludique', () => {
  const alerte = (n: number, roomId = 'r1'): Constat => ({
    key: `p${n}`,
    message: `Défaut ${n}`,
    hint: 'Une explication.',
    severity: 'alerte',
    roomId,
    fix: n === 1 ? { type: 'poser', kind: 'rj45', label: 'Poser RJ45' } : undefined,
  });
  const info: Constat = { key: 'i1', message: 'À regarder', hint: 'Une remarque.', severity: 'info', roomId: 'r2' };
  const ROOMS = [
    { id: 'r1', name: 'Chambre' },
    { id: 'r2', name: 'Séjour' },
  ];
  const monter = (issues: Constat[]) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <DiagnosticSheet visible issues={issues} rooms={ROOMS} onClose={jest.fn()} onGoToIssue={jest.fn()} onFix={jest.fn()} />,
      );
    });
    return t;
  };

  it('une jauge de progression, qui compte ce qu’on vient de corriger', () => {
    const t = monter([alerte(1), alerte(2), alerte(3), info]);
    expect(t.root.findAll((n) => n.props.testID === 'jauge-controle').length).toBeGreaterThan(0);
    expect(textes(t)).toContain('3 à corriger');
    // Un point réglé : la jauge le compte.
    act(() =>
      t.update(
        <DiagnosticSheet visible issues={[alerte(2), alerte(3), info]} rooms={ROOMS} onClose={jest.fn()} onGoToIssue={jest.fn()} onFix={jest.fn()} />,
      ),
    );
    expect(textes(t)).toContain('2 à corriger');
    expect(textes(t).join(' ')).toMatch(/1 corrigé/);
    act(() => t.unmount());
  });

  it('des filtres : tout, à corriger, à vérifier — avec leurs comptes', () => {
    const t = monter([alerte(1), alerte(2), info]);
    const filtre = (label: string) =>
      t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
    expect(filtre('À vérifier · 1')).toBeDefined();
    act(() => filtre('À vérifier · 1').props.onPress());
    const messages = t.root
      .findAllByType(TouchableOpacity)
      .map((n) => n.props.accessibilityLabel)
      .filter((l) => typeof l === 'string' && /Défaut|À regarder/.test(l));
    expect(messages).toEqual(['À regarder']);
    act(() => filtre('Tout · 3').props.onPress());
    act(() => t.unmount());
  });

  it('chaque carte dit sa gravité ; le geste qui corrige reste un bouton à part', () => {
    const onFix = jest.fn();
    const onGo = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DiagnosticSheet visible issues={[alerte(1), info]} rooms={ROOMS} onClose={jest.fn()} onGoToIssue={onGo} onFix={onFix} />);
    });
    expect(textes(t)).toEqual(expect.arrayContaining(['À corriger', 'À vérifier']));
    const corriger = t.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === 'Poser RJ45')!;
    act(() => corriger.props.onPress());
    expect(onFix).toHaveBeenCalled();
    expect(onGo).not.toHaveBeenCalled();
    act(() => t.unmount());
  });

  it('rien à corriger : la feuille le fête', () => {
    const t = monter([]);
    expect(textes(t).join(' ')).toMatch(/Tout est bon/);
    act(() => t.unmount());
  });
});

describe('les fenêtres vues du dehors', () => {
  const PAL = {
    floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
    wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
    object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
  } as ScenePalette;
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1',
  });
  const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
  const FEN: WallSeg = { ...mur('f', 1, 0, 2.2, 0), type: 'window', height: 1.2, yCenter: 1.55 };
  const vitrageDe = (plafonds: boolean) =>
    buildScene(MURS, [FEN], [], { palette: PAL, showSurfaces: true, rooms: [{ id: 'r1', wallIds: MURS.map((w) => w.id) }], plafonds })
      .meubles!.find((m) => m.category === 'fenetre3d')!;

  it('la maquette, vue du dehors, les montre en verre clair ; la visite garde le jour bleu', () => {
    expect(vitrageDe(false).attributes).toContain('Vitrage:clair');
    expect(vitrageDe(true).attributes).toContain('Vitrage:jour');
  });

  it('le verre clair est un vrai verre transparent, pas l’aplat du jour', () => {
    const modele = (attr: string) =>
      fabriquer('fenetre3d', { W: 1.2, D: 0.2, H: 1.2 }, { modele: '', attributs: ['FenetreType:fenetre', 'Vantaux:2', attr], hasard: () => 0.5 });
    const clair = modele('Vitrage:clair').groupes.map((g) => g.mat);
    expect(clair).toContain('verre');
    expect(clair).not.toContain('vitrage');
    expect(modele('Vitrage:jour').groupes.map((g) => g.mat)).toContain('vitrage');
  });
});
