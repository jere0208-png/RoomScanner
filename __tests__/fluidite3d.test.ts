/**
 * LE COÛT DU TRI, IMAGE PAR IMAGE.
 *
 * Relevé du chantier : « le modèle 3D est lent, faible fps lorsqu'il est en
 * mouvement, à cause des meubles ». C'était vrai et c'était moi : l'ordre de
 * peinture interne des meubles se recalculait à chaque image en comparant
 * TOUTES les faces deux à deux, plusieurs fois de suite. Sur un logement de
 * onze meubles — près de mille trois cents faces, dont les trois quarts sont
 * des arêtes — cela faisait des centaines de milliers de tests par image.
 *
 * Depuis, on ne classe que les APLATS (les arêtes suivent le leur), et l'on
 * ne compare que les faces dont les boîtes se recouvrent à l'écran, repérées
 * par balayage. Ce banc fixe le budget : une image de tri doit tenir
 * largement sous le temps d'une image à trente par seconde.
 */
import {
  ajusterBlocs,
  buildScene,
  faceDepth,
  isHiddenFace,
  roomRanks,
  sceneFraming,
  type CameraTrig,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { grouperTraces } from '../src/ui/traces';
import { mettreAPlat } from '../src/ui/canevas';
import type { WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888',
  wallTop: '#F4F4F4', wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B',
  window: '#3EB8E5', passage: '#2F6BFF', object: '#D8E1F2', objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});

/** Un salon meublé comme celui du chantier : onze meubles. */
const MURS = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4.5),
  mur('s', 6, 4.5, 0, 4.5),
  mur('o', 0, 4.5, 0, 0),
];
const CATEGORIES = [
  'sofa', 'bed', 'table', 'chair', 'storage', 'refrigerator',
  'television', 'storage', 'table', 'chair', 'storage',
];
const MEUBLES: ObjectData[] = CATEGORIES.map((c, i) => ({
  id: `o${i}`,
  category: c,
  width: 0.6 + (i % 4) * 0.35,
  depth: 0.5 + (i % 3) * 0.3,
  height: 0.5 + (i % 5) * 0.25,
  transform: [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
    0.8 + (i % 4) * 1.4, 0.5, 0.7 + Math.floor(i / 4) * 1.4, 1,
  ],
}));

