/**
 * LA PAGE DE GARDE DU DOSSIER.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le dossier
 * s'ouvrait directement sur le plan coté. Un dossier qu'on remet à un
 * acheteur, à un artisan ou à un client commence par dire de quoi il s'agit :
 * le logement, à qui il est, ses surfaces, une vue d'ensemble, et ce que
 * contient chaque feuille.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { resumeDuDossier } from '../src/components/ApercuDuDossier';
import { buildScanPdf, sommaireDuDossier } from '../src/export/pdf';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
const pages = (b: Uint8Array) => (latin1(b).match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

let n = 0;
const mur = (ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id: `m${n++}`,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
const walls = [
  mur(0, 0, 4, 0),
  mur(4, 0, 9, 0),
  mur(9, 0, 9, 4),
  mur(9, 4, 4, 4),
  mur(4, 4, 0, 4),
  mur(0, 4, 0, 0),
  mur(4, 0, 4, 4),
];
const rooms = detectRooms(walls).map((r, i) => ({ id: `r${i + 1}`, wallIds: r.wallIds }));
const scan = {
  name: 'Appartement Martin',
  walls,
  openings: [],
  objects: [],
  rooms,
  roomNames: { r1: 'Chambre', r2: 'Séjour' },
  client: 'Claire Martin',
  address: '8 rue Pasteur, Lyon',
  particulier: true,
};

/** La première feuille du PDF : tout ce qui précède le premier `endstream`. */
const premiereFeuille = (pdf: Uint8Array) => {
  const src = latin1(pdf);
  const debut = src.indexOf('stream');
  return src.slice(debut, src.indexOf('endstream', debut));
};

describe('la page de garde', () => {
  it('ouvre le dossier quand on la demande, et le sommaire l’annonce', () => {
    const avec = sommaireDuDossier(scan, true, { metre: true, garde: true });
    expect(avec[0]).toEqual({ genre: 'garde', titre: 'Page de garde' });
    // Le logement d'abord, la perspective en tête (revue « structure »).
    expect(avec[1].genre).toBe('perspective');
    expect(avec[2].genre).toBe('plan');
    const sans = sommaireDuDossier(scan, true, { metre: true });
    expect(sans[0].genre).toBe('perspective');
    // Sans cotes 3D, une feuille de plus… et une de moins : la perspective
    // sous l'angle de la garde ne se répète plus (revues du dossier). Cotée,
    // elle apprend quelque chose que la garde ne montre pas : elle reste.
    expect(pages(buildScanPdf(scan, true, { metre: true, garde: true, measures3D: false }))).toBe(
      pages(buildScanPdf(scan, true, { metre: true, measures3D: false })),
    );
    expect(pages(buildScanPdf(scan, true, { metre: true, garde: true }))).toBe(
      pages(buildScanPdf(scan, true, { metre: true })) + 1,
    );
    expect(pages(buildScanPdf(scan, false, { metre: true, garde: true }))).toBe(
      pages(buildScanPdf(scan, false, { metre: true })) + 1,
    );
  });

  it('dit le logement, à qui il est, ses surfaces et le contenu du dossier', () => {
    const garde = premiereFeuille(buildScanPdf(scan, true, { metre: true, garde: true }));
    expect(garde).toContain('(Appartement Martin) Tj');
    expect(garde).toContain('Claire Martin');
    expect(garde).toContain('8 rue Pasteur, Lyon');
    // Deux pièces, 36 m² au sol.
    expect(garde).toContain('(2) Tj');
    expect(garde).toContain('36,00 m²');
    // Le sommaire, avec le numéro de chaque feuille.
    expect(garde).toContain('Contenu du dossier');
    // Les titres que portent les feuilles (revue « structure »).
    expect(garde).toContain('(Plan d\x92ensemble coté) Tj');
    expect(garde).toContain('(Métré par pièce) Tj');
    // La perspective sous l'angle de la garde garde sa feuille cotée.
    expect(garde).toContain('(Perspective cotée) Tj');
  });

  it('porte l’entreprise de l’artisan quand il en a une', () => {
    const garde = premiereFeuille(
      buildScanPdf({ ...scan, particulier: false, modeElec: true, entreprise: { nom: 'Électricité Dupont', telephone: '06 12 34 56 78' } }, false, {
        garde: true,
      }),
    );
    expect(garde).toContain('Électricité Dupont');
    expect(garde).toContain('Dossier de chantier');
  });

  it('les murs de face se résument en une ligne, pas une par mur', () => {
    const garde = premiereFeuille(
      buildScanPdf(scan, false, { metre: false, garde: true, elevations: true, toutesElevations: true }),
    );
    expect(garde).toContain('(Élévations) Tj');
    expect(garde).not.toContain('(Mur 2) Tj');
  });

  it('l’aperçu la compte, et compte le métré une fois même sur deux feuilles', () => {
    expect(
      resumeDuDossier([
        { genre: 'garde', titre: 'Page de garde' },
        { genre: 'plan', titre: 'Plan coté' },
        { genre: 'metre', titre: 'Métré' },
        { genre: 'metre', titre: 'Métré (suite)' },
      ]),
    ).toBe('1 page de garde · 1 plan · 1 métré');
  });
});
