/**
 * LA VISITE INTÉRIEURE — le banc d'épreuve de ce qu'on ne peut pas voir.
 *
 * Une vue à la première personne se juge sur trois choses, et aucune ne se
 * vérifie à l'œil sur une capture d'écran :
 *
 *   — on ne traverse pas les murs, jamais, même en poussant en biais ;
 *   — on franchit les portes, sinon la visite s'arrête à la première ;
 *   — ce qui passe DERRIÈRE la tête ne revient pas devant, retourné.
 *
 * Ce dernier point est le piège classique d'une projection en perspective :
 * un point derrière l'œil a une profondeur négative, et sa division le
 * renvoie de l'autre côté de l'écran. Un mur entier s'y retourne et barre
 * la vue d'un aplat blanc. On découpe donc au plan proche — et on le
 * vérifie ici.
 */
import {
  HAUTEUR_OEIL,
  clipNear,
  departVisite,
  obstaclesOf,
  step,
  toCamera,
  walkFaces,
  type WalkCam,
} from '../src/geometry/walk';
import { buildScene } from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';

const PAL = {
  floor: '#EEE',
  floorStroke: '#CCC',
  wall: '#FFF',
  wallStroke: '#888',
  wallTop: '#F4F7FB',
  wallTopStroke: '#94A0B4',
  opening: '#B9C2CE',
  door: '#E0A030',
  window: '#40A0E0',
  passage: '#2F6FF0',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Deux pièces séparées par une cloison percée d'une porte. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 8),
  mur('s', 6, 8, 0, 8),
  mur('o', 0, 8, 0, 0),
  mur('cloison', 0, 4, 6, 4),
];

