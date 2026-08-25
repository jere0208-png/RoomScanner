/**
 * L'ÉLEC POSÉE PENDANT LE SCAN — du point visé à l'appareil du plan.
 *
 * Relevé du chantier : « pendant un scan, permet d'ajouter manuellement des
 * PC, inter, point lumineux. Le scan crée aussi un plafond, où l'on peut
 * placer aussi les points lumineux plafond. Ça permettrait lors d'un devis
 * de quantifier les éléments et leur placement — on mémorise l'emplacement
 * avec un viseur au centre. »
 *
 * C'est le bon moment pour le faire : on est DEVANT le mur, on voit la
 * boîte existante, on sait où passera la nouvelle. Viser au centre de
 * l'écran vaut mieux que replacer de mémoire, une heure plus tard, sur un
 * plan.
 *
 * Le natif ne rend que des ANCRES : un point du monde et le type visé —
 * c'est tout ce qu'un raycast sait dire. Tout le métier est ici : rattacher
 * chaque ancre à son mur ou au plafond de sa pièce, et en faire ce que le
 * plan sait déjà dessiner, compter et facturer.
 */
import { FIXTURES, faceX, interiorSide, wallFace } from './electrical';
import type { Fixture, FixtureKind } from './electrical';
import { pointInPolygon } from './appearance';
import { segLength, wallQuads, type Pt, type WallSeg } from './floorplan';
import type { CeilingFixture, CeilingKind } from './ceiling';

/*
  ON POSE À LA COTE DU MÉTIER, PAS À LA HAUTEUR DU DOIGT.

  Relevé du patron : « si l'utilisateur vise le bas d'un mur, on cible bien
  l'endroit du mur, mais on place la prise directement à 25 cm ; si
  l'utilisateur vise le milieu du mur, 110 cm (prise crédence par exemple).
  Pareil pour les lumières, on met automatiquement 1 m 90. »

  C'est la différence entre un relevé et un PLAN D'EXÉCUTION. Personne ne
  pose une prise à 23,7 cm : on pose à 25, et c'est ce qui se percera. Un
  viseur tenu à bout de bras dans une pièce vide donne le centimètre près —
  autant dire un chiffre faux, qu'il faudrait corriger un par un à la table.

  LA COTE VISÉE CHOISIT LE PALIER, elle ne le remplace pas. Viser le bas
  d'un mur veut dire « plinthe » ; viser à mi-hauteur veut dire « au-dessus
  du plan de travail ». C'est l'INTENTION qu'on lit dans le geste.
*/

/** Les cotes usuelles d'un type, du sol vers le haut, avec leur nom. */
const PALIERS: Partial<Record<FixtureKind, { h: number; mot: string }[]>> = {
  prise: [
    { h: 0.25, mot: 'Prise plinthe' },
    { h: 1.1, mot: 'Prise plan de travail' },
  ],
  prise2: [
    { h: 0.25, mot: 'Prise double plinthe' },
    { h: 1.1, mot: 'Prise double plan de travail' },
  ],
  rj45: [
    { h: 0.25, mot: 'RJ45 plinthe' },
    { h: 1.1, mot: 'RJ45 en hauteur' },
  ],
  tv: [
    { h: 0.25, mot: 'Prise TV plinthe' },
    // L'attente derrière un téléviseur mural : la cote se relève sur place,
    // mais 1,10 m est le point de départ de tout le monde.
    { h: 1.1, mot: 'Prise TV murale' },
  ],
};

/**
 * La cote la plus proche parmi celles proposées.
 *
 * Exportée parce que la frontière compte autant que les paliers : à
 * mi-chemin entre 25 cm et 1,10 m, il faut savoir de quel côté l'on bascule,
 * et ça se vérifie.
 */
export function palierProche(paliers: number[], vise: number): number {
  let best = paliers[0];
  for (const p of paliers) {
    if (Math.abs(p - vise) < Math.abs(best - vise)) best = p;
  }
  return best;
}

/**
 * AU-DELÀ DE CETTE DISTANCE, ON NE DEVINE PLUS.
 *
 * Une prise visée à deux mètres n'est ni une plinthe ni une crédence : c'est
 * une attente de téléviseur, ou une erreur de visée. Dans les deux cas, la
 * ramener de force à 1,10 m effacerait ce que l'électricien a vu de ses
 * yeux. Quarante-cinq centimètres : la moitié de l'écart entre les deux
 * paliers d'une prise, moins une marge.
 */
