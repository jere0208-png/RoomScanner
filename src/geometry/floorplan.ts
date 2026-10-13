import type { OrthoDeFace } from './habillage';
import type { ObjectData, SurfaceData, SurfaceTexture } from 'react-native-room-scan';

/** Épaisseur d'un mur dont personne n'a dit l'épaisseur (m). */
export const WALL_T = 0.14;

/**
 * LES ÉPAISSEURS QU'ON RENCONTRE — relevé du patron : « les épaisseurs des
 * murs comptent ». Tous les murs avaient la même, quatorze centimètres :
 * une cloison de placard et un mur de refend se dessinaient pareil, et un
 * mur neuf posé à une cote mesurée tombait à côté de l'épaisseur qu'il
 * aurait dû avoir. Les valeurs sont celles du commerce : plaque sur
 * ossature, doublage, brique, parpaing.
 */
export const EPAISSEURS: { mot: string; m: number }[] = [
  { mot: 'Cloison', m: 0.07 },
  { mot: 'Doublage', m: 0.1 },
  { mot: 'Mur', m: WALL_T },
  { mot: 'Porteur', m: 0.2 },
  // Les murs d'une maison ancienne — revue « Karim » : ses porteurs de 45 cm
  // étaient impossibles depuis l'écran.
  { mot: 'Mur épais', m: 0.3 },
  { mot: 'Mur ancien', m: 0.45 },
];

/** L'épaisseur d'un mur : la sienne, ou celle de tous. */
export const epaisseurDe = (w: { epaisseur?: number }): number =>
  w.epaisseur && w.epaisseur > 0 ? w.epaisseur : WALL_T;

/** Point au sol, en mètres (repère monde, plan XZ). */
export interface Pt {
  x: number;
  z: number;
}

/**
 * Pièce d'appartenance par défaut : les scans d'avant le multi-pièces, et
 * tout élément dont la pièce n'a pas été renseignée, tombent ici.
 */
export const DEFAULT_ROOM_ID = 'room-1';

/** Segment de mur au sol, en mètres (repère monde, plan XZ). */
export interface WallSeg {
  id: string;
  type: 'wall' | 'door' | 'window' | 'opening';
  a: Pt;
  b: Pt;
  height: number;
  /** Hauteur du centre de la surface (m, repère monde) — sert à la vue 3D. */
  yCenter: number;
  /** Couleur moyenne relevée pendant le scan (#RRGGBB), si captée. */
  color?: string;
  /** Grille de couleurs relevée sur la face intérieure, si captée. */
  texture?: SurfaceTexture;
  /**
   * LES VRAIES IMAGES DE SES FACES — les orthophotos du relevé qui les
   * couvrent (voir `habillage`). La 3D les pose sur le mur.
   */
  orthos?: OrthoDeFace[];
  /** Pièce à laquelle ce mur appartient (scan multi-pièces). */
  roomId?: string;
  /**
   * NE SÉPARE PAS DEUX PIÈCES — la cloison commune de deux pièces qu'on a
   * fusionnées. Elle reste dessinée, mais la détection des pièces passe à
   * travers : la fusion survit à « Redétecter » et à « Redresser » (revues
   * « Camille » et « Karim »).
   */
  nonSeparateur?: boolean;
  /**
   * TRACÉ AUX COTES INTÉRIEURES — un mur dessiné à la main ou lu sur un plan
   * papier. Ses cotes se lisent et se tapent de nu à nu, et la pièce qu'il
   * ferme (avec d'autres comme lui) se compte au nu : voir `contourAuNu`.
   * Absent d'un mur scanné, compté à l'axe tant que la mesure au mètre
   * ruban n'a pas tranché.
   */
  auNu?: boolean;
  /**
   * UN ANGLE TAPÉ, PAS UN DÉFAUT DE RELEVÉ — posé par « Angle du mur ».
   * « Redresser » ne le remet pas d'équerre, et il ne vote pas pour la trame
   * du logement (revue « Karim »).
   */
  angleVoulu?: boolean;
  /**
   * Ouverture qu'on TRAVERSE : baie sans porte, ou porte détectée ouverte.
   * Elle ne se dessine pas comme un panneau mais comme un vide.
   */
  open?: boolean;
  /**
   * La pièce derrière cette porte n'a été vue que par elle, et n'est pas
   * relevée (revue « Amandine ») : le diagnostic le garde en mémoire.
   */
  versNonReleve?: boolean;
  /**
   * PORTE DE GARAGE — sectionnelle, basculante : elle ne bat pas. Ni
   * battant ni quart de cercle sur le plan, et elle ne devient pas une baie
   * malgré sa largeur (voir `porteDeGarage`).
   */
  garage?: boolean;
  /**
   * PORTE À DEUX VANTAUX (revue « Hélène ») : chacun bat depuis son tableau
   * jusqu'au milieu. Absent = un seul vantail.
   */
  vantaux?: 2;
  /**
   * Confiance de RoomPlan dans cette détection (`low`, `medium`, `high`).
   * C'est lui qui sait le mieux de quoi il doute : le diagnostic du plan
   * s'en sert pour désigner les murs à vérifier.
   */
  confidence?: string;
  /**
   * HAUTEUR DU COFFRE DE VOLET ROULANT qui coiffe cette menuiserie (m).
   *
   * Relevé du chantier, photo à l'appui : « le scan ne détecte pas les
   * rebords de coffrage de volet ». RoomPlan modélise des murs, des
   * menuiseries et des meubles ; un caisson de volet est un accident de la
   * maçonnerie au-dessus de la baie, et il ne sait pas le voir. On le
   * déclare donc à la main — c'est une contrainte de premier ordre pour
   * qui perce : coulisse, tablier enroulé, tube, et le moteur à alimenter.
   *
   * Pas de liste à part : une hauteur portée par la baie qu'il coiffe. Il
   * la suit quand elle bouge, s'en va quand on la ferme, et rien ne peut
   * se désynchroniser.
   */
  coffre?: number;
  /**
   * UN DÉTECTEUR D'OUVERTURE SUR CETTE MENUISERIE — le contact d'alarme que
   * le plan d'architecte écrit en bleu dans la baie (« détecteur
   * d'ouverture »). Il se dessine « DO » dans la baie et s'achète au
   * bordereau.
   */
  detecteur?: boolean;
  /**
   * CE QUE LE COFFRE AVANCE DANS LA PIÈCE (m) — mesuré dans le maillage
   * LiDAR (voir `coffreLidar`). Absent pour un coffre déclaré à la main :
   * un tunnel noyé dans la maçonnerie ne dépasse pas du mur. Présent, la 3D
   * le dessine en volume au-dessus de la baie.
   */
  coffreSaillie?: number;
  /**
   * DE QUEL BORD LA PORTE PIVOTE — quand quelqu'un l'a dit.
   *
   * Le plan le devine (`pivotsDesBattants` range les portes dos à dos pour
   * qu'aucune paire d'arcs ne se croise), et cette supposition est fausse
   * une fois sur deux : une porte réelle pivote du côté que le menuisier a
   * choisi, pas du côté qui arrange le dessin. Pour un électricien ce n'est
   * pas un détail de trait — l'interrupteur se pose du côté de la POIGNÉE,
   * jamais du côté des paumelles.
   *
   * Absent = personne n'a tranché, la mise en place automatique décide.
   */
  pivot?: 'a' | 'b';
  /**
   * Le vantail s'ouvre vers l'AUTRE pièce que celle qui le porte.
   *
   * Par défaut il s'ouvre vers l'intérieur : c'est le cas le plus fréquent
   * en logement, et c'est ce que le dessin supposait sans le dire.
   */
  versExterieur?: boolean;
  /**
   * L'ÉTAGE où vit ce mur. 0 = rez-de-chaussée, 1 = premier, −1 = sous-sol.
   *
   * Absent sur tous les scans d'avant les étages, et cette absence VAUT
   * rez-de-chaussée : rien à migrer, rien à réécrire, les anciens dossiers
   * s'ouvrent où ils ont toujours été.
   *
   * C'est le mur — et la pièce — qui porte le niveau ; tout le reste en
   * hérite, puisque l'appareillage tient à un mur, le meuble à une pièce et
   * la photo à un mur. Une liste de niveaux tenue à part aurait permis à un
   * interrupteur de se retrouver à un étage où son mur n'est pas.
   */
  niveau?: number;
  /**
   * CE MUR NE TIENT PLUS SES VOISINS.
   *
   * Deux murs qui partagent un point bougent ensemble : c'est ce qu'il faut
   * pour le coin d'une pièce, dont le contour doit rester fermé. Mais un
   * retour qu'on veut simplement allonger ne doit toucher que lui — relevé
   * du chantier : « si j'essaye de prolonger ce retour, c'est le long mur
   * qui est impacté ».
   *
   * Détaché, le mur se déplace seul. Il redevient solidaire dès que l'aimant
   * recolle une de ses extrémités au bout d'un autre : raccrocher, c'est
   * ressouder.
   */
  libre?: boolean;
  /**
   * L'ÉPAISSEUR DE CE MUR (m), quand elle n'est pas celle de tous.
   *
   * Absente sur tout ce que RoomPlan a relevé — il ne la mesure pas — et
   * cette absence vaut `WALL_T`. Elle se donne à la pose d'un mur neuf, ou
   * se change sur un mur choisi. Le trait du plan reste l'AXE : l'épaisseur
   * s'étend de part et d'autre, et `wallQuads` en tire les onglets, en 2D,
   * en 3D, dans le PDF et le DXF.
   */
  epaisseur?: number;
  /**
   * SES DEUX FACES ONT ÉTÉ RELEVÉES (`fusionnerMursDoubles`) : le trait est
   * leur axe, et `epaisseur` leur écart mesuré. Sur un plan scanné, les
   * pièces se comptent alors au nu de ce mur-là (revue « Sébastien »).
   */
  deuxFaces?: boolean;
}

/** Pièce d'un élément, valeur par défaut comprise. */
export const roomOf = (item: { roomId?: string }): string =>
  item.roomId ?? DEFAULT_ROOM_ID;

/**
 * Répartit des éléments par pièce, en conservant l'ordre d'apparition des
 * pièces. Toute la géométrie (soudure, boucles, surfaces, sols) se calcule
 * pièce par pièce : deux pièces mitoyennes ont chacune leur mur, et rien ne
 * doit les fusionner.
 */
export function groupByRoom<T extends { roomId?: string }>(
  items: T[],
): { roomId: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = roomOf(item);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((roomId) => ({ roomId, items: map.get(roomId)! }));
}

/** Empreinte au sol d'un objet (rectangle orienté). */
export interface ObjectFootprint {
  id: string;
  category: string;
  cx: number;
  cz: number;
  width: number;
  depth: number;
  height: number;
  yCenter: number;
  /** Rotation autour de Y, en radians. */
  yaw: number;
  /** Couleur moyenne relevée pendant le scan (#RRGGBB), si captée. */
  color?: string;
  /** Référence du catalogue (meuble posé à la main) : elle spécialise la
   *  silhouette 3D. */
  modele?: string;
  /** Matière dominante, pour l'habillage 3D. */
  matiere?: string;
}

/**
 * Convertit une surface native en segment au sol.
 * iOS livre une matrice 4x4 colonne-major : colonne 0 = direction du mur,
 * colonne 3 = position. Android livre directement ax/az/bx/bz.
 */
/** Vrai si RoomPlan a vu la porte ouverte, ou si c'est une baie libre. */
function isOpenPassage(s: SurfaceData): boolean {
  if (s.type === 'opening') return true;
  return s.type === 'door' && /isOpen:\s*true/.test(s.category ?? '');
}

/**
 * CE QU'ON TRAVERSE — et pourquoi ça ne se retient pas dans un drapeau.
 *
 * `open` était posé une seule fois, à la lecture du scan : RoomPlan dit
 * qu'il a vu la porte ouverte, ou que c'est une baie libre, et le segment
 * gardait la réponse. Une baie posée à la MAIN ne passait jamais par là.
 * Elle n'avait donc pas le drapeau : le plan 2D la dessinait en trouée, la
 * 3D la bouchait d'un panneau plein. Deux dessins du même trou, et rien
 * pour les réconcilier — c'est le « pas d'ouverture réelle » du relevé.
 *
 * Une baie libre est un vide PAR NATURE : le dire deux fois, c'est se
 * donner l'occasion de se contredire. Le drapeau ne sert donc plus qu'à ce
 * qu'il est seul à savoir : une PORTE que le scan a trouvée ouverte.
 */
/**
 * SUR QUEL MUR vit cette menuiserie : son plancher et son plafond.
 *
 * Le mur porteur donne la hauteur disponible ; faute de mur retrouvé, on
 * prend la hauteur d'étage courante plutôt que de refuser le réglage — une
 * ouverture orpheline reste réglable, et elle se voit.
 *
 * LE SOL AUSSI VIENT DE LUI, et pas du zéro du repère. ARKit pose son
 * origine là où le relevé a commencé — à hauteur de main, le plus souvent.
 * Un scan livre donc couramment des murs dont le plancher tombe à −0,40, et
 * ramener l'allège d'une porte à « zéro » dans ce repère-là la décroche du
 * sol : relevé du chantier, « en choisissant la porte, elle se monte à
 * l'envers ».
 */
export function murPorteurDe(
  o: WallSeg,
  walls: WallSeg[],
): { sol: number; hauteur: number } {
  let best = Infinity;
  let porteur: WallSeg | null = null;
  const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
  for (const w of walls) {
    const d = pointOnSeg(mid, w.a, w.b).dist;
    if (d < best) {
      best = d;
      porteur = w;
    }
  }
  if (!porteur || best > 0.6) {
    // Orpheline : on garde SON propre plancher, faute de mieux — la
    // remonter au zéro du repère serait la déplacer sans rien savoir.
    return { sol: o.yCenter - o.height / 2, hauteur: 2.5 };
  }
  return {
    sol: porteur.yCenter - porteur.height / 2,
    hauteur: porteur.height,
  };
}

export function estTraversante(o: {
  type: WallSeg['type'];
  open?: boolean;
}): boolean {
  return o.type === 'opening' || o.open === true;
}

export function toSegment(s: SurfaceData, roomId?: string): WallSeg {
  const skin = {
    color: s.color,
    texture: s.texture,
    roomId,
    open: isOpenPassage(s) || undefined,
    confidence: s.confidence,
  };
  if (s.ax !== undefined) {
    return {
      id: s.id,
      type: s.type,
      a: { x: s.ax!, z: s.az! },
      b: { x: s.bx!, z: s.bz! },
      height: s.height,
      yCenter: s.height / 2,
      ...skin,
    };
  }
  const m = s.transform!;
  const dir = { x: m[0], z: m[2] };
  const pos = { x: m[12], z: m[14] };
  const h = s.length / 2;
  return {
    id: s.id,
    type: s.type,
    a: { x: pos.x - dir.x * h, z: pos.z - dir.z * h },
    b: { x: pos.x + dir.x * h, z: pos.z + dir.z * h },
    height: s.height,
    yCenter: m[13],
    ...skin,
  };
}

export function toFootprint(o: ObjectData): ObjectFootprint {
  const m = o.transform;
  return {
    id: o.id,
    category: o.category,
    cx: m[12],
    cz: m[14],
    width: o.width,
    depth: o.depth,
    height: o.height,
    yCenter: m[13],
    yaw: Math.atan2(m[2], m[0]),
    color: o.color,
    modele: o.modele,
    matiere: o.matiere,
  };
}

/**
 * Si les murs forment une boucle fermée (chaque coin relie exactement
 * deux murs), renvoie les coins ordonnés le long de la boucle — sinon null.
 * Sert au calcul de surface et au sol de la vue 3D.
 */
export function closedLoop(tous: WallSeg[]): { x: number; z: number }[] | null {
  const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
  // Un éclat de 0 cm sur un coin n'est pas un mur : il ne compte pas.
  let walls = tous.filter((w) => segLength(w) >= ECLAT);
  /*
    LES BOUTS PENDANTS NE FONT PAS LE CONTOUR — revues « Karim » et
    « Camille ». Un retour qui ne ferme rien (une niche ouverte, un mur
    fantôme accroché au séjour) laissait un coin à trois murs : plus de
    boucle, la surface devenait « ≈ » et fausse (+9,6 % sur une chambre). On
    retire ce qui pend, jusqu'à ce que plus rien ne pende ; une pièce
    vraiment ouverte (un mur manque) n'y gagne rien, elle reste ouverte.
  */
  for (;;) {
    const degre = new Map<string, number>();
    for (const w of walls) {
      for (const p of [w.a, w.b]) degre.set(key(p), (degre.get(key(p)) ?? 0) + 1);
    }
    const tenus = walls.filter((w) => (degre.get(key(w.a)) ?? 0) > 1 && (degre.get(key(w.b)) ?? 0) > 1);
    if (tenus.length === walls.length) break;
    walls = tenus;
  }
  if (walls.length < 3) return null;
  const adj = new Map<string, { wallId: string; to: { x: number; z: number } }[]>();
  for (const w of walls) {
    for (const [from, to] of [
      [w.a, w.b],
      [w.b, w.a],
    ] as const) {
      const k = key(from);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)!.push({ wallId: w.id, to });
    }
  }
  for (const [, edges] of adj) {
    if (edges.length !== 2) return null;
  }
  const start = walls[0].a;
  const used = new Set<string>();
  const pts: { x: number; z: number }[] = [];
  let cur = start;
  for (let i = 0; i < walls.length; i++) {
    pts.push(cur);
    const next = adj.get(key(cur))!.find((e) => !used.has(e.wallId));
    if (!next) return null;
    used.add(next.wallId);
    cur = next.to;
  }
  if (key(cur) !== key(start) || used.size !== walls.length) return null;
  return pts;
}

/** Aire (m²) d'un polygone par la formule du lacet. */
export function loopAreaM2(pts: { x: number; z: number }[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.z - q.x * p.z;
  }
  return Math.abs(sum) / 2;
}

export function segLength(w: WallSeg): number {
  return Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
}

/**
 * EN DESSOUS, UN « MUR » EST UN ÉCLAT (m).
 *
 * Relevé du patron, diagnostic à l'appui : une pièce qui ne se fermait pas,
 * et deux « murs » de 0 cm posés sur un même coin. Un mur de moins de quinze
 * centimètres dont les deux bouts sont soudés au même coin (`weldCorners`)
 * devient un point ; ce coin portait six bouts de mur au lieu de deux, et
 * aucune boucle ne passait plus.
 */
export const ECLAT = 0.005;

/** Le plan sans ses éclats — ni dans les murs, ni dans les listes des pièces. */
export function sansEclats<W extends WallSeg, R extends { wallIds?: string[] }>(
  walls: W[],
  rooms: R[],
): { walls: W[]; rooms: R[] } {
  const eclats = new Set(walls.filter((w) => w.type === 'wall' && segLength(w) < ECLAT).map((w) => w.id));
  if (eclats.size === 0) return { walls, rooms };
  return {
    walls: walls.filter((w) => !eclats.has(w.id)),
    rooms: rooms.map((r) =>
      r.wallIds?.some((id) => eclats.has(id)) ? { ...r, wallIds: r.wallIds.filter((id) => !eclats.has(id)) } : r,
    ),
  };
}

// ------------------------------------------------------ jonctions de murs

