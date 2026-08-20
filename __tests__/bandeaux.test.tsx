/**
 * LES BANDEAUX DE RÉGLAGE — le banc d'essai qui manquait.
 *
 * Sous le plan, cinq bandeaux se relaient : les cotes d'un meuble, la place
 * d'un appareil de plafond, le nom d'une pièce, la largeur d'une menuiserie,
 * la longueur d'un mur. Ce sont eux qu'on retouche à chaque demande
 * d'ergonomie — et rien ne les couvrait : les planches de rendu ne
 * surveillent que le plan et le modèle 3D.
 *
 * Ce fichier monte l'écran des résultats avec un vrai scan et vérifie ce qui
 * compte : le bon bandeau paraît au bon moment, il porte les bonnes valeurs,
 * et il n'y en a jamais deux à la fois — ils occupent la même place au bas
 * de l'écran.
 *
 * Il a aussi servi à DÉCOUPER cet écran sans rien casser : déplacer du code
 * qu'aucun test ne regarde, c'est échanger une dette contre un risque. Les
 * sept feuilles modales et les deux rangées d'outils, parties dans
 * `src/screens/result/`, ont donc chacune leur épreuve plus bas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PILL_CELL_H } from '../src/components/ToolPill';
import { WALL_MENU } from '../src/components/FloorplanEditor';
import { estUnRetour, RetourGlisse } from '../src/components/RetourGlisse';
import { light } from '../src/theme';
import { SOLAIRES } from '../src/ui/solaires';
import { cartoucheHeurte } from '../src/components/FloorplanEditor';
import { Circle, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { ClientTour } from '../src/components/ClientTour';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { FIXTURE_FAMILIES } from '../src/geometry/electrical';
import { CEILINGS, CEILING_KINDS } from '../src/geometry/ceiling';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

import { castToWall, planFrameAngle, segLength } from '../src/geometry/floorplan';

import type { CeilingFixture } from '../src/geometry/ceiling';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Un point lumineux dans la première pièce : de quoi ouvrir son bandeau. */
const PLAFOND: CeilingFixture[] = [
  {
    id: 'pl1',
    kind: 'dcl',
    roomId: SNAPSHOT_ROOMS[0].id,
    at: { x: 1.6, z: 1.4 },
  },
];

/** Et une LIGNE de trois spots, posée d'un geste, dans la même pièce. */
const LIGNE: CeilingFixture[] = [0, 1, 2].map((i) => ({
  id: `sp${i}`,
  kind: 'spot' as const,
  roomId: SNAPSHOT_ROOMS[0].id,
  at: { x: 1.2 + i * 0.7, z: 2.4 },
  row: 'ln-test',
  axe: 'longueur' as const,
}));

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'result',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [...PLAFOND, ...LIGNE],
      photos: [],
      showFurniture: true,
      showSurfaces: true,
      north: 0,
    });
    tree = TestRenderer.create(<ResultScreen />);
  });
  // Le plan a besoin de sa taille pour dessiner quoi que ce soit.
  act(() => {
    for (const n of tree.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({
          nativeEvent: { layout: { width: 390, height: 520 } },
        });
      }
    }
  });
  arbre = tree;
  return tree;
}

/**
 * Tous les textes visibles, plans compris.
 *
 * Un libellé comme « Hauteur 2,50 m » arrive en TROIS morceaux — le mot,
 * la valeur interpolée, l'unité. Ne garder que les enfants déjà chaînes
 * reviendrait à ne jamais voir ces libellés-là, et à croire un bandeau
 * vide alors qu'il est plein.
 */
const textes = (tree: TestRenderer.ReactTestRenderer) =>
  [...tree.root.findAllByType(Text), ...tree.root.findAllByType(SvgText)]
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((t) => t.length > 0)
    .join(' | ');

/** Le bouton portant cette étiquette d'accessibilité. */
const bouton = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);

