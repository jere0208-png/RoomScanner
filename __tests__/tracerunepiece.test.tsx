/**
 * LA FEUILLE DEVIENT UNE FEUILLE — on trace sa pièce du doigt sur l'accueil.
 *
 * Relevé du patron : « il y a trop d'espace inutilisé », puis, sur la
 * proposition : « essaye le tracé, mais affiche "Pas de scan ? Tracez avec
 * votre doigt." en titre bien placé. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE GESTE-LÀ, ET PAS UN CONTENU.
 *
 * Le vide de l'accueil appelait quelque chose, et la réponse facile était d'y
 * mettre les derniers plans. Relevé du patron : « il faut penser aux nouveaux
 * qui n'ont pas de plan ». Une idée qui ne marche qu'au bout de trois relevés
 * n'est pas une idée.
 *
 * Ce geste-ci est le MÊME au premier lancement et au centième : rien à avoir,
 * rien à accumuler. Et ce n'est pas un objet de plus posé sur l'écran — on
 * vient d'en retirer un, la maquette d'iPhone. C'est le papier quadrillé qui
 * retrouve sa fonction : une feuille à carreaux sert à tracer.
 *
 * CE QUE ÇA RACCOURCIT. « Dessiner un plan » ouvre un plan VIDE : il faut
 * ensuite ajouter une pièce, choisir sa taille, la poser. Deux écrans avant le
 * premier trait. Ici, le premier trait EST le geste d'entrée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCHELLE EST CELLE DU PAPIER : un carreau vaut vingt-cinq centimètres.
 *
 * C'est le seul choix qui rende le quadrillage HONNÊTE : il était décoratif,
 * il devient une règle graduée. Et il borne le geste — sur un téléphone, on
 * trace une chambre, pas un séjour de six mètres. C'est assumé : ce tracé sert
 * à DÉMARRER, pas à coter. La cote exacte se tape une seconde plus tard, dans
 * l'éditeur, là où c'est le métier de le faire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import {
  METRES_PAR_CARREAU,
  TraceUnePiece,
} from '../src/components/TraceUnePiece';
import { PAS_QUADRILLAGE } from '../src/components/Quadrillage';
import { light } from '../src/theme';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (onTracee: (l: number, p: number) => void = () => {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <TraceUnePiece
        width={342}
        height={300}
        palette={light}
        onTracee={onTracee}
      />,
    );
  });
  arbre = t;
  return t;
};

/**
 * TOUT CE QUI S'ÉCRIT, texte natif ET texte SVG.
 *
 * Les cotes du tracé sont dessinées DANS le dessin — c'est ce qui leur permet
 * de suivre le rectangle au point près. Un relevé qui ne lit que les `Text`
 * de React Native ne les voit pas, et conclut qu'aucune cote n'est écrite.
 */
const mots = (t: TestRenderer.ReactTestRenderer) =>
  [...t.root.findAllByType(Text), ...t.root.findAllByType(SvgText)]
    .map((n) => String(n.props.children))
    .filter((m) => m && m !== 'undefined')
    .join(' | ');

const gestes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll(
    (n) => typeof n.props?.onStartShouldSetResponder === 'function',
  )[0];

/**
 * UN GLISSEMENT, tel que le `PanResponder` le voit.
 *
 * Il IGNORE l'état qu'on lui passe et le recalcule depuis `touchHistory` — le
 * piège que la maison connaît par cœur. On lui donne donc un doigt crédible :
 * posé quelque part, traîné ailleurs, relâché.
 */
const glisser = (
  t: TestRenderer.ReactTestRenderer,
  de: { x: number; y: number },
  vers: { x: number; y: number },
) => {
  const v = gestes(t);
  const h0 = 1000;
  const doigt = (p: { x: number; y: number }, actif: boolean, tps: number) => ({
    touchActive: actif,
    startPageX: de.x,
    startPageY: de.y,
    startTimeStamp: h0,
    currentPageX: p.x,
    currentPageY: p.y,
    currentTimeStamp: tps,
    previousPageX: de.x,
    previousPageY: de.y,
    previousTimeStamp: h0,
  });
  const ev = (p: { x: number; y: number }, actif: boolean, tps: number) => ({
    nativeEvent: {
      touches: actif ? [{ identifier: 0, pageX: p.x, pageY: p.y }] : [],
      changedTouches: [{ identifier: 0, pageX: p.x, pageY: p.y }],
      identifier: 0,
      pageX: p.x,
      pageY: p.y,
      locationX: p.x,
      locationY: p.y,
      timestamp: tps,
    },
    touchHistory: {
      touchBank: [doigt(p, actif, tps)],
      numberActiveTouches: actif ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: tps,
    },
  });
  act(() => {
    v.props.onStartShouldSetResponder?.(ev(de, true, h0));
    v.props.onResponderGrant?.(ev(de, true, h0));
  });
  act(() => {
    v.props.onResponderMove?.(ev(vers, true, h0 + 120));
  });
  act(() => {
    v.props.onResponderRelease?.(ev(vers, false, h0 + 130));
  });
};

/** Le bouton qui ouvre la pièce tracée, s'il est là. */
const ouvrir = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      String(n.props?.accessibilityLabel ?? '').startsWith('Ouvrir'),
  )[0];

