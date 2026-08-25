/**
 * LE BANDEAU DIT DE QUOI IL PARLE, ET OU IL SE COUPE EN DEUX.
 *
 * Releve du patron : le bandeau du bas est « trop simple ». Trois pistes ont
 * ete posees — une teinte de fond selon ce qu'on a touche, un filet entre
 * les deux parties, une icone devant le titre. Reponse : « fais le filet et
 * icone ». La teinte de fond reste en attente : elle change la peau du
 * bandeau, et le patron n'en a pas voulu pour l'instant.
 *
 * CE QUE CHACUNE APPORTE.
 *
 * LE FILET. Le bandeau a deux parties — ce qu'on lit en haut, ce qu'on
 * touche en dessous — et rien ne les separait qu'un blanc. Sur un mur avec
 * quatre boutons, la carte se lit comme un seul bloc gris ou l'oeil ne sait
 * pas ou s'arrete la cote et ou commencent les gestes. Un cheveu suffit :
 * c'est la meme separation que les rangees d'un menu, et elle dit la meme
 * chose.
 *
 * L'ICONE. Le titre est une cote — « 0,83 × 2,04 m » — et rien ne disait a
 * quoi elle appartient sinon le mot en gris dessous, qu'il faut lire. La
 * silhouette de l'element se pose devant : porte, mur, note, ligne de spots
 * se reconnaissent sans lire, comme dans la rangee d'outils.
 *
 * ON NE CHERCHE PAS UN CHIFFRE. Cinq bancs de cette maison sont morts d'avoir
 * nomme un reglage par sa valeur. Le filet se cherche par sa NATURE — une
 * bordure haute sur la rangee des boutons, de la couleur des filets — et
 * l'icone par la sienne : un trace pose avant le texte, et DIFFERENT d'un
 * element a l'autre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Path } from 'react-native-svg';
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

const bandeau = (icone?: string) => (
  <StripBar
    styles={styles}
    icone={icone}
    strong="0,83 × 2,04 m"
    note="porte"
    actions={[
      { label: 'Largeur', ghost: true, onPress: () => {} },
      { label: 'Hauteur', ghost: true, onPress: () => {} },
    ]}
  />
);

/**
 * La rangee d'actions : le conteneur qui porte les boutons.
 *
 * LA DERNIERE rangee qui passe a la ligne, pas la premiere : le bandeau
 * d'un meuble en compte une autre au-dessus — les fleches de deplacement —
 * et c'est elle qu'on attrapait. « Ce qu'on touche est EN DESSOUS » est la
 * forme meme de ces bandeaux : le banc s'appuie dessus plutot que sur un
 * nom de style, qui ne dit rien de ce qu'on voit.
 */
const rangee = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(View)
    .map((n) => plat(n.props.style))
    .filter((st) => st.flexWrap === 'wrap' && st.flexDirection === 'row')
    .pop();

/** Les traces dessines dans le bandeau, dans l'ordre de l'arbre. */
const traces = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Path).map((n) => String(n.props.d));

describe('le filet entre les deux parties', () => {
  it('separe ce qu’on lit de ce qu’on touche', () => {
    const st = rangee(monter(bandeau(SOLAIRES.ouvertures)));
    expect(st).toBeTruthy();
    // Un trait EN HAUT de la rangee des boutons : c'est la ou passe la
    // coupure, pas au-dessus du titre ni sous la carte.
    expect(Number(st!.borderTopWidth)).toBeGreaterThan(0);
    expect(st!.borderTopColor).toBe(light.line);
  });

  it('laisse respirer de part et d’autre', () => {
    // Un filet colle aux boutons se lit comme un soulignement du texte.
    const st = rangee(monter(bandeau(SOLAIRES.ouvertures)));
    expect(Number(st!.paddingTop)).toBeGreaterThan(0);
  });
});

describe('l’icone devant le titre', () => {
  it('se dessine, et AVANT le texte', () => {
    const t = monter(bandeau(SOLAIRES.ouvertures));
    expect(traces(t)[0]).toBe(SOLAIRES.ouvertures);
  });

  it('n’est pas la meme d’un element a l’autre', () => {
    const porte = traces(monter(bandeau(SOLAIRES.ouvertures)))[0];
    act(() => arbre?.unmount());
    const mur = traces(monter(bandeau(SOLAIRES.murs)))[0];
    expect(porte).not.toBe(mur);
  });

  /*
    LE CONTROLE EN SENS INVERSE : un bandeau qui dessinerait toujours la
    meme silhouette — ou une par defaut — passerait l'epreuve du dessus.
  */
  it('ne dessine rien quand l’ecran n’en donne pas', () => {
    const t = monter(bandeau(undefined));
    // Ces deux boutons-la n'ont ni crayon ni silhouette : la carte doit
    // etre vierge de tout trace.
    expect(traces(t)).toHaveLength(0);
  });

  it('n’empeche pas les boutons de porter la leur', () => {
    const t = monter(
      <StripBar
        styles={styles}
        icone={SOLAIRES.murs}
        strong="3,98 × 2,49 m"
        note="mur"
        actions={[
          {
            label: 'Élec',
            icone: SOLAIRES.elec,
            sansMot: true,
            onPress: () => {},
          },
        ]}
      />,
    );
    const vus = traces(t);
    expect(vus[0]).toBe(SOLAIRES.murs);
    expect(vus).toContain(SOLAIRES.elec);
  });
});

/*
  LES QUATRE COQUILLES DU BAS, PAS UNE SEULE.

  Un mur et une menuiserie passent par `StripBar` ; une piece, un meuble et
  un appareil de plafond ont la leur. Elles partagent deja les styles — le
  filet arrive donc partout d'un coup — mais la silhouette se pose dans
  chacune. Une seule restee sans se lirait comme le bandeau d'un autre
  ecran.
*/
const MURS: WallSeg[] = [
  { id: 'n', type: 'wall', a: { x: 0, z: 0 }, b: { x: 5, z: 0 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 'e', type: 'wall', a: { x: 5, z: 0 }, b: { x: 5, z: 4 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 's', type: 'wall', a: { x: 5, z: 4 }, b: { x: 0, z: 4 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
  { id: 'o', type: 'wall', a: { x: 0, z: 4 }, b: { x: 0, z: 0 }, height: 2.5, yCenter: 1.25, roomId: 'r1' },
];

const COQUILLES: [string, () => React.ReactElement][] = [
  ['mur ou menuiserie', () => bandeau(SOLAIRES.murs)],
  [
    'piece',
    () => (
      <RoomBar
        room={{ id: 'r1', name: 'Salle de bain' }}
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
    'meuble',
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

describe('toutes les coquilles du bas', () => {
  it.each(COQUILLES)('« %s » porte sa silhouette en tete', (_nom, faire) => {
    expect(traces(monter(faire()))[0]).toBeTruthy();
  });

  it.each(COQUILLES)('« %s » separe ses deux parties d’un filet', (_nom, faire) => {
    const st = rangee(monter(faire()));
    expect(Number(st!.borderTopWidth)).toBeGreaterThan(0);
  });

  it('et chacune la sienne : quatre silhouettes, pas une repetee', () => {
    const vues: string[] = [];
    for (const [, faire] of COQUILLES) {
      vues.push(traces(monter(faire()))[0]);
      act(() => arbre?.unmount());
      arbre = null;
    }
    expect(new Set(vues).size).toBe(COQUILLES.length);
  });
});
