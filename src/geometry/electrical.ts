/**
 * Appareillage électrique — prises, commandes, courants faibles.
 *
 * Un appareil n'existe pas tout seul dans l'espace : il est POSÉ SUR UNE
 * FACE DE MUR. Tout part donc de là, et le repère est celui de l'électricien
 * qui se met devant le mur, mètre en main : une distance depuis le bord
 * gauche, une hauteur depuis le sol.
 *
 * Le point délicat est le stockage. On garde `along` mesuré le long du
 * SEGMENT de mur depuis son extrémité `a` — jamais depuis le bord de la face
 * affichée. Deux raisons :
 *
 * 1. Retourner un appareil sur l'autre face ne doit pas le faire sauter à
 *    l'autre bout du mur. Une valeur ancrée sur le segment reste au même
 *    endroit dans le monde, quelle que soit la face qu'on regarde.
 * 2. La face, elle, change de longueur quand un mur voisin bouge : les
 *    onglets de jonction la rallongent ou la raccourcissent. Une cote ancrée
 *    dessus dériverait toute seule.
 *
 * `wallFace()` fait la conversion, et il la fait de sorte que A→B aille
 * TOUJOURS de la gauche vers la droite pour qui regarde cette face-là. C'est
 * vérifié contre la projection réelle de la vue 3D (voir les tests) : sans
 * ça, la gauche et la droite s'inverseraient sur une face sur deux.
 */
import {
  perpOf,
  pointOnSeg,
  roomOf,
  roomParts,
  segLength,
  wallQuads,
  wallsCentroid,
  epaisseurDe,
  type Pt,
  type RoomShape,
  type WallQuad,
  type WallSeg,
} from './floorplan';

export type FixtureKind =
  | 'prise'
  | 'prise2'
  | 'prise20'
  | 'prise32'
  | 'inter'
  | 'volet'
  | 'va'
  | 'poussoir'
  | 'variateur'
  | 'rj45'
  | 'tv'
  | 'applique'
  | 'tableau'
  | 'thermostat'
  | 'sortieCable'
  | 'boite'
  // Ensembles multipostes : plusieurs fonctions sous une même plaque.
  | 'prise3'
  | 'rj2'
  | 'rjPrise'
  | 'rjPrise2'
  | 'tvPrise'
  | 'inter2'
  | 'inter3'
  /** L'interrupteur général : celui qui éteint tout en sortant (légende de l'architecte). */
  | 'interGeneral'
  /** Le moniteur du vidéophone (« VP » de la légende de l'architecte). */
  | 'videophone';

/** Un appareil posé sur une face de mur. */
export interface Fixture {
  id: string;
  kind: FixtureKind;
  wallId: string;
  /** Abscisse de l'axe le long du segment de mur, depuis l'extrémité `a` (m). */
  along: number;
  /** Hauteur de l'axe au-dessus du sol (m). */
  height: number;
  /** Face du mur : +1 = côté de la normale `perpOf(u)`, −1 = l'autre. */
  side: 1 | -1;
  /**
   * Appareils réunis sous une même plaque.
   *
   * On ne fusionne PAS deux appareils en un seul : sur le mur, un ensemble
   * à deux postes, ce sont deux boîtes distinctes à 71 mm d'entraxe, deux
   * mécanismes, et une plaque commune. Le modèle dit donc la même chose —
   * chacun garde son identité, son circuit et son symbole, et cet
   * identifiant partagé dit qu'ils se posent ensemble.
   */
  group?: string;
  /**
   * Les commandes qui allument cet appareil — identifiants d'interrupteurs.
   *
   * Même modèle qu'au plafond (`CeilingFixture.commands`) : une prise
   * commandée ou une applique s'allume d'un interrupteur, et le plan trace
   * le filet du lien. Réservé à ce qui SE COMMANDE (`seCommande`).
   */
  commands?: string[];
  /**
   * CETTE PRISE PART SEULE DU TABLEAU — elle refuse le pontage.
   *
   * Relevé du patron : « fais un système intelligent de calcul pour les
   * prises : si elles sont voisines, même pan de mur, et que ça rentre dans
   * la norme, on fait des pontages de prise à prise. C'est le seul élément
   * qu'on ponte au mur. » Puis, sur la fiche de pose : « on propose de lier
   * le câblage élec des prises entre elles ; on peut refuser pour faire un
   * circuit indépendant par prise. »
   *
   * Le pontage est donc PROPOSÉ, pas imposé — d'où ce refus, et pas un
   * accord : un relevé qui ne dit rien décrit l'installation la plus
   * courante, celle où les socles voisins se pontent. Ne rien dire ne doit
   * jamais valoir « fais l'inhabituel ».
   */
  sansPontage?: boolean;
  /**
   * L'APPAREIL QU'ELLE DESSERT, en sigle de plan d'architecte — « LV »
   * (lave-vaisselle), « PL » (plaque), « FO » (four)… Voir `USAGES`. Il
   * s'écrit dans le rond d'une alimentation dédiée (`libelleDuSymbole`).
   */
  usage?: string;
}

/**
 * LES APPAREILS QU'UNE ALIMENTATION DÉDIÉE DESSERT — les sigles de la
 * légende d'un plan d'architecte (DCE « Romeo » : « Alim Lave vaisselle »,
 * « Alim Plaque »…), écrits dans le rond du symbole.
 */
export const USAGES: { sigle: string; label: string }[] = [
  { sigle: 'LV', label: 'Lave-vaisselle' },
  { sigle: 'LL', label: 'Lave-linge' },
  { sigle: 'SL', label: 'Sèche-linge' },
  { sigle: 'FO', label: 'Four' },
  { sigle: 'PL', label: 'Plaque de cuisson' },
  { sigle: 'MI', label: 'Micro-ondes' },
  { sigle: 'FRI', label: 'Réfrigérateur' },
  { sigle: 'CG', label: 'Congélateur' },
  { sigle: 'H', label: 'Hotte' },
  { sigle: 'SS', label: 'Sèche-serviettes' },
  { sigle: 'CU', label: 'Chauffe-eau' },
  { sigle: 'CL', label: 'Climatisation' },
  { sigle: 'VE', label: 'Borne de recharge' },
];

/**
 * LES APPAREILS QU'ON PROPOSE POUR UN TYPE DE SORTIE — ceux qu'elle
 * alimente d'ordinaire. Une prise 20 A dessert un lave-linge, pas une
 * plaque ; une sortie de câble, une plaque ou un chauffe-eau.
 */
export function usagesPour(kind: FixtureKind): { sigle: string; label: string }[] {
  const pris = (sigles: string[]) => USAGES.filter((u) => sigles.includes(u.sigle));
  if (kind === 'prise20') return pris(['LV', 'LL', 'SL', 'FO', 'CG']);
  if (kind === 'prise32') return pris(['PL', 'FO']);
  if (kind === 'sortieCable') return pris(['PL', 'CU', 'CL', 'SS', 'VE']);
  if (kind === 'prise') return pris(['FRI', 'MI', 'H', 'SS']);
  return [];
}

/**
 * Ce qui peut COMMANDER : un interrupteur sous toutes ses formes.
 *
 * Une prise n'allume rien — le rappeler ici évite de tracer sur le plan un
 * lien qui n'existe pas dans la réalité.
 */
export const COMMANDES_MURALES: FixtureKind[] = [
  'inter',
  'inter2',
  'inter3',
  'va',
  'poussoir',
  'variateur',
  'interGeneral',
];

/**
 * Ce qui SE COMMANDE depuis un interrupteur : les prises 16 A (la prise
 * commandée du séjour) et l'applique. Relevé du patron : « prise ou
 * éclairage mural, mais pas le courant faible » — une RJ45 n'a rien à
 * allumer, un lave-linge (20 A) ne se commande pas du couloir, et les
 * ensembles mixtes portent du courant faible sous leur plaque.
 */
export function seCommande(kind: FixtureKind): boolean {
  return (
    kind === 'prise' || kind === 'prise2' || kind === 'prise3' || kind === 'applique'
  );
}

export interface FixtureSpec {
  label: string;
  /**
   * Fonctions réunies sous la plaque, de gauche à droite. Absent = un seul
   * poste, de la nature de l'appareil lui-même.
   *
   * C'est cette liste qui décide de tout : la largeur de la plaque, les
   * symboles dessinés, les trous à percer, et le comptage NF C 15-100.
   */
  posts?: FixtureKind[];
  /** Sigle porté par le symbole du plan 2D. */
  short: string;
  family: string;
  /** Largeur et hauteur de la plaque (m). */
  w: number;
  h: number;
  /**
   * Saillie hors du nu du mur (m).
   *
   * Une plaque d'appareillage saille de 8 à 10 mm dans la vraie vie. À
   * l'écran, sur un mur vu de biais, cela ne fait rien du tout : on retient
   * 22 mm, cadre compris. C'est la seule cote de ce fichier qui soit un
   * compromis d'affichage plutôt qu'une mesure — celles qui comptent, qu'on
   * lit et qu'on exporte, sont la hauteur d'axe et la distance au bord.
   */
  depth: number;
  color: string;
  /** Hauteur d'axe usuelle (m). */
  std: number;
  /** Ce qu'il faut savoir sur cette hauteur, en une ligne. */
  note: string;
  /**
   * LA TEINTE QUE GARDE LE SYMBOLE SUR UN PLAN À L'ENCRE UNIQUE — la
   * légende de l'architecte dessine l'interrupteur général en violet, au
   * milieu du rouge : c'est par là qu'on le trouve.
   */
  teintePropre?: string;
}