const nodeKey = (p: Pt) => `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
/**
 * Normale « gauche » d'une direction unitaire. C'est elle qui définit le côté
 * `a1/b1` d'un mur — donc, pour l'appareillage électrique, la face `+1`.
 */
export const perpOf = (d: Pt): Pt => ({ x: -d.z, z: d.x });
const perp = perpOf;

/**
 * Corps d'un mur au sol : quadrilatère à coins d'onglet.
 * `a1/b1` longent la face +n (n = normale gauche de a→b), `b2/a2` la face −n.
 */
export interface WallQuad {
  a1: Pt;
  b1: Pt;
  b2: Pt;
  a2: Pt;
}

interface Arm {
  wallId: string;
  end: 'a' | 'b';
  /** Position du nœud (m). */
  p: Pt;
  /** Direction unitaire du mur EN PARTANT du nœud. */
  dir: Pt;
  angle: number;
}

/** Intersection de deux droites (point + direction). Null si parallèles. */
function lineCross(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const den = d1.x * d2.z - d1.z * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const s = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / den;
  return { x: p1.x + d1.x * s, z: p1.z + d1.z * s };
}

/** Distance d'un point à un segment, et position relative le long du segment. */
export function pointOnSeg(p: Pt, a: Pt, b: Pt): { dist: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return { dist: Math.hypot(p.x - a.x, p.z - a.z), t: 0 };
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
  const tc = Math.min(1, Math.max(0, t));
  return {
    dist: Math.hypot(p.x - (a.x + dx * tc), p.z - (a.z + dz * tc)),
    t,
  };
}

/**
 * Géométrie des murs épais avec de VRAIES jonctions.
 *
 * À chaque nœud, les bras (murs qui s'y rejoignent) sont triés par angle ;
 * entre deux bras consécutifs, les deux faces qui bordent le secteur sont
 * prolongées et coupées l'une par l'autre : c'est l'onglet. Le coin est donc
 * partagé au point près par les deux murs — plus d'interpénétration, plus de
 * trou, et le résultat est identique en 2D, en 3D et dans le PDF.
 *
 * Cas particuliers : une extrémité libre reçoit un about droit ; si elle
 * s'appuie sur le flanc d'un autre mur (jonction en T), elle est prolongée
 * d'une demi-épaisseur pour entrer dans son corps sans laisser de fente.
 */
export function wallQuads(walls: WallSeg[], t?: number): Map<string, WallQuad> {
  /*
    UNE DEMI-ÉPAISSEUR PAR MUR. Un `t` donné les force toutes (les rendus
    qui le demandent explicitement) ; sinon chaque mur porte la sienne, et
    l'onglet entre une cloison de sept et un mur de vingt se coupe là où
    leurs faces se croisent vraiment.
  */
  const demiDe = new Map(walls.map((w) => [w.id, (t ?? epaisseurDe(w)) / 2]));
  const demi = (id: string) => demiDe.get(id) ?? WALL_T / 2;
  const plusEpais = Math.max(WALL_T, ...walls.map((w) => t ?? epaisseurDe(w)));
  const arms = new Map<string, Arm[]>();
  // Deux pièces mitoyennes ont chacune leur mur : leurs bouts ne se
  // prolongent pas l'un dans l'autre, seuls les murs d'une même pièce
  // forment des jonctions.
  const roomById = new Map(walls.map((w) => [w.id, roomOf(w)]));

  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const u = { x: dx / len, z: dz / len };
    for (const end of ['a', 'b'] as const) {
      const dir = end === 'a' ? u : { x: -u.x, z: -u.z };
      // Nœud identifié PAR PIÈCE : deux pièces qui se touchent au même point
      // gardent chacune son angle, elles ne s'assemblent pas en onglet.
      const k = `${roomOf(w)}|${nodeKey(w[end])}`;
      const list = arms.get(k) ?? [];
      list.push({
        wallId: w.id,
        end,
        p: w[end],
        dir,
        angle: Math.atan2(dir.z, dir.x),
      });
      arms.set(k, list);
    }
  }

  const out = new Map<string, WallQuad>();
  const corner = (id: string, end: 'a' | 'b', side: 1 | -1, p: Pt) => {
    const q =
      out.get(id) ??
      ({ a1: p, b1: p, b2: p, a2: p } as WallQuad);
    if (end === 'a') {
      if (side === 1) q.a1 = p;
      else q.a2 = p;
    } else if (side === 1) {
      q.b1 = p;
    } else {
      q.b2 = p;
    }
    out.set(id, q);
  };

  for (const [, list] of arms) {
    const P: Pt = list[0].p;

    // Extrémité libre : about droit, prolongé si elle bute sur un autre mur.
    if (list.length === 1) {
      const arm = list[0];
      const armRoom = roomById.get(arm.wallId);
      const hote = walls.find((v) => {
        if (v.id === arm.wallId || roomOf(v) !== armRoom) return false;
        const { dist, t: pos } = pointOnSeg(P, v.a, v.b);
        return dist < demi(v.id) * 2 && pos > 0.02 && pos < 0.98;
      });
      // Le prolongement part À L'OPPOSÉ du corps du mur, dans celui du
      // voisin — d'une demi-épaisseur DU VOISIN : c'est lui qu'on traverse.
      const C = hote
        ? { x: P.x - arm.dir.x * demi(hote.id), z: P.z - arm.dir.z * demi(hote.id) }
        : P;
      const half = demi(arm.wallId);
      const nrm = perp(arm.dir);
      // +perp(dir) vaut +n en 'a' (dir = u) mais −n en 'b' (dir = −u).
      const sPlus: 1 | -1 = arm.end === 'a' ? 1 : -1;
      corner(arm.wallId, arm.end, sPlus, {
        x: C.x + nrm.x * half,
        z: C.z + nrm.z * half,
      });
      corner(arm.wallId, arm.end, sPlus === 1 ? -1 : 1, {
        x: C.x - nrm.x * half,
        z: C.z - nrm.z * half,
      });
      continue;
    }

    const sorted = [...list].sort((p, q) => p.angle - q.angle);
    for (let i = 0; i < sorted.length; i++) {
      const A = sorted[i];
      const B = sorted[(i + 1) % sorted.length];
      const na = perp(A.dir);
      const nb = perp(B.dir);
      // Faces qui bordent le secteur A→B : côté +perp pour A, −perp pour B
      // — chacune à SA demi-épaisseur.
      const pa = { x: P.x + na.x * demi(A.wallId), z: P.z + na.z * demi(A.wallId) };
      const pb = { x: P.x - nb.x * demi(B.wallId), z: P.z - nb.z * demi(B.wallId) };
      let X = lineCross(pa, A.dir, pb, B.dir);
      // Murs alignés (secteur plat ou replié) : pas d'onglet, on reste au bord.
      if (!X) X = pa;
      // Angle très aigu : l'onglet part à l'infini, on l'écrête.
      const d = Math.hypot(X.x - P.x, X.z - P.z);
      const maxOut = plusEpais * 3;
      if (d > maxOut) {
        X = {
          x: P.x + ((X.x - P.x) / d) * maxOut,
          z: P.z + ((X.z - P.z) / d) * maxOut,
        };
      }
      corner(A.wallId, A.end, A.end === 'a' ? 1 : -1, X);
      corner(B.wallId, B.end, B.end === 'a' ? -1 : 1, X);
    }
  }

  // Murs de longueur nulle ignorés plus haut : quad dégénéré mais défini.
  for (const w of walls) {
    if (!out.has(w.id)) {
      out.set(w.id, { a1: w.a, b1: w.b, b2: w.b, a2: w.a });
    }
  }
  return out;
}

/** Contour fermé d'un corps de mur, dans l'ordre de tracé. */
/**
 * `wallQuads` mémoïsé sur l'IDENTITÉ du tableau de murs.
 *
 * Glisser une prise redemande les onglets à chaque image, et le store n'a
 * pas de `useMemo`. Les listes de murs étant remplacées et jamais modifiées
 * en place, comparer les références suffit — et une seule entrée suffit
 * aussi : on travaille toujours sur le plan courant.
 */
let quadMemo: {
  walls: WallSeg[];
  t: number | undefined;
  map: Map<string, WallQuad>;
} | null = null;
export function wallQuadsOf(
  walls: WallSeg[],
  t?: number,
): Map<string, WallQuad> {
  if (quadMemo && quadMemo.walls === walls && quadMemo.t === t) return quadMemo.map;
  const map = wallQuads(walls, t);
  quadMemo = { walls, t, map };
  return map;
}

/**
 * LES JONCTIONS — la maçonnerie au cœur d'un nœud de trois murs ou plus.
 *
 * Relevé du patron : « il y a des triangles visibles dans les murs lors de
 * jonctions ». À un nœud où trois murs se rejoignent (une cloison qui tombe
 * sur un mur coupé à cet endroit — toute jonction en T d'un plan relevé), les
 * onglets de `wallQuads` se partagent leurs coins deux à deux, mais leurs
 * bouts bordent au centre un polygone que personne ne remplit : le triangle
 * blanc du plan, le puits de la maquette, le trou du PDF.
 *
 * On ne rallonge PAS les murs pour le boucher : leur contour donne aussi
 * leurs FACES (`wallFace`), c'est-à-dire les cotes « depuis la gauche,
 * depuis la droite » de l'établi — elles doivent rester où elles sont. La
 * jonction a donc SON polygone : les coins d'onglet du nœud, dans l'ordre
 * angulaire autour de lui. Chaque rendu le peint avec les murs.
 */
export function jonctionsDeMurs(walls: WallSeg[], t?: number): Pt[][] {
  const quads = wallQuadsOf(walls, t);
  const noeuds = new Map<string, { p: Pt; coins: Pt[]; bras: number }>();
  for (const w of walls) {
    if (Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) < 1e-6) continue;
    const q = quads.get(w.id);
    if (!q) continue;
    for (const end of ['a', 'b'] as const) {
      const k = `${roomOf(w)}|${nodeKey(w[end])}`;
      const n = noeuds.get(k) ?? { p: w[end], coins: [], bras: 0 };
      n.bras++;
      n.coins.push(...(end === 'a' ? [q.a1, q.a2] : [q.b1, q.b2]));
      noeuds.set(k, n);
    }
  }
  const out: Pt[][] = [];
  for (const n of noeuds.values()) {
    if (n.bras < 3) continue;
    const tries = n.coins
      .map((c) => ({ c, ang: Math.atan2(c.z - n.p.z, c.x - n.p.x) }))
      .sort((u, v) => u.ang - v.ang);
    const poly: Pt[] = [];
    for (const { c } of tries) {
      if (!poly.some((d) => Math.hypot(d.x - c.x, d.z - c.z) < 1e-6)) poly.push(c);
    }
    if (poly.length >= 3) out.push(poly);
  }
  return out;
}

let jonctionsMemo: { walls: WallSeg[]; t: number | undefined; liste: Pt[][] } | null = null;
/** `jonctionsDeMurs` mémoïsé, comme `wallQuadsOf`, sur l'identité des murs. */
export function jonctionsDeMursOf(walls: WallSeg[], t?: number): Pt[][] {
  if (jonctionsMemo && jonctionsMemo.walls === walls && jonctionsMemo.t === t) return jonctionsMemo.liste;
  const liste = jonctionsDeMurs(walls, t);
  jonctionsMemo = { walls, t, liste };
  return liste;
}

/**
 * Où pointe le nord à l'écran, en radians (0 = vers la droite, sens horaire
 * — la convention des rotations SVG).
 *
 * `northOffset` est le cap de l'axe −Z du repère de scan, tel que le
 * magnétomètre l'a relevé : 0 signifie que le scan a commencé face au nord.
 * La direction du nord dans le monde est donc (−sin, −cos) en (x, z), et le
 * plan lui ajoute sa propre rotation.
 */
export function northScreenAngle(northOffset: number, viewRot: number): number {
  const t = (northOffset * Math.PI) / 180;
  return Math.atan2(-Math.cos(t), -Math.sin(t)) + viewRot;
}

/**
 * Repousse un meuble hors des murs, sans jamais l'attirer.
 *
 * L'aimant précédent décidait à la place de l'utilisateur : il collait le
 * meuble ET lui imposait son angle, ce qui, dans une pièce étroite, revenait
 * à l'y clouer. On ne fait plus que l'empêcher d'ENTRER dans un mur : il
 * glisse librement, s'arrête pile contre le nu, et peut donc se poser à
 * touche-touche — ce qu'un aimant ne permet jamais avec précision.
 *
 * Le calcul : pour chaque mur de la pièce, la demi-emprise du meuble
 * PROJETÉE sur la normale du mur donne la distance minimale entre son centre
 * et le nu. En dessous, on le repousse d'autant. Deux passes suffisent pour
 * les coins, où deux murs poussent en même temps.
 */
export function pushOutOfWalls(
  centre: Pt,
  box: { width: number; depth: number; yaw: number },
  walls: WallSeg[],
  inside: Pt,
  outline?: Pt[],
  /**
   * D'OÙ VIENT LE MEUBLE — et c'est capital dès qu'il y a un RETOUR DE MUR.
   *
   * Un mur repousse vers l'intérieur de la pièce, et l'intérieur était donné
   * par UN point : l'ancre de l'étiquette, quelque part au milieu du salon.
   * Or un retour de mur crée une alcôve qui est de l'AUTRE côté de ce
   * refend : le retour poussait donc le meuble à travers l'alcôve, vers le
   * salon. C'est exactement ce que le chantier a filmé — « tant qu'il y a ce
   * retour de mur à droite, ça ne rentre pas », et la place était pourtant
   * là.
   *
   * En glissant un meuble, on sait mieux : il vient de quelque part. Chaque
   * mur le repousse donc du côté où il ÉTAIT — la collision d'un objet
   * qu'on pousse, et non la remise en ordre d'un plan mal relevé. L'ancre de
   * la pièce ne sert plus que de recours, quand le meuble se trouve
   * exactement sur le nu.
   */
  depuis?: Pt,
): Pt {
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  let p = { ...centre };
  // Le doigt part TOUJOURS au-delà du mur quand on plaque un meuble contre
  // lui. Or un mur ne repousse que ce qui se trouve en face de lui : visé
  // loin dans un angle, le meuble n'était plus en face d'aucun des deux, et
  // il s'échappait par le coin. On ramène donc d'abord le point visé sur le
  // contour de la pièce ; la poussée qui suit part alors d'un point que les
  // murs voient, et le meuble se range dans l'angle au lieu de le traverser.
  if (outline && outline.length >= 3 && !insidePoly(p, outline)) {
    p = nearestOnRing(p, outline);
  }
  for (let passe = 0; passe < 2; passe++) {
    for (const w of walls) {
      const len = segLength(w);
      if (len < 1e-6) continue;
      const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
      let n = perpOf(u);
      const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      /*
        DE QUEL CÔTÉ CE MUR REPOUSSE-T-IL ?

        Trois réponses, dans cet ordre. D'abord LÀ OÙ LE MEUBLE EST : c'est
        la collision d'un objet qu'on pousse, et le mur le renvoie du côté
        d'où il l'aborde. Ensuite d'où il VENAIT, si le voilà pile sur le nu
        et qu'on ne peut plus trancher. En dernier recours l'ancre de la
        pièce — qui était, avant, le seul critère.
        C'est ce critère unique qui bloquait les alcôves : l'ancre est au
        milieu du salon, donc un RETOUR DE MUR poussait le meuble à travers
        l'alcôve pour le ramener au salon. « Tant qu'il y a ce retour de mur,
        ça ne rentre pas » — la place était pourtant là.
      */
      const versAncre = (inside.x - mid.x) * n.x + (inside.z - mid.z) * n.z;
      let sens = versAncre;
      if (depuis) {
        // On DÉPLACE le meuble : c'est une collision, et le mur le renvoie
        // du côté où il l'aborde. Sans point de départ, en revanche, on
        // RÉPARE un relevé — une télé que le scanner a plantée dans la
        // cloison doit revenir dans SA pièce, et là seule l'ancre le sait.
        const versIci = (p.x - w.a.x) * n.x + (p.z - w.a.z) * n.z;
        const versDepart =
          (depuis.x - w.a.x) * n.x + (depuis.z - w.a.z) * n.z;
        sens =
          Math.abs(versIci) > epaisseurDe(w) / 2
            ? versIci
            : Math.abs(versDepart) > epaisseurDe(w) / 2
              ? versDepart
              : versAncre;
      }
      if (sens < 0) {
        n = { x: -n.x, z: -n.z };
      }
      // Demi-emprise dans la direction du mur : la boîte est tournée, ce
      // sont ses deux demi-côtés projetés qui comptent.
      const demi =
        Math.abs((cos * n.x + sin * n.z) * (box.width / 2)) +
        Math.abs((-sin * n.x + cos * n.z) * (box.depth / 2));
      // Le nu de CE mur : une cloison de sept laisse le meuble plus près
      // de son axe qu'un porteur de vingt.
      const mini = demi + epaisseurDe(w) / 2;
      // Distance signée du centre au nu, comptée vers l'intérieur.
      const d = (p.x - w.a.x) * n.x + (p.z - w.a.z) * n.z;
      // Hors du segment : ce mur ne barre pas la route ici.
      const t = ((p.x - w.a.x) * u.x + (p.z - w.a.z) * u.z) / len;
      if (t < -0.15 || t > 1.15) continue;
      if (d < mini) {
        p = { x: p.x + n.x * (mini - d), z: p.z + n.z * (mini - d) };
      }
    }
  }
  return p;
}

/**
 * UN MEUBLE S'AJUSTE AU RECOIN OÙ ON LE POSE.
 *
 * Relevé du chantier, vidéo à l'appui : une table poussée dans une niche
 * entre trois murs « se téléporte à côté ». C'est mécanique — deux murs qui
 * se font face poussent chacun dans son sens, et le meuble finit par sortir
 * par le côté ouvert. Un plan de chantier n'a que faire de ce jeu de
 * quilles : dans une niche de 1,10 m, on pose un meuble de 1,10 m.
 *
 * On mesure donc la place RÉELLEMENT disponible autour du point visé, dans
 * les deux axes du meuble, et on rabote ce qui dépasse. Le meuble se centre
 * dans sa niche, et l'on garde sa cote d'origine à part (`baseWidth`) : dès
 * qu'il en ressort, il la reprend. Rien n'est perdu, tout est réversible.
 *
 * Deux garde-fous : on ne rabote jamais en dessous de 45 % de la cote (une
 * armoire de 2 m ne devient pas un tabouret pour tenir dans un placard à
 * balais), ni en dessous de 40 cm. Sous ce seuil, la niche n'est pas une
 * place pour ce meuble-là — les murs le repoussent, comme avant.
 */
export function fitInNook(
  centre: Pt,
  box: { width: number; depth: number; yaw: number },
  walls: WallSeg[],
  outline?: Pt[],
): { width: number; depth: number; centre: Pt } {
  /** Jeu total laissé autour du meuble : un centimètre de chaque côté. */
  const JEU = 0.02;
  /** En deçà, ce n'est plus un ajustement mais une mutilation. */
  const MINI = 0.4;
  let p = { ...centre };
  if (outline && outline.length >= 3 && !insidePoly(p, outline)) {
    p = nearestOnRing(p, outline);
  }
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  const portee = (dx: number, dz: number) =>
    castToWall(p, { x: dx, z: dz }, walls) ?? Infinity;
  /** La cote tenable dans cet axe, et de combien il faut se recentrer. */
  const selon = (dx: number, dz: number, cote: number) => {
    const plus = portee(dx, dz);
    const moins = portee(-dx, -dz);
    const libre = plus + moins - JEU;
    if (!isFinite(libre) || libre >= cote) return { cote, glisse: 0 };
    if (libre < Math.max(MINI, cote * 0.45)) return { cote, glisse: 0 };
    // Le meuble se centre dans sa niche : sans ça il resterait collé au
    // mur que le doigt visait, et l'autre bord baîllerait.
    return { cote: libre, glisse: (plus - moins) / 2 };
  };
  const large = selon(cos, sin, box.width);
  const profond = selon(-sin, cos, box.depth);
  return {
    width: large.cote,
    depth: profond.cote,
    centre: {
      x: p.x + cos * large.glisse - sin * profond.glisse,
      z: p.z + sin * large.glisse + cos * profond.glisse,
    },
  };
}

/** Une emprise au sol : centre, cotes, orientation — et son étage. */
export interface Emprise {
  cx: number;
  cz: number;
  width: number;
  depth: number;
  yaw: number;
  /**
   * L'ÉTAGE QU'IL OCCUPE : du sol à son dessus.
   *
   * Deux meubles peuvent partager la même place au sol — une télé sur un
   * meuble bas, une lampe sur une commode. Ils ne peuvent pas partager le
   * même VOLUME : une table qui traverse un canapé n'existe pas. C'est
   * l'altitude qui fait la différence, et c'est elle qu'on regarde.
   */
  y0?: number;
  y1?: number;
}

/** Une emprise au sol : centre, cotes, orientation. */
export interface Emprise {
  cx: number;
  cz: number;
  width: number;
  depth: number;
  yaw: number;
}

/**
 * DEUX MEUBLES BORD À BORD SE CALENT L'UN CONTRE L'AUTRE.
 *
 * Relevé du chantier, en deux temps. D'abord : « empêche la superposition de
 * meubles ». Puis, après essai : « n'empêche pas la superposition, car un
 * meuble peut être AU-DESSUS de l'autre — garde juste une légère attraction
 * quand ils sont bord à bord ». Il a raison, et c'est un rappel utile : une
 * télé sur un meuble bas, une lampe sur une commode, un plan de travail
 * au-dessus d'un lave-vaisselle — l'emprise au sol ne dit rien de l'altitude,
 * et refuser le chevauchement interdirait la moitié des poses réelles.
 *
 * Il ne reste donc que l'AIMANT : quand deux meubles se manquent de quelques
 * centimètres, on referme le jour. C'est le geste qu'on ferait sur place, et
 * c'est ce qui rend un alignement propre sans viser au millimètre. Deux
 * meubles franchement l'un sur l'autre, eux, ne sont pas touchés.
 */
export function pushOutOfObjects(
  centre: Pt,
  box: { width: number; depth: number; yaw: number; y0?: number; y1?: number },
  autres: Emprise[],
  /**
   * REFERMER LE DERNIER JOUR, OU NON.
   *
   * À la flèche, oui : on avance au centimètre, et un jour de trois
   * centimètres entre deux meubles vient du pas, pas d'une intention.
   *
   * AU DOIGT, NON — relevé du patron : « enlève l'attraction mais mets une
   * collision intelligente ». Une collision REFUSE une place impossible ;
   * elle ne déplace pas ce qui tenait déjà. Le jour lâché est le jour gardé,
   * comme contre un mur.
   */
  aimant = true,
): Pt {
  /** Deux meubles se gêlent-ils vraiment, c'est-à-dire au même étage ? */
  const memeEtage = (o: Emprise) => {
    if (box.y0 === undefined || o.y0 === undefined) return true;
    const bas = Math.max(box.y0, o.y0);
    const haut = Math.min(box.y1 ?? box.y0, o.y1 ?? o.y0);
    // Cinq centimètres de recouvrement : en deçà, l'un est POSÉ sur l'autre,
    // et c'est une pose parfaitement légitime.
    return haut - bas > 0.05;
  };
  /** Jour refermé sans discuter, comme contre un mur. */
  const AIMANT = 0.04;
  let p = { ...centre };
  const demi = (e: { width: number; depth: number; yaw: number }, n: Pt) =>
    Math.abs(Math.cos(e.yaw) * n.x + Math.sin(e.yaw) * n.z) * (e.width / 2) +
    Math.abs(-Math.sin(e.yaw) * n.x + Math.cos(e.yaw) * n.z) * (e.depth / 2);
  /*
    DEUX PASSES : ON AIMANTE, PUIS ON SÉPARE.

    Relevé du chantier : « le magnétisme de meubles à meubles est mal calculé,
    celui-ci rentre dans le meuble sur lequel on est aimanté ». C'était vrai, et
    l'ordre en était la cause : l'aimant refermait un jour de trois centimètres
    avec le voisin de gauche, ce qui poussait le meuble de trois centimètres
    DANS celui de droite — et plus personne ne revenait vérifier.

    La seconde passe ne fait que séparer : elle ne peut donc pas créer de
    nouveau chevauchement, et le meuble finit toujours À TOUCHE-TOUCHE plutôt
    que dedans.
  */
  for (let passe = 0; passe < 2; passe++)
  for (const o of autres) {
    const gene = memeEtage(o);
    const axes: Pt[] = [];
    for (const n of [
      { x: Math.cos(box.yaw), z: Math.sin(box.yaw) },
      { x: -Math.sin(box.yaw), z: Math.cos(box.yaw) },
      { x: Math.cos(o.yaw), z: Math.sin(o.yaw) },
      { x: -Math.sin(o.yaw), z: Math.cos(o.yaw) },
    ]) {
      // Deux meubles alignés donnent quatre fois les deux mêmes directions :
      // garder les doublons ferait croire à deux axes séparateurs là où il
      // n'y en a qu'un, et l'aimant ne prendrait jamais.
      if (axes.some((m) => Math.abs(m.x * n.x + m.z * n.z) > 0.999)) continue;
      axes.push(n);
    }
    const jeux = axes.map((n) => {
      const d = (p.x - o.cx) * n.x + (p.z - o.cz) * n.z;
      return { n, d, jeu: Math.abs(d) - demi(box, n) - demi(o, n) };
    });
    const separateurs = jeux.filter((a) => a.jeu > 0);
    /*
      AUCUN AXE QUI SÉPARE : ils se chevauchent.

      Permis s'ils sont à des étages différents — une télé sur un meuble bas.
      Interdit au même étage : le chantier l'a filmé, « il doit être impossible
      qu'une table rentre en collision avec un canapé ». On ressort alors par
      le côté le plus court — le geste naturel, celui qui dérange le moins la
      position visée.
    */
    if (separateurs.length === 0) {
      if (!gene) continue;
      let sortie = jeux[0];
      for (const a of jeux) if (a.jeu > sortie.jeu) sortie = a;
      const sens = sortie.d >= 0 ? 1 : -1;
      p = {
        x: p.x + sortie.n.x * sens * -sortie.jeu,
        z: p.z + sortie.n.z * sens * -sortie.jeu,
      };
      continue;
    }
    /*
      UN SEUL AXE QUI SÉPARE : ils sont CÔTE À CÔTE, et le jeu qui reste est un
      vrai jour — celui qu'on referme. Deux ou plus : ils se manquent par un
      coin, en diagonale ; les aimanter les ferait sauter de travers.
    */
    // L'aimant ne joue qu'à la première passe : la seconde ne fait que
    // séparer ce que la première a pu rapprocher de trop.
    if (!aimant || passe > 0 || separateurs.length !== 1) continue;
    const a = separateurs[0];
    if (a.jeu >= AIMANT) continue;
    const sens = a.d >= 0 ? 1 : -1;
    p = { x: p.x - a.n.x * sens * a.jeu, z: p.z - a.n.z * sens * a.jeu };
  }
  return p;
}

/**
 * LES MEUBLES QUI SE CHEVAUCHENT, tels qu'ils sont — revue « Théo » : le
 * rouge ne paraissait que pendant le geste ; une chaise lâchée 57 cm dans la
 * table, deux chevets entrés l'un dans l'autre restaient ainsi, sans rien
 * pour le dire. Deux meubles se chevauchent quand aucun axe ne les sépare à
 * `seuil` près (deux centimètres : deux meubles qui se touchent ne se
 * chevauchent pas), et qu'ils partagent un même volume en hauteur (la télé
 * posée sur le meuble bas ne compte pas).
 */
export function meublesQuiSeChevauchent(
  objets: {
    id: string;
    cx: number;
    cz: number;
    width: number;
    depth: number;
    yaw: number;
    y0: number;
    y1: number;
    category?: string;
  }[],
  seuil = 0.02,
): [string, string][] {
  /*
    UNE CHAISE SE RANGE SOUS LA TABLE : le fauteuil du bureau d'exemple y
    entrait de quinze centimètres, et le plan s'accusait lui-même. Jusqu'à
    trente centimètres sous une table ou un bureau, une chaise est rangée ;
    au-delà (la chaise de Théo, 57 cm), elle est dedans.
  */
  const RANGEE_SOUS_LA_TABLE = 0.3;
  const sousLaTable = (x: (typeof objets)[number], y: (typeof objets)[number]) =>
    x.category === 'chair' && y.category === 'table';
  const demi = (e: (typeof objets)[number], n: Pt) =>
    Math.abs(Math.cos(e.yaw) * n.x + Math.sin(e.yaw) * n.z) * (e.width / 2) +
    Math.abs(-Math.sin(e.yaw) * n.x + Math.cos(e.yaw) * n.z) * (e.depth / 2);
  const out: [string, string][] = [];
  for (let i = 0; i < objets.length; i++) {
    for (let j = i + 1; j < objets.length; j++) {
      const a = objets[i];
      const b = objets[j];
      if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) < 0.05) continue;
      const axes = [a.yaw, b.yaw].flatMap((t) => [
        { x: Math.cos(t), z: Math.sin(t) },
        { x: -Math.sin(t), z: Math.cos(t) },
      ]);
      const tolere = sousLaTable(a, b) || sousLaTable(b, a) ? RANGEE_SOUS_LA_TABLE : seuil;
      const separe = axes.some((n) => {
        const d = Math.abs((b.cx - a.cx) * n.x + (b.cz - a.cz) * n.z);
        return d - demi(a, n) - demi(b, n) > -tolere;
      });
      if (!separe) out.push([a.id, b.id]);
    }
  }
  return out;
}

/**
 * DÉSENCHÊTRER LE RELEVÉ — quand deux meubles occupent le même volume.
 *
 * Le scanner rend des boîtes, et il lui arrive de les faire se traverser : sur
 * le modèle, une table passe alors DANS un canapé. Le chantier l'a filmé, et a
 * tranché : « il doit être impossible qu'une table rentre en collision avec un
 * canapé ».
 *
 * Je l'ai d'abord déconseillé, et je maintiens la réserve : déplacer un meuble
 * que le scanner a placé, c'est MODIFIER LE RELEVÉ. On limite donc les dégâts à
 * trois règles :
 *
 *   — on ne sépare que les chevauchements FRANCS : cinq centimètres de
 *     pénétration au sol, et cinq en hauteur. En deçà, c'est l'imprécision
 *     ordinaire d'un relevé à la caméra, et l'on n'y touche pas ;
 *   — seul le PLUS PETIT des deux bouge : c'est celui dont la position est la
 *     moins sûre, et le déplacer dérange le moins le dessin ;
 *   — on ne pousse jamais plus que la pénétration, par le côté le plus court.
 *
 * Deux meubles à des étages différents — une télé sur un meuble bas — ne se
 * gênent pas : ils partagent la place au sol, pas le volume.
 */
export function separerMeubles<
  T extends { cx: number; cz: number; width: number; depth: number; yaw: number; y0: number; y1: number; category?: string },
>(objets: T[]): { index: number; dx: number; dz: number }[] {
  const FRANC = 0.05;
  const bouges = objets.map(() => ({ dx: 0, dz: 0 }));
  const demi = (e: T, n: Pt) =>
    Math.abs(Math.cos(e.yaw) * n.x + Math.sin(e.yaw) * n.z) * (e.width / 2) +
    Math.abs(-Math.sin(e.yaw) * n.x + Math.cos(e.yaw) * n.z) * (e.depth / 2);
  /*
    L'ÉVIER EST DANS SON MEUBLE — revue « Amandine » : l'évier et la plaque,
    que RoomPlan rend en boîtes dans le plan de travail, étaient « séparés »
    du meuble qui les porte et éjectés de 57 cm à travers le mur. Un
    appareil tout entier dans l'emprise d'un rangement y est encastré : on
    ne les sépare pas.
  */
  const ENCASTRABLE = /sink|stove|cooktop|oven|dishwasher|washer|dryer|refrigerator/i;
  const coins = (e: T) => {
    const c = Math.cos(e.yaw);
    const s = Math.sin(e.yaw);
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([u, v]) => ({
      x: e.cx + c * (e.width / 2) * u - s * (e.depth / 2) * v,
      z: e.cz + s * (e.width / 2) * u + c * (e.depth / 2) * v,
    }));
  };
  const dedans = (p: Pt, e: T, marge: number) => {
    const c = Math.cos(e.yaw);
    const s = Math.sin(e.yaw);
    const dx = p.x - e.cx;
    const dz = p.z - e.cz;
    return Math.abs(dx * c + dz * s) <= e.width / 2 + marge && Math.abs(-dx * s + dz * c) <= e.depth / 2 + marge;
  };
  const encastre = (a: T, b: T) =>
    (ENCASTRABLE.test(a.category ?? '') && /storage|cabinet/i.test(b.category ?? '') && coins(a).every((p) => dedans(p, b, 0.05))) ||
    (ENCASTRABLE.test(b.category ?? '') && /storage|cabinet/i.test(a.category ?? '') && coins(b).every((p) => dedans(p, a, 0.05)));
  // Trois passes : séparer deux meubles peut en rapprocher un troisième.
  for (let passe = 0; passe < 3; passe++) {
    for (let i = 0; i < objets.length; i++) {
      for (let j = i + 1; j < objets.length; j++) {
        const a = { ...objets[i], cx: objets[i].cx + bouges[i].dx, cz: objets[i].cz + bouges[i].dz };
        const b = { ...objets[j], cx: objets[j].cx + bouges[j].dx, cz: objets[j].cz + bouges[j].dz };
        if (encastre(a, b)) continue;
        // À des étages différents, ils ne se gênent pas.
        const haut = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (haut <= FRANC) continue;
        const axes: Pt[] = [];
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
        // Un axe qui sépare suffit : ils ne se traversent pas.
        if (jeux.some((x) => x.jeu > -FRANC)) continue;
        // La sortie la plus courte.
        let sortie = jeux[0];
        for (const x of jeux) if (x.jeu > sortie.jeu) sortie = x;
        const sens = sortie.d >= 0 ? 1 : -1;
        const pousse = -sortie.jeu;
        // Le plus petit cède : sa position est la moins sûre.
        const petit = a.width * a.depth <= b.width * b.depth ? i : j;
        const signe = petit === i ? sens : -sens;
        bouges[petit].dx += sortie.n.x * signe * pousse;
        bouges[petit].dz += sortie.n.z * signe * pousse;
      }
    }
  }
  return bouges
    .map((b, index) => ({ index, dx: b.dx, dz: b.dz }))
    .filter((b) => Math.hypot(b.dx, b.dz) > 1e-6);
}

/*
  ============================================================================
  TROIS AIDES RETIRÉES DU SERVICE — et gardées comme relevé.

  `alignToFit` (le quart de tour qui fait entrer), `fitInNook` (le rabotage à
  la place disponible) et `hugWall` (le plaquage au nu) ont gouverné le
  placement des meubles pendant un an. Elles ont été retirées du doigt
  d'abord — « elles font glisser le meuble tout seul » —, puis de la flèche :
  « oui comme le doigt pour les flèches ». Plus AUCUN chemin ne les appelle.

  La mesure qui a emporté la décision : une commode de 1,40 m poussée à la
  flèche dans une alcôve de 1,20 m en ressortait rabotée à 1,04 m. Le
  rabotage était réversible — au large, le meuble retrouvait ses cotes — mais
  entre-temps c'est une commode de 1,04 m qui partait sur le PDF, sur un plan
  qui sert à commander du meuble.

  ELLES RESTENT ICI, ET C'EST VOLONTAIRE : leurs bancs (`recoin`) sont le
  relevé de ce que l'application a fait, et la référence si la décision
  devait s'inverser. Les supprimer effacerait ce raisonnement du dépôt. Ne
  pas les rebrancher sans un relevé du patron.
  ============================================================================
*/
/**
 * UN MEUBLE DE BIAIS QUI NE PASSE PAS SE REMET DROIT.
 *
 * Relevé du chantier, vidéo à l'appui : « le meuble, plus petit que
 * l'emplacement, ne rentre pas ». Il n'y avait pourtant pas de bug — le
 * meuble était posé EN LOSANGE, à quarante-cinq degrés des murs, et un carré
 * de biais occupe sa DIAGONALE : soixante-deux centimètres en encombrent
 * quatre-vingt-huit. L'alcôve, elle, n'en offrait pas tant.
 *
 * La géométrie a raison, mais l'application doit résoudre ça à la place de
 * l'électricien plutôt que de le laisser deviner : si le meuble ne tient pas
 * à son angle et qu'il tiendrait ALIGNÉ sur les murs, on le redresse. On
 * essaie d'abord le quart de tour le plus proche de son angle actuel : un
 * meuble redressé doit rester orienté comme on l'avait mis, à l'équerre
 * près.
 *
 * Et seulement s'il ne tient pas : un meuble volontairement de biais AU
 * LARGE n'est jamais touché.
 */
export function alignToFit(
  centre: Pt,
  box: { width: number; depth: number; yaw: number },
  walls: WallSeg[],
  inside: Pt,
  outline?: Pt[],
  depuis?: Pt,
): number {
  /**
   * Le meuble TIENT-IL là, à cet angle et à cette taille ?
   *
   * Non pas « le mur l'arrête-t-il » — un meuble poussé contre une cloison est
   * arrêté, et c'est très bien ainsi : personne ne veut qu'on lui redresse un
   * lit parce qu'il l'a glissé jusqu'au mur. La question est de savoir si,
   * une fois la poussée faite, il reste des murs QUI LE CHEVAUCHENT : deux
   * cloisons qui se font face à moins que son emprise se le renvoient sans
   * fin, et c'est là seulement qu'il ne passe pas.
   */
  const tient = (
    yaw: number,
    w = box.width,
    d = box.depth,
    depart: Pt = centre,
  ) => {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const p = pushOutOfWalls(
      depart,
      { width: w, depth: d, yaw },
      walls,
      inside,
      outline,
      depuis,
    );
    for (const wall of walls) {
      const len = segLength(wall);
      if (len < 1e-6) continue;
      const u = { x: (wall.b.x - wall.a.x) / len, z: (wall.b.z - wall.a.z) / len };
      const t = ((p.x - wall.a.x) * u.x + (p.z - wall.a.z) * u.z) / len;
      if (t < -0.15 || t > 1.15) continue;
      const n = perpOf(u);
      const demi =
        Math.abs((cos * n.x + sin * n.z) * (w / 2)) +
        Math.abs((-sin * n.x + cos * n.z) * (d / 2));
      const dist = Math.abs((p.x - wall.a.x) * n.x + (p.z - wall.a.z) * n.z);
      // Un centimètre de tolérance : c'est le jeu que laisse la poussée.
      if (dist < demi + epaisseurDe(wall) / 2 - 0.01) return false;
    }
    return true;
  };
  if (tient(box.yaw)) return box.yaw;
  /** Les angles des murs, ramenés au quart de tour le plus proche du sien. */
  const candidats: number[] = [];
  for (const w of walls) {
    const len = segLength(w);
    if (len < 1e-6) continue;
    const dir = Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x);
    const k = Math.round((box.yaw - dir) / (Math.PI / 2));
    const yaw = dir + k * (Math.PI / 2);
    if (candidats.some((c) => Math.abs(c - yaw) < 0.02)) continue;
    candidats.push(yaw);
  }
  candidats.sort((a, b) => Math.abs(a - box.yaw) - Math.abs(b - box.yaw));
  for (const yaw of candidats) {
    // Inutile de redresser d'un cheveu : ce n'est pas l'angle qui bloque.
    if (Math.abs(yaw - box.yaw) < 0.02) continue;
    if (tient(yaw)) return yaw;
  }
  /*
    ET SI RIEN NE TIENT À SA TAILLE, ON REDRESSE ET ON RABOTE ENSEMBLE.

    Relevé du chantier, capture à l'appui : « j'ai essayé de rentrer le meuble
    dans un coin, il se met en biais et ne s'adapte pas à la forme de ce coin ».
    C'était logique et c'était bête : on n'essayait les quarts de tour qu'à la
    COTE D'ORIGINE. Dans une niche plus petite que le meuble, aucun angle ne
    passe — alors on renonçait, et le meuble restait de travers dans un coin où
    il ne rentrait pas.

    Les deux gestes vont ensemble : d'équerre avec les murs, PUIS raboté à ce
    que la niche permet. On retient donc l'angle qui, une fois le meuble
    raboté, LE FAIT ENTRER — et parmi ceux-là, celui qui lui laisse la plus
    grande surface. Un meuble resté de biais garde sa taille, mais il ne
    rentre nulle part : ce n'est pas ce qu'on cherche.
  */
  /*
    ET UN MEUBLE QU'ON RABOTE SE MET D'ÉQUERRE, SANS EXCEPTION.

    Relevé du chantier : « en forçant un meuble trop gros dans un espace, il ne
    se met pas totalement d'équerre ». On laissait son angle d'origine
    concourir avec les quarts de tour, et il gagnait parfois — de biais, un
    meuble se rabote moins, donc il garde plus de surface. Mais un meuble
    raboté de travers dans un coin n'a aucun sens sur un plan : dès qu'on
    touche à ses cotes, il se range à l'équerre des murs. Son angle d'origine
    ne revient dans la course que s'il n'y a aucun mur à suivre.
  */
  let mieux = candidats.length > 0 ? candidats[0] : box.yaw;
  let meilleure = -1;
  let entre = false;
  for (const yaw of candidats.length > 0 ? candidats : [box.yaw]) {
    const a = fitInNook(centre, { ...box, yaw }, walls, outline);
    const ok = tient(yaw, a.width, a.depth, a.centre);
    const aire = a.width * a.depth;
    if (ok && (!entre || aire > meilleure + 1e-4)) {
      entre = true;
      meilleure = aire;
      mieux = yaw;
    } else if (!entre && aire > meilleure) {
      meilleure = aire;
      mieux = yaw;
    }
  }
  return mieux;
}

/**
 * UN MEUBLE LÂCHÉ PRÈS D'UN MUR S'Y PLAQUE.
 *
 * Personne ne pose une commode à trois centimètres du mur : soit elle y est
 * appuyée, soit elle est ailleurs. Le doigt, lui, ne vise pas au millimètre,
 * et le plan gardait ces jours-là — invisibles à l'écran, mais bien réels
 * quand on cote une prise derrière le meuble ou qu'on calcule un
 * dégagement.
 *
 * On ne referme QUE les petits jours (cinq centimètres), et seulement contre
 * un mur que le meuble longe déjà à peu près parallèlement : un meuble posé
 * de biais est un choix, pas une erreur de visée. Une seule correction par
 * axe, la plus petite : dans un angle, le meuble se cale contre les deux
 * murs sans jamais partir en diagonale.
 */
export function hugWall(
  centre: Pt,
  box: { width: number; depth: number; yaw: number },
  walls: WallSeg[],
  inside: Pt,
  /** D'où vient le meuble : même raison que dans `pushOutOfWalls`. */
  depuis?: Pt,
): Pt {
  /** Le jour qu'on referme sans discuter. */
  const JOUR = 0.05;
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  let p = { ...centre };
  for (let passe = 0; passe < 2; passe++) {
    let mieux: { n: Pt; jeu: number } | undefined;
    for (const w of walls) {
      const len = segLength(w);
      if (len < 1e-6) continue;
      const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
      let n = perpOf(u);
      const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      // Même règle que pour la poussée : le côté où le meuble se trouve.
      const versIci = (p.x - w.a.x) * n.x + (p.z - w.a.z) * n.z;
      const versDepart = depuis
        ? (depuis.x - w.a.x) * n.x + (depuis.z - w.a.z) * n.z
        : 0;
      const sens =
        Math.abs(versIci) > epaisseurDe(w) / 2
          ? versIci
          : depuis && Math.abs(versDepart) > epaisseurDe(w) / 2
            ? versDepart
            : (inside.x - mid.x) * n.x + (inside.z - mid.z) * n.z;
      if (sens < 0) {
        n = { x: -n.x, z: -n.z };
      }
      // Le meuble longe-t-il ce mur ? On compare leurs directions : au-delà
      // de douze degrés, il est de biais, et c'est voulu.
      const versU = Math.abs(cos * u.x + sin * u.z);
      const versV = Math.abs(-sin * u.x + cos * u.z);
      if (Math.max(versU, versV) < Math.cos((12 * Math.PI) / 180)) continue;
      const t = ((p.x - w.a.x) * u.x + (p.z - w.a.z) * u.z) / len;
      if (t < 0 || t > 1) continue;
      const demi =
        Math.abs((cos * n.x + sin * n.z) * (box.width / 2)) +
        Math.abs((-sin * n.x + cos * n.z) * (box.depth / 2));
      const jeu =
        (p.x - w.a.x) * n.x + (p.z - w.a.z) * n.z - demi - epaisseurDe(w) / 2;
      if (jeu <= 1e-4 || jeu > JOUR) continue;
      if (!mieux || jeu < mieux.jeu) mieux = { n, jeu };
    }
    if (!mieux) break;
    p = { x: p.x - mieux.n.x * mieux.jeu, z: p.z - mieux.n.z * mieux.jeu };
  }
  return p;
}

/**
 * LE CÔTÉ QU'ON TIRE S'ACCROCHE AU MUR QU'IL LONGE.
 *
 * Étirer un meuble jusqu'au mur À LA MAIN, c'est viser trois millimètres
 * avec un doigt qui en couvre quinze : on s'arrête à deux centimètres, ou on
 * traverse. Or « le meuble touche le mur » n'est pas un détail de dessin —
 * c'est ce qui décide qu'une prise est accessible ou condamnée.
 *
 * Le côté tiré se pose donc PILE sur le nu du mur dès qu'il en approche.
 * Trois conditions, et l'accroche est refusée si l'une manque :
 *
 * - le mur doit être PARALLÈLE au côté (douze degrés de tolérance, la même
 *   que le plaquage d'un meuble qu'on déplace) : un mur de biais ne donne
 *   pas d'affleurement ;
 * - le côté doit être EN FACE de lui, pas dans son prolongement — sans quoi
 *   la cloison d'en face, parallèle et lointaine, attirerait le côté à
 *   travers la pièce ;
 * - et l'écart doit tenir dans `PRISE`.
 *
 * ET L'AUTRE SENS : LE BOUT D'UN MUR QUI SE TERMINE.
 *
 * Relevé du chantier, capture à l'appui : « en haut du meuble, on est contre
 * une fin de mur et pourtant pas d'alignement avec notre fin de meuble ».
 * L'aimant ne connaissait que l'affleurement FACE À FACE — un bord contre le
 * nu d'un mur parallèle. Or on aligne tout autant un meuble sur l'ABOUT d'une
 * cloison : le retour d'un mur, le jambage d'une porte, le bout d'un refend.
 * Le meuble arrive alors À FLEUR du passage, et c'est ce qu'on cherche à
 * l'œil en poussant le meuble contre le coin.
 *
 * Le plan de l'about d'un mur PERPENDICULAIRE est parallèle au bord qu'on
 * tire : c'est donc une ligne d'accroche, exactement comme un nu.
 *
 * On rend le déplacement à appliquer AU CÔTÉ, le long de sa normale
 * sortante : zéro quand rien n'accroche.
 */
export function snapSideToWalls(
  /** Milieu du côté, à sa position visée. */
  bord: Pt,
  /** Normale sortante du côté (unitaire). */
  n: Pt,
  /** Demi-longueur du côté : de quoi savoir s'il est en face du mur. */
  demi: number,
  walls: WallSeg[],
  /** Portée de l'aimant (m). */
  prise = 0.07,
): number {
  // La direction du côté : perpendiculaire à sa normale.
  const t = { x: -n.z, z: n.x };
  let meilleur = 0;
  let ecartMin = Infinity;
  /** Retient le meilleur écart, tous candidats confondus. */
  const proposer = (ecart: number) => {
    if (Math.abs(ecart) > prise) return;
    if (Math.abs(ecart) < ecartMin) {
      ecartMin = Math.abs(ecart);
      meilleur = ecart;
    }
  };
  const DOUZE = Math.cos((12 * Math.PI) / 180);

  for (const w of walls) {
    const len = segLength(w);
    if (len < 1e-6) continue;
    const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
    /*
      MUR PERPENDICULAIRE : c'est son BOUT qui donne la ligne.

      Le plan de l'about est perpendiculaire à l'axe du mur, donc parallèle
      au bord qu'on tire. Ses deux nus sont candidats : une cloison a une
      épaisseur, et l'on peut vouloir arriver à fleur d'un côté comme de
      l'autre.
    */
    if (Math.abs(u.x * n.x + u.z * n.z) >= DOUZE) {
      for (const bout of [w.a, w.b]) {
        // Le bout doit être EN REGARD du côté, pas à l'autre bout de la
        // pièce : sans quoi une cloison lointaine, mais bien orientée,
        // tirerait le meuble à travers le logement.
        const lateral = (bout.x - bord.x) * t.x + (bout.z - bord.z) * t.z;
        if (Math.abs(lateral) > demi + 0.4) continue;
        // Le point d'extrémité EST le nu de l'about : la maçonnerie d'un
        // mur libre s'arrête là, elle ne déborde pas d'une demi-épaisseur.
        // Proposer aussi des lignes décalées créerait des accroches
        // fantômes à sept centimètres du seul endroit qui existe.
        proposer((bout.x - bord.x) * n.x + (bout.z - bord.z) * n.z);
      }
    }
    // Parallèles ? On compare les directions, au signe près.
    if (Math.abs(u.x * t.x + u.z * t.z) < DOUZE) continue;
    const nw = perpOf(u);
    // Le nu du mur qui regarde le côté : l'axe, décalé d'une demi-épaisseur
    // du bon côté. C'est cette face-là qu'on affleure, pas l'axe.
    const versBord = (bord.x - w.a.x) * nw.x + (bord.z - w.a.z) * nw.z;
    const face = {
      x: w.a.x + nw.x * (versBord >= 0 ? epaisseurDe(w) / 2 : -epaisseurDe(w) / 2),
      z: w.a.z + nw.z * (versBord >= 0 ? epaisseurDe(w) / 2 : -epaisseurDe(w) / 2),
    };
    // Écart du côté au nu, mesuré le long de la normale du côté.
    const long = (face.x - bord.x) * n.x + (face.z - bord.z) * n.z;
    if (Math.abs(long) > prise) continue;
    // En face de lui, et non dans son prolongement : la projection du côté
    // sur le mur doit mordre sur le segment.
    const c = (bord.x - w.a.x) * u.x + (bord.z - w.a.z) * u.z;
    if (c < -demi || c > len + demi) continue;
    proposer(long);
  }
  return meilleur;
}

/** Point du contour le plus proche : la sortie de secours d'un point égaré. */
export function nearestOnRing(p: Pt, ring: Pt[]): Pt {
  let best = ring[0];
  let d2 = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2));
    const q = { x: a.x + ex * t, z: a.z + ez * t };
    const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (dd < d2) {
      d2 = dd;
      best = q;
    }
  }
  return best;
}

/** Point dans un polygone (lancer de rayon), sans dépendre d'`appearance`. */
function insidePoly(p: Pt, ring: Pt[]): boolean {
  let dans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    ) {
      dans = !dans;
    }
  }
  return dans;
}

/** Un meuble tient-il dans une pièce, quel que soit son angle ? */
export function fitsInRoom(
  box: { width: number; depth: number },
  outline: Pt[],
): boolean {
  if (outline.length < 3) return true;
  const e = roomExtent(outline);
  const petit = Math.min(box.width, box.depth);
  const grand = Math.max(box.width, box.depth);
  const dispoPetit = Math.min(e.width, e.depth) - WALL_T;
  const dispoGrand = Math.max(e.width, e.depth) - WALL_T;
  return petit <= dispoPetit && grand <= dispoGrand;
}

export function quadPoints(q: WallQuad): Pt[] {
  return [q.a1, q.b1, q.b2, q.a2];
}

// -------------------------------------------------------- surface au sol

export interface RoomSurface {
  /** Contour de la pièce (polygone fermé, sens quelconque). */
  pts: Pt[];
  /**
   * LE CONTOUR AU NU, pour une pièce DESSINÉE : ses côtés rentrés d'une
   * demi-épaisseur de leur mur. C'est lui que mesure l'aire (voir
   * `makePart`). Absent d'une pièce scannée, comptée à l'axe tant que la
   * mesure au mètre ruban n'a pas tranché.
   */
  nu?: Pt[];
  /** Aire en m² — au nu pour une pièce dessinée, à l'axe sinon. */
  area: number;
  /** false = la boucle de murs n'était pas fermée, le contour est reconstitué. */
  exact: boolean;
}

/**
 * Contour et surface au sol de la pièce.
 * Boucle fermée → contour exact. Sinon, la plus longue chaîne de murs est
 * refermée sur elle-même : la surface reste indicative (`exact: false`).
 */
export function roomSurface(walls: WallSeg[]): RoomSurface | null {
  const loop = closedLoop(walls);
  if (loop) return { pts: loop, area: loopAreaM2(loop), exact: true };

  const chain = longestChain(walls);
  if (chain.length < 3) return null;
  return { pts: chain, area: loopAreaM2(chain), exact: false };
}

/** Une pièce du plan : ses murs, son contour au sol, son centre. */
export interface RoomPart {
  roomId: string;
  walls: WallSeg[];
  /** Sa hauteur sous plafond à elle, si la pièce en a une (faux plafond). */
  hauteur?: number;
  surface: RoomSurface | null;
  centroid: Pt;
  /** Où poser le cartouche : au large, jamais dans un mur ni contre lui. */
  labelAt: Pt;
}

/** Une pièce DESSINÉE : tous ses murs ont été tracés aux cotes intérieures (`auNu`). */
export function estDessine(walls: { auNu?: boolean }[]): boolean {
  return walls.length > 0 && walls.every((w) => w.auNu === true);
}

/**
 * LE CONTOUR AU NU — chaque côté du contour à l'axe, rentré d'une
 * demi-épaisseur de SON mur, et les coins recoupés.
 *
 * Décision du patron, revues « Hugo » et « Lucas » : un plan dessiné aux
 * cotes se compte à l'intérieur des murs, cloisons déduites, pour que ses
 * m² se comparent au bail et que la peinture ne compte pas la maçonnerie.
 */
export function contourAuNu(
  pts: Pt[],
  walls: WallSeg[],
  /** Le demi-mur de chaque côté : par défaut, la moitié de son épaisseur. */
  demi: (mur: WallSeg | undefined) => number = (mur) => (mur ? epaisseurDe(mur) : WALL_T) / 2,
): Pt[] {
  const n = pts.length;
  if (n < 3) return pts;
  let double = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    double += p.x * q.z - q.x * p.z;
  }
  const sens = double > 0 ? 1 : -1;
  const cotes = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    const d = { x: (q.x - p.x) / L, z: (q.z - p.z) / L };
    // Vers l'intérieur : la gauche d'un contour tourné dans le sens direct.
    const nrm = { x: -d.z * sens, z: d.x * sens };
    const mur = walls.find(
      (w) =>
        w.type === 'wall' &&
        pointOnSeg(p, w.a, w.b).dist < 0.02 &&
        pointOnSeg(q, w.a, w.b).dist < 0.02,
    );
    const h = demi(mur);
    return { o: { x: p.x + nrm.x * h, z: p.z + nrm.z * h }, d, nrm, h };
  });
  const out: Pt[] = [];
  for (let j = 0; j < n; j++) {
    const a = cotes[(j - 1 + n) % n];
    const b = cotes[j];
    const den = a.d.x * b.d.z - a.d.z * b.d.x;
    if (Math.abs(den) < 1e-9) {
      // Deux côtés dans l'alignement : un ressaut si les épaisseurs diffèrent.
      const p = pts[j];
      if (Math.abs(a.h - b.h) > 1e-6) out.push({ x: p.x + a.nrm.x * a.h, z: p.z + a.nrm.z * a.h });
      out.push({ x: p.x + b.nrm.x * b.h, z: p.z + b.nrm.z * b.h });
      continue;
    }
    const t = ((b.o.x - a.o.x) * b.d.z - (b.o.z - a.o.z) * b.d.x) / den;
    out.push({ x: a.o.x + a.d.x * t, z: a.o.z + a.d.z * t });
  }
  return out;
}

/** Largeur et profondeur d'une pièce : au nu si elle est dessinée, à l'axe sinon. */
export function etendueDeLaPiece(surface: RoomSurface): ReturnType<typeof roomExtent> {
  return roomExtent(surface.nu ?? surface.pts);
}

/** La longueur d'un mur de nu à nu : l'axe, moins le demi-mur qui le ferme à chaque bout. */
export function longueurAuNu(walls: WallSeg[], w: WallSeg): number {
  return Math.max(0, segLength(w) - retraitDuCoin(walls, w, w.a) - retraitDuCoin(walls, w, w.b));
}

/**
 * LA COTE D'UN MUR TELLE QU'ON LA LIT SUR LE PLAN : au nu s'il est dessiné.
 *
 * Lue d'abord SUR LA PIÈCE QU'IL BORDE — revue « Karim » : retirer un
 * demi-mur à chaque bout ne vaut que pour un angle droit vu de l'intérieur.
 * Sur un retour rentrant (le L), un pan coupé, un bow-window, la face est
 * plus longue ou plus courte que ça : 2,36 s'affichait pour une face de
 * 2,50, 0,918 pour un pan coupé de 1,000. Le côté du contour au nu de la
 * pièce (`contourAuNu`) EST la face : on le prend tel quel. Sans pièce
 * dessinée qui la porte, le calcul d'angle droit.
 */
export function longueurCotee(
  walls: WallSeg[],
  w: WallSeg,
  parts?: ({ surface: RoomSurface | null; walls?: WallSeg[] })[],
): number {
  /*
    UN PLAN SCANNÉ SE COTE AU NU DE SES REFENDS AUSSI — revue « Hélène » :
    le refend vu de ses deux faces est posé sur son axe ; la façade qui le
    rejoint se cotait jusqu'à cet axe — 6,01 m quand le métré, au nu, disait
    5,80. Quand la pièce a un contour au nu, la cote d'un mur scanné est le
    côté de ce contour qui court sur lui : sa face, de nu à nu.
  */
  const auNuDuScan =
    !w.auNu &&
    !!parts?.some((p) => !!p.surface?.nu && (!p.walls || p.walls.some((x) => x.id === w.id)));
  if (!w.auNu && !auNuDuScan) return segLength(w);
  const L = segLength(w);
  if (parts && L > 1e-6) {
    const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
    // La face d'un mur scanné est son trait ; celle d'un refend vu des deux
    // faces, ou d'un mur dessiné, est à une demi-épaisseur.
    const h = w.auNu || w.deuxFaces ? epaisseurDe(w) / 2 : 0;
    let face = 0;
    for (const part of parts) {
      const nu = part.surface?.nu;
      if (!nu || nu.length < 3) continue;
      if (part.walls && !part.walls.some((x) => x.id === w.id)) continue;
      for (let i = 0; i < nu.length; i++) {
        const a = nu[i];
        const b = nu[(i + 1) % nu.length];
        const le = Math.hypot(b.x - a.x, b.z - a.z);
        if (le < 1e-6) continue;
        const ue = { x: (b.x - a.x) / le, z: (b.z - a.z) / le };
        if (Math.abs(u.x * ue.z - u.z * ue.x) > 1e-3) continue;
        const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const d = Math.abs((m.x - w.a.x) * u.z - (m.z - w.a.z) * u.x);
        if (Math.abs(d - h) > 0.02) continue;
        const t = ((m.x - w.a.x) * u.x + (m.z - w.a.z) * u.z) / L;
        if (t < -0.01 || t > 1.01) continue;
        face = Math.max(face, le);
      }
    }
    if (face > 0) return face;
  }
  return w.auNu ? longueurAuNu(walls, w) : L;
}

/** Complète une pièce : contour, centre, et point de pose du cartouche. */
function makePart(roomId: string, items: WallSeg[]): RoomPart {
  let surface = roomSurface(items);
  // Une pièce dessinée se compte au nu : voir `contourAuNu`.
  if (surface?.exact && estDessine(items)) {
    const nu = contourAuNu(surface.pts, items);
    /*
      LA CLOISON QUI NE FERME RIEN PREND AUSSI SA PLACE AU SOL — revue
      « Karim » : le retour de 0,60 en 10 cm d'une niche laissait la chambre
      à 10,20 m², alors que 6 dm² de sol sont sous la cloison. Un mur de la
      pièce dont le milieu tombe DANS le contour au nu est une cloison
      intérieure : on retire ce qu'elle couvre.
    */
    let area = loopAreaM2(nu);
    for (const w of items) {
      if (w.type !== 'wall') continue;
      if (!dansLeContour({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 }, nu)) continue;
      area -= longueurDedans(w.a, w.b, nu) * epaisseurDe(w);
    }
    surface = { ...surface, nu, area: Math.max(area, 0) };
  } else if (surface?.exact && items.some((w) => w.deuxFaces)) {
    /*
      UN PLAN SCANNÉ SE RELÈVE AUX FACES — sauf le mur vu des deux côtés,
      que la fusion a posé sur son axe (revue « Sébastien ») : la pièce
      reprend son demi-mur de ce côté-là, et ses 20,00 m² au laser.
    */
    const nu = contourAuNu(surface.pts, items, (mur) => (mur?.deuxFaces ? epaisseurDe(mur) / 2 : 0));
    surface = { ...surface, nu, area: Math.max(loopAreaM2(nu), 0) };
  }
  const centroid = wallsCentroid(items);
  return {
    roomId,
    walls: items,
    surface,
    centroid,
    labelAt: surface ? interiorPole(surface.pts) : centroid,
  };
}

/** Ce qu'il faut savoir d'une pièce pour la dessiner : ses murs. */
export interface RoomShape {
  id: string;
  /** Murs qui la bordent. Absent = anciens scans, on retombe sur `roomId`. */
  wallIds?: string[];
  /**
   * SA HAUTEUR SOUS PLAFOND À ELLE (m) — un faux plafond. Absente : celle de
   * ses murs. Voir `hauteurDeLaPiece`.
   */
  hauteur?: number;
}

/**
 * Découpe le plan en pièces. C'est LE point d'entrée du rendu multi-pièces :
 * plan 2D, vue 3D et PDF itèrent tous là-dessus, ce qui garantit que les
 * trois montrent les mêmes contours et les mêmes surfaces.
 *
 * La liste des murs vient de la pièce, pas l'inverse : un refend borde deux
 * pièces à la fois, il figure donc dans les deux listes. Faute de liste
 * (scans d'avant la détection automatique), on regroupe par `roomId`.
 */
/**
 * LE DÉCOUPAGE D'UNE PIÈCE SE GARDE tant que ses murs sont LES MÊMES OBJETS.
 *
 * `makePart` n'est pas gratuit : le pole du cartouche est une recherche sur
 * grille (169 essais puis descente), ~5 ms pour un T4 sur un ordinateur de
 * bureau. Or un mur qu'on fait GLISSER rejoue `roomParts` à chaque image —
 * sur un téléphone, ce seul calcul mange le budget d'une image, pour des
 * pièces dont aucun mur n'a bougé.
 *
 * Le magasin ne retouche jamais un mur en place, il le REMPLACE : « mêmes
 * objets, même compte » suffit donc à dire « même pièce ». La clé est
 * l'ENTRÉE de pièce elle-même (une `WeakMap`) : deux dossiers qui numérotent
 * tous deux « room-1 » ne peuvent pas se télescoper, et la mémoire part avec
 * les pièces qu'on ne regarde plus.
 */
const partsGardees = new WeakMap<
  RoomShape,
  { items: WallSeg[]; part: RoomPart }
>();

export function roomParts(walls: WallSeg[], rooms?: RoomShape[]): RoomPart[] {
  if (rooms && rooms.some((r) => r.wallIds)) {
    const byId = new Map(walls.map((w) => [w.id, w]));
    return rooms.map((r) => {
      const items = (r.wallIds ?? [])
        .map((id) => byId.get(id))
        .filter((w): w is WallSeg => !!w);
      const garde = partsGardees.get(r);
      if (
        garde &&
        // Les deux sens : un mur disparu change le compte, un mur remplacé
        // change la référence.
        garde.items.length === items.length &&
        garde.items.every((w, i) => w === items[i])
      ) {
        return garde.part;
      }
      const brute = makePart(r.id, items);
      // Son faux plafond d'abord, puis la hauteur que le LiDAR a lue.
      const h = r.hauteur ?? hauteurLue((r as { releve?: { plafond?: Parameters<typeof hauteurLue>[0] } | null }).releve?.plafond);
      const part = h ? { ...brute, hauteur: h } : brute;
      partsGardees.set(r, { items, part });
      return part;
    });
  }
  return groupByRoom(walls).map(({ roomId, items }) => makePart(roomId, items));
}

/**
 * LE NIVEAU DU SOL, DANS LE REPÈRE DU RELEVÉ — le pied le plus bas des murs.
 *
 * RoomPlan travaille dans le repère de sa session : le sol n'y est pas à
 * zéro (il est à hauteur de main sous le téléphone qui a lancé le scan). Les
 * murs portent leur pied ; les meubles, eux, n'ont qu'un centre — tout ce qui
 * compare la hauteur d'un meuble à celle d'un appareil doit l'en retrancher.
 * Le PDF le faisait déjà ; on l'écrit une fois, ici.
 */
export function solDesMurs(walls: readonly { yCenter: number; height: number; type?: string }[]): number {
  const pieds = walls.filter((w) => !w.type || w.type === 'wall').map((w) => w.yCenter - w.height / 2);
  return pieds.length > 0 ? Math.min(...pieds) : 0;
}

/**
 * LE TOUR DES PIÈCES (m) — la somme des contours, pas celle de tous les
 * murs : une cloison libre n'est le périmètre de personne.
 */
export function perimetreDesPieces(parts: RoomPart[]): number {
  let total = 0;
  for (const p of parts) {
    // Le tour intérieur : au nu des murs quand la pièce l'a.
    const pts = p.surface?.nu ?? p.surface?.pts;
    if (!pts || pts.length < 3) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      total += Math.hypot(b.x - a.x, b.z - a.z);
    }
  }
  return total;
}

/** Aire cumulée des pièces ; `exact` tombe dès qu'un contour est reconstitué. */
export function totalArea(
  parts: RoomPart[],
): { area: number; exact: boolean } | null {
  const known = parts.filter((p) => p.surface);
  if (known.length === 0) return null;
  return {
    area: known.reduce((s, p) => s + p.surface!.area, 0),
    exact: known.every((p) => p.surface!.exact),
  };
}

/** Plus longue suite de murs bout à bout (les coins sont déjà soudés). */
function longestChain(walls: WallSeg[]): Pt[] {
  const adj = new Map<string, { wallId: string; to: Pt }[]>();
  for (const w of walls) {
    for (const [from, to] of [
      [w.a, w.b],
      [w.b, w.a],
    ] as const) {
      const k = nodeKey(from);
      const l = adj.get(k) ?? [];
      l.push({ wallId: w.id, to });
      adj.set(k, l);
    }
  }
  let best: Pt[] = [];
  for (const w of walls) {
    for (const start of [w.a, w.b]) {
      const used = new Set<string>();
      const pts: Pt[] = [start];
      let cur = start;
      for (;;) {
        const next = (adj.get(nodeKey(cur)) ?? []).find(
          (e) => !used.has(e.wallId),
        );
        if (!next) break;
        used.add(next.wallId);
        cur = next.to;
        if (nodeKey(cur) === nodeKey(start)) break;
        pts.push(cur);
      }
      if (pts.length > best.length) best = pts;
    }
  }
  return best;
}

/** Distance d'un point au bord d'un polygone, négative à l'extérieur. */
function signedDistToEdge(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, pointOnSeg(p, poly[j], poly[i]).dist);
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside ? best : -best;
}

/**
 * Point le plus « au large » d'une pièce : celui qui maximise la distance au
 * mur le plus proche.
 *
 * Le barycentre ne convient pas — dans une pièce en L il tombe volontiers
 * dans le mur, ou juste contre. C'est pourtant là qu'on pose le nom de la
 * pièce et sa surface. On balaye donc une grille, puis on affine autour du
 * meilleur point tant que le pas dépasse la précision demandée.
 */
export function interiorPole(poly: Pt[], precision = 0.05): Pt {
  if (poly.length < 3) {
    return poly[0] ?? { x: 0, z: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const w = maxX - minX;
  const h = maxZ - minZ;
  let best = { x: minX + w / 2, z: minZ + h / 2 };
  let bestD = signedDistToEdge(best, poly);
  const N = 12;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = { x: minX + (w * i) / N, z: minZ + (h * j) / N };
      const d = signedDistToEdge(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  // Affinage : on descend le pas tant qu'il reste au-dessus de la précision.
  let step = Math.max(w, h) / N;
  while (step > precision) {
    let moved = false;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const p = { x: best.x + dx * step, z: best.z + dz * step };
      const d = signedDistToEdge(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
        moved = true;
      }
    }
    if (!moved) step /= 2;
  }
  return best;
}

/**
 * Cotes hors-tout d'une pièce : le plus petit rectangle qui la contient.
 *
 * On tourne le rectangle avec chaque côté du contour (rotating calipers) et
 * on garde le plus petit — une pièce scannée de biais ne doit pas être cotée
 * dans les axes de l'écran, mais dans les siens.
 */
export function roomExtent(pts: Pt[]): {
  width: number;
  depth: number;
  angle: number;
} {
  if (pts.length < 3) return { width: 0, depth: 0, angle: 0 };
  let best = { width: Infinity, depth: Infinity, angle: 0, area: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of pts) {
      const u = p.x * ux + p.z * uz;
      const v = -p.x * uz + p.z * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const w = maxU - minU;
    const d = maxV - minV;
    const area = w * d;
    if (area < best.area) {
      best = {
        width: Math.max(w, d),
        depth: Math.min(w, d),
        angle: Math.atan2(uz, ux),
        area,
      };
    }
  }
  if (!isFinite(best.area)) return { width: 0, depth: 0, angle: 0 };
  return { width: best.width, depth: best.depth, angle: best.angle };
}

/** Ouvertures posées sur les murs donnés (porte, fenêtre, baie). */
export function openingsOn(
  walls: WallSeg[],
  openings: WallSeg[],
  tol = 0.6,
): WallSeg[] {
  return openings.filter((o) => {
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    return walls.some((w) => pointOnSeg(mid, w.a, w.b).dist <= tol);
  });
}

/** Un tronçon coté le long d'un mur : retour de mur, porte, fenêtre, baie. */
export interface WallRun {
  kind: 'mur' | 'door' | 'window' | 'opening';
  /** Fractions de la longueur du mur, de a vers b. */
  t0: number;
  t1: number;
  /** Longueur du tronçon, en mètres. */
  length: number;
}

/**
 * Découpe un mur en tronçons cotés : retour de mur, baie, retour de mur.
 *
 * C'est ainsi qu'un plan d'architecte cote un mur percé — on n'écrit pas
 * seulement « 3,93 m », on écrit « 1,50 · 0,90 · 1,60 » pour qu'un menuisier
 * sache où tomber. Les tronçons de moins de 5 cm sont ignorés : ce sont des
 * résidus de détection, pas des retours de mur. Un mur plein ne renvoie
 * rien — sa cote globale suffit.
 */
export function wallRuns(
  wall: WallSeg,
  openings: WallSeg[],
  tol = 0.6,
): WallRun[] {
  const L = segLength(wall);
  if (L < 1e-6) return [];
  const dx = wall.b.x - wall.a.x;
  const dz = wall.b.z - wall.a.z;
  const len2 = dx * dx + dz * dz;
  const along = (p: Pt) =>
    ((p.x - wall.a.x) * dx + (p.z - wall.a.z) * dz) / len2;

  const holes: { t0: number; t1: number; kind: WallRun['kind'] }[] = [];
  for (const o of openings) {
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    if (pointOnSeg(mid, wall.a, wall.b).dist > tol) continue;
    const ol = segLength(o) || 1;
    // Parallèle au mur, sinon c'est l'ouverture d'un mur voisin.
    const dot =
      ((o.b.x - o.a.x) * dx + (o.b.z - o.a.z) * dz) / (ol * Math.sqrt(len2));
    if (Math.abs(dot) < 0.9) continue;
    const ta = along(o.a);
    const tb = along(o.b);
    const t0 = Math.max(0, Math.min(ta, tb));
    const t1 = Math.min(1, Math.max(ta, tb));
    if (t1 - t0 < 1e-3) continue;
    // Un mur ne perce pas un mur : seules les menuiseries comptent.
    if (o.type === 'wall') continue;
    holes.push({ t0, t1, kind: o.type });
  }
  holes.sort((a, b) => a.t0 - b.t0);

  const runs: WallRun[] = [];
  const push = (t0: number, t1: number, kind: WallRun['kind']) => {
    const l = (t1 - t0) * L;
    if (l > 0.05) runs.push({ kind, t0, t1, length: l });
  };
  let cursor = 0;
  for (const h of holes) {
    const t0 = Math.max(cursor, h.t0);
    const t1 = Math.max(t0, h.t1);
    if (t1 - t0 < 1e-4) continue;
    push(cursor, t0, 'mur');
    push(t0, t1, h.kind);
    cursor = t1;
  }
  push(cursor, 1, 'mur');
  return runs.length > 1 ? runs : [];
}

/**
 * Surface murale d'une pièce, déduction faite des portes et fenêtres.
 * C'est le chiffre qu'attend un peintre ou un poseur de revêtement.
 */
export function wallAreaM2(walls: WallSeg[], openings: WallSeg[]): number {
  const gross = walls.reduce((s, w) => s + segLength(w) * w.height, 0);
  const holes = openingsOn(walls, openings).reduce(
    (s, o) => s + segLength(o) * o.height,
    0,
  );
  return Math.max(0, gross - holes);
}

/** Hauteur sous plafond de la pièce : la plus courante parmi ses murs. */
export function roomHeight(walls: WallSeg[]): number {
  if (walls.length === 0) return 0;
  return Math.max(...walls.map((w) => w.height));
}

/**
 * LA HAUTEUR SOUS PLAFOND D'UNE PIÈCE — la sienne si elle en a une (un faux
 * plafond), sinon celle de ses murs. Revue « Claire » : un faux plafond à
 * 2,60 m dans le couloir abaissait les murs qu'il partageait avec le double
 * séjour (3,20 m) ; l'élévation du séjour disait « sous 2,60 m » et la 3D
 * laissait un vide de 60 cm. La hauteur est une donnée de la PIÈCE.
 */
/**
 * LA HAUTEUR QUE LE LIDAR A LUE — revues « Malik » et « Hélène » : le métré
 * prenait le plus haut des murs (2,60 m pour une chambre de 2,40, la cloison
 * vue depuis l'open space ; 3,32 pour un plafond à 3,30). Un plafond plat,
 * vu aux quatre cinquièmes au moins, donne sa hauteur à la pièce. Un rampant
 * garde celle de ses murs.
 */
export function hauteurLue(
  plafond: { hMin: number; hMax: number; hMoy: number; couverture: number; rampant: boolean } | null | undefined,
): number | undefined {
  if (!plafond || plafond.rampant || plafond.couverture < 0.8 || plafond.hMax - plafond.hMin > 0.1) return undefined;
  return Math.round(plafond.hMoy * 100) / 100;
}

export function hauteurDeLaPiece(part: { walls: WallSeg[]; hauteur?: number }): number {
  return part.hauteur ?? roomHeight(part.walls);
}

/** Barycentre des extrémités de murs : « l'intérieur » de la pièce. */
export function wallsCentroid(walls: WallSeg[]): { x: number; z: number } {
  if (walls.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const w of walls) {
    x += w.a.x + w.b.x;
    z += w.a.z + w.b.z;
  }
  return { x: x / (walls.length * 2), z: z / (walls.length * 2) };
}

/**
 * Recale un meuble DEVANT les murs : tout coin de son empreinte qui pénètre
 * l'épaisseur d'un mur (ou passe derrière) pousse le meuble vers l'intérieur
 * de la pièce. Utilisé par le plan 2D, la vue 3D et le PDF.
 *
 * AU NU DE CHAQUE MUR, À DEUX MILLIMÈTRES — revue « Théo » : la marge de
 * deux centimètres dessinait un jour derrière tout meuble « collé » (placé
 * à 0 cm, montré à 2), et l'épaisseur de référence (14 cm) écartait de
 * 5,5 cm un meuble plaqué contre une cloison de 7. Chaque mur pousse
 * désormais depuis SA face, et la marge n'est plus qu'un souffle.
 */
export function clampFootprint(
  f: ObjectFootprint,
  walls: WallSeg[],
  interior: { x: number; z: number },
  wallT = WALL_T,
  margin = 0.002,
): ObjectFootprint {
  /*
    UN ESCALIER ENJAMBE SES MURS — revue « Nadia » : l'escalier droit qui
    monte au-dessus du cellier était repoussé dans l'entrée, 1,03 m vers la
    rue, à cheval sur le WC, au plan, au PDF et en 3D. Il traverse une
    cloison par nature ; on ne le recadre pas.
  */
  if (/stairs/i.test(f.category)) return f;
  let cx = f.cx;
  let cz = f.cz;
  /*
    CE QUE CHAQUE MUR A DÛ POUSSER — et dans quel sens.

    Deux poussées opposées ne s'annulent pas : elles disent que la boîte est
    plus large que la pièce, et c'est elle qu'il faut raboter (voir
    `raboter`). Sans cette mémoire, le dernier mur gagnait et le meuble
    partait dehors.
  */
  const pousses: Poussee[] = [];
  const cos = Math.cos(f.yaw);
  const sin = Math.sin(f.yaw);
  const localCorners: [number, number][] = [
    [-f.width / 2, -f.depth / 2],
    [f.width / 2, -f.depth / 2],
    [f.width / 2, f.depth / 2],
    [-f.width / 2, f.depth / 2],
  ];
  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Ne considérer que les murs que le meuble longe réellement — jugé sur
    // TOUTE son empreinte, pas sur son seul centre : près d'un angle, le
    // centre sort de la portée du mur alors qu'un coin le traverse encore.
    const along = (px: number, pz: number) =>
      ((px - w.a.x) * dx + (pz - w.a.z) * dz) / (len * len);
    const ts = [
      along(cx, cz),
      ...localCorners.map(([lx, lz]) =>
        along(cx + lx * cos - lz * sin, cz + lx * sin + lz * cos),
      ),
    ];
    if (Math.max(...ts) < -0.1 || Math.min(...ts) > 1.1) continue;
    const nx = -dz / len;
    const nz = dx / len;
    // Le meuble est ramené du côté de SA pièce, pas du côté où RoomPlan a
    // cru voir son centre : une télé posée à plat contre un mur ressort
    // volontiers à cheval dessus, et se voyait alors depuis l'autre pièce.
    const side =
      Math.sign((interior.x - w.a.x) * nx + (interior.z - w.a.z) * nz) || 1;
    let minCorner = Infinity;
    for (const [lx, lz] of localCorners) {
      const px = cx + lx * cos - lz * sin;
      const pz = cz + lx * sin + lz * cos;
      const d = side * ((px - w.a.x) * nx + (pz - w.a.z) * nz);
      if (d < minCorner) minCorner = d;
    }
    // Sa face à lui : l'épaisseur dite, sinon celle de référence.
    const demi = (w.epaisseur !== undefined ? epaisseurDe(w) : wallT) / 2;
    const need = demi + margin - minCorner;
    // On accepte de déplacer jusqu'à la profondeur du meuble : de quoi
    // dégager une télé ou une étagère entièrement enfoncée dans la cloison.
    // Au-delà, le meuble vit ailleurs — on ne le téléporte pas.
    if (need > 0 && need < Math.max(0.8, f.depth + wallT)) {
      cx += nx * side * need;
      cz += nz * side * need;
      pousses.push({
        nx: nx * side,
        nz: nz * side,
        base: (w.a.x * nx + w.a.z * nz) * side,
        demi,
      });
    }
  }
  return faceIntoRoom(
    raboter({ ...f, cx, cz }, pousses, margin),
    walls,
  );
}

/**
 * UN MUR QUI A DÛ POUSSER, et où passe son nu.
 *
 * On retient la NORMALE (vers l'intérieur) et `base`, la cote du plan du mur
 * le long de cette normale : le nu intérieur est alors à `base + demi`.
 *
 * On ne retient PAS ce que la poussée a déplacé. Les poussées s'enchaînent —
 * le deuxième mur mesure un meuble que le premier a déjà écarté — et les
 * additionner comptait deux fois le même débord : le placard de 2,20 se
 * rabotait à 1,03 dans une pièce de 1,60. Deux nus se comparent, eux, sans
 * rien devoir à l'ordre dans lequel on les a rencontrés.
 */
interface Poussee {
  nx: number;
  nz: number;
  base: number;
  /** La demi-épaisseur du mur : son nu est à `base + demi`. */
  demi: number;
}

/**
 * LE PLANCHER DU RABOTAGE — trente centimètres.
 *
 * Un meuble réduit à un trait n'est plus un meuble : c'est un défaut qu'on a
 * rendu invisible. En dessous, on préfère laisser dépasser et qu'on le voie.
 */
const RABOT_MINI = 0.3;

/**
 * QUAND UN MEUBLE NE RENTRE PAS, C'EST LA BOÎTE QUI CÈDE.
 *
 * Relevé de chantier, capture à l'appui : « après un scan complet de ma
 * salle de bain, les WC et le meuble placard au-dessus ont été déplacés
 * automatiquement hors plan et le scan les a dimensionnés plus grand ; ils
 * ne rentrent pas sur le plan, mais bien dans ma salle de bain ».
 *
 * LES DEUX MOITIÉS SE TIENNENT. RoomPlan mesure une boîte ENGLOBANTE : dans
 * une pièce étroite, un WC vu de trois quarts avec son abattant relevé, ou
 * un placard dont la porte était ouverte, ressortent plus larges que le
 * meuble réel. Le recalage, lui, ne savait que POUSSER — il écarte le meuble
 * du mur dans lequel il trempe, mur après mur. Quand la boîte est plus large
 * que la pièce, chaque mur pousse à son tour, le dernier gagne, et le meuble
 * finit dehors.
 *
 * Réponse du patron : « fais en sorte que si le meuble semble plus grand que
 * l'endroit où il se situe, on l'adapte au max pour qu'il soit bien là où il
 * doit être ».
 *
 * DEUX POUSSÉES OPPOSÉES DISENT TOUT. Si deux murs ont écarté le meuble dans
 * des sens contraires, aucun déplacement ne peut plus le sauver : c'est la
 * boîte qui est trop grande. On la réduit de ce que les deux murs ont dû
 * pousser, et l'on rend au meuble la moitié du chemin — il se repose entre
 * les deux nus, sans quitter le mur qu'il longeait.
 *
 * LE RABOTAGE SUIT LES AXES DU MEUBLE, pas ceux du monde : dans une pièce de
 * biais, réduire « la largeur » n'a de sens que dans le repère du caisson.
 * On range donc chaque poussée sur l'axe local dont elle est la plus proche.
 */
function raboter(
  f: ObjectFootprint,
  pousses: Poussee[],
  margin: number,
): ObjectFootprint {
  if (pousses.length < 2) return f;
  const cos = Math.cos(f.yaw);
  const sin = Math.sin(f.yaw);
  // Les deux axes du meuble, dans le monde : +largeur et +profondeur.
  const axes = [
    { ax: cos, az: sin, cle: 'width' as const },
    { ax: -sin, az: cos, cle: 'depth' as const },
  ];
  let { cx, cz, width, depth } = f;
  for (const { ax, az, cle } of axes) {
    /*
      LES DEUX MURS QUI BORNENT CET AXE.

      Celui dont la normale suit l'axe borne le bout −, celui qui lui fait
      face borne le bout +. On garde les plus CONTRAIGNANTS de chaque côté :
      dans un recoin, trois murs peuvent pousser dans le même sens.
    */
    let bas: Poussee | null = null;
    let haut: Poussee | null = null;
    for (const p of pousses) {
      const dot = p.nx * ax + p.nz * az;
      // Perpendiculaire à cet axe : c'est l'affaire de l'autre.
      if (Math.abs(dot) < 0.7) continue;
      if (dot > 0) {
        if (!bas || p.base > bas.base) bas = p;
      } else if (!haut || p.base > haut.base) haut = p;
    }
    // Un seul côté poussé : le déplacement a suffi, la boîte n'y est pour
    // rien. C'est le cas de l'étagère enfoncée dans une cloison.
    if (!bas || !haut) continue;
    /*
      L'ESPACE ENTRE LES DEUX NUS, mesuré le long de la normale du premier.

      Les deux murs se font face, donc leurs normales sont opposées : la
      distance de plan à plan vaut −(base₁ + base₂), et l'on retire une
      épaisseur de mur pour passer des axes aux nus.
    */
    const dispo = -(bas.base + haut.base) - bas.demi - haut.demi - 2 * margin;
    /*
      UNE BOÎTE DE BIAIS TIENT PLUS DE PLACE QUE SES COTES.

      Entre deux nus parallèles, une caisse tournée occupe la SOMME de ses
      deux dimensions projetées sur la normale. Rabotée à la seule cote de
      l'axe, elle débordait encore de ce que l'autre côté projetait — et
      dans une pièce de biais, c'est le cas de tous les meubles. On retire
      donc d'abord la part de l'autre axe, puis on divise par ce que le
      nôtre projette.
    */
    const dotNotre = Math.abs(ax * bas.nx + az * bas.nz);
    const dotAutre = Math.abs(-az * bas.nx + ax * bas.nz);
    const autre = cle === 'width' ? depth : width;
    const place = (dispo - dotAutre * autre) / Math.max(0.1, dotNotre);
    const avant = cle === 'width' ? width : depth;
    const voulu = Math.max(RABOT_MINI, Math.min(avant, place));
    if (avant - voulu <= 1e-6) continue;
    if (cle === 'width') width = voulu;
    else depth = voulu;
    /*
      ET IL SE REPOSE ENTRE LES DEUX.

      Les poussées se sont annulées l'une l'autre : la dernière a laissé le
      meuble collé au mur d'en face. Le milieu des deux nus est la seule
      position qui ne privilégie personne — et comme la boîte remplit
      désormais l'espace, ce milieu la met au contact des DEUX.
    */
    const milieu = (bas.base - haut.base) / 2;
    const ecart = milieu - (cx * bas.nx + cz * bas.nz);
    cx += bas.nx * ecart;
    cz += bas.nz * ecart;
  }
  return { ...f, cx, cz, width, depth };
}

/**
 * L'AVANT D'UN MEUBLE NE REGARDE PAS LE MUR.
 *
 * Une commode contre une cloison ouvre ses tiroirs vers la pièce, un lit
 * pose sa tête contre le mur, un canapé y adosse son dossier. C'est vrai
 * partout, sans exception — personne n'ouvre un tiroir dans du plâtre.
 *
 * Le relèvement, lui, ne le sait pas : ARKit rend une boîte et un angle,
 * et cet angle vaut aussi bien θ que θ + 180° — rien dans un nuage de
 * points ne distingue l'avant de l'arrière d'un caisson. Une fois sur
 * deux, le meuble sortait donc dos à la pièce.
 *
 * On ne corrige QUE par demi-tour : un quart de tour échangerait largeur et
 * profondeur, et le meuble ne coïnciderait plus avec ce qui a été mesuré.
 * Et seulement pour un meuble RÉELLEMENT contre un mur : au milieu d'une
 * pièce, une chaise regarde où elle veut, et lui imposer un sens serait
 * inventer une information qu'on n'a pas.
 */
export function faceIntoRoom(
  f: ObjectFootprint,
  walls: WallSeg[],
  wallT = WALL_T,
): ObjectFootprint {
  // L'avant du meuble est son côté −z local (`furnitureParts` y pose les
  // portes et les tiroirs) : dans le monde, (sin θ, −cos θ).
  const front = { x: Math.sin(f.yaw), z: -Math.cos(f.yaw) };
  let plusProche: { d: number; vers: { x: number; z: number } } | null = null;
  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-9) continue;
    // Le point du mur le plus proche du centre, borné au segment.
    const t = Math.max(
      0,
      Math.min(1, ((f.cx - w.a.x) * dx + (f.cz - w.a.z) * dz) / len2),
    );
    const px = w.a.x + dx * t;
    const pz = w.a.z + dz * t;
    const vx = f.cx - px;
    const vz = f.cz - pz;
    const d = Math.hypot(vx, vz);
    // Contre le mur = son dos y touche presque : la demi-profondeur, plus
    // la demi-épaisseur du mur, plus dix centimètres de jeu.
    if (d > f.depth / 2 + wallT / 2 + 0.1) continue;
    if (!plusProche || d < plusProche.d) {
      plusProche = { d, vers: { x: vx / (d || 1), z: vz / (d || 1) } };
    }
  }
  if (!plusProche) return f;
  // L'avant regarde-t-il le mur ? Alors demi-tour.
  const versLaPiece = plusProche.vers;
  const scalaire = front.x * versLaPiece.x + front.z * versLaPiece.z;
  return scalaire < -0.15 ? { ...f, yaw: f.yaw + Math.PI } : f;
}

/**
 * Soudure des coins : les extrémités distantes de moins de `tol` mètres
 * sont ramenées sur un point commun (moyenne du cluster), puis une extrémité
 * restée libre qui frôle le flanc d'un autre mur est projetée dessus
 * (jonction en T). Le plan devient réellement connexe : les onglets de
 * `wallQuads` ont alors de vrais nœuds à traiter.
 *
 * La soudure s'arrête AUX LIMITES DE LA PIÈCE : deux pièces voisines ont
 * chacune son mur, souvent à quelques centimètres l'un de l'autre. Les
 * confondre refermerait les deux contours l'un sur l'autre et ferait
 * disparaître les surfaces au sol.
 *
 * Ne modifie pas les murs reçus : renvoie de nouveaux segments.
 */
/**
 * LES BAIES QUE LE VOLET A RABOTÉES.
 *
 * Relevé du chantier, photo à l'appui : « le scan se cadre mal par rapport
 * à la taille réelle d'une porte avec un volet un peu descendu, pourtant on
 * voit bien le tour de la porte ». RoomPlan cadre ce qu'il VOIT : le
 * tablier pendant sous le coffre lui masque le haut de la baie, et il pose
 * son linteau sous le tablier. La porte-fenêtre sort à 1,80 m au lieu de
 * 2,15 — et tout ce qui en découle est faux : la hauteur d'allège, le
 * dessin en élévation, la place qui reste pour un interrupteur.
 *
 * L'app ne peut pas savoir de combien le volet était descendu. Mais elle
 * sait ce que tout bâtiment respecte : DANS UN MÊME LOGEMENT, LES LINTEAUX
 * SONT AU MÊME NIVEAU. Trois baies à 2,15 m et une à 1,80 m, ce n'est pas
 * une menuiserie particulière — c'est un volet qui pendait.
 *
 * On prend donc pour référence le linteau le plus haut — un volet ne peut
 * que rabaisser une baie, jamais la grandir — et l'on signale celles qui
 * tombent nettement dessous. Le seuil est large — quinze centimètres —
 * parce qu'un châssis de salle de bains ou une imposte peuvent
 * légitimement s'arrêter plus bas de quelques centimètres.
 *
 * DEUX GARDES, apprises sur le plan d'exemple — huit fausses alertes, toutes
 * les portes et presque toutes les fenêtres « à remonter » :
 * — SEULE UNE BAIE DE FAÇADE A UN VOLET. Une porte de chambre à 2,04 m (la
 *   huisserie normalisée) n'a rien à voir avec une fenêtre à 2,15 m, et un
 *   passage ouvert n'a pas de menuiserie du tout. Une fenêtre compte
 *   toujours ; une porte, seulement quand l'un de ses côtés donne hors de
 *   toute pièce (une porte-fenêtre, l'entrée) ; et quand les contours
 *   disent qu'une baie va de pièce à pièce, elle sort du compte ;
 * — LE NIVEAU DE RÉFÉRENCE EST PARTAGÉ. « Les autres à 2,30 » ne se dit pas
 *   d'une seule grande baie vitrée : la référence est le plus haut niveau
 *   où s'accordent AU MOINS DEUX baies, à cinq centimètres près. Deux baies
 *   qui ne s'accordent pas ne disent pas laquelle croire : on se tait.
 */
export function linteauxRabotes(
  openings: WallSeg[],
  ecartMin = 0.15,
  /**
   * Les contours des pièces, quand l'appelant les a : ils disent quelle
   * baie donne dehors. Sans eux, seules les fenêtres comptent.
   */
  contours: Pt[][] = [],
  /** Le niveau du sol (celui de RoomPlan est à −1,30 m ; voir `solDesMurs`). */
  sol = 0,
  /**
   * Les murs : une baie ne remonte pas plus haut que celui qui la porte
   * (revue « Malik » : une fenêtre de chambre « à remonter » à 3,20 m sur un
   * mur de 2,40, d'après les baies de l'atelier en double hauteur).
   */
  murs: WallSeg[] = [],
): { id: string; linteau: number; actuel: number }[] {
  const dedans = (p: Pt) => contours.some((c) => c.length >= 3 && insidePoly(p, c));
  /** Un côté de la baie est-il hors de toute pièce ? */
  const enFacade = (o: WallSeg): boolean | null => {
    if (contours.length === 0) return null;
    const l = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
    if (l < 1e-6) return null;
    const n = { x: -(o.b.z - o.a.z) / l, z: (o.b.x - o.a.x) / l };
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    const d = WALL_T / 2 + 0.25;
    return (
      !dedans({ x: m.x + n.x * d, z: m.z + n.z * d }) ||
      !dedans({ x: m.x - n.x * d, z: m.z - n.z * d })
    );
  };
  /*
    UNE PORTE À HAUTEUR DE PORTE EST UNE PORTE — appartements témoins : la
    porte palière donne hors du logement comme une porte-fenêtre, et à
    2,05 m elle passait pour rabotée face à des fenêtres à 2,25 m. Une
    porte part du sol : sa hauteur est celle de son linteau, quel que soit
    le repère. Sous deux mètres, aucune porte ne se fabrique ainsi — c'est
    un tablier qui l'a coupée. Il en va de même de la baie vitrée qui
    descend au sol (la coulissante que `baiesVitrees` a rendue aux
    fenêtres) : à 2,05 m, c'est une porte-fenêtre du commerce.
  */
  const HAUTEUR_DE_PORTE = 2.0;
  const aHauteurDePorte = (o: WallSeg) =>
    o.yCenter - o.height / 2 - sol < 0.1 && o.height >= HAUTEUR_DE_PORTE - 1e-9;
  /*
    UNE FENÊTRE HAUTE N'EST PAS UNE FENÊTRE RABOTÉE — revue « Camille » : une
    fenêtre de 0,60 posée à 1,50 du sol (un WC, une salle d'eau) s'arrêtait
    à 2,10 quand les autres montaient à 2,30, et le seul constat de deux
    plans propres proposait de l'agrandir (de même une fenêtre de 0,90 à
    1,20 du sol). Un volet qui pend rabote le haut d'une baie ordinaire ; il
    ne remonte pas son allège. Au-delà de 1,10 m d'allège (celle d'une
    fenêtre de séjour ou de chambre), la fenêtre est haute par dessin : elle
    ne se compare pas.
  */
  const ALLEGE_HAUTE = 1.1;
  const baies = openings.filter((o) => {
    if (o.type === 'window' && o.yCenter - o.height / 2 - sol > ALLEGE_HAUTE + 1e-9) return false;
    if (o.type === 'window') return enFacade(o) !== false && !aHauteurDePorte(o);
    if (o.type === 'door') return enFacade(o) === true && o.height < HAUTEUR_DE_PORTE - 1e-9;
    return false;
  });
  if (baies.length < 2) return [];
  const hautDe = (o: WallSeg) => o.yCenter + o.height / 2;
  const ACCORD = 0.05;
  /*
    LES BAIES DE SA FAÇADE — revue « Hélène » : dans un haussmannien, les
    fenêtres sur cour s'arrêtent à 2,56 m quand celles sur rue montent à
    2,91 ; l'app proposait d'« un appui » de remonter toutes celles de la
    cour. Un volet qui pend se trahit au milieu de ses voisines : une baie ne
    se compare qu'aux autres baies de la même façade, et il faut que deux
    d'entre elles s'accordent.
  */
  const memeFacade = (o: WallSeg, q: WallSeg) => {
    const L = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
    const Lq = Math.hypot(q.b.x - q.a.x, q.b.z - q.a.z) || 1;
    const u = { x: (o.b.x - o.a.x) / L, z: (o.b.z - o.a.z) / L };
    if (Math.abs((u.x * (q.b.x - q.a.x) + u.z * (q.b.z - q.a.z)) / Lq) < 0.95) return false;
    const m = { x: (q.a.x + q.b.x) / 2 - o.a.x, z: (q.a.z + q.b.z) / 2 - o.a.z };
    return Math.abs(m.x * -u.z + m.z * u.x) <= 0.3;
  };
  const sousSonMur = (o: WallSeg, reference: number) => {
    if (murs.length === 0) return true;
    const m = murDeLOuverture(o, murs);
    return !m || reference <= m.yCenter + m.height / 2 + 0.02;
  };
  return baies.flatMap((o) => {
    const hauts = baies
      .filter((q) => q !== o && memeFacade(o, q))
      .map(hautDe)
      .sort((a, b) => b - a);
    const reference = hauts.find(
      (h) => hauts.filter((x) => x <= h + 1e-9 && h - x <= ACCORD + 1e-9).length >= 2,
    );
    if (reference === undefined || reference - hautDe(o) < ecartMin - 1e-9 || !sousSonMur(o, reference)) return [];
    /*
      UNE FENÊTRE PLUS PETITE N'EST PAS RABOTÉE — revue « Hélène » : sur la
      cour, la fenêtre de l'office (allège 0,95, haut 2,55) se voyait
      proposer d'« un appui » de monter à 2,80 comme celles des chambres
      (allège 0,60). Un volet qui pend rabote le HAUT d'une baie ; son allège
      reste celle de ses voisines. Une fenêtre dont l'allège est plus haute
      que les leurs l'est par dessin.
    */
    if (o.type === 'window') {
      const pieds = baies
        .filter((q) => q !== o && memeFacade(o, q) && reference - hautDe(q) <= ACCORD + 1e-9 && hautDe(q) <= reference + 1e-9)
        .map((q) => q.yCenter - q.height / 2);
      if (pieds.length > 0 && o.yCenter - o.height / 2 > Math.max(...pieds) + 0.15) return [];
    }
    return [{ id: o.id, linteau: reference, actuel: hautDe(o) }];
  });
}

/**
 * RÉUNIT LES MURS VUS DEUX FOIS.
 *
 * Quand on scanne un logement pièce par pièce, la cloison mitoyenne est vue
 * DEUX FOIS : une fois depuis le séjour, une fois depuis la chambre. Les
 * deux segments se superposent presque, à l'épaisseur du mur près. Le
 * graphe, lui, n'y survit pas : chaque arête doublée fausse le parcours des
 * faces, et le logement ressort en une seule pièce — ou en aucune.
 *
 * Le diagnostic les signalait depuis longtemps (« deux murs se
 * superposent ») sans jamais les régler. On les réunit ici : un seul mur,
 * l'enveloppe des deux, et l'identifiant du PLUS LONG — c'est lui qui porte
 * le plus d'appareils, et le reprojeter coûterait moins cher de toute
 * façon.
 *
 * Trois gardes : il faut qu'ils soient parallèles (à ~18° près), proches
 * latéralement (moins de trente centimètres, l'épaisseur d'un mur porteur),
 * et qu'ils SE RECOUVRENT — deux murs bout à bout sont un mur coupé, pas un
 * doublon, et deux cloisons de couloir ne se confondent pas.
 */
/**
 * LES ÉCLATS DU SCAN, COUCHÉS LE LONG D'UN MUR — revues « Amandine »,
 * « Thomas », « Bérénice » et « Hélène » : RoomPlan laisse près des coins
 * de petits morceaux de mur de quelques centimètres, posés sur un mur plus
 * long. Le seuil des éclats (`ECLAT`, 5 mm) les gardait : une encoche et
 * une cote « 0,05 m » sur l'image partagée, et, coupés puis soudés, des
 * copies de façade qui égaraient la détection des pièces. Un morceau de
 * moins de 15 cm qui longe un mur bien plus long, à 6 cm près, n'est pas un
 * mur. Un retour de travers, lui, reste : il peut être vrai.
 */
export function sansEclatsLeLong(walls: WallSeg[]): WallSeg[] {
  const ECLAT_DU_SCAN = 0.15;
  const murs = walls.filter((w) => w.type === 'wall');
  const jetes = new Set<string>();
  for (const s of murs) {
    const ls = segLength(s);
    if (ls >= ECLAT_DU_SCAN || ls < 1e-6) continue;
    const us = unit(s);
    const porte = murs.some((w) => {
      if (w.id === s.id || jetes.has(w.id)) return false;
      const lw = segLength(w);
      if (lw < Math.max(2 * ls, 0.3)) return false;
      const uw = unit(w);
      if (Math.abs(us.x * uw.x + us.z * uw.z) < 0.95) return false;
      const lat = (p: Pt) => Math.abs((p.x - w.a.x) * -uw.z + (p.z - w.a.z) * uw.x);
      if (lat(s.a) > 0.06 || lat(s.b) > 0.06) return false;
      const t = (p: Pt) => (p.x - w.a.x) * uw.x + (p.z - w.a.z) * uw.z;
      const t0 = Math.min(t(s.a), t(s.b));
      const t1 = Math.max(t(s.a), t(s.b));
      return t1 > -0.15 && t0 < lw + 0.15;
    });
    if (porte) jetes.add(s.id);
  }
  return jetes.size > 0 ? walls.filter((w) => !jetes.has(w.id)) : walls;
}

export function fusionnerMursDoubles(
  murs: WallSeg[],
  /*
    UN MUR DE FAÇADE VU DES DEUX CÔTÉS — revue « Bérénice » : la façade
    d'une véranda, 31,5 cm, relevée du séjour et de la véranda. Au-delà de
    30 cm, les deux faces restaient deux murs. Un mur porteur ancien va
    jusqu'à 45 cm.
  */
  ecartMax = 0.45,
): WallSeg[] {
  const walls = sansEclatsLeLong(murs);
  const out: WallSeg[] = [];
  const absorbes = new Set<string>();
  /*
    UN MUR ÉPAIS VU DE SES DEUX CÔTÉS — revue « Sébastien ». Entre une
    chambre et un garage, les deux faces d'un mur de 20 cm étaient réunies
    sur la face du plus long : la chambre gardait ses murs arrêtés à
    l'autre face, 20 cm plus loin, la soudure (15 cm) ne les rattrapait
    plus, et la chambre disparaissait — sans trou, sans constat. Au-delà de
    5 cm d'écart, ce sont deux faces : le mur se pose sur leur AXE, épais de
    leur écart, et les murs qui s'arrêtaient sur l'une ou l'autre face
    viennent le rejoindre.
  */
  const DEUX_FACES = 0.05;
  const recales: {
    origine: Pt;
    u: Pt;
    n: Pt;
    /** Les deux faces, en décalage le long de `n` ; l'axe entre elles. */
    faces: number[];
    axe: number;
    de: number;
    a: number;
    id: string;
  }[] = [];
  // Le plus long d'abord : c'est lui qui garde son identité.
  const tries = [...walls].sort((a, b) => segLength(b) - segLength(a));
  for (const w of tries) {
    if (absorbes.has(w.id) || w.type !== 'wall') {
      if (w.type !== 'wall') out.push(w);
      continue;
    }
    const l = segLength(w) || 1;
    const origine = { ...w.a };
    const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    const n = { x: -u.z, z: u.x };
    const t = (p: Pt) => (p.x - origine.x) * u.x + (p.z - origine.z) * u.z;
    const cote = (p: Pt) => (p.x - origine.x) * n.x + (p.z - origine.z) * n.z;
    /*
      L'ENVELOPPE SE TIENT DANS UN REPÈRE FIXE — revues « Thomas » et
      « Bérénice » : la fin du mur se recalculait sur sa longueur
      d'origine. Le second morceau de façade l'allongeait à 8,95 m, l'éclat
      du coin, absorbé ensuite, le ramenait à 5,30 : 3,70 m de façade
      effacés, et le séjour de 74 m² avec eux. Les deux bornes ne font plus
      que s'écarter ; et l'on recommence tant qu'un mur s'ajoute, car celui
      qui ne recouvrait que l'enveloppe agrandie la rejoint aussi.
    */
    let lo = 0;
    let hi = l;
    const faces: { d: number; poids: number }[] = [{ d: 0, poids: l }];
    for (let ajout = true; ajout; ) {
      ajout = false;
      for (const o of tries) {
        if (o.id === w.id || absorbes.has(o.id) || o.type !== 'wall') continue;
        const lo2 = segLength(o) || 1;
        const uo = { x: (o.b.x - o.a.x) / lo2, z: (o.b.z - o.a.z) / lo2 };
        if (Math.abs(u.x * uo.x + u.z * uo.z) < 0.95) continue;
        // Distance latérale : les deux bouts doivent longer la même ligne.
        if (Math.abs(cote(o.a)) > ecartMax || Math.abs(cote(o.b)) > ecartMax) continue;
        // Recouvrement le long de l'axe : bout à bout ne compte pas.
        const t0 = Math.min(t(o.a), t(o.b));
        const t1 = Math.max(t(o.a), t(o.b));
        const commun = Math.min(t1, hi) - Math.max(t0, lo);
        if (commun <= 0.05) continue;
        // Absorbé : le mur retenu prend l'enveloppe des deux.
        absorbes.add(o.id);
        ajout = true;
        lo = Math.min(lo, t0);
        hi = Math.max(hi, t1);
        faces.push({ d: (cote(o.a) + cote(o.b)) / 2, poids: lo2 });
      }
    }
    /*
      LES FACES SE RANGENT EN DEUX CÔTÉS — revue « Thomas » : « l'autre
      face » était la première trouvée à plus de 5 cm. Une face revue par un
      second passage, décalée de 4 cm, épaississait un mur de 17 cm à 22,
      selon l'ordre des surfaces. Les faces se partagent au plus grand écart
      (5 cm au moins) ; chaque côté prend la moyenne de ses faces.
    */
    const rangees = [...faces].sort((p, q) => p.d - q.d);
    let coupe = -1;
    let ecart = DEUX_FACES - 1e-9;
    for (let i = 0; i + 1 < rangees.length; i++) {
      const g = rangees[i + 1].d - rangees[i].d;
      if (g > ecart) {
        ecart = g;
        coupe = i;
      }
    }
    let A = { x: origine.x + u.x * lo, z: origine.z + u.z * lo };
    let B = { x: origine.x + u.x * hi, z: origine.z + u.z * hi };
    if (coupe >= 0) {
      const moyenne = (xs: { d: number; poids: number }[]) =>
        xs.reduce((s, x) => s + x.d * x.poids, 0) / xs.reduce((s, x) => s + x.poids, 0);
      const bas = rangees.slice(0, coupe + 1);
      const haut = rangees.slice(coupe + 1);
      const faceBas = moyenne(bas);
      const faceHaut = moyenne(haut);
      const axe = (faceBas + faceHaut) / 2;
      const epaisseur = Math.max(w.epaisseur ?? 0, faceHaut - faceBas);
      A = { x: A.x + n.x * axe, z: A.z + n.z * axe };
      B = { x: B.x + n.x * axe, z: B.z + n.z * axe };
      recales.push({ origine, u, n, faces: [faceBas, faceHaut], axe, de: lo, a: hi, id: w.id });
      out.push({ ...w, a: A, b: B, epaisseur, deuxFaces: true });
    } else {
      out.push({ ...w, a: A, b: B });
    }
  }
  if (recales.length === 0) return out;
  /*
    LES MURS ARRÊTÉS CONTRE UNE FACE REJOIGNENT L'AXE — revues « Gérard »,
    « Hélène » et « Bérénice » : seul un bout à moins de 3 cm d'une face
    était recalé. Le scan laisse 3 à 6 cm aux coins ; une façade arrêtée à
    6 cm de la face d'un refend tombait à 16 cm de son axe, ni recalée ni
    soudée, et le séjour, la loggia, la cuisine disparaissaient. Un bout de
    mur de travers qui tombe entre les deux faces, ou à 8 cm devant l'une,
    vient sur l'axe.
  */
  const JEU = 0.08;
  const recaler = (p: Pt, w: WallSeg): Pt => {
    const lw = segLength(w) || 1;
    const uw = { x: (w.b.x - w.a.x) / lw, z: (w.b.z - w.a.z) / lw };
    for (const r of recales) {
      if (Math.abs(uw.x * r.u.x + uw.z * r.u.z) > 0.7) continue;
      const t = (p.x - r.origine.x) * r.u.x + (p.z - r.origine.z) * r.u.z;
      if (t < r.de - 0.1 || t > r.a + 0.1) continue;
      const cote = (p.x - r.origine.x) * r.n.x + (p.z - r.origine.z) * r.n.z;
      if (cote < r.faces[0] - JEU || cote > r.faces[1] + JEU) continue;
      const k = r.axe - cote;
      return { x: p.x + r.n.x * k, z: p.z + r.n.z * k };
    }
    return p;
  };
  const fusionnes = new Set(recales.map((r) => r.id));
  return out.map((w) =>
    fusionnes.has(w.id) || w.type !== 'wall' ? w : { ...w, a: recaler(w.a, w), b: recaler(w.b, w) },
  );
}

/**
 * LA BAIE VITRÉE N'EST PAS UNE PORTE — relevé du patron : « ma baie vitrée a
 * été détectée comme une porte, et à l'ouverture du plan elle est rouge car
 * dans son ouverture se trouve le canapé ». RoomPlan range souvent une baie
 * coulissante parmi les portes ; le plan lui dessinait un vantail de 2,40 m,
 * un quart de cercle qui balaie la moitié du séjour.
 *
 * Une « porte » de 1,60 m et plus percée dans un mur de FAÇADE (un de ses
 * côtés hors de toute pièce) est une baie : elle devient une fenêtre — une
 * porte-fenêtre qui descend au sol — sans battant. Une porte intérieure, si
 * large soit-elle, reste une porte. Sans pièce refermée pour le dire, il
 * faut 1,80 m. `contours` : ceux des pièces, quand l'appelant les a ; sinon
 * on les cherche dans le graphe des murs.
 */
export const LARGEUR_DE_BAIE = 1.6;
/** À partir de cette largeur, une « porte » est une baie, où qu'elle soit (m). */
const BAIE_SANS_DOUTE = 2;

export function baiesVitrees<O extends WallSeg>(openings: O[], walls: WallSeg[], contours?: Pt[][]): O[] {
  if (!openings.some((o) => o.type === 'door' && segLength(o) >= LARGEUR_DE_BAIE)) return openings;
  const lesContours = (contours ?? detectRooms(walls, undefined, openings).map((r) => r.outline)).filter(
    (c) => c.length >= 3,
  );
  const dehors = (p: Pt) => !lesContours.some((c) => insidePoly(p, c));
  return openings.map((o) => {
    const l = segLength(o);
    if (o.type !== 'door' || o.garage || l < LARGEUR_DE_BAIE) return o;
    let facade: boolean;
    if (l >= BAIE_SANS_DOUTE) {
      /*
        DEUX MÈTRES ET PLUS, C'EST UNE BAIE, MÊME ENTRE DEUX PIÈCES — revues
        « Gérard » et « Bérénice » : la baie coulissante de 2,40 m entre le
        séjour et la loggia (ou la véranda) gardait un battant de 2,40 m qui
        balayait le séjour, et le contrôle croyait que la table gênait son
        ouverture. Une porte battante ne fait pas deux mètres.
      */
      facade = true;
    } else if (lesContours.length === 0) {
      facade = l >= 1.8;
    } else {
      const n = { x: -(o.b.z - o.a.z) / l, z: (o.b.x - o.a.x) / l };
      const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      const d = WALL_T / 2 + 0.25;
      facade = dehors({ x: m.x + n.x * d, z: m.z + n.z * d }) || dehors({ x: m.x - n.x * d, z: m.z - n.z * d });
    }
    return facade
      ? { ...o, type: 'window', open: undefined, pivot: undefined, versExterieur: undefined, vantaux: undefined }
      : o;
  });
}

/**
 * LE GARAGE SE RECONNAÎT À SA PORTE — revue « Bérénice » : le garage de la
 * villa ressortait « Pièce 2 », compté habitable (29,8 m² de trop dans
 * l'en-tête), et sa porte sectionnelle de 2,40 m, prise pour une baie, se
 * dessinait en vitrage. RoomPlan ne connaît pas les garages, et le mobilier
 * n'en dit rien : une étagère, un établi.
 *
 * Une pièce de 12 m² au moins est un garage quand elle s'ouvre SUR LE
 * DEHORS, au ras du sol, par une baie de 2,20 m au moins, et que :
 *   — rien n'y dit qu'on y vit : ni lit, ni canapé, ni télévision, ni
 *     sanitaire, ni de quoi cuisiner, ni chaise ;
 *   — aucune fenêtre n'y est à hauteur d'homme (allège sous 1,10 m) : le
 *     jour d'un garage est petit et haut. Un séjour, une chambre, ont leurs
 *     fenêtres.
 * Rend l'identifiant de la porte de garage, ou `null`.
 */
export const LARGEUR_PORTE_DE_GARAGE = 2.2;
const ON_Y_VIT = /bed|sofa|couch|television|^tv$|bathtub|shower|toilet|stove|oven|dishwasher|fireplace|chair/i;

export function porteDeGarage(
  contour: Pt[],
  contours: Pt[][],
  openings: WallSeg[],
  categories: string[],
  walls: WallSeg[],
): string | null {
  if (contour.length < 3 || Math.abs(signedArea(contour)) < 12) return null;
  if (categories.some((c) => ON_Y_VIT.test(c))) return null;
  const surLeContour = (o: WallSeg) => {
    const l = segLength(o);
    if (l < 0.05) return false;
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const e = { x: contour[i].x - contour[j].x, z: contour[i].z - contour[j].z };
      const le = Math.hypot(e.x, e.z);
      if (le < 1e-6) continue;
      const sinus = Math.abs(e.x * (o.b.z - o.a.z) - e.z * (o.b.x - o.a.x)) / (le * l);
      if (sinus < 0.2 && pointOnSeg(m, contour[j], contour[i]).dist < 0.3) return true;
    }
    return false;
  };
  const dehors = (p: Pt) => !contours.some((c) => c.length >= 3 && insidePoly(p, c));
  let porte: WallSeg | null = null;
  for (const o of openings) {
    if (o.type === 'opening' || !surLeContour(o)) continue;
    const l = segLength(o);
    const bas = o.yCenter - o.height / 2 - murPorteurDe(o, walls).sol;
    const n = { x: -(o.b.z - o.a.z) / l, z: (o.b.x - o.a.x) / l };
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    const d = WALL_T / 2 + 0.25;
    const facade = dehors({ x: m.x + n.x * d, z: m.z + n.z * d }) || dehors({ x: m.x - n.x * d, z: m.z - n.z * d });
    if (l >= LARGEUR_PORTE_DE_GARAGE && bas < 0.15 && o.height >= 1.8 && facade) {
      if (!porte || l > segLength(porte)) porte = o;
      continue;
    }
    // Une fenêtre à hauteur d'homme : on y vit.
    if (o.type === 'window' && l >= 0.5 && bas < 1.1) return null;
  }
  return porte?.id ?? null;
}

/** La porte de garage reconnue : une porte qui ne bat pas (voir `porteDeGarage`). */
export function lesPortesDeGarage<O extends WallSeg>(openings: O[], ids: Set<string>): O[] {
  if (ids.size === 0) return openings;
  return openings.map((o) =>
    ids.has(o.id)
      ? { ...o, type: 'door', garage: true, open: undefined, pivot: undefined, versExterieur: undefined, vantaux: undefined }
      : o,
  );
}

/**
 * UNE BAIE NE S'ENFONCE PAS DANS LE MUR D'ANGLE — relevé du patron,
 * diagnostic à l'appui : « la porte est imbriquée dans le mur, cachant une
 * partie ».
 *
 * RoomPlan voit la porte à 2 cm de l'angle. Le plan, lui, pose le trait d'un
 * mur sur son AXE : le mur d'angle s'épaissit d'une demi-épaisseur vers la
 * pièce, et son nu tombait dans l'ouverture — le gond, le dormant et le
 * battant mangés par la maçonnerie.
 *
 * Une baie qui empiète se recale contre le nu du mur d'angle, en gardant le
 * petit jeu que le scan avait mesuré entre elle et l'angle (cinq centimètres
 * au plus) ; elle garde sa largeur. Plus large que l'espace libre entre les
 * deux nus, elle s'y réduit. Une baie qui ne touche aucun angle ne bouge pas,
 * et la liste rendue est la même quand rien n'a bougé.
 */
export function baiesHorsDesAngles<O extends WallSeg>(openings: O[], tousLesMurs: WallSeg[]): O[] {
  let change = false;
  const out = openings.map((o) => {
    /*
      LES MURS DE SON ÉTAGE — revue « Nadia » : rouverte, la fenêtre de la
      salle de bains, à l'étage, se cherchait un mur parmi ceux des deux
      niveaux et se recalait sur l'angle du WC du dessous : 30 cm de glissé.
    */
    const walls = tousLesMurs.filter((w) => niveauDe(w) === niveauDe(o));
    const mur = murDeLOuverture(o, walls);
    if (!mur) return o;
    const L = segLength(mur);
    if (L < 1e-6) return o;
    const u = { x: (mur.b.x - mur.a.x) / L, z: (mur.b.z - mur.a.z) / L };
    const t = (p: Pt) => (p.x - mur.a.x) * u.x + (p.z - mur.a.z) * u.z;
    const ta = t(o.a);
    const tb = t(o.b);
    const t0 = Math.min(ta, tb);
    const t1 = Math.max(ta, tb);
    const largeur = t1 - t0;
    const rA = retraitDuCoin(walls, mur, mur.a);
    const rB = retraitDuCoin(walls, mur, mur.b);
    if (L - rA - rB < 0.3) return o;
    let n0 = t0;
    let n1 = t1;
    if (n0 < rA - 1e-4) {
      n0 = rA + Math.max(0, Math.min(t0, 0.05));
      n1 = n0 + largeur;
    }
    if (n1 > L - rB + 1e-4) {
      n1 = L - rB - Math.max(0, Math.min(L - t1, 0.05));
      n0 = Math.max(rA, n1 - largeur);
    }
    if (Math.abs(n0 - t0) < 1e-4 && Math.abs(n1 - t1) < 1e-4) return o;
    change = true;
    // Chaque bout glisse le long du mur ; l'écart à l'axe reste celui du scan.
    const glisse = (p: Pt, de: number, vers: number): Pt => ({ x: p.x + u.x * (vers - de), z: p.z + u.z * (vers - de) });
    return ta <= tb
      ? { ...o, a: glisse(o.a, ta, n0), b: glisse(o.b, tb, n1) }
      : { ...o, a: glisse(o.a, ta, n1), b: glisse(o.b, tb, n0) };
  });
  return change ? out : openings;
}

/** Hauteur par défaut d'un coffre de volet — le tunnel courant, 25 cm. */
export const COFFRE_H = 0.25;

/**
 * L'EMPRISE D'UN COFFRE DE VOLET, sur la face du mur.
 *
 * Du haut de la baie au haut du coffre, sur toute la largeur de la
 * menuiserie : c'est le rectangle où l'on ne perce pas, et celui qu'il faut
 * voir en élévation avant de décider où passe la commande.
 */
export function empriseDuCoffre(
  o: WallSeg,
  /**
   * Abscisse du bord gauche de la baie SUR LA FACE, quand l'appelant
   * travaille dans le repère du mur (l'élévation, le contrôle). Zéro par
   * défaut : on reste alors dans le repère de la menuiserie seule.
   */
  xBaie = 0,
  /**
   * LE SOL DU RELEVÉ, dans le repère du scan — relevé des revues du dossier :
   * le coffre s'imprimait au milieu de la baie. RoomPlan met son origine
   * sous l'iPhone, le sol tombe vers −1,3 m ; l'élévation compte ses
   * hauteurs depuis le sol, l'emprise les comptait depuis l'iPhone. Zéro
   * par défaut : le repère du scan, comme avant.
   */
  sol = 0,
): { x0: number; x1: number; y0: number; y1: number } | null {
  if (!o.coffre || o.coffre <= 0) return null;
  const haut = o.yCenter + o.height / 2 - sol;
  return {
    x0: xBaie,
    x1: xBaie + segLength(o),
    y0: haut,
    y1: haut + o.coffre,
  };
}

/**
 * Cet appareil tombe-t-il dans le coffre ? `x` est compté depuis le bord
 * de la baie, comme l'emprise — c'est à l'appelant de se placer dans le
 * même repère que la menuiserie.
 */
export function dansLeCoffre(
  o: WallSeg,
  x: number,
  y: number,
  xBaie = 0,
  sol = 0,
): boolean {
  const e = empriseDuCoffre(o, xBaie, sol);
  if (!e) return false;
  return x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1;
}

/** Un manque de maçonnerie entre deux bouts de mur qui se font face. */
export interface TrouDeReleve {
  /** Le bout libre du premier mur, et celui du second. */
  a: Pt;
  b: Pt;
  wallA: string;
  wallB: string;
  /** Largeur du manque, en mètres. */
  ecart: number;
  /**
   * UN COIN RATÉ, pas une porte manquée : les deux murs ne se suivent pas,
   * ils devaient se rejoindre ICI. On le ferme en prolongeant chacun
   * jusqu'à ce point, sans poser de mur.
   */
  coin?: Pt;
}

/**
 * LES TROUS QUE LE SCAN A LAISSÉS — une porte manquée, presque toujours.
 *
 * Relevé du chantier : « le scan n'a pas su capter une porte, je me suis
 * retrouvé avec deux murs séparés, et impossible de les joindre ou d'en
 * créer un facilement ». C'est le défaut de relevé le plus courant : une
 * porte ouverte, un miroir, un contre-jour — et il coûte cher, car un
 * contour ouvert n'a ni surface, ni pièce, ni métré.
 *
 * On cherche les BOUTS LIBRES qui se font face : une extrémité que rien ne
 * touche, en regard d'une autre, assez proche pour qu'un mur les relie.
 *
 * Trois gardes, chacune payée par un cas réel :
 * - les bouts DÉJÀ soudés ne sont pas des trous (`weldCorners` s'en charge) ;
 * - au-delà de deux mètres, ce n'est plus une menuiserie manquée mais une
 *   pièce entière que le scan n'a pas vue : on ne devine pas un mur de
 *   cette taille ;
 * - les deux murs doivent SE SUIVRE, pas se croiser : deux murs
 *   perpendiculaires dont les bouts sont voisins forment un coin, et les
 *   relier tirerait une diagonale en travers de la pièce.
 */
export function trousDuRelevé(
  walls: WallSeg[],
  ecartMax = 2,
  tol = 0.15,
): TrouDeReleve[] {
  const pleins = walls.filter((w) => w.type === 'wall' && segLength(w) > 0.1);
  const bouts: { wall: WallSeg; p: Pt; u: Pt }[] = [];
  for (const w of pleins) {
    const l = segLength(w) || 1;
    const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    // La direction SORTANTE de chaque bout : celle où le mur continuerait.
    bouts.push({ wall: w, p: w.a, u: { x: -u.x, z: -u.z } });
    bouts.push({ wall: w, p: w.b, u });
  }
  /** Ce bout touche-t-il déjà un autre mur ? Alors il n'y a rien à combler. */
  const libre = (b: { wall: WallSeg; p: Pt }) =>
    !pleins.some(
      (o) =>
        o.id !== b.wall.id &&
        (Math.hypot(o.a.x - b.p.x, o.a.z - b.p.z) < tol ||
          Math.hypot(o.b.x - b.p.x, o.b.z - b.p.z) < tol ||
          pointOnSeg(b.p, o.a, o.b).dist < tol),
    );
  const out: TrouDeReleve[] = [];
  const pris = new Set<string>();
  for (let i = 0; i < bouts.length; i++) {
    for (let j = i + 1; j < bouts.length; j++) {
      const A = bouts[i];
      const B = bouts[j];
      if (A.wall.id === B.wall.id) continue;
      const ecart = Math.hypot(B.p.x - A.p.x, B.p.z - A.p.z);
      if (ecart < tol || ecart > ecartMax) continue;
      if (!libre(A) || !libre(B)) continue;
      // Les deux murs se suivent : leurs axes sont parallèles…
      const ua = A.u;
      const ub = B.u;
      if (Math.abs(ua.x * ub.x + ua.z * ub.z) < 0.9) {
        /*
          …OU ILS DEVAIENT SE REJOINDRE EN UN COIN — revue « Camille » : un
          coin raté de seize centimètres (au-delà de la soudure automatique)
          faisait disparaître un séjour de 27 m², sans aucune alerte. Les
          deux droites se croisent tout près des deux bouts, devant chacun :
          c'est un coin à fermer.
        */
        if (ecart > 0.6) continue;
        const den = ua.x * ub.z - ua.z * ub.x;
        if (Math.abs(den) < 1e-6) continue;
        const dx = B.p.x - A.p.x;
        const dz = B.p.z - A.p.z;
        const s = (dx * ub.z - dz * ub.x) / den;
        const t = (dx * ua.z - dz * ua.x) / den;
        if (s < -0.02 || s > 0.5 || t < -0.02 || t > 0.5) continue;
        const cleCoin = [A.wall.id, B.wall.id].sort().join('|');
        if (pris.has(cleCoin)) continue;
        pris.add(cleCoin);
        out.push({
          a: { ...A.p },
          b: { ...B.p },
          wallA: A.wall.id,
          wallB: B.wall.id,
          ecart,
          coin: { x: A.p.x + ua.x * s, z: A.p.z + ua.z * s },
        });
        continue;
      }
      // …et chacun continue VERS l'autre, sinon ils se tournent le dos.
      const versB = { x: (B.p.x - A.p.x) / ecart, z: (B.p.z - A.p.z) / ecart };
      if (ua.x * versB.x + ua.z * versB.z < 0.9) continue;
      const cle = [A.wall.id, B.wall.id].sort().join('|');
      if (pris.has(cle)) continue;
      pris.add(cle);
      out.push({
        a: { ...A.p },
        b: { ...B.p },
        wallA: A.wall.id,
        wallB: B.wall.id,
        ecart,
      });
    }
  }
  return out.sort((x, y) => x.ecart - y.ecart);
}

/**
 * LE COIN QUI SE SOUDE À UN BOUT DE MUR.
 *
 * Le magnétisme du plan alignait PAR AXE : le x sur un bout, le z sur un
 * autre. Un coin tiré près d'une extrémité se retrouvait donc « à l'aplomb »
 * des deux sans en toucher aucune — un contour qui paraît fermé et qui fuit
 * par un interstice de dix centimètres. Ni surface, ni pièce, ni métré.
 *
 * On cherche donc d'abord une VRAIE jonction : l'extrémité de mur la plus
 * proche, en distance franche, et on s'y pose exactement. Vingt-cinq
 * centimètres de portée — le double de l'alignement par axe, parce qu'ici
 * l'intention ne fait aucun doute : personne n'amène un coin à vingt
 * centimètres d'un autre pour l'y laisser.
 *
 * `exclude` est le point qu'on tient : sans lui, le coin se soudrait à
 * lui-même et ne bougerait plus.
 */
export function soudureAuBout(
  p: Pt,
  walls: WallSeg[],
  tol = 0.25,
  exclude?: Pt,
): Pt | null {
  let meilleur: Pt | null = null;
  let court = tol;
  for (const w of walls) {
    if (segLength(w) < 0.05) continue;
    for (const end of ['a', 'b'] as const) {
      const q = w[end];
      if (exclude && Math.hypot(q.x - exclude.x, q.z - exclude.z) < 1e-6) {
        continue;
      }
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < court) {
        court = d;
        meilleur = { x: q.x, z: q.z };
      }
    }
  }
  return meilleur;
}

/**
 * OÙ NAÎT UN MUR AJOUTÉ À LA MAIN.
 *
 * « Un mètre au centre du plan » : le mur neuf tombait au milieu du séjour,
 * loin de tout, et il fallait le recoller des deux mains — deux coins à
 * viser au doigt sur un écran de six pouces. Or ce qu'on ajoute à la main
 * manque TOUJOURS quelque part au bout de ce qui existe.
 *
 * Le mur neuf part donc du dernier bout libre du tracé et CONTINUE DROIT,
 * comme un trait de crayon qu'on reprend : son premier coin est déjà soudé,
 * il ne reste qu'à tirer le second. Enchaînés, ces murs referment une pièce
 * l'un après l'autre.
 *
 * `null` quand le plan est vide ou déjà fermé : il n'y a alors aucun bout
 * libre, et l'appelant pose au centre comme avant.
 */
export function murNeufDepuisUnBout(
  walls: WallSeg[],
  longueur = 1,
  tol = 0.15,
): { a: Pt; b: Pt } | null {
  const pleins = walls.filter((w) => w.type === 'wall' && segLength(w) > 0.1);
  const libre = (w: WallSeg, p: Pt) =>
    !pleins.some(
      (o) =>
        o.id !== w.id &&
        (Math.hypot(o.a.x - p.x, o.a.z - p.z) < tol ||
          Math.hypot(o.b.x - p.x, o.b.z - p.z) < tol),
    );
  // Du plus récent au plus ancien : on reprend le tracé là où on l'a
  // laissé, et par le bout `b` d'abord — c'est le sens dans lequel le mur
  // a été posé.
  for (let i = pleins.length - 1; i >= 0; i--) {
    const w = pleins[i];
    const l = segLength(w) || 1;
    const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    if (libre(w, w.b)) {
      return {
        a: { x: w.b.x, z: w.b.z },
        b: { x: w.b.x + u.x * longueur, z: w.b.z + u.z * longueur },
      };
    }
    if (libre(w, w.a)) {
      return {
        a: { x: w.a.x, z: w.a.z },
        b: { x: w.a.x - u.x * longueur, z: w.a.z - u.z * longueur },
      };
    }
  }
  return null;
}

/**
 * REPORTE UNE OUVERTURE D'UN MUR QUI A BOUGÉ SUR CE QU'IL EST DEVENU.
 *
 * Relevé du patron : « les ouvrants ne suivent pas la modification lors de
 * mouvements du mur et rotations ». Pousser une cloison et lui poser un angle
 * emportaient déjà les percements ; TIRER UN COIN, non — et c'est le geste le
 * plus courant des trois, celui qui rallonge, raccourcit et fait pivoter en
 * même temps. La porte restait où elle était, c'est-à-dire dans le vide.
 *
 * LA RÈGLE : l'ouverture garde sa cote DEPUIS LE BOUT QUI NE BOUGE PAS
 * (`ancre`). C'est la vérité du chantier — on tire un mur, la porte ne se
 * déplace pas dans la pièce ; c'est le mur qui s'allonge derrière elle. Et
 * c'est la convention de la saisie : `moveOpening` prend la cote du tableau
 * depuis le début du mur.
 *
 * Son ÉCART À L'AXE est conservé tel quel : une menuiserie n'est pas
 * exactement sur l'axe du mur, et la recentrer la ferait sauter d'un côté à
 * l'autre à chaque geste.
 *
 * ET ELLE NE DÉBORDE JAMAIS. Un mur raccourci sous la porte qu'il porte
 * laisserait une menuiserie à cheval sur son bout — c'est-à-dire un trou dans
 * le contour, et une surface qui fuit. On la range dedans.
 */
export function reporterOuverture<T extends { a: Pt; b: Pt }>(
  o: T,
  avant: { a: Pt; b: Pt },
  apres: { a: Pt; b: Pt },
  ancre: 'a' | 'b',
): T {
  const l1 = Math.hypot(avant.b.x - avant.a.x, avant.b.z - avant.a.z);
  const l2 = Math.hypot(apres.b.x - apres.a.x, apres.b.z - apres.a.z);
  if (l1 < 1e-6 || l2 < 1e-6) return o;
  const u1 = { x: (avant.b.x - avant.a.x) / l1, z: (avant.b.z - avant.a.z) / l1 };
  const n1 = { x: -u1.z, z: u1.x };
  const u2 = { x: (apres.b.x - apres.a.x) / l2, z: (apres.b.z - apres.a.z) / l2 };
  const n2 = { x: -u2.z, z: u2.x };
  /** La cote d'un point depuis `a`, et son écart à l'axe. */
  const lire = (p: Pt) => ({
    t: (p.x - avant.a.x) * u1.x + (p.z - avant.a.z) * u1.z,
    e: (p.x - avant.a.x) * n1.x + (p.z - avant.a.z) * n1.z,
  });
  const A = lire(o.a);
  const B = lire(o.b);
  /* Depuis le bout FIXE : c'est lui qui ne bouge pas, donc lui qui garde
     la cote. Tirer `b` laisse la porte à un mètre de `a` ; tirer `a` la
     laisse à deux mètres dix de `b`. */
  const reporte = (t: number) => (ancre === 'a' ? t : l2 - (l1 - t));
  let ta = reporte(A.t);
  let tb = reporte(B.t);
  const bas = Math.min(ta, tb);
  const haut = Math.max(ta, tb);
  let cale = 0;
  if (bas < 0) cale = -bas;
  if (haut + cale > l2) cale = Math.min(cale, l2 - haut);
  if (bas + cale < 0) cale = -bas;
  ta += cale;
  tb += cale;
  const pose = (t: number, e: number): Pt => ({
    x: apres.a.x + u2.x * t + n2.x * e,
    z: apres.a.z + u2.z * t + n2.z * e,
  });
  return { ...o, a: pose(ta, A.e), b: pose(tb, B.e) };
}

/**
 * UNE POSE POSSIBLE POUR UN MUR NEUF : d'où il part, et où il va.
 */
export interface PoseDeMur {
  /** `murId:bout:angle` — stable d'un rendu à l'autre. */
  id: string;
  /** Le mur dont le bout accueille la pose. */
  wallId: string;
  /** Lequel de ses deux bouts. */
  bout: 'a' | 'b';
  /** 0 = droit dans la continuité ; 90 et −90 = les deux équerres. */
  angle: 0 | 90 | -90;
  a: Pt;
  b: Pt;
  /**
   * `bout` : au bout libre d'un mur (par défaut) ; `t` : une cloison qui
   * part du FLANC d'un mur, en T — le placard, la salle d'eau qu'on
   * recoupe dans une chambre.
   */
  genre?: 'bout' | 't';
}

/**
 * TOUTES LES POSES QU'ON PEUT OFFRIR À UN MUR NEUF.
 *
 * Relevé du patron : « "Ajouter un mur" doit afficher les multiples
 * possibilités d'attachement à un autre mur dans des angles de 90° et 180°
 * pour droit, à chaque fin de mur ».
 *
 * Le mur neuf naissait tout seul au dernier bout libre, droit devant
 * (`murNeufDepuisUnBout`). C'était déjà mieux que le mètre posé au milieu du
 * séjour, mais l'application CHOISISSAIT à la place de l'électricien : sur un
 * plan qui a trois bouts libres elle en prenait un, et pour tourner à
 * l'équerre il fallait poser le mur puis le faire pivoter au doigt.
 *
 * On montre donc, et c'est lui qui choisit. Trois poses par bout libre, et
 * trois seulement — ce sont les seules qui tiennent debout sur un plan de
 * bâtiment : droit dans la continuité, à l'équerre d'un côté, à l'équerre de
 * l'autre. Le mur de biais reste possible : on tire le coin après, comme
 * avant. Un éventail de douze directions aurait fait un oursin illisible sur
 * un plan déjà chargé, pour un cas qui ne se présente presque jamais.
 *
 * Un bout est LIBRE quand aucun autre mur ne s'y termine : c'est la même
 * règle que le mur neuf d'un seul bout, et c'est celle du chantier — un
 * coin déjà fait ne s'ouvre pas.
 */
export function posesDeMur(
  walls: WallSeg[],
  longueur = 1,
  tol = 0.15,
): PoseDeMur[] {
  const pleins = walls.filter((w) => w.type === 'wall' && segLength(w) > 0.1);
  /*
    LE PIED D'UN T N'EST PAS UN BOUT LIBRE — revue « Claire » : une cloison
    qui s'arrête sur le FLANC d'un mur porteur recevait trois fantômes
    « Ajouter un mur », dont deux couchés sur le porteur ; en toucher un
    posait un doublon. Un bout posé contre un autre mur est tenu.
  */
  const libre = (w: WallSeg, p: Pt) =>
    !pleins.some(
      (o) =>
        o.id !== w.id &&
        (Math.hypot(o.a.x - p.x, o.a.z - p.z) < tol ||
          Math.hypot(o.b.x - p.x, o.b.z - p.z) < tol ||
          pointOnSeg(p, o.a, o.b).dist < Math.max(tol / 3, epaisseurDe(o) / 2 + 0.01)),
    );
  const out: PoseDeMur[] = [];
  for (const w of pleins) {
    const l = segLength(w) || 1;
    const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    for (const bout of ['a', 'b'] as const) {
      const p = bout === 'b' ? w.b : w.a;
      if (!libre(w, p)) continue;
      // La direction SORTANTE : celle qui s'éloigne du mur, pas celle qui
      // repasserait dessus.
      const s = bout === 'b' ? u : { x: -u.x, z: -u.z };
      const n = { x: -s.z, z: s.x };
      const directions: [PoseDeMur['angle'], Pt][] = [
        [0, s],
        [90, n],
        [-90, { x: -n.x, z: -n.z }],
      ];
      for (const [angle, d] of directions) {
        out.push({
          id: `${w.id}:${bout}:${angle}`,
          wallId: w.id,
          bout,
          angle,
          a: { x: p.x, z: p.z },
          b: { x: p.x + d.x * longueur, z: p.z + d.z * longueur },
        });
      }
    }
  }
  return out;
}

/**
 * LE CÔTÉ DEHORS D'UN MUR — la normale qui s'éloigne de sa pièce.
 *
 * « Décaler vers l'extérieur » doit vouloir dire la même chose quel que soit
 * le sens dans lequel le scan a tracé le mur : on prend la perpendiculaire
 * qui s'éloigne du centre des murs de SA pièce (de tout le plan, si le mur
 * n'a pas de pièce).
 */
export function normaleSortante(w: WallSeg, walls: WallSeg[]): Pt {
  const l = segLength(w) || 1;
  const n = { x: -(w.b.z - w.a.z) / l, z: (w.b.x - w.a.x) / l };
  const siens = walls.filter((x) => x.type === 'wall' && roomOf(x) === roomOf(w));
  const tous = siens.length > 0 ? siens : walls;
  let cx = 0;
  let cz = 0;
  for (const x of tous) {
    cx += (x.a.x + x.b.x) / 2;
    cz += (x.a.z + x.b.z) / 2;
  }
  cx /= tous.length || 1;
  cz /= tous.length || 1;
  const mx = (w.a.x + w.b.x) / 2;
  const mz = (w.a.z + w.b.z) / 2;
  return n.x * (mx - cx) + n.z * (mz - cz) >= 0 ? n : { x: -n.x, z: -n.z };
}

/**
 * LA CLOISON EN T — les deux poses au flanc d'un mur choisi.
 *
 * Les poses au bout libre ne savent pas recouper une pièce : un placard,
 * une salle d'eau prise sur une chambre partent du MILIEU d'un mur, pas de
 * son bout. On en propose deux, une de chaque côté, au milieu du mur ; la
 * position exacte se donne ensuite en centimètres (`murNeufCote`).
 */
export function posesEnT(w: WallSeg, longueur = 1): PoseDeMur[] {
  const l = segLength(w);
  if (l < 0.3) return [];
  const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
  const n = { x: -u.z, z: u.x };
  const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
  return ([1, -1] as const).map((s) => ({
    id: `${w.id}:t:${s}`,
    wallId: w.id,
    bout: 'a' as const,
    angle: (s === 1 ? 90 : -90) as 90 | -90,
    genre: 't' as const,
    a: m,
    b: { x: m.x + n.x * s * longueur, z: m.z + n.z * s * longueur },
  }));
}

/** Ce qu'on a mesuré au mètre ruban pour poser un mur neuf (m). */
export interface SaisieMurNeuf {
  /** Du nu du mur de départ au bout du mur neuf. */
  longueur: number;
  epaisseur: number;
  /** En T : du nu du coin au nu du mur neuf, le long du mur de départ. */
  depuis?: number;
  /** En T : compter depuis l'autre coin du mur de départ. */
  depuisB?: boolean;
}

/**
 * Le retrait du coin d'un mur : la demi-épaisseur du mur qui s'y soude.
 *
 * Le trait du plan est l'axe ; la pièce, elle, commence au NU du mur
 * voisin. Une cote prise au mètre dans un angle part de ce nu.
 */
export function retraitDuCoin(walls: WallSeg[], hote: WallSeg, coin: Pt): number {
  /*
    LE MUR QUI FAIT LE COIN, PAS LE PREMIER VENU — revue « Hugo » : sa
    fenêtre cotée « à 80 cm de la cloison » tombait à 83,5. Au bout du mur,
    deux voisins : la cloison de 7 cm qui fait le coin, et le morceau du
    même mur de 14 cm, dans son prolongement — le premier trouvé. Un
    prolongement ne ferme rien : seul compte le mur qui part de travers, à
    ce niveau ; s'il y en a deux, le plus épais.
  */
  const L = segLength(hote) || 1;
  const u = { x: (hote.b.x - hote.a.x) / L, z: (hote.b.z - hote.a.z) / L };
  let retrait = 0;
  for (const o of walls) {
    if (o.id === hote.id || o.type !== 'wall' || niveauDe(o) !== niveauDe(hote)) continue;
    if (
      Math.hypot(o.a.x - coin.x, o.a.z - coin.z) >= 0.05 &&
      Math.hypot(o.b.x - coin.x, o.b.z - coin.z) >= 0.05
    ) continue;
    const lo = segLength(o) || 1;
    const v = { x: (o.b.x - o.a.x) / lo, z: (o.b.z - o.a.z) / lo };
    if (Math.abs(u.x * v.z - u.z * v.x) < 0.5) continue;
    retrait = Math.max(retrait, epaisseurDe(o) / 2);
  }
  return retrait;
}

/** La cote par défaut d'une cloison en T : celle du milieu du mur, au nu. */
export function depuisParDefaut(
  walls: WallSeg[],
  pose: PoseDeMur,
  epaisseur: number,
  depuisB = false,
): number {
  const hote = walls.find((w) => w.id === pose.wallId);
  if (!hote) return 0;
  const coin = depuisB ? hote.b : hote.a;
  const v = segLength(hote) / 2 - retraitDuCoin(walls, hote, coin) - epaisseur / 2;
  return Math.max(0, Math.round(v * 100) / 100);
}

/**
 * LE MUR NEUF AUX COTES DU MÈTRE RUBAN — relevé du patron : « l'ajout d'un
 * mur n'est pas opérationnel, on doit le placer au millimètre près
 * nous-même, alors que les épaisseurs des murs comptent ».
 *
 * Le mur neuf naissait à un mètre, et il fallait le tirer au doigt jusqu'à
 * la bonne cote — sur un écran où le millimètre fait un dixième de pixel.
 * On TAPE maintenant ce qu'on a mesuré, et on le mesure comme sur le
 * chantier : d'une face à l'autre. L'application fait la conversion vers
 * l'axe, qui est ce que le plan dessine :
 *
 *   — au bout libre, droit devant : la longueur est celle du mur neuf ;
 *   — à l'équerre d'un bout, ou en T : la longueur part de la FACE du mur
 *     de départ, à une demi-épaisseur de son axe ;
 *   — en T, la position se mesure du nu du coin au nu du mur neuf : le
 *     coin recule d'une demi-épaisseur du mur qui le ferme, et l'axe du mur
 *     neuf avance de la moitié de la sienne.
 */
export function murNeufCote(
  walls: WallSeg[],
  pose: PoseDeMur,
  s: SaisieMurNeuf,
): { a: Pt; b: Pt } | null {
  const hote = walls.find((w) => w.id === pose.wallId);
  if (!hote || !(s.longueur > 0) || !(s.epaisseur > 0)) return null;
  const eH = epaisseurDe(hote);
  const l0 = Math.hypot(pose.b.x - pose.a.x, pose.b.z - pose.a.z);
  if (l0 < 1e-6) return null;
  const d = { x: (pose.b.x - pose.a.x) / l0, z: (pose.b.z - pose.a.z) / l0 };
  const tirer = (p: Pt, axe: number) => ({
    a: { x: p.x, z: p.z },
    b: { x: p.x + d.x * axe, z: p.z + d.z * axe },
  });
  if (pose.genre !== 't') {
    return tirer(pose.a, pose.angle === 0 ? s.longueur : s.longueur + eH / 2);
  }
  const L = segLength(hote);
  if (L < 1e-6) return null;
  const u = { x: (hote.b.x - hote.a.x) / L, z: (hote.b.z - hote.a.z) / L };
  const coin = s.depuisB ? hote.b : hote.a;
  const sens = s.depuisB ? -1 : 1;
  let t = retraitDuCoin(walls, hote, coin) + (s.depuis ?? 0) + s.epaisseur / 2;
  // Le mur neuf reste SUR son mur de départ : au-delà, ce ne serait plus un T.
  t = Math.min(Math.max(t, s.epaisseur / 2), L - s.epaisseur / 2);
  const p = { x: coin.x + u.x * sens * t, z: coin.z + u.z * sens * t };
  return tirer(p, s.longueur + eH / 2);
}

/**
 * L'ANGLE BRUT, RAMENÉ DANS LE TOUR OÙ LE GESTE SE TROUVE.
 *
 * Un `atan2` rend toujours un angle de ]-180°, 180°] : un doigt qui franchit
 * le demi-tour faisait sauter le mur d'un tour complet en sens inverse. On
 * ramène donc l'angle brut au multiple de 360° le plus proche du précédent :
 * le geste devient continu, et le passage du demi-tour ne casse plus rien.
 */
export function deplier(precedent: number, brut: number): number {
  return brut + Math.round((precedent - brut) / 360) * 360;
}

/**
 * L'AIMANT DES ANGLES — appliqué UNE FOIS, sur l'angle voulu.
 *
 * Relevé du chantier : « la rotation ne suit pas bien le mouvement ». Le
 * défaut n'était pas dans le doigt, il était ici : l'accroche portait sur
 * chaque MICRO-PAS, et se rappliquait au pas suivant depuis le cran déjà
 * atteint. Le mur restait scotché à l'équerre pendant que la main
 * continuait — puis rattrapait d'un coup.
 *
 * L'aimant lit maintenant l'angle ABSOLU que le doigt désigne : à deux
 * degrés d'un cran on colle, à cinq on est libre, et on s'en décolle aussi
 * facilement qu'on s'y est collé.
 */
export function angleAimante(vise: number, crans: number[], tol = 3): number {
  let mieux = tol;
  let sortie = vise;
  for (const c of crans) {
    // Un cran vaut pour toutes ses images à 180° près : un mur retourné
    // bout pour bout est le même mur sur le plan.
    for (const k of [-540, -360, -180, 0, 180, 360, 540]) {
      const d = Math.abs(vise - (c + k));
      if (d < mieux) {
        mieux = d;
        sortie = c + k;
      }
    }
  }
  return sortie;
}

/**
 * LES ANGLES SUR LESQUELS UN MUR S'ARRÊTE VOLONTIERS.
 *
 * L'équerre et ses quinzièmes — un mur se pose droit, en biais à
 * quarante-cinq, rarement à trente-sept — ET les angles des murs déjà
 * présents : aligner une cloison sur celle d'en face est le geste le plus
 * courant du plan, il mérite le même cran que l'équerre.
 */
export function anglesRemarquables(walls: WallSeg[], sauf?: string): number[] {
  const crans: number[] = [];
  for (let d = -180; d <= 180; d += 15) crans.push(d);
  for (const w of walls) {
    if (w.id === sauf || segLength(w) < 0.1) continue;
    crans.push((Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI);
  }
  return crans;
}

export function weldCorners(walls: WallSeg[], tol = 0.15): WallSeg[] {
  const out = walls.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } }));
  const points: { wall: WallSeg; end: 'a' | 'b' }[] = [];
  for (const w of out) {
    points.push({ wall: w, end: 'a' }, { wall: w, end: 'b' });
  }

  /*
    DEUX COINS RELIÉS PAR UN MUR NE SE SOUDENT PAS — revue « Hugo ». Une
    chambre accolée au couloir le dépasse d'une épaisseur de mur : un retour
    de 14 cm, dessiné, entre deux coins. Sous la tolérance de 15 cm, la
    soudure les fondait en un seul — le retour disparaissait, le mur voisin
    partait en biais, et « Redétecter », « Scinder » ou « Couper » perdaient
    la chambre (9 pièces devenaient 5). Un mur qui relie deux bouts dit
    qu'ils sont deux : on ne soude que ce qu'aucun mur ne sépare. Même un
    bout de 1 à 4 cm (revue « Inès » : une salle de bains qui dépasse le
    séjour d'un rien) : soudé, il rouvrait le contour.
  */
  const RETOUR_MIN = ECLAT;
  const memePoint = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-4;
  const relies = (cluster: number[], j: number) => {
    const pj = points[j].wall[points[j].end];
    return out.some((w) => {
      if (segLength(w) < RETOUR_MIN) return false;
      const bouts = [w.a, w.b];
      const ici = bouts.findIndex((q) => memePoint(q, pj));
      if (ici < 0) return false;
      const autre = bouts[1 - ici];
      return cluster.some((k) => memePoint(points[k].wall[points[k].end], autre));
    });
  };
  const assigned = new Set<number>();
  const welded = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    if (assigned.has(i)) continue;
    const pi = points[i].wall[points[i].end];
    const room = roomOf(points[i].wall);
    const cluster = [i];
    /*
      DE PROCHE EN PROCHE — revue « Hélène » : la grappe ne se mesurait qu'au
      premier bout trouvé. Trois bouts à 14 cm l'un de l'autre en chaîne (un
      coin, un éclat, la façade d'en face) ne se réunissaient pas : 28 cm du
      premier au dernier, la pièce restait ouverte. Un bout rejoint la grappe
      s'il est à portée de l'un de ses bouts — sans s'éloigner de plus d'une
      fois et demie la tolérance du premier.
    */
    for (let ajout = true; ajout; ) {
      ajout = false;
      for (let j = i + 1; j < points.length; j++) {
        if (assigned.has(j) || cluster.includes(j)) continue;
        if (roomOf(points[j].wall) !== room) continue;
        const pj = points[j].wall[points[j].end];
        if (Math.hypot(pi.x - pj.x, pi.z - pj.z) >= tol * 1.5) continue;
        const proche = cluster.some((k) => {
          const pk = points[k].wall[points[k].end];
          return Math.hypot(pk.x - pj.x, pk.z - pj.z) < tol;
        });
        if (proche && !relies(cluster, j)) {
          cluster.push(j);
          ajout = true;
        }
      }
    }
    if (cluster.length > 1) {
      let cx =
        cluster.reduce((s, k) => s + points[k].wall[points[k].end].x, 0) /
        cluster.length;
      let cz =
        cluster.reduce((s, k) => s + points[k].wall[points[k].end].z, 0) /
        cluster.length;
      /*
        UN COIN SE SOUDE À LA RENCONTRE DE SES DEUX MURS — revue « Léon » :
        une façade arrêtée à 4 cm du pignon se soudait au milieu des deux
        bouts. La façade perdait 2 cm (3,58 au lieu de 3,60) et le pignon
        partait de travers d'un demi-degré. Deux murs qui se croisent
        franchement se rejoignent là où leurs droites se coupent.
      */
      if (cluster.length === 2 && points[cluster[0]].wall !== points[cluster[1]].wall) {
        const [p, q] = cluster.map((k) => points[k]);
        const P = p.wall[p.end];
        const Q = q.wall[q.end];
        const dirDe = (w: WallSeg) => {
          const l = segLength(w) || 1;
          return { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
        };
        const u1 = dirDe(p.wall);
        const u2 = dirDe(q.wall);
        const den = u1.x * u2.z - u1.z * u2.x;
        if (Math.abs(den) > 0.26 && segLength(p.wall) > 0.1 && segLength(q.wall) > 0.1) {
          const s = ((Q.x - P.x) * u2.z - (Q.z - P.z) * u2.x) / den;
          const X = { x: P.x + u1.x * s, z: P.z + u1.z * s };
          if (Math.hypot(X.x - P.x, X.z - P.z) < tol * 1.5 && Math.hypot(X.x - Q.x, X.z - Q.z) < tol * 1.5) {
            cx = X.x;
            cz = X.z;
          }
        }
      }
      for (const k of cluster) {
        points[k].wall[points[k].end] = { x: cx, z: cz };
        assigned.add(k);
        welded.add(k);
      }
    }
  }

  // Jonctions en T : extrémité libre posée sur le flanc d'un autre mur.
  const teeTol = tol * 1.6;
  for (let i = 0; i < points.length; i++) {
    if (welded.has(i)) continue;
    const { wall, end } = points[i];
    const p = wall[end];
    const room = roomOf(wall);
    let best: { d: number; q: Pt } | null = null;
    for (const v of out) {
      if (v.id === wall.id || roomOf(v) !== room) continue;
      const dx = v.b.x - v.a.x;
      const dz = v.b.z - v.a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-9) continue;
      const t = ((p.x - v.a.x) * dx + (p.z - v.a.z) * dz) / len2;
      // Proche d'un bout : c'est un coin. En centimètres, pas en part du mur
      // — revue « Hélène » : 3 % d'un couloir de 12 m, c'étaient 36 cm, et une
      // cloison arrêtée à 17 cm d'un nœud restait pendante.
      const lv = Math.sqrt(len2);
      if (t * lv < BOUT_DE_T || (1 - t) * lv < BOUT_DE_T) continue;
      const q = { x: v.a.x + dx * t, z: v.a.z + dz * t };
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < teeTol && (!best || d < best.d)) best = { d, q };
    }
    if (best) wall[end] = best.q;
  }

  return out;
}

// ------------------------------------------------- redressement du plan

/**
 * Direction dominante du plan, en radians dans [0, π/2).
 *
 * C'est LA référence de tout ce qui s'aligne : le redressement comme le
 * magnétisme de l'édition. Les axes du repère ARKit, eux, ne veulent rien
 * dire — ils dépendent de l'endroit où le scan a commencé.
 */
export function planFrameAngle(walls: WallSeg[]): number {
  const q = Math.PI / 2;
  /** La trame que votent ces murs, pondérés par leur longueur. */
  const vote = (garde: (a: number) => boolean): number | null => {
    let sx = 0;
    let sy = 0;
    for (const w of walls) {
      const len = segLength(w);
      if (len < 0.2 || w.angleVoulu) continue;
      const a = Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x);
      if (!garde(a)) continue;
      // Période de 90° : on quadruple l'angle pour en faire un tour complet,
      // on moyenne les vecteurs, puis on revient. Un mur et son perpendiculaire
      // votent ainsi pour la MÊME trame.
      sx += len * Math.cos(4 * a);
      sy += len * Math.sin(4 * a);
    }
    if (sx === 0 && sy === 0) return null;
    let t = Math.atan2(sy, sx) / 4;
    while (t < 0) t += q;
    while (t >= q) t -= q;
    return t;
  };
  const brute = vote(() => true);
  if (brute === null) return 0;
  /*
    UN MUR VOLONTAIREMENT DE BIAIS NE VOTE PAS — revue « Karim » : un seul mur
    à 80° (une chambre trapézoïdale) tirait toute la trame de 0,57°, et
    « Redresser » faisait tourner la maison : plus un seul mur d'aplomb. Au
    second tour, seuls votent les murs à moins de 5° de la première trame ;
    un pan coupé, un mur à 80°, un bow-window n'y comptent plus.
  */
  const ecartALaTrame = (a: number) => {
    let d = (a - brute) % q;
    if (d < 0) d += q;
    return Math.min(d, q - d);
  };
  return vote((a) => ecartALaTrame(a) < (5 * Math.PI) / 180) ?? brute;
}

/** Union-find minimal sur des clés de nœud. */
function makeUnion() {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = parent.get(k) ?? k;
    if (r !== k) {
      r = find(r);
      parent.set(k, r);
    }
    return r;
  };
  return {
    find,
    union: (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    },
  };
}

/**
 * Redresse le plan sur sa propre trame.
 *
 * Un scan LiDAR ne donne jamais un angle droit exact : on récolte des coins à
 * 89,2° et des cotes comme 3,93 m. Le plan a pourtant été bâti d'équerre, et
 * c'est ce qu'attend l'œil — comme le devis qui en découlera.
 *
 * On ne touche PAS aux murs un par un : les redresser séparément ouvrirait
 * les coins. On aligne les NŒUDS. Après avoir trouvé la trame dominante du
 * logement (moyenne des directions, pondérée par les longueurs, de période
 * 90°), tout mur assez proche de l'horizontale de cette trame impose à ses
 * deux extrémités la même ordonnée ; tout mur proche de la verticale, la même
 * abscisse. Chaque groupe de coordonnées ainsi liées prend sa moyenne. Les
 * coins restent donc exactement soudés, la boucle reste fermée, et les murs
 * franchement obliques — un pan coupé, une baie en biais — ne bougent pas.
 */
export function straightenWalls(
  walls: WallSeg[],
  toleranceDeg = 8,
): WallSeg[] {
  if (walls.length === 0) return walls;
  const theta = planFrameAngle(walls);
  const cos = Math.cos(-theta);
  const sin = Math.sin(-theta);
  const fwd = (p: Pt): Pt => ({
    x: p.x * cos - p.z * sin,
    z: p.x * sin + p.z * cos,
  });
  const back = (p: Pt): Pt => ({
    x: p.x * cos + p.z * sin,
    z: -p.x * sin + p.z * cos,
  });

  // Coordonnées de chaque nœud, dans la trame du logement.
  const nodes = new Map<string, Pt>();
  const keyOf = (p: Pt) => nodeKey(p);
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      nodes.set(keyOf(w[end]), fwd(w[end]));
    }
  }

  const ux = makeUnion();
  const uz = makeUnion();
  const tol = (toleranceDeg * Math.PI) / 180;
  for (const w of walls) {
    // Un angle tapé reste tel qu'on l'a voulu.
    if (w.angleVoulu) continue;
    const ka = keyOf(w.a);
    const kb = keyOf(w.b);
    const A = nodes.get(ka)!;
    const B = nodes.get(kb)!;
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    if (Math.hypot(dx, dz) < 1e-6) continue;
    const ang = Math.atan2(dz, dx);
    const nearAxis = (target: number) => {
      const d = Math.abs(((ang - target + Math.PI) % Math.PI) - 0);
      return Math.min(d, Math.PI - d) < tol;
    };
    if (nearAxis(0)) uz.union(ka, kb); // horizontal : même z
    else if (nearAxis(Math.PI / 2)) ux.union(ka, kb); // vertical : même x
  }

  // Chaque groupe de coordonnées liées prend sa moyenne.
  const avg = (
    u: ReturnType<typeof makeUnion>,
    pick: (p: Pt) => number,
  ): Map<string, number> => {
    const sums = new Map<string, { s: number; n: number }>();
    for (const [k, p] of nodes) {
      const r = u.find(k);
      const cur = sums.get(r) ?? { s: 0, n: 0 };
      cur.s += pick(p);
      cur.n += 1;
      sums.set(r, cur);
    }
    const out = new Map<string, number>();
    for (const [k] of nodes) {
      const r = sums.get(u.find(k))!;
      out.set(k, r.s / r.n);
    }
    return out;
  };
  const xs = avg(ux, (p) => p.x);
  const zs = avg(uz, (p) => p.z);

  const moved = new Map<string, Pt>();
  for (const [k] of nodes) {
    moved.set(k, back({ x: xs.get(k)!, z: zs.get(k)! }));
  }
  return walls.map((w) => ({
    ...w,
    a: moved.get(keyOf(w.a)) ?? w.a,
    b: moved.get(keyOf(w.b)) ?? w.b,
  }));
}

/**
 * Fait suivre les portes et fenêtres quand leurs murs bougent.
 *
 * Une ouverture est une surface indépendante, posée dans le plan de son mur
 * mais sans lien avec lui : redresser les murs les laissait donc sur place,
 * décalées, et le rendu ne les rattachait plus. On note où chacune se trouve
 * LE LONG de son mur d'origine, puis on la repose au même endroit sur le mur
 * devenu droit — même identifiant, même fraction de longueur.
 */
/**
 * REPOSE UN POINT INTÉRIEUR DANS SA PIÈCE, quand la pièce a bougé.
 *
 * Relevé du patron : « au redressage d'une pièce, les spots se décentrent..
 * il faut qu'ils gardent une cohérence de centrage si c'était voulu. »
 *
 * LA COHÉRENCE, C'EST LA POSITION RELATIVE : le point s'exprime en
 * fractions de la boîte de sa pièce (le centre est à un demi, le quart à un
 * quart), et se repose aux mêmes fractions dans la boîte d'arrivée. Un spot
 * centré reste centré, un semis posé aux tiers reste aux tiers — que la
 * pièce ait été redimensionnée, recalée par la soudure des coins ou remise
 * d'équerre.
 *
 * LA BOÎTE EST CELLE DES AXES DU PLAN, et ça suffit : les pièces qui
 * passent ici sont d'aplomb ou en train de le devenir — et le seul cas où
 * une boîte d'axes trahirait (une pièce uniformément tournée) est
 * précisément celui où rien ne bouge, l'équerre la laissant en paix.
 */
export function recadrerAuCadre(p: Pt, avant: Pt[], apres: Pt[]): Pt {
  if (avant.length < 3 || apres.length < 3) return p;
  const boite = (pts: Pt[]) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const q of pts) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minZ = Math.min(minZ, q.z);
      maxZ = Math.max(maxZ, q.z);
    }
    return { minX, maxX, minZ, maxZ, w: maxX - minX, h: maxZ - minZ };
  };
  const a = boite(avant);
  const b = boite(apres);
  if (a.w < 1e-6 || a.h < 1e-6 || b.w < 1e-6 || b.h < 1e-6) return p;
  // Un point qui débordait déjà ne se projette pas hors de la nouvelle
  // boîte : on borne la fraction, pas le résultat.
  const u = Math.max(0, Math.min(1, (p.x - a.minX) / a.w));
  const v = Math.max(0, Math.min(1, (p.z - a.minZ) / a.h));
  return { x: b.minX + u * b.w, z: b.minZ + v * b.h };
}

export function reprojectOpenings(
  oldWalls: WallSeg[],
  newWalls: WallSeg[],
  openings: WallSeg[],
): WallSeg[] {
  const after = new Map(newWalls.map((w) => [w.id, w]));
  return openings.map((o) => {
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    let host: WallSeg | null = null;
    let best = 0.6;
    for (const w of oldWalls) {
      const d = pointOnSeg(mid, w.a, w.b).dist;
      if (d < best) {
        best = d;
        host = w;
      }
    }
    const moved = host ? after.get(host.id) : undefined;
    if (!host || !moved) return o;
    const dx = host.b.x - host.a.x;
    const dz = host.b.z - host.a.z;
    const len2 = dx * dx + dz * dz || 1;
    const along = (p: Pt) =>
      ((p.x - host!.a.x) * dx + (p.z - host!.a.z) * dz) / len2;
    const at = (t: number): Pt => ({
      x: moved.a.x + (moved.b.x - moved.a.x) * t,
      z: moved.a.z + (moved.b.z - moved.a.z) * t,
    });
    return { ...o, a: at(along(o.a)), b: at(along(o.b)) };
  });
}

// --------------------------------------- découpe aux jonctions en T

/** Portion [u0, u1] d'une grille de couleurs, colonnes ré-échantillonnées. */
function sliceTexture(
  tex: SurfaceTexture | undefined,
  u0: number,
  u1: number,
): SurfaceTexture | undefined {
  if (!tex || tex.cols < 1 || tex.rows < 1) return undefined;
  const cols = Math.max(1, Math.round(tex.cols * (u1 - u0)));
  const texels: string[] = [];
  for (let r = 0; r < tex.rows; r++) {
    for (let i = 0; i < cols; i++) {
      const u = u0 + (u1 - u0) * ((i + 0.5) / cols);
      const c = Math.min(tex.cols - 1, Math.max(0, Math.floor(u * tex.cols)));
      texels.push(tex.texels[r * tex.cols + c]);
    }
  }
  return { cols, rows: tex.rows, texels };
}

/**
 * Coupe chaque mur là où un autre vient buter contre son flanc.
 *
 * C'est la condition SANS LAQUELLE la détection des pièces ne trouve rien
 * de réel : RoomPlan livre le mur d'enveloppe d'un seul tenant, et la cloison
 * qui sépare deux pièces vient s'y appuyer en son milieu. Tant que ce mur
 * n'est pas coupé au point de contact, ce point n'est pas un nœud du graphe,
 * aucun cycle ne passe par la cloison, et l'appartement entier ressort comme
 * une pièce unique.
 *
 * Le premier morceau garde l'identifiant d'origine : les ouvertures et les
 * sélections en cours continuent de le désigner.
 */
/** Une clé par nœud : deux points à moins de `tol` (m) partagent la sienne. */
function clesDesNoeuds(tol = 1e-4): (p: Pt) => string {
  const pas = tol * 2;
  const grille = new Map<string, { p: Pt; k: string }[]>();
  let n = 0;
  return (p: Pt) => {
    const ix = Math.floor(p.x / pas);
    const iz = Math.floor(p.z / pas);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const c of grille.get(`${ix + dx}:${iz + dz}`) ?? []) {
          if (Math.hypot(c.p.x - p.x, c.p.z - p.z) <= tol) return c.k;
        }
      }
    }
    const k = `n${n++}`;
    const ici = `${ix}:${iz}`;
    grille.set(ici, [...(grille.get(ici) ?? []), { p, k }]);
    return k;
  };
}

/** Plus près d'un bout que cela, une jonction est un coin, pas un T (m). */
const BOUT_DE_T = 0.05;

/**
 * LES BOUTS QUI SE TOUCHENT PORTENT LES MÊMES COORDONNÉES — revue
 * « Amandine » : deux bouts distants de 4e-16 m (0,00249999… et
 * 0,0025000…) tombaient de part et d'autre d'un arrondi au millimètre ; le
 * graphe y voyait deux nœuds, la cloison pendait, et la salle d'eau se
 * fondait dans le studio. À moins d'un millimètre, ils deviennent un.
 */
function unifierLesNoeuds(walls: WallSeg[], tol = 1e-3): WallSeg[] {
  const grille = new Map<string, Pt[]>();
  const pas = tol * 2;
  const canon = (p: Pt): Pt => {
    const ix = Math.floor(p.x / pas);
    const iz = Math.floor(p.z / pas);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const q of grille.get(`${ix + dx}:${iz + dz}`) ?? []) {
          if (Math.hypot(q.x - p.x, q.z - p.z) <= tol) return q;
        }
      }
    }
    const k = `${ix}:${iz}`;
    grille.set(k, [...(grille.get(k) ?? []), p]);
    return p;
  };
  let change = false;
  const out = walls.map((w) => {
    const a = canon(w.a);
    const b = canon(w.b);
    if (a === w.a && b === w.b) return w;
    change = true;
    return { ...w, a: { ...a }, b: { ...b } };
  });
  /*
    UN MÊME SEGMENT NE SE TRACE QU'UNE FOIS — revue « Hélène » : un éclat
    couché le long d'une façade, coupé et soudé, devenait la copie exacte du
    morceau de façade qu'il longeait. Une arête doublée égare le parcours
    des faces, et la salle à manger disparaissait.
  */
  const cle = (p: Pt) => `${p.x}:${p.z}`;
  const vus = new Set<string>();
  const uniques = out.filter((w) => {
    const ka = cle(w.a);
    const kb = cle(w.b);
    const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (ka === kb || vus.has(k)) return ka === kb;
    vus.add(k);
    return true;
  });
  if (uniques.length !== out.length) return uniques;
  return change ? out : walls;
}

export function splitAtJunctions(walls: WallSeg[], tol = 0.08): WallSeg[] {
  const out: WallSeg[] = [];
  /*
    UN NOM QUE PERSONNE NE PORTE — revue « Camille » : un couloir déjà coupé
    au scan (`X`, `X#1`) qu'on recoupait pour une cloison refaisait un
    `X#1`. Deux murs du même nom : le recollage en jetait un, et le WC
    disparaissait, couloir ouvert, porte dans le vide.
  */
  const pris = new Set(walls.map((w) => w.id));
  const nomLibre = (base: string, n: number) => {
    let k = n;
    while (pris.has(`${base}#${k}`)) k++;
    const id = `${base}#${k}`;
    pris.add(id);
    return id;
  };
  /*
    LE BOUT QUI BUTE SE POSE AU POINT DE COUPE — revue « Bérénice » : le mur
    se coupait à la projection du bout, mais le bout, lui, restait où il
    était, à deux ou quatre dixièmes de millimètre. Deux nœuds au lieu d'un :
    le recollage des murs alignés refermait la coupe, et le cellier se
    fondait dans le séjour. Le point de coupe est calculé une fois, et le
    mur coupé comme le mur qui bute le portent tous deux.
  */
  const at = (w: WallSeg, u: number): Pt => ({
    x: w.a.x + (w.b.x - w.a.x) * u,
    z: w.a.z + (w.b.z - w.a.z) * u,
  });
  const coupesDe = new Map<string, { t: number; P: Pt }[]>();
  const poseDuBout = new Map<string, Pt>();
  for (const w of walls) {
    const len = segLength(w);
    if (len < 1e-6) continue;
    const butees: { t: number; cle: string }[] = [];
    for (const v of walls) {
      if (v.id === w.id) continue;
      for (const end of ['a', 'b'] as const) {
        const { dist, t } = pointOnSeg(v[end], w.a, w.b);
        if (dist > tol || t <= 0 || t >= 1) continue;
        // Trop près d'un bout : c'est un coin, pas un T — rien à couper. En
        // centimètres : la part d'un long mur faisait des dizaines de cm.
        if (t * len < BOUT_DE_T || (1 - t) * len < BOUT_DE_T) continue;
        butees.push({ t, cle: `${v.id}:${end}` });
      }
    }
    if (butees.length === 0) continue;
    butees.sort((p, q) => p.t - q.t);
    // Deux bouts à moins de 2 cm l'un de l'autre font une seule coupe.
    const coupes: { t: number; P: Pt }[] = [];
    for (const b of butees) {
      let c = coupes[coupes.length - 1];
      if (!c || (b.t - c.t) * len > 0.02) {
        c = { t: b.t, P: at(w, b.t) };
        coupes.push(c);
      }
      if (!poseDuBout.has(b.cle)) poseDuBout.set(b.cle, c.P);
    }
    coupesDe.set(w.id, coupes);
  }
  for (const w of walls) {
    const len = segLength(w);
    const A = poseDuBout.get(`${w.id}:a`) ?? w.a;
    const B = poseDuBout.get(`${w.id}:b`) ?? w.b;
    const coupes = len < 1e-6 ? [] : coupesDe.get(w.id) ?? [];
    if (coupes.length === 0) {
      out.push(A === w.a && B === w.b ? w : { ...w, a: { ...A }, b: { ...B } });
      continue;
    }
    const bornes = [{ t: 0, P: A }, ...coupes, { t: 1, P: B }];
    let n = 0;
    for (let k = 0; k + 1 < bornes.length; k++) {
      const de = bornes[k];
      const vers = bornes[k + 1];
      if (vers.t - de.t < 1e-6) continue;
      out.push({
        ...w,
        id: n === 0 ? w.id : nomLibre(w.id, n),
        a: { ...de.P },
        b: { ...vers.P },
        texture: sliceTexture(w.texture, de.t, vers.t),
      });
      n++;
    }
  }
  return unifierLesNoeuds(out);
}