const PORTEE_PALIER = 0.45;

/**
 * La hauteur à laquelle on pose vraiment, et le mot qui l'explique.
 *
 * `mot` est `null` quand on n'a rien aimanté : il n'y a alors rien à
 * annoncer, et un message qui dit « posé où vous avez visé » est un message
 * qu'on apprend à ignorer.
 */
export function aimanterHauteur(
  kind: FixtureKind,
  vise: number,
): { hauteur: number; mot: string | null } {
  const paliers = PALIERS[kind];
  if (!paliers) {
    /*
      UN APPAREIL À COTE UNIQUE Y VA TOUJOURS.

      Un interrupteur se pose à 1,10 m, une applique à 1,90 m, un tableau à
      1,35 m — viser haut ou bas ne change pas ce qu'on va poser. La fiche
      de l'appareil porte déjà cette cote (`std`), et c'est la même que
      celle du catalogue et du dossier imprimé.
    */
    const spec = FIXTURES[kind];
    if (!spec) return { hauteur: vise, mot: null };
    return {
      hauteur: spec.std,
      mot: `${spec.label} placé${finFeminine(spec.label)} à ${enCm(spec.std)}`,
    };
  }
  const h = palierProche(
    paliers.map((p) => p.h),
    vise,
  );
  if (Math.abs(h - vise) > PORTEE_PALIER) return { hauteur: vise, mot: null };
  const nom = paliers.find((p) => p.h === h)!.mot;
  return { hauteur: h, mot: `${nom} placée à ${enCm(h)}` };
}

/** « 25 cm », « 1,10 m » — comme on le dit sur un chantier. */
function enCm(h: number): string {
  return h < 1
    ? `${Math.round(h * 100)} cm`
    : `${h.toFixed(2).replace('.', ',')} m`;
}

/**
 * Le « e » de « placée », quand le mot qui précède est féminin.
 *
 * Deux libellés sur trois sont des noms masculins (« Interrupteur »,
 * « Tableau électrique ») : accorder au petit bonheur donnerait « Tableau
 * électrique placée », qu'on lit une fois et qui décrédibilise tout le
 * reste. On regarde donc le premier mot du libellé.
 */
function finFeminine(label: string): string {
  return /^(prise|applique|boîte|sortie)/i.test(label) ? 'e' : '';
}

/**
 * L'ÉCART SOUS LEQUEL UN DÉCALAGE EST UN TREMBLEMENT.
 *
 * Trente centimètres : au-delà, deux points de plafond ne sont plus mal
 * alignés, ils sont posés en quinconce — et c'est un placement voulu, qu'on
 * n'a pas à redresser.
 */
const ECART_AXE = 0.3;

/**
 * OÙ SE POSE VRAIMENT UN POINT DE PLAFOND.
 *
 * Relevé du patron : « si on vise le plafond pour mettre un point lumineux,
 * on le centre à la largeur déjà calculée par le scan, et si c'est la même
 * pièce, l'ajout d'un point s'axe automatiquement au premier ».
 *
 * C'est la règle du métier : un point de centre est AU CENTRE. Personne ne
 * pose un DCL à quarante centimètres de l'axe parce que le téléphone
 * tremblait ; et deux points d'une même pièce se posent sur un axe, pas en
 * diagonale. Le scan connaît le contour — il sait où est le centre, et où
 * passe l'axe du premier point.
 *
 * @param vise    Le point du sol sous la visée.
 * @param contour Le contour de la pièce, ou `null` hors de toute pièce.
 * @param deja    Les points déjà posés dans CETTE pièce.
 */