/**
 * Cotes de pose d'un appareillage encastré, en mètres.
 *
 * Ce sont les seules cotes du fichier qui servent à PERCER, et non à
 * dessiner : elles doivent être justes.
 *
 * - **Entraxe 71 mm** entre deux boîtes d'un ensemble multiposte. C'est la
 *   cote des boîtes et des plaques multipostes du commerce (Batibox et
 *   équivalents) ; c'est elle qui décide où tombe le second trou.
 * - **Boîte Ø 67 mm**, percée à la scie cloche de 67 ou 68 mm selon le
 *   support, profondeur 40 mm en cloison sèche (50 mm pour un point de
 *   centre ou une boîte à équipement).
 * - **Plaque 82 mm** de côté pour un poste simple ; une plaque à N postes
 *   mesure donc `(N − 1) × 71 + 82` mm.
 */
export const ENTRAXE = 0.071;
export const BOITE_D = 0.067;
export const BOITE_P = 0.04;
export const PLAQUE = 0.082;

/**
 * LE PAS D'UNE SÉRIE — soixante centimètres.
 *
 * Relevé du patron : « duplication d'un appareil — six socles identiques,
 * c'est six poses ». Six socles identiques, sur un chantier, c'est presque
 * toujours un plan de travail de cuisine : on les aligne au-dessus, à la
 * hauteur du dosseret, à un socle par module de meuble. Le module standard de
 * la cuisine française fait soixante centimètres — c'est la largeur d'un
 * caisson, d'un four, d'un lave-vaisselle —, et c'est donc l'écart qui tombe
 * juste le plus souvent.
 *
 * CE N'EST QU'UN POINT DE DÉPART, ET C'EST VOULU. Il ne sert qu'à la PREMIÈRE
 * copie : dès la deuxième, la série reprend l'écart réel de la précédente
 * (voir `repeterFixture`). On pose le premier socle où on le veut, le second
 * au pas qu'on veut — au doigt s'il le faut —, et les suivants suivent. Un pas
 * qu'on ne peut pas corriger serait un pas qu'il faudrait régler ; celui-ci
 * s'oublie.
 */
export const PAS_SERIE = 0.6;

/**
 * OÙ TOMBE LA COPIE D'UN APPAREIL — la place, ou rien.
 *
 * Le calcul vit ICI, et pas dans le magasin, parce que DEUX endroits en ont
 * besoin : le geste qui pose la copie, et le bouton qui décide s'il doit
 * s'afficher. Un bouton qui ne commande rien donne à l'écran l'air d'être en
 * panne ; deux calculs de la même chose finissent par diverger, et l'on
 * afficherait alors un bouton qui échoue, ou l'on cacherait un geste possible.
 *
 * LE PAS, ET LE SENS. À droite d'abord — le sens de lecture d'une série. Le
 * pas est l'écart avec le voisin de série situé DE L'AUTRE CÔTÉ, celui qu'on
 * vient de poser : c'est lui qui porte l'intention. À défaut, `PAS_SERIE`.
 *
 * PUIS, SI RIEN N'EST LIBRE AU PAS VOULU, on cherche la place la plus proche
 * par crans d'entraxe. Un mur percé d'une porte-fenêtre ne doit pas faire
 * renoncer une série qui a largement la place à côté.
 *
 * Rend `null` quand il n'y a de place nulle part. Un appareil hors du mur, ou
 * dans une baie vitrée, est pire qu'une copie qu'on refait à la main.
 */
export function placeRepetee(v: {
  /** L'abscisse de l'appareil qu'on répète, sur la FACE. */
  x0: number;
  /** Sa hauteur, en mètres. */
  hauteur: number;
  /** Sa largeur d'encombrement (`FIXTURES[kind].w`). */
  largeur: number;
  /** La longueur de la face. */
  longueur: number;
  /** Les abscisses des appareils de la MÊME série : type, hauteur, face. */
  serie: number[];
  /** Tout ce que la face porte déjà : abscisse et hauteur. */
  occupe: { x: number; y: number }[];
  /** La maçonnerie disponible. Vide = le mur entier est plein. */
  pleins: { x0: number; x1: number }[];
}): number | null {
  const demi = v.largeur / 2;
  const dansLeMur = (px: number) => px - demi >= 0 && px + demi <= v.longueur;
  const surDuPlein = (px: number) =>
    v.pleins.length === 0 ||
    v.pleins.some((r) => px - demi >= r.x0 && px + demi <= r.x1);
  /*
    « LA PLACE EST PRISE » SE MESURE SUR LES BOÎTES, une par poste — la même
    règle qu'une pose ordinaire. Deux appareils à moins d'un entraxe
    partageraient une plaque, et ce n'est pas ce qu'on demande ici : une série
    le long d'un plan de travail, ce sont des boîtes séparées.
  */
  const libre = (px: number) =>
    !v.occupe.some(
      (o) =>
        Math.abs(px - o.x) < ENTRAXE - 1e-6 &&
        Math.abs(v.hauteur - o.y) < ENTRAXE - 1e-6,
    );
  const bonne = (px: number) => dansLeMur(px) && surDuPlein(px) && libre(px);

  const pasVers = (sens: 1 | -1) => {
    const derriere = v.serie
      .filter((x) => (v.x0 - x) * sens > 1e-6)
      .sort((a, b) => Math.abs(v.x0 - b) - Math.abs(v.x0 - a))
      .pop();
    return derriere === undefined ? PAS_SERIE : Math.abs(v.x0 - derriere);
  };

  for (const sens of [1, -1] as const) {
    const px = v.x0 + sens * pasVers(sens);
    if (bonne(px)) return px;
  }
  for (let k = 1; k <= 40; k++) {
    for (const sens of [1, -1] as const) {
      const px = v.x0 + sens * (pasVers(sens) + k * ENTRAXE);
      if (bonne(px)) return px;
    }
  }
  return null;
}

/** Largeur d'une plaque à N postes. */
export const plaqueLargeur = (n: number) =>
  Math.max(1, n - 1) * ENTRAXE + PLAQUE - (n > 1 ? 0 : 0);

/** Teintes par famille : le modèle 3D doit se lire sans légende. */
/*
  LES COULEURS DE FAMILLE, ASSEZ FONCÉES POUR S'ÉCRIRE.

  Elles ne servaient qu'à remplir des pastilles : sur un disque, un jaune vif
  passe très bien, et le sigle par-dessus était blanc. Depuis que le sigle est
  écrit À MÊME LE PLAN, dans la couleur de sa famille, c'est la couleur qui
  doit porter le texte — et un jaune à 90 % de luminosité sur fond blanc ne
  se lit pas, il se devine.

  Les cinq teintes gardent donc leur famille (ambre, bleu, violet, or, rouge)
  et descendent au niveau où un texte de neuf points tient sur du blanc.
*/
const C_PRISE = '#C8770A';
const C_CMD = '#1E7FBF';
const C_FAIBLE = '#7B3FC4';
const C_LUM = '#A8820B';
const C_DIVERS = '#D23B3B';
/** Le violet de l'interrupteur général, celui de la légende de l'architecte. */
export const C_GENERAL = '#7D3C98';

