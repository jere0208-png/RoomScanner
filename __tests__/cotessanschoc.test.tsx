/**
 * AUCUNE ÉTIQUETTE N'EN TOUCHE UNE AUTRE — mesuré, pas espéré.
 *
 * Relevé du patron : « fais un tour pour le placement intelligent des cotes
 * sur toute longueur. Il faut absolument pas que 2 cotes se touchent ou qu'un
 * élément vienne entraver la lecture d'une cote. Tout doit être bien pensé. »
 *
 * LE PLAN AVAIT TROIS SYSTÈMES QUI NE SE PARLAIENT PAS.
 *
 *   — les cotes de mur et de tronçon passaient par `cotesLisibles` : la plus
 *     grande gagne, les autres renoncent. Elles ne connaissaient qu'elles ;
 *   — les écarts d'une ligne de spots s'écrivaient dans le calque du plafond,
 *     sans regarder personne ;
 *   — le cartouche d'une pièce esquivait les meubles et les spots, jamais un
 *     chiffre — et il se plaçait APRÈS les cotes, donc contre un adversaire
 *     qui avait déjà choisi.
 *
 * MESURÉ AVANT CORRECTION, sur le plan de référence, à seize cadrages allant
 * de l'iPhone SE à la tablette : **40 chevauchements sur 478 étiquettes**.
 *
 * QUATRE CHANGEMENTS, ET C'EST LE TROISIÈME QUI A TOUT DÉBLOQUÉ.
 *
 *   1. les écarts de plafond entrent dans la même balance que les cotes
 *      (`etiquettesDesEcarts` — une seule source pour dessiner et arbitrer) ;
 *   2. le cartouche cède LIGNE PAR LIGNE quand rien n'est libre : les
 *      hors-tout d'abord, puis la surface, et il ne reste que le nom ;
 *   3. **l'ordre s'inverse** : le cartouche se pose d'abord, les cotes se
 *      rangent autour. C'est la règle du dossier imprimé — « le cartouche
 *      évite les sigles, la cote évite les deux » — et c'est la bonne : un
 *      nom se lit n'importe où dans sa pièce, une cote est attachée à ce
 *      qu'elle mesure ;
 *   4. **une cote GLISSE le long de son mur** au lieu de disparaître. C'est
 *      le « sur toute longueur » du relevé, et c'est ce que fait un
 *      dessinateur.
 *
 * APRÈS : **zéro chevauchement**, et une seule étiquette a bougé sur les
 * planches de référence — un « 0,90 » de menuiserie, qui a glissé de trente
 * pixels le long de son mur plutôt que de renoncer.
 *
 * CE BANC MESURE CE QUE L'ON VOIT, ET IL PORTE SON CONTRÔLE EN SENS INVERSE :
 * une sonde qui ne trouve jamais rien peut être une sonde aveugle. On vérifie
 * donc qu'elle SAIT voir — sur un jeu d'étiquettes construit pour se
 * chevaucher, elle doit compter les chocs.
 *
 * ET LA ROTATION COMPTE. La première version de cette sonde ignorait
 * l'inclinaison des chiffres : une cote de mur vertical est écrite EN BIAIS,
 * son emprise est haute et étroite, pas large et basse. Elle comptait donc
 * des chevauchements qui n'existaient pas, et en manquait d'autres — le
 * premier chiffre annoncé (28) était faux dans les deux sens.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Text as SvgText } from 'react-native-svg';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import type { WallSeg } from '../src/geometry/floorplan';

const rooms = SNAPSHOT_ROOMS.map((r: { id: string }, i: number) => ({
  id: r.id,
  name: ['Séjour', 'Chambre', 'Cuisine', 'Salle d’eau', 'Entrée', 'Bureau'][
    i % 6
  ],
  floor: null,
}));

const bornes = () => {
  const murs = SNAPSHOT_WALLS as WallSeg[];
  const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
  const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  };
};
const B = bornes();

/** Trois lignes de spots en travers du plan : de quoi encombrer pour de vrai. */
const CEILING = [0, 1, 2].flatMap((r) =>
  [0, 1, 2].map((i) => ({
    id: `s${r}${i}`,
    kind: 'spot',
    roomId: SNAPSHOT_ROOMS[r % SNAPSHOT_ROOMS.length].id,
    at: {
      x: B.x0 + (B.x1 - B.x0) * (0.25 + i * 0.25),
      z: B.z0 + (B.z1 - B.z0) * (0.2 + r * 0.3),
    },
    row: `ln${r}`,
  })),
);

/** Une gaine en travers : elle passe sous les chiffres, elle ne les gêne pas. */
const GAINE = [
  {
    id: 'g1',
    path: [
      { x: B.x0 + 0.3, z: (B.z0 + B.z1) / 2 },
      { x: B.x1 - 0.3, z: (B.z0 + B.z1) / 2 },
    ],
  },
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function plan(w: number, h: number, edition: boolean) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: rooms as never,
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: CEILING as never,
      photos: [],
      showFurniture: true,
      showSurfaces: true,
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable={edition}
        selectedWallId={null}
        onSelectWall={() => {}}
        ceiling={CEILING as never}
        showCeiling
        cableRoutes={GAINE}
      />,
    );
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: w, height: h } },
    });
  });
  arbre = t;
  return t;
}

