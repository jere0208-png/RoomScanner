/**
 * MAJ EXPORT — l'export PDF ne se fige plus à chaque case cochée.
 *
 * Point 8 de la synthèse des testeurs (« électricien », « bug-exports »,
 * « bug-fluidité ») : chaque option rebâtissait tout le dossier d'un bloc,
 * six cents millisecondes après le geste, sur le fil JavaScript — 0,8 s pour
 * dix-neuf feuilles sous Node, une à quatre secondes estimées sur iPhone,
 * pendant lesquelles ni les interrupteurs ni le défilement ne répondaient.
 *
 * Ce banc tient :
 *   — LE MÊME PDF, OCTET POUR OCTET : le dossier bâti feuille par feuille,
 *     cache compris, est celui de `buildScanPdf` pour les mêmes options —
 *     chaque option basculée une à une, puis toutes à la suite, sur
 *     l'exemple de l'électricien, celui du particulier, deux niveaux, des
 *     photos, et un nom qui imite le numéro réservé ;
 *   — LES FEUILLES INCHANGÉES SE REPRENNENT : « Cotes » ne refait que le
 *     plan, « Page de garde » renumérote sans redessiner ;
 *   — LE FIL RESPIRE : un pas par tranche au plus juste, un appui passe
 *     entre deux feuilles, et une option qui change arrête le dossier en
 *     cours ;
 *   — L'ANCIEN APERÇU RESTE, « Mise à jour… », chaque image sous sa feuille ;
 *   — LA CARTE D'ENCRE compte comme avant, à la case près ;
 *   — ET LA MESURE : le plus long blocage, avant et après.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Switch, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { RoomScan } from 'react-native-room-scan';
import * as pdf from '../src/export/pdf';
import {
  PHOTO_A_BLANC,
  buildScanPdf as reference,
  chantierDuDossier,
  nouveauCacheDuDossier,
  sommaireDuDossier,
  toBase64,
  type CacheDuDossier,
} from '../src/export/pdf';
import { batirDUneTraite, batirSansFiger } from '../src/export/batirSansFiger';
import { CarteDEncre } from '../src/export/encre';
import { imagesAlignees } from '../src/components/ApercuDuDossier';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { useAccountStore } from '../src/store/accountStore';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

type Entrees = Parameters<typeof reference>;
type Opts = NonNullable<Entrees[2]>;

const apercu = RoomScan.apercuPdf as unknown as jest.Mock;
const partager = RoomScan.sharePDF as unknown as jest.Mock;

const memes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && Buffer.from(a).equals(Buffer.from(b));

/** Monte l'écran d'export sur l'exemple, et rend ce qu'il passe au dossier. */
function monterLExemple(modeElec: boolean) {
  apercu.mockReset();
  apercu.mockImplementation(async (_b64: string, o: { maxPages: number }) =>
    Array.from({ length: Math.min(40, o.maxPages) }, (_, i) => `IMG${i}`),
  );
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useUsage.setState({ charge: true, modeElec, choisi: true });
    useAccountStore.setState({ compte: { id: 'u', methode: 'apple' }, pro: true } as never);
    useScanStore.getState().ouvrirExemple();
    useScanStore.setState({ screen: 'export' });
    t = TestRenderer.create(<ExportScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
    }
  });
  return t;
}

