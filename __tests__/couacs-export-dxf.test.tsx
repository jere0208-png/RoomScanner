/**
 * LES PETITS COUACS DE L'EXPORT — lot « export-dxf ».
 *
 * Huit relevés des testeurs (électricien, rénovation, senior, architecte,
 * bug-exports), chacun petit, chacun de ceux qui font douter d'un outil :
 *
 *   1. « Plan des gaines » décoché, la feuille sortait quand même dès que
 *      les schémas étaient cochés ;
 *   2. l'aperçu du dossier montrait des feuilles couchées, le PDF les
 *      imprime debout ;
 *   3. rien pour « Exporter ou imprimer » dans le menu du plan ;
 *   4. le Retour de l'export trop petit, et sans rôle ;
 *   5. au DXF, les noms de pièces non centrés et les surfaces à une
 *      décimale ;
 *   6. « œ », « æ », « ß » effacés des noms de fichiers et du DXF ;
 *   7. « Envoyer le relevé brut » muet quand ça rate ;
 *   8. (un commentaire périmé, sans banc.)
 */
const mockDisque = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
}));

import React from 'react';
import { Switch, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import { ExportScreen } from '../src/screens/ExportScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { ExportSheet } from '../src/screens/result/ExportSheet';
import { JournalSheet } from '../src/components/JournalSheet';
import { FORMAT_FEUILLE, MiniatureFeuille } from '../src/components/ApercuDuDossier';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { useReglagesExport } from '../src/store/reglagesExport';
import { useAlerte } from '../src/ui/alerte';
import { buildDxf, dxfFilename, sansAccent } from '../src/export/dxf';
import { pdfFilename } from '../src/export/pdf';
import { objFilename } from '../src/export/model3d';
import { deplierLigatures } from '../src/ui/mots';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import type { WallSeg } from '../src/geometry/floorplan';
import { Presse } from '../src/components/Presse';

/** Un bouton de l'app : `TouchableOpacity`, ou `Presse` (pastilles, ronds d'en-tête). */
const estUneTouche = (n: { type: unknown }) => n.type === TouchableOpacity || n.type === Presse;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => {
    useReglagesExport.setState({ choix: {} });
    useAlerte.setState({ courante: null, file: [] });
  });
  mockDisque.clear();
});

const PLAN_DU_MAGASIN = {
  scanName: 'Chantier test',
  walls: SNAPSHOT_WALLS,
  openings: SNAPSHOT_OPENINGS,
  objects: SNAPSHOT_OBJECTS,
  rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
  // Un tableau : sans lui, pas de tirage, et pas de carte « Plan des gaines ».
  fixtures: [
    ...SNAPSHOT_FIXTURES,
    { id: 'tab', kind: 'tableau' as const, wallId: SNAPSHOT_WALLS[0].id, along: 0.6, height: 1.4, side: 1 as const },
  ],
  ceiling: [],
  photos: [],
  north: 0,
};

/** Toutes les vues reçoivent une taille : l'écran se dessine en entier. */
function poser(t: TestRenderer.ReactTestRenderer) {
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  act(() => jest.advanceTimersByTime(400));
}

