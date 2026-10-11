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
 * Tout cela habille la 3D et ne change rien au relevé : les clés s'enregistrent
 * avec la pièce, la teinte avec le meuble.
 */
import { hexDePeinture, type Peinture } from './peintures';

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

/** La clé d'une teinte posée sur un meuble (il garde l'hexa, pas la clé). */
export function cleDeTeinte(hex: string | null | undefined): string {
  if (!hex) return TEINTE_ORIGINE;
  return TEINTES_MEUBLES.find((t) => t.hex.toLowerCase() === hex.toLowerCase())?.cle ?? TEINTE_ORIGINE;
}

type PieceHabillee = { id: string; peinture?: string; sol?: string; accents?: Record<string, string> };

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

/** Le sol choisi de chaque pièce, prêt pour la scène : teinte et joints. */
export function solsDesPieces(rooms: PieceHabillee[]): Record<string, { hex: string; motif: Sol['motif'] }> {
  const out: Record<string, { hex: string; motif: Sol['motif'] }> = {};
  for (const r of rooms) {
    const s = solDe(r.sol);
    if (s) out[r.id] = { hex: s.hex, motif: s.motif };
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
