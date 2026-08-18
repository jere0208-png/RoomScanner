/**
 * La silhouette 3D des meubles.
 *
 * Une boîte grise ne dit pas si on regarde un lit ou un frigo. On découpe
 * donc chaque meuble en quelques volumes — sommier, matelas, oreillers, tête
 * de lit — et ce test garde les deux propriétés qui comptent : la silhouette
 * RESTE dans l'emprise du meuble (sinon un lit déborderait du plan et
 * traverserait le mur contre lequel on vient de le plaquer), et chaque
 * catégorie du catalogue produit bien un volume.
 */
import { CATALOGUE } from '../src/geometry/catalogue';
import { furnitureParts } from '../src/geometry/furniture3d';
import { type WallSeg } from '../src/geometry/floorplan';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';

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

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

const PIECE: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 5),
  mur('s', 6, 5, 0, 5),
  mur('w', 0, 5, 0, 0),
];

const objet = (category: string, w: number, d: number, h: number) => ({
  id: 'o1',
  category,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, h / 2, 2.5, 1],
});

describe('chaque meuble a une silhouette, et elle tient dans son emprise', () => {
  const cats = [
    ...new Set(CATALOGUE.flatMap((f) => f.items.map((i) => i.category))),
  ];

  it('le catalogue couvre bien plusieurs familles', () => {
    expect(cats.length).toBeGreaterThan(5);
  });

  for (const cat of cats) {
    const parts = furnitureParts(cat);
    it(`${cat} : des volumes cohérents`, () => {
      for (const p of parts) {
        // Jamais retourné, jamais plat.
        expect(p.x1).toBeGreaterThan(p.x0);
        expect(p.y1).toBeGreaterThan(p.y0);
        expect(p.z1).toBeGreaterThan(p.z0);
        // Dans l'emprise au sol, à trois centimètres près pour les poignées
        // et les façades, qui débordent en avant du caisson.
        expect(p.x0).toBeGreaterThanOrEqual(-0.05);
        expect(p.x1).toBeLessThanOrEqual(1.05);
        expect(p.z0).toBeGreaterThanOrEqual(-0.05);
        expect(p.z1).toBeLessThanOrEqual(1.05);
        // Rien sous le sol. Au-dessus, un robinet a le droit de dépasser.
        expect(p.y0).toBeGreaterThanOrEqual(0);
        expect(p.y1).toBeLessThanOrEqual(1.8);
      }
    });
  }

  it('un lit se lit comme un lit : sommier, matelas, oreillers, tête', () => {
    const parts = furnitureParts('bed');
    expect(parts.length).toBeGreaterThanOrEqual(5);
    // La tête de lit monte plus haut que le matelas, et se tient au fond.
    const tete = parts.find((p) => p.z0 > 0.9)!;
    expect(tete).toBeTruthy();
    // Elle dépasse la hauteur du couchage : c'est ce qui la fait lire.
    expect(tete.y1).toBeGreaterThan(1.2);
    const matelas = parts.find((p) => p.tone === 'soft' && p.z1 > 0.8)!;
    expect(matelas.y1).toBeLessThan(tete.y1);
  });

  it('une table est un plateau sur quatre pieds', () => {
    const parts = furnitureParts('table');
    expect(parts).toHaveLength(5);
    expect(parts.filter((p) => p.tone === 'dark')).toHaveLength(4);
  });

  it('ce qu’on ne sait pas nommer reste une boîte', () => {
    // L'escalier a désormais ses marches : la boîte témoin, c'est ce que le
    // scanner n'a pas su nommer. Un parallélépipède de deux mètres au milieu
    // d'un séjour ne ressemblait à rien, et le client ne le reconnaissait pas.
    expect(furnitureParts('stairs').length).toBeGreaterThan(6);
    expect(furnitureParts('chose inconnue')).toHaveLength(0);
    expect(furnitureParts('')).toHaveLength(0);
  });
});

