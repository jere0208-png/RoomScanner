/**
 * Diagnostic du plan : ce dont il faut se méfier après un scan.
 *
 * L'app sait maintenant tout corriger — supprimer un mur, en ajouter un,
 * redresser, fusionner ou scinder une pièce. Mais elle ne disait pas OÙ
 * regarder : à charge de l'utilisateur de repérer lui-même le mur douteux
 * dans un plan qui, de loin, paraît propre.
 *
 * On rassemble donc ici tout ce qu'on peut affirmer sans se tromper : ce que
 * RoomPlan lui-même signale comme incertain, et ce que la géométrie trahit —
 * un contour qui ne se referme pas, deux murs posés l'un sur l'autre, une
 * hauteur aberrante. Chaque constat s'accompagne du geste qui le règle, et
 * pointe l'élément concerné pour qu'un appui l'amène sous les yeux.
 */
import {
  linteauxRabotes,
  pointOnSeg,
  roomParts,
  segLength,
  type RoomShape,
  type WallSeg,
} from './floorplan';

export type IssueKind =
  | 'confiance'
  | 'contour'
  | 'murCourt'
  | 'doublon'
  | 'hauteur'
  | 'linteau'
  | 'pieceMinuscule';

export interface PlanIssue {
  kind: IssueKind;
  /** Le constat, tel qu'il s'affiche. */
  message: string;
  /** Le geste qui le règle — l'app a l'outil. */
  hint: string;
  /** `alerte` : le plan est faux. `info` : à confirmer d'un coup d'œil. */
  severity: 'alerte' | 'info';
  wallId?: string;
  roomId?: string;
  /** La menuiserie visée, quand le constat parle d'une baie. */
  openingId?: string;
  /** Hauteur à laquelle remonter un linteau raboté (m, depuis le sol). */
  linteau?: number;
}

/** Mur plus court que ça : presque toujours un artefact de détection. */
const MUR_COURT = 0.25;
/** Deux murs plus proches que ça, et parallèles : un doublon. */
const DOUBLON_DIST = 0.25;
/** Écart de hauteur au-delà duquel un mur détonne dans son logement. */
const HAUTEUR_ECART = 0.4;
/** En dessous, une « pièce » est plus probablement un placard. */
const PIECE_MINUSCULE = 1.5;

const med = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Les deux murs se recouvrent-ils vraiment, ou se suivent-ils bout à bout ? */
function overlaps(a: WallSeg, b: WallSeg): boolean {
  const dx = a.b.x - a.a.x;
  const dz = a.b.z - a.a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return false;
  const t = (p: { x: number; z: number }) =>
    ((p.x - a.a.x) * dx + (p.z - a.a.z) * dz) / len2;
  const t0 = Math.min(t(b.a), t(b.b));
  const t1 = Math.max(t(b.a), t(b.b));
  // Il faut un vrai recouvrement, pas un simple contact au coin.
  return Math.min(1, t1) - Math.max(0, t0) > 0.15;
}

/** Nom lisible d'une pièce, à défaut son rang. */
function nameOf(rooms: { id: string; name?: string }[], id: string): string {
  const r = rooms.find((x) => x.id === id);
  return r?.name || 'cette pièce';
}

/**
 * Passe le plan en revue. Les alertes viennent d'abord : ce sont celles qui
 * rendent le plan faux, pas seulement perfectible.
 */
