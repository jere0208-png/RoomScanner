/**
 * LE BANC D'ÉPREUVE DU CÔTÉ MÉTIER.
 *
 * Le banc de la vue 3D éprouve ce qu'on VOIT ; celui-ci éprouve ce qu'on
 * SIGNE. Un dossier d'électricien se juge sur trois choses, et une seule
 * erreur sur l'une des trois le rend inutilisable :
 *
 *   — le tableau doit porter TOUS les appareils, et chacun UNE FOIS ;
 *   — un départ ne doit jamais dépasser ce que la norme lui accorde ;
 *   — la commande de matériel doit compter le même nombre de prises que
 *     le plan en montre.
 *
 * On ne le vérifie pas sur une pièce d'exemple : on peuple huit logements
 * d'appareillage — jusqu'à cent quarante points sur un plateau — et on
 * refait le calcul complet sur chacun. Et parce que la nomenclature
 * cardinale se déduit d'un repère qu'ARKit oriente au hasard, on éprouve
 * aussi la ROTATION : le même logement, tourné avec son nord, doit
 * nommer ses murs exactement pareil.
 */
import {
  checkElectrical,
  materialList,
  planCircuits,
  MAX_LUMIERE,
  MAX_SOCLES,
  type CircuitNature,
  type RoomInput,
} from '../src/geometry/nfc15100';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';
import { deviceNames, wallCardinal, wallLabel } from '../src/geometry/naming';
import { northPageDir } from '../src/export/pdf';
import { planFrameAngle, type WallSeg } from '../src/geometry/floorplan';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const boucle = (pts: [number, number][], piece = 'r1'): WallSeg[] =>
  pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return { ...mur(`${piece}w${i}`, p[0], p[1], q[0], q[1]), roomId: piece };
  });

const aire = (pts: [number, number][]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
};

const centre = (pts: [number, number][]) => ({
  x: pts.reduce((s, p) => s + p[0], 0) / pts.length,
  z: pts.reduce((s, p) => s + p[1], 0) / pts.length,
});

/** Un tirage reproductible : le même banc à chaque exécution. */
function dé(graine: number) {
  let x = graine;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const NATURES: FixtureKind[] = [
  'prise',
  'prise2',
  'inter',
  'va',
  'applique',
  'rj45',
  'tv',
  'prise32',
  'sortieCable',
  'rjPrise',
  'inter2',
];

/**
 * On garnit chaque mur d'appareillage, comme le ferait l'utilisateur.
 *
 * Pas au hasard complet : une densité réaliste (un point tous les deux
 * mètres environ), des hauteurs plausibles, et de temps en temps deux
 * appareils réunis sous une même plaque — c'est le cas qui a le plus de
 * chances de compter double dans un tableau.
 */
function garnir(walls: WallSeg[], graine: number): Fixture[] {
  const r = dé(graine);
  const out: Fixture[] = [];
  for (const w of walls) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i < n; i++) {
      const kind = NATURES[Math.floor(r() * NATURES.length)];
      const id = `f${out.length}`;
      out.push({
        id,
        kind,
        wallId: w.id,
        along: ((i + 0.5) / n) * len,
        height: kind === 'inter' || kind === 'va' ? 1.1 : 0.25,
        side: 1,
      });
      // Une plaque à deux postes, une fois sur cinq.
      if (r() < 0.2) {
        out.push({
          id: `${id}b`,
          kind: 'prise',
          wallId: w.id,
          along: ((i + 0.5) / n) * len + 0.08,
          height: 0.25,
          side: 1,
          group: `g${id}`,
        });
        out[out.length - 2].group = `g${id}`;
      }
    }
  }
  return out;
}

const PLANS: {
  nom: string;
  pts: [number, number][];
  cuisine?: boolean;
}[] = [
  { nom: 'studio', pts: [[0, 0], [4, 0], [4, 4], [0, 4]] },
  { nom: 'séjour allongé', pts: [[0, 0], [9, 0], [9, 3.6], [0, 3.6]] },
  { nom: 'cuisine', pts: [[0, 0], [3.2, 0], [3.2, 2.6], [0, 2.6]], cuisine: true },
  {
    nom: 'séjour en L',
    pts: [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]],
  },
  { nom: 'couloir', pts: [[0, 0], [7, 0], [7, 1.1], [0, 1.1]] },
  { nom: 'placard', pts: [[0, 0], [0.9, 0], [0.9, 1.1], [0, 1.1]] },
  { nom: 'plateau', pts: [[0, 0], [18, 0], [18, 11], [0, 11]] },
  { nom: 'chambre', pts: [[0, 0], [3.6, 0], [3.6, 4.2], [0, 4.2]] },
];

