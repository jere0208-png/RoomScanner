/**
 * AJOUTER UNE PIÈCE, sans effacer ce qu'on a déjà relevé.
 *
 * Un logement ne se relève pas d'un trait : on scanne le séjour, on est
 * appelé ailleurs, on revient pour la chambre. La seule porte de sortie
 * était « Nouveau scan » — qui efface tout. C'est le reproche fait à l'app
 * en la comparant à sa concurrente, dont le menu « Ajouter une pièce »
 * propose justement un modèle rectangulaire à ajuster ensuite.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import { roomParts, segLength } from '../src/geometry/floorplan';
import { SNAPSHOT_WALLS } from '../src/export/snapshotFixture';

describe('ajouter une pièce au plan', () => {
  beforeEach(() => {
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      ceiling: [],
    });
  });

  it('pose quatre murs aux cotes demandées, sans toucher aux autres', () => {
    const avant = useScanStore.getState().walls.length;
    const id = useScanStore.getState().addRoomBox(3.4, 3, 'Chambre');
    const st = useScanStore.getState();
    expect(st.walls).toHaveLength(avant + 4);
    // Les murs d'origine sont intacts : on AJOUTE, on ne refait pas.
    expect(st.walls.slice(0, avant)).toEqual(SNAPSHOT_WALLS);
    const neufs = st.walls.slice(avant);
    const cotes = neufs.map((w) => Math.round(segLength(w) * 100) / 100).sort();
    expect(cotes).toEqual([3, 3, 3.4, 3.4]);
    // Et la pièce existe, nommée, avec ses quatre murs.
    const piece = st.rooms.find((r) => r.id === id);
    expect(piece?.name).toBe('Chambre');
    expect(piece?.wallIds).toHaveLength(4);
  });

  /**
   * ELLE SE POSE À CÔTÉ, jamais par-dessus.
   *
   * Au centre, elle recouvrirait le plan et on la croirait fondue dedans ;
   * au hasard, on la chercherait. Collée au bord droit avec un jeu, elle se
   * voit d'emblée et se pousse ensuite où l'on veut.
   */
  it('se pose à côté du plan existant, pas dessus', () => {
    const droiteAvant = Math.max(
      ...SNAPSHOT_WALLS.flatMap((w) => [w.a.x, w.b.x]),
    );
    useScanStore.getState().addRoomBox(3, 3, 'Chambre');
    const neufs = useScanStore.getState().walls.slice(SNAPSHOT_WALLS.length);
    const gaucheNeuve = Math.min(...neufs.flatMap((w) => [w.a.x, w.b.x]));
    expect(gaucheNeuve).toBeGreaterThan(droiteAvant);
  });

  it('et le plan la reconnaît comme une pièce à part entière', () => {
    const id = useScanStore.getState().addRoomBox(3.4, 3, 'Chambre');
    const st = useScanStore.getState();
    const parts = roomParts(st.walls, st.rooms);
    const part = parts.find((p) => p.roomId === id);
    expect(part).toBeDefined();
    // Son contour est fermé : c'est ce qui lui donne une surface au sol.
    expect(part!.surface?.pts.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(part!.surface?.area ?? 0).toBeCloseTo(3.4 * 3, 1);
  });

  it('reprend la hauteur sous plafond du logement', () => {
    useScanStore.setState({
      walls: SNAPSHOT_WALLS.map((w) => ({ ...w, height: 2.35, yCenter: 1.175 })),
    });
    useScanStore.getState().addRoomBox(3, 3, 'Chambre');
    const neufs = useScanStore.getState().walls.slice(SNAPSHOT_WALLS.length);
    for (const w of neufs) expect(w.height).toBeCloseTo(2.35, 6);
  });

  /** Un plan vide : la première pièce se pose à l'origine, sans erreur. */
  it('sait poser la toute première pièce d’un plan vide', () => {
    useScanStore.setState({ walls: [], rooms: [] });
    const id = useScanStore.getState().addRoomBox(4, 3, 'Séjour');
    const st = useScanStore.getState();
    expect(st.walls).toHaveLength(4);
    expect(st.rooms.find((r) => r.id === id)?.name).toBe('Séjour');
  });
});

/**
 * ACCOLER UNE PIÈCE À UN MUR — c'est ainsi qu'on bâtit un appartement.
 *
 * Le relevé du chantier : « la pièce se place à un endroit et impossible de
 * lier les murs à une pièce existante ». Une pièce posée à côté du plan ne
 * fait pas un logement : il faut qu'elle PARTAGE sa cloison avec la pièce
 * d'à côté, comme dans un vrai appartement — une seule maçonnerie entre
 * deux pièces, cotée une fois, équipée des deux côtés.
 */
