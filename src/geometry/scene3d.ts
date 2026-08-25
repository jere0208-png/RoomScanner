/**
 * Construction de la scène 3D — partagée par la vue de l'app et par le PDF.
 *
 * Les deux rendus doivent montrer EXACTEMENT le même volume : mêmes onglets
 * de murs, mêmes bandes, mêmes couleurs relevées. Tout est donc calculé ici,
 * chaque rendu ne s'occupant plus que de projeter et de peindre.
 */
import type { FloorData, ObjectData, SurfaceTexture } from 'react-native-room-scan';
import {
  clampFootprint,
  estTraversante,
  pointOnSeg,
  roomOf,
  roomParts,
  toFootprint,
  wallQuads,
  wallsCentroid,
  WALL_T,
  type RoomShape,
  type Pt,
  type RoomSurface,
  type WallSeg,
} from './floorplan';
import { floorColorAt, mixHex, pointInPolygon, sampleTexture } from './appearance';
import { AMBRE_MEUBLE, MEUBLE_MOELLEUX } from '../ui/maquette';
import { furnitureParts, type FurnPart } from './furniture3d';
import { CEILINGS, type CeilingFixture } from './ceiling';
import {
  FIXTURES,
  PLAQUE,
  boxOffsets,
  faceX,
  facePoint,
  postsOf,
  wallFace,
  type Fixture,
  type FixtureKind,
} from './electrical';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface Face3D {
  pts: P3[];
  fill: string | null;
  stroke: string | null;
  /** Ombrage recalculé à la projection, selon l'orientation du pan. */
  shade?: boolean;
  /** La teinte vient du scan : l'ombrage doit conserver sa couleur. */
  captured?: boolean;
  /**
   * Le meuble dont cette face fait partie.
   *
   * Sert à l'effacer d'un bloc quand il cache un appareil électrique : sans
   * cette étiquette, il faudrait le retrouver à la géométrie, meuble par
   * meuble, à chaque image.
   */
  ownerId?: string;
  /** Biais de tri (m), pour départager deux faces à la même profondeur. */
  bias?: number;
  isFloor?: boolean;
  /**
   * Face extérieure d'un mur : celle qui tourne le dos à sa pièce.
   *
   * Le rendu de l'app l'estompe quand elle nous fait face — c'est
   * l'écorché : on voit DANS la pièce sans avoir à tourner le modèle par
   * dessus. Les exports, eux, la gardent opaque : un plan qu'on imprime ne
   * se lit pas en transparence.
   */
  cutaway?: boolean;
  /**
   * TRI FIN, À L'INTÉRIEUR D'UN MÊME BLOC.
   *
   * Un meuble se trie comme un tout : toutes ses faces partagent le même
   * point de tri, celui qui le situe par rapport aux murs. Ses morceaux se
   * retrouvent donc à égalité parfaite entre eux, et c'est l'ordre de
   * construction qui tranchait — le dossier d'un canapé repeignait son
   * assise, pourtant plus proche de l'œil. On voyait ça comme des bandes,
   * et comme une transparence.
   *
   * Ce point-ci est la VRAIE position de la face. Il n'intervient qu'au
   * millième : assez pour ordonner les morceaux d'un même meuble entre eux,
   * bien trop peu pour le faire passer devant ou derrière quoi que ce soit
   * d'autre.
   */
  /**
  /**
   * L'ARÊTE APPARTIENT À UN PAN, et se peint juste après lui.
   *
   * Les trois quarts des faces d'un meuble sont ses arêtes : cent seize pour
   * un lit, dont quatre-vingt-huit traits. Triées séparément, celles du dos
   * passaient par-dessus l'avant — des traits en travers du meuble, qu'on lit
   * comme une transparence. On les attache donc à leur pan : où qu'il aille
   * dans l'ordre de peinture, elles le suivent.
   */
  bordDe?: number;
  /** Numéro de ce pan, pour que ses arêtes le retrouvent. */
  panId?: number;
  /** Trait pointillé : réservé aux passages, qui sont des vides. */
  dashed?: boolean;
  /**
   * LA PIÈCE À LAQUELLE CETTE FACE APPARTIENT, et de quel côté elle regarde.
   *
   * Le tri du peintre range les faces sur UN nombre : leur profondeur. Deux
   * surfaces qui se croisent à l'écran n'ont pourtant pas d'ordre unique —
   * un mur de trois mètres passe devant un lit à un bout et derrière à
   * l'autre. Aucun nombre ne dit les deux, et c'est ce qui faisait
   * disparaître un meuble sous un mur en tournant le modèle.
   *
   * On ajoute donc au tri ce que la géométrie sait de façon SÛRE : une
   * pièce est une boîte, et pour un œil donné il n'y a que trois couches —
   * les murs qu'on voit PAR L'INTÉRIEUR (ils sont derrière tout le
   * contenu), le contenu lui-même, et les murs qu'on voit PAR L'EXTÉRIEUR
   * (ils sont devant tout). C'est vrai sous tous les angles, sans exception
   * ni réglage.
   *
   * `roomSide` est la normale du mur tournée vers sa pièce : c'est elle qui
   * dit, pour une caméra donnée, de quel côté on se trouve.
   */
  roomId?: string;
  roomSide?: P3;
  /**
   * LE MUR DONT CETTE FACE EST FAITE.
   *
   * La maçonnerie d'un mur, ses menuiseries et l'appareillage qui y est
   * plaqué portent tous son identifiant. C'est ce qui permet de N'EN
   * MONTRER QU'UN — la visite guidée présente un mur à la fois, et les
   * autres sortent du champ le temps du carton.
   *
   * Cette étiquette est posée ici, à la construction, et non retrouvée à la
   * géométrie au moment du rendu : un mur soudé à ses voisins n'a pas de
   * frontière franche dans l'espace, et le chercher image par image
   * coûterait le prix d'une reconstruction.
   */
  wallId?: string;
  /**
   * Point dont la profondeur classe la face, à la place de son propre centre.
   *
   * Une ARÊTE doit se trier avec le pan qu'elle borde, pas pour elle-même :
   * l'arête basse d'un mur est à y = 0 alors que le pan a son centre à
   * mi-hauteur. Comme la profondeur croît avec l'altitude, l'arête basse
   * passait AVANT son propre pan, qui la repeignait aussitôt. C'est ce qui
   * effaçait le silhouettage — et pourquoi il réapparaissait pendant un
   * geste, où un pan non découpé porte un contour d'un seul tenant, centré
   * comme lui.
   */
  depthAt?: P3;
  /**
   * Plusieurs points de tri : les tuiles de mur que la face RECOUVRE.
   *
   * Une façade d'appareil large — un tableau électrique fait 55 cm —
   * recouvre deux tuiles de mur, et le tri ne peut pas se contenter d'une
   * seule : celle qu'on n'aurait pas prise passerait après, et repeindrait
   * la moitié du tableau.
   *
   * Laquelle retenir dépend du CÔTÉ d'où l'on regarde, et c'est tout le
   * piège — voir `depthFacing`.
   */
  depthRefs?: P3[];
  /**
   * De quel côté la face regarde : la normale sortante de SON mur.
   *
   * Le tri retenait toujours la tuile la plus PROCHE (`Math.max`). Vu de la
   * pièce, c'est juste : l'appareil doit passer devant chacune des tuiles
   * qu'il recouvre. Vu de l'autre côté de la cloison, c'est exactement
   * l'inverse — le tableau se triait sur la tuile la plus proche de l'œil,
   * alors que le pan qui le masque est à l'autre bout de son emprise. Sur
   * une pièce de 3,50 m regardée en biais, l'écart entre les deux bouts
   * d'un tableau de 55 cm dépasse largement l'épaisseur du mur : le
   * rectangle rouge flottait sur la maçonnerie.
   *
   * On garde donc la tuile la plus proche quand la face nous fait face, et
   * la plus LOINTAINE quand elle nous tourne le dos : dans ce cas, tout ce
   * qui la couvre passe après elle.
   */
  depthFacing?: P3;
  /**
   * Le côté de mur auquel la face APPARTIENT. Elle disparaît avec lui.
   *
   * Le tri par tuile ne peut pas résoudre ce cas, et c'est démontrable : un
   * appareil se trie sur la tuile qu'il occupe, mais le regard qui le
   * traverse ressort par une tuile VOISINE, plus proche de l'œil dès qu'on
   * est en biais. Sur une pièce de 3,50 m, un pas de tuile représente
   * jusqu'à dix centimètres de profondeur quand l'épaisseur du mur n'en
   * offre que six : le flanc du tableau repassait devant la maçonnerie, et
   * on voyait un rectangle rouge sur un mur plein.
   *
   * Aucun réglage de profondeur ne rattrape ça. Ce qui est posé sur la face
   * cachée d'un mur ne doit pas être dessiné du tout — c'est la règle du
   * bâtiment, pas une astuce de rendu.
   */
  facing?: P3;
  /**
   * Normale sortante d'une face de VOLUME. Sa présence dit que la face
   * appartient à un solide fermé : quand elle tourne le dos à la caméra, on
   * ne la dessine pas du tout. C'est ce qui empêche définitivement les deux
   * faces d'un même mur — distantes de 14 cm — de se disputer l'affichage.
   */
  normal?: P3;
}

/** Orientation de la caméra, telle que les deux rendus la calculent. */
export interface CameraTrig {
  /** cos/sin de l'azimut. */
  ct: number;
  st: number;
  /** cos/sin de l'inclinaison. */
  cp: number;
  sp: number;
}

/**
 * Face d'un solide qui tourne le dos à la caméra : à jeter avant même de la
 * projeter. La profondeur croît vers la caméra (`rz * sp + y * cp`), donc son
 * gradient `(st·sp, cp, ct·sp)` est la direction de l'observateur.
 */
/**
 * La profondeur de tri d'une face — la même pour la vue 3D, le PDF et les
 * planches de référence.
 *
 * Elle était recopiée dans les trois : six lignes identiques, qu'il fallait
 * penser à corriger trois fois. Une divergence entre elles ne se voit pas à
 * la lecture, seulement à l'impression — le genre d'écart qu'on découvre
 * sur un plan déjà remis au client.
 */
/** Écart entre deux couches : plus grand que toute profondeur réelle. */
const COUCHE = 1e4;

/**
 * À PARTIR D'OÙ UN MUR S'EFFACE, en écorché.
 *
 * Faire dépendre la COUCHE de tri du même seuil a été essayé — c'était la
 * piste la plus naturelle pour le mur qui passe sur la chaise — et écarté :
 * quelle que soit la valeur, le meuble d'angle se déchire sous six angles au
 * moins. Un remède qui casse ailleurs n'est pas un remède.
 */
const SEUIL_ECORCHE = 0.12;


/** Écart entre deux pièces : plus grand que trois couches. */
const PIECE = 1e6;

/**
 * OÙ SE RANGE CETTE FACE, avant même de regarder sa profondeur.
 *
 * Trois couches par pièce, dans cet ordre : les murs vus de l'intérieur
 * (derrière tout), le contenu — mobilier, appareillage, gaines —, puis les
 * murs vus de l'extérieur (devant tout). Et les pièces entre elles se
 * rangent de la plus lointaine à la plus proche : sans quoi le mobilier de
 * la chambre voisine se verrait au travers de la cloison mitoyenne.
 */
function couche(face: Face3D, cam: CameraTrig): number {
  if (!face.roomSide) return COUCHE;
  const vers =
    face.roomSide.x * cam.st * cam.sp +
    face.roomSide.y * cam.cp +
    face.roomSide.z * cam.ct * cam.sp;
  /*
    ON VOIT LE CÔTÉ PIÈCE : LE MUR EST AU FOND, derrière son contenu.

    CE SEUIL A ÉTÉ MIS EN CAUSE, PUIS DISCULPÉ. Relevé du patron, capture à
    l'appui : un pan de mur passe sur une chaise posée devant lui — vingt-deux
    angles de vue sur trente-six, mesurés. L'explication semblait tenir : un
    mur bascule ici en couche « devant » dès qu'on n'en voit plus la face
    intérieure, alors que l'écorché ne l'efface qu'à partir de 0,12 ; entre
    les deux, des murs opaques classés devant le mobilier.

    Aligner les deux seuils fait bien tomber le compte à six — et DÉCHIRE le
    meuble d'angle sous au moins six angles, quelle que soit la valeur
    choisie. La cause est ailleurs, plus profonde : voir le banc
    `chaisecachee`.
  */
  return vers > 0 ? 0 : 2 * COUCHE;
}

/**
 * La profondeur de TRI d'une face : rang de sa pièce, puis sa couche, puis
 * sa distance à l'œil.
 */
export function faceDepth(
  face: Face3D,
  project: (p: P3) => { depth: number },
  cam: CameraTrig,
  /** Rang de chaque pièce, de la plus lointaine (0) à la plus proche. */
  rangs?: Map<string, number>,
): number {
  // Le sol passe avant tout : il ne peut rien masquer.
  if (face.isFloor) return -Infinity;
  const rang = rangs && face.roomId ? (rangs.get(face.roomId) ?? 0) : 0;
  const calage = rang * PIECE + couche(face, cam);
  const bias = face.bias ?? 0;
  if (face.depthRefs && face.depthRefs.length > 0) {
    const ds = face.depthRefs.map((r) => project(r).depth);
    const n = face.depthFacing;
    const vers = n ? n.x * cam.st * cam.sp + n.y * cam.cp + n.z * cam.ct * cam.sp : 1;
    return calage + (vers >= 0 ? Math.max(...ds) : Math.min(...ds)) + bias;
  }
  if (face.depthAt) return calage + project(face.depthAt).depth + bias;
  return (
    calage +
    face.pts.reduce((s, p) => s + project(p).depth, 0) / face.pts.length +
    bias
  );
}

/**
 * Le rang de chaque pièce pour cette caméra : la plus lointaine d'abord.
 *
 * Deux pièces ne se traversent pas : leurs contenus se peignent l'un après
 * l'autre, dans l'ordre où l'œil les rencontre. Le centre suffit à les
 * ordonner — elles ne s'interpénètrent pas.
 */
/**
 * L'ORDRE INTERNE D'UN BLOC SE JUGE À L'ÉCRAN.
 *
 * Un meuble se trie comme un TOUT face au reste de la scène : c'est ce qui
 * l'empêche de passer devant le mur qu'il longe — son altitude ne doit pas
 * entrer en ligne de compte. Mais ses propres faces se retrouvent alors à
 * égalité, et c'est l'ordre de construction qui tranchait : la carcasse d'un
 * caisson repeignait sa porte, le dossier d'un canapé repeignait son assise.
 * Le chantier voyait des bandes en travers des meubles, et croyait à une
 * transparence.
 *
 * Aucune formule ne départage deux faces à coup sûr — ni leur milieu, ni
 * leur plan, ni un rayon tiré du centre : chacune a été mesurée au banc, et
 * chacune laissait autant de fautes qu'elle en corrigeait. On tranche donc
 * comme l'œil : LÀ OÙ DEUX FACES SE RECOUVRENT, celle qui est devant se
 * peint en dernier.
 *
 * Un tri par insertion, sur quelques dizaines de faces par meuble. Le
 * critère n'est pas transitif — trois faces peuvent se recouvrir en ronde —
 * et un tri général s'y perdrait.
 */
export interface FacePeinte {
  proj: { sx: number; sy: number; depth: number }[];
}

