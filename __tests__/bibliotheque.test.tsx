/**
 * LA BIBLIOTHÈQUE — l'écran qui garde les relevés, et qui n'avait aucun test.
 *
 * Mille lignes, et pas une épreuve : c'est pourtant lui qui liste, ouvre,
 * range et SUPPRIME les scans. Un défaut de suppression y coûte le relevé
 * d'une visite entière, et personne ne s'en aperçoit avant le lendemain.
 *
 * On vérifie donc les quatre gestes qui engagent un dossier : il apparaît, il
 * s'ouvre, il ne se supprime pas d'un doigt qui glisse, et il se supprime pour
 * de bon quand on confirme.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { G, Rect } from 'react-native-svg';
import {
  CHUTE_MS,
  FolderGlyph,
  LibraryScreen,
  teintesDossier,
} from '../src/screens/LibraryScreen';
import { HOLD_MS, prendLeRelevé } from '../src/screens/LibraryScreen';
import { useScanStore, type SavedScan } from '../src/store/scanStore';
import { dark, light } from '../src/theme';
import { SNAPSHOT_WALLS } from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Deux dossiers dans la bibliothèque, comme après deux visites. */
const scan = (id: string, name: string, quand: number): SavedScan => ({
  id,
  name,
  createdAt: quand,
  updatedAt: quand,
  modelPath: '',
  rooms: [{ id: 'r1', name: 'Salon', floor: null }],
  walls: SNAPSHOT_WALLS,
  openings: [],
  objects: [],
  fixtures: [],
  photos: [],
  ceiling: [],
});

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => String(n.props.children));

const boutonQuiDit = (tree: TestRenderer.ReactTestRenderer, mot: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n) =>
      n
        .findAllByType(Text)
        .some((t) => String(t.props.children).includes(mot)),
    );

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (dossiers: { id: string; name: string }[] = []) => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'library',
      saves: [scan('a', 'Chantier Dupont', 2_000), scan('b', 'Chantier Martin', 1_000)],
      folders: dossiers,
      currentSaveId: null,
    });
    tree = TestRenderer.create(<LibraryScreen />);
  });
  arbre = tree;
  return tree;
};

/** La ligne d'un relevé : le bloc qui reçoit le doigt et porte son nom. */
const ligneRow = (tree: TestRenderer.ReactTestRenderer, nom: string) => {
  const n = tree.root
    .findAll(
      (x) =>
        typeof x.props?.onTouchStart === 'function' &&
        x
          .findAllByType(Text)
          .some((t) => String(t.props.children) === nom),
    )
    .pop();
  if (!n) throw new Error(`ligne introuvable : ${nom}`);
  return n;
};

/** Le « … » d'une ligne, reconnu à son etiquette d'accessibilite. */
const boutonsOptions = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .filter((n) => String(n.props.accessibilityLabel ?? '').startsWith('Options'));

/**
 * Un choix de la feuille, trouvé par son libellé.
 *
 * Pas `findAllByType(Pressable)` : ce composant sort d'un `memo` dans cette
 * version de React Native, et le type rendu n'est pas celui qu'on importe.
 * On cherche donc ce qui se comporte comme un choix — un nœud qui répond au
 * doigt et qui porte ce texte.
 */
const choixQuiDit = (tree: TestRenderer.ReactTestRenderer, mot: string) =>
  tree.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        n
          .findAllByType(Text)
          .some((t) => String(t.props.children) === mot),
    )
    .pop();

/** Tous les libelles visibles, feuille comprise. */
const dits = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

