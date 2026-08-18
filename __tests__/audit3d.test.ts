/**
 * L'AUDIT DU RENDU 3D — le tour complet, toutes inclinaisons.
 *
 * Les autres bancs vérifient chacun UNE propriété sur quelques angles.
 * Celui-ci fait le tour de force : trente-six azimuts, quatorze inclinaisons
 * — cinq cent quatre caméras par scène — et il pose les trois questions qu'un
 * chef de chantier poserait en tournant le modèle dans ses mains.
 *
 *   1. EST-CE QUE TOUT EST LÀ ? Chaque meuble doit montrer au moins une face
 *      sous chaque angle. Un élément qui disparaît est le pire défaut : on ne
 *      le cherche pas, on croit qu'il n'existe pas.
 *   2. EST-CE QUE RIEN NE MENT ? Aucune face ne doit en recouvrir une qui est
 *      devant elle — jugé au pixel, dans l'ordre de peinture réel.
 *   3. EST-CE QUE TOUT EST FINI ? Pas une coordonnée folle, pas une face vide,
 *      pas un aplat de meuble sans son contour.
 */
import {
  ajusterBlocs,
  buildScene,
  faceDepth,
  isHiddenFace,
  roomRanks,
  sceneFraming,
  type CameraTrig,
  type Face3D,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';
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

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  roomId = 'r1',
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

const boite = (
  id: string,
  cat: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  y = h / 2,
): ObjectData => ({
  id,
  category: cat,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, y, cz, 1],
});

/** Trois logements : un simple, un percé, un tordu. */
const SCENES = [
  {
    nom: 'chambre meublée',
    walls: [
      mur('n', 0, 0, 4, 0),
      mur('e', 4, 0, 4, 3),
      mur('s', 4, 3, 0, 3),
      mur('o', 0, 3, 0, 0),
    ],
    openings: [
      {
        id: 'fen',
        type: 'window',
        a: { x: 1.2, z: 0 },
        b: { x: 2.6, z: 0 },
        height: 1.2,
        yCenter: 1.5,
      },
      {
        id: 'porte',
        type: 'door',
        a: { x: 0, z: 1 },
        b: { x: 0, z: 1.9 },
        height: 2.05,
        yCenter: 1.025,
      },
    ] as WallSeg[],
    objects: [
      boite('lit', 'bed', 1.2, 1.9, 1.5, 2, 0.55),
      boite('armoire', 'storage', 3.6, 1.2, 0.6, 1.4, 2.1),
      boite('tv', 'television', 2.4, 0.2, 1.1, 0.1, 0.65, 1.35),
    ],
    rooms: [{ id: 'r1' }],
  },
  {
    nom: 'séjour à retour de mur',
    walls: [
      mur('n', 0, 0, 5, 0),
      mur('e', 5, 0, 5, 4),
      mur('s', 5, 4, 0, 4),
      mur('o', 0, 4, 0, 0),
      mur('retour', 2.6, 0, 2.6, 1.6),
    ],
    openings: [] as WallSeg[],
    objects: [
      boite('cache', 'storage', 1.5, 0.8, 1.1, 0.55, 2),
      boite('canape', 'sofa', 3.6, 2.9, 2.1, 0.9, 0.85),
      boite('table', 'table', 1.6, 2.6, 1.2, 0.8, 0.75),
    ],
    rooms: [{ id: 'r1' }],
  },
  {
    nom: 'deux pièces mitoyennes',
    walls: [
      mur('n1', 0, 0, 3, 0),
      mur('mit', 3, 0, 3, 3),
      mur('s1', 3, 3, 0, 3),
      mur('o1', 0, 3, 0, 0),
      mur('n2', 3, 0, 6, 0, 'r2'),
      mur('e2', 6, 0, 6, 3, 'r2'),
      mur('s2', 6, 3, 3, 3, 'r2'),
    ],
    openings: [] as WallSeg[],
    objects: [
      boite('o1', 'storage', 1.5, 0.4, 1, 0.5, 1.8),
      boite('o2', 'bed', 4.6, 2, 1.4, 2, 0.5),
    ],
    rooms: [
      { id: 'r1', wallIds: ['n1', 'mit', 's1', 'o1'] },
      { id: 'r2', wallIds: ['n2', 'e2', 's2', 'mit'] },
    ],
  },
];

