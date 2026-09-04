/**
 * LA TEINTE D'ACCENT — l'outil qu'on a dans la main devient un peu le sien.
 *
 * Neuvième des dix améliorations. Un seul bleu tenait toute l'application
 * depuis le premier jour. C'est un bon bleu, et il reste celui par défaut ;
 * mais un outil qu'on ouvre tous les jours de l'année, on aime qu'il soit à
 * soi. Quatre teintes, dans les réglages, à côté du clair et du sombre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI DÉCIDE DE LA LISTE : LES COULEURS DÉJÀ PRISES.
 *
 * Le plan parle en couleurs, et ce ne sont pas des ornements — l'ambre est
 * une PORTE, le ciel une FENÊTRE, le vert la CONFORMITÉ, le rouge le DANGER.
 * L'accent, lui, désigne ce qu'on peut toucher, et il se pose sur le plan
 * puisqu'un mur sélectionné le porte. Un accent vert dirait « conforme » sur
 * un mur qui n'est que choisi ; un accent ambre dirait « porte ».
 *
 * C'est pour cette raison — et pas par goût — que l'ambre et le vert, les
 * deux qu'on proposerait spontanément, ne figurent pas ici. Restent
 * l'indigo, la prune et le graphite, qui ne veulent rien dire sur un plan.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ET LE PIÈGE, QUI EST INVISIBLE À LA LECTURE : LE CACHE DES STYLES.
 *
 * `themedStyles` mémorise ses feuilles PAR IDENTITÉ DE PALETTE — une
 * `Map<Palette, T>`. Il n'y en avait que deux, `light` et `dark`, deux objets
 * constants : le cache tombait juste à chaque fois. Une palette fabriquée à
 * la volée à chaque rendu ferait manquer le cache À CHAQUE IMAGE,
 * reconstruirait toutes les feuilles de style de l'écran, et remplirait la
 * `Map` jusqu'à ce que la mémoire cède. Le défaut ne se voit pas :
 * l'application est juste devenue lente, et personne ne sait quand.
 *
 * Chaque couple (palette, accent) n'est donc fabriqué QU'UNE FOIS, gardé dans
 * une `WeakMap`, et rendu tel quel ensuite. L'accent par défaut, lui, rend la
 * palette de base SANS COPIE : rien ne change pour qui n'a rien choisi, pas
 * même une adresse mémoire, donc pas une feuille de style à refaire.
 */
/*
  L'IMPORT EST DE TYPE SEULEMENT, ET C'EST VOULU.

  `theme` appelle `paletteTeintee` ; si ce module lui demandait en retour ses
  palettes `light` et `dark`, les deux se tiendraient par la manche au
  chargement — un cycle qui marche jusqu'au jour où l'ordre d'évaluation
  change et où l'un des deux voit `undefined`. Le mode est donc DIT par
  l'appelant, qui le connaît déjà, et les teintes d'origine sont écrites ici
  en toutes lettres. Le banc vérifie qu'elles sont bien celles du thème.
*/
import type { Palette } from '../theme';

/** Les trois bleus d'un accent, pour un mode d'affichage. */
export interface JeuAccent {
  blue: string;
  blueDark: string;
  blueSoft: string;
}

export interface Accent {
  cle: string;
  nom: string;
  clair: JeuAccent;
  sombre: JeuAccent;
}

/** L'accent d'origine : celui de toujours. */
export const ACCENT_DEFAUT = 'bleu';

export const ACCENTS: Accent[] = [
  {
    cle: ACCENT_DEFAUT,
    nom: 'Bleu',
    // Les teintes d'origine du thème, écrites ici : voir l'import de type.
    clair: { blue: '#1F5BFF', blueDark: '#0E3FD8', blueSoft: '#EBF0FF' },
    sombre: { blue: '#3D77FF', blueDark: '#2A5CE8', blueSoft: '#17264A' },
  },
  {
    cle: 'indigo',
    nom: 'Indigo',
    clair: { blue: '#5A4CF0', blueDark: '#3F31D6', blueSoft: '#EEECFE' },
    sombre: { blue: '#7C6FFF', blueDark: '#5A4CF0', blueSoft: '#211C46' },
  },
  {
    cle: 'prune',
    nom: 'Prune',
    clair: { blue: '#9A3FA8', blueDark: '#7B2C88', blueSoft: '#F9EDFB' },
    sombre: { blue: '#B764C4', blueDark: '#9A3FA8', blueSoft: '#331539' },
  },
  {
    /*
      LE GRAPHITE — pour qui ne veut aucune couleur.

      Ce n'est pas une teinte de moins, c'est un choix : sur un plan déjà
      chargé de portes ambre, de fenêtres bleu ciel et de réserves rouges,
      un accent presque neutre laisse le dessin parler seul. C'est le
      réglage que demandent ceux qui impriment beaucoup.
    */
    cle: 'graphite',
    nom: 'Graphite',
    clair: { blue: '#39424F', blueDark: '#232A34', blueSoft: '#ECEEF1' },
    sombre: { blue: '#8B96A6', blueDark: '#6B7688', blueSoft: '#232A34' },
  },
];

const PAR_CLE = new Map(ACCENTS.map((a) => [a.cle, a]));

/** Cette clé désigne-t-elle un accent connu ? */
export function estUnAccent(cle: unknown): boolean {
  return typeof cle === 'string' && PAR_CLE.has(cle);
}

/*
  LES PALETTES TEINTÉES SE GARDENT PAR IDENTITÉ DE BASE.

  Une `WeakMap` sur la palette d'origine, et dedans une teinte par accent :
  chaque couple (palette, accent) ne se fabrique qu'UNE fois, et rend ensuite
  toujours le même objet. C'est ce qui permet au cache de `themedStyles`, qui
  mémorise par identité, de tomber juste. Faible, parce qu'une palette qui ne
  sert plus n'a aucune raison de retenir ses variantes.
*/
const TEINTEES = new WeakMap<Palette, Map<string, Palette>>();

/**
 * La palette de base, habillée de l'accent demandé.
 *
 * Rend TOUJOURS le même objet pour un même couple (palette, accent). L'accent
 * par défaut — et toute clé inconnue, qui peut venir d'un réglage écrit par
 * une version plus récente — rend la palette de base ELLE-MÊME, sans copie :
 * rien ne change pour qui n'a rien choisi, pas même une adresse mémoire,
 * donc pas une feuille de style à refaire.
 */
export function paletteTeintee(
  base: Palette,
  cle: string | null | undefined,
  mode: 'clair' | 'sombre' = 'clair',
): Palette {
  if (!cle || cle === ACCENT_DEFAUT) return base;
  const accent = PAR_CLE.get(cle);
  if (!accent) return base;
  let variantes = TEINTEES.get(base);
  if (!variantes) {
    variantes = new Map();
    TEINTEES.set(base, variantes);
  }
  const memoire = `${cle}:${mode}`;
  let teintee = variantes.get(memoire);
  if (!teintee) {
    teintee = { ...base, ...(mode === 'sombre' ? accent.sombre : accent.clair) };
    variantes.set(memoire, teintee);
  }
  return teintee;
}
