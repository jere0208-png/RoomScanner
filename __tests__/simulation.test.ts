/**
 * LE BANC D'ÉPREUVE — on fait tourner l'app, on regarde ce qui casse.
 *
 * Les tests de cette suite ne vérifient pas une correction précise : ils
 * PROMÈNENT le rendu sur des centaines de situations — dix logements de
 * formes différentes, la caméra tout autour, le zoom du plus loin au plus
 * près — et exigent que certaines choses restent vraies partout.
 *
 * C'est le seul moyen honnête de trouver ce qu'un œil ne verra pas : un
 * défaut qui n'apparaît qu'à 250 degrés d'azimut sur un logement en L, on
 * ne le rencontre jamais en regardant trois captures d'écran, et on le
 * découvre chez le client.
 *
 * Les invariants tenus ici :
 *  1. rien ne sort de la feuille, jamais, quel que soit le cadrage ;
 *  2. aucune coordonnée n'est NaN — une seule suffit à effacer un pan ;
 *  3. un meuble derrière un mur se peint AVANT lui, sous tous les angles ;
 *  4. une pièce close montre toujours quelque chose ;
 *  5. les cas dégénérés — un mur seul, un logement minuscule ou immense —
 *     ne font ni planter ni déborder.
 */
import {
  buildScene,
  faceDepth,
  isHiddenFace,
  sceneFraming,
  type CameraTrig,
  type Face3D,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { buildScanPdf } from '../src/export/pdf';
import { roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';

import type { ObjectData } from 'react-native-room-scan';

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

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  height = 2.5,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: height / 2,
  roomId: 'r1',
});

/** Une boucle fermée à partir de ses sommets. */
const boucle = (pts: [number, number][], h = 2.5, prefixe = 'm'): WallSeg[] =>
  pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return mur(`${prefixe}${i}`, p[0], p[1], q[0], q[1], h);
  });

/** Le même logement, tourné : ARKit oriente son repère où il veut. */
const tourner = (walls: WallSeg[], deg: number): WallSeg[] => {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const t = (p: { x: number; z: number }) => ({
    x: p.x * cos - p.z * sin,
    z: p.x * sin + p.z * cos,
  });
  return walls.map((w) => ({ ...w, a: t(w.a), b: t(w.b) }));
};

/**
 * Et le mobilier avec, évidemment.
 *
 * Tourner les murs sans tourner les meubles, c'est bâtir un logement où
 * l'armoire traverse la cloison — un état que le scanner ne produit
 * jamais, et sur lequel le tri en profondeur n'a rien à prouver.
 */
const tournerObj = (objects: ObjectData[], deg: number): ObjectData[] => {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return objects.map((o) => {
    const m = [...o.transform];
    const x = m[12];
    const z = m[14];
    m[12] = x * cos - z * sin;
    m[14] = x * sin + z * cos;
    // Le lacet du meuble suit celui de la pièce.
    m[0] = cos;
    m[2] = sin;
    m[8] = -sin;
    m[10] = cos;
    return { ...o, transform: m };
  });
};

const meuble = (
  id: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
): ObjectData => ({
  id,
  category: 'storage',
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, h / 2, cz, 1],
});

