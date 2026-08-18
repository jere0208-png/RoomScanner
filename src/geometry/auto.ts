/**
 * NORMES AUTO — l'installation qui se pose toute seule, aux normes.
 *
 * Relevé du chantier : « construis l'ensemble de notre scan avec des prises,
 * RJ, etc. pour que tout soit aux normes, avec un système intelligent qui
 * détecte chambres, garage, cuisine, salon… et place tout en dehors des
 * meubles ; si des éléments existent, compléter ; si tout est aux normes, le
 * dire ».
 *
 * Ce module ne réinvente aucune règle : il s'appuie sur `requirementFor`, qui
 * porte déjà les minima de la NF C 15-100 amendée A5, et sur la détection
 * d'usage tirée du mobilier (`roomKindFromObjects` → `roomUse`). Ce qu'il
 * ajoute, c'est le GESTE de l'électricien : où poser ce qui manque.
 *
 * Trois principes, dans cet ordre :
 *
 *   1. ON COMPLÈTE, ON NE REFAIT PAS. Ce qui est déjà posé compte ; on ne
 *      touche à rien de ce que l'électricien a placé lui-même.
 *   2. ON POSE OÙ L'ON POSERAIT. Jamais derrière un meuble, jamais dans une
 *      menuiserie, jamais à moins de trente centimètres d'un appareil
 *      existant ni de vingt d'un angle — et l'on répartit sur les murs les
 *      plus longs, ceux qui restent accessibles.
 *   3. ON DIT CE QU'ON A FAIT. Le rapport nomme chaque pose, pièce par pièce,
 *      et se tait pour dire que tout était déjà conforme.
 */
import type { Fixture, FixtureKind } from './electrical';
import type { CeilingFixture } from './ceiling';
import type { Pt, WallSeg } from './floorplan';
import { segLength, perpOf } from './floorplan';
import { requirementFor, roomUse, USE_LABEL, type RoomInput } from './nfc15100';
import type { RoomKind } from './furniture';

/** Hauteurs d'axe, en mètres — celles qu'on relève sur un chantier. */
const H_PRISE = 0.25;
const H_RJ = 0.25;
const H_INTER = 1.1;
/** Écart minimal à un angle, à une menuiserie, à un appareil déjà posé. */
const BORD = 0.2;
const ECART = 0.3;

export interface PoseAuto {
  fixtures: Fixture[];
  ceiling: CeilingFixture[];
  /** Ce qu'on a posé, pièce par pièce, en clair. */
  rapport: string[];
  /** Rien à faire : tout était déjà conforme. */
  conforme: boolean;
}

interface MurLibre {
  wall: WallSeg;
  len: number;
  /** Les intervalles où l'on peut poser, en mètres depuis l'extrémité `a`. */
  libres: [number, number][];
  side: 1 | -1;
}

/** Retire un intervalle occupé d'une liste d'intervalles libres. */
function retirer(libres: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [x0, x1] of libres) {
    if (b <= x0 || a >= x1) {
      out.push([x0, x1]);
      continue;
    }
    if (a > x0) out.push([x0, Math.min(a, x1)]);
    if (b < x1) out.push([Math.max(b, x0), x1]);
  }
  return out.filter(([x0, x1]) => x1 - x0 > 0.12);
}

/**
 * LES PLACES LIBRES D'UNE PIÈCE.
 *
 * Un mur n'est pas disponible sur toute sa longueur : ses angles ne se
 * câblent pas, ses menuiseries non plus, et ce qui est derrière un meuble ne
 * sert à personne — c'est même le premier reproche qu'on fait à une
 * installation posée au cordeau.
 */