describe('au repos, l’invitation', () => {
  it('porte le titre demandé, mot pour mot', () => {
    /*
      RELEVÉ DU PATRON, littéralement : « affiche "Pas de scan ? Tracez avec
      votre doigt." en titre bien placé ». Il est AU-DESSUS de la zone, et pas
      dedans : un titre posé à l'intérieur d'un cadre en pointillé se lit
      comme une étiquette de champ vide, pas comme une invitation.
    */
    expect(mots(monter())).toContain('Pas de scan ? Tracez avec votre doigt.');
  });

  it('et dit son échelle', () => {
    /*
      Sans elle, le quadrillage reste décoratif et le rectangle qu'on trace ne
      veut rien dire. Avec elle, c'est une règle graduée — et c'est ce qui
      rend le geste sérieux.
    */
    expect(mots(monter())).toMatch(/carreau/i);
    expect(METRES_PAR_CARREAU).toBeGreaterThan(0);
  });

  it('mais rien à ouvrir tant qu’on n’a rien tracé', () => {
    expect(ouvrir(monter())).toBeUndefined();
  });
});

describe('le tracé', () => {
  it('un glissement dessine une pièce et écrit ses deux cotes', () => {
    const t = monter();
    // Quatre carreaux sur trois : un mètre sur soixante-quinze centimètres.
    glisser(
      t,
      { x: 40, y: 40 },
      { x: 40 + PAS_QUADRILLAGE * 4, y: 40 + PAS_QUADRILLAGE * 3 },
    );
    const lus = mots(t);
    expect(lus).toContain('1,00 m');
    expect(lus).toContain('0,75 m');
  });

  it('et il propose de l’ouvrir', () => {
    const t = monter();
    glisser(
      t,
      { x: 40, y: 40 },
      { x: 40 + PAS_QUADRILLAGE * 8, y: 40 + PAS_QUADRILLAGE * 6 },
    );
    expect(ouvrir(t)).toBeDefined();
  });

  it('les cotes se collent au carreau', () => {
    /*
      ON EST SUR DU PAPIER MILLIMÉTRÉ : un rectangle qui s'arrête entre deux
      traits n'a pas de sens, et « 1,03 m » sur un geste au doigt est une
      fausse précision. On rend donc des quarts de mètre — et l'éditeur laisse
      taper la vraie cote juste après.
    */
    const vues: number[] = [];
    const t = monter((l, p) => vues.push(l, p));
    glisser(
      t,
      { x: 40, y: 40 },
      { x: 40 + PAS_QUADRILLAGE * 6 + 9, y: 40 + PAS_QUADRILLAGE * 4 + 7 },
    );
    act(() => ouvrir(t).props.onPress());
    expect(vues).toEqual([1.5, 1]);
  });

  it('un simple appui ne trace rien', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il compte : l'accueil est un écran qu'on
      touche pour autre chose. Un doigt posé n'est pas une pièce, et se
      retrouver dans l'éditeur pour avoir effleuré le fond serait le pire
      défaut que ce geste puisse avoir.
    */
    const t = monter();
    glisser(t, { x: 100, y: 100 }, { x: 103, y: 102 });
    expect(ouvrir(t)).toBeUndefined();
    expect(mots(t)).toContain('Pas de scan ? Tracez avec votre doigt.');
  });

  it('et une pièce trop petite non plus', () => {
    // Sous un demi-mètre, le magasin refuse déjà de poser un rectangle : on
    // ne propose pas un geste dont on sait qu'il ne fera rien.
    const t = monter();
    glisser(t, { x: 40, y: 40 }, { x: 40 + PAS_QUADRILLAGE, y: 40 + PAS_QUADRILLAGE });
    expect(ouvrir(t)).toBeUndefined();
  });

  it('on peut retracer par-dessus', () => {
    // Un tracé raté ne bloque pas : le geste suivant remplace le précédent.
    const t = monter();
    glisser(t, { x: 40, y: 40 }, { x: 40 + PAS_QUADRILLAGE * 8, y: 40 + PAS_QUADRILLAGE * 4 });
    expect(mots(t)).toContain('2,00 m');
    glisser(t, { x: 40, y: 40 }, { x: 40 + PAS_QUADRILLAGE * 4, y: 40 + PAS_QUADRILLAGE * 8 });
    expect(mots(t)).not.toContain('2,00 m | ');
    expect(mots(t)).toContain('1,00 m');
  });

  it('le tracé reste DANS la feuille', () => {
    /*
      Un doigt qui sort du cadre continuerait de faire grandir la pièce hors
      de la zone, et l'on dessinerait sous les boutons. La feuille a des
      bords, même fondus.

      ON BORNE LE POINT COURANT, PAS LE RECTANGLE : borner le rectangle après
      coup ferait sauter le coin qu'on tient sous le doigt.
    */
    const vues: number[] = [];
    const t = monter((l, p) => vues.push(l, p));
    glisser(t, { x: 40, y: 40 }, { x: 4000, y: 4000 });
    act(() => ouvrir(t).props.onPress());
    const [largeur, profondeur] = vues;
    // La feuille fait 342 points de large : treize carreaux, soit 3,25 m.
    expect(largeur).toBeLessThanOrEqual((342 / PAS_QUADRILLAGE) * METRES_PAR_CARREAU);
    expect(profondeur).toBeLessThanOrEqual((300 / PAS_QUADRILLAGE) * METRES_PAR_CARREAU);
    expect(largeur).toBeGreaterThan(1);
  });
});
