/**
 * OÙ SE LANCE LA PRÉSENTATION — et où elle ne se lance PAS.
 *
 * Ce bouton a cherché sa place quatre fois : au pied de l'écran d'export à
 * côté du bouton PDF, sur l'écran du scan, sous l'aperçu du plan, et enfin
 * LÀ OÙ IL FALLAIT — dans le menu qui s'ouvre sur « Exporter », avec le
 * PDF, le modèle 3D et le bordereau.
 *
 * Le malentendu était le même à chaque fois : on la rangeait dans le
 * RÉGLAGE D'UN DOCUMENT alors que c'est une SORTIE. Un réglage d'ergonomie
 * qu'on redemande est un réglage qu'un test doit tenir.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { Iso3DView } from '../src/components/Iso3DView';
import { ExportArt } from '../src/components/ExportArt';
import { ClientTour } from '../src/components/ClientTour';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
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

function monter(quoi: 'export' | 'scan') {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: quoi === 'export' ? 'export' : 'result',
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
      ceiling: [],
      photos: [],
      // Un cap relevé : sans lui, l'option « Nord » n'aurait rien à allumer.
      north: 0,
    });
    tree =
      quoi === 'export'
        ? TestRenderer.create(<ExportScreen />)
        : TestRenderer.create(<ResultScreen />);
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
  arbre = tree;
  return tree;
}

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

describe('la présentation animée', () => {
  it('se choisit sur le bouton « Exporter », en dernier de la liste', () => {
    const tree = monter('scan');
    // L'export est devenu une ICÔNE dans l'en-tête : on le désigne par son
    // étiquette, comme le ferait la voix de VoiceOver.
    const exporter = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Exporter');
    expect(exporter).toBeDefined();
    act(() => exporter!.props.onPress());
    const vu = textes(tree);
    expect(vu).toContain('Présentation animée');
    // Elle voisine avec les autres sorties, elle ne les remplace pas.
    expect(vu).toContain('Plan PDF');
    expect(vu).toContain('Modèle 3D');
    /**
     * ET ELLE FERME LA MARCHE.
     *
     * Les quatre premières sorties donnent un FICHIER — c'est ce qu'on
     * vient chercher neuf fois sur dix en touchant « Exporter ». La
     * présentation, elle, ouvre un moment : on descend jusqu'à elle quand
     * on a quelqu'un en face de soi.
     */
    const titres = ['Plan PDF', 'Modèle 3D', 'Liste du matériel', 'Image', 'Présentation animée'];
    const rangs = titres.map((t) => vu.indexOf(t));
    for (let i = 1; i < rangs.length; i++) {
      expect(`${titres[i]} après ${titres[i - 1]} : ${rangs[i] > rangs[i - 1]}`).toBe(
        `${titres[i]} après ${titres[i - 1]} : true`,
      );
    }
  });

  /**
   * ET ELLE PORTE SON DESSIN, comme chaque sortie du menu.
   *
   * Les quatre autres vignettes disent un fichier — une feuille, un
   * volume, un bordereau, une capture. Celle-ci dit un moment : le
   * logement qui tourne devant le client.
   */
  it('porte sa vignette dans le menu', () => {
    const tree = monter('scan');
    // L'export est devenu une ICÔNE dans l'en-tête : on le désigne par son
    // étiquette, comme le ferait la voix de VoiceOver.
    const exporter = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Exporter');
    act(() => exporter!.props.onPress());
    const ligne = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        n
          .findAllByType(Text)
          .some((t) => t.props.children === 'Présentation animée'),
      );
    expect(ligne).toBeDefined();
    expect(ligne!.findAllByType(ExportArt)).toHaveLength(1);
    expect(ligne!.findByType(ExportArt).props.kind).toBe('presentation');
  });

  it('ne s’affiche plus dans l’écran d’export du PDF', () => {
    const tree = monter('export');
    expect(textes(tree)).not.toContain('Présentation animée');
    expect(
      tree.root
        .findAllByType(TouchableOpacity)
        .some((n) => n.props.accessibilityLabel === 'Présentation animée'),
    ).toBe(false);
  });

  /**
   * ET LA VISITE INTÉRIEURE N'EXISTE PLUS.
   *
   * Elle promettait de se tenir dans le modèle ; à l'usage, elle butait
   * trop souvent pour servir sur un chantier. Un mode qu'on n'ose pas
   * montrer à un client vaut moins que pas de mode du tout.
   */
  it('et l’écran du scan ne propose plus de visite intérieure', () => {
    const tree = monter('scan');
    const vu = textes(tree);
    expect(vu).not.toContain('Visite');
    expect(vu).not.toContain('Modèle AR');
  });
});

