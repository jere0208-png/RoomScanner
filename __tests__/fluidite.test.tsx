/**
 * CE QUE LE PLAN DEMANDE À CHAQUE IMAGE.
 *
 * Le relevé du chantier : « quand on met meubles + cotes, ça ne glisse plus
 * sous le doigt ». C'est une question de NOMBRE : chaque trait, chaque
 * disque, chaque mot est une balise que le moteur graphique repeint à
 * chaque image du geste. Un logement meublé et coté en compte plusieurs
 * centaines, et le téléphone ne suit plus.
 *
 * On ne peut pas mesurer des images par seconde depuis un banc d'essai. On
 * peut mesurer ce qui les coûte : le nombre de nœuds dessinés. Cette
 * épreuve compte, au repos et PENDANT le déplacement, et exige que le
 * déplacement soit nettement plus léger — c'est là, et seulement là, que la
 * fluidité se joue.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  FloorplanEditor,
  transformeDuGeste,
} from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
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
});

/** Tous les nœuds réellement dessinés, du natif au composant. */
function noeuds(tree: TestRenderer.ReactTestRenderer): number {
  let n = 0;
  const marche = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    const node = x as { rendered?: unknown; children?: unknown };
    n += 1;
    const enfants = node.rendered ?? node.children;
    if (Array.isArray(enfants)) for (const e of enfants) marche(e);
    else if (enfants) marche(enfants);
  };
  marche(tree.toTree());
  return n;
}

function planEquipe() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      showFurniture: true,
      showSurfaces: true,
      showOpeningColors: true,
    });
    tree = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable={false}
        selectedWallId={null}
        onSelectWall={() => {}}
      />,
    );
  });
  act(() => {
    // Large et zoomé : c'est le cas où tout se dessine — symboles compris.
    tree.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: 900, height: 620 } },
    });
  });
  arbre = tree;
  return tree;
}

/**
 * Un doigt posé sur le plan, tel que `PanResponder` l'attend.
 *
 * Il ne se contente pas de l'événement : il lit l'HISTORIQUE tactile de
 * React Native pour calculer son centre. Sans lui, le geste ne démarre
 * pas — et le banc mesurerait deux fois la même chose.
 */
const doigt = (x: number, y: number) => ({
  nativeEvent: { touches: [{ pageX: x, pageY: y }], locationX: x, locationY: y },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 100,
    touchBank: [
      {
        touchActive: true,
        startPageX: x,
        startPageY: y,
        startTimeStamp: 0,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: 100,
        previousPageX: x,
        previousPageY: y,
        previousTimeStamp: 0,
      },
    ],
  },
});

/** La zone du plan qui porte le geste de déplacement. */
const zoneDuPlan = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(View)
    .find((n) => typeof n.props.onMoveShouldSetResponder === 'function')!;

/**
 * Un doigt qui a PARCOURU du chemin depuis sa prise.
 *
 * `doigt()` pose le même point comme départ et comme position courante : le
 * `PanResponder` en déduit un déplacement nul, et le plan ne bouge pas d'un
 * pixel. Pour mesurer un glissement, il faut que les deux diffèrent.
 */
const doigtDepuis = (x0: number, y0: number, x: number, y: number) => {
  const e = doigt(x, y) as unknown as {
    touchHistory: { touchBank: Record<string, number>[] };
  };
  e.touchHistory.touchBank[0].startPageX = x0;
  e.touchHistory.touchBank[0].startPageY = y0;
  e.touchHistory.touchBank[0].previousPageX = x0;
  e.touchHistory.touchBank[0].previousPageY = y0;
  return e as never;
};

function glisser(tree: TestRenderer.ReactTestRenderer) {
  const zone = zoneDuPlan(tree);
  expect(zone).toBeDefined();
  act(() => {
    zone.props.onMoveShouldSetResponder?.(doigt(400, 300));
    zone.props.onResponderGrant?.(doigt(400, 300));
    // Le doigt AVANCE : sans mouvement, on ne mesure que la prise, et la
    // couche n'a encore rien à porter.
    zone.props.onResponderMove?.(doigtDepuis(400, 300, 460, 330));
  });
}

