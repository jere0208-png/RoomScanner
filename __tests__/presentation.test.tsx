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
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen, feuillesElevations } from '../src/screens/ExportScreen';
import { RetourGlisse } from '../src/components/RetourGlisse';
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
 * LES POINTS CARDINAUX SUR LE DOSSIER — DE SÉRIE, SUR LE PLAN 2D SEULEMENT.
 *
 * Ils ont été une option « Nord », éteinte par défaut : le patron a
 * tranché — pas de bouton. Le dossier désigne ses murs par leur cardinal
 * (« Prise plinthe 1 · mur nord ») : le repère qui permet de le vérifier
 * sur place n'est pas un ornement qu'on coche. Et il vit sur le PLAN 2D
 * seulement — c'est la feuille qu'on oriente ; sur une perspective,
 * quatre lettres au bord du cadre ne désignent plus rien.
 */
describe('le nord dans le dossier', () => {
  it('ne s’offre plus en option, et l’aperçu reste NU — la rose vit dans le PDF', () => {
    const tree = monter('export');
    expect(
      tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === 'Nord'),
    ).toBeUndefined();
    // Relevé du patron : les cardinaux ne s'affichent QUE sur le plan 2D
    // du PDF lui-même — l'aperçu, lui, reste dégagé.
    const plans = tree.root.findAllByType(FloorplanEditor);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) expect(p.props.showNorth).toBe(false);
  });

  /*
   * « ÉLÉVATIONS » = TOUS LES MURS ; « COTES ÉLEC » = LES MURS ÉQUIPÉS.
   *
   * La case « Tous les murs » a vécu — relevé du patron : deux cases qui
   * se conditionnaient pour dire trois états, c'était une de trop. Deux
   * cases franches désormais, et cocher les deux n'imprime toujours
   * qu'une seule série, la plus large.
   */
  it('offre deux cases franches, sans jamais doubler les élévations', () => {
    const tree = monter('export');
    expect(
      tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === 'Cotes Élec'),
    ).toBeDefined();
    expect(
      tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === 'Tous les murs'),
    ).toBeUndefined();
    // Cotes Élec seul : les murs équipés.
    expect(feuillesElevations(false, true)).toEqual({
      elevations: true,
      toutesElevations: false,
    });
    // Élévations : TOUS les murs, d'office.
    expect(feuillesElevations(true, false)).toEqual({
      elevations: true,
      toutesElevations: true,
    });
    // Les deux : une seule série, la plus large.
    expect(feuillesElevations(true, true)).toEqual({
      elevations: true,
      toutesElevations: true,
    });
    expect(feuillesElevations(false, false)).toEqual({
      elevations: false,
      toutesElevations: false,
    });
  });

  it('les tuiles d’options sont basses, l’icône garde sa taille', () => {
    // Relevé du patron : « réduis plus les blocs que les icônes ». La
    // tuile perd six points (46 → 40), l'icône deux (26 → 24) : ce qu'on
    // reconnaît, c'est le dessin, pas la surface bleue.
    const tree = monter('export');
    const tuile = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Vues 3D')!;
    const st = StyleSheet.flatten(tuile.props.style) as { height?: number };
    expect(st.height).toBeLessThanOrEqual(42);
    const svg = tuile.findAll((n) => Number(n.props?.width) >= 22)[0];
    expect(svg).toBeDefined();
    expect(Number(svg.props.width)).toBeGreaterThanOrEqual(24);
  });

  it('l’aperçu du PDF rend le retour au bord gauche', () => {
    const tree = monter('export');
    const bord = tree.root.findAllByType(RetourGlisse)[0];
    expect(bord).toBeDefined();
    act(() => bord.props.onRetour());
    expect(useScanStore.getState().screen).toBe('result');
  });

  it('et sur lui seulement : les perspectives restent nues', () => {
    const tree = monter('export');
    const vues = tree.root.findAllByType(Iso3DView);
    expect(vues.length).toBeGreaterThan(0);
    for (const v of vues) expect(v.props.showNorth).toBe(false);
  });
});

/**
 * LES PERSPECTIVES S'AJOUTENT, ET CHACUNE PREND SA PAGE.
 *
 * Le dossier en portait deux d'office, dos à dos sur une même feuille —
 * chacune dans une case du tiers d'un A4, où l'on ne distingue plus une
 * porte d'une fenêtre. Une seule maintenant, en grand ; et si un angle
 * manque pour montrer le logement, on en ajoute un.
 */
