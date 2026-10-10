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
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { estUnRetour, RetourGlisse } from '../src/components/RetourGlisse';
import { light } from '../src/theme';
import { SOLAIRES } from '../src/ui/solaires';
import {
  cartoucheHeurte,
  taillePastilleTrou,
} from '../src/components/FloorplanEditor';
import { Circle, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { FIXTURE_FAMILIES, FIXTURE_SYMBOL } from '../src/geometry/electrical';
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

/*
  LE BANDEAU D'UNE NOTE — relevé du patron, capture à l'appui : « le bloc qui
  s'affiche pour le clic sur une note est trop imposant et mal fait (bouton
  supprimer surélevé, etc.) ».

  Deux pastilles PLEINES portant leur mot à l'intérieur — « Corriger »,
  « Déplacer » — et une troisième réduite à une icône avec son mot DESSOUS :
  deux hauteurs dans la même rangée, centrées l'une sur l'autre. La ronde
  remontait au-dessus de ses voisines et son mot pendait sous elles. Le
  bandeau prenait au passage la largeur de deux boutons-phrases, et passait
  sous la colonne de droite.

  Les trois gestes prennent donc la forme de ceux du plafond : une pastille
  ronde, le mot dessous. Même hauteur, même axe, trois fois moins large.
*/
describe('le bandeau d’une note', () => {
  const surLaNote = () => {
    const tree = monter();
    act(() =>
      useScanStore.setState({
        notes: [{ id: 'n1', text: 'Colonne montante', at: { x: 1, z: 1 } }],
      }),
    );
    const pastille = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Note : Colonne montante',
    )[0];
    expect(pastille).toBeDefined();
    act(() => pastille.props.onPress());
    return tree;
  };

  it('range ses trois gestes en pastilles de la taille d’un doigt', () => {
    const tree = surLaNote();
    for (const mot of ['Corriger', 'Déplacer', 'Retirer']) {
      const b = bouton(tree, mot);
      expect({ [mot]: b !== undefined }).toEqual({ [mot]: true });
      const st = StyleSheet.flatten(b!.props.style) as { width?: number };
      /*
        La pastille ronde, pas le bouton-phrase. Son dessin est descendu
        deux fois — quarante-quatre, quarante, puis trente-quatre : « la
        taille des blocs bleus des boutons est trop grande, réduis sans
        réduire les icônes ». C'est le disque qui pesait ; l'icône, elle,
        n'a pas bougé, et le débord tient la cible au-delà des
        quarante-quatre points du doigt.
      */
      expect({ [mot]: st.width }).toEqual({ [mot]: 34 });
    }
  });

  it('dit dans sa partie haute qu’il attend un appui sur le plan', () => {
    const tree = surLaNote();
    act(() => bouton(tree, 'Déplacer')!.props.onPress());
    // Le mot sous la pastille reste « Déplacer » — il ne peut pas porter
    // une phrase. C'est la ligne du haut qui dit ce qu'on attend.
    expect(textes(tree)).toContain('Touchez le plan pour la reposer.');
    expect(bouton(tree, 'Déplacer')).toBeDefined();
  });
});

