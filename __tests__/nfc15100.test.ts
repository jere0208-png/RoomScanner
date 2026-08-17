/**
 * Conformité NF C 15-100 et découpage en circuits.
 *
 * Les nombres testés ici sont ceux de la norme, pas des choix d'interface :
 * cinq socles au séjour, trois par chambre, six en cuisine dont quatre
 * au-dessus du plan de travail, huit socles au maximum par circuit 20 A.
 * S'ils bougent un jour, il faut que ce soit délibéré.
 */
import {
  MAX_SOCLES,
  checkElectrical,
  materialList,
  planCircuits,
  planDifferentials,
  requirementFor,
  roomInputsOf,
  roomUse,
  roomsInAlert,
  wallToRooms,
  type RoomInput,
} from '../src/geometry/nfc15100';
import { buildMaterialPdf, buildScanPdf } from '../src/export/pdf';
import {
  ENTRAXE,
  boxOffsets,
  postsOf,
  rjOf,
  socketsOf,
} from '../src/geometry/electrical';
import { fixturePlacement } from '../src/geometry/nfc15100';
import { interiorSide, wallFace } from '../src/geometry/electrical';
import { roomParts, wallQuadsOf } from '../src/geometry/floorplan';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

let n = 0;
const fx = (kind: FixtureKind, wallId = 'w1', height = 0.25): Fixture => ({
  id: `f${++n}`,
  kind,
  wallId,
  along: 1,
  height,
  side: 1,
});

const room = (
  id: string,
  name: string,
  area: number,
  wallIds: string[] = ['w1'],
): RoomInput => ({ id, name, kind: null, area, wallIds });

describe('usage d’une pièce', () => {
  it('se lit d’abord dans le nom donné à la main', () => {
    expect(roomUse('Séjour')).toBe('sejour');
    expect(roomUse('Salle à manger')).toBe('sejour');
    expect(roomUse('Chambre 2')).toBe('chambre');
    expect(roomUse('Cuisine')).toBe('cuisine');
    expect(roomUse('Salle de bains')).toBe('sdb');
    expect(roomUse('WC')).toBe('wc');
    expect(roomUse('Couloir')).toBe('circulation');
    // Sans nom parlant, on retombe sur ce que le mobilier avait déduit.
    expect(roomUse('Pièce 3', 'kitchen')).toBe('cuisine');
    expect(roomUse('Pièce 3')).toBe('autre');
  });
});

describe('exigences par pièce', () => {
  it('le séjour compte un socle par tranche de 4 m², cinq au minimum', () => {
    expect(requirementFor('sejour', 12).socles).toBe(5);
    expect(requirementFor('sejour', 20).socles).toBe(5);
    expect(requirementFor('sejour', 28).socles).toBe(7);
    expect(requirementFor('sejour', 40).socles).toBe(10);
  });

  it('chambre trois socles, cuisine six dont quatre en hauteur', () => {
    expect(requirementFor('chambre', 11).socles).toBe(3);
    expect(requirementFor('chambre', 11).rj45).toBe(1);
    const cuisine = requirementFor('cuisine', 9);
    expect(cuisine.socles).toBe(6);
    expect(cuisine.surPlan).toBe(4);
    // Sous 4 m², la cuisine retombe à trois socles.
    expect(requirementFor('cuisine', 3).socles).toBe(3);
  });

  it('les WC n’exigent rien, une circulation exiguë non plus', () => {
    expect(requirementFor('wc', 2).socles).toBe(0);
    expect(requirementFor('circulation', 3).socles).toBe(0);
    expect(requirementFor('circulation', 6).socles).toBe(1);
  });
});

