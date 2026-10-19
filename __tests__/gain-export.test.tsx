/**
 * GAINS RAPIDES SUR L'EXPORT — un banc par amélioration.
 *
 *   1. « Le renseigner » ouvre la saisie du client, et l'export repart ;
 *   2. le menu d'export est la feuille du bas commune, et la carte DXF ne
 *      passe plus sous son texte ;
 *   3. la visionneuse du dossier se pince, et ne monte que les voisines ;
 *   4. le base64 passe par le moteur, à l'identique de la boucle ;
 *   5. le cartouche dit ce qui est écrit dessous ;
 *   6. une seule règle pour nommer les fichiers ;
 *   7. le PDF porte son titre et son auteur ;
 *   8. le DXF s'ouvre cadré, les murs à démolir en tireté ;
 *   9. des légendes parlantes, et les options dans l'ordre du dossier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Rect } from 'react-native-svg';
import { RoomScan } from 'react-native-room-scan';
import { ExportScreen } from '../src/screens/ExportScreen';
import { ExportSheet } from '../src/screens/result/ExportSheet';
import { ExportFond } from '../src/components/ExportFond';
import { BackChevron } from '../src/components/BackChevron';
import { ApercuDuDossier, ZOOM_MAX } from '../src/components/ApercuDuDossier';
import { PromptSheet, SheetShell } from '../src/components/Sheet';
import {
  buildDevisPdf,
  buildMaterialPdf,
  buildScanPdf,
  chantierDuDossier,
  devisFilename,
  fromBase64,
  materialFilename,
  pdfFilename,
  PHOTO_A_BLANC,
  sommaireDuDossier,
  toBase64,
} from '../src/export/pdf';
import { buildDxf, dxfFilename, DXF_CALQUES, TIRETE_MM } from '../src/export/dxf';
import { metreFilename } from '../src/export/csv';
import { objFilename } from '../src/export/model3d';
import { nomDeFichier } from '../src/export/nomDeFichier';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useUsage } from '../src/store/usage';
import { useAlerte } from '../src/ui/alerte';
import { light } from '../src/theme';
import { roomParts } from '../src/geometry/floorplan';
import { fixturePlacement, materialList, roomInputsOf, wallToRooms } from '../src/geometry/nfc15100';
import type { Devis, LigneDevis } from '../src/geometry/devis';
import { GAMMES } from '../src/geometry/prix';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const partager = RoomScan.sharePDF as unknown as jest.Mock;
const apercu = RoomScan.apercuPdf as unknown as jest.Mock;

const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')));

const ROOMS = SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null }));
const BASE = {
  name: 'Chantier test',
  walls: SNAPSHOT_WALLS,
  openings: SNAPSHOT_OPENINGS,
  objects: SNAPSHOT_OBJECTS,
  rooms: ROOMS,
  fixtures: SNAPSHOT_FIXTURES,
};

// ------------------------------------------------------------------ l'écran

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monterEcran(pro = true) {
  apercu.mockReset();
  apercu.mockImplementation(async () => null);
  partager.mockClear();
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useAccountStore.setState({ compte: pro ? { id: 'u1', methode: 'apple' } : null, pro } as never);
    useScanStore.setState({
      screen: 'export',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: ROOMS,
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      north: 0,
    });
    t = TestRenderer.create(<ExportScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  arbre = t;
  return t;
}

const laisserPasser = async (ms = 700) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('1. « Le renseigner » ouvre la saisie, et l’export repart', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  const exporter = async (t: TestRenderer.ReactTestRenderer) => {
    const b = t.root.findAll((n) => n.props.accessibilityLabel === 'Exporter le PDF' && typeof n.props.onPress === 'function', {
      deep: false,
    })[0];
    await act(async () => {
      await b.props.onPress();
    });
  };
  const saisie = (t: TestRenderer.ReactTestRenderer) => t.root.findByType(PromptSheet).props.data;
  /** La saisie se valide : la feuille descend, puis `onSubmit` part (voir `PromptSheet`). */
  const valider = async (t: TestRenderer.ReactTestRenderer, valeur: string) => {
    const d = saisie(t);
    act(() => t.root.findByType(PromptSheet).props.onClose());
    act(() => d.onSubmit(valeur));
    await laisserPasser(50);
  };

  beforeEach(() => {
    act(() => useScanStore.getState().setClientInfo('', ''));
    act(() => useUsage.setState({ modeElec: true }));
    act(() => useAlerte.setState({ courante: null, file: [] }));
  });

  it('le nom, puis l’adresse, puis le partage — sans réappuyer, et le client est dans le dossier', async () => {
    const t = monterEcran(true);
    await laisserPasser();
    await exporter(t);
    const a = useAlerte.getState().courante!;
    expect(a.titre).toBe('Le client n’est pas renseigné');
    const renseigner = a.actions!.find((x) => x.label === 'Le renseigner')!;
    expect(typeof renseigner.onPress).toBe('function');
    act(() => {
      useAlerte.setState({ courante: null });
      renseigner.onPress!();
    });
    expect(saisie(t)?.title).toBe('Nom du client');
    expect(partager).not.toHaveBeenCalled();
    await valider(t, 'Mme Durand');
    // L'adresse manque : sa saisie suit.
    expect(saisie(t)?.title).toBe('Adresse du chantier');
    expect(partager).not.toHaveBeenCalled();
    await valider(t, '12 rue des Lilas');
    await laisserPasser(50);
    expect(useScanStore.getState().client).toBe('Mme Durand');
    expect(useScanStore.getState().address).toBe('12 rue des Lilas');
    expect(partager).toHaveBeenCalledTimes(1);
    // Le dossier parti porte le client : la relance n'a pas pris l'état d'avant.
    const pdf = Buffer.from(partager.mock.calls[0][0], 'base64').toString('latin1');
    expect(pdf).toContain('Mme Durand');
  });

  it('l’adresse déjà connue : le nom suffit', async () => {
    act(() => useScanStore.getState().setClientInfo('', '3 rue Pasteur'));
    const t = monterEcran(true);
    await laisserPasser();
    await exporter(t);
    act(() => {
      const r = useAlerte.getState().courante!.actions!.find((x) => x.label === 'Le renseigner')!;
      useAlerte.setState({ courante: null });
      r.onPress!();
    });
    await valider(t, 'M. Martin');
    await laisserPasser(50);
    expect(saisie(t)).toBeNull();
    expect(partager).toHaveBeenCalledTimes(1);
  });

  it('refermer la saisie sans l’enregistrer n’envoie rien', async () => {
    const t = monterEcran(true);
    await laisserPasser();
    await exporter(t);
    act(() => {
      const r = useAlerte.getState().courante!.actions!.find((x) => x.label === 'Le renseigner')!;
      useAlerte.setState({ courante: null });
      r.onPress!();
    });
    act(() => t.root.findByType(PromptSheet).props.onClose());
    await laisserPasser(400);
    expect(partager).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------- le menu d'export

describe('2. le menu d’export : la feuille du bas commune, la carte DXF propre', () => {
  const monterFeuille = (modeElec = false) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ExportSheet
          visible
          modeElec={modeElec}
          onClose={() => {}}
          onDismiss={() => {}}
          onPdf={() => {}}
          onObj={() => {}}
          onMaterial={() => {}}
          onCsv={() => {}}
          onDxf={() => {}}
          onImage={() => {}}
        />,
      );
    });
    arbre = t;
    return t;
  };

  it('monte dans la coquille commune : poignée qu’on tire, croix, voile', () => {
    const t = monterFeuille();
    // La coquille ouverte est celle qui porte l'export (l'hôte d'alerte
    // imbriqué a la sienne, fermée).
    const coquille = t.root
      .findAllByType(SheetShell)
      .find((c) => c.props.visible && c.findAll((n) => n.props.testID === 'feuille-export').length > 0)!;
    expect(coquille).toBeTruthy();
    expect(coquille.props.defile).toBe(false);
    const poignee = coquille.findAll((n) => n.props.testID === 'poignee-feuille' && typeof n.type === 'string')[0];
    // La poignée porte le geste qui referme, comme les autres menus.
    expect(typeof poignee.props.onResponderMove).toBe('function');
  });

  it('« Autres formats » : le chevron de l’app, tourné vers le bas, plus de « › »', () => {
    const t = monterFeuille(false);
    expect(textes(t)).not.toContain('›');
    const chevrons = t.root.findAllByType(BackChevron);
    expect(chevrons.length).toBeGreaterThan(0);
    const porteur = chevrons[0].parent!;
    const transform = ([] as { rotate?: string }[]).concat(
      ...[porteur.props.style].flat().map((s: { transform?: { rotate?: string }[] }) => s?.transform ?? []),
    );
    expect(transform.some((x) => x.rotate === '-90deg')).toBe(true);
  });

  it('l’écran noir du DXF commence où le texte de la carte s’arrête', () => {
    const largeur = 340;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ExportFond kind="dxf" c={light} largeur={largeur} hauteur={92} murs={[]} />);
    });
    arbre = t;
    const ecran = t.root.findAllByType(Rect).find((r) => r.props.fill === '#1B2029')!;
    // Le texte court jusqu'à 58 % de la carte (`exportCarteTextes`).
    expect(ecran.props.x).toBeGreaterThanOrEqual(largeur * 0.58 - 0.5);
    expect(ecran.props.x + ecran.props.width).toBeLessThanOrEqual(largeur);
  });
});

