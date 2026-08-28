/**
 * Déplacer un meuble : ce que le doigt demande, ce que les murs autorisent.
 *
 * Trois pannes successives ont été signalées sur ce geste — le meuble qui ne
 * bouge pas, qui revient à sa place, qu'on n'arrive pas à plaquer contre un
 * mur. Deux avaient la même cause (le responder refabriqué en plein geste,
 * vérifié dans `poignees.test.tsx`), la troisième est ici : la collision.
 * On rejoue donc un glissement COMPLET, image par image, comme le fait la
 * poignée — position = point de départ + delta cumulé — et on regarde où le
 * meuble s'arrête.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  faceIntoRoom,
  fitsInRoom,
  pushOutOfWalls,
  WALL_T,
  type ObjectFootprint,
  type WallSeg,
} from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';
import type { CatalogItem } from '../src/geometry/catalogue';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Chambre de 3,50 × 2,44 m, coins à l'axe des murs. */
const L = 3.5;
const P = 2.44;
const CHAMBRE: WallSeg[] = [
  mur('n', 0, 0, L, 0),
  mur('e', L, 0, L, P),
  mur('s', L, P, 0, P),
  mur('w', 0, P, 0, 0),
];

const LIT: CatalogItem = {
  key: 'lit140',
  label: 'Lit 140',
  w: 1.4,
  d: 1.9,
  h: 0.5,
  category: 'bed',
};

const poser = (item: CatalogItem, x: number, z: number) => {
  useScanStore.setState({
    walls: CHAMBRE,
    rooms: [{ id: 'r1', name: 'Chambre', wallIds: CHAMBRE.map((w) => w.id) }],
    objects: [],
    openings: [],
    fixtures: [],
  });
  return useScanStore.getState().addObject(item, x, z);
};

const centre = (id: string) => {
  const o = useScanStore.getState().objects.find((x) => x.id === id)!;
  return { x: o.transform[12], z: o.transform[14] };
};

/**
 * Rejoue un glissement : N images, delta cumulé depuis le point d'appui,
 * exactement comme `ObjectDragHandle`.
 */
const glisser = (id: string, dx: number, dz: number, images = 24) => {
  const depart = centre(id);
  for (let i = 1; i <= images; i++) {
    useScanStore
      .getState()
      .setObjectCenter(id, depart.x + (dx * i) / images, depart.z + (dz * i) / images);
  }
  return centre(id);
};

describe('un meuble se glisse et vient buter contre les murs', () => {
  it('se plaque contre le mur nord, à touche-touche', () => {
    const id = poser(LIT, L / 2, P / 2);
    // On pousse loin au-delà du mur : le doigt dépasse toujours.
    const fin = glisser(id, 0, -3);
    // Le lit fait 1,90 de profondeur : son centre s'arrête à 0,95 du nu,
    // donc à 0,95 + la demi-épaisseur du mur de son axe.
    expect(fin.z).toBeCloseTo(1.9 / 2 + WALL_T / 2, 3);
    expect(fin.x).toBeCloseTo(L / 2, 3);
  });

  it('se plaque dans un angle sans jamais entrer dans la maçonnerie', () => {
    const id = poser(LIT, L / 2, P / 2);
    const fin = glisser(id, -3, -3);
    expect(fin.z).toBeCloseTo(1.9 / 2 + WALL_T / 2, 3);
    expect(fin.x).toBeCloseTo(1.4 / 2 + WALL_T / 2, 3);
  });

  it('suit le doigt image par image, sans jamais revenir en arrière', () => {
    const id = poser(LIT, L / 2, P / 2);
    const depart = centre(id);
    const vus: number[] = [];
    for (let i = 1; i <= 20; i++) {
      useScanStore.getState().setObjectCenter(id, depart.x + i * 0.05, depart.z);
      vus.push(centre(id).x);
    }
    // Strictement croissant jusqu'à la butée, et JAMAIS retombé au départ.
    for (let i = 1; i < vus.length; i++) {
      expect(vus[i]).toBeGreaterThanOrEqual(vus[i - 1] - 1e-9);
    }
    expect(vus[vus.length - 1]).toBeGreaterThan(depart.x + 0.3);
  });

  it('garde son angle : le mur ne le redresse plus', () => {
    const id = poser(LIT, L / 2, P / 2);
    useScanStore.getState().setObjectYaw(id, 0.4);
    glisser(id, 0, -3);
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(Math.atan2(o.transform[2], o.transform[0])).toBeCloseTo(0.4, 6);
  });

  it('posé de biais, il bute sur son emprise réelle, pas sur ses côtes', () => {
    const id = poser(LIT, L / 2, P / 2);
    // 10° : de biais, mais l'emprise tient encore entre les deux murs —
    // à 30° elle mesure 2,35 m pour 2,30 m de libre, les deux murs se
    // disputent le lit et la butée n'a plus de sens.
    const yaw = Math.PI / 18;
    useScanStore.getState().setObjectYaw(id, yaw);
    const fin = glisser(id, 0, -3);
    const demi =
      Math.abs(Math.sin(yaw)) * (1.4 / 2) + Math.abs(Math.cos(yaw)) * (1.9 / 2);
    expect(demi).toBeGreaterThan(1.9 / 2); // de biais, il prend plus de place
    expect(fin.z).toBeCloseTo(demi + WALL_T / 2, 3);
  });

  it('ne bouge pas s’il n’y a rien à pousser', () => {
    const id = poser(LIT, L / 2, P / 2);
    const avant = centre(id);
    useScanStore.getState().setObjectCenter(id, avant.x, avant.z);
    expect(centre(id)).toEqual(avant);
  });
});

