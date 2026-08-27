/**
 * CE QUE LE BSP TIENT, ET CE QU'IL COÛTE — le compteur tranche.
 *
 * Releve du patron : « fais un systeme plus infaillible en restant fluide,
 * mais avec un vrai 3D strict — impossible qu'un mur passe devant un
 * element », puis, sur la suite : « si le BSP ne tient pas ses promesses, le
 * dire avec les chiffres et garder l'existant : c'est le compteur qui
 * tranche, pas le raisonnement ».
 *
 * L'ARBRE EST JUSTE. Le banc `bsp` le prouve sur les deux cas que le
 * classement par comparaison ne PEUT pas resoudre — la ronde et les volumes
 * qui se traversent. Ce banc-ci le met a l'epreuve d'une vraie scene, le
 * salon meuble de onze meubles qui avait fait ramer le modele, avec la
 * projection EXACTE de l'ecran du telephone.
 *
 * ET IL NE SERA PAS BRANCHE. Voici pourquoi, en chiffres :
 *
 *   — LE CLASSEMENT ACTUEL EST DEJA A ZERO FAUTE sur cette scene, volumes
 *     qui se traversent compris. Le rabotage des boites trop grandes et les
 *     fleches de masquage ont deja retire du plan les configurations que le
 *     tri du peintre ne sait pas trancher. Il n'y a donc RIEN a gagner en
 *     exactitude — et une garantie qui garantit un resultat deja obtenu ne
 *     vaut que son prix ;
 *
 *   — ET SON PRIX EST LE SEUL QUI COMPTE ICI. `grouperTraces` le dit :
 *     « chaque face est une VUE NATIVE que le moteur repeint et que React
 *     reconcilie a chaque image ; cinq cent cinquante vues, c'est le mur ».
 *     La decoupe multiplie les morceaux, donc les traces : cent
 *     soixante-quinze traces deviennent trois cent six sur UNE piece meublee.
 *     Un T4 franchirait le mur.
 *
 *   — L'ECONOMIE, ELLE, EST REELLE MAIS DANS LA MAUVAISE MONNAIE : le
 *     parcours de l'arbre coute un sixieme de milliseconde la ou le
 *     classement en coute quatre. Quatre millisecondes de calcul gagnees
 *     contre cent trente vues natives de plus a repeindre : ce n'est pas le
 *     calcul qui faisait ramer le modele, c'est le nombre de vues, et c'est
 *     mesure depuis longtemps.
 *
 * CE BANC GARDE LA DECISION MESUREE, pas racontee. Le jour ou l'une des
 * trois lignes change — le classement se met a faute, ou la decoupe cesse de
 * multiplier les traces — il crie, et la decision se relit.
 */
import {
  ajusterBlocs,
  buildScene,
  faceDepth,
  isHiddenFace,
  roomRanks,
  sceneFraming,
  type CameraTrig,
  type Face3D,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { construireBsp, ordreBsp } from '../src/geometry/bsp';
import { grouperTraces } from '../src/ui/traces';
import type { WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/*
  LE SALON QUI AVAIT FAIT RAMER LE MODELE — celui de `fluidite3d`, onze
  meubles. On reprend LA MEME scene : deux bancs qui parlent du meme sujet
  sur deux scenes differentes ne se comparent pas.
*/
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

const rad = (d: number) => (d * Math.PI) / 180;

const dansPoly = (p: { sx: number; sy: number }, s: { sx: number; sy: number }[]) => {
  let d = false;
  for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
    if (
      s[i].sy > p.sy !== s[j].sy > p.sy &&
      p.sx < ((s[j].sx - s[i].sx) * (p.sy - s[i].sy)) / (s[j].sy - s[i].sy) + s[i].sx
    ) {
      d = !d;
    }
  }
  return d;
};

/** La profondeur du plan d'un polygone projeté, au point demandé. */
const profAu = (
  pts: { sx: number; sy: number; depth: number }[],
  p: { sx: number; sy: number },
): number | null => {
  const a = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const u = { x: pts[i].sx - a.sx, y: pts[i].sy - a.sy, z: pts[i].depth - a.depth };
    const v = {
      x: pts[i + 1].sx - a.sx,
      y: pts[i + 1].sy - a.sy,
      z: pts[i + 1].depth - a.depth,
    };
    const n = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    if (Math.abs(n.z) < 1e-9) continue;
    return a.depth - (n.x * (p.sx - a.sx) + n.y * (p.sy - a.sy)) / n.z;
  }
  return null;
};

