/**
 * GLISSER-POSER DEPUIS LE CATALOGUE — cinquième des dix améliorations.
 *
 * Jusqu'ici, poser un meuble se faisait en trois temps : on touchait une
 * tuile, la fenêtre se fermait, l'application demandait DANS QUELLE PIÈCE, et
 * le meuble atterrissait au centre de celle-ci. Trois décisions pour un
 * geste qui n'en demande qu'une — et un meuble qui n'est jamais là où on le
 * voulait, donc à rattraper au doigt juste après.
 *
 * Le geste des applications de plan, c'est l'autre : on TIRE la tuile sur le
 * plan et on la lâche où elle va. La pièce se déduit du point lâché, pas
 * d'une question.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE MESURE ICI, C'EST L'ATTERRISSAGE — et il porte tout le poids du
 * geste. Un lâcher, ça vise mal : le doigt cache la cible, il tombe sur un
 * mur, à trois centimètres du coin, ou franchement à côté du plan. Quatre
 * situations, quatre réponses, et aucune ne doit être « le meuble se pose à
 * cheval sur la cloison ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  dansLeCadre,
  lacherUnMeuble,
  TOLERANCE_LACHER,
} from '../src/geometry/lacher';
import type { Pt } from '../src/geometry/floorplan';

/** Un rectangle de pièce, dans le sens des aiguilles. */
const rect = (x0: number, z0: number, w: number, d: number): Pt[] => [
  { x: x0, z: z0 },
  { x: x0 + w, z: z0 },
  { x: x0 + w, z: z0 + d },
  { x: x0, z: z0 + d },
];

const centre = (pts: Pt[]) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
});

const salle = (roomId: string, pts: Pt[]) => ({
  roomId,
  pts,
  centre: centre(pts),
});

// Un séjour de 5 × 4 m, et un dégagement de 1,20 × 3 m accolé à sa droite.
const SEJOUR = salle('sejour', rect(0, 0, 5, 4));
const DEGAGEMENT = salle('degagement', rect(5, 0, 1.2, 3));
const PLAN = [SEJOUR, DEGAGEMENT];

const LIT = { width: 1.6, depth: 2.0 };
const CHAISE = { width: 0.45, depth: 0.5 };

describe('le point du doigt, en mètres', () => {
  const cadre = { x: 0, y: 88, w: 390, h: 500 };

  it('un point du plan se ramène dans le cadre', () => {
    expect(dansLeCadre({ x: 100, y: 200 }, cadre)).toEqual({ x: 100, y: 112 });
  });

  it('et un point hors du plan ne se pose nulle part', () => {
    /*
      Le catalogue s'efface pendant le geste, mais la barre d'outils et
      l'en-tête restent : lâcher dessus n'est pas lâcher sur le plan. Sans
      cette garde, un meuble se posait sous le bouton qu'on visait.
    */
    expect(dansLeCadre({ x: 100, y: 40 }, cadre)).toBeNull();
    expect(dansLeCadre({ x: 100, y: 700 }, cadre)).toBeNull();
    expect(dansLeCadre({ x: -3, y: 200 }, cadre)).toBeNull();
    expect(dansLeCadre({ x: 500, y: 200 }, cadre)).toBeNull();
  });
});

describe('le meuble atterrit là où le doigt l’a lâché', () => {
  it('en plein milieu d’une pièce : exactement là, sans rien corriger', () => {
    const r = lacherUnMeuble(LIT, { x: 2.5, z: 2 }, PLAN);
    expect(r.pose).toBe(true);
    if (!r.pose) return;
    expect(r.roomId).toBe('sejour');
    expect(r.at.x).toBeCloseTo(2.5, 3);
    expect(r.at.z).toBeCloseTo(2, 3);
    expect(r.rectifie).toBe(false);
  });

  it('la pièce se DÉDUIT du point, elle ne se demande plus', () => {
    /*
      C'est tout le gain du geste : deux pièces au plan, aucune question. Le
      dégagement est trop étroit pour un lit — mais pas pour une chaise, et
      c'est bien là qu'elle se pose, pas dans le séjour parce qu'il est plus
      grand.
    */
    const r = lacherUnMeuble(CHAISE, { x: 5.6, z: 1.5 }, PLAN);
    expect(r.pose && r.roomId).toBe('degagement');
  });
});