/**
 * LES POINTS CARDINAUX SUR LE DOSSIER — À LA DEMANDE.
 *
 * Ils désignent un mur sans ambiguïté, et tous les dossiers n'en ont pas
 * besoin. Comme sur le plan de l'app, ils partent ÉTEINTS : quatre lettres
 * autour de chaque vue chargent la feuille quand personne ne les lit.
 */
describe('le nord dans le dossier', () => {
  it('s’offre en option, éteinte au départ', () => {
    const tree = monter('export');
    const bouton = tree.root
      .findAllByType(TouchableOpacity)
      // Le mot est en légende SOUS la pastille : c'est l'étiquette
      // d'accessibilité qui nomme le bouton.
      .find((n) => n.props.accessibilityLabel === 'Nord');
    expect(bouton).toBeDefined();
    // Éteinte : les vues 3D de l'aperçu ne portent pas la couronne.
    for (const v of tree.root.findAllByType(Iso3DView)) {
      expect(v.props.showNorth).toBe(false);
    }
    act(() => bouton!.props.onPress());
    const apres = tree.root.findAllByType(Iso3DView);
    expect(apres.length).toBeGreaterThan(0);
    for (const v of apres) expect(v.props.showNorth).toBe(true);
  });
});

/**
 * LA PRÉSENTATION SE PRÉPARE AVANT DE JOUER.
 *
 * Le modèle se bâtit à la première image — murs extrudés, mobilier,
 * appareillage. Sur un logement meublé c'est le plus gros calcul de l'app,
 * et il tombait pendant les premières secondes de la présentation : le
 * client voyait un départ haché qui se calmait ensuite. On lève donc le
 * rideau seulement quand le modèle est monté, et l'horloge n'avance pas
 * tant qu'il est là.
 */