/*
  ON RECONNAÎT LA CIBLE D'UN MUR À SA NATURE, PAS À SA LARGEUR.

  Elle se cherchait par un nombre — trente points, la largeur qu'elle avait
  alors. Relevé du patron : « la sélection d'un mur est capricieuse, et un
  clic au centre de la pièce sélectionne un mur proche ». Trente points en
  dur ne veulent rien dire tant qu'on ne sait pas à quelle échelle on
  regarde : sur un plan dézoomé, ils couvraient un placard entier. La cible
  suit désormais l'épaisseur DESSINÉE du mur, donc elle change avec le zoom
  — et aucun banc ne peut plus la nommer par un chiffre.

  Ce qui la distingue n'a pas changé : c'est un trait INVISIBLE et large,
  posé sous le poché pour recevoir le doigt.
*/
const estCibleDeMur = (x: { props?: Record<string, unknown> }) =>
  x.props?.stroke === 'transparent' && Number(x.props?.strokeWidth) >= 12;

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
    /*
      LE MEUBLE SE PREND PAR SA CIBLE, PLUS PAR SON DESSIN.

      Ce banc cherchait le groupe qui porte l'aplat (« celui qui contient un
      rect aux coins arrondis »). L'appui a demenage : releve du patron, « le
      clic sur un meuble est capricieux, il faut viser des endroits precis ».
      Le dessin d'une chaise dezoomee fait neuf millimetres a l'ecran ; une
      cible invisible, plus large de huit points de chaque cote, est posee
      par-dessus et porte desormais le geste. Elle porte aussi son nom, ce
      qui la rend trouvable ici comme au lecteur d'ecran.
    */
    const meuble = tree.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Meuble'),
    )[0];
    expect(meuble).toBeDefined();
    act(() => meuble.props.onPress());
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
      disent l'axe ; les mots vivent dans l'étiquette d'accessibilité, pas
      dans la largeur du bandeau.

      LA CROIX EST DEVENUE UNE POUBELLE. Ce banc exigeait `retirer`, la
      croix dans un cercle — c'était le dessin de cette rangée-là, et
      d'elle seule : un spot et un meuble avaient chacun le leur pour le
      même geste. Relevé du patron : « je veux les icônes de la sélection
      d'un spot… pour avoir une continuité parfaite ». C'est donc la
      poubelle commune, en rouge comme partout ailleurs (voir
      `continuite.test.tsx`, qui tient la règle pour les quatre coquilles).
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
        .some((p) => p.props.d === SOLAIRES.supprimer),
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
    /*
      LE PLAN EST À JOUR : on mesure le GESTE, pas la garde.

      Depuis qu'on ne quitte plus un plan modifié sans le savoir, sortir
      demande confirmation quand il reste du travail à enregistrer — et le
      bord gauche est soumis aux mêmes gardes que la flèche, sinon le geste
      le plus facile serait le seul à perdre le travail
      (`quitterplan.test.tsx`). Ici, rien à perdre : le retour part tout
      droit.
    */
    act(() => useScanStore.setState({ dirty: false }));
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
          (n) => n.findAll((x) => estCibleDeMur(x)).length > 0,
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
    /* « Retirer » et non « Supprimer » : neuf lettres ne tenaient pas dans
       une colonne de quarante-quatre points, et c'est le mot de tous les
       autres bandeaux de l'app. */
    expect(vu).toContain('Retirer');
    /*
      UN SEUL GESTE POUR LES COTES : « MESURES », AVEC SON CRAYON.

      « Coter » était du jargon de dessinateur — relevé du patron : « tout
      le monde ne comprend pas facilement » — et « Hauteur » un second
      bouton pour une retouche rare. Le bandeau n'offre plus qu'un mot que
      tout le monde lit, et le crayon dit « ça s'édite ». La hauteur d'un
      mur reste réglable ailleurs : par la pièce (barre du sol), et par le
      retour d'un mur percé.
    */
    /*
      TROISIÈME FORME DE CE BANDEAU, et les deux premières disent pourquoi.

      Relevé du patron, capture à l'appui : « la barre en bas mal faite pour
      sélection de mur ». Sur la photo : « 3,98 m · 2,49 m s... » puis un
      bouton « Me. ». La cote se lit, le reste est haché.

      Première tentative — faire céder les boutons : le mot se tronque au
      lieu de pousser la rangée dehors. Le débordement part, la lisibilité
      aussi (« M », « D. »). Deuxième — les actions secondaires en icônes
      seules : mieux, mais le geste principal gardait son mot et sortait
      encore.

      Celle-ci : LE BANDEAU PORTE CE QU'IL AFFICHE, comme les autres. Les
      deux cotes du mur tiennent ensemble dans la ligne forte — exactement
      comme une menuiserie affiche « 1,20 × 1,10 m » — et la note dit ce que
      c'est, en un mot. Les trois actions deviennent des pastilles : aucun
      mot, donc rien à tronquer.

      Ce qui se perd : le mot « Mesures » sous le crayon. Ce qui se gagne :
      la hauteur sous plafond, qui était coupée et se lit maintenant en
      entier.
    */
    expect(vu).toMatch(/\d,\d{2} × \d,\d{2} m/);
    expect(vu).not.toContain('Coter');
    expect(vu).not.toContain('Hauteur');
    /*
      AUCUN MOT DANS LA RANGEE — mais le MENU du mur garde les siens.

      Ce banc a d'abord cherche les mots dans tout l'ecran, et trouvait
      « Mesures » : celui du menu contextuel, qui s'ouvre sur le mur et a
      toute la place pour ecrire. Ce qui doit se taire, c'est la RANGEE du
      bas, ou trois mots ne tiennent pas.
    */
    const boutonsDuBandeau = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n) =>
        ['Mesures', 'Laser', 'Détacher'].includes(
          String(n.props.accessibilityLabel),
        ),
      )
      // Ceux du bandeau ne portent aucun texte : c'est a ca qu'on les
      // reconnait, et c'est justement ce qu'on veut verifier.
      .filter((n) => n.findAllByType(Text).length === 0);
    expect(boutonsDuBandeau.length).toBeGreaterThanOrEqual(3);
    // Le crayon reste, et c'est un TRACÉ — la leçon du chevron. C'est lui
    // qui dit « ça s'édite » maintenant que le mot est parti.
    const mesures = boutonsDuBandeau.find(
      (n) => n.props.accessibilityLabel === 'Mesures',
    );
    expect(mesures).toBeDefined();
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
      .find((n) => n.findAll((x) => estCibleDeMur(x)).length > 0);
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

  /** Le menu fixe d'un mur choisi : en édition, le premier mur entier du plan. */
  const choisirUnMur = (tree: TestRenderer.ReactTestRenderer) => {
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const prises = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .filter((n) => n.findAll((x) => estCibleDeMur(x)).length > 0);
    for (const p of prises) {
      act(() => p.props.onPress());
      // Un appui bref sur un mur percé prend le RETOUR : on veut un mur entier.
      if (tree.root.findAll((n) => n.props?.accessibilityLabel === 'Tourner le mur').length) return true;
    }
    return false;
  };
  const platDe = (n: TestRenderer.ReactTestInstance) => {
    const st = n.props.style;
    return Object.assign({}, ...(Array.isArray(st) ? st : [st]).filter(Boolean).flat(Infinity));
  };
  /** La carte du menu fixe : la vue absolue, ancrée à gauche à 12 points, qui porte la croix. */
  const carteFixe = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          platDe(n).position === 'absolute' &&
          platDe(n).left === 12 &&
          typeof platDe(n).bottom === 'number',
      )
      .find((n) => n.findAll((x) => x.props?.accessibilityLabel === 'Fermer la sélection').length > 0);

  /*
    PLUS AUCUN MENU NE FLOTTE SUR LE PLAN — relevé du patron, captures à
    l'appui : « le problème concerne le placement des menus de mur sur plan
    2D ; fais un menu fixe qui ne gênera pas la visibilité du plan ». La
    barre d'actions se posait à côté du mur choisi, sur le dessin. Ses gestes
    sont passés dans le menu fixe ; sur le plan ne reste que ce qui se
    manipule au doigt : la poignée qui tourne le mur.
  */
  it('le mur choisi garde sa poignée, et plus aucun menu ne flotte sur le plan', () => {
    const tree = monter();
    expect(choisirUnMur(tree)).toBe(true);
    const carte = carteFixe(tree);
    expect(carte).toBeDefined();
    // Les gestes de l'ancienne barre ne vivent plus QUE dans la carte.
    for (const geste of ['Ouvrir le mur', 'Retirer']) {
      const partout = tree.root.findAll(
        (n) => n.props?.accessibilityLabel === geste && typeof n.props?.onPress === 'function',
      );
      expect(partout.length).toBeGreaterThan(0);
      const dedans = carte!.findAll(
        (n) => n.props?.accessibilityLabel === geste && typeof n.props?.onPress === 'function',
      );
      expect(dedans.length).toBe(partout.length);
    }
    expect(tree.root.findAll((n) => n.props?.accessibilityLabel === 'Tourner le mur').length).toBeGreaterThan(0);
  });

  it('réserve au bandeau la largeur réelle de la colonne d’actions', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const colonne = tree.root
      .findAll((n) => n.props?.accessibilityLabel === 'Actions du plan')
      .pop();
    expect(colonne).toBeDefined();
    // Le téléphone mesure la colonne : elle est large de 96 points.
    act(() =>
      colonne!.props.onLayout({
        nativeEvent: { layout: { width: 96, height: 150 } },
      }),
    );
    // On sélectionne un mur : c'est lui qui lève le bandeau.
    const prise = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => estCibleDeMur(x)).length > 0);
    act(() => prise!.props.onPress());
    const strip = tree.root
      .findAll((n) => {
        const st = StyleSheet.flatten(n.props?.style) as
          | { marginRight?: number; maxWidth?: number; borderRadius?: number }
          | undefined;
        // La garde se dit par une marge à droite OU par une largeur maxi :
        // voir plus bas, la carte épouse désormais son contenu.
        return (
          (typeof st?.marginRight === 'number' ||
            typeof st?.maxWidth === 'number') &&
          n.findAll((x) => x.props?.accessibilityLabel === 'Laser').length > 0
        );
      })
      .pop();
    expect(strip).toBeDefined();
    const st = StyleSheet.flatten(strip!.props.style) as {
      marginRight?: number;
      maxWidth?: number;
      left: number;
    };
    /*
      LA GARDE SE DIT MAINTENANT EN LARGEUR MAXI.

      Le bandeau tenait toute la largeur et se réservait la colonne par une
      marge à droite. Depuis qu'il ÉPOUSE son contenu (relevé du patron :
      « trop de marge blanche sur son bloc »), il n'a plus de bord droit à
      pousser : c'est sa largeur maximale qui l'empêche de passer sous la
      colonne. La règle est la même, la mesure a changé de nom.
    */
    const ecran = Dimensions.get('window').width;
    const garde = st.marginRight ?? ecran - st.left - (st.maxWidth ?? 0);
    expect(garde).toBeGreaterThanOrEqual(96 + 8);
  });

  it('le menu fixe porte tous les gestes du mur, sur une ligne qui défile', () => {
    const tree = monter();
    expect(choisirUnMur(tree)).toBe(true);
    const carte = carteFixe(tree)!;
    const gestes = carte
      .findAll((n) => typeof n.props?.onPress === 'function' && typeof n.props?.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string);
    for (const g of ['Mesures', 'Laser', 'Épaisseur', 'Cloison en T', 'Ouvrir le mur', 'Retirer']) {
      expect(gestes).toContain(g);
    }
    // Une ligne qui glisse, pas deux rangées empilées sur le plan.
    expect(carte.findAll((n) => n.props?.horizontal === true).length).toBeGreaterThan(0);
  });

  it('sa croix referme la sélection et rend les outils', () => {
    const tree = monter();
    expect(choisirUnMur(tree)).toBe(true);
    const croix = carteFixe(tree)!.findAll(
      (n) => n.props?.accessibilityLabel === 'Fermer la sélection' && typeof n.props?.onPress === 'function',
    )[0];
    act(() => croix.props.onPress());
    expect(carteFixe(tree)).toBeUndefined();
    expect(tree.root.findAll((n) => n.props?.accessibilityLabel === 'Tourner le mur')).toHaveLength(0);
  });

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
   * LE MENU FIXE SE POSE À LA PLACE DE LA RANGÉE D'OUTILS.
   *
   * Il se posait AU-DESSUS d'elle : deux étages en travers du bas du plan.
   * Il prend désormais SA ligne — celle du bouton « Édition » —, et la
   * rangée s'efface sans prendre le doigt le temps de la sélection. Il
   * s'arrête avant la colonne d'actions, sur sa droite.
   */
  it('pose le menu fixe À LA PLACE de la rangée d’outils', () => {
    const tree = monter();
    expect(choisirUnMur(tree)).toBe(true);
    const carte = platDe(carteFixe(tree)!);
    /** L'ancre du bouton « Édition » : la ligne des outils. */
    const edition = tree.root
      .findAll((n) => typeof n.type === 'string' && n.findAll((x) => x.props?.accessibilityLabel === 'Édition').length > 0)
      .map(platDe)
      .filter((st) => st.position === 'absolute' && typeof st.bottom === 'number')
      .pop();
    expect(edition).toBeDefined();
    expect(carte.bottom).toBe(edition!.bottom);
    // La rangée d'outils est là, effacée, et ne prend plus le doigt.
    const rangee = tree.root
      .findAll((n) => typeof n.type === 'string' && n.props?.pointerEvents === 'none')
      .find((n) => n.findAll((x) => x.props?.accessibilityLabel === 'Redresser').length > 0);
    expect(rangee).toBeDefined();
    expect(platDe(rangee!).opacity).toBe(0);
    // Et la carte s'arrête avant la colonne de droite.
    expect(carte.right ?? 0).toBeGreaterThanOrEqual(50);
  });

  /**
   * LA CONSIGNE DU RETOUR VIT DANS SA CARTE.
   *
   * Elle avait son bandeau en haut du plan, sous les pastilles, qui la
   * recouvraient à moitié (capture du patron). Et l'appui long reste
   * prenable : un tiers de seconde, au-delà le doigt a bougé.
   */
  it('dit la consigne du retour dans sa carte, et rend l’appui long prenable', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const retour = tree.root
      .findAll((n) => typeof n.props?.onLongPress === 'function')
      .find((n) => n.props.strokeWidth === 6);
    expect(retour).toBeDefined();
    expect(retour!.props.delayLongPress).toBeLessThanOrEqual(400);
    act(() => retour!.props.onPress());
    const carte = carteFixe(tree);
    expect(carte).toBeDefined();
    const lus = carte!.findAllByType(Text).map((n) => String(n.props.children));
    expect(lus.some((t) => /appui long/.test(t))).toBe(true);
    // Plus de bandeau d'astuce posé en haut du plan.
    expect(
      tree.root.findAll(
        (n) => typeof n.type === 'string' && platDe(n).maxWidth === 230 && typeof platDe(n).top === 'number',
      ),
    ).toHaveLength(0);
    // Et la carte du retour sait prendre le mur entier, d'un appui.
    expect(carte!.findAll((n) => n.props?.accessibilityLabel === 'Tout le mur').length).toBeGreaterThan(0);
  });

  /*
    UN MEUBLE NE SE PREND QU'EN ÉDITION — relevé du patron : « le clic sur
    les meubles ne doit pas être possible sans mode édition ». Hors édition,
    on lit le plan : aucun meuble ne répond au doigt.
  */
  const enEdition = (tree: TestRenderer.ReactTestRenderer) => {
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
  };
  const ciblesDeMeuble = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAll(
      // « Meuble Lit », « Meuble Chaise »… — pas la pastille « Meubles » du calque.
      (n) => /^Meuble /.test(String(n.props?.accessibilityLabel ?? '')) && typeof n.props?.onPress === 'function',
    );

  it('hors édition, aucun meuble ne se prend ; en édition, si', () => {
    const tree = monter();
    expect(ciblesDeMeuble(tree)).toHaveLength(0);
    enEdition(tree);
    expect(ciblesDeMeuble(tree).length).toBeGreaterThan(0);
    // Et en sortant de l'édition, le meuble tenu est lâché.
    act(() => ciblesDeMeuble(tree)[0].props.onPress());
    expect(bouton(tree, 'Cotes du meuble')).toBeDefined();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(bouton(tree, 'Cotes du meuble')).toBeUndefined();
  });

  it('déplace le meuble d’un centimètre à la flèche', () => {
    const tree = monter();
    enEdition(tree);
    // On touche le meuble sur le plan, puis on ouvre ses cotes : c'est là que
    // les flèches se trouvent.
    // Le meuble se prend par sa cible nommée, plus par son dessin : voir
    // l'épreuve « toucher le sol lâche le meuble tenu » pour le pourquoi.
    const meuble = tree.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Meuble'),
    )[0];
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
    enEdition(tree);
    /** Un meuble : un groupe touchable qui porte son emprise arrondie. */
    // Le meuble se prend par sa cible nommée, plus par son dessin : voir
    // l'épreuve « toucher le sol lâche le meuble tenu » pour le pourquoi.
    const meuble = tree.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Meuble'),
    )[0];
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
    enEdition(tree);
    // Le meuble se prend par sa cible nommée, plus par son dessin : voir
    // l'épreuve « toucher le sol lâche le meuble tenu » pour le pourquoi.
    const meuble = tree.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Meuble'),
    )[0];
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
    // La présentation animée a été retirée avec la refonte grand public.
    expect(vu).not.toContain('Présentation animée');
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

  /*
    « AJOUTER UNE PIECE » LA POSE — il n'y a plus rien a tirer.

    Ce banc a decrit trois etats successifs du meme bouton, et le troisieme
    est le bon.

    1. Un catalogue de gabarits, et la piece se posait TOUTE SEULE contre le
       mur le plus long en prenant SA longueur : une « chambre 3 x 3 »
       sortait en 5 x 3. Releve du patron : « a la selection d'une piece a
       ajouter, elle se place automatiquement et impossible de creer des
       murs pour faire la piece facilement ».
    2. On a donc remplace le catalogue par un geste — poser un doigt,
       glisser, lacher — et ce banc verifiait qu'on passait en mode TRACE.
       Deuxieme releve, apres essai : « le "ajouter une piece" ne montre pas
       qu'il faut creer la piece, et de plus au glissement, ca s'annule tout
       seul avec le deplacement du plan ». Un ecran qui attend un geste
       qu'il n'annonce pas est un ecran ou il ne se passe rien.
    3. Le catalogue revient — ce n'etait pas lui le defaut, c'etait le
       PLACEMENT automatique. La piece se pose desormais aux cotes demandees
       (`addRoomLibre`), en pointilles, et se regle sur elle-meme.

    Ce que le banc verifie donc : le bouton ouvre le choix des cotes, et il
    n'ouvre plus de mode d'attente.
  */
  it('ouvre le choix des cotes plutôt qu’un mode d’attente', () => {
    const tree = monter();
    act(() => bouton(tree, 'Plus')!.props.onPress());
    actionDuMenu(tree, 'Ajouter une pièce');
    // Les gabarits sont la...
    expect(textes(tree)).toContain('WC');
    // ...et le calque qui attendait un glissement n'y est plus.
    const calque = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Tirer une piece',
    );
    expect(calque).toHaveLength(0);
  });

  /**
   * ET ELLE ARRIVE VRAIMENT SUR LE PLAN, en pointilles.
   *
   * « Le "ajouter une piece" ne montre pas qu'il faut creer la piece » : le
   * seul remede qui vaille est que la piece SOIT LA, visible, des le choix
   * fait. Neuve, donc pointillee, donc reglable par ses cotes.
   */
  it('pose la pièce choisie, neuve et prête à être réglée', () => {
    const tree = monter();
    const avant = useScanStore.getState().rooms.length;
    act(() => bouton(tree, 'Plus')!.props.onPress());
    actionDuMenu(tree, 'Ajouter une pièce');
    const wc = tree.root
      .findAll(
        (n) =>
          n.props?.accessibilityLabel === 'WC' &&
          typeof n.props?.onPress === 'function',
      )[0];
    act(() => wc.props.onPress());
    const rooms = useScanStore.getState().rooms;
    expect(rooms).toHaveLength(avant + 1);
    expect(rooms.some((r) => r.neuve)).toBe(true);
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
    // Le bouton dit le SUJET, et c'est le mode qui dit ce qu'on en fait.
    // Il s'est appelé « Meubles » le temps d'une version : en édition on
    // n'en pose qu'UN, comme « Appareil » ou « Plafond » à côté de lui —
    // le pluriel est resté au CALQUE, qui les montre tous. La feuille, elle,
    // garde son titre d'action.
    act(() => bouton(tree, 'Meuble')!.props.onPress());
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
    /*
      LE CATALOGUE MONTRE LES VRAIS SYMBOLES — relevé du patron : « des
      images plus modernes et plus compréhensibles ». Une pastille de
      couleur à sigle ne dit rien ; le symbole normalisé, c'est ce que le
      plan dessinera. Le socle de prise du catalogue est CELUI du plan.
    */
    const scroll = tree.root.findAllByType(ScrollView).pop()!;
    expect(
      scroll
        .findAllByType(Path)
        .some((p) => p.props.d === FIXTURE_SYMBOL.prise[0].d),
    ).toBe(true);
    /*
      ET LE BLANC DÉFILE — relevé du patron : « ça ne scrolle pas, il faut
      scroller sur un nom ». Un Pressable ANCÊTRE avalait le geste sur les
      zones vides : le voile est désormais un frère derrière la carte,
      aucun ancêtre du déroulé ne porte de geste.
    */
    let parent = scroll.parent;
    while (parent) {
      expect(typeof parent.props?.onPress).not.toBe('function');
      parent = parent.parent;
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
    /* La feuille d'une photo, elle, garde « Supprimer » : elle a la place
       d'une ligne entière, et c'est un fichier qu'on efface — pas un objet
       du plan qu'on retire. */
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
    « ENREGISTRER » EST TOUJOURS AU PLUS HAUT DE LA COLONNE — troisième
    version, et la question est la même depuis le début : on doit le trouver
    sans le chercher.

    1. Il vivait au BAS de la pile d'actions, et le trop-plein de calques se
       posait au-dessus de lui : sa hauteur dépendait du nombre de calques
       affichés, et sur un scan équipé il descendait de deux crans.
    2. On a donc ancré toute la pile EN HAUT du plan. Mauvaise réponse à une
       bonne question : la colonne de droite appartient au pouce, et la
       déraciner du bas éloignait tout le reste avec elle. Retour en bas,
       avec un ORDRE — Enregistrer, annulation, Édition.
    3. Sauf que l'ordre DANS la pile ne dit rien de ce qui s'empile
       au-dessus d'elle. Relevé du patron : « le bouton Enregistrer doit être
       au-dessus du bouton Nord et de tout autre bouton de la colonne,
       lorsqu'il est affiché ». Le trop-plein de calques était toujours
       par-dessus.

    Il a donc son PROPRE ancrage, posé au-dessus des deux piles — celle des
    commandes et celle des calques —, dont les hauteurs sont mesurées. Les
    commandes gardent le bas, où tombe le pouce.
  */
  it('pose Enregistrer au-dessus des commandes ET des calques', () => {
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
    // La pile des commandes reste en bas : c'est le pouce qui commande.
    expect(typeof st.bottom).toBe('number');
    expect(st.top).toBeUndefined();
    /*
      Elle ne porte plus « Enregistrer » — il a son propre ancrage — NI
      « Édition » depuis le relevé suivant : « le Note doit être au-dessus
      de l'édition ». Le trop-plein de la rangée s'intercale entre les deux,
      et il ne pouvait le faire tant qu'ils vivaient dans le même bloc.
    */
    const mots = colonne!
      .findAllByType(Text)
      .map((t) => String(t.props.children))
      .filter((m) => ['Enregistrer', 'Annuler', 'Édition'].includes(m));
    expect(mots).not.toContain('Enregistrer');
    expect(mots).not.toContain('Édition');
    /** La hauteur du bloc absolu qui porte cette pastille. */
    const hauteurDe = (label: string) => {
      const b = tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === label);
      let n: TestRenderer.ReactTestInstance | null = b ?? null;
      while (n) {
        const s2 = (Array.isArray(n.props?.style)
          ? Object.assign({}, ...n.props.style.filter(Boolean))
          : n.props?.style) as { position?: string; bottom?: number } | undefined;
        if (s2?.position === 'absolute' && typeof s2.bottom === 'number') {
          return s2.bottom;
        }
        n = n.parent;
      }
      return null;
    };
    expect(hauteurDe('Enregistrer')).toBeGreaterThan(hauteurDe('Édition')!);
    // L'ordre complet, du pied vers le haut : Édition, les commandes (avec
    // le trop-plein de la rangée entre les deux), puis l'enregistrement.
    expect(Number(st.bottom)).toBeGreaterThan(hauteurDe('Édition')!);
    expect(hauteurDe('Enregistrer')!).toBeGreaterThanOrEqual(Number(st.bottom));
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
    // « Meuble » en édition ouvre le catalogue ; « Meubles » hors édition,
    // c'est le calque. Même sujet, deux gestes selon le mode — et c'est le
    // peigne « Afficher » qui dit lequel (voir `afficher.test.tsx`).
    expect(bouton(tree, 'Meuble')).toBeDefined();
    // Les calques ont cédé la place : ils reviendront en sortant d'édition.
    expect(bouton(tree, 'Cotes')).toBeUndefined();
    expect(bouton(tree, 'Surfaces')).toBeUndefined();
  });

  /*
    « REDRESSER » OUVRE LA RANGÉE — relevé du patron : « mets le bouton
    Redresser tout à gauche des autres boutons ».

    Il ne pose rien : il remet TOUT le plan d'équerre d'un coup. C'est le
    geste qu'on fait en premier en entrant en édition — on redresse le
    relevé, puis on place dessus.
  */
  it('ouvre la rangée d’édition par « Redresser »', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const OUTILS = ['Redresser', 'Appareil', 'Meuble', 'Plafond', 'Note'];
    const ordre = tree.root
      .findAllByType(TouchableOpacity)
      .map((n) => String(n.props.accessibilityLabel ?? ''))
      .filter((l) => OUTILS.includes(l));
    expect(ordre[0]).toBe('Redresser');
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

/**
 * LES POIGNÉES DE COTES PARLENT AU MAGASIN — dans SA langue.
 *
 * Relevé du patron : « en glissant le côté droit, c'est son côté gauche qui
 * change, il y a une inversion ». Le dessin retourne certains meubles d'un
 * demi-tour (l'avant ne regarde pas le mur — faceIntoRoom) ; le magasin,
 * lui, raisonne sur le transform BRUT. La poignée posée sur le bord « + »
 * du dessin désignait alors le bord « − » du magasin : on tirait à droite,
 * la gauche bougeait. La traduction est une règle pure, et la voici fixée.
 */
describe('les poignées de cotes des meubles', () => {
  const { coteVersLeMagasin } = require('../src/components/FloorplanEditor');

  it('traduisent le bord quand le meuble est dessiné retourné', () => {
    expect(coteVersLeMagasin('largeur+', Math.PI, 0)).toBe('largeur-');
    expect(coteVersLeMagasin('largeur-', Math.PI, 0)).toBe('largeur+');
    expect(coteVersLeMagasin('profondeur+', 0, Math.PI)).toBe('profondeur-');
  });

  it('ne traduisent rien quand dessin et magasin sont d’accord', () => {
    expect(coteVersLeMagasin('largeur+', 0.08, 0)).toBe('largeur+');
    expect(coteVersLeMagasin('profondeur-', -0.05, 0)).toBe('profondeur-');
  });
});

/**
 * LE SIGLE 3D SUIT LE ZOOM — relevé du patron : « même en dézoomé ils sont
 * trop gros, il faut une intelligence de zoom qui augmente la taille des
 * noms avec ». Écrit en 10 fixe, « PC » couvrait la moitié d'une chambre
 * vue de loin. La taille est une règle pure du zoom, bornée aux deux bouts.
 */
describe('le sigle des appareils en 3D', () => {
  const { tailleDuSigle } = require('../src/components/Iso3DView');

  it('grandit avec le zoom, borné aux deux bouts', () => {
    expect(tailleDuSigle(45)).toBeLessThan(tailleDuSigle(95));
    // De loin, discret ; jamais illisible pour autant.
    expect(tailleDuSigle(25)).toBeGreaterThanOrEqual(5);
    expect(tailleDuSigle(25)).toBeLessThanOrEqual(7);
    // De près, jamais plus gros qu'avant : dix, c'était déjà le plafond.
    expect(tailleDuSigle(600)).toBeLessThanOrEqual(10);
  });
});

/**
 * « NORMES AUTO » PORTE LE BOUCLIER — relevé du patron : la même icône que
 * la pastille de contrôle du plan, pas le crayon du renommage.
 */
describe('le menu du scan', () => {
  it('illustre Normes auto avec le bouclier du contrôle', () => {
    const tree = monter();
    const points = bouton(tree, 'Plus')!;
    act(() => points.props.onPress());
    const vu = textes(tree);
    expect(vu).toContain('Normes auto');
    // Les rangées du menu sont des Pressable : on cherche par le geste.
    const ligne = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) =>
        n.findAllByType(Text).some((t) => t.props.children === 'Normes auto'),
      )!;
    expect(ligne).toBeDefined();
    const { SOLAIRES } = require('../src/ui/solaires');
    expect(
      ligne.findAllByType(Path).filter((p) => p.props.d === SOLAIRES.bouclier)
        .length,
    ).toBe(1);
  });

  /*
    L'ORDRE DU MENU, ET À QUI IL PARLE — relevé du patron : « fais un tour
    de toutes les options dans les "…" ». Les relevés ensemble, puis le
    dessin, puis le dossier ; et « Normes auto » n'est plus offerte au
    particulier, qui n'a jamais allumé la norme.
  */
  it('se lit dans l’ordre : relever, dessiner, puis le dossier', () => {
    const tree = monter();
    act(() => bouton(tree, 'Plus')!.props.onPress());
    const vu = textes(tree);
    const rang = (m: string) => {
      const i = vu.indexOf(m);
      expect(`${m} : ${i >= 0}`).toBe(`${m} : true`);
      return i;
    };
    const ordre = [
      'Ce qu’il faut acheter',
      'Scanner une pièce',
      'Scanner un étage',
      'Scanner un sous-sol',
      'Ajouter une pièce',
      'Ajouter un mur',
      'Redétecter les pièces',
      'Renommer le scan',
      'Nouveau scan',
    ].map(rang);
    expect(ordre).toEqual([...ordre].sort((x, y) => x - y));
  });

  it('ne propose pas « Normes auto » au grand public', () => {
    const { useUsage } = require('../src/store/usage');
    const avant = useUsage.getState().modeElec;
    act(() => useUsage.setState({ modeElec: false }));
    const tree = monter();
    act(() => bouton(tree, 'Plus')!.props.onPress());
    const vu = textes(tree);
    expect(vu).not.toContain('Normes auto');
    expect(vu).toContain('Passer en mode Électricité');
    act(() => useUsage.setState({ modeElec: avant }));
  });
});

/**
 * UNE OUVERTURE SE FERME — relevé du patron : « donne la possibilité de
 * fermer une ouverture et le remettre en mur, en continuité de ses murs
 * adjacents ». Les ouvertures sont des trous découpés dans des murs pleins
 * (assignOpenings) : fermer, c'est retirer le trou — le mur redevient
 * continu par construction, aucune maçonnerie à inventer.
 *
 * LE GESTE A CHANGÉ DE PLACE, ET CE BANC AVEC LUI. Il vivait dans la
 * rangée du bandeau, « à côté de Largeur et Hauteur ». La menuiserie a
 * depuis gagné trois réglages qu'elle n'avait pas — sa position sur le mur,
 * son allège, le sens d'ouverture de son battant — ce qui portait la rangée
 * à HUIT boutons, c'est-à-dire exactement le défaut relevé sur le bandeau
 * du mur : « peu de place pour les informations, un bouton sort du bloc ».
 *
 * La rangée portait donc ce que le bandeau AFFICHE — les trois cotes de la
 * menuiserie — et un menu portait ce qui tient à la POSE : où elle tombe sur
 * le mur, de quel côté elle s'ouvre, son coffre, sa fermeture.
 *
 * CE MENU N'EXISTE PLUS. Relevé du patron, une version plus tard : « le "…"
 * de la menuiserie est mal placé, peu compréhensible sans lire le texte ».
 * Chaque geste a désormais sa pastille et son mot. Ce que ce banc vérifie
 * n'a pas bougé d'un pouce — le trou part, les murs restent ; c'est le
 * CHEMIN pour y arriver qui a raccourci.
 */
describe('la menuiserie selectionnee', () => {
  it('offre « Fermer l’ouverture », qui rebouche sans toucher aux murs', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    // La cible tactile d'une menuiserie : son trait transparent de 26.
    const cible = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.strokeWidth === 26).length > 0);
    expect(cible).toBeDefined();
    act(() => cible!.props.onPress());
    // Les trois cotes restent en direct : c'est ce qu'on vient corriger.
    expect(textes(tree)).toContain('Largeur');
    /*
      LA FERMETURE EST SORTIE DU MENU.

      Elle se prenait derriere « Reglages de la menuiserie », la pastille de
      trois points du bandeau. Releve du patron : « au clic sur une porte, le
      "…" de la menuiserie est mal place, peu comprehensible sans lire le
      texte — peut-etre proposer directement les choix sous forme de
      boutons ». Il n'y a plus de menu : chaque geste porte sa silhouette et
      son mot, « Retirer » compris, comme sous une ligne de spots ou sous un
      meuble (voir `bandeaumenuiserie.test.tsx`).

      Ce que ce banc verifie n'a pas bouge d'un pouce : le trou part, les
      murs restent. C'est le CHEMIN pour y arriver qui a raccourci.
    */
    const murs = useScanStore.getState().walls.length;
    const trous = useScanStore.getState().openings.length;
    act(() => bouton(tree, 'Retirer')!.props.onPress());
    /*
      LE GESTE ATTEND QUE LA FEUILLE SOIT PARTIE.

      Une rangée de menu ne fait pas son travail sous le doigt : elle range
      le geste et referme, et c'est la fin de la fermeture qui l'exécute.
      Sans quoi l'écran change DERRIÈRE une feuille encore ouverte — le
      bandeau se réécrit sous les yeux pendant qu'elle glisse vers le bas.
    */
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(useScanStore.getState().openings.length).toBe(trous - 1);
    expect(useScanStore.getState().walls.length).toBe(murs);
  });
});

