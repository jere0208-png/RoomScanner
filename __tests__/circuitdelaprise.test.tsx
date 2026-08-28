/**
 * LA PRISE MONTRE SON CIRCUIT.
 *
 * On touche une prise sur la maquette : ses sœurs du même départ s'entourent
 * d'une bague, et le tableau aussi. C'est la question qu'on se pose devant un
 * logement qu'on n'a pas câblé soi-même — « celle-là, elle est sur quoi ? » —
 * et jusqu'ici la seule façon d'y répondre était d'ouvrir le schéma
 * unifilaire, de lire un repère, puis de revenir chercher le même repère sur
 * le plan, appareil par appareil.
 *
 * POURQUOI SUR LA MAQUETTE ET PAS SUR LE PLAN. Un départ ne se lit pas en
 * liste : il se lit dans l'espace. « Les six prises du séjour et les deux du
 * couloir sur le même 20 A » ne veut rien dire tant qu'on ne voit pas où elles
 * sont les unes par rapport aux autres. C'est aussi ce qui fait voir le
 * pontage : les socles d'un même pan, sur un même départ, se tirent de proche
 * en proche.
 *
 * LE MÊME APPUI SERT DÉJÀ À AUTRE CHOSE, et c'est le partage qu'il faut tenir
 * : une COMMANDE allume ce qu'elle commande (banc `allumerlalumiere`), tout le
 * RESTE montre son départ. Un appareil ne fait donc jamais les deux, et aucun
 * appareil ne reste muet sous le doigt.
 *
 * CE QUE CE BANC NE PEUT PAS TENIR : à quoi ça ressemble. Le rendu ne se
 * regarde pas depuis cette machine. Il tient ce qui se mesure — qui porte une
 * bague, qui n'en porte pas, de quelle couleur, et de quelle taille selon le
 * cadrage.
 */
const canevasPresent = { valeur: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
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
  get RoomScanCanvas() {
    return canevasPresent.valeur ? 'RoomScanCanvas' : undefined;
  },
}));

import React from 'react';
import { View } from 'react-native';
import { Circle, Rect } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore } from '../src/store/scanStore';
import { planCircuits, type Circuit } from '../src/geometry/nfc15100';
import { circuitColor } from '../src/geometry/schema';
import { EM_TEXTE } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';

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

/*
  L'APPAREILLAGE, POSÉ POUR QUE LES TROIS DÉPARTS SOIENT DIFFÉRENTS.

  Deux socles 16 A tombent ensemble (huit par circuit, la norme) ; une prise
  20 A a son circuit dédié ; l'interrupteur part avec l'éclairage. Trois
  départs, donc — et c'est le minimum pour prouver que la bague CHOISIT, au
  lieu de tout entourer.

  Tout est posé sur les faces « n » et « e », côté 1 : ce sont celles que la
  caméra de ce banc regarde. Un appareil au dos du modèle n'a ni cible ni
  bague, et c'est voulu — on ne touche pas ce qu'on ne voit pas.
*/
const PRISE_A: Fixture = {
  id: 'p1',
  kind: 'prise',
  wallId: 'n',
  along: 1,
  height: 0.25,
  side: 1,
};
const PRISE_B: Fixture = {
  id: 'p2',
  kind: 'prise',
  wallId: 'e',
  along: 1,
  height: 0.25,
  side: 1,
};
/** Le four : circuit dédié, donc un AUTRE départ que les deux socles. */
const PRISE_20: Fixture = {
  id: 'p20',
  kind: 'prise20',
  wallId: 'n',
  along: 4,
  height: 1.1,
  side: 1,
};
const INTER: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'n',
  along: 2.5,
  height: 1.1,
  side: 1,
};
const TABLEAU: Fixture = {
  id: 't1',
  kind: 'tableau',
  wallId: 'e',
  along: 3,
  height: 1.35,
  side: 1,
};
const LAMPE: CeilingFixture = {
  id: 'c1',
  kind: 'dcl',
  roomId: 'r1',
  at: { x: 2.5, z: 2 },
  commands: ['i1'],
};

