/**
 * LA SURFACE HABITABLE DU LOGEMENT — le chiffre qu'on demande pour vendre
 * ou pour louer.
 *
 * Relevé du patron, point 2 de la réflexion « grand public » : la fiche
 * d'une pièce savait dire sa surface habitable sous un rampant, mais le
 * logement entier n'avait que sa surface au sol. Or c'est la surface
 * habitable (loi Carrez pour une vente en copropriété, loi Boutin pour une
 * location) qu'on écrit dans une annonce.
 *
 * Pièce par pièce, ce qui ne compte pas :
 *   — ce qui n'est pas un logement : garage, cave, cellier, local
 *     technique, balcon, terrasse, loggia, véranda, combles non aménagés ;
 *   — sous 1,80 m de hauteur : la part d'un rampant relevée au LiDAR, ou la
 *     pièce entière quand ses murs sont plus bas.
 *
 * Une ESTIMATION tirée du relevé, pas un mesurage certifié : l'écran et les
 * documents le disent.
 */
import type { RoomPart } from './floorplan';
import { hauteurDeLaPiece } from './floorplan';
import type { PlafondDeLaPiece } from './fichePiece';
import { HAUTEUR_HABITABLE } from './fichePiece';

type PtSol = { x: number; z: number };

/** Le rectangle au sol d'un meuble, d'après sa transformation. */
function empriseDe(m: { transform: number[]; width: number; depth: number }): PtSol[] {
  const t = m.transform;
  const lx = Math.hypot(t[0], t[2]) || 1;
  const lz = Math.hypot(t[8], t[10]) || 1;
  const ux = { x: t[0] / lx, z: t[2] / lx };
  const uz = { x: t[8] / lz, z: t[10] / lz };
  const w = m.width / 2;
  const d = m.depth / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => ({ x: t[12] + ux.x * w * sx + uz.x * d * sz, z: t[14] + ux.z * w * sx + uz.z * d * sz }));
}

/** L'aire commune d'un rectangle (convexe) et d'un contour quelconque. */
function aireCommune(rect: PtSol[], contour: PtSol[]): number {
  const aire = (p: PtSol[]) => {
    let s = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j].x * p[i].z - p[i].x * p[j].z;
    return s / 2;
  };
  // Le rectangle tourné dans le sens positif, pour que « dedans » soit à gauche.
  const r = aire(rect) < 0 ? [...rect].reverse() : rect;
  let sujet = contour;
  for (let i = 0; i < r.length && sujet.length > 0; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const dedans = (p: PtSol) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= 0;
    const coupe = (p: PtSol, q: PtSol): PtSol => {
      const d1 = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
      const d2 = (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
      const k = d1 / (d1 - d2);
      return { x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k };
    };
    const sortie: PtSol[] = [];
    for (let k = 0; k < sujet.length; k++) {
      const p = sujet[k];
      const q = sujet[(k + 1) % sujet.length];
      if (dedans(p)) {
        sortie.push(p);
        if (!dedans(q)) sortie.push(coupe(p, q));
      } else if (dedans(q)) {
        sortie.push(coupe(p, q));
      }
    }
    sujet = sortie;
  }
  return sujet.length >= 3 ? Math.abs(aire(sujet)) : 0;
}

/** Sous cette part de plafond vu, la part debout d'un rampant est à vérifier. */
const COUVERTURE_SURE = 0.8;

/** Ce qui ne compte pas, d'après le nom qu'on a donné à la pièce. */
const HORS_LOGEMENT =
  /garage|cave|cellier|local|chaufferie|buanderie ext|balcon|terrasse|loggia|v[ée]randa|jardin d.hiver|remise|sous-sol|combles?|grenier|abri|atelier ext/i;
/*
  MAIS UNE PIÈCE HABITÉE LE RESTE — revue « Sébastien » : « Chambre sous
  combles », « Combles aménagés », « Grenier aménagé », « Bureau (ancien
  garage) » tombaient à 0 m² sur un seul mot. Le nom d'une pièce où l'on vit
  l'emporte sur celui de l'annexe.
*/
const HABITEE =
  /chambre|s[ée]jour|salon|bureau|cuisine|salle|sdb|wc|toilette|entr[ée]e|couloir|d[ée]gagement|dressing|mezzanine|palier|am[ée]nag[ée]/i;
const horsLogement = (nom: string) => HORS_LOGEMENT.test(nom) && !HABITEE.test(nom);

export interface PieceHabitable {
  roomId: string;
  /** Surface au sol (m²). */
  sol: number;
  /** Ce qui en compte (m²). */
  habitable: number;
  /** Pourquoi une partie ne compte pas — null si tout compte. */
  raison: string | null;
  /**
   * À VÉRIFIER : des murs sous 1,80 m, et pas de plafond relevé pour dire
   * quelle part du sol est trop basse.
   */
  aVerifier?: boolean;
}

