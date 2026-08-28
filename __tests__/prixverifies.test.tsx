/**
 * « PRIX VÉRIFIÉS » QUAND ILS L'ONT ÉTÉ AUJOURD'HUI — et une attente qu'on voit.
 *
 * Relevé du patron :
 *
 *   « Le "prix non vérifiés" n'inspire pas confiance alors qu'ils sont
 *   vérifiés, fais en sorte que si le jour de l'update est le jour même, on met
 *   "prix vérifiés" avec belle couleur. Et laisse un chargement plus long pour
 *   la vérification, c'est trop rapide on aperçoit à peine la page là. »
 *
 * IL A RAISON, ET LA CAUSE ÉTAIT PLUS BÊTE QUE LE SYMPTÔME. Hors ligne, le
 * bandeau datait le catalogue avec la VERSION des tarifs — « 2026-08.2 » —, une
 * chaîne que `dateDuReleve` ne sait pas mettre en français et rend telle
 * quelle. Le jour du relevé en rayon existait pourtant, à la journée près, dans
 * la table des prix : personne ne le lui passait. Le bandeau disait donc « Prix
 * non vérifiés · 2026-08.2 » d'un catalogue relevé le matin même.
 *
 * CE QUE « VÉRIFIÉS » VEUT DIRE, ET CE QUE ÇA NE VEUT PAS DIRE. Le bandeau date
 * le CATALOGUE, pas chaque ligne : trente-sept prix ont été vus en rayon, les
 * autres sont recalés et le disent, ligne par ligne, comme avant. Ce qui est
 * affirmé ici, c'est la date du dernier passage — et elle est vraie.
 *
 * L'ATTENTE, ELLE, EST UN RYTHME. Le rendu ne se regarde pas depuis cette
 * machine ; ce banc tient ce qui se mesure — que la page d'attente reste
 * affichée assez longtemps pour se lire, et qu'elle ne coupe pas une réponse
 * plus lente qu'elle.
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
import { ATTENTE_MIN, BandeauTarifs } from '../src/components/PrixQuiSActualisent';
import { SERVEUR } from '../src/config/serveur';
import {
  GAMMES,
  RELEVE_RAYON,
  appliquerLesTarifs,
  dateDuReleve,
  releveDuJour,
} from '../src/geometry/prix';
import { light } from '../src/theme';
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
  { id: 'i1', kind: 'inter', wallId: 'e', along: 1, height: 1.1, side: 1 },
];

/*
  DES MINUTEURS FEINTS, parce qu'on mesure une DURÉE. Sans eux, l'épreuve
  attendrait deux secondes et demie pour de vrai, trois fois — et la maison a
  déjà appris qu'un banc lent finit par ne plus être lancé.
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

// ------------------------------------------------------ le jour du relevé

describe('un relevé du jour se reconnaît', () => {
  const midi = new Date(2026, 7, 28, 12, 0, 0).getTime();

  it('le même jour, oui', () => {
    expect(releveDuJour('2026-08-28', midi)).toBe(true);
  });

  it('la veille, non', () => {
    // Le contrôle en sens inverse : sans lui, une fonction qui rend toujours
    // vrai passerait l'épreuve du dessus.
    expect(releveDuJour('2026-08-27', midi)).toBe(false);
  });

  it('et un relevé qui ne dit que son MOIS ne peut pas être du jour', () => {
    /*
      Les prix estimés portent « 2026-08 », sans jour : on ne sait pas quand
      ils ont été posés, donc on n'affirme rien. C'est la même règle que pour
      un prix qu'on ne comprend pas — on ne le recopie pas.
    */
    expect(releveDuJour('2026-08', midi)).toBe(false);
  });

  it('le relevé embarqué porte bien un JOUR, pas seulement un mois', () => {
    /*
      LA CAUSE DE LA PANNE, TENUE PAR UN BANC. Le bandeau datait le catalogue
      avec la version des tarifs — « 2026-08.2 » —, alors que le jour du
      passage en rayon existait dans la table. Il est maintenant exporté, et
      c'est lui qu'on affiche.
    */
    expect(RELEVE_RAYON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// --------------------------------------------------------------- le bandeau

describe('le bandeau dit « vérifiés » quand ça l’est', () => {
  const monter = (props: Record<string, unknown>) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <BandeauTarifs
          etat="horsligne"
          enseigne="Castorama"
          jour="28 août 2026"
          {...props}
        />,
      );
    });
    arbre = t;
    return t;
  };

  it('relevé du jour : « Prix vérifiés aujourd’hui »', () => {
    expect(mots(monter({ duJour: true }))).toContain('Prix vérifiés aujourd’hui');
  });

  it('et en VERT, la couleur de ce qui est acquis', () => {
    /*
      Relevé du patron : « avec belle couleur ». Le vert de l'application est
      celui du total du devis — ce qui est acquis, chiffré, tenu. Le bleu
      informe, le gris s'excuse ; ni l'un ni l'autre n'inspire confiance.
    */
    const t = monter({ duJour: true });
    const mot = t.root
      .findAllByType(Text)
      .find((n) => String(n.props.children) === 'Prix vérifiés aujourd’hui')!;
    const teintes = [mot.props.style]
      .flat(3)
      .map((s) => (s && typeof s === 'object' ? (s as { color?: string }).color : null))
      .filter(Boolean);
    expect(teintes).toContain(light.green);
  });

  it('mais sans relevé du jour, il ne se vante pas', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte tout le sujet : un bandeau vert
      posé partout rassurerait sur un catalogue vieux de trois mois. Hors
      ligne et sans relevé du jour, il dit toujours qu'il n'a pas pu aller
      voir.
    */
    const lus = mots(monter({ duJour: false }));
    expect(lus).toContain('Prix non vérifiés');
    expect(lus).not.toContain('Prix vérifiés aujourd’hui');
  });

  it('et les deux issues en ligne gardent leurs mots', () => {
    expect(mots(monter({ etat: 'actualise', duJour: false }))).toContain(
      'Prix actualisés',
    );
    expect(mots(monter({ etat: 'ajour', duJour: false }))).toContain(
      'Prix à jour',
    );
  });
});