export function aimanterPlafond(
  vise: Pt,
  contour: Pt[] | null,
  deja: Pt[],
): { at: Pt; mot: string | null } {
  /*
    DEUX POINTS FONT UNE LIGNE, PAS UN NUAGE.

    Le second se pose sur l'axe du premier — même abscisse s'il est
    au-dessus ou au-dessous, même ordonnée s'il est à côté. On ne le
    DÉPLACE pas le long de cet axe : sa distance au premier est ce que
    l'électricien a voulu, c'est son alignement qui tremblait.
  */
  if (deja.length > 0) {
    let proche = deja[0];
    for (const p of deja) {
      if (
        Math.hypot(p.x - vise.x, p.z - vise.z) <
        Math.hypot(proche.x - vise.x, proche.z - vise.z)
      ) {
        proche = p;
      }
    }
    const dx = Math.abs(vise.x - proche.x);
    const dz = Math.abs(vise.z - proche.z);
    if (dx <= ECART_AXE && dx <= dz) {
      return { at: { x: proche.x, z: vise.z }, mot: 'Point aligné sur le premier' };
    }
    if (dz <= ECART_AXE && dz < dx) {
      return { at: { x: vise.x, z: proche.z }, mot: 'Point aligné sur le premier' };
    }
    return { at: vise, mot: null };
  }

  // Hors de tout contour, il n'y a pas de centre à trouver.
  if (!contour || contour.length < 3) return { at: vise, mot: null };
  const xs = contour.map((p) => p.x);
  const zs = contour.map((p) => p.z);
  const at = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
  return { at, mot: 'Point centré dans la pièce' };
}

/**
 * Ce que le viseur mémorise.
 *
 * D'ABORD LE MUR VISÉ, quand le natif a su le nommer : un identifiant ne se
 * déplace pas. Relevé du chantier : « ça a bien pris en compte mais rien ne
 * s'affiche sur le plan 2D ensuite » — les ancres n'étaient que des points
 * du monde ARKit, or le modèle livré passe par `RoomBuilder`, et par
 * `StructureBuilder` dès qu'il y a plusieurs passages : ces
 * post-traitements RECALENT la géométrie dans leur propre repère. Les
 * points, restés dans l'ancien, tombaient à des mètres de tout mur, et se
 * faisaient jeter — silencieusement.
 *
 * Le point du monde reste en secours : si le mur a été redécoupé par la
 * fusion, son identifiant ne répond plus, et la position reprend la main.
 */
export interface AncreElec {
  /** Type d'appareil visé — mural (`prise`, `inter`…) ou de plafond. */
  kind: string;
  /** Identifiant de la surface visée, tel que RoomPlan l'a donné. */
  wallId?: string;
  /** Cote relevée sur ce mur, depuis son extrémité `a` (m). */
  along?: number;
  /** Hauteur relevée au-dessus du sol de ce mur (m). */
  height?: number;
  x: number;
  y: number;
  z: number;
}

/**
 * À quelle distance d'un mur une ancre lui appartient encore.
 *
 * Un raycast tombe sur la surface vue par la caméra, qui est le NU du mur —
 * mais le mur du modèle est un axe, à une demi-épaisseur de là, et la main
 * ne vise pas au centimètre. Trente-cinq centimètres laissent la place à
 * tout cela sans jamais attraper le mur d'en face : le plus étroit des
 * couloirs fait quatre-vingts.
 */
const PORTEE_MUR = 0.35;

/**
 * Sous le plafond, on ne pose plus sur un mur.
 *
 * Un point lumineux visé au plafond tombe au milieu de la pièce, loin de
 * tout mur — mais une applique visée haut, elle, reste contre son mur. La
 * hauteur seule ne suffit donc pas : c'est la CONJONCTION d'une hauteur et
 * d'un éloignement des murs qui fait un point de plafond.
 */
const SOUS_PLAFOND = 0.35;

/** Les appareils qui vivent au plafond, et non sur un mur. */
const AU_PLAFOND: CeilingKind[] = [
  'dcl',
  'spot',
  'daaf',
  'vmc',
  'ventilateur',
  'camera',
  'detecteur',
];

const estDuPlafond = (kind: string): kind is CeilingKind =>
  (AU_PLAFOND as string[]).includes(kind);