/** Laisse le dossier se bâtir, puis le natif rendre ses feuilles. */
const batir = async () => {
  await act(async () => {
    jest.advanceTimersByTime(700);
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** Ce que l'écran a passé au dossier, la dernière fois. */
async function entreesDeLEcran(modeElec: boolean): Promise<Entrees> {
  const espion = jest.spyOn(pdf, 'chantierDuDossier');
  espion.mockClear();
  const t = monterLExemple(modeElec);
  await batir();
  const a = espion.mock.calls[espion.mock.calls.length - 1].slice(0, 3) as Entrees;
  espion.mockRestore();
  act(() => t.unmount());
  return a;
}

let ELEC: Entrees;
let PARTICULIER: Entrees;
beforeAll(async () => {
  jest.useFakeTimers();
  ELEC = await entreesDeLEcran(true);
  PARTICULIER = await entreesDeLEcran(false);
  jest.useRealTimers();
});
afterAll(() => {
  act(() => useUsage.setState({ modeElec: true }));
});

/* ------------------------------------------------------------ fixtures */

const JPEG = readFileSync(join(__dirname, '../src/assets/film/piece.jpg')).toString('base64');

/** Deux niveaux : le dossier de tout le logement. */
function deuxNiveaux(): Entrees {
  let n = 0;
  const mur = (niveau: number, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id: `m${n++}`,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    ...(niveau ? { niveau } : {}),
  });
  const rdc = [mur(0, 0, 0, 6, 0), mur(0, 6, 0, 6, 5), mur(0, 6, 5, 0, 5), mur(0, 0, 5, 0, 0)];
  const etage = [mur(1, 0, 0, 4, 0), mur(1, 4, 0, 4, 3), mur(1, 4, 3, 0, 3), mur(1, 0, 3, 0, 0)];
  const sejour = { id: 'sejour', name: 'Séjour', wallIds: detectRooms(rdc)[0].wallIds };
  const chambre = { id: 'chambre', name: 'Chambre', wallIds: detectRooms(etage)[0].wallIds, niveau: 1 };
  const niveau = (walls: WallSeg[], rooms: typeof sejour[]) => ({ walls, openings: [], objects: [], rooms });
  return [
    { name: 'Maison Martin', ...niveau(rdc, [sejour]) },
    true,
    {
      garde: true,
      metre: true,
      elevations: true,
      toutesElevations: true,
      niveaux: [
        { nom: 'Rez-de-chaussée', scan: niveau(rdc, [sejour]), courant: true },
        { nom: 'Étage', scan: niveau(etage, [chambre]) },
      ],
    },
  ];
}

/** L'électricien, deux murs photographiés — de vraies photos, de tailles réelles. */
const avecPhotos = (e: Entrees, base64 = JPEG): Entrees => {
  const murs = e[0].walls.slice(0, 2);
  return [{ ...e[0], photos: murs.map((w, i) => ({ wallId: w.id, base64, along: i ? 0.5 : undefined })) }, e[1], e[2]];
};

/* ------------------------------------------------------------ variantes */

const opt = (e: Entrees, o: Partial<Opts>): Entrees => [e[0], e[1], { ...e[2], ...o }];
const scanAvec = (e: Entrees, s: Partial<Entrees[0]>): Entrees => [{ ...e[0], ...s }, e[1], e[2]];

/** Chaque case de l'écran d'export, basculée. */
const VARIANTES: [string, (e: Entrees) => Entrees][] = [
  ['Cotes', (e) => opt(e, { measures2D: !(e[2]?.measures2D ?? true) })],
  ['Surfaces', (e) => opt(e, { surfaces: !(e[2]?.surfaces ?? true) })],
  ['Textures', (e) => opt(e, { textures: !e[2]?.textures })],
  ['Couleur des baies', (e) => opt(e, { colorOpenings: !e[2]?.colorOpenings })],
  ['Repères 3D', (e) => opt(e, { reperes3D: !(e[2]?.reperes3D ?? true) })],
  ['Cotes sur la 3D', (e) => opt(e, { measures3D: !(e[2]?.measures3D ?? true) })],
  ['Métré', (e) => opt(e, { metre: !(e[2]?.metre ?? true) })],
  ['Page de garde', (e) => opt(e, { garde: !e[2]?.garde })],
  ['Vue 3D', (e) => [e[0], !e[1], e[2]]],
  ['Un autre angle', (e) => opt(e, { views: [...(e[2]?.views ?? []), { theta: 148, tilt: 42, zoom: 1, fx: 0, fy: 0 }] })],
  ['Murs équipés seulement', (e) => opt(e, { elevations: true, toutesElevations: !e[2]?.toutesElevations })],
  ['Sans murs de face', (e) => opt(e, { elevations: !e[2]?.elevations })],
  ['Schémas', (e) => opt(e, { schemas: e[2]?.schemas ? null : ELEC[2]?.schemas })],
  ['Plan des gaines', (e) => scanAvec(e, { routes: e[0].routes?.length ? undefined : ELEC[0].routes })],
  ['Plafond', (e) => opt(e, { ceiling: e[2]?.ceiling?.length ? [] : ELEC[2]?.ceiling })],
  ['Liste d’achats', (e) => opt(e, { achats: e[2]?.achats ? null : PARTICULIER[2]?.achats })],
  ['Meubles', (e) => scanAvec(e, { objects: e[0].objects.slice(0, Math.floor(e[0].objects.length / 2)) })],
  ['Client', (e) => scanAvec(e, { client: 'Mme Durand', address: '12 rue des Lilas' })],
];

/** Bâtit avec le cache et compare au document d'un bloc. */
function memeDocument(e: Entrees, cache: CacheDuDossier) {
  const c = chantierDuDossier(...e, cache);
  const octets = batirDUneTraite(c);
  const attendu = reference(...e);
  return { pareil: memes(octets, attendu), chantier: c };
}

describe('le même PDF, octet pour octet', () => {
  const FIXTURES: [string, () => Entrees][] = [
    ['l’électricien', () => ELEC],
    ['le particulier', () => PARTICULIER],
    ['deux niveaux', deuxNiveaux],
    ['l’électricien et ses photos', () => avecPhotos(ELEC)],
  ];

  // Les photos ne changent que les murs de face : la suite complète suffit.
  it.each(FIXTURES.slice(0, 3))('%s : chaque option, une à une', (_nom, fixture) => {
    const base = fixture();
    const cache = nouveauCacheDuDossier();
    expect(memeDocument(base, cache).pareil).toBe(true);
    const fausses: string[] = [];
    for (const [nom, v] of VARIANTES) {
      if (!memeDocument(v(base), cache).pareil) fausses.push(nom);
      // Et retour à la base : le cache rend l'ancien dossier, tel quel.
      if (!memeDocument(base, cache).pareil) fausses.push(`${nom} (retour)`);
    }
    expect(fausses).toEqual([]);
  }, 120000);

  it.each(FIXTURES)('%s : toutes les options, à la suite', (_nom, fixture) => {
    let e = fixture();
    const cache = nouveauCacheDuDossier();
    const fausses: string[] = [];
    for (const [nom, v] of VARIANTES) {
      e = v(e);
      if (!memeDocument(e, cache).pareil) fausses.push(nom);
    }
    expect(fausses).toEqual([]);
  }, 120000);

  it('compressé aussi, comme il part par mail', () => {
    const avant = process.env.ECHOPLAN_PDF_BRUT;
    process.env.ECHOPLAN_PDF_BRUT = '0';
    try {
      const cache = nouveauCacheDuDossier();
      for (const e of [ELEC, VARIANTES[0][1](ELEC), VARIANTES[7][1](ELEC), avecPhotos(ELEC)]) {
        expect(memeDocument(e, cache).pareil).toBe(true);
      }
    } finally {
      process.env.ECHOPLAN_PDF_BRUT = avant;
    }
  }, 120000);

  it('à l’envoi, la vraie photo remplace celle de l’aperçu, et le reste se reprend', () => {
    const cache = nouveauCacheDuDossier();
    // L'aperçu : les photos à blanc.
    memeDocument(avecPhotos(ELEC, PHOTO_A_BLANC), cache);
    // L'envoi : les vraies — leurs murs se refont, les autres feuilles non.
    const { pareil, chantier } = memeDocument(avecPhotos(ELEC), cache);
    expect(pareil).toBe(true);
    expect(chantier.repris.dessins + chantier.repris.flux).toBeGreaterThan(chantier.sommaire.length / 2);
  }, 60000);

  it('un nom qui imite le numéro réservé : la feuille se refait avec son numéro', () => {
    const piege = scanAvec(ELEC, { name: 'N§FEUILLE§N' });
    const cache = nouveauCacheDuDossier();
    expect(memeDocument(piege, cache).pareil).toBe(true);
    const { pareil, chantier } = memeDocument(VARIANTES[7][1](piege), cache);
    expect(pareil).toBe(true);
    // Le repère n'est plus seul sur les feuilles : aucune ne s'est gardée.
    expect(chantier.repris.dessins).toBe(0);
  }, 60000);
});

describe('les feuilles inchangées se reprennent', () => {
  it('« Cotes » ne refait que le plan coté', () => {
    const cache = nouveauCacheDuDossier();
    memeDocument(ELEC, cache);
    const { chantier } = memeDocument(VARIANTES[0][1](ELEC), cache);
    const total = chantier.sommaire.length;
    // Même nombre de feuilles, mêmes numéros : les pages compressées se reprennent.
    expect(chantier.repris.flux).toBe(total - 1);
  });

  it('« Page de garde » renumérote sans redessiner', () => {
    const cache = nouveauCacheDuDossier();
    memeDocument(ELEC, cache);
    const { chantier } = memeDocument(VARIANTES[7][1](ELEC), cache);
    // Sans garde, la perspective par défaut revient : elle seule est neuve.
    const neuves = chantier.sommaire.length - chantier.repris.dessins - chantier.repris.flux;
    expect(neuves).toBe(1);
  });

  it('le cache ne garde que les deux derniers dossiers', () => {
    const cache = nouveauCacheDuDossier();
    let e = ELEC;
    for (const [, v] of VARIANTES.slice(0, 6)) {
      e = v(e);
      memeDocument(e, cache);
    }
    const parDossier = chantierDuDossier(...e).sommaire.length;
    expect(cache.flux.size).toBeLessThanOrEqual(2 * parDossier);
    expect(cache.dessins.size).toBeLessThanOrEqual(2 * parDossier);
  });
});

describe('le fil respire', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('un pas par tranche au plus juste, et un appui passe entre deux feuilles', () => {
    const journal: string[] = [];
    let tranches = 0;
    const b = batirSansFiger(() => chantierDuDossier(...ELEC, nouveauCacheDuDossier()), {
      budget: 0,
      tranche: () => {
        tranches += 1;
        journal.push('tranche');
      },
      fini: () => journal.push('fini'),
      echec: (e) => {
        throw e;
      },
    });
    expect(b).toBeDefined();
    // Rien de synchrone : on a rendu la main avant le premier pas.
    expect(journal).toEqual([]);
    setTimeout(() => journal.push('appui'), 0);
    jest.runAllTimers();
    const pas = chantierDuDossier(...ELEC).pas;
    // La planification, puis chaque pas dans sa tranche.
    expect(tranches).toBe(1 + pas);
    expect(journal[journal.length - 1]).toBe('fini');
    expect(journal.indexOf('appui')).toBeLessThan(journal.indexOf('fini'));
    expect(journal.indexOf('appui')).toBeGreaterThan(0);
  });

  it('annulé, il s’arrête au pas suivant et ne rend rien', () => {
    const fini = jest.fn();
    let tranches = 0;
    const b = batirSansFiger(() => chantierDuDossier(...ELEC, nouveauCacheDuDossier()), {
      budget: 0,
      tranche: () => {
        tranches += 1;
        if (tranches === 3) b.annuler();
      },
      fini,
      echec: fini,
    });
    jest.runAllTimers();
    expect(tranches).toBe(3);
    expect(fini).not.toHaveBeenCalled();
  });

  it('un dossier qui refuse de se bâtir le dit, sans lever', () => {
    const echec = jest.fn();
    batirSansFiger(
      () => {
        throw new Error('plan illisible');
      },
      { fini: jest.fn(), echec },
    );
    jest.runAllTimers();
    expect(echec).toHaveBeenCalledWith(expect.objectContaining({ message: 'plan illisible' }));
  });

  it('dans son budget, une tranche enchaîne les pas', () => {
    let horloge = 0;
    let tranches = 0;
    const fini = jest.fn();
    batirSansFiger(() => chantierDuDossier(...ELEC, nouveauCacheDuDossier()), {
      budget: 10,
      // Chaque lecture de l'horloge avance de 3 ms : quatre pas par tranche.
      horloge: () => (horloge += 3),
      tranche: () => {
        tranches += 1;
      },
      fini,
      echec: fini,
    });
    jest.runAllTimers();
    const pas = chantierDuDossier(...ELEC).pas;
    expect(fini).toHaveBeenCalledTimes(1);
    expect(tranches).toBeLessThan(pas / 2);
    expect(memes(fini.mock.calls[0][0], reference(...ELEC))).toBe(true);
  });
});

describe('chaque image sous sa feuille', () => {
  it('la page de garde cochée décale tout : les images suivent leur feuille', () => {
    const avant = [
      { genre: 'plan' as const, titre: 'Plan coté' },
      { genre: 'metre' as const, titre: 'Métré' },
      { genre: 'metre' as const, titre: 'Métré (suite)' },
      { genre: 'elevation' as const, titre: 'Mur 1' },
    ];
    const apres = [{ genre: 'garde' as const, titre: 'Page de garde' }, ...avant];
    expect(imagesAlignees(apres, avant, ['P', 'M1', 'M2', 'E1'])).toEqual(['', 'P', 'M1', 'M2', 'E1']);
    // Deux feuilles de même titre : la k-ième sous la k-ième.
    const deux = [
      { genre: 'perspective' as const, titre: 'Perspective' },
      { genre: 'perspective' as const, titre: 'Perspective' },
    ];
    expect(imagesAlignees(deux, deux, ['A', 'B'])).toEqual(['A', 'B']);
    // Au-delà des pages rendues (40 au plus), la miniature.
    expect(imagesAlignees(avant, avant, ['P'])).toEqual(['P', '', '', '']);
  });
});

describe('à l’écran : l’ancien aperçu reste, « Mise à jour… »', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Text)
      .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
      .join(' | ');
  const imagesMontrees = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => /^Feuille \d+ : /.test(String(n.props.accessibilityLabel ?? '')) && n.props.accessibilityRole === 'imagebutton', {
      deep: false,
    });

  it('une case cochée : les feuilles déjà rendues restent, et le disent', async () => {
    const t = monterLExemple(true);
    await batir();
    expect(apercu).toHaveBeenCalledTimes(1);
    expect(textes(t)).not.toMatch(/Mise à jour/);
    const avant = imagesMontrees(t).length;
    expect(avant).toBeGreaterThan(0);
    const garde = t.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === 'Page de garde')!;
    act(() => garde.props.onValueChange(false));
    // Tout de suite : l'ancien aperçu est là, et il se met à jour.
    expect(textes(t)).toMatch(/Mise à jour…/);
    expect(t.root.findAll((n) => n.props.testID === 'apercu-mise-a-jour').length).toBeGreaterThan(0);
    await batir();
    expect(apercu).toHaveBeenCalledTimes(2);
    expect(textes(t)).not.toMatch(/Mise à jour/);
    act(() => t.unmount());
  });

  it('trois cases à la suite : un seul dossier, celui des derniers choix', async () => {
    const espion = jest.spyOn(pdf, 'chantierDuDossier');
    const t = monterLExemple(true);
    await batir();
    espion.mockClear();
    const sw = (l: string) => t.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === l)!;
    act(() => sw('Page de garde').props.onValueChange(false));
    act(() => jest.advanceTimersByTime(200));
    act(() => sw('Métré').props.onValueChange(false));
    act(() => jest.advanceTimersByTime(200));
    act(() => sw('Page de garde').props.onValueChange(true));
    await batir();
    // Le chantier ne se lance qu'une fois les choix posés.
    expect(espion.mock.calls.length).toBe(1);
    expect(espion.mock.calls[0][2]).toEqual(expect.objectContaining({ garde: true, metre: false }));
    espion.mockRestore();
    act(() => t.unmount());
  });

  it('l’envoi part avec le document d’un bloc, octet pour octet', async () => {
    const espion = jest.spyOn(pdf, 'chantierDuDossier');
    const t = monterLExemple(true);
    act(() => useScanStore.getState().setClientInfo('Mme Durand', '12 rue des Lilas'));
    await batir();
    const garde = t.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === 'Page de garde')!;
    act(() => garde.props.onValueChange(false));
    // Sans attendre l'aperçu : l'envoi bâtit d'une traite, avec le cache.
    partager.mockClear();
    const b = t.root.findAll((n) => n.props.accessibilityLabel === 'Exporter le PDF' && typeof n.props.onPress === 'function', {
      deep: false,
    })[0];
    await act(async () => {
      await b.props.onPress();
    });
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(partager).toHaveBeenCalledTimes(1);
    const dernier = espion.mock.calls[espion.mock.calls.length - 1].slice(0, 3) as Entrees;
    expect(dernier[2]?.garde).toBe(false);
    expect(partager.mock.calls[0][0]).toBe(toBase64(reference(...dernier)));
    espion.mockRestore();
    act(() => t.unmount());
  });
});