/** Le logement complet, prêt à passer au tableau. */
function monter(p: (typeof PLANS)[number], graine: number) {
  const walls = boucle(p.pts);
  const fixtures = garnir(walls, graine);
  const rooms: RoomInput[] = [
    {
      id: 'r1',
      name: p.cuisine ? 'Cuisine' : p.nom,
      kind: p.cuisine ? 'kitchen' : null,
      area: aire(p.pts),
      wallIds: walls.map((w) => w.id),
      outline: p.pts.map(([x, z]) => ({ x, z })),
    },
  ];
  const roomOfWall = new Map(walls.map((w) => [w.id, ['r1']]));
  const placement = new Map(fixtures.map((f) => [f.id, 'r1']));
  return { walls, fixtures, rooms, roomOfWall, placement };
}

describe('le banc d’épreuve du tableau', () => {
  /**
   * PREMIER INVARIANT : on n'oublie personne, et on ne compte personne
   * deux fois.
   *
   * C'est l'erreur qui coûte le plus cher sur un chantier : une prise
   * dessinée que le tableau ne porte pas, c'est un départ à retirer une
   * fois les cloisons fermées.
   */
  it('porte chaque appareil une fois et une seule', () => {
    PLANS.forEach((p, k) => {
      const { fixtures, walls } = monter(p, 7 + k * 13);
      const circuits = planCircuits(
        fixtures,
        () => (p.cuisine ? 'Cuisine' : p.nom),
        () => !!p.cuisine,
        () => 'r1',
      );
      // Un appareil peut servir DEUX départs — une plaque RJ45 + prise est
      // à la fois sur les prises et sur les courants faibles — mais jamais
      // deux fois le MÊME, et jamais aucun.
      const vus = new Map<string, string[]>();
      for (const c of circuits) {
        for (const id of c.fixtureIds) {
          const l = vus.get(id) ?? [];
          l.push(c.nature);
          vus.set(id, l);
        }
      }
      for (const f of fixtures) {
        const l = vus.get(f.id) ?? [];
        expect(`${p.nom} ${f.kind} ${f.id} : ${l.length || 'aucun'} départ`).toBe(
          `${p.nom} ${f.kind} ${f.id} : ${l.length || 'aucun'} départ`.replace(
            'aucun',
            '— orphelin —',
          ),
        );
        expect(new Set(l).size).toBe(l.length);
      }
      // Et aucun identifiant inventé en chemin.
      const connus = new Set(fixtures.map((f) => f.id));
      for (const c of circuits) {
        for (const id of c.fixtureIds) expect(connus.has(id)).toBe(true);
      }
      expect(walls.length).toBeGreaterThan(0);
    });
  });

  /**
   * DEUXIÈME INVARIANT : aucun départ ne dépasse la norme.
   *
   * Huit points d'éclairage, douze prises, et une section qui va avec le
   * calibre. Le calcul est simple ; c'est justement pourquoi une erreur y
   * passe inaperçue jusqu'au Consuel.
   */
  it('ne charge jamais un départ au-delà de ce que la norme accorde', () => {
    // Les plafonds de la norme, tels que le moteur les nomme. Une première
    // version de ce banc les avait écrits en anglais : la table ne
    // correspondait à aucune nature, et l'épreuve ne vérifiait rien du
    // tout en passant au vert à chaque fois.
    const PLAFOND: Record<CircuitNature, number | null> = {
      eclairage: MAX_LUMIERE,
      prises: MAX_SOCLES,
      cuisson: 1,
      specialise: 1,
      sortie: MAX_SOCLES,
      vdi: null,
    };
    const SECTIONS: Record<number, number[]> = {
      16: [1.5],
      20: [2.5],
      32: [6],
    };
    PLANS.forEach((p, k) => {
      const { fixtures } = monter(p, 101 + k * 7);
      const circuits = planCircuits(
        fixtures,
        () => (p.cuisine ? 'Cuisine' : p.nom),
        () => !!p.cuisine,
        () => 'r1',
      );
      for (const c of circuits) {
        const max = PLAFOND[c.nature];
        if (max !== null && max !== undefined) {
          expect(`${p.nom} ${c.label} : ${c.points} pts`).toBe(
            `${p.nom} ${c.label} : ${Math.min(c.points, max)} pts`,
          );
        }
        if (c.breaker !== null && c.section !== null) {
          const permis = SECTIONS[c.breaker];
          if (permis) {
            expect(
              `${c.label} ${c.section} mm² / ${c.breaker} A`,
            ).toBe(
              `${c.label} ${
                permis.includes(c.section) ? c.section : permis[0]
              } mm² / ${c.breaker} A`,
            );
          }
        }
        // Un départ sans point, ça existe — des commandes posées avant les
        // luminaires — mais il doit alors le DIRE, sinon le tableau annonce
        // « 0 point » sans rien expliquer.
        if (c.points === 0) {
          expect(`${c.label} : ${c.note ? 'expliqué' : 'muet'}`).toBe(
            `${c.label} : expliqué`,
          );
        }
      }
    });
  });

  /**
   * TROISIÈME INVARIANT : la commande dit la même chose que le plan.
   */
  it('commande autant de mécanismes que le plan en montre', () => {
    PLANS.forEach((p, k) => {
      const { fixtures, rooms, roomOfWall, placement } = monter(p, 55 + k * 3);
      const liste = materialList(rooms, fixtures, roomOfWall, placement);
      const commandés = liste.rooms.reduce(
        (s, r) => s + r.rows.reduce((t, l) => t + l.quantity, 0),
        0,
      );
      // Un appareil posé = un article commandé. Une plaque à deux postes
      // se commande comme UN article (c'est un produit du catalogue), donc
      // on compte les appareils, pas les mécanismes.
      expect(`${p.nom} : ${commandés} article(s)`).toBe(
        `${p.nom} : ${fixtures.length} article(s)`,
      );
    });
  });

  /**
   * QUATRIÈME INVARIANT : le contrôle de norme ne parle que de ce qui existe.
   */
  it('ne signale jamais un appareil qui n’est pas sur le plan', () => {
    PLANS.forEach((p, k) => {
      const { fixtures, rooms, roomOfWall, placement } = monter(p, 17 + k * 5);
      const connus = new Set(fixtures.map((f) => f.id));
      const bilan = checkElectrical(rooms, fixtures, roomOfWall, placement);
      for (const a of bilan) {
        if (a.fixtureId) expect(connus.has(a.fixtureId)).toBe(true);
        expect(typeof a.message).toBe('string');
        expect(a.message.length).toBeGreaterThan(3);
      }
    });
  });
});

