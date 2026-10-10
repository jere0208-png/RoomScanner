/**
 * LES PERFORMANCES — ce qui suit le doigt ne paie plus pour le reste.
 *
 * Relevé du patron : « dans la continuité, cherche à améliorer les
 * performances de l'app ». Mesuré avant d'agir (T2 de l'exemple, 16 murs,
 * 32 appareils) : un glisser de mur relançait à chaque image les pièces, les
 * cheminements, le devis et le diagnostic — une quinzaine de millisecondes
 * sur un ordinateur, plusieurs fois plus sur l'iPhone, pour un budget de 16 ms
 * par image. Ce banc tient ce qui a été corrigé, pour que la prochaine
 * retouche ne le défasse pas :
 *
 *   — les listes d'un étage gardent leur référence tant que rien ne change
 *     (`filtrerAuNiveau`) : un meuble qu'on glisse ne refait plus les murs ;
 *   — les analyses attendent que le doigt se lève (`store/geste`) ;
 *   — la sauvegarde ne resérialise que les plans modifiés, et relit la
 *     bibliothèque d'un seul appel ;
 *   — la vue du plan, les poignées de coin, les vignettes, les icônes ;
 *   — et, côté iPhone, ce qui tournait pour rien (voir le dernier bloc).
 */
const mockDisque = new Map<string, string>();
const mockEcritures: string[] = [];
const mockMultiGet = jest.fn(async (cles: string[]) => cles.map((k) => [k, mockDisque.get(k) ?? null] as const));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockEcritures.push(k);
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
  multiGet: (cles: string[]) => mockMultiGet(cles),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { filtrerAuNiveau } from '../src/geometry/floorplan';
import {
  FIN_DU_GESTE_MS,
  finirLeGeste,
  pasDeGeste,
  useFigePendantLeGeste,
  useGeste,
} from '../src/store/geste';
import { empreinteDe, resetPersistCache, useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('un étage garde ses listes', () => {
  const mur = (id: string, niveau?: number) => ({ id, niveau });
  it('rien de filtré : la liste elle-même, et la même à chaque appel', () => {
    const jeu = {
      walls: [mur('a'), mur('b')],
      openings: [],
      rooms: [{ id: 'r', wallIds: ['a', 'b'] }],
      fixtures: [{ id: 'f', wallId: 'a' }],
      photos: [],
      objects: [{ id: 'o', roomId: 'r' }],
      ceiling: [],
    };
    const un = filtrerAuNiveau(jeu as never, 0) as unknown as typeof jeu;
    expect(un.walls).toBe(jeu.walls);
    expect(un.fixtures).toBe(jeu.fixtures);
    // Un meuble qu'on glisse : seule sa liste change ; les murs restent les mêmes.
    const deux = filtrerAuNiveau({ ...jeu, objects: [{ id: 'o', roomId: 'r' }] } as never, 0) as unknown as typeof jeu;
    expect(deux.walls).toBe(un.walls);
    expect(deux.rooms).toBe(un.rooms);
    expect(deux.objects).not.toBe(un.objects);
  });

  it('un bâtiment à étages : filtré juste, et le même résultat d’un appel à l’autre', () => {
    const walls = [mur('a', 0), mur('b', 1)];
    const jeu = { walls, openings: [], rooms: [], fixtures: [{ id: 'f', wallId: 'b' }], photos: [], objects: [], ceiling: [] };
    const haut = filtrerAuNiveau(jeu as never, 1) as unknown as typeof jeu;
    expect(haut.walls.map((w) => w.id)).toEqual(['b']);
    expect(haut.fixtures.map((f) => f.id)).toEqual(['f']);
    expect((filtrerAuNiveau(jeu as never, 1) as unknown as typeof jeu).walls).toBe(haut.walls);
    expect((filtrerAuNiveau(jeu as never, 0) as unknown as typeof jeu).fixtures).toEqual([]);
  });
});

describe('les analyses attendent que le doigt se lève', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    finirLeGeste();
    jest.useRealTimers();
  });

  it('un pas de geste ouvre le geste ; le silence le ferme', () => {
    pasDeGeste();
    expect(useGeste.getState().enCours).toBe(true);
    act(() => {
      jest.advanceTimersByTime(FIN_DU_GESTE_MS - 50);
    });
    pasDeGeste();
    act(() => {
      jest.advanceTimersByTime(FIN_DU_GESTE_MS - 50);
    });
    expect(useGeste.getState().enCours).toBe(true);
    act(() => {
      jest.advanceTimersByTime(60);
    });
    expect(useGeste.getState().enCours).toBe(false);
  });

  it('une valeur figée pendant le geste, rafraîchie au lâcher', () => {
    const Lecteur = ({ v }: { v: number }) => <Text>{String(useFigePendantLeGeste(v))}</Text>;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Lecteur v={1} />);
    });
    act(() => pasDeGeste());
    act(() => t.update(<Lecteur v={2} />));
    act(() => t.update(<Lecteur v={3} />));
    expect(t.root.findByType(Text).props.children).toBe('1');
    act(() => {
      jest.advanceTimersByTime(FIN_DU_GESTE_MS + 10);
    });
    expect(t.root.findByType(Text).props.children).toBe('3');
    act(() => t.unmount());
  });

  it('un geste continu du magasin le signale', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        walls: [{ id: 'm', type: 'wall', a: { x: 0, z: 0 }, b: { x: 3, z: 0 }, height: 2.5, yCenter: 1.25 }] as never,
      });
    });
    useScanStore.getState().moveWallPoint('m', 'b', { x: 3.2, z: 0 });
    expect(useGeste.getState().enCours).toBe(true);
  });

  it('l’écran du plan lit le plan figé pour ses analyses, et la visite aussi', () => {
    const plan = lire('src/screens/ResultScreen.tsx');
    expect(plan).toContain('const fige = useFigePendantLeGeste({');
    expect(plan).toMatch(/planRoutes\(fige\.walls, fige\.rooms, fige\.parts, fige\.fixtures/);
    expect(plan).toMatch(/checkPlan\(fige\.walls, fige\.rooms, fige\.openings\)/);
    expect(lire('src/components/Exploration.tsx')).toContain('useFigePendantLeGeste(useMemo(');
  });
});