describe('constats', () => {
  const w2r = (rooms: RoomInput[]) => wallToRooms(rooms);

  it('signale une chambre sous-équipée, et dit combien il manque', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    const issues = checkElectrical(rooms, [fx('prise'), fx('prise')], w2r(rooms));
    const manque = issues.find((i) => i.message.includes('socle'));
    expect(manque?.severity).toBe('alerte');
    expect(manque?.message).toContain('2 socles sur 3');
    expect(manque?.message).toContain('il en manque 1');
    expect(manque?.regle).toContain('trois socles');
    expect(roomsInAlert(issues).has('r1')).toBe(true);
  });

  it('ne crie pas quand il y a BEAUCOUP de prises : ce n’est pas une faute', () => {
    // La norme ne plafonne pas les socles d'une pièce, elle plafonne les
    // points d'un circuit. Dix prises, c'est un circuit de plus, pas un
    // défaut — le constat existe, mais en information.
    const rooms = [room('r1', 'Cuisine', 12)];
    const fixtures = Array.from({ length: 10 }, () => fx('prise', 'w1', 1.1));
    const issues = checkElectrical(rooms, fixtures, w2r(rooms));
    const trop = issues.find((i) => i.message.includes('circuits'));
    expect(trop?.severity).toBe('info');
    expect(trop?.message).toContain('2 circuits');
    // Et la pièce n'est donc PAS en alerte pour cette raison. Restent deux
    // alertes qui n'ont rien à voir avec le nombre de socles : l'absence
    // de tableau, et les trois circuits spécialisés d'une cuisine — dix
    // prises 16 A n'alimentent ni le four ni le lave-vaisselle.
    expect(
      issues.filter(
        (i) =>
          i.severity === 'alerte' &&
          i.code !== 'tableau' &&
          i.code !== 'specialises',
      ),
    ).toHaveLength(0);
  });

  it('relève une hauteur de pose interdite', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    const bas = checkElectrical(rooms, [fx('inter', 'w1', 0.3)], w2r(rooms));
    const ko = bas.find((i) => i.message.includes('trop bas'));
    expect(ko?.severity).toBe('alerte');
    expect(ko?.regle).toContain('0,90 m');
    // À 1,10 m, plus rien à dire sur la hauteur.
    const ok = checkElectrical(rooms, [fx('inter', 'w1', 1.1)], w2r(rooms));
    expect(ok.some((i) => i.message.includes('trop'))).toBe(false);
  });

  it('compte les socles du plan de travail à leur hauteur', () => {
    const rooms = [room('r1', 'Cuisine', 10)];
    // Six socles, mais tous en plinthe : les quatre du plan manquent.
    const bas = Array.from({ length: 6 }, () => fx('prise', 'w1', 0.25));
    const issues = checkElectrical(rooms, bas, w2r(rooms));
    expect(issues.some((i) => i.message.includes('plan de travail'))).toBe(true);
    const hauts = [
      ...Array.from({ length: 4 }, () => fx('prise', 'w1', 1.1)),
      ...Array.from({ length: 2 }, () => fx('prise', 'w1', 0.25)),
    ];
    const ok = checkElectrical(rooms, hauts, w2r(rooms));
    expect(ok.some((i) => i.message.includes('plan de travail'))).toBe(false);
  });

  it('doute d’un socle 32 A hors cuisine', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    const issues = checkElectrical(rooms, [fx('prise32', 'w1', 0.25)], w2r(rooms));
    expect(
      issues.some((i) => i.severity === 'alerte' && i.message.includes('32 A')),
    ).toBe(true);
  });

  it('exige au moins deux prises de communication dans le logement', () => {
    const rooms = [room('r1', 'Séjour', 24), room('r2', 'Chambre', 11, ['w2'])];
    const issues = checkElectrical(rooms, [], wallToRooms(rooms));
    expect(issues.some((i) => i.message.includes('RJ45 sur 2'))).toBe(true);
  });
});

