/**
 * L'APPLICATION NE SE FERME PLUS SANS RIEN DIRE.
 *
 * Relevé du patron : « l'app a quitté plusieurs fois après des clics sur des
 * meubles. Fais en sorte qu'on ait un diagnostic d'erreurs. »
 *
 * CE QUI SE PASSAIT, ET POURQUOI ON N'EN SAVAIT RIEN. Une erreur JavaScript
 * non rattrapée dans un gestionnaire d'appui — le doigt sur un meuble — ne
 * passe PAS par les frontières d'erreur de React : celles-ci n'attrapent que
 * le RENDU. Elle remonte au gestionnaire global de la plateforme, et en
 * production elle est FATALE : l'application se ferme. Sans console branchée,
 * il ne reste rien — ni message, ni pile, ni même la certitude qu'il
 * s'agissait d'un défaut du programme plutôt que d'un manque de mémoire.
 *
 * IL FAUT DONC LES DEUX PORTES, et c'est le point qu'on rate d'habitude : une
 * frontière d'erreur seule n'aurait rien changé au cas décrit — on aurait
 * ajouté un filet là où personne ne tombe.
 *
 * CE BANC TIENT LES DEUX, plus les garanties qui font qu'un journal de pannes
 * ne devient pas lui-même une panne.
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

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { GardeFou } from '../src/components/GardeFou';
import {
  PANNES_GARDEES,
  enregistrerPanne,
  usePannes,
} from '../src/ui/journalPannes';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});
beforeEach(() => {
  mockDisque.clear();
  act(() => usePannes.setState({ charge: false, incidents: [] }));
});

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      String(n.props?.accessibilityLabel ?? '') === nom,
  )[0];

/** Un composant qui casse au rendu, à la demande. */
function Casse({ quand }: { quand: boolean }) {
  if (quand) throw new Error('le meuble n’a pas de forme');
  return <Text>tout va bien</Text>;
}

describe('le journal garde ce qui s’est passé', () => {
  it('une panne s’écrit, avec son message et son écran', () => {
    enregistrerPanne(new Error('boum'), { ecran: 'result', fatale: true });
    const [p] = usePannes.getState().incidents;
    expect(p.message).toBe('boum');
    expect(p.ecran).toBe('result');
    expect(p.fatale).toBe(true);
  });

  it('le plus récent est en tête', () => {
    // C'est celui qu'on vient chercher : la panne d'il y a dix minutes.
    enregistrerPanne(new Error('la vieille'));
    enregistrerPanne(new Error('la fraîche'));
    expect(usePannes.getState().incidents[0].message).toBe('la fraîche');
  });

  it('et l’on n’en garde que dix', () => {
    /*
      Un journal qui grossit sans fin finit par peser dans le stockage d'un
      téléphone, et personne ne lit le onzième : ce qu'on cherche, c'est le
      dernier, et éventuellement de voir qu'il s'est déjà produit trois fois.
    */
    for (let i = 0; i < PANNES_GARDEES + 5; i++) {
      enregistrerPanne(new Error(`n°${i}`));
    }
    const vus = usePannes.getState().incidents;
    expect(vus).toHaveLength(PANNES_GARDEES);
    expect(vus[0].message).toBe(`n°${PANNES_GARDEES + 4}`);
  });

  it('il survit au redémarrage', async () => {
    enregistrerPanne(new Error('avant la fermeture'), { ecran: 'result' });
    act(() => usePannes.setState({ charge: false, incidents: [] }));
    await act(async () => {
      await usePannes.getState().charger();
    });
    expect(usePannes.getState().incidents[0].message).toBe(
      'avant la fermeture',
    );
  });

  it('et une erreur BIZARRE ne le fait pas tomber', () => {
    /*
      LA GARANTIE QUI COMPTE LE PLUS. Une fonction de diagnostic qui lève une
      erreur pendant qu'on traite une erreur fait perdre la panne d'origine —
      et l'on se retrouve à chercher un défaut qui n'existe pas. On lui
      envoie donc tout ce qu'un `throw` peut porter : ce n'est pas toujours
      une `Error`.
    */
    const boucle: Record<string, unknown> = {};
    boucle.moi = boucle; // JSON.stringify lèverait sur celui-là.
    for (const bizarre of [undefined, null, 'une chaîne', 42, boucle, {}]) {
      expect(() => enregistrerPanne(bizarre)).not.toThrow();
    }
    expect(usePannes.getState().incidents).toHaveLength(6);
    for (const p of usePannes.getState().incidents) {
      expect(typeof p.message).toBe('string');
      expect(p.message.length).toBeGreaterThan(0);
    }
  });

  it('un disque illisible ne casse rien non plus', async () => {
    mockDisque.set('roomscanner.pannes.v1', 'pas du json');
    await act(async () => {
      await usePannes.getState().charger();
    });
    expect(usePannes.getState().incidents).toEqual([]);
    expect(usePannes.getState().charge).toBe(true);
  });

  it('et la pile est coupée : on garde le début, pas le reste', () => {
    /*
      Les premières lignes disent où ça a cassé ; les suivantes sont le chemin
      de React, identique à chaque fois. Tout garder ferait un journal
      illisible et un fichier qui gonfle.
    */
    const e = new Error('longue');
    e.stack = 'x'.repeat(5000);
    enregistrerPanne(e);
    expect(usePannes.getState().incidents[0].pile.length).toBeLessThan(1200);
  });
});

