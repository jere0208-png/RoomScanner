/**
 * LE GRAND PUBLIC, PARTOUT — l'électricité ne s'invite nulle part sans le mode.
 *
 * Relevé du patron : « Elle doit être suggérée à un public large sur
 * l'appstore et non seulement aux électriciens (...) c'est trop axé
 * électricité et pas très intuitif pour ceux qui n'y comprennent rien. »
 *
 * Le mode Électricité (`store/usage`) masquait déjà le métier sur le plan, en
 * 3D, au devis et aux exports. En refaisant le tour de CHAQUE écran avec les
 * yeux de quelqu'un qui veut seulement meubler son salon, cinq endroits le
 * laissaient encore passer :
 *
 *   1. le SCAN — un viseur au centre et trois boutons « Prise · Inter ·
 *      Lumière », plus un guide qui s'ouvrait de lui-même pour les
 *      expliquer, sur l'écran de la première impression ;
 *   2. la FIN DU SCAN — « Électricité proposée aux normes », à cocher : elle
 *      aurait posé des socles que le plan, ensuite, cache ;
 *   3. MES SCANS — la vignette peignait en rouge les pièces non conformes à
 *      la NF C 15-100. Sans une prise posée, TOUTES le sont : le salon de
 *      quelqu'un qui n'a rien demandé sortait en défaut ;
 *   4. la CONNEXION promettait « le dossier électrique » ;
 *   5. la page PRO vendait la norme et le tableau, et rien de l'exploration.
 *
 * Chaque épreuve a son contrôle en sens inverse : en mode Électricité, tout
 * est là comme avant. On masque, on ne retire pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => undefined),
  connexionApple: jest.fn(async () => ({ id: 'A1' })),
  acheterAbonnement: jest.fn(async () => true),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { ScanScreen } from '../src/screens/ScanScreen';
import { ChoixScan } from '../src/components/ChoixScan';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { SignInScreen } from '../src/screens/SignInScreen';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { DiagnosticSheet } from '../src/components/DiagnosticSheet';
import { useScanStore, type SavedScan } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useUsage } from '../src/store/usage';
import { pourChercher } from '../src/ui/mots';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  // Le banc par défaut est électricien (voir `jest.setup.js`) : on l'y rend.
  act(() => useUsage.setState({ modeElec: true, choisi: true }));
});

const enMode = (modeElec: boolean) =>
  act(() => useUsage.setState({ charge: true, modeElec, choisi: true }));

const monter = (el: React.ReactElement) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  arbre = t;
  return t;
};

/** Tout le texte affiché, mis à plat. */
const textesDe = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

const libelles = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(TouchableOpacity)
    .map((n) => String(n.props.accessibilityLabel ?? ''));

const PIECES = SNAPSHOT_ROOMS.map((r, i) => ({
  id: r.id,
  name: `Pièce ${i + 1}`,
  floor: null,
  wallIds: r.wallIds,
}));

describe('1 — le scan : un scanner, pas un outil de pose', () => {
  const scanEnCours = () =>
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'scan',
        scanning: true,
        paused: false,
        processing: false,
      });
    });

  it('grand public : ni viseur, ni « Prise · Inter · Lumière »', () => {
    enMode(false);
    scanEnCours();
    const t = monter(<ScanScreen />);
    act(() => jest.advanceTimersByTime(50));
    expect(libelles(t).some((l) => l.startsWith('Poser '))).toBe(false);
    expect(libelles(t)).not.toContain('À quoi servent ces boutons');
    // Et la commande qui compte reste là.
    expect(textesDe(t)).toContain('Terminer');
  });

  it('électricien : le bloc de pose est là, ses trois boutons et son « ? »', () => {
    enMode(true);
    scanEnCours();
    const t = monter(<ScanScreen />);
    const poser = libelles(t).filter((l) => l.startsWith('Poser '));
    expect(poser).toHaveLength(3);
    expect(libelles(t)).toContain('À quoi servent ces boutons');
  });
});

describe('2 — la fin du scan ne propose que ce qui se verra', () => {
  const cases = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(TouchableOpacity)
      .filter((n) => n.props.accessibilityRole === 'checkbox')
      .map((n) => pourChercher(String(n.props.accessibilityLabel)));

  it('grand public : les meubles détectés, pas l’électricité', () => {
    const t = monter(
      <ChoixScan visible meubles={3} elec={false} onValider={jest.fn()} onClose={jest.fn()} />,
    );
    const vu = cases(t);
    expect(vu).toHaveLength(1);
    expect(vu[0]).toContain('meuble');
    expect(pourChercher(textesDe(t))).not.toContain('nf c 15-100');
  });

  it('électricien : la ligne de la norme est toujours là', () => {
    const t = monter(<ChoixScan visible meubles={3} onValider={jest.fn()} onClose={jest.fn()} />);
    expect(cases(t)).toHaveLength(2);
  });

  it('et sans meuble détecté, le grand public n’a rien à cocher : la feuille ne s’ouvre pas', () => {
    enMode(false);
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'result',
        scanName: 'Salon',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: [],
        rooms: PIECES,
        fixtures: [],
        ceiling: [],
        photos: [],
        arrivage: { meubles: 0 },
      });
    });
    const t = monter(<ResultScreen />);
    act(() => jest.advanceTimersByTime(400));
    const choix = t.root.findAllByType(ChoixScan)[0];
    expect(choix?.props.visible ?? false).toBe(false);
    // La question est consommée : elle ne reviendra pas plus tard.
    expect(useScanStore.getState().arrivage).toBeNull();
  });
});

