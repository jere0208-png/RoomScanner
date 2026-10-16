/**
 * LE MENU « AFFICHER » ET LES RANGÉES REPENSÉES.
 *
 * Relevé du patron : « en mode édition, avant les icônes d'ajout, rajoute un
 * petit “+” ; sur la 3D, “Volumes” est peu intuitif ; rajoute un bouton “…”
 * en bas à droite à la place de Pièces : un menu “Afficher” avec Volumes
 * d'eau, Points cardinaux, Sol (activé par défaut, indépendant de
 * “Surfaces”), la Nuit, Murs… Affiche hors du “…” les plus utiles — meubles,
 * cotes, surfaces —, ajoute d'autres idées de choses à afficher, et donne de
 * l'ampleur aux possibilités du plan 2D ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Animated, Modal, Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Toolbar2D, Toolbar3D } from '../src/screens/result/ResultToolbar';
import { ToolPill } from '../src/components/ToolPill';
import { CalquesSheet } from '../src/components/CalquesSheet';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});
const monter = (el: React.ReactElement) => {
  act(() => {
    arbre = TestRenderer.create(el);
  });
  return arbre!;
};
const libelles = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(ToolPill).map((n) => String(n.props.label));
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
  expect([label, !!b]).toEqual([label, true]);
  act(() => b.props.onPress());
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const PIECE = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

const rangee2D = (edition: boolean) =>
  monter(
    <Toolbar2D
      anim={new Animated.Value(1)}
      largeur={1400}
      bas={0}
      dessus={0}
      edition={edition}
      pendingKind={null}
      pendingCeiling={null}
      pendingNote={false}
      onNote={jest.fn()}
      showMeasures={false}
      setShowMeasures={jest.fn()}
      showRoutes={false}
      showFixtures={false}
      setShowFixtures={jest.fn()}
      setShowRoutes={jest.fn()}
      hasRoutes={false}
      showCeiling={false}
      setShowCeiling={jest.fn()}
      onFixture={jest.fn()}
      onFurniture={jest.fn()}
      onFurnitureOff={jest.fn()}
      seulGeste={jest.fn()}
      setMenu={jest.fn()}
      setPendingCeiling={jest.fn()}
      setPendingSpots={jest.fn()}
    />,
  );

const rangee3D = (autres: Partial<React.ComponentProps<typeof Toolbar3D>> = {}) =>
  monter(
    <Toolbar3D
      anim={new Animated.Value(1)}
      largeur={1400}
      bas={0}
      showMeasures={false}
      setShowMeasures={jest.fn()}
      showCeiling={false}
      setShowCeiling={jest.fn()}
      showVolumes={false}
      setShowVolumes={jest.fn()}
      nuit={false}
      setNuit={jest.fn()}
      zonesHumides={0}
      showElecTags={false}
      setShowElecTags={jest.fn()}
      colorsAvailable={false}
      focusIdx={-1}
      setFocusIdx={jest.fn()}
      {...autres}
    />,
  );

beforeEach(() => {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({ walls: PIECE, showGrille: false, showSol: true });
    useUsage.setState({ modeElec: true });
  });
});

describe('le plan 2D', () => {
  /*
    MIS À JOUR — revue des « découvreurs » : « Dimensions » partout (plus de
    « Cotes » en mode électricité), et la barre est STABLE — les deux actions
    (« + Meuble », « Décorer ») suivent les calques dans les deux vues et les
    deux modes, grisées quand elles n'ont rien à faire plutôt que retirées.
  */
  it('la rangée garde l’essentiel — dimensions, meubles, surfaces, appareils —, les actions, et « Autres » au bout', () => {
    const t = rangee2D(false);
    const ordre = libelles(t);
    expect(ordre).toEqual(['Dimensions', 'Meubles', 'Surfaces', 'Appareils', '+ Meuble', 'Décorer', 'Autres']);
  });

  it('« Autres » ouvre le menu Afficher : grille, couleurs des ouvertures, notes, photos', () => {
    const t = rangee2D(false);
    appuyer(t, 'Autres');
    const vu = textes(t);
    expect(vu).toContain('Afficher sur le plan');
    for (const mot of ['Grille', 'Portes et fenêtres en couleur', 'Notes', 'Photos', 'Gaines (tracé proposé)', 'Plafond']) {
      expect(vu).toContain(mot);
    }
    // Plus d'option « Nord » : la rose des vents ne vit plus que dans le PDF.
    expect(vu).not.toContain('Points cardinaux');
    // La grille s'allume d'un appui sur sa ligne, puis « Valider ».
    appuyer(t, 'Grille');
    appuyer(t, 'Valider');
    expect(useScanStore.getState().showGrille).toBe(true);
    appuyer(t, 'Autres');
    // Un calque vide reste dans la liste, grisé, et dit pourquoi.
    const notes = t.root.findAll((n) => n.props.accessibilityLabel === 'Notes' && n.props.accessibilityRole === 'switch')[0];
    expect(notes.props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(notes.props.accessibilityHint).toMatch(/Aucune note/);
  });

  /*
    L'ÉCLAIR DEVIENT LA PRISE — relevé du patron : « l'éclair en icône pour
    afficher les appareils doit être la prise qu'on a dans Ajouter ». Le
    même dessin pour la même chose, qu'on la pose ou qu'on l'affiche.
  */
  it('« Appareils » porte la prise d’« Ajouter », pas l’éclair', () => {
    const icone = (edition: boolean, label: string) => {
      const t = rangee2D(edition);
      const i = t.root.findAllByType(ToolPill).find((p) => p.props.label === label)?.props.icon;
      act(() => t.unmount());
      arbre = null;
      return i;
    };
    const affiche = icone(false, 'Appareils');
    expect(affiche).toBe(icone(true, 'Appareil'));
    expect(affiche).not.toBe('elec');
    // La ligne « Appareils » du menu « Autres » est partie : elle répétait
    // la pastille (revue des « découvreurs »).
  });

  // « Redresser » s'appelle « Aligner » (revue des « découvreurs »).
  it('en édition, chaque bouton qui ajoute porte son petit « + » — « Aligner » non', () => {
    const t = rangee2D(true);
    const pastilles = t.root.findAllByType(ToolPill);
    const ajout = (label: string) => pastilles.find((p) => p.props.label === label)?.props.ajout === true;
    for (const label of ['Meuble', 'Appareil', 'Plafond', 'Note']) expect([label, ajout(label)]).toEqual([label, true]);
    expect(ajout('Aligner')).toBe(false);
  });

  it('la grille se dessine sous le plan ; notes et photos se cachent hors édition', () => {
    const editeur = lire('src/components/FloorplanEditor.tsx');
    expect(editeur).toContain('const grille = useMemo(() => {');
    expect(editeur).toContain('if (!showGrille || !mapping || walls.length === 0) return null;');
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('photos={editMode || showPhotos ? photos : SANS_PHOTOS}');
    expect(ecran).toContain('notes={editMode || showNotes ? notes : SANS_NOTES}');
  });
});