/**
 * LE PLAN NE RÉVEILLE PLUS TOUT L'ÉCRAN À CHAQUE IMAGE.
 *
 * Relevé du chantier : « au mouvement, le modèle 3D bug moins que le 2D ».
 * C'était vrai, et la cause n'était pas le dessin — mesuré, le plan 2D en
 * mouvement dessine QUATRE FOIS MOINS de nœuds que la vue 3D.
 *
 * Elle était dans la remontée d'état : le plan annonce sa position à
 * l'écran qui le porte, pour que la 3D reprenne exactement le même cadrage
 * quand on bascule. Cette annonce partait à chaque image du geste — donc
 * `ResultScreen` tout entier se rendait soixante fois par seconde, avec ses
 * bandeaux, sa rangée d'outils et ses sept feuilles. Le plan, lui, n'y était
 * pour rien.
 *
 * Or le parent n'a besoin de cette position qu'AU MOMENT DE BASCULER, c'est
 * à dire une fois le doigt levé. Elle ne part donc plus qu'à la fin du
 * geste.
 */
describe('ce que le plan annonce pendant le geste', () => {
  it('ne prévient l’écran qu’une fois le doigt levé', () => {
    const vues: { zoom: number }[] = [];
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({
          id: r.id,
          name: `Pièce ${i + 1}`,
          floor: null,
        })),
        fixtures: SNAPSHOT_FIXTURES,
        ceiling: [],
        photos: [],
      });
      tree = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          onView={(v) => vues.push(v)}
        />,
      );
    });
    arbre = tree;
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 390, height: 620 } },
          });
        }
      }
    });

    const zone = zoneDuPlan(tree);
    act(() => {
      zone.props.onMoveShouldSetResponder?.(doigt(200, 300));
      zone.props.onResponderGrant?.(doigt(200, 300));
    });
    vues.length = 0;

    // Dix images de glissement : c'est un geste court, et il en produirait
    // dix rendus de tout l'écran.
    for (let i = 1; i <= 10; i++) {
      act(() => {
        zone.props.onResponderMove?.({
          ...doigt(200 + i * 6, 300),
          nativeEvent: { touches: [{ pageX: 200 + i * 6, pageY: 300 }] },
        });
      });
    }
    expect(vues).toHaveLength(0);

    // Le doigt se lève : l'écran apprend alors où en est le plan, une fois.
    act(() => zone.props.onResponderRelease?.(doigt(260, 300)));
    expect(vues.length).toBeGreaterThanOrEqual(1);
  });
});

/*
  L'ALLÈGEMENT PENDANT LE GESTE A ÉTÉ RETIRÉ — et c'est un progrès, pas un
  renoncement.

  Le plan se dépouillait de ses cotes et de ses étiquettes dès qu'un doigt
  se posait : c'était la seule parade tant que CHAQUE IMAGE du geste
  recalculait le cadrage et redessinait tout. Moins de nœuds à recalculer,
  moins de retard.

  Depuis que le geste est une transformation native (voir plus bas), le plan
  ne se redessine plus DU TOUT pendant qu'on le déplace : il n'y a plus rien
  à alléger, et le faire coûterait deux rendus complets — un à la prise, un
  au lâcher — pour économiser un travail qui n'existe plus. Le dessin reste
  donc entier sous le doigt, ce qui est aussi plus juste : les cotes suivent
  le plan au lieu de clignoter.
*/
describe('le dessin reste entier sous le doigt', () => {
  it('ne retire plus ses cotes quand on prend le plan', () => {
    const tree = planEquipe();
    const repos = noeuds(tree);
    glisser(tree);
    expect(`${noeuds(tree)} nœuds pendant le geste, ${repos} au repos`).toBe(
      `${repos} nœuds pendant le geste, ${repos} au repos`,
    );
  });

  it('et n’a donc rien à retrouver quand le doigt se lève', () => {
    const tree = planEquipe();
    const repos = noeuds(tree);
    glisser(tree);
    act(() => {
      zoneDuPlan(tree).props.onResponderRelease?.(doigt(430, 320));
    });
    expect(noeuds(tree)).toBe(repos);
  });
});

