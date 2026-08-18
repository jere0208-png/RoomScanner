/**
 * QUI RECOUVRE QUI — l'épreuve au pixel, la seule qui ne mente pas.
 *
 * Deux invariants précédents disaient « un meuble derrière un mur reste
 * derrière » et son inverse. Tous deux comparaient les EXTRÊMES de deux
 * faces : une face n'était jugée « devant » que si TOUS ses points l'étaient.
 * Un meuble adossé à un mur ne remplit jamais cette condition — son dos
 * touche la maçonnerie — et la paire était donc écartée sans être jugée.
 *
 * C'est exactement le cas que le chantier a filmé : en tournant le modèle,
 * le rangement disparaît, avalé par le mur contre lequel il s'appuie.
 *
 * Ici, on juge comme l'œil : on prend un POINT de l'écran couvert par les
 * deux faces, on calcule la profondeur de chacune EN CE POINT, et celle qui
 * est devant doit être peinte en dernier. Aucune tolérance, aucune
 * moyenne — c'est la définition même de « recouvrir ».
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
import type { WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';
import type { Fixture } from '../src/geometry/electrical';

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

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  roomId = 'r1',
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

const boite = (
  id: string,
  categorie: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
): ObjectData => ({
  id,
  category: categorie,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, h / 2, cz, 1],
});

/** La chambre de la vidéo : un rangement en deux caissons, un lit. */
const CHAMBRE = {
  nom: 'chambre',
  walls: [
    mur('n', 0, 0, 3.4, 0),
    mur('e', 3.4, 0, 3.4, 2.5),
    mur('s', 3.4, 2.5, 0, 2.5),
    mur('o', 0, 2.5, 0, 0),
  ],
  rooms: [{ id: 'r1' }],
  objects: [
    boite('bas', 'storage', 1.2, 0.32, 1, 0.55, 0.9),
    boite('haut', 'storage', 1.2, 0.27, 1, 0.45, 0.8),
    boite('lit', 'bed', 2.4, 1.4, 1.4, 2, 0.5),
  ],
  fixtures: [
    { id: 'f1', kind: 'prise', wallId: 'n', along: 2.4, height: 0.25, side: 1 },
    { id: 'f2', kind: 'inter', wallId: 'o', along: 0.6, height: 1.1, side: 1 },
  ] as Fixture[],
};

/**
 * Deux pièces mitoyennes, partageant leur cloison.
 *
 * C'est le cas que le rang des pièces doit résoudre : depuis la pièce de
 * droite, le mobilier de gauche est DERRIÈRE la cloison mitoyenne — il ne
 * doit pas se voir au travers.
 */
const DEUX_PIECES = {
  nom: 'deux pièces',
  walls: [
    mur('n1', 0, 0, 3, 0),
    mur('mitoyen', 3, 0, 3, 3),
    mur('s1', 3, 3, 0, 3),
    mur('o1', 0, 3, 0, 0),
    mur('n2', 3, 0, 6, 0, 'r2'),
    mur('e2', 6, 0, 6, 3, 'r2'),
    mur('s2', 6, 3, 3, 3, 'r2'),
  ],
  rooms: [
    { id: 'r1', wallIds: ['n1', 'mitoyen', 's1', 'o1'] },
    { id: 'r2', wallIds: ['n2', 'e2', 's2', 'mitoyen'] },
  ],
  objects: [
    boite('o1', 'storage', 1.5, 0.35, 1, 0.5, 1.8),
    boite('o2', 'storage', 4.5, 2.6, 1, 0.5, 1.8),
  ],
  fixtures: [] as Fixture[],
};

/**
 * LA MÊME CHAMBRE, COULEURS RELEVÉES.
 *
 * Le calque « Couleurs » découpe chaque mur en cases teintées : autant de
 * faces supplémentaires, chacune à sa hauteur. Le chantier l'a dit : « la
 * couleur ne doit pas cacher les éléments élec ». C'est le même ordre de
 * peinture qui répond — mais il faut l'éprouver avec ces faces-là.
 */
