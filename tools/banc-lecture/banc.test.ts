/**
 * LA NOTE D'UNE LECTURE DE PLAN — outil du banc d'essai, pas une épreuve de
 * la suite : sans BANC, elle ne fait rien.
 *
 *   BANC=<dossier> npx jest tools/banc-lecture/banc --modulePathIgnorePatterns='<rootDir>/.claude'
 *
 * Chaque sous-dossier porte `verite.json` (voir tools/banc-lecture/gen.py, ou
 * pour un vrai plan : `pieces` seules, nom et surface écrite) et une ou
 * plusieurs lectures `lecture*.json` (ce que l'outil `plan_lu` rendrait). La
 * lecture passe par `reconstruirePlan`, et le plan obtenu se compare à la
 * vérité : murs, ouvertures, pièces, échelle. Les notes s'écrivent dans
 * `<dossier>/notes.json`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { reconstruirePlan, type LectureBrute } from '../../src/geometry/lecturePlan';
import { roomParts, type WallSeg } from '../../src/geometry/floorplan';

type P2 = [number, number];
interface Verite {
  image: { largeur: number; hauteur: number };
  murs?: { a: P2; b: P2; ep: number; exterieur: boolean }[];
  ouvertures?: { type: string; a: P2; b: P2; largeur: number }[];
  pieces: { nom: string; genre?: string; interieur?: [number, number, number, number]; surface: number }[];
  /** Vrai plan : la longueur hors tout attendue (m), si connue. */
  horsTout?: [number, number];
}

const plat = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const classeVerite = (t: string) =>
  t === 'fenetre' || t === 'porte_fenetre' ? 'window' : t === 'passage' ? 'opening' : 'door';

interface Seg {
  o: 'h' | 'v' | 'o';
  p: number;
  lo: number;
  hi: number;
}
const enSeg = (a: P2, b: P2): Seg => {
  const dx = Math.abs(b[0] - a[0]);
  const dz = Math.abs(b[1] - a[1]);
  if (dz < 0.02 + dx * 0.02) return { o: 'h', p: (a[1] + b[1]) / 2, lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) };
  if (dx < 0.02 + dz * 0.02) return { o: 'v', p: (a[0] + b[0]) / 2, lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) };
  return { o: 'o', p: 0, lo: 0, hi: Math.hypot(dx, dz) };
};

/** La part (en longueur) de `de` que couvre `par`, à `tol` près en travers. */
function couverture(de: Seg[], par: Seg[], tol: number): number {
  let tot = 0;
  let ok = 0;
  for (const s of de) {
    if (s.o === 'o') {
      tot += s.hi;
      continue;
    }
    for (let t = s.lo + 0.025; t < s.hi; t += 0.05) {
      tot += 0.05;
      if (par.some((q) => q.o === s.o && Math.abs(q.p - s.p) <= tol && t >= q.lo - 0.06 && t <= q.hi + 0.06)) ok += 0.05;
    }
  }
  return tot > 0 ? ok / tot : 1;
}

/** Le décalage qui pose au mieux les murs lus sur les vrais. */
function caler(vrais: Seg[], lus: Seg[]): { dx: number; dz: number } {
  const meilleur = (o: 'h' | 'v') => {
    const V = vrais.filter((s) => s.o === o);
    const L = lus.filter((s) => s.o === o);
    let mieux = 0;
    let score = -1;
    const cands = V.flatMap((v) => L.map((l) => v.p - l.p));
    for (const d of cands) {
      let s = 0;
      for (const l of L) {
        for (const v of V) {
          if (Math.abs(v.p - (l.p + d)) < 0.1) s += Math.max(0, Math.min(v.hi, l.hi) - Math.max(v.lo, l.lo)) + 0.2;
        }
      }
      if (s > score) {
        score = s;
        mieux = d;
      }
    }
    return mieux;
  };
  // Deux passes : le décalage en x dépend de l'alignement des longueurs en z.
  const dx0 = meilleur('v');
  const dz0 = meilleur('h');
  return { dx: dx0, dz: dz0 };
}