/**
 * LE PLAN NE SE REDESSINE PLUS PENDANT QU'ON LE DÉPLACE.
 *
 * Relevé du patron : « plus les plans sont chargés en cotes et en meubles,
 * plus au déplacement il est lent ». La mesure lui donne raison, et dit où :
 * le calcul n'est plus en cause — trier et projeter la 3D d'un logement
 * meublé coûte trois dixièmes de milliseconde par image. Ce qui coûte, c'est
 * le NOMBRE DE NŒUDS : chaque trait, chaque cote, chaque symbole est une vue
 * que le moteur repeint. Trois cent quarante vues, soixante fois par
 * seconde, pendant que le doigt glisse.
 *
 * Or déplacer et agrandir un dessin déjà peint, c'est exactement ce qu'une
 * TRANSFORMATION NATIVE sait faire — la leçon du ruban, de l'onde du bouton
 * et du badge, appliquée cette fois au plan entier. Le dessin est calculé
 * UNE fois, à la prise ; le geste ne fait que translater, tourner et
 * agrandir la couche déjà rastérisée ; le vrai cadrage n'est posé qu'au
 * lâcher, en un seul rendu.
 *
 * Ce banc tient la propriété qui produit la fluidité : PENDANT le geste, les
 * coordonnées du dessin ne bougent pas d'un pixel, et c'est la transformation
 * de la couche qui porte le mouvement.
 */
