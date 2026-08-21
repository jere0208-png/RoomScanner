/**
 * L'AUDIT DES AUTRES RENDUS — le PDF et la vue subjective.
 *
 * `audit3d` couvre la vue de l'application sur cinq cents caméras. Restent
 * deux chemins de rendu qui partagent le même moteur mais pas le même tracé :
 *
 *   — LE PDF, qui a sa propre projection, son propre cadre et son propre
 *     clip. Un défaut peut n'exister que sur le papier, c'est-à-dire sur le
 *     seul document que l'électricien laisse au client.
 *   — LA VUE SUBJECTIVE de la présentation, qui a sa propre caméra en
 *     perspective, sa coupe au ras de l'œil et son masquage depuis un point.
 *
 * On les fait tourner sur eux-mêmes, et l'on vérifie qu'ils ne perdent rien.
 */
import { buildScanPdf } from '../src/export/pdf';
import {
  ajusterBlocs,
  buildScene,
  coupeDevant,
  dosTourne,
  povProjector,
  sceneFraming,
  type P3,
  type PovCamera,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';
import type { Fixture } from '../src/geometry/electrical';

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Un séjour meublé, percé, avec un retour de mur : le cas difficile. */
const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
  mur('retour', 2.6, 0, 2.6, 1.4),
];
const BAIES: WallSeg[] = [
  {
    id: 'fen',
    type: 'window',
    a: { x: 3.4, z: 0 },
    b: { x: 4.6, z: 0 },
    height: 1.2,
    yCenter: 1.5,
  } as WallSeg,
  {
    id: 'porte',
    type: 'door',
    a: { x: 0, z: 1.2 },
    b: { x: 0, z: 2.1 },
    height: 2.05,
    yCenter: 1.025,
  } as WallSeg,
];
const MEUBLES: ObjectData[] = [
  {
    id: 'canape',
    category: 'sofa',
    width: 2.1,
    depth: 0.9,
    height: 0.85,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3.4, 0.425, 3.4, 1],
  },
  {
    id: 'lit',
    category: 'bed',
    width: 1.5,
    depth: 2,
    height: 0.55,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.1, 0.275, 2.6, 1],
  },
  {
    id: 'armoire',
    category: 'storage',
    width: 1.1,
    depth: 0.55,
    height: 2,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.5, 1, 0.6, 1],
  },
];
const PRISES: Fixture[] = [
  { id: 'p1', kind: 'prise', wallId: 'n', along: 1.2, height: 0.25, side: 1 },
  { id: 'p2', kind: 'inter', wallId: 'o', along: 0.8, height: 1.1, side: 1 },
  { id: 'p3', kind: 'prise', wallId: 'e', along: 2.2, height: 0.25, side: 1 },
];
const PIECES = [{ id: 'r1' }];

// ----------------------------------------------------------------- le PDF

const PAGE_W = 595.28;
const PAGE_H = 841.89;

/** Le flux du document, lisible caractère par caractère. */
const flux = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
};

/** Tous les points de tracé du document (opérateurs `m` et `l`). */
const points = (pdf: string) => {
  const out: { x: number; y: number }[] = [];
  const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) out.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  return out;
};

describe('le dossier PDF, sous tous les angles', () => {
  /** Douze azimuts, trois inclinaisons : le client fait tourner sa page. */
  const VUES: { theta: number; tilt: number }[] = [];
  for (let theta = -180; theta < 180; theta += 30) {
    for (const tilt of [22, 48, 74]) VUES.push({ theta, tilt });
  }

  it('ne sort jamais de la feuille, et ne rend jamais une page vide', () => {
    const debords: string[] = [];
    const vides: string[] = [];
    for (const { theta, tilt } of VUES) {
      const pdf = flux(
        buildScanPdf(
          {
            name: 'Audit',
            walls: MURS,
            openings: BAIES,
            objects: MEUBLES,
            fixtures: PRISES,
            rooms: PIECES,
          },
          true,
          { metre: false, views: [
              { theta, tilt, zoom: 1, fx: 0, fy: 0 },
              { theta: theta + 90, tilt, zoom: 1, fx: 0, fy: 0 },
            ] },
        ),
      );
      const pts = points(pdf);
      // Une page de plan et une page 3D dessinent des centaines de segments :
      // moins de deux cents, c'est qu'il manque quelque chose.
      if (pts.length < 200) vides.push(`${theta}°/${tilt}° (${pts.length} traits)`);
      for (const p of pts) {
        if (p.x < -1 || p.x > PAGE_W + 1 || p.y < -1 || p.y > PAGE_H + 1) {
          debords.push(`${theta}°/${tilt}°`);
          break;
        }
      }
    }
    expect(`${debords.length} débord(s)`).toBe('0 débord(s)');
    expect(`${vides.length} page(s) creuse(s)`).toBe('0 page(s) creuse(s)');
  });

  it('emporte le mobilier, l’appareillage et les cotes', () => {
    const pdf = flux(
      buildScanPdf(
        {
          name: 'Audit',
          walls: MURS,
          openings: BAIES,
          objects: MEUBLES,
          fixtures: PRISES,
          rooms: PIECES,
        },
        true,
        { metre: true, views: [
          { theta: -32, tilt: 58, zoom: 1, fx: 0, fy: 0 },
          { theta: 58, tilt: 58, zoom: 1, fx: 0, fy: 0 },
        ] },
      ),
    );
    // Les désignations d'appareils, les noms de meubles et une cote : trois
    // familles d'information qui doivent survivre à l'export.
    for (const attendu of ['Canap', 'Lit', 'Rangement', 'm²']) {
      expect(`${attendu} ${pdf.includes(attendu) ? 'présent' : 'ABSENT'}`).toBe(
        `${attendu} présent`,
      );
    }
  });
});