describe('un lâcher, ça vise mal — et ça se rattrape', () => {
  it('lâché dans le coin, le meuble rentre en ENTIER dans la pièce', () => {
    /*
      Le doigt cache ce qu'il vise. Lâcher un lit à dix centimètres du coin,
      c'est vouloir le lit DANS le coin — pas à cheval sur deux murs. On le
      rentre, et on le dit (`rectifie`) : le geste a été rattrapé.
    */
    const r = lacherUnMeuble(LIT, { x: 0.1, z: 0.1 }, PLAN);
    expect(r.pose).toBe(true);
    if (!r.pose) return;
    expect(r.rectifie).toBe(true);
    // Toute l'emprise est dans la pièce, murs déduits.
    expect(r.at.x - LIT.width / 2).toBeGreaterThanOrEqual(0);
    expect(r.at.z - LIT.depth / 2).toBeGreaterThanOrEqual(0);
    // Et il reste COLLÉ au coin visé : on ne l'a pas renvoyé au centre.
    expect(r.at.x).toBeLessThan(1.2);
    expect(r.at.z).toBeLessThan(1.5);
  });

  it('lâché SUR un mur, il tombe dans la pièce d’à côté du trait', () => {
    /*
      Un contour n'est pas une frontière franche pour un doigt : le mur fait
      quatorze centimètres, et on lâche volontiers dessus en visant le long
      du mur. Une tolérance de quelques centimètres évite le refus qui n'a
      aucun sens à l'usage.
    */
    expect(TOLERANCE_LACHER).toBeGreaterThan(0.2);
    const r = lacherUnMeuble(CHAISE, { x: -0.08, z: 2 }, PLAN);
    expect(r.pose && r.roomId).toBe('sejour');
  });

  it('lâché franchement à côté du plan : refusé, pas deviné', () => {
    /*
      Poser un meuble dans le vide au motif qu'une pièce n'est pas loin,
      c'est fabriquer un meuble à rattraper. On rend la main.
    */
    const r = lacherUnMeuble(CHAISE, { x: 20, z: 20 }, PLAN);
    expect(r.pose).toBe(false);
    if (r.pose) return;
    expect(r.raison).toBe('hors-piece');
  });

  it('lâché dans une pièce trop petite : dit pourquoi, et ne pose pas', () => {
    /*
      La garde existait déjà au catalogue — « un lit de 2 m dans un
      dégagement de 1,20 ne se place pas, il se coince ». Elle vaut d'autant
      plus ici : le doigt a DÉSIGNÉ le dégagement, la réponse doit parler de
      celui-là, pas de la plus grande pièce du scan.
    */
    const r = lacherUnMeuble(LIT, { x: 5.6, z: 1.5 }, PLAN);
    expect(r.pose).toBe(false);
    if (r.pose) return;
    expect(r.raison).toBe('trop-grand');
    if (r.raison !== 'trop-grand') return;
    expect(r.roomId).toBe('degagement');
  });

  it('sur un plan sans aucune pièce, le lâcher est refusé — pas planté', () => {
    const r = lacherUnMeuble(LIT, { x: 1, z: 1 }, []);
    expect(r.pose).toBe(false);
  });

  it('un point qui n’est pas un nombre ne pose rien', () => {
    /*
      La leçon de la maison : « une garde qui nomme ce qu'elle REFUSE laisse
      passer les NaN ». Un cadre pas encore mesuré donne des coordonnées
      nulles ou NaN, et un meuble à NaN mètres disparaît du plan sans qu'on
      sache où le reprendre.
    */
    expect(lacherUnMeuble(LIT, { x: NaN, z: 2 }, PLAN).pose).toBe(false);
    expect(
      lacherUnMeuble({ width: NaN, depth: 2 }, { x: 2.5, z: 2 }, PLAN).pose,
    ).toBe(false);
  });
});

