/**
 * LES PETITS COUACS DU MÉTRÉ ET DU DOSSIER PDF — relevés des testeurs
 * « rénovation », « artisan », « immobilier », « architecte », « senior »,
 * « électricien » et de la revue des exports.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appartementExemple } from '../src/data/exemple';
import { PHOTO_A_BLANC, buildScanPdf, pdfImage, sommaireDuDossier, toBase64 } from '../src/export/pdf';
import type { Fixture } from '../src/geometry/electrical';
import type { RoomPart, WallSeg } from '../src/geometry/floorplan';
import { surfacesHabitables } from '../src/geometry/habitable';
import { achats, travauxDesPieces, type PieceTravaux } from '../src/geometry/travaux';
import { lignesDeLaLegende } from '../src/screens/ResultScreen';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

let n = 0;
const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
  ...extra,
});
/** Une baie ; `bas` : la hauteur de son pied au-dessus du sol. */
const baie = (type: 'door' | 'window', ax: number, az: number, bx: number, bz: number, height: number, bas = 0): WallSeg => ({
  id: `o${n++}`,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: bas + height / 2,
});
/** Une pièce rectangulaire, son contour à l'axe ; `nu` : rentré de tant. */
const piece = (id: string, x1: number, z1: number, opts: { nu?: number; epaisseur?: number; aire?: number } = {}): RoomPart => {
  const e = opts.epaisseur !== undefined ? { epaisseur: opts.epaisseur } : {};
  const walls = [
    mur(`${id}-n`, 0, 0, x1, 0, e),
    mur(`${id}-e`, x1, 0, x1, z1, e),
    mur(`${id}-s`, x1, z1, 0, z1, e),
    mur(`${id}-o`, 0, z1, 0, 0, e),
  ];
  const rect = (k: number) => [
    { x: k, z: k },
    { x: x1 - k, z: k },
    { x: x1 - k, z: z1 - k },
    { x: k, z: z1 - k },
  ];
  const k = opts.nu ?? 0;
  return {
    roomId: id,
    walls,
    surface: {
      pts: rect(0),
      ...(opts.nu !== undefined ? { nu: rect(k) } : {}),
      area: opts.aire ?? (x1 - 2 * k) * (z1 - 2 * k),
      exact: true,
    },
    centroid: { x: x1 / 2, z: z1 / 2 },
    labelAt: { x: x1 / 2, z: z1 / 2 },
  } as unknown as RoomPart;
};
const nom = (id: string) => id;

describe('le métré des travaux', () => {
  it('écrit les surfaces au centième, comme le métré du dossier', () => {
    // Revues « rénovation » et « artisan » : 20,36 au métré, 20,40 à l'estimatif.
    const [p] = travauxDesPieces([piece('sejour', 5, 4.1, { aire: 20.364 })], [], nom);
    expect(p.sol).toBe(20.36);
    expect(p.plafond).toBe(20.36);
    // 18,2 m de tour × 2,5 = 45,5 m² : pas de traîne de virgule flottante.
    expect(String(p.murs)).toBe('45.5');
  });

  it('une porte-fenêtre arrête la plinthe ; une fenêtre à allège, non', () => {
    const portefenetre = baie('window', 1, 0, 2.4, 0, 2.15);
    const fenetre = baie('window', 1, 0, 2.2, 0, 1.25, 0.9);
    const [avecPf] = travauxDesPieces([piece('a', 4, 3)], [portefenetre], nom);
    const [avecF] = travauxDesPieces([piece('b', 4, 3)], [fenetre], nom);
    // 14 m de tour, moins 1,40 m de seuil.
    expect(avecPf.plinthes).toBeCloseTo(12.6, 6);
    expect(avecF.plinthes).toBeCloseTo(14, 6);
    // Elle reste une fenêtre au compte.
    expect([avecPf.portes, avecPf.fenetres]).toEqual([0, 1]);
  });

  it('les barres de plinthe comptent la chute des coupes', () => {
    // 4,70 m + 10 % = 5,17 m : trois barres de 2,40, et non deux.
    const p = { plinthes: 4.7, sol: 0, plafond: 0, murs: 0 } as PieceTravaux;
    expect(achats([p]).plinthes.barres).toBe(3);
    expect(achats([{ ...p, plinthes: 0 }]).plinthes.barres).toBe(0);
  });

  it('le mur d’accent se mesure au nu, même contre un mur épais', () => {
    // Un mur ancien de 40 cm : le nu est à 20 cm de l'axe.
    const part = piece('salon', 5.4, 4.4, { nu: 0.2, epaisseur: 0.4 });
    const [p] = travauxDesPieces([part], [], nom, () => ({ peinture: 'sauge', accents: { 'salon-n': 'terracotta' } }));
    const accent = p.teintes?.find((t) => t.cle === 'terracotta');
    // 5,00 m au nu × 2,50 = 12,5 m² (13,5 à l'axe ; rien du tout avant).
    expect(accent?.surface).toBe(12.5);
    expect(p.teintes?.reduce((t, x) => t + x.surface, 0)).toBeCloseTo(p.murs, 1);
  });
});