export function ordreLocal<T extends FacePeinte>(
  items: T[],
  /**
   * LIENS IMPOSÉS : « celle-ci d'abord », quoi qu'en dise le pixel.
   *
   * Une arête borde son pan : ils sont COPLANAIRES, et aucun test au pixel ne
   * peut les départager — deux millimètres les séparent. Sans ce lien, le
   * classement les laissait dans l'ordre où il les trouvait, et un pan passé
   * après son arête l'effaçait : au lâcher du doigt, le modèle perdait ses
   * traits. Le lien entre dans le graphe comme les autres, et l'arête garde
   * en plus ses propres contraintes — elle ne doit pas non plus passer
   * devant un pan qui la couvre.
   */
  liens: [number, number][] = [],
  /**
   * LE PAN DE CHAQUE FACE (ou −1). Une arête borde son pan : ce qui la couvre
   * couvre aussi le pan, et ce qu'elle couvre, le pan le couvre. Sans cette
   * propagation, le classement se contredisait — le pan avant l'arête (ils
   * sont coplanaires), l'arête avant un pan de devant, et ce pan de devant
   * avant le premier : une ronde impossible à dénouer, et des traits qui
   * passaient au travers.
   */
  panDe: number[] = [],
): T[] {
  if (items.length < 2) return items;
  const boites = items.map((it) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let sx = 0;
    let sy = 0;
    let d0 = Infinity;
    let d1 = -Infinity;
    for (const p of it.proj) {
      x0 = Math.min(x0, p.sx);
      x1 = Math.max(x1, p.sx);
      y0 = Math.min(y0, p.sy);
      y1 = Math.max(y1, p.sy);
      d0 = Math.min(d0, p.depth);
      d1 = Math.max(d1, p.depth);
      sx += p.sx;
      sy += p.sy;
    }
    const n = it.proj.length || 1;
    return { x0, x1, y0, y1, d0, d1, cx: sx / n, cy: sy / n };
  });

  /** `a` doit-elle être peinte AVANT `b` ? (donc : est-elle derrière ?) */
  const avant = (a: number, b: number): boolean | null => {
    const A = boites[a];
    const B = boites[b];

    /*
      OÙ REGARDER SI ELLES SE RECOUVRENT.

      Pour deux aplats, le milieu de l'un dans l'autre suffit : ils sont
      larges, et se manquer par le milieu tout en se recouvrant demande une
      géométrie tordue. Pour un TRAIT, non : une arête de mur longue d'un
      mètre peut ne croiser un meuble que sur son dernier tiers, et son
      milieu ne dit alors rien. On l'échantillonne donc en trois points —
      c'est le seul cas où le milieu ment souvent.
    */
    const points = (i: number, C: { cx: number; cy: number }) => {
      const p = items[i].proj;
      if (p.length !== 2) return [{ sx: C.cx, sy: C.cy }];
      return [0.25, 0.5, 0.75].map((t) => ({
        sx: p[0].sx + (p[1].sx - p[0].sx) * t,
        sy: p[0].sy + (p[1].sy - p[0].sy) * t,
      }));
    };
    const paires: [number, number, { sx: number; sy: number }][] = [];
    for (const pt of points(a, A)) paires.push([a, b, pt]);
    for (const pt of points(b, B)) paires.push([b, a, pt]);
    /*
      ET SI LES MILIEUX SE MANQUENT, ON REGARDE LES COINS.

      Deux pans de mur qui se croisent en biais ne se touchent souvent que par
      un angle : leurs milieux tombent chacun à côté de l'autre, aucune flèche
      n'était posée, et l'ordre restait celui de la construction. On essaie
      donc les sommets, ramenés d'un dixième vers le centre pour rester
      franchement à l'intérieur — et seulement en second recours, car c'est
      quatre fois plus de travail.
    */
    const coins = (i: number, C: { cx: number; cy: number }) => {
      const p = items[i].proj;
      if (p.length < 3) return [];
      return p.slice(0, 4).map((q) => ({
        sx: q.sx + (C.cx - q.sx) * 0.1,
        sy: q.sy + (C.cy - q.sy) * 0.1,
      }));
    };
    for (const pt of coins(a, A)) paires.push([a, b, pt]);
    for (const pt of coins(b, B)) paires.push([b, a, pt]);
    for (const [u, v, pt] of paires) {
      // Un trait ne contient rien : on ne teste que « le milieu de l'un
      // tombe-t-il DANS l'autre », et un trait n'est jamais le contenant.
      if (items[v].proj.length < 3) continue;
      if (!dansPoly(pt, items[v].proj)) continue;
      /*
        LE RACCOURCI QUI FAIT LA VITESSE.

        Elles se recouvrent : reste à savoir laquelle est devant. Si toute
        l'une est plus loin que le point le plus proche de l'autre, la
        réponse ne dépend d'aucun point particulier — et l'on évite
        l'interpolation, qui coûte dix fois plus cher.
      */
      if (A.d1 < B.d0 - 0.002) return true;
      if (B.d1 < A.d0 - 0.002) return false;
      const du = profondeurAu(items[u].proj, pt);
      const dv = profondeurAu(items[v].proj, pt);
      if (du === null || dv === null) continue;
      // Deux millimètres : en deçà, deux faces sont coplanaires à l'œil et
      // l'ordre n'a plus de sens.
      if (Math.abs(du - dv) < 0.002) continue;
      return (du < dv ? u : v) === a;
    }
    return null;
  };

  /*
    UN GRAPHE, PAS UN TRI PAR ÉCHANGES.

    La première version comparait toutes les paires et déplaçait les faces
    une à une, plusieurs fois de suite : sur un logement meublé, cela faisait
    des centaines de milliers de tests à CHAQUE image, et le modèle ramait dès
    qu'on le tournait — le chantier l'a senti tout de suite.

    On ne compare plus que les faces dont les BOÎTES se recouvrent à l'écran,
    repérées par balayage : les autres ne peuvent pas se cacher, quoi qu'en
    dise leur profondeur. Chaque comparaison utile devient une flèche « celle-ci
    d'abord », et un tri topologique donne l'ordre d'un seul coup. Ce qui
    reste dans un cycle — trois faces qui se recouvrent en ronde — garde
    l'ordre de construction : il faut bien trancher.
  */
  const n = items.length;
  const suivants: number[][] = Array.from({ length: n }, () => []);
  const degre = new Array<number>(n).fill(0);
  /*
    ON NE COMPARE QUE LES VOISINES.

    Il y a plus de mille faces dans un salon meublé. Les comparer deux à deux
    ferait un demi-million de tests par image — le modèle ramait dès qu'on le
    tournait, et le chantier l'a dit tout de suite. On les range donc par
    abscisse et l'on s'arrête dès qu'une boîte commence après la fin de la
    nôtre : les suivantes ne peuvent plus la recouvrir.

    (Une grille d'écran a été essayée, et mesurée : deux fois plus lente. Les
    faces d'une pièce se pressent dans quelques cases, et le rangement coûte
    plus que les tests évités.)
  */
  const fleche = (de: number, vers: number) => {
    suivants[de].push(vers);
    degre[vers] += 1;
  };
  for (const [de, vers] of liens) fleche(de, vers);
  const parX = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => boites[a].x0 - boites[b].x0,
  );
  for (let k = 0; k < parX.length; k++) {
    const i = parX[k];
    for (let l = k + 1; l < parX.length; l++) {
      const j = parX[l];
      if (boites[j].x0 > boites[i].x1) break;
      if (boites[i].y1 < boites[j].y0 || boites[j].y1 < boites[i].y0) continue;
      // DEUX TRAITS NE SE DÉPARTAGENT PAS : personne ne regarde lequel de
      // deux traits d'un centimètre passe au-dessus de l'autre.
      if (items[i].proj.length < 3 && items[j].proj.length < 3) continue;
      const r = avant(i, j);
      if (r === null) continue;
      const [de, vers] = r ? [i, j] : [j, i];
      fleche(de, vers);
      // Ce qui vaut pour une arête vaut pour le pan qu'elle borde.
      const pDe = panDe[de] ?? -1;
      const pVers = panDe[vers] ?? -1;
      if (pDe >= 0 && pDe !== vers) fleche(pDe, vers);
      if (pVers >= 0 && pVers !== de) fleche(de, pVers);
      if (pDe >= 0 && pVers >= 0 && pDe !== pVers) fleche(pDe, pVers);
    }
  }

  // Un TAS, et non une liste qu'on balaie : sur un logement meublé il y a
  // plus de mille faces, et chercher le plus petit à chaque tour coûtait à
  // lui seul autant que tout le reste.
  const pret: number[] = [];
  const monter = (k: number) => {
    while (k > 0) {
      const p = Math.floor((k - 1) / 2);
      if (pret[p] <= pret[k]) break;
      [pret[p], pret[k]] = [pret[k], pret[p]];
      k = p;
    }
  };
  const descendre = () => {
    let k = 0;
    for (;;) {
      const g = 2 * k + 1;
      const d = g + 1;
      let m = k;
      if (g < pret.length && pret[g] < pret[m]) m = g;
      if (d < pret.length && pret[d] < pret[m]) m = d;
      if (m === k) break;
      [pret[m], pret[k]] = [pret[k], pret[m]];
      k = m;
    }
  };
  const enfiler = (v: number) => {
    pret.push(v);
    monter(pret.length - 1);
  };
  for (let i = 0; i < n; i++) if (degre[i] === 0) enfiler(i);
  const ordre: number[] = [];
  const pose = new Array<boolean>(n).fill(false);
  /*
    LES RONDES SE DÉNOUENT PAR LE FOND.

    Trois faces peuvent se recouvrir en ronde — A devant B, B devant C, C
    devant A : c'est possible en géométrie, et aucun ordre ne les satisfait
    toutes. Il faut donc trancher. On les posait à la fin, c'est-à-dire par
    -dessus tout le reste : le plus mauvais choix possible, puisqu'une face
    coincée dans une ronde repeignait alors la scène entière. On sort désormais
    LA PLUS LOINTAINE : elle est celle qui a le plus de chances d'être
    réellement derrière, et la ronde se dénoue d'elle-même ensuite.
  */
  const moyenne = (i: number) => {
    let t = 0;
    for (const q of items[i].proj) t += q.depth;
    return t / Math.max(1, items[i].proj.length);
  };
  const denouer = () => {
    let choix = -1;
    for (let i = 0; i < n; i++) {
      if (pose[i] || degre[i] === 0) continue;
      if (choix < 0 || moyenne(i) < moyenne(choix)) choix = i;
    }
    if (choix < 0) return false;
    degre[choix] = 0;
    enfiler(choix);
    return true;
  };
  while (pret.length > 0 || denouer()) {
    // Le plus ancien d'abord : c'est ce qui rend le résultat stable.
    const i = pret[0];
    pret[0] = pret[pret.length - 1];
    pret.pop();
    descendre();
    ordre.push(i);
    pose[i] = true;
    for (const j of suivants[i]) {
      degre[j] -= 1;
      if (degre[j] === 0) enfiler(j);
    }
  }
  return ordre.map((i) => items[i]);
}

/**
 * L'ordre interne des blocs, écrit dans la profondeur de tri.
 *
 * Les faces d'un même meuble portent toutes la même profondeur — il se trie
 * d'un bloc. On les départage à l'écran (`ordreLocal`), puis on inscrit ce
 * classement dans un millésime de profondeur : le tri général, qui mêle les
 * pans, les arêtes et les cotes, le respectera sans rien savoir des meubles.
 *
 * L'écart est d'un millième de millimètre : il ne peut dépasser aucun autre
 * élément de la scène.
 */
/**
 * LES FLÈCHES « CE PAN MASQUE CETTE PIÈCE », pour un groupe de faces.
 *
 * Rend les couples (meuble d'abord, pan ensuite). Voir le champ `devant` :
 * une pièce est tout entière du côté intérieur de ses murs, donc derrière
 * celui de ses pans dont on voit la face extérieure.
 */
function masques<
  T extends FacePeinte & { owner?: string; cache?: readonly string[] },
>(groupe: T[]): [number, number][] {
  const parMeuble = new Map<string, number[]>();
  let aMasquer = false;
  groupe.forEach((g, i) => {
    if (g.cache && g.cache.length > 0) aMasquer = true;
    if (!g.owner) return;
    const l = parMeuble.get(g.owner);
    if (l) l.push(i);
    else parMeuble.set(g.owner, [i]);
  });
  if (!aMasquer || parMeuble.size === 0) return [];
  /*
    LA FLÈCHE NE VAUT QUE LÀ OÙ LES DEUX SE RENCONTRENT.

    Relevé de chantier, trois fois : « des murs sur la vue 3D qui vont sur
    les meubles alors que le meuble est plus vers nous ». La mesure a
    désigné le coupable, et ce n'était pas celui qu'on croyait : sans ces
    flèches, la scène du banc ne compte AUCUNE faute ; avec elles, trois.

    Ce sont donc les flèches imposées qui inversaient l'ordre — non parce
    qu'elles sont fausses, mais parce qu'elles ne disent rien du reste. Un
    pan qui doit passer après deux meubles descend dans le classement, et
    rien ne le retient de passer aussi après un TROISIÈME qu'il ne masque
    pas et qui, lui, est derrière lui. La flèche est juste ; sa conséquence
    ne l'est pas.

    On ne la pose donc qu'entre deux faces qui se rencontrent VRAIMENT à
    l'écran. Là où elles ne se recouvrent pas, l'ordre n'a aucune
    conséquence visible, et une contrainte sans conséquence visible est une
    contrainte qui n'a que des effets de bord.

    CETTE RESTRICTION SEULE NE SUFFISAIT PAS : elle rendait l'image du repos
    exacte et laissait dix-huit percées pendant un geste, là où l'ordre
    ressert quelques degrés. Il a fallu l'autre moitié — faire ENTRER les
    faces dans le classement par ordre de profondeur (voir `ajusterBlocs`) —
    pour que les deux tiennent ensemble, sous le doigt comme au repos.
  */
  const boite = (it: T & FacePeinte) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of it.proj) {
      x0 = Math.min(x0, p.sx); x1 = Math.max(x1, p.sx);
      y0 = Math.min(y0, p.sy); y1 = Math.max(y1, p.sy);
    }
    return { x0, x1, y0, y1 };
  };
  const boites = groupe.map((g) => boite(g as T & FacePeinte));
  const seCroisent = (a: number, b: number) =>
    !(boites[a].x1 < boites[b].x0 || boites[b].x1 < boites[a].x0 ||
      boites[a].y1 < boites[b].y0 || boites[b].y1 < boites[a].y0);
  const fleches: [number, number][] = [];
  groupe.forEach((g, j) => {
    const masques = new Set(g.cache ?? []);
    if (masques.size === 0) return;
    for (const [id, indices] of parMeuble) {
      if (!masques.has(id)) continue;
      for (const i of indices) {
        if (seCroisent(i, j)) fleches.push([i, j]);
      }
    }
  });
  return fleches;
}

/**
 * QUEL PAN MASQUE QUEL MEUBLE — la part qui ne dépend pas de l'angle.
 *
 * Pour chaque pan de mur, la liste des meubles entièrement situés du côté
 * INTÉRIEUR de son plan (le côté opposé à sa normale). Un meuble de cette
 * liste est derrière ce pan chaque fois que le pan nous fait face, et il
 * l'est sous tous les angles où c'est le cas. La géométrie ne bouge pas
 * quand la caméra tourne : ce calcul se fait donc une fois par scène.
 *
 * Rend, par numéro de pan, sa normale et les meubles qu'il masque.
 */
export function masquesDeScene(
  faces: Face3D[],
): Map<number, { n: P3; cache: string[] }> {
  /** La boîte monde de chaque meuble : huit coins suffisent à trancher. */
  const boites = new Map<string, { lo: P3; hi: P3 }>();
  for (const f of faces) {
    if (!f.ownerId) continue;
    const b = boites.get(f.ownerId);
    if (!b) {
      const lo = { ...f.pts[0] };
      const hi = { ...f.pts[0] };
      for (const p of f.pts) {
        lo.x = Math.min(lo.x, p.x); lo.y = Math.min(lo.y, p.y); lo.z = Math.min(lo.z, p.z);
        hi.x = Math.max(hi.x, p.x); hi.y = Math.max(hi.y, p.y); hi.z = Math.max(hi.z, p.z);
      }
      boites.set(f.ownerId, { lo, hi });
      continue;
    }
    for (const p of f.pts) {
      b.lo.x = Math.min(b.lo.x, p.x); b.lo.y = Math.min(b.lo.y, p.y); b.lo.z = Math.min(b.lo.z, p.z);
      b.hi.x = Math.max(b.hi.x, p.x); b.hi.y = Math.max(b.hi.y, p.y); b.hi.z = Math.max(b.hi.z, p.z);
    }
  }
  const out = new Map<number, { n: P3; cache: string[] }>();
  if (boites.size === 0) return out;
  for (const f of faces) {
    // Les meubles ne se masquent pas par cette règle : deux volumes qui se
    // touchent n'ont pas de côté « intérieur » commun, et c'est le pixel
    // qui les départage déjà très bien.
    if (f.ownerId || !f.normal || f.panId === undefined || f.pts.length < 3) continue;
    if (out.has(f.panId)) continue;
    const n = f.normal;
    const p0 = f.pts[0];
    const d = n.x * p0.x + n.y * p0.y + n.z * p0.z;
    const cache: string[] = [];
    for (const [id, b] of boites) {
      let derriere = true;
      for (const x of [b.lo.x, b.hi.x]) {
        for (const y of [b.lo.y, b.hi.y]) {
          for (const z of [b.lo.z, b.hi.z]) {
            // Cinq millimètres de marge : un meuble plaqué contre le nu du
            // mur ne doit pas se disputer le plan avec lui.
            if (n.x * x + n.y * y + n.z * z - d > -0.005) derriere = false;
          }
        }
      }
      if (derriere) cache.push(id);
    }
    if (cache.length > 0) out.set(f.panId, { n, cache });
  }
  return out;
}