/**
 * LE LIEN D'UN APPAREIL MURAL SE VOIT SUR LE PLAN — même filet tireté que
 * celui d'un point du plafond vers son interrupteur : une applique
 * commandée sans trait sur le plan, c'est un câble que personne ne tire.
 */
describe('le lien mural sur le plan', () => {
  it('trace le filet de l’applique à son interrupteur', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    const wid = SNAPSHOT_FIXTURES[0].wallId;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Lien test',
        walls: SNAPSHOT_WALLS,
        openings: [],
        objects: [],
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({
          id: r.id,
          name: `Pièce ${i + 1}`,
          floor: null,
        })),
        fixtures: [
          {
            id: 'ap1',
            kind: 'applique' as const,
            wallId: wid,
            along: 0.8,
            height: 1.8,
            side: 1 as const,
            commands: ['i1'],
          },
          {
            id: 'i1',
            kind: 'inter' as const,
            wallId: wid,
            along: 1.6,
            height: 1.1,
            side: 1 as const,
          },
        ],
        ceiling: [],
        photos: [],
      });
      tree = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    // Le filet du lien : le tireté des liaisons de commande — celui de
    // l'architecte, à l'encre rouge, dès que l'électricité est affichée.
    const filets = tree.root.findAll(
      (n) => n.props?.strokeDasharray === '4 3' || n.props?.strokeDasharray === '1.5 3.5',
    );
    expect(filets.length).toBeGreaterThanOrEqual(1);
    act(() => tree.unmount());
  });
});