// ------------------------------------------- détection des pièces

/** Une pièce trouvée dans le graphe des murs. */
export interface DetectedRoom {
  /** Contour du sol, dans l'ordre du parcours. */
  outline: Pt[];
  /** Murs qui la bordent — un refend est dans DEUX pièces. */
  wallIds: string[];
  /** Aire en m². */
  area: number;
}

/** Aire signée : le sens de parcours distingue l'intérieur de l'extérieur. */
function signedArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.z - q.x * p.z;
  }
  return sum / 2;
}

/**
 * DE QUEL BOUT CHAQUE PORTE PIVOTE — pour que deux battants ne se croisent
 * jamais.
 *
 * Relevé du chantier : « les portes s'entre-touchent alors qu'en réalité,
 * ça ne se touche pas ». Le battant pivotait toujours sur le PREMIER bout
 * du dormant — un choix arbitraire, hérité de l'ordre des points que le
 * scan a livrés. Deux portes voisines tombant du même côté, leurs quarts
 * de cercle se croisaient : le plan racontait un contact qui n'existe pas,
 * et sur un plan d'électricien c'est un mensonge coûteux — c'est là qu'on
 * décide où poser un interrupteur.
 *
 * Le relevé ne dit pas de quel côté une porte s'ouvre : cette information,
 * on ne l'a pas. Autant choisir celle qui ne ment pas — les battants se
 * rangent dos à dos, comme on pose des portes en vis-à-vis.
 *
 * Deux passes suffisent : une gloutonne, puis une qui réexamine chaque
 * porte en tenant compte de toutes les autres. Le résultat ne dépend pas
 * de l'ordre de lecture, et il est stable d'une image à l'autre — un
 * battant qui saute de côté au moindre zoom serait pire que le croisement.
 */
