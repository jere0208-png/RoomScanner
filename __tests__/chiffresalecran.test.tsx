/**
 * CE QUE L'ÉCRAN ÉCRIT, LE PDF ET LA LÉGENDE LE DISENT AUSSI — enquête des
 * chiffres : les tronçons se comptent de nu à nu, un refend se cote dans la
 * pièce où sa cote s'écrit, la surface du bandeau a deux décimales comme le
 * cartouche, la chaîne du PDF retombe sur la cote totale contre un pan
 * coupé, et le total de la légende est la somme de ce qu'elle écrit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import { RoomBar } from '../src/components/RoomBar';
import TestRenderer, { act } from 'react-test-renderer';
import { Text as SvgText } from 'react-native-svg';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { buildScanPdf } from '../src/export/pdf';
import { etendueDeLaPiece, longueurCotee, roomParts, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, o: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
  ...o,
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function plan(walls: WallSeg[], openings: WallSeg[], rooms: { id: string; name: string; wallIds: string[] }[], w: number, h: number, zoom = 1) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls,
      openings,
      objects: [],
      rooms: rooms.map((r) => ({ ...r, floor: null })) as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      showFurniture: true,
      showSurfaces: true,
    });
    t = TestRenderer.create(
      <FloorplanEditor showMeasures editable={false} selectedWallId={null} onSelectWall={() => {}} vueInitiale={{ zoom, ox: 0, oy: 0, rot: 0 }} />,
    );
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({ nativeEvent: { layout: { width: w, height: h } } });
  });
  arbre = t;
  return t;
}

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(SvgText).map((n) => ({
    txt: Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? ''),
    x: Number(n.props.x ?? 0),
    y: Number(n.props.y ?? 0),
  }));

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};
const textesPdf = (src: string) => {
  const out: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\) Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
};

/** Une pièce DESSINÉE, axes 4,00 × 3,00 (intérieur 3,86 × 2,86), fenêtre de 1,00 au milieu du mur nord. */
const DESSINEE = [
  mur('n', 0, 0, 4, 0, { auNu: true }),
  mur('e', 4, 0, 4, 3, { auNu: true }),
  mur('s', 4, 3, 0, 3, { auNu: true }),
  mur('w', 0, 3, 0, 0, { auNu: true }),
];
const FENETRE: WallSeg = { ...mur('f', 1.5, 0, 2.5, 0), type: 'window', height: 1.2, yCenter: 1.5 };

it('tronçons à l’écran d’une pièce dessinée : de nu à nu, comme la cote et le PDF', () => {
  const parts = roomParts(DESSINEE, [{ id: 'r1', wallIds: ['n', 'e', 's', 'w'] }]);
  const coteNord = longueurCotee(DESSINEE, DESSINEE[0], parts);
  expect(coteNord).toBeCloseTo(3.86, 6);

  // Le PDF : la chaîne des baies du mur nord va de nu à nu.
  const pdf = textesPdf(
    latin1(
      buildScanPdf(
        { name: 'Essai', walls: DESSINEE, openings: [FENETRE], objects: [], rooms: [{ id: 'r1', wallIds: ['n', 'e', 's', 'w'] }] },
        false,
        { metre: false },
      ),
    ),
  );
  expect(pdf).toContain('1,43');

  // L'écran, zoomé assez pour coter les tronçons (≥ 80 px/m).
  const t = plan(DESSINEE, [FENETRE], [{ id: 'r1', name: 'Chambre', wallIds: ['n', 'e', 's', 'w'] }], 400, 400, 3);
  const ecran = textes(t).map((x) => x.txt);
  // Le plein entre le nu du mur ouest et la fenêtre mesure 1,43 m (3,86 − 1,00) / 2.
  expect(ecran).toContain('1,43');
  expect(ecran).not.toContain('1,50');
});