describe('ce qui ne rentre pas ne se pose pas', () => {
  const contour = [
    { x: 0, z: 0 },
    { x: L, z: 0 },
    { x: L, z: P },
    { x: 0, z: P },
  ];

  it('un lit de 140 tient dans la chambre', () => {
    expect(fitsInRoom({ width: 1.4, depth: 1.9 }, contour)).toBe(true);
  });

  it('un carré de 2,50 n’y tient pas : 2,37 de libre en travers', () => {
    expect(fitsInRoom({ width: 2.5, depth: 2.5 }, contour)).toBe(false);
    // Et la limite se tient au centimètre près, des deux côtés.
    expect(fitsInRoom({ width: 2.3, depth: 2.3 }, contour)).toBe(true);
  });

  it('un meuble long mais étroit y tient en travers', () => {
    // 3,30 de long : ça ne passe que dans le sens de la longueur, donc oui.
    expect(fitsInRoom({ width: 3.3, depth: 0.6 }, contour)).toBe(true);
    expect(fitsInRoom({ width: 3.3, depth: 2.4 }, contour)).toBe(false);
  });
});

describe('la poussée hors des murs, prise isolément', () => {
  const dedans = { x: L / 2, z: P / 2 };

  it('ne déplace pas ce qui est déjà au large', () => {
    const p = pushOutOfWalls(dedans, { width: 0.6, depth: 0.6, yaw: 0 }, CHAMBRE, dedans);
    expect(p.x).toBeCloseTo(dedans.x, 6);
    expect(p.z).toBeCloseTo(dedans.z, 6);
  });

  it('ressort un meuble enfoncé dans un mur', () => {
    const p = pushOutOfWalls(
      { x: L / 2, z: -0.5 },
      { width: 1, depth: 1, yaw: 0 },
      CHAMBRE,
      dedans,
    );
    expect(p.z).toBeCloseTo(0.5 + WALL_T / 2, 3);
  });
});

/**
 * L'AVANT D'UN MEUBLE NE REGARDE PAS LE MUR.
 *
 * Une commode contre une cloison ouvre ses tiroirs vers la pièce, un lit
 * pose sa tête contre le mur, un canapé y adosse son dossier. Le relevé, lui,
 * ne le sait pas : ARKit rend une boîte et un angle, et cet angle vaut aussi
 * bien θ que θ + 180° — rien dans un nuage de points ne distingue l'avant de
 * l'arrière d'un caisson. Une fois sur deux, le meuble sortait dos à la pièce.
 */
