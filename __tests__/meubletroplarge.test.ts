/**
 * UN MEUBLE QUI NE RENTRE PAS SE RABOTE, IL NE S'EXILE PAS.
 *
 * Releve de chantier, capture a l'appui : « apres un scan complet de ma
 * salle de bain, les WC et le meuble placard au-dessus ont ete deplaces
 * automatiquement hors plan et le scan les a dimensionnes plus grand ; ils
 * ne rentrent pas sur le plan, mais bien dans ma salle de bain ».
 *
 * LES DEUX MOITIES SE TIENNENT. RoomPlan mesure une boite ENGLOBANTE : dans
 * une piece etroite, un WC vu de trois quarts avec son abattant releve, ou
 * un placard dont la porte etait ouverte, ressortent plus larges que le
 * meuble reel. Le recalage, lui, ne savait que POUSSER : il ecarte le meuble
 * du mur dans lequel il trempe, mur apres mur. Quand la boite est plus large
 * que la piece, chaque mur pousse a son tour, le dernier gagne, et le meuble
 * finit dehors — dans le couloir, ou dans le vide.
 *
 * Reponse du patron : « fais en sorte que si le meuble semble plus grand que
 * l'endroit ou il se situe, on l'adapte au max pour qu'il soit bien la ou il
 * doit etre ».
 *
 * ON RABOTE, DONC. Quand deux murs OPPOSES poussent le meuble en meme temps,
 * aucun deplacement ne peut plus le sauver : c'est la boite qui est trop
 * grande, et c'est elle qui cede. On la reduit de ce qui depasse, des deux
 * cotes, et le meuble se pose entre les deux nus. Il perd la cote que le
 * scan avait exageree, il garde sa place — et c'est la seule des deux qui
 * comptait.
 *
 * CE QU'ON NE FAIT PAS : le rabotage ne descend pas sous un pied de large.
 * Un meuble reduit a un trait n'est plus un meuble, c'est un defaut qu'on
 * a rendu invisible.
 */
import {
  WALL_T,
  clampFootprint,
  type ObjectFootprint,
  type WallSeg,
} from '../src/geometry/floorplan';

/** Une salle d'eau de 1,60 x 2,00, murs d'aplomb. */
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'sdb',
});

const L = 1.6;
const P = 2;
const MURS: WallSeg[] = [
  mur('n', 0, 0, L, 0),
  mur('e', L, 0, L, P),
  mur('s', L, P, 0, P),
  mur('o', 0, P, 0, 0),
];
const DEDANS = { x: L / 2, z: P / 2 };

const meuble = (
  cx: number,
  cz: number,
  width: number,
  depth: number,
  yaw = 0,
): ObjectFootprint => ({
  id: 'm1',
  category: 'storage',
  cx,
  cz,
  width,
  depth,
  height: 0.6,
  yCenter: 0.3,
  yaw,
});

/** Les quatre coins, dans le monde. */
const coins = (f: ObjectFootprint) => {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return (
    [
      [-f.width / 2, -f.depth / 2],
      [f.width / 2, -f.depth / 2],
      [f.width / 2, f.depth / 2],
      [-f.width / 2, f.depth / 2],
    ] as [number, number][]
  ).map(([lx, lz]) => ({
    x: f.cx + lx * c - lz * s,
    z: f.cz + lx * s + lz * c,
  }));
};

/** Le meuble tient-il dans le nu interieur des murs ? */
const dansLaPiece = (f: ObjectFootprint) => {
  const nu = WALL_T / 2;
  return coins(f).every(
    (p) =>
      p.x >= nu - 1e-6 &&
      p.x <= L - nu + 1e-6 &&
      p.z >= nu - 1e-6 &&
      p.z <= P - nu + 1e-6,
  );
};

