/**
 * « ÇA PASSE ? » — les portes, vues par celui qui déménage.
 *
 * Relevé du patron, point 6 de la réflexion « grand public » : « vérifier
 * qu'un canapé passe par les portes jusqu'à sa pièce, dessiner l'ouverture
 * des portes en 2D et prévenir si un meuble la bloque ».
 *
 * Deux questions qu'on se pose AVANT d'acheter, et que le plan sait trancher :
 *
 *   — LE BATTANT. Le plan dessinait déjà le quart de cercle de chaque porte
 *     (`FloorplanEditor`, en pixels). On le refait ici en mètres, par les
 *     mêmes règles — côté de la pièce qui porte la porte, sauf ouverture vers
 *     l'extérieur ; pivot rangé par `pivotsDesBattants` — et l'on cherche les
 *     meubles qui le heurtent : une porte qui ne s'ouvre plus qu'à moitié.
 *
 *   — LE CHEMIN. Depuis la porte d'entrée, de pièce en pièce, jusqu'à celle
 *     du meuble : chaque porte franchie doit le laisser passer. Un meuble
 *     passe une baie si ses DEUX plus petites dimensions y tiennent — porté
 *     debout ou sur le côté. On ne compte ni la manœuvre en biais, ni les
 *     couloirs étroits : le verdict le dit.
 */
import type { ObjectData } from 'react-native-room-scan';
import { pointInPolygon } from './appearance';
import {
  murDeLOuverture,
  pivotsDesBattants,
  roomOf,
  roomParts,
  type Pt,
  type RoomShape,
  type WallSeg,
} from './floorplan';
import { frCategory } from './furniture';

/** Le battant d'une porte, en mètres dans le repère du plan. */
export interface Battant {
  id: string;
  pivot: Pt;
  /** Le bout du vantail fermé : l'autre tableau de la baie. */
  ferme: Pt;
  /** Le bout du vantail ouvert à angle droit. */
  ouvert: Pt;
  r: number;
}

export function battantsDesPortes(
  openings: WallSeg[],
  walls: WallSeg[],
  rooms?: RoomShape[],
): Battant[] {
  const portes = openings.filter((o) => o.type === 'door');
  if (portes.length === 0) return [];
  const partOf = new Map(roomParts(walls, rooms).map((p) => [p.roomId, p]));
  const pivots = pivotsDesBattants(portes.map((o) => ({ id: o.id, a: o.a, b: o.b, pivot: o.pivot })));
  const out: Battant[] = [];
  for (const o of portes) {
    const ancre = partOf.get(roomOf(o))?.labelAt;
    if (!ancre) continue;
    const r = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
    if (r < 0.2) continue;
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    // La normale tournée vers la pièce qui porte la porte…
    let n = { x: -(o.b.z - o.a.z) / r, z: (o.b.x - o.a.x) / r };
    if ((ancre.x - m.x) * n.x + (ancre.z - m.z) * n.z < 0) n = { x: -n.x, z: -n.z };
    // … ou vers l'autre, quand le vantail s'ouvre de ce côté-là.
    if (o.versExterieur) n = { x: -n.x, z: -n.z };
    const pivot = pivots.get(o.id) === 'b' ? o.b : o.a;
    const ferme = pivot === o.a ? o.b : o.a;
    out.push({ id: o.id, pivot, ferme, ouvert: { x: pivot.x + n.x * r, z: pivot.z + n.z * r }, r });
  }
  return out;
}

/** Le quart de cercle balayé, en polygone convexe. */
function quartDeCercle(b: Battant, pas = 8): Pt[] {
  const a0 = Math.atan2(b.ferme.z - b.pivot.z, b.ferme.x - b.pivot.x);
  const a1 = Math.atan2(b.ouvert.z - b.pivot.z, b.ouvert.x - b.pivot.x);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const pts: Pt[] = [b.pivot];
  for (let i = 0; i <= pas; i++) {
    const a = a0 + (da * i) / pas;
    pts.push({ x: b.pivot.x + Math.cos(a) * b.r, z: b.pivot.z + Math.sin(a) * b.r });
  }
  return pts;
}

/** L'emprise au sol d'un meuble, rognée d'un jeu de deux centimètres. */
function emprise(o: ObjectData, jeu = 0.02): Pt[] {
  const t = o.transform;
  const c = { x: t[12], z: t[14] };
  const yaw = Math.atan2(t[2], t[0]);
  const hw = Math.max(0.01, o.width / 2 - jeu);
  const hd = Math.max(0.01, o.depth / 2 - jeu);
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, z]) => ({ x: c.x + x * cs - z * sn, z: c.z + x * sn + z * cs }));
}