// ---------------------------------------------------- la visionneuse

describe('3. la visionneuse du dossier : pincer pour zoomer, les voisines seulement', () => {
  const sommaire = Array.from({ length: 12 }, (_, i) => ({ genre: 'elevation' as const, titre: `Mur ${i + 1}` }));

  it('ouverte sur la feuille touchée, une liste paginée qui ne garde que les voisines', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ApercuDuDossier sommaire={sommaire} images={null} enCours={false} net onDebloquer={() => {}} />,
      );
    });
    arbre = t;
    expect(t.root.findAllByType(FlatList)).toHaveLength(0);
    const septieme = t.root.findAll((n) => n.props.accessibilityLabel === 'Feuille 7 : Mur 7' && typeof n.props.onPress === 'function')[0];
    act(() => septieme.props.onPress());
    const liste = t.root.findByType(FlatList);
    expect(liste.props.initialScrollIndex).toBe(6);
    expect(liste.props.windowSize).toBeLessThanOrEqual(3);
    expect(liste.props.pagingEnabled).toBe(true);
    // Chaque feuille montée se pince jusqu'à trois fois.
    const zooms = t.root.findAllByType(ScrollView).filter((s) => s.props.maximumZoomScale === ZOOM_MAX);
    expect(zooms.length).toBeGreaterThan(0);
    expect(zooms.length).toBeLessThan(sommaire.length);
    expect(ZOOM_MAX).toBe(3);
    expect(zooms[0].props.minimumZoomScale).toBe(1);
  });

  it('un double-tap grossit là où l’on a touché, un autre revient à la feuille entière', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ApercuDuDossier sommaire={sommaire.slice(0, 2)} images={null} enCours={false} net onDebloquer={() => {}} />,
      );
    });
    arbre = t;
    act(() => t.root.findAll((n) => n.props.accessibilityLabel === 'Feuille 1 : Mur 1' && typeof n.props.onPress === 'function')[0].props.onPress());
    const zoom = t.root.findAllByType(ScrollView).find((s) => s.props.maximumZoomScale === ZOOM_MAX)!;
    const appel = jest.fn();
    // L'instance native n'existe pas sous Node : on écoute la commande.
    const inst = zoom.instance as { scrollResponderZoomTo?: unknown };
    inst.scrollResponderZoomTo = appel;
    const surface = zoom.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessible === false)[0];
    const appui = { nativeEvent: { locationX: 40, locationY: 60 } };
    act(() => surface.props.onPress(appui));
    expect(appel).not.toHaveBeenCalled();
    act(() => surface.props.onPress(appui));
    expect(appel).toHaveBeenCalledTimes(1);
    const r = appel.mock.calls[0][0];
    expect(r.width).toBeLessThan(zoom.props.contentContainerStyle.width);
    expect(r.x).toBeLessThanOrEqual(40);
    // Grossie : le double-tap suivant revient à la feuille entière.
    act(() => zoom.props.onScroll({ nativeEvent: { zoomScale: 2.4 } }));
    act(() => surface.props.onPress(appui));
    act(() => surface.props.onPress(appui));
    expect(appel.mock.calls[1][0]).toMatchObject({ x: 0, y: 0, width: zoom.props.contentContainerStyle.width });
  });
});

