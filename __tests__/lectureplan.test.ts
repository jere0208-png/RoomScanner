/**
 * LE BANC DE LECTURE — des centaines de plans, lus comme l'IA les lirait.
 *
 * Relevé du patron : « apprends à ce système la lecture en te basant sur des
 * centaines de plans différents, pour qu'il réussisse dans la majorité des
 * cas à comprendre le plan à la lettre : les symboles, les cotes, etc. ».
 *
 * L'IA, on ne l'appelle pas d'un banc : elle coûte, et elle n'est pas
 * déterministe. Ce qu'on éprouve ici, c'est TOUT LE RESTE — ce qui fait d'une
 * lecture approximative un plan juste. Le banc fabrique des plans dont il
 * connaît la vérité, puis la lecture qu'une vision en rendrait :
 *
 *   — une photo : une échelle de 40 à 110 pixels par mètre, une feuille
 *     légèrement de travers, parfois tournée d'un quart de tour ;
 *   — des positions bruitées, de quelques millièmes, comme une vision situe ;
 *   — des cotes dans toutes les écritures (« 3,20 », « 3,20 m », « 320 »,
 *     « 3200 »), hors tout, intérieures ou entre axes, chaînées comme sur un
 *     plan d'architecte — et quelques-unes mal comprises (l'unité) ou mal
 *     lues (un chiffre) ;
 *   — des murs parfois rendus par leurs deux nus au lieu de leur axe ;
 *   — des symboles nommés à la façon des autres : « socket », « PC 20A »,
 *     « VV », « downlight », « smoke detector »…
 *
 * Et il exige que la reconstruction retrouve le plan À DEUX CENTIMÈTRES
 * près, ses pièces et leurs noms, ses ouvertures et ses appareils convertis
 * aux nôtres — sur la grande majorité des plans.
 */
import {
  convertirSymbole,
  lireCote,
  metresCandidats,
  placerLesAxes,
  reconstruirePlan,
  type LectureBrute,
  type PointLu,
  type ReferenceDeCote,
} from '../src/geometry/lecturePlan';
import type { FixtureKind } from '../src/geometry/electrical';
import type { CeilingKind } from '../src/geometry/ceiling';
import type { WallSeg } from '../src/geometry/floorplan';

// ------------------------------------------------------------------ hasard reproductible

function hasard(graine: number) {
  let s = graine >>> 0;
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entre = (a: number, b: number) => a + (b - a) * u();
  const parmi = <T,>(t: readonly T[]) => t[Math.floor(u() * t.length)];
  const gauss = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
  return { u, entre, parmi, gauss };
}

// ------------------------------------------------------------------ la vérité

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
interface Verite {
  /** Les axes des murs, longs, comme on les dessine. */
  murs: { a: { x: number; z: number }; b: { x: number; z: number }; ep: number }[];
  pieces: { nom: string; r: Rect }[];
  ouvertures: { type: 'porte' | 'fenetre' | 'passage'; a: { x: number; z: number }; b: { x: number; z: number }; largeur: number }[];
  murals: { kind: FixtureKind; at: { x: number; z: number } }[];
  plafond: { kind: CeilingKind; at: { x: number; z: number } }[];
}

const NOMS = ['Séjour', 'Chambre', 'Cuisine', 'Salle de bain', 'WC', 'Bureau', 'Entrée', 'Cellier', 'Dégagement', 'Chambre 2', 'Buanderie'];
const r5 = (v: number) => Math.round(v * 20) / 20;