it('refend entre deux pièces dessinées : l’écran écrit la face de la pièce où s’écrit la cote', () => {
  // A (gauche, x 0..4) et B (droite, x 4..8) partagent le refend R ; les murs
  // haut et bas de B sont plus épais (30 cm) que ceux de A (7 cm).
  const W = [
    // Tracé de bas en haut : sa cote se pose côté B (droite).
    mur('R', 4, 3, 4, 0, { auNu: true, epaisseur: 0.1 }),
    mur('a1', 0, 0, 4, 0, { auNu: true, epaisseur: 0.07 }),
    mur('a2', 4, 3, 0, 3, { auNu: true, epaisseur: 0.07 }),
    mur('a3', 0, 3, 0, 0, { auNu: true }),
    mur('b1', 4, 0, 8, 0, { auNu: true, epaisseur: 0.3 }),
    mur('b2', 8, 0, 8, 3, { auNu: true }),
    mur('b3', 8, 3, 4, 3, { auNu: true, epaisseur: 0.3 }),
  ];
  const R = [
    { id: 'A', name: 'Chambre', wallIds: ['a1', 'R', 'a2', 'a3'] },
    { id: 'B', name: 'Bureau', wallIds: ['b1', 'b2', 'b3', 'R'] },
  ];
  const parts = roomParts(W, R);
  const cA = longueurCotee(W, W[0], [parts[0]]);
  const cB = longueurCotee(W, W[0], [parts[1]]);
  expect(cA).toBeCloseTo(2.93, 6);
  expect(cB).toBeCloseTo(2.7, 6);
  // Petite échelle : seules les cotes globales s'écrivent.
  const t = plan(W, [], R, 400, 300);
  const ecran = textes(t);
  const coteR = ecran.filter((x) => x.txt === '2,93 m' || x.txt === '2,70 m');
  // Le refend est à x ≈ milieu de l'écran ; sa cote est celle qui en est la
  // plus proche. Posée dans le bureau, elle dit la face du bureau.
  const xR = (ecran.find((x) => x.txt === 'Chambre')!.x + ecran.find((x) => x.txt === 'Bureau')!.x) / 2;
  const laSienne = coteR.sort((p, q) => Math.abs(p.x - xR) - Math.abs(q.x - xR))[0];
  expect(laSienne.x).toBeGreaterThan(xR);
  expect(laSienne.txt).toBe('2,70 m');
});

it('surface d’une pièce : le bandeau dit 12,35 m² comme le cartouche du plan', () => {
  // Pièce scannée de 4,00 × 3,08725 = 12,349 m².
  const W = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3.08725), mur('s', 4, 3.08725, 0, 3.08725), mur('w', 0, 3.08725, 0, 0)];
  const R = [{ id: 'r1', name: 'Chambre', wallIds: ['n', 'e', 's', 'w'] }];
  const part = roomParts(W, R)[0];
  expect(part.surface!.area).toBeCloseTo(12.349, 6);
  const t = plan(W, [], R, 400, 400);
  const cartouche = textes(t).map((x) => x.txt).filter((s) => s.endsWith('m²'));
  let bandeau!: TestRenderer.ReactTestRenderer;
  act(() => {
    bandeau = TestRenderer.create(
      <RoomBar
        room={{ id: 'r1', name: 'Chambre' }}
        surface={part.surface}
        extent={etendueDeLaPiece(part.surface!)}
        hauteur={2.5}
        styles={{}}
        onName={() => {}}
        onHeight={() => {}}
        onDupliquer={() => {}}
        onScinder={() => {}}
        onPeindre={() => {}}
      />,
    );
  });
  const motsBandeau = bandeau.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children ?? []).filter((x) => typeof x === 'string').join(''))
    .filter((s) => s.includes('m²'));
  act(() => bandeau.unmount());
  expect(cartouche).toContain('12,35 m²');
  expect(motsBandeau.join(' ')).toContain('12,35 m²');
});

it('PDF, mur qui finit sur un pan coupé : la chaîne des baies retombe sur la cote totale', () => {
  // Pièce dessinée, axes : 4 × 3 avec un pan coupé de 1 × 1 au coin (4, 3).
  const H = [
    mur('a', 0, 0, 4, 0, { auNu: true }),
    mur('b', 4, 0, 4, 2, { auNu: true }),
    mur('c', 4, 2, 3, 3, { auNu: true }),
    mur('d', 3, 3, 0, 3, { auNu: true }),
    mur('e', 0, 3, 0, 0, { auNu: true }),
  ];
  const fen: WallSeg = { ...mur('f', 2, 3, 1, 3), type: 'window', height: 1.2, yCenter: 1.5 };
  const parts = roomParts(H, [{ id: 'r1', wallIds: H.map((w) => w.id) }]);
  const total = longueurCotee(H, H[3], parts);
  expect(total).toBeCloseTo(2.901, 3);
  const pdf = textesPdf(
    latin1(
      buildScanPdf(
        { name: 'Essai', walls: H, openings: [fen], objects: [], rooms: [{ id: 'r1', wallIds: H.map((w) => w.id) }] },
        false,
        { metre: false },
      ),
    ),
  ).filter((s) => /^\d+,\d\d( m)?$/.test(s));
  // Le mur d porte « 2,90 m » ; sa chaîne doit sommer 2,90 (0,97 + 1,00 + 0,93).
  expect(pdf).toContain('2,90 m');
  expect(pdf).toContain('0,97');
});

it('la légende de l’image additionne les surfaces telles qu’elle les écrit', () => {
  // Le banc ne va pas jusqu'à la capture : on lit la règle à sa source, la
  // même que celle du PDF (`sommeEcrite`).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
  expect(src).toContain('const total = auCentieme(parts.reduce((t, p) => t + auCentieme(p.surface?.area ?? 0), 0));');
});
