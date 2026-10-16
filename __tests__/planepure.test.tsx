/**
 * L'ÉCRAN DU PLAN, ÉPURÉ — revue des huit « découvreurs » (agente
 * immobilière, designer produit, retraité bricoleur, électricien,
 * influenceuse déco, maman qui déménage, plombier, étudiante archi).
 *
 * Six sur huit ont dit la même chose de l'écran du plan : trop de chiffres,
 * trop de boutons, des mots qui changent d'une vue à l'autre, un menu de
 * dix-sept lignes, et l'électricité partout. Ce banc tient les six
 * corrections :
 *
 *   1. le bandeau ne garde que les pièces et les m² habitables (et les
 *      appareils pour l'électricien), sous le même mot dans les deux modes ;
 *   2. une barre stable : mêmes pastilles, mêmes mots, mêmes icônes en 2D et
 *      en 3D ; « Visite » n'est plus en bleu plein ; plus de « Liste
 *      d'achats » en haut ; plus de peigne ; « Autres » ne répète rien ;
 *   3. un menu du plan regroupé — « Ajouter une pièce », « Ajouter un
 *      niveau », la façon ensuite ; pas de scan sans LiDAR ; l'électricité
 *      en premier pour l'électricien, absente pour les autres ;
 *   4. des onglets de niveaux visibles ;
 *   5. le mur de face pour tout le monde ;
 *   6. « Ça passe ? » répond aussi oui.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { ResultScreen, nomCourtDuNiveau } from '../src/screens/ResultScreen';
import { Toolbar2D, Toolbar3D } from '../src/screens/result/ResultToolbar';
import { ElecSheet } from '../src/screens/result/ElecSheet';
import { FurnitureSheet } from '../src/screens/result/FurnitureSheet';
import { ToolPill } from '../src/components/ToolPill';
import { ActionSheet } from '../src/components/Sheet';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { texteDePassage } from '../src/components/ObjectBar';
import { passageDuMeuble } from '../src/geometry/passage';
import { appartementExemple } from '../src/data/exemple';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { light } from '../src/theme';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => {
  jest.useRealTimers();
  useUsage.setState({ charge: true, modeElec: true, choisi: true });
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter(modeElec: boolean, autres: Record<string, unknown> = {}) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useUsage.setState({ charge: true, modeElec, choisi: true });
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      scanName: 'Appartement',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      ...autres,
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

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).filter((x) => typeof x === 'string').join(''));
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);
const presser = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = bouton(t, label);
  expect([label, !!b]).toEqual([label, true]);
  act(() => b!.props.onPress());
  act(() => jest.advanceTimersByTime(600));
};
/** Une ligne d'une feuille d'actions, par son libellé. */
const ligne = (t: TestRenderer.ReactTestRenderer, mot: string) =>
  t.root
    .findAll((n) => typeof n.props?.onPress === 'function')
    .filter((n) => n.findAllByType(Text).some((x) => x.props.children === mot))
    .pop();
/** Les mots de la feuille d'actions ouverte — pas ceux de l'écran derrière. */
const menu = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(ActionSheet)
    .filter((n) => !!n.props.data)
    .flatMap((n) => n.findAllByType(Text))
    .map((n) => [].concat(n.props.children ?? []).filter((x) => typeof x === 'string').join(''));
const choisir = (t: TestRenderer.ReactTestRenderer, mot: string) => {
  const l = ligne(t, mot);
  expect([mot, !!l]).toEqual([mot, true]);
  act(() => l!.props.onPress());
  act(() => jest.advanceTimersByTime(600));
};
/** Les pastilles de la barre du bas, dans l'ordre : mot et icône. */
const barre = (t: TestRenderer.ReactTestRenderer) => {
  const outils = t.root.findAll((n) => n.type === Toolbar2D || n.type === Toolbar3D)[0];
  return outils.findAllByType(ToolPill).map((p) => ({ mot: String(p.props.label), icone: p.props.icon }));
};

