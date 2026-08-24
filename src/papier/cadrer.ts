/**
 * TROUVER LE PLAN DANS LA PHOTO.
 *
 * On avait écrit tout le lecteur en supposant que la photo ne contenait QUE
 * le plan. Le premier essai sur le terrain a réglé la question : le plan
 * n'était pas sur une feuille, il était sur l'écran d'un ordinateur, et
 * c'est l'écran qui a été photographié — avec le bureau autour, les onglets
 * du navigateur en haut, la barre des tâches en bas. Le lecteur a cherché
 * des murs dans une fenêtre de navigateur, et le relevé rendu n'avait « rien
 * à voir » avec le plan.
 *
 * COMMENT ON RECONNAÎT UN DESSIN TECHNIQUE, SANS LE COMPRENDRE. Par sa
 * DENSITÉ D'ENCRE. Un plan couvre régulièrement sa zone de quelques pour
 * cent de traits : assez pour ne pas être du papier blanc, bien trop peu
 * pour être un aplat ou une photo. On découpe donc l'image en pavés, on
 * garde ceux qui ressemblent à du dessin, et l'on prend le plus grand
 * ensemble d'un seul tenant. Le reste — le noir du bureau, les blocs pleins
 * des onglets, le gris uniforme d'une barre — tombe de lui-même.
 *
 * ON GARDE UNE MARGE, ET C'EST ESSENTIEL : les lignes de cote courent À
 * L'EXTÉRIEUR de la maçonnerie, et ce sont elles qui portent l'échelle. Un
 * recadrage au plus juste couperait précisément ce qui donne les mètres.
 */
import type { Masque } from './image';

export interface Zone {
  x: number;
  y: number;
  l: number;
  h: number;
}

export interface ReglageCadre {
  /** Côté d'un pavé d'analyse (px). */
  bloc?: number;
  /** Part d'encre minimale d'un pavé pour qu'il compte comme dessiné. */
  minPart?: number;
  /**
   * Part maximale : au-delà, ce n'est plus un dessin au trait mais un aplat
   * — une bande d'interface, une zone saturée, une photo dans la photo.
   */
  maxPart?: number;
  /** Marge gardée autour, en part de la zone trouvée. */
  marge?: number;
}

/**
 * La zone de l'image qui porte le dessin, ou `null` si rien n'y ressemble.
 *
 * Rendre `null` est un résultat : l'appelant garde alors l'image entière,
 * ce qui est le bon comportement pour un plan qui remplit déjà le cadre.
 */