/**
 * LE TROU DU RELEVÉ SE COMBLE D'UN APPUI, SUR LE PLAN.
 *
 * Relevé du chantier : « le scan n'a pas su capter une porte, je me suis
 * retrouvé avec deux murs séparés, et impossible de les joindre ou d'en
 * créer un facilement ». Le manque se voit désormais sur le plan — un
 * tireté rouge et une pastille au milieu — et l'appui tend le mur avec sa
 * porte. Il n'apparaît qu'en ÉDITION : en lecture, on ne modifie rien.
 */
describe('le trou laissé par le scan', () => {
  const monterTroue = () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Porte manquée',
        // Un U dont le mur du bas est coupé net sur 90 cm.
        walls: [
          { id: 'w1', type: 'wall', a: { x: 0, z: 0 }, b: { x: 5, z: 0 }, height: 2.5, yCenter: 1.25 },
          { id: 'w2', type: 'wall', a: { x: 5, z: 0 }, b: { x: 5, z: 4 }, height: 2.5, yCenter: 1.25 },
          { id: 'w3', type: 'wall', a: { x: 5, z: 4 }, b: { x: 3, z: 4 }, height: 2.5, yCenter: 1.25 },
          { id: 'w4', type: 'wall', a: { x: 2.1, z: 4 }, b: { x: 0, z: 4 }, height: 2.5, yCenter: 1.25 },
          { id: 'w5', type: 'wall', a: { x: 0, z: 4 }, b: { x: 0, z: 0 }, height: 2.5, yCenter: 1.25 },
        ],
        openings: [],
        objects: [],
        rooms: [],
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      tree = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    arbre = tree;
    return tree;
  };

  const pastille = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) =>
        String(n.props.accessibilityLabel ?? '').startsWith('Combler'),
      );

  it('ne s’affiche pas en lecture', () => {
    expect(pastille(monterTroue())).toBeUndefined();
  });

  it('paraît en édition, et referme le plan d’un appui', () => {
    const tree = monterTroue();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const cible = pastille(tree);
    expect(cible).toBeDefined();
    // Le libellé dit la largeur du manque : on sait ce qu'on va poser.
    expect(cible!.props.accessibilityLabel).toContain('90');
    const avant = useScanStore.getState().walls.length;
    act(() => cible!.props.onPress());
    const st = useScanStore.getState();
    expect(st.walls).toHaveLength(avant + 1);
    // Quatre-vingt-dix centimètres : c'est une porte, et elle est posée.
    expect(st.openings).toHaveLength(1);
    expect(st.openings[0].type).toBe('door');
    // Le trou comblé, la pastille n'a plus lieu d'être.
    expect(pastille(tree)).toBeUndefined();
  });
});

