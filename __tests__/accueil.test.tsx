/**
 * L'ACCUEIL — une page qui a une identité, et qui montre le travail.
 *
 * Relevé du patron : « fais une refonte de la page d'accueil avec une vraie
 * identité, plus qu'un logo et trois boutons ; un design épuré et unique,
 * ludique et compréhensible, un petit message d'accueil moderne, les projets
 * directement visibles sur la page ».
 *
 * Ce banc tient la page de haut en bas :
 *
 *   — QUI ET QUAND : la date en français, le salut à l'heure, au PRÉNOM — le
 *     patron avait retiré le nom posé en bleu à côté du rond du compte (« ça
 *     fait cheap ») ; il demande maintenant un message d'accueil, et c'est
 *     dans la phrase que le prénom a sa place, pas en étiquette ;
 *   — LE MOULINET : quatre tuiles, quatre gestes, deux colonnes coupées à
 *     deux hauteurs, la marque au moyeu ;
 *   — VOS PLANS : les trois derniers, dans l'ordre, ouverts d'un appui ; la
 *     bibliothèque à côté du titre ; la recherche quand il y en a beaucoup ;
 *   — LA CLOCHE : la boîte des messages de l'éditeur, et sa pastille.
 *
 * Seconde passe du patron : « ne fais plus l'option de tracer avec le
 * doigt ; ne mets pas la date et le logo en haut, le logo est déjà au
 * centre ; le logo au centre doit être noir, et ses deux vagues varient en
 * intensité comme un écho ».
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    // Le départ demande l'autorisation de la caméra avant de lancer le scan.
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => null),
    pause: jest.fn(),
    resume: jest.fn(),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LinearGradient as SvgLinearGradient, Path, Rect } from 'react-native-svg';
import { ContourVif, TexteVif } from '../src/components/ContourVif';
import { light } from '../src/theme';
import {
  HomeScreen,
  PLANS_A_LACCUEIL,
  RECHERCHE_DES,
  TEINTES_TUILES,
  questionDuJour,
  quand,
  salutation,
} from '../src/screens/HomeScreen';
import { LogoEcho, LogoMark } from '../src/components/LogoMark';
import { AvatarGlyph } from '../src/components/AvatarGlyph';
import { Avatar } from '../src/components/Avatar';
import { ThemeGlyph } from '../src/components/ThemeGlyph';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { usePremieresFois } from '../src/store/premieresFois';
import { NOM_EXEMPLE } from '../src/data/exemple';
import { useNotifications } from '../src/store/notifications';
import { MESSAGES_EMBARQUES } from '../src/data/nouveautes';

beforeEach(() => {
  jest.useFakeTimers();
  useScanStore.setState({
    screen: 'home',
    supported: true,
    saves: [],
    brouillon: null,
    error: null,
  });
  useAccountStore.setState({ compte: null, pro: false });
  // Tout est lu, par défaut : chaque épreuve de la cloche pose son état.
  useNotifications.setState({ charge: true, recus: [], lus: MESSAGES_EMBARQUES.map((m) => m.id), supprimes: [] });
});
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<HomeScreen />);
  });
  /*
    L'ÉCRAN SE MESURE, DONC LE BANC LE MESURE AUSSI. La feuille du tracé
    attend que sa carte se soit annoncée : sans cet appel, elle ne se
    dessinerait jamais, et l'épreuve accuserait le composant.
  */
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      n.props.onLayout?.({ nativeEvent: { layout: { width: 342, height: 280 } } });
    }
  });
  arbre = t;
  return t;
}

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

/** Par son étiquette et son geste, quel que soit le composant. */
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    (n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === label,
  )[0];

const compteBloc = (t: TestRenderer.ReactTestRenderer) => bouton(t, 'Mon compte');

