/**
 * Rien ne doit sortir du cadre.
 *
 * Un trait qui déborde de la feuille est invisible à la génération et
 * saute aux yeux à l'impression. Ce test relit le flux PDF, extrait tous
 * les points des tracés, et vérifie qu'ils tiennent dans la page.
 */
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';

const PAGE_W = 595.28;
const PAGE_H = 841.89;

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Pièce scannée DE BIAIS : le cas qui déborde, si quelque chose déborde. */
const cos = Math.cos(0.35);
const sin = Math.sin(0.35);
const tourne = (x: number, z: number) => ({
  x: x * cos - z * sin,
  z: x * sin + z * cos,
});
const A = tourne(0, 0);
const B = tourne(3.5, 0);
const C = tourne(3.5, 2.5);
const D = tourne(0, 2.5);
const BIAIS = [
  mur('n', A.x, A.z, B.x, B.z),
  mur('e', B.x, B.z, C.x, C.z),
  mur('s', C.x, C.z, D.x, D.z),
  mur('w', D.x, D.z, A.x, A.z),
];

const porte: WallSeg = {
  id: 'p1',
  type: 'door',
  a: tourne(1, 0),
  b: tourne(1.9, 0),
  height: 2.05,
  yCenter: 1.025,
};

const prises: Fixture[] = [
  { id: 'f1', kind: 'prise', wallId: 'n', along: 0.4, height: 0.25, side: 1 },
  { id: 'f2', kind: 'inter', wallId: 'e', along: 0.6, height: 1.1, side: 1 },
  { id: 'f3', kind: 'tableau', wallId: 's', along: 1.2, height: 1.35, side: 1 },
];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

/** Tous les points de tracé du document (opérateurs `m` et `l`). */
function points(pdf: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) {
    out.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return out;
}

const pdfDe = (opts: object, avec3D = false) =>
  latin1(
    buildScanPdf(
      {
        name: 'Biais',
        walls: BIAIS,
        openings: [porte],
        objects: [],
        fixtures: prises,
      },
      avec3D,
      { metre: false, ...opts },
    ),
  );

