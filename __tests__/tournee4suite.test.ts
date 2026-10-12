/**
 * TOURNÉE N°4, SUITE — ce que le reste de la tournée a relevé.
 *
 * - « Yasmine » : « Redétecter » et « Redresser » effaçaient la déco.
 * - « Mehdi » : le « Séjour-cuisine » n'avait pas les règles de la cuisine ;
 *   la prise de la hotte à 2 m était « trop haute » et comptait comme un
 *   socle ; à l'étage, « Aucun tableau électrique » (il est en bas) ; le
 *   PDF de l'étage sortait sans son plafond.
 * - « Claire » : la chaîne de façade du PDF se comptait au prorata de
 *   l'axe, ses cotes sortaient du cadre avec des murs de 45 cm, et la cote
 *   d'un pan coupé ignorait sa pièce.
 * - « Bernard » : « Trop bas · remettre à 25 cm » au-dessus d'un plan de
 *   travail.
 * - « Hugo », « Inès », « Fatou » : des noms en double partout.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore, floorsOf, nomDePieceLibre, couperLeNom } from '../src/store/scanStore';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import {
  checkElectrical,
  estCuisine,
  fixturePlacement,
  priseDeCuisine,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { buildScanPdf } from '../src/export/pdf';

const st = () => useScanStore.getState();

describe('la déco survit au recalcul', () => {
  it('peinture, sol et mur d’accent restent après « Redétecter »', () => {
    st().reset();
    st().commencerAuClavier();
    const id = st().addRoomLibre(5, 4, 'Séjour', { auNu: true })!;
    const mur = st().walls.find((w) => (st().rooms[0].wallIds ?? []).includes(w.id))!;
    useScanStore.setState({
      rooms: st().rooms.map((r) =>
        r.id === id ? { ...r, peinture: 'lin', sol: 'chene-clair', accents: { [mur.id]: 'terracotta' } } : r,
      ),
    });
    st().redetectRooms();
    const r = st().rooms[0];
    expect(r.peinture).toBe('lin');
    expect(r.sol).toBe('chene-clair');
    expect(Object.values(r.accents ?? {})).toEqual(['terracotta']);
    expect(r.wallIds).toContain(Object.keys(r.accents!)[0]);
  });
});

describe('la cuisine ouverte', () => {
  it('« Séjour-cuisine » est une cuisine, et ses prises du plan de travail aussi', () => {
    expect(estCuisine('Séjour-cuisine')).toBe(true);
    expect(estCuisine('Séjour')).toBe(false);
    const piece = { name: 'Séjour-cuisine' };
    expect(priseDeCuisine({ height: 1.1 }, piece)).toBe(true);
    // Une prise basse du coin salon reste au séjour.
    expect(priseDeCuisine({ height: 0.25 }, piece)).toBe(false);
    expect(priseDeCuisine({ height: 0.25 }, { name: 'Cuisine' })).toBe(true);
  });

  const controle = (nom: string, poser: (murId: string) => void) => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(6, 5, nom, { auNu: true });
    const mur = st().walls.find((w) => (st().rooms[0].wallIds ?? []).includes(w.id))!;
    poser(mur.id);
    const s = st();
    const entrees = roomInputsOf(
      s.rooms.map((r) => ({ ...r, name: r.name ?? '' })),
      roomParts(s.walls, s.rooms),
    );
    return checkElectrical(entrees, s.fixtures, wallToRooms(entrees), fixturePlacement(s.fixtures, s.walls, entrees));
  };

  it('pas d’alerte « 32 A hors cuisine », et ses quatre socles du plan de travail', () => {
    const constats = controle('Séjour-cuisine', (m) => st().addFixture('prise32', m));
    expect(constats.some((c) => c.code === 'cuisson')).toBe(false);
    expect(constats.some((c) => c.code === 'surPlan')).toBe(true);
    // Le même socle dans un séjour seul reste signalé.
    expect(controle('Séjour', (m) => st().addFixture('prise32', m)).some((c) => c.code === 'cuisson')).toBe(true);
  });

  it('la prise de la hotte à 2 m n’est pas « trop haute », et n’est pas un socle d’usage', () => {
    const constats = controle('Cuisine', (m) => {
      const id = st().addFixture('prise', m)!;
      const f = st().fixtures.find((x) => x.id === id)!;
      st().moveFixture(id, f.along, 2.0);
      st().setFixtureUsage(id, 'H');
    });
    expect(constats.some((c) => c.code === 'hauteur')).toBe(false);
    const socles = constats.find((c) => c.code === 'socles');
    expect(socles?.message).toMatch(/0 socle sur 6/);
  });
});

describe('ce qui vaut pour le logement se cherche dans tout le logement', () => {
  it('un tableau au rez-de-chaussée suffit à l’étage', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Chambre', { auNu: true });
    const mur = st().walls[0];
    st().addFixture('prise', mur.id);
    const s = st();
    const entrees = roomInputsOf(
      s.rooms.map((r) => ({ ...r, name: r.name ?? '' })),
      roomParts(s.walls, s.rooms),
    );
    const sans = checkElectrical(entrees, s.fixtures, wallToRooms(entrees), undefined, undefined, undefined, []);
    expect(sans.some((c) => c.code === 'tableau')).toBe(true);
    const avec = checkElectrical(entrees, s.fixtures, wallToRooms(entrees), undefined, undefined, undefined, [], undefined, {
      tableau: true,
      daaf: true,
    });
    expect(avec.some((c) => c.code === 'tableau')).toBe(false);
  });
});

describe('la façade du PDF, d’un nu à l’autre', () => {
  const latin1 = (b: Uint8Array) => {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  };
  it('les pleins en mètres réels, et toutes les cotes dans le cadre avec des murs de 45 cm', () => {
    st().reset();
    st().commencerAuClavier();
    const id = st().addRoomLibre(4, 3, 'Essai', { auNu: true })!;
    st().arreterPiece(id);
    for (const w of st().walls) st().setEpaisseurMur(w.id, 0.45);
    const nord = st().walls.find((w: WallSeg) => Math.abs(w.a.z - w.b.z) < 1e-6 && Math.min(w.a.z, w.b.z) < 0)!;
    const o = st().addOpening(nord.id, 'window')!;
    st().coterOuverture(o, { largeur: 1.0, hauteur: 1.2, allege: 0.9, depuis: 0.5 });
    const s = st();
    const src = latin1(
      buildScanPdf(
        {
          name: 'Essai',
          walls: s.walls,
          openings: s.openings,
          objects: [],
          rooms: s.rooms,
          fixtures: [],
          floors: floorsOf(s.rooms),
          roomNames: { [id]: 'Essai' },
        } as never,
        false,
        { metre: false, garde: false, measures2D: true } as never,
      ),
    );
    const page = src.slice(src.indexOf('stream\n'), src.indexOf('\nendstream'));
    // 0,50 + 1,00 + 2,50 = 4,00 : la chaîne tombe juste (elle disait 0,65 / 1,00 / 2,45).
    for (const t of ['(0,50)', '(1,00)', '(2,50)', '(4,00 m)']) expect(page).toContain(t);
    expect(page).not.toContain('(0,65)');
    // Les deux cotes de 3,00 m sont sur la feuille.
    expect(page.split('(3,00 m)').length - 1).toBe(2);
  });
});

describe('des noms qui ne se répètent pas', () => {
  it('le premier rang libre, et le numéro après la coupe', () => {
    expect(nomDePieceLibre('Chambre', ['Chambre', 'Bureau'])).toBe('Chambre 2');
    expect(nomDePieceLibre('Chambre', ['Bureau'])).toBe('Chambre');
    expect(nomDePieceLibre('Chambre', ['Chambre', 'Chambre 2', 'Chambre 4'])).toBe('Chambre 3');
    const long = 'Chambre du fond à gauche près de la fenêtre';
    const a = nomDePieceLibre(long, []);
    const b = nomDePieceLibre(long, [a]);
    expect(a).not.toBe(b);
    expect(Array.from(b).length).toBeLessThanOrEqual(40);
  });

  it('la coupe ne casse pas un émoji', () => {
    const nom = `${'a'.repeat(39)}😀😀`;
    const coupe = couperLeNom(nom, 40);
    expect(coupe).toBe(`${'a'.repeat(39)}😀`);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(coupe)).toBe(false);
  });

  it('deux gabarits « Salle de bains » ne s’appellent pas pareil', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(2.4, 2, 'Salle de bains', { auNu: true });
    st().addRoomLibre(2.4, 2, 'Salle de bains', { auNu: true });
    expect(st().rooms.map((r) => r.name)).toEqual(['Salle de bains', 'Salle de bains 2']);
  });

  it('deux copies d’un plan ont chacune leur nom', () => {
    const plan = { id: 'p1', name: 'Plan', createdAt: 1, updatedAt: 1, walls: [], openings: [], rooms: [], objects: [] };
    useScanStore.setState({ saves: [plan as never] });
    st().duplicateSave('p1');
    st().duplicateSave('p1');
    const copies = st().saves.map((x) => x.name).filter((n) => n.includes('copie'));
    expect(new Set(copies).size).toBe(2);
    const copie = st().saves.find((x) => x.name === 'Plan (copie)')!;
    st().duplicateSave(copie.id);
    expect(st().saves.some((x) => x.name.includes('(copie) (copie)'))).toBe(false);
  });
});