describe('une pièce biscornue ne reçoit pas un meuble à cheval', () => {
  it('quand le rectangle ne suffit pas, le meuble se pose au centre', () => {
    /*
      L'emprise se recale d'abord dans le rectangle hors-tout de la pièce —
      c'est le geste juste dans un logement, dont les pièces sont des
      rectangles. Une pièce en L a un rectangle hors-tout plus grand
      qu'elle : le recalage peut y laisser un coin du meuble DEHORS. On
      vérifie donc les quatre coins, et à défaut on retombe sur le centre de
      la pièce — exactement où le catalogue posait hier.
    */
    const L = salle('l', [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 1.4 },
      { x: 1.6, z: 1.4 },
      { x: 1.6, z: 5 },
      { x: 0, z: 5 },
    ]);
    const grand = { width: 2.4, depth: 2.4 };
    const r = lacherUnMeuble(grand, { x: 5.6, z: 1.2 }, [L]);
    expect(r.pose).toBe(true);
    if (!r.pose) return;
    expect(r.rectifie).toBe(true);
    // Le coin en haut à droite du L fait 1,40 m de haut : un meuble de
    // 2,40 n'y tient pas, il est reparti au centre de la pièce.
    expect(r.at.x).toBeCloseTo(L.centre.x, 6);
    expect(r.at.z).toBeCloseTo(L.centre.z, 6);
  });
});