describe('l’écran des résultats', () => {
  it('s’ouvre sur le plan, sans aucun bandeau de réglage', () => {
    const vu = textes(monter());
    expect(vu).toContain('Chantier test');
    // Aucun réglage tant que rien n'est sélectionné.
    expect(vu).not.toContain('Longueur du mur');
    expect(vu).not.toContain('Renommer');
  });

  /**
   * LA BOUSSOLE SE DEMANDE, ELLE NE S'IMPOSE PAS.
   *
   * On ouvre un plan pour lire des cotes. Les quatre lettres au bord du
   * cadre servent à désigner un mur — un besoin ponctuel, pas permanent —
   * et elles occupent justement la place où tombent les cotes de rive. Le
   * calque part donc éteint, et le bouton le rallume en un appui.
   */
  it('s’ouvre SANS les points cardinaux, et le bouton les rallume', () => {
    const tree = monter();
    const lettres = () =>
      tree.root
        .findAllByType(SvgText)
        .map((n) => n.props.children)
        .filter((c) => c === 'N' || c === 'E' || c === 'S' || c === 'O');
    expect(lettres()).toHaveLength(0);
    const b = bouton(tree, 'Nord');
    expect(b).toBeDefined();
    act(() => b?.props.onPress());
    // Quatre lettres par vue affichée : la couronne est bien là.
    expect(lettres().length).toBeGreaterThanOrEqual(4);
    act(() => b?.props.onPress());
    expect(lettres()).toHaveLength(0);
  });

  it('porte ses calques et son bouton d’édition', () => {
    const tree = monter();
    expect(bouton(tree, 'Édition')).toBeDefined();
    expect(bouton(tree, 'Meubles')).toBeDefined();
    expect(bouton(tree, 'Surfaces')).toBeDefined();
    // Le plafond est équipé : son calque doit être proposé.
    expect(bouton(tree, 'Plafond')).toBeDefined();
    /*
      LA BOUSSOLE DU CALQUE « NORD » PÈSE COMME LES AUTRES — relevé du
      patron : à côté des silhouettes Solar, son trait de 2 faisait
      maigrelet. Légèrement plus grasse : 2,6.
    */
    const nord = bouton(tree, 'Nord');
    expect(nord).toBeDefined();
    const grasses = nord!.findAll(
      (n) => Number(n.props?.strokeWidth) >= 2.5,
    );
    expect(grasses.length).toBeGreaterThan(0);
    // Et elle est GRANDE dans sa pastille — relevé du patron : à 22
    // points, elle restait timide à côté des silhouettes.
    const larges = nord!.findAll((n) => Number(n.props?.width) >= 25);
    expect(larges.length).toBeGreaterThan(0);
    // Le losange de l'aiguille est PLEIN — relevé du patron : un contour
    // vide flottait au milieu des silhouettes Solar.
    const aiguille = nord!.findAll(
      (n) =>
        typeof n.props?.points === 'string' &&
        n.props?.fill &&
        n.props.fill !== 'none',
    );
    expect(aiguille.length).toBeGreaterThan(0);
  });

  it('le cartouche esquive les spots et laisse voir au travers', () => {
    // Le prédicat : un spot sous le nom gêne ; à un mètre, non.
    expect(
      cartoucheHeurte({ x: 2, z: 2 }, 0.5, 0.2, [
        { x: 2.1, z: 2.05, rx: 0.3, rz: 0.3 },
      ]),
    ).toBe(true);
    expect(
      cartoucheHeurte({ x: 2, z: 2 }, 0.5, 0.2, [
        { x: 3.4, z: 2, rx: 0.3, rz: 0.3 },
      ]),
    ).toBe(false);
    // Et le fond du cartouche déclare son opacité — relevé du patron.
    const tree = monter();
    const cartouches = tree.root
      .findAllByType(Rect)
      .filter((n) => n.props.rx === 5 && Number(n.props.fillOpacity) <= 0.9);
    expect(cartouches.length).toBeGreaterThan(0);
  });

  it('ne pose plus de pastille de conformité sur le nom de la pièce', () => {
    // Relevé du patron : le point ambre au coin du cartouche est parti —
    // les constats vivent dans le dossier, pas sur le nom de la pièce.
    const tree = monter();
    const pastilles = tree.root
      .findAllByType(Circle)
      .filter((n) => n.props.fill === light.amber);
    expect(pastilles).toHaveLength(0);
  });

  /*
   * TOUCHER LE SOL LÂCHE LE MEUBLE TENU — relevé du patron : « ça ne
   * fonctionne pas pour désélectionner le meuble ». La surface captait
   * l'appui et choisissait la PIÈCE par-dessus le meuble encore tenu. Un
   * geste, un effet : le premier appui au sol lâche le meuble, le suivant
   * prend la pièce.
   */
  it('toucher le sol lâche le meuble tenu, sans prendre la pièce', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const meuble = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.rx === 3).length > 0);
    act(() => meuble!.props.onPress());
    expect(bouton(tree, 'Cotes du meuble')).toBeDefined();
    const sol = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find(
        (n) =>
          n.findAll((x) => x.props?.fill === 'url(#floorDots)').length > 0,
      );
    act(() => sol!.props.onPress());
    // Le meuble est lâché…
    expect(bouton(tree, 'Cotes du meuble')).toBeUndefined();
    // …et la pièce n'est PAS prise à sa place.
    expect(textes(tree)).not.toContain('Nommer');
  });

  /**
   * LE BANDEAU DU PLAFOND.
   *
   * Il s'ouvre en touchant l'appareil sur le plan, et porte ses distances
   * aux murs — les mêmes que les pointillés du dessin, en centimètres.
   */
  /**
   * UNE LIGNE SE PREND ENTIÈRE, PUIS SPOT PAR SPOT.
   *
   * Toucher un spot d'une ligne de quatre pour n'en attraper qu'un seul,
   * c'était condamner l'utilisateur à quatre réglages là où il voulait
   * retourner la ligne. Le premier appui la prend donc tout entière — le
   * bandeau annonce le nombre de spots et propose les deux axes — et un
   * second appui sur le même spot l'en détache pour le réglage fin.
   */
  it('prend la LIGNE au premier appui, le spot au second', () => {
    const tree = monter();
    // Un SPOT, reconnu à son symbole : le disque cerné de quatre rayons.
    // Chercher « un groupe touchable » ne suffit pas — l'appareillage mural
    // en pose aussi, et le banc attrapait une prise TV.
    const RAYON = 'M-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0';
    const spots = () =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .filter((n) =>
          n.findAllByType(Path).some((p) => p.props.d === RAYON),
        );
    const spot = spots()[0];
    expect(spot).toBeDefined();
    act(() => spot.props.onPress());
    let vu = textes(tree);
    expect(vu).toContain('3 spots');
    expect(vu).toContain('sur la longueur');
    expect(bouton(tree, 'Largeur')).toBeDefined();
    expect(bouton(tree, 'Longueur')).toBeDefined();
    /*
      LES GESTES DE LA LIGNE SONT DES ICÔNES — relevé du patron : le
      bandeau débordait sous la colonne d'ancrage. Les flèches Solar
      disent l'axe, la croix retire ; les mots vivent dans l'étiquette
      d'accessibilité, pas dans la largeur du bandeau.
    */
    expect(
      bouton(tree, 'Longueur')!
        .findAllByType(Path)
        .some((p) => p.props.d === SOLAIRES.longueur),
    ).toBe(true);
    expect(bouton(tree, 'Longueur')!.findAllByType(Text)).toHaveLength(0);
    expect(
      bouton(tree, 'Largeur')!
        .findAllByType(Path)
        .some((p) => p.props.d === SOLAIRES.largeur),
    ).toBe(true);
    expect(
      bouton(tree, 'Retirer')!
        .findAllByType(Path)
        .some((p) => p.props.d === SOLAIRES.retirer),
    ).toBe(true);

    // Retourner la ligne : le bandeau le dit aussitôt.
    act(() => bouton(tree, 'Largeur')?.props.onPress());
    expect(textes(tree)).toContain('sur la largeur');

    // Second appui sur le même spot : il sort de sa ligne.
    const encore = spots()[0];
    act(() => encore.props.onPress());
    vu = textes(tree);
    expect(vu).not.toContain('3 spots');
    // Le bandeau d'un appareil seul parle de sa place, en centimètres.
    expect(bouton(tree, 'Retirer')).toBeDefined();
  });

  /*
   * LA LIGNE DE SPOTS SE RELIE À UNE COMMANDE — relevé du patron :
   * « comme un autre point d'éclairage ». Un point seul avait son bouton
   * de liaison ; la ligne, rien — il fallait relier spot par spot.
   */
  it('la ligne de spots se relie à une commande d’un geste', () => {
    const tree = monter();
    const RAYON = 'M-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0';
    const spot = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .filter((n) => n.findAllByType(Path).some((p) => p.props.d === RAYON))[0];
    act(() => spot.props.onPress());
    expect(bouton(tree, 'Relier')).toBeDefined();
    act(() => bouton(tree, 'Relier')!.props.onPress());
    // Toucher une COMMANDE du plan clôt la liaison, pour TOUTE la ligne.
    const editeur = tree.root.findByType(FloorplanEditor);
    const inter = useScanStore
      .getState()
      .fixtures.find((f) => f.kind === 'inter')!;
    act(() => editeur.props.onSelectFixture(inter.id, inter.wallId));
    const spots = useScanStore
      .getState()
      .ceiling.filter((s) => s.kind === 'spot');
    expect(spots.length).toBeGreaterThan(1);
    for (const s of spots) {
      expect(s.commands ?? []).toContain(inter.id);
    }
  });

  it('ouvre le bandeau du plafond quand on touche l’appareil', () => {
    const tree = monter();
    // Le calque de plafond enveloppe chaque appareil dans un groupe
    // touchable : c'est lui qui porte le geste, pas le disque.
    const groupe = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) =>
        n
          .findAllByType(Circle)
          .some((cercle) => cercle.props.fill === 'transparent'),
      );
    expect(groupe).toBeDefined();
    act(() => groupe!.props.onPress());
    const vu = textes(tree);

    /**
     * LES VALEURS SONT CELLES DU PLAN, pas des nombres décoratifs.
     *
     * Le bandeau a déjà menti une fois : il comptait depuis le coin de
     * l'emprise de la pièce quand les pointillés du dessin, eux,
     * mesuraient jusqu'aux MURS. Deux quantités différentes affichées
     * côte à côte. On recalcule donc ici ce que la géométrie doit rendre,
     * et on l'exige à l'écran.
     */
    const trame = planFrameAngle(SNAPSHOT_WALLS);
    const cos = Math.cos(trame);
    const sin = Math.sin(trame);
    for (const axe of [
      { x: -cos, z: -sin },
      { x: sin, z: -cos },
    ]) {
      const d = castToWall(PLAFOND[0].at, axe, SNAPSHOT_WALLS);
      expect(d).not.toBeNull();
      expect(vu).toContain(String(Math.round(d! * 100)));
    }
    // Et de quoi agir sans quitter le bandeau.
    expect(bouton(tree, 'Relier à une commande')).toBeDefined();
  });

  /*
   * LE RETOUR AU GLISSEMENT — relevé du patron : « comme sur les apps
   * modernes, ou même Safari ». Une bande de vingt points au bord gauche
   * rend le même retour que la flèche, sur tous les écrans qui en portent
   * une. Le seuil est FRANC : soixante points vers la droite, plus
   * horizontal que vertical — un défilement ne déclenche rien.
   */
  it('rend le retour au bord gauche, comme Safari', () => {
    const tree = monter();
    const bord = tree.root.findAllByType(RetourGlisse)[0];
    expect(bord).toBeDefined();
    act(() => bord.props.onRetour());
    expect(useScanStore.getState().screen).toBe('home');
    // Les seuils du geste, comptés :
    expect(estUnRetour(80, 10)).toBe(true);
    expect(estUnRetour(40, 0)).toBe(false);
    expect(estUnRetour(80, -90)).toBe(false);
    expect(estUnRetour(-80, 0)).toBe(false);
  });

  /**
   * LE BANDEAU DU MUR.
   *
   * Il ne paraît qu'en édition — hors édition, toucher un mur ne fait
   * rien, c'est ce qui permet de lire un plan sans le modifier par
   * mégarde — et porte la longueur du mur choisi.
   */
  it('n’ouvre le bandeau du mur qu’en édition', () => {
    const tree = monter();
    /**
     * Le corps d'un mur : il porte une zone de toucher élargie — un trait
     * transparent de trente points — que rien d'autre ne dessine.
     */
    const murTouchable = () =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .find(
          (n) => n.findAll((x) => x.props?.strokeWidth === 30).length > 0,
        );

    // Hors édition : rien à toucher.
    expect(murTouchable()).toBeUndefined();

    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const cible = murTouchable();
    expect(cible).toBeDefined();
    act(() => cible!.props.onPress());

    // Le menu du mur paraît : ses quatre gestes, dont l'établi électrique.
    const vu = textes(tree);
    expect(vu).toContain('Élec');
    expect(vu).toContain('Supprimer');
    /*
      UN SEUL GESTE POUR LES COTES : « MESURES », AVEC SON CRAYON.

      « Coter » était du jargon de dessinateur — relevé du patron : « tout
      le monde ne comprend pas facilement » — et « Hauteur » un second
      bouton pour une retouche rare. Le bandeau n'offre plus qu'un mot que
      tout le monde lit, et le crayon dit « ça s'édite ». La hauteur d'un
      mur reste réglable ailleurs : par la pièce (barre du sol), et par le
      retour d'un mur percé.
    */
    expect(vu).toContain('sous plafond');
    expect(vu).toContain('Mesures');
    expect(vu).not.toContain('Coter');
    expect(vu).not.toContain('Hauteur');
    // Le crayon est un TRACÉ, pas un caractère — la leçon du chevron.
    const mesures = bouton(tree, 'Mesures');
    expect(
      mesures!.findAll((x) => typeof x.props?.d === 'string').length,
    ).toBeGreaterThan(0);
  });

  /**
   * « MESURES » SAISIT LA LONGUEUR, ET L'APPLIQUE AU MUR TOUCHÉ.
   *
   * Le bouton pourrait ouvrir la bonne fenêtre et régler le mauvais mur —
   * c'est exactement le genre de défaut qu'une relecture ne voit pas. On va
   * donc jusqu'au bout : on répond, et on regarde le magasin. On ne compte
   * pas les murs qui changent : allonger un mur DÉPLACE son extrémité, et
   * les murs soudés suivent — c'est la règle du coin tiré à la main.
   */
  it('applique la longueur saisie au mur choisi', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const cible = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.strokeWidth === 30).length > 0);
    act(() => cible!.props.onPress());
    const longueurs = () =>
      useScanStore.getState().walls.map((w) => segLength(w));
    expect(longueurs().some((L) => Math.abs(L - 3.33) < 0.005)).toBe(false);
    act(() => bouton(tree, 'Mesures')!.props.onPress());
    const champ = tree.root.findAllByType(TextInput)[0];
    expect(champ).toBeDefined();
    act(() => champ.props.onChangeText('3,33'));
    // Le bouton de validation est un `Pressable`, que `findAllByType` ne
    // retrouve pas dans cette version de React Native : on le cherche par
    // ce qu'il porte.
    const valider = tree.root
      .findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          n.findAllByType(Text).some((t) => String(t.props.children) === 'Valider'),
      )
      .pop();
    act(() => valider!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(longueurs().some((L) => Math.abs(L - 3.33) < 0.005)).toBe(true);
  });

  /**
   * LA POIGNÉE DE ROTATION NE SE POSE JAMAIS SUR LE MENU DU MUR.
   *
   * Relevé du patron, capture à l'appui : le rond bleu de rotation
   * chevauchait la barre des quatre gestes. Les deux se posaient
   * perpendiculairement au milieu du mur — le menu du côté de la pièce, la
   * poignée d'un côté FIXE : dès que ces deux côtés coïncidaient, quatorze
   * points les séparaient et ils se marchaient dessus. La poignée prend
   * maintenant TOUJOURS le côté opposé au menu. On le prouve mur par mur,
   * sur tout le logement de référence.
   */
  it('ne pose jamais la poignée de rotation sur le menu du mur', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const prises = () =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .filter(
          (n) => n.findAll((x) => x.props?.strokeWidth === 30).length > 0,
        );
    const nb = prises().length;
    expect(nb).toBeGreaterThan(3);
    let verifies = 0;
    for (let i = 0; i < nb; i++) {
      act(() => prises()[i].props.onPress());
      // Un appui bref sur un mur percé prend le RETOUR : pas de poignée,
      // donc pas de collision possible — on ne juge que les murs entiers.
      const poignee = tree.root
        .findAll((n) => n.props?.accessibilityLabel === 'Tourner le mur')
        .pop();
      if (!poignee) continue;
      const menu = tree.root
        .findAll((n) => {
          const st = StyleSheet.flatten(n.props?.style) as
            | { left?: number; top?: number }
            | undefined;
          if (typeof st?.left !== 'number' || typeof st?.top !== 'number') {
            return false;
          }
          return (
            n.findAll((x) => x.props?.accessibilityLabel === 'Élec').length > 0
          );
        })
        .pop();
      expect(menu).toBeDefined();
      const m = StyleSheet.flatten(menu!.props.style) as {
        left: number;
        top: number;
      };
      const p = StyleSheet.flatten(poignee.props.style) as {
        left: number;
        top: number;
      };
      const chevauche =
        p.left < m.left + WALL_MENU.w &&
        p.left + 34 > m.left &&
        p.top < m.top + WALL_MENU.h &&
        p.top + 34 > m.top;
      expect({ mur: i, chevauche }).toEqual({ mur: i, chevauche: false });
      verifies++;
    }
    // Au moins un mur entier a bien été jugé, sinon le banc ne prouve rien.
    expect(verifies).toBeGreaterThan(0);
  });

  /**
   * LE MENU DU MUR S'EST ALLÉGÉ.
   *
   * Relevé du patron : « trop imposant et vieillot ». Ce qui se compte :
   * des colonnes plus étroites (la barre perd un quart de sa largeur), une
   * pilule au lieu d'un rectangle mou, et un filet d'un cheveu qui la pose
   * sur le plan — le contour moderne, celui des cartes de l'app.
   */
  it('porte un menu de mur en pilule, étroit et cerné d’un filet', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const prise = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.strokeWidth === 30).length > 0);
    act(() => prise!.props.onPress());
    const menu = tree.root
      .findAll((n) => {
        const st = StyleSheet.flatten(n.props?.style) as
          | { left?: number }
          | undefined;
        return (
          typeof st?.left === 'number' &&
          n.findAll((x) => x.props?.accessibilityLabel === 'Élec').length > 0
        );
      })
      .pop();
    const st = StyleSheet.flatten(menu!.props.style) as {
      borderRadius?: number;
      borderWidth?: number;
    };
    expect(WALL_MENU.w).toBeLessThanOrEqual(210);
    expect(st.borderRadius).toBeGreaterThanOrEqual(18);
    expect(st.borderWidth).toBeLessThanOrEqual(StyleSheet.hairlineWidth);
    // Et les colonnes se sont resserrées avec elle.
    const colonne = StyleSheet.flatten(
      tree.root
        .findAll((n) => n.props?.accessibilityLabel === 'Élec')
        .pop()!.props.style,
    ) as { width?: number };
    expect(colonne.width).toBeLessThanOrEqual(50);
  });

  /**
   * UN RETOUR AUSSI SE RÈGLE EN HAUTEUR.
   *
   * Le retour — les trente centimètres de maçonnerie entre l’angle et
   * l’huisserie — se cotait sur le plan et recevait l’appareillage, mais
   * n’avait pas de bandeau : la hauteur du pan qui le porte n’était écrite
   * nulle part, alors que c’est elle qui dit la place qu’on a pour poser un
   * interrupteur.
   */
  it('ouvre le bandeau d’un retour, avec la hauteur de son mur', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    // Les retours sont les seuls polygones transparents qui répondent au
    // doigt : le reste du plan est plein, ou ne répond pas.
    const retour = tree.root
      .findAllByType(Polygon)
      .find(
        (n) =>
          n.props.fill === 'transparent' &&
          typeof n.props.onPress === 'function',
      );
    expect(retour).toBeDefined();
    act(() => retour!.props.onPress());
    const vu = textes(tree);
    expect(vu).toContain('retour');
    expect(vu).toContain('sous plafond');
    expect(vu).toContain('Hauteur');
  });

  /**
   * LE BANDEAU NE PASSE JAMAIS SOUS LA RANGÉE DE CALQUES.
   *
   * Relevé du chantier : « il y a des superpositions de boutons ». Le
   * bandeau et les outils partageaient la même ligne de fond ; le bouton
   * « Coter » finissait derrière une pastille, et on appuyait à côté.
   * Trois étages, désormais, du bas vers le haut : l'indicateur d'accueil,
   * la rangée des calques, puis le bandeau. On vérifie l'ordre, pas les
   * chiffres — pour qu'il tienne quel que soit le téléphone.
   */
  it('pose le bandeau AU-DESSUS de la rangée d’outils', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const mur = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.strokeWidth === 30).length > 0);
    act(() => mur!.props.onPress());

    const plat = (n: TestRenderer.ReactTestInstance) => {
      const st = n.props.style;
      return Object.assign(
        {},
        ...(Array.isArray(st) ? st : [st]).filter(Boolean).flat(Infinity),
      );
    };
    /** La ligne de fond de la rangée de calques. */
    const rail = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          plat(n).position === 'absolute' &&
          plat(n).flexDirection === 'row' &&
          plat(n).left === 0,
      )
      .map(plat)[0];
    expect(rail).toBeDefined();
    /** Le bandeau : la barre blanche qui porte les cotes du mur. */
    const bandeau = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          plat(n).position === 'absolute' &&
          typeof plat(n).bottom === 'number' &&
          plat(n).left === 12,
      )
      .map(plat)[0];
    expect(bandeau).toBeDefined();
    // Un étage complet le sépare des pastilles : hauteur d'une cellule, et
    // l'écart habituel.
    expect(bandeau.bottom).toBeGreaterThanOrEqual(rail.bottom + PILL_CELL_H);
    // Et il s'arrête avant la colonne d'actions, sur sa droite.
    expect(bandeau.marginRight).toBeGreaterThanOrEqual(50);
  });

  /**
   * L'ASTUCE DU RETOUR DE MUR SE LIT.
   *
   * Relevé du chantier : « le message qui dit qu'on peut sélectionner tout le
   * mur est caché derrière l'interface ». Il était en bas à gauche, c'est-à-
   * dire, depuis la refonte, sous la rangée de calques. Et « l'appui long ne
   * fonctionne pas bien » : neuf cents millisecondes, c'est plus long que ce
   * qu'un doigt tient immobile sur un écran.
   */
  it('pose l’astuce en haut du plan, et rend l’appui long prenable', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    // Le retour de mur se prend en touchant sa maçonnerie.
    const retour = tree.root
      .findAll((n) => typeof n.props?.onLongPress === 'function')
      .find((n) => n.props.strokeWidth === 6);
    expect(retour).toBeDefined();
    // Un tiers de seconde : au-delà, le doigt a bougé et l'appui est perdu.
    expect(retour!.props.delayLongPress).toBeLessThanOrEqual(400);
    act(() => retour!.props.onPress());

    const plat = (n: TestRenderer.ReactTestInstance) => {
      const st = n.props.style;
      return Object.assign(
        {},
        ...(Array.isArray(st) ? st : [st]).filter(Boolean).flat(Infinity),
      );
    };
    const note = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          plat(n).position === 'absolute' &&
          typeof plat(n).top === 'number' &&
          plat(n).maxWidth === 230,
      )
      .map(plat)[0];
    expect(note).toBeDefined();
    // En HAUT : le bas appartient aux calques et aux bandeaux.
    expect(note.top).toBeLessThan(40);
    expect(note.bottom).toBeUndefined();
  });

  /**
   * LES QUATRE FLÈCHES DU MEUBLE.
   *
   * Relevé du chantier : « au-dessus de ce bloc, affiche quatre flèches qui
   * permettent de modifier au pixel près l'emplacement d'un meuble ». Le doigt
   * déplace de trois centimètres quand on en voulait un, et il cache ce qu'il
   * pousse. Les flèches poussent d'un centimètre, DANS L'AXE DE L'ÉCRAN — pas
   * dans celui du scan, qui n'a aucun sens pour l'œil.
   */
  it('déplace le meuble d’un centimètre à la flèche', () => {
    const tree = monter();
    // On touche le meuble sur le plan, puis on ouvre ses cotes : c'est là que
    // les flèches se trouvent.
    const meuble = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.rx === 3).length > 0);
    expect(meuble).toBeDefined();
    act(() => meuble!.props.onPress());
    const cotes = bouton(tree, 'Cotes du meuble');
    expect(cotes).toBeDefined();
    act(() => cotes!.props.onPress());

    const avant = useScanStore.getState().objects[0].transform.slice();
    // La flèche répond à l'APPUI et répète tant qu'on la tient : le pas part
    // donc sur `onPressIn`, et s'arrête quand le doigt se lève.
    const droite = tree.root
      .findAll((n) => typeof n.props?.onPressIn === 'function')
      .find((n) => n.props.accessibilityLabel === 'Déplacer vers la droite');
    expect(droite).toBeDefined();
    act(() => droite!.props.onPressIn());
    act(() => droite!.props.onPressOut());
    const apres = useScanStore.getState().objects[0].transform;
    const pas = Math.hypot(apres[12] - avant[12], apres[14] - avant[14]);
    // Un centimètre, pas un de plus : c'est la promesse.
    expect(pas).toBeGreaterThan(0.005);
    expect(pas).toBeLessThan(0.015);
  });

  /**
   * LE BANDEAU DU MEUBLE.
   *
   * On touche le meuble, puis sa pastille de cotes : le bandeau donne sa
   * largeur et sa profondeur. Elles se saisissaient dans deux champs posés
   * au bas de l'écran — c'est-à-dire là où le clavier vient se mettre.
   */
  it('ouvre le bandeau du meuble, avec ses cotes', () => {
    const tree = monter();
    /** Un meuble : un groupe touchable qui porte son emprise arrondie. */
    const meuble = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.rx === 3).length > 0);
    expect(meuble).toBeDefined();
    act(() => meuble!.props.onPress());
    const cotes = bouton(tree, 'Cotes du meuble');
    expect(cotes).toBeDefined();
    act(() => cotes!.props.onPress());

    // Les deux cotes du meuble, en mètres, telles que le scan les donne.
    const o = SNAPSHOT_OBJECTS[0];
    const vu = textes(tree);
    expect(vu).toContain(o.width.toFixed(2).replace('.', ','));
    expect(vu).toContain(o.depth.toFixed(2).replace('.', ','));
  });

  /**
   * AUCUNE SAISIE NE SE FAIT SOUS LE CLAVIER.
   *
   * Les bandeaux vivent en bas de l'écran, où le clavier se pose : un champ
   * qui s'y trouve est un champ qu'on ne voit pas pendant qu'on tape. La
   * saisie passe donc par la feuille, qui monte AVEC le clavier — et le
   * bandeau ne porte plus que des pastilles qu'on touche.
   */
  it('ne pose aucun champ de saisie dans les bandeaux', () => {
    const tree = monter();
    const meuble = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.rx === 3).length > 0);
    act(() => meuble!.props.onPress());
    act(() => bouton(tree, 'Cotes du meuble')!.props.onPress());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  /**
   * LE BANDEAU DE LA PIÈCE.
   *
   * On touche le SOL, en édition : la pièce se nomme, sa hauteur sous
   * plafond se règle, et on peut la retirer du scan. Hors édition, le sol
   * ne répond pas — on lit un plan sans le modifier par mégarde.
   */
  it('ouvre le bandeau de la pièce quand on touche son sol', () => {
    const tree = monter();
    /** Le sol : deux polygones superposés, dont un semis de points. */
    const sol = () =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .find(
          (n) =>
            n.findAll((x) => x.props?.fill === 'url(#floorDots)').length > 0,
        );

    expect(sol()).toBeUndefined();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const cible = sol();
    expect(cible).toBeDefined();
    act(() => cible!.props.onPress());

    const vu = textes(tree);
    expect(vu).toContain('Nommer');
    // La hauteur tient en trois caractères : « H 2,50 m ». Le mot entier
    // poussait le troisième bouton hors du bandeau.
    expect(vu).toMatch(/H \d/);
    // Le bandeau annonce la pièce qu'il règle, avec sa surface.
    expect(vu).toMatch(/Pièce \d/);
  });

  /**
   * ET JAMAIS DEUX À LA FOIS.
   *
   * Ils occupent la même place au bas de l'écran : deux bandeaux ouverts,
   * c'est l'un sous l'autre, et le second illisible.
   */
  it('ne montre jamais deux bandeaux à la fois', () => {
    const tree = monter();
    const groupe = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) =>
        n
          .findAllByType(Circle)
          .some((cercle) => cercle.props.fill === 'transparent'),
      );
    act(() => groupe!.props.onPress());
    // Le bandeau du plafond est ouvert : celui du mur ne doit pas l'être.
    expect(bouton(tree, 'Relier à une commande')).toBeDefined();
    expect(bouton(tree, 'Élec')).toBeUndefined();
  });
});