/** Un logement : un rectangle découpé en pièces, comme on cloisonne. */
function genererVerite(h: ReturnType<typeof hasard>): Verite {
  const W = r5(h.entre(6, 14));
  const H = r5(h.entre(5, 11));
  const nPieces = Math.floor(h.entre(2, 8));
  const rects: Rect[] = [{ x0: 0, z0: 0, x1: W, z1: H }];
  const cloisons: { a: { x: number; z: number }; b: { x: number; z: number }; ep: number }[] = [];
  /** Les pièces qu'on ne peut plus couper sans faire un placard. */
  const finies: Rect[] = [];
  const aligner = (v: number, axes: number[]) => axes.find((a) => Math.abs(a - v) < 0.3) ?? v;
  while (rects.length > 0 && rects.length + finies.length < nPieces) {
    rects.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
    const r = rects.shift()!;
    const larg = r.x1 - r.x0;
    const prof = r.z1 - r.z0;
    if (Math.max(larg, prof) < 2.4) {
      finies.push(r);
      continue;
    }
    const ep = h.parmi([0.07, 0.1, 0.1, 0.15]);
    /*
      Deux cloisons de part et d'autre d'un refend sont ALIGNÉES ou franchement
      décalées : un architecte ne laisse pas cinq centimètres d'écart entre
      deux murs qui se font face. Une coupe à moins de 30 cm d'un axe existant
      s'y aligne.
    */
    const axesX = [0, W, ...cloisons.filter((c) => c.a.x === c.b.x).map((c) => c.a.x)];
    const axesZ = [0, H, ...cloisons.filter((c) => c.a.z === c.b.z).map((c) => c.a.z)];
    if (larg >= prof) {
      const x = aligner(r5(r.x0 + larg * h.entre(0.35, 0.65)), axesX);
      if (x <= r.x0 + 0.8 || x >= r.x1 - 0.8) {
        finies.push(r);
        continue;
      }
      rects.push({ ...r, x1: x }, { ...r, x0: x });
      cloisons.push({ a: { x, z: r.z0 }, b: { x, z: r.z1 }, ep });
    } else {
      const z = aligner(r5(r.z0 + prof * h.entre(0.35, 0.65)), axesZ);
      if (z <= r.z0 + 0.8 || z >= r.z1 - 0.8) {
        finies.push(r);
        continue;
      }
      rects.push({ ...r, z1: z }, { ...r, z0: z });
      cloisons.push({ a: { x: r.x0, z }, b: { x: r.x1, z }, ep });
    }
  }
  rects.push(...finies);
  const ext = h.parmi([0.2, 0.2, 0.25, 0.3]);
  const murs = [
    { a: { x: 0, z: 0 }, b: { x: W, z: 0 }, ep: ext },
    { a: { x: W, z: 0 }, b: { x: W, z: H }, ep: ext },
    { a: { x: 0, z: H }, b: { x: W, z: H }, ep: ext },
    { a: { x: 0, z: 0 }, b: { x: 0, z: H }, ep: ext },
    ...cloisons,
  ];
  const noms = [...NOMS].sort(() => h.u() - 0.5);
  const pieces = rects.map((r, i) => ({ nom: noms[i % noms.length], r }));

  // Une porte par cloison, une fenêtre par pièce sur la façade quand elle y touche.
  const ouvertures: Verite['ouvertures'] = [];
  for (const c of cloisons) {
    const len = Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z);
    const largeur = h.parmi([0.73, 0.83, 0.83, 0.93]);
    if (len < largeur + 0.6) continue;
    const u = { x: (c.b.x - c.a.x) / len, z: (c.b.z - c.a.z) / len };
    // Une porte ne s'ouvre pas là où un mur vient s'appuyer : on garde 15 cm
    // de part et d'autre de chaque jonction.
    const jonctions = cloisons
      .filter((o) => o !== c)
      .flatMap((o) => [o.a, o.b])
      .map((p) => ({ t: (p.x - c.a.x) * u.x + (p.z - c.a.z) * u.z, ecart: Math.abs((p.x - c.a.x) * -u.z + (p.z - c.a.z) * u.x) }))
      .filter((j) => j.ecart < 1e-6 && j.t > 0 && j.t < len)
      .map((j) => j.t);
    let t = -1;
    for (let essai = 0; essai < 12 && t < 0; essai++) {
      const v = r5(h.entre(0.3 + largeur / 2, len - 0.3 - largeur / 2));
      if (jonctions.every((j) => Math.abs(j - v) > largeur / 2 + 0.15)) t = v;
    }
    if (t < 0) continue;
    ouvertures.push({
      type: h.u() < 0.15 ? 'passage' : 'porte',
      a: { x: c.a.x + u.x * (t - largeur / 2), z: c.a.z + u.z * (t - largeur / 2) },
      b: { x: c.a.x + u.x * (t + largeur / 2), z: c.a.z + u.z * (t + largeur / 2) },
      largeur,
    });
  }
  for (const p of pieces) {
    if (p.r.z0 === 0 && p.r.x1 - p.r.x0 > 2) {
      const largeur = h.parmi([1.0, 1.2, 1.4]);
      const cx = r5((p.r.x0 + p.r.x1) / 2);
      ouvertures.push({ type: 'fenetre', a: { x: cx - largeur / 2, z: 0 }, b: { x: cx + largeur / 2, z: 0 }, largeur });
    }
  }

  // L'appareillage : un point lumineux au centre, des prises au mur, l'interrupteur.
  const murals: Verite['murals'] = [];
  const plafond: Verite['plafond'] = [];
  const KINDS: FixtureKind[] = ['prise', 'prise', 'prise2', 'prise20', 'rj45', 'rjPrise', 'tv', 'inter', 'va', 'inter2', 'sortieCable', 'thermostat', 'volet', 'applique'];
  for (const p of pieces) {
    const cx = (p.r.x0 + p.r.x1) / 2;
    const cz = (p.r.z0 + p.r.z1) / 2;
    plafond.push({ kind: h.u() < 0.2 ? 'spot' : 'dcl', at: { x: r5(cx), z: r5(cz) } });
    const n = Math.floor(h.entre(1, 4));
    for (let i = 0; i < n; i++) {
      // Contre le mur ouest ou est de la pièce, à mi-hauteur de la pièce.
      const ouest = h.u() < 0.5;
      const z = r5(h.entre(p.r.z0 + 0.4, p.r.z1 - 0.4));
      murals.push({ kind: h.parmi(KINDS), at: { x: ouest ? p.r.x0 : p.r.x1, z } });
    }
  }
  const entree = pieces.find((p) => p.nom === 'Entrée' || p.nom === 'Dégagement');
  if (entree) plafond.push({ kind: 'daaf', at: { x: r5((entree.r.x0 + entree.r.x1) / 2 + 0.3), z: r5((entree.r.z0 + entree.r.z1) / 2) } });
  const eau = pieces.find((p) => p.nom === 'Salle de bain' || p.nom === 'WC');
  if (eau) plafond.push({ kind: 'vmc', at: { x: r5((eau.r.x0 + eau.r.x1) / 2 - 0.3), z: r5((eau.r.z0 + eau.r.z1) / 2) } });
  return { murs, pieces, ouvertures, murals, plafond };
}

