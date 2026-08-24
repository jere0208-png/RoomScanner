/**
 * QUAND UN DOIGT GLISSE, ET QUAND IL TAPE.
 *
 * Un tap n'est jamais immobile. Une main qui vise dérive de deux à six
 * points, et davantage debout, en marchant, ou avec des gants de chantier —
 * c'est-à-dire dans toutes les conditions où l'on se sert de cette
 * application. Le système d'exploitation le sait : iOS ne déclare un
 * glissement qu'à DIX POINTS de translation, Android à huit
 * (`ViewConfiguration.touchSlop`).
 *
 * L'app, elle, en comptait quatre — et pas en distance : en somme des deux
 * axes. Trois points de tremblement sur chaque axe font six, et le geste
 * partait. On tapait une pièce pour la choisir, et on la déplaçait de cinq
 * centimètres ; on tapait un mur, et le plan se mettait à glisser sous le
 * doigt. Le défaut ne se voit pas à la lecture du code : il se voit au
 * doigt, et il se mesure ici.
 *
 * LA SOMME DES AXES N'EST PAS UNE DISTANCE. |dx| + |dy| vaut jusqu'à une
 * fois et demie la vraie distance — un même geste en diagonale déclenchait
 * donc plus tôt qu'un geste droit, ce que personne n'a jamais demandé.
 */

/**
 * Ce qu'il faut parcourir pour qu'un appui devienne un glissement (points).
 *
 * Dix, comme iOS. C'est le seul chiffre de ce fichier, et il vaut pour tous
 * les gestes de l'app : le plan qu'on promène, la pièce qu'on tire, la
 * maquette qu'on tourne. Un seuil par endroit, c'est un endroit qui tremble
 * plus que les autres sans que personne sache pourquoi.
 */
export const GLISSEMENT_MIN = 10;

/** Le doigt a-t-il vraiment glissé ? */
export function estUnGlissement(dx: number, dy: number, seuil = GLISSEMENT_MIN) {
  return Math.hypot(dx, dy) > seuil;
}

/**
 * Le doigt a-t-il TAPÉ ?
 *
 * C'est exactement le contraire d'un glissement, et ce n'est pas un détail
 * d'écriture : deux seuils différents laisseraient entre eux une zone morte
 * où le geste ne serait ni l'un ni l'autre — le doigt se lève, et il ne se
 * passe rien du tout.
 */
export function estUnTap(dx: number, dy: number, seuil = GLISSEMENT_MIN) {
  return !estUnGlissement(dx, dy, seuil);
}

/**
 * LE VERROU DU SLOP — pour les gestes qui prennent la main dès l'appui.
 *
 * Une poignée sait qu'on la vise : elle s'empare du toucher au POSER, sans
 * attendre un mouvement. Rien ne la protège donc du tremblement — et
 * appliquer le déplacement dès le premier pixel, c'est déplacer le meuble de
 * cinq centimètres à chaque fois qu'on le tape pour le choisir.
 *
 * Ce petit verrou reste fermé tant que le doigt n'a pas franchi le seuil, et
 * ne se referme plus ensuite : un geste qui revient sur ses pas continue de
 * suivre le doigt, comme il se doit.
 *
 * ON N'EFFACE PAS LA COURSE UNE FOIS LE SEUIL PASSÉ. Le déplacement rendu
 * est celui du doigt depuis l'appui, dix points compris — l'objet rattrape
 * donc son retard d'un coup, exactement comme le fait iOS. L'autre école
 * (repartir de zéro au franchissement) ne saute pas, mais laisse l'objet
 * en retard de dix points sur le doigt pour toujours : dans une application
 * où l'on relève des cotes, dix points valent dix centimètres.
 */
export function creerSeuil(seuil = GLISSEMENT_MIN) {
  let ouvert = false;
  return {
    /** À chaque nouvelle prise : le verrou se referme. */
    reprendre() {
      ouvert = false;
    },
    /** Le doigt a-t-il assez bougé pour qu'on applique son geste ? */
    franchi(dx: number, dy: number) {
      if (!ouvert && estUnGlissement(dx, dy, seuil)) ouvert = true;
      return ouvert;
    },
  };
}
