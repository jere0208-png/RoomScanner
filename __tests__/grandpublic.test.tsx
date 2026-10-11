/**
 * LE PLAN DU PARTICULIER — les cinq premiers points de la réflexion.
 *
 * Relevé du patron, après l'analyse du système de plans vu par un
 * utilisateur lambda : « fais les points 1 à 5 ».
 *
 *   1. le particulier ne voit plus l'établi de l'électricien — et retrouve
 *      ce qui lui servait (la photo d'un mur, le contrôle du plan) ;
 *   2. la surface habitable du logement, partout où l'on lit des surfaces ;
 *   3. « Ce qu'il faut acheter » dans le dossier, sur des hypothèses qu'on
 *      règle, avec un prix estimé si on le veut ;
 *   4. le plan s'enregistre tout seul ;
 *   5. une seule surface de murs, la même à l'écran, au PDF et au tableur.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/net/coffrePlans', () => ({
  ...jest.requireActual('../src/net/coffrePlans'),
  deposerPlan: jest.fn(async () => true),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ObjectData } from 'react-native-room-scan';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { ficheDeLaPiece, plafondDeLaPiece } from '../src/geometry/fichePiece';
import {
  HYPOTHESES,
  PRIX_INDICATIFS,
  achats,
  coutDesAchats,
  mursNetsDe,
  travauxDesPieces,
} from '../src/geometry/travaux';
import { surfacesHabitables } from '../src/geometry/habitable';
import { buildMetreCsv } from '../src/export/csv';
import { buildScanPdf, sommaireDuDossier } from '../src/export/pdf';
import { FichePieceSheet } from '../src/screens/result/FichePieceSheet';
import { TravauxSheet } from '../src/components/TravauxSheet';
import { useUsage } from '../src/store/usage';
import { useReglagesTravaux } from '../src/store/reglagesTravaux';
import { useScanStore } from '../src/store/scanStore';
import { useAstuce } from '../src/ui/astuce';
import { rangerLeTravail } from '../src/ui/miseDeCote';
import { NOM_EXEMPLE } from '../src/data/exemple';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number, h = 2.5): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: h,
  yCenter: h / 2,
  roomId: 'r1',
});
/** Un séjour de 4 × 3 m, une porte de 90 et une fenêtre de 120. */
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
const BAIES: WallSeg[] = [
  { ...mur('f1', 1, 0, 2.2, 0), type: 'window', height: 1.2, yCenter: 1.55 },
  { ...mur('p1', 0, 1, 0, 1.9), type: 'door', height: 2.04, yCenter: 1.02 },
];
const PIECES = [{ id: 'r1', name: 'Séjour', wallIds: MURS.map((w) => w.id) }];
const PARTS = roomParts(MURS, PIECES);

const four = (x: number, z: number): ObjectData =>
  ({
    id: 'o1',
    category: 'oven',
    width: 0.6,
    depth: 0.6,
    height: 0.9,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.45, z, 1],
  }) as ObjectData;

const textesDe = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children ?? []).join(''))
    .join(' | ');

beforeEach(() => {
  act(() => useUsage.setState({ modeElec: false }));
});