// ------------------------------------------------------------------ la lecture simulée

/** Comment les autres nomment nos appareils. */
const LIBELLES: Record<string, { libelle: string; code?: string; nombre?: number }[]> = {
  prise: [{ libelle: 'prise 16 A' }, { libelle: 'Prise de courant' }, { libelle: 'socket' }, { libelle: 'prise 2P+T' }, { libelle: 'Power outlet' }, { libelle: 'prise', code: 'PC' }],
  prise2: [{ libelle: 'double prise' }, { libelle: 'prise', nombre: 2 }, { libelle: 'Duplex socket' }, { libelle: 'prise de courant', code: '2PC' }],
  prise20: [{ libelle: 'prise 20 A spécialisée' }, { libelle: 'PC 20A lave-linge' }, { libelle: 'prise dédiée lave-vaisselle' }, { libelle: 'prise', code: '20A' }],
  rj45: [{ libelle: 'prise RJ45' }, { libelle: 'prise réseau' }, { libelle: 'RJ45 cat 6' }, { libelle: 'data outlet' }],
  rjPrise: [{ libelle: 'RJ45 + prise' }, { libelle: 'prise RJ45 et prise de courant' }],
  tv: [{ libelle: 'prise TV' }, { libelle: 'prise télévision' }, { libelle: 'antenne TV' }],
  inter: [{ libelle: 'interrupteur simple allumage' }, { libelle: 'interrupteur', code: 'S' }, { libelle: 'switch' }, { libelle: 'Inter SA' }],
  va: [{ libelle: 'va-et-vient' }, { libelle: 'interrupteur', code: 'VV' }, { libelle: '2-way switch' }],
  inter2: [{ libelle: 'double allumage' }, { libelle: 'interrupteur double' }, { libelle: 'interrupteur', nombre: 2 }],
  sortieCable: [{ libelle: 'sortie de câble' }, { libelle: 'SC chauffe-eau' }, { libelle: 'alimentation radiateur' }],
  thermostat: [{ libelle: "thermostat d'ambiance" }],
  volet: [{ libelle: 'commande volet roulant' }, { libelle: 'interrupteur', code: 'VR' }],
  applique: [{ libelle: 'applique murale' }, { libelle: 'wall light' }, { libelle: 'éclairage mural' }],
  dcl: [{ libelle: 'point lumineux DCL' }, { libelle: 'DCL' }, { libelle: "point d'éclairage" }, { libelle: 'luminaire', code: 'PL' }, { libelle: 'ceiling light' }],
  spot: [{ libelle: 'spot encastré' }, { libelle: 'downlight' }, { libelle: 'spot LED' }],
  daaf: [{ libelle: 'détecteur de fumée' }, { libelle: 'DAAF' }, { libelle: 'smoke detector' }],
  vmc: [{ libelle: 'bouche VMC' }, { libelle: "bouche d'extraction" }, { libelle: 'extraction', code: 'VMC' }],
};

