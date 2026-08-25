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
 * CE QUE LE BANC MESURE AUJOURD'HUI : TROIS recouvrements, a 230° d'azimut
 * et 55° d'inclinaison, sur les deux cent seize prises de vue du tour. Ce
 * n'est pas zero, et le chiffre est ecrit ici expres — c'est un VERROU : le
 * defaut ne doit pas grandir pendant qu'on travaille ailleurs.
 *
 * CE QUI A ETE ESSAYE, ET ECARTE. La regle des masques n'a qu'un sens : elle
 * dit « ce pan masque ces meubles » — le mur devant, le meuble derriere —
 * et ne dit rien du cas inverse, un mur du FOND avec ses meubles devant lui.
 * Poser cette fleche-la paraissait aller de soi : elle est aussi
 * geometrique que l'autre. La mesure a dit non — trois recouvrements sont
 * devenus VINGT-NEUF. Les fleches imposees entrent dans un classement par
 * insertion qui n'est pas transitif (voir `ordreLocal`) ; en ajouter de
 * justes peut en deranger d'autres, et le bilan se juge au compteur, pas au
 * raisonnement. La regle a ete retiree.
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
  masquesDeScene,
  roomRanks,
  type Face3D,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';

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

const scene = buildScene(MURS, [], MEUBLES, {
  palette: PALETTE,
  showSurfaces: true,
  rooms: ROOMS,
});
const faces = scene.faces;
const masques = masquesDeScene(faces);

const centre = (() => {
  const pts = faces.flatMap((f) => f.pts);
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of pts) {
    lo.x = Math.min(lo.x, p.x); lo.y = Math.min(lo.y, p.y); lo.z = Math.min(lo.z, p.z);
    hi.x = Math.max(hi.x, p.x); hi.y = Math.max(hi.y, p.y); hi.z = Math.max(hi.z, p.z);
  }
  return { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
})();

const rad = (d: number) => (d * Math.PI) / 180;
const camera = (theta: number, tilt: number) => ({
  ct: Math.cos(rad(theta)),
  st: Math.sin(rad(theta)),
  cp: Math.cos(rad(tilt)),
  sp: Math.sin(rad(tilt)),
});

/** La projection orthographique de la vue, en points d'ecran. */
const projecteur = (cam: ReturnType<typeof camera>) => (p: P3) => {
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
function fautes(theta: number, tilt: number) {
  const cam = camera(theta, tilt);
  const project = projecteur(cam);
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

describe('un meuble collé à son mur', () => {
  it('n’est pas recouvert par lui plus qu’on ne l’a mesuré', () => {
    let total = 0;
    const fautifs: string[] = [];
    for (let theta = 0; theta < 360; theta += 5) {
      for (const tilt of [20, 35, 55]) {
        const n = fautes(theta, tilt);
        total += n;
        if (n > 0 && fautifs.length < 6) fautifs.push(`${theta}°/${tilt}°`);
      }
    }
    /*
      LE VERROU, PAS LA CIBLE.

      Trois recouvrements sur deux cent seize prises de vue : c'est ce que le
      defaut vaut aujourd'hui, et le banc interdit qu'il grandisse. Le jour
      ou on saura le ramener a zero, c'est ce chiffre-la qu'on baissera —
      jamais l'inverse.
    */
    expect(`${total} recouvrement(s)` + (total ? ` — ${fautifs.join(', ')}` : '')).toBe(
      '3 recouvrement(s) — 230°/55°',
    );
  });
});
