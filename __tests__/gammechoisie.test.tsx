/**
 * LA GAMME SORT DU TUNNEL, ET ELLE DIT À QUOI ELLE SERT.
 *
 * Relevé du patron, en deux temps :
 *
 *   « Dans la page "Quel appareillage ?" on indique en dessous une belle
 *   phrase bleue "Vous avez x interrupteurs, x prises, x RJ, etc" et
 *   l'utilisateur doit comprendre qu'on lui propose une gamme pour ceux-ci. »
 *
 *   « Ajouter un article au magasin l'ajoute mais on retourne sur la première
 *   page du choix de gamme à l'ajout. Fais en sorte que la gamme soit
 *   sauvegardée et changeable que depuis la page estimation (icône changement
 *   — nom de la gamme actuelle). »
 *
 * LA PANNE, ET SA CAUSE. L'écran du devis était un tunnel à trois étapes dont
 * le rang vivait dans le composant. Aller au magasin DÉMONTE ce composant :
 * en revenant, on retombait sur la première étape — le choix de gamme —, avec
 * son article bien ajouté et aucun moyen de s'en apercevoir. Le geste le plus
 * courant de la page (« il manque les chevilles ») renvoyait deux écrans en
 * arrière.
 *
 * DEUX CORRECTIFS, ET C'EST LE MÊME SUJET. Le rang de l'étape passe au
 * magasin de l'application : il survit à l'aller-retour. Et le choix de gamme
 * quitte le tunnel pour une PAGE à lui, ouverte depuis l'estimation par un
 * bouton qui nomme la gamme courante — on ne choisit plus sa gamme avant
 * d'avoir vu un prix, on la change en voyant le prix changer.
 *
 * LA PHRASE BLEUE RÉPOND À LA QUESTION QU'ON SE POSE devant cinq marques :
 * « une gamme pour quoi ? » Elle compte l'appareillage DU RELEVÉ, avec les
 * nombres du ticket, et dit ce qui ne bouge pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisScreen } from '../src/screens/DevisScreen';
import { GammeScreen } from '../src/screens/GammeScreen';
import { RetourGlisse } from '../src/components/RetourGlisse';
import { useScanStore } from '../src/store/scanStore';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import { GAMMES } from '../src/geometry/prix';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import { FIXTURES } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';

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

const fx = (id: string, kind: Fixture['kind'], along: number): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along,
  height: kind === 'prise' ? 0.25 : 1.1,
  side: 1,
});

/** Trois familles au relevé : des socles, des commandes, du courant faible. */
const APPAREILS: Fixture[] = [
  fx('p1', 'prise', 0.5),
  fx('p2', 'prise2', 1),
  fx('p3', 'prise', 1.5),
  fx('i1', 'inter', 2),
  fx('i2', 'va', 2.5),
  fx('r1', 'rj45', 3),
];

const ROOMS = [{ id: 'r1', name: 'Séjour', floor: null }];

/*
  DES MINUTEURS FEINTS, DEPUIS QUE L'ATTENTE DES PRIX A UNE DURÉE MINIMALE.

  Relevé du patron : « laisse un chargement plus long pour la vérification,
  c'est trop rapide on aperçoit à peine la page là ». La page d'attente reste
  donc `ATTENTE_MIN` à l'écran (voir `prixverifies`). Attendre pour de vrai
  deux secondes et demie à chaque épreuve qui va au ticket coûterait une
  minute sur ce banc — et un banc lent finit par ne plus être lancé.
*/
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/*
  REMETTRE OU NON LE MAGASIN À ZÉRO — et c'est tout le sujet de ce banc.

  `reset()` efface le rang de l'étape, exprès : un relevé neuf n'a pas lu
  l'avertissement. Les épreuves qui vérifient justement que le rang SURVIT au
  démontage doivent donc reposer le plan SANS remise à zéro — sinon elles
  effacent de leur propre main ce qu'elles prétendent mesurer, et passeraient
  au vert sur un code qui ne retient rien.
*/
const poser = (appareils: Fixture[] = APPAREILS, remettre = true) => {
  if (remettre) useScanStore.getState().reset();
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [],
    rooms: ROOMS as never,
    fixtures: appareils,
    ceiling: [],
    photos: [],
    notes: [],
    niveauCourant: 0,
    screen: 'devis',
    gammeDevis: GAMMES[0].id,
    devisEcartes: [],
  });
};

