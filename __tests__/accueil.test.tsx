/**
 * L'ACCUEIL — ce qu'on montre avant d'avoir scanné quoi que ce soit.
 *
 * Il expliquait l'application en trois lignes : « Scannez, ajustez,
 * explorez ». Trois pictogrammes et neuf mots pour dire ce qu'une seule
 * image montre mieux — le résultat. On ne vend pas un scanner de pièces avec
 * une notice, on le vend avec le plan qui en sort.
 *
 * Ce banc tient trois choses : le mode d'emploi est bien parti, la maquette
 * TOURNE VRAIMENT (une image figée aurait le même arbre, et l'on ne verrait
 * rien), et elle sort du même moteur que la vue 3D de l'app — pas d'un
 * dessin qui promettrait ce que l'application ne fait pas.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    // Le bouton demande l'autorisation de la caméra avant de lancer le scan.
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => null),
    pause: jest.fn(),
    resume: jest.fn(),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Svg, {
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
} from 'react-native-svg';
import { ContourVif } from '../src/components/ContourVif';
import { light } from '../src/theme';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LogoMark } from '../src/components/LogoMark';
import { AvatarGlyph } from '../src/components/AvatarGlyph';
import { Avatar } from '../src/components/Avatar';
import { Quadrillage } from '../src/components/Quadrillage';
import { TraceUnePiece } from '../src/components/TraceUnePiece';
import { ThemeGlyph } from '../src/components/ThemeGlyph';
import { TexteVif } from '../src/components/ContourVif';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';

beforeEach(() => {
  jest.useFakeTimers();
  useScanStore.setState({
    screen: 'home',
    supported: true,
    saves: [],
    brouillon: null,
  });
});
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<HomeScreen />);
  });
  /*
    L'ÉCRAN SE MESURE, DONC LE BANC LE MESURE AUSSI.

    Le quadrillage du fond couvre exactement la surface de l'accueil : il
    attend que celle-ci se soit annoncée. Sans cet appel, il ne se dessine
    jamais — et l'épreuve du papier tomberait en accusant le composant, alors
    que c'est le banc qui n'aurait rien mesuré.
  */
  act(() => {
    /*
      TOUTES LES ZONES QUI SE MESURENT, et pas seulement la première.

      L'écran en a DEUX : le fond, qui porte le quadrillage, et la feuille à
      tracer, qui prend ce qui reste. Ne nourrir que la première laissait la
      seconde à zéro de haut — donc absente — et trois épreuves accusaient le
      composant alors que c'est le banc qui n'avait rien mesuré.
    */
    for (const n of t.root.findAllByType(View)) {
      n.props.onLayout?.({
        nativeEvent: { layout: { width: 342, height: 300 } },
      });
    }
  });
  arbre = t;
  return t;
}

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

// Par son libellé, quel que soit le bouton : l'accueil est passé du
// `GlowButton` à ondes au `Bouton` de la maison, qui ne s'anime que sous
// le doigt.
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      (n.props?.accessibilityLabel ?? n.props?.label) === label,
  )[0];