export function placesLibres(
  murs: WallSeg[],
  openings: WallSeg[],
  objets: { width: number; depth: number; height: number; transform: number[] }[],
  fixtures: Fixture[],
  interieur: Pt,
): MurLibre[] {
  return murs
    .map((wall) => {
      const len = segLength(wall);
      if (len < 0.6) return null;
      const u = { x: (wall.b.x - wall.a.x) / len, z: (wall.b.z - wall.a.z) / len };
      const n = perpOf(u);
      const mid = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
      // La face qui regarde la pièce : c'est celle qu'on équipe.
      const side: 1 | -1 =
        (interieur.x - mid.x) * n.x + (interieur.z - mid.z) * n.z >= 0 ? 1 : -1;
      let libres: [number, number][] = [[BORD, len - BORD]];
      // Les menuiseries de ce mur : on ne pose pas dans un tableau.
      for (const o of openings) {
        const proj = (p: Pt) => (p.x - wall.a.x) * u.x + (p.z - wall.a.z) * u.z;
        const perp = (p: Pt) => Math.abs((p.x - wall.a.x) * n.x + (p.z - wall.a.z) * n.z);
        if (perp(o.a) > 0.25 || perp(o.b) > 0.25) continue;
        const t0 = Math.min(proj(o.a), proj(o.b));
        const t1 = Math.max(proj(o.a), proj(o.b));
        libres = retirer(libres, t0 - 0.1, t1 + 0.1);
      }
      // Le mobilier plaqué : sa projection sur le mur, plus un doigt de jeu.
      for (const o of objets) {
        const cx = o.transform[12];
        const cz = o.transform[14];
        const yaw = Math.atan2(o.transform[2], o.transform[0]);
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const demiN =
          Math.abs(cos * n.x + sin * n.z) * (o.width / 2) +
          Math.abs(-sin * n.x + cos * n.z) * (o.depth / 2);
        const d = Math.abs((cx - wall.a.x) * n.x + (cz - wall.a.z) * n.z);
        /*
          Trop loin du mur pour le masquer, ou trop bas pour gêner une prise.

          Soixante centimètres : c'est le passage qu'il faut pour atteindre une
          prise derrière un meuble. En deçà, elle est perdue — et une prise
          perdue ne compte pas, même si la norme la voit.
        */
        if (d - demiN > 0.6 || o.transform[13] + o.height / 2 < H_PRISE) continue;
        const demiU =
          Math.abs(cos * u.x + sin * u.z) * (o.width / 2) +
          Math.abs(-sin * u.x + cos * u.z) * (o.depth / 2);
        const t = (cx - wall.a.x) * u.x + (cz - wall.a.z) * u.z;
        libres = retirer(libres, t - demiU - 0.05, t + demiU + 0.05);
      }
      // Et ce qui est déjà posé sur ce mur.
      for (const f of fixtures) {
        if (f.wallId !== wall.id) continue;
        libres = retirer(libres, f.along - ECART, f.along + ECART);
      }
      return { wall, len, libres, side };
    })
    .filter((m): m is MurLibre => !!m && m.libres.length > 0)
    .sort((a, b) => {
      const dispo = (m: MurLibre) => m.libres.reduce((t, [x0, x1]) => t + (x1 - x0), 0);
      return dispo(b) - dispo(a);
    });
}

/** Prend une place sur le mur le plus dégagé, et la retire du stock. */
function prendre(places: MurLibre[]): { wall: WallSeg; along: number; side: 1 | -1 } | null {
  for (const m of places) {
    // Le plus grand intervalle de ce mur, et son milieu.
    let meilleur: [number, number] | null = null;
    for (const seg of m.libres) {
      if (!meilleur || seg[1] - seg[0] > meilleur[1] - meilleur[0]) meilleur = seg;
    }
    if (!meilleur || meilleur[1] - meilleur[0] < 0.12) continue;
    const along = (meilleur[0] + meilleur[1]) / 2;
    m.libres = retirer(m.libres, along - ECART, along + ECART);
    // Le mur qui vient de servir passe en fin de file : on répartit.
    places.push(places.splice(places.indexOf(m), 1)[0]);
    return { wall: m.wall, along, side: m.side };
  }
  return null;
}

