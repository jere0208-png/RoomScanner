/**
 * LES EMBRASURES SONT FERMÉES : DU DEHORS, ON NE VOIT JAMAIS LA PIÈCE AUTOUR
 * D'UN OUVRANT.
 *
 * Relevé du patron, vidéo de son écran à l'appui : « il y a un espace sur les
 * côtés des ouvrants fenêtres, baie, on peut voir l'intérieur depuis
 * l'extérieur ». Le trou se perçait à la même FRACTION de chaque nu du mur,
 * alors que la menuiserie se pose à l'abscisse du TRAIT : sur la façade nord
 * de l'exemple, le tableau droit de la fenêtre du séjour partait en biais de
 * 0,789 (nu intérieur) à 0,682 (nu extérieur) pour un dormant posé à 0,80 —
 * une fente de part en part du mur.
 *
 * L'épreuve porte sur ce que la carte graphique reçoit vraiment : le bâti de
 * la maquette (`maillageDeLaMaquette`, sans les aplats que les volumes
 * remplacent) et les menuiseries fabriquées (`modeleDe`), posées comme la vue
 * native les pose. Pour chaque fenêtre, porte-fenêtre et porte de l'exemple :
 *   — l'EMBRASURE : sur tout le pourtour du trou (tableaux, linteau, allège
 *     ou seuil), une face de maçonnerie ferme l'épaisseur du mur, d'un nu à
 *     l'autre, exactement au bord de la menuiserie ;
 *   — le DORMANT (l'huisserie d'une porte) va jusqu'à cette face : à deux
 *     millimètres du bord, un regard d'équerre au mur bute sur lui ;
 *   — et, de chaque côté du mur, aucun regard visant le pourtour — d'équerre
 *     ou en biais vers le tableau — ne traverse l'épaisseur sans rien heurter.
 */
import { appartementExemple } from '../src/data/exemple';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { modeleDe, type PoseDeMeuble } from '../src/geometry/modeles3d';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};

type V = [number, number, number];
type Tri = [V, V, V];

const ex = appartementExemple();
const scene = buildScene(ex.walls, ex.openings, ex.objects as never, {
  palette: PAL,
  rooms: ex.rooms as never,
  fixtures: ex.fixtures as never,
  showSurfaces: true,
});

/** Le bâti tel que la maquette native le reçoit : douze nombres par triangle. */
const m = maillageDeLaMaquette(scene.faces, { sansMeubles: true });
const bati: Tri[] = [];
for (const src of [m.orientes, m.ecorche, m.maillage]) {
  for (let i = 0; i + 12 <= src.length; i += 12) {
    bati.push([
      [src[i], src[i + 1], src[i + 2]],
      [src[i + 3], src[i + 4], src[i + 5]],
      [src[i + 6], src[i + 7], src[i + 8]],
    ]);
  }
}

const ouvrants = (scene.meubles ?? []).filter(
  (p) => p.category === 'fenetre3d' || p.category === 'porte3d',
);

/** Les triangles d'une menuiserie, posée comme `maillageDesMeubles` la pose. */
function trianglesDe(p: PoseDeMeuble): Tri[] {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const out: Tri[] = [];
  for (const g of modeleDe(p).groupes) {
    const pt = (k: number): V => {
      const x = g.v[k * 8];
      const z = g.v[k * 8 + 2];
      return [p.cx + x * c - z * s, p.yb + g.v[k * 8 + 1], p.cz + x * s + z * c];
    };
    for (let i = 0; i + 3 <= g.i.length; i += 3) out.push([pt(g.i[i]), pt(g.i[i + 1]), pt(g.i[i + 2])]);
  }
  return out;
}

/** Möller–Trumbore, des deux côtés : la distance du premier triangle touché. */
function lancer(o: V, d: V, tris: Tri[]): number {
  let best = Infinity;
  for (const [a, b, c] of tris) {
    const e1: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: V = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p: V = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const t0: V = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) * inv;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const q: V = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
    if (t > 1e-7 && t < best) best = t;
  }
  return best;
}

/**
 * Le repère d'un ouvrant : x le long du mur (bords en ±W/2), y depuis le bas
 * de la baie, z au travers du mur (nus en ±D/2). `monde` y ramène un point,
 * `dir` une direction.
 */
function repere(p: PoseDeMeuble) {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return {
    W: p.width,
    D: p.depth,
    H: p.height,
    monde: (x: number, y: number, z: number): V => [p.cx + x * c - z * s, p.yb + y, p.cz + x * s + z * c],
    dir: (x: number, y: number, z: number): V => {
      const n = Math.hypot(x, y, z);
      return [(x * c - z * s) / n, y / n, (x * s + z * c) / n];
    },
  };
}

/**
 * Le pourtour du trou : chaque bord, la direction de la maçonnerie qui le
 * borde, et les abscisses où on le sonde (à quatre centimètres des angles).
 *
 * Au sol, le bas de la baie n'est pas une allège mais un SEUIL, posé sur le
 * sol, d'un nu à l'autre : on le sonde du dessus, et l'on ne vise ni sous
 * le plancher, où il n'y a rien à voir, ni plus haut que le seuil — une
 * porte ouverte entre deux pièces se traverse, c'est voulu.
 */
