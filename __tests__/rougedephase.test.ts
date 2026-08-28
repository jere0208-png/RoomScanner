/**
 * LE ROUGE NE DIT QU'UNE SEULE CHOSE : LA PHASE.
 *
 * Question du patron, sur une capture du plan : « pourquoi l'affichage des
 * gaines est rouge pour l'interrupteur ? »
 *
 * CE N'ÉTAIT PAS UN BUG, ET C'EST CE QUI LE RENDAIT GÊNANT. La teinte d'une
 * gaine est celle de son CIRCUIT, prise dans une roue de douze : C1 bleu, C2
 * rouge, C3 vert… Et les circuits sont numérotés dans l'ordre où la NF C
 * 15-100 les crée — cuisson, spécialisés, prises, ÉCLAIRAGE, sorties, VDI.
 * Dans un logement sans plaque ni circuit spécialisé, l'éclairage tombe donc
 * en C2. L'interrupteur était rouge parce que son circuit portait le numéro
 * deux, et pour aucune autre raison.
 *
 * DEUX ROUGES SE DISPUTAIENT LE MÊME PLAN.
 *
 *   — le rouge d'ALARME de l'application : le halo d'un meuble qu'on ne peut
 *     pas poser, la pastille des normes non conformes ;
 *   — le rouge NORMATIF du métier : la phase, « rouge, marron ou noir »
 *     (NF C 15-100, reprenant la CEI 60446).
 *
 * Un troisième s'y était glissé sans rien vouloir dire — « circuit n° 2 » —
 * et il portait EXACTEMENT le code du fil de phase, `#B8352A`. Trois sens
 * pour une couleur, à dix centimètres les uns des autres.
 *
 * ARBITRAGE DU PATRON : « évite le rouge mais il doit rester dans le schéma
 * pour la phase, le rouge est une norme pour le fil de phase. »
 *
 * La roue des circuits perd donc ses deux teintes rouges — le rouge franc et
 * le rouille — SANS REMPLACEMENT. Dix couleurs franchement distinctes valent
 * mieux que douze dont deux mentent : la roue se répète déjà au-delà de son
 * tour, et deux circuits de même teinte restent séparés par leur repère.
 *
 * ON MESURE LA COULEUR PAR SA NATURE, PAS PAR SON CODE. Un banc qui listerait
 * les hexadécimaux interdits laisserait passer le premier rouge écrit
 * autrement. On convertit donc en teinte (HSL) et l'on refuse la BANDE
 * rouge — c'est la question qu'on se pose vraiment : « est-ce que ça a l'air
 * rouge ? »
 */
import { WIRE_COLORS, circuitColor } from '../src/geometry/schema';

/** Teinte, saturation, clarté d'un code hexadécimal. */
function hsl(hex: string): { h: number; s: number; l: number } {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d + 6) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h, s, l };
}

/**
 * A-T-ELLE L'AIR ROUGE ?
 *
 * La bande rouge du cercle chromatique — de 340° à 20° en passant par zéro —
 * pour une couleur assez saturée et ni noire ni pâle. L'orange (autour de
 * 30°) et le magenta (autour de 330°) n'en sont pas : on les distingue d'un
 * rouge sans hésiter, et la roue en a besoin.
 */
const aLAirRouge = (hex: string) => {
  const { h, s, l } = hsl(hex);
  if (s < 0.25 || l < 0.15 || l > 0.75) return false;
  return h < 20 || h > 340;
};

