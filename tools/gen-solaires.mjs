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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  /*
    L'ANNULATION ET LE RÉTABLISSEMENT, DANS LEUR CARRÉ — relevé du patron,
    liens à l'appui : `undo-left-round-square`, `undo-right-round-square`.

    Les flèches nues se lisaient comme un tracé du plan ; posées dans leur
    carré, elles ont le poids d'une touche, comme les quatre flèches du pavé
    de réglage. Et les deux gestes restent le MÊME dessin retourné : deux
    dessins différents pour deux gestes symétriques se liraient comme deux
    fonctions sans rapport.
  */
  undo: ['undo-left-round-square-bold', 'undo-left-bold'],
  // « Refaire » : la MÊME flèche que l'annulation, retournée. Deux dessins
  // différents pour deux gestes symétriques se liraient comme deux
  // fonctions sans rapport.
  redo: ['undo-right-round-square-bold', 'undo-right-bold'],
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
  /*
    LES DEUX GESTES DES BANDEAUX DU BAS QUI SE DESSINAIENT À LA MAIN.

    Relevé du patron : « je veux les icônes de la sélection d'un spot, mais
    avec les tailles de la sélection de la ligne, et fais ça pour chaque
    élément, pour avoir une continuité parfaite ». L'inventaire a trouvé
    pire que deux tailles : « Pivoter » était un arc tracé au trait dans le
    bandeau d'un meuble, « Centrer » une cible tracée au trait dans celui
    d'un spot. Deux silhouettes hors du jeu, au milieu de leurs voisines qui
    en venaient — et qui dérivent au premier changement de jeu.

    `restart` est la flèche qui fait un quart de tour : c'est le geste, pas
    une idée de rechargement. `gps` est la cible du viseur — le même dessin
    que la main avait tenté, en propre.
  */
  pivoter: ['restart-bold', 'refresh-bold'],
  centrer: ['gps-bold', 'target-bold'],
  /*
    LES QUATRE GESTES D'UNE MENUISERIE, sortis du menu « … ».

    Relevé du patron : « au clic sur une porte, le "…" de la menuiserie est
    mal placé, peu compréhensible sans lire le texte — peut-être proposer
    directement les choix sous forme de boutons ». Les gestes qui vivaient
    derrière ces trois points deviennent des pastilles, et il leur fallait
    donc une silhouette.

    L'ALLÈGE est une hauteur DEPUIS LE SOL : deux barres posées sur une
    ligne, c'est le dessin d'un alignement par le bas et c'est exactement ce
    qu'on règle.

    LA CHARNIÈRE : un panneau plein et son reflet en pointillé — le battant
    qui bascule de l'autre bord. C'est le geste, pas l'objet.

    LE SENS D'OUVERTURE : la flèche qui SORT du demi-cercle. Elle dit qu'on
    pousse vers l'autre pièce, ce que « ouvrir de l'autre côté » met neuf
    mots à écrire.

    LE COFFRE de volet roulant est un caisson posé au-dessus de la baie :
    l'icône d'archive est ce caisson-là, couvercle compris.
  */
  /*
    LES QUATRE GESTES D'UNE PIÈCE, sortis de son menu « … » à leur tour.

    Le bandeau d'une pièce était le dernier à cacher des gestes derrière
    trois points — dupliquer, fusionner, scinder, retirer — et le seul de
    l'application à ne porter aucune silhouette : quatre boutons de mots au
    milieu de bandeaux dessinés.

    DUPLIQUER : deux feuilles superposées, l'une décalée. FUSIONNER : deux
    flèches qui rentrent l'une vers l'autre — ce que deux pièces font quand
    elles n'en font plus qu'une. SCINDER : les ciseaux, qui coupent en deux.
    COTER : le cadre de recadrage, qui dit qu'on reprend les dimensions du
    rectangle sans toucher à ce qu'il y a dedans.
  */
  dupliquer: ['copy-bold', 'documents-bold'],
  fusionner: ['minimize-square-bold'],
  scinder: ['scissors-bold'],
  cotes: ['crop-bold'],
  allege: ['align-bottom-bold'],
  charniere: ['mirror-left-bold', 'flip-horizontal-bold'],
  sens: ['logout-bold', 'exit-bold'],
  coffre: ['archive-bold'],
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
  /* La sirène de l'alerte de sortie — relevé du patron : `siren`. */
  sirene: ['siren-bold', 'siren-rounded-bold'],
  lien: ['link-round-bold', 'link-bold', 'link-circle-bold'],
  // --- la pastille de contrôle des normes, et son geste de correction
  bouclier: ['shield-check-bold', 'shield-star-bold', 'shield-bold'],
  baguette: ['magic-stick-3-bold', 'magic-stick-bold', 'stars-bold'],
  /*
    L'EXPLORATION — un marcheur, refonte grand public.

    On entre dans la pièce et l'on s'y promène : la silhouette qui marche dit
    le geste mieux qu'un œil (on ne regarde pas, on y va) et mieux qu'un cube
    (on n'est plus devant la maquette, on est dedans).
  */
  marcher: ['walking-bold'],
  /*
    LES QUATRE TUILES DE L'ACCUEIL PARLENT LA MÊME LANGUE — relevé du patron :
    « les icônes des quatre cadres ne sont pas très cohérentes ; un cadre de
    scan pour le scan, un “?” pour le tutoriel vidéo, une maison pour
    l'exemple ; le crayon reste bon ».

    Un cube, un marcheur, un crayon, une étoile : quatre objets sans
    rapport, dont deux ne disaient pas ce qu'ils ouvraient. Ce sont
    maintenant quatre PLEINS de même famille, chacun creusé de son geste :
    le cadre de visée et sa ligne de balayage (le motif de la référence
    Flaticon, dans le jeu Solar de l'app), la bulle « ? », la maison, et le
    crayon qui reste.
  */
  scanner: ['scanner-bold'],
  aide: ['question-circle-bold'],
  maison: ['home-2-bold', 'home-bold'],
  /*
    LE MENU « … » PARLE ENFIN LA LANGUE DE L'APP — relevé du patron :
    « refonte des icônes du menu "…" : trop simples, SVG IA facilement
    détectable ; garde une cohérence avec les icônes qu'on a déjà
    ailleurs ».

    C'étaient dix-neuf dessins au trait tracés à la main dans la feuille
    des choix, pendant que toute l'app parle en silhouettes Solar. Chaque
    entrée prend maintenant la sienne — celles qui existaient déjà dans le
    jeu sont reprises telles quelles (la corbeille, la disquette, les
    ciseaux, la règle, la maison « + », le cadre de visée, la baguette…),
    et celles-ci complètent :

    RENOMMER, le crayon sur sa fiche ; LA HAUTEUR, la double flèche
    verticale ; SORTIR, la porte qu'on quitte ; L'ÉTAGE et LE SOUS-SOL, les
    chevrons qui montent ou descendent dans leur carré, comme le pavé de
    réglage ; MURER, la gomme qui efface le
    trou ; LES TRAVAUX, le rouleau du peintre ; LE TABLEAU, le coffret et
    ses rangées.
  */
  renommer: ['pen-new-square-bold'],
  hauteur: ['round-sort-vertical-bold', 'transfer-vertical-bold'],
  sortir: ['logout-3-bold', 'logout-2-bold'],
  etage: ['square-double-alt-arrow-up-bold', 'square-top-up-bold'],
  soussol: ['square-double-alt-arrow-down-bold', 'square-bottom-down-bold'],
  murer: ['eraser-square-bold', 'eraser-bold'],
  rouleau: ['paint-roller-bold'],
  tableau: ['server-square-bold', 'server-minimalistic-bold'],
};

