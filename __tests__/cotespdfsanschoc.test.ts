/**
 * RIEN NE SE TOUCHE SUR LA FEUILLE DU PLAN — mesuré, pas espéré.
 *
 * L'ÉCRAN A EU SON TOUR, PAS LE PAPIER. Le placement des cotes à l'écran a
 * été réuni sous un seul arbitre et mesuré à zéro chevauchement sur seize
 * cadrages (voir `cotessanschoc`). Le PDF, lui, gardait sa propre
 * discipline — plus ancienne, faite de `libre()`, `ecarterDe` et `auLarge` —
 * et PERSONNE NE L'AVAIT MESURÉE. On la mesure ici.
 *
 * CE QUE LA MESURE A TROUVÉ, sur trente cadrages du plan de référence
 * (appareillage tous les 60 / 90 / 140 cm, cinq zooms, avec et sans
 * plafond) : **47 chevauchements sur 2 494 étiquettes**. Quatre familles de
 * mots écrivaient sans regarder personne, alors que la feuille tient
 * pourtant UNE réserve commune (`posees`) depuis longtemps :
 *
 *   — LE SIGLE D'UN APPAREIL (« 20A », « 32A », « TV ») : il réservait sa
 *     place APRÈS s'être écrit, et n'interrogeait jamais celle des autres.
 *     D'où « 0,90 » de menuiserie barré par « 32A » ;
 *   — LE REPÈRE DE CIRCUIT (le numéro sous le symbole) : même défaut. D'où
 *     « 1,20 » barré par un « 9 » ;
 *   — LE SIGLE D'UN APPAREIL DE PLAFOND (« DAAF », « SP ») : il ne
 *     s'écartait que de ses semblables et des pastilles, pas du reste de la
 *     feuille. D'où « DAAF » sur un repère de circuit, et « SP » sur le
 *     cartouche « 9,0 m² » ;
 *   — LA NOTE : elle cherchait bien une place libre, mais seulement EN
 *     MONTANT ET EN DESCENDANT, et s'écrivait quand même si elle n'en
 *     trouvait pas. D'où « colonne montante ici » en travers de « 3,00 m ».
 *
 * L'ORDRE EST CELUI DES LIBERTÉS, comme à l'écran et comme sur le papier :
 * ce qui ne peut pas bouger s'inscrit d'abord (le numéro de mur, le sigle et
 * le repère d'un appareil, le sigle d'un plafonnier), ce qui peut glisser
 * s'écarte ensuite (les cotes), et ce qui peut se taire se tait en dernier.
 *
 * CE BANC PORTE SON CONTRÔLE EN SENS INVERSE. Une sonde qui ne trouve jamais
 * rien peut être une sonde aveugle : on vérifie donc qu'elle SAIT voir — sur
 * des boîtes construites pour se chevaucher, et sur l'inclinaison, qui est
 * précisément ce qui avait faussé la première sonde de l'écran (une cote de
 * mur vertical s'écrit EN BIAIS : son emprise est haute et étroite).
 *
 * ET ELLE MESURE CE QUE LE PDF ÉCRIT VRAIMENT : chaque mot est relu dans le
 * flux de la page (`Tm … Tj`), avec sa taille, sa place et son angle réels.
 * Elle ne recalcule pas la géométrie de son côté — un dessin qui refait les
 * calculs de celui qu'il juge ne prouve rien.
 */
import { buildScanPdf, FENETRE_PLAN } from '../src/export/pdf';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import { segLength, type WallSeg } from '../src/geometry/floorplan';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const murs = SNAPSHOT_WALLS as WallSeg[];

/*
  UN LOGEMENT ÉQUIPÉ POUR DE VRAI. Le plan de référence nu ne porte que sept
  cotes : il passerait sans rien prouver. On l'équipe donc mur par mur, comme
  un rez-de-chaussée rénové — et à trois densités, parce que le pire cas
  n'est pas le plus chargé mais celui où deux mots tombent au même endroit.
*/
const KINDS: FixtureKind[] = [
  'prise',
  'inter',
  'prise20',
  'rj45',
  'tv',
  'prise32',
  'va',
  'poussoir',
];

