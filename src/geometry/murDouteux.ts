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
}

const OU: Record<MurDouteux['cote'], string> = {
  gauche: 'à votre gauche',
  droite: 'à votre droite',
  devant: 'devant vous',
  derriere: 'derrière vous',
};

const metres = (m: number) => `${m.toFixed(2).replace('.', ',')} m`;

export function phraseDuMurDouteux(n: number, m: MurDouteux | null | undefined): string {
  if (!m || !OU[m.cote]) {
    return `${n} mur${n > 1 ? 's' : ''} mal vu${n > 1 ? 's' : ''} · repassez lentement dessus`;
  }
  const ou = `${OU[m.cote]} (${metres(m.longueur)}, à ${Math.max(1, Math.round(m.distance))} m)`;
  return n > 1 ? `${n} murs mal vus · le plus proche ${ou}` : `Le mur ${ou} est mal vu · repassez lentement dessus`;
}