describe('l’orientation d’un meuble contre un mur', () => {
  /** Un mur nord (z = 0), la pièce s'étendant vers les z positifs. */
  const MUR: WallSeg = {
    id: 'n',
    type: 'wall',
    a: { x: 0, z: 0 },
    b: { x: 5, z: 0 },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  };
  const commode = (yaw: number): ObjectFootprint => ({
    id: 'o1',
    category: 'storage',
    cx: 2,
    cz: 0.32,
    width: 1,
    depth: 0.5,
    height: 0.9,
    yCenter: 0.45,
    yaw,
  });
  /** L'avant du meuble dans le monde : son côté −z local. */
  const avant = (f: ObjectFootprint) => ({
    x: Math.sin(f.yaw),
    z: -Math.cos(f.yaw),
  });

  it('se retourne quand il ouvre ses tiroirs dans le mur', () => {
    // yaw = 0 : l'avant regarde −z, c'est-à-dire le mur. Demi-tour.
    const corrige = faceIntoRoom(commode(0), [MUR]);
    expect(avant(corrige).z).toBeGreaterThan(0.9);
  });

  it('ne touche à rien quand il regarde déjà la pièce', () => {
    const bon = commode(Math.PI);
    expect(faceIntoRoom(bon, [MUR]).yaw).toBe(bon.yaw);
  });

  it('ne corrige QUE par demi-tour : les cotes ne bougent pas', () => {
    const f = commode(0);
    const corrige = faceIntoRoom(f, [MUR]);
    // Un quart de tour échangerait largeur et profondeur — le meuble ne
    // coïnciderait plus avec ce qui a été mesuré.
    expect(corrige.width).toBe(f.width);
    expect(corrige.depth).toBe(f.depth);
    expect(Math.abs(Math.sin(corrige.yaw - f.yaw))).toBeLessThan(1e-9);
  });

  it('et laisse tranquille un meuble au milieu de la pièce', () => {
    // À deux mètres du mur, une chaise regarde où elle veut : lui imposer
    // un sens serait inventer une information qu'on n'a pas.
    const libre = { ...commode(0), cz: 2 };
    expect(faceIntoRoom(libre, [MUR]).yaw).toBe(0);
  });
});

/**
 * LES FLÈCHES DU BANDEAU — le centimètre demandé à la main.
 *
 * Relevé du chantier : « les flèches en bas ne déplacent pas les meubles ».
 * Elles marchaient pourtant — au large. Contre un mur, non : le plaquage
 * automatique referme tout jour de moins de cinq centimètres, et il reprenait
 * chaque pas d'un centimètre à peine posé. Le meuble revenait se coller, et
 * l'on croyait le bouton mort.
 *
 * C'est justement contre un mur qu'on se sert des flèches : décoller un
 * meuble de deux centimètres pour dégager une plinthe, avancer une table de
 * trois. Une demande explicite au centimètre passe donc AVANT le confort du
 * plaquage — mais la maçonnerie garde le dernier mot : on ne pousse pas un
 * meuble DANS un mur.
 */
describe('les flèches déplacent le meuble au centimètre', () => {
  /** Le geste du bandeau : un pas d'un centimètre, sans aimant. */
  const pas = (id: string, dx: number, dz: number) => {
    const t = useScanStore.getState().objects.find((o) => o.id === id)!.transform;
    useScanStore.getState().setObjectCenter(id, t[12] + dx, t[14] + dz);
    return centre(id);
  };

  it('décolle un meuble plaqué contre un mur, pas à pas', () => {
    const id = poser(LIT, L / 2, P / 2);
    // On le colle au mur nord, puis on le rappelle vers le centre.
    const colle = glisser(id, 0, -3);
    expect(colle.z).toBeCloseTo(1.9 / 2 + WALL_T / 2, 3);
    let vu = colle;
    for (let i = 1; i <= 5; i++) {
      vu = pas(id, 0, 0.01);
      // Chaque pas se voit : sans quoi le bouton paraît mort.
      expect(vu.z).toBeCloseTo(colle.z + i * 0.01, 4);
    }
    expect(vu.z).toBeCloseTo(colle.z + 0.05, 4);
  });

  it('ne pousse pas le meuble DANS la maçonnerie', () => {
    const id = poser(LIT, L / 2, P / 2);
    const colle = glisser(id, 0, -3);
    // Vingt pas vers le mur : il est déjà contre, il n'ira pas plus loin.
    let vu = colle;
    for (let i = 0; i < 20; i++) vu = pas(id, 0, -0.01);
    expect(vu.z).toBeGreaterThanOrEqual(1.9 / 2 + WALL_T / 2 - 1e-6);
  });

  it('marche aussi au large, dans les quatre directions', () => {
    const id = poser(LIT, L / 2, P / 2);
    const d = centre(id);
    expect(pas(id, 0.01, 0).x).toBeCloseTo(d.x + 0.01, 4);
    expect(pas(id, -0.01, 0).x).toBeCloseTo(d.x, 4);
    expect(pas(id, 0, 0.01).z).toBeCloseTo(d.z + 0.01, 4);
    expect(pas(id, 0, -0.01).z).toBeCloseTo(d.z, 4);
  });
});

