/**
 * POSER UN MEUBLE À LA MAIN — le doigt commande, le mur refuse.
 *
 * Relevé du patron : « on doit pouvoir les placer n'importe où, même
 * traverser les murs, mais impossible à placer SUR un mur (meuble rouge au
 * placement si impossible), et une légère attraction contre les murs (sans
 * les toucher), et pas de bouton valider ».
 *
 * C'EST L'INVERSE DE CE QUE FAISAIT L'APPLICATION. Le meuble était contraint
 * à chaque image : rabattu hors des murs, retourné pour entrer dans une
 * niche, raboté pour tenir dans un recoin. Le doigt proposait, la géométrie
 * disposait — et l'on se battait avec un meuble qui glissait tout seul, sans
 * jamais comprendre pourquoi.
 *
 * La règle du patron est plus simple et plus juste : LE DOIGT COMMANDE. Le
 * meuble suit exactement, y compris à travers les murs — on traverse une
 * cloison pour aller dans la pièce d'à côté, c'est le geste naturel de qui
 * déménage une commode. Ce qui est refusé, c'est de LÂCHER dans la
 * maçonnerie.
 *
 * ET L'AIMANT EST PARTI À SON TOUR — relevé du patron : « peaufine les
 * meubles et sa physique, enlève l'attraction mais mets une collision
 * intelligente (pas collé au mur, recadré si dépasse de la zone surface,
 * etc) ».
 *
 * Il tirait au nu tout ce qui passait à moins de vingt-cinq centimètres. On
 * l'avait voulu contre les doigts qui visent à peu près ; il s'est retourné
 * contre ceux qui visent juste. Vingt centimètres derrière une commode, ce
 * n'est pas une erreur : c'est un radiateur, un coffrage, une porte qui bat,
 * une gaine qui monte. Le plan n'a pas à en décider — et un meuble qui saute
 * de vingt centimètres au moment où le doigt se lève est exactement le
 * « meuble qui glisse tout seul » que ce fichier avait été écrit pour
 * supprimer. L'aimant était la dernière de ces aides ; il s'en va.
 *
 * `poserLibre` ne DÉPLACE donc plus rien du tout. Elle dit seulement si la
 * place tient — c'est le halo rouge sous le doigt. Le rangement au lâcher,
 * lui, est une COLLISION et vit dans le magasin (`rangerMeuble`) : il a
 * besoin de la pièce, de sa surface et des autres meubles, que la géométrie
 * d'un seul meuble ne connaît pas.
 */
import { WALL_T, type Pt, type WallSeg } from './floorplan';

/** Ce qu'on sait d'un meuble pour le poser : son emprise et son cap. */
export interface EmpriseMeuble {
  width: number;
  depth: number;
  yaw: number;
}

/** Les quatre coins de l'emprise, dans le repère du plan. */
function coins(centre: Pt, m: EmpriseMeuble): Pt[] {
  const cos = Math.cos(m.yaw);
  const sin = Math.sin(m.yaw);
  return [
    [-m.width / 2, -m.depth / 2],
    [m.width / 2, -m.depth / 2],
    [m.width / 2, m.depth / 2],
    [-m.width / 2, m.depth / 2],
  ].map(([lx, lz]) => ({
    x: centre.x + lx * cos - lz * sin,
    z: centre.z + lx * sin + lz * cos,
  }));
}

/**
 * La distance SIGNÉE d'un point à l'axe d'un mur, et sa position le long.
 *
 * Le signe dit de quel côté l'on se trouve : c'est lui qui permet de savoir
 * si le meuble chevauche la maçonnerie ou s'il est franchement d'un bord.
 */
function versLeMur(p: Pt, w: WallSeg) {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const d = (p.x - w.a.x) * nx + (p.z - w.a.z) * nz;
  const t = ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / (len * len);
  return { d, t, nx, nz, len };
}

/**
 * Le résultat d'une pose : où le meuble va, et ce qu'il faut en dire.
 *
 * `centre` vaut TOUJOURS le point visé depuis que l'aimant est parti. Il
 * reste dans le résultat parce que l'appelant le lit — et parce qu'une
 * fonction qui répond « oui/non » sur une position doit rendre la position
 * sur laquelle elle a répondu.
 */
