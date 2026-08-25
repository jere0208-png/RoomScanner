/**
 * UN MUR NE PASSE JAMAIS DEVANT UN MEUBLE QU'IL NE CACHE PAS.
 *
 * Releve de chantier, capture a l'appui : « les meubles sont superposes par
 * des murs selon les angles… le lavabo est cache par le mur, comme d'autres
 * meubles ». Le releve precedent avait la meme cause pour moitie — des
 * boites qui trempaient dans la maconnerie, que le rabotage a corrigees —
 * mais le defaut restait.
 *
 * CE QUE CE BANC MESURE, ET QUE L'AUDIT 3D NE MESURAIT PAS. `audit3d`
 * eprouve le classement NU : il appelle `ajusterBlocs` sans les fleches
 * imposees. L'ecran, lui, en pose : `masquesDeScene` dit, pour chaque pan de
 * mur, les meubles qu'il masque, et l'ecran les impose des que le plan lui
 * fait face. Ce banc suit donc le chemin de l'ECRAN, avec ses fleches — le
 * seul qui puisse voir ce que le chantier voit.
 *
 * CE QUE LA MESURE A DESIGNE, ET CE N'ETAIT PAS LE PIXEL. Sans les fleches
 * imposees par les masques, cette scene ne compte AUCUNE faute ; avec elles,
 * trois. Ce sont donc les fleches qui inversaient l'ordre — non parce
 * qu'elles sont fausses, mais parce qu'elles ne disent rien du reste. Un pan
 * qui doit passer apres deux meubles descend dans le classement, et rien ne
 * le retient de passer aussi apres un TROISIEME qu'il ne masque pas et qui,
 * lui, est derriere lui.
 *
 * LA FLECHE NE VAUT DONC QUE LA OU LES DEUX SE RENCONTRENT a l'ecran. Ailleurs,
 * l'ordre n'a aucune consequence visible — et une contrainte sans consequence
 * visible n'a que des effets de bord.
 *
 * MAIS PAS SOUS LE DOIGT. La vue garde son ordre quelques degres pendant un
 * geste : un ordre qu'on reemploie doit etre ROBUSTE, donc garder ses fleches
 * entieres. C'est la mesure de `percemur` qui l'impose — restreindre partout
 * y ramenait dix-huit percees a un degre. Un trait de dos qui parait le temps
 * d'un clignement ne se voit pas ; un lavabo cache au repos se voit tout de
 * suite.
 *
 * DEUX AUTRES PISTES ONT ETE ESSAYEES ET ECARTEES, chiffres a l'appui :
 * poser la fleche INVERSE — le mur du fond avant ses meubles — faisait
 * passer les trois recouvrements a vingt-neuf ; et la restreindre aux seules
 * rencontres a l'ecran ne suffisait pas non plus. C'est le compteur qui
 * tranche, pas le raisonnement.
 *
 * ET UN PIEGE DE PLUS, ATTRAPE EN CHEMIN : ce banc avait d'abord recopie la
 * projection de la PLANCHE de reference, ou l'inclinaison joue autrement —
 * `sy` et `depth` s'y echangent sinus et cosinus. Il mesurait une autre
 * camera que celle du telephone. Un banc qui n'est pas sur la meme vue que
 * l'ecran ne prouve rien de ce qu'on voit.
 */
import {
  ajusterBlocs,
  buildScene,
  faceDepth,
  isHiddenFace,
  cutawayOpacity,
  masquesDeScene,
  roomRanks,
  type Face3D,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import {
  detectRooms,
  mergeColinear,
  splitAtJunctions,
  weldCorners,
  type WallSeg,
} from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';
import type { Fixture } from '../src/geometry/electrical';

const PALETTE: ScenePalette = MAQUETTE;

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.4,
  yCenter: 1.2,
  roomId: 'sdb',
});

/** Une salle d'eau de 1,80 x 2,20 — l'ordre de grandeur du releve. */
const L = 1.8;
const P = 2.2;
const MURS: WallSeg[] = [
  mur('n', 0, 0, L, 0),
  mur('e', L, 0, L, P),
  mur('s', L, P, 0, P),
  mur('o', 0, P, 0, 0),
];

const boite = (
  id: string,
  cat: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  y: number,
): ObjectData => ({
  id,
  category: cat,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, y, cz, 1],
});

/*
  CE QUE LE CHANTIER AVAIT SOUS LES YEUX : un meuble-vasque contre le mur du
  fond, un placard haut au-dessus, et des WC dans l'angle. Tous COLLES a leur
  mur — c'est ainsi qu'on pose une salle d'eau, et c'est le cas ou un meuble
  recouvre son mur sur presque toute sa hauteur.
*/
const MEUBLES: ObjectData[] = [
  boite('vasque', 'storage', 0.9, 0.28, 1.1, 0.5, 0.85, 0.42),
  boite('placard', 'storage', 0.9, 0.2, 1.1, 0.35, 0.7, 1.65),
  boite('wc', 'toilet', 1.5, 1.9, 0.4, 0.65, 0.8, 0.4),
];