// ------------------------------------------------------------- le base64

describe('4. le base64 par le moteur, à l’identique de la boucle', () => {
  const aLaBoucle = <T,>(f: () => T): T => {
    const g = globalThis as { btoa?: unknown; atob?: unknown };
    const [b, a] = [g.btoa, g.atob];
    g.btoa = undefined;
    g.atob = undefined;
    try {
      return f();
    } finally {
      g.btoa = b;
      g.atob = a;
    }
  };
  const octets = (n: number) => {
    const u = new Uint8Array(n);
    let x = 12345;
    for (let i = 0; i < n; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      u[i] = x & 0xff;
    }
    return u;
  };

  it('encode octet pour octet comme la boucle, tranches et bourrage compris', () => {
    expect(typeof (globalThis as { btoa?: unknown }).btoa).toBe('function');
    for (const n of [0, 1, 2, 3, 4, 8191, 24575, 24576, 24577, 70001]) {
      const u = octets(n);
      const vite = toBase64(u);
      expect(vite).toBe(aLaBoucle(() => toBase64(u)));
      expect(vite).toBe(Buffer.from(u).toString('base64'));
    }
  });

  it('décode comme la boucle : préfixe data:, sauts de ligne, bourrage absent', () => {
    for (const n of [1, 2, 3, 10, 5000]) {
      const b64 = Buffer.from(octets(n)).toString('base64');
      const formes = [b64, `data:image/jpeg;base64,${b64}`, b64.replace(/=+$/, ''), b64.replace(/(.{76})/g, '$1\n')];
      for (const f of formes) {
        const vite = fromBase64(f);
        expect(vite).toBe(aLaBoucle(() => fromBase64(f)));
        expect(Buffer.from(vite, 'latin1').equals(Buffer.from(octets(n)))).toBe(true);
      }
    }
    // Une longueur impossible (4k + 1) : la boucle, comme avant.
    expect(fromBase64('QUJDR')).toBe(aLaBoucle(() => fromBase64('QUJDR')));
  });
});