export interface PoseMeuble {
  centre: Pt;
  /** `false` = il chevauche la maçonnerie ; l'écran le montre en ROUGE. */
  valide: boolean;
}

/**
 * Le meuble que le doigt amène à `vise` tient-il là ?
 *
 * On ne DÉPLACE jamais le meuble contre la volonté du doigt — plus du tout,
 * depuis le retrait de l'aimant. Cette fonction ne fait plus qu'une chose :
 * dire si l'emprise chevauche la maçonnerie, pour que l'écran la montre en
 * rouge tant que le doigt est posé.
 */
export function poserLibre(
  vise: Pt,
  meuble: EmpriseMeuble,
  murs: WallSeg[],
): PoseMeuble {
  const demi = WALL_T / 2;
  let dansLeMur = false;

  for (const w of murs) {
    if (w.type !== 'wall') continue;
    const cs = coins(vise, meuble);
    const infos = cs.map((p) => versLeMur(p, w));
    // Le meuble ne concerne que les murs qu'il LONGE : au-delà des bouts,
    // un mur bien orienté attraperait un meuble posé trois mètres plus loin.
    const ts = infos.map((i) => i.t);
    if (Math.max(...ts) < -0.05 || Math.min(...ts) > 1.05) continue;
    const ds = infos.map((i) => i.d);
    const min = Math.min(...ds);
    const max = Math.max(...ds);
    /*
      CHEVAUCHER, C'EST AVOIR UN PIED DE CHAQUE CÔTÉ DU NU.

      Le mur occupe une bande d'épaisseur `WALL_T` autour de son axe. Si les
      coins du meuble se répartissent des deux côtés de cette bande — ou
      dedans — c'est qu'il mord dans la maçonnerie, et on ne lâche pas là.
    */
    if (min < demi && max > -demi) {
      dansLeMur = true;
      // Un seul mur mordu suffit à refuser : rien ne sert de mesurer les
      // autres. C'est aussi ce qui rend la boucle rapide sur un plan chargé,
      // et elle tourne à chaque image du geste.
      break;
    }
  }

  return { centre: vise, valide: !dansLeMur };
}

/**
 * PORTÉE DE L'AIMANT DU TRACÉ, en mètres.
 *
 * Douze centimètres : c'est exactement la tolérance à laquelle `addRoomRect`
 * reconnaît un mur existant et le reprend au lieu de le doubler. Les deux
 * chiffres doivent être le même — un aimant qui colle plus loin que la
 * reprise créerait un mur en double juste à côté de l'ancien, ce qui est
 * pire que pas d'aimant du tout.
 */
export const PORTEE_TRACE = 0.12;

/**
 * COLLE UN COIN SUR LES LIGNES QUE LES MURS DESSINENT DÉJÀ.
 *
 * Le geste « poser, glisser, lâcher » reprend un mur existant quand un côté
 * tombe dessus. Sans aide, y tomber relève de la CHANCE : douze centimètres
 * sur un plan dézoomé, ce sont deux pixels.
 *
 * On aimante donc chaque axe séparément — l'abscisse sur les murs verticaux,
 * l'ordonnée sur les horizontaux. C'est ainsi qu'un logement se construit :
 * les pièces s'alignent sur ce qui existe, elles ne flottent pas à côté.
 *
 * ET SEULEMENT DE PRÈS : au large, on tire où l'on veut. Une pièce posée à
 * un mètre du reste est un choix, pas une erreur de visée.
 */
export function aimanterCoin(
  p: Pt,
  murs: WallSeg[],
  portee = PORTEE_TRACE,
): Pt {
  let dx = portee;
  let x = p.x;
  let dz = portee;
  let z = p.z;
  for (const w of murs) {
    if (w.type !== 'wall') continue;
    for (const bout of [w.a, w.b]) {
      // Chaque bout de mur porte une ligne verticale et une horizontale :
      // c'est l'union des deux qui fait la trame du logement.
      const ex = Math.abs(bout.x - p.x);
      if (ex < dx) {
        dx = ex;
        x = bout.x;
      }
      const ez = Math.abs(bout.z - p.z);
      if (ez < dz) {
        dz = ez;
        z = bout.z;
      }
    }
  }
  return { x, z };
}
