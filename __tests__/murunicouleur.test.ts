/**
 * UN MUR EN COULEUR EST D'UNE SEULE COULEUR.
 *
 * Relevé du patron, troisième passage sur le même sujet : « il y a des
 * bandes sur les murs en couleur, tout doit être uni ».
 *
 * Les deux premiers avaient corrigé la MATIÈRE — le relevé rendait des cases
 * bariolées, et `sampleTexture` les a ramenées à une teinte dont on ne
 * s'écarte que pour un vrai pan d'accent (voir `couleursunies`). Restait la
 * DÉCOUPE : un mur se dessine en bandes — c'est elle qui permet au tri du
 * peintre de départager un mur long d'un meuble posé devant sa moitié
 * proche — et chaque bande allait chercher SA teinte dans la texture. Quatre
 * rangées par mur, une nuance par rangée : des bandes horizontales, sur un
 * mur que le relevé donne pourtant uni à deux unités près.
 *
 * On garde la découpe, qui sert au tri, et on lui retire sa palette : toutes
 * les bandes d'un même pan prennent la MOYENNE relevée du mur. Un mur vert
 * sort vert, un mur blanc sort blanc, et aucun des deux ne sort rayé.
 *
 * Ce que ça coûte, et qui est assumé : un mur peint en deux couleurs — le
 * bas lambrissé, le haut clair — sort d'une seule teinte, la moyenne des
 * deux. Le relevé du patron dit « tout doit être uni » ; c'est la réponse.
 */
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { couleurAuPic } from '../src/geometry/appearance';
import type { WallSeg } from '../src/geometry/floorplan';
import type { SurfaceTexture } from 'react-native-room-scan';

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

/**
 * Une texture de mur telle que le scan la rend : quatre rangées, huit
 * colonnes, et des nuances de vert qui bougent d'une case à l'autre —
 * l'ordinaire d'un relevé fait en marchant, l'exposition de la caméra
 * changeant d'une seconde à l'autre.
 */
const NUANCES: SurfaceTexture = {
  cols: 8,
  rows: 4,
  texels: Array.from({ length: 32 }, (_, i) => {
    const v = 60 + ((i * 7) % 40);
    return `#${(v - 20).toString(16).padStart(2, '0')}${v
      .toString(16)
      .padStart(2, '0')}${(v - 30).toString(16).padStart(2, '0')}`;
  }),
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

const MURS: WallSeg[] = [
  { ...mur('n', 0, 0, 5, 0), color: '#3E5A32', texture: NUANCES },
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
] as WallSeg[];

/** Les aplats d'un mur : ses bandes, sans ses arêtes ni son chant. */
const aplats = (id: string) => {
  const { faces } = buildScene(MURS, [], [], {
    palette: PAL,
    showSurfaces: true,
    showTextures: true,
    rooms: [{ id: 'r1' }],
  });
  return faces.filter(
    (f) =>
      f.wallId === id &&
      f.pts.length >= 3 &&
      !f.dashed &&
      !!f.fill &&
      // On juge les PANS, pas le chant : le dessus d'un mur se dessine
      // volontairement plus clair, c'est ce qui donne son epaisseur.
      Math.abs(f.normal?.y ?? 0) < 0.5,
  );
};

describe('un mur relevé en couleur', () => {
  it('se dessine bien en plusieurs bandes — le tri en a besoin', () => {
    // On ne supprime pas la découpe : c'est elle qui empêche un mur long de
    // passer devant un meuble posé devant sa moitié proche.
    expect(aplats('n').length).toBeGreaterThan(2);
  });

  it('mais toutes ses bandes portent la MÊME teinte', () => {
    const teintes = new Set(aplats('n').map((f) => f.fill));
    expect([...teintes]).toHaveLength(1);
  });

  it('et cette teinte est celle du scan — À SON PIC', () => {
    /*
      DOCTRINE RÉVISÉE — relevé du patron : « les murs aussi doivent avoir
      la même couleur au pic de luminosité du scan ». La moyenne relevée
      tirait vers l'ombre ; le mur porte désormais la teinte du quart le
      plus lumineux de son relevé (`couleurAuPic`), la même règle que le
      sol. Uni, toujours — une seule teinte sur tout le pan.
    */
    const pans = aplats('n');
    expect(pans.length).toBeGreaterThan(0);
    const attendu = couleurAuPic(NUANCES, '#3E5A32');
    for (const f of pans) {
      expect(f.fill).toBe(attendu);
    }
  });

  it('un mur sans couleur relevée reste au blanc du dessin', () => {
    const teintes = new Set(aplats('e').map((f) => f.fill));
    expect([...teintes]).toHaveLength(1);
    expect(aplats('e')[0].fill).toBe(PAL.wall);
  });
});
