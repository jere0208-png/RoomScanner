/**
 * DIAGNOSTIQUER UN PLAN — lire ses problèmes et ses données, et les envoyer.
 *
 * Relevé du patron : « je rencontre parfois des erreurs, comme une pièce qui
 * n'est pas fermée et ne veut pas se fermer après un scan. Fais en sorte
 * qu'on puisse diagnostiquer un plan pour lire tous les problèmes et les
 * données du plan. Envoie les diagnostics complets d'un plan (chaque
 * utilisateur pourra envoyer un diagnostic depuis les options des plans dans
 * le menu principal) à echoplansupport@gmail.com. Donne la possibilité à
 * l'utilisateur de marquer ce qui n'allait pas avec son plan, en vue d'une
 * amélioration de l'application. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NativeModules, ScrollView, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import {
  REMARQUES,
  diagnostiquerPlan,
  dossierDuDiagnostic,
  pourquoiOuverte,
  rapportDuDiagnostic,
} from '../src/geometry/diagnosticPlan';
import type { WallSeg } from '../src/geometry/floorplan';
import { COURRIEL_SUPPORT } from '../src/native/support';
import { DiagnosticPlanScreen } from '../src/screens/DiagnosticPlanScreen';
import { useAstuce } from '../src/ui/astuce';
import { HOLD_MS, LibraryScreen } from '../src/screens/LibraryScreen';
import { useScanStore, type SavedScan } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Un séjour de 4 × 3 m ; `e` et `s` disent comment se finit son coin est. */
const sejour = (e: WallSeg, s: WallSeg, ids = ['n', 'e', 's', 'o']) => ({
  walls: [mur('n', 0, 0, 4, 0), e, s, mur('o', 0, 3, 0, 0)],
  openings: [] as WallSeg[],
  rooms: [{ id: 'r1', name: 'Séjour', wallIds: ids }],
  objects: [],
});

const FERME = sejour(mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3));
const PRESQUE = sejour(mur('e', 4, 0, 4, 2.96), mur('s', 4, 3, 0, 3));
const TROU = sejour(mur('e', 4, 0, 4, 2.2), mur('s', 4, 3, 0, 3));

describe('pourquoi une pièce ne se ferme pas', () => {
  it('une pièce fermée : rien à redire', () => {
    const d = diagnostiquerPlan(FERME);
    expect(d.pieces[0].fermee).toBe(true);
    expect(d.pieces[0].raisons).toEqual([]);
    expect(d.pieces[0].aire).toBeCloseTo(12, 1);
  });

  it('deux murs qui se frôlent sans se rejoindre : l’écart, au centimètre', () => {
    const d = diagnostiquerPlan(PRESQUE);
    expect(d.pieces[0].fermee).toBe(false);
    expect(d.pieces[0].raisons.join(' ')).toMatch(/presque/);
    expect(d.pieces[0].raisons.join(' ')).toMatch(/4 cm/);
    expect(d.problemes.some((p) => p.gravite === 'alerte' && /Séjour/.test(p.titre))).toBe(true);
  });

  it('un morceau de mur qui manque : sa largeur', () => {
    const d = diagnostiquerPlan(TROU);
    expect(d.pieces[0].raisons.join(' ')).toMatch(/manque.*80 cm/);
  });

  it('une pièce qui cite un mur disparu', () => {
    const d = diagnostiquerPlan(sejour(mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), ['n', 'e', 's', 'o', 'fantome']));
    // Elle se ferme quand même : ce n'est pas une raison, mais c'est un constat.
    expect(d.pieces[0].fermee).toBe(true);
    expect(d.problemes.some((p) => p.code === 'murDisparu' && /n’existe plus/.test(p.titre))).toBe(true);
  });

  it('une cloison qui bute au milieu d’un mur sans le couper', () => {
    const plan = { ...FERME, walls: [...FERME.walls, mur('c', 2, 0.0, 2, 1.5)] };
    const ids = ['n', 'e', 's', 'o', 'c'];
    plan.rooms = [{ id: 'r1', name: 'Séjour', wallIds: ids }];
    // Elle ne l'empêche plus de se fermer : une cloison qui ne ferme rien
    // (une niche, un retour) se met de côté pour le contour.
    expect(diagnostiquerPlan(plan).pieces[0].fermee).toBe(true);
    // Le constat, lui, se dit toujours quand on demande pourquoi.
    expect(pourquoiOuverte(plan.walls, ids, new Set(ids)).join(' ')).toMatch(/bute au milieu/);
  });

  it('le résumé compte ce que le plan contient', () => {
    const d = diagnostiquerPlan({
      ...FERME,
      openings: [{ ...mur('f1', 1, 0, 2.2, 0), type: 'window', height: 1.35, yCenter: 1.4 }],
    });
    expect(d.resume.murs).toBe(4);
    expect(d.resume.fenetres).toBe(1);
    expect(d.resume.pieces).toBe(1);
  });
});

