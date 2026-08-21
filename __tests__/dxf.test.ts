/**
 * L'EXPORT DXF — la porte des architectes et des bureaux d'études.
 *
 * L'application ne sortait que du PDF : un document qu'on lit, jamais un
 * dessin qu'on reprend. Un architecte, un économiste, un cuisiniste demandent
 * un fichier qu'ils ouvrent dans AutoCAD, ArchiCAD ou une machine à découper
 * — et l'on ne pouvait pas répondre. C'est le format d'échange du bâtiment
 * depuis quarante ans ; ne pas l'avoir ferme la porte des clients qui paient
 * le mieux.
 *
 * ON ÉCRIT DU R12 (AC1009), le dialecte que TOUT lit — y compris les vieux
 * logiciels de menuiserie et les découpeuses. Les formats récents apportent
 * des entités dont un plan de logement n'a aucun besoin, et referment la
 * compatibilité qu'on cherchait justement à ouvrir.
 */
import {
  buildDxf,
  dxfFilename,
  DXF_CALQUES,
} from '../src/export/dxf';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Une pièce de 4 × 3, coin en (0,0). */
const PIECE = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
];

const PLAN = {
  walls: PIECE,
  openings: [],
  rooms: [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }],
  fixtures: [],
  objects: [],
};

/** Les paires (code, valeur) d'un DXF, dans l'ordre. */
const paires = (dxf: string) => {
  const l = dxf.split(/\r?\n/);
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([l[i].trim(), l[i + 1]]);
  return out;
};

describe('un fichier que les logiciels acceptent', () => {
  it('ouvre et ferme ses sections dans l’ordre', () => {
    const dxf = buildDxf(PLAN);
    // Un DXF mal fermé est refusé en bloc : AutoCAD ne répare rien.
    expect(dxf).toContain('SECTION');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    const sections = (dxf.match(/\nSECTION\r?\n/g) ?? []).length;
    const fins = (dxf.match(/\nENDSEC\r?\n/g) ?? []).length;
    expect(sections).toBe(fins);
    expect(sections).toBeGreaterThanOrEqual(3);
  });

  it('se présente en R12, le dialecte que tout lit', () => {
    expect(buildDxf(PLAN)).toContain('AC1009');
  });

  it('n’écrit que des paires code / valeur', () => {
    // Le format est une suite stricte : un code sur une ligne, sa valeur
    // sur la suivante. Une ligne orpheline décale tout le fichier.
    const l = buildDxf(PLAN).split(/\r?\n/);
    // La dernière ligne est vide (le fichier finit par un saut).
    expect((l.length - (l[l.length - 1] === '' ? 1 : 0)) % 2).toBe(0);
    for (let i = 0; i < l.length - 1; i += 2) {
      if (l[i] === '') break;
      expect(l[i].trim()).toMatch(/^\d+$/);
    }
  });
});

describe('les calques, comme un dessinateur les attend', () => {
  it('déclare ses calques dans la table', () => {
    const dxf = buildDxf(PLAN);
    for (const c of DXF_CALQUES) expect(dxf).toContain(c.nom);
    expect(dxf).toContain('LAYER');
  });

  it('range chaque chose sur le sien', () => {
    const dxf = buildDxf({
      ...PLAN,
      openings: [{ ...mur('p1', 1, 0, 2, 0), type: 'door' as const }],
      fixtures: [
        {
          id: 'f1',
          kind: 'prise' as const,
          wallId: 'n',
          along: 2,
        },
      ],
    });
    const p = paires(dxf);
    const calques = new Set(
      p.filter(([code]) => code === '8').map(([, v]) => v),
    );
    // Un architecte éteint les calques qui ne le concernent pas : s'ils
    // sont mélangés, il reçoit un plan qu'il ne peut pas nettoyer.
    expect(calques.has('ECHOPLAN-MURS')).toBe(true);
    expect(calques.has('ECHOPLAN-OUVERTURES')).toBe(true);
    expect(calques.has('ECHOPLAN-ELEC')).toBe(true);
    expect(calques.has('ECHOPLAN-PIECES')).toBe(true);
  });
});

describe('les coordonnées', () => {
  it('sont en millimètres, l’unité du plan de bâtiment', () => {
    const dxf = buildDxf(PLAN);
    const xs = paires(dxf)
      .filter(([code]) => code === '10')
      .map(([, v]) => parseFloat(v));
    // Le mur de 4 m fait 4000 dans le fichier, pas 4.
    expect(Math.max(...xs)).toBeGreaterThan(3000);
    expect(Math.max(...xs)).toBeLessThan(5000);
  });

  it('retournent l’axe : le nord du plan est le haut du dessin', () => {
    /*
      Le relevé travaille en repère écran — z vers le BAS —, le DXF en
      repère mathématique : y vers le haut. Sans retournement, le plan
      s'ouvre en miroir chez le destinataire, portes à gauche au lieu de la
      droite. C'est le genre d'erreur qui ne se voit qu'une fois le mobilier
      commandé.
    */
    const dxf = buildDxf(PLAN);
    const ys = paires(dxf)
      .filter(([code]) => code === '20')
      .map(([, v]) => parseFloat(v));
    // La pièce va de z = 0 à z = 3 m : en DXF, de −3000 à 0. Le contour des
    // murs déborde d'une demi-épaisseur vers l'extérieur — c'est le mur
    // lui-même, pas une erreur de repère : quelques centimètres, jamais des
    // mètres.
    expect(Math.min(...ys)).toBeLessThan(-2000);
    expect(Math.max(...ys)).toBeLessThan(200);
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });
});

