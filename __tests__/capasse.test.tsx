/**
 * « ÇA PASSE ? » — le meuble passe-t-il les portes jusqu'à sa pièce, et
 * laisse-t-il les portes s'ouvrir ?
 *
 * Relevé du patron, point 6 de la réflexion « grand public » : « vérifier
 * qu'un canapé passe par les portes jusqu'à sa pièce, dessiner l'ouverture
 * des portes en 2D et prévenir si un meuble la bloque ».
 *
 * Le plan dessinait déjà le battant de chaque porte. Ce banc tient le
 * reste : le battant en coordonnées du plan, le meuble qui le heurte, et le
 * chemin des portes depuis l'entrée.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { appartementExemple } from '../src/data/exemple';
import { battantsDesPortes, meublesQuiBloquent, passageDuMeuble } from '../src/geometry/passage';
import type { WallSeg } from '../src/geometry/floorplan';
import { ObjectBar } from '../src/components/ObjectBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
/** Une pièce de 4 × 3 m, sa porte de 83 cm dans le mur ouest. */
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
const PORTE: WallSeg = { ...mur('p', 0, 1, 0, 1.83), type: 'door', height: 2.04, yCenter: 1.02 };
const PIECES = [{ id: 'r1', name: 'Chambre', wallIds: MURS.map((w) => w.id) }];

/** Un meuble posé en (x, z), sans rotation. */
const meuble = (id: string, category: string, x: number, z: number, w: number, d: number, h: number, roomId?: string): ObjectData =>
  ({
    id,
    category,
    width: w,
    depth: d,
    height: h,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, h / 2, z, 1],
    ...(roomId ? { roomId } : {}),
  }) as ObjectData;

describe('le battant d’une porte, en coordonnées du plan', () => {
  it('pivote sur un bout, balaie un quart de cercle de sa largeur, côté pièce', () => {
    const [b] = battantsDesPortes([PORTE], MURS, PIECES);
    expect(b.id).toBe('p');
    expect(b.r).toBeCloseTo(0.83, 2);
    // Il s'ouvre DANS la pièce (x > 0), pas dehors.
    expect(b.ouvert.x).toBeCloseTo(0.83, 2);
    expect([PORTE.a.z, PORTE.b.z]).toContain(b.pivot.z);
  });

  it('s’ouvre de l’autre côté quand la porte ouvre vers l’extérieur', () => {
    const [b] = battantsDesPortes([{ ...PORTE, versExterieur: true }], MURS, PIECES);
    expect(b.ouvert.x).toBeCloseTo(-0.83, 2);
  });
});

describe('un meuble qui bloque une porte', () => {
  const battants = battantsDesPortes([PORTE], MURS, PIECES);

  it('une commode dans le battant le bloque ; plus loin, non', () => {
    const dedans = meuble('c1', 'storage', 0.45, 1.4, 0.6, 0.4, 0.9);
    const loin = meuble('c2', 'storage', 3, 1.4, 0.6, 0.4, 0.9);
    const bloques = meublesQuiBloquent(battants, [dedans, loin]);
    expect(bloques.get('p')).toEqual(['c1']);
  });

  it('un tapis, au ras du sol, ne bloque rien ; une étagère au-dessus de la porte non plus', () => {
    const tapis = meuble('t', 'tapis', 0.5, 1.4, 1.2, 0.8, 0.01);
    const haute = { ...meuble('h', 'storage', 0.3, 1.4, 0.6, 0.3, 0.3), transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.3, 2.2, 1.4, 1] } as ObjectData;
    expect(meublesQuiBloquent(battants, [tapis, haute]).size).toBe(0);
  });

  it('l’appartement d’exemple ne s’accuse pas lui-même', () => {
    const ex = appartementExemple();
    const bloques = meublesQuiBloquent(battantsDesPortes(ex.openings, ex.walls, ex.rooms), ex.objects);
    expect([...bloques.entries()]).toEqual([]);
  });
});