describe('l’écran d’export', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  beforeEach(() => act(() => useUsage.setState({ modeElec: true })));

  function monter() {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({ screen: 'export', ...PLAN_DU_MAGASIN });
      t = TestRenderer.create(<ExportScreen />);
    });
    poser(t);
    arbre = t;
    return t;
  }

  /** Les genres de feuilles que l'aperçu annonce — ceux du PDF. */
  const genres = (t: TestRenderer.ReactTestRenderer) => {
    const apercu = t.root.find((n) => Array.isArray(n.props.sommaire) && typeof n.props.onDebloquer === 'function');
    return (apercu.props.sommaire as { genre: string }[]).map((f) => f.genre);
  };
  const interrupteur = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAllByType(Switch).find((sw) => sw.props.accessibilityLabel === label);

  /*
    RELEVÉ DE L'ÉLECTRICIEN — « Plan des gaines » décoché, la feuille
    restait : le tracé partait au PDF dès que les schémas étaient cochés.
  */
  it('« Plan des gaines » décoché retire la feuille, même schémas cochés', () => {
    const t = monter();
    expect(interrupteur(t, 'Schémas')?.props.value).toBe(true);
    expect(interrupteur(t, 'Plan des gaines')?.props.value).toBe(true);
    expect(genres(t)).toContain('gaines');

    act(() => interrupteur(t, 'Plan des gaines')!.props.onValueChange(false));
    act(() => jest.advanceTimersByTime(400));
    expect(genres(t)).not.toContain('gaines');
    // Les schémas, eux, restent : ils se tirent des circuits.
    expect(genres(t).some((g) => g === 'unifilaire' || g === 'multifilaire')).toBe(true);
  });

  it('et l’aperçu du plan ne dessine plus le tracé', () => {
    const t = monter();
    act(() => interrupteur(t, 'Plan des gaines')!.props.onValueChange(false));
    act(() => jest.advanceTimersByTime(400));
    const deplier = t.root.findAll(
      (n) => n.props.accessibilityLabel === 'Personnaliser les vues' && typeof n.props.onPress === 'function',
    )[0];
    act(() => deplier.props.onPress());
    const apercu = t.root.find((n) => n.props.accessibilityLabel === 'Aperçu du plan');
    expect(apercu.findByType(FloorplanEditor).props.cableRoutes).toBeUndefined();
  });

  /*
    RELEVÉ « SENIOR » — un Retour de 38 points, sans rôle.
  */
  it('le Retour est un bouton, et sa cible atteint 44 points', () => {
    const t = monter();
    const retour = t.root.findAll(estUneTouche).find((n) => n.props.accessibilityLabel === 'Retour')!;
    expect(retour.props.accessibilityRole).toBe('button');
    const h = retour.props.hitSlop;
    expect(38 + h.top + h.bottom).toBeGreaterThanOrEqual(44);
    expect(38 + h.left + h.right).toBeGreaterThanOrEqual(44);
  });

  /*
    DIAGNOSTIC DU PATRON — trois plantages à l'export : « Cannot read
    property 'trim' of undefined ». Le relevé neuf laissait le client
    absent, et l'export le lisait comme du texte.
  */
  it('exporte sans planter quand le plan ne porte ni client ni adresse', () => {
    const t = monter();
    act(() => useScanStore.setState({ client: undefined, address: undefined } as never));
    const exporter = t.root
      .findAll(estUneTouche)
      .find((n) => /PDF/.test(String(n.props.accessibilityLabel ?? '')) && n.props.onPress && n.props.accessibilityState)!;
    expect(() => act(() => exporter.props.onPress())).not.toThrow();
    // Et un relevé neuf repart d'un client vide, pas absent.
    act(() => useScanStore.getState().reset());
    expect(useScanStore.getState().client).toBe('');
    expect(useScanStore.getState().address).toBe('');
  });

  it('le bouton d’export et les champs « Renseigner » ont leur rôle', () => {
    const t = monter();
    const touches = t.root.findAll(estUneTouche);
    const champs = touches.filter((n) => String(n.props.accessibilityLabel ?? '').startsWith('Renseigner : '));
    expect(champs.length).toBe(3);
    for (const c of champs) expect(c.props.accessibilityRole).toBe('button');
    const exporter = touches.find((n) => /PDF/.test(String(n.props.accessibilityLabel ?? '')) && n.props.onPress && n.props.accessibilityState);
    expect(exporter?.props.accessibilityRole).toBe('button');
  });
});

/*
  RELEVÉ « RÉNOVATION » — l'aperçu couchait des feuilles que le PDF imprime
  debout (595 × 842).
*/
describe('l’aperçu du dossier', () => {
  it('montre des A4 debout', () => {
    expect(FORMAT_FEUILLE).toBeCloseTo(595 / 842, 6);
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <MiniatureFeuille feuille={{ genre: 'plan', titre: 'Plan coté' }} murs={[]} net largeur={148} />,
      );
    });
    const svg = r.root.find((n) => n.props.testID === 'miniature-plan');
    expect(svg.props.height).toBeGreaterThan(svg.props.width);
    expect(svg.props.height).toBeCloseTo(148 * (842 / 595), 3);
    act(() => r.unmount());
  });
});

/*
  RELEVÉ « SENIOR » — il cherchait l'export dans le menu du plan.
*/
describe('le menu du plan', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('ouvre « Exporter ou imprimer » en tête, et l’icône dit la même chose', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useUsage.setState({ modeElec: true });
      useScanStore.setState({ screen: 'result', ...PLAN_DU_MAGASIN });
      t = TestRenderer.create(<ResultScreen />);
    });
    poser(t);
    arbre = t;
    const icone = t.root.findAll(estUneTouche).find((n) => n.props.accessibilityLabel === 'Exporter ou imprimer le plan');
    expect(icone).toBeDefined();
    expect(icone!.props.accessibilityRole).toBe('button');

    const plus = t.root.findAll(estUneTouche).find((n) => n.props.accessibilityLabel === 'Options du plan')!;
    act(() => plus.props.onPress());
    act(() => jest.advanceTimersByTime(400));
    // En tête : la section « Le dossier », avant même le métier.
    const mots = t.root.findAllByType(Text).map((x) => [].concat(x.props.children ?? []).join(''));
    const tete = mots.indexOf('Le dossier');
    expect(tete).toBeGreaterThanOrEqual(0);
    expect(mots.slice(tete + 1).find((m) => m.length > 0)).toBe('Exporter ou imprimer');
    expect(tete).toBeLessThan(mots.indexOf('Électricité'));
    const premiere = t.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .filter((n) => n.findAllByType(Text).some((x) => x.props.children === 'Exporter ou imprimer'))
      .pop()!;

    expect(t.root.findByType(ExportSheet).props.visible).toBe(false);
    act(() => premiere.props.onPress());
    act(() => jest.advanceTimersByTime(600));
    expect(t.root.findByType(ExportSheet).props.visible).toBe(true);
  });
});

