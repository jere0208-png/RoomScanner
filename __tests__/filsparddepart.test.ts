/**
 * LES CONDUCTEURS D'UN DÉPART — et non ceux du circuit entier.
 *
 * Releve du patron, le PDF en main : « pour l'eclairage, le PDF d'un simple
 * allumage montre 4 fils, alors qu'il n'y a que le retour lampe, bleu,
 * terre ».
 *
 * Il a raison, et l'erreur etait de compter par CIRCUIT. Un circuit
 * d'eclairage emploie bien quatre conducteurs — phase, neutre, terre, retour
 * de lampe — mais AUCUN DEPART ne les porte tous les quatre. Tout remonte au
 * tableau (releve de la veille), donc :
 *
 *   — vers une commande : la phase monte, le retour redescend. Pas de neutre,
 *     un interrupteur ne coupe que la phase ; pas de terre, il n'y a rien a
 *     mettre a la terre dans un boitier d'appareillage ;
 *   — vers un point lumineux : le neutre, la terre, et le retour de lampe.
 *     Mot pour mot le releve.
 *
 * ET CE N'EST PAS QU'UN DESSIN. Le diametre de la gaine se calcule sur le
 * nombre de fils qu'elle avale : compter le circuit faisait choisir de l'ICTA
 * 20 la ou du 16 suffit, et commander une couronne de rouge jusqu'a une lampe
 * qui n'en veut pas. On sur-commandait sur le document meme qui sert a
 * commander.
 */
import { wiresOf, wiresOfRun, multiWire } from '../src/geometry/schema';
import { conduitPour } from '../src/geometry/conduits';
import type { Circuit } from '../src/geometry/nfc15100';
import type { Fixture } from '../src/geometry/electrical';

const fx = (id: string, kind: Fixture['kind']): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along: 1,
  height: 0.25,
  side: 1,
});

const eclairage = (fixtureIds: string[], ceilingIds: string[]): Circuit => ({
  id: 'e1',
  label: 'Éclairage — Séjour',
  nature: 'eclairage',
  points: fixtureIds.length + ceilingIds.length,
  section: 1.5,
  breaker: 16,
  rooms: ['Séjour'],
  fixtureIds,
  ceilingIds,
});

const PRISES: Circuit = {
  id: 'p1',
  label: 'Prises — Séjour',
  nature: 'prises',
  points: 5,
  section: 2.5,
  breaker: 20,
  rooms: ['Séjour'],
  fixtureIds: [],
};

const roles = (c: Circuit, r: 'commande' | 'lumiere' | 'autre', va = false) =>
  wiresOfRun(c, r, va).map((w) => w.role);

describe('un simple allumage', () => {
  const CIRCUIT = eclairage(['i1'], ['dcl1']);

  it('n’envoie que le retour, le neutre et la terre au point lumineux', () => {
    // Mot pour mot le releve du patron.
    expect(roles(CIRCUIT, 'lumiere')).toEqual(['neutre', 'terre', 'retour']);
  });

  it('et rien que la phase et le retour à la commande', () => {
    /*
      Un interrupteur ne coupe que la phase : pas de neutre. Et il n'y a rien
      a mettre a la terre dans un boitier d'appareillage.
    */
    expect(roles(CIRCUIT, 'commande')).toEqual(['phase', 'retour']);
  });

  it('alors que le CIRCUIT, lui, en emploie bien quatre', () => {
    /*
      Le controle en sens inverse : les quatre conducteurs existent, et il
      faut les acheter. Ce qui etait faux, c'est de les mettre tous dans la
      meme gaine.
    */
    expect(wiresOf(CIRCUIT, [fx('i1', 'inter')]).map((w) => w.role)).toEqual([
      'phase',
      'neutre',
      'terre',
      'retour',
    ]);
  });

  it('et la gaine se calcule sur TROIS fils, pas quatre', () => {
    const parDepart = Math.max(
      roles(CIRCUIT, 'commande').length,
      roles(CIRCUIT, 'lumiere').length,
    );
    expect(parDepart).toBe(3);
  });

  it('et sur un va-et-vient, ça change vraiment le diamètre', () => {
    /*
      LE CHIFFRE QU'IL FAUT MONTRER, ET PAS UN AUTRE.

      Premiere version de cette epreuve : elle comparait quatre fils a trois
      en 2,5 mm². Les deux tombent sur de l'ICTA 20 — la regle du tiers a
      des paliers, et l'ecart de comptage n'en franchit pas toujours un. Une
      epreuve qui ne demontre rien est pire qu'une epreuve absente : elle
      donne l'impression que le sujet est garde.

      La ou l'ecart se paie, c'est sur le VA-ET-VIENT en 1,5 : six
      conducteurs au circuit demandent de l'ICTA 20, trois par gaine se
      contentent du 16. Une couronne de 20 coute un tiers de plus qu'une de
      16, et le tirage est le meme.
    */
    expect(conduitPour(1.5, 6)).toBe(20);
    expect(conduitPour(1.5, 3)).toBe(16);
  });
});

describe('un va-et-vient', () => {
  const CIRCUIT = eclairage(['v1', 'v2'], ['dcl1']);

  it('tire trois fils de chaque côté, jamais six dans la même gaine', () => {
    /*
      Six conducteurs au circuit — phase, neutre, terre, retour, deux
      navettes — et trois par gaine : la phase et les deux navettes vers les
      commandes, le neutre, la terre et le retour vers le point.
    */
    expect(roles(CIRCUIT, 'commande', true)).toEqual([
      'phase',
      'navette',
      'navette',
    ]);
    expect(roles(CIRCUIT, 'lumiere', true)).toEqual([
      'neutre',
      'terre',
      'retour',
    ]);
  });
});

describe('un circuit de prises', () => {
  it('envoie les mêmes trois fils partout', () => {
    // Le controle en sens inverse du cas d'eclairage : une prise n'a pas de
    // retour, et tous ses departs se ressemblent.
    for (const r of ['commande', 'lumiere', 'autre'] as const) {
      expect(roles(PRISES, r)).toEqual(['phase', 'neutre', 'terre']);
    }
  });
});

describe('le schéma multifilaire', () => {
  it('se lit départ par départ, et non d’un bord à l’autre', () => {
    const m = multiWire(eclairage(['i1'], ['dcl1']), [fx('i1', 'inter')], 'C1');
    expect(m.runs.map((r) => r.titre)).toEqual([
      'Vers la commande',
      'Vers le point lumineux',
    ]);
    expect(m.runs[1].wires.map((w) => w.role)).toEqual([
      'neutre',
      'terre',
      'retour',
    ]);
  });

  it('et il ne nie plus le point lumineux qu’il vient de dessiner', () => {
    /*
      La note ne regardait que l'appareillage MURAL. Sur un circuit commandant
      un DCL, la feuille dessinait le retour de lampe et ecrivait dessous
      « aucun point lumineux pose sur ce circuit » : deux phrases
      contradictoires sur la meme ligne.
    */
    const avec = multiWire(eclairage(['i1'], ['dcl1']), [fx('i1', 'inter')], 'C1');
    expect(avec.note ?? '').not.toContain('Aucun point lumineux');
    // Et le controle en sens inverse : sans aucun point, la note revient.
    const sans = multiWire(eclairage(['i1'], []), [fx('i1', 'inter')], 'C1');
    expect(sans.note ?? '').toContain('Aucun point lumineux');
  });
});
