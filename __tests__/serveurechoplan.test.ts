/**
 * LE SERVEUR VIT DANS SON DOSSIER.
 *
 * Relevé du patron : « tous les fichiers sont désormais sur
 * bourseur.fr/echoplan. Change tout en conséquence. »
 *
 * L'API, la connexion Google, les messages et les tarifs ont quitté la racine
 * du site. L'app ne connaît qu'une adresse, `SERVEUR.url`, et compose toutes
 * les autres à partir d'elle : c'est elle qui change, et rien ne doit l'avoir
 * recopiée ailleurs.
 *
 * `jest.setup.js` vide `SERVEUR.url` pour qu'aucun banc n'appelle le vrai
 * serveur : on lit donc la valeur de production dans le SOURCE.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const racine = join(__dirname, '..');
const lire = (...p: string[]) => readFileSync(join(racine, ...p), 'utf8');

/** Tous les fichiers de `src`, récursivement. */
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('l’adresse du serveur', () => {
  it('pointe sur le dossier echoplan de bourseur.fr', () => {
    expect(lire('src', 'config', 'serveur.ts')).toMatch(/url: 'https:\/\/bourseur\.fr\/echoplan',/);
  });

  it('n’est écrite qu’une fois : tout le reste se compose à partir d’elle', () => {
    const ailleurs = fichiers(join(racine, 'src'))
      .filter((f) => !f.endsWith(join('config', 'serveur.ts')))
      .filter((f) => /https?:\/\/(www\.)?bourseur\.fr/.test(readFileSync(f, 'utf8')));
    expect(ailleurs).toEqual([]);
  });

  it('la connexion Google revient au même dossier', () => {
    expect(lire('src', 'screens', 'SignInScreen.tsx')).toContain('`${SERVEUR.url}/auth-google.php`');
    expect(lire('server', 'config-echoplan.exemple.php')).toContain("/echoplan/auth-google.php'");
  });
});
