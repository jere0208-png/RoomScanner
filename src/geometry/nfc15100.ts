/**
 * Conformité électrique et découpage en circuits.
 *
 * Ce que fait ce fichier : compter ce qui est posé, le comparer aux
 * exigences usuelles de la **NF C 15-100** (installations électriques
 * basse tension des locaux d'habitation, telle qu'amendée A5), puis répartir
 * l'appareillage en circuits et proposer la protection de chacun.
 *
 * Ce qu'il ne fait pas, et qu'il faut dire clairement : il ne délivre aucune
 * attestation. Deux familles d'exigences lui échappent —
 *
 * - **les volumes de la salle d'eau** (0, 1, 2), qui se mesurent par rapport
 *   à la baignoire ou au receveur : l'app ne les vérifie que si le mobilier
 *   a été relevé ;
 * - **la puissance réellement raccordée** (chauffage, cumulus), qui décide
 *   de la section et du calibre.
 *
 * L'éclairage, lui, est désormais vérifié — mais SEULEMENT quand le plafond
 * a commencé à être équipé. Avant cela, l'app n'a aucune information sur
 * lui, et une alerte par pièce ne dirait rien d'autre que « vous n'avez
 * rien saisi ».
 *
 * Le dernier mot reste à l'électricien. L'app lui épargne le comptage, pas
 * le métier.
 */
import type { RoomKind } from './furniture';
import {
  CEILINGS,
  type CeilingFixture,
  type CeilingKind,
} from './ceiling';
import { pointInPolygon } from './appearance';
import type { VolumeVerdict } from './volumes';
import {
  COMMANDES_MURALES,
  faceX,
  facePoint,
  wallFace,
} from './electrical';
import { roomOf, roomParts, solDesMurs, wallQuadsOf, type Pt, type WallSeg } from './floorplan';
import {
  FIXTURES,
  postsOf,
  rjOf,
  socketsOf,
  USAGES,
  type Fixture,
  type FixtureKind,
} from './electrical';

// --------------------------------------------------------------- usages

export type RoomUse =
  | 'sejour'
  | 'chambre'
  | 'bureau'
  | 'cuisine'
  | 'sdb'
  | 'wc'
  | 'circulation'
  /**
   * BALCON, LOGGIA, TERRASSE — revue « Gérard » : la loggia, même nommée,
   * suivait les règles du séjour (cinq socles et une RJ45), d'après sa table
   * et ses chaises. Dehors, la norme n'exige rien.
   */
  | 'exterieur'
  | 'autre';

const sansAccent = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // L'apostrophe de l'app (’) comme celle du clavier (') : « Salle d’eau »,
    // le nom que l'app propose, n'était pas reconnu (revue « Hugo »).
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();

/**
 * Usage d'une pièce, d'abord d'après le nom qu'on lui a donné — c'est la
 * décision de l'utilisateur, elle prime sur la déduction faite au scan.
 */
export function roomUse(name: string, kind?: RoomKind | null): RoomUse {
  const n = sansAccent(name);
  if (/loggia|balcon|terrasse/.test(n)) return 'exterieur';
  if (/sejour|salon|salle a manger|living|piece principale|piece a vivre/.test(n)) return 'sejour';
  if (/cuisine/.test(n)) return 'cuisine';
  if (/chambre/.test(n)) return 'chambre';
  if (/bureau/.test(n)) return 'bureau';
  if (/salle de bain|salle d'eau|salle deau|sdb/.test(n)) return 'sdb';
  if (/\bwc\b|toilette/.test(n)) return 'wc';
  if (/couloir|entree|degagement|circulation|palier/.test(n)) return 'circulation';
  if (/dressing|buanderie|cellier|garage|placard|local/.test(n)) return 'autre';
  switch (kind) {
    case 'kitchen':
      return 'cuisine';
    case 'bathroom':
      return 'sdb';
    case 'wc':
      return 'wc';
    case 'bedroom':
      return 'chambre';
    case 'living':
    case 'dining':
    case 'sejourCuisine':
      return 'sejour';
    default:
      return 'autre';
  }
}

/**
 * UNE CUISINE, MÊME OUVERTE — revue « Mehdi ». « Séjour-cuisine » se lisait
 * séjour (le mot vient en premier) : fausse alerte « socle 32 A hors
 * cuisine », aucun contrôle des circuits spécialisés ni des prises sur plan
 * de travail, et les prises du plan de travail sur le circuit d'une chambre.
 * Le séjour garde son compte de socles ; la cuisine y ajoute ses règles.
 */
export function estCuisine(name: string, kind?: RoomKind | null, equipee = false): boolean {
  const use = roomUse(name, kind);
  if (use === 'cuisine' || /cuisine|kitchenette/.test(sansAccent(name))) return true;
  /*
    LE NOM NE SUFFIT PAS — revue « Gérard » : l'exemple se disait conforme
    avec une cuisine ouverte (frigo, meuble bas, plaque) dans une pièce
    nommée « Séjour », type séjour. Reconnue au seul nom, elle échappait aux
    six socles dont quatre au-dessus du plan, aux trois spécialisés 20 A et
    au 32 A de cuisson — et le bouclier restait vert. Un séjour est aussi une
    cuisine quand le scan l'a vu ouvert sur elle (`sejourCuisine`), ou quand
    une plaque, un évier ou un plan de travail y est posé (`equipee`).
  */
  return use === 'sejour' && (kind === 'sejourCuisine' || kind === 'kitchen' || equipee);
}

/** Ce qui fait une cuisine, où qu'on le pose : la plaque, le four, l'évier, le plan. */
const EQUIPEMENT_DE_CUISINE = /stove|cooktop|oven|sink|counter/i;

/**
 * UNE PIÈCE ÉQUIPÉE EN CUISINE : un de ses meubles (au centre dans son
 * contour) est une plaque, un four, un évier ou un plan de travail.
 */
export function equipeeEnCuisine(
  outline: Pt[] | undefined,
  objets: readonly { category?: string; transform: number[] }[],
): boolean {
  if (!outline || outline.length < 3) return false;
  return objets.some(
    (o) =>
      EQUIPEMENT_DE_CUISINE.test(o.category ?? '') &&
      pointInPolygon({ x: o.transform[12], z: o.transform[14] }, outline),
  );
}

/**
 * UNE PRISE DE LA CUISINE, pour les circuits : toutes celles d'une cuisine ;
 * dans une cuisine ouverte, celles du plan de travail (le reste est au
 * séjour).
 */
export function priseDeCuisine(
  f: { height: number },
  piece: { name?: string; kind?: RoomKind | null; equipeeCuisine?: boolean } | undefined,
): boolean {
  if (!piece) return false;
  const nom = piece.name ?? '';
  if (roomUse(nom, piece.kind) === 'cuisine') return true;
  return estCuisine(nom, piece.kind, !!piece.equipeeCuisine) && f.height >= PLAN_TRAVAIL - 1e-6;
}

/**
 * L'USAGE DE CETTE PIÈCE EST-IL CONNU, ou déduit faute de mieux ?
 *
 * `roomUse` rend toujours une réponse — « autre » quand rien ne dit ce
 * qu'est la pièce. C'est le bon défaut pour CALCULER (une pièce non nommée
 * doit au moins un socle), et le mauvais pour AFFICHER : l'établi annonçait
 * « 2/1 socle » sur une pièce sans nom, c'est-à-dire conforme, alors que la
 * même pièce nommée « Chambre » en exige trois. Le relevé passe, le
 * chantier non.
 *
 * Cette fonction dit la différence : l'exigence est-elle CELLE DE LA PIÈCE,
 * ou le minimum qu'on applique en attendant de savoir ?
 */
export function usageConnu(name: string, kind?: RoomKind | null): boolean {
  // On ne redit pas la liste des noms : elle vit dans `roomUse`, et deux
  // listes qui divergent d'un mot feraient revenir le defaut sans qu'on
  // comprenne pourquoi. « autre » est la seule reponse ambigue — c'est a la
  // fois le cellier RECONNU et la piece dont on ne sait rien.
  if (roomUse(name, kind) !== 'autre') return true;
  return /dressing|buanderie|cellier|garage|placard|local/.test(
    sansAccent(name),
  );
}

export const USE_LABEL: Record<RoomUse, string> = {
  sejour: 'Séjour',
  chambre: 'Chambre',
  bureau: 'Bureau',
  cuisine: 'Cuisine',
  sdb: 'Salle d’eau',
  wc: 'WC',
  circulation: 'Circulation',
  exterieur: 'Extérieur',
  autre: 'Autre pièce',
};

/** Pièce principale au sens de la norme : séjour, chambres, bureau. */
const PRINCIPALE: RoomUse[] = ['sejour', 'chambre', 'bureau'];

// ------------------------------------------------------------- exigences

/** Ce qu'une pièce doit comporter, et pourquoi. */
export interface RoomRequirement {
  socles: number;
  rj45: number;
  /** Socles à poser au-dessus du plan de travail (cuisine). */
  surPlan: number;
  regle: string;
}

/**
 * Exigences d'une pièce selon son usage et sa surface.
 *
 * Les nombres ci-dessous sont ceux couramment retenus pour la NF C 15-100
 * amendée A5. La règle du séjour est proportionnelle : un socle par tranche
 * de 4 m², jamais moins de cinq.
 */
export function requirementFor(use: RoomUse, area: number): RoomRequirement {
  switch (use) {
    case 'sejour':
      return {
        socles: Math.max(5, Math.ceil(area / 4)),
        rj45: 1,
        surPlan: 0,
        regle:
          'Séjour : un socle 16 A par tranche de 4 m², cinq au minimum, ' +
          'et au moins une prise de communication RJ45.',
      };
    case 'chambre':
      return {
        socles: 3,
        rj45: 1,
        surPlan: 0,
        regle:
          'Chambre : trois socles 16 A au minimum, et une prise de ' +
          'communication RJ45.',
      };
    case 'bureau':
      return {
        socles: 3,
        rj45: 1,
        surPlan: 0,
        regle:
          'Pièce principale : trois socles 16 A au minimum, et une prise ' +
          'de communication RJ45.',
      };
    case 'cuisine':
      return area >= 4
        ? {
            socles: 6,
            rj45: 0,
            surPlan: 4,
            regle:
              'Cuisine d’au moins 4 m² : six socles 16 A, dont quatre ' +
              'au-dessus du plan de travail. Aucun au-dessus des feux ou ' +
              'de l’évier.',
          }
        : {
            socles: 3,
            rj45: 0,
            surPlan: 0,
            regle: 'Cuisine de moins de 4 m² : trois socles 16 A au minimum.',
          };
    case 'sdb':
      return {
        socles: 1,
        rj45: 0,
        surPlan: 0,
        regle:
          'Salle d’eau : au moins un socle, obligatoirement hors des ' +
          'volumes 0, 1 et 2 — l’app ne sait pas où ils tombent, c’est à ' +
          'vérifier sur place.',
      };
    case 'circulation':
      return {
        socles: area > 4 ? 1 : 0,
        rj45: 0,
        surPlan: 0,
        regle: 'Circulation de plus de 4 m² : un socle 16 A au minimum.',
      };
    case 'wc':
      return { socles: 0, rj45: 0, surPlan: 0, regle: 'WC : aucun socle exigé.' };
    case 'exterieur':
      return {
        socles: 0,
        rj45: 0,
        surPlan: 0,
        regle: 'Balcon, loggia, terrasse : aucun socle exigé. Une prise dehors se pose en IP44.',
      };
    default:
      return {
        socles: area >= 4 ? 1 : 0,
        rj45: 0,
        surPlan: 0,
        regle: 'Autre pièce d’au moins 4 m² : un socle 16 A au minimum.',
      };
  }
}

/**
 * CE QU'UNE PIÈCE DOIT PORTER, CUISINE OUVERTE COMPRISE — le contrôle et
 * « Normes auto » lisent la même règle (revue « Gérard » : l'auto posait
 * les socles d'un séjour dans un séjour-cuisine, et le contrôle en
 * réclamait quatre au-dessus du plan).
 */
export function exigencesDeLaPiece(use: RoomUse, area: number, cuisineOuverte: boolean): RoomRequirement {
  const base = requirementFor(use, area);
  return cuisineOuverte && area >= 4
    ? {
        ...base,
        socles: Math.max(base.socles, 6),
        surPlan: 4,
        regle: base.regle + ' Cuisine ouverte : six socles au moins, dont quatre au-dessus du plan de travail.',
      }
    : base;
}

// ------------------------------------------------------- hauteurs de pose

/** Plage de hauteur d'axe admise, quand la norme en fixe une. */
/**
 * Un plan de travail devant un mur : sur quelle portion, et à quelle
 * hauteur.
 *
 * La règle des 1,30 m dit « hors plan de travail » — et c'est justement
 * au-dessus d'un plan de travail qu'on pose le plus de prises. Sans en
 * tenir compte, l'app signalait en défaut la totalité d'une crédence de
 * cuisine, ce qui revient à ne rien signaler du tout : on n'écoute plus un
 * garde-fou qui se trompe à chaque fois.
 */
export interface Worktop {
  /** Portion du mur couverte, en abscisse de face (m). */
  from: number;
  to: number;
  /** Altitude du dessus, en mètres depuis le sol. */
  height: number;
  /**
   * Ce que porte ce dessus, quand ce n'est pas un plan libre : la plaque ou
   * l'évier. La norme n'y veut aucun socle au-dessus.
   */
  nature?: 'cuisson' | 'evier';
}

/** Meubles qui portent un plan de travail (dessus entre 80 cm et 1 m). */
const PORTE_PLAN = /counter|countertop|sink|stove|cooktop|oven|dishwasher|washer/i;
/** En cuisine, un caisson bas fait plan de travail lui aussi. */
const CAISSON = /storage|cabinet|refrigerator/i;

/**
 * Les plans de travail que ce mur longe.
 *
 * Un meuble compte s'il est ASSEZ PRÈS du mur (75 cm : la profondeur d'un
 * caisson plus un jeu), si son dessus est à hauteur de plan (80 cm à 1 m),
 * et il ne couvre que la portion du mur qu'il longe réellement.
 */
export function worktopsOnWall(
  face: { A: Pt; ux: number; uz: number; nx: number; nz: number; len: number },
  objects: {
    category?: string;
    width: number;
    depth: number;
    height: number;
    transform: number[];
  }[],
  cuisine: boolean,
  floorY = 0,
): Worktop[] {
  const out: Worktop[] = [];
  for (const o of objects) {
    const cat = o.category ?? '';
    if (!PORTE_PLAN.test(cat) && !(cuisine && CAISSON.test(cat))) continue;
    const cx = o.transform[12];
    const cz = o.transform[14];
    const haut = o.transform[13] + (o.height ?? 0) / 2 - floorY;
    if (haut < 0.8 || haut > 1.02) continue;
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // Emprise du meuble projetée sur la face : abscisse et éloignement.
    let x0 = Infinity;
    let x1 = -Infinity;
    let loin = Infinity;
    let pres = Infinity;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const lx = (sx * o.width) / 2;
      const lz = (sz * o.depth) / 2;
      const px = cx + lx * cos - lz * sin;
      const pz = cz + lx * sin + lz * cos;
      const dx = px - face.A.x;
      const dz = pz - face.A.z;
      const le = dx * face.ux + dz * face.uz;
      const de = dx * face.nx + dz * face.nz;
      x0 = Math.min(x0, le);
      x1 = Math.max(x1, le);
      pres = Math.min(pres, de);
      loin = Math.min(loin, Math.abs(de));
    }
    // Devant la face, et à portée : un meuble de l'autre pièce ne compte pas.
    if (pres < -0.1 || loin > 0.75) continue;
    const a = Math.max(0, x0);
    const b = Math.min(face.len, x1);
    if (b - a < 0.15) continue;
    const nature = /stove|cooktop/i.test(cat) ? 'cuisson' : /sink/i.test(cat) ? 'evier' : undefined;
    out.push({ from: a, to: b, height: haut, ...(nature ? { nature } : {}) });
  }
  return out;
}