/** Un plan de bibliothèque, assez complet pour sa vignette et son résumé. */
const plan = (id: string, name: string, updatedAt: number) => ({
  id,
  name,
  createdAt: updatedAt,
  updatedAt,
  walls: [
    { id: `${id}-n`, type: 'wall', a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, height: 2.5, yCenter: 1.25 },
    { id: `${id}-e`, type: 'wall', a: { x: 4, z: 0 }, b: { x: 4, z: 3 }, height: 2.5, yCenter: 1.25 },
    { id: `${id}-s`, type: 'wall', a: { x: 4, z: 3 }, b: { x: 0, z: 3 }, height: 2.5, yCenter: 1.25 },
    { id: `${id}-o`, type: 'wall', a: { x: 0, z: 3 }, b: { x: 0, z: 0 }, height: 2.5, yCenter: 1.25 },
  ],
  openings: [],
  objects: [],
  rooms: [],
});

describe('qui et quand', () => {
  it('salue à l’heure qu’il est', () => {
    expect(salutation(8)).toBe('Bonjour');
    expect(salutation(14)).toBe('Bon après-midi');
    expect(salutation(20)).toBe('Bonsoir');
    expect(salutation(2)).toBe('Bonsoir');
  });

  it('pose la question qui va avec ce qu’on a — le relevé en danger d’abord', () => {
    expect(questionDuJour({ brouillon: true, plans: 4 })).toBe('Un relevé vous attend.');
    expect(questionDuJour({ brouillon: false, plans: 0 })).toBe('Prêt pour votre premier plan ?');
    expect(questionDuJour({ brouillon: false, plans: 3 })).toBe('Que mesure-t-on aujourd’hui ?');
  });

  it('dit « il y a 12 min », « hier », « il y a 3 jours »', () => {
    const t0 = Date.UTC(2026, 9, 9, 12);
    expect(quand(t0 - 12 * 60000, t0)).toBe('il y a 12 min');
    expect(quand(t0 - 26 * 3600000, t0)).toBe('hier');
    expect(quand(t0 - 3 * 86400000, t0)).toBe('il y a 3 jours');
  });

  it('salue au prénom — le premier, dans la phrase, pas en étiquette', () => {
    useAccountStore.setState({
      compte: { id: 'email:j@c.fr', prenom: 'Jérôme Martin', methode: 'email' },
    });
    const vu = textes(monter());
    expect(vu).toContain(`${salutation()}, Jérôme.`);
    expect(vu).not.toContain('Martin');
  });

  it('sans compte, un salut sans nom', () => {
    const vu = textes(monter());
    expect(vu).toContain(`${salutation()}.`);
    expect(vu).toContain('Prêt pour votre premier plan ?');
  });
});

describe('le compte', () => {
  it('est un rond en haut à droite, dans la rangée de la date — rien qui brille', () => {
    useAccountStore.setState({
      compte: { id: 'email:j@c.fr', prenom: 'Jérôme', methode: 'email' },
      pro: true,
    });
    const t = monter();
    const bloc = compteBloc(t);
    expect(bloc).toBeDefined();
    // Il vit dans la rangée d'en-tête, après la cloche : le dernier de la rangée.
    const rangee = bloc.parent!;
    const enfants = rangee.children.filter((e): e is TestRenderer.ReactTestInstance => typeof e !== 'string');
    expect(enfants[enfants.length - 1]).toBe(bloc);
    expect(bloc.findAllByType(Avatar)[0].props.taille).toBe(40);
    expect(bloc.findAllByType(Text).map((n) => String(n.props.children))).toContain('J');
    // En Pro comme en gratuit : le grade vit dans la page du compte.
    expect(bloc.findAllByType(TexteVif)).toHaveLength(0);
    expect(bloc.findAllByType(ContourVif)).toHaveLength(0);
    expect(bloc.findAllByType(SvgLinearGradient)).toHaveLength(0);
    // Tout le bloc prend le clic, et le cadre du clic déborde du rond.
    expect(Number(bloc.props.hitSlop)).toBeGreaterThanOrEqual(10);
    expect(bloc.findAll((n) => typeof n.props?.onPress === 'function' && n !== bloc)).toHaveLength(0);
  });

  it('mène à la page profil', () => {
    const t = monter();
    act(() => compteBloc(t).props.onPress());
    expect(useScanStore.getState().screen).toBe('profil');
  });

  it('sans prénom, l’initiale vient de l’adresse ; sans compte, une silhouette sans cerne', () => {
    useAccountStore.setState({ compte: { id: 'email:m@c.fr', email: 'marie@c.fr', methode: 'email' } });
    let t = monter();
    expect(compteBloc(t).findAllByType(Text).map((n) => String(n.props.children))).toContain('M');
    act(() => t.unmount());
    arbre = null;
    useAccountStore.setState({ compte: null });
    t = monter();
    const glyphe = compteBloc(t).findByType(AvatarGlyph);
    expect(glyphe.props.teinte).toBe(light.inkSoft);
    const traces = glyphe.findAllByType(Path);
    expect(traces).toHaveLength(1);
    expect(traces[0].props.stroke).toBeUndefined();
  });

  it('pas de bouton de thème : c’est un réglage, il vit dans le profil', () => {
    const t = monter();
    expect(t.root.findAllByType(ThemeGlyph)).toHaveLength(0);
    expect(
      t.root.findAll((n) => String(n.props?.accessibilityLabel ?? '').startsWith('Passer en thème')),
    ).toHaveLength(0);
  });
});