describe('accoler une pièce à un mur existant', () => {
  /** Un séjour carré, quatre murs, pour y accoler la suite. */
  const CARRE = [
    { id: 'n', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } },
    { id: 'e', a: { x: 4, z: 0 }, b: { x: 4, z: 4 } },
    { id: 's', a: { x: 4, z: 4 }, b: { x: 0, z: 4 } },
    { id: 'o', a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
  ].map((w) => ({
    ...w,
    type: 'wall' as const,
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  }));

  beforeEach(() => {
    useScanStore.setState({
      walls: CARRE,
      openings: [],
      objects: [],
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null, wallIds: CARRE.map((w) => w.id) },
      ],
      fixtures: [],
      ceiling: [],
    });
  });

  it('partage le mur choisi entre les deux pièces', () => {
    const id = useScanStore.getState().addRoomBox(3, 3, 'Chambre', 'n');
    const st = useScanStore.getState();
    // Trois murs de plus, pas quatre : le mitoyen est celui qui existait.
    expect(st.walls).toHaveLength(CARRE.length + 3);
    const neuve = st.rooms.find((r) => r.id === id)!;
    expect(neuve.wallIds).toHaveLength(4);
    expect(neuve.wallIds).toContain('n');
    // Et l'ancienne pièce le garde : la cloison appartient aux deux.
    expect(st.rooms.find((r) => r.id === 'r1')!.wallIds).toContain('n');
  });

  /**
   * ET ELLE SE POSE DE L'AUTRE CÔTÉ, jamais par-dessus.
   *
   * Le séjour occupe z de 0 à 4 ; accolée au mur nord (z = 0), la chambre
   * doit s'étendre vers les z NÉGATIFS.
   */
  it('se pose du côté libre du mur, hors de la pièce existante', () => {
    useScanStore.getState().addRoomBox(3, 3, 'Chambre', 'n');
    const neufs = useScanStore.getState().walls.slice(CARRE.length);
    const zs = neufs.flatMap((w) => [w.a.z, w.b.z]);
    expect(Math.min(...zs)).toBeLessThan(-2.9);
    expect(Math.max(...zs)).toBeLessThanOrEqual(0.001);
  });

  it('en prend la longueur, et la profondeur demandée', () => {
    const id = useScanStore.getState().addRoomBox(3, 2.5, 'Chambre', 'n');
    const st = useScanStore.getState();
    const part = roomParts(st.walls, st.rooms).find((p) => p.roomId === id);
    // 4 m de long (le mur) × 2,50 m de profond.
    expect(part!.surface?.area ?? 0).toBeCloseTo(4 * 2.5, 1);
  });

  it('et retombe à côté du plan quand aucun mur n’est choisi', () => {
    const id = useScanStore.getState().addRoomBox(3, 3, 'Chambre', null);
    const st = useScanStore.getState();
    expect(st.walls).toHaveLength(CARRE.length + 4);
    expect(st.rooms.find((r) => r.id === id)!.wallIds).toHaveLength(4);
  });
});

/**
 * DÉPLACER UNE PIÈCE, ET LA COLLER À SA VOISINE.
 *
 * Poser une pièce à côté du plan ne suffit pas : il faut la pousser contre
 * celle qui la jouxte, et qu'elle s'y cale exactement. Viser au centimètre
 * avec le doigt est impossible — c'est l'aimant qui fait le travail, comme
 * dans tous les logiciels de plan.
 */
describe('déplacer une pièce', () => {
  const CARRE = [
    { id: 'n', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } },
    { id: 'e', a: { x: 4, z: 0 }, b: { x: 4, z: 4 } },
    { id: 's', a: { x: 4, z: 4 }, b: { x: 0, z: 4 } },
    { id: 'o', a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
  ].map((w) => ({
    ...w,
    type: 'wall' as const,
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  }));

  beforeEach(() => {
    useScanStore.setState({
      walls: CARRE,
      openings: [],
      objects: [],
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null, wallIds: CARRE.map((w) => w.id) },
      ],
      fixtures: [],
      ceiling: [],
    });
  });

  /** La pièce ajoutée à côté, à déplacer. */
  const ajoutee = () => useScanStore.getState().addRoomBox(3, 3, 'Chambre', null);

  it('translate tous ses murs, et rien d’autre', () => {
    const id = ajoutee();
    const avant = useScanStore.getState().walls;
    const siens = new Set(
      useScanStore.getState().rooms.find((r) => r.id === id)!.wallIds!,
    );
    useScanStore.getState().moveRoom(id, 1, 0.6);
    const apres = useScanStore.getState().walls;
    for (let i = 0; i < avant.length; i++) {
      if (siens.has(avant[i].id)) {
        expect(apres[i].a.x).toBeCloseTo(avant[i].a.x + 1, 6);
        expect(apres[i].a.z).toBeCloseTo(avant[i].a.z + 0.6, 6);
      } else {
        // Le séjour n'a pas bougé d'un millimètre.
        expect(apres[i]).toEqual(avant[i]);
      }
    }
  });

  it('s’aimante au mur voisin quand elle en approche', () => {
    const id = ajoutee();
    const st = () => useScanStore.getState();
    const siens = () => new Set(st().rooms.find((r) => r.id === id)!.wallIds!);
    // Elle est posée à 0,50 m à droite du séjour (x = 4,5). On la pousse
    // de 40 cm vers la gauche : il reste 10 cm — l'aimant les rattrape.
    useScanStore.getState().moveRoom(id, -0.4, 0);
    const gauche = Math.min(
      ...st()
        .walls.filter((w) => siens().has(w.id))
        .flatMap((w) => [w.a.x, w.b.x]),
    );
    expect(`bord gauche ${gauche.toFixed(3)}`).toBe('bord gauche 4.000');
  });

  it('emmène ses meubles et ses points lumineux avec elle', () => {
    const id = ajoutee();
    useScanStore.setState({
      objects: [
        {
          id: 'o1',
          category: 'storage',
          width: 1,
          depth: 0.5,
          height: 1.8,
          roomId: id,
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0.9, 1, 1],
        } as never,
      ],
      ceiling: [{ id: 'cl1', kind: 'dcl', roomId: id, at: { x: 5, z: 1 } }],
    });
    useScanStore.getState().moveRoom(id, 0, 2);
    const st = useScanStore.getState();
    expect(st.objects[0].transform[14]).toBeCloseTo(3, 6);
    expect(st.ceiling[0].at.z).toBeCloseTo(3, 6);
  });

  /**
   * MAIS UNE PIÈCE ACCOLÉE NE BOUGE PAS.
   *
   * Elle partage sa cloison avec sa voisine : la déplacer déchirerait le
   * plan — un mur ne peut pas être à deux endroits. Elle est déjà à sa
   * place, par construction.
   */
  it('refuse de déplacer une pièce qui partage un mur', () => {
    const id = useScanStore.getState().addRoomBox(3, 3, 'Chambre', 'n');
    const avant = useScanStore.getState().walls;
    useScanStore.getState().moveRoom(id, 1, 1);
    expect(useScanStore.getState().walls).toEqual(avant);
  });
});

