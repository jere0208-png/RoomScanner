/**
 * L'HABILLAGE DE LA MAQUETTE — le sol, un mur d'accent, la couleur des
 * meubles.
 *
 * Relevé du patron, point 9 de la réflexion « grand public » : « plus de
 * personnalisation en 3D : choix du sol, un mur d'une autre couleur, couleur
 * des meubles ». La maquette savait peindre une pièce entière ; on refait
 * rarement une pièce entière. On change un sol, on fonce UN mur derrière le
 * canapé, on se demande si le canapé gris irait mieux en vert.
 *
 * La doctrine du nuancier tient toujours (`ui/peintures`) : PAS DE SÉLECTEUR
 * DE COULEUR libre. Des sols qu'on trouve en magasin, des teintes de meubles
 * qu'on trouve en magasin — une maquette fuchsia ne se montre à personne.
 *
 * (Depuis, le patron a demandé un sélecteur RGB : les nuanciers restent en
 * raccourcis, et une couleur libre se pose en plus — `solTeinte` pour le
 * sol, un hexa hors nuancier pour un meuble. Voir `ui/peintures`.)
 *
 * Tout cela habille la 3D et ne change rien au relevé : les clés s'enregistrent
 * avec la pièce, la teinte avec le meuble.
 */
import { hexDePeinture, type Peinture } from './peintures';
import { lireHex } from './couleurLibre';

/** Un revêtement de sol : sa teinte, et le dessin de ses joints. */
export interface Sol extends Peinture {
  /** Lattes, carreaux, ou rien (béton ciré, moquette). */
  motif: 'parquet' | 'carrelage' | null;
}

/** La clé qui laisse la maquette deviner le sol d'après le nom de la pièce. */
export const SOL_DEFAUT = 'auto';

export const SOLS: Sol[] = [
  { cle: SOL_DEFAUT, nom: 'Selon la pièce', hex: '#D9CBB4', motif: null },
  { cle: 'chene', nom: 'Chêne clair', hex: '#C89A66', motif: 'parquet' },
  { cle: 'blanchi', nom: 'Bois blanchi', hex: '#E2D3BC', motif: 'parquet' },
  { cle: 'noyer', nom: 'Noyer', hex: '#7A5232', motif: 'parquet' },
  { cle: 'carrelage', nom: 'Carrelage clair', hex: '#E3E6E4', motif: 'carrelage' },
  { cle: 'ciment', nom: 'Carreau ciment', hex: '#B9B2A6', motif: 'carrelage' },
  { cle: 'ardoise', nom: 'Ardoise', hex: '#5F6468', motif: 'carrelage' },
  { cle: 'beton', nom: 'Béton ciré', hex: '#B8B5AF', motif: null },
  { cle: 'moquette', nom: 'Moquette', hex: '#A99F92', motif: null },
];

const SOL_PAR_CLE = new Map(SOLS.map((s) => [s.cle, s]));

/** Le sol d'une clé — `null` pour « selon la pièce » ou une clé inconnue. */
export function solDe(cle: string | null | undefined): Sol | null {
  if (!cle || cle === SOL_DEFAUT) return null;
  return SOL_PAR_CLE.get(cle) ?? null;
}