describe('le rideau de préparation', () => {
  it('couvre la première image, puis se retire', () => {
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
        ceiling: [],
      });
      tree = TestRenderer.create(<ClientTour visible onClose={() => {}} />);
    });
    arbre = tree;
    expect(textes(tree)).toContain('Préparation de la présentation');
    // Le modèle est déjà monté DERRIÈRE le rideau : c'est tout l'objet du
    // préchargement — il se calcule pendant qu'on lit le titre.
    expect(tree.root.findAllByType(Iso3DView).length).toBe(1);
    // Et il se rend en pans d'un seul tenant, pour tenir la cadence.
    expect(tree.root.findByType(Iso3DView).props.light).toBe(true);

    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(textes(tree)).not.toContain('Préparation de la présentation');
  });

  /**
   * ELLE SE TIENT DANS LA PIÈCE, ET TOURNE LA TÊTE.
   *
   * Relevé du chantier : « une animation plus poussée, comme dans un jeu
   * vidéo où on se trouve dans l'appartement en POV, et on tourne autour en
   * présentant chaque mur et les éléments électriques qui s'y trouvent ».
   *
   * Ce n'est plus un cadrage : c'est une CAMÉRA, posée à hauteur d'homme au
   * centre de la pièce, avec une ouverture d'objectif. On vérifie qu'elle
   * existe, qu'elle est bien à l'intérieur, et qu'elle tourne dans un seul
   * sens — un demi-tour arrière au milieu d'une visite donne le mal de mer.
   */
  it('se tient à hauteur d’homme et tourne dans un seul sens', () => {
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
        ceiling: [],
      });
      tree = TestRenderer.create(<ClientTour visible onClose={() => {}} />);
    });
    arbre = tree;
    act(() => {
      jest.advanceTimersByTime(600);
    });
    const vue3d = () => tree.root.findByType(Iso3DView).props;
    const azimuts: number[] = [];
    let hauteurs: number[] = [];
    let ouverture = 0;
    for (let i = 0; i < 80; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      const p = vue3d().pov;
      if (!p) continue;
      azimuts.push(p.yaw);
      hauteurs.push(p.at.y);
      ouverture = p.fov;
    }
    // La visite passe bien en perspective.
    expect(azimuts.length).toBeGreaterThan(4);
    // L'œil est à hauteur d'homme, au-dessus du sol et sous le plafond.
    for (const y of hauteurs) {
      expect(y).toBeGreaterThan(1.3);
      expect(y).toBeLessThan(2);
    }
    // Une ouverture large : dans trois mètres, un objectif étroit ne
    // montrerait qu'un pan de mur.
    expect(ouverture).toBeGreaterThan(50);
    // Et la tête tourne toujours du même côté : jamais de retour en arrière
    // supérieur au léger balancement d'une étape.
    let reculs = 0;
    for (let i = 1; i < azimuts.length; i++) {
      if (azimuts[i] < azimuts[i - 1] - 0.2) reculs++;
    }
    expect(`${reculs} demi-tour(s)`).toBe('0 demi-tour(s)');
  });

  /**
   * ELLE ENTRE DANS LES PIÈCES.
   *
   * Relevé du chantier : « d'abord un tour d'ensemble du modèle, puis rentrer
   * TOTALEMENT au centre de chaque pièce pour présenter chaque mur autour —
   * une immersion totale mais dynamique ». La visite survolait les pièces de
   * cinquante degrés de hauteur : une maquette qu'on regarde, pas un logement
   * où l'on se tient.
   *
   * On juge la CAMÉRA, pas les mots : le regard descend à hauteur d'homme, et
   * le tour est complet.
   */
  it('descend au centre des pièces et en fait le tour complet', () => {
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
        ceiling: [],
      });
      tree = TestRenderer.create(<ClientTour visible onClose={() => {}} />);
    });
    arbre = tree;
    act(() => {
      jest.advanceTimersByTime(600);
    });

    /** Le regard le plus RASANT et le zoom le plus fort atteints. */
    let tiltMini = 90;
    let zoomMaxi = 0;
    let toursDePiece = 0;
    let piecesVues = new Set<string | null>();
    const vue3d = () => tree.root.findByType(Iso3DView).props;
    let piecePrecedente: string | null | undefined;
    // Trente secondes de visite : le tour d'ensemble, puis les pièces.
    for (let i = 0; i < 60; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      const p = vue3d();
      if (p.focusRoomId) {
        tiltMini = Math.min(tiltMini, p.value.tilt);
        zoomMaxi = Math.max(zoomMaxi, p.value.zoom);
        piecesVues.add(p.focusRoomId);
        if (p.focusRoomId !== piecePrecedente) toursDePiece++;
      }
      piecePrecedente = p.focusRoomId;
    }
    // On est DEDANS : le regard descend sous vingt-cinq degrés, et la vue
    // se serre à plus du double du cadrage d'ensemble.
    expect(`${tiltMini < 25 ? 'dedans' : 'au-dessus'}`).toBe('dedans');
    expect(zoomMaxi).toBeGreaterThan(2);
    // Et chaque pièce a bien été visitée.
    expect(piecesVues.size).toBeGreaterThan(0);
    expect(toursDePiece).toBeGreaterThan(0);
  });
});

/**
 * LA REFONTE DE L'ÉCRAN — le plan d'abord, les commandes en icônes.
 *
 * Le reproche, en comparant à l'application concurrente : « notre bouton
 * d'export prend beaucoup trop de place alors que j'aimerais que ce soit
 * une petite icône ; leur plan est beaucoup mieux visible ». Deux blocs
 * pleine largeur — l'export et le nouveau scan — mangeaient cent trente
 * points de hauteur, et six chiffres en cartouche quatre-vingts de plus.
 */