let dessin: unknown = null;
function noter(v: Verite, lu: LectureBrute) {
  const r = reconstruirePlan(lu, v.image);
  if (!r.ok) return { ok: false, raison: r.raison, note: 0 };
  // Comme `ouvrirPlanLu` : les murs d'un plan papier se comptent au nu.
  const plan = { ...r.plan, walls: r.plan.walls.map((w) => ({ ...w, auNu: true })) };
  const parts = roomParts(plan.walls, plan.rooms).filter((p) => p.surface);
  const nomDe = (id: string) => plan.rooms.find((x) => x.id === id)?.name ?? '';
  const piecesLues = parts.map((p) => ({ nom: nomDe(p.roomId), aire: p.surface!.area, c: p.centroid }));
  dessin = {
    walls: plan.walls.map((w) => [w.a.x, w.a.z, w.b.x, w.b.z, w.epaisseur ?? 0.1]),
    openings: plan.openings.map((o) => [o.a.x, o.a.z, o.b.x, o.b.z, o.type]),
    rooms: parts.map((p) => ({ nom: nomDe(p.roomId), aire: p.surface!.area, pts: (p.surface!.nu ?? p.surface!.pts).map((q) => [q.x, q.z]) })),
  };

  // Les pièces : un nom retrouvé, une surface juste (8 %).
  const used = new Set<number>();
  let piecesOk = 0;
  let piecesNommees = 0;
  const detailPieces: string[] = [];
  for (const g of v.pieces) {
    let k = -1;
    let ecart = Infinity;
    piecesLues.forEach((p, i) => {
      if (used.has(i)) return;
      const e = Math.abs(p.aire - g.surface) / g.surface;
      const memeNom = plat(p.nom) === plat(g.nom);
      const score = e - (memeNom ? 0.5 : 0);
      if (score < ecart) {
        ecart = score;
        k = i;
      }
    });
    if (k >= 0) {
      const p = piecesLues[k];
      const e = Math.abs(p.aire - g.surface) / g.surface;
      if (e <= 0.08) {
        used.add(k);
        piecesOk += 1;
        if (plat(p.nom) === plat(g.nom)) piecesNommees += 1;
        else detailPieces.push(`${g.nom} ${g.surface.toFixed(2)} ≈ « ${p.nom} » ${p.aire.toFixed(2)}`);
      } else {
        detailPieces.push(`${g.nom} ${g.surface.toFixed(2)} manquée (au mieux ${p.aire.toFixed(2)} « ${p.nom} »)`);
      }
    } else detailPieces.push(`${g.nom} manquée`);
  }
  const res: Record<string, unknown> = {
    ok: true,
    confiance: plan.rapport.confiance,
    pieces: { vraies: v.pieces.length, lues: piecesLues.length, justes: piecesOk, nommees: piecesNommees, detail: detailPieces },
    murs_lus: plan.walls.length,
    ouvertures_lues: plan.openings.length,
    cotes: plan.rapport.cotes.lues,
    cotes_retenues: plan.rapport.cotes.retenues,
    cotes_ecartees: plan.rapport.cotes.ecartees.map((e) => `${e.texte} : ${e.raison}`),
    rapport_murs: { ...plan.rapport.murs, aVerifier: plan.rapport.murs.aVerifier.length },
    echelle_depuis: plan.rapport.echelleDepuis,
  };
  const recallPieces = v.pieces.length ? piecesOk / v.pieces.length : 0;
  const precisionPieces = piecesLues.length ? piecesOk / piecesLues.length : 0;

  if (!v.murs) {
    // UN VRAI PLAN : la part des pièces dont la surface écrite est retrouvée
    // (placards, escalier, linge, sans surface écrite, ne comptent pas contre).
    const note = recallPieces;
    return { ...res, note: Math.round(note * 1000) / 10 };
  }

  // Les murs : vrais et lus, calés l'un sur l'autre.
  const vrais = v.murs.map((m) => enSeg(m.a, m.b));
  const lusBruts = plan.walls.map((w: WallSeg) => enSeg([w.a.x, w.a.z], [w.b.x, w.b.z]));
  const { dx, dz } = caler(vrais, lusBruts);
  const lus = lusBruts.map((s) =>
    s.o === 'h' ? { ...s, p: s.p + dz, lo: s.lo + dx, hi: s.hi + dx } : s.o === 'v' ? { ...s, p: s.p + dx, lo: s.lo + dz, hi: s.hi + dz } : s,
  );
  const rappelMurs = couverture(vrais, lus, 0.12);
  const precisionMurs = couverture(lus, vrais, 0.12);
  const interieurs = v.murs.filter((m) => !m.exterieur).map((m) => enSeg(m.a, m.b));
  const rappelCloisons = couverture(interieurs, lus, 0.12);
  const rappelMurs5 = couverture(vrais, lus, 0.05);

  // Les ouvertures.
  const vo = (v.ouvertures ?? []).map((o) => ({
    k: classeVerite(o.type),
    c: [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2] as P2,
    l: o.largeur,
  }));
  const lo = plan.openings.map((o) => ({
    k: o.type,
    c: [(o.a.x + o.b.x) / 2 + dx, (o.a.z + o.b.z) / 2 + dz] as P2,
    l: Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z),
  }));
  const pris = new Set<number>();
  let baiesOk = 0;
  let baiesType = 0;
  let ecartLargeur = 0;
  for (const g of vo) {
    let k = -1;
    let d = 0.4;
    lo.forEach((o, i) => {
      if (pris.has(i)) return;
      const e = Math.hypot(o.c[0] - g.c[0], o.c[1] - g.c[1]);
      if (e < d) {
        d = e;
        k = i;
      }
    });
    if (k >= 0) {
      pris.add(k);
      baiesOk += 1;
      if (lo[k].k === g.k) baiesType += 1;
      ecartLargeur += Math.abs(lo[k].l - g.l);
    }
  }
  const rappelBaies = vo.length ? baiesOk / vo.length : 1;
  const precisionBaies = lo.length ? baiesOk / lo.length : 0;
  const f1 = (a: number, b: number) => (a + b > 0 ? (2 * a * b) / (a + b) : 0);

  // L'échelle : l'emprise des murs extérieurs.
  const ext = v.murs.filter((m) => m.exterieur);
  const vx = ext.flatMap((m) => [m.a[0], m.b[0]]);
  const vz = ext.flatMap((m) => [m.a[1], m.b[1]]);
  const wx = plan.walls.flatMap((w) => [w.a.x, w.b.x]);
  const wz = plan.walls.flatMap((w) => [w.a.z, w.b.z]);
  const ecartEmprise = Math.max(
    Math.abs(Math.max(...wx) - Math.min(...wx) - (Math.max(...vx) - Math.min(...vx))),
    Math.abs(Math.max(...wz) - Math.min(...wz) - (Math.max(...vz) - Math.min(...vz))),
  );

  const note =
    0.35 * f1(rappelMurs, precisionMurs) +
    0.15 * rappelCloisons +
    0.2 * f1(rappelBaies, precisionBaies) +
    0.2 * f1(recallPieces, precisionPieces) +
    0.1 * Math.max(0, 1 - ecartEmprise / 0.3);
  return {
    ...res,
    note: Math.round(note * 1000) / 10,
    murs: {
      rappel: +rappelMurs.toFixed(3),
      precision: +precisionMurs.toFixed(3),
      cloisons: +rappelCloisons.toFixed(3),
      rappel_5cm: +rappelMurs5.toFixed(3),
    },
    baies: {
      vraies: vo.length,
      lues: lo.length,
      justes: baiesOk,
      bon_type: baiesType,
      ecart_largeur_moyen: baiesOk ? +(ecartLargeur / baiesOk).toFixed(3) : null,
    },
    ecart_emprise_m: +ecartEmprise.toFixed(3),
  };
}