describe('un meuble plus large que sa piece', () => {
  /*
    LE PLACARD DU RELEVE : deux metres vingt de large mesures par le scan,
    dans une piece qui en fait un soixante. Aucun deplacement ne peut le
    faire tenir.
  */
  const TROP_LARGE = meuble(L / 2, 0.3, 2.2, 0.35);

  it('reste dans la piece au lieu de partir dehors', () => {
    const cale = clampFootprint(TROP_LARGE, MURS, DEDANS);
    expect(dansLaPiece(cale)).toBe(true);
  });

  it('perd la largeur que le scan avait exageree', () => {
    const cale = clampFootprint(TROP_LARGE, MURS, DEDANS);
    expect(cale.width).toBeLessThan(TROP_LARGE.width);
    // Il occupe ce qui reste entre les deux nus, a la marge pres : on
    // rabote au MAXIMUM utile, pas au premier chiffre venu.
    expect(cale.width).toBeGreaterThan(L - WALL_T - 0.1);
  });

  it('garde sa profondeur, qui n’etait pas en cause', () => {
    const cale = clampFootprint(TROP_LARGE, MURS, DEDANS);
    expect(cale.depth).toBeCloseTo(TROP_LARGE.depth, 3);
  });

  it('reste contre le mur qu’il longeait', () => {
    // Un placard mural qu'on recentrerait au milieu de la piece serait
    // « dans la piece » et faux : il est contre SON mur.
    const cale = clampFootprint(TROP_LARGE, MURS, DEDANS);
    expect(cale.cz).toBeLessThan(P / 2);
  });

  it('vaut aussi pour la profondeur, et de biais', () => {
    // Une boite trop PROFONDE, dans une piece tournee de rien du tout : le
    // rabotage suit les axes du MEUBLE, pas ceux du monde.
    const profond = meuble(L / 2, P / 2, 0.4, 2.6, 0.2);
    const cale = clampFootprint(profond, MURS, DEDANS);
    expect(cale.depth).toBeLessThan(profond.depth);
    expect(dansLaPiece(cale)).toBe(true);
  });
});

/*
  LES CONTROLES EN SENS INVERSE. Sans eux, un rabotage qui s'appliquerait a
  TOUT meuble passerait les epreuves du dessus — et le scan rendrait des
  meubles retreci sans raison, ce qui est pire que le defaut d'origine.
*/
describe('un meuble qui tient', () => {
  it('ne perd pas un centimetre', () => {
    const wc = meuble(0.5, 0.45, 0.7, 0.8);
    const cale = clampFootprint(wc, MURS, DEDANS);
    expect(cale.width).toBeCloseTo(wc.width, 3);
    expect(cale.depth).toBeCloseTo(wc.depth, 3);
  });

  it('meme quand il trempe dans UN mur : on le pousse, on ne le rabote pas', () => {
    // Une etagere a moitie dans la cloison : le recalage la ressort, et sa
    // taille n'est pour rien dans l'affaire.
    const etagere = meuble(0.02, 1, 0.3, 0.9);
    const cale = clampFootprint(etagere, MURS, DEDANS);
    expect(cale.width).toBeCloseTo(etagere.width, 3);
    expect(cale.cx).toBeGreaterThan(etagere.cx);
  });

  it('et un meuble minuscule ne se rabote pas jusqu’a disparaitre', () => {
    // Le plancher du rabotage : un meuble reduit a un trait n'est plus un
    // meuble, c'est un defaut qu'on a rendu invisible.
    const etroite: WallSeg[] = [
      mur('n', 0, 0, 0.3, 0),
      mur('e', 0.3, 0, 0.3, 0.3),
      mur('s', 0.3, 0.3, 0, 0.3),
      mur('o', 0, 0.3, 0, 0),
    ];
    const gros = meuble(0.15, 0.15, 1.2, 1.2);
    const cale = clampFootprint(gros, etroite, { x: 0.15, z: 0.15 });
    expect(cale.width).toBeGreaterThanOrEqual(0.3);
    expect(cale.depth).toBeGreaterThanOrEqual(0.3);
  });
});
