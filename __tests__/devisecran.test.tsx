/**
 * L'ECRAN DU DEVIS — la pastille verte, les trois etapes, et le plan qui
 * explique le prix.
 *
 * Releve du patron, 27/08/2026 : « Un bouton visible en haut, a gauche de
 * l'icone normes. Anime comme elle, mais en VERT, avec € et ? qui alternent.
 * Au clic, une page de questions etape par etape… Le resultat : un prix
 * approximatif, avec un recap detaille, et un plan qui explique pourquoi ce
 * prix : une animation qui met en valeur les interrupteurs (par exemple), et
 * affiche leur nombre et le prix moyen public. »
 *
 * CE QUE CE BANC TIENT, ET POURQUOI.
 *
 *   LA PLACE DE LA PASTILLE. « A gauche de l'icone normes » n'est pas un
 *   detail de gout : les deux boutons repondent a deux questions qu'on se
 *   pose l'une apres l'autre, et l'ordre de lecture est l'ordre des
 *   questions. Une ligne de code deplacee suffirait a l'inverser sans que
 *   rien ne le signale — le banc lit donc la source.
 *
 *   L'ETAPE DES EXCLUSIONS PASSE AVANT LE PRIX. C'est la seule page qui
 *   empeche un malentendu de mille euros. Quelqu'un qui lit le total sans
 *   avoir lu « luminaires non compris » n'a pas lu le devis, il a lu un
 *   chiffre.
 *
 *   LE PLAN DIT LE MEME NOMBRE QUE LE RECAP. Le nombre ecrit sous le dessin
 *   et celui du chiffrage doivent etre le MEME nombre — sinon l'ecran se
 *   contredit lui-meme, sur une seule page.
 *
 *   ET LA BAGUE NE SE POSE QUE SUR LE LOT DESIGNE. Une bague sur tout ne
 *   designe rien.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisPastille } from '../src/components/DevisPastille';
import { DevisSheet } from '../src/components/DevisSheet';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { buyingList, type PullRow } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import { postsSymbol, type Fixture, type FixtureKind } from '../src/geometry/electrical';
import type { Circuit, Differential } from '../src/geometry/nfc15100';
import { GAMMES } from '../src/geometry/prix';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Tous les textes d'un arbre, dans l'ordre où ils se lisent. */
const mots = (t: TestRenderer.ReactTestRenderer): string[] =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((s) => s.length > 0);

// ---------------------------------------------------------------- la pastille

describe('la pastille du devis', () => {
  it('se pose à GAUCHE de celle des normes', () => {
    /*
      Le banc lit la source : c'est un ORDRE dans un rendu, et rien d'autre
      ne le garde. Une pastille qui passerait a droite le ferait en silence.
    */
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
      'utf8',
    );
    const devis = src.indexOf('<DevisPastille');
    const controle = src.indexOf('<ControlePastille');
    expect(devis).toBeGreaterThan(0);
    expect(controle).toBeGreaterThan(0);
    expect(`devis avant contrôle : ${devis < controle}`).toBe(
      'devis avant contrôle : true',
    );
  });

  it('porte les deux signes, € et ?', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DevisPastille onPress={() => {}} />);
    });
    arbre = t;
    expect(mots(t)).toEqual(expect.arrayContaining(['€', '?']));
  });

  it('et se tait quand il n’y a rien à chiffrer', () => {
    // Le contrôle en sens inverse : un devis à zéro euro est une réponse,
    // mais pas la bonne. La pastille le dit dans son nom parlé.
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DevisPastille actif={false} onPress={() => {}} />);
    });
    arbre = t;
    const bouton = t.root.findAllByType(TouchableOpacity)[0];
    expect(String(bouton.props.accessibilityLabel)).toContain('rien de posé');
  });
});

// ------------------------------------------------------------------ la feuille

const TIRAGE: PullRow[] = [
  {
    circuitId: 'c1',
    label: 'Prises',
    section: 2.5,
    fils: 3,
    conduit: 20,
    runs: 6,
    conduitLength: 48,
    cableLength: 53,
    approx: false,
    protection: '20 A',
  },
  {
    circuitId: 'c2',
    label: 'Éclairage',
    section: 1.5,
    fils: 3,
    conduit: 16,
    runs: 4,
    conduitLength: 32,
    cableLength: 35,
    approx: false,
    protection: '16 A',
  },
];

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const fx = (id: string, kind: Fixture['kind'], along: number): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along,
  height: kind === 'inter' || kind === 'va' ? 1.1 : 0.25,
  side: 1,
});