// ------------------------------------------------------------------ 1
describe('1 — le particulier ne voit pas l’établi de l’électricien', () => {
  const fiche = () =>
    ficheDeLaPiece({
      contour: PARTS[0].surface!.pts,
      surface: 12,
      surfaceExacte: true,
      centre: { x: 2, z: 1.5 },
      murs: MURS,
      tousLesMurs: MURS,
      ouvertures: BAIES,
      objets: [four(3, 0.35)],
      fixtures: [],
      north: null,
    });

  it('la fiche d’une pièce ne propose les circuits qu’en mode électricité', () => {
    expect(fiche().circuits.length).toBeGreaterThan(0);
    const monter = () => {
      let t!: TestRenderer.ReactTestRenderer;
      act(() => {
        t = TestRenderer.create(<FichePieceSheet visible nom="Séjour" fiche={fiche()} onClose={() => {}} onPoser={() => {}} />);
      });
      return t;
    };
    const lambda = monter();
    expect(lambda.root.findAll((n) => n.props.testID === 'circuits-a-prevoir')).toHaveLength(0);
    expect(textesDe(lambda)).not.toMatch(/Circuits à prévoir/);
    act(() => lambda.unmount());
    act(() => useUsage.setState({ modeElec: true }));
    const elec = monter();
    expect(elec.root.findAll((n) => n.props.testID === 'circuits-a-prevoir').length).toBeGreaterThan(0);
    act(() => elec.unmount());
  });

  it('le bandeau ne compte les appareils qu’en mode électricité', () => {
    const src = lire('src/screens/ResultScreen.tsx');
    expect(src).toContain("...(modeElec && fixtures.length > 0\n      ? [{ value: `${fixtures.length}`, label: 'élec.' }]");
  });

  it('un mur se photographie d’un appui, sans passer par l’établi', () => {
    const src = lire('src/screens/ResultScreen.tsx');
    expect(src).toContain('const photographierLeMur = async (wallId: string) => {');
    expect(src).toContain("label: 'Photo',");
    expect(src).toContain('onPress: () => photographierLeMur(selectedWall.id),');
    // Le calque vide renvoie au bon geste.
    expect(lire('src/screens/result/ResultToolbar.tsx')).toContain(
      "photos: 'Aucune photo — en édition, touchez un mur puis « Photo ».',",
    );
  });

  it('le contrôle du plan s’ouvre aussi pour le particulier, dès qu’un relevé cloche', () => {
    const src = lire('src/screens/ResultScreen.tsx');
    expect(src).toContain('{!modeElec && alertesDePlan > 0 && (');
    expect(src).toContain('<ControlePastille releve alertes={alertesDePlan}');
  });

  it('le dossier PDF parle au propriétaire, pas au client', () => {
    const dossier = (particulier: boolean) =>
      latin1(
        buildScanPdf(
          {
            name: 'Mon appartement',
            walls: MURS,
            openings: BAIES,
            objects: [],
            rooms: PIECES,
            roomNames: { r1: 'Séjour' },
            client: 'Camille Martin',
            address: '3 rue des Lilas',
            particulier,
          },
          false,
          {},
        ),
      );
    expect(dossier(true)).toContain('(PROPRIÉTAIRE)');
    expect(dossier(true)).not.toContain('(CLIENT)');
    expect(dossier(false)).toContain('(CLIENT)');
    const ecran = lire('src/screens/ExportScreen.tsx');
    expect(ecran).toContain("['Propriétaire', client, 'Nom du propriétaire'");
    expect(ecran).toContain("['Adresse', address, 'Adresse du logement'");
    expect(ecran).toContain('particulier: !modeElec,');
  });
});

// ------------------------------------------------------------------ 2
describe('2 — la surface habitable du logement', () => {
  const part = (id: string, x0: number, h = 2.5) => {
    const m = [
      { ...mur(`${id}n`, x0, 0, x0 + 4, 0, h), roomId: id },
      { ...mur(`${id}e`, x0 + 4, 0, x0 + 4, 3, h), roomId: id },
      { ...mur(`${id}s`, x0 + 4, 3, x0, 3, h), roomId: id },
      { ...mur(`${id}o`, x0, 3, x0, 0, h), roomId: id },
    ];
    return roomParts(m, [{ id, wallIds: m.map((w) => w.id) }])[0];
  };

  it('compte une pièce entière, retire un garage, et ce qui est sous 1,80 m', () => {
    const plafond = plafondDeLaPiece(
      { sol: -1.3, pas: 0.25, minX: 20, minZ: 0, cols: 16, rows: 12, plafond: Array.from({ length: 192 }, (_, i) => Math.round((1 + 0.4 * (((i % 16) + 0.5) * 0.25)) * 100)) },
      part('r4', 20).surface!.pts,
      12,
    );
    const r = surfacesHabitables(
      [
        { id: 'r1', name: 'Séjour' },
        { id: 'r2', name: 'Garage' },
        { id: 'r3', name: 'Mezzanine' },
        { id: 'r4', name: 'Chambre sous les toits', releve: { plafond } },
      ],
      [part('r1', 0), part('r2', 5), part('r3', 10, 1.6), part('r4', 20)],
    );
    const de = (id: string) => r.pieces.find((p) => p.roomId === id)!;
    expect(de('r1').habitable).toBeCloseTo(de('r1').sol, 1);
    expect(de('r2').habitable).toBe(0);
    expect(de('r2').raison).toMatch(/garage/i);
    expect(de('r3').habitable).toBe(0);
    expect(de('r3').raison).toMatch(/1,80/);
    expect(plafond?.rampant).toBe(true);
    expect(de('r4').habitable).toBeLessThan(de('r4').sol);
    expect(de('r4').habitable).toBeGreaterThan(0);
    expect(r.total).toBeCloseTo(de('r1').habitable + de('r4').habitable, 1);
    expect(r.sol).toBeGreaterThan(r.total);
  });

  it('se lit dans le bandeau, au métré du PDF et au tableur', () => {
    expect(lire('src/screens/ResultScreen.tsx')).toContain("label: 'm² hab.'");
    const pdf = latin1(
      buildScanPdf(
        { name: 'Mon appartement', walls: MURS, openings: BAIES, objects: [], rooms: PIECES, roomNames: { r1: 'Séjour' } },
        false,
        { metre: true },
      ),
    );
    expect(pdf).toMatch(/Surface habitable/);
    const csv = buildMetreCsv(
      'Plan',
      [{ name: 'Séjour', area: 12, habitable: 11.5, perimeter: 14, height: 2.5, walls: 4, mursNets: 31.2 }],
      null,
    )
      .replace(/^﻿/, '')
      .split('\r\n');
    expect(csv).toContain('Pièce;Surface (m²);Surface habitable (m²);Périmètre (m);Hauteur (m);Murs;Surface murale nette (m²)');
    expect(csv).toContain('Séjour;12;11,5;14;2,5;4;31,2');
    expect(csv).toContain('TOTAL;12;11,5;;;;31,2');
  });
});