describe('1. le bandeau de chiffres ne garde que l’utile', () => {
  it('pour tous : les pièces et les m² habitables — ni murs, ni tour des pièces, ni meubles', () => {
    const vu = textes(monter(false));
    expect(vu).toContain('pièces');
    expect(vu).toContain('m² habitables');
    for (const parti of ['murs', 'm tour des pièces', 'meubles', 'm² sol', 'élec.']) {
      expect([parti, vu.includes(parti)]).toEqual([parti, false]);
    }
  });

  it('pour l’électricien : le même mot, et le nombre d’appareils', () => {
    const vu = textes(monter(true));
    expect(vu).toContain('m² habitables');
    expect(vu).not.toContain('m² sol');
    expect(vu).toContain('élec.');
    expect(vu).not.toContain('murs');
  });
});

describe('2. une barre stable et des boutons hiérarchisés', () => {
  it('les mêmes pastilles, aux mêmes places, en 2D et en 3D', () => {
    const t = monter(false);
    const en2D = barre(t);
    expect(en2D.map((p) => p.mot)).toEqual(['Dimensions', 'Meubles', 'Surfaces', '+ Meuble', 'Décorer', 'Autres']);
    presser(t, 'Passer en 3D');
    const en3D = barre(t);
    expect(en3D).toEqual(en2D);
  });

  it('en mode électricité : « Dimensions » aussi, et les repères à la place des appareils', () => {
    const t = monter(true);
    const en2D = barre(t).map((p) => p.mot);
    expect(en2D).toEqual(['Dimensions', 'Meubles', 'Surfaces', 'Appareils', '+ Meuble', 'Décorer', 'Autres']);
    expect(en2D).not.toContain('Cotes');
    presser(t, 'Passer en 3D');
    const en3D = barre(t).map((p) => p.mot);
    expect(en3D).toEqual(['Dimensions', 'Meubles', 'Surfaces', 'Repères', '+ Meuble', 'Décorer', 'Autres']);
  });

  it('les icônes : Surfaces la même partout ; le calque Meubles n’est pas l’action + Meuble', () => {
    const t = monter(false);
    const icone = (mot: string) => barre(t).find((p) => p.mot === mot)!.icone;
    const surfaces2D = icone('Surfaces');
    expect(icone('Meubles')).not.toBe(icone('+ Meuble'));
    presser(t, 'Passer en 3D');
    expect(icone('Surfaces')).toBe(surfaces2D);
    expect(icone('Meubles')).not.toBe(icone('+ Meuble'));
  });

  it('plus de peigne : ni « Afficher », ni traits en arbre au-dessus de la barre', () => {
    const t = monter(false);
    expect(textes(t)).not.toContain('Afficher');
    const outils = t.root.findByType(Toolbar2D);
    expect(outils.findAllByType(Line)).toHaveLength(0);
  });

  it('« Visite » n’est plus en bleu plein, et la liste d’achats a quitté la rangée du haut', () => {
    const t = monter(false);
    const visite = bouton(t, 'Explorer')!;
    const fond = (StyleSheet.flatten(visite.props.style) as { backgroundColor?: string }).backgroundColor;
    expect(fond).not.toBe(light.blue);
    expect(bouton(t, 'Liste d’achats')).toBeUndefined();
  });

  it('« Autres » ne répète pas les pastilles de la barre', () => {
    const t = monter(true);
    presser(t, 'Autres');
    const lignes = t.root
      .findAll((n) => n.props.accessibilityRole === 'switch' && typeof n.props.onPress === 'function', { deep: false })
      .map((n) => String(n.props.accessibilityLabel));
    expect(lignes.length).toBeGreaterThan(0);
    for (const deja of ['Dimensions', 'Meubles', 'Surfaces', 'Appareils']) {
      expect([deja, lignes.includes(deja)]).toEqual([deja, false]);
    }
    expect(lignes).toContain('Grille');
  });

  it('« + Meuble » depuis la 3D revient au plan et ouvre le catalogue', () => {
    const t = monter(false);
    presser(t, 'Passer en 3D');
    // La maquette se relève : on attend la fin du mouvement.
    act(() => jest.advanceTimersByTime(3000));
    expect(t.root.findByType(FurnitureSheet).props.visible).toBe(false);
    presser(t, '+ Meuble');
    act(() => jest.advanceTimersByTime(3000));
    expect(bouton(t, 'Passer en 3D')).toBeDefined();
    expect(t.root.findByType(FurnitureSheet).props.visible).toBe(true);
  });

  it('« Redresser » s’appelle « Aligner »', () => {
    const t = monter(false);
    presser(t, 'Édition');
    expect(bouton(t, 'Aligner')).toBeDefined();
    expect(bouton(t, 'Redresser')).toBeUndefined();
  });
});