describe('le rapport et le dossier joint', () => {
  const plan = { ...PRESQUE, name: 'Chantier Dupont', client: 'M. Dupont', address: '3 rue des Lilas' };
  const d = diagnostiquerPlan(plan);
  const remarques = ['pieceOuverte'];
  const contexte = { version: '1.0 (12)', appareil: 'iPhone15,2', systeme: 'iOS 18.1' };

  it('le courrier se lit : le plan, ce que l’utilisateur a coché, ce qu’il a écrit, ce que l’app a vu', () => {
    const t = rapportDuDiagnostic({ nom: plan.name, diag: d, remarques, commentaire: 'Le coin du séjour reste ouvert', contexte });
    expect(t).toContain('Chantier Dupont');
    expect(t).toContain(REMARQUES.find((r) => r.cle === 'pieceOuverte')!.libelle);
    expect(t).toContain('Le coin du séjour reste ouvert');
    expect(t).toMatch(/presque/);
    expect(t).toContain('iPhone15,2');
  });

  it('le dossier porte toutes les données du plan, mais pas les coordonnées du client', () => {
    const json = JSON.parse(dossierDuDiagnostic({ plan, diag: d, remarques, commentaire: '', contexte }));
    expect(json.plan.walls).toHaveLength(4);
    expect(json.remarques).toEqual(['pieceOuverte']);
    expect(json.diagnostic.pieces[0].fermee).toBe(false);
    expect(json.plan.client).toBeUndefined();
    expect(json.plan.address).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('Lilas');
  });
});

const sauve = (id: string, name: string, p: ReturnType<typeof sejour>): SavedScan => ({
  id,
  name,
  createdAt: 1_000,
  updatedAt: 1_000,
  modelPath: '',
  rooms: p.rooms.map((r) => ({ ...r, floor: null })),
  walls: p.walls,
  openings: p.openings,
  objects: [],
  fixtures: [],
  photos: [],
  ceiling: [],
});

describe('depuis les options d’un plan', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('« Diagnostiquer le plan » ouvre sa page', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({ screen: 'library', saves: [sauve('a', 'Chantier Dupont', PRESQUE)], folders: [], currentSaveId: null });
      t = TestRenderer.create(<LibraryScreen />);
    });
    const options = t.root.findAll((n) => String(n.props.accessibilityLabel ?? '') === 'Options de Chantier Dupont' && typeof n.props.onPress === 'function');
    act(() => options[0].props.onPress());
    const choix = t.root
      .findAll((n) => typeof n.props?.onPress === 'function' && n.findAllByType(Text).some((x) => String(x.props.children) === 'Diagnostiquer le plan'))
      .pop();
    expect(choix).toBeDefined();
    act(() => choix!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(HOLD_MS + 120);
    });
    expect(useScanStore.getState().screen).toBe('diagnostic');
    expect(useScanStore.getState().diagnosticId).toBe('a');
    act(() => t.unmount());
  });
});