/**
 * L'ARC QUE DÉCRIT UN BATTANT, du dormant au vantail ouvert.
 *
 * Trouvé à l'œil en regardant le DXF rendu en image : sur une porte ouvrant
 * vers l'extérieur, l'arc partait dans le mauvais sens et décrivait presque
 * un TOUR COMPLET — il traversait le mur, ressortait de l'autre côté, et
 * enfermait la pièce dans une boucle.
 *
 * La cause tient à une soustraction d'angles. Le dormant est à un cap, le
 * vantail ouvert à un autre, et l'on interpolait de l'un à l'autre en ligne
 * droite : quand les deux caps tombent de part et d'autre de la coupure à
 * ±π, l'écart calculé vaut trois cents degrés au lieu de soixante, et le
 * tracé prend le chemin long. On ramène donc l'écart dans l'intervalle qui a
 * un sens physique — une porte ne s'ouvre pas au-delà du demi-tour.
 *
 * Le calcul vivait recopié dans le dossier imprimé et dans l'export CAO ;
 * il vit ici, une fois, et les deux le prennent.
 *
 * @param gond    Le bord qui pivote.
 * @param opp     L'autre bord du dormant.
 * @param normale Direction du vantail ouvert, unitaire.
 * @param rayon   La largeur de la porte.
 * @param pas     Nombre de segments du tracé.
 */
