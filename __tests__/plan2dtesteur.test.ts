/**
 * LE PLAN 2D SOUS LES DOIGTS D'UN MÉTREUR — défauts trouvés par l'agent
 * testeur PLAN 2D (tour de test complet de l'app), devenus des garde-fous :
 *   — abattre une cloison laissait deux pièces ouvertes l'une sur l'autre ;
 *   — « Annuler » ne rendait pas le nord, et défaisait le geste d'avant ;
 *   — une menuiserie neuve se posait par-dessus celle qui était au milieu
 *     du mur, et trois portes s'empilaient au même endroit ;
 *   — une menuiserie poussée sur sa voisine se posait PAR-DESSUS ;
 *   — retirer un retour laissait sa fenêtre suspendue dans le vide ;
 *   — une pièce déplacée laissait derrière elle ses notes et ses cotes ;
 *   — un mur raccourci sous une fenêtre plus large que lui la laissait
 *     dépasser dans le coin ;
 * et deux manques comblés : couper un mur, dupliquer une menuiserie.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import { murDeLOuverture, roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';

const S = () => useScanStore.getState();
const ouv = (id: string) => S().openings.find((o) => o.id === id)!;
/** Les menuiseries d'un mur, en intervalles [début, fin] le long de x (murs horizontaux de l'exemple). */
const surLeMur = (murId: string) =>
  S()
    .openings.filter((o) => murDeLOuverture(o, S().walls)?.id === murId)
    .map((o) => [Math.min(o.a.x, o.b.x), Math.max(o.a.x, o.b.x)] as [number, number])
    .sort((p, q) => p[0] - q[0]);
const seRecouvrent = (iv: [number, number][]) => iv.some((p, i) => i > 0 && p[0] < iv[i - 1][1] - 1e-6);

beforeEach(() => {
  S().ouvrirExemple();
});

describe('abattre une cloison', () => {
  it('réunit les deux pièces qu’elle séparait, meubles et plafond compris', () => {
    const chambre = S().rooms.find((r) => r.name === 'Chambre')!;
    const sejour = S().rooms.find((r) => r.name.startsWith('Séjour'))!;
    const meubles = S().objects.filter((o) => o.roomId === chambre.id).map((o) => o.id);
    S().removeWall('refend');
    expect(S().rooms.some((r) => r.id === chambre.id)).toBe(false);
    const part = roomParts(S().walls, S().rooms).find((p) => p.roomId === sejour.id)!;
    // Une seule pièce fermée : plus de surface « ≈ ».
    expect(part.surface?.exact).toBe(true);
    expect(part.surface!.area).toBeGreaterThan(30);
    for (const id of meubles) expect(S().objects.find((o) => o.id === id)!.roomId).toBe(sejour.id);
    expect(S().ceiling.some((c) => c.roomId === chambre.id)).toBe(false);
    // Un seul « Annuler » rend la cloison et les deux pièces.
    S().undo();
    expect(S().rooms.some((r) => r.id === chambre.id)).toBe(true);
    expect(S().walls.some((w) => w.id === 'refend')).toBe(true);
  });
});

describe('le nord', () => {
  it('« Annuler » rend l’orientation d’avant, sans toucher au geste précédent', () => {
    S().moveWall('nord', 0, -0.2, false);
    const apresMur = JSON.stringify(S().walls);
    S().setNorth(45);
    S().undo();
    expect(S().north).toBeNull();
    expect(JSON.stringify(S().walls)).toBe(apresMur);
    S().redo();
    expect(S().north).toBe(45);
  });
});

describe('les menuiseries d’un même mur', () => {
  it('une neuve se pose dans une place libre, jamais par-dessus une autre', () => {
    // Le mur nord (5 m) porte deux fenêtres : 0,80–2,20 et 3,10–4,50.
    const poses = [S().addOpening('nord', 'door'), S().addOpening('nord', 'door'), S().addOpening('nord', 'door')];
    expect(seRecouvrent(surLeMur('nord'))).toBe(false);
    // La place manque pour la troisième : rien ne se pose, rien ne s’annule pour rien.
    expect(poses.filter(Boolean)).toHaveLength(2);
    const avant = S().openings.length;
    expect(S().addOpening('nord', 'door')).toBeUndefined();
    expect(S().openings).toHaveLength(avant);
  });

  it('sur un mur nu, elle reste au milieu, comme avant', () => {
    const id = S().addOpening('sud#2', 'window')!;
    const o = ouv(id);
    const m = S().walls.find((w) => w.id === 'sud#2')!;
    expect((o.a.x + o.b.x) / 2).toBeCloseTo((m.a.x + m.b.x) / 2, 6);
  });

  it('poussée vers sa voisine, elle s’arrête contre elle', () => {
    S().moveOpening('porte-fenetre', 0.8);
    expect(seRecouvrent(surLeMur('nord'))).toBe(false);
    const pf = ouv('porte-fenetre');
    expect(Math.min(pf.a.x, pf.b.x)).toBeCloseTo(2.2, 2);
  });

  it('retirer un retour emporte la menuiserie qui était dessus, ou la rabote', () => {
    // Le mur est#1 (8 ; 3,6 → 6) porte la fenêtre de la salle d’eau (4,50 → 5,10).
    S().retirerUnRetour('est#1', 0.2, 0.4); // retire 4,08 → 4,56 : la fenêtre n’y mord que de 6 cm
    const f = ouv('fenetre-sde');
    expect(Math.min(f.a.z, f.b.z)).toBeGreaterThanOrEqual(4.56 - 1e-6);
    S().ouvrirExemple();
    S().retirerUnRetour('est#1', 0.35, 0.65); // retire 4,44 → 5,16 : la fenêtre y est toute
    expect(S().openings.some((o) => o.id === 'fenetre-sde')).toBe(false);
  });
});

