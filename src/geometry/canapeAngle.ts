/**
 * LE CANAPÉ D'ANGLE, RÉUNI.
 *
 * Relevé du patron : « le canapé d'angle scanné détecte un canapé standard +
 * un fauteuil ». RoomPlan découpe souvent un L en deux boîtes : le grand
 * côté, qu'il appelle canapé, et la méridienne — un « canapé » étroit, ou
 * une « chaise » que le modèle 3D dessine en fauteuil. Aucune étape ne les
 * réunissait.
 *
 * On lit la seconde pièce DANS LE REPÈRE du canapé (avant = −z local) : elle
 * forme un L si elle est d'équerre avec lui, de hauteur voisine, collée à
 * l'un de ses BOUTS, et qu'elle AVANCE devant lui. Si elle avance derrière,
 * c'est que RoomPlan a pris le canapé à l'envers — il hésite à 180° près sur
 * les sièges : un L ne s'assoit jamais face au mur, on le retourne.
 *
 * Le canapé réuni garde l'identifiant, la couleur et l'orientation du grand
 * côté ; sa caisse couvre les deux ; il porte `SofaType:lShaped` et le côté
 * de sa méridienne (`SofaAngle:droite|gauche`), que le modèle 3D dessine.
 *
 * Cela se fait AVANT d'écarter les meubles qui se chevauchent
 * (`separerLeMobilier`) — il repousserait la méridienne — et avant de
 * redresser les sièges, qui laisse ensuite un L réuni tel quel.
 */
import type { ObjectData } from 'react-native-room-scan';

const CANAPE = /sofa|couch/i;
const SIEGE = /sofa|couch|chair|armchair/i;

type Attribue = { attributes?: string[] };

/** Les coins d'une boîte posée, dans le monde (x, z). */
function coins(o: ObjectData): { x: number; z: number }[] {
  const t = o.transform;
  const lx = Math.hypot(t[0], t[2]) || 1;
  const lz = Math.hypot(t[8], t[10]) || 1;
  const ex = { x: t[0] / lx, z: t[2] / lx };
  const ez = { x: t[8] / lz, z: t[10] / lz };
  const w = (o.width ?? 0) / 2;
  const d = (o.depth ?? 0) / 2;
  const out: { x: number; z: number }[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    out.push({ x: t[12] + ex.x * w * sx + ez.x * d * sz, z: t[14] + ex.z * w * sx + ez.z * d * sz });
  }
  return out;
}

interface Reunion {
  /** Le repère retourné : l'avant du L est derrière le canapé tel que RoomPlan l'a posé. */
  retourne: boolean;
  /** La caisse réunie, dans le repère (retourné ou non) du canapé. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cote: 'droite' | 'gauche';
  /** L'écart entre les deux pièces : la plus collée l'emporte. */
  ecart: number;
}

