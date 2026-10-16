/**
 * LA RANGÉE D'OUTILS : CE QUI EST ALLUMÉ, ET CE QUE LE PEIGNE ANNONCE.
 *
 * Trois relevés du patron sur la même bande d'écran (le deuxième, le peigne,
 * a depuis été retiré — voir plus bas) :
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
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { Toolbar2D } from '../src/screens/result/ResultToolbar';
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
  // Les murs pleins et le sol sont passés au menu « Afficher » : ils
  // partent allumés, dans le magasin.
  const ALLUMES = ['Meubles'];
  // « Dimensions » partout, même en mode électricité (revue des
  // « découvreurs » : « Cotes » ici, « Dimensions » là).
  const ETEINTS = ['Dimensions', 'Surfaces', 'Repères'];

  it('n’allume que les meubles, les murs et le sol', () => {
    const t = monter();
    presser(t, 'Passer en 3D');
    for (const nom of ALLUMES) {
      expect({ [nom]: allume(t, nom) }).toEqual({ [nom]: true });
    }
    expect(useScanStore.getState().solidWalls).toBe(true);
    expect(useScanStore.getState().showSol).toBe(true);
    for (const nom of ETEINTS) {
      const etat = allume(t, nom);
      if (etat === undefined) continue;
      expect({ [nom]: etat }).toEqual({ [nom]: false });
    }
  });
});

/*
  LE PEIGNE « AFFICHER » EST PARTI — revue des « découvreurs » : des traits
  qui ne faisaient que décorer, et un mot qui coiffait aussi des actions
  (« + Meuble », « Décorer »). Ses tests (descentes, équerre vers la pile,
  axe du mot) sont retirés avec lui ; `afficher.test.tsx` vérifie qu'il ne
  revient pas.
*/

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