/**
 * CRÉER UN MUR À LA MAIN — le geste qui n'existait nulle part.
 *
 * Relevé du chantier, seconde moitié de la phrase : « impossible de les
 * joindre OU D'EN CRÉER UN facilement ». Et pour cause : le magasin savait
 * poser un mur entre deux points (`addWallBetween`) depuis des mois, mais
 * aucun bouton de l'app n'y menait — du code mort d'un côté, un manque
 * criant de l'autre. La pastille « Combler » règle les trous que l'app
 * reconnaît ; ce bouton-ci règle tous les autres.
 */
describe('ajouter un mur à la main', () => {
  /*
    Le menu joue son action APRÈS s'être refermé, et cette descente ne se
    déroule pas sous minuteries simulées : on vérifie donc ce qui est
    observable ici — que le geste est OFFERT — et le geste lui-même sur le
    magasin, qui est là où il vit.
  */
  it('est offert dans le menu du scan', () => {
    const tree = monter();
    act(() => bouton(tree, 'Plus')!.props.onPress());
    expect(textes(tree)).toContain('Ajouter un mur');
  });

  it('pose un mur d’un mètre, qu’on peut ensuite tirer par ses coins', () => {
    const avant = useScanStore.getState().walls.length;
    useScanStore
      .getState()
      .addWallBetween({ x: 1, z: 1 }, { x: 2, z: 1 });
    const murs = useScanStore.getState().walls;
    expect(murs).toHaveLength(avant + 1);
    const neuf = murs[murs.length - 1];
    expect(segLength(neuf)).toBeCloseTo(1, 2);
    // Il prend la hauteur des murs du logement : un mur neuf plus bas que
    // ses voisins ferait un trou dans la 3D et dans les élévations.
    expect(neuf.height).toBeCloseTo(useScanStore.getState().walls[0].height, 2);
  });

  it('mais refuse un trait de rien du tout', () => {
    const avant = useScanStore.getState().walls.length;
    useScanStore.getState().addWallBetween({ x: 1, z: 1 }, { x: 1.05, z: 1 });
    expect(useScanStore.getState().walls).toHaveLength(avant);
  });
});