export function zoneDessinee(m: Masque, reglage: ReglageCadre = {}): Zone | null {
  const bloc = Math.max(8, reglage.bloc ?? Math.round(Math.min(m.l, m.h) / 40));
  const minPart = reglage.minPart ?? 0.015;
  const maxPart = reglage.maxPart ?? 0.6;
  const marge = reglage.marge ?? 0.06;
  const nx = Math.ceil(m.l / bloc);
  const ny = Math.ceil(m.h / bloc);
  if (nx < 3 || ny < 3) return null;

  const dessin = new Uint8Array(nx * ny);
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      let n = 0;
      let total = 0;
      for (let y = by * bloc; y < Math.min(m.h, (by + 1) * bloc); y++) {
        for (let x = bx * bloc; x < Math.min(m.l, (bx + 1) * bloc); x++) {
          total++;
          n += m.on[y * m.l + x];
        }
      }
      const part = total ? n / total : 0;
      dessin[by * nx + bx] = part >= minPart && part <= maxPart ? 1 : 0;
    }
  }

  /*
    UN DESSIN EST UNE ZONE, PAS UNE LIGNE.

    Le premier essai gardait tout bloc portant un peu d'encre, et prenait
    ensuite le plus grand ensemble d'un seul tenant. Sur la photo d'un
    écran, cet ensemble-là était LE CADRE DE LA FENÊTRE du navigateur :
    quatre lignes de blocs, chacune bien pourvue en encre, refermées et donc
    parfaitement connexes. Le lecteur recadrait sur la fenêtre et prenait son
    contour pour le pourtour du logement — sept mètres de large.

    Un dessin technique, lui, n'est pas une ligne mais une SURFACE : autour
    de n'importe lequel de ses points, on trouve d'autres traits — des murs,
    des cotes, des symboles. On ne garde donc un bloc que si son voisinage
    en compte assez d'autres. Une bordure de fenêtre n'a de voisins que sur
    sa propre ligne, et tombe.
  */
  const dense = new Uint8Array(nx * ny);
  const rayon = 2;
  const besoin = 7;
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      if (!dessin[by * nx + bx]) continue;
      let n = 0;
      for (let dy = -rayon; dy <= rayon; dy++) {
        for (let dx = -rayon; dx <= rayon; dx++) {
          const ax = bx + dx;
          const ay = by + dy;
          if (ax < 0 || ay < 0 || ax >= nx || ay >= ny) continue;
          n += dessin[ay * nx + ax];
        }
      }
      if (n >= besoin) dense[by * nx + bx] = 1;
    }
  }
  dessin.set(dense);

  /*
    LE PLUS GRAND ENSEMBLE D'UN SEUL TENANT, EN HUIT-CONNEXITÉ.

    Un plan est continu à l'échelle du pavé : ses murs, ses cotes et ses
    symboles se tiennent. Les parasites, eux, sont dispersés — une frange de
    moiré ici, un bout de barre là. La huit-connexité fait passer les
    diagonales : une pièce vide au milieu du plan ne coupe pas le lot en
    deux, parce que ses bords, eux, portent des traits.
  */
  const vu = new Uint8Array(nx * ny);
  let meilleur: { n: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  const pile: number[] = [];
  for (let d = 0; d < dessin.length; d++) {
    if (!dessin[d] || vu[d]) continue;
    pile.length = 0;
    pile.push(d);
    vu[d] = 1;
    let n = 0;
    let x0 = nx;
    let y0 = ny;
    let x1 = 0;
    let y1 = 0;
    while (pile.length) {
      const i = pile.pop() as number;
      const x = i % nx;
      const y = (i - x) / nx;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ax = x + dx;
          const ay = y + dy;
          if (ax < 0 || ay < 0 || ax >= nx || ay >= ny) continue;
          const j = ay * nx + ax;
          if (!dessin[j] || vu[j]) continue;
          vu[j] = 1;
          pile.push(j);
        }
      }
    }
    if (!meilleur || n > meilleur.n) meilleur = { n, x0, y0, x1, y1 };
  }
  if (!meilleur || meilleur.n < 6) return null;

  const largeur = (meilleur.x1 - meilleur.x0 + 1) * bloc;
  const hauteur = (meilleur.y1 - meilleur.y0 + 1) * bloc;
  /*
    UNE ZONE QUI COUVRE PRESQUE TOUT NE VAUT PAS UN RECADRAGE.

    Sur une photo cadrée sur le plan — le cas nominal — le dessin occupe
    l'image entière. Recadrer alors ne ferait que rogner quelques pixels au
    hasard, et pourrait couper une ligne de cote. On s'abstient.
  */
  if (largeur > m.l * 0.9 && hauteur > m.h * 0.9) return null;

  const mx = largeur * marge;
  const my = hauteur * marge;
  const x = Math.max(0, Math.floor(meilleur.x0 * bloc - mx));
  const y = Math.max(0, Math.floor(meilleur.y0 * bloc - my));
  return {
    x,
    y,
    l: Math.min(m.l - x, Math.ceil(largeur + mx * 2)),
    h: Math.min(m.h - y, Math.ceil(hauteur + my * 2)),
  };
}

/** Découpe un masque sur une zone. */
export function recadrer(m: Masque, z: Zone): Masque {
  const out = { l: z.l, h: z.h, on: new Uint8Array(z.l * z.h) };
  for (let y = 0; y < z.h; y++) {
    for (let x = 0; x < z.l; x++) {
      out.on[y * z.l + x] = m.on[(y + z.y) * m.l + x + z.x];
    }
  }
  return out;
}
