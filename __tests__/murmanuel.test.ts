/**
 * LE MUR AJOUTÉ À LA MAIN, ET LA ROTATION QUI SUIT LE DOIGT.
 *
 * Deux relevés du chantier, le même jour :
 *
 *   « Fais une intelligence pour le placement d'un nouveau mur ajouté
 *     manuellement, comme une facilité pour le joindre à une extrémité
 *     de mur. »
 *   « Revois aussi la rotation des murs, pas facile depuis smartphone.
 *     La rotation ne suit pas bien le mouvement. »
 *
 * Les deux tiennent au même défaut de conception : le plan aidait le doigt
 * PAR AXE (x sur un bout, z sur un autre) sans jamais rien SOUDER, et il
 * corrigeait l'angle À CHAQUE MICRO-PAS au lieu de lire une seule fois où
 * le doigt était arrivé. D'où un coin qui paraît joint sans l'être, et un
 * mur qui reste scotché aux crans pendant que la main part devant.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import {
  anglesRemarquables,
  angleAimante,
  deplier,
  murNeufDepuisUnBout,
  posesDeMur,
  soudureAuBout,
  type WallSeg,
} from '../src/geometry/floorplan';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Un « L » de deux murs : quatre mètres au nord, trois vers le sud. */
const EN_L: WallSeg[] = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3)];

describe('joindre un mur à une extrémité', () => {
  it('soude le coin sur le bout voisin quand il en approche', () => {
    // Douze centimètres à l'écran, c'est le doigt qui a visé juste : on ne
    // laisse pas un plan « presque » fermé — une surface ne se calcule pas
    // sur un contour qui fuit par un interstice de 12 cm.
    const p = soudureAuBout({ x: 4.12, z: 2.94 }, EN_L, 0.25);
    expect(p).toEqual({ x: 4, z: 3 });
  });

  it('ne soude rien au-delà de sa portée : c’est un choix, pas une erreur', () => {
    expect(soudureAuBout({ x: 4.6, z: 3.5 }, EN_L, 0.25)).toBeNull();
  });

  it('ne se soude pas à lui-même', () => {
    // Le coin qu'on tient EST une extrémité du plan : sans cette garde, il
    // se collerait à sa propre position et ne bougerait plus jamais.
    expect(
      soudureAuBout({ x: 4.02, z: 0.01 }, EN_L, 0.25, { x: 4, z: 0 }),
    ).toBeNull();
  });
});

describe('où naît un mur ajouté à la main', () => {
  it('part du bout libre du plan, dans le prolongement de son mur', () => {
    // Un mètre au centre du plan tombait au milieu du séjour, à recoller
    // des deux mains. Le manque, lui, est TOUJOURS à un bout libre.
    const neuf = murNeufDepuisUnBout(EN_L, 1);
    expect(neuf).not.toBeNull();
    // Le bout libre le plus « seul » est celui du mur est, en (4,3) : le
    // mur neuf continue droit vers le sud.
    expect(neuf!.a).toEqual({ x: 4, z: 3 });
    expect(neuf!.b.x).toBeCloseTo(4, 6);
    expect(neuf!.b.z).toBeCloseTo(4, 6);
  });

  it('sur un contour fermé, il n’y a pas de bout libre : rien à proposer', () => {
    const carre = [
      mur('n', 0, 0, 4, 0),
      mur('e', 4, 0, 4, 3),
      mur('s', 4, 3, 0, 3),
      mur('w', 0, 3, 0, 0),
    ];
    expect(murNeufDepuisUnBout(carre, 1)).toBeNull();
  });

  it('sur un plan vide, rien non plus — l’appelant pose au centre', () => {
    expect(murNeufDepuisUnBout([], 1)).toBeNull();
  });
});

/**
 * LES POSES POSSIBLES D'UN MUR NEUF.
 *
 * Relevé du patron : « "Ajouter un mur" doit afficher les multiples
 * possibilités d'attachement à un autre mur dans des angles de 90° et 180°
 * pour droit, à chaque fin de mur ; ces choix de pose doivent être en bleu à
 * faible opacité ».
 *
 * Le mur neuf naissait TOUT SEUL au dernier bout libre, droit devant. C'était
 * déjà mieux que le mètre posé au milieu du séjour, mais l'application
 * choisissait à la place de l'électricien : sur un plan qui a trois bouts
 * libres, elle en prenait un — et si l'on voulait tourner à l'équerre, il
 * fallait poser le mur puis le faire pivoter au doigt.
 *
 * Elle MONTRE désormais, et c'est lui qui choisit : à chaque bout libre, les
 * trois seules poses qui tiennent debout sur un plan de bâtiment — droit dans
 * la continuité, à l'équerre d'un côté, à l'équerre de l'autre. Un mur de
 * biais reste possible : on tire le coin après, comme avant.
 */
