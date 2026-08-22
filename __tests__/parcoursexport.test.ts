/**
 * LE MEME PLAN, DANS LES TROIS FORMATS.
 *
 * Huitieme parcours complet. Un releve sort par trois portes, et chacune
 * s'adresse a quelqu'un d'autre : le PDF au client et au poseur, le DXF a
 * l'architecte qui va le reposer dans son logiciel, le CSV au fournisseur
 * qui chiffre. Trois lectures d'un meme travail.
 *
 * CE QU'ON VERIFIE : qu'aucune porte ne se perde en chemin. Chaque format a
 * son banc de forme — la structure du DXF, les guillemets du CSV, les
 * operateurs du PDF ; celui-ci verifie que ce qu'on a POSE se retrouve dans
 * les trois, sous le nom qu'on lui a donne.
 *
 * Un chiffre qui apparait dans deux documents doit etre le meme : ils
 * viennent du meme metre. Un plan qui montre huit points lumineux et un
 * devis qui n'en chiffre aucun, c'est pire qu'un dossier qui n'en parle pas.
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
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { buildScanPdf } from '../src/export/pdf';
import { buildDxf, sansAccent } from '../src/export/dxf';
import { buildMetreCsv } from '../src/export/csv';

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

describe('le parcours complet d’un export', () => {
  it('le meme plan sort entier par les trois portes', () => {
    // Un sejour equipe, avec une porte declaree et une note.
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Séjour');
    const murs = st().walls;
    st().addOpening(murs[0].id);
    st().setOpeningType(st().openings[0].id, 'door');
    st().addFixture('tableau', murs[3].id, 1);
    for (let i = 0; i < 5; i++) st().addFixture('prise', murs[i % 2].id, 0.6 + i * 0.7);
    st().addNote('Colonne montante', { x: 1, z: 1 });

    const parts = roomParts(st().walls, st().rooms);
    const inputs = roomInputsOf(st().rooms, parts);
    const placement = fixturePlacement(st().fixtures, st().walls, inputs);

    // ------------------------------------------------------------ le PDF
    const pdf = latin1(
      buildScanPdf(
        {
          name: 'T3 rue Pasteur',
          walls: st().walls,
          openings: st().openings,
          objects: [],
          rooms: st().rooms,
          fixtures: st().fixtures,
          notes: st().notes,
        },
        false,
        { metre: true },
      ),
    );
    expect(pdf).toContain('T3 rue Pasteur');
    // La note ecrite sur le plan arrive au poseur.
    expect(pdf).toContain('Colonne montante');

    // ------------------------------------------------------------ le DXF
    const dxf = buildDxf({
      walls: st().walls,
      openings: st().openings,
      rooms: st().rooms,
      fixtures: st().fixtures,
    });
    // Un DXF mal ferme est refuse en bloc : AutoCAD ne repare rien.
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    // Le nom de la piece y est, translittere : le R12 est de l'ASCII, et
    // un « é » y devient un caractere de controle.
    expect(dxf).toContain(sansAccent('Séjour'));
    expect(dxf).not.toContain('Séjour');
    // Chaque appareil pose a son point dans le dessin de l'architecte.
    const cercles = (dxf.match(/\nCIRCLE\r?\n/g) ?? []).length;
    expect(cercles).toBeGreaterThanOrEqual(st().fixtures.length);

    // ------------------------------------------------------------ le CSV
    const metre = materialList(
      inputs,
      st().fixtures,
      wallToRooms(inputs),
      placement,
    );
    const csv = buildMetreCsv(
      'T3 rue Pasteur',
      [
        {
          name: 'Séjour',
          area: parts[0].surface?.area ?? 0,
          perimeter: 18,
          height: 2.5,
        } as never,
      ],
      metre,
    );
    expect(csv).toContain('T3 rue Pasteur');
    // Les cinq socles comptes par le metre se retrouvent au fournisseur :
    // un chiffre qui apparait des deux cotes doit etre le meme.
    const socles = metre.rooms
      .flatMap((r) => r.rows)
      .find((r) => /Prise 16/.test(r.label))!;
    expect(socles.quantity).toBe(5);
    expect(csv).toContain('5');
    // Et il porte l'entete qui dit ce que c'est, pas un tableau nu.
    expect(csv.split('\n')[0]).toContain('Métré');
  });
});
