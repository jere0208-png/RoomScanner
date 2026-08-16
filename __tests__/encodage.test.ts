/**
 * Le PDF écrit du français, pas du français troué.
 *
 * Le document déclare ses polices en `/WinAnsiEncoding`, mais l'écriture se
 * contentait du Latin-1 : tout caractère au-delà de 0xFF devenait un point
 * d'interrogation. Or l'app écrit en français typographié — apostrophes
 * courbes, tirets cadratins, points de suspension — et le lecteur voyait
 * « Boîte d?encastrement », « Tirage ? gaines », « qu?un type AC ».
 *
 * WinAnsi loge tous ces signes, simplement pas là où Unicode les met : entre
 * 0x80 et 0x9F. Le test lit les octets réellement écrits dans le flux.
 */
import { buildMaterialPdf } from '../src/export/pdf';
import {
  materialList,
  roomInputsOf,
  fixturePlacement,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { pullSchedule, buyingList } from '../src/geometry/conduits';
import { planRoutes } from '../src/geometry/elecplan';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const R = [{ id: 'r1', name: 'Chambre', wallIds: W.map((w) => w.id) }];
const FX: Fixture[] = [
  { id: 't', kind: 'tableau', wallId: 'w', along: 1, height: 1.35, side: 1 },
  { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
  { id: 'b', kind: 'prise', wallId: 'n', along: 2.5, height: 0.25, side: 1 },
  { id: 'c', kind: 'rj45', wallId: 'e', along: 1, height: 0.25, side: 1 },
];

const parts = roomParts(W, R);
const inputs = roomInputsOf(R, parts);
const placement = fixturePlacement(FX, W, inputs);
const list = materialList(inputs, FX, wallToRooms(inputs), placement);
const routes = planRoutes(W, R, parts, FX, placement)!;
const pull = pullSchedule(list.circuits, routes.metre, routes.approx);
const bytes = buildMaterialPdf('Chantier', list, {
  pull,
  buy: buyingList(pull, FX),
});

/** Le flux, octet par octet — c'est ce que lit le visionneur. */
let flux = '';
for (let i = 0; i < bytes.length; i++) flux += String.fromCharCode(bytes[i]);

/** Le contenu des chaînes écrites, tel quel. */
const chaines = (flux.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).map((m) =>
  m.slice(1, m.lastIndexOf(')')),
);
const tout = chaines.join(' | ');

describe('les signes typographiques', () => {
  it('aucun « ? » ne s’est glissé dans le document', () => {
    // Sauf, éventuellement, une vraie question — il n'y en a aucune ici.
    const suspects = chaines.filter((t) => t.includes('?'));
    expect(suspects).toEqual([]);
  });

  it('le tiret cadratin est écrit à sa place WinAnsi (0x97)', () => {
    expect(tout).toContain('');
  });

  it('l’apostrophe courbe aussi (0x92), et le mot reste entier', () => {
    expect(tout).toContain('');
    expect(tout).toContain('Boîte dencastrement');
  });

  it('les accents Latin-1 passent comme avant', () => {
    expect(tout).toContain('É');
    expect(tout).toMatch(/mm²/);
  });

  it('ce qu’aucun encodage 8 bits ne sait écrire devient lisible, pas « ? »', () => {
    // « ≈ » n'existe dans aucun encodage 8 bits : il devient « ~ », qui
    // dit « environ ». Le cas se produit dès qu'une pièce n'a pas été
    // relevée en boucle fermée : ses longueurs de gaine sont approchées.
    const ouvert = W.slice(0, 3);
    const rooms2 = [{ id: 'r1', name: 'Chambre', wallIds: ouvert.map((w) => w.id) }];
    const parts2 = roomParts(ouvert, rooms2);
    const inputs2 = roomInputsOf(rooms2, parts2);
    // Le tableau vit sur le mur qui manque : on le remet sur un mur relevé,
    // sinon il n'y a pas de départ et donc pas de tracé du tout.
    const fx2 = FX.map((f) =>
      f.kind === 'tableau' ? { ...f, wallId: 'n', along: 4 } : f,
    ).filter((f) => ouvert.some((w) => w.id === f.wallId));
    const place2 = fixturePlacement(fx2, ouvert, inputs2);
    const list2 = materialList(inputs2, fx2, wallToRooms(inputs2), place2);
    const routes2 = planRoutes(ouvert, rooms2, parts2, fx2, place2)!;
    const pull2 = pullSchedule(list2.circuits, routes2.metre, routes2.approx);
    const bytes2 = buildMaterialPdf('Ouvert', list2, {
      pull: pull2,
      buy: buyingList(pull2, fx2),
    });
    let flux2 = '';
    for (let i = 0; i < bytes2.length; i++) flux2 += String.fromCharCode(bytes2[i]);
    const lus = (flux2.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).map((m) =>
      m.slice(1, m.lastIndexOf(')')),
    );
    expect(routes2.exact).toBe(false);
    expect(lus.join(' ')).toContain('~');
    expect(lus.filter((t) => t.includes('?'))).toEqual([]);
  });
});

describe('le bordereau du fournisseur', () => {
  it('donne la section à la française', () => {
    expect(tout).toMatch(/2,5 mm²/);
    expect(tout).not.toMatch(/2\.5 mm²/);
  });

  it('ne parle plus de la largeur d’une plaque', () => {
    expect(tout).not.toContain('82 mm');
    expect(tout).toContain('Plaque de finition');
  });

  it('range par rayon, avec ses colonnes', () => {
    expect(tout).toContain('CONDUITS ET CONDUCTEURS');
    expect(tout).toContain('Qté');
    expect(tout).toContain('Unité');
  });
});
