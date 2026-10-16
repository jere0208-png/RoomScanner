/**
 * LA COTE ÉVITE LES MEUBLES ET LES MENUISERIES — revue des six testeurs
 * (capture clair-11) : « 3,60 m » en travers du canapé, « 2,93 m » sur les
 * WC, « 4,93 m » sur le trait des fenêtres, « 0,53 m » flottant au milieu
 * d'une cloison.
 *
 * L'arbitre (`placerEtiquettes`) ne connaissait que les étiquettes. Il
 * reçoit maintenant aussi ce qui ENCOMBRE le plan sans être une étiquette,
 * et une place DÉCALÉE porte son trait d'attache.
 */
import {
  boiteDePoints,
  PETITE_COTE,
  petiteCoteLisible,
  placerEtiquettes,
  type EtiquetteMobile,
} from '../src/geometry/cotes';

const cote = (id: string, places: EtiquetteMobile['places'], poids = 1): EtiquetteMobile => ({
  id,
  places,
  taille: { w: 30, h: 10 },
  poids,
});

describe('placerEtiquettes et les encombrants', () => {
  it('une cote ne se pose plus sur un meuble : elle prend la place suivante', () => {
    const canape = { x: 80, y: 80, w: 60, h: 40 };
    const poses = placerEtiquettes(
      [cote('w:refend', [{ x: 100, y: 100 }, { x: 100, y: 160 }])],
      [],
      3,
      [canape],
    );
    expect(poses.get('w:refend')).toEqual({ x: 100, y: 160 });
  });

  it('sans encombrant, elle garde sa première place (rien ne change)', () => {
    const poses = placerEtiquettes([cote('w:refend', [{ x: 100, y: 100 }, { x: 100, y: 160 }])]);
    expect(poses.get('w:refend')).toEqual({ x: 100, y: 100 });
  });

  it('une place décalée rend son point d’attache avec elle', () => {
    const fenetre = { x: 50, y: 95, w: 100, h: 10 };
    const decalee = { x: 100, y: 80, attache: { x: 100, y: 96 } };
    const poses = placerEtiquettes([cote('w:nord', [{ x: 100, y: 100 }, decalee])], [], 3, [fenetre]);
    expect(poses.get('w:nord')).toEqual(decalee);
  });

  it('et elle renonce si tout est pris — un chiffre illisible est pire qu’absent', () => {
    const tout = { x: 0, y: 0, w: 400, h: 400 };
    const poses = placerEtiquettes([cote('w:x', [{ x: 100, y: 100 }])], [], 3, [tout]);
    expect(poses.has('w:x')).toBe(false);
  });

  it('les encombrants ne se disputent pas entre eux : deux meubles qui se touchent ne retirent rien', () => {
    const a = { x: 0, y: 0, w: 50, h: 50 };
    const b = { x: 40, y: 0, w: 50, h: 50 };
    const poses = placerEtiquettes([cote('w:y', [{ x: 200, y: 200 }])], [], 3, [a, b]);
    expect(poses.get('w:y')).toEqual({ x: 200, y: 200 });
  });
});

describe('boiteDePoints', () => {
  it('enveloppe un meuble tourné', () => {
    expect(boiteDePoints([{ x: 10, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 10 }])).toEqual({
      x: 0,
      y: 0,
      w: 20,
      h: 20,
    });
  });
});

describe('les très petites cotes', () => {
  it('le seuil est de soixante centimètres', () => {
    expect(PETITE_COTE).toBe(0.6);
  });

  it('une cote de 0,53 m ne s’écrit que si elle tient contre ce qu’elle mesure', () => {
    // 0,53 m à 45 px/m : vingt-quatre pixels de mur pour un « 0,53 m » de 33.
    expect(petiteCoteLisible(0.53, 24, 33)).toBe(false);
    // Zoomé, le mur est plus long que son chiffre : elle s'écrit.
    expect(petiteCoteLisible(0.53, 60, 33)).toBe(true);
  });

  it('une cote ordinaire n’est pas concernée', () => {
    expect(petiteCoteLisible(1.8, 10, 33)).toBe(true);
  });
});
