/**
 * LES BANDEAUX DU BAS : LE TEXTE AU-DESSUS, LES BOUTONS EN DESSOUS.
 *
 * Relevé du patron, capture à l'appui — le bandeau d'une ligne de spots :
 * « 3 spots · Pièce 1 · … » et quatre pastilles rondes rognées par le bord.
 * « Toujours les boutons sont coupés et le texte aussi. Fais en 2 parties,
 * avec le texte au-dessus et les boutons en dessous. Pareil pour la
 * sélection d'un mur. »
 *
 * Le défaut venait de la forme même : une SEULE ligne devait porter la cote,
 * la précision et jusqu'à quatre boutons, sur trois cent trente points
 * d'écran utile. Tout y était en `flexShrink` — chacun cédait un peu, donc
 * tout était coupé un peu. Un bandeau qui tronque la cote qu'il est venu
 * montrer ne sert plus à rien.
 *
 * La forme est maintenant DEUX PARTIES :
 *
 *   — ce qu'on a touché, en haut, sur deux lignes : la valeur en gras, ce
 *     que c'est en gris. Rien n'y cède, rien n'y est tronqué ;
 *   — ce qu'on peut en faire, en dessous : des boutons à leur taille, qui
 *     passent à la ligne plutôt que de rétrécir.
 *
 * Ce banc tient la règle pour TOUS les bandeaux du bas — mur, menuiserie,
 * note, ligne de spots, pièce, meuble, appareil de plafond — parce que le
 * relevé dit « refais tout le design de cette partie », et qu'un seul
 * bandeau resté à l'ancienne serait le prochain à couper un mot.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

const plat = (st: unknown) => (StyleSheet.flatten(st as never) ?? {}) as Record<string, number | string>;

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

/** Les boutons du bandeau : ce qui se touche et porte un nom. */
const boutons = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(TouchableOpacity)
    .filter((n) => typeof n.props.onPress === 'function');

/** La rangée d'actions : le conteneur qui les porte tous. */
const rangee = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(View)
    .map((n) => ({ n, st: plat(n.props.style) }))
    .find((x) => x.st.flexWrap === 'wrap' && x.st.flexDirection === 'row');

