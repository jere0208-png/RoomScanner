/**
 * PAS DE TABLEAU SUR LE PLAN, PAS DE TABLEAU AU DEVIS.
 *
 * Relevé du patron : « si pas de TGBT présent sur le plan, on ne doit pas
 * le compter dans le devis. »
 *
 * C'EST UN REVIREMENT ASSUMÉ, et il faut le dire : un relevé précédent
 * avait fait l'inverse (« le coffret n'existait que si l'on avait posé un
 * tableau sur un mur — or on sait combien de modules il faut avant de
 * savoir où on l'accroche »). Les deux règles sont justes, mais pas pour
 * les mêmes chantiers : sur un logement à rénover entièrement, le tableau
 * se déduit ; sur DEUX PRISES AJOUTÉES DANS UNE CUISINE, le tableau
 * existant reste en place — et un devis qui facture un coffret quatre
 * rangées pour deux prises est un devis qu'on ne montre pas au client.
 *
 * LE GESTE TRANCHE : poser le TGBT sur le plan, c'est dire « le tableau
 * fait partie du chantier ». Sans lui, la famille Tableau entière —
 * coffret, peignes, disjoncteurs, différentiels, coffret de communication —
 * reste au magasin.
 */
import { chiffrerLePlan } from '../src/geometry/devisplan';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];
const PIECES = [
  { id: 'r1', name: 'Cuisine', floor: null, wallIds: ['n', 'e', 's', 'o'] },
];

const prise = (id: string, along: number): Fixture => ({
  id,
  kind: 'prise',
  wallId: 'n',
  along,
  height: 0.25,
  side: 1,
});

const TABLEAU: Fixture = {
  id: 'tgbt',
  kind: 'tableau',
  wallId: 'o',
  along: 1,
  height: 1.3,
  side: 1,
};

const gamme = 'dooxie' as never;

describe('le devis suit le geste du tableau', () => {
  it('deux prises sans TGBT : rien au rayon Tableau', () => {
    const devis = chiffrerLePlan(
      MURS,
      PIECES as never,
      [prise('p1', 1), prise('p2', 2)],
      [],
      gamme,
    );
    const tableau = devis.lignes.filter((l) => l.famille === 'Tableau');
    expect(tableau).toHaveLength(0);
    // Et les prises, elles, sont bien chiffrées : on n'a pas éteint le
    // devis, on a retiré un poste.
    expect(devis.lignes.some((l) => l.code.startsWith('meca-prise'))).toBe(true);
  });

  it('le TGBT posé, le rayon Tableau revient entier', () => {
    const devis = chiffrerLePlan(
      MURS,
      PIECES as never,
      [prise('p1', 1), prise('p2', 2), TABLEAU],
      [],
      gamme,
    );
    const codes = devis.lignes
      .filter((l) => l.famille === 'Tableau')
      .map((l) => l.code);
    // Le coffret, ses peignes, et un disjoncteur au moins : la déduction
    // d'avant, intacte dès que le geste l'a demandée.
    expect(codes.some((code) => code.startsWith('coffret-'))).toBe(true);
    expect(codes).toContain('peigne');
    expect(codes.some((code) => code.startsWith('disj-'))).toBe(true);
  });
});