/** Les dix logements du banc : formes, tailles et travers différents. */
const LOGEMENTS: { nom: string; walls: WallSeg[]; objects: ObjectData[] }[] = [
  {
    nom: 'carré simple',
    walls: boucle([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]),
    objects: [meuble('o1', 2, 0.4, 1.2, 0.5, 2)],
  },
  {
    nom: 'rectangle allongé',
    walls: boucle([
      [0, 0],
      [9, 0],
      [9, 2.4],
      [0, 2.4],
    ]),
    objects: [meuble('o1', 4, 0.35, 2, 0.6, 2.2)],
  },
  {
    nom: 'logement en L',
    walls: boucle([
      [0, 0],
      [6, 0],
      [6, 3],
      [3, 3],
      [3, 6],
      [0, 6],
    ]),
    objects: [meuble('o1', 1.5, 0.4, 1, 0.5, 1.9), meuble('o2', 4.5, 2.6, 1, 0.5, 0.8)],
  },
  {
    nom: 'de biais (12°)',
    walls: tourner(
      boucle([
        [0, 0],
        [5, 0],
        [5, 3.5],
        [0, 3.5],
      ]),
      12,
    ),
    objects: [],
  },
  {
    nom: 'de biais (47°)',
    walls: tourner(
      boucle([
        [0, 0],
        [5, 0],
        [5, 3.5],
        [0, 3.5],
      ]),
      47,
    ),
    objects: tournerObj([meuble('o1', 2, 1.5, 1, 1, 1.2)], 47),
  },
  {
    nom: 'placard minuscule',
    walls: boucle([
      [0, 0],
      [0.9, 0],
      [0.9, 1.1],
      [0, 1.1],
    ]),
    objects: [],
  },
  {
    nom: 'plateau immense',
    walls: boucle([
      [0, 0],
      [22, 0],
      [22, 14],
      [0, 14],
    ]),
    objects: [meuble('o1', 11, 7, 3, 2, 1)],
  },
  {
    nom: 'plafond bas',
    walls: boucle(
      [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      1.9,
    ),
    objects: [meuble('o1', 2, 0.4, 1, 0.5, 1.8)],
  },
  {
    nom: 'sous pente (hauteurs mêlées)',
    walls: [
      mur('a', 0, 0, 4, 0, 2.6),
      mur('b', 4, 0, 4, 3, 1.4),
      mur('c', 4, 3, 0, 3, 2.6),
      mur('d', 0, 3, 0, 0, 2.2),
    ],
    objects: [],
  },
  {
    nom: 'mur seul (scan avorté)',
    walls: [mur('a', 0, 0, 3, 0)],
    objects: [],
  },
];

/** Trente-six azimuts, quatre inclinaisons : la caméra fait le tour. */
const ANGLES: CameraTrig[] = [];
for (let theta = 0; theta < 360; theta += 10) {
  for (const tilt of [22, 40, 58, 78]) {
    const rad = (d: number) => (d * Math.PI) / 180;
    ANGLES.push({
      ct: Math.cos(rad(theta)),
      st: Math.sin(rad(theta)),
      cp: Math.cos(rad(tilt)),
      sp: Math.sin(rad(tilt)),
    });
  }
}

/** La projection de la vue 3D, à l'identique. */
const projecteur = (cam: CameraTrig, centre: P3, echelle: number) => (p: P3) => {
  const x = p.x - centre.x;
  const y = p.y - centre.y;
  const z = p.z - centre.z;
  const rx = x * cam.ct - z * cam.st;
  const rz = x * cam.st + z * cam.ct;
  return {
    sx: 200 + rx * echelle,
    sy: 260 + (rz * cam.cp - y * cam.sp) * echelle,
    depth: rz * cam.sp + y * cam.cp,
  };
};

describe('le banc d’épreuve de la vue 3D', () => {
  /**
   * PREMIER INVARIANT : aucun nombre ne part en vrille.
   *
   * Une seule coordonnée NaN et le pan entier disparaît du rendu — sans
   * message, sans trace. C'est le défaut le plus coûteux à chercher après
   * coup, et le plus simple à interdire ici.
   */
  it('ne produit jamais de coordonnée invalide, sur aucun logement', () => {
    for (const logement of LOGEMENTS) {
      const { faces } = buildScene(logement.walls, [], logement.objects, {
        palette: PAL,
        showSurfaces: true,
      });
      for (const f of faces) {
        for (const p of f.pts) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
          expect(Number.isFinite(p.z)).toBe(true);
        }
      }
    }
  });

  it('et le cadrage reste fini, même sur un mur seul', () => {
    for (const logement of LOGEMENTS) {
      const { faces } = buildScene(logement.walls, [], logement.objects, {
        palette: PAL,
      });
      const { center, radius3d } = sceneFraming(faces);
      expect(Number.isFinite(center.x)).toBe(true);
      expect(Number.isFinite(center.y)).toBe(true);
      expect(Number.isFinite(center.z)).toBe(true);
      expect(radius3d).toBeGreaterThan(0);
      expect(Number.isFinite(radius3d)).toBe(true);
    }
  });

  /**
   * DEUXIÈME INVARIANT : une pièce close montre toujours quelque chose.
   *
   * Le masquage des faces arrière peut, s'il se trompe de signe, tout jeter
   * d'un coup — et on obtient un écran blanc sous un angle précis.
   */
  it('montre toujours des faces, sous les 144 angles', () => {
    for (const logement of LOGEMENTS) {
      const { faces } = buildScene(logement.walls, [], logement.objects, {
        palette: PAL,
        showSurfaces: true,
      });
      for (const cam of ANGLES) {
        const vues = faces.filter((f) => !isHiddenFace(f, cam));
        expect(vues.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * TROISIÈME INVARIANT : un meuble derrière un mur reste derrière.
   *
   * C'est le défaut corrigé ce matin, éprouvé cette fois sous TOUS les
   * angles et sur tous les logements — pas seulement sur la scène qui
   * l'avait révélé.
   */
  it('garde chaque meuble derrière le mur qui le masque', () => {
    for (const logement of LOGEMENTS) {
      if (logement.objects.length === 0) continue;
      const { faces } = buildScene(logement.walls, [], logement.objects, {
        palette: PAL,
        showSurfaces: true,
      });
      const centre = sceneFraming(faces).center;
      for (const cam of ANGLES) {
        const project = projecteur(cam, centre, 40);
        const vues = faces.filter((f) => !isHiddenFace(f, cam));
        const meubles = vues.filter((f) => f.ownerId);
        for (const m of meubles) {
          const dm = faceDepth(m, project, cam);
          // Le mur qui masque ce meuble : celui dont TOUS les points sont
          // plus proches de l'œil, et qui le recouvre à l'écran.
          const devant = vues.filter(
            (w) =>
              !w.ownerId &&
              !w.isFloor &&
              w.fill !== null &&
              recouvre(w, m, project) &&
              plusProche(w, m, project),
          );
          for (const w of devant) {
            expect(dm).toBeLessThanOrEqual(faceDepth(w, project, cam) + 1e-6);
          }
        }
      }
    }
  });
});

/** Les deux projections se chevauchent-elles à l'écran ? */
function recouvre(
  a: Face3D,
  b: Face3D,
  project: (p: P3) => { sx: number; sy: number },
): boolean {
  const boite = (f: Face3D) => {
    const ps = f.pts.map(project);
    return {
      x0: Math.min(...ps.map((p) => p.sx)),
      x1: Math.max(...ps.map((p) => p.sx)),
      y0: Math.min(...ps.map((p) => p.sy)),
      y1: Math.max(...ps.map((p) => p.sy)),
    };
  };
  const A = boite(a);
  const B = boite(b);
  return A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
}

/** `a` est-il ENTIÈREMENT plus près de l'œil que `b` ? */
function plusProche(
  a: Face3D,
  b: Face3D,
  project: (p: P3) => { depth: number },
): boolean {
  const min = (f: Face3D) => Math.min(...f.pts.map((p) => project(p).depth));
  const max = (f: Face3D) => Math.max(...f.pts.map((p) => project(p).depth));
  return min(a) > max(b);
}

/**
 * CE QUI SORT DU PAPIER — EN TENANT COMPTE DE LA DÉCOUPE.
 *
 * Le plan se dessine dans une fenêtre de découpe (`q … re W n … Q`) : c'est
 * elle qui contient le zoom de l'utilisateur, et il est NORMAL qu'un trait
 * la déborde — il est rogné, il n'atteint jamais le papier. Lire les
 * coordonnées sans lire la découpe, c'est accuser le seul mécanisme qui
 * nous protège.
 *
 * On vérifie donc deux choses : hors découpe, aucun tracé ne sort du
 * papier ; et la découpe elle-même tient dedans.
 */
function hors(src: string): { op: string; x: number; y: number }[] {
  const fautes: { op: string; x: number; y: number }[] = [];
  // Pile des `q` : un niveau vaut vrai dès qu'une découpe y est posée.
  const pile: boolean[] = [];
  const rogne = () => pile.some(Boolean);
  const dedans = (x: number, y: number) =>
    x >= -2 && x <= 597 && y >= -2 && y <= 844;
  for (const ligne of src.split('\n')) {
    const t = ligne.trim();
    if (t === 'q') {
      pile.push(false);
      continue;
    }
    if (t === 'Q') {
      pile.pop();
      continue;
    }
    const coupe = /^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re W n$/.exec(t);
    if (coupe) {
      if (pile.length > 0) pile[pile.length - 1] = true;
      const x = parseFloat(coupe[1]);
      const y = parseFloat(coupe[2]);
      const w = parseFloat(coupe[3]);
      const h = parseFloat(coupe[4]);
      // La fenêtre, elle, doit tenir dans le papier : c'est le contrat.
      if (!dedans(x, y) || !dedans(x + w, y + h)) {
        fautes.push({ op: 'découpe', x, y });
      }
      continue;
    }
    if (rogne()) continue;
    const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l|re)(?= |$)/g;
    let k: RegExpExecArray | null;
    while ((k = re.exec(t))) {
      const x = parseFloat(k[1]);
      const y = parseFloat(k[2]);
      if (!dedans(x, y)) fautes.push({ op: k[3], x, y });
    }
  }
  return fautes;
}

describe('le banc d’épreuve du dossier PDF', () => {
  const latin1 = (bytes: Uint8Array) => {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  };

  /**
   * RIEN NE SORT DE LA FEUILLE — sur dix logements et six cadrages.
   *
   * Le zoom vient de l'utilisateur : il peut serrer sur une pièce ou
   * dézoomer jusqu'à voir le voisinage. Aucun de ces réglages ne doit
   * envoyer un trait par-dessus le cartouche, ni hors du papier.
   */
  it('tient dans la page, quel que soit le logement et le cadrage', () => {
    for (const logement of LOGEMENTS) {
      for (const zoom of [0.4, 1, 2.2]) {
        for (const [fx, fy] of [
          [0, 0],
          [0.9, -0.9],
        ] as [number, number][]) {
          const bytes = buildScanPdf(
            {
              name: logement.nom,
              walls: logement.walls,
              openings: [],
              objects: logement.objects,
            },
            true,
            { plan: { zoom, fx, fy }, metre: true },
          );
          const src = latin1(bytes);
          expect(src.startsWith('%PDF-1.4')).toBe(true);
          for (const p of hors(src)) {
            expect(`${p.op} à (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`).toBe(
              'dans la page',
            );
          }
        }
      }
    }
  });

  /**
   * L'ÉPREUVE S'ÉPROUVE ELLE-MÊME.
   *
   * Un détecteur qui ne détecte rien passe tous les jours au vert. Celui-ci
   * ignore volontairement ce qui est rogné : il faut donc montrer qu'il
   * voit encore le reste, sans quoi son silence ne vaut rien.
   */
  it('et l’épreuve sait, elle, reconnaître un débordement', () => {
    // Hors découpe, hors papier : vu.
    expect(hors('1 0 0 1 0 0 cm\n10 900 m\n20 900 l\nS')).toHaveLength(2);
    // Le même trait, mais rogné dans une fenêtre licite : rien à signaler.
    expect(
      hors('q\n40 40 500 700 re W n\n10 900 m\n20 900 l\nS\nQ'),
    ).toHaveLength(0);
    // Une fenêtre de découpe qui sort du papier : vu.
    expect(hors('q\n40 40 500 900 re W n\nQ')).toHaveLength(1);
    // Après le `Q`, la découpe ne protège plus.
    expect(
      hors('q\n40 40 500 700 re W n\nQ\n10 900 m\n20 900 l\nS'),
    ).toHaveLength(2);
  });

  it('et ne rend jamais un nombre invalide', () => {
    for (const logement of LOGEMENTS) {
      const src = latin1(
        buildScanPdf(
          {
            name: logement.nom,
            walls: logement.walls,
            openings: [],
            objects: logement.objects,
          },
          true,
          { metre: true },
        ),
      );
      expect(src).not.toContain('NaN');
      expect(src).not.toContain('Infinity');
      expect(src).not.toContain('undefined');
    }
  });
});

describe('le banc d’épreuve du plan', () => {
  /**
   * LES PIÈCES SE REFERMENT, ET LEUR SURFACE EST PLAUSIBLE.
   *
   * Une surface fausse ne se voit pas sur le dessin : elle part au devis.
   */
  it('mesure juste les logements dont on connaît la surface', () => {
    const cas: [string, WallSeg[], number][] = [
      ['carré 4 × 4', LOGEMENTS[0].walls, 16],
      ['rectangle 9 × 2,4', LOGEMENTS[1].walls, 21.6],
      ['L de 27 m²', LOGEMENTS[2].walls, 27],
      ['biais 12°', LOGEMENTS[3].walls, 17.5],
      ['biais 47°', LOGEMENTS[4].walls, 17.5],
    ];
    for (const [nom, walls, attendu] of cas) {
      const parts = roomParts(walls);
      const aire = parts.reduce((t, p) => t + (p.surface?.area ?? 0), 0);
      // Les murs ont une épaisseur : la surface utile est un peu plus
      // petite que la surface d'axe en axe. Dix pour cent de marge.
      expect(aire).toBeGreaterThan(attendu * 0.85);
      expect(aire).toBeLessThanOrEqual(attendu + 0.01);
      expect(nom.length).toBeGreaterThan(0);
    }
  });

  it('et le périmètre suit la géométrie', () => {
    const perim = LOGEMENTS[0].walls.reduce((t, w) => t + segLength(w), 0);
    expect(perim).toBeCloseTo(16, 6);
  });
});

/**
 * LE MÊME BANC, MAIS AVEC LE LOGEMENT ÉQUIPÉ.
 *
 * Les épreuves ci-dessus promènent des murs et des meubles. Or ce qu'on
 * regarde vraiment sur ce modèle, ce sont les APPAREILS : une prise à
 * 25 cm, un interrupteur à 1,10 m, six spots au plafond, et la gaine qui
 * les relie. Ce sont eux qui portent les cotes, eux qu'on cherche des yeux,
 * et eux dont le tri en profondeur décide s'ils se voient ou pas.
 *
 * On rejoue donc les mêmes invariants sur un logement ÉQUIPÉ, sous les
 * mêmes 144 angles : rien d'invalide, rien d'invisible, et jamais un
 * appareil peint par-dessus le mur qui devrait le cacher.
 */
describe('le banc d’épreuve du logement équipé', () => {
  const octets = (bytes: Uint8Array) => {
    let t = '';
    for (let i = 0; i < bytes.length; i++) t += String.fromCharCode(bytes[i]);
    return t;
  };

  /** Deux appareils par mur, plus le tableau : une pose ordinaire. */
  const equiper = (walls: WallSeg[]) =>
    walls.flatMap((w, i) => {
      const len = segLength(w);
      return [
        {
          id: `fx${i}a`,
          kind: 'prise' as const,
          wallId: w.id,
          along: Math.min(len - 0.2, 0.6),
          height: 0.25,
          side: 1 as const,
        },
        {
          id: `fx${i}b`,
          kind: (i % 3 === 0 ? 'inter' : 'rj45') as 'inter' | 'rj45',
          wallId: w.id,
          along: Math.max(0.2, len - 0.6),
          height: i % 3 === 0 ? 1.1 : 0.25,
          side: 1 as const,
        },
      ];
    });

  /** Trois points lumineux, et une gaine qui traverse la pièce. */
  const plafonner = (logement: (typeof LOGEMENTS)[number]) => {
    const parts = roomParts(logement.walls, [{ id: 'r1' }]);
    const ring = parts[0]?.surface?.pts ?? [];
    if (ring.length < 3) return { ceiling: [], routes: [] };
    const c = {
      x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
      z: ring.reduce((s, p) => s + p.z, 0) / ring.length,
    };
    return {
      ceiling: [{ id: 'cl1', kind: 'dcl' as const, roomId: 'r1', at: c }],
      routes: [{ id: 'fx0a', path: [ring[0], c] }],
    };
  };

  it('ne produit aucune coordonnée invalide, appareils compris', () => {
    for (const logement of LOGEMENTS) {
      const { ceiling, routes } = plafonner(logement);
      const { faces } = buildScene(logement.walls, [], logement.objects, {
        palette: PAL,
        showSurfaces: true,
        rooms: [{ id: 'r1' }],
        fixtures: equiper(logement.walls),
        ceiling,
        routes,
        routeHeights: { fx0a: 0.25 },
      });
      for (const f of faces) {
        for (const p of f.pts) {
          expect(
            `${logement.nom} : ${Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)}`,
          ).toBe(`${logement.nom} : true`);
        }
      }
    }
  });

  /**
   * UN APPAREIL NE TRAVERSE PAS SON MUR.
   *
   * C'est le défaut le plus coûteux de cette vue : une prise du mur d'en
   * face qui se dessine par-dessus la cloison qu'on regarde. On voit alors
   * six prises sur un mur qui n'en porte que trois, et on perce à côté.
   */
  it('ne montre jamais un appareil au travers d’un mur', () => {
    for (const logement of LOGEMENTS) {
      const { faces } = buildScene(logement.walls, [], logement.objects, {
        palette: PAL,
        showSurfaces: true,
        rooms: [{ id: 'r1' }],
        fixtures: equiper(logement.walls),
      });
      const centre = sceneFraming(faces).center;
      for (const cam of ANGLES) {
        const project = projecteur(cam, centre, 40);
        const vues = faces.filter((f) => !isHiddenFace(f, cam));
        const appareils = vues.filter((f) => f.ownerId?.startsWith('fx'));
        for (const a of appareils) {
          const da = faceDepth(a, project, cam);
          const devant = vues.filter(
            (w) =>
              !w.ownerId &&
              !w.isFloor &&
              w.fill !== null &&
              recouvre(w, a, project) &&
              plusProche(w, a, project),
          );
          for (const w of devant) {
            expect(da).toBeLessThanOrEqual(faceDepth(w, project, cam) + 1e-6);
          }
        }
      }
    }
  });

  it('et le dossier d’un logement équipé tient dans ses pages', () => {
    for (const logement of LOGEMENTS) {
      const { ceiling } = plafonner(logement);
      const bytes = buildScanPdf(
        {
          name: logement.nom,
          walls: logement.walls,
          openings: [],
          objects: logement.objects,
          rooms: [{ id: 'r1' }],
          roomNames: { r1: 'Séjour' },
          fixtures: equiper(logement.walls),
          north: 40,
        },
        true,
        { metre: true, elevations: true, ceiling },
      );
      const src = octets(bytes);
      expect(src.startsWith('%PDF-1.4')).toBe(true);
      expect(src).not.toContain('NaN');
      for (const p of hors(src)) {
        expect(`${logement.nom} · ${p.op} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`).toBe(
          `${logement.nom} · dans la page`,
        );
      }
    }
  });
});
