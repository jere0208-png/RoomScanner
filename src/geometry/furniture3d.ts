/**
 * Le volume d'un meuble, en pièces — ET EN MATIÈRES.
 *
 * Une boîte grise ne dit pas si on regarde un lit ou un frigo, et c'est bien
 * ce qu'on voyait : le modèle 3D était juste, et illisible. Un meuble se
 * reconnaît pourtant à trois traits — le sommier et son dosseret, le dossier
 * et les accoudoirs d'un canapé, le plateau et les pieds d'une table.
 *
 * DEPUIS LA MISE EN AMBIANCE, CHAQUE PIÈCE PORTE SA MATIÈRE — relevé du
 * patron : « des textures réalistes au 3D. Coussins blancs pour un lit,
 * sommier bois, support bois, couverture neutre blanc cassé/beige.. fais
 * tous les mobiliers dans ce style. Ils ne servent pas à redécorer mais à
 * imaginer la pièce seulement. »
 *
 * C'est la panoplie du home staging, UN seul style pour tout le catalogue :
 * bois clair des supports, coussins et façades BLANC cassé, couverture et
 * tissus BEIGE/lin, électroménager blanc, sanitaires céramique, écrans
 * sombres. Pas de rouge, pas de motif : ces meubles servent à IMAGINER la
 * pièce, pas à la décorer — la scène (`scene3d`) traduit chaque matière en
 * teinte, et l'ombrage d'orientation fait le reste.
 *
 * Les cotes sont NORMALISÉES (0 à 1 sur chaque axe) : elles s'appliquent à
 * n'importe quelle taille. Le repère local est celui de l'emprise —
 * `x` la largeur, `y` la hauteur depuis le sol, `z` la profondeur, l'avant
 * du meuble en `z = 0`.
 */

/** Rôle de teinte : le rendu les décline dans la palette de la vue. */
export type FurnTone = 'body' | 'soft' | 'dark';

/** Les matières de la mise en ambiance : la scène les traduit en teintes. */
export type MatMeuble =
  | 'bois'
  | 'boisFonce'
  | 'blanc'
  | 'beige'
  | 'lin'
  | 'ceramique'
  | 'inox'
  | 'sombre'
  | 'verre'
  | 'feuillage';

export interface FurnPart {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  tone: FurnTone;
  /** La matière de CETTE pièce ; sans elle, le rôle de teinte décide. */
  mat?: MatMeuble;
}

const P = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  tone: FurnTone = 'body',
  mat?: MatMeuble,
): FurnPart => ({ x0, x1, y0, y1, z0, z1, tone, mat });

/** Quatre pieds aux coins, sur la hauteur donnée — bois foncé du support. */
const pieds = (haut: number, e = 0.06, mat: MatMeuble = 'boisFonce'): FurnPart[] => [
  P(0.02, 0.02 + e, 0, haut, 0.02, 0.02 + e, 'dark', mat),
  P(0.98 - e, 0.98, 0, haut, 0.02, 0.02 + e, 'dark', mat),
  P(0.02, 0.02 + e, 0, haut, 0.98 - e, 0.98, 'dark', mat),
  P(0.98 - e, 0.98, 0, haut, 0.98 - e, 0.98, 'dark', mat),
];

/** Caisson ouvert par le dessus : quatre parois et un fond. */
const cuve = (mur = 0.09, fond = 0.28, mat: MatMeuble = 'ceramique'): FurnPart[] => [
  P(0, mur, 0, 1, 0, 1, 'body', mat),
  P(1 - mur, 1, 0, 1, 0, 1, 'body', mat),
  P(mur, 1 - mur, 0, 1, 0, mur, 'body', mat),
  P(mur, 1 - mur, 0, 1, 1 - mur, 1, 'body', mat),
  P(mur, 1 - mur, 0, fond, mur, 1 - mur, 'soft', mat),
];

/** Deux portes de façade blanc cassé, et leurs poignées bois foncé. */
const portes = (y0 = 0.04, y1 = 0.96): FurnPart[] => [
  P(0.02, 0.49, y0, y1, -0.01, 0.03, 'soft', 'blanc'),
  P(0.51, 0.98, y0, y1, -0.01, 0.03, 'soft', 'blanc'),
  P(0.44, 0.47, (y0 + y1) / 2 - 0.08, (y0 + y1) / 2 + 0.08, -0.03, 0, 'dark', 'boisFonce'),
  P(0.53, 0.56, (y0 + y1) / 2 - 0.08, (y0 + y1) / 2 + 0.08, -0.03, 0, 'dark', 'boisFonce'),
];