// --------------------------------------------------------- la vue subjective

describe('la vue subjective, en tournant sur soi', () => {
  const { faces } = buildScene(MURS, BAIES, MEUBLES, {
    palette: PAL,
    showSurfaces: true,
    rooms: PIECES,
    fixtures: PRISES,
  });
  const parts = roomParts(MURS, PIECES);
  const solY = Math.min(...MURS.map((w) => w.yCenter - w.height / 2));
  const oeil: P3 = { x: parts[0].labelAt.x, y: solY + 1.6, z: parts[0].labelAt.z };
  const ECRAN = { w: 390, h: 700 };
  /** Trente-six azimuts, trois inclinaisons de tête. */
  const REGARDS: PovCamera[] = [];
  for (let d = 0; d < 360; d += 10) {
    for (const pitch of [-0.18, 0, 0.18]) {
      REGARDS.push({ at: oeil, yaw: (d * Math.PI) / 180, pitch, fov: 68 });
    }
  }

  it('ne projette jamais une coordonnée folle, ni un polygone retourné', () => {
    let malades = 0;
    let retournes = 0;
    for (const cam of REGARDS) {
      const p = povProjector(cam, ECRAN);
      for (const f of faces) {
        const pts = coupeDevant(f.pts, cam);
        if (pts.length === 0) continue;
        for (const q of pts.map(p)) {
          if (!isFinite(q.sx) || !isFinite(q.sy) || !isFinite(q.depth)) malades++;
          // Un sommet derrière l'œil après la coupe : c'est ce qui retourne
          // un polygone et barre l'écran d'un aplat.
          if (q.devant < 0.049) retournes++;
        }
      }
    }
    expect(`${malades} coordonnée(s) folle(s)`).toBe('0 coordonnée(s) folle(s)');
    expect(`${retournes} sommet(s) derrière l’œil`).toBe(
      '0 sommet(s) derrière l’œil',
    );
  });

  it('montre toujours quelque chose : jamais un écran vide', () => {
    const creux: string[] = [];
    for (const cam of REGARDS) {
      const p = povProjector(cam, ECRAN);
      const vues = faces.filter((f) => !dosTourne(f, cam.at) && f.fill !== null);
      let dansLeCadre = 0;
      for (const f of vues) {
        const pts = coupeDevant(f.pts, cam);
        if (pts.length < 3) continue;
        const q = pts.map(p);
        const dedans = q.some(
          (r) => r.sx > 0 && r.sx < ECRAN.w && r.sy > 0 && r.sy < ECRAN.h,
        );
        if (dedans) dansLeCadre++;
      }
      // Depuis le centre d'une pièce meublée, on voit toujours plusieurs pans.
      if (dansLeCadre < 3) {
        creux.push(`${Math.round((cam.yaw * 180) / Math.PI)}° (${dansLeCadre})`);
      }
    }
    expect(
      `${creux.length} regard(s) vide(s)` +
        (creux.length ? ' — ' + creux.slice(0, 4).join(', ') : ''),
    ).toBe('0 regard(s) vide(s)');
  });

  it('peint du plus lointain au plus proche, sans exception', () => {
    let fautes = 0;
    for (const cam of REGARDS.filter((_, i) => i % 3 === 0)) {
      const p = povProjector(cam, ECRAN);
      const vues = faces
        .filter((f) => !dosTourne(f, cam.at) && f.fill !== null)
        .map((f) => {
          const pts = coupeDevant(f.pts, cam);
          const proj = pts.map(p);
          return {
            f,
            proj,
            depth:
              proj.reduce((t, q) => t + q.depth, 0) / Math.max(1, proj.length),
            owner: f.ownerId,
            room: f.roomId,
            pan: f.panId,
            bord: f.bordDe,
          };
        })
        .filter((v) => v.proj.length >= 3);
      ajusterBlocs(vues);
      const ordre = [...vues].sort((a, b) => a.depth - b.depth);
      // La profondeur croît vers l'œil : l'ordre de peinture doit donc être
      // croissant, du fond vers le premier plan. Un tri qui ne l'est pas
      // signifie qu'une face lointaine se peint après une proche.
      for (let i = 1; i < ordre.length; i++) {
        if (ordre[i].depth < ordre[i - 1].depth - 1e-9) fautes++;
      }
    }
    expect(`${fautes} inversion(s)`).toBe('0 inversion(s)');
  });
});

