/**
 * LE PONTAGE DES PRISES — la seule exception à l'étoile.
 *
 * Releve du patron : « fais un systeme intelligent de calcul pour les prises,
 * si elles sont voisines, meme pan de mur, et que ca rentre dans la norme en
 * terme de quantite, piece etc : on fait des pontages de prises a prises.
 * C'est le seul element qu'on ponte au mur (la gaine va de prise en prise du
 * coup si c'est valide). »
 *
 * Tout le reste remonte au tableau — c'est le releve precedent, « je veux que
 * tout soit compte comme si on ramenait toutes les gaines de tous les
 * elements au tableau ». Les socles font exception, et c'est ce que fait tout
 * le monde : la norme borne le NOMBRE de socles par circuit, pas la facon de
 * les alimenter.
 *
 * QUATRE CONDITIONS, et ce banc les eprouve une par une, chacune avec son
 * contraire :
 *   — un socle 16 A, rien d'autre ;
 *   — meme circuit ;
 *   — meme pan de mur et meme face : pas a travers une porte, pas d'un cote
 *     d'une cloison a l'autre ;
 *   — la prise ne l'a pas refuse — releve du patron sur la fiche de pose :
 *     « on peut refuser pour faire un circuit independant par prise ».
 */
import { planRoutes } from '../src/geometry/elecplan';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { fixturePlacement, roomInputsOf } from '../src/geometry/nfc15100';
import type { Fixture } from '../src/geometry/electrical';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const fx = (
  id: string,
  kind: Fixture['kind'],
  along: number,
  extra: Partial<Fixture> = {},
): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along,
  height: 0.25,
  side: 1,
  ...extra,
});

const ROOMS = [{ id: 'r1', name: 'Séjour', floor: null }];

/** Le métré d'un plan, tel que l'écran et le devis le lisent. */
const metrer = (fixtures: Fixture[], openings: WallSeg[] = []) => {
  const parts = roomParts(MURS, ROOMS as never);
  const entrees = roomInputsOf(ROOMS as never, parts);
  const placement = fixturePlacement(fixtures, MURS, entrees);
  return planRoutes(
    MURS,
    ROOMS as never,
    parts,
    fixtures,
    placement,
    [],
    openings,
  )!;
};

/** La gaine totale d'un plan, tous circuits confondus. */
const gaine = (fixtures: Fixture[], openings: WallSeg[] = []) => {
  const plan = metrer(fixtures, openings);
  let t = 0;
  for (const m of plan.metre.values()) t += m.conduit;
  return t;
};

const TABLEAU = fx('tab', 'tableau', 0.3, { wallId: 'o' });

describe('quatre prises en ligne sur le même pan', () => {
  const QUATRE = [
    TABLEAU,
    fx('p1', 'prise', 1),
    fx('p2', 'prise', 2),
    fx('p3', 'prise', 3),
    fx('p4', 'prise', 4),
  ];

  it('se pontent : la gaine va de prise en prise', () => {
    /*
      Un metre par saut, et un seul depart depuis le tableau. En etoile, les
      quatre departs feraient chacun tout le chemin — c'est trois fois plus
      de gaine pour un cablage que personne ne fait.
    */
    const plan = metrer(QUATRE);
    const m = plan.metre.get([...plan.metre.keys()][0])!;
    const sauts = m.troncons
      .map((t) => Math.round(t.conduit))
      .sort((a, b) => a - b);
    // Trois sauts d'un mètre, et une seule descente depuis le tableau.
    expect(sauts.filter((l) => l === 1)).toHaveLength(3);
    expect(sauts.filter((l) => l > 1)).toHaveLength(1);
  });

  it('et ça coûte bien moins de gaine que quatre départs', () => {
    // Le controle en sens inverse, par le compteur : les mêmes quatre prises
    // qui refusent toutes le pontage.
    const seules = QUATRE.map((f) =>
      f.kind === 'prise' ? { ...f, sansPontage: true } : f,
    );
    expect(gaine(QUATRE)).toBeLessThan(gaine(seules) / 2);
  });
});