/**
 * ÉTIRER UN MEUBLE PAR UN CÔTÉ — le geste du mètre ruban.
 *
 * On prend un bord et on le tire ; le bord opposé ne bouge pas. C'est ce
 * qu'on fait avec un mètre sur un chantier, et c'est ce qu'on ne pouvait pas
 * faire dans l'app : il fallait taper une largeur, donc faire le calcul dans
 * sa tête pour que le meuble aille jusqu'au mur.
 *
 * L'aimant fait le reste : à sept centimètres du nu, le bord s'y pose. Viser
 * l'affleurement à trois millimètres près avec un doigt qui en couvre quinze
 * n'est pas un geste humain — et « le meuble touche le mur » décide qu'une
 * prise est accessible ou condamnée.
 */
describe('un meuble s’étire par ses côtés', () => {
  const dims = (id: string) => {
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    return { w: o.width, d: o.depth };
  };
  /**
   * LE GESTE, TEL QUE LA POIGNÉE L'ENVOIE.
   *
   * Elle retient le meuble à l'appui et envoie la distance TOTALE parcourue
   * depuis — jamais un pas relatif. Le banc doit faire pareil, sinon il
   * éprouve un mode que l'application n'emploie plus.
   */
  const tirer = (
    id: string,
    cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
    total: number,
    images = 20,
  ) => {
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    const base = {
      width: o.width,
      depth: o.depth,
      cx: o.transform[12],
      cz: o.transform[14],
    };
    let accroche = false;
    for (let i = 1; i <= images; i++) {
      const r = useScanStore
        .getState()
        .resizeObjectSide(id, cote, (total * i) / images, base);
      accroche = accroche || r.accroche;
    }
    return accroche;
  };

  it('agrandit par un bord et laisse l’autre en place', () => {
    const id = poser(LIT, L / 2, P / 2);
    const c0 = centre(id);
    const bordFixe = c0.x - 1.4 / 2;
    tirer(id, 'largeur+', 0.3);
    expect(dims(id).w).toBeCloseTo(1.7, 2);
    // Le bord opposé n'a pas bougé d'un millimètre.
    expect(centre(id).x - dims(id).w / 2).toBeCloseTo(bordFixe, 3);
    // Et la profondeur n'a pas été touchée.
    expect(dims(id).d).toBeCloseTo(1.9, 3);
  });

  it('rétrécit quand on tire vers l’intérieur', () => {
    const id = poser(LIT, L / 2, P / 2);
    tirer(id, 'largeur+', -0.4);
    expect(dims(id).w).toBeCloseTo(1.0, 2);
  });

  it('ne descend pas sous dix centimètres', () => {
    const id = poser(LIT, L / 2, P / 2);
    tirer(id, 'largeur+', -3);
    expect(dims(id).w).toBeCloseTo(0.1, 3);
  });

  /**
   * L'AIMANT : le bord s'arrête AU NU DU MUR, pas trois centimètres avant.
   *
   * Le lit fait 1,90 de profondeur au milieu d'une pièce de 2,44 : il reste
   * 27 cm de chaque côté. On tire son bord vers le mur nord en s'arrêtant
   * volontairement 4 cm trop court — l'aimant doit finir le geste.
   */
  it('accroche le bord au nu du mur qu’il longe', () => {
    const id = poser(LIT, L / 2, P / 2);
    const jeu = P / 2 - 1.9 / 2 - WALL_T / 2;
    const accroche = tirer(id, 'profondeur-', jeu - 0.04);
    expect(accroche).toBe(true);
    // Le bord tiré affleure le nu : centre − profondeur/2 = WALL_T/2.
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(o.transform[14] - o.depth / 2).toBeCloseTo(WALL_T / 2, 3);
  });

  /**
   * ET IL NE S'ACCROCHE PAS À N'IMPORTE QUOI.
   *
   * Un mur perpendiculaire au bord tiré ne donne aucun affleurement : s'il
   * attirait, le meuble sauterait en travers de la pièce.
   */
  it('ignore les murs qui ne sont pas parallèles au bord', () => {
    const id = poser(LIT, L / 2, P / 2);
    // Le bord de largeur regarde le mur est ; on s'arrête loin de lui.
    const accroche = tirer(id, 'largeur+', 0.2);
    expect(accroche).toBe(false);
    expect(dims(id).w).toBeCloseTo(1.6, 2);
  });
});