describe('la bibliothèque des relevés', () => {
  it('montre les dossiers enregistrés, le plus récent d’abord', () => {
    const tree = monter();
    const vus = textes(tree);
    expect(vus).toContain('Chantier Dupont');
    expect(vus).toContain('Chantier Martin');
    expect(vus.indexOf('Chantier Dupont')).toBeLessThan(
      vus.indexOf('Chantier Martin'),
    );
  });

  it('ouvre un relevé et bascule sur son plan', () => {
    const tree = monter();
    const ligne = boutonQuiDit(tree, 'Chantier Martin');
    expect(ligne).toBeDefined();
    act(() => ligne!.props.onPress());
    const st = useScanStore.getState();
    expect(st.currentSaveId).toBe('b');
    expect(st.screen).toBe('result');
    // Et le plan chargé est bien le sien.
    expect(st.walls.length).toBe(SNAPSHOT_WALLS.length);
  });

  it('n’ouvre plus les options sur un appui long DE RELEVÉ', () => {
    const tree = monter([{ id: 'd1', name: 'Chantier' }]);
    /*
      L'appui long d'un relevé est le geste du RANGEMENT. Tant qu'il ouvrait
      aussi le menu, les deux se disputaient le même doigt : à 420 ms la
      feuille montait, à 500 ms la bulle se levait derrière elle, et le scan
      restait décollé sous une fenêtre.

      Sur un DOSSIER, rien ne se dispute ce geste — un dossier ne se prend
      pas, il reçoit. Il garde donc son appui long, et lui seul : trois
      points sur une tuile de 96 points encombraient la cible qu'on vise
      justement avec un scan au bout du doigt.
    */
    const longs = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n) => n.props.onLongPress !== undefined);
    expect(longs).toHaveLength(1);
    expect(String(longs[0].props.accessibilityLabel)).toContain('Dossier');
    // Et aucun « … » sur les dossiers.
    expect(
      tree.root
        .findAllByType(TouchableOpacity)
        .filter((n) =>
          String(n.props.accessibilityLabel ?? '').startsWith('Options du dossier'),
        ),
    ).toHaveLength(0);
  });

  it('lève la bulle au bout de l’appui, et prend la main sur le glissement', () => {
    const tree = monter([{ id: 'd1', name: 'Chantier' }]);
    const racine = tree.root.findAllByType(View)[0];
    act(() => {
      ligneRow(tree, 'Chantier Dupont').props.onTouchStart({
        nativeEvent: { pageX: 120, pageY: 300 },
      });
    });
    // Avant l'échéance, rien n'est décollé : un appui bref reste un appui.
    expect(dits(tree)).not.toContain('Amenez le scan');
    act(() => {
      jest.advanceTimersByTime(HOLD_MS + 120);
    });
    expect(dits(tree)).toContain('Amenez le scan sur un dossier');
    // Et le glissement lui revient : sans ça la bulle reste collée au doigt
    // sans jamais bouger, c'est la liste qui défile sous elle.
    expect(racine.props.onMoveShouldSetResponder()).toBe(true);
  });

  it('ouvre les options par le « … », et plus par la croix', () => {
    const tree = monter();
    // La croix supprimait en deux appuis, seule au bord de la ligne : un
    // doigt qui glissait l'armait sans le vouloir.
    const croix = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n) => n.props.hitSlop?.left === 6 && !n.props.accessibilityLabel);
    expect(croix).toHaveLength(0);
    const options = boutonsOptions(tree);
    expect(options).toHaveLength(2);
    act(() => options[0].props.onPress());
    const vus = dits(tree);
    expect(vus).toContain('Renommer');
    expect(vus).toContain('Dupliquer');
    expect(vus).toContain('Supprimer');
    // Ouvrir le menu ne supprime rien.
    expect(useScanStore.getState().saves).toHaveLength(2);
  });

  it('supprime le bon relevé depuis le menu', () => {
    const tree = monter();
    act(() => boutonsOptions(tree)[0].props.onPress());
    const supprimer = choixQuiDit(tree, 'Supprimer');
    expect(supprimer).toBeDefined();
    act(() => supprimer!.props.onPress());
    // La feuille joue sa descente avant que l'action parte.
    act(() => {
      jest.advanceTimersByTime(HOLD_MS + 120);
    });
    const restants = useScanStore.getState().saves;
    expect(restants).toHaveLength(1);
    expect(restants[0].name).toBe('Chantier Martin');
  });

  it('lève la bulle DANS un dossier, pour l’en sortir par le haut', () => {
    const tree = monter([{ id: 'd1', name: 'Chantier' }]);
    act(() => {
      useScanStore.setState({
        saves: [{ ...scan('a', 'Chantier Dupont', 2_000), folderId: 'd1' }],
      });
    });
    const tuile = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Dossier'));
    act(() => tuile!.props.onPress());
    act(() => {
      ligneRow(tree, 'Chantier Dupont').props.onTouchStart({
        nativeEvent: { pageX: 120, pageY: 300 },
      });
      jest.advanceTimersByTime(HOLD_MS + 120);
    });
    // Un appui long qui ne produit rien se lit comme une panne. Dedans, la
    // destination n'est pas un autre dossier : c'est la sortie.
    expect(dits(tree)).toContain('Remontez le scan');
  });

  it('propose de sortir un relevé quand on est dans un dossier', () => {
    const tree = monter([{ id: 'd1', name: 'Chantier' }]);
    act(() => {
      useScanStore.setState({
        saves: [
          { ...scan('a', 'Chantier Dupont', 2_000), folderId: 'd1' },
          scan('b', 'Chantier Martin', 1_000),
        ],
      });
    });
    // On entre dans le dossier.
    const tuile = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Dossier'));
    act(() => tuile!.props.onPress());
    act(() => boutonsOptions(tree)[0].props.onPress());
    expect(dits(tree)).toContain('Sortir du dossier');
  });
});

