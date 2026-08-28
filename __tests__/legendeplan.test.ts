/**
 * LA LÉGENDE EXPLIQUE TOUT CE QUE LE PLAN DESSINE — pas seulement l'élec.
 *
 * Défaut connu, écrit depuis longtemps dans les questions en attente : « la
 * légende du plan PDF n'explique ni les repères ronds des murs ni les
 * menuiseries ».
 *
 * CE QUE ÇA COÛTE À CELUI QUI LIT. Le plan porte des pastilles numérotées dans
 * l'épaisseur des murs : ce sont les renvois vers les feuilles d'élévation, et
 * sans elles une feuille « Séjour, nord » ne désigne rien de sûr sur un plan
 * qui compte quatre pans au nord. Un client — ou un maçon — qui reçoit le
 * dossier voit des chiffres dans des ronds et n'a AUCUN moyen de savoir ce
 * qu'ils veulent dire. Idem pour l'arc d'une porte et le double trait d'une
 * fenêtre : évidents pour qui lit des plans, muets pour les autres.
 *
 * ET C'EST LA MOITIÉ DU DOSSIER QUI EST CONCERNÉE. Le plan d'ensemble est la
 * feuille qu'on montre au client ; la légende y explique consciencieusement des
 * symboles d'appareillage qu'il ne regardera pas, et laisse sans un mot les
 * repères qui organisent tout le reste du dossier.
 *
 * CE BANC LIT LE FLUX DU PDF, comme les autres bancs de dossier : ce qui est
 * écrit dans la page est ce que le lecteur verra.
 */
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
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

/** Un séjour percé d'une porte et d'une fenêtre : les deux menuiseries. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const OUVERTURES: WallSeg[] = [
  { ...mur('p1', 1, 0, 1.9, 0), type: 'door' } as WallSeg,
  { ...mur('f1', 2.5, 4, 4, 4), type: 'window' } as WallSeg,
];

const APPAREILS: Fixture[] = [
  { id: 'p1', kind: 'prise', wallId: 'n', along: 3, height: 0.25, side: 1 },
  { id: 't1', kind: 'tableau', wallId: 'o', along: 1, height: 1.35, side: 1 },
];

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

/** Les mots de la feuille du plan — c'est toujours la première du dossier. */
const motsDuPlan = (src: string): string[] => {
  const i = src.indexOf('stream\n');
  const j = src.indexOf('\nendstream', i);
  const page = src.slice(i + 7, j);
  return (page.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).map((m) =>
    m.slice(1, m.lastIndexOf(')')),
  );
};

const dossier = (opts: Record<string, unknown> = {}) =>
  motsDuPlan(
    latin1(
      buildScanPdf(
        {
          name: 'Essai',
          walls: MURS,
          openings: OUVERTURES,
          objects: [],
          rooms: [{ id: 'r1' }],
          roomNames: { r1: 'Sejour' },
          fixtures: APPAREILS,
        } as never,
        false,
        { metre: false, ...opts } as never,
      ),
    ),
  );

describe('la légende explique le plan, pas seulement l’appareillage', () => {
  it('elle dit ce qu’est une porte et ce qu’est une fenêtre', () => {
    const lus = dossier();
    expect(lus).toContain('Porte');
    expect(lus).toContain('Fenêtre');
  });

  it('et elle dit à quoi sert le rond numéroté d’un mur', () => {
    /*
      C'est le renvoi vers la feuille d'élévation. Sans un mot d'explication,
      ce sont des chiffres dans des ronds au milieu de la maçonnerie.
    */
    const lus = dossier().join(' | ');
    expect(lus).toMatch(/Rep[èe]re de mur/);
    expect(lus).toMatch(/[ée]l[ée]vation/i);
  });

  it('sans oublier ce qu’elle expliquait déjà', () => {
    // Le contrôle en sens inverse : on n'a pas remplacé une légende par une
    // autre. L'appareillage y est toujours.
    const lus = dossier();
    expect(lus).toContain('APPAREILLAGE');
    expect(lus.some((m) => m.includes('Prise'))).toBe(true);
  });
});

describe('et elle ne parle que de ce qui est sur la feuille', () => {
  it('un plan sans menuiserie n’explique pas les menuiseries', () => {
    /*
      LA RÈGLE DE CETTE LÉGENDE DEPUIS TOUJOURS : elle ne liste que les
      symboles PRÉSENTS. Une légende qui explique ce qu'on ne voit pas fait
      chercher au lecteur un dessin qui n'existe pas — et sur une feuille où
      la place se dispute, chaque ligne inutile en chasse une utile.
    */
    const sansMenuiserie = motsDuPlan(
      latin1(
        buildScanPdf(
          {
            name: 'Essai',
            walls: MURS,
            openings: [],
            objects: [],
            rooms: [{ id: 'r1' }],
            roomNames: { r1: 'Sejour' },
            fixtures: APPAREILS,
          } as never,
          false,
          { metre: false } as never,
        ),
      ),
    );
    expect(sansMenuiserie).not.toContain('Porte');
    expect(sansMenuiserie).not.toContain('Fenêtre');
  });

  it('et une porte seule ne fait pas parler de fenêtre', () => {
    const porteSeule = motsDuPlan(
      latin1(
        buildScanPdf(
          {
            name: 'Essai',
            walls: MURS,
            openings: [OUVERTURES[0]],
            objects: [],
            rooms: [{ id: 'r1' }],
            roomNames: { r1: 'Sejour' },
            fixtures: APPAREILS,
          } as never,
          false,
          { metre: false } as never,
        ),
      ),
    );
    expect(porteSeule).toContain('Porte');
    expect(porteSeule).not.toContain('Fenêtre');
  });
});
