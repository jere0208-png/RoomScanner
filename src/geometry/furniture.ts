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