describe('la maquette 3D', () => {
  // MIS À JOUR : le même ordre, les mêmes mots qu'en plan 2D (revue des
  // « découvreurs ») ; les repères tiennent la place des appareils.
  it('la rangée : dimensions, meubles, surfaces — et « Autres » à la place de « Pièces »', () => {
    const t = rangee3D();
    const ordre = libelles(t);
    expect(ordre).toEqual(['Dimensions', 'Meubles', 'Surfaces', 'Repères', '+ Meuble', 'Décorer', 'Autres']);
    for (const parti of ['Pièces', 'Volumes', 'Nuit', 'Murs', 'Nord']) expect(ordre).not.toContain(parti);
  });

  it('le menu : le sol (allumé), les murs pleins, les volumes de salle d’eau, la pièce isolée', () => {
    act(() => useScanStore.setState({ rooms: [{ id: 'r1', name: 'Séjour' }, { id: 'r2', name: 'Chambre' }] as never }));
    const t = rangee3D();
    appuyer(t, 'Autres');
    const vu = textes(t);
    expect(vu).toContain('Afficher sur la maquette');
    for (const mot of ['Sol', 'Murs pleins', 'Volumes de salle d’eau', 'Nuit', 'Pièce isolée', 'Tout le logement', 'Séjour']) {
      expect(vu).toContain(mot);
    }
    expect(vu).not.toContain('Points cardinaux');
    const sol = t.root.findAll((n) => n.props.accessibilityLabel === 'Sol' && n.props.accessibilityRole === 'switch')[0];
    expect(sol.props.accessibilityState).toEqual({ checked: true, disabled: false });
    appuyer(t, 'Sol');
    appuyer(t, 'Valider');
    expect(useScanStore.getState().showSol).toBe(false);
    appuyer(t, 'Autres');
    // « Volumes » ne se lit plus comme le volume d'une pièce, et dit quand il est vide.
    const volumes = t.root.findAll((n) => n.props.accessibilityLabel === 'Volumes de salle d’eau' && n.props.accessibilityRole === 'switch')[0];
    expect(volumes.props.accessibilityHint).toMatch(/baignoire ni douche/);
    // Sept lignes : le menu ne répète plus les meubles, les dimensions, les
    // surfaces ni les repères, qui ont leur pastille (revue des « découvreurs »).
    expect(t.root.findAllByType(Switch).length).toBeGreaterThanOrEqual(7);
  });

  it('hors électricité, les volumes, la nuit et les repères ne sont pas proposés', () => {
    act(() => useUsage.setState({ modeElec: false }));
    const t = rangee3D();
    appuyer(t, 'Autres');
    const vu = textes(t);
    expect(vu).not.toContain('Volumes de salle d’eau');
    expect(vu).not.toContain('Nuit');
    expect(vu).toContain('Sol');
  });

  it('le sol est indépendant des surfaces', () => {
    const PAL = {
      floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
      wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
      object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
    } as ScenePalette;
    const sols = (o: { showSurfaces: boolean; showSol?: boolean }) =>
      buildScene(PIECE, [], [], { palette: PAL, rooms: [{ id: 'r1' }], ...o }).faces.filter((f) => f.isFloor).length;
    expect(sols({ showSurfaces: false, showSol: true })).toBeGreaterThan(0);
    expect(sols({ showSurfaces: true, showSol: false })).toBe(0);
    // Sans le calque Sol (export, PDF), il suit les surfaces comme avant.
    expect(sols({ showSurfaces: true })).toBeGreaterThan(0);
  });
});