export function ajusterBlocs<
  T extends FacePeinte & {
    depth: number;
    owner?: string;
    room?: string;
    /** Numéro du pan, pour les aplats. */
    pan?: number;
    /** Pan dont cette face est une arête. */
    bord?: number;
    /**
     * LES MEUBLES QUE CE PAN MASQUE — le seul fait qui ne se discute pas.
     *
     * Relevé du patron, capture à l'appui : « on voit clairement des meubles
     * traverser le mur blanc opaque… fais une correction stricte ». Le
     * classement tranchait au pixel, et il se trompait vingt-trois fois sur
     * cent quatre-vingts angles, murs pleins.
     *
     * Or il y a des cas où il n'y a RIEN à trancher. Un pan est un morceau de
     * plan. Si ce plan nous fait face — si sa normale va vers l'œil — alors
     * tout ce qui est de l'autre côté est derrière lui : le rayon qui va d'un
     * meuble à l'œil traverse forcément ce plan. Ce n'est pas une préférence
     * de tri, c'est de la géométrie, et c'est vrai sous TOUS les angles.
     *
     * On compare donc les meubles au plan de chaque pan — une boîte entière
     * d'un côté, sans ambiguïté — et le classement en fait une flèche
     * imposée : le meuble d'abord, le pan ensuite. Le pixel garde tout le
     * reste, qui est l'immense majorité.
     *
     * (Le calcul lourd — quelle boîte est de quel côté de quel plan — ne
     * dépend pas de l'angle : il se fait UNE fois par scène, voir
     * `masquesDeScene`. Par image, il ne reste qu'un produit scalaire par
     * pan pour savoir s'il nous fait face.)
     */
    cache?: readonly string[];
  },
>(
  items: T[],
  /**
   * EN MOUVEMENT, ON NE CLASSE QUE LES APLATS.
   *
   * Les arêtes sont les trois quarts des faces d'un meuble : les faire entrer
   * dans le classement coûte quatre fois plus cher, et c'est trop pour trente
   * images par seconde sur un téléphone. Pendant un geste, chacune suit donc
   * simplement SON pan — le volume reste juste, seul le trait d'un dos peut
   * apparaître une fraction de seconde. Dès qu'on lâche, tout se reclasse.
   */
  rapide = false,
): void {
  /*
    UN GROUPE PAR PIÈCE, ET NON PAR MEUBLE.

    Deux meubles voisins se recouvrent aussi — le canapé passait devant le
    caisson accroché au-dessus de lui. Or les meubles d'une même pièce
    occupent DÉJÀ une couche à eux, entre le mur du fond et celui de devant :
    rien de la maçonnerie ne peut se glisser entre eux. On peut donc les
    résoudre tous ensemble, sans risquer de déranger le reste.
  */
  /*
    ET LES MURS AUSSI, CALQUE PAR CALQUE.

    Relevé du chantier, capture à l'appui : « regarde l'ouverture, toutes les
    arêtes ne sont pas tracées ». Un mur percé d'une fenêtre est bâti en
    morceaux — trumeaux, linteau, allège, tableaux — et le pan d'un morceau
    passait par-dessus l'arête d'un autre : le trait disparaît, l'ouverture
    perd un côté.

    Le calque est déjà lisible dans la profondeur de tri : elle vaut
    rang-de-pièce puis numéro de couche, et le reste tient dans la décimale.
    On regroupe donc par calque — le mur du fond d'une pièce, son contenu,
    son mur de devant — et l'on résout chacun à l'écran. Rien ne peut fuir
    d'un calque à l'autre : chaque groupe se réécrit dans la plage qu'il
    occupait déjà.
  */
  const parBloc = new Map<string, T[]>();
  for (const it of items) {
    if (!isFinite(it.depth)) continue;
    /*
      LE MUR DU FOND ET CE QU'IL Y A DEDANS : UN SEUL GROUPE.

      Relevé du chantier, vidéo à l'appui : « à travers un retour de mur, le
      meuble qui est censé être derrière ». Le défaut n'était pas un accident
      de tri : il était dans la RÈGLE. Une pièce se peignait en trois
      couches — le mur du fond, le contenu, le mur de devant — et cette
      règle-là suppose une pièce CONVEXE. Dès qu'un refend rentre dans la
      pièce, un pan « vu de l'intérieur » se trouve DEVANT du mobilier, et
      aucune couche ne pouvait le dire.

      On fusionne donc les deux premières couches d'une même pièce et l'on
      tranche à l'écran, là où les faces se recouvrent vraiment. Le mur de
      devant, lui, garde sa couche : c'est lui qui s'efface en écorché, et
      son sort ne se joue pas à la géométrie mais au réglage.
    */
    /*
      LE CALQUE SE LIT À L'ARRONDI, JAMAIS AU PLANCHER.

      La profondeur vaut rang de pièce, couche, puis la distance à l'œil — et
      cette distance est SIGNÉE. Un mur du fond à cinquante centimètres
      derrière le centre de la scène donnait donc une profondeur négative, que
      le plancher rangeait dans un calque « moins un » : il se retrouvait
      seul dans son groupe, sans personne à qui se comparer, et rien
      n'empêchait plus ses voisins de lui passer dessus.

      L'audit l'a trouvé en balayant les inclinaisons rasantes, là où les
      profondeurs changent de signe : trois cents recouvrements sur les
      quinze cents caméras du banc. L'arrondi, lui, tombe juste des deux
      côtés de zéro — la distance ne pèse que deux millèmes de calque.
    */
    /*
      LE CALQUE SUFFIT À DÉSIGNER LE GROUPE — pas l'étiquette de pièce.

      Les volumes d'une ouverture (le dormant, le vitrage, le seuil) ne
      portent aucune pièce : ils appartiennent à un mur, qui est mitoyen par
      nature. Groupés sur l'étiquette, ils tombaient donc à côté des arêtes du
      mur qu'ils percent, et rien ne les départageait plus : c'est ce qui
      effaçait les traits autour des fenêtres. Le rang de la pièce, lui, est
      déjà dans la profondeur — il suffit, et il ne ment pas.

      En mouvement, on s'en tient aux meubles : le grand groupe d'une pièce
      compte un millier de faces, et le départager à chaque image coûterait
      les images elles-mêmes.
    */
    const cle = rapide
      ? it.owner
        ? `bloc:${it.room ?? it.owner}`
        : ''
      : /*
          AU REPOS, TOUT LE LOGEMENT DANS UN SEUL GROUPE.

          Les couches et les rangs de pièces sont des règles commodes — le mur
          du fond, le contenu, le mur de devant ; la pièce lointaine avant la
          proche. Elles tiennent de face et lâchent ailleurs : à la verticale,
          le canapé posé contre un mur passe au-dessus de lui ; entre deux
          pièces qui s'imbriquent, le rang se trompe de sens. L'audit l'a
          montré sur trois cents caméras.

          Au repos, on ne s'appuie donc sur aucune règle : toutes les faces
          d'un logement se départagent à l'écran, là où elles se recouvrent.
          Les règles restent la pensée de secours du mode rapide, pendant les
          gestes — elles sont bonnes neuf fois sur dix, et gratuites.
        */
        'logement';
    if (!cle) continue;
    const l = parBloc.get(cle);
    if (l) l.push(it);
    else parBloc.set(cle, [it]);
  }
  for (const groupe of parBloc.values()) {
    if (groupe.length < 2) continue;
    const bas = Math.min(...groupe.map((g) => g.depth));
    const haut = Math.max(...groupe.map((g) => g.depth));
    if (!rapide) {
      const pas = Math.max(1e-6, (haut - bas) / (groupe.length + 1));
      /*
        ON ENTRE DANS LE CLASSEMENT DANS L'ORDRE DE LA PROFONDEUR.

        Relevé de chantier, quatre fois : « des murs sur la vue 3D qui vont
        sur les meubles alors que le meuble est plus vers nous ». La mesure a
        fini par désigner le vrai coupable, et il ne se voyait pas.

        Le classement est un tri TOPOLOGIQUE : il pose des flèches — l'arête
        après son pan, le meuble avant le mur qui le masque — puis sort les
        faces dans un ordre qui les respecte. Mais entre deux faces qu'AUCUNE
        flèche ne relie, il ne dit rien : il rendait alors l'ordre d'ARRIVÉE,
        c'est-à-dire celui de la construction de la scène. Or un pan poussé
        par une flèche descend dans cet ordre, et rien ne le retient de
        passer sous des meubles construits plus tard.
        Le mur du lavabo était de ceux-là.

        Le groupe entre donc trié par PROFONDEUR. Les paires contraintes
        gardent leurs flèches ; toutes les autres — l'immense majorité —
        gardent l'ordre que la profondeur leur donnait déjà, et qui est juste.
        Le classement ne réordonne plus que ce qu'on lui demande de
        réordonner.
      */
      const range = [...groupe].sort((a, b) => a.depth - b.depth);
      // Les arêtes entrent dans le classement avec les aplats : c'est par
      // elles qu'on croyait voir au travers des meubles.
      // Chaque arête est LIÉE à son pan : elle passe après lui, sans perdre
      // ses propres contraintes.
      const ou = new Map<number, number>();
      range.forEach((g, i) => {
        if (g.pan !== undefined) ou.set(g.pan, i);
      });
      const liens: [number, number][] = [];
      const panDe = range.map(() => -1);
      range.forEach((g, i) => {
        if (g.bord === undefined) return;
        const j = ou.get(g.bord);
        if (j !== undefined && j !== i) {
          liens.push([j, i]);
          panDe[i] = j;
        }
      });
      for (const [i, j] of masques(range)) liens.push([i, j]);
      ordreLocal(range, liens, panDe).forEach((g, k) => {
        g.depth = bas + k * pas;
      });
      /*
        ET L'ARÊTE RECOLLE À SON PAN, TOUJOURS.

        Relevé du patron : « en tournant on voit les arêtes des murs, mais au
        relâchement des arêtes disparaissent ; si j'appuie seulement, tout
        apparaît ». Deux états du même modèle, deux dessins : c'est le
        classement qui changeait de règle en cours de route.

        Sous le doigt, chaque arête suit SON pan — elle se peint juste après
        lui, et rien ne peut se glisser entre les deux. Au repos, elle entrait
        dans le classement avec ses propres contraintes, et le lien qui la
        rattache à son pan n'était qu'une flèche de plus dans le graphe : dès
        qu'elle se trouvait prise dans une ronde (trois faces qui se
        recouvrent en cercle), il fallait trancher, et le dénouement la
        posait AVANT son pan — qui la repeignait aussitôt. Mesuré : deux
        cent dix-sept arêtes perdues sur quatre-vingt-dix angles, contre zéro
        sous le doigt.

        On applique donc la même règle dans les deux états. Elle ne coûte
        rien à l'ordre des PANS — le pas d'un rang étant deux fois l'écart
        qu'on ajoute, un pan qui passe après le nôtre passe encore après son
        arête — et le modèle cesse de changer de dessin quand on lâche.
      */
      const rangPan = new Map<number, number>();
      for (const g of groupe) {
        if (g.pan !== undefined) rangPan.set(g.pan, g.depth);
      }
      for (const g of groupe) {
        if (g.bord === undefined) continue;
        const d = rangPan.get(g.bord);
        if (d !== undefined) g.depth = d + pas / 2;
      }
      continue;
    }
    const aplats = groupe.filter((g) => g.proj.length >= 3 && g.pan !== undefined);
    if (aplats.length < 2) continue;
    const pas = Math.max(1e-6, (haut - bas) / (aplats.length + 1));
    /** Profondeur attribuée à chaque pan : ses arêtes la reprennent. */
    const rang = new Map<number, number>();
    // La règle du pan qui masque sa pièce vaut aussi sous le doigt : elle ne
    // coûte rien — c'est une flèche, pas un test au pixel.
    ordreLocal(aplats, masques(aplats)).forEach((g, k) => {
      g.depth = bas + k * pas;
      if (g.pan !== undefined) rang.set(g.pan, g.depth);
    });
    for (const g of groupe) {
      if (g.bord === undefined) continue;
      const d = rang.get(g.bord);
      // Juste APRÈS son pan : elle le borde, elle ne se laisse pas repeindre
      // par lui.
      if (d !== undefined) g.depth = d + pas / 2;
    }
  }
}

/** Le point est-il dans ce polygone d'écran ? */
function dansPoly(
  pt: { sx: number; sy: number },
  poly: { sx: number; sy: number }[],
): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (
      poly[i].sy > pt.sy !== poly[j].sy > pt.sy &&
      pt.sx <
        ((poly[j].sx - poly[i].sx) * (pt.sy - poly[i].sy)) /
          (poly[j].sy - poly[i].sy) +
          poly[i].sx
    ) {
      dedans = !dedans;
    }
  }
  return dedans;
}

/**
 * La profondeur du plan de cette face au point donné. La projection étant
 * orthographique, elle s'interpole linéairement : trois sommets suffisent.
 */
function profondeurAu(
  proj: { sx: number; sy: number; depth: number }[],
  pt: { sx: number; sy: number },
): number | null {
  /*
    UN TRAIT AUSSI A UNE PROFONDEUR.

    Les trois quarts des faces d'un meuble sont ses arêtes, et un segment n'a
    pas d'aire : le tri ne pouvait rien en dire, et celles du dos passaient
    par-dessus l'avant — le meuble paraissait transparent. On interpole donc
    le long du segment, comme on interpole dans un triangle.
  */
  if (proj.length === 2) {
    const [a, b] = proj;
    const ex = b.sx - a.sx;
    const ey = b.sy - a.sy;
    const l2 = ex * ex + ey * ey;
    if (l2 < 1e-9) return a.depth;
    const t = Math.max(
      0,
      Math.min(1, ((pt.sx - a.sx) * ex + (pt.sy - a.sy) * ey) / l2),
    );
    return a.depth + (b.depth - a.depth) * t;
  }
  for (let i = 1; i + 1 < proj.length; i++) {
    const [a, b, c] = [proj[0], proj[i], proj[i + 1]];
    const det = (b.sy - c.sy) * (a.sx - c.sx) + (c.sx - b.sx) * (a.sy - c.sy);
    if (Math.abs(det) < 1e-9) continue;
    const l1 =
      ((b.sy - c.sy) * (pt.sx - c.sx) + (c.sx - b.sx) * (pt.sy - c.sy)) / det;
    const l2 =
      ((c.sy - a.sy) * (pt.sx - c.sx) + (a.sx - c.sx) * (pt.sy - c.sy)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
    return a.depth * l1 + b.depth * l2 + c.depth * l3;
  }
  return null;
}

/**
 * LA CAMÉRA POSÉE DANS LE LOGEMENT — la vue à hauteur d'homme.
 *
 * Tout le reste de ce fichier travaille en projection ORTHOGRAPHIQUE : les
 * fuyantes restent parallèles, un mur du fond garde la taille d'un mur de
 * devant. C'est ce qu'il faut pour un plan — on y mesure — et c'est
 * exactement ce qu'il ne faut pas pour montrer une pièce à un client : dans
 * une maquette vue de loin, personne ne se projette.
 *
 * Cette projection-ci met l'œil DANS la pièce, à 1,60 m du sol, avec une
 * ouverture d'objectif : les murs s'écartent, le plafond passe au-dessus, et
 * l'on tourne sur soi-même comme dans un jeu. Rien d'autre ne change : les
 * mêmes faces, le même tri du plus lointain au plus proche, les mêmes
 * couleurs.
 *
 * `yaw` est l'azimut du regard (0 = vers les z croissants), `pitch` son
 * inclinaison (positif vers le haut), `fov` l'ouverture verticale en degrés.
 */
export interface PovCamera {
  at: P3;
  yaw: number;
  pitch: number;
  fov: number;
}

/** Distance minimale devant l'œil : en deçà, on coupe. */
const PRES = 0.05;

/**
 * Le repère de l'œil : avant, droite, haut. C'est la seule trigonométrie de
 * l'affaire, et elle se calcule une fois par image.
 */
export function povBase(cam: PovCamera) {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  return {
    avant: { x: sy * cp, y: sp, z: cy * cp },
    droite: { x: cy, y: 0, z: -sy },
    haut: { x: -sy * sp, y: cp, z: -cy * sp },
  };
}

/**
 * Projette un point du monde à l'écran, vu de cette caméra.
 *
 * `depth` suit la même convention que la vue orthographique : il CROÎT quand
 * on se rapproche de l'œil, pour que le tri du plus lointain au plus proche
 * ne change pas d'un mode à l'autre.
 */
export function povProjector(
  cam: PovCamera,
  layout: { w: number; h: number },
): (p: P3) => { sx: number; sy: number; depth: number; devant: number } {
  const b = povBase(cam);
  // Focale : la moitié de la hauteur de l'écran divisée par la tangente du
  // demi-angle. C'est la définition même de l'ouverture.
  const f = layout.h / 2 / Math.tan(((cam.fov / 2) * Math.PI) / 180);
  return (p: P3) => {
    const dx = p.x - cam.at.x;
    const dy = p.y - cam.at.y;
    const dz = p.z - cam.at.z;
    const devant = dx * b.avant.x + dy * b.avant.y + dz * b.avant.z;
    const droite = dx * b.droite.x + dy * b.droite.y + dz * b.droite.z;
    const haut = dx * b.haut.x + dy * b.haut.y + dz * b.haut.z;
    const q = Math.max(PRES, devant);
    return {
      sx: layout.w / 2 + (droite / q) * f,
      sy: layout.h / 2 - (haut / q) * f,
      depth: -devant,
      devant,
    };
  };
}

/**
 * COUPE AU RAS DE L'ŒIL.
 *
 * Une face traversée par le plan de l'œil — le sol sous nos pieds, le mur
 * qu'on frôle — a des sommets devant ET derrière. Les projeter tous
 * donnerait un polygone retourné, qui barre l'écran. On découpe donc la
 * face contre ce plan, comme on taillerait une planche : les sommets de
 * devant sont gardés, et l'on ajoute le point de passage sur chaque arête
 * qui traverse.
 */
export function coupeDevant(pts: P3[], cam: PovCamera): P3[] {
  const b = povBase(cam);
  const devant = (p: P3) =>
    (p.x - cam.at.x) * b.avant.x +
    (p.y - cam.at.y) * b.avant.y +
    (p.z - cam.at.z) * b.avant.z;
  /*
    UN TRAIT SE TAILLE AUSSI — et ce n'est pas un détail.

    On ne coupait que les contours fermés : les ARÊTES, elles, partaient
    telles quelles. Une arête de mur qui traverse le plan de l'œil projette
    alors un point de l'autre côté de l'infini, et le trait barre l'écran en
    diagonale. L'audit en a compté quarante-cinq mille sur un tour d'horizon.

    Un segment se traite comme une ligne OUVERTE : on ne referme pas la
    boucle, sinon on invente une arête de retour qui n'existe pas.
  */
  if (pts.length === 2) {
    const [p, q] = pts;
    const dp = devant(p) - PRES;
    const dq = devant(q) - PRES;
    if (dp < 0 && dq < 0) return [];
    if (dp >= 0 && dq >= 0) return pts;
    const t = dp / (dp - dq);
    const coupe: P3 = {
      x: p.x + (q.x - p.x) * t,
      y: p.y + (q.y - p.y) * t,
      z: p.z + (q.z - p.z) * t,
    };
    return dp >= 0 ? [p, coupe] : [coupe, q];
  }
  const sortie: P3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    const da = devant(a) - PRES;
    const dc = devant(c) - PRES;
    if (da >= 0) sortie.push(a);
    if (da >= 0 !== dc >= 0) {
      const t = da / (da - dc);
      sortie.push({
        x: a.x + (c.x - a.x) * t,
        y: a.y + (c.y - a.y) * t,
        z: a.z + (c.z - a.z) * t,
      });
    }
  }
  return sortie;
}