function mesurer(t: TestRenderer.ReactTestRenderer) {
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 360, height: 240 } } });
      }
    }
  });
}

const ouvrir = (appareils: Fixture[] = APPAREILS, remettre = true) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    poser(appareils, remettre);
    t = TestRenderer.create(<DevisScreen />);
  });
  mesurer(t);
  arbre = t;
  return t;
};

/** Le bouton d'une page, par son nom parlé. */
const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').startsWith(nom),
    )
    .pop();

/** Tous les mots affichés, à plat. */
const mots = (t: TestRenderer.ReactTestRenderer) => {
  const out: string[] = [];
  const lire = (n: unknown): void => {
    if (typeof n === 'string') out.push(n);
    else if (Array.isArray(n)) n.forEach(lire);
    else if (n && typeof n === 'object' && 'props' in (n as never)) {
      lire((n as { props?: { children?: unknown } }).props?.children);
    }
  };
  for (const n of t.root.findAll(() => true)) {
    if (typeof n.props?.children === 'string') out.push(n.props.children);
  }
  lire(null);
  return out;
};

/** Le texte entier de la page, d'un bloc — pour y chercher une phrase. */
const texte = (t: TestRenderer.ReactTestRenderer) => mots(t).join(' • ');

/**
 * Les rangs annoncés par le fil des étapes.
 *
 * DÉDOUBLONNÉS, et c'est le piège que la maison connaît : `findAll` SANS type
 * attrape le composant ET ses nœuds natifs, si bien qu'un `TouchableOpacity`
 * ressort cinq fois. Compté brut, le fil annonçait dix étapes pour deux.
 */
const etapes = (t: TestRenderer.ReactTestRenderer) => {
  const vus = t.root
    .findAll((n) => /^Étape \d+, /.test(String(n.props?.accessibilityLabel ?? '')))
    .map((n) => String(n.props.accessibilityLabel));
  return vus.filter((l, i) => vus.indexOf(l) === i);
};

/** Jusqu'au ticket : une seule étape, désormais, et l'attente des prix. */
const auTicket = async (appareils: Fixture[] = APPAREILS) => {
  const t = ouvrir(appareils);
  act(() => bouton(t, 'Voir le prix')!.props.onPress());
  await act(async () => {
    // L'attente des prix tient l'écran un temps minimum : on l'épuise.
    jest.advanceTimersByTime(ATTENTE_MIN + 50);
  });
  mesurer(t);
  return t;
};

describe('le tunnel n’a plus que deux étapes', () => {
  it('l’avertissement d’abord, le prix ensuite', () => {
    const t = ouvrir();
    const fil = etapes(t);
    expect(fil).toHaveLength(2);
    expect(fil[0]).toContain('À savoir');
    expect(fil[1]).toContain('Prix');
  });

  it('et la gamme ne se choisit plus en chemin', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Si les cartes de gamme étaient restées sur
      la première page, l'épreuve du dessus passerait quand même — deux
      étapes, mais le même tunnel.
    */
    const t = ouvrir();
    expect(texte(t)).not.toContain('Céliane');
    expect(bouton(t, 'Legrand Céliane')).toBeUndefined();
  });
});

