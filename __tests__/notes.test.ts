/**
 * UNE NOTE POSEE SUR LE PLAN.
 *
 * Ce qu'un releve de chantier porte et que celui-ci ne portait pas : le mot
 * qu'on ecrit au crayon dans la marge. « Colonne montante ici », « attente
 * TV a confirmer avec le client », « gaine a reprendre ». Ces phrases
 * existent sur tous les plans papier du metier, et l'application n'avait
 * aucun endroit pour elles : ni le nom de piece (il nomme), ni le nom du
 * plan (il y en a un), ni l'appareillage (il se compte au metre).
 *
 * Faute de place, elles finissaient dans le nom du plan — « T3 Pasteur
 * (verifier colonne) » — ou nulle part, c'est-a-dire dans la tete de celui
 * qui a fait le releve, et qui n'est pas toujours celui qui pose.
 *
 * UNE NOTE EST ATTACHEE A UN POINT DU PLAN, pas a une piece : ce qu'on
 * signale est souvent justement ce qui n'a pas encore de piece — une
 * arrivee dans un couloir, un percement dans une cloison.
 *
 * ET ELLE SUIT SON ETAGE. Une remarque sur la colonne du rez n'a rien a
 * faire par-dessus le plan du premier : c'est la meme regle que pour les
 * murs et les meubles, et elle vaut ici aussi.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({
    walls: [],
    rooms: [],
    notes: [],
    niveauCourant: 0,
    saves: [],
    currentSaveId: null,
  });
});

describe('les notes du plan', () => {
  it('se posent la ou on les met', () => {
    st().addNote('Colonne montante', { x: 2, z: 1.5 });
    const n = st().notes;
    expect(n).toHaveLength(1);
    expect(n[0].text).toBe('Colonne montante');
    expect(n[0].at).toEqual({ x: 2, z: 1.5 });
  });

  it('ne retiennent pas une note vide', () => {
    // Un appui par megarde ne doit pas semer des pastilles muettes sur le
    // plan : sans texte, il n'y a rien a dire.
    st().addNote('   ', { x: 0, z: 0 });
    expect(st().notes).toHaveLength(0);
  });

  it('se bornent : un plan porte des mots, pas des paragraphes', () => {
    st().addNote('x'.repeat(400), { x: 0, z: 0 });
    expect(st().notes[0].text.length).toBeLessThanOrEqual(140);
  });

  it('suivent l’etage sur lequel on les pose', () => {
    useScanStore.setState({ niveauCourant: 1 });
    st().addNote('Au premier', { x: 0, z: 0 });
    expect(st().notes[0].niveau).toBe(1);
  });

  it('se deplacent, se corrigent et se retirent', () => {
    st().addNote('Attente TV', { x: 1, z: 1 });
    const id = st().notes[0].id;
    st().moveNote(id, { x: 3, z: 2 });
    expect(st().notes[0].at).toEqual({ x: 3, z: 2 });
    st().editNote(id, 'Attente TV — confirmee');
    expect(st().notes[0].text).toBe('Attente TV — confirmee');
    st().removeNote(id);
    expect(st().notes).toHaveLength(0);
  });

  it('vider le texte d’une note existante la retire', () => {
    // Effacer ce qu'on avait ecrit, c'est retirer la note — pas laisser une
    // pastille vide qu'on ne saurait plus ni lire ni viser.
    st().addNote('A confirmer', { x: 1, z: 1 });
    st().editNote(st().notes[0].id, '  ');
    expect(st().notes).toHaveLength(0);
  });

  it('s’annulent d’un seul geste', () => {
    st().addNote('Gaine a reprendre', { x: 1, z: 1 });
    st().undo();
    expect(st().notes).toHaveLength(0);
    st().redo();
    expect(st().notes).toHaveLength(1);
  });

  it('voyagent avec le plan enregistre', () => {
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Sejour');
    st().addNote('Colonne montante', { x: 1, z: 1 });
    st().commitCurrent();
    const save = st().saves[0];
    expect(save.notes).toHaveLength(1);
    expect(save.notes?.[0].text).toBe('Colonne montante');
    // Et on les retrouve en rouvrant : une note perdue au rechargement est
    // pire qu'une note jamais prise.
    useScanStore.setState({ notes: [] });
    st().openSave(save.id);
    expect(st().notes).toHaveLength(1);
  });
});