interface Options {
  /** Écart type des positions lues, en millièmes de l'image. */
  bruit: number;
  /** Part des cotes mal lues (un chiffre faux). */
  malLues: number;
  /** Part des cotes dont l'IA a mal compris l'unité. */
  uniteFausse: number;
}

/** Ce qu'une vision rendrait de ce plan, photographié. */
function lirePourDeVrai(v: Verite, h: ReturnType<typeof hasard>, o: Options) {
  const k = h.entre(40, 110); // pixels par mètre
  const marge = 80;
  const W = Math.max(...v.murs.flatMap((m) => [m.a.x, m.b.x]));
  const H = Math.max(...v.murs.flatMap((m) => [m.a.z, m.b.z]));
  const quart = h.u() < 0.2;
  const largeurImg = Math.round((quart ? H : W) * k + 2 * marge + 160);
  const hauteurImg = Math.round((quart ? W : H) * k + 2 * marge + 160);
  const travers = (h.entre(-2.5, 2.5) * Math.PI) / 180;
  const cx = largeurImg / 2;
  const cy = hauteurImg / 2;
  /** Un point du plan → millièmes de l'image, bruités. */
  const vers = (p: { x: number; z: number }, bruite = true): PointLu => {
    // Un quart de tour : le plan se lit la feuille tournée.
    const q = quart ? { x: H - p.z, z: p.x } : p;
    const x0 = q.x * k + marge + 80;
    const y0 = q.z * k + marge + 80;
    const x = cx + (x0 - cx) * Math.cos(travers) - (y0 - cy) * Math.sin(travers);
    const y = cy + (x0 - cx) * Math.sin(travers) + (y0 - cy) * Math.cos(travers);
    const b = bruite ? o.bruit : 0;
    return [(x / largeurImg) * 1000 + h.gauss() * b, (y / hauteurImg) * 1000 + h.gauss() * b];
  };
  const epEnMillieme = (ep: number) => (ep * k) / largeurImg * 1000;

  // LES MURS : leur axe — et une fois sur dix, leurs deux nus.
  const deuxNus = h.u() < 0.1;
  const murs: number[][] = [];
  for (const m of v.murs) {
    if (deuxNus && h.u() < 0.5) {
      const hor = m.a.z === m.b.z;
      for (const s of [-1, 1]) {
        const d = (s * m.ep) / 2;
        const a = hor ? { x: m.a.x, z: m.a.z + d } : { x: m.a.x + d, z: m.a.z };
        const b = hor ? { x: m.b.x, z: m.b.z + d } : { x: m.b.x + d, z: m.b.z };
        murs.push([...vers(a), ...vers(b)]);
      }
    } else {
      murs.push([...vers(m.a), ...vers(m.b), epEnMillieme(m.ep) * h.entre(0.8, 1.25)]);
    }
  }

  // LES COTES : une chaîne hors tout et intérieure par façade, les pièces en dedans.
  const cotes: NonNullable<LectureBrute['cotes']> = [];
  const ecrire = (metres: number) => {
    const style = h.parmi(['m', 'm', 'mu', 'cm', 'cm', 'mm']);
    const cm = Math.round(metres * 100);
    if (style === 'cm') return { texte: String(cm), ia: h.u() < o.uniteFausse ? cm : cm / 100 };
    if (style === 'mm') return { texte: String(cm * 10), ia: h.u() < o.uniteFausse ? cm * 10 : cm / 100 };
    const t = (cm / 100).toFixed(2).replace('.', ',');
    return { texte: style === 'mu' ? `${t} m` : t, ia: cm / 100 };
  };
  const poser = (metres: number, a: { x: number; z: number }, b: { x: number; z: number }, ref: ReferenceDeCote) => {
    let vraie = metres;
    if (h.u() < o.malLues) vraie = Math.max(0.3, metres + h.parmi([-0.5, 0.4, 1, -1.2]));
    const e = ecrire(vraie);
    cotes.push({
      texte: e.texte,
      ...(h.u() < 0.9 ? { metres: e.ia } : {}),
      a: vers(a),
      b: vers(b),
      reference: h.u() < 0.8 ? ref : 'inconnu',
    });
  };
  const ext = v.murs[0].ep / 2;
  // Hors tout, au-dessus et à gauche du logement.
  poser(W + 2 * ext, { x: -ext, z: -0.9 }, { x: W + ext, z: -0.9 }, 'exterieur');
  poser(H + 2 * ext, { x: -0.9, z: -ext }, { x: -0.9, z: H + ext }, 'exterieur');
  // Chaque pièce, nu à nu, en dedans.
  for (const p of v.pieces) {
    const epDe = (x: number, hor: boolean) =>
      v.murs.find((m) => (hor ? m.a.x === m.b.x && Math.abs(m.a.x - x) < 1e-6 : m.a.z === m.b.z && Math.abs(m.a.z - x) < 1e-6))?.ep ?? 0.1;
    const t0 = epDe(p.r.x0, true) / 2;
    const t1 = epDe(p.r.x1, true) / 2;
    const zc = p.r.z0 + (p.r.z1 - p.r.z0) * 0.3;
    if (h.u() < 0.9) poser(p.r.x1 - p.r.x0 - t0 - t1, { x: p.r.x0 + t0, z: zc }, { x: p.r.x1 - t1, z: zc }, 'interieur');
    const s0 = epDe(p.r.z0, false) / 2;
    const s1 = epDe(p.r.z1, false) / 2;
    const xc = p.r.x0 + (p.r.x1 - p.r.x0) * 0.3;
    if (h.u() < 0.9) poser(p.r.z1 - p.r.z0 - s0 - s1, { x: xc, z: p.r.z0 + s0 }, { x: xc, z: p.r.z1 - s1 }, 'interieur');
  }
  // Une chaîne entre axes sur la façade nord, une sur la façade ouest — comme
  // l'architecte cote les deux sens : tous les murs qui y arrivent.
  const xs = [...new Set(v.murs.filter((m) => m.a.x === m.b.x && Math.min(m.a.z, m.b.z) === 0).map((m) => m.a.x))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) poser(xs[i + 1] - xs[i], { x: xs[i], z: -0.5 }, { x: xs[i + 1], z: -0.5 }, 'axes');
  const zs = [...new Set(v.murs.filter((m) => m.a.z === m.b.z && Math.min(m.a.x, m.b.x) === 0).map((m) => m.a.z))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < zs.length; i++) poser(zs[i + 1] - zs[i], { x: -0.5, z: zs[i] }, { x: -0.5, z: zs[i + 1] }, 'axes');

  // LES OUVERTURES.
  const ouvertures: NonNullable<LectureBrute['ouvertures']> = v.ouvertures.map((ov) => ({
    type:
      ov.type === 'porte'
        ? h.parmi(['porte', 'Porte battante', 'porte intérieure', 'door'])
        : ov.type === 'fenetre'
          ? h.parmi(['fenêtre', 'Fenêtre 2 vantaux', 'window'])
          : h.parmi(['passage', 'baie libre']),
    a: vers(ov.a),
    b: vers(ov.b),
    ...(ov.type === 'porte' && h.u() < 0.5 ? { largeur: ecrire(ov.largeur).texte } : {}),
  }));

  // LES PIÈCES, leur nom au centre — parfois en capitales, parfois avec leur surface.
  const pieces: NonNullable<LectureBrute['pieces']> = v.pieces.map((p) => ({
    nom: h.u() < 0.3 ? p.nom.toUpperCase() : p.nom,
    point: vers({ x: (p.r.x0 + p.r.x1) / 2, z: (p.r.z0 + p.r.z1) / 2 + 0.3 }),
  }));

  // LES SYMBOLES, dessinés à vingt-cinq centimètres de leur mur.
  const symboles: NonNullable<LectureBrute['symboles']> = [];
  for (const m of v.murals) {
    const piece = v.pieces.find((p) => m.at.z > p.r.z0 && m.at.z < p.r.z1 && (Math.abs(m.at.x - p.r.x0) < 1e-6 || Math.abs(m.at.x - p.r.x1) < 1e-6))!;
    const dedans = Math.abs(m.at.x - piece.r.x0) < 1e-6 ? 0.25 : -0.25;
    const l = h.parmi(LIBELLES[m.kind]);
    symboles.push({ ...l, point: vers({ x: m.at.x + dedans, z: m.at.z }), ...(h.u() < 0.3 ? { plafond: false } : {}) });
  }
  for (const c of v.plafond) {
    const l = h.parmi(LIBELLES[c.kind]);
    // Un plan ne dit pas toujours « au plafond » : la table le sait.
    symboles.push({ ...l, point: vers(c.at), ...(h.u() < 0.6 ? { plafond: true } : {}) });
  }
  const brut: LectureBrute = { est_un_plan: true, murs, ouvertures, cotes, pieces, symboles };
  return { brut, image: { largeur: largeurImg, hauteur: hauteurImg }, quart };
}

