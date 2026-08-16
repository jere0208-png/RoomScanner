/**
 * Chaque appareil doit se voir en 3D, à ses cotes.
 *
 * Un test par type du catalogue, ensembles multipostes compris : le volume
 * existe, il mesure ce qu'annonce sa fiche, il est posé devant le nu du mur,
 * et son symbole est gravé dessus — à l'entraxe quand il y a plusieurs
 * postes. C'est le genre de vérification qu'on ne fait pas à l'œil sur
 * quinze types.
 */
import {
  ENTRAXE,
  FIXTURES,
  FIXTURE_KINDS,
  assemblySymbol,
  faceX,
  interiorSide,
  postsOf,
  symbolPolylines,
  wallFace,
  type Fixture,
} from '../src/geometry/electrical';
import { wallQuads, type WallSeg } from '../src/geometry/floorplan';
import {
  buildScene,
  isHiddenFace,
  type Face3D,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { mixHex } from '../src/geometry/appearance';

const wall = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Pièce de 5 m : de quoi loger la plus large des plaques. */
const BOX: WallSeg[] = [
  wall('n', 0, 0, 5, 0),
  wall('e', 5, 0, 5, 4),
  wall('s', 5, 4, 0, 4),
  wall('w', 0, 4, 0, 0),
];

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

const side = interiorSide(BOX[0], BOX);
const face = wallFace(BOX[0], wallQuads(BOX).get('n'), side);

describe('tout l’appareillage se voit en 3D, à ses cotes', () => {
  for (const kind of FIXTURE_KINDS) {
    const spec = FIXTURES[kind];
    const f: Fixture = {
      id: 'x',
      kind,
      wallId: 'n',
      along: 2,
      height: 1.2,
      side,
    };
    const scene = buildScene(BOX, [], [], { palette: PAL, fixtures: [f] });
    const nu = buildScene(BOX, [], [], { palette: PAL });
    // La plaque : ses flancs portent la couleur de l'appareil.
    const plaque = scene.faces.filter((x) => x.fill === spec.color);
    // Le symbole gravé : des traits, dans la teinte foncée de l'appareil.
    const grave = mixHex(spec.color, '#000000', 0.55);
    const traits = scene.faces.filter(
      (x) => x.fill === null && x.stroke === grave,
    );
    const along = (p: { x: number; z: number }) =>
      (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
    const out = (p: { x: number; z: number }) =>
      (p.x - face.A.x) * face.nx + (p.z - face.A.z) * face.nz;

    it(`${spec.label} : un volume s’ajoute au modèle`, () => {
      expect(scene.faces.length).toBeGreaterThan(nu.faces.length);
      expect(plaque.length).toBeGreaterThan(0);
    });

    it(`${spec.label} : ${Math.round(spec.w * 1000)} × ${Math.round(
      spec.h * 1000,
    )} mm, ${Math.round(spec.depth * 1000)} de saillie`, () => {
      const pts = plaque.flatMap((x) => x.pts);
      const xs = pts.map(along);
      const ys = pts.map((p) => p.y);
      const ns = pts.map(out);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(spec.w, 3);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(spec.h, 3);
      // Devant le nu, jamais dedans, et à la saillie annoncée.
      expect(Math.min(...ns)).toBeGreaterThanOrEqual(faceX(face, 0) * 0 - 1e-9);
      expect(Math.max(...ns)).toBeCloseTo(spec.depth, 3);
      // Centrée sur la cote demandée.
      const centre = (Math.max(...xs) + Math.min(...xs)) / 2;
      expect(centre).toBeCloseTo(faceX(face, 2), 3);
      const milieu = (Math.max(...ys) + Math.min(...ys)) / 2;
      expect(milieu).toBeCloseTo(1.2, 3);
    });

    it(`${spec.label} : son symbole est gravé sur la façade`, () => {
      expect(traits.length).toBeGreaterThan(0);
      const pts = traits.flatMap((x) => x.pts);
      // Le tracé reste DANS la plaque, et devant elle.
      const xs = pts.map(along);
      const centre = faceX(face, 2);
      expect(Math.min(...xs)).toBeGreaterThan(centre - spec.w / 2 - 1e-6);
      expect(Math.max(...xs)).toBeLessThan(centre + spec.w / 2 + 1e-6);
      for (const p of pts) expect(out(p)).toBeGreaterThan(spec.depth);
    });

    const n = postsOf(kind).length;
    if (n > 1) {
      it(`${spec.label} : ${n} postes à ${Math.round(
        ENTRAXE * 1000,
      )} mm d’entraxe`, () => {
        // L'écartement des symboles, mesuré sur le tracé lui-même : c'est
        // l'entraxe des boîtes, ramené à l'échelle du symbole.
        const lignes = symbolPolylines(assemblySymbol(kind));
        const xs = lignes.flatMap((l) => l.pts.map((p) => p.x));
        const etendue = Math.max(...xs) - Math.min(...xs);
        // Repère du symbole : 22 unités pour 82 mm de plaque.
        const enMetres = (etendue / 22) * 0.082;
        expect(enMetres).toBeGreaterThan((n - 1) * ENTRAXE * 0.9);
        expect(enMetres).toBeLessThan((n - 1) * ENTRAXE + 0.082);
      });
    }
  }

  /**
   * Le test qui manquait : un volume peut exister ET rester invisible.
   *
   * Les pans de mur se trient sur le milieu de leur tuile, donc à
   * mi-hauteur ; une prise se triait sur son propre centre, à 25 cm du sol.
   * Le terme d'altitude de la profondeur la mettait un mètre DERRIÈRE le mur
   * qui la porte, et le mur la repeignait : à l'écran, plus un seul appareil,
   * seulement ses cotes. On vérifie donc l'ORDRE de peinture, sous six angles
   * de caméra, aux deux hauteurs qui comptent — prise basse et interrupteur.
   */
  describe('l’appareil se peint DEVANT son mur, jamais dessous', () => {
    const rad = (d: number) => (d * Math.PI) / 180;
    for (const kind of FIXTURE_KINDS) {
      const spec = FIXTURES[kind];
      it(`${spec.label} : visible sous tous les angles`, () => {
        for (const h of [0.25, 1.2]) {
          const f: Fixture = { id: 'x', kind, wallId: 'n', along: 2, height: h, side };
          const scene = buildScene(BOX, [], [], { palette: PAL, fixtures: [f] });
          const x0 = faceX(face, 2) - spec.w / 2;
          const x1 = faceX(face, 2) + spec.w / 2;
          const along = (p: { x: number; z: number }) =>
            (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
          const out = (p: { x: number; z: number }) =>
            (p.x - face.A.x) * face.nx + (p.z - face.A.z) * face.nz;
          let vueAuMoinsUneFois = false;
          for (const theta of [15, 75, 135, 195, 255, 315]) {
            const cam = {
              ct: Math.cos(rad(theta)),
              st: Math.sin(rad(theta)),
              cp: Math.cos(rad(35)),
              sp: Math.sin(rad(35)),
            };
            const prof = (p: { x: number; y: number; z: number }) =>
              (p.x * cam.st + p.z * cam.ct) * cam.sp + p.y * cam.cp;
            const dep = (x: Face3D) =>
              (x.depthRefs
                ? Math.max(...x.depthRefs.map(prof))
                : x.depthAt
                ? prof(x.depthAt)
                : x.pts.reduce((s2, p) => s2 + prof(p), 0) / x.pts.length) +
              (x.bias ?? 0);
            const vus = scene.faces.filter((x) => !isHiddenFace(x, cam));
            // La façade de la plaque : celle qui regarde la pièce.
            const facade = vus.filter(
              (x) =>
                x.fill === spec.color &&
                !!x.normal &&
                x.normal.x * face.nx + x.normal.z * face.nz > 0.9,
            );
            if (!facade.length) continue; // vue de dos : normal qu'on ne la voie pas
            vueAuMoinsUneFois = true;
            const dPlaque = Math.min(...facade.map(dep));
            // Les tuiles du mur qui la recouvrent : même face, même portion.
            const dessous = vus.filter(
              (x) =>
                x.fill === PAL.wall &&
                x.pts.every((p) => Math.abs(out(p)) < 0.01) &&
                Math.max(...x.pts.map(along)) > x0 &&
                Math.min(...x.pts.map(along)) < x1,
            );
            const pire = Math.max(-Infinity, ...dessous.map(dep));
            expect(pire).toBeLessThan(dPlaque);
          }
          expect(vueAuMoinsUneFois).toBe(true);
        }
      });
    }
  });

  /**
   * Le revers du remède. Une première correction avançait l'appareil d'un
   * biais constant pour qu'il passe devant sa tuile : il passait alors aussi
   * devant le mur VU DE DOS, et on voyait les prises au travers des
   * cloisons. Le tri se fait donc sur la tuile réelle, avancée d'un
   * millimètre — un millimètre qui compte NÉGATIVEMENT dès qu'on regarde
   * l'autre face. C'est ce signe que ce test surveille.
   */
  describe('vu de dos, le mur recouvre l’appareil', () => {
    const rad = (d: number) => (d * Math.PI) / 180;
    for (const kind of FIXTURE_KINDS) {
      const spec = FIXTURES[kind];
      it(`${spec.label} : invisible à travers la cloison`, () => {
        const f: Fixture = { id: 'x', kind, wallId: 'n', along: 2, height: 1.2, side };
        const scene = buildScene(BOX, [], [], { palette: PAL, fixtures: [f] });
        const out = (p: { x: number; z: number }) =>
          (p.x - face.A.x) * face.nx + (p.z - face.A.z) * face.nz;
        const along = (p: { x: number; z: number }) =>
          (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
        const x0 = faceX(face, 2) - spec.w / 2;
        const x1 = faceX(face, 2) + spec.w / 2;
        let vuDeDos = false;
        for (const theta of [15, 75, 135, 195, 255, 315]) {
          const cam = {
            ct: Math.cos(rad(theta)),
            st: Math.sin(rad(theta)),
            cp: Math.cos(rad(35)),
            sp: Math.sin(rad(35)),
          };
          // On ne garde que les angles où la face porteuse tourne le dos.
          if (face.nx * cam.st * cam.sp + face.nz * cam.ct * cam.sp > 0) continue;
          vuDeDos = true;
          const prof = (p: { x: number; y: number; z: number }) =>
            (p.x * cam.st + p.z * cam.ct) * cam.sp + p.y * cam.cp;
          const dep = (x: Face3D) =>
            (x.depthRefs
              ? Math.max(...x.depthRefs.map(prof))
              : x.depthAt
              ? prof(x.depthAt)
              : x.pts.reduce((s2, p) => s2 + prof(p), 0) / x.pts.length) +
            (x.bias ?? 0);
          const vus = scene.faces.filter((x) => !isHiddenFace(x, cam));
          const appareil = vus.filter((x) => x.fill === spec.color);
          if (!appareil.length) continue; // entièrement écarté : parfait
          // Le dos du mur : les tuiles de la face opposée.
          const dos = vus.filter(
            (x) => x.fill === PAL.wall && x.pts.every((p) => out(p) < -0.13),
          );
          expect(
            dos.filter(
              (x) =>
                Math.max(...x.pts.map(along)) > x0 &&
                Math.min(...x.pts.map(along)) < x1,
            ).length,
          ).toBeGreaterThan(0);
          // Chaque morceau d'appareil se compare aux tuiles qui le couvrent
          // VRAIMENT : une tuile de l'autre bout du mur ne le cache pas.
          for (const a2 of appareil) {
            const ax0 = Math.min(...a2.pts.map(along));
            const ax1 = Math.max(...a2.pts.map(along));
            const dessus = dos.filter(
              (x) =>
                Math.max(...x.pts.map(along)) > ax0 + 1e-6 &&
                Math.min(...x.pts.map(along)) < ax1 - 1e-6,
            );
            for (const d of dessus) expect(dep(a2)).toBeLessThan(dep(d));
          }
        }
        expect(vuDeDos).toBe(true);
      });
    }
  });

  it('deux appareils sous une même plaque restent deux volumes', () => {
    // Un ensemble monté à la main : deux boîtes à l'entraxe, deux
    // mécanismes. Le modèle doit en montrer deux, pas un bloc unique.
    const prise: Fixture = { id: 'a', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side, group: 'g1' };
    const rj: Fixture = {
      id: 'b',
      kind: 'rj45',
      wallId: 'n',
      along: 2 + ENTRAXE * (face.s1 >= face.s0 ? 1 : -1),
      height: 0.25,
      side,
      group: 'g1',
    };
    const scene = buildScene(BOX, [], [], { palette: PAL, fixtures: [prise, rj] });
    const along = (p: { x: number; z: number }) =>
      (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
    const centres = ['prise', 'rj45'].map((k) => {
      const col = FIXTURES[k as 'prise'].color;
      const pts = scene.faces.filter((x) => x.fill === col).flatMap((x) => x.pts);
      const xs = pts.map(along);
      return (Math.max(...xs) + Math.min(...xs)) / 2;
    });
    expect(Math.abs(centres[0] - centres[1])).toBeCloseTo(ENTRAXE, 3);
  });
});