/**
 * ALIGNER UN MEUBLE SUR LE BOUT D'UN MUR.
 *
 * Relevé du chantier, capture à l'appui : « en haut du meuble, on est contre
 * une fin de mur et pourtant pas d'alignement avec notre fin de meuble ».
 * L'aimant ne savait faire qu'une chose — coller un bord au nu d'un mur
 * PARALLÈLE. Or on aligne tout autant un meuble sur l'ABOUT d'une cloison :
 * le retour d'un mur, le jambage d'une porte, le bout d'un refend. Le meuble
 * arrive alors à fleur du passage, et c'est ce qu'on cherche à l'œil en le
 * poussant contre le coin.
 */
describe('le bord s’aligne sur le bout d’un mur', () => {
  /** La chambre, plus un refend qui descend du mur nord et s'arrête net. */
  const AVEC_REFEND: WallSeg[] = [
    ...CHAMBRE,
    mur('refend', 2.2, 0, 2.2, 1.2),
  ];
  const poserLa = (x: number, z: number) => {
    useScanStore.setState({
      walls: AVEC_REFEND,
      rooms: [{ id: 'r1', name: 'Chambre', wallIds: AVEC_REFEND.map((w) => w.id) }],
      objects: [],
      openings: [],
      fixtures: [],
    });
    return useScanStore.getState().addObject(
      { key: 'meuble', label: 'Meuble', w: 0.6, d: 1, h: 0.8, category: 'storage' },
      x,
      z,
    );
  };
  /**
   * LE GESTE, TEL QUE LA POIGNÉE L'ENVOIE.
   *
   * Elle retient le meuble à l'appui et envoie la distance TOTALE parcourue
   * depuis — jamais un pas relatif. Le banc doit faire pareil, sinon il
   * éprouve un mode que l'application n'emploie plus.
   */
  const tirer = (
    id: string,
    cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
    total: number,
    images = 20,
  ) => {
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    const base = {
      width: o.width,
      depth: o.depth,
      cx: o.transform[12],
      cz: o.transform[14],
    };
    let accroche = false;
    for (let i = 1; i <= images; i++) {
      const r = useScanStore
        .getState()
        .resizeObjectSide(id, cote, (total * i) / images, base);
      accroche = accroche || r.accroche;
    }
    return accroche;
  };
  const bordDe = (id: string, sens: -1 | 1) => {
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    return o.transform[14] + (sens * o.depth) / 2;
  };

  /**
   * Le refend s'arrête à 1,20 m. On tire le bord haut du meuble vers lui en
   * s'arrêtant volontairement quatre centimètres trop court : l'aimant doit
   * finir le geste, et le meuble arriver À FLEUR du passage.
   */
  it('finit le geste quand le bord arrive près de l’about', () => {
    const id = poserLa(2.6, 2);
    const haut = bordDe(id, -1);
    // Ce qui manque pour atteindre le bout du refend, moins quatre
    // centimètres : c'est là que le doigt s'arrête.
    const aParcourir = haut - 1.2 - 0.04;
    const accroche = tirer(id, 'profondeur-', aParcourir);
    expect(accroche).toBe(true);
    expect(bordDe(id, -1)).toBeCloseTo(1.2, 3);
  });

  /**
   * ET IL N'ATTIRE PAS DE LOIN.
   *
   * Un bout de mur à l'autre bout de la pièce, même bien orienté, ne doit
   * pas tirer le meuble à travers le logement : il faut qu'il soit EN
   * REGARD du bord.
   */
  it('ignore un about qui n’est pas en face du bord', () => {
    // Le meuble est loin du refend sur l'axe des x : son bord ne le
    // rencontre jamais.
    const id = poserLa(0.5, 2);
    const haut = bordDe(id, -1);
    const accroche = tirer(id, 'profondeur-', haut - 1.2 - 0.04);
    expect(accroche).toBe(false);
    // Il s'est agrandi de ce qu'on a demandé, sans un centimètre de plus.
    expect(bordDe(id, -1)).toBeCloseTo(1.24, 2);
  });
});

/**
 * CE QUI SE PASSAIT QUAND ON AGRANDISSAIT UN MEUBLE CONTRE UN MUR.
 *
 * Enregistrement d'écran du chantier : un meuble de 0,73 m plaqué au mur,
 * qu'on étire — il passe à 0,44, puis saute à 1,53, puis 1,93, en traversant
 * la maçonnerie, et finit ailleurs dans la pièce.
 *
 * Deux fautes, et la seconde explique les sauts :
 *
 * 1. **Rien n'arrêtait le geste.** Le redimensionnement ne consultait aucun
 *    mur : on tirait, le meuble entrait dans la cloison, et le plan montrait
 *    un caisson au milieu du béton.
 * 2. **Chaque image repartait de la précédente.** Les pas étaient RELATIFS :
 *    l'image suivante s'appuyait sur une taille déjà corrigée par l'aimant,
 *    et la correction se rajoutait à la suivante. Une accroche de trois
 *    centimètres devenait un mètre en trente images.
 */
