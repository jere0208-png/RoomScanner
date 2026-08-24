/**
 * LE GLYPHE DU SCAN — le cadre à quatre coins et sa ligne qui balaye.
 *
 * On voulait, pour « Scanner un plan papier », l'icône que tout le monde
 * reconnaît sans légende : quatre équerres et un trait qui passe. Le modèle
 * est une animation Lottie libre (« Scan », de Madhu, licence Lottie Simple)
 * ; on ne l'EMBARQUE pas — l'app n'a pas de lecteur Lottie et ne va pas en
 * gagner un pour douze pixels de trait. On l'a donc LUE : 480 × 480, 60
 * images par seconde, 121 images, deux couches, et on la rejoue ici avec ce
 * que l'app a déjà — un `Path` de react-native-svg pour le cadre, une vue
 * animée pour la ligne.
 *
 * Ce fichier ne porte QUE la mesure et le mouvement, sans une ligne de
 * React : c'est ce qui permet de vérifier le geste dans un banc, et de
 * redessiner la planche de contrôle sans lancer l'app.
 *
 * TOUT EST EN FRACTION DU CÔTÉ. L'original mesure ses traits en pixels d'un
 * carré de 480 ; nous, on pose l'icône à 28 points dans une barre et à 120
 * sur un écran d'accueil. Une valeur en dur aurait donné un trait de douze
 * pixels sur une icône de vingt-huit.
 */

/** Durée d'un tour complet (ms) : les 121 images à 60 par seconde. */
export const DUREE_SCAN = (121 / 60) * 1000;

/**
 * Les mesures du dessin, en fraction du côté.
 *
 * Relevées sur l'original : le cadre fait 204 px de côté dans un carré de
 * 480 (0,425), ses coins s'arrondissent sur 24 px (0,05) et chaque équerre
 * garde 24 px de bras droit après l'arrondi. Le trait fait 12 px (0,025) —
 * le même pour le cadre et pour la ligne.
 */
export const MESURES = {
  cote: 204 / 480,
  rayon: 24 / 480,
  bras: 24 / 480,
  trait: 12 / 480,
  /** Course de la ligne, de part et d'autre du centre. */
  course: 60 / 480,
  /** Longueur de la ligne au repos, puis pendant le balayage. */
  deployee: 0.95,
  repliee: 0.59,
} as const;

/**
 * Le chemin des quatre équerres, prêt pour un `Path`.
 *
 * Quatre sous-chemins ouverts, jamais fermés : ce sont des coins, pas un
 * rectangle. L'original les dessine avec des Béziers dont les tangentes
 * valent exactement 0,5523 × rayon — autrement dit un quart de cercle, et
 * c'est un arc SVG qu'on écrit, plus court et exact au lieu d'approché.
 */
export function cheminDuCadre(taille: number): string {
  const c = taille / 2;
  const s = MESURES.cote * taille * 0.5;
  const r = MESURES.rayon * taille;
  const b = MESURES.bras * taille;
  const n = (v: number) => Number(v.toFixed(3));
  // Bords du cadre et points d'attaque des arrondis.
  const g = n(c - s);
  const d = n(c + s);
  const gr = n(c - s + r);
  const dr = n(c + s - r);
  const grb = n(c - s + r + b);
  const drb = n(c + s - r - b);
  return [
    `M ${grb} ${g} H ${gr} A ${n(r)} ${n(r)} 0 0 0 ${g} ${gr} V ${grb}`,
    `M ${drb} ${g} H ${dr} A ${n(r)} ${n(r)} 0 0 1 ${d} ${gr} V ${grb}`,
    `M ${grb} ${d} H ${gr} A ${n(r)} ${n(r)} 0 0 1 ${g} ${dr} V ${drb}`,
    `M ${drb} ${d} H ${dr} A ${n(r)} ${n(r)} 0 0 0 ${d} ${dr} V ${drb}`,
  ].join(' ');
}

