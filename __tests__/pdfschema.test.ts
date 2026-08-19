/**
 * Les deux feuilles de schéma, telles qu'elles sortent du PDF.
 *
 * Faute de pouvoir les regarder d'ici, on les relit : les repères y sont,
 * les protections aussi, les couleurs sont bien celles de la norme — et
 * surtout, rien ne sort de la feuille. Un trait qui déborde est invisible à
 * la génération et saute aux yeux à l'impression.
 */
import { buildScanPdf } from '../src/export/pdf';
import {
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import {
  fixtureMarks,
  multiWire,
  schemaRows,
} from '../src/geometry/schema';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { deviceNames } from '../src/geometry/naming';
import { planRoutes } from '../src/geometry/elecplan';
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
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const R = [{ id: 'r1', name: 'Cuisine', wallIds: W.map((w) => w.id) }];

const f = (
  id: string,
  kind: Fixture['kind'],
  wallId: string,
  along: number,
  height: number,
): Fixture => ({ id, kind, wallId, along, height, side: 1 });

/** Une cuisine complète : cuisson, spécialisés, éclairage, VDI. */
const FX: Fixture[] = [
  f('t', 'tableau', 'w', 1, 1.35),
  f('a', 'prise', 'n', 0.5, 0.25),
  f('b', 'prise2', 'n', 1.5, 1.1),
  f('c', 'prise32', 'n', 3, 1.1),
  f('d', 'inter', 'e', 1, 1.1),
  f('e', 'va', 'e', 2, 1.1),
  f('g', 'applique', 's', 2, 2.1),
  f('h', 'rj45', 's', 3, 0.25),
  f('i', 'prise20', 'n', 4, 1.1),
];

const parts = roomParts(W, R);
const inputs = roomInputsOf(R, parts);
const placement = fixturePlacement(FX, W, inputs);
const list = materialList(inputs, FX, wallToRooms(inputs), placement);
const rows = schemaRows(list.circuits, list.differentials, FX);
const multi = list.circuits.map((c, i) => multiWire(c, FX, `C${i + 1}`));

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

const plan = planRoutes(W, R, parts, FX, placement)!;

/**
 * Les noms d'appareils, comme l'écran d'export les calcule.
 *
 * Le cap 0 place le nord dans l'axe −Z du scan : le mur « n », qui est au
 * nord de la pièce, se nomme donc « mur nord ». C'est exactement ce que
 * doit lire l'électricien sur son schéma.
 */
const noms = deviceNames(
  FX,
  W,
  placement,
  Object.fromEntries(R.map((r) => [r.id, r.name])),
  new Map(parts.map((p) => [p.roomId, p.labelAt])),
  0,
);

const pdf = latin1(
  buildScanPdf(
    {
      name: 'Cuisine',
      walls: W,
      openings: [],
      objects: [],
      rooms: R,
      fixtures: FX,
      routes: plan.traces,
      north: 0,
      deviceNames: noms,
    },
    false,
    {
      metre: false,
      schemas: {
        rows,
        differentials: list.differentials,
        multi,
        marks: fixtureMarks(list.circuits),
      },
    },
  ),
);

const sansSchema = latin1(
  buildScanPdf(
    { name: 'Cuisine', walls: W, openings: [], objects: [], rooms: R, fixtures: FX },
    false,
    { metre: false },
  ),
);

const texte = (src: string) =>
  (src.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? [])
    .map((m) => m.slice(1, m.lastIndexOf(')')))
    .join(' | ');

/** La couleur telle que le PDF l'écrit : « r g b RG ». */
const trait = (hex: string) => {
  // Le PDF écrit les nombres au plus court : « 1 », pas « 1.00 ».
  const v = (i: number) =>
    String(Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 100) / 100);
  return `${v(1)} ${v(3)} ${v(5)} RG`;
};