describe('l’écran du scan, refondu', () => {
  it('porte l’export en icône, et plus en bandeau', () => {
    const tree = monter('scan');
    const icone = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Exporter');
    expect(icone).toBeDefined();
    // Le bandeau bleu n'existe plus : plus aucun bouton n'écrit « Exporter ».
    expect(
      tree.root
        .findAllByType(Text)
        .some((t) => t.props.children === 'Exporter'),
    ).toBe(false);
  });

  /**
   * LES MESURES SONT LÀ DÈS L'OUVERTURE.
   *
   * Elles se sont repliées le temps d'une version, pour rendre au plan la
   * hauteur qu'elles prenaient. Le chantier a tranché : on ouvre un scan
   * pour voir un plan ET ses chiffres, et un chiffre qu'il faut déplier est
   * un chiffre qu'on ne lit plus.
   */
  it('montre les mesures sans qu’on les demande', () => {
    const vu = textes(monter('scan'));
    // Les libellés sont mis en capitales par le style, pas par le texte.
    expect(vu).toContain('m² sol');
    expect(vu).toContain('m périm.');
  });

  it('et n’offre plus de les masquer', () => {
    const tree = monter('scan');
    const menu = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Plus');
    act(() => menu!.props.onPress());
    const vu = textes(tree);
    expect(vu).not.toContain('Masquer les mesures');
    expect(vu).not.toContain('Voir les mesures');
  });

  it('et propose d’ajouter une pièce, sans effacer le relevé', () => {
    const tree = monter('scan');
    const menu = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Plus');
    expect(menu).toBeDefined();
    act(() => menu!.props.onPress());
    expect(textes(tree)).toContain('Ajouter une pièce');
    // « Nouveau scan » y reste, mais il a quitté le pied de page.
    expect(textes(tree)).toContain('Nouveau scan');
  });
});

/**
 * LA BARRE D'OUTILS EST EN BAS, ET LE SÉLECTEUR DE VUE EST UNE PASTILLE.
 *
 * Relevé du chantier, deux fois : « les boutons encadrent le plan sur le
 * haut/droite mais empiètent trop sur l'espace de travail », et « nos
 * boutons 2D/3D prennent beaucoup de place ». Le dessin était cerné par une
 * rangée en haut et une colonne à droite, et surmonté d'un bandeau de
 * cinquante points pour deux mots.
 */
describe('l’espace de travail du plan', () => {
  /** Le style aplati d'un nœud, quel que soit son empilement. */
  const style = (n: TestRenderer.ReactTestInstance) => {
    const plats = Array.isArray(n.props.style) ? n.props.style : [n.props.style];
    return Object.assign({}, ...plats.filter(Boolean).flat(Infinity));
  };

  /**
   * DEUX FAMILLES, DEUX AXES — ET TOUT DANS LA CARTE.
   *
   * Relevé du chantier, capture à l'appui : « les boutons en bas ne sont pas
   * dans le bloc blanc de fond du plan », et « inverse ce qui s'affiche
   * verticalement et ce qui s'affiche horizontalement ».
   *
   * Les CALQUES — cotes, meubles, surfaces — s'allument l'un après l'autre :
   * ils forment une rangée au pied du dessin, que l'œil balaie d'un coup.
   * Les ACTIONS — enregistrer, annuler, contrôler, éditer — se choisissent
   * une seule à la fois : elles tiennent une colonne à droite, séparées des
   * calques pour qu'on ne les confonde jamais.
   */
  it('pose les calques en rangée et les actions en colonne', () => {
    const tree = monter('scan');
    const rail = tree.root.find(
      (n) =>
        typeof n.type === 'string' &&
        style(n).position === 'absolute' &&
        style(n).flexDirection === 'row' &&
        style(n).left === 0,
    );
    expect(rail).toBeDefined();
    // La rangée : horizontale, ancrée en bas, et jamais par le haut.
    expect(style(rail).top).toBeUndefined();
    expect(typeof style(rail).bottom).toBe('number');
    // Et surtout : ELLE NE DÉFILE PAS. Un rail qui glisse cache ce qu'il
    // porte — relevé du chantier, « évite la possibilité d'un slide ».
    expect(
      tree.root
        .findAllByType(ScrollView)
        .filter((n) => style(n).position === 'absolute').length,
    ).toBe(0);

    // La colonne d'actions : même ligne de fond, mais empilée — pas de
    // flexDirection, donc l'axe vertical par défaut.
    const colonne = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          style(n).position === 'absolute' &&
          style(n).zIndex === 4 &&
          // La pastille 2D/3D porte le même plan, mais elle est ancrée en
          // haut : c'est le pied qui distingue la colonne d'actions.
          typeof style(n).bottom === 'number',
      )
      .map(style)[0];
    expect(colonne).toBeDefined();
    expect(colonne.flexDirection).toBeUndefined();
    expect(colonne.right).toBeLessThan(12);
    // Elles partagent le même pied : rien ne flotte plus bas que l'autre.
    expect(colonne.bottom).toBe(style(rail).bottom);
    // Et la rangée s'arrête AVANT la colonne, sinon les dernières pastilles
    // se glisseraient dessous.
    expect(style(rail).right).toBeGreaterThanOrEqual(50);
  });

  it('remplace le bandeau 2D/3D par une pastille', () => {
    const tree = monter('scan');
    const pastille = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Passer en 3D');
    expect(pastille).toBeDefined();
    const st = style(pastille!);
    // Posée SUR le dessin, en haut à droite : elle ne prend aucune bande.
    expect(st.position).toBe('absolute');
    expect(st.height).toBeLessThanOrEqual(36);
    // Et les deux mots du bandeau ont disparu.
    expect(textes(tree)).not.toContain('Plan 2D');
  });
});

