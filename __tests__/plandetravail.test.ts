/**
 * La règle de hauteur au-dessus d'un plan de travail.
 *
 * « Axe à 1,30 m du sol au maximum, HORS PLAN DE TRAVAIL » — et c'est
 * justement au-dessus d'une crédence qu'on pose le plus de prises. Sans
 * tenir compte du meuble, l'app signalait en défaut toute une cuisine, ce
 * qui revient à ne rien signaler : on n'écoute plus un garde-fou qui se
 * trompe à chaque fois. Elle sait maintenant reconnaître un plan de travail
 * devant un mur, et la règle change là où il se trouve — pas ailleurs.
 */
import {
  HEIGHT_RULES,
  checkElectrical,
  heightRuleAt,
  worktopsOnWall,
  type RoomInput,
} from '../src/geometry/nfc15100';
import {
  interiorSide,
  wallFace,
  faceX,
  fromFaceX,
  type Fixture,
} from '../src/geometry/electrical';
import { wallQuads, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'cuisine',
});

/** Cuisine de 4 × 3 m. Le mur nord porte la crédence. */
const CUISINE: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

const side = interiorSide(CUISINE[0], CUISINE);
const face = wallFace(CUISINE[0], wallQuads(CUISINE).get('n'), side);

/** Un meuble bas de cuisine, dos au mur nord, entre x0 et x1. */
const caisson = (
  x0: number,
  x1: number,
  category = 'counter',
  haut = 0.9,
  depth = 0.6,
) => ({
  id: `m-${x0}`,
  category,
  width: x1 - x0,
  depth,
  height: haut,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (x0 + x1) / 2, haut / 2, depth / 2, 1],
});

describe('reconnaître un plan de travail devant un mur', () => {
  it('un meuble bas collé au mur en donne un, sur sa seule longueur', () => {
    const plans = worktopsOnWall(face, [caisson(0.5, 2.5)], true);
    expect(plans).toHaveLength(1);
    expect(plans[0].height).toBeCloseTo(0.9, 3);
    // La portion couverte, dans le repère de la face.
    const a = Math.min(faceX(face, 0.5), faceX(face, 2.5));
    const b = Math.max(faceX(face, 0.5), faceX(face, 2.5));
    expect(plans[0].from).toBeCloseTo(a, 2);
    expect(plans[0].to).toBeCloseTo(b, 2);
  });

  it('un meuble au milieu de la pièce n’en donne pas', () => {
    const ilot = caisson(1, 3);
    ilot.transform[14] = 1.8; // 1,80 m du mur : ce n'est plus sa crédence
    expect(worktopsOnWall(face, [ilot], true)).toHaveLength(0);
  });

  it('une armoire de 2 m n’est pas un plan de travail', () => {
    expect(
      worktopsOnWall(face, [caisson(0.5, 1.5, 'storage', 2)], true),
    ).toHaveLength(0);
  });

  it('un caisson bas ne compte qu’en cuisine', () => {
    const bas = caisson(0.5, 1.5, 'storage', 0.9);
    expect(worktopsOnWall(face, [bas], true)).toHaveLength(1);
    expect(worktopsOnWall(face, [bas], false)).toHaveLength(0);
  });

  it('un évier ou une plaque en donnent un partout', () => {
    for (const cat of ['sink', 'stove', 'dishwasher']) {
      expect(worktopsOnWall(face, [caisson(1, 2, cat)], false)).toHaveLength(1);
    }
  });
});

describe('la règle qui s’applique vraiment', () => {
  const plans = worktopsOnWall(face, [caisson(0.5, 2.5)], true);
  const dessus = (faceX(face, 0.5) + faceX(face, 2.5)) / 2;
  const ailleurs = faceX(face, 3.6);

  it('devant la crédence, on remonte à 98 cm minimum', () => {
    const r = heightRuleAt('prise', dessus, plans)!;
    expect(r.min).toBeCloseTo(0.98, 3);
    expect(r.max).toBeCloseTo(1.3, 3);
    expect(r.regle).toContain('plan de travail');
  });

  it('à côté de la crédence, la règle du mur nu reprend', () => {
    const r = heightRuleAt('prise', ailleurs, plans)!;
    expect(r).toEqual(HEIGHT_RULES.prise);
  });

  it('sans plan de travail, rien ne change', () => {
    expect(heightRuleAt('prise', dessus, [])).toEqual(HEIGHT_RULES.prise);
  });

  it('un tableau électrique garde sa règle, crédence ou pas', () => {
    expect(heightRuleAt('tableau', dessus, plans)).toEqual(
      HEIGHT_RULES.tableau,
    );
  });
});

describe('le contrôle de conformité, crédence comprise', () => {
  const piece: RoomInput = {
    id: 'cuisine',
    name: 'Cuisine',
    area: 12,
    kind: null,
    wallIds: ['n', 'e', 's', 'w'],
  };
  const wallRooms = new Map([['n', ['cuisine']]]);
  const plans = worktopsOnWall(face, [caisson(0.5, 2.5)], true);
  const worktops = new Map([
    ['n', { x: (f: Fixture) => faceX(face, f.along), plans }],
  ]);
  const prise = (along: number, height: number): Fixture => ({
    id: `f-${along}-${height}`,
    kind: 'prise',
    wallId: 'n',
    along: fromFaceX(face, along),
    height,
    side,
  });

  const hauteurs = (fixtures: Fixture[], wt = worktops) =>
    checkElectrical([piece], fixtures, wallRooms, undefined, wt).filter(
      (i) => i.code === 'hauteur',
    );

  it('une prise à 1,10 m sur la crédence ne déclenche RIEN', () => {
    const f = prise(faceX(face, 1.5), 1.1);
    // Sans la connaissance du plan de travail, elle passait déjà (< 1,30) ;
    // c'est la prise à 25 cm qui doit désormais alerter.
    expect(hauteurs([f])).toHaveLength(0);
  });

  it('une prise à 25 cm DERRIÈRE le meuble est signalée', () => {
    const f = prise(faceX(face, 1.5), 0.25);
    const issues = hauteurs([f]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('trop bas');
    expect(issues[0].regle).toContain('plan de travail');
    // Et la correction proposée est VALIDE là où l'appareil se trouve.
    expect(issues[0].fix?.height).toBeGreaterThanOrEqual(0.98);
    expect(issues[0].fix?.label).toContain('98');
  });

  it('la même prise, deux mètres plus loin, reste conforme', () => {
    const f = prise(faceX(face, 3.6), 0.25);
    expect(hauteurs([f])).toHaveLength(0);
  });

  it('sans plans de travail connus, le comportement d’avant est intact', () => {
    // Un scan sans mobilier : l'app ne peut rien deviner, elle applique la
    // règle du mur nu — et une prise à 25 cm y est parfaitement conforme.
    const f = prise(faceX(face, 1.5), 0.25);
    expect(hauteurs([f], new Map())).toHaveLength(0);
    // Alors qu'à 1,45 m, elle dépasse le maximum, plan ou pas.
    expect(hauteurs([prise(faceX(face, 1.5), 1.45)], new Map())).toHaveLength(1);
  });
});