/**
 * La face tourne-t-elle le dos à CE POINT DE VUE ?
 *
 * En orthographique, une seule direction de regard suffit pour toute la
 * scène. De l'intérieur d'une pièce, non : le mur de gauche et celui de
 * droite se regardent, et c'est la position de l'œil qui dit lequel des deux
 * nous montre sa face.
 */
/**
 * NE GARDER QU'UN MUR — la règle de la visite guidée.
 *
 * On présente un mur : les autres sortent du champ, avec leurs menuiseries
 * et l'appareillage qui y est plaqué. Tout ce qui n'appartient à aucun mur
 * — le sol, le mobilier, le plafond — reste : c'est ce qui dit dans quelle
 * pièce on se tient, et un pan de maçonnerie seul dans le vide ne se
 * comprend plus.
 *
 * Sans mur désigné, rien n'est retiré.
 */
export function visibleAvecLeMur(
  face: Face3D,
  focusWallId: string | null | undefined,
): boolean {
  return !focusWallId || !face.wallId || face.wallId === focusWallId;
}

export function dosTourne(face: Face3D, oeil: P3): boolean {
  const n = face.normal;
  if (!n) return false;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of face.pts) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  const k = face.pts.length || 1;
  const vers =
    (cx / k - oeil.x) * n.x + (cy / k - oeil.y) * n.y + (cz / k - oeil.z) * n.z;
  return vers >= 0;
}

export function roomRanks(rooms: SceneRoom[], cam: CameraTrig): Map<string, number> {
  const cle = (r: SceneRoom) =>
    (r.centroid.x * cam.st + r.centroid.z * cam.ct) * cam.sp;
  return new Map(
    [...rooms]
      .sort((a, b) => cle(a) - cle(b))
      .map((r, i) => [r.roomId, i] as [string, number]),
  );
}

export function isHiddenFace(face: Face3D, cam: CameraTrig): boolean {
  const vers = (v: P3) =>
    v.x * cam.st * cam.sp + v.y * cam.cp + v.z * cam.ct * cam.sp;
  // Posé sur la face cachée d'un mur : le mur le masque, quoi qu'en dise le
  // tri en profondeur.
  if (face.facing && vers(face.facing) <= 0) return true;
  const n = face.normal;
  if (!n) return false;
  return vers(n) <= 0;
}

/**
 * Opacité d'une face extérieure de mur, selon l'angle de vue.
 *
 * Un mur vu de champ ne cache rien : il reste plein. Plus il nous fait
 * face, plus il masque la pièce, et plus il s'efface — jusqu'à 15 %, de
 * quoi garder l'arête qui dit où il est. Le passage est progressif : un
 * mur qui disparaîtrait d'un coup ferait sauter le dessin à chaque degré
 * de rotation.
 */
export function cutawayOpacity(n: P3, cam: CameraTrig): number {
  const vers = n.x * cam.st * cam.sp + n.y * cam.cp + n.z * cam.ct * cam.sp;
  if (vers <= SEUIL_ECORCHE) return 1;
  const t = Math.min(1, (vers - SEUIL_ECORCHE) / 0.45);
  // Lissage cubique : ni marche, ni rampe linéaire visible.
  const doux = t * t * (3 - 2 * t);
  return 1 - 0.85 * doux;
}

/** Couleurs neutres du rendu (l'app suit son thème, le PDF le sien). */
export interface ScenePalette {
  floor: string;
  floorStroke: string;
  wall: string;
  wallStroke: string;
  wallTop: string;
  wallTopStroke: string;
  opening: string;
  door: string;
  window: string;
  /** Baie libre ou porte ouverte : un vide, tracé en pointillé. */
  passage: string;
  object: string;
  objectTop: string;
  objectStroke: string;
}

export interface SceneOptions {
  palette: ScenePalette;
  /** Portes et fenêtres teintées. */
  colorOpenings?: boolean;
  /** Sol visible (surface de la pièce). */
  showSurfaces?: boolean;
  /** Couleurs et textures relevées pendant le scan. */
  showTextures?: boolean;
  /** Relevé du sol par pièce, indexé par identifiant de pièce. */
  floors?: Record<string, FloorData | null | undefined>;
  /** Pièces du scan, avec les murs qui bordent chacune. */
  rooms?: RoomShape[];
  /** Appareillage électrique posé sur les faces de murs. */
  fixtures?: Fixture[];
  /**
   * LE PLAFOND : points lumineux, détection, ventilation.
   *
   * Le plan le portait, le dossier imprimé aussi, la 3D non : on équipait
   * un plafond, on basculait en 3D pour montrer à un client, et tout avait
   * disparu. Ils se posent à la hauteur du plafond de LEUR pièce — un
   * logement n'a pas partout la même hauteur sous plafond.
   */
  ceiling?: CeilingFixture[];
  /**
   * LES GAINES, en volume.
   *
   * Le plan les montrait en tireté, la 3D pas du tout : on préparait un
   * chantier sur un modèle qui ne disait pas où passe le conduit. Ce sont
   * des TUBES, posés dans la chape et remontés au nu du mur jusqu'à
   * l'appareil — de quoi lire un cheminement sans le déduire.
   */
  routes?: { id: string; path: Pt[] }[];
  /** Hauteur de l'appareil desservi par chaque gaine, pour la remontée. */
  routeHeights?: Record<string, number>;
  /**
   * Rendu allégé pendant un geste : les pans ne sont plus découpés en bandes,
   * ce qui divise le nombre de polygones par cinq. Le volume reste complet,
   * contours compris — seule la finesse du tri en profondeur baisse, et le
   * rendu exact revient dès que le doigt se lève.
   */
  coarse?: boolean;
}

/** Décalage de la lumière par rapport à l'azimut de la caméra (35°). */
const LIGHT_COS = Math.cos((35 * Math.PI) / 180);
const LIGHT_SIN = Math.sin((35 * Math.PI) / 180);

/** Découpe des pans : au-delà, le tri « du peintre » devient faux localement. */
const STEP = 0.6;
/** Mode « geste » : pans d'un seul tenant, pour tenir 60 images par seconde. */
const COARSE_STEP = 1e6;
/** Nombre maximum de rangées de texels rendues sur un mur. */
const MAX_TEX_ROWS = 4;
/** Ce qui se pose forcément par terre : rien de tout ça ne se suspend. */
const POSE_AU_SOL =
  /bed|sofa|couch|table|desk|chair|stool|refrigerator|fridge|stove|oven|dishwasher|washer|dryer|toilet|bathtub|shower|storage|cabinet|wardrobe|plant/i;

/** Épaisseur d'une plaque d'appareillage (8 mm), et côté d'un mécanisme. */
const PLAQUE_EP = 0.008;
const MECANISME = 0.045;

const lerp2 = (P: Pt, Q: Pt, t: number): Pt => ({
  x: P.x + (Q.x - P.x) * t,
  z: P.z + (Q.z - P.z) * t,
});

/** Normale sortante d'un pan p→q, avec la convention de `vquad`. */
const outwardOf = (p: Pt, q: Pt): P3 => {
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: -dz / len, y: 0, z: dx / len };
};

/** Ouverture rattachée à un mur, en fraction de longueur et en hauteur. */
export interface WallHole {
  seg: WallSeg;
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}

/**
 * Rattache chaque porte/fenêtre au mur qui la porte.
 *
 * RoomPlan livre les ouvertures comme des surfaces indépendantes, posées dans
 * le plan de leur mur mais sans lien avec lui. Sans ce rattachement, on ne
 * peut que les poser PAR-DESSUS le mur — et c'est exactement ce qui les
 * faisait passer devant ou derrière selon l'angle de vue.
 *
 * La clé `used:<id>` marque les ouvertures effectivement rattachées.
 */
export function assignOpenings(
  walls: WallSeg[],
  openings: WallSeg[],
  floorY: number,
): Map<string, WallHole[]> {
  const out = new Map<string, WallHole[]>();
  for (const o of openings) {
    const od = { x: o.b.x - o.a.x, z: o.b.z - o.a.z };
    const ol = Math.hypot(od.x, od.z) || 1;
    const ou = { x: od.x / ol, z: od.z / ol };
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };

    /*
      LA PIÈCE DÉPARTAGE, ELLE N'EXCLUT PAS.

      Le filtre était éliminatoire : tout mur dont la pièce différait de
      celle de l'ouverture était écarté d'emblée. Une baie sans `roomId` —
      un scan d'avant la détection des pièces, une ouverture ajoutée à la
      main — ne trouvait alors AUCUN mur, disparaissait du modèle 3D et de
      la feuille d'élévation, pendant que le plan 2D continuait de la
      dessiner. La porte était sur le plan et absente du mur vu de face,
      sans que rien ne le signale.

      La pièce reste ce qui tranche quand deux murs se superposent — une
      porte de palier ne doit pas percer la cloison du voisin — mais elle ne
      décide plus seule qu'il n'y a pas de mur du tout : à égalité de
      géométrie, le mur de sa pièce gagne ; sinon, le plus proche fait
      l'affaire.
    */
    let best: { wall: WallSeg; dist: number; sienne: boolean } | null = null;
    for (const w of walls) {
      const wd = { x: w.b.x - w.a.x, z: w.b.z - w.a.z };
      const wl = Math.hypot(wd.x, wd.z) || 1;
      // Parallèle à moins de ~25°, et posée à même le mur.
      if (Math.abs((wd.x * ou.x + wd.z * ou.z) / wl) < 0.9) continue;
      const { dist } = pointOnSeg(mid, w.a, w.b);
      if (dist > 0.6) continue;
      const sienne = roomOf(w) === roomOf(o);
      const mieux =
        !best ||
        (sienne && !best.sienne) ||
        (sienne === best.sienne && dist < best.dist);
      if (mieux) best = { wall: w, dist, sienne };
    }
    if (!best) continue;

    const w = best.wall;
    const wd = { x: w.b.x - w.a.x, z: w.b.z - w.a.z };
    const wl2 = wd.x * wd.x + wd.z * wd.z || 1;
    const along = (p: Pt) =>
      ((p.x - w.a.x) * wd.x + (p.z - w.a.z) * wd.z) / wl2;
    const ta = along(o.a);
    const tb = along(o.b);
    const t0 = Math.max(0, Math.min(ta, tb));
    const t1 = Math.min(1, Math.max(ta, tb));
    if (t1 - t0 < 1e-3) continue;
    const y0 = Math.max(0, o.yCenter - o.height / 2 - floorY);
    const y1 = Math.min(w.height, y0 + o.height);
    if (y1 - y0 < 1e-3) continue;

    const list = out.get(w.id) ?? [];
    list.push({ seg: o, t0, t1, y0, y1 });
    out.set(w.id, list);
    out.set(`used:${o.id}`, []);
  }
  return out;
}

/** Un morceau plein de mur : trumeau, linteau ou allège. */
export interface WallPanel {
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}

/**
 * Découpe un mur autour de ses ouvertures. Le mur ne se construit JAMAIS
 * dans le vide laissé par une porte : à gauche et à droite un trumeau pleine
 * hauteur, au-dessus un linteau, en dessous une allège s'il y en a une.
 * Deux ouvertures qui se chevauchent sont fusionnées plutôt que superposées.
 */
export function wallPanels(holes: WallHole[], height: number): WallPanel[] {
  if (holes.length === 0) return [{ t0: 0, t1: 1, y0: 0, y1: height }];
  const sorted = [...holes].sort((a, b) => a.t0 - b.t0);
  const out: WallPanel[] = [];
  let cursor = 0;
  for (const hole of sorted) {
    const t0 = Math.max(cursor, hole.t0);
    const t1 = Math.max(t0, Math.min(1, hole.t1));
    if (t1 - t0 < 1e-4) continue;
    if (t0 - cursor > 1e-4) out.push({ t0: cursor, t1: t0, y0: 0, y1: height });
    if (hole.y0 > 1e-3) out.push({ t0, t1, y0: 0, y1: hole.y0 });
    if (hole.y1 < height - 1e-3) {
      out.push({ t0, t1, y0: hole.y1, y1: height });
    }
    cursor = t1;
  }
  if (cursor < 1 - 1e-4) out.push({ t0: cursor, t1: 1, y0: 0, y1: height });
  return out;
}

const vquad = (p: Pt, q: Pt, yb: number, yt: number): P3[] => [
  { x: p.x, y: yb, z: p.z },
  { x: q.x, y: yb, z: q.z },
  { x: q.x, y: yt, z: q.z },
  { x: p.x, y: yt, z: p.z },
];

/**
 * Ombrage d'un pan vertical selon l'angle de vue : les faces tournées vers
 * la caméra sont claires, celles de profil s'assombrissent. `ct`/`st` sont
 * le cosinus et le sinus de l'azimut de la caméra.
 */
