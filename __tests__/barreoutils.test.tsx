/**
 * LA RANGÉE D'OUTILS : CE QUI EST ALLUMÉ, ET CE QUE LE PEIGNE ANNONCE.
 *
 * Trois relevés du patron sur la même bande d'écran :
 *
 *   1. « Sur la vue 3D de base au scan, on coche les boutons pour afficher
 *      les meubles et les murs seulement, le reste reste décoché. » Un
 *      modèle qui s'ouvre avec tout allumé — surfaces teintées, plafond,
 *      repères, cotes — ne montre plus le bâti qu'on vient regarder ;
 *   2. « La ligne du Afficher ne va pas jusqu'au dernier bouton… et même sur
 *      la colonne de droite quand c'est des éléments à afficher/cacher »,
 *      puis, la capture suivante à l'appui : « la barre s'arrête au dernier
 *      calque de la LIGNE, puis monte en équerre vers les boutons de la
 *      colonne qui sont des calques ». Le peigne s'est arrêté au dernier
 *      outil de la ligne (le trop-plein de droite restait dehors, annoté
 *      par rien), puis a couru jusqu'à la pile (et sa descente est tombée
 *      sur « Édition », qui n'affiche rien) : il monte désormais ;
 *   3. « Le bouton Enregistrer doit être au-dessus du bouton Nord et de tout
 *      autre bouton de la colonne, lorsqu'il est affiché. » Il vivait avec
 *      les commandes, en bas de la colonne, sous le trop-plein de calques :
 *      le geste le plus important de l'écran était le plus bas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { RangeeOutils } from '../src/components/RangeeOutils';
import { Toolbar2D } from '../src/screens/result/ResultToolbar';
import { getStyles } from '../src/screens/result/styles';
import { PILL_CELL_H, PILL_GAP } from '../src/components/ToolPill';
import { useScanStore } from '../src/store/scanStore';
import { light } from '../src/theme';
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

function monter(dirty = false) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      scanName: 'Chantier',
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
      dirty,
    });
    t = TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  act(() => jest.advanceTimersByTime(400));
  arbre = t;
  return t;
}

const presser = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);
  expect(b).toBeDefined();
  act(() => b!.props.onPress());
  act(() => jest.advanceTimersByTime(400));
};

/** Une pastille d'outil est-elle allumée ? (fond bleu = active) */
const allume = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);
  if (!b) return undefined;
  const st = StyleSheet.flatten(b.props.style) as { backgroundColor?: string };
  return st?.backgroundColor === light.blue;
};

describe('la vue 3D à l’ouverture d’un scan', () => {
  const ALLUMES = ['Meubles', 'Murs'];
  const ETEINTS = ['Cotes', 'Surfaces', 'Nord', 'Repères'];

  it('n’allume que les meubles et les murs', () => {
    const t = monter();
    presser(t, 'Passer en 3D');
    for (const nom of ALLUMES) {
      expect({ [nom]: allume(t, nom) }).toEqual({ [nom]: true });
    }
    for (const nom of ETEINTS) {
      const etat = allume(t, nom);
      if (etat === undefined) continue;
      expect({ [nom]: etat }).toEqual({ [nom]: false });
    }
  });
});