describe('le plan PDF tient dans sa feuille', () => {
  const pdf = pdfDe({});

  it('produit bien un document', () => {
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(points(pdf).length).toBeGreaterThan(50);
  });

  it('aucun trait ne sort du cadre', () => {
    // Le cadre, pas la page : un trait qui dépasse du cadre est déjà faux.
    const dehors = points(pdf).filter(
      (p) => p.x < 29 || p.y < 29 || p.x > PAGE_W - 29 || p.y > PAGE_H - 29,
    );
    expect(
      dehors
        .slice(0, 6)
        .map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`)
        .join(' | '),
    ).toBe('');
  });

  it('les ouvertures sont cotées', () => {
    // 0,90 m de porte : la cote doit figurer sur le plan.
    expect(pdf).toContain('0,90');
  });

  it('un plan ZOOMÉ est rogné, jamais laissé libre', () => {
    // Le zoom vient de l'aperçu d'export : rien ne borne l'échelle, et le
    // plan agrandi allait traverser le cartouche. Une fenêtre de découpe le
    // contient — c'est elle qu'on vérifie, les coordonnées d'un tracé rogné
    // sortant forcément du cadre.
    const zoome = pdfDe({ plan: { zoom: 2.6, fx: 0.35, fy: -0.3 } });
    const clip = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re W n/.exec(zoome);
    expect(clip).not.toBeNull();
    const [x, y, w, h] = clip!.slice(1).map(parseFloat);
    expect(x).toBeGreaterThanOrEqual(30);
    expect(y).toBeGreaterThanOrEqual(30);
    expect(x + w).toBeLessThanOrEqual(PAGE_W - 30);
    expect(y + h).toBeLessThanOrEqual(PAGE_H - 30);
  });

  /**
   * Et la VUE 3D aussi — c'est elle qui débordait vraiment.
   *
   * À l'écran, la 3D vit dans un cadre qui la rogne : on zoome, le modèle
   * grandit, ce qui dépasse disparaît derrière le bord. Le PDF reprenait le
   * zoom sans le rognage — un modèle agrandi trois fois s'étalait sur toute
   * la feuille, traversait la seconde vue et recouvrait le cartouche.
   */
  it('une vue 3D zoomée reste dans sa case', () => {
    const zoome = pdfDe(
      {
        views: [
          { theta: -32, tilt: 58, zoom: 3.4, fx: 0.4, fy: -0.35 },
          { theta: 148, tilt: 42, zoom: 3.4, fx: -0.4, fy: 0.35 },
        ],
      },
      true,
    );
    const clips = [
      ...zoome.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re W n/g),
    ].map((m) => m.slice(1).map(parseFloat));
    // Une vue par feuille, deux feuilles : deux fenêtres de découpe.
    expect(clips.length).toBeGreaterThanOrEqual(2);
    for (const [x, y, w, h] of clips) {
      expect(x).toBeGreaterThanOrEqual(30);
      expect(y).toBeGreaterThanOrEqual(30);
      expect(x + w).toBeLessThanOrEqual(PAGE_W - 30);
      expect(y + h).toBeLessThanOrEqual(PAGE_H - 30);
    }
  });

  it('et le zoom lui-même est borné : on n’imprime pas un bout de mur', () => {
    // Deux documents, l'un demandé à 3,4×, l'autre à la borne : même dessin.
    const fou = pdfDe(
      {
        views: [
          { theta: -32, tilt: 58, zoom: 9, fx: 0, fy: 0 },
          { theta: 148, tilt: 42, zoom: 9, fx: 0, fy: 0 },
        ],
      },
      true,
    );
    const borne = pdfDe(
      {
        views: [
          { theta: -32, tilt: 58, zoom: 2.2, fx: 0, fy: 0 },
          { theta: 148, tilt: 42, zoom: 2.2, fx: 0, fy: 0 },
        ],
      },
      true,
    );
    const traces = (src: string) =>
      (src.match(/-?[\d.]+ -?[\d.]+ [ml] /g) ?? []).join('|');
    expect(traces(fou)).toBe(traces(borne));
  });
});


/**
 * LA PERSPECTIVE DU PDF MONTRE CE QUE MONTRE L'APP.
 *
 * Deux écarts vus en RENDANT la feuille (le dossier de l'appartement de
 * référence, cuit en SVG) : les murs qui font face à l'objectif restaient
 * pleins — le canapé du séjour était invisible derrière eux, alors que la
 * vue de l'app les efface (`cutawayOpacity`) — et les cotes, insérées dans
 * le tri de profondeur, se faisaient trancher par la maçonnerie voisine :
 * « 3,00 m » sortait en « m » orphelin au coin d'un refend.
 */
describe('la perspective du PDF montre ce que montre l’app', () => {
  const pdf = pdfDe({}, true);
  const pages = [
    ...pdf.matchAll(/<< \/Length \d+ >>\nstream\n([\s\S]*?)\nendstream/g),
  ].map((m) => m[1]);
  // La feuille 3D est la seconde (plan, puis perspective).
  const flux = pages[1];

  it('les murs qui font face à l’objectif s’effacent, comme à l’écran', () => {
    // L'écorché : au moins un pan passe en transparence…
    expect(flux).toMatch(/\/GA\d gs/);
    // …et l'état graphique est déclaré au document.
    expect(pdf).toContain('/ExtGState');
  });

  it('les cotes se lisent par-dessus la maçonnerie, jamais tranchées', () => {
    const zone = flux.slice(flux.indexOf('W n'), flux.lastIndexOf('Q'));
    const premierCote = zone.search(/\(\d+,\d{2} m\) Tj/);
    expect(premierCote).toBeGreaterThan(0);
    // Après la première cote : plus un seul pan. Seuls les halos blancs et
    // le texte ont le droit de suivre — c'est ce qui garantit qu'aucune
    // maçonnerie ne repassera par-dessus un nombre.
    for (const ligne of zone.slice(premierCote).split('\n')) {
      if (/ [ml] /.test(ligne) && /[bfsS]$/.test(ligne.trim())) {
        expect(ligne).toContain('1 1 1 rg');
      }
    }
  });
});

/**
 * LE MÉTRÉ NE MONTRE JAMAIS UN IDENTIFIANT BRUT.
 *
 * Une pièce jamais nommée arrivait sur la feuille du métré sous son
 * identifiant interne — « room-1 » sur un document qu'on remet au client.
 * Le nom manquant se remplace par un rang (« Pièce 1 »), pas par la
 * plomberie du logiciel.
 */
describe('le métré et les pièces sans nom', () => {
  it('écrit « Pièce n », jamais l’identifiant', () => {
    const doc = latin1(
      buildScanPdf(
        {
          name: 'Biais',
          walls: BIAIS.map((w) => ({ ...w, roomId: 'room-1' })),
          openings: [],
          objects: [],
          fixtures: [],
          rooms: [{ id: 'room-1', wallIds: ['n', 'e', 's', 'w'] }],
        },
        false,
        { metre: true },
      ),
    );
    const textes = (doc.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).join(' | ');
    expect(textes).not.toContain('room-1');
    expect(textes).toContain('Pièce 1');
  });
});