export const FIXTURES: Record<FixtureKind, FixtureSpec> = {
  prise: {
    label: 'Prise 16 A',
    short: 'PC',
    family: 'Prises',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_PRISE,
    std: 0.25,
    note: 'Axe usuel à 25 cm ; 5 cm au-dessus du sol au minimum.',
  },
  prise2: {
    label: 'Prise double',
    short: 'PC2',
    family: 'Prises',
    posts: ['prise', 'prise'],
    w: ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_PRISE,
    std: 0.25,
    // La règle du comptage est celle de `socketsOf` : un socle double
    // compte pour UN socle au titre de la norme — la note disait l'inverse.
    note: 'Deux socles sous une plaque : compte pour un socle au circuit.',
  },
  prise20: {
    label: 'Prise 20 A',
    short: '20',
    family: 'Prises',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_PRISE,
    std: 1.1,
    note: 'Four, lave-linge : circuit dédié. Souvent au-dessus du plan.',
  },
  prise32: {
    label: 'Prise 32 A',
    short: '32',
    family: 'Prises',
    w: 0.1,
    h: 0.1,
    depth: 0.014,
    color: C_PRISE,
    std: 0.25,
    note: 'Plaque de cuisson : axe à 12 cm du sol au minimum.',
  },
  inter: {
    label: 'Interrupteur',
    short: 'I',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_CMD,
    std: 1.1,
    note: 'Manette entre 0,90 m et 1,30 m du sol.',
  },
  interGeneral: {
    label: 'Interrupteur général',
    short: 'IG',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_GENERAL,
    std: 1.1,
    note: 'Près de la porte d’entrée : il coupe en sortant l’éclairage (ou les prises commandées) de tout le logement.',
    teintePropre: C_GENERAL,
  },
  videophone: {
    label: 'Vidéophone',
    short: 'VP',
    family: 'Courants faibles',
    w: 0.13,
    h: 0.2,
    depth: 0.025,
    color: C_FAIBLE,
    std: 1.5,
    note: 'L’écran à hauteur des yeux, près de l’entrée ; la platine de rue se câble à part.',
  },
  volet: {
    /*
      NÉ D'UNE PHOTO QUI MENTAIT — relevé du patron : « l'interrupteur
      affiche une image d'interrupteur volet roulant (…) trouve d'autres
      éléments à incorporer et rends-les fonctionnels ». La photo montrait
      un vrai produit ; l'élément existe maintenant pour de vrai : au
      catalogue, sur le plan, au devis.
    */
    label: 'Inter volet roulant',
    short: 'VR',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_CMD,
    std: 1.1,
    note: 'Près de la baie qu’il commande, à hauteur des autres commandes.',
  },
  va: {
    label: 'Va-et-vient',
    short: 'VV',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_CMD,
    std: 1.1,
    note: 'Deux points de commande pour un même éclairage.',
  },
  poussoir: {
    label: 'Bouton poussoir',
    short: 'BP',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_CMD,
    std: 1.1,
    note: 'Télérupteur : au-delà de deux points de commande.',
  },
  variateur: {
    label: 'Variateur',
    short: 'VAR',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.014,
    color: C_CMD,
    std: 1.1,
    note: 'Vérifier la compatibilité des lampes menées.',
  },
  rj45: {
    label: 'Prise RJ45',
    short: 'RJ',
    family: 'Courants faibles',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_FAIBLE,
    std: 0.25,
    note: 'Deux au minimum par pièce principale.',
  },
  tv: {
    label: 'Prise TV',
    short: 'TV',
    family: 'Courants faibles',
    w: 0.08,
    h: 0.08,
    depth: 0.022,
    color: C_FAIBLE,
    std: 0.25,
    note: 'Souvent doublée d’une prise 16 A et d’un RJ45.',
  },
  applique: {
    label: 'Applique murale',
    short: 'AP',
    family: 'Éclairage',
    w: 0.12,
    h: 0.12,
    depth: 0.06,
    color: C_LUM,
    std: 1.9,
    note: 'Hors volume dans une salle d’eau.',
  },
  tableau: {
    label: 'Tableau électrique',
    short: 'TAB',
    family: 'Divers',
    w: 0.55,
    h: 0.65,
    depth: 0.09,
    color: C_DIVERS,
    std: 1.35,
    note: 'Manettes entre 0,90 m et 1,80 m du sol.',
  },
  thermostat: {
    label: 'Thermostat',
    short: 'TH',
    family: 'Divers',
    w: 0.09,
    h: 0.09,
    depth: 0.02,
    color: C_DIVERS,
    std: 1.5,
    note: 'À l’abri des courants d’air et du soleil direct.',
  },
  sortieCable: {
    label: 'Sortie de câble',
    short: 'SC',
    family: 'Divers',
    w: 0.08,
    h: 0.08,
    depth: 0.02,
    color: C_DIVERS,
    std: 0.25,
    note: 'Sèche-serviettes, radiateur, volet roulant.',
  },
  boite: {
    label: 'Boîte de dérivation',
    short: 'BD',
    family: 'Divers',
    w: 0.1,
    h: 0.1,
    depth: 0.03,
    color: C_DIVERS,
    std: 2.3,
    note: 'Doit rester accessible après travaux.',
  },
  prise3: {
    label: 'Prise triple',
    short: 'PC3',
    family: 'Prises',
    posts: ['prise', 'prise', 'prise'],
    w: 2 * ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_PRISE,
    std: 0.25,
    note: 'Trois socles sous une plaque : compte pour deux socles au circuit.',
  },
  rj2: {
    label: 'RJ45 double',
    short: 'RJ2',
    family: 'Courants faibles',
    posts: ['rj45', 'rj45'],
    w: ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_FAIBLE,
    std: 0.25,
    note: 'Deux prises de communication sous une plaque.',
  },
  rjPrise: {
    label: 'RJ45 + prise',
    short: 'RJ+P',
    family: 'Courants faibles',
    posts: ['rj45', 'prise'],
    w: ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_FAIBLE,
    std: 0.25,
    note: 'Le poste télécom voisine toujours une prise 16 A : box, TV, bureau.',
  },
  rjPrise2: {
    label: 'RJ45 + prise double',
    short: 'RJ+2P',
    family: 'Courants faibles',
    posts: ['rj45', 'prise', 'prise'],
    w: 2 * ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_FAIBLE,
    std: 0.25,
    note: 'L’ensemble d’un coin bureau ou d’un meuble TV.',
  },
  tvPrise: {
    label: 'TV + prise',
    short: 'TV+P',
    family: 'Courants faibles',
    posts: ['tv', 'prise'],
    w: ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_FAIBLE,
    std: 0.25,
    note: 'Derrière un téléviseur, à la hauteur de son support.',
  },
  inter2: {
    label: 'Double interrupteur',
    short: 'I2',
    family: 'Commandes',
    posts: ['inter', 'inter'],
    w: ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_CMD,
    std: 1.1,
    note: 'Deux commandes sous une plaque : deux circuits d’éclairage.',
  },
  inter3: {
    label: 'Triple interrupteur',
    short: 'I3',
    family: 'Commandes',
    posts: ['inter', 'inter', 'inter'],
    w: 2 * ENTRAXE + PLAQUE,
    h: 0.082,
    depth: 0.022,
    color: C_CMD,
    std: 1.1,
    note: 'Trois commandes sous une plaque.',
  },
};

/** Fonctions réunies sous la plaque, de gauche à droite. */
export function postsOf(kind: FixtureKind): FixtureKind[] {
  return FIXTURES[kind]?.posts ?? [kind];
}

/**
 * Où percer, en mètres depuis le bord GAUCHE de la plaque.
 *
 * Les boîtes sont à l'entraxe, centrées sur la plaque : c'est ce que
 * l'électricien trace au crayon avant de sortir la scie cloche.
 */
export function boxOffsets(kind: FixtureKind): number[] {
  const n = postsOf(kind).length;
  const large = FIXTURES[kind].w;
  const premier = (large - (n - 1) * ENTRAXE) / 2;
  return Array.from({ length: n }, (_, i) => premier + i * ENTRAXE);
}

/** Le catalogue, rangé par famille : l'ordre du sélecteur. */
export const FIXTURE_FAMILIES: { name: string; kinds: FixtureKind[] }[] = [
  {
    name: 'Prises',
    kinds: ['prise', 'prise2', 'prise3', 'prise20', 'prise32'],
  },
  {
    name: 'Commandes',
    kinds: ['inter', 'inter2', 'inter3', 'va', 'poussoir', 'variateur', 'volet', 'interGeneral'],
  },
  {
    name: 'Courants faibles',
    kinds: ['rj45', 'rj2', 'rjPrise', 'rjPrise2', 'tv', 'tvPrise', 'videophone'],
  },
  { name: 'Éclairage', kinds: ['applique'] },
  { name: 'Divers', kinds: ['tableau', 'thermostat', 'sortieCable', 'boite'] },
];

export const FIXTURE_KINDS = FIXTURE_FAMILIES.flatMap((f) => f.kinds);

/**
 * Désignation posée SUR l'appareil en 3D.
 *
 * Le symbole gravé faisait joli et ne se lisait pas : à l'échelle d'un
 * logement, une plaque fait dix pixels, et le pictogramme qu'on y grave se
 * réduit à trois traits gris. Un mot se lit. Les symboles restent où ils
 * disent quelque chose : le plan 2D et la légende du PDF.
 */
const TAG_BASE: Partial<Record<FixtureKind, string>> = {
  prise: 'PC',
  prise20: 'PC 20A',
  prise32: 'PC 32A',
  inter: 'INT',
  interGeneral: 'INT GÉNÉRAL',
  videophone: 'VIDÉOPHONE',
  volet: 'VR',
  va: 'VV',
  poussoir: 'BP',
  variateur: 'VAR',
  rj45: 'RJ',
  tv: 'TV',
  applique: 'LUM',
  tableau: 'TABLEAU',
  thermostat: 'THERMO',
  sortieCable: 'SORTIE',
  boite: 'DÉRIV',
};

const MULTIPLE = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUADRUPLE '];

/**
 * Le mot d'un ensemble, quel qu'il soit : « PC », « DOUBLE PC »,
 * « RJ + PC »… Les postes identiques qui se suivent se comptent, le reste
 * s'énumère — un ensemble monté à la main se nomme donc exactement comme
 * l'appareil multiposte équivalent du catalogue.
 */