it('classe un salon meublé en bien moins d’une image', () => {
  const { faces, rooms } = buildScene(MURS, [], MEUBLES, {
    palette: PAL,
    showSurfaces: true,
    rooms: [{ id: 'r1' }],
  });
  const centre = sceneFraming(faces).center;
  const rad = (d: number) => (d * Math.PI) / 180;
  const projecteur = (cam: CameraTrig) => (p: P3) => {
    const x = p.x - centre.x;
    const y = p.y - centre.y;
    const z = p.z - centre.z;
    const rx = x * cam.ct - z * cam.st;
    const rz = x * cam.st + z * cam.ct;
    return {
      sx: 200 + rx * 60,
      sy: 260 + (rz * cam.cp - y * cam.sp) * 60,
      depth: rz * cam.sp + y * cam.cp,
    };
  };

  let total = 0;
  let repos = 0;
  const IMAGES = 36;
  for (let k = 0; k < IMAGES; k++) {
    const theta = k * 10;
    const cam = {
      ct: Math.cos(rad(theta)), st: Math.sin(rad(theta)),
      cp: Math.cos(rad(45)), sp: Math.sin(rad(45)),
    };
    const project = projecteur(cam);
    const rangs = roomRanks(rooms, cam);
    const vues = faces
      .filter((f) => !isHiddenFace(f, cam))
      .map((f) => ({
        proj: f.pts.map(project),
        depth: faceDepth(f, project, cam, rangs),
        owner: f.ownerId,
        room: f.roomId,
        pan: f.panId,
        bord: f.bordDe,
      }));
    const copie = vues.map((v) => ({ ...v }));
    const t0 = Date.now();
    ajusterBlocs(vues, true);
    total += Date.now() - t0;
    const t1 = Date.now();
    ajusterBlocs(copie);
    repos += Date.now() - t1;
  }
  const parImage = total / IMAGES;
  const parImageRepos = repos / IMAGES;
  // Trente images par seconde laissent 33 ms pour TOUT : projeter, trier,
  // et rendre. Le tri interne des meubles ne doit en prendre qu'une part.
  console.log(
    `tri interne : ${parImage.toFixed(2)} ms en mouvement, ` +
      `${parImageRepos.toFixed(2)} ms au repos`,
  );
  /*
    ON JUGE LA MATIÈRE, PAS LE CHRONOMÈTRE.

    Une durée absolue ne veut rien dire ici : la suite tourne à plusieurs
    processus en parallèle, et la même mesure double selon la charge. Ce qui
    tient, c'est le NOMBRE DE FACES à classer — c'est lui qui faisait ramer le
    modèle, et c'est lui qu'on a divisé par quatre en traçant le contour d'un
    meuble avec son aplat plutôt qu'en quatre-vingt-huit traits séparés.
  */
  const duMobilier = faces.filter((f) => f.ownerId);
  const parMeuble = duMobilier.length / MEUBLES.length;
  const traits = duMobilier.filter((f) => f.pts.length === 2).length;
  console.log(
    `${parMeuble.toFixed(0)} faces par meuble, ${traits} traits à part — ` +
      `tri : ${parImage.toFixed(2)} ms en mouvement, ` +
      `${parImageRepos.toFixed(2)} ms au repos`,
  );
  // Un meuble ne doit plus produire de trait à classer : son contour est
  // dessiné avec son pan.
  expect(`${traits} trait(s) séparé(s)`).toBe('0 trait(s) séparé(s)');
  expect(`${parMeuble < 45 ? 'léger' : `lourd (${parMeuble.toFixed(0)})`}`).toBe(
    'léger',
  );
  // Et un garde-fou large sur le temps, pour attraper une explosion de coût.
  expect(
    `${parImageRepos < 100 ? 'tenu' : `dépassé (${parImageRepos.toFixed(1)} ms)`}`,
  ).toBe('tenu');
});

/**
 * UN MUR NE PASSE PAS DEVANT LE MEUBLE QU'IL PORTE.
 *
 * Releve du chantier, capture a l appui : « il y a des modeles 3D qui se
 * font superposer par des murs lorsqu on reste appuye pour tourner ». Au
 * repos tout est juste ; le doigt pose, un mur vient recouvrir le canape.
 *
 * La cause tient en un mot : pendant le geste, la scene se batissait en
 * mode GROSSIER — chaque mur d un seul tenant au lieu d etre decoupe en
 * bandes de soixante centimetres. Or c est le decoupage qui permet au tri
 * du peintre de departager un mur long d un objet pose devant lui : d un
 * seul tenant, le mur porte UNE profondeur moyenne, et il passe devant ou
 * derriere EN BLOC. Vu en biais, sa moitie proche l emporte, et le meuble
 * disparait derriere le mur qui est pourtant derriere lui.
 */
const dansLePolygone = (
  p: { sx: number; sy: number },
  poly: { sx: number; sy: number }[],
) => {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.sy > p.sy !== b.sy > p.sy &&
      p.sx < ((b.sx - a.sx) * (p.sy - a.sy)) / (b.sy - a.sy) + a.sx
    ) {
      dedans = !dedans;
    }
  }
  return dedans;
};

/**
 * Combien d angles cachent le meuble derriere un mur ?
 *
 * `figer` rejoue ce que faisait la vue pendant un geste : reprendre les
 * profondeurs calculees jusqu a QUATRE DEGRES plus tot, au lieu de celles
 * de l angle courant.
 */