describe('la surface habitable, d’après le nom des pièces', () => {
  it('l’escalier, le box, la cour, la dépendance, la cuisine d’été ne comptent pas', () => {
    const noms = ['Escalier', 'Trémie', 'Box', 'Parking', 'Cour', 'Patio', 'Jardin', 'Dépendance', 'Pool house', 'Cuisine d’été', 'Abri de jardin'];
    const parts = noms.map((_, i) => piece(`p${i}`, 3, 2));
    const rooms = noms.map((x, i) => ({ id: `p${i}`, name: x }));
    const h = surfacesHabitables(rooms, parts);
    expect(h.pieces.map((p) => [rooms.find((r) => r.id === p.roomId)!.name, p.habitable])).toEqual(noms.map((x) => [x, 0]));
  });

  it('mais la cuisine, le séjour sur cour et la chambre abricot restent des pièces', () => {
    const noms = ['Cuisine', 'Chambre abricot', 'Bureau', 'Séjour sur cour'];
    const parts = noms.map((_, i) => piece(`q${i}`, 3, 2));
    const rooms = noms.map((x, i) => ({ id: `q${i}`, name: x }));
    const h = surfacesHabitables(rooms, parts);
    expect(h.pieces.map((p) => p.habitable)).toEqual([6, 6, 6, 6]);
  });
});

/* ------------------------------------------------------------- le dossier */

const W: WallSeg[] = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('w', 0, 4, 0, 0)];
const R = [{ id: 'r1', name: 'Séjour', wallIds: W.map((w) => w.id) }];
const FX: Fixture[] = [{ id: 'pr', kind: 'prise', wallId: 'n', along: 4.2, height: 0.25, side: 1 }];
const FENETRE: WallSeg = { ...baie('window', 2, 4, 3.2, 4, 1.25, 0.9), roomId: 'r1' };
/** Un vrai en-tête JPEG de 8 × 6 (voir `elevationpdf.test`). */
const JPEG_B64 = (() => {
  const o = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
  for (const c of 'JFIF\0') o.push(c.charCodeAt(0));
  o.push(1, 1, 0, 0, 1, 0, 1, 0, 0);
  o.push(0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x06, 0x00, 0x08, 0x03);
  for (let i = 0; i < 9; i++) o.push(0);
  o.push(0xff, 0xd9);
  return toBase64(new Uint8Array(o));
})();
const SCAN = {
  name: 'Séjour',
  walls: W,
  openings: [FENETRE],
  objects: [],
  rooms: R,
  roomNames: { r1: 'Séjour' },
  fixtures: FX,
};
const images = (src: string) => (src.match(/\/Subtype \/Image/g) ?? []).length;

describe('la page de garde et le cartouche', () => {
  const garde = (extra: object) => {
    const src = latin1(buildScanPdf({ ...SCAN, address: '8 rue Pasteur', client: 'M. Martin', ...extra }, false, { garde: true }));
    const debut = src.indexOf('stream');
    return src.slice(debut, src.indexOf('endstream', debut));
  };

  it('l’agence imprime un dossier du logement, l’électricien un dossier de chantier', () => {
    const agence = garde({ particulier: false, entreprise: { nom: 'Agence du Parc' } });
    expect(agence).toContain('(Dossier du logement) Tj');
    expect(agence).toContain('(ADRESSE) Tj');
    expect(agence).toContain('(CLIENT) Tj');
    expect(agence).not.toContain('chantier');
    const elec = garde({ particulier: false, modeElec: true, entreprise: { nom: 'Élec Dupont' } });
    expect(elec).toContain('(Dossier de chantier) Tj');
    expect(elec).toContain('(CHANTIER) Tj');
  });

  it('les étiquettes du cartouche, en 7,5 pt et en gris foncé', () => {
    const src = latin1(buildScanPdf(SCAN, false, {}));
    for (const mot of ['PROJET', 'DATE', 'DOCUMENT', 'FEUILLE']) {
      expect(src).toMatch(new RegExp(`/F1 7\\.5 Tf 0\\.35 0\\.39 0\\.45 rg [^()]*\\(${mot}\\) Tj`));
    }
  });
});

