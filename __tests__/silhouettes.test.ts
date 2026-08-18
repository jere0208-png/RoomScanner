/**
 * LES PIÈCES D'UN MEUBLE NE SE TRAVERSENT PAS.
 *
 * Relevé du chantier, capture à l'appui : « le support arrière du canapé prend
 * le dessus sur le coussin droit ». J'ai d'abord cherché dans le tri — c'était
 * ailleurs, et c'est instructif : le dossier occupe la profondeur 0,84 à 1, le
 * coussin 0,12 à 0,86. Ils SE TRAVERSENT de deux centimètres.
 *
 * Or deux volumes qui s'interpénètrent ne peuvent être ordonnés par aucun tri
 * du peintre : à l'endroit où ils se croisent, chacun est devant l'autre. Le
 * défaut n'est donc pas dans le classement mais dans le catalogue — et aucun
 * réglage de tri ne l'aurait jamais corrigé.
 *
 * Ce banc lit tout le catalogue et refuse la moindre interpénétration. Deux
 * pièces peuvent se toucher (une assise POSÉE sur un socle) ; elles ne peuvent
 * pas se chevaucher dans les trois axes à la fois.
 */
import { furnitureParts } from '../src/geometry/furniture3d';

/** Les catégories que RoomPlan sait rendre, plus les nôtres. */
const CATEGORIES = [
  'bed',
  'sofa',
  'chair',
  'table',
  'television',
  'refrigerator',
  'stove',
  'dishwasher',
  'sink',
  'toilet',
  'bathtub',
  'shower',
  'storage',
  'stairs',
  'fireplace',
  'plant',
];

/** Le recouvrement de deux intervalles, négatif s'ils sont disjoints. */
const croise = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0);

describe('le catalogue des silhouettes', () => {
  it.each(CATEGORIES)('%s : aucune pièce n’en traverse une autre', (cat) => {
    const parts = furnitureParts(cat);
    const fautes: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i];
        const b = parts[j];
        const dx = croise(a.x0, a.x1, b.x0, b.x1);
        const dy = croise(a.y0, a.y1, b.y0, b.y1);
        const dz = croise(a.z0, a.z1, b.z0, b.z1);
        // Un pour cent de l'emprise : en deçà, les deux pièces se TOUCHENT,
        // ce qui est le contraire d'un défaut — un coussin posé sur un socle
        // doit le toucher.
        if (dx > 0.01 && dy > 0.01 && dz > 0.01) {
          fautes.push(
            `${i}×${j} (${dx.toFixed(2)} × ${dy.toFixed(2)} × ${dz.toFixed(2)})`,
          );
        }
      }
    }
    expect(`${fautes.length} traversée(s)${fautes.length ? ' — ' + fautes.join(', ') : ''}`).toBe(
      '0 traversée(s)',
    );
  });

  it('donne quand même une vraie silhouette aux meubles courants', () => {
    // Le remède ne doit pas consister à vider le catalogue : un lit garde ses
    // cinq pièces, un canapé les siennes.
    for (const [cat, mini] of [
      ['bed', 4],
      ['sofa', 5],
      ['storage', 3],
      ['stairs', 6],
    ] as const) {
      expect(`${cat}: ${furnitureParts(cat).length >= mini}`).toBe(`${cat}: true`);
    }
  });
});