/** Cinq cent quatre caméras : le tour complet, du rasant au zénithal. */
const CAMERAS: { theta: number; tilt: number; cam: CameraTrig }[] = [];
for (let theta = 0; theta < 360; theta += 10) {
  for (let tilt = 15; tilt <= 80; tilt += 5) {
    const r = (d: number) => (d * Math.PI) / 180;
    CAMERAS.push({
      theta,
      tilt,
      cam: {
        ct: Math.cos(r(theta)),
        st: Math.sin(r(theta)),
        cp: Math.cos(r(tilt)),
        sp: Math.sin(r(tilt)),
      },
    });
  }
}

const projecteur = (cam: CameraTrig, centre: P3) => (p: P3) => {
  const x = p.x - centre.x;
  const y = p.y - centre.y;
  const z = p.z - centre.z;
  const rx = x * cam.ct - z * cam.st;
  const rz = x * cam.st + z * cam.ct;
  return {
    sx: 200 + rx * 60,
    sy: 260 + (rz * cam.cp - y * cam.sp) * 60,
    depth: rz * cam.sp + y * cam.cp,
  };
};

const dansPoly = (
  pt: { sx: number; sy: number },
  poly: { sx: number; sy: number }[],
) => {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (
      poly[i].sy > pt.sy !== poly[j].sy > pt.sy &&
      pt.sx <
        ((poly[j].sx - poly[i].sx) * (pt.sy - poly[i].sy)) /
          (poly[j].sy - poly[i].sy) +
          poly[i].sx
    ) {
      d = !d;
    }
  }
  return d;
};

const profAu = (
  P: { sx: number; sy: number; depth: number }[],
  pt: { sx: number; sy: number },
): number | null => {
  if (P.length === 2) {
    const [a, b] = P;
    const ex = b.sx - a.sx;
    const ey = b.sy - a.sy;
    const l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((pt.sx - a.sx) * ex + (pt.sy - a.sy) * ey) / l2));
    return a.depth + (b.depth - a.depth) * t;
  }
  for (let i = 1; i + 1 < P.length; i++) {
    const [a, b, c] = [P[0], P[i], P[i + 1]];
    const det = (b.sy - c.sy) * (a.sx - c.sx) + (c.sx - b.sx) * (a.sy - c.sy);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((b.sy - c.sy) * (pt.sx - c.sx) + (c.sx - b.sx) * (pt.sy - c.sy)) / det;
    const l2 = ((c.sy - a.sy) * (pt.sx - c.sx) + (a.sx - c.sx) * (pt.sy - c.sy)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
    return a.depth * l1 + b.depth * l2 + c.depth * l3;
  }
  return null;
};

/** La normale d'une face, par la formule de Newell (robuste aux quads). */
const normaleDe = (pts: P3[]): P3 => {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / l, y: ny / l, z: nz / l };
};

/**
 * DEUX FACES QUI SE TRAVERSENT NE PEUVENT PAS ÊTRE ORDONNÉES.
 *
 * C'est la limite théorique du tri du peintre, et non un défaut de notre
 * moteur : si le plan de A coupe le polygone de B ET l'inverse, aucune des
 * deux ne peut être « devant » l'autre — il faudrait les découper.
 *
 * Le cas se produit à CHAQUE JONCTION DE MURS : un retour pénètre de quelques
 * centimètres dans le mur qu'il rejoint, pour qu'aucun jour ne s'ouvre à
 * l'angle. Les deux faces sont alors de la même maçonnerie, de la même
 * couleur, et le sliver ambigu ne se voit pas. On les écarte donc du banc —
 * en le disant, plutôt qu'en abaissant le critère.
 */
const seTraversent = (A: P3[], B: P3[]): boolean => {
  const cote = (pts: P3[], n: P3, o: P3) => {
    let bas = 0;
    let haut = 0;
    for (const p of pts) {
      const d = (p.x - o.x) * n.x + (p.y - o.y) * n.y + (p.z - o.z) * n.z;
      if (d < -0.01) bas++;
      if (d > 0.01) haut++;
    }
    return bas > 0 && haut > 0;
  };
  return cote(A, normaleDe(B), B[0]) && cote(B, normaleDe(A), A[0]);
};