// ------------------------------------------------------------------ le juge

/** La distance d'un point à un segment. */
const auSegment = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
};

/** Le plan reconstruit, ramené au repère de la vérité (le quart de tour défait). */
function juger(v: Verite, walls: WallSeg[], quart: boolean) {
  const W = Math.max(...v.murs.flatMap((m) => [m.a.x, m.b.x]));
  // Le quart de tour : x lu = H − z vrai, z lu = x vrai → x vrai = z lu, z vrai = H − x lu.
  const Hr = Math.max(...walls.flatMap((w) => [w.a.x, w.b.x]));
  const ramene = (p: { x: number; z: number }) => (quart ? { x: p.z, z: Hr - p.x } : p);
  const lus = walls.map((w) => ({ a: ramene(w.a), b: ramene(w.b) }));
  let pire = 0;
  // Chaque point d'un mur vrai doit tomber sur un mur lu…
  for (const m of v.murs) {
    const L = Math.hypot(m.b.x - m.a.x, m.b.z - m.a.z);
    for (let t = 0; t <= L; t += 0.1) {
      const p = { x: m.a.x + ((m.b.x - m.a.x) * t) / L, z: m.a.z + ((m.b.z - m.a.z) * t) / L };
      pire = Math.max(pire, Math.min(...lus.map((w) => auSegment(p, w.a, w.b))));
    }
  }
  // … et chaque mur lu sur un mur vrai.
  for (const w of lus) {
    const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    for (let t = 0; t <= L; t += 0.1) {
      const p = { x: w.a.x + ((w.b.x - w.a.x) * t) / (L || 1), z: w.a.z + ((w.b.z - w.a.z) * t) / (L || 1) };
      pire = Math.max(pire, Math.min(...v.murs.map((m) => auSegment(p, m.a, m.b))));
    }
  }
  void W;
  return pire;
}