describe('les poses possibles d’un mur neuf', () => {
  const cle = (p: { b: { x: number; z: number } }) =>
    `${Math.round(p.b.x * 100) / 100},${Math.round(p.b.z * 100) / 100}`;

  it('propose le droit et les deux équerres, à chaque bout libre', () => {
    const poses = posesDeMur(EN_L, 1);
    // Deux bouts libres — (0,0) et (4,3) — trois poses chacun.
    expect(poses).toHaveLength(6);
    // Au bout du mur est, en (4,3), la sortie va vers le sud : le droit
    // continue en (4,4), les deux équerres partent en (3,3) et (5,3).
    const auBout = poses.filter((x) => x.a.x === 4 && x.a.z === 3);
    expect(auBout.map(cle).sort()).toEqual(['3,3', '4,4', '5,3']);
  });

  it('et chacune part bien du bout, jamais du milieu', () => {
    for (const p of posesDeMur(EN_L, 1)) {
      const bouts = EN_L.flatMap((w) => [w.a, w.b]);
      expect(
        bouts.some((q) => Math.hypot(q.x - p.a.x, q.z - p.a.z) < 1e-9),
      ).toBe(true);
    }
  });

  it('sur un contour fermé, aucune : il n’y a pas de bout libre', () => {
    const carre = [
      mur('n', 0, 0, 4, 0),
      mur('e', 4, 0, 4, 3),
      mur('s', 4, 3, 0, 3),
      mur('w', 0, 3, 0, 0),
    ];
    expect(posesDeMur(carre, 1)).toHaveLength(0);
  });

  it('sur un plan vide, aucune non plus — l’appelant pose au centre', () => {
    expect(posesDeMur([], 1)).toHaveLength(0);
  });

  it('n’en propose que des multiples de 90°', () => {
    for (const p of posesDeMur(EN_L, 1)) {
      const a = (Math.atan2(p.b.z - p.a.z, p.b.x - p.a.x) * 180) / Math.PI;
      expect(Math.abs(a - Math.round(a / 90) * 90)).toBeLessThan(1e-6);
    }
  });
});

describe('la rotation suit le doigt', () => {
  it('déplie le tour : un geste ne saute pas de +179° à -179°', () => {
    // Un angle brut vit dans ]-180, 180]. Le doigt qui franchit le demi-tour
    // faisait donc faire au mur un tour complet en sens inverse — « la
    // rotation part dans tous les sens ».
    expect(deplier(179, -179)).toBeCloseTo(181, 6);
    expect(deplier(-179, 179)).toBeCloseTo(-181, 6);
    expect(deplier(10, 12)).toBeCloseTo(12, 6);
  });

  it('colle aux angles visés SANS y rester scotché', () => {
    // C'est tout le défaut de l'ancien geste : l'aimant s'appliquait à
    // chaque micro-pas et se rappliquait au pas suivant depuis le cran
    // atteint. Le mur ne quittait plus l'équerre pendant que la main
    // continuait. Ici l'aimant lit l'angle ABSOLU voulu : à deux degrés du
    // cran on colle, à cinq on est libre.
    expect(angleAimante(88, [0, 90], 3)).toBe(90);
    expect(angleAimante(85, [0, 90], 3)).toBe(85);
  });

  it('accepte l’angle d’un mur voisin comme cran', () => {
    // Aligner une cloison sur celle d'en face est le geste le plus courant
    // du plan : le voisin vaut donc cran, au même titre que l'équerre.
    const crans = anglesRemarquables(EN_L, 'n');
    expect(crans).toContain(90); // le mur est
    expect(crans).toContain(0); // l'équerre
    expect(crans).toContain(45);
  });
});

describe('le plan applique ces regles', () => {
  const poser = (walls: WallSeg[]) =>
    useScanStore.setState({
      walls,
      rooms: [{ id: 'r1', name: 'Sejour', wallIds: walls.map((w) => w.id) }],
      openings: [],
      objects: [],
      fixtures: [],
      photos: [],
    });

  it('soude vraiment le coin tiré près d’un bout, sans interstice', () => {
    /*
      Quinze centimètres sur CHAQUE axe : l'alignement par axe, qui porte à
      douze, ne voyait rien — et pourtant le coin n'est qu'à vingt et un
      centimètres du bout, personne ne l'amène là pour l'y laisser. Le
      contour restait ouvert, donc sans surface ni pièce.
    */
    poser([mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0.4, 2.9)]);
    useScanStore.getState().moveWallPoint('s', 'b', { x: 0.15, z: 0.15 });
    const s = useScanStore.getState().walls.find((w) => w.id === 's')!;
    expect(s.b.x).toBeCloseTo(0, 6);
    expect(s.b.z).toBeCloseTo(0, 6);
  });

  it('pose un angle ABSOLU, sans accumuler les arrondis', () => {
    poser([mur('n', 0, 0, 4, 0)]);
    useScanStore.getState().setWallAngle('n', 30);
    const apres = useScanStore.getState().walls.find((w) => w.id === 'n')!;
    const deg =
      (Math.atan2(apres.b.z - apres.a.z, apres.b.x - apres.a.x) * 180) /
      Math.PI;
    expect(deg).toBeCloseTo(30, 4);
    // La longueur ne bouge pas : on tourne, on ne retaille pas.
    expect(Math.hypot(apres.b.x - apres.a.x, apres.b.z - apres.a.z)).toBeCloseTo(4, 6);
    // Et cent appels du meme angle ne derivent pas d un degre.
    for (let i = 0; i < 100; i++) useScanStore.getState().setWallAngle('n', 30);
    const fin = useScanStore.getState().walls.find((w) => w.id === 'n')!;
    const degFin =
      (Math.atan2(fin.b.z - fin.a.z, fin.b.x - fin.a.x) * 180) / Math.PI;
    expect(degFin).toBeCloseTo(30, 4);
  });

  it('tourne autour du milieu, les voisins restant accroches', () => {
    poser([mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3)]);
    useScanStore.getState().setWallAngle('n', 10);
    const n = useScanStore.getState().walls.find((w) => w.id === 'n')!;
    const e = useScanStore.getState().walls.find((w) => w.id === 'e')!;
    expect(e.a.x).toBeCloseTo(n.b.x, 6);
    expect(e.a.z).toBeCloseTo(n.b.z, 6);
  });
});
