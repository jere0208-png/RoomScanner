/**
 * LA LECTURE AU CENTIMÈTRE — ce que la reconstruction tire du plan quand la
 * vision s'est trompée de quelques millièmes.
 *
 * Relevé du patron : « la lecture d'un plan se trompe souvent, ne repère pas
 * les cloisons ». Le banc d'essai (vrais plans d'architecte, plans dessinés
 * dans dix styles, photos) a montré trois pertes, corrigées ici :
 *   — une cloison que rien ne cote restait où la vision l'avait vue, à 10 ou
 *     15 cm près : les SURFACES ÉCRITES la remettent en place ;
 *   — un plan coté en centimètres sans unité (« 650 ») ne trouvait pas son
 *     échelle ;
 *   — une feuille photographiée de biais : la PERSPECTIVE se lit sur les
 *     murs eux-mêmes, et se retire.
 */
import { perspectiveDesMurs, reconstruirePlan, type LectureBrute } from '../src/geometry/lecturePlan';
import { roomParts } from '../src/geometry/floorplan';

const IMAGE = { largeur: 1000, hauteur: 1000 };

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const aires = (r: ReturnType<typeof reconstruirePlan>) => {
  if (!r.ok) throw new Error(r.raison);
  const parts = roomParts(
    r.plan.walls.map((w) => ({ ...w, auNu: true })),
    r.plan.rooms,
  );
  return new Map(r.plan.rooms.map((room) => [room.name, parts.find((p) => p.roomId === room.id)?.surface?.area ?? 0]));
};

/*
  Deux pièces de 3,00 × 3,00 au nu, façades de 20 cm, cloison de 10 cm ; à
  1 cm par millième. La vision a vu la cloison 15 cm trop à droite, et rien
  ne la cote : seulement le hors-tout et les surfaces écrites.
*/
const CLOISON_DEPLACEE: LectureBrute = {
  est_un_plan: true,
  murs: [
    [100, 100, 730, 100, 20],
    [100, 420, 730, 420, 20],
    [100, 100, 100, 420, 20],
    [730, 100, 730, 420, 20],
    [430, 100, 430, 420, 10],
  ],
  pieces: [
    { nom: 'Chambre', point: [260, 250], surface: '9,00 m²', contour: rect(110, 110, 425, 410) },
    { nom: 'Bureau', point: [580, 250], surface: '9,00 m²', contour: rect(435, 110, 720, 410) },
  ],
  cotes: [
    { texte: '6,50', a: [90, 60], b: [740, 60], reference: 'exterieur' },
    { texte: '3,40', a: [60, 90], b: [60, 430], reference: 'exterieur' },
  ],
};

