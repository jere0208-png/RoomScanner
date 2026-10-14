/**
 * CE QUE ROOMPLAN SAIT, LIVRÉ — revue d'un expert de la session RoomPlan :
 * les sols d'un relevé à plusieurs passages se perdaient, et le mur qui porte
 * une porte se devinait au plus proche alors que RoomPlan le dit (iOS 17).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { murDeLOuverture, toSegment, type WallSeg } from '../src/geometry/floorplan';

const swift = readFileSync(join(__dirname, '..', 'modules/react-native-room-scan/ios/RoomScanManager.swift'), 'utf8');
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg =>
  ({ id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25 }) as WallSeg;

describe('le natif livre', () => {
  it('les sols de la structure fusionnée, à chaque livraison à plusieurs passages', () => {
    expect(swift.match(/sols: Self\.solsJSON\(structure\.floors\)/g)).toHaveLength(2);
  });
  it('le mur porteur, les bords vus et l’étage de chaque surface (iOS 17)', () => {
    expect(swift).toContain('out["parentId"] = parent.uuidString');
    expect(swift).toContain('out["completedEdges"]');
    expect(swift).toContain('out["story"] = s.story');
  });
});

describe('le mur qui porte une porte', () => {
  it('celui que RoomPlan désigne, même si un autre est plus près', () => {
    const porte = toSegment({ id: 'p', type: 'door', length: 0.8, height: 2.04, parentId: 'refend', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1.02, 0.08, 1] } as never);
    const murs = [mur('facade', 0, 0.05, 4, 0.05), mur('refend', 0, 0.2, 4, 0.2)];
    expect(murDeLOuverture(porte, murs)?.id).toBe('refend');
  });
  it('sans désignation, ou désigné trop loin : le plus proche, comme avant', () => {
    const porte = toSegment({ id: 'p', type: 'door', length: 0.8, height: 2.04, parentId: 'loin', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1.02, 0.08, 1] } as never);
    const murs = [mur('facade', 0, 0.05, 4, 0.05), mur('loin', 0, 2, 4, 2)];
    expect(murDeLOuverture(porte, murs)?.id).toBe('facade');
  });
});