describe('l’accueil', () => {
  /*
   * LE THÈME A QUITTÉ L'ACCUEIL — et ce banc en garde la trace.
   *
   * Il a longtemps vécu ici, en bas puis en haut à droite, dans une
   * pastille dont la taille et la zone de clic ont été reprises trois fois
   * sur relevé du patron. Rien de tout cela n'était perdu : c'était le
   * signe qu'un RÉGLAGE n'a pas sa place sur l'écran d'arrivée. À portée
   * du pouce qui vise « Commencer le scan », il se déclenche en visant
   * autre chose — et il était le seul réglage de l'application à ne pas
   * vivre avec les autres.
   *
   * Il est maintenant dans la page profil, en trois choix au lieu de deux
   * (Système, Clair, Sombre) : voir `profil.test.tsx`. Ce qui reste vrai
   * ici, c'est l'empilement — ce qui flotte au bandeau se rend EN DERNIER,
   * sinon le bloc héros s'étend par-dessus et avale le toucher.
   */
  it('n’a plus de bouton de thème, et le profil reste au-dessus du héros', () => {
    const t = monter();
    expect(
      t.root.findAll((n) =>
        String(n.props?.accessibilityLabel ?? '').startsWith('Passer en thème'),
      ),
    ).toHaveLength(0);
    expect(t.root.findAllByType(ThemeGlyph)).toHaveLength(0);

    /*
      ET RIEN NE RECOUVRE LE PROFIL — relevé du patron : « le clic ne fait
      rien, sauf à un endroit précis ». Le bloc héros, rendu APRÈS lui,
      s'étendait par-dessus et avalait le toucher partout où il le
      chevauchait. C'est l'ORDRE des frères qui fait l'empilement.
    */
    const bloc = t.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Mon compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    const enfants = bloc.parent!.children.filter(
      (e): e is TestRenderer.ReactTestInstance => typeof e !== 'string',
    );
    const rangHero = enfants.findIndex(
      (n) => n.findAllByType(LogoMark).length > 0,
    );
    const rangProfil = enfants.findIndex(
      (n) => n.props?.accessibilityLabel === 'Mon compte',
    );
    expect(rangHero).toBeGreaterThanOrEqual(0);
    expect(rangProfil).toBeGreaterThan(rangHero);
  });

  /*
   * ET LE BLOC PROFIL OUVRE LA PAGE, plus la carte modale qu'il ouvrait.
   * Le compte a maintenant un ENDROIT : un popup de trois boutons ne
   * pouvait pas porter l'abonnement, l'apparence et les réglages.
   */
  it('mène à la page profil', () => {
    const t = monter();
    const bloc = t.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Mon compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    act(() => bloc.props.onPress());
    expect(useScanStore.getState().screen).toBe('profil');
    useScanStore.setState({ screen: 'home' });
  });

  /*
   * LE PROFIL EST UN BLOC, EN HAUT À GAUCHE — croquis Paint du patron :
   * l'avatar, le nom souligné d'une barre, et le grade centré dessous.
   * GRATUIT s'écrit gris fade ; PRO respire comme sur la page Pro (la
   * typo d'or). Le clic garde le geste de l'ancienne rangée du bas.
   */
  it('porte le compte en haut à droite : un rond, une initiale, pas de nom', () => {
    /*
      Relevé du patron : « l'icône profil et le nom en bleu clair, ça fait
      cheap ». Le nom n'a rien à faire sur l'accueil : on sait qui l'on est.
      Un rond en haut à droite, l'initiale sur un gris doux — c'est le rond
      qu'on reconnaît d'une application à l'autre.
    */
    useAccountStore.setState({
      compte: { id: 'email:j@c.fr', prenom: 'Jérôme', methode: 'email' },
      pro: false,
    });
    const t = monter();
    const bloc = t.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Mon compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    expect(bloc).toBeDefined();
    const st = StyleSheet.flatten(bloc.props.style) as {
      position?: string;
      top?: number;
      right?: number;
      left?: number;
      height?: number;
      paddingHorizontal?: number;
    };
    expect(st.position).toBe('absolute');
    expect(st.top).toBeGreaterThanOrEqual(44);
    expect(typeof st.right).toBe('number');
    expect(st.left).toBeUndefined();
    // Le cadre invisible du clic — relevé du patron : « un clic même autour
    // doit fonctionner » — reste de la vraie surface de toucher.
    expect(st.paddingHorizontal ?? 0).toBeGreaterThanOrEqual(10);
    expect(Number(st.height)).toBeGreaterThanOrEqual(56);
    expect(bloc.findAllByType(Avatar)).toHaveLength(1);
    const lettres = bloc.findAllByType(Text).map((n) => String(n.props.children));
    expect(lettres).toContain('J');
    // Pas de nom, pas de grade, rien qui brille.
    expect(textes(t)).not.toContain('Jérôme');
    expect(bloc.findAllByType(TexteVif)).toHaveLength(0);
    expect(bloc.findAllByType(ContourVif)).toHaveLength(0);
    expect(bloc.findAllByType(SvgLinearGradient)).toHaveLength(0);
    // Tout le bloc prend le clic : l'enfant est transparent au doigt, et
    // rien à l'intérieur ne se dispute le geste.
    expect(bloc.findAll((n) => n.props?.pointerEvents === 'none').length).toBeGreaterThanOrEqual(1);
    expect(bloc.findAll((n) => typeof n.props?.onPress === 'function' && n !== bloc)).toHaveLength(0);
  });

  it('en Pro, rien ne brille sur l’accueil : le grade vit dans la page du compte', () => {
    useAccountStore.setState({
      compte: { id: 'email:j@c.fr', prenom: 'Jérôme', methode: 'email' },
      pro: true,
    });
    const t = monter();
    const bloc = t.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Mon compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    expect(bloc.findAllByType(TexteVif)).toHaveLength(0);
    expect(bloc.findAllByType(ContourVif)).toHaveLength(0);
    expect(bloc.findAllByType(Avatar)[0].props.taille).toBe(38);
    useAccountStore.setState({ pro: false });
  });

  it('sans prénom, l’initiale vient de l’adresse ; sans compte, une silhouette', () => {
    useAccountStore.setState({ compte: { id: 'email:m@c.fr', email: 'marie@c.fr', methode: 'email' } });
    const t = monter();
    const bloc = t.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Mon compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    expect(bloc.findAllByType(Text).map((n) => String(n.props.children))).toContain('M');
    act(() => t.unmount());
    useAccountStore.setState({ compte: null });
    const t2 = monter();
    const b2 = t2.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Mon compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    expect(b2.findAllByType(AvatarGlyph)).toHaveLength(1);
  });

  it('ne récite plus le mode d’emploi', () => {
    const vu = textes(monter());
    for (const mot of ['Scannez', 'Ajustez', 'Explorez']) {
      expect(vu).not.toContain(mot);
    }
    // La promesse, elle, reste : c'est une phrase, pas une notice.
    expect(vu).toContain('en plan coté');
  });

  /*
   * L'IPHONE A QUITTÉ L'ACCUEIL, ET LE PAPIER A PRIS SA PLACE.
   *
   * Relevé du patron : « refais l'accueil, enlève l'iPhone et son animation.
   * L'accueil doit être moderne, avec un design épuré mais bien pensé qui
   * rappelle le but de l'app (architecture, plan). Par exemple pour les
   * boutons, ils seraient dans un quadrillage avec les côtés fondus. »
   *
   * LA MAQUETTE A ÉTÉ UNE BONNE IDÉE, ET ELLE EST DEVENUE UN OBJET DE PLUS.
   * Un téléphone dessiné DANS un téléphone est une mise en abyme qu'on
   * remarque une fois, puis qui encombre : elle prenait la moitié de
   * l'accueil, tournait en boucle, et pesait 1,2 Mo d'images cuites dans
   * l'application. Ce qu'elle racontait — le relevé, l'équipement, le dossier
   * — est raconté mieux, et une seule fois, par la présentation du premier
   * lancement.
   *
   * CE QUI REMPLIT SA PLACE N'EST PAS UN AUTRE OBJET : c'est du VIDE, sur du
   * papier quadrillé.
   */
  it('n’a plus de maquette de téléphone', () => {
    /*
      L'ÉPREUVE DU RELEVÉ, et elle se mesure sur le CODE SOURCE autant que sur
      l'arbre : un composant qu'on cesse d'afficher mais qu'on garde importé
      revient au premier copier-coller, et ses 1,2 Mo d'images avec lui.
    */
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'),
      'utf8',
    );
    expect(src).not.toContain('PhoneShowcase');
    expect(src).not.toContain('SHOWCASE');
  });

  it('mais il porte le PAPIER de l’architecte', () => {
    /*
      C'est le seul motif qui dit le métier sans un mot. Une application qui
      relève des logements n'a pas besoin d'un pictogramme de maison : elle a
      besoin du papier sur lequel on trace — et c'est déjà la trame du sol de
      la vue 3D.
    */
    const t = monter();
    expect(t.root.findAllByType(Quadrillage).length).toBeGreaterThan(0);
    // Et il est vraiment tracé : un quadrillage sans traits est un fond nu.
    expect(
      t.root.findAll((n) => n.props?.testID === 'trait-quadrillage').length,
    ).toBeGreaterThan(10);
  });

  it('et ses côtés se FONDENT, ce qui demande un dégradé', () => {
    /*
      Un quadrillage qui s'arrête net a un BORD, et un bord fait de lui un
      rectangle posé sur l'écran — un objet de plus. Fondu, il devient le
      papier : on ne sait plus où il commence, donc on ne le regarde plus.

      ET LE FONDU EST PORTÉ PAR LE TRAIT. Faire varier l'opacité ligne par
      ligne fond la grille vers le haut et le bas, mais chaque ligne garde ses
      deux bouts francs. Un trait qui se fond sur sa propre longueur demande un
      dégradé — c'est ce qu'on vérifie ici.
    */
    const t = monter();
    const traits = t.root.findAll(
      (n) => n.props?.testID === 'trait-quadrillage',
    );
    expect(traits.length).toBeGreaterThan(0);
    /*
      ON LIT LE NŒUD COMPOSITE, PAS SON HÔTE. `findAll` rend les deux, et
      `react-native-svg` transforme la couleur en objet avant de la passer à
      la vue native : sur l'hôte, on ne lit plus qu'un « [object Object] ».
    */
    const dits = traits
      .map((n) => n.props.stroke)
      .filter((v): v is string => typeof v === 'string');
    expect(dits.length).toBeGreaterThan(0);
    for (const v of dits) expect(v).toMatch(/^url\(#/);
    expect(t.root.findAllByType(SvgLinearGradient).length).toBeGreaterThan(0);
  });

  it('le vide qui reste est VOULU, pas un trou', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Retirer la maquette sans rien mettre à sa
      place ferait remonter les boutons de deux cents points : la marque du
      haut et les portes du bas changeraient d'assiette, et l'on ne
      reconnaîtrait plus l'écran. La place est donc TENUE — c'est le vide qui
      fait l'épuré, et il est déclaré.
    */
    const t = monter();
    const respire = t.root
      .findAllByType(View)
      .map((n) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, number>)
      .filter((st) => st.flex === 1 && typeof st.minHeight === 'number');
    expect(respire.length).toBeGreaterThan(0);
  });

  /*
   * ET LA FEUILLE SERT À TRACER.
   *
   * Relevé du patron : « il y a trop d'espace inutilisé », puis « essaye le
   * tracé ». Le vide arrête d'être un fond : on y dessine sa pièce du doigt.
   *
   * LA RÉPONSE FACILE ÉTAIT D'Y METTRE LES DERNIERS PLANS — et le patron l'a
   * écartée d'une phrase : « il faut penser aux nouveaux qui n'ont pas de
   * plan ». Une idée qui ne marche qu'au bout de trois relevés n'est pas une
   * idée. Ce geste-ci est le même au premier lancement et au centième.
   */
  const feuille = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findByType(TraceUnePiece);

  it('le vide est une feuille sur laquelle on trace', () => {
    expect(monter().root.findAllByType(TraceUnePiece)).toHaveLength(1);
  });

  it('une pièce tracée ouvre un plan QUI LA CONTIENT', () => {
    /*
      C'est ce que le geste raccourcit. « Dessiner un plan » ouvre un plan
      VIDE : il faut ensuite ajouter une pièce, choisir sa taille, la poser —
      deux écrans avant le premier trait. Ici le rectangle est posé dans la
      foulée, et l'on arrive sur SON plan.
    */
    const t = monter();
    act(() => feuille(t).props.onTracee(3, 2.5));
    const st = useScanStore.getState();
    expect(st.screen).toBe('result');
    expect(st.rooms).toHaveLength(1);
    // Quatre murs, aux cotes tracées.
    expect(st.walls).toHaveLength(4);
    const largeurs = st.walls.map((w) =>
      Math.round(Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) * 100) / 100,
    );
    expect(largeurs.sort()).toEqual([2.5, 2.5, 3, 3]);
  });

  it('et le palier gratuit est consulté, comme aux deux autres portes', () => {
    /*
      L'ÉPREUVE QUI COMPTE LE PLUS ICI. Une passe entière a déjà trouvé CINQ
      portes qui créaient un plan sans consulter la règle — trois boutons
      d'étage et deux gestes de copie. Une troisième entrée qui l'oublierait
      rouvrirait exactement ce trou, et personne ne s'en apercevrait avant que
      quelqu'un ne relève dix logements gratuitement.
    */
    act(() => {
      useAccountStore.setState({ pro: false, plansUtilises: 1, surpriseVisible: false });
      useScanStore.getState().reset();
    });
    const t = monter();
    act(() => feuille(t).props.onTracee(3, 2.5));
    // Rien n'a été créé, et c'est l'OFFRE qui s'ouvre — pas un refus.
    expect(useScanStore.getState().rooms).toHaveLength(0);
    expect(useScanStore.getState().screen).not.toBe('result');
    expect(useAccountStore.getState().surpriseVisible).toBe(true);
    /*
      ET L'ON REPOSE LE COMPTEUR — le magasin du compte survit d'une épreuve à
      l'autre, et la maison le sait par cœur. Sans ça, le banc suivant touche
      « Commencer le scan » avec un palier déjà épuisé, tombe sur l'offre au
      lieu du scan, et accuse un écran qui va très bien.
    */
    act(() => {
      useAccountStore.setState({ plansUtilises: 0, surpriseVisible: false });
    });
  });

  it('porte ses deux boutons, et le second seulement s’il y a des scans', () => {
    let t = monter();
    expect(bouton(t, 'Commencer le scan')).toBeDefined();
    expect(bouton(t, 'Mes scans')).toBeUndefined();
    act(() => t.unmount());
    arbre = null;
    useScanStore.setState({
      saves: [
        {
          id: 's1',
          name: 'Chantier',
          date: 1,
          walls: [],
          openings: [],
          objects: [],
          rooms: [],
        } as never,
      ],
    });
    t = monter();
    expect(bouton(t, 'Mes scans')).toBeDefined();
  });

  it('lance le scan au doigt', async () => {
    const t = monter();
    // Le départ demande l'autorisation de la caméra puis ouvre la session :
    // deux promesses avant que l'écran ne change.
    await act(async () => {
      bouton(t, 'Commencer le scan')!.props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('scan');
  });

  /**
   * LE BOUTON RESTE MORT TANT QUE L'APPAREIL N'EST PAS DIT COMPATIBLE.
   *
   * Un contour qui tourne sur un bouton qui ne fera rien est une promesse en
   * l'air : l'animation s'arrête avec lui.
   */
  /*
    IL NE L'ÉTEINT PLUS : IL LE RETIRE.

    Ce banc exigeait que « Commencer le scan » soit là, désactivé. C'était
    la moitié du chemin : un bouton éteint reste le plus gros élément de
    l'écran, et sur un appareil sans LiDAR il annonçait en grand une chose
    impossible, conseil de scan à l'appui. L'application sait pourtant tout
    faire sans caméra — c'est même souvent le chemin le plus court.

    Le scan disparaît donc, « Dessiner un plan » prend sa place et sa
    couleur (voir plus bas), et le refus reste écrit : c'est lui qui
    explique pourquoi.
  */
  it('retire le scan sur un appareil incompatible, et dit pourquoi', () => {
    useScanStore.setState({ supported: false });
    const t = monter();
    expect(bouton(t, 'Commencer le scan')).toBeUndefined();
    expect(textes(t)).toContain('pas compatible');
  });
});
/**
 * « MES SCANS » EST CENTRÉ DANS SON BOUTON.
 *
 * Le mot et la pastille du compte vivaient côte à côte : c'est donc le
 * COUPLE qui se centrait, et le mot se retrouvait poussé à gauche du milieu
 * — d'autant plus loin que le nombre est long. Un bouton dont le texte
 * bouge selon le nombre de scans qu'on possède ne se lit pas comme un
 * bouton.
 *
 * La pastille se pose donc PAR RAPPORT au mot, à son bord droit, et ne pèse
 * plus rien dans le centrage.
 */
describe('le bouton « Mes scans »', () => {
  it('porte son compte à côté du mot, sur la même ligne', () => {
    act(() => {
      useScanStore.setState({
        saves: [{ id: 's1' }, { id: 's2' }] as never,
      });
    });
    const tree = monter();
    const badge = tree.root
      .findAllByType(View)
      .find((n) => n.props.accessibilityLabel === 'Nombre de scans');
    expect(badge).toBeDefined();
    expect(badge!.findAllByType(Text).map((n) => String(n.props.children))).toContain('2');
    /*
      LE COMPTE VIT DANS LE BOUTON, À DROITE DU MOT — plus de pastille posée
      en absolu à « 100 % » : le `Bouton` de la maison aligne le mot et ce
      qu'on lui accroche sur une même rangée centrée, et rien ne dépend de
      la hauteur d'une police.
    */
    const scans = bouton(tree, 'Mes scans')!;
    expect(scans.findAll((n) => n.props?.accessibilityLabel === 'Nombre de scans').length).toBeGreaterThan(0);
    const rangee = scans.findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as { flexDirection?: string; justifyContent?: string } | undefined;
      return st?.flexDirection === 'row' && st?.justifyContent === 'center';
    });
    expect(rangee.length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});

describe('le logo de l’accueil', () => {
  it('donne au glyphe la part du bloc que l’icône lui donne', () => {
    const t = monter();
    const logo = t.root.findByType(LogoMark);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const chemins = logo.findAllByType(Path);
    expect(chemins.length).toBeGreaterThanOrEqual(3);
    for (const p of chemins) {
      const demi = (p.props.strokeWidth ?? 0) / 2;
      // On ne lit que les POINTS D'ANCRAGE (M/L/H/V et l'arrivée des arcs) :
      // rayons et drapeaux d'un « A » ne sont pas des coordonnées.
      const d: string = p.props.d;
      let x = 0;
      let y = 0;
      const re = /([MLHVA])([^MLHVA]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(d))) {
        const nb = (m[2].trim().match(/-?[\d.]+/g) ?? []).map(Number);
        if (m[1] === 'H') x = nb[0];
        else if (m[1] === 'V') y = nb[0];
        else if (m[1] === 'A') {
          x = nb[nb.length - 2];
          y = nb[nb.length - 1];
        } else {
          x = nb[0];
          y = nb[1];
        }
        minX = Math.min(minX, x - demi);
        maxX = Math.max(maxX, x + demi);
        minY = Math.min(minY, y - demi);
        maxY = Math.max(maxY, y + demi);
      }
    }
    // L'icône : boîte de 33 × le zoom de 1,45 → 63 % du bloc de 76.
    expect((maxX - minX) / 76).toBeGreaterThan(0.61);
    expect((maxX - minX) / 76).toBeLessThan(0.66);
    expect((maxY - minY) / 76).toBeGreaterThan(0.61);
    expect((maxY - minY) / 76).toBeLessThan(0.66);
    // Et il est CENTRÉ, comme sur l'icône : marges égales des quatre côtés.
    expect(Math.abs((minX + maxX) / 2 - 38)).toBeLessThan(0.75);
    expect(Math.abs((minY + maxY) / 2 - 38)).toBeLessThan(0.75);
  });
});

/**
 * L'ONDE DU BOUTON PRINCIPAL — l'écho, pas un reflet.
 *
 * Le bouton portait une bande claire qui le traversait toutes les trois
 * secondes. Elle avait le mérite de ne rien coûter (une translation, au fil
 * natif), mais c'est l'animation de n'importe quelle application : un
 * miroitement de carte bancaire, posé sur un bouton blanc où il se voit à
 * peine — relevé du patron : « refais une meilleure animation ».
 *
 * Ce que le bouton fait maintenant, l'application entière le fait déjà :
 * elle s'appelle EchoPlan, son logo émet des ondes à l'ouverture, et son
 * métier est de LIRE une pièce par écho. Le bouton émet donc la même chose
 * — deux anneaux qui naissent à son bord et se dilatent en s'effaçant.
 * C'est la marque qui bouge, pas un effet.
 *
 * Trois propriétés le rendent honnête, et ce banc les tient : les anneaux
 * vivent HORS du corps (qui rogne ce qu'il contient, sinon on ne verrait
 * rien dépasser), ils ne prennent jamais le doigt, et le second bouton de
 * l'accueil n'en a pas — deux choses qui bougent pour un seul geste à
 * faire, et l'œil ne sait plus laquelle est l'importante.
 */
describe('le bouton ne s’anime que sous le doigt', () => {
  /*
    L'ONDE EST PARTIE — relevé du patron : « un style plus "Apple like",
    pur (...) rien ne doit faire vieillot ». Le bouton d'accueil émettait
    deux anneaux en boucle : c'est ce qui vieillit le plus vite dans une
    interface. Il RÉPOND maintenant au doigt — un enfoncement, un ressort —
    et c'est tout.
  */
  const anneaux = (dans: TestRenderer.ReactTestInstance) =>
    dans.findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as
        | { borderColor?: string; position?: string; backgroundColor?: string }
        | undefined;
      return st?.borderColor === light.blue && st?.position === 'absolute' && st?.backgroundColor === undefined;
    });

  it('aucun anneau au repos, sur aucun bouton', () => {
    const t = monter();
    for (const label of ['Commencer le scan', 'Dessiner un plan sans scanner']) {
      const b = bouton(t, label)!;
      expect(b).toBeDefined();
      expect(anneaux(b)).toHaveLength(0);
    }
  });

  it('mais il s’enfonce et revient : les deux gestes du doigt sont branchés', () => {
    const t = monter();
    // Le `Bouton` est un composant ; le doigt, lui, touche sa pressable.
    const scan = bouton(t, 'Commencer le scan')!.findAll(
      (n) => typeof n.props?.onPressIn === 'function',
    )[0];
    expect(scan).toBeDefined();
    expect(typeof scan.props.onPressOut).toBe('function');
    act(() => scan.props.onPressIn());
    act(() => scan.props.onPressOut());
  });

  it('« Vérification… » se dit éteint, tant qu’on ne sait pas si l’appareil sait scanner', () => {
    useScanStore.setState({ supported: null });
    const t = monter();
    const scan = bouton(t, 'Commencer le scan')!;
    expect(scan.props.disabled).toBe(true);
    const pressable = scan.findAll((n) => n.props?.accessibilityState?.disabled === true)[0];
    expect(pressable).toBeDefined();
    useScanStore.setState({ supported: true });
  });
});

