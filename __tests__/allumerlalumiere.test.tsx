/**
 * ON APPUIE SUR L'INTERRUPTEUR, LA LUMIÈRE S'ALLUME.
 *
 * Relevé du patron : « sur le plan 3D, enlève le clic sur un mur qui donne la
 * caméra face à ce mur ; ajoute un système qui fait qu'un clic sur un
 * interrupteur qui est lié à une lumière allume celle-ci ; élargis un tout
 * petit peu la zone autour de l'interrupteur pour que le clic soit plus
 * facile ; on doit voir les lumières scintiller et plus brillantes. »
 *
 * CE QUE LE TAP FAISAIT AVANT, ET POURQUOI ÇA GÊNAIT. Un appui simple cadrait
 * la caméra face au mur touché. C'était une bonne idée pour lire une élévation,
 * et une mauvaise pour tout le reste : la maquette bougeait dès qu'on la
 * touchait sans vouloir la tourner, et il n'y avait plus AUCUN appui
 * disponible pour agir sur ce qu'on voit. Un geste qui recadre bloque tous les
 * autres.
 *
 * CE QUE ÇA DEVIENT. Le tap sert à ESSAYER l'installation : on touche
 * l'interrupteur, les points lumineux qu'il commande s'allument. C'est le geste
 * qu'on fait sur un chantier fini, et c'est la seule façon de vérifier d'un
 * coup d'œil qu'on a bien lié ce qu'il fallait.
 *
 * LA ZONE EST PLUS LARGE QUE LE SYMBOLE, et c'est le relevé qui le demande :
 * un mécanisme fait sept centimètres sur un mur de cinq mètres — quelques
 * pixels à l'écran. On vise avec un doigt, pas avec une souris. C'est la même
 * règle que le plan 2D : la cible est plus tolérante que le dessin, et elle ne
 * se confond jamais avec lui.
 *
 * CE QUE CE BANC NE PEUT PAS TENIR : le scintillement. C'est une animation, et
 * le rendu ne se regarde pas depuis cette machine. Il tient ce qui se mesure —
 * qu'un halo apparaît, qu'il disparaît, et qu'il porte bien la lumière qu'on
 * vient d'allumer.
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
import { Circle } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
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

/** Un interrupteur qui commande le point lumineux, et un qui ne commande rien. */
const INTER: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'n',
  along: 2.5,
  height: 1.1,
  side: 1,
};
const PRISE: Fixture = {
  id: 'p1',
  kind: 'prise',
  wallId: 's',
  along: 2.5,
  height: 0.25,
  side: 1,
};

/** Le second point de commande : c'est ce qui fait un va-et-vient. */
const VA: Fixture = {
  id: 'i2',
  kind: 'va',
  wallId: 'e',
  along: 2,
  height: 1.1,
  side: 1,
};

const LAMPE: CeilingFixture = {
  id: 'c1',
  kind: 'dcl',
  roomId: 'r1',
  at: { x: 2.5, z: 2 },
  commands: ['i1', 'i2'],
};

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
      fixtures: [INTER, VA, PRISE],
      ceiling: [LAMPE],
      photos: [],
    });
    t = TestRenderer.create(
      <Iso3DView
        value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }}
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
 * `e.touchHistory` — c'est le piège que la maison connaît par cœur, et la
 * première version de ce banc est tombée dedans : appelé avec un `touchBank`
 * vide, il lance sur `touchActive` et l'épreuve échoue à côté de son sujet.
 *
 * On lui donne donc un doigt crédible : posé, puis relâché au même endroit.
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

/**
 * L'EMPRISE DU DESSIN, mesurée sur ce qui est VRAIMENT tracé.
 *
 * Un rayon en pixels ne dit rien tout seul : c'est sa part du dessin qui fait
 * qu'on voit un plan ou une tache jaune. On lit donc les tracés de la maquette
 * — les `Path`, qui sont la maçonnerie ; les cercles du halo et les cibles
 * n'en sont pas et ne polluent pas la mesure.
 */
const largeurDuDessin = (t: TestRenderer.ReactTestRenderer) => {
  const xs: number[] = [];
  const lire = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const o = n as { type?: string; props?: { d?: string }; children?: unknown[] };
    if (o.type === 'RNSVGPath' && typeof o.props?.d === 'string') {
      const m = (o.props.d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
      for (let i = 0; i + 1 < m.length; i += 2) xs.push(m[i]);
    }
    (o.children ?? []).forEach(lire);
  };
  lire(t.toJSON());
  return Math.max(...xs) - Math.min(...xs);
};

/** Les halos de lumière posés sur la maquette. */
const halos = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Circle)
    .filter((n) => String(n.props.testID ?? '').startsWith('halo-'));