describe('les textes', () => {
  it('portent le nom des pièces et leur surface', () => {
    const dxf = buildDxf(PLAN);
    expect(dxf).toContain('Sejour');
    expect(dxf).toMatch(/12[.,]0 m2|12 m2/);
  });

  it('sont sans accent : le R12 ne les transporte pas', () => {
    /*
      Le DXF R12 est de l'ASCII : un « é » y devient un caractère de
      contrôle, et le fichier s'ouvre avec des noms de pièces illisibles —
      quand il s'ouvre. On translittère donc, plutôt que de livrer un
      dessin sali.
    */
    const dxf = buildDxf({
      ...PLAN,
      rooms: [{ id: 'r1', name: 'Chambre à coucher', wallIds: ['n'] }],
    });
    expect(dxf).toContain('Chambre a coucher');
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(dxf)).toBe(false);
  });
});

describe('le nom du fichier', () => {
  it('reprend celui du dossier, sans caractère interdit', () => {
    expect(dxfFilename('Chantier Dupont')).toBe('Chantier-Dupont.dxf');
    expect(dxfFilename('T3 / rue Pasteur')).not.toMatch(/[/\\:]/);
    expect(dxfFilename('')).toMatch(/\.dxf$/);
  });
});

/**
 * LA RELECTURE — ce qu'un logiciel verra vraiment.
 *
 * Verifier que le fichier CONTIENT les bonnes chaines ne prouve rien : un
 * DXF se lit par un automate qui suit les paires code/valeur, et c est lui
 * qui decide si le dessin s ouvre ou si le logiciel affiche « fichier
 * corrompu ». On relit donc le fichier comme il sera relu, et l on mesure la
 * geometrie reconstruite.
 */
describe('le fichier relu comme le fera AutoCAD', () => {
  /** Reconstruit les entites, comme un lecteur DXF. */
  const relire = (dxf: string) => {
    const p = paires(dxf);
    const entites: { type: string; calque: string; pts: { x: number; y: number }[] }[] = [];
    let courante: (typeof entites)[number] | null = null;
    let x: number | null = null;
    for (const [code, val] of p) {
      if (code === '0') {
        if (val === 'VERTEX' && courante) continue;
        if (val === 'SEQEND') continue;
        courante = { type: val, calque: '', pts: [] };
        if (val !== 'ENDSEC' && val !== 'SECTION' && val !== 'EOF') {
          entites.push(courante);
        }
      } else if (code === '8' && courante) {
        courante.calque = val;
      } else if (code === '10' && courante) {
        x = parseFloat(val);
      } else if (code === '20' && courante && x !== null) {
        courante.pts.push({ x, y: parseFloat(val) });
        x = null;
      }
    }
    return entites;
  };

  it('reconstruit des murs a la bonne cote', () => {
    const dxf = buildDxf(PLAN);
    const murs = relire(dxf).filter(
      (e) => e.type === 'POLYLINE' && e.calque === 'ECHOPLAN-MURS',
    );
    expect(murs).toHaveLength(4);
    // Le contour du mur nord fait 4 m de long : on mesure son etendue.
    const nord = murs[0];
    const xs = nord.pts.map((q) => q.x);
    const large = Math.max(...xs) - Math.min(...xs);
    // Quatre metres, aux jonctions d onglet pres.
    expect(large).toBeGreaterThan(3800);
    expect(large).toBeLessThan(4300);
  });

  it('ne laisse aucune entite sans calque', () => {
    // Une entite sans calque atterrit sur le calque 0 du destinataire, au
    // milieu de SON dessin : le pire endroit pour la retrouver.
    const dxf = buildDxf({
      ...PLAN,
      fixtures: [
        { id: 'f1', kind: 'prise', wallId: 'n', along: 2 },
      ],
    });
    const dessinees = relire(dxf).filter((e) =>
      ['LINE', 'POLYLINE', 'TEXT', 'CIRCLE'].includes(e.type),
    );
    expect(dessinees.length).toBeGreaterThan(4);
    for (const e of dessinees) expect(e.calque).toMatch(/^ECHOPLAN-/);
  });

  it('n invente pas d entite hors des sections', () => {
    const dxf = buildDxf(PLAN);
    // Tout ce qui se dessine vit dans ENTITIES : rien apres ENDSEC final.
    const fin = dxf.lastIndexOf('ENDSEC');
    expect(dxf.slice(fin).trim()).toBe('ENDSEC\n0\nEOF');
  });
});