const PORTE: WallSeg = {
  id: 'p1',
  type: 'door',
  a: { x: 2.6, z: 4 },
  b: { x: 3.5, z: 4 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
};

const OBST = obstaclesOf(MURS, [PORTE]);

describe('marcher dans le modèle', () => {
  it('ne traverse pas une cloison, quel que soit l’angle d’attaque', () => {
    for (let a = 0; a < 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      const depart = { x: 3, z: 2 };
      // Un pas d'un mètre, dans toutes les directions, cent fois de suite.
      // Un mètre par image, c'est absurde pour un visiteur — et c'est
      // précisément ce qu'il faut éprouver : une image perdue, un doigt
      // qui balaie vite, et le pas devient un saut.
      let p = depart;
      for (let i = 0; i < 100; i++) {
        const q = step(OBST, p, {
          x: p.x + Math.cos(rad),
          z: p.z + Math.sin(rad),
        });
        // LA CLOISON NE SE FRANCHIT QUE PAR LA PORTE. On surveille chaque
        // TRAVERSÉE, pas la position finale : une fois passé le seuil, on
        // continue sa route, et l'arrivée ne dit plus par où l'on est
        // entré.
        if (p.z < 4 !== q.z < 4) {
          const x = (p.x + q.x) / 2;
          expect(`${a}° : franchi en x=${x.toFixed(2)}`).toBe(
            `${a}° : franchi en x=${Math.min(Math.max(x, 2.4), 3.7).toFixed(2)}`,
          );
        }
        p = q;
        // Et jamais hors du logement, à aucun moment.
        expect(p.x).toBeGreaterThan(-0.01);
        expect(p.x).toBeLessThan(6.01);
        expect(p.z).toBeGreaterThan(-0.01);
        expect(p.z).toBeLessThan(8.01);
      }
    }
  });

  it('franchit la porte quand on se présente devant', () => {
    let p = { x: 3.05, z: 2 };
    for (let i = 0; i < 40; i++) p = step(OBST, p, { x: p.x, z: p.z + 0.15 });
    expect(`de l’autre côté : ${p.z > 4.3}`).toBe('de l’autre côté : true');
  });

  it('glisse le long d’un mur au lieu de s’y coller', () => {
    // On pousse en biais contre le mur du fond : on doit AVANCER en x.
    let p = { x: 1, z: 0.5 };
    for (let i = 0; i < 20; i++) {
      p = step(OBST, p, { x: p.x + 0.2, z: p.z - 0.2 });
    }
    expect(p.x).toBeGreaterThan(3);
    expect(p.z).toBeGreaterThan(0.1);
  });

  it('n’attend pas d’être poussé pour rester dedans, même sans porte', () => {
    const sansPorte = obstaclesOf(MURS, []);
    let p = { x: 3, z: 2 };
    for (let i = 0; i < 60; i++) p = step(sansPorte, p, { x: p.x, z: p.z + 0.2 });
    expect(p.z).toBeLessThan(4);
  });

  it('démarre au point le plus dégagé, jamais dans une cloison', () => {
    const p = departVisite(OBST, { x0: 0, x1: 6, z0: 0, z1: 8 });
    // Le plus dégagé, c'est le milieu d'une des deux pièces.
    const distanceAuMur = Math.min(p.x, 6 - p.x, Math.abs(p.z - 4), p.z, 8 - p.z);
    expect(distanceAuMur).toBeGreaterThan(1);
  });
});

describe('voir depuis l’intérieur', () => {
  const cam: WalkCam = {
    x: 3,
    z: 2,
    y: HAUTEUR_OEIL,
    yaw: 0,
    pitch: 0,
  };

  it('met devant soi ce qui est devant, et derrière ce qui est derrière', () => {
    // Cap 0 = vers les z négatifs : le mur du fond est devant.
    const devant = toCamera(cam, { x: 3, y: 1, z: 0 });
    expect(devant.z).toBeGreaterThan(0);
    const derriere = toCamera(cam, { x: 3, y: 1, z: 6 });
    expect(derriere.z).toBeLessThan(0);
    // Ce qui est à droite du regard a une abscisse positive.
    const droite = toCamera(cam, { x: 5, y: 1, z: 2 });
    expect(droite.x).toBeGreaterThan(0);
  });

  /**
   * LE PIÈGE DE LA PERSPECTIVE.
   *
   * Un mur à cheval sur le plan de l'œil a des points devant et derrière.
   * Sans découpe, les seconds se projettent à l'envers et le polygone
   * balaie tout l'écran. La découpe doit ramener le tout devant.
   */
  it('découpe au plan proche ce qui passe derrière la tête', () => {
    const quad = [
      { x: -1, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 0, z: -2 },
      { x: -1, y: 0, z: -2 },
    ];
    const clip = clipNear(quad);
    expect(clip.length).toBeGreaterThanOrEqual(3);
    for (const p of clip) expect(p.z).toBeGreaterThanOrEqual(0.079);
    // Entièrement derrière : plus rien.
    expect(
      clipNear([
        { x: -1, y: 0, z: -1 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 1, z: -2 },
      ]),
    ).toHaveLength(0);
  });

  it('montre la pièce, et rien d’aberrant, depuis n’importe où', () => {
    const { faces } = buildScene(MURS, [PORTE], [], {
      palette: PAL,
      showSurfaces: true,
    });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const c: WalkCam = {
        x: 3 + Math.cos(angle),
        z: 2 + Math.sin(angle),
        y: HAUTEUR_OEIL,
        yaw: angle,
        pitch: -0.1,
      };
      const vues = walkFaces(faces, c, 390, 700);
      expect(vues.length).toBeGreaterThan(0);
      for (const f of vues) {
        for (const p of f.pts) {
          expect(Number.isFinite(p.sx)).toBe(true);
          expect(Number.isFinite(p.sy)).toBe(true);
          // Un point projeté à mille écrans de distance trahit une division
          // par une profondeur presque nulle : la découpe l'aurait laissé
          // passer.
          expect(Math.abs(p.sx)).toBeLessThan(200000);
          expect(Math.abs(p.sy)).toBeLessThan(200000);
        }
      }
    }
  });

  it('peint du plus loin au plus près', () => {
    const { faces } = buildScene(MURS, [PORTE], [], { palette: PAL });
    const vues = walkFaces(faces, cam, 390, 700);
    for (let i = 1; i < vues.length; i++) {
      expect(vues[i - 1].depth).toBeGreaterThanOrEqual(vues[i].depth - 1e-9);
    }
  });
});
