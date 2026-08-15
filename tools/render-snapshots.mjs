/**
 * Régénère la planche de référence du rendu 3D.
 *
 *   npm run snapshots
 *
 * Passe par Jest, qui sait déjà lire le TypeScript du projet — pas de
 * dépendance en plus. Les SVG produits dans `assets/rendu-reference/` sont
 * VERSIONNÉS : c'est leur diff, visible directement dans la pull request,
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
