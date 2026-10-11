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
import { roomHeight } from './floorplan';
import type { PlafondDeLaPiece } from './fichePiece';
import { HAUTEUR_HABITABLE } from './fichePiece';

/** Ce qui ne compte pas, d'après le nom qu'on a donné à la pièce. */
const HORS_LOGEMENT =
  /garage|cave|cellier|local|chaufferie|buanderie ext|balcon|terrasse|loggia|v[ée]randa|combles?|grenier|abri|atelier ext/i;

export interface PieceHabitable {
  roomId: string;
  /** Surface au sol (m²). */
  sol: number;
  /** Ce qui en compte (m²). */
  habitable: number;
  /** Pourquoi une partie ne compte pas — null si tout compte. */
  raison: string | null;
}

export interface SurfacesHabitables {
  pieces: PieceHabitable[];
  /** Surface au sol de toutes les pièces fermées (m²). */
  sol: number;
  /** Surface habitable du logement (m²). */
  total: number;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

export function surfacesHabitables(
  rooms: { id: string; name?: string; releve?: { plafond?: PlafondDeLaPiece | null } | null }[],
  parts: RoomPart[],
): SurfacesHabitables {
  const pieces: PieceHabitable[] = [];
  for (const part of parts) {
    const sol = part.surface?.area ?? 0;
    if (!(sol > 0)) continue;
    const room = rooms.find((r) => r.id === part.roomId);
    const nom = room?.name ?? '';
    const plafond = room?.releve?.plafond ?? null;
    let habitable = sol;
    let raison: string | null = null;
    if (HORS_LOGEMENT.test(nom)) {
      habitable = 0;
      raison = `${nom} : garage, cave, balcon et annexes ne comptent pas`;
    } else if (plafond?.rampant && plafond.surfaceHabitable !== null) {
      habitable = Math.min(sol, plafond.surfaceHabitable);
      raison = 'la part sous 1,80 m ne compte pas';
    } else if ((plafond?.hMax ?? roomHeight(part.walls)) < HAUTEUR_HABITABLE) {
      habitable = 0;
      raison = 'moins de 1,80 m sous plafond';
    }
    pieces.push({ roomId: part.roomId, sol: arrondi(sol), habitable: arrondi(habitable), raison });
  }
  return {
    pieces,
    sol: arrondi(pieces.reduce((t, p) => t + p.sol, 0)),
    total: arrondi(pieces.reduce((t, p) => t + p.habitable, 0)),
  };
}