/**
 * OÙ TOMBE UN SOCLE PAR RAPPORT AUX PLANS DE TRAVAIL DE SON MUR — revue
 * « Nadia » : quatre prises à 1,10 m sur des murs nus passaient pour « au-
 * dessus du plan de travail », et l'unifilaire les nommait ainsi. Seul un
 * socle au droit d'un plan relevé, et plus haut que lui, y est vraiment ;
 * au droit de la plaque ou de l'évier, il est à sa place interdite.
 */
export function socleFaceAuPlan(
  x: number,
  hauteur: number,
  plans: Worktop[],
): 'plan' | 'cuisson' | 'evier' | null {
  const au = plans.filter((w) => x >= w.from - 0.02 && x <= w.to + 0.02 && hauteur >= w.height + 0.05);
  const interdit = au.find((w) => w.nature);
  if (interdit?.nature) return interdit.nature;
  return au.length > 0 ? 'plan' : null;
}

/**
 * LES PLANS DE TRAVAIL DE CHAQUE MUR, côté pièce — une seule recette pour
 * l'écran, le contrôle et le nommage de l'export (qui disait « plan de
 * travail » d'une prise à 1,10 m sur un mur nu).
 */
export function plansDeTravailParMur(
  walls: WallSeg[],
  rooms: { id: string; name?: string; kind?: RoomKind | null }[],
  objects: Parameters<typeof worktopsOnWall>[1],
): Map<string, { x: (f: { along: number }) => number; plans: Worktop[]; devant?: Pt }> {
  const quads = wallQuadsOf(walls);
  const sol = solDesMurs(walls);
  const m = new Map<string, { x: (f: { along: number }) => number; plans: Worktop[]; devant?: Pt }>();
  for (const w of walls) {
    const piece = rooms.find((r) => r.id === roomOf(w));
    const nommee = estCuisine(piece?.name ?? '', piece?.kind);
    for (const side of [1, -1] as const) {
      const face = wallFace(w, quads.get(w.id), side);
      /*
        LA FACE QUI PORTE LA PLAQUE OU L'ÉVIER EST UNE CUISINE — revue
        « Gérard » : la pièce d'un mur se lit à `roomId`, que seul un scan
        multi-pièces renseigne ; ailleurs, les caissons d'une cuisine ouverte
        ne faisaient pas plan de travail, et aucun socle ne le surplombait.
      */
      const nus = worktopsOnWall(face, objects, false, sol);
      const equipee = nus.find((p) => p.nature);
      // La plaque seule décide des caissons : un évier se trouve aussi en salle d'eau.
      const plans = worktopsOnWall(face, objects, nommee || nus.some((p) => p.nature === 'cuisson'), sol);
      if (plans.length === 0) continue;
      // Un point devant la plaque ou l'évier : il dit QUELLE pièce est équipée.
      const devant = equipee
        ? facePoint(face, (equipee.from + equipee.to) / 2, 0.3)
        : undefined;
      m.set(w.id, { x: (f) => faceX(face, f.along), plans, ...(devant ? { devant } : {}) });
      break;
    }
  }
  return m;
}

/** Un meuble vu DE FACE, projeté sur le mur. */
export interface WallFurniture {
  /** Emprise sur la face, en abscisse (m). */
  from: number;
  to: number;
  /** Hauteur hors tout, depuis le sol (m). */
  top: number;
  /**
   * Hauteur du DESSOUS au-dessus du sol (m).
   *
   * Zéro pour ce qui est posé par terre, et c'est le cas courant — mais la
   * moitié de ce qui gêne un électricien est accroché en l'air : meuble
   * haut de cuisine, hotte, télé, chauffe-eau. Sans cette cote, l'élévation
   * les dessine tous depuis le carrelage, et le plan de travail sur lequel
   * on pose les prises disparaît sous une colonne pleine.
   */
  base: number;
  /** À quelle distance du nu du mur il se tient (m). */
  ecart: number;
  category: string;
  /** Son nom donné ou son modèle du catalogue (voir `nomDuMeuble`). */
  nom?: string;
  modele?: string;
  /** La pièce du meuble, quand on la connaît. */
  roomId?: string;
}

/**
 * LES MEUBLES QUI SE TIENNENT DEVANT CE MUR.
 *
 * Face au mur, on décide où percer — et on décide à l'aveugle : le dessin
 * montre une belle surface libre là où se dresse une bibliothèque. La
 * prise se pose, le plan part au chantier, et personne ne la revoit avant
 * d'avoir à déplacer le meuble.
 *
 * On reprend donc la projection des plans de travail, sans son filtre de
 * catégorie ni sa fourchette de hauteur : tout ce qui se tient devant la
 * face, à moins de 75 cm, avec son emprise et sa hauteur. Ce qui dépasse
 * du mur est borné à la face — un canapé en travers n'a pas à déborder
 * du dessin.
 */
export function wallFurniture(
  face: { A: Pt; ux: number; uz: number; nx: number; nz: number; len: number },
  objects: {
    category?: string;
    width: number;
    depth: number;
    height: number;
    transform: number[];
    nom?: string;
    modele?: string;
    roomId?: string;
  }[],
  floorY = 0,
): WallFurniture[] {
  const out: WallFurniture[] = [];
  for (const o of objects) {
    const cx = o.transform[12];
    const cz = o.transform[14];
    const top = o.transform[13] + (o.height ?? 0) / 2 - floorY;
    if (!(top > 0.05)) continue;
    // Un scan place parfois un meuble légèrement enfoncé dans le sol : la
    // silhouette n'a pas à déborder sous la ligne du plancher.
    const base = Math.max(0, Math.min(top, o.transform[13] - (o.height ?? 0) / 2 - floorY));
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    let x0 = Infinity;
    let x1 = -Infinity;
    let pres = Infinity;
    let proche = Infinity;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const lx = (sx * o.width) / 2;
      const lz = (sz * o.depth) / 2;
      const px = cx + lx * cos - lz * sin;
      const pz = cz + lx * sin + lz * cos;
      const dx = px - face.A.x;
      const dz = pz - face.A.z;
      x0 = Math.min(x0, dx * face.ux + dz * face.uz);
      x1 = Math.max(x1, dx * face.ux + dz * face.uz);
      const de = dx * face.nx + dz * face.nz;
      pres = Math.min(pres, de);
      proche = Math.min(proche, Math.abs(de));
    }
    // Derrière la face, ou trop loin : c'est le meuble d'une autre pièce,
    // ou d'un autre bout de la pièce.
    if (pres < -0.1 || proche > 0.75) continue;
    const a = Math.max(0, x0);
    const b = Math.min(face.len, x1);
    if (b - a < 0.1) continue;
    out.push({
      from: a,
      to: b,
      top,
      base,
      ecart: Math.max(0, pres),
      category: o.category ?? '',
      ...(o.nom ? { nom: o.nom } : {}),
      ...(o.modele ? { modele: o.modele } : {}),
      ...(o.roomId ? { roomId: o.roomId } : {}),
    });
  }
  return out.sort((p, q) => p.from - q.from);
}

/**
 * La règle de hauteur qui s'applique VRAIMENT à cet endroit du mur.
 *
 * Au-dessus d'un plan de travail, un socle ne se pose ni derrière le meuble
 * ni au plafond : 8 cm au-dessus du plan au minimum — de quoi passer la
 * main —, 40 cm au-dessus au maximum, ce qui laisse la crédence libre.
 */
export function heightRuleAt(
  kind: FixtureKind,
  x: number,
  worktops: Worktop[],
): { min?: number; max?: number; regle: string } | null {
  const base = HEIGHT_RULES[kind];
  if (!base) return null;
  const plan = worktops.find((w) => x >= w.from - 0.05 && x <= w.to + 0.05);
  if (!plan) return base;
  // Seuls les appareils qu'on pose sur une crédence sont concernés.
  if (!/^(prise|prise2|prise3|prise20|rj45|rj2|inter|va|tv)$/.test(kind)) {
    return base;
  }
  const min = plan.height + 0.08;
  return {
    min,
    max: Math.max(min + 0.05, plan.height + 0.4),
    regle: `Au-dessus d'un plan de travail à ${Math.round(
      plan.height * 100,
    )} cm : axe entre ${Math.round(min * 100)} et ${Math.round(
      (plan.height + 0.4) * 100,
    )} cm du sol.`,
  };
}

