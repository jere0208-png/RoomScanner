/**
 * UN INTERRUPTEUR ET UN POINT LUMINEUX, C'EST QUATRE CONDUCTEURS.
 *
 * Releve du patron : « le schema multifilaire dit n'importe quoi,
 * interrupteur et point lumineux il dit juste 3 fils a l'eclairage ».
 *
 * Il a raison, et la cause est une frontiere interne de l'application : les
 * points lumineux de PLAFOND — DCL, spots — ne vivent pas dans la meme
 * liste que l'appareillage mural. Le calcul des conducteurs ne regardait
 * que les murs, n'y trouvait aucune lampe, et concluait qu'il n'y avait
 * rien a commander : phase, neutre, terre, et rien d'autre.
 *
 * Or le cablage d'un simple allumage est connu de tout electricien :
 *
 *   — du tableau au point : phase, neutre, terre ;
 *   — du point a l'interrupteur : la phase qui part, et le RETOUR DE LAMPE
 *     qui revient.
 *
 * Le retour de lampe est le conducteur qui distingue un circuit d'eclairage
 * d'une simple alimentation. L'oublier, c'est sous-compter le fil au metre
 * et surtout DECRIRE UN CABLAGE QUI N'EXISTE PAS sur un document technique.
 */
import { wiresOf } from '../src/geometry/schema';
import type { Fixture } from '../src/geometry/electrical';

const INTER: Fixture = {
  id: 'i1', kind: 'inter', wallId: 'm1', along: 1, height: 1.1, side: 1,
};

const circuit = (extra: object = {}) => ({
  id: 'c1',
  label: 'Éclairage 1',
  nature: 'eclairage' as const,
  points: 1,
  section: 1.5,
  breaker: 16,
  rooms: ['Sejour'],
  fixtureIds: ['i1'],
  ...extra,
});

const roles = (w: { role: string }[]) => w.map((x) => x.role).sort();

describe('les conducteurs d’un circuit d’éclairage', () => {
  it('comptent le retour de lampe quand le point est AU PLAFOND', () => {
    const fils = wiresOf(circuit({ ceilingIds: ['pl1'] }) as never, [INTER]);
    expect(roles(fils)).toEqual(['neutre', 'phase', 'retour', 'terre']);
  });

  it('et pas de navette pour un simple allumage', () => {
    const fils = wiresOf(circuit({ ceilingIds: ['pl1'] }) as never, [INTER]);
    expect(fils.filter((f) => f.role === 'navette')).toHaveLength(0);
  });

  it('mais deux navettes des qu’il y a un va-et-vient', () => {
    const va: Fixture = { ...INTER, id: 'i2', kind: 'va' };
    const fils = wiresOf(
      circuit({ ceilingIds: ['pl1'], fixtureIds: ['i1', 'i2'] }) as never,
      [INTER, va],
    );
    expect(fils.filter((f) => f.role === 'navette')).toHaveLength(2);
  });

  it('et rien de plus quand aucune lampe n’est posee', () => {
    // Des commandes seules : le retour n'a rien a retourner. C'est le cas
    // d'un releve en cours, et le schema ne doit pas l'inventer.
    const fils = wiresOf(circuit() as never, [INTER]);
    expect(roles(fils)).toEqual(['neutre', 'phase', 'terre']);
  });
});