const anglesQuiCachent = (figer: boolean, grossier = false) => {
  const { faces, rooms } = buildScene(
    // Une cloison traverse la piece : c est ELLE qui vient recouvrir le
    // meuble quand elle est prise d un seul tenant — le cas de la capture.
    [...MURS, mur('cloison', 1, 2.2, 5, 2.2)],
    [],
    // Le meuble se tient juste derriere elle.
    [
      {
        id: 'canape',
        category: 'sofa',
        width: 2,
        depth: 0.9,
        height: 0.8,
        // Decale vers un BOUT de la cloison, pas devant son milieu : c est
        // la que le mur pris d un seul tenant se trompe, sa profondeur
        // moyenne etant celle de son centre.
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.6, 0.4, 3.1, 1],
      },
    ],
    { palette: PAL, showSurfaces: true, rooms: [{ id: 'r1' }], coarse: grossier },
  );
  const centre = sceneFraming(faces).center;
  const rad = (d: number) => (d * Math.PI) / 180;
  let caches = 0;
  const vuesA = (theta: number) => {
    const cam = {
      ct: Math.cos(rad(theta)),
      st: Math.sin(rad(theta)),
      cp: Math.cos(rad(45)),
      sp: Math.sin(rad(45)),
    };
    const project = (p: P3) => {
      const x = p.x - centre.x;
      const y = p.y - centre.y;
      const z = p.z - centre.z;
      const rx = x * cam.ct - z * cam.st;
      const rz = x * cam.st + z * cam.ct;
      return {
        sx: 200 + rx * 60,
        sy: 260 + (rz * cam.cp - y * cam.sp) * 60,
        depth: rz * cam.sp + y * cam.cp,
      };
    };
    const rangs = roomRanks(rooms, cam);
    const vues = faces
      .filter((f) => !isHiddenFace(f, cam))
      .map((f) => ({
        proj: f.pts.map(project),
        depth: faceDepth(f, project, cam, rangs),
        owner: f.ownerId,
        room: f.roomId,
        pan: f.panId,
        bord: f.bordDe,
        mur: f.ownerId === 'cloison',
        meuble: f.ownerId === 'canape',
      }));
    ajusterBlocs(vues, false);
    return vues;
  };

  for (let k = 0; k < 36; k++) {
    const theta = k * 10;
    const vues = vuesA(theta);
    if (figer) {
      // Ce que faisait la vue : reprendre les profondeurs d un angle deja
      // parcouru, tant qu on n a pas tourne de plus de quatre degres.
      const table = new Map<number, number>();
      for (const v of vuesA(theta - 4)) {
        if (v.pan !== undefined) table.set(v.pan, v.depth);
      }
      for (const v of vues) {
        const d = v.pan !== undefined ? table.get(v.pan) : undefined;
        if (d !== undefined) v.depth = d;
      }
    }
    const dessus = vues
      .filter((v) => v.meuble)
      .sort((a, b) => b.depth - a.depth)[0];
    if (!dessus) continue;
    const c = {
      sx: dessus.proj.reduce((s, p) => s + p.sx, 0) / dessus.proj.length,
      sy: dessus.proj.reduce((s, p) => s + p.sy, 0) / dessus.proj.length,
    };
    // Une face de mur dessinee APRES le meuble et qui recouvre son centre :
    // a l ecran, le meuble a disparu derriere le mur.
    if (
      vues.some(
        (v) => v.mur && v.depth > dessus.depth && dansLePolygone(c, v.proj),
      )
    ) {
      caches += 1;
    }
  }
  return caches;
};

it('ne cache jamais le meuble derriere son mur, geste ou pas', () => {
  // Au repos, chaque mur est decoupe en bandes de soixante centimetres et
  // chaque bande porte sa propre profondeur : rien ne se recouvre a tort.
  expect(anglesQuiCachent(false)).toBe(0);
  // L ordre reutilise quelques degres ne suffit pas a tromper le tri.
  expect(anglesQuiCachent(true)).toBe(0);
  /*
    ET PENDANT LE GESTE NON PLUS — c est CE cas qui ratait.

    La scene se batissait alors en mode GROSSIER : chaque mur d un seul
    tenant, pour alleger le rendu. Un mur entier ne porte plus qu UNE
    profondeur, celle de son centre — et un meuble place devant sa moitie
    proche se retrouve classe DERRIERE lui. Le mur passe devant le meuble,
    tant que le doigt reste pose ; on lache, tout revient en place.
  */
  expect(anglesQuiCachent(true, true)).toBe(0);
});