describe('le plan glisse sans se redessiner', () => {
  /** La couche transformée : celle qui porte le geste, au-dessus du dessin. */
  const couche = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAll((n) => {
        const st = StyleSheet.flatten(n.props?.style) as
          | { transform?: unknown[] }
          | undefined;
        return (
          Array.isArray(st?.transform) &&
          // Elle porte le dessin : au moins un trait vit dessous.
          n.findAll((x) => typeof x.props?.x1 === 'number').length > 0
        );
      })
      .pop();

  /** Les coordonnées de tous les traits du dessin, en une empreinte. */
  const empreinte = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAll((n) => typeof n.props?.x1 === 'number')
      .map((n) => `${n.props.x1},${n.props.y1}`)
      .join('|');

  it('bouge la couche, pas les coordonnées', () => {
    const tree = planEquipe();
    const avant = empreinte(tree);
    expect(avant.length).toBeGreaterThan(0);

    glisser(tree);

    // LE DESSIN N'A PAS BOUGÉ : aucune coordonnée recalculée, donc aucun
    // rendu du plan — c'est là, et seulement là, que se gagne la fluidité
    // d'un plan chargé.
    expect(empreinte(tree)).toBe(avant);

    // ET POURTANT LE PLAN A SUIVI LE DOIGT : la couche porte le mouvement.
    const c = couche(tree);
    expect(c).toBeDefined();
    const st = StyleSheet.flatten(c!.props.style) as {
      transform: Record<string, unknown>[];
    };
    expect(st.transform.some((x) => 'translateX' in x)).toBe(true);
  });

  /*
    ET LA COUCHE REVIENT À PLAT AVEC LUI.

    Relevé du patron : « au relâcher sur une autre position, on voit son
    ancienne position rapidement avant celle qu'on lâche ». La remise à plat
    se faisait dans le gestionnaire du lâcher — donc SUR-LE-CHAMP, une valeur
    animée ne passe pas par React — pendant que le dessin attendait le rendu
    suivant. Il restait une image du plan à son ancienne place.

    Elle se fait maintenant à la mise en page, après le commit du nouveau
    cadrage : les deux ne peuvent plus se désynchroniser. Ce banc tient
    l'état d'arrivée — dessin déplacé ET couche neutre —, qui attrape aussi
    la faute inverse : une couche restée chargée compterait le déplacement
    deux fois au geste suivant.
  */
  it('rend la couche à plat une fois le cadrage posé', () => {
    const tree = planEquipe();
    glisser(tree);
    act(() => {
      zoneDuPlan(tree).props.onResponderRelease?.(
        doigtDepuis(400, 300, 460, 330),
      );
    });
    const c = tree.root
      .findAll((n) => {
        const st = StyleSheet.flatten(n.props?.style) as
          | { transform?: unknown[] }
          | undefined;
        return (
          Array.isArray(st?.transform) &&
          n.findAll((x) => typeof x.props?.x1 === 'number').length > 0
        );
      })
      .pop()!;
    const st = StyleSheet.flatten(c.props.style) as {
      transform: Record<string, unknown>[];
    };
    for (const t of st.transform) {
      for (const [k, v] of Object.entries(t)) {
        expect(`${k}=${v}`).toBe(
          k === 'scale' ? 'scale=1' : k === 'rotate' ? 'rotate=0deg' : `${k}=0`,
        );
      }
    }
  });

  /**
   * CE QUI SORT DU CADRE DOIT POUVOIR Y REVENIR.
   *
   * Relevé du patron : « si le plan sort du cadre et qu'on le ramène au
   * centre, il est coupé — sa partie cachée reste cachée ».
   *
   * La cause est le prix de la fluidité : le dessin est calculé UNE fois, à
   * la prise, dans une toile de la taille de l'écran. Ce qui débordait
   * alors n'a pas été peint ; le geste ne fait que déplacer cette toile, et
   * ramener le plan au centre fait entrer du VIDE — la partie manquante
   * n'existe pas, elle n'a jamais été dessinée.
   *
   * La toile s'agrandit donc le temps du geste : elle prend une marge tout
   * autour, assez large pour qu'un doigt ne puisse pas atteindre son bord.
   * Au repos elle reprend sa taille — pas question de rastériser en
   * permanence trois fois la surface de l'écran pour un geste qui dure une
   * seconde.
   */
  it('dessine au-delà du cadre pendant le geste, pour qu’il puisse y revenir', () => {
    const tree = planEquipe();
    /* La toile du plan : la plus grande des surfaces dessinées — les
       autres sont les pastilles et les symboles, larges de vingt points. */
    const toile = () =>
      tree.root
        .findAll((n) => typeof n.props?.bbWidth === 'number')
        .sort((a, b) => b.props.bbWidth - a.props.bbWidth)[0];
    const auRepos = toile().props.bbWidth;

    glisser(tree);
    const enGeste = toile().props.bbWidth;
    // Nettement plus large : de quoi ramener au centre ce qui était sorti.
    expect(enGeste).toBeGreaterThan(auRepos * 1.5);
    // Et la toile reste calée sur le dessin : c'est sa FENÊTRE qui s'ouvre,
    // pas le plan qui se décale. Sans ce recalage, tout le dessin
    // sauterait de la valeur de la marge à la prise du doigt.
    // `react-native-svg` éclate le `viewBox` en quatre props : c'est
    // `minX` qui porte le décalage du cadrage.
    expect(toile().props.minX).toBe(-(enGeste - auRepos) / 2);

    act(() => {
      zoneDuPlan(tree).props.onResponderRelease?.(
        doigtDepuis(400, 300, 460, 330),
      );
    });
    // Au repos, la toile reprend sa taille : neuf fois la surface d'écran
    // rastérisée en permanence pour un geste d'une seconde, c'est le
    // contraire d'une optimisation.
    expect(toile().props.bbWidth).toBe(auRepos);
  });

  it('pose le cadrage pour de bon quand le doigt se lève', () => {
    const tree = planEquipe();
    const avant = empreinte(tree);
    glisser(tree);
    act(() => {
      zoneDuPlan(tree).props.onResponderRelease?.(doigt(430, 320));
    });
    // Au lâcher, UN rendu : le dessin est recalculé à sa nouvelle place, et
    // la couche revient à zéro — sinon le déplacement se compterait deux
    // fois au geste suivant.
    expect(empreinte(tree)).not.toBe(avant);
  });
});

/**
 * LA COUCHE DOIT MONTRER EXACTEMENT CE QUE LE LÂCHER VA POSER.
 *
 * Relevé du patron : « si je zoome avec un pincement en le déplaçant, au
 * lâcher il se recale et on voit une apparition du plan quelques pixels à
 * côté de là où on lâche ».
 *
 * Quelques pixels, et une raison exacte. Le dessin est peint au cadrage de
 * la PRISE ; la couche le transforme ; le lâcher recalcule tout au cadrage
 * visé. Pour que rien ne saute, la transformation doit mener au pixel près
 * du premier au second — et le décalage `ox/oy` du cadrage de départ subit
 * lui aussi l'agrandissement de la couche, ce que le premier jet oubliait.
 *
 * D'où l'écart : il vaut `(1 − échelle) × décalage de départ`. Nul tant
 * qu'on n'a rien déplacé avant de zoomer — c'est pourquoi le glissement
 * simple, lui, se calait parfaitement — et de quelques pixels dès qu'on
 * zoome un plan déjà déplacé.
 *
 * Ce banc compare les DEUX CHEMINS pour un même point : celui de la couche
 * (dessin de la prise, puis transformation) et celui de la vérité (dessin
 * recalculé au cadrage visé). Ils doivent tomber au même endroit.
 */
