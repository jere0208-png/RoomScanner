/**
 * GAINS RAPIDES DU RELEVÉ — revue « Relevé / premier usage ».
 *
 * Neuf retouches de l'écran de scan et de sa fin, chacune tenue ici :
 *
 *   1. après un échec, plus d'« Assemblage… » sans fin : le panneau d'échec
 *      est la seule chose à toucher, l'assemblage qui s'éternise offre une
 *      sortie, et le natif répond tout de suite à « Terminer » ;
 *   2. une vieille erreur ne rouvre plus le scan d'étage ou de pièce ;
 *   3. le Centre de contrôle ne coupe plus le scan ;
 *   4. les messages de fin de scan vont dans le bilan, et la file attend ;
 *   5. le bilan d'un étage parle de cet étage ; celui d'un passage de plus
 *      dit son apport par différence de totaux ;
 *   6. pendant le scan, on rappelle ce qu'on scanne ;
 *   7. la pause explique comment reprendre ;
 *   8. les boutons suivent les marges de l'iPhone ;
 *   9. des mots qui guident : « d'une traite », « Meubles ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import TestRenderer, { act } from 'react-test-renderer';
import {
  ASSEMBLAGE_TROP_LONG,
  DUREE_CONTEXTE,
  ScanScreen,
  contexteDuScan,
} from '../src/screens/ScanScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { CameraScreen } from '../src/screens/CameraScreen';
import { AstuceHote } from '../src/components/AstuceHote';
import { BilanDuReleveCarte } from '../src/components/BilanDuReleve';
import { apportDuPassage, demarrerComplement, demarrerEtage } from '../src/native/useRoomScan';
import { useScanStore } from '../src/store/scanStore';
import { useBilanStore, type BilanAffiche } from '../src/store/bilanStore';
import { useAccountStore } from '../src/store/accountStore';
import { usePremieresFois } from '../src/store/premieresFois';
import { useUsage } from '../src/store/usage';
import { useAstuce } from '../src/ui/astuce';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const st = () => useScanStore.getState();

const SOL = -1.3;
let n = 0;
/** Un mur RoomPlan, de (ax, az) à (bx, bz). */
const mur = ([ax, az, bx, bz]: number[]) => {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `g${++n}-0000`,
    type: 'wall',
    length: L,
    height: 2.5,
    confidence: 'high',
    category: 'wall',
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, SOL + 1.25, (az + bz) / 2, 1],
  };
};
/** Une pièce rectangulaire, en quatre murs. */
const rectangle = (x: number, z: number, l: number, p: number) => [
  mur([x, z, x + l, z]),
  mur([x + l, z, x + l, z + p]),
  mur([x + l, z + p, x, z + p]),
  mur([x, z + p, x, z]),
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function monter(el: React.ReactElement) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  arbre = t;
  return t;
}

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((x) => [].concat(x.props.children).filter((c) => typeof c === 'string').join(''));

const parLabel = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((x) => typeof x.props?.onPress === 'function' && x.props?.accessibilityLabel === label, {
    deep: false,
  });

/** Le scan en cours, sur un magasin propre. */
function enScan(extra: Record<string, unknown> = {}) {
  act(() => {
    st().reset();
    useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false, ...extra } as never);
  });
}

/** Appuie sur « Terminer » et attend la fin du scan. */
async function terminer(t: TestRenderer.ReactTestRenderer) {
  const fin = t.root
    .findAllByType(TouchableOpacity)
    .find((x) => x.findAllByType(Text).some((y) => y.props.children === 'Terminer'))!;
  await act(async () => {
    await fin.props.onPress();
  });
}

