/**
 * LE PREMIER LANCEMENT — trois cartes, et rien qu'une fois.
 *
 * Relevé du patron : « on doit penser utilisateur simple, sans
 * professionnalisme forcément. On doit rendre la chose ludique. »
 *
 * L'application s'ouvrait sur un bouton « Commencer le scan », et rien
 * d'autre. Un électricien sait ce qu'il va y trouver ; quelqu'un qui vient
 * refaire son appartement voit un bouton qui lance sa caméra, et il ne sait ni
 * ce qu'il doit balayer, ni ce qu'il obtiendra. C'est le moment où l'on décide
 * si l'on continue, et c'était le seul écran muet.
 *
 * CE QUE CE BANC TIENT DE PARTICULIER : que les images viennent de la VITRINE.
 * Une capture d'écran refaite à la main vieillirait au premier changement de
 * dessin, et personne ne s'en apercevrait — l'accueil montrerait une
 * application qui n'existe plus. Ici, ce sont les mêmes images que celles qui
 * tournent derrière l'accueil, produites par la même géométrie.
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
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PremierLancement } from '../src/components/PremierLancement';
import { PlanAnime } from '../src/components/PlanAnime';
import { Quadrillage } from '../src/components/Quadrillage';
import { light } from '../src/theme';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (onFini = () => {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<PremierLancement onFini={onFini} />);
  });
  arbre = t;
  return t;
};

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      String(n.props?.accessibilityLabel ?? '').startsWith(nom),
  )[0];

/**
 * LA HAUTEUR DES PANS DE MUR, à l'écran.
 *
 * ON NE COMPTE PAS LES PANS, ON LES MESURE — et c'est une correction que le
 * banc s'est faite à lui-même. Compter passait à VIDE : les quadrilatères sont
 * dessinés dès la première image, simplement plats. Une épreuve qui les compte
 * dit « il y en a trois » aussi bien avant qu'après la levée, et ne prouve
 * donc rien du tout.
 */
const hauteurDesPans = (t: TestRenderer.ReactTestRenderer) => {
  const pans = t.root
    .findAll((n) => n.props?.testID === 'pan-de-mur')
    .map((n) => n.props.points)
    .filter((v): v is string => typeof v === 'string');
  /*
    ON MESURE L'ARÊTE VERTICALE, PAS L'EMPRISE DU QUADRILATÈRE.

    Seconde correction que ce banc s'est faite : en axonométrie, un mur COURT
    à l'écran — sa base seule occupe déjà soixante-dix points de haut. Prendre
    l'emprise du quadrilatère mesurait donc la longueur du mur, pas sa hauteur,
    et l'épreuve trouvait un mur "levé" avant qu'il ne commence à monter.

    Les quatre points sont écrits dans l'ordre `base-début, base-fin, haut-fin,
    haut-début` : la hauteur, c'est l'écart entre le premier et le dernier.
  */
  let haut = 0;
  for (const p of pans) {
    const pts = p.split(' ').map((c) => Number(c.split(',')[1]));
    if (pts.length === 4 && Number.isFinite(pts[0]) && Number.isFinite(pts[3])) {
      haut = Math.max(haut, Math.abs(pts[0] - pts[3]));
    }
  }
  return haut;
};

describe('les trois cartes', () => {
  it('la première dit ce qu’on fait, pas ce que l’app est', () => {
    /*
      « Balayez la pièce » est une consigne ; « Scanner 3D LiDAR » est une
      fiche technique. Celui qui hésite à installer une application ne veut
      pas savoir ce qu'elle EST, il veut savoir ce qu'il va FAIRE.
    */
    expect(mots(monter())).toContain('Balayez la pièce');
  });

  it('et l’on avance jusqu’au bout', () => {
    const t = monter();
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(mots(t)).toContain('Placez vos prises');
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(mots(t)).toContain('Emportez le dossier');
  });

  it('la dernière ne dit plus « Suivant » : elle lance', () => {
    // Un « Suivant » sur la dernière carte laisse croire qu'il en reste une,
    // et l'on appuie en s'attendant à autre chose que l'accueil.
    const t = monter();
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(bouton(t, 'Suivant')).toBeUndefined();
    expect(mots(t)).toContain('C’est parti');
  });

  it('et c’est elle qui referme', () => {
    const fini = jest.fn();
    const t = monter(fini);
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Commencer').props.onPress());
    expect(fini).toHaveBeenCalled();
  });

  it('on peut passer à tout moment', () => {
    /*
      TROIS CARTES, C'EST COURT — et c'est justement pour ça qu'on peut les
      sauter sans rien perdre. Retenir quelqu'un devant une présentation est
      le meilleur moyen qu'il n'en lise aucune.
    */
    const fini = jest.fn();
    const t = monter(fini);
    act(() => bouton(t, 'Passer').props.onPress());
    expect(fini).toHaveBeenCalled();
  });

  it('trois points, et le vif suit la carte', () => {
    const t = monter();
    /*
      ON DÉDOUBLONNE PAR TESTID. `findAll` rend le nœud composite ET son
      nœud d'hôte : chaque point compte double, et l'index du vif se
      retrouve à deux au lieu de un. Le piège est connu de la maison.
    */
    const vif = () => {
      const vus = new Map<string, boolean>();
      for (const n of t.root.findAll((x) =>
        String(x.props?.testID ?? '').startsWith('point-'),
      )) {
        const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
          string,
          unknown
        >;
        const cle = String(n.props.testID);
        vus.set(cle, (vus.get(cle) ?? false) || st.backgroundColor === light.blue);
      }
      return [...vus.entries()].findIndex(([, allume]) => allume);
    };
    expect(vif()).toBe(0);
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(vif()).toBe(1);
  });
});

