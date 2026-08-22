/**
 * UN PAVILLON A DEUX NIVEAUX, DE BOUT EN BOUT.
 *
 * Troisieme parcours complet, sur la partie la plus jeune de
 * l'application. Le multi-etages tient a une seule idee : le niveau est
 * porte par le MUR et par la PIECE, et tout le reste en herite de son
 * support — l'appareillage et la photo tiennent a un mur, le meuble et le
 * plafonnier a une piece, la note dit le sien.
 *
 * Une idee simple a exactement autant de jointures qu'elle a de porteurs.
 * On les traverse toutes : poser au rez, monter au premier, y dessiner, y
 * ecrire, recaler l'etage sur celui du dessous, enregistrer, rouvrir, et
 * verifier que chaque feuille ne porte QUE ce qui est a elle.
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
import {
  filtrerAuNiveau,
  niveauxPresents,
  roomParts,
} from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

/** Ce que montre une feuille d'etage : murs, pieces, appareils, notes. */
const feuille = (n: number) =>
  filtrerAuNiveau(
    {
      walls: st().walls,
      openings: st().openings,
      rooms: st().rooms,
      fixtures: st().fixtures,
      photos: st().photos,
      objects: st().objects,
      ceiling: st().ceiling,
      notes: st().notes,
    },
    n,
  );

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('le parcours complet d’un pavillon a deux niveaux', () => {
  it('chaque feuille ne porte que ce qui est a elle', () => {
    // 1. Le rez : un sejour, une prise, un mot.
    st().commencerAuClavier();
    st().addRoomBox(6, 4, 'Sejour');
    const murRez = st().walls[0];
    st().addFixture('prise', murRez.id, 1);
    st().addNote('Colonne montante', { x: 1, z: 1 });

    // 2. On monte au premier et on y dessine.
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
    const murHaut = st().walls.find((w) => w.roomId === chambre.id)!;
    st().addFixture('inter', murHaut.id, 0.4);
    st().addNote('Combles a isoler', { x: 2, z: 2 });

    // 3. Les deux niveaux existent, et chacun tient ce qu'on y a mis.
    expect(niveauxPresents(st().walls, st().rooms).sort()).toEqual([0, 1]);
    const rez = feuille(0);
    const haut = feuille(1);
    expect(rez.rooms.map((r) => r.name)).toEqual(['Sejour']);
    expect(haut.rooms.map((r) => r.name)).toEqual(['Chambre']);
    // L'appareillage suit SON mur, sans qu'on ait rien eu a lui dire.
    expect(rez.fixtures).toHaveLength(1);
    expect(haut.fixtures).toHaveLength(1);
    expect(rez.fixtures[0].kind).toBe('prise');
    expect(haut.fixtures[0].kind).toBe('inter');
    // La note, elle, porte son etage en propre.
    expect(rez.notes?.map((x) => x.text)).toEqual(['Colonne montante']);
    expect(haut.notes?.map((x) => x.text)).toEqual(['Combles a isoler']);

    // 4. Recaler le premier sur le rez : l'etage entier glisse, le rez ne
    //    bouge pas d'un millimetre.
    const avantRez = JSON.stringify(feuille(0).walls);
    const avantHaut = feuille(1).walls[0].a.x;
    st().recalerNiveau(1, 0.5, 0);
    expect(JSON.stringify(feuille(0).walls)).toBe(avantRez);
    expect(feuille(1).walls[0].a.x).toBeCloseTo(avantHaut + 0.5, 3);

    // 5. Enregistrer, quitter, rouvrir : les deux niveaux reviennent.
    st().commitCurrent();
    const id = st().currentSaveId!;
    st().reset();
    st().openSave(id);
    expect(niveauxPresents(st().walls, st().rooms).sort()).toEqual([0, 1]);
    expect(feuille(0).rooms.map((r) => r.name)).toEqual(['Sejour']);
    expect(feuille(1).rooms.map((r) => r.name)).toEqual(['Chambre']);
    expect(feuille(1).notes?.[0].text).toBe('Combles a isoler');
    // Et le decalage du recalage a bien voyage avec le plan.
    expect(feuille(1).walls[0].a.x).toBeCloseTo(avantHaut + 0.5, 3);
  });

  it('et les gestes du plan restent AU niveau ou l’on est', () => {
    st().commencerAuClavier();
    st().addRoomBox(6, 4, 'Sejour');
    st().allerAuNiveau(1);
    st().addRoomBox(4, 3, 'Chambre');
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;

    // Redimensionner au premier ne doit rien faire bouger au rez : les
    // deux niveaux ont des murs aux memes coordonnees, et c'est justement
    // la ou une regle qui « recoud par les points » pourrait deraper.
    const avant = JSON.stringify(feuille(0).walls);
    st().resizeRoom(chambre.id, 4.2, 3.1);
    expect(JSON.stringify(feuille(0).walls)).toBe(avant);
    const p = roomParts(feuille(1).walls, feuille(1).rooms).find(
      (x) => x.roomId === chambre.id,
    );
    expect(p).toBeTruthy();
  });
});