/** Deux teintes #RRGGBB mêlées : `part` de la première. Une teinte illisible rend la première. */
function meler(a: string, b: string, part: number): string {
  const lire = (h: string) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const x = lire(a);
  const y = lire(b);
  if (!x || !y) return a;
  return `#${x
    .map((v, i) => Math.round(v * part + y[i] * (1 - part)).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * LE SOL CHOISI, TEL QUE LE PLAN 2D LE PEINT — correctif de l'audit : le
 * décor était invisible sur le plan. Sa teinte, mêlée à moitié au fond du
 * plan, pour que les noms et les cotes restent lisibles. `null` sans choix.
 */
export function solSurLePlan(
  cle: string | null | undefined,
  fond: string,
  part = 0.5,
  /** La teinte libre du sol (`solTeinte`) : elle passe devant celle du nuancier. */
  teinteLibre?: string | null,
): string | null {
  const libre = lireHex(teinteLibre);
  if (libre) return meler(libre, fond, part);
  const s = solDe(cle);
  return s ? meler(s.hex, fond, part) : null;
}

/** La clé qui rend au meuble sa couleur d'origine. */
export const TEINTE_ORIGINE = 'origine';

/** Des teintes de meubles : bois, laques, tissus courants. */
export const TEINTES_MEUBLES: Peinture[] = [
  { cle: TEINTE_ORIGINE, nom: 'D’origine', hex: '#D8E1F2' },
  { cle: 'blanc', nom: 'Blanc', hex: '#F4F2EE' },
  { cle: 'boisClair', nom: 'Bois clair', hex: '#D2B48C' },
  { cle: 'boisFonce', nom: 'Bois foncé', hex: '#6B4A2F' },
  { cle: 'gris', nom: 'Gris clair', hex: '#B8BCC2' },
  { cle: 'anthracite', nom: 'Anthracite', hex: '#3F444A' },
  { cle: 'noir', nom: 'Noir', hex: '#1F2124' },
  { cle: 'beige', nom: 'Beige', hex: '#D9C8AE' },
  { cle: 'bleuNuit', nom: 'Bleu nuit', hex: '#2E3A55' },
  { cle: 'sauge', nom: 'Vert sauge', hex: '#9DAE97' },
  { cle: 'terracotta', nom: 'Terracotta', hex: '#C0714F' },
  { cle: 'moutarde', nom: 'Moutarde', hex: '#C9A13B' },
];

const TEINTE_PAR_CLE = new Map(TEINTES_MEUBLES.map((t) => [t.cle, t]));

/** La teinte d'une clé — `null` pour « d'origine » ou une clé inconnue. */
export function hexDeTeinte(cle: string | null | undefined): string | null {
  if (!cle || cle === TEINTE_ORIGINE) return null;
  return TEINTE_PAR_CLE.get(cle)?.hex ?? null;
}

/**
 * La clé de la teinte libre d'un meuble : aucune pastille du nuancier ne la
 * porte, et « D'origine » ne se coche plus sur un meuble peint d'une couleur
 * choisie au sélecteur.
 */
export const TEINTE_LIBRE = 'libre';

/** La clé d'une teinte posée sur un meuble (il garde l'hexa, pas la clé). */
export function cleDeTeinte(hex: string | null | undefined): string {
  if (!hex) return TEINTE_ORIGINE;
  return TEINTES_MEUBLES.find((t) => t.hex.toLowerCase() === hex.toLowerCase())?.cle ?? TEINTE_LIBRE;
}

type PieceHabillee = {
  id: string;
  peinture?: string;
  sol?: string;
  /** La teinte libre du sol, `#RRGGBB` : la matière (`sol`) ne change pas. */
  solTeinte?: string;
  accents?: Record<string, string>;
};

/**
 * La peinture choisie de chaque pièce, prête pour la scène : pièce → teinte.
 * Une clé inconnue (un plan d'une version plus récente) ne donne rien : le
 * mur garde le blanc du dessin plutôt qu'une couleur tirée au sort.
 */
export function peinturesDesPieces(rooms: PieceHabillee[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rooms) {
    const hex = hexDePeinture(r.peinture);
    if (hex) out[r.id] = hex;
  }
  return out;
}

/**
 * Le sol choisi de chaque pièce, prêt pour la scène : teinte et joints.
 *
 * UNE TEINTE LIBRE GARDE LA MATIÈRE — un parquet reste un parquet, repeint
 * de la couleur choisie au sélecteur. Sur un sol « selon la pièce », le
 * motif reste INDÉFINI (`undefined`, pas `null`) : la scène garde alors la
 * matière que le nom de la pièce suggère (`matieresDesSols`).
 */
export function solsDesPieces(
  rooms: PieceHabillee[],
): Record<string, { hex: string; motif?: Sol['motif'] }> {
  const out: Record<string, { hex: string; motif?: Sol['motif'] }> = {};
  for (const r of rooms) {
    const s = solDe(r.sol);
    const libre = lireHex(r.solTeinte);
    if (libre) out[r.id] = s ? { hex: libre, motif: s.motif } : { hex: libre };
    else if (s) out[r.id] = { hex: s.hex, motif: s.motif };
  }
  return out;
}

/** Les murs d'accent de chaque pièce, prêts pour la scène : pièce → mur → teinte. */
export function accentsDesPieces(rooms: PieceHabillee[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const r of rooms) {
    for (const [wallId, cle] of Object.entries(r.accents ?? {})) {
      const hex = hexDePeinture(cle);
      if (!hex) continue;
      (out[r.id] ??= {})[wallId] = hex;
    }
  }
  return out;
}
