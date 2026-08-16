/** Catégories de meubles détectées par RoomPlan, normalisées. */
export type FurnKind =
  | 'bed'
  | 'sofa'
  | 'tv'
  | 'table'
  | 'chair'
  | 'storage'
  | 'appliance'
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
  if (
    c.includes('refrigerator') ||
    c.includes('washer') ||
    c.includes('dryer') ||
    c.includes('dishwasher') ||
    c.includes('oven') ||
    c.includes('stove')
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
  appliance: 'Électroménager',
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
 */
export function furnitureStrokes(
  kind: FurnKind,
  w: number,
  d: number,
): { x: number; y: number }[][] {
  const hw = w / 2;
  const hd = d / 2;
  switch (kind) {
    case 'bed':
      // Oreiller : trait en travers près de la tête de lit.
      return [
        [
          { x: -hw + w * 0.22, y: -hd * 0.7 },
          { x: -hw + w * 0.22, y: hd * 0.7 },
        ],
      ];
    case 'sofa':
      // Dossier le long d'un grand côté + deux accoudoirs.
      return [
        [
          { x: -hw + w * 0.1, y: -hd + d * 0.3 },
          { x: hw - w * 0.1, y: -hd + d * 0.3 },
        ],
        [
          { x: -hw + w * 0.1, y: -hd + d * 0.3 },
          { x: -hw + w * 0.1, y: hd - d * 0.15 },
        ],
        [
          { x: hw - w * 0.1, y: -hd + d * 0.3 },
          { x: hw - w * 0.1, y: hd - d * 0.15 },
        ],
      ];
    case 'tv':
      // Écran : trait central sur la longueur.
      return [
        [
          { x: -hw * 0.85, y: 0 },
          { x: hw * 0.85, y: 0 },
        ],
      ];
    case 'table':
      // Plateau : rectangle en retrait.
      return [
        [
          { x: -hw * 0.72, y: -hd * 0.72 },
          { x: hw * 0.72, y: -hd * 0.72 },
          { x: hw * 0.72, y: hd * 0.72 },
          { x: -hw * 0.72, y: hd * 0.72 },
          { x: -hw * 0.72, y: -hd * 0.72 },
        ],
      ];
    case 'chair':
      return [
        [
          { x: -hw * 0.7, y: -hd + d * 0.22 },
          { x: hw * 0.7, y: -hd + d * 0.22 },
        ],
      ];
    case 'storage':
      // Trait diagonal : symbole classique de rangement.
      return [
        [
          { x: -hw, y: -hd },
          { x: hw, y: hd },
        ],
      ];
    case 'appliance':
      // Croix : appareil.
      return [
        [
          { x: -hw, y: -hd },
          { x: hw, y: hd },
        ],
        [
          { x: hw, y: -hd },
          { x: -hw, y: hd },
        ],
      ];
    case 'stairs': {
      // Marches : traits parallèles.
      const steps: { x: number; y: number }[][] = [];
      for (let i = 1; i <= 3; i++) {
        const x = -hw + (w * i) / 4;
        steps.push([
          { x, y: -hd * 0.8 },
          { x, y: hd * 0.8 },
        ]);
      }
      return steps;
    }
    case 'bathtub':
      return [
        [
          { x: -hw * 0.7, y: -hd * 0.6 },
          { x: hw * 0.7, y: -hd * 0.6 },
          { x: hw * 0.7, y: hd * 0.6 },
          { x: -hw * 0.7, y: hd * 0.6 },
          { x: -hw * 0.7, y: -hd * 0.6 },
        ],
      ];
    case 'toilet':
    case 'sink': {
      // Cuvette / vasque : octogone approchant un cercle.
      const r = Math.min(hw, hd) * 0.55;
      const ring: { x: number; y: number }[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ring.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
      }
      return [ring];
    }
    default:
      return [];
  }
}