describe('circuits', () => {
  const nom = () => 'Séjour';
  const pasCuisine = () => false;

  it('huit socles par circuit, pas un de plus', () => {
    const socles = Array.from({ length: MAX_SOCLES + 1 }, () => fx('prise'));
    const circuits = planCircuits(socles, nom, pasCuisine);
    expect(circuits).toHaveLength(2);
    expect(circuits[0].points).toBe(MAX_SOCLES);
    expect(circuits[1].points).toBe(1);
    expect(circuits[0].breaker).toBe(20);
    expect(circuits[0].section).toBe(2.5);
  });

  it('la cuisine ne partage pas ses circuits', () => {
    const list = [fx('prise', 'wc1'), fx('prise', 'ws1')];
    const circuits = planCircuits(
      list,
      (f) => (f.wallId === 'wc1' ? 'Cuisine' : 'Séjour'),
      (f) => f.wallId === 'wc1',
    );
    expect(circuits).toHaveLength(2);
    expect(circuits.some((c) => c.label.includes('cuisine'))).toBe(true);
  });

  it('un circuit dédié par cuisson et par spécialisé', () => {
    const circuits = planCircuits(
      [fx('prise32'), fx('prise20'), fx('prise20')],
      nom,
      pasCuisine,
    );
    const cuisson = circuits.find((c) => c.nature === 'cuisson');
    expect(cuisson?.breaker).toBe(32);
    expect(cuisson?.section).toBe(6);
    expect(circuits.filter((c) => c.nature === 'specialise')).toHaveLength(2);
    expect(circuits.every((c) => c.points === 1)).toBe(true);
  });

  it('l’éclairage est en 1,5 mm² sous 16 A, les courants faibles hors tableau', () => {
    const circuits = planCircuits(
      [fx('applique', 'w1', 1.9), fx('rj45'), fx('tv')],
      nom,
      pasCuisine,
    );
    const lum = circuits.find((c) => c.nature === 'eclairage');
    expect(lum?.section).toBe(1.5);
    expect(lum?.breaker).toBe(16);
    const vdi = circuits.find((c) => c.nature === 'vdi');
    expect(vdi?.breaker).toBeNull();
    expect(vdi?.points).toBe(2);
  });

  it('un différentiel de type A porte la cuisson', () => {
    const circuits = planCircuits([fx('prise32'), fx('prise')], nom, pasCuisine);
    const diffs = planDifferentials(circuits);
    const typeA = diffs.find((d) => d.type === 'A');
    expect(typeA).toBeTruthy();
    expect(typeA?.circuits.some((l) => l.startsWith('Cuisson'))).toBe(true);
    // Les courants faibles ne passent pas derrière un différentiel.
    const vdi = planDifferentials(
      planCircuits([fx('rj45')], nom, pasCuisine),
    );
    expect(vdi.every((d) => d.circuits.length === 0)).toBe(true);
  });
});

describe('liste du matériel', () => {
  const rooms = [room('r1', 'Cuisine', 10, ['w1']), room('r2', 'Séjour', 24, ['w2'])];
  const fixtures = [
    ...Array.from({ length: 6 }, () => fx('prise', 'w1', 1.1)),
    fx('prise32', 'w1', 0.25),
    fx('prise20', 'w1', 1.1),
    ...Array.from({ length: 5 }, () => fx('prise', 'w2', 0.25)),
    fx('rj45', 'w2'),
  ];
  const list = materialList(rooms, fixtures, wallToRooms(rooms));

  it('compte l’appareillage pièce par pièce', () => {
    const cuisine = list.rooms.find((r) => r.room === 'Cuisine');
    expect(cuisine?.rows.find((x) => x.label === 'Prise 16 A')?.quantity).toBe(6);
    expect(cuisine?.rows.find((x) => x.label === 'Prise 32 A')?.quantity).toBe(1);
  });

  it('prévoit un disjoncteur par circuit, au bon calibre', () => {
    const d32 = list.board.find((b) => b.label === 'Disjoncteur 32 A');
    expect(d32?.quantity).toBe(1);
    const d20 = list.board.find((b) => b.label === 'Disjoncteur 20 A');
    // Prises cuisine (1) + prises séjour (1) + spécialisé (1) = trois 20 A.
    expect(d20?.quantity).toBe(3);
    expect(
      list.board.some((b) => b.label.includes('type A')),
    ).toBe(true);
    expect(
      list.board.some((b) => b.label === 'Coffret de communication'),
    ).toBe(true);
  });

  it('sort un PDF valide, avec ses sections', () => {
    const bytes = buildMaterialPdf('Appartement test', list);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.endsWith('%%EOF')).toBe(true);
    expect(s).toContain('Liste du mat');
    expect(s).toContain('Tableau ');
    expect(s).toContain('Conformit');
    expect(s).toContain('EchoPlan');
    expect(s).toContain('Disjoncteur 32 A');
  });
});