const APPAREILS = [PRISE_A, PRISE_B, PRISE_20, INTER, TABLEAU];

/**
 * LES DÉPARTS, CALCULÉS COMME LE TABLEAU LES CALCULE.
 *
 * On ne les écrit pas à la main : ce banc doit prouver que la maquette montre
 * les circuits DU DOSSIER, pas des groupes qu'elle se serait inventés. Une
 * liste rédigée ici prouverait seulement que le composant sait entourer ce
 * qu'on lui donne.
 */
const CIRCUITS: Circuit[] = planCircuits(
  APPAREILS,
  () => 'Séjour',
  () => false,
  () => 'r1',
  [LAMPE],
);

/** Le rang d'un départ dans le tableau : c'est lui qui donne la teinte. */
const rangDe = (fixtureId: string) =>
  CIRCUITS.findIndex((c) => c.fixtureIds.includes(fixtureId));

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (props: Record<string, unknown> = {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: APPAREILS,
      ceiling: [LAMPE],
      photos: [],
    });
    t = TestRenderer.create(
      <Iso3DView
        value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }}
        circuits={CIRCUITS}
        {...props}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
  });
  arbre = t;
  return t;
};

/** La vue qui porte les gestes. */
const gestes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll(
    (n) => typeof n.props?.onStartShouldSetResponder === 'function',
  )[0];

/**
 * UN APPUI SIMPLE, tel que le `PanResponder` le voit.
 *
 * `PanResponder` IGNORE l'état de geste qu'on lui passe et le RECALCULE depuis
 * `e.touchHistory` : appelé avec un `touchBank` vide, il lance sur
 * `touchActive` et l'épreuve échoue à côté de son sujet. On lui donne donc un
 * doigt crédible — posé, puis relâché au même endroit. C'est la fonction du
 * banc `allumerlalumiere`, et elle est recopiée plutôt que partagée : un banc
 * qui dépend d'un autre banc casse en cascade.
 */
const taper = (t: TestRenderer.ReactTestRenderer, x: number, y: number) => {
  const v = gestes(t);
  const horloge = 1000;
  const doigt = {
    touchActive: true,
    startPageX: x,
    startPageY: y,
    startTimeStamp: horloge,
    currentPageX: x,
    currentPageY: y,
    currentTimeStamp: horloge,
    previousPageX: x,
    previousPageY: y,
    previousTimeStamp: horloge,
  };
  const ev = (actif: boolean) => ({
    nativeEvent: {
      touches: actif ? [{ identifier: 0, pageX: x, pageY: y }] : [],
      changedTouches: [{ identifier: 0, pageX: x, pageY: y }],
      identifier: 0,
      pageX: x,
      pageY: y,
      locationX: x,
      locationY: y,
      timestamp: horloge,
    },
    touchHistory: {
      touchBank: [{ ...doigt, touchActive: actif }],
      numberActiveTouches: actif ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: horloge,
    },
  });
  act(() => {
    v.props.onStartShouldSetResponder?.(ev(true));
    v.props.onResponderGrant?.(ev(true));
  });
  act(() => {
    v.props.onResponderRelease?.(ev(false));
  });
};

const parId = (t: TestRenderer.ReactTestRenderer, id: string) =>
  t.root.findAll((n) => String(n.props?.testID ?? '') === id)[0];

/** Touche un appareil au centre de sa cible. */
const toucherAppareil = (t: TestRenderer.ReactTestRenderer, id: string) => {
  const cible = parId(t, `cible-${id}`);
  expect(cible).toBeDefined();
  taper(t, cible.props.cx, cible.props.cy);
};

/** Les bagues de départ posées sur la maquette, par appareil. */
const bagues = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Circle)
    .filter((n) => String(n.props.testID ?? '').startsWith('bague-'))
    .map((n) => String(n.props.testID));