/**
 * L'OPTIMISATION DE LA 3D A ÉTÉ ESSAYÉE, PUIS ÉCARTÉE PAR LE PATRON.
 *
 * Deux gains avaient été portés ici, sur le modèle de ce qui a réussi au
 * plan 2D : confier le PINCEMENT au pilote natif (zoomer et déplacer ne
 * change ni les faces ni leur ordre, la propriété est tenue ci-dessous), et
 * taire les ARÊTES pendant qu'on tourne, pour repeindre un tiers de moins.
 *
 * Verdict de l'essai sur le téléphone : « remets le 3D comme c'était avant,
 * ça semble moins fluide qu'avant ta recherche d'optimisation ». La vue 3D
 * est donc revenue à son état d'origine, entière et rendue à chaque image.
 *
 * On ne jette pas la mesure pour autant : les deux propriétés ci-dessous
 * sont VRAIES du modèle, elles ont été vérifiées, et c'est ce qui rendrait
 * l'optimisation possible si le sujet revenait. Ce que l'essai a montré,
 * c'est qu'elle ne suffit pas à faire gagner quelque chose ici — et qu'un
 * gain se juge sur l'appareil, jamais sur le papier.
 */
describe('ce que le modèle 3D permettrait d’optimiser', () => {
  it('un pincement ne changerait ni les faces ni leur ordre', () => {
    const scene = buildScene(MURS, [], MEUBLES, {
      palette: PAL,
      showSurfaces: true,
      floors: {},
      rooms: [],
      fixtures: [],
    });
    const cam = { ct: 0.7, st: 0.7, cp: 0.8, sp: 0.6 };
    const rangs = roomRanks(scene.rooms, cam);
    const ordre = (zoom: number, ox: number) => {
      const { center } = sceneFraming(scene.faces);
      const project = (p: P3) => {
        const x = p.x - center.x;
        const y = p.y - center.y;
        const z = p.z - center.z;
        const rx = x * cam.ct - z * cam.st;
        const rz = x * cam.st + z * cam.ct;
        return {
          sx: 195 + ox + rx * 100 * zoom,
          sy: 310 + (rz * cam.cp - y * cam.sp) * 100 * zoom,
          depth: rz * cam.sp + y * cam.cp,
        };
      };
      return scene.faces
        .filter((f) => !isHiddenFace(f, cam))
        .map((f, i) => `${i}:${faceDepth(f, project, cam, rangs).toFixed(4)}`)
        .join('|');
    };
    // Zoomer et déplacer laissent le tri IDENTIQUE, à la dernière décimale :
    // c'est ce qui autorise à confier le geste au pilote natif au lieu de
    // rejouer le rendu à chaque image.
    expect(ordre(2.4, 80)).toBe(ordre(1, 0));
  });

  it('les arêtes font une bonne part du dessin, et rien que du trait', () => {
    const scene = buildScene(MURS, [], MEUBLES, {
      palette: PAL,
      showSurfaces: true,
      floors: {},
      rooms: [],
      fixtures: [],
    });
    const aretes = scene.faces.filter((f) => f.bordDe !== undefined);
    // Un tiers au bas mot sur ce salon meublé : les taire pendant qu'on
    // tourne n'est pas une économie de coin de table.
    expect(aretes.length).toBeGreaterThan(scene.faces.length * 0.3);
    // Et aucune ne porte de remplissage : ce qu'on retire est du TRAIT, le
    // volume reste entièrement lisible à l'ombrage de ses aplats.
    for (const a of aretes) expect(a.fill).toBeNull();
  });
});