/**
 * CE QU'EST UNE « LUMIÈRE » QUAND ELLE TOMBE SUR UN MUR.
 *
 * Relevé du patron : « lors d'un scan, "lum" n'ajoute pas de lumière sur le
 * mur, alors que l'élément se place bien sur le scan, mais rien sur le
 * plan ». Les deux moitiés étaient vraies : le natif enregistrait la pose,
 * et c'est l'ancrage qui la jetait en silence.
 *
 * Le bouton du viseur pose un `dcl` — un point lumineux de PLAFOND, avec sa
 * croix normalisée. Visé sur une cloison à hauteur d'applique, il n'était ni
 * assez haut ni assez loin des murs pour aller au plafond ; on cherchait
 * alors `FIXTURES['dcl']`, qui n'existe pas — un dcl n'est pas un appareil
 * mural — et l'on sortait sans rien poser.
 *
 * Ce qui manquait n'est pas un garde-fou, c'est une TRADUCTION. Sur un
 * chantier, un point lumineux au mur porte un nom : c'est une applique. Le
 * bouton dit « Lumière », et c'est à l'application de savoir laquelle selon
 * l'endroit visé — au plafond un DCL, au mur une applique. L'électricien ne
 * choisit pas entre deux boutons ce que sa main a déjà dit en visant.
 */
const AU_MUR: Record<string, FixtureKind> = { dcl: 'applique' };
export const natureAuMur = (kind: string): FixtureKind =>
  (AU_MUR[kind] ?? kind) as FixtureKind;

/**
 * Rattache les points visés au plan : appareils muraux d'un côté, points
 * de plafond de l'autre.
 *
 * Ce qui ne tombe ni sur un mur ni dans une pièce est JETÉ. On vise en
 * marchant, la caméra passe par des fenêtres et des couloirs ; poser au
 * hasard ce qu'on n'a pas su rattacher salirait le plan et le métré, et
 * l'électricien ne saurait pas d'où sort la prise en trop.
 */
