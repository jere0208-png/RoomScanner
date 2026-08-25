/**
 * UN MÊME GESTE SE DESSINE PARTOUT PAREIL.
 *
 * Releve du patron : « la selection d'une ligne de spots affiche d'autres
 * boutons et d'autres icones que la selection d'un seul spot. Je veux les
 * icones de la selection d'un spot, mais avec les tailles de la selection de
 * la ligne, et fais ca pour chaque element, pour avoir une continuite
 * parfaite des elements de l'interface. »
 *
 * L'inventaire lui a donne raison, et au-dela. « RETIRER » se dessinait de
 * TROIS facons selon ce qu'on avait touche : une croix dans un cercle sous
 * une ligne de spots, une poubelle sous un spot, et une croix nue tracee a
 * la main sous un meuble. « RELIER » avait deux maillons, un rond et un
 * carre. « Pivoter » et « Centrer » etaient dessines a la main, hors du jeu.
 * Et les pastilles avaient deux tailles : trente-quatre points sous une
 * ligne, quarante sous un spot ou un meuble.
 *
 * TROIS REGLES, ET CE BANC LES TIENT.
 *
 *   1. TOUT TRACE VIENT DU JEU COMMUN (`solaires.ts`). Une silhouette
 *      dessinee a la main dans un composant derive du jeu au premier
 *      changement, et personne ne le voit avant l'ecran ;
 *
 *   2. UN GESTE, UN TRACE. « Retirer » est la meme poubelle partout —
 *      releve du patron, deja : « la poubelle partout ou il y a la
 *      poubelle » ;
 *
 *   3. UNE SEULE TAILLE. Celle de la ligne de spots, la plus serree : la
 *      pastille dessinee et la silhouette qu'elle porte.
 *
 * LES QUARANTE-QUATRE POINTS DU DOIGT NE SONT PAS EN CAUSE : ils valent pour
 * la CIBLE, jamais pour le dessin. Chaque pastille garde son debord
 * (`DEBORD_DOIGT`), et c'est lui qui rend la difference.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { light } from '../src/theme';
import { getStyles } from '../src/screens/result/styles';
import { StripBar } from '../src/components/StripBar';
import { RoomBar } from '../src/components/RoomBar';
import { CeilingBar } from '../src/components/CeilingBar';
import { ObjectBar } from '../src/components/ObjectBar';
import { SOLAIRES } from '../src/ui/solaires';
import type { WallSeg } from '../src/geometry/floorplan';

const styles = getStyles(light) as unknown as Record<string, object>;
const plat = (st: unknown) =>
  (StyleSheet.flatten(st as never) ?? {}) as Record<string, number | string>;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (n: React.ReactElement) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(n);
  });
  arbre = t;
  return t;
};

const MURS: WallSeg[] = [
  { id: 'n', type: 'wall', a: { x: 0, z: 0 }, b: { x: 5, z: 0 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 'e', type: 'wall', a: { x: 5, z: 0 }, b: { x: 5, z: 4 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 's', type: 'wall', a: { x: 5, z: 4 }, b: { x: 0, z: 4 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 'o', type: 'wall', a: { x: 0, z: 4 }, b: { x: 0, z: 0 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
];

/** Les quatre coquilles du bas, montees comme l'ecran les monte. */
const COQUILLES: [string, () => React.ReactElement][] = [
  [
    'ligne de spots',
    () => (
      <StripBar
        styles={styles}
        icone={SOLAIRES.plafond}
        strong="3 spots"
        note="Séjour · sur la longueur"
        actions={[
          { label: 'Longueur', icone: SOLAIRES.longueur, sansMot: true, onPress: () => {} },
          { label: 'Largeur', icone: SOLAIRES.largeur, sansMot: true, ghost: true, onPress: () => {} },
          { label: 'Relier', icone: SOLAIRES.lienCarre, sansMot: true, ghost: true, onPress: () => {} },
          {
            label: 'Retirer',
            icone: SOLAIRES.supprimer,
            sansMot: true,
            ghost: true,
            danger: true,
            onPress: () => {},
          },
        ]}
      />
    ),
  ],
  [
    'un spot',
    () => (
      <CeilingBar
        fixture={{ id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } }}
        walls={MURS}
        trame={0}
        styles={styles}
        palette={light}
        onMove={() => {}}
        onPrompt={() => {}}
        onLink={() => {}}
        onRemove={() => {}}
        onDone={() => {}}
      />
    ),
  ],
  [
    'un meuble',
    () => (
      <ObjectBar
        object={{
          id: 'o1',
          category: 'storage',
          width: 1.2,
          depth: 0.6,
          height: 2,
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1, 1, 1],
        }}
        styles={styles}
        palette={light}
        onPrompt={() => {}}
        onResize={() => {}}
        onHeight={() => {}}
        onRotate={() => {}}
        onCancel={() => {}}
        onNudge={() => {}}
      />
    ),
  ],
  [
    'une piece',
    () => (
      <RoomBar
        room={{ id: 'r1', name: 'Séjour' }}
        surface={{ area: 12.4, exact: true }}
        extent={{ width: 4.2, depth: 3.1 }}
        hauteur={2.5}
        styles={styles}
        onName={() => {}}
        onCotes={() => {}}
        onHeight={() => {}}
        onDupliquer={() => {}}
        onFusionner={() => {}}
        onScinder={() => {}}
        onRetirer={() => {}}
      />
    ),
  ],
];

const JEU = new Set<string>(Object.values(SOLAIRES));

/** Tous les traces dessines dans une coquille. */
const traces = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Path).map((n) => String(n.props.d));

