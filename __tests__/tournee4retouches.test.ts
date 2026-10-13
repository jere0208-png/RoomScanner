/**
 * TOURNÉE N°4 — LES RETOUCHES DE LA FIN.
 *
 * - « Hugo » : l'image partagée n'emportait qu'une surface sur neuf.
 * - « Mehdi » : l'interrupteur général n'avait pas de contacteur au tableau ;
 *   une ligne de spots se recalait spot par spot.
 * - « Claire » : l'OBJ n'avait que deux groupes, « Sols » et « Volumes ».
 * - « Yasmine » : les tapis manquaient dans « Décorer ».
 * - « Inès » : « Ajouter une pièce » et « Cotes » ne parlaient pas la même
 *   langue.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buyingList } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import { planCircuits } from '../src/geometry/nfc15100';
import { buildObj } from '../src/export/model3d';
import { useScanStore } from '../src/store/scanStore';
import { catalogItem } from '../src/geometry/catalogue';
import type { Fixture } from '../src/geometry/electrical';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const st = () => useScanStore.getState();

describe('l’image partagée', () => {
  it('emporte la liste des surfaces, le temps de la capture', () => {
    const ecran = lire('src', 'screens', 'ResultScreen.tsx');
    // Une pièce seule n'a pas besoin de liste — sauf pour dire son étage (revue « Nadia »).
    expect(ecran).toContain("capturing && vue === '2d' && (legendeSurfaces.lignes.length > 1 || niveaux.length > 1)");
    expect(ecran).toContain('{`Total · ${legendeSurfaces.total} m²`}');
  });
});

describe('l’interrupteur général', () => {
  const f = (id: string, kind: Fixture['kind']): Fixture =>
    ({ id, kind, wallId: 'w', along: 1, height: 1.1, side: 1 }) as Fixture;

  it('commande un contacteur au tableau, chiffré', () => {
    const liste = buyingList([], [f('g', 'interGeneral'), f('i', 'inter')], []);
    const c = liste.find((l) => l.code === 'contacteur-ig')!;
    expect(c.quantity).toBe(1);
    expect(chiffrer(liste, [], [], 'dooxie').lignes.find((l) => l.code === 'contacteur-ig')?.pu).toBe(78.9);
    // Sans interrupteur général, pas de contacteur.
    expect(buyingList([], [f('i', 'inter')], []).some((l) => l.code === 'contacteur-ig')).toBe(false);
  });

  it('les circuits d’éclairage disent qu’il les coupe', () => {
    const c = planCircuits([f('g', 'interGeneral'), f('i', 'inter'), f('a', 'applique')], () => 'Séjour', () => false).find(
      (x) => x.nature === 'eclairage',
    )!;
    expect(c.note).toMatch(/interrupteur général/);
  });
});

describe('une ligne de spots', () => {
  it('se déplace d’un bloc, sans sortir de la pièce', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(5, 4, 'Séjour', { auNu: true });
    const roomId = st().rooms[0].id;
    const ids = [1, 2, 3, 4].map((i) =>
      st().addCeiling('spot', roomId, { x: i, z: 2 }, { row: 'L1', axe: 'longueur' as never }),
    );
    const avant = st().ceiling.filter((c) => c.row === 'L1').map((c) => c.at.x);
    st().moveCeilingRow('L1', 0.3, 0.2);
    const apres = st().ceiling.filter((c) => c.row === 'L1');
    expect(apres.map((c) => c.at.x)).toEqual(avant.map((x) => x + 0.3));
    expect(apres.every((c) => Math.abs(c.at.z - 2.2) < 1e-9)).toBe(true);
    // Un pas qui en sortirait un de la pièce est refusé, et la ligne reste.
    st().moveCeilingRow('L1', 10, 0);
    expect(st().ceiling.filter((c) => c.row === 'L1').map((c) => c.at.x)).toEqual(avant.map((x) => x + 0.3));
    void ids;
  });
});

describe('l’OBJ', () => {
  it('range ses faces par nature : sols, murs, menuiseries, meubles', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    const mur = st().walls[0];
    st().addOpening(mur.id, 'window');
    st().addObject(catalogItem('canape3') ?? catalogItem('lit140')!, 2, 1.5);
    const s = st();
    const obj = buildObj({ walls: s.walls, openings: s.openings, objects: s.objects, rooms: s.rooms, fixtures: s.fixtures });
    for (const g of ['g Sols', 'g Murs', 'g Menuiseries', 'g Meubles']) expect(obj).toContain(g);
    expect(obj).not.toContain('g Volumes');
  });
});

describe('les mots', () => {
  it('« Décorer » liste aussi les tapis', () => {
    expect(lire('src', 'components', 'DecorSheet.tsx')).not.toMatch(/!\/tapis\/i\.test/);
  });

  it('« Ajouter une pièce » parle comme « Cotes » : gauche-droite, haut-bas', () => {
    const feuille = lire('src', 'screens', 'result', 'AddRoomSheet.tsx');
    expect(feuille).toContain("'Largeur, gauche-droite'");
    expect(feuille).toContain("'Profondeur, haut-bas'");
  });
});
