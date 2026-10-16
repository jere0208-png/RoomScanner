/**
 * TOURNÉE N°4 — LES DERNIERS RELEVÉS.
 *
 * - « Hugo » : après plus de quarante gestes, « rien à enregistrer » sur un
 *   plan qui ne l'était pas ; une fusion refusée laissait un « Annuler » qui
 *   ne faisait rien ; deux pièces superposées comptaient leurs m² deux fois,
 *   sans un mot.
 * - « Inès » : son WC de 1,26 m² se faisait conseiller « fusionnez-la ou
 *   retirez-la ».
 * - « Mehdi » : le va-et-vient se décidait au nombre de commandes du
 *   circuit, et l'interrupteur général en ajoutait une partout.
 * - « Bernard » : l'image gratuite, la seule sortie qu'il pouvait prendre,
 *   venait en dernier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useScanStore } from '../src/store/scanStore';
import { checkPlan } from '../src/geometry/diagnostics';
import { planCircuits } from '../src/geometry/nfc15100';
import { estVaEtVient } from '../src/geometry/schema';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';

const st = () => useScanStore.getState();

describe('l’historique', () => {
  it('après plus de quarante gestes, le plan reste « à enregistrer »', () => {
    st().reset();
    useScanStore.setState({ saves: [] });
    st().commencerAuClavier();
    const id = st().addRoomLibre(4, 3, 'Chambre', { auNu: true })!;
    st().commitCurrent();
    // Rouvert depuis la bibliothèque : l'historique repart de zéro.
    st().openSave(st().currentSaveId!);
    expect(st().dirty).toBe(false);
    // Cinquante gestes : l'état enregistré sort de l'historique (quarante).
    for (let i = 0; i < 50; i++) st().setRoomHeight(st().rooms[0].id, i % 2 ? 2.4 : 2.6);
    for (let i = 0; i < 40; i++) st().undo();
    // On n'est PAS revenu à l'état enregistré : il est hors de portée.
    expect(st().dirty).toBe(true);
    void id;
  });

  it('une fusion refusée ne laisse pas d’« Annuler » vide', () => {
    st().reset();
    st().commencerAuClavier();
    const a = st().addRoomLibre(4, 3, 'A', { auNu: true })!;
    const b = st().addRoomLibre(3, 3, 'B', { auNu: true })!;
    expect(st().rooms).toHaveLength(2);
    // Pas mitoyennes (B se pose à côté du plan) : la fusion est refusée.
    st().mergeRooms(a, b);
    expect(st().rooms).toHaveLength(2);
    // Le premier « Annuler » défait bien le dernier VRAI geste.
    st().undo();
    expect(st().rooms).toHaveLength(1);
  });
});

describe('le contrôle du plan', () => {
  it('signale deux pièces l’une sur l’autre', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    const b = st().addRoomLibre(3, 3, 'Chambre', { auNu: true })!;
    const sans = checkPlan(st().walls, st().rooms);
    expect(sans.some((i) => i.kind === 'superposition')).toBe(false);
    // On la glisse sur le séjour.
    const xs = st().walls.filter((w) => (st().rooms[1].wallIds ?? []).includes(w.id)).flatMap((w) => [w.a.x, w.b.x]);
    st().moveRoom(b, -Math.min(...xs) + 1, 0, false);
    const avec = checkPlan(st().walls, st().rooms);
    const s = avec.find((i) => i.kind === 'superposition');
    expect(s?.message).toMatch(/Séjour et Chambre se superposent sur \d+,\d m²/);
  });

  it('un WC nommé n’est pas une erreur ; une pièce sans nom, si', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(1.2, 1, 'WC', { auNu: true });
    expect(checkPlan(st().walls, st().rooms).some((i) => i.kind === 'pieceMinuscule')).toBe(false);
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(1.2, 1, '', { auNu: true });
    expect(checkPlan(st().walls, st().rooms).some((i) => i.kind === 'pieceMinuscule')).toBe(true);
  });
});

describe('le va-et-vient', () => {
  const inter = (id: string, kind: Fixture['kind'] = 'inter'): Fixture =>
    ({ id, kind, wallId: 'w', along: 1, height: 1.1, side: 1 }) as Fixture;
  const dcl = (id: string, commands: string[]): CeilingFixture => ({
    id,
    kind: 'dcl',
    roomId: 'r',
    at: { x: 1, z: 1 },
    commands,
  });
  const circuit = (fixtures: Fixture[], ceiling: CeilingFixture[]) =>
    planCircuits(fixtures, () => 'Séjour', () => false, () => 'r', ceiling).find((c) => c.nature === 'eclairage')!;

  it('deux commandes sur deux points différents : deux simples allumages', () => {
    const fx = [inter('i1'), inter('i2')];
    const c = circuit(fx, [dcl('d1', ['i1']), dcl('d2', ['i2'])]);
    expect(estVaEtVient(c, fx)).toBe(false);
  });

  it('deux commandes sur le même point : un va-et-vient', () => {
    const fx = [inter('i1'), inter('i2')];
    const c = circuit(fx, [dcl('d1', ['i1', 'i2'])]);
    expect(estVaEtVient(c, fx)).toBe(true);
  });

  it('l’interrupteur général ne fait pas d’un point un va-et-vient', () => {
    const fx = [inter('i1'), inter('g', 'interGeneral')];
    const c = circuit(fx, [dcl('d1', ['i1', 'g'])]);
    expect(estVaEtVient(c, fx)).toBe(false);
  });
});

describe('la feuille d’export', () => {
  it('sans Pro, l’image gratuite vient en tête, et dit qu’elle s’imprime', () => {
    const feuille = readFileSync(join(__dirname, '..', 'src', 'screens', 'result', 'ExportSheet.tsx'), 'utf8');
    // Revue « clair-44 » : en mode électricité, le devis passe devant —
    // puis l'image gratuite, avant les sorties Pro.
    expect(feuille).toMatch(/const enOrdre = pro\s*\?\s*sorties\s*:\s*\[\s*\.\.\.sorties\.filter\(\(\[art\]\) => art === 'devis'\),\s*\.\.\.sorties\.filter\(\(\[art\]\) => art === 'image'\)/);
    expect(feuille).toContain('à envoyer ou à imprimer');
  });
});