const ROOMS = detectRooms(MURS).map((r, i) => ({
  id: `room-${i + 1}`,
  wallIds: r.wallIds,
}));

/*
  ET LA VRAIE SALLE D'EAU DU RELEVE : NEUF MURS POUR 3,8 m².

  La premiere scene est un rectangle — quatre murs, la geometrie la plus
  simple qui soit. Le chantier, lui, montrait « 9 MURS · 3,8 M² » : une piece
  biscornue, avec des retours de maconnerie. Un retour est un pan COURT, vu
  de champ sous la plupart des angles, et c'est exactement le genre de face
  que le classement departage le plus mal.

  Le banc porte donc les deux. Une correction qui ne tient que sur le
  rectangle ne tient pas.
*/
const enL: WallSeg[] = mergeColinear(
  splitAtJunctions(
    weldCorners([
      mur('a', 0, 0, 1.7, 0),
      mur('b', 1.7, 0, 1.7, 0.9),
      mur('c', 1.7, 0.9, 2.5, 0.9),
      mur('d', 2.5, 0.9, 2.5, 2.3),
      mur('e2', 2.5, 2.3, 0.6, 2.3),
      mur('f', 0.6, 2.3, 0.6, 1.4),
      mur('g', 0.6, 1.4, 0, 1.4),
      mur('h', 0, 1.4, 0, 0),
    ]),
  ),
);

const MEUBLES_L: ObjectData[] = [
  // Le meuble-vasque contre le grand mur du fond, et son placard au-dessus.
  boite('vasque', 'storage', 1.5, 1.2, 0.9, 0.5, 0.85, 0.42),
  boite('placard', 'storage', 1.5, 1.15, 0.9, 0.35, 0.7, 1.65),
  // Les WC dans le retour : le cas qui n'existait pas sur un rectangle.
  boite('wc', 'toilet', 1.2, 2, 0.4, 0.65, 0.8, 0.4),
];

const ROOMS_L = detectRooms(enL).map((r, i) => ({
  id: `piece-${i + 1}`,
  wallIds: r.wallIds,
}));

interface Plateau {
  nom: string;
  murs: WallSeg[];
  scene: ReturnType<typeof buildScene>;
  masques: ReturnType<typeof masquesDeScene>;
}

const monterScene = (
  nom: string,
  murs: WallSeg[],
  meubles: ObjectData[],
  pieces: { id: string; wallIds: string[] }[],
  menuiseries: WallSeg[] = [],
  elec: Fixture[] = [],
): Plateau => {
  const sc = buildScene(murs, menuiseries, meubles, {
    palette: PALETTE,
    showSurfaces: true,
    rooms: pieces,
    fixtures: elec,
  });
  return { nom, murs, scene: sc, masques: masquesDeScene(sc.faces) };
};

/*
  ET LA MEME, EQUIPEE — parce qu'une salle d'eau nue n'existe pas.

  Le releve montrait « 9 MURS · 4 MEUBLES · 3 ELEC. », et une porte cernee
  d'ambre. Or une menuiserie DECOUPE son mur — trumeaux, linteau, allege —
  et l'appareillage fait basculer le mur qui le porte sur un autre chemin de
  tri (les tuiles, voir `depthRefs`). Deux façons de multiplier les pans
  courts, et les pans courts sont ce que le classement departage le plus mal.
*/
const PORTE_L: WallSeg = {
  id: 'porte-l',
  type: 'door',
  roomId: 'sdb',
  a: { x: 0.15, z: 1.4 },
  b: { x: 0.6, z: 1.4 },
  height: 2.04,
  yCenter: 1.02,
};

const ELEC_L: Fixture[] = [
  { id: 'e1', kind: 'inter', wallId: enL[0]?.id ?? 'a', along: 0.4, height: 1.1, side: 1 },
  { id: 'e2', kind: 'prise', wallId: enL[0]?.id ?? 'a', along: 1.2, height: 1.1, side: 1 },
  { id: 'e3', kind: 'applique', wallId: enL[1]?.id ?? 'b', along: 0.4, height: 1.9, side: 1 },
];

const PLATEAUX: Plateau[] = [
  monterScene('salle d’eau rectangulaire', MURS, MEUBLES, ROOMS),
  monterScene('salle d’eau à retours (9 murs)', enL, MEUBLES_L, ROOMS_L),
  monterScene(
    'salle d’eau équipée : porte et appareillage',
    enL,
    MEUBLES_L,
    ROOMS_L,
    [PORTE_L],
    ELEC_L,
  ),
];