describe('le banc d’épreuve de la nomenclature', () => {
  /**
   * LE REPÈRE TOURNE, LES NOMS NE BOUGENT PAS.
   *
   * ARKit oriente son repère selon l'endroit où le scan a commencé : le
   * même appartement, scanné deux fois, sort tourné de quarante degrés. Si
   * le nom d'un mur suivait le repère plutôt que le nord, le dossier
   * appellerait « mur nord » deux murs différents d'un scan à l'autre — et
   * l'électricien poserait ses prises en face.
   */
  it('nomme les mêmes murs quel que soit le repère du scan', () => {
    for (const p of PLANS) {
      for (const angle of [0, 12, 47, 90, 137, 215, 314]) {
        const a = (angle * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const tournés = p.pts.map(
          ([x, z]) => [x * cos - z * sin, x * sin + z * cos] as [number, number],
        );
        const droits = boucle(p.pts);
        const biais = boucle(tournés);
        const cd = centre(p.pts);
        const cb = centre(tournés);
        // Le cap est mesuré DANS le repère du scan : tourner le logement de
        // douze degrés, c'est reculer le nord d'autant. Les noms, eux, ne
        // doivent pas broncher — c'est tout l'intérêt d'un point cardinal.
        for (let i = 0; i < droits.length; i++) {
          expect(`${p.nom} ${angle}° ${wallLabel(biais[i], cb, -angle)}`).toBe(
            `${p.nom} ${angle}° ${wallLabel(droits[i], cd, 0)}`,
          );
        }
      }
    }
  });

  /**
   * DEUX APPAREILS NE PORTENT JAMAIS LE MÊME NOM.
   *
   * « Prise plinthe 1 » deux fois dans la même pièce, et le schéma
   * unifilaire ne veut plus rien dire.
   */
  it('donne à chaque appareil un nom unique', () => {
    PLANS.forEach((p, k) => {
      const { fixtures, walls } = monter(p, 31 + k * 11);
      const noms = deviceNames(
        fixtures,
        walls,
        new Map(fixtures.map((f) => [f.id, 'r1'])),
        { r1: p.nom },
        new Map([['r1', centre(p.pts)]]),
        0,
      );
      expect(noms.size).toBe(fixtures.length);
      const vus = new Map<string, string>();
      for (const [id, n] of noms) {
        const complet = `${n.piece}|${n.nom}`;
        expect(vus.has(complet) ? `${complet} déjà pris` : complet).toBe(complet);
        vus.set(complet, id);
      }
    });
  });
});

/**
 * LE BANC D'ÉPREUVE DE LA BOUSSOLE IMPRIMÉE.
 *
 * Sur la feuille, deux choses désignent le même mur : son NOM (« mur
 * nord », écrit par la nomenclature) et l'AIGUILLE de la rose des vents,
 * dessinée en tête de plan. Elles sont calculées par deux codes
 * différents, dans deux repères différents — et rien, jusqu'ici, ne les
 * obligeait à dire la même chose.
 *
 * Elles ne la disaient pas : la rose prenait le cap à l'envers. Un plan
 * scanné cap au 90 sortait avec l'est et l'ouest échangés, pendant que
 * les murs, eux, portaient les bons noms. C'est le genre d'erreur qui ne
 * se voit qu'une fois sur place, la gaine déjà tirée.
 */
describe('le banc d’épreuve de la boussole', () => {
  const CAPS: Record<string, number> = {
    nord: 0,
    'nord-est': 45,
    est: 90,
    'sud-est': 135,
    sud: 180,
    'sud-ouest': 225,
    ouest: 270,
    'nord-ouest': 315,
  };

  it('pointe vers le mur qui en porte le nom', () => {
    for (const p of PLANS) {
      for (const biais of [0, 17, 63, 128, 249]) {
        const a = (biais * Math.PI) / 180;
        const pts = p.pts.map(
          ([x, z]) =>
            [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)] as [
              number,
              number,
            ],
        );
        const walls = boucle(pts);
        const c = centre(pts);
        const trame = planFrameAngle(walls);
        // La page : le plan redressé sur sa trame, Y vers le haut.
        const page = (q: { x: number; z: number }) => {
          const x = q.x * Math.cos(-trame) - q.z * Math.sin(-trame);
          const z = q.x * Math.sin(-trame) + q.z * Math.cos(-trame);
          return { x, y: -z };
        };
        for (const nord of [0, 30, 90, 137, 200, 314]) {
          for (const w of walls) {
            const nom = wallCardinal(w, c, nord);
            if (!nom) continue;
            const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
            const pm = page(mid);
            const pc = page(c);
            const vx = pm.x - pc.x;
            const vy = pm.y - pc.y;
            const n = Math.hypot(vx, vy);
            if (n < 0.05) continue;
            // L'aiguille de CE cap, et le mur qui porte son nom : moins de
            // 45° d'écart, sans quoi la feuille se contredit.
            const d = northPageDir(CAPS[nom], nord, trame);
            const cos = (vx * d.x + vy * d.y) / n;
            expect(
              `${p.nom} biais ${biais}° nord ${nord}° · ${nom} : ${
                cos > Math.cos(Math.PI / 4) ? 'd’accord' : `à ${Math.round(
                  (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI,
                )}°`
              }`,
            ).toBe(`${p.nom} biais ${biais}° nord ${nord}° · ${nom} : d’accord`);
          }
        }
      }
    }
  });
});
