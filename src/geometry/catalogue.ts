/**
 * Le catalogue de mobilier.
 *
 * RoomPlan ne reconnaît qu'une poignée de meubles, et seulement ceux qui
 * étaient là au moment du scan. Un logement vide se scanne pourtant très
 * bien — et c'est même le cas le plus courant quand on prépare des travaux.
 * D'où ce catalogue : des meubles qu'on pose soi-même, aux dimensions
 * usuelles du commerce, quitte à les retailler ensuite.
 *
 * Chaque entrée porte une **catégorie RoomPlan** (`bed`, `refrigerator`,
 * `sink`…) et non un type maison : c'est elle qui commande le symbole du
 * plan 2D, le nom français et le volume 3D. Un meuble posé à la main est
 * ainsi, pour tout le reste de l'app, un meuble comme un autre.
 *
 * Les cotes sont celles du meuble courant, en mètres, vues de dessus :
 * largeur × profondeur, plus la hauteur pour la 3D.
 */

export interface CatalogItem {
  key: string;
  label: string;
  /** Catégorie RoomPlan : elle décide du symbole et du nom affiché. */
  category: string;
  /** Largeur, profondeur, hauteur (m). */
  w: number;
  d: number;
  h: number;
  /** Hauteur du dessous du meuble (m) : 0 sauf s'il est suspendu. */
  base?: number;
  /**
   * PLUS AUCUNE ENTRÉE NE LE PORTE — relevé du patron : « enlève les
   * mobiliers aux noms IKEA, fais un catalogue de notre propre source,
   * avec nos noms (basiques) ». Le champ reste pour que les anciens plans
   * enregistrés se relisent ; le banc `mobiliermaison` tient qu'il reste
   * vide.
   */
  marque?: string;
  /** La matière dominante : c'est elle qui habille la 3D. */
  matiere?: 'bois' | 'tissu' | 'blanc' | 'ceramique' | 'sombre';
}

export interface CatalogFamily {
  name: string;
  items: CatalogItem[];
}

