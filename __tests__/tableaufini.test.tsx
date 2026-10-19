/**
 * LE TABLEAU FINI, EN VRAI.
 *
 * Relevé du patron, photo d'un coffret à l'appui : « avoir un rendu visuel
 * du tableau fini réaliste, avec le tableau que l'on a constitué. Ajoute des
 * éléments dans la construction du tableau comme interrupteur général,
 * répartiteur, etc. Sur le plan 3D, le clic sur le modèle du tableau doit
 * ouvrir son visuel réaliste, avec les notes sous chaque disjoncteur selon
 * ce que l'on a mis (des icônes Solar de prises, lumières…), avec leur pièce
 * si possible. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { G, Path, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import {
  LARGEUR_ORGANE,
  railDuReleve,
  type DepartExistant,
  type TableauExistant,
} from '../src/geometry/existant';
import { etiquettesDuTableau, tableauDepuisLePlan } from '../src/geometry/tableauFini';
import type { Circuit, Differential } from '../src/geometry/nfc15100';
import { nommerOrgane } from '../src/components/TableauVivant';
import { TableauRealiste } from '../src/components/TableauRealiste';
import { TableauFiniSheet } from '../src/components/TableauFiniSheet';
import { ExistantSheet } from '../src/screens/result/ExistantSheet';
import { SOLAIRES } from '../src/ui/solaires';

const dep = (id: string, champs: Omit<DepartExistant, 'id'>): DepartExistant => ({ id, ...champs });

/** Un tableau constitué : l'interrupteur général, un répartiteur, un différentiel et trois départs. */
const CONSTITUE: TableauExistant = {
  rangees: 2,
  parRangee: 13,
  departs: [
    dep('ig', { organe: 'interrupteur', calibre: 63 }),
    dep('rp', { organe: 'repartiteur', calibre: null }),
    dep('id1', { organe: 'differentiel', calibre: 40, sensibilite: 30, typeDiff: 'AC' }),
    dep('q1', { organe: 'disjoncteur', calibre: 16, usage: 'Éclairage', piece: 'Séjour' }),
    dep('q2', { organe: 'disjoncteur', calibre: 20, usage: 'Prises', piece: 'Chambre' }),
    dep('q3', { organe: 'disjoncteur', calibre: 20, usage: 'Lave-linge', piece: 'Salle d’eau' }),
  ],
};

const textes = (t: TestRenderer.ReactTestRenderer) => [
  ...t.root.findAllByType(SvgText).map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? ''))),
  ...t.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? ''))),
];
const traces = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Path).map((p) => String(p.props.d));

describe('la construction du tableau', () => {
  it('l’interrupteur général et le répartiteur se posent sur le rail, à leur largeur', () => {
    expect(LARGEUR_ORGANE.interrupteur).toBe(2);
    expect(LARGEUR_ORGANE.repartiteur).toBe(6);
    const rail = railDuReleve(CONSTITUE)!;
    expect(rail.modules.map((m) => m.genre).slice(0, 2)).toEqual(['interrupteur', 'repartiteur']);
    expect(nommerOrgane(CONSTITUE.departs[0])).toBe('Interrupteur général 63 A');
    expect(nommerOrgane(CONSTITUE.departs[1])).toBe('Répartiteur');
  });

  it('chaque départ porte une étiquette : repère, icône, calibre et pièce', () => {
    const e = etiquettesDuTableau(CONSTITUE);
    expect(e.get('ig')).toMatchObject({ repere: 'IG', icone: 'general' });
    expect(e.get('id1')).toMatchObject({ repere: 'ID1', icone: 'bouclier', calibre: '30 mA AC' });
    expect(e.get('q1')).toMatchObject({ repere: 'Q1', icone: 'lumiere', calibre: '16 A', piece: 'Séjour' });
    expect(e.get('q2')).toMatchObject({ repere: 'Q2', icone: 'prise', piece: 'Chambre' });
    expect(e.get('q3')).toMatchObject({ repere: 'Q3', icone: 'laveLinge' });
  });
});

