/**
 * LA VISITE EN NATIF — ce qui part vers SceneKit, et dans quel sens.
 *
 * Relevé du patron : « l'exploration n'est pas du tout fluide (...) le sol
 * en parquet apparaît mal aussi, selon la vue, il disparaît (...) fais
 * quelque chose de fluide et fiable, quitte à revoir le modélisme 3D ».
 *
 * La vue à la première personne n'est plus peinte en JavaScript : la scène
 * part UNE fois vers le moteur 3D d'iOS, en triangles, et seule la caméra
 * voyage ensuite. Ce banc tient ce qui ne se voit pas sur un téléphone :
 * que les contours se découpent bien (un sol en L, sans triangle hors de
 * la pièce), que chaque face regarde du bon côté (le sol en haut, le
 * plafond en bas, un mur vers sa pièce — c'est la lumière qui en dépend),
 * que le parquet part comme une MATIÈRE et non comme des traits, et que le
 * tableau se lit douze nombres par triangle, sans un NaN.
 *
 * ET QUE LA DROITE EST À DROITE. Le repère de l'œil mettait +x à droite de
 * qui regarde +z ; sur le plan — une vue de dessus, z vers le bas de la
 * feuille — la droite de qui regarde +z est −x. La vue JavaScript était le
 * miroir du plan. SceneKit, lui, ne se trompe pas de main : il fallait que
 * le JavaScript s'aligne, sans quoi le banc et le téléphone auraient vu
 * deux logements différents.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENTETE_SOL,
  MATIERE,
  PAR_TRIANGLE,
  SENS,
  cameraNative,
  composantes,
  maillageDeLaVisite,
  normaleDuContour,
  sensDesLames,
  triangulerContour,
} from '../src/geometry/visite3d';
import { buildScene, povBase, type Face3D, type P3 } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const sol = (pts: [number, number][]): P3[] => pts.map(([x, z]) => ({ x, y: 0, z }));

/** Aire signée d'un triangle dans le plan (x, z). */
const aire2 = (a: P3, b: P3, c: P3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

describe('la découpe en triangles', () => {
  it('un rectangle : deux triangles, toute la surface', () => {
    const r = sol([[0, 0], [4, 0], [4, 3], [0, 3]]);
    const tris = triangulerContour(r);
    expect(tris).toHaveLength(2);
    const aire = tris.reduce((s, [a, b, c]) => s + Math.abs(aire2(r[a], r[b], r[c])) / 2, 0);
    expect(aire).toBeCloseTo(12, 9);
  });

  it('un sol en L : n − 2 triangles, aucun hors de la pièce', () => {
    /*
      L'éventail depuis le premier sommet planterait un triangle dans le
      creux du L. On vérifie l'aire (celle du L, pas celle de sa boîte) et
      que le centre de chaque triangle est bien dans le contour.
    */
    const L = sol([[0, 0], [6, 0], [6, 2], [2, 2], [2, 5], [0, 5]]);
    const tris = triangulerContour(L);
    expect(tris).toHaveLength(4);
    const aire = tris.reduce((s, [a, b, c]) => s + Math.abs(aire2(L[a], L[b], L[c])) / 2, 0);
    expect(aire).toBeCloseTo(6 * 2 + 2 * 3, 9);
    for (const [a, b, c] of tris) {
      const cx = (L[a].x + L[b].x + L[c].x) / 3;
      const cz = (L[a].z + L[b].z + L[c].z) / 3;
      const dedans = cx <= 6 && cz <= 2 ? true : cx <= 2 && cz <= 5;
      expect(dedans).toBe(true);
    }
  });

  it('un contour parcouru à l’envers rend ses triangles à l’envers aussi', () => {
    const r = sol([[0, 0], [4, 0], [4, 3], [0, 3]]);
    const inverse = [...r].reverse();
    const signe = (pts: P3[]) =>
      Math.sign(triangulerContour(pts).reduce((s, [a, b, c]) => s + aire2(pts[a], pts[b], pts[c]), 0));
    expect(signe(r)).toBe(-signe(inverse));
  });

  it('un mur debout se découpe dans SON plan', () => {
    const mur: P3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 2.5, z: 0 },
      { x: 0, y: 2.5, z: 0 },
    ];
    expect(triangulerContour(mur)).toHaveLength(2);
    const n = normaleDuContour(mur);
    expect(Math.abs(n.z)).toBeGreaterThan(0);
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(0, 9);
  });
});