export const CATALOGUE: CatalogFamily[] = [
  /*
    LE CATALOGUE MAISON — relevé du patron : « enlève les mobiliers aux
    noms IKEA, fais un catalogue de notre propre source, avec nos noms
    (basiques). Mais fais un catalogue complet. Ils ne servent pas à
    redécorer mais à imaginer la pièce seulement. »

    Les COTES du commerce restent — c'est elles qui font le réalisme d'un
    plan — mais les noms redeviennent à nous. Et tout le mobilier partage
    UN style de mise en ambiance (voir `furniture3d`) : coussins blancs,
    bois clair, couverture beige — la panoplie du home staging, pas un
    magasin de déco.
  */
  {
    name: 'Chambre',
    items: [
      { key: 'lit90', label: 'Lit simple 90', category: 'bed', w: 0.96, d: 1.99, h: 0.9 },
      { key: 'lit140', label: 'Lit double 140', category: 'bed', w: 1.46, d: 1.99, h: 0.95 },
      { key: 'lit160', label: 'Lit 160', category: 'bed', w: 1.66, d: 2.09, h: 1.0 },
      { key: 'lit180', label: 'Grand lit 180', category: 'bed', w: 1.86, d: 2.09, h: 1.0 },
      { key: 'litBebe', label: 'Lit bébé', category: 'bed', w: 0.66, d: 1.24, h: 0.85 },
      { key: 'chevet', label: 'Table de chevet', category: 'storage', w: 0.46, d: 0.35, h: 0.55 },
      { key: 'commode', label: 'Commode', category: 'storage', w: 0.8, d: 0.48, h: 1.0 },
      { key: 'armoire2p', label: 'Armoire 2 portes', category: 'storage', w: 1.0, d: 0.58, h: 2.01 },
      { key: 'armoire', label: 'Armoire 3 portes', category: 'storage', w: 1.5, d: 0.58, h: 2.2 },
      { key: 'dressing', label: 'Dressing', category: 'storage', w: 1.8, d: 0.6, h: 2.2 },
    ],
  },
  {
    name: 'Cuisine',
    items: [
      { key: 'meubleBas', label: 'Meuble bas 60', category: 'storage', w: 0.6, d: 0.6, h: 0.9 },
      { key: 'meubleBas120', label: 'Meuble bas 120', category: 'storage', w: 1.2, d: 0.6, h: 0.9 },
      { key: 'meubleHaut', label: 'Meuble haut', category: 'storage', w: 0.8, d: 0.35, h: 0.7, base: 1.4 },
      { key: 'ilot', label: 'Îlot central', category: 'storage', w: 1.2, d: 0.9, h: 0.9 },
      { key: 'evier', label: 'Évier', category: 'sink', w: 0.8, d: 0.6, h: 0.9 },
      { key: 'plaque', label: 'Plaque de cuisson', category: 'stove', w: 0.6, d: 0.52, h: 0.9 },
      { key: 'four', label: 'Four', category: 'oven', w: 0.6, d: 0.6, h: 0.6, base: 0.6 },
      { key: 'microOndes', label: 'Micro-ondes', category: 'oven', w: 0.5, d: 0.4, h: 0.3, base: 1.0 },
      { key: 'frigo', label: 'Réfrigérateur', category: 'refrigerator', w: 0.6, d: 0.65, h: 1.85 },
      { key: 'lv', label: 'Lave-vaisselle', category: 'dishwasher', w: 0.6, d: 0.6, h: 0.85 },
      { key: 'hotte', label: 'Hotte', category: 'storage', w: 0.6, d: 0.5, h: 0.4, base: 1.7 },
    ],
  },
  {
    name: 'Séjour',
    items: [
      { key: 'canape2', label: 'Canapé 2 places', category: 'sofa', w: 1.8, d: 0.88, h: 0.8 },
      { key: 'canape3', label: 'Canapé 3 places', category: 'sofa', w: 2.28, d: 0.95, h: 0.83 },
      { key: 'fauteuil', label: 'Fauteuil', category: 'chair', w: 0.8, d: 0.85, h: 0.95 },
      { key: 'tableBasse', label: 'Table basse', category: 'table', w: 1.18, d: 0.78, h: 0.45 },
      { key: 'boutCanape', label: 'Bout de canapé', category: 'table', w: 0.55, d: 0.55, h: 0.45 },
      { key: 'tableRepas', label: 'Table à manger', category: 'table', w: 1.6, d: 0.9, h: 0.75 },
      { key: 'tableRonde', label: 'Table ronde', category: 'table', w: 1.2, d: 1.2, h: 0.75 },
      { key: 'chaise', label: 'Chaise', category: 'chair', w: 0.45, d: 0.45, h: 0.9 },
      { key: 'tv', label: 'Télévision', category: 'television', w: 1.2, d: 0.08, h: 0.7, base: 1.0 },
      { key: 'meubleTv', label: 'Meuble TV', category: 'storage', w: 1.8, d: 0.42, h: 0.4 },
      { key: 'buffet', label: 'Buffet', category: 'storage', w: 1.8, d: 0.45, h: 0.85 },
      { key: 'biblio', label: 'Bibliothèque haute', category: 'storage', w: 0.8, d: 0.28, h: 2.02 },
      { key: 'casiers2', label: 'Étagère à casiers 2×2', category: 'storage', w: 0.77, d: 0.39, h: 0.77 },
      { key: 'casiers4', label: 'Étagère à casiers 4×4', category: 'storage', w: 1.47, d: 0.39, h: 1.47 },
      { key: 'tapis', label: 'Tapis', category: 'tapis', w: 2.0, d: 1.4, h: 0.02 },
      { key: 'plante', label: 'Plante verte', category: 'plante', w: 0.45, d: 0.45, h: 1.4 },
    ],
  },
  {
    name: 'Salle d’eau',
    items: [
      { key: 'baignoire', label: 'Baignoire', category: 'bathtub', w: 1.7, d: 0.75, h: 0.6 },
      { key: 'douche', label: 'Douche', category: 'bathtub', w: 0.9, d: 0.9, h: 2.0 },
      { key: 'lavabo', label: 'Lavabo', category: 'sink', w: 0.6, d: 0.45, h: 0.85 },
      { key: 'meubleVasque', label: 'Meuble vasque', category: 'sink', w: 0.8, d: 0.5, h: 0.85 },
      { key: 'doubleVasque', label: 'Double vasque', category: 'sink', w: 1.2, d: 0.5, h: 0.85 },
      { key: 'colonneSdb', label: 'Colonne de rangement', category: 'storage', w: 0.4, d: 0.35, h: 1.8 },
      { key: 'wc', label: 'WC', category: 'toilet', w: 0.4, d: 0.7, h: 0.8 },
      { key: 'll', label: 'Lave-linge', category: 'washer', w: 0.6, d: 0.6, h: 0.85 },
      { key: 'sl', label: 'Sèche-linge', category: 'dryer', w: 0.6, d: 0.6, h: 0.85 },
    ],
  },
  {
    name: 'Bureau',
    items: [
      { key: 'bureau', label: 'Bureau', category: 'table', w: 1.2, d: 0.6, h: 0.75 },
      { key: 'bureau160', label: 'Grand bureau 160', category: 'table', w: 1.6, d: 0.8, h: 0.73 },
      { key: 'fauteuilBureau', label: 'Fauteuil de bureau', category: 'chair', w: 0.6, d: 0.6, h: 1.1 },
      { key: 'caisson', label: 'Caisson', category: 'storage', w: 0.42, d: 0.55, h: 0.6 },
      { key: 'etagereBureau', label: 'Étagère murale', category: 'storage', w: 0.8, d: 0.25, h: 0.25, base: 1.5 },
    ],
  },
  {
    name: 'Entrée',
    items: [
      { key: 'meubleChaussures', label: 'Meuble à chaussures', category: 'storage', w: 0.8, d: 0.25, h: 1.2 },
      { key: 'portemanteau', label: 'Portemanteau', category: 'portemanteau', w: 0.45, d: 0.45, h: 1.75 },
      { key: 'bancEntree', label: 'Banc', category: 'chair', w: 0.9, d: 0.35, h: 0.45 },
      { key: 'miroir', label: 'Miroir', category: 'miroir', w: 0.6, d: 0.04, h: 1.6, base: 0.2 },
    ],
  },
];

export const CATALOG_ITEMS = CATALOGUE.flatMap((f) => f.items);

export function catalogItem(key: string): CatalogItem | undefined {
  return CATALOG_ITEMS.find((i) => i.key === key);
}

/**
 * Matrice de pose d'un meuble du catalogue.
 *
 * `ObjectData` porte une matrice 4×4 colonne-major, comme celles de
 * RoomPlan : les colonnes 0 et 2 donnent l'orientation (ici l'identité, le
 * meuble arrive droit), la colonne 3 la position. `m[13]` est la hauteur du
 * CENTRE du meuble — un meuble suspendu (meuble haut, télévision) est donc
 * posé à `base + h / 2`.
 */
export function catalogTransform(
  item: CatalogItem,
  x: number,
  z: number,
  sol = 0,
): number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, sol + (item.base ?? 0) + item.h / 2, z, 1,
  ];
}