// ------------------------------------------------------------ le cartouche

describe('5. le cartouche dit ce qui est écrit dessous', () => {
  const cartouche = (extra: object) =>
    latin1(buildScanPdf({ ...BASE, name: 'Appartement exemple', ...extra }, false, { metre: false }));
  const enWinAnsi = (s: string) => Buffer.from(s, 'latin1').toString('latin1');

  it('le nom renseigné : CLIENT, ou PROPRIÉTAIRE chez le particulier', () => {
    expect(cartouche({ client: 'Mme Dupont', address: '12 rue des Lilas' })).toContain('(CLIENT) Tj');
    expect(cartouche({ client: 'Mme Dupont', particulier: true })).toContain(enWinAnsi('(PROPRIÉTAIRE) Tj'));
  });

  it('l’adresse seule : CHANTIER, ou ADRESSE — plus « PROPRIÉTAIRE : 12 rue des Lilas »', () => {
    const pro = cartouche({ address: '12 rue des Lilas' });
    expect(pro).toContain('(CHANTIER) Tj');
    expect(pro).not.toContain('(CLIENT) Tj');
    const perso = cartouche({ address: '12 rue des Lilas', particulier: true });
    expect(perso).toContain('(ADRESSE) Tj');
    expect(perso).not.toContain(enWinAnsi('(PROPRIÉTAIRE) Tj'));
    expect(perso).toContain('(12 rue des Lilas) Tj');
  });

  it('rien de rempli : PROJET ou LOGEMENT et le nom du projet — ni FICHIER, ni .pdf, ni case vide', () => {
    for (const [particulier, mot] of [
      [false, 'PROJET'],
      [true, 'LOGEMENT'],
    ] as const) {
      const src = cartouche({ particulier });
      expect(src).not.toContain('FICHIER');
      expect(src).not.toMatch(/Appartement-exemple|\.pdf\) Tj/);
      expect(src).toContain(`(${mot}) Tj`);
      expect(src).toContain('(Appartement exemple) Tj');
    }
  });
});

