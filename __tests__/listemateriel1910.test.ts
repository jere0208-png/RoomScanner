/**
 * LA LISTE DU MATÉRIEL DIT CE QUE L'ÉCRAN DIT — défauts trouvés par l'agent
 * « électricien en chantier » (chasse aux défauts du 19/10) :
 *   — le PDF disait « aucun écart » quand l'écran signalait une chambre sans
 *     point lumineux et un logement sans détecteur de fumée ;
 *   — la ligne du tableau commandait un différentiel de 40 A pour un
 *     logement de 30 m², qui en a un de 25 A ;
 *   — le balcon comptait dans la surface qui fixe le nombre de différentiels.
 */
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
import { materialList, type RoomInput } from '../src/geometry/nfc15100';

const app = (id: string, kind: Fixture['kind'], wallId: string, along: number): Fixture => ({
  id, kind, wallId, along, height: kind === 'inter' ? 1.1 : 0.3, side: 1,
});
const piece = (id: string, name: string, area: number, wallIds: string[]): RoomInput => ({ id, name, area, wallIds });

describe('la liste du matériel', () => {
  it('reprend les contrôles du plafond : chambre sans point lumineux, logement sans DAAF', () => {
    const rooms = [piece('s', 'Séjour', 20, ['s1']), piece('c', 'Chambre', 10, ['c1'])];
    const fixtures = [app('p1', 'prise', 's1', 1), app('i1', 'inter', 's1', 2), app('p2', 'prise', 'c1', 1)];
    const ceiling: CeilingFixture[] = [{ id: 'dcl', kind: 'dcl', roomId: 's', at: { x: 1, z: 1 }, commands: ['i1'] }];
    const roomOfWall = new Map([['s1', ['s']], ['c1', ['c']]]);
    const messages = materialList(rooms, fixtures, roomOfWall, undefined, undefined, ceiling).issues.map((x) => x.message);
    expect(messages).toContain('Chambre : aucun point lumineux');
    expect(messages).toContain('Aucun détecteur de fumée dans le logement');
  });

  it('un DAAF posé à un autre niveau compte : le logement entier le dit', () => {
    const rooms = [piece('s', 'Séjour', 20, ['s1'])];
    const fixtures = [app('p1', 'prise', 's1', 1), app('i1', 'inter', 's1', 2)];
    const ceiling: CeilingFixture[] = [{ id: 'dcl', kind: 'dcl', roomId: 's', at: { x: 1, z: 1 }, commands: ['i1'] }];
    const liste = materialList(rooms, fixtures, new Map([['s1', ['s']]]), undefined, undefined, ceiling, {
      logement: { daaf: true } as never,
    });
    expect(liste.issues.map((x) => x.message)).not.toContain('Aucun détecteur de fumée dans le logement');
  });

  it('commande le différentiel au calibre calculé : 25 A sous 35 m²', () => {
    const rooms = [piece('s', 'Séjour', 30, ['s1'])];
    const fixtures = [app('p1', 'prise', 's1', 1), app('i1', 'inter', 's1', 2)];
    const liste = materialList(rooms, fixtures, new Map([['s1', ['s']]]));
    expect(liste.differentials.every((d) => d.type !== 'AC' || d.rating === 25)).toBe(true);
    const lignes = liste.board.map((r) => r.label).filter((l) => l.startsWith('Interrupteur différentiel'));
    expect(lignes.some((l) => l.includes('25 A') && l.includes('type AC'))).toBe(true);
    expect(lignes.some((l) => l.includes('40 A') && l.includes('type AC'))).toBe(false);
  });

  it('le balcon ne compte pas dans la surface du logement', () => {
    const rooms = [piece('s', 'Séjour', 32, ['s1']), piece('b', 'Balcon', 6, ['b1'])];
    const fixtures = [app('p1', 'prise', 's1', 1), app('i1', 'inter', 's1', 2)];
    const ac = materialList(rooms, fixtures, new Map([['s1', ['s']], ['b1', ['b']]])).differentials.filter((d) => d.type === 'AC');
    expect(ac.map((d) => d.rating)).toEqual([25]);
  });
});