describe('le tableau déduit du plan, quand rien n’a été constitué', () => {
  const circuit = (id: string, label: string, nature: Circuit['nature'], breaker: number | null, rooms: string[]): Circuit =>
    ({ id, label, nature, points: 3, section: 2.5, breaker, rooms, fixtureIds: [] }) as unknown as Circuit;
  const circuits = [
    circuit('c1', 'Éclairage 1', 'eclairage', 16, ['Séjour', 'Entrée']),
    circuit('c2', 'Prises 1', 'prises', 20, ['Chambre']),
    circuit('c3', 'Cuisson — Cuisine', 'cuisson', 32, ['Cuisine']),
    circuit('c4', 'Courants faibles', 'vdi', null, ['Séjour']),
  ];
  const diffs: Differential[] = [
    { label: 'Différentiel type A 1', type: 'A', rating: 40, circuits: ['Cuisson — Cuisine'] },
    { label: 'Différentiel type AC 1', type: 'AC', rating: 40, circuits: ['Éclairage 1', 'Prises 1'] },
  ];

  it('l’interrupteur général en tête, chaque différentiel suivi de ses départs', () => {
    const t = tableauDepuisLePlan(circuits, diffs);
    expect(t.departs.map((d) => d.organe)).toEqual([
      'interrupteur',
      'differentiel',
      'disjoncteur',
      'differentiel',
      'disjoncteur',
      'disjoncteur',
    ]);
    const cuisson = t.departs[2];
    expect(cuisson).toMatchObject({ calibre: 32, usage: 'Plaque de cuisson', piece: 'Cuisine' });
    expect(t.departs[4]).toMatchObject({ usage: 'Éclairage', piece: 'Séjour, Entrée' });
    // Chaque différentiel ouvre sa rangée ; l'interrupteur général partage
    // la première, au lieu d'en occuper une à lui seul (le coffret unique,
    // voir `tailleDuCoffret`).
    expect(t.departs[0].rangee).toBe(0);
    expect(t.departs[1].rangee).toBe(0);
    expect(t.departs[3].rangee).toBe(1);
    // Chaque départ dit sous quel différentiel il est.
    expect(t.departs[2].sousDifferentiel).toBe(t.departs[1].id);
    expect(t.rangees).toBe(2);
  });
});

describe('le rendu réaliste', () => {
  let t: TestRenderer.ReactTestRenderer;
  beforeAll(() => {
    act(() => {
      t = TestRenderer.create(<TableauRealiste tableau={CONSTITUE} echelle={2} />);
    });
  });
  afterAll(() => act(() => t.unmount()));

  it('une étiquette sous chaque module : son icône Solar, son repère, sa pièce', () => {
    const vu = textes(t);
    for (const m of ['IG', 'ID1', 'Q1', 'Q2', 'Q3', 'Séjour', 'Chambre', '16 A', '30 mA AC']) {
      expect(vu).toContain(m);
    }
    const d = traces(t);
    for (const k of ['general', 'bouclier', 'lumiere', 'prise', 'laveLinge'] as const) {
      expect(d).toContain(SOLAIRES[k]);
    }
  });

  it('le coffret dit ses cotes, comme une fiche de constructeur', () => {
    const vu = textes(t).join(' | ');
    // 13 modules de 17,5 mm + le cadre : 328 mm ; deux rangées : 340 mm.
    expect(vu).toContain('L : 328 mm');
    expect(vu).toContain('H : 340 mm');
  });

  it('chaque organe a son dessin : un module par place du rail', () => {
    const modules = t.root.findAll((n) => n.type === G && String(n.props.testID ?? '').startsWith('module-'));
    expect(modules.map((m) => m.props.testID)).toEqual([
      'module-ig',
      'module-rp',
      'module-id1',
      'module-q1',
      'module-q2',
      'module-q3',
    ]);
  });
});