describe('le peigne « Afficher »', () => {
  /*
    ON MONTE LA RANGÉE SEULE, à une largeur qui force le trop-plein.

    Sur l'écran des résultats, sept outils tiennent parfois sur la ligne — le
    banc ne verrait alors jamais la pile de droite, c'est-à-dire justement ce
    que le relevé du patron vise : « la ligne du Afficher ne va pas jusqu'au
    dernier bouton… et même sur la colonne de droite ».
  */
  const outilsFactices = (n: number) =>
    Array.from({ length: n }, (_, i) => (
      <View key={`o${i}`} testID={`o${i}`} />
    ));

  let dernier: TestRenderer.ReactTestRenderer | null = null;

  /**
   * `dessus` = la hauteur à franchir pour atteindre la pile de droite.
   *
   *   0  — la 3D : pas de bouton d'édition, la pile commence SUR la ligne ;
   *   65 — le plan 2D : la pile est posée au-dessus de la colonne des
   *        commandes, une cellule et un écart plus haut.
   */
  const rangee = (n: number, largeur: number, dessus = 0) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RangeeOutils
          styles={getStyles(light) as unknown as Record<string, object>}
          anim={new Animated.Value(1)}
          largeur={largeur}
          reserve={62}
          bas={10}
          dessus={dessus}
          elements={outilsFactices(n)}
        />,
      );
    });
    arbre = t;
    dernier = t;
    return t
      .root.findAllByType(Line)
      .filter((x) => x.props.stroke === '#B6BECB');
  };

  /** Le bloc absolu qui porte le peigne : c'est lui qui dit son origine. */
  const cadre = () => {
    let n: TestRenderer.ReactTestInstance | null =
      dernier!.root.findAllByType(Svg)[0];
    while (n) {
      const st = StyleSheet.flatten(n.props?.style) as
        | { position?: string; left?: number }
        | undefined;
      if (st?.position === 'absolute' && typeof st.left === 'number') return st;
      n = n.parent;
    }
    throw new Error('peigne introuvable');
  };

  /** Le milieu du mot « Afficher », mesuré depuis le bord de la carte. */
  const axeDuMot = () => {
    const mot = dernier!.root
      .findAllByType(Text)
      .find((n) => n.props.children === 'Afficher')!;
    const st = StyleSheet.flatten(mot.props.style) as {
      left: number;
      width: number;
    };
    return cadre().left! + st.left + st.width / 2;
  };

  /**
   * OÙ LA RANGÉE POSE VRAIMENT SES PASTILLES.
   *
   * Elle les répartit à parts égales dans `[0, largeur - reserve]`, dix
   * points de marge de chaque côté (`planTools`, `paddingHorizontal`). Le
   * peigne comptait, lui, sur `[4, largeur - reserve]` sans les marges :
   * deux grilles voisines, et un écart qui grandit vers la droite.
   */
  const axePastille = (i: number, n: number, largeur: number) => {
    const part = (largeur - 62 - 20) / n;
    return 10 + part * (i + 0.5);
  };

  const long = (n: TestRenderer.ReactTestInstance) =>
    Math.abs(Number(n.props.x2) - Number(n.props.x1)) +
    Math.abs(Number(n.props.y2) - Number(n.props.y1));

  /** Le peigne démonté : la barre, les descentes, la montée, les branches. */
  const pieces = (traits: TestRenderer.ReactTestInstance[]) => {
    const horizontales = traits.filter((n) => n.props.y1 === n.props.y2);
    const verticales = traits.filter((n) => n.props.x1 === n.props.x2);
    // La barre est la plus longue des horizontales : les branches vers la
    // colonne ne font que la longueur d'une descente.
    const barre = horizontales.reduce((a, b) => (long(b) > long(a) ? b : a));
    const yBarre = Number(barre.props.y1);
    return {
      barre,
      branches: horizontales.filter((n) => n !== barre),
      descentes: verticales.filter((n) => Number(n.props.y2) > yBarre),
      montees: verticales.filter((n) => Number(n.props.y2) < yBarre),
    };
  };

  it('descend sur chaque outil de la ligne', () => {
    // Sept outils sur trois cent quatre-vingt-dix points : quatre tiennent,
    // trois montent à droite.
    const { descentes } = pieces(rangee(7, 390, 65));
    expect(descentes).toHaveLength(4);
  });

  it('s’arrête au dernier outil quand ils tiennent tous sur la ligne', () => {
    // Rien à rejoindre : la barre ne déborde pas vers une pile absente.
    const { descentes, branches, montees } = pieces(rangee(3, 390));
    expect(descentes).toHaveLength(3);
    expect(branches).toHaveLength(0);
    expect(montees).toHaveLength(0);
  });

  /*
    LA BARRE NE VA PLUS JUSQU'À LA COLONNE — troisième version du peigne.

    Elle s'est d'abord arrêtée au dernier outil de la LIGNE : le trop-plein
    de calques, à droite, restait alors annoté par rien. On l'a donc
    poussée jusqu'à la pile, avec une descente de plus — et sur le plan 2D
    cette descente est tombée sur « Édition », qui n'affiche ni ne cache
    quoi que ce soit. Relevé du patron, croquis rouge à l'appui : « la
    barre s'arrête au dernier calque de la ligne, puis MONTE en équerre
    vers les boutons de la colonne qui sont des calques ».

    Le peigne se couche donc sur la ligne et se dresse sur la pile : même
    grammaire, tournée d'un quart de tour.
  */
  it('monte en équerre vers la pile, sans descendre sur les commandes', () => {
    const traits = rangee(7, 390, 65);
    const { barre, branches, montees } = pieces(traits);
    // La barre s'arrête au bord gauche de la colonne — devant « Édition »,
    // jamais dessus.
    // La pile se tient à quatre points du bord, sur une cellule de 58 : le
    // peigne s'arrête au bord GAUCHE de cette cellule.
    expect(Number(barre.props.x2)).toBeLessThanOrEqual(390 - 4 - 58 + 0.5);
    // Une seule montée, et une branche par calque de la pile.
    expect(montees).toHaveLength(1);
    expect(branches).toHaveLength(3);
    // Elles partent toutes de la montée, et pointent vers la droite.
    const xEpine = Number(montees[0].props.x1);
    for (const b of branches) {
      expect(Number(b.props.x1)).toBeCloseTo(xEpine, 3);
      expect(Number(b.props.x2)).toBeGreaterThan(xEpine);
    }
  });

  /*
    LE PEIGNE COMPTE SUR LA MÊME GRILLE QUE LES PASTILLES.

    Relevé du patron : « le Afficher doit se centrer selon les boutons — si
    cinq boutons et rien sur la colonne de droite, on axe aux cinq boutons ;
    s'il y a un bouton sur la colonne, on axe aux boutons de la ligne, sans
    compter le dernier à droite qui possède d'autres boutons au-dessus de
    lui. Le Afficher doit s'adapter. »

    Il comptait sur une grille VOISINE de celle des pastilles : la rangée
    répartit dans `[0, largeur − reserve]` avec dix points de marge, le
    peigne dans `[4, largeur − reserve]` sans marge. L'écart est nul au
    milieu et grandit vers les bords — huit points sur la dernière descente,
    soit un cinquième de pastille : le trait ne tombe plus sur son bouton.
  */
  it('tombe sur la pastille, pas à côté', () => {
    const { descentes } = pieces(rangee(7, 390, 65));
    const decalage = descentes.map((n, i) =>
      Number(cadre().left) + Number(n.props.x1) - axePastille(i, 4, 390),
    );
    expect(decalage.map((d) => Math.round(d * 100) / 100)).toEqual([0, 0, 0, 0]);
  });

  it('et le mot s’axe sur les seules pastilles de la ligne', () => {
    // Quatre sur la ligne, trois en pile : le mot ignore la pile.
    const axeLigne =
      (axePastille(0, 4, 390) + axePastille(3, 4, 390)) / 2;
    rangee(7, 390, 65);
    expect(axeDuMot()).toBeCloseTo(axeLigne, 3);
    // Et quand tout tient sur la ligne, il s'axe sur tout le monde.
    const axeTrois = (axePastille(0, 3, 390) + axePastille(2, 3, 390)) / 2;
    rangee(3, 390);
    expect(axeDuMot()).toBeCloseTo(axeTrois, 3);
  });

  it('garde la descente quand la pile commence sur la ligne (3D)', () => {
    // Sans bouton d'édition, la première pastille de la pile est SUR la
    // ligne : elle se dessert comme les autres, par une descente.
    const { descentes, branches } = pieces(rangee(7, 390, 0));
    expect(descentes).toHaveLength(5);
    // Les deux qui la surmontent sont desservies par des branches.
    expect(branches).toHaveLength(2);
  });
});