export function shadeFill(face: Face3D, ct: number, st: number): string | null {
  if (!face.shade || !face.fill) return face.fill;
  let nx: number;
  let nz: number;
  if (face.normal) {
    nx = face.normal.x;
    nz = face.normal.z;
  } else {
    const a = face.pts[0];
    const b = face.pts[1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    nx = -dz / len;
    nz = dx / len;
  }
  // Lumière DÉCALÉE de la caméra (35°). Éclairée dans l'axe du regard, deux
  // faces symétriques par rapport à celui-ci reçoivent exactement la même
  // teinte : l'arête entre elles s'efface et le meuble paraît amputé d'un
  // flanc. Le décalage garantit que deux faces voisines diffèrent toujours.
  const lx = st * LIGHT_COS + ct * LIGHT_SIN;
  const lz = ct * LIGHT_COS - st * LIGHT_SIN;
  const facing = (nx * lx + nz * lz + 1) / 2;
  return face.captured
    ? mixHex(
        mixHex(face.fill, '#3B424E', 0.34),
        mixHex(face.fill, '#FFFFFF', 0.24),
        facing,
      )
    : /*
         L'OMBRE TIRE SUR LE BRUN, PAS SUR LE BLEU.

         Le côté sombre d'un mur empruntait un gris bleuté — la couleur
         d'une ombre au néon. Dans une pièce éclairée par le jour, une ombre
         garde la chaleur de ce qu'elle assombrit. C'est le même calcul, à
         une teinte près, et c'est ce qui fait passer le rendu du dessin
         technique à la maquette.
      */
      mixHex(
        mixHex(face.fill, '#A08D74', 0.38),
        mixHex(face.fill, '#FFFFFF', 0.34),
        facing,
      );
}

/** Une pièce telle que la scène l'a rendue : de quoi poser cotes et semis. */
export interface SceneRoom {
  roomId: string;
  /** Contour et aire du sol, si la pièce en a un. */
  surface: RoomSurface | null;
  /** Centre de la pièce. */
  centroid: Pt;
  /** Où poser le cartouche : au large, jamais dans un mur. */
  labelAt: Pt;
  /** Couleur de fond du sol effectivement employée. */
  floorFill: string;
}

export interface Scene {
  faces: Face3D[];
  /** Une entrée par pièce du scan. */
  rooms: SceneRoom[];
  /** Niveau du sol dans le repère monde (m). */
  floorY: number;
}

/**
 * Cadrage d'une scène : centre et rayon englobants.
 *
 * Le centre vient de la BOÎTE englobante, pas de la moyenne des points : la
 * moyenne dépend du nombre de sommets, donc du découpage en bandes, et le
 * modèle sauterait au moment où le rendu passe en mode geste. La boîte, elle,
 * ne dépend que des extrémités — identique dans les deux modes. La vue de
 * l'app et le PDF partagent ce calcul, donc le même cadrage.
 */
export function sceneFraming(faces: Face3D[]): {
  center: P3;
  radius3d: number;
} {
  let lo = { x: Infinity, y: Infinity, z: Infinity };
  let hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  let n = 0;
  for (const f of faces) {
    for (const p of f.pts) {
      n++;
      lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) };
      hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) };
    }
  }
  if (n === 0) return { center: { x: 0, y: 0, z: 0 }, radius3d: 1 };
  const center = {
    x: (lo.x + hi.x) / 2,
    y: (lo.y + hi.y) / 2,
    z: (lo.z + hi.z) / 2,
  };
  const radius3d = Math.max(
    0.5,
    Math.hypot(hi.x - center.x, hi.y - center.y, hi.z - center.z),
  );
  return { center, radius3d };
}

