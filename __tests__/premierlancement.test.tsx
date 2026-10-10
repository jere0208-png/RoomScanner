/**
 * LE FILM « COMMENT ÇA MARCHE » — et la question du mode, après lui.
 *
 * Relevé du patron : « les tutos de comment ça marche sont mal faits. Fais en
 * sorte d'avoir un tutoriel réaliste, sous forme de vidéo en motion design,
 * fluide et rapide, avec une coupure entre chaque étape et un bouton
 * « Suivant » qui apparaît, qui débloque la suite de la vidéo, étape 2, 3…
 * Pas de design fait rapidement pour la présentation des plans. »
 *
 * Ce banc tient :
 *   — le FILM : cinq chapitres, chacun joue sur son horloge ; « Suivant »
 *     n'agit pas tant que le chapitre joue, APPARAÎT à sa fin, et enchaîne
 *     après une coupure ; un appui sur l'image va droit à la fin ; « Revoir »
 *     rejoue ; « Passer » sort à tout moment ; moins de mouvement demandé,
 *     chaque chapitre est servi déjà joué ;
 *   — le RÉALISME : les arêtes du scan sont celles du rendu, toutes dans
 *     l'image ; le plan nomme les VRAIES pièces de l'exemple avec leurs
 *     surfaces ; l'aménagement pose chacun de ses meubles ; la 3D passe du
 *     logement vide au logement meublé ;
 *   — la QUESTION du mode, après le film, seulement si personne n'y a
 *     répondu.
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
import { AccessibilityInfo, Image, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PremierLancement } from '../src/components/PremierLancement';
import { planDuFilm } from '../src/components/FilmTutoriel';
import { ARETES_DU_SCAN, CHAPITRES } from '../src/data/film';
import { appartementExemple } from '../src/data/exemple';
import { useUsage } from '../src/store/usage';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  useUsage.setState({ charge: true, modeElec: true, choisi: true });
});

const monter = (onFini = () => {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<PremierLancement onFini={onFini} />);
  });
  // La scène prend sa taille : c'est elle qui fait jouer le décor.
  act(() => {
    const scene = t.root.find((n) => n.props?.accessibilityRole === 'image' && typeof n.props?.onLayout === 'function');
    scene.props.onLayout({ nativeEvent: { layout: { width: 350, height: 470 } } });
  });
  arbre = t;
  return t;
};

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)))
    .join(' | ');

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith(nom),
  )[0];

/** « Suivant » est-il là, et actif ? */
const suivantActif = (t: TestRenderer.ReactTestRenderer, nom = 'Suivant') => {
  const b = bouton(t, nom);
  return !!b && b.props.accessibilityState?.disabled === false;
};

/** Laisse le chapitre en cours jouer jusqu'au bout. */
const jouer = (rang: number) => {
  act(() => {
    jest.advanceTimersByTime(CHAPITRES[rang].duree + 400);
  });
};

/** Appuie « Suivant », et laisse passer la coupure. */
const enchainer = (t: TestRenderer.ReactTestRenderer, nom = 'Suivant') => {
  act(() => bouton(t, nom).props.onPress());
  act(() => {
    jest.advanceTimersByTime(500);
  });
};