/** Les halos de lumière — ils ne doivent PAS s'allumer sur une prise. */
const halos = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Circle)
    .filter((n) => String(n.props.testID ?? '').startsWith('halo-'));

describe('toucher une prise montre son départ', () => {
  it('rien n’est entouré tant qu’on n’a rien touché', () => {
    expect(bagues(monter())).toEqual([]);
  });

  it('la prise touchée et sa sœur du même départ s’entourent', () => {
    const t = monter();
    toucherAppareil(t, 'p1');
    expect(bagues(t)).toEqual(expect.arrayContaining(['bague-p1', 'bague-p2']));
  });

  it('et le TABLEAU aussi : c’est de là que part le circuit', () => {
    /*
      C'est la moitié de la réponse. Savoir que deux prises sont sœurs sans
      savoir d'où elles viennent ne dit pas où couper — et couper, c'est la
      raison pour laquelle on pose la question.
    */
    const t = monter();
    toucherAppareil(t, 'p1');
    expect(bagues(t)).toContain('bague-t1');
  });

  it('mais PAS un appareil d’un autre départ', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte tout le banc : si la bague se
      posait sur tout ce qui est à l'écran, les trois épreuves du dessus
      passeraient sans rien prouver. Le four a son circuit dédié — il ne doit
      pas s'allumer quand on touche un socle du séjour.
    */
    const t = monter();
    toucherAppareil(t, 'p1');
    expect(bagues(t)).not.toContain('bague-p20');
  });

  it('et le four, touché à son tour, n’entoure que lui et le tableau', () => {
    const t = monter();
    toucherAppareil(t, 'p20');
    expect(bagues(t).sort()).toEqual(['bague-p20', 'bague-t1']);
  });

  it('un second appui sur la même prise efface les bagues', () => {
    const t = monter();
    toucherAppareil(t, 'p1');
    expect(bagues(t).length).toBeGreaterThan(0);
    toucherAppareil(t, 'p1');
    expect(bagues(t)).toEqual([]);
  });

  it('toucher une prise d’un AUTRE départ change de départ, sans l’éteindre', () => {
    const t = monter();
    toucherAppareil(t, 'p1');
    toucherAppareil(t, 'p20');
    expect(bagues(t).sort()).toEqual(['bague-p20', 'bague-t1']);
  });
});

describe('les deux gestes ne se mélangent pas', () => {
  it('toucher une prise n’allume aucune lumière', () => {
    const t = monter();
    toucherAppareil(t, 'p1');
    expect(halos(t)).toHaveLength(0);
  });

  it('toucher l’interrupteur allume, et n’entoure rien', () => {
    /*
      Une commande a déjà son travail : elle allume ce qu'elle commande. Lui
      faire faire les deux poserait des bagues à demeure dès qu'une lampe est
      allumée — le contraire de ce qu'on cherche, qui est de désigner UN
      départ à la fois.
    */
    const t = monter();
    toucherAppareil(t, 'i1');
    expect(halos(t)).toHaveLength(1);
    expect(bagues(t)).toEqual([]);
  });

  it('et le départ montré survit à l’allumage d’une lampe', () => {
    const t = monter();
    toucherAppareil(t, 'p1');
    toucherAppareil(t, 'i1');
    expect(halos(t)).toHaveLength(1);
    expect(bagues(t)).toEqual(expect.arrayContaining(['bague-p1', 'bague-p2']));
  });
});

describe('la bague porte la couleur du départ, celle du tableau', () => {
  it('c’est la teinte de la roue des circuits, au rang du départ', () => {
    /*
      UNE SEULE SOURCE POUR LA COULEUR D'UN CIRCUIT. Le plan, le PDF et le
      schéma unifilaire lisent tous `circuitColor` au rang du départ ; une
      teinte choisie à part dans la maquette dirait « C2 » en vert sur le
      dossier et en bleu sur le modèle.
    */
    const t = monter();
    toucherAppareil(t, 'p1');
    const bague = parId(t, 'bague-p1');
    expect(bague.props.stroke).toBe(circuitColor(rangDe('p1')));
  });

  it('et deux départs différents ne portent pas la même', () => {
    // Le contrôle en sens inverse : une couleur constante passerait l'épreuve
    // du dessus sur un plan à un seul circuit.
    expect(circuitColor(rangDe('p1'))).not.toBe(circuitColor(rangDe('p20')));
  });
});