/**
 * LE FIL DU BOIS : deux veines à peine plus foncées sur un plateau.
 *
 * C'est ce qui sépare « un rectangle beige » d'« un plateau de bois » — deux
 * pièces minces, pas une texture : le tri du peintre n'a rien de plus à
 * payer.
 */
const fil = (y: number, z0 = 0.08, z1 = 0.92): FurnPart[] => [
  P(0.3, 0.32, y, y + 0.004, z0, z1, 'dark', 'boisFonce'),
  P(0.66, 0.68, y, y + 0.004, z0, z1, 'dark', 'boisFonce'),
];

/**
 * Le meuble d'après sa catégorie (ou, plus précis, d'après son MODÈLE de
 * catalogue : une étagère à casiers est une grille, pas une boîte).
 *
 * Tableau vide = on garde la boîte pleine : c'est le bon dessin pour un
 * objet non identifié, et ça évite d'inventer une silhouette à ce qu'on ne
 * sait pas nommer.
 */
export function furnitureParts(category: string, modele?: string): FurnPart[] {
  const c = (category || '').toLowerCase();
  const m = (modele || '').toLowerCase();

  // ------------------------------------------------ les modèles du catalogue
  // Les plans enregistrés sous l'ancien catalogue gardent leur silhouette :
  // les clés d'hier sont des alias des formes d'aujourd'hui.
  if (m.startsWith('casiers') || m.startsWith('kallax')) {
    const n = m.includes('4') ? 4 : 2;
    const cadre = 0.05;
    const out: FurnPart[] = [
      P(0, 1, 0, 1, 0.82, 1, 'body', 'bois'),
      P(0, cadre, 0, 1, 0, 1, 'body', 'bois'),
      P(1 - cadre, 1, 0, 1, 0, 1, 'body', 'bois'),
      P(0, 1, 1 - cadre, 1, 0, 1, 'body', 'bois'),
      P(0, 1, 0, cadre, 0, 1, 'body', 'bois'),
    ];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      out.push(P(t - 0.015, t + 0.015, cadre, 1 - cadre, 0, 0.95, 'soft', 'bois'));
      out.push(P(cadre, 1 - cadre, t - 0.015, t + 0.015, 0, 0.95, 'soft', 'bois'));
    }
    return out;
  }
  if (m.startsWith('biblio') || m.startsWith('billy')) {
    const out: FurnPart[] = [
      P(0, 1, 0, 1, 0.85, 1, 'body', 'bois'),
      P(0, 0.05, 0, 1, 0, 1, 'body', 'bois'),
      P(0.95, 1, 0, 1, 0, 1, 'body', 'bois'),
      P(0, 1, 0.96, 1, 0, 1, 'body', 'bois'),
      P(0, 1, 0, 0.04, 0, 1, 'body', 'bois'),
    ];
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      out.push(P(0.05, 0.95, t - 0.012, t + 0.012, 0.05, 0.95, 'soft', 'bois'));
    }
    return out;
  }
  if (m.startsWith('armoire2p') || m.startsWith('dressing') || m.startsWith('pax')) {
    return [
      P(0, 1, 0, 1, 0.06, 1, 'body', 'bois'),
      P(0.01, 0.99, 0, 0.02, 0.03, 1, 'dark', 'boisFonce'),
      ...portes(0.02, 0.98),
    ];
  }
  if (m.startsWith('tablebasse') || m.startsWith('boutcanape') || m.startsWith('lack')) {
    return [P(0, 1, 0.88, 1, 0, 1, 'soft', 'bois'), ...fil(1.0), ...pieds(0.88, 0.1)];
  }
  if (m.startsWith('tapis')) {
    // Un aplat de lin et son liseré beige : il pose l'échelle d'un salon.
    return [
      P(0, 1, 0, 1, 0, 1, 'soft', 'lin'),
      P(0.03, 0.97, 0.98, 1.02, 0.03, 0.97, 'soft', 'beige'),
    ];
  }
  if (m.startsWith('portemanteau')) {
    return [
      P(0.42, 0.58, 0, 0.06, 0.42, 0.58, 'dark', 'boisFonce'),
      P(0.47, 0.53, 0.06, 0.96, 0.47, 0.53, 'body', 'bois'),
      // Les patères, en croix au sommet.
      P(0.2, 0.8, 0.9, 0.94, 0.47, 0.53, 'body', 'bois'),
      P(0.47, 0.53, 0.9, 0.94, 0.2, 0.8, 'body', 'bois'),
    ];
  }
  if (m.startsWith('miroir')) {
    return [
      P(0, 1, 0, 1, 0, 0.6, 'body', 'bois'),
      P(0.06, 0.94, 0.04, 0.96, 0.6, 1, 'soft', 'verre'),
    ];
  }

  // ------------------------------------------------------- les catégories
  if (c.includes('bed')) {
    /*
      LE LIT DE LA MISE EN AMBIANCE, mot pour mot : sommier BOIS, matelas
      blanc, couverture BEIGE tirée sur les deux tiers, deux oreillers
      BLANCS contre la tête de lit — elle aussi en bois, plus haute que le
      couchage (un dosseret à 55 cm ne se voit pas ; à 1,6 fois la hauteur
      on retrouve un vrai dosseret). Le sommier s'arrête AVANT la tête :
      deux volumes qui se traversent ne peuvent être ordonnés par aucun tri
      du peintre.
    */
    /*
      L'EMPILEMENT EST STRICT — la loi des silhouettes : aucune pièce n'en
      traverse une autre, le tri du peintre ne sait pas les départager. La
      couverture se POSE sur le matelas (0,66 → 0,74) et s'arrête AVANT les
      oreillers ; les oreillers se posent sur le matelas nu, contre la tête.
    */
    return [
      P(0.04, 0.96, 0, 0.4, 0.05, 0.92, 'body', 'bois'),
      P(0.02, 0.98, 0.4, 0.66, 0.03, 0.92, 'soft', 'blanc'),
      P(0, 1, 0.66, 0.74, 0.3, 0.68, 'soft', 'beige'),
      P(0.07, 0.47, 0.66, 0.84, 0.72, 0.9, 'soft', 'blanc'),
      P(0.53, 0.93, 0.66, 0.84, 0.72, 0.9, 'soft', 'blanc'),
      P(0, 1, 0, 1.6, 0.93, 1, 'body', 'bois'),
    ];
  }

  if (c.includes('sofa') || c.includes('couch')) {
    // Assise lin, coussins blanc cassé, structure lin sur patins bois :
    // un canapé se reconnaît à ses coussins autant qu'à sa forme.
    return [
      P(0, 1, 0.06, 0.45, 0.08, 1, 'body', 'lin'),
      P(0.15, 0.49, 0.45, 0.66, 0.12, 0.82, 'soft', 'blanc'),
      P(0.51, 0.85, 0.45, 0.66, 0.12, 0.82, 'soft', 'blanc'),
      P(0, 1, 0.45, 1, 0.84, 1, 'body', 'lin'),
      P(0, 0.13, 0.45, 0.8, 0.04, 0.82, 'body', 'lin'),
      P(0.87, 1, 0.45, 0.8, 0.04, 0.82, 'body', 'lin'),
      ...pieds(0.06, 0.08),
    ];
  }

  if (c.includes('chair') || c.includes('stool')) {
    return [
      P(0.06, 0.94, 0.42, 0.54, 0.06, 0.94, 'soft', 'lin'),
      P(0.06, 0.94, 0.54, 1, 0.84, 0.94, 'body', 'bois'),
      ...pieds(0.42, 0.08),
    ];
  }

  if (c.includes('table') || c.includes('desk')) {
    return [P(0, 1, 0.93, 1, 0, 1, 'soft', 'bois'), ...fil(1.0), ...pieds(0.93, 0.08)];
  }

  if (c.includes('television') || c === 'tv') {
    // Une télé se fixe AU MUR : plus de pied ni de socle. La dalle occupe
    // toute l'épaisseur, l'écran est un verre sombre.
    return [
      P(0, 1, 0, 1, 0, 0.75, 'dark', 'sombre'),
      P(0.3, 0.7, 0.28, 0.72, 0.75, 1, 'body', 'sombre'),
    ];
  }

  if (c.includes('refrigerator') || c.includes('fridge')) {
    return [
      P(0, 1, 0, 1, 0.04, 1, 'body', 'blanc'),
      P(0.02, 0.98, 0.36, 0.98, -0.01, 0.03, 'soft', 'blanc'),
      P(0.02, 0.98, 0.02, 0.34, -0.01, 0.03, 'soft', 'blanc'),
      P(0.86, 0.9, 0.45, 0.9, -0.03, 0, 'dark', 'inox'),
      P(0.86, 0.9, 0.08, 0.28, -0.03, 0, 'dark', 'inox'),
    ];
  }

  if (c.includes('stove') || c.includes('oven') || c.includes('cooktop')) {
    return [
      P(0, 1, 0, 0.94, 0.04, 1, 'body', 'blanc'),
      P(0, 1, 0.94, 1, 0, 1, 'soft', 'blanc'),
      P(0.12, 0.42, 1, 1.02, 0.14, 0.44, 'dark', 'sombre'),
      P(0.58, 0.88, 1, 1.02, 0.14, 0.44, 'dark', 'sombre'),
      P(0.12, 0.42, 1, 1.02, 0.56, 0.86, 'dark', 'sombre'),
      P(0.58, 0.88, 1, 1.02, 0.56, 0.86, 'dark', 'sombre'),
      P(0.04, 0.96, 0.08, 0.72, -0.01, 0.03, 'soft', 'verre'),
      P(0.1, 0.9, 0.76, 0.82, -0.03, 0, 'dark', 'inox'),
    ];
  }

  if (c.includes('dishwasher') || c.includes('washer') || c.includes('dryer')) {
    const hublot = c.includes('washer') || c.includes('dryer');
    return [
      P(0, 1, 0, 1, 0.04, 1, 'body', 'blanc'),
      P(0.03, 0.97, 0.04, 0.96, -0.01, 0.03, 'soft', 'blanc'),
      hublot
        ? P(0.24, 0.76, 0.3, 0.74, -0.03, -0.015, 'dark', 'verre')
        : P(0.1, 0.9, 0.84, 0.9, -0.03, -0.015, 'dark', 'inox'),
    ];
  }

  if (c.includes('sink')) {
    return [
      // Plan bois, meuble blanc cassé, cuve céramique, robinet inox.
      P(0, 1, 0.86, 1, 0, 1, 'soft', 'bois'),
      P(0, 1, 0, 0.86, 0.04, 1, 'body', 'blanc'),
      P(0.16, 0.84, 1, 1.04, 0.14, 0.8, 'dark', 'ceramique'),
      P(0.46, 0.54, 1, 1.35, 0.84, 0.92, 'dark', 'inox'),
    ];
  }

  if (c.includes('toilet')) {
    return [
      P(0.22, 0.78, 0, 0.62, 0, 0.74, 'body', 'ceramique'),
      P(0.18, 0.82, 0.62, 0.7, 0, 0.72, 'soft', 'blanc'),
      P(0.14, 0.86, 0.28, 1, 0.74, 1, 'body', 'ceramique'),
    ];
  }

  if (c.includes('bathtub') || c.includes('shower')) {
    return cuve(0.09, c.includes('shower') ? 0.08 : 0.3, 'ceramique');
  }

  if (c.includes('storage') || c.includes('cabinet') || c.includes('wardrobe')) {
    return [P(0, 1, 0, 1, 0.03, 1, 'body', 'bois'), ...portes()];
  }

  /*
    L'ESCALIER : ses marches, et non un bloc. Douze marches se lisent
    immédiatement — et elles disent le sens de la montée.
  */
  if (c.includes('stair')) {
    const marches: FurnPart[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      marches.push(
        P(0, 1, t, t + 1 / n, t, Math.min(1, t + 1.6 / n), i % 2 ? 'soft' : 'body', i % 2 ? 'bois' : 'boisFonce'),
      );
    }
    return marches;
  }

  /* La cheminée : son âtre, son manteau et son conduit. */
  if (c.includes('fireplace')) {
    return [
      P(0, 1, 0, 0.62, 0, 1, 'body', 'blanc'),
      P(0.18, 0.82, 0.1, 0.58, -0.03, -0.01, 'dark', 'sombre'),
      P(-0.04, 1.04, 0.62, 0.72, -0.06, 1, 'soft', 'bois'),
      P(0.24, 0.76, 0.72, 1.35, 0.12, 0.88, 'body', 'blanc'),
    ];
  }

  if (c.includes('plant')) {
    return [
      P(0.32, 0.68, 0, 0.34, 0.32, 0.68, 'dark', 'boisFonce'),
      P(0.12, 0.88, 0.34, 1, 0.12, 0.88, 'soft', 'feuillage'),
    ];
  }

  return [];
}