describe('la première porte : une erreur de RENDU', () => {
  it('l’application ne disparaît pas, elle s’explique', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GardeFou ecran={() => 'result'}>
          <Casse quand={false} />
        </GardeFou>,
      );
    });
    arbre = t;
    expect(mots(t)).toContain('tout va bien');
    act(() => t.update(
      <GardeFou ecran={() => 'result'}>
        <Casse quand />
      </GardeFou>,
    ));
    expect(mots(t)).toContain('L’application s’est arrêtée net');
    // Et le détail est LISIBLE, pas caché derrière un « voir plus » : c'est
    // la seule information qui permette de corriger.
    expect(mots(t)).toContain('le meuble n’a pas de forme');
  });

  it('elle propose de REPRENDRE, pas de tout jeter', () => {
    /*
      C'EST UN CHOIX, ET IL SE DÉFEND. Après une erreur, l'état peut être
      bancal, et le réflexe prudent serait de tout remettre à zéro. Mais
      « tout remettre à zéro » veut dire JETER LE RELEVÉ EN COURS —
      c'est-à-dire faire exactement le dégât qu'on cherche à éviter.
    */
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GardeFou>
          <Casse quand />
        </GardeFou>,
      );
    });
    arbre = t;
    expect(bouton(t, 'Reprendre')).toBeDefined();
    act(() => t.update(
      <GardeFou>
        <Casse quand={false} />
      </GardeFou>,
    ));
    act(() => bouton(t, 'Reprendre').props.onPress());
    expect(mots(t)).toContain('tout va bien');
  });

  it('et la panne est dans le journal, avec l’écran', () => {
    act(() => {
      arbre = TestRenderer.create(
        <GardeFou ecran={() => 'result'}>
          <Casse quand />
        </GardeFou>,
      );
    });
    const [p] = usePannes.getState().incidents;
    expect(p.message).toBe('le meuble n’a pas de forme');
    expect(p.ecran).toBe('result');
  });
});

describe('la seconde porte : ce que React ne voit PAS', () => {
  /*
    C'EST LE CAS DU RELEVÉ. Une erreur dans un gestionnaire d'appui ne remonte
    pas aux frontières : elle va au gestionnaire global de la plateforme, et
    elle est fatale. Sans cette porte-là, le diagnostic n'aurait jamais rien
    attrapé du plantage décrit — on aurait posé un filet à côté du vide.
  */
  interface Utils {
    getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
    setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
  }
  const global2 = global as unknown as { ErrorUtils?: Utils };
  let avant: Utils | undefined;
  let plateforme: jest.Mock;

  beforeEach(() => {
    avant = global2.ErrorUtils;
    plateforme = jest.fn();
    let courant: (e: unknown, fatal?: boolean) => void = plateforme;
    global2.ErrorUtils = {
      getGlobalHandler: () => courant,
      setGlobalHandler: (h) => {
        courant = h;
      },
    };
  });
  afterEach(() => {
    global2.ErrorUtils = avant;
  });

  const monter = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GardeFou ecran={() => 'result'}>
          <View />
        </GardeFou>,
      );
    });
    arbre = t;
    return t;
  };

  it('une erreur fatale hors rendu est attrapée et montrée', () => {
    const t = monter();
    act(() => {
      global2.ErrorUtils!.getGlobalHandler()(
        new Error('le meuble touché n’existe plus'),
        true,
      );
    });
    expect(mots(t)).toContain('L’application s’est arrêtée net');
    expect(usePannes.getState().incidents[0].message).toBe(
      'le meuble touché n’existe plus',
    );
  });

  it('mais une erreur NON fatale ne dérange personne', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il évite un remède pire que le mal :
      une promesse rejetée dans un coin est écrite au journal et ne coupe pas
      le travail. Interrompre pour un incident que l'application a digéré
      serait pire que le silence d'avant.
    */
    const t = monter();
    act(() => {
      global2.ErrorUtils!.getGlobalHandler()(new Error('petit souci'), false);
    });
    expect(mots(t)).not.toContain('L’application s’est arrêtée net');
    expect(usePannes.getState().incidents[0].message).toBe('petit souci');
  });

  it('et le gestionnaire de la plateforme est TOUJOURS appelé', () => {
    /*
      LE NÔTRE OBSERVE, IL NE REMPLACE PAS. Écraser celui de la plateforme
      couperait les rapports de plantage et le message rouge du mode
      développement — c'est-à-dire les deux choses qui servent à déboguer, au
      nom d'un outil censé aider à déboguer.
    */
    monter();
    const boum = new Error('boum');
    act(() => {
      global2.ErrorUtils!.getGlobalHandler()(boum, true);
    });
    expect(plateforme).toHaveBeenCalledWith(boum, true);
  });

  it('et il le retrouve intact quand le garde-fou s’en va', () => {
    const t = monter();
    act(() => t.unmount());
    arbre = null;
    expect(global2.ErrorUtils!.getGlobalHandler()).toBe(plateforme);
  });
});
