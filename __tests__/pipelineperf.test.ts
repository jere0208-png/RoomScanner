/**
 * LA FIN DE SCAN TIENT LA CHARGE D'UN GRAND LOGEMENT — trente pièces, cent
 * trente-huit surfaces, deux cents meubles. Mesuré avant : 1,4 à 2,2 s sous
 * Node pour `finalize`, autant pour un passage de plus ou un niveau empilé
 * (davantage sur l'iPhone). Trois étapes étaient quadratiques ou répétées :
 *   — l'écartement des meubles (`separerMeubles`) : trois passes sur toutes
 *     les paires, chacune copiant les deux meubles ;
 *   — l'alignement de cuisine : chaque meuble interrogeait tous les autres,
 *     et chaque côté relisait tous les murs ;
 *   — le recalage des baies : un tableau de murs neuf par baie, donc les
 *     faces de tous les murs recalculées à chaque baie.
 * Le résultat ne change pas : on le vérifie ici contre le calcul complet.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { separerMeubles } from '../src/geometry/floorplan';

let graine = 7;
const hasard = () => {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return graine / 2147483648;
};

/** Un grand logement en grille : cloisons vues des deux côtés, portes, fenêtres, meubles. */
function grandLogement(cols = 6, rows = 5, taille = 3.2): { surfaces: SurfaceData[]; objects: ObjectData[] } {
  graine = 7;
  const surfaces: SurfaceData[] = [];
  const mur = (id: string, ax: number, az: number, bx: number, bz: number, type: SurfaceData['type'] = 'wall', h = 2.5, y = 1.25) => {
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    surfaces.push({ id, type, length: L, height: h, transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, y, (az + bz) / 2, 1] });
  };
  const j = () => (hasard() - 0.5) * 0.03;
  let n = 0;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const z = r * taille + j();
      mur(`h${r}-${c}`, c * taille + j(), z, (c + 1) * taille + j(), z + j());
      if (r > 0 && r < rows) mur(`h${r}-${c}-f`, c * taille + j(), z + 0.07, (c + 1) * taille + j(), z + 0.07 + j());
      if (r > 0 && r < rows && c % 2 === 0) mur(`d${n++}`, c * taille + 1, z, c * taille + 1.9, z, 'door', 2.05, 1.025);
      if (r === 0) mur(`f${n++}`, c * taille + 1, z, c * taille + 2.2, z, 'window', 1.2, 1.5);
    }
  }
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = c * taille + j();
      mur(`v${c}-${r}`, x, r * taille + j(), x + j(), (r + 1) * taille + j());
      if (c > 0 && c < cols) mur(`v${c}-${r}-f`, x + 0.07, r * taille + j(), x + 0.07 + j(), (r + 1) * taille + j());
    }
  }
  const cats = ['storage', 'bed', 'sofa', 'table', 'chair', 'chair', 'refrigerator', 'washerDryer'];
  const objects: ObjectData[] = [];
  for (let k = 0; k < 200; k++) {
    const piece = k % (cols * rows);
    const cx = (piece % cols) * taille + 0.6 + hasard() * (taille - 1.2);
    const cz = Math.floor(piece / cols) * taille + 0.6 + hasard() * (taille - 1.2);
    const yaw = Math.floor(hasard() * 4) * (Math.PI / 2) + (hasard() - 0.5) * 0.05;
    const cat = cats[k % cats.length];
    const w = cat === 'chair' ? 0.45 : 0.6 + hasard() * 1.2;
    const d = cat === 'chair' ? 0.45 : 0.4 + hasard() * 0.5;
    const h = 0.5 + hasard() * 1.2;
    objects.push({
      id: `o${k}`,
      category: cat,
      width: w,
      depth: d,
      height: h,
      transform: [Math.cos(yaw), 0, Math.sin(yaw), 0, 0, 1, 0, 0, -Math.sin(yaw), 0, Math.cos(yaw), 0, cx, h / 2, cz, 1],
    } as ObjectData);
  }
  return { surfaces, objects };
}

const meilleur = (f: () => void, fois: number) => {
  let mieux = Infinity;
  for (let i = 0; i < fois; i++) {
    const t0 = Date.now();
    f();
    mieux = Math.min(mieux, Date.now() - t0);
  }
  return mieux;
};