function bords(p: PoseDeMeuble) {
  const { W, H } = repere(p);
  const auSol = p.yb < 0.05;
  const le = (a: number, b: number, n = 6) => Array.from({ length: n }, (_, k) => a + ((k + 0.5) / n) * (b - a));
  const surLeMur = [-0.004, 0, 0.004, 0.012, 0.03, 0.06, 0.12];
  const jambe = le(0.04, H - 0.04);
  const travers = le(-W / 2 + 0.04, W / 2 - 0.04);
  return [
    { nom: 'tableau gauche', point: (l: number, d: number, z: number): V => [-W / 2 - d, l, z], vers: [-1, 0, 0] as V, long: jambe, decals: surLeMur, sol: false },
    { nom: 'tableau droit', point: (l: number, d: number, z: number): V => [W / 2 + d, l, z], vers: [1, 0, 0] as V, long: jambe, decals: surLeMur, sol: false },
    { nom: 'linteau', point: (l: number, d: number, z: number): V => [l, H + d, z], vers: [0, 1, 0] as V, long: travers, decals: surLeMur, sol: false },
    {
      nom: auSol ? 'seuil' : 'allège',
      point: (l: number, d: number, z: number): V => [l, -d, z],
      vers: [0, -1, 0] as V,
      long: travers,
      decals: auSol ? [-0.01, -0.004] : surLeMur,
      sol: auSol,
    },
  ];
}

describe('les embrasures de l’exemple', () => {
  it('l’exemple a ses fenêtres, sa porte-fenêtre et ses portes en volume', () => {
    const types = ouvrants.map((p) => (p.attributes ?? []).find((a) => a.startsWith('FenetreType')) ?? p.category);
    expect(types).toContain('FenetreType:fenetre');
    expect(types).toContain('FenetreType:portefenetre');
    expect(types).toContain('porte3d');
    expect(ouvrants.length).toBe(9);
  });

  for (const p of ouvrants) {
    describe(p.id, () => {
      const r = repere(p);
      const menuiserie = trianglesDe(p);
      const tout = [...bati, ...menuiserie];

      it('l’embrasure ferme l’épaisseur du mur sur tout le pourtour, au bord exact de la baie', () => {
        const fautes: string[] = [];
        for (const b of bords(p)) {
          for (const l of b.long) {
            for (const zf of [-0.45, -0.25, 0, 0.25, 0.45]) {
              // Depuis deux centimètres dans le trou, vers la maçonnerie : la
              // face de l'embrasure est là, à deux centimètres — ni plus loin
              // (un tableau en retrait, une fente), ni plus près.
              // Au sol, le seuil est posé SUR le sol, épais d'un à deux
              // centimètres : sondé de trois centimètres au-dessus, sa face
              // est entre un et deux centimètres plus bas.
              const haut = b.sol ? 0.03 : 0.02;
              const [x, y, z] = b.point(l, -haut, zf * r.D);
              const t = lancer(r.monde(x, y, z), r.dir(...b.vers), bati);
              const juste = b.sol ? t > 0.0099 && t < 0.0201 : Math.abs(t - 0.02) < 1e-3;
              if (!juste) fautes.push(`${b.nom} l=${l.toFixed(2)} z=${(zf * r.D).toFixed(3)} → ${t}`);
            }
          }
        }
        expect(fautes).toEqual([]);
      });

      it('le dormant va jusqu’au tableau : à deux millimètres du bord, on bute sur lui', () => {
        const fautes: string[] = [];
        // Une porte n'a pas de traverse basse : son seuil est au bâti, vu
        // plus haut.
        for (const b of bords(p).filter((x) => !(x.sol && p.category === 'porte3d'))) {
          for (const l of b.long) {
            for (const cote of [-1, 1]) {
              const [x, y] = b.point(l, -0.002, 0);
              const o = r.monde(x, y, cote * (r.D / 2 + 0.01));
              const t = lancer(o, r.dir(0, 0, -cote), menuiserie);
              if (!(t < r.D + 0.02)) fautes.push(`${b.nom} l=${l.toFixed(2)} côté ${cote}`);
            }
          }
        }
        expect(fautes).toEqual([]);
      });

      it('d’aucun côté, aucun regard vers le pourtour ne traverse le mur', () => {
        const fautes: string[] = [];
        for (const b of bords(p)) {
          for (const l of b.long) {
            for (const cote of [-1, 1]) {
              // Le point visé, sur le nu, autour du bord de la baie : un peu
              // dans le trou, au bord, un peu sur le mur.
              for (const decal of b.decals) {
                const [x, y] = b.point(l, decal, 0);
                // D'équerre, puis de plus en plus en biais VERS la maçonnerie
                // — c'est le regard qui file le long du tableau.
                for (const biais of [0, 0.3, 0.6, 1.2]) {
                  const d = r.dir(b.vers[0] * biais, b.vers[1] * biais, -cote);
                  const cible = r.monde(x, y, cote * (r.D / 2));
                  const o: V = [cible[0] - d[0] * 0.01, cible[1] - d[1] * 0.01, cible[2] - d[2] * 0.01];
                  // Ce qui traverse l'épaisseur sans rien toucher voit l'autre
                  // côté : la pièce depuis la rue, ou la rue depuis la pièce.
                  const traversee = (r.D + 0.01) * Math.hypot(b.vers[0] * biais, b.vers[1] * biais, 1);
                  if (lancer(o, d, tout) > traversee + 0.005) {
                    fautes.push(`${b.nom} l=${l.toFixed(2)} décalage ${decal} biais ${biais} côté ${cote}`);
                  }
                }
              }
            }
          }
        }
        expect(fautes).toEqual([]);
      });
    });
  }
});