describe('la feuille unifilaire', () => {
  const doc = texte(pdf);

  it('n’existe que si on la demande', () => {
    expect(texte(sansSchema)).not.toContain('unifilaire');
    expect(doc).toContain('unifilaire');
  });

  it('part du disjoncteur de branchement', () => {
    expect(doc).toContain('AGCP');
    expect(doc).toContain('500 mA');
  });

  it('porte un repère par circuit, dans l’ordre du tableau', () => {
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) expect(doc).toContain(r.mark);
    expect(rows.map((r) => r.mark)).toEqual(
      rows.map((_, i) => `C${i + 1}`),
    );
  });

  it('donne calibre, section et gaine de chaque départ', () => {
    const prises = rows.find((r) => r.label.startsWith('Prises'))!;
    expect(doc).toContain(`${prises.breaker} A`);
    // À la française : le schéma écrit « 2,5 mm² », comme le bordereau du
    // fournisseur. Un document qui mélange les deux notations se relit mal.
    expect(doc).toContain(`${String(prises.section).replace('.', ',')} mm²`);
    expect(doc).toContain(`ICTA Ø${prises.conduit}`);
  });

  it('range les départs sous leur différentiel', () => {
    expect(list.differentials.length).toBeGreaterThan(0);
    expect(doc).toContain('ID1');
    expect(doc).toContain('30 mA');
    // Un circuit VDI n'est pas derrière un différentiel de puissance.
    expect(rows.find((r) => r.breaker === null)?.under).toBeUndefined();
  });
});

/**
 * LES SCHÉMAS SUR PLAN N'EXISTENT PLUS — et c'est un progrès.
 *
 * Le dossier portait les deux mêmes schémas posés sur le plan, un par mode
 * de tracé. Ils promettaient de montrer où passe chaque départ et ne
 * montraient qu'un écheveau : sur un logement réel, une dizaine de circuits
 * se croisent, et aucun ne se suit à l'œil. Le cheminement se lit sur le
 * plan des gaines, le tableau sur l'unifilaire.
 */
describe('ce que le dossier ne porte plus', () => {
  const doc = texte(pdf);

  it('ni unifilaire ni multifilaire posés sur le plan', () => {
    expect(doc).not.toContain('Unifilaire sur plan');
    expect(doc).not.toContain('Multifilaire sur plan');
  });

  it('ni feuille d’étiquettes de tableau', () => {
    expect(doc).not.toContain('Étiquettes de tableau');
  });
});

describe('rien ne sort de la feuille', () => {
  it('tous les tracés tiennent dans la page', () => {
    const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l)\b/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(pdf))) {
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(PAGE_W + 1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(PAGE_H + 1);
      n += 1;
    }
    expect(n).toBeGreaterThan(200);
  });

  it('les tracés de circuit sont bien dessinés, pas seulement listés', () => {
    expect(plan.traces.length).toBeGreaterThan(3);
    // Chaque circuit a sa teinte : on retrouve le bleu du premier départ.
    expect(pdf).toContain(trait('#2F6BFF'));
  });

  it('le document compte DEUX feuilles de plus : unifilaire et multifilaire', () => {
    // Longtemps, `multiWire` a été calculé à chaque export… et jeté : aucune
    // feuille ne le dessinait, alors que le README promettait le schéma de
    // câblage dans le dossier. La feuille existe désormais.
    const feuilles = (src: string) => (src.match(/\/Type \/Page /g) ?? []).length;
    expect(feuilles(pdf)).toBe(feuilles(sansSchema) + 2);
  });

});

/**
 * Une feuille de schéma se LIT. C'est tout ce qu'on lui demande.
 *
 * Deux défauts la rendaient illisible, et tous deux venaient d'un excès de
 * zèle : deux légendes cherchant chacune sa place finissaient l'une sur
 * l'autre, et les conducteurs de plusieurs départs se posaient tous sur le
 * même trait de mur — six fils par-dessus six autres.
 */
