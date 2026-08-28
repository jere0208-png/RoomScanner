/**
 * L'ÉCRAN VA VOIR SI LES PRIX SONT À JOUR, ET LE DIT.
 *
 * Relevé du patron : « pour les prix, j'aimerais une actualisation automatique
 * via l'application, au clic sur le devis, un chargement des prix avec une
 * animation moderne pour voir si les prix sont à jour. Fournir une référence
 * pour le prix (ex : Castorama - date). »
 *
 * CE QUE CE BANC GARDE, ET CE QU'IL NE PEUT PAS GARDER. Le rendu d'une
 * interface React Native ne se REGARDE pas depuis cette machine — on ne peut
 * pas juger à l'œil un anneau qui tourne. Ce banc garantit donc la STRUCTURE,
 * et c'est dit ici en toutes lettres : l'attente s'affiche pendant qu'on va
 * voir, le ticket la remplace ensuite, la référence est écrite, et chacune des
 * trois issues porte les bons mots. Le rythme de l'animation, lui, est à juger
 * dans l'application.
 *
 * TROIS ÉPREUVES QUI COMPTENT PLUS QUE LES AUTRES.
 *
 *   ON N'APPELLE PAS LE SERVEUR TANT QU'ON NE DEMANDE PAS LE PRIX. Les deux
 *   premières étapes ne montrent aucun chiffre, et l'on peut reculer sans
 *   jamais voir le ticket : un aller-retour au serveur pendant qu'on choisit
 *   sa gamme serait un appel pour rien, sur un chantier où le réseau se paie.
 *
 *   LE TOTAL SUIT LE CATALOGUE REÇU. C'est le piège de ce branchement : le
 *   catalogue vit dans un module, React ne le voit pas changer. Sans le
 *   compteur qui force le rechiffrage, les prix arriveraient et l'écran
 *   afficherait toujours les anciens — le devis mentirait sur ce qu'il vient
 *   lui-même d'aller chercher.
 *
 *   ET HORS LIGNE, ON LE DIT AU LIEU DE FAIRE COMME SI. Un devis se fait aussi
 *   en cave. Le bandeau perd alors son bleu et dit avec quoi l'on chiffre.
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

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisScreen } from '../src/screens/DevisScreen';
import { SERVEUR } from '../src/config/serveur';
import { GAMMES, appliquerLesTarifs, dateDuReleve } from '../src/geometry/prix';
import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const vraie = SERVEUR.url;
beforeAll(() => {
  SERVEUR.url = 'https://exemple.test';
});
afterAll(() => {
  SERVEUR.url = vraie;
});

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
  { id: 'p2', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side: 1 },
  { id: 'i1', kind: 'inter', wallId: 'e', along: 1, height: 1.1, side: 1 },
  { id: 't1', kind: 'tableau', wallId: 'o', along: 1, height: 1.35, side: 1 },
];

const CATALOGUE = {
  version: '2026-09',
  releve: '2026-09-03',
  source: 'Castorama',
  // Une gaine à cent euros : de quoi voir le total bouger sans le calculer.
  prix: { 'icta-20': 100, 'icta-16': 100, 'icta-25': 100 },
};

let appels = 0;

const repond = (charge: Record<string, unknown>) => {
  global.fetch = jest.fn(async () => {
    appels += 1;
    return { json: async () => charge } as Response;
  }) as unknown as typeof fetch;
};

const muet = () => {
  global.fetch = jest.fn(async () => {
    appels += 1;
    throw new Error('réseau');
  }) as unknown as typeof fetch;
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  appliquerLesTarifs(null);
});

beforeEach(() => {
  appels = 0;
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

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').startsWith(nom),
    )
    .pop()!;

/** Le dessin doit avoir une taille, sans quoi le plan du ticket reste à zéro. */
const mesurer = (t: TestRenderer.ReactTestRenderer) => {
  act(() => {
    for (const v of t.root.findAllByType(View)) {
      v.props.onLayout?.({
        nativeEvent: { layout: { width: 390, height: 620 } },
      });
    }
  });
};

const ouvrir = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
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
    });
    t = TestRenderer.create(<DevisScreen />);
  });
  mesurer(t);
  arbre = t;
  return t;
};