describe('1. après un échec de scan, plus d’écran qui tourne sans fin', () => {
  it('le panneau d’échec est la seule chose à toucher : ni Terminer, ni pause, ni « Poser »', () => {
    act(() => useUsage.setState({ modeElec: true }));
    enScan({ error: 'RoomCaptureSession.CaptureError error 3.' });
    const t = monter(<ScanScreen />);
    const tx = textes(t);
    expect(tx).toContain('Le relevé n’a pas abouti');
    expect(tx).toContain('Quitter le scan');
    expect(tx).not.toContain('Terminer');
    expect(tx).not.toContain('Poser');
    expect(parLabel(t, 'Mettre en pause')).toHaveLength(0);
    expect(parLabel(t, 'Afficher la pose')).toHaveLength(0);
    expect(parLabel(t, 'Quitter le scan')).toHaveLength(1);
  });

  it('un assemblage qui s’éternise offre « Quitter le scan », qui sort vraiment', () => {
    jest.useFakeTimers();
    enScan({ processing: true });
    const t = monter(<ScanScreen />);
    expect(textes(t)).toContain('Assemblage du modèle 3D…');
    expect(parLabel(t, 'Quitter le scan')).toHaveLength(0);
    act(() => {
      jest.advanceTimersByTime(ASSEMBLAGE_TROP_LONG - 1000);
    });
    expect(parLabel(t, 'Quitter le scan')).toHaveLength(0);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const sortie = parLabel(t, 'Quitter le scan');
    expect(sortie).toHaveLength(1);
    act(() => sortie[0].props.onPress());
    expect(st().scanning).toBe(false);
    expect(st().processing).toBe(false);
  });

  it('un assemblage quitté qui aboutit après coup ne touche pas au scan suivant', async () => {
    jest.useFakeTimers();
    let livrer!: (v: unknown) => void;
    (RoomScan.stop as jest.Mock).mockImplementationOnce(() => new Promise((r) => (livrer = r)));
    enScan();
    const t = monter(<ScanScreen />);
    let fin!: Promise<void>;
    act(() => {
      fin = t.root
        .findAllByType(TouchableOpacity)
        .find((x) => x.findAllByType(Text).some((y) => y.props.children === 'Terminer'))!
        .props.onPress();
    });
    expect(st().processing).toBe(true);
    act(() => {
      jest.advanceTimersByTime(ASSEMBLAGE_TROP_LONG);
    });
    act(() => parLabel(t, 'Quitter le scan')[0].props.onPress());
    // Un autre relevé commence…
    act(() => useScanStore.setState({ screen: 'scan', scanning: true, processing: false } as never));
    // … et l'ancien assemblage finit enfin.
    await act(async () => {
      livrer({ surfaces: rectangle(0, 0, 4, 3), objects: [], modelPath: '' });
      await fin;
    });
    expect(st().screen).toBe('scan');
    expect(st().scanning).toBe(true);
    expect(st().walls).toHaveLength(0);
  });

  it('le natif répond tout de suite à « Terminer » sur une session tombée en panne', () => {
    const m = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    // Le drapeau se lève dans didEndWith(error), se baisse à chaque session.
    const finEnErreur = m.slice(m.indexOf('didEndWith data: CapturedRoomData'));
    expect(finEnErreur.slice(0, 400)).toContain('sessionEnPanne = true');
    const demarrer = m.slice(m.indexOf('func start(fresh: Bool'), m.indexOf('func poserAuViseur'));
    expect(demarrer).toContain('sessionEnPanne = false');
    // Une promesse abandonnée ne s'enchaîne pas au relevé suivant.
    expect(demarrer).toContain('clearPromise()');
    expect(demarrer).toContain('dernierePiece = nil');
    const arreter = m.slice(m.indexOf('func stop(resolve:'), m.indexOf('private func lancerLeMaillage'));
    expect(arreter).toMatch(
      /if sessionEnPanne && dernierReleve == nil && embelli == nil \{[\s\S]*?stopRejecter\?\("SCAN_FAILED"[\s\S]*?clearPromise\(\)[\s\S]*?return/,
    );
    // Et la réponse passe AVANT l'arrêt d'une session déjà close.
    expect(arreter.indexOf('if sessionEnPanne')).toBeLessThan(arreter.indexOf('captureSession.stop()'));
    // Un assemblage d'un relevé quitté se tait : numéro de relevé, vue d'avant muette.
    expect(demarrer).toContain('generationReleve &+= 1');
    expect(m.match(/guard self\.generationReleve == generation else \{ return \}/g)?.length).toBe(3);
    const vue = m.slice(m.indexOf('func makeCaptureView'), m.indexOf('func makeCaptureView') + 600);
    expect(vue).toContain('captureView?.delegate = nil');
    expect(vue.indexOf('captureView?.delegate = nil')).toBeLessThan(vue.indexOf('RoomCaptureView(frame: .zero)'));
  });
});

describe('2. une ancienne erreur ne réapparaît plus au scan suivant', () => {
  beforeEach(() => {
    act(() => {
      st().reset();
      useScanStore.setState({ supported: true, error: 'ancien échec' } as never);
    });
  });

  it('« Scanner une autre pièce » part d’une ardoise propre', async () => {
    await act(async () => {
      await demarrerComplement();
    });
    expect(st().screen).toBe('scan');
    expect(st().error).toBeNull();
  });

  it('« Scanner un étage » aussi', async () => {
    act(() => useAccountStore.setState({ peutCreerPlan: () => true } as never));
    await act(async () => {
      await demarrerEtage(1);
    });
    expect(st().screen).toBe('scan');
    expect(st().error).toBeNull();
  });

  it('« Quitter le scan » d’un scan parti du plan ramène au plan sans l’erreur', () => {
    enScan({ complementEnCours: true, error: 'boom' });
    const t = monter(<ScanScreen />);
    act(() => parLabel(t, 'Quitter le scan')[0].props.onPress());
    expect(st().screen).toBe('result');
    expect(st().error).toBeNull();
  });

  it('l’accueil dit la consigne commune, puis l’oublie en quittant', () => {
    jest.useFakeTimers();
    act(() => {
      useScanStore.setState({ screen: 'home', saves: [], brouillon: null, error: 'boom' } as never);
    });
    const t = monter(<HomeScreen />);
    const tx = textes(t);
    expect(tx).toContain('Le relevé n’a pas abouti');
    expect(tx.some((x) => /Éclairez la pièce.*\(boom\)/.test(x))).toBe(true);
    expect(tx).not.toContain('boom');
    act(() => t.unmount());
    arbre = null;
    expect(st().error).toBeNull();
  });
});

describe('3. le Centre de contrôle ne coupe plus le scan', () => {
  it('« inactive » ne met pas en pause ; l’arrière-plan, si', () => {
    let ecoute: ((e: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, f: (e: string) => void) => {
      ecoute = f;
      return { remove: jest.fn() };
    }) as never);
    enScan();
    monter(<ScanScreen />);
    (RoomScan.pause as jest.Mock).mockClear();
    act(() => ecoute!('inactive'));
    expect(RoomScan.pause).not.toHaveBeenCalled();
    expect(st().paused).toBe(false);
    act(() => ecoute!('active'));
    act(() => ecoute!('background'));
    expect(RoomScan.pause).toHaveBeenCalledTimes(1);
    expect(st().paused).toBe(true);
  });
});

describe('4. les messages de fin de scan sont lus', () => {
  beforeEach(() => {
    act(() => {
      useAstuce.setState({ courante: null, file: [] });
      useBilanStore.getState().fermer();
      usePremieresFois.setState({ charge: true, vues: [] } as never);
      useUsage.setState({ modeElec: false });
    });
  });
  afterEach(() => act(() => useUsage.setState({ modeElec: true })));

  it('la fête et la dépense vont dans la carte du bilan, pas en bandeaux dessous', async () => {
    (RoomScan.stop as jest.Mock).mockResolvedValueOnce({
      surfaces: rectangle(0, 0, 4, 3),
      objects: [],
      modelPath: '',
      energie: { secondes: 134, batterie: 4, thermique: 'frais' },
    });
    enScan({ saves: [] });
    const t = monter(<ScanScreen />);
    await terminer(t);
    const b = useBilanStore.getState().bilan;
    expect(b).not.toBeNull();
    expect(b!.premier).toBe(true);
    expect(b!.noteEnergie).toMatch(/2 min 14 s/);
    const a = useAstuce.getState();
    const bandeaux = [a.courante, ...a.file].filter(Boolean).map((x) => x!.texte);
    expect(bandeaux).not.toContain('Votre premier logement est dans la poche.');
    expect(bandeaux.some((x) => /2 min 14 s/.test(x))).toBe(false);
  });

  it('la carte fête le premier relevé, dit la pièce vue par la porte en premier, et la dépense en bas', () => {
    const bilan: BilanAffiche = {
      pieces: 2,
      surface: 30,
      murs: 8,
      portes: 1,
      fenetres: 2,
      meubles: 3,
      score: 90,
      etoiles: 3,
      mention: 'Excellent',
      criteres: [
        { cle: 'structure', libelle: 'Pièces refermées', points: 55, sur: 55 },
        { cle: 'precision', libelle: 'Murs bien vus', points: 30, sur: 35 },
        { cle: 'murs', libelle: 'Couleur des murs', points: 2, sur: 2 },
        { cle: 'sol', libelle: 'Couleur du sol', points: 2, sur: 2 },
        { cle: 'plafond', libelle: 'Plafond mesuré', points: 0, sur: 6 },
      ],
      conseil: 'Levez le téléphone vers le plafond un instant : sa hauteur sera mesurée.',
      premier: true,
      noteEnergie: '2 min 14 s · −4 % de batterie',
      conseilPrioritaire: 'La pièce vue par la porte n’est pas relevée : entrez-y pour la scanner.',
    };
    const t = monter(
      <BilanDuReleveCarte bilan={bilan} onFermer={() => {}} onVoir3D={() => {}} onRealiteAugmentee={() => {}} />,
    );
    const tx = textes(t);
    expect(tx).toContain('Premier relevé !');
    expect(tx).not.toContain('Relevé terminé');
    expect(tx.some((x) => /vue par la porte/.test(x))).toBe(true);
    expect(tx.some((x) => /plafond un instant/.test(x))).toBe(false);
    expect(tx).toContain('2 min 14 s · −4 % de batterie');
  });

  it('la file des astuces attend que le bilan se referme', () => {
    act(() => {
      useScanStore.setState({ screen: 'result' } as never);
      useBilanStore.getState().montrer({ pieces: 1 } as never);
      useAstuce.getState().poser({ texte: 'Pensez à enregistrer' });
    });
    const t = monter(<AstuceHote />);
    expect(textes(t)).not.toContain('Pensez à enregistrer');
    act(() => useBilanStore.getState().fermer());
    expect(textes(t)).toContain('Pensez à enregistrer');
  });
});

describe('5. le bilan d’un étage parle de cet étage', () => {
  beforeEach(() => {
    act(() => {
      useAstuce.setState({ courante: null, file: [] });
      useBilanStore.getState().fermer();
    });
  });

  it('« Scanner un étage » : la note porte sur l’étage seul, sous son nom, et le logement en petit, « au sol »', async () => {
    enScan();
    act(() => {
      st().addRoomBox(5, 4, 'Séjour');
      useScanStore.setState({ etageEnCours: 1, screen: 'scan', scanning: true } as never);
    });
    (RoomScan.stop as jest.Mock).mockResolvedValueOnce({ surfaces: rectangle(0, 0, 4, 3), objects: [], modelPath: '' });
    const t = monter(<ScanScreen />);
    await terminer(t);
    const b = useBilanStore.getState().bilan!;
    expect(b.titre).toBe('1er étage relevé');
    expect(b.pieces).toBe(1);
    expect(b.surface).toBeLessThan(15);
    expect(b.logement).toMatch(/^Tout le logement : 2 niveaux · 2 pièces · .* m² au sol$/);
  });

  it('un passage de plus : « Pièce ajoutée » et son apport par différence de totaux', async () => {
    enScan();
    act(() => {
      st().addRoomBox(3, 3, 'Chambre');
      useScanStore.setState({ complementEnCours: true, screen: 'scan', scanning: true } as never);
    });
    (RoomScan.stop as jest.Mock).mockResolvedValueOnce({
      surfaces: rectangle(20, 0, 4, 3),
      objects: [],
      modelPath: '',
      passages: 1,
    });
    const t = monter(<ScanScreen />);
    await terminer(t);
    const b = useBilanStore.getState().bilan!;
    expect(b.titre).toBe('Pièce ajoutée');
    expect(b.pieces).toBe(2);
    expect(b.apport).toMatch(/^\+1 pièce · \+\d+(,\d)? m²$/);
    // Un seul niveau : la ligne du logement redirait le bilan.
    expect(b.logement).toBeUndefined();
  });

  it('l’apport se lit par différence, signe compris, et rien quand rien n’a bougé', () => {
    expect(apportDuPassage({ pieces: 3, surface: 40 }, { pieces: 4, surface: 51.6 })).toBe('+1 pièce · +11,6 m²');
    expect(apportDuPassage({ pieces: 3, surface: 40 }, { pieces: 3, surface: 42.3 })).toBe('+2,3 m²');
    expect(apportDuPassage({ pieces: 3, surface: 40 }, { pieces: 2, surface: 39.5 })).toBe('−1 pièce · −0,5 m²');
    expect(apportDuPassage({ pieces: 3, surface: 40 }, { pieces: 3, surface: 40.04 })).toBeUndefined();
  });

  it('la carte montre le titre du passage et son apport', () => {
    const bilan = {
      pieces: 4,
      surface: 52,
      surfaceAuDixieme: 51.6,
      murs: 16,
      portes: 3,
      fenetres: 4,
      meubles: 5,
      score: 80,
      etoiles: 2,
      mention: 'Très bon',
      criteres: [],
      conseil: null,
      titre: 'Pièce ajoutée',
      apport: '+1 pièce · +11,6 m²',
      logement: 'Tout le logement : 2 niveaux · 8 pièces · 92 m² au sol',
    } as BilanAffiche;
    const t = monter(
      <BilanDuReleveCarte bilan={bilan} onFermer={() => {}} onVoir3D={() => {}} onRealiteAugmentee={() => {}} />,
    );
    const tx = textes(t);
    expect(tx).toContain('Pièce ajoutée');
    expect(tx).toContain('+1 pièce · +11,6 m²');
    expect(tx).toContain('Tout le logement : 2 niveaux · 8 pièces · 92 m² au sol');
  });
});

describe('6. pendant le scan, on rappelle ce qu’on scanne', () => {
  it('le contexte : étage et dossier, pièce raccordée ou à placer, rien pour un relevé neuf', () => {
    const base = { etageEnCours: null, complementEnCours: false, scanName: 'Chantier Dupont', passagesDuPlanOuvert: () => true };
    expect(contexteDuScan(base)).toBeNull();
    expect(contexteDuScan({ ...base, etageEnCours: 1 })).toBe('1er étage · Chantier Dupont');
    expect(contexteDuScan({ ...base, complementEnCours: true })).toBe('Pièce ajoutée · se raccordera au plan');
    expect(contexteDuScan({ ...base, complementEnCours: true, passagesDuPlanOuvert: () => false })).toBe(
      'Pièce ajoutée · à placer ensuite sur le plan',
    );
  });

  it('la pastille s’affiche en entrant et s’efface après quelques secondes', () => {
    jest.useFakeTimers();
    enScan({ etageEnCours: 1, scanName: 'Chantier Dupont' });
    const t = monter(<ScanScreen />);
    expect(textes(t)).toContain('1er étage · Chantier Dupont');
    act(() => {
      jest.advanceTimersByTime(DUREE_CONTEXTE);
    });
    expect(textes(t)).not.toContain('1er étage · Chantier Dupont');
  });

  it('elle s’efface aussi à la première trouvaille', () => {
    enScan({ complementEnCours: true });
    const t = monter(<ScanScreen />);
    expect(textes(t)).toContain('Pièce ajoutée · à placer ensuite sur le plan');
    act(() => useScanStore.setState({ wallCount: 1 } as never));
    expect(textes(t)).not.toContain('Pièce ajoutée · à placer ensuite sur le plan');
  });
});

describe('7. un vrai écran de pause', () => {
  it('il dit comment reprendre, et son grand bouton reprend', () => {
    enScan({ paused: true });
    const t = monter(<ScanScreen />);
    const tx = textes(t);
    expect(tx).toContain('Scan en pause');
    expect(tx.some((x) => /visez un mur déjà relevé/.test(x))).toBe(true);
    (RoomScan.resume as jest.Mock).mockClear();
    act(() => parLabel(t, 'Reprendre')[0].props.onPress());
    expect(RoomScan.resume).toHaveBeenCalledTimes(1);
    expect(st().paused).toBe(false);
    expect(textes(t)).not.toContain('Scan en pause');
  });

  it('il propose aussi de terminer, et les commandes du bas restent', () => {
    enScan({ paused: true });
    const t = monter(<ScanScreen />);
    expect(parLabel(t, 'Terminer le scan')).toHaveLength(1);
    expect(parLabel(t, 'Reprendre le scan')).toHaveLength(1);
    expect(parLabel(t, 'Terminer')).toHaveLength(1);
  });
});

describe('8. les boutons du scan suivent les marges de l’iPhone', () => {
  it('la croix et la torche sous la barre d’état, les commandes au-dessus de la barre du bas', () => {
    // Le banc rend les marges d'un iPhone à encoche : 59 en haut, 34 en bas.
    enScan();
    const t = monter(<ScanScreen />);
    const croix = parLabel(t, 'Arrêter le scan')[0];
    const torche = parLabel(t, 'Allumer la torche')[0];
    expect(StyleSheet.flatten(croix.props.style).top).toBe(59 + 4);
    expect(StyleSheet.flatten(torche.props.style).top).toBe(59 + 4);
    const bas = t.root
      .findAllByType(View)
      .find((v) => v.props.pointerEvents === 'box-none' && StyleSheet.flatten(v.props.style)?.bottom !== undefined)!;
    expect(StyleSheet.flatten(bas.props.style).bottom).toBe(34 + 12);
  });

  it('la page caméra aussi', () => {
    act(() => useScanStore.setState({ screen: 'camera' } as never));
    const t = monter(<CameraScreen />);
    const page = t.root.findAll((x) => {
      const s = StyleSheet.flatten(x.props?.style);
      return !!s && s.paddingTop !== undefined && s.paddingHorizontal === 24;
    })[0];
    expect(StyleSheet.flatten(page.props.style).paddingTop).toBe(59 + 4);
  });
});

describe('9. des mots qui guident', () => {
  it('le compteur dit « Meubles », comme le bilan', () => {
    enScan();
    const t = monter(<ScanScreen />);
    const libelles = t.root.findAll((x) => typeof x.props?.libelle === 'string').map((x) => x.props.libelle);
    expect(libelles).toContain('Meubles');
    expect(libelles).not.toContain('Objets');
  });

  it('la tuile de l’accueil pousse le scan d’une traite', () => {
    jest.useFakeTimers();
    act(() => {
      useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null, error: null } as never);
    });
    const t = monter(<HomeScreen />);
    expect(textes(t)).toContain('Tout le logement, d’une traite');
    expect(textes(t)).not.toContain('Pièce après pièce');
  });

  it('la page caméra, seule page vue avant le premier scan, dit le bon geste', () => {
    const t = monter(<CameraScreen />);
    expect(textes(t)).toContain('Passez de pièce en pièce sans terminer : tout sera assemblé ensemble.');
  });
});
