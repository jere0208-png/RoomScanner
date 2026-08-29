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

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Svg, { LinearGradient, Path, Rect } from 'react-native-svg';
import { ContourVif } from '../src/components/ContourVif';
import { light } from '../src/theme';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LogoMark } from '../src/components/LogoMark';
import { AvatarGlyph } from '../src/components/AvatarGlyph';
import {
  BALANCEMENT,
  PERIODE,
  PhoneShowcase,
} from '../src/components/PhoneShowcase';
import { GlowButton } from '../src/components/GlowButton';
import { ThemeGlyph } from '../src/components/ThemeGlyph';
import { TexteVif } from '../src/components/ContourVif';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { SHOWCASE_IMAGES } from '../src/assets/showcase';
import { IPS, SHOWCASE_FRAMES } from '../src/export/showcaseFrames';

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

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root
    .findAllByType(GlowButton)
    .find((n) => (n.props.accessibilityLabel ?? n.props.label) === label);

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
  it('porte le profil en haut à gauche : avatar, nom souligné, grade', () => {
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
      left?: number;
    };
    expect(st.position).toBe('absolute');
    expect(typeof st.top).toBe('number');
    expect(typeof st.left).toBe('number');
    /*
      L'AVATAR EST UN ROND QUI RESPIRE, plus une silhouette pleine.

      Relevé du patron, lien à l'appui : « utilise cette icône pour l'avatar
      à l'accueil et enlève le contour présent ». C'est un « user-circle »
      duotone de Phosphor — deux tracés, dont un en retrait. Le reste de
      l'app garde le jeu Solar : l'avatar n'est pas un outil, c'est une
      porte vers le compte.
    */
    expect(bloc.findAllByType(AvatarGlyph)).toHaveLength(1);
    const vu = textes(t);
    expect(vu).toContain('Jérôme');
    /*
      L'AVATAR ET LE PRÉNOM, RIEN D'AUTRE — relevé du patron : la barre
      est partie, le grade écrit aussi. En gratuit, le prénom se lit GRIS
      et rien ne brille ; c'est le Pro qui s'anime, et lui seul.
    */
    expect(vu).not.toContain('GRATUIT');
    expect(bloc.findAllByType(LinearGradient)).toHaveLength(0);
    expect(bloc.findAllByType(ContourVif)).toHaveLength(0);
    const nomGris = bloc
      .findAllByType(Text)
      .find((n) =>
        (Array.isArray(n.props.children)
          ? n.props.children.join('')
          : String(n.props.children)
        ).includes('Jérôme'),
      );
    expect(nomGris).toBeDefined();
    const stNom = StyleSheet.flatten(nomGris!.props.style) as {
      color?: string;
      fontWeight?: string;
    };
    expect(stNom.color).toBe(light.inkSoft);
    // Moins gras — relevé du patron : le prénom n'est pas un titre.
    expect(Number(stNom.fontWeight)).toBeLessThanOrEqual(600);
    /*
      LE BLOC RESTE POSÉ EN HAUT, PAS COLLÉ AU BORD — relevé du patron :
      « le clic doit être fait un peu au-dessus pour que ça fonctionne ».
      Il partageait sa ligne avec le bouton de thème, et les deux étaient
      alignés par construction ; le thème est parti dans la page profil,
      le profil garde sa hauteur — c'est celle qui a été réglée sur le
      chantier, elle n'a pas de raison de bouger parce que son voisin s'en
      est allé.
    */
    const stBloc = StyleSheet.flatten(bloc.props.style) as { top?: number };
    expect(stBloc.top).toBeGreaterThanOrEqual(44);
    /*
      LE CADRE INVISIBLE DU PROFIL — relevé du patron : « un clic même
      autour doit fonctionner ». Le rembourrage vit DANS le bouton :
      c'est de la vraie surface de toucher.
    */
    const stCadre = StyleSheet.flatten(bloc.props.style) as {
      paddingHorizontal?: number;
      height?: number;
    };
    expect(stCadre.paddingHorizontal ?? 0).toBeGreaterThanOrEqual(10);
    expect(Number(stCadre.height)).toBeGreaterThanOrEqual(56);
    /*
      TOUT LE BLOC PREND LE CLIC — avatar, nom, barre, grade. Une vue SVG
      avale le toucher si on la laisse faire : les enfants directs du
      bouton sont donc transparents au doigt, et rien à l'intérieur ne
      se dispute le geste.
    */
    expect(
      bloc.findAll((n) => n.props?.pointerEvents === 'none').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      bloc.findAll(
        (n) => typeof n.props?.onPress === 'function' && n !== bloc,
      ).length,
    ).toBe(0);
  });

  it('en Pro, le prénom s’anime en couleurs et l’avatar reste nu', () => {
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
    // Le prénom respire dans la typo d'or…
    const typos = bloc.findAllByType(TexteVif);
    expect(typos).toHaveLength(1);
    expect(typos[0].props.texte).toBe('Jérôme');
    /*
      …ET L'AVATAR NE SE CERCLE PLUS DE RIEN.

      L'anneau d'or a cerclé l'avatar en Pro le temps de deux versions — le
      grade se voyait au lieu de s'écrire. Relevé du patron, en même temps
      que le changement d'icône : « enlève le contour présent ». Le grade se
      voit toujours, à côté : c'est le prénom qui porte la typo d'or, et
      l'avatar redevient une porte vers le compte, pas un blason.
    */
    expect(bloc.findAllByType(ContourVif)).toHaveLength(0);
    expect(bloc.findAllByType(AvatarGlyph)).toHaveLength(1);
    // Et le prénom doré s'allège comme le gris.
    const typoNom = bloc.findAllByType(TexteVif)[0];
    expect(Number(typoNom.props.graisse)).toBeLessThanOrEqual(600);
    useAccountStore.setState({ pro: false });
  });

  /*
   * L'AVATAR GARDE SA TAILLE — relevé du patron : « agrandis légèrement le
   * bouton profil ». Il l'avait prise pour égaler la pastille du thème, qui
   * vivait à sa droite : deux ronds inégaux sur la même ligne se lisaient
   * comme un accident. Le thème est parti dans la page profil ; la taille,
   * elle, reste — c'est celle qu'on a réglée en la regardant, et un avatar
   * qui rétrécirait au départ de son voisin serait une régression que
   * personne n'a demandée.
   */
  it('garde l’avatar à la taille réglée, en Pro comme en gratuit', () => {
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
    /*
      L'avatar Pro se lisait en 36 dans son anneau d'or ; l'anneau est parti
      — « enlève le contour présent » — et c'est le glyphe lui-même qui
      porte la taille, la MÊME dans les deux grades. Un avatar qui change de
      taille avec l'abonnement ferait sauter la barre du haut à chaque
      renouvellement.
    */
    expect(bloc.findAllByType(AvatarGlyph)[0].props.size).toBe(34);
    // En gratuit, l'avatar nu suit le mouvement : lui aussi a grandi.
    // Le premier arbre se démonte AVANT le second : deux accueils vivants
    // à la fois, et leurs animations se disputent les minuteries sans fin.
    act(() => t.unmount());
    useAccountStore.setState({ pro: false });
    const t2 = monter();
    const bloc2 = t2.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Mon compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    // En gratuit, le MÊME glyphe et la même taille : rien ne distingue plus
    // les deux grades sur l'avatar — c'est le prénom qui les distingue.
    expect(bloc2.findAllByType(AvatarGlyph)[0].props.size).toBe(34);
  });

  it('ne récite plus le mode d’emploi', () => {
    const vu = textes(monter());
    for (const mot of ['Scannez', 'Ajustez', 'Explorez']) {
      expect(vu).not.toContain(mot);
    }
    // La promesse, elle, reste : c'est une phrase, pas une notice.
    expect(vu).toContain('en plan coté');
  });

  it('montre le logement, image par image', () => {
    const t = monter();
    expect(t.root.findAllByType(PhoneShowcase)).toHaveLength(1);
    // Toutes les images sont montées d'emblée : les charger une par une
    // ferait sauter la première boucle.
    expect(
      t.root.findByType(PhoneShowcase).findAllByType(Image),
    ).toHaveLength(SHOWCASE_IMAGES.length);
  });

  /**
   * LES IMAGES CUITES SUIVENT LE SCÉNARIO.
   *
   * Elles sont calculées au build : si quelqu'un change le scénario sans
   * relancer `npm run showcase`, l'accueil joue l'ancienne animation et rien
   * ne le dit. Le compte, lui, le dit.
   */
  it('a autant d’images que le scénario en demande', () => {
    expect(SHOWCASE_IMAGES).toHaveLength(SHOWCASE_FRAMES);
  });

  /**
   * ET ELLE TOURNE.
   *
   * Une maquette figée aurait exactement le même arbre au premier rendu :
   * seule la comparaison dans le temps prouve le mouvement.
   */
  it('déroule l’animation toute seule, et en boucle', () => {
    const t = monter();
    /**
     * L'image visible : la seule de la VITRINE dont l'opacité n'est pas
     * nulle. On cherche dans la vitrine et non dans l'écran entier — le
     * logotype de la marque est une image lui aussi, et il passait devant.
     */
    const visible = () =>
      t.root
        .findByType(PhoneShowcase)
        .findAllByType(Image)
        .findIndex((n) => {
          const st = Array.isArray(n.props.style)
            ? Object.assign({}, ...n.props.style.filter(Boolean))
            : n.props.style;
          return (st?.opacity ?? 1) !== 0;
        });
    expect(visible()).toBe(0);
    act(() => jest.advanceTimersByTime(500));
    const apres = visible();
    expect(apres).toBeGreaterThan(0);
    // Elle boucle : après un cycle complet, on est revenu au plan.
    act(() => jest.advanceTimersByTime(PERIODE * SHOWCASE_FRAMES));
    expect(visible()).toBe(apres);
  });

  /*
   * LE BOÎTIER EST UN OBJET, PAS UN CADRE AUTOUR D’UNE IMAGE.
   *
   * Relevé du patron : « l'animation de l'iPhone et de son écran ne me
   * convainc pas, on dirait un truc bas de gamme. Je veux quelque chose de
   * dynamique, rapide, fluide, JS style. Un vrai art style. »
   *
   * Le dedans de l'écran a été refait ailleurs. Le BOÎTIER, lui, était un
   * rectangle sombre avec un liséré, une diagonale claire FIXE en guise de
   * reflet, et une rotation lente. Un objet plat. Ces bancs tiennent les
   * quatre couches vivantes qui le remettent debout — et surtout le fait
   * qu'elles soient ANIMÉES : un nombre écrit en dur à leur place passerait
   * toutes les épreuves de structure sans que rien ne bouge à l'écran.
   */
  const vitrine = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findByType(PhoneShowcase);
  /** Les styles à plat d'un nœud, sans résoudre les valeurs animées. */
  const couches = (n: { props: { style?: unknown } }) =>
    (Array.isArray(n.props.style) ? n.props.style : [n.props.style]).filter(
      Boolean,
    ) as Record<string, unknown>[];

  it('la vitrine porte sa lueur, son étalonnage et son reflet', () => {
    /*
      TROIS COUCHES VECTORIELLES, ET DEUX D'ENTRE ELLES ÉTAIENT CUITES DANS
      LES IMAGES. La lueur du fond et le vignettage y pesaient 480 ko — un
      dégradé lisse est le pire ennemi d'une palette réduite. Posés ici, ils
      sont plus lisses, gratuits, et ils peuvent bouger.
    */
    const dessins = vitrine(monter()).findAllByType(Svg);
    expect(dessins.length).toBeGreaterThanOrEqual(3);
  });

  it('le boîtier FLOTTE et tourne, sur deux horloges différentes', () => {
    /*
      DEUX MOUVEMENTS DE MÊME PÉRIODE se lisent comme UN mouvement, et un
      mouvement qui se répète toutes les quatre secondes se remarque. Le
      flottement a donc sa propre horloge, volontairement bancale : les deux
      ne retombent en phase qu'au bout de vingt-six secondes.

      On lit les transformations SANS les aplatir : `StyleSheet.flatten`
      résout une valeur animée en son nombre du moment, et un boîtier qui
      tourne y ressemblerait à un boîtier figé.
    */
    const transformes = vitrine(monter())
      .findAll((n) => couches(n).some((c) => Array.isArray(c.transform)))
      .flatMap((n) =>
        couches(n).flatMap(
          (c) => (c.transform ?? []) as Record<string, unknown>[],
        ),
      );
    const anime = (cle: string) =>
      transformes.filter(
        (x) => cle in x && typeof x[cle] === 'object' && x[cle] !== null,
      );
    // La rotation du boîtier, et sa montée : les deux sont des valeurs
    // animées, pas des nombres écrits en dur.
    expect(anime('rotateY').length).toBeGreaterThanOrEqual(1);
    expect(anime('translateY').length).toBeGreaterThanOrEqual(1);
    // Et le reflet TRAVERSE la dalle.
    expect(anime('translateX').length).toBeGreaterThanOrEqual(1);
  });

  it('et le reflet suit la ROTATION, il n’a pas d’horloge à lui', () => {
    /*
      C'EST TOUT LE POINT. Sur un objet qui tourne, ce qui trahit le faux
      n'est pas l'absence de reflet, c'est un reflet qui ne réagit pas — et
      l'ancien dessin posait une diagonale claire immobile.

      Les deux valeurs viennent de la même animation : l'amplitude du reflet
      est donc solidaire de celle du boîtier par construction, et l'on ne peut
      pas les désynchroniser en réglant l'une sans l'autre. Le contrôle tient
      ça : la rotation reste un balancement FAIBLE — six degrés —, sans quoi
      le dessin qu'on lit changerait de place à chaque tour.
    */
    expect(BALANCEMENT).toBeLessThanOrEqual(8);
  });

  it('le téléphone les joue à la cadence pour laquelle elles sont cuites', () => {
    /*
      LES DEUX NOMBRES VIVENT DANS DEUX FICHIERS, et rien ne les tenait
      ensemble : la cuisson calcule les images pour `IPS`, le flipbook les
      feuillette toutes les `PERIODE` millisecondes. Réglés séparément, le
      cycle ne dure plus les cinq secondes annoncées — et personne ne le voit,
      parce que ça reste une jolie animation, simplement trop lente.

      QUINZE IMAGES PAR SECONDE, C'ÉTAIT LE DÉFAUT. On peut lisser une
      trajectoire autant qu'on veut : à quinze, l'œil sépare encore les poses
      d'un mouvement rapide, et c'est ce hachage-là qui se lit comme du bas de
      gamme.
    */
    expect(Math.round(1000 / PERIODE)).toBe(IPS);
    expect(IPS).toBeGreaterThanOrEqual(24);
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
  it('centre son mot, la pastille accrochée à côté', () => {
    // La pastille n'existe qu'avec des relevés à compter.
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
    /*
      ET ELLE EST CENTRÉE SUR LA LIGNE DU MOT.

      Premier jet : la pastille était posée à « 50 % de haut, moins la
      moitié de sa hauteur ». Deux approximations qui s'ajoutent — le
      pourcentage se prend sur la boîte du texte, dont la hauteur dépend de
      l'interligne de la police du téléphone, et la demi-hauteur de la
      pastille était écrite en dur. Elle tombait sous la ligne.

      Un cadre qui occupe TOUTE la hauteur du mot et centre son contenu ne
      dépend d'aucun chiffre : c'est la seule façon que ça tienne d'un
      appareil à l'autre.
    */
    const cadre = badge!.parent!;
    const st = (Array.isArray(cadre.props.style)
      ? Object.assign({}, ...cadre.props.style.filter(Boolean))
      : cadre.props.style) as {
      position?: string;
      left?: string;
      top?: number;
      bottom?: number;
      justifyContent?: string;
    };
    expect(st.position).toBe('absolute');
    expect(st.left).toBe('100%');
    expect(st.top).toBe(0);
    expect(st.bottom).toBe(0);
    expect(st.justifyContent).toBe('center');
    act(() => tree.unmount());
  });
});

