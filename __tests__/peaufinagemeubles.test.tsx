/**
 * PEAUFINAGE MEUBLES — des gestes qui comprennent ce qu'on pose.
 *
 *   — un lit, une armoire, un canapé lâchés près d'un mur s'y adossent, sans
 *     se mettre devant une porte ; le lit évite le mur de la fenêtre ;
 *   — lâché au milieu d'une pièce relevée de biais, un meuble arrive
 *     d'aplomb avec ses murs ;
 *   — le quart de tour d'un meuble relevé de travers retombe sur les murs ;
 *   — la recherche du catalogue pardonne une faute de frappe et connaît les
 *     mots de tous les jours (« placard », « machine ») ;
 *   — un meuble relevé au scan se nomme à sa forme (« Armoire »,
 *     « Lit double », « Meuble bas ») au lieu de « Rangement » ;
 *   — le catalogue s'ouvre sur la famille de la pièce choisie.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData } from 'react-native-room-scan';
import type { WallSeg } from '../src/geometry/floorplan';
import { catalogItem, CATALOGUE, familleDeLaPiece } from '../src/geometry/catalogue';
import { nomDuMeuble } from '../src/geometry/furniture';
import { axeDeLaPiece, capSurLesMurs } from '../src/geometry/niche';
import { matchItem } from '../src/screens/result/FurnitureSheet';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
/** Une chambre de 4 × 4 m : fenêtre au nord (z = 0), porte au sud (z = 4). */
const chambre = (angle = 0) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = (x: number, z: number) => [x * c - z * s, x * s + z * c] as const;
  const m = (id: string, a: [number, number], b: [number, number]) => {
    const [ax, az] = r(...a);
    const [bx, bz] = r(...b);
    return mur(id, ax, az, bx, bz);
  };
  const walls = [m('n', [0, 0], [4, 0]), m('e', [4, 0], [4, 4]), m('s', [4, 4], [0, 4]), m('o', [0, 4], [0, 0])];
  const baie = (id: string, type: string, a: [number, number], b: [number, number], h: number, yc: number) => {
    const [ax, az] = r(...a);
    const [bx, bz] = r(...b);
    return { id, type, a: { x: ax, z: az }, b: { x: bx, z: bz }, height: h, yCenter: yc } as WallSeg;
  };
  useScanStore.setState({
    walls,
    rooms: [{ id: 'r1', name: 'Chambre', wallIds: walls.map((w) => w.id) }] as never,
    openings: [baie('fen', 'window', [1, 0], [3, 0], 1.2, 1.5), baie('porte', 'door', [1.2, 4], [2.1, 4], 2.04, 1.02)],
    objects: [],
    fixtures: [],
    ceiling: [],
    niveauCourant: 0,
  } as never);
};
const objet = (id: string) => st().objects.find((o) => o.id === id)!;
const cap = (o: ObjectData) => Math.atan2(o.transform[2], o.transform[0]);
/** La direction du dos (+z local) du meuble, en repère du plan. */
const dos = (o: ObjectData) => ({ x: o.transform[8], z: o.transform[10] });

describe('ce qui s’adosse, lâché près d’un mur, s’y adosse', () => {
  beforeEach(() => chambre());

  it('le lit lâché près du mur est vient tête au mur', () => {
    const id = st().addObject(catalogItem('lit140')!, 3.5, 2.2);
    const o = objet(id);
    // Le dos (la tête) regarde le mur est (+x), et le touche.
    expect(dos(o).x).toBeCloseTo(1, 6);
    expect(o.transform[12] + o.depth / 2).toBeCloseTo(4, 2);
  });

  it('le lit lâché dans l’angle nord-est préfère le mur sans fenêtre', () => {
    // Plus près du mur nord (fenêtre) que du mur est : il va quand même à l'est.
    const id = st().addObject(catalogItem('lit140')!, 3.2, 0.5);
    const o = objet(id);
    expect(dos(o).x).toBeCloseTo(1, 6);
  });

  it('l’armoire ne se met pas devant la porte', () => {
    // Lâchée devant la porte, contre le mur sud : pas d'adossement à ce mur-là.
    const id = st().addObject(catalogItem('armoire2p')!, 1.65, 3.5);
    const o = objet(id);
    // Elle reste où on l'a lâchée : rien ne la plaque contre la porte.
    expect(o.transform[14]).toBeCloseTo(3.5, 6);
    expect(o.transform[14] + o.depth / 2).toBeLessThan(3.99);
  });

  it('la table lâchée près d’un mur reste où on l’a mise', () => {
    const id = st().addObject(catalogItem('tableRepas')!, 2, 2.6);
    const o = objet(id);
    expect(o.transform[12]).toBeCloseTo(2, 6);
    expect(o.transform[14]).toBeCloseTo(2.6, 6);
  });

  it('lâché au milieu de la pièce, le lit ne court pas au mur', () => {
    const id = st().addObject(catalogItem('lit90')!, 2, 2);
    const o = objet(id);
    expect(o.transform[12]).toBeCloseTo(2, 6);
    expect(o.transform[14]).toBeCloseTo(2, 6);
  });
});