export function checkPlan(
  walls: WallSeg[],
  rooms: (RoomShape & { name?: string })[],
  /**
   * Les menuiseries, quand l'appelant les a : sans elles, le contrôle ne
   * peut rien dire des linteaux que le volet a rabotés.
   */
  openings: WallSeg[] = [],
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (walls.length === 0) return issues;

  // --- ce que RoomPlan signale lui-même comme incertain
  for (const w of walls) {
    if ((w.confidence ?? '').toLowerCase() !== 'low') continue;
    issues.push({
      kind: 'confiance',
      severity: 'alerte',
      wallId: w.id,
      message: `Un mur de ${segLength(w).toFixed(2).replace('.', ',')} m est mal vu par le scan`,
      hint: 'Vérifiez sa longueur, ou supprimez-le s’il n’existe pas.',
    });
  }

  // --- contours qui ne se referment pas : la surface est alors approchée
  const parts = roomParts(walls, rooms);
  for (const part of parts) {
    if (part.surface?.exact) continue;
    issues.push({
      kind: 'contour',
      severity: 'alerte',
      roomId: part.roomId,
      message: `Le contour de ${nameOf(rooms, part.roomId)} n’est pas fermé`,
      hint: 'Il manque un mur, ou un coin n’a pas rejoint son voisin.',
    });
  }

  /*
    LES BAIES RABOTÉES PAR UN VOLET À MOITIÉ DESCENDU.

    Le scan cadre ce qu'il VOIT : un tablier pendant sous son coffre cache
    le haut de la baie, et le linteau se pose sous le tablier. Dans un même
    logement les linteaux s'alignent — celui qui tombe quinze centimètres
    plus bas que les autres n'est pas une menuiserie particulière.
  */
  for (const r of linteauxRabotes(openings)) {
    issues.push({
      kind: 'linteau',
      severity: 'alerte',
      openingId: r.id,
      linteau: r.linteau,
      message: `Une baie s’arrête à ${Math.round(
        r.actuel * 100,
      )} cm, les autres à ${Math.round(r.linteau * 100)}`,
      hint:
        'Le volet devait pendre sous son coffre pendant le scan : la baie ' +
        'a été cadrée sous le tablier. Un appui la remonte au niveau ' +
        'des autres.',
    });
  }

  // --- murs minuscules
  for (const w of walls) {
    if (segLength(w) >= MUR_COURT) continue;
    issues.push({
      kind: 'murCourt',
      severity: 'info',
      wallId: w.id,
      message: `Un mur ne fait que ${(segLength(w) * 100).toFixed(0)} cm`,
      hint: 'C’est souvent un éclat de détection : supprimez-le.',
    });
  }

  // --- murs posés l'un sur l'autre
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i];
      const b = walls[j];
      const la = segLength(a);
      const lb = segLength(b);
      if (la < 1e-6 || lb < 1e-6) continue;
      const ua = { x: (a.b.x - a.a.x) / la, z: (a.b.z - a.a.z) / la };
      const ub = { x: (b.b.x - b.a.x) / lb, z: (b.b.z - b.a.z) / lb };
      if (Math.abs(ua.x * ub.x + ua.z * ub.z) < 0.95) continue;
      const mid = { x: (b.a.x + b.b.x) / 2, z: (b.a.z + b.b.z) / 2 };
      if (pointOnSeg(mid, a.a, a.b).dist > DOUBLON_DIST) continue;
      if (!overlaps(a, b)) continue;
      issues.push({
        kind: 'doublon',
        severity: 'alerte',
        wallId: b.id,
        message: 'Deux murs se superposent',
        hint: 'Gardez le plus long et supprimez l’autre.',
      });
    }
  }

  // --- hauteurs qui détonnent
  const hauteurs = walls.map((w) => w.height);
  const hRef = med(hauteurs);
  for (const w of walls) {
    if (Math.abs(w.height - hRef) <= HAUTEUR_ECART) continue;
    issues.push({
      kind: 'hauteur',
      severity: 'info',
      wallId: w.id,
      message: `Un mur fait ${w.height.toFixed(2).replace('.', ',')} m de haut, contre ${hRef
        .toFixed(2)
        .replace('.', ',')} m ailleurs`,
      hint: 'Corrigez la hauteur de la pièce si c’est une erreur de scan.',
    });
  }

  // --- pièces improbables
  for (const part of parts) {
    if (!part.surface || part.surface.area >= PIECE_MINUSCULE) continue;
    issues.push({
      kind: 'pieceMinuscule',
      severity: 'info',
      roomId: part.roomId,
      message: `${nameOf(rooms, part.roomId)} ne fait que ${part.surface.area
        .toFixed(1)
        .replace('.', ',')} m²`,
      hint: 'Un placard compte comme une pièce : fusionnez-la ou retirez-la.',
    });
  }

  return issues.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'alerte' ? -1 : 1,
  );
}