describe('la tuile du catalogue se prend en main', () => {
  const React = require('react') as typeof import('react');
  const renderer =
    require('react-test-renderer') as typeof import('react-test-renderer');
  type Rendu = ReturnType<typeof renderer.create>;
  const {
    FurnitureSheet,
  } = require('../src/screens/result/FurnitureSheet') as typeof import('../src/screens/result/FurnitureSheet');
  const { View } = require('react-native') as typeof import('react-native');

  /** La première tuile du catalogue : celle qu'on prend au doigt. */
  const premiereTuile = (t: Rendu) =>
    t.root
      .findAllByType(View)
      .find(
        (n: { props: Record<string, unknown> }) =>
          typeof n.props.onStartShouldSetResponder === 'function' &&
          typeof n.props.onResponderRelease === 'function' &&
          n.props.accessibilityRole === 'button',
      )!;

  /*
    UN DOIGT CRÉDIBLE POUR LE `PanResponder`.

    Le piège que la maison connaît par cœur : `PanResponder` IGNORE l'état
    de geste qu'on lui passe et le RECALCULE depuis `e.touchHistory`. Avec
    un `touchBank` vide, il lance sur `touchActive` et l'épreuve échoue à
    côté de son sujet.
  */
  const ev = (x: number, y: number, t: number, actif = true) => ({
    nativeEvent: {
      touches: actif ? [{ identifier: 0, pageX: x, pageY: y }] : [],
      changedTouches: [{ identifier: 0, pageX: x, pageY: y }],
      identifier: 0,
      pageX: x,
      pageY: y,
      locationX: x,
      locationY: y,
      timestamp: t,
    },
    touchHistory: {
      touchBank: [
        {
          touchActive: actif,
          startPageX: x,
          startPageY: y,
          startTimeStamp: t,
          currentPageX: x,
          currentPageY: y,
          currentTimeStamp: t,
          previousPageX: x,
          previousPageY: y,
          previousTimeStamp: t,
        },
      ],
      numberActiveTouches: actif ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
    },
  });

  /*
    ON DÉMONTE APRÈS CHAQUE ÉPREUVE.

    La tuile lance de courtes animations (l'enfoncement, la levée) : laissées
    en vol quand le banc se termine, elles gardent un minuteur vivant, et
    Jest signale un ouvrier qui refuse de rendre la main. Le défaut n'est pas
    dans l'application — elle démonte proprement — mais un avertissement
    qu'on laisse traîner finit par masquer un vrai.
  */
  let vivant: Rendu | null = null;
  afterEach(() => {
    renderer.act(() => vivant?.unmount());
    vivant = null;
  });

  const monter = (props: Partial<React.ComponentProps<typeof FurnitureSheet>>) => {
    let t!: Rendu;
    renderer.act(() => {
      t = renderer.create(
        <FurnitureSheet
          visible
          quete=""
          onQuete={() => {}}
          onClose={() => {}}
          onPick={() => {}}
          onGlisser={() => {}}
          onLacher={() => {}}
          {...props}
        />,
      );
    });
    vivant = t;
    return t;
  };

  it('un appui bref reste un appui : le catalogue marche comme avant', () => {
    /*
      Le glisser-poser AJOUTE un geste, il n'en retire pas. Quelqu'un qui
      touche une tuile veut toujours poser le meuble — au centre de la
      pièce, comme hier.
    */
    const pris: string[] = [];
    const t = monter({ onPick: (i: any) => pris.push(i.key) });
    const tuile = premiereTuile(t);
    renderer.act(() => {
      tuile.props.onStartShouldSetResponder(ev(40, 600, 0));
      tuile.props.onResponderGrant(ev(40, 600, 0));
      tuile.props.onResponderRelease(ev(41, 601, 90, false));
    });
    expect(pris.length).toBe(1);
  });

  it('maintenue, elle se LÈVE — et le catalogue s’efface pour montrer le plan', () => {
    /*
      C'est le geste d'iOS, et il n'y en a pas d'autre possible : le
      catalogue défile verticalement, un glissement immédiat appartient donc
      à la LISTE. La tuile ne prend la main qu'une fois MAINTENUE — et à cet
      instant seulement le catalogue s'écarte, sinon on tirerait un meuble
      sur un plan qu'on ne voit pas.
    */
    jest.useFakeTimers();
    try {
      const suivis: any[] = [];
      const t = monter({ onGlisser: (i: any, p: any) => suivis.push(p) });
      const tuile = premiereTuile(t);
      renderer.act(() => {
        tuile.props.onStartShouldSetResponder(ev(40, 600, 0));
        tuile.props.onResponderGrant(ev(40, 600, 0));
      });
      // Avant la levée, la liste garde le droit de défiler.
      expect(tuile.props.onResponderTerminationRequest(ev(40, 600, 10))).toBe(
        true,
      );
      renderer.act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(tuile.props.onResponderTerminationRequest(ev(40, 600, 400))).toBe(
        false,
      );
      expect(suivis.length).toBeGreaterThan(0);
      renderer.act(() => {
        tuile.props.onResponderMove(ev(180, 300, 500));
      });
      expect(suivis[suivis.length - 1]).toEqual({ x: 180, y: 300 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('et au lever du doigt, elle dit OÙ elle a été lâchée', () => {
    jest.useFakeTimers();
    try {
      const laches: any[] = [];
      const pris: string[] = [];
      const t = monter({
        onLacher: (i: any, p: any) => laches.push({ key: i.key, p }),
        onPick: (i: any) => pris.push(i.key),
      });
      const tuile = premiereTuile(t);
      renderer.act(() => {
        tuile.props.onStartShouldSetResponder(ev(40, 600, 0));
        tuile.props.onResponderGrant(ev(40, 600, 0));
        jest.advanceTimersByTime(400);
        tuile.props.onResponderMove(ev(200, 250, 500));
        tuile.props.onResponderRelease(ev(200, 250, 600, false));
      });
      expect(laches).toEqual([{ key: expect.any(String), p: { x: 200, y: 250 } }]);
      // Un meuble tiré sur le plan ne se pose PAS aussi au centre : deux
      // meubles pour un geste, c'est le genre de bogue qu'on retrouve au
      // devis trois jours plus tard.
      expect(pris.length).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('l’écran branche le geste sur le plan', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('le plan remonte de quoi viser, l’écran s’en sert au lâcher', () => {
    expect(lire('src/components/FloorplanEditor.tsx')).toContain('onViseur');
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('lacherUnMeuble');
    expect(ecran).toContain('onViseur');
  });
});