export function assemblyTag(kinds: FixtureKind[]): string {
  const lots: { kind: FixtureKind; n: number }[] = [];
  for (const k of kinds) {
    const last = lots[lots.length - 1];
    if (last && last.kind === k) last.n += 1;
    else lots.push({ kind: k, n: 1 });
  }
  return lots
    .map(({ kind, n }) => {
      const mot = TAG_BASE[kind] ?? FIXTURES[kind].short;
      return n > 1 ? `${MULTIPLE[Math.min(n, 4)]}${mot}` : mot;
    })
    .join(' + ');
}

/** La désignation d'un type du catalogue, postes déployés. */
export const fixtureTag = (kind: FixtureKind) => assemblyTag(postsOf(kind));

/** Retrait initial, aux deux cotes : 20 cm du coin bas. */
export const FIXTURE_MARGIN = 0.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Une face de mur, vue par quelqu'un qui se place devant.
 *
 * `A` est le bord GAUCHE tel qu'il apparaît de ce côté-là, `B` le bord droit.
 * `s0`/`s1` sont les abscisses, sur cette face, des extrémités `a` et `b` du
 * segment de mur — elles ne valent ni 0 ni `len` dès qu'un onglet de jonction
 * rallonge la face.
 */
export interface WallFace {
  A: Pt;
  B: Pt;
  len: number;
  /** Direction A→B, unitaire. */
  ux: number;
  uz: number;
  /** Normale sortante, tournée vers l'observateur. */
  nx: number;
  nz: number;
  s0: number;
  s1: number;
}

/** Quadrilatère d'un mur sans jonction : about droit aux deux bouts. */
function squareQuad(w: WallSeg): WallQuad {
  const len = segLength(w) || 1;
  const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
  const n = perpOf(u);
  const h = epaisseurDe(w) / 2;
  return {
    a1: { x: w.a.x + n.x * h, z: w.a.z + n.z * h },
    b1: { x: w.b.x + n.x * h, z: w.b.z + n.z * h },
    b2: { x: w.b.x - n.x * h, z: w.b.z - n.z * h },
    a2: { x: w.a.x - n.x * h, z: w.a.z - n.z * h },
  };
}

/**
 * Face d'un mur, du côté demandé.
 *
 * Le sens de A→B n'est pas anodin : de l'autre côté du mur, la gauche et la
 * droite s'échangent. On prend donc `a1→b1` d'un côté et `b2→a2` de l'autre,
 * ce qui donne dans les deux cas le sens gauche→droite de l'observateur.
 */
export function wallFace(
  wall: WallSeg,
  quad: WallQuad | undefined,
  side: 1 | -1,
): WallFace {
  const q = quad ?? squareQuad(wall);
  const A = side > 0 ? q.a1 : q.b2;
  const B = side > 0 ? q.b1 : q.a2;
  const len = Math.hypot(B.x - A.x, B.z - A.z) || 1e-6;
  const ux = (B.x - A.x) / len;
  const uz = (B.z - A.z) / len;
  const along = (p: Pt) => (p.x - A.x) * ux + (p.z - A.z) * uz;
  return {
    A,
    B,
    len,
    ux,
    uz,
    nx: -uz,
    nz: ux,
    s0: along(wall.a),
    s1: along(wall.b),
  };
}

/** Abscisse sur la face (m depuis le bord gauche) d'une cote de segment. */
export function faceX(face: WallFace, along: number): number {
  return face.s1 >= face.s0 ? face.s0 + along : face.s0 - along;
}

/** L'inverse : une abscisse lue sur la face redevient une cote de segment. */
export function fromFaceX(face: WallFace, x: number): number {
  return face.s1 >= face.s0 ? x - face.s0 : face.s0 - x;
}

/** Abscisse sur la face d'une fraction du segment (ce que livre `assignOpenings`). */
export function faceXofT(face: WallFace, t: number): number {
  return face.s0 + (face.s1 - face.s0) * t;
}

/** Point du sol, à l'aplomb de l'appareil, décalé de `out` devant le nu. */
export function facePoint(face: WallFace, x: number, out = 0): Pt {
  return {
    x: face.A.x + face.ux * x + face.nx * out,
    z: face.A.z + face.uz * x + face.nz * out,
  };
}

/**
 * De quel côté du mur se trouve la pièce. C'est la face que l'électricien
 * voit, donc celle qui reçoit l'appareil par défaut.
 */
export function interiorSide(
  wall: WallSeg,
  walls: WallSeg[],
  rooms?: RoomShape[],
): 1 | -1 {
  const part = roomParts(walls, rooms).find(
    (p) => p.walls.some((w) => w.id === wall.id) || p.roomId === roomOf(wall),
  );
  const inside = part?.labelAt ?? wallsCentroid(walls);
  const len = segLength(wall) || 1;
  const n = perpOf({
    x: (wall.b.x - wall.a.x) / len,
    z: (wall.b.z - wall.a.z) / len,
  });
  const mid = {
    x: (wall.a.x + wall.b.x) / 2,
    z: (wall.a.z + wall.b.z) / 2,
  };
  return (inside.x - mid.x) * n.x + (inside.z - mid.z) * n.z > 0 ? 1 : -1;
}

/**
 * LA PIÈCE D'UN CÔTÉ DU MUR — celle qu'on a devant soi quand on regarde
 * cette face. Relevé du patron : « on peut se tromper si le mur joint deux
 * pièces, d'un côté et de l'autre ». `roomOf` donne la pièce qui a relevé le
 * mur ; celle-ci se lit sur le plan : trois points pris à quarante
 * centimètres du nu, du côté voulu, et la pièce qui en contient le plus.
 * Une façade n'a rien dehors : `null`.
 */
export function pieceDuCote(
  wall: WallSeg,
  side: 1 | -1,
  walls: WallSeg[],
  rooms?: RoomShape[],
): string | null {
  const len = segLength(wall) || 1;
  const u = { x: (wall.b.x - wall.a.x) / len, z: (wall.b.z - wall.a.z) / len };
  const n = perpOf(u);
  const dedans = (q: { x: number; z: number }, pts: { x: number; z: number }[]) => {
    let oui = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.z > q.z !== b.z > q.z && q.x < ((b.x - a.x) * (q.z - a.z)) / (b.z - a.z) + a.x) oui = !oui;
    }
    return oui;
  };
  const parts = roomParts(walls, rooms).filter((p) => p.surface);
  const voix = new Map<string, number>();
  for (const t of [0.25, 0.5, 0.75]) {
    const q = {
      x: wall.a.x + u.x * len * t + n.x * side * 0.4,
      z: wall.a.z + u.z * len * t + n.z * side * 0.4,
    };
    const ici = parts.find((p) => dedans(q, p.surface!.pts));
    if (ici) voix.set(ici.roomId, (voix.get(ici.roomId) ?? 0) + 1);
  }
  let mieux: string | null = null;
  let max = 0;
  for (const [id, v] of voix) {
    if (v > max) {
      max = v;
      mieux = id;
    }
  }
  return mieux;
}

/**
 * Un appareil neuf, posé à 20 cm du coin bas gauche de la face — le point de
 * départ demandé, qu'on déplace ensuite au doigt ou à la cote.
 */
export function newFixture(
  id: string,
  kind: FixtureKind,
  wall: WallSeg,
  quad: WallQuad | undefined,
  side: 1 | -1,
): Fixture {
  const face = wallFace(wall, quad, side);
  const spec = FIXTURES[kind];
  // Un appareil large (un tableau) ne peut pas avoir son AXE à 20 cm du bord
  // sans déborder : on le recale au plus près possible du coin.
  const x = clamp(FIXTURE_MARGIN, Math.min(spec.w / 2, face.len / 2), face.len / 2);
  return {
    id,
    kind,
    wallId: wall.id,
    along: fromFaceX(face, x),
    // À SA hauteur normalisée, pas à 20 cm du sol.
    //
    // Tout arrivait à 20 cm : une prise y est chez elle, un interrupteur
    // non, et un tableau électrique y est carrément hors norme — il
    // s'annonçait « trop bas » à la seconde où on le posait. On pose donc
    // chaque appareil là où il se pose vraiment, quitte à le déplacer
    // ensuite.
    height: Math.min(
      Math.max(spec.std, spec.h / 2),
      Math.max(spec.h / 2, wall.height - spec.h / 2),
    ),
    side,
  };
}

/**
 * Rattache à leur nouveau mur ce qui était accroché aux anciens.
 *
 * C'est le défaut le plus coûteux qu'on ait trouvé : « Redresser le plan »,
 * l'ajout d'une cloison, toute retouche du graphe passent par
 * `splitAtJunctions` + `mergeColinear`. Un mur coupé en deux ne garde son
 * identifiant que sur le PREMIER morceau ; un mur fusionné ne garde que
 * celui du plus long. Les ouvertures étaient reprojetées, l'appareillage
 * non : une prise posée dans la seconde moitié d'un mur se retrouvait avec
 * une cote plus longue que son mur — dessinée dans le vide — et une prise
 * d'un mur fusionné disparaissait de l'écran, des comptages, des circuits
 * et du métré. Sans alerte, et sans rien à annuler puisque rien ne semblait
 * s'être passé.
 *
 * On reprojette donc par la POSITION : le point du monde où se trouve
 * l'appareil, reporté sur le mur le plus proche du nouveau jeu. La face est
 * conservée par sa normale — un appareil ne change pas de côté de cloison
 * parce qu'on a redressé le plan.
 */