// --------------------------------------------------------- les noms de fichiers

describe('6. une seule règle pour nommer les fichiers exportés', () => {
  it('« Dupont - Plan.pdf », « Dupont - Devis 2026-014.pdf », plus de « ---materiel »', () => {
    expect(pdfFilename('Dupont')).toBe('Dupont - Plan.pdf');
    expect(devisFilename('2026-014', 'Dupont')).toBe('Dupont - Devis 2026-014.pdf');
    expect(devisFilename('2026-014', '')).toBe('Devis 2026-014.pdf');
    expect(materialFilename('Appartement exemple')).toBe('Appartement exemple - Liste du matériel.pdf');
    expect(materialFilename('Appartement exemple')).not.toContain('---');
    expect(metreFilename('Appartement exemple')).toBe('Appartement exemple - Métré.csv');
    expect(objFilename('Appartement exemple')).toBe('Appartement exemple - Modèle 3D.obj');
    expect(dxfFilename('Appartement exemple')).toBe('Appartement exemple - Plan.dxf');
  });

  it('le niveau s’écrit partout de la même façon', () => {
    expect(pdfFilename('Dupont', '1er étage')).toBe('Dupont - 1er étage - Plan.pdf');
    expect(metreFilename('Dupont', '1er étage')).toBe('Dupont - 1er étage - Métré.csv');
    expect(dxfFilename('Dupont', '1er étage')).toBe('Dupont - 1er etage - Plan.dxf');
  });

  it('« Séjour l’été » se nomme pareil partout, et seul le DXF déplie les accents', () => {
    expect(pdfFilename('Séjour l’été')).toBe('Séjour l’été - Plan.pdf');
    expect(metreFilename('Séjour l’été')).toBe('Séjour l’été - Métré.csv');
    expect(dxfFilename('Séjour l’été')).toBe("Sejour l'ete - Plan.dxf");
  });

  it('rien de ce qu’un disque refuse', () => {
    const n = nomDeFichier('  T3 / rue Pasteur : « lot » *2* ? <a>|b 🏠 ', 'pdf', { genre: 'Plan' });
    expect(n).not.toMatch(/[\\/:*?"<>|]/);
    expect(n).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(n).toMatch(/^T3 rue Pasteur/);
    expect(nomDeFichier('Plan du 12/10/2026', 'csv', { genre: 'Métré' })).toBe('Plan du 12-10-2026 - Métré.csv');
    expect(nomDeFichier('...', 'pdf')).toBe('EchoPlan.pdf');
    expect(nomDeFichier('R+1', 'pdf')).toBe('R+1.pdf');
  });

  it('l’écran d’export passe le niveau à part, comme le plan pour le tableur et le DXF', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'screens', 'ExportScreen.tsx'), 'utf8');
    expect(src).toContain('pdfFilename(scanName, niveaux.length > 1 && !multi ? nomDuNiveau(niveauCourant) : undefined)');
  });
});