describe('le départ se nomme, sinon la couleur ne dit rien', () => {
  it('une étiquette porte le repère, le nom du départ et sa protection', () => {
    /*
      DEUX LIGNES, ET C'EST LA VÉRIFICATION À L'ŒIL QUI L'A DEMANDÉ. Sur une
      seule ligne, l'étiquette réservait 228 pixels ; dézoomée à 0,35, le
      logement entier en occupait 145 — le commentaire recouvrait le plan.
      Elle prend la forme du cartouche de pièce : identité au-dessus,
      caractéristiques en dessous.
    */
    const t = monter();
    toucherAppareil(t, 'p1');
    const titre = parId(t, 'etiquette-depart');
    expect(titre).toBeDefined();
    expect(String(titre.props.children)).toContain(`C${rangDe('p1') + 1}`);
    expect(String(titre.props.children)).toContain('Prises');
    expect(String(parId(t, 'etiquette-protection').props.children)).toContain(
      '20 A',
    );
  });

  it('et son cadre ne réserve QUE la ligne la plus longue', () => {
    /*
      LA MESURE QUI A MOTIVÉ LES DEUX LIGNES, tenue par un banc pour qu'elle ne
      se reperde pas au premier libellé plus long.

      Sur une seule ligne, l'étiquette réservait la somme des deux — 228 pixels,
      soit plus que le logement entier vu de loin. Coupée, elle ne réserve plus
      que le plus long des deux traits. On le mesure sur le RECTANGLE, qui est
      ce qu'on dessine, et non sur le texte : c'est la boîte dessinée qui
      recouvre le plan, pas celle qu'on avait demandée.

      LE CADRE SE RECONNAÎT À SA COULEUR DE DÉPART, et surtout pas à sa hauteur :
      le cartouche d'une pièce nommée fait exactement la même — deux lignes, même
      arrondi — et l'épreuve aurait mesuré « Séjour » en croyant lire le départ.
    */
    const t = monter();
    toucherAppareil(t, 'p1');
    const teinte = circuitColor(rangDe('p1'));
    const cadre = t.root
      .findAllByType(Rect)
      .find((n) => n.props.stroke === teinte);
    expect(cadre).toBeDefined();
    const titre = String(parId(t, 'etiquette-depart').props.children);
    const protection = String(parId(t, 'etiquette-protection').props.children);
    const dUnTrait = `${titre} — ${protection}`;
    // L'encre que prendrait vraiment un trait, à la seule estimation de
    // largeur de la maison (`EM_TEXTE`), pour un corps de 11.
    const encre = (n: number) => n * 11 * EM_TEXTE;
    expect(cadre!.props.width).toBeLessThan(encre(dUnTrait.length));
    // Et le cadre reste plus large que sa plus longue ligne : on réserve la
    // place qu'on écrit. C'est le contrôle en sens inverse — une étiquette
    // rétrécie jusqu'à tronquer son texte passerait l'épreuve du dessus.
    expect(cadre!.props.width).toBeGreaterThan(
      encre(Math.max(titre.length, protection.length)),
    );
  });

  it('et elle s’en va avec les bagues', () => {
    const t = monter();
    toucherAppareil(t, 'p1');
    toucherAppareil(t, 'p1');
    expect(parId(t, 'etiquette-depart')).toBeUndefined();
  });
});