describe('le bouton Enregistrer', () => {
  /** À quelle hauteur une pastille se tient : le bloc absolu qui la porte. */
  const pastille = (t: TestRenderer.ReactTestRenderer, label: string) => {
    const b = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === label);
    if (!b) return null;
    let n: TestRenderer.ReactTestInstance | null = b;
    while (n) {
      const st = StyleSheet.flatten(n.props?.style) as
        | { position?: string; bottom?: number }
        | undefined;
      if (st?.position === 'absolute' && typeof st.bottom === 'number') {
        return st.bottom;
      }
      n = n.parent;
    }
    return null;
  };

  it('se tient au-dessus de tout le reste de la colonne', () => {
    const t = monter(true);
    const save = pastille(t, 'Enregistrer');
    const edition = pastille(t, 'Édition');
    expect(save).not.toBeNull();
    expect(edition).not.toBeNull();
    // Plus haut que les commandes, donc plus haut que tout le reste.
    expect(save!).toBeGreaterThan(edition!);
  });

  /*
    LE TROP-PLEIN D'ÉDITION SE POSE JUSTE AU-DESSUS D'« ÉDITION ».

    Relevé du patron : « descends le "Note" d'un bouton, et remonte celui du
    retour en arrière ou refaire. Le Note doit être au-dessus de l'édition. »

    La pile de trop-plein était posée au-dessus de TOUTE la colonne des
    commandes — annuler, refaire, édition. En édition, ce trop-plein n'est
    pas un calque de plus : c'est un OUTIL DE POSE, « Note » sur la capture,
    et sa place est contre le bouton qui l'a fait apparaître. Le retour en
    arrière, lui, monte : on le cherche moins souvent qu'on ne pose.

    L'ordre de la colonne, du pied vers le haut : Édition, ce qui déborde de
    la rangée, les commandes, puis l'enregistrement.
  */
  it('libère l’étage au-dessus d’« Édition » pour le trop-plein', () => {
    const t = monter(true);
    presser(t, 'Édition');
    const ed = pastille(t, 'Édition')!;
    /*
      La fenêtre de ce banc est large : les cinq outils tiennent sur la
      ligne, et « Note » n'a pas à monter. Ce qui se vérifie ici, c'est donc
      la PLACE QU'ON LUI RÉSERVE — `dessus`, la hauteur que la rangée
      franchit pour poser ce qui déborde. Une cellule et un écart : le
      premier étage au-dessus d'« Édition », et rien de plus.
    */
    expect(t.root.findByType(Toolbar2D).props.dessus).toBe(
      PILL_CELL_H + PILL_GAP,
    );
    // Les commandes ont quitté le pied : elles se posent sur ce même étage,
    // et le trop-plein les repoussera d'autant quand il existera.
    const bloc = t.root
      .findAll((n) => n.props?.accessibilityLabel === 'Actions du plan')[0];
    const st = StyleSheet.flatten(bloc.props.style) as { bottom?: number };
    expect(Number(st.bottom) - ed).toBe(PILL_CELL_H + PILL_GAP);
  });

  /*
    EN 3D, IL NE RÉSERVE PLUS LA PLACE D'UNE COLONNE QUI N'Y EST PAS.

    Relevé du patron, capture à l'appui : « le bouton Enregistrer se place
    haut sans raison, il y a de la place plus bas ». Il se posait au-dessus
    de la colonne des commandes — Édition, Annuler, Refaire — dont il
    mesurait la hauteur. Or cette colonne est le propre du plan 2D : en 3D
    on ne modifie rien, elle n'est pas rendue, et sa hauteur restait celle
    du dernier passage en plan. Le bouton flottait donc au milieu de la
    maquette, à trois pastilles au-dessus du vide.

    Dans ce banc, tous les `onLayout` rendent 520 : c'est la hauteur que
    prennent la colonne des commandes ET la pile de calques. Un
    « Enregistrer » qui compte les deux se retrouve deux fois plus haut.
  */
  it('ne réserve pas, en 3D, la colonne de commandes qui n’y est pas', () => {
    const t = monter(true);
    const ligne = pastille(t, 'Édition')!;
    const enPlan = pastille(t, 'Enregistrer')!;
    presser(t, 'Passer en 3D');
    const en3D = pastille(t, 'Enregistrer')!;
    // Il redescend en passant en 3D : la colonne des commandes reste au plan.
    expect(en3D).toBeLessThan(enPlan);
    // Et il ne garde au-dessus de la ligne que la pile de calques — ici
    // rien : les `onLayout` de ce banc partent avant que la carte soit
    // mesurée, donc avant que la pile existe. Le bouton se pose sur la
    // ligne, là où « Édition » se tenait en plan.
    expect(en3D - ligne).toBeLessThanOrEqual(PILL_CELL_H);
  });
});