interface Bte {
  txt: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * L'emprise de chaque mot écrit sur le plan.
 *
 * On l'estime avec la MÊME règle que le plan (0,55 em par signe) et l'on tient
 * compte de l'INCLINAISON : sans elle, la sonde mesure une autre boîte que
 * celle que l'œil voit, et son verdict ne vaut rien.
 */
const boites = (t: TestRenderer.ReactTestRenderer): Bte[] =>
  t.root
    .findAllByType(SvgText)
    .map((n) => {
      const txt = Array.isArray(n.props.children)
        ? n.props.children.join('')
        : String(n.props.children ?? '');
      const f = Number(n.props.fontSize ?? 10);
      if (!txt.trim()) return null;
      const tr = String(n.props.transform ?? '');
      const m = /rotate\(\s*(-?[\d.]+)/.exec(tr);
      const deg = m ? parseFloat(m[1]) : 0;
      const r = (Math.abs(deg) * Math.PI) / 180;
      const l = txt.length * f * 0.55;
      const w = l * Math.cos(r) + f * Math.sin(r);
      const h = l * Math.sin(r) + f * Math.cos(r);
      const ancre = String(n.props.textAnchor ?? 'start');
      const x = Number(n.props.x ?? 0);
      const y = Number(n.props.y ?? 0);
      // Tourné, le texte pivote AUTOUR de son point : la boîte se centre
      // dessus, et non plus sur une ligne de base horizontale.
      const gx =
        deg !== 0
          ? x - w / 2
          : ancre === 'middle'
            ? x - l / 2
            : ancre === 'end'
              ? x - l
              : x;
      const gy = deg !== 0 ? y - h / 2 : y - h * 0.8;
      return { txt, x: gx, y: gy, w, h };
    })
    .filter((b): b is Bte => !!b);

const seTouchent = (a: Bte, b: Bte) =>
  !(
    a.x > b.x + b.w ||
    b.x > a.x + a.w ||
    a.y > b.y + b.h ||
    b.y > a.y + a.h
  );

/** Les paires qui se chevauchent, décrites pour qu'on sache lesquelles. */
const chocs = (bs: Bte[]) => {
  const out: string[] = [];
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      if (seTouchent(bs[i], bs[j])) {
        out.push(`"${bs[i].txt}" × "${bs[j].txt}"`);
      }
    }
  }
  return out;
};

/*
  SEIZE CADRAGES, de l'iPhone SE à la tablette. Le pire cas n'est pas le plus
  petit écran : c'est celui où l'échelle met le plus d'étiquettes au même
  endroit, et on ne sait pas d'avance lequel c'est.
*/
const CADRAGES: [number, number][] = [
  [320, 520],
  [360, 560],
  [390, 620],
  [430, 700],
  [520, 620],
  [700, 620],
  [900, 620],
  [1100, 700],
];

describe('rien ne se touche sur le plan', () => {
  for (const [w, h] of CADRAGES) {
    for (const ed of [false, true]) {
      it(`${w}×${h}, ${ed ? 'édition' : 'lecture'}`, () => {
        const bs = boites(plan(w, h, ed));
        // Un plan qui n'écrirait plus rien passerait sans rien valoir.
        expect(bs.length).toBeGreaterThan(10);
        expect(chocs(bs)).toEqual([]);
      });
    }
  }
});

describe('et la sonde sait voir un chevauchement', () => {
  /*
    LE CONTRÔLE EN SENS INVERSE, et c'est LUI qui donne du prix aux seize
    zéros du dessus. Une mesure qui rend toujours zéro peut être une mesure
    cassée : on lui donne donc des boîtes qui se chevauchent pour de bon, et
    l'on exige qu'elle les compte.
  */
  it('deux boîtes posées l’une sur l’autre comptent pour un choc', () => {
    const a = { txt: '150', x: 100, y: 100, w: 20, h: 10 };
    const b = { txt: '3,00 m', x: 110, y: 104, w: 33, h: 10 };
    expect(chocs([a, b])).toEqual(['"150" × "3,00 m"']);
  });

  it('mais deux boîtes qui se manquent d’un cheveu ne comptent pas', () => {
    const a = { txt: '150', x: 100, y: 100, w: 20, h: 10 };
    const b = { txt: '3,00 m', x: 121, y: 100, w: 33, h: 10 };
    expect(chocs([a, b])).toEqual([]);
  });

  it('et elle tient compte de l’inclinaison', () => {
    /*
      C'est le défaut qu'avait la première version de cette sonde : une cote
      de mur vertical est écrite en biais, son emprise est haute et étroite.
      Mesurée à plat, elle débordait sur ses voisines et l'on comptait des
      chocs imaginaires.
    */
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <SvgText
          x={100}
          y={100}
          fontSize={10}
          textAnchor="middle"
          transform="rotate(90, 100, 100)">
          3,00 m
        </SvgText>,
      );
    });
    const [b] = boites(t);
    act(() => t.unmount());
    // Tourné d'un quart de tour, il est plus HAUT que LARGE.
    expect(b.h).toBeGreaterThan(b.w);
    expect(b.w).toBeLessThan(12);
  });
});