describe('3. le menu du plan, regroupé', () => {
  it('dit QUOI ajouter — une pièce, un niveau, un mur —, sans « Scanner… » ni « Dessiner… » au premier niveau', () => {
    const t = monter(false);
    presser(t, 'Plus');
    const vu = menu(t);
    for (const l of ['Ajouter une pièce', 'Ajouter un niveau', 'Ajouter un mur', 'Liste d’achats', 'Recalculer les pièces']) {
      expect([l, vu.includes(l)]).toEqual([l, true]);
    }
    for (const l of [
      'Scanner une autre pièce',
      'Scanner un étage',
      'Scanner un sous-sol',
      'Dessiner un étage',
      'Dessiner un sous-sol',
      'Dessiner une pièce à la main',
      'Redétecter les pièces',
      'Décorer',
      'Placer prises et interrupteurs',
    ]) {
      expect([l, vu.includes(l)]).toEqual([l, false]);
    }
  });

  it('la façon — scanner ou dessiner — se choisit ensuite', () => {
    const t = monter(false);
    presser(t, 'Plus');
    choisir(t, 'Ajouter un niveau');
    const vu = menu(t);
    for (const l of ['Scanner un étage', 'Dessiner un étage', 'Scanner un sous-sol', 'Dessiner un sous-sol']) {
      expect([l, vu.includes(l)]).toEqual([l, true]);
    }
  });

  it('sans LiDAR, aucun « Scanner… » pour un niveau', () => {
    const t = monter(false, { supported: false });
    presser(t, 'Plus');
    choisir(t, 'Ajouter un niveau');
    const vu = menu(t);
    expect(vu).toContain('Dessiner un étage');
    expect(vu).toContain('Dessiner un sous-sol');
    expect(vu.some((m) => m.startsWith('Scanner'))).toBe(false);
  });

  it('sans LiDAR, la pièce se dessine tout de suite', () => {
    const t = monter(false, { supported: false });
    presser(t, 'Plus');
    choisir(t, 'Ajouter une pièce');
    const vu = textes(t);
    expect(vu).not.toContain('Scanner une autre pièce');
    // Les gabarits de la pièce à poser : on est déjà dans le dessin.
    expect(vu).toContain('WC');
  });

  it('en mode électricité, le métier vient EN PREMIER', () => {
    const t = monter(true);
    presser(t, 'Plus');
    const vu = menu(t);
    const tableau = vu.indexOf('Relever le tableau existant');
    const normes = vu.indexOf('Normes auto');
    const achats = vu.indexOf('Liste d’achats');
    expect(tableau).toBeGreaterThanOrEqual(0);
    expect(normes).toBeGreaterThan(tableau);
    expect(achats).toBeGreaterThan(normes);
  });
});

