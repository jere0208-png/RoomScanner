/**
 * LA BOUSSOLE ET LE NOM DES MURS — deux choses, deux commandes.
 *
 * L'option « Nord » du dossier ne devait faire qu'une chose : ne pas
 * imprimer la rose des vents. Elle en faisait deux — elle ôtait aussi
 * « mur nord » du titre des élévations, pendant que le schéma unifilaire
 * continuait, lui, d'appeler ses appareils « Prise plinthe 1 · mur nord ».
 * Le dossier se contredisait d'une feuille à l'autre.
 *
 * Un dessin peut encombrer ; un nom, non — c'est lui qui dit à
 * l'électricien de quel mur on parle, sur le chantier, trois semaines plus
 * tard.
 */
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

const dossier = (compass: boolean) =>
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
        compass,
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
      },
      false,
      { elevations: true },
    ),
  );

describe('l’option « Nord » du dossier', () => {
  it('n’imprime la rose des vents que si on la demande', () => {
    // La rose est un triangle rouge : c'est sa teinte qui la trahit dans le
    // flux, et elle n'y figure qu'une fois.
    const avec = dossier(true).split('0.77 0.27 0.23 rg').length;
    const sans = dossier(false).split('0.77 0.27 0.23 rg').length;
    expect(`avec ${avec > sans ? 'dessinée' : 'absente'}`).toBe('avec dessinée');
    expect(sans).toBe(1);
  });

  it('mais les murs gardent leur nom dans les deux cas', () => {
    for (const compass of [true, false]) {
      const src = dossier(compass);
      // Le titre d'une élévation nomme son mur : « Élévation — Chambre,
      // mur nord ». Le PDF encode en WinAnsi, sans accent sur « mur ».
      expect(`boussole ${compass} : ${src.includes('mur nord')}`).toBe(
        `boussole ${compass} : true`,
      );
    }
  });
});
