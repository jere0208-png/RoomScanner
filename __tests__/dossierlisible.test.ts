/**
 * LE DOSSIER SE LIT — regardé page par page, en image.
 *
 * Passe au doigt sur le document lui-même : on le fabrique complet (plan
 * coté, plafond, notes, boussole, client), on le rend en image, et on
 * REGARDE. Deux mots se mangeaient l'un l'autre.
 *
 * LA ROSE DES VENTS SUR LE SOUS-TITRE. « … cotes d'appareil en centimètres.
 * · Surface relevée : 21,0 m² » courait jusqu'au coin haut-droit, où la rose
 * l'attendait : on perdait le premier chiffre qu'on cherche sur un plan de
 * logement ET la seule chose qui dit de quel mur on parle.
 *
 * LE CARTOUCHE SUR LE SIGLE DU PLAFOND. « DCL » disparaissait sous « Séjour
 * · 12,0 m² » : un point lumineux se pose au milieu de la pièce, le
 * cartouche aussi, et le cartouche se peint après — avec son fond blanc.
 *
 * Trois écritures se disputent ce milieu, et la règle est celle des
 * libertés : le sigle n'en a aucune (il tient sous son symbole), le
 * cartouche en a un peu, la cote en a beaucoup (elle glisse le long de son
 * trait). Chacun s'écarte de ce qui est plus contraint que lui.
 */
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
import type { CeilingFixture } from '../src/geometry/ceiling';

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
  mur('o', 0, 4, 0, 0),
];

/** Le point lumineux est au MILIEU : là où le cartouche se pose aussi. */
const PLAFOND: CeilingFixture[] = [
  { id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } },
];

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

interface Mot {
  texte: string;
  x: number;
  y: number;
  taille: number;
}

/** Les mots de la feuille du plan, avec leur place sur la page. */
const motsDu = (source: string): Mot[] => {
  const page = source.split('(FEUILLE)')[0];
  const re = /BT \/F\d ([\d.]+) Tf [^]*?([-\d.]+) ([-\d.]+) Tm \(([^)]*)\) Tj/g;
  const vus: Mot[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(page))) {
    vus.push({ taille: Number(m[1]), x: Number(m[2]), y: Number(m[3]), texte: m[4] });
  }
  return vus;
};

const emprise = (m: Mot) => ({
  x: m.x,
  y: m.y,
  w: m.texte.length * m.taille * 0.5,
  h: m.taille,
});

const seTouchent = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const dossier = (avecNord: boolean) =>
  latin1(
    buildScanPdf(
      {
        name: 'T2 Pasteur',
        walls: PIECE,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1' }],
        roomNames: { r1: 'Sejour' },
        north: avecNord ? 12 : null,
      } as never,
      false,
      { ceiling: PLAFOND, showSurfaces: true, metre: false } as never,
    ),
  );

describe('la tête de la feuille du plan', () => {
  /*
    LA ROSE OCCUPE LE COIN HAUT-DROIT : c'est sa place sur un plan
    d'architecte, et c'est là qu'on va la chercher. Le texte, lui, s'arrête
    avant — ou passe à la ligne.
  */
  // Le centre est a (FRAME.x + FRAME.w - 44 ; TETE - 12), les lettres a
  // vingt-deux points : la rose tient dans ce carre-la.
  const ROSE = { x: 495, y: 744, w: 52, h: 52 };

  it('n’écrit rien sous la rose des vents', () => {
    const mots = motsDu(dossier(true)).filter(
      // Les quatre lettres de la rose sont la rose, pas du texte.
      (m) => m.texte.length > 1 && m.y > 700,
    );
    const dessous = mots.filter((m) => seTouchent(emprise(m), ROSE));
    expect(dessous.map((m) => m.texte)).toEqual([]);
  });

  it('et garde la surface relevée, à la ligne s’il le faut', () => {
    const vu = motsDu(dossier(true)).map((m) => m.texte);
    expect(vu.some((t) => t.includes('Surface relev'))).toBe(true);
  });

  it('ne déborde jamais de la feuille, boussole ou pas', () => {
    // Le cadre s'arrete a 565 points ; on garde la marge du cartouche.
    for (const avecNord of [true, false]) {
      for (const m of motsDu(dossier(avecNord)).filter((x) => x.y > 700)) {
        expect(m.x + emprise(m).w).toBeLessThanOrEqual(565);
      }
    }
  });
});

describe('le cartouche de la pièce', () => {
  it('ne recouvre pas le sigle du point lumineux', () => {
    const mots = motsDu(dossier(true));
    const dcl = mots.find((m) => m.texte === 'DCL')!;
    const nom = mots.find((m) => m.texte === 'Sejour')!;
    const aire = mots.find((m) => /m²$/.test(m.texte) && m.y < 700)!;
    expect(dcl).toBeDefined();
    expect(nom).toBeDefined();
    // Le fond blanc du cartouche couvre ses deux lignes : on juge sur elles.
    expect(seTouchent(emprise(dcl), emprise(nom))).toBe(false);
    expect(seTouchent(emprise(dcl), emprise(aire))).toBe(false);
    // Et le cartouche reste PRÈS du milieu : il désigne sa pièce, il ne
    // part pas se poser dans un coin.
    expect(Math.abs(nom.y - dcl.y)).toBeLessThan(60);
  });
});
