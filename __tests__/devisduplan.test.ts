/**
 * LE DEVIS VOYAGE AVEC SON PLAN.
 *
 * Relevé du patron : « fais en sorte que le devis soit sauvegardé avec le plan
 * actuel ».
 *
 * CE QUI SE PERDAIT, ET CE QUE ÇA COÛTAIT. La gamme d'appareillage, les articles
 * écartés du ticket, les quantités corrigées à la main et tout ce qu'on avait
 * pris au magasin vivaient dans le magasin de l'application, jamais dans
 * l'entrée de bibliothèque. Un dossier rouvert le lendemain revenait donc en
 * Céliane avec un ticket vierge — et le travail de chiffrage, qui est un vrai
 * travail sur un logement complet, était à refaire.
 *
 * PIRE : IL PASSAIT D'UN CHANTIER À L'AUTRE. Les articles pris au magasin pour
 * le T3 de la rue Pasteur se retrouvaient sur le devis du pavillon suivant,
 * puisque rien ne les effaçait entre deux relevés. Un devis faux dans le sens
 * qui coûte : trop d'articles, chez quelqu'un qui ne les a pas demandés.
 *
 * TROIS RÈGLES, ET ELLES TIENNENT ENSEMBLE :
 *   — enregistrer un plan écrit son devis ;
 *   — ouvrir un plan rend le sien, et RIEN d'autre ;
 *   — repartir d'un relevé neuf repart d'un devis neuf.
 */
/*
  ON LIT CE QUE LE BROUILLON ÉCRIT SUR LE DISQUE, pas ce qu'on aurait voulu
  qu'il écrive. Le faux disque est une simple table : le nom commence par
  « mock », faute de quoi Jest refuse qu'une fabrique de module touche une
  variable du fichier.
*/
const mockDisque = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
}));

import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';
import { GAMMES } from '../src/geometry/prix';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

/*
  LE PALIER GRATUIT N'EST PAS LE SUJET DE CE BANC.

  Depuis qu'une COPIE compte pour un plan (voir `unseulplan`), `saveAsCopy`
  refuse quand le palier est épuisé — et le magasin du compte survit d'une
  épreuve à l'autre. La deuxième sauvegarde d'un banc tombait donc dans le
  vide, sans qu'aucune épreuve ne parle d'abonnement.

  On travaille donc ici sur un compte qui a le droit d'enregistrer, et l'on
  dit pourquoi : le verrou est éprouvé là où il est le sujet.
*/
const compteQuiPeutEnregistrer = () =>
  useAccountStore.setState({ pro: true, plansUtilises: 0, bonusEssais: 0 });

/** Un relevé posé, prêt à être enregistré. */
const poserUnPlan = (nom: string) => {
  compteQuiPeutEnregistrer();
  useScanStore.getState().reset();
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [],
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
    fixtures: [],
    ceiling: [],
    photos: [],
    notes: [],
    scanName: nom,
  });
};

/** Le chiffrage qu'on fait à la main sur un ticket. */
const chiffrerAlaMain = () => {
  const s = useScanStore.getState();
  s.setGammeDevis('odace');
  s.basculerArticleDevis('icta-20');
  s.reglerQuantiteDevis('fil-2.5-phase', 3);
  s.ajouterAuDevis('vis-placo', 2);
};

const devisCourant = () => {
  const s = useScanStore.getState();
  return {
    gamme: s.gammeDevis,
    ecartes: s.devisEcartes,
    quantites: s.devisQuantites,
    ajouts: s.devisAjouts,
  };
};

describe('enregistrer un plan écrit son devis', () => {
  it('la gamme, les écartés, les quantités et le caddie', () => {
    poserUnPlan('Chantier A');
    chiffrerAlaMain();
    useScanStore.getState().saveAsCopy('Chantier A');
    const entree = useScanStore.getState().saves[0];
    expect(entree.devis).toBeDefined();
    expect(entree.devis!.gamme).toBe('odace');
    expect(entree.devis!.ecartes).toContain('icta-20');
    expect(entree.devis!.quantites['fil-2.5-phase']).toBe(3);
    expect(entree.devis!.ajouts).toEqual([{ code: 'vis-placo', quantite: 2 }]);
  });

  it('et un plan chiffré ensuite se remet à jour', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE de l'écriture : un devis recopié une seule
      fois, à la création de l'entrée, laisserait la bibliothèque sur le
      premier chiffrage — et l'électricien croirait avoir enregistré le
      second.
    */
    poserUnPlan('Chantier B');
    useScanStore.getState().saveAsCopy('Chantier B');
    chiffrerAlaMain();
    useScanStore.getState().commitCurrent();
    const entree = useScanStore
      .getState()
      .saves.find((s) => s.name === 'Chantier B')!;
    expect(entree.devis?.gamme).toBe('odace');
  });
});