describe('4. les niveaux en onglets', () => {
  const ETAGE = SNAPSHOT_WALLS.map((w) => ({ ...w, id: `${w.id}-r1`, niveau: 1 }));

  it('dès deux niveaux, des onglets nommés en clair, du plus bas au plus haut', () => {
    const t = monter(false, { walls: [...SNAPSHOT_WALLS, ...ETAGE] });
    const onglets = t.root
      .findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function', { deep: false })
      .map((n) => String(n.props.accessibilityLabel));
    expect(onglets).toEqual(['Rez-de-chaussée', '1er étage']);
    expect(textes(t)).toContain('RDC');
    expect(textes(t)).toContain('1er étage');
    // L'ancienne pastille « R+1 ⌃⌄ » a cédé la place.
    expect(bouton(t, 'Changer d’étage')).toBeUndefined();
  });

  it('un appui change de niveau ; l’onglet affiché le dit', () => {
    const t = monter(false, { walls: [...SNAPSHOT_WALLS, ...ETAGE] });
    presser(t, '1er étage');
    expect(useScanStore.getState().niveauCourant).toBe(1);
    expect(bouton(t, '1er étage')!.props.accessibilityState).toEqual({ selected: true });
    expect(bouton(t, 'Rez-de-chaussée')!.props.accessibilityState).toEqual({ selected: false });
  });

  it('un seul niveau : pas d’onglets', () => {
    const t = monter(false);
    expect(t.root.findAll((n) => n.props.accessibilityRole === 'tab', { deep: false })).toHaveLength(0);
  });

  it('les noms courts', () => {
    expect([-1, 0, 1, 2].map(nomCourtDuNiveau)).toEqual(['Sous-sol', 'RDC', '1er étage', '2e étage']);
  });
});

describe('5. le mur de face, pour tout le monde', () => {
  const ouvrirLeMur = (t: TestRenderer.ReactTestRenderer) => {
    presser(t, 'Édition');
    const plan = t.root.findAllByType(FloorplanEditor)[0];
    act(() => plan.props.onSelectWall(SNAPSHOT_WALLS[0].id));
    act(() => jest.advanceTimersByTime(400));
  };

  it('hors mode électricité, un mur choisi s’ouvre de face — coté, sans les outils d’appareillage', () => {
    const t = monter(false);
    ouvrirLeMur(t);
    presser(t, 'De face');
    const feuille = t.root.findByType(ElecSheet);
    expect(feuille.props.visible).toBe(true);
    expect(feuille.props.vue).toBe('mur');
    // Rien n'est tenu d'avance : la fiche d'un appareil n'a pas à s'ouvrir.
    expect(feuille.props.selectedId).toBeNull();
    const vu = feuille.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));
    expect(vu).toContain('Le mur, vu de face');
    expect(vu).not.toContain('Poser un appareil');
  });

  it('en mode électricité, l’établi garde ses outils', () => {
    const t = monter(true);
    ouvrirLeMur(t);
    presser(t, 'Élec');
    const feuille = t.root.findByType(ElecSheet);
    expect(feuille.props.visible).toBe(true);
    const vu = feuille.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));
    expect(vu).not.toContain('Le mur, vu de face');
  });
});

describe('6. « Ça passe ? » répond aussi oui', () => {
  it('le canapé qui passe jusqu’au séjour compte ses portes', () => {
    const ex = appartementExemple();
    const salle = ex.rooms.find((r) => r.name === 'Séjour-cuisine')!.id;
    const canape = {
      id: 'k',
      category: 'sofa',
      width: 1.8,
      depth: 0.88,
      height: 0.8,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0.4, 2, 1],
      roomId: salle,
    } as ObjectData;
    const v = passageDuMeuble(canape, { walls: ex.walls, openings: ex.openings, rooms: ex.rooms })!;
    expect(v.ok).toBe(true);
    expect(v.portes).toBeGreaterThanOrEqual(1);
    expect(texteDePassage(v)).toMatch(/^✓ Passe par (la porte|les \d+ portes)$/);
  });

  it('la phrase : le oui coché, le non tel quel', () => {
    expect(texteDePassage({ ok: true, court: 'Passe par les portes', detail: '', portes: 3 })).toBe('✓ Passe par les 3 portes');
    expect(texteDePassage({ ok: true, court: 'Passe en modules', detail: '' })).toBe('✓ Passe en modules');
    expect(texteDePassage({ ok: false, court: 'Ne passe pas par la porte d’entrée', detail: '' })).toBe('Ne passe pas par la porte d’entrée');
  });
});
