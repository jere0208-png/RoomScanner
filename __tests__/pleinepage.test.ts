/**
 * LE PLAN REMPLIT LA FEUILLE.
 *
 * Releve du patron, dossier rendu en image a l'appui : « je trouve le plan
 * trop petit et illisible, trop de marge blanche non utilisee ».
 *
 * La mesure lui donne raison et dit exactement ou. Un T3 de sept metres sur
 * trois demande 397 points de large a l'echelle 1:50 ; la boite du dessin en
 * offrait 395. Il manquait DEUX POINTS — sept dixiemes de millimetre — et le
 * cran etait refuse : on retombait a 1:75, c'est-a-dire un plan une fois et
 * demie plus petit, au milieu de cinq centimetres de blanc.
 *
 * L'ECHELLE NORMALISEE N'EST PAS EN CAUSE, et on n'y touche pas : un
 * architecte pose son kutch sur le papier, et a 1:98,3 toutes ses cotes sont
 * fausses. Ce qui etait en cause, c'est la MARGE : soixante-dix points de
 * chaque cote, deux centimetres et demi, la ou les chaines de cotes et leurs
 * reperes en demandent la moitie.
 *
 * L'effet de seuil est brutal — un cran d'echelle, c'est un tiers de taille
 * en moins — et c'est bien pour ca que quelques points de marge en trop se
 * voient a l'oeil sur la feuille.
 */
import { buildScanPdf } from '../src/export/pdf';
import { type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});

/** Un T3 courant : sept metres sur trois. */
const LOGEMENT: WallSeg[] = [
  mur('n', 0, 0, 7, 0),
  mur('e', 7, 0, 7, 3),
  mur('s', 7, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

const echelleDe = (murs: WallSeg[]) => {
  const pdf = latin1(
    buildScanPdf(
      {
        name: 'Essai',
        walls: murs,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', wallIds: murs.map((w) => w.id) }],
      },
      false,
      { metre: false },
    ),
  );
  const m = pdf.match(/1:(\d+)/);
  return m ? Number(m[1]) : null;
};

describe('le cadrage du plan sur la feuille', () => {
  it('sort un T3 de sept metres au cinquantieme', () => {
    // 1:50 est l'echelle du permis et du chantier : c'est celle qu'on veut
    // pour un logement, et elle tient sur A4 des que la marge est juste.
    expect(echelleDe(LOGEMENT)).toBe(50);
  });

  it('et garde une echelle NORMALISEE, jamais une echelle batarde', () => {
    // Un pavillon plus grand descend d'un cran, il ne s'etire pas : le
    // document doit rester mesurable au kutch.
    const grand = [
      mur('n', 0, 0, 12, 0),
      mur('e', 12, 0, 12, 9),
      mur('s', 12, 9, 0, 9),
      mur('w', 0, 9, 0, 0),
    ];
    expect([50, 75, 100, 125, 150, 200]).toContain(echelleDe(grand));
  });
});