describe('ouvrir un plan rend le sien', () => {
  it('et pas celui du chantier d’avant', () => {
    /*
      LA PANNE QUI COÛTE. Les articles pris au magasin pour un chantier se
      retrouvaient sur le devis du suivant : rien ne les effaçait entre deux
      dossiers. Un devis faux dans le sens qui coûte — trop d'articles, chez
      quelqu'un qui ne les a pas demandés.
    */
    poserUnPlan('Avec devis');
    chiffrerAlaMain();
    useScanStore.getState().saveAsCopy('Avec devis');
    const avecDevis = useScanStore.getState().saves[0].id;

    poserUnPlan('Sans devis');
    useScanStore.getState().saveAsCopy('Sans devis');
    const sansDevis = useScanStore.getState().saves[0].id;

    useScanStore.getState().openSave(avecDevis);
    expect(devisCourant()).toEqual({
      gamme: 'odace',
      ecartes: ['icta-20'],
      quantites: { 'fil-2.5-phase': 3 },
      ajouts: [{ code: 'vis-placo', quantite: 2 }],
    });

    useScanStore.getState().openSave(sansDevis);
    expect(devisCourant()).toEqual({
      gamme: GAMMES[0].id,
      ecartes: [],
      quantites: {},
      ajouts: [],
    });
  });

  it('et un relevé d’AVANT le devis attaché s’ouvre sur un ticket neuf', () => {
    /*
      Les dossiers déjà enregistrés n'ont pas de devis dans leur entrée. Ils
      ne doivent pas hériter de celui qu'on avait sous les yeux : un plan sans
      chiffrage s'ouvre vierge, comme il l'a toujours fait.
    */
    poserUnPlan('Ancien');
    useScanStore.getState().saveAsCopy('Ancien');
    const id = useScanStore.getState().saves[0].id;
    // On retire le devis de l'entrée, comme un relevé écrit avant ce jour.
    useScanStore.setState({
      saves: useScanStore
        .getState()
        .saves.map((s) => (s.id === id ? { ...s, devis: undefined } : s)),
    });
    chiffrerAlaMain();
    useScanStore.getState().openSave(id);
    expect(devisCourant().gamme).toBe(GAMMES[0].id);
    expect(devisCourant().ajouts).toEqual([]);
  });
});

describe('un relevé neuf repart d’un devis neuf', () => {
  it('« Nouveau scan » efface le chiffrage du précédent', () => {
    poserUnPlan('Premier');
    chiffrerAlaMain();
    useScanStore.getState().reset();
    expect(devisCourant()).toEqual({
      gamme: GAMMES[0].id,
      ecartes: [],
      quantites: {},
      ajouts: [],
    });
  });
});

describe('le filet de secours le retient aussi', () => {
  it('un brouillon repris rend le plan AVEC son chiffrage', () => {
    /*
      Un devis touché rend le plan « à enregistrer », donc le brouillon se
      réécrit à chaque geste sur le ticket. S'il ne portait pas le chiffrage,
      la reprise rendrait le plan sans son caddie — et l'on croirait avoir
      tout retrouvé. « Un filet qui retient la moitié de ce qui tombe est un
      filet qui MENT », c'est écrit dans la reprise elle-même.
    */
    poserUnPlan('Chantier E');
    chiffrerAlaMain();
    useScanStore.getState().ecrireBrouillon();
    const ecrit = JSON.parse(mockDisque.get('roomscanner.brouillon.v1') ?? '{}');
    expect(ecrit.devis?.gamme).toBe('odace');

    useScanStore.getState().reset();
    useScanStore.setState({ brouillon: ecrit });
    useScanStore.getState().reprendreBrouillon();
    expect(devisCourant()).toEqual({
      gamme: 'odace',
      ecartes: ['icta-20'],
      quantites: { 'fil-2.5-phase': 3 },
      ajouts: [{ code: 'vis-placo', quantite: 2 }],
    });
  });

  it('et un brouillon d’AVANT se reprend sur un ticket neuf', () => {
    // Le contrôle en sens inverse : un relevé sauvé par la version d'hier
    // n'a pas de chiffrage, et ne doit pas hériter de celui qu'on a sous les
    // yeux.
    poserUnPlan('Chantier F');
    useScanStore.getState().ecrireBrouillon();
    const ecrit = JSON.parse(mockDisque.get('roomscanner.brouillon.v1') ?? '{}');
    chiffrerAlaMain();
    useScanStore.setState({ brouillon: { ...ecrit, devis: undefined } });
    useScanStore.getState().reprendreBrouillon();
    expect(devisCourant().gamme).toBe(GAMMES[0].id);
    expect(devisCourant().ajouts).toEqual([]);
  });
});

describe('chiffrer, c’est modifier le dossier', () => {
  it('toucher au devis fait apparaître « Enregistrer »', () => {
    /*
      Si le devis appartient au plan, le changer laisse le dossier différent
      de ce qui est écrit sur le disque — et l'électricien doit le voir. Sans
      ce drapeau, on chiffre une heure, on quitte, et rien ne prévient.
    */
    poserUnPlan('Chantier C');
    useScanStore.getState().saveAsCopy('Chantier C');
    expect(useScanStore.getState().dirty).toBe(false);
    useScanStore.getState().ajouterAuDevis('vis-placo', 1);
    expect(useScanStore.getState().dirty).toBe(true);
  });

  it('mais l’ouvrir ne le salit pas', () => {
    // Le contrôle en sens inverse : un drapeau posé à l'ouverture ferait
    // proposer d'enregistrer un dossier qu'on vient de lire.
    poserUnPlan('Chantier D');
    chiffrerAlaMain();
    useScanStore.getState().saveAsCopy('Chantier D');
    const id = useScanStore.getState().saves[0].id;
    useScanStore.getState().openSave(id);
    expect(useScanStore.getState().dirty).toBe(false);
  });
});
