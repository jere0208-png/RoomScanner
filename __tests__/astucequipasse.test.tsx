/**
 * UN MOT QUI PASSE, ET LES PREMIÈRES FOIS QU'IL SERT À DIRE.
 *
 * Relevé du patron, après une passe globale : « on doit penser utilisateur
 * simple, sans professionnalisme forcément. On doit rendre la chose ludique. »
 *
 * L'APPLICATION AVAIT DEUX FAÇONS DE PARLER, ET IL EN MANQUAIT UNE. L'ALERTE
 * arrête tout et attend qu'on la referme — juste pour un échec, beaucoup trop
 * pour « au fait, vous pouvez toucher cet interrupteur ». La FEUILLE demande un
 * choix. Manquait celle qui dit une chose et s'en va.
 *
 * ET DEUX CHOSES MÉRITAIENT QU'ON LES DISE UNE FOIS :
 *
 *   LE GESTE CACHÉ. On touche un interrupteur sur la maquette et la lumière
 *   s'allume. C'est le seul geste de l'application qui fasse sourire, et rien
 *   ne disait qu'il existait : celui qui ne l'avait pas trouvé par hasard ne le
 *   trouvait jamais.
 *
 *   LE PREMIER PLAN ENREGISTRÉ. L'application a des retours haptiques et pas un
 *   seul instant de récompense — or c'est là que quelqu'un décide s'il
 *   continue.
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
import { StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  AstuceHote,
  DUREE_ASTUCE,
  GLISSE_ASTUCE,
} from '../src/components/AstuceHote';
import { astuce, useAstuce } from '../src/ui/astuce';
import { usePremieresFois } from '../src/store/premieresFois';
import { TotalQuiMonte } from '../src/components/TotalQuiMonte';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => useAstuce.setState({ courante: null, file: [] }));
});
beforeEach(() => {
  mockDisque.clear();
  act(() => useAstuce.setState({ courante: null, file: [] }));
  act(() => usePremieresFois.setState({ charge: false, vues: [] }));
});

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<AstuceHote />);
  });
  arbre = t;
  return t;
};

const lu = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

/** Le temps qu'il faut pour qu'une astuce naisse, vive et s'en aille. */
const toutLeTemps = () => {
  act(() => {
    jest.advanceTimersByTime(GLISSE_ASTUCE * 2 + DUREE_ASTUCE + 100);
  });
};