/**
 * LE RECOIN TECHNIQUE SE POCHE EN NOIR.
 *
 * Relevé du patron : « quand il y a 4 murs qui encerclent un recoin vide
 * (ici sous les WC, c'était une épaisseur pour les gaines), il doit être
 * rempli de noir pour ne pas confondre avec une pièce ». Un vide blanc au
 * milieu d'un plan se lit comme une pièce qu'on aurait oublié de nommer.
 */
describe('le recoin technique du plan', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number) => ({
    id,
    type: 'wall' as const,
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });

  it('se remplit du noir de la maçonnerie', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Gaine',
        walls: [
          // La pièce, avec sa porte.
          mur('n', 0, 0, 4, 0),
          mur('e', 4, 0, 4, 3),
          mur('s', 4, 3, 0, 3),
          mur('w', 0, 3, 0, 0),
          // Et le coffre de gaines, collé dans l'angle : quatre murs, rien
          // qui s'ouvre.
          mur('g1', 4, 0, 4.5, 0),
          mur('g2', 4.5, 0, 4.5, 0.8),
          mur('g3', 4.5, 0.8, 4, 0.8),
        ],
        openings: [
          {
            id: 'p1',
            type: 'door' as const,
            a: { x: 1, z: 0 },
            b: { x: 1.9, z: 0 },
            height: 2.04,
            yCenter: 1.02,
          },
        ],
        objects: [],
        rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      tree = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    arbre = tree;
    // Le poché : un polygone plein, de l'encre des murs.
    const massifs = tree.root
      .findAllByType(Polygon)
      .filter((n) => n.props.fill === light.ink && !n.props.stroke);
    expect(massifs.length).toBeGreaterThan(0);
  });
});