/*
  LES RÈGLES SUIVENT LES POSTES — revue « Karim » : dix-sept appareils
  n'avaient aucune règle. Un interrupteur simple à 1,60 m alertait, un double
  ou l'interrupteur général à la même hauteur passaient ; une prise triple à
  2 cm du sol aussi. Tout ce qui porte une commande prend la règle des
  commandes, tout ce qui porte un socle celle des socles.

  ET 1,30 M N'EST PAS UN MAXIMUM POUR UN SOCLE : la norme n'en fixe pas (une
  prise derrière la télévision murale est à sa place). C'est la hauteur
  d'ACCESSIBILITÉ : au-dessus, une simple information (`maxInfo`).
*/
const SOCLE = {
  min: 0.05,
  max: 1.3,
  maxInfo: true,
  regle:
    'Socle 16 A : axe à 5 cm du sol au minimum. Au-delà de 1,30 m, il n’est plus ' +
    'accessible à une personne en fauteuil (hors plan de travail).',
};
const COMMANDE = {
  min: 0.9,
  max: 1.3,
  regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
};

export const HEIGHT_RULES: Partial<
  Record<FixtureKind, { min?: number; max?: number; maxInfo?: boolean; regle: string }>
> = {
  prise: SOCLE,
  prise2: SOCLE,
  prise3: SOCLE,
  rjPrise: SOCLE,
  rjPrise2: SOCLE,
  tvPrise: SOCLE,
  inter2: COMMANDE,
  inter3: COMMANDE,
  interGeneral: COMMANDE,
  volet: COMMANDE,
  prise32: {
    min: 0.12,
    regle: 'Socle 32 A de cuisson : axe à 12 cm du sol au minimum.',
  },
  inter: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  va: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  poussoir: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  variateur: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  tableau: {
    min: 0.9,
    max: 1.8,
    regle:
      'Tableau : organes de manœuvre entre 0,90 m et 1,80 m du sol ' +
      '(1,30 m au plus pour un logement adapté).',
  },
};

/** Un socle est réputé « au-dessus du plan de travail » à partir de 90 cm. */
const PLAN_TRAVAIL = 0.9;

/** Une prise posée pour UN appareil (sigle FRI, MI, H…) : pas un socle d'usage. */
const priseDAppareil = (f: { kind: FixtureKind; usage?: string }) =>
  !!f.usage && (f.kind === 'prise' || f.kind === 'prise2' || f.kind === 'prise3');

/** Un appareil porte-t-il au moins un socle 16 A ? */
const porteSocle = (k: FixtureKind) => socketsOf(k) > 0;

// ------------------------------------------------------------- constats

/**
 * Le geste qui règle le constat.
 *
 * Un défaut qu'on se contente d'afficher laisse l'utilisateur chercher tout
 * seul où et comment le corriger. Chaque constat porte donc, quand elle
 * existe, l'action qui l'efface — poser l'appareil qui manque, ou remettre
 * à sa hauteur celui qui est mal posé.
 */
export type ElecFix =
  | { type: 'poser'; kind: FixtureKind; height?: number; label: string }
  | { type: 'hauteur'; fixtureId: string; height: number; label: string }
  | { type: 'plafond'; kind: CeilingKind; label: string }
  /**
   * Remonter le linteau d'une baie que le scan a rabotée — le volet
   * pendait sous son coffre au moment du relevé.
   */
  | { type: 'linteau'; openingId: string; haut: number; label: string };

/** Nature du constat : de quoi on parle, sans lire la phrase. */
export type ElecCode =
  | 'socles'
  | 'surPlan'
  | 'rj45'
  | 'hauteur'
  | 'circuits'
  | 'cuisson'
  | 'volumes'
  | 'tableau'
  | 'eclairage'
  | 'daaf'
  | 'specialises'
  | 'alignement'
  | 'pose'
  /** La chute de tension d'un circuit trop long pour sa section (voir `chute`). */
  | 'chute';

export interface ElecIssue {
  code: ElecCode;
  roomId?: string;
  fixtureId?: string;
  severity: 'alerte' | 'info';
  /** Ce qui ne va pas, en une phrase, nom de la pièce compris. */
  message: string;
  /** La règle, en une ou deux phrases. */
  regle: string;
  /** Comment le régler, s'il y a un geste évident. */
  fix?: ElecFix;
}

export interface RoomInput {
  id: string;
  name: string;
  kind?: RoomKind | null;
  area: number;
  /** Identifiants des murs qui bordent la pièce. */
  wallIds: string[];
  /** Contour au sol : c'est lui qui dit dans quelle pièce tombe un appareil. */
  outline?: Pt[];
  /** Une plaque, un évier ou un plan de travail y est posé (`equipeeEnCuisine`). */
  equipeeCuisine?: boolean;
}

/**
 * Dans quelle pièce se trouve chaque appareil.
 *
 * Un refend borde DEUX pièces : compter ses appareils pour les deux, c'est
 * offrir un moyen de tricher — poser cinq prises sur l'autre face d'un mur
 * mitoyen rendait le séjour conforme alors que tout était chez le voisin.
 * On regarde donc où l'appareil DONNE : un point pris quinze centimètres
 * devant sa face, et la pièce qui contient ce point. C'est exactement ce que
 * montre le symbole sur le plan.
 */
export function fixturePlacement(
  fixtures: Fixture[],
  walls: WallSeg[],
  rooms: RoomInput[],
): Map<string, string> {
  const quads = wallQuadsOf(walls);
  const byId = new Map(walls.map((w) => [w.id, w]));
  const out = new Map<string, string>();
  for (const f of fixtures) {
    const w = byId.get(f.wallId);
    if (!w) continue;
    const face = wallFace(w, quads.get(w.id), f.side);
    const p = facePoint(face, faceX(face, f.along), 0.15);
    const r = rooms.find(
      (x) => (x.outline?.length ?? 0) >= 3 && pointInPolygon(p, x.outline!),
    );
    if (r) out.set(f.id, r.id);
  }
  return out;
}

/**
 * Tous les constats électriques du logement.
 *
 * Une remarque de vocabulaire, parce qu'elle a son importance : la norme ne
 * fixe **aucun maximum de socles par pièce**. Ce qui est plafonné, c'est le
 * nombre de points par CIRCUIT — douze socles sur un 20 A, six en cuisine. Poser dix prises
 * dans une cuisine n'est donc pas une faute : il faut un deuxième circuit,
 * et l'app le prévoit toute seule. Ce cas ressort en simple information,
 * jamais en alerte.
 */
/**
 * OÙ EN EST CHAQUE PIÈCE — socles posés contre socles exigés.
 *
 * L'anneau du cartouche et le guide de l'établi lisent CE compte-là, et pas
 * un autre : deux comptages du même nombre, à trente centimètres l'un de
 * l'autre sur le même écran, finissent toujours par diverger.
 *
 * DEUX PIÈCES N'Y FIGURENT PAS, et c'est voulu :
 *   — celle dont la norme n'exige aucun socle (dégagement, cellier) : un
 *     anneau vide s'y lirait comme un reproche, alors qu'il n'y a rien à
 *     poser ;
 *   — celle dont on IGNORE l'usage (pas de nom, pas de type). `roomUse`
 *     rend « autre » faute de mieux, et « autre » n'exige presque rien :
 *     une pièce anonyme s'afficherait FINIE avec deux prises, quand la même
 *     nommée « Chambre » en réclame trois. Le relevé passerait, le chantier
 *     non — l'établi connaît ce piège depuis longtemps.
 */
export function avancementDesPieces(
  rooms: { id: string; name: string; kind?: RoomKind | null; wallIds?: string[] }[],
  walls: WallSeg[],
  fixtures: Fixture[],
): Map<string, { nom: string; poses: number; exiges: number; fini: boolean }> {
  const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
  const pose = fixturePlacement(fixtures, walls, inputs);
  const out = new Map<
    string,
    { nom: string; poses: number; exiges: number; fini: boolean }
  >();
  for (const piece of inputs) {
    if (!usageConnu(piece.name, piece.kind)) continue;
    const req = requirementFor(roomUse(piece.name, piece.kind), piece.area);
    if (req.socles === 0) continue;
    // Un socle double compte pour deux : la règle du métier, celle que le
    // contrôle et le devis appliquent déjà (`socketsOf`).
    const poses = fixtures.reduce(
      (n, f) => n + (pose.get(f.id) === piece.id ? socketsOf(f.kind) : 0),
      0,
    );
    out.set(piece.id, {
      nom: piece.name,
      poses,
      exiges: req.socles,
      fini: poses >= req.socles,
    });
  }
  return out;
}

/**
 * CE QUI SE COMPTE SUR TOUT LE LOGEMENT, quand l'écran n'en montre qu'un
 * niveau — revues « Mehdi » et « Nadia » (duplex : « Logement : 1 prise
 * RJ45 sur 2 » à l'étage, quand le logement en avait 4).
 */
export interface LogementEntier {
  tableau: boolean;
  daaf: boolean;
  rj45?: number;
  principales?: number;
  /** Circuits spécialisés possibles : socles 20 A, sorties de câble sans usage. */
  dedies?: number;
  cuisson?: boolean;
}

export function logementEntier(
  rooms: { name?: string; kind?: RoomKind | null }[],
  fixtures: Fixture[],
  ceiling: { kind: string }[],
): LogementEntier {
  return {
    tableau: fixtures.some((f) => f.kind === 'tableau'),
    daaf: ceiling.some((c) => c.kind === 'daaf'),
    rj45: fixtures.reduce((somme, f) => somme + rjOf(f.kind), 0),
    principales: rooms.filter((r) => PRINCIPALE.includes(roomUse(r.name ?? '', r.kind))).length,
    dedies: fixtures.filter((f) => f.kind === 'prise20' || (f.kind === 'sortieCable' && !f.usage)).length,
    cuisson: fixtures.some((f) => f.kind === 'prise32' || (f.kind === 'sortieCable' && f.usage === 'PL')),
  };
}

