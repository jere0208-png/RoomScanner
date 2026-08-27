/**
 * L'ORDRE DE PEINTURE QUI NE PEUT PAS SE TROMPER.
 *
 * Releve du patron, apres cinq corrections sur le meme sujet : « fais un
 * systeme plus infaillible en restant fluide, mais avec un vrai 3D strict —
 * impossible qu'un mur passe devant un element ».
 *
 * LE CLASSEMENT ACTUEL EST JUSTE PRESQUE PARTOUT — la mesure le dit : zero
 * faute sur mille huit prises de vue, chemin de l'ecran compris. Mais
 * « presque » est le mot : il compare les faces deux a deux la ou elles se
 * recouvrent, et cette methode porte deux impossibilites dans sa definition.
 *
 *   LA RONDE : A devant B, B devant C, C devant A. Configuration ordinaire,
 *   qu'aucun ordre de peinture ne satisfait. Le classement tranche alors au
 *   moins pire, c'est-a-dire qu'il se trompe expres.
 *
 *   LES VOLUMES QUI SE TRAVERSENT : deux boites qui s'interpenetrent n'ont
 *   pas d'ordre — chacune est devant l'autre selon l'endroit qu'on regarde.
 *
 * ON NE TRIE DONC PLUS, ON DECOUPE. L'arbre BSP choisit un plan, range de
 * part et d'autre ce qui s'y range, et COUPE EN DEUX ce qui le traverse. A la
 * fin, plus une seule paire ne se traverse et il n'existe plus de ronde :
 * c'est une propriete de la CONSTRUCTION, pas un resultat de mesure.
 *
 * CE BANC A EU DEUX VERSIONS, ET LA PREMIERE MESURAIT AUTRE CHOSE QUE CE
 * QU'ELLE CROYAIT.
 *
 *   PREMIERE VERSION. Elle exigeait deux proprietes de forme : pour la
 *   ronde, que deux morceaux se rangent selon le demi-espace du plan de
 *   l'autre ; pour les volumes, qu'AUCUN morceau ne traverse le plan d'aucun
 *   autre. Elle rendait 284 fautes sur la ronde et une paire fautive sur les
 *   volumes — et ces deux echecs venaient du BANC, pas de l'arbre.
 *
 *   POURQUOI. Un arbre BSP ne coupe une face que par les plans des NOEUDS
 *   qu'elle traverse, jamais par le plan de toutes les autres faces. Un mur
 *   pose SUR le plan d'un noeud n'est donc pas coupe par le plan d'un
 *   caisson range dans un sous-arbre — et il n'a pas a l'etre : l'ordre
 *   entre eux est deja tranche, exactement, par le plan du noeud. Le banc
 *   reclamait une propriete PLUS FORTE que celle dont l'exactitude a besoin,
 *   et un decoupage qui la satisferait multiplierait les morceaux pour rien.
 *
 *   DEUXIEME VERSION — celle-ci. On ne mesure plus la forme, on mesure LA
 *   SEULE CHOSE QUI SE VOIT : deux morceaux qui se recouvrent A L'ECRAN, et
 *   celui qui se peint en dernier doit etre le plus proche de l'oeil a
 *   l'endroit ou ils se recouvrent. C'est mot pour mot la demande du patron,
 *   « impossible qu'un mur passe devant un element ».
 *
 * ET LE CONTROLE EN SENS INVERSE : le meme compteur, sur l'ordre RETOURNE,
 * doit crier. Un compteur qui rend zero sur tout est un compteur creux.
 */
import {
  construireBsp,
  couper,
  ordreBsp,
  planDe,
  type FaceBsp,
} from '../src/geometry/bsp';
import type { Face3D, P3 } from '../src/geometry/scene3d';

const face = (id: string, pts: [number, number, number][]): Face3D => ({
  pts: pts.map(([x, y, z]) => ({ x, y, z })),
  fill: id,
  stroke: null,
});

// ---------------------------------------------------------------------------
// LE COMPTEUR DE FAUTES — il ne connait que l'ecran.
// ---------------------------------------------------------------------------

const croix = (a: P3, b: P3): P3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const scal = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const unitaire = (a: P3): P3 => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * La base de l'ecran pour une direction d'oeil.
 *
 * `vers` va de la scene VERS L'OEIL ; (u, v) sont les deux axes du papier.
 * La projection est parallele, comme celle de la vue isometrique de l'app :
 * un point s'ecrit (p·u, p·v) et sa profondeur est p·vers.
 */
