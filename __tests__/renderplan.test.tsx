/**
 * Garde-fou visuel du PLAN 2D.
 *
 * La vue 3D avait le sien depuis longtemps ; le plan, non. C'est pourtant
 * lui qui porte le plus de calques — murs, ouvertures, meubles, appareillage,
 * gaines, plafond, cotes — et donc le plus d'occasions qu'un déplacement de
 * code change une position sans que personne ne le voie.
 *
 * Il ne compare pas des pixels mais l'ARBRE RENDU : chaque élément avec ses
 * coordonnées, ses couleurs et son ordre. C'est plus strict qu'une image —
 * un pan déplacé d'un dixième de point fait échouer — et c'est exactement ce
 * qu'il faut pour découper le composant sans rien changer au dessin.
 *
 * Quand le changement est voulu : `npm run snapshots`.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import type { CeilingFixture } from '../src/geometry/ceiling';
import type { Pt } from '../src/geometry/floorplan';

const dir = join(__dirname, '..', 'assets', 'rendu-reference');

/** Deux points de plafond, dont un commandé : le calque doit figurer. */
const PLAFOND: CeilingFixture[] = [
  {
    id: 'pl1',
    kind: 'dcl',
    roomId: SNAPSHOT_ROOMS[0].id,
    at: { x: 1.6, z: 1.4 },
    commands: [SNAPSHOT_FIXTURES[1]?.id ?? SNAPSHOT_FIXTURES[0].id],
  },
  { id: 'pl2', kind: 'daaf', roomId: SNAPSHOT_ROOMS[0].id, at: { x: 2.6, z: 0.8 } },
];

/**
 * Monte l'éditeur et lui donne une taille : sans `onLayout`, il ne dessine
 * rien du tout — il ne connaît pas encore son échelle.
 */
/**
 * Le même appartement, TOURNÉ de douze degrés.
 *
 * L'appartement de référence est d'équerre avec le repère du scan, ce qui
 * cache une famille entière de défauts : tout ce qui se calcule sur les axes
 * du monde y donne le même résultat que sur ceux du logement. Or ARKit
 * oriente son repère selon l'endroit où le relevé a commencé — un scan de
 * biais est le cas NORMAL, pas l'exception. La planche du plafond se fait
 * donc sur un plan tourné : c'est elle qui vérifie que les cotes de
 * dégagement partent bien perpendiculairement aux murs.
 */
const A = (12 * Math.PI) / 180;
const tourner = <T extends { a: Pt; b: Pt }>(w: T): T => ({
  ...w,
  a: {
    x: w.a.x * Math.cos(A) - w.a.z * Math.sin(A),
    z: w.a.x * Math.sin(A) + w.a.z * Math.cos(A),
  },
  b: {
    x: w.b.x * Math.cos(A) - w.b.z * Math.sin(A),
    z: w.b.x * Math.sin(A) + w.b.z * Math.cos(A),
  },
});

function rendu(editable: boolean, regle?: string, biais = false) {
  const murs = biais ? SNAPSHOT_WALLS.map(tourner) : SNAPSHOT_WALLS;
  const baies = biais ? SNAPSHOT_OPENINGS.map(tourner) : SNAPSHOT_OPENINGS;
  useScanStore.setState({
    walls: murs,
    openings: baies,
    objects: SNAPSHOT_OBJECTS,
    rooms: SNAPSHOT_ROOMS.map((r, i) => ({
      id: r.id,
      name: `Pièce ${i + 1}`,
      floor: null,
    })),
    fixtures: SNAPSHOT_FIXTURES,
    ceiling: PLAFOND,
    photos: [],
    showFurniture: true,
    showSurfaces: true,
    showOpeningColors: true,
  });
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable={editable}
        selectedWallId={null}
        onSelectWall={() => {}}
        ceiling={PLAFOND}
        showCeiling
        selectedCeilingId={regle ?? null}
      />,
    );
  });
  act(() => {
    const conteneur = tree.root.findAllByType(View)[0];
    /**
     * Une planche LARGE, et c'est indispensable.
     *
     * À 360 px pour sept mètres, l'échelle tombe à 45 px/m : sous ce zoom,
     * l'appareillage n'est plus qu'un point de couleur, et les symboles ne
     * sont pas dessinés du tout. La référence ne couvrait donc aucun d'eux
     * — on a pu les redessiner sans qu'elle bronche. Il faut passer le
     * seuil de détail pour qu'ils entrent dans la planche.
     */
    conteneur.props.onLayout?.({
      nativeEvent: { layout: { width: 900, height: 620 } },
    });
  });
  return tree;
}

/** L'arbre, mis à plat et stable : les fonctions ne se comparent pas. */
const serialise = (tree: TestRenderer.ReactTestRenderer) =>
  JSON.stringify(
    tree.toJSON(),
    (cle, valeur) => {
      if (typeof valeur === 'function') return '[fn]';
      // Les nombres flottants du rendu : trois décimales suffisent, et
      // au-delà on comparerait du bruit de calcul.
      if (typeof valeur === 'number') return Math.round(valeur * 1000) / 1000;
      return cle === '_owner' || cle === '_store' ? undefined : valeur;
    },
    1,
  );

