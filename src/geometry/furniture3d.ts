/**
 * Le volume d'un meuble, en pièces.
 *
 * Une boîte grise ne dit pas si on regarde un lit ou un frigo, et c'est bien
 * ce qu'on voyait : le modèle 3D était juste, et illisible. Un meuble se
 * reconnaît pourtant à trois traits — le sommier et son dosseret, le dossier
 * et les accoudoirs d'un canapé, le plateau et les pieds d'une table. On les
 * pose donc, et pas plus : ce sont des repères, pas du mobilier de catalogue,
 * et chaque boîte ajoutée coûte quatre faces à trier.
 *
 * Les cotes sont NORMALISÉES (0 à 1 sur chaque axe) : elles s'appliquent à
 * n'importe quelle taille. Le repère local est celui de l'emprise —
 * `x` la largeur, `y` la hauteur depuis le sol, `z` la profondeur, l'avant
 * du meuble en `z = 0`.
 */

/** Rôle de teinte : le rendu les décline dans la palette de la vue. */
export type FurnTone = 'body' | 'soft' | 'dark';

export interface FurnPart {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  tone: FurnTone;
}

const P = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  tone: FurnTone = 'body',
): FurnPart => ({ x0, x1, y0, y1, z0, z1, tone });

/** Quatre pieds aux coins, sur la hauteur donnée. */
const pieds = (haut: number, e = 0.06): FurnPart[] => [
  P(0.02, 0.02 + e, 0, haut, 0.02, 0.02 + e, 'dark'),
  P(0.98 - e, 0.98, 0, haut, 0.02, 0.02 + e, 'dark'),
  P(0.02, 0.02 + e, 0, haut, 0.98 - e, 0.98, 'dark'),
  P(0.98 - e, 0.98, 0, haut, 0.98 - e, 0.98, 'dark'),
];

/** Caisson ouvert par le dessus : quatre parois et un fond. */
const cuve = (mur = 0.09, fond = 0.28): FurnPart[] => [
  P(0, mur, 0, 1, 0, 1),
  P(1 - mur, 1, 0, 1, 0, 1),
  P(mur, 1 - mur, 0, 1, 0, mur),
  P(mur, 1 - mur, 0, 1, 1 - mur, 1),
  P(mur, 1 - mur, 0, fond, mur, 1 - mur, 'soft'),
];

/** Deux portes de façade et leurs poignées. */
const portes = (y0 = 0.04, y1 = 0.96): FurnPart[] => [
  P(0.02, 0.49, y0, y1, -0.01, 0.03, 'soft'),
  P(0.51, 0.98, y0, y1, -0.01, 0.03, 'soft'),
  P(0.44, 0.47, (y0 + y1) / 2 - 0.08, (y0 + y1) / 2 + 0.08, -0.03, 0, 'dark'),
  P(0.53, 0.56, (y0 + y1) / 2 - 0.08, (y0 + y1) / 2 + 0.08, -0.03, 0, 'dark'),
];

/**
 * Le meuble d'après sa catégorie RoomPlan (ou celle du catalogue).
 *
 * Tableau vide = on garde la boîte pleine : c'est le bon dessin pour un
 * escalier ou un objet non identifié, et ça évite d'inventer une silhouette
 * à ce qu'on ne sait pas nommer.
 */
