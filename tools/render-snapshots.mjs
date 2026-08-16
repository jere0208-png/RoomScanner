/**
 * Régénère les planches de référence : le rendu 3D et le plan 2D.
 *
 *   npm run snapshots
 *
 * Passe par Jest, qui sait déjà lire le TypeScript du projet — pas de
 * dépendance en plus. Deux familles de planches y sont produites : les SVG
 * de la vue 3D, et l'ARBRE RENDU du plan 2D (`plan-*.json`), qui compare
 * chaque élément avec ses coordonnées et son ordre — c'est ce qui permet de
 * découper le composant du plan en étant sûr de ne rien déplacer. Les deux
 * sont dans `assets/rendu-reference/` et sont VERSIONNÉES : c'est leur diff, visible directement dans la pull request,
 * qui signale qu'une modification a changé le rendu. À ne régénérer que
 * lorsque le changement est voulu, et à relire avant de valider.
 */
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['jest', '--testPathPattern', 'render'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, UPDATE_SNAPSHOTS: '1' },
});
process.exit(r.status ?? 1);
