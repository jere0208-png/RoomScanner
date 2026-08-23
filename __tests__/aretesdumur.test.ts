/**
 * LES ARETES DU MUR NE DISPARAISSENT PAS QUAND ON LACHE.
 *
 * Releve du patron, capture a l'appui : « sur le 3D en tournant on voit les
 * aretes des murs plus foncees, mais au relachement des aretes
 * disparaissent… alors que si j'appuie seulement, tout apparait ». Trois
 * etats du meme modele, deux dessins differents : le doigt pose montrait le
 * volume complet, le doigt leve en perdait des traits.
 *
 * LA VUE CHANGEAIT DE REGLE EN COURS DE ROUTE. Sous le doigt, chaque arete
 * suit SON pan : elle se peint juste apres lui, et rien ne peut se glisser
 * entre les deux. Au repos, elle entrait dans le classement avec ses propres
 * contraintes, et le lien qui la rattache a son pan n'etait qu'une fleche de
 * plus dans le graphe. Or ce graphe contient des RONDES — trois faces qui se
 * recouvrent en cercle, A devant B, B devant C, C devant A : aucun ordre ne
 * les satisfait toutes, il faut trancher. Et le denouement posait parfois
 * l'arete AVANT son pan, qui la repeignait aussitot.
 *
 * Mesure sur quatre-vingt-dix angles : deux cent dix-sept aretes posees
 * avant leur pan au repos, zero sous le doigt.
 *
 * La regle est donc la meme dans les deux etats, et c'est celle qui tenait
 * deja : l'arete recolle a son pan. Elle ne coute rien a l'ordre des PANS —
 * le pas d'un rang vaut deux fois l'ecart qu'on ajoute, donc un pan qui
 * passe apres le notre passe encore apres son arete.
 */
import {
  ajusterBlocs,
  buildScene,
  faceDepth,
  isHiddenFace,
  masquesDeScene,
  roomRanks,
  sceneFraming,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

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

/**
 * L'APPARTEMENT DE REFERENCE, celui des planches : des murs perces, donc
 * batis en morceaux — trumeaux, linteaux, alleges. C'est la que les aretes
 * se perdent, pas sur une boite a quatre murs pleins.
 */
const { faces, rooms } = buildScene(
  SNAPSHOT_WALLS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_OBJECTS,
  { palette: PAL, showSurfaces: true, rooms: SNAPSHOT_ROOMS },
);
const centre = sceneFraming(faces).center;
const MASQUES = masquesDeScene(faces);
const rad = (d: number) => (d * Math.PI) / 180;

/** Les faces vues sous cet angle, classees comme la vue les classe. */
const dessin = (theta: number, sousLeDoigt: boolean) => {
  const cam = {
    ct: Math.cos(rad(theta)),
    st: Math.sin(rad(theta)),
    cp: Math.cos(rad(58)),
    sp: Math.sin(rad(58)),
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
      cache: (() => {
        if (f.panId === undefined) return undefined;
        const m = MASQUES.get(f.panId);
        if (!m) return undefined;
        const vers =
          m.n.x * cam.st * cam.sp + m.n.y * cam.cp + m.n.z * cam.ct * cam.sp;
        return vers > 0 ? m.cache : undefined;
      })(),
    }));
  ajusterBlocs(vues, false);
  if (sousLeDoigt) {
    // Ce que fait la vue tant que le doigt est pose : chaque arete reprend
    // la profondeur de SON pan, sans reclassement.
    const table = new Map<number, number>();
    for (const v of vues) if (v.pan !== undefined) table.set(v.pan, v.depth);
    for (const v of vues) {
      if (v.bord === undefined) continue;
      const d = table.get(v.bord);
      if (d !== undefined) v.depth = d + 1e-6;
    }
  }
  return vues;
};

/** Combien d'aretes se peignent AVANT leur propre pan — donc s'effacent. */
const aretesEffacees = (sousLeDoigt: boolean) => {
  let total = 0;
  for (let theta = 0; theta < 360; theta += 4) {
    const vues = dessin(theta, sousLeDoigt);
    const table = new Map<number, number>();
    for (const v of vues) if (v.pan !== undefined) table.set(v.pan, v.depth);
    for (const v of vues) {
      if (v.bord === undefined) continue;
      const d = table.get(v.bord);
      if (d !== undefined && v.depth < d) total += 1;
    }
  }
  return total;
};

describe('une arete se peint toujours apres son pan', () => {
  it('au repos, doigt leve', () => {
    expect(aretesEffacees(false)).toBe(0);
  });

  it('et sous le doigt, comme avant', () => {
    expect(aretesEffacees(true)).toBe(0);
  });

  /**
   * ET LE DESSIN NE CHANGE PAS QUAND ON LACHE.
   *
   * C'est le defaut tel qu'il se voit : le modele se redessine autrement au
   * relachement. A angle egal, les deux etats doivent donner le MEME ordre
   * de peinture — c'est plus fort que de compter les fautes, et c'est ce que
   * l'oeil verifie.
   */
  it('donne le meme ordre de peinture, doigt pose ou leve', () => {
    for (const theta of [0, 35, 90, 137, 214, 300]) {
      const ordre = (sousLeDoigt: boolean) =>
        dessin(theta, sousLeDoigt)
          .map((v, i) => ({ i, d: v.depth }))
          .sort((a, b) => a.d - b.d || a.i - b.i)
          .map((v) => v.i);
      expect(ordre(false)).toEqual(ordre(true));
    }
  });
});