const centreDe = (faces: { pts: P3[] }[]) => {
  const pts = faces.flatMap((f) => f.pts);
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of pts) {
    lo.x = Math.min(lo.x, p.x); lo.y = Math.min(lo.y, p.y); lo.z = Math.min(lo.z, p.z);
    hi.x = Math.max(hi.x, p.x); hi.y = Math.max(hi.y, p.y); hi.z = Math.max(hi.z, p.z);
  }
  return { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
};

const rad = (d: number) => (d * Math.PI) / 180;
const camera = (theta: number, tilt: number) => ({
  ct: Math.cos(rad(theta)),
  st: Math.sin(rad(theta)),
  cp: Math.cos(rad(tilt)),
  sp: Math.sin(rad(tilt)),
});

/** La projection orthographique de la vue, en points d'ecran. */
const projecteur =
  (cam: ReturnType<typeof camera>, centre: P3) => (p: P3) => {
  const x = p.x - centre.x;
  const y = p.y - centre.y;
  const z = p.z - centre.z;
  const rx = x * cam.ct - z * cam.st;
  const rz = x * cam.st + z * cam.ct;
  /*
    LA PROJECTION DE L'ECRAN, AU SIGNE PRES.

    Ce banc l'avait d'abord recopiee depuis la planche de reference, ou
    l'inclinaison joue autrement : `sy` et `depth` s'y echangent le sinus et
    le cosinus. Il mesurait donc une AUTRE camera que celle du telephone —
    et un banc qui n'est pas sur la meme vue que l'ecran ne prouve rien de
    ce qu'on voit. C'est celle d'`Iso3DView`, telle quelle.
  */
  return {
    sx: rx * 120,
    sy: (rz * cam.cp - y * cam.sp) * 120,
    depth: rz * cam.sp + y * cam.cp,
  };
};