describe('la gamme se change depuis l’estimation, et de là seulement', () => {
  it('le ticket porte un bouton qui NOMME la gamme en cours', async () => {
    const t = await auTicket();
    const b = bouton(t, 'Changer de gamme');
    expect(b).toBeDefined();
    expect(String(b!.props.accessibilityLabel)).toContain('Legrand Céliane');
  });

  it('et cet appui ouvre la page des gammes', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'Changer de gamme')!.props.onPress());
    expect(useScanStore.getState().screen).toBe('gamme');
  });
});

describe('la page des gammes', () => {
  const ouvrirGammes = (remettre = true) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      poser(APPAREILS, remettre);
      useScanStore.setState({ screen: 'gamme' });
      t = TestRenderer.create(<GammeScreen />);
    });
    mesurer(t);
    arbre = t;
    return t;
  };

  it('offre les cinq gammes du catalogue', () => {
    const t = ouvrirGammes();
    for (const g of GAMMES) {
      expect(bouton(t, `${g.marque} ${g.nom}`)).toBeDefined();
    }
  });

  it('retient celle qu’on choisit, et ramène au devis', () => {
    const t = ouvrirGammes();
    const autre = GAMMES[3];
    act(() => bouton(t, `${autre.marque} ${autre.nom}`)!.props.onPress());
    expect(useScanStore.getState().gammeDevis).toBe(autre.id);
    expect(useScanStore.getState().screen).toBe('devis');
  });

  it('et l’on revient sur l’ESTIMATION, pas sur l’avertissement', async () => {
    /*
      C'est la moitié du relevé : on change de gamme pour VOIR le prix changer.
      Retomber sur la page d'avertissement obligerait à refaire le chemin à
      chaque essai, et personne n'essaie deux gammes à ce prix-là.
    */
    await auTicket();
    act(() => arbre?.unmount());
    arbre = null;
    const g = ouvrirGammes(false);
    act(() => bouton(g, 'Schneider Odace')!.props.onPress());
    act(() => arbre?.unmount());
    arbre = null;
    const t = ouvrir(APPAREILS, false);
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 50);
    });
    expect(texte(t)).toContain('ESTIMATION DE FOURNITURE');
  });
});