describe('le tap ne recadre plus la caméra', () => {
  it('un appui sur un mur laisse la vue où elle est', () => {
    /*
      C'est le relevé, mot pour mot : « enlève le clic sur un mur qui donne la
      caméra face à ce mur ». On le mesure par ce que la vue REND au parent —
      si elle recadrait, elle annoncerait un nouveau point de vue.
    */
    const vus: unknown[] = [];
    const t = monter({ onChange: (v: unknown) => vus.push(v) });
    // Plein milieu de la vue : sur un logement centré, c'est du mur.
    taper(t, 300, 240);
    expect(vus).toEqual([]);
  });
});

describe('un appui sur l’interrupteur allume ce qu’il commande', () => {
  it('rien n’est allumé au départ', () => {
    expect(halos(monter())).toHaveLength(0);
  });

  it('et l’appui pose un halo sur la lumière commandée', () => {
    const t = monter();
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    expect(cible).toBeDefined();
    taper(t, cible.props.cx, cible.props.cy);
    const vus = halos(t);
    expect(vus).toHaveLength(1);
    expect(vus[0].props.testID).toBe('halo-c1');
  });

  it('un second appui l’éteint : c’est un interrupteur', () => {
    const t = monter();
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    taper(t, cible.props.cx, cible.props.cy);
    taper(t, cible.props.cx, cible.props.cy);
    expect(halos(t)).toHaveLength(0);
  });

  it('une prise ne commande rien : sans départs, elle n’a même pas de cible', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Si toute la surface allumait quelque chose,
      les trois épreuves du dessus passeraient sans rien prouver. Un appareil
      qui ne commande aucun point lumineux n'offre donc aucune cible — et un
      appui dessus ne fait rien.

      LA RAISON A CHANGÉ DEPUIS, ET IL FAUT LE DIRE, sinon cette épreuve
      passerait un jour pour la mauvaise. À l'écriture, une prise n'avait
      RIEN à répondre : le tap ne servait qu'à allumer, donc pas de commande,
      pas de cible. Une prise répond maintenant elle aussi — elle montre son
      départ (banc `circuitdelaprise`).

      CE QUI TIENT ENCORE ICI, c'est que cette vue-là est montée SANS
      circuits : la visite guidée et l'aperçu d'export n'ont pas de dossier
      électrique derrière eux. Sans départs à montrer, la prise redevient
      muette, et la règle est intacte — pas de réponse, pas de cible.
    */
    const t = monter();
    expect(
      t.root.findAll((n) => String(n.props?.testID ?? '') === 'cible-p1'),
    ).toHaveLength(0);
  });
});

describe('la zone de l’interrupteur est plus large que son symbole', () => {
  it('elle est tolérante, et invisible', () => {
    /*
      Un mécanisme fait sept centimètres sur un mur de cinq mètres : quelques
      pixels à l'écran. On vise avec un doigt, pas avec une souris — c'est la
      règle du plan 2D, où la cible est plus tolérante que le dessin.
    */
    const t = monter();
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    expect(cible.props.r).toBeGreaterThan(12);
    // Invisible : elle ne doit rien ajouter au dessin.
    expect(cible.props.opacity ?? 0).toBe(0);
  });

  it('et un appui À CÔTÉ du symbole allume quand même', () => {
    const t = monter();
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    // À la limite de la cible : c'est justement ce qu'elle sert à rattraper.
    taper(t, cible.props.cx + cible.props.r * 0.8, cible.props.cy);
    expect(halos(t)).toHaveLength(1);
  });

  it('mais un appui LOIN n’allume rien', () => {
    // Le contrôle en sens inverse de la tolérance : elle a une limite.
    const t = monter();
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    taper(t, cible.props.cx + cible.props.r * 4, cible.props.cy);
    expect(halos(t)).toHaveLength(0);
  });
});

