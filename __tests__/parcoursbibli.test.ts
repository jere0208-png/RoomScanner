/**
 * LA BIBLIOTHEQUE, DE BOUT EN BOUT.
 *
 * Quatrieme parcours complet, sur le domaine ou une erreur coute un
 * deplacement : un plan perdu, c'est une visite a refaire. Tout le reste se
 * rattrape a l'ecran.
 *
 * On refait ce que fait un electricien en fin de semaine : quatre releves
 * dans la journee, un dossier par chantier, une copie d'un plan type qu'on
 * adapte, des renommages, et le menage du vendredi soir. On verifie a
 * chaque etape qu'AUCUN PLAN NE DISPARAIT — y compris quand on supprime le
 * dossier qui les contenait.
 *
 * CE QUI SE VERIFIE ICI N'EST PAS CHAQUE GESTE — ils ont leurs bancs — mais
 * que le plan OUVERT et la bibliotheque restent d'accord. C'est la jointure
 * la plus glissante de l'application : deux representations du meme travail,
 * l'une a l'ecran, l'autre rangee.
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
import { useAccountStore } from '../src/store/accountStore';

const st = () => useScanStore.getState();

/** Un releve fait et range : on dessine, on nomme, on enregistre. */
const releve = (nom: string) => {
  st().commencerAuClavier();
  st().addRoomBox(5, 4, 'Sejour');
  st().renameCurrent(nom);
  st().commitCurrent();
  return st().currentSaveId!;
};

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null, folders: [] });
});

describe('le parcours complet d’une bibliotheque', () => {
  it('range, copie, renomme et fait le menage sans rien perdre', () => {
    // 1. Deux releves de la journee.
    const pasteur = releve('T3 rue Pasteur');
    const jaures = releve('Pavillon Jaures');
    expect(st().saves).toHaveLength(2);

    // 2. Un dossier par chantier, et l'on range.
    const chantier = st().addFolder('Chantier Pasteur');
    st().moveToFolder(pasteur, chantier);
    expect(st().saves.find((s) => s.id === pasteur)!.folderId).toBe(chantier);
    // L'autre reste a la racine : ranger l'un ne deplace pas l'autre.
    expect(st().saves.find((s) => s.id === jaures)!.folderId).toBeUndefined();

    // 3. Une copie du plan type, qu'on adapte.
    st().duplicateSave(pasteur);
    expect(st().saves).toHaveLength(3);
    const copie = st().saves.find(
      (s) => s.id !== pasteur && s.name.includes('Pasteur'),
    )!;
    // La copie a SA vie : meme dessin, autre entree, meme dossier.
    expect(copie.id).not.toBe(pasteur);
    expect(copie.walls).toHaveLength(4);
    expect(copie.folderId).toBe(chantier);
    st().renameSave(copie.id, 'T3 Pasteur — variante');
    expect(
      st().saves.find((s) => s.id === copie.id)!.name,
    ).toBe('T3 Pasteur — variante');

    // 4. LE MENAGE DU VENDREDI SOIR : on supprime le dossier, pas son
    //    contenu. Les plans reviennent a la racine — un dossier qui
    //    emporte les releves avec lui coute une journee de chantier.
    st().removeFolder(chantier);
    expect(st().saves).toHaveLength(3);
    for (const s of st().saves) {
      expect(s.folderId).toBeFalsy();
    }

    // 5. Supprimer un plan ne touche qu'a lui.
    st().deleteSave(jaures);
    expect(st().saves.map((s) => s.id)).not.toContain(jaures);
    expect(st().saves).toHaveLength(2);
  });

  it('et le plan OUVERT reste d’accord avec ce qui est range', () => {
    const id = releve('T3 rue Pasteur');
    // On retouche a l'ecran : la bibliotheque doit suivre au prochain
    // enregistrement, pas avant.
    st().addNote('Colonne montante', { x: 1, z: 1 });
    expect(st().dirty).toBe(true);
    expect(st().saves.find((s) => s.id === id)!.notes ?? []).toHaveLength(0);
    st().commitCurrent();
    expect(st().dirty).toBe(false);
    expect(st().saves.find((s) => s.id === id)!.notes).toHaveLength(1);
    // Et le renommage du plan a l'ecran renomme SON entree, pas une autre.
    st().renameCurrent('T3 Pasteur — signe');
    expect(st().saves.find((s) => s.id === id)!.name).toBe('T3 Pasteur — signe');
    expect(st().saves).toHaveLength(1);
  });

  it('supprimer le plan qu’on regarde ne l’efface pas de l’ecran', () => {
    /*
      « ON NE RETIRE PAS LA 3D DES MAINS DE QUI LA REGARDE » : la regle du
      projet. Supprimer l'entree rangee laisse le travail sous les yeux — et
      le re-enregistrer ne redebite pas le palier gratuit, puisque ce plan a
      deja ete paye le jour de sa creation.
    */
    const id = releve('T3 rue Pasteur');
    st().deleteSave(id);
    expect(st().saves).toHaveLength(0);
    expect(st().walls).toHaveLength(4);
    st().commitCurrent();
    expect(st().saves).toHaveLength(1);
  });
});