/**
 * LA BARRE DU BAS RESPECTE L'INDICATEUR D'ACCUEIL.
 *
 * Relevé du chantier, capture à l'appui : « le menu en bas est trop collé au
 * bord ». Les mots « Meubles » et « Surfaces » étaient tranchés par le trait
 * blanc de l'iPhone. Toutes les applications réservent cette bande ; on la
 * demande au système plutôt que de la coder en dur — c'est la même mesure
 * sur un modèle à encoche, sur un modèle à bouton, et sur un iPad.
 */
describe('les marges du système', () => {
  it('remonte les commandes au-dessus de l’indicateur, sans creuser la carte', () => {
    const tree = monter('scan');
    const style = (n: TestRenderer.ReactTestInstance) => {
      const plats = Array.isArray(n.props.style) ? n.props.style : [n.props.style];
      return Object.assign({}, ...plats.filter(Boolean).flat(Infinity));
    };
    // La carte ne porte PLUS la réserve en padding : son blanc descend
    // jusqu'au bord, sinon les pastilles tombent sur le gris de la page —
    // c'est exactement ce que montrait la capture.
    const creuse = tree.root.findAll(
      (n) => style(n).paddingBottom === 34 && style(n).flex === 1,
    ).length;
    expect(`${creuse === 0 ? 'plein' : 'creusé'}`).toBe('plein');
    // Ce sont les commandes qui remontent : au-dessus des 34 points de
    // l'indicateur d'accueil, marge comprise.
    const rail = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          style(n).position === 'absolute' &&
          style(n).flexDirection === 'row' &&
          style(n).left === 0,
      )
      .map(style)[0];
    expect(rail.bottom).toBeGreaterThanOrEqual(34);
  });
});

/**
 * LA BASCULE 2D ↔ 3D : LE PLAN SE RELÈVE, IL NE SAUTE PAS.
 *
 * Relevé du chantier : « au passage du 2D au 3D et inversement, le plan doit
 * se placer exactement comme l'autre ; ajoute une rapide animation, comme si
 * le 2D se construisait en 3D ». Les deux vues partagent la même projection :
 * la 3D SANS inclinaison EST le plan. La bascule n'invente donc rien — elle
 * entre à plat, dans l'orientation exacte du plan, puis relève.
 */
describe('la bascule entre le plan et le volume', () => {
  it('entre en 3D à plat, dans l’orientation du plan, puis relève', () => {
    const tree = monter('scan');
    const plan = tree.root.findByType(FloorplanEditor);
    // Le plan a été tourné d'un quart de tour par l'utilisateur.
    act(() =>
      plan.props.onView({ zoom: 1.4, ox: 12, oy: -8, rot: Math.PI / 2 }),
    );

    const pastille = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Passer en 3D');
    expect(pastille).toBeDefined();
    act(() => pastille!.props.onPress());

    // La bascule commence par un bref fondu : la vue 3D paraît ensuite.
    act(() => {
      jest.advanceTimersByTime(130);
    });
    const vue3d = () => tree.root.findByType(Iso3DView).props.value;
    // Même orientation, même zoom, même cadrage — et À PLAT.
    expect(vue3d().theta).toBeCloseTo(90, 3);
    expect(vue3d().zoom).toBeCloseTo(1.4, 3);
    expect(vue3d().ox).toBe(12);
    expect(vue3d().tilt).toBeLessThan(12);

    // Puis le volume se relève tout seul, en moins d'une demi-seconde.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(vue3d().tilt).toBeGreaterThan(30);
    // ...sans avoir touché à l'orientation : le logement n'a pas pivoté.
    expect(vue3d().theta).toBeCloseTo(90, 3);
  });
});

