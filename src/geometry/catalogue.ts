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
      { key: 'coiffeuse', label: 'Coiffeuse', category: 'table', w: 1.0, d: 0.45, h: 1.4 },
      { key: 'lampeChevet', label: 'Lampe de chevet', category: 'lampe', w: 0.26, d: 0.26, h: 0.45, base: 0.55 },
      { key: 'litSuperpose', label: 'Lits superposés', category: 'bed', w: 0.98, d: 2.0, h: 1.6 },
      { key: 'portant', label: 'Portant à vêtements', category: 'portant', w: 1.2, d: 0.45, h: 1.6 },
      { key: 'bancLit', label: 'Banc de bout de lit', category: 'chair', w: 1.2, d: 0.4, h: 0.45 },
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
      { key: 'frigoUs', label: 'Réfrigérateur américain', category: 'refrigerator', w: 0.91, d: 0.72, h: 1.78 },
      { key: 'caveVin', label: 'Cave à vin', category: 'refrigerator', w: 0.6, d: 0.6, h: 0.85 },
      { key: 'colonneFour', label: 'Colonne four', category: 'oven', w: 0.6, d: 0.6, h: 2.1 },
      { key: 'tabouret', label: 'Tabouret de bar', category: 'chair', w: 0.4, d: 0.4, h: 0.75 },
      { key: 'tableHaute', label: 'Table haute', category: 'table', w: 1.2, d: 0.6, h: 1.05 },
      { key: 'meubleHaut40', label: 'Meuble haut 40', category: 'storage', w: 0.4, d: 0.35, h: 0.7, base: 1.4 },
      { key: 'meubleHaut120', label: 'Meuble haut 120', category: 'storage', w: 1.2, d: 0.35, h: 0.7, base: 1.4 },
      { key: 'meubleHautVitre', label: 'Meuble haut vitré', category: 'storage', w: 0.8, d: 0.35, h: 0.7, base: 1.4 },
      { key: 'etagereCuisine', label: 'Étagère à bocaux', category: 'storage', w: 0.8, d: 0.22, h: 0.3, base: 1.5 },
    ],
  },
  {
    name: 'Séjour',
    items: [
      { key: 'canape2', label: 'Canapé 2 places', category: 'sofa', w: 1.8, d: 0.88, h: 0.8 },
      { key: 'canape3', label: 'Canapé 3 places', category: 'sofa', w: 2.28, d: 0.95, h: 0.83 },
      { key: 'canapeAngle', label: 'Canapé d’angle', category: 'sofa', w: 2.6, d: 1.6, h: 0.85 },
      { key: 'pouf', label: 'Pouf', category: 'pouf', w: 0.5, d: 0.5, h: 0.42 },
      { key: 'lampadaire', label: 'Lampadaire', category: 'lampe', w: 0.4, d: 0.4, h: 1.65 },
      { key: 'console', label: 'Console', category: 'table', w: 1.0, d: 0.35, h: 0.8 },
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
      { key: 'piano', label: 'Piano droit', category: 'piano', w: 1.5, d: 0.6, h: 1.25 },
      { key: 'aquarium', label: 'Aquarium', category: 'aquarium', w: 1.0, d: 0.4, h: 1.3 },
      { key: 'poeleBois', label: 'Poêle à bois', category: 'poele', w: 0.5, d: 0.45, h: 1.1 },
      { key: 'meubleTvSuspendu', label: 'Meuble TV suspendu', category: 'storage', w: 1.6, d: 0.38, h: 0.35, base: 0.3 },
      { key: 'etagereFlottante', label: 'Étagère flottante', category: 'storage', w: 1.0, d: 0.22, h: 0.25, base: 1.3 },
    ],
  },
  /*
    LA DÉCORATION — relevé du patron : « complète le catalogue par des
    variétés de décorations, meubles, pour plaire à chacun ». Ce qui fait
    qu'une pièce est habitée : un tableau, des cadres, un miroir rond, une
    horloge, un vase, des plantes, des rideaux. Ce qui s'accroche au mur
    est posé à sa hauteur (`base`).
  */
  {
    name: 'Décoration',
    items: [
      { key: 'tableauMural', label: 'Tableau', category: 'cadre', w: 0.8, d: 0.03, h: 0.6, base: 1.25 },
      { key: 'cadresPhotos', label: 'Cadres photo', category: 'cadre', w: 1.0, d: 0.03, h: 0.42, base: 1.4 },
      { key: 'miroirRond', label: 'Miroir rond', category: 'miroir', w: 0.7, d: 0.03, h: 0.7, base: 1.2 },
      { key: 'horloge', label: 'Horloge murale', category: 'horloge', w: 0.4, d: 0.05, h: 0.4, base: 1.75 },
      { key: 'grandVase', label: 'Grand vase', category: 'vase', w: 0.3, d: 0.3, h: 0.9 },
      { key: 'planteHaute', label: 'Grande plante', category: 'plante', w: 0.7, d: 0.7, h: 1.9 },
      { key: 'planteSuspendue', label: 'Plante suspendue', category: 'plante', w: 0.4, d: 0.4, h: 0.8, base: 1.4 },
      { key: 'rideaux', label: 'Rideaux', category: 'rideau', w: 1.4, d: 0.12, h: 2.4 },
      { key: 'tableauPortrait', label: 'Tableau vertical', category: 'cadre', w: 0.5, d: 0.03, h: 0.7, base: 1.3 },
      { key: 'grandeToile', label: 'Grande toile', category: 'cadre', w: 1.2, d: 0.03, h: 0.8, base: 1.1 },
      { key: 'affiche', label: 'Affiche encadrée', category: 'cadre', w: 0.5, d: 0.02, h: 0.7, base: 1.35 },
      { key: 'triptyque', label: 'Triptyque', category: 'cadre', w: 1.2, d: 0.03, h: 0.5, base: 1.3 },
    ],
  },
  {
    name: 'Salle d’eau',
    items: [
      { key: 'baignoire', label: 'Baignoire', category: 'bathtub', w: 1.7, d: 0.75, h: 0.6 },
      { key: 'douche', label: 'Douche', category: 'bathtub', w: 0.9, d: 0.9, h: 2.0 },
      { key: 'lavabo', label: 'Lavabo', category: 'sink', w: 0.6, d: 0.45, h: 0.85 },
      { key: 'meubleVasque', label: 'Meuble vasque', category: 'sink', w: 0.8, d: 0.5, h: 0.85 },
      { key: 'miroirLed', label: 'Miroir éclairé', category: 'miroir', w: 0.8, d: 0.04, h: 0.6, base: 1.1 },
      { key: 'secheServiettes', label: 'Sèche-serviettes', category: 'radiateur', w: 0.5, d: 0.1, h: 1.2, base: 0.3 },
      { key: 'doucheItalienne', label: 'Douche à l’italienne', category: 'bathtub', w: 1.2, d: 0.9, h: 2.0 },
      { key: 'doubleVasque', label: 'Double vasque', category: 'sink', w: 1.2, d: 0.5, h: 0.85 },
      { key: 'colonneSdb', label: 'Colonne de rangement', category: 'storage', w: 0.4, d: 0.35, h: 1.8 },
      { key: 'armoireToilette', label: 'Armoire de toilette', category: 'storage', w: 0.6, d: 0.15, h: 0.7, base: 1.2 },
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
      { key: 'ecran', label: 'Écran d’ordinateur', category: 'television', w: 0.6, d: 0.2, h: 0.45, base: 0.75 },
      { key: 'lampeBureau', label: 'Lampe de bureau', category: 'lampe', w: 0.2, d: 0.2, h: 0.45, base: 0.75 },
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
  /*
    LE CONFORT — ce qu'on trouve aujourd'hui dans un logement sans y penser :
    de quoi chauffer, rafraîchir, avoir de l'eau chaude. Relevé du patron :
    « tout ce qu'on peut trouver aujourd'hui dans un appartement ».
  */
  {
    name: 'Confort',
    items: [
      { key: 'radiateur', label: 'Radiateur', category: 'radiateur', w: 0.8, d: 0.1, h: 0.6, base: 0.15 },
      { key: 'clim', label: 'Climatiseur', category: 'climatiseur', w: 0.8, d: 0.22, h: 0.3, base: 2.0 },
      { key: 'cumulus', label: 'Chauffe-eau', category: 'chauffeEau', w: 0.56, d: 0.56, h: 1.4, base: 0.6 },
    ],
  },
  /* LE DEHORS — le balcon, la terrasse, le jardin : on y vit aussi. */
  {
    name: 'Balcon et jardin',
    items: [
      { key: 'tableJardin', label: 'Table de jardin', category: 'table', w: 1.4, d: 0.8, h: 0.74 },
      { key: 'chaiseJardin', label: 'Chaise de jardin', category: 'chair', w: 0.55, d: 0.55, h: 0.88 },
      { key: 'transat', label: 'Transat', category: 'transat', w: 0.62, d: 1.5, h: 0.9 },
      { key: 'jardiniere', label: 'Jardinière', category: 'plante', w: 1.0, d: 0.35, h: 0.75 },
      { key: 'parasol', label: 'Parasol', category: 'parasol', w: 2.0, d: 2.0, h: 2.3 },
      { key: 'barbecue', label: 'Barbecue', category: 'barbecue', w: 0.9, d: 0.55, h: 1.0 },
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
