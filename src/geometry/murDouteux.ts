/**
 * LE MUR MAL VU, NOMMÉ — relevé du patron : « lors d'un scan, il est dit
 * qu'un mur a été mal détecté, mais on n'informe pas lequel ».
 *
 * Le natif dit où est le plus proche des murs douteux, vu du téléphone
 * (`murDouteuxLePlusProche`, Swift) : de quel côté, à quelle distance, et sa
 * longueur. On le dit comme on le dirait à quelqu'un qui balaie la pièce :
 * « le mur à votre gauche », pas un identifiant.
 */

export interface MurDouteux {
  cote: 'gauche' | 'droite' | 'devant' | 'derriere';
  /** Du téléphone au mur (m). */
  distance: number;
  /** Sa longueur (m) : celle qui le distingue de ses voisins. */
  longueur: number;
  /** À plat, vu du téléphone : 0 devant, +90 à droite, ±180 derrière. */
  angle?: number;
}

const COTES = ['gauche', 'droite', 'devant', 'derriere'];
const m1 = (m: number) => `${m.toFixed(1).replace('.', ',')} m`;

/*
  UNE CONSIGNE, PAS UN CONSTAT — relevé du patron, captures à l'appui :
  « 6 murs mal vus · le plus proche votre gauche (1,89 m, à 1 m) » tenait
  sur trois lignes, deux nombres sans mot pour dire lequel était quoi, et ne
  disait pas QUOI FAIRE. On dit le geste, le mur par sa longueur, et la
  flèche montre où se tourner. Les autres murs attendent leur tour (« +5 »).
*/
export interface ConsigneDuMur {
  texte: string;
  /** Les autres murs à revoir, après celui-ci. */
  reste: number;
  /** Où se tourner (degrés, 0 devant) ; null : il est devant. */
  fleche: number | null;
}

export function consigneDuMur(n: number, mur: MurDouteux | null | undefined): ConsigneDuMur {
  if (!mur || !COTES.includes(mur.cote)) {
    return { texte: n > 1 ? `${n} murs à revoir · balayez-les lentement` : 'Un mur à revoir · balayez-le lentement', reste: 0, fleche: null };
  }
  const reste = Math.max(0, n - 1);
  if (mur.cote === 'devant') {
    return {
      texte: mur.distance > 3 ? `Approchez-vous du mur en face (${m1(mur.longueur)})` : 'Balayez ce mur de bas en haut, lentement',
      reste,
      fleche: null,
    };
  }
  const fleche = typeof mur.angle === 'number' ? mur.angle : { gauche: -90, droite: 90, derriere: 180 }[mur.cote];
  const texte =
    mur.cote === 'derriere'
      ? `Retournez-vous · mur de ${m1(mur.longueur)} à revoir`
      : `Tournez-vous à ${mur.cote} · mur de ${m1(mur.longueur)} à revoir`;
  return { texte, reste, fleche };
}

/** La phrase seule, pour qui n'affiche pas la flèche. */
export function phraseDuMurDouteux(n: number, m: MurDouteux | null | undefined): string {
  const c = consigneDuMur(n, m);
  return c.reste > 0 ? `${c.texte} (+${c.reste})` : c.texte;
}