describe('la lecture au centimètre', () => {
  it('les surfaces écrites remettent en place une cloison mal située', () => {
    const r = reconstruirePlan(CLOISON_DEPLACEE, IMAGE);
    const a = aires(r);
    // Sans elles : 9,45 et 8,55 m². Avec : la surface écrite, au dm² près.
    expect(a.get('Chambre')!).toBeCloseTo(9.0, 1);
    expect(a.get('Bureau')!).toBeCloseTo(9.0, 1);
  });

  it('une surface qui ne colle pas du tout à la pièce ne la tord pas', () => {
    // « 19,00 » au lieu de « 9,00 » : à plus de 30 % de la pièce, la surface
    // est mal lue ou mal rattachée, et la trame des cotes reste.
    const lu: LectureBrute = {
      ...CLOISON_DEPLACEE,
      pieces: CLOISON_DEPLACEE.pieces!.map((p, i) => (i === 0 ? { ...p, surface: '19,00 m²' } : p)),
    };
    const a = aires(reconstruirePlan(lu, IMAGE));
    expect(a.get('Chambre')!).toBeLessThan(12);
    expect(a.get('Chambre')!).toBeGreaterThan(8);
  });

  it('des cotes entières sans unité, en centimètres, donnent l’échelle', () => {
    const lu: LectureBrute = {
      ...CLOISON_DEPLACEE,
      pieces: [],
      cotes: [
        { texte: '650', a: [90, 60], b: [740, 60], reference: 'exterieur' },
        { texte: '340', a: [60, 90], b: [60, 430], reference: 'exterieur' },
      ],
    };
    const r = reconstruirePlan(lu, IMAGE);
    if (!r.ok) throw new Error(r.raison);
    expect(r.plan.rapport.echelleDepuis).toBe('cotes');
    expect(r.plan.rapport.echelle).toBeCloseTo(0.01, 4);
    const xs = r.plan.walls.flatMap((w) => [w.a.x, w.b.x]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6.3, 2);
  });

  describe('la feuille photographiée de biais', () => {
    // Un logement de 10 × 8 m en trame, à 1 cm par millième, vu de biais :
    // une homographie qui rapproche le bas de la feuille.
    const g = 0.0;
    const h = 0.08;
    const biais = (x: number, y: number): [number, number] => {
      const nx = (x - 500) / 707;
      const ny = (y - 500) / 707;
      const w = 1 + g * nx + h * ny;
      return [500 + (nx / w) * 707, 500 + (ny / w) * 707];
    };
    const trait = (x1: number, y1: number, x2: number, y2: number, ep: number) => [...biais(x1, y1), ...biais(x2, y2), ep];
    const MURS = [
      trait(100, 100, 1100 - 100, 100, 20),
      trait(100, 900, 1100 - 100, 900, 20),
      trait(100, 100, 100, 900, 20),
      trait(1000, 100, 1000, 900, 20),
      trait(400, 100, 400, 900, 10),
      trait(700, 100, 700, 900, 10),
      trait(100, 400, 1000, 400, 10),
      trait(100, 650, 1000, 650, 10),
    ];

    it('les murs disent la perspective, et elle se retire', () => {
      const pxs = MURS.map((m) => ({ a: { x: m[0], y: m[1] }, b: { x: m[2], y: m[3] } }));
      const deFace = perspectiveDesMurs(pxs, 1000, 1000);
      expect(deFace).not.toBeNull();
      // Redressés, les deux murs verticaux de façade sont parallèles.
      const [g1, g2] = [MURS[2], MURS[3]].map((m) => {
        const a = deFace!({ x: m[0], y: m[1] });
        const b = deFace!({ x: m[2], y: m[3] });
        return (b.x - a.x) / (b.y - a.y);
      });
      expect(Math.abs(g1 - g2)).toBeLessThan(0.002);
    });

    it('une feuille de face n’est pas déformée', () => {
      const deFace = perspectiveDesMurs(
        [
          [100, 100, 900, 100],
          [100, 900, 900, 900],
          [100, 100, 100, 900],
          [900, 100, 900, 900],
          [400, 100, 400, 900],
          [700, 100, 700, 900],
          [100, 400, 900, 400],
          [100, 650, 900, 650],
        ].map((m) => ({ a: { x: m[0], y: m[1] }, b: { x: m[2], y: m[3] } })),
        1000,
        1000,
      );
      expect(deFace).toBeNull();
    });

    it('le plan reconstruit garde ses travées égales, en haut comme en bas de la feuille', () => {
      const r = reconstruirePlan(
        {
          est_un_plan: true,
          murs: MURS,
          cotes: [{ texte: '9,20', a: biais(90, 60), b: biais(1010, 60), reference: 'exterieur' }],
        },
        IMAGE,
      );
      if (!r.ok) throw new Error(r.raison);
      const zs = [
        ...new Set(r.plan.walls.filter((w) => Math.abs(w.a.z - w.b.z) < 1e-6).map((w) => Math.round(w.a.z * 1000) / 1000)),
      ].sort((p, q) => p - q);
      expect(zs).toHaveLength(4);
      // Les deux travées du bas font 2,50 m chacune sur le plan : la feuille
      // de biais les rendait inégales (celle du bas, plus loin, plus courte).
      expect(Math.abs(zs[2] - zs[1] - (zs[3] - zs[2]))).toBeLessThan(0.03);
    });
  });
});
