/**
 * LA ROSE DES VENTS EST DE SÉRIE — sur le plan 2D, et seulement là.
 *
 * Elle a été une option « Nord », éteinte par défaut : le patron a tranché
 * — pas de bouton, la rose s'imprime d'office. Un dossier désigne ses murs
 * par leur cardinal (« Prise plinthe 1 · mur nord ») : le repère qui permet
 * de le vérifier sur place n'est pas un ornement qu'on coche, c'est une
 * pièce du document. Et il vit sur LE PLAN 2D SEULEMENT : c'est la feuille
 * qu'on oriente ; sur une perspective, quatre lettres au bord du cadre ne
 * désignent plus rien.
 *
 * Elle garde son honnêteté : sans cap relevé au scan, pas de rose — un
 * nord inventé est pire que pas de nord du tout.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
];

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const dossier = (surcharge: object = {}) =>
  latin1(
    buildScanPdf(
      {
        name: 'Chantier',
        walls: MURS,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1' }],
        roomNames: { r1: 'Chambre' },
        north: 0,
        fixtures: [
          {
            id: 'f1',
            kind: 'prise',
            wallId: 'n',
            along: 1.2,
            height: 0.25,
            side: 1,
          },
        ],
        ...surcharge,
      },
      // Perspectives comprises : c'est ainsi qu'on prouve que la rose ne
      // s'imprime QUE sur la feuille du plan.
      true,
      { elevations: true },
    ),
  );

// La rose est un triangle rouge : c'est sa teinte qui la trahit dans le
// flux — une occurrence par feuille qui la dessine.
const roses = (src: string) => src.split('0.77 0.27 0.23 rg').length - 1;

describe('la rose des vents du dossier', () => {
  it('s’imprime de série, sur la seule feuille du plan 2D', () => {
    // Plan + métré + perspectives + élévations : UNE rose dans tout le
    // dossier — celle du plan.
    expect(roses(dossier())).toBe(1);
  });

  it('ne se refuse plus : l’ancienne option est ignorée', () => {
    // « compass » n'existe plus dans le type — un vieil appelant qui le
    // passerait encore (ici via la surcharge non typée) est ignoré : la
    // rose n'est pas un choix, c'est une pièce du document.
    expect(roses(dossier({ compass: false }))).toBe(1);
  });

  it('mais pas sans cap relevé : un nord inventé serait pire', () => {
    expect(roses(dossier({ north: null }))).toBe(0);
  });

  /**
   * L'outil : `UPDATE_BOUSSOLE=1 npx jest boussole` écrit le dossier
   * d'essai HBLEUS du dépôt (dossier temporaire), pour le regarder avec
   * `node tools/pdf-vers-svg.mjs` — une rose se juge à l'œil, pas au grep.
   */
  it('écrit le dossier d’essai quand on le demande', () => {
    if (!process.env.UPDATE_BOUSSOLE) {
      expect(true).toBe(true);
      return;
    }
    const chemin = join(tmpdir(), 'boussole-essai.pdf');
    writeFileSync(
      chemin,
      buildScanPdf(
        {
          name: 'Chantier',
          walls: MURS,
          openings: [],
          objects: [],
          rooms: [{ id: 'r1' }],
          roomNames: { r1: 'Chambre' },
          north: 30,
          fixtures: [],
        },
        true,
        {},
      ),
    );
    expect(chemin.length).toBeGreaterThan(0);
  });

  it('et les murs gardent leur nom dans tous les cas', () => {
    for (const north of [0, null]) {
      const src = dossier({ north });
      // Le titre d'une élévation nomme son mur quand le cap existe :
      // « Élévation — Chambre, mur nord » (WinAnsi, sans accent).
      expect(`cap ${north} : ${src.includes('mur nord')}`).toBe(
        `cap ${north} : ${north !== null}`,
      );
    }
  });
});