/** Construit la scène complète : sol, murs, ouvertures, meubles. */
export function buildScene(
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  opts: SceneOptions,
): Scene {
  const { palette: pal } = opts;
  const faces: Face3D[] = [];
  const parts = roomParts(walls, opts.rooms);
  // Les nœuds de `wallQuads` sont déjà cloisonnés par pièce : un seul appel
  // suffit, deux pièces mitoyennes n'y forment pas d'onglet commun.
  const quads = wallQuads(walls);
  const interiorOf = new Map(parts.map((p) => [p.roomId, p.labelAt]));
  const wallsOf = new Map(parts.map((p) => [p.roomId, p.walls]));
  const fallbackInterior = wallsCentroid(walls);
  const floorY =
    walls.length > 0 ? Math.min(...walls.map((w) => w.yCenter - w.height / 2)) : 0;

  // --------------------------------------------------------------- sols
  // Un sol par pièce : sa couleur moyenne, puis le détail des cases
  // entièrement contenues dans SON contour.
  const rooms: SceneRoom[] = parts.map((part) => {
    const floor = opts.floors?.[part.roomId] ?? null;
    const floorFill = (opts.showTextures ? floor?.color : undefined) ?? pal.floor;
    const surface = part.surface;
    if (surface && opts.showSurfaces) {
      faces.push({
        pts: surface.pts.map((p) => ({ x: p.x, y: 0, z: p.z })),
        fill: floorFill,
        stroke: pal.floorStroke,
        isFloor: true,
      });
      const ftex = opts.showTextures ? floor?.texture : undefined;
      if (ftex && ftex.cols > 0 && ftex.rows > 0) {
        const cw = (ftex.maxX - ftex.minX) / ftex.cols;
        const ch = (ftex.maxZ - ftex.minZ) / ftex.rows;
        for (let r = 0; r < ftex.rows; r++) {
          for (let i = 0; i < ftex.cols; i++) {
            const x0 = ftex.minX + i * cw;
            const z0 = ftex.minZ + r * ch;
            const cell: Pt[] = [
              { x: x0, z: z0 },
              { x: x0 + cw, z: z0 },
              { x: x0 + cw, z: z0 + ch },
              { x: x0, z: z0 + ch },
            ];
            if (!cell.every((p) => pointInPolygon(p, surface.pts))) continue;
            const col = floorColorAt(floor, { x: x0 + cw / 2, z: z0 + ch / 2 });
            if (!col) continue;
            faces.push({
              pts: cell.map((p) => ({ x: p.x, y: 0, z: p.z })),
              fill: col,
              stroke: null,
              isFloor: true,
            });
          }
        }
      }
    }
    return {
      roomId: part.roomId,
      surface,
      centroid: part.centroid,
      labelAt: part.labelAt,
      floorFill,
    };
  });

  const step = opts.coarse ? COARSE_STEP : STEP;

  /**
   * Arête isolée. Un contour ne peut PAS être un grand polygone posé sur tout
   * le pan : sa profondeur moyenne le placerait devant un meuble pourtant
   * plus proche, et on verrait le trait le traverser. Chaque arête est donc
   * un segment à part, trié à sa propre profondeur.
   */
  /**
   * Biais de tri des arêtes, en mètres.
   *
   * Il valait 4 mm — dérisoire à côté d'une épaisseur de mur de 14 cm : la
   * moindre face voisine, dessinée après, effaçait le trait. Le silhouettage
   * disparaissait alors sur fond blanc, sauf pendant un geste où un pan n'est
   * pas découpé et son contour redevient un quadrilatère plus large.
   *
   * 5 cm : une arête l'emporte sur tout ce qui la frôle (faces coplanaires,
   * bandes voisines, menuiserie en retrait de 22 %), mais reste masquée par
   * une géométrie franchement plus proche — un mur devant en cache toujours
   * un autre.
   */
  const EDGE_BIAS = 0.02;

  /** `at` = centre du pan bordé : c'est lui qui donne sa place à l'arête. */
  /** Numéro du pan en cours : ses arêtes le porteront. */
  let panCourant = 0;
  const pushEdge = (p: P3, q: P3, stroke: string, normal?: P3, at?: P3) => {
    faces.push({
      pts: [p, q],
      fill: null,
      stroke,
      bias: EDGE_BIAS,
      normal,
      depthAt: at,
      bordDe: panCourant || undefined,
    });
  };

  /** Contour d'un quadrilatère non découpé : un seul polygone suffit. */
  const pushOutline = (pts: P3[], stroke: string, normal?: P3) => {
    faces.push({
      pts,
      fill: null,
      stroke,
      bias: EDGE_BIAS,
      normal,
      bordDe: panCourant || undefined,
    });
  };

  /**
   * Pan vertical découpé en bandes. Avec une texture, chaque bande est en
   * plus découpée en hauteur : la grille de couleurs relevée au scan se
   * retrouve telle quelle sur le mur.
   *
   * `outline` fait dessiner le contour du pan SANS ses coupures internes :
   * les bandes sont un artifice de tri, elles ne doivent pas se voir.
   */
  const pushStrips = (
    p: Pt,
    q: Pt,
    yb: number,
    yt: number,
    fill: string,
    o: {
      shade?: boolean;
      captured?: boolean;
      tex?: SurfaceTexture;
      /** Position dans la texture aux extrémités p et q (0 = extrémité A). */
      uFrom?: number;
      uTo?: number;
      outline?: string;
      normal?: P3;
      /** Le pan appartient à la face extérieure d'un mur. */
      cutaway?: boolean;
      /**
       * D'UN SEUL TENANT — aucune découpe en bandes.
       *
       * Un mur se découpe : ses bandes lui donnent la finesse de tri qu'un
       * grand pan n'a pas, et sa texture s'y échantillonne. Un MEUBLE, non.
       * Ses morceaux se touchent presque — une porte dépasse de seize
       * millimètres du caisson qui la porte — et chaque bande du caisson,
       * triée sur son propre milieu, pouvait repasser par-dessus la porte :
       * autant de rayures en travers du meuble. C'est ce que le chantier a
       * photographié sur le canapé.
       *
       * D'un seul tenant, il n'y a plus de bande à mal trier — et le modèle
       * s'allège d'autant.
       */
      whole?: boolean;
      /**
       * ALTITUDE DE TRI : un mur se classe COMME UN PLAN, pas morceau par
       * morceau.
       *
       * La vue peint du plus lointain au plus proche, et la profondeur
       * mêle l'éloignement à l'altitude : plus un point est haut, plus il
       * est près de l'œil. Un mur percé d'une fenêtre est découpé en
       * panneaux — celui sous l'allège a son centre à cinquante
       * centimètres, celui du linteau à deux mètres vingt : plus d'un
       * mètre de profondeur d'écart entre deux morceaux du MÊME plan.
       * Tout ce qui se glissait entre les deux — une armoire derrière le
       * mur — passait devant l'un et derrière l'autre : le meuble
       * traversait la cloison.
       *
       * En classant chaque morceau à la mi-hauteur du mur, le mur
       * redevient une seule surface : rien ne peut plus s'y intercaler.
       */
      depthY?: number;
    } = {},
  ) => {
    const cols = o.whole
      ? 1
      : Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / step));
    // PAS de découpe en hauteur — sauf pour poser une texture.
    //
    // Je l'avais ajoutée sur un raisonnement : un pan pleine hauteur se trie
    // sur une profondeur moyenne dominée par son altitude, donc un meuble
    // pourrait le traverser. Sur l'appareil, elle a surtout produit des
    // défauts visibles : deux surfaces voisines découpées sur des grilles
    // DIFFÉRENTES (un trumeau de 2,5 m et une fenêtre de 1,1 m ne tombent pas
    // sur les mêmes coupures) s'entrelacent au tri et dessinent un escalier
    // le long des ouvertures. Le vrai remède au meuble traversant était
    // ailleurs — c'est `clampFootprint` qui le sort du mur.
    const rows = o.tex
      ? Math.min(MAX_TEX_ROWS, Math.max(1, o.tex.rows))
      : 1;
    for (let i = 0; i < cols; i++) {
      const s0 = lerp2(p, q, i / cols);
      const s1 = lerp2(p, q, (i + 1) / cols);
      for (let r = 0; r < rows; r++) {
        const top = yt - ((yt - yb) * r) / rows;
        const bot = yt - ((yt - yb) * (r + 1)) / rows;
        let paint = fill;
        if (o.tex) {
          const uf = o.uFrom ?? 0;
          const ut = o.uTo ?? 1;
          const u = uf + (ut - uf) * ((i + 0.5) / cols);
          const s = sampleTexture(o.tex, u, (r + 0.5) / rows);
          if (s) paint = s;
        }
        panCourant += 1;
        /*
          UN PAN D'UN SEUL TENANT PORTE SON CONTOUR.

          Un mur se découpe en bandes, et l'on ne peut pas border chaque
          bande : on verrait les coupures. Ses arêtes sont donc des faces à
          part, triées avec le reste. Un MEUBLE, lui, est d'un seul tenant
          depuis qu'on a supprimé ses bandes : son contour se trace avec son
          aplat, d'un seul trait.

          Ce n'est pas un détail. Les trois quarts des faces d'un meuble
          étaient ses arêtes — quatre-vingt-huit traits pour un lit —, et
          aucun tri ne peut départager un trait de son propre pan : ils sont
          coplanaires. Tantôt le trait passait au travers du meuble, tantôt
          le pan l'effaçait et le modèle perdait ses arêtes au lâcher du
          doigt. Tracé AVEC son pan, le contour ne peut plus être ni perdu ni
          déplacé — et le modèle s'allège des trois quarts de ses faces.
        */
        faces.push({
          panId: panCourant,
          pts: vquad(s0, s1, bot, top),
          fill: paint,
          stroke: o.whole ? o.outline ?? null : null,
          shade: o.shade,
          captured: o.captured || !!o.tex,
          normal: o.normal,
          cutaway: o.cutaway,
          depthAt:
            o.depthY === undefined
              ? undefined
              : {
                  x: (s0.x + s1.x) / 2,
                  y: o.depthY,
                  z: (s0.z + s1.z) / 2,
                },
        });

        // D'un seul tenant : le contour est déjà posé sur l'aplat.
        if (o.whole) continue;

        // Contour du POURTOUR, tuile par tuile.
        //
        // Une arête doit se trier avec la TUILE qu'elle borde, pas avec le pan
        // entier : depuis qu'on découpe aussi en hauteur, les tuiles d'un même
        // pan s'étalent sur près d'un mètre de profondeur. Une arête calée sur
        // le milieu du pan passait donc avant les tuiles hautes, qui la
        // repeignaient en escalier — c'est exactement ce qu'on voyait le long
        // des fenêtres, et ce qui laissait des bouts d'arêtes en l'air.
        if (!o.outline) continue;
        const tuile: P3 = {
          x: (s0.x + s1.x) / 2,
          y: (bot + top) / 2,
          z: (s0.z + s1.z) / 2,
        };
        const E = (a: P3, b: P3) => pushEdge(a, b, o.outline!, o.normal, tuile);
        if (r === 0) {
          E({ x: s0.x, y: yt, z: s0.z }, { x: s1.x, y: yt, z: s1.z });
        }
        if (r === rows - 1) {
          E({ x: s0.x, y: yb, z: s0.z }, { x: s1.x, y: yb, z: s1.z });
        }
        if (i === 0) {
          E({ x: s0.x, y: bot, z: s0.z }, { x: s0.x, y: top, z: s0.z });
        }
        if (i === cols - 1) {
          E({ x: s1.x, y: bot, z: s1.z }, { x: s1.x, y: top, z: s1.z });
        }
      }
    }
  };

  const pushTopStrips = (
    e1a: Pt,
    e1b: Pt,
    e2a: Pt,
    e2b: Pt,
    y: number,
    fill: string,
    outline?: string,
    /** +1 = dessus d'un volume, −1 = dessous (linteau vu d'en dessous). */
    facing: 1 | -1 = 1,
    /** D'un seul tenant : un dessus de meuble ne se découpe pas. */
    whole = false,
  ) => {
    const n = whole
      ? 1
      : Math.max(1, Math.ceil(Math.hypot(e1b.x - e1a.x, e1b.z - e1a.z) / step));
    const at = (p: Pt): P3 => ({ x: p.x, y, z: p.z });
    const normal: P3 = { x: 0, y: facing, z: 0 };
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const c1 = lerp2(e1a, e1b, t0);
      const c2 = lerp2(e1a, e1b, t1);
      const c3 = lerp2(e2a, e2b, t1);
      const c4 = lerp2(e2a, e2b, t0);
      panCourant += 1;
      faces.push({
        panId: panCourant,
        pts: [c1, c2, c3, c4].map(at),
        fill,
        // Même raison qu'au-dessus : d'un seul tenant, le dessus d'un meuble
        // porte son propre contour.
        stroke: whole ? outline ?? null : null,
        normal,
      });
      if (!outline || whole) continue;
      if (n === 1) {
        pushOutline([c1, c2, c3, c4].map(at), outline, normal);
        continue;
      }
      const mid: P3 = {
        x: (c1.x + c2.x + c3.x + c4.x) / 4,
        y,
        z: (c1.z + c2.z + c3.z + c4.z) / 4,
      };
      pushEdge(at(c1), at(c2), outline, normal, mid);
      pushEdge(at(c4), at(c3), outline, normal, mid);
      if (i === 0) pushEdge(at(c1), at(c4), outline, normal, mid);
      if (i === n - 1) pushEdge(at(c2), at(c3), outline, normal, mid);
    }
  };

  /**
   * Un VOLUME découpé dans l'épaisseur d'un mur, entre deux abscisses le long
   * de celui-ci. `t0`/`t1` sont des fractions de la longueur du mur, `shrink`
   * un retrait sur l'épaisseur (la porte est en retrait dans son tableau).
   *
   * Les quatre faces verticales, le dessus et le dessous portent chacun leur
   * normale sortante : le rendu jette celles qui tournent le dos. Deux faces
   * d'un même volume ne peuvent donc plus jamais se disputer l'affichage,
   * quel que soit l'angle de vue — c'est ce qui faisait clignoter les murs.
   */
  const pushWallBlock = (
    q: { a1: Pt; b1: Pt; b2: Pt; a2: Pt },
    t0: number,
    t1: number,
    yb: number,
    yt: number,
    o: {
      fill: string;
      top: string;
      stroke: string;
      topStroke: string;
      captured?: boolean;
      /** Le bloc est un mur : ses deux faces se distinguent dedans/dehors. */
      cutaway?: boolean;
      /** Texture appliquée à la face +n (`plus`) ou −n. */
      tex?: SurfaceTexture;
      texOnPlus?: boolean;
      shrink?: number;
      /** Dessous fermé : un linteau se regarde par en dessous. */
      closeBottom?: boolean;
      /** Ombrage selon l'orientation (les meubles restent en aplat). */
      shade?: boolean;
      /** Pans d'un seul tenant : voir `pushStrips`. */
      whole?: boolean;
      /** Altitude de tri commune à tout le mur (voir `pushStrips`). */
      depthY?: number;
      /**
       * Seulement les deux grandes faces — ni chants, ni dessus, ni dessous.
       *
       * Une menuiserie n'a pas de flancs à elle : ses flancs, c'est le
       * TABLEAU DU MUR, que les panneaux voisins dessinent déjà en
       * maçonnerie. Les dessiner aussi, c'est poser deux surfaces au même
       * endroit — et laisser le tri décider laquelle gagne. On voyait donc
       * l'épaisseur du mur peinte en bleu vitrage, selon l'angle.
       */
      facesSeules?: boolean;
    },
  ) => {
    if (t1 - t0 < 1e-4 || yt - yb < 1e-4) return;
    const s = o.shrink ?? 0;
    // p1/q1 longent la face +n, p2/q2 la face −n.
    const p1 = lerp2(lerp2(q.a1, q.b1, t0), lerp2(q.a2, q.b2, t0), s);
    const r1 = lerp2(lerp2(q.a1, q.b1, t1), lerp2(q.a2, q.b2, t1), s);
    const p2 = lerp2(lerp2(q.a2, q.b2, t0), lerp2(q.a1, q.b1, t0), s);
    const r2 = lerp2(lerp2(q.a2, q.b2, t1), lerp2(q.a1, q.b1, t1), s);

    const face = (
      p: Pt,
      r: Pt,
      tex?: SurfaceTexture,
      uFrom = 0,
      uTo = 1,
      extra: { cutaway?: boolean } = {},
    ) =>
      pushStrips(p, r, yb, yt, o.fill, {
        shade: o.shade ?? true,
        captured: o.captured,
        tex,
        uFrom,
        uTo,
        outline: o.stroke,
        normal: outwardOf(p, r),
        cutaway: extra.cutaway,
        depthY: o.depthY,
        whole: o.whole,
      });

    // `texOnPlus` dit déjà quelle face regarde la pièce : l'AUTRE est
    // l'extérieure, celle que l'écorché estompe.
    const dehors = o.cutaway;
    face(p1, r1, o.texOnPlus ? o.tex : undefined, t0, t1, {
      cutaway: dehors === undefined ? undefined : !o.texOnPlus,
    });
    face(r2, p2, o.texOnPlus ? undefined : o.tex, t1, t0, {
      cutaway: dehors === undefined ? undefined : !!o.texOnPlus,
    });
    if (o.facesSeules) return;
    // Tableaux (chants) : trop étroits pour mériter un découpage.
    face(p2, p1);
    face(r1, r2);
    pushTopStrips(p1, r1, p2, r2, yt, o.top, o.topStroke, 1, o.whole);
    if (o.closeBottom) {
      pushTopStrips(r1, p1, r2, p2, yb, o.top, o.topStroke, -1, o.whole);
    }
  };

  // --------------------------------------------------------------- murs
  // Chaque ouverture est rattachée à son mur, puis le mur est bâti AUTOUR
  // d'elle : trumeaux de part et d'autre, linteau au-dessus, allège en
  // dessous. Plus rien ne se superpose, donc plus une seule couleur qui en
  // recouvre une autre selon l'angle.
  const holes = assignOpenings(walls, openings, floorY);

  /*
    ON NE DÉCOUPE UN MUR QUE S'IL Y A QUELQUE CHOSE À DÉPARTAGER.

    Relevé du patron : « la 3D n'est pas du tout fluide, même sans meuble ».
    La mesure lui a donné raison : une pièce VIDE — quatre murs, rien dedans
    — produisait trois cent cinquante-trois faces, dont deux cent
    vingt-neuf à repeindre à chaque image du geste.

    Elles venaient du découpage des pans en bandes de soixante centimètres,
    qui a une raison et une seule : donner au tri du peintre la finesse
    qu'un pan d'un seul tenant n'a pas, pour qu'un meuble posé devant la
    moitié proche d'un long mur ne soit pas classé derrière tout le mur.
    C'est le canapé du chantier, et c'est pour lui que le mode « grossier »
    a été retiré.

    Mais dans une pièce vide, il n'y a RIEN à départager : on payait la
    finesse d'un tri sans litige à trancher. On regarde donc, mur par mur,
    s'il a quelque chose devant lui — un meuble, un appareil — assez près
    pour que la question se pose. Sinon, le pan reste d'un seul tenant.

    La MARGE est large exprès (deux mètres) : elle se compare au centre de
    l'objet, dont on ignore ici l'encombrement exact et l'orientation, et
    une bande de trop ne coûte qu'un peu de dessin — une bande manquante
    fait disparaître un canapé.
  */
  const MARGE_LITIGE = 2;
  const devantLeMur = (w: WallSeg): boolean => {
    const ax = w.a.x;
    const az = w.a.z;
    const vx = w.b.x - ax;
    const vz = w.b.z - az;
    const long2 = vx * vx + vz * vz || 1;
    const proche = (px: number, pz: number) => {
      // Distance du point au SEGMENT, pas à sa droite : un meuble situé
      // dans le prolongement d'un mur n'est pas devant lui.
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / long2));
      const dx = px - (ax + vx * t);
      const dz = pz - (az + vz * t);
      return dx * dx + dz * dz < MARGE_LITIGE * MARGE_LITIGE;
    };
    for (const o of objects) {
      const m = o.transform;
      if (m && m.length >= 15 && proche(m[12], m[14])) return true;
    }
    /*
      UN APPAREIL EST PLAQUÉ SUR SON MUR, en saillie de quelques
      centimètres : c'est le litige le plus serré qui soit, et c'est
      justement celui que les tuiles tranchent (voir `depthAt`). Un mur qui
      porte de l'appareillage garde donc ses bandes, sans qu'on ait à
      mesurer quoi que ce soit.
    */
    return (opts.fixtures ?? []).some((f) => f.wallId === w.id);
  };

  for (const w of walls) {
    const q = quads.get(w.id);
    if (!q) continue;
    // Seule la face tournée vers la pièce a été vue par la caméra — et c'est
    // le centre de SA pièce qui dit de quel côté elle regarde.
    const interior = interiorOf.get(roomOf(w)) ?? fallbackInterior;
    const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
    const nrm = { x: -(w.b.z - w.a.z) / len, z: (w.b.x - w.a.x) / len };
    const plusIsInner =
      (interior.x - mid.x) * nrm.x + (interior.z - mid.z) * nrm.z > 0;
    /*
      UN MUR EN COULEUR EST D'UNE SEULE COULEUR.

      Relevé du patron, troisième passage sur le même sujet : « il y a des
      bandes sur les murs en couleur, tout doit être uni ».

      Les deux premiers avaient corrigé la MATIÈRE — le relevé rendait des
      cases bariolées, et `sampleTexture` les a ramenées à une teinte dont on
      ne s'écarte que pour un vrai pan d'accent. Restait la DÉCOUPE : un mur
      se dessine en bandes — c'est elle qui permet au tri du peintre de
      départager un mur long d'un meuble posé devant sa moitié proche — et
      chaque bande allait chercher SA teinte dans la texture. Quatre rangées,
      une nuance par rangée : des bandes horizontales sur un mur que le
      relevé donne pourtant uni à deux unités près.

      On garde la découpe, qui sert au tri, et on lui retire sa palette : le
      mur porte partout la MOYENNE relevée. Ce que ça coûte est assumé — un
      mur peint en deux couleurs, bas lambrissé et haut clair, sort d'une
      seule teinte. « Tout doit être uni » : c'est la réponse.

      La texture reste relevée et transmise (le sol s'en sert, case par case,
      et c'est là que la variation a un sens : un carrelage n'est pas un mur
      peint).
    */
    const avg = opts.showTextures ? w.color : undefined;
    const skin = {
      // Marque les deux faces : `pushWallBlock` saura laquelle est dehors.
      cutaway: true,
      fill: avg ?? pal.wall,
      top: avg ? mixHex(avg, '#FFFFFF', 0.45) : pal.wallTop,
      stroke: pal.wallStroke,
      topStroke: pal.wallTopStroke,
      captured: !!avg,
      texOnPlus: plusIsInner,
    };

    /**
     * La normale du mur tournée VERS SA PIÈCE.
     *
     * C'est elle qui dira au tri, pour une caméra donnée, si l'on regarde
     * ce mur du dedans (il est alors au fond, derrière le mobilier) ou du
     * dehors (il est devant tout).
     */
    const versLaPiece: P3 = {
      x: plusIsInner ? nrm.x : -nrm.x,
      y: 0,
      z: plusIsInner ? nrm.z : -nrm.z,
    };
    const avantMur = faces.length;
    /** Ce mur a-t-il quelque chose devant lui, à trier contre ses bandes ? */
    const litige = devantLeMur(w);

    const mine = holes.get(w.id) ?? [];
    for (const panel of wallPanels(mine, w.height)) {
      pushWallBlock(q, panel.t0, panel.t1, panel.y0, panel.y1, {
        ...skin,
        // Rien devant : le pan reste d'un seul tenant (voir `devantLeMur`).
        whole: !litige,
        closeBottom: panel.y0 > 1e-3,
        // Tous les morceaux d'un mur se classent à sa mi-hauteur : le mur
        // est un plan, pas une collection de tuiles.
        depthY: w.height / 2,
      });
    }

    // ---------------------------------------- portes / fenêtres du mur
    for (const hole of mine) {
      /*
        UNE PORTE EST UN TROU, PAS UN PANNEAU DE PLUS.

        Relevé de chantier, capture à l'appui : « en choisissant la porte,
        elle est opaque, pas d'ouverture réelle ». Le mur était bien bâti
        AUTOUR de la baie — trumeaux, linteau — puis le trou se rebouchait
        d'un aplat de la couleur des portes : un rectangle beige sur un mur
        beige, qui ne disait ni qu'on passe là, ni de quel côté ça s'ouvre.

        Une porte se dessine donc comme une baie — le pourtour du vide, on
        voit à travers — et porte son SEUIL, qui dit qu'ici on ferme. Le
        sens d'ouverture, lui, reste l'affaire du plan : voir la note du
        seuil, plus bas, pour le vantail en volume qu'on a écarté.
      */
      const porte = hole.seg.type === 'door';
      // Une baie libre ou une porte, ça se TRAVERSE : pas de panneau,
      // juste le pourtour du vide, en pointillé, sur les deux faces du mur.
      if (porte || estTraversante(hole.seg)) {
        const p1 = lerp2(q.a1, q.b1, hole.t0);
        const r1 = lerp2(q.a1, q.b1, hole.t1);
        const p2 = lerp2(q.a2, q.b2, hole.t0);
        const r2 = lerp2(q.a2, q.b2, hole.t1);
        for (const [p, r] of [
          [p1, r1],
          [r2, p2],
        ] as [Pt, Pt][]) {
          faces.push({
            pts: vquad(p, r, hole.y0, hole.y1),
            fill: null,
            /*
              LE POURTOUR D'UNE PORTE EST AMBRE, TOUJOURS.

              Le seuil ne fait que deux centimètres : de loin, une porte et
              une baie libre se ressemblaient trait pour trait. La teinte
              des portes avait d'abord été réservée au réglage « Couleur des
              portes/fenêtres » — décoché par défaut, donc invisible pour
              qui ne l'a jamais trouvé. Décision du patron, sur question
              posée : le pourtour la porte en toutes circonstances. C'est la
              règle de la palette, d'ailleurs : les teintes de menuiserie ne
              décorent pas, elles DÉSIGNENT (voir `MAQUETTE`).
            */
            stroke: porte ? pal.door : pal.passage,
            dashed: true,
            bias: 0.006,
            normal: outwardOf(p, r),
          });
        }
        /*
          LE SEUIL — ce qui distingue une porte d'un trou dans un mur.

          UN VANTAIL EN VOLUME A ÉTÉ ESSAYÉ, ET ÉCARTÉ. Le plan 2D dessine
          le battant ouvert à l'équerre et son quart de cercle ; le porter en
          trois dimensions paraissait aller de soi. La mesure a dit non : sur
          la chambre meublée du banc d'audit — porte de 90 sur le mur ouest,
          lit à quarante-cinq centimètres de là — le vantail ouvert TRAVERSE
          le lit. Deux volumes qui s'interpénètrent n'ont pas d'ordre de
          peinture : l'audit comptait cent dix recouvrements, et le chantier
          aurait vu une porte plantée dans un matelas. Le débattement réel
          demanderait de connaître ce qui l'encombre, meuble par meuble, à
          chaque image — c'est le prix qu'on a refusé.

          Reste ce qu'un seuil dit à lui seul : ici on FERME, alors qu'une
          baie libre se traverse. Il tient dans l'épaisseur du mur, ne
          rencontre donc rien, et se lit de tous les angles.
        */
        if (porte) {
          const teinte = opts.colorOpenings ? pal.door : pal.opening;
          pushWallBlock(q, hole.t0, hole.t1, hole.y0, hole.y0 + 0.02, {
            fill: teinte,
            top: mixHex(teinte, '#FFFFFF', 0.25),
            stroke: mixHex(teinte, '#000000', 0.12),
            topStroke: mixHex(teinte, '#000000', 0.12),
            shade: true,
            depthY: w.height / 2,
          });
        }
        continue;
      }
      const captured = opts.showTextures ? hole.seg.color : undefined;
      const paint = opts.colorOpenings
        ? hole.seg.type === 'door'
          ? pal.door
          : pal.window
        : captured ?? pal.opening;
      /**
       * UNE MENUISERIE N'EST PAS UN CAISSON.
       *
       * Elle était bâtie comme un bloc de mur : ses six faces cernées du
       * même trait gris que la maçonnerie, et enfoncée de 22 % dans
       * l'épaisseur. À l'écran, ça donnait un halo d'arêtes autour de
       * chaque fenêtre — le dormant, le tableau, le linteau, chacun son
       * trait — et, sous un angle rasant, on voyait le JOUR entre le
       * vitrage et le nu du mur : le mur paraissait percé de part en part.
       *
       * Le vitrage remplit donc l'épaisseur (plus de retrait, donc plus de
       * jour), et ne porte plus de contour propre : c'est son aplat qui la
       * dessine, comme une vitre. Le mur, lui, garde les siens — ce sont
       * eux qui donnent la baie.
       */
      pushWallBlock(q, hole.t0, hole.t1, hole.y0, hole.y1, {
        fill: paint,
        top: mixHex(paint, '#FFFFFF', 0.3),
        stroke: paint,
        topStroke: mixHex(paint, '#FFFFFF', 0.3),
        captured: !!captured,
        // Légèrement en retrait, mais SANS flancs : le tableau du mur est
        // dessiné par les panneaux voisins, en maçonnerie. Deux surfaces au
        // même endroit se disputaient l'affichage — d'où l'épaisseur bleue
        // qui apparaîssait sur le côté d'une fenêtre selon l'angle.
        shrink: 0.06,
        facesSeules: true,
        // La menuiserie appartient au plan du mur : elle s'y classe avec lui.
        depthY: w.height / 2,
      });
    }

    // Tout ce que ce mur vient de poser — pans, chants, couronnement,
    // menuiseries — appartient à sa pièce et regarde du même côté.
    for (let i = avantMur; i < faces.length; i++) {
      faces[i].roomId = roomOf(w);
      faces[i].roomSide = versLaPiece;
      faces[i].wallId = w.id;
    }
  }

  // ------------------------------------------------------------- gaines
  /**
   * LA GAINE EST UN TUBE, pas un trait.
   *
   * Section carrée de vingt-cinq millimètres — un ICTA 25, celui qu'on
   * tire pour du 2,5 mm² — posée à cinq centimètres du nu de la dalle,
   * dans la chape. Quatre faces par tronçon, pas une de plus : un
   * appartement compte cent mètres de conduit, et un tube à douze pans les
   * ferait payer en images par seconde.
   *
   * La couleur est celle du chantier, orange ICTA, et les faces portent le
   * remplissage « annelure » : c'est la vue qui dessine les nervures, à
   * l'échelle de l'écran, là où des arêtes réelles coûteraient mille faces.
   */
  const R_GAINE = 0.0125;
  const gaineTeinte = '#E4702A';
  const tronc = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    // Repère du tronçon : l'axe, puis deux perpendiculaires.
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    // Une première perpendiculaire, prise sur la verticale sauf si l'axe
    // l'est déjà (une remontée le long d'un mur).
    const vertical = Math.abs(uy) > 0.9;
    const px = vertical ? 1 : -uz;
    const py = 0;
    const pz = vertical ? 0 : ux;
    const pl = Math.hypot(px, py, pz) || 1;
    const p = { x: (px / pl) * R_GAINE, y: 0, z: (pz / pl) * R_GAINE };
    // La seconde : le produit vectoriel axe ∧ première.
    const qx = uy * p.z - uz * p.y;
    const qy = uz * p.x - ux * p.z;
    const qz = ux * p.y - uy * p.x;
    const ql = Math.hypot(qx, qy, qz) || 1;
    const q = {
      x: (qx / ql) * R_GAINE,
      y: (qy / ql) * R_GAINE,
      z: (qz / ql) * R_GAINE,
    };
    const coin = (
      base: { x: number; y: number; z: number },
      sp: number,
      sq: number,
    ) => ({
      x: base.x + p.x * sp + q.x * sq,
      y: base.y + p.y * sp + q.y * sq,
      z: base.z + p.z * sp + q.z * sq,
    });
    const signes: [number, number][] = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (let i = 0; i < 4; i++) {
      const s0 = signes[i];
      const s1 = signes[(i + 1) % 4];
      const pts = [
        coin(a, s0[0], s0[1]),
        coin(a, s1[0], s1[1]),
        coin(b, s1[0], s1[1]),
        coin(b, s0[0], s0[1]),
      ];
      // La normale sortante de cette face : le milieu des deux signes.
      const nx = (p.x * (s0[0] + s1[0])) / 2 + (q.x * (s0[1] + s1[1])) / 2;
      const ny = (p.y * (s0[0] + s1[0])) / 2 + (q.y * (s0[1] + s1[1])) / 2;
      const nz = (p.z * (s0[0] + s1[0])) / 2 + (q.z * (s0[1] + s1[1])) / 2;
      const nl = Math.hypot(nx, ny, nz) || 1;
      faces.push({
        pts,
        fill: gaineTeinte,
        stroke: '#9C4412',
        shade: true,
        normal: { x: nx / nl, y: ny / nl, z: nz / nl },
        ownerId: 'gaine',
      });
    }
  };

  for (const route of opts.routes ?? []) {
    const pts = route.path;
    if (pts.length < 2) continue;
    const sol = floorY + 0.05;
    for (let i = 1; i < pts.length; i++) {
      tronc(
        { x: pts[i - 1].x, y: sol, z: pts[i - 1].z },
        { x: pts[i].x, y: sol, z: pts[i].z },
      );
    }
    // La remontée jusqu'à l'appareil : c'est elle qu'on cherche des yeux
    // quand on se demande par où arrive le fil.
    const haut = opts.routeHeights?.[route.id];
    const fin = pts[pts.length - 1];
    if (haut !== undefined && haut > 0.1) {
      tronc(
        { x: fin.x, y: sol, z: fin.z },
        { x: fin.x, y: floorY + haut, z: fin.z },
      );
    }
  }

  // ------------------------------------------- appareillage électrique
  // Une prise est un petit VOLUME plaqué sur la face du mur, pas une
  // pastille peinte dessus : elle porte ses normales sortantes comme le
  // reste du modèle, donc elle disparaît d'elle-même dès qu'on passe
  // derrière son mur, et rien ne peut la faire flotter au travers.
  const wallById = new Map(walls.map((w) => [w.id, w]));

  /**
   * Les appareils réunis se dessinent ENSEMBLE.
   *
   * Deux prises côte à côte, ce ne sont pas deux plaques qui se chevauchent :
   * c'est UNE plaque de 151 mm et deux mécanismes de 45 mm à 71 mm
   * d'entraxe. C'est ce que voit l'électricien sur le mur, et ce que le
   * modèle doit montrer — sans quoi une double prise ressemble à une prise
   * posée de travers sur une autre.
   */
  const lots = new Map<string, Fixture[]>();
  for (const f of opts.fixtures ?? []) {
    const cle = f.group ? `g:${f.group}:${f.wallId}:${f.side}` : `s:${f.id}`;
    const l = lots.get(cle);
    if (l) l.push(f);
    else lots.set(cle, [f]);
  }

  for (const lot of lots.values()) {
    const w = wallById.get(lot[0].wallId);
    if (!w) continue;
    const face = wallFace(w, quads.get(w.id), lot[0].side);
    const avant = faces.length;

    /** Un point de la face : `dx` le long du mur, `out` en saillie. */
    const at = (fx: number, out: number): Pt => ({
      x: face.A.x + face.ux * fx + face.nx * out,
      z: face.A.z + face.uz * fx + face.nz * out,
    });

    /** Un volume plaqué sur le mur : de `out0` à `out1` en saillie. */
    const poser = (
      cx: number,
      largeur: number,
      cy: number,
      hauteur: number,
      out0: number,
      out1: number,
      fill: string,
      stroke: string,
    ) => {
      const hx = largeur / 2;
      pushWallBlock(
        {
          a1: at(cx - hx, out1),
          b1: at(cx + hx, out1),
          b2: at(cx + hx, out0),
          a2: at(cx - hx, out0),
        },
        0,
        1,
        Math.max(0, cy - hauteur / 2),
        Math.max(0, cy - hauteur / 2) + hauteur,
        {
          fill,
          top: mixHex(fill, '#FFFFFF', 0.3),
          stroke,
          topStroke: stroke,
          shade: true,
          closeBottom: true,
        },
      );
    };

    // Les postes réels : une boîte d'encastrement par mécanisme, à
    // l'entraxe, qu'ils viennent d'un appareil multiposte du catalogue ou de
    // deux appareils réunis à la main.
    const postes: { x: number; y: number; kind: FixtureKind }[] = [];
    for (const f of lot) {
      const sp = FIXTURES[f.kind];
      const gauche = faceX(face, f.along) - sp.w / 2;
      const kinds = postsOf(f.kind);
      const offs = boxOffsets(f.kind);
      kinds.forEach((k, i) =>
        postes.push({ x: gauche + offs[i], y: f.height, kind: k }),
      );
    }

    // Un appareil hors gabarit — tableau, applique, thermostat large — n'est
    // pas de l'appareillage encastré : il garde son volume propre.
    const encastre = lot.every((f) => FIXTURES[f.kind].h <= 0.12);
    let x0: number;
    let x1: number;
    let y0: number;
    let y1: number;

    if (encastre) {
      x0 = Math.min(...postes.map((q) => q.x)) - PLAQUE / 2;
      x1 = Math.max(...postes.map((q) => q.x)) + PLAQUE / 2;
      y0 = Math.min(...postes.map((q) => q.y)) - PLAQUE / 2;
      y1 = Math.max(...postes.map((q) => q.y)) + PLAQUE / 2;
      // La plaque : blanche, comme sur le mur, et fine (8 mm).
      const blanc = mixHex(pal.object, '#FFFFFF', 0.72);
      poser(
        (x0 + x1) / 2,
        x1 - x0,
        (y0 + y1) / 2,
        y1 - y0,
        0.001,
        PLAQUE_EP,
        blanc,
        pal.objectStroke,
      );
      // Puis un mécanisme par poste, en saillie de la plaque.
      for (const q of postes) {
        const sp = FIXTURES[q.kind];
        const col = sp.color;
        poser(
          q.x,
          MECANISME,
          q.y,
          MECANISME,
          PLAQUE_EP,
          Math.max(PLAQUE_EP + 0.004, sp.depth),
          col,
          mixHex(col, '#000000', 0.4),
        );
      }
    } else {
      const f = lot[0];
      const sp = FIXTURES[f.kind];
      const cx = faceX(face, f.along);
      x0 = cx - sp.w / 2;
      x1 = cx + sp.w / 2;
      y0 = f.height - sp.h / 2;
      y1 = f.height + sp.h / 2;
      poser(
        cx,
        sp.w,
        f.height,
        sp.h,
        0.001,
        sp.depth,
        sp.color,
        mixHex(sp.color, '#000000', 0.4),
      );
    }

    // ---- Le tri en profondeur : un appareil se range AVEC SA TUILE.
    //
    // Deux erreurs successives, et la seconde vaut d'être écrite. Un pan de
    // mur se découpe en tuiles et chacune se trie sur SON centre, donc à
    // mi-hauteur du pan ; une prise se triait sur son propre centre, à
    // 25 cm du sol. Le terme d'altitude de la profondeur la mettait un
    // mètre DERRIÈRE le mur qui la porte, et le mur la repeignait : à
    // l'écran, plus un seul appareil, seulement ses cotes.
    //
    // Le premier remède — même hauteur, plus un biais d'une demi-tuile — a
    // guéri ça et provoqué l'inverse : un biais est une avance CONSTANTE,
    // qui faisait aussi passer l'appareil devant le mur vu de dos. On voyait
    // les prises au travers des cloisons.
    //
    // Le bon repère n'a rien d'approximatif : c'est le centre exact de la
    // tuile qui porte l'appareil, avancé d'un millimètre vers la pièce. Vu
    // de face, ce millimètre compte positivement et l'appareil passe juste
    // après sa tuile ; vu de dos, il compte négativement et le mur le
    // recouvre. Aucun biais, donc aucun cas où l'un l'emporte à tort.
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    const saillie = 0.001 + PLAQUE_EP;
    /*
      UNE SEULE RANGÉE, comme le mur lui-même.

      Ce repère sert à savoir de quelle TUILE dépend un appareil, pour que le
      tri le pose juste devant elle. Il comptait les rangées de la texture —
      quatre — alors que le mur, depuis qu'il est uni, n'en dessine plus
      qu'une. Deux découpages différents pour la même maçonnerie, et
      l'appareil se serait référé à une tuile qui n'existe pas.
    */
    const rows = 1;
    const xOf = (t: number) => (lot[0].side > 0 ? t : 1 - t) * face.len;
    let xa = 0;
    let xb = face.len;
    let ya = 0;
    let yz = w.height;
    for (const panel of wallPanels(holes.get(w.id) ?? [], w.height)) {
      const e0 = xOf(panel.t0);
      const e1 = xOf(panel.t1);
      const lo = Math.min(e0, e1);
      const hi = Math.max(e0, e1);
      if (xm < lo - 1e-6 || xm > hi + 1e-6) continue;
      if (ym < panel.y0 - 1e-6 || ym > panel.y1 + 1e-6) continue;
      xa = lo;
      xb = hi;
      ya = panel.y0;
      yz = panel.y1;
      break;
    }
    const largeurPan = Math.max(1e-6, xb - xa);
    const cols = Math.max(1, Math.ceil(largeurPan / step));
    const tw = largeurPan / cols;
    const hautPan = Math.max(1e-6, yz - ya);
    const rh = hautPan / rows;
    const ri = Math.min(rows - 1, Math.max(0, Math.floor((ym - ya) / rh)));
    const yTuile = ya + (ri + 0.5) * rh;
    /** Le point de tri de la tuile qui contient cette abscisse de face. */
    const tuileDe = (xf: number): P3 => {
      const k = Math.min(cols - 1, Math.max(0, Math.floor((xf - xa) / tw)));
      const a2 = facePoint(face, xa + (k + 0.5) * tw, saillie);
      return { x: a2.x, y: yTuile, z: a2.z };
    };
    const c0 = Math.min(cols - 1, Math.max(0, Math.floor((x0 - xa) / tw)));
    const c1 = Math.min(cols - 1, Math.max(0, Math.floor((x1 - xa) / tw)));
    const refs: P3[] = [];
    for (let k = c0; k <= c1; k++) {
      const a2 = facePoint(face, xa + (k + 0.5) * tw, saillie);
      refs.push({ x: a2.x, y: yTuile, z: a2.z });
    }
    // Le DOS d'une plaque n'existe pour personne : il est plaqué au nu du
    // mur, à un millimètre. On ne peut le voir qu'en se plaçant DANS la
    // maçonnerie — c'est-à-dire jamais —, et large comme il est, il se
    // triait mal vu de l'autre côté de la cloison : il traversait.
    for (let i = faces.length - 1; i >= avant; i--) {
      const nf = faces[i].normal;
      if (nf && nf.x * face.nx + nf.z * face.nz < -0.9) faces.splice(i, 1);
    }
    for (let i = avant; i < faces.length; i++) {
      const fa = faces[i];
      // L'appareil appartient à une FACE de mur : il n'existe que pour qui
      // regarde ce côté-là.
      fa.facing = { x: face.nx, y: 0, z: face.nz };
      /*
        ET IL SE PEINT AVEC LE CONTENU DE LA PIÈCE QU'IL DESSERT.

        Un appareil est posé SUR un mur, mais il se voit depuis la pièce :
        il appartient donc à la couche du contenu, entre le mur du fond et
        le mur de devant. Sans ça, une prise se rangeait avec la maçonnerie
        et le mobilier lui passait dessus.
      */
      fa.roomId = roomOf(w);
      fa.roomSide = undefined;
      // Une prise part avec son mur : montrer l'appareillage d'une cloison
      // qu'on a retirée le ferait flotter en l'air.
      fa.wallId = w.id;
      const nf = fa.normal;
      const devant = !!nf && nf.x * face.nx + nf.z * face.nz > 0.9;
      // La façade se compare à TOUTES les tuiles qu'elle recouvre. Les
      // flancs, eux, tiennent chacun dans UNE tuile : on prend la leur, pas
      // celle du milieu de l'appareil — sinon un flanc de tableau se
      // retrouvait trié avec une tuile voisine, et repassait devant le dos
      // du mur quand on regardait la cloison de l'autre côté.
      // Toute face qui S'ÉTEND sur plusieurs tuiles se compare à toutes :
      // le dessus d'un tableau de 55 cm en couvre deux, et la tuile qu'on
      // n'aurait pas prise repassait devant — c'est le liseré blanc qui
      // mordait le coin de l'appareil.
      const xs = fa.pts.map(
        (q) => (q.x - face.A.x) * face.ux + (q.z - face.A.z) * face.uz,
      );
      const large = Math.max(...xs) - Math.min(...xs) > tw * 0.5;
      if ((devant || large) && refs.length > 1) {
        fa.depthRefs = refs;
        fa.depthFacing = { x: face.nx, y: 0, z: face.nz };
      } else {
        const cxf =
          fa.pts.reduce(
            (s2, q) => s2 + (q.x - face.A.x) * face.ux + (q.z - face.A.z) * face.uz,
            0,
          ) / fa.pts.length;
        fa.depthAt = tuileDe(cxf);
      }
    }
  }

  // ------------------------- ouvertures sans mur d'accueil identifiable
  // Rare (mur supprimé à l'édition) : le bloc est posé sur sa propre emprise.
  for (const o of openings) {
    if (holes.has(`used:${o.id}`)) continue;
    const yb = Math.max(0, o.yCenter - o.height / 2 - floorY);
    const captured = opts.showTextures ? o.color : undefined;
    const paint = opts.colorOpenings
      ? o.type === 'door'
        ? pal.door
        : pal.window
      : captured ?? pal.opening;
    const dx = o.b.x - o.a.x;
    const dz = o.b.z - o.a.z;
    const l = Math.hypot(dx, dz) || 1;
    const h = { x: (-dz / l) * (WALL_T / 2), z: (dx / l) * (WALL_T / 2) };
    const box = {
      a1: { x: o.a.x + h.x, z: o.a.z + h.z },
      b1: { x: o.b.x + h.x, z: o.b.z + h.z },
      b2: { x: o.b.x - h.x, z: o.b.z - h.z },
      a2: { x: o.a.x - h.x, z: o.a.z - h.z },
    };
    pushWallBlock(box, 0, 1, yb, yb + o.height, {
      fill: paint,
      top: mixHex(paint, '#FFFFFF', 0.3),
      stroke: pal.wallStroke,
      topStroke: pal.wallStroke,
      captured: !!captured,
      closeBottom: true,
    });
  }

  // ----------------------------------------------------------- plafond
  //
  // Un appareil de plafond est une PASTILLE ÉPAISSE, à son diamètre réel :
  // un spot de 9 cm reste un spot de 9 cm. Elle porte sa teinte de famille
  // — lumière, sécurité, ventilation —, la même que sur le plan et dans
  // le dossier, et son dessus est peint comme son dessous : dans une
  // maquette ouverte, on la regarde par au-dessus.
  for (const cl of opts.ceiling ?? []) {
    const spec = CEILINGS[cl.kind];
    const mursDeLaPiece = walls.filter((w) => roomOf(w) === cl.roomId);
    const haut = (mursDeLaPiece.length > 0 ? mursDeLaPiece : walls).reduce(
      (m, w) => Math.max(m, w.height),
      0,
    );
    if (!(haut > 0.5)) continue;
    const r = Math.max(0.05, spec.d / 2);
    const y1 = haut - 0.01;
    const y0 = y1 - 0.06;
    const cotes = 10;
    const bord = (i: number): Pt => ({
      x: cl.at.x + r * Math.cos((i / cotes) * Math.PI * 2),
      z: cl.at.z + r * Math.sin((i / cotes) * Math.PI * 2),
    });
    const dessus = Array.from({ length: cotes }, (_, i) => bord(i));
    const centre: P3 = { x: cl.at.x, y: (y0 + y1) / 2, z: cl.at.z };
    for (let i = 0; i < cotes; i++) {
      const p = dessus[i];
      const q = dessus[(i + 1) % cotes];
      faces.push({
        pts: vquad(p, q, y0, y1),
        fill: spec.color,
        stroke: null,
        shade: true,
        normal: outwardOf(p, q),
        ownerId: `cl-${cl.id}`,
        roomId: cl.roomId,
        depthAt: centre,
      });
    }
    // Dessus et dessous : le même disque, deux normales opposées.
    for (const [y, sens] of [
      [y1, 1],
      [y0, -1],
    ] as [number, number][]) {
      const pts = dessus.map((p) => ({ x: p.x, y, z: p.z }));
      faces.push({
        pts: sens > 0 ? pts : [...pts].reverse(),
        fill: sens > 0 ? mixHex(spec.color, '#FFFFFF', 0.25) : spec.color,
        stroke: null,
        shade: false,
        normal: { x: 0, y: sens, z: 0 },
        ownerId: `cl-${cl.id}`,
        roomId: cl.roomId,
        depthAt: centre,
      });
    }
  }

  /** La pièce dont le contour contient ce point, s'il y en a une. */
  const pieceDuPoint = (p: Pt): string | undefined =>
    parts.find(
      (part) =>
        (part.surface?.pts.length ?? 0) >= 3 &&
        pointInPolygon(p, part.surface!.pts),
    )?.roomId;

  // ------------------------------------------------------------ meubles
  // Un meuble n'est recalé que contre les murs de SA pièce : sinon la
  // cloison d'à côté le repousserait au milieu du salon.
  for (const source of objects) {
    /*
      RESSORTI DE TOUTE MAÇONNERIE, PAS SEULEMENT DE LA SIENNE.

      Relevé du chantier, capture à l'appui : « le meuble est coupé par le
      mur ». Il l'était vraiment — son caisson chevauchait un refend, et là où
      deux volumes se traversent, aucun ordre de peinture ne peut trancher :
      la maçonnerie recouvre une moitié, le meuble l'autre. C'est la même
      limite que pour les pièces d'un meuble, et le même remède : la
      géométrie, pas le tri.

      On ne le recalait que contre les murs de SA pièce — par prudence, pour
      qu'une cloison voisine ne le repousse pas au milieu du salon. Mais un
      retour de mur appartient souvent à la pièce d'à côté, ou à aucune : ce
      mur-là ne le poussait jamais, et le meuble restait planté dedans.

      Le garde-fou tient ailleurs, et il tient toujours : `clampFootprint` ne
      déplace que ce qui est VRAIMENT dans la maçonnerie, et jamais de plus
      que sa propre profondeur.
    */
    const obj = clampFootprint(
      toFootprint(source),
      walls,
      interiorOf.get(roomOf(source)) ?? fallbackInterior,
    );
    const cosY = Math.cos(obj.yaw);
    const sinY = Math.sin(obj.yaw);
    /**
     * Un meuble POSE PAR TERRE.
     *
     * Le catalogue place le meuble en supposant le sol à l'altitude zéro,
     * or le sol d'un scan est où ARKit l'a trouvé — souvent 50 cm plus bas.
     * Le lit flottait donc en l'air. On rattrape ici tout ce qui plane à
     * moins de 45 cm sans raison : aucun meuble de cette liste ne se
     * suspend, et une télé murale, elle, est bien plus haut.
     */
    let yb = Math.max(0, obj.yCenter - obj.height / 2 - floorY);
    if (yb > 0 && yb < 0.45 && POSE_AU_SOL.test(obj.category ?? '')) yb = 0;
    /*
      L'AMBRE DU MOBILIER MOELLEUX — lits, canapés, fauteuils.

      C'est la signature de la maquette que le patron a montrée : le bâti
      est neutre, et ce qu'on POSE dedans porte la couleur. Elle sert aussi
      à LIRE le plan — on repère un lit d'un coup d'œil, là où quinze
      volumes gris se ressemblent tous.

      La couleur RELEVÉE au scan passe devant, quand elle est demandée :
      celle-là n'est pas un parti pris de dessin, c'est une mesure.
    */
    const teinteMoelleuse = MEUBLE_MOELLEUX.test(obj.category ?? '')
      ? AMBRE_MEUBLE
      : undefined;
    const skin = opts.showTextures ? obj.color : undefined;
    const base = skin ?? teinteMoelleuse ?? pal.object;
    const teintes = {
      body: base,
      soft: mixHex(base, '#FFFFFF', 0.45),
      dark: mixHex(base, '#0B0D12', 0.42),
    };
    // Un meuble est un VOLUME, comme un mur : ses faces portent leur normale
    // sortante et celles qui tournent le dos ne sont pas dessinées. Sans ça,
    // les quatre flancs se disputaient l'ordre d'affichage et l'un ou l'autre
    // clignotait au fil de la rotation.
    //
    // L'ordre des coins est celui qui donne des normales SORTANTES avec la
    // convention de `pushWallBlock` : c3→c2 borde le côté +n.
    /**
     * Une pièce du meuble, posée dans son repère.
     *
     * `pushWallBlock` attend un quadrilatère au sol et deux altitudes : on
     * lui donne l'emprise de la pièce, tournée comme le meuble. L'ordre des
     * coins est celui qui donne des normales SORTANTES — c3→c2 borde le
     * côté +n —, sans quoi les quatre flancs se disputent l'affichage.
     */
    const poser = (part: FurnPart) => {
      const bloc = [
        [part.x0, part.z0],
        [part.x1, part.z0],
        [part.x1, part.z1],
        [part.x0, part.z1],
      ].map(([ux, uz]) => {
        const lx = (ux - 0.5) * obj.width;
        const lz = (uz - 0.5) * obj.depth;
        return {
          x: obj.cx + lx * cosY - lz * sinY,
          z: obj.cz + lx * sinY + lz * cosY,
        };
      });
      const fond = yb + part.y0 * obj.height;
      const haut = yb + part.y1 * obj.height;
      if (haut - fond < 1e-4) return;
      const fill = teintes[part.tone];
      pushWallBlock(
        { a1: bloc[3], b1: bloc[2], b2: bloc[1], a2: bloc[0] },
        0,
        1,
        fond,
        haut,
        {
          fill,
          top: mixHex(fill, '#FFFFFF', 0.3),
          stroke: pal.objectStroke,
          topStroke: pal.objectStroke,
          captured: !!skin,
          // Toujours ombré : deux flancs du même aplat ne se distinguent
          // que par leur contour, et un meuble paraît alors amputé d'une
          // face.
          shade: true,
          // Une télé ou une étagère ne touchent pas le sol : leur dessous se
          // voit depuis le bas de la pièce.
          closeBottom: fond > 1e-3,
          // Pas de bandes sur un meuble : elles se repeignaient entre elles.
          whole: true,
        },
      );
    };

    /**
     * L'ombre portée : deux nappes sombres sous le meuble.
     *
     * Sans elle, un meuble ne POSE pas — il flotte, même quand sa géométrie
     * est juste au millimètre. C'est le contact avec le sol que l'œil
     * cherche, et un aplat ne le donne pas. Deux nappes concentriques, la
     * plus large à peine teintée, suffisent à le suggérer : on ne calcule
     * aucune lumière, on décalque l'emprise, décalée d'un rien.
     *
     * Rien pour ce qui ne touche pas le sol : une ombre au pied d'une télé
     * accrochée au mur désignerait un objet qui n'est pas là.
     */
    if (opts.showSurfaces !== false && yb < 0.3) {
      const nappe = (marge: number, force: number) => {
        const pts = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sx, sz]) => {
          const lx = sx * (obj.width / 2 + marge);
          const lz = sz * (obj.depth / 2 + marge);
          return {
            x: obj.cx + lx * cosY - lz * sinY + 0.05,
            y: 0,
            z: obj.cz + lx * sinY + lz * cosY + 0.05,
          };
        });
        faces.push({
          pts,
          fill: mixHex(pal.floor, '#0B0D12', force),
          stroke: null,
          // Comme le sol : tout au fond du tri, dans l'ordre où on les
          // pousse — donc par-dessus le sol, sous tout le reste.
          isFloor: true,
        });
      };
      nappe(0.09, 0.07);
      nappe(0.02, 0.13);
    }

    /**
     * Un meuble PLAQUÉ contre un mur se trie AVEC lui.
     *
     * Même piège que pour l'appareillage, et il ressort sur les objets
     * plats : un pan de mur se trie sur le centre de sa tuile, donc à
     * mi-hauteur ; une télé accrochée à 1,35 m se trie plus haut, et le
     * terme d'altitude de la profondeur la faisait passer DEVANT le mur —
     * on la voyait depuis la pièce d'à côté. On donne donc à ses faces le
     * point de tri du mur qu'elle longe, avancé de sa saillie : vu de la
     * pièce, elle passe juste après le mur ; vu de dos, le mur la couvre.
     *
     * Réservé à ce qui est VRAIMENT contre un mur (50 cm de saillie au
     * plus) : un lit de 1,90 m trié avec le mur de sa tête passerait devant
     * ce qui se trouve à son pied.
     */
    /**
     * OÙ se trie un meuble : à SA PLACE AU SOL, à hauteur de mur.
     *
     * Le tri en profondeur de cette scène comporte un terme d'ALTITUDE :
     * à position au sol égale, ce qui est haut passe devant ce qui est bas.
     * C'est nécessaire pour que le dessus d'un mur se pose sur son pan, et
     * c'est justement ce terme qui dérange partout ailleurs : un pan de mur
     * se trie à mi-hauteur, soit 1,25 m, là où un rangement de 90 cm se trie
     * à 45. L'écart d'altitude — 80 cm — pesait plus lourd que l'écart de
     * position, et le mur, dessiné après, tranchait le meuble en deux. C'est
     * ce qu'on voyait dans les angles de pièce.
     *
     * On donne donc à chaque meuble le point de tri d'un mur imaginaire posé
     * à sa place : ses coordonnées au sol, l'altitude commune. Le terme
     * d'altitude disparaît de la comparaison, et il ne reste que ce qui
     * compte — qui est devant qui.
     *
     * Ce qui était réservé aux meubles « vraiment contre un mur » (moins
     * d'un demi-mètre de saillie) vaut maintenant pour tous : le seuil ne
     * protégeait de rien, et il laissait dehors les rangements de 45 cm,
     * dont la saillie atteint 51 — un centimètre de trop pour être bien
     * dessinés.
     */
    const hauteurTri =
      (wallsOf.get(roomOf(source)) ?? walls).reduce(
        (h, w) => Math.max(h, w.height),
        0,
      ) || 2.5;
    /**
     * Et CHAQUE MORCEAU SUR PLACE quand il est ADOSSÉ à un mur.
     *
     * Un rangement d'un mètre vu en biais déborde de vingt-cinq centimètres
     * de part et d'autre de son centre : le pan de mur qui longe son bout le
     * plus proche se trouvait devant le point de tri et derrière le meuble,
     * et il le repeignait — le meuble d'angle tranché en deux. On avait
     * donc donné au meuble entier la profondeur de son bout le PLUS PROCHE.
     *
     * Le banc d'épreuve a montré le revers : un meuble de deux mètres vu en
     * enfilade se triait alors tout entier comme son bout le plus proche,
     * quatre-vingts centimètres devant sa vraie place — et son arête haute
     * passait par-dessus le couronnement du mur qui aurait dû la masquer.
     * Un bout de trait au-dessus du mur, sur vingt configurations.
     *
     * On garde donc l'idée — se trier sur le PLAN DU MEUBLE, avancé de sa
     * saillie devant le nu du mur — mais chaque morceau s'y projette À SA
     * PROPRE ABSCISSE. Le meuble bat son mur partout où il le couvre
     * (il est devant, de toute sa saillie), et nulle part ailleurs. Le côté
     * n'a plus à être dit : vu de dos, le plan avancé est naturellement
     * derrière la maçonnerie, et le mur le couvre.
     */
    let triRefs: P3[] = [{ x: obj.cx, y: hauteurTri / 2, z: obj.cz }];
    let triCote: P3 | undefined;
    {
      const murs = wallsOf.get(roomOf(source)) ?? walls;
      let best = Infinity;
      for (const w of murs) {
        const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
        if (len < 1e-6) continue;
        const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
        const t = ((obj.cx - w.a.x) * u.x + (obj.cz - w.a.z) * u.z) / len;
        if (t < -0.15 || t > 1.15) continue;
        const n = { x: -u.z, z: u.x };
        const d = (obj.cx - w.a.x) * n.x + (obj.cz - w.a.z) * n.z;
        if (Math.abs(d) > best) continue;
        // Demi-emprise PERPENDICULAIRE au mur : une télé de 1,20 m de large
        // et 8 cm d'épaisseur, posée à plat, ne déborde que de 4 cm.
        const demi =
          Math.abs(cosY * n.x + sinY * n.z) * (obj.width / 2) +
          Math.abs(-sinY * n.x + cosY * n.z) * (obj.depth / 2);
        // Le meuble TOUCHE-T-IL ce mur ? On compare le jeu entre son dos et
        // le nu de la maçonnerie, pas sa profondeur : un rangement de 45 cm
        // est adossé comme une télé de 8, et l'ancien seuil de saillie le
        // laissait dehors pour un centimètre.
        const jeu = Math.abs(d) - demi - WALL_T / 2;
        if (jeu > 0.12) continue;
        best = Math.abs(d);
        const sens = d >= 0 ? 1 : -1;
        const saillie = Math.abs(d) + demi;
        triRefs = [
          {
            x: w.a.x + u.x * (t * len) + n.x * sens * saillie,
            y: hauteurTri / 2,
            z: w.a.z + u.z * (t * len) + n.z * sens * saillie,
          },
        ];
        triCote = undefined;
      }
    }

    const avantMeuble = faces.length;

    // La silhouette du meuble, s'il en a une ; sinon, la boîte pleine.
    // Elle reste montée PENDANT les gestes : voir le lit se changer en
    // caisse dès qu'on tourne la pièce, puis redevenir un lit au relâcher,
    // c'est pire que tout — et une douzaine de faces de plus par meuble ne
    // se sent pas.
    const morceaux = furnitureParts(obj.category ?? '');
    if (morceaux.length === 0) {
      poser({ x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1, tone: 'body' });
    } else {
      for (const part of morceaux) poser(part);
    }
    for (let i = avantMeuble; i < faces.length; i++) {
      const f = faces[i];
      f.ownerId = obj.id;
      /*
        LA PIÈCE D'UN MEUBLE SE LIT SUR LE PLAN, pas sur son étiquette.

        Le scanner ne dit pas toujours à quelle pièce appartient un meuble :
        `roomOf` retombe alors sur une pièce par défaut, qui n'est celle
        d'aucun mur. Le meuble se rangeait donc dans une couche à lui, et
        les murs des vraies pièces lui passaient dessus. On cherche donc le
        contour qui le CONTIENT ; l'étiquette ne sert que de recours.
      */
      f.roomId = pieceDuPoint({ x: obj.cx, z: obj.cz }) ?? roomOf(source);
      if (f.isFloor) continue;
      f.depthFacing = triCote;
      /*
        LE BLOC SE TRIE EN UN POINT, SES MORCEAUX À LEUR VRAIE PLACE.

        Deux tris, et non un seul. Face au reste de la scène — les murs, les
        autres meubles — le meuble compte pour UN : toutes ses faces
        partagent le point de tri calculé plus haut, celui qui le pose devant
        sa maçonnerie sans que son altitude s'en mêle. Entre elles, les faces
        d'un même meuble s'ordonnent à leur VRAIE profondeur.

        On avait essayé de tout régler d'un seul point par face, projeté sur
        le plan du mur : les morceaux tombaient à égalité et l'ordre de
        construction tranchait au hasard — le dossier du canapé repeignait
        son assise. Le banc en comptait plus de mille par scène.
      */
      f.depthAt = undefined;
      f.depthRefs = triRefs;
    }
  }

  return { faces: faces.filter(nonDegenere), rooms, floorY };
}