// ------------------------------------------------------------------ les cotes

describe('lire une cote comme sur le chantier', () => {
  it('toutes les écritures', () => {
    expect(lireCote('3,20')).toEqual({ valeur: 3.2, unite: null, decimal: true });
    expect(lireCote('3.20 m')).toEqual({ valeur: 3.2, unite: 'm', decimal: true });
    expect(lireCote('320 cm')).toEqual({ valeur: 320, unite: 'cm', decimal: false });
    expect(lireCote('3200mm')).toEqual({ valeur: 3200, unite: 'mm', decimal: false });
    expect(lireCote('3m20')!.valeur).toBeCloseTo(3.2);
    expect(lireCote('3 m 5')!.valeur).toBeCloseTo(3.5);
    expect(lireCote('≈ 2,40')!.valeur).toBeCloseTo(2.4);
    expect(lireCote('porte')).toBeNull();
  });

  it('sans unité, les lectures possibles — l’échelle tranchera', () => {
    expect(metresCandidats('320')).toEqual([3.2, 0.32, 320 > 80 ? undefined : 320].filter((v) => v !== undefined));
    expect(metresCandidats('3,20')[0]).toBeCloseTo(3.2);
    expect(metresCandidats('3200')[0]).toBeCloseTo(32);
    expect(metresCandidats('3200')).toContain(3.2);
    expect(metresCandidats('320 cm')).toEqual([3.2]);
  });
});

