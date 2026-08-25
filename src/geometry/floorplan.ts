import type { ObjectData, SurfaceData, SurfaceTexture } from 'react-native-room-scan';

/** Épaisseur donnée aux murs dans tous les rendus (m). */
export const WALL_T = 0.14;

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
  /** Pièce à laquelle ce mur appartient (scan multi-pièces). */
  roomId?: string;
  /**
   * Ouverture qu'on TRAVERSE : baie sans porte, ou porte détectée ouverte.
   * Elle ne se dessine pas comme un panneau mais comme un vide.
   */
  open?: boolean;
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
  };
}

/**
 * Si les murs forment une boucle fermée (chaque coin relie exactement
 * deux murs), renvoie les coins ordonnés le long de la boucle — sinon null.
 * Sert au calcul de surface et au sol de la vue 3D.
 */
export function closedLoop(walls: WallSeg[]): { x: number; z: number }[] | null {
  if (walls.length < 3) return null;
  const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
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
export function wallQuads(walls: WallSeg[], t = WALL_T): Map<string, WallQuad> {
  const half = t / 2;
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
      const tee = walls.some((v) => {
        if (v.id === arm.wallId || roomOf(v) !== armRoom) return false;
        const { dist, t: pos } = pointOnSeg(P, v.a, v.b);
        return dist < t && pos > 0.02 && pos < 0.98;
      });
      // Le prolongement part À L'OPPOSÉ du corps du mur, dans celui du voisin.
      const C = tee
        ? { x: P.x - arm.dir.x * half, z: P.z - arm.dir.z * half }
        : P;
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
      // Faces qui bordent le secteur A→B : côté +perp pour A, −perp pour B.
      const pa = { x: P.x + na.x * half, z: P.z + na.z * half };
      const pb = { x: P.x - nb.x * half, z: P.z - nb.z * half };
      let X = lineCross(pa, A.dir, pb, B.dir);
      // Murs alignés (secteur plat ou replié) : pas d'onglet, on reste au bord.
      if (!X) X = pa;
      // Angle très aigu : l'onglet part à l'infini, on l'écrête.
      const d = Math.hypot(X.x - P.x, X.z - P.z);
      const maxOut = t * 3;
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
let quadMemo: { walls: WallSeg[]; t: number; map: Map<string, WallQuad> } | null =
  null;
export function wallQuadsOf(
  walls: WallSeg[],
  t = WALL_T,
): Map<string, WallQuad> {
  if (quadMemo && quadMemo.walls === walls && quadMemo.t === t) return quadMemo.map;
  const map = wallQuads(walls, t);
  quadMemo = { walls, t, map };
  return map;
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
          Math.abs(versIci) > WALL_T / 2
            ? versIci
            : Math.abs(versDepart) > WALL_T / 2
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
      const mini = demi + WALL_T / 2;
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
    if (passe > 0 || separateurs.length !== 1) continue;
    const a = separateurs[0];
    if (a.jeu >= AIMANT) continue;
    const sens = a.d >= 0 ? 1 : -1;
    p = { x: p.x - a.n.x * sens * a.jeu, z: p.z - a.n.z * sens * a.jeu };
  }
  return p;
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
  T extends { cx: number; cz: number; width: number; depth: number; yaw: number; y0: number; y1: number },
>(objets: T[]): { index: number; dx: number; dz: number }[] {
  const FRANC = 0.05;
  const bouges = objets.map(() => ({ dx: 0, dz: 0 }));
  const demi = (e: T, n: Pt) =>
    Math.abs(Math.cos(e.yaw) * n.x + Math.sin(e.yaw) * n.z) * (e.width / 2) +
    Math.abs(-Math.sin(e.yaw) * n.x + Math.cos(e.yaw) * n.z) * (e.depth / 2);
  // Trois passes : séparer deux meubles peut en rapprocher un troisième.
  for (let passe = 0; passe < 3; passe++) {
    for (let i = 0; i < objets.length; i++) {
      for (let j = i + 1; j < objets.length; j++) {
        const a = { ...objets[i], cx: objets[i].cx + bouges[i].dx, cz: objets[i].cz + bouges[i].dz };
        const b = { ...objets[j], cx: objets[j].cx + bouges[j].dx, cz: objets[j].cz + bouges[j].dz };
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
      if (dist < demi + WALL_T / 2 - 0.01) return false;
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
        Math.abs(versIci) > WALL_T / 2
          ? versIci
          : depuis && Math.abs(versDepart) > WALL_T / 2
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
        (p.x - w.a.x) * n.x + (p.z - w.a.z) * n.z - demi - WALL_T / 2;
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
      x: w.a.x + nw.x * (versBord >= 0 ? WALL_T / 2 : -WALL_T / 2),
      z: w.a.z + nw.z * (versBord >= 0 ? WALL_T / 2 : -WALL_T / 2),
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
function nearestOnRing(p: Pt, ring: Pt[]): Pt {
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
  /** Aire en m². */
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
  surface: RoomSurface | null;
  centroid: Pt;
  /** Où poser le cartouche : au large, jamais dans un mur ni contre lui. */
  labelAt: Pt;
}

/** Complète une pièce : contour, centre, et point de pose du cartouche. */
function makePart(roomId: string, items: WallSeg[]): RoomPart {
  const surface = roomSurface(items);
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
export function roomParts(walls: WallSeg[], rooms?: RoomShape[]): RoomPart[] {
  if (rooms && rooms.some((r) => r.wallIds)) {
    const byId = new Map(walls.map((w) => [w.id, w]));
    return rooms.map((r) =>
      makePart(
        r.id,
        (r.wallIds ?? [])
          .map((id) => byId.get(id))
          .filter((w): w is WallSeg => !!w),
      ),
    );
  }
  return groupByRoom(walls).map(({ roomId, items }) => makePart(roomId, items));
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
 */
export function clampFootprint(
  f: ObjectFootprint,
  walls: WallSeg[],
  interior: { x: number; z: number },
  wallT = WALL_T,
  margin = 0.02,
): ObjectFootprint {
  let cx = f.cx;
  let cz = f.cz;
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
    const need = wallT / 2 + margin - minCorner;
    // On accepte de déplacer jusqu'à la profondeur du meuble : de quoi
    // dégager une télé ou une étagère entièrement enfoncée dans la cloison.
    // Au-delà, le meuble vit ailleurs — on ne le téléporte pas.
    if (need > 0 && need < Math.max(0.8, f.depth + wallT)) {
      cx += nx * side * need;
      cz += nz * side * need;
    }
  }
  return faceIntoRoom({ ...f, cx, cz }, walls);
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
 * On prend donc le linteau LE PLUS HAUT comme référence (un volet ne peut
 * que rabaisser une baie, jamais la grandir), et l'on signale celles qui
 * tombent nettement dessous. Le seuil est large — quinze centimètres —
 * parce qu'un châssis de salle de bains ou une imposte peuvent
 * légitimement s'arrêter plus bas de quelques centimètres.
 */
export function linteauxRabotes(
  openings: WallSeg[],
  ecartMin = 0.15,
): { id: string; linteau: number; actuel: number }[] {
  const baies = openings.filter((o) => o.type !== 'wall');
  if (baies.length < 2) return [];
  const hautDe = (o: WallSeg) => o.yCenter + o.height / 2;
  const reference = Math.max(...baies.map(hautDe));
  return baies
    .filter((o) => reference - hautDe(o) >= ecartMin)
    .map((o) => ({ id: o.id, linteau: reference, actuel: hautDe(o) }));
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
export function fusionnerMursDoubles(
  walls: WallSeg[],
  ecartMax = 0.3,
): WallSeg[] {
  const out: WallSeg[] = [];
  const absorbes = new Set<string>();
  // Le plus long d'abord : c'est lui qui garde son identité.
  const tries = [...walls].sort((a, b) => segLength(b) - segLength(a));
  for (const w of tries) {
    if (absorbes.has(w.id) || w.type !== 'wall') {
      if (w.type !== 'wall') out.push(w);
      continue;
    }
    let A = { ...w.a };
    let B = { ...w.b };
    const l = segLength(w) || 1;
    const u = { x: (B.x - A.x) / l, z: (B.z - A.z) / l };
    const n = { x: -u.z, z: u.x };
    for (const o of tries) {
      if (o.id === w.id || absorbes.has(o.id) || o.type !== 'wall') continue;
      const lo = segLength(o) || 1;
      const uo = { x: (o.b.x - o.a.x) / lo, z: (o.b.z - o.a.z) / lo };
      if (Math.abs(u.x * uo.x + u.z * uo.z) < 0.95) continue;
      // Distance latérale : les deux bouts doivent longer la même ligne.
      const lat = (p: Pt) => Math.abs((p.x - A.x) * n.x + (p.z - A.z) * n.z);
      if (lat(o.a) > ecartMax || lat(o.b) > ecartMax) continue;
      // Recouvrement le long de l'axe : bout à bout ne compte pas.
      const t = (p: Pt) => (p.x - A.x) * u.x + (p.z - A.z) * u.z;
      const t0 = Math.min(t(o.a), t(o.b));
      const t1 = Math.max(t(o.a), t(o.b));
      const commun = Math.min(t1, l) - Math.max(t0, 0);
      if (commun <= 0.05) continue;
      // Absorbé : le mur retenu prend l'enveloppe des deux.
      absorbes.add(o.id);
      const deb = Math.min(0, t0);
      const fin = Math.max(l, t1);
      A = { x: A.x + u.x * deb, z: A.z + u.z * deb };
      B = { x: A.x + u.x * (fin - deb), z: A.z + u.z * (fin - deb) };
    }
    out.push({ ...w, a: A, b: B });
  }
  return out;
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
): { x0: number; x1: number; y0: number; y1: number } | null {
  if (!o.coffre || o.coffre <= 0) return null;
  const haut = o.yCenter + o.height / 2;
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
): boolean {
  const e = empriseDuCoffre(o, xBaie);
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
      if (Math.abs(ua.x * ub.x + ua.z * ub.z) < 0.9) continue;
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
  const libre = (w: WallSeg, p: Pt) =>
    !pleins.some(
      (o) =>
        o.id !== w.id &&
        (Math.hypot(o.a.x - p.x, o.a.z - p.z) < tol ||
          Math.hypot(o.b.x - p.x, o.b.z - p.z) < tol),
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

  const assigned = new Set<number>();
  const welded = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    if (assigned.has(i)) continue;
    const pi = points[i].wall[points[i].end];
    const room = roomOf(points[i].wall);
    const cluster = [i];
    for (let j = i + 1; j < points.length; j++) {
      if (assigned.has(j)) continue;
      if (roomOf(points[j].wall) !== room) continue;
      const pj = points[j].wall[points[j].end];
      if (Math.hypot(pi.x - pj.x, pi.z - pj.z) < tol) cluster.push(j);
    }
    if (cluster.length > 1) {
      const cx =
        cluster.reduce((s, k) => s + points[k].wall[points[k].end].x, 0) /
        cluster.length;
      const cz =
        cluster.reduce((s, k) => s + points[k].wall[points[k].end].z, 0) /
        cluster.length;
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
      if (t < 0.03 || t > 0.97) continue; // proche d'un bout : c'est un coin
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
  let sx = 0;
  let sy = 0;
  for (const w of walls) {
    const len = segLength(w);
    if (len < 0.2) continue;
    const a = Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x);
    // Période de 90° : on quadruple l'angle pour en faire un tour complet,
    // on moyenne les vecteurs, puis on revient. Un mur et son perpendiculaire
    // votent ainsi pour la MÊME trame.
    sx += len * Math.cos(4 * a);
    sy += len * Math.sin(4 * a);
  }
  if (sx === 0 && sy === 0) return 0;
  let t = Math.atan2(sy, sx) / 4;
  const q = Math.PI / 2;
  while (t < 0) t += q;
  while (t >= q) t -= q;
  return t;
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
export function splitAtJunctions(walls: WallSeg[], tol = 0.08): WallSeg[] {
  const out: WallSeg[] = [];
  for (const w of walls) {
    const len = segLength(w);
    if (len < 1e-6) {
      out.push(w);
      continue;
    }
    const cuts: number[] = [];
    for (const v of walls) {
      if (v.id === w.id) continue;
      for (const end of ['a', 'b'] as const) {
        const { dist, t } = pointOnSeg(v[end], w.a, w.b);
        if (dist > tol || t <= 0 || t >= 1) continue;
        // Trop près d'un bout : c'est un coin, pas un T — rien à couper.
        if (t * len < 0.2 || (1 - t) * len < 0.2) continue;
        cuts.push(t);
      }
    }
    if (cuts.length === 0) {
      out.push(w);
      continue;
    }
    cuts.sort((a, b) => a - b);
    const uniq = cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > 0.02);
    let prev = 0;
    let n = 0;
    for (const t of [...uniq, 1]) {
      if (t - prev < 1e-6) continue;
      const at = (u: number): Pt => ({
        x: w.a.x + (w.b.x - w.a.x) * u,
        z: w.a.z + (w.b.z - w.a.z) * u,
      });
      out.push({
        ...w,
        id: n === 0 ? w.id : `${w.id}#${n}`,
        a: at(prev),
        b: at(t),
        texture: sliceTexture(w.texture, prev, t),
      });
      prev = t;
      n++;
    }
  }
  return out;
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
      const k = nodeKey(from);
      const list = outgoing.get(k) ?? [];
      list.push(he);
      outgoing.set(k, list);
    }
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.angle - b.angle);

  /** Arête suivante de la face : la précédente en angle autour du nœud. */
  const nextOf = (he: HalfEdge): HalfEdge | null => {
    const list = outgoing.get(nodeKey(he.to));
    if (!list || list.length === 0) return null;
    // On repart de l'inverse de l'arête d'arrivée, puis on tourne d'un cran.
    const back = he.angle > 0 ? he.angle - Math.PI : he.angle + Math.PI;
    let idx = list.findIndex(
      (e) => e.wallId === he.wallId && nodeKey(e.to) === nodeKey(he.from),
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
const AIRE_SANS_PORTE = 2;

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
 */
export function massifsTechniques(
  walls: WallSeg[],
  openings: WallSeg[],
): Pt[][] {
  /*
    LE GRAPHE SE RECOUD D'ABORD. Un coffre de gaines s'appuie contre un mur
    sans le couper : tant que ce point de contact n'est pas un nœud, aucune
    face ne passe par lui et le recoin n'existe pour personne. C'est le même
    nettoyage que la détection des pièces fait avant de chercher ses faces.
  */
  const propres = splitAtJunctions(weldCorners(walls));
  const ouverts = mursOuverts(propres, openings);
  return facesFermees(propres)
    .filter(
      (f) =>
        f.area > 0.02 &&
        f.area < AIRE_SANS_PORTE &&
        !f.wallIds.some((id) => ouverts.has(id)),
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
): DetectedRoom[] {
  const ouverts = mursOuverts(walls, openings);
  return facesFermees(walls)
    .filter(
      (f) =>
        f.area >= minArea &&
        (f.area >= AIRE_SANS_PORTE || f.wallIds.some((id) => ouverts.has(id))),
    )
    .sort((a, b) => b.area - a.area);
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
      if (list.length !== 2) return null;
      const other = list.find((x) => x.wall.id !== w.id);
      if (!other) return null;
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
 * Cent quarante points par mètre, c'est déjà très près : une porte de
 * quatre-vingt-trois centimètres y fait cent seize points, la largeur d'un
 * pouce. Au-delà, on n'apprend plus rien du plan — on ne fait que perdre le
 * nord. Le pincement, lui, reste libre d'aller plus loin.
 */
export const ECHELLE_MAX_PLAN = 140;

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
  for (const w of walls) {
    const ex = w.b.x - w.a.x;
    const ez = w.b.z - w.a.z;
    const den = dir.x * ez - dir.z * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((w.a.x - from.x) * ez - (w.a.z - from.z) * ex) / den;
    const u = ((w.a.x - from.x) * dir.z - (w.a.z - from.z) * dir.x) / den;
    if (t > 1e-3 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  // Jusqu'au NU du mur, pas jusqu'à son axe : c'est la cote qu'on relève
  // sur place, mètre contre la plinthe.
  return isFinite(best) ? Math.max(0, best - WALL_T / 2) : null;
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
  const murAuNiveau = new Map(jeu.walls.map((w) => [w.id, niveauDe(w)]));
  const pieceAuNiveau = new Map(jeu.rooms.map((r) => [r.id, niveauDe(r)]));
  const parSupport = (
    table: Map<string, number>,
    cle: string | undefined,
  ) => (table.get(cle ?? '') ?? NIVEAU_RDC) === n;
  return {
    walls: jeu.walls.filter((w) => niveauDe(w) === n),
    openings: jeu.openings.filter((o) => niveauDe(o) === n),
    rooms: jeu.rooms.filter((r) => niveauDe(r) === n),
    fixtures: jeu.fixtures.filter((f) => parSupport(murAuNiveau, f.wallId)),
    photos: jeu.photos.filter((p) => parSupport(murAuNiveau, p.wallId)),
    objects: jeu.objects.filter((o) => parSupport(pieceAuNiveau, o.roomId)),
    ceiling: jeu.ceiling.filter((c) => parSupport(pieceAuNiveau, c.roomId)),
    notes: jeu.notes?.filter((x) => niveauDe(x) === n),
  };
}

/**
 * Le nom COURT d'un niveau, pour la pastille du plan.
 *
 * Elle est large comme « 2D » : « Rez-de-chaussee » n'y entre pas. Les
 * plans de batiment ecrivent R+1, R+2 — on ecrit comme eux.
 */
export function abregerNiveau(n: number): string {
  if (n === 0) return 'RDC';
  if (n === -1) return 'SS';
  if (n < -1) return `SS${-n}`;
  return `R+${n}`;
}