const dansPoly = (p: { sx: number; sy: number }, poly: { sx: number; sy: number }[]) => {
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

/** La profondeur du plan d'une face au point vise. */
const profAu = (
  proj: { sx: number; sy: number; depth: number }[],
  p: { sx: number; sy: number },
) => {
  const a = proj[0];
  for (let i = 1; i + 1 < proj.length; i++) {
    const b = proj[i];
    const c = proj[i + 1];
    const det = (b.sy - c.sy) * (a.sx - c.sx) + (c.sx - b.sx) * (a.sy - c.sy);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((b.sy - c.sy) * (p.sx - c.sx) + (c.sx - b.sx) * (p.sy - c.sy)) / det;
    const l2 = ((c.sy - a.sy) * (p.sx - c.sx) + (a.sx - c.sx) * (p.sy - c.sy)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -0.01 || l2 < -0.01 || l3 < -0.01) continue;
    return l1 * a.depth + l2 * b.depth + l3 * c.depth;
  }
  return null;
};

/**
 * LES FAUTES : un MUR peint par-dessus un MEUBLE qui est devant lui.
 *
 * On ne compte que ce couple-la — c'est celui du releve — et seulement quand
 * les deux volumes ne se traversent pas : la ou deux volumes s'interpenetrent,
 * aucun ordre de peinture n'est juste, et le rabotage est le remede.
 */
function fautes(plateau: Plateau, theta: number, tilt: number) {
  const { scene, masques } = plateau;
  const faces = scene.faces;
  const cam = camera(theta, tilt);
  const project = projecteur(cam, centreDe(faces));
  const rangs = roomRanks(scene.rooms, cam);
  // Le pan nous fait-il face ? C'est la seule question qui depende de l'angle.
  const regardVers = (panId?: number) => {
    if (panId === undefined) return null;
    const m = masques.get(panId);
    if (!m) return null;
    const vers = m.n.x * cam.st * cam.sp + m.n.y * cam.cp + m.n.z * cam.ct * cam.sp;
    return { m, vers };
  };
  const masqueDe = (panId?: number) => {
    const r = regardVers(panId);
    return r && r.vers > 0 ? r.m.cache : undefined;
  };
  const vues = faces
    .filter((f) => !isHiddenFace(f, cam) && f.fill !== null && f.pts.length >= 3)
    .map((f) => ({
      f,
      proj: f.pts.map(project),
      depth: faceDepth(f, project, cam, rangs),
      owner: f.ownerId,
      room: f.roomId,
      pan: f.panId,
      bord: f.bordDe,
      cache: masqueDe(f.panId),
    }));
  ajusterBlocs(vues);
  const peintes = [...vues].sort((a, b) => a.depth - b.depth);
  const rang = new Map(peintes.map((p, i) => [p.f, i] as [Face3D, number]));
  let n = 0;
  for (const a of vues) {
    // On regarde ce qui arrive AUX MEUBLES.
    if (!a.owner) continue;
    const pt = {
      sx: a.proj.reduce((s, p) => s + p.sx, 0) / a.proj.length,
      sy: a.proj.reduce((s, p) => s + p.sy, 0) / a.proj.length,
    };
    const da = profAu(a.proj, pt);
    if (da === null) continue;
    for (const b of vues) {
      // …par un MUR, et par lui seul.
      if (b === a || b.owner || !dansPoly(pt, b.proj)) continue;
      const db = profAu(b.proj, pt);
      if (db === null) continue;
      // Le meuble est franchement devant, et le mur se peint apres lui.
      if (da > db + 0.02 && rang.get(b.f)! > rang.get(a.f)!) n++;
    }
  }
  return n;
}

/**
 * LES MURS OPAQUES POSES DEVANT UN MEUBLE.
 *
 * Ceux-la ne sont pas une faute de TRI : ils sont vraiment entre l'oeil et le
 * meuble, et le classement a raison de les peindre en dernier. C'est
 * l'ECORCHE qui devrait les effacer — le rendu estompe la face exterieure
 * d'un mur pour qu'on voie DANS la piece sans avoir a tourner le modele par
 * dessus.
 *
 * Il ne le faisait qu'en fonction de l'ANGLE : « un mur vu de champ ne cache
 * rien, il reste plein ». C'est vrai d'un mur vu de champ au milieu de nulle
 * part ; c'est faux du mur vu de champ qui coupe justement le lavabo. Sur les
 * trois scenes de ce banc, DEUX MILLE TROIS CENT SOIXANTE-SIX prises de vue
 * montraient un pan exterieur opaque a plus de moitie pose devant un meuble.
 *
 * La regle devient donc : un mur vu de champ ne cache rien — SAUF quand il
 * cache vraiment quelque chose.
 */
const voilesOpaques = (plateau: Plateau, theta: number, tilt: number) => {
  const { scene, masques } = plateau;
  const faces = scene.faces;
  const cam = camera(theta, tilt);
  const project = projecteur(cam, centreDe(faces));
  const vues = faces
    .filter((f) => !isHiddenFace(f, cam) && f.fill !== null && f.pts.length >= 3)
    .map((f) => ({ f, proj: f.pts.map(project) }));
  let n = 0;
  for (const a of vues) {
    if (!a.f.ownerId) continue;
    const pt = {
      sx: a.proj.reduce((s2, p) => s2 + p.sx, 0) / a.proj.length,
      sy: a.proj.reduce((s2, p) => s2 + p.sy, 0) / a.proj.length,
    };
    const da = profAu(a.proj, pt);
    if (da === null) continue;
    for (const b of vues) {
      if (b === a || b.f.ownerId || !b.f.cutaway || !b.f.normal) continue;
      if (!dansPoly(pt, b.proj)) continue;
      const db = profAu(b.proj, pt);
      if (db === null || db <= da + 0.02) continue;
      // Il est devant le meuble : s'efface-t-il assez pour qu'on le voie ?
      if (cutawayOpacity(b.f.normal, cam, masques.get(b.f.panId ?? -1)?.cache) > 0.5) {
        n++;
      }
    }
  }
  return n;
};

describe('le voile d’un mur suit ce qu’il cache', () => {
  it.each(PLATEAUX.map((p) => [p.nom, p] as const))(
    '« %s » : aucun pan opaque posé devant un meuble',
    (_nom, plateau) => {
      let total = 0;
      const fautifs: string[] = [];
      for (let theta = 0; theta < 360; theta += 5) {
        for (const tilt of [20, 35, 55]) {
          const n = voilesOpaques(plateau, theta, tilt);
          total += n;
          if (n > 0 && fautifs.length < 6) fautifs.push(`${theta}°/${tilt}°`);
        }
      }
      expect(`${total} pan(s) opaque(s)` + (total ? ` — ${fautifs.join(', ')}` : '')).toBe(
        '0 pan(s) opaque(s)',
      );
    },
  );
});

describe('un meuble collé à son mur', () => {
  it.each(PLATEAUX.map((p) => [p.nom, p] as const))(
    '« %s » : jamais recouvert, sur tout le tour',
    (_nom, plateau) => {
    let total = 0;
    const fautifs: string[] = [];
    for (let theta = 0; theta < 360; theta += 5) {
      for (const tilt of [20, 35, 55]) {
        const n = fautes(plateau, theta, tilt);
        total += n;
        if (n > 0 && fautifs.length < 6) fautifs.push(`${theta}°/${tilt}°`);
      }
    }
    // Deux cent seize prises de vue, et pas un mur devant un meuble.
    expect(`${total} recouvrement(s)` + (total ? ` — ${fautifs.join(', ')}` : '')).toBe(
      '0 recouvrement(s)',
    );
    },
  );
});
