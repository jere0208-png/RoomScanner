/**
 * LES PETITS COUACS DU MODE ÉLECTRICITÉ — relevés des testeurs
 * « renovation » et « electricien ».
 *
 * - « Passer » au premier lancement allumait ensuite le mode Électricité ;
 * - les socles des plaques RJ45 + prise se rangeaient sous le coffret de
 *   communication sur l'unifilaire ;
 * - le devis disait « à revoir » quand le plan disait « conforme » ;
 * - « rien d'obligatoire », trop affirmatif ;
 * - « Tableau électrique posée à… » ;
 * - « l’couronne », « l’barre » dans le Magasin ;
 * - la carte « Plan PDF » muette sur l'unifilaire en mode Électricité ;
 * - le lave-linge de l'exemple sans sigle ;
 * - le bandeau « 27 élec. » sans les points du plafond.
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
import { PremierLancement } from '../src/components/PremierLancement';
import { DiagnosticSheet, type Constat } from '../src/components/DiagnosticSheet';
import { MagasinScreen } from '../src/screens/MagasinScreen';
import { ExportSheet } from '../src/screens/result/ExportSheet';
import { useUsage } from '../src/store/usage';
import { useScanStore } from '../src/store/scanStore';
import { GAMMES } from '../src/geometry/prix';
import { fixtureMarks } from '../src/geometry/schema';
import { appartementExemple } from '../src/data/exemple';
import { roomParts } from '../src/geometry/floorplan';
import {
  checkElectrical,
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
  type Circuit,
} from '../src/geometry/nfc15100';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children ?? []).filter((x) => typeof x === 'string' || typeof x === 'number').join(''))
    .filter((s) => s.length > 0);

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

describe('« Passer » au premier lancement est une réponse', () => {
  it('le grand public reste, même devant une bibliothèque équipée', () => {
    useUsage.setState({ charge: true, modeElec: false, choisi: false });
    const fini = jest.fn();
    act(() => {
      arbre = TestRenderer.create(<PremierLancement onFini={fini} />);
    });
    const passer = arbre!.root.findAll(
      (n) => n.props.accessibilityLabel === 'Passer la question' && typeof n.props.onPress === 'function',
    )[0];
    act(() => passer.props.onPress());
    expect(fini).toHaveBeenCalledTimes(1);
    expect(useUsage.getState()).toMatchObject({ modeElec: false, choisi: true });
    // Au lancement suivant, le plan d'exemple enregistré porte des prises :
    // la déduction ne doit plus allumer le mode dans le dos de l'utilisateur.
    useUsage.getState().deduireDuPasse([{ fixtures: [{}], ceiling: [{}] }]);
    expect(useUsage.getState().modeElec).toBe(false);
  });
});

describe('l’unifilaire range la plaque RJ45 + prise sous son circuit de prises', () => {
  const circuit = (id: string, nature: Circuit['nature'], fixtureIds: string[]): Circuit => ({
    id,
    label: id,
    nature,
    points: fixtureIds.length,
    section: nature === 'vdi' ? null : 2.5,
    breaker: nature === 'vdi' ? null : 20,
    rooms: [],
    fixtureIds,
  });

  it('le coffret de communication ne reprend pas le repère du disjoncteur', () => {
    const marks = fixtureMarks([
      circuit('prises', 'prises', ['plaque', 'prise']),
      circuit('vdi', 'vdi', ['plaque', 'rj-seul']),
    ]);
    expect(marks.get('plaque')).toBe('C1');
    expect(marks.get('prise')).toBe('C1');
    // Un RJ45 seul n'appartient qu'au coffret : il en porte le repère.
    expect(marks.get('rj-seul')).toBe('C2');
  });

  it('sur l’exemple : la plaque de la chambre reste sur un départ de prises', () => {
    const ex = appartementExemple();
    const inputs = roomInputsOf(ex.rooms, roomParts(ex.walls, ex.rooms));
    const placement = fixturePlacement(ex.fixtures, ex.walls, inputs);
    const { circuits } = materialList(inputs, ex.fixtures, wallToRooms(inputs), placement, undefined, ex.ceiling);
    const vdi = circuits.findIndex((c) => c.nature === 'vdi');
    expect(vdi).toBeGreaterThanOrEqual(0);
    expect(circuits[vdi].fixtureIds).toContain('exemple-rj-chambre');
    const repere = fixtureMarks(circuits).get('exemple-rj-chambre');
    const sien = circuits.find((c, i) => `C${i + 1}` === repere)!;
    expect(sien.nature).toBe('prises');
  });

  it('le lave-linge de l’exemple est nommé : son départ aussi', () => {
    const ex = appartementExemple();
    expect(ex.fixtures.find((f) => f.id === 'exemple-prise-lave-linge')?.usage).toBe('LL');
    const inputs = roomInputsOf(ex.rooms, roomParts(ex.walls, ex.rooms));
    const placement = fixturePlacement(ex.fixtures, ex.walls, inputs);
    const { circuits } = materialList(inputs, ex.fixtures, wallToRooms(inputs), placement, undefined, ex.ceiling);
    const sien = circuits.find((c) => c.fixtureIds.includes('exemple-prise-lave-linge'))!;
    expect(sien.label).toMatch(/^Lave-linge — /);
  });
});

describe('le devis compte les réserves comme le plan', () => {
  it('seules les alertes font « à revoir »', () => {
    const src = lire('src/screens/DevisScreen.tsx');
    expect(src).toContain(").filter((i) => i.severity === 'alerte').length;\n  }, [walls, rooms, fixtures, ceiling, openings]);");
  });
});

describe('le contrôle ne promet pas ce qu’il ne sait pas', () => {
  it('des remarques seules : « à vérifier sur place », plus « rien d’obligatoire »', () => {
    const info: Constat = { key: 'i1', message: 'À regarder', hint: 'Une remarque.', severity: 'info', roomId: 'r1' };
    act(() => {
      arbre = TestRenderer.create(
        <DiagnosticSheet
          visible
          issues={[info, { ...info, key: 'i2' }]}
          rooms={[{ id: 'r1', name: 'Séjour' }]}
          onClose={jest.fn()}
          onGoToIssue={jest.fn()}
          onFix={jest.fn()}
        />,
      );
    });
    const vu = textes(arbre!).join(' | ');
    expect(vu).toContain('2 points à vérifier sur place.');
    expect(vu).not.toMatch(/obligatoire/);
  });

  it('la hauteur d’un tableau se dit sans faute d’accord', () => {
    const ex = appartementExemple();
    const fixtures = ex.fixtures.map((f) => (f.id === 'exemple-tableau' ? { ...f, height: 1.95 } : f));
    const inputs = roomInputsOf(ex.rooms, roomParts(ex.walls, ex.rooms));
    const placement = fixturePlacement(fixtures, ex.walls, inputs);
    const issues = checkElectrical(inputs, fixtures, wallToRooms(inputs), placement, undefined, undefined, ex.ceiling);
    const haut = issues.find((i) => i.code === 'hauteur' && i.fixtureId === 'exemple-tableau');
    expect(haut?.message).toBe('Tableau électrique à 195 cm du sol : trop haut');
    expect(issues.some((i) => /posée? à/.test(i.message))).toBe(false);
  });
});

describe('le Magasin parle français', () => {
  it('l’unité sans élision fautive, des boutons qui se lisent', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ screen: 'magasin', gammeDevis: GAMMES[0].id, devisAjouts: [] });
      arbre = TestRenderer.create(<MagasinScreen />);
    });
    const vu = textes(arbre!);
    expect(vu.filter((m) => /^l’/.test(m))).toEqual([]);
    expect(vu).toContain('/ couronne');
    expect(vu).toContain('/ unité');
    const noms = arbre!.root
      .findAll((n) => typeof n.props?.onPress === 'function' && typeof n.props?.accessibilityLabel === 'string')
      .map((n) => String(n.props.accessibilityLabel));
    expect(noms.some((n) => n.startsWith('Ajouter : '))).toBe(true);
    expect(noms.some((n) => n.startsWith('Retirer : '))).toBe(true);
    expect(noms.some((n) => /^(Ajouter|Retirer) un /.test(n))).toBe(false);
  });
});

describe('la carte « Plan PDF » dit ce que le dossier porte', () => {
  const monter = (modeElec: boolean) => {
    act(() => {
      arbre = TestRenderer.create(
        <ExportSheet
          visible
          modeElec={modeElec}
          onClose={() => {}}
          onDismiss={() => {}}
          onPdf={() => {}}
          onObj={() => {}}
          onMaterial={() => {}}
          onCsv={() => {}}
          onDxf={() => {}}
          onImage={() => {}}
          onDevis={() => {}}
        />,
      );
    });
    return textes(arbre!);
  };

  it('en mode Électricité, l’unifilaire est nommé', () => {
    expect(monter(true)).toContain('Coté, métré, schéma unifilaire, murs de face.');
  });

  it('pour le particulier, la carte ne change pas', () => {
    const vu = monter(false);
    expect(vu).toContain('Coté, métré, vues 3D.');
    expect(vu.join(' ')).not.toMatch(/unifilaire/);
  });
});

describe('le bandeau compte aussi le plafond', () => {
  it('les points du plafond entrent dans « élec. »', () => {
    const src = lire('src/screens/ResultScreen.tsx');
    expect(src).toContain("value: `${fixtures.length + ceiling.length}`, label: 'élec.'");
  });
});