/** La seconde pièce forme-t-elle un L avec ce canapé ? */
function enL(canape: ObjectData, piece: ObjectData): Reunion | null {
  const t = canape.transform;
  const lx = Math.hypot(t[0], t[2]) || 1;
  const lz = Math.hypot(t[8], t[10]) || 1;
  const ex = { x: t[0] / lx, z: t[2] / lx };
  const ez = { x: t[8] / lz, z: t[10] / lz };

  // D'équerre : alignée ou à angle droit, à 7° près.
  const p = piece.transform;
  const pl = Math.hypot(p[0], p[2]) || 1;
  const cos = (p[0] * ex.x + p[2] * ex.z) / pl;
  const sin = (p[2] * ex.x - p[0] * ex.z) / pl;
  if (Math.abs(2 * sin * cos) > 0.25) return null;

  // De hauteur voisine : une assise, pas un pouf sous la fenêtre.
  const hC = canape.height ?? 0.85;
  const hP = piece.height ?? 0;
  if (hP < 0.35 || Math.abs(hC - hP) > 0.35) return null;

  const W = (canape.width ?? 0) / 2;
  const D = (canape.depth ?? 0) / 2;
  const local = coins(piece).map((q) => {
    const dx = q.x - t[12];
    const dz = q.z - t[14];
    return { x: dx * ex.x + dz * ex.z, z: dx * ez.x + dz * ez.z };
  });
  for (const retourne of [false, true]) {
    const k = retourne ? -1 : 1;
    const xs = local.map((q) => q.x * k);
    const zs = local.map((q) => q.z * k);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    // Elle avance devant le canapé, et elle le touche.
    if (!(z0 < -D - 0.25 && z1 >= -D - 0.12)) continue;
    // À l'un de ses bouts, pas au milieu.
    const s = Math.sign(x0 + x1);
    if (s === 0) continue;
    const dehors = Math.max(s * x0, s * x1);
    const dedans = Math.min(s * x0, s * x1);
    if (dehors < W - 0.25 || dedans < W - 1.3 || dedans > W + 0.12) continue;
    // Une méridienne, pas un second canapé entier.
    if (dehors - dedans > 1.3) continue;
    return {
      retourne,
      x0: Math.min(-W, x0),
      x1: Math.max(W, x1),
      z0: Math.min(-D, z0),
      z1: Math.max(D, z1),
      cote: s > 0 ? 'droite' : 'gauche',
      ecart: Math.max(0, dedans - W) + Math.max(0, -D - z1),
    };
  }
  return null;
}

export function reunirLesCanapesDAngle<O extends ObjectData>(objets: O[]): O[] {
  const pris = new Set<O>();
  const remplaces = new Map<O, O>();
  // Les plus longs d'abord : c'est le grand côté qui accueille la méridienne.
  const canapes = objets
    .filter((o) => CANAPE.test(o.category ?? '') && (o.width ?? 0) >= 1.3)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  for (const c of canapes) {
    if (pris.has(c)) continue;
    let mieux: { piece: O; r: Reunion } | null = null;
    for (const o of objets) {
      if (o === c || pris.has(o) || !SIEGE.test(o.category ?? '')) continue;
      const r = enL(c, o);
      if (r && (!mieux || r.ecart < mieux.r.ecart)) mieux = { piece: o, r };
    }
    if (!mieux) continue;
    pris.add(c);
    pris.add(mieux.piece);

    const { r, piece } = mieux;
    const t = [...c.transform];
    const k = r.retourne ? -1 : 1;
    const lx = Math.hypot(t[0], t[2]) || 1;
    const lz = Math.hypot(t[8], t[10]) || 1;
    const ex = { x: t[0] / lx, z: t[2] / lx };
    const ez = { x: t[8] / lz, z: t[10] / lz };
    // Le centre de la caisse réunie, ramené dans le monde.
    const cx = ((r.x0 + r.x1) / 2) * k;
    const cz = ((r.z0 + r.z1) / 2) * k;
    const centre = { x: t[12] + ex.x * cx + ez.x * cz, z: t[14] + ex.z * cx + ez.z * cz };
    // Retourné : un demi-tour, l'avant passe du côté de la méridienne.
    if (r.retourne) for (const i of [0, 1, 2, 8, 9, 10]) t[i] = -t[i];
    const hC = c.height ?? 0.85;
    const hP = piece.height ?? hC;
    const sous = Math.min(t[13] - hC / 2, piece.transform[13] - hP / 2);
    const H = Math.max(hC, hP);
    t[12] = centre.x;
    t[13] = sous + H / 2;
    t[14] = centre.z;
    const attributs = ((c as Attribue).attributes ?? []).filter((a) => !/^(SofaType|SofaAngle):/i.test(a));
    remplaces.set(c, {
      ...c,
      category: 'sofa',
      width: r.x1 - r.x0,
      depth: r.z1 - r.z0,
      height: H,
      transform: t,
      attributes: [...attributs, 'SofaType:lShaped', `SofaAngle:${r.cote}`],
    });
  }
  if (remplaces.size === 0) return objets;
  return objets.filter((o) => !pris.has(o) || remplaces.has(o)).map((o) => remplaces.get(o) ?? o);
}
