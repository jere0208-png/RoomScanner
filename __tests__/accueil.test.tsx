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
import { LinearGradient, Path } from 'react-native-svg';
import { ContourOr } from '../src/components/ContourOr';
import { light } from '../src/theme';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LogoMark } from '../src/components/LogoMark';
import { PhoneShowcase } from '../src/components/PhoneShowcase';
import { GlowButton } from '../src/components/GlowButton';
import { ThemeGlyph } from '../src/components/ThemeGlyph';
import { TexteOr } from '../src/components/ContourOr';
import { SOLAIRES } from '../src/ui/solaires';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { SHOWCASE_IMAGES } from '../src/assets/showcase';
import { SHOWCASE_FRAMES } from '../src/export/showcaseFrames';

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
   * LE SOLEIL ET LA LUNE SE VOIENT — relevé du patron : « grossis la lune
   * et le soleil du bouton thème ». Le glyphe faisait 21 points dans une
   * pastille de 46 : moins de la moitié, un pictogramme timide à côté des
   * autres. Il en fait 27 — grand dans sa pastille, sans la toucher.
   */
  it('porte un glyphe de thème en grand dans sa pastille', () => {
    const t = monter();
    const pastille = t.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Passer en thème'),
    )[0];
    expect(pastille).toBeDefined();
    const glyphe = pastille.findAllByType(ThemeGlyph)[0];
    expect(glyphe).toBeDefined();
    expect(glyphe.props.size ?? 21).toBeGreaterThanOrEqual(26);
    // Et c'est la lune SOLAR (fiche désignée par le patron) : le glyphe
    // vient du même jeu que toutes les icônes des menus.
    expect(
      glyphe.findAllByType(Path).filter((n) => n.props.d === SOLAIRES.lune)
        .length,
    ).toBe(1);
    /*
      LA CIBLE EST UNE VRAIE ZONE, PAS UN DÉBORD — relevé du patron, deux
      fois : « le clic ne fait rien, sauf à un endroit précis ». Le
      `hitSlop` ne porte que dans les limites du parent ; le bouton est
      donc un carré invisible d'au moins 56 points, et la pastille blanche
      de 40 au plus n'est que le dessin en son centre.
    */
    const stZone = StyleSheet.flatten(pastille.props.style) as {
      width?: number;
      height?: number;
    };
    expect(stZone.width).toBeGreaterThanOrEqual(56);
    expect(stZone.height).toBeGreaterThanOrEqual(56);
    const pastilleBlanche = pastille.findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as
        | { width?: number; borderRadius?: number }
        | undefined;
      return (
        typeof st?.width === 'number' &&
        st.width <= 42 &&
        (st.borderRadius ?? 0) >= 18
      );
    });
    expect(pastilleBlanche.length).toBeGreaterThan(0);
    /*
      ET RIEN NE LE RECOUVRE — relevé du patron : « le clic ne fait rien,
      sauf à un endroit précis en bas à droite ». Le bloc héros, rendu
      APRÈS lui, s'étendait par-dessus et avalait le toucher partout où il
      le chevauchait. Ce qui flotte au bandeau se rend donc EN DERNIER :
      dans l'arbre, la pastille du thème et le bloc profil viennent après
      le héros — c'est l'ordre qui fait l'empilement.
    */
    // Le conteneur est le parent direct de la pastille : c'est SES
    // enfants qui s'empilent.
    const conteneur = pastille.parent!;
    const enfants = conteneur.children.filter(
      (e): e is TestRenderer.ReactTestInstance => typeof e !== 'string',
    );
    const rangHero = enfants.findIndex(
      (n) => n.findAllByType(LogoMark).length > 0,
    );
    const rangTheme = enfants.findIndex((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Passer en thème'),
    );
    expect(rangHero).toBeGreaterThanOrEqual(0);
    expect(rangTheme).toBeGreaterThan(rangHero);
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
    // L'avatar est la silhouette Solar du jeu commun.
    expect(
      bloc.findAllByType(Path).filter((n) => n.props.d === SOLAIRES.avatar)
        .length,
    ).toBe(1);
    const vu = textes(t);
    expect(vu).toContain('Jérôme');
    /*
      L'AVATAR ET LE PRÉNOM, RIEN D'AUTRE — relevé du patron : la barre
      est partie, le grade écrit aussi. En gratuit, le prénom se lit GRIS
      et rien ne brille ; c'est le Pro qui s'anime, et lui seul.
    */
    expect(vu).not.toContain('GRATUIT');
    expect(bloc.findAllByType(LinearGradient)).toHaveLength(0);
    expect(bloc.findAllByType(ContourOr)).toHaveLength(0);
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
      ET LE BANDEAU EST AXÉ — le bloc profil et le bouton de thème
      descendent ensemble et partagent leur ligne : deux éléments à la
      même hauteur d'écran qui ne s'alignent pas se lisent comme un
      accident.
    */
    const pastilleTheme = t.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Passer en thème'),
    )[0];
    const stBloc = StyleSheet.flatten(bloc.props.style) as { top?: number };
    const stTheme = StyleSheet.flatten(pastilleTheme.props.style) as {
      top?: number;
    };
    // Remonté d'un cran (le clic répondait au-dessus du dessin), mais
    // jamais collé au bord d'écran.
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
    /*
      ALIGNÉS PAR CONSTRUCTION — relevé du patron : les deux blocs vivaient
      dans des boîtes de hauteurs différentes et leurs centres dérivaient à
      chaque retouche de contenu. Même sommet, MÊME hauteur : plus rien à
      calculer, donc plus rien à dériver.
    */
    const stThemeTaille = StyleSheet.flatten(pastilleTheme.props.style) as {
      height?: number;
    };
    expect(stTheme.top).toBe(stBloc.top);
    expect(stCadre.height).toBe(stThemeTaille.height);
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

  it('en Pro, le prénom et le contour de l’avatar s’animent en couleurs', () => {
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
    const typos = bloc.findAllByType(TexteOr);
    expect(typos).toHaveLength(1);
    expect(typos[0].props.texte).toBe('Jérôme');
    // …et l'avatar se cercle du contour d'or, AU RAS de l'icône grise —
    // relevé du patron : plus de disque clair entre l'anneau et l'avatar.
    const contour = bloc.findAllByType(ContourOr);
    expect(contour).toHaveLength(1);
    expect(contour[0].props.fond).toBe(light.bg);
    const stAnneau = StyleSheet.flatten(contour[0].props.style) as {
      width?: number;
    };
    expect(stAnneau.width).toBeLessThanOrEqual(38);
    // Et le prénom doré s'allège comme le gris.
    const typoNom = bloc.findAllByType(TexteOr)[0];
    expect(Number(typoNom.props.graisse)).toBeLessThanOrEqual(600);
    useAccountStore.setState({ pro: false });
  });

  /*
   * LE THÈME FAIT LA TAILLE DU PROFIL — relevé du patron : « fais le
   * bouton thème à la même taille que le bouton profil, mais agrandis
   * avant légèrement le bouton profil ». La pastille blanche (40) dominait
   * l'avatar (32) : le bandeau portait deux ronds inégaux. L'avatar prend
   * donc quatre points, la pastille en rend quatre — les deux se lisent
   * en 36, et l'égalité est ASSERTÉE, pas espérée.
   */
  it('la pastille du thème et l’avatar font la même taille', () => {
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
    // L'avatar Pro a grandi : l'anneau d'or se lit en 36.
    const stAnneau = StyleSheet.flatten(
      bloc.findAllByType(ContourOr)[0].props.style,
    ) as { width?: number };
    expect(stAnneau.width).toBeGreaterThanOrEqual(35);
    // Et la pastille blanche du thème fait EXACTEMENT sa taille.
    const zone = t.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Passer en thème'),
    )[0];
    const blanche = zone.findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as
        | { width?: number; borderRadius?: number }
        | undefined;
      return typeof st?.width === 'number' && (st.borderRadius ?? 0) >= 17;
    })[0];
    const stBlanche = StyleSheet.flatten(blanche.props.style) as {
      width?: number;
      height?: number;
    };
    expect(stBlanche.width).toBe(stAnneau.width);
    expect(stBlanche.height).toBe(stAnneau.width);
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
    // On remonte jusqu'au Svg porteur de la taille : le parent direct du
    // tracé est un intermédiaire sans largeur.
    let avatarNu = bloc2
      .findAllByType(Path)
      .find((n) => n.props.d === SOLAIRES.avatar)!.parent;
    while (avatarNu && avatarNu.props?.width === undefined) {
      avatarNu = avatarNu.parent;
    }
    expect(Number(avatarNu?.props.width)).toBeGreaterThanOrEqual(33);
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
    act(() => jest.advanceTimersByTime(68 * SHOWCASE_FRAMES));
    expect(visible()).toBe(apres);
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
  it('éteint le bouton sur un appareil incompatible', () => {
    useScanStore.setState({ supported: false });
    const t = monter();
    expect(bouton(t, 'Commencer le scan')!.props.disabled).toBe(true);
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
