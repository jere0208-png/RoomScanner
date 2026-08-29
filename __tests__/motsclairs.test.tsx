/**
 * LES MOTS QUE COMPREND QUELQU'UN QUI N'EST PAS ÉLECTRICIEN.
 *
 * Relevé du patron, après une passe globale sur l'application : « on doit
 * penser utilisateur simple, sans professionnalisme forcément. On doit rendre
 * la chose ludique. »
 *
 * TROIS ENDROITS OÙ L'APPLICATION PARLAIT MÉTIER À QUELQU'UN QUI NE L'A PAS :
 *
 *   1. LE TICKET. « ESTIMATION DE FOURNITURE », puis « TOTAL TTC » en gros.
 *      Un professionnel lit « fourniture » et comprend SANS LA POSE. Un
 *      particulier lit le prix de ses travaux, et il se trompe d'un facteur
 *      deux ou trois. La mise en garde existait — en pied de ticket, en petit,
 *      et en pro : « Fourniture seule, hors main-d'œuvre ». Elle remonte sous
 *      le total, en français de tout le monde.
 *
 *   2. LA PAGE DES GAMMES. « Quel appareillage ? » — le mot juste du métier,
 *      et un mot que personne d'autre n'emploie.
 *
 *   3. LA PAGE PRO. Elle vendait « Meubles, 3D et cotes au centimètre » et
 *      « Tous les exports : PDF, DXF, CSV ». Or RIEN DE TOUT ÇA N'EST
 *      VERROUILLÉ : le seul palier de l'application est le NOMBRE de plans.
 *      Un utilisateur gratuit se voyait donc vendre ce qu'il était déjà en
 *      train d'utiliser — c'est le pire endroit pour dire une chose fausse,
 *      celui où l'on demande de l'argent.
 *
 * Ce banc tient les trois, et le troisième par la MESURE : il lit le code
 * source des écrans pour vérifier qu'aucun ne consulte l'abonnement. Le jour
 * où l'export sera vraiment réservé, cette épreuve tombera — et c'est
 * exactement ce qu'on veut, puisque la page pourra alors le promettre.
 */
const mockCoffre = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockCoffre.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockCoffre.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockCoffre.delete(k);
  }),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisScreen } from '../src/screens/DevisScreen';
import { GammeScreen } from '../src/screens/GammeScreen';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import { GAMMES, appliquerLesTarifs } from '../src/geometry/prix';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];
const ROOMS = [{ id: 'r1', name: 'Séjour', wallIds: MURS.map((w) => w.id) }];
const APPAREILS: Fixture[] = [
  { id: 'p1', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
  { id: 'i1', kind: 'inter', wallId: 'e', along: 1, height: 1.1, side: 1 },
];

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  appliquerLesTarifs(null);
});
beforeEach(() => {
  mockCoffre.clear();
  appliquerLesTarifs(null);
});

const mots = (t: TestRenderer.ReactTestRenderer): string[] =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((s) => s.length > 0);

/** Toutes les phrases de l'écran, collées : on y cherche une idée, pas un mot. */
const prose = (t: TestRenderer.ReactTestRenderer) => mots(t).join(' § ');

const poserLePlan = () => {
  useScanStore.getState().reset();
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [],
    rooms: ROOMS as never,
    fixtures: APPAREILS,
    ceiling: [],
    photos: [],
    notes: [],
    niveauCourant: 0,
    screen: 'devis',
    gammeDevis: GAMMES[0].id,
    devisEcartes: [],
    etapeDevis: 0,
  });
};

const boutonDe = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').startsWith(nom),
    )
    .pop()!;

/**
 * Le ticket, l'attente épuisée.
 *
 * L'ACT EST ASYNCHRONE, et il doit l'être : `advanceTimersByTime` dans un
 * `act` synchrone rend la main avant que les promesses du chargement ne
 * soient tenues. La première écriture de ce banc mesurait la page
 * « Comparaison des tarifs… » en croyant lire le ticket — et deux épreuves
 * passaient au VERT pour cette seule raison, ce qui est pire qu'un rouge.
 */
const ouvrirLeTicket = async () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    poserLePlan();
    t = TestRenderer.create(<DevisScreen />);
  });
  act(() => {
    for (const v of t.root.findAllByType(View)) {
      v.props.onLayout?.({
        nativeEvent: { layout: { width: 390, height: 620 } },
      });
    }
  });
  arbre = t;
  act(() => boutonDe(t, 'Voir le prix').props.onPress());
  await act(async () => {
    jest.advanceTimersByTime(ATTENTE_MIN + 50);
  });
  return t;
};