/**
 * LES FEUILLES MODALES DE L'ÉCRAN — le banc qui manquait pour les déplacer.
 *
 * Sept fenêtres se relaient par-dessus le plan : le choix du format
 * d'export, le renommage du scan, l'ajout d'une pièce, la liste des noms de
 * pièce, le catalogue de mobilier, celui de l'appareillage, et la photo de
 * repérage en grand. Elles vivaient au milieu de l'écran des résultats, dans
 * le même fichier que le plan et ses bandeaux, et rien ne les regardait :
 * les sortir sans banc, c'était échanger une dette contre un risque.
 *
 * On vérifie ce qui compte pour chacune : le geste qui l'ouvre l'ouvre bien,
 * et elle porte ce qu'elle annonce.
 */
describe('les feuilles de l’écran des résultats', () => {
  /** L'action d'une feuille de menu, prise par son intitulé. */
  const actionDuMenu = (
    tree: TestRenderer.ReactTestRenderer,
    label: string,
  ) => {
    const cible = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .filter((n) =>
        n.findAllByType(Text).some((x) => x.props.children === label),
      )
      .pop();
    expect(cible).toBeDefined();
    act(() => cible!.props.onPress());
    // La feuille se retire AVANT que l'action parte : c'est la règle iOS,
    // deux écrans ne se présentent pas ensemble.
    act(() => {
      jest.advanceTimersByTime(600);
    });
  };

  /**
   * LE CHOIX DU FORMAT — cinq sorties, pas une de moins.
   *
   * Chacune a dû se battre pour sa place ; une disparition passerait
   * inaperçue jusqu'au jour où quelqu'un cherche son PDF.
   */
  it('ouvre le format d’export, avec ses cinq sorties', () => {
    const tree = monter();
    const b = bouton(tree, 'Exporter');
    expect(b).toBeDefined();
    act(() => b!.props.onPress());
    const vu = textes(tree);
    expect(vu).toContain('Plan PDF');
    expect(vu).toContain('Modèle 3D');
    expect(vu).toContain('Liste du matériel');
    expect(vu).toContain('Image');
    expect(vu).toContain('Présentation animée');
  });

  /**
   * LA PRÉSENTATION N'EST MONTÉE QU'UNE FOIS.
   *
   * Elle l'était deux fois, à deux endroits du même rendu : deux visites
   * animées superposées, chacune avec ses minuteries et son état. Personne
   * ne l'avait vu — la seconde est cachée sous la première.
   */
  it('ne monte la présentation qu’une seule fois', () => {
    const tree = monter();
    expect(tree.root.findAllByType(ClientTour)).toHaveLength(1);
  });

  /**
   * LE RENOMMAGE DU SCAN, en feuille du bas : le clavier la pousse, il ne
   * la recouvre pas. Elle porte aussi la copie — c'est là qu'on décide de
   * garder l'ancien dossier.
   */
  it('ouvre le renommage du scan, avec sa copie', () => {
    const tree = monter();
    act(() => bouton(tree, 'Plus')!.props.onPress());
    expect(textes(tree)).toContain('Renommer le scan');
    actionDuMenu(tree, 'Renommer le scan');
    const vu = textes(tree);
    expect(vu).toContain('Nom du scan');
    expect(vu).toContain('Enregistrer comme nouvelle copie');
    // Le champ arrive REMPLI du nom courant : on retouche, on ne resaisit pas.
    const champ = tree.root
      .findAllByType(TextInput)
      .find((n) => n.props.value === 'Chantier test');
    expect(champ).toBeDefined();
  });

  /** L'AJOUT D'UNE PIÈCE : des gabarits, pas un formulaire. */
  it('ouvre l’ajout d’une pièce, avec ses gabarits', () => {
    const tree = monter();
    act(() => bouton(tree, 'Plus')!.props.onPress());
    actionDuMenu(tree, 'Ajouter une pièce');
    const vu = textes(tree);
    expect(vu).toContain('Ajouter une pièce');
    expect(vu).toContain('Chambre');
    expect(vu).toContain('Cuisine');
    expect(vu).toContain('WC');
  });

  /**
   * LA LISTE DES NOMS — une liste, pas un clavier.
   *
   * On l'atteint par le bandeau de la pièce, ouvert en touchant son sol.
   */
  it('ouvre la liste des noms de pièce depuis son bandeau', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const sol = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find(
        (n) => n.findAll((x) => x.props?.fill === 'url(#floorDots)').length > 0,
      );
    act(() => sol!.props.onPress());
    act(() => bouton(tree, 'Nommer la pièce')!.props.onPress());
    const vu = textes(tree);
    expect(vu).toContain('Nom de la pièce');
    expect(vu).toContain('Séjour');
    expect(vu).toContain('Autre…');
  });

  /**
   * LE CATALOGUE DE MOBILIER, et sa recherche.
   *
   * À trente entrées, on sait ce qu'on cherche : le champ doit réduire la
   * liste, accents compris — « evier » trouve « Évier ».
   */
  it('ouvre le catalogue de mobilier, et le filtre sans accent', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => bouton(tree, 'Ajouter')!.props.onPress());
    expect(textes(tree)).toContain('Ajouter un meuble');
    const champ = tree.root
      .findAllByType(TextInput)
      .find((n) => n.props.placeholder === 'Rechercher un meuble…');
    expect(champ).toBeDefined();
    expect(textes(tree)).toContain('Lit double');
    act(() => champ!.props.onChangeText('evier'));
    const apres = textes(tree);
    expect(apres).toContain('Évier');
    expect(apres).not.toContain('Lit double');
  });

  /**
   * LE CATALOGUE DE L'APPAREILLAGE, par familles.
   *
   * Aucun mur n'est désigné : c'est le catalogue qui s'ouvre, pas le mur vu
   * de face — on choisit l'appareil, puis on touche le mur qui le reçoit.
   */
  it('ouvre le catalogue de l’appareillage, par familles', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => bouton(tree, 'Appareil')!.props.onPress());
    const vu = textes(tree);
    expect(vu).toContain('Ajouter un appareil');
    // Toutes les familles du catalogue sont annoncées, pas seulement la
    // première : c'est le déroulé entier qu'on déplace.
    for (const famille of FIXTURE_FAMILIES) {
      expect(vu).toContain(famille.name);
    }
  });

  /**
   * LA PHOTO DE REPÉRAGE, EN GRAND — et ce qu'elle montre.
   *
   * Une photo sans légende ne sert à rien trois semaines plus tard : elle
   * annonce le mur qu'elle documente, avec sa longueur.
   */
  it('ouvre la photo de repérage, légendée de son mur', () => {
    const tree = monter();
    act(() =>
      useScanStore.setState({
        photos: [
          {
            id: 'ph1',
            wallId: SNAPSHOT_WALLS[0].id,
            path: '/tmp/mur.jpg',
            at: 0,
            along: 0.5,
          },
        ],
      }),
    );
    const plan = tree.root.findAllByType(FloorplanEditor)[0];
    act(() => plan.props.onSelectPhoto('ph1'));
    const vu = textes(tree);
    expect(vu).toMatch(/Mur de \d+,\d+ m/);
    expect(vu).toContain('Supprimer');
  });
});