export function reprojectFixtures(
  oldWalls: WallSeg[],
  newWalls: WallSeg[],
  fixtures: Fixture[],
): Fixture[] {
  if (newWalls.length === 0) return fixtures;
  const avant = new Map(oldWalls.map((w) => [w.id, w]));
  // Les onglets du nouveau jeu : la face d'un mur est PLUS COURTE que son
  // axe, et c'est sur la face que l'appareil se pose.
  const quads = wallQuads(newWalls);
  return fixtures.map((f) => {
    const w = avant.get(f.wallId);
    if (!w) return f;
    const len = segLength(w) || 1;
    const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
    const t = Math.min(len, Math.max(0, f.along));
    const p = { x: w.a.x + u.x * t, z: w.a.z + u.z * t };
    const n = perpOf(u);
    const dehors = { x: n.x * f.side, z: n.z * f.side };

    let cible = newWalls[0];
    let best = Infinity;
    for (const v of newWalls) {
      const d = pointOnSeg(p, v.a, v.b).dist;
      if (d < best) {
        best = d;
        cible = v;
      }
    }
    const lenC = segLength(cible) || 1;
    const uC = { x: (cible.b.x - cible.a.x) / lenC, z: (cible.b.z - cible.a.z) / lenC };
    const nC = perpOf(uC);
    const meme = dehors.x * nC.x + dehors.z * nC.z;
    const cote: 1 | -1 =
      Math.abs(meme) < 1e-9 ? f.side : meme > 0 ? 1 : -1;
    // On borne sur la FACE, à la demi-largeur de l'appareil : un tableau de
    // 55 cm recalé sur l'extrémité laissait la moitié de sa plaque dans le
    // vide, au-delà du coin. Et c'est bien la face qui compte — l'onglet la
    // raccourcit de l'épaisseur du mur. Plus court que l'appareil, le mur le
    // reçoit centré : c'est faux, mais c'est visible, donc corrigeable.
    const face = wallFace(cible, quads.get(cible.id), cote);
    const demi = Math.min(FIXTURES[f.kind].w / 2, face.len / 2);
    const brut = (p.x - cible.a.x) * uC.x + (p.z - cible.a.z) * uC.z;
    const x = Math.min(
      face.len - demi,
      Math.max(demi, faceX(face, brut)),
    );
    return {
      ...f,
      wallId: cible.id,
      along: fromFaceX(face, x),
      // Un mur retourné dans la reconstruction ne doit pas retourner ses
      // prises : on garde la face qui regarde du même côté.
      side: cote,
    };
  });
}

/**
 * Même reprojection, pour tout ce qui n'est accroché qu'à une cote : les
 * photos de repérage, aujourd'hui, et ce qui viendra s'y ajouter.
 */
export function reprojectAnchors<T extends { wallId: string; along: number }>(
  oldWalls: WallSeg[],
  newWalls: WallSeg[],
  items: T[],
): T[] {
  const faux = items.map((it) => ({
    id: 'x',
    kind: 'prise' as FixtureKind,
    wallId: it.wallId,
    along: it.along,
    height: 0,
    side: 1 as const,
  }));
  const remis = reprojectFixtures(oldWalls, newWalls, faux);
  return items.map((it, i) => ({
    ...it,
    wallId: remis[i].wallId,
    along: remis[i].along,
  }));
}

/** Cotes lues sur la face : gauche, droite, hauteur — ce que l'app affiche. */
export function fixtureDims(
  face: WallFace,
  f: Fixture,
): { left: number; right: number; height: number } {
  const x = faceX(face, f.along);
  return { left: x, right: face.len - x, height: f.height };
}


/**
 * Symboles de plan.
 *
 * Un rond de couleur avec deux lettres dedans n'est pas un plan
 * d'électricité : personne du métier ne le lit. Les symboles ci-dessous
 * suivent les conventions habituelles des schémas d'installation — celles de
 * la série NF EN 60617, à laquelle renvoient les plans NF C 15-100 : le socle
 * de prise est un demi-cercle barré de son diamètre avec une tige vers le
 * mur, l'interrupteur un point posé au mur avec sa manette, le point
 * lumineux un cercle croisé. Ce sont des symboles dessinés à la main d'après
 * ces conventions, pas une reproduction certifiée de la norme.
 *
 * Repère local : centré sur (0, 0), rayon utile 11, **+y vers le mur**. Le
 * plan tourne ensuite le symbole pour qu'il regarde sa face.
 */
export interface SymbolStroke {
  d: string;
  /** Tracé plein (le point d'un interrupteur, par exemple). */
  fill?: boolean;
}

/**
 * LE SOCLE DE PRISE — l'arc posé sur le mur, sa tige vers la pièce.
 *
 * Relevé du patron, plan d'architecte à l'appui (DCE « Romeo ») : « je
 * trouve ces plans plus intuitifs ». La prise y est un demi-cercle OUVERT
 * sur le mur, ses deux pointes contre la maçonnerie, et une courte tige qui
 * part vers la pièce ; « 2 » au bout de la tige pour une double, « RJ45 » à
 * côté pour la communication. Le demi-disque sur son diamètre, tige vers le
 * mur, se lisait à l'envers de ce que dessinent les architectes.
 *
 * Repère : +y vers le mur ; les pointes de l'arc touchent le mur (y = 10).
 */
const SOCLE: SymbolStroke[] = [
  { d: 'M-7 10 A7 7 0 0 1 7 10' },
  { d: 'M0 3 V-3' },
];

/**
 * L'ALIMENTATION DÉDIÉE — le rond de la légende (« Alim Lave vaisselle »,
 * « Alim Plaque »…), où s'écrit le sigle de l'appareil (`usage`) ou, à
 * défaut, le calibre.
 */
const ROND_ALIM: SymbolStroke[] = [
  { d: 'M-6.5 3 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0' },
];

/**
 * La prise de COMMUNICATION : le socle, barré d'un trait vertical.
 *
 * Une RJ45 se dessinait comme une prise de courant. Sur un plan où les deux
 * voisinent — c'est le cas de tous les séjours — rien ne les distinguait
 * que la couleur, qui disparaît à l'impression en noir et blanc.
 */
const TRAIT_VDI: SymbolStroke = { d: 'M0 9.5 V5.5' };

/**
 * L'INTERRUPTEUR : un petit rond contre le mur, sa manette et son drapeau —
 * le rond est creux, comme dans la légende de l'architecte.
 */
const POINT_MUR: SymbolStroke = {
  d: 'M0 7.6 m-2.4 0 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0',
};

const MANETTE: SymbolStroke[] = [
  POINT_MUR,
  { d: 'M1.2 5.5 L6 -4' },
  { d: 'M6 -4 L9.8 -2.3' },
];

/**
 * Symbole d'un ensemble : celui de chaque poste, décalé à l'entraxe.
 *
 * On ne dessine pas une « prise double » : on dessine deux prises côte à
 * côte, comme sur le mur. Le repère des symboles couvrant ±11 pour 82 mm de
 * plaque, l'entraxe y vaut 71/82 × 22.
 */
export function assemblySymbol(kind: FixtureKind): SymbolStroke[] {
  return postsSymbol(postsOf(kind), kind);
}

/**
 * Le symbole d'un ensemble, à partir de SES POSTES.
 *
 * Deux prises réunies à la main forment une double prise : sur le mur, c'est
 * une plaque de 153 mm avec deux mécanismes, exactement comme une « prise
 * double » du catalogue. Le plan, lui, dessinait le symbole de chaque
 * appareil à sa propre place — deux socles distants de 71 mm, soit deux
 * pixels à l'échelle d'un logement : on ne voyait qu'un socle, et rien ne
 * disait qu'ils étaient liés.
 *
 * On compose donc un symbole unique pour tout l'ensemble, comme le fait déjà
 * la vue 3D pour la plaque et comme le dit déjà la désignation.
 */
export function postsSymbol(
  posts: FixtureKind[],
  fallback?: FixtureKind,
): SymbolStroke[] {
  if (posts.length === 0) return fallback ? FIXTURE_SYMBOL[fallback] ?? [] : [];
  if (posts.length < 2) return FIXTURE_SYMBOL[posts[0]] ?? [];
  const pas = (ENTRAXE / PLAQUE) * SYMBOL_SPAN;
  const debut = -((posts.length - 1) * pas) / 2;
  const out: SymbolStroke[] = [];
  posts.forEach((post, i) => {
    const dx = debut + i * pas;
    for (const seg of FIXTURE_SYMBOL[post] ?? []) {
      // Décale le tracé : chaque nombre pair d'une commande est une abscisse.
      out.push({ ...seg, d: shiftPath(seg.d, dx) });
    }
  });
  return out;
}