/**
 * RELANCER LA DÉTECTION SUR UN PLAN DÉJÀ FAIT.
 *
 * Sans ce geste, un correctif de détection ne profite qu'aux scans à
 * VENIR : les dossiers déjà relevés gardent leurs pièces manquantes pour
 * toujours. `redetectRooms` existait, mais aucun bouton n'y menait — il ne
 * se déclenchait qu'en passant par « Redresser », qui bouge la géométrie.
 */
describe('redétecter les pièces', () => {
  it('est offert dans le menu du scan', () => {
    const tree = monter();
    act(() => bouton(tree, 'Plus')!.props.onPress());
    expect(textes(tree)).toContain('Redétecter les pièces');
  });

  it('retrouve une pièce que l’ancienne détection avait ratée', () => {
    // Un WC de 0,90 × 1,30 avec sa porte : sous l'ancien seuil de 1,2 m².
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'WC',
        walls: [
          { id: 'n', type: 'wall', a: { x: 0, z: 0 }, b: { x: 0.9, z: 0 }, height: 2.5, yCenter: 1.25 },
          { id: 'e', type: 'wall', a: { x: 0.9, z: 0 }, b: { x: 0.9, z: 1.3 }, height: 2.5, yCenter: 1.25 },
          { id: 's', type: 'wall', a: { x: 0.9, z: 1.3 }, b: { x: 0, z: 1.3 }, height: 2.5, yCenter: 1.25 },
          { id: 'w', type: 'wall', a: { x: 0, z: 1.3 }, b: { x: 0, z: 0 }, height: 2.5, yCenter: 1.25 },
        ],
        openings: [
          { id: 'p', type: 'door', a: { x: 0.1, z: 0 }, b: { x: 0.8, z: 0 }, height: 2.04, yCenter: 1.02 },
        ],
        objects: [],
        rooms: [],
        fixtures: [],
        ceiling: [],
        photos: [],
      });
    });
    useScanStore.getState().redetectRooms();
    const pieces = useScanStore.getState().rooms;
    expect(pieces).toHaveLength(1);
    // Et elle porte un nom : « chaque pièce doit avoir son nom et sa
    // surface » — sans nom, le cartouche du plan reste muet.
    expect(pieces[0].name).toBeTruthy();
  });
});