describe('la lisibilité des feuilles de schéma', () => {
  /** Les cadres blancs de légende posés sur la feuille. */
  const cadres = (src: string) =>
    [...src.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f/g)].map((m) =>
      m.slice(1).map(parseFloat),
    );

  it('une seule légende par feuille : elles ne peuvent plus se recouvrir', () => {
    // Deux cadres de légende superposés produisaient deux rectangles
    // blancs se chevauchant. On vérifie qu'aucune paire ne se recouvre.
    const boites = cadres(pdf).filter(([, , w, h]) => w > 90 && h > 30);
    for (let i = 0; i < boites.length; i++) {
      for (let j = i + 1; j < boites.length; j++) {
        const [ax, ay, aw, ah] = boites[i];
        const [bx, by, bw, bh] = boites[j];
        const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
        const oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
        expect(ox > 2 && oy > 2).toBe(false);
      }
    }
  });

  /**
   * LE SCHÉMA NOMME CE QU'IL DESSERT.
   *
   * « Prises 1 · C3 » ne se lit qu'avec le plan à côté et un doigt dessus.
   * Un vrai schéma dit la pièce, le mur, et le nom de l'appareil.
   */
  it('nomme les appareils de chaque départ, avec leur pièce et leur mur', () => {
    const doc = texte(pdf);
    expect(doc).toContain('Prise plinthe 1');
    expect(doc).toContain('Cuisine');
    expect(doc).toMatch(/mur (nord|sud|est|ouest)/);
  });

  /**
   * LE NOMBRE DE CONDUCTEURS SE LIT — IL ÉTAIT SOUS LA PASTILLE.
   *
   * La convention de l'unifilaire : une barre oblique sur le départ, et son
   * chiffre à côté. Le chiffre était écrit… puis la pastille du repère,
   * dessinée APRÈS, posait son disque blanc dessus : la légende promettait un
   * chiffre que la feuille ne montrait nulle part. On rejoue l'ordre du flux :
   * aucun disque blanc ne se pose sur un chiffre de conducteurs.
   */
  it('n’écrase pas le chiffre des conducteurs sous la pastille du repère', () => {
    // Les chiffres de conducteurs : taille 7, un ou deux caractères, à plat.
    const chiffres: { at: number; x: number; y: number; w: number }[] = [];
    const reTxt = /BT \/F1 7 Tf [\d. ]+rg 1 0 0 1 ([-\d.]+) ([-\d.]+) Tm \((\d\d?)\) Tj ET/g;
    let m: RegExpExecArray | null;
    while ((m = reTxt.exec(pdf))) {
      chiffres.push({
        at: m.index,
        x: parseFloat(m[1]),
        y: parseFloat(m[2]),
        // La même métrique que fitText : ≈ 0,52 em par signe.
        w: m[3].length * 7 * 0.52,
      });
    }
    expect(chiffres.length).toBeGreaterThanOrEqual(rows.length);
    // Les disques blancs des pastilles : 20 sommets, remplis en blanc.
    const cercles: { at: number; xs: number[]; ys: number[] }[] = [];
    const reCercle = /1 1 1 rg ((?:[-\d.]+ [-\d.]+ [ml] ?){20})f/g;
    while ((m = reCercle.exec(pdf))) {
      const nb = (m[1].match(/[-\d.]+/g) ?? []).map(Number);
      cercles.push({
        at: m.index,
        xs: nb.filter((_, i) => i % 2 === 0),
        ys: nb.filter((_, i) => i % 2 === 1),
      });
    }
    for (const c of chiffres) {
      for (const cercle of cercles) {
        if (cercle.at < c.at) continue; // dessiné avant : il passe dessous
        const x0c = Math.min(...cercle.xs);
        const x1c = Math.max(...cercle.xs);
        const y0c = Math.min(...cercle.ys);
        const y1c = Math.max(...cercle.ys);
        // La boîte du chiffre : sa largeur mesurée, sept points de haut.
        const recouvre =
          c.x < x1c && c.x + c.w > x0c && c.y < y1c && c.y + 7 > y0c;
        expect(recouvre).toBe(false);
      }
    }
  });

  /**
   * LE DÉTAIL D'UN DÉPART VA JUSQU'AU BORD — la place était libre.
   *
   * La ligne grise sous le libellé (« Cuisine, mur est — Interrupteur 1… »)
   * se tronquait à la largeur du libellé, alors que la colonne de droite est
   * VIDE à sa hauteur : l'applique du circuit d'éclairage sortait en
   * « Ap… ». Ce qu'un départ dessert doit se lire en entier quand la feuille
   * a la place de l'écrire.
   */
  it('écrit en entier ce que dessert le circuit d’éclairage', () => {
    const doc = texte(pdf);
    expect(doc).toContain('Applique murale 1');
  });

  /**
   * L'écartement des faisceaux ne se teste pas ici, et il faut le dire.
   *
   * Le plan est dessiné sur TROIS feuilles — le plan, l'unifilaire, le
   * multifilaire — si bien qu'un même point de départ apparaît trois fois
   * dans le flux. Compter les doublons mesurerait donc la pagination, pas
   * l'écartement des circuits. Le décalage par voie se voit à l'œil sur la
   * feuille ; le prétendre vérifié par un compte de coordonnées serait un
   * test qui rassure sans rien garantir.
   */
});