describe('ce qui ne se ponte pas', () => {
  it('une prise qui a refusé part seule du tableau', () => {
    /*
      Releve du patron, sur la fiche de pose : « on propose de lier le cablage
      elec des prises entre elles ; on peut refuser pour faire un circuit
      independant par prise ». Le refus se porte sur la prise, et lui seul.
    */
    const avec = [TABLEAU, fx('p1', 'prise', 1), fx('p2', 'prise', 2)];
    const sans = [
      TABLEAU,
      fx('p1', 'prise', 1),
      fx('p2', 'prise', 2, { sansPontage: true }),
    ];
    expect(gaine(sans)).toBeGreaterThan(gaine(avec));
  });

  it('deux prises séparées par une porte : la gaine ne la traverse pas', () => {
    /*
      Le pan de mur est le troncon PLEIN. Une menuiserie le coupe, et l'on ne
      ponte pas a travers une porte — ce serait proposer de percer un huisserie
      sur le document meme qui sert a percer.
    */
    const porte: WallSeg = {
      id: 'porte',
      type: 'door',
      a: { x: 1.4, z: 0 },
      b: { x: 2.3, z: 0 },
      height: 2.04,
      yCenter: 1.02,
    };
    const deux = [TABLEAU, fx('p1', 'prise', 1), fx('p2', 'prise', 3)];
    expect(gaine(deux, [porte])).toBeGreaterThan(gaine(deux));
  });

  it('deux prises sur deux faces d’un même mur ne se pontent pas', () => {
    /*
      Un cote d'une cloison n'est pas l'autre : la gaine devrait traverser le
      mur, et ce n'est pas un pontage, c'est un percement.

      ON COMPTE LES SAUTS, ET NON LES METRES. Comparer deux totaux ne prouvait
      rien ici : changer de face deplace la prise, donc la longueur bouge de
      toute facon — l'epreuve passait sans le pontage. Un saut, lui, ne peut
      venir que d'un pontage.
    */
    const saute = (fixtures: Fixture[]) => {
      const plan = metrer(fixtures);
      const m = plan.metre.get([...plan.metre.keys()][0])!;
      return m.troncons.filter((t) => t.conduit < 1.5).length;
    };
    expect(saute([TABLEAU, fx('p1', 'prise', 1), fx('p2', 'prise', 2)])).toBe(1);
    expect(
      saute([
        TABLEAU,
        fx('p1', 'prise', 1),
        fx('p2', 'prise', 2, { side: -1 as const }),
      ]),
    ).toBe(0);
  });

  it('et un interrupteur ne se ponte jamais, même côte à côte', () => {
    /*
      Le controle en sens inverse du type : « c'est le seul element qu'on
      ponte au mur ». Un interrupteur porte son retour de lampe, qui lui est
      propre ; deux interrupteurs voisins ne partagent rien.
    */
    const inters = [TABLEAU, fx('i1', 'inter', 1), fx('i2', 'inter', 2)];
    const prises = [TABLEAU, fx('p1', 'prise', 1), fx('p2', 'prise', 2)];
    expect(gaine(inters)).toBeGreaterThan(gaine(prises));
  });

  it('et une prise 20 A non plus : elle a son circuit à elle', () => {
    const specialisees = [TABLEAU, fx('s1', 'prise20', 1), fx('s2', 'prise20', 2)];
    const seize = [TABLEAU, fx('p1', 'prise', 1), fx('p2', 'prise', 2)];
    expect(gaine(specialisees)).toBeGreaterThan(gaine(seize));
  });
});

describe('la tête de chaîne', () => {
  it('est la prise la plus proche du tableau, pas la première venue', () => {
    /*
      Prendre la premiere par abscisse allongeait le depart de toute la
      longueur du pan : le tableau est a un bout, et l'on alimentait l'autre.
      Ici le tableau est contre le mur ouest — donc pres de l'abscisse zero du
      mur nord — mais les prises sont posees a l'envers dans la liste : l'ordre
      de la liste ne doit rien changer.
    */
    const ordre = [
      TABLEAU,
      fx('p4', 'prise', 4),
      fx('p3', 'prise', 3),
      fx('p2', 'prise', 2),
      fx('p1', 'prise', 1),
    ];
    const plan = metrer(ordre);
    const m = plan.metre.get([...plan.metre.keys()][0])!;
    const depart = m.troncons.reduce((a, b) => (a.conduit > b.conduit ? a : b));
    // Le long départ dessert la prise la plus proche du tableau, celle à 1 m.
    expect(depart.id).toBe('p1');
  });
});