/*
  RELEVÉS DE L'ARCHITECTE ET DES EXPORTS — le DXF.
*/
describe('le DXF', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  const PIECE = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
  const plan = (nom: string) => ({
    walls: PIECE,
    openings: [],
    rooms: [{ id: 'r1', name: nom, wallIds: PIECE.map((w) => w.id) }],
    fixtures: [],
    objects: [],
  });
  /** L'entité TEXT qui porte `mot` : ses paires (code → valeur). */
  const entiteDe = (dxf: string, mot: string) => {
    const l = dxf.split(/\r?\n/);
    const paires: [string, string][] = [];
    for (let i = 0; i + 1 < l.length; i += 2) paires.push([l[i].trim(), l[i + 1]]);
    const i = paires.findIndex(([c, v]) => c === '1' && v === mot);
    expect(i).toBeGreaterThan(0);
    let debut = i;
    while (debut > 0 && paires[debut][0] !== '0') debut--;
    let fin = i + 1;
    while (fin < paires.length && paires[fin][0] !== '0') fin++;
    return new Map(paires.slice(debut, fin));
  };

  it('centre le nom de la pièce et sa surface sur le point d’étiquette', () => {
    const dxf = buildDxf(plan('Séjour'));
    for (const mot of ['Sejour', '12,00 m2']) {
      const e = entiteDe(dxf, mot);
      expect(e.get('72')).toBe('1');
      expect(e.get('11')).toBe(e.get('10'));
      expect(e.get('21')).toBe(e.get('20'));
    }
  });

  it('écrit la surface à deux décimales, comme le PDF', () => {
    expect(buildDxf(plan('Séjour'))).toContain('12,00 m2');
    expect(buildDxf(plan('Séjour'))).not.toMatch(/12,0 m2/);
  });

  it('déplie les ligatures au lieu de les effacer', () => {
    expect(sansAccent('Œil-de-bœuf, Cæcilia, Straße')).toBe('OEil-de-boeuf, Caecilia, Strasse');
    expect(buildDxf(plan('Cœur de l’îlot'))).toContain("Coeur de l'ilot");
  });
});

describe('les noms de fichiers', () => {
  it('gardent « oe », « ae », « ss »', () => {
    expect(deplierLigatures('Œuvre æ Æ ß œ')).toBe('OEuvre ae AE ss oe');
    expect(dxfFilename('Œil-de-bœuf')).toBe('OEil-de-boeuf - Plan.dxf');
    expect(pdfFilename('Sœur Straße')).toBe('Soeur Strasse - Plan.pdf');
    expect(objFilename('Ex æquo')).toBe('Ex aequo - Modèle 3D.obj');
    // Les accents restent hors du DXF (voir `nomDeFichier`), qui les déplie.
    expect(pdfFilename('1er étage')).toBe('1er étage - Plan.pdf');
    expect(dxfFilename('1er étage')).toBe('1er etage - Plan.dxf');
  });
});

/*
  RELEVÉ DES EXPORTS — « Envoyer le relevé brut » ne disait rien quand ça
  ratait.
*/
describe('le relevé brut', () => {
  const RELEVE = { cle: 'releve-brut:1760000000000', quand: 1760000000000, mode: 'scan', murs: 4, ouvertures: 1, meubles: 2 };

  beforeEach(() => (RoomScan.shareText as jest.Mock).mockClear());

  async function ouvrir() {
    mockDisque.set('releves-bruts', JSON.stringify([RELEVE]));
    let j!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      j = TestRenderer.create(<JournalSheet visible fermer={() => {}} />);
    });
    arbre = j;
    const bouton = j.root.findAll(
      (n) => String(n.props?.accessibilityLabel ?? '').startsWith('Envoyer le relevé brut') && typeof n.props?.onPress === 'function',
    )[0];
    expect(bouton).toBeDefined();
    return bouton;
  }

  it('dit qu’il n’est plus disponible quand son fichier a disparu', async () => {
    const bouton = await ouvrir();
    await act(async () => {
      await bouton.props.onPress();
    });
    expect(useAlerte.getState().courante?.titre).toBe('Ce relevé n’est plus disponible');
    expect(RoomScan.shareText).not.toHaveBeenCalled();
  });

  it('dit que le fichier n’est pas parti quand le partage échoue', async () => {
    const bouton = await ouvrir();
    mockDisque.set(RELEVE.cle, '{"format":"echoplan-releve-brut"}');
    (RoomScan.shareText as jest.Mock).mockRejectedValueOnce(new Error('NO_VIEW'));
    await act(async () => {
      await bouton.props.onPress();
    });
    expect(RoomScan.shareText).toHaveBeenCalled();
    const a = useAlerte.getState().courante;
    expect(a?.titre).toBe('Le fichier n’est pas parti');
    expect(a?.message).toContain('NO_VIEW');
  });
});
