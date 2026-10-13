/**
 * DIAGNOSTIQUER UN PLAN — ses problèmes, ses données, et pourquoi.
 *
 * Relevé du patron : « je rencontre parfois des erreurs, comme une pièce qui
 * n'est pas fermée et ne veut pas se fermer après un scan. Fais en sorte
 * qu'on puisse diagnostiquer un plan pour lire tous les problèmes et les
 * données du plan, pour que tu puisses résoudre les problèmes que tu
 * pourrais voir. »
 *
 * Les « points à corriger » de l'édition disent QU'une pièce est ouverte ;
 * ils ne disent pas POURQUOI, et c'est le pourquoi qui se corrige. Une
 * pièce se ferme quand ses murs forment UNE boucle, chaque coin reliant
 * exactement deux murs, au millimètre (`closedLoop`). Ce qui l'en empêche
 * se lit dans les coins : un bout libre qui frôle son voisin, un morceau de
 * mur qui manque, une cloison qui bute au milieu d'un mur sans le couper, un
 * coin où trois murs se croisent, un mur cité qui n'existe plus. On les
 * nomme, avec leurs centimètres.
 *
 * Le tout part au support en deux morceaux (voir `DiagnosticPlanScreen`) :
 * un courrier qui se LIT (`rapportDuDiagnostic`) et un dossier qui se
 * REJOUE au banc (`dossierDuDiagnostic`) — toutes les données du plan, sauf
 * les coordonnées du client, qui ne regardent que l'artisan.
 */
import { checkPlan } from './diagnostics';
import { dansLeBati } from './poche';
import { ECLAT, roomParts, segLength, type Pt, type RoomShape, type WallSeg } from './floorplan';

export interface PlanADiagnostiquer {
  name?: string;
  walls: WallSeg[];
  openings: WallSeg[];
  rooms: (RoomShape & { name?: string; niveau?: number })[];
  objects: { id: string; category?: string; roomId?: string; transform?: number[] }[];
  fixtures?: unknown[];
  photos?: unknown[];
  notes?: unknown[];
  mesures?: unknown[];
}

export interface ProblemeDuPlan {
  gravite: 'alerte' | 'info';
  /** D'où vient le constat : `contour`, `confiance`, `doublon`… */
  code: string;
  titre: string;
  detail: string;
  pieceId?: string;
  murIds?: string[];
}

export interface PieceDiagnostiquee {
  id: string;
  nom: string;
  niveau: number;
  murs: number;
  /** Surface (m²) — approchée quand le contour est ouvert. */
  aire: number;
  fermee: boolean;
  /** Pourquoi elle ne se ferme pas ; vide si elle se ferme. */
  raisons: string[];
}

export interface DiagnosticDuPlan {
  resume: {
    murs: number;
    portes: number;
    fenetres: number;
    passages: number;
    pieces: number;
    piecesOuvertes: number;
    meubles: number;
    appareils: number;
    photos: number;
    notes: number;
    niveaux: number;
    /** Somme des pièces fermées (m², au dixième). */
    surface: number;
    /** Hauteur médiane des murs (m). */
    hauteur: number;
  };
  pieces: PieceDiagnostiquee[];
  problemes: ProblemeDuPlan[];
}

/** Ce que l'utilisateur peut cocher : « ce qui n'allait pas ». */
export const REMARQUES: { cle: string; libelle: string }[] = [
  { cle: 'pieceOuverte', libelle: 'Une pièce ne se ferme pas' },
  { cle: 'murs', libelle: 'Un mur manque, ou il y en a un de trop' },
  { cle: 'cotes', libelle: 'Des longueurs ou des hauteurs sont fausses' },
  { cle: 'ouvertures', libelle: 'Une porte ou une fenêtre manque, ou est mal placée' },
  { cle: 'relief', libelle: 'Un coffre de volet, une niche ou un retour n’apparaît pas' },
  { cle: 'pieces', libelle: 'Les pièces sont mal découpées ou mal nommées' },
  { cle: 'meubles', libelle: 'Un meuble est mal reconnu' },
  { cle: 'couleurs', libelle: 'Les couleurs ne ressemblent pas' },
  { cle: 'lenteur', libelle: 'L’application a ralenti ou s’est fermée' },
  { cle: 'autre', libelle: 'Autre chose' },
];