const grille = (teinte: string) => ({
  cols: 6,
  rows: 4,
  texels: Array.from({ length: 24 }, () => teinte),
});
const CHAMBRE_COULEURS = {
  nom: 'chambre en couleurs',
  walls: CHAMBRE.walls.map((w, i) => ({
    ...w,
    color: ['#9AA88A', '#C8BFA8', '#AFB9C4', '#D6CFC2'][i % 4],
    texture: grille(['#9AA88A', '#C8BFA8', '#AFB9C4', '#D6CFC2'][i % 4]),
  })),
  rooms: CHAMBRE.rooms,
  objects: CHAMBRE.objects,
  fixtures: CHAMBRE.fixtures,
  textures: true,
};

/** Trente-six azimuts, trois inclinaisons : la caméra fait le tour. */
const ANGLES: CameraTrig[] = [];
for (let theta = 0; theta < 360; theta += 10) {
  for (const tilt of [30, 45, 58, 72]) {
    const rad = (d: number) => (d * Math.PI) / 180;
    ANGLES.push({
      ct: Math.cos(rad(theta)),
      st: Math.sin(rad(theta)),
      cp: Math.cos(rad(tilt)),
      sp: Math.sin(rad(tilt)),
    });
  }
}

const projecteur = (cam: CameraTrig, centre: P3, echelle: number) => (p: P3) => {
  const x = p.x - centre.x;
  const y = p.y - centre.y;
  const z = p.z - centre.z;
  const rx = x * cam.ct - z * cam.st;
  const rz = x * cam.st + z * cam.ct;
  return {
    sx: 200 + rx * echelle,
    sy: 260 + (rz * cam.cp - y * cam.sp) * echelle,
    depth: rz * cam.sp + y * cam.cp,
  };
};

