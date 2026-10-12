/**
 * TOURNÉE N°4 — LA BIBLIOTHÈQUE NE PERD PLUS RIEN.
 *
 * - « Fatou » : « Dupliquer pour essayer une autre version » enregistrait
 *   les modifications en cours DANS la version A ; la copie perdait son
 *   dossier ; dupliquer, renommer ou ranger ne montait jamais en ligne ; le
 *   tableur ne disait pas un mètre du ruban LED.
 * - « Hugo » : un nom de plan de 300 caractères passait.
 * - « Inès » : la barrière d'export parlait du PDF devant le DXF, la 3D ou
 *   le tableur.
 * (La corbeille elle-même : voir `glisserplan`.)
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useScanStore, horsCorbeille } from '../src/store/scanStore';
import { buildMetreCsv } from '../src/export/csv';
import { useAccountStore } from '../src/store/accountStore';
import { useAlerte } from '../src/ui/alerte';

const st = () => useScanStore.getState();
const source = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('une nouvelle version laisse la première intacte', () => {
  it('les modifications en cours partent dans la copie, pas dans la version A', () => {
    st().reset();
    useScanStore.setState({ saves: [], folders: [{ id: 'd1', name: 'Chantier' }] as never });
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    st().commitCurrent();
    const a = st().currentSaveId!;
    st().moveToFolder(a, 'd1');
    const mursDeA = st().saves.find((x) => x.id === a)!.walls.length;
    // Une modification en cours, puis la nouvelle version.
    st().addRoomLibre(3, 3, 'Chambre', { auNu: true });
    expect(st().dirty).toBe(true);
    st().saveAsCopy('Version B');
    const b = st().saves.find((x) => x.name === 'Version B')!;
    expect(st().currentSaveId).toBe(b.id);
    expect(b.walls.length).toBeGreaterThan(mursDeA);
    // A n'a pas bougé…
    expect(st().saves.find((x) => x.id === a)!.walls.length).toBe(mursDeA);
    // … et la copie est rangée avec lui.
    expect(b.folderId).toBe('d1');
  });

  it('l’écran ne range plus les modifications dans A avant de copier', () => {
    const ecran = source('src', 'screens', 'ResultScreen.tsx');
    const menu = ecran.slice(ecran.indexOf("label: 'Dupliquer pour essayer une autre version'"));
    expect(menu.slice(0, 2000)).not.toMatch(/commitCurrent\(\)/);
    expect(menu.slice(0, 2000)).toMatch(/partent dans la nouvelle/);
  });
});

describe('les gestes de la bibliothèque montent en ligne', () => {
  it('dupliquer, renommer et ranger déposent le plan', () => {
    const magasin = source('src', 'store', 'scanStore.ts');
    for (const geste of ['renameSave: (id, name)', 'duplicateSave: (id)', 'moveToFolder: (scanId, folderId)']) {
      const corps = magasin.slice(magasin.indexOf(`    ${geste}`));
      const fin = corps.indexOf('\n    },\n');
      expect(corps.slice(0, fin)).toMatch(/deposerPlusTard\(/);
    }
  });

  it('un nom de plan tient en 60 caractères', () => {
    useScanStore.setState({
      saves: [{ id: 'p', name: 'Plan', createdAt: 1, updatedAt: 1, walls: [], openings: [], rooms: [], objects: [] } as never],
    });
    st().renameSave('p', 'x'.repeat(300));
    expect(st().saves[0].name).toHaveLength(60);
  });

  it('la corbeille sort des listes', () => {
    const plans = [{ id: 'a' }, { id: 'b', corbeille: 1 }];
    expect(horsCorbeille(plans).map((x) => x.id)).toEqual(['a']);
  });
});

describe('le tableur porte le bordereau', () => {
  it('le ruban LED en rouleaux, avec ses alimentations', () => {
    const csv = buildMetreCsv(
      'Essai',
      [],
      { rooms: [], circuits: [], differentials: [], board: [], issues: [] } as never,
      null,
      [
        { family: 'Plafond', code: 'ruban-led', label: 'Ruban LED 24 V', quantity: 3, unit: 'rouleau', note: '13,5 m en 1 ruban, rouleaux de 5 m' },
        { family: 'Plafond', code: 'transfo-led', label: 'Alimentation LED 24 V', quantity: 3, unit: 'u' },
      ],
    );
    expect(csv).toContain('BORDEREAU');
    expect(csv).toMatch(/Ruban LED 24 V;;3;rouleau;13,5 m en 1 ruban/);
  });
});

describe('la barrière d’export nomme ce qu’on envoie', () => {
  it('le DXF se dit DXF, et l’image gratuite se rappelle', () => {
    useAccountStore.setState({ compte: null, invite: true, pro: false } as never);
    useAlerte.setState({ courante: null, file: [] });
    expect(useAccountStore.getState().exportOuvert('le DXF')).toBe(false);
    const a = useAlerte.getState().courante!;
    expect(a.titre).toBe('Envoyer le DXF fait partie du Pro');
    expect(a.message).toMatch(/Image du plan/);
    expect(a.message).toMatch(/le tableur/);
  });
});