const MURS: WallSeg[] = [
  { id: 'n', type: 'wall', a: { x: 0, z: 0 }, b: { x: 5, z: 0 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 'e', type: 'wall', a: { x: 5, z: 0 }, b: { x: 5, z: 4 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 's', type: 'wall', a: { x: 5, z: 4 }, b: { x: 0, z: 4 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 'o', type: 'wall', a: { x: 0, z: 4 }, b: { x: 0, z: 0 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
];

/** Les quatre bandeaux, montés comme l'écran les monte. */
const CAS: [string, () => React.ReactElement][] = [
  [
    'ligne de spots',
    () => (
      <StripBar
        styles={styles}
        strong="3 spots"
        note="Pièce 1 · sur la longueur"
        actions={[
          { label: 'Longueur', icone: SOLAIRES.longueur, sansMot: true, onPress: () => {} },
          { label: 'Largeur', icone: SOLAIRES.largeur, sansMot: true, ghost: true, onPress: () => {} },
          { label: 'Relier', icone: SOLAIRES.lien, sansMot: true, ghost: true, onPress: () => {} },
          { label: 'Retirer', icone: SOLAIRES.retirer, sansMot: true, ghost: true, onPress: () => {} },
        ]}
      />
    ),
  ],
  [
    'mur choisi',
    () => (
      <StripBar
        styles={styles}
        strong="3,98 × 2,49 m"
        note="mur · 2,49 m sous plafond"
        actions={[
          { label: 'Mesures', crayon: true, onPress: () => {} },
          { label: 'Hauteur', onPress: () => {} },
          { label: 'Retirer', ghost: true, onPress: () => {} },
        ]}
      />
    ),
  ],
  [
    'pièce choisie',
    () => (
      <RoomBar
        room={{ id: 'r1', name: 'Salle de bain des parents' }}
        surface={{ area: 12.4, exact: true }}
        extent={{ width: 4.2, depth: 3.1 }}
        hauteur={2.5}
        styles={styles}
        onName={() => {}}
        onCotes={() => {}}
        onHeight={() => {}}
        onMore={() => {}}
      />
    ),
  ],
  [
    'appareil de plafond',
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
    'meuble choisi',
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
];

describe('la forme des bandeaux du bas', () => {
  for (const [nom, rendre] of CAS) {
    describe(nom, () => {
      it('range ses boutons dans une rangée qui passe à la ligne', () => {
        const r = rangee(monter(rendre()));
        expect(r).toBeDefined();
      });

      it('donne à chaque bouton la taille d’un doigt', () => {
        const t = monter(rendre());
        for (const b of boutons(t)) {
          const st = plat(b.props.style);
          const hs = (b.props.hitSlop ?? {}) as Record<string, number>;
          const haut =
            Number(st.minHeight ?? st.height ?? 0) + (hs.top ?? 0) + (hs.bottom ?? 0);
          expect({ bouton: String(b.props.accessibilityLabel), haut }).toEqual({
            bouton: String(b.props.accessibilityLabel),
            haut: expect.any(Number),
          });
          expect(haut).toBeGreaterThanOrEqual(44);
        }
      });

      it('et ne les laisse pas rétrécir', () => {
        const t = monter(rendre());
        for (const b of boutons(t)) {
          const st = plat(b.props.style);
          expect(st.flexShrink ?? 0).not.toBe(1);
        }
      });
    });
  }

  /*
    ET LE TEXTE NE SE TRONQUE PLUS.

    La valeur qu'on vient lire tient sa ligne, et la précision la sienne : ce
    sont deux textes distincts, pas une phrase rognée d'un bout.
  */
  it('écrit la valeur et sa précision sur deux lignes distinctes', () => {
    const t = monter(CAS[1][1]());
    const mots = t.root
      .findAllByType(Text)
      .map((n) => String(n.props.children))
      .filter((x) => x && x !== 'undefined');
    expect(mots).toContain('3,98 × 2,49 m');
    expect(mots.some((m) => m.includes('mur · 2,49 m sous plafond'))).toBe(true);
    // La précision a droit à deux lignes : « retour · 2,49 m sous plafond »
    // ne se coupe plus au milieu d'un mot.
    const sous = t.root
      .findAllByType(Text)
      .find((n) => String(n.props.children).includes('sous plafond'))!;
    expect(sous.props.numberOfLines ?? 2).toBeGreaterThanOrEqual(2);
  });
});

/**
 * ET AUCUN BOUTON N'EST PLUS LARGE QUE SA CARTE.
 *
 * La rangée qui se replie règle le NOMBRE de boutons ; elle ne règle pas un
 * bouton qui, à lui seul, dépasse la largeur disponible — celui-là serait
 * rogné comme avant. Sur le plus étroit des iPhone en service (375 points),
 * la carte laisse un peu moins de deux cent soixante points : c'est la
 * mesure que chaque libellé doit respecter.
 */
describe('la largeur des boutons, sur un écran étroit', () => {
  const ECRAN = 375;
  const s = getStyles(light) as unknown as Record<string, Record<string, number>>;
  // La carte part du bord gauche et s'arrête avant la colonne d'actions :
  // sa largeur maxi est posée à l'affichage, où l'écran est connu.
  const dispo =
    ECRAN -
    (s.bandeau.left as number) -
    72 -
    2 * (s.bandeau.paddingHorizontal as number);

  it('laisse une vraie largeur au contenu', () => {
    expect(dispo).toBeGreaterThan(160);
  });

  it('garde chaque bouton plus étroit que sa carte', () => {
    for (const [nom, rendre] of CAS) {
      const t = monter(rendre());
      for (const b of boutons(t)) {
        const st = plat(b.props.style);
        const mots = b
          .findAllByType(Text)
          .map((n) => String(n.props.children))
          .join('');
        // Le mot, ses marges, et l'icône quand il y en a une.
        const large =
          mots.length * 13.5 * 0.62 +
          2 * Number(st.paddingHorizontal ?? 0) +
          (mots ? 0 : 17);
        expect({ [`${nom} · ${b.props.accessibilityLabel}`]: large < dispo }).toEqual({
          [`${nom} · ${b.props.accessibilityLabel}`]: true,
        });
      }
      act(() => t.unmount());
      arbre = null;
    }
  });
});
