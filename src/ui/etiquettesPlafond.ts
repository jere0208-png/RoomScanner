/**
 * LA CHAÎNE DE COTES D'UNE LIGNE D'APPAREILS — DÉCRITE UNE SEULE FOIS.
 *
 * Relevé du patron : « fais un tour pour le placement intelligent des cotes
 * sur toute longueur. Il faut absolument pas que 2 cotes se touchent ou qu'un
 * élément vienne entraver la lecture d'une cote. »
 *
 * LE PLAN AVAIT DEUX ARBITRES QUI NE SE PARLAIENT PAS. Les cotes de mur
 * passaient par `cotesLisibles` — la plus grande gagne, les autres renoncent.
 * Les écarts d'une ligne de spots, eux, s'écrivaient sans regarder personne :
 * ils vivaient dans le calque du plafond, qui ne sait rien des cotes de mur.
 * Mesuré sur le plan de référence, à seize cadrages : **28 chevauchements sur
 * 478 étiquettes**, dont seize impliquaient une cote de plafond.
 *
 * ON NE RECOPIE PAS LA GÉOMÉTRIE POUR L'ARBITRER, c'est le piège classique de
 * cette maison : un banc de rendu 3D avait un jour recopié la projection
 * d'une planche de référence et mesurait une autre caméra. Deux calculs de la
 * même chose finissent toujours par diverger — et le jour où ils divergent,
 * l'arbitre protège une place que le dessin n'occupe pas.
 *
 * Ce module est donc la SOURCE UNIQUE : le calque du plafond s'en sert pour
 * DESSINER, le plan s'en sert pour ARBITRER. Il ne connaît ni couleur ni
 * composant — seulement où chaque nombre se pose, et la place qu'il prend.
 */
import { ceilingChain, type CeilingFixture } from '../geometry/ceiling';
import { encombrement } from '../geometry/cotes';
import type { Pt, RoomPart, WallSeg } from '../geometry/floorplan';

/** Un point à l'écran, en pixels. */
export interface Px {
  x: number;
  y: number;
}

/** La police d'un écart de chaîne. Le calque et l'arbitre la partagent. */
export const TAILLE_ECART = 9.5;

/**
 * En deçà, le trait est trop court pour porter un nombre : on ne l'écrit pas.
 * Dix-huit pixels, c'est la largeur de deux chiffres et de leur plaque.
 */
const TRAIT_MINIMAL = 18;

export interface EtiquetteEcart {
  /** `plafond:<ligne>:<rang>` — l'identifiant que l'arbitre garde ou écarte. */
  id: string;
  /** La ligne d'appareils à laquelle l'écart appartient. */
  row: string;
  /** Les deux bouts du trait de cote, en pixels. */
  a: Px;
  b: Px;
  /** Le milieu, où se posent la plaque et le nombre. */
  at: Px;
  /** L'inclinaison du nombre, en degrés — il se lit toujours à l'endroit. */
  angle: number;
  /** Le nombre écrit, en centimètres. */
  texte: string;
  /** Ce qu'il occupe, rotation comprise. */
  taille: { w: number; h: number };
  /** L'écart mesuré, en mètres : c'est lui qui départage. */
  valeur: number;
}

/**
 * Toutes les cotes d'écart à écrire, lignes confondues.
 *
 * On rend TOUT ce qui est dessinable ; c'est à l'appelant d'arbitrer. Un
 * module qui renoncerait lui-même à une cote sans savoir ce qu'il y a autour
 * referait le défaut qu'on corrige : deux arbitres qui ne se parlent pas.
 */
export function etiquettesDesEcarts(
  ceiling: CeilingFixture[] | undefined,
  partOf: Map<string, RoomPart>,
  walls: WallSeg[],
  frame: number,
  toPx: (p: Pt) => Px,
): EtiquetteEcart[] {
  const out: EtiquetteEcart[] = [];
  const lignes = [...new Set((ceiling ?? []).map((x) => x.row).filter(Boolean))];
  for (const row of lignes) {
    const lot = (ceiling ?? []).filter((cl) => cl.row === row);
    if (lot.length === 0) continue;
    const murs = partOf.get(lot[0].roomId)?.walls ?? walls;
    const chaine = ceilingChain(lot, murs, frame);
    if (!chaine) continue;
    const jalons: (Pt | null)[] = [
      chaine.bouts[0],
      ...chaine.points,
      chaine.bouts[1],
    ];
    chaine.cotes.forEach((val, i) => {
      const p0 = jalons[i];
      const p1 = jalons[i + 1];
      if (val === null || !p0 || !p1) return;
      const a = toPx(p0);
      const b = toPx(p1);
      if (Math.hypot(b.x - a.x, b.y - a.y) < TRAIT_MINIMAL) return;
      // Le nombre se lit toujours à l'endroit : on ramène l'inclinaison du
      // trait dans le quart de tour qui garde la tête en haut.
      let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      const texte = `${Math.round(val * 100)}`;
      out.push({
        id: `plafond:${row}:${i}`,
        row: String(row),
        a,
        b,
        at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        angle,
        texte,
        // La MÊME estimation que les cotes de mur : deux règles de mesure
        // différentes pour un même arbitrage, et l'une protégerait une place
        // que l'autre n'occupe pas.
        taille: encombrement(texte, TAILLE_ECART, angle),
        valeur: val,
      });
    });
  }
  return out;
}

/**
 * CE QUI DÉPARTAGE UN ÉCART DE PLAFOND FACE À UNE COTE DE MUR.
 *
 * L'arbitre range les étiquettes par poids et garde les plus lourdes. Les
 * cotes de mur pèsent `1000 + longueur` pour un mur entier, et `longueur`
 * pour un tronçon entre deux menuiseries.
 *
 * Un écart de plafond se glisse ENTRE LES DEUX, et c'est un choix de métier :
 *
 *   — il cède au mur entier, qui est la dimension première du plan. Un plan
 *     dont on ne lit plus la longueur d'un mur n'est plus un plan ;
 *   — il passe devant un tronçon, parce qu'on perce d'après lui. La chaîne
 *     d'implantation se relève au cordeau sous le plafond ; le retour de mur,
 *     lui, se retrouve au métré et sur l'élévation.
 */
export const POIDS_ECART = 500;
