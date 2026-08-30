/**
 * CE QUI EST DANS LA PIÈCE SUIT LA PIÈCE — menuiseries et plafond.
 *
 * Relevé du patron : « au déplacement d'un mur, les ouvrants ne suivent
 * pas. De plus, au redressage d'une pièce, les spots se décentrent.. il
 * faut qu'ils gardent une cohérence de centrage si c'était voulu. »
 *
 * DEUX TROUS DANS LA MÊME RÈGLE. Pousser un mur, tirer un coin, poser un
 * angle : ces trois gestes emportaient déjà les percements. Mais le
 * REDIMENSIONNEMENT d'une pièce (`reposerPiece` — taper « 5,18 × 4,05 » au
 * bandeau, OU tirer un bord au doigt, le geste le plus visible depuis le
 * tracé de l'accueil) recalait l'appareillage… et oubliait les menuiseries,
 * en coordonnées absolues : la fenêtre restait dans le vide. Et le plafond
 * n'était suivi NULLE PART : ni au redimensionnement, ni au redressage —
 * un spot posé au centre cessait de l'être au premier geste global.
 *
 * LA COHÉRENCE DEMANDÉE, MOT À MOT :
 *   — une menuiserie garde SA COTE depuis le bout de mur qui n'a pas
 *     bougé, et SA LARGEUR — une porte de 83 ne devient pas une porte de
 *     104 parce que le mur s'allonge (`reporterOuverture`, la règle du
 *     coin tiré) ;
 *   — un point de plafond garde SA POSITION RELATIVE dans la pièce : le
 *     centre reste le centre, le quart reste le quart. C'est la seule
 *     lecture qui respecte « si c'était voulu » — un semis de spots posé
 *     aux tiers reste aux tiers ;
 *   — au redressage, chaque pièce bouge d'un bloc (rotation + translation) :
 *     ses spots prennent LE MÊME bloc.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import { pointOnSeg, type WallSeg } from '../src/geometry/floorplan';

const fenetre = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'window',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 1.25,
  yCenter: 1.575,
});

/** Une pièce posée comme depuis le tracé : 4 × 3, coin haut-gauche en (0,0). */
const poserLaPiece = (): string => {
  useScanStore.getState().reset();
  const id = useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 });
  expect(id).toBeTruthy();
  return id!;
};

const largeurDe = (o: WallSeg) => Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
const milieuDe = (o: WallSeg) => ({
  x: (o.a.x + o.b.x) / 2,
  z: (o.a.z + o.b.z) / 2,
});

/** La menuiserie doit être SUR un mur : à un cheveu près, dedans. */
const surUnMur = (o: WallSeg) => {
  const murs = useScanStore.getState().walls;
  return murs.some((w) => pointOnSeg(milieuDe(o), w.a, w.b).dist < 0.01);
};

afterEach(() => {
  useScanStore.getState().reset();
});

describe('le redimensionnement emporte les menuiseries', () => {
  it('la fenêtre du mur du fond suit son mur', () => {
    const roomId = poserLaPiece();
    // Le mur du fond est à z = 3 ; la fenêtre, à un mètre du coin.
    useScanStore.setState({ openings: [fenetre('f', 1, 3, 2, 3)] });
    useScanStore.getState().resizeRoom(roomId, 4, 4);
    const o = useScanStore.getState().openings[0];
    // Le mur du fond est maintenant à z = 4 : elle y est, même cote, même
    // largeur.
    expect(o.a.z).toBeCloseTo(4, 6);
    expect(o.b.z).toBeCloseTo(4, 6);
    expect(largeurDe(o)).toBeCloseTo(1, 6);
    expect(surUnMur(o)).toBe(true);
  });

  it('et garde sa cote depuis le bout qui n’a pas bougé', () => {
    const roomId = poserLaPiece();
    // Sur le mur de gauche (x = 0), à un mètre du coin (0,0) — un coin qui
    // ne bouge pas quand la pièce s’allonge en largeur.
    useScanStore.setState({ openings: [fenetre('f', 0, 1, 0, 2)] });
    useScanStore.getState().resizeRoom(roomId, 6, 3);
    const o = useScanStore.getState().openings[0];
    expect(o.a.x).toBeCloseTo(0, 6);
    expect(Math.min(o.a.z, o.b.z)).toBeCloseTo(1, 6);
    expect(largeurDe(o)).toBeCloseTo(1, 6);
  });

  it('une pièce qui rétrécit ramène sa fenêtre DANS le mur, largeur intacte', () => {
    const roomId = poserLaPiece();
    // Collée au bout du mur du haut : de 3,2 à 3,9.
    useScanStore.setState({ openings: [fenetre('f', 3.2, 0, 3.9, 0)] });
    useScanStore.getState().resizeRoom(roomId, 2, 3);
    const o = useScanStore.getState().openings[0];
    expect(largeurDe(o)).toBeCloseTo(0.7, 6);
    expect(Math.max(o.a.x, o.b.x)).toBeLessThanOrEqual(2.001);
    expect(Math.min(o.a.x, o.b.x)).toBeGreaterThanOrEqual(-0.001);
    expect(surUnMur(o)).toBe(true);
  });

  it('le bord tiré au doigt fait pareil que la cote tapée', () => {
    const roomId = poserLaPiece();
    useScanStore.setState({ openings: [fenetre('f', 1, 3, 2, 3)] });
    // Le geste du chantier : tirer le bord bas de un mètre.
    useScanStore.getState().resizeRoomSide(roomId, 'profondeur+', 1, undefined);
    const o = useScanStore.getState().openings[0];
    expect(o.a.z).toBeCloseTo(4, 6);
    expect(largeurDe(o)).toBeCloseTo(1, 6);
  });
});