describe('la page du diagnostic', () => {
  const monter = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({ screen: 'diagnostic', diagnosticId: 'a', saves: [sauve('a', 'Chantier Dupont', PRESQUE)] });
      t = TestRenderer.create(<DiagnosticPlanScreen />);
    });
    return t;
  };
  const textes = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
  const parLabel = (t: TestRenderer.ReactTestRenderer, l: string) =>
    t.root.findAll((n) => n.props.accessibilityLabel === l && typeof n.props.onPress === 'function', { deep: false })[0];

  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).RoomScanSupport;
  });

  it('montre ce que l’app a vu : la pièce ouverte et pourquoi', () => {
    const t = monter();
    const vus = textes(t).join(' | ');
    expect(vus).toMatch(/Séjour/);
    expect(vus).toMatch(/ne se ferme pas/);
    expect(vus).toMatch(/presque/);
    act(() => t.unmount());
  });

  it('on coche, on écrit, on envoie : le courrier part au support avec le dossier joint', async () => {
    const composeMailTexte = jest.fn(async () => 'sent');
    (NativeModules as Record<string, unknown>).RoomScanSupport = { composeMailTexte };
    const t = monter();
    act(() => parLabel(t, REMARQUES[0].libelle).props.onPress());
    act(() => t.root.findByType(TextInput).props.onChangeText('Le coin reste ouvert'));
    await act(async () => {
      await parLabel(t, 'Envoyer le diagnostic').props.onPress();
    });
    expect(composeMailTexte).toHaveBeenCalledTimes(1);
    const [dest, sujet, corps, fichier, contenu] = composeMailTexte.mock.calls[0] as unknown as string[];
    expect(dest).toBe(COURRIEL_SUPPORT);
    expect(sujet).toContain('Chantier Dupont');
    expect(corps).toContain('Le coin reste ouvert');
    expect(fichier).toMatch(/\.json$/);
    expect(JSON.parse(contenu).remarques).toEqual([REMARQUES[0].cle]);
    // Parti : la page se ferme, retour au menu, et le merci s'y affiche.
    expect(useScanStore.getState().screen).toBe('library');
    const a = useAstuce.getState();
    expect([a.courante, ...a.file].map((x) => x?.texte).join(' ')).toMatch(/Merci/);
    act(() => t.unmount());
  });

  it('envoi annulé : la page reste, la note tapée avec', async () => {
    (NativeModules as Record<string, unknown>).RoomScanSupport = { composeMailTexte: jest.fn(async () => 'cancelled') };
    const t = monter();
    act(() => t.root.findByType(TextInput).props.onChangeText('Le coin reste ouvert'));
    await act(async () => {
      await parLabel(t, 'Envoyer le diagnostic').props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('diagnostic');
    expect(t.root.findByType(TextInput).props.value).toBe('Le coin reste ouvert');
    expect(textes(t).join(' ')).toMatch(/annulé/);
    act(() => t.unmount());
  });

  /*
    LE CLAVIER NE CACHE PLUS CE QU'ON ÉCRIT — relevé du patron, capture à
    l'appui : « la saisie de texte empêche de voir ce que l'on écrit, et on
    ne peut pas valider en ayant ce bloc gênant ». La page remonte au-dessus
    du clavier et amène le champ en vue ; « Terminé » range le clavier.
  */
  it('le clavier remonte la page, amène le champ en vue, et « Terminé » le range', () => {
    const t = monter();
    const defile = t.root.findAll((n) => n.props.automaticallyAdjustKeyboardInsets === true, { deep: false })[0];
    expect(defile).toBeDefined();
    expect(defile.props.keyboardDismissMode).toBe('interactive');
    const champ = t.root.findByType(TextInput);
    expect(champ.props.returnKeyType).toBe('done');
    expect(champ.props.blurOnSubmit).toBe(true);
    // Au toucher du champ, la page défile jusqu'à lui.
    const vers = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {});
    jest.useFakeTimers();
    act(() => champ.props.onFocus?.());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    jest.useRealTimers();
    expect(vers).toHaveBeenCalled();
    vers.mockRestore();
    act(() => t.unmount());
  });

  it('sans compte Mail sur le téléphone, le dossier passe par le partage', async () => {
    (NativeModules as Record<string, unknown>).RoomScanSupport = { composeMailTexte: jest.fn(async () => 'unavailable') };
    (RoomScan.shareText as jest.Mock).mockClear();
    const t = monter();
    await act(async () => {
      await parLabel(t, 'Envoyer le diagnostic').props.onPress();
    });
    expect(RoomScan.shareText).toHaveBeenCalledTimes(1);
    expect(String((RoomScan.shareText as jest.Mock).mock.calls[0][1])).toMatch(/\.json$/);
    act(() => t.unmount());
  });
});

describe('le natif sait joindre un dossier texte, et dire qui l’envoie', () => {
  it('composeMailTexte, en application/json ; la version et le modèle', () => {
    const swift = lire('modules/react-native-room-scan/ios/RoomScanSupport.swift');
    expect(swift).toContain('@objc func composeMailTexte(');
    expect(swift).toContain('"application/json"');
    expect(swift).toContain('@objc func infos(');
    const pont = lire('modules/react-native-room-scan/ios/RoomScan.m');
    expect(pont).toContain('RCT_EXTERN_METHOD(composeMailTexte:');
    expect(pont).toContain('RCT_EXTERN_METHOD(infos:');
  });
});
