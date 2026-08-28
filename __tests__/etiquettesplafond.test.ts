/**
 * DEUX APPAREILS DE PLAFOND VOISINS, DEUX ÉTIQUETTES LISIBLES.
 *
 * Relevé sur une capture du dossier imprimé : dans une circulation, le DAAF
 * est posé à quelques centimètres du point lumineux — c'est même la règle,
 * la norme le veut dans le couloir qui dessert les chambres. Les deux sigles
 * s'écrivaient alors au même endroit, l'un par-dessus l'autre, et le plan
 * portait un mot qui n'existe pas : « DCAF ». Deux informations perdues d'un
 * coup, comme pour les notes — et le remède est le même : la punaise ne
 * bouge pas, le mot si.
 *
 * ET LA MÊME COTE NE S'ÉCRIT PAS DEUX FOIS. Une ligne de spots porte deux
 * cotes par appareil (du mur, d'équerre) ET la chaîne des écarts (du mur au
 * premier, entre chacun, du dernier au mur). Or la première cote de la
 * chaîne mesure EXACTEMENT ce que la cote d'appareil mesurait déjà : même
 * mur, même spot. Les deux nombres se surimprimaient au même point — sur le
 * papier, « 139 » frappé deux fois se lit « 139 / 139 » ou pire, une bouillie
 * d'encre dont on ne tire plus le chiffre.
 */
import {
  buildScanPdf,
  ECART_SIGLE_PLAFOND,
  RAYON_PLAFOND_MAX,
} from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
import type { CeilingFixture } from '../src/geometry/ceiling';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Une pièce de 5 × 4, d'équerre avec le repère. */
const PIECE: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

/** Un mot écrit sur la page, avec l'emprise qu'il y prend. */
interface Mot {
  texte: string;
  x: number;
  y: number;
  taille: number;
}

/**
 * Relit les mots du flux du document, avec leur place.
 *
 * On ne juge pas le dessin sur sa source mais sur ce qui sortira de
 * l'imprimante : chaque `Tj` est un mot posé à un point de la page.
 */
function motsDu(source: string): Mot[] {
  const re = /BT \/F\d ([\d.]+) Tf [^]*?([-\d.]+) ([-\d.]+) Tm \(([^)]*)\) Tj/g;
  const vus: Mot[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    vus.push({ taille: Number(m[1]), x: Number(m[2]), y: Number(m[3]), texte: m[4] });
  }
  return vus;
}

/** L'emprise d'un mot : la même largeur que celle dont le dessinateur se sert. */
const emprise = (m: Mot) => ({
  x: m.x,
  y: m.y,
  w: m.texte.length * m.taille * 0.5,
  h: m.taille,
});

const seTouchent = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const dossier = (ceiling: CeilingFixture[]) =>
  latin1(
    buildScanPdf(
      {
        name: 'Essai',
        walls: PIECE,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1' }],
        roomNames: { r1: 'Sejour' },
      },
      false,
      { ceiling },
    ),
  );

describe('les sigles du plafond sur le plan imprimé', () => {
  /** Le cas du couloir : détecteur de fumée à 10 cm du point lumineux. */
  const VOISINS: CeilingFixture[] = [
    { id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } },
    { id: 'c2', kind: 'daaf', roomId: 'r1', at: { x: 2.6, z: 2 } },
  ];

  it('écrit les deux sigles', () => {
    const mots = motsDu(dossier(VOISINS)).map((m) => m.texte);
    expect(mots).toContain('DCL');
    expect(mots).toContain('DAAF');
  });

  it('ne les écrit pas l’un par-dessus l’autre', () => {
    const mots = motsDu(dossier(VOISINS));
    const dcl = mots.find((m) => m.texte === 'DCL')!;
    const daaf = mots.find((m) => m.texte === 'DAAF')!;
    expect(seTouchent(emprise(dcl), emprise(daaf))).toBe(false);
  });

  /**
   * ET LE SIGLE RESTE AU DROIT DE SON APPAREIL — c'est ce qui le rattache à
   * son point. On l'écarte du tour de son symbole, pas d'un mètre.
   *
   * DEUX VERSIONS SUCCESSIVES, ET LA PREMIÈRE MESURAIT UN AXE.
   *
   * Au début, le second sigle DESCENDAIT d'un cran : les deux restaient donc
   * dans la même colonne, et ce banc bornait leur écart EN Y à vingt-quatre
   * points. C'était vrai, et c'était fragile — il nommait la direction que
   * le dessin prenait à ce moment-là, pas ce qu'on lui demandait.
   *
   * Depuis que tous les mots du plan partagent une seule réserve (voir
   * `cotespdfsanschoc`), le sigle fait LE TOUR de son disque : dessous
   * d'abord, puis dessus, puis de part et d'autre. Deux sigles voisins se
   * retrouvent alors l'un au-dessus, l'autre en dessous — trente-neuf points
   * d'écart en y, et le banc tombait alors qu'il ne s'était rien passé de
   * mauvais.
   *
   * Il mesure donc ce qu'il voulait mesurer depuis le début : la DISTANCE,
   * bornée par ce que le dessin s'autorise — le rayon du disque plus l'écart
   * du sigle, de part et d'autre. Les deux chiffres viennent du dessin
   * lui-même, ils ne sont pas recopiés ici.
   */
  it('garde chaque sigle au droit de son appareil', () => {
    const mots = motsDu(dossier(VOISINS));
    const dcl = mots.find((m) => m.texte === 'DCL')!;
    const daaf = mots.find((m) => m.texte === 'DAAF')!;
    // Les deux appareils sont à dix centimètres : leurs symboles tombent au
    // même point de la page. Le pire écart possible entre leurs sigles, ce
    // sont donc deux places diamétralement opposées autour de ce point.
    const tour = RAYON_PLAFOND_MAX + ECART_SIGLE_PLAFOND;
    expect(Math.hypot(dcl.x - daaf.x, dcl.y - daaf.y)).toBeLessThanOrEqual(
      2 * tour,
    );
  });
});

