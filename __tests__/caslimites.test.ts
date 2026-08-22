/**
 * CE QUI ARRIVE QUAND LES CHIFFRES SORTENT DU RAISONNABLE.
 *
 * Trouvé en poussant l'application dans ses coins, comme le ferait un doigt
 * qui glisse sur le clavier : une cote à quatre chiffres, un nom de deux
 * cents caractères, une pièce dont on efface tous les murs. Rien de tout
 * cela ne plantait — et c'est bien le problème : tout était accepté tel
 * quel, et le plan devenait illisible sans qu'on sache pourquoi.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockMagasin.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockMagasin.delete(k); }),
}));

import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const longueur = (i = 0) => {
  const w = st().walls[i];
  return Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
};

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
  st().commencerAuClavier();
  st().addRoomBox(5, 4, 'Séjour');
});

describe('une cote qui n’a pas de sens', () => {
  /*
    NEUF CENT QUATRE-VINGT-DIX-NEUF MÈTRES.

    La saisie acceptait n'importe quel nombre : un doigt qui tape « 999 » au
    lieu de « 9,99 » — deux touches d'écart — envoyait un mur à un kilomètre,
    et tout le plan devenait un point à l'écran, sans qu'on comprenne ce
    qu'on venait de faire. Le minimum était déjà borné (soixante
    centimètres) ; il manquait l'autre bout.

    Soixante mètres : c'est trois fois la façade d'une maison, et bien
    au-delà du plus grand hangar qu'on relèvera jamais avec un téléphone.
    Au-delà, ce n'est plus une cote, c'est une faute de frappe.
  */
  it('borne un mur à une longueur de bâtiment', () => {
    const mur = st().walls[0].id;
    st().setWallLength(mur, 999);
    expect(`${Math.round(longueur())} m`).toBe('60 m');
  });

  it('et garde les cotes normales telles quelles', () => {
    const mur = st().walls[0].id;
    st().setWallLength(mur, 7.32);
    expect(longueur()).toBeCloseTo(7.32, 2);
  });
});

describe('un nom trop long', () => {
  /*
    Le cartouche d'une pièce fait quelques centimètres sur le plan, et la
    ligne d'un scan dans la bibliothèque une largeur d'écran. Deux cents
    caractères n'y tiennent pas : ils se tronquent à l'affichage, mais on
    les traîne dans chaque export, dans chaque sauvegarde, et dans le
    courrier du support. On coupe donc à la saisie, une fois pour toutes.
  */
  it('coupe le nom d’une pièce à une longueur lisible', () => {
    st().addRoomBox(3, 3, 'A'.repeat(200));
    const nom = st().rooms[st().rooms.length - 1].name;
    expect(nom.length).toBeLessThanOrEqual(40);
  });

  it('et celui du plan', () => {
    st().renameCurrent('B'.repeat(200));
    expect(st().scanName.length).toBeLessThanOrEqual(60);
  });

  it('sans toucher aux noms ordinaires', () => {
    st().renameCurrent('Chantier Dupont — rue Pasteur');
    expect(st().scanName).toBe('Chantier Dupont — rue Pasteur');
  });
});

describe('une pièce qui perd tous ses murs', () => {
  /*
    UNE PIÈCE SANS UN SEUL MUR N'EST PLUS UNE PIÈCE.

    Elle restait pourtant dans la liste : invisible sur le plan, mais bien
    présente au métré, au contrôle des normes (« Séjour : 0 socle sur 5
    exigés ») et dans le dossier PDF. Un fantôme qu'on ne peut ni voir ni
    corriger, et qui reproche à l'électricien de ne pas l'avoir équipée.

    Elle s'en va donc avec son dernier mur — et elle seule : les autres
    pièces du logement n'ont pas à en souffrir.
  */
  it('s’en va avec son dernier mur', () => {
    st().addRoomBox(3, 3, 'Chambre');
    const chambre = st().rooms[1].id;
    expect(st().rooms).toHaveLength(2);
    for (const m of st().walls.filter((w) => w.roomId === chambre)) {
      st().removeWall(m.id);
    }
    expect(st().rooms.map((r) => r.id)).not.toContain(chambre);
    // Le séjour, lui, est intact : on ne retire que ce qui n'existe plus.
    expect(st().rooms).toHaveLength(1);
    expect(st().walls.length).toBeGreaterThan(0);
  });

  it('mais reste tant qu’il lui reste un mur', () => {
    const mur = st().walls[0].id;
    st().removeWall(mur);
    expect(st().rooms).toHaveLength(1);
  });
});
