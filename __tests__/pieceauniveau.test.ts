/**
 * UNE PIECE NE S'ACCOLE QU'A UN MUR DE SON ETAGE.
 *
 * Trouve en refaisant le parcours d'un pavillon a deux niveaux. On pose un
 * sejour au rez, on monte au premier, on y pose une chambre : elle sort
 * avec TROIS murs a elle et un quatrieme emprunte au rez-de-chaussee.
 *
 * `addRoomBox` accole toujours la nouvelle piece a un mur existant — c'est
 * volontaire, et c'est ce qui donne une cloison mitoyenne exacte plutot que
 * deux logements flottant cote a cote. Mais il choisissait « le mur
 * exterieur le plus long » parmi TOUS les murs du plan, etages confondus.
 *
 * CE QUE CA CASSE :
 *
 *   — la feuille du premier montre une piece OUVERTE : le filtre par etage
 *     retire le mur emprunte, et le contour ne ferme plus. Plus de surface,
 *     donc plus de metre et plus de controle des normes ;
 *   — la feuille du rez montre un mur qui borde une piece d'un autre
 *     etage ;
 *   — les deux etages partagent une maconnerie : corriger les cotes de
 *     l'une deforme l'autre, un etage plus bas.
 *
 * QUAND L'ETAGE EST VIDE, il n'y a rien a quoi s'accoler : la premiere
 * piece se pose alors au COIN DE L'ETAGE DU DESSOUS. Un etage se superpose
 * a celui qu'il couvre — c'est le repere qu'on a sous les yeux — et
 * `recalerNiveau` existe pour l'ajuster ensuite au demi-centimetre.
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
import { niveauDe, roomParts } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

beforeEach(() => {
  mockMagasin.clear();
  st().reset();
  st().commencerAuClavier();
});

describe('poser une piece a un etage', () => {
  it('ne lui emprunte aucun mur d’un autre niveau', () => {
    st().addRoomBox(6, 4, 'Sejour');
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
    const siens = st().walls.filter((w) => (chambre.wallIds ?? []).includes(w.id));
    expect(siens).toHaveLength(4);
    for (const w of siens) {
      expect(niveauDe(w)).toBe(1);
    }
  });

  it('et sa surface se calcule, parce que son contour ferme', () => {
    st().addRoomBox(6, 4, 'Sejour');
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
    // La feuille du premier : ses murs a elle, et rien d'autre.
    const mursDuHaut = st().walls.filter((w) => niveauDe(w) === 1);
    const p = roomParts(mursDuHaut, [chambre]).find(
      (x) => x.roomId === chambre.id,
    )!;
    expect(p.surface).toBeTruthy();
    expect(p.surface!.area).toBeGreaterThan(1);
  });

  it('le rez ne borde aucune piece d’en haut', () => {
    st().addRoomBox(6, 4, 'Sejour');
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
    const mursDuRez = st().walls.filter((w) => niveauDe(w) === 0);
    for (const w of mursDuRez) {
      expect((chambre.wallIds ?? []).includes(w.id)).toBe(false);
    }
  });

  it('mais deux pieces du MEME etage partagent bien leur cloison', () => {
    // La regle d'origine ne change pas : c'est elle qui donne une
    // maconnerie unique entre deux pieces voisines, cotee une fois.
    st().addRoomBox(6, 4, 'Sejour');
    st().addRoomBox(4, 3, 'Cuisine');
    expect(st().walls).toHaveLength(7);
  });

  it('la premiere piece d’un etage vide se pose au-dessus de celui du dessous', () => {
    st().addRoomBox(6, 4, 'Sejour');
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
    const siens = st().walls.filter((w) => (chambre.wallIds ?? []).includes(w.id));
    const xs = siens.flatMap((w) => [w.a.x, w.b.x]);
    const zs = siens.flatMap((w) => [w.a.z, w.b.z]);
    // Le rez occupe (0,0)-(6,4) : l'etage part du meme coin, pas d'un
    // ailleurs qu'il faudrait aller chercher au dezoom.
    expect(Math.min(...xs)).toBeCloseTo(0, 2);
    expect(Math.min(...zs)).toBeCloseTo(0, 2);
  });
});