describe('la carte d’encre compte comme avant', () => {
  it('à la case près, traits et aplats mêlés aux questions', () => {
    // Un générateur fixe : le banc rejoue toujours la même partie.
    let graine = 12345;
    const alea = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };
    for (let essai = 0; essai < 6; essai++) {
      const carte = new CarteDEncre(20 + alea() * 10, 30 + alea() * 10, 300 + alea() * 100, 200 + alea() * 100);
      for (let k = 0; k < 400; k++) {
        const r = alea();
        const p = () => ({ x: -20 + alea() * 460, y: -20 + alea() * 360 });
        if (r < 0.3) carte.segment(p(), p(), alea() * 2);
        else if (r < 0.4) carte.boite({ ...p(), w: alea() * 40, h: alea() * 15 });
        else if (r < 0.45) carte.disque(p(), alea() * 6);
        else if (r < 0.5) carte.aplat([[p(), p(), p(), p()]]);
        else {
          const b = { ...p(), w: alea() * 80 - 5, h: alea() * 30 - 3 };
          expect(carte.sous(b)).toBe(carte.sousCaseParCase(b));
        }
      }
    }
  });
});

describe('la mesure : le plus long blocage du fil, avant et après', () => {
  /** La médiane de trois : un banc partagé a ses à-coups. */
  const mediane = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  /** Le dossier mené tranche par tranche, chaque tranche chronométrée. */
  function tranches(e: Entrees, cache: CacheDuDossier, budget: number) {
    const durees: number[] = [];
    let fini = false;
    const file: (() => void)[] = [];
    batirSansFiger(() => chantierDuDossier(...e, cache), {
      budget,
      ceder: (suite) => file.push(suite),
      horloge: () => performance.now(),
      tranche: (ms) => durees.push(ms),
      fini: () => {
        fini = true;
      },
      echec: (err) => {
        throw err;
      },
    });
    while (file.length) file.shift()!();
    expect(fini).toBe(true);
    return { max: Math.max(...durees), total: durees.reduce((a, b) => a + b, 0), n: durees.length };
  }

  it('l’exemple de l’électricien, 19 feuilles', () => {
    reference(...ELEC); // à chaud
    // AVANT : le dossier d'un bloc, puis son base64 pour l'aperçu, dans la même tâche.
    const avant = mediane(
      [0, 1, 2].map(() => {
        const t0 = performance.now();
        toBase64(reference(...ELEC));
        return performance.now() - t0;
      }),
    );
    // APRÈS : chaque tranche, à froid (cache vide), puis une case basculée.
    const froid = [0, 1, 2].map(() => tranches(ELEC, nouveauCacheDuDossier(), 12));
    const unPas = [0, 1, 2].map(() => tranches(ELEC, nouveauCacheDuDossier(), 0));
    const cache = nouveauCacheDuDossier();
    tranches(ELEC, cache, 12);
    const cotes = tranches(VARIANTES[0][1](ELEC), cache, 12);
    const garde = tranches(VARIANTES[7][1](ELEC), cache, 12);
    const sommaire = mediane(
      [0, 1, 2].map(() => {
        const t0 = performance.now();
        sommaireDuDossier(...ELEC);
        return performance.now() - t0;
      }),
    );
    const ms = (x: number) => `${Math.round(x)} ms`;
    // eslint-disable-next-line no-console
    console.log(
      [
        `MESURE maj-export (${sommaireDuDossier(...ELEC).length} feuilles, Node/V8${/jitless/.test(process.env.NODE_OPTIONS ?? '') ? ' sans JIT' : ''} sous Jest) :`,
        `  avant — un seul bloc (dossier + base64) : ${ms(avant)}`,
        `  après — plus longue tranche, cache vide : ${ms(mediane(froid.map((f) => f.max)))} (budget 12 ms, ${froid[0].n} tranches, ${ms(mediane(froid.map((f) => f.total)))} de travail en tout)`,
        `  après — un pas par tranche : plus longue ${ms(mediane(unPas.map((f) => f.max)))}`,
        `  après — « Cotes » basculée, cache chaud : plus longue ${ms(cotes.max)}, ${ms(cotes.total)} en tout`,
        `  après — « Page de garde » basculée, cache chaud : plus longue ${ms(garde.max)}, ${ms(garde.total)} en tout`,
        `  le sommaire (à chaque rendu de l'écran) : ${ms(sommaire)}`,
      ].join('\n'),
    );
    // La plus longue tranche est une feuille de plan : bien moins que le bloc d'avant.
    expect(mediane(unPas.map((f) => f.max))).toBeLessThan(avant * 0.6);
    // Une case basculée ne coûte plus un dossier entier.
    expect(cotes.total).toBeLessThan(avant * 0.6);
  }, 120000);
});
