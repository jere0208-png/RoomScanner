/**
 * LES NOTES SUIVENT LE PLAN JUSQU'AU DOSSIER.
 *
 * Une note qui ne vit qu'a l'ecran n'a servi qu'a celui qui l'a ecrite. Or
 * l'interet meme de ces phrases — « colonne montante ici », « attente TV a
 * confirmer avec le client », « gaine a reprendre » — est de passer du
 * releve a celui qui pose, et celui qui pose lit le PDF sur le chantier,
 * pas le telephone de son collegue.
 *
 * Elles s'impriment donc sur le plan, LA OU ELLES PORTENT : c'est le point
 * qui leur donne leur sens, « gaine a reprendre » ne voulant rien dire au
 * milieu du salon.
 */
import { buildScanPdf } from '../src/export/pdf';
import { filtrerAuNiveau, type WallSeg } from '../src/geometry/floorplan';

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
const ROOMS = [{ id: 'r1', name: 'Sejour', wallIds: PIECE.map((w) => w.id) }];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

const construire = (notes?: { id: string; text: string; at: { x: number; z: number } }[]) =>
  latin1(
    buildScanPdf(
      {
        name: 'Essai',
        walls: PIECE,
        openings: [],
        objects: [],
        rooms: ROOMS,
        notes,
      },
      false,
      { metre: false },
    ),
  );

describe('les notes dans le dossier', () => {
  it('s’impriment sur le plan', () => {
    expect(construire([{ id: 'n1', text: 'Colonne montante', at: { x: 2, z: 2 } }])).toContain(
      'Colonne montante',
    );
  });

  it('n’ajoutent rien au plan qui n’en porte pas', () => {
    // Un plan sans note doit rester EXACTEMENT le plan d'avant : pas de
    // cadre vide, pas de legende orpheline.
    expect(construire()).not.toContain('Colonne montante');
  });

  it('arrivent DEJA filtrees a l’etage imprime', () => {
    /*
      LE PDF N'A PAS DE NOTION D'ETAGE — et c'est deliberate.

      Ce banc demandait d'abord au document de trier lui-meme le rez et le
      premier. Il ne le peut pas : il ne recoit jamais que les murs d'UN
      etage, tries en amont par `filtrerAuNiveau`, et une seconde regle de
      tri cachee dans le dessinateur serait la deuxieme place ou une note
      pourrait disparaitre. On verifie donc le tri LA OU IL SE FAIT, et le
      document, lui, imprime ce qu'on lui donne.
    */
    const jeu = {
      walls: PIECE,
      openings: [],
      rooms: ROOMS,
      fixtures: [],
      photos: [],
      objects: [],
      ceiling: [],
      notes: [
        { id: 'n1', text: 'Colonne montante', at: { x: 2, z: 2 } },
        { id: 'n2', text: 'Combles a isoler', at: { x: 3, z: 2 }, niveau: 1 },
      ],
    };
    expect(filtrerAuNiveau(jeu, 0).notes?.map((n) => n.id)).toEqual(['n1']);
    expect(filtrerAuNiveau(jeu, 1).notes?.map((n) => n.id)).toEqual(['n2']);
  });
});