describe.each(SCENES)('le modèle 3D de $nom', (scene) => {
  const fixtures: Fixture[] = [
    { id: 'f1', kind: 'prise', wallId: scene.walls[0].id, along: 1.1, height: 0.25, side: 1 },
  ];
  const { faces, rooms } = buildScene(scene.walls, scene.openings, scene.objects, {
    palette: PAL,
    showSurfaces: true,
    rooms: scene.rooms,
    fixtures,
  });
  const centre = sceneFraming(faces).center;

  it('ne perd aucun meuble, sous aucun angle', () => {
    const manquants: string[] = [];
    for (const { theta, tilt, cam } of CAMERAS) {
      const vus = faces.filter((f) => !isHiddenFace(f, cam) && f.fill !== null);
      for (const o of scene.objects) {
        if (!vus.some((f) => f.ownerId === o.id)) {
          manquants.push(`${o.id} @ ${theta}°/${tilt}°`);
        }
      }
    }
    expect(
      `${manquants.length} disparition(s)` +
        (manquants.length ? ' — ' + manquants.slice(0, 4).join(', ') : ''),
    ).toBe('0 disparition(s)');
  });

  it('ne peint jamais par-dessus ce qui est devant', () => {
    let fautes = 0;
    const exemples: string[] = [];
    for (const { theta, tilt, cam } of CAMERAS) {
      const project = projecteur(cam, centre);
      const rangs = roomRanks(rooms, cam);
      const vues = faces
        .filter((f) => !isHiddenFace(f, cam) && f.fill !== null && f.pts.length >= 3)
        .map((f) => ({
          f,
          proj: f.pts.map(project),
          depth: faceDepth(f, project, cam, rangs),
          owner: f.ownerId,
          room: f.roomId,
          pan: f.panId,
          bord: f.bordDe,
        }))
        .map((v) => ({ ...v, calque: Math.round(v.depth / 1e4) }));
      ajusterBlocs(vues);
      const peintes = [...vues].sort((a, b) => a.depth - b.depth);
      const rang = new Map(peintes.map((p, i) => [p.f, i] as [Face3D, number]));
      for (const a of vues) {
        const pt = {
          sx: a.proj.reduce((s, p) => s + p.sx, 0) / a.proj.length,
          sy: a.proj.reduce((s, p) => s + p.sy, 0) / a.proj.length,
        };
        const da = profAu(a.proj, pt);
        if (da === null) continue;
        for (const b of vues) {
          if (b === a || !dansPoly(pt, b.proj)) continue;
          const db = profAu(b.proj, pt);
          if (db === null) continue;
          if (
            da > db + 0.02 &&
            rang.get(b.f)! > rang.get(a.f)! &&
            !seTraversent(a.f.pts, b.f.pts)
          ) {
            fautes++;
            if (exemples.length < 5) {
              exemples.push(
                `@${theta}/${tilt} devant=[${a.f.pts
                  .map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)},${q.z.toFixed(1)}`)
                  .join(' ')}] derriere=[${b.f.pts
                  .map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)},${q.z.toFixed(1)}`)
                  .join(' ')}]`,
              );
            }
          }
        }
      }
    }
    expect(
      `${fautes} recouvrement(s)` + (fautes ? ' — ' + exemples.join(', ') : ''),
    ).toBe('0 recouvrement(s)');
  });

  it('ne produit ni coordonnée folle ni face vide', () => {
    let malades = 0;
    for (const { cam } of CAMERAS.filter((_, i) => i % 7 === 0)) {
      const project = projecteur(cam, centre);
      for (const f of faces) {
        if (f.pts.length < 2) malades++;
        for (const p of f.pts.map(project)) {
          if (!isFinite(p.sx) || !isFinite(p.sy) || !isFinite(p.depth)) malades++;
        }
      }
    }
    expect(`${malades} face(s) malade(s)`).toBe('0 face(s) malade(s)');
  });

  it('donne un contour à chaque aplat de meuble', () => {
    const pans = faces.filter((f) => f.ownerId && f.fill !== null && !f.isFloor);
    expect(pans.length).toBeGreaterThan(0);
    const nus = pans.filter((f) => !f.stroke).length;
    expect(`${nus} pan(s) sans contour`).toBe('0 pan(s) sans contour');
  });
});