/*
  LA PROJECTION DE L'ECRAN, ET SA DIRECTION D'OEIL — les deux ensemble.

  La regle de la maison, apprise a ses depens : « un banc de rendu 3D avait
  recopie la projection de la PLANCHE de reference, ou l'inclinaison joue
  autrement — il mesurait une autre camera que celle du telephone ». On ecrit
  donc les deux au meme endroit, tirees de la meme camera : la profondeur du
  projecteur vaut `(x·st + z·ct)·sp + y·cp`, et la direction qui va de la
  scene vers l'oeil est exactement `(st·sp, cp, ct·sp)`. Le banc « le meme
  oeil des deux cotes » ci-dessous le verifie plutot que de le croire.
*/
const projecteur = (cam: CameraTrig, centre: P3) => (p: P3) => {
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
const versLOeil = (cam: CameraTrig): P3 => ({
  x: cam.st * cam.sp,
  y: cam.cp,
  z: cam.ct * cam.sp,
});

const CAMERAS = (() => {
  const out: { theta: number; tilt: number; cam: CameraTrig }[] = [];
  for (let theta = 0; theta < 360; theta += 10) {
    for (const tilt of [20, 45, 70]) {
      out.push({
        theta,
        tilt,
        cam: {
          ct: Math.cos(rad(theta)),
          st: Math.sin(rad(theta)),
          cp: Math.cos(rad(tilt)),
          sp: Math.sin(rad(tilt)),
        },
      });
    }
  }
  return out;
})();

const { faces, rooms } = buildScene(MURS, [], MEUBLES, {
  palette: PAL,
  showSurfaces: true,
  rooms: [{ id: 'r1' }],
});
const APLATS = faces.filter((f) => f.pts.length >= 3 && f.fill !== null);
const CENTRE = sceneFraming(faces).center;
const ARBRE = construireBsp(APLATS);

/** Les fautes de peinture d'un ordre donné, jugées au point de chaque face. */
function fautesDe(
  peintes: { proj: { sx: number; sy: number; depth: number }[] }[],
): number {
  const rang = new Map(peintes.map((p, i) => [p, i]));
  let fautes = 0;
  for (const A of peintes) {
    const pt = {
      sx: A.proj.reduce((s, p) => s + p.sx, 0) / A.proj.length,
      sy: A.proj.reduce((s, p) => s + p.sy, 0) / A.proj.length,
    };
    const da = profAu(A.proj, pt);
    if (da === null) continue;
    for (const B of peintes) {
      if (B === A || !dansPoly(pt, B.proj)) continue;
      const db = profAu(B.proj, pt);
      if (db === null) continue;
      // `A` est devant `B` au point regardé, et pourtant `B` se peint après.
      if (da > db + 0.02 && rang.get(B)! > rang.get(A)!) fautes++;
    }
  }
  return fautes;
}

describe('le même œil des deux côtés', () => {
  it('la direction du BSP est celle de la profondeur du projecteur', () => {
    /*
      LE CONTROLE QUI EVITE DE MESURER UNE AUTRE CAMERA. Si la direction
      donnee a l'arbre n'etait pas celle de l'ecran, la comparaison qui suit
      ne voudrait rien dire — et elle passerait quand meme, l'arbre etant
      juste pour SA camera a lui.
    */
    for (const { cam } of CAMERAS.filter((_, i) => i % 11 === 0)) {
      const project = projecteur(cam, { x: 0, y: 0, z: 0 });
      const vers = versLOeil(cam);
      for (const p of [
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -0.7, y: 2.3, z: 1.4 },
      ]) {
        const scal = p.x * vers.x + p.y * vers.y + p.z * vers.z;
        expect(project(p).depth).toBeCloseTo(scal, 9);
      }
    }
  });
});