describe('le meuble passe-t-il jusqu’à sa pièce ?', () => {
  const ex = appartementExemple();
  const salle = (nom: string) => ex.rooms.find((r) => r.name === nom)!.id;
  const contexte = { walls: ex.walls, openings: ex.openings, rooms: ex.rooms };

  it('le canapé passe jusqu’au séjour : l’entrée, puis le passage', () => {
    const canape = meuble('k', 'sofa', 4, 2, 1.8, 0.88, 0.8, salle('Séjour'));
    const v = passageDuMeuble(canape, contexte)!;
    expect(v.ok).toBe(true);
    expect(v.court).toMatch(/passe/i);
    expect(v.detail).toMatch(/porte d’entrée/);
  });

  it('mais pas dans la chambre : sa porte de 83 cm est trop étroite', () => {
    const canape = meuble('k', 'sofa', 6.5, 1.8, 1.8, 0.88, 0.8, salle('Chambre'));
    const v = passageDuMeuble(canape, contexte)!;
    expect(v.ok).toBe(false);
    expect(v.court).toMatch(/porte de la chambre/i);
    expect(v.detail).toMatch(/77 cm/);
  });

  it('un lit monté ne passe pas l’entrée — le verdict dit qu’il se monte sur place', () => {
    const lit = meuble('l', 'bed', 6.5, 1.8, 1.46, 1.99, 0.95, salle('Chambre'));
    const v = passageDuMeuble(lit, contexte)!;
    // Revue « Chloé » : en kit, il PASSE — la pastille le dit d'abord.
    expect(v.ok).toBe(true);
    expect(v.court).toBe('Passe en kit');
    expect(v.detail).toMatch(/sur place/);
  });

  it('un meuble hors de toute pièce, ou une pièce sans porte : pas de verdict', () => {
    expect(passageDuMeuble(meuble('x', 'sofa', 50, 50, 1, 1, 1), contexte)).toBeNull();
    expect(passageDuMeuble(meuble('x', 'sofa', 2, 1.5, 1, 1, 1, 'r1'), { walls: MURS, openings: [], rooms: PIECES })).toBeNull();
  });
});

describe('à l’écran', () => {
  const STYLES = getStyles(light) as unknown as Record<string, object>;
  const monter = (props: Partial<React.ComponentProps<typeof ObjectBar>>) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ObjectBar
          object={meuble('k', 'sofa', 1, 1, 1.8, 0.88, 0.8)}
          styles={STYLES}
          palette={light}
          onPrompt={jest.fn()}
          onResize={jest.fn()}
          onRotate={jest.fn()}
          onCancel={jest.fn()}
          {...props}
        />,
      );
    });
    return t;
  };
  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));

  it('la barre du meuble dit s’il passe, et ce qu’il bloque', () => {
    const onPassage = jest.fn();
    const t = monter({
      passage: { ok: false, court: 'Ne passe pas par la porte de la chambre', detail: '…' },
      bloque: 'Bloque la porte de la Chambre',
      onPassage,
    });
    expect(textes(t)).toContain('Ne passe pas par la porte de la chambre');
    expect(textes(t)).toContain('Bloque la porte de la Chambre');
    const puce = t.root.findAll((n) => n.props.accessibilityLabel === 'Ça passe ?' && typeof n.props.onPress === 'function', { deep: false })[0];
    act(() => puce.props.onPress());
    expect(onPassage).toHaveBeenCalled();
    act(() => t.unmount());
  });

  it('le plan rougit le battant d’une porte bloquée ; l’écran le relaie au contrôle', () => {
    const plan = lire('src/components/FloorplanEditor.tsx');
    expect(plan).toContain('const bloquee = !!portesBloquees?.has(o.id);');
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('portesBloquees={showFurniture && !capturing ? portesBloquees : undefined}');
    expect(ecran).toContain('meublesQuiBloquent(battants, objects)');
    expect(ecran).toContain("code: 'porte',");
  });
});