describe('3 — Mes scans : un salon sans prise n’est pas un salon en défaut', () => {
  const ROUGE = '#8E1B1B';
  const scan: SavedScan = {
    id: 'a',
    name: 'Mon salon',
    createdAt: 1000,
    updatedAt: 1000,
    modelPath: '',
    rooms: PIECES,
    walls: SNAPSHOT_WALLS,
    openings: SNAPSHOT_OPENINGS,
    objects: SNAPSHOT_OBJECTS,
    fixtures: [],
    photos: [],
    ceiling: [],
  };
  const rouges = (modeElec: boolean) => {
    enMode(modeElec);
    act(() =>
      useScanStore.setState({ screen: 'library', saves: [scan], folders: [], currentSaveId: null }),
    );
    const t = monter(<LibraryScreen />);
    return t.root.findAllByType(Line).filter((n) => n.props.stroke === ROUGE).length;
  };

  it('grand public : aucun mur en rouge', () => {
    expect(rouges(false)).toBe(0);
  });

  it('électricien : les pièces sans socle sortent en défaut, comme sur le plan', () => {
    expect(rouges(true)).toBeGreaterThan(0);
  });
});

describe('4 — la connexion promet un logement, pas un dossier électrique', () => {
  it('la phrase sous la marque ne parle pas d’électricité', () => {
    const vu = pourChercher(textesDe(monter(<SignInScreen />)));
    expect(vu).not.toContain('electri');
    expect(vu).toContain('3d');
  });
});

describe('5 — la page Pro vend ce qu’on va faire', () => {
  beforeEach(() => {
    useAccountStore.setState({
      charge: true,
      compte: { id: 'email:x@y.fr', methode: 'email' },
      pro: false,
      proVia: null,
      plansUtilises: 0,
      paywallVisible: true,
      essaiEpuiseVisible: false,
    });
  });

  it('grand public : l’exploration est dite, la norme se résume au mode', () => {
    enMode(false);
    const t = monter(<PaywallScreen />);
    const vu = textesDe(t);
    expect(pourChercher(vu)).toContain('explor');
    // Le métier reste UNE ligne, comme une porte : pas deux lignes de jargon.
    expect(vu.split('NF C 15-100').length - 1).toBeLessThanOrEqual(1);
    expect(pourChercher(vu)).toContain('mode electricite');
    // Et chaque ligne tient sur une ligne : la page ne défile pas.
    for (const l of t.root.findAll((n) => n.props?.testID === 'ligne-atout')) {
      const mot = l.findAll((n) => typeof n.props?.children === 'string')[0];
      expect(String(mot.props.children).length).toBeLessThanOrEqual(40);
    }
  });

  it('électricien : la norme et le tableau, en toutes lettres', () => {
    enMode(true);
    const vu = textesDe(monter(<PaywallScreen />));
    expect(vu).toContain('NF C 15-100');
    expect(pourChercher(vu)).toContain('tableau');
    expect(pourChercher(vu)).toContain('explor');
  });
});

describe('et le plan ne calcule pas une norme qu’il ne montre pas', () => {
  /*
    `checkElectrical` croise chaque appareil à chaque pièce : c'est le calcul
    le plus lourd de l'écran. Le grand public n'en voit jamais le résultat —
    on ne le paie donc pas, et le diagnostic ne parle que du relevé.
  */
  const diagnostic = (modeElec: boolean) => {
    enMode(modeElec);
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'result',
        scanName: 'Salon',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: PIECES,
        fixtures: [],
        ceiling: [],
        photos: [],
      });
    });
    const t = monter(<ResultScreen />);
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    return t.root.findAllByType(DiagnosticSheet)[0].props.issues as { key: string }[];
  };

  it('grand public : aucun constat électrique', () => {
    expect(diagnostic(false).some((i) => i.key.startsWith('e'))).toBe(false);
  });

  it('électricien : les manques aux normes sont bien là', () => {
    expect(diagnostic(true).some((i) => i.key.startsWith('e'))).toBe(true);
  });
});