describe('raccourcir un mur sous sa fenêtre', () => {
  it('la fenêtre plus large que le mur qui reste se rabote, sans sortir du mur', () => {
    // Le mur ouest du bureau (1,80 m) porte une fenêtre d'un mètre.
    S().setWallLength('ouest', 0.9);
    const m = S().walls.find((w) => w.id === 'ouest')!;
    const f = ouv('fenetre-bureau');
    const zs = [m.a.z, m.b.z];
    for (const p of [f.a, f.b]) {
      expect(p.z).toBeGreaterThanOrEqual(Math.min(...zs) - 1e-6);
      expect(p.z).toBeLessThanOrEqual(Math.max(...zs) + 1e-6);
    }
    expect(segLength(f)).toBeLessThan(0.9);
  });
});

describe('déplacer une pièce', () => {
  it('emporte ses notes et ses cotes à la règle, pas celles des voisines', () => {
    const chambre = S().rooms.find((r) => r.name === 'Chambre')!;
    S().addNote('Tableau à remplacer', { x: 6.5, z: 1.8 });
    S().addNote('Dans le séjour', { x: 2, z: 2 });
    S().addMesure({ x: 5.5, z: 1 }, { x: 7.5, z: 1 });
    S().moveRoom(chambre.id, 0, 3, false);
    const [n1, n2] = S().notes.slice(-2);
    expect(n1.at).toEqual({ x: 6.5, z: 4.8 });
    expect(n2.at).toEqual({ x: 2, z: 2 });
    const m = S().mesures.at(-1)!;
    expect(m.a.z).toBeCloseTo(4, 6);
    expect(m.b.z).toBeCloseTo(4, 6);
  });
});

describe('couper un mur (manque comblé)', () => {
  it('deux pans soudés ; les pièces comptent sur les deux, l’appareillage suit son pan', () => {
    const sejour = S().rooms.find((r) => r.name.startsWith('Séjour'))!;
    S().addFixture('prise', 'nord', 4.8);
    const prise = S().fixtures.at(-1)!;
    const id = S().couperMur('nord', 2.5)!;
    expect(id).toBeTruthy();
    const a = S().walls.find((w) => w.id === 'nord')!;
    const b = S().walls.find((w) => w.id === id)!;
    expect(segLength(a)).toBeCloseTo(2.5, 6);
    expect(segLength(b)).toBeCloseTo(2.5, 6);
    expect(a.b).toEqual(b.a);
    expect(S().rooms.find((r) => r.id === sejour.id)!.wallIds).toEqual(expect.arrayContaining(['nord', id]));
    const p = S().fixtures.find((f) => f.id === prise.id)!;
    expect(p.wallId).toBe(id);
    expect(p.along).toBeCloseTo(prise.along - 2.5, 6);
    // La surface ne bouge pas.
    const aire = (w: WallSeg[]) => roomParts(w, S().rooms).find((q) => q.roomId === sejour.id)!.surface!.area;
    expect(aire(S().walls)).toBeGreaterThan(20);
  });

  it('jamais au milieu d’une fenêtre, ni à un bout', () => {
    expect(S().couperMur('nord', 1.5)).toBeNull();
    expect(S().couperMur('nord', 0.05)).toBeNull();
    expect(S().couperMur('nord', 4.97)).toBeNull();
  });
});

describe('dupliquer une menuiserie (manque comblé)', () => {
  it('la même, à côté, sur le même mur ; refusée quand la place manque', () => {
    S().reset();
    const piece = S().addRoomLibre(4, 3, 'Salon', { auNu: true })!;
    // Le mur du haut (4 m et ses deux demi-épaisseurs).
    const mur = S().walls.find((w) => w.roomId === piece && Math.abs(w.a.z - w.b.z) < 1e-6 && Math.min(w.a.z, w.b.z) < 0.01)!;
    const f = S().addOpening(mur.id, 'window')!;
    const copie = S().dupliquerOuverture(f)!;
    expect(copie).toBeTruthy();
    const c = ouv(copie);
    const o = ouv(f);
    expect(segLength(c)).toBeCloseTo(segLength(o), 6);
    expect(c.height).toBe(o.height);
    expect(c.yCenter).toBe(o.yCenter);
    expect(murDeLOuverture(c, S().walls)?.id).toBe(mur.id);
    const iv = S()
      .openings.map((x) => [Math.min(x.a.x, x.b.x), Math.max(x.a.x, x.b.x)] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    expect(seRecouvrent(iv)).toBe(false);
    // Trois fenêtres de 1,20 tiennent sur 4 m ; une quatrième, non.
    expect(S().dupliquerOuverture(f)).toBeTruthy();
    expect(S().dupliquerOuverture(f)).toBeNull();
    const toutes = S()
      .openings.map((x) => [Math.min(x.a.x, x.b.x), Math.max(x.a.x, x.b.x)] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    expect(toutes).toHaveLength(3);
    expect(seRecouvrent(toutes)).toBe(false);
  });
});