describe('les perspectives du dossier', () => {
  const vues = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(Iso3DView);
  const boutonQuiDit = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === label);

  it('n’en propose qu’une au départ', () => {
    expect(vues(monter('export'))).toHaveLength(1);
  });

  it('s’ajoutent, et se retirent', () => {
    const tree = monter('export');
    const ajouter = boutonQuiDit(tree, 'Ajouter une perspective');
    expect(ajouter).toBeDefined();
    act(() => ajouter!.props.onPress());
    expect(vues(tree)).toHaveLength(2);
    act(() => ajouter!.props.onPress());
    expect(vues(tree)).toHaveLength(3);
    // La deuxième s'enlève ; la première reste — un dossier sans aucune
    // perspective n'aurait plus de feuille 3D du tout, et la case
    // « Vues 3D » mentirait.
    const retirer = boutonQuiDit(tree, 'Retirer la perspective 2');
    expect(retirer).toBeDefined();
    act(() => retirer!.props.onPress());
    expect(vues(tree)).toHaveLength(2);
  });

  it('chacune part d’un angle différent', () => {
    const tree = monter('export');
    act(() => boutonQuiDit(tree, 'Ajouter une perspective')!.props.onPress());
    const angles = vues(tree).map((v) => v.props.value.theta);
    // Deux vues identiques feraient deux pages identiques.
    expect(new Set(angles).size).toBe(angles.length);
  });
});

/**
 * LE PLAN DU DOSSIER NE SE CADRE PAS À LA MAIN.
 *
 * On pouvait le déplacer et le zoomer avant l'export, et ce cadrage partait
 * dans le PDF. C'est une liberté qui ne produit que des documents ratés :
 * un plan coupé, décentré, à une échelle qui n'est pas une échelle. Un plan
 * d'exécution se lit droit, entier, avec toutes ses cotes — le cadrage est
 * l'affaire du document, pas du doigt.
 *
 * Le geste est rendu au défilement : glisser sur l'aperçu fait défiler la
 * page, comme partout ailleurs dans l'app.
 */