describe('rattachement des pièces', () => {
  it('un refend borde deux pièces', () => {
    const inputs = roomInputsOf(
      [
        { id: 'r1', name: 'Séjour', wallIds: ['n', 'refend'] },
        { id: 'r2', name: 'Cuisine', wallIds: ['s', 'refend'] },
      ],
      [
        { roomId: 'r1', surface: { area: 20, pts: [] }, walls: [] },
        { roomId: 'r2', surface: { area: 9, pts: [] }, walls: [] },
      ],
    );
    expect(inputs[0].area).toBe(20);
    const map = wallToRooms(inputs);
    expect(map.get('refend')).toEqual(['r1', 'r2']);
    expect(map.get('n')).toEqual(['r1']);
  });
});

describe('légende du plan exporté', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  const carre = [
    mur('n', 0, 0, 4, 0),
    mur('e', 4, 0, 4, 4),
    mur('s', 4, 4, 0, 4),
    mur('w', 0, 4, 0, 0),
  ];
  const latin1 = (bytes: Uint8Array) => {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  };

  it('ne liste que les appareils réellement posés', () => {
    const s = latin1(
      buildScanPdf(
        {
          name: 'Test',
          walls: carre,
          openings: [],
          objects: [],
          fixtures: [fx('prise', 'n'), fx('rj45', 'e')],
        },
        false,
        { metre: false },
      ),
    );
    expect(s).toContain('APPAREILLAGE');
    expect(s).toContain('Prise 16 A');
    expect(s).toContain('Prise RJ45');
    // Rien d'autre : une légende qui liste tout le catalogue n'apprend rien.
    expect(s).not.toContain('Interrupteur');
    expect(s).not.toContain('Tableau');
  });

  it('sans appareil, aucune légende', () => {
    const s = latin1(
      buildScanPdf(
        { name: 'Test', walls: carre, openings: [], objects: [], fixtures: [] },
        false,
        { metre: false },
      ),
    );
    expect(s).not.toContain('APPAREILLAGE');
  });
});

describe('ensembles multipostes', () => {
  it('comptent des SOCLES, pas des trous', () => {
    // « Un socle double compte pour un socle, un triple pour deux. »
    expect(socketsOf('prise')).toBe(1);
    expect(socketsOf('prise2')).toBe(1);
    expect(socketsOf('prise3')).toBe(2);
    // Un ensemble mixte ne compte que ses socles 16 A.
    expect(socketsOf('rjPrise')).toBe(1);
    expect(socketsOf('rjPrise2')).toBe(1);
    expect(rjOf('rjPrise2')).toBe(1);
    expect(rjOf('rj2')).toBe(2);
    expect(postsOf('inter3')).toHaveLength(3);
  });

  it('percent à l’entraxe de 71 mm', () => {
    const deux = boxOffsets('prise2');
    expect(deux).toHaveLength(2);
    expect(deux[1] - deux[0]).toBeCloseTo(ENTRAXE, 6);
    const trois = boxOffsets('inter3');
    expect(trois[2] - trois[0]).toBeCloseTo(2 * ENTRAXE, 6);
    // Les boîtes sont centrées sur la plaque.
    const large = 2 * ENTRAXE + 0.082;
    expect(trois[0] + trois[2]).toBeCloseTo(large, 6);
  });

  it('une chambre est équipée par trois prises doubles', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    const trois = [fx('prise2'), fx('prise2'), fx('prise2')];
    const issues = checkElectrical(rooms, trois, wallToRooms(rooms));
    expect(issues.some((i) => i.message.includes('socle'))).toBe(false);
  });
});