// ------------------------------------------------------------------ les symboles

describe('les symboles des autres, convertis aux nôtres', () => {
  const vers = (libelle: string, code?: string, nombre?: number, plafond?: boolean) => {
    const c = convertirSymbole(libelle, code, nombre, plafond);
    return c === null ? null : 'mur' in c ? c.mur : `plafond:${c.plafond}`;
  };

  it('chaque façon de nommer chaque appareil', () => {
    for (const [kind, liste] of Object.entries(LIBELLES)) {
      const attendu = ['dcl', 'spot', 'daaf', 'vmc'].includes(kind) ? `plafond:${kind}` : kind;
      for (const l of liste) {
        expect({ l, vers: vers(l.libelle, l.code, l.nombre) }).toEqual({ l, vers: attendu });
      }
    }
  });

  it('les cas qui piègent', () => {
    expect(vers('interrupteur', 'VV')).toBe('va');
    expect(vers('prise', '20A')).toBe('prise20');
    expect(vers('prise', undefined, 3)).toBe('prise3');
    expect(vers('prise RJ45', undefined, 2)).toBe('rj2');
    expect(vers('prise TV et prise de courant')).toBe('tvPrise');
    expect(vers('applique', undefined, undefined, true)).toBe('plafond:applique');
    expect(vers('applique')).toBe('applique');
    expect(vers('tableau électrique')).toBe('tableau');
    expect(vers('TGBT')).toBe('tableau');
    expect(vers('bouton poussoir')).toBe('poussoir');
    expect(vers('variateur')).toBe('variateur');
    expect(vers('plaque de cuisson 32A')).toBe('prise32');
    expect(vers('spot', undefined, undefined, false)).toBe('plafond:spot');
    expect(vers('arbre')).toBeNull();
  });
});

// ------------------------------------------------------------------ la trame

describe('les moindres carrés de la trame', () => {
  it('trois axes, deux cotes : la mesure se plie aux cotes', () => {
    const x = placerLesAxes([0.02, 3.18, 5.07], [
      { i: 0, j: 1, d: 3.2 },
      { i: 1, j: 2, d: 1.9 },
    ]);
    expect(x[1] - x[0]).toBeCloseTo(3.2, 4);
    expect(x[2] - x[1]).toBeCloseTo(1.9, 4);
  });
});

// ------------------------------------------------------------------ le banc