describe('d’aplomb avec ses murs', () => {
  it('une pièce relevée à 20° reçoit la table à 20°', () => {
    chambre((20 * Math.PI) / 180);
    expect(axeDeLaPiece(st().walls)).toBeCloseTo((20 * Math.PI) / 180, 6);
    const [cx, cz] = [2 * Math.cos(0.349) - 2 * Math.sin(0.349), 2 * Math.sin(0.349) + 2 * Math.cos(0.349)];
    const id = st().addObject(catalogItem('tableRepas')!, cx, cz);
    const a = cap(objet(id));
    const q = Math.PI / 2;
    const ecart = Math.abs(((a - (20 * Math.PI) / 180) % q + q) % q);
    expect(Math.min(ecart, q - ecart)).toBeLessThan(1e-6);
  });

  it('le quart de tour d’un meuble relevé de travers retombe sur les murs', () => {
    expect(capSurLesMurs((3 * Math.PI) / 180, 1, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(capSurLesMurs(Math.PI / 2, 1, 0)).toBeCloseTo(Math.PI, 9);
    chambre();
    const id = st().addObject(catalogItem('tableRepas')!, 2, 2);
    // Relevé de 3° de travers.
    useScanStore.setState({
      objects: st().objects.map((o) => {
        if (o.id !== id) return o;
        const t = [...o.transform];
        const a = (3 * Math.PI) / 180;
        t[0] = Math.cos(a);
        t[2] = Math.sin(a);
        t[8] = -Math.sin(a);
        t[10] = Math.cos(a);
        return { ...o, transform: t };
      }),
    });
    st().rotateObject(id, 1);
    expect(cap(objet(id))).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('la recherche du catalogue', () => {
  const trouve = (q: string) =>
    CATALOGUE.flatMap((f) => f.items.filter((i) => matchItem(i, q, f.name)).map((i) => i.key));
  it('pardonne une faute de frappe', () => {
    expect(trouve('armore')).toContain('armoire');
    expect(trouve('refrigirateur')).toContain('frigo');
    expect(trouve('bibliotheqe')).toContain('biblio');
  });
  it('connaît les mots de tous les jours', () => {
    expect(trouve('placard')).toContain('armoire');
    expect(trouve('machine')).toContain('ll');
    expect(trouve('matelas')).toContain('lit140');
  });
  it('sans trouver n’importe quoi', () => {
    expect(trouve('table')).not.toContain('tabouret');
    expect(trouve('douche')).not.toContain('doubleVasque');
  });
});

describe('le meuble relevé se nomme à sa forme', () => {
  const releve = (category: string, width: number, depth: number, height: number) => ({ category, width, depth, height });
  it('rangements, lits, canapés', () => {
    expect(nomDuMeuble(releve('storage', 1.2, 0.6, 2.0))).toBe('Armoire');
    expect(nomDuMeuble(releve('storage', 0.8, 0.3, 1.8))).toBe('Bibliothèque');
    expect(nomDuMeuble(releve('storage', 0.6, 0.6, 0.9), 'kitchen')).toBe('Meuble bas');
    expect(nomDuMeuble(releve('storage', 0.45, 0.4, 0.55), 'bedroom')).toBe('Chevet');
    expect(nomDuMeuble(releve('bed', 1.4, 2.0, 0.5))).toBe('Lit double');
    expect(nomDuMeuble(releve('bed', 0.9, 1.9, 0.5))).toBe('Lit simple');
    expect(nomDuMeuble({ ...releve('sofa', 2.6, 1.6, 0.8), attributes: ['SofaType:lShaped'] })).toBe('Canapé d’angle');
  });
  it('le nom donné et celui du catalogue restent', () => {
    expect(nomDuMeuble({ ...releve('storage', 1.2, 0.6, 2.0), nom: 'Placard de l’entrée' })).toBe('Placard de l’entrée');
    expect(nomDuMeuble({ ...releve('storage', 1.0, 0.58, 2.01), modele: 'armoire2p' })).toBe('Armoire 2 portes');
  });
  it('quand la forme ne tranche pas, la catégorie reste', () => {
    expect(nomDuMeuble(releve('storage', 0.5, 0.5, 0.4))).toBe('Rangement');
  });
});

describe('le catalogue s’ouvre sur la famille de la pièce', () => {
  it('lue au nom de la pièce', () => {
    expect(familleDeLaPiece('Chambre 2')).toBe('Chambre');
    expect(familleDeLaPiece('Séjour-cuisine')).toBe('Séjour');
    expect(familleDeLaPiece('Cuisine')).toBe('Cuisine');
    expect(familleDeLaPiece('Salle de bains')).toBe('Salle d’eau');
    expect(familleDeLaPiece('Pièce 3')).toBeNull();
    // Chaque famille rendue existe au catalogue.
    for (const n of ['Chambre', 'Séjour', 'Cuisine', 'Salle de bains', 'Bureau', 'Entrée', 'Balcon']) {
      const f = familleDeLaPiece(n);
      expect(CATALOGUE.some((c) => c.name === f)).toBe(true);
    }
  });
});
