/**
 * LE MEUBLE NE SE FAIT PLUS ASPIRER : IL SE COGNE.
 *
 * Releve du patron : « peaufine les meubles et sa physique, enleve
 * l'attraction mais mets une collision intelligente (pas colle au mur,
 * recadre si depasse de la zone surface, etc) ».
 *
 * TROIS VERSIONS DE CE GESTE, ET CHACUNE CORRIGEAIT LA PRECEDENTE.
 *
 *   1. LA GEOMETRIE DISPOSAIT. Le meuble etait contraint A CHAQUE IMAGE :
 *      rabattu hors des murs, retourne pour entrer dans une niche, rabote
 *      pour tenir dans un recoin. Trois aides defendables seules, ensemble
 *      un meuble qui glisse tout seul sous le doigt.
 *   2. LE DOIGT COMMANDAIT, ET UN AIMANT DE 25 cm RATTRAPAIT. Le meuble
 *      suivait exactement, murs compris ; lache pres d'un mur, il s'y
 *      collait. Lache DANS un mur, il sautait a la derniere position qui
 *      tenait — parfois quarante centimetres en arriere, sans qu'on
 *      comprenne pourquoi.
 *   3. CELLE-CI : LE DOIGT COMMANDE, LE MUR ARRETE. Plus aucune attraction.
 *      Pendant le geste le meuble suit le doigt a travers la cloison (rouge
 *      sur la maconnerie) ; AU LACHE, il se range : il ressort du mur par le
 *      plus court chemin, il revient dans la surface de la piece s'il en
 *      depasse, et il ne s'assoit pas sur un autre meuble du meme etage.
 *
 * CE QUI FAIT LA DIFFERENCE ENTRE UN AIMANT ET UNE COLLISION : l'aimant
 * DEPLACE ce qui ne le demandait pas — un meuble lache a cinquante
 * centimetres du mur y sautait —, la collision ne fait que REFUSER une place
 * impossible. D'ou le contrôle en sens inverse dans chaque epreuve : on
 * verifie autant que le meuble RESTE ou on le pose qu'il SORT d'ou il ne
 * peut pas etre. Sans ce contrôle, une simple remise au centre de la piece
 * passerait toutes les epreuves de collision.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { poserLibre } from '../src/geometry/poser';
import { WALL_T, type Pt, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();

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
  roomId: 'r1',
});

/** Un sejour de 5 x 4, mur nord en z = 0. Le nu interieur est en z = 0,07. */
const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
/** Le nu du mur nord, vu de l'interieur. */
const NU = WALL_T / 2;

/** Une commode de 1,20 x 0,45, droite. */
const MEUBLE = { width: 1.2, depth: 0.45, yaw: 0 };
const COMMODE = {
  id: 'c1',
  roomId: 'r1',
  category: 'storage',
  width: 1.2,
  baseWidth: 1.2,
  depth: 0.45,
  baseDepth: 0.45,
  height: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0.4, 2, 1],
};

/** Où est le meuble `id` ? */
const ou = (id = 'c1') => {
  const o = st().objects.find((x) => x.id === id)!;
  return { x: o.transform[12], z: o.transform[14] };
};

beforeEach(() => {
  mockMagasin.clear();
  /*
    LE MAGASIN SURVIT D'UN BANC A L'AUTRE — et son HISTORIQUE aussi.

    L'historique est de portee MODULE : `setState` ne le touche pas. Une
    epreuve qui annule remontait donc dans le plan d'une epreuve
    precedente, et rendait une position venue de nulle part. `reset()` est
    le seul geste qui efface le filet.
  */
  useScanStore.getState().reset();
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [{ ...COMMODE }] as never,
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
  });
});