describe('le redimensionnement garde le centrage du plafond', () => {
  it('un spot au centre reste au centre', () => {
    const roomId = poserLaPiece();
    useScanStore.setState({
      ceiling: [{ id: 'c1', kind: 'spot', roomId, at: { x: 2, z: 1.5 } }],
    });
    useScanStore.getState().resizeRoom(roomId, 6, 4);
    const c = useScanStore.getState().ceiling[0];
    expect(c.at.x).toBeCloseTo(3, 6);
    expect(c.at.z).toBeCloseTo(2, 6);
  });

  it('un semis posé aux quarts reste aux quarts — « si c’était voulu »', () => {
    const roomId = poserLaPiece();
    useScanStore.setState({
      ceiling: [
        { id: 'c1', kind: 'spot', roomId, at: { x: 1, z: 0.75 } },
        { id: 'c2', kind: 'spot', roomId, at: { x: 3, z: 2.25 } },
      ],
    });
    useScanStore.getState().resizeRoom(roomId, 8, 6);
    const [c1, c2] = useScanStore.getState().ceiling;
    expect(c1.at.x).toBeCloseTo(2, 6);
    expect(c1.at.z).toBeCloseTo(1.5, 6);
    expect(c2.at.x).toBeCloseTo(6, 6);
    expect(c2.at.z).toBeCloseTo(4.5, 6);
  });

  it('mais le spot de la pièce d’à côté ne bouge pas d’un millimètre', () => {
    const roomId = poserLaPiece();
    const autre = useScanStore
      .getState()
      .addRoomRect({ x: 10, z: 10 }, { x: 13, z: 12 });
    useScanStore.setState({
      ceiling: [{ id: 'c1', kind: 'spot', roomId: autre!, at: { x: 11.5, z: 11 } }],
    });
    useScanStore.getState().resizeRoom(roomId, 6, 4);
    const c = useScanStore.getState().ceiling[0];
    expect(c.at.x).toBeCloseTo(11.5, 9);
    expect(c.at.z).toBeCloseTo(11, 9);
  });
});

describe('le redressage emporte le plafond avec la pièce', () => {
  it('un spot au centre reste au centre quand l’équerre recale un bord', () => {
    /*
      LE CAS EXACT DU RELEVÉ — et il a fallu le chercher. Une pièce SEULE,
      même de guingois, garde son centre au redressage : l'alignement
      moyenne les coins, et une moyenne préserve le milieu. Les deux
      premières versions de ce banc l'ont appris en passant sans rien
      prouver (pièce tournée d'un bloc, puis deux pièces à interstice — la
      soudure refuse d'ailleurs de souder entre pièces, c'est sa règle).

      Le décentrage vient des CHAÎNES : les groupes d'alignement se forment
      de proche en proche par les nœuds partagés. Un mur de couloir
      légèrement en pente, accroché au coin de la pièce, entre dans le même
      groupe que le mur du haut — et la moyenne du groupe tire tout le bord
      de plusieurs centimètres. La pièce se recale ; le spot posé pile au
      centre restait, lui, aux coordonnées du scan.
    */
    useScanStore.getState().reset();
    const coins = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
      { x: 0, z: 3 },
    ];
    const sejour: WallSeg[] = coins.map((a, i) => ({
      id: `m${i}`,
      type: 'wall',
      a,
      b: coins[(i + 1) % 4],
      height: 2.5,
      yCenter: 1.25,
      roomId: 'r1',
    }));
    // Le couloir du scan : accroché au coin (4,0), et 20 cm de faux niveau
    // sur 4 m — moins de trois degrés, l'équerre le prend en charge.
    const couloir: WallSeg = {
      id: 'c-mur',
      type: 'wall',
      a: { x: 4, z: 0 },
      b: { x: 8, z: 0.2 },
      height: 2.5,
      yCenter: 1.25,
      roomId: 'r2',
    };
    useScanStore.setState({
      walls: [...sejour, couloir],
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null, wallIds: sejour.map((w) => w.id) },
      ],
      ceiling: [{ id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 } }],
      openings: [],
      objects: [],
      fixtures: [],
      photos: [],
    });
    useScanStore.getState().straightenPlan();
    const st = useScanStore.getState();
    // La pièce du spot, APRÈS : celle qui le contient. Son centre est le
    // milieu de sa boîte — et le spot doit y être resté.
    const piece = st.rooms.find((r) => r.name.startsWith('Séjour'));
    expect(piece).toBeTruthy();
    const murs = st.walls.filter((w) => piece!.wallIds?.includes(w.id));
    expect(murs.length).toBeGreaterThanOrEqual(4);
    const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
    const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    // Le bord a bougé d'au moins deux centimètres : l'épreuve mesure bien
    // quelque chose.
    expect(Math.abs(cz - 1.5)).toBeGreaterThan(0.02);
    const spot = st.ceiling[0];
    expect(spot.at.x).toBeCloseTo(cx, 3);
    expect(spot.at.z).toBeCloseTo(cz, 3);
  });
});
