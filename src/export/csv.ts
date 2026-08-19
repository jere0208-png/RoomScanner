/**
 * LE MÉTRÉ QUI S'OUVRE DANS UN TABLEUR.
 *
 * La liste du matériel existait déjà — dans le PDF. C'est le bon format pour
 * REMETTRE un dossier, et le pire pour le CHIFFRER : un devis se prépare dans
 * un tableur, où l'on colle ses prix dans une colonne à côté des quantités.
 * Recopier soixante lignes à la main depuis un PDF, personne ne le fait ;
 * on refait le métré, et on se trompe.
 *
 * TROIS PIÈGES DU CSV FRANÇAIS, et ils sont tous les trois ici :
 *
 * 1. **Le séparateur.** Excel en français lit le point-virgule, pas la
 *    virgule — un fichier séparé par des virgules s'ouvre en une seule
 *    colonne, et l'utilisateur conclut que l'export est cassé.
 * 2. **Les décimales.** 15,6 s'écrit avec une virgule, sinon le tableur y
 *    voit du texte et refuse d'additionner la colonne.
 * 3. **Les accents.** Sans marque d'ordre des octets en tête, Excel lit le
 *    fichier dans son encodage régional : « Séjour » devient « SÃ©jour ».
 *
 * Le fichier tient en sections empilées, séparées par une ligne vide, chacune
 * avec son en-tête. C'est ce que fait un export comptable : on trie et on
 * filtre section par section, sans avoir à ouvrir quatre fichiers.
 */
import type {
  Circuit,
  Differential,
  MaterialList,
} from '../geometry/nfc15100';

/** Le métré d'une pièce, tel que le plan le connaît. */
export interface RoomMetre {
  name: string;
  /** Surface au sol (m²), ou null si le contour n'est pas fermé. */
  area: number | null;
  /** Périmètre (m). */
  perimeter: number | null;
  /** Hauteur sous plafond (m). */
  height: number | null;
  walls: number;
}

/** Une valeur de cellule : nombre à la française, ou texte échappé. */
function cellule(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (!isFinite(v)) return '';
    // Deux décimales au plus, et jamais de zéros inutiles : « 2,5 » et non
    // « 2,50 » dans une colonne de sections de câble. Un tableur les
    // rajoutera lui-même si l'utilisateur veut un format à deux décimales ;
    // l'inverse — retrouver la valeur exacte derrière un arrondi affiché —
    // ne se fait pas.
    const s = v.toFixed(2).replace(/\.?0+$/, '');
    return s.replace('.', ',');
  }
  // Le point-virgule, le guillemet et le saut de ligne cassent la grille :
  // la cellule se met alors entre guillemets, les siens doublés.
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const ligne = (cells: (string | number | null | undefined)[]) =>
  cells.map(cellule).join(';');

const NATURES: Record<Circuit['nature'], string> = {
  prises: 'Prises 16 A',
  eclairage: 'Éclairage',
  specialise: 'Spécialisé',
  cuisson: 'Cuisson',
  sortie: 'Sortie de câble',
  vdi: 'Courants faibles',
};

/**
 * Le fichier complet, prêt à ouvrir.
 *
 * `pieces` porte le métré du plan (surfaces, périmètres), `list` tout ce que
 * la norme en déduit. Les deux sont séparés parce qu'ils ne viennent pas du
 * même endroit : l'un du dessin, l'autre du contrôle de conformité.
 */
export function buildMetreCsv(
  name: string,
  pieces: RoomMetre[],
  list: MaterialList,
): string {
  const out: string[] = [];
  const section = (titre: string, entete: string[]) => {
    if (out.length > 0) out.push('');
    out.push(ligne([titre]));
    out.push(ligne(entete));
  };

  out.push(ligne(['Métré', name]));

  // ---------------------------------------------------------------- pièces
  section('MÉTRÉ PAR PIÈCE', [
    'Pièce',
    'Surface (m²)',
    'Périmètre (m)',
    'Hauteur (m)',
    'Murs',
    'Surface murale (m²)',
  ]);
  for (const p of pieces) {
    // La surface murale : ce qu'on peint, ce qu'on saigne, ce qu'on doublage.
    // Elle ne déduit pas les menuiseries — un devis les reprend à part, et
    // les déduire ici donnerait un chiffre qu'on ne sait pas d'où il sort.
    const murale =
      p.perimeter !== null && p.height !== null ? p.perimeter * p.height : null;
    out.push(
      ligne([p.name, p.area, p.perimeter, p.height, p.walls, murale]),
    );
  }
  const totalSol = pieces.reduce((t, p) => t + (p.area ?? 0), 0);
  out.push(ligne(['TOTAL', totalSol, '', '', '', '']));

  // --------------------------------------------------------- appareillage
  section('APPAREILLAGE PAR PIÈCE', [
    'Pièce',
    'Usage',
    'Désignation',
    'Quantité',
  ]);
  for (const r of list.rooms) {
    for (const a of r.rows) {
      out.push(ligne([r.room, r.use, a.label, a.quantity]));
    }
  }

  // -------------------------------------------------------------- circuits
  section('CIRCUITS', [
    'Circuit',
    'Nature',
    'Points',
    'Section (mm²)',
    'Disjoncteur (A)',
    'Câble (m)',
    'Pièces',
  ]);
  for (const c of list.circuits) {
    out.push(
      ligne([
        c.label,
        NATURES[c.nature],
        c.points,
        c.section,
        c.breaker,
        c.cable ?? null,
        c.rooms.join(', '),
      ]),
    );
  }
  const totalCable = list.circuits.reduce((t, c) => t + (c.cable ?? 0), 0);
  if (totalCable > 0) {
    out.push(ligne(['TOTAL', '', '', '', '', totalCable, '']));
  }

  // -------------------------------------------------------- différentiels
  section('INTERRUPTEURS DIFFÉRENTIELS', [
    'Appareil',
    'Type',
    'Calibre (A)',
    'Circuits protégés',
  ]);
  for (const d of list.differentials as Differential[]) {
    out.push(
      ligne([d.label, d.type, d.rating, d.circuits.join(', ') || 'à répartir']),
    );
  }

  // -------------------------------------------------------------- tableau
  section('TABLEAU', ['Désignation', 'Quantité']);
  // Quantité zéro = un total (le câble en mètres), pas un article : la
  // cellule reste vide plutôt que d'écrire un « 0 » qui s'additionnerait.
  for (const b of list.board) {
    out.push(ligne([b.label, b.quantity > 0 ? b.quantity : '']));
  }

  // ----------------------------------------------------------- conformité
  // Ce qui manque se chiffre AUSSI : c'est même la partie du devis qu'on
  // oublie, puisqu'elle ne se voit pas sur le plan.
  if (list.issues.length > 0) {
    section('CONFORMITÉ NF C 15-100', ['Gravité', 'Constat', 'Règle']);
    for (const i of list.issues) {
      out.push(
        ligne([
          i.severity === 'alerte' ? 'À CORRIGER' : 'À vérifier',
          // Le message porte déjà le nom de la pièce : la colonne « pièce »
          // aurait répété la moitié de la phrase.
          i.message,
          i.regle,
        ]),
      );
    }
  }

  // La marque d'ordre des octets : sans elle, Excel massacre les accents.
  return `﻿${out.join('\r\n')}\r\n`;
}

/** Nom du fichier, sans caractère qui fâche un système de fichiers. */
export function metreFilename(name: string): string {
  const propre = (name || 'Scan').replace(/[\\/:*?"<>|]/g, '-').trim();
  return `Métré - ${propre}.csv`;
}
