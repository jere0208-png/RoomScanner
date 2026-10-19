/**
 * LE VA-ET-VIENT EN ÉTOILE, COULEUR PAR COULEUR — revue « chantier » :
 * les deux commandes d'un va-et-vient recevaient chacune « phase + deux
 * navettes ». Tout remonte au tableau : la phase monte à la PREMIÈRE
 * commande, le retour de lampe redescend de la SECONDE. Le total de fil
 * était juste, sa couleur non : vingt mètres de rouge et dix de violet, au
 * lieu de dix et vingt — de quoi manquer de violet sur le chantier. Et un
 * double allumage renvoie deux retours, pas un.
 */
import type { Wire } from '../src/geometry/schema';
import { buyingList, type PullRow } from '../src/geometry/conduits';
import type { Fixture } from '../src/geometry/electrical';

const fil = (role: Wire['role']): Wire => ({ role, color: '#000', label: role, section: 1.5 });
const ligne = (troncons: PullRow['troncons'], brins: Wire[]): PullRow => ({
  circuitId: 'c1',
  label: 'Éclairage 1',
  section: 1.5,
  nature: 'eclairage' as const,
  brins,
  fils: 3,
  conduit: 16,
  troncons,
  runs: troncons.length,
  conduitLength: troncons.reduce((t, x) => t + x.conduit, 0),
  cableLength: 0,
  approx: false,
  protection: '16 A',
});
const metres = (rows: ReturnType<typeof buyingList>, role: string) => {
  const l = rows.find((r) => r.code === `fil-1.5-${role}`);
  return l ? Number(/^(\d+) m/.exec(l.note ?? '')?.[1]) : 0;
};
const app = (id: string, kind: Fixture['kind']): Fixture => ({ id, kind, wallId: 'm', along: 1, height: 1.1, side: 1 });

it('va-et-vient : la phase à une commande, le retour de l’autre', () => {
  const rows = buyingList(
    [
      ligne(
        [
          { id: 'v1', conduit: 10, cable: 10, role: 'commande' },
          { id: 'v2', conduit: 10, cable: 10, role: 'commande' },
          { id: 'dcl', conduit: 10, cable: 10, role: 'lumiere' },
        ],
        [fil('phase'), fil('neutre'), fil('terre'), fil('retour'), fil('navette'), fil('navette')],
      ),
    ],
    [app('v1', 'va'), app('v2', 'va')],
    [],
  );
  expect(metres(rows, 'phase')).toBe(10);
  expect(metres(rows, 'retour')).toBe(20);
  expect(metres(rows, 'navette')).toBe(40);
  expect(metres(rows, 'neutre')).toBe(10);
});

it('double allumage : deux retours depuis la commande', () => {
  const rows = buyingList(
    [
      ligne(
        [
          { id: 'd1', conduit: 10, cable: 10, role: 'commande' },
          { id: 'l1', conduit: 10, cable: 10, role: 'lumiere' },
          { id: 'l2', conduit: 10, cable: 10, role: 'lumiere' },
        ],
        [fil('phase'), fil('neutre'), fil('terre'), fil('retour')],
      ),
    ],
    [app('d1', 'inter2')],
    [],
  );
  expect(metres(rows, 'phase')).toBe(10);
  // Deux retours vers la commande, un vers chaque point.
  expect(metres(rows, 'retour')).toBe(40);
});