describe('la page ne démarre pas sous la barre d’état', () => {
  /*
    RELEVÉ DU PATRON, CAPTURE À L'APPUI : « la page pour modifier la gamme est
    trop haute ». Sur l'image, le titre « Quel appareillage ? » chevauche
    l'heure et la jauge de batterie : la page commence au pixel zéro de
    l'écran, sous l'encoche.

    C'EST UNE FAUTE DE NAISSANCE DE CETTE PAGE. Ses deux voisines — le devis et
    le magasin — réservent la marge haute ; celle-ci, écrite dans la foulée,
    ne l'a pas reprise. Elle réserve maintenant la marge que l'APPAREIL
    déclare, ce qui vaut mieux que le nombre en dur des deux autres : un
    téléphone sans encoche n'a pas besoin de soixante points.
  */
  const ouvrirGammes = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      poser();
      useScanStore.setState({ screen: 'gamme' });
      t = TestRenderer.create(<GammeScreen />);
    });
    arbre = t;
    return t;
  };

  it('elle réserve la marge haute déclarée par l’appareil', () => {
    const t = ouvrirGammes();
    const fond = StyleSheet.flatten(
      t.root.findByType(RetourGlisse).props.style as never,
    ) as { paddingTop?: number };
    // Le banc d'essai déclare 59 points de marge haute, comme un iPhone à
    // encoche (voir `jest.setup.js`).
    expect(fond.paddingTop).toBeGreaterThanOrEqual(59);
  });

  it('et le titre est POSÉ dessous, pas dessus', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Une marge posée sur le cadre extérieur ne
      sert à rien si l'en-tête la remonte : on vérifie que la rangée du titre
      n'a pas de marge NÉGATIVE, et qu'elle ne s'ancre pas au bord.
    */
    const t = ouvrirGammes();
    const titre = t.root
      .findAll((n) => String(n.props?.children) === 'Quel appareillage ?')
      .pop()!;
    const style = StyleSheet.flatten(titre.props.style as never) as {
      position?: string;
      top?: number;
    };
    expect(style.position).not.toBe('absolute');
    expect(style.top ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('la phrase qui dit à quoi sert une gamme', () => {
  const ouvrirGammes = (appareils: Fixture[] = APPAREILS) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      poser(appareils);
      useScanStore.setState({ screen: 'gamme' });
      t = TestRenderer.create(<GammeScreen />);
    });
    mesurer(t);
    arbre = t;
    return t;
  };

  /** Ce que le TICKET compte comme appareillage : la seule source valable. */
  const comptes = () => {
    const d = chiffrerLePlan(MURS, ROOMS as never, APPAREILS, [], GAMMES[0].id);
    const parFamille = new Map<string, number>();
    for (const l of d.legende) {
      if (l.plafond) continue;
      const f = FIXTURES[l.kind as keyof typeof FIXTURES]?.family;
      if (!f) continue;
      parFamille.set(f, (parFamille.get(f) ?? 0) + l.quantite);
    }
    return parFamille;
  };

  it('compte les socles du relevé, avec le nombre DU TICKET', () => {
    /*
      Le nombre écrit ici et celui du ticket sont le MÊME nombre. Une phrase
      qui recompterait de son côté annoncerait « 4 prises » devant un ticket
      qui en chiffre cinq — et c'est le genre d'écart qu'on ne retrouve
      jamais.
    */
    const t = ouvrirGammes();
    const n = comptes().get('Prises') ?? 0;
    expect(n).toBeGreaterThan(0);
    expect(texte(t)).toContain(`${n} prises`);
  });

  it('et les commandes, et les courants faibles', () => {
    const t = ouvrirGammes();
    const c = comptes();
    expect(texte(t)).toContain(`${c.get('Commandes')} commandes`);
    expect(texte(t)).toContain(
      `${c.get('Courants faibles')} prise de communication`,
    );
  });

  it('elle dit aussi ce que la gamme ne change PAS', () => {
    // Sans ça, la phrase compte sans expliquer — et le patron demande
    // justement qu'on COMPRENNE ce qu'on est en train de choisir.
    expect(texte(ouvrirGammes())).toContain('ne change pas');
  });

  it('et sur un relevé sans appareillage, elle ne compte pas des zéros', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Une phrase bâtie sans regarder le relevé
      dirait « 0 prise, 0 commande » avec le même aplomb. Sans appareil posé,
      il n'y a rien à annoncer : on le dit autrement.
    */
    const t = ouvrirGammes([]);
    expect(texte(t)).not.toContain('0 prise');
    expect(texte(t)).toContain('Aucun appareil');
  });
});

describe('on ne repart plus du début en revenant du magasin', () => {
  it('le rang de l’étape survit au démontage de la page', async () => {
    /*
      LA PANNE, REPRODUITE : aller au magasin démonte l'écran du devis. Le
      rang vivait dans le composant — il repartait donc à zéro, et l'article
      qu'on venait d'ajouter était deux écrans plus loin.
    */
    await auTicket();
    act(() => arbre?.unmount());
    arbre = null;
    // On rouvre SANS remise à zéro : c'est exactement ce que fait un retour
    // du magasin, qui ne touche pas au relevé.
    const t = ouvrir(APPAREILS, false);
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 50);
    });
    expect(texte(t)).toContain('ESTIMATION DE FOURNITURE');
  });

  it('mais un devis qu’on ouvre pour la première fois commence au début', () => {
    // Le contrôle en sens inverse : un rang retenu pour toujours ferait
    // sauter l'avertissement à qui ne l'a jamais lu.
    useScanStore.getState().reset();
    const t = ouvrir();
    expect(texte(t)).not.toContain('ESTIMATION DE FOURNITURE');
    expect(etapes(t)[0]).toContain('en cours');
  });
});
