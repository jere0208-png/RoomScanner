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
import {
  cheminDuCadre,
  DUREE_SCAN,
  MESURES,
  poseDeLaLigne,
} from '../src/ui/glypheScan';

const input = {
  walls: SNAPSHOT_WALLS,
  openings: SNAPSHOT_OPENINGS,
  objects: SNAPSHOT_OBJECTS,
  rooms: SNAPSHOT_ROOMS,
  fixtures: SNAPSHOT_FIXTURES,
};

/**
 * LE MÊME APPARTEMENT, TOURNÉ DE DOUZE DEGRÉS.
 *
 * L'appartement de référence est d'équerre avec le repère du scan, ce qui
 * cache une famille entière de défauts : tout ce qui se calcule sur les axes
 * du monde y donne le même résultat que sur ceux du logement, et un test qui
 * ne voit pas la différence ne vérifie rien. C'est exactement comme ça que
 * les cotes du plafond sont parties en écharpe sans qu'aucune planche ne
 * bronche.
 *
 * Or ARKit oriente son repère selon l'endroit où le relevé a commencé : un
 * scan de biais est le cas NORMAL, pas l'exception. Une planche tournée
 * suffit à couvrir la famille entière — inutile de tourner les quatre.
 */
const A = (12 * Math.PI) / 180;
const pivot = <T extends { a: { x: number; z: number }; b: { x: number; z: number } }>(
  w: T,
): T => ({
  ...w,
  a: {
    x: w.a.x * Math.cos(A) - w.a.z * Math.sin(A),
    z: w.a.x * Math.sin(A) + w.a.z * Math.cos(A),
  },
  b: {
    x: w.b.x * Math.cos(A) - w.b.z * Math.sin(A),
    z: w.b.x * Math.sin(A) + w.b.z * Math.cos(A),
  },
});
const inputBiais = {
  ...input,
  walls: SNAPSHOT_WALLS.map(pivot),
  openings: SNAPSHOT_OPENINGS.map(pivot),
};
const dir = join(__dirname, '..', 'assets', 'rendu-reference');

describe('planche de rendu de référence', () => {
  for (const { name, view } of [
    ...SNAPSHOT_VIEWS,
    // La planche de biais : celle qui voit ce que les quatre autres ratent.
    { name: 'biais', view: SNAPSHOT_VIEWS[0].view },
  ]) {
    it(`${name} n'a pas changé`, () => {
      const actual = renderSceneSvg(name === 'biais' ? inputBiais : input, view);
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

/**
 * LA PELLICULE DE L'ICÔNE DE SCAN.
 *
 * Une animation ne se relit pas dans un banc : on en fige donc six poses
 * côte à côte, comme une pellicule, et c'est CETTE image qu'on regarde
 * avant de livrer. Les six instants sont ceux qui font le geste — repos,
 * départ replié, point haut, point bas, retour au centre, redéploiement ;
 * si l'un d'eux se met à ressembler à son voisin, le mouvement s'est perdu.
 */
const POSES = [0, 0.5, 0.833, 1.167, 1.517, 1.833];
const VIGNETTE = 96;

function pelliculeDuScan(): string {
  const l = MESURES.cote * VIGNETTE;
  const e = MESURES.trait * VIGNETTE;
  const cases = POSES.map((s, i) => {
    const p = poseDeLaLigne(s * 1000);
    const x = i * VIGNETTE;
    const largeur = l * p.longueur;
    return [
      `<g transform="translate(${x} 0)">`,
      `<path d="${cheminDuCadre(VIGNETTE)}" stroke="#0B0D12" stroke-width="${e}" ` +
        'stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
      `<rect x="${((VIGNETTE - largeur) / 2).toFixed(3)}" y="${(
        (VIGNETTE - e) / 2 +
        p.dy * VIGNETTE
      ).toFixed(3)}" width="${largeur.toFixed(3)}" height="${e}" rx="${e / 2}" fill="#1F5BFF"/>`,
      `<text x="${VIGNETTE / 2}" y="${VIGNETTE - 6}" font-size="9" fill="#98A1AE" ` +
        `text-anchor="middle">${s.toFixed(3)}s</text>`,
      '</g>',
    ].join('');
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSES.length * VIGNETTE}" ` +
    `height="${VIGNETTE}" viewBox="0 0 ${POSES.length * VIGNETTE} ${VIGNETTE}">` +
    `<rect width="100%" height="100%" fill="#F6F7F9"/>${cases.join('')}</svg>`
  );
}

describe('pellicule de l’icône de scan', () => {
  it('n’a pas changé', () => {
    const actual = pelliculeDuScan();
    if (process.env.UPDATE_SNAPSHOTS) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'glyphe-scan.svg'), actual, 'utf8');
      return;
    }
    const expected = readFileSync(join(dir, 'glyphe-scan.svg'), 'utf8');
    if (actual !== expected) {
      throw new Error(
        'La pellicule de l’icône de scan a changé. Regardez ' +
          'assets/rendu-reference/glyphe-scan.svg, puis `npm run snapshots`.',
      );
    }
  });

  it('montre bien six poses DIFFÉRENTES : le geste ne s’est pas aplati', () => {
    const vues = POSES.map((s) => JSON.stringify(poseDeLaLigne(s * 1000)));
    expect(new Set(vues).size).toBe(POSES.length);
    // Et la dernière pose retombe sur la première : la boucle est franche.
    expect(poseDeLaLigne(DUREE_SCAN).dy).toBeCloseTo(poseDeLaLigne(0).dy, 6);
  });
});