describe('le plan se fait sous les yeux', () => {
  /*
    RELEVÉ DU PATRON : « refais les étapes animées pour la première
    utilisation, sans texte juste : un plan 2D sur la première page, plan
    équipé sur la page 2 et plan 3D sur la page 3. »

    PREMIER DESSIN — TROIS PHOTOS. Les cartes montraient trois images cuites
    de la vitrine de l'accueil. C'était juste, gratuit, et FIGÉ : trois
    captures d'écran dans une présentation, c'est-à-dire ce que fait tout le
    monde.

    SECOND — LE PLAN SE FAIT. Les murs se tracent, les appareils se posent, le
    logement se lève. On ne montre plus le résultat, on montre le GESTE — la
    seule chose qu'une présentation puisse apprendre.
  */
  it('trois étapes, et jamais deux fois la même', () => {
    const t = monter();
    const etape = () => t.root.findByType(PlanAnime).props.etape;
    expect(etape()).toBe('plan');
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(etape()).toBe('equipe');
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(etape()).toBe('volume');
  });

  it('et l’animation se REJOUE quand on revient sur une étape', () => {
    /*
      LE DÉTAIL QUI DÉCIDE DE TOUT : sans redémarrage, la deuxième visite
      d'une étape s'afficherait déjà finie — on aurait payé trois animations
      pour n'en voir qu'une.

      ON LE MESURE SUR LA LEVÉE, parce que c'est la seule des trois qui soit
      LISIBLE depuis un banc : elle vit dans l'état du composant, tandis que
      les deux autres partent sur le fil natif, que l'arbre d'essai n'a pas.
    */
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <PlanAnime etape="volume" width={280} height={220} palette={light} />,
      );
    });
    arbre = t;
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(hauteurDesPans(t)).toBeGreaterThan(30);
    // On repasse par une autre étape, puis l'on revient : tout repart de zéro.
    act(() => {
      t.update(
        <PlanAnime etape="plan" width={280} height={220} palette={light} />,
      );
    });
    act(() => {
      t.update(
        <PlanAnime etape="volume" width={280} height={220} palette={light} />,
      );
    });
    expect(hauteurDesPans(t)).toBeLessThan(4);
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(hauteurDesPans(t)).toBeGreaterThan(30);
  });

  it('le plan à plat porte ses murs, l’équipé porte en plus ses sigles', () => {
    /*
      C'est le MÊME logement aux trois pages, et c'est tout l'intérêt : trois
      illustrations sans rapport diraient « voici trois fonctions ». Le même
      plan qui se trace puis s'équipe dit « voici ce qui arrive à VOTRE
      logement ».
    */
    const t = monter();
    const compte = (id: string) =>
      t.root.findAll((n) => n.props?.testID === id).length;
    expect(compte('mur-du-plan')).toBeGreaterThan(0);
    expect(compte('sigle-appareil')).toBe(0);
    act(() => bouton(t, 'Suivant').props.onPress());
    expect(compte('mur-du-plan')).toBeGreaterThan(0);
    expect(compte('sigle-appareil')).toBeGreaterThan(0);
  });

  it('et le volume LÈVE des pans, une fois l’horloge passée', () => {
    /*
      Des murs qui montent, c'est une géométrie qui change à chaque image :
      aucun `transform` ne la produit. La levée est donc pilotée depuis
      JavaScript — et au premier rendu, les pans font zéro de haut. Le banc
      avance les horloges, comme l'utilisateur attend neuf dixièmes de
      seconde.
    */
    const t = monter();
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Suivant').props.onPress());
    // À plat au premier instant : les murs n'ont pas encore commencé à monter.
    expect(hauteurDesPans(t)).toBeLessThan(4);
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(hauteurDesPans(t)).toBeGreaterThan(30);
  });

  it('et la troisième carte NOMME les exports', () => {
    /*
      Relevé du patron : « avec explication de possibilité d'exporter ».

      « Exportez votre projet » ne dit rien — tout le monde exporte. Trois
      extensions, elles, disent à QUI l'on parle : le PDF au client, le DXF à
      l'architecte, le CSV au comptoir. C'est ce qui fait comprendre en une
      ligne que le travail SORT de l'application.
    */
    const t = monter();
    act(() => bouton(t, 'Suivant').props.onPress());
    act(() => bouton(t, 'Suivant').props.onPress());
    const lus = mots(t);
    for (const f of ['PDF', 'DXF', 'CSV']) expect(lus).toContain(f);
  });

  it('le dessin est posé sur le PAPIER, comme l’accueil', () => {
    // La présentation et l'application ouvrent sur la même feuille : c'est ce
    // qui fait de la première une promesse tenue plutôt qu'une affiche.
    expect(monter().root.findAllByType(Quadrillage).length).toBeGreaterThan(0);
  });
});