/**
 * LE BANDEAU D'ATTENTE NE MARCHE PLUS SUR LES OUTILS.
 *
 * Relevé du chantier : « le bouton qui dit de toucher un interrupteur après
 * "Lier" est peu visible et mal placé, sur des autres blocs, en bas ». Il
 * était calé en bas à gauche — c'est-à-dire par-dessus la rangée de
 * calques, qui occupe toute cette bande — et son texte, bridé à cent
 * trente-huit points, sortait tronqué : « Touchez l'interrupteur q… ».
 *
 * Il remonte en haut, où la place est libre : les pastilles de contrôle et
 * de vue tiennent la droite, il s'arrête avant elles.
 */
describe('le bandeau d’attente', () => {
  it('se pose en HAUT, jamais sur la rangée d’outils', () => {
    const { EnAttente } = require('../src/components/PendingPill');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <EnAttente kind="prise" plafond={null} cible={null} onCancel={() => {}} />,
      );
    });
    const bloc = tree.root.findAllByType(View).find((n) => {
      const st = StyleSheet.flatten(n.props?.style) as
        | { position?: string; bottom?: number; top?: number }
        | undefined;
      return st?.position === 'absolute' && (st?.top !== undefined || st?.bottom !== undefined);
    })!;
    const st = StyleSheet.flatten(bloc.props.style) as {
      top?: number;
      bottom?: number;
      right?: number;
    };
    expect(st.top).toBeDefined();
    expect(st.bottom).toBeUndefined();
    // Et il s'arrête avant les pastilles du coin haut droit.
    expect(st.right).toBeGreaterThanOrEqual(90);
    act(() => tree.unmount());
  });

  it('laisse la consigne se lire en entier', () => {
    const { EnAttente } = require('../src/components/PendingPill');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <EnAttente
          kind="prise"
          plafond={null}
          cible="l’interrupteur qui le commande"
          onCancel={() => {}}
        />,
      );
    });
    const consigne = tree.root
      .findAllByType(Text)
      .find((n) =>
        String(n.props.children ?? '').includes('interrupteur'),
      )!;
    expect(consigne).toBeDefined();
    // Deux lignes plutôt qu'une tronquée : la consigne dit QUOI toucher,
    // elle ne sert à rien coupée en son milieu.
    expect(consigne.props.numberOfLines).toBeGreaterThanOrEqual(2);
    act(() => tree.unmount());
  });
});

/**
 * LA PASTILLE DU TROU SUIT L'ÉCHELLE DU PLAN.
 *
 * Elle faisait trente-quatre points, quel que soit le zoom. Sur un plan
 * dézoomé — la vue d'ensemble d'un logement, celle qu'on regarde le plus —
 * elle couvrait une pièce entière : relevé du patron, capture à l'appui,
 * « le + d'une ouverture sans porte est trop gros en dézoom ».
 *
 * Elle est maintenant une TAILLE DU MONDE : vingt-cinq centimètres de plan,
 * comme un bloc de maçonnerie. Elle grandit donc avec le zoom, dans les
 * proportions du dessin — et deux bornes la tiennent : jamais si petite
 * qu'on ne puisse la viser, jamais plus grosse qu'elle ne l'était.
 */
describe('la pastille qui referme un trou', () => {
  it('grandit avec le zoom, dans les proportions du plan', () => {
    // Deux échelles courantes : le plan entier, puis le même zoomé trois
    // fois. La pastille suit — c'est tout l'objet du correctif.
    const large = taillePastilleTrou(60);
    const proche = taillePastilleTrou(180);
    expect(proche).toBeGreaterThan(large);
    // Et elle suit VRAIMENT l'échelle, elle ne fait pas que bouger d'un
    // point : entre les deux, le rapport est celui du zoom, à la borne près.
    expect(proche / large).toBeGreaterThan(1.8);
  });

  it('ne dépasse jamais sa taille d’avant, ni ne devient invisible', () => {
    // Très zoomé : elle s'arrête à trente-quatre — au-delà, c'est elle
    // qu'on regarde au lieu du mur qu'elle referme.
    expect(taillePastilleTrou(2000)).toBe(34);
    // Très dézoomé : elle garde de quoi être vue et visée. Un bouton de
    // six points sur un plan d'appartement ne se touche pas.
    expect(taillePastilleTrou(5)).toBeGreaterThanOrEqual(14);
  });

  it('vaut vingt-cinq centimètres de plan entre les deux bornes', () => {
    // À quatre-vingts pixels le mètre, vingt-cinq centimètres font vingt
    // pixels : la règle est lisible, et c'est elle qu'on relit dans six
    // mois plutôt qu'une table de correspondances.
    expect(taillePastilleTrou(80)).toBe(20);
  });
});