describe('la transformation du geste mène pile au cadrage visé', () => {
  /** Où un point atterrit quand le plan est peint à ce cadrage. */
  const peint = (
    v: { zoom: number; ox: number; oy: number; rot: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ) => {
    const dx = (b.x - c.x) * v.zoom;
    const dy = (b.y - c.y) * v.zoom;
    return {
      x: c.x + dx * Math.cos(v.rot) - dy * Math.sin(v.rot) + v.ox,
      y: c.y + dx * Math.sin(v.rot) + dy * Math.cos(v.rot) + v.oy,
    };
  };

  /** Où la couche l'emmène : échelle et rotation autour du centre, puis
   *  translation — l'ordre exact d'un `transform` de React Native. */
  const parLaCouche = (
    p: { x: number; y: number },
    t: { tx: number; ty: number; ech: number; rot: number },
    c: { x: number; y: number },
  ) => {
    const dx = (p.x - c.x) * t.ech;
    const dy = (p.y - c.y) * t.ech;
    return {
      x: c.x + dx * Math.cos(t.rot) - dy * Math.sin(t.rot) + t.tx,
      y: c.y + dx * Math.sin(t.rot) + dy * Math.cos(t.rot) + t.ty,
    };
  };

  const centre = { x: 195, y: 310 };
  const points = [
    { x: 40, y: 90 },
    { x: 195, y: 310 },
    { x: 380, y: 560 },
  ];

  const verifier = (
    nom: string,
    v0: { zoom: number; ox: number; oy: number; rot: number },
    v1: { zoom: number; ox: number; oy: number; rot: number },
  ) => {
    const t = transformeDuGeste(v0, v1);
    for (const b of points) {
      const attendu = peint(v1, b, centre);
      const obtenu = parLaCouche(peint(v0, b, centre), t, centre);
      expect(`${nom} x=${obtenu.x.toFixed(3)}`).toBe(
        `${nom} x=${attendu.x.toFixed(3)}`,
      );
      expect(`${nom} y=${obtenu.y.toFixed(3)}`).toBe(
        `${nom} y=${attendu.y.toFixed(3)}`,
      );
    }
  };

  it('pour un simple glissement', () => {
    verifier(
      'glisse',
      { zoom: 1, ox: 0, oy: 0, rot: 0 },
      { zoom: 1, ox: 60, oy: -25, rot: 0 },
    );
  });

  it('pour un pincement sur un plan DÉJÀ déplacé — le défaut du chantier', () => {
    // C'est ce cas-là, et lui seul, qui décalait de quelques pixels : le
    // décalage de départ (80, −40) subit l'agrandissement de la couche.
    verifier(
      'pince',
      { zoom: 1, ox: 80, oy: -40, rot: 0 },
      { zoom: 1.7, ox: 130, oy: -10, rot: 0 },
    );
  });

  it('pour un pincement qui vrille, plan déjà tourné', () => {
    verifier(
      'vrille',
      { zoom: 1.3, ox: 45, oy: 70, rot: 0.4 },
      { zoom: 2.1, ox: 20, oy: 95, rot: 0.9 },
    );
  });

  it('et ne bouge rien quand le cadrage n’a pas changé', () => {
    const t = transformeDuGeste(
      { zoom: 1.4, ox: 30, oy: 12, rot: 0.2 },
      { zoom: 1.4, ox: 30, oy: 12, rot: 0.2 },
    );
    expect(
      `${t.tx.toFixed(6)} ${t.ty.toFixed(6)} ${t.ech} ${t.rot}`,
    ).toBe('0.000000 0.000000 1 0');
  });
});