/** Les deux appuis qui mènent au prix. */
const demanderLePrix = (t: TestRenderer.ReactTestRenderer) => {
  act(() => bouton(t, 'Continuer').props.onPress());
  act(() => bouton(t, 'Voir le prix').props.onPress());
};

describe('on ne dérange le serveur que quand on demande le prix', () => {
  it('les deux premières étapes n’appellent personne', () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    expect(appels).toBe(0);
    act(() => bouton(t, 'Continuer').props.onPress());
    expect(appels).toBe(0);
  });

  it('et « Voir le prix » y va une seule fois', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    await act(async () => {});
    expect(appels).toBe(1);
  });
});

describe('pendant qu’on va voir', () => {
  it('l’attente s’affiche à la place du ticket', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    // Avant que la promesse ne se règle : l'attente, et pas de ticket.
    const pendant = mots(t);
    expect(pendant).toContain('Vérification des prix');
    expect(pendant).not.toContain('ESTIMATION DE FOURNITURE');
    await act(async () => {});
    const apres = mots(t);
    expect(apres).toContain('ESTIMATION DE FOURNITURE');
    expect(apres).not.toContain('Vérification des prix');
  });
});

describe('le bandeau dit d’où viennent les prix', () => {
  it('l’enseigne et le jour, quand le catalogue est arrivé', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    await act(async () => {});
    const lus = mots(t);
    expect(lus).toContain('Prix actualisés');
    expect(lus).toContain(`Castorama · ${dateDuReleve('2026-09-03')}`);
  });

  it('et le dit autrement quand on n’a pas pu y aller', async () => {
    muet();
    const t = ouvrir();
    demanderLePrix(t);
    await act(async () => {});
    const lus = mots(t);
    expect(lus).toContain('Prix non vérifiés');
    // On dit AVEC QUOI l'on chiffre : un prix sans provenance ne vaut pas
    // mieux qu'une devinette.
    expect(lus.some((m) => m.startsWith('Estimation EchoPlan · '))).toBe(true);
  });
});

describe('le total suit le catalogue reçu', () => {
  it('les prix arrivés rechiffrent la page, ils ne dorment pas dans un module', async () => {
    muet();
    const t = ouvrir();
    demanderLePrix(t);
    await act(async () => {});
    // Le total est écrit juste après « TOTAL TTC » : on lit le voisin, pas
    // une étiquette qu'on aurait recopiée.
    const totalLu = (u: TestRenderer.ReactTestRenderer) => {
      const lus = mots(u);
      return lus[lus.indexOf('TOTAL TTC') + 1];
    };
    const horsLigne = totalLu(t);

    act(() => arbre?.unmount());
    arbre = null;
    repond({ ok: true, tarifs: CATALOGUE });
    const u = ouvrir();
    demanderLePrix(u);
    await act(async () => {});
    const avecCatalogue = totalLu(u);

    expect(horsLigne).toBeDefined();
    expect(avecCatalogue).toBeDefined();
    expect(avecCatalogue).not.toBe(horsLigne);
  });
});

describe('chaque ligne porte sa propre référence', () => {
  /*
    ET C'EST LE POINT : un catalogue reçu ne couvre pas tout le bordereau. Les
    articles qu'il ignore gardent le prix embarqué, plus vieux et posé à la
    main. Une seule référence en tête de ticket les ferait tous passer pour des
    prix d'enseigne relevés le même jour.
  */
  it('celles que le catalogue couvre disent l’enseigne, les autres non', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    await act(async () => {});
    const lus = mots(t);
    const jour = dateDuReleve('2026-09-03');
    expect(lus.filter((m) => m === `Castorama · ${jour}`).length).toBeGreaterThan(1);
    // Et il reste des lignes chiffrées à l'estimation maison : sans elles,
    // cette épreuve ne prouverait rien.
    expect(lus.some((m) => m.startsWith('Ordre de grandeur du marché'))).toBe(
      true,
    );
  });
});

describe('la mise en forme d’un relevé', () => {
  it('un mois reste un mois, un jour devient un jour', () => {
    expect(dateDuReleve('2026-08')).toBe('août 2026');
    expect(dateDuReleve('2026-09-03')).toBe('3 septembre 2026');
  });

  it('et ce qu’on ne sait pas lire se rend tel quel, sans inventer', () => {
    expect(dateDuReleve('bientôt')).toBe('bientôt');
  });
});