describe('dans la scène, la silhouette remplace la boîte', () => {
  const scene = (category: string) =>
    buildScene(PIECE, [], [objet(category, 1.4, 1.9, 0.5)], { palette: PAL });

  it('un lit produit plus de faces qu’une boîte pleine', () => {
    const boite = scene('chose inconnue').faces.length;
    const lit = scene('bed').faces.length;
    expect(lit).toBeGreaterThan(boite + 8);
  });

  it('et il ne sort pas de son emprise', () => {
    const nu = buildScene(PIECE, [], [], { palette: PAL });
    const avec = scene('bed');
    // L'ombre portée déborde volontairement l'emprise : elle n'est pas le
    // meuble, elle est sa trace au sol. On la met de côté ici, elle a son
    // propre test.
    const ajoutees = avec.faces
      .slice(nu.faces.length)
      .filter((f) => !f.isFloor);
    expect(ajoutees.length).toBeGreaterThan(0);
    for (const f of ajoutees) {
      for (const p of f.pts) {
        expect(p.x).toBeGreaterThanOrEqual(3 - 0.7 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(3 + 0.7 + 1e-6);
        expect(p.z).toBeGreaterThanOrEqual(2.5 - 0.95 - 1e-6);
        expect(p.z).toBeLessThanOrEqual(2.5 + 0.95 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(0.5 * 1.6 + 1e-6);
      }
    }
  });

  it('un meuble posé au sol porte son ombre, et elle le déborde', () => {
    const nu = buildScene(PIECE, [], [], { palette: PAL });
    const avec = buildScene(PIECE, [], [objet('bed', 1.4, 1.9, 0.5)], {
      palette: PAL,
    });
    const ombres = avec.faces
      .slice(nu.faces.length)
      .filter((f) => f.isFloor);
    // Deux nappes concentriques, au ras du sol.
    expect(ombres).toHaveLength(2);
    for (const o of ombres) {
      expect(o.pts.every((p) => p.y === 0)).toBe(true);
      expect(o.stroke).toBeNull();
    }
    const large = ombres[0].pts.map((p) => p.x);
    const serre = ombres[1].pts.map((p) => p.x);
    const etale = (v: number[]) => Math.max(...v) - Math.min(...v);
    // La plus large déborde le meuble ; la plus serrée le suit de près.
    expect(etale(large)).toBeGreaterThan(1.4);
    expect(etale(large)).toBeGreaterThan(etale(serre));
    expect(etale(serre)).toBeLessThan(1.5);
    // Elles s'assombrissent vers le centre, sinon la trace paraît plate.
    expect(ombres[1].fill).not.toBe(ombres[0].fill);
  });

  it('ce qui ne touche pas le sol n’a pas d’ombre', () => {
    const nu = buildScene(PIECE, [], [], { palette: PAL });
    // Une télé accrochée à 1,20 m : une ombre à ses pieds désignerait un
    // objet qui n'est pas là.
    const murale = {
      id: 'tv',
      category: 'television',
      width: 1.1,
      depth: 0.1,
      height: 0.65,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 1.2, 2.5, 1],
    };
    const avec = buildScene(PIECE, [], [murale], { palette: PAL });
    expect(
      avec.faces.slice(nu.faces.length).filter((f) => f.isFloor),
    ).toHaveLength(0);
  });

  it('sans sol affiché, pas d’ombre non plus', () => {
    const nu = buildScene(PIECE, [], [], { palette: PAL, showSurfaces: false });
    const avec = buildScene(PIECE, [], [objet('bed', 1.4, 1.9, 0.5)], {
      palette: PAL,
      showSurfaces: false,
    });
    expect(
      avec.faces.slice(nu.faces.length).filter((f) => f.isFloor),
    ).toHaveLength(0);
  });

  it('la silhouette RESTE pendant un geste', () => {
    // Voir le lit se changer en caisse dès qu'on tourne la pièce, puis
    // redevenir un lit au relâcher, est pire que tout : le mode allégé
    // découpe moins finement, mais il ne touche plus au MOBILIER.
    const compte = (cat: string, coarse: boolean) =>
      buildScene(PIECE, [], [objet(cat, 1.4, 1.9, 0.5)], { palette: PAL, coarse })
        .faces.length -
      buildScene(PIECE, [], [], { palette: PAL, coarse }).faces.length;
    expect(compte('bed', true)).toBeGreaterThan(compte('chose inconnue', true) + 8);
    expect(compte('bed', false)).toBeGreaterThan(compte('chose inconnue', false) + 8);
  });});
