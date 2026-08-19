/**
 * Ce que le PDF doit dire à l'électricien.
 *
 * Deux documents, une seule source. Le plan porte le TRACÉ des gaines quand
 * on le demande — et rien du tout quand on ne le demande pas, parce qu'un
 * plan d'architecte n'a pas à montrer le tirage. La liste, elle, porte le
 * tableau de tirage (diamètre, longueur, nombre de départs) et la commande
 * (couronnes, boîtes, plaques). Un chiffre qui apparaît des deux côtés doit
 * être le même : ils viennent du même métré.
 */
import { buildMaterialPdf, buildScanPdf } from '../src/export/pdf';
import { buyingList, pullSchedule } from '../src/geometry/conduits';
import { planRoutes } from '../src/geometry/elecplan';
import {
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
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

const PIECE: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

const ROOMS = [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }];

const FIXTURES: Fixture[] = [
  { id: 't', kind: 'tableau', wallId: 'w', along: 1, height: 1.35, side: 1 },
  { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
  { id: 'b', kind: 'prise', wallId: 'n', along: 3, height: 0.25, side: 1 },
  { id: 'c', kind: 'inter', wallId: 'e', along: 1, height: 1.1, side: 1 },
  { id: 'd', kind: 'rj45', wallId: 's', along: 2, height: 0.25, side: 1 },
];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

/** Le texte du PDF, parenthèses des opérateurs Tj mises bout à bout. */
const texte = (pdf: string) =>
  (pdf.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? [])
    .map((m) => m.slice(1, m.lastIndexOf(')')))
    .join(' | ');

const parts = roomParts(PIECE, ROOMS);
const placement = fixturePlacement(
  FIXTURES,
  PIECE,
  roomInputsOf(ROOMS, parts),
);
const plan = planRoutes(PIECE, ROOMS, parts, FIXTURES, placement)!;

describe('le plan des gaines', () => {
  const sans = latin1(
    buildScanPdf(
      { name: 'Essai', walls: PIECE, openings: [], objects: [], rooms: ROOMS, fixtures: FIXTURES },
      false,
      { metre: false },
    ),
  );
  const avec = latin1(
    buildScanPdf(
      {
        name: 'Essai',
        walls: PIECE,
        openings: [],
        objects: [],
        rooms: ROOMS,
        fixtures: FIXTURES,
        routes: plan.traces,
      },
      false,
      { metre: false },
    ),
  );

  it('n’apparaît que si on le demande', () => {
    // Le tireté du tirage : un motif de gaine, absent du plan nu.
    expect(sans).not.toContain('[4 3] 0 d');
    expect(avec).toContain('[4 3] 0 d');
  });

  it('trace un chemin par appareil desservi, le tableau excepté', () => {
    // Prises, interrupteur et RJ45 : tout ce qui est porté par un circuit.
    // Le tableau, lui, est le point de départ, pas une arrivée.
    expect(plan.traces.map((t) => t.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    // Et le document est plus long : il porte quelque chose de plus.
    expect(avec.length).toBeGreaterThan(sans.length);
  });

  it('ne fabrique aucun tracé sans tableau posé', () => {
    const sansTableau = FIXTURES.filter((f) => f.kind !== 'tableau');
    expect(
      planRoutes(PIECE, ROOMS, parts, sansTableau, placement),
    ).toBeNull();
  });
});

describe('la liste du matériel, version chantier', () => {
  const list = materialList(
    roomInputsOf(ROOMS, parts),
    FIXTURES,
    wallToRooms(roomInputsOf(ROOMS, parts)),
    placement,
    plan.parCircuit,
  );
  const pull = pullSchedule(list.circuits, plan.metre);
  const doc = texte(latin1(buildMaterialPdf('Essai', list, {
    pull,
    buy: buyingList(pull, FIXTURES),
  })));

  it('porte le tableau de tirage, diamètres compris', () => {
    expect(doc).toContain('Tirage');
    expect(doc).toMatch(/ICTA \S*20/);
    expect(doc).toContain('départ');
  });

  it('porte la commande, en bordereau : rayon, désignation, quantité, unité', () => {
    expect(doc).toContain('commander');
    // Les trois colonnes d'un bordereau, et les rayons qui les regroupent.
    expect(doc).toContain('Désignation');
    expect(doc).toContain('Qté');
    expect(doc).toContain('Unité');
    expect(doc).toContain('CONDUITS ET CONDUCTEURS');
    expect(doc).toContain('ENCASTREMENT ET FINITION');
    expect(doc).toMatch(/cour\. 100 m/);
    expect(doc).toMatch(/encastrement/);
    expect(doc).toMatch(/Plaque de finition 1 poste/);
    // Et plus une seule largeur de plaque : elle ne se commande pas.
    expect(doc).not.toContain('82 mm');
  });

  /**
   * L'EN-TÊTE D'UNE PIÈCE NE SE RÉPÈTE PAS.
   *
   * À droite du nom en gras, la feuille rappelait l'usage déduit et la
   * surface : « Séjour … Séjour · 20,0 m² ». Quand l'usage EST le nom — le
   * cas de toutes les pièces non renommées —, le rappel ne rappelle rien :
   * il bégaie. La surface suffit ; l'usage ne s'écrit que s'il apprend
   * quelque chose.
   */
  it('ne répète pas le nom de la pièce dans son rappel d’usage', () => {
    expect(doc).not.toMatch(/Séjour · [\d,]+ m²/);
    expect(doc).toMatch(/[\d,]+ m²/);
  });

  /**
   * LE PARAFOUDRE FIGURE AUX CONSTATS.
   *
   * L'app ne peut pas le trancher — il dépend de la zone kéraunique et du
   * branchement — mais un dossier réel le mentionne toujours. Se taire
   * ressemblerait à « rien à signaler », ce qui serait rassurer à tort.
   */
  it('mentionne le parafoudre dans la conformité, sans trancher', () => {
    expect(doc).toContain('arafoudre');
    expect(doc).toMatch(/v.rifier/);
  });

  it('rappelle la règle de remplissage — un chiffre sans sa règle ne vaut rien', () => {
    expect(doc).toContain('15-100');
    expect(doc).toContain('tiers');
  });

  it('sans tirage, la liste garde exactement sa forme d’avant', () => {
    const nu = texte(latin1(buildMaterialPdf('Essai', list)));
    expect(nu).not.toContain('Tirage');
    expect(nu).not.toContain('commander');
    expect(nu).toContain('Tableau');
  });

  /**
   * LA LIGNE « CÂBLE » NE PORTE PAS DE FAUSSE QUANTITÉ.
   *
   * « Câble — 27 m au total … | 1 » : ce « 1 » ne compte rien — la ligne
   * est un total en mètres, pas un article. Une colonne de quantités où se
   * glisse un nombre sans objet fait douter de toutes les autres.
   */
  it('la ligne Câble des fournitures n’affiche pas de quantité', () => {
    // Dans le flux, les parenthèses du libellé sont échappées : on ancre la
    // vérification sur le texte seul.
    expect(doc).toContain('hors chutes');
    expect(doc).not.toMatch(/hors chutes[^|]*\| 1( \||$)/);
  });

  it('les longueurs du document sont celles du plan, pas une autre estimation', () => {
    const c1 = pull.find((r) => r.cableLength > 0)!;
    expect(doc).toContain(`${c1.cableLength} m`);
    expect(c1.conduitLength).toBeLessThan(c1.cableLength);
  });
});
