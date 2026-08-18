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
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { Iso3DView } from '../src/components/Iso3DView';
import { ExportArt } from '../src/components/ExportArt';
import { ClientTour } from '../src/components/ClientTour';
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

  it('pose les outils au pied du plan, pas sur ses côtés', () => {
    const tree = monter('scan');
    // La barre d'outils : le rail qui porte les pastilles.
    const rail = tree.root
      .findAll((n) => typeof n.props?.horizontal === 'boolean' && n.props.horizontal)
      .map(style)
      .find((st) => typeof st.bottom === 'number' && st.position === 'absolute');
    expect(rail).toBeDefined();
    // Ancrée en bas, sur toute la largeur — et plus en colonne à droite.
    expect(rail!.bottom).toBeLessThan(20);
    expect(rail!.flexDirection).toBe('row');
    expect(rail!.top).toBeUndefined();
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