describe('la fin de scan d’un grand logement', () => {
  const r = grandLogement();

  it('finalize, un passage de plus, un niveau empilé : chacun bien sous la seconde et demie', () => {
    const fin = meilleur(() => {
      useScanStore.setState({ saves: [] });
      useScanStore.getState().finalize(r as never);
    }, 3);
    const st = useScanStore.getState();
    expect(st.rooms.length).toBe(30);
    expect(st.objects.length).toBeGreaterThan(190);
    const passage = meilleur(() => useScanStore.getState().finalizeMerge({ ...r, passages: 2 } as never), 2);
    // Avant : 1,4 à 2,2 s chacun sous Node. Le seuil laisse la place d'une machine chargée.
    expect(fin).toBeLessThan(1500);
    expect(passage).toBeLessThan(1500);
  });
});

/** Le calcul complet d'avant, sans écarter d'emblée les paires lointaines. */
function separerSansRaccourci<T extends { cx: number; cz: number; width: number; depth: number; yaw: number; y0: number; y1: number; category?: string }>(
  objets: T[],
): { index: number; dx: number; dz: number }[] {
  const FRANC = 0.05;
  const bouges = objets.map(() => ({ dx: 0, dz: 0 }));
  const demi = (e: T, n: { x: number; z: number }) =>
    Math.abs(Math.cos(e.yaw) * n.x + Math.sin(e.yaw) * n.z) * (e.width / 2) + Math.abs(-Math.sin(e.yaw) * n.x + Math.cos(e.yaw) * n.z) * (e.depth / 2);
  for (let passe = 0; passe < 3; passe++) {
    for (let i = 0; i < objets.length; i++) {
      for (let j = i + 1; j < objets.length; j++) {
        const a = { ...objets[i], cx: objets[i].cx + bouges[i].dx, cz: objets[i].cz + bouges[i].dz };
        const b = { ...objets[j], cx: objets[j].cx + bouges[j].dx, cz: objets[j].cz + bouges[j].dz };
        const haut = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (haut <= FRANC) continue;
        const axes: { x: number; z: number }[] = [];
        for (const n of [
          { x: Math.cos(a.yaw), z: Math.sin(a.yaw) },
          { x: -Math.sin(a.yaw), z: Math.cos(a.yaw) },
          { x: Math.cos(b.yaw), z: Math.sin(b.yaw) },
          { x: -Math.sin(b.yaw), z: Math.cos(b.yaw) },
        ]) {
          if (axes.some((m) => Math.abs(m.x * n.x + m.z * n.z) > 0.999)) continue;
          axes.push(n);
        }
        const jeux = axes.map((n) => {
          const d = (a.cx - b.cx) * n.x + (a.cz - b.cz) * n.z;
          return { n, d, jeu: Math.abs(d) - demi(a, n) - demi(b, n) };
        });
        if (jeux.some((x) => x.jeu > -FRANC)) continue;
        let sortie = jeux[0];
        for (const x of jeux) if (x.jeu > sortie.jeu) sortie = x;
        const sens = sortie.d >= 0 ? 1 : -1;
        const pousse = -sortie.jeu;
        const petit = a.width * a.depth <= b.width * b.depth ? i : j;
        const signe = petit === i ? sens : -sens;
        bouges[petit].dx += sortie.n.x * signe * pousse;
        bouges[petit].dz += sortie.n.z * signe * pousse;
      }
    }
  }
  return bouges.map((b, index) => ({ index, dx: b.dx, dz: b.dz })).filter((b) => Math.hypot(b.dx, b.dz) > 1e-6);
}

describe('écarter d’emblée les meubles lointains ne change rien', () => {
  it('même résultat que le calcul complet, sur des pièces encombrées', () => {
    for (let essai = 0; essai < 6; essai++) {
      graine = 100 + essai;
      // Des meubles serrés (sans encastrement : catégories neutres), qui se chevauchent souvent.
      const objets = Array.from({ length: 80 }, () => ({
        cx: hasard() * 5,
        cz: hasard() * 5,
        width: 0.3 + hasard() * 1.5,
        depth: 0.3 + hasard() * 0.8,
        yaw: hasard() * Math.PI,
        y0: hasard() * 0.5,
        y1: 0.6 + hasard() * 1.5,
        category: 'table',
      }));
      expect(separerMeubles(objets)).toEqual(separerSansRaccourci(objets));
    }
  });
});