/**
 * LE GLYPHE REMPLIT SON BLOC COMME SUR L'ICÔNE DU TÉLÉPHONE.
 *
 * Le logo de l'accueil et l'icône iOS sont le même dessin, mais l'icône
 * l'agrandit de 1,45 autour du centre (`ZOOM` de tools/gen-icons.mjs) : posés
 * côte à côte, le bloc de l'accueil semblait porter un glyphe de timbre-poste.
 * On mesure ici la boîte des tracés, traits compris, dans le repère 76 du
 * bloc — le même chiffre que l'icône, pour le même œil.
 */
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
describe('l’onde du bouton principal', () => {
  const anneaux = (t: TestRenderer.ReactTestRenderer, dans: unknown) =>
    (dans as TestRenderer.ReactTestInstance).findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as
        | {
            borderColor?: string;
            borderRadius?: number;
            position?: string;
            backgroundColor?: string;
          }
        | undefined;
      // Le CORPS du bouton porte lui aussi un bord bleu et une échelle (son
      // enfoncement) : ce qui distingue un anneau, c'est qu'il est posé en
      // absolu et qu'il ne peint rien — il n'est que du contour.
      return (
        st?.borderColor === light.blue &&
        st?.position === 'absolute' &&
        st?.backgroundColor === undefined &&
        typeof st?.borderRadius === 'number' &&
        Array.isArray((st as { transform?: unknown[] }).transform)
      );
    });

  it('émet deux anneaux, décalés, transparents au doigt', () => {
    const t = monter();
    const scan = t.root
      .findAllByType(GlowButton)
      .find((n) => n.props.accessibilityLabel === 'Commencer le scan')!;
    const ondes = anneaux(t, scan);
    // Deux, pas un : une onde seule bat comme un clignotant ; deux, décalées,
    // se lisent comme une propagation.
    expect(ondes.length).toBeGreaterThanOrEqual(2);
    for (const o of ondes) {
      expect(o.props.pointerEvents).toBe('none');
      // Chacune se dilate ET s'efface : un anneau qui grandit sans pâlir
      // finit en cadre posé autour du bouton.
      const st = StyleSheet.flatten(o.props.style) as {
        transform: Record<string, unknown>[];
        opacity?: unknown;
      };
      // Le rendu de test résout les valeurs animées à leur instant zéro :
      // ce qu'on tient ici, c'est que les deux LEVIERS sont branchés —
      // l'échelle et l'opacité. Que la boucle qui les pousse soit native et
      // sans fin, c'est `batterie.test.tsx` qui le prouve.
      expect(st.transform.some((x) => 'scale' in x)).toBe(true);
      expect(st.opacity).toBeDefined();
    }
  });

  it('les laisse hors du corps, qui rogne ce qu’il porte', () => {
    const t = monter();
    const scan = t.root
      .findAllByType(GlowButton)
      .find((n) => n.props.accessibilityLabel === 'Commencer le scan')!;
    for (const o of anneaux(t, scan)) {
      let p = o.parent;
      while (p) {
        const st = StyleSheet.flatten(p.props?.style) as
          | { overflow?: string }
          | undefined;
        // Un anneau qui déborde ne déborde que si rien ne le coupe.
        expect(st?.overflow).not.toBe('hidden');
        if (p.type === GlowButton) break;
        p = p.parent;
      }
    }
  });

  it('n’en donne pas au second bouton, ni au bouton éteint', () => {
    const t = monter();
    const dessiner = t.root
      .findAllByType(GlowButton)
      .find((n) => n.props.label === 'Dessiner un plan')!;
    expect(anneaux(t, dessiner)).toHaveLength(0);

    /*
      ET LE BOUTON « VÉRIFICATION… » NON PLUS, tant qu'on ne sait pas si
      l'appareil sait scanner : il n'invite à rien, l'animer serait mentir.
      (Sur un appareil incompatible, le bouton n'existe simplement plus.)
    */
    act(() => t.unmount());
    useScanStore.setState({ supported: null });
    const attente = monter();
    const scan = attente.root
      .findAllByType(GlowButton)
      .find((n) => n.props.accessibilityLabel === 'Commencer le scan')!;
    expect(anneaux(attente, scan)).toHaveLength(0);
    useScanStore.setState({ supported: true });
  });
});