describe('la sauvegarde n’écrit que ce qui a changé', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockDisque.clear();
    mockEcritures.length = 0;
    resetPersistCache();
  });
  afterEach(() => jest.useRealTimers());

  it('un plan inchangé n’est ni resérialisé ni réécrit', () => {
    const a = { id: 'a', name: 'A', walls: [], updatedAt: 1 };
    const b = { id: 'b', name: 'B', walls: [], updatedAt: 1 };
    act(() => {
      useScanStore.setState({ saves: [a, b] as never });
    });
    // Un renommage passe par le magasin : seul le plan renommé change d'objet.
    useScanStore.getState().renameSave('b', 'B2');
    jest.advanceTimersByTime(700);
    const planA = useScanStore.getState().saves.find((x) => x.id === 'a');
    const serialise = jest.spyOn(JSON, 'stringify');
    useScanStore.getState().renameSave('b', 'B3');
    jest.advanceTimersByTime(700);
    // Le plan A n'a pas bougé : il n'est ni resérialisé, ni réécrit.
    expect(serialise.mock.calls.some(([x]) => x === planA)).toBe(false);
    expect(serialise.mock.calls.some(([x]) => (x as { id?: string })?.id === 'b')).toBe(true);
    serialise.mockRestore();
    expect(mockEcritures.filter((k) => k.endsWith('.a')).length).toBe(1);
  });

  it('l’empreinte distingue deux contenus et reconnaît le même', () => {
    expect(empreinteDe('{"a":1}')).toBe(empreinteDe('{"a":1}'));
    expect(empreinteDe('{"a":1}')).not.toBe(empreinteDe('{"a":2}'));
  });

  it('la bibliothèque se relit d’un seul appel groupé', () => {
    const source = lire('src/store/scanStore.ts');
    expect(source).toContain('const bruts = await lireLesCles(ids.map(scanKey));');
    expect(source).toMatch(/if \(deja && deja\.ref === s && deja\.quand === s\.updatedAt\) continue;/);
  });
});