/**
 * LE SYMBOLE COMPACT D'UN ENSEMBLE — relevé du patron : « si 3 prises en bloc
 * de 3, mettre l'icône prise avec un "x3" en petit à côté ; des icônes
 * légèrement plus petites, moins intrusives ».
 *
 * Trois socles côte à côte faisaient un symbole trois fois plus large, posé
 * contre le mur : sur une crédence de cuisine, une frise qui mangeait la
 * maçonnerie. Un ensemble de postes IDENTIQUES se dessine donc une fois, et
 * dit son nombre (`fois`) ; un ensemble MÊLÉ (RJ45 et deux prises) garde
 * chaque nature une fois, et compte celle qui se répète.
 */
export function symboleCompact(
  posts: FixtureKind[],
  fallback?: FixtureKind,
): { symbole: SymbolStroke[]; fois: number | null } {
  if (posts.length < 2) return { symbole: postsSymbol(posts, fallback), fois: null };
  /*
    UNE PRISE DE COMMUNICATION SE SUFFIT — relevé du patron : « un simple
    logo RJ, sans faire les prises à côté, se comprend comme RJ + PC ». Sur
    un plan, la RJ45 ou la TV d'un séjour a toujours ses prises à côté :
    le symbole de communication dit la plaque, les socles de courant
    n'ajoutaient qu'une frise.
  */
  const vdi = posts.filter((p) => COMMUNICATION.has(p));
  if (vdi.length > 0 && vdi.length < posts.length && posts.every((p) => COMMUNICATION.has(p) || COURANT.has(p))) {
    return symboleCompact(vdi, fallback);
  }
  const uniques = posts.filter((p, i) => posts.indexOf(p) === i);
  const repete = uniques
    .map((k) => posts.filter((p) => p === k).length)
    .reduce((m, n) => Math.max(m, n), 1);
  return { symbole: postsSymbol(uniques, fallback), fois: repete > 1 ? repete : null };
}

/** Les postes de communication, et les socles de courant qui les accompagnent. */
const COMMUNICATION = new Set<FixtureKind>(['rj45', 'tv']);
const COURANT = new Set<FixtureKind>(['prise', 'prise20', 'prise32']);

/** Décale les abscisses d'un chemin. Les arcs gardent leurs rayons. */
function shiftPath(d: string, dx: number): string {
  const toks = d.match(/[MmHVLAaZz]|-?\d*\.?\d+/g) ?? [];
  let out = '';
  let i = 0;
  const n = () => toks[i++];
  while (i < toks.length) {
    const cmd = n();
    const dec = (v: string) => (parseFloat(v) + dx).toFixed(2);
    if (cmd === 'M' || cmd === 'L') out += `${cmd}${dec(n())} ${n()} `;
    else if (cmd === 'H') out += `H${dec(n())} `;
    else if (cmd === 'V') out += `V${n()} `;
    else if (cmd === 'm' || cmd === 'a' || cmd === 'A') {
      // Relatifs (ou arcs) : seule la première commande absolue porte le
      // décalage, le reste suit tout seul.
      const args: string[] = [];
      while (i < toks.length && /^-?[\d.]+$/.test(toks[i])) args.push(n());
      if (cmd === 'A') {
        args[5] = (parseFloat(args[5]) + dx).toFixed(2);
      }
      out += `${cmd}${args.join(' ')} `;
    } else {
      out += `${cmd} `;
    }
  }
  return out.trim();
}

export const FIXTURE_SYMBOL: Record<FixtureKind, SymbolStroke[]> = {
  prise: SOCLE,
  /**
   * La prise DOUBLE, quand on la dessine seule (la légende, le devis) : deux
   * arcs côte à côte contre le mur. Sur le plan, l'ensemble se dessine d'un
   * arc et de son « 2 » (`symboleCompact`, `libelleDuSymbole`).
   */
  prise2: [
    { d: 'M-9 10 A4.5 4.5 0 0 1 0 10' },
    { d: 'M0 10 A4.5 4.5 0 0 1 9 10' },
    { d: 'M0 5.5 V-1' },
  ],
  // Les alimentations dédiées : le rond de la légende. Le calibre ou le
  // sigle de l'appareil s'y écrit (`libelleDuSymbole`) ; la 32 A porte en
  // plus son trait de spécialisé, pour se distinguer sans lire.
  prise20: ROND_ALIM,
  prise32: [...ROND_ALIM, { d: 'M-6.5 10 H6.5' }],
  inter: MANETTE,
  // L'interrupteur général : l'interrupteur, son rond marqué d'un point —
  // et sa teinte violette (`teintePropre`), comme dans la légende.
  interGeneral: [...MANETTE, { d: 'M0 7.6 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0', fill: true }],
  // Le vidéophone : le rond « VP » de la légende (`libelleDuSymbole`).
  videophone: ROND_ALIM,
  va: [...MANETTE, { d: 'M4.6 -1.1 L8.4 0.6' }],
  poussoir: [POINT_MUR, { d: 'M0 5.2 V-4' }, { d: 'M-5 -4 H5' }],
  variateur: [
    ...MANETTE,
    { d: 'M-9 -1 L-2.5 -6.5' },
    { d: 'M-9 -1 l3.4 0.5' },
    { d: 'M-9 -1 l0.5 -3.4' },
  ],
  // La communication : le socle, et son mot écrit à côté (« RJ45 », « TV »).
  // Le petit trait dans l'arc la distingue encore sans lire.
  rj45: [...SOCLE, TRAIT_VDI],
  tv: [...SOCLE, TRAIT_VDI, { d: 'M-2.5 6.5 H2.5' }],
  /*
    L'APPLIQUE : le demi-disque contre le mur, barré de sa croix — le point
    lumineux coupé en deux par la maçonnerie, comme sur le plan
    d'architecte.
  */
  applique: [
    { d: 'M-7 10 H7' },
    { d: 'M-7 10 A7 7 0 0 1 7 10' },
    { d: 'M-7 10 L4.95 5.05' },
    { d: 'M7 10 L-4.95 5.05' },
  ],
  tableau: [
    { d: 'M-9 -7 H9 V7 H-9 Z' },
    { d: 'M-4 7 L2 -7' },
    { d: 'M1 7 L7 -7' },
  ],
  volet: [
    { d: 'M-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0' },
    { d: 'M-2.5 -1 L0 -3.8 L2.5 -1' },
    { d: 'M-2.5 1 L0 3.8 L2.5 1' },
  ],
  thermostat: [
    { d: 'M-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0' },
    { d: 'M-4 0 H4' },
  ],
  /*
    LA SORTIE DE CÂBLE : « Alim. diverse » de la légende — le cadre et sa
    flèche brisée (clim, volet, portail, plaque câblée en direct).
  */
  sortieCable: [
    { d: 'M-9 -2 H9 V10 H-9 Z' },
    { d: 'M-6 6.5 H-1.5 L1.5 1.5 H6' },
    { d: 'M3.6 -0.2 L6 1.5 L3.6 3.2' },
  ],
  boite: [
    { d: 'M-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0' },
    { d: 'M0 -6 V-10' },
    { d: 'M0 6 V10' },
    { d: 'M-6 0 H-10' },
    { d: 'M6 0 H10' },
  ],
  // Les ensembles reprennent le symbole de leurs postes : la table ne porte
  // que le premier, `assemblySymbol()` compose le reste.
  prise3: SOCLE,
  rj2: [...SOCLE, TRAIT_VDI],
  rjPrise: SOCLE,
  rjPrise2: SOCLE,
  tvPrise: SOCLE,
  inter2: MANETTE,
  inter3: MANETTE,
};

/**
 * Le symbole, aplati en polylignes.
 *
 * Les tracés sont écrits en données de chemin SVG parce que c'est ce que
 * consomme le plan 2D. Le PDF et la 3D, eux, ne parlent pas SVG : ils ont
 * besoin de listes de points. Cette fonction fait la traduction, une fois
 * pour toutes — deux jeux de dessins finiraient par diverger.
 *
 * Le sous-ensemble employé se limite à `M m H V L A a Z`, et **tous les arcs
 * sont des demi-cercles dont la corde est le diamètre** : c'est ainsi que les
 * symboles ci-dessus sont écrits (deux demi-arcs pour un cercle, un seul pour
 * le socle de prise). Le centre est donc le milieu de la corde, et l'arc se
 * réduit à douze segments — pas besoin de la paramétrisation générale des
 * arcs SVG, qui serait une source de bogues pour rien.
 *
 * Repère de sortie : celui des symboles — x vers la droite, **y vers le
 * bas**, rayon utile 11.
 */