export function arcDuBattant(
  gond: Pt,
  opp: Pt,
  normale: Pt,
  rayon: number,
  pas = 10,
): Pt[] {
  const a0 = Math.atan2(opp.z - gond.z, opp.x - gond.x);
  const a1 = Math.atan2(normale.z, normale.x);
  // L'écart le plus COURT entre les deux caps : le chemin qu'un vantail
  // prend réellement.
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const out: Pt[] = [];
  for (let i = 0; i <= pas; i++) {
    const t = a0 + (delta * i) / pas;
    out.push({
      x: gond.x + Math.cos(t) * rayon,
      z: gond.z + Math.sin(t) * rayon,
    });
  }
  return out;
}

export function pivotsDesBattants(
  portes: { id: string; a: Pt; b: Pt; pivot?: 'a' | 'b' }[],
): Map<string, 'a' | 'b'> {
  const choix = new Map<string, 'a' | 'b'>(
    portes.map((p) => [p.id, p.pivot ?? 'a']),
  );
  const rayon = (p: { a: Pt; b: Pt }) =>
    Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z);
  const pivotDe = (p: { id: string; a: Pt; b: Pt }) =>
    choix.get(p.id) === 'b' ? p.b : p.a;
  /** Ce que ce pivot coûte : la somme des empiètements sur les voisines. */
  const gene = (p: { id: string; a: Pt; b: Pt }, bout: 'a' | 'b') => {
    const moi = bout === 'a' ? p.a : p.b;
    const r = rayon(p);
    let somme = 0;
    for (const autre of portes) {
      if (autre.id === p.id) continue;
      const lui = pivotDe(autre);
      const d = Math.hypot(lui.x - moi.x, lui.z - moi.z);
      somme += Math.max(0, r + rayon(autre) - d);
    }
    return somme;
  };
  for (let passe = 0; passe < 2; passe++) {
    for (const p of portes) {
      // LE CHOIX DE LA MAIN PASSE AVANT. Sans ça, la correction faite sur
      // place dure jusqu'au premier rendu suivant, et l'électricien voit
      // sa porte se retourner toute seule.
      if (p.pivot) continue;
      const coutA = gene(p, 'a');
      const coutB = gene(p, 'b');
      // À égalité, on garde le premier bout : c'est le dessin d'avant, et
      // rien ne justifie de le changer.
      choix.set(p.id, coutB < coutA - 1e-9 ? 'b' : 'a');
    }
  }
  return choix;
}