describe('le moulinet', () => {
  const GESTES = [
    'Commencer le scan',
    'Dessiner un plan sans scanner',
    'Voir un exemple',
    'Comment ça marche',
  ];
  /** La carte colorée d'une tuile : la vue qui porte son fond. */
  const carte = (t: TestRenderer.ReactTestRenderer, label: string) =>
    bouton(t, label).findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as { backgroundColor?: string; height?: number } | undefined;
      return typeof st?.height === 'number' && typeof st?.backgroundColor === 'string';
    })[0];
  const style = (n: TestRenderer.ReactTestInstance) =>
    StyleSheet.flatten(n.props.style) as { backgroundColor: string; height: number };

  it('porte quatre gestes, chacun sa couleur', () => {
    const t = monter();
    for (const g of GESTES) expect([g, !!bouton(t, g)]).toEqual([g, true]);
    const fonds = GESTES.map((g) => style(carte(t, g)).backgroundColor);
    expect(new Set(fonds).size).toBe(4);
    expect(fonds.sort()).toEqual(Object.values(TEINTES_TUILES.clair).sort());
  });

  it('tourne : deux colonnes de même hauteur, coupées à deux hauteurs différentes', () => {
    const t = monter();
    const h = (g: string) => style(carte(t, g)).height;
    const gauche = [h('Commencer le scan'), h('Voir un exemple')];
    const droite = [h('Dessiner un plan sans scanner'), h('Comment ça marche')];
    expect(gauche[0] + gauche[1]).toBe(droite[0] + droite[1]);
    expect(gauche[0]).not.toBe(droite[0]);
    // Le scan, geste principal, prend la grande tuile.
    expect(gauche[0]).toBeGreaterThan(droite[0]);
  });

  it('la marque au moyeu, NOIRE, cernée du fond de la page, et qui ne prend pas le doigt', () => {
    const t = monter();
    const moyeu = t.root.findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as { position?: string; borderColor?: string } | undefined;
      return st?.position === 'absolute' && st?.borderColor === light.bg && n.findAllByType(LogoEcho).length === 1;
    })[0];
    expect(moyeu).toBeDefined();
    expect(moyeu.props.pointerEvents).toBe('none');
    // La sobriété d'un outil de pro : l'encre, pas le bleu de l'action.
    expect(moyeu.findByType(LogoEcho).props.teinte).toBe(light.ink);
    for (const p of moyeu.findAllByType(Path)) expect(p.props.stroke).toBe(light.ink);
  });

  it('la marque n’apparaît qu’une fois sur la page : au moyeu', () => {
    const t = monter();
    expect(t.root.findAllByType(LogoEcho)).toHaveLength(1);
    expect(t.root.findAllByType(LogoMark)).toHaveLength(0);
  });

  it('chaque tuile s’enfonce et revient sous le doigt', () => {
    const t = monter();
    for (const g of GESTES) {
      const b = bouton(t, g);
      expect(typeof b.props.onPressIn).toBe('function');
      expect(typeof b.props.onPressOut).toBe('function');
      act(() => b.props.onPressIn());
      act(() => b.props.onPressOut());
    }
  });

  it('lance le scan au doigt', async () => {
    const t = monter();
    await act(async () => {
      bouton(t, 'Commencer le scan').props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('scan');
  });

  it('se tait tant qu’on ne sait pas si l’appareil sait scanner', () => {
    useScanStore.setState({ supported: null });
    const t = monter();
    const b = bouton(t, 'Commencer le scan');
    expect(b.props.disabled).toBe(true);
    expect(b.props.accessibilityState?.disabled).toBe(true);
    expect(textes(t)).toContain('Vérification…');
  });

  it('dessine un plan vierge', () => {
    const t = monter();
    act(() => bouton(t, 'Dessiner un plan sans scanner').props.onPress());
    expect(useScanStore.getState().screen).toBe('result');
    expect(useScanStore.getState().planVierge).toBe(true);
  });

  it('ouvre l’appartement d’exemple, sans rien enregistrer', () => {
    const t = monter();
    act(() => bouton(t, 'Voir un exemple').props.onPress());
    const st = useScanStore.getState();
    expect(st.screen).toBe('result');
    expect(st.scanName).toBe(NOM_EXEMPLE);
    expect(st.rooms.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Séjour', 'Chambre', 'Salle d’eau', 'Entrée', 'Bureau']),
    );
    expect(st.objects.length).toBeGreaterThan(10);
    expect(st.currentSaveId).toBeNull();
    expect(st.dirty).toBe(false);
    expect(st.saves).toHaveLength(0);
  });

  it('« Comment ça marche » rejoue la présentation du premier lancement', () => {
    usePremieresFois.setState({ charge: true, vues: ['accueil', 'allumer'] });
    const t = monter();
    act(() => bouton(t, 'Comment ça marche').props.onPress());
    expect(usePremieresFois.getState().vues).toEqual(['allumer']);
  });
});