export function symbolPolylines(
  paths: SymbolStroke[],
): { pts: { x: number; y: number }[]; fill?: boolean }[] {
  const out: { pts: { x: number; y: number }[]; fill?: boolean }[] = [];
  for (const seg of paths) {
    const toks = seg.d.match(/[MmHVLAaZz]|-?\d*\.?\d+/g) ?? [];
    let i = 0;
    let x = 0;
    let y = 0;
    let pts: { x: number; y: number }[] = [];
    const flush = () => {
      if (pts.length >= 2) out.push({ pts, fill: seg.fill });
      pts = [];
    };
    const num = () => parseFloat(toks[i++]);
    while (i < toks.length) {
      const cmd = toks[i++];
      if (cmd === 'M') {
        flush();
        x = num();
        y = num();
        pts.push({ x, y });
      } else if (cmd === 'm') {
        x += num();
        y += num();
        if (pts.length === 0) pts.push({ x, y });
      } else if (cmd === 'H') {
        x = num();
        pts.push({ x, y });
      } else if (cmd === 'V') {
        y = num();
        pts.push({ x, y });
      } else if (cmd === 'L') {
        x = num();
        y = num();
        pts.push({ x, y });
      } else if (cmd === 'A' || cmd === 'a') {
        const r = num();
        num();
        num();
        num();
        const sweep = num();
        const ex = cmd === 'A' ? num() : x + num();
        const ey = cmd === 'A' ? num() : y + num();
        const mx = (x + ex) / 2;
        const my = (y + ey) / 2;
        const a0 = Math.atan2(y - my, x - mx);
        const a1 = Math.atan2(ey - my, ex - mx);
        let span = a1 - a0;
        if (sweep === 1 && span < 0) span += Math.PI * 2;
        if (sweep === 0 && span > 0) span -= Math.PI * 2;
        for (let t = 1; t <= 12; t++) {
          const a = a0 + (span * t) / 12;
          pts.push({ x: mx + r * Math.cos(a), y: my + r * Math.sin(a) });
        }
        x = ex;
        y = ey;
      } else if (cmd === 'Z' || cmd === 'z') {
        if (pts.length >= 2) pts.push(pts[0]);
      }
    }
    flush();
  }
  return out;
}

/** Demi-largeur du repère des symboles : ils tiennent tous dans ±11. */
export const SYMBOL_SPAN = 22;

/**
 * LE MOT DU SYMBOLE, comme sur un plan d'architecte : « 2 » au bout de la
 * tige d'une prise double, « RJ45 » ou « TV » à côté de son socle, le sigle
 * de l'appareil (« LV », « PL »…) ou le calibre dans le rond d'une
 * alimentation dédiée. Il se lit DROIT, quel que soit le mur : seul son
 * point d'ancrage (`ou`, dans le repère du symbole) tourne avec lui.
 *
 * `compte` : le mot dit le nombre de postes — le « ×2 » n'a plus à le dire.
 * `taille` : le corps du texte, en unités du repère.
 */
export function libelleDuSymbole(
  posts: FixtureKind[],
  kind: FixtureKind,
  usage?: string,
): { texte: string; ou: { x: number; y: number }; taille: number; compte: boolean } | null {
  const ps = posts.length > 0 ? posts : [kind];
  const tige = { x: 0, y: -9 };
  if (ps.length === 1 && (ps[0] === 'prise20' || ps[0] === 'prise32')) {
    const texte = usage || (ps[0] === 'prise20' ? '20A' : '32A');
    return { texte, ou: { x: 0, y: 3 }, taille: texte.length > 2 ? 4.6 : 5.6, compte: false };
  }
  if (ps.length === 1 && ps[0] === 'videophone') {
    return { texte: 'VP', ou: { x: 0, y: 3 }, taille: 5.6, compte: false };
  }
  if (ps.length === 1 && ps[0] === 'sortieCable') {
    return usage ? { texte: usage, ou: { x: 0, y: -8 }, taille: 6, compte: false } : null;
  }
  const rj = ps.filter((p) => p === 'rj45').length;
  const tv = ps.filter((p) => p === 'tv').length;
  if (rj > 0) return { texte: rj > 1 ? `RJ45×${rj}` : 'RJ45', ou: tige, taille: 5.4, compte: rj > 1 };
  if (tv > 0) return { texte: 'TV', ou: tige, taille: 6, compte: false };
  if (ps.every((p) => p === 'prise')) {
    if (usage) return { texte: usage, ou: tige, taille: 6, compte: false };
    return ps.length > 1 ? { texte: String(ps.length), ou: tige, taille: 6.5, compte: true } : null;
  }
  return null;
}

/**
 * Un point du repère d'un symbole, posé sur la feuille comme `symbolePose`
 * pose ses traits — c'est là que s'ancre son mot.
 */
export function pointDuSymbole(
  p: { x: number; y: number },
  cx: number,
  cy: number,
  k: number,
  versLeMur: { x: number; y: number } = { x: 0, y: -1 },
): { x: number; y: number } {
  const w = versLeMur;
  const e = { x: -w.y, y: w.x };
  return { x: cx + (p.x * e.x + p.y * w.x) * k, y: cy + (p.x * e.y + p.y * w.y) * k };
}

/**
 * JUSQU'OÙ UN SYMBOLE DESCEND VERS SON MUR, dans son repère.
 *
 * Le bas du repère, c'est le mur : la tige du socle descend jusqu'à 10, le
 * point de l'interrupteur jusqu'à 10,4. C'est là que le filet doit
 * s'arrêter — voir `filetJusquAuSymbole`.
 */
export function porteeVersLeMur(paths: SymbolStroke[]): number {
  let m = 0;
  for (const { pts } of symbolPolylines(paths)) {
    for (const p of pts) m = Math.max(m, p.y);
  }
  return m;
}

/**
 * LE SYMBOLE POSÉ SUR LA FEUILLE, TOURNÉ VERS SON MUR — relevé du patron :
 * « les icônes doivent être tournées de façon à comprendre sur quel mur
 * elles se posent : sur un mur à 90°, la prise aussi est à 90° ».
 *
 * `versLeMur` : la direction du mur vue du centre, unitaire, dans le repère
 * de la feuille (y vers le HAUT, celui du PDF). Le bas du symbole — sa
 * tige — est envoyé dessus ; sa droite, un quart de tour plus loin. Par
 * défaut (0, −1) : le symbole droit, tige vers le bas de la feuille.
 */
export function symbolePose(
  paths: SymbolStroke[],
  cx: number,
  cy: number,
  k: number,
  versLeMur: { x: number; y: number } = { x: 0, y: -1 },
): { pts: { x: number; y: number }[]; fill?: boolean }[] {
  const w = versLeMur;
  const e = { x: -w.y, y: w.x };
  return symbolPolylines(paths).map(({ pts, fill }) => ({
    pts: pts.map((p) => ({
      x: cx + (p.x * e.x + p.y * w.x) * k,
      y: cy + (p.x * e.y + p.y * w.y) * k,
    })),
    fill,
  }));
}

/**
 * LE FILET S'ARRÊTE AVANT LE SYMBOLE — relevé du patron : « le trait rouge
 * ne doit pas traverser l'icône mais s'arrêter 1 px avant ».
 *
 * Le filet relie le mur (`ancre`) au symbole (`centre`) ; il filait jusqu'au
 * centre et barrait le dessin. Il finit maintenant au bout de la tige, plus
 * `jeu` — la demi-épaisseur des traits et le pixel d'air demandé. Rend
 * aussi la direction du mur vue du symbole : c'est elle qui le tourne.
 * `bout` vaut `null` quand le symbole touche déjà son mur : rien à tracer.
 */
export function filetJusquAuSymbole(
  ancre: { x: number; y: number },
  centre: { x: number; y: number },
  paths: SymbolStroke[],
  echelle: number,
  jeu: number,
): { versLeMur: { x: number; y: number }; bout: { x: number; y: number } | null } {
  const dx = ancre.x - centre.x;
  const dy = ancre.y - centre.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return { versLeMur: { x: 0, y: -1 }, bout: null };
  const versLeMur = { x: dx / L, y: dy / L };
  const arret = porteeVersLeMur(paths) * echelle + jeu;
  if (L <= arret) return { versLeMur, bout: null };
  return {
    versLeMur,
    bout: { x: centre.x + versLeMur.x * arret, y: centre.y + versLeMur.y * arret },
  };
}

/**
 * Mention portée à côté du symbole quand le dessin seul ne suffit pas : le
 * socle d'une prise 20 A est le même que celui d'une 16 A, seule
 * l'intensité change, et un plan l'écrit.
 */
export const FIXTURE_TAG: Partial<Record<FixtureKind, string>> = {
  prise20: '20A',
  prise32: '32A',
  rj45: 'RJ',
  rj2: 'RJ',
  rjPrise: 'RJ',
  rjPrise2: 'RJ',
  tv: 'TV',
  tvPrise: 'TV',
};

/**
 * Rang d'empilement des appareils qui tombent au même point du plan.
 *
 * Vu de dessus, une prise à 25 cm et un interrupteur à 1,10 m sur le même
 * point de mur se superposent EXACTEMENT : on n'en voyait qu'un, et le plan
 * mentait. Ils s'échelonnent donc le long de leur filet de rappel, du mur
 * vers l'intérieur de la pièce, dans l'ordre où ils ont été posés.
 */
