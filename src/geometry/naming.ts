/**
 * NOMMER CE QU'ON A POSÉ — la pièce, le mur, et l'appareil lui-même.
 *
 * Un schéma unifilaire qui annonce « PC · C3 » ne se lit qu'avec le plan à
 * côté et un doigt dessus. Ce que porte un vrai schéma, c'est un nom :
 * « Prise plinthe 2 — Séjour, mur nord ». Trois informations, et on trouve
 * l'appareil sans rien ouvrir d'autre.
 *
 * Le mur se nomme par son ORIENTATION, relevée au magnétomètre pendant le
 * scan. C'est la seule désignation qui ait un sens sur un chantier : « le
 * mur nord de la chambre » se comprend sans plan, « le mur w-3 » non. Sans
 * boussole — scans anciens, appareil sans magnétomètre —, on ne nomme pas :
 * mieux vaut taire l'orientation qu'en inventer une.
 */
import { FIXTURES, type Fixture } from './electrical';
import { perpOf, roomOf, segLength, type Pt, type WallSeg } from './floorplan';

/** Les huit aires de vent, dans l'ordre des bearings croissants. */
const AIRES = [
  'nord',
  'nord-est',
  'est',
  'sud-est',
  'sud',
  'sud-ouest',
  'ouest',
  'nord-ouest',
];

/**
 * L'aire de vent d'une direction du monde.
 *
 * `north` est le cap de l'axe −Z du repère de scan, en degrés horaires
 * depuis le nord : 0 = le relevé a commencé face au nord. La direction du
 * nord dans le monde est donc (−sin, −cos), et l'est s'en déduit d'un quart
 * de tour horaire.
 */
export function bearingName(dir: Pt, north: number): string {
  const t = (north * Math.PI) / 180;
  const n = { x: -Math.sin(t), z: -Math.cos(t) };
  const e = { x: -n.z, z: n.x };
  const bearing =
    (Math.atan2(dir.x * e.x + dir.z * e.z, dir.x * n.x + dir.z * n.z) * 180) /
    Math.PI;
  const i = Math.round(((bearing % 360) + 360) / 45) % 8;
  return AIRES[i];
}

/**
 * De quel côté de la pièce se trouve ce mur : « nord », « sud-est »…
 *
 * C'est ainsi qu'on en parle sur place : le mur nord est celui qui ferme la
 * pièce au nord.
 *
 * PAR LA NORMALE DU MUR, PAS PAR LA DIRECTION DU CENTRE — relevé des revues
 * du dossier PDF : dans une enfilade de dix mètres, les quatre tronçons du
 * MÊME mur sud se nommaient « ouest », « sud-ouest », « sud-est » et
 * « est ». La direction du centre au milieu d'un tronçon dit où il est le
 * long de la pièce, pas de quel côté il la ferme ; deux murs différents
 * finissaient par s'appeler « mur est ». La normale du mur, tournée vers le
 * dehors de la pièce, dit le côté.
 *
 * `cote` : le côté du mur où se trouve la pièce (la convention de
 * `Fixture.side` et d'`interiorSide`). Quand on le connaît — l'appareil sait
 * sur quelle face il est posé, l'élévation sait quelle face elle regarde —
 * il tranche. Sinon, la direction du centre choisit le sens de la normale ;
 * dans un L, le centre peut tomber dans l'alignement d'un mur rentrant, et
 * seule la position parle alors.
 */
export function wallCardinal(
  wall: WallSeg,
  center: Pt,
  north: number | null,
  cote?: 1 | -1,
): string | null {
  if (north === null || !isFinite(north)) return null;
  const milieu = {
    x: (wall.a.x + wall.b.x) / 2,
    z: (wall.a.z + wall.b.z) / 2,
  };
  const dir = { x: milieu.x - center.x, z: milieu.z - center.z };
  const L = segLength(wall);
  if (L >= 1e-6 && cote) {
    const n = perpOf({ x: (wall.b.x - wall.a.x) / L, z: (wall.b.z - wall.a.z) / L });
    // La pièce est du côté `cote` : le dehors, de l'autre.
    return bearingName({ x: -cote * n.x, z: -cote * n.z }, north);
  }
  if (Math.hypot(dir.x, dir.z) < 0.05) return null;
  if (L < 1e-6) return bearingName(dir, north);
  const n = { x: -(wall.b.z - wall.a.z) / L, z: (wall.b.x - wall.a.x) / L };
  const cote0 = n.x * dir.x + n.z * dir.z;
  // Le centre dans l'alignement du mur : la normale n'a pas de sens à
  // choisir, la position seule parle.
  if (Math.abs(cote0) < 0.05) return bearingName(dir, north);
  return bearingName(cote0 > 0 ? n : { x: -n.x, z: -n.z }, north);
}