export function checkElectrical(
  rooms: RoomInput[],
  fixtures: Fixture[],
  roomOfWall: Map<string, string[]>,
  /** Pièce de chaque appareil, quand on la connaît (voir `fixturePlacement`). */
  placement?: Map<string, string>,
  /**
   * Volume de salle d'eau de chaque appareil, quand la pièce en a.
   *
   * C'est le seul contrôle où une erreur est dangereuse plutôt que
   * gênante : une prise à 40 cm d'une baignoire ne se remarque pas sur un
   * plan. L'app le calcule dès qu'une baignoire ou une douche est posée —
   * et se tait franchement quand il n'y en a pas, plutôt que de rassurer.
   */
  volumes?: Map<string, VolumeVerdict>,
  /**
   * Plans de travail longés par chaque mur, s'ils sont connus
   * (`worktopsOnWall`) : au-dessus d'une crédence, la règle de hauteur
   * n'est pas celle d'un mur nu, et la signaler en défaut reviendrait à
   * crier au loup sur toute une cuisine.
   */
  worktops?: Map<string, { x: (f: Fixture) => number; plans: Worktop[]; devant?: Pt }>,
  /** Ce qui est posé au plafond : points lumineux, détection, ventilation. */
  ceiling: CeilingFixture[] = [],
  /**
   * La géométrie, quand l'appelant l'a : elle permet les constats de POSE
   * (face extérieure, appareil dans le vide d'une baie). Sans elle, ces
   * contrôles se taisent — ils ne peuvent pas deviner les murs.
   */
  geometrie?: { walls: WallSeg[]; openings: WallSeg[] },
  /**
   * TOUT LE LOGEMENT, quand l'écran n'en montre qu'un niveau — revue
   * « Mehdi » : à l'étage, « Aucun tableau électrique » (il est au
   * rez-de-chaussée) ; au rez-de-chaussée, « Aucun détecteur de fumée dans
   * le logement » (il est au palier). Ce qui vaut pour le LOGEMENT se
   * cherche dans le logement entier.
   */
  logement?: LogementEntier,
): ElecIssue[] {
  const out: ElecIssue[] = [];
  if (geometrie) {
    out.push(
      ...constatsDePose(geometrie.walls, geometrie.openings, rooms, fixtures),
    );
  }
  const roomOfFixture = (f: Fixture): string | undefined =>
    placement?.get(f.id) ?? roomOfWall.get(f.wallId)?.[0];
  /*
    LES PIÈCES ÉQUIPÉES EN CUISINE — revue « Gérard » : ce que l'appelant
    sait des meubles (`equipeeCuisine`), et la pièce devant chaque plaque ou
    évier relevé au mur (`plansDeTravailParMur`).
  */
  const equipees = new Set(rooms.filter((r) => r.equipeeCuisine).map((r) => r.id));
  for (const e of worktops?.values() ?? []) {
    if (!e.devant) continue;
    const ici = rooms.find((r) => (r.outline?.length ?? 0) >= 3 && pointInPolygon(e.devant!, r.outline!));
    if (ici) equipees.add(ici.id);
  }
  const cuisineIci = (r: RoomInput) => estCuisine(r.name, r.kind, equipees.has(r.id));

  // -------------------------------------------------- hauteurs de pose
  for (const f of fixtures) {
    const surLeMur = worktops?.get(f.wallId);
    const rule = surLeMur
      ? heightRuleAt(f.kind, surLeMur.x(f), surLeMur.plans)
      : HEIGHT_RULES[f.kind];
    if (!rule) continue;
    const spec = FIXTURES[f.kind];
    const cm = Math.round(f.height * 100);
    // La cote proposée doit être valide LÀ OÙ L'APPAREIL EST : au-dessus
    // d'un plan de travail, « remettre à 25 cm » remettrait la prise
    // derrière le meuble.
    const cible = Math.min(
      rule.max ?? spec.std,
      Math.max(rule.min ?? spec.std, spec.std),
    );
    const remise: ElecFix = {
      type: 'hauteur',
      fixtureId: f.id,
      height: cible,
      label: `Remettre à ${Math.round(cible * 100)} cm`,
    };
    if (rule.min !== undefined && f.height < rule.min - 1e-6) {
      out.push({
        roomId: roomOfFixture(f),
        fixtureId: f.id,
        severity: 'alerte',
        code: 'hauteur',
        message: `${spec.label} posée à ${cm} cm : trop bas`,
        regle: rule.regle,
        fix: remise,
      });
    } else if (rule.max !== undefined && f.height > rule.max + 1e-6 && !priseDAppareil(f)) {
      // Une prise d'appareil (hotte à 2 m, micro-ondes en hauteur) se pose
      // où est l'appareil : pas de hauteur maximale (revue « Mehdi »).
      const info = 'maxInfo' in rule && !!rule.maxInfo;
      out.push({
        roomId: roomOfFixture(f),
        fixtureId: f.id,
        severity: info ? 'info' : 'alerte',
        code: 'hauteur',
        message: info
          ? `${spec.label} posée à ${cm} cm : hors de portée d’un fauteuil`
          : `${spec.label} posée à ${cm} cm : trop haut`,
        regle: rule.regle,
        fix: remise,
      });
    }
  }

  // ------------------------------------------------ équipement par pièce
  for (const room of rooms) {
    const use = roomUse(room.name, room.kind);
    const req = exigencesDeLaPiece(use, room.area, use !== 'cuisine' && cuisineIci(room));
    // Un appareil ne compte QUE pour la pièce où il donne.
    const mine = fixtures.filter((f) => roomOfFixture(f) === room.id);
    // Des SOCLES, pas des plaques : un ensemble double en porte un, un
    // triple en porte deux. La prise d'un appareil (hotte, micro-ondes,
    // réfrigérateur) ne compte pas parmi les socles exigés.
    const socles = mine.reduce((somme, f) => somme + (priseDAppareil(f) ? 0 : socketsOf(f.kind)), 0);
    const rj45 = mine.reduce((somme, f) => somme + rjOf(f.kind), 0);
    const label = room.name || USE_LABEL[use];

    if (socles < req.socles) {
      const manque = req.socles - socles;
      out.push({
        code: 'socles',
        roomId: room.id,
        severity: 'alerte',
        message:
          `${label} : ${socles} socle${socles > 1 ? 's' : ''} sur ` +
          `${req.socles} exigé${req.socles > 1 ? 's' : ''} — il en manque ` +
          `${manque}`,
        regle: req.regle,
        fix: {
          type: 'poser',
          kind: 'prise',
          label: manque > 1 ? 'Poser une prise' : 'Poser la prise manquante',
        },
      });
    }
    if (rj45 < req.rj45) {
      out.push({
        roomId: room.id,
        severity: 'alerte',
        code: 'rj45',
        message: `${label} : aucune prise RJ45`,
        regle: req.regle,
        // Le mot tient dans un bouton de téléphone : « Poser une prise
        // RJ45 » sortait tronqué en « Poser une prise R… », ce qui ne dit
        // plus rien du tout. Sur un chantier, on dit « une RJ ».
        fix: { type: 'poser', kind: 'rj45', label: 'Poser RJ45' },
      });
    }
    if (req.surPlan > 0) {
      /*
        AU DROIT D'UN PLAN RELEVÉ, PAS À UNE HAUTEUR — revue « Nadia ». Dès
        qu'un plan de travail de la pièce est connu, seul un socle qui le
        surplombe compte ; sans plan relevé (cuisine vide), la hauteur d'axe
        reste le seul indice, et on le dit.
      */
      const plansIci = worktops
        ? [...worktops.entries()].filter(([w]) => roomOfWall.get(w)?.includes(room.id))
        : [];
      const planConnu = plansIci.length > 0;
      let hauts = 0;
      for (const f of mine) {
        if (priseDAppareil(f) || socketsOf(f.kind) === 0) continue;
        const surLeMur = planConnu ? worktops?.get(f.wallId) : undefined;
        const ou = surLeMur ? socleFaceAuPlan(surLeMur.x(f), f.height, surLeMur.plans) : null;
        if (ou === 'cuisson' || ou === 'evier') {
          out.push({
            code: 'surPlan',
            roomId: room.id,
            fixtureId: f.id,
            severity: 'alerte',
            message: `${label} : socle au-dessus ${ou === 'cuisson' ? 'de la plaque de cuisson' : 'de l’évier'}`,
            regle: 'Aucun socle au-dessus des feux ni de la cuve de l’évier : déplacez-le le long du plan de travail.',
          });
          continue;
        }
        if (planConnu ? ou === 'plan' : f.height >= PLAN_TRAVAIL) hauts += socketsOf(f.kind);
      }
      if (hauts < req.surPlan) {
        out.push({
          code: 'surPlan',
          roomId: room.id,
          severity: 'alerte',
          message:
            `${label} : ${hauts} socle${hauts > 1 ? 's' : ''} au-dessus du ` +
            `plan de travail sur ${req.surPlan}`,
          regle: planConnu
            ? 'Quatre des six socles de la cuisine se posent au-dessus du ' +
              'plan de travail, au droit du plan relevé — jamais au-dessus ' +
              'des feux ni de l’évier.'
            : 'Quatre des six socles de la cuisine se posent au-dessus du ' +
              'plan de travail. Aucun plan n’a été relevé : l’app les ' +
              'reconnaît à leur hauteur d’axe, à partir de 90 cm.',
          fix: {
            type: 'poser',
            kind: 'prise',
            height: 1.1,
            label: 'Poser PC 110',
          },
        });
      } else if (!planConnu && worktops) {
        out.push({
          code: 'surPlan',
          roomId: room.id,
          severity: 'info',
          message: `${label} : plan de travail non relevé`,
          regle:
            'Les socles hauts sont comptés au-dessus du plan de travail, ' +
            'mais aucun plan n’a été relevé : vérifiez sur place qu’ils le ' +
            'surplombent bien, hors feux et évier.',
        });
      }
    }

    // Trop de socles pour un seul circuit : ce n'est pas une faute, c'est
    // un circuit de plus. On le dit, sans crier.
    const maxIci = use === 'cuisine' ? MAX_SOCLES_CUISINE : MAX_SOCLES;
    if (socles > maxIci) {
      out.push({
        code: 'circuits',
        roomId: room.id,
        severity: 'info',
        message:
          `${label} : ${socles} socles, soit ` +
          `${Math.ceil(socles / maxIci)} circuits`,
        regle:
          use === 'cuisine'
            ? `Le circuit des prises de la cuisine porte ${MAX_SOCLES_CUISINE} socles au maximum. ` +
              `Au-delà, il en faut un second — la liste du matériel le prévoit déjà.`
            : `Un circuit de prises 16 A en 2,5 mm² protégé par un disjoncteur ` +
              `20 A porte ${MAX_SOCLES} socles au maximum. Au-delà, il en faut ` +
              `un second — la liste du matériel le prévoit déjà.`,
      });
    }

    // Une prise de cuisson ailleurs qu'en cuisine mérite une question.
    const cuisson = mine.filter((f) => f.kind === 'prise32').length;
    if (cuisson > 0 && !cuisineIci(room)) {
      out.push({
        roomId: room.id,
        severity: 'alerte',
        code: 'cuisson',
        message: `${label} : socle 32 A hors cuisine`,
        regle:
          'Le socle 32 A alimente la plaque de cuisson, sur un circuit ' +
          'dédié en 6 mm². Ailleurs, c’est probablement une erreur de type.',
      });
    }
    // Seulement quand l'appareil sanitaire n'est pas relevé : sinon les
    // volumes SONT vérifiés plus bas, et les deux phrases se contredisaient
    // (revue « Nadia »).
    if (use === 'sdb' && mine.some((f) => porteSocle(f.kind)) && !(volumes && volumes.size > 0)) {
      out.push({
        roomId: room.id,
        severity: 'info',
        code: 'volumes',
        message: `${label} : vérifier les volumes`,
        regle:
          'Aucun socle dans les volumes 0, 1 et 2 (baignoire, douche). ' +
          'Ces volumes se mesurent depuis l’appareil sanitaire, que l’app ' +
          'ne connaît pas : la vérification reste manuelle.',
      });
    }
  }

  /**
   * LES TROIS CIRCUITS SPÉCIALISÉS — le point qui fait recaler au Consuel.
   *
   * La norme demande, en plus de la cuisson, TROIS circuits dédiés en
   * 2,5 mm² sous 20 A : lave-linge, lave-vaisselle, four. Chacun part du
   * tableau et ne dessert qu'un appareil. C'est un oubli classé : on
   * compte ses prises, on n'oublie pas la plaque, et on livre un logement
   * où le four et le lave-vaisselle partagent le circuit des prises.
   *
   * L'app les reconnaît à leur nature — socle 20 A ou sortie de câble —
   * où qu'ils soient : le lave-linge est souvent en salle d'eau, pas en
   * cuisine. Et elle ne dit rien tant qu'aucune cuisine n'est nommée :
   * sans cuisine, il n'y a pas de logement à recevoir.
   */
  const cuisines = rooms.filter(cuisineIci);
  if (cuisines.length > 0) {
    /*
      Une sortie de câble ne compte que si elle peut servir de spécialisé :
      celle d'un sèche-serviettes, d'une climatisation ou d'une plaque, non
      (revue « Mehdi » : un lave-vaisselle, un sèche-serviettes et une
      climatisation faisaient « 3/3 »).
    */
    const dedies =
      logement?.dedies ??
      fixtures.filter((f) => f.kind === 'prise20' || (f.kind === 'sortieCable' && !f.usage)).length;
    if (dedies < 3) {
      out.push({
        code: 'specialises',
        roomId: cuisines[0].id,
        severity: 'alerte',
        message: `Logement : ${dedies} circuit${
          dedies > 1 ? 's' : ''
        } spécialisé${dedies > 1 ? 's' : ''} sur 3`,
        regle:
          'Trois circuits spécialisés au minimum, en 2,5 mm² sous 20 A : ' +
          'lave-linge, lave-vaisselle, four. Chacun ne dessert que son ' +
          'appareil, et s’ajoute au circuit de cuisson en 6 mm². Posez un ' +
          'socle 20 A ou une sortie de câble pour chacun.',
        fix: {
          type: 'poser',
          kind: 'prise20',
          label: 'Poser une 20 A',
        },
      });
    }
    /*
      LA CUISSON — revues « Gérard » et « Thomas » : une cuisine dont la
      plaque avait été relevée sortait sans circuit de cuisson, ni au
      tableau, ni au devis. Seul le cas inverse (« 32 A hors cuisine ») se
      contrôlait. Un socle 32 A, ou une sortie de câble « PL », suffit.
    */
    const cuisson =
      logement?.cuisson ?? fixtures.some((f) => f.kind === 'prise32' || (f.kind === 'sortieCable' && f.usage === 'PL'));
    if (!cuisson) {
      out.push({
        code: 'cuisson',
        roomId: cuisines[0].id,
        severity: 'alerte',
        message: 'Logement : aucun circuit de cuisson 32 A',
        regle:
          'La cuisine reçoit un circuit dédié à la cuisson, en 6 mm² sous ' +
          '32 A : un socle 32 A, ou une sortie de câble pour la plaque.',
        fix: {
          type: 'poser',
          kind: 'prise32',
          label: 'Poser une 32 A',
        },
      });
    }
  }

  /**
   * L'ALIGNEMENT — ce qui distingue une pose soignée d'une pose rapide.
   *
   * Deux prises sur le même mur à vingt-cinq et vingt-huit centimètres :
   * la norme s'en moque, le client non. C'est ce qu'on voit en entrant
   * dans une pièce finie, et ça ne se rattrape plus une fois les boîtes
   * scellées.
   *
   * On ne signale QUE le presque-aligné : de un à douze centimètres
   * d'écart, entre appareils de même famille, sur le même mur. En dessous
   * d'un centimètre c'est aligné ; au-delà de douze c'est voulu — une
   * prise à vingt-cinq et son interrupteur à cent dix ne se comparent pas.
   */
  const parMur = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const l = parMur.get(f.wallId) ?? [];
    l.push(f);
    parMur.set(f.wallId, l);
  }
  for (const lot of parMur.values()) {
    for (let i = 0; i < lot.length; i++) {
      for (let j = i + 1; j < lot.length; j++) {
        const a = lot[i];
        const b = lot[j];
        if (FIXTURES[a.kind].family !== FIXTURES[b.kind].family) continue;
        // Réunis sous une même plaque, ils ne s'alignent pas : ils se
        // superposent, et c'est le modèle qui les place.
        if (a.group && a.group === b.group) continue;
        const ecart = Math.abs(a.height - b.height);
        if (ecart <= 0.01 || ecart > 0.12) continue;
        const piece = rooms.find((r) => r.id === roomOfFixture(a));
        out.push({
          code: 'alignement',
          roomId: piece?.id,
          fixtureId: b.id,
          severity: 'info',
          message:
            `${piece?.name ?? 'Mur'} : ${FIXTURES[a.kind].label} à ` +
            `${Math.round(a.height * 100)} cm et ` +
            `${Math.round(b.height * 100)} cm sur le même mur`,
          regle:
            'Deux appareils de même nature, sur un même mur, se posent à la ' +
            'MÊME hauteur d’axe. Trois centimètres d’écart ne se voient pas ' +
            'sur un plan et se voient sur le mur fini.',
          fix: {
            type: 'hauteur',
            fixtureId: b.id,
            height: a.height,
            label: `Aligner à ${Math.round(a.height * 100)} cm`,
          },
        });
        // Un seul constat par mur : la liste se lit, elle ne s'endure pas.
        break;
      }
    }
  }

  // ------------------------------------------------------ vue d'ensemble
  const principales =
    logement?.principales ?? rooms.filter((r) => PRINCIPALE.includes(roomUse(r.name, r.kind))).length;
  const rj45Total = logement?.rj45 ?? fixtures.reduce((somme, f) => somme + rjOf(f.kind), 0);
  const rj45Min = Math.max(2, principales);
  if (principales > 0 && rj45Total < rj45Min) {
    out.push({
      code: 'rj45',
      severity: 'alerte',
      message: `Logement : ${rj45Total} prise${
        rj45Total > 1 ? 's' : ''
      } RJ45 sur ${rj45Min}`,
      regle:
        'Une prise de communication au minimum par pièce principale, et ' +
        'jamais moins de deux dans le logement.',
    });
  }
  /**
   * Le tableau n'est pas un appareil de plus : c'est l'ORIGINE.
   *
   * Sans lui, pas de métré de câble, pas de plan des gaines, pas de tableau
   * de tirage — la moitié du document manque, et l'app ne le disait qu'en
   * passant. Le constat monte donc en alerte dès qu'il y a de quoi tirer un
   * circuit, et il propose de le poser.
   */
  const tableaux = fixtures.filter((f) => f.kind === 'tableau');
  const unTableau = tableaux.length > 0 || !!logement?.tableau;
  if (fixtures.length > 0 && !unTableau) {
    out.push({
      code: 'tableau',
      severity: 'alerte',
      message: 'Aucun tableau électrique : rien à raccorder',
      regle:
        'Le tableau se place dans la gaine technique du logement (GTL), ses ' +
        'manettes entre 0,90 m et 1,80 m du sol. Sans lui, ni métré de ' +
        'câble ni plan des gaines.',
      fix: { type: 'poser', kind: 'tableau', label: 'Poser tableau' },
    });
  }
  /**
   * LE PARAFOUDRE FIGURE AUX CONSTATS — sans trancher.
   *
   * Un dossier réel le mentionne toujours ; l'app, elle, ne peut pas le
   * décider : il dépend de la zone kéraunique de la commune et du mode de
   * branchement. Se taire ressemblerait à « rien à signaler », ce qui
   * serait rassurer à tort — on dit donc la règle, en info.
   */
  if (tableaux.length === 1) {
    out.push({
      code: 'tableau',
      severity: 'info',
      message: 'Parafoudre : non évalué, à vérifier',
      regle:
        'Obligatoire notamment en zone d’exposition à la foudre (AQ2) ou ' +
        'sur une alimentation aérienne : à vérifier selon la commune et le ' +
        'branchement. Il se pose en tête de tableau, au plus près de l’AGCP.',
    });
  }
  // Deux tableaux dans un logement, c'est une erreur de saisie neuf fois
  // sur dix — et une installation à revoir la dixième.
  if (tableaux.length > 1) {
    out.push({
      code: 'tableau',
      severity: 'alerte',
      message: `${tableaux.length} tableaux placés`,
      regle:
        'Un logement n’a qu’un tableau de répartition. Un second coffret ' +
        'est un tableau divisionnaire : il se raccorde en aval, pas en tête.',
    });
  }
  // En salle d'eau, c'est interdit — et c'est le genre d'erreur qui passe
  // inaperçue sur un plan tant que personne ne regarde la pièce.
  for (const t of tableaux) {
    const piece = rooms.find((r) => r.id === roomOfFixture(t));
    if (!piece) continue;
    const usage = roomUse(piece.name, piece.kind);
    if (usage !== 'sdb' && usage !== 'wc') continue;
    out.push({
      code: 'tableau',
      roomId: piece.id,
      fixtureId: t.id,
      severity: 'alerte',
      message: `Tableau en ${USE_LABEL[usage].toLowerCase()} : interdit`,
      regle:
        'Aucun tableau ni boîte de connexion dans les volumes d’une salle ' +
        'd’eau. Il se place dans un local sec, en dégagement.',
    });
  }

  // ----------------------------------------------- volumes de salle d'eau
  if (volumes && volumes.size > 0) {
    for (const f of fixtures) {
      const v = volumes.get(f.id);
      if (!v) continue;
      const spec = FIXTURES[f.kind];
      out.push({
        code: 'volumes',
        roomId: roomOfFixture(f),
        fixtureId: f.id,
        severity: v.allowed ? 'info' : 'alerte',
        message: v.allowed
          ? `${spec.label} en volume ${v.volume} : matériel imposé`
          : `${spec.label} en volume ${v.volume} : interdit`,
        regle: v.regle,
      });
    }
  }
  // Une salle d'eau appelle deux obligations que le plan ne montre pas, et
  // qu'on ne peut donc que rappeler.
  for (const r of rooms) {
    const usage = roomUse(r.name, r.kind);
    if (usage !== 'sdb') continue;
    out.push({
      code: 'volumes',
      roomId: r.id,
      severity: 'info',
      message: `${r.name || 'Salle d’eau'} : liaison équipotentielle`,
      regle:
        'Liaison équipotentielle supplémentaire reliant les canalisations ' +
        'métalliques et les masses, et protection 30 mA sur tous les ' +
        'circuits de la pièce.',
    });
  }

  /**
   * UN POINT LUMINEUX PAR PIÈCE — mais seulement si on parle du plafond.
   *
   * La norme exige un point d'éclairage commandé dans chaque pièce
   * principale, et un détecteur de fumée par logement. L'app le vérifie
   * désormais... à une condition : que le plafond ait COMMENCÉ à être
   * équipé.
   *
   * Sans cette réserve, tout scan d'avant cette fonction sortirait avec une
   * alerte par pièce et une de plus pour le détecteur — pour une
   * information que personne n'a saisie. C'est la même règle que pour les
   * volumes de salle d'eau : sans mobilier, l'app ne peut rien affirmer, et
   * se taire vaut mieux que crier au loup.
   */
  for (const room of ceiling.length > 0 ? rooms : []) {
    const use = roomUse(room.name, room.kind);
    if (use === 'autre') continue;
    const label = room.name || USE_LABEL[use];
    const points = ceiling.filter(
      (cl) => cl.roomId === room.id && CEILINGS[cl.kind].watts > 0,
    );
    const appliques = fixtures.filter(
      (f) => f.kind === 'applique' && roomOfFixture(f) === room.id,
    );
    if (points.length + appliques.length === 0) {
      out.push({
        code: 'eclairage',
        roomId: room.id,
        severity: 'alerte',
        message: `${label} : aucun point lumineux`,
        regle:
          'Un point d’éclairage commandé au minimum par pièce, en plafond ' +
          'ou en applique. Une pièce sans éclairage fixe n’est pas ' +
          'réceptionnable.',
        fix: { type: 'plafond', kind: 'dcl', label: 'Poser le DCL' },
      });
      continue;
    }
    // Un point posé mais que rien n'allume : la moitié du travail.
    const commandes = fixtures.filter(
      (f) =>
        roomOfFixture(f) === room.id && COMMANDES_MURALES.includes(f.kind),
    );
    const relies = points.some((p) => (p.commands ?? []).length > 0);
    if (points.length > 0 && !relies && commandes.length === 0) {
      out.push({
        code: 'eclairage',
        roomId: room.id,
        severity: 'info',
        message: `${label} : point lumineux sans commande`,
        regle:
          'Un point d’éclairage se commande depuis l’accès de la pièce. ' +
          'Posez un interrupteur, puis reliez-le au point.',
      });
    }
  }

  /**
   * LE DÉTECTEUR DE FUMÉE.
   *
   * Obligatoire, un par logement au minimum, dans la circulation qui
   * dessert les chambres — et jamais en cuisine ni en salle d'eau, où les
   * vapeurs le déclenchent pour rien. Un détecteur qu'on débranche parce
   * qu'il hurle en faisant cuire des pâtes ne protège plus personne.
   */
  const daaf = ceiling.filter((cl) => cl.kind === 'daaf');
  const unDaaf = daaf.length > 0 || !!logement?.daaf;
  if (ceiling.length > 0 && !unDaaf) {
    out.push({
      code: 'daaf',
      severity: 'alerte',
      message: 'Aucun détecteur de fumée dans le logement',
      regle:
        'Un DAAF au minimum par logement, dans la circulation qui dessert ' +
        'les chambres. Obligation du propriétaire depuis 2015.',
      fix: { type: 'plafond', kind: 'daaf', label: 'Poser le DAAF' },
    });
  }
  for (const d of daaf) {
    const room = rooms.find((r) => r.id === d.roomId);
    if (!room) continue;
    const use = roomUse(room.name, room.kind);
    if (use !== 'cuisine' && use !== 'sdb') continue;
    out.push({
      code: 'daaf',
      roomId: room.id,
      severity: 'alerte',
      message: `${room.name || USE_LABEL[use]} : détecteur de fumée mal placé`,
      regle:
        'Jamais en cuisine ni en salle d’eau : la vapeur et les fumées de ' +
        'cuisson le déclenchent, et un détecteur débranché ne protège plus ' +
        'personne.',
    });
  }

  // Les alertes d'abord : c'est ce qui rend l'installation non conforme.
  return out.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'alerte' ? -1 : 1,
  );
}