describe('le banc : des centaines de plans, lus et reconstruits', () => {
  const banc = (n: number, graine0: number, o: Options) => {
    const echecs: string[] = [];
    let justes = 0;
    let erreurMax = 0;
    let erreurs = 0;
    /** Ce que vaut l'annonce « bonne » : justes à 3 cm près, ou non. */
    const bonne = { juste: 0, fausse: 0 };
    for (let g = 0; g < n; g++) {
      const h = hasard(graine0 + g);
      const v = genererVerite(h);
      const { brut, image, quart } = lirePourDeVrai(v, h, o);
      const r = reconstruirePlan(brut, image);
      if (!r.ok) {
        echecs.push(`#${graine0 + g} : ${r.raison}`);
        continue;
      }
      const p = r.plan;
      const ecart = juger(v, p.walls, quart);
      if (p.rapport.confiance === 'bonne') bonne[ecart <= 0.03 ? 'juste' : 'fausse'] += 1;
      erreurMax = Math.max(erreurMax, ecart);
      erreurs += ecart;
      const nomsLus = p.rooms.map((x) => x.name).sort();
      const nomsVrais = v.pieces.map((x) => x.nom).sort();
      const muraux = p.fixtures.map((f) => f.kind).sort();
      const murauxVrais = v.murals.map((f) => f.kind).sort();
      const plafond = p.ceiling.map((c) => c.kind).sort();
      const plafondVrai = v.plafond.map((c) => c.kind).sort();
      const fautes = [
        ecart > 0.02 ? `murs à ${Math.round(ecart * 1000)} mm` : '',
        JSON.stringify(nomsLus) !== JSON.stringify(nomsVrais) ? `pièces ${JSON.stringify(nomsLus)}` : '',
        JSON.stringify(muraux) !== JSON.stringify(murauxVrais) ? `appareils ${JSON.stringify(muraux)} ≠ ${JSON.stringify(murauxVrais)}` : '',
        JSON.stringify(plafond) !== JSON.stringify(plafondVrai) ? `plafond ${JSON.stringify(plafond)}` : '',
        p.openings.length !== v.ouvertures.length ? `ouvertures ${p.openings.length}/${v.ouvertures.length}` : '',
      ].filter(Boolean);
      if (fautes.length === 0) justes += 1;
      else echecs.push(`#${graine0 + g} : ${fautes.join(' ; ')}`);
    }
    return { justes, echecs, erreurMax, erreurMoy: erreurs / n, bonne };
  };

  it('300 plans, lecture propre : au moins 95 % reconstruits à 2 cm près', () => {
    const r = banc(300, 1000, { bruit: 2, malLues: 0, uniteFausse: 0.1 });
    if (r.justes < 285) console.log(r.echecs.slice(0, 15).join('\n'));
    expect(r.justes).toBeGreaterThanOrEqual(285);
    // « Bonne » se mérite : juste à 3 cm près, 98 fois sur 100 au moins.
    expect(r.bonne.juste / Math.max(1, r.bonne.juste + r.bonne.fausse)).toBeGreaterThanOrEqual(0.98);
  });

  it('300 plans, lecture bruitée et cotes mal lues : au moins 90 %', () => {
    const r = banc(300, 5000, { bruit: 4, malLues: 0.04, uniteFausse: 0.15 });
    if (r.justes < 270) console.log(r.echecs.slice(0, 15).join('\n'));
    expect(r.justes).toBeGreaterThanOrEqual(270);
    // Même ici, ce qui est annoncé « bonne » l'est — et l'annonce n'est pas rare.
    expect(r.bonne.juste / Math.max(1, r.bonne.juste + r.bonne.fausse)).toBeGreaterThanOrEqual(0.98);
    expect(r.bonne.juste).toBeGreaterThan(100);
  });

  it('une cote mal lue est écartée, et le rapport le dit', () => {
    const h = hasard(42);
    const v = genererVerite(h);
    const { brut, image } = lirePourDeVrai(v, h, { bruit: 1, malLues: 0, uniteFausse: 0 });
    // On fausse la cote hors tout : 1 m de trop.
    const c = brut.cotes![0];
    const faux = { ...c, texte: String((Number(c.texte.replace(',', '.').replace(/[^\d.]/g, '')) || 0) + 100), metres: undefined };
    const r = reconstruirePlan({ ...brut, cotes: [faux, ...brut.cotes!.slice(1)] }, image);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.rapport.cotes.ecartees.length).toBeGreaterThan(0);
  });

  it('ce qui n’est pas un plan le dit, sans rien inventer', () => {
    expect(reconstruirePlan({ est_un_plan: false, raison: 'Une photo de chat.' }, { largeur: 100, hauteur: 100 })).toEqual({
      ok: false,
      raison: 'Une photo de chat.',
    });
    const r = reconstruirePlan({ est_un_plan: true, murs: [[0, 0, 100, 0, 5]] }, { largeur: 1000, hauteur: 1000 });
    expect(r.ok).toBe(false);
  });
});