/**
 * UNE FACE D'AIRE NULLE N'EST PAS INVISIBLE : ELLE DESSINE UN TRAIT.
 *
 * Un chant de mur dont les deux nus se rejoignent — ça arrive à l'about
 * d'un mur biais, où l'onglet réduit l'épaisseur à rien — sort du
 * constructeur comme un quadrilatère plat. Son aplat ne couvre aucun
 * pixel, mais son CONTOUR, lui, trace une barre verticale en plein milieu
 * du dessin, et le tri en profondeur la place où il veut. C'est une de ces
 * « arêtes fantômes » qu'on voyait traîner sur le modèle.
 *
 * Le banc d'épreuve la trouve toute seule : elle passait devant un meuble
 * qu'elle aurait dû laisser voir.
 *
 * Le seuil est large — un centimètre carré — et sans danger : le plus
 * petit élément du modèle, un mécanisme de prise, en fait vingt.
 */
function nonDegenere(f: Face3D): boolean {
  // Un trait (deux points) n'a pas d'aire : ce n'est pas une face.
  if (f.pts.length < 3) return true;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < f.pts.length; i++) {
    const a = f.pts[i];
    const b = f.pts[(i + 1) % f.pts.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return Math.hypot(nx, ny, nz) / 2 > 1e-4;
}