/**
 * LA FEUILLE MULTIFILAIRE — le câblage, un trait par conducteur.
 *
 * `multiWire` était calculé à chaque export puis JETÉ : aucune feuille ne le
 * dessinait, le README promettait un schéma que le dossier n'a jamais porté.
 * La feuille montre chaque circuit avec ses conducteurs aux couleurs de la
 * norme, et les notes qui disent le principe (va-et-vient, courants faibles).
 */
describe('la feuille multifilaire', () => {
  const doc = texte(pdf);

  it('existe quand on demande les schémas, pas sans', () => {
    expect(doc).toContain('multifilaire');
    expect(texte(sansSchema)).not.toContain('multifilaire');
  });

  it('nomme les conducteurs et les trace aux couleurs de la norme', () => {
    expect(doc).toContain('bleu clair');
    expect(doc).toContain('vert/jaune');
    // Le bleu clair du neutre est réellement TRACÉ, pas seulement écrit.
    expect(pdf).toContain(trait('#2E6FD6'));
  });

  it('dit le principe du va-et-vient de la cuisine', () => {
    // La cuisine a un interrupteur et un va-et-vient : deux commandes.
    expect(doc).toContain('navettes');
  });
});

/**
 * Le schéma unifilaire tient debout quel que soit le nombre de départs.
 *
 * Il était dessiné en peigne : les départs s'alignaient horizontalement sous
 * leur différentiel. C'est la forme des manuels, et elle ne tient que pour
 * trois ou quatre circuits — au-delà, la largeur de la feuille étant fixe,
 * les libellés se touchaient, et les différentiels qui ne rentraient plus
 * étaient ABANDONNÉS en cours de page, sans que rien ne le dise.
 */
describe('l’unifilaire, à toutes les tailles d’installation', () => {
  /** Une installation d'appartement complet : douze départs. */
  const gros = Array.from({ length: 12 }, (_, i) => ({
    mark: `C${i + 1}`,
    circuitId: `c${i}`,
    label: `Circuit ${i + 1}`,
    breaker: 16,
    section: 1.5,
    conduit: 16 as const,
    wires: 3,
    points: '4 points',
    under: `ID${(i % 2) + 1}`,
  }));
  const deuxDiffs = [
    { label: 'ID1', rating: 40, type: 'A' as const, circuits: [] as string[] },
    { label: 'ID2', rating: 40, type: 'AC' as const, circuits: [] as string[] },
  ];

  const doc = (r: typeof gros, dd: typeof deuxDiffs) =>
    texte(
      latin1(
        buildScanPdf(
          { name: 'Grand', walls: W, openings: [], objects: [], rooms: R, fixtures: FX },
          false,
          {
            metre: false,
            schemas: { rows: r, differentials: dd, multi: [], marks: new Map() },
          },
        ),
      ),
    );

  it('douze départs se lisent tous, chacun sur sa ligne', () => {
    const vu = doc(gros, deuxDiffs);
    for (const r of gros) expect(vu).toContain(r.mark);
  });

  it('les deux différentiels sont dessinés, pas seulement le premier', () => {
    const vu = doc(gros, deuxDiffs);
    expect(vu).toContain('ID1');
    expect(vu).toContain('ID2');
  });

  it('et si un départ ne tenait pas, la feuille le DIRAIT', () => {
    // Quarante départs ne tiennent pas sur une page : le schéma en dessine
    // ce qu'il peut et annonce le reste, au lieu de l'escamoter.
    const enorme = Array.from({ length: 40 }, (_, i) => ({
      ...gros[0],
      mark: `D${i + 1}`,
      circuitId: `d${i}`,
      label: `Départ ${i + 1}`,
    }));
    const vu = doc(enorme, deuxDiffs);
    expect(vu).toMatch(/départs? de plus/);
  });
});