describe('planche de rendu du plan 2D', () => {
  for (const [nom, editable, regle] of [
    ['plan-lecture', false, undefined],
    ['plan-edition', true, undefined],
    // Un appareil de plafond en réglage : c'est la seule planche qui porte
    // ses cotes de dégagement, et donc la seule qui vérifie qu'elles
    // partent bien d'équerre avec les murs.
    ['plan-plafond', true, 'pl1'],
  ] as const) {
    it(`${nom} n'a pas changé`, () => {
      // La planche du plafond se fait de biais : voir plus haut.
      const actual = serialise(rendu(editable, regle, nom === 'plan-plafond'));
      if (process.env.UPDATE_SNAPSHOTS) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${nom}.json`), actual, 'utf8');
        return;
      }
      const expected = readFileSync(join(dir, `${nom}.json`), 'utf8');
      if (actual !== expected) {
        throw new Error(
          `Le rendu « ${nom} » a changé.\n` +
            'Si le changement est voulu, lancez `npm run snapshots` et ' +
            'relisez le diff avant de valider.',
        );
      }
    });
  }
});


/**
 * LE PLAN PREND L'ALLURE D'UN PLAN.
 *
 * Relevé du chantier, capture d'un concurrent à l'appui : « son plan 2D me
 * plaît, il est très compréhensible ». Trois choses l'en séparaient, et
 * aucune n'est une question de moteur — ce sont des conventions de dessin.
 */
describe('les conventions du dessin de plan', () => {
  /** Tous les nœuds SVG d'un type donné, avec leurs props. */
  const tous = (tree: TestRenderer.ReactTestRenderer, type: string) =>
    tree.root.findAll((n) => (n.type as { displayName?: string })?.displayName === type ||
      String((n.type as { name?: string })?.name) === type);

  it('poche la coupe des murs en noir, jamais en rouge', () => {
    const tree = rendu(false);
    const murs = tous(tree, 'Polygon').filter(
      (n) => typeof n.props.fill === 'string' && n.props.stroke === 'none',
    );
    expect(murs.length).toBeGreaterThan(0);
    // Un constat de conformité ne repeint plus la maçonnerie : le bordeaux
    // d'alerte a quitté le plan, il se dit sur le cartouche de la pièce.
    for (const m of murs) expect(m.props.fill).not.toBe('#8E1B1B');
  });

  /**
   * LE CARTOUCHE LAISSE VOIR, SANS SE FAIRE TRAVERSER.
   *
   * Il a été translucide à 55 % (les meubles le traversaient), puis
   * OPAQUE. Le patron a retranché : depuis que le cartouche ESQUIVE les
   * meubles ET les appareils du plafond, la transparence ne coûte plus la
   * lisibilité — un fond à 85 % couvre ce qu'il annote et laisse deviner
   * ce qui passe dessous. Ni vitre, ni dalle.
   */
  it('donne au cartouche un fond translucide mais couvrant', () => {
    const tree = rendu(false);
    const cartouches = tous(tree, 'Rect').filter((n) => n.props.rx === 5);
    expect(cartouches.length).toBeGreaterThan(0);
    for (const r of cartouches) {
      const op = Number(r.props.fillOpacity ?? 1);
      /*
        Il a été opaque, puis à 85 %, et il descend à 70 — relevé du
        patron : « le bloc qui affiche la surface avec le nom de pièce est
        trop gros et devrait avoir une opacité du fond ». Il vit au milieu
        du sol, là où l'on pose les meubles : ce qui passe dessous doit se
        deviner. En dessous de 60, en revanche, le nom ne se lirait plus
        sur un sol teinté — ce n'est pas une vitre.
      */
      expect(op).toBeGreaterThanOrEqual(0.6);
      expect(op).toBeLessThanOrEqual(0.8);
    }
  });

  /*
    « SURFACES » COMMANDE LE CARTOUCHE ENTIER — nom compris.

    Ce banc a tenu l'inverse, et pour une bonne raison d'alors : la surface
    dépendait du calque, qui allume aussi le semis coloré des sols. On
    voulait donc la surface, et l'on obtenait un plan barbouillé ; ou un
    plan propre, et pas de surface. On l'avait détachée.

    Relevé du patron : « fais en sorte que Surfaces affiche et cache le nom
    des pièces aussi ». Le calque redevient donc ce que son nom dit — tout
    ce qui parle de la SURFACE d'une pièce, son nom compris, puisque nom et
    surface vivent dans le même cartouche et qu'on ne coupe pas un cartouche
    en deux. Qui veut un plan nu l'a d'un geste ; qui veut les pièces
    nommées les rallume du même.

    EN ÉDITION, LE CARTOUCHE RESTE quoi qu'il arrive : c'est par lui qu'on
    nomme une pièce, et un réglage d'affichage ne doit pas retirer un outil
    de travail.
  */
  /*
    DEUX VERSIONS, ET L'ÉDITION A CESSÉ D'ÊTRE UNE EXCEPTION.

    Première : « cache le cartouche avec le calque des surfaces, SAUF en
    édition ». L'argument se défendait — c'est par le cartouche qu'on nomme
    une pièce, et un réglage d'affichage ne doit pas retirer un outil de
    travail.

    Seconde, relevé du patron : « lors du mode édition, le plan affiche le nom
    de la pièce, il ne faut pas tant que la surface n'est pas affichée. »
    L'argument se retourne : un calque qu'on éteint et qui reste allumé dans
    un mode, c'est un interrupteur qui ne commande pas ce qu'il annonce — et
    l'on entre en édition pour POSER, moment où le nom d'une pièce vient se
    mettre entre le doigt et ce qu'on pose.

    Le détail du nouveau comportement, et ce qu'il coûte au nommage, vivent
    dans `cartoucheniveau.test.tsx`. Ce qui reste ici, c'est la convention de
    dessin : le calque commande, sans exception.
  */
  it('cache le cartouche avec le calque des surfaces, sans exception', () => {
    const mots = (t: ReturnType<typeof rendu>) =>
      t.root
        .findAll((n) => (n.type as { displayName?: string })?.displayName === 'Text')
        .map((n) => String(n.props.children));

    // `rendu()` rallume le calque à chaque montage : on l'éteint APRÈS,
    // sur l'arbre déjà monté, et le composant se redessine.
    const lecture = rendu(false);
    expect(mots(lecture).some((t) => t.includes('m²'))).toBe(true);
    act(() => {
      useScanStore.setState({ showSurfaces: false });
    });
    expect(mots(lecture).some((t) => t.includes('m²'))).toBe(false);

    // EN ÉDITION AUSSI : c'était l'exception, elle n'en est plus une.
    const edition = rendu(true);
    expect(mots(edition).some((t) => t.includes('m²'))).toBe(true);
    act(() => {
      useScanStore.setState({ showSurfaces: false });
    });
    expect(mots(edition).some((t) => t.includes('m²'))).toBe(false);
    act(() => {
      useScanStore.setState({ showSurfaces: true });
    });
  });

  /*
    LA TROUÉE D'UN OUVRANT NE DÉBORDE PAS DU MUR.

    Elle était dessinée à seize centimètres d'épaisseur pour un mur qui en
    fait dix : elle dépassait donc de trois centimètres de chaque côté, et
    ce débord — rempli d'une couleur pleine pour effacer le poché — formait
    un liseré clair tout autour de chaque porte et de chaque fenêtre. Sur un
    plan, ça se lit comme un fond blanc collé à la menuiserie.

    Elle a besoin d'un cheveu de plus que le mur, pas d'un centimètre : sans
    ce cheveu, l'anticrénelage laisse un trait de poché résiduel en travers
    de la baie.
  */
  it('perce le mur sans déborder autour', () => {
    const tree = rendu(false);
    /** L'épaisseur d'un quadrilatère, mesurée sur son petit côté. */
    const epaisseur = (pts: string) => {
      const p2 = pts.trim().split(/\s+/).map((c) => c.split(',').map(Number));
      if (p2.length !== 4) return NaN;
      const cote = (i2: number, j2: number) =>
        Math.hypot(p2[i2][0] - p2[j2][0], p2[i2][1] - p2[j2][1]);
      return Math.min(cote(0, 1), cote(1, 2));
    };
    /** Sombre = le poché d'un mur ; clair = ce qui l'efface. */
    const sombre = (hex: string) => {
      const n = parseInt(String(hex).replace('#', ''), 16);
      return Number.isNaN(n) ? false : ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) < 300;
    };
    const quads = tous(tree, 'Polygon')
      .filter((n) => n.props.stroke === 'none' && typeof n.props.points === 'string')
      .map((n) => ({
        e: epaisseur(String(n.props.points)),
        mur: sombre(String(n.props.fill)),
      }))
      .filter((q) => !Number.isNaN(q.e) && q.e > 0);
    const murs = quads.filter((q) => q.mur).map((q) => q.e);
    const trouees = quads.filter((q) => !q.mur).map((q) => q.e);
    expect(murs.length).toBeGreaterThan(0);
    expect(trouees.length).toBeGreaterThan(0);
    // La trouée fait l'épaisseur du mur, à un cheveu près — pas 60 % de
    // plus, ce qui lui faisait déborder un liseré clair de chaque côté.
    const mur = Math.min(...murs);
    for (const t of trouees) expect(t).toBeLessThan(mur * 1.1);
  });

  it('dessine le vantail des portes et son quart de cercle', () => {
    const tree = rendu(false);
    const arcs = tous(tree, 'Path')
      .map((n) => String(n.props.d ?? ''))
      .filter((d) => d.includes('A '));
    // Une porte au moins, et son arc décrit un rayon égal à sa largeur —
    // c'est ce qui fait un débattement juste, et non un compas au hasard.
    expect(arcs.length).toBeGreaterThan(0);
    for (const d of arcs) {
      const m = d.match(/A (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/);
      expect(m).toBeTruthy();
      expect(Number(m![1])).toBeCloseTo(Number(m![2]), 6);
      expect(Number(m![1])).toBeGreaterThan(5);
    }
  });
});