/*
  LE MENU SE VALIDE — ou se quitte sans rien changer.

  Relevé du patron : « le OK et la croix sont au même endroit sur le menu
  Autres. Mets un bouton de validation, et si on clique hors du bloc, ça doit
  quitter sans valider ». Le « OK » de l'en-tête tombait sous la croix de la
  coquille commune ; et chaque interrupteur s'appliquait sur-le-champ, si bien
  qu'il n'y avait rien à valider ni à annuler.
*/
describe('le menu se valide, ou se quitte sans rien changer', () => {
  const ligne = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAll(
      (n) => n.props.accessibilityLabel === label && n.props.accessibilityRole === 'switch' && typeof n.props.onPress === 'function',
      { deep: false },
    )[0];
  const ouvert = (t: TestRenderer.ReactTestRenderer) => t.root.findByType(CalquesSheet).props.visible;

  it('une seule croix en haut — plus de « OK » dessous — et un bouton « Valider »', () => {
    const t = rangee2D(false);
    appuyer(t, 'Autres');
    expect(textes(t)).not.toContain('OK');
    // Le voile se nomme aussi « Fermer » pour VoiceOver (voir
    // `feuilleaccessible.test.tsx`) : on compte les croix, pas lui.
    const fermer = t.root.findAll((n) => n.props.accessibilityLabel === 'Fermer' && typeof n.props.onPress === 'function' && n.props.testID !== 'voile-feuille', { deep: false });
    expect(fermer).toHaveLength(1);
    const valider = t.root.findAll((n) => n.props.accessibilityLabel === 'Valider' && typeof n.props.onPress === 'function', { deep: false });
    expect(valider).toHaveLength(1);
  });

  it('un interrupteur ne change rien tant qu’on n’a pas validé', () => {
    const t = rangee2D(false);
    appuyer(t, 'Autres');
    appuyer(t, 'Grille');
    // La ligne montre le choix…
    expect(ligne(t, 'Grille').props.accessibilityState.checked).toBe(true);
    // … le plan, lui, n'a pas bougé.
    expect(useScanStore.getState().showGrille).toBe(false);
    appuyer(t, 'Valider');
    expect(useScanStore.getState().showGrille).toBe(true);
    expect(ouvert(t)).toBe(false);
  });

  it('un appui hors du bloc referme SANS valider, et le brouillon est oublié', () => {
    const t = rangee2D(false);
    const couleursAvant = useScanStore.getState().showOpeningColors;
    appuyer(t, 'Autres');
    appuyer(t, 'Grille');
    // Une seconde ligne du menu (les dimensions, qui servaient ici, ont
    // quitté le menu : elles ont leur pastille).
    act(() => ligne(t, 'Portes et fenêtres en couleur').props.onPress());
    expect(ligne(t, 'Portes et fenêtres en couleur').props.accessibilityState.checked).toBe(!couleursAvant);
    // Le voile : ce qui reçoit l'appui autour de la feuille. Il est
    // désormais posé À CÔTÉ de la feuille, plus autour (revue VoiceOver,
    // voir `feuilleaccessible.test.tsx`).
    const voile = t.root.findByType(Modal).findAll(
      (x) => typeof x.props.onPress === 'function' && x.props.testID === 'voile-feuille',
      { deep: false },
    )[0];
    expect(voile).toBeDefined();
    act(() => voile.props.onPress());
    expect(ouvert(t)).toBe(false);
    expect(useScanStore.getState().showGrille).toBe(false);
    // Rouvert : les lignes disent l'état RÉEL, pas le brouillon abandonné.
    appuyer(t, 'Autres');
    expect(ligne(t, 'Grille').props.accessibilityState.checked).toBe(false);
    expect(ligne(t, 'Portes et fenêtres en couleur').props.accessibilityState.checked).toBe(couleursAvant);
  });

  it('la croix referme sans valider, elle aussi', () => {
    act(() => useScanStore.setState({ rooms: [{ id: 'r1', name: 'Séjour' }] as never }));
    const t = rangee3D();
    appuyer(t, 'Autres');
    appuyer(t, 'Sol');
    expect(ligne(t, 'Sol').props.accessibilityState).toEqual({ checked: false, disabled: false });
    appuyer(t, 'Fermer');
    expect(ouvert(t)).toBe(false);
    expect(useScanStore.getState().showSol).toBe(true);
  });

  it('la pièce isolée attend la validation, elle aussi', () => {
    act(() => useScanStore.setState({ rooms: [{ id: 'r1', name: 'Séjour' }, { id: 'r2', name: 'Chambre' }] as never }));
    const setFocusIdx = jest.fn();
    const t = rangee3D({ setFocusIdx });
    appuyer(t, 'Autres');
    appuyer(t, 'Chambre');
    expect(setFocusIdx).not.toHaveBeenCalled();
    const puce = t.root.findAll((n) => n.props.accessibilityLabel === 'Chambre' && typeof n.props.onPress === 'function', { deep: false })[0];
    expect(puce.props.accessibilityState).toEqual({ selected: true });
    appuyer(t, 'Valider');
    expect(setFocusIdx).toHaveBeenCalledTimes(1);
    const arg = setFocusIdx.mock.calls[0][0];
    expect(typeof arg === 'function' ? arg(-1) : arg).toBe(1);
  });

  it('valider sans rien toucher ne bascule rien', () => {
    const t = rangee2D(false);
    appuyer(t, 'Autres');
    const avant = useScanStore.getState();
    appuyer(t, 'Valider');
    const apres = useScanStore.getState();
    for (const k of ['showGrille', 'showNotes', 'showPhotos', 'showFurniture', 'showSurfaces'] as const) {
      expect([k, apres[k]]).toEqual([k, avant[k]]);
    }
  });
});
