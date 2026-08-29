/**
 * Cuit l'animation de l'accueil : SVG → PNG → table de sources.
 *
 *   npm run showcase
 *
 * Les images de la vitrine sont calculées AU BUILD et embarquées dans l'app.
 * Le téléphone ne fait que les feuilleter : rien à recalculer, donc rien qui
 * puisse ramer ni diverger d'un appareil à l'autre.
 *
 * Trois étapes, et la première passe par Jest — c'est lui qui sait lire le
 * TypeScript du projet, comme pour les planches de rendu.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(ROOT, 'assets', 'showcase');
const PNG = join(ROOT, 'src', 'assets', 'showcase');

console.log('1/3 — géométrie → SVG');
const jest = spawnSync(
  'npx',
  ['jest', '--testPathPattern', 'showcase', '--silent'],
  { stdio: 'inherit', shell: true, env: { ...process.env, UPDATE_SHOWCASE: '1' } },
);
if (jest.status !== 0) process.exit(jest.status ?? 1);

console.log('2/3 — SVG → PNG');
mkdirSync(PNG, { recursive: true });
const frames = readdirSync(SVG)
  .filter((f) => f.endsWith('.svg'))
  .sort();
for (const f of frames) {
  const nom = f.replace('.svg', '.png');
  /*
    PALETTE RÉDUITE, ET SANS TRAMAGE.

    Ces images sont des aplats et des traits : soixante-quatre couleurs
    suffisent, et le tramage ne sert à rien ici. Il ne rattrape que les
    dégradés, et il n'y en a plus un seul dans les images depuis que la lueur
    et le vignettage sont posés en direct par le téléphone (voir
    `PhoneShowcase`). Le laisser allumé COÛTE : chaque aplat se met à
    grésiller, et le PNG ne compresse plus rien.
  */
  /*
    LES CHEMINS SONT ENTRE GUILLEMETS.

    Le projet vit dans un dossier dont le nom contient une espace. Avec un
    shell, un argument nu s'y coupe en deux et ImageMagick cherche un fichier
    nommé « Nouveau ». C'est le même piège que l'apostrophe des scripts
    d'assets, sous une autre forme.
  */
  const q = (x) => `"${x}"`;
  const r = spawnSync(
    'magick',
    [
      q(join(SVG, f)),
      '-background', 'white',
      '-alpha', 'remove',
      '-resize', '264x536',
      '-dither', 'None',
      '-colors', '64',
      '-define', 'png:compression-level=9',
      q(`PNG8:${join(PNG, nom)}`),
    ],
    { stdio: 'inherit', shell: true },
  );
  if (r.status !== 0) {
    console.error(`ImageMagick a refusé ${f} — est-il installé ?`);
    process.exit(1);
  }
}

console.log('3/3 — table des sources');
/*
  UNE TABLE ÉCRITE, PAS UN `require` CALCULÉ.

  Le empaqueteur de React Native résout les `require` à la compilation : un
  chemin construit à l'exécution ne trouve rien. La liste est donc écrite en
  toutes lettres — c'est le prix d'un flipbook embarqué.
*/
const lignes = frames.map(
  (f) => `  require('./${f.replace('.svg', '.png')}'),`,
);
writeFileSync(
  join(PNG, 'index.ts'),
  `/**\n` +
    ` * Les images de la vitrine — ÉCRITES PAR \`npm run showcase\`.\n` +
    ` *\n` +
    ` * Ne pas modifier à la main : le fichier est refait à chaque cuisson.\n` +
    ` */\n` +
    `export const SHOWCASE_IMAGES = [\n${lignes.join('\n')}\n];\n`,
  'utf8',
);
console.log(`${frames.length} images cuites.`);