// ------------------------------------------------------ titre et auteur

describe('7. le PDF porte son titre et son auteur', () => {
  /** Une chaîne UTF-16 marquée, telle que /Info l'écrit. */
  const utf16 = (s: string) => `<FEFF${Array.from(s, (ch) => ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join('')}>`;

  it('le dossier : titre, auteur (l’entreprise), langue, et le titre affiché par le lecteur', () => {
    const src = latin1(buildScanPdf({ ...BASE, name: 'Appartement exemple', modeElec: true, entreprise: { nom: 'Élec Dupont' } }, false, {}));
    expect(src).toContain(`/Title ${utf16('Appartement exemple — Dossier de chantier')}`);
    expect(src).toContain(`/Author ${utf16('Élec Dupont')}`);
    expect(src).toContain('/Creator (EchoPlan)');
    expect(src).toMatch(/\/CreationDate \(D:\d{8}\)/);
    expect(src).toContain('/Lang (fr-FR)');
    expect(src).toContain('/DisplayDocTitle true');
    expect(src).toMatch(/trailer\n<< \/Size \d+ \/Root \d+ 0 R \/Info \d+ 0 R >>/);
  });

  it('sans entreprise, pas d’auteur inventé ; hors électricité, le dossier du logement', () => {
    const src = latin1(buildScanPdf({ ...BASE, name: 'Appartement exemple' }, false, {}));
    expect(src).toContain(`/Title ${utf16('Appartement exemple — Dossier du logement')}`);
    expect(src).not.toContain('/Author');
  });

  it('le dossier bâti feuille à feuille est le même document, métadonnées comprises', () => {
    const scan = { ...BASE, name: 'Appartement exemple', entreprise: { nom: 'Élec Dupont' } };
    const ch = chantierDuDossier(scan, false, {});
    while (!ch.avancer()) {
      // un pas après l'autre
    }
    expect(Buffer.from(ch.octets()!).equals(Buffer.from(buildScanPdf(scan, false, {})))).toBe(true);
  });

  it('la liste du matériel a aussi son titre', () => {
    const W = SNAPSHOT_WALLS;
    const R = ROOMS.map((r) => ({ id: r.id, name: r.name, wallIds: (SNAPSHOT_ROOMS.find((x) => x.id === r.id) as { wallIds?: string[] }).wallIds }));
    const parts = roomParts(W, R);
    const inputs = roomInputsOf(R, parts);
    const list = materialList(inputs, SNAPSHOT_FIXTURES, wallToRooms(inputs), fixturePlacement(SNAPSHOT_FIXTURES, W, inputs));
    const src = latin1(buildMaterialPdf('Appartement exemple', list));
    expect(src).toContain(`/Title ${utf16('Appartement exemple — Liste du matériel')}`);
    expect(src).toContain('/Lang (fr-FR)');
  });

  it('le devis : son numéro, son chantier, l’entreprise', () => {
    const lignes: LigneDevis[] = [
      { famille: 'Prises', code: 'prise', libelle: 'Prise 16 A', quantite: 4, unite: 'u', pu: 12, total: 48 },
    ];
    const devis: Devis = {
      gamme: GAMMES[0].id,
      version: 'test',
      lignes,
      total: 48,
      totalPublic: 50,
      parFamille: [],
      sansPrix: [],
      exclusions: [],
      legende: [],
    };
    const src = latin1(
      buildDevisPdf({
        numero: 'D-2026-0042',
        date: new Date(2026, 9, 17),
        chantier: 'Chantier Martin',
        entreprise: { nom: 'Élec Dupont' },
        devis,
      }),
    );
    expect(src).toContain(`/Title ${utf16('Devis D-2026-0042 — Chantier Martin')}`);
    expect(src).toContain(`/Author ${utf16('Élec Dupont')}`);
  });
});

// ------------------------------------------------------------------ le DXF