const baseEcran = (vers: P3) => {
  const haut: P3 = Math.abs(vers.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = unitaire(croix(haut, vers));
  return { u, v: croix(vers, u) };
};

interface P2 {
  x: number;
  y: number;
}

const aire = (pts: P2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

/** Le recouvrement de deux polygones convexes (Sutherland-Hodgman). */
const recouvrement = (sujet: P2[], coupe: P2[]): P2[] => {
  // Le polygone qui coupe doit tourner dans le sens direct pour que
  // « a gauche de l'arete » veuille dire « dedans ».
  const c = aire(coupe) < 0 ? [...coupe].reverse() : coupe;
  let out = sujet;
  for (let i = 0; i < c.length && out.length > 0; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const dedans = (p: P2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-12;
    const suivant: P2[] = [];
    for (let k = 0; k < out.length; k++) {
      const p = out[k];
      const q = out[(k + 1) % out.length];
      const dp = dedans(p);
      const dq = dedans(q);
      if (dp) suivant.push(p);
      if (dp !== dq) {
        const num = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        const den =
          (b.x - a.x) * (p.y - q.y) - (b.y - a.y) * (p.x - q.x);
        if (Math.abs(den) > 1e-15) {
          const t = num / den;
          suivant.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
        }
      }
    }
    out = suivant;
  }
  return out;
};

/**
 * COMPTE LES PAIRES OU LE DESSIN MENT.
 *
 * Pour chaque couple de morceaux qui se recouvrent a l'ecran, on prend un
 * point du recouvrement et on regarde la profondeur des DEUX plans sur ce
 * rayon. Celui qui se peint en dernier recouvre l'autre : il doit donc etre
 * le plus proche de l'oeil. Sinon, c'est une faute — un mur passe devant un
 * element.
 *
 * Aucun chiffre de reglage ici : la nature de la faute suffit a la nommer.
 */
function fautesDePeinture(ordre: FaceBsp[], vers: P3): number {
  const { u, v } = baseEcran(vers);
  const plats = ordre.map((m) => ({
    plan: planDe(m.pts),
    ecran: m.pts.map((p) => ({ x: scal(p, u), y: scal(p, v) })),
  }));
  let fautes = 0;
  for (let i = 0; i < plats.length; i++) {
    const A = plats[i];
    if (!A.plan) continue;
    for (let j = i + 1; j < plats.length; j++) {
      const B = plats[j];
      if (!B.plan) continue;
      const inter = recouvrement(A.ecran, B.ecran);
      if (inter.length < 3) continue;
      if (Math.abs(aire(inter)) < 1e-5) continue;
      const c = inter.reduce(
        (s, p) => ({ x: s.x + p.x / inter.length, y: s.y + p.y / inter.length }),
        { x: 0, y: 0 },
      );
      // Le point du rayon a t = 0, puis la profondeur ou chaque plan le coupe.
      const base: P3 = {
        x: c.x * u.x + c.y * v.x,
        y: c.x * u.y + c.y * v.y,
        z: c.x * u.z + c.y * v.z,
      };
      const profondeur = (pl: { n: P3; d: number }) => {
        const den = scal(pl.n, vers);
        // Face vue exactement de champ : elle ne couvre aucun pixel.
        if (Math.abs(den) < 1e-6) return null;
        return (pl.d - scal(pl.n, base)) / den;
      };
      const da = profondeur(A.plan);
      const db = profondeur(B.plan);
      if (da === null || db === null) continue;
      // `j` se peint apres `i` : il doit etre plus pres de l'oeil.
      if (db < da - 1e-4) fautes++;
    }
  }
  return fautes;
}

describe('le compteur de fautes lui-même', () => {
  // Avant de soupconner l'arbre, on eprouve la regle : deux lames paralleles
  // dont l'ordre ne se discute pas.
  const loin = face('loin', [
    [-1, 0, 0],
    [1, 0, 0],
    [1, 2, 0],
    [-1, 2, 0],
  ]);
  const pres = face('pres', [
    [-1, 0, 1],
    [1, 0, 1],
    [1, 2, 1],
    [-1, 2, 1],
  ]);
  const vers: P3 = { x: 0, y: 0, z: 1 };
  const morceaux = (fs: Face3D[]): FaceBsp[] => fs.map((f) => ({ source: f, pts: f.pts }));

  it('ne voit aucune faute quand le lointain se peint d’abord', () => {
    expect(fautesDePeinture(morceaux([loin, pres]), vers)).toBe(0);
  });

  it('et en compte une quand le lointain se peint par-dessus', () => {
    expect(fautesDePeinture(morceaux([pres, loin]), vers)).toBe(1);
  });

  it('n’en compte aucune quand les deux ne se recouvrent pas', () => {
    // Meme ordre fautif, mais decale de trois metres : rien ne se recouvre a
    // l'ecran, donc rien ne se voit — et une faute qui ne se voit pas n'en
    // est pas une.
    const ailleurs = face('ailleurs', [
      [4, 0, 0],
      [6, 0, 0],
      [6, 2, 0],
      [4, 2, 0],
    ]);
    expect(fautesDePeinture(morceaux([pres, ailleurs]), vers)).toBe(0);
  });
});

describe('le plan d’une face', () => {
  it('se lit sur trois sommets', () => {
    const pl = planDe([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]);
    expect(pl).toBeTruthy();
    expect(Math.abs(pl!.n.z)).toBeCloseTo(1, 6);
    expect(pl!.d).toBeCloseTo(0, 6);
  });

  it('et trois points alignes n’en donnent pas', () => {
    // Le controle en sens inverse : une face degeneree ne doit pas produire
    // un plan au hasard, qui rangerait la moitie de la scene du mauvais cote.
    expect(
      planDe([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ]),
    ).toBeNull();
  });
});

describe('la découpe', () => {
  const carre: P3[] = [
    { x: -1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 2, z: 0 },
    { x: -1, y: 2, z: 0 },
  ];

  it('rend deux morceaux qui se recollent exactement', () => {
    const m = couper(carre, { n: { x: 1, y: 0, z: 0 }, d: 0 });
    expect(m.devant).toBeTruthy();
    expect(m.derriere).toBeTruthy();
    // Aucun morceau ne franchit le plan : c'est tout l'objet de la coupe.
    for (const p of m.devant!) expect(p.x).toBeGreaterThanOrEqual(-1e-9);
    for (const p of m.derriere!) expect(p.x).toBeLessThanOrEqual(1e-9);
    // Et les deux aires font l'aire d'origine : rien ne s'est perdu en route.
    const plate = (pts: P3[]) => pts.map((p) => ({ x: p.x, y: p.y }));
    expect(
      Math.abs(aire(plate(m.devant!))) + Math.abs(aire(plate(m.derriere!))),
    ).toBeCloseTo(Math.abs(aire(plate(carre))), 6);
  });

  it('ne coupe pas ce qui est entierement d’un cote', () => {
    const m = couper(carre, { n: { x: 1, y: 0, z: 0 }, d: -5 });
    expect(m.devant).toBeTruthy();
    expect(m.derriere).toBeNull();
  });
});

/** Les directions d'oeil d'un tour complet, trois inclinaisons. */
function toutesLesVues(): P3[] {
  const out: P3[] = [];
  for (let theta = 0; theta < 360; theta += 5) {
    for (const tilt of [10, 30, 60]) {
      const r = (d: number) => (d * Math.PI) / 180;
      out.push({
        x: Math.sin(r(theta)) * Math.cos(r(tilt)),
        y: Math.sin(r(tilt)),
        z: Math.cos(r(theta)) * Math.cos(r(tilt)),
      });
    }
  }
  return out;
}

/*
  LA RONDE — trois faces dont aucune n'est « la premiere ».

  Trois lames verticales disposees en helice : vue de dessus, chacune passe
  devant la suivante. C'est le cas d'ecole qui met en defaut tout tri par
  comparaison ; l'arbre, lui, decoupe et n'a plus rien a departager.
*/
describe('trois faces en ronde', () => {
  const ronde = [
    face('A', [
      [0, 0, 0],
      [2, 0, 1],
      [2, 2, 1],
      [0, 2, 0],
    ]),
    face('B', [
      [1.5, 0, -0.5],
      [1.5, 0, 1.5],
      [1.5, 2, 1.5],
      [1.5, 2, -0.5],
    ]),
    face('C', [
      [0.5, 0, 1.2],
      [2.5, 0, 0.2],
      [2.5, 2, 0.2],
      [0.5, 2, 1.2],
    ]),
  ];

  it('se peignent dans un ordre juste, sous tous les angles', () => {
    const arbre = construireBsp(ronde);
    let fautes = 0;
    for (const vers of toutesLesVues()) {
      fautes += fautesDePeinture(ordreBsp(arbre, vers), vers);
    }
    expect(fautes).toBe(0);
  });

  it('et l’ordre retourne, lui, est massivement faux', () => {
    // Le controle en sens inverse. Sans lui, un compteur qui rendrait zero
    // par construction ferait passer n'importe quoi.
    const arbre = construireBsp(ronde);
    let fautes = 0;
    for (const vers of toutesLesVues()) {
      fautes += fautesDePeinture([...ordreBsp(arbre, vers)].reverse(), vers);
    }
    expect(fautes).toBeGreaterThan(100);
  });
});

/*
  DEUX VOLUMES QUI SE TRAVERSENT — le meuble a cheval sur la cloison.

  Aucun ordre ne les departage tant qu'on ne les coupe pas : le plateau du
  caisson est pour moitie devant le mur, pour moitie derriere. Apres decoupe,
  chaque moitie a son cote, et le dessin ne ment plus sous aucun angle.
*/
describe('deux volumes qui se traversent', () => {
  const traverse = [
    // Un mur, plan z = 0.
    face('mur', [
      [-2, 0, 0],
      [2, 0, 0],
      [2, 2.5, 0],
      [-2, 2.5, 0],
    ]),
    // Un caisson a cheval dessus : il va de z = -0.3 a z = 0.3.
    face('meuble-dessus', [
      [-0.5, 0.8, -0.3],
      [0.5, 0.8, -0.3],
      [0.5, 0.8, 0.3],
      [-0.5, 0.8, 0.3],
    ]),
  ];

  it('se peignent dans un ordre juste, sous tous les angles', () => {
    const arbre = construireBsp(traverse);
    let fautes = 0;
    for (const vers of toutesLesVues()) {
      fautes += fautesDePeinture(ordreBsp(arbre, vers), vers);
    }
    expect(fautes).toBe(0);
  });

  it('et le plateau a bien ete coupe en deux', () => {
    // La preuve que la garantie a coute quelque chose : sans decoupe, le
    // plateau resterait entier et aucun ordre ne le sauverait.
    const arbre = construireBsp(traverse);
    const bouts = ordreBsp(arbre, { x: 0, y: 1, z: 0 }).filter(
      (m) => m.source.fill === 'meuble-dessus',
    );
    expect(bouts.length).toBe(2);
  });

  it('et le decoupage garde tout le dessin', () => {
    // Rien ne disparait : chaque face d'origine a au moins un morceau.
    const arbre = construireBsp(traverse);
    const ordre = ordreBsp(arbre, { x: 0, y: 1, z: 0 });
    const sources = new Set(ordre.map((m) => m.source.fill));
    expect(sources).toEqual(new Set(['mur', 'meuble-dessus']));
  });
});

describe('ce que la garantie coute', () => {
  it('ne multiplie pas la scene', () => {
    // Une piece de quatre murs et deux caissons : la decoupe ne doit pas
    // faire exploser le nombre de morceaux, sinon le gain de temps du
    // parcours serait mange par le dessin.
    const scene: Face3D[] = [];
    for (const [i, [ax, az, bx, bz]] of (
      [
        [0, 0, 4, 0],
        [4, 0, 4, 3],
        [4, 3, 0, 3],
        [0, 3, 0, 0],
      ] as [number, number, number, number][]
    ).entries()) {
      scene.push(
        face(`m${i}`, [
          [ax, 0, az],
          [bx, 0, bz],
          [bx, 2.5, bz],
          [ax, 2.5, az],
        ]),
      );
    }
    for (const [i, [cx, cz]] of ([[1, 1], [3, 2]] as [number, number][]).entries()) {
      scene.push(
        face(`c${i}`, [
          [cx - 0.4, 0.8, cz - 0.3],
          [cx + 0.4, 0.8, cz - 0.3],
          [cx + 0.4, 0.8, cz + 0.3],
          [cx - 0.4, 0.8, cz + 0.3],
        ]),
      );
    }
    const arbre = construireBsp(scene);
    // Six faces au depart : on accepte qu'elles se coupent, pas qu'elles se
    // multiplient sans mesure.
    expect(arbre.morceaux).toBeGreaterThanOrEqual(scene.length);
    expect(arbre.morceaux).toBeLessThanOrEqual(scene.length * 3);
  });

  it('et cette piece se peint juste sous tous les angles', () => {
    const scene: Face3D[] = [];
    for (const [i, [ax, az, bx, bz]] of (
      [
        [0, 0, 4, 0],
        [4, 0, 4, 3],
        [4, 3, 0, 3],
        [0, 3, 0, 0],
      ] as [number, number, number, number][]
    ).entries()) {
      scene.push(
        face(`m${i}`, [
          [ax, 0, az],
          [bx, 0, bz],
          [bx, 2.5, bz],
          [ax, 2.5, az],
        ]),
      );
    }
    for (const [i, [cx, cz]] of ([[1, 1], [3, 2]] as [number, number][]).entries()) {
      scene.push(
        face(`c${i}`, [
          [cx - 0.4, 0.8, cz - 0.3],
          [cx + 0.4, 0.8, cz - 0.3],
          [cx + 0.4, 0.8, cz + 0.3],
          [cx - 0.4, 0.8, cz + 0.3],
        ]),
      );
    }
    const arbre = construireBsp(scene);
    let fautes = 0;
    for (const vers of toutesLesVues()) {
      fautes += fautesDePeinture(ordreBsp(arbre, vers), vers);
    }
    expect(fautes).toBe(0);
  });
});
