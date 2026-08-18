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