export function stackRanks(
  items: { id: string; wallId: string; side: 1 | -1; x: number }[],
): Map<string, number> {
  const seen = new Map<string, number>();
  const out = new Map<string, number>();
  for (const it of items) {
    // Seau de 12 cm : deux appareils plus proches que ça se gêneraient.
    const key = `${it.wallId}|${it.side}|${Math.round(it.x / 0.12)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    out.set(it.id, n);
  }
  return out;
}

/**
 * Deux appareils tombent-ils au même endroit du mur ?
 *
 * « Au même endroit » ne veut pas dire « au millimètre » : on pose un RJ45
 * *à peu près* sur la prise, et c'est justement le geste qui doit déclencher
 * la proposition de les réunir. La tolérance est donc celle d'un poste.
 */
export function overlaps(
  a: { x: number; y: number; kind: FixtureKind },
  b: { x: number; y: number; kind: FixtureKind },
): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (
    dx < (FIXTURES[a.kind].w + FIXTURES[b.kind].w) / 2 &&
    dy < (FIXTURES[a.kind].h + FIXTURES[b.kind].h) / 2
  );
}

/** Côté où poser le second poste d'un ensemble. */
export type PlateSide = 'gauche' | 'droite' | 'haut' | 'bas';

export const PLATE_SIDES: { key: PlateSide; label: string; arrow: string }[] = [
  { key: 'gauche', label: 'Gauche', arrow: 'M15 5 L8 12 l7 7' },
  { key: 'droite', label: 'Droite', arrow: 'M9 5 L16 12 l-7 7' },
  { key: 'haut', label: 'Haut', arrow: 'M5 15 L12 8 l7 7' },
  { key: 'bas', label: 'Bas', arrow: 'M5 9 L12 16 l7 -7' },
];

/**
 * Position du second poste, à l'entraxe du premier.
 *
 * Le premier ne bouge pas : c'est lui qu'on a placé à la cote, on ne va pas
 * le déplacer parce qu'un second arrive.
 */
export function plateSlot(
  base: { x: number; y: number },
  side: PlateSide,
): { x: number; y: number } {
  switch (side) {
    case 'gauche':
      return { x: base.x - ENTRAXE, y: base.y };
    case 'droite':
      return { x: base.x + ENTRAXE, y: base.y };
    case 'haut':
      return { x: base.x, y: base.y + ENTRAXE };
    default:
      return { x: base.x, y: base.y - ENTRAXE };
  }
}

/**
 * Nombre de socles 16 A au sens de la norme.
 *
 * « Un socle double compte pour un socle, un socle triple pour deux. » La
 * règle surprend, mais c'est celle qui plafonne les circuits — et elle vaut
 * aussi bien pour l'équipement minimal d'une pièce que pour la charge d'un
 * circuit. Compter les trous donnerait des circuits sous-chargés et des
 * pièces réputées équipées qui ne le sont pas.
 */
export function socketsOf(kind: FixtureKind): number {
  const n = postsOf(kind).filter((k) => k === 'prise').length;
  return n <= 1 ? n : Math.ceil(n / 2);
}

/** Nombre de prises de communication portées par l'appareil. */
export function rjOf(kind: FixtureKind): number {
  return postsOf(kind).filter((k) => k === 'rj45').length;
}

/** Nombre d'appareils par pièce et par type, pour le récapitulatif. */
export function countByKind(fixtures: Fixture[]): [FixtureKind, number][] {
  const n = new Map<FixtureKind, number>();
  for (const f of fixtures) n.set(f.kind, (n.get(f.kind) ?? 0) + 1);
  return FIXTURE_KINDS.filter((k) => n.has(k)).map((k) => [k, n.get(k) ?? 0]);
}


/**
 * Un tronçon de maçonnerie, en mètres depuis le début de la face.
 *
 * C'est la forme dont l'appareillage a besoin : `wallRuns` raisonne en
 * fractions de l'axe du mur, la pose d'une prise en mètres sur la face.
 */
export interface Masonry {
  x0: number;
  x1: number;
}

/**
 * Les retours de mur d'une face, dans son propre repère.
 *
 * Un mur percé d'une baie n'est pas une surface continue : c'est un retour,
 * un trou, un retour. Les fractions de `wallRuns` portent sur l'AXE du mur ;
 * la face, elle, est raccourcie de l'épaisseur du mur à chaque about quand
 * elle est en tableau. On convertit donc, plutôt que d'appliquer des
 * fractions d'axe à une longueur de face — l'erreur ferait glisser chaque
 * retour de quelques centimètres, soit exactement l'ordre de grandeur d'une
 * plaque.
 */
export function masonryRuns(
  runs: { kind: string; t0: number; t1: number }[],
  wallLength: number,
  face: { len: number; s0?: number; s1?: number },
): Masonry[] {
  if (wallLength < 1e-6) return [{ x0: 0, x1: face.len }];
  const pleins = runs.filter((r) => r.kind === 'mur');
  if (pleins.length === 0) return [{ x0: 0, x1: face.len }];
  // Le décalage entre l'axe et la face : la face commence à `marge` sur
  // l'axe, et se termine à `wallLength - marge`.
  const marge = (wallLength - face.len) / 2;
  /*
    LA FACE DE DERRIÈRE VA DANS L'AUTRE SENS — revue « Nicolas » : vue côté
    −1, la face court de b vers a ; la formule la lisait de a vers b, et les
    retours tombaient en miroir — une prise acceptée au milieu d'une porte,
    des appareils repoussés de dix à vingt centimètres sans raison. Avec les
    abscisses de la face (`s0`, `s1`), chaque fraction se place juste, et
    l'onglet de chaque bout compte pour ce qu'il est.
  */
  const enX = (t: number) =>
    face.s0 !== undefined && face.s1 !== undefined
      ? face.s0 + (face.s1 - face.s0) * t
      : t * wallLength - marge;
  const out: Masonry[] = [];
  for (const r of pleins) {
    const x0 = Math.max(0, Math.min(enX(r.t0), enX(r.t1)));
    const x1 = Math.min(face.len, Math.max(enX(r.t0), enX(r.t1)));
    if (x1 - x0 > 0.01) out.push({ x0, x1 });
  }
  out.sort((m, q) => m.x0 - q.x0);
  return out.length > 0 ? out : [{ x0: 0, x1: face.len }];
}

/**
 * LE RETOUR QUI PORTE UNE COTE — pour nommer ce qu'on photographie.
 *
 * Relevé du patron : « un retour de mur doit aussi pouvoir avoir sa photo,
 * sans prendre tout le mur ». Une photo est punaisée à une ABSCISSE sur la
 * face ; le pan de maçonnerie qui la porte se déduit — pas de champ de plus
 * à stocker, et le rattachement ne peut pas mentir : il se recalcule au
 * moindre coup de crayon sur les ouvertures.
 *
 * Le numéro rendu est celui qu'on lit sur la feuille, à partir de 1. Zéro
 * veut dire « tout le mur » : un mur d'un seul tenant n'a pas de retour à
 * nommer, et une cote tombée dans le vide d'une baie non plus.
 */
export function retourALaCote(
  retours: { x0: number; x1: number }[],
  x: number,
): number {
  if (retours.length < 2) return 0;
  const i = retours.findIndex((r) => x >= r.x0 && x <= r.x1);
  return i < 0 ? 0 : i + 1;
}

/**
 * LES AXES DES RETOURS — ce sur quoi le doigt s'accroche.
 *
 * Un mur a son milieu ; un retour de mur n'avait rien. On glissait un
 * interrupteur sur les trente centimètres entre l'angle et l'huisserie en
 * visant à l'œil, alors que c'est justement là que la pose se centre : un
 * appareil décalé de deux centimètres dans un tableau de porte se voit
 * depuis le couloir.
 *
 * Un retour qui ne peut pas recevoir la plaque ENTIÈRE n'offre pas son
 * axe : s'y accrocher mènerait à une position que `snapToMasonry`
 * défferait aussitôt — le doigt collerait à un repère fantôme.
 */
export function masonryAxes(runs: Masonry[], width: number): number[] {
  return runs
    .filter((r) => r.x1 - r.x0 >= width)
    .map((r) => (r.x0 + r.x1) / 2);
}

/**
 * Ramène un appareil sur la MAÇONNERIE la plus proche.
 *
 * Rien n'empêche de poser une prise au milieu d'une porte-fenêtre : le
 * mur vu de face montre bien la baie, mais le doigt la traverse sans
 * résistance, et l'appareil part au métré comme s'il tenait sur du vide.
 * Or c'est PRÉCISÉMENT sur les retours — les trente centimètres de mur
 * entre l'angle et l'huisserie — qu'on pose l'interrupteur d'entrée.
 *
 * On choisit donc le retour qui peut accueillir l'appareil ENTIER et dont
 * on est le plus proche, puis on y borne la position. Un retour trop étroit
 * pour la plaque est écarté : mieux vaut la poser à côté que déborder sur
 * l'huisserie.
 */
export function snapToMasonry(
  runs: Masonry[],
  x: number,
  halfWidth: number,
  faceLen: number,
): number {
  const utiles = runs.filter((r) => r.x1 - r.x0 >= halfWidth * 2);
  if (utiles.length === 0) {
    // Aucun retour assez large : on garde la face entière, en la bornant.
    return Math.min(Math.max(x, halfWidth), Math.max(halfWidth, faceLen - halfWidth));
  }
  let best = utiles[0];
  let dist = Infinity;
  for (const r of utiles) {
    const d = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
    if (d < dist) {
      dist = d;
      best = r;
    }
  }
  return Math.min(Math.max(x, best.x0 + halfWidth), best.x1 - halfWidth);
}