const APPAREILS: Fixture[] = [
  fx('p1', 'prise', 1),
  fx('p2', 'prise', 2),
  fx('p3', 'prise', 3),
  fx('i1', 'inter', 4),
  fx('i2', 'va', 4.5),
];

const CIRCUITS: Circuit[] = [
  {
    id: 'c1',
    label: 'Prises',
    nature: 'prises',
    points: 3,
    section: 2.5,
    breaker: 20,
    rooms: ['Séjour'],
    fixtureIds: ['p1', 'p2', 'p3'],
  },
  {
    id: 'c2',
    label: 'Éclairage',
    nature: 'eclairage',
    points: 2,
    section: 1.5,
    breaker: 16,
    rooms: ['Séjour'],
    fixtureIds: ['i1', 'i2'],
  },
];

const DIFFS: Differential[] = [
  { label: 'A 1', type: 'A', rating: 40, circuits: ['c1'] },
];

const ACHATS = buyingList(TIRAGE, APPAREILS, []);

const poserLePlan = () =>
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [],
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
    fixtures: APPAREILS,
    ceiling: [],
    photos: [],
    notes: [],
    niveauCourant: 0,
  });

const ouvrir = (gamme = GAMMES[0].id) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    poserLePlan();
    t = TestRenderer.create(
      <DevisSheet
        visible
        onClose={() => {}}
        achats={ACHATS}
        circuits={CIRCUITS}
        differentiels={DIFFS}
        gamme={gamme}
        onGamme={() => {}}
      />,
    );
  });
  mesurer(t);
  arbre = t;
  return t;
};

/*
  ON MESURE APRÈS CHAQUE ÉTAPE, ET PAS SEULEMENT À L'OUVERTURE.

  Le plan n'apparaît qu'au troisième écran : servir la mise en page une fois
  pour toutes, au montage, laissait ce plan-là à zéro pixel. Il ne dessinait
  rien — et le banc mesurait un dessin vide en croyant compter des bagues.
  Il criait donc juste, pour la mauvaise raison.
*/
function mesurer(t: TestRenderer.ReactTestRenderer) {
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 340, height: 200 } } });
      }
    }
  });
}

/** Le bouton d'une feuille, par son nom parlé. */
const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').startsWith(nom),
    )
    .pop()!;

describe('les trois étapes', () => {
  it('commencent par le choix de l’appareillage, les cinq gammes offertes', () => {
    const t = ouvrir();
    const lus = mots(t);
    expect(lus).toContain('Quel appareillage ?');
    for (const g of GAMMES) {
      expect(lus).toContain(`${g.marque} ${g.nom}`);
    }
  });

  it('passent par ce qui n’est pas compté AVANT de donner le prix', () => {
    /*
      L'ordre est la regle : le total ne s'affiche jamais a quelqu'un qui
      n'a pas pu lire ce qu'il ne contient pas.
    */
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    const lus = mots(t).join(' ');
    expect(lus).toContain('Ce qui est compté');
    expect(lus).toContain('Luminaires');
    // Le prix ne se voit pas encore.
    expect(lus).not.toContain('Fourniture seule');
  });

  it('et finissent sur le prix, avec sa gamme et l’âge du catalogue', () => {
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    act(() => bouton(t, 'Voir le prix').props.onPress());
    const devis = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id);
    const lus = mots(t).join(' ');
    expect(lus).toContain(
      `${devis.total.toFixed(2).replace('.', ',')} €`,
    );
    expect(lus).toContain(GAMMES[0].nom);
    expect(lus).toContain(devis.version);
  });

  it('et on peut revenir en arrière sans perdre sa réponse', () => {
    // Un choix fait au premier ecran ne doit pas devenir un choix definitif.
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    act(() => bouton(t, 'Étape précédente').props.onPress());
    expect(mots(t)).toContain('Quel appareillage ?');
  });
});