/**
 * TOUTES LES FACES FERMÉES du graphe des murs, sans le moindre tri.
 *
 * Le parcours vivait dans `detectRooms`, qui filtrait dans la foulée : les
 * recoins techniques, écartés, n'existaient donc nulle part — impossible de
 * les pocher en noir. On sépare : ici on ÉNUMÈRE, ailleurs on décide de ce
 * qu'est une pièce.
 *
 * À chaque nœud, on repart par l'arête qui suit immédiatement, dans le sens
 * horaire, celle par laquelle on est arrivé. Le parcours ferme chaque face
 * tout seul, et le contour extérieur sort à l'envers : c'est à son aire
 * négative qu'on le reconnaît, et qu'on le jette.
 */
export function facesFermees(walls: WallSeg[]): DetectedRoom[] {
  /*
    LES NŒUDS SE RECONNAISSENT AU DIXIÈME DE MILLIMÈTRE, pas à l'arrondi —
    revue « Amandine » : 0,00249999… et 0,0025000… tombaient de part et
    d'autre du millimètre, le parcours voyait deux nœuds, et la cloison
    pendait. Deux bouts à moins de 0,1 mm sont le même nœud.
  */
  const cleDuNoeud = clesDesNoeuds();

  interface HalfEdge {
    wallId: string;
    from: Pt;
    to: Pt;
    angle: number;
  }
  const outgoing = new Map<string, HalfEdge[]>();
  const edges: HalfEdge[] = [];
  for (const w of walls) {
    if (segLength(w) < 1e-6) continue;
    for (const [from, to] of [
      [w.a, w.b],
      [w.b, w.a],
    ] as const) {
      const he: HalfEdge = {
        wallId: w.id,
        from,
        to,
        angle: Math.atan2(to.z - from.z, to.x - from.x),
      };
      edges.push(he);
      const k = cleDuNoeud(from);
      const list = outgoing.get(k) ?? [];
      list.push(he);
      outgoing.set(k, list);
    }
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.angle - b.angle);

  /** Arête suivante de la face : la précédente en angle autour du nœud. */
  const nextOf = (he: HalfEdge): HalfEdge | null => {
    const list = outgoing.get(cleDuNoeud(he.to));
    if (!list || list.length === 0) return null;
    // On repart de l'inverse de l'arête d'arrivée, puis on tourne d'un cran.
    const back = he.angle > 0 ? he.angle - Math.PI : he.angle + Math.PI;
    let idx = list.findIndex(
      (e) => e.wallId === he.wallId && cleDuNoeud(e.to) === cleDuNoeud(he.from),
    );
    if (idx < 0) {
      // Nœud non partagé au point près : on se rabat sur l'angle.
      idx = list.findIndex((e) => Math.abs(e.angle - back) < 1e-6);
      if (idx < 0) return null;
    }
    return list[(idx - 1 + list.length) % list.length];
  };

  const seen = new Set<HalfEdge>();
  const faces: { pts: Pt[]; wallIds: string[]; area: number }[] = [];
  for (const start of edges) {
    if (seen.has(start)) continue;
    const pts: Pt[] = [];
    const ids = new Set<string>();
    let he: HalfEdge | null = start;
    // Garde-fou : un graphe abîmé ne doit pas boucler indéfiniment.
    for (let guard = 0; he && !seen.has(he) && guard <= edges.length; guard++) {
      seen.add(he);
      pts.push(he.from);
      ids.add(he.wallId);
      he = nextOf(he);
    }
    if (pts.length < 3) continue;
    faces.push({ pts, wallIds: [...ids], area: signedArea(pts) });
  }

  // Les faces intérieures tournent toutes dans le même sens ; le contour
  // extérieur, lui, sort à l'envers.
  return faces
    .filter((f) => f.area > 0)
    .map((f) => ({ outline: f.pts, wallIds: f.wallIds, area: f.area }));
}