/** « mur nord », ou rien du tout si la boussole s'est tue. */
export function wallLabel(
  wall: WallSeg,
  center: Pt,
  north: number | null,
  /** Le côté de la pièce, quand on le sait : voir `wallCardinal`. */
  cote?: 1 | -1,
): string | null {
  const aire = wallCardinal(wall, center, north, cote);
  return aire ? `mur ${aire}` : null;
}

/**
 * LE NOM PARLÉ D'UN APPAREIL, pas sa référence de catalogue.
 *
 * Le catalogue dit « Prise 16 A » et « Prise double » — c'est juste, et
 * personne ne parle ainsi. Sur un chantier on dit « une prise », « une
 * double prise » ; le 16 A va de soi, et c'est le calibre du disjoncteur
 * qui le porte de toute façon, une colonne plus loin sur le schéma. Les
 * calibres qui ne vont PAS de soi — 20 A, 32 A — restent dits.
 */
const NOM_BASE: Partial<Record<Fixture['kind'], string>> = {
  prise: 'Prise',
  prise2: 'Double prise',
  prise3: 'Triple prise',
  rj2: 'Double RJ45',
  inter2: 'Double interrupteur',
  inter3: 'Triple interrupteur',
};

/**
 * La qualité d'une prise, quand sa hauteur la désigne.
 *
 * « Prise 3 » ne dit pas où chercher ; « Prise plinthe 3 » se trouve à
 * genoux, « Prise plan de travail 1 » à hauteur d'établi. C'est la
 * distinction que fait un électricien en parlant, et elle tient à la seule
 * hauteur de pose.
 */
function qualite(f: Fixture): string {
  const socle = f.kind === 'prise' || f.kind === 'prise2' || f.kind === 'prise3';
  if (!socle) return '';
  if (f.height <= 0.45) return ' plinthe';
  if (f.height >= 0.85 && f.height <= 1.4) return ' plan de travail';
  return '';
}

export interface DeviceName {
  /** « Prise plinthe 2 » — le nom qu'on lit sur le schéma. */
  nom: string;
  /** La pièce, si elle en a une. */
  piece: string;
  /** « mur nord », ou vide sans boussole. */
  mur: string;
}

/**
 * Nomme chaque appareil : type, qualité, et numéro DANS SA PIÈCE.
 *
 * Numéroter à l'échelle du logement donnerait « Prise 17 » dans une chambre
 * qui n'en compte que trois — un numéro qu'on ne peut compter sur place. Le
 * compteur repart donc à chaque pièce, comme on compte en visitant.
 */
export function deviceNames(
  fixtures: Fixture[],
  walls: WallSeg[],
  placement: Map<string, string | null>,
  roomNames: Record<string, string>,
  centers: Map<string, Pt>,
  north: number | null,
): Map<string, DeviceName> {
  const murs = new Map(walls.map((w) => [w.id, w]));
  const compte = new Map<string, number>();
  const out = new Map<string, DeviceName>();
  // Un ordre stable : la pièce, puis le mur, puis la position sur le mur.
  const ordre = [...fixtures].sort((a, b) => {
    const pa = placement.get(a.id) ?? '';
    const pb = placement.get(b.id) ?? '';
    if (pa !== pb) return pa < pb ? -1 : 1;
    if (a.wallId !== b.wallId) return a.wallId < b.wallId ? -1 : 1;
    return a.along - b.along;
  });
  for (const f of ordre) {
    const roomId = placement.get(f.id) ?? '';
    const base = `${NOM_BASE[f.kind] ?? FIXTURES[f.kind].label}${qualite(f)}`;
    const cle = `${roomId}|${base}`;
    const n = (compte.get(cle) ?? 0) + 1;
    compte.set(cle, n);
    const w = murs.get(f.wallId);
    const centre = centers.get(roomId);
    const mur =
      w && centre && segLength(w) > 0.05
        ? wallLabel(w, centre, north, f.side) ?? ''
        : '';
    out.set(f.id, {
      nom: `${base} ${n}`,
      piece: roomNames[roomId] ?? '',
      mur,
    });
  }
  return out;
}

/** Le mur d'un appareil, nommé — pratique quand on n'a que lui sous la main. */
export function fixtureWallLabel(
  f: Fixture,
  walls: WallSeg[],
  centers: Map<string, Pt>,
  north: number | null,
): string | null {
  const w = walls.find((x) => x.id === f.wallId);
  if (!w) return null;
  const centre = centers.get(roomOf(w) ?? '');
  return centre ? wallLabel(w, centre, north, f.side) : null;
}