describe('le ticket dit « matériel », et il dit ce qui manque', () => {
  it('l’enseigne parle de MATÉRIEL, pas de fourniture', async () => {
    /*
      « Fourniture » est le mot juste du métier — et c'est un mot que
      personne d'autre n'emploie. « Matériel » dit la même chose à tout le
      monde, et n'enlève rien à celui qui connaît l'autre.
    */
    const lus = prose(await ouvrirLeTicket());
    expect(lus).toContain('MATÉRIEL');
    expect(lus).not.toContain('FOURNITURE');
  });

  it('et sous le total, une phrase dit que la POSE n’est pas comprise', async () => {
    /*
      C'EST LE SEUL MALENTENDU QUI PUISSE COÛTER CHER À QUELQU'UN. Le total
      s'écrit en gros ; la mise en garde était en pied de ticket, en petit, et
      dans la langue du métier. Elle doit être là où l'on lit le chiffre.
    */
    const lus = prose(await ouvrirLeTicket()).toLowerCase();
    expect(lus).toContain('pose');
    expect(lus).toMatch(/pas comprise|non comprise/);
  });

  it('la mise en garde est PRÈS du total, pas reléguée en pied de page', async () => {
    /*
      L'épreuve du dessus passerait avec la phrase à l'autre bout de l'écran.
      Ce qu'on mesure ici, c'est la DISTANCE de lecture : entre le total et la
      phrase, il ne doit pas y avoir trois paragraphes.
    */
    const lus = mots(await ouvrirLeTicket());
    const iTotal = lus.findIndex((m) => m.includes('TOTAL'));
    const iPose = lus.findIndex((m) => /pas comprise|non comprise/i.test(m));
    expect(iTotal).toBeGreaterThanOrEqual(0);
    expect(iPose).toBeGreaterThan(iTotal);
    expect(iPose - iTotal).toBeLessThanOrEqual(3);
  });
});

describe('la page des gammes pose une question qu’on comprend', () => {
  const ouvrir = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      poserLePlan();
      useScanStore.setState({ screen: 'gamme' });
      t = TestRenderer.create(<GammeScreen />);
    });
    arbre = t;
    return t;
  };

  it('« appareillage » n’est plus le titre', () => {
    const lus = prose(ouvrir());
    expect(lus).toMatch(/prises/i);
    expect(lus).toMatch(/interrupteurs/i);
  });

  it('et le ticket ne l’appelle plus comme ça non plus', async () => {
    // Le mot vivait à deux endroits : le titre de la page, et l'étiquette du
    // bouton qui ramène dessus depuis le ticket. Corriger l'un sans l'autre
    // laisse le jargon là où l'on clique.
    expect(prose(await ouvrirLeTicket())).not.toContain('APPAREILLAGE');
  });
});

describe('la page Pro ne vend que ce qu’elle verrouille vraiment', () => {
  const ouvrir = async () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      /*
        LA PAGE VIT DANS UN `Modal`, et un modal fermé ne rend RIEN. La
        première écriture de ce banc montait la page sans la lever : deux
        épreuves passaient au vert sur une chaîne vide, ce qui est pire
        qu'un rouge — elles auraient laissé passer n'importe quelle promesse.
      */
      useAccountStore.setState({
        pro: false,
        plansUtilises: 0,
        paywallVisible: true,
      });
      t = TestRenderer.create(<PaywallScreen />);
    });
    await act(async () => {});
    arbre = t;
    return t;
  };

  /**
   * LE SEUL VERROU DE L'APPLICATION, mesuré sur le code et non sur la
   * mémoire : les écrans qui rendent la 3D, les cotes et les exports ne
   * consultent JAMAIS l'abonnement.
   */
  const lireSource = (chemin: string) =>
    readFileSync(join(__dirname, '..', 'src', chemin), 'utf8');

  it('aucun écran ne réserve la 3D ni les exports à l’abonné', () => {
    for (const f of [
      'screens/ResultScreen.tsx',
      'screens/ExportScreen.tsx',
      'screens/DevisScreen.tsx',
    ]) {
      const src = lireSource(f);
      expect(`${f} : ${/\bst?\.pro\b/.test(src)}`).toBe(`${f} : false`);
    }
  });

  it('donc elle ne promet ni la 3D ni les exports comme un déblocage', async () => {
    /*
      C'EST LA CONSÉQUENCE DE L'ÉPREUVE DU DESSUS, et c'est elle qui compte :
      promettre de débloquer ce qui n'est pas bloqué, c'est mentir à celui à
      qui l'on demande de l'argent. Ce qui est vraiment réservé, c'est le
      NOMBRE de logements — et ça se vend très bien.
    */
    const lus = prose(await ouvrir());
    expect(lus).not.toMatch(/Tous les exports/i);
    expect(lus).not.toMatch(/Meubles, 3D et cotes au centimètre/i);
  });

  it('elle dit ce qui est RÉSERVÉ : plusieurs logements', async () => {
    const lus = prose(await ouvrir()).toLowerCase();
    expect(lus).toMatch(/logements|plans/);
    expect(lus).toMatch(/étages?/);
  });

  it('et elle dit ce qui est GRATUIT, avant de demander de l’argent', async () => {
    /*
      Le contrôle en sens inverse d'une page de vente honnête : si elle ne
      nomme que ce qu'on gagne à payer, elle laisse croire que le reste est
      fermé. Le premier logement est offert EN ENTIER — c'est vrai, c'est
      généreux, et ça se dit.
    */
    expect(prose(await ouvrir()).toLowerCase()).toMatch(
      /premier logement|gratuit/,
    );
  });
});
