/**
 * LES ÉTAGES.
 *
 * Relevé du chantier : une maison, c'est un rez-de-chaussée ET un étage.
 * Jusqu'ici l'application ne connaissait qu'un seul plan à plat : scanner
 * une maison, c'était ouvrir DEUX dossiers, sortir deux PDF, faire deux
 * devis — et personne ne voyait que c'était le même logement. Le concurrent
 * qu'on regarde (magicplan) gère les niveaux depuis toujours ; sans eux on
 * perd toutes les maisons individuelles, qui sont le gros du marché.
 *
 * LE MODÈLE : le niveau est porté par ce qui existe déjà — le mur et la
 * pièce. Tout le reste en HÉRITE : l'appareillage tient à un mur, le meuble
 * à une pièce, la photo à un mur. Aucun élément ne peut donc se retrouver à
 * un étage où son support n'est pas, ce qu'une liste parallèle de niveaux
 * aurait rendu possible au premier bug.
 *
 * Et l'absence vaut REZ-DE-CHAUSSÉE : tous les scans d'avant les étages
 * s'ouvrent au niveau 0, sans migration ni écriture.
 */
import {
  NIVEAU_RDC,
  deplacerNiveau,
  niveauDe,
  abregerNiveau,
  filtrerAuNiveau,
  niveauxPresents,
  nomDuNiveau,
  type WallSeg,
} from '../src/geometry/floorplan';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  niveau?: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  ...(niveau === undefined ? null : { niveau }),
});

describe('nommer un niveau comme sur un chantier', () => {
  it('dit les étages en français, pas en numéros', () => {
    // « Niveau 0 » ne veut rien dire pour un client. « Rez-de-chaussée »,
    // si — et c'est ce qui s'imprime en tête du plan.
    expect(nomDuNiveau(0)).toBe('Rez-de-chaussée');
    expect(nomDuNiveau(1)).toBe('1er étage');
    expect(nomDuNiveau(2)).toBe('2e étage');
    expect(nomDuNiveau(3)).toBe('3e étage');
  });

  it('descend aussi : sous-sol et caves', () => {
    expect(nomDuNiveau(-1)).toBe('Sous-sol');
    expect(nomDuNiveau(-2)).toBe('Sous-sol -2');
  });
});

describe('à quel niveau vit un mur', () => {
  it('sans mention, c’est le rez-de-chaussée', () => {
    // Tous les scans faits avant les étages : ils s'ouvrent au RDC, sans
    // qu'on ait à réécrire une seule sauvegarde.
    expect(niveauDe(mur('m', 0, 0, 4, 0))).toBe(NIVEAU_RDC);
    expect(NIVEAU_RDC).toBe(0);
  });

  it('sinon, celui qu’il porte', () => {
    expect(niveauDe(mur('m', 0, 0, 4, 0, 1))).toBe(1);
    expect(niveauDe(mur('m', 0, 0, 4, 0, -1))).toBe(-1);
  });
});

describe('les niveaux d’un dossier', () => {
  it('les liste du haut vers le bas, comme un ascenseur', () => {
    // L'étage se choisit dans une colonne : le haut du bâtiment en haut de
    // la liste, sinon le geste contredit ce qu'on regarde.
    const walls = [
      mur('a', 0, 0, 4, 0),
      mur('b', 0, 0, 4, 0, 1),
      mur('c', 0, 0, 4, 0, -1),
      mur('d', 0, 0, 4, 0, 1),
    ];
    expect(niveauxPresents(walls)).toEqual([1, 0, -1]);
  });

  it('un plan vide a quand même son rez-de-chaussée', () => {
    // Sinon le sélecteur d'étage n'aurait rien à montrer au premier scan,
    // et l'écran se viderait de son repère.
    expect(niveauxPresents([])).toEqual([0]);
  });
});

