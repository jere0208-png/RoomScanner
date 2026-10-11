/**
 * LA VUE 3D DE L'EXPORT, SANS REPÈRES.
 *
 * Relevé du patron : « dans la page export PDF, le bloc vue 3D, enlève les
 * repères sur le modèle présenté ».
 *
 * L'aperçu de la perspective ne lisait pas la pastille « Repères » : il
 * portait toujours la désignation, la hauteur et la cote de chaque appareil,
 * quand la feuille, elle, suivait la pastille. Il la suit maintenant — ce
 * qu'on voit est ce qui part —, et les repères sont éteints au départ : une
 * perspective se montre au client, on les rallume pour le chantier.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ExportScreen.tsx'), 'utf8');

describe('la vue 3D de l’export', () => {
  it('l’aperçu suit la pastille « Repères »', () => {
    expect(ecran).toContain('showElecTags={reperes3D}');
  });

  it('les repères sont éteints au départ', () => {
    expect(ecran).toContain('const [reperes3D, setReperes3D] = useState(false);');
    expect(ecran).not.toContain('const [reperes3D, setReperes3D] = useState(true);');
  });
});