/**
 * Au-delà de cette surface, une face sans ouverture reste une pièce.
 *
 * En dessous, c'est un vide de construction : une gaine technique, un
 * coffre, l'épaisseur entre deux cloisons. Deux mètres carrés : plus grand
 * que tout local technique d'appartement, et de toute façon le plus exigu
 * des WC a sa porte pour lui.
 */
// Un WC de 0,90 × 1,50 fait 1,35 m² : en dessous, une gaine ou un placard
// (revue « Léa » : le WC de 1,58 m² n'apparaissait qu'avec sa porte).
const AIRE_SANS_PORTE = 1.2;

/** Les murs sur lesquels une menuiserie est posée : porte, fenêtre, baie. */
function mursOuverts(walls: WallSeg[], openings: WallSeg[]): Set<string> {
  const out = new Set<string>();
  for (const o of openings) {
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    const lo = segLength(o) || 1;
    const uo = { x: (o.b.x - o.a.x) / lo, z: (o.b.z - o.a.z) / lo };
    let best: { id: string; dist: number } | null = null;
    for (const w of walls) {
      const lw = segLength(w) || 1;
      const uw = { x: (w.b.x - w.a.x) / lw, z: (w.b.z - w.a.z) / lw };
      // Parallèle à moins de ~25°, et posée à même le mur : la même règle
      // que le percement du modèle 3D (`assignOpenings`).
      if (Math.abs(uo.x * uw.x + uo.z * uw.z) < 0.9) continue;
      const { dist } = pointOnSeg(mid, w.a, w.b);
      if (dist > 0.6) continue;
      if (!best || dist < best.dist) best = { id: w.id, dist };
    }
    if (best) out.add(best.id);
  }
  return out;
}

/**
 * LES RECOINS TECHNIQUES — à pocher en noir, pas à nommer.
 *
 * Relevé du patron : « quand il y a 4 murs qui encerclent un recoin vide
 * (ici sous les WC, c'était une épaisseur pour les gaines), il doit être
 * rempli de noir pour ne pas confondre avec une pièce ». Un vide blanc au
 * milieu d'un plan se lit comme une pièce qu'on aurait oublié de nommer —
 * alors que c'est du plein, de la maçonnerie, un endroit où l'on ne pose
 * rien et où l'on ne perce pas.
 *
 * Ce sont exactement les faces que la détection écarte : closes, petites,
 * et sans la moindre ouverture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MAIS CE QUI EST DÉCLARÉ N'EST PAS UN VIDE.
 *
 * Relevé du patron : « j'ai fait un petit bloc sur l'accueil, j'ai un rendu
 * d'une pièce complètement noire ». Une pièce qu'on vient de tracer n'a pas
 * encore de porte, et elle est petite : elle réunissait les deux signes du
 * recoin technique, et le plan la pochait en noir. On ouvrait l'éditeur sur
 * un rectangle d'encre.
 *
 * La règle de départ tient sur un mot — « un recoin VIDE ». Un vide, c'est
 * ce que PERSONNE n'a déclaré. Une pièce posée par l'utilisateur a un
 * identifiant, une liste de murs et bientôt un nom : attendre sa porte pour
 * cesser de la noircir revient à punir le début du relevé. Le poché reste
 * entier pour ce qu'il visait — les faces qu'aucune pièce ne réclame.
 */
export function massifsTechniques(
  walls: WallSeg[],
  openings: WallSeg[],
  /** Les pièces déclarées : aucune d'elles n'est de la maçonnerie. */
  rooms: RoomShape[] = [],
): Pt[][] {
  /*
    LE GRAPHE SE RECOUD D'ABORD. Un coffre de gaines s'appuie contre un mur
    sans le couper : tant que ce point de contact n'est pas un nœud, aucune
    face ne passe par lui et le recoin n'existe pour personne. C'est le même
    nettoyage que la détection des pièces fait avant de chercher ses faces.
  */
  const propres = splitAtJunctions(weldCorners(walls));
  const ouverts = mursOuverts(propres, openings);
  /*
    LES MURS RECOUSUS PORTENT DES IDENTIFIANTS DÉRIVÉS. Un mur coupé en T
    devient « m » et « m#1 » (`splitAtJunctions`) : comparé tel quel à la
    liste d'une pièce, le morceau n'y figure pas et la pièce redeviendrait
    un massif dès qu'une cloison vient buter contre elle. On compare donc
    les murs D'ORIGINE.
  */
  const listes = rooms
    .map((r) => new Set(r.wallIds ?? []))
    .filter((l) => l.size > 0);
  // Le morceau d'un mur déjà recoupé (`X#1`) se compare aussi tel quel.
  const reclamee = (ids: string[]) =>
    listes.some((liste) => ids.every((id) => liste.has(id) || liste.has(id.split('#')[0])));
  return facesFermees(propres)
    .filter(
      (f) =>
        f.area > 0.02 &&
        f.area < AIRE_SANS_PORTE &&
        !f.wallIds.some((id) => ouverts.has(id)) &&
        !reclamee(f.wallIds),
    )
    .map((f) => f.outline);
}

/**
 * Découpe le plan en pièces, tout seul.
 *
 * Un appartement scanné d'une traite est UN graphe de murs : les pièces en
 * sont les faces. On les énumère par le parcours classique des faces d'un
 * graphe planaire — à chaque nœud, on repart par l'arête qui suit
 * immédiatement, dans le sens horaire, celle par laquelle on est arrivé. Le
 * parcours ferme naturellement chaque pièce, et la face extérieure (le tour
 * de l'appartement) sort avec l'orientation inverse : c'est à ça qu'on la
 * reconnaît et qu'on la jette.
 *
 * Un refend appartient donc à deux pièces à la fois — d'où `wallIds` plutôt
 * qu'un `roomId` posé sur le mur. Les murs qui ne ferment rien (bouts
 * pendants, cloison isolée) ne créent pas de pièce : le parcours les longe
 * à l'aller et au retour, leur contribution à l'aire est nulle.
 *
 * CE QUI FAIT UNE PIÈCE, C'EST LA PORTE — pas la surface.
 *
 * Relevé du chantier, sur un « Dégagement + WC » : « il y a un espace vide
 * sur le plan, c'est les WC, pourtant c'est un espace clos avec une porte,
 * on doit le détecter dans sa surface ». La cause tenait dans un nombre :
 * on jetait toute face de moins de 1,2 m², c'est-à-dire EXACTEMENT la
 * taille d'un WC (0,90 × 1,30). Le seuil de surface était le mauvais
 * critère. Une pièce, si petite soit-elle, S'OUVRE ; une gaine technique,
 * jamais — et c'est ce qui les sépare vraiment.
 *
 * Une grande face sans ouverture reste une pièce, en revanche : c'est le
 * scan qui a raté sa porte, pas la pièce qui n'existe pas.
 */
export function detectRooms(
  walls: WallSeg[],
  minArea = 0.5,
  openings: WallSeg[] = [],
  /**
   * CE QU'ON A DIT ÊTRE UNE PIÈCE — un point dans chaque recoin déclaré
   * (« C'est un placard ») : la face qui le contient reste une pièce, sans
   * porte et si petite soit-elle.
   */
  declarees: Pt[] = [],
): DetectedRoom[] {
  const ouverts = mursOuverts(walls, openings);
  return facesFermees(walls)
    .filter(
      (f) =>
        (f.area > 0.02 && declarees.some((p) => dansLeContour(p, f.outline))) ||
        (f.area >= minArea &&
          (f.area >= AIRE_SANS_PORTE || f.wallIds.some((id) => ouverts.has(id)))),
    )
    .sort((a, b) => b.area - a.area);
}

/** La longueur du segment [a, b] qui passe dans le contour. */
function longueurDedans(a: Pt, b: Pt, pts: Pt[]): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const ts = [0, 1];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p.x - a.x) * ez - (p.z - a.z) * ex) / den;
    const s = ((p.x - a.x) * dz - (p.z - a.z) * dx) / den;
    if (t > 0 && t < 1 && s >= 0 && s <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const len = Math.hypot(dx, dz);
  let dedans = 0;
  for (let i = 0; i + 1 < ts.length; i++) {
    const m = (ts[i] + ts[i + 1]) / 2;
    if (dansLeContour({ x: a.x + dx * m, z: a.z + dz * m }, pts)) dedans += (ts[i + 1] - ts[i]) * len;
  }
  return dedans;
}

/** Le point est-il dans le contour ? Parité des croisements d'un rayon. */
function dansLeContour(p: Pt, pts: Pt[]): boolean {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      dedans = !dedans;
    }
  }
  return dedans;
}

// ------------------------------------------- fusion des murs colinéaires

/** Direction unitaire d'un mur, de a vers b. */
function unit(w: WallSeg): Pt {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/**
 * Recompose la grille de couleurs d'un mur fusionné : une colonne tous les
 * ~50 cm, chacune échantillonnée dans le morceau qu'elle recouvre. Sans ça,
 * la texture d'un morceau d'1 m serait étirée sur toute la longueur.
 */
function mergeTextures(
  pieces: { wall: WallSeg; from: Pt; to: Pt; len: number }[],
  total: number,
): SurfaceTexture | undefined {
  if (!pieces.some((p) => p.wall.texture)) return undefined;
  const rows = Math.max(...pieces.map((p) => p.wall.texture?.rows ?? 1));
  const cols = Math.min(24, Math.max(4, Math.round(total / 0.5)));
  const texels: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const u = ((i + 0.5) / cols) * total;
      // Morceau qui porte cette colonne, et position relative dedans.
      let acc = 0;
      let piece = pieces[pieces.length - 1];
      let local = 1;
      for (const p of pieces) {
        if (u <= acc + p.len || p === pieces[pieces.length - 1]) {
          piece = p;
          local = p.len > 0 ? Math.min(1, Math.max(0, (u - acc) / p.len)) : 0;
          break;
        }
        acc += p.len;
      }
      const tex = piece.wall.texture;
      // `from`/`to` peut être l'inverse du sens propre au morceau : la
      // colonne 0 de sa grille reste son extrémité A d'origine.
      const flipped = piece.from !== piece.wall.a;
      const uu = flipped ? 1 - local : local;
      const cell = tex
        ? tex.texels[
            Math.min(tex.rows - 1, Math.floor(((r + 0.5) / rows) * tex.rows)) *
              tex.cols +
              Math.min(tex.cols - 1, Math.floor(uu * tex.cols))
          ]
        : undefined;
      texels.push(cell ?? piece.wall.color ?? '#FFFFFF');
    }
  }
  return { cols, rows, texels };
}

/**
 * Fusionne les murs colinéaires bout à bout d'une même pièce.
 *
 * RoomPlan livre volontiers un mur droit en deux ou trois morceaux : le plan
 * hérite d'autant de cotes, la vue 3D montre des raccords là où il n'y a
 * qu'une surface, et déplacer le « coin » fantôme entre deux morceaux plie un
 * mur qui devrait rester droit. On ne fusionne qu'à coup sûr : même pièce,
 * extrémités déjà soudées, directions alignées à `angleDeg` près, hauteurs
 * comparables, et jamais un nœud qui porte un troisième mur (un vrai T).
 */
export function mergeColinear(
  walls: WallSeg[],
  angleDeg = 4,
  heightTol = 0.12,
): WallSeg[] {
  const cosMin = Math.cos((angleDeg * Math.PI) / 180);
  const out: WallSeg[] = [];
  /*
    DEUX MURS DU MÊME NOM NE S'ANNULENT PAS — le parcours les reconnaît à
    leur identifiant, et le second était jeté sans bruit. Un doublon (venu
    d'un relevé ou d'une sauvegarde d'avant) prend un nom à lui d'abord.
  */
  const vus = new Set<string>();
  walls = walls.map((w) => {
    if (!vus.has(w.id)) {
      vus.add(w.id);
      return w;
    }
    let k = 1;
    while (vus.has(`${w.id}~${k}`)) k++;
    const id = `${w.id}~${k}`;
    vus.add(id);
    return { ...w, id };
  });

  /*
    UN NŒUD OÙ ARRIVE UN TROISIÈME MUR NE SE RECOLLE PAS, quel que soit son
    groupe — revues « Nicolas » et « Théo ». Les bras se comptaient groupe
    par groupe : la cloison posée dans une pièce ACCOLÉE (son groupe à elle)
    ne comptait pas au nœud du mur du séjour (le groupe du séjour). Le mur,
    coupé au pied de la cloison, se recollait aussitôt, et la pièce ne se
    scindait jamais.
  */
  const brasDuPlan = new Map<string, number>();
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      const k = nodeKey(w[end]);
      brasDuPlan.set(k, (brasDuPlan.get(k) ?? 0) + 1);
    }
  }

  for (const { items } of groupByRoom(walls)) {
    // Bras par nœud : une fusion demande exactement deux murs qui s'y touchent.
    const arms = new Map<string, { wall: WallSeg; end: 'a' | 'b' }[]>();
    for (const w of items) {
      for (const end of ['a', 'b'] as const) {
        const k = nodeKey(w[end]);
        const list = arms.get(k) ?? [];
        list.push({ wall: w, end });
        arms.set(k, list);
      }
    }

    /** Le mur qui prolonge `w` au nœud `end`, s'il le prolonge vraiment. */
    const nextAt = (w: WallSeg, end: 'a' | 'b'): WallSeg | null => {
      const list = arms.get(nodeKey(w[end])) ?? [];
      if (list.length !== 2 || brasDuPlan.get(nodeKey(w[end])) !== 2) return null;
      const other = list.find((x) => x.wall.id !== w.id);
      if (!other) return null;
      /*
        DEUX MURS D'ÉPAISSEURS DIFFÉRENTES RESTENT DEUX MURS — revue
        « Karim » : un porteur de 45 cm prolongé d'un mur de 14 se recollait
        en un seul mur de 45, et la pièce perdait 0,31 m². Un mur tracé au
        nu ne se recolle pas non plus à un mur relevé.
      */
      if (Math.abs(epaisseurDe(other.wall) - epaisseurDe(w)) > 1e-6) return null;
      if (!!other.wall.auNu !== !!w.auNu) return null;
      if (Math.abs(other.wall.height - w.height) > heightTol) return null;
      const u = unit(w);
      const v = unit(other.wall);
      // Directions comparées dans le sens du parcours : le mur suivant doit
      // repartir du nœud dans la même direction qu'on y arrivait.
      const inbound = end === 'b' ? u : { x: -u.x, z: -u.z };
      const outbound = other.end === 'a' ? v : { x: -v.x, z: -v.z };
      const dot = inbound.x * outbound.x + inbound.z * outbound.z;
      return dot >= cosMin ? other.wall : null;
    };

    const seen = new Set<string>();
    for (const start of items) {
      if (seen.has(start.id)) continue;
      // Remonter jusqu'au début de la chaîne, sans jamais boucler.
      let head = start;
      let headEnd: 'a' | 'b' = 'a';
      const guard = new Set<string>([start.id]);
      for (;;) {
        const prev = nextAt(head, headEnd);
        if (!prev || guard.has(prev.id)) break;
        guard.add(prev.id);
        headEnd = nodeKey(prev.a) === nodeKey(head[headEnd]) ? 'b' : 'a';
        head = prev;
      }

      // `head[headEnd]` est l'extrémité libre : c'est de là que part la
      // chaîne, qu'on déroule maintenant bout à bout jusqu'à l'autre bout.
      const pieces: { wall: WallSeg; from: Pt; to: Pt; len: number }[] = [];
      let cur: WallSeg | null = head;
      let from: Pt = head[headEnd];
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        const to = nodeKey(cur.a) === nodeKey(from) ? cur.b : cur.a;
        pieces.push({ wall: cur, from, to, len: segLength(cur) });
        const end: 'a' | 'b' = nodeKey(cur.b) === nodeKey(to) ? 'b' : 'a';
        const next: WallSeg | null = nextAt(cur, end);
        from = to;
        cur = next;
      }

      if (pieces.length === 1) {
        out.push(pieces[0].wall);
        continue;
      }
      // Le plus long morceau donne son identité au mur reconstitué.
      const main = pieces.reduce((a, b) => (b.len > a.len ? b : a));
      const total = pieces.reduce((s, p) => s + p.len, 0);
      out.push({
        ...main.wall,
        a: pieces[0].from,
        b: pieces[pieces.length - 1].to,
        height: Math.max(...pieces.map((p) => p.wall.height)),
        texture: mergeTextures(pieces, total),
      });
    }
  }
  return out;
}

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function bounds(walls: WallSeg[]): Bounds {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
  }
  if (!isFinite(minX)) return { minX: -2, minZ: -2, maxX: 2, maxZ: 2 };
  return { minX, minZ, maxX, maxZ };
}

/** Projection mètres → pixels pour le rendu SVG du plan. */
/**
 * L'ÉCHELLE MAXIMALE DU PLAN À L'OUVERTURE, en points par mètre.
 *
 * Relevé du patron, capture à l'appui : « à la création d'un étage, tout est
 * trop zoomé et impossible de le rendre plus petit que ça… il y a un réel
 * bug ». Deux murs relevés de travers — sept dixièmes de mètre carré — et le
 * plan les affichait gros comme le bras.
 *
 * Le cadrage AJUSTE le contenu au cadre, et c'est juste tant qu'il y a de
 * quoi remplir. Réduit au seul étage courant, un relevé raté de un mètre
 * trente se retrouve grossi jusqu'à remplir un téléphone : on ne voit plus
 * ni où l'on est, ni le niveau du dessous sur lequel on doit l'aligner.
 *
 * PUIS LE PLAFOND EST DESCENDU LÀ OÙ VIVENT LES VRAIS LOGEMENTS — relevé
 * du patron : « les murs sont plus épais quand on trace directement depuis
 * l'accueil la pièce, qu'un autre plan scanné.. ça doit être identique. »
 * La maçonnerie EST identique (quatorze centimètres partout) ; c'est
 * l'échelle d'ouverture qui trahissait : une pièce tracée seule se faisait
 * grossir à 103 pt/m — des murs de quinze points, trois fois l'épaisseur du
 * même mur dans un logement scanné à 31. Deux plans côte à côte, deux
 * graisses de trait.
 *
 * Cinquante-cinq points par mètre : un T2 de six mètres remplit encore son
 * cadre (51 pt/m, sous le plafond), et une pièce seule s'ouvre à l'échelle
 * qu'elle aura quand le logement sera complet. Le pincement, lui, reste
 * libre d'aller plus près.
 */
export const ECHELLE_MAX_PLAN = 55;

export function makeMapping(b: Bounds, viewW: number, viewH: number, margin = 40) {
  const w = Math.max(b.maxX - b.minX, 0.5);
  const h = Math.max(b.maxZ - b.minZ, 0.5);
  const scale = Math.min(
    (viewW - margin * 2) / w,
    (viewH - margin * 2) / h,
    ECHELLE_MAX_PLAN,
  );
  const ox = (viewW - w * scale) / 2 - b.minX * scale;
  const oz = (viewH - h * scale) / 2 - b.minZ * scale;
  return {
    scale,
    toPx: (p: { x: number; z: number }) => ({ x: p.x * scale + ox, y: p.z * scale + oz }),
    toMeters: (px: { x: number; y: number }) => ({ x: (px.x - ox) / scale, z: (px.y - oz) / scale }),
  };
}

export type Mapping = ReturnType<typeof makeMapping>;

/**
 * Magnétisme angulaire : colle le mur sur la trame du plan.
 *
 * `frame` est l'orientation du logement (`planFrameAngle`), pas celle de
 * l'écran. Sans elle, le magnétisme ne se déclenchait QUE sur les logements
 * scannés par hasard face à un mur : partout ailleurs, l'utilisateur pouvait
 * tirer un coin sans jamais rien accrocher, et le redressement se défaisait
 * au premier glissement.
 */
export function snapAngle(
  fixed: { x: number; z: number },
  moving: { x: number; z: number },
  deg = 5,
  frame = 0,
) {
  const dx = moving.x - fixed.x;
  const dz = moving.z - fixed.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return moving;
  const angle = Math.atan2(dz, dx);
  const step = Math.PI / 2;
  // Multiples de 90° comptés DEPUIS la trame du logement.
  const snapped = Math.round((angle - frame) / step) * step + frame;
  if (Math.abs(angle - snapped) < (deg * Math.PI) / 180) {
    return { x: fixed.x + len * Math.cos(snapped), z: fixed.z + len * Math.sin(snapped) };
  }
  return moving;
}

/**
 * Magnétisme d'alignement : le coin déplacé se cale sur la ligne d'un autre
 * mur déjà en place.
 *
 * C'est ce qui manque le plus quand on redresse un plan à la main — tirer un
 * coin « à peu près » dans le prolongement d'un mur voisin donne un plan qui
 * paraît droit et ne l'est pas. On travaille dans la trame du logement : on
 * cherche un nœud existant dont l'abscisse (ou l'ordonnée) est à moins de
 * `tol` du point visé, et on s'y aligne. Les deux axes se traitent
 * séparément, donc un coin peut s'aligner en x sur un mur et en z sur un
 * autre.
 */
export function snapToNeighbours(
  p: { x: number; z: number },
  walls: WallSeg[],
  frame = 0,
  tol = 0.12,
  exclude?: { x: number; z: number },
): { x: number; z: number } {
  const c = Math.cos(-frame);
  const sn = Math.sin(-frame);
  const fwd = (q: Pt): Pt => ({ x: q.x * c - q.z * sn, z: q.x * sn + q.z * c });
  const back = (q: Pt): Pt => ({ x: q.x * c + q.z * sn, z: -q.x * sn + q.z * c });
  const target = fwd(p);
  const skip = exclude ? fwd(exclude) : null;
  let bestX: number | null = null;
  let bestZ: number | null = null;
  let dX = tol;
  let dZ = tol;
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      const q = fwd(w[end]);
      // Le coin qu'on déplace ne doit pas s'aligner sur lui-même.
      if (skip && Math.hypot(q.x - skip.x, q.z - skip.z) < 1e-6) continue;
      const ex = Math.abs(q.x - target.x);
      if (ex < dX) {
        dX = ex;
        bestX = q.x;
      }
      const ez = Math.abs(q.z - target.z);
      if (ez < dZ) {
        dZ = ez;
        bestZ = q.z;
      }
    }
  }
  if (bestX === null && bestZ === null) return p;
  return back({ x: bestX ?? target.x, z: bestZ ?? target.z });
}

/**
 * Distance d'un point à un mur, dans une direction donnée.
 *
 * Sert aux cotes de dégagement d'un meuble : on part du milieu de chacun de
 * ses côtés, perpendiculairement, et on regarde ce qu'on rencontre. Rien
 * dans cette direction : pas de cote, plutôt qu'une cote fausse.
 */
export function castToWall(from: Pt, dir: Pt, walls: WallSeg[]): number | null {
  let best = Infinity;
  let touche: WallSeg | null = null;
  for (const w of walls) {
    const ex = w.b.x - w.a.x;
    const ez = w.b.z - w.a.z;
    const den = dir.x * ez - dir.z * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((w.a.x - from.x) * ez - (w.a.z - from.z) * ex) / den;
    const u = ((w.a.x - from.x) * dir.z - (w.a.z - from.z) * dir.x) / den;
    if (t > 1e-3 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) {
      best = t;
      touche = w;
    }
  }
  // Jusqu'au NU du mur, pas jusqu'à son axe : c'est la cote qu'on relève
  // sur place, mètre contre la plinthe — au nu de CE mur, à son épaisseur.
  return isFinite(best) && touche
    ? Math.max(0, best - epaisseurDe(touche) / 2)
    : null;
}

/* ====================================================================== */
/*  LES OUVERTURES, AUX COTES DU MÈTRE                                    */
/* ====================================================================== */

/** Le mur qui porte une ouverture : le plus proche de son milieu. */
export function murDeLOuverture(o: WallSeg, walls: WallSeg[]): WallSeg | null {
  const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
  let mur: WallSeg | null = null;
  let best = Infinity;
  for (const w of walls) {
    if (w.type !== 'wall') continue;
    const d = pointOnSeg(mid, w.a, w.b).dist;
    if (d < best) {
      best = d;
      mur = w;
    }
  }
  return mur && best <= 0.6 ? mur : null;
}

/**
 * OÙ EST L'OUVERTURE, COMME ON LA MESURE — du nu de chaque coin au tableau
 * le plus proche.
 *
 * La position se comptait depuis le bout du TRAIT du mur, c'est-à-dire
 * l'axe du mur d'angle : on lisait 7 cm de plus que ce que donne le mètre
 * posé contre le refend, et une porte tapée « à 10 cm du mur » se posait à
 * 3 cm de lui. On compte maintenant depuis le NU du mur qui ferme le coin.
 */
export function positionOuverture(
  o: WallSeg,
  walls: WallSeg[],
): { mur: WallSeg; depuisA: number; depuisB: number; retraitA: number; retraitB: number } | null {
  const mur = murDeLOuverture(o, walls);
  if (!mur) return null;
  const L = segLength(mur);
  if (L < 1e-6) return null;
  const u = { x: (mur.b.x - mur.a.x) / L, z: (mur.b.z - mur.a.z) / L };
  const t = (p: Pt) => (p.x - mur.a.x) * u.x + (p.z - mur.a.z) * u.z;
  const t0 = Math.min(t(o.a), t(o.b));
  const t1 = Math.max(t(o.a), t(o.b));
  const retraitA = retraitDuCoin(walls, mur, mur.a);
  const retraitB = retraitDuCoin(walls, mur, mur.b);
  return {
    mur,
    retraitA,
    retraitB,
    depuisA: t0 - retraitA,
    depuisB: L - t1 - retraitB,
  };
}

/** Ce qu'on a mesuré pour une ouverture (m). */
export interface SaisieOuverture {
  largeur: number;
  hauteur: number;
  /** Du sol au bas de la menuiserie ; ignoré pour une porte. */
  allege?: number;
  /** Du nu du coin au tableau le plus proche. */
  depuis: number;
  /** Compter depuis l'autre coin du mur. */
  depuisB?: boolean;
}

/**
 * La cote `bord` qu'attend `moveOpening` — depuis le bout `a` du trait —
 * pour une ouverture de `largeur` posée à `depuis` du nu du coin choisi.
 */
export function bordDepuisCoin(
  p: { mur: WallSeg; retraitA: number; retraitB: number },
  largeur: number,
  depuis: number,
  depuisB = false,
): number {
  const L = segLength(p.mur);
  return depuisB ? L - p.retraitB - depuis - largeur : p.retraitA + depuis;
}

/**
 * L'OUVERTURE AUX COTES SAISIES — ses deux bouts, sa hauteur, son centre.
 *
 * Une seule fonction pour l'aperçu dessiné derrière la feuille et pour ce
 * que le magasin enregistre : l'aperçu ne peut pas promettre une place que
 * l'enregistrement ne donnerait pas.
 */
export function ouvertureCotee(
  o: WallSeg,
  walls: WallSeg[],
  s: SaisieOuverture,
): { a: Pt; b: Pt; height: number; yCenter: number } | null {
  const pos = positionOuverture(o, walls);
  if (!pos) return null;
  const { mur } = pos;
  const L = segLength(mur);
  const { sol, hauteur: plafond } = murPorteurDe(o, walls);
  // Les mêmes bornes que les gestes un par un : rien ne sort du mur.
  const l = Math.min(Math.max(0.1, s.largeur), Math.max(0.1, L - 0.02));
  const allege =
    o.type === 'door' ? 0 : Math.max(0, Math.min(s.allege ?? 0, plafond - 0.2));
  const h = Math.min(Math.max(0.2, s.hauteur), Math.max(0.2, plafond - allege));
  const bord = Math.min(
    Math.max(0, bordDepuisCoin(pos, l, Math.max(0, s.depuis), s.depuisB)),
    Math.max(0, L - l),
  );
  const ux = (mur.b.x - mur.a.x) / L;
  const uz = (mur.b.z - mur.a.z) / L;
  // Le sens du trait est gardé : le pivot et le battant d'une porte sont
  // décrits par `a` et `b`, on ne les retourne pas en la cotant.
  const memeSens = (o.b.x - o.a.x) * ux + (o.b.z - o.a.z) * uz >= 0;
  const p0 = { x: mur.a.x + ux * bord, z: mur.a.z + uz * bord };
  const p1 = { x: mur.a.x + ux * (bord + l), z: mur.a.z + uz * (bord + l) };
  return {
    a: memeSens ? p0 : p1,
    b: memeSens ? p1 : p0,
    height: h,
    yCenter: sol + allege + h / 2,
  };
}

