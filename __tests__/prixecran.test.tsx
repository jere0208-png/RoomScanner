/**
 * L'ÉCRAN VA VOIR SI LES PRIX SONT À JOUR, ET LE DIT.
 *
 * Relevé du patron : « pour les prix, j'aimerais une actualisation automatique
 * via l'application, au clic sur le devis, un chargement des prix avec une
 * animation moderne pour voir si les prix sont à jour. Fournir une référence
 * pour le prix (ex : Castorama - date). »
 *
 * CE QUE CE BANC GARDE, ET CE QU'IL NE PEUT PAS GARDER. Le rendu d'une
 * interface React Native ne se REGARDE pas depuis cette machine — on ne peut
 * pas juger à l'œil un anneau qui tourne. Ce banc garantit donc la STRUCTURE,
 * et c'est dit ici en toutes lettres : l'attente s'affiche pendant qu'on va
 * voir, le ticket la remplace ensuite, la référence est écrite, et chacune des
 * trois issues porte les bons mots. Le rythme de l'animation, lui, est à juger
 * dans l'application.
 *
 * TROIS ÉPREUVES QUI COMPTENT PLUS QUE LES AUTRES.
 *
 *   ON N'APPELLE PAS LE SERVEUR TANT QU'ON NE DEMANDE PAS LE PRIX. Les deux
 *   premières étapes ne montrent aucun chiffre, et l'on peut reculer sans
 *   jamais voir le ticket : un aller-retour au serveur pendant qu'on choisit
 *   sa gamme serait un appel pour rien, sur un chantier où le réseau se paie.
 *
 *   LE TOTAL SUIT LE CATALOGUE REÇU. C'est le piège de ce branchement : le
 *   catalogue vit dans un module, React ne le voit pas changer. Sans le
 *   compteur qui force le rechiffrage, les prix arriveraient et l'écran
 *   afficherait toujours les anciens — le devis mentirait sur ce qu'il vient
 *   lui-même d'aller chercher.
 *
 *   ET HORS LIGNE, ON LE DIT AU LIEU DE FAIRE COMME SI. Un devis se fait aussi
 *   en cave. Le bandeau perd alors son bleu et dit avec quoi l'on chiffre.
 */
const mockCoffre = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockCoffre.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockCoffre.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockCoffre.delete(k);
  }),
}));

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisScreen } from '../src/screens/DevisScreen';
import { SERVEUR } from '../src/config/serveur';
import {
  GAMMES,
  RELEVE_RAYON,
  appliquerLesTarifs,
  dateDuReleve,
} from '../src/geometry/prix';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const vraie = SERVEUR.url;
beforeAll(() => {
  SERVEUR.url = 'https://exemple.test';
});
afterAll(() => {
  SERVEUR.url = vraie;
});

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];
const ROOMS = [{ id: 'r1', name: 'Séjour', wallIds: MURS.map((w) => w.id) }];
const APPAREILS: Fixture[] = [
  { id: 'p1', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
  { id: 'p2', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side: 1 },
  { id: 'i1', kind: 'inter', wallId: 'e', along: 1, height: 1.1, side: 1 },
  { id: 't1', kind: 'tableau', wallId: 'o', along: 1, height: 1.35, side: 1 },
];

const CATALOGUE = {
  version: '2026-09',
  releve: '2026-09-03',
  source: 'Castorama',
  // Une gaine à cent euros : de quoi voir le total bouger sans le calculer.
  prix: { 'icta-20': 100, 'icta-16': 100, 'icta-25': 100 },
};

let appels = 0;

const repond = (charge: Record<string, unknown>) => {
  global.fetch = jest.fn(async () => {
    appels += 1;
    return { json: async () => charge } as Response;
  }) as unknown as typeof fetch;
};

const muet = () => {
  global.fetch = jest.fn(async () => {
    appels += 1;
    throw new Error('réseau');
  }) as unknown as typeof fetch;
};

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
  appliquerLesTarifs(null);
});

beforeEach(() => {
  /*
    L'HORLOGE REPART DU RÉEL à chaque épreuve : celles qui la figent le font
    elles-mêmes, et une date laissée en place contaminerait la suivante — le
    magasin Zustand nous a déjà appris ce que coûte un état qui survit.
  */
  jest.setSystemTime(new Date());
  appels = 0;
  mockCoffre.clear();
  appliquerLesTarifs(null);
});

const mots = (t: TestRenderer.ReactTestRenderer): string[] =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((s) => s.length > 0);

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').startsWith(nom),
    )
    .pop()!;

/** Le dessin doit avoir une taille, sans quoi le plan du ticket reste à zéro. */
const mesurer = (t: TestRenderer.ReactTestRenderer) => {
  act(() => {
    for (const v of t.root.findAllByType(View)) {
      v.props.onLayout?.({
        nativeEvent: { layout: { width: 390, height: 620 } },
      });
    }
  });
};

