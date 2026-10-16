/**
 * UN SÉJOUR AVEC UNE PLAQUE EST UNE CUISINE — revue « Gérard », électricien.
 *
 * L'exemple se déclarait conforme alors que sa cuisine ouverte (pièce
 * « Séjour », type séjour, avec frigo, meuble bas et plaque) n'était
 * reconnue comme cuisine que par son NOM. Ni les six socles dont quatre
 * au-dessus du plan, ni les trois spécialisés 20 A, ni le 32 A de cuisson
 * n'étaient contrôlés : bouclier vert.
 *
 * Ce banc reprend l'exemple tel qu'il était — « Séjour », type séjour, son
 * ancienne installation — et vérifie que la plaque suffit à réveiller les
 * règles de la cuisine. Puis, en sens inverse, que le même séjour sans
 * meuble de cuisine reste un séjour.
 */
import { appartementExemple } from '../src/data/exemple';
import { roomParts } from '../src/geometry/floorplan';
import {
  checkElectrical,
  equipeeEnCuisine,
  estCuisine,
  fixturePlacement,
  plansDeTravailParMur,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';

describe('estCuisine', () => {
  it('le nom ne suffit plus : le type séjour-cuisine, ou une pièce équipée', () => {
    expect(estCuisine('Séjour', 'living')).toBe(false);
    expect(estCuisine('Séjour', 'sejourCuisine')).toBe(true);
    expect(estCuisine('Séjour', 'living', true)).toBe(true);
    expect(estCuisine('Séjour-cuisine', 'living')).toBe(true);
  });

  it('mais un évier de salle d’eau ne fait pas une cuisine', () => {
    expect(estCuisine('Salle d’eau', 'bathroom', true)).toBe(false);
    expect(estCuisine('Chambre', 'bedroom', true)).toBe(false);
  });

  it('une plaque dans le contour de la pièce l’équipe', () => {
    const carre = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
    ];
    const ici = (category: string, x: number) => ({
      category,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.45, 1, 1],
    });
    expect(equipeeEnCuisine(carre, [ici('stove', 1)])).toBe(true);
    expect(equipeeEnCuisine(carre, [ici('sofa', 1)])).toBe(false);
    // La plaque de la pièce voisine ne compte pas.
    expect(equipeeEnCuisine(carre, [ici('stove', 6)])).toBe(false);
  });
});

describe('l’ancien exemple — « Séjour », type séjour, avec plaque', () => {
  const ex = appartementExemple();
  const sejourId = ex.rooms.find((r) => r.name === 'Séjour-cuisine')!.id;
  // La pièce telle qu'elle était nommée avant la revue.
  const rooms = ex.rooms.map((r) => (r.id === sejourId ? { ...r, name: 'Séjour', kind: 'living' as const } : r));
  // Et son installation d'alors : ni spécialisés de cuisine, ni socles au plan.
  const AJOUTS = ['exemple-prise-four', 'exemple-prise-lave-vaisselle', 'exemple-plan-gauche', 'exemple-plan-droite'];
  const fixtures = ex.fixtures
    .filter((f) => !AJOUTS.includes(f.id))
    .map((f) => (f.id === 'exemple-sortie-plaque' ? { ...f, usage: undefined } : f));
  const parts = roomParts(ex.walls, rooms);

  const controler = (objects: typeof ex.objects, commeLEcran = false) => {
    // L'écran du plan ne passe pas les meubles à `roomInputsOf` : la plaque
    // relevée au mur (`plansDeTravailParMur`) doit suffire.
    const inputs = commeLEcran ? roomInputsOf(rooms, parts) : roomInputsOf(rooms, parts, objects);
    const placement = fixturePlacement(fixtures, ex.walls, inputs);
    return checkElectrical(
      inputs,
      fixtures,
      wallToRooms(inputs),
      placement,
      undefined,
      plansDeTravailParMur(ex.walls, rooms, objects),
      ex.ceiling,
      { walls: ex.walls, openings: ex.openings },
    ).filter((i) => i.severity === 'alerte');
  };

  it('la plaque déclenche les exigences de la cuisine', () => {
    const alertes = controler(ex.objects);
    const codes = new Set(alertes.map((i) => i.code));
    // Quatre socles au-dessus du plan, les trois spécialisés, la cuisson.
    expect(codes.has('surPlan')).toBe(true);
    expect(codes.has('specialises')).toBe(true);
    expect(codes.has('cuisson')).toBe(true);
    expect(alertes.find((i) => i.code === 'surPlan')!.roomId).toBe(sejourId);
  });

  it('et l’écran du plan la voit aussi, par la plaque relevée au mur', () => {
    const codes = new Set(controler(ex.objects, true).map((i) => i.code));
    expect(codes.has('surPlan')).toBe(true);
    expect(codes.has('specialises')).toBe(true);
    expect(codes.has('cuisson')).toBe(true);
  });

  it('la pièce est équipée d’après ses meubles, sans le nom', () => {
    const inputs = roomInputsOf(rooms, parts, ex.objects);
    expect(inputs.find((r) => r.id === sejourId)!.equipeeCuisine).toBe(true);
  });

  it('sans meuble de cuisine, le même séjour reste un séjour', () => {
    const sansCuisine = ex.objects.filter((o) => !/stove|sink|oven|counter|refrigerator|storage/i.test(o.category ?? ''));
    const codes = new Set(controler(sansCuisine).map((i) => i.code));
    expect(codes.has('surPlan')).toBe(false);
    expect(codes.has('specialises')).toBe(false);
    expect(codes.has('cuisson')).toBe(false);
  });
});