describe('sur un appareil sans LiDAR', () => {
  it('n’offre plus le scan, dit pourquoi, et garde le reste', () => {
    useScanStore.setState({ supported: false });
    const t = monter();
    expect(bouton(t, 'Commencer le scan')).toBeUndefined();
    expect(bouton(t, 'Scan indisponible sur cet appareil')).toBeDefined();
    const vu = textes(t);
    expect(vu).toContain('pas compatible');
    expect(vu).toContain('capteur LiDAR');
    expect(bouton(t, 'Dessiner un plan sans scanner')).toBeDefined();
    expect(bouton(t, 'Voir un exemple')).toBeDefined();
  });
});

describe('vos plans', () => {
  const quatre = () =>
    useScanStore.setState({
      saves: [
        plan('a', 'Studio Hugo', 1000),
        plan('b', 'Appartement Dupont', 4000),
        plan('c', 'Maison Leroy', 3000),
        plan('d', 'Garage', 2000),
      ] as never,
    });

  it('pour qui n’a encore rien : une carte dit où ils apparaîtront — plus de tracé au doigt', () => {
    const t = monter();
    expect(textes(t)).toContain('Vos plans');
    expect(textes(t)).toContain('Ils apparaîtront ici');
    expect(t.root.findAll((n) => n.props?.testID === 'plans-vide').length).toBeGreaterThan(0);
    expect(bouton(t, 'Mes scans')).toBeUndefined();
  });

  it('les trois derniers touchés, dans l’ordre, sur l’accueil même', () => {
    quatre();
    const t = monter();
    expect(textes(t)).toContain('Vos plans');
    const cartes = t.root
      .findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Ouvrir '))
      .map((n) => n.props.accessibilityLabel);
    expect(cartes).toHaveLength(PLANS_A_LACCUEIL);
    expect(cartes).toEqual(['Ouvrir Appartement Dupont', 'Ouvrir Maison Leroy', 'Ouvrir Garage']);
    // La carte vide s'efface devant les vrais plans.
    expect(t.root.findAll((n) => n.props?.testID === 'plans-vide')).toHaveLength(0);
  });

  it('un appui ouvre le plan', () => {
    quatre();
    const ouvre = jest.fn();
    const avant = useScanStore.getState().openSave;
    useScanStore.setState({ openSave: ouvre } as never);
    const t = monter();
    act(() => bouton(t, 'Ouvrir Maison Leroy').props.onPress());
    expect(ouvre).toHaveBeenCalledWith('c');
    useScanStore.setState({ openSave: avant } as never);
  });

  it('la bibliothèque est au bout du titre, avec son compte', () => {
    quatre();
    const t = monter();
    const lien = bouton(t, 'Mes scans');
    expect(lien).toBeDefined();
    const badge = lien.findAll((n) => n.props?.accessibilityLabel === 'Nombre de scans')[0];
    expect(badge.findAllByType(Text).map((n) => String(n.props.children))).toContain('4');
    act(() => lien.props.onPress());
    expect(useScanStore.getState().screen).toBe('library');
  });

  it('la recherche n’apparaît qu’avec beaucoup de plans, et trouve sans accents', () => {
    quatre();
    let t = monter();
    expect(t.root.findAllByType(TextInput)).toHaveLength(0);
    act(() => t.unmount());
    arbre = null;
    useScanStore.setState({
      saves: Array.from({ length: RECHERCHE_DES }, (_, i) =>
        plan(`p${i}`, i === 2 ? 'Chambre d’Élodie' : `Chantier ${i}`, i),
      ) as never,
    });
    t = monter();
    const champ = t.root.findByType(TextInput);
    act(() => champ.props.onChangeText('elodie'));
    const cartes = t.root
      .findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Ouvrir '))
      .map((n) => n.props.accessibilityLabel);
    expect(cartes).toEqual(['Ouvrir Chambre d’Élodie']);
    // Pendant qu'on cherche, le moulinet s'efface : on cherche, on ne commence pas.
    expect(bouton(t, 'Commencer le scan')).toBeUndefined();
    act(() => champ.props.onChangeText('zzz'));
    expect(textes(t)).toContain('Aucun plan ne porte ce nom.');
  });

  it('le relevé interrompu passe en tête des plans', () => {
    quatre();
    useScanStore.setState({
      brouillon: {
        at: Date.now() - 5 * 60000,
        name: 'Visite',
        walls: plan('x', 'x', 0).walls,
        openings: [],
        objects: [],
        rooms: [],
        fixtures: [],
        ceiling: [],
        photos: [],
        modelPath: null,
      } as never,
    });
    const t = monter();
    const vu = textes(t);
    expect(vu.indexOf('Relevé interrompu')).toBeLessThan(vu.indexOf('Appartement Dupont'));
    expect(vu).toContain('Un relevé vous attend.');
  });
});