describe('la bague se mesure en mètres, pas en pixels', () => {
  /*
    C'EST LA FAUTE QUE CETTE MAISON CONNAÎT PAR CŒUR, et elle est revenue deux
    fois : cinq bancs cherchaient un mur par « strokeWidth === 30 », et le halo
    d'une lampe avait un rayon de 54 pixels — juste sur une maquette vue de
    près, absurde dézoomé. Une bague posée sur un appareil est un DESSIN : sa
    taille est celle de l'appareil, en mètres, projetée comme le reste.
  */
  const rayonAuZoom = (zoom: number) => {
    const t = monter({ value: { theta: -32, tilt: 56, zoom, ox: 0, oy: 0 } });
    toucherAppareil(t, 'p1');
    const r = parId(t, 'bague-p1').props.r;
    act(() => arbre?.unmount());
    arbre = null;
    return r;
  };

  it('elle grandit quand on zoome', () => {
    expect(rayonAuZoom(3)).toBeGreaterThan(rayonAuZoom(0.5));
  });

  it('et dézoomée, elle n’avale pas la maquette', () => {
    // Le logement fait 5 × 4 m. Une bague qui marque une plaque ne peut pas
    // couvrir une pièce.
    expect(rayonAuZoom(0.35)).toBeLessThan(20);
  });

  it('mais elle ne disparaît jamais tout à fait', () => {
    // Le contrôle en sens inverse de la borne : de très loin, on doit encore
    // voir QUELS appareils sont sur le départ.
    expect(rayonAuZoom(0.2)).toBeGreaterThan(3);
  });
});

describe('sans les départs, la maquette se tait', () => {
  /*
    La visite guidée et l'aperçu d'export montrent la même vue sans dossier
    électrique derrière. Une cible qui ne mènerait nulle part y donnerait
    l'impression d'un écran en panne : pas de départs, pas de cible.
  */
  it('une prise n’offre aucune cible quand aucun circuit n’est fourni', () => {
    const t = monter({ circuits: undefined });
    expect(parId(t, 'cible-p1')).toBeUndefined();
  });

  it('mais l’interrupteur garde la sienne : allumer ne demande pas de tableau', () => {
    const t = monter({ circuits: undefined });
    expect(parId(t, 'cible-i1')).toBeDefined();
  });
});

describe('l’écran donne bien ses départs à la maquette', () => {
  /*
    L'ÉPREUVE DE L'OUVRAGE, ET NON DE L'OUTIL. Tout ce qui précède monte la vue
    à la main avec des circuits calculés dans le banc. Si l'écran de résultat
    oubliait de les passer — ou les passait sans les pièces —, rien ne
    casserait au-dessus et la maquette resterait muette sur le chantier.
  */
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  const monterEcran = () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
        fixtures: APPAREILS,
        ceiling: [LAMPE],
        photos: [],
        screen: 'result',
      });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ResultScreen />);
    });
    // On passe en 3D : c'est là que vit la maquette.
    const bouton = t.root
      .findAll(
        (n) =>
          n.props?.accessibilityLabel === 'Passer en 3D' &&
          typeof n.props?.onPress === 'function',
      )
      .pop();
    expect(bouton).toBeTruthy();
    act(() => bouton!.props.onPress());
    act(() => jest.runOnlyPendingTimers());
    arbre = t;
    return t;
  };

  it('la vue 3D reçoit les circuits du dossier', () => {
    const t = monterEcran();
    const vue = t.root.findByType(Iso3DView);
    const recus = vue.props.circuits as Circuit[] | undefined;
    expect(Array.isArray(recus)).toBe(true);
    expect(recus!.map((c) => c.label)).toEqual(CIRCUITS.map((c) => c.label));
  });

  it('et ils portent la PIÈCE, ce qui prouve que le relevé a suivi', () => {
    /*
      Un `planCircuits` appelé sans le placement des appareils rend des
      départs dont la pièce est vide : le tableau annonce « Prises 1 » sans
      dire où. C'est la faute silencieuse que cette épreuve attrape.
    */
    const t = monterEcran();
    const recus = (t.root.findByType(Iso3DView).props.circuits ?? []) as Circuit[];
    const socles = recus.find((c) => c.fixtureIds.includes('p1'));
    expect(socles?.rooms).toEqual(['Séjour']);
  });
});