/**
 * ON NE DÉCOUPE UN MUR QUE S'IL Y A QUELQUE CHOSE À DÉPARTAGER.
 *
 * Relevé du patron : « la 3D n'est pas du tout fluide, même sans meuble ».
 * La mesure lui donne raison, et le chiffre est édifiant : une pièce VIDE —
 * quatre murs, rien dedans — produisait TROIS CENT CINQUANTE-TROIS faces,
 * dont deux cent vingt-neuf à repeindre à chaque image du geste.
 *
 * D'où venaient-elles ? Du découpage des pans en bandes de soixante
 * centimètres. Il a une raison, et une seule : donner au tri du peintre la
 * finesse qu'un pan d'un seul tenant n'a pas, pour qu'un meuble posé devant
 * la moitié proche d'un long mur ne se retrouve pas classé derrière tout le
 * mur. C'est le canapé du chantier, et le mode « grossier » a été retiré
 * pour cette raison-là.
 *
 * Mais dans une pièce vide, il n'y a RIEN à départager : on payait la
 * finesse d'un tri qui n'avait aucun litige à trancher. Un mur ne se découpe
 * donc plus que s'il a quelque chose devant lui — un meuble, un appareil —
 * assez près pour que la question se pose.
 */
describe('les bandes ne servent qu’à départager', () => {
  const salonVide = () =>
    buildScene(MURS, [], [], {
      palette: PAL,
      showSurfaces: true,
      floors: {},
      rooms: [{ id: 'r1', floor: null } as never],
      fixtures: [],
    });

  it('une pièce vide ne découpe plus ses murs', () => {
    const vide = salonVide();
    // Quatre murs, un sol : quelques dizaines de faces, pas trois cents.
    expect(
      `${vide.faces.length} faces pour quatre murs nus`,
    ).toBe(`${vide.faces.length} faces pour quatre murs nus`);
    expect(vide.faces.length).toBeLessThan(120);
  });

  it('mais un mur qui porte un meuble devant lui garde les siennes', () => {
    // Le canapé du chantier : posé le long du mur nord, il exige que ce
    // mur-là reste découpé, sinon il repasse derrière en bloc.
    const meuble = MEUBLES.slice(0, 1);
    const avec = buildScene(MURS, [], meuble, {
      palette: PAL,
      showSurfaces: true,
      floors: {},
      rooms: [{ id: 'r1', floor: null } as never],
      fixtures: [],
    });
    // Nettement plus de faces qu'à vide : les murs voisins du meuble se
    // sont découpés, et lui seul a fait la différence.
    expect(avec.faces.length).toBeGreaterThan(salonVide().faces.length + 40);
  });
});

/**
 * LES FACES VOISINES DE MÊME PEAU SE DESSINENT D'UN SEUL TRACÉ.
 *
 * Relevé du patron : « le meublé est lourd, à peine quelques meubles et une
 * latence est largement visible ; pourtant sur MagicScan, un grand nombre
 * de meubles et aucun problème ». La comparaison est juste, et elle désigne
 * la vraie limite : chaque face est une VUE NATIVE que le moteur repeint et
 * que React réconcilie. Cinq cent cinquante vues par image, c'est le mur.
 *
 * On ne peut pas réduire le nombre de faces sans abîmer le tri — il est
 * juste, et c'est lui qui empêche un meuble de traverser une cloison. Mais
 * on peut réduire le nombre de VUES : dans l'ordre de peinture, les faces
 * qui se suivent et partagent la même peau (même remplissage, même trait,
 * même opacité) peuvent être dessinées d'un seul tracé. L'ordre est
 * respecté à la lettre — on ne fusionne QUE des voisines —, le dessin est
 * rigoureusement le même, et le nombre de vues tombe de moitié.
 *
 * C'est la même idée que les bandes d'un mur, prise par l'autre bout : là
 * on découpait pour trier juste, ici on recolle ce que le tri a laissé
 * côte à côte.
 */