describe('l’accueil sur un appareil sans LiDAR', () => {
  const sansLidar = () => {
    useScanStore.setState({ supported: false });
    return monter();
  };

  it('met « Dessiner un plan » en avant, et n’offre plus le scan', () => {
    const t = sansLidar();
    const principal = bouton(t, 'Dessiner un plan sans scanner');
    expect(principal).toBeDefined();
    // Le geste possible porte la couleur ; le scan a disparu, plutôt que de
    // rester en gros et éteint.
    expect(principal!.props.variante).toBe('primaire');
    expect(bouton(t, 'Commencer le scan')).toBeUndefined();
  });

  it('et se tait sur les conseils de scan', () => {
    const vu = textes(sansLidar());
    // « Allumez les lumières et dégagez le centre de la pièce » ne veut
    // plus rien dire quand il n'y a pas de caméra à guider.
    expect(vu).not.toContain('Allumez les lumières');
    // Le refus, lui, reste : il explique POURQUOI le scan n'est pas là.
    expect(vu).toContain('capteur LiDAR');
  });

  it('mais garde tout en place sur un appareil compatible', () => {
    useScanStore.setState({ supported: true });
    const t = monter();
    expect(bouton(t, 'Commencer le scan')).toBeDefined();
    /*
      Le pied de page portait le conseil de scan — « allumez les lumières et
      dégagez le centre de la pièce » — et il ne paraissait que sur un
      appareil capable de scanner. Relevé du patron : c'est la PROMESSE qui
      s'y tient maintenant, et elle ne dépend d'aucun capteur : un appareil
      sans LiDAR dessine son plan au clavier, et la promesse tient toujours.
    */
    expect(textes(t)).toContain('Votre appartement en 3D');
  });
});