describe('les feuilles de plan', () => {
  it('un mur supposé porteur le dit dans la légende', () => {
    const porteur = (devinee: boolean) =>
      latin1(
        buildScanPdf(
          { ...SCAN, walls: W.map((w) => (w.id === 'n' ? { ...w, nature: 'porteur' as const, natureDevinee: devinee } : w)) },
          false,
          { metre: false },
        ),
      );
    expect(porteur(true)).toContain('(Mur porteur \\(suppos\u00e9, \u00e0 confirmer\\)) Tj');
    expect(porteur(false)).toContain('(Mur porteur, ma\u00e7onnerie) Tj');
    expect(porteur(false)).not.toContain('confirmer');
  });

  it('la feuille « Projet » porte les repères du carnet, pas l’« État existant »', () => {
    const ex = appartementExemple();
    const travaux = (ex.walls as WallSeg[]).map((w) => (w.id.startsWith('bureau-est') ? { ...w, nature: 'demolir' as const } : w));
    const src = latin1(
      buildScanPdf(
        { name: 'Exemple', walls: travaux, openings: ex.openings, objects: [], rooms: ex.rooms, roomNames: {}, fixtures: [] } as never,
        false,
        { metre: true },
      ),
    );
    const feuilles = src.split('(FEUILLE)');
    const projet = feuilles.find((f) => f.includes('(Projet) Tj'))!;
    const existant = feuilles.find((f) => /\(.tat existant\) Tj/.test(f))!;
    expect(projet).toBeDefined();
    for (const r of ['(P1) Tj', '(F1) Tj']) expect(projet).toContain(r);
    expect(existant).not.toContain('(F1) Tj');
  });
});

describe('les photos du dossier', () => {
  it('la photo à blanc se lit, et le sommaire compte les feuilles du vrai dossier', () => {
    expect(pdfImage('Im0', PHOTO_A_BLANC)).not.toBeNull();
    const photos = (b64: string) => ['e', 'e'].map((wallId) => ({ wallId, base64: b64 }));
    const opts = { metre: false, elevations: true, toutesElevations: true };
    const vrai = sommaireDuDossier({ ...SCAN, photos: photos(JPEG_B64) }, false, opts);
    expect(sommaireDuDossier({ ...SCAN, photos: photos(PHOTO_A_BLANC) }, false, opts)).toEqual(vrai);
    // L'écran d'export la pose bien à la place de chaque photo.
    expect(lire('src/screens/ExportScreen.tsx')).toMatch(/base64: PHOTO_A_BLANC/);
  });

  it('n’embarque que les vignettes montrées : trois par mur, et rien sans feuille', () => {
    const cinq = [0, 1, 2, 3, 4].map(() => ({ wallId: 'n', base64: JPEG_B64 }));
    expect(images(latin1(buildScanPdf({ ...SCAN, photos: cinq }, false, { metre: false, elevations: true })))).toBe(3);
    expect(images(latin1(buildScanPdf({ ...SCAN, photos: cinq }, false, { metre: false })))).toBe(0);
  });
});

describe('« Aucun appareil sur ce mur. »', () => {
  it('s’écrit sous la chaîne de cotes, plus dans la fenêtre', () => {
    const src = latin1(buildScanPdf(SCAN, false, { metre: false, elevations: true, toutesElevations: true }));
    const sols = [...src.matchAll(/RG 2 w \[\] 0 d 1 J 1 j (\S+) (\S+) m (\S+) (\S+) l/g)]
      .filter((m) => m[2] === m[4])
      .map((m) => Number(m[2]));
    const mentions = [...src.matchAll(/(\S+) (\S+) Tm \(Aucun appareil sur ce mur\.\) Tj/g)].map((m) => Number(m[2]));
    expect(mentions.length).toBeGreaterThan(0);
    for (const y of mentions) {
      // Le sol le plus proche au-dessus : la mention est 40 points dessous.
      const sol = Math.min(...sols.filter((s) => s > y));
      expect(sol - y).toBeCloseTo(40, 0);
    }
  });
});

describe('l’écran', () => {
  it('la légende de l’image partagée dit combien de pièces elle tait', () => {
    const vingt = Array.from({ length: 20 }, (_, i) => i);
    expect(lignesDeLaLegende(vingt)).toEqual({ lignes: vingt.slice(0, 14), autres: '+ 6 autres pièces' });
    expect(lignesDeLaLegende(vingt.slice(0, 15)).autres).toBe('+ 1 autre pièce');
    expect(lignesDeLaLegende(vingt.slice(0, 14))).toEqual({ lignes: vingt.slice(0, 14), autres: null });
  });

  it('la fiche ne promet plus le chiffre d’une annonce', () => {
    const src = lire('src/screens/result/FichePieceSheet.tsx');
    expect(src).toContain('Estimation, pas un mesurage Carrez certifié');
    expect(src).not.toContain('Celle d’une annonce');
  });
});
