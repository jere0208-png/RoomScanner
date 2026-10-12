/**
 * LE PLAN D'ÉLECTRICIEN SANS COTES — les pièces tiennent les murs.
 *
 * Relevé du patron, photo d'un plan d'électricien à l'appui : « il a scanné
 * cela, rien à voir, manque beaucoup de murs. Certes il n'y a pas de cotes
 * mais il devrait au moins prendre les murs correctement. »
 *
 * La lecture rendait 19 murs morcelés, une seule pièce, aucune cloison.
 * Deux remèdes, que ce banc tient :
 *
 *   — LE CONTOUR DE CHAQUE PIÈCE. L'IA trace mieux une pièce, ancrée à son
 *     nom, qu'une liste de soixante segments. Chaque côté d'un contour
 *     longe un mur : là où aucun mur lu ne le borde, il en devient un, et
 *     les côtés de deux pièces voisines se fondent en UNE cloison, au
 *     milieu de leur écart. Les surfaces écrites, mesurées sur ces
 *     contours, donnent l'échelle quand le plan n'a pas de cote.
 *
 *   — LE CADRE DU PLAN PRINCIPAL. La photo montrait aussi le bas d'une
 *     autre feuille : ce qui est lu hors du cadre est écarté.
 */
import { reconstruirePlan, type LectureBrute } from '../src/geometry/lecturePlan';
import { roomParts } from '../src/geometry/floorplan';

const IMAGE = { largeur: 1000, hauteur: 1000 };

/** Un rectangle de coins intérieurs, en millièmes. */
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/*
  Deux pièces côte à côte, séparées par une cloison de 20 ‰ : à 1 cm par
  millième (1000 px pour 10 m), la chambre fait 3,00 × 3,00 et le bureau
  2,80 × 3,00. Aucun mur lu, aucune cote : seulement les pièces.
*/
const DEUX_PIECES: LectureBrute = {
  est_un_plan: true,
  murs: [],
  pieces: [
    { nom: 'Chambre', point: [250, 250], surface: '9,00 m²', contour: rect(100, 100, 400, 400) },
    { nom: 'Bureau', point: [560, 250], surface: '8,40 m²', contour: rect(420, 100, 700, 400) },
  ],
};

const aires = (r: ReturnType<typeof reconstruirePlan>) => {
  if (!r.ok) throw new Error(r.raison);
  const parts = roomParts(r.plan.walls, r.plan.rooms);
  return new Map(r.plan.rooms.map((room) => [room.name, parts.find((p) => p.roomId === room.id)?.surface?.area ?? 0]));
};

describe('les pièces tiennent les murs', () => {
  it('sans un seul mur lu, deux contours donnent deux pièces nommées, à leur surface', () => {
    const r = reconstruirePlan(DEUX_PIECES, IMAGE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.rooms.map((p) => p.name).sort()).toEqual(['Bureau', 'Chambre']);
    const a = aires(r);
    // Les murs extérieurs sont posés sur les nus lus, la cloison au milieu :
    // à la cloison près, la surface écrite.
    expect(a.get('Chambre')!).toBeGreaterThan(8.6);
    expect(a.get('Chambre')!).toBeLessThan(9.6);
    expect(a.get('Bureau')!).toBeGreaterThan(8.0);
    expect(a.get('Bureau')!).toBeLessThan(9.0);
    // L'échelle vient des surfaces écrites.
    expect(r.plan.rapport.echelleDepuis).toBe('surfaces');
  });

  it('les côtés de deux pièces voisines font UNE cloison, à mi-distance', () => {
    const r = reconstruirePlan(DEUX_PIECES, IMAGE);
    if (!r.ok) throw new Error(r.raison);
    const verticaux = r.plan.walls.filter((w) => Math.abs(w.a.x - w.b.x) < 1e-6);
    const xs = [...new Set(verticaux.map((w) => Math.round(w.a.x * 100) / 100))].sort((p, q) => p - q);
    // Trois files de murs verticaux : la façade gauche, la cloison, la façade droite.
    expect(xs).toHaveLength(3);
    const cloison = verticaux.find((w) => Math.abs(w.a.x - xs[1]) < 1e-6)!;
    // 20 ‰ d'écart entre les deux nus : une cloison de 20 cm.
    expect(cloison.epaisseur).toBeCloseTo(0.2, 1);
  });

  it('un mur déjà lu n’est pas doublé par le côté du contour qui le longe', () => {
    const avecFacade: LectureBrute = {
      ...DEUX_PIECES,
      // La façade gauche lue sur son axe, à 10 ‰ du nu de la chambre.
      murs: [[90, 90, 90, 410, 20]],
    };
    const r = reconstruirePlan(avecFacade, IMAGE);
    if (!r.ok) throw new Error(r.raison);
    const verticaux = r.plan.walls.filter((w) => Math.abs(w.a.x - w.b.x) < 1e-6);
    const xs = [...new Set(verticaux.map((w) => Math.round(w.a.x * 100) / 100))];
    expect(xs).toHaveLength(3);
  });
});

describe('le plan principal, et lui seul', () => {
  it('ce qui est lu hors du cadre — l’autre feuille, en bas de la photo — est écarté', () => {
    const avecAutreFeuille: LectureBrute = {
      ...DEUX_PIECES,
      cadre: [80, 80, 720, 420],
      murs: [
        [100, 850, 900, 850, 15],
        [100, 850, 100, 990, 15],
      ],
      pieces: [
        ...(DEUX_PIECES.pieces ?? []),
        { nom: 'Chambre 1', point: [300, 920], surface: '9,81 m²', contour: rect(110, 860, 500, 990) },
      ],
      cotes: [{ texte: '4,21', a: [100, 830], b: [520, 830], reference: 'exterieur' }],
    };
    const r = reconstruirePlan(avecAutreFeuille, IMAGE);
    if (!r.ok) throw new Error(r.raison);
    expect(r.plan.rooms.map((p) => p.name).sort()).toEqual(['Bureau', 'Chambre']);
    // La cote de l'autre feuille ne donne pas l'échelle.
    expect(r.plan.rapport.echelleDepuis).toBe('surfaces');
  });
});