describe('agrandir un meuble contre un mur', () => {
  const poserLa = (x: number, z: number, w = 0.6, d = 0.4) => {
    useScanStore.setState({
      walls: CHAMBRE,
      rooms: [{ id: 'r1', name: 'Chambre', wallIds: CHAMBRE.map((m) => m.id) }],
      objects: [],
      openings: [],
      fixtures: [],
    });
    return useScanStore.getState().addObject(
      { key: 'meuble', label: 'Meuble', w, d, h: 0.8, category: 'storage' },
      x,
      z,
    );
  };
  const etat = (id: string) => {
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    return { w: o.width, d: o.depth, cx: o.transform[12], cz: o.transform[14] };
  };
  /** Le geste réel : ancré à l'appui, distance totale à chaque image. */
  const geste = (
    id: string,
    cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
    total: number,
    images: number,
  ) => {
    const o = etat(id);
    const base = { width: o.w, depth: o.d, cx: o.cx, cz: o.cz };
    for (let i = 1; i <= images; i++) {
      useScanStore
        .getState()
        .resizeObjectSide(id, cote, (total * i) / images, base);
    }
    return etat(id);
  };

  /**
   * LE MÊME GESTE DONNE LE MÊME MEUBLE, quelle que soit la cadence.
   *
   * C'est l'invariant que la dérive violait : à doigt égal, le résultat
   * dépendait du nombre d'images — donc de la charge du téléphone.
   */
  it('ne dérive pas avec le nombre d’images', () => {
    // Un AGRANDISSEMENT au large : ni butée, ni minimum, rien qui masque la
    // dérive en saturant des deux côtés.
    const a = poserLa(1.7, 1.2);
    const lent = geste(a, 'profondeur+', 0.4, 5);
    const b = poserLa(1.7, 1.2);
    const vif = geste(b, 'profondeur+', 0.4, 120);
    expect(lent.d).toBeCloseTo(0.8, 3);
    expect(vif.d).toBeCloseTo(lent.d, 6);
    expect(vif.cz).toBeCloseTo(lent.cz, 6);
  });

  /**
   * ET LA MAÇONNERIE ARRÊTE LE GESTE.
   *
   * Le meuble est contre le mur nord ; on tire son bord vers ce mur, loin
   * au-delà. Il doit s'arrêter AU NU, pas le traverser.
   */
  it('bute sur le mur au lieu de le traverser', () => {
    const id = poserLa(L / 2, 1.2, 0.6, 0.4);
    // On le colle d'abord au mur nord.
    const colle = glisser(id, 0, -3);
    expect(colle.z).toBeCloseTo(0.4 / 2 + WALL_T / 2, 2);
    // Puis on tire le bord haut DANS le mur, d'un mètre.
    const apres = geste(id, 'profondeur-', 1, 30);
    const bordHaut = apres.cz - apres.d / 2;
    // Le bord s'arrête au nu : jamais au-delà, à un millimètre près.
    expect(bordHaut).toBeGreaterThanOrEqual(WALL_T / 2 - 0.001);
  });

  /**
   * SANS JAMAIS ÉCRASER LE MEUBLE.
   *
   * Une butée mal posée aurait ramené la cote au minimum de dix
   * centimètres : le meuble aurait disparu sous le doigt.
   */
  it('garde une taille utile quand il bute', () => {
    const id = poserLa(L / 2, 1.2, 0.6, 0.4);
    glisser(id, 0, -3);
    const apres = geste(id, 'profondeur-', 1, 30);
    expect(apres.d).toBeGreaterThan(0.3);
  });

  /** Et le bord opposé reste où il est, même en butée. */
  it('laisse le bord opposé en place', () => {
    const id = poserLa(L / 2, 1.2, 0.6, 0.4);
    const avant = etat(id);
    const bordBas = avant.cz + avant.d / 2;
    const apres = geste(id, 'profondeur-', 0.5, 30);
    expect(apres.cz + apres.d / 2).toBeCloseTo(bordBas, 3);
  });
});