/** Le point est-il dans ce polygone d'écran ? */
function dansLePolygone(
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
 * La profondeur du PLAN de cette face, au point d'écran donné.
 *
 * La projection est orthographique : la profondeur varie linéairement sur
 * l'écran. Trois sommets suffisent donc à l'interpoler, en coordonnées
 * barycentriques — c'est ce que ferait un tampon de profondeur.
 */
function profondeurAu(
  f: Face3D,
  pt: { sx: number; sy: number },
  project: (p: P3) => { sx: number; sy: number; depth: number },
): number | null {
  const P = f.pts.map(project);
  for (let i = 1; i + 1 < P.length; i++) {
    const [a, b, c] = [P[0], P[i], P[i + 1]];
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

describe('l’ordre de peinture, jugé au pixel', () => {
  for (const cas of [CHAMBRE, DEUX_PIECES, CHAMBRE_COULEURS]) {
    it(`ne laisse rien recouvrir ce qui est devant — ${cas.nom}`, () => {
      const { faces, rooms } = buildScene(cas.walls, [], cas.objects, {
        palette: PAL,
        showSurfaces: true,
        showTextures: 'textures' in cas,
        rooms: cas.rooms,
        fixtures: cas.fixtures,
      });
      const centre = sceneFraming(faces).center;
      const fautes: string[] = [];
      for (const cam of ANGLES) {
        const project = projecteur(cam, centre, 60);
        const rangs = roomRanks(rooms, cam);
        const vues = faces.filter(
          (f) => !isHiddenFace(f, cam) && f.fill !== null && f.pts.length >= 3,
        );
        // Le contenu d'une pièce : le mobilier (`ownerId`) ET l'appareillage
        // (reconnu à la face de mur qu'il regarde). Le bâti, c'est le reste.
        const contenu = vues.filter((f) => (f.ownerId || f.facing) && !f.isFloor);
        const bati = vues.filter((f) => !f.ownerId && !f.facing && !f.isFloor);
        for (const m of contenu) {
          const pm = m.pts.map(project);
          const pt = {
            sx: pm.reduce((s, p) => s + p.sx, 0) / pm.length,
            sy: pm.reduce((s, p) => s + p.sy, 0) / pm.length,
          };
          const dm = profondeurAu(m, pt, project);
          if (dm === null) continue;
          const km = faceDepth(m, project, cam, rangs);
          for (const w of bati) {
            if (!dansLePolygone(pt, w.pts.map(project))) continue;
            const dw = profondeurAu(w, pt, project);
            if (dw === null) continue;
            // Le contenu est DEVANT en ce point : le bâti ne doit pas se
            // peindre après lui.
            if (dm > dw + 0.02 && faceDepth(w, project, cam, rangs) > km) {
              fautes.push(`${m.ownerId ?? 'appareil'} sous un mur`);
            }
          }
        }
      }
      expect(`${fautes.length} recouvrement(s)`).toBe('0 recouvrement(s)');
    });
  }
});

/**
 * UN MEUBLE NE SE TRAVERSE PAS LUI-MÊME.
 *
 * Relevé du chantier, capture à l'appui : « le canapé possède des bandes »,
 * « les meubles ne doivent pas être transparents ». Ce n'était pas une
 * transparence : c'était le DOS du canapé peint par-dessus son assise.
 *
 * Un meuble adossé reçoit le point de tri du mur qu'il longe, avancé de sa
 * saillie — le même pour TOUTES ses pièces. Dossier, assise et accoudoirs se
 * retrouvaient donc à égalité parfaite, et c'est l'ordre de construction qui
 * tranchait : le dossier, poussé en dernier, repeignait l'assise qui était
 * pourtant devant. D'où les bandes, et l'impression de voir au travers.
 *
 * Le banc juge au pixel, comme le précédent, mais entre CONTENUS — y compris
 * deux morceaux du même meuble.
 */
const SALON = {
  nom: 'salon meublé',
  walls: [
    mur('n', 0, 0, 5, 0),
    mur('e', 5, 0, 5, 4),
    mur('s', 5, 4, 0, 4),
    mur('o', 0, 4, 0, 0),
  ],
  rooms: [{ id: 'r1' }],
  objects: [
    // Canapé dos au mur nord, lit dos au mur ouest, rangement en angle,
    // et un meuble haut accroché à 1,50 m.
    boite('canape', 'sofa', 2.2, 0.5, 2.1, 0.9, 0.85),
    boite('lit', 'bed', 0.9, 2.4, 1.5, 2, 0.55),
    boite('range', 'storage', 4.6, 1.2, 0.6, 1.2, 2),
    {
      ...boite('haut', 'storage', 3.6, 0.3, 1.2, 0.4, 0.7),
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3.6, 1.75, 0.3, 1],
    },
  ],
  fixtures: [] as Fixture[],
};

describe('un meuble ne se traverse pas lui-même', () => {
  it('peint toujours la face la plus proche en dernier', () => {
    const { faces, rooms } = buildScene(SALON.walls, [], SALON.objects, {
      palette: PAL,
      showSurfaces: true,
      rooms: SALON.rooms,
      fixtures: SALON.fixtures,
    });
    const centre = sceneFraming(faces).center;
    const fautes = new Map<string, number>();
    for (const cam of ANGLES) {
      const project = projecteur(cam, centre, 60);
      const rangs = roomRanks(rooms, cam);
      // On refait CE QUE FAIT L'ÉCRAN : même projection, même tri, même
      // résolution interne des blocs. Un banc qui jugerait la formule de tri
      // seule ne verrait pas ce que l'œil voit.
      const vues = faces
        .filter(
          (f) =>
            !isHiddenFace(f, cam) &&
            f.fill !== null &&
            f.pts.length >= 3 &&
            f.ownerId,
        )
        .map((f) => ({
          f,
          proj: f.pts.map(project),
          depth: faceDepth(f, project, cam, rangs),
          owner: f.ownerId,
          room: f.roomId,
          pan: f.panId,
          bord: f.bordDe,
        }));
      ajusterBlocs(vues);
      const peintes = [...vues].sort((a, b) => a.depth - b.depth);
      const rang = new Map(peintes.map((p, i) => [p.f, i] as [Face3D, number]));
      for (const a of vues) {
        const pt = {
          sx: a.proj.reduce((s, p) => s + p.sx, 0) / a.proj.length,
          sy: a.proj.reduce((s, p) => s + p.sy, 0) / a.proj.length,
        };
        const da = profondeurAu(a.f, pt, project);
        if (da === null) continue;
        for (const b of vues) {
          if (b === a || !dansLePolygone(pt, b.proj)) continue;
          const db = profondeurAu(b.f, pt, project);
          if (db === null) continue;
          // `a` est devant `b` en ce point : `b` ne doit pas être peinte
          // après elle. Deux centimètres de tolérance — l'épaisseur d'un
          // placage, que l'œil ne départage pas.
          if (da > db + 0.02 && rang.get(b.f)! > rang.get(a.f)!) {
            const cle = `${b.owner} sur ${a.owner}`;
            fautes.set(cle, (fautes.get(cle) ?? 0) + 1);
          }
        }
      }
    }
    const total = [...fautes.values()].reduce((s, n) => s + n, 0);
    expect(
      `${total} recouvrement(s)${
        total ? ' — ' + [...fautes.keys()].slice(0, 6).join(', ') : ''
      }`,
    ).toBe('0 recouvrement(s)');
  });
});

/**
 * ET SES ARÊTES NE TRAVERSENT PAS.
 *
 * Relevé du chantier : « les meubles sont toujours transparents ». Ce n'était
 * pas une opacité — aucune face de meuble n'en porte — mais SES ARÊTES : les
 * trois quarts des faces d'un meuble sont des traits, quatre-vingt-huit pour
 * un lit. Un trait n'a pas de surface : le tri à l'écran ne peut rien en
 * dire, et ceux du dos passaient par-dessus l'avant. On croit alors voir au
 * travers.
 *
 * Chaque arête suit désormais SON pan. Le banc le vérifie comme l'œil : au
 * milieu d'une arête, si un aplat du même meuble est DEVANT elle, il doit
 * être peint après — sinon l'arête se voit par-dessus.
 */
describe('les arêtes d’un meuble', () => {
  it('ne se voient pas au travers de ses pans', () => {
    const { faces, rooms } = buildScene(SALON.walls, [], SALON.objects, {
      palette: PAL,
      showSurfaces: true,
      rooms: SALON.rooms,
      fixtures: SALON.fixtures,
    });
    const centre = sceneFraming(faces).center;
    let fautes = 0;
    for (const cam of ANGLES) {
      const project = projecteur(cam, centre, 60);
      const rangs = roomRanks(rooms, cam);
      const vues = faces
        .filter((f) => !isHiddenFace(f, cam) && f.ownerId)
        .map((f) => ({
          f,
          proj: f.pts.map(project),
          depth: faceDepth(f, project, cam, rangs),
          owner: f.ownerId,
          room: f.roomId,
          pan: f.panId,
          bord: f.bordDe,
        }));
      ajusterBlocs(vues);
      const peintes = [...vues].sort((a, b) => a.depth - b.depth);
      const rang = new Map(peintes.map((p, i) => [p.f, i] as [Face3D, number]));
      const aplats = vues.filter((v) => v.f.fill !== null && v.proj.length >= 3);
      for (const t of vues) {
        if (t.f.fill !== null || t.proj.length !== 2) continue;
        const pt = {
          sx: (t.proj[0].sx + t.proj[1].sx) / 2,
          sy: (t.proj[0].sy + t.proj[1].sy) / 2,
        };
        const dt = (t.proj[0].depth + t.proj[1].depth) / 2;
        for (const a of aplats) {
          if (!dansLePolygone(pt, a.proj)) continue;
          const da = profondeurAu(a.f, pt, project);
          if (da === null) continue;
          // L'aplat est DEVANT le trait : il doit le couvrir, donc être
          // peint après. Deux centimètres de tolérance : une arête borde
          // son propre pan, ils sont coplanaires.
          if (da > dt + 0.02 && rang.get(a.f)! < rang.get(t.f)!) fautes++;
        }
      }
    }
    expect(`${fautes} arête(s) au travers`).toBe('0 arête(s) au travers');
  });
});

/**
 * LES ARÊTES D'UNE OUVERTURE NE S'EFFACENT PAS.
 *
 * Relevé du chantier, capture à l'appui : « regarde l'ouverture, toutes les
 * arêtes ne sont pas tracées ». Un mur percé d'une fenêtre est bâti en
 * morceaux — deux trumeaux, un linteau, une allège, les tableaux — et le pan
 * de l'un passait par-dessus l'arête de l'autre : le trait disparaît, et
 * l'ouverture perd un côté.
 *
 * Le banc juge comme l'œil : au milieu d'un trait, un aplat SITUÉ DERRIÈRE ne
 * doit jamais être peint après lui.
 */
describe('les arêtes du bâti', () => {
  const PERCEE = {
    walls: [
      mur('n', 0, 0, 4, 0),
      mur('e', 4, 0, 4, 3),
      mur('s', 4, 3, 0, 3),
      mur('o', 0, 3, 0, 0),
    ],
    // Une fenêtre au milieu du mur nord, une porte à l'ouest.
    openings: [
      {
        id: 'fen',
        type: 'window' as const,
        a: { x: 1.2, z: 0 },
        b: { x: 2.8, z: 0 },
        height: 1.2,
        yCenter: 1.5,
      },
      {
        id: 'porte',
        type: 'door' as const,
        a: { x: 0, z: 1 },
        b: { x: 0, z: 1.9 },
        height: 2.05,
        yCenter: 1.025,
      },
    ] as WallSeg[],
  };

  it('ne laisse aucun pan effacer un trait qui est devant', () => {
    const { faces, rooms } = buildScene(PERCEE.walls, PERCEE.openings, [], {
      palette: PAL,
      showSurfaces: true,
      rooms: [{ id: 'r1' }],
    });
    const centre = sceneFraming(faces).center;
    let fautes = 0;
    for (const cam of ANGLES) {
      const project = projecteur(cam, centre, 60);
      const rangs = roomRanks(rooms, cam);
      const vues = faces
        .filter((f) => !isHiddenFace(f, cam))
        .map((f) => ({
          f,
          proj: f.pts.map(project),
          depth: faceDepth(f, project, cam, rangs),
          owner: f.ownerId,
          room: f.roomId,
          pan: f.panId,
          bord: f.bordDe,
        }));
      ajusterBlocs(vues);
      const peintes = [...vues].sort((a, b) => a.depth - b.depth);
      const rang = new Map(peintes.map((p, i) => [p.f, i] as [Face3D, number]));
      const aplats = vues.filter((v) => v.f.fill !== null && v.proj.length >= 3);
      for (const t of vues) {
        if (t.f.fill !== null || t.proj.length !== 2) continue;
        const pt = {
          sx: (t.proj[0].sx + t.proj[1].sx) / 2,
          sy: (t.proj[0].sy + t.proj[1].sy) / 2,
        };
        const dt = (t.proj[0].depth + t.proj[1].depth) / 2;
        for (const a of aplats) {
          // Un mur vu de DEHORS couvre la pièce : c'est voulu, et c'est
          // réglé par les calques, pas ici.
          if (Math.floor(a.depth / 1e4) !== Math.floor(t.depth / 1e4)) continue;
          if (!dansLePolygone(pt, a.proj)) continue;
          const da = profondeurAu(a.f, pt, project);
          if (da === null) continue;
          if (da < dt - 0.02 && rang.get(a.f)! > rang.get(t.f)!) fautes++;
        }
      }
    }
    expect(`${fautes} arête(s) effacée(s)`).toBe('0 arête(s) effacée(s)');
  });
});