describe('8. le DXF s’ouvre cadré, les murs à démolir en tireté', () => {
  const paires = (dxf: string) => {
    const l = dxf.split(/\r?\n/);
    const out: [string, string][] = [];
    for (let i = 0; i + 1 < l.length; i += 2) out.push([l[i].trim(), l[i + 1]]);
    return out;
  };
  const plan = () => ({
    walls: SNAPSHOT_WALLS.map((w, i) => (i === 1 ? { ...w, nature: 'demolir' as const } : w)),
    openings: SNAPSHOT_OPENINGS,
    rooms: ROOMS,
    fixtures: SNAPSHOT_FIXTURES,
    objects: SNAPSHOT_OBJECTS,
  });

  it('déclare l’étendue du dessin, avec sa marge d’environ 5 %', () => {
    const p = paires(buildDxf(plan()));
    const val = (nom: string, code: string) => {
      const i = p.findIndex(([c, v]) => c === '9' && v === nom);
      expect(i).toBeGreaterThan(-1);
      return parseFloat(p.slice(i + 1).find(([c]) => c === code)![1]);
    };
    const ent = p.slice(p.findIndex(([c, v]) => c === '2' && v === 'ENTITIES'));
    // Les coordonnées de toutes les entités (le point d'origine des POLYLINE,
    // 0,0, est dans le dessin : il ne fausse pas la boîte).
    const sommets = (code: string) => ent.filter(([c]) => c === code).map(([, v]) => parseFloat(v));
    const x0 = Math.min(...sommets('10'));
    const x1 = Math.max(...sommets('10'));
    const y0 = Math.min(...sommets('20'));
    const y1 = Math.max(...sommets('20'));
    const [ex0, ey0, ex1, ey1] = [val('$EXTMIN', '10'), val('$EXTMIN', '20'), val('$EXTMAX', '10'), val('$EXTMAX', '20')];
    // Tout le dessin dedans…
    expect(ex0).toBeLessThan(x0);
    expect(ey0).toBeLessThan(y0);
    expect(ex1).toBeGreaterThan(x1);
    expect(ey1).toBeGreaterThan(y1);
    // … avec une marge de quelques pour cent, pas un écran vide autour.
    expect(ex1 - ex0).toBeLessThan((x1 - x0) * 1.25);
    expect(val('$LIMMIN', '10')).toBe(ex0);
    expect(val('$LIMMAX', '20')).toBe(ey1);
    // L'unité reste dite : millimètres.
    expect(val('$INSUNITS', '70')).toBe(4);
  });

  it('un tireté défini en millimètres réels, rangé avant les calques, sur le calque à démolir', () => {
    const dxf = buildDxf(plan());
    const p = paires(dxf);
    const ltype = p.findIndex(([c, v]) => c === '2' && v === 'LTYPE');
    const layer = p.findIndex(([c, v]) => c === '2' && v === 'LAYER');
    expect(ltype).toBeGreaterThan(-1);
    expect(ltype).toBeLessThan(layer);
    const i = p.findIndex(([c, v]) => c === '2' && v === 'DASHED');
    const motif = p.slice(i, i + 9).filter(([c]) => c === '49').map(([, v]) => parseFloat(v));
    expect(motif).toEqual([TIRETE_MM.trait, -TIRETE_MM.blanc]);
    // Visible sur un mur : au moins dix centimètres de trait.
    expect(TIRETE_MM.trait).toBeGreaterThanOrEqual(100);
    const j = p.findIndex(([c, v]) => c === '2' && v === 'ECHOPLAN-A-DEMOLIR');
    expect(p.slice(j, j + 5).find(([c]) => c === '6')![1]).toBe('DASHED');
    expect(DXF_CALQUES.filter((c) => c.tirete).map((c) => c.nom)).toEqual(['ECHOPLAN-A-DEMOLIR']);
    // Le mur à démolir est bien dessiné sur ce calque.
    expect(p.some(([c, v]) => c === '8' && v === 'ECHOPLAN-A-DEMOLIR')).toBe(true);
  });

  it('un plan vide reste un fichier valide, sans étendue inventée', () => {
    const dxf = buildDxf({ walls: [], openings: [], rooms: [], fixtures: [] });
    expect(dxf).not.toContain('$EXTMIN');
    expect(dxf.trim().endsWith('EOF')).toBe(true);
  });
});

