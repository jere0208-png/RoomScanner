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
   * LA RÉFÉRENCE RÉELLE, quand c'en est une — relevé du patron : « l'ajout
   * réaliste de meubles depuis un catalogue de mobiliers existants
   * réellement ». La maison cite déjà ses marques au devis (Legrand
   * Céliane, Schneider Odace) : des faits de catalogue. Le mobilier suit —
   * et c'est la COTE réelle qui fait le réalisme d'un plan, pas la photo.
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
  {
    name: 'Chambre',
    items: [
      { key: 'lit90', label: 'Lit simple 90', category: 'bed', w: 0.9, d: 1.9, h: 0.5 },
      { key: 'lit140', label: 'Lit double 140', category: 'bed', w: 1.4, d: 1.9, h: 0.5 },
      { key: 'lit160', label: 'Lit queen 160', category: 'bed', w: 1.6, d: 2.0, h: 0.5 },
      { key: 'chevet', label: 'Table de chevet', category: 'storage', w: 0.45, d: 0.4, h: 0.55 },
      { key: 'armoire', label: 'Armoire', category: 'storage', w: 1.2, d: 0.6, h: 2.1 },
      { key: 'commode', label: 'Commode', category: 'storage', w: 1.0, d: 0.45, h: 0.85 },
      /*
        LES RÉFÉRENCES DU COMMERCE — cotes constructeur, vérifiables au
        mètre chez n'importe qui. Une référence à la mauvaise cote serait
        pire qu'un meuble générique : on planifierait sa chambre sur un
        mensonge.
      */
      { key: 'malm160', label: 'Lit MALM 160', category: 'bed', marque: 'IKEA', matiere: 'bois', w: 1.76, d: 2.09, h: 1.0 },
      { key: 'hemnes160', label: 'Lit HEMNES 160', category: 'bed', marque: 'IKEA', matiere: 'bois', w: 1.68, d: 2.11, h: 1.2 },
      { key: 'hemneschevet', label: 'Chevet HEMNES', category: 'storage', marque: 'IKEA', matiere: 'bois', w: 0.46, d: 0.35, h: 0.7 },
      { key: 'malmcommode', label: 'Commode MALM 4 tiroirs', category: 'storage', marque: 'IKEA', matiere: 'bois', w: 0.8, d: 0.48, h: 1.0 },
      { key: 'pax100', label: 'Armoire PAX 100', category: 'storage', marque: 'IKEA', matiere: 'blanc', w: 1.0, d: 0.58, h: 2.01 },
    ],
  },
  {
    name: 'Cuisine',
    items: [
      { key: 'meubleBas', label: 'Meuble bas 60', category: 'storage', w: 0.6, d: 0.6, h: 0.9 },
      { key: 'meubleBas120', label: 'Meuble bas 120', category: 'storage', w: 1.2, d: 0.6, h: 0.9 },
      {
        key: 'meubleHaut',
        label: 'Meuble haut',
        category: 'storage',
        w: 0.8,
        d: 0.35,
        h: 0.7,
        base: 1.4,
      },
      { key: 'evier', label: 'Évier', category: 'sink', w: 0.8, d: 0.6, h: 0.9 },
      { key: 'plaque', label: 'Plaque de cuisson', category: 'stove', w: 0.6, d: 0.52, h: 0.9 },
      { key: 'four', label: 'Four', category: 'oven', w: 0.6, d: 0.6, h: 0.6, base: 0.6 },
      { key: 'frigo', label: 'Réfrigérateur', category: 'refrigerator', w: 0.6, d: 0.65, h: 1.85 },
      {
        key: 'lv',
        label: 'Lave-vaisselle',
        category: 'dishwasher',
        w: 0.6,
        d: 0.6,
        h: 0.85,
      },
      { key: 'hotte', label: 'Hotte', category: 'storage', w: 0.6, d: 0.5, h: 0.4, base: 1.7 },
    ],
  },
  {
    name: 'Séjour',
    items: [
      { key: 'canape2', label: 'Canapé 2 places', category: 'sofa', w: 1.6, d: 0.9, h: 0.8 },
      { key: 'canape3', label: 'Canapé 3 places', category: 'sofa', w: 2.1, d: 0.9, h: 0.8 },
      { key: 'tableBasse', label: 'Table basse', category: 'table', w: 1.1, d: 0.6, h: 0.4 },
      { key: 'tableRepas', label: 'Table à manger', category: 'table', w: 1.6, d: 0.9, h: 0.75 },
      { key: 'chaise', label: 'Chaise', category: 'chair', w: 0.45, d: 0.45, h: 0.9 },
      { key: 'tv', label: 'Télévision', category: 'television', w: 1.2, d: 0.08, h: 0.7, base: 1.0 },
      { key: 'meubleTv', label: 'Meuble TV', category: 'storage', w: 1.4, d: 0.4, h: 0.5 },
      { key: 'biblio', label: 'Bibliothèque', category: 'storage', w: 0.8, d: 0.3, h: 1.8 },
      { key: 'kivik3', label: 'Canapé KIVIK 3 pl.', category: 'sofa', marque: 'IKEA', matiere: 'tissu', w: 2.28, d: 0.95, h: 0.83 },
      { key: 'klippan2', label: 'Canapé KLIPPAN 2 pl.', category: 'sofa', marque: 'IKEA', matiere: 'tissu', w: 1.8, d: 0.88, h: 0.66 },
      { key: 'poang', label: 'Fauteuil POÄNG', category: 'chair', marque: 'IKEA', matiere: 'tissu', w: 0.68, d: 0.82, h: 1.0 },
      { key: 'lack118', label: 'Table basse LACK', category: 'table', marque: 'IKEA', matiere: 'blanc', w: 1.18, d: 0.78, h: 0.45 },
      { key: 'lack55', label: 'Bout de canapé LACK', category: 'table', marque: 'IKEA', matiere: 'blanc', w: 0.55, d: 0.55, h: 0.45 },
      { key: 'ekedalen120', label: 'Table EKEDALEN 120', category: 'table', marque: 'IKEA', matiere: 'bois', w: 1.2, d: 0.8, h: 0.75 },
      { key: 'besta180', label: 'Banc TV BESTÅ 180', category: 'storage', marque: 'IKEA', matiere: 'blanc', w: 1.8, d: 0.42, h: 0.38 },
      { key: 'kallax22', label: 'Étagère KALLAX 2×2', category: 'storage', marque: 'IKEA', matiere: 'blanc', w: 0.77, d: 0.39, h: 0.77 },
      { key: 'kallax44', label: 'Étagère KALLAX 4×4', category: 'storage', marque: 'IKEA', matiere: 'blanc', w: 1.47, d: 0.39, h: 1.47 },
      { key: 'billy80', label: 'Bibliothèque BILLY', category: 'storage', marque: 'IKEA', matiere: 'blanc', w: 0.8, d: 0.28, h: 2.02 },
    ],
  },
  {
    name: 'Salle d’eau',
    items: [
      { key: 'baignoire', label: 'Baignoire', category: 'bathtub', w: 1.7, d: 0.75, h: 0.6 },
      { key: 'douche', label: 'Douche', category: 'bathtub', w: 0.9, d: 0.9, h: 2.0 },
      { key: 'lavabo', label: 'Lavabo', category: 'sink', w: 0.6, d: 0.45, h: 0.85 },
      { key: 'meubleVasque', label: 'Meuble vasque', category: 'sink', w: 0.8, d: 0.5, h: 0.85 },
      { key: 'wc', label: 'WC', category: 'toilet', w: 0.4, d: 0.7, h: 0.8 },
      { key: 'll', label: 'Lave-linge', category: 'washer', w: 0.6, d: 0.6, h: 0.85 },
      { key: 'sl', label: 'Sèche-linge', category: 'dryer', w: 0.6, d: 0.6, h: 0.85 },
    ],
  },
  {
    name: 'Bureau',
    items: [
      { key: 'bureau', label: 'Bureau', category: 'table', w: 1.2, d: 0.6, h: 0.75 },
      { key: 'fauteuil', label: 'Fauteuil', category: 'chair', w: 0.6, d: 0.6, h: 1.1 },
      { key: 'caisson', label: 'Caisson', category: 'storage', w: 0.42, d: 0.55, h: 0.6 },
      { key: 'micke', label: 'Bureau MICKE', category: 'table', marque: 'IKEA', matiere: 'blanc', w: 1.05, d: 0.5, h: 0.75 },
      { key: 'bekant160', label: 'Bureau BEKANT 160', category: 'table', marque: 'IKEA', matiere: 'bois', w: 1.6, d: 0.8, h: 0.73 },
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