/**
 * ET QUAND ELLE ARRIVE AU CONTACT, ÇA SOUDE.
 *
 * L'aimant colle la pièce contre sa voisine — et laisse deux maçonneries au
 * même endroit, l'une à chacune. Sur le dessin ça ne se voit pas ; dans le
 * métré, si : la cloison est comptée deux fois, et le dossier ment d'un mur.
 */
describe('la soudure au contact', () => {
  const CARRE = [
    { id: 'n', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } },
    { id: 'e', a: { x: 4, z: 0 }, b: { x: 4, z: 4 } },
    { id: 's', a: { x: 4, z: 4 }, b: { x: 0, z: 4 } },
    { id: 'o', a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
  ].map((w) => ({
    ...w,
    type: 'wall' as const,
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  }));

  beforeEach(() => {
    useScanStore.setState({
      walls: CARRE,
      openings: [],
      objects: [],
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null, wallIds: CARRE.map((w) => w.id) },
      ],
      fixtures: [],
      ceiling: [],
    });
  });

  it('fond les deux murs superposés en un seul, partagé', () => {
    /**
     * LA SOUDURE DEMANDE DEUX MURS IDENTIQUES.
     *
     * Ici la chambre fait 4 m de profond comme le séjour : poussée contre
     * lui, son mur gauche tombe EXACTEMENT sur le mur est — mêmes deux
     * bouts. C'est la seule superposition qu'on ose fondre sans rien
     * inventer ; deux murs de longueurs différentes se contentent de
     * s'aligner, et il faudrait les découper pour les souder.
     */
    const id = useScanStore.getState().addRoomBox(4, 4, 'Chambre', null);
    const avant = useScanStore.getState().walls.length;
    useScanStore.getState().moveRoom(id, -0.4, 0);
    const st = useScanStore.getState();
    // Un mur de moins qu'avant le déplacement : les deux n'en font qu'un.
    expect(`${st.walls.length} murs`).toBe(`${avant - 1} murs`);
    // Et la cloison appartient bien aux deux pièces.
    const chambre = st.rooms.find((r) => r.id === id)!;
    expect(chambre.wallIds).toContain('e');
    expect(st.rooms.find((r) => r.id === 'r1')!.wallIds).toContain('e');
  });

  it('et l’appareillage du mur soudé reste posé dessus', () => {
    const id = useScanStore.getState().addRoomBox(4, 3, 'Chambre', null);
    const sien = useScanStore.getState().rooms.find((r) => r.id === id)!
      .wallIds![3];
    useScanStore.setState({
      fixtures: [
        { id: 'f1', kind: 'prise', wallId: sien, along: 1, height: 0.25, side: 1 },
      ],
    });
    useScanStore.getState().moveRoom(id, -0.4, 0);
    const st = useScanStore.getState();
    // La prise a suivi la maçonnerie conservée, elle n'est pas orpheline.
    expect(st.walls.some((w) => w.id === st.fixtures[0].wallId)).toBe(true);
  });

  it('mais ne soude rien quand les murs ne se recouvrent pas', () => {
    const id = useScanStore.getState().addRoomBox(2, 2, 'WC', null);
    const avant = useScanStore.getState().walls.length;
    // On l'éloigne : aucun mur ne tombe sur un autre.
    useScanStore.getState().moveRoom(id, 3, 3);
    expect(useScanStore.getState().walls).toHaveLength(avant);
  });
});