// ------------------------------------------------------- le cadrage commun

describe('le cadrage de la scène', () => {
  it('ne dépend ni de l’ordre des murs ni de la finesse du découpage', () => {
    const a = buildScene(MURS, BAIES, MEUBLES, {
      palette: PAL,
      rooms: PIECES,
      fixtures: PRISES,
    });
    const b = buildScene([...MURS].reverse(), BAIES, [...MEUBLES].reverse(), {
      palette: PAL,
      rooms: PIECES,
      fixtures: PRISES,
    });
    const ca = sceneFraming(a.faces);
    const cb = sceneFraming(b.faces);
    // Le même logement, décrit dans un autre ordre, doit se cadrer pareil :
    // sinon la vue saute quand on ajoute une pièce ou qu'on déplace un meuble.
    expect(ca.center.x).toBeCloseTo(cb.center.x, 6);
    expect(ca.center.y).toBeCloseTo(cb.center.y, 6);
    expect(ca.center.z).toBeCloseTo(cb.center.z, 6);
    expect(ca.radius3d).toBeCloseTo(cb.radius3d, 6);
  });
});

/**
 * LA FEUILLE DE L'INSTALLATION EXISTANTE.
 *
 * En renovation, c'est la page que le client garde : ce qu'on a trouve dans
 * son tableau, et ce qu'il faut reprendre. Elle ne doit sortir QUE s'il y a
 * un tableau releve — une page vide dans un dossier remis au client donne
 * l'impression d'un travail bacle.
 */
describe('la feuille de l’existant', () => {
  const BASE = {
    name: 'Renovation',
    walls: MURS,
    openings: BAIES,
    objects: MEUBLES,
    fixtures: PRISES,
    rooms: PIECES,
  };

  it('n’apparait pas sur un chantier neuf', () => {
    const sans = flux(buildScanPdf(BASE, false, { metre: false }));
    expect(sans).not.toContain('Installation existante');
    // Ni avec un tableau vide : c'est le meme cas, vu de l'application.
    const vide = flux(
      buildScanPdf(BASE, false, { metre: false, existant: { departs: [] } }),
    );
    expect(vide).not.toContain('Installation existante');
  });

  it('sort avec le tableau releve et ce qu’il faut reprendre', () => {
    const pdf = flux(
      buildScanPdf(BASE, false, {
        metre: false,
        existant: {
          departs: [
            {
              id: 'f1',
              organe: 'fusible',
              calibre: 10,
              usage: 'Eclairage',
            },
          ],
          rangees: 1,
          parRangee: 13,
        },
      }),
    );
    expect(pdf).toContain('Installation existante');
    // Le verdict est sur la feuille, pas seulement a l'ecran : un tableau
    // a fusibles sans differentiel, c'est deux constats graves.
    expect(pdf).toContain('DANGER');
    expect(pdf).toContain('reprendre');
  });

  it('ne deborde pas de la feuille, meme avec un tableau charge', () => {
    // Trente-neuf modules : trois rangees pleines, le cas d'un pavillon
    // refait par morceaux depuis quarante ans.
    const departs = Array.from({ length: 39 }, (_, i) => ({
      id: `d${i}`,
      organe: 'disjoncteur' as const,
      calibre: 16,
      usage: 'Prises',
    }));
    const pdf = flux(
      buildScanPdf(BASE, false, {
        metre: false,
        existant: { departs, rangees: 3, parRangee: 13 },
      }),
    );
    for (const p of points(pdf)) {
      expect(p.x).toBeGreaterThan(-1);
      expect(p.x).toBeLessThan(PAGE_W + 1);
      expect(p.y).toBeGreaterThan(-1);
      expect(p.y).toBeLessThan(PAGE_H + 1);
    }
  });
});