/**
 * LE GLYPHE EST DANS LE FOND, IL N'EST PLUS POSÉ DESSUS.
 *
 * Relevé du patron : « sur la page d'accueil, la première image (icône de
 * l'app) est trop visible. Récupère que ce qui est dedans (l'angle et les 3
 * traits d'écho), supprime le fond blanc, et incruste-le dans le fond en
 * faible opacité. Pas de contour rien. »
 *
 * Il occupait le haut de l'accueil en badge blanc cerné d'un liseré, juste
 * au-dessus du logotype : deux fois la même marque l'une sur l'autre, et
 * c'est le badge — le plus bavard des deux — qui passait devant celui qui
 * porte le NOM.
 */
describe('le glyphe incrusté', () => {
  it('n’a plus ni fond blanc ni contour : les tracés, et rien d’autre', () => {
    const logo = monter().root.findByType(LogoMark);
    expect(logo.findAllByType(Rect)).toHaveLength(0);
    // Les trois tracés restent : les deux ondes, et l'angle des murs.
    expect(logo.findAllByType(Path).length).toBeGreaterThanOrEqual(3);
  });

  /*
    L'AVATAR EST NOIR, CERNÉ DE BLEU — relevé du patron : « l'icône de
    l'avatar à l'accueil doit être noire avec un contour bleu ».

    Il se lisait dans le gris des textes secondaires : discret au point de se
    confondre avec le prénom posé à côté, alors que c'est la seule porte de
    l'accueil vers le compte. Le contour est une silhouette DILATÉE, pas un
    filet suivi sur le tracé : un trait sur une forme pleine aurait épaissi
    les trois lignes de la fiche jusqu'à les souder.

    « Noir », c'est l'encre du THÈME : un noir en dur disparaîtrait sur un
    fond sombre, et l'icône n'y serait plus qu'un contour bleu vide.
  */
  it('sans compte, la silhouette porte l’encre douce du thème, un seul tracé, sans cerne', () => {
    /*
      TROIS HABITS EN TROIS RELEVÉS, puis le rond. Le gris, l'encre cernée
      de bleu, l'encre seule — et maintenant un rond en haut à droite,
      l'initiale dedans (voir « porte le compte en haut à droite »). La
      silhouette ne sert plus qu'à qui n'a pas de compte : un seul tracé, à
      l'encre douce du THÈME — un noir en dur disparaîtrait sur fond sombre.
    */
    useAccountStore.setState({ compte: null });
    const t = monter();
    const avatar = t.root
      .findAll(
        (n) => n.props?.accessibilityLabel === 'Mon compte' &&
          typeof n.props?.onPress === 'function',
      )[0]
      .findByType(AvatarGlyph);
    expect(avatar.props.teinte).toBe(light.inkSoft);
    const traces = avatar.findAllByType(Path);
    expect(traces).toHaveLength(1);
    expect(traces[0].props.fill).toBe(light.inkSoft);
    expect(traces[0].props.stroke).toBeUndefined();
  });

  it('et se lit EN RETRAIT : on le sent, on ne le lit pas', () => {
    const logo = monter().root.findByType(LogoMark);
    expect(Number(logo.findByType(Svg).props.opacity)).toBeLessThanOrEqual(0.12);
  });

  it('posé en absolu : une incrustation ne pousse rien', () => {
    const t = monter();
    const logo = t.root.findByType(LogoMark);
    let n: TestRenderer.ReactTestInstance | null = logo.parent;
    let absolu = false;
    while (n && !absolu) {
      const st = StyleSheet.flatten(n.props?.style) as { position?: string };
      if (st?.position === 'absolute') absolu = true;
      if (n.type === HomeScreen) break;
      n = n.parent;
    }
    expect(absolu).toBe(true);
  });
});