describe('pendant le geste, plus rien n’attire', () => {
  it('le meuble lâché à cinquante centimètres du mur y RESTE', () => {
    // L'aimant de 25 cm le collait au nu : il sautait de 0,50 à 0,295.
    // Cinquante centimètres derrière une commode, c'est peut-être un
    // radiateur, un coffrage, une porte qui bat — ce n'est pas au plan de
    // décider que c'est une erreur de visée.
    const p = poserLibre({ x: 2.5, z: 0.5 }, MEUBLE, MURS);
    expect(p.centre.x).toBeCloseTo(2.5, 3);
    expect(p.centre.z).toBeCloseTo(0.5, 3);
  });

  it('et à huit centimètres du nu, il y reste aussi', () => {
    // Le pire cas de l'ancien aimant : tout près, il collait sans qu'on
    // puisse s'y opposer. Le jeu lâché est le jeu gardé.
    const p = poserLibre({ x: 2.5, z: NU + 0.08 + MEUBLE.depth / 2 }, MEUBLE, MURS);
    expect(p.centre.z).toBeCloseTo(NU + 0.08 + MEUBLE.depth / 2, 3);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE — sans lui, cette suite passerait tout aussi
    bien si `poserLibre` s'était mis à ne plus rien dire du tout. Le refus
    est ce qui fait le halo rouge sous le doigt : il doit survivre au retrait
    de l'aimant.
  */
  it('mais il dit toujours NON quand il chevauche la maçonnerie', () => {
    const p = poserLibre({ x: 2.5, z: 0.12 }, MEUBLE, MURS);
    expect(p.valide).toBe(false);
  });

  it('et il traverse encore les murs tant qu’on le tient', () => {
    const p = poserLibre({ x: 2.5, z: -1 }, MEUBLE, MURS);
    expect(p.centre.z).toBeCloseTo(-1, 3);
  });
});

describe('au lâcher, le mur arrête — il n’aspire pas', () => {
  it('un meuble lâché à cheval sur le mur en ressort, dos au nu', () => {
    st().rangerMeuble('c1', 2.5, 0.12);
    const p = ou();
    // Il est ressorti du bon côté : celui où le doigt l'a amené, l'intérieur.
    expect(p.z).toBeGreaterThan(0.12);
    // Et il s'arrête AU CONTACT : sa face arrière sur le nu, jeu nul.
    expect(p.z - MEUBLE.depth / 2).toBeCloseTo(NU, 2);
    // Sans dériver sur le côté : un mur ne pousse que perpendiculairement.
    expect(p.x).toBeCloseTo(2.5, 3);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE, et c'est LE contrôle de tout ce lot : une
    fonction qui replacerait bêtement chaque meuble contre le mur le plus
    proche passerait l'épreuve du dessus. Au large, on ne touche à RIEN.
  */
  it('au large, il ne bouge pas d’un millimètre', () => {
    st().rangerMeuble('c1', 3.2, 2.6);
    expect(ou()).toEqual({ x: 3.2, z: 2.6 });
  });

  it('et le jeu volontaire de vingt centimètres est respecté', () => {
    const z = NU + 0.2 + MEUBLE.depth / 2;
    st().rangerMeuble('c1', 2.5, z);
    expect(ou().z).toBeCloseTo(z, 3);
  });
});

describe('au lâcher, ce qui dépasse de la pièce y revient', () => {
  it('un meuble lâché dehors est recadré dans la surface', () => {
    // Le doigt est parti franchement au-delà du mur nord — on a voulu le
    // pousser contre, et on a visé trop loin. Il revient dans la pièce.
    st().rangerMeuble('c1', 2.5, -1);
    const p = ou();
    expect(p.z).toBeGreaterThanOrEqual(NU + MEUBLE.depth / 2 - 0.01);
    expect(p.z).toBeLessThan(4 - NU - MEUBLE.depth / 2 + 0.01);
  });

  it('même par un angle, où il s’échappait autrefois', () => {
    // Visé au-delà du coin nord-ouest : aucun des deux murs ne l'a « en
    // face », et il filait par la diagonale.
    st().rangerMeuble('c1', -1, -1);
    const p = ou();
    expect(p.x).toBeGreaterThanOrEqual(NU + MEUBLE.width / 2 - 0.01);
    expect(p.z).toBeGreaterThanOrEqual(NU + MEUBLE.depth / 2 - 0.01);
  });

  /* Le contrôle en sens inverse : dedans, on ne recadre rien. */
  it('mais un meuble déjà dans la pièce n’est pas recentré', () => {
    st().rangerMeuble('c1', 1.1, 3.1);
    expect(ou()).toEqual({ x: 1.1, z: 3.1 });
  });
});

describe('au lâcher, un meuble ne s’assoit pas sur un autre', () => {
  const CANAPE = {
    id: 'k1',
    roomId: 'r1',
    category: 'sofa',
    width: 2,
    baseWidth: 2,
    depth: 0.9,
    baseDepth: 0.9,
    height: 0.8,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0.4, 2, 1],
  };

  it('la commode lâchée sur le canapé en ressort', () => {
    useScanStore.setState({
      objects: [{ ...COMMODE }, { ...CANAPE }] as never,
    });
    st().rangerMeuble('c1', 2.5, 2);
    const p = ou();
    // Les deux emprises sont droites : elles se séparent dès que l'écart
    // vaut la somme des deux demi-côtés sur un axe.
    const ecartZ = Math.abs(p.z - 2) - (MEUBLE.depth + CANAPE.depth) / 2;
    const ecartX = Math.abs(p.x - 2.5) - (MEUBLE.width + CANAPE.width) / 2;
    expect(Math.max(ecartZ, ecartX)).toBeGreaterThanOrEqual(-0.005);
  });

  /*
    ET QUAND LE PLUS COURT CHEMIN NE MÈNE NULLE PART, IL SORT DE L'AUTRE CÔTÉ.

    Relevé fait à l'image sur le vrai code : un canapé de 2 x 0,90 posé le
    long du mur sud laisse vingt-huit centimètres derrière lui. La commode en
    fait quarante-cinq. Lâchée sur le canapé, elle sortait PAR LE SUD — le
    côté le plus court, celui qui dérange le moins la position visée — puis
    le mur la renvoyait dans le canapé, et personne ne repassait. Elle
    finissait à cheval sur les deux.

    Deux passes de collision ne suffisent pas à voir ça : chacune fait bien
    son travail, et c'est leur ENCHAÎNEMENT qui échoue. Il faut essayer les
    autres sorties et garder celle qui tient vraiment — au nord du canapé,
    ici, où toute la pièce est libre.
  */
  it('sort par l’autre côté quand le plus court est bouché', () => {
    const CONTRE_LE_MUR = {
      ...CANAPE,
      // Le canapé est plaqué au mur sud : il ne reste que 28 cm derrière lui.
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.6, 0.4, 3.2, 1],
    };
    useScanStore.setState({
      objects: [{ ...COMMODE }, CONTRE_LE_MUR] as never,
    });
    st().rangerMeuble('c1', 1.6, 3.2);
    const p = ou();
    // Elle est passée DEVANT le canapé, pas coincée derrière.
    expect(p.z).toBeLessThan(3.2);
    // Et elle ne le chevauche plus : les deux emprises sont droites.
    const ecartZ = Math.abs(p.z - 3.2) - (MEUBLE.depth + CANAPE.depth) / 2;
    const ecartX = Math.abs(p.x - 1.6) - (MEUBLE.width + CANAPE.width) / 2;
    expect(Math.max(ecartZ, ecartX)).toBeGreaterThanOrEqual(-0.005);
    // Ni le mur sud : elle est restée entière dans la pièce.
    expect(p.z + MEUBLE.depth / 2).toBeLessThanOrEqual(4 - NU + 0.005);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE : une télé SE POSE sur un meuble bas. La
    collision qui l'interdirait serait une régression, pas une amélioration
    — c'est le cas qui distingue une vraie physique d'un simple « rien ne se
    touche ».
  */
  it('mais une télé posée SUR un meuble bas y reste', () => {
    const TELE = {
      id: 't1',
      roomId: 'r1',
      category: 'television',
      width: 1.1,
      baseWidth: 1.1,
      depth: 0.1,
      baseDepth: 0.1,
      height: 0.6,
      // Son dessous est à 0,80 m : le dessus du meuble bas.
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 1.1, 2, 1],
    };
    useScanStore.setState({
      objects: [{ ...CANAPE }, { ...TELE }] as never,
    });
    st().rangerMeuble('t1', 2.5, 2);
    expect(ou('t1')).toEqual({ x: 2.5, z: 2 });
  });
});

describe('un meuble qui change de pièce change d’étiquette', () => {
  /*
    LE DÉFAUT QUE LE NOUVEAU GESTE A RENDU VISIBLE.

    Traverser une cloison pour changer une commode de pièce est LE geste que
    le doigt sait faire — c'est le relevé d'origine, « on doit pouvoir les
    placer n'importe où, même traverser les murs ». Mais le meuble gardait le
    `roomId` de son ancienne pièce : il était dessiné dans le séjour et
    compté dans la chambre.

    Ce n'est pas qu'une étiquette. C'est CE QUI FAIT LA COLLISION : les
    voisins qui repoussent sont ceux de la même pièce. Un meuble mal étiqueté
    se cognait donc aux meubles de la pièce d'à côté — à travers le mur — et
    traversait sans rien sentir ceux qui étaient réellement autour de lui.

    Il se ré-étiquette au lâcher, sur la pièce où il ATTERRIT.
  */
  const DEUX_PIECES: WallSeg[] = [
    // Le séjour, 4 x 3, à gauche.
    { ...mur('a1', 0, 0, 4, 0) },
    { ...mur('a2', 4, 0, 4, 3) },
    { ...mur('a3', 4, 3, 0, 3) },
    { ...mur('a4', 0, 3, 0, 0) },
    // La chambre, 4 x 3, de l'autre côté de la cloison en x = 4.
    { ...mur('b1', 4, 0, 8, 0), roomId: 'r2' },
    { ...mur('b2', 8, 0, 8, 3), roomId: 'r2' },
    { ...mur('b3', 8, 3, 4, 3), roomId: 'r2' },
    { ...mur('b4', 4, 3, 4, 0), roomId: 'r2' },
  ];

  beforeEach(() => {
    useScanStore.setState({
      walls: DEUX_PIECES,
      openings: [],
      objects: [
        {
          ...COMMODE,
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.4, 1.5, 1],
        },
      ] as never,
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null },
        { id: 'r2', name: 'Chambre', floor: null },
      ] as never,
    });
  });

  it('la commode poussée dans la chambre appartient à la chambre', () => {
    st().rangerMeuble('c1', 6, 1.5);
    expect(st().objects[0].roomId).toBe('r2');
    // Et elle est bien arrivée : la cloison ne l'a pas renvoyée au séjour.
    expect(ou().x).toBeGreaterThan(4);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE : déplacée CHEZ ELLE, elle garde son
    étiquette. Une ré-étiquette systématique — ou remise à vide — passerait
    l'épreuve du dessus sans rien valoir.
  */
  it('mais déplacée chez elle, elle garde la sienne', () => {
    st().rangerMeuble('c1', 1.2, 2.2);
    expect(st().objects[0].roomId).toBe('r1');
  });

  it('et lâchée dans un plan sans pièce, elle ne perd pas la sienne', () => {
    useScanStore.setState({ rooms: [] as never });
    st().rangerMeuble('c1', 2.4, 1.6);
    expect(st().objects[0].roomId).toBe('r1');
  });
});

describe('un glissement, une annulation', () => {
  /*
    LE DEFAUT QUE LE RANGEMENT AU LACHER A INTRODUIT.

    L'historique fusionne les etats d'un geste CONTINU — un mur qu'on fait
    glisser envoie cinquante etats par seconde, et sans la fusion il faudrait
    cinquante annulations pour revenir en arriere d'un seul geste. Les gestes
    continus se reconnaissent a leur cle, qui designe l'objet manipule :
    `moveObject:o1`.

    `rangerMeuble` poussait sous une cle a lui, `rangerMeuble:o1`. Un
    glissement au doigt coutait donc DEUX annulations — et la premiere
    ramenait le meuble la ou le doigt l'avait lache, c'est-a-dire, une fois
    sur deux, DANS un mur. « Annuler » rendait une position que
    l'application refuse elle-meme de produire.

    Le lacher est la QUEUE du glissement, pas un geste de plus : il porte
    donc la meme cle, et fusionne avec lui.
  */
  it('le glissement et son rangement ne font qu’une seule annulation', () => {
    const depart = { ...ou() };
    // Le doigt glisse — trois images, comme le PanResponder les envoie —
    // puis lache dans la maconnerie du mur nord.
    st().setObjectCenter('c1', 2.5, 1.4, true, true);
    st().setObjectCenter('c1', 2.5, 0.7, true, true);
    st().setObjectCenter('c1', 2.5, 0.12, true, true);
    st().rangerMeuble('c1', 2.5, 0.12);
    expect(ou().z).not.toBeCloseTo(depart.z, 2);
    st().undo();
    expect(ou().x).toBeCloseTo(depart.x, 3);
    expect(ou().z).toBeCloseTo(depart.z, 3);
  });

  /*
    LE CONTROLE EN SENS INVERSE : deux glissements restent deux gestes. Une
    fusion trop large avalerait le precedent, et « Annuler » deferait deux
    deplacements d'un coup — le defaut exactement symetrique.
  */
  it('mais deux glissements se defont l’un apres l’autre', () => {
    const depart = { ...ou() };
    st().setObjectCenter('c1', 2.5, 1.4, true, true);
    st().rangerMeuble('c1', 2.5, 1.4);
    const apresLePremier = { ...ou() };
    // Le second geste, plus tard : l'historique ne les confond pas.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    st().setObjectCenter('c1', 3.6, 1.4, true, true);
    st().rangerMeuble('c1', 3.6, 1.4);
    st().undo();
    expect(ou().x).toBeCloseTo(apresLePremier.x, 3);
    st().undo();
    expect(ou().x).toBeCloseTo(depart.x, 3);
    jest.restoreAllMocks();
  });
});

/*
  LA SONDE : MILLE LÂCHERS SUR UN VRAI RELEVÉ.

  Les épreuves ci-dessus décrivent chacune un cas qu'on a su nommer. Celle-ci
  ne nomme rien : elle lâche un buffet sur une grille couvrant tout le plan de
  référence — murs de travers, alcôves, angles rentrants, pièces déjà meublées
  — et compte les positions IMPOSSIBLES. C'est ce qui attrape ce qu'on n'a pas
  pensé à écrire.

  ET ELLE PORTE SON CONTRÔLE EN SENS INVERSE, qui est ici la moitié la plus
  importante : une sonde qui ne trouve jamais rien peut être une sonde aveugle.
  On mesure donc AUSSI le même plan sans rangement — le point brut du doigt —
  et l'on exige qu'elle y trouve des fautes en nombre. Si les deux comptes
  tombaient à zéro, ce ne serait pas une preuve : ce serait un instrument cassé.
*/
describe('mille lâchers sur le plan de référence', () => {
  const {
    SNAPSHOT_OPENINGS,
    SNAPSHOT_ROOMS,
    SNAPSHOT_WALLS,
  } = require('../src/export/snapshotFixture');
  const { roomParts } = require('../src/geometry/floorplan');
  const { pointInPolygon } = require('../src/geometry/appearance');

  /** Un buffet de 90 x 50. */
  const BW = 0.9;
  const BD = 0.5;

  const coinsDe = (c: { x: number; z: number }, yaw: number) => {
    const co = Math.cos(yaw);
    const si = Math.sin(yaw);
    return [
      [-BW / 2, -BD / 2],
      [BW / 2, -BD / 2],
      [BW / 2, BD / 2],
      [-BW / 2, BD / 2],
    ].map(([lx, lz]) => ({
      x: c.x + lx * co - lz * si,
      z: c.z + lx * si + lz * co,
    }));
  };

  /** L'emprise mord-elle la bande de maçonnerie d'un mur ? */
  const mordUnMur = (c: { x: number; z: number }, yaw: number) =>
    (SNAPSHOT_WALLS as WallSeg[]).some((w) => {
      if (w.type !== 'wall') return false;
      const dx = w.b.x - w.a.x;
      const dz = w.b.z - w.a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const cs = coinsDe(c, yaw);
      const ts = cs.map(
        (p) => ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / (len * len),
      );
      if (Math.max(...ts) < 0 || Math.min(...ts) > 1) return false;
      const ds = cs.map((p) => (p.x - w.a.x) * nx + (p.z - w.a.z) * nz);
      // Deux millimètres de tolérance : un meuble posé AU nu n'est pas dedans.
      return (
        Math.min(...ds) < NU - 0.002 && Math.max(...ds) > -NU + 0.002
      );
    });

  const rooms = SNAPSHOT_ROOMS.map((r: { id: string }, i: number) => ({
    id: r.id,
    name: `Pièce ${i + 1}`,
    floor: null,
  }));

  /**
   * Lâche le buffet sur toute la grille et compte les positions impossibles.
   *
   * `ranger` vaut `false` pour le contrôle en sens inverse : on garde alors le
   * point brut du doigt, celui que l'écran montre en rouge.
   */
  const balayer = (yaw: number, ranger: boolean) => {
    const parts = roomParts(SNAPSHOT_WALLS, rooms);
    const xs = (SNAPSHOT_WALLS as WallSeg[]).flatMap((w) => [w.a.x, w.b.x]);
    const zs = (SNAPSHOT_WALLS as WallSeg[]).flatMap((w) => [w.a.z, w.b.z]);
    const x0 = Math.min(...xs) - 1;
    const x1 = Math.max(...xs) + 1;
    const z0 = Math.min(...zs) - 1;
    const z1 = Math.max(...zs) + 1;
    const co = Math.cos(yaw);
    const si = Math.sin(yaw);
    let dansUnMur = 0;
    let horsDeToutePiece = 0;
    let n = 0;
    for (let i = 0; i <= 16; i++) {
      for (let j = 0; j <= 16; j++) {
        const x = x0 + ((x1 - x0) * i) / 16;
        const z = z0 + ((z1 - z0) * j) / 16;
        useScanStore.setState({
          walls: SNAPSHOT_WALLS,
          openings: SNAPSHOT_OPENINGS,
          rooms: rooms as never,
          objects: [
            {
              id: 'b1',
              roomId: parts[0].roomId,
              category: 'storage',
              width: BW,
              baseWidth: BW,
              depth: BD,
              baseDepth: BD,
              height: 0.9,
              transform: [co, 0, si, 0, 0, 1, 0, 0, -si, 0, co, 0,
                parts[0].labelAt.x, 0.45, parts[0].labelAt.z, 1],
            },
            // Chaque pièce reçoit un gros meuble : le buffet doit composer
            // avec eux, pas seulement avec les murs.
            ...parts.slice(0, 6).map((p: { roomId: string; labelAt: Pt }, k: number) => ({
              id: `v${k}`,
              roomId: p.roomId,
              category: 'sofa',
              width: 1.6,
              baseWidth: 1.6,
              depth: 0.8,
              baseDepth: 0.8,
              height: 0.8,
              transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
                p.labelAt.x, 0.4, p.labelAt.z, 1],
            })),
          ] as never,
        });
        if (ranger) st().rangerMeuble('b1', x, z);
        else st().setObjectCenter('b1', x, z, true, true);
        const p = ou('b1');
        n++;
        if (mordUnMur(p, yaw)) dansUnMur++;
        if (
          !parts.some((q: { surface: { pts: Pt[] } | null }) =>
            pointInPolygon(p, q.surface?.pts ?? []),
          )
        ) {
          horsDeToutePiece++;
        }
      }
    }
    return { n, dansUnMur, horsDeToutePiece };
  };

  it('aucun ne finit dans un mur ni hors de toute pièce, droit', () => {
    const r = balayer(0, true);
    expect(r.n).toBe(289);
    expect({ dansUnMur: r.dansUnMur, hors: r.horsDeToutePiece }).toEqual({
      dansUnMur: 0,
      hors: 0,
    });
  });

  it('ni de biais, où les projections comptent autrement', () => {
    // Trente degrés : un meuble de biais occupe sa diagonale, et c'est le cas
    // qui a fait rebondir les anciennes aides sur les murs.
    const r = balayer(Math.PI / 6, true);
    expect({ dansUnMur: r.dansUnMur, hors: r.horsDeToutePiece }).toEqual({
      dansUnMur: 0,
      hors: 0,
    });
  });

  /*
    LE CONTRÔLE EN SENS INVERSE — la moitié qui compte.

    Sans rangement, le buffet reste où le doigt l'a lâché. La sonde DOIT y
    trouver des fautes en nombre : c'est ce qui prouve qu'elle sait en voir,
    et donc que les deux zéros ci-dessus disent quelque chose.
  */
  it('et la sonde sait voir une faute : sans rangement, il y en a des dizaines', () => {
    const r = balayer(0, false);
    expect(r.dansUnMur).toBeGreaterThan(20);
    expect(r.horsDeToutePiece).toBeGreaterThan(50);
  });
});
