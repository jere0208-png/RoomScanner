/**
 * « REFAIRE » — l'autre moitié d'« Annuler ».
 *
 * L'application savait revenir en arrière, jamais repartir en avant. Sur un
 * chantier, on annule d'un geste de trop — le doigt appuie deux fois, ou
 * l'on se ravise — et le travail est perdu pour de bon : le seul chemin
 * pour le retrouver était de le refaire à la main.
 *
 * C'est encore une perte de travail, la même famille que les trois sorties
 * sans garde. Et c'est la plus vicieuse : elle vient d'un bouton dont le
 * rôle est précisément de rattraper les erreurs.
 *
 * Ce qui est annulé part donc dans une pile d'AVENIR, et « Refaire » l'en
 * ressort. Un nouveau geste, lui, efface cet avenir : on ne peut pas
 * refaire ce qui n'a plus de sens dans un plan qui a changé de branche —
 * c'est la règle de tous les éditeurs, et l'inverse produirait des états
 * impossibles.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockMagasin.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockMagasin.delete(k); }),
}));

import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const noms = () => st().rooms.map((r) => r.name).join(',');

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
  st().commencerAuClavier();
  st().addRoomBox(5, 4, 'Séjour');
});

describe('« Refaire »', () => {
  it('rend ce qu’une annulation venait de retirer', () => {
    st().addRoomBox(3, 3, 'Chambre');
    expect(noms()).toBe('Séjour,Chambre');
    st().undo();
    expect(noms()).toBe('Séjour');
    expect(st().canRedo).toBe(true);
    st().redo();
    expect(noms()).toBe('Séjour,Chambre');
  });

  it('remonte autant de fois qu’on est descendu', () => {
    st().addRoomBox(3, 3, 'Chambre');
    st().addRoomBox(2, 2, 'WC');
    st().undo();
    st().undo();
    expect(noms()).toBe('Séjour');
    st().redo();
    st().redo();
    expect(noms()).toBe('Séjour,Chambre,WC');
    // Au bout, il n'y a plus rien à refaire — et le bouton doit le dire.
    expect(st().canRedo).toBe(false);
  });

  it('n’est offert qu’après une annulation', () => {
    expect(st().canRedo).toBe(false);
    st().addRoomBox(3, 3, 'Chambre');
    expect(st().canRedo).toBe(false);
  });

  it('mais un geste NEUF efface l’avenir', () => {
    st().addRoomBox(3, 3, 'Chambre');
    st().undo();
    expect(st().canRedo).toBe(true);
    // On repart dans une autre direction : la chambre n'a plus de sens.
    st().addRoomBox(4, 2, 'Cuisine');
    expect(st().canRedo).toBe(false);
    st().redo();
    expect(noms()).toBe('Séjour,Cuisine');
  });

  it('et le drapeau des modifications suit le va-et-vient', () => {
    st().commitCurrent();
    expect(st().dirty).toBe(false);
    st().addRoomBox(3, 3, 'Chambre');
    expect(st().dirty).toBe(true);
    st().undo();
    // Revenu à l'état enregistré : plus rien à enregistrer.
    expect(st().dirty).toBe(false);
    st().redo();
    expect(st().dirty).toBe(true);
  });

  /*
    ET L'AVENIR NE TRAVERSE PAS LES DOSSIERS.

    Sans quoi « Refaire » ressortirait des morceaux du relevé PRÉCÉDENT
    dans le plan qu'on vient d'ouvrir — et rien n'irait dire à
    l'utilisateur d'où sortent ces murs.
  */
  it('s’efface quand on change de plan', () => {
    st().addRoomBox(3, 3, 'Chambre');
    st().undo();
    expect(st().canRedo).toBe(true);
    st().commencerAuClavier();
    expect(st().canRedo).toBe(false);
    st().redo();
    expect(st().rooms).toHaveLength(0);
  });
});