describe('le reste de l’écran du plan', () => {
  it('la vue du plan vit dans une référence : pas de second rendu au lâcher', () => {
    const plan = lire('src/screens/ResultScreen.tsx');
    expect(plan).not.toMatch(/useState<VuePlan>/);
    expect(plan).toContain('onView={memoriserVuePlan}');
  });

  it('une poignée de coin garde sa clé — et son geste — pendant qu’on la tire', () => {
    const editeur = lire('src/components/FloorplanEditor.tsx');
    expect(editeur).toContain('key: `${v.wallId}:${v.end}`');
    expect(editeur).not.toMatch(/\[corner\.wallId, corner\.end, corner\.x, corner\.z, mapping, seuil\]/);
  });

  it('la vignette d’un plan ne refait pas le contrôle à chaque rendu', () => {
    expect(lire('src/screens/LibraryScreen.tsx')).toContain('const alertesDesScans = new WeakMap<SavedScan, Set<string>>();');
  });

  it('une icône, un module : plus d’import groupé de Lucide', () => {
    for (const p of ['src/components/CeilingIcon.tsx', 'src/components/WallElevation.tsx', 'src/screens/ResultScreen.tsx']) {
      expect([p, /from 'lucide-react-native';/.test(lire(p))]).toEqual([p, false]);
    }
  });
});

describe('côté iPhone, plus rien ne tourne pour rien', () => {
  const natif = (f: string) => lire(`modules/react-native-room-scan/ios/${f}`);

  it('la couche 3D du scan se fige avec lui, en 2× et à 60 images/s au plus', () => {
    const pose = natif('RoomScanPoseAR.swift');
    expect(pose).toContain('func suspendre(_ oui: Bool)');
    expect(pose).toContain('vue.antialiasingMode = .multisampling2X');
    expect(pose).toContain('vue.preferredFramesPerSecond = 60');
    const manager = natif('RoomScanManager.swift');
    expect(manager.match(/couche\?\.suspendre\(true\)/g)?.length).toBe(2);
    expect(manager).toContain('self.couche?.suspendre(false)');
    expect(manager).toContain('RoomScanCompass.shared.detach()');
  });

  it('le maillage se bâtit hors du fil de l’interface', () => {
    expect(natif('RoomScanManager.swift')).toContain('DispatchQueue.global(qos: .userInitiated).async {');
    expect(natif('RoomScanMaillage.swift')).toContain('static func construire(_ ancres: [ARMeshAnchor])');
  });

  it('un seul guet pour les verres, à dix battements par seconde', () => {
    const verre = natif('RoomScanVerre.swift');
    expect(verre).toContain('private final class GuetDesVerres');
    expect(verre).toContain('CAFrameRateRange(minimum: 4, maximum: 10, preferred: 10)');
    expect(verre).not.toContain('Relais(self)');
  });

  it('les photos à un pixel par point', () => {
    const photo = natif('RoomScanPhoto.swift');
    expect(photo.match(/format: RoomScanPhoto\.pixelParPoint\(\)/g)?.length).toBe(2);
  });

  it('la boussole du nord s’allume à l’invitation, et s’éteint après la lecture', () => {
    /*
      Trouvé pendant l'audit : le module natif répond « rien » tant qu'on ne
      l'a pas démarré, et personne ne le démarrait — le bouton nord échouait
      toujours. Elle s'allume au premier appui, s'éteint après la lecture, et
      au départ de l'écran.
    */
    const editeur = lire('src/components/FloorplanEditor.tsx');
    const debut = editeur.indexOf('RoomScan.startHeading()');
    const lecture = editeur.indexOf('await RoomScan.heading()');
    const fin = editeur.indexOf('RoomScan.stopHeading()', lecture);
    expect(debut).toBeGreaterThan(0);
    expect(lecture).toBeGreaterThan(debut);
    expect(fin).toBeGreaterThan(lecture);
  });

  it('la visite ne se rebâtit que si sa géométrie a changé', () => {
    const visite = natif('RoomScanVisite.swift');
    for (const p of ['maillage', 'sols', 'orientes', 'ecorche', 'meubles']) {
      expect(visite).toContain(`didSet { if ${p} != oldValue { rebatir() } }`);
    }
  });
});