/* ====================================================================== */
/*  COUPER UNE PIÈCE, PLACER UN MEUBLE — AUX COTES DU MÈTRE              */
/* ====================================================================== */

/** Ce qu'on a mesuré pour recouper une pièce d'une cloison (m). */
export interface SaisieCoupe {
  /**
   * `longueur` : la cloison coupe la plus grande dimension (un dressing au
   * fond d'une chambre) ; `largeur` : elle court dans la longueur et coupe
   * la plus petite (un couloir pris le long d'un séjour).
   */
  sens: 'longueur' | 'largeur';
  /** Du nu du mur de départ au nu de la cloison. */
  depuis: number;
  epaisseur: number;
  /** Compter depuis le mur d'en face. */
  depuisAutre?: boolean;
}

/** Le repère d'une pièce : son grand axe, son petit, et leurs étendues. */
export function repereDePiece(pts: Pt[]) {
  const { angle } = roomExtent(pts);
  const u = { x: Math.cos(angle), z: Math.sin(angle) };
  const v = { x: -u.z, z: u.x };
  const etendue = (d: Pt) => {
    const ps = pts.map((p) => p.x * d.x + p.z * d.z);
    return { min: Math.min(...ps), max: Math.max(...ps) };
  };
  const eu = etendue(u);
  const ev = etendue(v);
  const uLong = eu.max - eu.min >= ev.max - ev.min;
  return uLong
    ? { long: u, court: v, eLong: eu, eCourt: ev }
    : { long: v, court: u, eLong: ev, eCourt: eu };
}

/** Le premier bord du contour atteint depuis `de`, dans la direction `d`. */
function rayonContour(de: Pt, d: Pt, poly: Pt[]): Pt | null {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j];
    const q = poly[i];
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - de.x) * ez - (p.z - de.z) * ex) / den;
    const u = ((p.x - de.x) * d.z - (p.z - de.z) * d.x) / den;
    if (t > 1e-4 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  return isFinite(best) ? { x: de.x + d.x * best, z: de.z + d.z * best } : null;
}

/**
 * Le mur qui ferme la pièce à cette extrémité de l'axe : c'est de SON nu
 * qu'on mesure. Absent, l'épaisseur de tous.
 */
function demiDuBord(walls: WallSeg[], axe: Pt, borne: number): number {
  const w = walls.find(
    (x) =>
      x.type === 'wall' &&
      Math.abs(x.a.x * axe.x + x.a.z * axe.z - borne) < 0.08 &&
      Math.abs(x.b.x * axe.x + x.b.z * axe.z - borne) < 0.08,
  );
  return (w ? epaisseurDe(w) : WALL_T) / 2;
}

/** Les deux dimensions d'une pièce, au nu, dans le sens où on la coupe. */
export function dimensionsDeCoupe(part: RoomPart): { longueur: number; largeur: number } | null {
  const pts = part.surface?.pts;
  if (!pts || pts.length < 3) return null;
  const r = repereDePiece(pts);
  const nu = (axe: Pt, e: { min: number; max: number }) =>
    e.max - e.min - demiDuBord(part.walls, axe, e.min) - demiDuBord(part.walls, axe, e.max);
  return { longueur: nu(r.long, r.eLong), largeur: nu(r.court, r.eCourt) };
}

/**
 * LA COUPE D'UNE PIÈCE, À LA COTE QU'ON A PRISE.
 *
 * Relevé du patron, après le mur : « fais pareil pour la sélection d'une
 * pièce ». « Scinder » coupait la pièce en son milieu, sans rien demander :
 * la cloison d'un dressing ne tombe jamais au milieu de la chambre, et elle
 * n'a pas l'épaisseur d'un mur porteur. On donne maintenant la cote, du nu
 * du mur au nu de la cloison, et son épaisseur — comme pour le mur neuf.
 *
 * La cloison va d'un bord du contour à l'autre, en passant par le pôle de
 * la pièce : dans une pièce en L, elle coupe la branche où l'on se trouve,
 * pas le vide.
 */
export function coupeDePiece(
  part: RoomPart,
  s: SaisieCoupe,
): { a: Pt; b: Pt } | null {
  const pts = part.surface?.pts;
  if (!pts || pts.length < 3 || !(s.epaisseur > 0) || !(s.depuis >= 0)) return null;
  const r = repereDePiece(pts);
  const axe = s.sens === 'longueur' ? r.long : r.court;
  const e = s.sens === 'longueur' ? r.eLong : r.eCourt;
  const borne = s.depuisAutre ? e.max : e.min;
  const sens = s.depuisAutre ? -1 : 1;
  let pos = borne + sens * (demiDuBord(part.walls, axe, borne) + s.depuis + s.epaisseur / 2);
  // La cloison reste DANS la pièce : au-delà, ce n'est plus une coupe.
  pos = Math.min(Math.max(pos, e.min + s.epaisseur / 2 + 0.02), e.max - s.epaisseur / 2 - 0.02);
  const pole = part.labelAt;
  const decale = pos - (pole.x * axe.x + pole.z * axe.z);
  const P = { x: pole.x + axe.x * decale, z: pole.z + axe.z * decale };
  const travers = { x: -axe.z, z: axe.x };
  const a = rayonContour(P, travers, pts);
  const b = rayonContour(P, { x: -travers.x, z: -travers.z }, pts);
  if (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) < 0.2) return null;
  return { a, b };
}

/** La cote proposée d'abord : la coupe au milieu, au nu. */
export function coupeParDefaut(
  part: RoomPart,
  sens: SaisieCoupe['sens'],
  epaisseur: number,
): number {
  const d = dimensionsDeCoupe(part);
  if (!d) return 0;
  const v = (sens === 'longueur' ? d.longueur : d.largeur) / 2 - epaisseur / 2;
  return Math.max(0, Math.round(v * 100) / 100);
}

/**
 * LES QUATRE ÉCARTS D'UN MEUBLE AUX MURS, de chacun de ses bords au nu du
 * mur d'en face — la cote qu'on prend au mètre pour dire « le lit à
 * quarante centimètres de la fenêtre ».
 *
 * Dans les axes DU MEUBLE : un lit posé de biais se cote le long de ses
 * propres côtés, pas de ceux de l'écran. `null` quand aucun mur n'est en
 * face (le meuble regarde une baie, ou le vide d'un plan ouvert).
 *
 * LE MEUBLE D'À CÔTÉ COMPTE AUSSI — revue « Théo » : le chevet « à 0 cm à
 * droite » se mesurait au mur, À TRAVERS le lit (238 cm), et finissait
 * dans l'autre chevet. Un meuble voisin qui se dresse entre le bord et le
 * mur d'en face devient la cote (`vers` le nomme). L'écart peut être
 * négatif : le meuble mord déjà dans ce qu'il regarde.
 */
export interface VoisinDeMeuble {
  centre: Pt;
  width: number;
  depth: number;
  yaw: number;
  nom?: string;
}

export function ecartsAuxMurs(
  centre: Pt,
  box: { width: number; depth: number; yaw: number },
  walls: WallSeg[],
  voisins: VoisinDeMeuble[] = [],
): { dir: Pt; ecart: number | null; vers?: string }[] {
  const c = Math.cos(box.yaw);
  const sn = Math.sin(box.yaw);
  const ax = { x: c, z: sn };
  const az = { x: -sn, z: c };
  const pleins = walls.filter((w) => w.type === 'wall');
  const coinsDe = (v: VoisinDeMeuble): Pt[] => {
    const u = { x: Math.cos(v.yaw), z: Math.sin(v.yaw) };
    const w = { x: -u.z, z: u.x };
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => ({
      x: v.centre.x + (u.x * v.width * a + w.x * v.depth * b) / 2,
      z: v.centre.z + (u.z * v.width * a + w.z * v.depth * b) / 2,
    }));
  };
  const lesCoins = voisins.map((v) => ({ v, coins: coinsDe(v) }));
  return [
    { dir: ax, demi: box.width / 2, perp: az, demiPerp: box.depth / 2 },
    { dir: { x: -ax.x, z: -ax.z }, demi: box.width / 2, perp: az, demiPerp: box.depth / 2 },
    { dir: az, demi: box.depth / 2, perp: ax, demiPerp: box.width / 2 },
    { dir: { x: -az.x, z: -az.z }, demi: box.depth / 2, perp: ax, demiPerp: box.width / 2 },
  ].map(({ dir, demi, perp, demiPerp }) => {
    const d = castToWall(centre, dir, pleins);
    let ecart = d === null ? null : d - demi;
    let vers: string | undefined;
    for (const { v, coins } of lesCoins) {
      const le = coins.map((p) => (p.x - centre.x) * dir.x + (p.z - centre.z) * dir.z);
      const tr = coins.map((p) => (p.x - centre.x) * perp.x + (p.z - centre.z) * perp.z);
      // En face : il déborde sur la largeur du bord, à un centimètre près…
      if (Math.max(...tr) <= -demiPerp + 0.01 || Math.min(...tr) >= demiPerp - 0.01) continue;
      // …devant ce bord, sans être derrière le meuble ni l'englober.
      const min = Math.min(...le);
      if (Math.max(...le) <= demi + 1e-3 || min <= -demi + 1e-3) continue;
      const g = min - demi;
      if (ecart === null || g < ecart) {
        ecart = g;
        vers = v.nom ?? 'meuble';
      }
    }
    return vers ? { dir, ecart, vers } : { dir, ecart };
  });
}

/**
 * Le centre qui met CE bord du meuble à `voulu` du mur d'en face. Le
 * meuble glisse le long de cet axe, et seulement de lui.
 */
export function centrePourEcart(
  centre: Pt,
  e: { dir: Pt; ecart: number | null },
  voulu: number,
): Pt | null {
  if (e.ecart === null || !(voulu >= 0) || !Number.isFinite(voulu)) return null;
  const d = e.ecart - voulu;
  return { x: centre.x + e.dir.x * d, z: centre.z + e.dir.z * d };
}

/* ====================================================================== */
/*  LES ÉTAGES                                                            */
/* ====================================================================== */

/**
 * Le rez-de-chaussée. C'est le niveau des scans qui n'en déclarent aucun :
 * tous ceux d'avant les étages s'ouvrent donc là, sans migration.
 */
export const NIVEAU_RDC = 0;

/** L'étage d'un mur, d'une pièce, de tout ce qui peut en porter un. */
export function niveauDe(x: { niveau?: number } | null | undefined): number {
  return x?.niveau ?? NIVEAU_RDC;
}

/**
 * Le nom d'un niveau, tel qu'on le dit sur un chantier et tel qu'il
 * s'imprime en tête du plan.
 *
 * « Niveau 0 » ne veut rien dire pour un client ; « Rez-de-chaussée », si.
 */
export function nomDuNiveau(n: number): string {
  if (n === 0) return 'Rez-de-chaussée';
  if (n === -1) return 'Sous-sol';
  if (n < -1) return `Sous-sol ${n}`;
  return n === 1 ? '1er étage' : `${n}e étage`;
}

/**
 * Les niveaux qu'un dossier contient, DU HAUT VERS LE BAS.
 *
 * L'étage se choisit dans une colonne : le haut du bâtiment en haut de la
 * liste, sinon le geste contredit ce qu'on regarde. Un plan vide garde son
 * rez-de-chaussée, sans quoi le sélecteur n'aurait rien à montrer au
 * premier scan.
 */
export function niveauxPresents(
  walls: { niveau?: number }[],
  rooms: { niveau?: number }[] = [],
): number[] {
  const vus = new Set<number>([NIVEAU_RDC]);
  for (const w of walls) vus.add(niveauDe(w));
  for (const r of rooms) vus.add(niveauDe(r));
  return [...vus].sort((a, b) => b - a);
}

/**
 * GLISSE UN ÉTAGE ENTIER au-dessus de celui du dessous.
 *
 * Deux scans ne se superposent jamais tout seuls : ARKit repart de
 * l'endroit où l'on a appuyé sur « Scanner », jamais du même coin de mur.
 * Superposés bruts, les deux plans se croisent n'importe comment. On donne
 * donc la prise — l'étage se recale à la main sur le filigrane du niveau du
 * dessous, jusqu'à ce que la cage d'escalier tombe juste.
 */
/** Un point tourné de `angle` (radians) autour de `c`, dans le plan du sol. */
export function pivoterPoint(p: Pt, c: Pt, angle: number): Pt {
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  const x = p.x - c.x;
  const z = p.z - c.z;
  return { x: c.x + x * cs - z * sn, z: c.z + x * sn + z * cs };
}

/** Le centre d'un étage : le milieu de l'emprise de ses murs. */
export function centreDuNiveau(walls: WallSeg[], n: number): Pt | null {
  const pts = walls.filter((w) => niveauDe(w) === n).flatMap((w) => [w.a, w.b]);
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

/**
 * TOURNER UN ÉTAGE — le pendant de `deplacerNiveau`.
 *
 * Deux relevés faits à deux moments ne partent pas du même cap : l'étage
 * du dessus arrive souvent de quelques degrés de travers sur le filigrane
 * du dessous, et le glisser ne le redresse pas.
 */
export function pivoterNiveau<T extends WallSeg>(
  walls: T[],
  niveau: number,
  c: Pt,
  angle: number,
): T[] {
  if (angle === 0) return walls;
  return walls.map((w) =>
    niveauDe(w) === niveau
      ? { ...w, a: pivoterPoint(w.a, c, angle), b: pivoterPoint(w.b, c, angle) }
      : w,
  );
}

export function deplacerNiveau<T extends WallSeg>(
  walls: T[],
  niveau: number,
  dx: number,
  dz: number,
): T[] {
  if (dx === 0 && dz === 0) return walls;
  return walls.map((w) =>
    niveauDe(w) === niveau
      ? {
          ...w,
          a: { x: w.a.x + dx, z: w.a.z + dz },
          b: { x: w.b.x + dx, z: w.b.z + dz },
        }
      : w,
  );
}

/**
 * CE QUE MONTRE UN ÉTAGE, support compris.
 *
 * Le niveau n'est porté que par le mur et la pièce ; tout le reste en
 * hérite de son support — l'appareillage et la photo tiennent à un mur, le
 * meuble et le plafonnier à une pièce. Un seul filtre suffit donc, et
 * personne ne peut se retrouver à un étage où son support n'est pas.
 *
 * L'ORPHELIN REVIENT AU REZ-DE-CHAUSSÉE. Un renvoi mort — un mur effacé
 * dans une sauvegarde bancale — serait invisible à TOUS les étages : jamais
 * vu, jamais effacé, et pourtant compté dans le métré. On le montre en bas,
 * là où l'on peut le voir et le retirer.
 */
export function filtrerAuNiveau<
  W extends { id: string; niveau?: number },
  O extends { id: string; niveau?: number },
  R extends { id: string; niveau?: number },
  F extends { wallId: string },
  P extends { wallId: string },
  Ob extends { roomId?: string },
  C extends { roomId?: string },
  N extends { niveau?: number } = { niveau?: number },
>(
  jeu: {
    walls: W[];
    openings: O[];
    rooms: R[];
    fixtures: F[];
    photos: P[];
    objects: Ob[];
    ceiling: C[];
    /**
     * LES NOTES DU PLAN — elles portent leur étage EN PROPRE.
     *
     * Tout le reste hérite de son support : l'appareillage tient à un mur,
     * le meuble à une pièce. Une note, elle, désigne souvent ce qui n'a pas
     * encore de pièce — une arrivée dans un couloir, un percement dans une
     * cloison qu'on n'a pas fini de tracer. Elle se range donc avec les
     * murs et les pièces, du côté de ce qui sait où il est.
     *
     * Absentes des appels qui n'en ont pas encore : le filtre servait
     * avant qu'elles existent, et les relevés d'avant n'en portent aucune.
     */
    notes?: N[];
  },
  n: number,
): typeof jeu {
  let murs: Map<string, number> | null = null;
  let pieces: Map<string, number> | null = null;
  const murAuNiveau = () => (murs ??= new Map(jeu.walls.map((w) => [w.id, niveauDe(w)])));
  const pieceAuNiveau = () => (pieces ??= new Map(jeu.rooms.map((r) => [r.id, niveauDe(r)])));
  const parSupport = (table: () => Map<string, number>, cle: string | undefined) =>
    (table().get(cle ?? '') ?? NIVEAU_RDC) === n;
  return {
    walls: auNiveau(jeu.walls, SANS_SUPPORT, n, (w) => niveauDe(w) === n),
    openings: auNiveau(jeu.openings, SANS_SUPPORT, n, (o) => niveauDe(o) === n),
    rooms: auNiveau(jeu.rooms, SANS_SUPPORT, n, (r) => niveauDe(r) === n),
    fixtures: auNiveau(jeu.fixtures, jeu.walls, n, (f) => parSupport(murAuNiveau, f.wallId)),
    photos: auNiveau(jeu.photos, jeu.walls, n, (p) => parSupport(murAuNiveau, p.wallId)),
    objects: auNiveau(jeu.objects, jeu.rooms, n, (o) => parSupport(pieceAuNiveau, o.roomId)),
    ceiling: auNiveau(jeu.ceiling, jeu.rooms, n, (c) => parSupport(pieceAuNiveau, c.roomId)),
    notes: jeu.notes ? auNiveau(jeu.notes, SANS_SUPPORT, n, (x) => niveauDe(x) === n) : undefined,
  };
}

/**
 * LE MÊME TABLEAU TANT QUE RIEN N'A CHANGÉ — c'est ce qui rend le glisser
 * fluide.
 *
 * Mesuré sur le plan : glisser un meuble écrit le magasin à chaque image, et
 * ce filtre rendait alors SEPT tableaux neufs — murs, pièces, appareils… —
 * alors qu'un seul avait bougé. Chaque calcul de l'écran, mémoïsé sur ces
 * tableaux, se relançait donc à chaque image : les pièces, les cheminements,
 * le devis, les diagnostics, les cotes, la visite. Soixante fois par seconde.
 *
 * Deux règles, et le résultat est identique :
 *   — une liste dont rien n'est filtré (un logement de plain-pied, presque
 *     toujours) est rendue TELLE QUELLE ;
 *   — une liste déjà filtrée, pour le même étage et le même support (les
 *     murs d'un appareil, les pièces d'un meuble), rend le même résultat que
 *     la fois d'avant.
 */
const SANS_SUPPORT = {};
const DEJA_FILTRE = new WeakMap<object, WeakMap<object, Map<number, unknown[]>>>();
function auNiveau<T>(liste: T[], support: object, n: number, garde: (x: T) => boolean): T[] {
  let parSupport = DEJA_FILTRE.get(liste);
  if (!parSupport) {
    parSupport = new WeakMap();
    DEJA_FILTRE.set(liste, parSupport);
  }
  let parNiveau = parSupport.get(support);
  if (!parNiveau) {
    parNiveau = new Map();
    parSupport.set(support, parNiveau);
  }
  const deja = parNiveau.get(n);
  if (deja) return deja as T[];
  const f = liste.filter(garde);
  const out = f.length === liste.length ? liste : f;
  parNiveau.set(n, out);
  return out;
}

/**
 * LA LONGUEUR D'UN MUR QU'UN RELEVÉ RECOUVRE — même direction (à 10° près),
 * même ligne (à 25 cm près), sur la partie où ils se font face.
 *
 * C'est la question que pose « Scanner une pièce » : les passages que rend
 * l'iPhone sont-ils bien ceux du plan à l'écran, dans son repère ? Si oui,
 * les murs déjà relevés s'y retrouvent, à quelques centimètres près — le
 * temps que `StructureBuilder` réaligne les passages.
 */
function longueurRecouverte(w: WallSeg, venus: WallSeg[], tol = 0.25): number {
  const L = segLength(w);
  if (L < 1e-6) return 0;
  const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
  const cosMin = Math.cos((10 * Math.PI) / 180);
  const bouts: [number, number][] = [];
  for (const v of venus) {
    if (v.type !== 'wall') continue;
    const lv = segLength(v);
    if (lv < 1e-6) continue;
    const uv = { x: (v.b.x - v.a.x) / lv, z: (v.b.z - v.a.z) / lv };
    if (Math.abs(u.x * uv.x + u.z * uv.z) < cosMin) continue;
    // Les deux bouts du mur déjà là, à la ligne du mur venu.
    const ecart = (q: Pt) => Math.abs((q.x - v.a.x) * uv.z - (q.z - v.a.z) * uv.x);
    if (ecart(w.a) > tol || ecart(w.b) > tol) continue;
    const t = (q: Pt) => (q.x - w.a.x) * u.x + (q.z - w.a.z) * u.z;
    const t0 = Math.max(0, Math.min(t(v.a), t(v.b)));
    const t1 = Math.min(L, Math.max(t(v.a), t(v.b)));
    if (t1 > t0) bouts.push([t0, t1]);
  }
  bouts.sort((p, q) => p[0] - q[0]);
  let total = 0;
  let debut = 0;
  let fin = -Infinity;
  for (const [a, b] of bouts) {
    if (a > fin) {
      if (fin > -Infinity) total += fin - debut;
      debut = a;
      fin = b;
    } else fin = Math.max(fin, b);
  }
  if (fin > -Infinity) total += fin - debut;
  return total;
}

/** Ce mur a son pendant dans le relevé venu, sur au moins la moitié de sa longueur. */
export function estRecouvert(w: WallSeg, venus: WallSeg[]): boolean {
  const L = segLength(w);
  return L > 1e-6 && longueurRecouverte(w, venus) >= 0.5 * L;
}

/**
 * La part des murs déjà là (en longueur, de 0 à 1) que le relevé venu
 * recouvre. Rien à recouvrir, c'est tout recouvert.
 */
export function partRecouverte(existants: WallSeg[], venus: WallSeg[]): number {
  const murs = existants.filter((w) => w.type === 'wall');
  const total = murs.reduce((s, w) => s + segLength(w), 0);
  if (total < 1e-6) return 1;
  return murs.reduce((s, w) => s + longueurRecouverte(w, venus), 0) / total;
}

/**
 * DEUX MURS L'UN SUR L'AUTRE N'EN FONT QU'UN — revues « Sophie » et « Théo ».
 *
 * Une pièce accolée ou glissée contre une autre posait son mur PAR-DESSUS
 * celui du voisin : deux maçonneries au même endroit. En 3D, un seul des
 * deux se perçait et la porte restait murée ; la cote « depuis le coin » se
 * prenait sur le mauvais mur, et la porte de la salle de bains tombait sur
 * celle du WC ; le contrôle conseillait d'en supprimer un, et la moitié des
 * pièces s'ouvraient.
 *
 * Les murs qu'on vient de poser ou de déplacer (`nouveaux`) cèdent la place
 * à ceux qui étaient déjà là : la part commune devient UN mur, que les deux
 * pièces partagent ; ce qui dépasse reste à la nouvelle pièce. Les contours
 * des pièces sont réécrits au passage. Même niveau, même ligne (à 3 cm),
 * recouvrement d'au moins 5 cm.
 */
export function souderLesRecouvrements<W extends WallSeg, Rm extends { wallIds?: string[] }>(
  walls: W[],
  rooms: Rm[],
  nouveaux: Set<string>,
  tol = 0.03,
): { walls: W[]; rooms: Rm[] } {
  let ws = [...walls];
  let rs = rooms;
  const neufs = new Set(nouveaux);
  const pris = new Set(ws.map((w) => w.id));
  const nomLibre = (base: string) => {
    let k = 1;
    while (pris.has(`${base}#${k}`)) k++;
    const id = `${base}#${k}`;
    pris.add(id);
    return id;
  };
  const remplacer = (id: string, par: string[]) => {
    rs = rs.map((r) =>
      r.wallIds?.includes(id)
        ? { ...r, wallIds: [...new Set(r.wallIds.flatMap((x) => (x === id ? par : [x])))] }
        : r,
    );
  };
  for (let garde = 0; garde < 50; garde++) {
    let fait = false;
    for (const N of ws) {
      if (!neufs.has(N.id) || N.type !== 'wall') continue;
      const LN = segLength(N);
      if (LN < 1e-6) continue;
      const uN = { x: (N.b.x - N.a.x) / LN, z: (N.b.z - N.a.z) / LN };
      for (const E of ws) {
        if (E === N || neufs.has(E.id) || E.type !== 'wall' || niveauDe(E) !== niveauDe(N)) continue;
        const L = segLength(E);
        if (L < 1e-6) continue;
        const u = { x: (E.b.x - E.a.x) / L, z: (E.b.z - E.a.z) / L };
        if (Math.abs(u.x * uN.z - u.z * uN.x) > 0.02) continue;
        const ecart = (q: Pt) => Math.abs((q.x - E.a.x) * u.z - (q.z - E.a.z) * u.x);
        if (ecart(N.a) > tol || ecart(N.b) > tol) continue;
        const t = (q: Pt) => (q.x - E.a.x) * u.x + (q.z - E.a.z) * u.z;
        const s0 = Math.min(t(N.a), t(N.b));
        const s1 = Math.max(t(N.a), t(N.b));
        const o0 = Math.max(0, s0);
        const o1 = Math.min(L, s1);
        if (o1 - o0 < 0.05) continue;
        const at = (s: number): Pt => ({ x: E.a.x + u.x * s, z: E.a.z + u.z * s });
        // Le mur déjà là, coupé aux bouts de la part commune.
        const coupes = [0, ...[o0, o1].filter((s) => s > 1e-6 && s < L - 1e-6), L].sort((a, b) => a - b);
        const morceauxE = coupes.slice(1).map((fin, i) => ({ de: coupes[i], a: fin }));
        const idsE = morceauxE.map((_, i) => (i === 0 ? E.id : nomLibre(E.id)));
        const neufsE = morceauxE.map((m, i) => ({ ...E, id: idsE[i], a: at(m.de), b: at(m.a) }));
        const commun = idsE[morceauxE.findIndex((m) => m.de >= o0 - 1e-6 && m.a <= o1 + 1e-6)];
        /*
          Ce qui dépasse du mur neuf lui reste — DÈS QU'IL EXISTE. Revue
          « Inès » : une salle de bains qui dépassait le séjour de 1 à 4 cm
          perdait ce bout (il fallait 5 cm), son contour s'ouvrait, et elle
          s'affichait à 4,37 m² « ≈ » au lieu de 3,80, « il manque un mur ».
        */
        const restes: W[] = [];
        if (o0 - s0 > ECLAT) restes.push({ ...N, id: nomLibre(N.id), a: at(s0), b: at(o0) });
        if (s1 - o1 > ECLAT) restes.push({ ...N, id: nomLibre(N.id), a: at(o1), b: at(s1) });
        for (const x of restes) neufs.add(x.id);
        ws = [...ws.filter((w) => w !== N && w !== E), ...neufsE, ...restes];
        remplacer(E.id, idsE);
        remplacer(N.id, [restes[0]?.id, commun, restes[1]?.id].filter((x): x is string => !!x));
        fait = true;
        break;
      }
      if (fait) break;
    }
    if (!fait) break;
  }
  return { walls: ws, rooms: rs };
}

/**
 * LE NIVEAU SUR LEQUEL ON CALE CELUI QU'ON REGARDE — celui du dessous, ou à
 * défaut celui du dessus.
 *
 * Revue « Inès » : « Recaler cet étage » ne s'offrait qu'aux niveaux qui
 * en avaient un en dessous ; la cave, le plus bas, ne se recalait jamais,
 * alors qu'elle arrive avec le cap quelconque de son scan. Elle se cale sur
 * le rez-de-chaussée. Un seul niveau : rien à caler.
 */
export function niveauDeReference(niveaux: number[], n: number): number | null {
  const dessous = niveaux.filter((x) => x < n);
  if (dessous.length > 0) return Math.max(...dessous);
  const dessus = niveaux.filter((x) => x > n);
  return dessus.length > 0 ? Math.min(...dessus) : null;
}

/**
 * Le nom COURT d'un niveau, pour la pastille du plan.
 *
 * Elle est large comme « 2D » : « Rez-de-chaussee » n'y entre pas. Les
 * plans de batiment ecrivent R+1, R+2 — on ecrit comme eux.
 */
/**
 * OÙ S'ÉCRIT LE « DO » D'UN DÉTECTEUR D'OUVERTURE : au milieu de la baie,
 * un peu dans sa pièce — du côté du point où s'écrit le nom de la pièce.
 */
export function placeDuDetecteur(o: WallSeg, versLaPiece?: Pt): Pt {
  const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
  const L = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
  const n = { x: -(o.b.z - o.a.z) / L, z: (o.b.x - o.a.x) / L };
  const sens = versLaPiece ? Math.sign((versLaPiece.x - m.x) * n.x + (versLaPiece.z - m.z) * n.z) || 1 : 1;
  return { x: m.x + n.x * sens * 0.22, z: m.z + n.z * sens * 0.22 };
}

/** L'épaisseur d'un plancher : du plafond d'un niveau au sol du suivant. */
export const DALLE = 0.2;

/**
 * L'ALTITUDE DU SOL DE CHAQUE NIVEAU — revue « Léa » : les niveaux n'avaient
 * pas d'altitude, et deux OBJ importés dans un logiciel se superposaient au
 * lieu de s'empiler. Le rez-de-chaussée est à zéro ; un étage se pose sur la
 * hauteur sous plafond du niveau du dessous plus une dalle, un sous-sol
 * sous la sienne plus une dalle. Un niveau absent compte pour 2,50.
 */
export function altitudesDesNiveaux(walls: WallSeg[], dalle = DALLE): Map<number, number> {
  const murs = walls.filter((w) => w.type === 'wall');
  const presents = murs.map(niveauDe);
  const haut = Math.max(NIVEAU_RDC, ...presents);
  const bas = Math.min(NIVEAU_RDC, ...presents);
  const hauteur = (n: number) => {
    const hs = murs.filter((w) => niveauDe(w) === n).map((w) => w.height);
    return hs.length > 0 ? Math.max(...hs) : 2.5;
  };
  /*
    CE QUI EST SOUS L'ÉTAGE, PAS LE PLUS HAUT DES MURS — revue « Malik » :
    la mezzanine d'un loft se posait sur le mur de 5 m de l'atelier, à
    5,20 m, au-dessus du toit, quand elle couvre une chambre de 2,40 m. On
    prend la hauteur des murs du dessous qui tombent sous son emprise.
  */
  const sous = (n: number) => {
    const dessus = murs.filter((w) => niveauDe(w) === n + 1);
    if (dessus.length === 0) return hauteur(n);
    const xs = dessus.flatMap((w) => [w.a.x, w.b.x]);
    const zs = dessus.flatMap((w) => [w.a.z, w.b.z]);
    const x0 = Math.min(...xs) - 0.3;
    const x1 = Math.max(...xs) + 0.3;
    const z0 = Math.min(...zs) - 0.3;
    const z1 = Math.max(...zs) + 0.3;
    const dessous = murs.filter((w) => {
      if (niveauDe(w) !== n) return false;
      const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      return m.x >= x0 && m.x <= x1 && m.z >= z0 && m.z <= z1;
    });
    // Le plus bas des plafonds pleins du dessous : une mezzanine se pose
    // sur la chambre de 2,40 m, pas sur l'atelier en double hauteur.
    const pleins = dessous.map((w) => w.height).filter((h) => h >= 2);
    return pleins.length > 0 ? Math.min(...pleins) : hauteur(n);
  };
  const out = new Map<number, number>([[NIVEAU_RDC, 0]]);
  let alt = 0;
  for (let n = NIVEAU_RDC + 1; n <= haut; n++) {
    alt += sous(n - 1) + dalle;
    out.set(n, alt);
  }
  alt = 0;
  for (let n = NIVEAU_RDC - 1; n >= bas; n--) {
    alt -= hauteur(n) + dalle;
    out.set(n, alt);
  }
  return out;
}

export function abregerNiveau(n: number): string {
  if (n === 0) return 'RDC';
  if (n === -1) return 'SS';
  if (n < -1) return `SS${-n}`;
  return `R+${n}`;
}
