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
import { Text, TouchableOpacity, View } from 'react-native';
import { Circle } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisPastille } from '../src/components/DevisPastille';
import { DevisSheet } from '../src/components/DevisSheet';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { buyingList, type PullRow } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import type { Fixture } from '../src/geometry/electrical';
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

describe('le plan qui explique le prix', () => {
  const auPrix = () => {
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    act(() => bouton(t, 'Voir le prix').props.onPress());
    mesurer(t);
    return t;
  };

  it('dit sous le dessin le même nombre que le chiffrage', () => {
    const t = auPrix();
    const devis = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id);
    const tete = devis.vedettes[0];
    expect(mots(t)).toContain(`${tete.quantite} × ${tete.titre.toLowerCase()}`);
  });

  it('et le prix moyen public de l’un d’eux', () => {
    const t = auPrix();
    const tete = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id).vedettes[0];
    expect(mots(t).join(' ')).toContain(
      `${tete.pu.toFixed(2).replace('.', ',')} € l’unité`,
    );
  });

  it('et ne met en valeur QUE le lot désigné', () => {
    /*
      Le plan recoit des TYPES d'appareils, pas « tout ». Une bague posee
      sur tout ne designe rien — et c'est l'erreur qu'on ferait en passant
      la scene entiere.
    */
    const t = auPrix();
    const plan = t.root.findAllByType(FloorplanEditor)[0];
    const tete = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id).vedettes[0];
    expect(plan.props.vedette.murs).toEqual(tete.murs);
    expect(plan.props.vedette.murs.length).toBeLessThan(APPAREILS.length);
  });

  it('et la bague ne se pose que sur les appareils de ce lot', () => {
    /*
      Le controle en sens inverse, sur le dessin lui-meme : trois prises et
      deux commandes, un seul lot en vedette — il ne peut pas y avoir cinq
      bagues.
    */
    const t = auPrix();
    const devis = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id);
    const tete = devis.vedettes[0];
    const attendus = APPAREILS.filter((f) =>
      (tete.murs as string[]).includes(f.kind),
    ).length;
    // Les bagues sont les seuls cercles verts du plan.
    const bagues = t.root
      .findAllByType(Circle)
      .filter((n) => n.props.stroke && n.props.fill === 'none');
    expect(`bagues : ${bagues.length}`).toBe(`bagues : ${attendus}`);
    expect(attendus).toBeLessThan(APPAREILS.length);
  });

  it('et les lots se relaient tout seuls', () => {
    const t = auPrix();
    const devis = chiffrer(ACHATS, CIRCUITS, DIFFS, GAMMES[0].id);
    expect(devis.vedettes.length).toBeGreaterThan(1);
    const premier = t.root.findAllByType(FloorplanEditor)[0].props.vedette.murs;
    act(() => {
      jest.advanceTimersByTime(3300);
    });
    const suivant = t.root.findAllByType(FloorplanEditor)[0].props.vedette.murs;
    expect(`${premier.join()} → ${suivant.join()}`).not.toBe(
      `${premier.join()} → ${premier.join()}`,
    );
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