/**
 * LES PASTILLES D'ACTION : un bouton qui ne porte QU'une silhouette.
 *
 * Deux voisines n'en sont pas, et le banc les laisse tranquilles :
 *
 *   — LE CRAYON qui precede un mot (« Corriger ») : c'est un ornement dans
 *     un bouton a texte, pas une pastille — il se cale sur la taille du
 *     mot, plus petite ;
 *
 *   — LES TOUCHES DU PAVE DIRECTIONNEL d'un meuble, carrees et plus
 *     grandes. C'est un choix assume et ecrit : « la fleche est le geste le
 *     plus fin du bandeau — un centimetre par appui : elle merite la meme
 *     cible que les autres, pas moins ». On compare donc les pastilles
 *     RONDES entre elles, ce qui est un fait de dessin et non un chiffre.
 */
const pastillesAction = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(TouchableOpacity)
    .filter((n) => n.findAllByType(Path).length > 0)
    .filter((n) => n.findAllByType(Text).length === 0)
    .map((n) => ({ n, st: plat(n.props.style) }))
    // Ronde : son rayon vaut au moins la moitie de son cote.
    .filter((x) => {
      const cote = Number(x.st.width ?? x.st.minWidth);
      const r = Number(x.st.borderRadius);
      return isFinite(cote) && isFinite(r) && r >= cote / 2;
    });

/** Les silhouettes que portent ces pastilles. */
const silhouettes = (t: TestRenderer.ReactTestRenderer) =>
  pastillesAction(t)
    .flatMap((x) => x.n.findAllByType(Svg))
    .map((n) => ({
      largeur: Number(n.props.width),
      hauteur: Number(n.props.height),
    }));

/** Le trace porte par le bouton dont l'etiquette parlee commence ainsi. */
const traceDe = (t: TestRenderer.ReactTestRenderer, debut: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => String(n.props.accessibilityLabel ?? '').startsWith(debut));
  if (!b) return null;
  const p = b.findAllByType(Path);
  return p.length ? String(p[0].props.d) : null;
};

describe('tout trace vient du jeu commun', () => {
  it.each(COQUILLES)('« %s » ne dessine rien a la main', (_nom, faire) => {
    const inconnus = traces(monter(faire())).filter((d) => !JEU.has(d));
    expect(inconnus).toEqual([]);
  });
});

describe('un geste, un trace', () => {
  it('« Retirer » est la meme poubelle partout', () => {
    const vus: string[] = [];
    for (const [, faire] of COQUILLES) {
      const d = traceDe(monter(faire()), 'Retirer');
      if (d) vus.push(d);
      act(() => arbre?.unmount());
      arbre = null;
    }
    // Trois coquilles portent ce geste : la ligne, le spot, le meuble.
    expect(vus.length).toBeGreaterThanOrEqual(3);
    expect(new Set(vus)).toEqual(new Set([SOLAIRES.supprimer]));
  });

  it('« Relier » est le meme maillon partout', () => {
    const vus: string[] = [];
    for (const [, faire] of COQUILLES) {
      const d = traceDe(monter(faire()), 'Relier');
      if (d) vus.push(d);
      act(() => arbre?.unmount());
      arbre = null;
    }
    expect(vus.length).toBeGreaterThanOrEqual(2);
    expect(new Set(vus)).toEqual(new Set([SOLAIRES.lienCarre]));
  });

  /*
    LE CONTROLE EN SENS INVERSE : un jeu reduit a une seule silhouette
    passerait les deux epreuves du dessus. Deux gestes DIFFERENTS gardent
    deux dessins.
  */
  it('mais « Retirer » et « Relier » ne se confondent pas', () => {
    expect(SOLAIRES.supprimer).not.toBe(SOLAIRES.lienCarre);
  });
});

describe('une seule taille', () => {
  it('la silhouette fait la meme taille dans les quatre coquilles', () => {
    const vues = new Set<number>();
    for (const [, faire] of COQUILLES) {
      for (const s of silhouettes(monter(faire()))) {
        vues.add(s.largeur);
        expect(s.hauteur).toBe(s.largeur);
      }
      act(() => arbre?.unmount());
      arbre = null;
    }
    // Quatre coquilles, une seule taille de silhouette.
    expect(vues.size).toBe(1);
  });

  it('la pastille aussi : celle de la ligne de spots, la plus serree', () => {
    const cotes = new Set<number>();
    for (const [, faire] of COQUILLES) {
      for (const { st } of pastillesAction(monter(faire()))) {
        cotes.add(Number(st.width ?? st.minWidth));
        cotes.add(Number(st.height ?? st.minHeight));
      }
      act(() => arbre?.unmount());
      arbre = null;
    }
    expect(cotes.size).toBe(1);
  });

  /*
    LE CONTROLE EN SENS INVERSE : un banc qui ne trouverait AUCUNE pastille
    verrait un ensemble vide et crierait victoire.
  */
  it('et il y en a bien, sinon le banc comparerait le vide', () => {
    const compte: [string, boolean][] = [];
    for (const [nom, faire] of COQUILLES) {
      compte.push([nom, pastillesAction(monter(faire())).length > 0]);
      act(() => arbre?.unmount());
      arbre = null;
    }
    /*
      LES QUATRE EN ONT — la piece a rejoint les autres.

      Elle etait la seule sans : ses boutons disaient des mots, « Nommer »,
      « Cotes », « H 2,50 », et un « … » qui cachait quatre gestes de plus.
      Ce banc l'ecrivait noir sur blanc, faute de pouvoir le corriger ce
      jour-la. Le releve du patron sur le jumeau de ce menu — celui d'une
      menuiserie, « mal place, peu comprehensible sans lire le texte » — a
      fini par emporter les deux.
    */
    expect(compte).toEqual([
      ['ligne de spots', true],
      ['un spot', true],
      ['un meuble', true],
      ['une piece', true],
    ]);
  });
});