const ouvrir = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: ROOMS as never,
      fixtures: APPAREILS,
      ceiling: [],
      photos: [],
      notes: [],
      niveauCourant: 0,
      screen: 'devis',
      gammeDevis: GAMMES[0].id,
      devisEcartes: [],
      /*
        LE RANG DE L'ÉTAPE SURVIT D'UN BANC À L'AUTRE : il vit dans le magasin
        depuis qu'il doit survivre à l'aller-retour vers le magasin des
        articles (voir `gammechoisie`). Sans cette remise à zéro, la première
        épreuve qui va jusqu'au ticket laisse la suivante démarrer dessus.
      */
      etapeDevis: 0,
    });
    t = TestRenderer.create(<DevisScreen />);
  });
  mesurer(t);
  arbre = t;
  return t;
};

/**
 * L'APPUI QUI MÈNE AU PRIX — un seul, et il y en avait deux.
 *
 * Le tunnel commençait par le choix de gamme. Il a sa page à lui, ouverte
 * depuis l'estimation (voir `gammechoisie`) : reste l'avertissement, puis le
 * prix.
 */
const demanderLePrix = (t: TestRenderer.ReactTestRenderer) => {
  act(() => bouton(t, 'Voir le prix').props.onPress());
};

/** L'attente des prix tient l'écran un temps minimum : on l'épuise. */
const laisserLAttenteFinir = async () => {
  await act(async () => {
    jest.advanceTimersByTime(ATTENTE_MIN + 50);
  });
};

describe('on ne dérange le serveur que quand on demande le prix', () => {
  it('l’avertissement n’appelle personne', () => {
    /*
      DEUX ÉTAPES MUETTES, ET IL N'EN RESTE QU'UNE : le choix de gamme est
      parti sur sa page. La règle, elle, n'a pas bougé — aucun aller-retour au
      serveur tant qu'aucun chiffre n'est demandé, parce qu'on peut très bien
      reculer et ne jamais voir le ticket.
    */
    repond({ ok: true, tarifs: CATALOGUE });
    ouvrir();
    expect(appels).toBe(0);
  });

  it('et « Voir le prix » y va une seule fois', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    await laisserLAttenteFinir();
    expect(appels).toBe(1);
  });
});

describe('pendant qu’on va voir', () => {
  it('l’attente s’affiche à la place du ticket', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    // Avant que la promesse ne se règle : l'attente, et pas de ticket.
    const pendant = mots(t);
    expect(pendant).toContain('Vérification des prix');
    expect(pendant).not.toContain('ESTIMATION DU MATÉRIEL');
    await laisserLAttenteFinir();
    const apres = mots(t);
    expect(apres).toContain('ESTIMATION DU MATÉRIEL');
    expect(apres).not.toContain('Vérification des prix');
  });
});

describe('le bandeau dit d’où viennent les prix', () => {
  it('l’enseigne et le jour, quand le catalogue est arrivé', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    await laisserLAttenteFinir();
    const lus = mots(t);
    expect(lus).toContain('Prix actualisés');
    expect(lus).toContain(`Castorama · ${dateDuReleve('2026-09-03')}`);
  });

  it('et le dit autrement quand on n’a pas pu y aller', async () => {
    /*
      DEUX VERSIONS DE CETTE ÉPREUVE, ET LA SECONDE FIGE L'HORLOGE.

      Elle disait simplement « hors ligne, le bandeau annonce Prix non
      vérifiés ». Depuis que le bandeau reconnaît un catalogue relevé LE JOUR
      MÊME (voir `prixverifies`), la phrase dépend de la date du jour : le 28
      août 2026, le catalogue embarqué est du jour et le bandeau dit
      « vérifiés ». L'épreuve serait donc passée ce jour-là et tombée le
      lendemain, sans qu'une ligne de code ait bougé.

      On lui donne une date. Ici, un jour QUELCONQUE, bien après le relevé
      embarqué : c'est le cas que l'épreuve veut tenir — on n'a pas pu aller
      voir, et le catalogue qui chiffre n'est plus tout jeune.
    */
    jest.setSystemTime(new Date(2026, 10, 15, 9, 0, 0));
    muet();
    const t = ouvrir();
    demanderLePrix(t);
    await laisserLAttenteFinir();
    const lus = mots(t);
    /*
      TROISIÈME VERSION, ET C'EST LE MOT QUI CHANGE.

      Elle attendait « Prix non vérifiés ». Mais le catalogue embarqué PORTE
      des prix vus en rayon : s'en excuser parce que le serveur n'a pas
      répondu, c'est confondre deux questions — « a-t-on pu joindre le
      serveur ? » et « ces prix ont-ils été vus quelque part ? ». On ne
      s'excuse que lorsqu'on n'a RIEN à montrer.
    */
    expect(lus).toContain('Prix relevés en rayon');
    expect(lus).not.toContain('Prix non vérifiés');
    // On dit AVEC QUOI l'on chiffre : un prix sans provenance ne vaut pas
    // mieux qu'une devinette.
    expect(lus.some((m) => m.startsWith('Estimation EchoPlan · '))).toBe(true);
  });

  it('mais le jour du relevé, hors ligne, il ne s’excuse pas', async () => {
    /*
      LE CŒUR DU RELEVÉ DU PATRON : « le "prix non vérifiés" n'inspire pas
      confiance alors qu'ils sont vérifiés ». Sans réseau, un catalogue passé
      en rayon le matin même n'est pas « non vérifié » — ce sont deux
      questions différentes, et l'on répondait à la mauvaise.
    */
    /*
      LE JOUR SE PREND DANS LA CONSTANTE, PAS EN DUR.

      Il était écrit « 28 août 2026 » dans le banc. Le relevé suivant — celui
      des plaques, le 5 septembre — a donc fait tomber cette épreuve alors que
      rien n'était cassé : elle vérifiait l'écran contre une date que le
      catalogue avait quittée. Une épreuve qui recopie une valeur du code
      qu'elle éprouve tombe à chaque fois que cette valeur bouge, et l'on finit
      par la corriger sans la lire.
    */
    const [an, mois, jour] = RELEVE_RAYON.split('-').map(Number);
    jest.setSystemTime(new Date(an, mois - 1, jour, 9, 0, 0));
    muet();
    const t = ouvrir();
    demanderLePrix(t);
    await laisserLAttenteFinir();
    const lus = mots(t);
    /*
      « VÉRIFIÉS AUJOURD'HUI » NE SE DIT PLUS À LA LÉGÈRE.

      Le catalogue embarqué porte maintenant DEUX relevés — les mécanismes du
      28 août, les plaques du 5 septembre — et la promesse porte sur le plus
      vieux : elle vaut pour le catalogue entier, ou elle ne vaut rien.
      Relevé du patron : « des prix s'affichent à la date d'aujourd'hui mais
      d'autres restent par exemple au 28 août ».

      Ce que l'épreuve tient depuis toujours reste tenu, et c'était son
      sujet : hors ligne, le bandeau ne s'EXCUSE pas sur des prix qui ont bien
      été vus en magasin. Il dit désormais la période, ce qui répond d'avance
      à la question.
    */
    expect(lus).not.toContain('Prix non vérifiés');
    expect(lus).toContain('Prix relevés en rayon');
    expect(lus.some((m) => m.includes('28 août'))).toBe(true);
  });
});

