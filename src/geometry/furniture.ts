/** Catégories de meubles détectées par RoomPlan, normalisées. */
export type FurnKind =
  | 'bed'
  | 'sofa'
  | 'tv'
  | 'table'
  | 'chair'
  | 'storage'
  | 'appliance'
  | 'stove'
  | 'fridge'
  | 'toilet'
  | 'bathtub'
  | 'sink'
  | 'stairs'
  | 'fireplace'
  | 'other';

export function furnKind(category: string): FurnKind {
  const c = category.toLowerCase();
  if (c.includes('bed')) return 'bed';
  if (c.includes('sofa') || c.includes('couch')) return 'sofa';
  if (c.includes('television') || c === 'tv') return 'tv';
  if (c.includes('table')) return 'table';
  if (c.includes('chair')) return 'chair';
  if (c.includes('storage')) return 'storage';
  // Trois familles d'appareils, trois symboles : ce qui chauffe, ce qui se
  // range, et ce qui tourne. Sur un plan de cuisine, c'est la différence
  // entre une suite de carrés et une pièce qu'on lit.
  if (c.includes('oven') || c.includes('stove') || c.includes('cooktop')) {
    return 'stove';
  }
  if (c.includes('refrigerator') || c.includes('fridge')) return 'fridge';
  if (
    c.includes('washer') ||
    c.includes('dryer') ||
    c.includes('dishwasher')
  ) {
    return 'appliance';
  }
  if (c.includes('toilet')) return 'toilet';
  if (c.includes('bathtub')) return 'bathtub';
  if (c.includes('sink')) return 'sink';
  if (c.includes('stairs')) return 'stairs';
  if (c.includes('fireplace')) return 'fireplace';
  return 'other';
}

const FR: Record<FurnKind, string> = {
  bed: 'Lit',
  sofa: 'Canapé',
  tv: 'Télévision',
  table: 'Table',
  chair: 'Chaise',
  storage: 'Rangement',
  appliance: 'Lave-linge',
  stove: 'Cuisinière',
  fridge: 'Réfrigérateur',
  toilet: 'WC',
  bathtub: 'Baignoire',
  sink: 'Évier',
  stairs: 'Escalier',
  fireplace: 'Cheminée',
  other: 'Objet',
};

// ------------------------------------------ à quoi sert cette pièce ?

/** Type de pièce déduit du mobilier qui s'y trouve. */
export type RoomKind =
  | 'kitchen'
  | 'bathroom'
  | 'wc'
  | 'bedroom'
  | 'living'
  | 'dining';

const ROOM_FR: Record<RoomKind, string> = {
  kitchen: 'Cuisine',
  bathroom: 'Salle de bains',
  wc: 'WC',
  bedroom: 'Chambre',
  living: 'Salon',
  dining: 'Salle à manger',
};

/**
 * Ce qu'un meuble dit de la pièce où il se trouve, et avec quelle force.
 *
 * Un réfrigérateur ou un lit tranchent à eux seuls ; une table ou un évier
 * ne font que pencher la balance — un évier se trouve aussi bien dans une
 * cuisine que dans une salle de bains. Les indices se cumulent : four +
 * lave-vaisselle valent une cuisine, même sans réfrigérateur détecté.
 */
function votesFor(category: string): [RoomKind, number][] {
  const c = category.toLowerCase();
  if (c.includes('bed')) return [['bedroom', 3]];
  if (c.includes('bathtub') || c.includes('shower')) return [['bathroom', 3]];
  if (c.includes('toilet')) {
    return [
      ['wc', 3],
      ['bathroom', 1],
    ];
  }
  if (c.includes('refrigerator') || c.includes('stove')) return [['kitchen', 3]];
  if (c.includes('oven') || c.includes('dishwasher')) return [['kitchen', 2]];
  if (c.includes('washer') || c.includes('dryer')) return [['bathroom', 1.5]];
  if (c.includes('sink')) {
    return [
      ['kitchen', 1],
      ['bathroom', 1],
    ];
  }
  if (c.includes('sofa') || c.includes('couch')) return [['living', 3]];
  if (c.includes('television') || c === 'tv') return [['living', 2]];
  if (c.includes('fireplace')) return [['living', 2]];
  if (c.includes('table')) return [['dining', 1.5]];
  if (c.includes('chair')) return [['dining', 0.5]];
  return [];
}

/** Départage deux types à égalité : le plus caractéristique l'emporte. */
const PRIORITY: RoomKind[] = [
  'kitchen',
  'bathroom',
  'bedroom',
  'wc',
  'living',
  'dining',
];

/** Score minimal pour oser nommer : un seul indice faible ne suffit pas. */
const MIN_SCORE = 2.5;

/**
 * Déduit le type d'une pièce d'après les meubles qu'elle contient.
 * `null` quand rien n'est assez net — l'appelant retombe alors sur
 * « Pièce 1 », « Pièce 2 »…
 */
