/**
 * LE NOM DES FICHIERS EXPORTÉS — une seule règle pour tous.
 *
 * Revue de l'export : chaque sortie suivait la sienne. Le plan partait en
 * « Appartement-exemple.pdf » (tirets, sans accents), la liste du matériel
 * en « Appartement-exemple---materiel.pdf », le devis en « Devis 2026-014 —
 * Appartement exemple.pdf », le tableur en « Métré - Appartement
 * exemple.csv », le DXF en « Appartement-exemple.dxf ». « Séjour l'été »
 * donnait « Sejour-lete.pdf » mais « Sejour-l-ete.dxf », et le niveau
 * s'écrivait « — 1er étage » ici, « R+1 » là. Le client recevait trois
 * pièces jointes du même chantier nommées de trois façons.
 *
 * LA RÈGLE : le titre du dossier, son niveau s'il en a plusieurs, puis ce
 * que contient le fichier, séparés par « - » :
 *
 *   « Dupont - Plan.pdf », « Dupont - Devis 2026-014.pdf »,
 *   « Dupont - 1er étage - Métré.csv », « Dupont - Liste du matériel.pdf ».
 *
 * Les espaces et les accents restent : iOS, Mail, Windows et macOS les
 * acceptent, et le nom se lit comme un titre. Seul le DXF les déplie
 * (`ascii`) : il part chez des logiciels de dessin anciens, qui n'en
 * veulent pas. Ce qu'un disque refuse — « \ / : * ? " < > | », les
 * caractères de contrôle — s'en va ; « 12/10/2026 » devient « 12-10-2026 ».
 */
import { deplierLigatures } from '../ui/mots';

/** Un morceau de nom, débarrassé de ce qu'un système de fichiers refuse. */
function morceau(s: string, ascii: boolean): string {
  let t = deplierLigatures(s);
  if (ascii) {
    t = t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[^\x20-\x7E]/g, '');
  }
  return (
    t
      // « 12/10/2026 » : une date, qui garde ses chiffres liés.
      .replace(/(\d)\s*[\\/:]\s*(?=\d)/g, '$1-')
      .replace(/[\\/:*?"<>|]/g, ' ')
      // Les pictogrammes et leurs liaisons : rien à faire dans un nom de
      // fichier qu'un autre système devra relire.
      .replace(/\p{Extended_Pictographic}|[‍︀-️]/gu, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      // Ni point en tête (un fichier caché), ni point ou espace en fin
      // (Windows les retire en silence), ni tiret orphelin.
      .replace(/^[\s.-]+|[\s.-]+$/g, '')
  );
}

export function nomDeFichier(
  titre: string,
  extension: string,
  o: {
    /** Ce que contient le fichier : « Plan », « Métré », « Devis 2026-014 ». */
    genre?: string;
    /** Le niveau, quand le logement en a plusieurs (voir `nomDuNiveau`). */
    niveau?: string;
    /** Accents et signes typographiques dépliés : pour le DXF. */
    ascii?: boolean;
  } = {},
): string {
  const ascii = !!o.ascii;
  const morceaux = [titre, o.niveau ?? '', o.genre ?? '']
    .map((m) => morceau(m, ascii))
    .filter(Boolean);
  return `${morceaux.join(' - ') || 'EchoPlan'}.${extension}`;
}