/**
 * POSE TOUT CE QUI MANQUE, PIÈCE PAR PIÈCE.
 *
 * Retourne les appareils À AJOUTER — jamais la liste complète : ce qui est
 * déjà posé n'est pas touché, et l'électricien reste maître de son travail.
 */
export function poserAuxNormes(input: {
  rooms: (RoomInput & { kind?: RoomKind | null; interieur: Pt })[];
  walls: WallSeg[];
  openings: WallSeg[];
  objects: { width: number; depth: number; height: number; transform: number[]; roomId?: string }[];
  fixtures: Fixture[];
  ceiling: CeilingFixture[];
  /** Où tombe chaque appareil : `fixturePlacement` le sait déjà. */
  placement: Map<string, string | null>;
  /** Fabrique un identifiant : le store a le sien. */
  id: (prefixe: string) => string;
}): PoseAuto {
  const fixtures: Fixture[] = [];
  const ceiling: CeilingFixture[] = [];
  const rapport: string[] = [];

  for (const room of input.rooms) {
    const use = roomUse(room.name, room.kind);
    const besoin = requirementFor(use, room.area);
    const dedans = input.fixtures.filter(
      (f) => input.placement.get(f.id) === room.id,
    );
    const compte = (k: FixtureKind) => dedans.filter((f) => f.kind === k).length;
    const murs = input.walls.filter((w) => room.wallIds.includes(w.id));
    if (murs.length === 0) continue;
    const objets = input.objects.filter((o) => !o.roomId || o.roomId === room.id);
    const places = placesLibres(
      murs,
      input.openings,
      objets,
      input.fixtures,
      room.interieur,
    );
    const pose: string[] = [];

    /** Pose `n` appareils d'une nature, et dit combien ont trouvé leur place. */
    const poser = (kind: FixtureKind, n: number, height: number) => {
      let fait = 0;
      for (let i = 0; i < n; i++) {
        const place = prendre(places);
        if (!place) break;
        fixtures.push({
          id: input.id(kind),
          kind,
          wallId: place.wall.id,
          along: place.along,
          height,
          side: place.side,
        });
        fait++;
      }
      return fait;
    };

    const manqueSocles = Math.max(0, besoin.socles - compte('prise'));
    if (manqueSocles > 0) {
      const fait = poser('prise', manqueSocles, H_PRISE);
      if (fait > 0) pose.push(`${fait} socle${fait > 1 ? 's' : ''} 16 A`);
      if (fait < manqueSocles) {
        pose.push(`${manqueSocles - fait} socle(s) sans place libre`);
      }
    }
    const manqueRj = Math.max(0, besoin.rj45 - compte('rj45'));
    if (manqueRj > 0 && poser('rj45', manqueRj, H_RJ) > 0) {
      pose.push(`${manqueRj} prise${manqueRj > 1 ? 's' : ''} RJ45`);
    }
    // Une commande d'éclairage par pièce : sans elle, le point lumineux ne
    // s'allume pas, et c'est le premier réflexe d'un contrôle.
    if (compte('inter') + compte('va') === 0 && poser('inter', 1, H_INTER) > 0) {
      pose.push('1 interrupteur');
    }
    // Un point lumineux au centre, s'il n'y en a aucun.
    const dejaLumiere = input.ceiling.some((c) => c.roomId === room.id);
    if (!dejaLumiere) {
      ceiling.push({
        id: input.id('dcl'),
        kind: 'dcl',
        roomId: room.id,
        at: { ...room.interieur },
      });
      pose.push('1 point lumineux');
    }
    if (pose.length > 0) {
      rapport.push(`${room.name || USE_LABEL[use]} : ${pose.join(', ')}`);
    }
  }

  return {
    fixtures,
    ceiling,
    rapport,
    conforme: fixtures.length === 0 && ceiling.length === 0,
  };
}