/** Deux polygones convexes se chevauchent-ils ? (axes séparateurs) */
function chevauchent(p: Pt[], q: Pt[]): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ax = { x: -(b.z - a.z), z: b.x - a.x };
      if (Math.hypot(ax.x, ax.z) < 1e-9) continue;
      const proj = (pts: Pt[]) => pts.map((v) => v.x * ax.x + v.z * ax.z);
      const pp = proj(p);
      const qq = proj(q);
      if (Math.max(...pp) <= Math.min(...qq) || Math.max(...qq) <= Math.min(...pp)) return false;
    }
  }
  return true;
}

/** Sous ce seuil, un « meuble » est un tapis : le vantail passe dessus. */
const AU_RAS_DU_SOL = 0.05;
/** Au-dessus, il est plus haut qu'un vantail : la porte passe dessous. */
const AU_DESSUS_DE_LA_PORTE = 2.05;

/**
 * Les meubles qui heurtent le battant de chaque porte : identifiant de la
 * porte → identifiants des meubles, dans l'ordre du plan.
 */
export function meublesQuiBloquent(battants: Battant[], objects: ObjectData[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const pleins = objects.filter((o) => {
    const dessous = o.transform[13] - o.height / 2;
    return o.height >= AU_RAS_DU_SOL && dessous < AU_DESSUS_DE_LA_PORTE;
  });
  if (pleins.length === 0) return out;
  for (const b of battants) {
    const zone = quartDeCercle(b);
    const heurtes = pleins.filter((o) => chevauchent(zone, emprise(o))).map((o) => o.id);
    if (heurtes.length > 0) out.set(b.id, heurtes);
  }
  return out;
}

/** Le verdict, en deux longueurs : la puce, et l'explication. */
export interface VerdictDePassage {
  ok: boolean;
  court: string;
  detail: string;
}

const DEHORS = '__dehors__';
/** Ce que le vantail ouvert et le dormant reprennent sur la largeur d'une porte. */
const REPRISE_PORTE = 0.06;
/** Ce qui se livre en kit : monté, il ne passe pas — on le monte sur place. */
const EN_KIT = /bed|storage|table/i;

const MASCULINS = /^(s[ée]jour|salon|bureau|dressing|cellier|garage|couloir|d[ée]gagement|wc|grenier|sous-sol|palier|hall|cabinet)/i;
/** « de la chambre », « du séjour », « de l'entrée ». */
export function deLaPiece(nom: string): string {
  const n = nom.trim();
  const bas = n.charAt(0).toLowerCase() + n.slice(1);
  if (/^[aeiouyhàâéèêëîïôöùûü]/i.test(n)) return `de l’${bas}`;
  return MASCULINS.test(n) ? `du ${bas}` : `de la ${bas}`;
}
/** « à la chambre », « au séjour », « à l'entrée ». */
function aLaPiece(nom: string): string {
  const d = deLaPiece(nom);
  return d.startsWith('du ') ? `au ${d.slice(3)}` : `à ${d.slice(3)}`;
}
const cm = (v: number) => `${Math.round(v * 100)} cm`;

/** « la porte de la chambre » — la porte, nommée par la pièce qui la porte. */
export function nomDeLaPorte(o: WallSeg, rooms: { id: string; name?: string }[]): string {
  const nom = rooms.find((r) => r.id === roomOf(o))?.name;
  return nom ? `la porte ${deLaPiece(nom)}` : 'une porte';
}

interface Arete {
  o: WallSeg;
  cotes: [string, string];
  libre: number;
  haut: number;
}

/**
 * Le meuble passe-t-il, depuis la porte d'entrée, jusqu'à sa pièce ?
 * `null` quand on ne peut rien dire : meuble hors des pièces, pièce sans
 * porte.
 */
export function passageDuMeuble(
  objet: ObjectData,
  plan: { walls: WallSeg[]; openings: WallSeg[]; rooms: (RoomShape & { name?: string })[] },
): VerdictDePassage | null {
  const parts = roomParts(plan.walls, plan.rooms).filter((p) => p.surface && p.surface.pts.length >= 3);
  const ici = { x: objet.transform[12], z: objet.transform[14] };
  const cible =
    parts.find((p) => p.roomId === objet.roomId)?.roomId ??
    parts.find((p) => pointInPolygon(ici, p.surface!.pts))?.roomId;
  if (!cible) return null;
  const nomDe = (id: string) => plan.rooms.find((r) => r.id === id)?.name || 'la pièce';
  const pieceEn = (q: Pt) => parts.find((p) => pointInPolygon(q, p.surface!.pts))?.roomId ?? DEHORS;

  /*
    LES BAIES QU'ON FRANCHIT AVEC UN MEUBLE : les portes et les passages. Pas
    les portes-fenêtres — en appartement, on ne livre pas un canapé par le
    balcon, et le premier essai le faisait entrer par là.
  */
  const aretes: Arete[] = [];
  for (const o of plan.openings) {
    if (o.type !== 'door' && o.type !== 'opening') continue;
    const largeur = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
    if (largeur < 0.3) continue;
    const mur = murDeLOuverture(o, plan.walls) ?? o;
    const lm = Math.hypot(mur.b.x - mur.a.x, mur.b.z - mur.a.z) || 1;
    const n = { x: -(mur.b.z - mur.a.z) / lm, z: (mur.b.x - mur.a.x) / lm };
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    const a = pieceEn({ x: m.x + n.x * 0.4, z: m.z + n.z * 0.4 });
    const b = pieceEn({ x: m.x - n.x * 0.4, z: m.z - n.z * 0.4 });
    if (a === b) continue;
    aretes.push({ o, cotes: [a, b], libre: largeur - (o.type === 'door' ? REPRISE_PORTE : 0), haut: o.height });
  }
  if (!aretes.some((e) => e.cotes.includes(cible))) return null;

  // Le meuble, porté debout ou sur le côté : ses deux plus petites cotes.
  const [s1, s2] = [objet.width, objet.depth, objet.height].sort((x, y) => x - y);
  const tient = (e: Arete) => s1 <= Math.min(e.libre, e.haut) + 1e-6 && s2 <= Math.max(e.libre, e.haut) + 1e-6;

  const nomDeLArete = (e: Arete): string => {
    const [a, b] = e.cotes;
    if (a === DEHORS || b === DEHORS) {
      return e.o.type === 'door' ? 'la porte d’entrée' : `l’entrée ${deLaPiece(nomDe(a === DEHORS ? b : a))}`;
    }
    const mot = e.o.type === 'opening' ? 'le passage' : 'la porte';
    if (a === cible || b === cible) return `${mot} ${deLaPiece(nomDe(cible))}`;
    return `${mot} entre ${nomDe(a)} et ${nomDe(b)}`;
  };

  // D'où l'on part : la porte d'entrée. Sans elle, les portes de la pièce.
  const entrees = aretes.some((e) => e.cotes.includes(DEHORS));
  const chemin = (filtre: (e: Arete) => boolean): Arete[] | null => {
    const depart = entrees ? [DEHORS] : aretes.filter((e) => e.cotes.includes(cible)).map((e) => (e.cotes[0] === cible ? e.cotes[1] : e.cotes[0]));
    if (!entrees) {
      // Pas d'entrée relevée : il suffit de franchir une porte de la pièce.
      const e = aretes.find((x) => x.cotes.includes(cible) && filtre(x));
      return e ? [e] : null;
    }
    const vu = new Map<string, Arete | null>(depart.map((d) => [d, null]));
    const file = [...depart];
    while (file.length > 0) {
      const ici2 = file.shift()!;
      if (ici2 === cible) break;
      for (const e of aretes) {
        if (!filtre(e) || !e.cotes.includes(ici2)) continue;
        const la = e.cotes[0] === ici2 ? e.cotes[1] : e.cotes[0];
        if (vu.has(la)) continue;
        vu.set(la, e);
        file.push(la);
      }
    }
    if (!vu.has(cible)) return null;
    const out: Arete[] = [];
    let p = cible;
    while (vu.get(p)) {
      const e = vu.get(p)!;
      out.unshift(e);
      p = e.cotes[0] === p ? e.cotes[1] : e.cotes[0];
    }
    return out;
  };

  const nom = frCategory(objet.category ?? '');
  const taille = `${Math.round(objet.width * 100)} × ${Math.round(objet.depth * 100)} × ${Math.round(objet.height * 100)} cm`;
  const reserve = 'Porté debout ou sur le côté, sans compter la manœuvre en biais ni les couloirs étroits.';
  const bon = chemin(tient);
  if (bon) {
    const etapes = bon.map((e) => `${nomDeLArete(e)} (${cm(e.libre)})`);
    return {
      ok: true,
      court: 'Passe par les portes',
      detail:
        `${nom} (${taille}) : il passe jusqu’${aLaPiece(nomDe(cible))}` +
        (etapes.length > 0 ? ` — ${etapes.join(', ')}.` : '.') +
        ` ${reserve}`,
    };
  }
  const tout = chemin(() => true) ?? aretes.filter((e) => e.cotes.includes(cible));
  const coince = tout.find((e) => !tient(e)) ?? tout[0];
  const kit = EN_KIT.test(objet.category ?? '');
  return {
    ok: false,
    court: `Ne passe pas par ${nomDeLArete(coince)}`,
    detail:
      `${nom} (${taille}) : ${nomDeLArete(coince)} laisse ${cm(coince.libre)} de passage ` +
      `sur ${cm(coince.haut)} de haut ; il faudrait au moins ${cm(s1)} sur ${cm(s2)}.` +
      (kit ? ' Livré en kit, il se monte sur place.' : ` ${reserve}`),
  };
}