describe('recaler un étage sur celui du dessous', () => {
  it('déplace TOUT le niveau, et lui seul', () => {
    /*
      DEUX SCANS NE SE SUPERPOSENT JAMAIS TOUT SEULS.

      Le rez-de-chaussée et l'étage sont deux relevés indépendants : ARKit
      repart de l'endroit où l'on a appuyé sur « Scanner », jamais du même
      coin de mur. Superposés bruts, les deux plans se croisent n'importe
      comment.

      On donne donc la prise : glisser l'étage entier au-dessus du plan du
      dessous, affiché en filigrane, jusqu'à ce que la cage d'escalier
      tombe juste. Le rez-de-chaussée, lui, ne bouge pas d'un millimètre.
    */
    const walls = [
      mur('rdc', 0, 0, 4, 0),
      mur('e1', 0, 0, 4, 0, 1),
    ];
    const apres = deplacerNiveau(walls, 1, 1.5, -0.5);
    const bas = apres.find((w) => w.id === 'rdc')!;
    const haut = apres.find((w) => w.id === 'e1')!;
    expect(bas.a).toEqual({ x: 0, z: 0 });
    expect(haut.a).toEqual({ x: 1.5, z: -0.5 });
    expect(haut.b).toEqual({ x: 5.5, z: -0.5 });
    expect(haut.niveau).toBe(1);
  });

  it('ne touche à rien quand le déplacement est nul', () => {
    const walls = [mur('e1', 0, 0, 4, 0, 1)];
    expect(deplacerNiveau(walls, 1, 0, 0)).toBe(walls);
  });
});

describe('ce que montre un etage', () => {
  const walls = [
    mur('bas', 0, 0, 4, 0),
    mur('haut', 0, 0, 4, 0, 1),
  ];
  const rooms = [
    { id: 'r0', name: 'Sejour', wallIds: ['bas'] },
    { id: 'r1', name: 'Chambre', wallIds: ['haut'], niveau: 1 },
  ];
  const jeu = {
    walls,
    openings: [mur('porte-haut', 1, 0, 2, 0, 1)],
    rooms,
    // L'appareillage tient a un mur, la photo aussi : ils suivent leur mur.
    fixtures: [
      { id: 'f0', wallId: 'bas' },
      { id: 'f1', wallId: 'haut' },
    ],
    photos: [{ id: 'p1', wallId: 'haut' }],
    // Le meuble et le plafonnier tiennent a une piece.
    objects: [{ id: 'o1', roomId: 'r1' }],
    ceiling: [{ id: 'c0', roomId: 'r0' }],
  };

  it('ne garde que ce qui vit a cet etage, support compris', () => {
    const haut = filtrerAuNiveau(jeu, 1);
    expect(haut.walls.map((w) => w.id)).toEqual(['haut']);
    expect(haut.openings.map((o) => o.id)).toEqual(['porte-haut']);
    expect(haut.rooms.map((r) => r.id)).toEqual(['r1']);
    expect(haut.fixtures.map((f) => f.id)).toEqual(['f1']);
    expect(haut.photos.map((p) => p.id)).toEqual(['p1']);
    expect(haut.objects.map((o) => o.id)).toEqual(['o1']);
    expect(haut.ceiling).toEqual([]);
  });

  it('le rez-de-chaussee garde ce qui ne dit rien', () => {
    // Tous les scans d'avant les etages : aucun element ne porte de niveau,
    // et tout doit rester visible.
    const bas = filtrerAuNiveau(jeu, 0);
    expect(bas.walls.map((w) => w.id)).toEqual(['bas']);
    expect(bas.fixtures.map((f) => f.id)).toEqual(['f0']);
    expect(bas.ceiling.map((c) => c.id)).toEqual(['c0']);
    expect(bas.objects).toEqual([]);
  });

  it('un appareil dont le mur a disparu ne se perd pas au rez-de-chaussee', () => {
    /*
      Un mur supprime emporte son appareillage, mais une sauvegarde bancale
      peut garder un renvoi mort. Sans regle, il serait invisible a TOUS les
      etages — donc introuvable, jamais efface, et compte dans le metre.
      L'orphelin se montre au rez-de-chaussee, ou l'on peut le voir et
      le retirer.
    */
    const orphelin = { ...jeu, fixtures: [{ id: 'fx', wallId: 'disparu' }] };
    expect(filtrerAuNiveau(orphelin, 0).fixtures.map((f) => f.id)).toEqual(['fx']);
    expect(filtrerAuNiveau(orphelin, 1).fixtures).toEqual([]);
  });
});

describe('le nom court, celui de la pastille', () => {
  it('tient en trois caracteres', () => {
    // La pastille du plan est large comme « 2D » : « Rez-de-chaussee » n'y
    // entre pas. Les plans de batiment ecrivent R+1, R+2 — on fait pareil.
    expect(abregerNiveau(0)).toBe('RDC');
    expect(abregerNiveau(1)).toBe('R+1');
    expect(abregerNiveau(2)).toBe('R+2');
    expect(abregerNiveau(-1)).toBe('SS');
    expect(abregerNiveau(-2)).toBe('SS2');
  });
});