describe('le total suit le catalogue reçu', () => {
  it('les prix arrivés rechiffrent la page, ils ne dorment pas dans un module', async () => {
    muet();
    const t = ouvrir();
    demanderLePrix(t);
    await laisserLAttenteFinir();
    // Le total est écrit juste après « TOTAL TTC » : on lit le voisin, pas
    // une étiquette qu'on aurait recopiée.
    const totalLu = (u: TestRenderer.ReactTestRenderer) => {
      const lus = mots(u);
      return lus[lus.indexOf('TOTAL TTC') + 1];
    };
    const horsLigne = totalLu(t);

    act(() => arbre?.unmount());
    arbre = null;
    repond({ ok: true, tarifs: CATALOGUE });
    const u = ouvrir();
    demanderLePrix(u);
    await act(async () => {});
    const avecCatalogue = totalLu(u);

    expect(horsLigne).toBeDefined();
    expect(avecCatalogue).toBeDefined();
    expect(avecCatalogue).not.toBe(horsLigne);
  });
});

describe('chaque ligne porte sa propre référence', () => {
  /*
    ET C'EST LE POINT : un catalogue reçu ne couvre pas tout le bordereau. Les
    articles qu'il ignore gardent le prix embarqué, plus vieux et posé à la
    main. Une seule référence en tête de ticket les ferait tous passer pour des
    prix d'enseigne relevés le même jour.
  */
  it('celles que le catalogue couvre disent l’enseigne, les autres non', async () => {
    repond({ ok: true, tarifs: CATALOGUE });
    const t = ouvrir();
    demanderLePrix(t);
    await laisserLAttenteFinir();
    const lus = mots(t);
    const jour = dateDuReleve('2026-09-03');
    expect(lus.filter((m) => m === `Castorama · ${jour}`).length).toBeGreaterThan(1);
    /*
      ET IL RESTE DES LIGNES CHIFFRÉES AUTREMENT : sans elles, cette épreuve ne
      prouverait rien — un ticket dont TOUTES les lignes viennent du catalogue
      reçu passerait sans montrer que les deux provenances cohabitent.

      On ne nomme pas le libellé de l'estimation : il a déjà changé une fois
      (« Ordre de grandeur du marché français » est devenu « Estimation au
      niveau des grandes surfaces » le jour du relevé en rayon) et ce banc est
      tombé pour cette seule raison. Ce qui compte, c'est qu'une ligne au moins
      NE PORTE PAS l'enseigne du catalogue reçu.
    */
    const autrement = lus.filter(
      (m) => / · /.test(m) && !m.startsWith('Castorama · ') && m.length > 12,
    );
    expect(autrement.length).toBeGreaterThan(0);
  });
});

describe('la mise en forme d’un relevé', () => {
  it('un mois reste un mois, un jour devient un jour', () => {
    expect(dateDuReleve('2026-08')).toBe('août 2026');
    expect(dateDuReleve('2026-09-03')).toBe('3 septembre 2026');
  });

  it('et ce qu’on ne sait pas lire se rend tel quel, sans inventer', () => {
    expect(dateDuReleve('bientôt')).toBe('bientôt');
  });
});
