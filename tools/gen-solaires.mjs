/**
 * Vend en dur le jeu d'icônes « Solar Bold » : API Iconify → src/ui/solaires.ts.
 *
 *   node tools/gen-solaires.mjs
 *
 * Le patron a choisi le jeu (collection SVGRepo « Solar Bold Icons », le
 * même que le préfixe `solar:` d'Iconify, © Solar Icons, CC BY 4.0). On ne
 * télécharge RIEN à l'exécution : ce script tire chaque tracé une fois,
 * et une icône introuvable casse la génération — pas le téléphone.
 *
 * Chaque clé de l'app essaie ses candidats DANS L'ORDRE : le premier que
 * l'API connaît gagne. Les tracés d'une icône sont concaténés en un seul
 * chemin (le rendu est en silhouette, `fill-rule evenodd`).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** clé de l'app → candidats Solar Bold, du préféré au repli. */
const CHOIX = {
  // --- la rangée d'outils du plan et de la 3D
  /*
    LE PLAFOND EST UN LUSTRE — relevé du patron, lien à l'appui :
    `svgrepo.com/svg/525753/chandelier`, « à la place de l'icône de
    plafond ».

    C'était une lampe (`lamp-bold`) : posée dans la rangée, à côté du
    fauteuil des meubles et de l'éclair de l'appareillage, elle se lisait
    comme une lampe de chevet — un objet qu'on POSE, pas un plafond qu'on
    équipe. Le lustre, lui, ne peut être qu'au plafond.
  */
  plafond: ['chandelier-bold'],
  save: ['diskette-bold'],
  edit: ['pen-bold'],
  ruler: ['ruler-bold'],
  surface: ['layers-minimalistic-bold', 'layers-bold'],
  elec: ['bolt-bold'],
  furniture: ['armchair-2-bold', 'armchair-bold'],
  colors: ['palette-bold'],
  room: ['home-add-bold', 'home-add-angle-bold'],
  image: ['camera-bold'],
  model: ['box-bold'],
  rooms: ['widget-bold'],
  undo: ['undo-left-bold', 'undo-left-round-bold'],
  // « Refaire » : la MÊME flèche que l'annulation, retournée. Deux dessins
  // différents pour deux gestes symétriques se liraient comme deux
  // fonctions sans rapport.
  redo: ['undo-right-bold', 'undo-right-round-bold'],
  square: ['ruler-angular-bold'],
  check: ['magnifer-bold'],
  gaines: ['routing-2-bold', 'routing-bold'],
  murs: ['buildings-bold', 'buildings-2-bold'],
  appareil: ['socket-bold'],
  /*
    LES QUATRE FLÈCHES DU PAVÉ DE RÉGLAGE — relevé du patron, liens à
    l'appui : `square-alt-arrow-left/down/right/up`.

    C'étaient quatre chevrons tracés à la main, au trait, dans une app qui
    ne dessine qu'en silhouette : posés sous une rangée de pleins, ils se
    lisaient comme des traits de construction plutôt que comme des boutons.
    Le carré plein leur donne le poids d'une touche — et c'est bien d'une
    touche qu'il s'agit : on l'appuie dix fois de suite pour gagner dix
    centimètres.
  */
  flecheGauche: ['square-alt-arrow-left-bold'],
  flecheDroite: ['square-alt-arrow-right-bold'],
  flecheHaut: ['square-alt-arrow-up-bold'],
  flecheBas: ['square-alt-arrow-down-bold'],
  /*
    LE V DE VALIDATION, ET LE MAILLON — relevé du patron, liens à l'appui :
    `unread` (un V dans un carré) et `link-square`.

    Les deux étaient tracés à la main dans le bandeau du plafond, au trait,
    pendant que leurs voisins venaient du jeu. Un pictogramme dessiné à part
    tient tant qu'on ne le regarde pas à côté des autres.
  */
  valider: ['unread-bold'],
  lienCarre: ['link-square-bold'],
  /*
    LE VENTILATEUR DE PLAFOND — relevé du patron : « remplace le ventilateur
    actuel par cette icône » (`black-hole-3`), « de la couleur que tu ferais
    la lumière ».

    Vu du dessous, un ventilateur de plafond n'a pas de pales : il a des
    cercles. C'est exactement ce que dessine ce tracé-là, et c'est ce qu'on
    voit sur un plan. Sa teinte ne change pas : le ventilateur appartient
    déjà à la famille ÉCLAIRAGE (il porte un point lumineux et se commande),
    et il en portait donc déjà l'ambre.
  */
  ventilateur: ['black-hole-3-bold'],
  reperes: ['target-bold'],
  plus: ['add-circle-bold'],
  // --- les feuilles du dossier (écran d'export)
  vues3d: ['box-minimalistic-bold'],
  metre: ['clipboard-list-bold', 'document-text-bold'],
  cotes2d: ['ruler-pen-bold'],
  cotes3d: ['ruler-cross-pen-bold'],
  meubles: ['armchair-2-bold', 'armchair-bold'],
  ouvertures: ['exit-bold'],
  couleurs: ['palette-bold'],
  // Une élévation, c'est une HAUTEUR qu'on cote — pas une image : les deux
  // flèches verticales, jamais une galerie (relevé du patron).
  elevations: ['sort-vertical-bold', 'round-sort-vertical-bold', 'arrow-up-bold'],
  schema: ['server-minimalistic-bold', 'server-2-bold'],
  // --- le menu du mur, et le crayon du bandeau
  supprimer: ['trash-bin-trash-bold', 'trash-bin-minimalistic-bold'],
  crayon: ['pen-bold'],
  // --- le popup « avis contre un essai »
  etoile: ['star-bold'],
  // --- le bloc profil de l'accueil
  avatar: ['user-circle-bold', 'user-rounded-bold'],
  // --- le bouton de thème (fiches SVGRepo 526045 et 526341, désignées
  //     par le patron : la lune et le soleil du même jeu)
  lune: ['moon-bold'],
  soleil: ['sun-bold', 'sun-2-bold'],
  // --- l'apparence « Système » de la page profil : c'est le TÉLÉPHONE qui
  //     décide, l'icône le dit — un soleil ou une lune y désigneraient un
  //     des deux thèmes, pas le fait de suivre l'appareil.
  telephone: ['smartphone-bold', 'iphone-bold', 'phone-bold'],
  // --- le service client : une bulle de dialogue, celle que tout le monde
  //     reconnait comme « on peut parler a quelqu'un ».
  tchat: ['chat-round-dots-bold', 'chat-round-bold', 'chat-line-bold'],
  // --- l'en-tête de l'écran des résultats
  partage: ['share-bold', 'square-share-line-bold'],
  points: ['menu-dots-bold'],
  // --- le bandeau de la ligne de spots
  longueur: ['transfer-horizontal-bold'],
  largeur: ['transfer-vertical-bold'],
  retirer: ['close-circle-bold'],
  lien: ['link-round-bold', 'link-bold', 'link-circle-bold'],
  // --- la pastille de contrôle des normes, et son geste de correction
  bouclier: ['shield-check-bold', 'shield-star-bold', 'shield-bold'],
  baguette: ['magic-stick-3-bold', 'magic-stick-bold', 'stars-bold'],
};