/**
 * Prépare les pièces telles que les contrôles les attendent : leur surface
 * vient du contour calculé, leurs murs de la liste que porte la pièce.
 */
export function roomInputsOf(
  rooms: { id: string; name: string; kind?: RoomKind | null; wallIds?: string[] }[],
  parts: {
    roomId: string;
    surface: { area: number; pts: Pt[] } | null;
    walls: { id: string }[];
  }[],
  /** Les meubles, quand on les a : ils disent quelle pièce est équipée en cuisine. */
  objects?: readonly { category?: string; transform: number[] }[],
): RoomInput[] {
  return rooms.map((r) => {
    const part = parts.find((p) => p.roomId === r.id);
    const outline = part?.surface?.pts;
    return {
      id: r.id,
      name: r.name,
      kind: r.kind ?? null,
      area: part?.surface?.area ?? 0,
      wallIds: r.wallIds ?? part?.walls.map((w) => w.id) ?? [],
      outline,
      ...(objects && equipeeEnCuisine(outline, objects) ? { equipeeCuisine: true } : {}),
    };
  });
}

/**
 * De quel mur relève quelle pièce. Un refend borde DEUX pièces : la liste
 * en porte donc deux, et un appareil posé dessus compte pour la première —
 * celle de sa face, faute de mieux.
 */