export function deduceRoomKind(categories: string[]): RoomKind | null {
  const score = new Map<RoomKind, number>();
  for (const category of categories) {
    for (const [kind, weight] of votesFor(category)) {
      score.set(kind, (score.get(kind) ?? 0) + weight);
    }
  }
  let best: RoomKind | null = null;
  for (const kind of PRIORITY) {
    const s = score.get(kind) ?? 0;
    if (s < MIN_SCORE) continue;
    if (best === null || s > (score.get(best) ?? 0)) best = kind;
  }
  return best;
}

/** Nom français d'un type de pièce. */
export function roomKindLabel(kind: RoomKind): string {
  return ROOM_FR[kind];
}

/**
 * Noms proposés à la correction, dans l'ordre où on les rencontre dans un
 * logement. Plus large que ce que le mobilier permet de deviner : un couloir
 * ou une entrée n'ont pas de meuble caractéristique, mais il faut pouvoir
 * les nommer d'un geste plutôt qu'au clavier.
 */
export const ROOM_NAME_CHOICES: string[] = [
  'Séjour',
  'Salon',
  'Salle à manger',
  'Cuisine',
  'Chambre',
  'Salle de bains',
  'WC',
  'Bureau',
  'Entrée',
  'Couloir',
  'Dressing',
  'Buanderie',
  'Cellier',
  'Garage',
  'Balcon',
  'Cave',
];

/**
 * Le rayon qui part de `p` vers l'œil traverse-t-il ce meuble ?
 *
 * Sur un plan 3D, un appareil posé derrière un rangement disparaît
 * purement et simplement : rien ne dit qu'il existe, et l'électricien qui
 * fait le tour du modèle compte une prise de moins. Il faut donc savoir,
 * image par image, ce que chaque meuble masque.
 *
 * Test des tranches dans le repère du meuble : on ramène le rayon dans ses
 * axes, et on regarde s'il coupe la boîte.
 */
export function hiddenByBox(
  p: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  box: {
    cx: number;
    cz: number;
    y0: number;
    y1: number;
    width: number;
    depth: number;
    yaw: number;
  },
): boolean {
  const cos = Math.cos(-box.yaw);
  const sin = Math.sin(-box.yaw);
  const rx = (p.x - box.cx) * cos - (p.z - box.cz) * sin;
  const rz = (p.x - box.cx) * sin + (p.z - box.cz) * cos;
  const dx = dir.x * cos - dir.z * sin;
  const dz = dir.x * sin + dir.z * cos;
  let t0 = 0.001;
  let t1 = Infinity;
  const tranche = (o: number, d: number, demi: number) => {
    if (Math.abs(d) < 1e-9) return Math.abs(o) <= demi;
    const a = (-demi - o) / d;
    const b = (demi - o) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    return true;
  };
  if (!tranche(rx, dx, box.width / 2)) return false;
  if (!tranche(rz, dz, box.depth / 2)) return false;
  // La hauteur, dans le repère du monde : un meuble n'est pas incliné.
  const cy = (box.y0 + box.y1) / 2;
  if (!tranche(p.y - cy, dir.y, (box.y1 - box.y0) / 2)) return false;
  return t1 >= t0;
}

export function frCategory(category: string): string {
  const kind = furnKind(category);
  return kind === 'other' ? category : FR[kind];
}

/**
 * Symbole 2D d'un meuble, en coordonnées locales centrées (x le long de la
 * largeur, y le long de la profondeur) : liste de polylignes à tracer dans
 * le rectangle w×d. Utilisé par le plan de l'app ET par le PDF.
 *
 * LE DOS DU MEUBLE EST EN +y. C'est la même convention que le volume 3D
 * (`furniture3d.ts` : l'avant en z = 0, le dos en z = 1), et l'écran du plan
 * projette +z monde vers +y écran : le dossier dessiné en −y montrait donc
 * l'EXACT OPPOSÉ de la 3D — la chaise du chantier tournait le dos au mur sur
 * le plan et à la pièce dans le volume.
 */