describe('le plan et sa légende', () => {
  /*
    DEUX VERSIONS, ET LA PREMIERE A ETE RETIREE.

    Elle faisait defiler des lots sur le plan, entoures d'une bague verte, un
    toutes les trois secondes, avec sous le dessin le nombre et le prix du lot
    en vedette. Retiree sur releve du patron, telephone en main : « ne fais
    pas l'animation, fais un simple listing avec les icones en legende du
    plan ». Il avait raison sur le fond : on ne lit pas un prix en attendant
    son tour.

    Ce qui ne change pas d'une version a l'autre — et c'est tout l'objet du
    banc — : le nombre ecrit a cote d'un symbole est celui du chiffrage, et
    le symbole est celui que le plan dessine, pas un dessin qui lui
    ressemble.
  */
  const auPrix = () => {
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    act(() => bouton(t, 'Voir le prix').props.onPress());
    mesurer(t);
    return t;
  };

  it('écrit une ligne par appareil dessiné, avec son nombre et son prix', () => {
    const t = auPrix();
    const devis = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id);
    const lus = mots(t);
    expect(devis.legende.length).toBeGreaterThan(1);
    for (const l of devis.legende) {
      expect(lus).toContain(l.titre);
      expect(lus).toContain(
        `${l.quantite} × ${l.pu.toFixed(2).replace('.', ',')} € l’unité`,
      );
    }
  });

  it('et le symbole est celui du plan, pas un dessin qui lui ressemble', () => {
    /*
      Une legende qui redessinerait ses propres symboles cesserait d'etre une
      legende le jour ou l'un des deux changerait. On compare donc les traces
      a la table que le plan emploie.
    */
    const t = auPrix();
    const devis = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id);
    const traces = new Set(
      t.root.findAllByType(Path).map((n) => String(n.props.d)),
    );
    for (const l of devis.legende) {
      if (l.plafond) continue;
      for (const seg of postsSymbol([l.kind as FixtureKind], l.kind as FixtureKind)) {
        expect(`${l.titre} : ${traces.has(seg.d)}`).toBe(`${l.titre} : true`);
      }
    }
  });

  it('et plus rien ne bouge tout seul sur le plan', () => {
    // Le controle en sens inverse de la version retiree : trois secondes
    // passent, et la page est la meme. Une animation oubliee derriere une
    // page immobile continuerait de tourner pour personne.
    const t = auPrix();
    const avant = mots(t).join('|');
    act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(mots(t).join('|')).toBe(avant);
  });
});

describe('le défilement de la page du prix', () => {
  it('n’a qu’UNE seule zone qui défile, plan compris', () => {
    /*
      Releve du patron : « le scroll sur la liste des produits du devis est
      casse, il marche rarement ».

      La page empilait un bloc haut — le plan, deux cents points — au-dessus
      d'une liste a hauteur bornee, le tout dans une feuille deja pressable.
      Le doigt tombait une fois sur deux hors de la seule bande qui defilait,
      et rien ne se passait. Ce n'est pas un reglage a ajuster : c'est une
      zone de trop.

      Le banc compte donc les zones, et pas les pixels : une seule, et le
      plan DEDANS. Un chiffre de hauteur aurait casse a la premiere refonte
      de la page ; la nature du defaut, non.
    */
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    act(() => bouton(t, 'Voir le prix').props.onPress());
    mesurer(t);
    const rouleaux = t.root.findAllByType(ScrollView);
    expect(`zones de défilement : ${rouleaux.length}`).toBe(
      'zones de défilement : 1',
    );
    expect(
      rouleaux[0].findAllByType(FloorplanEditor).length,
    ).toBe(1);
  });
});

describe('le récapitulatif', () => {
  it('se déplie rayon par rayon, et chaque rayon dit ce qu’il pèse', () => {
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    act(() => bouton(t, 'Voir le prix').props.onPress());
    const devis = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id);
    const lus = mots(t);
    for (const f of devis.parFamille) {
      expect(lus).toContain(f.famille);
      expect(lus).toContain(`${f.total.toFixed(2).replace('.', ',')} €`);
    }
    // Replié, aucune ligne de détail n'est écrite.
    expect(lus).not.toContain('Conduit ICTA Ø20 mm');
    act(() =>
      bouton(t, devis.parFamille[0].famille).props.onPress(),
    );
    expect(mots(t).length).toBeGreaterThan(lus.length);
  });
});