const appareillage = (pas: number): Fixture[] => {
  const out: Fixture[] = [];
  murs.forEach((w, iw) => {
    const L = segLength(w);
    for (let a = pas, i = 0; a < L - 0.3; a += pas, i++) {
      out.push({
        id: `f${iw}_${i}`,
        kind: KINDS[(iw + i) % KINDS.length],
        wallId: w.id,
        along: a,
        height: 0.25,
        side: 1,
      });
    }
  });
  return out;
};

const bornes = () => {
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

/** Quatre lignes de plafond en travers : spots en chaîne, DCL, DAAF. */
const CEILING = [0, 1, 2, 3].flatMap((r) =>
  [0, 1, 2, 3].map((i) => ({
    id: `s${r}${i}`,
    kind: (['spot', 'spot', 'dcl', 'daaf'] as const)[r % 4],
    roomId: SNAPSHOT_ROOMS[r % SNAPSHOT_ROOMS.length].id,
    at: {
      x: B.x0 + (B.x1 - B.x0) * (0.2 + i * 0.2),
      z: B.z0 + (B.z1 - B.z0) * (0.18 + r * 0.22),
    },
    row: `ln${r}`,
  })),
);

const noms = ['Sejour', 'Chambre', 'Cuisine', 'Salle d eau', 'Entree', 'Bureau'];
const roomNames = Object.fromEntries(
  SNAPSHOT_ROOMS.map((r: { id: string }, i: number) => [r.id, noms[i % 6]]),
);

/** Les mots écrits au crayon sur le relevé : ils passent en dernier. */
const NOTES = [
  {
    at: { x: (B.x0 + B.x1) / 2, z: (B.z0 + B.z1) / 2 },
    text: 'colonne montante ici',
  },
  { at: { x: B.x0 + 0.8, z: B.z0 + 0.8 }, text: 'gaine a reprendre' },
];

interface Bte {
  txt: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La page du plan : c'est toujours la première du dossier. */
const pagePlan = (src: string) => {
  const i = src.indexOf('stream\n');
  const j = src.indexOf('\nendstream', i);
  return src.slice(i + 7, j);
};

/*
  UN MOT DU FLUX PDF : `BT /F1 <taille> Tf <r g b> rg <cos sin -sin cos tx ty>
  Tm (texte) Tj ET`. Tout y est — c'est ce que le lecteur affichera.
*/
const RE =
  /BT \/F\d ([\d.-]+) Tf [\d.-]+ [\d.-]+ [\d.-]+ rg ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) Tm \(((?:[^()\\]|\\.)*)\) Tj ET/g;

/**
 * L'emprise de chaque mot ÉCRIT DANS LE PLAN.
 *
 * Le PDF pose le texte à (tx, ty) — le début de la ligne de base — incliné
 * de l'angle porté par la matrice. La boîte est donc celle des quatre coins
 * TOURNÉS : mesurée à plat, une cote de mur vertical déborderait sur ses
 * voisines et l'on compterait des chocs imaginaires.
 *
 * La largeur suit la règle du générateur (Helvetica ≈ 0,5 em par signe) et
 * la hauteur celle des chiffres (0,72 em) : un nombre n'occupe ni jambage
 * ni accent.
 */
const boites = (page: string): Bte[] => {
  const out: Bte[] = [];
  let m: RegExpExecArray | null;
  RE.lastIndex = 0;
  while ((m = RE.exec(page))) {
    const taille = Number(m[1]);
    const cos = Number(m[2]);
    const sin = Number(m[3]);
    const x = Number(m[6]);
    const y = Number(m[7]);
    const txt = m[8];
    const l = txt.length * taille * 0.5;
    const h = taille * 0.72;
    const coins = [
      [0, 0],
      [l, 0],
      [l, h],
      [0, h],
    ].map(([u, v]) => ({ x: x + u * cos - v * sin, y: y + u * sin + v * cos }));
    const xs = coins.map((p) => p.x);
    const ys = coins.map((p) => p.y);
    // Ce qui est écrit hors de la fenêtre de découpe appartient à la
    // FEUILLE (tête, cartouche), pas au plan : ce banc juge le plan. La
    // fenêtre est celle que le dessin annonce, pas une recopie.
    if (
      y < FENETRE_PLAN.y ||
      y > FENETRE_PLAN.y + FENETRE_PLAN.h
    ) {
      continue;
    }
    out.push({
      txt,
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    });
  }
  return out;
};

const seTouchent = (a: Bte, b: Bte) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

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

const dossier = (fx: Fixture[], opts: Record<string, unknown>) =>
  latin1(
    buildScanPdf(
      {
        name: 'Reference',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS,
        roomNames,
        fixtures: fx,
        notes: NOTES,
        north: null,
      } as never,
      false,
      { metre: false, surfaces: true, ...opts } as never,
    ),
  );

describe('rien ne se touche sur la feuille du plan', () => {
  for (const pas of [0.6, 0.9, 1.4]) {
    const fx = appareillage(pas);
    // Un repère de circuit par appareil : c'est ce que le dossier porte dès
    // que l'app connaît les départs.
    const marks = new Map(fx.map((f, i) => [f.id, String((i % 9) + 1)]));
    for (const zoom of [0.8, 1, 1.3, 1.7, 2.2]) {
      for (const plafond of [false, true]) {
        it(`appareil tous les ${pas} m, zoom ${zoom}, ${plafond ? 'avec' : 'sans'} plafond`, () => {
          const bs = boites(
            pagePlan(
              dossier(fx, {
                plan: { zoom },
                ceiling: plafond ? CEILING : undefined,
                marks,
              }),
            ),
          );
          // Une feuille qui n'écrirait plus rien passerait sans rien valoir.
          expect(bs.length).toBeGreaterThan(20);
          expect(chocs(bs)).toEqual([]);
        });
      }
    }
  }
});

describe('et la sonde sait voir un chevauchement', () => {
  /*
    LE CONTRÔLE EN SENS INVERSE, et c'est LUI qui donne du prix aux zéros du
    dessus. Une mesure qui rend toujours zéro peut être une mesure cassée.
  */
  it('deux boîtes posées l’une sur l’autre comptent pour un choc', () => {
    const a = { txt: '20A', x: 100, y: 100, w: 20, h: 10 };
    const b = { txt: '3', x: 110, y: 104, w: 8, h: 10 };
    expect(chocs([a, b])).toEqual(['"20A" × "3"']);
  });

  it('mais deux boîtes qui se manquent d’un cheveu ne comptent pas', () => {
    const a = { txt: '20A', x: 100, y: 100, w: 20, h: 10 };
    const b = { txt: '3', x: 121, y: 100, w: 8, h: 10 };
    expect(chocs([a, b])).toEqual([]);
  });

  it('et elle lit l’inclinaison du flux, pas une boîte à plat', () => {
    /*
      Une cote de mur vertical est écrite en biais : son emprise est HAUTE ET
      ÉTROITE. C'est le défaut qu'avait la première sonde de l'écran, et il
      faussait le compte dans les deux sens.
    */
    const droit =
      'BT /F1 8.50 Tf 0 0 0 rg 1 0 0 1 200.00 400.00 Tm (3,00 m) Tj ET';
    const tourne =
      'BT /F1 8.50 Tf 0 0 0 rg 0 1 -1 0 200.00 400.00 Tm (3,00 m) Tj ET';
    const [a] = boites(droit);
    const [b] = boites(tourne);
    expect(a.w).toBeGreaterThan(a.h);
    expect(b.h).toBeGreaterThan(b.w);
    expect(b.w).toBeCloseTo(a.h, 5);
  });
});