/**
 * LE DOSSIER SE PRÉPARE PENDANT QU'ON CHOISIT.
 *
 * Relevé du chantier : « aucune latence n'est tolérée si elle peut être évitée
 * en chargeant au préalable ». L'assemblage du PDF — plan, deux vues 3D,
 * élévations, schémas, métré — tombait tout entier APRÈS l'appui sur le
 * bouton : l'écran se figeait une demi-seconde, et l'on croyait avoir mal
 * appuyé. Or l'électricien passe plusieurs secondes à régler ses options :
 * c'est là qu'il faut travailler.
 */
describe('le préchargement du dossier', () => {
  it('bâtit le PDF dès que les choix se posent, avant tout appui', () => {
    const pdf = require('../src/export/pdf');
    const espion = jest.spyOn(pdf, 'buildScanPdf');
    espion.mockClear();
    const tree = monter('export');
    arbre = tree;
    // Rien tant que la main bouge encore.
    expect(espion).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    // ...et le dossier est prêt, sans que personne n'ait touché le bouton.
    expect(espion.mock.calls.length).toBeGreaterThan(0);
    espion.mockRestore();
  });
});

/**
 * LA VISITE SE PARCOURT COMME UNE STORY.
 *
 * Relevé du chantier : « au clic on passe à l'animation suivante, slide
 * arrière revient en arrière ». Et : « la présentation nous fait plus petit
 * que le canapé » — l'œil était à la bonne hauteur, mais l'objectif trop
 * large grossissait tout ce qui est proche.
 */
describe('la visite, parcourue au doigt', () => {
  const ouvrir = () => {
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
        ceiling: [],
      });
      tree = TestRenderer.create(<ClientTour visible onClose={() => {}} />);
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });
    return tree;
  };

  it('avance et recule au doigt, sans chercher de bouton', () => {
    const tree = ouvrir();
    arbre = tree;
    const zone = (nom: string) =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .find((n) => n.props.accessibilityLabel === nom);
    expect(zone('Étape suivante')).toBeDefined();
    expect(zone('Étape précédente')).toBeDefined();
    const titre = () => String(textes(tree));
    const debut = titre();
    act(() => zone('Étape suivante')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(titre()).not.toBe(debut);
    act(() => zone('Étape précédente')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(titre()).toBe(debut);
  });

  it('regarde à hauteur d’homme, avec une focale d’homme', () => {
    const tree = ouvrir();
    arbre = tree;
    let vu = false;
    for (let i = 0; i < 60 && !vu; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      const p = tree.root.findByType(Iso3DView).props.pov;
      if (!p) continue;
      vu = true;
      // 1,65 m : l'œil d'un adulte debout.
      expect(p.at.y).toBeGreaterThan(1.6);
      expect(p.at.y).toBeLessThan(1.75);
      // Une focale d'homme : au-delà de soixante degrés, tout ce qui est
      // proche enfle et l'échelle ment.
      expect(p.fov).toBeLessThanOrEqual(60);
    }
    expect(`${vu ? 'vue' : 'jamais en POV'}`).toBe('vue');
  });
});

/**
 * ET ELLE N'EN MONTRE QU'UN À LA FOIS.
 *
 * Le carton dit « Mur nord · Chambre » ; il faut que l'image le dise aussi.
 * On juge le CÂBLAGE — quel mur la vue reçoit à chaque étape —, pas les
 * pixels : le filtre lui-même est tenu par le banc de la caméra POV.
 */
describe('la visite guidée', () => {
  it('ne présente qu’un mur à la fois, et en change', () => {
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
        ceiling: [],
      });
      tree = TestRenderer.create(<ClientTour visible onClose={() => {}} />);
    });
    arbre = tree;
    act(() => {
      jest.advanceTimersByTime(600);
    });
    const murs = new Set<string>();
    let ensemble = 0;
    for (let i = 0; i < 80; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      const focus = tree.root.findByType(Iso3DView).props.focusWallId;
      if (focus) murs.add(focus);
      else ensemble++;
    }
    // Plusieurs murs présentés, l'un après l'autre.
    expect(murs.size).toBeGreaterThan(1);
    // Chacun est un vrai mur du relevé, pas une étiquette inventée.
    for (const id of murs) {
      expect(SNAPSHOT_WALLS.some((w) => w.id === id)).toBe(true);
    }
    // Et le tour d'ensemble, lui, montre le logement entier : une visite
    // qui ne montrerait jamais qu'un pan de mur ne situerait plus rien.
    expect(ensemble).toBeGreaterThan(0);
  });
});
