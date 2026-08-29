/**
 * RIEN DU CHANTIER PRÉCÉDENT NE SUIT DANS LE SUIVANT.
 *
 * Relevé du patron : « trouve des défauts. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMMENT ON L'A TROUVÉ. En comparant, champ par champ, ce que l'état du
 * magasin contient et ce que `reset()` repose. Cinquante-neuf champs de
 * données, vingt-huit reposés à la main — et une liste écrite à la main finit
 * toujours par prendre du retard sur la structure qu'elle décrit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SURVIVAIT, ET CE QUE ÇA DONNE.
 *
 * LE NOM ET L'ADRESSE DU CLIENT. C'est le pire des quatre, et de loin : ces
 * deux champs vont dans le CARTOUCHE DU PDF — « le dossier remis au client
 * porte toujours le nom de celui qui le reçoit ». Ils ne repartaient pas à
 * zéro. On relève un logement rue Pasteur, on en relève un autre le
 * lendemain, on exporte — et l'on tend à quelqu'un un dossier au nom d'un
 * autre, avec son adresse. Ce n'est pas un défaut d'affichage : c'est une
 * fuite d'information entre deux clients.
 *
 * L'ÉTAGE QU'ON REGARDAIT. Le plan, le métré et l'établi ne montrent que le
 * niveau courant. En repartir un neuf depuis le premier étage laissait
 * `niveauCourant` à 1, alors que les murs du nouveau relevé sont au niveau 0 :
 * on tombait sur un PLAN VIDE. Et un plan vide après un scan se lit comme un
 * scan raté — on recommence, et ça refait la même chose.
 *
 * L'ÉTAGE QU'ON S'APPRÊTAIT À SCANNER. `etageEnCours` armé, le scan SUIVANT —
 * celui d'un autre logement — atterrissait au premier étage d'un dossier qui
 * n'avait rien demandé. Le code connaît ce piège : il le désarme à
 * l'ABANDON et à l'ÉCHEC du post-traitement, mais pas quand on repart d'un
 * relevé neuf.
 *
 * L'ÉCHEC D'ENREGISTREMENT. Une alerte du chantier d'avant, levée sur le
 * chantier d'après.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
}));

import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();

/** Le chantier d'hier, tel qu'on l'a laissé. */
const chantierPrecedent = () => {
  useScanStore.setState({
    client: 'Mme Berger',
    address: '12 rue Pasteur, Lille',
    niveauCourant: 1,
    etageEnCours: 1,
    panne: { message: 'plus de place', quand: 1 } as never,
    pendingJoin: { wallId: 'n', end: 'a' } as never,
  });
};

describe('un relevé neuf ne porte rien de l’ancien', () => {
  beforeEach(chantierPrecedent);

  it('ni le nom du client', () => {
    /*
      LE PIRE DES QUATRE. Ce champ va dans le cartouche du PDF : on tend à
      quelqu'un un dossier au nom d'un autre. Ce n'est pas un défaut
      d'affichage, c'est une fuite entre deux clients.
    */
    st().reset();
    expect(st().client).toBeFalsy();
  });

  it('ni son adresse', () => {
    st().reset();
    expect(st().address).toBeFalsy();
  });

  it('ni l’étage qu’on regardait', () => {
    /*
      Les murs d'un relevé neuf sont au niveau zéro. Rester au premier
      montrait un PLAN VIDE — et un plan vide après un scan se lit comme un
      scan raté.
    */
    st().reset();
    expect(st().niveauCourant).toBe(0);
  });

  it('ni l’étage qu’on s’apprêtait à scanner', () => {
    // Le code connaît ce piège : il désarme à l'abandon et à l'échec du
    // post-traitement. Pas quand on repart d'un relevé neuf.
    st().reset();
    expect(st().etageEnCours).toBeNull();
  });

  it('ni l’échec d’enregistrement du chantier d’avant', () => {
    st().reset();
    expect(st().panne).toBeNull();
  });

  it('ni un raccord de mur laissé en suspens', () => {
    st().reset();
    expect(st().pendingJoin).toBeNull();
  });
});

describe('mais ce qui doit survivre survit', () => {
  /*
    LE CONTRÔLE EN SENS INVERSE, ET IL EST INDISPENSABLE ICI. Un `reset()` qui
    balaierait tout passerait les six épreuves du dessus — et effacerait la
    bibliothèque de l'utilisateur, son thème et ses préférences d'affichage.
    La règle n'est pas « tout effacer » : c'est « rien du CHANTIER ».
  */
  it('la bibliothèque, le thème et les préférences', () => {
    useScanStore.setState({
      saves: [{ id: 's1', name: 'T3 Pasteur' }] as never,
      savesCharges: true,
      themePref: 'dark',
      showFurniture: false,
      showSurfaces: false,
      supported: true,
    });
    st().reset();
    expect(st().saves).toHaveLength(1);
    expect(st().savesCharges).toBe(true);
    expect(st().themePref).toBe('dark');
    expect(st().showFurniture).toBe(false);
    expect(st().showSurfaces).toBe(false);
    expect(st().supported).toBe(true);
  });
});