describe('la fenêtre du tableau fini', () => {
  it('le dessin, puis la légende, ligne par ligne', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<TableauFiniSheet visible tableau={CONSTITUE} projete={false} onClose={() => {}} />);
    });
    const vu = textes(t).join(' | ');
    expect(vu).toContain('Disjoncteur 16 A');
    expect(vu).toContain('Éclairage · Séjour');
    expect(vu).toContain('Prises · Chambre');
    act(() => t.unmount());
  });

  it('projeté d’après le plan, il le dit, et invite à le constituer', () => {
    let t!: TestRenderer.ReactTestRenderer;
    const constituer = jest.fn();
    act(() => {
      t = TestRenderer.create(
        <TableauFiniSheet visible tableau={CONSTITUE} projete onClose={() => {}} onModifier={constituer} />,
      );
    });
    expect(textes(t).join(' | ')).toMatch(/d’après le plan/);
    const bouton = t.root.findAll((n) => n.props?.accessibilityLabel === 'Constituer le tableau' && typeof n.props?.onPress === 'function')[0];
    act(() => bouton.props.onPress());
    expect(constituer).toHaveBeenCalled();
    act(() => t.unmount());
  });
});

describe('la construction, dans la feuille du tableau', () => {
  const monter = (props: Record<string, unknown> = {}) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ExistantSheet
          visible
          existant={CONSTITUE}
          onClose={() => {}}
          onAjouter={() => 'x'}
          onModifier={() => {}}
          onRetirer={() => {}}
          onDecrire={() => {}}
          {...props}
        />,
      );
    });
    act(() => {
      for (const v of t.root.findAllByType(View)) {
        if (typeof v.props.onLayout === 'function') v.props.onLayout({ nativeEvent: { layout: { width: 360, height: 300 } } });
      }
    });
    return t;
  };

  it('propose l’interrupteur général et le répartiteur', () => {
    const t = monter();
    const vu = textes(t).join(' | ');
    expect(vu).toContain('Interrupteur général');
    expect(vu).toContain('Répartiteur');
    act(() => t.unmount());
  });

  it('un départ se rattache à une pièce du plan', () => {
    const modifs: [string, Partial<DepartExistant>][] = [];
    const t = monter({ pieces: ['Séjour', 'Cuisine'], onModifier: (id: string, c: Partial<DepartExistant>) => modifs.push([id, c]) });
    const q2 = t.root.findAll((n) => typeof n.props?.onPress === 'function' && /Disjoncteur 20 A/.test(String(n.props?.accessibilityLabel ?? '')))[0];
    act(() => q2.props.onPress());
    const cuisine = t.root.findAll((n) => n.props?.accessibilityLabel === 'Pièce : Cuisine' && typeof n.props?.onPress === 'function')[0];
    expect(cuisine).toBeDefined();
    act(() => cuisine.props.onPress());
    expect(modifs).toContainEqual(['q2', { piece: 'Cuisine' }]);
    act(() => t.unmount());
  });

  it('« Voir le tableau fini » ouvre son rendu', () => {
    const voir = jest.fn();
    const t = monter({ onVoirFini: voir });
    const b = t.root.findAll((n) => n.props?.accessibilityLabel === 'Voir le tableau fini' && typeof n.props?.onPress === 'function')[0];
    act(() => b.props.onPress());
    expect(voir).toHaveBeenCalled();
    act(() => t.unmount());
  });
});

describe('sur la maquette 3D', () => {
  it('toucher le tableau ouvre son rendu réaliste', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'components', 'Iso3DView.tsx'), 'utf8');
    expect(src).toMatch(/onTapTableau\?: \(\) => void/);
    const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    expect(ecran).toMatch(/onTapTableau=\{/);
    expect(ecran).toContain('<TableauFiniSheet');
    // TouchableOpacity n'est là que pour le type : la 3D se touche par sa cible.
    expect(TouchableOpacity).toBeDefined();
  });
});
