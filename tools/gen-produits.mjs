/**
 * Réécrit `src/ui/produits.ts` d'après le contenu de `assets/produits/`.
 *
 *   node tools/gen-produits.mjs
 *
 * React Native exige un `require` LITTÉRAL : on ne compose pas un chemin
 * d'image à la volée. Une table écrite à la main se désynchronise du dossier
 * au premier ajout — celle-ci se régénère.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// `URL.pathname` garde les espaces échappés (« Nouveau%20dossier ») : sur un
// chemin d'utilisateur Windows, ça suffit à ne rien trouver.
const racine = fileURLToPath(new URL('..', import.meta.url));
const dossier = join(racine, 'assets', 'produits');
const cible = join(racine, 'src', 'ui', 'produits.ts');

const codes = readdirSync(dossier)
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.slice(0, -4))
  .sort();

const source = readFileSync(cible, 'utf8');
const entete = source.slice(0, source.indexOf('export const PHOTOS'));
const lignes = codes
  .map((c) => `  '${c}': require('../../assets/produits/${c}.png'),`)
  .join('\n');

writeFileSync(
  cible,
  `${entete}export const PHOTOS: Record<string, ImageSourcePropType> = {\n${lignes}\n};\n\n` +
    "/** La photo d'un article, s'il en a une. */\n" +
    'export function photoDe(code: string): ImageSourcePropType | null {\n' +
    '  return PHOTOS[code] ?? null;\n' +
    '}\n',
  'utf8',
);
console.log(`${codes.length} produits`);
