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
import { WALL_T, type WallSeg } from '../src/geometry/floorplan';
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
  // Le magasin SURVIT d'un banc à l'autre : on repart d'un séjour neuf.
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
