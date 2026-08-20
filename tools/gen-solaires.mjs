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
  plafond: ['lamp-bold'],
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
  square: ['ruler-angular-bold'],
  check: ['magnifer-bold'],
  gaines: ['routing-2-bold', 'routing-bold'],
  murs: ['buildings-bold', 'buildings-2-bold'],
  appareil: ['socket-bold'],
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
};

async function tracer(nom) {
  const r = await fetch(`https://api.iconify.design/solar:${nom}.svg`);
  if (!r.ok) return null;
  const svg = await r.text();
  if (!svg.includes('<svg')) return null;
  const ds = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  return ds.length > 0 ? ds.join(' ') : null;
}

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