/**
 * SUR UN APPAREIL SANS LiDAR, L'ACCUEIL PROPOSE CE QU'ON PEUT FAIRE.
 *
 * Trouvé en parcourant l'application comme un utilisateur qui la découvre,
 * sur le téléphone le plus courant — un iPhone qui n'est pas « Pro ».
 * L'écran affichait le refus (« cet appareil n'est pas compatible »), et
 * gardait pourtant « Commencer le scan » en bouton PRINCIPAL, éteint, avec
 * un conseil de scan en pied de page : « allumez les lumières et dégagez le
 * centre de la pièce ». Trois éléments sur quatre parlaient d'une chose
 * impossible.
 *
 * Or l'application sait tout faire sans caméra — plan, normes, métré,
 * dossier — et c'est même souvent le chemin le plus court. Sur un appareil
 * sans LiDAR, « Dessiner un plan » devient donc le geste principal, le scan
 * s'efface, et le conseil se tait.
 */
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
    expect(principal!.props.variant).toBe('primary');
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
  it('porte l’encre du thème, et plus aucun cerne', () => {
    /*
      TROIS HABITS EN TROIS RELEVÉS, ET C'EST LE TROISIÈME QUI TIENT.

        1. le GRIS des textes secondaires — discrète au point de se confondre
           avec le prénom posé à côté, alors que c'est la seule porte de
           l'accueil vers le compte ;
        2. l'ENCRE DU THÈME CERNÉE DE BLEU — « l'icône de l'avatar à
           l'accueil doit être noire avec un contour bleu » ; le cerne était
           une silhouette DILATÉE et non un filet suivi, car un trait posé
           sur une forme pleine aurait soudé les trois lignes de la fiche ;
        3. l'ENCRE SEULE — « enlève le contour bleu de l'avatar sur
           l'accueil ».

      Ce banc garde les trois, parce qu'un jour quelqu'un se demandera
      pourquoi cette icône se peint en UN tracé quand deux seraient si
      commodes pour la cerner. Ce qu'on vérifie aujourd'hui : un seul tracé,
      à l'encre du THÈME — un noir en dur disparaîtrait sur fond sombre.
    */
    const t = monter();
    const avatar = t.root
      .findAll(
        (n) => n.props?.accessibilityLabel === 'Mon compte' &&
          typeof n.props?.onPress === 'function',
      )[0]
      .findByType(AvatarGlyph);
    expect(avatar.props.teinte).toBe(light.ink);
    const traces = avatar.findAllByType(Path);
    expect(traces).toHaveLength(1);
    expect(traces[0].props.fill).toBe(light.ink);
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