/**
 * LA RANGÉE D'OUTILS — les deux jeux, et le menu du plafond.
 *
 * Elle vivait au milieu de l'écran des résultats, et seule sa moitié 2D
 * était regardée : la rangée de la vue 3D — neuf calques, dont trois qui ne
 * paraissent que si le scan les justifie — n'avait aucun banc. Or c'est
 * précisément celle qu'on casse sans s'en apercevoir : il faut basculer de
 * vue pour la voir.
 */
describe('la rangée d’outils', () => {
  /** Bascule en vue 3D, animation comprise. */
  const passerEn3D = (tree: TestRenderer.ReactTestRenderer) => {
    act(() => bouton(tree, 'Passer en 3D')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(1200);
    });
  };

  /**
   * EN LECTURE, une pastille ne fait qu'AFFICHER ou CACHER ; en édition,
   * elle TRAVAILLE. Les deux jeux ne se mélangent jamais — c'est la règle
   * qui a fait sortir le « + » du catalogue de la rangée de lecture.
   */
  /*
    L'APPAREILLAGE EST UN CALQUE COMME LES AUTRES.

    C'est le sujet de l'app, donc il s'allume au départ — mais on doit
    pouvoir l'éteindre : sur un logement équipé, les symboles couvrent la
    maçonnerie qu'on est venu regarder, et il n'y avait aucun moyen de voir
    le plan nu sans supprimer quelque chose.
  */
  it('cache et rallume l’appareillage du plan', () => {
    const tree = monter();
    const plan = () => tree.root.findAllByType(FloorplanEditor)[0];
    // Allumé au départ : c'est ce qu'on vient chercher.
    expect(plan().props.showFixtures).not.toBe(false);
    const bouton = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Appareils');
    expect(bouton).toBeDefined();
    act(() => bouton!.props.onPress());
    expect(plan().props.showFixtures).toBe(false);
    act(() => bouton!.props.onPress());
    expect(plan().props.showFixtures).toBe(true);
  });

  /*
    « ENREGISTRER » EST TOUJOURS AU PLUS HAUT DE SA COLONNE.

    Il vivait au bas de la pile d'actions, et le trop-plein de calques — les
    pastilles qui ne tiennent pas dans la rangée et montent à droite — se
    posait AU-DESSUS de lui. Sa hauteur dépendait donc du nombre de calques
    affichés : sur un scan équipé, il descendait de deux crans, et on le
    cherchait. Un bouton qui engage le travail se trouve sans le chercher.

    Les actions sont donc ancrées EN HAUT du plan — « Enregistrer » d'abord,
    l'annulation juste dessous —, et « Édition » garde le bas, où le pouce
    tombe.
  */
  it('pose Enregistrer au plus haut, l’annulation dessous', () => {
    const tree = monter();
    act(() => {
      useScanStore.setState({ dirty: true });
    });
    const colonne = tree.root
      .findAllByType(View)
      .find((n) => n.props.accessibilityLabel === 'Actions du plan');
    expect(colonne).toBeDefined();
    const st = (Array.isArray(colonne!.props.style)
      ? Object.assign({}, ...colonne!.props.style.filter(Boolean))
      : colonne!.props.style) as { top?: number; bottom?: number };
    /*
      LA PILE RESTE EN BAS — c'est le pouce qui commande.

      Elle a été ancrée en haut le temps d'une version, pour que
      « Enregistrer » ne descende plus quand les calques s'empilent au-dessus.
      Mauvaise réponse à une bonne question : la colonne de droite appartient
      au pouce, et la déraciner du bas éloignait tout le reste avec elle. Ce
      qui compte, c'est l'ORDRE.
    */
    expect(typeof st.bottom).toBe('number');
    expect(st.top).toBeUndefined();
    // Enregistrer en tête, le retour en arrière juste dessous, Édition en
    // dernier : c'est l'ordre de lecture de la colonne.
    const mots = colonne!
      .findAllByType(Text)
      .map((t) => String(t.props.children))
      .filter((m) => ['Enregistrer', 'Annuler', 'Édition'].includes(m));
    expect(mots[0]).toBe('Enregistrer');
    expect(mots[mots.length - 1]).toBe('Édition');
  });

  it('échange les calques contre les outils en édition', () => {
    const tree = monter();
    expect(bouton(tree, 'Cotes')).toBeDefined();
    expect(bouton(tree, 'Appareil')).toBeUndefined();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(bouton(tree, 'Appareil')).toBeDefined();
    expect(bouton(tree, 'Redresser')).toBeDefined();
    expect(bouton(tree, 'Ajouter')).toBeDefined();
    // Les calques ont cédé la place : ils reviendront en sortant d'édition.
    expect(bouton(tree, 'Cotes')).toBeUndefined();
    expect(bouton(tree, 'Surfaces')).toBeUndefined();
  });

  /**
   * LE MENU DU PLAFOND, et la ligne de spots en tête.
   *
   * Quatre spots dans un séjour, c'était quatre poses suivies de quatre
   * réglages. La ligne se demande donc d'un geste, et le nombre se choisit
   * dans la foulée.
   */
  it('ouvre le menu du plafond, ligne de spots en tête', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => bouton(tree, 'Plafond')!.props.onPress());
    const vu = textes(tree);
    expect(vu).toContain('Équiper le plafond');
    expect(vu).toContain('Ligne de spots');
    // Et le catalogue entier derrière elle, pas seulement le premier.
    for (const k of CEILING_KINDS) {
      expect(vu).toContain(CEILINGS[k].label);
    }
  });

  /**
   * LA RANGÉE DE LA VUE 3D — neuf calques, dont trois conditionnels.
   *
   * « Repères » n'a de sens qu'avec de l'appareillage posé, « Pièces »
   * qu'à partir de deux pièces, « Plafond » qu'avec un plafond équipé. Une
   * pastille qui n'allume rien est un piège : on appuie, il ne se passe
   * rien, et on croit l'application cassée.
   */
  it('porte ses calques en vue 3D, murs et repères compris', () => {
    const tree = monter();
    passerEn3D(tree);
    expect(bouton(tree, 'Passer en 2D')).toBeDefined();
    expect(bouton(tree, 'Murs')).toBeDefined();
    expect(bouton(tree, 'Cotes')).toBeDefined();
    expect(bouton(tree, 'Meubles')).toBeDefined();
    expect(bouton(tree, 'Surfaces')).toBeDefined();
    expect(bouton(tree, 'Nord')).toBeDefined();
    // Le scan de référence porte de l'appareillage, un plafond et deux
    // pièces : les trois pastilles conditionnelles sont donc là.
    expect(bouton(tree, 'Repères')).toBeDefined();
    expect(bouton(tree, 'Plafond')).toBeDefined();
    expect(bouton(tree, 'Pièces')).toBeDefined();
    // Le bouton d'édition, lui, n'existe PAS en 3D : on n'y retouche rien.
    expect(bouton(tree, 'Édition')).toBeUndefined();
  });

  /**
   * ET LES PASTILLES CONDITIONNELLES SE TAISENT quand rien ne les justifie.
   */
  it('n’offre ni repères ni pièces sur un scan nu', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Scan nu',
        walls: SNAPSHOT_WALLS,
        openings: [],
        objects: [],
        rooms: [{ id: SNAPSHOT_ROOMS[0].id, name: 'Séjour', floor: null }],
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      tree = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 390, height: 520 } },
          });
        }
      }
    });
    passerEn3D(tree);
    expect(bouton(tree, 'Murs')).toBeDefined();
    expect(bouton(tree, 'Repères')).toBeUndefined();
    expect(bouton(tree, 'Pièces')).toBeUndefined();
    expect(bouton(tree, 'Plafond')).toBeUndefined();
    act(() => tree.unmount());
  });
});