/**
 * LE DOSSIER AVALE LE SCAN — et ça se voit.
 *
 * Un scan lâché sur un dossier disparaissait de la liste : c'est juste, et
 * ça ne se voit pas. On ne sait pas s'il est RANGÉ ou PERDU, et le doute
 * revient à rouvrir le dossier pour vérifier.
 *
 * Le dessin est fait de trois plans — le dos, la feuille, la façade — et
 * c'est la feuille qui tombe entre les deux autres. Ce banc tient la
 * STRUCTURE : sans elle, il n'y a rien à animer.
 */
/**
 * UN DOSSIER SURVOLÉ S'ASSOMBRIT — il ne s'éclaircit pas.
 *
 * La façade passait au ciel (`sky`), un cyan clair : sur fond blanc, la
 * cible de dépôt se DILUAIT au moment précis où elle doit s'affirmer. Le
 * survol fonce donc les deux plans, et c'est la taille qui dit « c'est ici ».
 */
/**
 * UN DOSSIER SURVOLÉ S'ASSOMBRIT — il ne s'éclaircit pas.
 *
 * La façade passait au ciel (`sky`), un cyan clair : sur fond blanc, la
 * cible de dépôt se DILUAIT au moment précis où elle doit s'affirmer. Le
 * survol fonce donc les deux plans, et c'est la taille qui dit « c'est ici ».
 */
/**
 * LE TITRE EST CENTRÉ SUR L'ÉCRAN, PAS SUR CE QUI RESTE.
 *
 * Il vivait dans le flux, entre le bouton de retour et la pastille du
 * nombre de scans : son centre dépendait donc de la largeur de cette
 * pastille — « 3 » ou « 128 » ne donnent pas la même. Le titre bougeait
 * d'un dossier à l'autre, ce qui se voit d'autant mieux qu'il est le seul
 * mot de la ligne.
 */
describe('le dossier visé par un scan', () => {
  const luminance = (hex: string) => {
    const brut = hex.replace('#', '');
    const [r, v, b] = [0, 2, 4].map((i) => parseInt(brut.slice(i, i + 2), 16));
    return 0.2126 * r + 0.7152 * v + 0.0722 * b;
  };

  it('fonce quand le doigt le survole, dans les deux thèmes', () => {
    // Les teintes se DÉRIVENT de la palette : posées en dur, le dossier
    // survolé virait au noir sur fond sombre.
    for (const pal of [light, dark]) {
      const repos = teintesDossier(false, pal);
      const vise = teintesDossier(true, pal);
      expect(luminance(vise.back)).toBeLessThan(luminance(repos.back));
      expect(luminance(vise.front)).toBeLessThan(luminance(repos.front));
    }
  });

  it('reste lisible : la façade tranche sur le dos', () => {
    // Deux plans de la même teinte, et le dossier redevient une tache.
    for (const pal of [light, dark]) {
      for (const vise of [false, true]) {
        const t = teintesDossier(vise, pal);
        expect(Math.abs(luminance(t.front) - luminance(t.back))).toBeGreaterThan(8);
      }
    }
  });
});