/**
 * LES CONSTATS DE POSE — un appareil qui ne peut pas être là.
 *
 * Vus à l'œil sur une feuille rendue : un tableau et un va-et-vient
 * dessinés DEHORS (la face choisie regardait l'extérieur d'un mur
 * d'enveloppe), et une applique dans l'emprise d'une porte. Ces données
 * peuvent exister — mauvaise face dans l'établi, baie percée après la
 * pose — et rien ne le disait. Deux contrôles géométriques :
 *
 * - la FACE : le point du symbole, décalé du côté `side`, doit tomber dans
 *   une pièce. S'il tombe dehors quand l'autre face donne sur une pièce,
 *   on le dit — en info : un appareil extérieur existe (étanche, IP 44),
 *   mais neuf fois sur dix c'est la face qui est à reprendre.
 * - la BAIE : un appareil dont l'axe tombe dans le vide d'une porte ou
 *   d'une fenêtre — à une hauteur SANS maçonnerie — est impossible, en
 *   alerte. Au-dessus du linteau ou sur le trumeau, rien à dire.
 */
export function constatsDePose(
  walls: WallSeg[],
  openings: WallSeg[],
  rooms: RoomInput[],
  fixtures: Fixture[],
): ElecIssue[] {
  const out: ElecIssue[] = [];
  const parId = new Map(walls.map((w) => [w.id, w]));
  const dansUnePiece = (q: Pt) =>
    rooms.some(
      (r) => r.outline && r.outline.length > 2 && pointInPolygon(q, r.outline),
    );
  for (const f of fixtures) {
    const w = parId.get(f.wallId);
    if (!w) continue;
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const t = Math.min(1, Math.max(0, f.along / len));
    const p = { x: w.a.x + dx * t, z: w.a.z + dz * t };
    const n = { x: -dz / len, z: dx / len };
    const nom = FIXTURES[f.kind].label;
    // Quinze centimètres du nu : dans la pièce si la face est la bonne,
    // franchement dehors sinon.
    const ECART = 0.15;
    const devant = {
      x: p.x + n.x * ECART * f.side,
      z: p.z + n.z * ECART * f.side,
    };
    const derriere = {
      x: p.x - n.x * ECART * f.side,
      z: p.z - n.z * ECART * f.side,
    };
    if (!dansUnePiece(devant) && dansUnePiece(derriere)) {
      out.push({
        code: 'pose',
        fixtureId: f.id,
        severity: 'info',
        message: `${nom} : posé sur la face extérieure du mur`,
        regle:
          'La face choisie regarde dehors. Un appareil extérieur existe — ' +
          'étanche, IP 44 — mais le plus souvent c’est la face qui est à ' +
          'reprendre dans l’établi du mur.',
      });
    }
    const base = w.yCenter - w.height / 2;
    for (const o of openings) {
      // La baie de CE mur : sur sa ligne, dans son emprise.
      const ecart = Math.abs((o.a.x - w.a.x) * n.x + (o.a.z - w.a.z) * n.z);
      if (ecart > 0.25) continue;
      const ma = ((o.a.x - w.a.x) * dx + (o.a.z - w.a.z) * dz) / len;
      const mb = ((o.b.x - w.a.x) * dx + (o.b.z - w.a.z) * dz) / len;
      const m0 = Math.min(ma, mb);
      const m1 = Math.max(ma, mb);
      if (f.along < m0 + 0.02 || f.along > m1 - 0.02) continue;
      const y0 = o.yCenter - o.height / 2 - base;
      const y1 = y0 + o.height;
      if (f.height > y0 + 0.02 && f.height < y1 - 0.02) {
        out.push({
          code: 'pose',
          fixtureId: f.id,
          severity: 'alerte',
          message: `${nom} : posé dans le vide d’une baie`,
          regle:
            'L’axe tombe dans l’emprise d’une porte ou d’une fenêtre, à ' +
            'une hauteur où il n’y a pas de maçonnerie. Décalez-le sur le ' +
            'mur plein à côté de la baie, ou au-dessus d’elle.',
        });
        break;
      }
      /*
        ET LE COFFRE DE VOLET, juste au-dessus — la zone où l'on ne perce
        pas. Le scan ne le voit pas ; une fois déclaré, il vaut consigne :
        derrière la trappe il y a la coulisse, le tablier enroulé et le
        tube. Une sortie de câble percée là, c'est le tablier bloqué au
        premier usage — et le percement se voit depuis la rue.
      */
      if (o.coffre && f.height > y1 - 0.02 && f.height < y1 + o.coffre + 0.02) {
        out.push({
          code: 'pose',
          fixtureId: f.id,
          severity: 'alerte',
          message: `${nom} : posé dans le coffre de volet`,
          regle:
            'Le coffre abrite la coulisse, le tablier enroulé et son tube : ' +
            'on n’y perce pas. Descendez l’appareil sous le haut de la ' +
            'fenêtre, ou décalez-le sur le mur plein à côté — le moteur, ' +
            'lui, s’alimente depuis ' +
            'le coffre par une sortie de câble placée à son aplomb.',
        });
        break;
      }
    }
  }
  return out;
}

export function wallToRooms(rooms: RoomInput[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rooms) {
    for (const id of r.wallIds) {
      const list = out.get(id) ?? [];
      list.push(r.id);
      out.set(id, list);
    }
  }
  return out;
}

/** Pièces qui portent au moins une alerte : ce sont elles qu'on montre. */
export function roomsInAlert(issues: ElecIssue[]): Set<string> {
  return new Set(
    issues
      .filter((i) => i.severity === 'alerte' && i.roomId)
      .map((i) => i.roomId as string),
  );
}

// -------------------------------------------------------------- circuits

/**
 * Socles maximum sur un circuit de prises 16 A en 2,5 mm² sous 20 A : DOUZE.
 *
 * Revue « Mehdi », confirmée par le patron : l'app en comptait huit, la
 * limite du 1,5 mm² sous 16 A. Depuis l'amendement A5, le 2,5 mm² sous
 * 20 A en porte douze — huit faisait poser des circuits et des disjoncteurs
 * en trop.
 */
export const MAX_SOCLES = 12;
/** Socles maximum sur le circuit des prises de la CUISINE : six. */
export const MAX_SOCLES_CUISINE = 6;
/** Sorties de câble regroupées sur un même circuit commun. */
const MAX_SORTIES = 8;
/** Points maximum sur un circuit d'éclairage (1,5 mm², 16 A). */
export const MAX_LUMIERE = 8;
/** Circuits maximum derrière un même interrupteur différentiel. */
export const MAX_PAR_DIFF = 8;

export type CircuitNature =
  | 'prises'
  | 'eclairage'
  | 'specialise'
  | 'cuisson'
  | 'sortie'
  | 'vdi';

export interface Circuit {
  id: string;
  label: string;
  nature: CircuitNature;
  /** Nombre de points portés par le circuit. */
  points: number;
  /** Section des conducteurs (mm²). Nulle pour les courants faibles. */
  section: number | null;
  /** Calibre du disjoncteur (A). Nul pour les courants faibles. */
  breaker: number | null;
  rooms: string[];
  fixtureIds: string[];
  /**
   * Les appareils de PLAFOND portés par ce circuit.
   *
   * Un point lumineux n'est pas un appareil mural : il n'a ni face, ni
   * hauteur, ni abscisse le long d'un mur. Il appartient pourtant à un
   * circuit d'éclairage, il compte dans ses huit points, et il faut lui
   * tirer du fil. Sans cette liste, on posait huit spots au plafond et le
   * tableau annonçait « 0 point » — le dossier se contredisait d'une
   * feuille à l'autre.
   */
  ceilingIds?: string[];
  /**
   * UN VA-ET-VIENT, D'APRÈS LES LIENS TRACÉS — un point lumineux commandé par
   * deux interrupteurs au moins (l'interrupteur général ne compte pas : il
   * coupe, il ne commande pas). Absent quand aucun lien n'est tracé : on s'en
   * tient alors au nombre de commandes du circuit. Voir `estVaEtVient`.
   */
  vaEtVient?: boolean;
  note?: string;
  /**
   * Métré de câble (m), quand la géométrie est connue : c'est la seule
   * ligne du devis qu'on ne pouvait pas déduire du relevé, et celle qu'un
   * électricien estime encore au pas dans le couloir.
   */
  cable?: number;
}

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * Remplit des circuits à la CHARGE et non au nombre d'appareils : un
 * ensemble triple pèse deux socles, il ne doit pas voyager en huitième
 * position d'un circuit déjà plein.
 */
function chunkByLoad(
  list: Fixture[],
  max: number,
  poids: (f: Fixture) => number,
): Fixture[][] {
  const out: Fixture[][] = [];
  let lot: Fixture[] = [];
  let charge = 0;
  for (const f of list) {
    const p = Math.max(1, poids(f));
    if (lot.length > 0 && charge + p > max) {
      out.push(lot);
      lot = [];
      charge = 0;
    }
    lot.push(f);
    charge += p;
  }
  if (lot.length > 0) out.push(lot);
  return out;
}

/**
 * Répartit l'appareillage en circuits et propose la protection de chacun.
 *
 * Les règles appliquées :
 * - un circuit **dédié** par socle 32 A (cuisson) : 6 mm², 32 A ;
 * - un circuit **dédié** par socle 20 A (four, lave-linge, lave-vaisselle…) :
 *   2,5 mm², 20 A ;
 * - les socles 16 A par paquets de huit : 2,5 mm², 20 A, **la cuisine à
 *   part** — ses circuits ne se mélangent pas à ceux des autres pièces ;
 * - l'éclairage par paquets de huit : 1,5 mm², 16 A ;
 * - les sorties de câble par paquets de huit : 2,5 mm², 20 A, à revoir selon
 *   la puissance réellement raccordée ;
 * - les courants faibles ne sont pas protégés par un disjoncteur : ils
 *   rejoignent le coffret de communication.
 */