/** Une image clef : le temps (ms) et l'assouplissement pour y aller. */
interface Clef {
  t: number;
  v: number;
  /** Les deux points de contrôle de la courbe qui MÈNE à la clef suivante. */
  souple?: [number, number, number, number];
}

const img = (n: number) => (n / 60) * 1000;

/**
 * LE BALAYAGE, IMAGE PAR IMAGE.
 *
 * Deux gestes menés de front, et c'est tout le sel de l'original : la ligne
 * se RÉTRACTE avant de partir (95 % → 59 % de sa longueur), balaye vers le
 * haut, redescend d'un trait, revient au centre, et ne se redéploie qu'une
 * fois immobile. Elle a l'air de prendre son élan.
 *
 * Les temps sont ceux du fichier source, convertis en millisecondes : la
 * rétraction de l'image 10 à 30, la montée de 30 à 50, la descente jusqu'à
 * 70, le retour au centre à 91, le redéploiement jusqu'à 110, et onze
 * images de repos avant de reboucler.
 */
const LONGUEUR: Clef[] = [
  { t: 0, v: MESURES.deployee },
  { t: img(10), v: MESURES.deployee, souple: [0.404, 0.017, 0.722, 0.981] },
  { t: img(30), v: MESURES.repliee },
  { t: img(91), v: MESURES.repliee, souple: [0.298, 0.001, 0.511, 0.992] },
  { t: img(110), v: MESURES.deployee },
  { t: DUREE_SCAN, v: MESURES.deployee },
];

/** Décalage vertical de la ligne, en fraction du côté (négatif = vers le haut). */
const COURSE: Clef[] = [
  { t: 0, v: 0 },
  { t: img(30), v: 0, souple: [0.468, 0, 0.521, 1] },
  { t: img(50), v: -MESURES.course, souple: [0.441, 0, 0.544, 1] },
  { t: img(70), v: MESURES.course, souple: [0.516, 0, 0.481, 1] },
  { t: img(91), v: 0 },
  { t: DUREE_SCAN, v: 0 },
];

/** Les images clefs, telles que le composant les enchaîne. */
export const ETAPES = { longueur: LONGUEUR, course: COURSE } as const;

/**
 * Ordonnée d'une courbe d'assouplissement pour une abscisse donnée.
 *
 * Bissection sur le paramètre : trente tours suffisent largement au
 * dix-millième, et cela évite d'embarquer une résolution de cubique dont
 * personne ne relirait le discriminant.
 */
function souplesse(
  x: number,
  [x1, y1, x2, y2]: [number, number, number, number],
): number {
  const bez = (a: number, b: number, u: number) => {
    const m = 1 - u;
    return 3 * m * m * u * a + 3 * m * u * u * b + u * u * u;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(x1, x2, mid) < x) lo = mid;
    else hi = mid;
  }
  return bez(y1, y2, (lo + hi) / 2);
}

function valeurAu(clefs: Clef[], ms: number): number {
  const t = ((ms % DUREE_SCAN) + DUREE_SCAN) % DUREE_SCAN;
  for (let i = clefs.length - 1; i >= 0; i--) {
    const k = clefs[i];
    if (t < k.t) continue;
    const suivante = clefs[i + 1];
    if (!suivante) return k.v;
    const part = (t - k.t) / (suivante.t - k.t);
    const p = k.souple ? souplesse(part, k.souple) : part;
    return k.v + (suivante.v - k.v) * p;
  }
  return clefs[0].v;
}

/**
 * Où en est la ligne à cet instant du tour : sa longueur (fraction de la
 * longueur déployée) et son décalage vertical (fraction du côté).
 *
 * Le temps reboucle de lui-même : on peut lui donner 5 000 ms.
 */
export function poseDeLaLigne(ms: number): { longueur: number; dy: number } {
  return { longueur: valeurAu(LONGUEUR, ms), dy: valeurAu(COURSE, ms) };
}