const BANC = process.env.BANC;
(BANC ? describe : describe.skip)('banc de lecture', () => {
  it('note chaque lecture', () => {
    const dossiers = fs
      .readdirSync(BANC!)
      .map((d) => path.join(BANC!, d))
      .filter((d) => fs.existsSync(path.join(d, 'verite.json')));
    const toutes: Record<string, unknown> = {};
    for (const d of dossiers) {
      const v: Verite = JSON.parse(fs.readFileSync(path.join(d, 'verite.json'), 'utf8'));
      const lectures = fs.readdirSync(d).filter((f) => /^lecture[^.]*\.json$/.test(f));
      const notes: Record<string, unknown> = {};
      for (const f of lectures) {
        try {
          const lu = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
          dessin = null;
          notes[f] = noter(v, lu.input ?? lu);
          if (dessin) fs.writeFileSync(path.join(d, f.replace('.json', '.plan.json')), JSON.stringify(dessin));
        } catch (e) {
          notes[f] = { ok: false, raison: String(e), note: 0 };
        }
      }
      fs.writeFileSync(path.join(d, 'notes.json'), JSON.stringify(notes, null, 1));
      toutes[path.basename(d)] = Object.fromEntries(Object.entries(notes).map(([k, n]) => [k, (n as { note: number }).note]));
    }
    fs.writeFileSync(path.join(BANC!, 'notes.json'), JSON.stringify(toutes, null, 1));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(toutes, null, 1));
  });
});