describe('la cloche', () => {
  const cloche = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Notifications'),
    )[0];
  const pastille = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => n.props?.testID === 'pastille-notifications')[0];

  it('vit dans l’en-tête, juste avant le compte, et ouvre la boîte', () => {
    const t = monter();
    const b = cloche(t);
    expect(b).toBeDefined();
    const enfants = b.parent!.children.filter((e): e is TestRenderer.ReactTestInstance => typeof e !== 'string');
    expect(enfants.indexOf(b)).toBe(enfants.indexOf(compteBloc(t)) - 1);
    act(() => b.props.onPress());
    expect(useScanStore.getState().screen).toBe('notifications');
  });

  it('sans rien de neuf, pas de pastille', () => {
    const t = monter();
    expect(pastille(t)).toBeUndefined();
    expect(cloche(t).props.accessibilityLabel).toBe('Notifications');
  });

  it('la pastille compte ce qu’on n’a pas lu — et s’arrête à « 9+ »', () => {
    useNotifications.setState({ lus: [] });
    let t = monter();
    const n = MESSAGES_EMBARQUES.length;
    expect(pastille(t).findByType(Text).props.children).toBe(String(n));
    expect(cloche(t).props.accessibilityLabel).toBe(`Notifications, ${n} non lue${n > 1 ? 's' : ''}`);
    act(() => t.unmount());
    arbre = null;
    useNotifications.setState({
      recus: Array.from({ length: 12 }, (_, i) => ({
        id: `m${i}`,
        date: Date.UTC(2026, 9, 1 + i),
        titre: `Message ${i}`,
        texte: 'Texte.',
        genre: 'info' as const,
      })),
    });
    t = monter();
    expect(pastille(t).findByType(Text).props.children).toBe('9+');
  });

  it('une notification supprimée ne compte plus', () => {
    const premier = MESSAGES_EMBARQUES[0].id;
    useNotifications.setState({ lus: MESSAGES_EMBARQUES.slice(1).map((m) => m.id), supprimes: [premier] });
    expect(pastille(monter())).toBeUndefined();
  });
});