export interface SurfacesHabitables {
  pieces: PieceHabitable[];
  /** Surface au sol de toutes les pièces fermées (m²). */
  sol: number;
  /** Surface habitable du logement (m²). */
  total: number;
  /** Combien de pièces sont à vérifier (voir `PieceHabitable.aVerifier`). */
  aVerifier: number;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/** Un meuble vu d'en haut, avec sa catégorie : l'escalier se reconnaît à elle. */
export interface MeubleAuSol {
  category: string;
  transform: number[];
  width: number;
  depth: number;
}

export function surfacesHabitables(
  rooms: { id: string; name?: string; releve?: { plafond?: PlafondDeLaPiece | null } | null }[],
  parts: RoomPart[],
  /**
   * LES MEUBLES DU NIVEAU — pour l'escalier. Revue « Sébastien » : reconnu
   * dans la fiche, il restait compté dans le sol habitable (2,25 m²). La
   * surface d'un escalier et de sa trémie ne compte pas.
   */
  meubles: readonly MeubleAuSol[] = [],
): SurfacesHabitables {
  const escaliers = meubles.filter((m) => /stairs/i.test(m.category));
  const pieces: PieceHabitable[] = [];
  for (const part of parts) {
    const sol = part.surface?.area ?? 0;
    if (!(sol > 0)) continue;
    const room = rooms.find((r) => r.id === part.roomId);
    const nom = room?.name ?? '';
    const plafond = room?.releve?.plafond ?? null;
    let habitable = sol;
    let raison: string | null = null;
    let aVerifier = false;
    if (horsLogement(nom)) {
      habitable = 0;
      raison = `${nom} : garage, cave, balcon et annexes ne comptent pas`;
    } else if (plafond?.rampant && plafond.surfaceHabitable !== null) {
      /*
        L'HABITABLE SUIT LA RETOUCHE — revue « Sébastien » : un pignon reculé
        de 10 cm faisait passer le sol de 30,00 à 30,60 m², et l'habitable
        restait à 22,50, figé au relevé. La part BASSE (sous 1,80 m) est
        celle que le LiDAR a vue ; ce qu'on ajoute ou retire en déplaçant un
        mur se reporte sur le reste.
      */
      const basse =
        plafond.solAuReleve !== undefined ? Math.max(0, plafond.solAuReleve - plafond.surfaceHabitable) : null;
      habitable = basse !== null ? Math.max(0, sol - basse) : Math.min(sol, plafond.surfaceHabitable);
      raison = 'la part sous 1,80 m ne compte pas';
      /*
        UN PLAFOND À MOITIÉ VU SOUS-ESTIME LA PART BASSE — revue « Sébastien » :
        les bas de pente sont les moins vus par le LiDAR, et la part debout,
        comptée sur les seuls carreaux vus, sortait trop haute (+14,9 % avec
        des sous-pentes vues à 40 %). Sous 80 % de plafond vu, le chiffre est
        dit à vérifier.
      */
      if (plafond.couverture < COUVERTURE_SURE) {
        aVerifier = true;
        raison = `la part sous 1,80 m ne compte pas — plafond vu à ${Math.round(plafond.couverture * 100)} %, à vérifier`;
      }
    } else if (
      plafond &&
      plafond.surfaceHabitable === null &&
      plafond.hMin < HAUTEUR_HABITABLE &&
      plafond.hMax >= HAUTEUR_HABITABLE
    ) {
      /*
        TROP PEU DE PLAFOND VU POUR TRANCHER, MAIS DES HAUTEURS SOUS 1,80 M —
        revue « Sébastien » : vu à 25 %, le rampant n'était pas établi et
        tout le sol comptait (+38,6 %), alors que la fiche connaissait une
        hauteur de 1,13 m. La surface reste celle du sol, dite à vérifier.
      */
      aVerifier = true;
      raison = 'plafond trop peu vu, des hauteurs sous 1,80 m : la part basse reste à mesurer';
    } else if ((plafond?.hMax ?? hauteurDeLaPiece(part)) < HAUTEUR_HABITABLE) {
      habitable = 0;
      raison = 'moins de 1,80 m sous plafond';
    } else if (
      !plafond?.rampant &&
      part.walls.some((w) => w.type === 'wall' && w.height < HAUTEUR_HABITABLE - 1e-6)
    ) {
      /*
        DES MURS SOUS 1,80 M, ET RIEN POUR DIRE OÙ PASSE LA LIGNE — revue
        « Sébastien » : sans plafond relevé, une chambre sous combles aux
        jambettes de 1,00 m comptait tout son sol (+44,8 %). La surface
        reste celle du sol, mais elle est DITE à vérifier.
      */
      aVerifier = true;
      raison = 'des murs sous 1,80 m : la part basse reste à mesurer';
    }
    /*
      L'ESCALIER, POUR LA PART QUI EST DANS LA PIÈCE — revue « Nadia » : un
      escalier droit qui monte au-dessus du cellier se déduisait en entier
      de l'entrée, son centre y tombant : 2,97 m² retirés pour 1,56. On ne
      retire que ce que son emprise couvre de la pièce.
    */
    const contour = part.surface?.nu ?? part.surface?.pts ?? [];
    const sousEscalier =
      contour.length >= 3 ? escaliers.reduce((t, m) => t + aireCommune(empriseDe(m), contour), 0) : 0;
    if (sousEscalier > 0 && habitable > 0) {
      habitable = Math.max(0, habitable - sousEscalier);
      raison = raison ?? 'l’escalier et sa trémie ne comptent pas';
    }
    pieces.push({
      roomId: part.roomId,
      sol: arrondi(sol),
      habitable: arrondi(habitable),
      raison,
      ...(aVerifier ? { aVerifier } : {}),
    });
  }
  return {
    pieces,
    sol: arrondi(pieces.reduce((t, p) => t + p.sol, 0)),
    total: arrondi(pieces.reduce((t, p) => t + p.habitable, 0)),
    aVerifier: pieces.filter((p) => p.aVerifier).length,
  };
}
