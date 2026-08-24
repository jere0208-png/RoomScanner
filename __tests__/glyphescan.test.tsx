/**
 * L'ICÔNE ANIMÉE DU SCAN.
 *
 * Relevé du patron, une adresse et une phrase : l'animation « Scan » de
 * LottieFiles, « refais la même ». On l'a lue image par image plutôt que
 * copiée — l'app n'embarque pas de lecteur Lottie — et ce banc garde ce qui
 * fait qu'une reprise reste la même chose :
 *
 *   — LE GESTE. La ligne se rétracte AVANT de partir, balaye haut puis bas,
 *     revient au centre, et ne se redéploie qu'immobile. C'est là tout le
 *     caractère du modèle : elle a l'air de prendre son élan. Une ligne qui
 *     balaye à pleine longueur passerait n'importe quel autre banc.
 *   — LE CADRE. Quatre équerres, jamais un rectangle : quatre sous-chemins
 *     ouverts, et rien qui se referme.
 *   — LA PROPORTION. Rien n'est mesuré en pixels d'un carré de 480 : la
 *     même icône se pose à 28 points dans une barre et à 120 sur l'accueil.
 *     On compare donc deux tailles, sans jamais nommer un chiffre.
 *   — LE MOUVEMENT EST NATIF. Le déplacement de la ligne est une valeur
 *     ANIMÉE sur le style brut. Un nombre voudrait dire une icône figée, et
 *     l'écran de lecture d'un plan est justement celui où le fil JS peine.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Path } from 'react-native-svg';
import { ScanGlyph } from '../src/components/ScanGlyph';
import {
  cheminDuCadre,
  DUREE_SCAN,
  MESURES,
  poseDeLaLigne,
} from '../src/ui/glypheScan';
import { light } from '../src/theme';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (props: React.ComponentProps<typeof ScanGlyph> = {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ScanGlyph taille={96} {...props} />);
  });
  arbre = t;
  return t;
};

/** La ligne : la seule vue dont le style brut porte une transformation. */
const ligne = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll((n) => Array.isArray(n.props.style))
    .map((n) => (n.props.style as unknown[]).find((s) => !!(s as { transform?: unknown })?.transform))
    .find(Boolean) as { transform: Record<string, unknown>[] } | undefined;

/** Une valeur animée se reconnaît à ce qu'elle sait rendre sa valeur. */
const estAnimee = (v: unknown) =>
  typeof (v as { __getValue?: unknown })?.__getValue === 'function';

describe('le geste du balayage', () => {
  it('part et revient à la même pose : le tour reboucle sans à-coup', () => {
    const debut = poseDeLaLigne(0);
    const fin = poseDeLaLigne(DUREE_SCAN);
    expect(fin.longueur).toBeCloseTo(debut.longueur, 6);
    expect(fin.dy).toBeCloseTo(debut.dy, 6);
    // Et au repos la ligne est déployée, posée au milieu du cadre.
    expect(debut.dy).toBe(0);
    expect(debut.longueur).toBeCloseTo(MESURES.deployee, 6);
  });

  it('se rétracte AVANT de bouger, et ne se rouvre qu’une fois revenue', () => {
    // Tout instant où la ligne n'est pas au centre doit la trouver courte.
    let bougeEtLongue = 0;
    let vueRepliee = false;
    for (let ms = 0; ms < DUREE_SCAN; ms += 4) {
      const p = poseDeLaLigne(ms);
      if (Math.abs(p.dy) > 1e-6) {
        if (p.longueur > MESURES.repliee + 1e-6) bougeEtLongue++;
        vueRepliee = vueRepliee || p.longueur <= MESURES.repliee + 1e-6;
      }
    }
    expect(vueRepliee).toBe(true);
    expect(bougeEtLongue).toBe(0);
  });

  it('balaye des deux côtés, à la même distance du centre', () => {
    let haut = 0;
    let bas = 0;
    for (let ms = 0; ms < DUREE_SCAN; ms += 4) {
      const { dy } = poseDeLaLigne(ms);
      haut = Math.min(haut, dy);
      bas = Math.max(bas, dy);
    }
    expect(-haut).toBeCloseTo(bas, 3);
    expect(bas).toBeCloseTo(MESURES.course, 3);
    // Le balayage reste DANS le cadre : une ligne qui déborde de ses
    // équerres ne serait plus un scan, mais un curseur.
    expect(bas + MESURES.trait / 2).toBeLessThan(MESURES.cote / 2);
  });

  it('monte d’abord, descend ensuite : l’ordre fait le geste', () => {
    const premierEcart = Array.from({ length: 500 }, (_, i) => poseDeLaLigne(i * 4)).find(
      (p) => Math.abs(p.dy) > 1e-6,
    );
    expect(premierEcart!.dy).toBeLessThan(0);
  });
});