async function tracer(nom) {
  const r = await fetch(`https://api.iconify.design/solar:${nom}.svg`);
  if (!r.ok) return null;
  const svg = await r.text();
  if (!svg.includes('<svg')) return null;
  const ds = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  return ds.length > 0 ? ds.join(' ') : null;
}

/*
  LES TRACÉS MAISON, que l'outil recopie tels quels.

  Une icône écrite À LA MAIN dans le fichier généré ne survit pas à la
  génération suivante : `note` a disparu ainsi, le jour où l'on a changé
  l'icône du plafond — la régénération a réécrit le fichier sans elle, et
  rien ne l'a signalé avant l'écran. Ce qui n'est pas dans le jeu Solar se
  déclare donc ICI, avec le reste.
*/
const MAISON = {
  /*
    LE MOT ÉCRIT SUR LE PLAN — une bulle, pas un crayon.

    Le crayon dit « corriger ce qui est là » ; cette pastille-là POSE
    quelque chose de neuf. Ses deux lignes creuses disent que ce qu'on pose
    est du texte. Redessinée à la main sur la grille de 24 du jeu : la
    bulle Solar d'origine n'a pas ces lignes, et sans elles on lit un
    commentaire de messagerie.
  */
  note: {
    nom: 'chat-square-bold (redessiné)',
    d: 'M6 3H18C19.6569 3 21 4.34315 21 6V14C21 15.6569 19.6569 17 18 17H12L7 21V17H6C4.34315 17 3 15.6569 3 14V6C3 4.34315 4.34315 3 6 3ZM7 7.4H17V9H7V7.4ZM7 11H13V12.6H7V11Z',
  },
};

const sorties = {};
const rates = [];
for (const [cle, candidats] of Object.entries(CHOIX)) {
  let trouve = null;
  let retenu = '';
  for (const nom of candidats) {
    trouve = await tracer(nom);
    if (trouve) {
      retenu = nom;
      break;
    }
  }
  if (!trouve) {
    rates.push(`${cle} (${candidats.join(', ')})`);
    continue;
  }
  sorties[cle] = { d: trouve, nom: retenu };
  console.log(`${cle} <- solar:${retenu}`);
}
if (rates.length > 0) {
  console.error(`INTROUVABLES : ${rates.join(' ; ')}`);
  process.exit(1);
}

Object.assign(sorties, MAISON);

const lignes = Object.entries(sorties).map(
  ([cle, v]) => `  /** solar:${v.nom} */\n  ${cle}:\n    '${v.d}',`,
);
writeFileSync(
  join(ROOT, 'src', 'ui', 'solaires.ts'),
  `/**\n` +
    ` * Les icônes des menus — ÉCRITES PAR \`node tools/gen-solaires.mjs\`.\n` +
    ` *\n` +
    ` * Jeu « Solar Bold » (© Solar Icons, CC BY 4.0), celui de la collection\n` +
    ` * SVGRepo choisie par le patron. Ne pas retoucher un tracé à la main :\n` +
    ` * on change le candidat dans l'outil, et on régénère.\n` +
    ` *\n` +
    ` * Rendu attendu : UNE silhouette par icône — \`fill\` teinté,\n` +
    ` * \`fillRule="evenodd"\`, jamais de trait.\n` +
    ` */\n` +
    `export const SOLAIRES = {\n${lignes.join('\n')}\n} as const;\n\n` +
    `export type IconeSolaire = keyof typeof SOLAIRES;\n`,
  'utf8',
);
console.log(`${Object.keys(sorties).length} icônes vendues en dur.`);