/**
 * LE HÉROS DESCEND, ET LA PHRASE PART EN PIED DE PAGE.
 *
 * Relevé du patron : « sur l'accueil, descends le logo EchoPlan, et l'icône
 * qu'on vient de modifier avec, en suivant la même descente. Supprime le
 * texte sous le logo (votre appartement…), intègre-le en bas de page à la
 * place de "allumez les lumières", etc. »
 *
 * Le bloc d'accueil était collé sous la barre du haut, et il portait trois
 * choses : le glyphe, le mot, et la promesse. Le mot se retrouvait au
 * milieu d'un sandwich, et la promesse — ce qu'on VEND — se lisait en gris
 * clair juste sous lui, là où l'œil est encore occupé par la marque.
 *
 * Elle descend en pied de page, à la place du conseil de scan : c'est la
 * dernière chose qu'on lit avant de toucher le bouton, et c'est là qu'une
 * promesse a sa place. Le glyphe, lui, est DANS le bloc — il descend donc
 * avec lui, sans qu'on ait à le descendre séparément.
 */
describe('le bloc d’accueil descendu', () => {
  /** Le bloc de la marque : le plus PROCHE ancêtre du glyphe qui porte
   *  aussi le logotype — la page entière les contient tous les deux. */
  const hero = (t: TestRenderer.ReactTestRenderer) => {
    let n: TestRenderer.ReactTestInstance | null = t.root.findByType(LogoMark)
      .parent;
    while (n) {
      if (n.findAllByType(Image).length > 0) return n;
      n = n.parent;
    }
    return null;
  };

  it('descend d’un cran sous la barre du haut', () => {
    const bloc = hero(monter());
    expect(bloc).toBeDefined();
    const st = StyleSheet.flatten(bloc!.props.style) as { marginTop?: number };
    expect(Number(st.marginTop ?? 0)).toBeGreaterThanOrEqual(24);
  });

  it('et le glyphe descend avec lui : il vit dedans', () => {
    const bloc = hero(monter());
    expect(bloc!.findAllByType(LogoMark)).toHaveLength(1);
  });

  it('la promesse a quitté le dessous du logo pour le pied de page', () => {
    const t = monter();
    const vu = textes(t);
    expect(vu).toContain('Votre appartement en 3D');
    // Elle n'est plus dans le bloc de la marque.
    const dansLeHero = hero(t)!
      .findAllByType(Text)
      .map((x) => String(x.props.children))
      .join(' | ');
    expect(dansLeHero).not.toContain('Votre appartement');
  });

  /*
    LE CONSEIL DE SCAN S'EN VA AVEC ELLE.

    « Allumez les lumières et dégagez le centre de la pièce » a occupé ce
    pied de page pendant plusieurs versions — c'est un bon conseil de
    chantier, mais il vient trop tôt : on le lit sur l'accueil, on scanne
    dix minutes plus tard. La promesse, elle, se lit juste avant d'appuyer.
  */
  it('et le conseil de scan a quitté l’accueil', () => {
    expect(textes(monter())).not.toContain('Allumez les lumières');
  });
});