// ------------------------------------------------------------------ 3
describe('3 — ce qu’il faut acheter, réglé et chiffré', () => {
  const pieces = travauxDesPieces(PARTS, BAIES, () => 'Séjour');

  beforeEach(() => {
    act(() => useReglagesTravaux.getState().reinitialiser());
  });

  it('suit les hypothèses qu’on lui donne', () => {
    const deux = achats(pieces, HYPOTHESES);
    const trois = achats(pieces, { ...HYPOTHESES, couches: 3 });
    expect(trois.murs.litres).toBeCloseTo((deux.murs.litres * 3) / 2, 0);
    expect(achats(pieces, { ...HYPOTHESES, paquet: 1 }).sol.paquets).toBeGreaterThan(deux.sol.paquets);
  });

  it('chiffre les achats à des prix qu’on règle', () => {
    const a = achats(pieces);
    const cout = coutDesAchats(a, PRIX_INDICATIFS);
    expect(cout.murs).toBeCloseTo(a.murs.pots * PRIX_INDICATIFS.potMurs, 2);
    expect(cout.sol).toBeCloseTo(a.sol.paquets * PRIX_INDICATIFS.paquetSol, 2);
    expect(cout.total).toBeCloseTo(cout.murs + cout.plafonds + cout.sol + cout.plinthes, 2);
  });

  it('retient les réglages sur l’appareil', () => {
    const st = useReglagesTravaux.getState();
    expect(st.hypotheses).toEqual(HYPOTHESES);
    expect(st.avecPrix).toBe(false);
    act(() => st.regler({ couches: 3 }));
    expect(useReglagesTravaux.getState().hypotheses.couches).toBe(3);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('echoplan.reglagesTravaux', expect.stringContaining('"couches":3'));
  });

  it('la feuille règle les couches et affiche le prix sur demande', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<TravauxSheet visible onClose={() => {}} pieces={pieces} />);
    });
    const appui = (label: string) => {
      const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
      expect([label, !!b]).toEqual([label, true]);
      act(() => b.props.onPress());
    };
    expect(textesDe(t)).not.toMatch(/€/);
    appui('Régler le calcul');
    appui('Couches : plus');
    expect(useReglagesTravaux.getState().hypotheses.couches).toBe(3);
    appui('Estimer le prix');
    expect(useReglagesTravaux.getState().avecPrix).toBe(true);
    expect(textesDe(t)).toMatch(/Total estimé/);
    expect(textesDe(t)).toMatch(/€/);
    act(() => t.unmount());
  });

  it('part dans le PDF, sur sa feuille, et dans le tableur', () => {
    const a = achats(pieces);
    const opts = { achats: { pieces, hypotheses: HYPOTHESES, prix: PRIX_INDICATIFS } };
    const scan = { name: 'Mon appartement', walls: MURS, openings: BAIES, objects: [], rooms: PIECES, roomNames: { r1: 'Séjour' } };
    expect(sommaireDuDossier(scan, false, opts).map((f) => f.genre)).toContain('achats');
    expect(sommaireDuDossier(scan, false, {}).map((f) => f.genre)).not.toContain('achats');
    const pdf = latin1(buildScanPdf(scan, false, opts));
    expect(pdf).toContain('(Peinture des murs)');
    expect(pdf).toMatch(/Total estimé/);
    const csv = buildMetreCsv('Plan', [], null, { achats: a, cout: coutDesAchats(a, PRIX_INDICATIFS) });
    expect(csv).toMatch(/CE QU.IL FAUT ACHETER/);
    expect(csv).toContain(`Peinture des murs;${a.murs.pots};pots`);
  });
});

