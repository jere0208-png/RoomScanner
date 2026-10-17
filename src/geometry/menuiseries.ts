/**
 * LE CARNET DES MENUISERIES — chaque porte, fenêtre et passage du relevé,
 * repéré, avec ses cotes.
 *
 * Relevé du patron, dossier d'architecte à l'appui : les plans « MEX » d'un
 * DCE étiquettent chaque baie (« MEX 9 : 1,20 × h 1,17 · All 1,00 ·
 * Fenêtre battant ») et les portes ont leur tableau. C'est ce que demande un
 * menuisier pour chiffrer, et ce que le particulier envoie pour ses devis.
 * Le relevé connaît déjà tout cela ; il ne le rangeait nulle part.
 *
 * LES REPÈRES SUIVENT LE MÉTIER : P pour les portes, F pour les fenêtres
 * (portes-fenêtres comprises), B pour les baies libres, numérotées pièce par
 * pièce dans l'ordre du métré. Une porte entre deux pièces n'a qu'une ligne,
 * qui nomme les deux.
 */
import { roomParts, segLength, type WallSeg } from './floorplan';
import { baiesDeLaPiece } from './travaux';

export interface LigneMenuiserie {
  /** L'identifiant de la baie : le plan y pose le repère. */
  id: string;
  repere: string;
  /** La pièce, ou les deux pièces qu'elle relie. */
  pieces: string;
  type: string;
  /** Largeur de la baie (m). */
  largeur: number;
  /** Hauteur de passage ou de jour (m). */
  hauteur: number;
  /** Hauteur d'allège d'une fenêtre (m) ; `null` pour une porte. */
  allege: number | null;
}

/** Ce qu'est une baie, dit comme sur un carnet de menuiseries. */
export function typeDeMenuiserie(o: WallSeg): string {
  if (o.type === 'opening') return 'Passage libre';
  if (o.type === 'door') {
    if (o.garage) return 'Porte de garage';
    if (o.placard) return 'Porte de placard';
    if (o.vantaux === 2) return 'Porte double';
    return 'Porte';
  }
  const allege = o.yCenter - o.height / 2;
  return allege < 0.15 ? 'Porte-fenêtre' : 'Fenêtre';
}

export function carnetDesMenuiseries(
  walls: WallSeg[],
  openings: WallSeg[],
  rooms: { id: string; wallIds?: string[] }[] | undefined,
  roomNames: Record<string, string>,
): LigneMenuiserie[] {
  const parts = roomParts(walls, rooms as never);
  const baies = openings.filter((o) => o.type === 'door' || o.type === 'window' || o.type === 'opening');
  // Les pièces de chaque baie, dans l'ordre du métré.
  const piecesDe = new Map<string, string[]>();
  parts.forEach((part, i) => {
    const nom = roomNames[part.roomId] || `Pièce ${i + 1}`;
    for (const o of baiesDeLaPiece(part, baies)) {
      const l = piecesDe.get(o.id) ?? [];
      if (!l.includes(nom)) l.push(nom);
      piecesDe.set(o.id, l);
    }
  });
  const rang = (o: WallSeg) => {
    const p = piecesDe.get(o.id)?.[0];
    const i = parts.findIndex((part, k) => (roomNames[part.roomId] || `Pièce ${k + 1}`) === p);
    return i < 0 ? parts.length : i;
  };
  const tries = [...baies].sort((u, v) => rang(u) - rang(v));
  const compte = { P: 0, F: 0, B: 0 };
  return tries.map((o) => {
    const lettre = o.type === 'door' ? 'P' : o.type === 'window' ? 'F' : 'B';
    compte[lettre] += 1;
    const allege = o.type === 'window' ? Math.max(0, o.yCenter - o.height / 2) : null;
    return {
      id: o.id,
      repere: `${lettre}${compte[lettre]}`,
      pieces: (piecesDe.get(o.id) ?? ['—']).join(' / '),
      // Une porte qui ne donne que sur une pièce (et pas un placard) ouvre
      // sur le dehors ou le palier : c'est la porte d'entrée.
      type: typeDeMenuiserie(o) === 'Porte' && (piecesDe.get(o.id)?.length ?? 0) === 1 ? 'Porte d’entrée' : typeDeMenuiserie(o),
      largeur: segLength(o),
      hauteur: o.height,
      // Une porte-fenêtre n'a pas d'allège à dire.
      allege: allege !== null && allege >= 0.15 ? allege : null,
    };
  });
}
