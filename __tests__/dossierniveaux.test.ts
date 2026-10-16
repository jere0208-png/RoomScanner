/**
 * TOUS LES NIVEAUX DANS UN MÊME DOSSIER.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le dossier ne
 * sortait que l'étage affiché. Une maison à étage partait en deux PDF, et
 * personne n'avait le logement entier sous les yeux. Chaque niveau garde
 * ses feuilles — son plan, son métré, ses perspectives — titrées de son
 * nom ; la page de garde et les achats valent pour tout le logement ; les
 * feuilles électriques restent celles du niveau où l'on travaille.
 */
import { buildScanPdf, sommaireDuDossier } from '../src/export/pdf';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { HYPOTHESES, type PieceTravaux } from '../src/geometry/travaux';

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
/** Un niveau rectangulaire d'une pièce, de `l` × `p` mètres. */
function niveau(l: number, p: number, nom: string) {
  const walls = [mur(0, 0, l, 0), mur(l, 0, l, p), mur(l, p, 0, p), mur(0, p, 0, 0)];
  const rooms = detectRooms(walls).map((r) => ({ id: `${nom}-piece`, wallIds: r.wallIds }));
  return { walls, openings: [], objects: [], rooms, roomNames: { [`${nom}-piece`]: nom } };
}

const RDC = niveau(6, 5, 'Séjour'); // 30 m²
const ETAGE = niveau(4, 3, 'Chambre'); // 12 m²
const logement = {
  name: 'Maison Martin',
  ...RDC,
  client: 'Claire Martin',
  particulier: true,
};
const niveaux = [
  { nom: 'Rez-de-chaussée', scan: RDC, courant: true },
  { nom: '1er étage', scan: ETAGE },
];

describe('un dossier pour toute la maison', () => {
  it('chaque niveau a son plan et son métré, titrés de son nom', () => {
    const titres = sommaireDuDossier(logement, false, { metre: true, niveaux }).map((f) => f.titre);
    expect(titres).toEqual([
      'Plan coté — Rez-de-chaussée',
      'Métré — Rez-de-chaussée',
      'Plan coté — 1er étage',
      'Métré — 1er étage',
    ]);
    // Et le PDF imprime ce que le sommaire annonce.
    expect(pages(buildScanPdf(logement, false, { metre: true, niveaux }))).toBe(4);
  });

  it('le cartouche de chaque feuille dit son niveau', () => {
    const src = latin1(buildScanPdf(logement, false, { metre: false, niveaux }));
    // Le tiret cadratin s'écrit d'un octet WinAnsi.
    expect(src).toMatch(/\(Maison Martin . 1er étage\) Tj/);
  });

  it('le titre de chaque feuille dit son niveau, pas seulement le cartouche', () => {
    const src = latin1(buildScanPdf(logement, false, { metre: true, niveaux }));
    expect(src).toMatch(/\(Plan d.ensemble coté . 1er étage\) Tj/);
    expect(src).toMatch(/\(Métré par pièce . Rez-de-chaussée\) Tj/);
  });

  it('la page de garde compte tout le logement', () => {
    const src = latin1(buildScanPdf(logement, false, { metre: false, garde: true, niveaux }));
    const garde = src.slice(src.indexOf('stream'), src.indexOf('endstream'));
    // Deux pièces, 42 m² sur les deux niveaux.
    expect(garde).toContain('(2) Tj');
    expect(garde).toContain('42,00 m²');
    expect(garde).toContain('Rez-de-chaussée');
    expect(garde).toContain('1er étage');
  });

  it('les achats valent pour tout le logement, une seule fois', () => {
    const pieces: PieceTravaux[] = [
      { roomId: 'Séjour-piece', nom: 'Rez-de-chaussée · Séjour', sol: 30, plafond: 30, perimetre: 22, hauteur: 2.5, murs: 55, plinthes: 22, portes: 0, fenetres: 0 },
      { roomId: 'Chambre-piece', nom: '1er étage · Chambre', sol: 12, plafond: 12, perimetre: 14, hauteur: 2.5, murs: 35, plinthes: 14, portes: 0, fenetres: 0 },
    ];
    const sommaire = sommaireDuDossier(logement, false, {
      metre: false,
      niveaux,
      achats: { pieces, hypotheses: HYPOTHESES, prix: null },
    });
    expect(sommaire.filter((f) => f.genre === 'achats')).toHaveLength(1);
    expect(sommaire.find((f) => f.genre === 'achats')!.titre).toBe('Ce qu’il faut acheter');
  });

  it('les feuilles électriques restent au niveau courant', () => {
    const existant = {
      departs: [{ id: 'd1', repere: 'Q1', calibre: 16, nature: 'prises' }],
    };
    const sommaire = sommaireDuDossier(logement, false, { metre: false, niveaux, existant: existant as never });
    const tableaux = sommaire.filter((f) => f.genre === 'existant');
    expect(tableaux).toHaveLength(1);
    expect(tableaux[0].titre).toBe('Tableau existant — Rez-de-chaussée');
  });

  it('un seul niveau : le dossier d’avant, sans suffixe', () => {
    const titres = sommaireDuDossier(logement, false, { metre: true, niveaux: [niveaux[0]] }).map((f) => f.titre);
    expect(titres).toEqual(['Plan coté', 'Métré']);
  });
});
