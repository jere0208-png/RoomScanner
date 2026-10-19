/**
 * LE MODE ÉLECTRICITÉ, JOUÉ COMME SUR UN CHANTIER — défauts trouvés par
 * l'agent testeur ÉLECTRICITÉ (rénovation complète d'un T3), devenus des
 * garde-fous :
 *   — refuser le pontage d'une prise, lier ou délier deux spots : « Annuler »
 *     ne défaisait rien, et le plan ne se disait pas « à enregistrer » ;
 *   — retirer un des deux spots d'une ligne laissait une ligne d'un seul ;
 *   — « Autre face » sur un poste d'une plaque coupait la plaque en deux ;
 *   — dupliquer une pièce copiait les prises de la voisine (même refend),
 *     laissait l'applique copiée commandée par l'interrupteur de l'originale,
 *     et faisait rejoindre aux spots copiés la ligne de l'originale ;
 *   — retirer une pièce laissait ses prises sur le refend qui reste ;
 *   — la copie d'un plan gardait le numéro du devis déjà envoyé.
 * Et un manque : retirer d'un geste l'appareillage d'une pièce.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { roomParts } from '../src/geometry/floorplan';
import { fixturePlacement, roomInputsOf } from '../src/geometry/nfc15100';

const st = () => useScanStore.getState();
const appareil = (id: string) => st().fixtures.find((f) => f.id === id)!;
const point = (id: string) => st().ceiling.find((c) => c.id === id)!;
const placement = () => fixturePlacement(st().fixtures, st().walls, roomInputsOf(st().rooms, roomParts(st().walls, st().rooms)));

beforeEach(() => {
  useAccountStore.setState({ pro: true });
  st().ouvrirExemple();
  st().commitCurrent();
});

describe('les retouches du câblage s’annulent et s’enregistrent', () => {
  it('refuser le pontage d’une prise', () => {
    const p = st().fixtures.find((f) => f.kind === 'prise')!;
    expect(st().dirty).toBe(false);
    st().basculerPontage(p.id);
    expect(appareil(p.id).sansPontage).toBe(true);
    expect(st().dirty).toBe(true);
    st().undo();
    expect(!!appareil(p.id).sansPontage).toBe(false);
  });

  it('lier puis délier deux spots', () => {
    const r = st().rooms[0].id;
    const a = st().addCeiling('spot', r, { x: 1, z: 1 });
    const b = st().addCeiling('spot', r, { x: 1.5, z: 1 });
    st().commitCurrent();
    st().lierPlafond(a, b);
    expect(point(a).row).toBeDefined();
    expect(point(a).row).toBe(point(b).row);
    expect(st().dirty).toBe(true);
    st().undo();
    expect(point(a).row).toBeUndefined();
    st().lierPlafond(a, b);
    st().commitCurrent();
    st().delierPlafond(a);
    expect(point(b).row).toBeUndefined();
    expect(st().dirty).toBe(true);
    st().undo();
    expect(point(a).row).toBe(point(b).row);
  });

  it('retirer un des deux spots d’une ligne défait la ligne', () => {
    const r = st().rooms[0].id;
    const a = st().addCeiling('spot', r, { x: 1, z: 1 });
    const b = st().addCeiling('spot', r, { x: 1.5, z: 1 });
    const c = st().addCeiling('spot', r, { x: 2, z: 1 });
    st().lierPlafond(a, b);
    st().lierPlafond(c, b);
    st().removeCeiling(a);
    // Il en reste deux : la ligne tient.
    expect(point(b).row).toBe(point(c).row);
    st().removeCeiling(c);
    expect(point(b).row).toBeUndefined();
  });
});

it('« Autre face » passe toute la plaque de l’autre côté', () => {
  st().reset();
  st().addRoomLibre(4, 3, 'Chambre');
  const w = st().walls[0].id;
  const a = st().addFixture('prise', w, 1.5)!;
  const b = st().addFixture('prise', w, 1.5)!;
  expect(appareil(a).group).toBeDefined();
  expect(appareil(b).group).toBe(appareil(a).group);
  const face = appareil(a).side;
  st().flipFixture(a);
  expect(appareil(a).side).toBe(-face);
  expect(appareil(b).side).toBe(-face);
  st().undo();
  expect(appareil(a).side).toBe(face);
  expect(appareil(b).side).toBe(face);
});

describe('dupliquer une pièce', () => {
  it('ne copie que l’appareillage qui donne dans la pièce', () => {
    for (const room of st().rooms) {
      st().ouvrirExemple();
      const avant = new Set(st().fixtures.map((f) => f.id));
      const aMoi = st().fixtures.filter((f) => placement().get(f.id) === room.id).length;
      const copie = st().duplicateRoom(room.id)!;
      const copies = st().fixtures.filter((f) => !avant.has(f.id));
      expect(copies).toHaveLength(aMoi);
      // Et chacune donne dans la pièce copiée.
      const pl = placement();
      for (const f of copies) expect(pl.get(f.id)).toBe(copie);
    }
  });

  it('recâble les commandes entre copies, et donne aux spots une ligne à eux', () => {
    const room = st().rooms.find((r) => r.name === 'Chambre')!;
    const w = room.wallIds!.find((id) => st().fixtures.every((f) => f.wallId !== id)) ?? room.wallIds![0];
    const inter = st().addFixture('inter', w, 0.4)!;
    const applique = st().addFixture('applique', w, 1.6)!;
    st().toggleFixtureCommand(applique, inter);
    const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === room.id)!;
    const s1 = st().addCeiling('spot', room.id, { x: part.labelAt.x, z: part.labelAt.z });
    const s2 = st().addCeiling('spot', room.id, { x: part.labelAt.x + 0.4, z: part.labelAt.z });
    st().lierPlafond(s1, s2);
    st().toggleCeilingCommand(s1, inter);
    const avant = new Set(st().fixtures.map((f) => f.id));
    const copie = st().duplicateRoom(room.id)!;
    const neufs = st().fixtures.filter((f) => !avant.has(f.id));
    const interCopie = neufs.find((f) => f.kind === 'inter' && Math.abs(f.along - appareil(inter).along) < 1e-6)!;
    const appliqueCopie = neufs.find((f) => f.kind === 'applique')!;
    expect(appliqueCopie.commands).toEqual([interCopie.id]);
    // L'originale garde son câblage.
    expect(appareil(applique).commands).toEqual([inter]);
    const spots = st().ceiling.filter((c) => c.roomId === copie && c.kind === 'spot');
    expect(spots).toHaveLength(2);
    expect(spots[0].row).toBeDefined();
    expect(spots[0].row).toBe(spots[1].row);
    expect(spots[0].row).not.toBe(point(s1).row);
    expect(spots.some((c) => c.commands?.[0] === interCopie.id)).toBe(true);
    // Aucun lien ne pend vers un appareil de l'originale.
    for (const c of st().ceiling.filter((x) => x.roomId === copie)) {
      for (const id of c.commands ?? []) expect(avant.has(id)).toBe(false);
    }
  });
});

it('retirer une pièce emporte ses prises du refend qui reste', () => {
  const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
  const aElle = st().fixtures.filter((f) => placement().get(f.id) === chambre.id).map((f) => f.id);
  expect(aElle.length).toBeGreaterThan(0);
  st().removeRoom(chambre.id);
  for (const id of aElle) expect(st().fixtures.some((f) => f.id === id)).toBe(false);
  // Les voisines gardent les leurs.
  expect(st().fixtures.length).toBeGreaterThan(0);
  expect([...placement().values()]).not.toContain(chambre.id);
});

it('la copie d’un plan reçoit son propre numéro de devis', () => {
  st().setDevisNumero('D-2026-0042');
  st().commitCurrent();
  const id = st().currentSaveId!;
  const copie = st().duplicateSave(id)!;
  expect(st().saves.find((s) => s.id === id)!.devis?.numero).toBe('D-2026-0042');
  expect(st().saves.find((s) => s.id === copie)!.devis?.numero).toBeUndefined();
  // « Enregistrer comme nouvelle copie » : la copie ouverte n'a plus de numéro.
  st().saveAsCopy('Variante B');
  expect(st().devisNumero).toBeNull();
  expect(st().saves.find((s) => s.id === st().currentSaveId)!.devis?.numero).toBeUndefined();
  expect(st().saves.find((s) => s.id === id)!.devis?.numero).toBe('D-2026-0042');
});

it('retirer d’un geste l’appareillage d’une pièce, et l’annuler d’un geste', () => {
  const sejour = st().rooms.find((r) => r.name.startsWith('Séjour'))!;
  const pl = placement();
  const aLui = st().fixtures.filter((f) => pl.get(f.id) === sejour.id).length;
  const plafond = st().ceiling.filter((c) => c.roomId === sejour.id).length;
  const autres = st().fixtures.length - aLui;
  const avant = st().fixtures.length + st().ceiling.length;
  expect(st().viderAppareillage(sejour.id)).toBe(aLui + plafond);
  expect(st().fixtures).toHaveLength(autres);
  expect(st().ceiling.some((c) => c.roomId === sejour.id)).toBe(false);
  // Plus aucun lien ne vise un appareil parti.
  const vivants = new Set(st().fixtures.map((f) => f.id));
  for (const x of [...st().fixtures, ...st().ceiling]) for (const id of x.commands ?? []) expect(vivants.has(id)).toBe(true);
  st().undo();
  expect(st().fixtures.length + st().ceiling.length).toBe(avant);
  // Rien à retirer : rien ne se passe, et pas d'« Annuler » vide.
  st().viderAppareillage(sejour.id);
  expect(st().viderAppareillage(sejour.id)).toBe(0);
});

describe('le tableau relevé', () => {
  it('« Vider le tableau » se rattrape par « Annuler », comme la feuille le promet', () => {
    st().ajouterDepart({ organe: 'disjoncteur', calibre: 16 } as never);
    st().ajouterDepart({ organe: 'disjoncteur', calibre: 20 } as never);
    expect(st().existant!.departs).toHaveLength(2);
    st().viderLeTableau();
    expect(st().existant!.departs).toHaveLength(0);
    st().undo();
    expect(st().existant!.departs).toHaveLength(2);
    // Et chaque organe ajouté se retire d'un « Annuler ».
    st().undo();
    expect(st().existant!.departs).toHaveLength(1);
  });

  it('annuler un geste sur le plan ne défait pas le relevé du tableau', () => {
    st().ajouterDepart({ organe: 'disjoncteur', calibre: 16 } as never);
    st().setNorth(30);
    st().ajouterDepart({ organe: 'disjoncteur', calibre: 20 } as never);
    // Le dernier geste est l'organe : l'annuler retire l'organe, pas le nord.
    st().undo();
    expect(st().existant!.departs).toHaveLength(1);
    expect(st().north).toBe(30);
  });
});

it('relier un interrupteur à un spot d’une ligne relie toute la ligne', () => {
  const room = st().rooms[0];
  const w = room.wallIds![0];
  const inter = st().addFixture('inter', w, 0.4)!;
  const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === room.id)!;
  const ids = [0, 0.4, 0.8].map((d) => st().addCeiling('spot', room.id, { x: part.labelAt.x + d, z: part.labelAt.z }));
  st().lierPlafond(ids[1], ids[0]);
  st().lierPlafond(ids[2], ids[0]);
  expect(st().lierElements(inter, ids[1])).toBe(true);
  for (const id of ids) expect(point(id).commands).toEqual([inter]);
  // Un seul « Annuler » pour la ligne.
  st().undo();
  for (const id of ids) expect(point(id).commands ?? []).toEqual([]);
  // Et le second geste la délie toute.
  st().lierElements(inter, ids[0]);
  st().lierElements(ids[2], inter);
  for (const id of ids) expect(point(id).commands ?? []).toEqual([]);
});