export function planCircuits(
  fixtures: Fixture[],
  roomNameOf: (f: Fixture) => string,
  isKitchen: (f: Fixture) => boolean,
  /**
   * Identifiant de la pièce, quand on l'a.
   *
   * Sans lui, deux « Chambre » d'un T4 ne comptent que pour une : le
   * regroupement se faisait sur le NOM, et un plan avec deux pièces
   * homonymes — le cas courant tant qu'on ne les a pas renommées —
   * produisait un tableau faux. On dédoublonne donc sur l'identité, et on
   * numérote les homonymes à l'affichage.
   */
  roomIdOf?: (f: Fixture) => string | undefined,
  /** Les appareils de plafond, avec la pièce qui les porte. */
  ceiling: CeilingFixture[] = [],
): Circuit[] {
  const out: Circuit[] = [];
  let n = 0;
  const add = (c: Omit<Circuit, 'id'>) => {
    n += 1;
    out.push({ ...c, id: `c${n}` });
  };
  // Deux pièces homonymes reçoivent un numéro, dans l'ordre où elles
  // apparaissent : « Chambre », « Chambre 2 ».
  const suffixe = new Map<string, string>();
  if (roomIdOf) {
    const vus = new Map<string, string[]>();
    for (const f of fixtures) {
      const id = roomIdOf(f);
      if (!id) continue;
      const nom = roomNameOf(f);
      const liste = vus.get(nom) ?? [];
      if (!liste.includes(id)) liste.push(id);
      vus.set(nom, liste);
    }
    for (const [nom, ids] of vus) {
      ids.forEach((id, i) => suffixe.set(id, i === 0 ? nom : `${nom} ${i + 1}`));
    }
  }
  const nomDe = (f: Fixture) => {
    const id = roomIdOf?.(f);
    return (id && suffixe.get(id)) || roomNameOf(f);
  };
  const roomsOf = (list: Fixture[]) => {
    const out2: string[] = [];
    const vus = new Set<string>();
    for (const f of list) {
      const cle = roomIdOf?.(f) ?? roomNameOf(f);
      if (vus.has(cle)) continue;
      vus.add(cle);
      out2.push(nomDe(f));
    }
    return out2;
  };

  for (const f of fixtures.filter((x) => x.kind === 'prise32')) {
    add({
      label: `Cuisson — ${nomDe(f)}`,
      nature: 'cuisson',
      points: 1,
      section: 6,
      breaker: 32,
      rooms: [nomDe(f)],
      fixtureIds: [f.id],
      note: 'Circuit dédié à la plaque de cuisson.',
    });
  }
  // L'appareil qu'il alimente, quand le sigle le dit (« Lave-vaisselle »).
  const appareilDe = (f: Fixture) => USAGES.find((u) => u.sigle === f.usage)?.label;
  for (const f of fixtures.filter((x) => x.kind === 'prise20')) {
    add({
      label: `${appareilDe(f) ?? 'Spécialisé 20 A'} — ${nomDe(f)}`,
      nature: 'specialise',
      points: 1,
      section: 2.5,
      breaker: 20,
      rooms: [nomDe(f)],
      fixtureIds: [f.id],
      note: 'Circuit dédié : four, lave-linge, lave-vaisselle ou sèche-linge.',
    });
  }

  const socles = fixtures.filter((f) => socketsOf(f.kind) > 0);
  const cuisine = socles.filter(isKitchen);
  const ailleurs = socles.filter((f) => !isKitchen(f));
  chunkByLoad(cuisine, MAX_SOCLES_CUISINE, (f) => socketsOf(f.kind)).forEach((lot, i) =>
    add({
      label: `Prises cuisine ${i + 1}`,
      nature: 'prises',
      points: lot.reduce((somme, f) => somme + socketsOf(f.kind), 0),
      section: 2.5,
      breaker: 20,
      rooms: roomsOf(lot),
      fixtureIds: lot.map((f) => f.id),
      note: 'Les prises de cuisine ne partagent pas leur circuit : six socles au plus.',
    }),
  );
  chunkByLoad(ailleurs, MAX_SOCLES, (f) => socketsOf(f.kind)).forEach((lot, i) =>
    add({
      label: `Prises ${i + 1}`,
      nature: 'prises',
      points: lot.reduce((somme, f) => somme + socketsOf(f.kind), 0),
      section: 2.5,
      breaker: 20,
      rooms: roomsOf(lot),
      fixtureIds: lot.map((f) => f.id),
    }),
  );

  /**
   * Éclairage : les points lumineux ET leurs commandes.
   *
   * La norme compte les POINTS (huit au maximum par circuit) ; un
   * interrupteur n'en est pas un. Mais il est bien câblé sur ce circuit-là,
   * et il faut donc lui tirer du fil : le laisser hors de tout circuit, ce
   * que faisait la première version, revenait à ne jamais compter le câble
   * des commandes — et à ne dessiner aucune gaine jusqu'à elles.
   */
  const commandes = fixtures.filter((f) => COMMANDES_MURALES.includes(f.kind));
  const lumieres = fixtures.filter((f) => f.kind === 'applique');
  /**
   * LES POINTS DU PLAFOND COMPTENT AUSSI.
   *
   * La norme limite un circuit d'éclairage à huit POINTS. Un point de
   * centre, un spot, une applique de plafond en sont ; un détecteur de
   * fumée ou une bouche de VMC, non — le premier a sa propre pile, la
   * seconde ne consomme rien.
   */
  const plafonniers = ceiling.filter((c) => CEILINGS[c.kind].watts > 0);
  /*
    UNE COMMANDE ET SES POINTS NE SE SÉPARENT JAMAIS — revue « Karim » : les
    commandes et les points se répartissaient chacun de leur côté, puis
    s'appariaient par rang. Un circuit portait dix points, et l'interrupteur
    de la cuisine partait sur C8 quand le plafonnier qu'il allume était sur
    C9 — un câblage impossible, imprimé tel quel.

    On forme donc des GROUPES : chaque commande avec tout ce qu'elle allume
    (les liens), de proche en proche — un va-et-vient réunit ses deux
    interrupteurs et leurs points. Ce qui n'est relié à rien se groupe par
    pièce. Les groupes remplissent les circuits dans l'ordre, huit points au
    plus ; un groupe de plus de huit points (douze spots sur un même
    interrupteur) se coupe en circuits de huit, la commande avec le premier.
    L'interrupteur général ne groupe rien : il coupe tout, au contacteur.
  */
  const general = commandes.filter((f) => f.kind === 'interGeneral');
  type Element = { id: string; mural?: Fixture; haut?: CeilingFixture; piece: string; point: boolean };
  const elements: Element[] = [
    ...commandes.filter((f) => f.kind !== 'interGeneral').map((f) => ({ id: f.id, mural: f, piece: nomDe(f), point: false })),
    ...lumieres.map((f) => ({ id: f.id, mural: f, piece: nomDe(f), point: true })),
    ...plafonniers.map((h) => ({ id: h.id, haut: h, piece: suffixe.get(h.roomId) ?? '', point: true })),
  ];
  const parent = new Map(elements.map((e) => [e.id, e.id]));
  const racine = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(id, r);
    return r;
  };
  const unir = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = racine(a);
    const rb = racine(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const e of elements) {
    const liens = e.haut?.commands ?? e.mural?.commands ?? [];
    for (const cid of liens) unir(e.id, cid);
  }
  // Ce qui n'est relié à rien reste avec sa pièce.
  const seulParPiece = new Map<string, string>();
  for (const e of elements) {
    const lie = elements.some((x) => x !== e && racine(x.id) === racine(e.id));
    if (lie) continue;
    const ancre = seulParPiece.get(e.piece);
    if (ancre) unir(ancre, e.id);
    else seulParPiece.set(e.piece, e.id);
  }
  const groupes: Element[][] = [];
  const indexDu = new Map<string, number>();
  for (const e of elements) {
    const r = racine(e.id);
    if (!indexDu.has(r)) {
      indexDu.set(r, groupes.length);
      groupes.push([]);
    }
    groupes[indexDu.get(r)!].push(e);
  }
  // Les circuits : des groupes entiers, huit points au plus.
  const lotsEclairage: Element[][] = [];
  let courant: Element[] = [];
  const pointsDe = (l: Element[]) => l.filter((e) => e.point).length;
  for (const g of groupes) {
    if (pointsDe(g) > MAX_LUMIERE) {
      if (courant.length > 0) lotsEclairage.push(courant);
      courant = [];
      const pts = g.filter((e) => e.point);
      const cmds = g.filter((e) => !e.point);
      for (let k = 0; k < pts.length; k += MAX_LUMIERE) {
        lotsEclairage.push([...(k === 0 ? cmds : []), ...pts.slice(k, k + MAX_LUMIERE)]);
      }
      continue;
    }
    if (pointsDe(courant) + pointsDe(g) > MAX_LUMIERE && courant.length > 0) {
      lotsEclairage.push(courant);
      courant = [];
    }
    courant.push(...g);
  }
  if (courant.length > 0) lotsEclairage.push(courant);
  if (lotsEclairage.length === 0 && general.length > 0) lotsEclairage.push([]);
  if (lotsEclairage.length > 0) {
    const lotsMuraux = lotsEclairage.map((l, i) => [
      ...(i === 0 ? general : []),
      ...l.filter((e) => e.mural).map((e) => e.mural!),
    ]);
    const lotsPlafond = lotsEclairage.map((l) => l.filter((e) => e.haut).map((e) => e.haut!));
    const nbCircuits = lotsEclairage.length;
    for (let i = 0; i < nbCircuits; i++) {
      const lot = lotsMuraux[i] ?? [];
      const hauts = lotsPlafond[i] ?? [];
      if (lot.length === 0 && hauts.length === 0) continue;
      const points =
        lot.filter((f) => f.kind === 'applique').length + hauts.length;
      // Les pièces desservies : celles des commandes ET celles du plafond.
      const pieces = [...roomsOf(lot)];
      for (const h of hauts) {
        const nom = suffixe.get(h.roomId);
        if (nom && !pieces.includes(nom)) pieces.push(nom);
      }
      /*
        LE VA-ET-VIENT SE LIT SUR LES LIENS — revue « Mehdi » : dès qu'un
        circuit d'éclairage portait deux commandes, il passait en va-et-vient
        (193 m de navette pour 4 va-et-vient réels sur 17 commandes), et
        l'interrupteur général en ajoutait une à chaque point.
      */
      const commandeurs = (p: { id: string; commands?: string[] }) =>
        new Set(
          (p.commands ?? []).filter((cid) => {
            if (cid === p.id) return false;
            const k = fixtures.find((x) => x.id === cid)?.kind;
            // Un poussoir commande un télérupteur : pas de navette (revue « Nadia »).
            return !!k && COMMANDES_MURALES.includes(k) && k !== 'interGeneral' && k !== 'poussoir';
          }),
        ).size;
      const pointsIci: { id: string; commands?: string[] }[] = [
        ...lot.filter((f) => f.kind === 'applique'),
        ...hauts,
      ];
      const lies = pointsIci.some((p) => (p.commands ?? []).length > 0);
      const vaDeclare = lot.some((f) => f.kind === 'va');
      /*
        SANS LIEN, PAS DE NAVETTE INVENTÉE — revue « Nadia » : un circuit
        d'éclairage sans aucun lien tracé passait en va-et-vient dès qu'il
        portait deux interrupteurs (des pièces différentes) ; le devis
        achetait des navettes pour rien. Seul un « va » posé le dit.
      */
      const vaEtVient = lies || vaDeclare ? vaDeclare || pointsIci.some((p) => commandeurs(p) >= 2) : false;
      add({
        label: `Éclairage ${i + 1}`,
        nature: 'eclairage',
        ...(vaEtVient !== undefined ? { vaEtVient } : {}),
        points,
        section: 1.5,
        breaker: 16,
        rooms: pieces,
        fixtureIds: lot.map((f) => f.id),
        ceilingIds: hauts.map((h) => h.id),
        note:
          points === 0
            ? 'Commandes seules : les points lumineux ne sont pas encore posés.'
            : fixtures.some((f) => f.kind === 'interGeneral')
              ? 'Coupé par l’interrupteur général, au contacteur du tableau.'
              : undefined,
      });
    }
  }

  /*
    LE SIGLE DÉCIDE DU CIRCUIT — revue « Mehdi » : la plaque (PL), le
    chauffe-eau (CU) et la borne de recharge (VE) partaient tous sur un seul
    « Sorties de câble » en 20 A / 2,5 mm², plaque comprise. Chacun a son
    circuit dédié, à sa section ; le reste (sèche-serviettes,
    climatisation, sortie sans sigle) garde le circuit commun.
  */
  const DEDIEES: Record<string, Omit<Circuit, 'id' | 'rooms' | 'fixtureIds' | 'points' | 'label'> & { nom: string }> = {
    PL: { nom: 'Cuisson', nature: 'cuisson', section: 6, breaker: 32, note: 'Circuit dédié à la plaque de cuisson.' },
    CU: {
      nom: 'Chauffe-eau',
      nature: 'specialise',
      section: 2.5,
      breaker: 20,
      note: 'Circuit dédié, commandé par un contacteur heures creuses.',
    },
    VE: {
      nom: 'Borne de recharge',
      nature: 'specialise',
      section: 10,
      breaker: 40,
      note: 'Circuit dédié (7,4 kW), différentiel 30 mA type A ou F ; section à vérifier selon la longueur.',
    },
  };
  for (const f of fixtures.filter((x) => x.kind === 'sortieCable' && !!x.usage && !!DEDIEES[x.usage])) {
    const { nom, ...reste } = DEDIEES[f.usage!];
    add({ ...reste, label: `${nom} — ${nomDe(f)}`, points: 1, rooms: [nomDe(f)], fixtureIds: [f.id] });
  }
  const sorties = fixtures.filter((f) => f.kind === 'sortieCable' && !(f.usage && DEDIEES[f.usage]));
  chunk(sorties, MAX_SORTIES).forEach((lot, i) =>
    add({
      label: `Sorties de câble ${i + 1}`,
      nature: 'sortie',
      points: lot.length,
      section: 2.5,
      breaker: 20,
      rooms: roomsOf(lot),
      fixtureIds: lot.map((f) => f.id),
      note: 'À revoir selon la puissance raccordée (chauffage, sèche-serviettes).',
    }),
  );

  // Le vidéophone aussi : il se raccorde au coffret, sans disjoncteur à lui.
  const estVdi = (k: FixtureKind) => k === 'rj45' || k === 'tv' || k === 'videophone';
  const vdi = fixtures.filter((f) => postsOf(f.kind).some(estVdi));
  if (vdi.length > 0) {
    add({
      label: 'Courants faibles',
      nature: 'vdi',
      points: vdi.reduce(
        (somme, f) =>
          somme + postsOf(f.kind).filter(estVdi).length,
        0,
      ),
      section: null,
      breaker: null,
      rooms: roomsOf(vdi),
      fixtureIds: vdi.map((f) => f.id),
      note: 'Raccordés au coffret de communication, sans disjoncteur.',
    });
  }
  return out;
}