describe('un film, chapitre par chapitre', () => {
  it('cinq chapitres, cinq pistes, et l’on commence par le scan', () => {
    const t = monter();
    expect(CHAPITRES).toHaveLength(5);
    expect(t.root.findAll((n) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('piste-') && typeof n.type === 'string')).toHaveLength(5);
    expect(mots(t)).toContain(CHAPITRES[0].titre);
    expect(mots(t)).toContain('1 / 5');
  });

  it('« Suivant » n’agit pas tant que le chapitre joue — puis il apparaît', () => {
    const t = monter();
    expect(suivantActif(t)).toBe(false);
    // Un appui trop tôt ne fait rien.
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(mots(t)).toContain(CHAPITRES[0].titre);
    jouer(0);
    expect(suivantActif(t)).toBe(true);
  });

  it('il débloque la suite, après une coupure', () => {
    const t = monter();
    jouer(0);
    enchainer(t);
    expect(mots(t)).toContain(CHAPITRES[1].titre);
    expect(mots(t)).toContain('2 / 5');
    // Le nouveau chapitre rejoue : « Suivant » s'est retiré.
    expect(suivantActif(t)).toBe(false);
  });

  it('un appui sur l’image va droit à la fin du chapitre', () => {
    const t = monter();
    const scene = t.root.find((n) => n.props?.accessibilityRole === 'image' && typeof n.props?.onPress === 'function');
    act(() => scene.props.onPress());
    expect(suivantActif(t)).toBe(true);
  });

  it('« Revoir » rejoue l’étape', () => {
    const t = monter();
    jouer(0);
    act(() => bouton(t, 'Revoir').props.onPress());
    expect(suivantActif(t)).toBe(false);
    jouer(0);
    expect(suivantActif(t)).toBe(true);
    expect(mots(t)).toContain(CHAPITRES[0].titre);
  });

  it('jusqu’au dernier, qui lance l’app quand on a déjà répondu', () => {
    const fini = jest.fn();
    const t = monter(fini);
    for (let i = 0; i < CHAPITRES.length - 1; i++) {
      jouer(i);
      enchainer(t);
    }
    expect(mots(t)).toContain(CHAPITRES[4].titre);
    jouer(4);
    expect(bouton(t, 'Suivant')).toBeUndefined();
    act(() => bouton(t, 'C’est parti').props.onPress());
    expect(fini).toHaveBeenCalledTimes(1);
  });

  it('« Passer » sort à tout moment', () => {
    const fini = jest.fn();
    const t = monter(fini);
    act(() => bouton(t, 'Passer').props.onPress());
    expect(fini).toHaveBeenCalledTimes(1);
  });

  it('moins de mouvement demandé : chaque chapitre est servi déjà joué', async () => {
    const espion = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const t = monter();
    await act(async () => {
      await Promise.resolve();
    });
    expect(suivantActif(t)).toBe(true);
    espion.mockRestore();
  });
});

describe('un film réaliste', () => {
  it('les arêtes du scan sont celles du rendu, et toutes dans l’image', () => {
    expect(ARETES_DU_SCAN.length).toBeGreaterThan(20);
    for (const s of ARETES_DU_SCAN) {
      for (const v of [...s.a, ...s.b]) {
        expect(v).toBeGreaterThanOrEqual(-0.021);
        expect(v).toBeLessThanOrEqual(1.021);
      }
    }
    // Les murs, les baies ET les meubles sont relevés.
    for (const sorte of ['sol', 'angle', 'baie', 'meuble']) {
      expect(ARETES_DU_SCAN.some((s) => s.sorte === sorte)).toBe(true);
    }
    const t = monter();
    expect(t.root.findAll((n) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('arete-') && typeof n.type === 'string')).toHaveLength(ARETES_DU_SCAN.length);
  });

  it('le plan nomme les vraies pièces de l’exemple, avec leurs surfaces', () => {
    const t = monter();
    jouer(0);
    enchainer(t);
    jouer(1);
    const lus = mots(t);
    for (const r of appartementExemple().rooms as { name: string }[]) expect(lus).toContain(r.name);
    expect(lus).toMatch(/\d+,\d m²/);
    // Les cotes d'ensemble : la largeur et la profondeur du logement.
    const plan = planDuFilm();
    expect(lus).toContain(`${plan.lx.toFixed(2).replace('.', ',')} m`);
    expect(plan.total).toBeGreaterThan(40);
  });

  it('les sols disent la pièce : carrelage à l’eau, parquet ailleurs — « Bureau » compris', () => {
    const plan = planDuFilm();
    const humide = (nom: string) => plan.pieces.find((p) => p.nom === nom)?.humide;
    expect(humide('Salle d’eau')).toBe(true);
    // « Bur-eau » contient « eau » : c'est le MOT qui compte.
    expect(humide('Bureau')).toBe(false);
    expect(humide('Séjour')).toBe(false);
  });

  it('le plan du film est le poché de l’app, portes comprises', () => {
    const plan = planDuFilm();
    expect(plan.poche.baies.some((b) => b.type === 'door')).toBe(true);
    // La maçonnerie d'un seul tenant, comme le plan de l'app.
    expect(plan.poche.contours.length).toBeGreaterThan(0);
  });

  it('l’aménagement pose CHAQUE meuble de l’exemple', () => {
    const t = monter();
    jouer(0);
    enchainer(t);
    jouer(1);
    enchainer(t);
    const poses = t.root.findAll(
      (n) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('meuble-film-') && typeof n.type === 'string',
    );
    expect(poses).toHaveLength(appartementExemple().objects.length);
  });

  it('la 3D passe du logement vide au logement meublé, puis à hauteur d’œil', () => {
    const t = monter();
    for (let i = 0; i < 3; i++) {
      jouer(i);
      enchainer(t);
    }
    expect(mots(t)).toContain(CHAPITRES[3].titre);
    // Trois images : le vide, le meublé, et la vue de dedans.
    expect(t.root.findAllByType(Image).length).toBeGreaterThanOrEqual(3);
    expect(mots(t)).toContain('À hauteur d’œil');
  });

  it('le dossier porte le nom, la surface et les pièces — et ses formats', () => {
    const t = monter();
    for (let i = 0; i < 4; i++) {
      jouer(i);
      enchainer(t);
    }
    jouer(4);
    const lus = mots(t);
    for (const f of ['PDF', 'DXF', '3D']) expect(lus).toContain(f);
    expect(lus).toContain('Dossier envoyé');
    expect(lus).toMatch(/5 pièces · \d+,\d m²/);
  });
});

