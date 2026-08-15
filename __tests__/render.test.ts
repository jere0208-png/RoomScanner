/**
 * Garde-fou visuel.
 *
 * Les 97 autres tests vérifient des nombres ; aucun n'a vu le jour où le
 * pointillé des passages s'est mis à contaminer tout le modèle. Celui-ci
 * compare le rendu à une planche VERSIONNÉE : toute modification qui change
 * l'image fait échouer la CI et apparaît comme un diff d'image dans la pull
 * request. Quand le changement est voulu : `npm run snapshots`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  renderSceneSvg,
  SNAPSHOT_VIEWS,
} from '../src/export/svgSnapshot';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import { buildObj } from '../src/export/model3d';

const input = {
  walls: SNAPSHOT_WALLS,
  openings: SNAPSHOT_OPENINGS,
  objects: SNAPSHOT_OBJECTS,
  rooms: SNAPSHOT_ROOMS,
  fixtures: SNAPSHOT_FIXTURES,
};
const dir = join(__dirname, '..', 'assets', 'rendu-reference');

describe('planche de rendu de référence', () => {
  for (const { name, view } of SNAPSHOT_VIEWS) {
    it(`${name} n'a pas changé`, () => {
      const actual = renderSceneSvg(input, view);
      // `npm run snapshots` réécrit la planche au lieu de la comparer.
      if (process.env.UPDATE_SNAPSHOTS) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${name}.svg`), actual, 'utf8');
        return;
      }
      const expected = readFileSync(join(dir, `${name}.svg`), 'utf8');
      if (actual !== expected) {
        throw new Error(
          `Le rendu « ${name} » a changé.\n` +
            'Regardez assets/rendu-reference/ : si le changement est voulu, ' +
            'lancez `npm run snapshots` et relisez le diff avant de valider.',
        );
      }
    });
  }

  it('la scène de référence contient bien tout ce qu’on veut surveiller', () => {
    // Une planche amputée ne surveillerait plus rien.
    expect(SNAPSHOT_ROOMS).toHaveLength(2);
    expect(SNAPSHOT_OPENINGS.filter((o) => o.open)).toHaveLength(2);
    expect(SNAPSHOT_OPENINGS.filter((o) => !o.open)).toHaveLength(2);
    expect(SNAPSHOT_OBJECTS).toHaveLength(3);
  });
});

describe('export OBJ', () => {
  it('exporte NOTRE scène, groupée et en mètres', () => {
    const obj = buildObj(input, 'T2');
    expect(obj).toContain('# T2 — exporté par EchoPlan');
    expect(obj).toContain('g Sols');
    expect(obj).toContain('g Volumes');
    // Autant d'indices de face que de sommets déclarés, et rien de vide.
    const verts = obj.split('\n').filter((l) => l.startsWith('v ')).length;
    const faces = obj.split('\n').filter((l) => l.startsWith('f ')).length;
    expect(verts).toBeGreaterThan(100);
    expect(faces).toBeGreaterThan(20);
    // Aucune face ne doit pointer au-delà des sommets écrits.
    for (const line of obj.split('\n')) {
      if (!line.startsWith('f ')) continue;
      for (const idx of line.slice(2).split(' ')) {
        expect(Number(idx)).toBeGreaterThanOrEqual(1);
        expect(Number(idx)).toBeLessThanOrEqual(verts);
      }
    }
  });

  it('n’exporte pas les contours ni les passages : ce n’est pas de la matière', () => {
    const obj = buildObj(input);
    // Deux sols, des murs, des meubles — mais pas de face à 2 points.
    for (const line of obj.split('\n')) {
      if (!line.startsWith('f ')) continue;
      expect(line.slice(2).split(' ').length).toBeGreaterThanOrEqual(3);
    }
  });
});