describe('le glyphe du moyeu', () => {
  it('garde la part du bloc que l’icône lui donne', () => {
    const logo = monter().root.findByType(LogoEcho);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of logo.findAllByType(Path)) {
      const demi = (p.props.strokeWidth ?? 0) / 2;
      const re = /([MLHVA])([^MLHVA]*)/g;
      let m: RegExpExecArray | null;
      let x = 0;
      while ((m = re.exec(p.props.d))) {
        const nb = (m[2].trim().match(/-?[\d.]+/g) ?? []).map(Number);
        if (m[1] === 'H') x = nb[0];
        else if (m[1] === 'V') continue;
        else if (m[1] === 'A') x = nb[nb.length - 2];
        else x = nb[0];
        minX = Math.min(minX, x - demi);
        maxX = Math.max(maxX, x + demi);
      }
    }
    expect((maxX - minX) / 76).toBeGreaterThan(0.61);
    expect((maxX - minX) / 76).toBeLessThan(0.66);
  });

  it('n’a ni fond ni contour : les trois tracés, chacun dans sa couche', () => {
    const logo = monter().root.findByType(LogoEcho);
    expect(logo.findAllByType(Rect)).toHaveLength(0);
    expect(logo.findAllByType(Path)).toHaveLength(3);
    for (const cle of ['courte', 'longue', 'angle']) {
      expect(logo.findAll((n) => n.props?.testID === `echo-${cle}`).length).toBeGreaterThan(0);
    }
  });
});

describe('la promesse', () => {
  it('reste en pied de page — une phrase, pas une notice', () => {
    const vu = textes(monter());
    expect(vu).toContain('en plan coté');
    for (const mot of ['Scannez', 'Ajustez', 'Explorez', 'Allumez les lumières']) {
      expect(vu).not.toContain(mot);
    }
  });
});

/*
  LES BULLES SE RESSERRENT, PAS LEURS ICÔNES — relevé du patron : « réduis les
  flèches et leur bloc arrière arrondi des quatre bulles ; réduis très
  légèrement le bloc arrière blanc rond des icônes, sans réduire les icônes ».
*/
describe('les quatre bulles', () => {
  const ronds = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(View)
      .map((n) => ({ n, st: StyleSheet.flatten(n.props.style) as { width?: number; borderRadius?: number } }))
      .filter((x) => typeof x.st?.width === 'number' && x.st.borderRadius === (x.st.width as number) / 2);
  const svgDe = (n: TestRenderer.ReactTestInstance) =>
    n.findAll((x) => typeof x.props?.width === 'number' && typeof x.props?.viewBox === 'string')[0];

  it('le rond de l’icône se resserre, l’icône garde sa taille', () => {
    const t = monter();
    const icones = ronds(t).filter((x) => x.st.width === 32);
    expect(icones.length).toBeGreaterThanOrEqual(4);
    for (const r of icones.slice(0, 4)) expect(svgDe(r.n).props.width).toBe(19);
  });

  it('la flèche et son rond se font discrets', () => {
    const t = monter();
    const fleches = ronds(t).filter((x) => x.st.width === 26);
    expect(fleches.length).toBeGreaterThanOrEqual(4);
    for (const r of fleches.slice(0, 4)) expect(svgDe(r.n).props.width).toBe(12);
    // Plus aucun rond de 36 dans les bulles.
    expect(ronds(t).filter((x) => x.st.width === 36 && svgDe(x.n)?.props.width === 16)).toHaveLength(0);
  });
});