const cm = (m: number) => `${Math.round(m * 100)} cm`;
const metres = (m: number) => `${m.toFixed(2).replace('.', ',')} m`;
const cle = (p: Pt) => `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

/** Où tombe `p` sur le segment [a, b] : sa distance, et sa place (0 → 1). */
function surLeMur(p: Pt, w: WallSeg): { dist: number; t: number } {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / l2;
  const tc = Math.max(0, Math.min(1, t));
  return { dist: Math.hypot(w.a.x + dx * tc - p.x, w.a.z + dz * tc - p.z), t };
}

/**
 * POURQUOI CETTE PIÈCE NE SE FERME PAS — lu dans ses coins.
 */
export function pourquoiOuverte(
  murs: WallSeg[],
  cites: string[] | undefined,
  existants: Set<string>,
): string[] {
  const raisons: string[] = [];
  const absents = (cites ?? []).filter((id) => !existants.has(id));
  if (absents.length === 1) {
    raisons.push('Elle cite un mur qui n’existe plus (supprimé, ou fusionné avec un autre).');
  } else if (absents.length > 1) {
    raisons.push(`Elle cite ${absents.length} murs qui n’existent plus (supprimés, ou fusionnés).`);
  }
  // Un éclat de 0 cm sur un coin : la cause la plus sournoise (voir `ECLAT`).
  const eclats = murs.filter((w) => w.type === 'wall' && segLength(w) < ECLAT).length;
  if (eclats > 0) {
    raisons.push(
      `${eclats === 1 ? 'Un éclat de mur de 0 cm est posé' : `${eclats} éclats de mur de 0 cm sont posés`} sur un coin : ce coin compte trop de murs pour que la boucle se referme.`,
    );
  }
  const pleins = murs.filter((w) => w.type === 'wall' && segLength(w) >= ECLAT);
  if (pleins.length < 3) {
    raisons.push(
      `Elle n’a que ${pleins.length} mur${pleins.length > 1 ? 's' : ''} : il en faut trois au moins pour fermer une pièce.`,
    );
    return raisons;
  }

  // Les coins : combien de murs s'y retrouvent.
  const coins = new Map<string, { p: Pt; murs: WallSeg[] }>();
  for (const w of pleins) {
    for (const p of [w.a, w.b]) {
      const k = cle(p);
      const c = coins.get(k) ?? { p, murs: [] };
      c.murs.push(w);
      coins.set(k, c);
    }
  }
  const libres = [...coins.values()].filter((c) => c.murs.length === 1);

  // Une cloison qui bute au milieu d'un mur sans le couper.
  const butees = libres.filter((c) =>
    pleins.some((w) => {
      if (w === c.murs[0]) return false;
      const { dist, t } = surLeMur(c.p, w);
      return dist < 0.02 && t > 0.02 && t < 0.98;
    }),
  );
  if (butees.length === 1) {
    raisons.push(
      `Une cloison (${metres(segLength(butees[0].murs[0]))}) bute au milieu d’un mur sans le couper : pour le calcul, ce coin n’existe pas.`,
    );
  } else if (butees.length > 1) {
    raisons.push(`${butees.length} cloisons butent au milieu d’un mur sans le couper.`);
  }

  // Les autres bouts libres, appariés au plus proche.
  const restants = libres.filter((c) => !butees.includes(c));
  const paires: { a: (typeof restants)[0]; b: (typeof restants)[0]; d: number }[] = [];
  for (let i = 0; i < restants.length; i++) {
    for (let j = i + 1; j < restants.length; j++) {
      paires.push({ a: restants[i], b: restants[j], d: distance(restants[i].p, restants[j].p) });
    }
  }
  paires.sort((x, y) => x.d - y.d);
  const pris = new Set<(typeof restants)[0]>();
  for (const { a, b, d } of paires) {
    if (pris.has(a) || pris.has(b)) continue;
    pris.add(a);
    pris.add(b);
    const entre = `entre un mur de ${metres(segLength(a.murs[0]))} et un mur de ${metres(segLength(b.murs[0]))}`;
    if (d < 0.15) {
      raisons.push(`Deux murs se rejoignent presque, sans se toucher : ${cm(d)} d’écart ${entre}.`);
    } else if (d <= 2.5) {
      raisons.push(`Il manque un morceau de mur : ${cm(d)} ${entre}.`);
    } else {
      raisons.push(`Deux bouts de mur restent libres, à ${metres(d)} l’un de l’autre : il manque au moins un mur.`);
    }
  }
  for (const c of restants) {
    if (!pris.has(c)) raisons.push(`Un mur de ${metres(segLength(c.murs[0]))} s’arrête dans le vide.`);
  }

  const carrefours = [...coins.values()].filter((c) => c.murs.length >= 3).length;
  if (carrefours > 0) {
    raisons.push(
      `${carrefours === 1 ? 'Un coin réunit' : `${carrefours} coins réunissent`} trois murs ou plus : un mur de trop, ou un mur en double.`,
    );
  }
  if (raisons.length === 0) {
    raisons.push('Ses murs forment plusieurs boucles séparées, ou se croisent : la pièce n’a pas un seul contour.');
  }
  return raisons;
}

/** Le point est-il dans le contour ? Parité des croisements d'un rayon. */
function dansLeContour(p: Pt, pts: Pt[]): boolean {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) dedans = !dedans;
  }
  return dedans;
}

export function diagnostiquerPlan(plan: PlanADiagnostiquer): DiagnosticDuPlan {
  const murs = plan.walls.filter((w) => w.type === 'wall');
  const existants = new Set(plan.walls.map((w) => w.id));
  const parts = roomParts(plan.walls, plan.rooms);
  const nomDe = (id: string) => plan.rooms.find((r) => r.id === id)?.name || 'Une pièce';

  const pieces: PieceDiagnostiquee[] = plan.rooms.map((r) => {
    const part = parts.find((p) => p.roomId === r.id);
    const sesMurs = part?.walls ?? [];
    const fermee = !!part?.surface?.exact;
    return {
      id: r.id,
      nom: nomDe(r.id),
      niveau: r.niveau ?? 0,
      murs: sesMurs.filter((w) => w.type === 'wall').length,
      aire: Math.round((part?.surface?.area ?? 0) * 10) / 10,
      fermee,
      raisons: fermee ? [] : pourquoiOuverte(sesMurs, r.wallIds, existants),
    };
  });

  const problemes: ProblemeDuPlan[] = [];
  for (const p of pieces) {
    if (p.fermee) continue;
    problemes.push({
      gravite: 'alerte',
      code: 'contour',
      titre: `${p.nom} ne se ferme pas`,
      detail: p.raisons.join(' '),
      pieceId: p.id,
    });
  }

  // Les points à corriger de l'édition, niveau par niveau (un étage ne se
  // compare pas au rez-de-chaussée). Le contour est déjà dit, et mieux.
  const niveaux = [...new Set([...plan.walls.map((w) => w.niveau ?? 0), ...plan.rooms.map((r) => r.niveau ?? 0)])];
  for (const n of niveaux) {
    const auNiveau = <T extends { niveau?: number }>(xs: T[]) => xs.filter((x) => (x.niveau ?? 0) === n);
    for (const i of checkPlan(auNiveau(plan.walls), auNiveau(plan.rooms), auNiveau(plan.openings))) {
      if (i.kind === 'contour') continue;
      problemes.push({
        gravite: i.severity,
        code: i.kind,
        titre: i.message,
        detail: i.hint,
        ...(i.roomId ? { pieceId: i.roomId } : {}),
        ...(i.wallId ? { murIds: [i.wallId] } : {}),
      });
    }
  }

  // Une menuiserie posée sur aucun mur : elle flotte dans le plan.
  for (const o of plan.openings) {
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    const proche = Math.min(Infinity, ...murs.map((w) => surLeMur(m, w).dist));
    if (proche > 0.35) {
      const quoi = o.type === 'window' ? 'Une fenêtre' : o.type === 'door' ? 'Une porte' : 'Un passage';
      problemes.push({
        gravite: 'info',
        code: 'ouvertureFlottante',
        titre: `${quoi} n’est posée sur aucun mur`,
        detail: `Le mur le plus proche est à ${cm(proche)}.`,
        murIds: [o.id],
      });
    }
  }

  // Une pièce qui cite des murs disparus — même fermée, ses données sont fausses.
  for (const r of plan.rooms) {
    const absents = (r.wallIds ?? []).filter((w) => !existants.has(w));
    if (absents.length === 0) continue;
    problemes.push({
      gravite: 'info',
      code: 'murDisparu',
      titre: `${nomDe(r.id)} cite ${absents.length === 1 ? 'un mur qui n’existe plus' : `${absents.length} murs qui n’existent plus`}`,
      detail: 'Un mur supprimé ou fusionné est resté dans sa liste : la pièce peut mal se recalculer.',
      pieceId: r.id,
      murIds: absents,
    });
  }

  /*
    DES MURS QUI NE BORDENT AUCUNE PIÈCE — revues « Gérard », « Hélène » et
    « Bérénice » : quand un coin du scan ne se refermait pas, une pièce
    entière disparaissait (le séjour de 74 m², la cuisine, le garage) et le
    diagnostic se taisait — « 0 pièce ouverte ». Ses murs, eux, restent :
    des murs pleins, de hauteur de pièce, que plus aucune pièce ne réclame.
    Un garde-corps ou un muret (moins de 1,30 m) n'en est pas un.
  */
  const reclames = new Set(parts.flatMap((p) => p.walls.map((w) => w.id)));
  const orphelins = murs.filter((w) => !reclames.has(w.id) && segLength(w) >= 1 && w.height >= 1.3);
  if (orphelins.length > 0) {
    const longueur = orphelins.reduce((s, w) => s + segLength(w), 0);
    problemes.push({
      gravite: longueur >= 3 ? 'alerte' : 'info',
      code: 'murOrphelin',
      titre:
        orphelins.length === 1
          ? 'Un mur ne borde aucune pièce'
          : `${orphelins.length} murs ne bordent aucune pièce`,
      detail: `${longueur.toFixed(1).replace('.', ',')} m de murs que plus aucune pièce ne réclame : une pièce n’a sans doute pas été trouvée. « Redétecter les pièces », ou fermez le coin resté ouvert.`,
      murIds: orphelins.map((w) => w.id),
    });
  }

  /*
    UNE PORTE QUI DONNE SUR UNE PIÈCE NON RELEVÉE — revue « Amandine » : la
    salle d'eau vue seulement depuis sa porte n'était pas relevée (c'est
    voulu), mais seul un bandeau, le temps d'une seconde, le disait. Le
    diagnostic le garde : une porte dont un côté est une pièce et l'autre ni
    une pièce ni le dehors mène à une pièce qui manque au plan.
  */
  const contoursPieces = parts.map((p) => p.surface?.pts ?? []).filter((c) => c.length >= 3);
  const dansUnePiece = (q: Pt) => contoursPieces.some((c) => dansLeContour(q, c));
  for (const o of plan.openings) {
    if (o.type !== 'door' && o.type !== 'opening') continue;
    const L = segLength(o);
    if (L < 0.4) continue;
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    const n = { x: -(o.b.z - o.a.z) / L, z: (o.b.x - o.a.x) / L };
    const cote = (s: number) => ({ x: m.x + n.x * s * 0.45, z: m.z + n.z * s * 0.45 });
    const [p1, p2] = [cote(1), cote(-1)];
    const ici = dansUnePiece(p1);
    const la = dansUnePiece(p2);
    if (ici === la) continue;
    const derriere = ici ? p2 : p1;
    // Derrière, l'intérieur du bâti — ou ce que le scan n'a vu que par elle.
    if (!o.versNonReleve && !dansLeBati(murs, derriere)) continue;
    problemes.push({
      gravite: 'info',
      code: 'pieceNonRelevee',
      titre: 'Une porte mène à une pièce non relevée',
      detail: 'Entrez-y pour la scanner (« Scanner une pièce »), ou dessinez-la (« Ajouter une pièce »).',
      murIds: [o.id],
    });
  }

  // Une pièce sans aucun mur.
  for (const p of pieces) {
    if (p.murs === 0) {
      problemes.push({
        gravite: 'alerte',
        code: 'pieceVide',
        titre: `${p.nom} n’a aucun mur`,
        detail: 'Elle existe dans la liste des pièces, mais aucun mur ne la borde.',
        pieceId: p.id,
      });
    }
  }

  problemes.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === 'alerte' ? -1 : 1));

  const hauteurs = murs.map((w) => w.height).sort((a, b) => a - b);
  return {
    resume: {
      murs: murs.length,
      portes: plan.openings.filter((o) => o.type === 'door').length,
      fenetres: plan.openings.filter((o) => o.type === 'window').length,
      passages: plan.openings.filter((o) => o.type === 'opening').length,
      pieces: pieces.length,
      piecesOuvertes: pieces.filter((p) => !p.fermee).length,
      meubles: plan.objects.length,
      appareils: plan.fixtures?.length ?? 0,
      photos: plan.photos?.length ?? 0,
      notes: plan.notes?.length ?? 0,
      niveaux: niveaux.length,
      surface: Math.round(pieces.filter((p) => p.fermee).reduce((s, p) => s + p.aire, 0) * 10) / 10,
      hauteur: hauteurs.length ? Math.round(hauteurs[Math.floor(hauteurs.length / 2)] * 100) / 100 : 0,
    },
    pieces,
    problemes,
  };
}

/** Qui envoie : la version de l'application et le téléphone. */
export interface ContexteDuDiagnostic {
  version?: string;
  appareil?: string;
  systeme?: string;
}

const m2 = (v: number) => `${v.toFixed(1).replace('.', ',')} m²`;

/** Le courrier : ce qui se lit d'un coup d'œil, avant d'ouvrir le dossier. */
export function rapportDuDiagnostic(e: {
  nom: string;
  diag: DiagnosticDuPlan;
  remarques: string[];
  commentaire: string;
  contexte: ContexteDuDiagnostic;
  fichier?: string;
}): string {
  const r = e.diag.resume;
  const l: string[] = [`Diagnostic du plan « ${e.nom} »`, ''];
  l.push('Ce qui n’allait pas, selon l’utilisateur :');
  const cochees = REMARQUES.filter((x) => e.remarques.includes(x.cle));
  if (cochees.length === 0) l.push('  (rien de coché)');
  for (const x of cochees) l.push(`  • ${x.libelle}`);
  if (e.commentaire.trim()) {
    l.push('', 'Son message :', ...e.commentaire.trim().split('\n').map((x) => `  ${x}`));
  }
  l.push('', 'Ce que l’application a vu :');
  if (e.diag.problemes.length === 0) l.push('  Aucun problème détecté.');
  for (const p of e.diag.problemes) {
    l.push(`  ${p.gravite === 'alerte' ? '⚠' : '·'} ${p.titre} — ${p.detail}`);
  }
  l.push('', 'Le plan :');
  l.push(
    `  ${r.murs} murs, ${r.portes} porte(s), ${r.fenetres} fenêtre(s), ${r.passages} passage(s), ` +
      `${r.pieces} pièce(s) dont ${r.piecesOuvertes} ouverte(s), ${r.meubles} meuble(s), ` +
      `${r.appareils} appareil(s), ${r.niveaux} niveau(x), ${m2(r.surface)}, ` +
      `hauteur ${metres(r.hauteur)}`,
  );
  for (const p of e.diag.pieces) {
    l.push(`  ${p.nom} : ${p.murs} murs, ${m2(p.aire)}, ${p.fermee ? 'fermée' : 'OUVERTE'}`);
  }
  l.push('');
  const qui = [e.contexte.version && `EchoPlan ${e.contexte.version}`, e.contexte.appareil, e.contexte.systeme]
    .filter(Boolean)
    .join(' · ');
  if (qui) l.push(`Envoyé depuis ${qui}`);
  if (e.fichier) l.push(`Le dossier complet est joint : ${e.fichier}`);
  return l.join('\n');
}

/**
 * Le dossier joint : TOUTES les données du plan, de quoi le rejouer au banc
 * — sauf les coordonnées du client (nom, adresse), qui ne regardent que
 * l'artisan et n'aident en rien à comprendre un plan.
 */
export function dossierDuDiagnostic(e: {
  plan: Record<string, unknown>;
  diag: DiagnosticDuPlan;
  remarques: string[];
  commentaire: string;
  contexte: ContexteDuDiagnostic;
  journal?: unknown;
}): string {
  const plan = { ...e.plan };
  delete plan.client;
  delete plan.address;
  return JSON.stringify({
    format: 'echoplan-diagnostic',
    version: 1,
    envoye: new Date().toISOString(),
    contexte: e.contexte,
    remarques: e.remarques,
    commentaire: e.commentaire,
    diagnostic: e.diag,
    journal: e.journal ?? null,
    plan,
  });
}

/** Un nom de fichier sûr, tiré du nom du plan. */
export function fichierDuDiagnostic(nom: string): string {
  const propre = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `diagnostic-${propre || 'plan'}.json`;
}