export function furnitureStrokes(
  kind: FurnKind,
  w: number,
  d: number,
): { x: number; y: number }[][] {
  const hw = w / 2;
  const hd = d / 2;
  /** Un rectangle, dans le repère du meuble (fractions de sa demi-emprise). */
  const rect = (x0: number, y0: number, x1: number, y1: number) => [
    { x: hw * x0, y: hd * y0 },
    { x: hw * x1, y: hd * y0 },
    { x: hw * x1, y: hd * y1 },
    { x: hw * x0, y: hd * y1 },
    { x: hw * x0, y: hd * y0 },
  ];
  /** Un trait. */
  const trait = (x0: number, y0: number, x1: number, y1: number) => [
    { x: hw * x0, y: hd * y0 },
    { x: hw * x1, y: hd * y1 },
  ];
  /** Un cercle (douze côtés : à l'échelle d'un plan, on ne voit pas la
   *  différence, et un polygone se dessine partout — écran comme PDF). */
  const cercle = (cx: number, cy: number, r: number, cotes = 12) => {
    const m = Math.min(hw, hd) * r;
    const anneau: { x: number; y: number }[] = [];
    for (let i = 0; i <= cotes; i++) {
      const a = (i / cotes) * Math.PI * 2;
      anneau.push({ x: hw * cx + m * Math.cos(a), y: hd * cy + m * Math.sin(a) });
    }
    return anneau;
  };

  switch (kind) {
    /*
      LE LIT : deux oreillers, la couette, la tête.

      Un rectangle avec un trait en travers pouvait être n'importe quoi. Sur
      le plan d'un concurrent, un lit se reconnaît du premier coup d'œil —
      c'est ce qui rend un plan lisible sans légende, et c'est le document
      qu'on montre au client.
    */
    case 'bed':
      return [
        // La tête de lit, en bandeau, côté dos.
        rect(-1, 0.72, 1, 1),
        // Deux oreillers côte à côte.
        rect(-0.86, 0.24, -0.08, 0.66),
        rect(0.08, 0.24, 0.86, 0.66),
        // Le rabat de la couette.
        trait(-1, -0.12, 1, -0.12),
      ];

    /*
      LE CANAPÉ : dossier, accoudoirs, et le nombre d'assises que sa largeur
      permet — deux places ou trois, ça se voit sur un plan.
    */
    case 'sofa': {
      const dessin = [
        // Dossier, côté dos.
        rect(-1, 0.45, 1, 1),
        // Accoudoirs.
        rect(-1, -1, -0.72, 0.45),
        rect(0.72, -1, 1, 0.45),
      ];
      const places = w > 1.9 ? 3 : 2;
      for (let i = 1; i < places; i++) {
        const x = -0.72 + (1.44 * i) / places;
        dessin.push(trait(x, -1, x, 0.45));
      }
      return dessin;
    }

    case 'tv':
      // L'écran, et sa platine murale côté dos — une télé se fixe au mur.
      return [rect(-0.94, -0.4, 0.94, 0.4), trait(-0.25, 0.4, 0.25, 0.4)];

    /*
      LA TABLE : le plateau, et son piqué central pour les rondes.
    */
    case 'table':
      return Math.abs(w - d) < 0.12
        ? [cercle(0, 0, 0.92, 16)]
        : [rect(-0.9, -0.9, 0.9, 0.9)];

    case 'chair':
      // Assise et dossier : le dossier du côté du dos.
      return [rect(-0.78, -0.85, 0.78, 0.5), rect(-0.9, 0.55, 0.9, 0.95)];

    /*
      LE RANGEMENT : ses portes, avec leur poignée.

      La diagonale d'avant est la convention du bâtiment pour « placard »,
      mais elle ne dit ni le nombre de portes ni de quel côté elles s'ouvrent.
      Deux vantaux et leurs poignées le disent, et c'est ce qu'un client
      reconnaît.
    */
    case 'storage': {
      const dessin = [trait(0, -0.9, 0, 0.9)];
      // Les poignées, de part et d'autre du refend.
      dessin.push(trait(-0.12, -0.2, -0.12, 0.2));
      dessin.push(trait(0.12, -0.2, 0.12, 0.2));
      return dessin;
    }

    /*
      L'APPAREIL MÉNAGER : un hublot pour ce qui tourne, quatre feux pour ce
      qui chauffe, un refend pour ce qui se range.
    */
    case 'appliance':
      return [cercle(0, 0, 0.62), cercle(0, 0, 0.34)];

    case 'stove':
      return [
        cercle(-0.45, -0.45, 0.3),
        cercle(0.45, -0.45, 0.3),
        cercle(-0.45, 0.45, 0.3),
        cercle(0.45, 0.45, 0.3),
      ];

    case 'fridge':
      return [trait(-0.95, 0, 0.95, 0), trait(-0.2, -0.55, -0.2, -0.25)];

    case 'stairs': {
      // Marches : autant que la longueur en donne, et la flèche de montée.
      const marches = Math.max(3, Math.min(9, Math.round(w / 0.28)));
      const steps: { x: number; y: number }[][] = [];
      for (let i = 1; i < marches; i++) {
        const x = -1 + (2 * i) / marches;
        steps.push(trait(x, -0.94, x, 0.94));
      }
      steps.push(trait(-0.8, 0, 0.8, 0));
      steps.push(trait(0.55, -0.25, 0.8, 0));
      steps.push(trait(0.55, 0.25, 0.8, 0));
      return steps;
    }

    /*
      LA BAIGNOIRE : la cuve en retrait, et la bonde.
    */
    case 'bathtub':
      return [rect(-0.86, -0.78, 0.86, 0.78), cercle(0.62, 0, 0.12)];

    /*
      LE WC : la cuvette et son réservoir — vu de dessus, c'est ça qu'on
      dessine sur un plan, pas un rond.
    */
    case 'toilet':
      return [
        // Réservoir, contre le mur.
        rect(-0.8, -1, 0.8, -0.55),
        // Cuvette.
        cercle(0, 0.2, 0.62),
      ];

    /*
      L'ÉVIER ou la vasque : la cuve, et la robinetterie au bord.
    */
    case 'sink':
      return [rect(-0.8, -0.55, 0.8, 0.86), cercle(0, -0.78, 0.16)];

    default:
      return [];
  }
}