/** Un interrupteur différentiel et les circuits qu'il protège. */
export interface Differential {
  label: string;
  type: 'A' | 'AC';
  rating: number;
  circuits: string[];
  /**
   * LES CIRCUITS PAR LEUR IDENTIFIANT — revue « Nicolas » : trois
   * « Spécialisé 20 A — Cuisine » portent le même libellé, et le tableau
   * projeté posait trois fois le premier, et les deux autres hors de tout
   * différentiel. Absents des listes d'avant : on retombe sur les libellés.
   */
  circuitIds?: string[];
}

/** Les circuits d'un différentiel, chacun une seule fois (voir `circuitIds`). */
export function circuitsDuDifferentiel(d: Differential, circuits: Circuit[]): Circuit[] {
  if (d.circuitIds) {
    const parId = new Map(circuits.map((c) => [c.id, c]));
    return d.circuitIds.map((id) => parId.get(id)).filter((c): c is Circuit => !!c);
  }
  const pris = new Set<string>();
  const out: Circuit[] = [];
  for (const l of d.circuits) {
    const c = circuits.find((x) => x.label === l && !pris.has(x.id));
    if (!c) continue;
    pris.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * Répartit les circuits derrière les interrupteurs différentiels 30 mA.
 *
 * Un différentiel de type **A** est exigé pour la cuisson et le lave-linge —
 * leurs courants de défaut peuvent comporter une composante continue que le
 * type AC ne voit pas. Les autres circuits vont derrière des type AC, huit
 * au maximum par appareil.
 */
/**
 * LES INTERRUPTEURS DIFFÉRENTIELS, À LA SURFACE DU LOGEMENT — revue
 * « Mehdi », confirmée par le patron. La norme en fixe le nombre minimal
 * selon la surface :
 *   - jusqu'à 35 m² : un 25 A type AC et un 40 A type A ;
 *   - de 35 à 100 m² : deux 40 A type AC et un 40 A type A ;
 *   - au-delà de 100 m² : trois 40 A type AC et un 40 A type A.
 * Sans surface connue, on s'en tient au nombre de circuits (huit au plus
 * derrière chacun). Les circuits se RÉPARTISSENT entre les AC, au lieu de
 * remplir le premier.
 *
 * LE TYPE AC RESTE ADMIS — question soulevée par deux revues (« Gérard »,
 * « Marc ») : l'édition 2024 de la NF C 15-100 l'aurait-elle supprimé ? Le
 * patron, électricien, l'a confirmé : non, il reste admis pour les circuits
 * qui n'exigent pas de type A. Ne pas le « corriger » sans nouvel avis.
 */
export function minimumAC(surface: number | undefined): { nombre: number; calibre: number } {
  if (surface === undefined || !(surface > 0)) return { nombre: 1, calibre: 40 };
  if (surface <= 35) return { nombre: 1, calibre: 25 };
  if (surface <= 100) return { nombre: 2, calibre: 40 };
  return { nombre: 3, calibre: 40 };
}

export function planDifferentials(circuits: Circuit[], surface?: number): Differential[] {
  const proteges = circuits.filter((c) => c.nature !== 'vdi');
  if (proteges.length === 0) return [];
  const typeA = proteges.filter(
    (c) => c.nature === 'cuisson' || c.nature === 'specialise',
  );
  const reste = proteges.filter((c) => !typeA.includes(c));
  const out: Differential[] = [];
  chunk(typeA, MAX_PAR_DIFF).forEach((lot, i) =>
    out.push({
      label: `Différentiel type A ${i + 1}`,
      type: 'A',
      rating: 40,
      circuits: lot.map((c) => c.label),
      circuitIds: lot.map((c) => c.id),
    }),
  );
  if (reste.length > 0) {
    const mini = minimumAC(surface);
    const nombre = Math.max(surface !== undefined ? mini.nombre : 1, Math.ceil(reste.length / MAX_PAR_DIFF));
    // Réparti à tour de rôle : un circuit sur chaque différentiel, puis on recommence.
    const lots: Circuit[][] = Array.from({ length: nombre }, () => []);
    reste.forEach((c, i) => lots[i % nombre].push(c));
    lots
      .filter((lot) => lot.length > 0)
      .forEach((lot, i) =>
        out.push({
          label: `Différentiel type AC ${i + 1}`,
          type: 'AC',
          rating: mini.calibre,
          circuits: lot.map((c) => c.label),
          circuitIds: lot.map((c) => c.id),
        }),
      );
  }
  // Un logement sans circuit spécialisé n'aurait aucun type A : la norme en
  // impose un de toute façon.
  if (!out.some((d) => d.type === 'A')) {
    out.unshift({
      label: 'Différentiel type A 1',
      type: 'A',
      rating: 40,
      circuits: [],
      circuitIds: [],
    });
  }
  return out;
}

// -------------------------------------------------------- liste matériel

export interface MaterialRow {
  label: string;
  quantity: number;
}

export interface RoomMaterial {
  room: string;
  use: string;
  area: number;
  rows: MaterialRow[];
}

export interface MaterialList {
  rooms: RoomMaterial[];
  circuits: Circuit[];
  differentials: Differential[];
  /** Matériel de tableau, hors appareillage des pièces. */
  board: MaterialRow[];
  issues: ElecIssue[];
}

/**
 * La liste du matériel, prête à chiffrer.
 *
 * Le tableau est déduit des circuits : un disjoncteur par circuit, à son
 * calibre, plus les différentiels, plus le coffret de communication s'il y a
 * des courants faibles.
 */
export function materialList(
  rooms: RoomInput[],
  fixtures: Fixture[],
  roomOfWall: Map<string, string[]>,
  placement?: Map<string, string>,
  /** Métré de câble par circuit, calculé sur le plan (`cableRuns`). */
  cable?: Map<string, number>,
  /**
   * Ce qui est posé AU PLAFOND.
   *
   * Sans lui, la liste du matériel ignorait les points lumineux, les
   * détecteurs et les bouches de VMC : on les dessinait sur le plan, et
   * personne ne les commandait. Un dossier qui montre huit spots et n'en
   * fait acheter aucun est pire qu'un dossier qui n'en parle pas.
   */
  ceiling?: CeilingFixture[],
): MaterialList {
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const firstRoom = (f: Fixture) => {
    const pose = placement?.get(f.id);
    if (pose) return roomById.get(pose);
    const ids = roomOfWall.get(f.wallId) ?? [];
    return ids.map((id) => roomById.get(id)).find((r) => !!r);
  };
  const nameOf = (f: Fixture) => firstRoom(f)?.name || 'Hors pièce';
  const isKitchen = (f: Fixture) => priseDeCuisine(f, firstRoom(f));

  const byRoom: RoomMaterial[] = rooms.map((r) => {
    const mine = fixtures.filter((f) => firstRoom(f)?.id === r.id);
    const counts = new Map<FixtureKind, number>();
    for (const f of mine) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    // Le plafond compte comme le reste : c'est du matériel à poser dans
    // cette pièce, et à acheter avec.
    const auPlafond = new Map<CeilingKind, number>();
    for (const cl of ceiling ?? []) {
      if (cl.roomId !== r.id) continue;
      auPlafond.set(cl.kind, (auPlafond.get(cl.kind) ?? 0) + 1);
    }
    return {
      room: r.name || USE_LABEL[roomUse(r.name, r.kind)],
      use: USE_LABEL[roomUse(r.name, r.kind)],
      area: r.area,
      rows: [
        ...[...counts.entries()].map(([kind, quantity]) => ({
          label: FIXTURES[kind].label,
          quantity,
        })),
        ...[...auPlafond.entries()].map(([kind, quantity]) => ({
          label: CEILINGS[kind].label,
          quantity,
        })),
      ],
    };
  });

  const circuits = planCircuits(
    fixtures,
    nameOf,
    isKitchen,
    (f) => firstRoom(f)?.id,
    ceiling,
  );
  // La surface du logement fixe le nombre de différentiels.
  const differentials = planDifferentials(
    circuits,
    rooms.reduce((s, r) => s + (r.area > 0 ? r.area : 0), 0) || undefined,
  );

  const breakers = new Map<number, number>();
  for (const c of circuits) {
    if (c.breaker === null) continue;
    breakers.set(c.breaker, (breakers.get(c.breaker) ?? 0) + 1);
  }
  const board: MaterialRow[] = [...breakers.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([amp, quantity]) => ({
      label: `Disjoncteur ${amp} A`,
      quantity,
    }));
  const diffA = differentials.filter((d) => d.type === 'A').length;
  const diffAC = differentials.filter((d) => d.type === 'AC').length;
  if (diffA > 0) {
    board.push({ label: 'Interrupteur différentiel 40 A 30 mA type A', quantity: diffA });
  }
  if (diffAC > 0) {
    board.push({
      label: 'Interrupteur différentiel 40 A 30 mA type AC',
      quantity: diffAC,
    });
  }
  if (circuits.some((c) => c.nature === 'vdi')) {
    board.push({ label: 'Coffret de communication', quantity: 1 });
  }
  // Le métré rejoint son circuit : le PDF n'a plus qu'à le lire.
  const avecCable = cable
    ? circuits.map((c) => ({ ...c, cable: cable.get(c.id) }))
    : circuits;

  // Le total de câble : mesuré SUR LE PLAN quand on connaît la géométrie,
  // estimé à 12 m par point sinon. La nuance est dite au lecteur — un devis
  // ne se signe pas sur un forfait qu'on aurait pris pour un métré.
  const mesure = avecCable.reduce((t, c) => t + (c.cable ?? 0), 0);
  const metres = mesure > 0
    ? Math.ceil(mesure)
    : circuits.reduce((t, c) => t + (c.section === null ? 0 : c.points * 12), 0);
  if (metres > 0) {
    board.push({
      label:
        mesure > 0
          ? `Câble — ${metres} m au total, mesurés sur le plan (hors chutes)`
          : `Câble — environ ${metres} m au total (12 m par point, à ajuster)`,
      // Zéro = « pas une quantité » : la ligne est un total en mètres, pas
      // un article, et le « 1 » qui s'affichait à côté ne comptait rien.
      quantity: 0,
    });
  }

  return {
    rooms: byRoom,
    circuits: avecCable,
    differentials,
    board,
    issues: checkElectrical(rooms, fixtures, roomOfWall, placement),
  };
}