/*
  UNE REQUÊTE POUR TOUT LE JEU — l'API limite le débit.

  L'outil demandait chaque icône à part : passé une cinquantaine d'appels
  d'affilée, l'API répond « trop de requêtes » (429), et l'outil concluait
  à tort que l'icône n'existait pas. Il demande désormais tous les candidats
  d'un coup, par lots, au format JSON de l'API (`solar.json?icons=…`) ; un
  refus du serveur se retente en attendant de plus en plus, et seule une
  vraie absence fait passer au candidat suivant.
*/
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const TRACES = new Map();

async function prechargerLeJeu(noms) {
  const uniques = [...new Set(noms)];
  for (let i = 0; i < uniques.length; i += 60) {
    const lot = uniques.slice(i, i + 60);
    let data = null;
    for (let essai = 0; essai < 8 && !data; essai++) {
      try {
        const r = await fetch(`https://api.iconify.design/solar.json?icons=${lot.join(',')}`);
        if (r.ok) data = await r.json();
      } catch {
        data = null;
      }
      if (!data) await pause(4000 * (essai + 1));
    }
    if (!data) throw new Error('API Iconify injoignable : rien n’est écrit.');
    for (const [nom, icone] of Object.entries(data.icons ?? {})) {
      const ds = [...String(icone.body).matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
      if (ds.length > 0) TRACES.set(nom, ds.join(' '));
    }
    for (const [nom, alias] of Object.entries(data.aliases ?? {})) {
      if (TRACES.has(alias.parent)) TRACES.set(nom, TRACES.get(alias.parent));
    }
  }
}

async function tracer(nom) {
  return TRACES.get(nom) ?? null;
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

await prechargerLeJeu(Object.values(CHOIX).flat());

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

/*
  UNE ICÔNE DÉJÀ VENDUE NE CHANGE PAS EN DOUCE.

  Le jeu Solar évolue en amont : régénérer pour AJOUTER une icône redessinait
  au passage treize de celles que le patron avait déjà validées — le
  fauteuil, la loupe, le partage… Le tracé d'une clé dont le candidat n'a pas
  changé est donc repris du fichier ; `--rafraichir` les reprend toutes à
  l'API.
*/
const FICHIER = join(ROOT, 'src', 'ui', 'solaires.ts');
if (!process.argv.includes('--rafraichir') && existsSync(FICHIER)) {
  const avant = readFileSync(FICHIER, 'utf8').replace(/\r\n/g, '\n');
  for (const m of avant.matchAll(/\/\*\* solar:([^*]+?) \*\/\n {2}([A-Za-z0-9]+):\n {4}'([^']+)'/g)) {
    const [, nom, cle, d] = m;
    if (sorties[cle] && sorties[cle].nom === nom) sorties[cle].d = d;
  }
}

const lignes = Object.entries(sorties).map(
  ([cle, v]) => `  /** solar:${v.nom} */\n  ${cle}:\n    '${v.d}',`,
);
writeFileSync(
  FICHIER,
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
