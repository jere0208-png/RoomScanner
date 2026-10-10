/**
 * DEUX CHOSES QU'UN ÉLECTRICIEN FAISAIT À LA MAIN — la pose au devis, et la
 * chute de tension des circuits.
 *
 * Proposées comme améliorations « productives » (le patron : « améliore
 * considérablement l'app avec des idées que tu trouveras intéressantes et
 * productives ») :
 *
 *   — LA POSE, ESTIMÉE : le devis chiffrait le matériel et disait « la pose
 *     n'est pas comprise ». Il l'estime maintenant, point par point, au taux
 *     de l'artisan, avec la TVA de son chantier (10 % en rénovation, 20 % dans
 *     le neuf) ;
 *   — LA CHUTE DE TENSION : l'application connaît la section, le calibre et
 *     le cheminement de chaque circuit ; elle dit celui qui est trop long pour
 *     sa section (3 % en éclairage, 5 % ailleurs).
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
  COEF_NEUF,
  TABLEAU_BASE,
  TABLEAU_PAR_PROTECTION,
  TEMPS_MUR,
  enHeures,
  estimerLaPose,
  protectionsDuDevis,
} from '../src/geometry/mainDOeuvre';
import { PoseEstimee } from '../src/components/PoseEstimee';
import {
  chuteDuCircuit,
  constatDeChute,
  constatsDeChute,
  courantDEmploi,
  pourcentDeChute,
} from '../src/geometry/chute';
import { planRoutes } from '../src/geometry/elecplan';
import { fixturePlacement, roomInputsOf } from '../src/geometry/nfc15100';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';

const f = (id: string, kind: Fixture['kind']): Fixture => ({ id, kind, wallId: 'w', along: 1, height: 0.3, side: 1 });

describe('la pose, estimée', () => {
  const fixtures = [f('p1', 'prise'), f('p2', 'prise'), f('i', 'inter'), f('t', 'tableau')];
  const ceiling = [{ id: 'd', kind: 'dcl' as const, roomId: 'r', at: { x: 0, z: 0 } }];

  it('compte chaque point à son temps, et le tableau à ses protections', () => {
    const p = estimerLaPose(fixtures, ceiling, 6, { taux: 50, chantier: 'renovation' });
    const prises = p.lignes.find((l) => l.famille === 'Prises')!;
    expect(prises.quantite).toBe(2);
    expect(prises.heures).toBeCloseTo(2 * TEMPS_MUR.prise, 6);
    const tableau = p.lignes.find((l) => l.famille === 'Tableau')!;
    expect(tableau.heures).toBeCloseTo(TABLEAU_BASE + 6 * TABLEAU_PAR_PROTECTION, 1);
    expect(p.lignes.some((l) => l.famille === 'Plafond')).toBe(true);
    // Le prix suit : heures × taux, puis la TVA de la rénovation.
    expect(p.ht).toBeCloseTo(p.heures * 50, 2);
    expect(p.tauxTva).toBe(0.1);
    expect(p.ttc).toBeCloseTo(p.ht * 1.1, 2);
  });

  it('le neuf va plus vite, et paie la TVA pleine', () => {
    const reno = estimerLaPose(fixtures, ceiling, 6, { taux: 50, chantier: 'renovation' });
    const neuf = estimerLaPose(fixtures, ceiling, 6, { taux: 50, chantier: 'neuf' });
    const points = (p: typeof reno) => p.lignes.filter((l) => l.famille !== 'Tableau').reduce((t, l) => t + l.heures, 0);
    expect(points(neuf)).toBeCloseTo(points(reno) * COEF_NEUF, 0);
    expect(neuf.tauxTva).toBe(0.2);
  });

  it('les protections se comptent dans le devis, écartées exclues', () => {
    expect(
      protectionsDuDevis([
        { code: 'disj-16', quantite: 4 },
        { code: 'disj-10', quantite: 2 },
        { code: 'diff-A', quantite: 1 },
        { code: 'icta-20', quantite: 100 },
        { code: 'disj-32', quantite: 1, ecarte: true },
      ]),
    ).toBe(7);
  });

  it('dit les heures comme sur un chantier', () => {
    expect(enHeures(23.5)).toBe('23 h 30');
    expect(enHeures(0.75)).toBe('45 min');
  });

  it('s’affiche sous le matériel, et se règle d’un appui', () => {
    const vus: number[] = [];
    const chantiers: string[] = [];
    let t!: TestRenderer.ReactTestRenderer;
    const pose = estimerLaPose(fixtures, ceiling, 6, { taux: 45, chantier: 'renovation' });
    act(() => {
      t = TestRenderer.create(
        <PoseEstimee
          pose={pose}
          materiel={1000}
          chantier="renovation"
          onChantier={(c) => chantiers.push(c)}
          onTaux={(x) => vus.push(x)}
        />,
      );
    });
    const textes = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(textes).toContain('La pose, estimée');
    expect(textes).toContain('45 € HT/h');
    expect(textes).toContain('MATÉRIEL + POSE');
    const bouton = (nom: string) => t.root.findAll((n) => n.props?.accessibilityLabel === nom && typeof n.props?.onPress === 'function')[0];
    act(() => bouton('Monter le taux horaire').props.onPress());
    act(() => bouton('Chantier neuf, TVA 20 %').props.onPress());
    expect(vus).toEqual([50]);
    expect(chantiers).toEqual(['neuf']);
    act(() => t.unmount());
  });
});

describe('la chute de tension', () => {
  it('la formule de l’UTE C 15-105, en monophasé', () => {
    // 2 × 0,0225 × 30 m × 16 A / 2,5 mm² / 230 V = 3,76 %
    expect(pourcentDeChute(30, 16, 2.5)).toBeCloseTo(3.757, 2);
  });

  it('l’éclairage se compte à cent voltampères par point, borné au calibre', () => {
    expect(courantDEmploi('eclairage', 10, 6)).toBeCloseTo(600 / 230, 6);
    expect(courantDEmploi('eclairage', 10, 40)).toBe(10);
    expect(courantDEmploi('prises', 20, 8)).toBe(20);
  });

  it('se tait sous la limite, parle au-delà, et propose la section suivante', () => {
    const court = chuteDuCircuit({ id: 'c', label: 'Prises séjour', nature: 'prises', section: 2.5, breaker: 20, points: 6 }, 20)!;
    expect(constatDeChute(court)).toBeNull();
    const long = chuteDuCircuit({ id: 'c', label: 'Prises séjour', nature: 'prises', section: 2.5, breaker: 20, points: 6 }, 45)!;
    expect(long.pourcent).toBeGreaterThan(5);
    const c = constatDeChute(long)!;
    expect(c.message).toMatch(/Prises séjour : 45 m de câble en 2,5 mm²/);
    expect(c.message).toMatch(/limite 5,0 %/);
    expect(c.regle).toMatch(/4 mm²/);
    // Une information, jamais une alerte : le cheminement est tracé, pas mesuré.
    expect(constatsDeChute([long])[0].severity).toBe('info');
  });

  it('les courants faibles n’ont pas de chute à dire', () => {
    expect(chuteDuCircuit({ id: 'v', label: 'VDI', nature: 'vdi', section: null, breaker: null, points: 2 }, 50)).toBeNull();
  });

  it('le plan la calcule pour chaque circuit, au point le plus éloigné', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1',
    });
    const walls = [mur('n', 0, 0, 12, 0), mur('e', 12, 0, 12, 8), mur('s', 12, 8, 0, 8), mur('w', 0, 8, 0, 0)];
    const rooms = [{ id: 'r1', name: 'Séjour', wallIds: walls.map((w) => w.id) }];
    const fixtures: Fixture[] = [
      { id: 'tab', kind: 'tableau', wallId: 'w', along: 1, height: 1.4, side: 1 },
      { id: 'p1', kind: 'prise', wallId: 'e', along: 6, height: 0.3, side: 1 },
      { id: 'p2', kind: 'prise', wallId: 's', along: 3, height: 0.3, side: 1 },
    ];
    const parts = roomParts(walls, rooms as never);
    const entrees = roomInputsOf(rooms as never, parts);
    const plan = planRoutes(walls, rooms, parts, fixtures, fixturePlacement(fixtures, walls, entrees))!;
    expect(plan).not.toBeNull();
    expect(plan.chutes.length).toBeGreaterThan(0);
    for (const ch of plan.chutes) {
      expect(ch.longueur).toBeGreaterThan(5);
      expect(ch.pourcent).toBeCloseTo(pourcentDeChute(ch.longueur, ch.courant, ch.section), 6);
    }
  });
});