// ------------------------------------------------------------- dans l'écran

describe('l’écran, hors ligne, avec un catalogue relevé aujourd’hui', () => {
  const muet = () => {
    global.fetch = jest.fn(async () => {
      throw new Error('réseau');
    }) as unknown as typeof fetch;
  };

  const ouvrir = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().reset();
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
        etapeDevis: 0,
      });
      t = TestRenderer.create(<DevisScreen />);
    });
    act(() => {
      for (const v of t.root.findAllByType(View)) {
        v.props.onLayout?.({
          nativeEvent: { layout: { width: 390, height: 620 } },
        });
      }
    });
    arbre = t;
    return t;
  };

  const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
    t.root
      .findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          String(n.props?.accessibilityLabel ?? '').startsWith(nom),
      )
      .pop()!;

  it('date le catalogue au JOUR, et non avec un numéro de version', async () => {
    muet();
    const t = ouvrir();
    act(() => bouton(t, 'Voir le prix').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 50);
    });
    /*
      ON MESURE LA LIGNE DU BANDEAU, et non toute la page : l'en-tête du ticket
      porte « tarifs 2026-08.2 », et c'est à sa place — une VERSION de
      catalogue dit que deux devis à deux mois d'écart ne s'égalent pas. Ce
      qu'on corrige, c'est la ligne qui prétendait donner une DATE.
    */
    const source = mots(t).find((m) => m.startsWith('Estimation EchoPlan · '));
    expect(source).toBeDefined();
    expect(source).not.toContain('2026-08.2');
    expect(source).toBe(`Estimation EchoPlan · ${dateDuReleve(RELEVE_RAYON)}`);
  });
});

// --------------------------------------------------------------- l'attente

describe('l’attente dure assez longtemps pour se voir', () => {
  const repondVite = () => {
    global.fetch = jest.fn(async () => ({
      json: async () => ({ ok: true, tarifs: null }),
    })) as unknown as typeof fetch;
  };

  const ouvrir = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().reset();
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
        etapeDevis: 0,
      });
      t = TestRenderer.create(<DevisScreen />);
    });
    arbre = t;
    return t;
  };

  const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
    t.root
      .findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          String(n.props?.accessibilityLabel ?? '').startsWith(nom),
      )
      .pop()!;

  it('deux secondes au moins : le relevé dit « on aperçoit à peine la page »', () => {
    expect(ATTENTE_MIN).toBeGreaterThanOrEqual(2000);
  });

  it('le ticket ne paraît pas avant', async () => {
    repondVite();
    const t = ouvrir();
    act(() => bouton(t, 'Voir le prix').props.onPress());
    // La réponse est déjà là ; l'attente, elle, n'est pas finie.
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN - 200);
    });
    expect(mots(t)).not.toContain('ESTIMATION DE FOURNITURE');
  });

  it('et il paraît juste après', async () => {
    // Le contrôle en sens inverse : une attente qui ne finirait jamais
    // passerait l'épreuve du dessus.
    repondVite();
    const t = ouvrir();
    act(() => bouton(t, 'Voir le prix').props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 200);
    });
    expect(mots(t)).toContain('ESTIMATION DE FOURNITURE');
  });
});
