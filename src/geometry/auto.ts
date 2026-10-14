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
import { COMMANDES_MURALES, FIXTURES, socketsOf, type Fixture, type FixtureKind } from './electrical';
import type { CeilingFixture } from './ceiling';
import type { Pt, WallSeg } from './floorplan';
import { pointOnSeg, segLength, perpOf, solDesMurs } from './floorplan';
import { volumeAt, volumeVerdict, wetZones } from './volumes';
import {
  estCuisine,
  requirementFor,
  roomUse,
  socleFaceAuPlan,
  USE_LABEL,
  worktopsOnWall,
  type ElecFix,
  type RoomInput,
  type Worktop,
} from './nfc15100';
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
  objets: { width: number; depth: number; height: number; transform: number[]; category?: string }[],
  fixtures: Fixture[],
  interieur: Pt,
  /** La hauteur d'axe de ce qu'on pose : un meuble bas ne cache pas une prise haute. */
  hauteur = H_PRISE,
  /**
   * LE SOL DU RELEVÉ — revues « Gérard » et « Thomas » : la hauteur d'un
   * meuble se comparait à celle d'une prise sans retirer le sol du scan
   * (−1,30 m) ; tout meuble de moins de 1,55 m passait pour « trop bas
   * pour gêner », et neuf socles tombaient derrière le lit, le four, le
   * lave-linge. Sans sol donné, celui des murs.
   */
  sol = solDesMurs(murs),
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
        if (d - demiN > 0.6) continue;
        // Ce qui couvre la hauteur de pose cache la place ; au-dessus des
        // feux et de l'évier, on ne pose jamais, à aucune hauteur.
        const bas = o.transform[13] - o.height / 2 - sol;
        const haut = bas + o.height;
        const interdit = /stove|cooktop|sink/i.test(o.category ?? '');
        if (!interdit && (haut < hauteur - 0.05 || bas > hauteur + 0.05)) continue;
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

/** Les plans de travail que longe ce mur, côté pièce, en abscisse depuis `a`. */
function plansDuMur(
  wall: WallSeg,
  interieur: Pt,
  objets: Parameters<typeof worktopsOnWall>[1],
  cuisine: boolean,
  sol: number,
): Worktop[] {
  const len = segLength(wall);
  if (len < 0.3) return [];
  const u = { x: (wall.b.x - wall.a.x) / len, z: (wall.b.z - wall.a.z) / len };
  const n = perpOf(u);
  const mid = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
  const side = (interieur.x - mid.x) * n.x + (interieur.z - mid.z) * n.z >= 0 ? 1 : -1;
  return worktopsOnWall(
    { A: wall.a, ux: u.x, uz: u.z, nx: n.x * side, nz: n.z * side, len },
    objets,
    cuisine,
    sol,
  );
}

/** Ne garde, des places libres, que celles au droit d'un plan libre (ni feux, ni évier). */
function auDroitDesPlans(places: MurLibre[], plans: Map<string, Worktop[]>): MurLibre[] {
  const out: MurLibre[] = [];
  for (const m of places) {
    const p = plans.get(m.wall.id) ?? [];
    let dessus: [number, number][] = [];
    for (const w of p) if (!w.nature) dessus.push([w.from + 0.1, w.to - 0.1]);
    for (const w of p) if (w.nature) dessus = retirer(dessus, w.from - 0.05, w.to + 0.05);
    const libres: [number, number][] = [];
    for (const [a, b] of m.libres) {
      for (const [c, d] of dessus) {
        const x0 = Math.max(a, c);
        const x1 = Math.min(b, d);
        if (x1 - x0 > 0.12) libres.push([x0, x1]);
      }
    }
    if (libres.length > 0) out.push({ ...m, libres });
  }
  return out;
}