describe('sur un salon meublé, l’un et l’autre', () => {
  /** Les deux ordres, mesurés en un seul tour pour ne rien payer deux fois. */
  const mesure = (() => {
    let fautesTri = 0;
    let fautesBsp = 0;
    let tracesTri = 0;
    let tracesBsp = 0;
    let msTri = 0;
    let msBsp = 0;
    for (const { cam } of CAMERAS) {
      const project = projecteur(cam, CENTRE);
      const rangs = roomRanks(rooms, cam);
      const items = APLATS.filter((f) => !isHiddenFace(f, cam)).map((f) => ({
        f,
        proj: f.pts.map(project),
        depth: faceDepth(f, project, cam, rangs),
        owner: f.ownerId,
        room: f.roomId,
        pan: f.panId,
        bord: f.bordDe,
      }));
      const t0 = Date.now();
      ajusterBlocs(items);
      msTri += Date.now() - t0;
      const peintes = [...items].sort((a, b) => a.depth - b.depth);
      fautesTri += fautesDe(peintes);
      tracesTri += grouperTraces(
        peintes.map((p) => ({
          proj: p.proj,
          fill: p.f.fill ?? 'none',
          stroke: p.f.stroke ?? 'none',
          voile: 1,
          dashed: false,
        })),
      ).length;

      const t1 = Date.now();
      const ordre = ordreBsp(ARBRE, versLOeil(cam)).filter(
        (m) => !isHiddenFace(m.source, cam),
      );
      msBsp += Date.now() - t1;
      const morceaux = ordre.map((m) => ({
        source: m.source as Face3D,
        proj: m.pts.map(project),
      }));
      fautesBsp += fautesDe(morceaux);
      tracesBsp += grouperTraces(
        morceaux.map((p) => ({
          proj: p.proj,
          fill: p.source.fill ?? 'none',
          stroke: p.source.stroke ?? 'none',
          voile: 1,
          dashed: false,
        })),
      ).length;
    }
    const n = CAMERAS.length;
    return {
      n,
      fautesTri,
      fautesBsp,
      tracesTri: tracesTri / n,
      tracesBsp: tracesBsp / n,
      msTri: msTri / n,
      msBsp: msBsp / n,
    };
  })();

  it('ne se trompe jamais — ni l’arbre, ni le classement', () => {
    // C'est la premiere moitie du verdict : l'arbre tient sa promesse, et le
    // classement n'avait rien a se faire pardonner sur cette scene-la.
    expect(
      `classement ${mesure.fautesTri} · arbre ${mesure.fautesBsp}` +
        ` (sur ${mesure.n} prises de vue)`,
    ).toBe(`classement 0 · arbre 0 (sur ${mesure.n} prises de vue)`);
  });

  it('mais l’arbre demande beaucoup plus de tracés, et c’est ce qui tranche', () => {
    /*
      LA SECONDE MOITIE, ET LA RAISON DU CHOIX. `grouperTraces` : « cinq cent
      cinquante vues, c'est le mur ». Une piece meublee passe de cent
      soixante-quinze traces a trois cents ; un T4 franchirait le mur.

      Le banc n'exige pas un chiffre — les echelles changent, et un banc qui
      nomme un reglage par son chiffre casse le jour ou le reglage bouge. Il
      exige la NATURE du constat : la decoupe coute des traces, et pas qu'un
      peu.
    */
    console.log(
      `classement : ${mesure.tracesTri.toFixed(0)} tracés, ` +
        `${mesure.msTri.toFixed(2)} ms/image — ` +
        `arbre : ${mesure.tracesBsp.toFixed(0)} tracés, ` +
        `${mesure.msBsp.toFixed(2)} ms/image`,
    );
    expect(mesure.tracesBsp).toBeGreaterThan(mesure.tracesTri * 1.3);
  });

  it('et il coûte bien moins cher à parcourir : l’économie est réelle', () => {
    // On ne cache pas ce que l'arbre gagne : le parcours est une fraction du
    // classement. C'est simplement la mauvaise monnaie — ce n'est pas le
    // calcul qui faisait ramer le modele, c'est le nombre de vues.
    expect(mesure.msBsp).toBeLessThanOrEqual(mesure.msTri);
  });
});