/**
 * Les LONGUEURS d'un chemin : coordonnées et rayons, sans les drapeaux.
 *
 * Un arc SVG porte trois nombres qui ne sont pas des mesures — la rotation
 * et les deux drapeaux de sens. Les laisser dans le lot ferait échouer la
 * comparaison d'échelle sur un drapeau à 1, qui ne double évidemment pas.
 */
const mesuresDuChemin = (d: string) => {
  const jetons = d.split(/[\s,]+/).filter(Boolean);
  const toutes: number[] = [];
  const coords: number[] = [];
  for (let i = 0; i < jetons.length; i++) {
    if (jetons[i] !== 'A') {
      if (!/^[A-Za-z]$/.test(jetons[i])) {
        toutes.push(Number(jetons[i]));
        coords.push(Number(jetons[i]));
      }
      continue;
    }
    toutes.push(Number(jetons[i + 1]), Number(jetons[i + 2]));
    toutes.push(Number(jetons[i + 6]), Number(jetons[i + 7]));
    coords.push(Number(jetons[i + 6]), Number(jetons[i + 7]));
    i += 7;
  }
  return { toutes, coords };
};

describe('le cadre à quatre coins', () => {
  it('est fait de quatre équerres ouvertes, pas d’un rectangle', () => {
    const d = cheminDuCadre(96);
    expect(d.match(/M/g)).toHaveLength(4);
    expect(d).not.toMatch(/[Zz]/);
    // Chaque coin s'arrondit : un arc par équerre.
    expect(d.match(/A/g)).toHaveLength(4);
  });

  it('tient dans son carré, et laisse la marge du modèle', () => {
    const taille = 96;
    const { coords } = mesuresDuChemin(cheminDuCadre(taille));
    const marge = (taille - MESURES.cote * taille) / 2;
    expect(Math.min(...coords)).toBeCloseTo(marge, 3);
    expect(Math.max(...coords)).toBeCloseTo(taille - marge, 3);
  });

  it('se redessine à l’échelle : deux fois plus grand, tout est doublé', () => {
    const petit = mesuresDuChemin(cheminDuCadre(48)).toutes;
    const grand = mesuresDuChemin(cheminDuCadre(96)).toutes;
    expect(grand).toHaveLength(petit.length);
    petit.forEach((v, i) => expect(grand[i]).toBeCloseTo(v * 2, 3));
  });
});

describe('l’icône montée', () => {
  it('trace les équerres à l’encre du thème, bouts arrondis', () => {
    const p = monter().root.findAllByType(Path)[0];
    expect(p.props.stroke).toBe(light.ink);
    expect(p.props.fill).toBe('none');
    expect(p.props.strokeLinecap).toBe('round');
    expect(Number(p.props.strokeWidth)).toBeGreaterThan(0);
  });

  it('épaissit son trait avec sa taille, au lieu d’un trait en dur', () => {
    const trait = (taille: number) => {
      const t = monter({ taille });
      const v = Number(t.root.findAllByType(Path)[0].props.strokeWidth);
      act(() => t.unmount());
      arbre = null;
      return v;
    };
    expect(trait(96)).toBeCloseTo(trait(48) * 2, 3);
  });

  it('fait vivre la ligne par une valeur animée, pas par un nombre', () => {
    const l = ligne(monter());
    expect(l).toBeDefined();
    const [glisse, etire] = l!.transform;
    expect(estAnimee(glisse.translateY)).toBe(true);
    expect(estAnimee(etire.scaleX)).toBe(true);
  });

  it('se fige sur sa pose de repos quand on lui coupe l’animation', () => {
    const l = ligne(monter({ anime: false }));
    const [glisse, etire] = l!.transform;
    expect(glisse.translateY).toBe(0);
    expect(etire.scaleX).toBeCloseTo(MESURES.deployee, 6);
  });

  it('prend la teinte qu’on lui donne pour la ligne', () => {
    const t = monter({ teinte: '#123456' });
    const vue = t.root
      .findAll((n) => Array.isArray(n.props.style))
      .map((n) =>
        (n.props.style as unknown[]).find(
          (s) =>
          !!(s as { backgroundColor?: string; borderRadius?: number })
            ?.backgroundColor &&
          !!(s as { borderRadius?: number })?.borderRadius,
        ),
      )
      .find(Boolean) as { backgroundColor: string };
    expect(vue.backgroundColor).toBe('#123456');
  });
});
