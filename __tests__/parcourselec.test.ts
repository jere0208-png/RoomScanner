/**
 * EQUIPER UNE PIECE DE BOUT EN BOUT.
 *
 * Deuxieme parcours complet, apres celui du plan dessine : celui-ci suit ce
 * pour quoi l'application existe. On pose un sejour, on y met le tableau,
 * les socles, l'interrupteur et le point lumineux, on relie la commande a
 * son point, on demande le verdict des normes, puis le metre et le dossier.
 *
 * CE QUI SE VERIFIE ICI N'EST PAS LE CALCUL — chaque module a deja son banc
 * — mais LA CHAINE : que la piece d'un appareil soit la meme pour le
 * controle, pour le metre et pour le trace des gaines, et qu'un lien pose a
 * l'ecran arrive jusqu'au papier. Une chaine se rompt aux jointures, jamais
 * au milieu d'un maillon.
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
import { roomParts } from '../src/geometry/floorplan';
import {
  checkElectrical,
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { planRoutes } from '../src/geometry/elecplan';
import { buildScanPdf } from '../src/export/pdf';

const st = () => useScanStore.getState();

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('le parcours complet d’un equipement', () => {
  it('va du premier socle au dossier imprime', () => {
    // 1. Un sejour de vingt metres carres.
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Sejour');
    const piece = st().rooms[0];
    const murs = st().walls;
    expect(murs).toHaveLength(4);

    // 2. Le tableau, puis cinq socles et une commande.
    const tableau = st().addFixture('tableau', murs[3].id, 1);
    expect(tableau).toBeTruthy();
    for (let i = 0; i < 5; i++) {
      st().addFixture('prise', murs[i % 2].id, 0.6 + i * 0.7);
    }
    const inter = st().addFixture('inter', murs[1].id, 0.4)!;
    expect(st().fixtures.length).toBe(7);

    // 3. Un point lumineux au plafond, commande par l'interrupteur.
    const parts = roomParts(st().walls, st().rooms);
    const centre = parts[0].surface!.pts.reduce(
      (acc, p) => ({ x: acc.x + p.x / 4, z: acc.z + p.z / 4 }),
      { x: 0, z: 0 },
    );
    st().addCeiling('dcl', piece.id, centre);
    const point = st().ceiling[0];
    st().toggleCeilingCommand(point.id, inter);
    expect(st().ceiling[0].commands).toContain(inter);

    // 4. LE CONTROLE voit bien les appareils DANS la piece.
    const inputs = roomInputsOf(st().rooms, parts);
    const placement = fixturePlacement(st().fixtures, st().walls, inputs);
    for (const f of st().fixtures) {
      expect(placement.get(f.id)).toBe(piece.id);
    }
    const constats = checkElectrical(
      inputs,
      st().fixtures,
      wallToRooms(inputs),
      placement,
    );
    // Cinq socles dans vingt metres carres : le seuil est tenu, il ne doit
    // plus rester de constat sur le NOMBRE de prises.
    /*
      LE CONTROLE NE REPROCHE PLUS LE NOMBRE DE SOCLES.

      Cinq dans vingt metres carres : le seuil du sejour est tenu. Le
      premier jet de ce banc cherchait « socle|prise » et attrapait « aucune
      prise RJ45 » — un constat JUSTE, puisqu'on n'en a pose aucune. On vise
      donc le code du constat, pas son libelle : les mots d'un message
      changent, un code est un contrat.
    */
    expect(constats.filter((c) => c.code === 'socles').length).toBe(0);
    // Et ce qui manque VRAIMENT est bien dit : pas de RJ45 posee.
    expect(constats.some((c) => c.code === 'rj45')).toBe(true);

    // 5. LE METRE compte ce qui est pose, pas autre chose.
    const metre = materialList(
      inputs,
      st().fixtures,
      wallToRooms(inputs),
      placement,
      undefined,
      st().ceiling,
    );
    // Le point lumineux du plafond est COMMANDE : sans lui dans la liste,
    // on dessine huit spots et personne ne les achete.
    const vu = JSON.stringify(metre);
    expect(vu).toContain('Point lumineux DCL');
    // Et il est porte par un circuit d'eclairage, pas oublie dans un coin
    // de la liste : c'est le circuit qui le fait exister au tableau.
    expect(metre.circuits.some((c) => (c.ceilingIds ?? []).includes(point.id))).toBe(
      true,
    );

    // 6. LES GAINES partent du tableau et desservent chaque appareil.
    const trace = planRoutes(
      st().walls,
      st().rooms,
      parts,
      st().fixtures,
      placement,
    );
    expect(trace).toBeTruthy();
    // Tout sauf le tableau, qui est le depart et non une arrivee.
    expect(trace!.traces.length).toBe(st().fixtures.length - 1);

    // 7. LE DOSSIER porte le tout, et le lien de commande avec lui.
    const pdf = latin1(
      buildScanPdf(
        {
          name: 'Sejour equipe',
          walls: st().walls,
          openings: st().openings,
          objects: [],
          rooms: st().rooms,
          fixtures: st().fixtures,
          routes: trace!.traces,
        },
        false,
        { metre: true, ceiling: st().ceiling },
      ),
    );
    expect(pdf).toContain('Sejour equipe');
    // Le tirete du cheminement : le dossier porte bien le trace demande.
    expect(pdf).toContain('[4 3] 0 d');
  });
});
