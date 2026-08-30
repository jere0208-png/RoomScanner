/**
 * LE PLAN NE REDÉCOUPE PAS LES PIÈCES QUE LE GESTE NE TOUCHE PAS.
 *
 * `roomParts` est LE point d'entrée du rendu multi-pièces — plan 2D, vue 3D
 * et PDF itèrent dessus. Pour chaque pièce il rebâtit contour, surface et
 * pole du cartouche : ce dernier est une recherche sur grille (169 essais
 * puis descente), et la mesure l'a chiffrée à ~5 ms pour un T4 — sur un
 * ordinateur de bureau. Or un mur qu'on fait GLISSER rejoue tout ça à
 * chaque image : sur un téléphone, ce seul calcul mange le budget d'une
 * image, pour des pièces dont AUCUN mur n'a bougé.
 *
 * Chaque pièce garde donc son découpage tant que ses murs sont LES MÊMES
 * OBJETS — le magasin ne retouche jamais un mur en place, il le remplace.
 * Pendant le glissement d'un mur, seule sa pièce (ou ses deux pièces, pour
 * un refend) se recalcule. La mesure, même scène : 4,7 ms → moins de 1.
 *
 * ET C'EST AUSSI UNE PROMESSE DE STABILITÉ : une pièce non touchée rend
 * exactement le même objet, ce que tout mémo en aval peut comparer par
 * référence.
 */
import { roomParts, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Deux pièces mitoyennes : le refend `m` appartient aux deux. */
const MURS = [
  mur('a1', 0, 0, 4, 0),
  mur('m', 4, 0, 4, 3),
  mur('a2', 4, 3, 0, 3),
  mur('a3', 0, 3, 0, 0),
  mur('b1', 4, 0, 8, 0),
  mur('b2', 8, 0, 8, 3),
  mur('b3', 8, 3, 4, 3),
];
const PIECES = [
  { id: 'salon', wallIds: ['a1', 'm', 'a2', 'a3'] },
  { id: 'cuisine', wallIds: ['b1', 'b2', 'b3', 'm'] },
];

it('rend le MÊME objet pour une pièce dont aucun mur n’a bougé', () => {
  const avant = roomParts(MURS, PIECES);
  /*
    Le geste : le fond de la cuisine glisse de vingt centimètres — le mur
    `b2` ET les bouts de ses voisins, comme le magasin le fait vraiment. Le
    salon, lui, n'est pas touché : aucun de ses quatre murs ne change.
  */
  const bouges = MURS.map((w) => {
    if (w.id === 'b2') return { ...w, a: { x: 8.2, z: 0 }, b: { x: 8.2, z: 3 } };
    if (w.id === 'b1') return { ...w, b: { x: 8.2, z: 0 } };
    if (w.id === 'b3') return { ...w, a: { x: 8.2, z: 3 } };
    return w;
  });
  const apres = roomParts(bouges, PIECES);
  expect(apres[0]).toBe(avant[0]);
  expect(apres[1]).not.toBe(avant[1]);
  // Et le recalcul est JUSTE : la cuisine s'est élargie de vingt centimètres.
  expect(apres[1].surface!.area).toBeCloseTo(4.2 * 3, 5);
});

it('un refend déplacé recalcule SES DEUX pièces', () => {
  const avant = roomParts(MURS, PIECES);
  const bouges = MURS.map((w) =>
    w.id === 'm' ? { ...w, a: { x: 4.5, z: 0 }, b: { x: 4.5, z: 3 } } : w,
  );
  const apres = roomParts(bouges, PIECES);
  expect(apres[0]).not.toBe(avant[0]);
  expect(apres[1]).not.toBe(avant[1]);
});

it('un mur retiré de la liste ne passe pas entre les mailles', () => {
  /*
    LE PIÈGE D'UN CACHE PAR RÉFÉRENCES : comparer « chaque mur retrouvé est
    le même » laisse passer un mur DISPARU. La comparaison tient les deux
    sens — même compte, mêmes objets.
  */
  const avant = roomParts(MURS, PIECES);
  const ampute = PIECES.map((r) =>
    r.id === 'salon' ? { ...r, wallIds: ['a1', 'm', 'a2'] } : r,
  );
  const apres = roomParts(MURS, ampute);
  expect(apres[0]).not.toBe(avant[0]);
  expect(apres[0].walls).toHaveLength(3);
});

it('deux scènes différentes ne se partagent rien', () => {
  // Le même identifiant de pièce peut exister dans deux dossiers (les
  // anciens scans numérotaient « room-1 »). La clé du cache est l'ENTRÉE de
  // pièce elle-même, pas son nom : aucun télescopage possible.
  const autresMurs = [
    mur('a1', 0, 0, 6, 0),
    mur('m', 6, 0, 6, 3),
    mur('a2', 6, 3, 0, 3),
    mur('a3', 0, 3, 0, 0),
  ];
  const autresPieces = [{ id: 'salon', wallIds: ['a1', 'm', 'a2', 'a3'] }];
  const grand = roomParts(autresMurs, autresPieces);
  expect(grand[0].surface!.area).toBeCloseTo(18, 5);
  const petit = roomParts(MURS, PIECES);
  expect(petit[0].surface!.area).toBeCloseTo(12, 5);
});