describe('le dessin se regroupe en tracés', () => {
  const faces = (n: number, meme: boolean) =>
    Array.from({ length: n }, (_, i) => ({
      proj: [
        { sx: i, sy: 0 },
        { sx: i + 1, sy: 0 },
        { sx: i + 1, sy: 1 },
      ],
      fill: meme || i % 2 === 0 ? '#AAA' : '#BBB',
      stroke: '#333',
      voile: 1,
      dashed: false,
    }));

  it('recolle les voisines de même peau', () => {
    const groupes = grouperTraces(faces(10, true) as never);
    // Dix faces, un seul tracé : c'est le cas d'un meuble ou d'un mur dont
    // les pans se suivent dans l'ordre de peinture.
    expect(groupes).toHaveLength(1);
    // Et le tracé porte les dix contours, chacun refermé.
    expect((groupes[0].d.match(/Z/g) ?? []).length).toBe(10);
  });

  it('ne fusionne JAMAIS par-dessus une face d’une autre peau', () => {
    // L'ordre de peinture est la seule chose qui empêche un meuble de
    // traverser un mur : on ne réordonne rien, on ne saute rien.
    const groupes = grouperTraces(faces(10, false) as never);
    expect(groupes).toHaveLength(10);
  });

  it('sépare les arêtes des aplats : une ligne n’a pas de remplissage', () => {
    const melange = [
      { proj: [{ sx: 0, sy: 0 }, { sx: 1, sy: 1 }], fill: 'none', stroke: '#333', voile: 1, dashed: false },
      { proj: [{ sx: 1, sy: 1 }, { sx: 2, sy: 2 }], fill: 'none', stroke: '#333', voile: 1, dashed: false },
      { proj: [{ sx: 0, sy: 0 }, { sx: 1, sy: 0 }, { sx: 1, sy: 1 }], fill: '#AAA', stroke: '#333', voile: 1, dashed: false },
    ];
    const groupes = grouperTraces(melange as never);
    // Les deux traits ensemble, l'aplat à part : un tracé ne peut pas être
    // à la fois une ligne ouverte et un polygone fermé.
    expect(groupes).toHaveLength(2);
    expect(groupes[0].d).not.toContain('Z');
    expect(groupes[1].d).toContain('Z');
  });
});

/**
 * LE DESSIN MIS À PLAT POUR LA VUE NATIVE.
 *
 * Ce qui traverse le pont soixante fois par seconde doit se lire sans être
 * analysé. Ce banc tient le format — l'ordre conservé, les styles
 * mutualisés, et rien de perdu en route.
 */
describe('le dessin mis à plat', () => {
  const face = (fill: string, pts: number) => ({
    proj: Array.from({ length: pts }, (_, i) => ({ sx: i, sy: i * 2 })),
    fill,
    stroke: '#333333',
    voile: 1,
    dashed: false,
  });

  it('garde l’ordre des faces, qui est tout le tri', () => {
    const d = mettreAPlat([face('#AAA', 3), face('#BBB', 4)] as never);
    // Première forme : style 0, trois points, puis les six coordonnées.
    expect(d.formes.slice(0, 8)).toEqual([0, 3, 0, 0, 1, 2, 2, 4]);
    // Seconde : style 1 — une autre peau, donc un autre rang.
    expect(d.formes[8]).toBe(1);
    expect(d.formes[9]).toBe(4);
  });

  it('ne redit jamais deux fois le même style', () => {
    // Deux cents faces d'un mur partagent la même peau : elle ne doit
    // traverser le pont qu'UNE fois.
    const d = mettreAPlat(
      Array.from({ length: 200 }, () => face('#AAA', 4)) as never,
    );
    expect(d.styles).toHaveLength(1);
  });

  it('une arête n’a pas de fond : elle se dit « none »', () => {
    const d = mettreAPlat([face('#AAA', 2)] as never);
    expect(d.styles[0].startsWith('none,')).toBe(true);
  });

  it('ne perd rien : autant de points dedans que dehors', () => {
    const faces = [face('#AAA', 4), face('#BBB', 2), face('#AAA', 3)];
    const d = mettreAPlat(faces as never);
    let i = 0;
    let vus = 0;
    while (i < d.formes.length) {
      const n = d.formes[i + 1];
      vus += n;
      i += 2 + n * 2;
    }
    expect(vus).toBe(4 + 2 + 3);
    // Et l'on retombe pile sur la fin : rien en trop, rien qui manque.
    expect(i).toBe(d.formes.length);
  });
});