describe('un mur mitoyen ne compte que pour la pièce où l’appareil donne', () => {
  // Deux pièces de 3 × 4 séparées par un refend en x = 3.
  const mur = (id: string, ax: number, az: number, bx: number, bz: number) => ({
    id,
    type: 'wall' as const,
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  const walls = [
    mur('n1', 0, 0, 3, 0),
    mur('refend', 3, 0, 3, 4),
    mur('s1', 3, 4, 0, 4),
    mur('w1', 0, 4, 0, 0),
    mur('n2', 3, 0, 6, 0),
    mur('e2', 6, 0, 6, 4),
    mur('s2', 6, 4, 3, 4),
  ];
  const rooms = [
    { id: 'r1', name: 'Séjour', wallIds: ['n1', 'refend', 's1', 'w1'] },
    { id: 'r2', name: 'Chambre', wallIds: ['n2', 'e2', 's2', 'refend'] },
  ];
  const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
  const refend = walls.find((w) => w.id === 'refend')!;
  const cote = interiorSide(refend, walls, rooms);
  const face = wallFace(refend, wallQuadsOf(walls).get('refend'), cote);

  it('range chaque prise du côté où elle donne', () => {
    const devant = { ...fx('prise', 'refend'), along: 2, side: cote };
    const derriere = {
      ...fx('prise', 'refend'),
      along: 2,
      side: (cote > 0 ? -1 : 1) as 1 | -1,
    };
    const pose = fixturePlacement([devant, derriere], walls, inputs);
    expect(pose.get(devant.id)).toBeTruthy();
    expect(pose.get(derriere.id)).toBeTruthy();
    // Les deux ne peuvent pas être dans la même pièce : c'était le bug.
    expect(pose.get(devant.id)).not.toBe(pose.get(derriere.id));
    expect(face.len).toBeGreaterThan(3);
  });

  it('cinq prises posées de l’autre côté ne rendent pas le séjour conforme', () => {
    const autreFace = (cote > 0 ? -1 : 1) as 1 | -1;
    const triche = Array.from({ length: 5 }, (_, i) => ({
      ...fx('prise', 'refend'),
      along: 0.5 + i * 0.6,
      side: autreFace,
    }));
    const pose = fixturePlacement(triche, walls, inputs);
    const issues = checkElectrical(
      inputs,
      triche,
      wallToRooms(inputs),
      pose,
    );
    const alertes = issues.filter((i) => i.severity === 'alerte');
    // La pièce qui n'a rien reçu réclame toujours ses socles.
    expect(alertes.some((i) => i.message.includes('socle'))).toBe(true);
  });
});

/**
 * LE CARTOUCHE DIT À QUI EST LE DOSSIER.
 *
 * Il portait le nom du fichier — que le lecteur a déjà sous les yeux,
 * puisqu'il l'a ouvert. Un plan d'exécution porte le nom du client et
 * l'adresse du chantier : c'est ce qu'on cherche sur une pile de plans, et
 * ce qui distingue deux T3 identiques de la même rue.
 */
describe('le client dans le cartouche', () => {
  /** Une pièce carrée : le cartouche ne dépend pas de la géométrie. */
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
  const piece = [
    mur('n', 0, 0, 4, 0),
    mur('e', 4, 0, 4, 4),
    mur('s', 4, 4, 0, 4),
    mur('w', 0, 4, 0, 0),
  ];
  const latin1 = (bytes: Uint8Array) => {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  };
  const doc = (client?: string, address?: string) =>
    latin1(
      buildScanPdf(
        {
          name: 'Chantier',
          walls: piece,
          openings: [],
          objects: [],
          fixtures: [],
          client,
          address,
        },
        false,
        { metre: false },
      ),
    );

  it('écrit le client et le chantier quand ils sont renseignés', () => {
    const src = doc('Mme Dupont', '12 rue Pasteur');
    expect(src).toContain('CLIENT');
    expect(src).toContain('Mme Dupont');
    expect(src).toContain('12 rue Pasteur');
  });

  it('et garde le nom du fichier quand ils ne le sont pas', () => {
    const src = doc();
    expect(src).toContain('FICHIER');
    expect(src).not.toContain('CLIENT');
  });
});

/**
 * DEUX CONTRÔLES QUE PERSONNE D'AUTRE NE FAIT.
 *
 * Le premier fait recaler au Consuel, le second se voit sur le mur fini.
 * Aucun scanner de pièce ne les connaît — c'est exactement ce qui sépare
 * un relevé d'un dossier d'électricien.
 */
/** Le mur → pièces des bancs précédents, repris tel quel. */
const w2r = (rooms: RoomInput[]) => wallToRooms(rooms);

describe('les circuits spécialisés', () => {
  it('en exige trois dès qu’il y a une cuisine', () => {
    const rooms = [room('r1', 'Cuisine', 12)];
    const issues = checkElectrical(
      rooms,
      [fx('prise20', 'w1', 1.1)],
      w2r(rooms),
    );
    const manque = issues.find((i) => i.code === 'specialises');
    expect(manque?.severity).toBe('alerte');
    expect(manque?.message).toContain('1 circuit spécialisé sur 3');
    expect(manque?.regle).toContain('lave-linge');
  });

  it('compte la sortie de câble comme un circuit, et où qu’elle soit', () => {
    // Le lave-linge est souvent en salle d'eau : c'est un circuit du
    // LOGEMENT, pas de la cuisine.
    const rooms = [room('r1', 'Cuisine', 12), room('r2', 'Salle de bain', 5)];
    const fixtures = [
      fx('prise20', 'w1', 1.1),
      fx('prise20', 'w1', 1.1),
      fx('sortieCable', 'w2', 0.6),
    ];
    const issues = checkElectrical(rooms, fixtures, w2r(rooms));
    expect(issues.some((i) => i.code === 'specialises')).toBe(false);
  });

  it('se tait quand le logement n’a pas de cuisine', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    const issues = checkElectrical(rooms, [], w2r(rooms));
    expect(issues.some((i) => i.code === 'specialises')).toBe(false);
  });
});

describe('l’alignement des appareils', () => {
  it('relève deux prises presque à la même hauteur, sur le même mur', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    const fixtures = [fx('prise', 'w1', 0.25), fx('prise', 'w1', 0.28)];
    const issues = checkElectrical(rooms, fixtures, w2r(rooms));
    const ecart = issues.find((i) => i.code === 'alignement');
    // Un défaut de finition, pas une faute : on le dit sans crier.
    expect(ecart?.severity).toBe('info');
    expect(ecart?.message).toContain('25 cm et 28 cm');
    expect(ecart?.fix?.label).toContain('Aligner à 25 cm');
  });

  it('mais se tait quand c’est aligné, ou franchement différent', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    // Aligné au millimètre.
    expect(
      checkElectrical(
        rooms,
        [fx('prise', 'w1', 0.25), fx('prise', 'w1', 0.25)],
        w2r(rooms),
      ).some((i) => i.code === 'alignement'),
    ).toBe(false);
    // Une prise en plinthe et un interrupteur à hauteur de main : voulu.
    expect(
      checkElectrical(
        rooms,
        [fx('prise', 'w1', 0.25), fx('inter', 'w1', 1.1)],
        w2r(rooms),
      ).some((i) => i.code === 'alignement'),
    ).toBe(false);
    // Deux prises à 25 et 90 : deux usages différents, pas un défaut.
    expect(
      checkElectrical(
        rooms,
        [fx('prise', 'w1', 0.25), fx('prise', 'w1', 0.9)],
        w2r(rooms),
      ).some((i) => i.code === 'alignement'),
    ).toBe(false);
  });

  it('et ne compare pas deux murs différents', () => {
    const rooms = [room('r1', 'Chambre', 11)];
    const issues = checkElectrical(
      rooms,
      [fx('prise', 'w1', 0.25), fx('prise', 'w2', 0.28)],
      w2r(rooms),
    );
    expect(issues.some((i) => i.code === 'alignement')).toBe(false);
  });
});