describe('le sens des lames', () => {
  it('celui du relevé, sinon le grand côté', () => {
    const long = sol([[0, 0], [5, 0], [5, 3], [0, 3]]);
    expect(sensDesLames(long)).toBe(SENS.x);
    expect(sensDesLames(long, 'z')).toBe(SENS.z);
    const haut = sol([[0, 0], [3, 0], [3, 5], [0, 5]]);
    expect(sensDesLames(haut)).toBe(SENS.z);
  });
});

describe('ce qui part vers le natif', () => {
  const rooms = SNAPSHOT_ROOMS.map((r) => ({ id: r.id, wallIds: r.wallIds }));
  const { faces } = buildScene(SNAPSHOT_WALLS, SNAPSHOT_OPENINGS, SNAPSHOT_OBJECTS, {
    palette: MAQUETTE,
    showSurfaces: true,
    plafonds: true,
    rooms,
    matieres: { [rooms[0].id]: 'parquet', [rooms[1].id]: 'carrelage' },
  });
  const { maillage, sols } = maillageDeLaVisite(faces);

  it('douze nombres par triangle, tous finis, les couleurs entre 0 et 1', () => {
    expect(maillage.length).toBeGreaterThan(0);
    expect(maillage.length % PAR_TRIANGLE).toBe(0);
    for (let i = 0; i < maillage.length; i++) {
      expect(Number.isFinite(maillage[i])).toBe(true);
      if (i % PAR_TRIANGLE >= 9) {
        expect(maillage[i]).toBeGreaterThanOrEqual(0);
        expect(maillage[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('les arêtes ne voyagent pas, ni les ombres portées de la maquette', () => {
    expect(faces.some((f) => f.ombre)).toBe(true);
    const pleines = faces.filter((f) => f.pts.length >= 3 && !!f.fill && !f.isFloor);
    const triangles = pleines.reduce((s, f) => s + (f.pts.length - 2), 0);
    expect(maillage.length / PAR_TRIANGLE).toBe(triangles);
  });

  it('le sol part comme une matière, un bloc par pièce, les lames dans leur sens', () => {
    const blocs: { matiere: number; sens: number; n: number }[] = [];
    let i = 0;
    while (i < sols.length) {
      const matiere = sols[i];
      const sens = sols[i + 1];
      const n = sols[i + 5];
      blocs.push({ matiere, sens, n });
      i += ENTETE_SOL + n * 9;
    }
    expect(i).toBe(sols.length);
    expect(blocs).toHaveLength(2);
    expect(blocs.map((b) => b.matiere).sort()).toEqual([MATIERE.parquet, MATIERE.carrelage]);
    for (const b of blocs) {
      expect([SENS.x, SENS.z]).toContain(b.sens);
      expect(b.n).toBeGreaterThan(0);
    }
    // Et ses joints — des traits — ne partent pas en triangles.
    expect(faces.some((f) => f.isFloor && f.pts.length === 2)).toBe(true);
  });

  it('le sol regarde en haut, le plafond en bas', () => {
    let i = 0;
    while (i < sols.length) {
      const n = sols[i + 5];
      for (let t = 0; t < n; t++) {
        const b = i + ENTETE_SOL + t * 9;
        const a: P3 = { x: sols[b], y: sols[b + 1], z: sols[b + 2] };
        const c: P3 = { x: sols[b + 3], y: sols[b + 4], z: sols[b + 5] };
        const d: P3 = { x: sols[b + 6], y: sols[b + 7], z: sols[b + 8] };
        // Vu de dessus (x à droite, z vers le bas), le sens direct a une
        // aire NÉGATIVE dans le plan (x, z) : c'est la face qui regarde +y.
        expect(aire2(a, c, d)).toBeLessThan(0);
      }
      i += ENTETE_SOL + n * 9;
    }
    const plafond = faces.find((f) => f.isCeiling)!;
    const seul = maillageDeLaVisite([plafond]).maillage;
    for (let t = 0; t < seul.length; t += PAR_TRIANGLE) {
      const a: P3 = { x: seul[t], y: seul[t + 1], z: seul[t + 2] };
      const c: P3 = { x: seul[t + 3], y: seul[t + 4], z: seul[t + 5] };
      const d: P3 = { x: seul[t + 6], y: seul[t + 7], z: seul[t + 8] };
      expect(aire2(a, c, d)).toBeGreaterThan(0);
    }
  });

  it('un mur regarde du côté que sa normale indique', () => {
    const mur = faces.find((f) => f.normal && !f.isCeiling && f.pts.length >= 3 && !!f.fill)!;
    const seul = maillageDeLaVisite([mur]).maillage;
    const a: P3 = { x: seul[0], y: seul[1], z: seul[2] };
    const b: P3 = { x: seul[3], y: seul[4], z: seul[5] };
    const c: P3 = { x: seul[6], y: seul[7], z: seul[8] };
    const n = normaleDuContour([a, b, c]);
    const vers = n.x * mur.normal!.x + n.y * mur.normal!.y + n.z * mur.normal!.z;
    expect(vers).toBeGreaterThan(0);
    // Et la même face parcourue à l'envers arrive dans le MÊME sens.
    const envers: Face3D = { ...mur, pts: [...mur.pts].reverse() };
    const seul2 = maillageDeLaVisite([envers]).maillage;
    const n2 = normaleDuContour([
      { x: seul2[0], y: seul2[1], z: seul2[2] },
      { x: seul2[3], y: seul2[4], z: seul2[5] },
      { x: seul2[6], y: seul2[7], z: seul2[8] },
    ]);
    expect(n2.x * mur.normal!.x + n2.y * mur.normal!.y + n2.z * mur.normal!.z).toBeGreaterThan(0);
  });

  it('la caméra : six nombres, l’ouverture en degrés', () => {
    expect(cameraNative({ at: { x: 1, y: 1.6, z: 2 }, yaw: 0.3, pitch: -0.1, fov: 70 })).toEqual([
      1, 1.6, 2, 0.3, -0.1, 70,
    ]);
    expect(composantes('#FF8000')).toEqual([1, 128 / 255, 0]);
    expect(composantes('rouge')).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('la droite est à droite', () => {
  it('droite = avant × haut, dans un monde où y monte', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, 2.1, Math.PI, -1.3]) {
      const b = povBase({ at: { x: 0, y: 1.6, z: 0 }, yaw, pitch: -0.12, fov: 60 });
      expect(b.droite.x).toBeCloseTo(b.avant.y * b.haut.z - b.avant.z * b.haut.y, 9);
      expect(b.droite.y).toBeCloseTo(b.avant.z * b.haut.x - b.avant.x * b.haut.z, 9);
      expect(b.droite.z).toBeCloseTo(b.avant.x * b.haut.y - b.avant.y * b.haut.x, 9);
    }
    // Qui regarde +z (le bas de la feuille) a −x à sa droite.
    const b = povBase({ at: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0, fov: 60 });
    expect(b.droite.x).toBeCloseTo(-1, 9);
  });
});

describe('le natif est bien branché', () => {
  const racine = join(__dirname, '..');
  const lire = (p: string) => readFileSync(join(racine, p), 'utf8');

  it('le pont expose la vue et ses quatre propriétés', () => {
    const m = lire('modules/react-native-room-scan/ios/RoomScan.m');
    expect(m).toContain('RCT_EXTERN_MODULE(RoomScanVisiteManager, RCTViewManager)');
    for (const p of ['maillage', 'sols', 'camera']) {
      expect(m).toContain(`RCT_EXPORT_VIEW_PROPERTY(${p}, NSArray)`);
    }
    expect(m).toContain('RCT_EXPORT_VIEW_PROPERTY(fond, NSString)');
  });

  it('la vue est SceneKit, bâtie une fois, le parquet en texture répétée', () => {
    const s = lire('modules/react-native-room-scan/ios/RoomScanVisite.swift');
    expect(s).toContain('import SceneKit');
    expect(s).toContain('@objc(RoomScanVisite)');
    expect(s).toContain('@objc(RoomScanVisiteManager)');
    expect(s).toContain('SCNView');
    expect(s).toContain('.repeat');
    expect(s).toContain('look(');
    // La scène ne se reconstruit qu'au changement de maillage, jamais par image.
    expect(s).toMatch(/var camera: \[NSNumber\][\s\S]*?didSet \{ placerOeil\(\) \}/);
  });

  it('et le JavaScript ne le demande que s’il est là', () => {
    const js = lire('modules/react-native-room-scan/src/index.ts');
    expect(js).toContain("'RoomScanVisite'");
    expect(js).toMatch(/RoomScanVisite = UIManager\.getViewManagerConfig/);
  });
});