describe('une lumière allumée se voit', () => {
  it('son halo est clair et large — plus que la pastille du plafonnier', () => {
    const t = monter();
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    taper(t, cible.props.cx, cible.props.cy);
    const halo = halos(t)[0];
    // Un halo de lumière déborde largement de ce qui l'émet.
    expect(halo.props.r).toBeGreaterThan(20);
    expect(String(halo.props.fill)).toMatch(/^#|^url\(/);
  });
});

describe('un va-et-vient se prouve depuis les deux bouts', () => {
  /*
    C'EST LE PIÈGE DE CÂBLAGE DU VA-ET-VIENT, et la seule raison d'essayer
    l'installation avant de percer : on allume en entrant dans le couloir, on
    doit pouvoir éteindre en sortant par l'autre bout. Un lien oublié ne se
    voit sur aucun plan — il se voit ICI, quand le second interrupteur
    n'éteint pas.

    CES ÉPREUVES SONT UN GARDE-FOU, PAS UNE CORRECTION — et il faut le dire,
    sinon ce commentaire mentirait. On les a écrites en croyant corriger une
    approximation : la bascule regarde le GROUPE d'un interrupteur (« si
    toutes ses lampes sont allumées, éteindre ; sinon allumer »), et l'on
    pensait que deux commandes se comporteraient donc comme deux copies d'un
    même bouton.

    ELLES SONT PASSÉES DU PREMIER COUP. Sur une lampe commandée de deux
    endroits, « toutes allumées » est vrai dès que la première commande l'a
    allumée : la seconde éteint. Le comportement était déjà celui d'un
    va-et-vient, et l'épreuve l'a montré au lieu de le corriger.

    Elles restent, parce qu'elles fixent ce comportement : le jour où l'on
    touchera à la bascule — pour le disjoncteur qui coupe, par exemple — c'est
    le va-et-vient qui cassera en premier, et sans un mot.
  */
  const cible = (t: TestRenderer.ReactTestRenderer, id: string) =>
    t.root.findAll((n) => String(n.props?.testID ?? '') === `cible-${id}`)[0];

  it('l’un allume, l’AUTRE éteint', () => {
    const t = monter();
    const un = cible(t, 'i1');
    const deux = cible(t, 'i2');
    expect(un).toBeDefined();
    expect(deux).toBeDefined();
    taper(t, un.props.cx, un.props.cy);
    expect(halos(t)).toHaveLength(1);
    taper(t, deux.props.cx, deux.props.cy);
    expect(halos(t)).toHaveLength(0);
  });

  it('un tap reste un tap, même derrière un thread occupé', () => {
    /*
      LE FANTÔME DE LA CI, attrapé en vert local et rouge machine chargée :
      la fenêtre du tap se mesurait à l'HORLOGE RÉELLE (`Date.now() − t0 <
      500 ms`). Sur une CI sous charge — ou sur un téléphone dont le thread
      JS digère une grosse scène —, le relâcher est TRAITÉ une seconde
      après l'appui alors que le doigt n'a touché qu'un dixième : le tap
      était requalifié en appui long, et l'interrupteur restait muet.

      Le geste se mesure désormais aux horodatages DES ÉVÉNEMENTS : le
      temps du doigt, pas celui de la machine qui les traite.
    */
    const t = monter();
    const vraiNow = Date.now;
    try {
      // La machine met dix secondes à traiter — le doigt, un instant
      // (les horodatages du banc datent l'appui et le relâcher pareil).
      let horloge = vraiNow();
      Date.now = () => (horloge += 10_000);
      taper(t, cible(t, 'i1').props.cx, cible(t, 'i1').props.cy);
    } finally {
      Date.now = vraiNow;
    }
    expect(halos(t)).toHaveLength(1);
  });

  it('et dans l’autre sens, évidemment', () => {
    const t = monter();
    taper(t, cible(t, 'i2').props.cx, cible(t, 'i2').props.cy);
    expect(halos(t)).toHaveLength(1);
    taper(t, cible(t, 'i1').props.cx, cible(t, 'i1').props.cy);
    expect(halos(t)).toHaveLength(0);
  });

  it('les deux points de commande offrent chacun leur cible', () => {
    // Le contrôle en sens inverse : si le second n'avait pas de cible, les
    // deux épreuves du dessus ne prouveraient rien de plus que la première.
    const t = monter();
    expect(cible(t, 'i1')).toBeDefined();
    expect(cible(t, 'i2')).toBeDefined();
    // Et ils ne sont pas au même endroit : deux murs différents.
    expect(cible(t, 'i1').props.cx).not.toBe(cible(t, 'i2').props.cx);
  });
});

describe('le halo suit l’échelle du dessin', () => {
  /*
    RELEVÉ DU PATRON, CAPTURE À L'APPUI : « un plan 3D dézoomé avec la lumière
    allumée fait que la lumière devient trop grosse pour le plan ».

    Et c'était écrit noir sur blanc dans le code : les trois cercles du halo
    avaient des rayons EN PIXELS D'ÉCRAN — 54, 26 et 9 — posés à l'œil sur une
    maquette vue de près. Dézoomé, le logement entier tient dans cent
    cinquante pixels : un halo de cinquante-quatre le noie.

    UNE LUMIÈRE A UNE PORTÉE PHYSIQUE, en mètres, comme tout le reste de cette
    vue. Elle se projette donc comme la maquette, avec la même échelle — et
    l'on borne aux deux bouts : assez grande pour se voir quand on est très
    loin, assez petite pour ne jamais avaler le plan.
  */
  const allumer = (t: TestRenderer.ReactTestRenderer) => {
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    taper(t, cible.props.cx, cible.props.cy);
    return halos(t)[0];
  };

  it('il grandit quand on zoome', () => {
    const loin = allumer(monter({ value: { theta: -32, tilt: 56, zoom: 0.5, ox: 0, oy: 0 } }));
    const petitRayon = loin.props.r;
    act(() => arbre?.unmount());
    arbre = null;
    const pres = allumer(monter({ value: { theta: -32, tilt: 56, zoom: 3, ox: 0, oy: 0 } }));
    expect(pres.props.r).toBeGreaterThan(petitRayon);
  });

  it('et dézoomé, il ne mange pas la maquette', () => {
    /*
      LA MESURE QUI COMPTE, et c'est celle de la capture : le halo rapporté à
      la taille du LOGEMENT. Un rayon en pixels ne dit rien tout seul — c'est
      sa part du dessin qui fait qu'on voit un plan ou une tache jaune.
    */
    const t = monter({ value: { theta: -32, tilt: 56, zoom: 0.35, ox: 0, oy: 0 } });
    const halo = allumer(t);
    // Le logement fait 5 × 4 m ; à ce cadrage il occupe une fraction de la
    // vue. Le halo doit rester une lampe, pas un brouillard.
    expect(halo.props.r).toBeLessThan(15);
  });

  it('mais il ne disparaît jamais tout à fait', () => {
    // Le contrôle en sens inverse : borner par le haut ne doit pas faire
    // disparaître la lumière quand on regarde le logement de très loin.
    const t = monter({ value: { theta: -32, tilt: 56, zoom: 0.2, ox: 0, oy: 0 } });
    expect(allumer(t).props.r).toBeGreaterThan(4);
  });
});

describe('et il ne fait que DIRE que la lampe est allumée', () => {
  /*
    RELEVÉ DU PATRON, APRÈS L'AVOIR VU TOURNER : « fais moins gros les lumières
    allumées au clic d'un interrupteur, divise par 2 l'étendue. On veut juste
    voir que ça allume. »

    DEUX VERSIONS DE CE HALO, ET LA SECONDE CHANGE CE QU'IL PRÉTEND ÊTRE.

      PREMIÈRE — une PORTÉE : un mètre dix, ce qu'on voit s'éclairer au sol
      sous une suspension. Le raisonnement était bon (une lumière a une taille
      physique, elle se projette comme la maquette) et le résultat trop gros :
      mesuré sur le rendu réel, le halo faisait 63 points de rayon à zoom 1,
      et son diamètre couvrait 32 % de la largeur du logement dessiné — à
      TOUS les cadrages, puisqu'il suit l'échelle. Une pièce sur trois passait
      en jaune pour dire qu'une ampoule est allumée.

      SECONDE — une MARQUE. Le halo ne simule rien : il signale. Cinquante-cinq
      centimètres, c'est ce qu'il faut pour voir qu'une lampe est allumée sans
      éclairer la pièce. Le nom suit le sens : `PORTEE_LAMPE` est devenu
      `HALO_LAMPE`, parce qu'un nom qui dit « portée » sur une marque est un
      commentaire qui ment.

    LA MESURE EST LA PART DU DESSIN, et pas un nombre de pixels : c'est elle
    qui était constante d'un cadrage à l'autre, donc c'est elle qu'on divise.
    32 % avant, 16 % après.
  */
  const partDuDessin = (zoom: number) => {
    const t = monter({ value: { theta: -32, tilt: 56, zoom, ox: 0, oy: 0 } });
    const cible = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'cible-i1',
    )[0];
    taper(t, cible.props.cx, cible.props.cy);
    const part = (halos(t)[0].props.r * 2) / largeurDuDessin(t);
    act(() => arbre?.unmount());
    arbre = null;
    return part;
  };

  it('son diamètre tient dans le cinquième du logement', () => {
    expect(partDuDessin(1)).toBeLessThan(0.2);
  });

  it('et il en couvre encore le huitième : on VOIT que ça allume', () => {
    // Le contrôle en sens inverse : diviser par deux ne doit pas rendre la
    // lampe invisible, c'est tout ce que le geste sert à montrer.
    expect(partDuDessin(1)).toBeGreaterThan(0.12);
  });

  it('et cette part ne bouge pas avec le cadrage', () => {
    /*
      C'est ce qui distingue une taille PHYSIQUE d'un nombre de pixels : deux
      cadrages qui donnent deux parts différentes trahiraient un halo revenu
      en points d'écran.
    */
    expect(partDuDessin(0.35)).toBeCloseTo(partDuDessin(2.5), 2);
  });
});