export function furnitureParts(category: string, modele?: string): FurnPart[] {
  const c = (category || '').toLowerCase();

  /*
    LES RÉFÉRENCES ICONIQUES ONT LEUR SILHOUETTE À ELLES — relevé du
    patron : « l'ajout réaliste de meubles depuis un catalogue de mobiliers
    existants réellement ». Un KALLAX est une GRILLE de casiers, un BILLY
    une colonne d'étagères, un PAX deux hautes portes : trois « storage »
    au catalogue, trois meubles qu'on reconnaît de l'autre bout de la
    pièce. Le modèle voyage avec le meuble posé (`ObjectData.modele`) ;
    un meuble relevé au scan n'en a pas, et garde la silhouette de sa
    catégorie.
  */
  const m = (modele || '').toLowerCase();
  if (m.startsWith('kallax')) {
    const n = m.includes('44') ? 4 : 2;
    const cadre = 0.05;
    const out: FurnPart[] = [
      // Le caisson : fond, flancs, dessus, dessous.
      P(0, 1, 0, 1, 0.82, 1),
      P(0, cadre, 0, 1, 0, 1),
      P(1 - cadre, 1, 0, 1, 0, 1),
      P(0, 1, 1 - cadre, 1, 0, 1),
      P(0, 1, 0, cadre, 0, 1),
    ];
    // Les croisillons : la grille qui fait le KALLAX.
    for (let i = 1; i < n; i++) {
      const t = i / n;
      out.push(P(t - 0.015, t + 0.015, cadre, 1 - cadre, 0, 0.95, 'soft'));
      out.push(P(cadre, 1 - cadre, t - 0.015, t + 0.015, 0, 0.95, 'soft'));
    }
    return out;
  }
  if (m.startsWith('billy')) {
    const out: FurnPart[] = [
      P(0, 1, 0, 1, 0.85, 1),
      P(0, 0.05, 0, 1, 0, 1),
      P(0.95, 1, 0, 1, 0, 1),
      P(0, 1, 0.96, 1, 0, 1),
      P(0, 1, 0, 0.04, 0, 1),
    ];
    // Cinq étagères, la signature de la colonne.
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      out.push(P(0.05, 0.95, t - 0.012, t + 0.012, 0.05, 0.95, 'soft'));
    }
    return out;
  }
  if (m.startsWith('pax')) {
    // Le caisson, son socle, et deux portes pleine hauteur : la haute
    // armoire se reconnaît à sa façade d'un seul tenant.
    return [
      P(0, 1, 0, 1, 0.06, 1),
      P(0.01, 0.99, 0, 0.02, 0.03, 1, 'dark'),
      ...portes(0.02, 0.98),
    ];
  }
  if (m.startsWith('lack')) {
    // Le plateau épais et ses quatre pieds carrés : la table LACK.
    return [P(0, 1, 0.88, 1, 0, 1, 'soft'), ...pieds(0.88, 0.1)];
  }

  if (c.includes('bed')) {
    return [
      // Sommier, matelas débordant, deux oreillers, tête de lit.
      //
      // La tête MONTE plus haut que le meuble : la hauteur d'un lit, au
      // catalogue, est celle du couchage — 55 cm — et un dosseret à 55 cm
      // ne se voit pas. À 1,6 fois cette hauteur on retrouve les 90 cm
      // d'un vrai dosseret, et le lit se reconnaît du premier coup d'œil.
      // Le sommier s'arrête AVANT la tête de lit : deux volumes qui se
      // traversent ne peuvent être ordonnés par aucun tri du peintre.
      P(0.04, 0.96, 0, 0.4, 0.05, 0.92),
      P(0, 1, 0.4, 0.76, 0, 0.92, 'soft'),
      P(0.07, 0.47, 0.76, 0.92, 0.68, 0.9, 'soft'),
      P(0.53, 0.93, 0.76, 0.92, 0.68, 0.9, 'soft'),
      P(0, 1, 0, 1.6, 0.93, 1),
    ];
  }

  if (c.includes('sofa') || c.includes('couch')) {
    // Assise, coussins, dossier, accoudoirs : un canapé se reconnaît à ses
    // coussins autant qu'à sa forme — c'est ce qui le distingue d'un banc.
    return [
      P(0, 1, 0, 0.45, 0.08, 1),
      // Deux coussins d'assise, séparés d'un doigt.
      // Ils s'arrêtent au nu du dossier (0,84) et à celui des accoudoirs.
      P(0.15, 0.49, 0.45, 0.66, 0.12, 0.82, 'soft'),
      P(0.51, 0.85, 0.45, 0.66, 0.12, 0.82, 'soft'),
      P(0, 1, 0.45, 1, 0.84, 1),
      P(0, 0.13, 0.45, 0.8, 0.04, 0.82),
      P(0.87, 1, 0.45, 0.8, 0.04, 0.82),
    ];
  }

  if (c.includes('chair') || c.includes('stool')) {
    return [
      P(0.06, 0.94, 0.42, 0.54, 0.06, 0.94, 'soft'),
      P(0.06, 0.94, 0.54, 1, 0.84, 0.94),
      ...pieds(0.42, 0.08),
    ];
  }

  if (c.includes('table') || c.includes('desk')) {
    return [P(0, 1, 0.93, 1, 0, 1, 'soft'), ...pieds(0.93, 0.08)];
  }

  if (c.includes('television') || c === 'tv') {
    // Une télé se fixe AU MUR : plus de pied ni de socle. Presque toutes le
    // sont aujourd'hui, et un pied dessiné sous un écran accroché à 1,10 m
    // ne décrit rien de réel. La dalle occupe toute l'épaisseur — 8 cm — et
    // la patine murale se devine derrière.
    return [
      P(0, 1, 0, 1, 0, 0.75, 'dark'),
      P(0.3, 0.7, 0.28, 0.72, 0.75, 1),
    ];
  }

  if (c.includes('refrigerator') || c.includes('fridge')) {
    return [
      P(0, 1, 0, 1, 0.04, 1),
      // Deux portes superposées, congélateur en bas, et leurs poignées.
      P(0.02, 0.98, 0.36, 0.98, -0.01, 0.03, 'soft'),
      P(0.02, 0.98, 0.02, 0.34, -0.01, 0.03, 'soft'),
      P(0.86, 0.9, 0.45, 0.9, -0.03, 0, 'dark'),
      P(0.86, 0.9, 0.08, 0.28, -0.03, 0, 'dark'),
    ];
  }

  if (c.includes('stove') || c.includes('oven') || c.includes('cooktop')) {
    return [
      P(0, 1, 0, 0.94, 0.04, 1),
      P(0, 1, 0.94, 1, 0, 1, 'soft'),
      // Quatre feux, à peine en relief.
      P(0.12, 0.42, 1, 1.02, 0.14, 0.44, 'dark'),
      P(0.58, 0.88, 1, 1.02, 0.14, 0.44, 'dark'),
      P(0.12, 0.42, 1, 1.02, 0.56, 0.86, 'dark'),
      P(0.58, 0.88, 1, 1.02, 0.56, 0.86, 'dark'),
      // Porte du four et sa barre.
      P(0.04, 0.96, 0.08, 0.72, -0.01, 0.03, 'soft'),
      P(0.1, 0.9, 0.76, 0.82, -0.03, 0, 'dark'),
    ];
  }

  if (c.includes('dishwasher') || c.includes('washer') || c.includes('dryer')) {
    const hublot = c.includes('washer') || c.includes('dryer');
    return [
      P(0, 1, 0, 1, 0.04, 1),
      P(0.03, 0.97, 0.04, 0.96, -0.01, 0.03, 'soft'),
      hublot
        ? P(0.24, 0.76, 0.3, 0.74, -0.03, -0.015, 'dark')
        : P(0.1, 0.9, 0.84, 0.9, -0.03, -0.015, 'dark'),
    ];
  }

  if (c.includes('sink')) {
    return [
      // Plan de travail, cuve creusée dedans, robinet au fond.
      P(0, 1, 0.86, 1, 0, 1, 'soft'),
      P(0, 1, 0, 0.86, 0.04, 1),
      // La cuve se POSE sur le plan de travail : on ne peut pas la creuser
      // dedans — un volume évidé dans un autre est indécidable au tri, et
      // c'est ce qui faisait clignoter les pièces d'un meuble selon l'angle.
      P(0.16, 0.84, 1, 1.04, 0.14, 0.8, 'dark'),
      P(0.46, 0.54, 1, 1.35, 0.84, 0.92, 'dark'),
    ];
  }

  if (c.includes('toilet')) {
    return [
      P(0.22, 0.78, 0, 0.62, 0, 0.74),
      P(0.18, 0.82, 0.62, 0.7, 0, 0.72, 'soft'),
      P(0.14, 0.86, 0.28, 1, 0.74, 1),
    ];
  }

  if (c.includes('bathtub') || c.includes('shower')) {
    return cuve(0.09, c.includes('shower') ? 0.08 : 0.3);
  }

  if (c.includes('storage') || c.includes('cabinet') || c.includes('wardrobe')) {
    return [P(0, 1, 0, 1, 0.03, 1), ...portes()];
  }

  /*
    L'ESCALIER : ses marches, et non un bloc.

    Le catalogue le laissait en boîte pleine — « le bon dessin pour un
    escalier », disait le commentaire. C'est faux dès qu'on regarde le modèle :
    un parallélépipède de deux mètres au milieu d'un séjour ne ressemble à
    rien, et le client ne le reconnaît pas. Douze marches, elles, se lisent
    immédiatement — et elles disent le sens de la montée.
  */
  if (c.includes('stair')) {
    const marches: FurnPart[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      marches.push(P(0, 1, t, t + 1 / n, t, Math.min(1, t + 1.6 / n), i % 2 ? 'soft' : 'body'));
    }
    return marches;
  }

  /*
    LA CHEMINÉE : son âtre, son manteau et son conduit.
  */
  if (c.includes('fireplace')) {
    return [
      // Le corps s'arrête sous le manteau, et le foyer est une plaque
      // sombre EN FAÇADE : un foyer creusé dans le corps serait un volume
      // évidé dans un autre — indécidable au tri.
      P(0, 1, 0, 0.62, 0, 1),
      P(0.18, 0.82, 0.1, 0.58, -0.03, -0.01, 'dark'),
      // Le manteau, en saillie.
      P(-0.04, 1.04, 0.62, 0.72, -0.06, 1, 'soft'),
      // Le conduit, plus étroit.
      P(0.24, 0.76, 0.72, 1.35, 0.12, 0.88),
    ];
  }

  if (c.includes('plant')) {
    return [
      P(0.32, 0.68, 0, 0.34, 0.32, 0.68, 'dark'),
      P(0.12, 0.88, 0.34, 1, 0.12, 0.88, 'soft'),
    ];
  }

  return [];
}