describe('l’astuce dit une chose, puis s’en va', () => {
  it('rien à l’écran tant que personne ne parle', () => {
    expect(monter().toJSON()).toBeNull();
  });

  it('elle paraît quand on la pose', () => {
    const t = monter();
    act(() => astuce('Touchez l’interrupteur pour allumer.'));
    expect(lu(t)).toContain('Touchez l’interrupteur pour allumer.');
  });

  it('et elle repart toute seule', () => {
    /*
      C'EST CE QUI LA DISTINGUE D'UNE ALERTE. Elle ne demande rien : ni appui,
      ni décision. Une astuce qui resterait à l'écran serait un bandeau, et un
      bandeau, ça se referme — donc ça demande quelque chose.
    */
    const t = monter();
    act(() => astuce('Un mot.'));
    toutLeTemps();
    expect(t.toJSON()).toBeNull();
  });

  it('elle ne prend jamais le doigt, sauf sa croix', () => {
    /*
      Une pastille qui avale un appui pendant les quatre secondes où elle
      passe, c'est un bouton manqué et quelqu'un qui ne comprend pas pourquoi.
    */
    const t = monter();
    act(() => astuce('Un mot.'));
    const zone = t.root
      .findAllByType(View)
      .find((n) => {
        const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
          string,
          unknown
        >;
        return st.position === 'absolute';
      });
    expect(zone?.props.pointerEvents ?? 'auto').not.toBe('auto');
    // Et la croix, elle, répond.
    // On cherche par ce que la croix EST — une cible nommée qui répond au
    // doigt — et non par son composant : `Pressable` passe par un renvoi de
    // référence que l'arbre d'essai ne retrouve pas par son type.
    expect(
      t.root.findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          String(n.props?.accessibilityLabel ?? '').includes('astuce'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('deux astuces se suivent au lieu de se cacher', () => {
    /*
      Deux pastilles empilées, c'est la seconde qui cache la première ; deux
      qui se remplacent, c'est la première qu'on n'a pas eu le temps de lire.
    */
    const t = monter();
    act(() => {
      astuce('La première.');
      astuce('La seconde.');
    });
    expect(lu(t)).toContain('La première.');
    expect(lu(t)).not.toContain('La seconde.');
    toutLeTemps();
    expect(lu(t)).toContain('La seconde.');
  });

  it('mais la MÊME phrase ne bégaie pas', () => {
    // Deux gestes rapides qui lèvent la même astuce la feraient passer deux
    // fois de suite : ça se lit comme un défaut d'affichage.
    const t = monter();
    act(() => {
      astuce('Deux fois.');
      astuce('Deux fois.');
    });
    toutLeTemps();
    expect(t.toJSON()).toBeNull();
  });

  it('une fête ne se dit pas en gris', () => {
    /*
      La distinction n'est pas décorative : une astuce qui EXPLIQUE se pose en
      gris, une qui FÉLICITE prend la couleur de la maison. Mélanger les deux
      ferait d'un conseil une récompense, et l'inverse.
    */
    const t = monter();
    act(() => astuce('Bravo.', { fete: true }));
    const fonds = t.root
      .findAllByType(View)
      .map((n) => {
        const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
          string,
          unknown
        >;
        return st.backgroundColor;
      })
      .filter(Boolean);
    act(() => useAstuce.setState({ courante: null, file: [] }));
    act(() => astuce('Une info.'));
    const gris = t.root
      .findAllByType(View)
      .map((n) => {
        const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
          string,
          unknown
        >;
        return st.backgroundColor;
      })
      .filter(Boolean);
    expect(fonds).not.toEqual(gris);
  });
});

describe('une première fois n’arrive qu’une fois', () => {
  const st = () => usePremieresFois.getState();

  it('elle est neuve, puis elle ne l’est plus', async () => {
    await act(async () => {
      await st().charger();
    });
    expect(st().estNeuve('allumer')).toBe(true);
    act(() => st().marquer('allumer'));
    expect(st().estNeuve('allumer')).toBe(false);
  });

  it('et elle survit à un redémarrage', async () => {
    /*
      C'EST TOUT L'INTÉRÊT. Une marque qui ne tient pas au redémarrage
      reviendrait à chaque lancement, ce qui est le contraire d'une première
      fois : ce serait un rappel, et un rappel qu'on n'a pas demandé est une
      notification.
    */
    await act(async () => {
      await st().charger();
    });
    act(() => st().marquer('planGarde'));
    act(() => usePremieresFois.setState({ charge: false, vues: [] }));
    await act(async () => {
      await st().charger();
    });
    expect(st().estNeuve('planGarde')).toBe(false);
    // Et les autres n'ont pas été emportées.
    expect(st().estNeuve('allumer')).toBe(true);
  });

  it('rien n’est neuf tant que le disque n’a pas répondu', () => {
    /*
      LE SENS PRUDENT, ET IL COMPTE. Au démarrage, la liste est vide et tout
      paraîtrait neuf : on montrerait la visite guidée à chaque lancement, une
      demi-seconde avant que le disque ne dise le contraire. Ça se verrait, et
      exactement au pire moment.
    */
    expect(usePremieresFois.getState().charge).toBe(false);
    expect(st().estNeuve('accueil')).toBe(false);
  });

  it('et une clé inventée sur le disque est ignorée', async () => {
    // Un fichier abîmé ne doit pas pouvoir faire TAIRE un message qu'on n'a
    // jamais montré — ni en ajouter un qui n'existe pas.
    mockDisque.set(
      'roomscanner.premieresfois.v1',
      JSON.stringify(['allumer', 'nimporte-quoi']),
    );
    await act(async () => {
      await st().charger();
    });
    expect(st().vues).toEqual(['allumer']);
  });

  it('un disque illisible ne casse rien', async () => {
    mockDisque.set('roomscanner.premieresfois.v1', 'pas du json');
    await act(async () => {
      await st().charger();
    });
    expect(st().vues).toEqual([]);
    expect(st().charge).toBe(true);
  });
});

describe('le total arrive, mais il se lit à la première image', () => {
  /*
    C'EST LA LEÇON D'UN PREMIER DESSIN RATÉ, et elle mérite d'être tenue.

    Le total montait de zéro à son montant en sept dixièmes de seconde. Joli,
    et faux : le total est le nombre le PLUS ÉPROUVÉ de l'application — quatre
    bancs le lisent en toutes lettres, et le prochain le lira aussi. Le faire
    dépendre du temps, c'est demander à chaque épreuve, pour toujours, de
    savoir qu'il faut avancer les horloges avant de lire un prix. Deux bancs
    sont tombés à l'écriture ; ils avaient raison.

    LE CHIFFRE NE BOUGE PLUS, SA LIGNE ARRIVE. Même « ta-da » — l'œil suit un
    mouvement à l'endroit du chiffre — et la valeur est lisible tout de suite.

    CE QUI SE MESURE NE S'ANIME PAS. On anime ce qui le PORTE.
  */
  it('la valeur est là avant que rien n’ait bougé', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <TotalQuiMonte valeur={520.27} format={(v) => `${v.toFixed(2)} €`} />,
      );
    });
    arbre = t;
    expect(
      t.root
        .findAllByType(Text)
        .map((n) => String(n.props.children))
        .join(' '),
    ).toContain('520.27 €');
  });

  it('et c’est le BLOC qui arrive, pas le nombre', () => {
    /*
      Le contrôle en sens inverse : sans mouvement du tout, on aurait
      simplement retiré la fête. Ce qui porte le chiffre monte en opacité et
      en échelle — deux valeurs ANIMÉES, pas deux nombres écrits en dur.
    */
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <TotalQuiMonte valeur={1} format={(v) => `${v}`} />,
      );
    });
    arbre = t;
    /*
      ON MESURE LA PREMIÈRE IMAGE, et c'est le plus sûr : `Animated.View`
      résout ses valeurs avant de les passer à la vue d'en dessous, donc on
      lit des NOMBRES. Mais ces nombres-là sont ceux du DÉPART — invisible et
      plus petit — et une vue sans animation les aurait à un et un.
    */
    const debut = t.root
      .findAllByType(View)
      .map((n) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>)
      .find((st) => typeof st.opacity === 'number' && Array.isArray(st.transform));
    expect(debut).toBeDefined();
    expect(debut!.opacity).toBeLessThan(0.2);
    const echelle = (debut!.transform as Record<string, number>[]).find(
      (x) => 'scale' in x,
    );
    expect(echelle?.scale).toBeLessThan(1);
  });
});