/** L'écart entre deux couleurs, sur les trois composantes. */
const ecart = (u: string, v: string) => {
  const c = (h: string) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [c(u), c(v)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

describe('la roue des circuits', () => {
  /** Un tour complet, et un peu plus : la roue se répète. */
  const TOUR = Array.from({ length: 24 }, (_, i) => circuitColor(i));

  it('ne sort plus aucune teinte rouge', () => {
    const rouges = TOUR.filter(aLAirRouge);
    expect({ rouges: [...new Set(rouges)] }).toEqual({ rouges: [] });
  });

  /*
    LE CONTRÔLE EN SENS INVERSE, et il est indispensable : une roue devenue
    toute grise, toute bleue, ou réduite à une seule teinte passerait
    l'épreuve du dessus sans rien valoir. On suit une couleur AVANT de lire un
    repère, sur le chantier — il en faut donc plusieurs, et bien séparées.

    ON MESURE LA DISTANCE ENTRE VOISINS DE LA ROUE, PAS ENTRE TOUTES LES
    PAIRES. C'est la question du chantier : les circuits sont numérotés à la
    suite, et ce qu'on doit pouvoir distinguer d'un coup d'œil, c'est C1 de C2,
    C2 de C3. Deux teintes proches à sept rangs l'une de l'autre ne se
    rencontrent pratiquement jamais sur le même plan — et l'exiger obligerait
    à douze teintes franches sur fond blanc, ce que l'espace des couleurs ne
    donne pas.

    ET LA DISTANCE N'EST PAS LA TEINTE SEULE : deux bleus peuvent partager un
    même angle du cercle et se distinguer par leur clarté. On mesure donc
    l'écart des trois composantes — c'est ce que l'œil fait.
  */
  it('mais elle garde assez de teintes, et des voisines bien séparées', () => {
    const uniques = [...new Set(TOUR)];
    expect(uniques.length).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < uniques.length; i++) {
      const a = uniques[i];
      const b = uniques[(i + 1) % uniques.length];
      expect({ paire: [a, b], separees: ecart(a, b) >= 50 }).toEqual({
        paire: [a, b],
        separees: true,
      });
    }
  });

  it('et elle est saturée : pas de gris qui se perd sur un aplat de sol', () => {
    for (const c of new Set(TOUR)) {
      expect({ c, sature: hsl(c).s > 0.3 }).toEqual({ c, sature: true });
    }
  });
});

describe('le schéma garde le rouge de la norme', () => {
  /*
    C'EST LA MOITIÉ QUI COMPTE — relevé du patron : « il doit rester dans le
    schéma pour la phase, le rouge est une norme pour le fil de phase ».

    Retirer le rouge du plan pour le retirer aussi du schéma, ce serait avoir
    corrigé une confusion en cassant une norme. La phase est rouge, marron ou
    noir (NF C 15-100, reprenant la CEI 60446) : elle le reste.
  */
  it('la phase est rouge, et elle le dit', () => {
    expect(aLAirRouge(WIRE_COLORS.phase.color)).toBe(true);
    expect(WIRE_COLORS.phase.label.toLowerCase()).toContain('rouge');
  });

  it('et aucun autre conducteur ne l’est', () => {
    for (const [role, w] of Object.entries(WIRE_COLORS)) {
      if (role === 'phase') continue;
      expect({ role, rouge: aLAirRouge(w.color) }).toEqual({
        role,
        rouge: false,
      });
    }
  });

  /*
    ET LE PLAN N'EMPRUNTE PLUS LE CODE DE LA PHASE. C'était le nœud : la
    deuxième teinte de la roue valait `#B8352A`, c'est-à-dire le fil de phase,
    au point près. Un tracé de gaine portait donc le code d'un conducteur.
  */
  it('la roue n’emprunte plus le code exact d’un conducteur', () => {
    const conducteurs = new Set(
      Object.values(WIRE_COLORS).map((w) => w.color.toUpperCase()),
    );
    for (const c of new Set(TOUR_PUBLIC)) {
      expect({ c, emprunte: conducteurs.has(c.toUpperCase()) }).toEqual({
        c,
        emprunte: false,
      });
    }
  });
});

/** La roue, relue ici : le second `describe` n'a pas la portée du premier. */
const TOUR_PUBLIC = Array.from({ length: 24 }, (_, i) => circuitColor(i));
