/**
 * DESSINER UN PLAN DE BOUT EN BOUT, sans scanner.
 *
 * Les epreuves de ce projet verifient chacune UN geste. Celle-ci verifie
 * qu'ils s'enchainent : c'est la seule maniere de trouver les jointures qui
 * cedent — un identifiant qui change de forme entre deux actions, un
 * reglage qu'une action voisine ecrase, un plan qui se rouvre ampute.
 *
 * On refait le parcours d'un electricien qui n'a pas de scanner : deux
 * pieces posees au clavier, accolees, une porte entre elles qu'on place a
 * la cote et qu'on ouvre du bon cote, une remarque pour le poseur, une
 * correction de cotes au metre, puis on enregistre, on quitte, on rouvre.
 *
 * CE QUI EST ROUVERT DOIT ETRE CE QU'ON A LAISSE. C'est le seul defaut de
 * cette application qui « coute un deplacement » : tout le reste se
 * rattrape a l'ecran.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { roomExtent, roomParts } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('le parcours complet d’un plan dessine', () => {
  it('tient d’un bout a l’autre, et se rouvre intact', () => {
    // 1. On part d'un plan vierge.
    st().commencerAuClavier();
    expect(st().walls).toHaveLength(0);

    // 2. Deux pieces au clavier.
    st().addRoomBox(5, 4, 'Sejour');
    st().addRoomBox(3, 3, 'Chambre');
    expect(st().rooms).toHaveLength(2);
    /*
      SEPT MURS, PAS HUIT — et c'est voulu.

      La seconde piece s'accole au mur exterieur le plus long et le PARTAGE :
      cette cloison figure dans les listes des deux pieces, une seule
      maconnerie entre elles, cotee une fois, equipee des deux cotes. Le
      banc attendait huit murs, c'est-a-dire deux logements poses cote a
      cote sans rien de commun — precisement ce que l'application a cesse de
      faire, parce que « fusionner » n'avait alors plus rien a reunir.

      Consequence a connaitre : la piece prend la LONGUEUR du mur d'appui,
      pas celle du modele. Une « chambre 3 x 3 » posee contre un sejour de
      cinq metres sort en 5 x 3 ; seule sa profondeur est celle qu'on a
      choisie. C'est le prix d'une cloison qui coincide exactement.
    */
    expect(st().walls).toHaveLength(7);

    // 3. Le metre dit 5,18 : on corrige les cotes du sejour.
    const sejour = st().rooms.find((r) => r.name === 'Sejour')!;
    st().resizeRoom(sejour.id, 5.18, 4.05);
    const parts = roomParts(st().walls, st().rooms as never);
    const p = parts.find((x) => x.roomId === sejour.id)!;
    const ext = roomExtent(p.surface!.pts);
    expect(ext.width).toBeCloseTo(5.18, 2);
    expect(ext.depth).toBeCloseTo(4.05, 2);

    // 4. Une porte sur le mur nord du sejour, placee a la cote et ouverte
    //    du bon cote.
    const murNord = p.walls.find((w) => Math.abs(w.a.z - w.b.z) < 1e-3)!;
    st().addOpening(murNord.id);
    expect(st().openings).toHaveLength(1);
    /*
      UNE OUVERTURE POSEE A LA MAIN EST UNE BAIE — il faut DIRE que c'est
      une porte.

      C'est ce parcours qui l'a trouve : le banc appelait `flipBattant` sur
      une ouverture fraichement posee et n'obtenait rien. La nature commande
      le dessin (le battant, qui dit de quel cote se pose l'interrupteur) et
      les cotes (l'allege) ; sans elle, les deux reglages s'offraient a une
      ouverture qui n'y avait pas droit.
    */
    st().setOpeningType(st().openings[0].id, 'door');
    const porte = st().openings[0];
    expect(porte.type).toBe('door');
    st().moveOpening(porte.id, 0.9);
    st().flipBattant(porte.id, 'pivot');
    expect(st().openings[0].pivot).toBe('b');

    // 5. Un mot pour celui qui posera.
    st().addNote('Colonne montante ici', { x: 1, z: 1 });
    expect(st().notes).toHaveLength(1);

    // 6. On enregistre, on quitte, on rouvre.
    st().commitCurrent();
    const id = st().currentSaveId!;
    expect(id).toBeTruthy();
    st().reset();
    expect(st().walls).toHaveLength(0);
    st().openSave(id);

    // 7. TOUT est revenu : les murs, la porte a sa cote et a son sens, le
    //    mot, et les cotes corrigees.
    expect(st().rooms).toHaveLength(2);
    expect(st().walls).toHaveLength(7);
    expect(st().notes).toHaveLength(1);
    expect(st().notes[0].text).toBe('Colonne montante ici');
    const o = st().openings[0];
    expect(o.pivot).toBe('b');
    const bord = Math.min(o.a.x, o.b.x);
    const largeurPorte = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
    expect(bord).toBeCloseTo(0.9, 2);
    expect(largeurPorte).toBeGreaterThan(0.5);
    const parts2 = roomParts(st().walls, st().rooms as never);
    const p2 = parts2.find((x) => x.roomId === sejour.id)!;
    expect(roomExtent(p2.surface!.pts).width).toBeCloseTo(5.18, 2);
  });

  it('et l’annulation remonte le parcours geste par geste', () => {
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Sejour');
    const sejour = st().rooms[0];
    st().addNote('A confirmer', { x: 1, z: 1 });
    st().resizeRoom(sejour.id, 6, 4);
    // Trois gestes, trois retours : chacun defait le sien, dans l'ordre.
    st().undo();
    const p = roomParts(st().walls, st().rooms as never)[0];
    expect(roomExtent(p.surface!.pts).width).toBeCloseTo(5, 2);
    expect(st().notes).toHaveLength(1);
    st().undo();
    expect(st().notes).toHaveLength(0);
    st().undo();
    expect(st().walls).toHaveLength(0);
  });
});