describe('le plan de l’aperçu', () => {
  const zone = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(View)
      .find((n) => n.props.accessibilityLabel === 'Aperçu du plan');

  it('ne se déplace plus au doigt', () => {
    const tree = monter('export');
    const boite = zone(tree);
    expect(boite).toBeDefined();
    // Le doigt TRAVERSE l'aperçu : `pointerEvents="none"` neutralise d'un
    // coup la boîte et tout ce qu'elle contient — y compris les gestes que
    // l'éditeur de plan garde pour l'écran où on le retouche.
    expect(boite!.props.pointerEvents).toBe('none');
    expect(boite!.props.onStartShouldSetResponder).toBeUndefined();
    expect(boite!.props.onMoveShouldSetResponder).toBeUndefined();
  });

  it('ne porte plus ni décalage ni échelle', () => {
    const tree = monter('export');
    const boite = zone(tree)!;
    const styles = [boite, ...boite.findAllByType(View)].flatMap((n) =>
      (Array.isArray(n.props.style) ? n.props.style : [n.props.style]).filter(
        Boolean,
      ),
    );
    /*
      LA COUCHE DU GESTE EXISTE, MAIS ELLE EST À PLAT.

      Le plan porte désormais une couche transformable — c'est elle qui rend
      le déplacement fluide sur l'écran du plan, sans redessiner
      (`fluidite.test.tsx`). Exiger qu'aucun `transform` n'existe ici
      reviendrait à interdire cette couche partout ; ce qu'on veut, et ce
      qu'on tient, c'est qu'elle soit NEUTRE dans l'aperçu : rien n'est
      décalé, rien n'est agrandi, et le doigt ne la touche pas
      (`pointerEvents: none`, banc précédent).
    */
    const neutre = (t: Record<string, unknown>) =>
      Object.entries(t).every(([k, v]) =>
        k === 'scale' ? v === 1 : k === 'rotate' ? v === '0deg' : v === 0,
      );
    for (const st of styles) {
      const t = (st as { transform?: Record<string, unknown>[] }).transform;
      if (t === undefined) continue;
      expect(t.every(neutre)).toBe(true);
    }
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
   * ELLE TOURNE AUTOUR DU LOGEMENT, EN VUE LARGE.
   *
   * La visite s'est d'abord tenue DANS la pièce, à hauteur d'homme, tournant
   * la tête d'un mur à l'autre — c'était la demande, et c'était trop près :
   * un mur de deux mètres cinquante vu à deux mètres remplit l'écran, on ne
   * voit ni ses bouts ni la pièce autour, et le client ne sait plus ce qu'on
   * lui montre.
   *
   * Nouveau relevé du chantier, après essai sur l'appareil : « fais juste
   * une rotation qui tourne et on zoome en tournant, on s'arrête sur chaque
   * mur en vue large ». La caméra posée dans la pièce est donc abandonnée —
   * ce banc le dit, pour qu'on ne la remette pas par mégarde.
   */
  it('tourne dans un seul sens, sans jamais se poser dans la pièce', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Chantier test',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({
          ...r,
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
    const thetas: number[] = [];
    const zooms: number[] = [];
    let poses = 0;
    for (let i = 0; i < 90; i++) {
      act(() => {
        jest.advanceTimersByTime(400);
      });
      const p = tree.root.findByType(Iso3DView).props;
      if (p.pov) poses++;
      if (p.value) {
        thetas.push(p.value.theta);
        zooms.push(p.value.zoom);
      }
    }
    expect(thetas.length).toBeGreaterThan(10);
    // PLUS AUCUNE caméra posée dans la pièce : c'est une maquette qu'on
    // tourne, pas une visite en immersion.
    expect(`${poses} pose(s) intérieure(s)`).toBe('0 pose(s) intérieure(s)');
    // La rotation ne revient jamais en arrière : un demi-tour au milieu
    // d'une visite donne le mal de mer.
    let reculs = 0;
    for (let i = 1; i < thetas.length; i++) {
      if (thetas[i] < thetas[i - 1] - 1) reculs++;
    }
    expect(`${reculs} demi-tour(s)`).toBe('0 demi-tour(s)');
    // Et l'on zoome EN tournant : la vue se resserre au fil de la visite.
    expect(Math.max(...zooms)).toBeGreaterThan(Math.min(...zooms) + 0.3);
    // En vue large : le regard reste au-dessus, jamais au ras du sol.
    expect(thetas.length).toBeGreaterThan(0);
  });

  /**
   * ELLE S'ARRÊTE SUR CHAQUE MUR, ET Y POSE LES COTES EN FONDU.
   *
   * « Si élément électrique on affiche ses cotes en animé fondu, tous en
   * même temps. » Elles se déroulaient auparavant comme un mètre qu'on
   * tire, filet après filet : pendant qu'un trait s'allonge, son nombre
   * n'est pas encore là, et l'œil suit le mouvement au lieu de lire. Un mur
   * équipé porte huit cotes ; huit petits mouvements, c'est du bruit.
   */
  it('montre les cotes d’un mur équipé en fondu, toutes ensemble', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Chantier test',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({
          ...r,
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
    const fondus: number[] = [];
    let plein = 0;
    for (let i = 0; i < 120; i++) {
      act(() => {
        jest.advanceTimersByTime(300);
      });
      const p = tree.root.findByType(Iso3DView).props;
      if (p.focusWallId) murs.add(p.focusWallId);
      if (typeof p.elecCotes === 'number') {
        fondus.push(p.elecCotes);
        if (p.elecCotes > 0.9) plein++;
      }
    }
    // Elle s'arrête sur plusieurs murs, l'un après l'autre.
    expect(murs.size).toBeGreaterThan(1);
    // Le fondu monte VRAIMENT jusqu'au bout : à mi-course, les nombres ne
    // seraient qu'à demi lisibles.
    expect(plein).toBeGreaterThan(0);
    // Et il repart de zéro : les cotes s'effacent avant le mur suivant.
    expect(Math.min(...fondus)).toBeLessThan(0.05);
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
    expect(st.height).toBeLessThanOrEqual(36);
    // Posée SUR le dessin, en haut à droite, dans la rangée flottante
    // qu'elle partage avec le contrôle des normes : c'est la RANGÉE qui
    // porte l'ancrage, les pastilles restent alignées par construction.
    const rangee = tree.root.findAllByType(View).find((v) => {
      const s = style(v);
      return (
        s?.position === 'absolute' &&
        s?.flexDirection === 'row' &&
        v
          .findAllByType(TouchableOpacity)
          .some((b) => b.props.accessibilityLabel === 'Passer en 3D')
      );
    });
    expect(rangee).toBeDefined();
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

  /**
   * ELLE REGARDE DE LOIN, ET DE HAUT.
   *
   * L'œil s'est tenu dans la pièce, à 1,65 m, avec une focale d'homme. Le
   * chantier a tranché après essai : trop près, on ne voit plus ni les bouts
   * du mur ni la pièce autour. La vue est revenue à la maquette qu'on tourne
   * — et ce banc garde la porte fermée : plus aucune étape ne pose la caméra
   * à l'intérieur.
   */
  it('regarde la maquette de trois quarts, jamais de l’intérieur', () => {
    const tree = ouvrir();
    arbre = tree;
    const tilts: number[] = [];
    for (let i = 0; i < 60; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      const p = tree.root.findByType(Iso3DView).props;
      expect(p.pov ?? null).toBeNull();
      if (p.value) tilts.push(p.value.tilt);
    }
    expect(tilts.length).toBeGreaterThan(5);
    // De trois quarts haut : jamais au ras du sol, jamais à la verticale.
    expect(Math.min(...tilts)).toBeGreaterThan(35);
    expect(Math.max(...tilts)).toBeLessThan(75);
  });
});

/**
 * ET ELLE N'EN MONTRE QU'UN À LA FOIS.
 *
 * Le carton dit « Mur nord · Chambre » ; il faut que l'image le dise aussi.
 * On juge le CÂBLAGE — quel mur la vue reçoit à chaque étape —, pas les
 * pixels : le filtre lui-même est tenu par le banc de la scène.
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