/** L'emprise d'un meuble le long d'un mur : abscisses depuis `a`, et sa distance. */
function emprise(
  o: { width: number; depth: number; transform: number[] },
  wall: WallSeg,
): { t0: number; t1: number; ecart: number } {
  const len = segLength(wall) || 1;
  const u = { x: (wall.b.x - wall.a.x) / len, z: (wall.b.z - wall.a.z) / len };
  const n = perpOf(u);
  const yaw = Math.atan2(o.transform[2], o.transform[0]);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const demiU = Math.abs(cos * u.x + sin * u.z) * (o.width / 2) + Math.abs(-sin * u.x + cos * u.z) * (o.depth / 2);
  const demiN = Math.abs(cos * n.x + sin * n.z) * (o.width / 2) + Math.abs(-sin * n.x + cos * n.z) * (o.depth / 2);
  const cx = o.transform[12];
  const cz = o.transform[14];
  const t = (cx - wall.a.x) * u.x + (cz - wall.a.z) * u.z;
  const d = Math.abs((cx - wall.a.x) * n.x + (cz - wall.a.z) * n.z);
  return { t0: t - demiU, t1: t + demiU, ecart: d - demiN };
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
  objects: { width: number; depth: number; height: number; transform: number[]; roomId?: string; category?: string }[];
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
  const sol = solDesMurs(input.walls);

  for (const room of input.rooms) {
    const use = roomUse(room.name, room.kind);
    const besoin = requirementFor(use, room.area);
    const dedans = input.fixtures.filter(
      (f) => input.placement.get(f.id) === room.id,
    );
    const compte = (k: FixtureKind) => dedans.filter((f) => f.kind === k).length;
    /*
      LES SOCLES, PAS LES PRISES SIMPLES — revue « Mehdi » : un séjour à
      12 socles sur 12 (en doubles et triples) recevait 4 prises de plus,
      chaque chambre à 3 sur 3 une de plus. On compte comme le contrôle
      (`socketsOf`), sans les prises d'appareil (hotte, réfrigérateur).
    */
    const socles = dedans.reduce((n, f) => n + (f.usage ? 0 : socketsOf(f.kind)), 0);
    /*
      TOUTE COMMANDE COMPTE — double, variateur, interrupteur général,
      poussoir — et le détecteur de présence au plafond en est une : le WC
      qui en avait un recevait un interrupteur.
    */
    const commandes =
      dedans.filter((f) => COMMANDES_MURALES.includes(f.kind)).length +
      input.ceiling.filter((c) => c.roomId === room.id && c.kind === 'detecteur').length;
    const murs = input.walls.filter((w) => room.wallIds.includes(w.id));
    if (murs.length === 0) continue;
    const objets = input.objects.filter((o) => !o.roomId || o.roomId === room.id);
    // Les places libres, hauteur par hauteur : un plan de travail cache une
    // prise à 25 cm, pas une prise à 1,10 m.
    const placesA = new Map<number, MurLibre[]>();
    const placesPour = (h: number) => {
      let p = placesA.get(h);
      if (!p) {
        p = placesLibres(murs, input.openings, objets, input.fixtures, room.interieur, h, sol);
        placesA.set(h, p);
      }
      return p;
    };
    /*
      LES VOLUMES DE LA SALLE D'EAU — revue « Thomas » : « Normes auto »
      posait un socle à 11 cm de la baignoire, en volume 2, que son propre
      contrôle classait « interdit ». Une place qui tombe dans un volume où
      l'appareil est interdit se refuse, et l'on prend la suivante.
    */
    const zones = wetZones(objets as never, sol);
    const permis = (kind: FixtureKind, wall: WallSeg, along: number, side: 1 | -1, height: number) => {
      if (zones.length === 0) return true;
      const L = segLength(wall) || 1;
      const u = { x: (wall.b.x - wall.a.x) / L, z: (wall.b.z - wall.a.z) / L };
      const nrm = perpOf(u);
      const p = {
        x: wall.a.x + u.x * along + nrm.x * side * 0.05,
        z: wall.a.z + u.z * along + nrm.z * side * 0.05,
      };
      const v = volumeAt(p, height, zones);
      return v === null || volumeVerdict(kind, v).allowed;
    };
    const pose: string[] = [];

    /** Pose `n` appareils d'une nature, et dit combien ont trouvé leur place. */
    const poser = (kind: FixtureKind, n: number, height: number, places = placesPour(height)) => {
      let fait = 0;
      for (let i = 0, essais = 0; i < n && essais < n * 8; essais++) {
        const place = prendre(places);
        if (!place) break;
        if (!permis(kind, place.wall, place.along, place.side, height)) continue;
        // Jamais sur un mur plus bas que la pose (revue « Nadia » : la jambette).
        if (place.wall.height < height + 0.1) continue;
        i++;
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

    const cuisine = estCuisine(room.name, room.kind);
    const plans = new Map<string, Worktop[]>();
    if (cuisine) {
      for (const w of murs) {
        const p = plansDuMur(w, room.interieur, objets, true, sol);
        if (p.length > 0) plans.set(w.id, p);
      }
    }
    const planConnu = [...plans.values()].some((p) => p.some((w) => !w.nature));

    const manqueSocles = Math.max(0, besoin.socles - socles);
    if (manqueSocles > 0) {
      /*
        LES SOCLES DE LA CUISINE, D'ABORD AU-DESSUS DU PLAN — revue
        « Gérard » : six socles posés à 25 cm, puis le contrôle en
        réclamait quatre au-dessus du plan de travail, et en ajoutait quatre
        de plus — dix au lieu de six. Les quatre du plan se posent à 1,10 m,
        les autres en bas.
      */
      /*
        AU DROIT DU PLAN RELEVÉ — revue « Nadia » : les quatre « prises plan
        de travail » tombaient sur les murs nus, aucune sur le mur de l'évier.
        Quand la pièce a des plans relevés, elles se posent au-dessus d'eux
        (20 cm plus haut que le dessus), jamais au droit des feux ni de
        l'évier ; sans plan relevé, à 1,10 m comme avant.
      */
      const hauts = dedans.reduce((t, f) => {
        if (f.usage || socketsOf(f.kind) === 0) return t;
        const p = plans.get(f.wallId);
        const ok = planConnu ? !!p && socleFaceAuPlan(f.along, f.height, p) === 'plan' : f.height >= 0.9;
        return t + (ok ? socketsOf(f.kind) : 0);
      }, 0);
      const surPlan = Math.min(manqueSocles, Math.max(0, besoin.surPlan - hauts));
      const hPlan = planConnu
        ? Math.round((Math.max(...[...plans.values()].flat().filter((w) => !w.nature).map((w) => w.height), 0.9) + 0.2) * 100) / 100
        : 1.1;
      const faitHaut =
        surPlan > 0 ? poser('prise', surPlan, hPlan, planConnu ? auDroitDesPlans(placesPour(hPlan), plans) : placesPour(hPlan)) : 0;
      const fait = faitHaut + poser('prise', manqueSocles - faitHaut, H_PRISE);
      if (fait > 0) {
        pose.push(
          `${fait} socle${fait > 1 ? 's' : ''} 16 A${faitHaut > 0 ? ` dont ${faitHaut} au-dessus du plan` : ''}`,
        );
      }
      if (fait < manqueSocles) {
        const rate = manqueSocles - fait;
        pose.push(`${rate} socle${rate > 1 ? 's' : ''} sans place libre`);
      }
    }
    /*
      LE RÉFRIGÉRATEUR A SA PRISE — revue « Nadia ». Une prise dédiée (FRI),
      À CÔTÉ de lui et pas derrière une colonne de 1,80 m : on doit pouvoir
      le débrancher. Elle ne compte pas parmi les socles de la pièce.
    */
    if (cuisine) {
      for (const frigo of objets.filter((o) => /refrigerator/i.test(o.category ?? ''))) {
        const c = { x: frigo.transform[12], z: frigo.transform[14] };
        const dejaServi = [...dedans, ...fixtures].some((f) => {
          if (f.usage !== 'FRI') return false;
          const w = murs.find((m) => m.id === f.wallId);
          if (!w) return false;
          const L = segLength(w) || 1;
          const p = { x: w.a.x + ((w.b.x - w.a.x) * f.along) / L, z: w.a.z + ((w.b.z - w.a.z) * f.along) / L };
          return Math.hypot(p.x - c.x, p.z - c.z) < Math.max(frigo.width, frigo.depth) + 0.6;
        });
        if (dejaServi) continue;
        const places = placesPour(1.1);
        let pose1: { m: MurLibre; along: number } | null = null;
        for (const m of [...places].sort((a, b) => pointOnSeg(c, a.wall.a, a.wall.b).dist - pointOnSeg(c, b.wall.a, b.wall.b).dist)) {
          const e = emprise(frigo, m.wall);
          if (e.ecart > 0.4) continue;
          for (const along of [e.t1 + 0.15, e.t0 - 0.15]) {
            if (m.libres.some(([x0, x1]) => along >= x0 && along <= x1) && permis('prise', m.wall, along, m.side, 1.1)) {
              pose1 = { m, along };
              break;
            }
          }
          if (pose1) break;
        }
        if (!pose1) {
          pose.push('réfrigérateur : prise à placer sur place');
          continue;
        }
        pose1.m.libres = retirer(pose1.m.libres, pose1.along - ECART, pose1.along + ECART);
        fixtures.push({
          id: input.id('prise'),
          kind: 'prise',
          wallId: pose1.m.wall.id,
          along: pose1.along,
          height: 1.1,
          side: pose1.m.side,
          usage: 'FRI',
        });
        pose.push('1 prise réfrigérateur (circuit ou différentiel à part conseillé)');
      }
    }

    const manqueRj = Math.max(0, besoin.rj45 - compte('rj45'));
    if (manqueRj > 0) {
      // Le rapport annonce ce qui a ÉTÉ posé, pas ce qui manquait : une
      // RJ45 sur deux trouvée, le texte disait quand même « 2 prises ».
      const faitRj = poser('rj45', manqueRj, H_RJ);
      if (faitRj > 0) {
        pose.push(`${faitRj} prise${faitRj > 1 ? 's' : ''} RJ45`);
      }
    }
    // Une commande d'éclairage par pièce : sans elle, le point lumineux ne
    // s'allume pas, et c'est le premier réflexe d'un contrôle.
    const avantInter = fixtures.length;
    if (commandes === 0 && poser('inter', 1, H_INTER) > 0) {
      pose.push('1 interrupteur');
    }
    // Un point lumineux au centre, s'il n'y en a aucun.
    const dejaLumiere = input.ceiling.some((c) => c.roomId === room.id);
    if (!dejaLumiere) {
      /*
        RELIÉ À SA COMMANDE — revue « Nadia » : les points posés ici ne
        l'étaient à aucun interrupteur ; le schéma passait alors le circuit
        en va-et-vient, et le devis portait 89 m de navette pour sept
        interrupteurs simples. Le point se relie à la seule commande murale
        de la pièce, posée à l'instant ou déjà là.
      */
      const commandesIci = [
        ...dedans.filter((f) => COMMANDES_MURALES.includes(f.kind)),
        ...fixtures.slice(avantInter).filter((f) => COMMANDES_MURALES.includes(f.kind)),
      ];
      ceiling.push({
        id: input.id('dcl'),
        kind: 'dcl',
        roomId: room.id,
        at: { ...room.interieur },
        ...(commandesIci.length === 1 ? { commands: [commandesIci[0].id] } : {}),
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

/** Le plan tel qu'il est à l'écran : ce qu'il faut pour poser UNE fois. */
export interface ContexteCorrection {
  rooms: (RoomInput & { kind?: RoomKind | null; interieur: Pt })[];
  walls: WallSeg[];
  openings: WallSeg[];
  objects: {
    width: number;
    depth: number;
    height: number;
    transform: number[];
    roomId?: string;
    category?: string;
  }[];
  fixtures: Fixture[];
  id: (prefixe: string) => string;
}

/**
 * CORRIGE UN CONSTAT — un seul, celui que le doigt vient de désigner.
 *
 * « Normes auto » refait tout le logement d'un coup ; ici on guide : le
 * contrôle liste ce qui manque, et chaque ligne se règle d'un appui. Même
 * règles de pose que l'auto — hors meubles, hors menuiseries, loin des
 * angles — mais UNE pose à la fois, pour que l'électricien voie ce qui
 * vient d'arriver sur son plan.
 *
 * Retourne ce qu'il faut AJOUTER, ou `null` quand aucun mur n'offre de
 * place : mentir en posant dans un angle serait pire que d'avouer.
 */
export function corrigerConstat(
  fix: ElecFix,
  roomId: string | undefined,
  ctx: ContexteCorrection,
): { fixtures: Fixture[]; ceiling: CeilingFixture[] } | null {
  /*
    Deux gestes ne POSENT rien : la remise à hauteur d'un appareil et la
    remontée d'un linteau. Ils se règlent sur l'élément lui-même, et c'est
    l'écran qui les porte — lui seul tient le magasin.
  */
  if (fix.type === 'hauteur' || fix.type === 'linteau') return null;

  if (fix.type === 'plafond') {
    /*
      Où poser ce qui va au plafond ? Dans la pièce du constat quand il en
      vise une. Le DAAF du logement, lui, n'en vise aucune : la norme le
      met dans la circulation qui dessert les chambres — à défaut, la plus
      grande pièce qui ne soit ni cuisine ni salle d'eau, où les vapeurs
      le feraient hurler pour rien.
    */
    let room = roomId ? ctx.rooms.find((r) => r.id === roomId) : undefined;
    if (!room) {
      const usede = (r: RoomInput) => roomUse(r.name, r.kind);
      room =
        ctx.rooms.find((r) => usede(r) === 'circulation') ??
        [...ctx.rooms]
          .filter((r) => usede(r) !== 'cuisine' && usede(r) !== 'sdb')
          .sort((a, b) => b.area - a.area)[0];
    }
    if (!room) return null;
    return {
      fixtures: [],
      ceiling: [
        {
          id: ctx.id(fix.kind),
          kind: fix.kind,
          roomId: room.id,
          at: { ...room.interieur },
        },
      ],
    };
  }

  /*
    LA PRISE D'UN APPAREIL SE POSE DERRIÈRE LUI — revue « Gérard » : les
    trois circuits spécialisés et la cuisson cherchaient une place « hors
    meubles », et une cuisine équipée n'en a aucune : « 0 sur 3 » restait
    après « Normes auto ». Le lave-vaisselle, le lave-linge, le four, la
    plaque relevés appellent leur prise derrière eux, sur le mur qui les
    porte — où qu'ils soient : le lave-linge est souvent en salle d'eau.
  */
  const kindAppareil = fix.kind === 'prise20' || fix.kind === 'prise32' ? fix.kind : null;
  const appareil = fix.type === 'poser' && kindAppareil !== null;
  if (appareil && kindAppareil) {
    const derriere = derriereUnAppareil(kindAppareil, fix.height ?? FIXTURES[kindAppareil].std, roomId, ctx);
    if (derriere) return { fixtures: [derriere], ceiling: [] };
  }

  // Poser au mur : les pièces candidates, la visée d'abord, puis toutes —
  // le tableau du logement n'a pas de pièce attitrée, il va où il y a de
  // la place, de préférence en dégagement. Jamais dehors.
  const candidates = roomId
    ? ctx.rooms.filter((r) => r.id === roomId)
    : [...ctx.rooms]
        .filter((r) => roomUse(r.name, r.kind) !== 'exterieur')
        .sort((a, b) => {
          const rang = (r: RoomInput) =>
            roomUse(r.name, r.kind) === 'circulation' ? 0 : 1;
          return rang(a) - rang(b);
        });
  for (const room of candidates) {
    const murs = ctx.walls.filter((w) => room.wallIds.includes(w.id));
    if (murs.length === 0) continue;
    /*
      Une prise d'appareil sans appareil relevé va au-dessus du meuble bas —
      mais jamais derrière un meuble haut (revue « Nadia » : une 20 A
      derrière le réfrigérateur de 1,80 m, inaccessible). À 1,10 m, seul ce
      qui monte plus haut cache la place : `placesLibres` le sait.
    */
    const objets = ctx.objects.filter((o) => !o.roomId || o.roomId === room.id);
    let hauteur = fix.height ?? FIXTURES[fix.kind].std;
    let places = placesLibres(
      murs,
      ctx.openings,
      objets,
      ctx.fixtures,
      room.interieur,
      hauteur,
      solDesMurs(ctx.walls),
    );
    // « Poser PC 110 » en cuisine : au-dessus du plan relevé, s'il y en a un.
    if (fix.kind === 'prise' && hauteur >= 0.9 && estCuisine(room.name, room.kind)) {
      const plans = new Map<string, Worktop[]>();
      for (const w of murs) {
        const p = plansDuMur(w, room.interieur, objets, true, solDesMurs(ctx.walls));
        if (p.length > 0) plans.set(w.id, p);
      }
      const libres = [...plans.values()].flat().filter((w) => !w.nature);
      if (libres.length > 0) {
        hauteur = Math.round((Math.max(...libres.map((w) => w.height)) + 0.2) * 100) / 100;
        places = auDroitDesPlans(places, plans);
      }
    }
    /*
      LA PLACE DOIT ÊTRE PERMISE — revue « Nadia », électricienne : la passe
      qui complète posait une prise en volume 2 de la salle de bains, que le
      contrôle déclarait aussitôt « interdit ». Même refus que la première
      passe ; et jamais sur un mur plus bas que la pose (une jambette de
      1,00 m sous un interrupteur à 1,10 m).
    */
    const zones = wetZones(ctx.objects.filter((o) => !o.roomId || o.roomId === room.id) as never, solDesMurs(ctx.walls));
    let place: ReturnType<typeof prendre> = null;
    for (let essai = 0; essai < 24; essai++) {
      const p = prendre(places);
      if (!p) break;
      if (p.wall.height < hauteur + 0.1) continue;
      if (zones.length > 0) {
        const L = segLength(p.wall) || 1;
        const u = { x: (p.wall.b.x - p.wall.a.x) / L, z: (p.wall.b.z - p.wall.a.z) / L };
        const nrm = perpOf(u);
        const pt = {
          x: p.wall.a.x + u.x * p.along + nrm.x * p.side * 0.05,
          z: p.wall.a.z + u.z * p.along + nrm.z * p.side * 0.05,
        };
        const v = volumeAt(pt, hauteur, zones);
        if (v !== null && !volumeVerdict(fix.kind, v).allowed) continue;
      }
      place = p;
      break;
    }
    if (!place) continue;
    return {
      fixtures: [
        {
          id: ctx.id(fix.kind),
          kind: fix.kind,
          wallId: place.wall.id,
          along: place.along,
          height: hauteur,
          side: place.side,
        },
      ],
      ceiling: [],
    };
  }
  return null;
}

/** Le sigle de l'appareil relevé, écrit dans le rond du symbole. */
function sigleDe(categorie: string): string | undefined {
  if (/dishwasher/i.test(categorie)) return 'LV';
  if (/dryer/i.test(categorie)) return 'SL';
  if (/washer/i.test(categorie)) return 'LL';
  if (/oven/i.test(categorie)) return 'FO';
  if (/stove|cooktop/i.test(categorie)) return 'PL';
  return undefined;
}

/** Ce que chaque prise d'appareil dessert. */
const APPAREILS: Record<'prise20' | 'prise32', RegExp> = {
  prise20: /dishwasher|washer|dryer|oven/i,
  prise32: /stove|cooktop/i,
};

/**
 * Derrière quel appareil, encore sans sa prise, poser celle-ci : le mur de
 * sa pièce le plus proche de lui, au droit de son milieu. `null` : aucun
 * appareil relevé ne l'attend.
 */
function derriereUnAppareil(
  kind: 'prise20' | 'prise32',
  hauteur: number,
  roomId: string | undefined,
  ctx: ContexteCorrection,
): Fixture | null {
  const pieces = roomId ? [...ctx.rooms.filter((r) => r.id === roomId), ...ctx.rooms.filter((r) => r.id !== roomId)] : ctx.rooms;
  for (const room of pieces) {
    const murs = ctx.walls.filter((w) => room.wallIds.includes(w.id));
    if (murs.length === 0) continue;
    for (const o of ctx.objects) {
      if (o.roomId !== room.id || !APPAREILS[kind].test(o.category ?? '')) continue;
      const c = { x: o.transform[12], z: o.transform[14] };
      let mieux: { wall: WallSeg; t: number; d: number } | null = null;
      for (const w of murs) {
        const { dist, t } = pointOnSeg(c, w.a, w.b);
        if (dist <= Math.max(o.width, o.depth) / 2 + 0.4 && (!mieux || dist < mieux.d)) mieux = { wall: w, t, d: dist };
      }
      if (!mieux) continue;
      const L = segLength(mieux.wall);
      if (L < 0.3) continue;
      const along = Math.min(L - 0.15, Math.max(0.15, mieux.t * L));
      // Déjà servi : une prise de cette nature au droit de l'appareil.
      if (ctx.fixtures.some((f) => f.kind === kind && f.wallId === mieux!.wall.id && Math.abs(f.along - along) < 0.6)) continue;
      const u = { x: (mieux.wall.b.x - mieux.wall.a.x) / L, z: (mieux.wall.b.z - mieux.wall.a.z) / L };
      const nrm = perpOf(u);
      const mil = { x: (mieux.wall.a.x + mieux.wall.b.x) / 2, z: (mieux.wall.a.z + mieux.wall.b.z) / 2 };
      const side: 1 | -1 = (room.interieur.x - mil.x) * nrm.x + (room.interieur.z - mil.z) * nrm.z >= 0 ? 1 : -1;
      const usage = sigleDe(o.category ?? '');
      return { id: ctx.id(kind), kind, wallId: mieux.wall.id, along, height: hauteur, side, ...(usage ? { usage } : {}) };
    }
  }
  return null;
}

/**
 * « NORMES AUTO » NE LAISSE PAS SES PROPRES ALERTES — revue « Nicolas » :
 * après l'appui restaient « cuisine 0/4 au-dessus du plan », « aucun
 * détecteur de fumée », « aucun tableau ». Ce que le contrôle sait corriger
 * d'un appui (une pose au mur, un appareil au plafond), on le corrige ici
 * aussi, constat après constat, jusqu'à ce que plus rien ne se règle.
 *
 * `verifier` rend les constats du plan tel qu'il serait : l'écran seul a de
 * quoi les calculer. Une pose qui ne fait pas bouger son constat est
 * reprise aussitôt, et le constat laissé à l'électricien : on ne sème pas
 * d'appareils inutiles.
 */
export function completerAuxNormes(
  ctx: ContexteCorrection & { ceiling: CeilingFixture[] },
  verifier: (
    fixtures: Fixture[],
    ceiling: CeilingFixture[],
  ) => { message: string; roomId?: string; fix?: ElecFix }[],
  max = 30,
): { fixtures: Fixture[]; ceiling: CeilingFixture[]; poses: string[] } {
  let fixtures = ctx.fixtures;
  let ceiling = ctx.ceiling;
  const ajoutsF: Fixture[] = [];
  const ajoutsC: CeilingFixture[] = [];
  const poses: string[] = [];
  const laisses = new Set<string>();
  let dernier: { message: string; nf: number; nc: number } | null = null;
  for (let k = 0; k < max; k++) {
    const c = verifier(fixtures, ceiling).find(
      (i) => i.fix && (i.fix.type === 'poser' || i.fix.type === 'plafond') && !laisses.has(i.message),
    );
    if (!c?.fix) break;
    if (dernier && c.message === dernier.message) {
      // La pose n'a rien changé : on la reprend, et l'on passe au suivant.
      ajoutsF.splice(ajoutsF.length - dernier.nf, dernier.nf);
      ajoutsC.splice(ajoutsC.length - dernier.nc, dernier.nc);
      fixtures = fixtures.slice(0, fixtures.length - dernier.nf);
      ceiling = ceiling.slice(0, ceiling.length - dernier.nc);
      poses.pop();
      laisses.add(c.message);
      dernier = null;
      continue;
    }
    const res = corrigerConstat(c.fix, c.roomId, { ...ctx, fixtures });
    if (!res || res.fixtures.length + res.ceiling.length === 0) {
      laisses.add(c.message);
      dernier = null;
      continue;
    }
    fixtures = [...fixtures, ...res.fixtures];
    ceiling = [...ceiling, ...res.ceiling];
    ajoutsF.push(...res.fixtures);
    ajoutsC.push(...res.ceiling);
    poses.push(c.fix.label);
    dernier = { message: c.message, nf: res.fixtures.length, nc: res.ceiling.length };
  }
  return { fixtures: ajoutsF, ceiling: ajoutsC, poses };
}
