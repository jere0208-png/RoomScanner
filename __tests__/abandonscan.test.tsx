/**
 * ABANDONNER UN SCAN NE DOIT PAS EFFACER LE LOGEMENT.
 *
 * Passe au doigt sur le relevé, comme sur le chantier. La croix est en haut
 * a GAUCHE de l'ecran de scan — exactement la ou se pose le pouce ou l'index
 * de la main qui tient le telephone pendant qu'on balaie une piece. Elle
 * appelle `cancel`, et `cancel` appelait `reset` : tout le magasin remis a
 * zero, retour a l'accueil.
 *
 * Sur un scan neuf, c'est le bon geste : il n'y a rien d'autre a jeter que
 * le scan lui-meme. Sur les DEUX autres entrees, non :
 *
 *   — « Scanner une piece » (complement) : le logement est deja releve,
 *     equipe, peut-etre pas encore enregistre. Un doigt qui frotte la croix
 *     et tout disparait.
 *   — « Monter un etage » : pareil, avec le rez-de-chaussee.
 *
 * Un abandon n'abandonne QUE ce qu'on est en train de faire. Et sur un scan
 * neuf deja bien avance — des murs releves —, il se confirme : ce n'est pas
 * une confirmation de plus, c'est la seule chose qu'on ne rattrape pas.
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

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import TestRenderer, { act } from 'react-test-renderer';
import { ScanScreen } from '../src/screens/ScanScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAlerte } from '../src/ui/alerte';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const st = () => useScanStore.getState();

/** Un logement deja releve, ouvert a l'ecran. */
const logement = () => ({
  screen: 'scan' as const,
  scanName: 'Chantier',
  walls: SNAPSHOT_WALLS,
  openings: SNAPSHOT_OPENINGS,
  objects: SNAPSHOT_OBJECTS,
  rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Piece ${i + 1}`, floor: null })),
  fixtures: [],
  ceiling: [],
  photos: [],
  scanning: true,
  paused: false,
  processing: false,
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.restoreAllMocks();
});

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ScanScreen />);
  });
  arbre = t;
  return t;
};

const croix = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === 'Arrêter le scan')!;


describe('abandonner un complement de scan', () => {
  it('garde le logement releve, et revient au plan', () => {
    act(() => {
      useScanStore.setState({ ...logement(), complementEnCours: true });
    });
    const t = monter();
    act(() => croix(t).props.onPress());
    // Le plan est intact : c'est le complement qu'on abandonne, pas lui.
    expect(st().walls).toHaveLength(SNAPSHOT_WALLS.length);
    expect(st().rooms.length).toBeGreaterThan(0);
    expect(st().screen).toBe('result');
    // Et l'application n'est plus armee pour un complement.
    expect(st().complementEnCours).toBe(false);
    expect(st().scanning).toBe(false);
  });
});

describe('abandonner un etage', () => {
  it('garde le niveau du dessous', () => {
    act(() => {
      useScanStore.setState(logement());
      st().scannerUnEtage(1);
    });
    const t = monter();
    act(() => croix(t).props.onPress());
    expect(st().walls).toHaveLength(SNAPSHOT_WALLS.length);
    expect(st().screen).toBe('result');
    // Sans quoi le scan SUIVANT atterrirait au premier etage.
    expect(st().etageEnCours).toBeNull();
  });
});

/*
  L'ALERTE EST DEVENUE LA NOTRE.

  Ce banc espionnait `Alert.alert`, la fenetre du systeme. Elle a disparu de
  l'application — « police systeme, boutons bleus empiles, coins de 2019 »,
  disait deja `Sheet.tsx`, et vingt-cinq d'entre elles trainaient encore. La
  confirmation passe maintenant par la feuille maison (`src/ui/alerte.ts`),
  qu'on lit dans son magasin plutot que par un espion.

  Ce qui se verifie ici n'a pas bouge : on demande avant de jeter, et c'est
  la reponse ROUGE qui jette.
*/
const posee = () => useAlerte.getState().courante;
const gesteRouge = () =>
  (posee()?.actions ?? []).find((a) => a.danger);

describe('abandonner un scan neuf', () => {
  it('ne demande rien tant qu’il n’y a rien a perdre', () => {
    useAlerte.setState({ courante: null, file: [] });
    act(() => {
      st().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, wallCount: 0 });
    });
    const t = monter();
    act(() => croix(t).props.onPress());
    // Rien de releve : une confirmation inutile est une confirmation qu'on
    // apprend a balayer sans lire.
    expect(posee()).toBeNull();
    expect(st().screen).toBe('home');
  });

  it('mais se confirme des que des murs sont releves', () => {
    useAlerte.setState({ courante: null, file: [] });
    act(() => {
      st().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, wallCount: 6 });
    });
    const t = monter();
    act(() => croix(t).props.onPress());
    expect(posee()?.titre).toMatch(/Abandonner/);
    // Tant qu'on n'a pas repondu, le scan continue.
    expect(st().screen).toBe('scan');
    // Et la reponse rouge, elle, jette.
    act(() => gesteRouge()?.onPress?.());
    expect(st().screen).toBe('home');
  });
});

/**
 * LE REFUS DU VISEUR S'EFFACE, comme l'annonce qui le remplace.
 *
 * Passe au doigt : on vise le vide, l'app repond « Visez un mur deja
 * releve — balayez-le d'abord ». Juste. Mais ce message RESTAIT : il ne
 * s'effacait qu'a la pose suivante REUSSIE. On balaie la piece pendant deux
 * minutes avec, sous les yeux, un reproche qui ne vaut plus. La cote qu'on
 * annonce apres une pose reussie, elle, s'efface au bout de trois secondes —
 * c'est la meme regle, et le refus l'avait ratee.
 */
describe('le refus du viseur', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  const mots = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Text)
      .map((n) =>
        (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
          .filter((x: unknown) => typeof x === 'string')
          .join(''),
      )
      .join(' | ');

  it('se dit, puis rend la place', async () => {
    (RoomScan.poserAuViseur as jest.Mock).mockResolvedValue(null);
    act(() => {
      st().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, paused: false });
    });
    const t = monter();
    const bouton = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Poser Prise'))!;
    await act(async () => {
      await bouton.props.onPress();
    });
    expect(mots(t)).toMatch(/Visez un mur/);
    // Trois secondes plus tard, l'ecran est rendu au releve.
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(mots(t)).not.toMatch(/Visez un mur/);
  });
});

/**
 * UNE ERREUR DE FIN DE SCAN SE DIT LA OU ELLE ARRIVE.
 *
 * Le post-traitement de RoomPlan echoue parfois — c'est meme le cas connu :
 * « aucun mur detecte ». Le magasin retenait bien le message, mais SEUL
 * l'ecran d'accueil l'affiche : on restait donc sur la vue de scan, camera
 * morte, sans un mot. On appuie a nouveau sur « Terminer », rien ne se
 * passe, et l'app parait plantee.
 *
 * Le message se dit sur l'ecran ou l'on est, avec la sortie.
 */
describe('une fin de scan qui echoue', () => {
  it('le dit, et offre la sortie', () => {
    act(() => {
      st().reset();
      useScanStore.setState({
        screen: 'scan',
        scanning: true,
        processing: false,
        error: 'Aucun mur détecté',
      });
    });
    const t = monter();
    const vu = t.root
      .findAllByType(Text)
      .map((n) => String(n.props.children))
      .join(' | ');
    expect(vu).toMatch(/Aucun mur détecté/);
    const sortie = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').includes('Quitter le scan'));
    expect(sortie).toBeDefined();
    act(() => sortie!.props.onPress());
    expect(st().screen).not.toBe('scan');
  });
});

/**
 * UN RELEVE ABANDONNE PENDANT L'ASSEMBLAGE NE S'OUVRE PAS QUAND MEME.
 *
 * L'assemblage dure quelques secondes, et la croix flottait AU-DESSUS de son
 * voile (elle porte un `zIndex`, le voile n'en a pas). On pouvait donc
 * abandonner pendant ce moment-la : le magasin repartait a zero, puis le
 * resultat arrivait et ouvrait le plan qu'on venait de jeter.
 */
describe('abandonner pendant l’assemblage', () => {
  it('n’ouvre pas le plan qui arrive apres coup', async () => {
    let livrer: (r: unknown) => void = () => {};
    (RoomScan.stop as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { livrer = resolve; }),
    );
    act(() => {
      st().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, wallCount: 4 });
    });
    const t = monter();
    const terminer = t.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        n.findAllByType(Text).some((x) => x.props.children === 'Terminer'),
      )!;
    act(() => {
      terminer.props.onPress();
    });
    expect(st().processing).toBe(true);
    // La croix ne doit meme plus etre la pendant l'assemblage.
    expect(
      t.root
        .findAllByType(TouchableOpacity)
        .some((n) => n.props.accessibilityLabel === 'Arrêter le scan'),
    ).toBe(false);
    // Mais si elle l'a ete — ou si l'on abandonne autrement — le resultat
    // qui arrive ensuite ne doit rien ouvrir.
    act(() => {
      st().reset();
    });
    await act(async () => {
      livrer({ surfaces: [], objects: [], modelPath: '' });
    });
    expect(st().screen).toBe('home');
    expect(st().walls).toHaveLength(0);
  });
});