// ------------------------------------------------------------------ 4
describe('4 — le plan s’enregistre tout seul', () => {
  const planOuvert = (surcharge: object = {}) => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        saves: [],
        screen: 'result',
        scanName: 'Plan du 11/10/2026',
        walls: MURS,
        rooms: [{ id: 'r1', name: 'Séjour', floor: null } as never],
        dirty: true,
        ...surcharge,
      });
    });
  };

  it('un plan neuf entre dans la bibliothèque pour de bon', () => {
    planOuvert();
    expect(useScanStore.getState().enregistrerAuto()).toBe(true);
    const st = useScanStore.getState();
    expect(st.saves).toHaveLength(1);
    expect(st.saves[0].supprimeLe).toBeUndefined();
    expect(st.dirty).toBe(false);
    expect(st.currentSaveId).toBe(st.saves[0].id);
    // Une retouche ensuite s'écrit dans le MÊME plan.
    act(() => useScanStore.setState({ walls: MURS.slice(0, 3), dirty: true }));
    useScanStore.getState().enregistrerAuto();
    expect(useScanStore.getState().saves).toHaveLength(1);
    expect(useScanStore.getState().saves[0].walls).toHaveLength(3);
  });

  it('ni l’exemple, ni un plan vide, ni un plan inchangé', () => {
    planOuvert({ scanName: NOM_EXEMPLE });
    expect(useScanStore.getState().enregistrerAuto()).toBe(false);
    planOuvert({ walls: [] });
    expect(useScanStore.getState().enregistrerAuto()).toBe(false);
    planOuvert({ dirty: false });
    expect(useScanStore.getState().enregistrerAuto()).toBe(false);
    expect(useScanStore.getState().saves).toHaveLength(0);
  });

  it('en partant : le particulier est enregistré — l’électricien aussi, pour un relevé NEUF', () => {
    planOuvert();
    rangerLeTravail();
    expect(useScanStore.getState().saves[0].supprimeLe).toBeUndefined();
    /*
      Revues « Karim » et « Sophie » : la visite du lundi s'effaçait le
      mardi soir. Le relevé neuf s'enregistre aussi en mode Électricité ;
      seule la RETOUCHE d'un plan client reste de côté.
    */
    act(() => useUsage.setState({ modeElec: true }));
    planOuvert();
    rangerLeTravail();
    expect(useScanStore.getState().saves[0].supprimeLe).toBeUndefined();
    act(() => useAstuce.setState({ courante: null, file: [] }));
  });

  it('l’écran enregistre en cours de route, une seconde et demie après la dernière retouche', () => {
    const src = lire('src/screens/ResultScreen.tsx');
    expect(src).toContain('useScanStore.getState().enregistrerAuto()');
    expect(src).toContain('const ENREGISTREMENT_AUTO_MS = 1500;');
  });
});

// ------------------------------------------------------------------ 5
describe('5 — une seule surface de murs', () => {
  it('l’écran, la fiche, le PDF et le tableur disent le même chiffre', () => {
    const [p] = travauxDesPieces(PARTS, BAIES, () => 'Séjour');
    const attendu = mursNetsDe(PARTS[0].surface!.pts, 2.5, BAIES);
    expect(p.murs).toBeCloseTo(attendu, 1);
    const fiche = ficheDeLaPiece({
      contour: PARTS[0].surface!.pts,
      surface: PARTS[0].surface!.area,
      surfaceExacte: true,
      centre: { x: 2, z: 1.5 },
      murs: MURS,
      tousLesMurs: MURS,
      ouvertures: BAIES,
      objets: [],
      fixtures: [],
      north: null,
    });
    expect(fiche.mursNets).toBeCloseTo(p.murs, 1);
    const pdf = latin1(
      buildScanPdf(
        { name: 'Mon appartement', walls: MURS, openings: BAIES, objects: [], rooms: PIECES, roomNames: { r1: 'Séjour' } },
        false,
        { metre: true },
      ),
    );
    expect(pdf).toContain(`(${attendu.toFixed(1).replace('.', ',')})`);
    // L'écran passe au tableur le chiffre de « Travaux ».
    expect(lire('src/screens/ResultScreen.tsx')).toContain('mursNets: travaux?.murs ?? null,');
  });
});