describe('la question du mode, après le film', () => {
  /*
    Elle se pose APRÈS le film — après avoir vu ce que fait l'application,
    pas avant : demander « êtes-vous électricien ? » à quelqu'un qui ne sait
    pas encore ce qu'il a téléchargé, c'est lui faire choisir à l'aveugle.
  */
  const jusquALaQuestion = (onFini = () => {}) => {
    useUsage.setState({ charge: true, modeElec: false, choisi: false });
    const t = monter(onFini);
    for (let i = 0; i < CHAPITRES.length - 1; i++) {
      jouer(i);
      enchainer(t);
    }
    jouer(4);
    // Le dernier chapitre ne lance pas : il reste la question.
    act(() => bouton(t, 'Continuer').props.onPress());
    return t;
  };

  it('vient après le film, et porte deux réponses', () => {
    const t = jusquALaQuestion();
    const lus = mots(t);
    expect(lus).toContain('À quoi va vous servir EchoPlan ?');
    expect(bouton(t, 'Mesurer et aménager')).toBeDefined();
    expect(bouton(t, 'Je suis électricien')).toBeDefined();
  });

  it('« Je suis électricien » allume le mode, et referme', () => {
    const fini = jest.fn();
    const t = jusquALaQuestion(fini);
    act(() => bouton(t, 'Je suis électricien').props.onPress());
    expect(useUsage.getState().modeElec).toBe(true);
    expect(useUsage.getState().choisi).toBe(true);
    expect(fini).toHaveBeenCalledTimes(1);
  });

  it('« Mesurer et aménager » laisse le grand public, et c’est une RÉPONSE', () => {
    const t = jusquALaQuestion();
    act(() => bouton(t, 'Mesurer et aménager').props.onPress());
    expect(useUsage.getState().modeElec).toBe(false);
    expect(useUsage.getState().choisi).toBe(true);
  });

  it('on peut aussi la passer', () => {
    const fini = jest.fn();
    const t = jusquALaQuestion(fini);
    act(() => bouton(t, 'Passer la question').props.onPress());
    expect(fini).toHaveBeenCalledTimes(1);
    expect(useUsage.getState().choisi).toBe(false);
  });
});
