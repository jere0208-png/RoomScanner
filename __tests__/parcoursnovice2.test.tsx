/**
 * LE NOVICE NE PERD RIEN EN TAPANT PARTOUT — défauts trouvés par l'agent
 * « novice » (chasse aux défauts du 19/10), devenus des garde-fous :
 *   — la page de confidentialité ouverte depuis l'offre Pro, par-dessus un
 *     plan, renvoyait au Profil : le plan était quitté sans être rangé ;
 *   — « Reprendre » un relevé interrompu gardait l'historique d'un autre
 *     plan, et « Annuler » y remettait ses murs ;
 *   — « Annuler » un geste déclarait le plan « propre » alors que le client
 *     tapé depuis n'était écrit nulle part ;
 *   — une feuille qui descend écoutait encore : deux appuis, deux copies.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { type WallSeg } from '../src/geometry/floorplan';
import { useScanStore, resetPersistCache, type BrouillonScan } from '../src/store/scanStore';
import { ConfidentialiteScreen, ouvrirConfidentialite } from '../src/screens/ConfidentialiteScreen';
import { SheetShell } from '../src/components/Sheet';

const S = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1',
});
const PIECE: WallSeg[] = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)];
const AUTRE: WallSeg[] = [mur('n2', 0, 0, 2, 0), mur('e2', 2, 0, 2, 2), mur('s2', 2, 2, 0, 2), mur('w2', 0, 2, 0, 0)];

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.advanceTimersByTime(3000);
  resetPersistCache();
  useScanStore.setState({
    walls: PIECE,
    rooms: [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }],
    objects: [], openings: [], fixtures: [], photos: [], notes: [], mesures: [],
    saves: [], currentSaveId: null, scanName: 'Chantier A', client: '', address: '', brouillon: null,
  });
});

describe('la confidentialité ramène d’où l’on vient', () => {
  it('ouverte par-dessus le plan, « Retour » rend le plan ; depuis le profil, le profil', () => {
    act(() => S().setScreen('result'));
    act(() => ouvrirConfidentialite());
    expect(S().screen).toBe('confidentialite');
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ConfidentialiteScreen />);
    });
    const retour = () => t.root.find((n) => n.props.accessibilityLabel === 'Retour' && typeof n.props.onPress === 'function');
    act(() => retour().props.onPress());
    expect(S().screen).toBe('result');
    // Le plan est toujours là, avec ce qu'on y avait fait.
    expect(S().walls).toBe(PIECE);
    act(() => S().setScreen('profil'));
    act(() => ouvrirConfidentialite());
    act(() => retour().props.onPress());
    expect(S().screen).toBe('profil');
    act(() => t.unmount());
  });
});

describe('« Reprendre » un relevé interrompu', () => {
  it('n’emporte pas l’historique d’un autre plan', () => {
    S().commitCurrent();
    const a = S().currentSaveId!;
    jest.advanceTimersByTime(3000);
    S().openSave(a);
    S().moveRoom('r1', 1, 0);
    expect(S().canUndo).toBe(true);
    const brouillon = {
      at: Date.now(), name: 'Relevé du matin', walls: AUTRE, openings: [], objects: [],
      rooms: [{ id: 'r2', name: 'Bureau', wallIds: AUTRE.map((w) => w.id) }], fixtures: [], ceiling: [],
    } as unknown as BrouillonScan;
    useScanStore.setState({ brouillon });
    S().reprendreBrouillon();
    expect(S().canUndo).toBe(false);
    S().undo();
    expect(S().walls).toBe(AUTRE);
  });
});

describe('« Annuler » ne fait pas oublier ce qui n’est pas dans l’historique', () => {
  it('le client tapé après le dernier enregistrement garde le plan « à enregistrer »', () => {
    S().commitCurrent();
    expect(S().dirty).toBe(false);
    S().addRoomLibre(2, 2, 'Cellier');
    S().setClientInfo('Mme Martin', '12 rue Pasteur');
    S().undo();
    expect(S().dirty).toBe(true);
    expect(S().mettreDeCote()).not.toBe('rien');
  });

  it('sans autre changement, revenir à l’état enregistré le rend « propre »', () => {
    S().commitCurrent();
    S().addRoomLibre(2, 2, 'Cellier');
    expect(S().dirty).toBe(true);
    S().undo();
    expect(S().dirty).toBe(false);
  });
});

describe('une feuille qui descend n’écoute plus', () => {
  it('la carte refuse les appuis dès la fermeture demandée', () => {
    let t!: TestRenderer.ReactTestRenderer;
    const feuille = (visible: boolean) => (
      <SheetShell visible={visible} onClose={() => {}}>
        <Text>Contenu</Text>
      </SheetShell>
    );
    act(() => {
      t = TestRenderer.create(feuille(true));
    });
    const carte = () => t.root.findByProps({ testID: 'carte-feuille' }).parent!;
    const animee = () => {
      let n: TestRenderer.ReactTestInstance | null = carte();
      while (n && n.type !== Animated.View) n = n.parent;
      return n!;
    };
    expect(animee().props.pointerEvents).toBe('auto');
    act(() => t.update(feuille(false)));
    expect(animee().props.pointerEvents).toBe('none');
    act(() => t.unmount());
  });
});