describe('les cotes d’une ligne de spots', () => {
  /** Trois spots sur la longueur : 143 du mur ouest au premier. */
  const LIGNE: CeilingFixture[] = [
    { id: 's1', kind: 'spot', roomId: 'r1', at: { x: 1.5, z: 2 }, row: 'ln' },
    { id: 's2', kind: 'spot', roomId: 'r1', at: { x: 2.5, z: 2 }, row: 'ln' },
    { id: 's3', kind: 'spot', roomId: 'r1', at: { x: 3.5, z: 2 }, row: 'ln' },
  ];

  it('donne la chaîne des écarts et les cotes d’appareil', () => {
    const mots = motsDu(dossier(LIGNE)).map((m) => m.texte);
    // Un mètre entre deux spots, et 143 du nu du mur ouest au premier.
    expect(mots).toContain('100');
    expect(mots).toContain('143');
  });

  it('n’écrit pas deux fois la même cote au même point', () => {
    // Les seules cotes d'appareil : des centimetres entiers. Le reste de la
    // page (cartouche, metre) se repete d'une feuille a l'autre sans nuire.
    const mots = motsDu(dossier(LIGNE)).filter((m) => /^\d+$/.test(m.texte));
    const vus = new Set<string>();
    const doubles = mots.filter((m) => {
      const cle = `${m.texte}@${Math.round(m.x)},${Math.round(m.y)}`;
      if (vus.has(cle)) return true;
      vus.add(cle);
      return false;
    });
    expect(doubles).toEqual([]);
  });
});

/**
 * ET, PLUS LARGEMENT : RIEN NE S'ECRIT SUR RIEN.
 *
 * Le releve montrait deux defauts sur la meme capture — les sigles l'un sur
 * l'autre, la cote frappee deux fois. Corriger l'un a d'abord decale le
 * sigle sur une cote, puis sous le cartouche de la piece : trois etiquettes
 * qui s'ignorent se marchent forcement dessus un jour. On les juge donc
 * ENSEMBLE, sur la scene qui les reunit toutes — un point lumineux, son
 * detecteur de fumee voisin, et une ligne de trois spots avec sa chaine.
 */
describe('les etiquettes du plafond, toutes ensemble', () => {
  const SCENE: CeilingFixture[] = [
    { id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 1.2 } },
    { id: 'c2', kind: 'daaf', roomId: 'r1', at: { x: 2.62, z: 1.2 } },
    { id: 's1', kind: 'spot', roomId: 'r1', at: { x: 1.5, z: 3 }, row: 'ln' },
    { id: 's2', kind: 'spot', roomId: 'r1', at: { x: 2.5, z: 3 }, row: 'ln' },
    { id: 's3', kind: 'spot', roomId: 'r1', at: { x: 3.5, z: 3 }, row: 'ln' },
  ];

  it('n’en pose aucune sur une autre', () => {
    // La page du plan s'arrete a son cartouche : le metre de la feuille
    // suivante a ses propres nombres, qui ne regardent pas celui-ci.
    const plan = dossier(SCENE).split('(FEUILLE)')[0];
    const mots = motsDu(plan).filter(
      (m) => /^\d+$/.test(m.texte) || ['DCL', 'DAAF', 'SP'].includes(m.texte),
    );
    const paires: string[] = [];
    for (let i = 0; i < mots.length; i++) {
      for (let j = i + 1; j < mots.length; j++) {
        if (seTouchent(emprise(mots[i]), emprise(mots[j]))) {
          paires.push(`${mots[i].texte} / ${mots[j].texte}`);
        }
      }
    }
    expect(paires).toEqual([]);
  });

  /*
    ET LE SIGLE RESTE SOUS SON APPAREIL — c'est ce qui le rattache.

    CE BANC NOMMAIT UNE POSITION PAR SON CHIFFRE : il exigeait un « y » entre
    380 et 410 points de page. Le jour ou la serie d'echelles s'est allongee
    (1:30 et 1:40 sont arrives), le plan a change de taille et le sigle est
    tombe a 379,13 — le dessin etait juste, le banc criait au defaut. C'est
    la faute que la maison connait le mieux, et elle recommence des qu'on
    ecrit un chiffre absolu.
    On verifie donc ce qu'on voulait vraiment dire : les trois spots sont sur
    UNE MEME LIGNE, donc leurs trois sigles aussi — quelle que soit l'echelle
    a laquelle la feuille les dessine.
  */
  it('garde chaque sigle a portee de son symbole', () => {
    const plan = dossier(SCENE).split('(FEUILLE)')[0];
    const sigles = motsDu(plan).filter((x) => x.texte === 'SP');
    expect(sigles.length).toBeGreaterThanOrEqual(3);
    const ys = sigles.map((m) => m.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });
});