// ------------------------------------------- les légendes et l'ordre

describe('9. des légendes parlantes, des options dans l’ordre du dossier', () => {
  it('les murs de face disent leur pièce et leur orientation', () => {
    const roomNames = Object.fromEntries(ROOMS.map((r) => [r.id, r.name]));
    const s = sommaireDuDossier({ ...BASE, roomNames, north: 0 }, false, { elevations: true, toutesElevations: true });
    const murs = s.filter((f) => f.genre === 'elevation').map((f) => f.titre);
    expect(murs.length).toBeGreaterThan(0);
    for (const t of murs) {
      // « Murs 2 et 5 » : les numéros du plan ne se suivent pas toujours,
      // « 2-5 » se lirait comme une plage (revue « structure »).
      expect(t).toMatch(/^(Mur \d+|Murs \d+ et \d+) · /);
    }
    // Une face seule porte sa pièce et son cardinal en court.
    const seules = murs.filter((t) => t.startsWith('Mur '));
    for (const t of seules) expect(t).toMatch(/^Mur \d+ · Pièce \d+( (N|NE|E|SE|S|SO|O|NO))?$/);
    // Rangés par pièce, les murs de façade vont par deux ; la face seule qui
    // reste ici est le refend, qui ne regarde aucun point cardinal. Une
    // façade seule — photographiée, elle garde sa feuille — porte le sien.
    const facades = sommaireDuDossier(
      {
        ...BASE,
        roomNames,
        north: 0,
        walls: BASE.walls.filter((w) => w.id !== 'refend'),
        photos: BASE.walls.filter((w) => w.id !== 'refend').map((w) => ({ wallId: w.id, base64: PHOTO_A_BLANC })),
      },
      false,
      { elevations: true, toutesElevations: true },
    ).filter((f) => f.genre === 'elevation');
    expect(facades.length).toBeGreaterThan(0);
    for (const f of facades) expect(f.titre).toMatch(/^Mur \d+ · Pièce \d+ (N|NE|E|SE|S|SO|O|NO)$/);
  });

  it('sans boussole, la pièce seule ; le PDF a autant de feuilles que son sommaire', () => {
    const roomNames = Object.fromEntries(ROOMS.map((r) => [r.id, r.name]));
    const scan = { ...BASE, roomNames, north: null };
    const opts = { elevations: true, toutesElevations: true };
    const s = sommaireDuDossier(scan, false, opts);
    for (const f of s.filter((x) => x.genre === 'elevation')) expect(f.titre).not.toMatch(/ (N|NE|E|SE|S|SO|O|NO)$/);
    const pdf = latin1(buildScanPdf(scan, false, opts));
    expect((pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length).toBe(s.length);
  });

  it('les cartes de l’écran suivent l’ordre des feuilles du dossier', () => {
    jest.useFakeTimers();
    try {
      act(() => useUsage.setState({ modeElec: true }));
      const t = monterEcran(true);
      const vus = textes(t);
      const ordre = ['Métré', 'Liste d’achats', 'Tableau existant', 'Plan des gaines', 'Vues 3D', 'Murs de face', 'Schémas électriques'];
      const rangs = ordre.map((m) => vus.indexOf(m)).filter((i) => i >= 0);
      expect(rangs.length).toBeGreaterThanOrEqual(4);
      expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
      // Les gaines passent AVANT les murs de face, comme dans le dossier.
      if (vus.includes('Plan des gaines')) expect(vus.indexOf('Plan des gaines')).toBeLessThan(vus.indexOf('Murs de face'));
    } finally {
      jest.useRealTimers();
    }
  });
});
