/**
 * Réécrit la table des photos de `src/ui/produits.ts` d'après le contenu de
 * `assets/produits/`.
 *
 *   node tools/gen-produits.mjs
 *
 * React Native exige un `require` LITTÉRAL : on ne compose pas un chemin
 * d'image à la volée. Une table écrite à la main se désynchronise du dossier
 * au premier ajout — celle-ci se régénère.
 *
 * ON NE RÉÉCRIT QUE LE BLOC ENTRE LES DEUX REPÈRES, et ce n'est pas une
 * précaution théorique : la première version réécrivait tout ce qui suivait
 * la table. Le jour où l'on a ajouté des renvois écrits à la main — deux
 * prises qui partagent une photo —, la régénération suivante a effacé la
 * fonction qui les lisait, sans un mot. C'est exactement le piège de
 * `gen-solaires`, où une icône dessinée à la main ne survivait pas à l'outil,
 * et il s'est reproduit dans l'heure.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// `URL.pathname` garde les espaces échappés (« Nouveau%20dossier ») : sur un
// chemin d'utilisateur Windows, ça suffit à ne rien trouver.
const racine = fileURLToPath(new URL('..', import.meta.url));
const dossier = join(racine, 'assets', 'produits');
const cible = join(racine, 'src', 'ui', 'produits.ts');

const DEBUT = '// ---- début du bloc régénéré (tools/gen-produits.mjs) ----';
const FIN = '// ---- fin du bloc régénéré ----';

const codes = readdirSync(dossier)
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.slice(0, -4))
  .sort();

const source = readFileSync(cible, 'utf8');
const i = source.indexOf(DEBUT);
const j = source.indexOf(FIN);
if (i < 0 || j < 0) {
  console.error(`Repères introuvables dans ${cible} : rien n'a été réécrit.`);
  process.exit(1);
}

const lignes = codes
  .map((c) => `  '${c}': require('../../assets/produits/${c}.png'),`)
  .join('\n');

writeFileSync(
  cible,
  source.slice(0, i) +
    `${DEBUT}\nexport const PHOTOS: Record<string, ImageSourcePropType> = {\n${lignes}\n};\n` +
    source.slice(j),
  'utf8',
);
console.log(`${codes.length} produits`);