export function ancrerElec(
  ancres: AncreElec[],
  walls: WallSeg[],
  rooms: { id: string; outline?: Pt[] }[],
  /** Fabrique un identifiant : le magasin a le sien. */
  id: (prefixe: string, n: number) => string = (p, n) =>
    `${p}-vis-${n}-${Math.random().toString(36).slice(2, 6)}`,
): { fixtures: Fixture[]; ceiling: CeilingFixture[]; mots: string[] } {
  const quads = wallQuads(walls);
  const fixtures: Fixture[] = [];
  const ceiling: CeilingFixture[] = [];
  /*
    CE QU'ON A POSÉ À LA PLACE DE CE QUI ÉTAIT VISÉ.

    Relevé du patron : « un message doit apparaître sans gêner : "Prise
    plinthe placée à 25 cm" ». Il ne se déduit pas après coup — seul cet
    endroit sait qu'une cote a été RAMENÉE à un palier, et lequel.
  */
  const mots: string[] = [];
  /** La pièce qui contient ce point au sol. */
  const pieceDe = (p: Pt) =>
    rooms.find((r) => (r.outline?.length ?? 0) >= 3 && pointInPolygon(p, r.outline!));

  ancres.forEach((a, n) => {
    /*
      LE MUR NOMMÉ D'ABORD. Le natif l'a identifié au moment de la pose,
      dans le repère où il travaillait : c'est la seule information qu'un
      recalage du modèle ne peut pas fausser.
    */
    const nomme = a.wallId ? walls.find((w) => w.id === a.wallId) : undefined;
    if (nomme && a.along !== undefined && a.height !== undefined) {
      const l = segLength(nomme) || 1;
      const side = interiorSide(nomme, walls, rooms as never);
      // Une « Lumière » posée sur un mur est une applique : voir `AU_MUR`.
      const kind = natureAuMur(a.kind);
      if (FIXTURES[kind]) {
        // La cote du métier, pas celle du doigt : voir `aimanterHauteur`.
        const pose = aimanterHauteur(kind, a.height);
        if (pose.mot) mots.push(pose.mot);
        fixtures.push({
          id: id(kind, n),
          kind,
          wallId: nomme.id,
          // Bornées au mur : un relevé de travers ne sort pas du pan.
          along: Math.max(0.02, Math.min(l - 0.02, a.along)),
          height: Math.max(0.05, Math.min(nomme.height - 0.05, pose.hauteur)),
          side,
        });
        return;
      }
    }

    const sol = { x: a.x, z: a.z };
    /*
      LE MUR LE PLUS PROCHE, et sa distance — mesurée à l'AXE, comme le
      modèle. On ne retient que ceux dont la projection tombe DANS le
      segment : sinon un mur lointain, mais bien orienté, attraperait un
      point posé au-delà de son extrémité.
    */
    let best: { w: WallSeg; dist: number; along: number } | null = null;
    for (const w of walls) {
      if (w.type !== 'wall') continue;
      const l = segLength(w) || 1;
      const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
      const t = (sol.x - w.a.x) * u.x + (sol.z - w.a.z) * u.z;
      if (t < -0.05 || t > l + 0.05) continue;
      const proj = { x: w.a.x + u.x * t, z: w.a.z + u.z * t };
      const dist = Math.hypot(sol.x - proj.x, sol.z - proj.z);
      if (!best || dist < best.dist) {
        best = { w, dist, along: Math.max(0, Math.min(l, t)) };
      }
    }

    const piece = pieceDe(sol);
    const hauteurPiece = best?.w.height ?? walls[0]?.height ?? 2.5;
    const enHaut = a.y >= hauteurPiece - SOUS_PLAFOND;
    const loinDesMurs = !best || best.dist > PORTEE_MUR;

    /*
      AU PLAFOND : soit l'appareil n'y va que là (un détecteur de fumée),
      soit on l'a visé haut ET loin des murs — c'est alors le plafond qu'on
      regardait, pas la cloison.
    */
    if (estDuPlafond(a.kind) && (loinDesMurs || enHaut) && piece) {
      /*
        AU CENTRE, OU SUR L'AXE DU PREMIER — voir `aimanterPlafond`.

        On ne regarde que les points DÉJÀ POSÉS DANS CETTE PIÈCE : un point
        du séjour n'a pas à aligner celui de la cuisine, et deux pièces
        voisines ont chacune leur axe.
      */
      const voisins = ceiling
        .filter((c) => c.roomId === piece.id)
        .map((c) => c.at);
      const pose = aimanterPlafond(
        { x: a.x, z: a.z },
        piece.outline ?? null,
        voisins,
      );
      if (pose.mot) mots.push(pose.mot);
      ceiling.push({
        id: id(a.kind, n),
        kind: a.kind,
        roomId: piece.id,
        at: pose.at,
      });
      return;
    }

    if (!best || best.dist > PORTEE_MUR) return;
    const kind = natureAuMur(a.kind);
    if (!FIXTURES[kind]) return;
    /*
      LA FACE QUI REGARDE LA PIÈCE. Le raycast donne un point, pas un côté :
      on prend la face intérieure du mur, celle que l'électricien voit — et
      pour un refend, celle de la pièce où l'on se tient.
    */
    const side = interiorSide(best.w, walls, rooms as never);
    const face = wallFace(best.w, quads.get(best.w.id), side);
    // L'abscisse de la face, et non celle de l'axe : c'est dans ce repère
    // que l'établi et les cotes travaillent.
    const surFace = faceX(face, best.along);
    // La cote du métier, pas celle du doigt : voir `aimanterHauteur`.
    const pose = aimanterHauteur(kind, a.y);
    if (pose.mot) mots.push(pose.mot);
    fixtures.push({
      id: id(kind, n),
      kind,
      wallId: best.w.id,
      along: best.along,
      // La hauteur retenue, bornée au mur : un raycast qui traverse une
      // baie peut revenir au-dessus du linteau.
      height: Math.max(0.05, Math.min(best.w.height - 0.05, pose.hauteur)),
      side,
    });
    // `surFace` ne sert qu'à vérifier que la pose tient sur la face ; un
    // point visé au ras d'un angle se recale sur le premier centimètre.
    if (surFace < 0 || surFace > face.len) {
      fixtures[fixtures.length - 1].along = Math.max(
        0.02,
        Math.min(segLength(best.w) - 0.02, best.along),
      );
    }
  });

  /*
    UN SEUL MESSAGE, PAS UNE PILE.

    Une session de scan pose dix appareils : dix bandeaux qui s'empilent ne
    « gênent » pas moins qu'un seul qui reste. On garde le DERNIER — celui
    qui vient d'être posé, le seul que l'électricien regarde — et les
    doublons disparaissent d'eux-mêmes.
  */
  return { fixtures, ceiling, mots: [...new Set(mots)] };
}