describe('le dossier qui reçoit un scan', () => {
  const rendre = (chute: number) => {
    let arbre!: TestRenderer.ReactTestRenderer;
    const v = new Animated.Value(chute);
    act(() => {
      arbre = TestRenderer.create(
        <FolderGlyph back="#1B4FD8" front="#2F6BFF" chute={v} page="#FFFFFF" />,
      );
    });
    return arbre;
  };

  it('a ses trois plans : le dos, la feuille, la façade', () => {
    const arbre = rendre(0);
    // Deux groupes animés : la feuille et la façade. Le dos, lui, ne bouge
    // jamais — c'est ce qui donne la profondeur au geste.
    expect(arbre.root.findAllByType(G).length).toBeGreaterThanOrEqual(2);
    act(() => arbre.unmount());
  });

  /*
    UNE SEULE FEUILLE, C'ÉTAIT UN CLIGNEMENT.

    Elle tombait en 760 ms, et l'œil n'avait rien vu : sur un geste qu'on
    fait au doigt, en regardant AILLEURS — le scan qu'on lâche —, il faut
    que le mouvement dure assez pour être rattrapé du coin de l'œil. Ce sont
    donc trois feuilles qui s'engouffrent, décalées, sur une seconde et
    demie : c'est une liasse qu'on range, et ça se voit.
  */
  it('fait tomber une liasse, pas une feuille', () => {
    const arbre = rendre(0.3);
    // Chaque feuille est un document : un cadre et ses deux lignes.
    const feuilles = arbre.root
      .findAllByType(Rect)
      .filter((n) => n.props.rx === 4);
    expect(feuilles.length).toBeGreaterThanOrEqual(3);
    act(() => arbre.unmount());
  });

  it('prend le temps qu’il faut pour être vue', () => {
    expect(CHUTE_MS).toBeGreaterThanOrEqual(1300);
  });

  it('garde la taille de l’icône qu’on visait déjà', () => {
    const arbre = rendre(0);
    const svg = arbre.root.findAll(
      (n) => n.props?.viewBox === '0 0 72 58',
    );
    // Soixante-douze sur cinquante-huit : la tuile n'a pas bougé d'un point,
    // et la main qui visait le dossier le vise encore.
    expect(svg.length).toBe(1);
    expect(svg[0].props.width).toBe(72);
    expect(svg[0].props.height).toBe(58);
    act(() => arbre.unmount());
  });

  /**
   * LA FEUILLE N'EXISTE QUE PENDANT LA CHUTE.
   *
   * Au repos, un dossier est un dossier : une feuille qui dépasse en
   * permanence dirait qu'il y a quelque chose à finir de ranger.
   */
  it('ne montre la feuille que pendant le geste', () => {
    const opacites = (arbre: TestRenderer.ReactTestRenderer) =>
      arbre.root
        .findAllByType(G)
        .map((n) => n.props.opacity)
        .filter((o) => o !== undefined);
    // `Animated.Value` : on lit la valeur courante via son interpolation.
    const lire = (v: unknown) =>
      typeof v === 'object' && v !== null && '__getValue' in v
        ? (v as { __getValue: () => number }).__getValue()
        : v;
    const repos = rendre(0);
    expect(opacites(repos).map(lire)).toContain(0);
    act(() => repos.unmount());
    const plein = rendre(0.3);
    expect(opacites(plein).map(lire)).toContain(1);
    act(() => plein.unmount());
  });
});

/**
 * LE DOIGT QUI FAIT DÉFILER NE PREND PAS LE RELEVÉ.
 *
 * Relevé du chantier : « les fichiers deviennent des bulles pour le
 * déplacement mais trop facilement, le temps de poser le doigt pour scroll
 * il se cible ». Le compte à rebours de l'appui long démarrait au contact
 * et RIEN ne l'arrêtait : on posait le doigt pour faire défiler la liste,
 * on n'avait pas fini de glisser que la bulle se levait — et le relevé
 * partait en l'air alors qu'on voulait juste voir la suite.
 *
 * Deux réponses, et il faut les deux : le geste a plus de temps pour se
 * déclarer, et un doigt QUI BOUGE renonce à prendre.
 */
describe('prendre un relevé, ou faire défiler', () => {
  it('laisse au geste le temps de se déclarer', () => {
    // Une demi-seconde, c'était le délai d'un appui long ordinaire ; sur
    // une liste qui défile, c'est trop court pour distinguer les deux.
    expect(HOLD_MS).toBeGreaterThanOrEqual(650);
  });

  it('renonce dès que le doigt glisse', () => {
    // Huit points : moins, c'est le tremblement d'une main posée ; plus,
    // c'est une intention de défiler.
    expect(prendLeRelevé({ x: 100, y: 200 }, { x: 102, y: 203 })).toBe(true);
    expect(prendLeRelevé({ x: 100, y: 200 }, { x: 100, y: 214 })).toBe(false);
    expect(prendLeRelevé({ x: 100, y: 200 }, { x: 130, y: 200 })).toBe(false);
  });
});
